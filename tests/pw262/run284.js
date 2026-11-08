/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v284(코스로드58) 실제 크롬 — 저장이 겹쳐도 **마지막 동작이 남는가**, 그리고
   사람이 하는 네 동작이 **그대로 되는가**(390×844 한 크기 · 지시문).
   ① 관리자 탑승 토글을 **50ms 간격으로 두 번** → 마지막 누름대로 남는다(옛 판은 첫 누름)
   ② 기사도 같다
   ③ 관리자 수기 근태 · ④ 기사 탑승 토글 · ⑤ 차계부 계기판 km **수정**(저장 한 번)
   ★ 도우미 출근 단추는 `run282.js` 가 네 크기에서 이미 본다(여기서 겹쳐 안 본다).
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const cp = require('child_process');
const path = require('path');

const APP = '' + COS_ROOT + '/index.html';                  /* 새 쪽 = 작업트리 */
const OLD_REF = process.env.COS_SRC_OLD_REF || 'b55ae21';   /* v283 — 고치기 전 */
const OLD = path.join(__dirname, 'old_index284.html');
const TODAY = (() => { const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0')
       + '-' + String(n.getDate()).padStart(2, '0'); })();

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1' },
  { id: 2, name: '나여름', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2', lat: 37.43, lon: 126.70, phone: '010-2' }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-9-1' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const REC = { id: 'r1', carId: 'car1', type: 'odo', date: TODAY, odo: 100, by: 'admin' };

function seed() {
  return `(function(){
    var ORG = { name:'가온', icon:'🚐', bizType:'academy', destName:'학원',
                destLat:37.4467, destLon:126.6516, tel:'032-111-2222' };
    var SERVER = { members: ${JSON.stringify(MEMBERS)}, cars: ${JSON.stringify(CARS)},
                   courses: ${JSON.stringify(COURSES)}, org: ORG, orgDriver: ORG,
                   migration: { carState:true, at:1 }, staffAtt: {} };
    window.__SERVER = SERVER;
    window.__srv = { car1: { ride:{'1':{on:true},'2':{on:true}}, rideOff:{},
              carlog:{records:[${JSON.stringify(REC)}],plans:{}}, delivDone:{}, dropDone:{}, att:{} } };
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
        /* ★ 실제 Firestore 는 한 번 쓰는 데 **수백 ms** 걸린다. 메모리 가짜는 즉시 끝나
           「두 번 누름」이 겹치지 않아 **옛 판에서도 안 깨진다**(처음에 그랬다).
           그래서 **망 지연을 흉내 낸다** — 겹침을 만드는 것이 이 묶음의 요점이다. */
        await new Promise(function(r){ setTimeout(r, 250); });
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

async function page(b, file, mode) {
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

/* 50ms 간격으로 두 번 누름 (끄기 → 켜기) */
const doubleTap = (p) => p.evaluate(async () => {
  window.__writes = [];
  const st = loadRideState(); st['1'] = { on: false }; saveRideState(st);
  await new Promise((r) => setTimeout(r, 50));
  const s2 = loadRideState(); s2['1'] = { on: true }; saveRideState(s2);
  await new Promise((r) => setTimeout(r, 2500));
  try { driveLeg = 'pickup'; switchTab('drive'); renderDrive(); } catch (e) {}
  const el = document.getElementById('app-content');
  return {
    폰: JSON.stringify((loadRideState() || {})['1'] || null),
    서버: JSON.stringify((window.__srv.car1.ride || {})['1'] || null),
    쓴횟수: (window.__writes || []).filter((w) => /^tx carState/.test(w)).length,
    화면길이: el ? (el.textContent || '').length : 0
  };
});

/* 관리자 수기 근태 */
const manualAtt = (p, today) => p.evaluate(async (today) => {
  window.__writes = [];
  const d = loadDriverAtt(); d['car1_' + today] = { in: '08:00' }; saveDriverAtt(d);
  await new Promise((r) => setTimeout(r, 2200));
  return { 서버근태: JSON.stringify((window.__srv.car1.att || {})[today] || null),
           쓴횟수: (window.__writes || []).filter((w) => /^tx carState/.test(w)).length };
}, today);

/* 차계부 계기판 km **수정** — 실제 화면 함수를 그대로 */
const carlogEdit = (p, today) => p.evaluate(async (today) => {
  window.__writes = [];
  const mk = (id, v) => { let e = document.getElementById(id);
    if (!e) { e = document.createElement('input'); e.id = id; document.body.appendChild(e); }
    e.value = v; return e; };
  mk('cl-date', today); mk('cl-odo', '777');
  carlogSelCar = 'car1'; carlogType = 'odo'; carlogOdoWhen = 'end'; carlogEditId = 'r1';
  try { saveCarlogEntry(); } catch (e) { window.__cerr = String(e && e.message); }
  await new Promise((r) => setTimeout(r, 2200));
  const recs = ((window.__srv.car1.carlog || {}).records) || [];
  return { 기록수: recs.length, 계기판: recs.length ? String(recs[0].odo || recs[0].odoStart) : '없음',
           쓴횟수: (window.__writes || []).filter((w) => /^tx carState/.test(w)).length,
           오류: window.__cerr || '없음' };
}, today);

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('① ★ 대조 — 빠르게 두 번 누름 (고치기 전 ' + OLD_REF + ')');
  for (const mode of ['admin', 'driver']) {
    const p = await page(b, OLD, mode);
    const r = await doubleTap(p);
    say(r.폰 === '{"on":false}', ('[옛 ' + mode + '] 폰이 첫 누름으로 남는다').padEnd(40) + r.폰);
    say(r.서버 === '{"on":false}', ('[옛 ' + mode + '] 서버도 첫 누름').padEnd(40) + r.서버);
    await p.close();
  }

  console.log('\n② v284 — 마지막 누름이 남는다');
  for (const mode of ['admin', 'driver']) {
    const p = await page(b, APP, mode);
    const r = await doubleTap(p);
    say(r.폰 === '{"on":true}', ('[' + mode + '] 폰이 **마지막 누름**대로 ★').padEnd(40) + r.폰);
    say(r.서버 === '{"on":true}', ('[' + mode + '] 서버도 마지막 누름대로 ★').padEnd(40) + r.서버);
    say(r.쓴횟수 >= 2, ('[' + mode + '] 저장이 줄을 서서 두 번').padEnd(40) + r.쓴횟수 + '번');
    say(r.화면길이 > 20, ('[' + mode + '] 화면이 비지 않는다').padEnd(40) + r.화면길이 + '자');
    say(p.__errs.length === 0, ('[' + mode + '] 오류 0').padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n③ 관리자 수기 근태 — 그대로 된다');
  {
    const p = await page(b, APP, 'admin');
    const r = await manualAtt(p, TODAY);
    say(r.서버근태 === '{"in":"08:00"}', '서버 차량 문서 att 에 들어간다 ★'.padEnd(40) + r.서버근태);
    say(r.쓴횟수 >= 1, '썼다'.padEnd(40) + r.쓴횟수 + '번');
    say(p.__errs.length === 0, '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n④ 차계부 계기판 km 수정 — 저장 **한 번** · 기록 남는다');
  {
    const po = await page(b, OLD, 'admin');
    const ro = await carlogEdit(po, TODAY);
    say(ro.쓴횟수 > 1, '[옛] 저장이 여러 번 따로 돈다'.padEnd(40) + ro.쓴횟수 + '번');
    await po.close();
    const p = await page(b, APP, 'admin');
    const r = await carlogEdit(p, TODAY);
    say(r.기록수 === 1, '기록 1개'.padEnd(40) + r.기록수 + '개');
    say(r.계기판 === '777', '고친 값이 들어갔다 ★'.padEnd(40) + r.계기판);
    say(r.쓴횟수 === 1, '저장이 **한 번** ★'.padEnd(40) + r.쓴횟수 + '번');
    say(r.오류 === '없음', '오류 0'.padEnd(40) + r.오류);
    say(p.__errs.length === 0, '페이지 오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log('\n' + (bad ? '실패 ' + bad + '건' : '✔ 전부 통과'));
  process.exit(bad ? 1 : 0);
})();
