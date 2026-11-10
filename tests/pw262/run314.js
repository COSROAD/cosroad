/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v314(코스로드70) 실제 크롬 — **출퇴근 전용 기기 화면·카드** · 네 크기.
   ⓐ 기기 화면 — 물류·택배는 「출퇴근 체크 — 기사·직원 PIN」 · 학원·공공은 종전 글
   ⓑ 기기에서 PIN 을 누르면 **출근 → 퇴근 → 이미 퇴근** 글이 뜬다(서버 응답 그대로)
      · 직원 응답(`kind:'staff'`·`punch`)도 같은 글 · 「출석 완료!」가 **안 뜬다**
   ⓒ 학원 기기에 기사 PIN(404 안내)을 넣으면 **안내만** 뜬다
   ⓓ 카드 — 물류·택배는 **「근태관리」**(차량 탭에 없다) · 제목이 「출퇴근 전용 기기」 ·
      「아직 쓸 수 없어요」가 **사라졌다** · 네 크기에서 안 잘림
   ★ 바깥 요청 전부 차단 · 서버 창구는 가짜(응답을 우리가 정한다) — 실제 호출 0. */
const { chromium } = require('playwright');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP = process.env.COS_APP || (COS_ROOT + '/index.html');
const OLD_REF = process.env.COS_SRC_OLD_REF || 'f23e964';   /* v313 — 고치기 전 */
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

function oldCopy() {
  const body = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
    { maxBuffer: 1 << 28 }).toString();
  const out = path.join(os.tmpdir(), 'cos314_' + OLD_REF + '_index.html');
  fs.writeFileSync(out, body);
  return out.replace(/\\/g, '/');
}

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + msg); };

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
  location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1111-1111' }];

/* 출석 기기로 **로그인한 상태**를 만든다 — 서버 응답은 우리가 정한다(실제 호출 0) */
function seedKiosk(biz) {
  return '(function(){\n'
    + '  var B=' + JSON.stringify(biz) + ';\n'
    + '  window._kioskOrg="academy_acme"; window._kioskOrgName="가온";\n'
    + '  window._userBizType=B; try{ _userBizType=B; }catch(e){}\n'
    + '  window._isDriverAcct=false; window._isHelperAcct=false; window._userOrgId=null;\n'
    + '  window._db={}; window._fbReady=true;\n'
    + '  window._firestore={ doc:function(){return{path:"x"};}, collection:function(){return{path:"x"};},\n'
    + '    getDoc:async function(){ var e=new Error("denied"); e.code="permission-denied"; throw e; },\n'
    + '    setDoc:async function(){}, getDocs:async function(){ var e=new Error("denied"); e.code="permission-denied"; throw e; },\n'
    + '    deleteDoc:async function(){}, runTransaction:async function(){return null;},\n'
    + '    onSnapshot:function(){ return function(){}; } };\n'
    + '  window._auth={ currentUser:{ uid:"ksk_academy_acme", isAnonymous:false,\n'
    + '    getIdToken:function(){ return Promise.resolve("t"); } } };\n'
    + '  window.alert=function(){}; window.confirm=function(){ return true; };\n'
    /* 서버 응답을 **우리가 정한다** — 누른 PIN 에 따라 꼴이 달라진다 */
    + '  window.__sent=[]; window.__reply=null;\n'
    + '  window.fetch=function(u,i){ var b={}; try{ b=JSON.parse((i&&i.body)||"{}"); }catch(e){}\n'
    + '    window.__sent.push(b);\n'
    + '    var j=(typeof window.__reply==="function") ? window.__reply(b) : (window.__reply||{ok:false,message:"x"});\n'
    + '    return Promise.resolve({ok:true,json:function(){ return Promise.resolve(j); }}); };\n'
    + '  onKioskLoggedIn();\n'
    + '})();';
}
/* 관리자로 들어와 그 탭을 그린다(카드 자리 보기) */
function seedAdmin(biz) {
  const S = '__academy_acme';
  return '(function(){\n'
    + '  window._userOrgId="academy_acme"; currentMode="admin";\n'
    + '  var S=' + JSON.stringify(S) + ', B=' + JSON.stringify(biz) + ';\n'
    + '  localStorage.setItem("tkd_cars"+S, JSON.stringify([{id:"car1",name:"1호차",driver:"박기사"}]));\n'
    + '  localStorage.setItem("tkd_courses"+S, JSON.stringify([{id:"c1",name:"오전반"}]));\n'
    + '  localStorage.setItem("tkd_members"+S, ' + JSON.stringify(JSON.stringify(MEM)) + ');\n'
    + '  localStorage.setItem("tkd_notices"+S, "[]");\n'
    + '  localStorage.setItem("tkd_staff"+S, JSON.stringify([{id:"st1",name:"김직원",hasPin:true}]));\n'
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
    + '  window.prompt=function(){ return null; };\n'
    + '  window.driverAcctApi=function(b){\n'
    + '    if(b && b.action==="kioskInfo") return Promise.resolve({ok:true,hasCode:true,bound:true});\n'
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

async function open(b, w, h, file) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    if (/permission-denied|Missing or insufficient/.test(t)) return;   /* 기기는 모든 읽기가 거부된다 */
    errs.push(t.slice(0, 130));
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + String(file || APP).replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  p.__errs = errs;
  return p;
}
/* 기기에서 PIN 넷을 누르고 결과 글을 받는다 */
const press = async (p, pin, reply) => {
  await p.evaluate((a) => {
    window.__reply = () => a.reply;
    pinInput = '';
    for (const c of String(a.pin)) pinPress(c);
  }, { pin: pin, reply: reply });
  await p.waitForTimeout(260);
  return p.evaluate(() => {
    const r = document.getElementById('pin-result');
    const box = r ? r.getBoundingClientRect() : null;
    return { text: ((r && r.textContent) || '').replace(/\s+/g, ' ').trim(),
      cutTop: box ? Math.round(Math.min(0, box.top)) : 0,
      scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
};

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const OLD_APP = oldCopy();

  console.log('════ ⓐ 기기 화면 글 — 업종별 (네 크기)');
  for (const [w, h] of SIZES) {
    const tag = '[' + w + 'x' + h + '] ';
    for (const biz of ['academy', 'logistics']) {
      const p = await open(b, w, h);
      await p.evaluate(seedKiosk(biz));
      const r = await p.evaluate(() => {
        const el = document.getElementById('kiosk-screen');
        return { text: ((el && el.textContent) || '').replace(/\s+/g, ' ').trim(),
          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      if (biz === 'logistics') {
        say(/출퇴근 체크 — 기사·직원 PIN 4자리/.test(r.text),
          tag + '★ [물류] 「출퇴근 체크」 글'.padEnd(34) + 'OK');
        say(!/출석 기기 — 자기 PIN/.test(r.text), tag + '  옛 글은 없다'.padEnd(34) + 'OK');
      } else {
        say(/출석 기기 — 자기 PIN 4자리/.test(r.text),
          tag + '★ [학원] 종전 글 그대로'.padEnd(34) + 'OK');
      }
      say(/명단이 들어오지 않아요/.test(r.text), tag + '  바닥 안내 그대로'.padEnd(34) + 'OK');
      say(r.scroll <= 0, tag + '  가로 넘침 0'.padEnd(34) + r.scroll + 'px');
      say(p.__errs.length === 0, tag + '[' + biz + '] 오류 0'.padEnd(34) + (p.__errs[0] || 'OK'));
      await p.close();
    }
  }

  console.log('\nⓑ 물류 기기 — 출근 → 퇴근 → 이미 퇴근 (서버 응답 그대로)');
  {
    const p = await open(b, 390, 844);
    await p.evaluate(seedKiosk('logistics'));
    const a1 = await press(p, '2222', { ok: true, kind: 'in', carId: 'car1',
      time: '08:30', date: '2026-11-10', name: '1호차 · 박기사' });
    say(/🌅/.test(a1.text) && /1호차 · 박기사 기사님 출근/.test(a1.text),
      '★ 출근 글'.padEnd(40) + a1.text.slice(0, 30));
    say(/08:30/.test(a1.text), '  시각이 보인다'.padEnd(40) + 'OK');
    say(!/출석 완료/.test(a1.text), '★ 「출석 완료!」가 **안 뜬다**'.padEnd(40) + 'OK');
    const a2 = await press(p, '2222', { ok: true, kind: 'out', carId: 'car1',
      time: '18:10', date: '2026-11-10', name: '1호차 · 박기사' });
    say(/🌆/.test(a2.text) && /퇴근/.test(a2.text), '★ 퇴근 글'.padEnd(40) + a2.text.slice(0, 30));
    const a3 = await press(p, '2222', { ok: true, kind: 'done', carId: 'car1',
      time: '18:10', date: '2026-11-10', name: '1호차 · 박기사' });
    say(/오늘은 이미 퇴근했어요/.test(a3.text), '★ 「이미 퇴근」 글'.padEnd(40) + a3.text.slice(0, 30));
    /* 직원 응답 꼴 */
    const a4 = await press(p, '3333', { ok: true, kind: 'staff', staffId: 'st1',
      punch: 'in', time: '09:00', date: '2026-11-10', name: '김직원' });
    say(/김직원 출근/.test(a4.text) && !/기사님/.test(a4.text),
      '★ 직원은 「기사님」을 안 붙인다'.padEnd(40) + a4.text.slice(0, 26));
    /* 틀린 PIN */
    const a5 = await press(p, '9999', { ok: false, message: 'PIN 번호가 올바르지 않습니다.' });
    say(/PIN 번호가 올바르지 않습니다/.test(a5.text), '  틀린 PIN 안내'.padEnd(40) + 'OK');
    say(a5.cutTop === 0 && a5.scroll <= 0, '  안 잘림·가로 넘침 0'.padEnd(40) + 'OK');
    say(p.__errs.length === 0, '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒ 학원 기기 — 출석은 종전 글 · 기사 PIN 은 안내만');
  {
    const p = await open(b, 390, 844);
    await p.evaluate(seedKiosk('academy'));
    const a1 = await press(p, '1111', { ok: true, name: '가하은', photo: '',
      time: '08:30', date: '2026-11-10', first: true, sent: 1 });
    say(/출석 완료!/.test(a1.text) && /가하은/.test(a1.text),
      '★ «회원» 출석 글 그대로'.padEnd(40) + a1.text.slice(0, 24));
    const a2 = await press(p, '2222',
      { ok: false, message: '이 기기는 회원 출석 전용이에요. 기사·직원 출퇴근은 관리자 기기에서 찍어 주세요.', why: 'wrongpad' });
    say(/출석 전용이에요/.test(a2.text), '★ 기사 PIN → 안내만'.padEnd(40) + a2.text.slice(0, 26));
    /* ★ 「출퇴근」이라는 **글자**는 안내 문구에 들어 있다(「기사·직원 출퇴근은 관리자 기기에서」) —
       그러니 **출퇴근 결과 모양**(🌅·🌆·「○○ 출근」)이 안 뜨는지를 본다. */
    say(!/🌅|🌆|님 출근|님 퇴근/.test(a2.text), '  출퇴근 **결과**는 안 뜬다'.padEnd(40) + 'OK');
    say(/❌/.test(a2.text), '  안내 모양(❌)으로 뜬다'.padEnd(40) + 'OK');
    say(p.__errs.length === 0, '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓓ 카드 자리 — 물류·택배는 「근태관리」 (네 크기)');
  for (const [w, h] of SIZES) {
    const tag = '[' + w + 'x' + h + '] ';
    for (const biz of ['logistics', 'delivery']) {
      /* 재현 — 옛 판(v313)은 차량 탭 */
      const o = await open(b, w, h, OLD_APP);
      await o.evaluate(seedAdmin(biz));
      const was = await o.evaluate(async () => {
        currentAdminTab = 'cars'; renderAdminTab('cars');
        await new Promise((x) => setTimeout(x, 300));
        const c = document.getElementById('admin-content');
        return /출석 전용 기기/.test(((c && c.textContent) || ''));
      });
      say(was, tag + '[옛 ' + biz + '] 차량 탭에 있었다'.padEnd(32) + was);
      await o.close();
      /* 고친 뒤 */
      const p = await open(b, w, h);
      await p.evaluate(seedAdmin(biz));
      const r = await p.evaluate(async () => {
        const look = async (t) => {
          currentAdminTab = t; renderAdminTab(t);
          await new Promise((x) => setTimeout(x, 320));
          const c = document.getElementById('admin-content');
          const txt = ((c && c.textContent) || '').replace(/\s+/g, ' ');
          const card = [...document.querySelectorAll('.status-card')]
            .find((e) => /전용 기기/.test(e.textContent)) || null;
          const bb = card ? card.getBoundingClientRect() : null;
          return { has: /전용 기기/.test(txt), txt: txt,
            cutTop: bb ? Math.round(Math.min(0, bb.top)) : 0,
            overRight: bb ? Math.round(Math.max(0, bb.right - document.documentElement.clientWidth)) : 0,
            scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        };
        return { cars: await look('cars'), att: await look('attendance') };
      });
      say(!r.cars.has, tag + '★ [' + biz + '] 차량 탭에서 빠졌다'.padEnd(32) + r.cars.has);
      say(r.att.has, tag + '★ [' + biz + '] 「근태관리」에 있다'.padEnd(32) + r.att.has);
      say(/출퇴근 전용 기기/.test(r.att.txt), tag + '★ 제목이 「출퇴근 전용 기기」'.padEnd(32) + 'OK');
      say(/기사·직원 PIN 으로 출퇴근/.test(r.att.txt), tag + '  안내 글이 새것'.padEnd(32) + 'OK');
      say(!/아직 쓸 수 없어요/.test(r.att.txt), tag + '★ 「아직 쓸 수 없어요」 사라짐'.padEnd(32) + 'OK');
      say(r.att.cutTop === 0 && r.att.overRight === 0,
        tag + '  카드가 안 잘린다'.padEnd(32) + '위 ' + r.att.cutTop + 'px · 오른쪽 ' + r.att.overRight + 'px');
      say(r.att.scroll <= 0, tag + '  가로 넘침 0'.padEnd(32) + r.att.scroll + 'px');
      say(p.__errs.length === 0, tag + '[' + biz + '] 오류 0'.padEnd(32) + (p.__errs[0] || 'OK'));
      await p.close();
    }
  }

  console.log('\nⓔ 학원·공공 카드는 v313 자리 그대로 — 「출석 전용 기기」');
  for (const biz of ['academy', 'public']) {
    const p = await open(b, 1366, 768);
    await p.evaluate(seedAdmin(biz));
    const r = await p.evaluate(async () => {
      const look = async (t) => {
        currentAdminTab = t; renderAdminTab(t);
        await new Promise((x) => setTimeout(x, 320));
        const c = document.getElementById('admin-content');
        return ((c && c.textContent) || '').replace(/\s+/g, ' ');
      };
      return { cars: await look('cars'), att: await look('attendance') };
    });
    say(!/전용 기기/.test(r.cars), '★ [' + biz + '] 차량 탭에 없다'.padEnd(40) + 'OK');
    say(/출석 전용 기기/.test(r.att), '★ [' + biz + '] «출결»관리에 「출석 전용 기기」'.padEnd(40) + 'OK');
    say(!/출퇴근 전용 기기/.test(r.att), '  「출퇴근」 제목이 아니다'.padEnd(40) + 'OK');
    say(p.__errs.length === 0, '  [' + biz + '] 오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log('\n' + (bad ? 'X 실패 ' + bad + '건' : 'o 전부 통과') + ' — 실제 크롬 4크기');
  console.log('※ 바깥 요청 차단 · 서버 응답 가짜 — 실제 호출 0 · 실제 발송 0');
  process.exit(bad ? 1 : 0);
})();
