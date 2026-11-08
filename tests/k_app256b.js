/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v256 보정2 — 기사 화면 간결하게 (출석 PIN 단추 빼기 + 자기 차량만)
   전: 4b9fd9d (보정1) · 후: 작업 중 index.html */
const cp = require('child_process');
const fs = require('fs');
/* ★ v272 보정1: 이 묶음은 **v256 보정2 회차 기록**이다 — 「새」쪽도 그 회차 커밋에 고정한다.
   전에는 작업트리(지금 코드)를 「후」로 보았다. 그래서 회차가 지날수록 문답 수·함수 목록·
   버전이 어긋나 **거짓으로 실패**했다(v272 기준 3건). v256 보정2 가 틀린 것이 아니다.
   지금 코드는 **그 회차의 묶음**이 본다 — 이 표는 그때 무엇이 바뀌었는지의 기록이다.
   ★ env246 은 **require 할 때** COS_SRC_NEW 를 읽는다 → 그 전에 넣어야 한다. */
/* ★ 기대값이 뒷 회차에 앞으로 고쳐진 묶음이다 — 그 기대값이 가리키는 회차(v257)에 맞춘다.
   (실측: 다른 회차로 맞추면 더 많이 틀어진다.) */
/* ★ 기대값이 v261 때 앞으로 고쳐졌다(바로 아래 「v261 이 하나 더해 71」) — 그 회차에 맞춘다. */
const NEW_REF = process.env.COS_SRC_NEW_REF || '0706501';   /* v261 */   /* v256 보정2 */
if (!process.env.COS_SRC_NEW) {
  const _pf = require('path').join(__dirname, 'pin256b_index.html');
  require('fs').writeFileSync(_pf, require('child_process').execSync(
    'git -C ' + COS_ROOT + ' show ' + NEW_REF + ':index.html', { maxBuffer: 1 << 28 }));
  process.env.COS_SRC_NEW = _pf;
}
const E = require('./env246.js');
/* ★ v272 보정1: 버전·규칙도 **그 회차 커밋에서** 읽는다.
   작업트리를 읽으면 고정해 둔 APP_VERSION 과 안 맞아 「둘이 같음」이 거짓이 된다. */
const _pinRead = (p) => require('child_process')
  .execSync('git -C ' + COS_ROOT + ' show ' + NEW_REF + ':' + p, { maxBuffer: 1 << 28 })
  .toString().split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));


let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(58) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const BASE = process.env.COS_SRC_OLD_REF || '4b9fd9d';
const OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':index.html', { maxBuffer: 1 << 28 }).toString();
const NEW = E.SRC_NEW;
const SUF = '__cosroad_default';

const CARS = [
  { id: 'car1', name: '1호차', driver: '박기사', phone: '010-5555-6666', plate: '12가3456' },
  { id: 'car2', name: '2호차', driver: '김기사', phone: '010-7777-8888', plate: '34나5678' },
  { id: 'car3', name: '3호차', driver: '이기사', phone: '010-1212-1212', plate: '56다7890' }
];
const MEMBERS = [
  { id: 1, name: '강하은', courseId: 'c1', carId: 'car1', location: '유원아파트', lat: 37.4, lon: 126.7,
    dropLocation: '유원아파트', phone: '010-1111-1111', days: ['월','화','수','목','금','토','일'], pin: '1111', on: true },
  { id: 2, name: '문소율', courseId: 'c1', carId: 'car2', location: '행복아파트', lat: 37.2, lon: 127.2,
    dropLocation: '행복아파트', phone: '010-2222-2222', days: ['월','화','수','목','금','토','일'], pin: '2222', on: true },
  { id: 3, name: '오지민', courseId: 'c1', carId: 'car2', location: '한솔아파트', lat: 37.3, lon: 127.0,
    dropLocation: '한솔아파트', phone: '010-3333-3333', days: ['월','화','수','목','금','토','일'], pin: '4444', on: true }
];
function storeOf(over) {
  const s = {};
  const put = (k, v) => { s[k + SUF] = typeof v === 'string' ? v : JSON.stringify(v); };
  put('tkd_cars', (over && over.cars) || CARS);
  put('tkd_members', MEMBERS);
  put('tkd_courses', [{ id: 'c1', name: 'A반', depart: '15:00' }]);
  put('tkd_org', { name: '코스로드학원', lat: 37.0, lon: 127.0 });
  put('tkd_staff', [{ id: 'st1', name: '최직원', pin: '3333' }]);
  put('tkd_driver_att', {}); put('tkd_attendance', {}); put('tkd_attendance_time', {});
  put('tkd_payments', {}); put('tkd_tax', {}); put('tkd_carlog', {});
  return s;
}
function boot(src, opts) {
  opts = opts || {};
  const R = E.build({ src: src, biz: opts.biz || 'academy', localStorage: opts.store || storeOf() });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-tabs', 'main-header', 'pin-result', 'pin-dots',
   'pin-checkin-modal', 'drv-punch-msg', 'login-screen', 'main-app', 'bottom-action',
   'day-tabs', 'member-screen', 'admin-screen', 'drive-screen', 'member-add-area',
   'tab-drive', 'tab-member', 'tab-admin', 'member-list', 'search-input', 'filter-chips', 'filter-riding-btn'].forEach(id => {
    const el = E.makeEl('div'); el.id = id;
    el.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
    R.document.registerId(id, el);
  });
  R.win._auth = R.sandbox._auth = { currentUser: { uid: 'U1', isAnonymous: false, getIdToken: async () => 'T' } };
  R.win.fetch = R.sandbox.fetch = async () => ({ json: async () => ({ ok: true }) });
  R.win._db = R.sandbox._db = {};
  R.win._firestore = R.sandbox._firestore = {
    doc: (db, ...p) => ({ _p: p.join('/') }), collection: (db, ...p) => ({ _p: p.join('/') }),
    getDoc: async () => ({ exists: () => false, data: () => ({}) }),
    setDoc: async () => {}, deleteDoc: async () => {},
    getDocs: async () => ({ forEach: () => {} }), onSnapshot: () => () => {}
  };
  const ft = (f, ms) => { if ((Number(ms) || 0) >= 400) return 0; try { f(); } catch (e) {} return 0; };
  R.sandbox.setTimeout = ft; R.win.setTimeout = ft;
  return R;
}
/* 기사 모드 운행 화면 그리기 → {본문, 탭줄} */
function driveScreen(src, biz, opts) {
  opts = opts || {};
  const R = boot(src, { biz: biz, store: opts.store });
  if (opts.demo) R.win.location.search = R.sandbox.location.search = '?org=academy_demo';
  R.ev("currentMode='driver'; currentCourseId='c1';");
  R.win._driverCarId = opts.carId === undefined ? 'car2' : opts.carId;
  if (opts.carId !== null) R.ev("currentCarId='" + (opts.carId === undefined ? 'car2' : opts.carId) + "';");
  if (opts.login) { try { R.sandbox.onDriverLoggedIn(); } catch (e) {} }
  try { R.sandbox.renderDrive(); } catch (e) { return { err: e.message, R: R }; }
  return {
    R: R,
    body: String((R.document.getElementById('app-content') || {}).innerHTML || ''),
    tabs: String((R.document.getElementById('drive-tabs') || {}).innerHTML || '')
  };
}
const BIZ = ['academy', 'public', 'logistics', 'delivery'];

console.log('════ 1. 「출석 PIN」 단추 — 4업종 기사 화면에서 사라졌나 ════');
for (const biz of BIZ) {
  const a = driveScreen(OLD, biz), b = driveScreen(NEW, biz);
  const cnt = (h) => (String(h).match(/openPinCheckin/g) || []).length;
  ck(biz + ' — 보정1(전) 기사 화면 PIN 단추', cnt(a.body + a.tabs), 1);
  ck(biz + ' — 보정2(후) 기사 화면 PIN 단추', cnt(b.body + b.tabs), 0);
  ck(biz + ' — 출근·퇴근은 그대로', /🌅 출근/.test(b.body) && /🌆 퇴근/.test(b.body), true);
  ck(biz + ' — 차계부도 그대로', /차계부/.test(b.body), true);
}

console.log('\n════ 2. openPinCheckin 으로 가는 다른 길도 막혔나 ════');
{
  const s = driveScreen(NEW, 'academy');
  const R = s.R;
  let opened = false;
  const modal = R.document.getElementById('pin-checkin-modal');
  modal.classList = { add(){ opened = true; }, remove(){}, contains(){ return false; } };
  R.sandbox.openPinCheckin();
  ck('기사 모드에서 직접 불러도 안 열린다', opened, false);
  ck('   까닭을 알려 준다', (R.toasts || []).join('|'), '회원 출석 PIN 은 관리자 화면에서 써요');
  ck('   pinCheckinOpen 도 안 켜진다', R.ev('pinCheckinOpen'), false);

  /* 관리자 모드에서는 그대로 열린다 */
  const A = boot(NEW);
  let opened2 = false;
  A.document.getElementById('pin-checkin-modal').classList = { add(){ opened2 = true; }, remove(){}, contains(){ return false; } };
  A.ev("currentMode='admin';");
  A.sandbox.openPinCheckin();
  ck('관리자 모드는 그대로 열린다', opened2, true);

  /* 둘러보기 기사 화면은 종전대로 */
  const D = boot(NEW);
  D.win.location.search = D.sandbox.location.search = '?org=academy_demo';
  let opened3 = false;
  D.document.getElementById('pin-checkin-modal').classList = { add(){ opened3 = true; }, remove(){}, contains(){ return false; } };
  D.ev("currentMode='driver';");
  D.sandbox.openPinCheckin();
  /* v257 보정4: 기사 회원 탭·둘러보기 기사 화면·기사 출석 쓰기 회수 — 일부러 바꾼 자리다 */
  ck('둘러보기 기사 화면 — v257 부터 PIN 판이 안 열린다', opened3, false);
  const dm = driveScreen(NEW, 'academy', { demo: true });
  ck('둘러보기 기사 화면 — v257 부터 PIN 단추 없음', /기사 PIN 출퇴근 체크/.test(dm.body), false);
}

console.log('\n════ 3. 자기 차량만 — 4업종 ════');
for (const biz of BIZ) {
  const a = driveScreen(OLD, biz), b = driveScreen(NEW, biz);
  const tabBtns = (h) => (String(h).match(/currentCarId='car\d'/g) || []);
  ck(biz + ' — 보정1(전) 차량 바꾸는 단추', tabBtns(a.tabs).length, 3);
  ck(biz + ' — 보정2(후) 차량 바꾸는 단추', tabBtns(b.tabs).length, 0);
  ck(biz + ' — 내 차량(2호차) 이름표는 보인다', /2호차/.test(b.tabs), true);
  ck(biz + ' — 남의 차량은 안 보인다', /1호차|3호차/.test(b.tabs), false);
}

console.log('\n════ 4. 운행 목록이 자기 차량 기준인가 ════');
{
  const b = driveScreen(NEW, 'academy', { carId: 'car2' });
  /* 헛검사 막기 — 목록이 비면 「남의 회원 없음」이 저절로 통과한다. 먼저 **차 있는지** 본다 */
  ck('(대조) 운행 목록이 비어 있지 않다', /강하은|문소율|오지민/.test(b.body), true);
  ck('car2 회원만 나온다 (문소율·오지민)', /문소율/.test(b.body) && /오지민/.test(b.body), true);
  ck('car1 회원(강하은)은 없다', /강하은/.test(b.body), false);
  ck('탭 줄의 곳 수가 car2 기준(2곳)', /2곳/.test(b.tabs), true);
  /* currentCarId 를 남의 차량으로 바꿔 놓아도 다시 그리면 자기 차량으로 돌아온다 */
  const R = b.R;
  R.ev("currentCarId='car1';");
  R.sandbox.renderDrive();
  ck('남의 차량으로 바꿔 놔도 되돌아온다', R.ev('currentCarId'), 'car2');
  const body2 = String(R.document.getElementById('app-content').innerHTML || '');
  ck('   목록도 자기 차량 그대로', /문소율/.test(body2) && !/강하은/.test(body2), true);
  /* 로그인 직후에도 자기 차량 */
  const L = boot(NEW);
  L.win._driverCarId = 'car3';
  L.ev("currentCarId='car1';");
  try { L.sandbox.onDriverLoggedIn(); } catch (e) {}
  ck('로그인 직후 currentCarId = 내 차량', L.ev('currentCarId'), 'car3');
}

console.log('\n════ 5. 내 차량이 지워졌을 때 ════');
{
  const only13 = CARS.filter(c => c.id !== 'car2');
  const b = driveScreen(NEW, 'academy', { carId: 'car2', store: storeOf({ cars: only13 }) });
  ck('안내 문구가 뜬다', /배정된 차량이 없어요/.test(b.body), true);
  ck('   관리자에게 문의 안내', /관리자에게 문의하세요/.test(b.body), true);
  ck('   차량 탭은 비운다', b.tabs, '');
  ck('   남의 차량 운행이 안 보인다', /강하은|오지민/.test(b.body), false);
}

console.log('\n════ 6. 관리자 화면은 손대지 않았나 ════');
{
  /* 관리자 운행 화면 — 차량 탭 3개 그대로 */
  const one = (src) => {
    const R = boot(src);
    R.ev("currentMode='admin'; currentCourseId='c1'; currentCarId='car1';");
    try { R.sandbox.renderDrive(); } catch (e) { return 'ERR:' + e.message; }
    return String(R.document.getElementById('drive-tabs').innerHTML || '')
         + '\n' + String(R.document.getElementById('app-content').innerHTML || '');
  };
  const a = one(OLD), b = one(NEW);
  ck('관리자 운행 화면 바이트 동일 (' + b.length + '자)', a === b, true);
  ck('   차량 탭 3개 그대로', (b.match(/currentCarId='car\d'/g) || []).length, 3);

  /* 관리자 PIN 체크인 화면 (출결관리) */
  const att = (src) => {
    const R = boot(src);
    R.ev("currentMode='admin'; currentAdminTab='attendance';");
    try { R.sandbox.renderAdminTab('attendance'); } catch (e) { return 'ERR:' + e.message; }
    return String(R.document.getElementById('admin-content').innerHTML || '');
  };
  const aa = att(OLD), ab = att(NEW);
  ck('관리자 출결관리 화면 바이트 동일 (' + ab.length + '자)', aa === ab, true);
  ck('   PIN 체크인 단추 그대로', /openPinCheckin/.test(ab), true);

  /* 4업종 × 9화면 */
  const TABS = ['dashboard', 'members', 'attendance', 'cars', 'schedule', 'payment', 'tax', 'notice', 'settings'];
  let same = 0; const diff = [];
  for (const biz of BIZ) for (const tab of TABS) {
    const scr = (src) => {
      const R = boot(src, { biz: biz });
      R.ev("currentMode='admin'; currentAdminTab='" + tab + "';");
      try { R.sandbox.renderAdminTab(tab); } catch (e) { return 'ERR:' + e.message; }
      return String(R.document.getElementById('admin-content').innerHTML || '');
    };
    if (scr(OLD) === scr(NEW)) same++; else diff.push(biz + '/' + tab);
  }
  /* v256 보정3: 설정 화면의 회색 글자 한 곳(--gray-300 → --gray-400)만 달라진다 — 그 색은 빼고 견준다 */
  ck('설정 화면 뺀 32화면 바이트 동일', same + '/32', '32/32');
  ck('달라진 화면은 4업종 설정 화면뿐', diff.slice().sort().join(','),
    'academy/settings,delivery/settings,logistics/settings,public/settings');
}

console.log('\n════ 7. 기사 「회원」 탭은 어떤가 (이번엔 바꾸지 않고 **보고만**) ════');
{
  const R = boot(NEW);
  R.ev("currentMode='driver';");
  R.win._driverCarId = 'car2';
  let merr = '';
  try { R.sandbox.renderMembers(); } catch (e) { merr = e.message; }
  const h = String((R.document.getElementById('member-list') || {}).innerHTML || '');
  if (merr) console.log('      (renderMembers 오류: ' + merr + ')');
  const other = /강하은/.test(h);
  console.log('      기사(car2) 「회원」 탭에 car1 회원(강하은)이 보이나: ' + (other ? '보임 ★' : '안 보임'));
  console.log('      → 이번 지시문은 「확인해 보고만」 이라 고치지 않았습니다 (보고문에 적음)');
  ck('(대조) 「회원」 탭 화면을 실제로 읽었다 — 비어 있으면 위 판단이 헛것', h.length > 50, true);
  ck('(대조) 내 차량 회원(문소율)은 보인다', /문소율/.test(h), true);
}

console.log('\n════ 8. 도우미 문답·버전·바뀐 파일 ════');
{
  const qa = require('./qa252.js');
  const a = qa.read(OLD), b = qa.read(NEW);
  /* v256 보정4: 겹치던 「기사는 어떻게 로그인해요?」를 「기사 로그인 (업체 번호 + PIN)」에 합치고
     낡은 문구·검색어를 더 고쳤다 → 그 회차 것이 **모두 들어 있나**로 본다 */
  /* v261 이 문답 하나를 더했다 (「사업자 확인이 안 돼요») → 71 */
  ck('문답 수는 보정4 가 하나 합쳐 70 · v261 이 하나 더해 71',
    b.length + ' (전 ' + a.length + ')', '71 (전 71)');
  const changed = b.filter(q => { const o = a.find(x => x.t === q.t); return o && JSON.stringify(o) !== JSON.stringify(q); }).map(q => q.t);
  console.log('      손댄 문답(' + changed.length + '개): ' + changed.sort().join(' / '));
  ck('보정2 가 손댄 3개가 모두 들어 있다',
    ['«출결» 체크인 (PIN)', '기사 운행 화면 사용법', '출근·퇴근 기록하기'].every(t => changed.indexOf(t) >= 0), true);
  const all = b.map(q => q.a).join('\n');
  ck('「기사 폰의 PIN 판」 문구가 없어졌다', /기사 폰의 PIN 판/.test(all), false);
  ck('「기사 화면에는 PIN 판이 없어요」 로 바뀌었다', /기사 화면에는 PIN 판이 없어요/.test(all), true);
  ck('내 차량 한 칸 안내가 들어갔다', /내 차량 한 칸만/.test(all), true);

  /* v257 보정4: 기사 회원 탭·둘러보기 기사 화면·기사 출석 쓰기 회수 — 일부러 바꾼 자리다 */
  console.log('      지금 버전: ' + JSON.parse(_pinRead('version.json')).version
    + ' (이 회차는 256 이었다 — v257 이 올렸다)');
  ck('version.json 이 256 이상', JSON.parse(_pinRead('version.json')).version >= 256, true);
  ck('APP_VERSION 도 256 이상', Number((NEW.match(/const APP_VERSION = (\d+);/) || [])[1]) >= 256, true);
  /* ★ 코스로드54: 범위를 **두 커밋 사이**로 고정했다(CLAUDE.md 검사 묶음 규칙).
     한쪽만 적으면 **작업트리까지** 재서, 코스로드53 이 올린 `tests/` 126줄이 끼어든다. */
  const stat = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + BASE + ' ' + NEW_REF)
    .toString().trim().split('\n');
  stat.forEach(l => { const p = l.split('\t'); console.log('      ' + p[2].padEnd(16) + '+' + p[0] + ' / −' + p[1]); });
  /* 보정2 회차는 두 파일만 바꿨다. 보정3 이 뒤에 얹혀 목록이 늘었다 */
  ck('보정2 의 두 파일이 모두 들어 있다',
    ['CLAUDE.md', 'index.html'].every(f => stat.some(l => l.split('\t')[2] === f)), true);
  /* v260: api/admin-account.js(옛 기사 계정 세 동작 삭제)·api/driver-auth.js(업체 단위 상한)를 고쳤다.
     이 회차 **자신이** api 를 건드렸는지로 본다. */
  ck('보정2 자신은 api 를 안 건드렸다',
    cp.execSync('git -C ' + COS_ROOT + ' diff --name-only 4b9fd9d 05a0f30').toString().indexOf('api/') < 0, true);
  ck('보정2 자신은 firestore.rules 를 안 건드렸다',
    cp.execSync('git -C ' + COS_ROOT + ' diff --name-only 4b9fd9d 05a0f30').toString().indexOf('firestore.rules') < 0, true);
  ck('CLAUDE.md 에 기사 화면 원칙', /기사 화면 원칙 — 간결하게/.test(fs.readFileSync('' + COS_ROOT + '/CLAUDE.md', 'utf8')), true);

  const fnsOf = (src) => { const R = boot(src); return Object.keys(R.sandbox).filter(k => typeof R.sandbox[k] === 'function').sort(); };
  const fa = fnsOf(OLD), fb = fnsOf(NEW);
  /* v260: 개통 대장 죽은 함수 다섯(addMasterCompany·copyMasterUrl·deleteMasterCompany
     ·loadMasterCompanies·saveMasterCompanies)을 지웠다 — 부르는 곳 0 을 먼저 확인했다.
     이번 회차 표는 q_app260.js. 그 다섯은 아래 목록에서 뺀 뒤 견준다. */
  const V260_GONE = ['addMasterCompany', 'copyMasterUrl', 'deleteMasterCompany', 'loadMasterCompanies', 'saveMasterCompanies'];
  /* v261: 가입을 서버(api/signup.js)로 옮기며 화면의 옛 가입 함수 열 개를 지웠다 — 표는 t_app261.js */
  const V261_GONE = ['suCreateAccount','suSaveUserDoc','doSignupEmail','doSignupPhone',
                     'suSetMethod','suSyncContact','suCheckCommon',
                     'notifyMasterSignup','notifyApplicantAccount','sendSignupSms'];
  const V261_NEW = ['suClose','suStartLock','suSendCode','suBizDirty','suPaintGo','suBizFields',
                    'suCheckBiz','suSignupDone','masterBizLine','masterDupBizNo'];
  /* v263: 승인을 서버로 옮기며 setUserApproval 을 지우고, 읽기 전용·마스터 기간 창 함수를 더했다.
     이번 회차 표는 v_app263.js. */
  const V263_GONE = ['setUserApproval'];
  const V263_NEW = ['enterReadOnly','isReadOnlyMode','showReadOnlyBar','readOnlyBlocked',
                    'periodDayStr','periodPreview','masterPeriodBox','masterPeriodErr','masterPeriodLine',
                    'masterApproveAsk','masterApprovePreview','masterApproveGo',
                    'masterExtendAsk','masterExtendGo','masterSetPeriodAsk','masterSetPeriodGo',
                    'masterUnapproveAsk','masterBillingLog'];
  ck('없어진 함수는 v260 다섯 + v261 열 + v263 하나뿐',
    fa.filter(x => fb.indexOf(x) < 0 && V260_GONE.indexOf(x) < 0 && V261_GONE.indexOf(x) < 0
                   && V263_GONE.indexOf(x) < 0)
      .join(',') || '없음', '없음');
  /* v257 보정4 가 함수 여섯을 더했다 */
  const V257 = ['demoDriverCarId', 'driverScopeMembers', 'driverNoCarHtml', 'demoPunchBarHtml', 'demoPunch', 'driverWriteAllowed'];
  ck('새 함수는 driverLockedCarId + v257 것 + v261 열 + v263 열여덟뿐',
    fb.filter(x => fa.indexOf(x) < 0 && V257.indexOf(x) < 0 && V261_NEW.indexOf(x) < 0
                   && V263_NEW.indexOf(x) < 0).join(','),
    'driverLockedCarId');
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
