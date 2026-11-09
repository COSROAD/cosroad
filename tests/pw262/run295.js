/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v295(코스로드60-B3) 실제 크롬 390×844 — **판으로 출석 + 동시에 수기 토글 → 둘 다 남나**.
   ★★ 가장 위험한 자리다 — 60-B3 부터 **서버가** `data/attendance` 를 쓰는데 앱도 그 문서를
     쓴다. 통째로 쓰면 **서버가 찍은 칸이 지워진다**(v277·v282 와 같은 함정).
   ⓐ **망 지연을 흉내 낸다**(트랜잭션 250ms) — 안 그러면 가짜가 너무 빨라 겹치지 않는다(v284 교훈)
   ⓑ 판으로 «회원»1 출석(서버가 찍음) ↔ 그 사이 관리자가 «회원»2 를 수기로 → **둘 다 남는가**
   ⓒ 출결 판이 **서버 창구만** 부르는가(앱이 `data/attendance` 로 직접 쓰지 않는가)
   ⓓ 기사·직원 PIN 을 출결 판에서 누르면 **기록 0 + 안내**(v293 + 서버 `wrongPad`)
   ⓔ 리스너로 서버 값이 와도 **아직 안 올린 내 변경이 살아 있나**(얹기)
   바깥 요청 전부 차단 · Firestore·서버 api 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');

const APP = '' + COS_ROOT + '/index.html';
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1', pin: '1111' },
  { id: 2, name: '나다움', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2', lat: 37.42, lon: 126.69, phone: '010-2', pin: '2222' }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const STAFF = [{ id: 'st2', name: '최직원', hasPin: true, hourlyWage: 11000, taxMode: 'free33' }];

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
    + '              "carState/car1": { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},\n'
    + '                                 delivDone:{}, dropDone:{}, att:{} } };\n'
    + '  window.__srv = { B: BOX };\n'
    + '  window.__writes = []; window.__api = []; window.__alerts = []; window.__subs = [];\n'
    + '  window.__lag = ' + lag + ';\n'
    + '  window._db = {}; window._fbReady = true;\n'
    + '  function boxOf(org){ window.__srv[org] = window.__srv[org] || {}; return window.__srv[org]; }\n'
    + '  function pathOf(a){ return Array.prototype.slice.call(a,1); }\n'
    + '  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }\n'
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
    /* ★ 망 지연 — 읽고 쓰기 사이를 벌려 **겹치게** 만든다 */
    + '    runTransaction:async function(db, fn){\n'
    + '      var reads = [];\n'
    + '      var out = await fn({ get:async function(ref){ var b=boxOf(ref.org);\n'
    + '          var has=Object.prototype.hasOwnProperty.call(b, ref.key);\n'
    + '          var snap = { exists:function(){return has;}, data:function(){return {value:JSON.stringify(b[ref.key])};} };\n'
    + '          await sleep(window.__lag);\n'
    + '          return snap; },\n'
    + '        set:function(ref,d){ reads.push([ref, d]); } });\n'
    + '      await sleep(window.__lag);\n'
    + '      reads.forEach(function(x){ window.__writes.push("tx "+x[0].org+"/"+x[0].key);\n'
    + '        boxOf(x[0].org)[x[0].key] = JSON.parse(x[1].value); });\n'
    + '      return out;\n'
    + '    },\n'
    + '    onSnapshot:function(ref, cb){ var s={org:ref.org, key:ref.key, cb:cb, alive:true};\n'
    + '      window.__subs.push(s); return function(){ s.alive=false; }; }\n'
    + '  };\n'
    /* 가짜 서버 — 출결 판(`member:true`) 갈래 · 기사·직원이면 wrongPad */
    + '  window.fetch = function(url, init){\n'
    + '    var body = {}; try{ body = JSON.parse((init&&init.body)||"{}"); }catch(e){}\n'
    + '    window.__api.push(body);\n'
    + '    var out = { ok:false };\n'
    + '    if(body.action === "pinCheckin"){\n'
    + '      var MEMS = ' + JSON.stringify(MEM) + ';\n'
    + '      if(String(body.pin) === "9999"){\n'
    + '        out = (body.member === true) ? { ok:true, kind:"staff", wrongPad:true }\n'
    + '                                     : { ok:true, kind:"staff", staffId:"st2", punch:"in", time:"08:30" };\n'
    + '      } else {\n'
    + '        var m = MEMS.filter(function(x){ return String(x.pin)===String(body.pin); })[0];\n'
    + '        if(!m){ out = { ok:false, why:(body.member===true?"nomember":"notdriver"), message:"PIN 번호가 올바르지 않습니다." }; }\n'
    + '        else if(body.member === true){\n'
    + '          /* 서버가 **그 칸만** 찍는다(실제 punchMember 와 같은 모양) */\n'
    + '          var box = window.__srv.B;\n'
    + '          var D = window.__today;\n'
    + '          box["data/attendance"][D] = box["data/attendance"][D] || {};\n'
    + '          box["data/attendance"][D][String(m.id)] = "present";\n'
    + '          box["data/attendanceTime"][D] = box["data/attendanceTime"][D] || {};\n'
    + '          if(!box["data/attendanceTime"][D][String(m.id)]) box["data/attendanceTime"][D][String(m.id)] = "09:05";\n'
    + '          window.__writes.push("tx(서버) B/data/attendance");\n'
    + '          window.__subs.filter(function(s){ return s.alive && s.key === "data/attendance"; })\n'
    + '            .forEach(function(s){ s.cb({ exists:function(){return true;},\n'
    + '              data:function(){ return { value: JSON.stringify(box["data/attendance"]) }; } }); });\n'
    + '          out = { ok:true, kind:"member", name:m.name, photo:"", time:"09:05", date:D };\n'
    + '        } else { out = { ok:false, why:"notdriver" }; }\n'
    + '      }\n'
    + '    }\n'
    + '    return Promise.resolve({ ok:true, json:function(){ return Promise.resolve(out); } });\n'
    + '  };\n'
    + '  window._auth = { currentUser: { isAnonymous:false,\n'
    + '                                  getIdToken:function(){ return Promise.resolve("tok"); } } };\n'
    + '  window.alert=function(m){ window.__alerts.push(String(m)); };\n'
    + '  window.confirm=function(){return true;}; window.open=function(){return null;};\n'
    + '  window.__padMsgs = [];\n'
    + '  var _el = document.getElementById("pin-result");\n'
    + '  var _own = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");\n'
    + '  Object.defineProperty(_el, "innerHTML", {\n'
    + '    get:function(){ return _own.get.call(this); },\n'
    + '    set:function(v){ var t=String(v).replace(/<[^>]*>/g,"").trim();\n'
    + '                     if(t) window.__padMsgs.push(t); _own.set.call(this, v); } });\n'
    + '})();';
}

async function openAdmin(b, lag) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    if (/알림톡 실패|문자 전송 실패/.test(t)) return;        /* 가짜 서버가 {ok:false} 라 그렇다 */
    errs.push(t.slice(0, 130));
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + APP.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(seed(lag === undefined ? 250 : lag));
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
  /* ★★ `initApp()` 이 `startFirstSync()` 로 **또 한 번** 동기화를 시작한다(파이어베이스가 뜨면).
     그 동기화가 **장면 도중에 끝나면** 받은 값으로 로컬을 덮어 거짓 실패가 난다
     (처음에 ⓔ 가 그렇게 깨졌다 — 망 지연을 넣으면 더 늦게 끝난다).
     그래서 **깃발이 설 때까지 기다린다**(`_firstSyncOk`) — 시간으로 어림짐작하지 않는다. */
  await p.waitForFunction(() => window._firstSyncOk === true, {}, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => new Promise((r) => setTimeout(r, 400)));
  p.__errs = errs;
  return p;
}
const srvDay = (p) => p.evaluate(() => (window.__srv.B['data/attendance'] || {})[window.__today] || {});
const localDay = (p) => p.evaluate(() => (JSON.parse(localStorage.getItem('tkd_attendance') || '{}')[window.__today] || {}));

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐⓑ 판으로 출석(서버) **동시에** 수기 토글(앱) — 둘 다 남나 (망 지연 250ms)');
  {
    const p = await openAdmin(b, 250);
    const r = await p.evaluate(async () => {
      attViewDate = window.__today;
      /* 판으로 «회원»1 — 서버가 찍는다(그 응답이 오는 사이에) */
      openPinCheckin('member');
      pinInput = '1111';                    /* ★ PIN 을 넣어야 판이 돈다(처음에 빼먹었다) */
      const padDone = checkPin();
      /* 거의 같은 순간에 관리자가 «회원»2 를 수기로 켠다 */
      await new Promise((x) => setTimeout(x, 30));
      pinPadKind = 'member';
      setAttendance(2, 'present');
      await padDone;
      await new Promise((x) => setTimeout(x, 1600));
      return { 보낸것: (window.__api || []).filter((x) => x.action === 'pinCheckin').length,
               쓰기: (window.__writes || []).slice() };
    }).catch((e) => ({ err: String(e && e.message) }));
    const sv = await srvDay(p), lc = await localDay(p);
    say(!r.err, '겹쳐 돌렸다'.padEnd(46) + (r.err || 'OK'));
    say(sv['1'] === 'present', '★ 서버에 **판으로 찍은 «회원»1** 이 있다'.padEnd(46) + String(sv['1']));
    say(sv['2'] === 'present', '★ 서버에 **수기로 켠 «회원»2** 도 있다'.padEnd(46) + String(sv['2']));
    say(lc['1'] === 'present' && lc['2'] === 'present',
      '★ 폰에도 둘 다'.padEnd(46) + JSON.stringify(lc));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒ 출결 판은 **서버 창구만** 부른다');
  {
    const p = await openAdmin(b, 60);
    const r = await p.evaluate(async () => {
      const before = (window.__writes || []).length;
      openPinCheckin('member'); pinInput = '1111';
      await checkPin();
      await new Promise((x) => setTimeout(x, 900));
      const mine = (window.__writes || []).slice(before);
      return { 창구: (window.__api || []).filter((x) => x.action === 'pinCheckin' && x.member === true).length,
               앱쓰기: mine.filter((w) => /^(set|tx) B\/data\/attendance$/.test(w)).length,
               msgs: (window.__padMsgs || []).slice() };
    });
    say(r.창구 === 1, '★ `member:true` 로 **한 번** 묻는다'.padEnd(46) + r.창구 + '번');
    say(r.앱쓰기 === 0, '★ 앱이 `data/attendance` 로 **직접 안 쓴다**'.padEnd(46) + r.앱쓰기 + '건');
    say(r.msgs.some((m) => /출석 완료/.test(m)), '  화면에 「출석 완료!」'.padEnd(46) + (r.msgs.join('|').slice(0, 24) || '없음'));
    const sv = await srvDay(p);
    say(sv['1'] === 'present', '  서버가 그 칸을 찍었다'.padEnd(46) + String(sv['1']));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓓ 출결 판에서 기사·직원 PIN — 기록 0 + 안내 (서버 `wrongPad`)');
  {
    const p = await openAdmin(b, 60);
    const r = await p.evaluate(async () => {
      openPinCheckin('member'); pinInput = '9999';
      await checkPin();
      await new Promise((x) => setTimeout(x, 700));
      return { msgs: (window.__padMsgs || []).slice(),
               근태: localStorage.getItem('tkd_driver_att') || '{}',
               보낸것: (window.__api || []).filter((x) => x.action === 'pinCheckin').map((x) => (x.member ? 'member' : (x.probe ? 'probe' : 'punch'))) };
    });
    const sv = await srvDay(p);
    say(r.msgs.some((m) => /기사·직원/.test(m)), '★ 안내가 뜬다'.padEnd(46) + (r.msgs.join('|').slice(0, 26) || '없음'));
    say(Object.keys(sv).length === 0, '★ 출석 기록 0'.padEnd(46) + JSON.stringify(sv));
    say(r.근태 === '{}', '★ 근태도 기록 0'.padEnd(46) + r.근태);
    say(r.보낸것.join(',') === 'member', '  서버에 **한 번만** 물었다'.padEnd(46) + r.보낸것.join(','));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓔ 리스너로 서버 값이 와도 **안 올린 내 변경**이 살아 있나 (얹기)');
  {
    const p = await openAdmin(b, 60);
    const r = await p.evaluate(async () => {
      attViewDate = window.__today;
      /* 아직 안 올린 내 변경을 만든다(저장을 막아 둔 채 로컬만 바꾼다) */
      const L = JSON.parse(localStorage.getItem('tkd_attendance') || '{}');
      L[window.__today] = L[window.__today] || {};
      L[window.__today]['2'] = 'absent';
      localStorage.setItem('tkd_attendance', JSON.stringify(L));
      const _chk = JSON.stringify(loadAttendance());
      /* 서버에서 «회원»1 이 들어온다(다른 기기가 찍었다) */
      const box = window.__srv.B;
      box['data/attendance'][window.__today] = { '1': 'present' };
      window.__subs.filter((s) => s.alive && s.key === 'data/attendance').forEach((s) => s.cb({
        exists: () => true, data: () => ({ value: JSON.stringify(box['data/attendance']) })
      }));
      await new Promise((x) => setTimeout(x, 400));
      const after = JSON.parse(localStorage.getItem('tkd_attendance') || '{}');
      return Object.assign({}, after[window.__today] || {},
        { _raw: JSON.stringify(after).slice(0, 80), _chk: _chk });
    });
    say(r['1'] === 'present', '★ 서버 값이 들어왔다'.padEnd(46) + String(r['1']));
    say(r['2'] === 'absent', '★ 내 변경도 **살아 있다**(얹기)'.padEnd(46) + r._raw);
    /* ★★ 이 장면이 **내 순서 실수**를 잡았다 — 기준본을 먼저 바꾸고 얹으면
       「서버값 → 로컬」 차이를 내는 셈이 되어 **서버가 방금 찍은 칸이 지워졌다**(실측 `{}`).
       그래서 리스너는 **그 전 기준본**을 넘겨 얹는다(index.html 쪽지). */
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log(bad ? '\nX 문제 ' + bad + '건' : '\n✔ 전부 통과');
  console.log('※ 바깥 요청 전부 차단 · Firestore·서버 api 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})();
