/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v317(코스로드72-C) 실제 크롬 — **map 꼴 자료(수납·세무·급여 수기·차계부 수기)도 「바뀐 레코드만」**.
   ⓐ 내가 저장하는 사이 **다른 기기가 다른 달**을 고쳤다 → **둘 다 남나**
      (같은 장면을 **옛 길**(`saveToFirebase` 통째)로도 돌려 **사라지는 것**을 본다 — 재현·대조)
   ⓑ 내가 **지운** 달은 되살아나지 않는다(지움이 이긴다) · 남의 달은 그대로
   ⓒ 리스너로 서버 값이 와도 **아직 안 올린 내 변경**이 남나(얹기)
   ⓓ ★ `driverPay`(급여 4값)를 **내려받나** — v316 까지는 **올리기만** 했다(대조로 잰다)
   ⓔ 읽기 전용(기간 끝)이면 **막고 안내**한다 · `saveMapKey` 가 **거짓**을 돌려준다
   ⓕ **네 크기**(폰·작은폰·태블릿·데스크톱) — 수납·세무·차량 화면 글자·숫자가 **같다**
      (천단위 쉼표도 그대로 — 61-1)
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');

const APP = '' + COS_ROOT + '/index.html';
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1111-1111', monthly: 150000 },
  { id: 2, name: '나다움', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2', lat: 37.42, lon: 126.69, phone: '010-2222-2222', monthly: 150000 },
  { id: 3, name: '다보람', carId: 'car2', courseId: 'c2', days: D7, location: '인천 3', lat: 37.43, lon: 126.70, phone: '010-3333-3333', monthly: 180000 }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사' }, { id: 'car2', name: '2호차', driver: '김기사' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }, { id: 'c2', name: 'B반', depart: '16:00' }];
const STAFF = [{ id: 'st1', name: '김직원', hourlyWage: 11000, taxMode: 'free33' }];
/* 수납 — 「누구_연_월」 한 칸이 레코드다(`getPaymentKey`) */
const PAY = { '1_2026_10': { paid: true, amount: 150000, method: '현금', date: '2026-10-05' },
              '2_2026_10': { paid: true, amount: 150000, method: '계좌', date: '2026-10-06' } };
const DPAY = { car1: { hourlyWage: 13000, mealAllow: 9000, taxMode: 'free33', commuteKm: 12 } };

/* 백틱을 쓰지 않는다(틀이 조용히 끊긴다 · v275 교훈) */
function seed(lag) {
  return '(function(){\n'
    + '  var ORG = { name:"가온학원", icon:"🚐", bizType:"academy", destName:"학원",\n'
    + '              destLat:37.4467, destLon:126.6516, tel:"032-111-2222" };\n'
    + '  var BOX = { "data/members": ' + JSON.stringify(MEM) + ',\n'
    + '              "data/cars": ' + JSON.stringify(CARS) + ', "data/courses": ' + JSON.stringify(COURSES) + ',\n'
    + '              "data/staff": ' + JSON.stringify(STAFF) + ', "data/org": ORG, "data/orgDriver": ORG,\n'
    + '              "data/migration": { carState:true, at:1 }, "data/staffAtt": {},\n'
    + '              "data/attendance": {}, "data/attendanceTime": {},\n'
    + '              "data/payments": ' + JSON.stringify(PAY) + ',\n'
    + '              "data/tax": { "2026_10": { income:[], expense:[] } },\n'
    + '              "data/driverPay": ' + JSON.stringify(DPAY) + ',\n'
    + '              "data/drivelogManual": { car1: { "2026-10": { note:"10월" } } },\n'
    + '              "data/payrollManual": { holidays:{}, cars:{ car1: { "2026-10": { w:1 } } } },\n'
    + '              "carState/car1": { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},\n'
    + '                                 delivDone:{}, dropDone:{}, att:{} },\n'
    + '              "carState/car2": { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},\n'
    + '                                 delivDone:{}, dropDone:{}, att:{} } };\n'
    + '  window.__srv = { B: BOX };\n'
    + '  window.__writes = []; window.__alerts = []; window.__subs = [];\n'
    + '  window.__lag = ' + lag + ';\n'
    + '  window._db = {}; window._fbReady = true;\n'
    + '  function boxOf(org){ window.__srv[org] = window.__srv[org] || {}; return window.__srv[org]; }\n'
    + '  function pathOf(a){ return Array.prototype.slice.call(a,1); }\n'
    + '  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }\n'
    + '  window.__snap = function(b, k){\n'
    + '    var has = Object.prototype.hasOwnProperty.call(b, k);\n'
    + '    return { exists:function(){ return has; },\n'
    + '             data:function(){ return { value: JSON.stringify(b[k]) }; } }; };\n'
    + '  window._firestore = {\n'
    + '    doc:function(){ var p=pathOf(arguments); return {org:p[1], key:p.slice(2).join("/")}; },\n'
    + '    collection:function(){ var p=pathOf(arguments); return {org:p[1], key:p.slice(2).join("/")}; },\n'
    + '    getDoc:async function(ref){ return window.__snap(boxOf(ref.org), ref.key); },\n'
    + '    getDocs:async function(ref){ var b=boxOf(ref.org); var pre=ref.key+"/";\n'
    + '      var ks=Object.keys(b).filter(function(k){ return k.indexOf(pre)===0; });\n'
    + '      return { forEach:function(cb){ ks.forEach(function(k){\n'
    + '        cb({ id:k.slice(pre.length), data:function(){ return {value:JSON.stringify(b[k])}; } }); }); } }; },\n'
    + '    setDoc:async function(ref,d){ window.__writes.push("set "+ref.org+"/"+ref.key);\n'
    + '      boxOf(ref.org)[ref.key] = (d && d.value!==undefined) ? JSON.parse(d.value) : d; },\n'
    + '    updateDoc:async function(ref,d){ window.__writes.push("upd "+ref.org+"/"+ref.key);\n'
    + '      var b=boxOf(ref.org); b[ref.key] = b[ref.key] || {};\n'
    + '      Object.keys(d||{}).forEach(function(k){\n'
    + '        if(d[k] === "__DEL__") delete b[ref.key][k]; else b[ref.key][k] = d[k]; }); },\n'
    + '    deleteField:function(){ return "__DEL__"; },\n'
    + '    deleteDoc:async function(){},\n'
    /* ★ 망 지연 — 읽고 쓰기 사이를 벌려 **겹치게** 만든다(v284 교훈 · run315 와 같은 꼴) */
    + '    runTransaction:async function(db, fn){\n'
    + '      var sets = [];\n'
    + '      var out = await fn({ get:async function(ref){\n'
    + '          await sleep(window.__lag);\n'
    + '          return window.__snap(boxOf(ref.org), ref.key); },\n'
    + '        set:function(ref,d){ sets.push([ref, d]); } });\n'
    + '      await sleep(window.__lag);\n'
    + '      sets.forEach(function(x){ window.__writes.push("tx "+x[0].org+"/"+x[0].key);\n'
    + '        boxOf(x[0].org)[x[0].key] = JSON.parse(x[1].value); });\n'
    + '      return out;\n'
    + '    },\n'
    + '    onSnapshot:function(ref, cb){ var s={org:ref.org, key:ref.key, cb:cb, alive:true};\n'
    + '      window.__subs.push(s); return function(){ s.alive=false; }; }\n'
    + '  };\n'
    + '  window.fetch = function(){ return Promise.resolve({ ok:true,\n'
    + '    json:function(){ return Promise.resolve({ ok:false }); } }); };\n'
    + '  window._auth = { currentUser: { uid:"uB", isAnonymous:false,\n'
    + '                                  getIdToken:function(){ return Promise.resolve("tok"); } } };\n'
    + '  window.alert=function(m){ window.__alerts.push(String(m)); };\n'
    + '  window.confirm=function(){return true;}; window.open=function(){return null;};\n'
    /* 「다른 기기가 고쳤다」 — 서버 칸을 직접 바꾼다(리스너는 부르지 않는다) */
    + '  window.__otherDevice = function(key, fn){ var b = window.__srv.B;\n'
    + '    var a = JSON.parse(JSON.stringify(b[key])); fn(a); b[key] = a; };\n'
    + '  window.__pushListener = function(key){ var b = window.__srv.B;\n'
    + '    window.__subs.filter(function(s){ return s.alive && s.key === key; })\n'
    + '      .forEach(function(s){ s.cb(window.__snap(b, key)); }); };\n'
    + '})();';
}

async function openAdmin(b, lag, size) {
  const vp = size || { width: 390, height: 844 };
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    if (/알림톡 실패|문자 전송 실패/.test(t)) return;
    errs.push(t.slice(0, 130));
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + APP.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(seed(lag === undefined ? 200 : lag));
  await p.evaluate(async () => {
    window.__today = todayStr();
    currentMode = 'admin'; window._userOrgId = 'B'; window._userUid = 'uB';
    window._userBizType = 'academy'; window._userPaidUntil = Date.now() + 30 * 86400000;
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    initApp();
    await syncFromFirebase();
  });
  /* ★ 깃발이 설 때까지 기다린다(`_firstSyncOk`) — 시간으로 어림짐작하지 않는다(run295 교훈) */
  await p.waitForFunction(() => window._firstSyncOk === true, {}, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  p.__errs = errs;
  return p;
}
const cell = (o, k) => (o && Object.prototype.hasOwnProperty.call(o, k)) ? JSON.stringify(o[k]) : '(없음)';

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐ 수납 — 저장하는 사이 **다른 기기가 다른 달**을 고쳤다 (망 지연 200ms)');
  {
    const p = await openAdmin(b, 200);
    /* ── 먼저 **옛 길**(통째로) 로 돌려 **사라지는 것**을 본다 (재현) */
    const old = await p.evaluate(async () => {
      window.__otherDevice('data/payments', (a) => { a['3_2026_11'] = { paid: true, amount: 180000 }; });
      const d = loadPayments(); d['1_2026_11'] = { paid: true, amount: 150000 };
      localStorage.setItem('tkd_payments', JSON.stringify(d));
      await saveToFirebase('payments', d);               /* v316 가 하던 그 길 — 통째로 */
      await new Promise((x) => setTimeout(x, 400));
      return window.__srv.B['data/payments'];
    });
    say(old['1_2026_11'] !== undefined, '[옛] 내 수정은 올라갔다'.padEnd(46) + cell(old, '1_2026_11'));
    say(old['3_2026_11'] === undefined, '★ [옛] **남의 달이 사라졌다**'.padEnd(46) + cell(old, '3_2026_11'));
    /* ── 지금 길 — `savePayments()` (바뀐 레코드만) */
    const now = await p.evaluate(async () => {
      window.__otherDevice('data/payments', (a) => { a['3_2026_12'] = { paid: true, amount: 180000 }; });
      const d = loadPayments(); d['2_2026_11'] = { paid: true, amount: 150000 };
      savePayments(d);                                   /* 차이표는 **첫 기다림 앞**에서 */
      await new Promise((x) => setTimeout(x, 900));
      return { srv: window.__srv.B['data/payments'],
               writes: (window.__writes || []).filter((w) => /data\/payments/.test(w)) };
    });
    say(now.srv['2_2026_11'] !== undefined, '★ 내 수정이 남았다'.padEnd(46) + cell(now.srv, '2_2026_11'));
    say(now.srv['3_2026_12'] !== undefined, '★ **남의 달도 남았다**'.padEnd(46) + cell(now.srv, '3_2026_12'));
    say(now.writes.some((w) => w === 'tx B/data/payments'),
      '★ 트랜잭션으로 썼다'.padEnd(46) + now.writes.join(' · '));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓑ 급여 수기 — 내가 **지운** 달은 되살아나지 않는다 · 남의 달은 그대로');
  {
    const p = await openAdmin(b, 120);
    const r = await p.evaluate(async () => {
      window.__otherDevice('data/payrollManual', (a) => { a.cars.car2 = { '2026-11': { w: 9 } }; });
      const d = loadPayrollManual();
      delete d.cars.car1['2026-10'];                     /* 내가 그 달을 지웠다 */
      savePayrollManual(d);
      await new Promise((x) => setTimeout(x, 900));
      return window.__srv.B['data/payrollManual'];
    });
    say(!(r.cars.car1 && r.cars.car1['2026-10']), '★ 지운 달이 되살아나지 않았다'.padEnd(46)
      + JSON.stringify(r.cars.car1 || null));
    say(!!(r.cars.car2 && r.cars.car2['2026-11']), '★ 남의 차량 달은 그대로'.padEnd(46)
      + JSON.stringify(r.cars.car2 || null));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒ 리스너로 서버 값이 와도 **안 올린 내 변경**이 남나 (얹기)');
  {
    const p = await openAdmin(b, 120);
    const r = await p.evaluate(async () => {
      /* 아직 안 올린 내 변경 — 폰에만 적는다 */
      const L = loadPayments(); L['1_2026_11'] = { paid: true, amount: 111111 };
      localStorage.setItem('tkd_payments', JSON.stringify(L));
      /* 서버에서 다른 달이 바뀌어 들어온다 */
      window.__otherDevice('data/payments', (a) => { a['2_2026_12'] = { paid: true, amount: 222222 }; });
      window.__pushListener('data/payments');
      await new Promise((x) => setTimeout(x, 500));
      return loadPayments();
    });
    say(r['2_2026_12'] !== undefined, '★ 서버 값이 들어왔다'.padEnd(46) + cell(r, '2_2026_12'));
    say(r['1_2026_11'] !== undefined, '★ 내 변경도 **살아 있다**'.padEnd(46) + cell(r, '1_2026_11'));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓓ ★ 급여 4값(`driverPay`)을 **내려받나** — v316 까지는 올리기만 했다');
  {
    const p = await openAdmin(b, 60);
    const r = await p.evaluate(() => ({
      local: loadDriverPay(),
      /* 급여 화면이 쓰는 그 길로도 본다(`carPay`) */
      pay: (typeof carPay === 'function') ? carPay(cars.find((c) => c.id === 'car1')) : null
    }));
    say(!!(r.local && r.local.car1 && r.local.car1.hourlyWage === 13000),
      '★ 서버 값이 폰에 들어왔다'.padEnd(46) + JSON.stringify((r.local || {}).car1 || null));
    say(!!(r.pay && Number(r.pay.hourlyWage) === 13000),
      '  급여 화면도 그 값을 본다'.padEnd(46) + String((r.pay || {}).hourlyWage));
    /* ★ 대조 — 내려받는 줄을 빼면(=v316) **폰은 빈 채로 남는다** */
    const off = await p.evaluate(async () => {
      localStorage.removeItem('tkd_driver_pay');
      const keep = loadFromFirebase;
      window.loadFromFirebase = async function (k) { return (k === 'driverPay') ? null : keep(k); };
      loadFromFirebase = window.loadFromFirebase;
      await syncFromFirebase();
      await new Promise((x) => setTimeout(x, 500));
      return loadDriverPay();
    });
    say(JSON.stringify(off) === '{}', '★ [옛] 안 읽으면 **비어 있다**'.padEnd(46) + JSON.stringify(off));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓔ 읽기 전용(기간 끝) — 막고 **안내**한다');
  {
    const p = await openAdmin(b, 60);
    const r = await p.evaluate(async () => {
      window._readOnlyMode = true;
      const before = (window.__writes || []).length;
      const d = loadPayments(); d['1_2026_12'] = { paid: true, amount: 999 };
      localStorage.setItem('tkd_payments', JSON.stringify(d));
      const ok = await saveMapKey('payments');
      await new Promise((x) => setTimeout(x, 900));
      return { ok: ok, writes: (window.__writes || []).slice(before).filter((w) => /data\/payments/.test(w)),
               alerts: (window.__alerts || []).slice(), srv: window.__srv.B['data/payments'] };
    });
    say(r.ok === false, '★ 저장이 거짓을 돌려준다'.padEnd(46) + String(r.ok));
    say(r.writes.length === 0, '★ 서버 쓰기 0'.padEnd(46) + (r.writes.join(' · ') || '0건'));
    say(r.alerts.some((m) => /저장하지 않았어요|읽기 전용|기간/.test(m)),
      '★ 안내가 떴다'.padEnd(46) + (r.alerts.join('|').slice(0, 26) || '없음'));
    say(r.srv['1_2026_12'] === undefined, '  서버 값은 그대로'.padEnd(46) + cell(r.srv, '1_2026_12'));
    await p.close();
  }

  console.log('\nⓕ 네 크기 — 수납·세무·차량 화면 글자·숫자가 **같다**(천단위 쉼표 그대로)');
  {
    const SIZES = [{ n: '폰 390', width: 390, height: 844 }, { n: '작은폰 320', width: 320, height: 568 },
                   { n: '태블릿 768', width: 768, height: 1024 }, { n: '데스크톱 1280', width: 1280, height: 900 }];
    const shots = [];
    for (const s of SIZES) {
      const p = await openAdmin(b, 60, { width: s.width, height: s.height });
      const r = await p.evaluate(() => {
        const out = {};
        /* 앱 자신의 길로 그린다(`renderAdminTab`) — 화면 함수 이름을 묶음이 외우지 않는다 */
        const draw = (tab) => { renderAdminTab(tab);
          return ((document.getElementById('admin-content') || {}).innerText || '')
            .replace(/\s+/g, ' ').trim(); };
        out.payment = draw('payment').slice(0, 500);
        out.tax = draw('tax').slice(0, 500);
        out.cars = draw('cars').slice(0, 500);
        out.수 = [Object.keys(loadPayments()).length, Object.keys(loadTaxData()).length,
                  Object.keys(loadDriverPay()).length, cars.length].join('/');
        out.쉼표 = /\d{1,3},\d{3}/.test(out.payment + out.cars) ? '있다' : '없다';
        return out;
      });
      shots.push({ n: s.n, r: r, errs: p.__errs.slice() });
      await p.close();
    }
    const base = shots[0];
    shots.forEach((s) => {
      say(s.r.수 === base.r.수, (s.n + ' — 수납/세무/급여/차량 수').padEnd(46) + s.r.수);
      say(s.errs.length === 0, (s.n + ' — 오류 0').padEnd(46) + (s.errs[0] || 'OK'));
    });
    say(shots.every((s) => s.r.payment === base.r.payment),
      '★ 수납 글자가 네 크기에서 같다'.padEnd(46) + base.r.payment.slice(0, 22));
    say(shots.every((s) => s.r.tax === base.r.tax && s.r.cars === base.r.cars),
      '★ 세무·차량 글자도 같다'.padEnd(46) + base.r.tax.slice(0, 22));
    say(shots.every((s) => s.r.쉼표 === '있다'), '★ 천단위 쉼표가 네 크기에 다 있다'.padEnd(46) + base.r.쉼표);
  }

  await b.close();
  console.log(bad ? '\nX 문제 ' + bad + '건' : '\n✔ 전부 통과');
  console.log('※ 바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})();
