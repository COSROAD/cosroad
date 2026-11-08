/* ── v257 보정4 ①: 기사 모드에서 attendance·attendanceTime 에 저장하는 길이 **정말 0인가** ──
   규칙(firestore.rules)에서 기사 쓰기 키를 빼기 전에 해야 하는 전수 확인이다.

   방법 — 추측하지 않는다. 출발점을 **내가 고르지 않고 화면에서 뽑는다.**
   (나) 기사 모드로 앱을 올려 운행·회원 두 화면을 실제로 그리고, 그려진 HTML 에서
        `onclick="fn(…)"` 를 전부 긁어 **기사가 누를 수 있는 함수 목록**을 만든다.
   (가) 그 목록에서 출발해 소스의 함수 호출을 따라가며 「attendance 쓰기」에 닿는 길을 찾는다.
        쓰기 = saveAttendanceData · saveAttendanceTime · markAttendanceTime
             · saveToFirebase('attendance'|'attendanceTime')
   (다) 실제로 saveToFirebase 를 가로채 두고 화면을 그리고 단추를 눌러 모인 키를 본다.

   ★ 대조: 같은 그래프에 **관리자** 출발점을 넣으면 쓰기에 닿아야 한다. 안 닿으면 못 믿는다. */
const E = require('./env246.js');
const SRC = E.SRC_NEW;

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 76)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

/* ── 소스에서 함수 정의 모으기 (중괄호 맞춰 본문까지) ── */
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

const WRITERS = ['saveAttendanceData', 'saveAttendanceTime', 'markAttendanceTime'];
const WRITE_RE = /saveToFirebase\(\s*['"](attendance|attendanceTime)['"]/;
const isWriter = (n) => WRITERS.indexOf(n) >= 0 || (FNS[n] ? WRITE_RE.test(FNS[n]) : false);

/* 「관리자일 때만 나오는 단추」는 기사 쪽 간선에서 뺀다 —
   뺄 자격이 있는지 **소스 글자로 증명**한 뒤에만 뺀다(그 이름이 나오는 모든 자리가
   currentMode==='admin' 삼항 안인지 본다). */
const ADMIN_ONLY = ['openEditModal', 'deleteMemberById'];
function provedAdminOnly(name) {
  /* 기사·관리자가 **함께 쓰는** 두 렌더러 안에서만 본다 —
     renderAdminMembers·filterAdminMembers 는 관리 탭 전용이라 기사가 못 들어간다
     (switchTab 가드, 아래 2장). */
  const SCOPES = ['renderMembers', 'filterDriverMembers'];
  let all = 0, guarded = 0;
  SCOPES.forEach(sc => {
    const body = FNS[sc] || '';
    const needle = 'onclick="' + name + '(';
    let i = 0;
    for (;;) {
      i = body.indexOf(needle, i);
      if (i < 0) break;
      all++;
      if (/currentMode===['"]admin['"]\s*\?/.test(body.slice(Math.max(0, i - 300), i))) guarded++;
      i += needle.length;
    }
  });
  return all > 0 && all === guarded ? true : (all + '곳 중 ' + guarded + '곳만 관리자 조건 안');
}
const callsCache = new Map();
function calls(name) {
  if (callsCache.has(name)) return callsCache.get(name);
  const b = FNS[name] || '';
  const found = new Set();
  let m;
  const re = /([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = re.exec(b))) { if (FNS[m[1]] && m[1] !== name) found.add(m[1]); }
  const re2 = /onclick=\\?["']\s*([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = re2.exec(b))) { if (FNS[m[1]]) found.add(m[1]); }
  callsCache.set(name, [...found]);
  return callsCache.get(name);
}
/* 정적 HTML 로 이어지는 간선 — 함수 본문에는 없지만 **화면에서는 이어진다**.
   openPinCheckin 은 pin-checkin-modal 을 띄우고, 그 모달의 단추가 pinPress 다.
   (pinPress 는 4자리가 차면 checkPin 을 부른다 → checkPin 이 출석을 저장한다) */
const EXTRA_EDGES = { openPinCheckin: ['pinPress'] };
const PIN_MODAL = (() => {
  const i = SRC.indexOf('id="pin-checkin-modal"');
  return i < 0 ? '' : SRC.slice(i, i + 4000);
})();

function findPath(start, blocked) {
  const seen = new Set(), q = [[start, [start]]];
  while (q.length) {
    const [n, path] = q.shift();
    if (seen.has(n)) continue;
    seen.add(n);
    if (isWriter(n)) return path;
    if (blocked.indexOf(n) >= 0) continue;
    calls(n).concat(EXTRA_EDGES[n] || []).forEach(c => {
      if (FNS[c] && !seen.has(c)) q.push([c, path.concat([c])]);
    });
  }
  return null;
}

/* ── 앱 올리기 ── */
const SUF = '__cosroad_default';
const store = {};
const put = (k, v) => { store[k + SUF] = JSON.stringify(v); };
put('tkd_cars', [
  { id: 'car1', name: '1호차', driver: '박기사', phone: '010-5555-6666' },
  { id: 'car2', name: '2호차', driver: '최기사', phone: '010-7777-8888' }
]);
put('tkd_members', [
  { id: 1, name: '강하은', courseId: 'c1', carId: 'car1', location: '유원아파트', lat: 37.4, lon: 126.7,
    phone: '010-1111-1111', days: ['월','화','수','목','금','토','일'], pin: '1111', on: true },
  { id: 2, name: '김여름', courseId: 'c1', carId: 'car1', location: '송도동 1', lat: 37.39, lon: 126.65,
    phone: '010-2222-2222', days: ['월','화','수','목','금','토','일'], pin: '2222', on: true },
  { id: 3, name: '박겨울', courseId: 'c1', carId: 'car2', location: '연수구 2', lat: 37.41, lon: 126.69,
    phone: '010-3333-3333', days: ['월','화','수','목','금','토','일'], pin: '3333', on: true },
  { id: 4, name: '이가을', courseId: 'c1', carId: '', location: '미배정동 3', lat: 37.42, lon: 126.68,
    phone: '010-4444-4444', days: ['월','화','수','목','금','토','일'], pin: '4444', on: true }
]);
put('tkd_courses', [{ id: 'c1', name: 'A반', depart: '15:00', carId: 'car1' }]);
put('tkd_org', { name: '코스로드학원', lat: 37.4, lon: 126.7 });
put('tkd_staff', []); put('tkd_driver_att', {}); put('tkd_attendance', {});
put('tkd_payments', {}); put('tkd_tax', {}); put('tkd_carlog', {});

function boot(opts) {
  opts = opts || {};
  const R = E.build({ src: opts.src || SRC, biz: opts.biz || 'academy', localStorage: Object.assign({}, store) });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-tabs', 'main-header', 'member-screen', 'member-list',
   'member-add-area', 'filter-chips', 'search-input', 'day-tabs', 'header-btns', 'mode-badge',
   'drive-screen', 'admin-screen', 'bottom-action', 'org-icon', 'drv-punch-msg', 'pin-result',
   'pin-dots', 'pin-checkin-modal', 'sort-asc-btn', 'sort-desc-btn'].forEach(id => {
    const el = E.makeEl('div'); el.id = id;
    el.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
    R.document.registerId(id, el);
  });
  R.win._auth = R.sandbox._auth = { currentUser: { uid: 'drv_x', isAnonymous: false, getIdToken: async () => 'T' } };
  R.win._db = R.sandbox._db = {};
  R.win._firestore = R.sandbox._firestore = {
    doc: (db, ...p) => ({ _p: p.join('/') }), collection: (db, ...p) => ({ _p: p.join('/') }),
    getDoc: async () => ({ exists: () => false, data: () => ({}) }), setDoc: async () => {},
    deleteDoc: async () => {}, getDocs: async () => ({ forEach: () => {} }), onSnapshot: () => () => {}
  };
  /* saveToFirebase 를 가로채 **키만** 모은다 (실제로는 아무것도 보내지 않는다) */
  R.saved = [];
  R.ev('window.__cap=[];');
  R.sandbox.saveToFirebase = R.win.saveToFirebase = function (key) { R.saved.push(String(key)); return null; };
  R.win.fetch = R.sandbox.fetch = async () => ({ json: async () => ({ ok: false, message: 'x' }) });
  return R;
}

console.log('════ 0. 준비 ════');
ck('소스에서 찾은 함수 수 (300개 이상)', Object.keys(FNS).length >= 300, true);
ck('쓰기 함수 셋을 다 찾았다', WRITERS.every(w => FNS[w]), true);
ADMIN_ONLY.forEach(n => ck('「' + n + '」 는 공용 렌더러에서 관리자일 때만 (소스 증명)', provedAdminOnly(n), true));

console.log('\n════ 1. 대조 먼저 — 관리자 출발점은 쓰기에 닿나 ════');
[['renderAttendance', '출결관리 화면 (출석/결석 단추)'],
 ['openDateCheck', '날짜 점검 (하루 뒤로 옮기기)'],
 ['checkPin', 'PIN 체크인 판 확인'],
 ['renderSettings', '설정 → 백업 복원']].forEach(([f, why]) => {
  const p = findPath(f, []);
  ck('[관리자] ' + f + ' — ' + why, p ? p.join(' → ').slice(0, 76) : '✘ 못 닿음',
    p ? p.join(' → ').slice(0, 76) : '닿아야 한다');
});

console.log('\n════ 2. 기사 모드 가드가 소스에 정말 있나 ════');
ck('switchTab — 기사는 관리 화면에 못 들어간다',
  /if\(currentMode==='driver'\)\{ currentTab='drive'; switchTab\('drive'\); return; \}/.test(SRC), true);
ck('openPinCheckin — 기사는 PIN 판을 못 연다',
  /function openPinCheckin\(\)\{[\s\S]{0,800}?currentMode==='driver'[\s\S]{0,260}?return;/.test(SRC), true);
/* 정적 간선이 정말 있는지 — 모달 HTML 과 pinPress 본문으로 증명 */
ck('   PIN 모달 단추가 pinPress 다 (정적 HTML)', /onclick="pinPress\(/.test(PIN_MODAL), true);
ck('   pinPress 는 4자리에서 checkPin 을 부른다', /checkPin\(\);/.test(FNS['pinPress'] || ''), true);
ck('   openPinCheckin 이 그 모달을 띄운다',
  /pin-checkin-modal'\)\.classList\.add\('show'\)/.test(FNS['openPinCheckin'] || ''), true);
const BLOCKED = ['switchTab', 'openPinCheckin'].concat(ADMIN_ONLY);

console.log('\n════ 3. 기사 화면에서 **실제로 그려진** 단추를 긁어 모은다 ════');
const entries = new Set();
const screens = {};
['academy', 'public', 'logistics', 'delivery'].forEach(biz => {
  const R = boot({ biz: biz });
  R.ev("currentMode='driver'; window._driverCarId='car1'; currentCarId='car1'; currentDay='" + R.ev('currentDay') + "';");
  try { R.sandbox.renderDrive(); } catch (e) { console.log('      ! renderDrive(' + biz + '): ' + e.message); }
  const drive = String(R.document.getElementById('drive-tabs').innerHTML || '')
    + String(R.document.getElementById('app-content').innerHTML || '');
  try { R.sandbox.renderMembers(); } catch (e) { console.log('      ! renderMembers(' + biz + '): ' + e.message); }
  const mem = String(R.document.getElementById('filter-chips').innerHTML || '')
    + String(R.document.getElementById('member-list').innerHTML || '');
  screens[biz] = { drive: drive, mem: mem, saved: R.saved.slice() };
  [drive, mem].forEach(h => {
    const re = /on(?:click|input|change)="\s*([A-Za-z_$][\w$]*)\s*\(/g; let m;
    while ((m = re.exec(h))) entries.add(m[1]);
  });
});
/* 기사가 보는 **정적 HTML** 의 단추도 입구다 — 아래 단추 띠(공유·최적화·T맵)와 회원 화면 */
const STATIC_DRIVER = (() => {
  const a = SRC.indexOf('<div id="drive-screen">');
  const b = SRC.indexOf('<div class="admin-screen"');
  const c = SRC.indexOf('<div class="bottom-action"');
  const d = SRC.indexOf('<!-- 모달: 원생 등록/수정 -->');
  return (a >= 0 && b > a ? SRC.slice(a, b) : '') + (c >= 0 && d > c ? SRC.slice(c, d) : '');
})();
{
  const re = /on(?:click|input|change)="\s*([A-Za-z_$][\w$]*)\s*\(/g; let m;
  const got = [];
  while ((m = re.exec(STATIC_DRIVER))) { if (FNS[m[1]]) { entries.add(m[1]); got.push(m[1]); } }
  console.log('      정적 HTML 입구: ' + [...new Set(got)].join(', '));
  ck('정적 HTML 에서 공유·최적화·T맵을 찾았다',
    ['showSharePanel', 'optimizeRoute', 'openTmap'].every(n => got.indexOf(n) >= 0), true);
}
/* 화면 바깥의 기사 입구도 함께 (헤더 단추·검색칸·출퇴근) */
['switchTab', 'logout', 'renderDrive', 'renderMembers', 'filterDriverMembers', 'setMemberSort',
 'driverPunch', 'saveDriverOdo', 'openDriverCarlog', 'toggleStudent', 'openHelperChat',
 'loadFromFirebase', 'startListeners'].forEach(n => { if (FNS[n]) entries.add(n); });
const ENTRIES = [...entries].filter(n => FNS[n]).sort();
console.log('      기사가 누를 수 있는 함수 ' + ENTRIES.length + '개: ' + ENTRIES.join(', '));
ck('기사 화면에서 긁은 입구가 15개 이상 (빈 화면 아님)', ENTRIES.length >= 15, true);
console.log('      (입구가 적으면 화면이 안 그려진 것 — 숫자를 먼저 본다)');

console.log('\n════ 4. 그 입구에서 attendance 쓰기에 닿는 길 (0 이어야 한다) ════');
const hits = [];
ENTRIES.forEach(f => {
  const p = findPath(f, BLOCKED);
  if (p) hits.push(f + ' : ' + p.join(' → '));
});
hits.forEach(h => console.log('      ★ ' + h));
ck('기사 입구 ' + ENTRIES.length + '개에서 쓰기에 닿는 길', hits.length, 0);

console.log('\n════ 5. 대조 — 막힌 문을 열면 닿는다 (가드가 막고 있다는 증거) ════');
[['switchTab', 'switchTab'], ['openPinCheckin', 'openPinCheckin'],
 ['deleteMemberById', 'deleteMemberById']].forEach(([guard, from]) => {
  const p = findPath(from, BLOCKED.filter(x => x !== guard));
  ck(guard + ' 을 열면 쓰기에 닿는다', p ? '닿는다 (' + p.slice(0, 5).join(' → ') + ')' : '✘ 안 닿음',
    p ? '닿는다 (' + p.slice(0, 5).join(' → ') + ')' : '닿아야 한다');
});

console.log('\n════ 6. 실제로 돌려 보기 — 모인 saveToFirebase 키 ════');
{
  const R = boot({});
  R.ev("currentMode='driver'; window._driverCarId='car1'; currentCarId='car1';");
  const ran = [];
  const tryRun = (label, fn) => { try { fn(); ran.push(label); } catch (e) { ran.push(label + '(멈춤:' + e.message.slice(0, 24) + ')'); } };
  tryRun('renderDrive', () => R.sandbox.renderDrive());
  tryRun('renderMembers', () => R.sandbox.renderMembers());
  tryRun('filterDriverMembers', () => R.sandbox.filterDriverMembers(''));
  tryRun('setMemberSort', () => R.sandbox.setMemberSort(true));
  tryRun('toggleStudent(0)', () => R.sandbox.toggleStudent(0));
  tryRun('toggleStudent(1)', () => R.sandbox.toggleStudent(1));
  tryRun('openPinCheckin', () => R.sandbox.openPinCheckin());
  tryRun("switchTab('admin')", () => R.sandbox.switchTab('admin'));
  tryRun('openDriverCarlog', () => R.sandbox.openDriverCarlog());
  console.log('      돌린 것: ' + ran.join(' · '));
  console.log('      모인 키: ' + (R.saved.join(', ') || '없음'));
  ck('attendance·attendanceTime 이 모인 키에 없다',
    R.saved.filter(k => k === 'attendance' || k === 'attendanceTime').join(',') || '없음', '없음');
  ck('   (대조) 관리자 출석 단추를 누르면 attendance 가 모인다', (() => {
    const A = boot({});
    A.ev("currentMode='admin'; currentAdminTab='attendance'; attViewDate=todayStr();");
    try { A.sandbox.setAttendance(1, 'present'); } catch (e) { return 'ERR:' + e.message.slice(0, 30); }
    return A.saved.indexOf('attendance') >= 0 ? '모인다' : '안 모인다 (' + A.saved.join(',') + ')';
  })(), '모인다');
  ck('   기사 PIN 판은 열리지 않았다 (토스트만)',
    (R.toasts || []).some(t => /관리자 화면에서/.test(t)), true);
  /* 기사 회원 화면에 관리자 단추가 실제로 안 나오나 — 대조로 관리자 화면에는 나와야 한다 */
  const drvMem = String(R.document.getElementById('member-list').innerHTML || '');
  ck('   기사 회원 화면에 수정·삭제 단추 0개',
    (drvMem.match(/openEditModal|deleteMemberById/g) || []).length, 0);
  ck('   (대조) 관리자 회원 화면에는 나온다', (() => {
    const A = boot({});
    A.ev("currentMode='admin';");
    try { A.sandbox.renderMembers(); } catch (e) { return 'ERR'; }
    const h = String(A.document.getElementById('member-list').innerHTML || '');
    return (h.match(/openEditModal/g) || []).length > 0 ? '나온다' : '안 나온다';
  })(), '나온다');
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
