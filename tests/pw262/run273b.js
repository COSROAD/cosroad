/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v273 — 「운행 중에 관리자가 배정을 바꾸면 기사 화면이 **실시간으로** 바뀌나」.
   두 탭(관리자·기사)을 띄우고, 관리자가 저장한 members 를 **리스너 콜백으로 기사 탭에 흘려** 본다
   (가짜 Firestore 라 서버를 거치지 않으므로, 서버가 하는 일을 손으로 대신한다 —
    실제로는 onSnapshot 이 이 콜백을 부른다).
   ★ 바깥 요청 차단 · 실제 쓰기 0. */
const { chromium } = require('playwright');
/* ★ v274: 이 묶음은 **v273 회차 기록**이다 — 화면을 그 회차 커밋에서 띄운다.
   전에는 일하는 폴더를 띄웠다. 그래서 v274 가 기사 읽기 키를 줄이고
   `carData` 사본에서 명단을 받게 바꾸자 이 회차의 기대값이 거짓으로 깨졌다
   (v273 가 틀린 것이 아니다). 지금 화면은 run274.js 가 본다. */
const PIN_REF = process.env.COS_SRC_NEW_REF || '06e30f3';
const APP = (function(){
  const f = require('path').join(__dirname, 'pin_run273b.html');
  require('fs').writeFileSync(f, require('child_process').execSync(
    'git -C ' + COS_ROOT + ' show ' + PIN_REF + ':index.html', { maxBuffer: 1 << 28 }));
  return f;
})();
const CARS = [{ id: 'car1', name: '1호차' }, { id: 'car2', name: '2호차' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1',
    lat: 37.41, lon: 126.68, dropLocation: '하차 1', dropLat: 37.42, dropLon: 126.69,
    phone: '010-1111-1111', on: true, offOn: true }
];

let pass = 0, fail = 0;
const say = (ok, line) => { if (ok) pass++; else fail++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

async function open(b, mode, carId) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + APP, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(({ CARS, COURSES, MEMBERS, mode, carId }) => {
    const SUF = '__cosroad_default';
    localStorage.setItem('tkd_cars' + SUF, JSON.stringify(CARS));
    localStorage.setItem('tkd_courses' + SUF, JSON.stringify(COURSES));
    localStorage.setItem('tkd_members' + SUF, JSON.stringify(MEMBERS));
    localStorage.setItem('tkd_org' + SUF, JSON.stringify({ name: '가온', icon: '🚐',
      bizType: 'academy', destName: '학원', destLat: 37.4467, destLon: 126.6516 }));
    localStorage.setItem('tkd_ridestate' + SUF, '{}');
    window.__saved = {};
    window._db = {}; window._fbReady = true;
    window.__listeners = {};
    window._firestore = {
      doc: function (db, c1, org, c2, key) { return { key: key }; },
      collection: function () { return {}; },
      getDoc: async function () { return { exists: function () { return false; }, data: function () { return {}; } }; },
      setDoc: async function (ref, d) { window.__saved[ref.key] = d.value; },
      deleteDoc: async function () {}, getDocs: async function () { return { forEach: function () {} }; },
      onSnapshot: function (ref, cb) { window.__listeners[ref.key] = cb; return function () {}; }
    };
    window.alert = function () {}; window.confirm = function () { return true; };
    currentMode = mode;
    window._userBizType = 'academy'; window._userOrgId = 'cosroad_default';
    if (mode === 'driver') { window._isDriverAcct = true; window._driverCarId = carId; }
    members = loadMembers(); cars = loadCars(); courses = loadCourses(); orgSettings = loadOrgSettings();
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    currentCourseId = 'c1';
    currentDay = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
    if (mode === 'driver') { currentCarId = carId; driveLeg = 'pickup'; }
    startFirebaseListeners();
  }, { CARS, COURSES, MEMBERS, mode, carId });
  p.__errs = errs;
  return p;
}

const drvNames = (p, leg) => p.evaluate((leg) => {
  driveLeg = leg; switchTab('drive'); renderDrive();
  return { 목록: getActiveStudents().map((x) => x.name).join(','),
           화면: (document.getElementById('app-content').textContent || '').indexOf('가하은') >= 0 };
}, leg);

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });

  /* 기사 탭 둘 — 1호차·2호차 · 관리자 탭 하나 */
  const admin = await open(b, 'admin');
  const drv1 = await open(b, 'driver', 'car1');
  const drv2 = await open(b, 'driver', 'car2');

  console.log('① 처음 — 가하은은 등원·하원 모두 1호차');
  say((await drvNames(drv1, 'pickup')).목록 === '가하은', '1호차 기사 등원'.padEnd(30) + (await drvNames(drv1, 'pickup')).목록);
  say((await drvNames(drv2, 'pickup')).목록 === '', '2호차 기사 등원 — 없음'.padEnd(30) + ((await drvNames(drv2, 'pickup')).목록 || '없음'));
  say((await drvNames(drv2, 'dropoff')).목록 === '', '2호차 기사 하원 — 없음'.padEnd(30) + ((await drvNames(drv2, 'dropoff')).목록 || '없음'));

  console.log('\n② 관리자가 차량관리에서 「하원만 2호차」로 바꾼다');
  const savedMembers = await admin.evaluate(async () => {
    currentCarTab = 1;                                  /* 2호차 탭 */
    carAssignMode = 'drop';                             /* 하원만 */
    assignMemberToCar(1, 'car2', 'drop');
    /* saveToFirebase 는 async — 서버에 쓰기까지 기다린다 */
    for (let i = 0; i < 40 && !window.__saved['members']; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    return window.__saved['members'] || null;
  });
  say(!!savedMembers, '관리자가 서버에 members 를 저장했다'.padEnd(34) + (savedMembers ? '저장됨' : '★안 됨'));
  const parsed = JSON.parse(savedMembers || '[]');
  say(String(parsed[0] && parsed[0].carIdDrop) === 'car2',
    '저장된 값: carId=' + parsed[0].carId + ' · carIdDrop=' + parsed[0].carIdDrop);

  console.log('\n③ 그 자료가 기사 탭에 **리스너로** 들어오면 화면이 바뀌나');
  for (const [p, tag] of [[drv1, '1호차'], [drv2, '2호차']]) {
    await p.evaluate((v) => {
      /* 실제로는 onSnapshot 이 이 콜백을 부른다 */
      window.__listeners['members']({ exists: () => true, data: () => ({ value: v }) });
    }, savedMembers);
  }
  const a1p = await drvNames(drv1, 'pickup'), a1d = await drvNames(drv1, 'dropoff');
  const a2p = await drvNames(drv2, 'pickup'), a2d = await drvNames(drv2, 'dropoff');
  say(a1p.목록 === '가하은', '1호차 등원 — 그대로 보인다'.padEnd(30) + (a1p.목록 || '없음'));
  say(a1d.목록 === '', '1호차 하원 — ★ 빠졌다'.padEnd(30) + (a1d.목록 || '없음'));
  say(a2p.목록 === '', '2호차 등원 — 없음'.padEnd(30) + (a2p.목록 || '없음'));
  say(a2d.목록 === '가하은', '2호차 하원 — ★ 들어왔다'.padEnd(30) + (a2d.목록 || '없음'));

  console.log('\n④ 오늘 탑승 표시(on·offOn)는 따라오나 — rideState 는 업체 전체 문서라 그대로');
  {
    const r = await drv2.evaluate(() => {
      const m = members.find((x) => x.id === 1);
      return { on: m.on, offOn: m.offOn, rs: localStorage.getItem('tkd_ridestate__cosroad_default') };
    });
    say(r.on !== false && r.offOn !== false, '탑승 표시 그대로 (on=' + r.on + ' offOn=' + r.offOn + ')');
    console.log('      → rideState 는 「' + (r.rs || '{}') + '」 — 차량별로 안 나뉘어 있어 옮겨도 따라온다(40-C 에서 바뀜)');
  }

  console.log('\n⑤ 콘솔 오류');
  for (const [p, tag] of [[admin, '관리자'], [drv1, '1호차'], [drv2, '2호차']]) {
    say(p.__errs.length === 0, (tag + ' 탭 오류 0').padEnd(30) + (p.__errs[0] || 'OK'));
  }

  await b.close();
  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 요청 차단 · Firestore 가짜 — 실제 쓰기 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
