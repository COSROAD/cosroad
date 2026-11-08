/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드59-B5 — **자격증 칸**(v290).
   59-A 실측: `tkd_certificates` 는 **업체 꼬리가 없고**(ORG_KEYS 에 없었다)
   **서버에서 내려받지도 않았다**(올리기 `saveCertificates` 만 있었다 — 동기화·리스너 목록에 없음).
   → 한번 섞이면 그 기기에 **영구히** 남의 업체 자격증이 보였다.
   보는 것: ① 꼬리가 붙었나(업체별로 갈리나) ② 동기화가 내려받나 ③ 리스너가 받나
            ④ 기사에게는 **안 붙나**(규칙상 못 읽는다) ⑤ 올리기만 하는 키가 **더 없나**
   실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const OLD_REF = process.env.COS_SRC_OLD_REF || '7208803';   /* v289 — 고치기 전 */
if (!('COS_SRC_NEW_REF' in process.env)) process.env.COS_SRC_NEW_REF = '';
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 42)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const NEW_SRC = require('fs').readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '1', lat: 37.41, lon: 126.68, phone: '010-1' }];
const CARS = [{ id: 'car1', name: '1호차', driver: '', phone: '', plate: '' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const SUF = '__cosroad_default';

function emptyCar(o) {
  return Object.assign({ ride: {}, rideOff: {}, carlog: { records: [], plans: {} },
                         delivDone: {}, dropDone: {}, att: {} }, o || {});
}

function phone(SRV, opt) {
  opt = opt || {};
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(MEM);
  store['tkd_cars' + SUF]    = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify(COURSES);
  store['tkd_org' + SUF]     = JSON.stringify({ name: '가온', icon: '🚐', bizType: 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  /* 폰에 **앞 업체 자격증**이 꼬리 없이 들어 있다(59-A 가 찾은 그 모양) */
  store['tkd_certificates'] = JSON.stringify([{ id: 1, name: 'A학원 자격증' }]);
  const R = E.build({ src: opt.src || NEW_SRC, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-screen', 'admin-screen', 'fb-loading', 'member-screen',
   'member-list', 'main-header', 'today-date', 'org-name-display', 'org-icon', 'login-screen',
   'main-app', 'bottom-action', 'mode-badge', 'header-btns', 'filter-chips', 'search-input',
   'day-tabs', 'member-add-area', 'drive-tabs']
   .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });
  const bag = (col) => { SRV[col] = SRV[col] || {}; return SRV[col]; };
  R.sandbox._firestore = R.win._firestore = {
    doc: (db, c1, org, col, k) => ({ org: org, col: col, key: k }),
    collection: (db, c1, org, col) => ({ org: org, col: col }),
    getDoc: async (ref) => {
      const src = bag(ref.col);
      const has = Object.prototype.hasOwnProperty.call(src, ref.key);
      SRV.reads.push(ref.col + '/' + ref.key);
      return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
    },
    getDocs: async (ref) => {
      const src = bag(ref.col);
      return { forEach: (cb) => Object.keys(src).forEach((k) =>
        cb({ id: k, data: () => ({ value: JSON.stringify(src[k]) }) })) };
    },
    setDoc: async (ref, d) => {
      SRV.writes.push(ref.col + '/' + ref.key);
      bag(ref.col)[ref.key] = d.value !== undefined ? JSON.parse(d.value) : d;
    },
    deleteDoc: async () => {},
    runTransaction: async (db, fn) => await fn({
      get: async (ref) => {
        const src = bag(ref.col);
        const has = Object.prototype.hasOwnProperty.call(src, ref.key);
        return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
      },
      set: (ref, d) => { SRV.writes.push('tx ' + ref.col + '/' + ref.key); bag(ref.col)[ref.key] = JSON.parse(d.value); }
    }),
    onSnapshot: (ref, cb) => {
      SRV.listeners.push(ref.col + '/' + (ref.key || '*'));
      /* 자격증 리스너가 붙으면 **서버 값을 한 번 준다**(실제 onSnapshot 과 같다) */
      if (ref.col === 'data' && ref.key === 'certificates' && bag('data').certificates !== undefined) {
        try { cb({ exists: () => true, data: () => ({ value: JSON.stringify(bag('data').certificates) }) }); } catch (e) {}
      }
      return () => {};
    }
  };
  R.sandbox._db = R.win._db = {};
  R.ev("currentMode='" + (opt.mode || 'admin') + "';");
  R.ev("window._userOrgId='B'; window._userBizType='academy';");
  R.ev("window._userPaidUntil=Date.now()+30*86400000;");
  if (opt.mode === 'driver') { R.ev("window._isDriverAcct=true; window._driverOrg='B'; window._driverCarId='car1';"); }
  else { R.ev("window._userUid='uB';"); }
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return { R, SRV };
}
const makeServer = () => ({
  reads: [], writes: [], listeners: [],
  carState: { car1: emptyCar() },
  data: { members: MEM, cars: CARS, courses: COURSES, migration: { carState: true },
          org: { name: '나온', icon: '🚐', bizType: 'academy' },
          certificates: [{ id: 9, name: 'B학원 자격증' }] }     /* 서버에는 **B 업체** 것이 있다 */
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('════ ① 업체 꼬리 — 업체별로 갈리나');
  {
    const o = phone(makeServer(), { src: OLD_SRC });
    ck('[옛] 꼬리가 **없다**(업체 구분 0)',
      o.R.ev("(function(){ localStorage.setItem('tkd_certificates', JSON.stringify([{id:7}]));"
           + " window._userOrgId='Z';"
           + " return String((JSON.parse(localStorage.getItem('tkd_certificates')||'[]')[0]||{}).id); })()"), '7');
    const n = phone(makeServer(), {});
    /* ★ 꼬리는 `?org=` 를 보므로 이 스텁에서는 `__cosroad_default` 하나다(B3 에서 고친다).
       여기서 볼 것은 **ORG_KEYS 에 들어갔나** — 들어갔으면 꼬리가 붙는다. */
    ck('★ ORG_KEYS 에 **들어갔다**(꼬리가 붙는다)',
      /'tkd_attendance_time','tkd_ridestate','tkd_driver_pay','tkd_certificates'\]/.test(NEW_SRC), true);
    ck('  (옛 판에는 없었다 — 대조)',
      /'tkd_driver_pay','tkd_certificates'\]/.test(OLD_SRC), false);
    ck('  꼬리 붙은 칸으로 읽고 쓴다',
      n.R.ev("(function(){ saveCertificates([{id:5,name:'새것'}]);"
           + " return String((JSON.parse(localStorage.getItem('tkd_certificates__cosroad_default')||'[]')[0]||{}).id); })()"), '5');
  }

  console.log('\n════ ② 동기화가 **내려받나**');
  {
    const o = phone(makeServer(), { src: OLD_SRC });
    await o.R.ev('syncFromFirebase()');
    await wait(500);
    ck('[옛] 서버에서 자격증을 **안 읽었다**',
      o.SRV.reads.filter((r) => r === 'data/certificates').length, 0);
    ck('[옛] 폰에 **앞 업체 것이 그대로**',
      o.R.ev("JSON.stringify((loadCertificates()[0]||{}).name)"), '"A학원 자격증"');

    const n = phone(makeServer(), {});
    await n.R.ev('syncFromFirebase()');
    await wait(500);
    ck('★ 서버에서 자격증을 **읽는다**',
      n.SRV.reads.filter((r) => r === 'data/certificates').length >= 1, true);
    ck('★ 폰이 **그 업체 것**으로 바뀐다',
      n.R.ev("JSON.stringify((loadCertificates()[0]||{}).name)"), '"B학원 자격증"');
  }

  console.log('\n════ ③ 리스너가 받나 · ④ 기사에게는 안 붙나');
  {
    const n = phone(makeServer(), {});
    await n.R.ev('syncFromFirebase()');
    await wait(500);
    ck('★ 관리자에게 자격증 리스너가 **붙는다**',
      n.SRV.listeners.filter((k) => k === 'data/certificates').length, 1);
    const o = phone(makeServer(), { src: OLD_SRC });
    await o.R.ev('syncFromFirebase()');
    await wait(500);
    ck('  (옛 판에는 안 붙었다 — 대조)',
      o.SRV.listeners.filter((k) => k === 'data/certificates').length, 0);

    const d = phone(makeServer(), { mode: 'driver' });
    await d.R.ev('syncFromFirebase()');
    await wait(500);
    ck('★ 기사에게는 **안 붙는다**(규칙상 못 읽는다)',
      d.SRV.listeners.filter((k) => k === 'data/certificates').length, 0);
    ck('  기사는 서버에서 읽지도 않는다',
      d.SRV.reads.filter((r) => r === 'data/certificates').length, 0);
  }

  console.log('\n════ ⑤ 「올리기만 하고 내려받지 않는 키」가 더 없나 (전수)');
  {
    const ups = [...new Set([...NEW_SRC.matchAll(/saveToFirebase\('([a-zA-Z]+)'/g)].map((m) => m[1]))];
    const downs = new Set([...NEW_SRC.matchAll(/loadFromFirebase\('([a-zA-Z]+)'/g)].map((m) => m[1]));
    /* 동기화는 `loadFromFirebase(_drvMode ? 'orgDriver' : 'org')` 처럼 **세 항 연산**으로도 부른다 */
    [...NEW_SRC.matchAll(/loadFromFirebase\([^)]*\?\s*'([a-zA-Z]+)'\s*:\s*'([a-zA-Z]+)'/g)]
      .forEach((m) => { downs.add(m[1]); downs.add(m[2]); });
    /* ★ `var keys = [` 는 소스에 둘이다 — 백업(`tkd_…`)과 리스너(`members`…).
       리스너 쪽을 집어야 한다(`'members'` 로 시작하는 것). */
    const listenKeys = new Set((/var keys = \['members'([^\]]+)\]/.exec(NEW_SRC) || [, ''])[1]
      .split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean).concat(['members']));
    const onlyUp = ups.filter((k) => !downs.has(k) && !listenKeys.has(k));
    console.log('      올리는 키 ' + ups.length + '개 · 내려받는 키 ' + downs.size + '개 · 듣는 키 ' + listenKeys.size + '개');
    ck('★ 올리기만 하는 키가 **0개**', onlyUp.join(',') || '없음', '없음');
    /* 대조 — 옛 판에서는 certificates 하나가 걸려야 한다 */
    const ups0 = [...new Set([...OLD_SRC.matchAll(/saveToFirebase\('([a-zA-Z]+)'/g)].map((m) => m[1]))];
    const downs0 = new Set([...OLD_SRC.matchAll(/loadFromFirebase\('([a-zA-Z]+)'/g)].map((m) => m[1]));
    [...OLD_SRC.matchAll(/loadFromFirebase\([^)]*\?\s*'([a-zA-Z]+)'\s*:\s*'([a-zA-Z]+)'/g)]
      .forEach((m) => { downs0.add(m[1]); downs0.add(m[2]); });
    const lk0 = new Set((/var keys = \['members'([^\]]+)\]/.exec(OLD_SRC) || [, ''])[1]
      .split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean).concat(['members']));
    ck('  (대조) 옛 판에서는 **certificates 하나**가 걸린다',
      ups0.filter((k) => !downs0.has(k) && !lk0.has(k)).join(','), 'certificates');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  process.exit(fail ? 1 : 0);
})();
