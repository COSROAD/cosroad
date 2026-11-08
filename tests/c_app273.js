/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v273 — 두 차량 칸(carIdDrop) + 차량관리 등원·하원 따로 배정.
   전: d26c93e (v272) · 새 쪽은 **이 회차 커밋**에 고정한다(없으면 작업트리).
   ★ 보는 것 ① dropCarOf/inCarEitherLeg/isDropOnly ② 빠른 배정 9가지 실측
             ③ 방향 따라 운행 목록 ④ 기사 범위 ⑤ 차량 삭제 ⑥ 옛 자료 그대로
   가짜 Firestore — 실제 쓰기 0. */
const cp = require('child_process');
/* ★ v274: 이 묶음은 **v273 회차 기록**이다 — 「새」쪽을 그 회차 커밋에 **고정**한다.
   전에는 일하는 폴더를 보았다. 그래서 v274 가 버전을 올리고 규칙을 고치자
   「APP_VERSION 273」·「규칙 0줄」이 거짓으로 깨졌다 — v273 이 틀린 것이 아니다.
   지금 코드는 d_app274.js·run274.js 가 본다. */
if (!process.env.COS_SRC_NEW_REF) process.env.COS_SRC_NEW_REF = '06e30f3';   /* v273 */
if (!process.env.COS_SRC_NEW && process.env.COS_SRC_NEW_REF) {
  const f = require('path').join(__dirname, 'pin273_index.html');
  require('fs').writeFileSync(f, cp.execSync(
    'git -C ' + COS_ROOT + ' show ' + process.env.COS_SRC_NEW_REF + ':index.html',
    { maxBuffer: 1 << 28 }));
  process.env.COS_SRC_NEW = f;
}
if (!process.env.COS_SRC_OLD_REF) process.env.COS_SRC_OLD_REF = 'd26c93e';   /* v272 */
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(50) + String(got).slice(0, 62)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const CARS = [{ id: 'car1', name: '1호차' }, { id: 'car2', name: '2호차' }, { id: 'car3', name: '3호차' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const DAYS7 = ['월', '화', '수', '목', '금', '토', '일'];
const SUF = '__cosroad_default';

function boot(biz, members, mode) {
  const store = {};
  store['tkd_cars' + SUF] = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify(COURSES);
  store['tkd_members' + SUF] = JSON.stringify(members || []);
  store['tkd_org' + SUF] = JSON.stringify({ name: '가온', icon: '🚐', bizType: biz,
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  const R = E.build({ src: E.SRC_NEW, biz: biz, localStorage: store });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-tabs', 'drive-screen', 'admin-screen', 'member-screen',
   'member-list', 'member-add-area', 'filter-chips', 'search-input', 'day-tabs', 'header-btns',
   'mode-badge', 'main-header', 'bottom-action', 'today-date', 'org-name-display', 'org-icon',
   'login-screen', 'main-app', 'fb-loading', 'sort-asc-btn', 'sort-desc-btn', 'modal-title',
   'edit-id', 'm-name', 'm-class', 'm-car', 'm-dropcar', 'm-phone', 'm-phone2', 'm-location',
   'm-note', 'm-addrdetail', 'm-droplocation', 'member-modal', 'wrap-dropcar', 'wrap-car',
   'wrap-class', 'wrap-classcar', 'member-addr-result', 'member-drop-result'].forEach((id) => {
    const el = E.makeEl('div'); el.id = id; R.byId[id] = el;
  });
  R.ev("currentMode='" + (mode || 'admin') + "';");
  R.sandbox._userOrgId = 'cosroad_default';
  R.sandbox._firestore = R.win._firestore = {
    doc: () => ({}), collection: () => ({}),
    getDoc: async () => ({ exists: () => false, data: () => ({}) }),
    setDoc: async () => {}, deleteDoc: async () => {},
    getDocs: async () => ({ forEach: () => {} }), onSnapshot: () => (() => {})
  };
  R.sandbox._db = R.win._db = {};
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return R;
}
const M = (over) => Object.assign({ id: 1, name: '가하은', carId: 'car1', courseId: 'c1',
  days: DAYS7, location: '인천 1', lat: 37.41, lon: 126.68,
  dropLocation: '인천 하차 1', dropLat: 37.42, dropLon: 126.69, on: true, offOn: true }, over || {});

console.log('════ 1. 공용 함수 — dropCarOf · inCarEitherLeg · isDropOnly');
{
  const R = boot('academy', [M()]);
  const f = (expr) => R.ev(expr);
  ck('칸 없음 → 등원 차량', f("dropCarOf({carId:'car1'})"), 'car1');
  ck('빈 값 → 등원 차량', f("dropCarOf({carId:'car1',carIdDrop:''})"), 'car1');
  ck('하원 2호차', f("dropCarOf({carId:'car1',carIdDrop:'car2'})"), 'car2');
  ck('등원·하원 둘 다 없음 → 빈 값', f("dropCarOf({})"), '');
  ck('등원으로 엮임', f("inCarEitherLeg({carId:'car1',carIdDrop:'car2'},'car1')"), true);
  ck('하원으로 엮임', f("inCarEitherLeg({carId:'car1',carIdDrop:'car2'},'car2')"), true);
  ck('3호차와는 안 엮임', f("inCarEitherLeg({carId:'car1',carIdDrop:'car2'},'car3')"), false);
  ck('하원만 2호차 → isDropOnly(car2)', f("isDropOnly({carId:'car1',carIdDrop:'car2'},'car2')"), true);
  ck('등원도 2호차면 isDropOnly 아님', f("isDropOnly({carId:'car2',carIdDrop:''},'car2')"), false);
  /* 물류·택배는 하원 개념이 없다 */
  const RL = boot('logistics', [M()]);
  ck('물류: carIdDrop 이 있어도 등원 차량', RL.ev("dropCarOf({carId:'car1',carIdDrop:'car2'})"), 'car1');
}

console.log('\n════ 2. 빠른 배정 9가지 — 전/후 실측 (학원)');
{
  const run = (start, fn) => {
    const R = boot('academy', [M(start)]);
    R.sandbox.showConfirmModal = (cb) => cb();   /* 해제는 확인창을 거친다 — 즉시 통과시킨다 */
    R.ev(fn);
    const m = R.ev('members[0]');
    return String(m.carId || '') + ' / ' + String(m.carIdDrop || '') + '  (하원=' + R.ev('dropCarOf(members[0])') + ')';
  };
  console.log('  ── 넣기 (3호차로)');
  ck('① 둘 다   (전 car1/빈)', run({}, "assignMemberToCar(1,'car3','both');"),
    'car3 /   (하원=car3)');
  ck('② 등원만  (전 car1/빈)', run({}, "assignMemberToCar(1,'car3','pickup');"),
    'car3 / car1  (하원=car1)');
  ck('③ 하원만  (전 car1/빈)', run({}, "assignMemberToCar(1,'car3','drop');"),
    'car1 / car3  (하원=car3)');
  console.log('  ── 넣기 (이미 갈린 «회원»: 등원 car1 · 하원 car2)');
  ck('④ 둘 다   → 하원도 따라온다', run({ carIdDrop: 'car2' }, "assignMemberToCar(1,'car3','both');"),
    'car3 /   (하원=car3)');
  ck('⑤ 등원만  → 하원 car2 그대로', run({ carIdDrop: 'car2' }, "assignMemberToCar(1,'car3','pickup');"),
    'car3 / car2  (하원=car2)');
  ck('⑥ 하원만  → 등원 car1 그대로', run({ carIdDrop: 'car2' }, "assignMemberToCar(1,'car3','drop');"),
    'car1 / car3  (하원=car3)');
  console.log('  ── 하원을 등원과 같은 차량으로 넣으면 **빈 값**이 된다');
  ck('⑦ 하원만 car1 (등원도 car1)', run({ carIdDrop: 'car2' }, "assignMemberToCar(1,'car1','drop');"),
    'car1 /   (하원=car1)');
  console.log('  ── 빼기 (1호차에서)');
  ck('⑧ 전체 해제 (전 car1/car2)', run({ carIdDrop: 'car2' }, "removeMemberFromCar(1,'both');"),
    ' /   (하원=)');
  ck('⑨ 등원 해제 (전 car1/빈) → 하원은 남는다',
    run({}, "removeMemberFromCar(1,'pickup');"), ' / car1  (하원=car1)');
  ck('⑩ 하원 해제 (전 car1/car2) → 등원과 같게',
    run({ carIdDrop: 'car2' }, "removeMemberFromCar(1,'drop');"), 'car1 /   (하원=car1)');
  console.log('  ── 물류·택배는 셋이 없다 (언제나 등원만 바뀐다)');
  const RL = boot('logistics', [M({ carIdDrop: 'car2' })]);
  RL.ev("assignMemberToCar(1,'car3','drop');");
  ck('물류: 하원만 골라도 등원이 바뀐다', String(RL.ev('members[0].carId')), 'car3');
}

console.log('\n════ 3. 운행 화면 — 방향 따라 (등원 car1 · 하원 car2 인 «회원»)');
{
  const R = boot('academy', [M({ id: 1, carIdDrop: 'car2' }), M({ id: 2, name: '나여름', carId: 'car2' })]);
  R.ev("currentCourseId='c1'; currentDay=DAYS[new Date().getDay()===0?6:new Date().getDay()-1];");
  const names = (carId, leg) => {
    R.ev("currentCarId='" + carId + "'; driveLeg='" + leg + "';");
    return (R.ev('getActiveStudents()') || []).map((x) => x.name).join(',') || '없음';
  };
  ck('1호차 · 등원 → 가하은', names('car1', 'pickup'), '가하은');
  ck('1호차 · 하원 → 없음 (하원은 2호차)', names('car1', 'dropoff'), '없음');
  ck('2호차 · 등원 → 나여름', names('car2', 'pickup'), '나여름');
  ck('2호차 · 하원 → 나여름,가하은 둘', names('car2', 'dropoff').split(',').sort().join(','), '가하은,나여름');
}

console.log('\n════ 4. 기사 범위 — 등원·하원 어느 쪽이든 내 차량이면');
{
  const R = boot('academy', [M({ id: 1, carIdDrop: 'car2' }), M({ id: 2, name: '나여름', carId: 'car3' })], 'driver');
  R.sandbox._isDriverAcct = true; R.sandbox._driverCarId = 'car2';
  R.ev("window._driverCarId='car2';");
  const got = (R.ev('driverScopeMembers(members)') || []).map((x) => x.name).join(',');
  ck('2호차 기사 → 하원만 2호차인 가하은이 보인다', got, '가하은');
  R.sandbox._driverCarId = 'car3'; R.ev("window._driverCarId='car3';");
  ck('3호차 기사 → 나여름만', (R.ev('driverScopeMembers(members)') || []).map((x) => x.name).join(','), '나여름');
}

console.log('\n════ 5. 차량 삭제 — carIdDrop 도 비워진다');
{
  const R = boot('academy', [M({ id: 1, carIdDrop: 'car2' })]);
  R.ev('currentCarTab=1;');                       /* car2 탭 */
  R.sandbox.showConfirmModal = (fn) => fn();      /* 확인창 즉시 통과 */
  R.ev('deleteCurrentCar();');
  const m = R.ev('members[0]');
  ck('하원이던 car2 를 지우면 carIdDrop 이 빈다', String(m.carIdDrop || ''), '');
  ck('등원 car1 은 그대로', String(m.carId || ''), 'car1');
  ck('차량이 둘 남았다', R.ev('cars.length'), 2);
}

console.log('\n════ 6. 옛 자료(칸 없음) — v272 와 같이 움직인다');
{
  const OLD = boot('academy', [M()]);               /* carIdDrop 아예 없음 */
  OLD.ev("currentCourseId='c1'; currentDay=DAYS[new Date().getDay()===0?6:new Date().getDay()-1]; currentCarId='car1';");
  OLD.ev("driveLeg='pickup';");
  const p = (OLD.ev('getActiveStudents()') || []).map((x) => x.name).join(',');
  OLD.ev("driveLeg='dropoff';");
  const d = (OLD.ev('getActiveStudents()') || []).map((x) => x.name).join(',');
  ck('등원에 나온다', p, '가하은');
  ck('하원에도 **그대로** 나온다 (한 대로 다닌다)', d, '가하은');
  ck('carIdDrop 은 여전히 없다', String(OLD.ev('members[0].carIdDrop') === undefined), 'true');
}

console.log('\n════ 7. 버전·범위');
{
  const fs = require('fs');
  const NEW = E.SRC_NEW;
  const av = (NEW.match(/const APP_VERSION = (\d+);/) || [])[1];
  ck('APP_VERSION 273', av, '273');
  /* ★ `git show :version.json` 은 **스테이징**을 읽어 커밋 전에는 옛 값이 나온다 —
     일하는 폴더(또는 고정한 커밋)를 읽는다. */
  const vjSrc = process.env.COS_SRC_NEW_REF
    ? cp.execSync('git -C ' + COS_ROOT + ' show ' + process.env.COS_SRC_NEW_REF + ':version.json').toString()
    : fs.readFileSync('' + COS_ROOT + '/version.json', 'utf8');
  ck('version.json 273', JSON.parse(vjSrc).version, 273);
  /* ★ v274: 범위는 **v272→v273 두 커밋 사이**다(일하는 폴더까지 재면 뒤 회차가 섞인다) */
  const rules = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat d26c93e '
    + process.env.COS_SRC_NEW_REF + ' -- firestore.rules')
    .toString().trim();
  ck('firestore.rules 0줄', rules || '(변경 없음)', '(변경 없음)');
  const api = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only d26c93e '
    + process.env.COS_SRC_NEW_REF + ' -- api lib')
    .toString().trim().split('\n').filter(Boolean);
  ck('api/ 는 안 건드리고 lib/send-guard.js 만', api.join(','), 'lib/send-guard.js');
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
  : '✔ ' + pass + '/' + pass + ' 전부 통과'));
console.log('※ 가짜 Firestore — 실제 쓰기 0 · 문자 0');
process.exit(fail ? 1 : 0);
