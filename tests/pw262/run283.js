/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v283(코스로드54) 실제 크롬 — 차이표를 **기다리기 전에 한꺼번에** 만든 뒤에도
   ① 관리자 탑승 토글 ② 관리자 수기 근태 ③ 기사 탑승 토글이 **그대로 되는지**.
   ④ 그리고 54 의 핵심을 브라우저에서도 본다 — 1호차를 쓰는 **사이에** 서버 punch 가
      2호차 출근을 찍고 리스너가 와도, 그 출근이 **지워지지 않는지**(옛 판은 지워진다).
   화면은 390×844 한 크기(지시문) · 바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const cp = require('child_process');
const path = require('path');

const APP = '' + COS_ROOT + '/index.html';                  /* 새 쪽 = 작업트리 */
const OLD_REF = process.env.COS_SRC_OLD_REF || 'f279101';   /* v282 — 고치기 전 */
const OLD = path.join(__dirname, 'old_index283.html');
const TODAY = (() => { const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0')
       + '-' + String(n.getDate()).padStart(2, '0'); })();

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1' },
  { id: 2, name: '나여름', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2', lat: 37.43, lon: 126.70, phone: '010-2' },
  { id: 3, name: '다가을', carId: 'car2', courseId: 'c1', days: D7, location: '인천 3', lat: 37.45, lon: 126.73, phone: '010-3' }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-9-1' },
              { id: 'car2', name: '2호차', driver: '김기사', phone: '010-9-2' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];

/* race=true 면 1호차 트랜잭션이 도는 **사이에** 2호차 출근이 찍히고 리스너가 온다 */
function seed(opt) {
  return `(function(){
    var ORG = { name:'가온', icon:'🚐', bizType:'academy', destName:'학원',
                destLat:37.4467, destLon:126.6516, tel:'032-111-2222' };
    var SERVER = { members: ${JSON.stringify(MEMBERS)}, cars: ${JSON.stringify(CARS)},
                   courses: ${JSON.stringify(COURSES)}, org: ORG, orgDriver: ORG,
                   migration: { carState:true, at:1 }, staffAtt: {} };
    window.__SERVER = SERVER;
    window.__srv = {
      car1: { ride:{'1':{on:true},'2':{on:true}}, rideOff:{}, carlog:{records:[],plans:{}},
              delivDone:{}, dropDone:{}, att:{} },
      car2: { ride:{'3':{on:true}}, rideOff:{}, carlog:{records:[],plans:{}},
              delivDone:{}, dropDone:{}, att:{} } };
    window.__writes=[]; window.__alerts=[]; window.__listeners=[]; window.__raceFired=false;
    window.__race = ${opt.race ? 'true' : 'false'};
    window._db={}; window._fbReady=true;
    var fire=function(col,key){
      (window.__listeners||[]).filter(function(l){return l.col===col;}).forEach(function(l){
        if(key!==undefined && l.key!==undefined && l.key!==key) return;
        try{
          if(l.key!==undefined){
            var v=(col==='carState'?window.__srv:SERVER)[l.key];
            l.cb({ exists:function(){return v!==undefined;},
                   data:function(){return {value:JSON.stringify(v)};} });
          } else {
            var src=(col==='carState'?window.__srv:SERVER);
            l.cb({ forEach:function(f){ Object.keys(src).forEach(function(k){
              f({ id:k, data:function(){ return {value:JSON.stringify(src[k])}; } }); }); } });
          }
        }catch(e){}
      });
    };
    window.__fire=fire;
    window._firestore={
      doc:function(db,c1,o,c2,k){ return {col:c2,key:k}; },
      collection:function(db,c1,o,c2){ return {col:c2}; },
      getDoc:async function(ref){
        var src = ref.col==='carState' ? window.__srv
                : ref.col==='carData' ? { car1:{ members:SERVER.members.filter(function(m){return m.carId==='car1';}),
                                                 car:SERVER.cars[0], courses:SERVER.courses } }
                : SERVER;
        var has = Object.prototype.hasOwnProperty.call(src, ref.key);
        return { exists:function(){return has;}, data:function(){return {value:JSON.stringify(src[ref.key])};} };
      },
      getDocs:async function(ref){
        var src = ref.col==='carState' ? window.__srv : {};
        var ks=Object.keys(src);
        return { forEach:function(cb){ ks.forEach(function(k){
          cb({ id:k, data:function(){ return {value:JSON.stringify(src[k])}; } }); }); } };
      },
      setDoc:async function(ref,d){
        window.__writes.push('set '+ref.col+'/'+ref.key);
        if(ref.col==='data'){ SERVER[ref.key]= d.value!==undefined ? JSON.parse(d.value) : d; }
      },
      deleteDoc:async function(){},
      runTransaction:async function(db, fn){
        return await fn({
          get:async function(ref){
            /* ★ 기다리는 사이 — 1호차를 쓰는 동안 서버 punch 가 2호차 출근을 찍는다 */
            if(window.__race && !window.__raceFired && ref.col==='carState' && ref.key==='car1'){
              window.__raceFired=true;
              window.__srv.car2.att = { '${TODAY}': { in:'08:00' } };
              fire('carState');
            }
            var src = ref.col==='carState' ? window.__srv : SERVER;
            var v=src[ref.key];
            return { exists:function(){return v!==undefined;},
                     data:function(){return {value:JSON.stringify(v)};} };
          },
          set:function(ref,d){
            window.__writes.push('tx '+ref.col+'/'+ref.key);
            var src = ref.col==='carState' ? window.__srv : SERVER;
            src[ref.key]=JSON.parse(d.value);
            fire(ref.col, ref.key);
          } });
      },
      onSnapshot:function(ref,cb){ window.__listeners.push({col:ref.col,key:ref.key,cb:cb});
                                   return function(){}; }
    };
    window.alert=function(m){ window.__alerts.push(String(m)); };
    window.confirm=function(){return true;}; window.open=function(){return null;};
  })();`;
}

async function page(b, file, mode, opt) {
  opt = opt || {};
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
  await p.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  const js = seed(opt);
  if (js.indexOf('(function(){') !== 0) throw new Error('seed 틀이 끊겼다');
  await p.evaluate(js);
  if (!(await p.evaluate(() => !!(window._db && window.__srv)))) throw new Error('가짜 Firestore 안 깔림');
  await p.evaluate(async (mode) => {
    ['tkd_members__cosroad_default', 'tkd_cars__cosroad_default', 'tkd_courses__cosroad_default',
     'tkd_ridestate__cosroad_default', 'tkd_carlog__cosroad_default', 'tkd_driver_att__cosroad_default']
      .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
    currentMode = mode;
    window._userOrgId = 'cosroad_default';
    window._userBizType = 'academy';
    if (mode === 'driver') { window._isDriverAcct = true; window._driverCarId = 'car1'; }
    else { window._userUid = 'u1'; window._userPaidUntil = Date.now() + 30 * 86400000; }
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    await syncFromFirebase();
    await new Promise((r) => setTimeout(r, 400));
    currentCourseId = 'c1';
    currentDay = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
    window.__alerts = []; window.__writes = [];
  }, mode);
  p.__errs = errs;
  return p;
}

const act = (p, what, today) => p.evaluate(async (a) => {
  window.__writes = []; window.__alerts = [];
  if (a.what === 'toggle') { const st = loadRideState(); st['1'] = { on: false }; saveRideState(st); }
  if (a.what === 'att')    { const d = loadDriverAtt(); d['car1_' + a.today] = { in: '08:00' }; saveDriverAtt(d); }
  await new Promise((r) => setTimeout(r, 1200));
  try { driveLeg = 'pickup'; switchTab('drive'); renderDrive(); } catch (e) {}
  const el = document.getElementById('app-content');
  return {
    쓴것: (window.__writes || []).filter((w) => /carState/.test(w)),
    안내수: (window.__alerts || []).length,
    폰토글: JSON.stringify((loadRideState() || {})['1'] || null),
    서버토글: JSON.stringify((window.__srv.car1.ride || {})['1'] || null),
    서버근태: JSON.stringify((window.__srv.car1.att || {})[a.today] || null),
    둘째차출근: JSON.stringify((window.__srv.car2 ? (window.__srv.car2.att || {}) : {})[a.today] || null),
    끼어들었나: !!window.__raceFired,
    화면길이: el ? (el.textContent || '').length : 0
  };
}, { what, today });

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('① 관리자 — 탑승 토글이 그대로 된다 (390x844)');
  {
    const p = await page(b, APP, 'admin', {});
    const r = await act(p, 'toggle', TODAY);
    say(r.폰토글 === '{"on":false}', '폰 값이 바뀐다'.padEnd(38) + r.폰토글);
    say(r.서버토글 === '{"on":false}', '서버에 들어간다 ★'.padEnd(38) + r.서버토글);
    say(r.쓴것.length >= 1, '차량 문서를 썼다'.padEnd(38) + JSON.stringify(r.쓴것));
    say(r.안내수 === 0, '안내 창 0'.padEnd(38) + r.안내수 + '번');
    say(r.화면길이 > 20, '화면이 비지 않는다'.padEnd(38) + r.화면길이 + '자');
    say(p.__errs.length === 0, '오류 0'.padEnd(38) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n② 관리자 — 수기 근태가 그대로 된다');
  {
    const p = await page(b, APP, 'admin', {});
    const r = await act(p, 'att', TODAY);
    say(r.서버근태 === '{"in":"08:00"}', '서버 차량 문서 att 에 들어간다 ★'.padEnd(38) + r.서버근태);
    say(r.안내수 === 0, '안내 창 0'.padEnd(38) + r.안내수 + '번');
    say(p.__errs.length === 0, '오류 0'.padEnd(38) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n③ 기사 — 탑승 토글이 그대로 된다');
  {
    const p = await page(b, APP, 'driver', {});
    const r = await act(p, 'toggle', TODAY);
    say(r.폰토글 === '{"on":false}', '폰 값이 바뀐다'.padEnd(38) + r.폰토글);
    say(r.서버토글 === '{"on":false}', '서버에 들어간다 ★'.padEnd(38) + r.서버토글);
    say(r.화면길이 > 20, '화면이 비지 않는다'.padEnd(38) + r.화면길이 + '자');
    say(p.__errs.length === 0, '오류 0'.padEnd(38) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n④ ★ 대조 — 1호차를 쓰는 사이에 2호차 출근이 찍히면');
  {
    const po = await page(b, OLD, 'admin', { race: true });
    const ro = await act(po, 'toggle', TODAY);
    say(ro.끼어들었나 === true, '[옛] 리스너가 사이에 왔다'.padEnd(38) + ro.끼어들었나);
    say(ro.둘째차출근 === 'null', '[옛] 2호차 출근이 **지워진다**'.padEnd(38) + ro.둘째차출근);
    await po.close();

    const pn = await page(b, APP, 'admin', { race: true });
    const rn = await act(pn, 'toggle', TODAY);
    say(rn.끼어들었나 === true, '[새] 리스너가 사이에 왔다(같은 장면)'.padEnd(38) + rn.끼어들었나);
    say(rn.둘째차출근 === '{"in":"08:00"}', '[새] 2호차 출근 **그대로** ★'.padEnd(38) + rn.둘째차출근);
    say(rn.서버토글 === '{"on":false}', '[새] 내가 끈 토글도 들어간다'.padEnd(38) + rn.서버토글);
    say(pn.__errs.length === 0, '[새] 오류 0'.padEnd(38) + (pn.__errs[0] || 'OK'));
    await pn.close();
  }

  await b.close();
  console.log('\n' + (bad ? '실패 ' + bad + '건' : '✔ 전부 통과'));
  process.exit(bad ? 1 : 0);
})();
