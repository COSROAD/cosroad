/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v264 앱 검사 — 요금(상품 고르기) · 날짜 칸 달력 · 켜 둔 채 만료 → 읽기 전용
   전: 269231d (v263) · 후: 작업 중 */
process.env.COS_SRC_OLD_REF = process.env.COS_SRC_OLD_REF || '269231d';
const fs = require('fs');
const cp = require('child_process');
const E = require('./env246.js');
const { build, SRC_NEW, makeEl } = E;
const SRC_OLD = cp.execSync('git -C ' + COS_ROOT + ' show 269231d:index.html', { maxBuffer: 1 << 28 }).toString();

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 66)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
            .map(l => l.replace(/(^|[^:'"\\])\/\/.*$/, '$1')).join('\n');
}
const NEWC = codeOnly(SRC_NEW), OLDC = codeOnly(SRC_OLD);
const DAY = 86400000;

const htmlOf = (B) => B.bodyKids.map(x => x._html || '').join('');
function regIds(B, ids) {
  ids.forEach(id => { const el = makeEl('input'); el.id = id; B.document.registerId(id, el); });
}

(async () => {

/* ══ ① 가격 — 기본값과 billing 값 ═══════════════════════════════════════ */
console.log('\n① 가격 (priceOf · priceTrialDays)');
{
  const B = build({ src: SRC_NEW });
  const S = B.sandbox;
  ck('기본 월간', S.priceOf('priceMonthly'), 50000);
  ck('기본 연간', S.priceOf('priceYearly'), 480000);
  ck('기본 6개월 할인', S.priceOf('promo6m'), 180000);
  ck('기본 1년 할인', S.priceOf('promo12m'), 310000);
  ck('기본 체험 일수', S.priceTrialDays(), 30);
  S._billingInfo = { priceMonthly: 60000, promo6m: '200,000', trialDays: 14 };
  ck('billing 값이 이긴다 — 월간', S.priceOf('priceMonthly'), 60000);
  ck('  쉼표가 섞여 있어도 읽는다', S.priceOf('promo6m'), 200000);
  ck('  체험 일수도', S.priceTrialDays(), 14);
  ck('  안 넣은 칸은 기본값', S.priceOf('priceYearly'), 480000);
  S._billingInfo = { priceMonthly: 0, trialDays: '' };
  ck('0원은 기본값으로', S.priceOf('priceMonthly'), 50000);
  ck('빈 칸이면 기본 체험 일수', S.priceTrialDays(), 30);
  S._billingInfo = { trialDays: 'abc' };
  ck('글자만 있으면 기본 체험 일수 (0일 아님)', S.priceTrialDays(), 30);
  S._billingInfo = { trialDays: 0 };
  ck('0일은 0일 그대로', S.priceTrialDays(), 0);
  S._billingInfo = null;
  ck('상품 금액 — monthly', S.planAmountOf('monthly'), 50000);
  ck('상품 금액 — promo12m', S.planAmountOf('promo12m'), 310000);
  ck('상품 개월 — promo6m', S.PRICE_PLANS.promo6m.months, 6);
  ck('상품 개월 — yearly', S.PRICE_PLANS.yearly.months, 12);
  ck('천 단위 쉼표', S.priceWon(1234567), '1,234,567');
}

/* ══ ② 안내 문구 — 앱과 서버가 **같은 글** ═════════════════════════════ */
console.log('\n② 안내 문구 (앱 priceNoticeLines ↔ 서버 lib/price.js)');
{
  const B = build({ src: SRC_NEW });
  const price = await import('file:///' + COS_ROOT + '/lib/price.js');
  for (const billing of [null, { promo6m: 200000, priceYearly: 500000, trialDays: 14 }, { trialDays: 0 }]) {
    B.sandbox._billingInfo = billing;
    const app = B.sandbox.priceNoticeLines().join(' · ');
    const srv = price.priceNotice(billing || {});
    ck('같은 글 (' + JSON.stringify(billing) + ')', app === srv, true);
  }
  B.sandbox._billingInfo = null;
  ck('  대조 — 다르면 잡힌다', B.sandbox.priceNoticeLines().join(' · ') === price.priceNotice({ promo6m: 1 }), false);
  const html = B.sandbox.priceNoticeHtml();
  ck('HTML 로도 낸다 (<br> 로 끊는다)', /6개월 180,000원.*<br>.*월 50,000원/.test(html), true);
  ck('  꺾쇠는 escape 된다', /<b>|<script/.test(B.sandbox.priceNoticeHtml()), false);
}

/* ══ ③ 마스터 승인 창 — 상품 고르기 ═══════════════════════════════════ */
console.log('\n③ 승인 창 — 상품 고르면 개월·금액이 채워진다');
{
  const B = build({ src: SRC_NEW });
  const calls = [];
  B.sandbox.driverAcctApi = async (body) => {
    calls.push(body);
    if (body.action === 'bizPromoStatus') return { ok: true, hasBizNo: true, used: false, usedStr: null };
    return { ok: true, trialEndStr: '2026-12-04', paidUntilStr: '2027-06-04' };
  };
  B.sandbox.loadSignupUsers = async () => {}; B.sandbox.drawMasterPanel = () => {};
  B.sandbox.alert = () => {}; B.win.alert = B.sandbox.alert;
  regIds(B, ['mp-trial', 'mp-months', 'mp-amount', 'mp-memo', 'mp-err', 'mp-prev', 'mp-plans']);

  await B.sandbox.masterApproveAsk('UID1', '가온학원');
  ck('창을 열 때 할인 여부를 먼저 묻는다', calls[0] && calls[0].action, 'bizPromoStatus');
  const plans = B.document.getElementById('mp-plans')._html || '';
  ck('  상품 다섯이 보인다',
    ['promo6m', 'promo12m', 'monthly', 'yearly', 'custom'].every(p => plans.indexOf('masterPickPlan("' + p + '")') >= 0
      || plans.indexOf("masterPickPlan(&quot;" + p + "&quot;)") >= 0), true);
  ck('  할인 금액이 적혀 있다', /첫 결제 6개월 · 180,000원/.test(plans), true);
  ck('  정가도 적혀 있다', /월간 · 50,000원/.test(plans) && /연간 · 480,000원/.test(plans), true);
  ck('  할인이 가능하면 disabled 가 아니다', /disabled [^>]*masterPickPlan\(&quot;promo6m/.test(plans), false);
  ck('체험 일수 기본값 = billing', /id="mp-trial"[^>]*value="30"/.test(htmlOf(B)), true);

  /* 고르면 채워진다 */
  B.sandbox.masterPickPlan('promo6m');
  ck('promo6m → 개월 6', B.document.getElementById('mp-months').value, '6');
  ck('        → 금액 180,000', B.document.getElementById('mp-amount').value, '180,000');
  B.sandbox.masterPickPlan('yearly');
  ck('yearly → 개월 12', B.document.getElementById('mp-months').value, '12');
  ck('       → 금액 480,000', B.document.getElementById('mp-amount').value, '480,000');
  B.sandbox.masterPickPlan('monthly');
  ck('monthly → 개월 1 · 50,000',
    B.document.getElementById('mp-months').value + '/' + B.document.getElementById('mp-amount').value, '1/50,000');

  /* 손으로 고치면 「직접 입력」으로 돌아간다 */
  B.sandbox.masterPickPlan('promo12m');
  B.sandbox.masterPlanDirty();
  B.document.getElementById('mp-months').value = '7';
  B.document.getElementById('mp-amount').value = '123,000';
  B.document.getElementById('mp-memo').value = '홍길동';
  await B.sandbox.masterApproveGo('UID1');
  const apv = calls[calls.length - 1];
  ck('개월을 고치면 plan=custom 으로 간다', apv.plan, 'custom');
  ck('  그때 개월수는 손으로 넣은 값', apv.months, 7);
  ck('  금액은 숫자로', apv.amount, 123000);

  /* 고른 그대로면 그 plan 으로 간다 */
  const B2 = build({ src: SRC_NEW });
  const c2 = [];
  B2.sandbox.driverAcctApi = async (b) => { c2.push(b); return b.action === 'bizPromoStatus'
    ? { ok: true, hasBizNo: true, used: false } : { ok: true }; };
  B2.sandbox.loadSignupUsers = async () => {}; B2.sandbox.drawMasterPanel = () => {};
  B2.sandbox.alert = () => {}; B2.win.alert = B2.sandbox.alert;
  regIds(B2, ['mp-trial', 'mp-months', 'mp-amount', 'mp-memo', 'mp-err', 'mp-prev', 'mp-plans']);
  await B2.sandbox.masterApproveAsk('UID1', '가온학원');
  B2.document.getElementById('mp-trial').value = '30';
  B2.sandbox.masterPickPlan('promo6m');
  await B2.sandbox.masterApproveGo('UID1');
  ck('고른 그대로 보내면 plan=promo6m', c2[c2.length - 1].plan, 'promo6m');
  ck('  개월은 6', c2[c2.length - 1].months, 6);
}

/* ══ ④ 이미 받은 사업자 · 사업자 칸 없는 계정 ═════════════════════════ */
console.log('\n④ 할인을 못 쓰는 두 경우 — 회색 + 사유');
{
  for (const [st, why] of [[{ ok: true, hasBizNo: true, used: true, usedStr: '2026-10-01' }, '이미 받았어요'],
                           [{ ok: true, hasBizNo: false, used: false }, '사업자 정보가 없는']]) {
    const B = build({ src: SRC_NEW });
    B.sandbox.driverAcctApi = async (b) => (b.action === 'bizPromoStatus' ? st : { ok: true });
    B.sandbox.loadSignupUsers = async () => {}; B.sandbox.drawMasterPanel = () => {};
    B.sandbox.alert = () => {}; B.win.alert = B.sandbox.alert;
    regIds(B, ['mp-trial', 'mp-months', 'mp-amount', 'mp-memo', 'mp-err', 'mp-prev', 'mp-plans']);
    await B.sandbox.masterApproveAsk('UID1', '가온학원');
    const plans = B.document.getElementById('mp-plans')._html || '';
    ck(why + ' → 할인 단추가 잠긴다', (plans.match(/disabled /g) || []).length, 2);
    ck('  사유가 보인다', plans.indexOf(why) >= 0, true);
    if (st.used) ck('  받은 날짜도 보인다', /2026-10-01/.test(plans), true);
    ck('  정가는 그대로 고를 수 있다', /masterPickPlan\(&quot;monthly&quot;\)/.test(plans)
       || plans.indexOf('masterPickPlan("monthly")') >= 0, true);
  }
  /* 서버에 못 물어봤으면 할인을 못 고르게 둔다 */
  const B = build({ src: SRC_NEW });
  B.sandbox.driverAcctApi = async () => { throw new Error('network'); };
  B.sandbox.loadSignupUsers = async () => {}; B.sandbox.drawMasterPanel = () => {};
  B.sandbox.alert = () => {}; B.win.alert = B.sandbox.alert;
  regIds(B, ['mp-trial', 'mp-months', 'mp-amount', 'mp-memo', 'mp-err', 'mp-prev', 'mp-plans']);
  await B.sandbox.masterApproveAsk('UID1', '가온학원');
  const plans = B.document.getElementById('mp-plans')._html || '';
  ck('서버에 못 물어보면 할인이 잠긴다', (plans.match(/disabled /g) || []).length, 2);
}

/* ══ ⑤ 연장 창 — 정가만 ════════════════════════════════════════════════ */
console.log('\n⑤ 연장 창 — 할인은 없다');
{
  const B = build({ src: SRC_NEW });
  const calls = [];
  B.sandbox.driverAcctApi = async (b) => { calls.push(b); return { ok: true, paidUntilStr: '2028-06-04' }; };
  B.sandbox.loadSignupUsers = async () => {}; B.sandbox.drawMasterPanel = () => {};
  B.sandbox.alert = () => {}; B.win.alert = B.sandbox.alert;
  regIds(B, ['mpx-months', 'mpx-amount', 'mpx-memo', 'mpx-err', 'mpx-plans']);
  B.sandbox.masterExtendAsk('UID1', '가온학원', '2027-06-04');
  const html = htmlOf(B);
  ck('연장 창이 열린다', /id="mp-extend"/.test(html), true);
  ck('  연장은 정가라고 적혀 있다', /연장은 정가예요/.test(html), true);
  ck('  할인 상품이 없다', /첫 결제/.test(html), false);
  B.sandbox.masterPickExtendPlan('yearly');
  ck('연간 고르면 12개월·480,000',
    B.document.getElementById('mpx-months').value + '/' + B.document.getElementById('mpx-amount').value,
    '12/480,000');
  await B.sandbox.masterExtendGo('UID1');
  ck('plan 을 함께 보낸다', calls[calls.length - 1].plan, 'yearly');
  B.sandbox.masterExtendDirty();
  B.document.getElementById('mpx-months').value = '3';
  await B.sandbox.masterExtendGo('UID1');
  ck('손으로 고치면 custom', calls[calls.length - 1].plan, 'custom');
  ck('  개월은 손으로 넣은 값', calls[calls.length - 1].months, 3);
}

/* ══ ⑥ 날짜 칸 — 달력으로 ═════════════════════════════════════════════ */
console.log('\n⑥ 날짜 칸 2곳이 달력이 됐다');
{
  const B = build({ src: SRC_NEW });
  B.sandbox.masterSetPeriodAsk('UID1', '가온학원', '2027-06-30');
  const html = htmlOf(B);
  ck('mps-until 이 type="date"', /id="mps-until" type="date"/.test(html), true);
  ck('  기본값 = 지금 이용 끝', /id="mps-until"[^>]*value="2027-06-30"/.test(html), true);
  ck('  min = 오늘', new RegExp('id="mps-until"[^>]*min="' + B.sandbox.todayStr() + '"').test(html), true);
  const B2 = build({ src: SRC_NEW });
  B2.sandbox.masterSetPeriodAsk('UID2', '새업체', '');
  ck('  이용 끝이 없으면 오늘+1년', new RegExp('value="' + B2.sandbox.periodPlusYearStr() + '"')
     .test(htmlOf(B2)), true);
  ck('  오늘+1년 꼴', /^\d{4}-\d{2}-\d{2}$/.test(B2.sandbox.periodPlusYearStr()), true);

  const B3 = build({ src: SRC_NEW });
  B3.sandbox.openSignupModal ? B3.sandbox.openSignupModal() : null;
  const sh = htmlOf(B3);
  ck('su-open 이 type="date"', /id="su-open" type="date"/.test(sh), true);
  ck('  max = 오늘', new RegExp('id="su-open"[^>]*max="' + B3.sandbox.todayStr() + '"').test(sh), true);
  /* 국세청에 보내는 값이 YYYYMMDD 로 바뀌는가 */
  const el = makeEl('input'); el.id = 'su-open'; el.value = '2020-03-01';
  B3.document.registerId('su-open', el);
  const e2 = makeEl('input'); e2.id = 'su-bizno'; e2.value = '211-88-11430'; B3.document.registerId('su-bizno', e2);
  const e3 = makeEl('input'); e3.id = 'su-ceo'; e3.value = '홍길동'; B3.document.registerId('su-ceo', e3);
  const got = B3.sandbox.suBizFields ? B3.sandbox.suBizFields() : null;
  if (got) {
    ck('달력 값 → 국세청 start_dt = YYYYMMDD', got.start_dt, '20200301');
  } else {
    /* 함수 이름이 다르면 소스로 확인한다 (코드 길 전수) */
    ck('start_dt 는 숫자만 뽑아 보낸다',
      /start_dt: String\(\(document\.getElementById\('su-open'\)\|\|\{\}\)\.value\|\|''\)\.replace\(\/\[\^0-9\]\/g,''\)/.test(SRC_NEW), true);
  }
  ck('글자로 받는 날짜 칸이 더 없다 (전수)',
    (SRC_NEW.match(/<input[^>]*(?:날짜|일자)[^>]*type="(?:text|tel)"/g) || []).length, 0);
  ck('  (대조) 옛 판에는 두 곳이 글자였다',
    /id="mps-until" type="text"/.test(SRC_OLD) && /id="su-open" type="tel"/.test(SRC_OLD), true);
}

/* ══ ⑦ 켜 둔 채 만료되면 읽기 전용으로 ════════════════════════════════ */
console.log('\n⑦ 켜 둔 채 만료 → 읽기 전용');
{
  const B = build({ src: SRC_NEW });
  const S = B.sandbox;
  B.win._userUid = 'UID123456789012'; B.win._isDriverAcct = false;
  S.getUrlOrg = () => 'academy_UID123456789';
  const app = makeEl('div'); app.id = 'main-app'; app.style.display = 'block';
  B.document.registerId('main-app', app);
  let alerted = '';
  S.alert = (m) => { alerted = String(m); }; B.win.alert = S.alert;

  /* 아직 안 끝났으면 아무 일도 없다 */
  B.win._userPaidUntil = Date.now() + 5 * DAY; B.win._userTrialEnd = Date.now() - DAY;
  S.periodCheckNow();
  ck('기간이 남았으면 그대로', S.isReadOnlyMode(), false);
  ck('  안내도 안 뜬다', alerted, '');
  /* 자정을 넘겼다 */
  B.win._userPaidUntil = Date.now() - 1000;
  S.periodCheckNow();
  ck('끝나면 읽기 전용으로 바뀐다', S.isReadOnlyMode(), true);
  ck('  안내가 뜬다', /이용 기간이 끝났어요/.test(alerted), true);
  ck('  읽기 전용 띠가 붙는다', /readonly-bar/.test(app._html || '') || app.children.some(c => c.id === 'readonly-bar'), true);
  /* 두 번째로 불러도 한 번만 */
  alerted = '';
  S.periodCheckNow();
  ck('두 번째로 불러도 안내는 안 뜬다', alerted, '');

  /* 기사·둘러보기는 건드리지 않는다 */
  const B2 = build({ src: SRC_NEW });
  B2.win._userUid = 'drv_x'; B2.win._isDriverAcct = true;
  B2.sandbox.getUrlOrg = () => 'academy_UID123456789';
  B2.win._userPaidUntil = Date.now() - 1000;
  const app2 = makeEl('div'); app2.id = 'main-app'; app2.style.display = 'block';
  B2.document.registerId('main-app', app2);
  B2.sandbox.periodCheckNow();
  ck('기사는 건드리지 않는다', B2.sandbox.isReadOnlyMode(), false);

  ck('10분마다 다시 본다', /setInterval\(periodCheckNow, 600000\)/.test(NEWC), true);
  ck('화면이 다시 보일 때도 본다', /visibilitychange[\s\S]{0,120}periodCheckNow/.test(NEWC), true);
  ck('로그인 두 길에서 모두 건다', (NEWC.match(/startPeriodWatch\(\);/g) || []).length, 2);
  ck('  (대조) 옛 판에는 없다', /startPeriodWatch/.test(OLDC), false);
}

/* ══ ⑧ 옛 `fee` 칸은 사라졌다 · billing 저장 칸 ═══════════════════════ */
console.log('\n⑧ 요금 칸 (billing)');
{
  const feeLines = (s) => s.split('\n').filter(l => /\bb\.fee\b|_b\.fee\b|bill-fee/.test(l)).length;
  ck('fee 를 읽는 곳 0', feeLines(NEWC), 0);
  ck('  (대조) 옛 판에는 4줄 있었다 (승인대기·만료안내·저장·입력칸)', feeLines(OLDC), 4);
  ['bill-pm', 'bill-py', 'bill-p6', 'bill-p12', 'bill-td'].forEach(id =>
    ck('입력 칸 ' + id, new RegExp("'" + id + "'").test(SRC_NEW), true));
  const B = build({ src: SRC_NEW });
  const S = B.sandbox;
  const saved = [];
  S._db = {}; S._firestore = { doc: (...a) => a.join('/'), setDoc: async (p, rec) => { saved.push(rec); } };
  B.win._db = S._db; B.win._firestore = S._firestore;
  S.alert = () => {}; B.win.alert = S.alert;
  const vals = { 'bill-bank': '농협', 'bill-account': '301-1234', 'bill-holder': '프리존',
                 'bill-note': '', 'bill-notify': '', 'bill-pm': '60,000', 'bill-py': '',
                 'bill-p6': '200,000', 'bill-p12': '', 'bill-td': '14' };
  Object.keys(vals).forEach(id => { const el = makeEl('input'); el.id = id; el.value = vals[id]; B.document.registerId(id, el); });
  await S.saveBillingInfo();
  ck('저장 1건', saved.length, 1);
  const rec = saved[0] || {};
  ck('  금액은 **숫자**로 담긴다', rec.priceMonthly, 60000);
  ck('  쉼표를 뗀다', rec.promo6m, 200000);
  ck('  체험 일수', rec.trialDays, 14);
  ck('  빈 칸은 아예 안 담는다 (기본값이 쓰이게)', ('priceYearly' in rec) || ('promo12m' in rec), false);
  ck('  fee 칸은 담지 않는다', 'fee' in rec, false);
  ck('  계좌는 그대로', [rec.bank, rec.account, rec.holder].join('/'), '농협/301-1234/프리존');
  /* 체험 일수가 범위를 벗어나면 막는다 */
  const B2 = build({ src: SRC_NEW });
  const saved2 = []; let msg = '';
  B2.sandbox._db = {}; B2.sandbox._firestore = { doc: (...a) => a.join('/'), setDoc: async (p, r) => { saved2.push(r); } };
  B2.win._db = B2.sandbox._db; B2.win._firestore = B2.sandbox._firestore;
  B2.sandbox.alert = (m) => { msg = String(m); }; B2.win.alert = B2.sandbox.alert;
  Object.keys(vals).forEach(id => { const el = makeEl('input'); el.id = id; el.value = (id === 'bill-td' ? '999' : vals[id]); B2.document.registerId(id, el); });
  await B2.sandbox.saveBillingInfo();
  ck('체험 일수 999 → 막는다', saved2.length, 0);
  ck('  까닭을 말해 준다', /0~365/.test(msg), true);
  /* 쉼표 넣기 */
  const el = makeEl('input'); el.value = '180000';
  B.sandbox.masterPriceFmt(el);
  ck('치는 동안 쉼표를 넣어 준다', el.value, '180,000');
}

/* ══ ⑨ 문구 — 승인 대기·만료 안내·문답표 ═════════════════════════════ */
console.log('\n⑨ 문구');
{
  const B = build({ src: SRC_NEW });
  const qa = B.sandbox.HELP_QA;
  const t = (s) => qa.filter(x => x.t === s)[0];
  /* v265·v266 이 하나씩 더 더했다 (72 → 73) */
  /* ★ 회차마다 문답이 늘어난다(v270 +1). 못 박는 대신 「줄지 않았고 지금 수를 안다」로 바꿨다. */
  ck('문답 수 (73 이상)', (qa.length >= 73) + ' / ' + qa.length, 'true / ' + qa.length);
  const nq = t('첫 결제 할인은요?');
  ck('새 문답 「첫 결제 할인은요?」', !!nq, true);
  ck('  검색어에 「할인」', (nq.keys || []).indexOf('할인') >= 0, true);
  ck('  검색어에 「첫결제」', (nq.keys || []).indexOf('첫결제') >= 0, true);
  /* 검색어는 **소문자·공백 없음**이어야 한다(helperNorm 이 양쪽에서 공백을 떼므로
     공백이 든 검색어는 영영 안 맞는다 — m_qa257 이 보는 규칙). */
  ck('  검색어에 공백이 없다', (nq.keys || []).some(k => /\s/.test(k)), false);
  ck('  사업자당 1회를 적는다', /사업자등록번호당 한 번/.test(nq.a), true);
  ck('  연장은 정가라고 적는다', /연장은 정가/.test(nq.a), true);
  ck('  두 금액이 다 적혀 있다', /180,000/.test(nq.a) && /310,000/.test(nq.a), true);
  const q2 = t('이용 기간 · 연장');
  ck('「이용 기간 · 연장」에 요금 줄이 생겼다', /첫 결제 할인 6개월 180,000원/.test(q2.a), true);
  ck('  검색어에 「가격」·「얼마」', (q2.keys || []).indexOf('가격') >= 0 && (q2.keys || []).indexOf('얼마') >= 0, true);
  const q3 = t('승인 대기 화면이 나와요');
  ck('「승인 대기」에도 요금 줄', /첫 결제 할인/.test(q3.a), true);
  ck('  번호가 1~6 으로 이어진다', /6\. 계좌가 안 보이면/.test(q3.a), true);
  /* 「코스」가 실제로 찾아내는가 */
  const ans = B.sandbox.helperAnswer ? B.sandbox.helperAnswer('첫 결제 할인 얼마예요?') : null;
  if (ans) ck('도우미가 그 문답을 찾는다', /180,000|사업자등록번호당/.test(JSON.stringify(ans)), true);
  else ck('helperAnswer 가 있다', typeof B.sandbox.helperAnswer, 'function');
  /* 화면 문구 */
  ck('승인 대기 화면이 priceNoticeHtml 을 쓴다',
    /승인 대기 화면[\s\S]{0,4000}priceNoticeHtml\(\)/.test(SRC_NEW), true);
  ck('만료 안내는 **정가**만 적는다(할인은 한 번뿐)', /연장 요금 — 월 '\+priceWon/.test(SRC_NEW), true);
}

/* ══ ⑩ home.html ══════════════════════════════════════════════════════ */
console.log('\n⑩ home.html 요금 영역');
{
  const H = fs.readFileSync('' + COS_ROOT + '/home.html', 'utf8');
  const HO = cp.execSync('git -C ' + COS_ROOT + ' show 269231d:home.html', { maxBuffer: 1 << 26 }).toString();
  ck('정가 두 장 그대로', /월 <\/span>50,000/.test(H) && /연 <\/span>480,000/.test(H), true);
  ck('첫 결제 할인 띠가 생겼다', /🎁 첫 결제 할인/.test(H), true);
  ck('  6개월 180,000', />180,000</.test(H), true);
  ck('  1년 310,000', />310,000</.test(H), true);
  ck('  사업자당 1회', /사업자등록번호당 <b>1회<\/b>/.test(H), true);
  ck('  이후 정가 연장', /할인 기간이 끝난 뒤 연장은 정가/.test(H), true);
  ck('「즉시 개통」이 사라졌다', /즉시 개통/.test(H), false);
  ck('  (대조) 옛 판에는 2곳 있었다', (HO.match(/즉시 개통/g) || []).length, 2);
  ck('「입금 확인 후 승인 (보통 당일)」로 바뀌었다', (H.match(/입금 확인 후 승인 \(보통 당일\)/g) || []).length, 2);
  ck('「가입 즉시 30일 무료 체험」이 사라졌다', /가입 즉시 30일 무료 체험/.test(H), false);
  ck('  (대조) 옛 판에는 있었다', /가입 즉시 30일 무료 체험/.test(HO), true);
  ck('「입금 확인 후 30일 체험이 먼저」로 바뀌었다', /입금 확인 후 30일 체험이 먼저 시작돼요/.test(H), true);
  ck('챗봇 요금 문답에 할인이 들어갔다', /🎁 첫 결제 할인 \(사업자등록번호당 1회\)/.test(H), true);
  ck('챗봇 결제 문답도 같은 뜻', /입금이 확인되면 승인해 드리고\(보통 당일\)/.test(H), true);
  ck('연간 20% 배지는 그대로 (정가끼리 비교)', /🏷 20% 할인/.test(H), true);
  /* ★ v271 이 약관을 고쳤다(환불 규정). 작업트리와 비교하면 거짓 실패가 난다 —
     이 묶음이 지켜야 할 것은 「**그 회차가** terms.html 을 안 건드렸다」이고,
     그것은 회차의 커밋 둘을 맞대면 앞으로도 그대로 확인된다. */
  ck('v264 회차는 terms.html 을 안 건드렸다',
    cp.execSync('git -C ' + COS_ROOT + ' diff --name-only 269231d 18c90a7 -- terms.html').toString().trim(), '');
}

/* ══ ⑪ 버전 ═══════════════════════════════════════════════════════════ */
console.log('\n⑪ 버전');
{
  const vj = JSON.parse(fs.readFileSync('' + COS_ROOT + '/version.json', 'utf8'));
  const av = Number((SRC_NEW.match(/const APP_VERSION = (\d+);/) || [])[1]);
  /* v265: 홈 문구·문답 번호 회차로 또 하나 올랐다 */
  /* ★ v267 에서 버전이 267 로 올랐다. 이 묶음이 지켜야 할 것은 「그 회차 버전 **이상**이고
     두 값이 같다」는 것이라, 숫자를 못 박는 대신 그렇게 바꿨다(앞선 묶음들과 같은 방식). */
  ck('APP_VERSION · version.json (264 이상 · 둘이 같음)', (av >= 264 && av === vj.version) + ' / ' + av, 'true / ' + av);
  ck('옛 판은 263', Number((SRC_OLD.match(/const APP_VERSION = (\d+);/) || [])[1]), 263);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e && e.stack || e); process.exit(1); });
