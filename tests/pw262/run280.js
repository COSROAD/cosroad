/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v280(코스로드49 = 43-A) 실제 크롬 — 차량관리 「동승 도우미」 · 직원 PIN 칸 ·
   PIN 패드 직원(서버가 가려 줌) · 기사 로그인 첫 화면(42 회귀).
   ★ 대조: 고치기 전(d14e1c2)에는 동승 도우미 칸이 **없고**, 직원 편집 창에 **평문 PIN 이 보인다**.
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');
const APP = '' + COS_ROOT + '/index.html';
const OLD_REF = process.env.COS_SRC_OLD_REF || 'd14e1c2';   /* v279 */
const OLD = path.join(__dirname, 'old_index280.html');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
  location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1', pin: '1001' }];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-9-1' },
              { id: 'car2', name: '2호차', driver: '김기사', phone: '010-9-2' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
/* 최직원 = 옛 평문 PIN(아직 안 옮긴 업체) · 한도움 = 이미 옮긴 직원(hasPin) · 무핀 = PIN 없음 */
const STAFF = [
  { id: 'st1', name: '최직원', phone: '010-7', pin: '7777', hourlyWage: 12000, mealAllow: 0, taxMode: 'free33', breakAuto: true },
  { id: 'st2', name: '한도움', phone: '010-8', hasPin: true, hourlyWage: 11000, mealAllow: 0, taxMode: 'free33', breakAuto: true },
  { id: 'st3', name: '무핀씨', phone: '010-9', hourlyWage: 10000, mealAllow: 0, taxMode: 'free33', breakAuto: true }
];

function seed(biz) {
  return `(function(){
    var ORG = { name:'가온', icon:'🚐', bizType:'${biz}', destName:'학원',
                destLat:37.4467, destLon:126.6516, tel:'032-111-2222' };
    var SERVER = { members: ${JSON.stringify(MEMBERS)}, cars: ${JSON.stringify(CARS)},
                   courses: ${JSON.stringify(COURSES)}, org: ORG, orgDriver: ORG,
                   staff: ${JSON.stringify(STAFF)}, migration: { carState:true, at:1 }, staffAtt: {} };
    window.__srv = { car1: { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},
                             delivDone:{}, dropDone:{}, att:{} },
                     car2: { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},
                             delivDone:{}, dropDone:{}, att:{} } };
    window.__api = []; window.__writes = []; window.__alerts = [];
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
      setDoc:async function(ref,d){
        window.__writes.push(ref.col+'/'+ref.key);
        if(ref.col==='data' && d && d.value!==undefined) SERVER[ref.key]=JSON.parse(d.value);
      },
      deleteDoc:async function(){},
      /* ★★ v318(72-D): 트랜잭션 가짜도 **그 컬렉션의 문서**를 읽고 쓴다.
         v317 까지는 carState(window.__srv)만 보고 set 은 **아무것도 저장하지 않았다** —
         그래서 data/cars 패치 쓰기가 「서버에 그 문서가 없다」로 보여 합친 값이 반쪽이었다.
         v318 부터 앱이 **합친 값을 폰에도 넣으므로**, 가짜가 엉성하면 그 반쪽이 폰에 들어와
         이 묶음이 ④⑤에서 거짓 실패했다(실제 앱은 서버 값을 제대로 읽는다). */
      runTransaction:async function(db, fn){
        return await fn({ get:async function(ref){
            var src = ref.col==='carState' ? window.__srv : SERVER;
            var v = src[ref.key];
            return { exists:function(){return v!==undefined;},
                     data:function(){return {value:JSON.stringify(v)};} };
          }, set:function(ref,d){ window.__writes.push('tx '+ref.col+'/'+ref.key);
            var dst = ref.col==='carState' ? window.__srv : SERVER;
            if(d && d.value!==undefined) dst[ref.key] = JSON.parse(d.value); } });
      },
      onSnapshot:function(){ return function(){}; }
    };
    window.alert=function(m){ window.__alerts.push(String(m)); };
    window.confirm=function(){ return true; };
    window.prompt=function(){ return '4444'; };
    window.open=function(){return null;};
  })();`;
}

async function adminPage(b, w, h, file, biz) {
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
  const js = seed(biz);
  if (js.indexOf('(function(){') !== 0) throw new Error('seed 틀이 끊겼다');
  await p.evaluate(js);
  if (!(await p.evaluate(() => !!(window._db && window.__srv)))) throw new Error('가짜 Firestore 안 깔림');
  await p.evaluate(async (biz) => {
    ['tkd_members__cosroad_default','tkd_cars__cosroad_default','tkd_courses__cosroad_default',
     'tkd_staff__cosroad_default','tkd_driver_att__cosroad_default']
      .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
    currentMode = 'admin';
    window._userOrgId = 'cosroad_default'; window._userUid = 'u1'; window._userBizType = biz;
    window._userPaidUntil = Date.now() + 30 * 86400000;
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    await syncFromFirebase();
    await new Promise((r) => setTimeout(r, 300));
    /* 서버 api 는 바깥 통신이라 막혀 있다 — 부른 내용을 적고 성공으로 답한다 */
    window.driverAcctApi = async function(body){
      window.__api.push(body);
      if (body.action === 'checkPinDup') return { ok: true, dup: false };
      if (body.action === 'driverInfo')   return { ok: true, info: {} };
      return { ok: true };
    };
    _drvInfoLoaded = true;                    /* 기사 로그인 상태 읽기는 건너뛴다 */
  }, biz);
  p.__errs = errs;
  return p;
}

const carsScreen = (p) => p.evaluate(() => {
  switchTab('admin'); currentAdminTab = 'cars'; renderAdminTab('cars');
  const c = document.getElementById('admin-content');
  const sel = c ? c.querySelector('select[onchange*="setCarHelperAsk"]') : null;
  let opts = [], disabled = [];
  if (sel) {
    opts = Array.from(sel.options).map((o) => o.textContent.trim());
    disabled = Array.from(sel.options).filter((o) => o.disabled).map((o) => o.textContent.trim());
  }
  const box = sel ? sel.getBoundingClientRect() : null;
  return {
    있나: !!sel, 보기: opts, 못고름: disabled,
    글: (c ? c.textContent || '' : '').replace(/\s+/g, ' ').indexOf('동승 도우미') >= 0,
    폭: box ? Math.round(box.width) : 0,
    넘침: sel ? (sel.scrollWidth > sel.clientWidth + 2) : false
  };
});

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('① ★ 대조 — 고치기 전(' + OLD_REF + ')');
  {
    const p = await adminPage(b, 390, 844, OLD, 'academy');
    const r = await carsScreen(p);
    say(r.있나 === false, '[옛] 동승 도우미 칸이 **없다**'.padEnd(44) + r.있나);
    const v = await p.evaluate(() => { openStaffEdit('st1');
      const el = document.getElementById('st-pin'); return el ? el.value : '(없음)'; });
    say(v === '7777', '[옛] 직원 편집 창에 **평문 PIN 이 보인다**'.padEnd(44) + v);
    await p.close();
  }

  console.log('\n② v280 — 차량관리 「동승 도우미」 (학원 · 네 크기)');
  for (const [w, h] of SIZES) {
    const p = await adminPage(b, w, h, APP, 'academy');
    const r = await carsScreen(p);
    const tag = '[' + w + 'x' + h + '] ';
    say(r.있나 && r.글, (tag + '칸이 보인다 ★').padEnd(44) + (r.있나 ? 'OK' : '없음'));
    say(r.보기.join(',') === '없음,최직원,한도움,무핀씨 (PIN 없음)',
      (tag + '직원 목록').padEnd(44) + r.보기.join(','));
    say(r.못고름.join(',') === '무핀씨 (PIN 없음)',
      (tag + 'PIN 없는 직원은 **못 고른다** ★').padEnd(44) + (r.못고름.join(',') || '없음'));
    say(!r.넘침 && r.폭 > 100, (tag + '안 잘린다').padEnd(44) + '폭 ' + r.폭 + 'px');
    say(p.__errs.length === 0, (tag + '오류 0').padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n③ 물류·택배에는 칸이 없다 (학원·공공만)');
  for (const biz of ['logistics', 'delivery', 'public']) {
    const p = await adminPage(b, 390, 844, APP, biz);
    const r = await carsScreen(p);
    const want = (biz === 'public');
    say(r.있나 === want, ('[' + biz + '] 칸 ' + (want ? '있음' : '없음')).padEnd(44) + r.있나);
    await p.close();
  }

  console.log('\n④ 도우미를 고르면 서버로 가고 화면 값도 남는다');
  {
    const p = await adminPage(b, 390, 844, APP, 'academy');
    await carsScreen(p);
    const r = await p.evaluate(async () => {
      window.__api = [];
      await setCarHelperAsk('car1', 'st2');
      await new Promise((x) => setTimeout(x, 300));
      return { 부른것: window.__api.filter((a) => a.action === 'setCarHelper'),
               차량: (loadCars().find((c) => c.id === 'car1') || {}).helperStaffId || '' };
    });
    say(r.부른것.length === 1 && r.부른것[0].staffId === 'st2' && r.부른것[0].carId === 'car1',
      'setCarHelper 가 서버로 간다 ★'.padEnd(44) + JSON.stringify(r.부른것[0] || null));
    say(r.차량 === 'st2', '차량에 helperStaffId 가 남는다'.padEnd(44) + r.차량);
    /* 떼기 */
    const r2 = await p.evaluate(async () => {
      window.__api = [];
      await setCarHelperAsk('car1', '');
      await new Promise((x) => setTimeout(x, 300));
      return { 부른것: window.__api.filter((a) => a.action === 'setCarHelper'),
               차량: (loadCars().find((c) => c.id === 'car1') || {}).helperStaffId || '(없음)' };
    });
    say(r2.부른것[0] && r2.부른것[0].staffId === '', '「없음」도 서버로 간다'.padEnd(44) + JSON.stringify(r2.부른것[0] || null));
    say(r2.차량 === '(없음)', '화면 값도 지워진다'.padEnd(44) + r2.차량);
    await p.close();
  }

  console.log('\n⑤ 직원 편집 — 평문 PIN 이 **안 보인다** · 서버로 저장');
  {
    const p = await adminPage(b, 390, 844, APP, 'academy');
    const r = await p.evaluate(async () => {
      openStaffEdit('st1');
      const el = document.getElementById('st-pin');
      /* ★ **편집 창 안**만 본다 — 처음엔 document.body 를 봤다가 샘플 전화번호
         `010-7777-8888` 에 걸려 거짓 실패가 났다(오탐). 검사 범위를 좁히는 게 맞다. */
      const sheet = document.getElementById('staffEditSheet');
      const txt = ((sheet || document.body).textContent || '').replace(/\s+/g, ' ');
      const i = txt.indexOf('7777');
      /* 입력칸 value 는 textContent 에 안 들어가므로 **칸 값도** 따로 본다 */
      const vals = Array.from((sheet || document).querySelectorAll('input')).map((x) => x.value).join('|');
      return { 값: el ? el.value : '(없음)', 설정됨: /PIN 설정됨/.test(txt),
               평문노출: i >= 0 || vals.indexOf('7777') >= 0,
               어디: i >= 0 ? txt.slice(Math.max(0, i - 30), i + 10) : (vals.indexOf('7777') >= 0 ? '입력칸:' + vals.slice(0, 40) : '') };
    });
    say(r.값 === '', 'PIN 칸이 비어 있다 ★'.padEnd(44) + '"' + r.값 + '"');
    say(r.설정됨, '「PIN 설정됨」이 보인다'.padEnd(44) + r.설정됨);
    say(!r.평문노출, '화면 어디에도 평문이 없다 ★'.padEnd(44) + (r.평문노출 ? ('보임 → ' + r.어디) : 'OK'));
    const s = await p.evaluate(async () => {
      document.getElementById('st-pin').value = '4444';
      window.__api = [];
      await saveStaffEdit('st1');
      await new Promise((x) => setTimeout(x, 300));
      const st = loadStaff().find((x) => x.id === 'st1') || {};
      return { 부른것: window.__api.filter((a) => a.action === 'setStaffPin'),
               저장된평문: st.pin === undefined ? '(없음)' : st.pin, hasPin: st.hasPin === true };
    });
    say(s.부른것.length === 1 && s.부른것[0].pin === '4444',
      'setStaffPin 이 서버로 간다 ★'.padEnd(44) + JSON.stringify(s.부른것[0] || null));
    say(s.저장된평문 === '(없음)', '앱 자료에 평문을 **안 남긴다** ★'.padEnd(44) + s.저장된평문);
    say(s.hasPin, 'hasPin 만 남는다'.padEnd(44) + s.hasPin);
    await p.close();
  }

  console.log('\n⑥ PIN 패드 — 서버가 「직원」이라고 하면 그대로 출퇴근');
  {
    const p = await adminPage(b, 390, 844, APP, 'academy');
    const r = await p.evaluate(async () => {
      window.padDriverPinApi = async function(){ return { ok:true, kind:'staff', staffId:'st2' }; };
      switchTab('admin'); currentAdminTab = 'attendance'; renderAdminTab('attendance');
      /* ★ v293(60-B1): 판이 **둘로 갈렸다** — 직원 출퇴근은 **근태 판**('work')에서 찍는다.
         인자를 안 주면 출결 판이라 「🚚 기사·직원 PIN 이에요」 안내만 뜨고 **기록되지 않는다**
         (그렇게 바꾼 것이 60-B1 의 목적이다). */
      openPinCheckin('work');
      await new Promise((x) => setTimeout(x, 150));
      pinInput = '8888';
      await checkPin();
      await new Promise((x) => setTimeout(x, 300));
      const el = document.getElementById('pin-result');
      return { 결과: el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '',
               근태: localStorage.getItem('tkd_driver_att') || '{}' };
    });
    say(/한도움/.test(r.결과) && /출근/.test(r.결과), '직원 출근이 찍힌다 ★'.padEnd(44) + r.결과.slice(0, 26));
    say(/st2_/.test(r.근태), '직원 근태 키(st2_…)로 기록'.padEnd(44) + r.근태.slice(0, 28));
    await p.close();
  }

  console.log('\n⑦ 기사 로그인 → 첫 화면 (42 회귀)');
  {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e && e.message)));
    await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
    await p.goto('file:///' + APP.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
    await p.evaluate(seed('academy'));
    const r = await p.evaluate(async () => {
      window._userOrgId = 'cosroad_default';
      window._isDriverAcct = true; window._driverCarId = 'car1'; window._driverOrg = 'cosroad_default';
      window._userUid = 'drv_cosroad_default_car1'; window._userBizType = null;
      onDriverLoggedIn();
      await new Promise((x) => setTimeout(x, 2200));
      driveLeg = 'pickup'; switchTab('drive'); renderDrive();
      return { 막힘: !!document.getElementById('driver-blocked'),
               목록: getActiveStudents().map((x) => x.name).join(',') };
    });
    say(r.막힘 === false, '막힘 화면 0'.padEnd(44) + 'OK');
    say(r.목록.length > 0, '운행 목록'.padEnd(44) + (r.목록 || '(빈 목록)'));
    say(errs.length === 0, '오류 0'.padEnd(44) + (errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n⑧ 범위·버전');
  {
    /* ★ v281(코스로드50): 이 묶음은 **49 회차 기록**이다 — 범위를 **두 커밋 사이**로 못 박는다.
       전에는 `git diff <앞커밋>` 하나만 써서 **작업트리까지** 쟀고, 다음 회차(50)의 변경이
       거짓 실패로 들어왔다(실제로 3건 났다 — CLAUDE.md 검사 묶음 규칙 그대로). */
    const NEW_REF = process.env.COS_SRC_NEW_REF || '766347e';   /* v280 */
    const names = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' ' + NEW_REF)
      .toString().trim().split('\n').filter(Boolean).sort();
    say(names.join(',') === 'CLAUDE.md,api/admin-account.js,api/driver-auth.js,index.html,version.json',
      '바뀐 파일   ' + names.join(','));
    const rl = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + OLD_REF + ' ' + NEW_REF
      + ' -- firestore.rules lib s.html home.html terms.html privacy.html').toString().trim();
    say(rl === '', '규칙·lib·정적 diff 0   ' + (rl || '(변경 없음)'));
    const show = (p) => cp.execSync('git -C ' + COS_ROOT + ' show ' + NEW_REF + ':' + p,
      { maxBuffer: 1 << 26 }).toString();
    const vj = JSON.parse(show('version.json'));
    const av = /const APP_VERSION = (\d+);/.exec(show('index.html'))[1];
    say(vj.version === 280 && av === '280', '버전 280   ' + vj.version + ' · ' + av);
  }

  await b.close();
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 · Firestore·서버 api 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
