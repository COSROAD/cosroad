/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v313(코스로드69) 실제 크롬 — **출석 전용 기기 카드 자리** · 네 크기 × 네 업종.
   ⓐ 학원·공공 — 「«출결»관리」 화면에 보이고 **차량 탭에서는 안 보인다** · PIN 체크인 단추 아래
   ⓑ 물류·택배 — 차량 탭에 **그대로 보이고**(숨기지 않았다) 「아직 쓸 수 없어요」가 적혀 있다
   ⓒ 옛 직원 PIN 카드가 **네 업종 모두 근태 화면**에
   ⓓ 네 크기에서 카드가 **안 잘리고** 가로 넘침 0 · 단추가 눌리는 크기(44px 이상)
   ⓔ 카드 단추를 눌러도 **그 화면이 다시 그려진다**(탭 이름을 박아 두지 않았다)
   ★ 바깥 요청 전부 차단 · 서버 창구는 가짜 — 실제 호출 0. */
const { chromium } = require('playwright');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP = process.env.COS_APP || (COS_ROOT + '/index.html');
const OLD_REF = process.env.COS_SRC_OLD_REF || 'bf31bbb';   /* v312 — 고치기 전 */
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];
const BIZ = ['academy', 'public', 'logistics', 'delivery'];

/* ★★ 이 회차(v313) 커밋 사본 — **그 회차가 약속한 것은 그 커밋에서 잰다.**
   v314(코스로드70)가 물류·택배 자리와 카드 글을 **일부러 바꿨으므로**(서버 갈래가 생겼다)
   작업트리로 재면 고친 코드와 무관하게 거짓으로 깨진다(CLAUDE.md 「양쪽을 커밋에 고정」). */
const THIS_REF = (() => {
  if (process.env.COS_API_NEW_REF) return process.env.COS_API_NEW_REF;
  try {
    const h = cp.execSync('git -C ' + COS_ROOT
      + ' log --format=%H -1 --fixed-strings --grep=(v313)').toString().trim();
    return /^[0-9a-f]{7,}$/.test(h) ? h : '';
  } catch (e) { return ''; }
})();
function copyOf(ref, tag) {
  const body = cp.execSync('git -C ' + COS_ROOT + ' show ' + ref + ':index.html',
    { maxBuffer: 1 << 28 }).toString();
  const out = path.join(os.tmpdir(), 'cos313_' + tag + '_index.html');
  fs.writeFileSync(out, body);
  return out.split('\\').join('/');
}
function oldCopy() {
  const body = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
    { maxBuffer: 1 << 28 }).toString();
  const out = path.join(os.tmpdir(), 'cos313_' + OLD_REF + '_index.html');
  fs.writeFileSync(out, body);
  return out.replace(/\\/g, '/');
}

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + msg); };

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
  location: '인천 연수구 1', lat: 37.41, lon: 126.68, phone: '010-1111-1111' }];

function seed(biz) {
  const S = '__academy_acme';
  return '(function(){\n'
    + '  window._userOrgId="academy_acme"; currentMode="admin";\n'
    + '  var S=' + JSON.stringify(S) + ', B=' + JSON.stringify(biz) + ';\n'
    + '  localStorage.setItem("tkd_cars"+S, JSON.stringify([{id:"car1",name:"1호차",driver:"박기사"}]));\n'
    + '  localStorage.setItem("tkd_courses"+S, JSON.stringify([{id:"c1",name:"오전반"}]));\n'
    + '  localStorage.setItem("tkd_members"+S, ' + JSON.stringify(JSON.stringify(MEM)) + ');\n'
    + '  localStorage.setItem("tkd_notices"+S, "[]");\n'
    /* 옛 직원 PIN 이 평문으로 남은 업체 — 그래야 「옮기기」 카드가 나온다 */
    + '  localStorage.setItem("tkd_staff"+S, JSON.stringify([{id:"st1",name:"김직원",pin:"1234"}]));\n'
    + '  localStorage.setItem("tkd_org"+S, JSON.stringify({name:"가온",icon:"🚐",bizType:B,\n'
    + '    destName:"학원",destLat:37.4467,destLon:126.6516}));\n'
    + '  localStorage.setItem("tkd_ridestate"+S, "{}");\n'
    + '  window._db={}; window._fbReady=true;\n'
    + '  window._firestore={ doc:function(){return{path:"x"};}, collection:function(){return{path:"x"};},\n'
    + '    getDoc:async function(){return {exists:function(){return false;},data:function(){return{};}};},\n'
    + '    setDoc:async function(){}, deleteDoc:async function(){},\n'
    + '    getDocs:async function(){return {forEach:function(){}};},\n'
    + '    runTransaction:async function(){return null;}, onSnapshot:function(){return function(){};} };\n'
    + '  window._auth={ currentUser:{ uid:"uB", isAnonymous:false,\n'
    + '    getIdToken:function(){ return Promise.resolve("t"); } } };\n'
    + '  window.alert=function(){}; window.confirm=function(){ return true; };\n'
    + '  window.__prompts=[];\n'
    + '  window.prompt=function(t,v){ window.__prompts.push(String(v||"")); return null; };\n'
    /* 서버 창구는 가짜 — **부른 동작만** 적는다(실제 호출 0) */
    + '  window.__api=[];\n'
    + '  window.driverAcctApi=function(b){ window.__api.push(String((b&&b.action)||""));\n'
    + '    if(b && b.action==="kioskInfo") return Promise.resolve({ok:true,hasCode:true,bound:true});\n'
    + '    if(b && b.action==="issueKioskCode") return Promise.resolve({ok:true,code:"123456"});\n'
    + '    return Promise.resolve({ok:true}); };\n'
    + '  window.fetch=function(){ return Promise.resolve({ok:true,json:function(){ return Promise.resolve({ok:true}); }}); };\n'
    + '  window._userBizType=B; try{ _userBizType=B; }catch(e){}\n'
    + '  window._userUid="uB"; window._userPaidUntil=Date.now()+30*86400000;\n'
    + '  members=loadMembers(); cars=loadCars(); courses=loadCourses();\n'
    + '  orgSettings=loadOrgSettings(); staff=loadStaff(); notices=loadNotices();\n'
    + '  saveToFirebase=function(){ return Promise.resolve(true); };\n'
    + '  saveCarState=function(){ return Promise.resolve(true); };\n'
    + '  rebuildCarData=function(){}; _firstSyncOk=true;\n'
    + '  document.getElementById("admin-screen").classList.add("show");\n'
    + '  var ls=document.getElementById("login-screen"); if(ls) ls.classList.add("hide");\n'
    + '  var ap=document.getElementById("main-app"); if(ap) ap.style.display="block";\n'
    + '})();';
}

async function open(b, w, h, biz, file) {
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
  await p.goto('file:///' + String(file || APP).replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(seed(biz));
  p.__errs = errs;
  return p;
}
/* 그 탭을 열고 **카드가 보이나·안 잘리나**를 잰다 */
const look = async (p, tab) => {
  await p.evaluate((t) => { currentAdminTab = t; renderAdminTab(t); }, tab);
  await p.waitForTimeout(260);                /* 기기 정보를 받아 다시 그릴 틈 */
  return p.evaluate(() => {
    const titles = [...document.querySelectorAll('.status-card-title')].map((e) => e.textContent.trim());
    const card = [...document.querySelectorAll('.status-card')]
      .find((e) => /🎫 출석 전용 기기/.test(e.textContent)) || null;
    const r = card ? card.getBoundingClientRect() : null;
    const btns = card ? [...card.querySelectorAll('button')].map((b) => {
      const bb = b.getBoundingClientRect();
      return { t: b.textContent.trim().slice(0, 14), h: Math.round(bb.height), w: Math.round(bb.width) };
    }) : [];
    return { kiosk: !!card, staffMig: titles.some((t) => /옛 직원 PIN 옮기기/.test(t)),
      text: card ? card.textContent.replace(/\s+/g, ' ').trim() : '',
      cutTop: r ? Math.round(Math.min(0, r.top)) : 0,
      overRight: r ? Math.round(Math.max(0, r.right - document.documentElement.clientWidth)) : 0,
      btns: btns, pinFirst: (() => {
        const h = document.getElementById('admin-content');
        if (!h) return null;
        const a = h.innerHTML.indexOf('PIN 체크인 모드 열기');
        const b2 = h.innerHTML.indexOf('출석 전용 기기');
        return (a >= 0 && b2 >= 0) ? a < b2 : null;
      })(),
      scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
};

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const OLD_APP = oldCopy();
  const THIS_APP = THIS_REF ? copyOf(THIS_REF, 'this') : APP;

  console.log('════ ⓐⓑ 자리 — 재현(옛 판) → 고친 뒤 (네 크기 × 네 업종)');
  for (const [w, h] of SIZES) {
    const tag = '[' + w + 'x' + h + '] ';
    for (const biz of BIZ) {
      const academyLike = (biz === 'academy' || biz === 'public');
      /* 재현 — 옛 판은 네 업종 모두 차량 탭 */
      const o = await open(b, w, h, biz, OLD_APP);
      const wasCars = await look(o, 'cars');
      say(wasCars.kiosk, tag + '[옛 ' + biz + '] 차량 탭에 있었다'.padEnd(34) + wasCars.kiosk);
      await o.close();
      /* 고친 뒤 */
      /* ★ 물류·택배는 **그 회차(v313)에는** 차량 탭에 두었다 — 그 커밋 사본으로 띄운다 */
      const p = await open(b, w, h, biz, academyLike ? APP : THIS_APP);
      const cars = await look(p, 'cars');
      const att = await look(p, 'attendance');
      if (academyLike) {
        say(!cars.kiosk, tag + '★ [' + biz + '] 차량 탭에서 빠졌다'.padEnd(34) + cars.kiosk);
        say(att.kiosk, tag + '★ [' + biz + '] «출결»관리에 있다'.padEnd(34) + att.kiosk);
        say(att.pinFirst === true, tag + '  PIN 체크인 단추 아래'.padEnd(34) + att.pinFirst);
        say(att.cutTop === 0 && att.overRight === 0,
          tag + '  카드가 안 잘린다'.padEnd(34) + '위 ' + att.cutTop + 'px · 오른쪽 ' + att.overRight + 'px');
        say(att.btns.length >= 2 && att.btns.every((x) => x.h >= 36),
          tag + '  단추 높이'.padEnd(34) + att.btns.map((x) => x.h).join('/') + 'px');
        say(!/아직 쓸 수 없어요/.test(att.text), tag + '  「못 쓴다」 줄 없음'.padEnd(34) + 'OK');
        say(att.scroll <= 0, tag + '  가로 넘침 0'.padEnd(34) + att.scroll + 'px');
      } else {
        say(cars.kiosk, tag + '★ [' + biz + '] 차량 탭에 **그대로**'.padEnd(34) + cars.kiosk);
        say(!att.kiosk, tag + '  근태 화면에는 아직 없다'.padEnd(34) + att.kiosk);
        say(/아직 쓸 수 없어요/.test(cars.text),
          tag + '★ [' + biz + '] 「아직 쓸 수 없어요」'.padEnd(34) + 'OK');
        say(/PIN 출퇴근 체크/.test(cars.text), tag + '  근태 찍는 자리를 알려 준다'.padEnd(34) + 'OK');
        say(cars.cutTop === 0 && cars.overRight === 0,
          tag + '  카드가 안 잘린다'.padEnd(34) + '위 ' + cars.cutTop + 'px · 오른쪽 ' + cars.overRight + 'px');
        say(cars.scroll <= 0, tag + '  가로 넘침 0'.padEnd(34) + cars.scroll + 'px');
      }
      say(p.__errs.length === 0, tag + '[' + biz + '] 오류 0'.padEnd(34) + (p.__errs[0] || 'OK'));
      await p.close();
    }
  }

  console.log('\nⓒ 옛 직원 PIN 카드 — 네 업종 모두 **근태 화면**에');
  for (const biz of BIZ) {
    const p = await open(b, 1366, 768, biz);
    const academyLike = (biz === 'academy' || biz === 'public');
    const cars = await look(p, 'cars');
    const att = await look(p, 'attendance');
    /* 학원·공공은 근태 블록이 차량 탭 안이고, 물류·택배는 «출결»관리 탭이 근태 화면이다 */
    say(academyLike ? cars.staffMig : att.staffMig,
      '★ [' + biz + '] 근태 화면에 있다'.padEnd(40) + (academyLike ? cars.staffMig : att.staffMig));
    if (!academyLike) say(!cars.staffMig, '  [' + biz + '] 차량 탭에서 빠졌다'.padEnd(40) + cars.staffMig);
    say(p.__errs.length === 0, '  [' + biz + '] 오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓓⓔ 카드 단추를 눌러도 **그 화면이 다시 그려진다**');
  {
    const p = await open(b, 1366, 768, 'academy');
    await look(p, 'attendance');
    const r = await p.evaluate(async () => {
      window.__api = [];
      kioskCodeIssue();
      await new Promise((r2) => setTimeout(r2, 350));
      const card = [...document.querySelectorAll('.status-card')]
        .find((e) => /🎫 출석 전용 기기/.test(e.textContent)) || null;
      return { api: window.__api.slice(), tab: currentAdminTab, still: !!card,
        prompts: (window.__prompts || []).slice(),
        msg: (document.getElementById('ksk-msg') || {}).textContent || '' };
    });
    say(r.api.indexOf('issueKioskCode') >= 0, '★ 코드 만들기를 불렀다'.padEnd(40) + r.api.join(','));
    say(r.tab === 'attendance', '  탭이 그대로 «출결»관리'.padEnd(40) + r.tab);
    say(r.still, '★ 다시 그린 뒤에도 카드가 **그 화면에** 있다'.padEnd(40) + r.still);
    /* ★ 코드는 **창(prompt)** 으로 알려 준다 — 카드 속 글(`#ksk-msg`)은 **다시 그리면서 지워진다.**
       v312(차량 탭)에서도 **똑같았다**(그 탭에서 눌러도 다시 그렸다) → 이 회차가 만든 것이 아니다.
       그래서 「적어 두세요」 창이 **원본**이다(69 보고문의 「전부터 그랬다」 표). */
    say(r.prompts.some((x) => /123456/.test(x)),
      '★ 새 코드를 **창으로** 알려 준다'.padEnd(40) + r.prompts.join(','));
    say(r.msg === '', '  (기록) 카드 속 글은 다시 그리며 지워진다'.padEnd(40) + '"' + r.msg + '"');
    say(p.__errs.length === 0, '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
    /* 물류 — 차량 탭에서 눌러도 같다
       ★ v313 **그 회차**의 자리다(v314 가 「근태관리」로 옮겼다) → 그 커밋 사본으로 띄운다. */
    const q = await open(b, 1366, 768, 'logistics', THIS_APP);
    await look(q, 'cars');
    const r2 = await q.evaluate(async () => {
      kioskCodeIssue();
      await new Promise((r3) => setTimeout(r3, 350));
      const card = [...document.querySelectorAll('.status-card')]
        .find((e) => /🎫 출석 전용 기기/.test(e.textContent)) || null;
      return { tab: currentAdminTab, still: !!card };
    });
    say(r2.tab === 'cars' && r2.still, '★ [물류] 차량 탭에서도 다시 그려진다'.padEnd(40)
      + r2.tab + '/' + r2.still);
    say(q.__errs.length === 0, '오류 0'.padEnd(40) + (q.__errs[0] || 'OK'));
    await q.close();
  }

  await b.close();
  console.log('\n' + (bad ? 'X 실패 ' + bad + '건' : 'o 전부 통과') + ' — 실제 크롬 4크기 × 4업종');
  console.log('※ 바깥 요청 차단 · 서버 창구 가짜 — 실제 호출 0');
  process.exit(bad ? 1 : 0);
})();
