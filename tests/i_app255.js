/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v255 앱 스텁 검사 — 기사 로그인 일원화 (전/후)
   전: 2eadaaa (v254) · 후: 작업 중 index.html
   보는 것 ① 로그인 두 입구 ② 기사 읽기 제한 ③ PIN 판 역할 분리 ④ 출퇴근 단추
          ⑤ 차량관리 화면 ⑥ 옮기기 ⑦ 근태·급여 화면이 **글자 하나까지 같은가** ⑧ 둘러보기 */
const cp = require('child_process');
/* ★ v272 보정1: 이 묶음은 **v255 회차 기록**이다 — 「새」쪽도 그 회차 커밋에 고정한다.
   전에는 작업트리(지금 코드)를 「후」로 보았다. 그래서 회차가 지날수록 문답 수·함수 목록·
   버전이 어긋나 **거짓으로 실패**했다(v272 기준 2건). v255 가 틀린 것이 아니다.
   지금 코드는 **그 회차의 묶음**이 본다 — 이 표는 그때 무엇이 바뀌었는지의 기록이다.
   ★ env246 은 **require 할 때** COS_SRC_NEW 를 읽는다 → 그 전에 넣어야 한다. */
/* ★ 기대값이 뒷 회차에 앞으로 고쳐진 묶음이다 — 그 기대값이 가리키는 회차(v258)에 맞춘다.
   (실측: 다른 회차로 맞추면 더 많이 틀어진다.) */
const NEW_REF = process.env.COS_SRC_NEW_REF || '76224a8';   /* v255 */
if (!process.env.COS_SRC_NEW) {
  const _pf = require('path').join(__dirname, 'pin255i_index.html');
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
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(60) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const BASE = process.env.COS_SRC_OLD_REF || '2eadaaa';
const OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':index.html', { maxBuffer: 1 << 28 }).toString();
const NEW = E.SRC_NEW;
const SUF = '__cosroad_default';

/* ── 자료: 차량 2대(기사·PIN·급여 4값이 **옛 자리**에 있다) + 회원 2명 + 직원 1명 + 근태 ── */
const CARS = [
  { id: 'car1', name: '1호차', driver: '박기사', phone: '010-5555-6666', plate: '12가3456',
    model: '스타렉스', driverPin: '1234', commuteKm: 20, hourlyWage: 10030, mealAllow: 200000, taxMode: 'free33' },
  { id: 'car2', name: '2호차', driver: '김기사', phone: '010-7777-8888', plate: '34나5678',
    model: '포터2', driverPin: '5678', commuteKm: 15, hourlyWage: 11000, mealAllow: 150000, taxMode: 'insure4' }
];
const MEMBERS = [
  { id: 1, name: '강하은', courseId: 'c1', carId: 'car1', location: '유원아파트', lat: 37.1, lon: 127.1,
    dropLocation: '유원아파트', phone: '010-1111-1111', days: ['월', '화', '수', '목', '금'], pin: '1111', on: true, monthly: 150000 },
  { id: 2, name: '문소율', courseId: 'c1', carId: 'car2', location: '행복아파트', lat: 37.2, lon: 127.2,
    dropLocation: '행복아파트', phone: '010-2222-2222', days: ['월', '화', '수', '목', '금'], pin: '2222', on: true, monthly: 150000 }
];
const STAFF = [{ id: 'st1', name: '최직원', phone: '010-9999-0000', pin: '3333',
                 hourlyWage: 10030, mealAllow: 100000, taxMode: 'free33', breakAuto: true }];
const ATT = {
  'car1_2026-10-05': { in: '08:30', out: '18:00' },
  'car1_2026-10-06': { in: '08:28', out: '19:10' },
  'car2_2026-10-05': { in: '07:50', out: '17:30' },
  'st1_2026-10-05':  { in: '09:00', out: '18:30' }
};
function storeOf(extra) {
  const s = {};
  const put = (k, v) => { s[k + SUF] = typeof v === 'string' ? v : JSON.stringify(v); };
  put('tkd_cars', CARS);
  put('tkd_members', MEMBERS);
  put('tkd_courses', [{ id: 'c1', name: 'A반', depart: '15:00' }]);
  put('tkd_org', { name: '코스로드학원', lat: 37.0, lon: 127.0 });
  put('tkd_staff', STAFF);
  put('tkd_driver_att', ATT);
  put('tkd_attendance', { '2026-10-05': { 1: 'present' } });
  put('tkd_attendance_time', {});
  put('tkd_payments', {});
  put('tkd_tax', {});
  put('tkd_carlog', {});
  Object.assign(s, extra || {});
  return s;
}

/* 기사·관리자 모드로 앱을 올린다. api 호출은 전부 가로채 S.api 에 쌓는다. */
function boot(src, opts) {
  opts = opts || {};
  const R = E.build({ src: src, biz: opts.biz || 'academy',
                      localStorage: opts.store || storeOf() });
  if (R.error) throw R.error;
  /* 화면 자리 만들기 */
  ['admin-content', 'app-content', 'drv-msg', 'drv-mig-msg', 'pin-result', 'pin-dots', 'drive-tabs',
   'drive-content', 'login-err', 'login-box-driver', 'login-box-admin', 'login-tab-driver',
   'login-tab-admin', 'drv-orgcode', 'drv-pin', 'keep-login-drv', 'drv-login-btn',
   'drv-punch-msg', 'login-screen', 'main-app', 'bottom-action', 'day-tabs', 'member-screen',
   'admin-screen', 'main-header', 'member-add-area', 'drive-screen', 'tab-drive', 'tab-member',
   'tab-admin', 'header-badge', 'pin-checkin-modal', 'member-list', 'day-tabs-inner',
   'drive-screen-top', 'helper-fab'].forEach(id => {
    const el = E.makeEl('div'); el.id = id;
    el.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
    R.document.registerId(id, el);
  });
  R.api = [];
  R.apiReply = opts.apiReply || {};
  R.win.fetch = R.sandbox.fetch = async (url, o) => {
    let b = {};
    try { b = JSON.parse((o && o.body) || '{}'); } catch (e) {}
    R.api.push({ url: String(url), body: b, auth: ((o && o.headers) || {}).Authorization || '' });
    const key = b.action || 'x';
    const r = R.apiReply[key];
    const made = (typeof r === 'function') ? r(b) : r;
    return { json: async () => (made === undefined ? { ok: true } : made) };
  };
  /* Firestore — 읽기 시도를 모두 적는다 (규칙이 막는 키를 앱이 부르는지 본다) */
  R.reads = [];
  R.denied = [];
  R.writes = [];
  R.win._db = R.sandbox._db = {};
  R.win._firestore = R.sandbox._firestore = {
    doc: (db, ...p) => ({ _p: p.join('/') }),
    collection: (db, ...p) => ({ _p: p.join('/') }),
    getDoc: async (ref) => {
      R.reads.push(ref._p);
      if (opts.denyKeys && opts.denyKeys.some(k => ref._p.endsWith('/' + k))) {
        R.denied.push(ref._p);
        const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e;
      }
      return { exists: () => false, data: () => ({}) };
    },
    setDoc: async (ref, d) => { R.writes.push(ref._p); },
    deleteDoc: async () => {},
    getDocs: async () => ({ forEach: () => {} }),
    onSnapshot: (ref, cb) => { R.reads.push('listen:' + ref._p); return () => {}; },
    query: (...a) => a[0], where: () => ({}), orderBy: () => ({}), limit: () => ({}),
    serverTimestamp: () => 0
  };
  R.win._auth = R.sandbox._auth = {
    currentUser: { uid: 'U1', isAnonymous: false, getIdToken: async () => 'IDTOK' }
  };
  R.win._authFns.signInWithCustomToken = async (a, t) => { R.customToken = t; return { user: { uid: 'drv' } }; };
  /* ★ env246 의 setTimeout 은 콜백을 **그 자리에서** 돌린다. 그러면
       ① driverGetLoc 의 5.2초 포기 타이머가 위치 응답보다 먼저 터져 위치가 늘 null 이 되고
       ② 결과 화면을 지우는 2.5초 타이머가 즉시 돌아 화면이 **항상 빈 채**로 보인다
     (실제로 겪어서 고침 — 두 검사가 「통과」로 보이지만 아무것도 확인하지 못했다).
     그래서 0.4초 이상은 줄을 세워 두고, 테스트가 원할 때 R.flush() 로 돌린다. */
  R.timers = [];
  const fastTimeout = (f, ms) => {
    if ((Number(ms) || 0) >= 400) { R.timers.push(f); return R.timers.length; }
    try { f(); } catch (e) {}
    return 0;
  };
  R.sandbox.setTimeout = fastTimeout;
  R.win.setTimeout = fastTimeout;
  R.flush = () => { const t = R.timers.slice(); R.timers.length = 0; t.forEach(f => { try { f(); } catch (e) {} }); };
  return R;
}
const wait = () => new Promise(r => setImmediate(r));
const settle = async (n) => { for (let i = 0; i < (n || 20); i++) await wait(); };

(async () => {

console.log('════ 1. 로그인 화면 — 입구가 둘 ════');
{
  const grab = (src, id) => {
    const i = src.indexOf('id="' + id + '"');
    return i < 0 ? '' : src.slice(i, i + 200);
  };
  ck('v254: 기사 입구가 없다', grab(OLD, 'login-box-driver') === '', true);
  ck('v255: 기사 입구가 있다', grab(NEW, 'login-box-driver') !== '', true);
  ck('v255: 업체 번호 칸(6자리)', /id="drv-orgcode"[^>]*maxlength="6"/.test(NEW), true);
  ck('v255: PIN 칸(4자리, 가려짐)',
    /id="drv-pin"[\s\S]{0,80}type="password"|type="password"[^>]*id="drv-pin"/.test(NEW)
      && /id="drv-pin"[^>]*maxlength="4"/.test(NEW), true);
  ck('v255: 관리자 입구는 처음에 숨어 있다', /id="login-box-admin" style="display:none;"/.test(NEW), true);
  const R = boot(NEW);
  R.sandbox.loginPick('admin');
  ck('관리자 고르면 기사 칸이 숨는다', R.document.getElementById('login-box-driver').style.display, 'none');
  ck('관리자 칸이 보인다', R.document.getElementById('login-box-admin').style.display, '');
  R.sandbox.loginPick('driver');
  ck('기사 고르면 되돌아온다', R.document.getElementById('login-box-driver').style.display
    + '/' + R.document.getElementById('login-box-admin').style.display, '/none');
  ck('둘러보기 단추는 그대로 있다', NEW.indexOf('onclick="loginDriver()"') >= 0, true);
}

console.log('\n════ 2. 기사 로그인 — 서버에 무엇을 보내나 ════');
{
  const R = boot(NEW, { apiReply: { login: { ok: true, token: 'CT1', org: 'academy_x', carId: 'car1' } } });
  R.document.getElementById('drv-orgcode').value = '123456';
  R.document.getElementById('drv-pin').value = '1234';
  /* 위치를 **거부**하는 폰. 먼저 「위치를 주면 받아 온다」를 보인 다음에 이 검사가 뜻을 갖는다 */
  R.sandbox.navigator.geolocation = { getCurrentPosition: (ok, no) => no({ code: 1 }) };
  await R.sandbox.loginDriverPin();
  await settle(30);
  const c = R.api[0] || {};
  ck('api/driver-auth 를 부른다', /\/api\/driver-auth$/.test(c.url || ''), true);
  ck('action=login', (c.body || {}).action, 'login');
  ck('업체 번호를 보낸다', (c.body || {}).orgCode, '123456');
  ck('PIN 을 보낸다', (c.body || {}).pin, '1234');
  ck('기기 id 를 보낸다(16바이트 hex)', /^[0-9a-f]{32}$/.test((c.body || {}).deviceId || ''), true);
  ck('위치 거부 → loc=null 로 보낸다', (c.body || {}).loc, null);
  ck('위치를 거부해도 로그인은 됐다 (custom token 으로 로그인)', R.customToken, 'CT1');
  ck('기사 모드로 들어갔다', R.ev('currentMode'), 'driver');
  ck('_driverCarId 가 섰다', R.win._driverCarId, 'car1');

  /* 위치를 주는 폰 */
  const R2 = boot(NEW, { apiReply: { login: { ok: true, token: 'CT2', org: 'academy_x', carId: 'car1' } } });
  R2.document.getElementById('drv-orgcode').value = '123456';
  R2.document.getElementById('drv-pin').value = '1234';
  R2.sandbox.navigator.geolocation = { getCurrentPosition: (ok) => ok({ coords: { latitude: 37.5, longitude: 127.0, accuracy: 30 } }) };
  await R2.sandbox.loginDriverPin();
  await settle(30);
  ck('위치를 주면 lat/lng 를 보낸다', JSON.stringify((R2.api[0].body || {}).loc), JSON.stringify({ lat: 37.5, lng: 127.0, acc: 30 }));

  /* 서버가 거절하면 화면에 그 문구가 뜬다 */
  const R3 = boot(NEW, { apiReply: { login: { ok: false, message: '등록된 기기가 아니에요. 관리자에게 기기 풀기를 요청하세요.', why: 'device' } } });
  R3.document.getElementById('drv-orgcode').value = '123456';
  R3.document.getElementById('drv-pin').value = '9999';
  R3.sandbox.navigator.geolocation = { getCurrentPosition: (ok, no) => no({}) };
  await R3.sandbox.loginDriverPin();
  await settle(30);
  ck('거절 문구를 그대로 보여 준다', R3.document.getElementById('login-err').textContent,
    '등록된 기기가 아니에요. 관리자에게 기기 풀기를 요청하세요.');
  ck('로그인하지 않았다', R3.customToken, undefined);

  /* 칸이 비었으면 서버를 부르지 않는다 */
  const R4 = boot(NEW);
  R4.document.getElementById('drv-orgcode').value = '12';
  R4.document.getElementById('drv-pin').value = '1234';
  await R4.sandbox.loginDriverPin();
  ck('번호가 6자리가 아니면 서버를 안 부른다', R4.api.length, 0);
}

console.log('\n════ 3. 기사 모드 — 허용 키만 읽는다 ════');
{
  const ALLOW = ['members', 'cars', 'courses', 'org', 'attendance', 'attendanceTime',
    'notices', 'rideState', 'carlog', 'deliveryDone', 'dropoffDone', 'driverAtt'];
  const DENY = ['payments', 'tax', 'payrollManual', 'staff', 'drivelogManual', 'driverPay',
    'invoices', 'products', 'certificates'];
  for (const [name, src] of [['v254 (전)', OLD], ['v255 (후)', NEW]]) {
    const R = boot(src);
    R.ev("currentMode='driver';");
    R.win._isDriverAcct = true;
    let got = [];
    for (const k of ALLOW.concat(DENY)) {
      const v = await R.sandbox.loadFromFirebase(k);
      if (R.reads.some(p => p.endsWith('/' + k))) got.push(k);
    }
    const badTried = DENY.filter(k => got.indexOf(k) >= 0);
    const okTried = ALLOW.filter(k => got.indexOf(k) >= 0);
    /* v258: 기사 읽기에서 attendance·attendanceTime 을 뺐다 (12키 → 10키) — 일부러 바꾼 자리. 이번 회차 표는 o_app258.js */
    const WANT_TRY = (name === 'v255 (후)') ? 10 : 12;   /* 뒤 판은 v258 목록이다 */
    ck(name + ': 허용 키는 읽으려 한다 (' + WANT_TRY + ')', okTried.length, WANT_TRY);
    if (name === 'v255 (후)') ck('   v258 에서 빠진 두 키는 안 읽는다',
      ['attendance', 'attendanceTime'].filter(k => got.indexOf(k) >= 0).length, 0);
    ck(name + ': 막아야 하는 키를 읽으려 하나', badTried.length, name === 'v255 (후)' ? 0 : 9);
    if (badTried.length) console.log('      → ' + badTried.join(', '));
  }
  /* 리스너도 같은 목록으로 걸러진다 */
  const R = boot(NEW);
  R.ev("currentMode='driver';");
  R.sandbox.startFirebaseListeners && R.sandbox.startFirebaseListeners();
  await settle(10);
  const listened = R.reads.filter(p => p.indexOf('listen:') === 0)
    .map(p => p.slice(p.lastIndexOf('/') + 1));
  if (listened.length) {
    ck('리스너가 막아야 하는 키를 보지 않는다',
      listened.filter(k => DENY.indexOf(k) >= 0).length, 0);
    console.log('      리스너 키: ' + listened.join(', '));
  } else {
    ck('리스너 목록을 읽었다', listened.length > 0, true);
  }
  /* 관리자 모드는 그대로 다 읽는다 */
  const RA = boot(NEW);
  RA.ev("currentMode='admin';");
  for (const k of DENY) await RA.sandbox.loadFromFirebase(k);
  ck('관리자 모드는 막지 않는다', DENY.filter(k => RA.reads.some(p => p.endsWith('/' + k))).length, DENY.length);
  /* DRIVER_READ_KEYS 와 규칙 파일이 같은 목록인가 */
  const fs = require('fs');
  const rules = _pinRead('firestore.rules');
  const rm = rules.match(/function driverReadableKey\(key\) \{\s*return key in \[([\s\S]*?)\];/);
  const rkeys = (rm ? rm[1].match(/'[^']+'/g) : []).map(s => s.slice(1, -1)).sort();
  const am = NEW.match(/DRIVER_READ_KEYS\s*=\s*\[([\s\S]*?)\]/);
  const akeys = (am ? am[1].match(/'[^']+'/g) : []).map(s => s.slice(1, -1)).sort();
  ck('앱 DRIVER_READ_KEYS 와 규칙 driverReadableKey 가 같다',
    akeys.join(',') === rkeys.join(','), true);
  /* v258: 기사 읽기에서 attendance·attendanceTime 을 뺐다 (12키 → 10키) — 일부러 바꾼 자리. 이번 회차 표는 o_app258.js */
  ck('   목록은 v258 에서 10키가 됐다', akeys.length, 10);
  if (akeys.join(',') !== rkeys.join(',')) console.log('      앱: ' + akeys + '\n      규칙: ' + rkeys);
}

console.log('\n════ 4. PIN 판 — 기사 모드는 회원 출석 전용 ════');
{
  /* 기사 모드: 기사 PIN(1234)·직원 PIN(3333) 을 눌러도 출퇴근이 **안** 되어야 한다 */
  for (const [name, src] of [['v254 (전)', OLD], ['v255 (후)', NEW]]) {
    const R = boot(src);
    R.ev("currentMode='driver';");
    R.win._driverCarId = 'car1';
    const before = JSON.stringify(JSON.parse(R.store['tkd_driver_att' + SUF]));
    R.ev("pinInput='1234';");
    await R.sandbox.checkPin();
    await settle(10);
    const after = JSON.stringify(JSON.parse(R.store['tkd_driver_att' + SUF]));
    ck(name + ': 기사 PIN 으로 출퇴근이 찍히나', before !== after, name === 'v255 (후)' ? false : true);

    const R2 = boot(src);
    R2.ev("currentMode='driver'; pinInput='3333';");
    const b2 = JSON.stringify(JSON.parse(R2.store['tkd_driver_att' + SUF]));
    await R2.sandbox.checkPin();
    await settle(10);
    const a2 = JSON.stringify(JSON.parse(R2.store['tkd_driver_att' + SUF]));
    ck(name + ': 직원 PIN 으로 출퇴근이 찍히나', b2 !== a2, name === 'v255 (후)' ? false : true);
  }
  /* 회원 출석은 기사 모드에서도 된다 */
  const R3 = boot(NEW);
  R3.ev("currentMode='driver'; pinInput='1111';");
  R3.sandbox.sendKakaoAlimtalk = () => {};
  R3.win.sendKakaoAlimtalk = R3.sandbox.sendKakaoAlimtalk;
  await R3.sandbox.checkPin();
  await settle(20);
  const at = JSON.parse(R3.store['tkd_attendance' + SUF] || '{}');
  const today = R3.sandbox.todayStr();
  ck('기사 모드: 회원 PIN → 출석 처리된다', ((at[today] || {})['1']), 'present');
  ck('기사 모드: 서버를 부르지 않았다 (회원 출석은 앱이 처리)', R3.api.length, 0);

  /* 관리자 모드: 기사 PIN → api pinCheckin */
  const R4 = boot(NEW, { apiReply: { pinCheckin: { ok: true, kind: 'in', time: '08:30', carId: 'car1', date: '2026-10-31' } } });
  R4.ev("currentMode='admin'; pinInput='1234';");
  await R4.sandbox.checkPin();
  await settle(20);
  const c = R4.api[0] || {};
  ck('관리자 패드: api 로 묻는다', (c.body || {}).action, 'pinCheckin');
  ck('관리자 패드: PIN 을 보낸다', (c.body || {}).pin, '1234');
  ck('관리자 패드: ID 토큰을 붙인다', c.auth, 'Bearer IDTOK');
  ck('관리자 패드: 결과 화면에 기사 이름이 나온다',
    /박기사 기사님 출근 \(08:30\)/.test(R4.document.getElementById('pin-result').innerHTML), true);
  const att4 = JSON.parse(R4.store['tkd_driver_att' + SUF]);
  ck('관리자 패드: 서버가 쓴 값을 로컬에 비춘다', (att4['car1_2026-10-31'] || {}).in, '08:30');
  ck('관리자 패드: Firebase 로 되쓰지 않는다 (서버가 이미 썼다)',
    R4.writes.filter(p => p.endsWith('/driverAtt')).length, 0);

  /* 관리자 모드: 기사 PIN 이 아니면 직원 → 회원 순으로 이어 본다 */
  const R5 = boot(NEW, { apiReply: { pinCheckin: { ok: false, why: 'notdriver', message: '기사 PIN 이 아니에요.' } } });
  R5.ev("currentMode='admin'; pinInput='3333';");
  await R5.sandbox.checkPin();
  await settle(20);
  const att5 = JSON.parse(R5.store['tkd_driver_att' + SUF]);
  ck('notdriver → 직원 PIN 으로 이어 본다', !!att5['st1_' + R5.sandbox.todayStr()], true);

  const R6 = boot(NEW, { apiReply: { pinCheckin: { ok: false, why: 'notdriver' } } });
  R6.ev("currentMode='admin'; pinInput='2222';");
  R6.sandbox.sendKakaoAlimtalk = () => {};
  R6.win.sendKakaoAlimtalk = R6.sandbox.sendKakaoAlimtalk;
  await R6.sandbox.checkPin();
  await settle(20);
  const a6 = JSON.parse(R6.store['tkd_attendance' + SUF] || '{}');
  ck('notdriver → 회원 PIN 까지 이어 본다', (a6[R6.sandbox.todayStr()] || {})['2'], 'present');

  /* 권한 오류면 거기서 멈추고 알려 준다 (직원·회원으로 넘어가 엉뚱하게 찍지 않는다) */
  const R7 = boot(NEW, { apiReply: { pinCheckin: { ok: false, why: 'err', message: '이 업체의 기사 출퇴근을 다룰 권한이 없어요.' } } });
  R7.ev("currentMode='admin'; pinInput='3333';");
  await R7.sandbox.checkPin();
  await settle(20);
  ck('권한 오류는 문구를 보여 준다',
    /권한이 없어요/.test(R7.document.getElementById('pin-result').innerHTML), true);
  const att7 = JSON.parse(R7.store['tkd_driver_att' + SUF]);
  ck('권한 오류면 직원으로 넘어가지 않는다', !att7['st1_' + R7.sandbox.todayStr()], true);
}

console.log('\n════ 5. 출근·퇴근 단추 (기사 화면) ════');
{
  const R = boot(NEW);
  R.ev("currentMode='driver'; currentCarId='car1';");
  R.win._driverCarId = 'car1';
  let h = R.sandbox.driverPunchBarHtml();
  ck('출근 단추가 있다', /🌅 출근/.test(h), true);
  ck('퇴근 단추가 있다', /🌆 퇴근/.test(h), true);
  ck('처음엔 퇴근이 눌리지 않는다', (h.match(/disabled/g) || []).length, 1);
  ck('로그인 ≠ 출근 을 알려 준다', /로그인과 출근은 따로예요/.test(h), true);

  /* 출근 → api checkin */
  const R2 = boot(NEW, { apiReply: { checkin: { ok: true, kind: 'in', time: '08:30', date: '2026-10-31' } } });
  R2.ev("currentMode='driver'; currentCarId='car1';");
  R2.win._driverCarId = 'car1';
  await R2.sandbox.driverPunch('checkin');
  await settle(30);
  const c = R2.api[0] || {};
  ck('action=checkin', (c.body || {}).action, 'checkin');
  ck('ID 토큰을 붙인다', c.auth, 'Bearer IDTOK');
  ck('본문에 carId·org 를 넣지 않는다 (서버가 토큰에서 본다)',
    (c.body || {}).carId === undefined && (c.body || {}).org === undefined, true);
  const att = JSON.parse(R2.store['tkd_driver_att' + SUF]);
  ck('서버 시각이 로컬에 비친다', (att['car1_2026-10-31'] || {}).in, '08:30');
  ck('Firebase 로 되쓰지 않는다 (기사는 규칙상 쓸 수 없다)',
    R2.writes.filter(p => p.endsWith('/driverAtt')).length, 0);
  ck('계기판 km 칸이 뜬다', /id="drv-odo"/.test(R2.document.getElementById('drv-punch-msg').innerHTML), true);
  /* 계기판 저장은 앱이 한다 (carlog — 기사가 쓸 수 있는 키) */
  R2.document.registerId('drv-odo', Object.assign(E.makeEl('input'), { id: 'drv-odo', value: '123456' }));
  R2.sandbox.saveDriverOdo('car1', 'start');
  const cl = JSON.parse(R2.store['tkd_carlog' + SUF] || '{}');
  ck('출근 계기판이 차계부에 들어간다', JSON.stringify(cl).indexOf('123456') >= 0, true);

  /* 상태 표시 — 출근만 찍힌 날 */
  const R3 = boot(NEW, { store: storeOf({ ['tkd_driver_att' + SUF]: JSON.stringify(
    Object.assign({}, ATT, { ['car1_' + new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0')]: { in: '08:30' } })) }) });
  R3.ev("currentMode='driver'; currentCarId='car1';");
  R3.win._driverCarId = 'car1';
  h = R3.sandbox.driverPunchBarHtml();
  ck('출근한 뒤: 출근 단추에 시각이 보인다', /출근 08:30 ✓/.test(h), true);
  ck('출근한 뒤: 출근은 다시 못 누른다', (h.match(/disabled/g) || []).length, 1);
  ck('출근한 뒤: 안내가 바뀐다', /퇴근」을 눌러/.test(h), true);

  /* 업체 만료면 왜 막혔는지 알려 준다 */
  const R4 = boot(NEW, { apiReply: { checkin: { ok: false, why: 'expired', message: '업체 이용 기간이 끝났어요. 관리자에게 문의해 주세요.' } } });
  R4.ev("currentMode='driver'; currentCarId='car1';");
  R4.win._driverCarId = 'car1';
  await R4.sandbox.driverPunch('checkin');
  await settle(30);
  const blocked = (R4.bodyKids || []).map(x => String(x._html || '')).join('');
  ck('만료 → 안내 화면', /업체 이용 기간이 끝났어요/.test(blocked), true);

  /* 운행 화면에 단추가 붙는가 (기사 모드) */
  const R5 = boot(NEW);
  R5.ev("currentMode='driver'; currentCarId='car1'; currentCourseId='c1';");
  R5.win._driverCarId = 'car1';
  try { R5.sandbox.renderDrive(); } catch (e) {}
  const dh = String((R5.document.getElementById('app-content') || {}).innerHTML || '')
    + String((R5.document.getElementById('drive-tabs') || {}).innerHTML || '');
  ck('운행 화면에 출퇴근 단추가 보인다', /🌅 출근/.test(dh), true);
  /* ★ v256 보정2 (사장님 11-01): 기사 화면을 간결하게 — 출석 PIN 단추를 **아예 뺀다.**
     v255 때는 「회원 출석 PIN」으로 이름만 바꿈 → 이제 **0개**가 맞다. */
  ck('v256 보정2: 운행 화면에 출석 PIN 단추가 없다', /출석 PIN/.test(dh), false);
  ck('   PIN 판을 여는 길도 없다', /openPinCheckin/.test(dh), false);
  ck('v254 의 「기사 PIN 출퇴근 체크」는 없다', /기사 PIN 출퇴근 체크/.test(dh), false);
  ck('차계부 단추는 그대로', /차계부/.test(dh), true);
}

console.log('\n════ 6. 차량관리 화면 ════');
{
  const RA = boot(OLD);
  RA.ev("currentMode='admin'; currentAdminTab='cars';");
  RA.sandbox.renderCars && RA.sandbox.renderCars();
  const R = boot(NEW, { apiReply: {
    driverInfo: { ok: true, info: { car1: { hasPin: true, pinAt: 1, deviceBound: true, deviceAt: 2,
      logins: [{ at: 3, atKst: '2026-10-31 08:12', ok: true, why: '', lat: 37.5, lng: 127.0, acc: 30 },
               { at: 2, atKst: '2026-10-30 08:02', ok: false, why: 'device', lat: null, lng: null, acc: null }] } } },
    issueOrgCode: { ok: true, code: '123456', made: false } } });
  R.ev("currentMode='admin'; currentAdminTab='cars';");
  const carsHtml = (X) => { X.sandbox.renderCars(); return String(X.document.getElementById('admin-content').innerHTML || ''); };
  carsHtml(R);
  await settle(40);
  const got = carsHtml(R);

  ck('업체 번호를 보여 준다', /기사 로그인용 업체 번호/.test(got) && /123456/.test(got), true);
  ck('복사 단추가 있다', /orgCodeCopy\(\)/.test(got), true);
  ck('PIN 설정됨 으로만 보인다', /PIN 설정됨/.test(got), true);
  ck('★ PIN 값(1234)이 화면에 없다', /value="1234"/.test(got), false);
  ck('v254 에는 PIN 값이 칸에 그대로 있었다 (대조)', /기사 PIN 4자리[^>]*value="1234"/.test(
    (function(){ const x = boot(OLD); x.ev("currentMode='admin'; currentAdminTab='cars';"); return carsHtml(x); })()), true);
  ck('PIN 바꾸기 단추', /setDriverPinAsk/.test(got), true);
  ck('PIN 지우기 단추', /removeDriverPinAsk/.test(got), true);
  ck('기기 풀기 단추', /unbindDeviceAsk/.test(got), true);
  ck('최근 로그인 기록이 보인다', /2026-10-31 08:12/.test(got), true);
  ck('실패한 로그인도 사유와 함께', /다른 기기/.test(got), true);
  ck('위치가 있으면 지도 링크', /map\.kakao\.com\/link\/map/.test(got), true);
  ck('위치가 없으면 「위치 없음」', /위치 없음/.test(got), true);
  ck('★ 「기사 계정」 칸이 없어졌다', /👤 기사 계정/.test(got), false);
  ck('휴대폰·비밀번호 칸이 없어졌다', /id="drv-pw"/.test(got), false);
  ck('급여 4칸은 그대로 보인다',
    /출퇴근 거리\(km\/일\)/.test(got) && /시급\(원\)/.test(got) && /식대\(월, 원\)/.test(got) && /공제: 3\.3% 원천징수/.test(got), true);
  ck('급여 칸이 driverPay 로 저장된다', /setCarPay\(/.test(got), true);
  ck('v254 처럼 cars[i].hourlyWage 로 저장하지 않는다', /cars\[\d+\]\.hourlyWage=/.test(got), false);
  ck('옛 값도 칸에 그대로 보인다 (옮기기 전)', /value="10,030"/.test(got), true);

  /* 급여 칸을 고치면 driverPay 에 담기고, 저장 단추에서 올라간다 */
  R.sandbox.setCarPay('car1', 'hourlyWage', 12000);
  ck('setCarPay 는 로컬에만 담는다', JSON.parse(R.store['tkd_driver_pay' + SUF]).car1.hourlyWage, 12000);
  ck('글자마다 서버로 보내지 않는다', R.writes.filter(p => p.endsWith('/driverPay')).length, 0);
  R.sandbox.saveCarsAndMembers();
  await settle(10);
  ck('「💾 저장」에서 한 번 올린다', R.writes.filter(p => p.endsWith('/driverPay')).length, 1);
}

console.log('\n════ 7. 옛 자료 옮기기 ════');
{
  const R = boot(NEW, { apiReply: {
    driverInfo: { ok: true, info: {} },
    issueOrgCode: { ok: true, code: '123456' },
    migrateDriverData: (b) => ({ ok: true, moved: (b.cars || []).length, dup: 0, bad: 0 }) } });
  R.ev("currentMode='admin'; currentAdminTab='cars';");
  const carsHtml = (X) => { X.sandbox.renderCars(); return String(X.document.getElementById('admin-content').innerHTML || ''); };
  let got = carsHtml(R);
  await settle(30);
  got = carsHtml(R);
  ck('옮길 것이 있으면 안내가 뜬다', /옛 기사 자료 옮기기/.test(got), true);
  ck('몇 건인지 알려 준다', /PIN 2건/.test(got), true);

  await R.sandbox.drvMigrateRun();
  await settle(30);
  const sent = (R.api.find(x => x.body.action === 'migrateDriverData') || {}).body || {};
  ck('PIN 2건을 서버로 보낸다', JSON.stringify(sent.cars),
    JSON.stringify([{ carId: 'car1', pin: '1234' }, { carId: 'car2', pin: '5678' }]));
  const cars2 = JSON.parse(R.store['tkd_cars' + SUF]);
  ck('cars 에서 PIN 이 지워졌다', cars2.filter(c => 'driverPin' in c).length, 0);
  ck('cars 에서 급여 4값이 지워졌다',
    cars2.filter(c => ('hourlyWage' in c) || ('mealAllow' in c) || ('taxMode' in c) || ('commuteKm' in c)).length, 0);
  ck('기사명·차량번호·차종은 그대로', cars2[0].driver + '/' + cars2[0].plate + '/' + cars2[0].model,
    '박기사/12가3456/스타렉스');
  const pay = JSON.parse(R.store['tkd_driver_pay' + SUF]);
  ck('driverPay 로 옮겨졌다 (car1 시급)', pay.car1.hourlyWage, 10030);
  ck('driverPay 로 옮겨졌다 (car2 공제방식)', pay.car2.taxMode, 'insure4');
  ck('driverPay 로 옮겨졌다 (car1 출퇴근 거리)', pay.car1.commuteKm, 20);
  got = carsHtml(R);
  ck('옮긴 뒤에는 안내가 사라진다', /옛 기사 자료 옮기기/.test(got), false);

  /* 옛 자료에 같은 PIN 이 둘이면 그 차량 PIN 은 남겨 둔다 (관리자가 새로 정하게) */
  const S2 = storeOf({ ['tkd_cars' + SUF]: JSON.stringify([
    { id: 'car1', name: '1호차', driver: '박', driverPin: '1234' },
    { id: 'car2', name: '2호차', driver: '김', driverPin: '1234' }]) });
  const R2 = boot(NEW, { store: S2, apiReply: {
    driverInfo: { ok: true, info: {} }, issueOrgCode: { ok: true, code: '1' },
    migrateDriverData: { ok: true, moved: 1, dup: 1, bad: 0 } } });
  R2.ev("currentMode='admin'; currentAdminTab='cars';");
  carsHtml(R2); await settle(20);
  await R2.sandbox.drvMigrateRun();
  await settle(20);
  const c2 = JSON.parse(R2.store['tkd_cars' + SUF]);
  ck('겹친 PIN 은 cars 에 남겨 둔다', ('driverPin' in c2[1]) && !('driverPin' in c2[0]), true);
  ck('겹쳤다고 알려 준다', /건너뜀/.test(R2.document.getElementById('drv-mig-msg').textContent || ''), true);

  /* 서버가 못 옮기면 PIN 을 지우지 않는다 */
  const R3 = boot(NEW, { apiReply: {
    driverInfo: { ok: true, info: {} }, issueOrgCode: { ok: true, code: '1' },
    migrateDriverData: { ok: false, message: '서버 인증 설정이 아직 안 됐어요.' } } });
  R3.ev("currentMode='admin'; currentAdminTab='cars';");
  carsHtml(R3); await settle(20);
  await R3.sandbox.drvMigrateRun();
  await settle(20);
  ck('실패하면 cars 를 건드리지 않는다',
    JSON.parse(R3.store['tkd_cars' + SUF])[0].driverPin, '1234');
  ck('실패를 알려 준다', /안 됐어요/.test(R3.document.getElementById('drv-mig-msg').textContent || ''), true);
}

console.log('\n════ 8. ★ 근태·급여가 글자 하나까지 같은가 (같은 자료) ════');
{
  /* 급여 계산값 비교.
     차량 기록 자체는 **일부러 달라진다** — 옮긴 뒤 cars 에는 driverPin·급여 4값이 없다.
     그래서 차량 기록은 「급여에 쓰이는 값」만 남기고(아래 proj), 계산된 숫자는 **그대로** 견준다.
     (차량 기록까지 통째로 견주면 「없어진 driverPin」때문에 늘 다르게 나와 뜻이 없다) */
  const proj = (x) => (x && typeof x === 'object') ? {
    id: x.id, driver: x.driver, name: x.name, hourlyWage: x.hourlyWage, mealAllow: x.mealAllow,
    taxMode: x.taxMode, commuteKm: x.commuteKm, _staff: !!x._staff, pin: x.pin } : x;
  const payOf = (src, store) => {
    const R = boot(src, { store: store });
    R.ev("currentMode='admin';");
    const d = R.sandbox.buildPayrollData('2026-10');
    return JSON.stringify(d, function (k, v) {
      if (k === 'car') return proj(v);
      if ((k === 'driverCars' || k === 'payTargets') && Array.isArray(v)) return v.map(proj);
      if (k === '_staffRef') return undefined;
      return v;
    });
  };
  const before = payOf(OLD, storeOf());
  const afterSame = payOf(NEW, storeOf());
  ck('옮기기 전 급여 자료가 v254 와 똑같다 (' + before.length + '자)', afterSame === before, true);
  if (afterSame !== before) console.log('      길이 ' + afterSame.length + ' vs ' + before.length);

  /* 옮긴 뒤: cars 는 비고 driverPay 에 있다 → **같은 숫자**가 나와야 한다 */
  const movedStore = storeOf({
    ['tkd_cars' + SUF]: JSON.stringify(CARS.map(c => {
      const x = Object.assign({}, c);
      delete x.driverPin; delete x.hourlyWage; delete x.mealAllow; delete x.taxMode; delete x.commuteKm;
      return x;
    })),
    ['tkd_driver_pay' + SUF]: JSON.stringify({
      car1: { hourlyWage: 10030, mealAllow: 200000, taxMode: 'free33', commuteKm: 20 },
      car2: { hourlyWage: 11000, mealAllow: 150000, taxMode: 'insure4', commuteKm: 15 } })
  });
  const afterMoved = payOf(NEW, movedStore);
  ck('옮긴 뒤 급여 자료도 똑같다', afterMoved === before, true);
  if (afterMoved !== before) console.log('      길이 ' + afterMoved.length + ' vs ' + before.length);

  /* 급여상세 화면 양식 — 사장님이 실제로 보는 표 (pvFormHtml) */
  const formOf = (src, store, mode) => {
    const R = boot(src, { store: store });
    R.ev("currentMode='admin'; currentAdminTab='attendance';");
    try { return String(R.sandbox.pvFormHtml(R.sandbox.buildPayrollData('2026-10'), mode)); }
    catch (e) { return 'ERR:' + e.message; }
  };
  for (const mode of ['screen', 'print']) {
    const b = formOf(OLD, storeOf(), mode);
    ck('급여상세 양식(' + mode + ') — 옮기기 전 같다 (' + b.length + '자)', formOf(NEW, storeOf(), mode) === b, true);
    ck('급여상세 양식(' + mode + ') — 옮긴 뒤도 같다', formOf(NEW, movedStore, mode) === b, true);
    ck('   (빈 양식이 아니다 — 검사가 뜻을 가지려면)', b.length > 3000 && b.indexOf('박기사') > 0, true);
  }
  /* 급여상세 엑셀 — XLSX 를 가로채 표 내용(aoa)을 그대로 꺼낸다 */
  const xlsOf = (src, store) => {
    const R = boot(src, { store: store });
    R.ev("currentMode='admin';");
    let aoa = null;
    R.sandbox.XLSX = R.win.XLSX = {
      utils: { aoa_to_sheet: (a) => { aoa = a; return { '!cols': [] }; },
               book_new: () => ({ SheetNames: [], Sheets: {} }),
               book_append_sheet: () => {}, encode_cell: (c) => 'A1', decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }) },
      writeFile: () => {}, write: () => new Uint8Array(0)
    };
    R.sandbox.writeStyledWorkbook = R.win.writeStyledWorkbook = () => {};
    try { R.sandbox.exportPayrollDetail('2026-10'); } catch (e) { return 'ERR:' + e.message; }
    return JSON.stringify(aoa);
  };
  const xb = xlsOf(OLD, storeOf());
  ck('급여 엑셀 — 옮기기 전 같다 (' + xb.length + '자)', xlsOf(NEW, storeOf()) === xb, true);
  ck('급여 엑셀 — 옮긴 뒤도 같다', xlsOf(NEW, movedStore) === xb, true);
  ck('   (빈 엑셀이 아니다)', xb.length > 1000 && xb.indexOf('박기사') > 0, true);
  /* 근태 화면 */
  const attOf = (src, store) => {
    const R = boot(src, { store: store });
    R.ev("currentMode='admin'; currentAdminTab='attendance'; driverAttViewDate='2026-10-05';");
    try { R.sandbox.renderAdminTab('attendance'); } catch (e) { return 'ERR:' + e.message; }
    return String(R.document.getElementById('admin-content').innerHTML || '');
  };
  const ab = attOf(OLD, storeOf());
  ck('근태 화면 — 옮기기 전 같다 (' + ab.length + '자)', attOf(NEW, storeOf()) === ab, true);
  ck('근태 화면 — 옮긴 뒤도 같다', attOf(NEW, movedStore) === ab, true);
}

console.log('\n════ 9. 4업종 × 화면 — 바뀐 곳 말고는 그대로 ════');
{
  const BIZ = ['academy', 'public', 'logistics', 'delivery'];
  /* cars 탭은 이번에 **일부러 바꿨다** → 비교에서 뺀다 */
  const TABS = ['dashboard', 'members', 'attendance', 'schedule', 'payment', 'tax', 'notice', 'partner', 'settings'];
  let same = 0, diff = [];
  for (const biz of BIZ) {
    for (const tab of TABS) {
      const one = (src) => {
        const R = boot(src, { biz: biz, store: storeOf() });
        R.ev("currentMode='admin'; currentAdminTab='" + tab + "';");
        try { R.sandbox.renderAdminTab(tab); } catch (e) { return 'ERR:' + e.message; }
        return String(R.document.getElementById('admin-content').innerHTML || '');
      };
      const a = one(OLD), b = one(NEW);
      if (a === b) same++; else diff.push(biz + '/' + tab + ' (' + a.length + '→' + b.length + ')');
    }
  }
  /* v256 보정3: 설정 화면의 회색 글자 한 곳(--gray-300 → --gray-400)만 달라진다 — 그 색은 빼고 견준다 */
  ck('설정 화면 뺀 32화면 똑같다', same + '/32', '32/32');
  ck('달라진 화면은 4업종 설정 화면뿐', diff.map(x => String(x).split(' ')[0]).sort().join(','),
    'academy/settings,delivery/settings,logistics/settings,public/settings');
}

console.log('\n════ 10. 둘러보기(_demo) — 서버를 부르지 않는다 ════');
{
  const R = boot(NEW, { store: storeOf() });
  R.win.location.search = '?org=academy_demo';
  R.ev("currentMode='driver'; currentCarId='car1';");
  ck('둘러보기로 인식한다', R.sandbox.isDemoMode(), true);
  /* 기사 둘러보기 — v255 때는 종전 PIN 판이었다.
     v257 보정4(기사 회원 탭·둘러보기 기사 화면·기사 출석 쓰기 회수)
     v257 에서 **출근·퇴근 단추**로 바꿨다(사장님 결정 11-01). 그 자리만 풀어 적는다.
     아래 checkPin 직접 호출은 그대로 둔다 — 함수는 남아 있고(둘러보기 **관리자** 패드가 쓴다),
     다만 기사 화면에서는 openPinCheckin 가드로 **닿지 못한다**. */
  try { R.sandbox.renderDrive(); } catch (e) {}
  const dh = String((R.document.getElementById('app-content') || {}).innerHTML || '')
    + String((R.document.getElementById('drive-tabs') || {}).innerHTML || '');
  ck('둘러보기 기사 화면 — v257 부터 PIN 단추 없음', /기사 PIN 출퇴근 체크/.test(dh), false);
  ck('둘러보기 기사 화면 — v257 부터 출근·퇴근 단추', /🌅 출근/.test(dh), true);
  R.ev("pinInput='1234';");
  await R.sandbox.checkPin();
  await settle(20);
  /* 둘러보기는 들어가면 **샘플 자료**로 바뀐다(기사 이름이 「관장님」 등) → 이름은 안 박는다 */
  ck('둘러보기: 기사 PIN 이 종전처럼 먹힌다 (출퇴근 결과 화면)',
    /기사님 출근 \(\d\d:\d\d\)/.test(R.document.getElementById('pin-result').innerHTML), true);
  ck('둘러보기: 서버를 부르지 않았다', R.api.length, 0);
  /* 차량관리도 서버를 안 부른다 */
  const R2 = boot(NEW, { store: storeOf() });
  R2.win.location.search = '?org=academy_demo';
  R2.ev("currentMode='admin'; currentAdminTab='cars';");
  R2.sandbox.renderCars();
  const g = String(R2.document.getElementById('admin-content').innerHTML || '');
  await settle(20);
  ck('둘러보기 차량관리: 서버를 부르지 않았다', R2.api.length, 0);
  ck('둘러보기 차량관리: 안내만 보인다', /둘러보기에서는 PIN 을 정할 수 없어요/.test(g), true);
  ck('둘러보기: 옮기기 안내도 안 뜬다', /옛 기사 자료 옮기기/.test(g), false);
}

console.log('\n════ 11. 회원·직원 PIN 중복 검사 — 서버에 묻는다 ════');
{
  const R = boot(NEW, { apiReply: { checkPinDup: (b) => ({ ok: true, dup: b.pin === '1234', carId: 'car1' }) } });
  R.ev("currentMode='admin';");
  const dup = await R.sandbox.drvPinDupCar('1234');
  ck('겹치면 기사 이름을 돌려준다', dup, '박기사');
  ck('api checkPinDup 을 불렀다', (R.api[0].body || {}).action, 'checkPinDup');
  ck('안 겹치면 빈 값', await R.sandbox.drvPinDupCar('9999'), '');
  ck('4자리가 아니면 서버를 안 부른다', await R.sandbox.drvPinDupCar('12'), '');

  /* 엑셀 가져오기 — 들어온 PIN 종류만 한 번에 묻는다 */
  const R2 = boot(NEW, { apiReply: { checkPinDup: (b) => ({ ok: true, dup: b.pin === '1234', carId: 'car1' }) } });
  R2.ev("currentMode='admin';");
  const taken = await R2.sandbox.drvPinTakenSet(['1234', '1234', '5678', '', 'ab', '9999']);
  ck('겹친 PIN 만 표시된다', JSON.stringify(taken), JSON.stringify({ '1234': true }));
  ck('같은 PIN 을 두 번 묻지 않는다', R2.api.filter(x => x.body.action === 'checkPinDup').length, 3);

  /* 둘러보기는 서버를 안 부른다 */
  const R3 = boot(NEW);
  R3.win.location.search = '?org=academy_demo';
  ck('둘러보기: 샘플 자료로 본다', await R3.sandbox.drvPinDupCar('1234'), '박기사');
  ck('둘러보기: 서버를 안 불렀다', R3.api.length, 0);

  /* v254 와 달라진 자리 — 소스로 확인 */
  ck('v254 는 cars[].driverPin 을 들여다봤다',
    /dupCar = cars\.find\(function\(c\)\{ return c\.driverPin===pin; \}\)/.test(OLD), true);
  ck('v255 는 서버에 묻는다', /dupCar = await drvPinDupCar\(pin\)/.test(NEW), true);
  ck('직원 저장도 서버에 묻는다', /dupC\s*=\s*await drvPinDupCar\(pin\)/.test(NEW), true);
  ck('엑셀 가져오기도 서버에 묻는다', /_drvTaken\[pin\]/.test(NEW), true);
}

console.log('\n════ 12. 안내문·버전 ════');
{
  const fs = require('fs');
  /* v256 이후 버전은 올라간다 — 지켜야 할 것은 **둘이 같은 숫자인가** 다 */
  const _vj = JSON.parse(_pinRead('version.json')).version;
  const _av = Number((NEW.match(/const APP_VERSION = (\d+);/) || [])[1]);
  console.log('      지금 버전: ' + _vj + ' (이 회차는 255 였다)');
  ck('version.json 과 APP_VERSION 이 같은 숫자 (' + _av + ')', _vj, _av);
  ck('255 이상', _vj >= 255, true);
  const R = boot(NEW);
  const qa = R.ev('HELP_QA');
  ck('도우미 문답이 늘었다', qa.length > boot(OLD).ev('HELP_QA').length, true);
  const find = (t) => qa.filter(x => x.t.indexOf(t) >= 0);
  ck('「기사 로그인 (업체 번호 + PIN)」 문답이 있다', find('기사 로그인 (업체 번호 + PIN)').length, 1);
  ck('「출근·퇴근 기록하기」 문답이 있다', find('출근·퇴근 기록하기').length, 1);
  ck('「옛 기사 자료 옮기기」 문답이 있다', find('옛 기사 자료 옮기기').length, 1);
  ck('옛 「PIN 출퇴근 체크」 문답은 없다', find('PIN 출퇴근 체크').length, 0);
  ck('「기사 계정 만들어 주기」 문답은 없다', find('기사 계정 만들어 주기').length, 0);
  const allA = qa.map(x => x.a).join('\n');
  ck('안내문에 「기사 PIN 출퇴근 체크」가 안 남았다', /기사 PIN 출퇴근 체크/.test(allA), false);
  ck('안내문이 업체 번호를 설명한다', /업체 번호 6자리/.test(allA), true);
  ck('기사 역할 문답에 로그인 ≠ 출근 설명', /로그인은 출근이 아니에요|로그인과 출근은 따로/.test(allA), true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
})();
