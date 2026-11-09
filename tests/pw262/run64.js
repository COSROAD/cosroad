/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v305(코스로드64) 실제 크롬 — **같은 꼴 셋** · 네 크기.
   ⓐ 코스 삭제 막는 안내가 **네 크기에서 안 잘리나** · 코스 이름·«회원» 수가 다 오나
   ⓑ 확인 창(진짜 DOM)에 **코스 이름**이 보이나 · 아무도 안 쓰는 코스는 지워지나
   ⓒ 백업 파일이 **실제로** 내려가고 그 안에 **자격증 이력**이 들어 있나(파일을 열어 본다)
   ⓓ 첫 동기화 전 문지기 — 토스트가 뜨고 코스가 그대로인가
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const fs = require('fs');

const APP = process.env.COS_APP || ('' + COS_ROOT + '/index.html');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

const CARS = [{ id: 'car1', name: '1호차', driver: '박기사' }];
const COURSES = [
  { id: 'c1', name: '오전반', depart: '09:00', arrive: '09:30' },
  { id: 'c2', name: '빈반', depart: '18:00', arrive: '18:30' }
];
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
    location: '인천 연수구 1', lat: 37.41, lon: 126.68, phone: '010-1111-1111' },
  { id: 2, name: '나다움', carId: 'car1', courseId: 'c1', days: D7,
    location: '인천 연수구 2', lat: 37.42, lon: 126.69, phone: '010-2222-2222' }
];
const CERTS = [{ id: 'ct1', memberName: '가하은', year: 2025, ts: 1, amount: 1200000 }];

function seed() {
  return '(function(){\n'
    + '  window._userOrgId="B"; currentMode="admin";\n'
    + '  var S="__B";\n'
    + '  localStorage.setItem("tkd_cars"+S, ' + JSON.stringify(JSON.stringify(CARS)) + ');\n'
    + '  localStorage.setItem("tkd_courses"+S, ' + JSON.stringify(JSON.stringify(COURSES)) + ');\n'
    + '  localStorage.setItem("tkd_members"+S, ' + JSON.stringify(JSON.stringify(MEMBERS)) + ');\n'
    + '  localStorage.setItem("tkd_certificates"+S, ' + JSON.stringify(JSON.stringify(CERTS)) + ');\n'
    + '  localStorage.setItem("tkd_staff"+S, "[]");\n'
    + '  localStorage.setItem("tkd_org"+S, JSON.stringify({name:"가온학원",icon:"🚐",bizType:"academy",\n'
    + '    destName:"학원",destLat:37.4467,destLon:126.6516}));\n'
    + '  localStorage.setItem("tkd_ridestate"+S, "{}");\n'
    + '  window._db={}; window._fbReady=true; window.__saved=[];\n'
    + '  window._firestore={ doc:function(){return{path:"x"};}, collection:function(){return{path:"x"};},\n'
    + '    getDoc:async function(){return {exists:function(){return false;},data:function(){return{};}};},\n'
    + '    setDoc:async function(){}, deleteDoc:async function(){},\n'
    + '    getDocs:async function(){return {forEach:function(){}};},\n'
    + '    runTransaction:async function(){return null;}, onSnapshot:function(){return function(){};} };\n'
    + '  window._auth={ currentUser:{ isAnonymous:false, getIdToken:function(){ return Promise.resolve("t"); } } };\n'
    + '  window.__alerts=[]; window.alert=function(m){ window.__alerts.push(String(m)); };\n'
    + '  window.confirm=function(){return true;}; window.open=function(){return null;};\n'
    + '  window.__api=[];\n'
    + '  window.fetch=function(u,i){ try{ window.__api.push(JSON.parse((i&&i.body)||"{}")); }catch(e){}\n'
    + '    return Promise.resolve({ok:true,json:function(){return Promise.resolve({ok:true});}}); };\n'
    + '})();';
}

async function open(b, w, h, opt) {
  opt = opt || {};
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1,
    acceptDownloads: true });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    errs.push(t.slice(0, 130));
  });
  const dl = [];
  p.on('download', async (d) => {
    const rec = { name: d.suggestedFilename(), body: '' };
    try { rec.body = fs.readFileSync(await d.path(), 'utf8'); } catch (e) { rec.body = 'ERR'; }
    dl.push(rec);
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + APP.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(seed());
  await p.evaluate((preSync) => {
    window._userBizType = 'academy'; window._userUid = 'uB';
    window._userPaidUntil = Date.now() + 30 * 86400000;
    try { _userBizType = 'academy'; } catch (e) {}
    members = loadMembers(); cars = loadCars(); courses = loadCourses();
    orgSettings = loadOrgSettings(); staff = loadStaff();
    saveToFirebase = function (k) { window.__saved.push(k); return Promise.resolve(true); };
    saveCarState = function () { return Promise.resolve(true); };
    rebuildCarData = function () {};
    _firstSyncOk = !preSync;
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
  }, !!opt.preSync);
  p.__errs = errs;
  p.__dl = dl;
  return p;
}
/* 글이 **상자 안에서 다 보이나** — 토스트와 같은 꼴로 넣어 재 본다 */
const fitsBox = (p, txt) => p.evaluate((t) => {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);'
    + 'background:#344054;color:white;padding:10px 20px;border-radius:20px;'
    + 'font-size:13px;font-weight:700;z-index:9999;'
    + 'white-space:pre-line;word-break:keep-all;overflow-wrap:anywhere;'
    + 'width:max-content;max-width:calc(100vw - 32px);text-align:center;line-height:1.5;';
  d.textContent = t;
  document.body.appendChild(d);
  const r = d.getBoundingClientRect();
  const out = { sw: d.scrollWidth, cw: d.clientWidth, sh: d.scrollHeight, ch: d.clientHeight,
    left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth };
  d.remove();
  return out;
}, txt);

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐ 코스 삭제 막는 안내 — 네 크기에서 안 잘린다');
  for (const [w, h] of SIZES) {
    const p = await open(b, w, h);
    const tag = (w + 'x' + h).padEnd(9);
    const a1 = await p.evaluate(() => {
      window.__alerts = [];
      switchAdminTab('schedule');
      deleteCourse(0);
      return window.__alerts[0] || '';
    });
    say(/^오전반 코스를 지우기 전에/.test(a1), tag + '코스 이름이 앞에 온다'.padEnd(40)
      + a1.slice(0, 14));
    say(/이 코스에 회원 2명이 있어요/.test(a1), tag + '★ «회원» 수가 든다'.padEnd(40)
      + (/(\d+)명/.exec(a1) || ['-'])[0]);
    say(/먼저 코스를 바꿔 주세요/.test(a1), tag + '  무엇을 하라고 알려 준다'.padEnd(40)
      + (a1.slice(-14)));
    const f1 = await fitsBox(p, a1);
    say(f1.sw <= f1.cw, tag + '★ 가로 넘침 0'.padEnd(40) + 'scroll ' + f1.sw + ' ≤ client ' + f1.cw);
    say(f1.sh <= f1.ch, tag + '  세로 넘침 0'.padEnd(40) + f1.sh + ' ≤ ' + f1.ch);
    say(f1.left >= 0 && f1.right <= f1.vw, tag + '  화면 안에 들어온다'.padEnd(40)
      + f1.left + '~' + f1.right + ' / ' + f1.vw);
    const left = await p.evaluate(() => courses.map((c) => c.name).join(','));
    say(left === '오전반,빈반', tag + '★ 코스가 그대로'.padEnd(40) + left);
    say(p.__errs.length === 0, tag + '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓑ 확인 창(진짜 DOM)에 코스 이름 · 안 쓰는 코스는 지워진다');
  {
    const p = await open(b, 390, 844);
    const r = await p.evaluate(async () => {
      switchAdminTab('schedule');
      window.__alerts = [];
      deleteCourse(1);                                /* 「빈반」 — 아무도 안 쓴다 */
      const m = document.getElementById('confirm-modal');
      const shown = m ? getComputedStyle(m).display : 'none';
      const txt = (m && m.textContent) ? m.textContent.replace(/\s+/g, ' ').trim() : '';
      const okBtn = document.getElementById('confirm-ok-btn');
      const okTxt = okBtn ? (okBtn.textContent || '').trim() : '';
      /* 모달 안쪽 상자가 화면을 넘지 않나 */
      let fit = 'noel';
      if (m) {
        const box = m.querySelector('div');
        if (box) {
          const bb = box.getBoundingClientRect();
          fit = (bb.left >= 0 && bb.right <= window.innerWidth
            && box.scrollWidth <= box.clientWidth + 1) ? 'OK' : 'CLIP';
        }
      }
      confirmOk();
      await new Promise((r2) => setTimeout(r2, 60));
      return { shown: shown, txt: txt, okTxt: okTxt, fit: fit,
        left: courses.map((c) => c.name).join(','), alerts: window.__alerts.length };
    });
    say(r.shown === 'flex', '확인 창이 떴다'.padEnd(46) + r.shown);
    say(/「빈반」 코스를 삭제할까요/.test(r.txt), '★ 확인 창에 **코스 이름**'.padEnd(46)
      + (/「[^」]*」 코스를 삭제할까요/.exec(r.txt) || ['없음'])[0]);
    say(/저장.*눌러야 서버에 반영/.test(r.txt), '  「저장」을 눌러야 한다고 적혀 있다'.padEnd(46)
      + (/저장/.test(r.txt) ? 'OK' : '없음'));
    say(r.okTxt === '삭제', '  단추 글자'.padEnd(46) + r.okTxt);
    say(r.fit === 'OK', '★ 확인 창 글이 안 잘린다'.padEnd(46) + r.fit);
    say(r.left === '오전반', '★ 지워졌다'.padEnd(46) + r.left);
    say(r.alerts === 0, '  막는 안내 0'.padEnd(46) + r.alerts);
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒ 백업 파일에 **자격증 이력**이 실제로 담긴다 (파일을 열어 본다)');
  {
    const p = await open(b, 1366, 768);
    await p.evaluate(() => { backupData(); });
    await p.waitForTimeout(900);
    say(p.__dl.length === 1, '★ 백업 파일이 내려갔다'.padEnd(46)
      + ((p.__dl[0] && p.__dl[0].name) || '0개'));
    const body = (p.__dl[0] && p.__dl[0].body) || '';
    say(/tkd_certificates/.test(body), '★ 그 안에 `tkd_certificates` 가 있다'.padEnd(46)
      + (/tkd_certificates/.test(body) ? '있다' : '없다'));
    say(/ct1/.test(body) && /가하은/.test(body), '★ 발급 기록이 들어 있다'.padEnd(46)
      + (/ct1/.test(body) ? 'ct1' : '없음'));
    /* 업체 칸 20가지가 다 담겼나 — 파일을 파싱해서 센다 */
    const n = await p.evaluate((b2) => {
      try {
        const d = JSON.parse(b2);
        return Object.keys(d.data || {}).length;
      } catch (e) { return -1; }
    }, body);
    say(n >= 7, '  담긴 칸 수(씨앗에 있는 것만)'.padEnd(46) + n + '개');
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓓ 첫 동기화 전 문지기 — 토스트가 뜨고 코스는 그대로');
  for (const [w, h] of [[390, 844], [360, 640]]) {
    const p = await open(b, w, h, { preSync: true });
    const tag = (w + 'x' + h).padEnd(9);
    const r = await p.evaluate(() => {
      switchAdminTab('schedule');
      deleteCourse(1);
      const all = [...document.querySelectorAll('div')]
        .filter((d) => /자료를 불러오는 중/.test(d.textContent || '')
          && getComputedStyle(d).position === 'fixed');
      const t = all[all.length - 1];
      const m = document.getElementById('confirm-modal');
      return { has: !!t, txt: t ? (t.textContent || '').trim() : '',
        sw: t ? t.scrollWidth : 0, cw: t ? t.clientWidth : 0,
        modal: m ? getComputedStyle(m).display : 'none',
        left: courses.map((c) => c.name).join(',') };
    });
    say(r.has, tag + '★ 토스트가 떴다'.padEnd(40) + (r.has ? r.txt.slice(0, 24) : '안 떴다'));
    if (r.has) say(r.sw <= r.cw, tag + '  가로 넘침 0'.padEnd(40) + r.sw + ' ≤ ' + r.cw);
    say(r.modal === 'none', tag + '★ 확인 창은 안 뜬다'.padEnd(40) + r.modal);
    say(r.left === '오전반,빈반', tag + '★ 코스가 그대로'.padEnd(40) + r.left);
    say(p.__errs.length === 0, tag + '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log('\n' + (bad ? 'X 실패 ' + bad + '건' : 'o 전부 통과') + ' — 실제 크롬 4크기');
  console.log('※ 바깥 요청 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})();
