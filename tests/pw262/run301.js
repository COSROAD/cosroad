/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v301(코스로드61-1) 실제 크롬 — **숫자는 말 안 해도 천단위** · 네 크기 × 네 업종.
   ⓐ 화면에 그려진 글에서 「**네 자리 이상 숫자 + 단위**」가 쉼표 없이 남아 있나 → **0곳**
      (네 크기 × 네 업종 · 대시보드·명단·수납·차계부·근태)
   ⓑ 금액 칸에 1234567 을 치면 **쓰는 동안 쉼표**가 보이고, **저장되는 값은 숫자**다
   ★ 인쇄·PDF 글은 **스텁**(`tests/num301.js` ⑧)이 `saveHtmlAsPdf` 를 가로채 본다
   ⓒ **번호**(PIN·전화·사업자번호·업체 번호)에는 쉼표가 **안 들어간다**
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');

const APP = process.env.COS_APP || ('' + COS_ROOT + '/index.html');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];
const BIZ = ['academy', 'public', 'logistics', 'delivery'];

const CARS = [{ id: 'car1', name: '1호차', plate: '12가3456', driver: '박기사', phone: '010-5555-6666' },
              { id: 'car2', name: '2호차' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
/* 네 자리를 넘는 「양」을 일부러 넣는다 — 쉼표가 빠지면 바로 걸린다 */
const MEMBERS = [];
for (let i = 1; i <= 12; i++) {
  MEMBERS.push({ id: i, name: '회원' + i, carId: 'car1', courseId: 'c1', days: D7,
    location: '인천 연수구 ' + i, lat: 37.41, lon: 126.68,
    phone: '010-1111-' + String(1000 + i), on: true, offOn: true,
    monthly: 1234567, regfee: 50000, invoice: '123456789012', courier: 'CJ' });
}
const STAFF = [{ id: 'st1', name: '최직원', hasPin: true, hourlyWage: 10030, mealAllow: 200000,
  taxMode: 'free33', breakAuto: true }];

function seed(biz) {
  return '(function(){\n'
    + '  window._userOrgId="B"; currentMode="admin";\n'
    + '  var SUF="__B";\n'
    + '  localStorage.setItem("tkd_cars"+SUF, ' + JSON.stringify(JSON.stringify(CARS)) + ');\n'
    + '  localStorage.setItem("tkd_courses"+SUF, ' + JSON.stringify(JSON.stringify(COURSES)) + ');\n'
    + '  localStorage.setItem("tkd_members"+SUF, ' + JSON.stringify(JSON.stringify(MEMBERS)) + ');\n'
    + '  localStorage.setItem("tkd_staff"+SUF, ' + JSON.stringify(JSON.stringify(STAFF)) + ');\n'
    + '  localStorage.setItem("tkd_org"+SUF, JSON.stringify({name:"가온",icon:"🚐",bizType:"' + biz + '",\n'
    + '    destName:"학원",destLat:37.4467,destLon:126.6516,address:"인천광역시 미추홀구 매소홀로 1",\n'
    + '    addrSido:"인천",addrSigungu:"미추홀구",bizNo:"1234567890",ceo:"홍길동",\n'
    + '    tel:"032-123-4567",bankAccount:"농협 301-1234-5678-90"}));\n'
    /* 차계부 — 계기판 km·금액이 네 자리를 넘는다 */
    + '  localStorage.setItem("tkd_carlog"+SUF, JSON.stringify({records:[\n'
    + '    {id:"r1",carId:"car1",date:"2026-11-01",type:"fuel",item:"주유",amount:123456,liters:32.5,odo:123456},\n'
    + '    {id:"r2",carId:"car1",date:"2026-11-02",type:"fix",item:"정비",amount:2500000,odo:124000}\n'
    + '  ],plans:{}}));\n'
    + '  localStorage.setItem("tkd_payments"+SUF, JSON.stringify({}));\n'
    + '  localStorage.setItem("tkd_ridestate"+SUF, "{}");\n'
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
    orgSettings = loadOrgSettings(); staff = loadStaff();
    _firstSyncOk = true;
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
  }, biz);
  p.__errs = errs;
  return p;
}
/* ★ 「양」만 본다 — **네 자리 이상 숫자 바로 뒤에 단위**가 붙은 자리.
   날짜(2026-11-09)·전화·PIN·사업자번호는 단위가 안 붙으므로 걸리지 않는다. */
const BAD_RE = /(?<![\d,])\d{4,}\s*(원|명|건|대|개|km|L)(?![a-zA-Z가-힣])/g;

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐ 네 크기 × 네 업종 — 화면 글에 **쉼표 없는 「양」** 이 있나');
  let done대조 = false;
  for (const biz of BIZ) {
    for (const [w, h] of SIZES) {
      const p = await open(b, w, h, biz);
      const r = await p.evaluate((re) => {
        const out = { seen: [], bad: [] };
        const tabs = ['dashboard', 'members', 'payment', 'cars', 'attendance'];
        tabs.forEach((t) => {
          try { switchAdminTab(t); } catch (e) { return; }
          const el = document.getElementById('admin-content');
          const txt = ((el && el.textContent) || '').replace(/\s+/g, ' ');
          out.seen.push(t + ':' + txt.length);
          const m = txt.match(new RegExp(re, 'g'));
          if (m) out.bad = out.bad.concat(m.slice(0, 6).map((x) => t + '→' + x));
        });
        return out;
      }, BAD_RE.source);
      say(r.bad.length === 0, ('[' + biz + ' ' + w + '×' + h + '] 쉼표 없는 「양」').padEnd(46)
        + (r.bad.length ? r.bad.join(' | ') : '0곳'));
      say(p.__errs.length === 0, ('  오류 0').padEnd(46) + (p.__errs[0] || 'OK'));
      /* ★★ **검사 도구부터 대조 시험**(「0건」은 1건을 잡을 수 있음을 보인 뒤에만) —
         쉼표 없는 「양」을 일부러 한 줄 끼워 넣고 **그 검사가 잡는지** 본다. */
      if (!done대조) {
        done대조 = true;
        const c = await p.evaluate((re) => {
          const el = document.getElementById('admin-content');
          el.innerHTML = el.innerHTML + '<div>12345명 · 9876543원 · 12345km</div>';
          const txt = (el.textContent || '').replace(/\s+/g, ' ');
          return (txt.match(new RegExp(re, 'g')) || []).length;
        }, BAD_RE.source);
        say(c === 3, '★ (대조) 쉼표 없는 「양」 셋을 끼우면 **잡는다**'.padEnd(46) + c + '건');
      }
      await p.close();
    }
  }

  console.log('\nⓑ 금액 칸 — 쓰는 동안 쉼표 · **저장되는 값은 숫자**');
  {
    const p = await open(b, 390, 844, 'academy');
    const r = await p.evaluate(async () => {
      switchAdminTab('members');
      openAddModal();
      const mon = document.getElementById('m-monthly');
      const reg = document.getElementById('m-regfee');
      /* 사람이 치는 것처럼 — 한 글자씩 넣고 그때마다 `oninput` 을 돌린다 */
      const type = (el, s) => {
        el.value = '';
        for (const ch of s) {
          el.value = el.value + ch;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return el.value;
      };
      const shownMon = type(mon, '1234567');
      const shownReg = type(reg, '50000');
      document.getElementById('m-name').value = '쉼표테스트';
      const loc = document.getElementById('m-location');
      loc.value = '인천 연수구 99';
      loc.setAttribute('data-lat', '37.41'); loc.setAttribute('data-lon', '126.68');
      DAYS.forEach((d) => { const e = document.getElementById('d-' + dayIdMap[d]); if (e) e.checked = true; });
      const pin = document.getElementById('m-pin'); if (pin) pin.value = '';
      await saveMember();
      await new Promise((x) => setTimeout(x, 200));
      const m = loadMembers().find((x) => x.name === '쉼표테스트');
      return { shownMon: shownMon, shownReg: shownReg, inputType: mon.type,
               saved: m ? { monthly: m.monthly, regfee: m.regfee,
                            tm: typeof m.monthly, tr: typeof m.regfee } : null,
               alerts: (window.__alerts || []).slice() };
    });
    say(r.shownMon === '1,234,567', '★ 치는 동안 쉼표가 보인다'.padEnd(46) + r.shownMon);
    say(r.shownReg === '50,000', '  등록비도'.padEnd(46) + r.shownReg);
    say(r.inputType === 'text', '  칸은 `type="text"`(숫자 키패드)'.padEnd(46) + r.inputType);
    say(!!r.saved && r.saved.monthly === 1234567 && r.saved.tm === 'number',
      '★ 저장된 값은 **숫자** 1234567'.padEnd(46) + JSON.stringify(r.saved));
    say(!!r.saved && r.saved.regfee === 50000, '  등록비도 50000'.padEnd(46)
      + (r.saved ? r.saved.regfee : '-'));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  /* ★ 인쇄·PDF 글은 **스텁**(`tests/num301.js` ⑧)이 `saveHtmlAsPdf`·새 창을 가로채
     급여명세서·거래내역·운행기록부 세 양식의 글을 받아 본다(그쪽이 더 정확하다 —
     이 화면에서는 그 양식들이 자료가 갖춰지지 않아 안 만들어진다). */

  console.log('\nⓒ **번호**에는 쉼표가 안 들어간다');
  {
    const p = await open(b, 390, 844, 'academy');
    const r = await p.evaluate(() => {
      switchAdminTab('settings');
      /* ★ 설정 칸 값은 `textContent` 가 아니라 **칸의 value** 에 있다(처음에 그걸로 깨졌다) */
      const v = (id) => String((document.getElementById(id) || {}).value || '');
      const out = { bizNo: v('org-bizno'), tel: v('org-tel'), bank: v('org-bank') };
      switchAdminTab('members');
      const t = document.getElementById('admin-content').textContent || '';
      out.phoneKeep = /010-1111-100/.test(t) && !/1,011/.test(t);
      return out;
    });
    say(r.bizNo === '1234567890', '★ 사업자번호 1234567890 — 쉼표 없음'.padEnd(46) + r.bizNo);
    say(r.tel === '032-123-4567', '  전화번호 그대로'.padEnd(46) + r.tel);
    say(/301-1234-5678-90/.test(r.bank), '  계좌번호 그대로'.padEnd(46) + r.bank);
    say(r.phoneKeep, '  «회원» 전화번호 그대로'.padEnd(46) + String(r.phoneKeep));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log('\n' + (bad ? 'X 실패 ' + bad + '건' : 'o 전부 통과') + ' — 실제 크롬 4크기 × 4업종');
  console.log('※ 바깥 요청 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})();
