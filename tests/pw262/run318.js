/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v318(코스로드72-D) 실제 크롬 — **«알림장»·거래명세서·품목·자격증·업체 설정·세무 줄**도 얹어 쓴다.
   ⓐ 내가 저장하는 사이 **다른 기기가 다른 «알림장»** 을 올렸다 → **둘 다 남나**
      (같은 장면을 **옛 길**(`saveToFirebase` 통째)로도 돌려 **사라지는 것**을 본다 — 재현·대조)
   ⓑ 업체 설정 **칸 단위** — 내가 계좌, 남이 도장 → 둘 다 남나
   ⓒ 세무 **줄 단위** — 같은 달 다른 줄 둘 다 남나 · 내가 지운 줄만 빠지나
   ⓓ 품목 — id 붙이는 첫 저장은 통째, 그 뒤부터 얹기(남의 품목이 남나)
   ⓔ 읽기 전용(기간 끝)이면 **막고 안내**한다
   ⓕ **네 크기**(폰·작은폰·태블릿·데스크톱) — «알림장»·세무·설정 화면 글자·숫자가 **같다**
      (천단위 쉼표도 그대로 — 61-1)
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');

const APP = '' + COS_ROOT + '/index.html';
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1111-1111', monthly: 150000 },
  { id: 2, name: '나다움', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2', lat: 37.42, lon: 126.69, phone: '010-2222-2222', monthly: 150000 }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사' }, { id: 'car2', name: '2호차', driver: '김기사' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const NOTICES = [{ id: 1, ts: 1, targets: 'all', targetLabel: '전체', content: '첫 알림장', images: [], sent: false }];
const PRODUCTS = [{ code: 'A1', name: '배추', price: 3000, inPrice: 2000 }];
const TAX = { '2026_11': { income: [{ id: 't1', name: '가하은 수강료', amount: 150000, category: '수강료', date: '2026-11-05', taxType: '과세' }], expense: [] } };

/* 백틱을 쓰지 않는다(틀이 조용히 끊긴다 · v275 교훈) */
function seed(lag) {
  return '(function(){\n'
    + '  var ORG = { name:"가온학원", icon:"🚐", bizType:"academy", destName:"학원",\n'
    + '              destLat:37.4467, destLon:126.6516, tel:"032-111-2222", bank:"내 계좌" };\n'
    + '  var BOX = { "data/members": ' + JSON.stringify(MEM) + ',\n'
    + '              "data/cars": ' + JSON.stringify(CARS) + ', "data/courses": ' + JSON.stringify(COURSES) + ',\n'
    + '              "data/staff": [], "data/org": ORG, "data/orgDriver": ORG,\n'
    + '              "data/migration": { carState:true, at:1 }, "data/staffAtt": {},\n'
    + '              "data/attendance": {}, "data/attendanceTime": {},\n'
    + '              "data/notices": ' + JSON.stringify(NOTICES) + ',\n'
    + '              "data/products": ' + JSON.stringify(PRODUCTS) + ', "data/invoices": [],\n'
    + '              "data/certificates": [], "data/tax": ' + JSON.stringify(TAX) + ',\n'
    + '              "data/payments": {}, "data/driverPay": {},\n'
    + '              "data/drivelogManual": {}, "data/payrollManual": { holidays:{}, cars:{} },\n'
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
    /* ★ 망 지연 — 읽고 쓰기 사이를 벌려 **겹치게** 만든다(v284 교훈 · run315·run317 과 같은 꼴) */
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
const byId = (arr, id) => (Array.isArray(arr) ? arr : []).filter((x) => String(x.id) === String(id))[0];

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐ «알림장» — 저장하는 사이 **다른 기기가 다른 «알림장»** 을 올렸다 (망 지연 200ms)');
  {
    const p = await openAdmin(b, 200);
    /* ── 먼저 **옛 길**(통째로) 로 돌려 **사라지는 것**을 본다 (재현) */
    const old = await p.evaluate(async () => {
      window.__otherDevice('data/notices', (a) => { a.push({ id: 99, content: '남의 알림장', images: [], sent: false }); });
      notices = loadNotices();
      notices.push({ id: 50, content: '내 알림장(옛 길)', images: [], sent: false });
      localStorage.setItem('tkd_notices', JSON.stringify(notices));
      await saveToFirebase('notices', notices);                /* v317 이 하던 그 길 — 통째로 */
      await new Promise((x) => setTimeout(x, 400));
      return window.__srv.B['data/notices'];
    });
    say(!!byId(old, 50), '[옛] 내 «알림장» 은 올라갔다'.padEnd(46) + (byId(old, 50) || {}).content);
    say(!byId(old, 99), '★ [옛] **남의 «알림장» 이 사라졌다**'.padEnd(46) + ((byId(old, 99) || {}).content || '(없음)'));
    /* ── 지금 길 — `saveNotices()` (바뀐 레코드만) */
    const now = await p.evaluate(async () => {
      window.__otherDevice('data/notices', (a) => { a.push({ id: 98, content: '남의 알림장2', images: [], sent: false }); });
      notices = loadNotices();
      notices.push({ id: 51, content: '내 알림장(지금 길)', images: [], sent: false });
      saveNotices();
      await new Promise((x) => setTimeout(x, 900));
      return { srv: window.__srv.B['data/notices'],
               writes: (window.__writes || []).filter((w) => /data\/notices/.test(w)) };
    });
    say(!!byId(now.srv, 51), '★ 내 «알림장» 이 남았다'.padEnd(46) + (byId(now.srv, 51) || {}).content);
    say(!!byId(now.srv, 98), '★ **남의 «알림장» 도 남았다**'.padEnd(46) + ((byId(now.srv, 98) || {}).content || '(없음)'));
    say(now.writes.some((w) => w === 'tx B/data/notices'),
      '★ 트랜잭션으로 썼다'.padEnd(46) + now.writes.join(' · '));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓑ 업체 설정 — **칸 단위**(내가 계좌 · 남이 도장)');
  {
    const p = await openAdmin(b, 120);
    const r = await p.evaluate(async () => {
      window.__otherDevice('data/org', (a) => { a.stamp = '남이 올린 도장'; });
      var o = loadOrgSettings(); o.bank = '내가 바꾼 계좌';
      saveOrgSettings(o);
      await new Promise((x) => setTimeout(x, 900));
      return window.__srv.B['data/org'];
    });
    say(r.bank === '내가 바꾼 계좌', '★ 내 칸이 남았다'.padEnd(46) + r.bank);
    say(r.stamp === '남이 올린 도장', '★ **남의 칸도 남았다**'.padEnd(46) + (r.stamp || '(없음)'));
    say(r.name === '가온학원', '  다른 칸은 그대로'.padEnd(46) + r.name);
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒ 세무 — **줄 단위**(같은 달 다른 줄)');
  {
    const p = await openAdmin(b, 120);
    const r = await p.evaluate(async () => {
      window.__otherDevice('data/tax', (a) => {
        a['2026_11'].income.push({ id: 't9', name: '남이 넣은 줄', amount: 99000, taxType: '과세' });
      });
      var d = loadTaxData();
      d['2026_11'].income.push({ id: 't2', name: '내가 넣은 줄', amount: 180000, taxType: '과세' });
      saveTaxData(d);
      await new Promise((x) => setTimeout(x, 900));
      return window.__srv.B['data/tax']['2026_11'].income;
    });
    say(!!byId(r, 't2'), '★ 내 줄이 남았다'.padEnd(46) + (byId(r, 't2') || {}).name);
    say(!!byId(r, 't9'), '★ **남의 줄도 남았다**(같은 달)'.padEnd(46) + ((byId(r, 't9') || {}).name || '(없음)'));
    say(r.length === 3, '  줄 수 셋'.padEnd(46) + r.length);
    /* 내가 지운 줄만 빠진다 */
    const r2 = await p.evaluate(async () => {
      var d = loadTaxData();
      d['2026_11'].income = d['2026_11'].income.filter(function (x) { return x.id !== 't1'; });
      saveTaxData(d);
      await new Promise((x) => setTimeout(x, 900));
      return window.__srv.B['data/tax']['2026_11'].income;
    });
    say(!byId(r2, 't1'), '★ 내가 지운 줄만 빠졌다'.padEnd(46) + ((byId(r2, 't1') || {}).name || '(없음)'));
    say(!!byId(r2, 't9'), '★ 남의 줄은 그대로'.padEnd(46) + ((byId(r2, 't9') || {}).name || '(없음)'));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓓ 품목 — id 붙이는 첫 저장은 통째 · 그 뒤부터 얹기');
  {
    const p = await openAdmin(b, 120);
    const r = await p.evaluate(async () => {
      var L = loadProducts();
      L.push({ code: 'A2', name: '무', price: 2000, inPrice: 1500 });
      saveProducts(L);
      await new Promise((x) => setTimeout(x, 900));
      return window.__srv.B['data/products'];
    });
    say(r.length === 2, '★ 둘 다 있다(두 벌 아님)'.padEnd(46) + r.length + '개');
    say(r.filter((x) => !!x.id).length === 2, '★ id 가 붙었다'.padEnd(46) + r.map((x) => x.id || '(없음)').join(','));
    const r2 = await p.evaluate(async () => {
      window.__otherDevice('data/products', (a) => { a.push({ id: 'p_other', code: 'B1', name: '남이 넣은 품목', price: 500 }); });
      var L = loadProducts();
      L[0].price = 3300;
      saveProducts(L);
      await new Promise((x) => setTimeout(x, 900));
      return window.__srv.B['data/products'];
    });
    say(!!byId(r2, 'p_other'), '★ 둘째 저장은 얹는다 — 남의 품목이 남았다'.padEnd(46) + ((byId(r2, 'p_other') || {}).name || '(없음)'));
    say(r2.filter((x) => x.price === 3300).length === 1, '  내 수정도 올라갔다'.padEnd(46) + '3,300');
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓔ 읽기 전용(기간 끝) — 막고 **안내**한다');
  {
    const p = await openAdmin(b, 60);
    const r = await p.evaluate(async () => {
      window._readOnlyMode = true;
      const before = (window.__writes || []).length;
      notices = loadNotices();
      notices.push({ id: 77, content: '읽기전용에서 쓴 알림장', images: [], sent: false });
      localStorage.setItem('tkd_notices', JSON.stringify(notices));
      const ok = await saveListKey('notices');
      const ok2 = await saveMapKey('org');
      await new Promise((x) => setTimeout(x, 900));
      return { ok: ok, ok2: ok2,
               writes: (window.__writes || []).slice(before).filter((w) => /data\/(notices|org)/.test(w)),
               alerts: (window.__alerts || []).slice(),
               srv: window.__srv.B['data/notices'] };
    });
    say(r.ok === false && r.ok2 === false, '★ 저장이 거짓을 돌려준다'.padEnd(46) + r.ok + '/' + r.ok2);
    say(r.writes.length === 0, '★ 서버 쓰기 0'.padEnd(46) + (r.writes.join(' · ') || '0건'));
    say(r.alerts.some((m) => /저장하지 않았어요|읽기 전용|기간/.test(m)),
      '★ 안내가 떴다'.padEnd(46) + (r.alerts.join('|').slice(0, 26) || '없음'));
    say(!byId(r.srv, 77), '  서버 값은 그대로'.padEnd(46) + ((byId(r.srv, 77) || {}).content || '(없음)'));
    await p.close();
  }

  console.log('\nⓕ 네 크기 — «알림장»·세무·설정 화면 글자·숫자가 **같다**(천단위 쉼표 그대로)');
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
        out.notice = draw('notice').slice(0, 500);
        out.tax = draw('tax').slice(0, 500);
        out.settings = draw('settings').slice(0, 500);
        out.수 = [loadNotices().length, Object.keys(loadTaxData()).length,
                  loadProducts().length, loadInvoices().length, loadCertificates().length].join('/');
        out.쉼표 = /\d{1,3},\d{3}/.test(out.tax) ? '있다' : '없다';
        return out;
      });
      shots.push({ n: s.n, r: r, errs: p.__errs.slice() });
      await p.close();
    }
    const base = shots[0];
    shots.forEach((s) => {
      say(s.r.수 === base.r.수, (s.n + ' — «알림장»/세무/품목/명세서/자격증 수').padEnd(46) + s.r.수);
      say(s.errs.length === 0, (s.n + ' — 오류 0').padEnd(46) + (s.errs[0] || 'OK'));
    });
    say(shots.every((s) => s.r.notice === base.r.notice),
      '★ «알림장» 글자가 네 크기에서 같다'.padEnd(46) + base.r.notice.slice(0, 20));
    say(shots.every((s) => s.r.tax === base.r.tax && s.r.settings === base.r.settings),
      '★ 세무·설정 글자도 같다'.padEnd(46) + base.r.tax.slice(0, 20));
    say(shots.every((s) => s.r.쉼표 === '있다'), '★ 천단위 쉼표가 네 크기에 다 있다'.padEnd(46) + base.r.쉼표);
  }

  await b.close();
  console.log(bad ? '\nX 문제 ' + bad + '건' : '\n✔ 전부 통과');
  console.log('※ 바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})();
