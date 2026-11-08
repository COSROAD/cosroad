/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v258 보정5 — 기사 출석 읽기 회수 · 차량 없는 기사 운행 화면 · 옛 기사 로그인 문구
   전: 4ac625b (v257) · 후: 작업 중 */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 74)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const BASE = process.env.COS_SRC_OLD_REF || '4ac625b';                  /* v257 */
/* ★ v272: 「새」쪽도 **이 회차 커밋에 고정**한다 (v258 = 76224a8).
   전에는 새 쪽이 **일하는 폴더**(지금 코드)였다. 그래서 이 묶음은 v258 의 기록이면서도
   회차가 지날수록 틀려졌다 — v272 가 기사 읽기 키를 10→9 로 줄이자(`notices` 빼고
   `org`→`orgDriver`) 「10키」·「리스너 18개」가 다 깨져 **9건 실패**로 떴다.
   그 9건은 전부 v258 의 못 박은 기대값이고, v272 가 깨뜨린 것이 아니다
   (v271 기준으로 돌려도 5건이 같은 이유로 떴다 — 대조 확인).
   ★ 아래 SERVER_DRIVER_OK 도 **v258 당시의 10키**다. 실제 규칙을 읽는 것이 아니라
     손으로 적은 목록이라, 지금 규칙이 무엇을 허락하는지는 이 묶음으로 알 수 없다.
     지금 규칙은 에뮬레이터(rulestest/t272.mjs)가 본다 — 그쪽이 진짜다. */
const NEW_REF = process.env.COS_SRC_NEW_REF || '76224a8';               /* v258 */
const show = (f) => cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':' + f, { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const now = (f) => cp.execSync('git -C ' + COS_ROOT + ' show ' + NEW_REF + ':' + f, { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const OLD = show('index.html'), NEW = now('index.html');
const BIZ = ['academy', 'public', 'logistics', 'delivery'];

const SUF = '__cosroad_default';
const DAYS7 = ['월', '화', '수', '목', '금', '토', '일'];
function storeOf() {
  const st = {};
  const put = (k, v) => {
    st[k + SUF] = JSON.stringify(v);
    BIZ.forEach(o => { st[k + '__' + o + '_demo'] = JSON.stringify(v); });
  };
  put('tkd_cars', [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-5555-6666' },
                   { id: 'car2', name: '2호차', driver: '최기사', phone: '010-7777-8888' }]);
  put('tkd_members', [
    { id: 1, name: '가하은', courseId: 'c1', carId: 'car1', location: '유원아파트', lat: 37.40, lon: 126.70, phone: '010-1111-1111', days: DAYS7, pin: '1111', on: true },
    { id: 2, name: '나여름', courseId: 'c1', carId: 'car1', location: '송도동 1', lat: 37.39, lon: 126.65, phone: '010-2222-2222', days: DAYS7, pin: '2222', on: true },
    { id: 3, name: '다겨울', courseId: 'c2', carId: 'car2', location: '연수구 2', lat: 37.41, lon: 126.69, phone: '010-3333-3333', days: DAYS7, pin: '3333', on: true }]);
  put('tkd_courses', [{ id: 'c1', name: 'A반', depart: '15:00' }, { id: 'c2', name: 'B반', depart: '16:00' }]);
  put('tkd_org', { name: '코스로드학원', lat: 37.4, lon: 126.7 });
  put('tkd_staff', []); put('tkd_driver_att', {});
  put('tkd_attendance', { '2026-11-02': { 1: 'present' } });
  put('tkd_attendance_time', { '2026-11-02': { 1: '08:30' } });
  put('tkd_payments', {}); put('tkd_tax', {}); put('tkd_carlog', {});
  return st;
}
/* 서버는 **기사 읽기 10키만** 내려 준다고 흉내 낸다 — 그 밖을 부르면 permission-denied */
const SERVER_DRIVER_OK = ['members', 'cars', 'courses', 'org', 'notices', 'rideState',
                          'carlog', 'deliveryDone', 'dropoffDone', 'driverAtt'];
function boot(src, biz, opt) {
  opt = opt || {};
  const R = E.build({ src: src || NEW, biz: biz || 'academy', localStorage: storeOf() });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-tabs', 'main-header', 'member-screen', 'member-list',
   'member-add-area', 'filter-chips', 'search-input', 'day-tabs', 'header-btns', 'mode-badge',
   'drive-screen', 'admin-screen', 'bottom-action', 'drv-punch-msg', 'pin-result', 'pin-dots',
   'pin-checkin-modal', 'sort-asc-btn', 'sort-desc-btn', 'fb-loading', 'login-err',
   'today-date', 'org-name-display', 'org-icon',
   'login-screen', 'main-app', 'demo-enter-box', 'helper-btn'].forEach(id => {
    const el = E.makeEl('div'); el.id = id;
    el.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
    R.document.registerId(id, el);
  });
  if (opt.search) R.win.location.search = R.sandbox.location.search = opt.search;
  R.win._auth = R.sandbox._auth = { currentUser: { uid: 'drv_x', isAnonymous: false, getIdToken: async () => 'T' } };
  R.win._db = R.sandbox._db = {};
  R.got = [];       /* 서버에 **실제로 요청한** 키 */
  R.listen = [];    /* 리스너를 **실제로 붙인** 키 */
  R.denied = [];    /* 규칙이 거부한 요청 (permission-denied) */
  const keyOf = (p) => String(p || '').split('/').pop();
  R.win._firestore = R.sandbox._firestore = {
    doc: (db, ...p) => ({ _p: p.join('/') }), collection: (db, ...p) => ({ _p: p.join('/') }),
    getDoc: async (ref) => {
      const k = keyOf(ref._p);
      R.got.push(k);
      if (opt.asDriver && SERVER_DRIVER_OK.indexOf(k) < 0) {
        R.denied.push(k);
        const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e;
      }
      return { exists: () => false, data: () => ({}) };
    },
    setDoc: async () => {}, deleteDoc: async () => {},
    getDocs: async () => ({ forEach: () => {} }),
    onSnapshot: (ref, cb, err) => {
      const k = keyOf(ref._p);
      R.listen.push(k);
      if (opt.asDriver && SERVER_DRIVER_OK.indexOf(k) < 0) {
        R.denied.push(k);
        try { if (err) err({ code: 'permission-denied' }); } catch (e) {}
      }
      return () => {};
    }
  };
  R.win.fetch = R.sandbox.fetch = async () => ({ json: async () => ({ ok: false }) });
  return R;
}
const settle = (n) => new Promise(r => setTimeout(r, n));

console.log('════ 1. 버전 ════');
/* v259 가 버전을 올렸다 — 이 회차는 258 이었다 */
console.log('      지금 버전: ' + JSON.parse(now('version.json')).version + ' (이 회차는 258 이었다)');
ck('version.json 이 258 이상', JSON.parse(now('version.json')).version >= 258, true);
ck('APP_VERSION 도 258 이상', Number((NEW.match(/const APP_VERSION = (\d+);/) || [])[1]) >= 258, true);
ck('   version.json 모양 그대로 (줄바꿈 없음)', /^\{"version": \d+\}$/.test(now('version.json')), true);

console.log('\n════ 2. 읽기 목록 — 규칙과 앱이 같은 10키 ════');
{
  const appOf = (src) => ((src.match(/var DRIVER_READ_KEYS = \[([\s\S]*?)\];/) || [])[1] || '')
    .replace(/['\s]/g, '').split(',').filter(Boolean);
  const ruleOf = (src) => ((src.match(/function driverReadableKey\(key\) \{\s*return key in \[([\s\S]*?)\];/) || [])[1] || '')
    .replace(/['\s]/g, '').split(',').filter(Boolean);
  const a = appOf(NEW), r = ruleOf(now('firestore.rules'));
  ck('앱 DRIVER_READ_KEYS 10키', a.length + ' — ' + a.join(','),
    '10 — members,cars,courses,org,notices,rideState,carlog,deliveryDone,dropoffDone,driverAtt');
  ck('규칙 driverReadableKey 10키', r.length, 10);
  ck('   두 목록이 글자까지 같다', a.slice().sort().join(',') === r.slice().sort().join(','), true);
  ck('   attendance·attendanceTime 이 둘 다 빠졌다',
    a.concat(r).filter(k => /^attendance/.test(k)).join(',') || '없음', '없음');
  /* 대조 — 옛 판에는 12키였고 둘이 들어 있었다 */
  const ao = appOf(OLD), ro = ruleOf(show('firestore.rules'));
  ck('(대조) 옛 판 앱 12키 · 출석 둘 있었다',
    ao.length + '/' + ao.filter(k => /^attendance/.test(k)).length, '12/2');
  ck('(대조) 옛 판 규칙 12키 · 출석 둘 있었다',
    ro.length + '/' + ro.filter(k => /^attendance/.test(k)).length, '12/2');
  /* 쓰기 4키는 v257 그대로 */
  const w = ((NEW.match(/var DRIVER_WRITE_KEYS = \[([^\]]+)\]/) || [])[1] || '').replace(/['\s]/g, '');
  ck('쓰기 4키는 v257 그대로', w, 'carlog,deliveryDone,dropoffDone,rideState');
}

(async () => {

console.log('\n════ 3. ★ 기사 모드 — 서버에 출석을 부르지 않는다 (permission-denied 0) ════');
{
  /* 동기화 */
  const R = boot(NEW, 'academy', { asDriver: true });
  R.ev("currentMode='driver'; window._driverCarId='car1'; currentCarId='car1';");
  await R.sandbox.syncFromFirebase();
  console.log('      syncFromFirebase 가 서버에 부른 키: ' + (R.got.join(', ') || '없음'));
  ck('동기화 — 출석 두 키 요청 0회', R.got.filter(k => /^attendance/.test(k)).length, 0);
  ck('동기화 — permission-denied 0건', R.denied.join(',') || '없음', '없음');
  /* 리스너 */
  const R2 = boot(NEW, 'academy', { asDriver: true });
  R2.ev("currentMode='driver'; window._driverCarId='car1';");
  R2.sandbox.startFirebaseListeners();
  console.log('      리스너가 붙은 키(' + R2.listen.length + '): ' + R2.listen.join(', '));
  ck('리스너 — 출석 두 자리에 안 붙는다', R2.listen.filter(k => /^attendance/.test(k)).length, 0);
  ck('리스너 — permission-denied 0건', R2.denied.join(',') || '없음', '없음');
  ck('리스너 — 10키에만 붙었다', R2.listen.every(k => SERVER_DRIVER_OK.indexOf(k) >= 0), true);
  /* ★ 대조 — 옛 판(4ac625b)은 두 키를 불러서 거부당한다 */
  const O = boot(OLD, 'academy', { asDriver: true });
  O.ev("currentMode='driver'; window._driverCarId='car1'; currentCarId='car1';");
  await O.sandbox.syncFromFirebase();
  const O2 = boot(OLD, 'academy', { asDriver: true });
  O2.ev("currentMode='driver'; window._driverCarId='car1';");
  O2.sandbox.startFirebaseListeners();
  ck('(대조) 옛 판 동기화는 출석을 불렀다', O.got.filter(k => /^attendance/.test(k)).length, 2);
  ck('(대조) 옛 판 리스너도 출석에 붙었다', O2.listen.filter(k => /^attendance/.test(k)).length, 2);
  ck('(대조) 옛 판은 새 규칙에서 거부당한다 (요청이 나갔다는 뜻)',
    (O.denied.length + O2.denied.length) >= 2, true);
  /* 관리자 모드는 그대로 다 받는다 */
  const A = boot(NEW, 'academy');
  A.ev("currentMode='admin';");
  await A.sandbox.syncFromFirebase();
  ck('관리자 동기화는 출석을 그대로 받는다', A.got.filter(k => /^attendance/.test(k)).length, 2);
  const A2 = boot(NEW, 'academy');
  A2.ev("currentMode='admin';");
  A2.sandbox.startFirebaseListeners();
  ck('관리자 리스너도 출석에 붙는다', A2.listen.filter(k => /^attendance/.test(k)).length, 2);
  ck('   관리자 리스너 키 수는 옛 판과 같다', A2.listen.length, (() => {
    const X = boot(OLD, 'academy'); X.ev("currentMode='admin';"); X.sandbox.startFirebaseListeners();
    return X.listen.length;
  })());
  /* 기사 화면이 출석 없이도 그려지나 (자료를 지운 뒤) */
  const R3 = boot(NEW, 'academy', { asDriver: true });
  R3.ev("currentMode='driver'; window._driverCarId='car1'; currentCarId='car1';");
  delete R3.store['tkd_attendance' + SUF];
  delete R3.store['tkd_attendance_time' + SUF];
  let drew = true;
  try { R3.sandbox.renderDrive(); R3.sandbox.renderMembers(); } catch (e) { drew = 'ERR:' + e.message; }
  ck('출석 자료가 아예 없어도 기사 화면이 그려진다', drew, true);
  ck('   회원 두 명 그대로',
    ['가하은', '나여름'].filter(x => String(R3.document.getElementById('member-list').innerHTML || '').indexOf(x) >= 0).length, 2);
}

console.log('\n════ 4. 차량 없는 기사의 운행 화면 ════');
{
  BIZ.forEach(biz => {
    const R = boot(NEW, biz);
    R.ev("currentMode='driver'; window._driverCarId=''; currentCarId='';");
    R.sandbox.renderDrive();
    const h = String(R.document.getElementById('app-content').innerHTML || '');
    const t = String(R.document.getElementById('drive-tabs').innerHTML || '');
    ck('[' + biz + '] 안내 문구', /배정된 차량이 없어요/.test(h) && /관리자에게 문의하세요/.test(h), true);
    ck('[' + biz + '] 차량 탭 0개', /1호차|2호차/.test(t), false);
    ck('[' + biz + '] 출근·퇴근·차계부 단추 0개',
      /🌅 출근|🌆 퇴근|⛽ 차계부/.test(h), false);
  });
  /* 회원 탭도 같은 문구 (v257 에서 넣은 것 — 그대로인지) */
  {
    const R = boot(NEW, 'academy');
    R.ev("currentMode='driver'; window._driverCarId='';");
    R.sandbox.renderMembers();
    ck('회원 탭도 같은 문구',
      /배정된 차량이 없어요/.test(String(R.document.getElementById('member-list').innerHTML || '')), true);
    /* 화면에 **글자로 나가는** 자리는 driverNoCarHtml 하나뿐이어야 한다.
       (그 밖에 문답표 1곳 + 주석 1곳이 같은 말을 쓴다 — 화면이 아니다) */
    /* 화면용 HTML 을 만드는 자리는 driverNoCarHtml 하나뿐 (「없어요.<br>관리자에게」 꼴) */
    ck('   화면 HTML 을 만드는 자리는 한 곳뿐',
      (NEW.match(/배정된 차량이 없어요\.<br>관리자에게 문의하세요/g) || []).length, 1);
    /* 부르는 자리 네 곳: 운행 화면 2(차량 없음·지운 차량) + 회원 목록 2(renderMembers·filterDriverMembers) */
    ck('   부르는 자리 네 곳 + 정의 한 곳',
      (NEW.match(/driverNoCarHtml\(\)/g) || []).length, 5);
    ck('   운행 2 · 회원 2',
      [/content\.innerHTML = driverNoCarHtml\(\);/g, /listEl\.innerHTML=driverNoCarHtml\(\);/g]
        .map(re => (NEW.match(re) || []).length).join('+'), '2+2');
  }
  /* ★ 대조 — 옛 판에서는 모든 차량이 보였다 */
  {
    const O = boot(OLD, 'academy');
    O.ev("currentMode='driver'; window._driverCarId=''; currentCarId='';");
    O.sandbox.renderDrive();
    const t = String(O.document.getElementById('drive-tabs').innerHTML || '');
    const h = String(O.document.getElementById('app-content').innerHTML || '');
    ck('(대조) 옛 판은 1호차·2호차가 다 보였다', /1호차/.test(t) && /2호차/.test(t), true);
    /* 출퇴근 띠는 옛 판에서도 안 나왔다 — driverPunchBarHtml 이 carId 가 없으면 '' 를 돌려준다.
       옛 판에서 **나왔던 것**은 차량 탭 둘과 차계부 단추다. 새 판은 그 둘 다 없다. */
    ck('(대조) 옛 판은 차계부 단추가 나왔다', /⛽ 차계부/.test(h), true);
    ck('(대조) 옛 판엔 출퇴근 띠는 없었다 (carId 가 없어서)', /🌅 출근/.test(h), false);
  }
  /* 지운 차량에 묶인 기사 — v257 과 같은 처리 그대로 */
  {
    const R = boot(NEW, 'academy');
    R.ev("currentMode='driver'; window._driverCarId='car9'; currentCarId='car9';");
    R.sandbox.renderDrive();
    ck('없는 차량(car9) 기사 — 같은 안내',
      /배정된 차량이 없어요/.test(String(R.document.getElementById('app-content').innerHTML || '')), true);
  }
}

console.log('\n════ 5. 4업종 기사 화면 — 정상 (차량이 있을 때) ════');
{
  BIZ.forEach(biz => {
    const R = boot(NEW, biz);
    R.ev("currentMode='driver'; window._driverCarId='car1'; currentCarId='car1'; filterCourse=''; filterCar='';");
    R.sandbox.renderDrive();
    R.sandbox.renderMembers();
    const h = String(R.document.getElementById('app-content').innerHTML || '');
    const t = String(R.document.getElementById('drive-tabs').innerHTML || '');
    const m = String(R.document.getElementById('member-list').innerHTML || '');
    ck('[' + biz + '] 내 차량 한 칸 · 남의 차량 없음', /1호차/.test(t) && !/2호차/.test(t), true);
    ck('[' + biz + '] 출근·퇴근·차계부 있다', /🌅 출근/.test(h) && /🌆 퇴근/.test(h) && /⛽ 차계부/.test(h), true);
    ck('[' + biz + '] 회원은 내 차량 두 명만',
      ['가하은', '나여름', '다겨울'].filter(x => m.indexOf(x) >= 0).join(','), '가하은,나여름');
    ck('[' + biz + '] 안내 문구는 안 나온다', /배정된 차량이 없어요/.test(h + m), false);
  });
}

console.log('\n════ 6. 둘러보기(_demo) 는 v257 그대로 ════');
{
  let same = 0;
  BIZ.forEach(biz => {
    const one = (src) => {
      const R = boot(src, biz, { search: '?org=' + biz + '_demo' });
      R.ev("currentMode='driver'; currentCarId='car1';");
      try { R.sandbox.renderDrive(); } catch (e) { return 'ERR:' + e.message; }
      return String(R.document.getElementById('drive-tabs').innerHTML || '')
        + '§' + String(R.document.getElementById('app-content').innerHTML || '');
    };
    if (one(OLD) === one(NEW)) same++;
  });
  ck('둘러보기 기사 화면 4업종 바이트 동일', same + '/4', '4/4');
  const R = boot(NEW, 'academy', { search: '?org=academy_demo' });
  R.ev("currentMode='driver'; currentCarId='car1';");
  R.sandbox.renderDrive();
  const h = String(R.document.getElementById('app-content').innerHTML || '');
  ck('   둘러보기 출근·퇴근 단추 그대로', /🌅 출근/.test(h) && /demoPunch/.test(h), true);
  ck('   둘러보기 PIN 단추 0개', /openPinCheckin/.test(h), false);
}

console.log('\n════ 7. 관리자 4업종 × 9화면 HTML 동일 ════');
{
  const TABS = ['dashboard', 'members', 'attendance', 'cars', 'schedule', 'payment', 'tax', 'notice', 'settings'];
  let same = 0; const diff = [];
  BIZ.forEach(biz => TABS.forEach(tab => {
    const one = (src) => {
      const R = boot(src, biz);
      R.ev("currentMode='admin'; currentAdminTab='" + tab + "';");
      try { R.sandbox.renderAdminTab(tab); } catch (e) { return 'ERR:' + e.message; }
      return String(R.document.getElementById('admin-content').innerHTML || '');
    };
    if (one(OLD) === one(NEW)) same++; else diff.push(biz + '/' + tab);
  }));
  ck('4업종 × 9화면 바이트 동일', same + '/36', '36/36');
  if (diff.length) console.log('      달라진 화면: ' + diff.join(', '));
  ck('(대조) 한 글자 바꾼 판은 잡힌다', (() => {
    const bent = NEW.split('▶ 클릭해서 보기').join('▶ 눌러서 보기');
    if (bent === NEW) return '바꿀 자리 없음';
    const one = (src) => {
      const R = boot(src, 'academy'); R.ev("currentMode='admin'; currentAdminTab='dashboard';");
      R.sandbox.renderAdminTab('dashboard');
      return String(R.document.getElementById('admin-content').innerHTML || '');
    };
    return one(bent) === one(NEW) ? '못 잡음' : '잡음';
  })(), '잡음');
}

console.log('\n════ 8. 옛 기사 로그인 문구 ════');
{
  ck('옛 문구가 사라졌다', /기사도 계정으로 로그인해요/.test(NEW), false);
  ck('(대조) 옛 판에는 있었다', /기사도 계정으로 로그인해요/.test(OLD), true);
  ck('새 문구가 들어갔다', /기사는 첫 화면 「🚐 기사 로그인」에서 업체 번호와 PIN 으로 들어와요/.test(NEW), true);
  /* 실제로 불러 본다 — 실서비스에서는 안내만 내고 기사 모드로 안 간다 */
  const R = boot(NEW, 'academy');
  R.ev("currentMode='admin';");
  R.sandbox.loginDriver();
  ck('실서비스에서 loginDriver — 새 문구를 띄운다',
    String(R.document.getElementById('login-err').textContent || '').indexOf('업체 번호와 PIN') >= 0, true);
  ck('   기사 모드로 넘어가지 않는다', R.ev('currentMode'), 'admin');
  /* 둘러보기에서는 종전대로 들어간다 (함수를 지우지 않았다) */
  const D = boot(NEW, 'academy', { search: '?org=academy_demo' });
  D.ev("currentMode='admin';");
  D.sandbox.loginDriver();
  ck('둘러보기에서는 기사 모드로 들어간다 (함수 유지)', D.ev('currentMode'), 'driver');
  /* v250 시절 「기사 계정·비밀번호」 문구가 **화면 글자**에 남았나 — 주석은 뺀다 */
  const lines = NEW.split('\n');
  const left = [];
  lines.forEach((l, i) => {
    const t = l.trim();
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) return;
    if (/기사.{0,8}계정|기사.{0,6}비밀번호/.test(l) && /'|"|`/.test(l)) left.push((i + 1) + ': ' + t.slice(0, 80));
  });
  left.forEach(x => console.log('      · ' + x));
  console.log('      (위는 글자가 든 줄 — 아래에서 하나하나 가린다)');
  /* 남은 자리를 하나하나 가린다 — 셋 다 **지금 사실대로** 쓴 글이라 고칠 것이 없다:
       ① 문답표 검색어·답변 (「기사 계정(휴대폰+비번)은 **만들지 않아요**」 — 낡은 말로 물어도 찾게 둔다)
       ② 마스터 패널 알림 (users 문서에 기사 문서가 **실제로 있다** — 「기사 계정」이 맞는 말)
       ③ 비밀번호 안내 (「기사는 비밀번호가 **없어요**」) */
  const okWords = /기사계정|기사비밀번호|만들지 않아요|테스트 출입을 줄 수 없어요|비밀번호가 없어요|비밀번호를 잊었어요|탭을 고르세요/;
  const bad = left.filter(x => !okWords.test(x));
  bad.forEach(x => console.log('      ✘ 가려지지 않은 자리: ' + x));
  ck('남은 자리는 모두 지금 사실대로 쓴 글이다', bad.length, 0);
  /* 낡은 **주장**이 남았나 — 「번호·비밀번호를 받아」·「기사 계정을 만들」 꼴 */
  /* 주석은 뺀다 — 367행은 「v254 까지는 … 받아야 했다」로 **지난 일**을 적은 주석이다(사실) */
  const claimLines = (src) => src.split(String.fromCharCode(10)).filter(l => {
    const t = l.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false;
    if (/v2\d\d 까지는|예전에는/.test(l)) return false;
    return /번호·비밀번호를 받아|기사 계정을 만들|＋ 계정 만들기/.test(l);
  });
  claimLines(NEW).forEach(l => console.log('      ✘ 낡은 주장: ' + l.trim().slice(0, 90)));
  ck('낡은 주장(기사에게 비번을 준다) 0곳 — 주석 뺀 글자', claimLines(NEW).length, 0);
  ck('(대조) 옛 판에는 그 주장이 글자로 있었다', claimLines(OLD).length, 1);
}

console.log('\n════ 9. 문답표 ════');
{
  const qa = require('./qa252.js');
  const a = qa.read(OLD), b = qa.read(NEW);
  /* ★ v272: 이 회차의 참값은 **70/70** 이다 (바로 아래 줄의 옛 쪽지도 그렇게 적고 있었다).
     기대값만 v261 때 71 로 올려 뒀던 것은, 그때 「새」쪽이 일하는 폴더였기 때문이다.
     이제 새 쪽을 v258 에 고정했으니 v258 이 본 수(70)로 돌려 놓는다.
     (v261 이 더한 「사업자 확인이 안 돼요」는 v261 묶음 t_app261.js 가 본다.) */
  ck('문답 수 (v258 은 더하지 않았다)', b.length + '/' + a.length, '70/70');
  const changed = b.filter(q => { const o = a.find(x => x.t === q.t); return o && JSON.stringify(o) !== JSON.stringify(q); }).map(q => q.t).sort();
  console.log('      손댄 문답(' + changed.length + '): ' + changed.join(' / '));
  /* v261 이 손댄 문답 넷 — 가입·로그인·승인 대기·구독·1234 안내를 가입 개편에 맞춰 고쳤다
     (「회원가입」 문답은 제목까지 바뀌어 여기 「손댄 문답」에는 안 들어온다). 표는 t_app261.js */
  const V261_Q = ['휴대폰 번호로 로그인해요', '승인 대기 화면이 나와요',
                  '30일 무료 체험·구독', '1234 비밀번호로 안 들어가져요',
                  /* v263: 둘러보기 문답의 「30일 무료」 표현을 고쳤다(요금 미정이라 일수를 뺐다) */
                  '데모(샘플) 계정'];
  ck('손댄 문답 1개 (+ v261 넷)', changed.filter(t => V261_Q.indexOf(t) < 0).join(' / '),
    '기사 운행 화면 사용법');
  const all = b.map(q => q.a).join('\n');
  ck('차량 없을 때 안내가 들어갔다', /배정된 차량이 없으면 운행 화면·«회원» 탭에/.test(all), true);
  ck('줄 번호가 1~10 으로 이어진다', (() => {
    const q = b.find(x => x.t === '기사 운행 화면 사용법');
    const nums = (q.a.match(/(?:^|\n)(\d+)\./g) || []).map(x => Number(x.replace(/\D/g, '')));
    return nums.join(',');
  })(), '1,2,3,4,5,6,7,8,9,10');
  ck('별표·가짜 토큰 0 (문답표 점검 회차 규칙 유지)',
    b.filter(q => /\*\*/.test(q.a)).length + b.flatMap(q => ((q.t + q.a).match(/«[^»]*»/g) || [])
      .filter(x => ['«회원»','«학부모»','«알림장»','«출결»','«출석»','«결석»','«출석률»','«수강료»'].indexOf(x) < 0)).length, 0);
  const R = boot(NEW, 'academy');
  const ask = (q, role) => {
    R.ev("currentMode='" + role + "';");
    const r = R.sandbox.helperAnswer(q);
    return (r.type === 'answer' ? [r.item] : (r.type === 'choices' ? r.items : [])).map(x => x.t);
  };
  ck('기사 「배정된 차량이 없어요가 나와요」 → 운행 화면 사용법',
    ask('내차량이 없다고 나와요', 'driver').indexOf('기사 운행 화면 사용법') >= 0, true);
}

console.log('\n════ 10. 바뀐 파일·규칙 줄 수·CLAUDE.md ════');
{
  /* ★ v272: 이 회차의 diff 는 **v257→v258 두 커밋 사이**다.
     전에는 `diff --numstat <v257>` 하나뿐이라 **일하는 폴더까지** 견주었다 —
     그래서 v271 이 home.html·terms.html 을 고치자 「s.html·home·terms·privacy
     손대지 않았다」가 깨졌다. v258 은 그 넷을 건드린 적이 없다. */
  const stat = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat '
    + BASE + ' ' + NEW_REF).toString().trim().split('\n');
  stat.forEach(l => { const p = l.split('\t'); console.log('      ' + p[2].padEnd(16) + '+' + p[0] + ' / −' + p[1]); });
  /* v260: api/admin-account.js(옛 기사 계정 세 동작 삭제)·api/driver-auth.js(업체 단위 상한)를 고쳤다.
     이 회차 **자신이** api 를 건드렸는지로 본다. */
  ck('이 회차가 바꾼 네 파일이 모두 들어 있다',
    ['CLAUDE.md', 'firestore.rules', 'index.html', 'version.json']
      .every(f => stat.some(l => l.split('\t')[2] === f)), true);
  ck('v258 자신은 api 를 안 건드렸다',
    cp.execSync('git -C ' + COS_ROOT + ' diff --name-only 4ac625b 76224a8').toString().indexOf('api/') < 0, true);
  ck('s.html·home·terms·privacy 손대지 않았다',
    stat.every(l => !/s\.html|home\.html|terms\.html|privacy\.html/.test(l)), true);
  const r = now('firestore.rules');
  const lines = r.split('\n').length - (r.endsWith('\n') ? 1 : 0);
  const old = show('firestore.rules');
  console.log('      firestore.rules 줄 수: ' + (old.split('\n').length - (old.endsWith('\n') ? 1 : 0)) + ' → ' + lines + ' (재게시용)');
  ck('규칙 줄 수를 읽었다', lines > 0, true);
  ck('CLAUDE.md 에 읽기 10키', /읽기 `driverReadableKey` \*\*10개\*\*\(v258\)/.test(now('CLAUDE.md')), true);
  ck('CLAUDE.md 에 차량 없을 때 규칙', /차량이 없으면 두 화면 모두 `driverNoCarHtml\(\)` 안내만/.test(now('CLAUDE.md')), true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
})();
