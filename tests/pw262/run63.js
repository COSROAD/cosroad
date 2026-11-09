/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v304(코스로드63) 실제 크롬 — **삭제 단순판** · 네 크기.
   ⓐ **막는 안내 글이 안 잘리나** — 차량·직원 「먼저 해제하세요」 글을 네 크기에서 **글자 수까지** 재고,
      같은 글을 화면 상자(토스트 꼴)에 넣어 **가로 넘침 0**(scrollWidth ≤ clientWidth)을 본다
   ⓑ **문지기 토스트**(첫 동기화 전) — 실제로 떠서 **읽히나** · 네 크기에서 안 잘리나
   ⓒ 연결이 있으면 **아무것도 안 지워진다**(차량·직원) · 없으면 **지워진다**
   ⓓ 「전체 삭제」 — 백업 파일이 **먼저** 만들어지고(다운로드 가로채기) 명단이 비고 **서버에도 올라간다**
   ⓔ 지나간 기록(출결·수납)이 있어도 «회원» 은 지워진다 — **막지 않는다**
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');

const APP = process.env.COS_APP || ('' + COS_ROOT + '/index.html');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

const CARS = [
  { id: 'car1', name: '1호차', driver: '박기사', helperStaffId: 'st1' },
  { id: 'car2', name: '2호차', driver: '김기사' }
];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [
  { id: 1, name: '가하은', carId: 'car1', carIdDrop: 'car1', courseId: 'c1', days: D7,
    location: '인천 연수구 1', lat: 37.41, lon: 126.68, phone: '010-1111-1111',
    hasPin: true, monthly: 150000 },
  { id: 2, name: '나다움', carId: 'car1', courseId: 'c1', days: D7,
    location: '인천 연수구 2', lat: 37.42, lon: 126.69, phone: '010-2222-2222', hasPin: true },
  { id: 3, name: '다가을', carId: '', courseId: 'c1', days: D7,
    location: '인천 연수구 3', lat: 37.43, lon: 126.70, phone: '010-3333-3333' }
];
const STAFF = [{ id: 'st1', name: '최직원', hasPin: true }, { id: 'st2', name: '한직원', hasPin: true }];

function seed(opt) {
  opt = opt || {};
  return '(function(){\n'
    + '  window._userOrgId="B"; currentMode="admin";\n'
    + '  var S="__B";\n'
    + '  localStorage.setItem("tkd_cars"+S, ' + JSON.stringify(JSON.stringify(CARS)) + ');\n'
    + '  localStorage.setItem("tkd_courses"+S, ' + JSON.stringify(JSON.stringify(COURSES)) + ');\n'
    + '  localStorage.setItem("tkd_members"+S, ' + JSON.stringify(JSON.stringify(MEMBERS)) + ');\n'
    + '  localStorage.setItem("tkd_staff"+S, ' + JSON.stringify(JSON.stringify(STAFF)) + ');\n'
    + '  localStorage.setItem("tkd_org"+S, JSON.stringify({name:"가온학원",icon:"🚐",bizType:"academy",\n'
    + '    destName:"학원",destLat:37.4467,destLon:126.6516}));\n'
    + '  localStorage.setItem("tkd_attendance"+S, JSON.stringify({"2026-11-01":{1:"present"}}));\n'
    + '  localStorage.setItem("tkd_payments"+S, JSON.stringify({"1_2026_11":{amount:150000}}));\n'
    + '  localStorage.setItem("tkd_ridestate"+S, "{}");\n'
    + '  window._db={}; window._fbReady=true;\n'
    + '  window.__saved=[];\n'
    + '  window._firestore={ doc:function(){return{path:"x"};}, collection:function(){return{path:"x"};},\n'
    + '    getDoc:async function(){return {exists:function(){return false;},data:function(){return{};}};},\n'
    + '    setDoc:async function(){}, deleteDoc:async function(){},\n'
    + '    getDocs:async function(){return {forEach:function(){}};},\n'
    + '    runTransaction:async function(){return null;}, onSnapshot:function(){return function(){};} };\n'
    + '  window._auth={ currentUser:{ isAnonymous:false, getIdToken:function(){ return Promise.resolve("t"); } } };\n'
    + '  window.__alerts=[]; window.alert=function(m){ window.__alerts.push(String(m)); };\n'
    + '  window.confirm=function(){return true;}; window.open=function(){return null;};\n'
    + '  window.__api=[];\n'
    + '  window.fetch=function(u,i){ try{ window.__api.push(JSON.parse((i&&i.body)||"{}")); }catch(e){}\n'
    + '    return Promise.resolve({ok:true,json:function(){return Promise.resolve({ok:true});}}); };\n'
    + '})();';
}

async function open(b, w, h, opt) {
  opt = opt || {};
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1,
    acceptDownloads: true });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    errs.push(t.slice(0, 130));
  });
  const dl = [];
  p.on('download', (d) => { dl.push(d.suggestedFilename()); });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + APP.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(seed());
  await p.evaluate((preSync) => {
    window._userBizType = 'academy'; window._userUid = 'uB';
    window._userPaidUntil = Date.now() + 30 * 86400000;
    try { _userBizType = 'academy'; } catch (e) {}
    members = loadMembers(); cars = loadCars(); courses = loadCourses();
    orgSettings = loadOrgSettings(); staff = loadStaff();
    /* 서버 저장은 **무엇을 올렸나**까지 적어 둔다 */
    const _sv = saveToFirebase;
    saveToFirebase = function (k, v) { window.__saved.push(k); return Promise.resolve(true); };
    saveCarState = function () { return Promise.resolve(true); };
    rebuildCarData = function () {};
    _firstSyncOk = !preSync;                 /* preSync=true → **첫 동기화 전** */
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
  }, !!opt.preSync);
  p.__errs = errs;
  p.__dl = dl;
  return p;
}
/* 글이 **상자 안에서 다 보이나** — 토스트와 같은 꼴(줄바꿈 두 줄 · max-width)로 넣어 재 본다.
   (막는 안내는 네이티브 `alert` 이라 브라우저가 스스로 접어 주지만, 같은 글을 화면에
    띄우는 자리가 생겨도 안 잘리는지 **미리** 본다 — 토스트 문지기 안내가 실제로 그 꼴이다.) */
const fitsBox = (p, txt) => p.evaluate((t) => {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);'
    + 'background:#344054;color:white;padding:10px 20px;border-radius:20px;'
    + 'font-size:13px;font-weight:700;z-index:9999;'
    + 'white-space:pre-line;word-break:keep-all;overflow-wrap:anywhere;'
    + 'width:max-content;max-width:calc(100vw - 32px);text-align:center;line-height:1.5;';
  d.textContent = t;
  document.body.appendChild(d);
  const r = d.getBoundingClientRect();
  const out = { sw: d.scrollWidth, cw: d.clientWidth, w: Math.round(r.width),
    right: Math.round(r.right), left: Math.round(r.left), vw: window.innerWidth,
    sh: d.scrollHeight, ch: d.clientHeight };
  d.remove();
  return out;
}, txt);

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐ 막는 안내 — 네 크기에서 글이 다 오고, 상자에 넣어도 안 잘린다');
  for (const [w, h] of SIZES) {
    const p = await open(b, w, h);
    const tag = (w + 'x' + h).padEnd(9);
    /* 차량 — «회원» 둘 + 도우미 */
    const a1 = await p.evaluate(() => {
      window.__alerts = [];
      currentCarTab = 0;
      deleteCurrentCar();
      return window.__alerts[0] || '';
    });
    say(/배정된/.test(a1) && /2명/.test(a1), tag + '[차량] «회원» 수가 든다'.padEnd(40)
      + (/(\d+)명/.exec(a1) || ['-'])[0]);
    say(/동승 도우미 최직원/.test(a1), tag + '[차량] 도우미 이름이 든다'.padEnd(40)
      + (/동승 도우미 \S+/.exec(a1) || ['없음'])[0]);
    say(a1.length >= 50, tag + '[차량] 글이 다 왔다'.padEnd(40) + a1.length + '자');
    const f1 = await fitsBox(p, a1);
    say(f1.sw <= f1.cw, tag + '★ [차량] 가로 넘침 0'.padEnd(40)
      + 'scroll ' + f1.sw + ' ≤ client ' + f1.cw);
    say(f1.left >= 0 && f1.right <= f1.vw, tag + '  [차량] 화면 안에 들어온다'.padEnd(40)
      + f1.left + '~' + f1.right + ' / ' + f1.vw);
    say(f1.sh <= f1.ch, tag + '  [차량] 세로 넘침 0'.padEnd(40) + f1.sh + ' ≤ ' + f1.ch);
    /* 직원 — 동승 배정 있음 */
    const a2 = await p.evaluate(() => {
      window.__alerts = [];
      deleteStaff('st1');
      return window.__alerts[0] || '';
    });
    say(/1호차 동승 도우미예요/.test(a2), tag + '[직원] 어느 차량인지 알려 준다'.padEnd(40)
      + (/(\S+) 동승 도우미예요/.exec(a2) || ['없음'])[0]);
    const f2 = await fitsBox(p, a2);
    say(f2.sw <= f2.cw && f2.left >= 0 && f2.right <= f2.vw,
      tag + '★ [직원] 안 잘린다'.padEnd(40) + 'scroll ' + f2.sw + ' ≤ client ' + f2.cw);
    say(p.__errs.length === 0, tag + '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓑ 문지기 토스트(첫 동기화 전) — 실제로 떠서 읽히나');
  for (const [w, h] of SIZES) {
    const p = await open(b, w, h, { preSync: true });
    const tag = (w + 'x' + h).padEnd(9);
    const r = await p.evaluate(() => {
      deleteMemberById(1);
      const all = [...document.querySelectorAll('div')]
        .filter((d) => /자료를 불러오는 중/.test(d.textContent || '')
          && getComputedStyle(d).position === 'fixed');
      const t = all[all.length - 1];
      if (!t) return { none: true, n: members.length };
      const b = t.getBoundingClientRect();
      return { txt: (t.textContent || '').trim(), sw: t.scrollWidth, cw: t.clientWidth,
        left: Math.round(b.left), right: Math.round(b.right), vw: window.innerWidth,
        n: members.length, api: window.__api.length };
    });
    say(!r.none, tag + '★ 토스트가 떴다'.padEnd(40) + (r.none ? '안 떴다' : r.txt.slice(0, 26)));
    if (!r.none) {
      say(/삭제한 내용은 저장하지 않았어요/.test(r.txt), tag + '  말이 맞다'.padEnd(40)
        + r.txt.slice(-18));
      say(r.sw <= r.cw, tag + '★ 가로 넘침 0'.padEnd(40) + r.sw + ' ≤ ' + r.cw);
      say(r.left >= 0 && r.right <= r.vw, tag + '  화면 안에 들어온다'.padEnd(40)
        + r.left + '~' + r.right + ' / ' + r.vw);
    }
    say(r.n === 3, tag + '★ 아무것도 안 지워졌다'.padEnd(40) + r.n + '명');
    say(r.api === 0, tag + '★ 서버 호출 0'.padEnd(40) + r.api);
    say(p.__errs.length === 0, tag + '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒ 연결이 있으면 아무것도 안 지워진다 · 없으면 지워진다');
  {
    const p = await open(b, 1366, 768);
    const r = await p.evaluate(async () => {
      const out = {};
      window.__alerts = []; window.__api = [];
      currentCarTab = 0; deleteCurrentCar();
      out.carsAfterBlock = cars.map((c) => c.name).join(',');
      out.memAssign = members.slice(0, 2).map((m) => (m.carId || '-') + '/' + (m.carIdDrop || '-')).join(' ');
      out.apiAfterBlock = window.__api.length;
      out.alertN = window.__alerts.length;
      /* 연결을 풀고 다시 — 이번에는 지워진다 */
      members.forEach((m) => { if (m.carId === 'car1') { m.carId = ''; m.carIdDrop = ''; } });
      delete cars[0].helperStaffId;
      window.__api = [];
      currentCarTab = 0; deleteCurrentCar();
      const cb = window._confirmCallback;
      if (typeof cb === 'function') await cb();
      await new Promise((r2) => setTimeout(r2, 60));
      out.carsAfterOk = cars.map((c) => c.name).join(',');
      /* ★ 지운 뒤 차량관리 화면이 **스스로 읽는** 창구(`driverInfo`·`issueOrgCode`·`kioskInfo`)가
         뒤에 붙는다 — 삭제와 무관하므로 **지우는 셋만** 센다. */
      out.apiAfterOk = window.__api.map((x) => x.action)
        .filter((a) => ['removeDriverPin', 'unbindDevice', 'setCarHelper', 'removeMemberPin',
          'removeStaffPin'].indexOf(a) >= 0).join(',');
      return out;
    });
    say(r.carsAfterBlock === '1호차,2호차', '★ [막힘] 차량 그대로'.padEnd(46) + r.carsAfterBlock);
    say(r.memAssign === 'car1/car1 car1/-', '  [막힘] «회원» 배정 그대로'.padEnd(46) + r.memAssign);
    say(r.apiAfterBlock === 0, '  [막힘] 서버 호출 0'.padEnd(46) + r.apiAfterBlock);
    say(r.alertN === 1, '  [막힘] 안내 한 번'.padEnd(46) + r.alertN);
    say(r.carsAfterOk === '2호차', '★ [연결 풀고] 지워진다'.padEnd(46) + r.carsAfterOk);
    say(r.apiAfterOk === 'removeDriverPin,unbindDevice',
      '  [연결 풀고] 서버 먼저 두 걸음'.padEnd(46) + r.apiAfterOk);
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓓ 「전체 삭제」 — 백업 파일이 먼저 · 명단 비움 · 서버에도 저장');
  {
    const p = await open(b, 1366, 768);
    const r = await p.evaluate(async () => {
      window.__alerts = []; window.__api = []; window.__saved = [];
      resetData();
      const cb = window._confirmCallback;
      if (typeof cb === 'function') await cb();
      await new Promise((r2) => setTimeout(r2, 120));
      return { n: members.length, api: window.__api.map((x) => x.action + ':' + x.memberId).join(','),
        saved: window.__saved.filter((k) => k === 'members').length,
        alerts: window.__alerts.length };
    });
    /* 실제 다운로드가 잡히기까지 잠깐 기다린다 */
    await p.waitForTimeout(700);
    say(p.__dl.length === 1, '★ 백업 파일이 **실제로** 내려갔다'.padEnd(46)
      + (p.__dl[0] || '0개'));
    say(/^COSROAD_백업_/.test(p.__dl[0] || ''), '  파일 이름'.padEnd(46) + (p.__dl[0] || '-'));
    say(r.api === 'removeMemberPin:1,removeMemberPin:2',
      '★ PIN 있는 둘의 서버 PIN 을 지웠다'.padEnd(46) + r.api);
    say(r.n === 0, '★ 명단이 비었다'.padEnd(46) + r.n + '명');
    say(r.saved >= 1, '★ 서버에도 저장했다'.padEnd(46) + r.saved + '번');
    say(r.alerts === 0, '  안내창 0'.padEnd(46) + r.alerts);
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓔ 지나간 기록(출결·수납)은 삭제를 막지 않는다');
  {
    const p = await open(b, 390, 844);
    const r = await p.evaluate(async () => {
      const att0 = !!((loadAttendance()['2026-11-01'] || {})[1]);
      const pay0 = Object.keys(loadPayments()).length;
      window.__alerts = []; window.__api = [];
      deleteMemberById(1);
      const cb = window._confirmCallback;
      if (typeof cb === 'function') await cb();
      await new Promise((r2) => setTimeout(r2, 80));
      return { att0: att0, pay0: pay0, names: members.map((m) => m.name).join(','),
        alerts: window.__alerts.length,
        att1: !!((loadAttendance()['2026-11-01'] || {})[1]),
        pay1: Object.keys(loadPayments()).length,
        api: window.__api.map((x) => x.action).join(',') };
    });
    say(r.att0 === true && r.pay0 > 0, '(씨앗) 출결·수납 기록이 있다'.padEnd(46)
      + r.att0 + '/' + r.pay0);
    say(r.names === '나다움,다가을', '★ 기록이 있어도 지워진다'.padEnd(46) + r.names);
    say(r.alerts === 0, '  막지 않는다(안내창 0)'.padEnd(46) + r.alerts);
    say(r.api === 'removeMemberPin', '  서버 PIN 먼저(v303 그대로)'.padEnd(46) + r.api);
    say(r.att1 === true && r.pay1 === r.pay0, '★ 지나간 기록은 **남는다**'.padEnd(46)
      + r.att1 + '/' + r.pay1);
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log('\n' + (bad ? 'X 실패 ' + bad + '건' : 'o 전부 통과') + ' — 실제 크롬 4크기');
  console.log('※ 바깥 요청 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})();
