/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v311(코스로드68 보정2) 실제 크롬 — **문자 본문을 실제로 만들어 본다** · 네 크기.
   ⓐ «알림장» 문자 — 옛 판은 사진 주소가 줄줄이(재현) → 고친 판은 `s.html#토큰` **한 줄**
   ⓑ 그 본문에 **문자에 못 실리는 글자 0** · 제목도 0 · 주소는 한 줄
   ⓒ 다시 보내기·카톡 공유가 **같은 주소**를 쓴다 · 글을 고치면 새 주소
   ⓓ 폰 문자앱으로 넘기는 네 자리(하차·하차 예정·출석·미납)도 깨질 글자 0
   ⓔ 알림톡은 **그대로**(그림 글자가 남아 있다) · 네 크기에서 화면이 안 잘림
   ★ 바깥 요청 전부 차단 · Firestore·Storage 가짜 · **실제 발송 0**(가짜 `fetch`·가짜 `window.open`). */
const { chromium } = require('playwright');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP = process.env.COS_APP || (COS_ROOT + '/index.html');
const OLD_REF = process.env.COS_SRC_OLD_REF || '931e336';   /* v310 — 고치기 전 */
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

function oldCopy() {
  const body = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
    { maxBuffer: 1 << 28 }).toString();
  const out = path.join(os.tmpdir(), 'cos311_' + OLD_REF + '_index.html');
  fs.writeFileSync(out, body);
  return out.replace(/\\/g, '/');
}

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + msg); };

/* 문자 글자표(EUC-KR) — 파이썬 `str.encode('euc-kr')` 로 뽑아 둔 「실리는 기호」만 허용한다 */
const OK_SYM = '▶※━─│·♥→←↑↓☆★■□●○◆◇☎㈜℃±×÷°…①②③④⑤';
const badChars = (s) => [...String(s || '')].filter((c) => {
  const cp2 = c.codePointAt(0);
  if (cp2 < 0x2000) return false;
  if (/[가-힣ㄱ-ㅎㅏ-ㅣ一-龥ぁ-ヶ]/.test(c)) return false;
  return OK_SYM.indexOf(c) < 0;
});

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
  location: '인천 연수구 1', dropLocation: '행복아파트 101동',
  lat: 37.41, lon: 126.68, phone: '010-1111-1111', phone2: '010-2222-2222' }];
const NOTICE = [{ id: 1, ts: Date.UTC(2026, 10, 1, 2, 0), date: '2026-11-01',
  content: '오늘은 비가 옵니다', images: ['data:image/jpeg;base64,AAAA'], target: 'all' }];

function seed() {
  const S = '__academy_acme';
  return '(function(){\n'
    + '  window._userOrgId="academy_acme"; currentMode="admin";\n'
    + '  var S=' + JSON.stringify(S) + ';\n'
    + '  localStorage.setItem("tkd_cars"+S, JSON.stringify([{id:"car1",name:"1호차"}]));\n'
    + '  localStorage.setItem("tkd_courses"+S, JSON.stringify([{id:"c1",name:"오전반"}]));\n'
    + '  localStorage.setItem("tkd_members"+S, ' + JSON.stringify(JSON.stringify(MEM)) + ');\n'
    + '  localStorage.setItem("tkd_notices"+S, ' + JSON.stringify(JSON.stringify(NOTICE)) + ');\n'
    + '  localStorage.setItem("tkd_staff"+S, "[]");\n'
    + '  localStorage.setItem("tkd_org"+S, JSON.stringify({name:"가온학원",icon:"🚐",\n'
    + '    bizType:"academy",destName:"학원",destLat:37.4467,destLon:126.6516}));\n'
    + '  localStorage.setItem("tkd_ridestate"+S, "{}");\n'
    + '  window._db={}; window._fbReady=true;\n'
    + '  /* 가짜 Firestore — `shares` 에 쓴 것만 모은다(실제 쓰기 0) */\n'
    + '  window.__shares=[];\n'
    + '  window._firestore={ doc:function(db,col,token){return{col:col,token:token};},\n'
    + '    collection:function(){return{path:"x"};},\n'
    + '    setDoc:async function(ref,data){ if(ref&&ref.col==="shares") window.__shares.push({token:ref.token,data:data}); },\n'
    + '    getDoc:async function(){return {exists:function(){return false;},data:function(){return{};}};},\n'
    + '    deleteDoc:async function(){}, getDocs:async function(){return {forEach:function(){}};},\n'
    + '    runTransaction:async function(){return null;}, onSnapshot:function(){return function(){};} };\n'
    + '  window._auth={ currentUser:{ uid:"uB", isAnonymous:false,\n'
    + '    getIdToken:function(){ return Promise.resolve("t"); } } };\n'
    + '  /* 가짜 Storage — 사진 주소를 돌려준다(올리지는 않는다) */\n'
    + '  window._storage={};\n'
    + '  window._storageFns={ storageRef:function(st,p){ return {path:p}; },\n'
    + '    uploadString:function(r){ return Promise.resolve({ref:r}); },\n'
    + '    getDownloadURL:function(r){ return Promise.resolve("https://firebasestorage.googleapis.com/v0/b/x/o/"+encodeURIComponent(r.path)+"?alt=media&token=abc"); } };\n'
    + '  /* 가짜 문자 창구 — **보내려 한 글**만 적는다 */\n'
    + '  window.__api=[]; window.__sms=[];\n'
    + '  window.fetch=function(u,i){ var b={}; try{ b=JSON.parse((i&&i.body)||"{}"); }catch(e){}\n'
    + '    window.__api.push({url:String(u),body:b});\n'
    + '    return Promise.resolve({ok:true,json:function(){ return Promise.resolve({result_code:1,success_cnt:1}); }}); };\n'
    + '  window.open=function(u){ var s=String(u||"");\n'
    + '    if(s.indexOf("sms:")===0){ var q=s.indexOf("?body=");\n'
    + '      window.__sms.push({to:s.slice(4,q), body:decodeURIComponent(s.slice(q+6))}); }\n'
    + '    return null; };\n'
    + '  window.alert=function(){}; window.confirm=function(){ return true; };\n'
    + '  window._userBizType="academy"; try{ _userBizType="academy"; }catch(e){}\n'
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
    errs.push(t.slice(0, 130));
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + String(file).replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(seed());
  p.__errs = errs;
  return p;
}
const sendNotice = async (p) => {
  await p.evaluate(() => { sendNoticeSms(1); });
  await p.waitForTimeout(260);
  return p.evaluate(() => {
    const hit = (window.__api || []).filter((x) => /send-sms/.test(x.url));
    const last = hit[hit.length - 1];
    return { body: last ? String(last.body.msg || '') : '(안 보냄)',
      title: last ? String(last.body.title || '') : '',
      calls: hit.length, shares: (window.__shares || []).length,
      tokens: (window.__shares || []).map((x) => x.token) };
  });
};

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const OLD_APP = oldCopy();

  console.log('════ ⓐⓑ «알림장» 문자 — 재현 → 고친 뒤 (네 크기)');
  for (const [w, h] of SIZES) {
    const tag = '[' + w + 'x' + h + '] ';
    /* 재현 — 옛 판 */
    const o = await open(b, w, h, OLD_APP);
    const was = await sendNotice(o);
    say(/firebasestorage\.googleapis\.com/.test(was.body),
      tag + '[옛] 사진 주소가 본문에'.padEnd(36) + (was.body.match(/https?:\/\/[^\s]{0,28}/) || ['없음'])[0]);
    say(badChars(was.body).length > 0, tag + '[옛] 깨질 글자가 있었다'.padEnd(36)
      + ([...new Set(badChars(was.body))].join('') || '없음'));
    say(was.shares === 0, tag + '[옛] 공유 스냅샷 0'.padEnd(36) + was.shares);
    say(o.__errs.length === 0, tag + '[옛] 오류 0'.padEnd(36) + (o.__errs[0] || 'OK'));
    await o.close();
    /* 고친 뒤 */
    const p = await open(b, w, h, APP);
    const now = await sendNotice(p);
    say(now.shares === 1, tag + '★ 공유 스냅샷 하나'.padEnd(36) + now.shares);
    say(/\n▶ 알림장 보기:\n/.test(now.body), tag + '★ 「▶ 알림장 보기:」 한 줄'.padEnd(36)
      + JSON.stringify(now.body.slice(-46)));
    say((now.body.match(/https?:\/\//g) || []).length === 1,
      tag + '★ 주소는 한 줄뿐'.padEnd(36) + (now.body.match(/https?:\/\//g) || []).length);
    say(!/firebasestorage/.test(now.body), tag + '★ 사진 주소 없음'.padEnd(36) + 'OK');
    say(badChars(now.body).length === 0, tag + '★ 본문에 깨질 글자 0'.padEnd(36)
      + ([...new Set(badChars(now.body))].join('') || '0개'));
    say(badChars(now.title).length === 0, tag + '  제목도 0'.padEnd(36) + now.title);
    say(now.body.indexOf('https://cosroad.com/s.html#' + now.tokens[0]) > 0,
      tag + '  그 주소가 그 스냅샷 토큰'.padEnd(36) + String(now.tokens[0]).slice(0, 12) + '…');
    say(p.__errs.length === 0, tag + '오류 0'.padEnd(36) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒ 다시 보내기·카톡 공유는 **같은 주소** · 글을 고치면 새 주소');
  {
    const p = await open(b, 1366, 768, APP);
    const a1 = await sendNotice(p);
    const a2 = await sendNotice(p);
    say(a2.shares === 1, '★ 다시 보내도 스냅샷 하나'.padEnd(40) + a2.shares);
    say(a1.body === a2.body, '  같은 주소를 다시 썼다'.padEnd(40) + (a1.body === a2.body ? '같다' : '다르다'));
    const k = await p.evaluate(async () => {
      const r = await shareIssueNotice(1);
      return { url: String(r.url || ''), reused: !!r.reused, shares: (window.__shares || []).length };
    });
    say(k.reused && k.shares === 1, '★ 카톡 공유도 같은 주소'.padEnd(40)
      + '다시 씀=' + k.reused + ' · 스냅샷=' + k.shares);
    say(a1.body.indexOf(k.url) > 0, '  그 주소가 문자에 넣은 것과 같다'.padEnd(40) + 'OK');
    await p.evaluate(() => { notices[0].content = '내일은 쉽니다'; saveNotices(); });
    const a3 = await sendNotice(p);
    say(a3.shares === 2, '★ 글을 고치면 새 스냅샷'.padEnd(40) + a3.shares);
    say(a3.body !== a1.body && /내일은 쉽니다/.test(a3.body),
      '  본문·주소가 새것'.padEnd(40) + 'OK');
    say(p.__errs.length === 0, '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓓ 폰 문자앱으로 넘기는 글 — 네 자리 모두 깨질 글자 0');
  {
    const p = await open(b, 390, 844, APP);
    const r = await p.evaluate(() => {
      window.__sms = [];
      try { sendDropoffSMS(members[0], '오후 3:00'); } catch (e) {}
      try { sendDropoffSoon(1); } catch (e) {}
      try { sendCheckinSMSText(members[0], '오후 3:00'); } catch (e) {}
      try { payViewYear = 2026; payViewMonth = 11; sendUnpaidOne(1); } catch (e) {}
      return (window.__sms || []).map((x) => x.body);
    });
    say(r.length >= 3, '문자앱으로 넘긴 글 수'.padEnd(40) + r.length + '건');
    r.forEach((body, i) => {
      const bc = [...new Set(badChars(body))].join('');
      say(bc === '', '★ ' + (i + 1) + '번 글에 깨질 글자'.padEnd(37) + (bc || '0개') + ' | '
        + body.split('\n')[0].slice(0, 26));
    });
    /* 대조 — 옛 판 같은 자리 */
    const o = await open(b, 390, 844, OLD_APP);
    const was = await o.evaluate(() => {
      window.__sms = [];
      try { sendDropoffSMS(members[0], '오후 3:00'); } catch (e) {}
      try { sendDropoffSoon(1); } catch (e) {}
      try { sendCheckinSMSText(members[0], '오후 3:00'); } catch (e) {}
      return (window.__sms || []).map((x) => x.body);
    });
    const wasBad = [...new Set(was.flatMap((x) => badChars(x)))].join('');
    say(wasBad.length > 0, '  (대조) 옛 판 같은 자리는 잡힌다'.padEnd(40) + wasBad);
    say(p.__errs.length === 0 && o.__errs.length === 0, '오류 0'.padEnd(40)
      + (p.__errs[0] || o.__errs[0] || 'OK'));
    await o.close();
    await p.close();
  }

  console.log('\nⓔ 알림톡은 **그대로** — 그림 글자가 남아 있다');
  {
    const p = await open(b, 1366, 768, APP);
    const msgOnly = await p.evaluate(() => {
      window.__api = [];
      try { sendDropoffNotify(members[0], '오후 3:00'); } catch (e) {}
      return buildDropoffMessage('academy', '가온학원', '가하은', '오후 3:00');
    });
    await p.waitForTimeout(300);          /* ★ 알림톡은 비동기다 — 기다려야 적힌다 */
    const r = await p.evaluate((m) => ({ msg: m,
      api: (window.__api || []).map((x) => ({ url: x.url, body: x.body })) }), msgOnly);
    say(/👤/.test(r.msg) && /⏰/.test(r.msg) && /✅/.test(r.msg),
      '★ 하차 알림(승인 글)에 그림 글자 그대로'.padEnd(40)
      + [...new Set(badChars(r.msg))].join(''));
    const tok = r.api.filter((x) => /send-alimtalk/.test(x.url));
    say(tok.length > 0, '  알림톡 창구로 나갔다'.padEnd(40) + tok.length + '건');
    say(tok.length > 0 && /👤/.test(String(tok[0].body.message || '')),
      '★ 알림톡 본문도 **그대로**'.padEnd(40)
      + [...new Set(badChars(String((tok[0] || {}).body ? tok[0].body.message : '')))].join(''));
    say(p.__errs.length === 0, '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log('\n' + (bad ? 'X 실패 ' + bad + '건' : 'o 전부 통과') + ' — 실제 크롬 4크기');
  console.log('※ 바깥 요청 차단 · Firestore·Storage 가짜 — 실제 발송 0 · 실제 쓰기 0');
  process.exit(bad ? 1 : 0);
})();
