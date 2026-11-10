/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v297(코스로드60-B4b) 실제 크롬 390×844 — **출석 전용 기기 화면**.
   ⓐ 로그인 화면에 입구가 **셋**(기사·관리자·🎫 출석 기기) · 고른 탭을 기억한다
   ⓑ 출석 기기로 들어가면 **PIN 판만** 나온다 — 관리 화면·명단·운행 **0**
   ⓒ PIN 을 누르면 **기기 창구**(`kioskCheckin`)만 부른다 · 이름·시각이 뜬다 ·
      앱이 `data/attendance` 로 **직접 쓰지 않는다** · **알림톡을 앱이 보내지 않는다**(서버가 보낸다)
   ⓓ 기기에 **명단이 안 들어온다**(업체 칸 0 · Firestore 읽기 0)
   ⓔ 관리자 화면에 「🎫 출석 전용 기기」 칸이 있다
   바깥 요청 전부 차단 · Firestore·서버 api 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');

const APP = '' + COS_ROOT + '/index.html';

/* 가짜 서버 — 백틱을 쓰지 않는다(v275 교훈) */
function seed() {
  return '(function(){\n'
    + '  window.__api = []; window.__reads = []; window.__writes = []; window.__alerts = [];\n'
    + '  window._db = {}; window._fbReady = true;\n'
    + '  window._firestore = {\n'
    + '    doc:function(){ var p=Array.prototype.slice.call(arguments,1); return {path:p.join("/")}; },\n'
    + '    collection:function(){ var p=Array.prototype.slice.call(arguments,1); return {path:p.join("/")}; },\n'
    + '    getDoc:async function(ref){ window.__reads.push(ref.path);\n'
    + '      var e=new Error("Missing or insufficient permissions."); e.code="permission-denied"; throw e; },\n'
    + '    getDocs:async function(ref){ window.__reads.push(ref.path+"/*");\n'
    + '      var e=new Error("Missing or insufficient permissions."); e.code="permission-denied"; throw e; },\n'
    + '    setDoc:async function(ref){ window.__writes.push("set "+ref.path);\n'
    + '      var e=new Error("Missing or insufficient permissions."); e.code="permission-denied"; throw e; },\n'
    + '    deleteDoc:async function(){}, runTransaction:async function(db,fn){ window.__writes.push("tx"); return null; },\n'
    + '    onSnapshot:function(ref){ window.__reads.push("sub "+ref.path); return function(){}; }\n'
    + '  };\n'
    /* 가짜 auth — 출석 기기 토큰 */
    + '  window._auth = { currentUser: { isAnonymous:false, uid:"ksk_B",\n'
    + '    getIdToken:function(){ return Promise.resolve("tok"); },\n'
    + '    getIdTokenResult:function(){ return Promise.resolve({ claims:{ kiosk:true, org:"B" } }); } } };\n'
    + '  window._authFns = { signInWithCustomToken:function(){ return Promise.resolve(); },\n'
    + '                      onAuthStateChanged:function(){ return function(){}; },\n'
    + '                      signOut:function(){ return Promise.resolve(); } };\n'
    + '  window.fetch = function(url, init){\n'
    + '    var body = {}; try{ body = JSON.parse((init&&init.body)||"{}"); }catch(e){}\n'
    + '    window.__api.push(body);\n'
    + '    var out = { ok:false };\n'
    + '    if(body.action === "kioskLogin"){\n'
    + '      out = (String(body.kioskCode)==="777777")\n'
    + '        ? { ok:true, token:"T", org:"B", orgName:"가온학원", bizType:"academy" }\n'
    + '        : { ok:false, message:"업체 번호 또는 PIN 이 맞지 않아요." };\n'
    + '    } else if(body.action === "kioskCheckin"){\n'
    + '      out = (String(body.pin)==="1111")\n'
    + '        ? { ok:true, name:"가하은", photo:"", time:"09:05", date:"2026-11-09", sent:1 }\n'
    + '        : { ok:false, why:"nomember", message:"PIN 번호가 올바르지 않습니다." };\n'
    + '    } else if(body.action === "kioskInfo"){\n'
    + '      out = { ok:true, hasCode:true, bound:true, updatedAt:1 };\n'
    + '    }\n'
    + '    return Promise.resolve({ ok:true, json:function(){ return Promise.resolve(out); } });\n'
    + '  };\n'
    + '  window.alert=function(m){ window.__alerts.push(String(m)); };\n'
    + '  window.confirm=function(){return true;}; window.prompt=function(){return null;};\n'
    + '})();';
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
  await p.goto('file:///' + APP.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(seed());
  p.__errs = errs;
  return p;
}

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐ 로그인 화면 — 입구가 셋이고 고른 탭을 기억한다');
  {
    const p = await page(b);
    const r = await p.evaluate(() => {
      const out = {};
      out.tabs = ['login-tab-driver', 'login-tab-admin', 'login-tab-kiosk']
        .map((id) => !!document.getElementById(id)).join(',');
      loginPick('kiosk');
      const box = (id) => (document.getElementById(id) || {}).style || {};
      out.kioskOpen = box('login-box-kiosk').display !== 'none';
      out.driverHidden = box('login-box-driver').display === 'none';
      out.adminHidden = box('login-box-admin').display === 'none';
      out.saved = localStorage.getItem(LOGIN_PICK_KEY);
      loginPickRestore();
      out.restored = box('login-box-kiosk').display !== 'none';
      return out;
    });
    say(r.tabs === 'true,true,true', '★ 입구 단추 셋'.padEnd(46) + r.tabs);
    say(r.kioskOpen && r.driverHidden && r.adminHidden, '★ 출석 기기 칸만 열린다'.padEnd(46)
      + r.kioskOpen + '/' + r.driverHidden + '/' + r.adminHidden);
    say(r.saved === 'kiosk', '  고른 탭을 기억한다'.padEnd(46) + r.saved);
    say(r.restored === true, '  다음에 열면 그 탭'.padEnd(46) + String(r.restored));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓑⓒⓓ 출석 기기로 들어가 PIN 을 누른다');
  {
    const p = await page(b);
    const r = await p.evaluate(async () => {
      loginPick('kiosk');
      document.getElementById('ksk-orgcode').value = '123456';
      document.getElementById('ksk-code').value = '777777';
      await loginKiosk();
      await new Promise((x) => setTimeout(x, 300));
      const ks = document.getElementById('kiosk-screen');
      const txt = ((ks && ks.textContent) || '').replace(/\s+/g, ' ');
      return {
        screen: !!ks,
        appHidden: (document.getElementById('main-app') || {}).style.display === 'none',
        org: window._kioskOrg || '',
        pad: ks ? ks.querySelectorAll('#kiosk-pad button').length : 0,
        /* ★ **글자**로 찾으면 안내문(「관리자 화면은 열리지 않아요」)에 걸린다(처음에 그랬다) —
           **단추**로 센다: 화면 안 단추는 PIN 판 열둘뿐이어야 한다. */
        otherBtns: ks ? [...ks.querySelectorAll('button')]
          .filter((x) => !/^pinPress\(/.test(String(x.getAttribute('onclick') || ''))).length : -1,
        names: /가하은|나다움/.test(txt),
        txt: txt.slice(0, 60)
      };
    });
    say(r.screen === true, '★ 출석 기기 화면이 떴다'.padEnd(46) + String(r.screen));
    say(r.appHidden === true, '★ 앱(관리/운행) 화면은 숨었다'.padEnd(46) + String(r.appHidden));
    say(r.org === 'B', '  업체가 토큰에서 온다(_kioskOrg)'.padEnd(46) + r.org);
    say(r.pad === 12, '★ PIN 판 숫자 단추 12개'.padEnd(46) + r.pad + '개');
    say(r.otherBtns === 0, '★ PIN 판 말고 다른 단추가 **0개**'.padEnd(46) + r.otherBtns + '개');
    say(r.names === false, '★ 화면에 **명단이 없다**'.padEnd(46) + String(r.names));

    const r2 = await p.evaluate(async () => {
      for (const ch of '1111') pinPress(ch);
      await new Promise((x) => setTimeout(x, 800));
      const res = document.getElementById('pin-result');
      const api = (window.__api || []);
      return {
        msg: ((res && res.textContent) || '').replace(/\s+/g, ' '),
        kioskCalls: api.filter((x) => x.action === 'kioskCheckin').length,
        padCalls: api.filter((x) => x.action === 'pinCheckin').length,
        alim: api.filter((x) => x.tpl_code || x.receiver).length,
        writes: (window.__writes || []).slice(),
        reads: (window.__reads || []).slice(),
        box: Object.keys(localStorage).filter((k) => k.indexOf('tkd_') === 0 && k.indexOf('__') > 0)
      };
    });
    say(r2.kioskCalls === 1, '★ 기기 창구를 **한 번**'.padEnd(46) + r2.kioskCalls + '번');
    say(r2.padCalls === 0, '★ 관리자 판 창구는 **안 부른다**'.padEnd(46) + r2.padCalls + '번');
    say(/출석 완료/.test(r2.msg) && /가하은/.test(r2.msg), '★ 이름·완료가 뜬다'.padEnd(46) + r2.msg.slice(0, 26));
    say(/09:05/.test(r2.msg), '  서버 시각이 뜬다'.padEnd(46) + (/09:05/.test(r2.msg) ? '09:05' : '없음'));
    say(r2.alim === 0, '★ **앱이 알림톡을 보내지 않는다**(서버가 보낸다)'.padEnd(46) + r2.alim + '건');
    say(r2.writes.length === 0, '★ Firestore 쓰기 0'.padEnd(46) + (r2.writes.join(',') || '없음'));
    say(r2.reads.length === 0, '★ Firestore 읽기 0(리스너도 0)'.padEnd(46) + (r2.reads.join(',') || '없음'));
    say(r2.box.length === 0, '★ 업체 저장 칸 0'.padEnd(46) + (r2.box.join(',') || '없음'));

    const r3 = await p.evaluate(async () => {
      for (const ch of '9999') pinPress(ch);
      await new Promise((x) => setTimeout(x, 800));
      const res = document.getElementById('pin-result');
      return ((res && res.textContent) || '').replace(/\s+/g, ' ');
    });
    say(/올바르지 않/.test(r3), '  틀린 PIN 안내'.padEnd(46) + r3.slice(0, 24));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓔ 관리자 화면 — 「🎫 출석 전용 기기」 칸');
  {
    const p = await page(b);
    const r = await p.evaluate(async () => {
      currentMode = 'admin'; window._userOrgId = 'B'; window._userUid = 'uB';
      window._userBizType = 'academy'; window._userPaidUntil = Date.now() + 30 * 86400000;
      const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
      const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
      initApp();
      /* ★ v313(코스로드69): 학원·공공은 이 칸이 **「«출결»관리」로 옮겨졌다**(전에는 차량 탭).
         v297 의 약속은 「**관리자 화면에** 그 칸이 있다」이므로 **두 탭을 다 열어** 본다 —
         탭 이름을 박아 두면 카드가 자리를 옮길 때마다 이 묶음이 거짓으로 깨진다. */
      switchAdminTab('cars');
      await new Promise((x) => setTimeout(x, 700));
      const grab = () => {
        const c = document.getElementById('admin-content');
        const txt = ((c && c.textContent) || '').replace(/\s+/g, ' ');
        const btns = [...document.querySelectorAll('button')].map((x) => String(x.getAttribute('onclick') || ''));
        return { card: /출석 전용 기기/.test(txt),
                 issue: btns.some((x) => /kioskCodeIssue/.test(x)),
                 unbind: btns.some((x) => /kioskUnbindAsk/.test(x)) };
      };
      const a = grab();
      switchAdminTab('attendance');
      await new Promise((x) => setTimeout(x, 500));
      const b2 = grab();
      return { card: a.card || b2.card, issue: a.issue || b2.issue,
               unbind: a.unbind || b2.unbind,
               where: b2.card ? '«출결»관리(v313)' : (a.card ? '차량관리' : '없음') };
    });
    console.log('     카드가 있는 화면: ' + r.where);
    say(r.card === true, '★ 칸이 있다'.padEnd(46) + String(r.card));
    say(r.issue === true, '  「코드 만들기」 단추'.padEnd(46) + String(r.issue));
    say(r.unbind === true, '  「기기 풀기」 단추(묶여 있을 때)'.padEnd(46) + String(r.unbind));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  /* ★ 돌림판은 「전부 통과 / 실패 N건」을 찾는다 — 「문제 N건」만 찍으면
     **안 돌았다(출력 없음)**로 잡힌다(v313 에 실제로 그랬다). 두 글자를 함께 찍는다. */
  console.log(bad ? '\nX 실패 ' + bad + '건' : '\n✔ 전부 통과');
  console.log('※ 바깥 요청 전부 차단 · Firestore·서버 api 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})();
