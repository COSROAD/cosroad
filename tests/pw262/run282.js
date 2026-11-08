/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v282(코스로드52 = 43-C) 실제 크롬 — 도우미 **출퇴근** · 기기 풀기 단추 · 지원사업 주소 인식.
   ★ 대조: 고치기 전(be5e959 = v281+51)에는 도우미 화면에 출근·퇴근 단추가 **없다**.
   ★ 가짜 Firestore 의 허용/거부는 에뮬레이터가 잰 표(t50_table.json)와 같은 뜻으로 흉내 낸다.
   바깥 요청 전부 차단 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');
const APP = '' + COS_ROOT + '/index.html';
const OLD_REF = process.env.COS_SRC_OLD_REF || 'be5e959';   /* v281 + 51 */
const OLD = path.join(__dirname, 'old_index282.html');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

const D7 = ['월','화','수','목','금','토','일'];
const M_CAR1 = [{ id:1, name:'가하은', carId:'car1', courseId:'c1', days:D7, location:'인천 1', lat:37.41, lon:126.68, phone:'010-1' },
                { id:2, name:'나지후', carId:'car1', courseId:'c1', days:D7, location:'인천 2', lat:37.42, lon:126.69, phone:'010-2' }];
const M_CAR2 = [{ id:3, name:'다가을', carId:'car2', courseId:'c1', days:D7, location:'인천 3', lat:37.43, lon:126.70, phone:'010-3' }];
const CARS = [{ id:'car1', name:'1호차', driver:'박기사', phone:'010-9-1' },
              { id:'car2', name:'2호차', driver:'김기사', phone:'010-9-2' }];
const COURSES = [{ id:'c1', name:'A반', depart:'15:00' }];
const STAFF = [{ id:'st2', name:'한도움', phone:'010-8', hasPin:true, hourlyWage:11000, mealAllow:0, taxMode:'free33', breakAuto:true },
               { id:'st3', name:'무핀씨', phone:'010-9', hourlyWage:10000, mealAllow:0, taxMode:'free33', breakAuto:true }];
const HUID = 'hlp_cosroad_default_st2';

function seed(biz, assigned, att) {
  return '(function(){\n'
    + '  var ORG = { name:"가온", icon:"🚐", bizType:"' + biz + '", destName:"학원",\n'
    + '              destLat:37.4467, destLon:126.6516, tel:"032-111-2222", address:"' + (att && att.addr ? att.addr : '인천광역시 남동구 구월동 1') + '" };\n'
    + '  var M1 = ' + JSON.stringify(M_CAR1) + ', M2 = ' + JSON.stringify(M_CAR2) + ';\n'
    + '  var SERVER = { members: M1.concat(M2), cars: ' + JSON.stringify(CARS) + ',\n'
    + '                 courses: ' + JSON.stringify(COURSES) + ', org: ORG, orgDriver: ORG,\n'
    + '                 staff: ' + JSON.stringify(STAFF) + ', migration:{carState:true,at:1},\n'
    + '                 staffAtt: ' + JSON.stringify((att && att.staffAtt) || {}) + ' };\n'
    + '  window.__server = SERVER;\n'
    + '  window.__srv = { car1:{ ride:{}, rideOff:{}, carlog:{records:[],plans:{}}, delivDone:{}, dropDone:{}, att:{} },\n'
    + '                   car2:{ ride:{}, rideOff:{}, carlog:{records:[],plans:{}}, delivDone:{}, dropDone:{}, att:{} } };\n'
    + '  window.__cardata = { car1:{ members:M1, car:SERVER.cars[0], courses:SERVER.courses },\n'
    + '                       car2:{ members:M2, car:SERVER.cars[1], courses:SERVER.courses } };\n'
    + '  window.__drv = { "' + HUID + '": { role:"helper", staffId:"st2", carId:"' + assigned + '", ownerUid:"u1"'
    + ((att && att.drvAtt) ? (', att:' + JSON.stringify(att.drvAtt)) : '') + ' } };\n'
    + '  window.__assigned = "' + assigned + '";\n'
    + '  window.__asAdmin = false;\n'
    + '  window.__subs = []; window.__writes = []; window.__denied = []; window.__alerts = [];\n'
    + '  window.__api = []; window.__toast = [];\n'
    + '  window._db = {}; window._fbReady = true;\n'
    + '  function allowed(col, key){\n'
    + '    if(window.__asAdmin) return true;\n'
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
    + '    return { exists:function(){return has;}, data:function(){ return { value: JSON.stringify(src[key]) }; } };\n'
    + '  }\n'
    + '  window.__fire = function(s){\n'
    + '    if(!s.alive) return;\n'
    + '    if(!allowed(s.col, s.key)){ if(s.errcb) s.errcb({ code:"permission-denied" }); return; }\n'
    + '    s.cb(snapFor(s.col, s.key));\n'
    + '  };\n'
    + '  window._firestore = {\n'
    + '    doc:function(db,c1,o,c2,k){ if(c1==="users") return { col:"users", key:o }; return { col:c2, key:k }; },\n'
    + '    collection:function(db,c1,o,c2){ return { col:c2, key:"" }; },\n'
    + '    getDoc:async function(ref){\n'
    + '      if(ref.col === "users"){ var u = window.__users && window.__users[ref.key];\n'
    + '        return { exists:function(){return !!u;}, data:function(){return u;} }; }\n'
    + '      if(!allowed(ref.col, ref.key)){ window.__denied.push(ref.col+"/"+ref.key);\n'
    + '        var e = new Error("denied"); e.code="permission-denied"; throw e; }\n'
    + '      return snapFor(ref.col, ref.key);\n'
    + '    },\n'
    + '    getDocs:async function(ref){\n'
    + '      var src = ref.col === "carState" ? window.__srv : {};\n'
    + '      var ks = Object.keys(src).filter(function(k){ return allowed(ref.col,k); });\n'
    + '      return { forEach:function(cb){ ks.forEach(function(k){\n'
    + '        cb({ id:k, data:function(){ return { value: JSON.stringify(src[k]) }; } }); }); } };\n'
    + '    },\n'
    + '    setDoc:async function(ref,d){\n'
    + '      if(!allowed(ref.col, ref.key)){ window.__denied.push("set "+ref.col+"/"+ref.key);\n'
    + '        var e = new Error("denied"); e.code="permission-denied"; throw e; }\n'
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
    + '          if(ref.col === "carState" && d && d.value) window.__srv[ref.key] = JSON.parse(d.value);\n'
    + '          if(ref.col === "data" && d && d.value) SERVER[ref.key] = JSON.parse(d.value); } });\n'
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

async function openApp(b, w, h, file, biz, assigned, att) {
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
  const js = seed(biz, assigned, att);
  if (js.indexOf('(function(){') !== 0) throw new Error('seed 틀이 끊겼다');
  await p.evaluate(js);
  if (!(await p.evaluate(() => !!(window._db && window.__srv && window.__drv))))
    throw new Error('가짜 Firestore 안 깔림');
  p.__errs = errs;
  return p;
}

/* 서버(api/driver-auth) 흉내 — 출퇴근을 받아 `__api` 에 적고 정해진 답을 준다.
   ★ 실제 서버가 하는 것과 **같은 꼴**: 직원 키(`st…_날짜`)에 찍고 staffId 를 돌려준다. */
const stubPunchApi = (p) => p.evaluate(() => {
  window._auth = { currentUser: { getIdToken: async () => 'TOK' } };
  window.driverGetLoc = async () => null;            /* 위치 묻기 생략(5초 기다림 방지) */
  window.showToast = (m) => { window.__toast.push(String(m)); };
  window.__punchState = {};
  window.fetch = async (url, opt) => {
    const body = JSON.parse((opt && opt.body) || '{}');
    window.__api.push(body);
    const sid = 'st2', d = todayStr();
    const k = sid + '_' + d;
    const st = window.__punchState;
    if (!st[k]) st[k] = {};
    let kind, time = '09:00';
    if (!st[k].in) { st[k].in = time; kind = 'in'; }
    else if (!st[k].out) { st[k].out = '18:00'; time = '18:00'; kind = 'out'; }
    else { kind = 'done'; time = st[k].out; }
    /* 서버는 같은 트랜잭션에서 배정 문서에도 적는다 — 그것까지 흉내 낸다 */
    window.__drv['hlp_cosroad_default_st2'].att = { date: d, in: st[k].in || '', out: st[k].out || '' };
    window.__server.staffAtt[k] = JSON.parse(JSON.stringify(st[k]));
    return { json: async () => ({ ok: true, kind: kind, time: time, date: d, staffId: sid }) };
  };
});

const enterHelper = (p, car) => p.evaluate(async (car) => {
  ['tkd_members__cosroad_default','tkd_cars__cosroad_default','tkd_courses__cosroad_default',
   'tkd_ridestate__cosroad_default','tkd_carlog__cosroad_default','tkd_driver_att__cosroad_default']
    .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
  window._userOrgId = null;
  window._isDriverAcct = true; window._isHelperAcct = true;
  window._driverStaffId = 'st2'; window._driverOrg = 'cosroad_default';
  window._driverCarId = car; window._userUid = 'hlp_cosroad_default_st2';
  window._userBizType = null;
  onDriverLoggedIn();
  await new Promise((x) => setTimeout(x, 2200));
}, car);

const enterDriver = (p, car) => p.evaluate(async (car) => {
  window._userOrgId = null;
  window._isDriverAcct = true; window._isHelperAcct = false;
  window._driverOrg = 'cosroad_default'; window._driverCarId = car;
  window._userUid = 'drv_cosroad_default_' + car; window._userBizType = null;
  onDriverLoggedIn();
  await new Promise((x) => setTimeout(x, 2200));
}, car);

const driveView = (p) => p.evaluate(() => {
  driveLeg = 'pickup'; switchTab('drive'); renderDrive();
  const c = document.getElementById('app-content');
  const txt = ((c ? c.textContent : '') || '').replace(/\s+/g, ' ');
  const btns = Array.from(document.querySelectorAll('#app-content button'));
  const find = (re) => btns.filter((b) => re.test(b.textContent || ''));
  const inB = find(/출근/), outB = find(/퇴근/);
  return {
    막힘: !!document.getElementById('driver-blocked'),
    배지: (document.getElementById('mode-badge') || {}).textContent || '',
    머리줄: (txt.match(/동승 도우미 · [^ ]+/) || [''])[0],
    출근단추: inB.length > 0, 출근꺼짐: inB.length ? inB[0].disabled : null,
    출근글: inB.length ? (inB[0].textContent || '').trim() : '',
    퇴근단추: outB.length > 0, 퇴근꺼짐: outB.length ? outB[0].disabled : null,
    퇴근글: outB.length ? (outB[0].textContent || '').trim() : '',
    차계부단추: find(/차계부/).length > 0,
    안내: /배정되지 않았어요|배정된 차량이 없어요/.test(txt),
    목록: (typeof getActiveStudents === 'function' ? getActiveStudents() : []).map((x) => x.name).join(','),
    가로스크롤: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  };
});

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('① ★ 대조 — 고치기 전(' + OLD_REF + ')에는 도우미에게 출퇴근 단추가 **없다**');
  {
    const p = await openApp(b, 390, 844, OLD, 'academy', 'car1');
    await enterHelper(p, 'car1');
    const r = await driveView(p);
    say(r.출근단추 === false && r.퇴근단추 === false,
      '[옛] 출근·퇴근 단추 0'.padEnd(46) + ('출근 ' + r.출근단추 + ' · 퇴근 ' + r.퇴근단추));
    say(/1호차/.test(r.머리줄), '[옛] 머리줄은 있다(43-B)'.padEnd(46) + r.머리줄);
    const f = await p.evaluate(() => [typeof helperSeedAtt, typeof driverAttSetLocal].join(','));
    say(f === 'undefined,undefined', '[옛] 43-C 함수가 없다'.padEnd(46) + f);
    await p.close();
  }

  console.log('\n② v282 — 도우미 출퇴근 (네 크기)');
  for (const [w, h] of SIZES) {
    const p = await openApp(b, w, h, APP, 'academy', 'car1');
    await enterHelper(p, 'car1');
    await stubPunchApi(p);
    const tag = '[' + w + 'x' + h + '] ';
    const r0 = await driveView(p);
    say(r0.출근단추 && r0.퇴근단추, (tag + '출근·퇴근 단추가 보인다 ★').padEnd(46) + 'OK');
    say(r0.출근꺼짐 === false && r0.퇴근꺼짐 === true,
      (tag + '출근만 눌릴 수 있다').padEnd(46) + ('출근 off=' + r0.출근꺼짐 + ' 퇴근 off=' + r0.퇴근꺼짐));
    say(/1호차/.test(r0.머리줄) && r0.배지 === '동승', (tag + '머리줄·배지 그대로').padEnd(46) + r0.머리줄);
    const r1 = await p.evaluate(async () => {
      await driverPunch('checkin');
      await new Promise((x) => setTimeout(x, 400));
      const k = 'st2_' + todayStr();
      return { 보낸것: JSON.stringify(window.__api[window.__api.length-1] || null),
               로컬: JSON.stringify(loadDriverAtt()[k] || null),
               토스트: window.__toast.join('|'),
               계기판칸: !!document.getElementById('drv-odo'),
               쓰기: window.__writes.join(',') };
    });
    say(/"action":"checkin"/.test(r1.보낸것), (tag + '서버로 checkin 을 보낸다').padEnd(46) + r1.보낸것.slice(0, 40));
    say(r1.로컬 === '{"in":"09:00"}', (tag + '직원 키(st2_날짜)에 적힌다 ★').padEnd(46) + r1.로컬);
    say(/출근 09:00/.test(r1.토스트), (tag + '출근 안내').padEnd(46) + r1.토스트.slice(0, 24));
    say(r1.계기판칸 === false, (tag + '계기판 km 칸은 안 뜬다 ★(차계부 보기만)').padEnd(46) + r1.계기판칸);
    say(!/carState|data\//.test(r1.쓰기), (tag + '폰이 서버에 직접 쓰지 않는다').padEnd(46) + (r1.쓰기 || 'OK'));
    const r2 = await driveView(p);
    say(r2.출근꺼짐 === true && /09:00/.test(r2.출근글) && r2.퇴근꺼짐 === false,
      (tag + '단추가 「출근 09:00 ✓ / 퇴근」으로 바뀐다').padEnd(46) + r2.출근글 + ' / ' + r2.퇴근글);
    say(p.__errs.length === 0, (tag + '오류 0').padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n③ 새로고침해도 출근 표시가 남는다 (배정 문서에 같이 적어 둔 덕)');
  {
    const today = new Date();
    const d = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    const p = await openApp(b, 390, 844, APP, 'academy', 'car1', { drvAtt: { date: d, in: '08:40', out: '' } });
    await enterHelper(p, 'car1');
    const r = await driveView(p);
    say(/08:40/.test(r.출근글) && r.출근꺼짐 === true,
      '들어오자마자 「출근 08:40 ✓」 ★'.padEnd(46) + r.출근글);
    say(r.퇴근꺼짐 === false, '퇴근을 누를 수 있다'.padEnd(46) + r.퇴근꺼짐);
    /* 대조 — 고치기 전 판은 그 칸을 안 읽어서 「출근」이 눌릴 상태로 남는다 */
    const q = await openApp(b, 390, 844, OLD, 'academy', 'car1', { drvAtt: { date: d, in: '08:40', out: '' } });
    await enterHelper(q, 'car1');
    const rq = await driveView(q);
    say(rq.출근단추 === false, '[옛 대조] 그때는 단추 자체가 없었다'.padEnd(46) + rq.출근단추);
    await q.close();
    /* 날짜가 다르면 안 쓴다 */
    const r2 = await p.evaluate(() => {
      window.__drv['hlp_cosroad_default_st2'].att = { date:'2020-01-01', in:'07:00' };
      helperSeedAtt(window.__drv['hlp_cosroad_default_st2'].att);
      return JSON.stringify(loadDriverAtt()['st2_2020-01-01'] || null);
    });
    say(r2 === 'null', '어제 것(날짜 다름)은 안 넣는다'.padEnd(46) + r2);
    await p.close();
  }

  console.log('\n④ 배정이 바뀌어도 **출퇴근 기록은 남는다**(근태는 차량과 무관)');
  {
    const today = new Date();
    const d = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    const p = await openApp(b, 390, 844, APP, 'academy', 'car1', { drvAtt: { date: d, in: '08:40', out: '' } });
    await enterHelper(p, 'car1');
    await stubPunchApi(p);
    const r = await p.evaluate(async () => {
      window.__drv['hlp_cosroad_default_st2'].carId = 'car2';
      window.__assigned = 'car2';
      window.__subs.filter((s) => s.alive && s.col === 'drivers').forEach((s) => window.__fire(s));
      await new Promise((x) => setTimeout(x, 900));
      driveLeg = 'pickup'; switchTab('drive'); renderDrive();
      const c = document.getElementById('app-content');
      const txt = ((c ? c.textContent : '') || '').replace(/\s+/g, ' ');
      return { 머리줄: (txt.match(/동승 도우미 · [^ ]+/) || [''])[0],
               목록: getActiveStudents().map((x) => x.name).join(','),
               근태: JSON.stringify(loadDriverAtt()['st2_' + todayStr()] || null) };
    });
    say(/2호차/.test(r.머리줄), '차량이 2호차로 바뀐다'.padEnd(46) + r.머리줄);
    say(r.목록 === '다가을', '목록도 바뀐다'.padEnd(46) + r.목록);
    say(r.근태 === '{"in":"08:40"}', '★ 출근 기록은 **그대로**'.padEnd(46) + r.근태);
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n⑤ 배정이 없어도 출퇴근 단추는 나온다 (근태는 차량과 무관)');
  {
    const p = await openApp(b, 390, 844, APP, 'academy', '');
    await enterHelper(p, '');
    await stubPunchApi(p);
    const r = await driveView(p);
    say(r.안내, '「배정되지 않았어요」 안내는 나온다'.padEnd(46) + r.안내);
    say(r.출근단추 && r.출근꺼짐 === false, '★ 출근 단추는 눌릴 수 있다'.padEnd(46) + r.출근단추);
    const r2 = await p.evaluate(async () => {
      await driverPunch('checkin');
      await new Promise((x) => setTimeout(x, 400));
      return JSON.stringify(loadDriverAtt()['st2_' + todayStr()] || null);
    });
    say(r2 === '{"in":"09:00"}', '출근이 찍힌다'.padEnd(46) + r2);
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n⑥ 관리자 — 직원 수정 창 「📱 기기 풀기」');
  {
    const p = await openApp(b, 390, 844, APP, 'academy', 'car1');
    const r = await p.evaluate(async () => {
      window.__asAdmin = true;
      ['tkd_members__cosroad_default','tkd_cars__cosroad_default','tkd_courses__cosroad_default','tkd_staff__cosroad_default']
        .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
      currentMode = 'admin';
      window._isDriverAcct = false; window._isHelperAcct = false;
      window._userOrgId = 'cosroad_default'; window._userUid = 'u1';
      window._userBizType = 'academy'; window._userPaidUntil = Date.now() + 30*86400000;
      const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
      const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
      window.driverAcctApi = async function (bd) { window.__api.push(bd); return { ok: true, dup: false, info: {} }; };
      _drvInfoLoaded = true;
      await syncFromFirebase();
      await new Promise((x) => setTimeout(x, 400));
      openStaffEdit('st2');
      await new Promise((x) => setTimeout(x, 150));
      const sheet = document.getElementById('staffEditSheet');
      const btns = sheet ? Array.from(sheet.querySelectorAll('button')) : [];
      const unb = btns.filter((x) => /기기 풀기/.test(x.textContent || ''));
      return { 창: !!sheet, 단추: unb.length, 글: unb.length ? (unb[0].textContent||'').trim() : '',
               안내: /폰을 바꿨으면/.test((sheet ? sheet.textContent : '') || '') };
    });
    say(r.창 && r.단추 === 1, '직원 수정 창에 단추 하나 ★'.padEnd(46) + r.단추 + '개 ' + r.글);
    say(r.안내, '무엇에 쓰는지 한 줄 안내'.padEnd(46) + r.안내);
    const r2 = await p.evaluate(async () => {
      window.__api = [];
      await unbindStaffDeviceAsk('st2');
      await new Promise((x) => setTimeout(x, 200));
      /* 확인 창을 거친다 — 공용 모달의 확인 단추를 누른다 */
      const ok = Array.from(document.querySelectorAll('button')).filter((x) => /^풀기$/.test((x.textContent||'').trim()));
      const had = ok.length;
      if (ok.length) ok[0].click();
      await new Promise((x) => setTimeout(x, 400));
      return { 확인창: had > 0, 부른것: JSON.stringify(window.__api.filter((a)=>a.action==='unbindDevice')) };
    });
    say(r2.확인창, '확인 창을 거친다 (절대규칙 3)'.padEnd(46) + r2.확인창);
    say(/"staffId":"st2"/.test(r2.부른것) && !/carId/.test(r2.부른것),
      'unbindDevice 를 staffId 로 부른다 ★'.padEnd(46) + r2.부른것.slice(0, 60));
    /* PIN 없는 직원에게는 단추가 없다 */
    const r3 = await p.evaluate(async () => {
      openStaffEdit('st3');
      await new Promise((x) => setTimeout(x, 150));
      const sheet = document.getElementById('staffEditSheet');
      return (sheet ? Array.from(sheet.querySelectorAll('button')) : [])
        .filter((x) => /기기 풀기/.test(x.textContent || '')).length;
    });
    say(r3 === 0, 'PIN 없는 직원에게는 안 보인다'.padEnd(46) + r3 + '개');
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n⑦ 관리자 근태 — 도우미 출근이 보이고, 저장해도 안 지워진다');
  {
    const today = new Date();
    const d = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    const p = await openApp(b, 390, 844, APP, 'academy', 'car1', { staffAtt: { ['st2_' + d]: { in:'09:00' } } });
    const r = await p.evaluate(async () => {
      window.__asAdmin = true;
      currentMode = 'admin';
      window._userOrgId = 'cosroad_default'; window._userUid = 'u1';
      window._userBizType = 'academy'; window._userPaidUntil = Date.now() + 30*86400000;
      document.getElementById('login-screen').classList.add('hide');
      document.getElementById('main-app').style.display = 'block';
      window.driverAcctApi = async function (bd) { return { ok: true, dup: false, info: {} }; };
      _drvInfoLoaded = true;
      await syncFromFirebase();
      await new Promise((x) => setTimeout(x, 400));
      const seen = JSON.stringify(loadDriverAtt()['st2_' + todayStr()] || null);
      /* 서버가 그 사이 퇴근을 찍었다 — 관리자 폰은 아직 못 받았다 */
      window.__server.staffAtt['st2_' + todayStr()] = { in:'09:00', out:'18:00' };
      await saveMembers(loadMembers());
      await new Promise((x) => setTimeout(x, 500));
      return { 보임: seen, 서버: JSON.stringify(window.__server.staffAtt['st2_' + todayStr()]),
               쓰기: window.__writes.filter((w)=>/staffAtt/.test(w)).join(',') };
    });
    say(r.보임 === '{"in":"09:00"}', '관리자 화면에 도우미 출근이 보인다'.padEnd(46) + r.보임);
    say(r.서버 === '{"in":"09:00","out":"18:00"}', '★ 관리자 저장이 서버 기록을 안 지운다'.padEnd(46) + r.서버);
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n⑧ 지원사업 — 주소에서 지역 찾기 (지시문 8번)');
  {
    const CASES = [['인천광역시 남동구 구월동 1', '인천', '남동구'],
                   ['경기 수원시 영통구 1', '경기', '수원시'],
                   ['수원시 영통구 월드컵로 1', '', ''],
                   ['서울 강남구 테헤란로 1', '서울', '강남구'],
                   ['경기도 광주시 역동 1', '경기', '광주시']];
    const p = await openApp(b, 390, 844, APP, 'academy', 'car1');
    const q = await openApp(b, 390, 844, OLD, 'academy', 'car1');
    for (const [addr, wantSido, wantSgg] of CASES) {
      const got = await p.evaluate((a) => {
        orgSettings = Object.assign({}, orgSettings, { address: a });
        const r = supportRegionAuto();
        return r.sido + '/' + r.sigungu + '/' + supportRegionLabel();
      }, addr);
      const old = await q.evaluate((a) => {
        orgSettings = Object.assign({}, orgSettings, { address: a });
        const r = supportRegionAuto();
        return r.sido + '/' + r.sigungu;
      }, addr);
      const parts = got.split('/');
      const ok = parts[0] === wantSido && parts[1] === wantSgg;
      say(ok, ('「' + addr + '」').padEnd(34) + '→ ' + parts[0] + '/' + parts[1]
        + '  [옛 ' + old + ']' + (ok ? '' : '  (기대 ' + wantSido + '/' + wantSgg + ')'));
      if (!wantSido) {
        say(/지역을 못 찾았어요 — ⚙ 에서 골라 주세요/.test(parts[2]),
          '   ★ 📍 줄에 안내가 뜬다'.padEnd(46) + parts[2]);
        const oldLabel = await q.evaluate(() => supportRegionLabel());
        say(!/⚙ 에서 골라/.test(oldLabel), '   [옛 대조] 그때는 안내가 없었다'.padEnd(46) + oldLabel);
      }
    }
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close(); await q.close();
  }

  console.log('\n⑨ 회귀 — 기사 출퇴근·화면은 그대로');
  for (const [w, h] of [[390, 844], [1366, 768]]) {
    const p = await openApp(b, w, h, APP, 'academy', 'car1');
    await enterDriver(p, 'car1');
    await p.evaluate(() => {
      window._auth = { currentUser: { getIdToken: async () => 'TOK' } };
      window.driverGetLoc = async () => null;
      window.showToast = (m) => { window.__toast.push(String(m)); };
      window.fetch = async (url, opt) => {
        window.__api.push(JSON.parse((opt && opt.body) || '{}'));
        return { json: async () => ({ ok:true, kind:'in', time:'07:30', date: todayStr() }) };
      };
    });
    const tag = '[' + w + 'x' + h + '] ';
    const r = await driveView(p);
    say(r.배지 === '기사' && r.머리줄 === '', (tag + '기사 화면 그대로').padEnd(46) + r.배지);
    say(r.출근단추 && r.퇴근단추, (tag + '출근·퇴근 단추').padEnd(46) + 'OK');
    const r2 = await p.evaluate(async () => {
      await driverPunch('checkin');
      await new Promise((x) => setTimeout(x, 400));
      return { 차량키: JSON.stringify(loadDriverAtt()['car1_' + todayStr()] || null),
               직원키: JSON.stringify(loadDriverAtt()['st2_' + todayStr()] || null),
               계기판: !!document.getElementById('drv-odo') };
    });
    say(r2.차량키 === '{"in":"07:30"}', (tag + '차량 키(car1_날짜)에 적힌다 ★').padEnd(46) + r2.차량키);
    say(r2.직원키 === 'null', (tag + '직원 키는 안 건드린다').padEnd(46) + r2.직원키);
    say(r2.계기판 === true, (tag + '기사에게는 계기판 칸이 뜬다(종전)').padEnd(46) + r2.계기판);
    say(p.__errs.length === 0, (tag + '오류 0').padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n⑩ 범위·버전');
  {
    /* ★ 양쪽을 커밋에 못 박는다(CLAUDE.md 검사 묶음 규칙) — 뒤쪽을 작업트리로 두면
       다음 회차 변경이 이 **52 회차 기록**에 거짓 실패로 들어온다
       (오늘 run280·y_api275 가 실제로 그렇게 깨졌다). */
    const NEW_REF = process.env.COS_SRC_NEW_REF || '6ffc8b6';   /* v282 */
    const names = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' ' + NEW_REF)
      .toString().trim().split('\n').filter(Boolean).sort();
    say(names.join(',') === 'CLAUDE.md,api/admin-account.js,api/driver-auth.js,index.html,version.json',
      '바뀐 파일   ' + names.join(','));
    const rl = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + OLD_REF + ' ' + NEW_REF
      + ' -- firestore.rules lib s.html home.html terms.html privacy.html api/support-info.js')
      .toString().trim();
    say(rl === '', '규칙·lib·정적·support-info diff 0   ' + (rl || '(변경 없음)'));
    const show2 = (q) => cp.execSync('git -C ' + COS_ROOT + ' show ' + NEW_REF + ':' + q,
      { maxBuffer: 1 << 26 }).toString();
    const vj = JSON.parse(show2('version.json'));
    const av = /const APP_VERSION = (\d+);/.exec(show2('index.html'))[1];
    say(vj.version === 282 && av === '282', '버전 282   ' + vj.version + ' · ' + av);
  }

  await b.close();
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 · Firestore·서버 api 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
