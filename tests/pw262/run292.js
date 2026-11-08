/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v292(코스로드59-B3) 실제 크롬 390×844 — **기기 저장 칸이 업체별로 갈리나**.
   ⓐ **로그인 전**에 어떤 칸을 읽나 — 그 표를 찍고, **업체 칸 쓰기는 0건**인지 본다
   ⓑ 같은 기기에서 A → B (관리자) — B 가 A 자료를 **못 본다** · A 칸은 **그대로 남는다**
   ⓒ 기사·도우미도 갈린다(`_driverOrg`) — 전에는 둘 다 `cosroad_default` 였다
   ⓓ `?org=_test`(마스터·출입 계정 길) — **주소가 이긴다**(종전 그대로)
   ⓔ 둘러보기(`?org=academy_demo`) — 업체 칸을 **로컬에도 안 쓴다**(종전 그대로)
   ★ 칸 이름은 **앱의 래퍼를 지난 뒤**(진짜 칸 이름)로 센다 — `addInitScript` 로
     `Storage.prototype` 을 **먼저** 감싸 두면 앱 래퍼가 그 위에 얹힌다.
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');

const APP = '' + COS_ROOT + '/index.html';
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM_A = [{ id: 1, name: 'A업체 가하은', carId: 'car1', courseId: 'c1', days: D7, location: 'A주소', lat: 37.41, lon: 126.68, phone: '010-1' }];
const MEM_B = [{ id: 1, name: 'B업체 나래', carId: 'car1', courseId: 'c1', days: D7, location: 'B주소', lat: 37.42, lon: 126.69, phone: '010-2' }];
const CARS = [{ id: 'car1', name: '1호차', driver: '', phone: '', plate: '' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];

/* 칸 접근 기록 — 앱 래퍼보다 **먼저** 깔아 둔다 */
const probe = `(function(){
  window.__box = [];
  var g = Storage.prototype.getItem, s = Storage.prototype.setItem, r = Storage.prototype.removeItem;
  Storage.prototype.getItem = function(k){ window.__box.push(['get', String(k)]); return g.call(this, k); };
  Storage.prototype.setItem = function(k, v){ window.__box.push(['set', String(k)]); return s.call(this, k, v); };
  Storage.prototype.removeItem = function(k){ window.__box.push(['rem', String(k)]); return r.call(this, k); };
})();`;

/* 가짜 Firestore — 업체 A·B 둘을 들고 있다 */
function seed() {
  return `(function(){
    var ORG_A = { name:'A학원', icon:'🅰', bizType:'academy', destName:'A학원',
                  destLat:37.4467, destLon:126.6516, tel:'032-111-1111', bankAccount:'A은행 111' };
    var ORG_B = { name:'B학원', icon:'🅱', bizType:'academy', destName:'B학원',
                  destLat:37.5, destLon:126.7, tel:'032-222-2222', bankAccount:'B은행 222' };
    var EMPTY_CS = { ride:{}, rideOff:{}, carlog:{records:[],plans:{}}, delivDone:{}, dropDone:{}, att:{} };
    window.__srv = {
      A: { 'data/members': ${JSON.stringify(MEM_A)}, 'data/cars': ${JSON.stringify(CARS)},
           'data/courses': ${JSON.stringify(COURSES)}, 'data/org': ORG_A, 'data/orgDriver': ORG_A,
           'data/migration': { carState:true, at:1 }, 'data/staffAtt': {},
           'carState/car1': JSON.parse(JSON.stringify(EMPTY_CS)),
           'carData/car1': { members: ${JSON.stringify(MEM_A)}, car: ${JSON.stringify(CARS[0])}, courses: ${JSON.stringify(COURSES)} } },
      B: { 'data/members': ${JSON.stringify(MEM_B)}, 'data/cars': ${JSON.stringify(CARS)},
           'data/courses': ${JSON.stringify(COURSES)}, 'data/org': ORG_B, 'data/orgDriver': ORG_B,
           'data/migration': { carState:true, at:1 }, 'data/staffAtt': {},
           'carState/car1': JSON.parse(JSON.stringify(EMPTY_CS)),
           'carData/car1': { members: ${JSON.stringify(MEM_B)}, car: ${JSON.stringify(CARS[0])}, courses: ${JSON.stringify(COURSES)} } }
    };
    window.__writes = []; window.__alerts = [];
    window._db={}; window._fbReady=true;
    function boxOf(org){ window.__srv[org] = window.__srv[org] || {}; return window.__srv[org]; }
    function pathOf(a){ return Array.prototype.slice.call(a,1); }
    window._firestore={
      doc:function(){ var p=pathOf(arguments); return {org:p[1], key:p.slice(2).join('/')}; },
      collection:function(){ var p=pathOf(arguments); return {org:p[1], key:p.slice(2).join('/')}; },
      getDoc:async function(ref){
        var b=boxOf(ref.org); var has=Object.prototype.hasOwnProperty.call(b, ref.key);
        return { exists:function(){return has;}, data:function(){return {value:JSON.stringify(b[ref.key])};} };
      },
      getDocs:async function(ref){
        var b=boxOf(ref.org); var pre=ref.key+'/';
        var ks=Object.keys(b).filter(function(k){ return k.indexOf(pre)===0; });
        return { forEach:function(cb){ ks.forEach(function(k){
          cb({ id:k.slice(pre.length), data:function(){ return {value:JSON.stringify(b[k])}; } }); }); } };
      },
      setDoc:async function(ref,d){ window.__writes.push('set '+ref.org+'/'+ref.key);
        boxOf(ref.org)[ref.key] = (d && d.value!==undefined) ? JSON.parse(d.value) : d; },
      deleteDoc:async function(){},
      runTransaction:async function(db, fn){
        return await fn({ get:async function(ref){ var v=boxOf(ref.org)[ref.key];
            return { exists:function(){return v!==undefined;},
                     data:function(){return {value:JSON.stringify(v)};} }; },
          set:function(ref,d){ window.__writes.push('tx '+ref.org+'/'+ref.key);
                               boxOf(ref.org)[ref.key]=JSON.parse(d.value); } });
      },
      onSnapshot:function(ref,cb){ return function(){}; }
    };
    window.alert=function(m){ window.__alerts.push(String(m)); };
    window.confirm=function(){return true;}; window.open=function(){return null;};
  })();`;
}

async function page(b, qs) {
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
  await p.addInitScript(probe);
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + APP.replace(/\\/g, '/') + (qs || ''), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  p.__errs = errs;
  return p;
}

/* 로그인 흉내 — 실제 앱과 **같은 전역**을 세운다
   (기사·도우미는 `_userOrgId` 를 비워 둔다 — 「로그인 유지」 키가 갈리지 않게) */
const enter = (p, mode, org, skipInit) => p.evaluate(async (a) => {
  const mode = a.mode, org = a.org;
  currentMode = (mode === 'admin') ? 'admin' : 'driver';
  window._userBizType = 'academy';
  window._userPaidUntil = Date.now() + 30 * 86400000;
  if (mode === 'admin') { window._userUid = 'u' + org; window._userOrgId = org;
                          window._isDriverAcct = false; window._isHelperAcct = false; }
  else {
    window._userOrgId = null;
    window._isDriverAcct = true; window._driverOrg = org; window._driverCarId = 'car1';
    window._isHelperAcct = (mode === 'helper');
    window._driverStaffId = (mode === 'helper') ? 'st1' : '';
  }
  const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
  const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
  /* ★ 실제 로그인 길과 같게 — `onAdminLoggedIn`·`onDriverLoggedIn` 은 `initApp()` 을 부른다.
     (`initApp` 이 로컬에서 먼저 읽어 화면을 그리고, 그 안에서 첫 동기화를 시작한다) */
  if (a.skipInit !== true) { try { initApp(); } catch (e) { window.__initErr = String(e && e.message); } }
  await syncFromFirebase();
  await new Promise((r) => setTimeout(r, 400));
}, { mode, org, skipInit: !!skipInit });

const seen = (p) => p.evaluate(() => {
  /* 지금 화면이 보는 값 — 기사·도우미는 차량 사본에서 온다 */
  return { first: String(((loadMembers() || [])[0] || {}).name || ''),
           org: String((loadOrgSettings() || {}).name || ''),
           bank: String((loadOrgSettings() || {}).bankAccount || '') };
});
const boxKeys = (p, pre) => p.evaluate((pre) => {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.indexOf(pre) === 0) out.push(k);
  }
  return out.sort();
}, pre);

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐ 로그인 **전** — 어떤 업체 칸을 건드리나 (표)');
  {
    const p = await page(b, '');
    await p.evaluate(seed());
    await new Promise((r) => setTimeout(r, 600));
    const log = await p.evaluate(() => (window.__box || []).map((x) => x.join(' ')));
    const org = log.filter((x) => /__/.test(x));          /* 꼬리 붙은 = 업체 칸 */
    const uniq = [...new Set(org)].sort();
    uniq.forEach((x) => console.log('      · ' + x));
    if (!uniq.length) console.log('      · (업체 칸을 건드리지 않았다)');
    say(org.filter((x) => x.indexOf('set ') === 0).length === 0,
      '★ 로그인 전 업체 칸 **쓰기 0건**'.padEnd(44) + org.filter((x) => x.indexOf('set ') === 0).length + '건');
    say(uniq.every((x) => /__cosroad_default$/.test(x)),
      '  읽는 칸은 모두 되돌림 꼬리(`cosroad_default`)'.padEnd(44) + (uniq.length ? 'OK' : '없음'));
    say(p.__errs.length === 0, '오류 0'.padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓑ 같은 기기에서 A → B (관리자)');
  {
    const p = await page(b, '');
    await p.evaluate(seed());
    await enter(p, 'admin', 'A');
    const sA = await seen(p);
    say(sA.first === 'A업체 가하은', 'A 로 들어오면 A 명단'.padEnd(44) + sA.first);
    say((await boxKeys(p, 'tkd_members')).join(',') === 'tkd_members__A',
      '★ 칸 이름이 **업체 A**'.padEnd(44) + (await boxKeys(p, 'tkd_members')).join(','));
    /* B 로 바뀐다(실제로는 로그아웃이 화면을 새로 받는다 — v287) */
    await enter(p, 'admin', 'B');
    const sB = await seen(p);
    say(sB.first === 'B업체 나래', '★ B 로 들어오면 **B 명단**'.padEnd(44) + sB.first);
    say(sB.bank === 'B은행 222', '★ 계좌도 B 것'.padEnd(44) + sB.bank);
    const keys = await boxKeys(p, 'tkd_members');
    say(keys.join(',') === 'tkd_members__A,tkd_members__B',
      '★ A 칸은 **그대로 남는다**(지우지 않음)'.padEnd(44) + keys.join(','));
    const kept = await p.evaluate(() => String((JSON.parse(localStorage.getItem('tkd_members__A') || '[]')[0] || {}).name || ''));
    say(kept === 'A업체 가하은', '  A 칸 내용도 그대로'.padEnd(44) + kept);
    const w = await p.evaluate(() => (window.__writes || []).filter((x) => x.indexOf('/data/members') >= 0));
    say(w.every((x) => x.indexOf(' B/') < 0) || true, '  (서버 쓰기 기록)'.padEnd(44) + (w.join(' | ') || '없음'));
    const srvB = await p.evaluate(() => JSON.stringify(window.__srv.B['data/members']));
    say(srvB.indexOf('A업체') < 0, '★ B 서버 명단에 **A 자료가 안 섞였다**'.padEnd(44) + srvB.slice(0, 26));
    say(p.__errs.length === 0, '오류 0'.padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒ 기사·도우미도 갈린다 (`_driverOrg`)');
  for (const mode of ['driver', 'helper']) {
    const p = await page(b, '');
    await p.evaluate(seed());
    await enter(p, mode, 'A');
    const kA = await boxKeys(p, 'tkd_cars');
    say(kA.join(',') === 'tkd_cars__A', ('[' + mode + '] 칸 이름이 업체 A').padEnd(44) + kA.join(','));
    await enter(p, mode, 'B');
    const sB = await seen(p);
    say(sB.first === 'B업체 나래', ('[' + mode + '] ★ B 로 들어오면 **B 명단**').padEnd(44) + sB.first);
    const kB = await boxKeys(p, 'tkd_cars');
    say(kB.join(',') === 'tkd_cars__A,tkd_cars__B',
      ('[' + mode + '] ★ 두 칸이 따로 있다').padEnd(44) + kB.join(','));
    say(p.__errs.length === 0, ('[' + mode + '] 오류 0').padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓓ `?org=_test` — 주소가 이긴다 (종전 그대로)');
  {
    const p = await page(b, '?org=_test');
    await p.evaluate(seed());
    await p.evaluate(() => { window.__srv._test = JSON.parse(JSON.stringify(window.__srv.A)); });
    await enter(p, 'admin', 'B');            /* 계정은 B 인데 주소가 `_test` 다 */
    const keys = await boxKeys(p, 'tkd_members');
    say(keys.join(',') === 'tkd_members___test',
      '★ 칸 이름이 **주소의 `_test`**'.padEnd(44) + keys.join(','));
    const s = await seen(p);
    say(s.first === 'A업체 가하은', '  `_test` 서버 자료가 보인다'.padEnd(44) + s.first);
    say(p.__errs.length === 0, '오류 0'.padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓔ 둘러보기(`?org=academy_demo`) — 로컬에도 안 쓴다 (종전 그대로)');
  {
    const p = await page(b, '?org=academy_demo');
    await p.evaluate(seed());
    const r = await p.evaluate(() => {
      currentMode = 'admin';
      const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
      const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
      localStorage.setItem('tkd_members', JSON.stringify([{ id: 9, name: '데모가짜' }]));
      return { n: JSON.parse(localStorage.getItem('tkd_members') || '[]').length,
               demo: (typeof isDemoMode === 'function') ? isDemoMode() : null };
    });
    say(r.demo === true, '둘러보기로 인식된다'.padEnd(44) + String(r.demo));
    say(r.n === 0, '★ 업체 칸을 **로컬에도 안 쓴다**'.padEnd(44) + r.n + '건');
    const keys = await boxKeys(p, 'tkd_members');
    say(keys.length === 0, '  그 업체 칸이 아예 없다'.padEnd(44) + (keys.join(',') || '없음'));
    say(p.__errs.length === 0, '오류 0'.padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓕ 갓 만든 업체(서버에 자료가 없다) — 앞 업체 명단이 남지 않나');
  {
    /* 서버에 `data/members` 가 **없으면** 동기화의 `if(fbMembers)` 가 로컬을 덮지 않는다.
       글 맨 위에서 **로그인 전에** 읽어 둔 값(옛 칸 = 앞 업체)이 메모리에 남아 있으면
       갓 만든 업체 화면에 **앞 업체 명단**이 뜬다 — v292 는 `initApp()` 에서 다시 읽어 버린다. */
    const mk = async () => {
      const q = await page(b, '');
      await q.evaluate(seed());
      await q.evaluate(() => {
        window.__srv.C = { 'data/org': { name: 'C학원', icon: '🅲', bizType: 'academy' },
                           'data/migration': { carState: true, at: 1 } };
        /* 로그인 전에 읽힌 값이 **앞 업체 것**이었던 상황(옛 칸에 자료가 있던 폰) */
        localStorage.setItem('tkd_members__cosroad_default', JSON.stringify([{ id: 1, name: 'A업체 가하은' }]));
        members = JSON.parse(localStorage.getItem('tkd_members__cosroad_default'));
      });
      return q;
    };
    const p = await mk();
    await enter(p, 'admin', 'C');
    const s1 = await p.evaluate(() => ({ n: (members || []).length,
      first: String(((members || [])[0] || {}).name || ''),
      org: String((loadOrgSettings() || {}).name || '') }));
    say(s1.n === 0, '★ 갓 만든 업체 화면의 «회원» 수'.padEnd(44) + s1.n + '명 (' + (s1.first || '없음') + ')');
    say(s1.org === 'C학원', '  업체 이름은 서버에서 온다'.padEnd(44) + s1.org);
    /* 대조 — `initApp()` 을 건너뛰면(= v292 한 줄이 없는 자리와 같다) **남는다** */
    const p2 = await mk();
    await enter(p2, 'admin', 'C', true);
    const s2 = await p2.evaluate(() => ({ n: (members || []).length,
      first: String(((members || [])[0] || {}).name || '') }));
    say(s2.first === 'A업체 가하은',
      '  (대조) 다시 읽지 않으면 **앞 업체 명단이 남는다**'.padEnd(44) + s2.n + '명 (' + (s2.first || '없음') + ')');
    say(p.__errs.length === 0, '오류 0'.padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close(); await p2.close();
  }

  await b.close();
  console.log(bad ? '\nX 문제 ' + bad + '건' : '\n✔ 전부 통과');
  process.exit(bad ? 1 : 0);
})();
