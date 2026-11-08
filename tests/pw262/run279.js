/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v279(코스로드48) 실제 크롬 — 읽기 전용(기간 끝남)일 때 **차량 기록 저장**도
   안내 + 되돌리기를 하나. ★ 대조 먼저: 고치기 전(f44c98e)은 **조용히** 끝난다.
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');
/* ★ v280: 이 묶음은 **v279 회차 기록**이다 — 앱·범위를 그 커밋(d14e1c2)에 못 박는다. */
const PIN279 = ('COS_SRC_NEW_REF' in process.env) ? process.env.COS_SRC_NEW_REF : 'd14e1c2';
const APP = PIN279 ? require('path').join(__dirname, 'pin_run279.html') : '' + COS_ROOT + '/index.html';
const OLD_REF = process.env.COS_SRC_OLD_REF || 'f44c98e';   /* v278 */
const OLD = path.join(__dirname, 'old_index279.html');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1',
    lat: 37.41, lon: 126.68, phone: '010-1' },
  { id: 2, name: '나여름', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2',
    lat: 37.43, lon: 126.70, phone: '010-2' }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-9-1' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
/* 서버가 들고 있는 값 — 되돌리면 이 값으로 와야 한다 */
const SRV_RIDE = { '1': { on: true }, '2': { on: true } };

/* ro: 읽기 전용 · demo: 둘러보기 */
function seed(mode) {
  return `(function(){
    var ORG = { name:'가온', icon:'🚐', bizType:'academy', destName:'학원',
                destLat:37.4467, destLon:126.6516, tel:'032-111-2222' };
    var SERVER = { members: ${JSON.stringify(MEMBERS)}, cars: ${JSON.stringify(CARS)},
                   courses: ${JSON.stringify(COURSES)}, org: ORG, orgDriver: ORG,
                   migration: { carState:true, at:1 }, staffAtt: {} };
    window.__srv = { car1: { ride: ${JSON.stringify(SRV_RIDE)}, rideOff:{},
                             carlog:{records:[],plans:{}}, delivDone:{}, dropDone:{}, att:{} } };
    window.__writes = []; window.__alerts = []; window.__syncs = 0;
    window._db={}; window._fbReady=true;
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
      setDoc:async function(ref,d){ window.__writes.push('set '+ref.col+'/'+ref.key); },
      deleteDoc:async function(){},
      runTransaction:async function(db, fn){
        return await fn({ get:async function(ref){
            var v=window.__srv[ref.key];
            return { exists:function(){return v!==undefined;},
                     data:function(){return {value:JSON.stringify(v)};} };
          }, set:function(ref,d){ window.__writes.push('tx '+ref.col+'/'+ref.key);
                                  window.__srv[ref.key]=JSON.parse(d.value); } });
      },
      onSnapshot:function(){ return function(){}; }
    };
    window.alert=function(m){ window.__alerts.push(String(m)); };
    window.confirm=function(){return true;}; window.open=function(){return null;};
  })();`;
}

async function page(b, w, h, file, mode) {
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
  const js = seed(mode);
  if (js.indexOf('(function(){') !== 0) throw new Error('seed 틀이 끊겼다');
  await p.evaluate(js);
  if (!(await p.evaluate(() => !!(window._db && window.__srv)))) throw new Error('가짜 Firestore 안 깔림');
  await p.evaluate(async (mode) => {
    ['tkd_members__cosroad_default','tkd_cars__cosroad_default','tkd_courses__cosroad_default',
     'tkd_ridestate__cosroad_default','tkd_carlog__cosroad_default','tkd_driver_att__cosroad_default']
      .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
    currentMode = 'admin';
    window._userOrgId = (mode === 'demo') ? 'cosroad_demo' : 'cosroad_default';
    window._userUid = 'u1'; window._userBizType = 'academy';
    window._userPaidUntil = Date.now() - 86400000;
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    await syncFromFirebase();
    await new Promise((r) => setTimeout(r, 300));
    if (mode === 'ro') _readOnlyMode = true;        /* enterReadOnly() 가 하는 그 일 */
    currentCourseId = 'c1';
    currentDay = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
    window.__alerts = []; window.__writes = [];     /* 로그인까지의 것은 지운다 */
  }, mode);
  p.__errs = errs;
  return p;
}

/* 사람이 한 동작 하나 → 안내·쓰기·되돌아온 값 */
const act = (p, what) => p.evaluate(async (what) => {
  window.__alerts = []; window.__writes = [];
  if (what === 'toggle') { var st = loadRideState(); st['1'] = { on: false }; saveRideState(st); }
  if (what === 'carlog') { var d = loadCarlog();
    d.records.push({ id: 'x1', carId: 'car1', type: 'etc', date: '2026-11-05', amount: 1000, item: '시험' });
    saveCarlog(d); }
  if (what === 'done')   { markDeliveryDone(1); }
  if (what === 'att')    { var a = loadDriverAtt(); a['car1_2026-11-05'] = { in: '08:00' }; saveDriverAtt(a); }
  await new Promise((r) => setTimeout(r, 900));     /* readOnlyBlocked 의 되돌리기까지 */
  /* ★ 되돌린 **뒤에** 운행 화면을 그려 본다 — 안 그리면 app-content 가 빈 채라
     「화면이 비지 않는다」가 늘 0자로 헛돈다(처음에 그랬다). */
  try { driveLeg = 'pickup'; switchTab('drive'); renderDrive(); } catch (e) {}
  const el = document.getElementById('app-content');
  return {
    안내수: (window.__alerts || []).length,
    안내: (window.__alerts || [])[0] || '',
    쓴것: (window.__writes || []).filter((w) => /carState/.test(w)),
    토글: JSON.stringify((loadRideState() || {})['1'] || null),
    기록수: (loadCarlog().records || []).length,
    완료: JSON.stringify(loadDeliveryDone() || {}),
    근태: JSON.stringify(loadDriverAtt() || {}),
    화면길이: el ? (el.textContent || '').length : 0
  };
}, what);

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  if (PIN279) cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN279 + ':index.html > "' + APP + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('① ★ 대조 — 고치기 전(' + OLD_REF + ')은 **조용히** 끝난다');
  for (const what of ['toggle', 'carlog', 'done', 'att']) {
    const p = await page(b, 390, 844, OLD, 'ro');
    const r = await act(p, what);
    say(r.안내수 === 0, ('[옛 ' + what + '] 안내 0 (조용함)').padEnd(42) + r.안내수 + '번');
    say(r.쓴것.length === 0, ('[옛 ' + what + '] 서버 쓰기 0').padEnd(42) + JSON.stringify(r.쓴것));
    if (what === 'toggle') say(r.토글 === '{"on":false}',
      '[옛 toggle] 화면 값은 **바뀐 채로 남는다**'.padEnd(42) + r.토글);
    await p.close();
  }

  console.log('\n② v279 — 안내 1번 · 되돌아감 · 서버 쓰기 0 (네 크기)');
  for (const [w, h] of SIZES) {
    const p = await page(b, w, h, APP, 'ro');
    const r = await act(p, 'toggle');
    const tag = '[' + w + 'x' + h + '] ';
    say(r.안내수 === 1, (tag + '안내가 **한 번** ★').padEnd(42) + r.안내수 + '번');
    say(/읽기 전용/.test(r.안내), (tag + '기존 읽기 전용 문구').padEnd(42) + r.안내.slice(0, 24).replace(/\n/g, ' '));
    say(/운행 기록/.test(r.안내), (tag + '무엇이 안 저장됐는지 말한다').padEnd(42) + (/운행 기록/.test(r.안내) ? 'OK' : '없음'));
    say(r.쓴것.length === 0, (tag + '서버 쓰기 0 ★').padEnd(42) + JSON.stringify(r.쓴것));
    say(r.토글 === '{"on":true}', (tag + '화면이 **서버 값으로 되돌아감** ★').padEnd(42) + r.토글);
    say(r.화면길이 > 20, (tag + '화면이 비지 않는다').padEnd(42) + r.화면길이 + '자');
    say(p.__errs.length === 0, (tag + '오류 0').padEnd(42) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n③ v279 — 나머지 셋도 같다');
  for (const what of ['carlog', 'done', 'att']) {
    const p = await page(b, 390, 844, APP, 'ro');
    const r = await act(p, what);
    say(r.안내수 === 1, ('[' + what + '] 안내 1번 ★').padEnd(42) + r.안내수 + '번');
    say(r.쓴것.length === 0, ('[' + what + '] 서버 쓰기 0').padEnd(42) + JSON.stringify(r.쓴것));
    if (what === 'carlog') say(r.기록수 === 0, '[carlog] 되돌아가 기록 0'.padEnd(42) + r.기록수 + '건');
    if (what === 'done')   say(r.완료 === '{}', '[done] 되돌아가 완료 0'.padEnd(42) + r.완료);
    if (what === 'att')    say(r.근태 === '{}', '[att] 되돌아가 근태 0'.padEnd(42) + r.근태);
    await p.close();
  }

  console.log('\n③-b ★ 한 동작이 저장을 **두 번** 부를 때도 안내는 한 번');
  {
    /* saveMembers 는 `saveToFirebase('members')`(→readOnlyBlocked)와 `saveCarState()`(→readOnlyBlocked)를
       **둘 다** 부른다. readOnlyBlocked 의 1.5초 묶음이 실제로 한 번으로 줄이는지 본다. */
    const p = await page(b, 390, 844, APP, 'ro');
    const r = await p.evaluate(async () => {
      window.__alerts = []; window.__writes = [];
      saveMembers(members);
      await new Promise((x) => setTimeout(x, 900));
      return { 안내수: (window.__alerts || []).length, 쓴것: (window.__writes || []).slice() };
    });
    say(r.안내수 === 1, 'saveMembers — 안내 1번(1.5초 묶음) ★'.padEnd(42) + r.안내수 + '번');
    say(r.쓴것.length === 0, '   서버 쓰기 0'.padEnd(42) + JSON.stringify(r.쓴것));
    await p.close();
  }

  console.log('\n④ 로그인 직후(아무것도 안 함) — 안내 0');
  {
    const p = await page(b, 390, 844, APP, 'ro');
    const r = await p.evaluate(async () => {
      await new Promise((x) => setTimeout(x, 800));
      return { 안내수: (window.__alerts || []).length, 안내: (window.__alerts || [])[0] || '' };
    });
    say(r.안내수 === 0, '들어오자마자 뜨는 창 0 ★'.padEnd(42) + r.안내수 + '번 ' + r.안내.slice(0, 20));
    await p.close();
  }

  console.log('\n⑤ 살아 있는 업체 — 그대로 저장된다 (v277 합쳐 쓰기 그대로)');
  {
    const p = await page(b, 390, 844, APP, 'live');
    const r = await act(p, 'toggle');
    say(r.안내수 === 0, '안내 0'.padEnd(42) + r.안내수 + '번');
    say(r.쓴것.some((w) => /^tx carState\/car1$/.test(w)), '트랜잭션으로 저장됨'.padEnd(42) + JSON.stringify(r.쓴것));
    say(r.토글 === '{"on":false}', '바꾼 값이 남는다'.padEnd(42) + r.토글);
    await p.close();
  }

  console.log('\n⑥ 둘러보기 — 지금처럼 **조용히**');
  {
    const p = await page(b, 390, 844, APP, 'demo');
    const r = await act(p, 'toggle');
    say(r.안내수 === 0, '읽기 전용 창이 안 뜬다 ★'.padEnd(42) + r.안내수 + '번');
    say(r.쓴것.length === 0, '서버 쓰기 0'.padEnd(42) + JSON.stringify(r.쓴것));
    await p.close();
  }

  console.log('\n⑦ 범위·버전');
  {
    const names = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' ' + (PIN279 || ''))
      .toString().trim().split('\n').filter(Boolean).sort();
    say(names.every((n) => ['CLAUDE.md', 'index.html', 'version.json'].indexOf(n) >= 0),
      '바뀐 파일은 화면·버전·문서뿐   ' + names.join(','));
    const keep = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + OLD_REF + ' ' + (PIN279 || '')
      + ' -- api lib firestore.rules s.html home.html terms.html privacy.html').toString().trim();
    say(keep === '', 'api·lib·규칙·정적 diff 0   ' + (keep || '(변경 없음)'));
    const vj = JSON.parse(PIN279 ? cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN279 + ':version.json').toString() : fs.readFileSync('' + COS_ROOT + '/version.json', 'utf8'));
    const av = /const APP_VERSION = (\d+);/.exec(fs.readFileSync(APP, 'utf8'))[1];
    say(vj.version === 279 && av === '279', '버전 279   ' + vj.version + ' · ' + av);
  }

  await b.close();
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
