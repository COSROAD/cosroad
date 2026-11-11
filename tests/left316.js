/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드72-B 보정1 — **v277~v314 동안 기기에만 남은 기록**이 v315 에서 서버로 가는가.
   ★★ 왜 — 그 기간 `runTransaction` 이 import 에 없어 「바뀐 칸만」 쓰기 셋
     (`writeCarStatePatch`·`writeStaffAttPatch`·`writeAttendancePatch`)이 **거짓만 돌려주고
     아무것도 쓰지 않았다**(72-B 1번 항목). 그래서 앱에서 누른 탑승 토글·차계부
     ·납품/하차 완료·수기 근태·수기 출석이 **그 기기 localStorage 에만** 남아 있을 수 있다.
   ① 재현 — v315 로 앱을 열면(첫 동기화) 그 기록이 **서버값으로 덮여 사라지는가**
   ② 다음 저장 때 올라가는가
   ③ 고친 뒤 — 첫 동기화가 **「서버에 없는 칸」만 한 번** 올리는가(지움은 안 보낸다)
   ④ 업체 확인 · 읽기 전용·둘러보기 제외 · 기사/관리자 둘 다 · 두 번 올리지 않는가
   ★ 바깥 통신 0 — 가짜 Firestore. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');
const { thisRef, srcAt } = require('./thisref.js');   /* 회차 커밋 찾기·그 커밋의 글 한 벌 */

const OLD_REF = process.env.COS_SRC_OLD_REF || '000ee3a';   /* v315 — 고치기 전 */
const F = (p) => fs.readFileSync(COS_ROOT + '/' + p, 'utf8').replace(/\r\n/g, '\n');
const NEW_SRC = F('index.html');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const THIS_REF = thisRef(316);

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52)
    + String(got).slice(0, 40) + (ok ? '' : '   (기대 ' + want + ')'));
};

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1' },
  { id: 2, name: '나다움', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2', lat: 37.42, lon: 126.69, phone: '010-2' },
  { id: 3, name: '다보람', carId: 'car2', courseId: 'c1', days: D7, location: '인천 3', lat: 37.43, lon: 126.70, phone: '010-3' }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사' }, { id: 'car2', name: '2호차', driver: '김기사' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const STAFF = [{ id: 'st1', name: '김직원' }];
const TODAY = (() => { const d = new Date(); const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();

/* 서버 — 차량 기록은 **서버가 찍은 것만** 있다(앱이 못 썼으므로) */
function makeServer() {
  return {
    'data/members': JSON.stringify(MEM), 'data/cars': JSON.stringify(CARS),
    'data/courses': JSON.stringify(COURSES), 'data/staff': JSON.stringify(STAFF),
    'data/org': JSON.stringify({ name: '가온학원', icon: '🚐', bizType: 'academy',
      destName: '학원', destLat: 37.44, destLon: 126.65 }),
    'data/migration': JSON.stringify({ carState: true, at: 1 }),
    /* 서버 `punch` 가 찍은 1호차 출근 — **이것을 지우면 안 된다** */
    'carState/car1': JSON.stringify({ ride: {}, rideOff: {}, carlog: { records: [], plans: {} },
      delivDone: {}, dropDone: {}, att: { [TODAY]: { in: '08:30' } } }),
    'carState/car2': JSON.stringify({ ride: {}, rideOff: {}, carlog: { records: [], plans: {} },
      delivDone: {}, dropDone: {}, att: {} }),
    /* 서버 `punchStaff` 가 찍은 직원 출근 */
    'data/staffAtt': JSON.stringify({ ['st1_' + TODAY]: { in: '09:00' } }),
    /* 서버 `punchMember` 가 찍은 «회원»3 출석 */
    'data/attendance': JSON.stringify({ [TODAY]: { '3': 'present' } }),
    'data/attendanceTime': JSON.stringify({ [TODAY]: { '3': '09:05' } })
  };
}

/* 기기 — v277~v314 동안 **앱에서 누른 것**이 폰에만 남아 있다 */
function deviceLocal(mode, SUF, opt_org) {
  const L = {};
  const put = (k, v) => { L[k + SUF] = JSON.stringify(v); L[k] = JSON.stringify(v); };
  put('tkd_members', MEM); put('tkd_cars', CARS); put('tkd_courses', COURSES);
  put('tkd_staff', STAFF); put('tkd_notices', []);
  put('tkd_org', { name: '가온학원', icon: '🚐', bizType: 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  /* ★ 기기에만 남은 기록 — 서버에는 **한 칸도 없다** */
  put('tkd_ridestate', { '1': { on: true }, '2': { on: true } });        /* 탑승 토글 둘 */
  put('tkd_carlog', { records: [{ id: 'r1', carId: 'car1', date: TODAY, type: '주유', amount: 50000 }],
                      plans: { car1: { oilKm: 70000 } } });              /* 차계부 한 건 + 계획 */
  /* ★ 이 둘만 꼬리가 다르다 — `tkd_delivery_done_<업체>`(밑줄 하나 · ORG_KEYS 아님).
     처음에 `__B` 로 적어 두고 「안 올라간다」로 잘못 읽었다(함수 이름으로 확인했다). */
  L['tkd_delivery_done_' + (opt_org || 'B')] = JSON.stringify({ '1': TODAY });
  L['tkd_dropoff_done_' + (opt_org || 'B')] = JSON.stringify({ '2': TODAY });
  put('tkd_driver_att', { ['car1_' + TODAY]: { in: '08:30', out: '18:10' },   /* 퇴근은 폰에만 */
                          ['st1_' + TODAY]: { in: '09:00', out: '19:00' } }); /* 직원 퇴근도 폰에만 */
  put('tkd_attendance', { [TODAY]: { '1': 'present', '2': 'absent' } });  /* 수기 출석 둘 */
  put('tkd_attendance_time', { [TODAY]: { '1': '09:10' } });
  return L;
}

/* 앱 띄우기 — `lag` 는 트랜잭션 지연 · `noTx` 면 **v314 상태**(runTransaction 없음) */
function boot(src, opt) {
  opt = opt || {};
  const org = opt.org || 'B';
  const SUF = '__' + org;
  const SERVER = opt.server || makeServer();
  const store = deviceLocal(opt.mode, SUF, org);
  if (opt.extraLocal) Object.keys(opt.extraLocal).forEach((k) => { store[k] = opt.extraLocal[k]; });
  const R = E.build({ src: src, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  const drv = opt.mode === 'driver';
  R.ev('currentMode=' + JSON.stringify(drv ? 'driver' : 'admin') + ';'
     + (drv ? ' window._driverOrg=' + JSON.stringify(org) + '; window._driverCarId="car1";'
            + ' window._userOrgId=""; window._isHelperAcct=false;'
            : ' window._userOrgId=' + JSON.stringify(org) + ';')
     + ' window._userUid="uB"; window._userBizType="academy";'
     + ' window._userPaidUntil=Date.now()+1e9; window._userApproved=true;');
  R.ev('rebuildCarData = function(){}; renderAdminTab = function(){}; showToast = function(){};'
     + ' renderDrive = function(){}; renderMembers = function(){};');
  /* ★★ 업체를 알게 된 **뒤에** 전역을 다시 읽는다 — 실제 앱의 `initApp()` 이 하는 일이다(v292 쪽지).
     안 하면 글 맨 위에서 읽은 「되돌림 칸」값(빈 값)으로 `splitCarState()` 가 돌아
     차량을 못 가려 올릴 것이 없어진다(처음에 이 줄을 빼고 돌려 ③⑤가 깨졌다). */
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();'
     + ' orgSettings = loadOrgSettings(); notices = loadNotices();');
  R.sandbox.__srv = R.win.__srv = (k) => (Object.prototype.hasOwnProperty.call(SERVER, k) ? SERVER[k] : null);
  R.sandbox.__srvSet = R.win.__srvSet = (k, json) => { SERVER[k] = json; };
  R.sandbox.__srvKeys = R.win.__srvKeys = () => Object.keys(SERVER);
  R.ev('window.__writes = [];');
  R.ev('window._firestore = {'
     + ' doc: function(){ var p=Array.prototype.slice.call(arguments,1); return { key: p.slice(2).join("/"), org: p[1] }; },'
     + ' collection: function(){ var p=Array.prototype.slice.call(arguments,1); return { key: p.slice(2).join("/"), org: p[1] }; },'
     + ' getDoc: async function(ref){ var v = window.__srv(ref.key);'
     + '   return { exists: function(){ return v !== null; }, data: function(){ return { value: v }; } }; },'
     + ' getDocs: async function(ref){ var pre = ref.key + "/";'
     + '   var ks = window.__srvKeys().filter(function(k){ return k.indexOf(pre) === 0; });'
     + '   return { forEach: function(cb){ ks.forEach(function(k){ cb({ id: k.slice(pre.length),'
     + '     data: function(){ return { value: window.__srv(k) }; } }); }); } }; },'
     + ' setDoc: async function(ref, o){ window.__writes.push("set " + ref.key);'
     + '   window.__srvSet(ref.key, (o && o.value !== undefined) ? o.value : JSON.stringify(o)); },'
     + ' updateDoc: async function(){}, deleteField: function(){ return "__DEL__"; },'
     + ' deleteDoc: async function(){}, onSnapshot: function(){ return function(){}; },'
     + (opt.noTx ? '' :
       ' runTransaction: async function(db, fn){ return await fn({'
     + '   get: async function(ref){ var v = window.__srv(ref.key);'
     + '     return { exists: function(){ return v !== null; }, data: function(){ return { value: v }; } }; },'
     + '   set: function(ref, o){ window.__writes.push("tx " + ref.key);'
     + '     window.__srvSet(ref.key, o.value); } }); },')
     + ' _end: 1 };');
  R.ev('window._db = {}; window._fbReady = true;');
  R.ev('window._auth = { currentUser: { uid:"uB", isAnonymous:false,'
     + ' getIdToken: function(){ return Promise.resolve("t"); } } };');
  R.ev('_backupBeforeSave = function(){ return Promise.resolve(); };');
  R.ev('window.alert = function(m){ (window.__alerts=window.__alerts||[]).push(String(m)); };');
  R.ev('window.confirm = function(){ return true; };');
  R.SERVER = SERVER; R.SUF = SUF;
  return R;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = (R, k) => { try { return JSON.parse(R.SERVER[k] || 'null'); } catch (e) { return null; } };
const loc = (R, k) => { try { return JSON.parse(R.ev('localStorage.getItem(' + JSON.stringify(k + R.SUF) + ')') || 'null'); } catch (e) { return null; } };

(async () => {
  console.log('════ ① 재현 — v315 로 앱을 열면 기기에만 남은 기록이 어떻게 되나 (고치기 전)');
  {
    const R = boot(OLD_SRC, { mode: 'admin' });
    await R.ev('syncFromFirebase()');
    await wait(60);
    const ride = loc(R, 'tkd_ridestate') || {};
    const att = loc(R, 'tkd_driver_att') || {};
    const atd = loc(R, 'tkd_attendance') || {};
    ck('[옛] 폰의 탑승 토글 둘이 남았나', Object.keys(ride).length, 0);
    ck('[옛] ★ **덮여 사라졌다**(탑승)', Object.keys(ride).length === 0 ? '사라졌다' : '남았다', '사라졌다');
    ck('[옛] ★ 차계부도 사라졌다',
      ((loc(R, 'tkd_carlog') || {}).records || []).length === 0 ? '사라졌다' : '남았다', '사라졌다');
    ck('[옛] ★ 수기 출석도 사라졌다',
      Object.keys((atd[TODAY] || {})).join(',') , '3');
    ck('[옛] ★ 폰에만 있던 퇴근(18:10)도 사라졌다',
      String(((att['car1_' + TODAY]) || {}).out), 'undefined');
    ck('[옛] ★ 직원 퇴근(19:00)도 사라졌다',
      String(((att['st1_' + TODAY]) || {}).out), 'undefined');
    /* 그 뒤 저장을 해도 올라갈 것이 없다 */
    const before = R.ev('window.__writes.length');
    await R.ev('saveCarState()');
    await wait(60);
    ck('[옛] 그 뒤 저장해도 올릴 것이 없다', R.ev('window.__writes.length') - before, 0);
    ck('[옛] 서버 1호차 기록은 서버가 찍은 출근뿐',
      JSON.stringify(srv(R, 'carState/car1').att), JSON.stringify({ [TODAY]: { in: '08:30' } }));
  }

  console.log('\n② 대조 — v314 상태(`runTransaction` 없음)에서는 저장이 **아무것도 안 썼다**');
  {
    const R = boot(OLD_SRC, { mode: 'admin', noTx: true });
    R.ev('_firstSyncOk = true;');
    R.ev('_csSetBase("car1", JSON.parse(window.__srv("carState/car1")));');
    R.ev('_csSetBase("car2", JSON.parse(window.__srv("carState/car2")));');
    const ok = await R.ev('saveCarState()');
    await wait(60);
    ck('[v314] 저장이 **거짓**을 돌려준다', String(ok), 'false');
    ck('[v314] 서버 쓰기 0건',
      R.ev('window.__writes.filter(function(w){ return /carState/.test(w); }).length'), 0);
  }

  console.log('\n③ 고친 뒤 — 첫 동기화가 「서버에 없는 칸」만 한 번 올린다');
  {
    const R = boot(NEW_SRC, { mode: 'admin' });
    await R.ev('syncFromFirebase()');
    await wait(400);
    const c1 = srv(R, 'carState/car1') || {}, c2 = srv(R, 'carState/car2') || {};
    const sa = srv(R, 'data/staffAtt') || {}, at = srv(R, 'data/attendance') || {};
    const att = srv(R, 'data/attendanceTime') || {};
    ck('★ 탑승 토글 둘이 서버에 올라갔다',
      JSON.stringify(c1.ride), JSON.stringify({ '1': { on: true }, '2': { on: true } }));
    ck('★ 차계부 한 건도', ((c1.carlog || {}).records || []).map((r) => r.id).join(','), 'r1');
    ck('  계기판 계획도', JSON.stringify(((c1.carlog || {}).plans || {}).car1), JSON.stringify({ oilKm: 70000 }));
    ck('★ 납품 완료도', JSON.stringify(c1.delivDone), JSON.stringify({ '1': TODAY }));
    ck('★ 하차 완료도', JSON.stringify(c1.dropDone), JSON.stringify({ '2': TODAY }));
    ck('★ 폰에만 있던 퇴근(18:10)이 올라갔다', String(((c1.att || {})[TODAY] || {}).out), '18:10');
    ck('★★ 서버가 찍은 출근(08:30)은 **그대로**', String(((c1.att || {})[TODAY] || {}).in), '08:30');
    ck('★ 직원 퇴근(19:00)도 올라갔다', String((sa['st1_' + TODAY] || {}).out), '19:00');
    ck('★★ 서버가 찍은 직원 출근(09:00)도 그대로', String((sa['st1_' + TODAY] || {}).in), '09:00');
    ck('★ 수기 출석 둘이 올라갔다',
      JSON.stringify(at[TODAY]), JSON.stringify({ '3': 'present', '1': 'present', '2': 'absent' }));
    ck('★ 출석 시각도', JSON.stringify(att[TODAY]), JSON.stringify({ '3': '09:05', '1': '09:10' }));
    ck('  2호차는 올릴 것이 없어 안 썼다', JSON.stringify(c2.ride), '{}');
    ck('★ 폰 값도 그대로 남아 있다(화면이 안 비었다)',
      Object.keys(loc(R, 'tkd_ridestate') || {}).join(','), '1,2');
    ck('  오류 0', (R.ev('(window.__alerts||[]).length')), 0);
  }

  console.log('\n④ 두 번 올리지 않는다 · 지움은 안 보낸다');
  {
    const R = boot(NEW_SRC, { mode: 'admin' });
    await R.ev('syncFromFirebase()');
    await wait(400);
    const n1 = R.ev('window.__writes.length');
    ck('첫 동기화에 올렸다', n1 > 0, true);
    ck('★ 표시가 남았다(기기+업체)', R.ev('localStorage.getItem("tkd_leftover316' + R.SUF + '")'), '1');
    /* 두 번째 동기화 — 더 올리지 않는다 */
    await R.ev('syncFromFirebase()');
    await wait(400);
    ck('★ 두 번째 동기화는 **0건**', R.ev('window.__writes.length') - n1, 0);
    /* ★ 서버에만 있는 칸을 **지우지 않는다** — 폰에 없는 «회원»3 출석이 그대로 */
    ck('★★ 폰에 없는 서버 칸(«회원»3 출석)이 **살아 있다**',
      String(((srv(R, 'data/attendance') || {})[TODAY] || {})['3']), 'present');
    ck('  서버 2호차 문서도 그대로', JSON.stringify(srv(R, 'carState/car2').att), '{}');
  }

  console.log('\n⑤ 기사 폰도 같다 (자기 차량 하나)');
  {
    const R = boot(NEW_SRC, { mode: 'driver' });
    await R.ev('syncFromFirebase()');
    await wait(400);
    const c1 = srv(R, 'carState/car1') || {};
    ck('★ 기사 폰의 탑승 토글이 올라갔다',
      JSON.stringify(c1.ride), JSON.stringify({ '1': { on: true }, '2': { on: true } }));
    ck('★ 차계부도', ((c1.carlog || {}).records || []).map((r) => r.id).join(','), 'r1');
    ck('★★ 서버가 찍은 출근은 그대로', String(((c1.att || {})[TODAY] || {}).in), '08:30');
    ck('  기사는 `att` 를 안 보낸다 — 퇴근은 안 올라간다(서버가 원본)',
      String(((c1.att || {})[TODAY] || {}).out), 'undefined');
    ck('  기사는 직원 근태·출석을 안 올린다',
      JSON.stringify(srv(R, 'data/staffAtt')), JSON.stringify({ ['st1_' + TODAY]: { in: '09:00' } }));
    ck('  2호차 문서를 건드리지 않았다',
      R.ev('window.__writes.filter(function(w){ return /car2/.test(w); }).length'), 0);
  }

  console.log('\n⑥ 올리면 안 되는 때 — 둘러보기 · 읽기 전용 · 다른 업체');
  {
    const dm = boot(NEW_SRC, { mode: 'admin' });
    dm.ev('isDemoMode = function(){ return true; };');
    await dm.ev('syncFromFirebase()');
    await wait(300);
    ck('★ 둘러보기는 0건', dm.ev('window.__writes.length'), 0);
    const ro = boot(NEW_SRC, { mode: 'admin' });
    /* ★ 스텁에서는 `window._readOnlyMode` 가 모듈 전역과 다른 칸이다 — 판정 함수를 바꿔 잰다 */
    ro.ev('isReadOnlyMode = function(){ return true; };');
    await ro.ev('syncFromFirebase()');
    await wait(300);
    ck('★ 읽기 전용도 0건', ro.ev('window.__writes.length'), 0);
    /* ★ 다른 업체 꼬리에만 기록이 있으면 올리지 않는다 */
    const other = boot(NEW_SRC, { mode: 'admin', org: 'C',
      extraLocal: { 'tkd_ridestate__B': JSON.stringify({ '9': { on: true } }) } });
    other.ev('(function(){ ["tkd_ridestate","tkd_carlog","tkd_driver_att","tkd_attendance",'
      + '"tkd_attendance_time"].forEach(function(k){'
      + ' localStorage.removeItem(k+"__C"); localStorage.removeItem(k); });'
      /* ★ 이 둘은 꼬리가 밑줄 하나다(`deliveryDoneKey`) — 빼먹어서 1건이 올라갔다 */
      + ' localStorage.removeItem("tkd_delivery_done_C");'
      + ' localStorage.removeItem("tkd_dropoff_done_C"); })()');
    await other.ev('syncFromFirebase()');
    await wait(300);
    ck('★ 그 업체 칸이 비면 올릴 것이 0건',
      other.ev('window.__writes.filter(function(w){ return /carState|staffAtt|attendance/.test(w); }).length'), 0);
    ck('  남의 업체(B) 칸은 읽지 않았다',
      JSON.stringify(other.ev('localStorage.getItem("tkd_ridestate__B")')), JSON.stringify('{"9":{"on":true}}'));
  }

  console.log('\n⑦ 소스 전수');
  {
    ck('★ 한 벌 셋 — 「서버에 없는 칸만」 거르기', (NEW_SRC.match(/function _addsOnly(Cs|Cell|Rec)/g) || []).length >= 1, true);
    ck('★ 올리는 자리 한 곳(`uploadLeftoverOnce`)', /function uploadLeftoverOnce\(/.test(NEW_SRC), true);
    ck('  표시 칸 이름이 업체 꼬리를 쓴다', /tkd_leftover316/.test(NEW_SRC), true);
    ck('  둘러보기·읽기 전용·첫 동기화 문지기', /_roOrDemo|isDemoMode|isReadOnlyMode/.test(
      (NEW_SRC.match(/function uploadLeftoverOnce\([\s\S]*?\n\}/) || [''])[0]), true);
    ck('★ 규칙·`storage.rules`·서버 0줄',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF
        + (THIS_REF ? ' ' + THIS_REF : '')
        + ' -- api lib firestore.rules storage.rules', { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
    console.log('      (잰 자리: ' + OLD_REF + ' → ' + (THIS_REF || '작업트리') + ')');
    const panels = (s) => (s.match(/BACK_PANEL_IDS\s*=\s*\[[\s\S]*?\]/) || [''])[0];
    ck('  새 창(덮개) 0', panels(NEW_SRC) === panels(OLD_SRC) ? '그대로' : '바뀜', '그대로');
    ck('  `ORG_KEYS` 그대로',
      (NEW_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0] === (OLD_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0], true);
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    ck('  버전 316 이상', appV >= 316 ? 'OK(' + appV + ')' : 'NG(' + appV + ')', 'OK(' + appV + ')');
    ck('  `version.json` 과 같다', String(JSON.parse(F('version.json')).version), String(appV));
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 가짜 Firestore · 실서비스 읽기·쓰기 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
