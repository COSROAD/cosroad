/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v277(43-0) 실제 크롬 — ① 관리자도 **실시간으로 듣는다** ② 저장이 **다른 칸을 안 건드린다**
   ③ 기사 로그인 → 첫 화면(42 회귀 없음). 가짜 Firestore 는 **runTransaction 을 진짜처럼** 돈다.
   바깥 요청 전부 차단 · 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');
/* ★ v277-1(코스로드45): 이 묶음은 **v277 회차 기록**이다 — 앱·범위를 그 커밋(f7a29ca)에 못 박는다.
   '' 를 주면 작업트리(그 회차를 손볼 때). */
const PIN277 = ('COS_SRC_NEW_REF' in process.env) ? process.env.COS_SRC_NEW_REF : 'f7a29ca';
const APP = PIN277 ? path.join(__dirname, 'pin_run277.html') : '' + COS_ROOT + '/index.html';
const OLD_REF = process.env.COS_SRC_OLD_REF || 'b0f695a';   /* v276 — 덮어쓰던 판 */
const OLD = path.join(__dirname, 'old_index277.html');

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1',
    lat: 37.41, lon: 126.68, phone: '010-1111-1111' },
  { id: 2, name: '나여름', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2',
    lat: 37.43, lon: 126.70, phone: '010-2222-2222' }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사', plate: '12가3456', phone: '010-9-1' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00', arrive: '14:50' }];
const TODAY = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();

/* role: 'admin' | 'driver' */
function seed(role) {
  return `(function(){
    var ORGDRIVER = { name:'가온', icon:'🚐', bizType:'academy', destName:'학원',
                      destLat:37.4467, destLon:126.6516, tel:'032-111-2222' };
    var ORG = Object.assign({}, ORGDRIVER, { bankAccount:'농협 1', bizNo:'635-88-02710' });
    var SERVER = { members: ${JSON.stringify(MEMBERS)}, cars: ${JSON.stringify(CARS)},
                   courses: ${JSON.stringify(COURSES)}, org: ORG, orgDriver: ORGDRIVER,
                   migration: { carState:true, at:1 }, staffAtt: {} };
    /* 서버의 차량 기록 — 창(window) 사이에 공유할 수 없으므로 창마다 한 벌씩 두고,
       시험이 window.__srv 를 직접 읽고 써서 「다른 기기가 바꿨다」를 만든다. */
    window.__srv = { car1: { ride:{'1':{on:true},'2':{on:true}}, rideOff:{},
                             carlog:{records:[],plans:{}}, delivDone:{}, dropDone:{}, att:{} } };
    window.__writes = []; window.__denied = [];
    var LS = [];
    function fire(col){
      LS.filter(function(l){ return l.col===col; }).forEach(function(l){
        try{
          if(l.key!==undefined){
            var v = (col==='carState') ? window.__srv[l.key] : SERVER[l.key];
            l.cb({ exists:function(){ return v!==undefined; },
                   data:function(){ return {value: JSON.stringify(v)}; } });
          } else {
            l.cb({ forEach:function(f){ Object.keys(window.__srv).forEach(function(k){
              f({ id:k, data:function(){ return {value: JSON.stringify(window.__srv[k])}; } });
            }); } });
          }
        }catch(e){}
      });
    }
    window.__fire = fire;
    window._db={}; window._fbReady=true;
    window._firestore={
      doc:function(db,c1,o,c2,k){ return {col:c2,key:k}; },
      collection:function(db,c1,o,c2){ return {col:c2}; },
      getDoc:async function(ref){
        var src = (ref.col==='carState') ? window.__srv
                : (ref.col==='carData') ? { car1:{ members:SERVER.members, car:SERVER.cars[0], courses:SERVER.courses } }
                : SERVER;
        var has = Object.prototype.hasOwnProperty.call(src, ref.key);
        return { exists:function(){return has;}, data:function(){return {value:JSON.stringify(src[ref.key])};} };
      },
      getDocs:async function(ref){
        var src = (ref.col==='carState') ? window.__srv : {};
        var ks = Object.keys(src);
        return { forEach:function(cb){ ks.forEach(function(k){
          cb({ id:k, data:function(){ return {value:JSON.stringify(src[k])}; } }); }); } };
      },
      setDoc:async function(ref,d){
        if(ref.col==='backups'){ window.__writes.push('backups'); return; }
        window.__writes.push('set '+ref.col+'/'+ref.key);
        if(ref.col==='carState'){ window.__srv[ref.key]=JSON.parse(d.value); fire('carState'); return; }
        SERVER[ref.key] = d.value!==undefined ? JSON.parse(d.value) : d;
      },
      deleteDoc:async function(){},
      runTransaction:async function(db, fn){
        var tx = {
          get:async function(ref){
            var v = window.__srv[ref.key];
            return { exists:function(){ return v!==undefined; },
                     data:function(){ return {value: JSON.stringify(v)}; } };
          },
          set:function(ref,d){
            window.__writes.push('tx '+ref.col+'/'+ref.key);
            window.__srv[ref.key]=JSON.parse(d.value); fire('carState');
          }
        };
        return await fn(tx);
      },
      onSnapshot:function(ref,cb){ LS.push({col:ref.col,key:ref.key,cb:cb}); return function(){}; }
    };
    window.alert=function(m){ (window.__a=window.__a||[]).push(String(m)); };
    window.confirm=function(){return true;}; window.open=function(){return null;};
  })();`;
}

async function openPage(b, file, role) {
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
  const js = seed(role);
  if (js.indexOf('(function(){') !== 0) throw new Error('seed 틀이 끊겼다');
  await p.evaluate(js);
  if (!(await p.evaluate(() => !!(window._db && window.__srv)))) throw new Error('가짜 Firestore 안 깔림');
  await p.evaluate(async ({ role }) => {
    ['tkd_members__cosroad_default','tkd_cars__cosroad_default','tkd_courses__cosroad_default',
     'tkd_ridestate__cosroad_default','tkd_carlog__cosroad_default','tkd_driver_att__cosroad_default']
      .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
    window._userOrgId = 'cosroad_default';
    if (role === 'driver') {
      window._isDriverAcct = true; window._driverCarId = 'car1'; window._driverOrg = 'cosroad_default';
      window._userUid = 'drv_cosroad_default_car1'; window._userBizType = null;
      onDriverLoggedIn();
    } else {
      currentMode = 'admin';
      window._isDriverAcct = false; window._userUid = 'u1';
      window._userPaidUntil = Date.now() + 30 * 86400000; window._userBizType = 'academy';
      const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
      const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
      await syncFromFirebase();
    }
    await new Promise((r) => setTimeout(r, 2200));   /* initApp 은 1초 뒤에 sync 한다 */
  }, { role });
  p.__errs = errs;
  return p;
}

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  if (PIN277) cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN277 + ':index.html > "' + APP + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('① 관리자도 **실시간으로 듣는다** (v276 에는 없던 것)');
  for (const [tag, file, want] of [['v276(옛)', OLD, false], ['v277(새)', APP, true]]) {
    const p = await openPage(b, file, 'admin');
    const r = await p.evaluate(async () => {
      /* 다른 기기(기사)가 서버 문서를 바꿨다 */
      window.__srv.car1.ride['1'] = { on: false };
      window.__fire('carState');
      await new Promise((x) => setTimeout(x, 300));
      return { 토글: JSON.stringify((loadRideState() || {})['1'] || null) };
    });
    const got = r.토글 === '{"on":false}';
    say(got === want, (tag + ' 관리자 폰이 바뀐 값을 받나').padEnd(40) + r.토글 + (want ? '' : '  (옛 판은 안 받는 게 맞다)'));
    say(p.__errs.length === 0, (tag + ' 오류 0').padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n② 관리자 저장이 **다른 칸을 안 건드린다** (서버 punch 출근 기록)');
  for (const [tag, file, want] of [['v276(옛)', OLD, false], ['v277(새)', APP, true]]) {
    const p = await openPage(b, file, 'admin');
    const r = await p.evaluate(async (today) => {
      /* 서버 punch 가 출근을 찍고, 기사가 토글을 껐다 — 관리자 폰은 (옛 판이면) 모른다 */
      window.__srv.car1.att = { [today]: { in: '08:00' } };
      window.__srv.car1.ride['1'] = { on: false };
      window.__writes = [];
      saveMembers(members);                       /* 관리자가 «회원» 저장 */
      await new Promise((x) => setTimeout(x, 600));
      return { 출근: JSON.stringify((window.__srv.car1.att || {})[today] || null),
               토글: JSON.stringify(window.__srv.car1.ride['1']),
               쓴것: window.__writes.filter((w) => /carState/.test(w)) };
    }, TODAY);
    const ok = r.출근 === '{"in":"08:00"}' && r.토글 === '{"on":false}';
    say(ok === want, (tag + ' 출근·토글이 살아남나').padEnd(40)
      + '출근 ' + r.출근 + ' · 토글 ' + r.토글);
    if (want) {
      /* ★ 위 저장은 **바뀐 칸이 없어** 아무것도 안 썼다(그래서 살아남았다) — 그대로 두면
         「전부 tx 다」가 **빈 배열에 대한 참**이라 헛돈다. 관리자가 **실제로 바꾸는** 경우로 다시 본다. */
      say(r.쓴것.length === 0, '   바뀐 칸이 없으면 아예 안 쓴다'.padEnd(40) + JSON.stringify(r.쓴것));
      const w2 = await p.evaluate(async (today) => {
        window.__writes = [];
        var st = loadRideState(); st['2'] = { on: false }; saveRideState(st);   /* 관리자 수기 토글 */
        await new Promise((x) => setTimeout(x, 600));
        return { 쓴것: window.__writes.filter((w) => /carState/.test(w)),
                 출근: JSON.stringify((window.__srv.car1.att || {})[today] || null),
                 토글1: JSON.stringify(window.__srv.car1.ride['1']),
                 토글2: JSON.stringify(window.__srv.car1.ride['2']) };
      }, TODAY);
      say(w2.쓴것.length > 0 && w2.쓴것.every((w) => /^tx /.test(w)),
        '   관리자 변경은 **트랜잭션으로** 나간다'.padEnd(40) + JSON.stringify(w2.쓴것));
      say(w2.출근 === '{"in":"08:00"}' && w2.토글1 === '{"on":false}' && w2.토글2 === '{"on":false}',
        '   그러면서 출근·기사 토글은 그대로'.padEnd(40)
        + '출근 ' + w2.출근 + ' · 1 ' + w2.토글1 + ' · 2 ' + w2.토글2);
    }
    await p.close();
  }

  console.log('\n③ 기사 로그인 → 첫 화면 (42 회귀 없음)');
  {
    const p = await openPage(b, APP, 'driver');
    const r = await p.evaluate(() => {
      driveLeg = 'pickup'; switchTab('drive'); renderDrive();
      return { 막힘: !!document.getElementById('driver-blocked'),
               목록: getActiveStudents().map((x) => x.name).join(','),
               화면: (document.getElementById('app-content').textContent || '').replace(/\s+/g, ' ').trim() };
    });
    say(r.막힘 === false, '막힘 화면 0'.padEnd(40) + 'OK');
    say(r.목록.length > 0, '운행 목록'.padEnd(40) + (r.목록 || '(빈 목록)'));
    say(/출근|퇴근/.test(r.화면) && /차계부/.test(r.화면), '출근·퇴근·차계부 단추'.padEnd(40) + 'OK');
    /* 기사 저장도 트랜잭션으로 */
    const w = await p.evaluate(async () => {
      window.__writes = [];
      var st = loadRideState(); st['1'] = { on: false }; saveRideState(st);
      await new Promise((x) => setTimeout(x, 500));
      return window.__writes.slice();
    });
    say(w.some((x) => /^tx carState\/car1$/.test(x)), '기사 저장도 트랜잭션'.padEnd(40) + JSON.stringify(w));
    say(p.__errs.length === 0, '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n④ 범위·버전');
  {
    const names = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' ' + (PIN277 || ''))
      .toString().trim().split('\n').filter(Boolean).sort();
    say(names.every((n) => ['CLAUDE.md', 'index.html', 'version.json'].indexOf(n) >= 0),
      '바뀐 파일은 화면·버전·문서뿐   ' + names.join(','));
    const keep = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + OLD_REF + ' ' + (PIN277 || '')
      + ' -- api lib firestore.rules s.html home.html terms.html privacy.html').toString().trim();
    say(keep === '', 'api·lib·규칙·정적 diff 0   ' + (keep || '(변경 없음)'));
    const vj = JSON.parse(PIN277
      ? cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN277 + ':version.json').toString()
      : fs.readFileSync('' + COS_ROOT + '/version.json', 'utf8'));
    const av = /const APP_VERSION = (\d+);/.exec(fs.readFileSync(APP, 'utf8'))[1];
    say(vj.version === 277 && av === '277', '버전 277            ' + vj.version + ' · ' + av);
  }

  await b.close();
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 · Firestore 가짜(트랜잭션 포함) — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
