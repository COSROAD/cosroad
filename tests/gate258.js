/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ── v258 보정5 ①의 **문턱 검사** ─────────────────────────────────────────────
   규칙·앱의 기사 읽기 목록에서 attendance·attendanceTime 을 빼기 **전에**,
   기사 화면이 그 둘을 **읽는** 자리가 정말 0인지 본다. 하나라도 있으면 멈추고 보고.

   방법은 v257 과 같다 — 출발점을 내가 고르지 않고 **화면에서 뽑는다.**
   (가) 기사 모드로 4업종 운행·회원 화면을 실제로 그리고, 그려진 HTML + 기사가 보는
        정적 HTML 에서 `onclick/oninput/onchange="함수("` 를 전부 긁는다.
   (나) 그 입구에서 소스의 함수 호출을 따라가며 「출석을 읽는 자리」에 닿는 길을 찾는다.
        읽는 자리 = loadAttendance · loadAttendanceTime · getAttendanceToday · attTimeInfo
                  · markAttendanceTime(읽고 쓴다) · loadFromFirebase('attendance'|'attendanceTime')
   ★ 대조: 관리자 출발점은 닿아야 한다. 안 닿으면 이 검사는 못 믿는다. */
const E = require('./env246.js');
const cp = require('child_process');
/* ★ 이 묶음은 **바꾸기 전**(v257, 4ac625b)을 보는 문턱 검사다.
   고친 뒤의 코드로 돌리면 「이미 빠졌다」가 되어 문턱의 뜻이 사라진다.
   그래서 기준 판을 못 박는다 — 뒤에 무엇을 하든 이 기록은 그대로 돌아간다.
   (고친 뒤의 모습은 o_app258.js 가 본다) */
const GATE_REF = process.env.COS_GATE_REF || '4ac625b';
const SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + GATE_REF + ':index.html', { maxBuffer: 1 << 28 })
  .toString().replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 76)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

function collectFns(src) {
  const out = Object.create(null);
  const grab = (re) => {
    let m;
    while ((m = re.exec(src))) {
      const name = m[1];
      let i = src.indexOf('{', m.index + m[0].length - 1);
      if (i < 0) continue;
      let d = 0, j = i;
      for (; j < src.length; j++) {
        const c = src[j];
        if (c === '{') d++;
        else if (c === '}') { d--; if (d === 0) { j++; break; } }
      }
      out[name] = (out[name] || '') + '\n' + src.slice(i, j);
    }
  };
  grab(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g);
  grab(/(?:^|\n)\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*\(|\([^)]*\)\s*=>)/g);
  return out;
}
const FNS = collectFns(SRC);

const READERS = ['loadAttendance', 'loadAttendanceTime', 'getAttendanceToday', 'attTimeInfo', 'markAttendanceTime'];
const READ_RE = /loadFromFirebase\(\s*['"](attendance|attendanceTime)['"]|localStorage\.getItem\(\s*['"]tkd_attendance/;
const isReader = (n) => READERS.indexOf(n) >= 0 || (FNS[n] ? READ_RE.test(FNS[n]) : false);

const ADMIN_ONLY = ['openEditModal', 'deleteMemberById'];
const EXTRA_EDGES = { openPinCheckin: ['pinPress'] };
const callsCache = new Map();
function calls(name) {
  if (callsCache.has(name)) return callsCache.get(name);
  const b = FNS[name] || '';
  const found = new Set(); let m;
  const re = /([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = re.exec(b))) { if (FNS[m[1]] && m[1] !== name) found.add(m[1]); }
  const re2 = /on(?:click|input|change)=\\?["']\s*([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = re2.exec(b))) { if (FNS[m[1]]) found.add(m[1]); }
  callsCache.set(name, [...found]);
  return callsCache.get(name);
}
function findPath(start, blocked) {
  const seen = new Set(), q = [[start, [start]]];
  while (q.length) {
    const [n, path] = q.shift();
    if (seen.has(n)) continue;
    seen.add(n);
    if (isReader(n)) return path;
    if (blocked.indexOf(n) >= 0) continue;
    calls(n).concat(EXTRA_EDGES[n] || []).forEach(c => { if (FNS[c] && !seen.has(c)) q.push([c, path.concat([c])]); });
  }
  return null;
}

/* ── 앱 올리기 ── */
const SUF = '__cosroad_default';
const DAYS7 = ['월', '화', '수', '목', '금', '토', '일'];
function storeOf() {
  const st = {};
  const put = (k, v) => {
    st[k + SUF] = JSON.stringify(v);
    ['academy_demo', 'public_demo', 'logistics_demo', 'delivery_demo'].forEach(o => { st[k + '__' + o] = JSON.stringify(v); });
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
function boot(src, biz, search) {
  const R = E.build({ src: src || SRC, biz: biz || 'academy', localStorage: storeOf() });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-tabs', 'main-header', 'member-screen', 'member-list',
   'member-add-area', 'filter-chips', 'search-input', 'day-tabs', 'header-btns', 'mode-badge',
   'drive-screen', 'admin-screen', 'bottom-action', 'drv-punch-msg', 'pin-result', 'pin-dots',
   'pin-checkin-modal', 'sort-asc-btn', 'sort-desc-btn', 'fb-loading'].forEach(id => {
    const el = E.makeEl('div'); el.id = id;
    el.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
    R.document.registerId(id, el);
  });
  if (search) R.win.location.search = R.sandbox.location.search = search;
  R.win._auth = R.sandbox._auth = { currentUser: { uid: 'drv_x', isAnonymous: false, getIdToken: async () => 'T' } };
  R.win._db = R.sandbox._db = {};
  R.read = []; R.listen = [];
  R.win._firestore = R.sandbox._firestore = {
    doc: (db, ...p) => ({ _p: p.join('/') }), collection: (db, ...p) => ({ _p: p.join('/') }),
    getDoc: async (ref) => { R.read.push(String(ref._p || '')); return { exists: () => false, data: () => ({}) }; },
    setDoc: async () => {}, deleteDoc: async () => {},
    getDocs: async () => ({ forEach: () => {} }),
    onSnapshot: (ref) => { R.listen.push(String(ref._p || '')); return () => {}; }
  };
  R.win.fetch = R.sandbox.fetch = async () => ({ json: async () => ({ ok: false }) });
  return R;
}

console.log('════ 0. 준비 ════');
ck('소스에서 찾은 함수 수 (300개 이상)', Object.keys(FNS).length >= 300, true);
ck('읽는 함수 다섯을 다 찾았다', READERS.every(r => FNS[r]), true);
ck('지금 버전 (바꾸기 전)', (SRC.match(/const APP_VERSION = (\d+);/) || [])[1], '257');

console.log('\n════ 1. 대조 먼저 — 관리자 출발점은 출석을 읽나 ════');
[['renderAttendance', '출결관리 화면'],
 ['openDateCheck', '날짜 점검'],
 ['checkPin', 'PIN 체크인'],
 ['renderDashboard', '현황(대시보드) → 관리 탭으로 이어진다']].forEach(([f, why]) => {
  if (!FNS[f]) { ck('[관리자] ' + f + ' — 함수를 못 찾음', false, true); return; }
  const p = findPath(f, []);
  ck('[관리자] ' + f + ' — ' + why, p ? p.join(' → ').slice(0, 72) : '✘ 안 읽음',
    p ? p.join(' → ').slice(0, 72) : '읽어야 한다');
});

console.log('\n════ 2. 기사 화면에서 실제로 그려진 입구 긁기 ════');
const entries = new Set();
['academy', 'public', 'logistics', 'delivery'].forEach(biz => {
  const R = boot(SRC, biz);
  R.ev("currentMode='driver'; window._driverCarId='car1'; currentCarId='car1';");
  try { R.sandbox.renderDrive(); } catch (e) { console.log('      ! renderDrive(' + biz + '): ' + e.message); }
  try { R.sandbox.renderMembers(); } catch (e) { console.log('      ! renderMembers(' + biz + '): ' + e.message); }
  ['drive-tabs', 'app-content', 'filter-chips', 'member-list'].forEach(id => {
    const h = String(R.document.getElementById(id).innerHTML || '');
    const re = /on(?:click|input|change)="\s*([A-Za-z_$][\w$]*)\s*\(/g; let m;
    while ((m = re.exec(h))) entries.add(m[1]);
  });
});
const STATIC_DRIVER = (() => {
  const a = SRC.indexOf('<div id="drive-screen">');
  const b = SRC.indexOf('<div class="admin-screen"');
  const c = SRC.indexOf('<div class="bottom-action"');
  const d = SRC.indexOf('<!-- 모달: 원생 등록/수정 -->');
  return (a >= 0 && b > a ? SRC.slice(a, b) : '') + (c >= 0 && d > c ? SRC.slice(c, d) : '');
})();
{
  const re = /on(?:click|input|change)="\s*([A-Za-z_$][\w$]*)\s*\(/g; let m;
  while ((m = re.exec(STATIC_DRIVER))) if (FNS[m[1]]) entries.add(m[1]);
}
/* 화면 바깥 입구 (헤더·로그인 뒤 자동으로 도는 것) */
['switchTab', 'logout', 'renderDrive', 'renderMembers', 'filterDriverMembers', 'setMemberSort',
 'driverPunch', 'demoPunch', 'saveDriverOdo', 'openDriverCarlog', 'toggleStudent', 'openHelperChat',
 'renderByTab', 'updateUI']
  .forEach(n => { if (FNS[n]) entries.add(n); });
/* ★ 「덩어리 동기화 기계」는 화면이 아니다 — 따로 본다(아래 6장).
   syncFromFirebase·loadFromFirebase·startFirebaseListeners 는 **키 목록을 받아 내려받는** 틀이고,
   이번 회차가 바꾸는 바로 그 자리다. 화면이 출석을 **쓰는가**는 이 셋을 빼고 본다. */
const MACHINE = ['syncFromFirebase', 'loadFromFirebase', 'startFirebaseListeners'];
MACHINE.forEach(n => entries.delete(n));
const ENTRIES = [...entries].filter(n => FNS[n]).sort();
console.log('      기사 입구 ' + ENTRIES.length + '개: ' + ENTRIES.join(', '));
ck('입구가 15개 이상 (빈 화면 아님)', ENTRIES.length >= 15, true);

console.log('\n════ 3. ★ 그 입구에서 출석을 읽는 길 (0 이어야 한다) ════');
const BLOCKED = ['switchTab', 'openPinCheckin'].concat(ADMIN_ONLY);
const hits = [];
ENTRIES.forEach(f => { const p = findPath(f, BLOCKED); if (p) hits.push(f + ' : ' + p.join(' → ')); });
hits.forEach(h => console.log('      ★ ' + h));
ck('기사 입구 ' + ENTRIES.length + '개에서 출석을 읽는 길', hits.length, 0);

console.log('\n════ 4. 대조 — 막힌 문을 열면 읽는다 ════');
[['switchTab', 'switchTab'], ['openPinCheckin', 'openPinCheckin']].forEach(([g, from]) => {
  const p = findPath(from, BLOCKED.filter(x => x !== g));
  ck(g + ' 을 열면 읽는다', p ? '읽는다 (' + p.slice(0, 5).join(' → ') + ')' : '✘ 안 읽음',
    p ? '읽는다 (' + p.slice(0, 5).join(' → ') + ')' : '읽어야 한다');
});

console.log('\n════ 5. 실제로 돌려 보기 — 기사 모드가 두 키를 부르나 ════');
{
  const R = boot(SRC, 'academy');
  R.ev("currentMode='driver'; window._driverCarId='car1'; currentCarId='car1';");
  const called = [];
  const realLoad = R.sandbox.loadFromFirebase;
  R.sandbox.loadFromFirebase = R.win.loadFromFirebase = async function (key) { called.push(String(key)); return realLoad.call(this, key); };
  const ran = [];
  const go = (n, f) => { try { f(); ran.push(n); } catch (e) { ran.push(n + '(멈춤:' + e.message.slice(0, 20) + ')'); } };
  go('renderDrive', () => R.sandbox.renderDrive());
  go('renderMembers', () => R.sandbox.renderMembers());
  go('filterDriverMembers', () => R.sandbox.filterDriverMembers(''));
  go('toggleStudent', () => R.sandbox.toggleStudent(0));
  go('openDriverCarlog', () => R.sandbox.openDriverCarlog());
  console.log('      돌린 것: ' + ran.join(' · '));
  console.log('      loadFromFirebase 로 부른 키: ' + (called.join(', ') || '없음'));
  ck('화면을 그릴 때 두 키를 부르지 않는다',
    called.filter(k => k === 'attendance' || k === 'attendanceTime').length, 0);
  /* 리스너가 거는 키 (기사 모드) */
  const R2 = boot(SRC, 'academy');
  R2.ev("currentMode='driver'; window._driverCarId='car1';");
  let listenKeys = [];
  try { R2.sandbox.startFirebaseListeners(); listenKeys = R2.listen.slice(); } catch (e) { listenKeys = ['ERR:' + e.message.slice(0, 30)]; }
  console.log('      리스너가 거는 자리: ' + (listenKeys.join(', ') || '없음'));
  /* 기사 읽기 허용 목록 (지금) */
  console.log('      지금 DRIVER_READ_KEYS: ' + JSON.stringify(R2.ev('DRIVER_READ_KEYS')));
  ck('driverKeyAllowed("attendance") — 지금은 열려 있다', R2.ev('driverKeyAllowed("attendance")'), true);
  ck('지금은 리스너가 출석 두 자리에도 붙는다 (이번 회차가 막을 자리)',
    listenKeys.filter(k => /\/attendance$|\/attendanceTime$/.test(k)).length, 2);
}

console.log('\n════ 6. 덩어리 동기화 기계 — 지금은 두 키를 부른다 (이번 회차가 바꿀 자리) ════');
{
  console.log('      buildPayrollData 가 출석을 읽나: '
    + (findPath('buildPayrollData', []) ? '읽는다' : '안 읽는다 (driverAtt 만 본다)'));
  MACHINE.forEach(n => {
    if (!FNS[n]) { console.log('      ! 함수 없음: ' + n); return; }
    const p = findPath(n, []);
    console.log('      ' + n.padEnd(24) + (p ? '출석을 다룬다' : '안 다룬다'));
  });
  ck('syncFromFirebase 가 지금 attendance 를 내려받는다',
    /loadFromFirebase\('attendance'\)/.test(FNS['syncFromFirebase'] || ''), true);
  ck('syncFromFirebase 가 지금 attendanceTime 도 내려받는다',
    /loadFromFirebase\('attendanceTime'\)/.test(FNS['syncFromFirebase'] || ''), true);
  ck('리스너가 키 목록을 driverKeyAllowed 로 걸러 쓴다',
    /keys = keys\.filter\(driverKeyAllowed\)/.test(FNS['startFirebaseListeners'] || ''), true);
  ck('loadFromFirebase 에 기사 가드가 있다 (목록을 줄이면 부르지도 않는다)',
    /currentMode==='driver' && key!=='aligo' && !driverKeyAllowed\(key\)/.test(FNS['loadFromFirebase'] || ''), true);
  ck('화면 입구에서 출석을 읽는 길 0 (3장과 같은 결론)', hits.length, 0);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건 — **멈추고 보고해야 한다**'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과 — 읽기 목록을 줄여도 된다'));
process.exit(fail ? 1 : 0);
