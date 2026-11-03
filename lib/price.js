// COSROAD — 요금 한 벌 (v264)
// 쓰는 곳: api/admin-account.js (승인·연장) · api/signup.js (신청자 안내 문자)
//
// 왜 따로 뺐나 — 금액이 두 군데에 적히면 한쪽만 고쳐져 「문자에는 18만, 승인 창에는 20만」이 된다.
//   값은 **마스터가 넣는 orgs/_master/data/billing** 이 먼저고, 비어 있으면 여기 기본값을 쓴다.
//
// ★ api/ 밖에 둔 이유 — Vercel 공식 문서(/docs/functions/runtimes/node-js):
//   "Keep shared utilities and route modules outside `api/` and import them from your function entry point."
//   (lib/otp-core.js · lib/period.js 와 같은 자리·같은 이유)
//
// ── 사장님 확정 요금 (11-03) ──────────────────────────────────────────────
//   정가      월간 50,000 / 연간 480,000        (VAT 별도)
//   첫 결제   6개월 180,000 / 1년 310,000       (VAT 별도, **사업자등록번호당 1회**)
//   첫 결제 할인이 끝난 뒤 연장은 **정가**다.
//
// ★ 가격을 바꿀 때 **같이 고칠 곳**은 CLAUDE.md 「가격 바꿀 때 같이 고칠 곳」에 적어 두었다.
//   (이 파일 · index.html PRICE_DEFAULT · home.html 글자 · 마스터 패널 입력값)

export const PRICE_DEFAULT = {
  priceMonthly: 50000,
  priceYearly: 480000,
  promo6m: 180000,
  promo12m: 310000,
  trialDays: 30
};

/* 상품 — 개월수는 **코드가 정한다**(마스터가 금액만 고친다).
   'custom' 은 개월·금액을 마스터가 직접 넣는 자리라 여기 없다. */
export const PLANS = {
  promo6m:  { months: 6,  key: 'promo6m',      promo: true,  label: '첫 결제 6개월' },
  promo12m: { months: 12, key: 'promo12m',     promo: true,  label: '첫 결제 1년' },
  monthly:  { months: 1,  key: 'priceMonthly', promo: false, label: '월간' },
  yearly:   { months: 12, key: 'priceYearly',  promo: false, label: '연간' }
};

/* billing 문서에서 숫자를 꺼낸다 — 비었거나 숫자가 아니면 기본값.
   (마스터 입력 칸이 비어 있어도 안내 문구가 0원으로 나가지 않게 한다) */
export function priceOf(billing, key) {
  const raw = billing && billing[key];
  const n = Number(String(raw === undefined || raw === null ? '' : raw).replace(/[^0-9]/g, ''));
  return (Number.isFinite(n) && n > 0) ? n : PRICE_DEFAULT[key];
}

/* 체험 일수만 0 을 허용한다(0 = 체험 없이 바로 계약) */
export function trialDaysOf(billing) {
  const raw = billing && billing.trialDays;
  if (raw === undefined || raw === null || String(raw).trim() === '') return PRICE_DEFAULT.trialDays;
  const s = String(raw).replace(/[^0-9]/g, '');
  if (s === '') return PRICE_DEFAULT.trialDays;        // 글자만 들어 있으면 0일이 아니라 기본값
  const n = Number(s);
  return (Number.isInteger(n) && n >= 0 && n <= 365) ? n : PRICE_DEFAULT.trialDays;
}

export function won(n) {
  return Number(n || 0).toLocaleString('en-US');   // 1,234,567 — 로캘에 안 기대게
}

/* 상품 하나의 금액 (plan 이름 → 원) */
export function planAmount(billing, plan) {
  const p = PLANS[plan];
  return p ? priceOf(billing, p.key) : 0;
}

/* 안내 한 문장 — 승인 대기 화면 · 만료 안내 · 신청자 문자 · 마스터 미리 보기가 **같은 글**을 쓴다.
   금액은 전부 billing(없으면 기본값)에서 온다. */
export function priceNotice(billing, opt) {
  const o = opt || {};
  const t = trialDaysOf(billing);
  const lines = [
    '첫 결제 할인: 6개월 ' + won(priceOf(billing, 'promo6m')) + '원 / 1년 '
      + won(priceOf(billing, 'promo12m')) + '원 (VAT 별도, 사업자당 1회)',
    '이후 연장은 월 ' + won(priceOf(billing, 'priceMonthly')) + '원 / 연 '
      + won(priceOf(billing, 'priceYearly')) + '원',
    '입금 확인 후 승인 → ' + t + '일 체험 뒤 계약 기간 시작'
  ];
  return lines.join(o.sep || ' · ');
}
