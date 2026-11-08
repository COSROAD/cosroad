/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드58 보정2 — **로그아웃 뒤 다른 업체로 들어올 때 기준본이 남는** 문제.
   왜 생기나(코드 확인):
     · 서버 업체는 `orgIdFromUrlOrDefault()` → `?org=` 가 없으면 **`window._userOrgId`** 다
       → 같은 탭에서 **계정만 바꿔도 업체가 바뀐다**(새로고침 없음).
     · 로컬 키 꼬리는 `curOrgId()` → **`?org=` 만** 본다 → `?org=` 없는 평소에는
       두 계정이 **같은 로컬 칸**(`__cosroad_default`)을 쓴다.
     · `csQueueReset()`(로그아웃이 부른다)은 **저장 줄만** 비우고 기준본은 안 비운다.
   → 그래서 앞 업체의 기준본(`_csBase`)과 **아직 안 올린 로컬 변경**이 남아 있으면,
     다음 업체 동기화에서 **그 변경이 새 업체 서버값 위에 얹힌다.**
   ★ 차량 id 는 업체 사이에 **실제로 겹친다** — 새 업체 기본 차량이 `car1`~`car5` 다(loadCars).
     «회원» id 도 1부터 센다 → **남의 업체 «회원» 1 번에 얹힐 수 있다.**
   실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const OLD_REF = process.env.COS_SRC_OLD_REF || '5009a66';   /* v285 — 고치기 전 */
if (!('COS_SRC_NEW_REF' in process.env)) process.env.COS_SRC_NEW_REF = '';
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 42)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
/* 두 업체가 **같은 id** 를 쓴다 — 실제로 그렇다(기본 차량 car1 · «회원» id 1부터) */
const MEM_A = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: 'A1', lat: 37.41, lon: 126.68, phone: '010-1' }];
const MEM_B = [{ id: 1, name: '나래비', carId: 'car1', courseId: 'c1', days: D7, location: 'B1', lat: 37.51, lon: 126.78, phone: '010-9' }];
const CARS = [{ id: 'car1', name: '1호차', driver: '', phone: '', plate: '' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const SUF = '__cosroad_default';   /* ?org= 가 없으면 두 업체가 **같은 칸**을 쓴다 */

function emptyCar(o) {
  return Object.assign({ ride: {}, rideOff: {}, carlog: { records: [], plans: {} },
                         delivDone: {}, dropDone: {}, att: {} }, o || {});
}
/* 업체별로 **갈라 두는** 가짜 서버 (doc(db,'orgs',<org>,<col>,<key>) 의 org 를 본다) */
function makeServer(init) {
  return { byOrg: JSON.parse(JSON.stringify(init || {})), writes: [], listeners: [] };
}

function phone(SRV, opt) {
  opt = opt || {};
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(opt.members || MEM_A);
  store['tkd_cars' + SUF]    = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify(COURSES);
  store['tkd_org' + SUF]     = JSON.stringify({ name: '가온', icon: '🚐', bizType: 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  if (opt.ride) store['tkd_ridestate' + SUF] = JSON.stringify(opt.ride);
  const R = E.build({ src: opt.src || E.SRC_NEW, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-screen', 'admin-screen', 'fb-loading', 'member-screen',
   'member-list', 'main-header', 'today-date', 'org-name-display', 'org-icon', 'login-screen',
   'main-app', 'bottom-action', 'mode-badge', 'header-btns', 'filter-chips', 'search-input',
   'day-tabs', 'member-add-area', 'drive-tabs']
   .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });
  const bag = (org, col) => {
    SRV.byOrg[org] = SRV.byOrg[org] || {};
    SRV.byOrg[org][col] = SRV.byOrg[org][col] || {};
    return SRV.byOrg[org][col];
  };
  const fire = (org, col, onlyKey) => {
    SRV.listeners.filter((l) => l.org === org && l.col === col).forEach((l) => {
      if (onlyKey !== undefined && l.key !== undefined && l.key !== onlyKey) return;
      try {
        if (l.key !== undefined) {
          const v = bag(org, col)[l.key];
          l.cb({ exists: () => v !== undefined, data: () => ({ value: JSON.stringify(v) }) });
        } else {
          const src = bag(org, col);
          l.cb({ forEach: (f) => Object.keys(src).forEach((k) =>
            f({ id: k, data: () => ({ value: JSON.stringify(src[k]) }) })) });
        }
      } catch (e) {}
    });
  };
  R.sandbox._firestore = R.win._firestore = {
    doc: (db, c1, org, col, k) => ({ org: org, col: col, key: k }),
    collection: (db, c1, org, col) => ({ org: org, col: col }),
    getDoc: async (ref) => {
      const src = bag(ref.org, ref.col);
      const has = Object.prototype.hasOwnProperty.call(src, ref.key);
      return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
    },
    getDocs: async (ref) => {
      const src = bag(ref.org, ref.col);
      return { forEach: (cb) => Object.keys(src).forEach((k) =>
        cb({ id: k, data: () => ({ value: JSON.stringify(src[k]) }) })) };
    },
    setDoc: async (ref, d) => {
      SRV.writes.push('set ' + ref.org + '/' + ref.col + '/' + ref.key);
      bag(ref.org, ref.col)[ref.key] = d.value !== undefined ? JSON.parse(d.value) : d;
      fire(ref.org, ref.col, ref.key);
    },
    deleteDoc: async () => {},
    runTransaction: async (db, fn) => await fn({
      get: async (ref) => {
        const src = bag(ref.org, ref.col);
        const has = Object.prototype.hasOwnProperty.call(src, ref.key);
        return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
      },
      set: (ref, d) => {
        SRV.writes.push('tx ' + ref.org + '/' + ref.col + '/' + ref.key);
        bag(ref.org, ref.col)[ref.key] = JSON.parse(d.value);
        fire(ref.org, ref.col, ref.key);
      }
    }),
    onSnapshot: (ref, cb) => { SRV.listeners.push({ org: ref.org, col: ref.col, key: ref.key, cb: cb }); return () => {}; }
  };
  R.sandbox._db = R.win._db = {};
  R.ev("currentMode='admin';");
  R.ev("window.__al=[]; alert=function(m){ window.__al.push(String(m)); };");
  R.ev("window._userUid='uA'; window._userPaidUntil=Date.now()+30*86400000; window._userBizType='academy';");
  return { R, SRV };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 장면: A 업체 관리자가 **안 올린 변경**을 남긴 채 나가고, B 업체 관리자가 같은 탭에서 들어온다 */
async function crossOrg(src) {
  const SRV = makeServer({
    A: { carState: { car1: emptyCar({ ride: { '1': { on: true } } }) },
         data: { members: MEM_A, cars: CARS, courses: COURSES, migration: { carState: true } } },
    B: { carState: { car1: emptyCar({ ride: { '1': { on: true } } }) },
         data: { members: MEM_B, cars: CARS, courses: COURSES, migration: { carState: true } } }
  });
  const p = phone(SRV, { src, members: MEM_A, ride: { '1': { on: true } } });
  /* ① A 업체로 들어온다 */
  p.R.ev("window._userOrgId='A';");
  p.R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  await p.R.ev('syncFromFirebase()');
  await wait(350);
  const baseA = p.R.ev("JSON.stringify((_csBase['car1']||{}).ride||{})");
  /* ② A 관리자가 «회원»1 탑승을 껐지만 **그 저장은 올라가지 못했다**
     (동기화 중이라 줄에 섰다가 로그아웃이 줄을 비운 상황 — 보정1 D 에서 본 그 길) */
  p.R.ev("(function(){var st=loadRideState(); st['1']={on:false};"
       + " localStorage.setItem('tkd_ridestate', JSON.stringify(st));})()");
  /* ③ 로그아웃이 하는 일 — 줄 비우기 */
  p.R.ev('try{ csQueueReset(); }catch(e){}');
  const baseAfterLogout = p.R.ev("JSON.stringify((_csBase['car1']||{}).ride||{})");
  /* ④ B 업체 관리자가 같은 탭에서 들어온다 (?org= 가 없으니 로컬 칸은 같다) */
  p.R.ev("window._userOrgId='B'; window._userUid='uB';");
  await p.R.ev('syncFromFirebase()');
  await wait(400);
  const localAfter = p.R.ev("JSON.stringify(loadRideState()['1']||null)");
  /* ⑤ B 관리자가 아무 저장을 한 번 한다(«회원» 주소 고침 등) */
  p.R.ev("(function(){ try{ saveMembers(members); }catch(e){} })()");
  await p.R.ev('saveCarState()');
  await wait(400);
  return {
    A기준본: baseA,
    로그아웃뒤기준본: baseAfterLogout,
    B로컬: localAfter,
    B서버: JSON.stringify((((SRV.byOrg.B || {}).carState || {}).car1 || {}).ride || {}),
    A서버: JSON.stringify((((SRV.byOrg.A || {}).carState || {}).car1 || {}).ride || {})
  };
}

(async () => {
  console.log('════ 대조 — 고치기 전(v285 · ' + OLD_REF + ')');
  {
    const o = await crossOrg(OLD_SRC);
    ck('[옛] A 업체 기준본이 잡혔다', o.A기준본, '{"1":{"on":true}}');
    ck('[옛] **로그아웃 뒤에도 기준본이 남는다**', o.로그아웃뒤기준본, '{"1":{"on":true}}');
    ck('[옛] B 로컬에 **A 의 안 올린 변경이 얹혔다**', o.B로컬, '{"on":false}');
    ck('[옛] 그래서 **B 서버까지 바뀐다**', o.B서버, '{"1":{"on":false}}');
    ck('[옛]   (A 서버는 그대로)', o.A서버, '{"1":{"on":true}}');
  }

  console.log('\n════ 고친 판 — 로그아웃이 기준본도 비운다');
  {
    const n = await crossOrg(E.SRC_NEW);
    ck('★ 로그아웃 뒤 기준본이 **비워진다**', n.로그아웃뒤기준본, '{}');
    ck('★ B 로컬은 **서버 값**이다', n.B로컬, '{"on":true}');
    ck('★ B 서버도 그대로', n.B서버, '{"1":{"on":true}}');
    ck('★ A 서버도 그대로', n.A서버, '{"1":{"on":true}}');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  process.exit(fail ? 1 : 0);
})();
