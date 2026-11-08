/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v275(40-C) 실제 크롬 — **관리자 화면이 v274 와 숫자까지 같은가** ·
   기사 폰에 직원 근태·다른 차량 기록 0건 · 저장은 차량별 문서로만.
   ★ 가짜 Firestore 두 벌:
     - 새 판(v275): `carState/{carId}` 세 문서 + `data/staffAtt`
     - 옛 판(v274): `data/rideState`·`carlog`·`deliveryDone`·`dropoffDone`·`driverAtt`
     **같은 내용**을 두 모양으로 둔다 → 「담는 모양만 바뀌고 화면은 그대로」를 보일 수 있다.
   ★ 쪼개는 셈은 이 파일이 **따로** 한다(앱의 splitCarState 를 쓰지 않는다 — 그러면 자기 채점). */
const { chromium } = require('playwright');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');
/* ★ v276: 이 묶음은 **v275 회차 기록**이다 — 앱을 그 커밋(c1c7b47)에 못 박는다.
   안 박으면 뒤 회차(v276 등)의 버전·바뀐 파일이 거짓 실패로 들어온다. '' 를 주면 작업트리. */
const PIN275 = ('COS_SRC_NEW_REF' in process.env) ? process.env.COS_SRC_NEW_REF : 'c1c7b47';
const APP = PIN275 ? require('path').join(__dirname, 'pin_run275.html')
                   : '' + COS_ROOT + '/index.html';
if (PIN275) {
  require('fs').writeFileSync(APP, require('child_process').execSync(
    'git -C ' + COS_ROOT + ' show ' + PIN275 + ':index.html', { maxBuffer: 1 << 28 }));
}
const OLD_REF = process.env.COS_SRC_OLD_REF || '889fbec';   /* v274 */
const OLD = path.join(__dirname, 'old_index275.html');
const SIZES = [[390, 844], [360, 640], [768, 1024], [1366, 768]];
const BIZ = ['academy', 'public', 'logistics', 'delivery'];

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const ALL = [
  { id: 1, name: '가하은', carId: 'car1', carIdDrop: 'car2', courseId: 'c1', days: D7,
    location: '인천 연수구 1', addrDetail: '101호', lat: 37.41, lon: 126.68,
    dropLocation: '하차 1', dropLat: 37.42, dropLon: 126.69,
    phone: '010-1111-1111', phone2: '010-1111-2222', note: '정문', invoice: 'INV1', courier: '04',
    pin: '1001', monthly: 130000, regfee: 150000, on: true, offOn: true },
  { id: 2, name: '나여름', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2',
    lat: 37.43, lon: 126.70, phone: '010-2222-2222', pin: '1002', monthly: 120000, on: true, offOn: true },
  { id: 3, name: '다가을', carId: 'car3', courseId: 'c1', days: D7, location: '인천 3',
    lat: 37.45, lon: 126.73, phone: '010-3333-3333', pin: '1003', monthly: 110000, on: true, offOn: true }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-9999-1', plate: '12가3456' },
              { id: 'car2', name: '2호차', driver: '김기사', phone: '010-9999-2', plate: '34나5678' },
              { id: 'car3', name: '3호차', driver: '이기사', phone: '010-9999-3', plate: '56다7890' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00', arrive: '14:50' }];
const ORG = { name: '가온', icon: '🚐', bizType: 'academy', destName: '학원',
              destLat: 37.4467, destLon: 126.6516, tel: '032-111-2222',
              bankAccount: '농협 123-456', bizNo: '635-88-02710', ceo: '문준식' };

/* ── 다섯 가지 «원본» (옛 판이 서버에 두던 그 모양) ───────────────── */
const RIDE = { 1: { on: true, offOn: false }, 2: { on: false, offOn: true }, 3: { on: true, offOn: true } };
const CARLOG = {
  records: [
    { id: 'cl1', carId: 'car1', type: 'fuel',   date: '2026-11-02', amount: 80000, liters: 50, odo: 12000, item: '주유', memo: '', by: 'driver' },
    { id: 'cl2', carId: 'car1', type: 'odo',    date: '2026-11-03', odoStart: 12000, odo: 12120, by: 'driver' },
    { id: 'cl3', carId: 'car2', type: 'repair', date: '2026-11-01', amount: 150000, item: '엔진오일', memo: '정비소', by: 'admin' },
    { id: 'cl4', carId: 'car3', type: 'etc',    date: '2026-11-01', amount: 30000, item: '세차', memo: '', by: 'admin' }
  ],
  plans: { car1: { '엔진오일': 15000 }, car2: { '타이어': 40000 } }
};
const DELIV = { 1: '2026-11-03', 2: '2026-11-03', 3: '2026-11-03' };
const DROP  = { 1: '2026-11-03', 2: '2026-11-03' };
const ATT = {
  'car1_2026-11-02': { in: '08:01', out: '18:02' },
  'car1_2026-11-03': { in: '08:03', out: '18:04' },
  'car2_2026-11-03': { in: '08:05', out: '18:06' },
  'car3_2026-11-03': { in: '08:07', out: '18:08' },
  'st1_2026-11-03':  { in: '09:00', out: '19:00' }      /* 직원 — 차량과 무관 */
};
const STAFF = [{ id: 'st1', name: '최직원', role: '교사', hourlyWage: 12000, mealAllow: 100000 }];
const DRIVER_PAY = { car1: { hourlyWage: 11000, mealAllow: 200000, taxMode: '3.3', commuteKm: 12 },
                     car2: { hourlyWage: 10500, mealAllow: 150000, taxMode: '4대', commuteKm: 8 } };
const ATTEND = { '2026-11-03': { 1: 'present', 2: 'absent', 3: 'present' } };

/* 이 파일이 **직접** 쪼갠다 (업종에 따라 하원 차량이 달라진다) */
function dropCarOfTest(m, biz) {
  if (biz !== 'academy' && biz !== 'public') return String(m.carId || '');
  return String(m.carIdDrop || m.carId || '');
}
function splitTest(biz) {
  const byCar = {}, staffAtt = {};
  const ens = (cid) => { if (!cid) return null; if (!byCar[cid]) byCar[cid] = {
    ride: {}, rideOff: {}, carlog: { records: [], plans: {} }, delivDone: {}, dropDone: {}, att: {} };
    return byCar[cid]; };
  CARS.forEach((c) => ens(c.id));
  const pickOf = (id) => { const m = ALL.find((x) => String(x.id) === String(id)); return m ? String(m.carId || '') : ''; };
  const dropOf = (id) => { const m = ALL.find((x) => String(x.id) === String(id)); return m ? dropCarOfTest(m, biz) : ''; };
  Object.keys(RIDE).forEach((id) => {
    const r = RIDE[id];
    if (typeof r.on === 'boolean') { const a = ens(pickOf(id)); if (a) a.ride[id] = { on: r.on }; }
    if (typeof r.offOn === 'boolean') { const b = ens(dropOf(id)); if (b) b.rideOff[id] = { offOn: r.offOn }; }
  });
  CARLOG.records.forEach((r) => { const a = ens(String(r.carId || '')); if (a) a.carlog.records.push(r); });
  Object.keys(CARLOG.plans).forEach((cid) => { const a = ens(cid); if (a) a.carlog.plans[cid] = CARLOG.plans[cid]; });
  Object.keys(DELIV).forEach((id) => { const a = ens(pickOf(id)); if (a) a.delivDone[id] = DELIV[id]; });
  Object.keys(DROP).forEach((id) => { const a = ens(dropOf(id)); if (a) a.dropDone[id] = DROP[id]; });
  Object.keys(ATT).forEach((k) => {
    if (/^st/.test(k)) { staffAtt[k] = ATT[k]; return; }
    const i = k.lastIndexOf('_');
    const a = ens(k.slice(0, i)); if (a) a.att[k.slice(i + 1)] = ATT[k];
  });
  return { byCar, staffAtt };
}

const CAR_KEYS = ['id','name','carId','carIdDrop','courseId','days','phone','phone2','location',
                  'addrDetail','lat','lon','dropLocation','dropLat','dropLon','note','photo',
                  'invoice','courier'];
function carDataFor(cid, biz) {
  return {
    members: ALL.filter((m) => m.carId === cid || dropCarOfTest(m, biz) === cid)
      .map((m) => { const o = {}; CAR_KEYS.forEach((k) => { if (m[k] !== undefined) o[k] = m[k]; }); return o; }),
    car: (() => { const c = CARS.find((x) => x.id === cid); return c ? { id: c.id, name: c.name, plate: c.plate, driver: c.driver, phone: c.phone } : null; })(),
    courses: COURSES
  };
}

/* isNew=true → carState 세 문서 + staffAtt · false → 옛 data/* 다섯 키 */
function seed(biz, isNew, role, carId) {
  const sp = splitTest(biz);
  const common = { members: ALL, cars: CARS, courses: COURSES,
    org: Object.assign({}, ORG, { bizType: biz }),
    orgDriver: { name: ORG.name, icon: ORG.icon, bizType: biz, destName: ORG.destName,
                 destLat: ORG.destLat, destLon: ORG.destLon, tel: ORG.tel },
    payments: {}, tax: {}, attendance: ATTEND, notices: [], products: [], invoices: [],
    staff: STAFF, attendanceTime: {}, payrollManual: { holidays: {}, cars: {} },
    drivelogManual: {}, driverPay: DRIVER_PAY };
  const DATA = isNew
    ? Object.assign({}, common, { staffAtt: sp.staffAtt, migration: { carState: true, at: 1 } })
    : Object.assign({}, common, { rideState: RIDE, carlog: CARLOG,
        deliveryDone: DELIV, dropoffDone: DROP, driverAtt: ATT });
  return `(function(){
    var DATA = ${JSON.stringify(DATA)};
    var CARSTATE = ${JSON.stringify(sp.byCar)};
    var CARDATA = ${JSON.stringify({ car1: carDataFor('car1', biz), car2: carDataFor('car2', biz), car3: carDataFor('car3', biz) })};
    window.__asked=[]; window.__wrote=[]; window.__wroteVal={};
    window._db={}; window._fbReady=true;
    window._firestore={
      /* ★ 실제 SDK 처럼 **문서 id 의 슬래시를 거절한다** — 칸 수가 홀수가 되어 터지는 자리다.
         (v275 에서 백업 id 를 carState/car1__시각 으로 적었다가 이 검사로 잡았다)
         ※ 이 틀은 템플릿 문자열이라 **백틱을 쓰면 안 된다** — 문자열이 끊겨 조용히 NaN 이 된다. */
      doc:function(db,c1,o,c2,k){
        if(typeof k==='string' && k.indexOf('/')>=0){
          throw new Error('Invalid document reference. Document references must have an even '
            +'number of segments, but orgs/'+o+'/'+c2+'/'+k+' has 5');
        }
        return {col:c2,key:k};
      },
      collection:function(db,c1,o,c2){ return {col:c2}; },
      getDoc:async function(ref){
        window.__asked.push((ref.col||'')+'/'+(ref.key||''));
        var src = ref.col==='carData' ? CARDATA : (ref.col==='carState' ? CARSTATE : DATA);
        var has = Object.prototype.hasOwnProperty.call(src, ref.key);
        return { exists:function(){return has;}, data:function(){return {value:JSON.stringify(src[ref.key])};} };
      },
      getDocs:async function(ref){
        window.__asked.push('all:'+(ref.col||''));
        var src = ref.col==='carState' ? CARSTATE : {};
        var ks = Object.keys(src);
        return { forEach:function(cb){ ks.forEach(function(k){
          cb({ id:k, data:function(){ return {value:JSON.stringify(src[k])}; } });
        }); } };
      },
      setDoc:async function(ref,d){
        window.__wrote.push((ref.col||'')+'/'+(ref.key||''));
        window.__wroteVal[(ref.col||'')+'/'+(ref.key||'')] = d && d.value;
      },
      deleteDoc:async function(ref){ window.__wrote.push('del:'+(ref.col||'')+'/'+(ref.key||'')); },
      onSnapshot:function(ref,cb){ window.__asked.push('listen:'+(ref.col||'')+'/'+(ref.key||'')); return function(){}; }
    };
    window.alert=function(m){ (window.__a=window.__a||[]).push(String(m)); };
    window.confirm=function(){return true;}; window.open=function(){return null;};
    window.print=function(){};
  })();`;
}

async function openPage(b, w, h, file, biz, isNew, role, carId) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errs = [];
  const logs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    logs.push(m.type() + ': ' + m.text().slice(0, 150));
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    errs.push(t.slice(0, 130));
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  const seedJs = seed(biz, isNew, role, carId);
  /* ★ 틀 자체를 먼저 확인한다 — 템플릿 문자열이 끊기면 NaN 이 되어 **아무 일도 안 하고 통과**한다 */
  if (typeof seedJs !== 'string' || seedJs.indexOf('(function(){') !== 0) {
    throw new Error('seed 가 글자가 아니다 (틀이 끊겼다): ' + typeof seedJs);
  }
  await p.evaluate(seedJs);
  const okSeed = await p.evaluate(() => !!(window._db && window._firestore && window.__asked));
  if (!okSeed) throw new Error('가짜 Firestore 가 안 깔렸다 — 대조가 헛돈다');
  await p.evaluate(async ({ biz, role, carId }) => {
    /* 폰에 남은 값이 섞이지 않게 비운다 — 서버에서 받은 것만 보게 */
    ['tkd_members','tkd_cars','tkd_courses','tkd_org','tkd_ridestate','tkd_carlog',
     'tkd_driver_att','tkd_staff','tkd_driver_pay','tkd_attendance','tkd_payroll_manual']
      .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
    window._userOrgId = 'cosroad_default';
    window._userUid = 'uid1';
    window._userPaidUntil = Date.now() + 30 * 86400000;
    window._userApproved = true;
    if (role === 'driver') {
      currentMode = 'driver';
      window._isDriverAcct = true; window._driverCarId = carId; window._driverOrg = 'cosroad_default';
      window._userBizType = null;
    } else {
      currentMode = 'admin';
      window._isDriverAcct = false; window._driverCarId = null;
      window._userBizType = biz;
    }
    await syncFromFirebase();
    if (!window.__asked.length) throw new Error('서버를 한 번도 안 읽었다 — 대조가 헛돈다');
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    currentCourseId = 'c1';
    currentDay = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
    if (carId) currentCarId = carId;
  }, { biz, role, carId });
  p.__errs = errs;
  p.__logs = logs;
  if (process.env.COS_DEBUG === '1') console.log('--- 콘솔 ---|' + logs.join(' | '));
  return p;
}

/* 관리자 화면 전부를 글자로 떠낸다 (탭 + 창 네 개) */
const adminShot = (p) => p.evaluate(() => {
  const out = {};
  const txt = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '(없음)');
  getOrderedAdminTabs().map((t) => t.id).forEach((tab) => {
    try {
      switchTab('admin'); currentAdminTab = tab; renderAdminTab(tab);
      out['탭:' + tab] = txt(document.getElementById('admin-content'));
    } catch (e) { out['탭:' + tab] = 'ERR ' + e.message; }
  });
  try { switchTab('admin'); currentAdminTab = 'excel'; renderAdminTab('excel');
        out['탭:excel'] = txt(document.getElementById('admin-content')); }
  catch (e) { out['탭:excel'] = 'ERR ' + e.message; }
  /* 급여상세 */
  try { pvOpen = true; pvYm = '2026-11'; renderPayrollView();
        out['창:급여상세'] = txt(document.getElementById('pv-modal')); if (typeof closePayrollView === 'function') closePayrollView(); }
  catch (e) { out['창:급여상세'] = 'ERR ' + e.message; }
  /* 운행기록부 */
  try { dlvOpen = true; dlvCarId = 'car1'; dlvYm = '2026-11'; renderDriveLogView();
        out['창:운행기록부'] = txt(document.getElementById('dlv-modal')); if (typeof closeDriveLogView === 'function') closeDriveLogView(); }
  catch (e) { out['창:운행기록부'] = 'ERR ' + e.message; }
  /* 차계부 */
  try { carlogSelCar = 'car1'; carlogEditId = null; renderCarlogModal();
        out['창:차계부'] = txt(document.getElementById('carlog-modal'));
        const cm = document.getElementById('carlog-modal'); if (cm) cm.remove(); }
  catch (e) { out['창:차계부'] = 'ERR ' + e.message; }
  /* 기사 근태 블록 */
  try { out['창:기사근태'] = (typeof buildDriverAttHtml === 'function')
          ? buildDriverAttHtml().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '(없음)'; }
  catch (e) { out['창:기사근태'] = 'ERR ' + e.message; }
  /* 급여 계산 결과 자체 */
  try { out['값:급여'] = JSON.stringify(buildPayrollData('2026-11')); }
  catch (e) { out['값:급여'] = 'ERR ' + e.message; }
  /* 백업 받기에 담기는 값 */
  try {
    const keys = ['tkd_members','tkd_cars','tkd_courses','tkd_org','tkd_payments','tkd_tax',
      'tkd_attendance','tkd_notices','tkd_carlog','tkd_drivelog_manual','tkd_support_seen',
      'tkd_payroll_manual','tkd_staff','tkd_driver_att','tkd_invoices','tkd_products',
      'tkd_attendance_time','tkd_ridestate','tkd_driver_pay'];
    const d = {}; keys.forEach((k) => { const v = localStorage.getItem(k); if (v !== null) d[k] = v; });
    out['값:백업'] = JSON.stringify(d);
  } catch (e) { out['값:백업'] = 'ERR ' + e.message; }
  return out;
});

/* 시각처럼 **돌 때마다 달라지는 값**만 지운다 */
const norm = (s) => String(s)
  .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '<시각>')
  .replace(/"_date":"[^"]*"/g, '"_date":"<시각>"');
const nums = (s) => (String(s).match(/\d+/g) || []).join(',');

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('① 관리자 화면이 v274 와 **숫자까지 같은가** — 네 업종 × 네 크기');
  for (const biz of BIZ) {
    for (const [w, h] of SIZES) {
      const pn = await openPage(b, w, h, APP, biz, true, 'admin', null);
      const rn = await adminShot(pn);
      const po = await openPage(b, w, h, OLD, biz, false, 'admin', null);
      const ro = await adminShot(po);
      const tag = '[' + biz + ' ' + w + 'x' + h + '] ';
      const diffTxt = [], diffNum = [], empty = [];
      Object.keys(rn).forEach((k) => {
        if (nums(rn[k]) !== nums(ro[k])) diffNum.push(k);
        if (norm(rn[k]) !== norm(ro[k])) diffTxt.push(k);
        if (!rn[k] || rn[k].length < 10) empty.push(k);
      });
      say(diffNum.length === 0, (tag + '숫자 같음 ★').padEnd(34) + Object.keys(rn).length + '곳'
        + (diffNum.length ? '  ★다름: ' + diffNum.join(',') : ''));
      say(diffTxt.length === 0, (tag + '글자도 같음').padEnd(34)
        + (diffTxt.length ? '★다름: ' + diffTxt.join(',') : 'OK'));
      say(empty.length === 0, (tag + '빈 화면 0 (대조가 헛돌지 않게)').padEnd(34) + (empty.join(',') || 'OK'));
      say(pn.__errs.length === 0, (tag + '오류 0').padEnd(34) + (pn.__errs[0] || 'OK'));
      await pn.close(); await po.close();
    }
  }

  console.log('\n② 관리자가 **합쳐 본다** — 다섯 가지가 차량 문서에서 왔는가');
  for (const biz of BIZ) {
    const pn = await openPage(b, 390, 844, APP, biz, true, 'admin', null);
    const r = await pn.evaluate(() => ({
      ride: localStorage.getItem('tkd_ridestate'),
      carlog: localStorage.getItem('tkd_carlog'),
      att: localStorage.getItem('tkd_driver_att'),
      dv: localStorage.getItem(deliveryDoneKey()),
      dp: localStorage.getItem(dropoffDoneKey()),
      asked: (window.__asked || []).slice()
    }));
    const tag = '[' + biz + '] ';
    say(r.asked.indexOf('all:carState') >= 0, (tag + 'carState 전부를 달라고 함').padEnd(40) + (r.asked.indexOf('all:carState') >= 0));
    say(r.asked.indexOf('data/staffAtt') >= 0, (tag + '직원 근태는 data/staffAtt 로').padEnd(40) + (r.asked.indexOf('data/staffAtt') >= 0));
    say(!r.asked.some((k) => /^data\/(rideState|carlog|deliveryDone|dropoffDone|driverAtt)$/.test(k)),
      (tag + '옛 다섯 키는 **안 읽는다** ★').padEnd(40)
      + JSON.stringify(r.asked.filter((k) => /^data\/(rideState|carlog|deliveryDone|dropoffDone|driverAtt)$/.test(k))));
    const att = JSON.parse(r.att || '{}');
    say(Object.keys(att).sort().join(',') === Object.keys(ATT).sort().join(','),
      (tag + '합친 출퇴근이 옛 모양 그대로').padEnd(40) + Object.keys(att).sort().join(','));
    say(JSON.parse(r.carlog || '{}').records.length === 4, (tag + '차계부 4건 다 모였다').padEnd(40) + JSON.parse(r.carlog || '{}').records.length);
    const ride = JSON.parse(r.ride || '{}');
    say(JSON.stringify(ride) === JSON.stringify(RIDE), (tag + '탑승 토글 그대로').padEnd(40) + JSON.stringify(ride));
    say(JSON.stringify(JSON.parse(r.dv || '{}')) === JSON.stringify(DELIV), (tag + '납품 완료 그대로').padEnd(40) + r.dv);
    say(JSON.stringify(JSON.parse(r.dp || '{}')) === JSON.stringify(DROP), (tag + '하차 완료 그대로').padEnd(40) + r.dp);
    await pn.close();
  }

  console.log('\n③ 관리자가 저장하면 **차량별로 쪼개** 쓰고, 옛 다섯 키엔 안 쓴다');
  {
    const pn = await openPage(b, 390, 844, APP, 'academy', true, 'admin', null);
    const r = await pn.evaluate(async () => {
      window.__wrote = []; window.__wroteVal = {};
      await saveCarState();
      return { wrote: window.__wrote.slice(), val: window.__wroteVal };
    });
    say(['carState/car1', 'carState/car2', 'carState/car3'].every((k) => r.wrote.indexOf(k) >= 0),
      '차량 문서 셋에 썼다'.padEnd(40) + r.wrote.filter((k) => /^carState/).join(','));
    say(r.wrote.indexOf('data/staffAtt') >= 0, '직원 근태는 data/staffAtt 로'.padEnd(40) + 'true');
    say(!r.wrote.some((k) => /^data\/(rideState|carlog|deliveryDone|dropoffDone|driverAtt)$/.test(k)),
      '옛 다섯 키엔 **안 쓴다** ★'.padEnd(40)
      + JSON.stringify(r.wrote.filter((k) => /^data\//.test(k))));
    const c2 = JSON.parse(r.val['carState/car2'] || '{}');
    say(JSON.stringify(c2.rideOff || {}) === '{"1":{"offOn":false}}',
      '하원만 2호차인 «회원» 은 2호차 문서로'.padEnd(40) + JSON.stringify(c2.rideOff));
    say(Object.keys(c2.ride || {}).length === 0, '2호차 문서에 등원 토글 0건'.padEnd(40) + JSON.stringify(c2.ride));
    const st = JSON.parse(r.val['data/staffAtt'] || '{}');
    say(Object.keys(st).join(',') === 'st1_2026-11-03', '직원 근태 한 건만 따로'.padEnd(40) + Object.keys(st).join(','));
    await pn.close();
  }

  console.log('\n④ 기사 폰 — 직원 근태 0건 · 다른 차량 기록 0건 (옛 판과 대조)');
  for (const biz of BIZ) {
    const pn = await openPage(b, 390, 844, APP, biz, true, 'driver', 'car1');
    const rn = await pn.evaluate(() => {
      let dump = '';
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i); dump += k + '=' + (localStorage.getItem(k) || '') + '\n';
      }
      driveLeg = 'pickup'; switchTab('drive'); renderDrive();
      return { 폰: dump, asked: (window.__asked || []).slice(),
               화면: (document.getElementById('app-content').textContent || '').replace(/\s+/g, ' ').trim(),
               목록: getActiveStudents().map((x) => x.name).join(',') };
    });
    const po = await openPage(b, 390, 844, OLD, biz, false, 'driver', 'car1');
    const ro = await po.evaluate(() => {
      let dump = '';
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i); dump += k + '=' + (localStorage.getItem(k) || '') + '\n';
      }
      driveLeg = 'pickup'; switchTab('drive'); renderDrive();
      return { 폰: dump, 화면: (document.getElementById('app-content').textContent || '').replace(/\s+/g, ' ').trim(),
               목록: getActiveStudents().map((x) => x.name).join(',') };
    });
    const tag = '[' + biz + '] ';
    say(/st1_2026-11-03/.test(ro.폰), (tag + '(대조) 옛 판에는 직원 근태가 있었다').padEnd(44) + /st1_/.test(ro.폰));
    say(!/st1_2026-11-03/.test(rn.폰), (tag + '새 판: 직원 근태 0건 ★').padEnd(44) + !/st1_/.test(rn.폰));
    say(/car3_2026-11-03/.test(ro.폰), (tag + '(대조) 옛 판에는 3호차 출퇴근이 있었다').padEnd(44) + /car3_/.test(ro.폰));
    say(!/car3_|car2_2026/.test(rn.폰), (tag + '새 판: 다른 차량 출퇴근 0건 ★').padEnd(44) + !/car3_/.test(rn.폰));
    /* 2·3호차만 가진 글자 — 「엔진오일」은 1호차 plans 에도 있어 넣지 않는다 */
    const otherLog = ['cl3', 'cl4', '세차', '타이어'].filter((s) => rn.폰.indexOf(s) >= 0);
    say(/cl3|cl4|세차|타이어/.test(ro.폰), (tag + '(대조) 옛 판에는 다른 차량 차계부가 있었다').padEnd(44)
      + ['cl3', 'cl4', '세차', '타이어'].filter((s) => ro.폰.indexOf(s) >= 0).join(','));
    say(otherLog.length === 0, (tag + '새 판: 다른 차량 차계부 0건 ★').padEnd(44) + (otherLog.join(',') || '0건'));
    say(/cl1/.test(rn.폰) && /cl2/.test(rn.폰), (tag + '자기 차량 차계부는 있다 (헛돌지 않게)').padEnd(44) + 'cl1,cl2');
    say(rn.화면 === ro.화면 && rn.화면.length > 20, (tag + '운행 화면이 v274 와 같음').padEnd(44)
      + '새 ' + rn.화면.length + '자 / 옛 ' + ro.화면.length + '자' + (rn.화면 === ro.화면 ? '' : ' ★다름'));
    say(rn.목록 === ro.목록, (tag + '목록 같음').padEnd(44) + (rn.목록 || '없음'));
    say(rn.asked.indexOf('carState/car1') >= 0, (tag + '자기 carState 하나만 달라고 함').padEnd(44)
      + JSON.stringify(rn.asked.filter((k) => /carState/.test(k))));
    say(!rn.asked.some((k) => k === 'all:carState' || k === 'data/staffAtt'),
      (tag + '전 차량·직원 근태는 **안 달라고 함**').padEnd(44) + 'true');
    say(pn.__errs.length === 0, (tag + '오류 0').padEnd(44) + (pn.__errs[0] || 'OK'));
    await pn.close(); await po.close();
  }

  console.log('\n⑤ 기사가 저장하면 **자기 문서 하나**만 · 백업 key 는 carState/<내 차량>');
  {
    const pn = await openPage(b, 390, 844, APP, 'academy', true, 'driver', 'car1');
    const r = await pn.evaluate(async () => {
      window.__wrote = []; window.__wroteVal = {};
      await saveCarState();
      return { wrote: window.__wrote.slice(), val: window.__wroteVal };
    });
    say(r.wrote.filter((k) => /^carState\//.test(k)).join(',') === 'carState/car1',
      '자기 문서 하나만 썼다 ★'.padEnd(40) + r.wrote.filter((k) => /^carState\//.test(k)).join(','));
    say(!r.wrote.some((k) => /^data\//.test(k)), '`data/*` 에는 한 번도 안 썼다 ★'.padEnd(40)
      + JSON.stringify(r.wrote.filter((k) => /^data\//.test(k))));
    const bk = r.wrote.filter((k) => /^backups\//.test(k));
    say(bk.length === 1, '백업 한 건'.padEnd(40) + bk.join(','));
    say(/^backups\/carState_car1__\d+$/.test(bk[0] || ''), '백업 자리 carState_car1__<시각> ★'.padEnd(40) + (bk[0] || ''));
    say(pn.__errs.length === 0, '오류 0 (백업이 조용히 터지지 않는다)'.padEnd(40) + (pn.__errs[0] || 'OK'));
    /* ★ 대조 — 옛 꼴(`carState/car1__시각`)이면 이 검사가 **잡는다**(헛돌지 않음을 보인다) */
    const caught = await pn.evaluate(() => {
      try { window._firestore.doc(window._db, 'orgs', 'o', 'backups', 'carState/car1__1'); return 'no'; }
      catch (e) { return String(e.message).slice(0, 40); }
    });
    say(caught !== 'no', '(대조) 옛 꼴 `carState/car1__…` 은 거절된다'.padEnd(40) + caught);
    const mine = JSON.parse(r.val['carState/car1'] || '{}');
    say(Object.keys(mine.att || {}).join(',') === '2026-11-02,2026-11-03',
      '자기 출퇴근만 (날짜 키)'.padEnd(40) + Object.keys(mine.att || {}).join(','));
    say((mine.carlog.records || []).every((x) => x.carId === 'car1'), '자기 차계부만'.padEnd(40)
      + (mine.carlog.records || []).map((x) => x.id).join(','));
    await pn.close();
  }

  console.log('\n⑥ 복원 — 되돌린 자료가 **차량별 문서**로 가고 옛 다섯 키엔 안 간다');
  {
    const pn = await openPage(b, 390, 844, APP, 'academy', true, 'admin', null);
    const r = await pn.evaluate(async () => {
      /* 지금 폰 값으로 백업 파일을 만든 뒤 그대로 복원한다 */
      const keys = ['tkd_members','tkd_cars','tkd_courses','tkd_org','tkd_carlog','tkd_staff',
        'tkd_driver_att','tkd_ridestate','tkd_driver_pay','tkd_attendance'];
      const dump = { _app: 'COSROAD', _version: 1, _date: new Date().toISOString(), data: {} };
      keys.forEach((k) => { const v = localStorage.getItem(k); if (v !== null) dump.data[k] = v; });
      window.showConfirmModal = function (cb) { cb(); };
      window.__wrote = []; window.__wroteVal = {};
      const f = new File([JSON.stringify(dump)], 'b.json', { type: 'application/json' });
      const ev = { target: { files: [f], value: 'x' } };
      restoreData(ev);
      await new Promise((res) => setTimeout(res, 700));
      return { wrote: window.__wrote.slice(), val: window.__wroteVal };
    });
    say(r.wrote.filter((k) => /^carState\//.test(k)).sort().join(',') === 'carState/car1,carState/car2,carState/car3',
      '차량 문서 셋을 되돌렸다'.padEnd(40) + r.wrote.filter((k) => /^carState\//.test(k)).sort().join(','));
    say(!r.wrote.some((k) => /^data\/(rideState|carlog|deliveryDone|dropoffDone|driverAtt)$/.test(k)),
      '옛 다섯 키엔 **안 쓴다** ★'.padEnd(40)
      + JSON.stringify(r.wrote.filter((k) => /^data\/(rideState|carlog|deliveryDone|dropoffDone|driverAtt)$/.test(k))));
    say(r.wrote.indexOf('data/staffAtt') >= 0, '직원 근태는 data/staffAtt 로'.padEnd(40) + 'true');
    say(r.wrote.indexOf('data/members') >= 0 && r.wrote.indexOf('data/org') >= 0,
      '나머지 키는 종전대로'.padEnd(40) + 'members·org OK');
    await pn.close();
  }

  console.log('\n⑦ 범위·버전·규칙');
  {
    /* ★ v276: 범위의 **끝쪽도** 못 박은 커밋으로 (위 PIN275 쪽지 참고) */
    const names = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' ' + (PIN275 || ''))
      .toString().trim().split('\n').filter(Boolean).sort();
    say(names.join(',') === 'CLAUDE.md,api/driver-auth.js,firestore.rules,index.html,version.json',
      '바뀐 파일            ' + names.join(','));
    const keep = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + OLD_REF + ' ' + (PIN275 || '')
      + ' -- lib s.html home.html terms.html privacy.html api/send-sms.js api/signup.js').toString().trim();
    say(keep === '', 'lib·정적·다른 api diff 0   ' + (keep || '(변경 없음)'));
    const vj = JSON.parse(PIN275
      ? cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN275 + ':version.json').toString()
      : fs.readFileSync('' + COS_ROOT + '/version.json', 'utf8'));
    const av = /const APP_VERSION = (\d+);/.exec(fs.readFileSync(APP, 'utf8'))[1];
    say(vj.version === 275 && av === '275', '버전 275            ' + vj.version + ' · ' + av);
    const rl = (PIN275
      ? cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN275 + ':firestore.rules', { maxBuffer: 1 << 26 }).toString()
      : fs.readFileSync('' + COS_ROOT + '/firestore.rules', 'utf8'))
      .split('\r\n').join('\n')
      .split('\n').filter((x, i, a) => i < a.length - 1 || x !== '').length;
    say(rl === 632, '규칙 632줄          ' + rl);
  }

  await b.close();
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
