/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드40 설계 근거 — 「자료를 차량별로 나누면 **지워진다**」를 말이 아니라 **실측**으로.
   코드·규칙·버전 변경 0. 가짜 Firestore 라 실제 쓰기 0.
   보는 것:
     ① 지금 판: 기사 폰에 **전체 명단**이 있어 saveRideStateFromMembers() 가 전부 다시 쓴다 → 안 지워짐
     ② 읽기만 나눈 판: 기사 폰에 **자기 차량만** 있으면 같은 함수가 **다른 차량 토글을 지운다**
     ③ 같은 일이 deliveryDone·dropoffDone 에서도 일어나나
   → ②가 참이면 「읽기·쓰기를 같은 회차에」가 꼭 필요하다는 뜻이다. */
/* ★ v275: 이 묶음은 **설계 회차(코스로드40, 코드 0)의 잰 값**이다 — 그때의 앱,
   즉 d26c93e(v272 보정1) 에 못 박는다. 40-B·40-C 가 실제로 나누고 나면
   「지금 판」이라는 전제가 없어져 거짓 실패가 난다(v275 에서 실제로 겪었다).
   그 설계가 정말 맞았는지는 d_app274.js·e_app275.js 가 본다. */
if (!('COS_SRC_NEW_REF' in process.env)) process.env.COS_SRC_NEW_REF = 'd26c93e';
if (!process.env.COS_SRC_NEW && process.env.COS_SRC_NEW_REF) {
  const f = require('path').join(__dirname, 'pin_design40_index.html');
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
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const MEMBERS = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: ['월','화','수','목','금','토','일'],
    location: '인천 연수구 1', lat: 37.41, lon: 126.68, on: true, offOn: true },
  { id: 2, name: '나여름', carId: 'car1', courseId: 'c1', days: ['월','화','수','목','금','토','일'],
    location: '인천 연수구 2', lat: 37.42, lon: 126.69, on: true, offOn: true },
  { id: 3, name: '다가을', carId: 'car2', courseId: 'c1', days: ['월','화','수','목','금','토','일'],
    location: '인천 남동구 3', lat: 37.45, lon: 126.73, on: true, offOn: true },
  { id: 4, name: '라겨울', carId: 'car2', courseId: 'c1', days: ['월','화','수','목','금','토','일'],
    location: '인천 남동구 4', lat: 37.46, lon: 126.74, on: true, offOn: true }
];
const CARS = [{ id: 'car1', name: '1호차' }, { id: 'car2', name: '2호차' }];
const SUF = '__cosroad_default';

/* 서버에는 네 명 모두의 토글이 들어 있다 (1·2호차 섞여서) */
const SERVER_RIDE = { '1': { on: true, offOn: true }, '2': { on: true, offOn: true },
                      '3': { on: true, offOn: true }, '4': { on: true, offOn: true } };
const SERVER_DELIV = { '1': '2026-11-05', '3': '2026-11-05' };

function boot(membersOnPhone, rideOnPhone, delivOnPhone) {
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(membersOnPhone);
  store['tkd_cars' + SUF] = JSON.stringify(CARS);
  store['tkd_ridestate' + SUF] = JSON.stringify(rideOnPhone);
  store['tkd_delivery_done_cosroad_default'] = JSON.stringify(delivOnPhone || {});
  const R = E.build({ src: E.SRC_NEW, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-tabs', 'drive-screen', 'fb-loading'].forEach((id) => {
    const el = E.makeEl('div'); el.id = id; R.byId[id] = el;
  });
  const wrote = {};
  R.sandbox._firestore = R.win._firestore = {
    doc: (db, c1, org, c2, key) => ({ key: key }), collection: () => ({}),
    getDoc: async () => ({ exists: () => false, data: () => ({}) }),
    setDoc: async (ref, d) => { wrote[ref.key] = JSON.parse(d.value); },
    deleteDoc: async () => {}, getDocs: async () => ({ forEach: () => {} }),
    onSnapshot: () => (() => {})
  };
  R.sandbox._db = R.win._db = {};
  R.ev("currentMode='driver';");
  R.sandbox._isDriverAcct = true; R.sandbox._driverCarId = 'car1';
  R.sandbox._userOrgId = 'cosroad_default';
  R.ev('members = loadMembers();');
  return { R, wrote };
}

(async () => {
  console.log('════ ① 지금 판 — 기사 폰에 **전체 명단**(4명)이 있다');
  {
    const { R, wrote } = boot(MEMBERS, SERVER_RIDE);
    R.ev('saveRideStateFromMembers();');
    await new Promise((r) => setTimeout(r, 50));
    const w = wrote.rideState || {};
    ck('폰에 있던 회원 수', R.ev('members.length'), 4);
    ck('서버에 쓴 rideState 사람 수', Object.keys(w).length, 4);
    ck('2호차 회원(3·4)의 토글이 남아 있다',
      (w['3'] ? 'o' : 'x') + (w['4'] ? 'o' : 'x'), 'oo');
  }

  console.log('\n════ ② 읽기만 나눈 판 — 기사 폰에 **자기 차량(car1)만** 2명');
  console.log('      (2단계에서 members 를 carData/{carId} 로 나누고 **쓰기는 그대로 두면** 이 상태가 된다)');
  {
    const only1 = MEMBERS.filter((m) => m.carId === 'car1');
    const { R, wrote } = boot(only1, SERVER_RIDE);
    R.ev('saveRideStateFromMembers();');
    await new Promise((r) => setTimeout(r, 50));
    const w = wrote.rideState || {};
    ck('폰에 있던 회원 수', R.ev('members.length'), 2);
    ck('서버에 쓴 rideState 사람 수', Object.keys(w).length, 2);
    ck('★ 2호차 회원(3·4)의 토글이 사라졌다',
      (w['3'] ? '남음' : '사라짐') + ' / ' + (w['4'] ? '남음' : '사라짐'), '사라짐 / 사라짐');
    console.log('      → 쓴 내용: ' + JSON.stringify(w));
    console.log('      → 서버에 있던 것: ' + JSON.stringify(SERVER_RIDE));
  }

  console.log('\n════ ③ deliveryDone 도 같은가 (markDeliveryDone 은 폰에 있는 지도를 통째로 쓴다)');
  {
    /* 폰에는 자기 차량 회원(1번)의 완료만 남아 있다고 본다 */
    const only1 = MEMBERS.filter((m) => m.carId === 'car1');
    const { R, wrote } = boot(only1, SERVER_RIDE, { '1': '2026-11-05' });
    R.ev("markDeliveryDone(2);");
    await new Promise((r) => setTimeout(r, 50));
    const w = wrote.deliveryDone || {};
    ck('서버에 쓴 deliveryDone 사람 수', Object.keys(w).length, 2);
    ck('★ 2호차 회원(3)의 완료가 사라졌다', w['3'] ? '남음' : '사라짐', '사라짐');
    console.log('      → 쓴 내용: ' + JSON.stringify(w));
    console.log('      → 서버에 있던 것: ' + JSON.stringify(SERVER_DELIV));
  }

  console.log('\n════ ④ 저장 꼴 — 칸 단위로 쓸 수 있나');
  {
    const src = E.SRC_NEW;
    const m = /await setDoc\(ref, \{ value: JSON\.stringify\(data\), updatedAt: Date\.now\(\) \}\);/.test(src);
    ck('saveToFirebase 는 문서를 **통째로** 쓴다', m, true);
    ck('자료가 `value` 한 칸에 JSON 글자로 들어간다', /value: JSON\.stringify\(data\)/.test(src), true);
    console.log('      → 그래서 Firestore update(칸 단위)·merge 로는 한 회원만 못 고친다.');
    console.log('        칸 단위로 쓰려면 저장 **모양**부터 바꿔야 한다(설계 2-2).');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 확인'));
  console.log('※ 가짜 Firestore — 실제 쓰기 0 · 코드·규칙 변경 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
