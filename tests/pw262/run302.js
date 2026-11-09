/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v302(코스로드61-2) 실제 크롬 — **카톡 공유·보내기 표식은 카카오 노란색** · 네 크기 × 네 업종.
   ⓐ 카톡 단추·표식의 **실제 그려진 색**이 `#FEE500`(rgb 254,229,0) 인가 · 글자는 검정 85% 인가
   ⓑ **문자(SMS)·알림톡·미납 문자** 단추는 **노랗지 않다**(헷갈리지 않게)
   ⓒ 네 크기에서 **글자가 보이나**(상자 안에 들어오나 · 글자색이 비치지 않나)
   ⓓ 섞인 단추(「보기·인쇄·💬 카톡」)는 **카톡 조각만** 노란 표식
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');

const APP = process.env.COS_APP || ('' + COS_ROOT + '/index.html');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];
const BIZ = ['academy', 'public', 'logistics', 'delivery'];
const YELLOW = 'rgb(254, 229, 0)';

const CARS = [{ id: 'car1', name: '1호차', driver: '박기사', hourlyWage: 10030, mealAllow: 200000,
  taxMode: 'free33', commuteKm: 20 }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [{ id: 1, name: '가나다물류', carId: 'car1', courseId: 'c1', days: D7,
  location: '인천 연수구 1', lat: 37.41, lon: 126.68, phone: '010-1111-1111',
  on: true, offOn: true, monthly: 1234567, bizNo: '635-88-02710', ceo: '문준식' }];
/* ★ `renderNotice` 는 `n.ts` 로 날짜를 만든다 — 없으면 Invalid Date 가 되고
   `notices` 를 안 불러오면 목록 자체가 비어 **카톡 단추가 안 그려진다**(처음에 그랬다). */
const NOTICES = [{ id: 1, ts: Date.UTC(2026, 10, 1, 2, 0), date: '2026-11-01',
  content: '오늘은 비가 옵니다', images: [], sent: true, kakaoTs: Date.UTC(2026, 10, 1, 3, 0),
  target: 'all', targetLabel: '전체' }];
const INVOICES = [{ id: 'inv1', date: '2026-11-05', memberId: 1, clientName: '가나다물류',
  kind: 'sale', items: [{ name: '세탁볼', qty: 10, price: 12000, amount: 120000 }],
  supply: 120000, vat: 12000, total: 132000, payments: [], memo: '' }];

function seed(biz) {
  return '(function(){\n'
    + '  window._userOrgId="B"; currentMode="admin";\n'
    + '  var S="__B";\n'
    + '  localStorage.setItem("tkd_cars"+S, ' + JSON.stringify(JSON.stringify(CARS)) + ');\n'
    + '  localStorage.setItem("tkd_courses"+S, ' + JSON.stringify(JSON.stringify(COURSES)) + ');\n'
    + '  localStorage.setItem("tkd_members"+S, ' + JSON.stringify(JSON.stringify(MEMBERS)) + ');\n'
    + '  localStorage.setItem("tkd_notices"+S, ' + JSON.stringify(JSON.stringify(NOTICES)) + ');\n'
    + '  localStorage.setItem("tkd_invoices"+S, ' + JSON.stringify(JSON.stringify(INVOICES)) + ');\n'
    + '  localStorage.setItem("tkd_staff"+S, "[]");\n'
    + '  localStorage.setItem("tkd_org"+S, JSON.stringify({name:"가온",icon:"🚐",bizType:"' + biz + '",\n'
    + '    destName:"학원",destLat:37.4467,destLon:126.6516}));\n'
    + '  localStorage.setItem("tkd_payments"+S, "{}");\n'
    + '  localStorage.setItem("tkd_ridestate"+S, "{}");\n'
    + '  window._db={}; window._fbReady=true;\n'
    + '  window._firestore={ doc:function(){return{path:"x"};}, collection:function(){return{path:"x"};},\n'
    + '    getDoc:async function(){return {exists:function(){return false;},data:function(){return{};}};},\n'
    + '    setDoc:async function(){}, deleteDoc:async function(){},\n'
    + '    getDocs:async function(){return {forEach:function(){}};},\n'
    + '    runTransaction:async function(){return null;}, onSnapshot:function(){return function(){};} };\n'
    + '  window._auth={ currentUser:{ isAnonymous:false, getIdToken:function(){ return Promise.resolve("t"); } } };\n'
    + '  window.__alerts=[]; window.alert=function(m){ window.__alerts.push(String(m)); };\n'
    + '  window.confirm=function(){return true;}; window.open=function(){return null;};\n'
    + '  window.fetch=function(){ return Promise.resolve({ok:true,json:function(){return Promise.resolve({ok:true});}}); };\n'
    + '})();';
}

async function open(b, w, h, biz) {
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
  await p.goto('file:///' + APP.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(seed(biz));
  await p.evaluate((biz) => {
    window._userBizType = biz; window._userUid = 'uB';
    window._userPaidUntil = Date.now() + 30 * 86400000;
    try { _userBizType = biz; } catch (e) {}
    members = loadMembers(); cars = loadCars(); courses = loadCourses();
    orgSettings = loadOrgSettings(); staff = loadStaff(); notices = loadNotices();
    _firstSyncOk = true;
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
  }, biz);
  p.__errs = errs;
  return p;
}
/* 카톡 글자가 든 **그려진** 단추·표식을 모아 실제 색을 잰다 */
const scanKakao = (p) => p.evaluate(() => {
  const out = [];
  const tabs = ['dashboard', 'members', 'notice', 'payment', 'cars', 'attendance', 'invoice', 'settings'];
  tabs.forEach((t) => {
    try { switchAdminTab(t); } catch (e) { return; }
    const host = document.getElementById('admin-content');
    if (!host) return;
    host.querySelectorAll('button, span, div').forEach((el) => {
      const tx = (el.textContent || '').trim();
      if (!/카톡/.test(tx) || tx.length > 40) return;
      if (el.querySelector('button, span')) {
        /* 자식에 같은 글자가 또 있으면 **가장 안쪽**만 센다 */
        const inner = [...el.querySelectorAll('button, span')].some((c) => /카톡/.test(c.textContent || ''));
        if (inner) return;
      }
      const cs = getComputedStyle(el);
      out.push({ tab: t, tag: el.tagName, txt: tx.slice(0, 24),
                 bg: cs.backgroundColor, fg: cs.color,
                 w: Math.round(el.getBoundingClientRect().width),
                 h: Math.round(el.getBoundingClientRect().height),
                 sw: el.scrollWidth, cw: el.clientWidth });
    });
  });
  return out;
});

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };
  let 대조done = false;

  console.log('ⓐⓒ 네 크기 × 네 업종 — 카톡 표식의 **실제 색**과 글자 보임');
  for (const biz of BIZ) {
    for (const [w, h] of SIZES) {
      const p = await open(b, w, h, biz);
      const list = await scanKakao(p);
      const notYellow = list.filter((x) => x.bg !== YELLOW);
      say(list.length > 0, ('[' + biz + ' ' + w + '×' + h + '] 카톡 표식 수').padEnd(46) + list.length + '개');
      say(notYellow.length === 0, ('★ 노란색이 아닌 것').padEnd(46)
        + (notYellow.length ? notYellow.map((x) => x.tab + '/' + x.txt + '=' + x.bg).join(' | ') : '0개'));
      /* 글자색 — 검정 85% 는 크롬이 `rgba(0, 0, 0, 0.85)` 로 돌려준다 */
      const inkBad = list.filter((x) => !/rgba\(0, 0, 0, 0\.85\)/.test(x.fg));
      say(inkBad.length === 0, ('  글자색이 공식 값(검정 85%)').padEnd(46)
        + (inkBad.length ? inkBad.map((x) => x.txt + '=' + x.fg).join(' | ') : '전부'));
      /* 글자가 상자 밖으로 안 넘치나 */
      const cut = list.filter((x) => x.sw > x.cw + 1);
      say(cut.length === 0, ('  글자가 잘리지 않는다').padEnd(46)
        + (cut.length ? cut.map((x) => x.txt + ' ' + x.sw + '>' + x.cw).join(' | ') : '전부'));
      say(p.__errs.length === 0, ('  오류 0').padEnd(46) + (p.__errs[0] || 'OK'));
      /* ★★ 검사 도구부터 대조 — 노랗지 않은 카톡 표식을 끼워 넣고 **잡는지** 본다 */
      if (!대조done) {
        대조done = true;
        const c = await p.evaluate(() => {
          const host = document.getElementById('admin-content');
          host.innerHTML = host.innerHTML + '<button style="background:#7C3AED;color:white;">💬 카톡 가짜</button>';
          let n = 0;
          host.querySelectorAll('button, span, div').forEach((el) => {
            const tx = (el.textContent || '').trim();
            if (!/카톡/.test(tx) || tx.length > 40) return;
            if (getComputedStyle(el).backgroundColor !== 'rgb(254, 229, 0)') n++;
          });
          return n;
        });
        say(c >= 1, '★ (대조) 노랗지 않은 카톡 표식을 끼우면 **잡는다**'.padEnd(46) + c + '개');
      }
      await p.close();
    }
  }

  console.log('\nⓑ **문자(SMS)·알림톡 단추는 노랗지 않다**');
  {
    const p = await open(b, 390, 844, 'academy');
    const r = await p.evaluate(() => {
      const out = [];
      ['notice', 'payment'].forEach((t) => {
        try { switchAdminTab(t); } catch (e) { return; }
        const host = document.getElementById('admin-content');
        if (!host) return;
        host.querySelectorAll('button').forEach((el) => {
          const tx = (el.textContent || '').trim();
          if (!/문자|알림톡|📩/.test(tx) || /카톡/.test(tx)) return;
          out.push({ txt: tx.slice(0, 20), bg: getComputedStyle(el).backgroundColor });
        });
      });
      return out;
    });
    say(r.length > 0, '문자·알림톡 단추 수'.padEnd(46) + r.length + '개');
    const yellow = r.filter((x) => x.bg === YELLOW);
    say(yellow.length === 0, '★ 그 가운데 노란색'.padEnd(46)
      + (yellow.length ? yellow.map((x) => x.txt).join(' | ') : '0개'));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log('\n' + (bad ? 'X 실패 ' + bad + '건' : 'o 전부 통과') + ' — 실제 크롬 4크기 × 4업종');
  console.log('※ 바깥 요청 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})();
