/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v285(코스로드58 보정1) 실제 크롬 — **읽기 전용(기간 끝) 업체에서 토글하면
   안내가 뜨고 화면도 서버 자료로 되돌아가는가**(390×844 · 지시문 5).
   ★ 대조 먼저: 고치기 전(v284 · af68df3)은 안내는 뜨는데 **값이 바뀐 채 남는다**
     (v284 의 「얹기」가 막힌 그 변경을 서버값 위에 다시 얹었다).
   ★ 정상 업체에서 두 번 누름이 그대로인지도 한 번 더 본다(58 의 고침이 산다).
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const cp = require('child_process');
const path = require('path');

const APP = '' + COS_ROOT + '/index.html';                  /* 새 쪽 = 작업트리 */
const OLD_REF = process.env.COS_SRC_OLD_REF || 'af68df3';   /* v284 — 고치기 전 */
const OLD = path.join(__dirname, 'old_index285.html');

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1' },
  { id: 2, name: '나여름', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2', lat: 37.43, lon: 126.70, phone: '010-2' }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-9-1' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];

function seed() {
  return `(function(){
    var ORG = { name:'가온', icon:'🚐', bizType:'academy', destName:'학원',
                destLat:37.4467, destLon:126.6516, tel:'032-111-2222' };
    var SERVER = { members: ${JSON.stringify(MEMBERS)}, cars: ${JSON.stringify(CARS)},
                   courses: ${JSON.stringify(COURSES)}, org: ORG, orgDriver: ORG,
                   migration: { carState:true, at:1 }, staffAtt: {} };
    window.__SERVER = SERVER;
    window.__srv = { car1: { ride:{'1':{on:true},'2':{on:true}}, rideOff:{},
              carlog:{records:[],plans:{}}, delivDone:{}, dropDone:{}, att:{} } };
    window.__writes=[]; window.__alerts=[]; window.__listeners=[];
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
    window._firestore={
      doc:function(db,c1,o,c2,k){ return {col:c2,key:k}; },
      collection:function(db,c1,o,c2){ return {col:c2}; },
      getDoc:async function(ref){
        var src = ref.col==='carState' ? window.__srv
                : ref.col==='carData' ? { car1:{ members:SERVER.members, car:SERVER.cars[0], courses:SERVER.courses } }
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
        await new Promise(function(r){ setTimeout(r, 120); });   /* 망 지연 흉내 */
        return await fn({
          get:async function(ref){
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

async function page(b, file, mode, ro) {
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
  const js = seed();
  if (js.indexOf('(function(){') !== 0) throw new Error('seed 틀이 끊겼다');
  await p.evaluate(js);
  if (!(await p.evaluate(() => !!(window._db && window.__srv)))) throw new Error('가짜 Firestore 안 깔림');
  await p.evaluate(async (a) => {
    ['tkd_members__cosroad_default', 'tkd_cars__cosroad_default', 'tkd_courses__cosroad_default',
     'tkd_ridestate__cosroad_default', 'tkd_carlog__cosroad_default', 'tkd_driver_att__cosroad_default']
      .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
    currentMode = a.mode;
    window._userOrgId = 'cosroad_default';
    window._userBizType = 'academy';
    if (a.mode === 'driver') { window._isDriverAcct = true; window._driverCarId = 'car1'; }
    else { window._userUid = 'u1'; }
    window._userPaidUntil = a.ro ? (Date.now() - 86400000) : (Date.now() + 30 * 86400000);
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    await syncFromFirebase();
    await new Promise((r) => setTimeout(r, 400));
    if (a.ro) _readOnlyMode = true;              /* enterReadOnly() 가 하는 그 일 */
    currentCourseId = 'c1';
    currentDay = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
    window.__alerts = []; window.__writes = []; _roNoticeAt = 0;
  }, { mode, ro });
  p.__errs = errs;
  return p;
}

/* 토글 한 번 → 안내·서버 쓰기·폰 값·화면 */
const tap = (p) => p.evaluate(async () => {
  window.__alerts = []; window.__writes = [];
  const st = loadRideState(); st['1'] = { on: false }; saveRideState(st);
  await new Promise((r) => setTimeout(r, 2000));      /* 안내 + 되돌리기 동기화까지 */
  try { driveLeg = 'pickup'; switchTab('drive'); renderDrive(); } catch (e) {}
  const el = document.getElementById('app-content');
  const m1 = (members || []).find((m) => String(m.id) === '1') || {};
  return {
    안내수: (window.__alerts || []).length,
    안내: (window.__alerts || [])[0] || '',
    쓴것: (window.__writes || []).filter((w) => /carState/.test(w)),
    폰: JSON.stringify((loadRideState() || {})['1'] || null),
    화면값: JSON.stringify(m1.on === undefined ? null : m1.on),
    화면길이: el ? (el.textContent || '').length : 0
  };
});

/* 50ms 간격 두 번 누름 (정상 업체) */
const doubleTap = (p) => p.evaluate(async () => {
  window.__writes = [];
  const st = loadRideState(); st['1'] = { on: false }; saveRideState(st);
  await new Promise((r) => setTimeout(r, 50));
  const s2 = loadRideState(); s2['1'] = { on: true }; saveRideState(s2);
  await new Promise((r) => setTimeout(r, 2000));
  return { 폰: JSON.stringify((loadRideState() || {})['1'] || null),
           서버: JSON.stringify((window.__srv.car1.ride || {})['1'] || null) };
});

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('① ★ 대조 — 읽기 전용에서 고치기 전(' + OLD_REF + ')은 **안 되돌아간다**');
  for (const mode of ['admin', 'driver']) {
    const p = await page(b, OLD, mode, true);
    const r = await tap(p);
    say(r.안내수 >= 1, ('[옛 ' + mode + '] 안내가 떴다').padEnd(42) + r.안내수 + '번');
    say(r.쓴것.length === 0, ('[옛 ' + mode + '] 서버 쓰기 0').padEnd(42) + JSON.stringify(r.쓴것));
    say(r.폰 === '{"on":false}', ('[옛 ' + mode + '] 폰 값이 **바뀐 채 남는다**').padEnd(42) + r.폰);
    await p.close();
  }

  console.log('\n② v285 — 안내 + **화면이 되돌아간다**');
  for (const mode of ['admin', 'driver']) {
    const p = await page(b, APP, mode, true);
    const r = await tap(p);
    const tag = '[' + mode + '] ';
    say(r.안내수 >= 1, (tag + '안내가 떴다 ★').padEnd(42) + r.안내수 + '번');
    say(/읽기 전용/.test(r.안내), (tag + '기존 읽기 전용 문구').padEnd(42) + r.안내.slice(0, 20).replace(/\n/g, ' '));
    say(r.쓴것.length === 0, (tag + '서버 쓰기 0').padEnd(42) + JSON.stringify(r.쓴것));
    say(r.폰 === '{"on":true}', (tag + '폰이 **서버 값으로 되돌아감** ★').padEnd(42) + r.폰);
    say(r.화면값 === 'true', (tag + '화면이 그리는 값도 되돌아감 ★').padEnd(42) + r.화면값);
    say(r.화면길이 > 20, (tag + '화면이 비지 않는다').padEnd(42) + r.화면길이 + '자');
    say(p.__errs.length === 0, (tag + '오류 0').padEnd(42) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n③ 정상 업체 — 두 번 누름은 그대로(58 의 고침이 산다)');
  for (const mode of ['admin', 'driver']) {
    const p = await page(b, APP, mode, false);
    const r = await doubleTap(p);
    say(r.폰 === '{"on":true}', ('[' + mode + '] 폰이 마지막 누름대로').padEnd(42) + r.폰);
    say(r.서버 === '{"on":true}', ('[' + mode + '] 서버도 마지막 누름대로').padEnd(42) + r.서버);
    say(p.__errs.length === 0, ('[' + mode + '] 오류 0').padEnd(42) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log('\n' + (bad ? '실패 ' + bad + '건' : '✔ 전부 통과'));
  process.exit(bad ? 1 : 0);
})();
