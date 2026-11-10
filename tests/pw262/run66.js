/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v307(코스로드66) 실제 크롬 — **사진 문지기** · **품목 겹침 검사** · 네 크기.
   ⓐ 사진 두 곳 — 둘러보기·읽기 전용·첫 동기화 전에 **올린 사진 0** · 안내가 뜨고 **안 잘리나** ·
      멀쩡하면 **그대로 올라가나**(막아만 두면 기능이 죽는다)
   ⓑ 운행 사진 — 문지기가 막았을 때 **「인터넷 연결 확인」이라는 틀린 까닭을 안 덧붙이나**
   ⓒ 품목 엑셀 — 같은 엑셀을 **두 번** 올려도 품목이 안 늘고, 안내가 네 크기에서 안 잘리나
   바깥 요청 전부 차단 · Firestore·Storage 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');

const APP = process.env.COS_APP || ('' + COS_ROOT + '/index.html');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

const CARS = [{ id: 'car1', name: '1호차', driver: '박기사' }];
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
  location: '인천 연수구 1', lat: 37.41, lon: 126.68, phone: '010-1111-1111' }];
const NOTICES = [{ id: 1, ts: Date.UTC(2026, 10, 1, 2, 0), date: '2026-11-01',
  content: '오늘은 비가 옵니다', images: ['data:image/jpeg;base64,AAAA'],
  target: 'all', targetLabel: '전체' }];
const PRODUCTS = [{ code: 'SM-000', name: '서울우유 버터 12kg', spec: '12kg', unit: 'BOX',
  tax: '포함', inPrice: 150000, price: 170000 }];

function seed() {
  return '(function(){\n'
    + '  window._userOrgId="B"; currentMode="admin";\n'
    + '  var S="__B";\n'
    + '  localStorage.setItem("tkd_cars"+S, ' + JSON.stringify(JSON.stringify(CARS)) + ');\n'
    + '  localStorage.setItem("tkd_courses"+S, JSON.stringify([{id:"c1",name:"오전반"}]));\n'
    + '  localStorage.setItem("tkd_members"+S, ' + JSON.stringify(JSON.stringify(MEMBERS)) + ');\n'
    + '  localStorage.setItem("tkd_notices"+S, ' + JSON.stringify(JSON.stringify(NOTICES)) + ');\n'
    + '  localStorage.setItem("tkd_products"+S, ' + JSON.stringify(JSON.stringify(PRODUCTS)) + ');\n'
    + '  localStorage.setItem("tkd_staff"+S, "[]");\n'
    + '  localStorage.setItem("tkd_org"+S, JSON.stringify({name:"가온학원",icon:"🚐",bizType:"logistics",\n'
    + '    destName:"창고",destLat:37.4467,destLon:126.6516}));\n'
    + '  localStorage.setItem("tkd_ridestate"+S, "{}");\n'
    + '  window._db={}; window._fbReady=true; window.__saved=[];\n'
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
    + '  /* 가짜 Storage — 무엇이 올라갔나만 적는다(실제 통신 0) */\n'
    + '  window.__up=[];\n'
    + '  window._storage={};\n'
    + '  window._storageFns={\n'
    + '    storageRef:function(st,path){ return {path:path}; },\n'
    + '    uploadString:function(sref){ window.__up.push(sref.path); return Promise.resolve({ref:sref}); },\n'
    + '    getDownloadURL:function(ref){ return Promise.resolve("https://fb.example/"+ref.path); }\n'
    + '  };\n'
    + '})();';
}

async function open(b, w, h, opt) {
  opt = opt || {};
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    errs.push(t.slice(0, 130));
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + APP.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(seed());
  await p.evaluate((o) => {
    window._userBizType = 'logistics'; window._userUid = 'uB';
    window._userPaidUntil = Date.now() + 30 * 86400000;
    try { _userBizType = 'logistics'; } catch (e) {}
    members = loadMembers(); cars = loadCars(); courses = loadCourses();
    orgSettings = loadOrgSettings(); staff = loadStaff(); notices = loadNotices();
    saveToFirebase = function (k) { window.__saved.push(k); return Promise.resolve(true); };
    saveCarState = function () { return Promise.resolve(true); };
    rebuildCarData = function () {};
    _firstSyncOk = !o.preSync;
    if (o.demo) { isDemoMode = function () { return true; }; }
    if (o.readOnly) { isReadOnlyMode = function () { return true; }; }
    document.getElementById('admin-screen').classList.add('show');
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
  }, { preSync: !!opt.preSync, demo: !!opt.demo, readOnly: !!opt.readOnly });
  p.__errs = errs;
  return p;
}
/* 화면에 뜬 토스트(고정 상자) 중 가장 마지막 것 — 글이 안 잘리나까지 잰다 */
const toastOf = (p, re) => p.evaluate((rs) => {
  const r = new RegExp(rs);
  const all = [...document.querySelectorAll('div')]
    .filter((d) => r.test(d.textContent || '') && getComputedStyle(d).position === 'fixed');
  const t = all[all.length - 1];
  if (!t) return null;
  const bb = t.getBoundingClientRect();
  return { txt: (t.textContent || '').trim(), sw: t.scrollWidth, cw: t.clientWidth,
    left: Math.round(bb.left), right: Math.round(bb.right), vw: window.innerWidth };
}, re);

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐ 사진 두 곳 — 네 크기에서 막히고, 안내가 안 잘린다');
  for (const [w, h] of SIZES) {
    const p = await open(b, w, h, { preSync: true });
    const tag = (w + 'x' + h).padEnd(9);
    const r = await p.evaluate(async () => {
      let got = 'none';
      uploadNoticeImages(notices[0].images, function (urls) { got = String(urls); });
      await new Promise((r2) => setTimeout(r2, 60));
      return { up: window.__up.length, got: got };
    });
    say(r.up === 0, tag + '★ [«알림장»] 올린 사진 0'.padEnd(40) + r.up + '장');
    say(r.got === 'null', tag + '  `cb` 가 실패(null)'.padEnd(40) + r.got);
    const t = await toastOf(p, '자료를 불러오는 중');
    say(!!t, tag + '★ 안내 토스트가 떴다'.padEnd(40) + (t ? t.txt.slice(0, 22) : '안 떴다'));
    if (t) {
      say(/사진은 저장하지 않았어요/.test(t.txt), tag + '  말이 맞다'.padEnd(40) + t.txt.slice(-14));
      say(t.sw <= t.cw, tag + '★ 가로 넘침 0'.padEnd(40) + t.sw + ' ≤ ' + t.cw);
      say(t.left >= 0 && t.right <= t.vw, tag + '  화면 안에 들어온다'.padEnd(40)
        + t.left + '~' + t.right + ' / ' + t.vw);
    }
    say(p.__errs.length === 0, tag + '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓐ-2 둘러보기·읽기 전용도 막힌다 · 멀쩡하면 올라간다');
  {
    for (const [nm, opt] of [['둘러보기', { demo: true }], ['읽기 전용', { readOnly: true }]]) {
      const p = await open(b, 390, 844, opt);
      const r = await p.evaluate(async () => {
        uploadNoticeImages(notices[0].images, function () {});
        uploadDriveLogPhoto('data:image/jpeg;base64,AAAA', function () {});
        await new Promise((r2) => setTimeout(r2, 80));
        return { up: window.__up.length };
      });
      say(r.up === 0, '★ [' + nm + '] 두 곳 모두 올린 사진 0'.padEnd(46) + r.up + '장');
      say(p.__errs.length === 0, '  [' + nm + '] 오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
      await p.close();
    }
    const ok = await open(b, 390, 844);
    const rk = await ok.evaluate(async () => {
      let u1 = 'none', u2 = 'none';
      uploadNoticeImages(notices[0].images, function (urls) { u1 = JSON.stringify(urls); });
      uploadDriveLogPhoto('data:image/jpeg;base64,AAAA', function (url) { u2 = String(url); });
      await new Promise((r2) => setTimeout(r2, 120));
      return { up: window.__up.slice(), u1: u1, u2: u2 };
    });
    say(rk.up.length === 2, '★ (대조) 멀쩡하면 **둘 다 올라간다**'.padEnd(46) + rk.up.length + '장');
    say(/fb\.example/.test(rk.u1), '  (대조) «알림장» 주소를 받았다'.padEnd(46)
      + (rk.u1 || '').slice(0, 24));
    say(/fb\.example/.test(rk.u2), '  (대조) 운행 사진 주소를 받았다'.padEnd(46)
      + (rk.u2 || '').slice(0, 24));
    say(ok.__errs.length === 0, '  오류 0'.padEnd(46) + (ok.__errs[0] || 'OK'));
    await ok.close();
  }

  console.log('\nⓑ 막혔을 때 **틀린 까닭을 안 덧붙인다**');
  {
    const p = await open(b, 390, 844, { preSync: true });
    const r = await p.evaluate(async () => {
      window.__t = [];
      const orig = showToast;
      showToast = function (m) { window.__t.push(String(m)); return orig(m); };
      uploadDriveLogPhoto('data:image/jpeg;base64,AAAA', function (url, why) {
        if (!url) { if (why !== 'blocked') showToast('사진을 저장하지 못했어요 (인터넷 연결 확인)'); return; }
      });
      await new Promise((r2) => setTimeout(r2, 60));
      return { t: window.__t.slice(), up: window.__up.length };
    });
    say(r.up === 0, '★ 올린 사진 0'.padEnd(46) + r.up + '장');
    say(!r.t.some((x) => /인터넷 연결 확인/.test(x)),
      '★ 「인터넷 연결 확인」을 **안 띄운다**'.padEnd(46)
      + (r.t.find((x) => /인터넷/.test(x)) || '안 띄움'));
    say(r.t.some((x) => /자료를 불러오는 중/.test(x)), '  맞는 까닭만 띄운다'.padEnd(46)
      + (r.t.find((x) => /불러오는 중/.test(x)) || '없음').slice(0, 24));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒ 품목 엑셀 — 두 번 올려도 안 늘어난다 (네 크기)');
  for (const [w, h] of SIZES) {
    const p = await open(b, w, h);
    const tag = (w + 'x' + h).padEnd(9);
    const r = await p.evaluate(async () => {
      const Orig = window.FileReader;
      window.FileReader = function () {
        const self = this;
        this.readAsArrayBuffer = function () {
          setTimeout(() => { self.onload({ target: { result: new Uint8Array([1]) } }); }, 0);
        };
      };
      window.XLSX = {
        read: () => ({ SheetNames: ['s'], Sheets: { s: {} } }),
        utils: {
          sheet_to_json: () => ([
            ['코드', '품명', '규격', '단위', '과세구분', '메모', '단가', ''],
            ['', '', '', '', '', '', '입고가', '출고가_A'],
            ['SM-000', '서울우유 버터 12kg', '12kg', 'BOX', '포함', '', 999, 888],
            ['SM-002', '새품목', '1kg', 'EA', '포함', '', 1000, 2000]
          ])
        }
      };
      window.__alerts = [];
      const n0 = loadProducts().length;
      uploadProductExcel({ target: { files: [{ name: 'p.xlsx' }] } });
      await new Promise((r2) => setTimeout(r2, 120));
      const n1 = loadProducts().length;
      /* 한 번 더 — 이번에는 **둘 다** 겹친다 */
      uploadProductExcel({ target: { files: [{ name: 'p.xlsx' }] } });
      await new Promise((r2) => setTimeout(r2, 120));
      const n2 = loadProducts().length;
      window.FileReader = Orig;
      const p0 = loadProducts().filter((x) => String(x.code) === 'SM-000')[0] || {};
      return { n0: n0, n1: n1, n2: n2, alerts: window.__alerts.slice(), price: p0.price };
    });
    say(r.n0 === 1 && r.n1 === 2, tag + '★ 처음에는 새것만 들어간다(1→2)'.padEnd(40)
      + r.n0 + '→' + r.n1);
    say(r.n2 === 2, tag + '★ 두 번째는 **안 늘어난다**(2→2)'.padEnd(40) + r.n1 + '→' + r.n2);
    say(r.price === 170000, tag + '★ 기존 단가가 **그대로**'.padEnd(40) + r.price);
    /* ★ 두 번째 안내는 **둘 다** 겹친다 — `alerts[1]` 에서만 찾는다
       (둘을 이어 붙여 찾으면 첫 안내의 「1건」이 먼저 잡혀 찍히는 값이 헷갈린다). */
    say(/2건은 이미 있어 건너뛰었어요/.test(r.alerts[1] || ''),
      tag + '★ 두 번째 안내 「2건은 이미 …」'.padEnd(40)
      + (/(\d+)건은 이미/.exec(r.alerts[1] || '') || ['없음'])[0]);
    say(/1건은 이미 있어 건너뛰었어요/.test(r.alerts[0] || ''),
      tag + '  첫 번째는 1건만 건너뛴다'.padEnd(40)
      + (/(\d+)건은 이미/.exec(r.alerts[0] || '') || ['없음'])[0]);
    say(/품목 0개를 추가했어요/.test(r.alerts[1] || ''),
      tag + '  두 번째는 더한 것이 0개'.padEnd(40)
      + (/품목 (\d+)개/.exec(r.alerts[1] || '') || ['없음'])[0]);
    say(p.__errs.length === 0, tag + '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log('\n' + (bad ? 'X 실패 ' + bad + '건' : 'o 전부 통과') + ' — 실제 크롬 4크기');
  console.log('※ 바깥 요청 차단 · Firestore·Storage 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})();
