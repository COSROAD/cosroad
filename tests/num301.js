/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드61-1 — **숫자는 말 안 해도 천단위** (v301 · 4업종 전부).
   ① 재현 — 쉼표 없이 나오는 자리 · `type="number"` 로 받던 「양」 칸
   ② `fmtNum` 한 벌 — 정수·소수·음수·빈값
   ③ `numOf` 한 벌 — **「50,000」→50 함정**(`parseInt` 와 대조)
   ④ ★★ **저장되는 값이 숫자인가**(검증 3원칙 B) — 회원 월정액·등록비 · 직원 시급·식대 ·
      차계부 계기판 km · 거래명세서 수량
   ⑤ **소수가 있는 양은 안 바꿨다** — 보험요율·리터·출퇴근 거리(쉼표를 넣으면 소수가 깨진다)
   ⑥ **번호에는 안 넣는다** — PIN·전화·사업자번호·차량번호·업체 번호·코드·송장·연도·날짜
   ⑦ 엑셀 — **숫자 칸 그대로** + 표시 형식 `#,##0`(합계가 되게)
   ⑧ 소스 전수 — 쉼표 없는 「양」 자리 0 · 한 벌로 모였나
   ★ 바깥 통신 0. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

const OLD_REF = process.env.COS_SRC_OLD_REF || 'd54de80';   /* v300 — 고치기 전 */
/* ★ 이 묶음은 **회차 기록**이다 — 「이 회차는 `api/` 를 안 바꿨다」는 **두 커밋 사이**로 재야 한다. */
const THIS_REF = process.env.COS_API_NEW_REF || '5b36ea1';   /* 이 회차 커밋 */
const NEW_SRC = fs.readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 40)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1',
  lat: 37.41, lon: 126.68, phone: '010-1', monthly: 1234567, regfee: 50000, hasPin: true }];
const CARS = [{ id: 'car1', name: '1호차' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const STAFF = [{ id: 'st1', name: '최직원', hasPin: true, hourlyWage: 10030, mealAllow: 200000,
  taxMode: 'free33', breakAuto: true }];
const SUF = '__B';

function app(opt) {
  opt = opt || {};
  const src = opt.src || NEW_SRC;
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(opt.members || MEM);
  store['tkd_cars' + SUF] = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify(COURSES);
  store['tkd_staff' + SUF] = JSON.stringify(STAFF);
  store['tkd_org' + SUF] = JSON.stringify({ name: '가온학원', icon: '🚐', bizType: opt.biz || 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  const R = E.build({ src: src, biz: opt.biz || 'academy', localStorage: store });
  if (R.error) throw R.error;
  /* ★ 창이 많아 **소스의 id 전수**를 가짜로 깔아 둔다(mpin296 과 같은 방법) */
  const ids = new Set(['admin-content', 'app-content', 'member-list', 'admin-search',
    'main-header', 'today-date', 'org-name-display', 'org-icon', 'driver-att-host',
    'pin-result', 'pin-display', 'confirm-modal', 'confirm-ok-btn']);
  (src.match(/id="[a-zA-Z0-9_-]+"/g) || []).forEach((x) => ids.add(x.slice(4, -1)));
  /* JS 로 만드는 칸들 */
  ['st-name', 'st-phone', 'st-pin', 'st-wage', 'st-meal', 'st-tax', 'st-break',
   'cl-amount', 'cl-odo', 'cl-liters', 'cl-item', 'cl-note', 'cl-date',
   'dcl-odo', 'dcl-liters', 'dcl-amount', 'dcl-item'].forEach((x) => ids.add(x));
  ids.forEach((id) => {
    const el = E.makeEl('input'); el.id = id;
    const bag = {};
    el.setAttribute = (k, v) => { bag[k] = String(v); };
    el.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null);
    el.removeAttribute = (k) => { delete bag[k]; };
    R.byId[id] = el;
  });
  const L = { alerts: [], toasts: [] };
  R.sandbox.alert = R.win.alert = (m) => { L.alerts.push(String(m)); };
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userUid='uB';"
     + " window._userBizType='academy'; window._userPaidUntil=Date.now()+1e9; _firstSyncOk=true;");
  R.ev('showToast = function(m){ window.__t(String(m)); };');
  R.sandbox.__t = R.win.__t = (m) => { L.toasts.push(String(m)); };
  R.ev('saveToFirebase = function(){ return Promise.resolve(true); };'
     + ' saveCarState = function(){ return Promise.resolve(true); };'
     + ' rebuildCarData = function(){}; refreshDriverAttHost = function(){};'
     + ' renderAdminTab = function(){}; renderMembers = function(){}; renderDrive = function(){};'
     + ' closeMemberModal = function(){}; closeStaffEdit = function(){}; closeModal = function(){};'
     + ' populateSelects = function(){}; isDemoMode = function(){ return true; };');
  R.sandbox.fetch = R.win.fetch = async () => ({ json: async () => ({ ok: true }) });
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses(); staff = loadStaff();');
  return { R, L };
}
const set = (p, id, v) => { const e = p.R.byId[id]; if (e) e.value = String(v); };

(async () => {
  console.log('════ ① 재현 — 「양」을 `type="number"` 로 받고 쉼표가 없던 자리');
  {
    /* ★ 쪽지(주석)에도 `type="number"` 라는 글자가 있다 — **`<input` 이 붙은 것만** 센다 */
    const numIn = (s) => (s.match(/<input[^>]*type="number"/g) || []).length;
    ck('[옛] `type="number"` 칸 수', numIn(OLD_SRC), 14);
    ck('[새] 남은 것은 **소수·번호 다섯**뿐', numIn(NEW_SRC), 5);
    /* 쉼표 없이 「양 + 단위」를 그리던 자리 — 스캐너와 같은 셈 */
    const commaless = (s) => (s.split('\n').filter((ln) =>
      /\+\s*[A-Za-z_$][\w.$\[\]()]*\s*\+\s*['"](원|km|L|명|건|대|개|회|점)/.test(ln)
      && !/toLocaleString|fmtNum/.test(ln))).length;
    ck('[옛] 쉼표 없이 그리던 자리', commaless(OLD_SRC) >= 30, true);
    ck('[새] ★ 0곳', commaless(NEW_SRC), 0);
    const o = app({ src: OLD_SRC });
    ck('[옛] 1,234명 → 쉼표 없음', /1234명/.test(o.R.ev('(function(){'
      + ' var h=""; h+="<div>"+1234+"명</div>"; return h; })()')), true);
  }

  console.log('\n② `fmtNum` 한 벌 — 정수·소수·음수·빈값');
  {
    const p = app({});
    const f = (x, d) => p.R.ev('fmtNum(' + JSON.stringify(x) + (d === undefined ? '' : ',' + d) + ')');
    ck('1234567 → 1,234,567', f(1234567), '1,234,567');
    ck('999 → 999(쉼표 없음)', f(999), '999');
    ck('0 → 0', f(0), '0');
    ck('-50000 → -50,000', f(-50000), '-50,000');
    ck('★ 소수 자리를 버리지 않는다 1234.56', f(1234.56), '1,234.56');
    ck('  32.5 (리터)', f(32.5), '32.5');
    ck('  0.009 (요율)', f(0.009), '0.009');
    ck('자리수 지정 1234.5 · 2자리', f(1234.5, 2), '1,234.50');
    ck('빈 글자 → 빈 값', '[' + f('') + ']', '[0]');
    ck('숫자가 아니면 빈 값', '[' + f('abc') + ']', '[]');
    ck('글자 숫자도 받는다 "50000"', f('50000'), '50,000');
  }

  console.log('\n③ `numOf` 한 벌 — **「50,000」→50 함정**');
  {
    const p = app({});
    ck('★ (옛 방식) parseInt("50,000")', p.R.ev('parseInt("50,000")'), 50);
    ck('★ numOf("50,000")', p.R.ev('numOf("50,000")'), 50000);
    ck('numOf("1,234,567")', p.R.ev('numOf("1,234,567")'), 1234567);
    ck('numOf("") → 0', p.R.ev('numOf("")'), 0);
    ck('numOf(null) → 0', p.R.ev('numOf(null)'), 0);
    ck('numOf("12.5") → 12.5(소수 지킴)', p.R.ev('numOf("12.5")'), 12.5);
    ck('numOf("-50,000") → -50000', p.R.ev('numOf("-50,000")'), -50000);
    ck('numOf(칸) — 값에서 읽는다',
      p.R.ev('(function(){ var e=document.getElementById("m-monthly"); e.value="1,234,567"; return numOf(e); })()'),
      1234567);
    /* 쓰는 동안 쉼표 · 커서 자리 */
    ck('`fmtAmountInput` 이 쉼표를 넣는다',
      p.R.ev('(function(){ var e=document.getElementById("m-monthly"); e.value="1234567";'
        + ' fmtAmountInput(e); return e.value; })()'), '1,234,567');
    ck('  숫자 아닌 글자는 떼어 낸다',
      p.R.ev('(function(){ var e=document.getElementById("m-monthly"); e.value="12a3b4";'
        + ' fmtAmountInput(e); return e.value; })()'), '1,234');
    ck('  빈 칸은 빈 칸으로',
      '[' + p.R.ev('(function(){ var e=document.getElementById("m-monthly"); e.value="";'
        + ' fmtAmountInput(e); return e.value; })()') + ']', '[]');
  }

  console.log('\n════ ④ ★★ 저장되는 값이 **숫자**인가 (검증 3원칙 B)');
  {
    /* ── 회원 월정액·등록비 ── */
    const p = app({});
    set(p, 'm-name', '다가을'); set(p, 'm-car', 'car1'); set(p, 'm-course', 'c1');
    set(p, 'm-location', '인천 3'); set(p, 'm-phone', '010-3'); set(p, 'm-phone2', '');
    set(p, 'm-note', ''); set(p, 'edit-id', ''); set(p, 'm-pin', '');
    set(p, 'm-monthly', '1,234,567'); set(p, 'm-regfee', '50,000');
    /* 주소는 「검색」으로 고른 것처럼 좌표를 붙여 둔다(안 붙이면 저장이 앞에서 멈춘다) */
    p.R.ev('(function(){ var e=document.getElementById("m-location");'
      + ' e.setAttribute("data-lat","37.41"); e.setAttribute("data-lon","126.68"); })()');
    /* 요일 체크박스 — 앱이 쓰는 id(`d-`+dayIdMap[요일])를 그대로 켠다 */
    p.R.ev('(function(){ DAYS.forEach(function(d){'
      + ' var e=document.getElementById("d-"+dayIdMap[d]); if(e) e.checked=true; }); })()');
    await p.R.ev('saveMember()');
    await new Promise((r) => setTimeout(r, 60));
    const saved = p.R.ev('(function(){ var m=loadMembers().find(function(x){return x.name==="다가을";});'
      + ' return m ? JSON.stringify({monthly:m.monthly, regfee:m.regfee,'
      + ' tM:typeof m.monthly, tR:typeof m.regfee}) : "NOSAVE"; })()');
    ck('★ 월정액·등록비가 **숫자**로 저장됐다', saved,
      JSON.stringify({ monthly: 1234567, regfee: 50000, tM: 'number', tR: 'number' }));
    ck('  (옛 방식이면 50 이 됐을 값이다)', p.R.ev('parseInt("1,234,567")'), 1);

    /* ── 직원 시급·식대 ── */
    const q = app({});
    set(q, 'st-name', '한직원'); set(q, 'st-phone', ''); set(q, 'st-pin', '');
    set(q, 'st-wage', '10,030'); set(q, 'st-meal', '200,000'); set(q, 'st-tax', 'free33');
    await q.R.ev('saveStaffEdit("")');
    await new Promise((r) => setTimeout(r, 60));
    ck('★ 시급·식대가 **숫자**로 저장됐다',
      q.R.ev('(function(){ var s=loadStaff().find(function(x){return x.name==="한직원";});'
        + ' return s ? JSON.stringify({w:s.hourlyWage, m:s.mealAllow,'
        + ' t:typeof s.hourlyWage}) : "NOSAVE"; })()'),
      JSON.stringify({ w: 10030, m: 200000, t: 'number' }));

    /* ── 차계부 계기판 km ── */
    const r2 = app({});
    const odo = r2.R.ev('(function(){ var e=document.getElementById("cl-odo"); e.value="123,456";'
      + ' return numOf(e); })()');
    ck('★ 계기판 km 「123,456」 → 숫자', odo, 123456);
    ck('  (옛 방식) Number("123,456") 은 NaN',
      String(r2.R.ev('String(Number("123,456"))')), 'NaN');
  }

  console.log('\n⑤ **소수가 있는 양은 안 바꿨다** (쉼표를 넣으면 소수가 깨진다)');
  {
    const left = (NEW_SRC.match(/<input[^>]*type="number"/g) || []).length;
    ck('남은 `type="number"` 다섯', left, 5);
    ['id="m-pin"', 'step="0.001"', 'id="cl-liters"', 'id="dcl-liters"', '출퇴근 거리(km/일)']
      .forEach((k) => ck('  그대로 둔 칸: ' + k,
        new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(NEW_SRC), true));
    const p = app({});
    ck('★ 왜 그랬나 — `fmtAmountInput("0.009")` 는 **9** 가 된다',
      p.R.ev('(function(){ var e=document.getElementById("m-monthly"); e.value="0.009";'
        + ' fmtAmountInput(e); return e.value; })()'), '9');
    ck('  그래서 그 칸들은 **보여 줄 때만** 쉼표를 넣는다(`fmtNum`)',
      p.R.ev('fmtNum(32.5)'), '32.5');
  }

  console.log('\n⑥ **번호에는 안 넣는다** — 쉼표가 들어가면 뜻이 달라진다');
  {
    /* 「번호」 칸은 `fmtAmountInput` 을 안 붙였다 — 소스로 확인 */
    const noComma = [['m-pin', '출석 PIN'], ['m-phone', '전화'], ['m-phone2', '전화2'],
      ['org-bizno', '사업자번호'], ['org-bank', '계좌'], ['m-invoice', '송장번호'],
      ['ksk-orgcode', '업체 번호'], ['ksk-code', '출석기기 코드'], ['drv-pin', '기사 PIN']];
    noComma.forEach((c) => {
      const re = new RegExp('id="' + c[0] + '"[^>]*fmtAmountInput');
      const re2 = new RegExp("id=\"'\\+?" + c[0] + "[^>]*fmtAmountInput");
      ck('  ' + c[1] + '(`' + c[0] + '`) 에는 안 붙었다', re.test(NEW_SRC) || re2.test(NEW_SRC), false);
    });
    const p = app({});
    ck('★ 「번호」를 `fmtNum` 으로 그리는 곳이 없다 — 전화번호 꼴은 그대로',
      p.R.ev('(function(){ var m=loadMembers()[0]; return String(m.phone); })()'), '010-1');
  }

  console.log('\n⑦ 엑셀 — **숫자 칸 그대로** + 표시 형식 `#,##0`');
  {
    const p = app({});
    const out = p.R.ev('(function(){'
      + ' var ws={ "!ref":"A1:B3", A1:{t:"s",v:"이름"}, B1:{t:"s",v:"월정액"},'
      + ' A2:{t:"s",v:"가하은"}, B2:{t:"n",v:1234567},'
      + ' A3:{t:"s",v:"연비"}, B3:{t:"n",v:12.34, w:"12.34"} };'
      + ' xlsxNumFmt(ws);'
      + ' return JSON.stringify({ t:ws.B2.t, v:ws.B2.v, z:ws.B2.z,'
      + ' z2:ws.B3.z, w2:(ws.B3.w===undefined?"없음":ws.B3.w), s:ws.A1.z||"없음" }); })()');
    const o = JSON.parse(out);
    ck('★ 값·타입은 그대로(합계가 된다)', o.t + '/' + o.v, 'n/1234567');
    ck('★ 표시 형식 `#,##0`', o.z, '#,##0');
    ck('  소수 칸은 `#,##0.##`', o.z2, '#,##0.##');
    ck('  바꾼 칸의 `w` 는 지운다(공식 문서 안내)', o.w2, '없음');
    ck('  글자 칸은 안 건드린다', o.s, '없음');
    ck('★ 엑셀 시트 만드는 곳 **전수**가 이 함수를 지난다',
      (NEW_SRC.match(/xlsxNumFmt\(XLSX\.utils\.aoa_to_sheet\(/g) || []).length, 15);
    ck('  감싸지 않은 `aoa_to_sheet` 가 없다',
      (NEW_SRC.match(/(?<!xlsxNumFmt\()XLSX\.utils\.aoa_to_sheet\(/g) || []).length, 0);
  }

  console.log('\n⑧ 인쇄·PDF 글 — 급여명세서·거래내역·운행기록부에 쉼표가 있나');
  {
    /* `saveHtmlAsPdf`(또는 새 창)를 가로채 **인쇄에 들어가는 글**을 받아 본다
       (pdf256c.js 가 쓰는 길과 같다 — 거기선 칸 좌표를 재고, 여기선 쉼표를 본다). */
    const ATT = {};
    for (let d = 1; d <= 28; d++) {
      const ds = '2026-10-' + String(d).padStart(2, '0');
      ATT['car1_' + ds] = { in: '08:30', out: '18:00' };
    }
    const grab = (which) => {
      const store = {};
      /* ★ 이 장면은 `_userOrgId` 를 안 세우고 띄우므로 기기 칸 꼬리가 **되돌림 값**이다
         (pdf256c 와 같다). `__B` 로 넣으면 앱이 못 읽어 **빈 양식**이 나온다(처음에 그랬다). */
      const DSUF = '__cosroad_default';
      const put = (k, v) => { store[k + DSUF] = JSON.stringify(v); };
      put('tkd_cars', [{ id: 'car1', name: '1호차', driver: '박기사',
        hourlyWage: 10030, mealAllow: 200000, taxMode: 'free33', commuteKm: 20 }]);
      put('tkd_members', [{ id: 1, name: '가나다물류', courseId: 'c1', carId: 'car1',
        location: '인천 연수구 1', lat: 37.4, lon: 126.7, phone: '010-1', days: D7, on: true,
        bizNo: '635-88-02710', ceo: '문준식' }]);
      put('tkd_courses', COURSES);
      put('tkd_org', { name: '프리존물류', bizNo: '635-88-02710', ceo: '문준식' });
      put('tkd_staff', []); put('tkd_driver_att', ATT); put('tkd_attendance', {});
      put('tkd_payments', {}); put('tkd_tax', {});
      put('tkd_carlog', { records: [{ id: 'r1', carId: 'car1', date: '2026-10-05', type: 'fuel',
        item: '주유', amount: 123456, liters: 32.5, odo: 123456 }], plans: {} });
      put('tkd_invoices', [{ id: 'inv1', date: '2026-10-05', memberId: 1, clientName: '가나다물류',
        kind: 'out', items: [{ name: '세탁볼', qty: 1200, price: 12000, amount: 14400000 }],
        supply: 14400000, vat: 1440000, total: 15840000, paid: 1260000, memo: '' }]);
      put('tkd_products', []);
      const R = E.build({ src: NEW_SRC, biz: 'logistics', localStorage: store });
      if (R.error) throw R.error;
      ['admin-content', 'app-content', 'pv-modal'].forEach((id) => {
        const el = E.makeEl('div'); el.id = id;
        el.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
        R.document.registerId(id, el);
      });
      let got = null;
      const cap = (html, name, css) => { got = { html: html, css: css }; };
      R.sandbox.saveHtmlAsPdf = cap; R.win.saveHtmlAsPdf = cap;
      let written = '';
      const fakeWin = { document: { write(h) { written += String(h); }, close() {}, title: '' },
        focus() {}, print() {}, close() {}, onload: null, addEventListener() {} };
      R.sandbox.window.open = R.win.open = () => fakeWin;
      R.sandbox.open = () => fakeWin;
      R.ev("currentMode='admin';");
      try {
        if (which === 'payslip') { R.ev("pvYm='2026-10';"); R.sandbox.pvPrint(); }
        if (which === 'range') {
          R.ev("clientRangeMemberId=1; clientRangeStart='2026-10'; clientRangeEnd='2026-10';");
          R.sandbox.printClientRange();
        }
        if (which === 'drivelog') { R.ev("dlvCarId='car1'; dlvYm='2026-10';"); R.sandbox.dlvPrint(); }
      } catch (e) { return { err: e.message }; }
      if (got) return got;
      if (written.length > 300) return { html: written, css: '' };
      return { err: '인쇄 글을 못 받았다' };
    };
    /* 네 자리 이상 숫자 **바로 뒤에 단위**가 붙은 자리 — 날짜·전화·사업자번호는 안 걸린다 */
    const BAD = /(?<![\d,])\d{4,}\s*(원|명|건|대|개|km|L)(?![a-zA-Z가-힣])/g;
    ['payslip', 'range', 'drivelog'].forEach((w) => {
      const g = grab(w);
      if (g.err) { ck('[' + w + '] 인쇄 글을 받았다', g.err, '받았다'); return; }
      const txt = String(g.html || '').replace(/<[^>]*>/g, ' ');
      const hits = (txt.match(BAD) || []);
      ck('[' + w + '] 인쇄 글 길이', String(g.html).length > 500, true);
      ck('★ [' + w + '] 쉼표 없는 「양」', hits.length ? hits.slice(0, 5).join(' | ') : '0곳', '0곳');
      ck('  [' + w + '] 쉼표가 실제로 들어 있다', /\d,\d{3}/.test(txt), true);
    });
  }

  console.log('\n⑨ 소스 전수 — 한 벌로 모였나');
  {
    ck('`fmtNum` 한 벌', (NEW_SRC.match(/^function fmtNum\(/mg) || []).length, 1);
    ck('`numOf` 한 벌', (NEW_SRC.match(/^function numOf\(/mg) || []).length, 1);
    ck('`xlsxNumFmt` 한 벌', (NEW_SRC.match(/^function xlsxNumFmt\(/mg) || []).length, 1);
    /* 안쪽 포맷 함수 **다섯**이 `fmtNum` 을 쓴다 — `won()` 셋 · `num()` 하나 · `_certComma` 하나 */
    ck('★ 안쪽 `won()`·`num()`·`_certComma` 가 `fmtNum` 을 쓴다',
      (NEW_SRC.match(/fmtNum\(v\)|fmtNum\(Number\(n\)\|\|0\)/g) || []).length, 5);
    ck('  `parseAmountInput` 도 `numOf` 를 쓴다', /return Math\.trunc\(numOf\(el\)\) \|\| 0;/.test(NEW_SRC), true);
    ck('  `fmtAmountInput` 이 커서 자리를 지킨다', /setSelectionRange\(pos, pos\)/.test(NEW_SRC), true);
    ck('  (대조) 옛 판에는 `fmtNum`·`numOf` 가 없었다',
      /function fmtNum\(|function numOf\(/.test(OLD_SRC), false);
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    ck('  버전 301 이상', appV >= 301, true);
    ck('  `version.json` 과 같다',
      String(JSON.parse(fs.readFileSync(COS_ROOT + '/version.json', 'utf8')).version), String(appV));
    ck('★ `api/`·`lib/`·규칙은 **한 줄도** 안 바뀌었다',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' ' + THIS_REF + ' -- api lib firestore.rules',
        { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 가짜 fetch · 실제 쓰기 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
