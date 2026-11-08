/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v281(코스로드50 = 43-B) 실제 크롬 — 동승 도우미 **화면**.
   ★ 대조: 고치기 전(766347e = v280)에는 도우미 갈래가 없어 **기사 화면 그대로**가 나온다
     (출근·퇴근 단추가 보이고 차계부에 입력 칸이 있다 = 「안 됨」).
   ★ 가짜 Firestore 의 허용/거부는 **에뮬레이터가 실제 규칙으로 잰 표**(rulestest/t50_table.json)
     와 같은 뜻으로 흉내 낸다 — 배정 차량만 열리고 나머지는 permission-denied (v276 교훈).
   ★ onSnapshot 을 **진짜로** 흉내 낸다(붙자마자 한 번 + 뒤에 밀어 넣기 + 해지) —
     배정이 바뀔 때 옛 리스너가 **떨어지는지**를 그것으로 본다.
   바깥 요청 전부 차단 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');
/* ★ v282(코스로드52): 이 묶음은 **50 회차 기록**이다 — **앱도** 그 커밋(1aea23d)에 못 박는다.
   43-C 가 도우미 출퇴근 단추를 되살리면 ② 「출근·퇴근 단추 0」이 거짓 실패가 된다.
   (양쪽을 커밋에 고정 — CLAUDE.md 검사 묶음 규칙) */
const NEW_APP_REF = process.env.COS_SRC_NEW_REF || '1aea23d';
const APP = NEW_APP_REF
  ? (function(){ const f = path.join(__dirname, 'pin_index281.html');
      cp.execSync('git -C ' + COS_ROOT + ' show ' + NEW_APP_REF + ':index.html > "' + f + '"',
        { shell: 'bash' }); return f; })()
  : '' + COS_ROOT + '/index.html';
const OLD_REF = process.env.COS_SRC_OLD_REF || '766347e';   /* v280 */
const OLD = path.join(__dirname, 'old_index281.html');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];
const TBL = path.join(__dirname, '..', 'rulestest', 't50_table.json');

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
/* car1 «회원» 둘 · car2 «회원» 하나 — 배정이 바뀌면 목록이 바뀌는 것을 본다 */
const M_CAR1 = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
                  location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1' },
                { id: 2, name: '나지후', carId: 'car1', courseId: 'c1', days: D7,
                  location: '인천 2', lat: 37.42, lon: 126.69, phone: '010-2' }];
const M_CAR2 = [{ id: 3, name: '다가을', carId: 'car2', courseId: 'c1', days: D7,
                  location: '인천 3', lat: 37.43, lon: 126.70, phone: '010-3' }];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-9-1' },
              { id: 'car2', name: '2호차', driver: '김기사', phone: '010-9-2' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const STAFF = [{ id: 'st2', name: '한도움', phone: '010-8', hasPin: true,
                 hourlyWage: 11000, mealAllow: 0, taxMode: 'free33', breakAuto: true }];
const HUID = 'hlp_cosroad_default_st2';

/* ── 가짜 Firestore (도우미용) ─────────────────────────────────────────────
   ★ 백틱을 **안 쓴다** — 틀 안에 백틱이 들어가면 템플릿이 조용히 끊겨
     seed() 가 NaN 을 돌려주고 가짜가 안 깔린 채 「통과」가 난다(v275에서 겪음). */
function seed(biz, assigned) {
  return '(function(){\n'
    + '  var ORG = { name:"가온", icon:"🚐", bizType:"' + biz + '", destName:"학원",\n'
    + '              destLat:37.4467, destLon:126.6516, tel:"032-111-2222" };\n'
    + '  var M1 = ' + JSON.stringify(M_CAR1) + ', M2 = ' + JSON.stringify(M_CAR2) + ';\n'
    + '  var SERVER = { members: M1.concat(M2), cars: ' + JSON.stringify(CARS) + ',\n'
    + '                 courses: ' + JSON.stringify(COURSES) + ', org: ORG, orgDriver: ORG,\n'
    + '                 staff: ' + JSON.stringify(STAFF) + ', migration:{carState:true,at:1}, staffAtt:{} };\n'
    + '  window.__srv = { car1:{ ride:{}, rideOff:{}, carlog:{records:[{id:"r1",carId:"car1",type:"fuel",item:"주유",date:"2026-11-01",amount:50000,liters:30}],plans:{}},\n'
    + '                          delivDone:{}, dropDone:{}, att:{} },\n'
    + '                   car2:{ ride:{}, rideOff:{}, carlog:{records:[{id:"r2",carId:"car2",type:"etc",item:"세차",date:"2026-11-02",amount:10000}],plans:{}},\n'
    + '                          delivDone:{}, dropDone:{}, att:{} } };\n'
    + '  window.__cardata = { car1:{ members:M1, car:SERVER.cars[0], courses:SERVER.courses },\n'
    + '                       car2:{ members:M2, car:SERVER.cars[1], courses:SERVER.courses } };\n'
    + '  window.__drv = { "' + HUID + '": { role:"helper", staffId:"st2", carId:"' + assigned + '", ownerUid:"u1" } };\n'
    + '  window.__assigned = "' + assigned + '";\n'
    + '  window.__subs = []; window.__writes = []; window.__denied = []; window.__alerts = [];\n'
    + '  window.__api = [];\n'
    + '  window._db = {}; window._fbReady = true;\n'
    + '  window.__asAdmin = false;   /* 관리자 회귀에서만 켠다(규칙상 전부 열린다) */\n'
    + '  function allowed(col, key){\n'
    + '    if(window.__asAdmin) return true;\n'
    + '    if(col === "carData" || col === "carState") return key === window.__assigned;\n'
    + '    if(col === "drivers") return key === "' + HUID + '";\n'
    + '    if(col === "data") return key === "orgDriver";   /* 규칙 driverReadableKey 하나 */\n'
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
    + '    collection:function(db,c1,o,c2){ return { col:c2, key:"" }; },\n'
    + '    getDoc:async function(ref){\n'
    + '      if(!allowed(ref.col, ref.key)){ window.__denied.push(ref.col+"/"+ref.key);\n'
    + '        var e = new Error("Missing or insufficient permissions."); e.code="permission-denied"; throw e; }\n'
    + '      return snapFor(ref.col, ref.key);\n'
    + '    },\n'
    + '    getDocs:async function(ref){\n'
    + '      if(ref.col === "carState" && !allowed("carState","*")){ }\n'
    + '      var src = ref.col === "carState" ? window.__srv : {};\n'
    + '      var ks = Object.keys(src).filter(function(k){ return allowed(ref.col,k); });\n'
    + '      return { forEach:function(cb){ ks.forEach(function(k){\n'
    + '        cb({ id:k, data:function(){ return { value: JSON.stringify(src[k]) }; } }); }); } };\n'
    + '    },\n'
    + '    setDoc:async function(ref,d){\n'
    + '      if(!allowed(ref.col, ref.key)){ window.__denied.push("set "+ref.col+"/"+ref.key);\n'
    + '        var e = new Error("Missing or insufficient permissions."); e.code="permission-denied"; throw e; }\n'
    + '      window.__writes.push(ref.col+"/"+ref.key);\n'
    + '      if(ref.col === "data" && d && d.value !== undefined) SERVER[ref.key] = JSON.parse(d.value);\n'
    + '    },\n'
    + '    deleteDoc:async function(){},\n'
    + '    addDoc:async function(ref,d){ window.__writes.push("add "+ref.col); return {}; },\n'
    + '    runTransaction:async function(db, fn){\n'
    + '      return await fn({ get:async function(ref){\n'
    + '          if(!allowed(ref.col, ref.key)){ window.__denied.push("tx "+ref.col+"/"+ref.key);\n'
    + '            var e = new Error("denied"); e.code="permission-denied"; throw e; }\n'
    + '          return snapFor(ref.col, ref.key);\n'
    + '        }, set:function(ref,d){ window.__writes.push("tx "+ref.col+"/"+ref.key);\n'
    + '          if(ref.col === "carState" && d && d.value) window.__srv[ref.key] = JSON.parse(d.value); } });\n'
    + '    },\n'
    + '    onSnapshot:function(ref, cb, errcb){\n'
    + '      var s = { col:ref.col, key:ref.key||"", cb:cb, errcb:errcb, alive:true };\n'
    + '      window.__subs.push(s);\n'
    + '      setTimeout(function(){ window.__fire(s); }, 0);\n'
    + '      return function(){ s.alive = false; };\n'
    + '    }\n'
    + '  };\n'
    + '  window.alert = function(m){ window.__alerts.push(String(m)); };\n'
    + '  window.confirm = function(){ return true; };\n'
    + '  window.open = function(){ return null; };\n'
    + '})();';
}

async function openApp(b, w, h, file, biz, assigned) {
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
  await p.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  const js = seed(biz, assigned);
  if (js.indexOf('(function(){') !== 0) throw new Error('seed 틀이 끊겼다');
  await p.evaluate(js);
  if (!(await p.evaluate(() => !!(window._db && window.__srv && window.__drv && window.__subs))))
    throw new Error('가짜 Firestore 안 깔림');
  p.__errs = errs;
  return p;
}

/* 도우미로 들어간다 (로그인 응답이 준 값 그대로) */
const enterHelper = (p, car) => p.evaluate(async (car) => {
  ['tkd_members__cosroad_default','tkd_cars__cosroad_default','tkd_courses__cosroad_default',
   'tkd_ridestate__cosroad_default','tkd_carlog__cosroad_default','tkd_driver_att__cosroad_default']
    .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
  window._userOrgId = null;
  window._isDriverAcct = true;
  window._isHelperAcct = true;
  window._driverStaffId = 'st2';
  window._driverOrg = 'cosroad_default';
  window._driverCarId = car;
  window._userUid = 'hlp_cosroad_default_st2';
  window._userBizType = null;                 /* 도우미는 업종을 orgDriver 로 받는다 */
  onDriverLoggedIn();
  await new Promise((x) => setTimeout(x, 2200));   /* initApp 이 1초 뒤 동기화한다 */
}, car);

const enterDriver = (p, car) => p.evaluate(async (car) => {
  window._userOrgId = null;
  window._isDriverAcct = true; window._isHelperAcct = false;
  window._driverOrg = 'cosroad_default'; window._driverCarId = car;
  window._userUid = 'drv_cosroad_default_' + car; window._userBizType = null;
  onDriverLoggedIn();
  await new Promise((x) => setTimeout(x, 2200));
}, car);

/* 운행 화면에서 본 것 */
const driveView = (p) => p.evaluate(() => {
  driveLeg = 'pickup'; switchTab('drive'); renderDrive();
  const c = document.getElementById('app-content');
  const txt = ((c ? c.textContent : '') || '').replace(/\s+/g, ' ');
  const btn = (re) => Array.from(document.querySelectorAll('#app-content button'))
    .some((b) => re.test((b.textContent || '')));
  const badge = document.getElementById('mode-badge');
  const tabs = document.getElementById('drive-tabs');
  return {
    막힘: !!document.getElementById('driver-blocked'),
    배지: badge ? (badge.textContent || '').trim() : '',
    머리줄: /🧑‍🤝‍🧑 동승 도우미/.test(txt),
    머리줄글: (txt.match(/동승 도우미 · [^ ]+/) || [''])[0],
    출근단추: btn(/출근/), 퇴근단추: btn(/퇴근/), 차계부단추: btn(/차계부/),
    안내: /배정되지 않았어요|배정된 차량이 없어요/.test(txt),
    안내글: (txt.match(/[^.]*배정[^.]*요/) || [''])[0].trim().slice(0, 40),
    목록: (typeof getActiveStudents === 'function' ? getActiveStudents() : []).map((x) => x.name).join(','),
    차량탭: tabs ? (tabs.textContent || '').replace(/\s+/g, ' ').trim() : '',
    가로스크롤: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  };
});

/* 차계부 창에서 본 것 */
const carlogView = (p) => p.evaluate(async () => {
  openDriverCarlog();
  await new Promise((x) => setTimeout(x, 150));
  const m = document.getElementById('dcarlog-modal');
  const txt = m ? (m.textContent || '').replace(/\s+/g, ' ') : '';
  return {
    열렸나: !!m,
    입력칸: m ? m.querySelectorAll('input').length : -1,
    저장단추: m ? Array.from(m.querySelectorAll('button')).some((b) => /저장/.test(b.textContent || '')) : false,
    기록보임: /주유|세차/.test(txt),
    보기만안내: /보기만/.test(txt),
    글: txt.slice(0, 70)
  };
});

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('① ★ 대조 — 고치기 전(' + OLD_REF + ')에는 도우미 화면이 **없다**');
  {
    const p = await openApp(b, 390, 844, OLD, 'academy', 'car1');
    await enterHelper(p, 'car1');
    const r = await driveView(p);
    say(r.머리줄 === false, '[옛] 「동승 도우미」 머리줄이 없다'.padEnd(46) + r.머리줄);
    say(r.출근단추 === true, '[옛] **출근 단추가 보인다**(기사 화면 그대로)'.padEnd(46) + r.출근단추);
    say(r.배지 === '기사', '[옛] 배지가 「기사」'.padEnd(46) + r.배지);
    const c = await carlogView(p);
    say(c.저장단추 === true, '[옛] 차계부에 **저장 단추가 있다**'.padEnd(46) + c.저장단추);
    const f = await p.evaluate(() => typeof isHelperAcct);
    say(f === 'undefined', '[옛] isHelperAcct 함수가 없다'.padEnd(46) + f);
    await p.close();
  }

  console.log('\n② v281 도우미 첫 화면 (네 크기)');
  for (const [w, h] of SIZES) {
    const p = await openApp(b, w, h, APP, 'academy', 'car1');
    await enterHelper(p, 'car1');
    const r = await driveView(p);
    const tag = '[' + w + 'x' + h + '] ';
    say(r.막힘 === false, (tag + '막힘 화면 0 ★').padEnd(46) + 'OK');
    say(r.머리줄 && /1호차/.test(r.머리줄글), (tag + '「동승 도우미 · 1호차」 ★').padEnd(46) + r.머리줄글);
    say(r.배지 === '동승', (tag + '배지 「동승」').padEnd(46) + r.배지);
    say(!r.출근단추 && !r.퇴근단추, (tag + '출근·퇴근 단추 0 ★').padEnd(46)
      + (r.출근단추 ? '출근 보임' : '') + (r.퇴근단추 ? '퇴근 보임' : 'OK'));
    say(r.차계부단추, (tag + '차계부 단추는 있다').padEnd(46) + r.차계부단추);
    say(r.목록 === '가하은,나지후', (tag + '내 차량 «회원» 만').padEnd(46) + r.목록);
    say(/1호차/.test(r.차량탭) && !/2호차/.test(r.차량탭), (tag + '차량 칸 하나').padEnd(46) + r.차량탭.slice(0, 24));
    say(!r.가로스크롤, (tag + '가로 스크롤 없음').padEnd(46) + 'OK');
    say(p.__errs.length === 0, (tag + '오류 0').padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n③ 차계부는 **보기만**');
  {
    const p = await openApp(b, 390, 844, APP, 'academy', 'car1');
    await enterHelper(p, 'car1');
    const c = await carlogView(p);
    say(c.열렸나, '창이 열린다'.padEnd(46) + c.열렸나);
    say(c.입력칸 === 0, '입력 칸 0개 ★'.padEnd(46) + c.입력칸);
    say(c.저장단추 === false, '저장 단추 없음 ★'.padEnd(46) + c.저장단추);
    say(c.기록보임, '기록은 보인다'.padEnd(46) + c.기록보임);
    say(c.보기만안내, '「보기만」 안내'.padEnd(46) + c.보기만안내);
    const g = await p.evaluate(async () => {
      window.__alerts = []; window.__writes = [];
      saveDriverCarlogEntry();                 /* 함수로 직접 불러도 막히나 */
      await new Promise((x) => setTimeout(x, 200));
      return { 알림: window.__alerts.join('|'), 쓰기: window.__writes.join(',') };
    });
    say(/보기만/.test(g.알림) && g.쓰기 === '', '함수로 불러도 막힌다 ★'.padEnd(46) + g.알림.slice(0, 30));
    await p.close();
  }

  console.log('\n④ 운행은 기사와 같다 — 탑승 토글이 **내 차량 문서**에 쓰인다');
  {
    const p = await openApp(b, 390, 844, APP, 'academy', 'car1');
    await enterHelper(p, 'car1');
    await driveView(p);
    const r = await p.evaluate(async () => {
      window.__writes = []; window.__denied = [];
      toggleStudent(1);
      await new Promise((x) => setTimeout(x, 600));
      return { 쓰기: window.__writes.join(','), 거부: window.__denied.join(','),
               서버: JSON.stringify((window.__srv.car1 || {}).ride || {}),
               car2: JSON.stringify((window.__srv.car2 || {}).ride || {}) };
    });
    say(/carState\/car1/.test(r.쓰기), 'carState/car1 에 쓴다 ★'.padEnd(46) + r.쓰기.slice(0, 40));
    say(!/car2/.test(r.쓰기) && r.거부 === '', '남의 차량은 건드리지 않는다'.padEnd(46)
      + (r.거부 || 'OK'));
    say(/"1"/.test(r.서버), '서버 car1 에 «회원» 1 몫이 남았다'.padEnd(46) + r.서버.slice(0, 30));
    say(r.car2 === '{}', 'car2 문서는 그대로'.padEnd(46) + r.car2);
    await p.close();
  }

  console.log('\n⑤ 배정이 **2호차로 바뀌면** 그 자리에서 따라간다');
  {
    const p = await openApp(b, 390, 844, APP, 'academy', 'car1');
    await enterHelper(p, 'car1');
    const before = await p.evaluate(() => ({
      붙은것: window.__subs.filter((s) => s.alive).map((s) => s.col + '/' + s.key).join(','),
    }));
    say(/carData\/car1/.test(before.붙은것) && /carState\/car1/.test(before.붙은것)
        && /drivers\//.test(before.붙은것),
      '리스너 셋(사본·기록·배정)이 붙었다'.padEnd(46) + before.붙은것.replace(/data\/[a-z]+,?/gi, ''));
    const r = await p.evaluate(async () => {
      /* 관리자가 배정을 바꾼 것처럼 — 배정 문서를 고치고 그 리스너를 깨운다 */
      window.__drv['hlp_cosroad_default_st2'].carId = 'car2';
      window.__assigned = 'car2';
      window.__subs.filter((s) => s.alive && s.col === 'drivers').forEach((s) => window.__fire(s));
      await new Promise((x) => setTimeout(x, 800));
      driveLeg = 'pickup'; switchTab('drive'); renderDrive();
      const c = document.getElementById('app-content');
      const txt = ((c ? c.textContent : '') || '').replace(/\s+/g, ' ');
      return {
        머리줄: (txt.match(/동승 도우미 · [^ ]+/) || [''])[0],
        목록: getActiveStudents().map((x) => x.name).join(','),
        차량: String(window._driverCarId || ''),
        붙은것: window.__subs.filter((s) => s.alive).map((s) => s.col + '/' + s.key).join(','),
        떨어진것: window.__subs.filter((s) => !s.alive).map((s) => s.col + '/' + s.key).join(','),
        거부: window.__denied.join(',')
      };
    });
    say(/2호차/.test(r.머리줄), '머리줄이 2호차로 바뀐다 ★'.padEnd(46) + r.머리줄);
    say(r.목록 === '다가을', '목록이 2호차 «회원» 로 바뀐다 ★'.padEnd(46) + r.목록);
    say(r.차량 === 'car2', '_driverCarId 가 car2'.padEnd(46) + r.차량);
    say(/carData\/car2/.test(r.붙은것) && /carState\/car2/.test(r.붙은것),
      '새 차량 리스너가 붙었다'.padEnd(46) + r.붙은것.replace(/data\/[a-z]+,?/gi, ''));
    say(!/carData\/car1/.test(r.붙은것) && !/carState\/car1/.test(r.붙은것),
      '옛 차량 리스너가 **떨어졌다** ★'.padEnd(46) + (r.떨어진것 || '(없음)'));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n⑥ 배정을 **떼면** 안내가 나온다 (막힘 화면이 아니다)');
  {
    const p = await openApp(b, 390, 844, APP, 'academy', 'car1');
    await enterHelper(p, 'car1');
    const r = await p.evaluate(async () => {
      window.__drv['hlp_cosroad_default_st2'].carId = '';
      window.__assigned = '';
      window.__subs.filter((s) => s.alive && s.col === 'drivers').forEach((s) => window.__fire(s));
      await new Promise((x) => setTimeout(x, 800));
      switchTab('drive'); renderDrive();
      const c = document.getElementById('app-content');
      const txt = ((c ? c.textContent : '') || '').replace(/\s+/g, ' ');
      switchTab('member'); renderMembers();
      const ms = document.getElementById('member-list');
      return { 막힘: !!document.getElementById('driver-blocked'),
               운행안내: /동승할 차량이 배정되지 않았어요/.test(txt),
               회원안내: /동승할 차량이 배정되지 않았어요/.test(((ms ? ms.textContent : '') || '')),
               기사문구: /배정된 차량이 없어요/.test(txt),
               붙은것: window.__subs.filter((s) => s.alive).map((s) => s.col + '/' + s.key).join(',') };
    });
    say(r.막힘 === false, '막힘 화면이 아니다 ★'.padEnd(46) + r.막힘);
    say(r.운행안내, '운행 화면에 「동승할 차량이 배정되지 않았어요」 ★'.padEnd(46) + r.운행안내);
    say(r.회원안내, '«회원» 탭도 같은 문구'.padEnd(46) + r.회원안내);
    say(!r.기사문구, '기사 문구(배정된 차량이 없어요)는 안 쓴다'.padEnd(46) + !r.기사문구);
    say(!/carData\//.test(r.붙은것) && !/carState\//.test(r.붙은것),
      '차량 리스너가 다 떨어졌다'.padEnd(46) + r.붙은것.replace(/data\/[a-z]+,?/gi, '') || '(없음)');
    await p.close();
  }

  console.log('\n⑦ 「로그인 유지」로 들어올 때 — users 문서로 도우미를 알아본다');
  {
    const p = await openApp(b, 390, 844, APP, 'academy', 'car1');
    const r = await p.evaluate(async () => {
      /* users/{uid} 를 읽는 자리 — 가짜에 넣어 둔다 */
      window._firestore.getDoc = (function (orig) {
        return async function (ref) {
          if (ref.col === undefined && ref.users) { }
          return orig(ref);
        };
      })(window._firestore.getDoc);
      /* loadUserProfile 은 doc(db,'users',uid) 를 쓴다 — col 자리가 'users' 가 아니라
         세 번째 인자이므로 가짜 doc() 모양에 맞춰 따로 꽂아 준다 */
      const realDoc = window._firestore.doc;
      window._firestore.doc = function (db, a, b2, c, d) {
        if (a === 'users') return { col: 'users', key: b2 };
        return realDoc(db, a, b2, c, d);
      };
      const realGet = window._firestore.getDoc;
      window._firestore.getDoc = async function (ref) {
        if (ref.col === 'users') {
          const u = { role: 'helper', driverOrg: 'cosroad_default',
                      ownerUid: 'u1', staffId: 'st2' };
          return { exists: () => true, data: () => u };
        }
        return realGet(ref);
      };
      window._driverCarId = null; window._isHelperAcct = false; window._isDriverAcct = false;
      await loadUserProfile('hlp_cosroad_default_st2');
      return { 도우미: window._isHelperAcct === true, 기사표시: window._isDriverAcct === true,
               차량: String(window._driverCarId || '(없음)'),
               업체: String(window._driverOrg || ''), 직원: String(window._driverStaffId || '') };
    });
    say(r.기사표시 && r.도우미, 'role:helper 를 도우미로 알아본다 ★'.padEnd(46)
      + '_isDriverAcct=' + r.기사표시 + ' _isHelperAcct=' + r.도우미);
    say(r.차량 === 'car1', '배정 문서에서 차량을 읽어 둔다 ★'.padEnd(46) + r.차량);
    say(r.업체 === 'cosroad_default' && r.직원 === 'st2', '업체·직원 id'.padEnd(46) + r.업체 + '/' + r.직원);
    await p.close();
  }

  console.log('\n⑧ 회귀 — 기사 화면은 하나도 안 바뀌었다');
  for (const [w, h] of [[390, 844], [1366, 768]]) {
    const p = await openApp(b, w, h, APP, 'academy', 'car1');
    await enterDriver(p, 'car1');
    const r = await driveView(p);
    const c = await carlogView(p);
    const tag = '[' + w + 'x' + h + '] ';
    say(r.막힘 === false, (tag + '막힘 화면 0').padEnd(46) + 'OK');
    say(r.배지 === '기사', (tag + '배지 「기사」').padEnd(46) + r.배지);
    say(r.머리줄 === false, (tag + '도우미 머리줄 없음').padEnd(46) + r.머리줄);
    say(r.출근단추 && r.퇴근단추, (tag + '출근·퇴근 단추 그대로').padEnd(46) + 'OK');
    say(r.목록 === '가하은,나지후', (tag + '운행 목록').padEnd(46) + r.목록);
    say(c.저장단추 === true && c.입력칸 > 0, (tag + '차계부 입력 그대로').padEnd(46)
      + '칸 ' + c.입력칸);
    say(p.__errs.length === 0, (tag + '오류 0').padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n⑨ 회귀 — 관리자 화면(동승 도우미 칸 · 명단)');
  {
    const p = await openApp(b, 390, 844, APP, 'academy', 'car1');
    const r = await p.evaluate(async () => {
      window.__asAdmin = true;                     /* 관리자는 규칙상 전부 열린다 */
      ['tkd_members__cosroad_default','tkd_cars__cosroad_default','tkd_courses__cosroad_default']
        .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
      currentMode = 'admin';
      window._isDriverAcct = false; window._isHelperAcct = false;
      window._userOrgId = 'cosroad_default'; window._userUid = 'u1';
      window._userBizType = 'academy'; window._userPaidUntil = Date.now() + 30 * 86400000;
      const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
      const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
      window.driverAcctApi = async function (body) { window.__api.push(body); return { ok: true, dup: false, info: {} }; };
      _drvInfoLoaded = true;
      await syncFromFirebase();
      await new Promise((x) => setTimeout(x, 400));
      switchTab('admin'); currentAdminTab = 'cars'; renderAdminTab('cars');
      const c = document.getElementById('admin-content');
      const sel = c ? c.querySelector('select[onchange*="setCarHelperAsk"]') : null;
      return { 도우미칸: !!sel,
               명단: loadMembers().map((m) => m.name).join(','),
               차량수: loadCars().length,
               배지: (document.getElementById('mode-badge') || {}).textContent || '' };
    });
    say(r.도우미칸, '동승 도우미 칸 그대로(v280)'.padEnd(46) + r.도우미칸);
    say(r.명단 === '가하은,나지후,다가을', '명단이 안 깎인다 ★'.padEnd(46) + r.명단);
    say(r.차량수 === 2, '차량 둘 그대로'.padEnd(46) + r.차량수);
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n⑩ 규칙 표(에뮬레이터 실측)와 화면이 **같은 뜻**인가');
  {
    const tbl = JSON.parse(fs.readFileSync(TBL, 'utf8'));
    const want = {
      'helper.myDriverDoc': 'allow', 'helper.carData.mine': 'allow', 'helper.carData.other': 'deny',
      'helper.carState.write': 'allow', 'helper.carState.otherWrite': 'deny',
      'helper.orgDriver': 'allow', 'helper.data.members': 'deny',
      'nocar.carData': 'deny', 'nocar.myDriverDoc': 'allow', 'expired.carData': 'deny'
    };
    Object.keys(want).forEach((k) => {
      say(tbl[k] === want[k], ('표 ' + k).padEnd(46) + tbl[k] + ' (기대 ' + want[k] + ')');
    });
  }

  console.log('\n⑫ 로그아웃 뒤 — 남은 배정 리스너가 **다음 사람 화면을 비우지 않는다** (두 겹)');
  {
    const p = await openApp(b, 390, 844, APP, 'academy', 'car1');
    await enterHelper(p, 'car1');
    const a = await p.evaluate(() => ({ 살아있음: window.__subs.filter((s) => s.alive).length }));
    say(a.살아있음 >= 3, '도우미일 때 리스너 살아 있다'.padEnd(46) + a.살아있음 + '개');
    const r = await p.evaluate(async () => {
      logout();
      await new Promise((x) => setTimeout(x, 200));
      const alive = window.__subs.filter((s) => s.alive).map((s) => s.col + '/' + s.key);
      return { 남은것: alive.join(','),
               차량관련: alive.filter((x) => /^(carData|carState|drivers)\//.test(x)).join(',') };
    });
    /* ★ `data/*` 키 리스너는 **전부터** 로그아웃에서 안 떼어진다(이번 범위 밖) —
       해롭지 않다: 그 핸들러들이 `currentMode` 를 보고 역할이 다르면 아무것도 안 한다
       (v272 에서 `org`·`orgDriver` 를 역할별로 갈라 둔 그 자리). 이번에 뗀 것은 **차량 셋**이다. */
    say(r.차량관련 === '', '첫째 겹 — logout 이 차량·배정 리스너를 **다 뗀다** ★'.padEnd(46)
      + (r.차량관련 || 'OK') + '  (남은 것: ' + (r.남은것 || '없음') + ')');
    /* 관리자로 다시 들어온 뒤, 떼어진 리스너가 **살아 있었다면** 어떻게 되나 */
    const g = await p.evaluate(async () => {
      window.__asAdmin = true;
      ['tkd_members__cosroad_default','tkd_cars__cosroad_default','tkd_courses__cosroad_default']
        .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
      currentMode = 'admin';
      window._isDriverAcct = false; window._isHelperAcct = false; window._driverCarId = null;
      window._userOrgId = 'cosroad_default'; window._userUid = 'u1';
      window._userBizType = 'academy'; window._userPaidUntil = Date.now() + 30 * 86400000;
      const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
      const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
      window.driverAcctApi = async function (bd) { return { ok: true, dup: false, info: {} }; };
      _drvInfoLoaded = true;
      await syncFromFirebase();
      await new Promise((x) => setTimeout(x, 400));
      const before = loadMembers().map((m) => m.name).join(',');
      /* 떼어 둔 배정 리스너를 **억지로 살려** 깨운다 (두 겹 중 둘째 겹을 재는 자리) */
      const sub = window.__subs.filter((s) => s.col === 'drivers')[0];
      window.__drv['hlp_cosroad_default_st2'].carId = 'car2';
      if (sub) { sub.alive = true; window.__fire(sub); }
      await new Promise((x) => setTimeout(x, 500));
      const after = loadMembers().map((m) => m.name).join(',');
      return { before: before, after: after, 차량: String(window._driverCarId || '(없음)') };
    });
    say(g.before === '가하은,나지후,다가을', '관리자 명단 셋'.padEnd(46) + g.before);
    say(g.after === g.before, '둘째 겹 — 깨워도 명단이 **그대로** ★'.padEnd(46) + g.after);
    /* 대조 — 가드가 없다면 무슨 일이 났는지 (같은 함수를 직접 부른다) */
    const c = await p.evaluate(async () => {
      helperSwitchCar('cosroad_default', 'car2');
      await new Promise((x) => setTimeout(x, 500));
      return { 명단: loadMembers().map((m) => m.name).join(',') || '(빈 목록)' };
    });
    /* 가드가 막아 주지 않았다면 관리자 명단 **셋이 한 몫으로 깎인다**
       (v272 에서 orgDriver 가 orgSettings 를 7칸으로 깎던 것과 같은 꼴) */
    say(c.명단 !== '가하은,나지후,다가을' && c.명단.split(',').length < 3,
      '[대조] 가드가 없으면 명단이 깎인다(셋 → 하나)'.padEnd(46) + c.명단);
    await p.close();
  }

  console.log('\n⑪ 범위·버전');
  {
    /* ★ 양쪽을 커밋에 못 박는다 (CLAUDE.md 검사 묶음 규칙) — 뒤쪽을 작업트리로 두면
       다음 회차 변경이 이 50 회차 기록에 **거짓 실패**로 들어온다(run280 에서 실제로 3건 났다). */
    const NEW_REF = process.env.COS_SRC_NEW_REF || '1aea23d';   /* v281 */
    const names = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' ' + NEW_REF)
      .toString().trim().split('\n').filter(Boolean).sort();
    say(names.join(',') === 'CLAUDE.md,api/driver-auth.js,api/send-alimtalk.js,api/send-sms.js,index.html,lib/send-guard.js,version.json',
      '바뀐 파일   ' + names.join(','));
    const rl = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + OLD_REF + ' ' + NEW_REF
      + ' -- firestore.rules s.html home.html terms.html privacy.html lib/period.js lib/price.js lib/otp-core.js')
      .toString().trim();
    say(rl === '', '규칙·정적·다른 lib diff 0   ' + (rl || '(변경 없음)'));
    const show = (p) => cp.execSync('git -C ' + COS_ROOT + ' show ' + NEW_REF + ':' + p,
      { maxBuffer: 1 << 26 }).toString();
    const vj = JSON.parse(show('version.json'));
    const av = /const APP_VERSION = (\d+);/.exec(show('index.html'))[1];
    say(vj.version === 281 && av === '281', '버전 281   ' + vj.version + ' · ' + av);
  }

  await b.close();
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
