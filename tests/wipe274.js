/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v274 40-B — 「기사 폰에 **자기 차량 명단만**」이 되면 어느 저장 길이 남의 기록을 지우나.
   ★ 40-B 의 실제 조건으로 잰다:
       · members  = 자기 차량만        (carData 사본에서 받으므로)
       · rideState·deliveryDone·dropoffDone = **업체 전체**  (이 키들은 기사 읽기에 그대로 남는다)
   → 그래서 「폰에 있는 지도」는 전체인데 「members」만 부분이다. 이 어긋남이 어디서 터지나.
   가짜 Firestore — 실제 쓰기 0. */
/* ★ v275: 이 묶음은 **v274 회차의 잰 값**이다 — 앱을 그 커밋(889fbec)에 못 박는다.
   v275 는 다섯 키를 차량별 문서로 옮겨 「폰에 전체 지도」라는 전제 자체가 없어졌다
   (못 박지 않으면 「사라짐」이 나와 거짓 실패가 된다 — v275 에서 실제로 겪었다).
   이 회차의 같은 질문은 e_app275.js ③(배정 바뀔 때 기록 이동)이 본다. */
if (!('COS_SRC_NEW_REF' in process.env)) process.env.COS_SRC_NEW_REF = '889fbec';
if (!process.env.COS_SRC_NEW && process.env.COS_SRC_NEW_REF) {
  const f = require('path').join(__dirname, 'pin274_index.html');
  require('fs').writeFileSync(f, require('child_process').execSync(
    'git -C ' + COS_ROOT + ' show ' + process.env.COS_SRC_NEW_REF + ':index.html',
    { maxBuffer: 1 << 28 }));
  process.env.COS_SRC_NEW = f;
}
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const ALL = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: 'A', lat: 37.41, lon: 126.68, on: true, offOn: true },
  { id: 2, name: '나여름', carId: 'car1', courseId: 'c1', days: D7, location: 'B', lat: 37.42, lon: 126.69, on: true, offOn: true },
  { id: 3, name: '다가을', carId: 'car2', courseId: 'c1', days: D7, location: 'C', lat: 37.45, lon: 126.73, on: true, offOn: true },
  { id: 4, name: '라겨울', carId: 'car2', courseId: 'c1', days: D7, location: 'D', lat: 37.46, lon: 126.74, on: true, offOn: true }
];
const CARS = [{ id: 'car1', name: '1호차' }, { id: 'car2', name: '2호차' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const SUF = '__cosroad_default';
/* 서버(=폰)에 있는 **전체** 지도 — 네 명 모두 */
const FULL_RIDE = { '1': { on: true, offOn: true }, '2': { on: true, offOn: true },
                    '3': { on: true, offOn: true }, '4': { on: true, offOn: true } };
const FULL_DELIV = { '1': '2026-11-05', '3': '2026-11-05' };
const FULL_DROP = { '2': '2026-11-05', '4': '2026-11-05' };

function boot(membersOnPhone) {
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(membersOnPhone);
  store['tkd_cars' + SUF] = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify(COURSES);
  store['tkd_org' + SUF] = JSON.stringify({ name: '가온', icon: '🚐', bizType: 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  store['tkd_ridestate' + SUF] = JSON.stringify(FULL_RIDE);
  store['tkd_delivery_done_cosroad_default'] = JSON.stringify(FULL_DELIV);
  store['tkd_dropoff_done_cosroad_default'] = JSON.stringify(FULL_DROP);
  const R = E.build({ src: E.SRC_NEW, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-tabs', 'drive-screen', 'fb-loading', 'admin-screen']
    .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });
  const wrote = {};
  R.sandbox._firestore = R.win._firestore = {
    doc: (db, c1, org, c2, key) => ({ key: key }), collection: () => ({}),
    /* 서버에는 **전체 지도**가 있다 */
    getDoc: async (ref) => {
      const M = { rideState: FULL_RIDE, deliveryDone: FULL_DELIV, dropoffDone: FULL_DROP };
      const has = Object.prototype.hasOwnProperty.call(M, ref.key);
      return { exists: () => has, data: () => ({ value: JSON.stringify(M[ref.key]) }) };
    },
    setDoc: async (ref, d) => { wrote[ref.key] = JSON.parse(d.value); },
    deleteDoc: async () => {}, getDocs: async () => ({ forEach: () => {} }),
    onSnapshot: () => (() => {})
  };
  R.sandbox._db = R.win._db = {};
  R.ev("currentMode='driver';");
  R.sandbox._isDriverAcct = true; R.sandbox._driverCarId = 'car1';
  R.sandbox._userOrgId = 'cosroad_default';
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return { R, wrote };
}

const ONLY1 = ALL.filter((m) => m.carId === 'car1');

(async () => {
  console.log('════ ① 지금(v273) — 폰에 **전체 명단** 네 명 → 아무 문제 없다');
  {
    const { R, wrote } = boot(ALL);
    R.ev('saveRideStateFromMembers();');
    await new Promise((r) => setTimeout(r, 60));
    const w = wrote.rideState || {};
    ck('쓴 사람 수', Object.keys(w).length, 4);
    ck('2호차(3·4) 토글 남음', (w['3'] ? 'o' : 'x') + (w['4'] ? 'o' : 'x'), 'oo');
  }

  console.log('\n════ ② 40-B 조건 — 폰 명단은 **자기 차량만** 2명 · 지도는 전체');
  {
    const { R, wrote } = boot(ONLY1);
    ck('폰 명단', R.ev('members.length'), 2);
    ck('폰 rideState 는 전체 네 명', Object.keys(R.ev('loadRideState()')).length, 4);
    R.ev('saveRideStateFromMembers();');
    await new Promise((r) => setTimeout(r, 60));
    const w = wrote.rideState || {};
    console.log('      → 쓴 내용: ' + JSON.stringify(w));
    ck('★ saveRideStateFromMembers — 2호차 토글이 남나',
      (w['3'] ? '남음' : '사라짐') + '/' + (w['4'] ? '남음' : '사라짐'), '남음/남음');
  }

  console.log('\n════ ③ 40-B 조건 — markDeliveryDone (폰에 있는 지도에 한 칸 더한다)');
  {
    const { R, wrote } = boot(ONLY1);
    R.ev('markDeliveryDone(2);');
    await new Promise((r) => setTimeout(r, 60));
    const w = wrote.deliveryDone || {};
    console.log('      → 쓴 내용: ' + JSON.stringify(w));
    ck('2호차(3) 완료가 남나', w['3'] ? '남음' : '사라짐', '남음');
  }

  console.log('\n════ ④ 40-B 조건 — markDropoffDone');
  {
    const { R, wrote } = boot(ONLY1);
    R.ev('markDropoffDone(1);');
    await new Promise((r) => setTimeout(r, 60));
    const w = wrote.dropoffDone || {};
    console.log('      → 쓴 내용: ' + JSON.stringify(w));
    ck('2호차(4) 하차완료가 남나', w['4'] ? '남음' : '사라짐', '남음');
  }

  console.log('\n' + (fail ? '✘ ' + fail + '곳이 지운다 / ' + pass + '곳은 괜찮다'
    : '✔ ' + pass + '/' + pass + ' 지우는 곳 없음'));
  console.log('※ 가짜 Firestore — 실제 쓰기 0');
  process.exit(0);           /* 이 묶음은 **재는 것** — 실패도 결과다 */
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
