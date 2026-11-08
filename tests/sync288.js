/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드59-B2 — **첫 동기화가 끝나기 전에는 서버로 쓰지 않는다**(v288).
   ① 고치기 전: 로그인 직후(동기화 전) 저장하면 **앞 업체 자료가 새 업체 문서로** 간다
   ② 고친 뒤: 막히고 안내가 뜨며, **첫 동기화가 끝난 뒤 그때 값으로** 한 번 쓴다
   ③ 동기화가 **스스로 쓰는 길**(옛 자료 옮기기 등)은 막히지 않는다
   ④ 동기화가 실패하면 **막아 둔 채** 다시 시도하고, 그래도 안 되면 한 번 안내한다
   실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const OLD_REF = process.env.COS_SRC_OLD_REF || '71a4e68';   /* v287 — 고치기 전 */
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
const MEM_A = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: 'A주소', lat: 37.41, lon: 126.68, phone: '010-1' }];
const MEM_B = [{ id: 1, name: '나래비', carId: 'car1', courseId: 'c1', days: D7, location: 'B주소', lat: 37.51, lon: 126.78, phone: '010-9' }];
const CARS = [{ id: 'car1', name: '1호차', driver: '', phone: '', plate: '' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const SUF = '__cosroad_default';

function emptyCar(o) {
  return Object.assign({ ride: {}, rideOff: {}, carlog: { records: [], plans: {} },
                         delivDone: {}, dropDone: {}, att: {} }, o || {});
}
function makeServer(init) { return { byOrg: JSON.parse(JSON.stringify(init || {})), writes: [], listeners: [] }; }

const SERVER = {
  A: { carState: { car1: emptyCar({ ride: { '1': { on: false } } }) },
       data: { members: MEM_A, cars: CARS, courses: COURSES, migration: { carState: true },
               org: { name: 'A학원', icon: '🅰', bizType: 'academy' } } },
  B: { carState: { car1: emptyCar({ ride: { '1': { on: true } } }) },
       data: { members: MEM_B, cars: CARS, courses: COURSES, migration: { carState: true },
               org: { name: 'B학원', icon: '🅱', bizType: 'academy' } } }
};

function phone(SRV, opt) {
  opt = opt || {};
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(MEM_A);       /* 폰에는 **앞 업체(A)** 자료 */
  store['tkd_cars' + SUF]    = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify(COURSES);
  store['tkd_org' + SUF]     = JSON.stringify({ name: 'A학원', icon: '🅰', bizType: 'academy',
    destName: 'A학원', destLat: 37.44, destLon: 126.65 });
  store['tkd_ridestate' + SUF] = JSON.stringify({ '1': { on: false } });
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
  R.sandbox._firestore = R.win._firestore = {
    doc: (db, c1, org, col, k) => ({ org: org, col: col, key: k }),
    collection: (db, c1, org, col) => ({ org: org, col: col }),
    getDoc: async (ref) => {
      if (SRV.failRead) { const e = new Error('읽기 실패(일부러)'); throw e; }
      const src = bag(ref.org, ref.col);
      const has = Object.prototype.hasOwnProperty.call(src, ref.key);
      return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
    },
    getDocs: async (ref) => {
      if (SRV.failRead) throw new Error('읽기 실패(일부러)');
      const src = bag(ref.org, ref.col);
      return { forEach: (cb) => Object.keys(src).forEach((k) =>
        cb({ id: k, data: () => ({ value: JSON.stringify(src[k]) }) })) };
    },
    setDoc: async (ref, d) => {
      SRV.writes.push('set ' + ref.org + '/' + ref.col + '/' + ref.key);
      bag(ref.org, ref.col)[ref.key] = d.value !== undefined ? JSON.parse(d.value) : d;
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
      }
    }),
    onSnapshot: (ref, cb) => { SRV.listeners.push({ org: ref.org, col: ref.col, key: ref.key }); return () => {}; }
  };
  R.sandbox._db = R.win._db = {};
  R.ev("currentMode='admin';");
  R.ev("window.__toast=[]; showToast=function(m){ window.__toast.push(String(m)); };");
  R.ev("window.__al=[]; alert=function(m){ window.__al.push(String(m)); };");
  R.ev("window._userUid='uB'; window._userPaidUntil=Date.now()+30*86400000; window._userBizType='academy';");
  R.ev("window._userOrgId='B';");        /* **새 업체 B** 로 들어왔다 */
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return { R, SRV };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 장면: B 로 들어온 **직후**(첫 동기화 전) 사람이 토글·명단 저장을 한다 */
async function beforeFirstSync(src) {
  const SRV = makeServer(SERVER);
  const p = phone(SRV, { src });
  /* 동기화를 **아직 안 돌렸다** — 화면은 A 자료다 */
  p.R.ev("(function(){var st=loadRideState(); st['1']={on:true};"
       + " localStorage.setItem('tkd_ridestate', JSON.stringify(st));})()");
  const ok = await p.R.ev('saveCarState()');
  await p.R.ev("(function(){ try{ saveMembers(members); }catch(e){} })()");
  await wait(400);
  return {
    돌려준값: String(ok),
    토스트: Number(p.R.ev('(window.__toast||[]).length')),
    B차량기록: JSON.stringify((((SRV.byOrg.B || {}).carState || {}).car1 || {}).ride || {}),
    B명단: JSON.stringify(((((SRV.byOrg.B || {}).data || {}).members) || [{}])[0].name || null),
    /* ★ 쓰기 자취는 `set B/data/members` 꼴이다 — 업체 앞에 `/` 가 없다(처음에 그렇게 걸러 헛돌았다) */
    쓴것: SRV.writes.filter((w) => w.indexOf(' B/') >= 0).length,
    R: p.R, SRV: SRV
  };
}

(async () => {
  console.log('════ ① 대조 — 고치기 전(v287 · ' + OLD_REF + ')');
  {
    const o = await beforeFirstSync(OLD_SRC);
    ck('[옛] 서버에 **썼다**', o.쓴것 > 0, true);
    ck('[옛] B 차량 기록에 **A 의 값이** 올라갔다', o.B차량기록, '{"1":{"on":true}}');
    ck('[옛] B 명단이 **A 명단으로** 바뀌었다', o.B명단, '"가하은"');
    ck('[옛] 안내는 없었다', o.토스트, 0);
  }

  console.log('\n════ ② 고친 판 — 막히고 안내가 뜬다');
  let kept = null;
  {
    const n = await beforeFirstSync(E.SRC_NEW);
    ck('★ 서버에 **안 썼다**', n.쓴것, 0);
    ck('★ B 차량 기록 그대로', n.B차량기록, '{"1":{"on":true}}');
    ck('★ B 명단 그대로', n.B명단, '"나래비"');
    ck('★ 안내(토스트)가 떴다', n.토스트 >= 1, true);
    ck('  돌려준 값은 거짓(안 썼으니)', n.돌려준값, 'false');
    ck('  줄에 세워 두었다', n.R.ev('String(_csSaveAgain)'), 'true');
    kept = n;
  }

  console.log('\n════ ③ 첫 동기화가 끝나면 **그때 값으로** 한 번 쓴다');
  {
    /* ②에서 막힌 그 폰으로 이어서 동기화한다(실제 흐름과 같다) */
    await kept.R.ev('startFirstSync()');
    await wait(900);
    ck('첫 동기화 표시가 참이 된다', kept.R.ev('String(_firstSyncOk)'), 'true');
    ck('★ 폰은 **B 자료**로 바뀌었다', kept.R.ev("JSON.stringify((loadMembers()[0]||{}).name)"), '"나래비"');
    ck('★ B 명단은 서버 그대로', JSON.stringify(((((kept.SRV.byOrg.B || {}).data || {}).members) || [{}])[0].name || null), '"나래비"');
    ck('★ B 차량 기록도 서버 그대로', JSON.stringify((((kept.SRV.byOrg.B || {}).carState || {}).car1 || {}).ride || {}), '{"1":{"on":true}}');
    ck('  A 서버는 손대지 않았다', JSON.stringify(((((kept.SRV.byOrg.A || {}).data || {}).members) || [{}])[0].name || null), '"가하은"');
  }

  console.log('\n════ ④ 동기화가 **스스로 쓰는 길**은 막히지 않는다');
  {
    const SRV = makeServer({
      B: { carState: { car1: emptyCar({ ride: { '1': { on: true } } }) },
           data: { members: MEM_B, cars: CARS, courses: COURSES,
                   org: { name: 'B학원', icon: '🅱', bizType: 'academy' } } }   /* migration 없음 */
    });
    const p = phone(SRV, {});
    await p.R.ev('startFirstSync()');
    await wait(900);
    ck('첫 동기화가 끝났다', p.R.ev('String(_firstSyncOk)'), 'true');
    /* 동기화가 만드는 것: 차량별 사본(carData) · 기사용 요약(orgDriver) · 옛 자료 옮기기 표시 */
    const made = SRV.writes.filter((w) => w.indexOf(' B/carData/') >= 0 || w.indexOf(' B/data/') >= 0);
    ck('★ 동기화가 서버에 **쓴 것이 있다**(막히지 않았다)', made.length >= 1, true);
    console.log('      (쓴 것: ' + made.slice(0, 4).join(' · ') + ')');
  }

  console.log('\n════ ⑤ 동기화가 **실패하면** 막아 둔 채 다시 시도하고 안내한다');
  {
    const SRV = makeServer(SERVER);
    /* ★ 읽기를 던지게 해도  가 **스스로 삼킨다**(실측) —
       그래서 **동기화 안에서 던지게** 한다(ro285 ② 와 같은 방법). */
    const p = phone(SRV, {});
    p.R.ev("(function(){ var o=mergeCarState; mergeCarState=function(){ throw new Error('일부러'); }; })()");
    await p.R.ev('startFirstSync()');
    await wait(5400);                           /* 2초 간격 두 번 다시 시도 */
    ck('첫 동기화 표시가 거짓이다', p.R.ev('String(_firstSyncOk)'), 'false');
    ck('★ 안내(창)가 한 번 떴다', p.R.ev('String((window.__al||[]).length)'), '1');
    ck('  안내가 「불러오지 못했어요」', p.R.ev('String(((window.__al||[])[0]||"").indexOf("불러오지 못했어요")>=0)'), 'true');
    /* 그 뒤에도 저장은 막혀 있어야 한다 */
    p.R.ev("(function(){var st=loadRideState(); st['1']={on:true};"
         + " localStorage.setItem('tkd_ridestate', JSON.stringify(st));})()");
    const ok2 = await p.R.ev('saveCarState()');
    await wait(200);
    ck('★ 저장은 여전히 막혀 있다', String(ok2), 'false');
    ck('★ B 서버에 쓴 것 0', SRV.writes.filter((w) => w.indexOf(' B/') >= 0).length, 0);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  process.exit(fail ? 1 : 0);
})();
