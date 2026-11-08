/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v287(코스로드59-B1) 실제 크롬 — **로그아웃은 화면을 새로 받는다**.
   ⓐ `_logoutReload()` 는 **로그인이 살아 있으면 안 가고**, 끝나면 간다 · 주소(`?org=`)는 그대로
   ⓑ signOut 이 **끝나지 않아도 3초 제한** 뒤에는 간다
   ⓒ `logout()` 이 **읽기 전용 표시를 끄고** 새로 받기를 부른다(관리자·기사·도우미)
   ⓓ ★ 새로 받은 뒤 **앞 업체 리스너가 하나도 없다**(창이 새것이므로) · 자동 재로그인 없음
   ★ 창이 하나뿐인 크롬에서만 잴 수 있다 — 스텁은 앱이 보는 전역이 달라 못 잰다(orgsep59.js 쪽지).
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const path = require('path');

const APP = '' + COS_ROOT + '/index.html';

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM_A = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: 'A주소', lat: 37.41, lon: 126.68, phone: '010-1' }];
const CARS = [{ id: 'car1', name: '1호차', driver: '', phone: '', plate: '' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];

/* 가짜 Firestore + 리스너 셈 — 새로 받으면 0 으로 돌아가야 한다 */
function seed() {
  return `(function(){
    var ORG = { name:'A학원', icon:'🅰', bizType:'academy', destName:'A학원',
                destLat:37.4467, destLon:126.6516, tel:'032-111-2222' };
    var SERVER = { members: ${JSON.stringify(MEM_A)}, cars: ${JSON.stringify(CARS)},
                   courses: ${JSON.stringify(COURSES)}, org: ORG, orgDriver: ORG,
                   migration: { carState:true, at:1 }, staffAtt: {} };
    window.__srv = { car1: { ride:{'1':{on:true}}, rideOff:{}, carlog:{records:[],plans:{}},
                             delivDone:{}, dropDone:{}, att:{} } };
    window.__listeners = [];        /* 새로 받으면 사라진다 */
    window.__writes = []; window.__alerts = [];
    window._db={}; window._fbReady=true;
    window._firestore={
      doc:function(db,c1,org,col,k){ return {org:org,col:col,key:k}; },
      collection:function(db,c1,org,col){ return {org:org,col:col}; },
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
        return await fn({ get:async function(ref){ var v=window.__srv[ref.key];
            return { exists:function(){return v!==undefined;},
                     data:function(){return {value:JSON.stringify(v)};} }; },
          set:function(ref,d){ window.__writes.push('tx '+ref.col+'/'+ref.key);
                               window.__srv[ref.key]=JSON.parse(d.value); } });
      },
      onSnapshot:function(ref,cb){ window.__listeners.push(ref.org+'/'+ref.col+'/'+(ref.key||'*'));
                                   return function(){}; }
    };
    window.alert=function(m){ window.__alerts.push(String(m)); };
    window.confirm=function(){return true;}; window.open=function(){return null;};
  })();`;
}

async function page(b) {
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
  await p.goto('file:///' + APP.replace(/\\/g, '/') + '?org=A', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(seed());
  p.__errs = errs;
  return p;
}

/* 로그인 흉내 — 역할에 따라 */
const enter = (p, mode) => p.evaluate(async (mode) => {
  currentMode = mode === 'admin' ? 'admin' : 'driver';
  window._userOrgId = 'A'; window._userBizType = 'academy';
  window._userPaidUntil = Date.now() + 30 * 86400000;
  if (mode === 'admin') { window._userUid = 'uA'; }
  else {
    window._isDriverAcct = true; window._driverOrg = 'A'; window._driverCarId = 'car1';
    if (mode === 'helper') { window._isHelperAcct = true; window._driverStaffId = 'st1'; }
  }
  const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
  const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
  await syncFromFirebase();
  await new Promise((r) => setTimeout(r, 400));
  return (window.__listeners || []).length;
}, mode);

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  /* ★ 실제 브라우저에서는 `location.replace` 를 바꿔 끼울 수 없다(네이티브) —
     그래서 **이동 횟수를 센다**(framenavigated). 처음 goto 는 세기 전에 지난다. */
  const navCounter = (p) => {
    const box = { n: 0 };
    p.on('framenavigated', (f) => { if (f === p.mainFrame()) box.n++; });
    return box;
  };

  console.log('ⓐ `_logoutReload()` — 로그인이 살아 있으면 안 가고, 끝나면 간다');
  {
    const p = await page(b);
    const nav = navCounter(p);
    await p.evaluate(() => {
      window.__signed = true;
      _authStillSignedIn = function(){ return window.__signed === true; };
      _logoutReload();
    });
    await new Promise((r) => setTimeout(r, 1000));
    say(nav.n === 0, '로그인이 살아 있으면 **안 간다**'.padEnd(44) + nav.n + '번');
    await p.evaluate(() => { window.__signed = false; });      /* signOut 이 끝난 순간 */
    await p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    say(nav.n === 1, '★ signOut 이 끝나면 **새로 받는다**'.padEnd(44) + nav.n + '번');
    say(/\?org=A$/.test(p.url()), '★ 주소에 `?org=A` 가 **그대로**'.padEnd(44) + p.url().slice(-26));
    say(p.__errs.length === 0, '오류 0'.padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓑ signOut 이 끝나지 않아도 **3초 제한** 뒤에는 간다');
  {
    const p = await page(b);
    const nav = navCounter(p);
    await p.evaluate(() => {
      _authStillSignedIn = function(){ return true; };          /* 끝내 안 끝난다 */
      _logoutReload();
    });
    await new Promise((r) => setTimeout(r, 800));
    say(nav.n === 0, '0.8초에는 아직 안 간다'.padEnd(44) + nav.n + '번');
    await p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    say(nav.n === 1, '★ 3초 제한이 지나면 **그래도 새로 받는다**'.padEnd(44) + nav.n + '번');
    await p.close();
  }

  console.log('\nⓒ `logout()` — 읽기 전용을 끄고 새로 받기를 부른다 (세 역할)');
  for (const mode of ['admin', 'driver', 'helper']) {
    const p = await page(b);
    const n = await enter(p, mode);
    const nav = navCounter(p);
    /* 아직 「로그인 중」으로 두어 **가기 전에** 상태를 읽는다 */
    const r = await p.evaluate(() => {
      _readOnlyMode = true;                      /* 기간 끝난 업체였다 */
      window.__signed = true;
      _authStillSignedIn = function(){ return window.__signed === true; };
      let err = '없음';
      try { logout(); } catch (e) { err = String(e && e.message); }
      return { ro: isReadOnlyMode(), keep: localStorage.getItem('tkd_keeplogin_A'), err: err };
    });
    const tag = '[' + mode + '] ';
    say(r.ro === false, (tag + '★ 읽기 전용 표시가 **꺼진다**').padEnd(44) + String(r.ro));
    say(r.keep === null, (tag + '「로그인 유지」 키를 지웠다').padEnd(44) + String(r.keep));
    say(r.err === '없음', (tag + '로그아웃이 안 터진다').padEnd(44) + r.err);
    say(nav.n === 0, (tag + 'signOut 전에는 안 간다').padEnd(44) + nav.n + '번');
    await p.evaluate(() => { window.__signed = false; });
    await p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    say(nav.n === 1, (tag + '★ signOut 뒤 **새로 받는다**').padEnd(44) + nav.n + '번');
    console.log('      (로그인 때 붙은 리스너 ' + n + '개)');
    await p.close();
  }

  console.log('\nⓓ ★ 새로 받으면 **앞 업체 기억이 하나도 없다**');
  {
    const p = await page(b);
    const n1 = await enter(p, 'admin');
    say(n1 >= 17, 'A 로그인 뒤 리스너'.padEnd(44) + n1 + '개');
    await p.evaluate(() => { _authStillSignedIn = function(){ return false; }; });
    await Promise.all([
      p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
      p.evaluate(() => { try { logout(); } catch (e) {} })
    ]);
    await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
    const after = await p.evaluate(() => ({
      listeners: (window.__listeners || []).length,   /* 씨앗을 다시 안 깔았으니 0 */
      ro: (typeof isReadOnlyMode === 'function') ? isReadOnlyMode() : null,
      uid: window._userUid || null, org: window._userOrgId || null,
      base: (typeof _csBase !== 'undefined') ? Object.keys(_csBase).length : -1,
      url: location.search
    }));
    say(after.listeners === 0, '★ 리스너 0 개(앞 업체 것이 사라졌다)'.padEnd(44) + after.listeners + '개');
    say(after.ro === false, '★ 읽기 전용 아님'.padEnd(44) + String(after.ro));
    say(after.uid === null && after.org === null, '★ 앞 사람 정보 없음(자동 재로그인 없음)'.padEnd(44)
      + String(after.uid) + '/' + String(after.org));
    say(after.base === 0, '★ 기준본도 비어 있다'.padEnd(44) + after.base + '칸');
    say(/\?org=A$/.test(after.url), '★ 주소 `?org=A` 그대로'.padEnd(44) + after.url);
    await p.close();
  }

  console.log('\nⓔ `_authStillSignedIn()` — **익명은 로그아웃된 것**으로 본다');
  {
    /* 왜 — signOut 뒤 앱이 `onAuthStateChanged` 에서 **곧바로 익명 로그인**을 한다.
       익명을 「아직 로그인 중」으로 보면 로그아웃이 **매번 3초**를 기다린다. */
    const p = await page(b);
    const r = await p.evaluate(() => {
      const f = _authStillSignedIn;
      const out = {};
      window._auth = { currentUser: null };                       out.없음 = f();
      window._auth = { currentUser: { isAnonymous: true } };      out.익명 = f();
      window._auth = { currentUser: { isAnonymous: false } };     out.내계정 = f();
      window._auth = null;                                        out.인증객체없음 = f();
      return out;
    });
    say(r.없음 === false, '사용자 없음 → 거짓'.padEnd(44) + String(r.없음));
    say(r.익명 === false, '★ 익명 → **거짓**(로그아웃으로 본다)'.padEnd(44) + String(r.익명));
    say(r.내계정 === true, '내 계정 → 참'.padEnd(44) + String(r.내계정));
    say(r.인증객체없음 === false, '인증 객체 없음 → 거짓'.padEnd(44) + String(r.인증객체없음));
    say(p.__errs.length === 0, '오류 0'.padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log('\n' + (bad ? '실패 ' + bad + '건' : '✔ 전부 통과'));
  process.exit(bad ? 1 : 0);
})();
