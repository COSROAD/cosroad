/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v274(40-B) — 기사 폰엔 **자기 차량 사본만** · 사본 만들기 · 지워짐 막기.
   전: 06e30f3 (v273) · 새 쪽은 이 회차 커밋에 고정(COS_SRC_NEW_REF).
   가짜 Firestore — 실제 쓰기 0. */
const cp = require('child_process');
/* ★ v275: 못 박는 자리를 **기본값**으로 둔다(889fbec = v274 커밋). 전에는 환경변수를 줘야
   고정됐는데, 안 주면 작업트리를 보고 뒤 회차마다 거짓 실패가 났다. 빈 값을 주면 작업트리. */
if (!('COS_SRC_NEW_REF' in process.env)) process.env.COS_SRC_NEW_REF = '889fbec';
if (!process.env.COS_SRC_NEW && process.env.COS_SRC_NEW_REF) {
  const f = require('path').join(__dirname, 'pin274_index.html');
  require('fs').writeFileSync(f, cp.execSync(
    'git -C ' + COS_ROOT + ' show ' + process.env.COS_SRC_NEW_REF + ':index.html',
    { maxBuffer: 1 << 28 }));
  process.env.COS_SRC_NEW = f;
}
if (!process.env.COS_SRC_OLD_REF) process.env.COS_SRC_OLD_REF = '06e30f3';   /* v273 */
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(50) + String(got).slice(0, 62)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const ALL = [
  { id: 1, name: '가하은', carId: 'car1', carIdDrop: 'car2', courseId: 'c1', days: D7,
    location: '인천 연수구 1', addrDetail: '101호', lat: 37.41, lon: 126.68,
    dropLocation: '하차 1', dropLat: 37.42, dropLon: 126.69,
    phone: '010-1111-1111', phone2: '010-1111-2222', note: '정문', photo: 'PH',
    pin: '1001', monthly: 130000, regfee: 150000, bizNo: '635-88-02710', ceo: '문준식',
    senderPhone: '010-9', invoice: 'INV1', courier: '04', on: true, offOn: true },
  { id: 2, name: '나여름', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2',
    lat: 37.43, lon: 126.70, phone: '010-2222-2222', pin: '1002', monthly: 120000, on: true, offOn: true },
  { id: 3, name: '다가을', carId: 'car3', courseId: 'c1', days: D7, location: '인천 3',
    lat: 37.45, lon: 126.73, phone: '010-3333-3333', pin: '1003', monthly: 110000, on: true, offOn: true }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-9999-1', plate: '12가3456' },
              { id: 'car2', name: '2호차', driver: '김기사', phone: '010-9999-2', plate: '34나5678' },
              { id: 'car3', name: '3호차', driver: '이기사', phone: '010-9999-3', plate: '56다7890' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00', arrive: '14:50' }];
const SUF = '__cosroad_default';

function boot(mode, opt) {
  opt = opt || {};
  const store = {};
  store['tkd_cars' + SUF] = JSON.stringify(opt.cars || CARS);
  store['tkd_courses' + SUF] = JSON.stringify(COURSES);
  store['tkd_members' + SUF] = JSON.stringify(opt.members || ALL);
  store['tkd_org' + SUF] = JSON.stringify({ name: '가온', icon: '🚐', bizType: opt.biz || 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  store['tkd_ridestate' + SUF] = JSON.stringify(opt.ride || {});
  const R = E.build({ src: E.SRC_NEW, biz: opt.biz || 'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-tabs', 'drive-screen', 'admin-screen', 'fb-loading',
   'member-screen', 'member-list', 'main-header', 'today-date', 'org-name-display', 'org-icon',
   'login-screen', 'main-app', 'bottom-action', 'mode-badge', 'header-btns', 'filter-chips',
   'search-input', 'day-tabs', 'member-add-area', 'sort-asc-btn', 'sort-desc-btn']
    .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });
  const wrote = {}, deleted = [], listeners = {};
  const SERVER = Object.assign({
    members: ALL, cars: CARS, courses: COURSES, orgDriver: {}, rideState: opt.serverRide || {}
  }, opt.server || {});
  const CARDOCS = opt.carDocs || {};
  R.sandbox._firestore = R.win._firestore = {
    doc: (db, c1, org, c2, id3) => ({ col: c2, key: id3 }),
    collection: (db, c1, org, c2) => ({ col: c2 }),
    getDoc: async (ref) => {
      const src = (ref.col === 'carData') ? CARDOCS : SERVER;
      const has = Object.prototype.hasOwnProperty.call(src, ref.key) && src[ref.key] !== undefined;
      return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
    },
    setDoc: async (ref, d) => { (wrote[ref.col] = wrote[ref.col] || {})[ref.key] = JSON.parse(d.value); },
    deleteDoc: async (ref) => { deleted.push(ref.col + '/' + ref.key); },
    getDocs: async (ref) => ({
      forEach: (cb) => { if (ref.col === 'carData') Object.keys(CARDOCS).forEach((k) => cb({ id: k })); }
    }),
    onSnapshot: (ref, cb) => { listeners[(ref.col || '') + '/' + (ref.key || '')] = cb; return () => {}; }
  };
  R.sandbox._db = R.win._db = {};
  R.ev("currentMode='" + mode + "';");
  R.sandbox._userOrgId = 'cosroad_default';
  if (mode === 'driver') {
    R.sandbox._isDriverAcct = true;
    R.sandbox._driverCarId = opt.carId || 'car1';
    R.ev("window._driverCarId='" + (opt.carId || 'car1') + "';");
  }
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return { R, wrote, deleted, listeners };
}

(async () => {
  console.log('════ ① 관리자가 만드는 사본 — 차량마다 무엇이 담기나');
  {
    const { R, wrote, deleted } = boot('admin', { carDocs: { car1: {}, car2: {}, car3: {}, carX: {} } });
    await R.ev('rebuildCarData()');
    await new Promise((r) => setTimeout(r, 120));
    const cd = wrote.carData || {};
    ck('차량 셋 모두 사본이 생겼다', Object.keys(cd).sort().join(','), 'car1,car2,car3');
    ck('없어진 차량(carX) 문서는 지웠다', deleted.join(','), 'carData/carX');
    const c1 = cd.car1 || {};
    ck('1호차 사본 «회원»', (c1.members || []).map((m) => m.name).join(','), '가하은,나여름');
    const c2 = cd.car2 || {};
    ck('2호차 사본 — 하원만 2호차인 가하은', (c2.members || []).map((m) => m.name).join(','), '가하은');
    const c3 = cd.car3 || {};
    ck('3호차 사본 — 다가을', (c3.members || []).map((m) => m.name).join(','), '다가을');
    ck('차량은 **자기 것 한 칸만**', JSON.stringify((c1.car || {}).id) + '/' + (cd.car2.car || {}).id, '"car1"/car2');
    ck('코스도 담겼다', (c1.courses || []).length, 1);
    /* 돈·사업자 칸이 사본에 들어갔나 */
    const first = (c1.members || [])[0] || {};
    const MONEY = ['monthly', 'regfee', 'pin', 'bizNo', 'ceo', 'senderPhone'];
    ck('사본에 돈·사업자·PIN 칸 0개', MONEY.filter((k) => first[k] !== undefined).join(',') || '없음', '없음');
    ck('택배용 invoice·courier 는 들어갔다',
      (first.invoice ? 'o' : 'x') + (first.courier ? 'o' : 'x'), 'oo');
    ck('on·offOn 은 안 담았다 (rideState 가 원본)',
      (first.on === undefined && first.offOn === undefined), true);
    ck('사본 «회원» 칸 수', Object.keys(first).length, 19);
  }

  console.log('\n② 둘러보기·읽기 전용에서는 사본을 쓰지 않는다 (v272 결함 ② 재발 금지)');
  {
    const r1 = boot('admin', {});
    r1.R.sandbox._userOrgId = 'cosroad_demo';
    await r1.R.ev('rebuildCarData()');
    await new Promise((r) => setTimeout(r, 80));
    ck('데모: 사본 쓰기 0 · 토스트 0', JSON.stringify(r1.wrote.carData || {}) + ' / '
      + (r1.R.toasts.length ? r1.R.toasts.join('|') : '없음'), '{} / 없음');
    const r2 = boot('admin', {});
    r2.R.ev("window.isReadOnlyMode=isReadOnlyMode=function(){return true;};");
    await r2.R.ev('rebuildCarData()');
    await new Promise((r) => setTimeout(r, 80));
    ck('읽기 전용: 사본 쓰기 0 · alert 0', JSON.stringify(r2.wrote.carData || {}) + ' / '
      + (r2.R.alerts.length ? r2.R.alerts.join('|') : '없음'), '{} / 없음');
  }

  console.log('\n③ 기사 — 사본 한 문서에서 명단·차량·코스를 받는다');
  {
    const CD = {
      car2: { members: [{ id: 1, name: '가하은', carId: 'car1', carIdDrop: 'car2', courseId: 'c1',
                          days: D7, location: '인천 1', lat: 37.41, lon: 126.68,
                          dropLocation: '하차 1', dropLat: 37.42, dropLon: 126.69,
                          phone: '010-1111-1111' }],
              car: { id: 'car2', name: '2호차', driver: '김기사', phone: '010-9999-2', plate: '34나5678' },
              courses: COURSES }
    };
    const { R, wrote } = boot('driver', { carId: 'car2', carDocs: CD, members: [] });
    await R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 150));
    ck('기사 명단 = 자기 차량 몫만', R.ev('members.map(function(m){return m.name;}).join(",")'), '가하은');
    ck('기사 차량 = 한 대', R.ev('cars.length'), 1);
    ck('그 한 대가 2호차', R.ev('cars[0].id'), 'car2');
    ck('코스도 들어왔다', R.ev('courses.length'), 1);
    /* 폰에 남은 글자에 다른 차량 «회원»·돈 칸이 있나 */
    const dump = Object.keys(R.store).map((k) => k + '=' + R.store[k]).join('\n');
    ck('폰에 다른 차량 «회원» 0명 (나여름·다가을)',
      (/나여름|다가을/.test(dump) ? '★ 있음' : '없음'), '없음');
    ck('폰에 수강료·PIN·사업자번호 0건',
      (/130000|120000|1001|635-88/.test(dump) ? '★ 있음' : '없음'), '없음');
    ck('기사가 members·cars·courses 를 서버에 **달라고 하지 않았다**',
      ['members', 'cars', 'courses'].filter((k) => R.ev('DRIVER_READ_KEYS').indexOf(k) >= 0).join(',') || '없음', '없음');
  }

  console.log('\n④ 사본이 아직 없을 때 — 빈 화면·오류 금지');
  {
    const { R } = boot('driver', { carId: 'car1', carDocs: {} });     /* 사본 0개 */
    await R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 150));
    ck('폰에 있던 명단을 그대로 쓴다', R.ev('members.length') > 0, true);
    ck('알림 0건', R.ev('(window.__a||[]).length') || 0, 0);
    R.ev("driveLeg='pickup'; currentCourseId='c1'; currentCarId='car1'; currentDay=DAYS[new Date().getDay()===0?6:new Date().getDay()-1];");
    let drew = false;
    try { R.ev('renderDrive();'); drew = (R.byId['app-content'].innerHTML || '').length > 50; } catch (e) {}
    ck('운행 화면이 그려진다', drew, true);
  }

  console.log('\n⑤ ★ 지워짐 막기 — 기사가 토글을 저장해도 남의 기록이 남나');
  {
    const FULL = { '1': { on: true, offOn: true }, '2': { on: true, offOn: true },
                   '3': { on: true, offOn: true } };
    /* 폰 명단은 자기 차량(1·2)만 · rideState 는 전체 셋 */
    const mine = ALL.filter((m) => m.carId === 'car1');
    const { R, wrote } = boot('driver', { carId: 'car1', members: mine, ride: FULL });
    await R.ev('saveRideStateFromMembers()');
    await new Promise((r) => setTimeout(r, 120));
    const w = (wrote.data || {}).rideState || {};
    ck('쓴 사람 수', Object.keys(w).length, 3);
    ck('★ 3호차 «회원»(3) 토글이 남았다', w['3'] ? '남음' : '사라짐', '남음');
    /* 대조 — 옛 판(v273)은 지웠다 */
    const OLD = E.SRC_OLD;
    const R2 = E.build({ src: OLD, biz: 'academy', localStorage: {
      ['tkd_members' + SUF]: JSON.stringify(mine), ['tkd_cars' + SUF]: JSON.stringify(CARS),
      ['tkd_courses' + SUF]: JSON.stringify(COURSES), ['tkd_ridestate' + SUF]: JSON.stringify(FULL),
      ['tkd_org' + SUF]: JSON.stringify({ name: '가온', bizType: 'academy' }) } });
    const w2 = {};
    R2.sandbox._firestore = R2.win._firestore = {
      doc: (db, c1, o, c2, k) => ({ key: k }), collection: () => ({}),
      getDoc: async () => ({ exists: () => false, data: () => ({}) }),
      setDoc: async (ref, d) => { w2[ref.key] = JSON.parse(d.value); },
      deleteDoc: async () => {}, getDocs: async () => ({ forEach: () => {} }),
      onSnapshot: () => (() => {})
    };
    R2.sandbox._db = R2.win._db = {}; R2.sandbox._userOrgId = 'cosroad_default';
    R2.ev("currentMode='driver';");
    R2.ev('members = loadMembers();');
    await R2.ev('saveRideStateFromMembers()');
    await new Promise((r) => setTimeout(r, 120));
    ck('(대조) 옛 판 v273 은 3호차 토글을 지웠다',
      (w2.rideState && w2.rideState['3']) ? '남음' : '사라짐', '사라짐');
  }

  console.log('\n⑥ 관리자는 사본 리스너를 안 붙인다 (원본이 깎이지 않게)');
  {
    const { R, listeners } = boot('admin', { carDocs: { car1: {}, car2: {}, car3: {} } });
    R.ev('startFirebaseListeners();');
    const keys = Object.keys(listeners);
    ck('carData 리스너 0개', keys.filter((k) => k.indexOf('carData/') === 0).join(',') || '없음', '없음');
    ck('members 리스너는 붙는다', keys.filter((k) => k.indexOf('data/members') === 0).length, 1);
    const { R: RD, listeners: LD } = boot('driver', { carId: 'car2', carDocs: { car2: {} } });
    RD.ev('startFirebaseListeners();');
    const kd = Object.keys(LD);
    ck('기사: 자기 carData 리스너 1개', kd.filter((k) => k === 'carData/car2').length, 1);
    ck('기사: members 리스너 0개', kd.filter((k) => k.indexOf('data/members') === 0).length, 0);
  }

  console.log('\n⑦ 관리자가 배정을 바꾸면 사본이 바로 다시 쓰인다');
  {
    const { R, wrote } = boot('admin', { carDocs: { car1: {}, car2: {}, car3: {} } });
    R.sandbox.showConfirmModal = (cb) => cb();
    R.ev("assignMemberToCar(2,'car3','both');");       /* 나여름 → 3호차 */
    await new Promise((r) => setTimeout(r, 150));
    const cd = wrote.carData || {};
    ck('1호차 사본에서 나여름이 빠졌다',
      ((cd.car1 || {}).members || []).map((m) => m.name).join(','), '가하은');
    ck('3호차 사본에 나여름이 들어왔다',
      ((cd.car3 || {}).members || []).map((m) => m.name).sort().join(','), '나여름,다가을');
  }

  console.log('\n⑧ 버전·범위');
  {
    const fs = require('fs');
    const NEW = E.SRC_NEW;
    ck('APP_VERSION 274', (NEW.match(/const APP_VERSION = (\d+);/) || [])[1], '274');
    const vj = process.env.COS_SRC_NEW_REF
      ? cp.execSync('git -C ' + COS_ROOT + ' show ' + process.env.COS_SRC_NEW_REF + ':version.json').toString()
      : fs.readFileSync('' + COS_ROOT + '/version.json', 'utf8');
    ck('version.json 274', JSON.parse(vj).version, 274);
    /* ★ v275: 범위의 **끝쪽도 못 박는다**(06e30f3 → 889fbec). 작업트리와 견주면
       v275 가 api/driver-auth.js 를 고친 것이 이 v274 기록에 거짓 실패로 들어온다. */
    const api = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only 06e30f3 '
      + (process.env.COS_SRC_NEW_REF || '') + ' -- api lib').toString().trim();
    ck('api/ · lib/ 무변경 (send-guard 그대로)', api || '(변경 없음)', '(변경 없음)');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 Firestore — 실제 쓰기 0 · 문자 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
