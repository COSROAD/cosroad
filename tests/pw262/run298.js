/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v298(코스로드60-B4 보정1) 실제 크롬 390×844 — **같은 날 두 번 누르면 등원 알림은 한 번**.
   ⓐ 관리자 출결 판 — 같은 «회원» PIN 두 번 → 알림톡 **1건** · 둘째 화면 「이미 출석했어요 (처음 시각)」
   ⓑ 출석 전용 기기 — 같은 PIN 두 번 → 같은 두 글(앱은 알림톡을 **아예 안 보낸다** — 서버가 보낸다)
   ⓒ (대조) **옛 서버**(`first` 가 없는 응답)면 **종전 그대로** 두 번 다 보낸다(배포 틈 보호)
   바깥 요청 전부 차단 · Firestore·서버 api 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');

/* ★ 대조용 — `COS_APP` 에 **옛 판 index.html** 을 주면 그것을 띄운다(이 묶음이 잡는지 본다) */
const APP = process.env.COS_APP || ('' + COS_ROOT + '/index.html');
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1111-1111', pin: '1111' },
  { id: 2, name: '나다움', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2', lat: 37.42, lon: 126.69, phone: '010-2222-2222', pin: '2222' }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];

/* 백틱을 쓰지 않는다(틀이 조용히 끊긴다 · v275 교훈) */
function seed(opt) {
  opt = opt || {};
  return '(function(){\n'
    + '  var ORG = { name:"가온학원", icon:"🚐", bizType:"academy", destName:"학원",\n'
    + '              destLat:37.4467, destLon:126.6516, tel:"032-111-2222" };\n'
    + '  var BOX = { "data/members": ' + JSON.stringify(MEM) + ',\n'
    + '              "data/cars": ' + JSON.stringify(CARS) + ', "data/courses": ' + JSON.stringify(COURSES) + ',\n'
    + '              "data/org": ORG, "data/orgDriver": ORG, "data/staff": [],\n'
    + '              "data/migration": { carState:true, at:1 }, "data/staffAtt": {},\n'
    + '              "data/attendance": {}, "data/attendanceTime": {},\n'
    + '              "carState/car1": { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},\n'
    + '                                 delivDone:{}, dropDone:{}, att:{} } };\n'
    + '  window.__srv = { B: BOX };\n'
    + '  window.__writes = []; window.__api = []; window.__alerts = []; window.__subs = [];\n'
    + '  window.__oldServer = ' + (opt.oldServer ? 'true' : 'false') + ';\n'
    + '  window._db = {}; window._fbReady = true;\n'
    + '  function boxOf(org){ window.__srv[org] = window.__srv[org] || {}; return window.__srv[org]; }\n'
    + '  function pathOf(a){ return Array.prototype.slice.call(a,1); }\n'
    + '  window._firestore = {\n'
    + '    doc:function(){ var p=pathOf(arguments); return {org:p[1], key:p.slice(2).join("/")}; },\n'
    + '    collection:function(){ var p=pathOf(arguments); return {org:p[1], key:p.slice(2).join("/")}; },\n'
    + '    getDoc:async function(ref){ var b=boxOf(ref.org);\n'
    + '      var has=Object.prototype.hasOwnProperty.call(b, ref.key);\n'
    + '      return { exists:function(){return has;}, data:function(){return {value:JSON.stringify(b[ref.key])};} }; },\n'
    + '    getDocs:async function(ref){ var b=boxOf(ref.org); var pre=ref.key+"/";\n'
    + '      var ks=Object.keys(b).filter(function(k){ return k.indexOf(pre)===0; });\n'
    + '      return { forEach:function(cb){ ks.forEach(function(k){\n'
    + '        cb({ id:k.slice(pre.length), data:function(){ return {value:JSON.stringify(b[k])}; } }); }); } }; },\n'
    + '    setDoc:async function(ref,d){ window.__writes.push("set "+ref.org+"/"+ref.key);\n'
    + '      boxOf(ref.org)[ref.key] = (d && d.value!==undefined) ? JSON.parse(d.value) : d; },\n'
    + '    deleteDoc:async function(){},\n'
    + '    runTransaction:async function(db, fn){\n'
    + '      var puts = [];\n'
    + '      var out = await fn({ get:async function(ref){ var b=boxOf(ref.org);\n'
    + '          var has=Object.prototype.hasOwnProperty.call(b, ref.key);\n'
    + '          return { exists:function(){return has;}, data:function(){return {value:JSON.stringify(b[ref.key])};} }; },\n'
    + '        set:function(ref,d){ puts.push([ref, d]); } });\n'
    + '      puts.forEach(function(x){ window.__writes.push("tx "+x[0].org+"/"+x[0].key);\n'
    + '        boxOf(x[0].org)[x[0].key] = JSON.parse(x[1].value); });\n'
    + '      return out;\n'
    + '    },\n'
    + '    onSnapshot:function(ref, cb){ var s={org:ref.org, key:ref.key, cb:cb, alive:true};\n'
    + '      window.__subs.push(s); return function(){ s.alive=false; }; }\n'
    + '  };\n'
    /* 가짜 서버 — **v298 서버와 같은 셈**: 출석 시각 칸이 이미 있으면 `first:false` */
    + '  window.__punch = function(pin, forKiosk){\n'
    + '    var MEMS = ' + JSON.stringify(MEM) + ';\n'
    + '    var m = MEMS.filter(function(x){ return String(x.pin)===String(pin); })[0];\n'
    + '    if(!m) return { ok:false, why:"nomember", message:"PIN 번호가 올바르지 않습니다." };\n'
    + '    var box = window.__srv.B, D = window.__today;\n'
    + '    box["data/attendance"][D] = box["data/attendance"][D] || {};\n'
    + '    box["data/attendanceTime"][D] = box["data/attendanceTime"][D] || {};\n'
    + '    var first = !box["data/attendanceTime"][D][String(m.id)];\n'
    + '    if(first){ box["data/attendanceTime"][D][String(m.id)] = "09:05";\n'
    + '               window.__writes.push("tx(서버) B/data/attendanceTime"); }\n'
    + '    if(box["data/attendance"][D][String(m.id)] !== "present"){\n'
    + '      box["data/attendance"][D][String(m.id)] = "present";\n'
    + '      window.__writes.push("tx(서버) B/data/attendance"); }\n'
    + '    var out = { ok:true, name:m.name, photo:"",\n'
    + '                time:String(box["data/attendanceTime"][D][String(m.id)]), date:D };\n'
    + '    if(!forKiosk) out.kind = "member";\n'
    + '    if(forKiosk) out.sent = first ? 1 : 0;\n'
    + '    if(!window.__oldServer) out.first = first;\n'
    + '    return out;\n'
    + '  };\n'
    + '  window.fetch = function(url, init){\n'
    + '    var body = {}; try{ body = JSON.parse((init&&init.body)||"{}"); }catch(e){}\n'
    + '    window.__api.push(body);\n'
    + '    var out = { ok:false };\n'
    + '    if(body.action === "pinCheckin" && body.member === true) out = window.__punch(body.pin, false);\n'
    + '    else if(body.action === "pinCheckin") out = { ok:false, why:"notdriver" };\n'
    + '    else if(body.action === "kioskCheckin") out = window.__punch(body.pin, true);\n'
    + '    else if(body.action === "kioskLogin") out = { ok:true, token:"T", org:"B",\n'
    + '                                                  orgName:"가온학원", bizType:"academy" };\n'
    + '    else if(body.tpl_code) out = { code:0 };\n'
    + '    return Promise.resolve({ ok:true, json:function(){ return Promise.resolve(out); } });\n'
    + '  };\n'
    + '  window._auth = { currentUser: { isAnonymous:false, uid:"' + (opt.kiosk ? 'ksk_B' : 'uB') + '",\n'
    + '    getIdToken:function(){ return Promise.resolve("tok"); },\n'
    + '    getIdTokenResult:function(){ return Promise.resolve({ claims:{ kiosk:true, org:"B" } }); } } };\n'
    + '  window._authFns = { signInWithCustomToken:function(){ return Promise.resolve(); },\n'
    + '                      onAuthStateChanged:function(){ return function(){}; },\n'
    + '                      signOut:function(){ return Promise.resolve(); } };\n'
    + '  window.alert=function(m){ window.__alerts.push(String(m)); };\n'
    + '  window.confirm=function(){return true;}; window.open=function(){return null;};\n'
    /* ★ 판 안내는 1.5~3초 뒤에 지워진다 — **쓰인 것을 전부 적어 둔다**(pad293 교훈) */
    + '  window.__padMsgs = [];\n'
    + '  var _el = document.getElementById("pin-result");\n'
    + '  var _own = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");\n'
    + '  Object.defineProperty(_el, "innerHTML", {\n'
    + '    get:function(){ return _own.get.call(this); },\n'
    + '    set:function(v){ var t=String(v).replace(/<[^>]*>/g," ").replace(/\\s+/g," ").trim();\n'
    + '                     if(t) window.__padMsgs.push(t); _own.set.call(this, v); } });\n'
    + '})();';
}

async function openPage(b, opt) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
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
  await p.evaluate(seed(opt));
  p.__errs = errs;
  return p;
}

async function openAdmin(b, opt) {
  const p = await openPage(b, opt);
  await p.evaluate(async () => {
    window.__today = todayStr();
    currentMode = 'admin'; window._userOrgId = 'B'; window._userUid = 'uB';
    window._userBizType = 'academy'; window._userPaidUntil = Date.now() + 30 * 86400000;
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    initApp();
    await syncFromFirebase();
    switchAdminTab('attendance');
  });
  /* 첫 동기화 깃발이 설 때까지 기다린다(시간으로 어림짐작하지 않는다 · v295 교훈) */
  await p.waitForFunction(() => window._firstSyncOk === true, {}, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  return p;
}
/* 알림톡·문자 요청만 센다(그 본문에는 `tpl_code` 나 `receiver` 가 있다) */
const alimOf = (p) => p.evaluate(() => (window.__api || [])
  .filter((x) => x.tpl_code || x.receiver || x.msg).length);
const msgsOf = (p) => p.evaluate(() => (window.__padMsgs || []).slice());
const srvDay = (p) => p.evaluate(() => (window.__srv.B['data/attendance'] || {})[window.__today] || {});

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐ 관리자 출결 판 — 같은 «회원» PIN 을 **두 번**');
  {
    const p = await openAdmin(b, {});
    const press = async (pin) => {
      await p.evaluate(async (v) => {
        attViewDate = window.__today;
        openPinCheckin('member'); pinPadKind = 'member'; pinInput = v;
        await checkPin();
        await new Promise((x) => setTimeout(x, 900));
      }, pin);
    };
    await press('1111');
    const a1 = await alimOf(p), m1 = await msgsOf(p);
    await press('1111');
    const a2 = await alimOf(p), m2 = await msgsOf(p);
    const sv = await srvDay(p);
    const w = await p.evaluate(() => (window.__writes || [])
      .filter((x) => /data\/attendance$/.test(x)).length);
    say(a1 === 1, '첫 누름 — 알림톡 1건'.padEnd(46) + a1 + '건');
    say(/출석 완료/.test(m1.join(' | ')), '  화면 「출석 완료!」'.padEnd(46) + (m1[m1.length - 1] || '').slice(0, 24));
    say(a2 - a1 === 0, '★ 둘째 누름 — 알림톡 **0건 더**'.padEnd(46) + (a2 - a1) + '건');
    const last = m2[m2.length - 1] || '';
    say(/이미 출석했어요/.test(last), '★ 둘째 화면 「이미 출석했어요」'.padEnd(46) + last.slice(0, 30));
    say(/09:05/.test(last), '  처음 시각이 보인다'.padEnd(46) + (/09:05/.test(last) ? '09:05' : '없음'));
    say(String(sv['1']) === 'present', '  출석은 그대로'.padEnd(46) + String(sv['1']));
    say(w === 1, '★ 출석 문서 쓰기는 **한 번뿐**'.padEnd(46) + w + '번');
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓑ 출석 전용 기기 — 같은 PIN 을 **두 번**');
  {
    const p = await openPage(b, { kiosk: true });
    const r = await p.evaluate(async () => {
      window.__today = todayStr();
      loginPick('kiosk');
      document.getElementById('ksk-orgcode').value = '123456';
      document.getElementById('ksk-code').value = '777777';
      await loginKiosk();
      await new Promise((x) => setTimeout(x, 300));
      for (const ch of '1111') pinPress(ch);
      await new Promise((x) => setTimeout(x, 700));
      const first = (window.__padMsgs || []).slice();
      for (const ch of '1111') pinPress(ch);
      await new Promise((x) => setTimeout(x, 700));
      return { first: first, all: (window.__padMsgs || []).slice(),
               calls: (window.__api || []).filter((x) => x.action === 'kioskCheckin').length,
               alim: (window.__api || []).filter((x) => x.tpl_code || x.receiver || x.msg).length };
    });
    say(r.calls === 2, '기기 창구를 두 번 불렀다'.padEnd(46) + r.calls + '번');
    say(/출석 완료/.test(r.first.join(' | ')), '첫 누름 — 「출석 완료!」'.padEnd(46)
      + (r.first[r.first.length - 1] || '').slice(0, 24));
    const last = r.all[r.all.length - 1] || '';
    say(/이미 출석했어요/.test(last), '★ 둘째 누름 — 「이미 출석했어요」'.padEnd(46) + last.slice(0, 30));
    say(/09:05/.test(last), '  처음 시각이 보인다'.padEnd(46) + (/09:05/.test(last) ? '09:05' : '없음'));
    say(r.alim === 0, '★ 앱은 알림톡을 **아예 안 보낸다**(서버가 보낸다)'.padEnd(46) + r.alim + '건');
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒ (대조) **옛 서버**(`first` 없음) — 종전 그대로 두 번 다 보낸다');
  {
    const p = await openAdmin(b, { oldServer: true });
    const press = async (pin) => {
      await p.evaluate(async (v) => {
        attViewDate = window.__today;
        openPinCheckin('member'); pinPadKind = 'member'; pinInput = v;
        await checkPin();
        await new Promise((x) => setTimeout(x, 900));
      }, pin);
    };
    await press('1111');
    await press('1111');
    const a = await alimOf(p), m = await msgsOf(p);
    say(a === 2, '★ 알림톡 2건(종전 동작)'.padEnd(46) + a + '건');
    say(!/이미 출석했어요/.test(m.join(' | ')), '  화면도 종전대로'.padEnd(46)
      + (m[m.length - 1] || '').slice(0, 24));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log('\n' + (bad ? 'X 실패 ' + bad + '건' : 'o 전부 통과') + ' — 실제 크롬 390×844');
  console.log('※ 바깥 요청 차단 · Firestore·api 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})();
