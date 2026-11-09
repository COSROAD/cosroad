/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v294(코스로드60-B2) 실제 크롬 390×844 — **PIN 있는 직원이 자기 폰으로 로그인 → 첫 화면 → 출근**.
   ⓐ 배정이 **없어도** 로그인된다 · 첫 화면이 **막힘 화면이 아니다** · permission-denied 0
      («회원»·차량 자료는 규칙이 거부하는 그대로 — 가짜 Firestore 가 **에뮬레이터 표**를 따른다)
   ⓑ 화면에 **출근·퇴근 단추**가 있고 안내가 「출근·퇴근만 쓸 수 있어요」다(v294 문구)
   ⓒ 「출근」을 누르면 서버 `checkin` 을 **한 번** 부르고 화면에 시각이 나온다
   ⓓ 56 — **배정 문서의 사본**(`.att`)으로 새로고침 뒤에도 출근 상태가 남는다
   ⓔ 배정이 **있는** 도우미는 종전 그대로(차량 명단·차계부 보기)
   ★ 규칙은 **한 줄도 안 바꿨다** — 거부 표는 `rulestest/t50.mjs` 가 실제 규칙으로 잰 것
     (`nocar.carData`·`nocar.carState`·`nocar.orgDriver`·`nocar.myDriverDoc`).
   바깥 요청 전부 차단 · Firestore·서버 api 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const APP = '' + COS_ROOT + '/index.html';
const TBL = path.join(__dirname, '..', 'rulestest', 't50_table.json');
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const M_CAR1 = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
                  location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1' }];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-9-1' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const STAFF = [{ id: 'st2', name: '한도움', phone: '010-8', hasPin: true,
                 hourlyWage: 11000, mealAllow: 0, taxMode: 'free33', breakAuto: true }];
const HUID = 'hlp_cosroad_default_st2';

/* 가짜 Firestore + 가짜 서버 — 백틱을 **쓰지 않는다**(틀이 조용히 끊긴다 · v275 교훈) */
function seed(assigned) {
  return '(function(){\n'
    + '  var ORG = { name:"가온", icon:"🚐", bizType:"academy", destName:"학원",\n'
    + '              destLat:37.4467, destLon:126.6516, tel:"032-111-2222" };\n'
    + '  var SERVER = { members: ' + JSON.stringify(M_CAR1) + ', cars: ' + JSON.stringify(CARS) + ',\n'
    + '                 courses: ' + JSON.stringify(COURSES) + ', org: ORG, orgDriver: ORG,\n'
    + '                 staff: ' + JSON.stringify(STAFF) + ', migration:{carState:true,at:1}, staffAtt:{} };\n'
    + '  window.__srv = { car1:{ ride:{}, rideOff:{}, carlog:{records:[],plans:{}},\n'
    + '                          delivDone:{}, dropDone:{}, att:{} } };\n'
    + '  window.__cardata = { car1:{ members:' + JSON.stringify(M_CAR1) + ', car:SERVER.cars[0], courses:SERVER.courses } };\n'
    + '  window.__drv = { "' + HUID + '": { role:"helper", staffId:"st2", carId:"' + assigned + '", ownerUid:"u1" } };\n'
    + '  window.__assigned = "' + assigned + '";\n'
    + '  window.__subs = []; window.__writes = []; window.__denied = []; window.__alerts = [];\n'
    + '  window.__api = [];\n'
    + '  window._db = {}; window._fbReady = true;\n'
    /* 규칙(에뮬레이터 실측)과 같은 뜻 — 배정이 없으면 carData·carState 는 거부, orgDriver·내 배정 문서는 허용 */
    + '  function allowed(col, key){\n'
    + '    if(col === "carData" || col === "carState") return key === window.__assigned;\n'
    + '    if(col === "drivers") return key === "' + HUID + '";\n'
    + '    if(col === "data") return key === "orgDriver";\n'
    + '    return true;\n'
    + '  }\n'
    + '  function snapFor(col, key){\n'
    + '    if(col === "drivers"){\n'
    + '      var d = window.__drv[key];\n'
    + '      return { exists:function(){return d!==undefined;}, data:function(){return d;} };\n'
    + '    }\n'
    + '    var src = col === "carState" ? window.__srv : col === "carData" ? window.__cardata : SERVER;\n'
    + '    var has = Object.prototype.hasOwnProperty.call(src, key);\n'
    + '    return { exists:function(){return has;},\n'
    + '             data:function(){ return { value: JSON.stringify(src[key]) }; } };\n'
    + '  }\n'
    + '  window.__fire = function(s){\n'
    + '    if(!s.alive) return;\n'
    + '    if(!allowed(s.col, s.key)){ if(s.errcb) s.errcb({ code:"permission-denied" }); return; }\n'
    + '    s.cb(snapFor(s.col, s.key));\n'
    + '  };\n'
    + '  window._firestore = {\n'
    + '    doc:function(db,c1,o,c2,k){ return { col:c2, key:k }; },\n'
    + '    collection:function(db,c1,o,c2){ return { col:c2, key:null }; },\n'
    + '    getDoc:async function(ref){\n'
    + '      if(!allowed(ref.col, ref.key)){ window.__denied.push(ref.col+"/"+ref.key);\n'
    + '        var e = new Error("Missing or insufficient permissions."); e.code="permission-denied"; throw e; }\n'
    + '      return snapFor(ref.col, ref.key);\n'
    + '    },\n'
    + '    getDocs:async function(ref){\n'
    + '      window.__denied.push(ref.col+"/*");\n'
    + '      var e = new Error("Missing or insufficient permissions."); e.code="permission-denied"; throw e;\n'
    + '    },\n'
    + '    setDoc:async function(ref,d){\n'
    + '      if(!allowed(ref.col, ref.key)){ window.__denied.push("W "+ref.col+"/"+ref.key);\n'
    + '        var e = new Error("Missing or insufficient permissions."); e.code="permission-denied"; throw e; }\n'
    + '      window.__writes.push("set "+ref.col+"/"+ref.key);\n'
    + '    },\n'
    + '    deleteDoc:async function(){},\n'
    + '    runTransaction:async function(db, fn){\n'
    + '      return await fn({ get:async function(ref){\n'
    + '          if(!allowed(ref.col, ref.key)){ window.__denied.push("T "+ref.col+"/"+ref.key);\n'
    + '            var e = new Error("Missing or insufficient permissions."); e.code="permission-denied"; throw e; }\n'
    + '          return snapFor(ref.col, ref.key); },\n'
    + '        set:function(ref,d){ window.__writes.push("tx "+ref.col+"/"+ref.key); } });\n'
    + '    },\n'
    + '    onSnapshot:function(ref, cb, errcb){\n'
    + '      var s = { col:ref.col, key:ref.key, cb:cb, errcb:errcb, alive:true };\n'
    + '      window.__subs.push(s);\n'
    + '      setTimeout(function(){ window.__fire(s); }, 10);\n'
    + '      return function(){ s.alive = false; };\n'
    + '    }\n'
    + '  };\n'
    /* 가짜 서버 — 직원 폰의 출퇴근(checkin) · 판(pinCheckin) 둘 다 받는다 */
    + '  window.__punch = { in:"", out:"" };\n'
    + '  window.fetch = function(url, init){\n'
    + '    var body = {}; try{ body = JSON.parse((init&&init.body)||"{}"); }catch(e){}\n'
    + '    window.__api.push(body);\n'
    + '    var out = { ok:false };\n'
    + '    if(body.action === "checkin" || body.action === "checkout"){\n'
    + '      var kind = body.action === "checkin" ? "in" : "out";\n'
    + '      window.__punch[kind] = kind === "in" ? "08:30" : "18:10";\n'
    + '      /* 서버는 배정 문서의 **사본**도 같이 적는다(43-C) — 리스너로 흘려 준다 */\n'
    + '      window.__drv["' + HUID + '"].att = { date:(new Date()).getFullYear()+"-"+String((new Date()).getMonth()+1).padStart(2,"0")+"-"+String((new Date()).getDate()).padStart(2,"0"),\n'
    + '                                           in:window.__punch.in, out:window.__punch.out };\n'
    + '      window.__subs.filter(function(s){ return s.alive && s.col === "drivers"; }).forEach(function(s){ window.__fire(s); });\n'
    + '      out = { ok:true, kind:kind, time:window.__punch[kind], staffId:"st2",\n'
    + '              date:window.__drv["' + HUID + '"].att.date };\n'
    + '    } else if(body.action === "pinCheckin"){\n'
    + '      out = { ok:false, why:"notdriver" };\n'
    + '    }\n'
    + '    return Promise.resolve({ ok:true, json:function(){ return Promise.resolve(out); } });\n'
    + '  };\n'
    /* 출퇴근(driverPunch)은 **로그인된 계정의 토큰**을 먼저 본다 — 가짜를 세워 둔다
       (없으면 「로그인이 풀렸어요」만 뜨고 서버를 안 부른다 · 처음에 그렇게 0번이 나왔다) */
    + '  window._auth = { currentUser: { isAnonymous:false, uid:"' + HUID + '",\n'
    + '                                  getIdToken:function(){ return Promise.resolve("tok"); } } };\n'
    + '  window.alert=function(m){ window.__alerts.push(String(m)); };\n'
    + '  window.confirm=function(){return true;}; window.open=function(){return null;};\n'
    + '})();';
}

async function openApp(b, assigned) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
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
  await p.evaluate(seed(assigned));
  p.__errs = errs;
  return p;
}

/* 직원 폰 로그인 — 서버가 주는 custom token 응답과 **같은 모양**으로 전역을 세운다
   (배정이 없으면 `carId` 가 빈 값으로 온다 — v294) */
const enterStaff = (p, assigned) => p.evaluate(async (a) => {
  window._isDriverAcct = true; window._isHelperAcct = true;
  window._driverStaffId = 'st2'; window._driverOrg = 'cosroad_default';
  window._driverCarId = a.assigned || null;
  window._userOrgId = null; window._userBizType = null;
  currentMode = 'driver';
  const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
  const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
  initApp();
  await new Promise((r) => setTimeout(r, 1200));
  return true;
}, { assigned });

const screenText = (p) => p.evaluate(() => {
  const c = document.getElementById('app-content');
  return ((c ? c.textContent : '') || '').replace(/\s+/g, ' ');
});

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  /* 규칙 표(에뮬레이터 실측)와 가짜 Firestore 가 같은 뜻인지 먼저 맞댄다 */
  if (fs.existsSync(TBL)) {
    const t = JSON.parse(fs.readFileSync(TBL, 'utf8'));
    console.log('규칙 표(t50_table.json) — 배정 없음일 때 실제 규칙 판정');
    say(t['nocar.carData'] === 'deny', '  carData 거부'.padEnd(44) + t['nocar.carData']);
    say(t['nocar.carState'] === 'deny', '  carState 쓰기 거부'.padEnd(44) + t['nocar.carState']);
    say(t['nocar.orgDriver'] === 'allow', '  data/orgDriver 허용'.padEnd(44) + t['nocar.orgDriver']);
    say(t['nocar.myDriverDoc'] === 'allow', '  내 배정 문서 허용'.padEnd(44) + t['nocar.myDriverDoc']);
  } else {
    console.log('규칙 표가 없다 — rulestest/t50.mjs 를 먼저 돌리면 더 단단해진다(건너뜀)');
  }

  console.log('\nⓐⓑ 배정 **없는** 직원 폰 — 로그인 → 첫 화면');
  {
    const p = await openApp(b, '');
    await enterStaff(p, '');
    const txt = await screenText(p);
    const r = await p.evaluate(() => ({
      막힘: !!document.getElementById('driver-blocked'),
      출근단추: [...document.querySelectorAll('button')].some((x) => /출근/.test(x.textContent || '')),
      퇴근단추: [...document.querySelectorAll('button')].some((x) => /퇴근/.test(x.textContent || '')),
      차계부단추: [...document.querySelectorAll('button')].some((x) => /차계부/.test(x.textContent || '')),
      denied: (window.__denied || []).slice(),
      배지: (document.getElementById('mode-badge') || {}).textContent || ''
    }));
    say(r.막힘 === false, '★ 막힘 화면이 **아니다**'.padEnd(44) + String(r.막힘));
    say(/출근·퇴근만/.test(txt), '★ 안내가 「출근·퇴근만 쓸 수 있어요」 (v294)'.padEnd(44) + /출근·퇴근만/.test(txt));
    say(r.출근단추 && r.퇴근단추, '★ 출근·퇴근 단추가 있다'.padEnd(44) + r.출근단추 + '/' + r.퇴근단추);
    say(r.배지 === '동승', '배지는 「동승」'.padEnd(44) + r.배지);
    say(r.denied.filter((x) => /^W |^T /.test(x)).length === 0,
      '★ 규칙이 거부하는 **쓰기를 시도하지 않는다**'.padEnd(44) + (r.denied.join(',') || '없음'));
    say(p.__errs.length === 0, '오류 0'.padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒⓓ 「출근」을 누르면 — 서버 한 번 · 화면에 시각 · 사본으로 상태 유지(56)');
  {
    const p = await openApp(b, '');
    await enterStaff(p, '');
    const r = await p.evaluate(async () => {
      const btn = [...document.querySelectorAll('button')].find((x) => /출근/.test(x.textContent || ''));
      btn.click();
      await new Promise((x) => setTimeout(x, 900));
      const api = (window.__api || []).filter((x) => x.action === 'checkin');
      const c = document.getElementById('app-content');
      return { 호출: api.length, 화면: ((c ? c.textContent : '') || '').replace(/\s+/g, ' '),
               사본: JSON.stringify((window.__drv['hlp_cosroad_default_st2'] || {}).att || null),
               폰근태: localStorage.getItem('tkd_driver_att') || '{}' };
    });
    say(r.호출 === 1, '★ 서버 `checkin` 을 **한 번**'.padEnd(44) + r.호출 + '번');
    say(/08:30/.test(r.화면), '★ 화면에 출근 시각이 나온다'.padEnd(44) + (/08:30/.test(r.화면) ? '08:30' : r.화면.slice(0, 30)));
    say(/"in":"08:30"/.test(r.사본), '★ 배정 문서 **사본**에도 적혔다(56)'.padEnd(44) + r.사본.slice(0, 40));
    say(/st2_/.test(r.폰근태), '★ 폰에는 **직원 키**로 적힌다'.padEnd(44) + r.폰근태.slice(0, 36));
    /* 새로고침 흉내 — 폰을 비우고 리스너 값만으로 상태가 돌아오나 */
    const r2 = await p.evaluate(async () => {
      localStorage.removeItem('tkd_driver_att');
      driverAttSetLocal({});
      window.__subs.filter((s) => s.alive && s.col === 'drivers').forEach((s) => window.__fire(s));
      await new Promise((x) => setTimeout(x, 600));
      switchTab('drive'); renderDrive();
      const c = document.getElementById('app-content');
      return { 화면: ((c ? c.textContent : '') || '').replace(/\s+/g, ' '),
               폰근태: localStorage.getItem('tkd_driver_att') || '{}' };
    });
    say(/st2_/.test(r2.폰근태), '★ 사본으로 **출근 표시가 돌아온다**'.padEnd(44) + r2.폰근태.slice(0, 36));
    say(/08:30/.test(r2.화면), '  화면에도 그대로'.padEnd(44) + (/08:30/.test(r2.화면) ? '08:30' : '없음'));
    say(p.__errs.length === 0, '오류 0'.padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓔ 배정이 **있는** 도우미 — 종전 그대로');
  {
    const p = await openApp(b, 'car1');
    await enterStaff(p, 'car1');
    const txt = await screenText(p);
    const r = await p.evaluate(() => ({
      출근단추: [...document.querySelectorAll('button')].some((x) => /출근/.test(x.textContent || '')),
      차계부: [...document.querySelectorAll('button')].some((x) => /차계부/.test(x.textContent || '')),
      denied: (window.__denied || []).slice()
    }));
    say(/1호차|가하은/.test(txt), '★ 자기 차량 화면이 나온다'.padEnd(44) + (txt.slice(0, 30) || '(빈 화면)'));
    say(r.출근단추, '출근 단추도 있다'.padEnd(44) + r.출근단추);
    say(!/출근·퇴근만/.test(txt), '배정 없음 안내는 안 나온다'.padEnd(44) + !/출근·퇴근만/.test(txt));
    say(r.denied.filter((x) => /car(Data|State)\/car1/.test(x)).length === 0,
      '자기 차량 자료는 거부되지 않는다'.padEnd(44) + (r.denied.join(',') || '없음'));
    say(p.__errs.length === 0, '오류 0'.padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log(bad ? '\nX 문제 ' + bad + '건' : '\n✔ 전부 통과');
  console.log('※ 바깥 요청 전부 차단 · Firestore·서버 api 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})();
