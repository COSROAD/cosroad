/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v319(코스로드73-B) 실제 크롬 — **두 번째 누름 = 하원** 화면·기록·엑셀
   ⓐ 관리자 출결 판 — 등원 → (간격 안) → 하원 → 이미 하원 **네 글**이 차례로 뜬다
      · 하원 누름에는 **등원 알림톡을 안 보낸다**
   ⓑ 출석 전용 기기 — **같은 네 글**(한 벌 `_padView` 를 둘이 쓴다)
   ⓒ 출결 한 줄에 「🏠 시각」 · «출결» 엑셀 칸에 「✅ 08:10 / 🏠 17:05」
   ⓓ 설정 「하원 알림 보내기」 — **학원·공공만** 있고 **기본 꺼짐** · 켜면 `org.leaveNotify` 에 저장
   ⓔ 네 크기(1920·1366·390·360)에서 판 글이 **안 깨진다**(가로 넘침 0)
   ⓕ 기사 「하차 완료」 — 하원이 먼저 갔으면 서버가 `skipped:'left'` → 안내만, 표시는 남는다
   바깥 요청 전부 차단 · Firestore·서버 api 가짜 — 실제 쓰기 0 · **실제 문자·알림톡 0**. */
const { chromium } = require('playwright');

/* ★ 대조용 — `COS_APP` 에 **옛 판 index.html** 을 주면 그것을 띄운다(이 묶음이 잡는지 본다) */
const APP = process.env.COS_APP || ('' + COS_ROOT + '/index.html');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1111-1111' },
  { id: 2, name: '나다움', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2', lat: 37.42, lon: 126.69, phone: '010-2222-2222' }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];

/* 백틱을 쓰지 않는다(틀이 조용히 끊긴다 · v275 교훈) */
function seed(opt) {
  opt = opt || {};
  const biz = opt.biz || 'academy';
  return '(function(){\n'
    + '  var ORG = { name:"가온학원", icon:"🚐", bizType:"' + biz + '", destName:"학원",\n'
    + '              destLat:37.4467, destLon:126.6516, tel:"032-111-2222"'
    + (opt.leaveOn ? ', leaveNotify:true' : '') + ' };\n'
    + '  var BOX = { "data/members": ' + JSON.stringify(MEM) + ',\n'
    + '              "data/cars": ' + JSON.stringify(CARS) + ', "data/courses": ' + JSON.stringify(COURSES) + ',\n'
    + '              "data/org": ORG, "data/orgDriver": ORG, "data/staff": [],\n'
    + '              "data/migration": { carState:true, at:1 }, "data/staffAtt": {},\n'
    + '              "data/attendance": {}, "data/attendanceTime": {},\n'
    + '              "carState/car1": { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},\n'
    + '                                 delivDone:{}, dropDone:{}, att:{} } };\n'
    + '  window.__srv = { B: BOX };\n'
    + '  window.__writes = []; window.__api = []; window.__alerts = []; window.__subs = [];\n'
    + '  window.__leaveOn = ' + (opt.leaveOn ? 'true' : 'false') + ';\n'
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
    /* ★ 가짜 서버 — **v319 서버와 같은 셈**(`api/driver-auth.js punchMember` 네 갈래).
       누를 때마다 `window.__clock` 의 시각으로 찍는다(묶음이 시계를 손으로 민다). */
    + '  window.__clock = "08:10";\n'
    + '  window.__gap = 30;\n'
    + '  function _hm(x){ var m=/^(\\d{1,2}):(\\d{2})$/.exec(String(x||"")); return m?(Number(m[1])*60+Number(m[2])):-1; }\n'
    + '  function _cell(v){ if(v==null) return null;\n'
    + '    if(typeof v==="string") return v?{t:v,by:"pin",out:""}:null;\n'
    + '    if(typeof v==="object" && v.t) return {t:String(v.t),by:(v.by==="admin"?"admin":"pin"),out:String(v.out||"")};\n'
    + '    return null; }\n'
    + '  window.__punch = function(pin, forKiosk){\n'
    + '    var MEMS = ' + JSON.stringify(MEM) + ';\n'
    + '    var PINS = { "1111":1, "2222":2 };\n'
    + '    var id = PINS[String(pin)];\n'
    + '    if(!id) return { ok:false, why:"nomember", message:"PIN 번호가 올바르지 않습니다." };\n'
    + '    var m = MEMS.filter(function(x){ return x.id===id; })[0];\n'
    + '    var box = window.__srv.B, D = window.__today, now = window.__clock;\n'
    + '    box["data/attendance"][D] = box["data/attendance"][D] || {};\n'
    + '    box["data/attendanceTime"][D] = box["data/attendanceTime"][D] || {};\n'
    + '    var day = box["data/attendanceTime"][D];\n'
    + '    var info = _cell(day[String(id)]);\n'
    + '    var first=false, leg="", outTime="", gapLeft=0, tIn="";\n'
    + '    if(!info){ day[String(id)] = now; first=true; leg="in"; tIn=now;\n'
    + '               window.__writes.push("tx(서버) B/data/attendanceTime"); }\n'
    + '    else {\n'
    + '      tIn = info.t;\n'
    + '      if(info.out){ leg="already-out"; outTime=info.out; }\n'
    + '      else {\n'
    + '        var x=_hm(info.t), y=_hm(now), g=(x<0||y<0||y<x)?9999:(y-x);\n'
    + '        if(g < window.__gap){ leg="already-in"; gapLeft=window.__gap-g; }\n'
    + '        else { day[String(id)] = { t:info.t, by:info.by, out:now }; leg="out"; outTime=now;\n'
    + '               window.__writes.push("tx(서버) B/data/attendanceTime"); }\n'
    + '      }\n'
    + '    }\n'
    + '    if(box["data/attendance"][D][String(id)] !== "present"){\n'
    + '      box["data/attendance"][D][String(id)] = "present";\n'
    + '      window.__writes.push("tx(서버) B/data/attendance"); }\n'
    + '    var out = { ok:true, name:m.name, photo:"", time:tIn, date:D, first:first };\n'
    + '    if(!forKiosk) out.kind = "member";\n'
    /* ★ v319 연관 고침 — **관리자 판에만** `memberId` 를 준다(기기에는 안 준다).
       `__noMemberId` 를 켜면 **옛 서버**(v318)를 흉내 낸다 — 그때 어떻게 되는지 ⓖ 가 잰다. */
    + '    if(!forKiosk && !window.__noMemberId) out.memberId = String(id);\n'
    + '    if(forKiosk) out.sent = first ? 1 : 0;\n'
    /* 하원 문자는 **서버가** 보낸다 — 앱에서는 보낸 수만 받는다(기기든 판이든 같다) */
    + '    if(!window.__oldServer){\n'
    + '      out.leg = leg; out.outTime = outTime; out.gapLeft = gapLeft; out.gapNeed = window.__gap;\n'
    + '      out.leaveSent = (leg==="out" && window.__leaveOn) ? 1 : 0;\n'
    + '      if(out.leaveSent) window.__srvSms = (window.__srvSms||0) + 1;\n'
    + '    }\n'
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
    + '                                                  orgName:"가온학원", bizType:"' + biz + '" };\n'
    /* 하차 알림톡 — **그날 하원이 이미 찍혔으면** 서버가 `skipped:"left"` 로 답한다 */
    + '    else if(body.tpl_code){\n'
    + '      var D = window.__today, dd = (window.__srv.B["data/attendanceTime"][D]||{});\n'
    + '      var c = dd[String(body.memberId||"")];\n'
    + '      if(body.memberId && (c && typeof c==="object" && c.out)) out = { ok:true, skipped:"left" };\n'
    + '      else out = { code:0 };\n'
    + '    }\n'
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

async function openPage(b, opt, size) {
  const [w, h] = size || [390, 844];
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
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

async function openAdmin(b, opt, size) {
  const p = await openPage(b, opt, size);
  const biz = (opt && opt.biz) || 'academy';
  await p.evaluate(async (bz) => {
    window.__today = todayStr();
    currentMode = 'admin'; window._userOrgId = 'B'; window._userUid = 'uB';
    window._userBizType = bz; window._userPaidUntil = Date.now() + 30 * 86400000;
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    initApp();
    await syncFromFirebase();
    switchAdminTab('attendance');
  }, biz);
  /* 첫 동기화 깃발이 설 때까지 기다린다(시간으로 어림짐작하지 않는다 · v295 교훈) */
  await p.waitForFunction(() => window._firstSyncOk === true, {}, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  return p;
}
const msgsOf = (p) => p.evaluate(() => (window.__padMsgs || []).slice());
/* 앱이 보낸 알림톡·문자만 센다(그 본문에는 `tpl_code` 나 `receiver` 가 있다) */
const alimOf = (p) => p.evaluate(() => (window.__api || [])
  .filter((x) => x.tpl_code || x.receiver || x.msg).length);
/* 판을 한 번 누른다 — 가짜 서버 시각(`__clock`)을 밀어 간격을 만든다 */
async function press(p, pin, at) {
  await p.evaluate(async (o) => {
    if (o.at) window.__clock = o.at;
    attViewDate = window.__today;
    openPinCheckin('member'); pinPadKind = 'member'; pinInput = o.pin;
    await checkPin();
    await new Promise((x) => setTimeout(x, 900));
  }, { pin: pin, at: at });
}

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐ 관리자 출결 판 — 등원 → 간격 안 → 하원 → 이미 하원');
  {
    const p = await openAdmin(b, { leaveOn: true });
    await press(p, '1111', '08:10');                     /* 등원 */
    const m1 = (await msgsOf(p)).slice(-1)[0] || '';
    const a1 = await alimOf(p);
    await press(p, '1111', '08:20');                     /* 10분 뒤 — 간격 안 */
    const m2 = (await msgsOf(p)).slice(-1)[0] || '';
    await press(p, '1111', '17:05');                     /* 하원 */
    const m3 = (await msgsOf(p)).slice(-1)[0] || '';
    const a3 = await alimOf(p);
    await press(p, '1111', '17:30');                     /* 이미 하원 */
    const m4 = (await msgsOf(p)).slice(-1)[0] || '';
    say(/출석 완료/.test(m1), '① 등원 「출석 완료!」'.padEnd(48) + m1.slice(0, 26));
    say(/이미 출석했어요/.test(m2) && /하원은 20분 뒤부터/.test(m2),
      '② 간격 안 「이미 출석했어요 · 하원은 20분 뒤부터」'.padEnd(48) + m2.slice(0, 34));
    say(/하원 처리됐어요/.test(m3) && /17:05/.test(m3),
      '③ 하원 「🏠 하원 처리됐어요 (17:05)」'.padEnd(48) + m3.slice(0, 30));
    say(/이미 하원했어요/.test(m4) && /17:05/.test(m4),
      '④ 「이미 하원했어요 (처음 하원 시각)」'.padEnd(48) + m4.slice(0, 30));
    say(a1 === 1, '등원 알림톡 1건'.padEnd(48) + a1 + '건');
    say(a3 - a1 === 0, '★ 하원 누름에는 **등원 알림톡 0건 더**'.padEnd(48) + (a3 - a1) + '건');
    const cell = await p.evaluate(() => JSON.stringify(
      (window.__srv.B['data/attendanceTime'] || {})[window.__today] || {}));
    say(/"t":"08:10"/.test(cell) && /"out":"17:05"/.test(cell),
      '★ 서버 칸 — 등원은 그대로 · `out` 만 더해졌다'.padEnd(48) + cell.slice(0, 40));
    const srvSms = await p.evaluate(() => Number(window.__srvSms || 0));
    say(srvSms === 1, '★ 하원 문자는 **서버가 한 번**(앱은 안 보낸다)'.padEnd(48) + srvSms + '건');
    say(p.__errs.length === 0, '오류 0'.padEnd(48) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓑ 출석 전용 기기 — **같은 네 글**(한 벌 `_padView`)');
  {
    const p = await openPage(b, { kiosk: true, leaveOn: true });
    const r = await p.evaluate(async () => {
      window.__today = todayStr();
      loginPick('kiosk');
      document.getElementById('ksk-orgcode').value = '123456';
      document.getElementById('ksk-code').value = '777777';
      await loginKiosk();
      await new Promise((x) => setTimeout(x, 300));
      const out = [];
      const hit = async (at) => {
        window.__clock = at;
        for (const ch of '1111') pinPress(ch);
        await new Promise((x) => setTimeout(x, 700));
        out.push((window.__padMsgs || []).slice(-1)[0] || '');
      };
      await hit('08:10'); await hit('08:20'); await hit('17:05'); await hit('17:30');
      return { msgs: out, alim: (window.__api || []).filter((x) => x.tpl_code || x.receiver || x.msg).length,
               calls: (window.__api || []).filter((x) => x.action === 'kioskCheckin').length };
    });
    say(r.calls === 4, '기기 창구를 네 번 불렀다'.padEnd(48) + r.calls + '번');
    say(/출석 완료/.test(r.msgs[0]), '① 등원 「출석 완료!」'.padEnd(48) + r.msgs[0].slice(0, 26));
    say(/이미 출석했어요/.test(r.msgs[1]) && /20분 뒤부터/.test(r.msgs[1]),
      '② 간격 안 — 판과 **같은 글**'.padEnd(48) + r.msgs[1].slice(0, 34));
    say(/하원 처리됐어요/.test(r.msgs[2]) && /17:05/.test(r.msgs[2]),
      '③ 하원 — 판과 **같은 글**'.padEnd(48) + r.msgs[2].slice(0, 30));
    say(/이미 하원했어요/.test(r.msgs[3]), '④ 이미 하원 — 판과 **같은 글**'.padEnd(48) + r.msgs[3].slice(0, 30));
    say(r.alim === 0, '★ 기기 앱은 알림톡·문자를 **아예 안 보낸다**'.padEnd(48) + r.alim + '건');
    say(p.__errs.length === 0, '오류 0'.padEnd(48) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒ 출결 한 줄 · 엑셀 칸에 하원 시각');
  {
    const p = await openAdmin(b, {});
    await press(p, '1111', '08:10');
    await press(p, '1111', '17:05');
    const r = await p.evaluate(() => {
      attViewDate = window.__today;
      renderAttendance();
      const box = document.getElementById('admin-content') || document.body;
      const txt = String(box.innerText || '').replace(/\s+/g, ' ');
      /* 엑셀 칸은 **만드는 함수**에서 그대로 떠 온다(파일을 쓰지 않는다) */
      const ti = attTimeInfo(loadAttendanceTime(), window.__today, 1);
      const cell = ti ? ('✅ ' + ti.t + (ti.out ? (' / 🏠 ' + ti.out) : '')) : '✅';
      return { txt: txt, cell: cell, out: (ti || {}).out || '' };
    });
    say(/🏠 17:05/.test(r.txt), '★ 출결 한 줄에 「🏠 17:05」'.padEnd(48)
      + (/🏠 17:05/.test(r.txt) ? '보인다' : r.txt.slice(0, 40)));
    say(/🕘 08:10/.test(r.txt), '  등원 시각도 그대로 보인다'.padEnd(48)
      + (/🕘 08:10/.test(r.txt) ? '보인다' : '없음'));
    say(r.cell === '✅ 08:10 / 🏠 17:05', '★ 엑셀 칸 「✅ 08:10 / 🏠 17:05」'.padEnd(48) + r.cell);
    say(r.out === '17:05', '  `attTimeInfo` 가 `out` 을 돌려준다'.padEnd(48) + r.out);
    /* (대조) 등원만 찍힌 사람은 하원 글이 **없다** */
    const r2 = await p.evaluate(() => {
      const ti = attTimeInfo(loadAttendanceTime(), window.__today, 2);
      return ti ? ('✅ ' + ti.t + (ti.out ? (' / 🏠 ' + ti.out) : '')) : '(없음)';
    });
    say(r2 === '(없음)', '  (대조) 안 찍은 사람은 칸이 빈다'.padEnd(48) + r2);
    say(p.__errs.length === 0, '오류 0'.padEnd(48) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓓ 설정 「하원 알림 보내기」 — 학원·공공만 · 기본 꺼짐 · 저장');
  {
    for (const bz of ['academy', 'public', 'logistics', 'delivery']) {
      const p = await openAdmin(b, { biz: bz });
      const r = await p.evaluate((z) => {
        switchAdminTab('settings');
        const el = document.getElementById('org-leavenotify');
        return { has: !!el, on: !!(el && el.checked), biz: z };
      }, bz);
      const want = (bz === 'academy' || bz === 'public');
      say(r.has === want, ('[' + bz + '] 칸이 ' + (want ? '있다' : '없다')).padEnd(48)
        + (r.has ? '있음' : '없음'));
      if (want) say(r.on === false, ('[' + bz + '] **기본 꺼짐**').padEnd(48) + (r.on ? '켜짐' : '꺼짐'));
      await p.close();
    }
    /* 켜고 저장하면 `org.leaveNotify` 가 참으로 남는다 */
    const p = await openAdmin(b, {});
    const saved = await p.evaluate(async () => {
      switchAdminTab('settings');
      const el = document.getElementById('org-leavenotify');
      el.checked = true;
      await saveOrgInfo();
      await new Promise((r) => setTimeout(r, 400));
      return { local: !!loadOrgSettings().leaveNotify,
               srv: !!(window.__srv.B['data/org'] || {}).leaveNotify };
    });
    say(saved.local === true, '★ 켜면 폰에 남는다'.padEnd(48) + saved.local);
    say(saved.srv === true, '★ 서버 `org.leaveNotify` 도 참'.padEnd(48) + saved.srv);
    /* 다시 끄면 거짓으로 돌아간다(로그아웃 짝이 아니라 **업체 설정 한 칸**이다) */
    const off = await p.evaluate(async () => {
      document.getElementById('org-leavenotify').checked = false;
      await saveOrgInfo();
      await new Promise((r) => setTimeout(r, 400));
      return !!(window.__srv.B['data/org'] || {}).leaveNotify;
    });
    say(off === false, '  끄면 거짓으로 돌아간다'.padEnd(48) + off);
    say(p.__errs.length === 0, '오류 0'.padEnd(48) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓔ 네 크기에서 판 글이 안 깨진다(가로 넘침 0)');
  {
    for (const sz of SIZES) {
      const p = await openAdmin(b, {}, sz);
      await press(p, '1111', '08:10');
      await press(p, '1111', '17:05');
      const r = await p.evaluate(() => {
        const el = document.getElementById('pin-result');
        const over = el ? (el.scrollWidth - el.clientWidth) : 0;
        return { over: over, txt: String(el ? el.innerText : '').replace(/\s+/g, ' ').trim(),
                 docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      say(r.over <= 1, (sz[0] + '×' + sz[1] + ' 판 안쪽 가로 넘침 0').padEnd(48) + r.over + 'px');
      say(r.docOver <= 1, (sz[0] + '×' + sz[1] + ' 화면 가로 넘침 0').padEnd(48) + r.docOver + 'px');
      say(/하원 처리됐어요/.test(r.txt), (sz[0] + '×' + sz[1] + ' 하원 글이 보인다').padEnd(48)
        + r.txt.slice(0, 24));
      say(p.__errs.length === 0, (sz[0] + '×' + sz[1] + ' 오류 0').padEnd(48) + (p.__errs[0] || 'OK'));
      await p.close();
    }
  }

  console.log('\nⓕ 기사 「하차 완료」 — 하원이 먼저 갔으면 알림톡이 안 나간다');
  {
    const p = await openAdmin(b, {});
    await press(p, '1111', '08:10');
    await press(p, '1111', '17:05');                      /* 하원이 먼저 */
    const r = await p.evaluate(async () => {
      const m = members.filter((x) => String(x.id) === '1')[0];
      window.__toasts = [];
      const old = window.showToast;
      window.showToast = function (t) { window.__toasts.push(String(t)); if (old) old(t); };
      await sendDropoffNotify(m);
      await new Promise((x) => setTimeout(x, 500));
      return { toasts: window.__toasts.slice(),
               sentBody: (window.__api || []).filter((x) => x.tpl_code).slice(-1)[0] || null };
    });
    say(/이미 .*알림이 갔어요/.test(r.toasts.join(' | ')),
      '★ 안내 「이미 하원 알림이 갔어요」'.padEnd(48) + (r.toasts.join(' | ') || '없음').slice(0, 34));
    say(!!(r.sentBody && r.sentBody.memberId === '1'),
      '★ 앱이 `memberId` 를 함께 보낸다'.padEnd(48) + String(r.sentBody && r.sentBody.memberId));
    /* (대조) 하원이 안 찍힌 «회원» 에게는 종전 그대로 나간다 */
    const r2 = await p.evaluate(async () => {
      const m = members.filter((x) => String(x.id) === '2')[0];
      window.__toasts = [];
      await sendDropoffNotify(m);
      await new Promise((x) => setTimeout(x, 500));
      return window.__toasts.slice();
    });
    say(!/이미 .*알림이 갔어요/.test(r2.join(' | ')),
      '  (대조) 하원 안 찍힌 사람에게는 종전 그대로'.padEnd(48) + (r2.join(' | ') || '(안내 없음)').slice(0, 30));
    say(p.__errs.length === 0, '오류 0'.padEnd(48) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓖ (대조) 연관 고침 — 서버가 `memberId` 를 안 주면 어떻게 됐나(v318 꼴)');
  {
    /* ★★ v296 에서 «회원» PIN 을 서버 해시로 옮긴 뒤 `members[].pin` 이 비었는데,
       앱은 **그 평문으로** 사람을 찾고 있었다 → `{id:''}` 로 떨어져
       ① 폰 출석·시각이 **`""` 가짜 칸**에 쌓이고 ② 번호가 없어 **등원 알림톡이 0건**이었다.
       여기서 그 상태를 **그대로 재현**한다(가짜 서버가 `memberId` 를 안 준다). */
    const p = await openAdmin(b, {});
    await p.evaluate(() => { window.__noMemberId = true; });
    await press(p, '1111', '08:10');
    const r = await p.evaluate(() => ({
      alim: (window.__api || []).filter((x) => x.tpl_code).length,
      raw: String(localStorage.getItem('tkd_attendance_time') || ''),
      ti: JSON.stringify(attTimeInfo(loadAttendanceTime(), window.__today, 1))
    }));
    say(r.alim === 0, '★ (옛 꼴) 등원 알림톡이 **0건**이었다'.padEnd(48) + r.alim + '건');
    say(r.ti === 'null', '  (옛 꼴) 폰에서 그 «회원» 을 못 찾았다'.padEnd(48) + r.ti);
    /* ★ 고친 뒤에는 가짜 «회원» 칸(`""`)을 **아예 만들지 않는다** */
    say(!/"":/.test(r.raw), '★ 그래도 **`""` 가짜 칸은 안 만든다**(v319 보강)'.padEnd(48)
      + (r.raw || '(빈 칸)').slice(0, 34));
    /* (대조) 같은 장면에서 `memberId` 를 주면 둘 다 살아난다 */
    const p2 = await openAdmin(b, {});
    await press(p2, '1111', '08:10');
    const r2 = await p2.evaluate(() => ({
      alim: (window.__api || []).filter((x) => x.tpl_code).length,
      ti: JSON.stringify(attTimeInfo(loadAttendanceTime(), window.__today, 1))
    }));
    say(r2.alim === 1, '★ (고친 뒤) 등원 알림톡 1건'.padEnd(48) + r2.alim + '건');
    say(/"t":"08:10"/.test(r2.ti), '★ (고친 뒤) 폰에 **그 «회원» id** 로 남는다'.padEnd(48) + r2.ti);
    say(p.__errs.length === 0 && p2.__errs.length === 0, '오류 0'.padEnd(48)
      + (p.__errs[0] || p2.__errs[0] || 'OK'));
    await p.close(); await p2.close();
  }

  await b.close();
  console.log('\n' + (bad ? 'X 문제 ' + bad + '건' : 'o 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 · 가짜 Firestore·가짜 서버 — 실제 쓰기 0 · 실제 문자·알림톡 0');
  process.exit(bad ? 1 : 0);
})();
