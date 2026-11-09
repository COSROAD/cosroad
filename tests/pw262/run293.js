/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v293(코스로드60-B1) 실제 크롬 — **판 분리 + 덮개 규칙(v262)**.
   ⓐ 두 단추가 **다른 판**을 연다(`pinPadKind`) · 닫으면 출결 판으로 돌아간다
   ⓑ ★ 덮개 — 출석 성공 화면이 붙어 상자가 길어져도 **닫기 ✕ 가 화면 안**에 있다
      (고치기 전 실측: 390×667 에서 상자 top -66px · ✕ -50px · 위로 스크롤 **안 됨**)
   ⓒ 남의 판 PIN 은 **기록 0 + 안내** (실제 화면에서 눌러 본다)
   ⓓ 뒤로가기로 닫힌다(`BACK_PANEL_IDS` 그대로) · 오류 0
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');

const APP = '' + COS_ROOT + '/index.html';
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
               location: 'A주소', lat: 37.41, lon: 126.68, phone: '010-1', pin: '1111' }];
const CARS = [{ id: 'car1', name: '1호차', driver: '', phone: '', plate: '' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const STAFF = [{ id: 'st1', name: '최직원', hourlyWage: 10000, taxMode: 'free33' }];

function seed() {
  return `(function(){
    var ORG = { name:'가온학원', icon:'🅰', bizType:'academy', destName:'가온학원',
                destLat:37.4467, destLon:126.6516, tel:'032-111-2222' };
    var BOX = { 'data/members': ${JSON.stringify(MEM)}, 'data/cars': ${JSON.stringify(CARS)},
                'data/courses': ${JSON.stringify(COURSES)}, 'data/staff': ${JSON.stringify(STAFF)},
                'data/org': ORG, 'data/orgDriver': ORG, 'data/migration': { carState:true, at:1 },
                'data/staffAtt': {},
                'carState/car1': { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},
                                   delivDone:{}, dropDone:{}, att:{} } };
    window.__srv = { B: BOX };
    window.__writes = []; window.__alerts = []; window.__api = [];
    window._db = {}; window._fbReady = true;
    function boxOf(org){ window.__srv[org] = window.__srv[org] || {}; return window.__srv[org]; }
    function pathOf(a){ return Array.prototype.slice.call(a,1); }
    window._firestore = {
      doc:function(){ var p=pathOf(arguments); return {org:p[1], key:p.slice(2).join('/')}; },
      collection:function(){ var p=pathOf(arguments); return {org:p[1], key:p.slice(2).join('/')}; },
      getDoc:async function(ref){ var b=boxOf(ref.org);
        var has=Object.prototype.hasOwnProperty.call(b, ref.key);
        return { exists:function(){return has;}, data:function(){return {value:JSON.stringify(b[ref.key])};} }; },
      getDocs:async function(ref){ var b=boxOf(ref.org); var pre=ref.key+'/';
        var ks=Object.keys(b).filter(function(k){ return k.indexOf(pre)===0; });
        return { forEach:function(cb){ ks.forEach(function(k){
          cb({ id:k.slice(pre.length), data:function(){ return {value:JSON.stringify(b[k])}; } }); }); } }; },
      setDoc:async function(ref,d){ window.__writes.push('set '+ref.org+'/'+ref.key);
        boxOf(ref.org)[ref.key] = (d && d.value!==undefined) ? JSON.parse(d.value) : d; },
      deleteDoc:async function(){},
      runTransaction:async function(db, fn){
        return await fn({ get:async function(ref){ var v=boxOf(ref.org)[ref.key];
            return { exists:function(){return v!==undefined;},
                     data:function(){return {value:JSON.stringify(v)};} }; },
          set:function(ref,d){ window.__writes.push('tx '+ref.org+'/'+ref.key);
                               boxOf(ref.org)[ref.key]=JSON.parse(d.value); } }); },
      onSnapshot:function(){ return function(){}; }
    };
    /* 서버 창구 흉내 — '2222' 는 **직원** PIN · probe 면 **기록 없이 kind 만** */
    window.fetch = function(url, init){
      var body = {}; try{ body = JSON.parse((init&&init.body)||'{}'); }catch(e){}
      window.__api.push(body);
      var out = { ok:false };
      if(body.action === 'pinCheckin'){
        if(String(body.pin) === '2222'){
          out = (body.probe === true) ? { ok:true, kind:'staff', probe:true }
                                      : { ok:true, kind:'staff', staffId:'st1', date:'2026-11-09' };
          if(body.probe !== true) window.__api.push({ _serverPunch: body.pin });
        } else { out = { ok:false, why:'notdriver', message:'기사 PIN 이 아니에요.' }; }
      } else if(body.action === 'checkPinDup'){
        out = (String(body.pin)==='2222') ? { ok:true, dup:true, kind:'staff', staffId:'st1' }
                                          : { ok:true, dup:false };
      }
      return Promise.resolve({ ok:true, json:function(){ return Promise.resolve(out); } });
    };
    /* ★ 판이 서버에 묻는 길(padDriverPinApi)은 **로그인된 계정**을 먼저 본다 —
       가짜 토큰을 세워 두지 않으면 「계정으로 로그인한 뒤에 쓸 수 있어요」만 뜬다(처음에 그랬다).
       ★ 이 쪽지에 **역따옴표를 쓰지 않는다** — seed() 가 역따옴표 문자열이라 거기서 끊긴다. */
    window._auth = { currentUser: { isAnonymous:false, getIdToken:function(){ return Promise.resolve('tok'); } } };
    window.alert=function(m){ window.__alerts.push(String(m)); };
    window.confirm=function(){return true;}; window.open=function(){return null;};
    /* 「누른 PIN 판 결과」를 모아 둔다 — 안내는 1.5~3초 뒤 지워지므로 쓰기를 적어 둔다 */
    window.__padMsgs = [];
    var _el = document.getElementById('pin-result');
    var _own = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(_el, 'innerHTML', {
      get: function(){ return _own.get.call(this); },
      set: function(v){ var t=String(v).replace(/<[^>]*>/g,'').trim();
                        if(t) window.__padMsgs.push(t); _own.set.call(this, v); }
    });
  })();`;
}

async function page(b, vp) {
  const p = await b.newPage({ viewport: vp || { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    /* 가짜 서버가 `{ok:false}` 를 돌려주니 출석 알림톡이 실패한다 — 스텁 때문이다(앱 오류 아님) */
    if (/알림톡 실패/.test(t) || /문자 전송 실패/.test(t)) return;
    errs.push(t.slice(0, 130));
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + APP.replace(/\\/g, '/') + '', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(seed());
  await p.evaluate(async () => {
    currentMode = 'admin'; window._userOrgId = 'B'; window._userUid = 'uB';
    window._userBizType = 'academy'; window._userPaidUntil = Date.now() + 30 * 86400000;
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    initApp();
    await syncFromFirebase();
    await new Promise((r) => setTimeout(r, 300));
  });
  p.__errs = errs;
  return p;
}

/* 판을 열고 PIN 을 눌러 본다 — 실제 단추(숫자판)를 누른다 */
const press = (p, kind, pin) => p.evaluate(async (a) => {
  window.__padMsgs = [];
  openPinCheckin(a.kind);
  /* ★ 숫자 넷을 누르면 `pinPress` 가 **스스로** 0.2초 뒤에 `checkPin()` 을 부른다 —
     여기서 또 부르면 **두 번** 돌아 서버 호출 수가 어긋난다(처음에 probe 가 2로 나왔다). */
  for (const ch of String(a.pin)) pinPress(ch);
  await new Promise((r) => setTimeout(r, 700));
  return { msgs: window.__padMsgs.slice(),
           att: Object.keys((loadAttendance()[todayStr()] || {})).length,
           staff: Object.keys(loadDriverAtt()).length,
           kind: pinPadKind };
}, { kind, pin });

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐ 두 단추가 다른 판을 연다');
  {
    const p = await page(b);
    const r = await p.evaluate(() => {
      const out = {};
      openPinCheckin('member'); out.m = pinPadKind;
      closePinCheckin();        out.afterClose = pinPadKind;
      openPinCheckin('work');   out.w = pinPadKind;
      closePinCheckin();
      /* 화면에 실제로 그려진 단추의 onclick 을 본다 */
      switchAdminTab('attendance');
      const b1 = [...document.querySelectorAll('button')].find((x) => /PIN 체크인 모드 열기/.test(x.textContent||''));
      out.attBtn = b1 ? String(b1.getAttribute('onclick')||'') : '(없음)';
      return out;
    });
    say(r.m === 'member', '출결 단추 → `member`'.padEnd(44) + r.m);
    say(r.w === 'work', '근태 단추 → `work`'.padEnd(44) + r.w);
    say(r.afterClose === 'member', '닫으면 **출결 판으로 되돌린다**'.padEnd(44) + r.afterClose);
    say(/openPinCheckin\('member'\)/.test(r.attBtn), '★ 화면의 출결 단추가 종류를 준다'.padEnd(44) + r.attBtn.slice(0, 30));
    say(p.__errs.length === 0, '오류 0'.padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓑ ★ 덮개 — 상자가 길어도 **닫기 ✕ 가 화면 안**에 (v262)');
  for (const vp of [{ width: 390, height: 844 }, { width: 390, height: 667 }, { width: 360, height: 640 }]) {
    const p = await page(b, vp);
    const r = await p.evaluate(() => {
      openPinCheckin('member');
      /* 출석 성공 화면(사진+글)까지 붙은 **가장 긴** 상태 */
      document.getElementById('pin-result').innerHTML =
        '<div style="text-align:center;padding:20px;">'
        + '<div style="width:80px;height:80px;border-radius:50%;background:#eee;margin:0 auto 12px;"></div>'
        + '<div style="font-size:48px;margin-bottom:8px;">O</div>'
        + '<div style="font-size:22px;font-weight:800;">출석 완료!</div>'
        + '<div style="font-size:18px;font-weight:700;">가하은</div>'
        + '<div style="font-size:13px;margin-top:4px;">15:02 도착</div></div>';
      const ov = document.getElementById('pin-checkin-modal');
      const box = ov.firstElementChild;
      const x = box.querySelector('button');
      const bb = box.getBoundingClientRect(), xb = x.getBoundingClientRect();
      const canScrollDown = ov.scrollHeight > ov.clientHeight;
      return { boxTop: Math.round(bb.top), boxH: Math.round(bb.height), xTop: Math.round(xb.top),
               canScrollDown: canScrollDown, align: getComputedStyle(ov).alignItems,
               overflowY: getComputedStyle(ov).overflowY };
    });
    const tag = '[' + vp.width + 'x' + vp.height + '] ';
    say(r.xTop >= 0, (tag + '★ 닫기 ✕ 가 화면 안').padEnd(44) + 'top ' + r.xTop + 'px');
    say(r.boxTop >= 0, (tag + '상자 위가 안 잘린다').padEnd(44) + 'top ' + r.boxTop + 'px (높이 ' + r.boxH + ')');
    say(r.align === 'flex-start', (tag + '덮개 `flex-start`').padEnd(44) + r.align);
    say(r.overflowY === 'auto', (tag + '덮개 `overflow-y:auto`').padEnd(44) + r.overflowY);
    say(p.__errs.length === 0, (tag + '오류 0').padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒ 남의 판 PIN — 기록 0 + 안내 (실제 숫자판으로)');
  {
    const p = await page(b);
    const r1 = await press(p, 'member', '2222');          /* 출결 판에 직원 PIN */
    say(r1.staff === 0 && r1.att === 0, '★ 출결 판 + 직원 PIN — 기록 0'.padEnd(44)
      + '출석 ' + r1.att + ' · 근태 ' + r1.staff);
    say(r1.msgs.some((m) => /근태/.test(m)), '★ 안내가 뜬다'.padEnd(44) + (r1.msgs.join(' | ').slice(0, 30) || '없음'));
    const probe = await p.evaluate(() => (window.__api || []).filter((x) => x.probe === true).length);
    const punch = await p.evaluate(() => (window.__api || []).filter((x) => x._serverPunch).length);
    say(probe === 1 && punch === 0, '★ 서버에 **probe 로만** 물었다'.padEnd(44) + 'probe ' + probe + ' · 기록 ' + punch);

    const r2 = await press(p, 'work', '1111');            /* 근태 판에 회원 PIN */
    say(r2.att === 0 && r2.staff === 0, '★ 근태 판 + 회원 PIN — 기록 0'.padEnd(44)
      + '출석 ' + r2.att + ' · 근태 ' + r2.staff);
    say(r2.msgs.some((m) => /출결|출석/.test(m)), '★ 안내가 뜬다'.padEnd(44) + (r2.msgs.join(' | ').slice(0, 30) || '없음'));

    /* 자기 판은 그대로 된다 */
    const r3 = await press(p, 'member', '1111');
    say(r3.att === 1, '★ 출결 판 + 회원 PIN → 출석 1건'.padEnd(44) + r3.att + '건');
    say(r3.msgs.some((m) => /가하은/.test(m)), '  이름이 보인다'.padEnd(44) + (r3.msgs.join(' | ').slice(0, 24) || '없음'));
    const r4 = await press(p, 'work', '2222');
    say(r4.staff === 1, '★ 근태 판 + 직원 PIN → 근태 1건'.padEnd(44) + r4.staff + '건');
    say(p.__errs.length === 0, '오류 0'.padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓓ 뒤로가기로 닫힌다 · 「🔍 PIN 겹침 찾기」가 화면에 있다');
  {
    const p = await page(b);
    await p.evaluate(() => { openPinCheckin('member'); });
    /* ★ 뒤로가기 장치(v269)는 창이 열린 뒤 **조금 있다가** history 칸을 넣는다(watcher) —
       넣기 전에 `history.back()` 을 부르면 **문서를 떠난다**(처음에 그렇게 깨졌다). */
    await new Promise((r) => setTimeout(r, 600));
    const pushed = await p.evaluate(() => history.state && history.state.cosPanel);
    const open1 = await p.evaluate(() => document.getElementById('pin-checkin-modal').classList.contains('show'));
    say(!!pushed, 'history 칸이 들어갔다'.padEnd(44) + String(pushed));
    /* ★ 뒤로가기는 **같은 문서 안에서** 일어난다(앱이 `pushState` 로 덮개를 쌓는다) —
       Playwright 의 `goBack()` 은 문서를 떠날 수 있어 `history.back()` 을 화면 안에서 부른다. */
    await p.evaluate(() => { history.back(); });
    await new Promise((r) => setTimeout(r, 500));
    const open2 = await p.evaluate(() => {
      const el = document.getElementById('pin-checkin-modal');
      return el ? el.classList.contains('show') : 'element-없음';
    });
    say(open1 === true, '판이 열렸다'.padEnd(44) + String(open1));
    say(open2 === false, '★ 뒤로가기로 닫혔다'.padEnd(44) + String(open2));
    const dup = await p.evaluate(() => {
      switchAdminTab('cars');
      const b2 = [...document.querySelectorAll('button')].find((x) => /PIN 겹침 찾기/.test(x.textContent || ''));
      return b2 ? String(b2.getAttribute('onclick') || '') : '(없음)';
    });
    say(/pinDupScanRun/.test(dup), '★ 겹침 찾기 단추가 있다'.padEnd(44) + dup);
    say(p.__errs.length === 0, '오류 0'.padEnd(44) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log(bad ? '\nX 문제 ' + bad + '건' : '\n✔ 전부 통과');
  process.exit(bad ? 1 : 0);
})();
