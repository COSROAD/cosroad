/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v264 api 스텁 — 요금(상품)·첫 결제 할인(사업자당 1회)
   전: 269231d (v263) · 후: 작업 중
   검증 3원칙 B: **저장된 실제 값**을 꺼내 본다 (bizFirstPay 문서·users 기간·billingLog)
   ★ 바깥 통신 0 (가짜 firebase-admin) */
/* ★ 옛 판은 **이 회차의 기준 커밋(269231d = v263)** 으로 못 박는다.
   drvenv 의 기본 옛 판(2eadaaa = v254)에는 approveOrg 자체가 없어 대조가 되지 않는다.
   (회차 기록은 그 회차의 코드로 돌린다 — f_api254·gate258 과 같은 방식) */
process.env.COS_SRC_OLD_REF = process.env.COS_SRC_OLD_REF || '269231d';
const E = require('./drvenv.js');
const { SRC, SRC_OLD, makeState, call } = E;
const crypto = require('crypto');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 64)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const DAY = 86400000;
const MASTER = 'MASTER1', OWNER = 'OWNER1', TWIN = 'TWIN1', NOBIZ = 'NOBIZ1';
const BIZ_NO = '2118811430';
const BIZ_KEY = crypto.createHash('sha256').update(BIZ_NO, 'utf8').digest('hex');

const kst = (ms) => {
  const t = new Date(ms + 9 * 3600 * 1000);
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0')
       + '-' + String(t.getUTCDate()).padStart(2, '0');
};

function base(over) {
  const S = makeState(over);
  S.tokens = {
    masterTok: { uid: MASTER, firebase: { sign_in_provider: 'password' } },
    ownerTok:  { uid: OWNER,  firebase: { sign_in_provider: 'password' } }
  };
  Object.assign(S.docs, {
    'admins/MASTER1': { role: 'master' },
    /* 같은 사업자등록번호를 쓰는 **계정 둘** — 할인은 하나만 받아야 한다 */
    ['users/' + OWNER]: { orgId: 'academy_OWNER1', orgName: '가온학원', approved: false,
                          status: 'pending', plan: 'pending', bizNo: BIZ_NO, phone: '01011112222' },
    ['users/' + TWIN]:  { orgId: 'academy_TWIN1',  orgName: '가온학원2호', approved: false,
                          status: 'pending', plan: 'pending', bizNo: BIZ_NO, phone: '01033334444' },
    /* v260 이전 가입이라 사업자 칸이 없는 계정 */
    ['users/' + NOBIZ]: { orgId: 'academy_NOBIZ1', orgName: '옛업체', approved: false,
                          status: 'pending', plan: 'pending', phone: '01055556666' }
  });
  return S;
}
const U = (S, uid) => S.docs['users/' + uid] || {};
const firstPay = (S) => S.docs['bizFirstPay/' + BIZ_KEY];
const logs = (S, uid) => Object.keys(S.docs)
  .filter(k => k.indexOf('billingLog/' + uid + '/items/') === 0).map(k => S.docs[k]);

(async () => {

/* ══ ① promo 첫 적용 ═══════════════════════════════════════════════════ */
console.log('\n① 첫 결제 할인 — 처음 쓰면 적용되고 자리를 찍는다');
{
  const S = base();
  const r = await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, plan: 'promo6m',
                                       trialDays: 30, amount: 198000, memo: '가온학원' }, 'masterTok');
  ck('승인 200', r.code, 200);
  ck('users.approved', U(S, OWNER).approved, true);
  ck('users.contractMonths = 6 (promo6m)', U(S, OWNER).contractMonths, 6);
  ck('체험 끝 = 오늘+30일', kst(U(S, OWNER).trialEnd), kst(S.now + 30 * DAY));
  ck('bizFirstPay 문서가 생겼다', !!firstPay(S), true);
  ck('  문서 id 는 사업자번호 **해시**', Object.keys(S.docs).some(k => k === 'bizFirstPay/' + BIZ_KEY), true);
  ck('  번호 원문이 문서 id 에 없다', Object.keys(S.docs).some(k => k.indexOf(BIZ_NO) >= 0), false);
  ck('  문서에 plan', (firstPay(S) || {}).plan, 'promo6m');
  ck('  문서에 uid', (firstPay(S) || {}).uid, OWNER);
  ck('  문서에 번호 원문 없음', JSON.stringify(firstPay(S) || {}).indexOf(BIZ_NO) >= 0, false);
  ck('  트랜잭션으로 썼다', S.calls.some(c => c[0] === 'tx.set' && c[1].indexOf('bizFirstPay/') === 0), true);
  const L = logs(S, OWNER);
  ck('billingLog 1건', L.length, 1);
  ck('  기록 buyPlan', L[0].buyPlan, 'promo6m');
  ck('  기록 amount', L[0].amount, 198000);
  ck('  기록 months', L[0].months, 6);
}

/* ══ ② 같은 사업자 두 번째 ════════════════════════════════════════════ */
console.log('\n② 같은 사업자가 두 번째로 쓰면 막힌다');
{
  const S = base();
  await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, plan: 'promo6m', trialDays: 30, amount: 1 }, 'masterTok');
  await call(SRC.admin, S, { action: 'unapproveOrg', uid: OWNER }, 'masterTok');
  const r = await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, plan: 'promo12m', trialDays: 30, amount: 1 }, 'masterTok');
  ck('같은 계정 두 번째 → 400', r.code, 400);
  ck('  문구에 「이미 받았어요」', /이미 받았어요/.test(r.body.message), true);
  ck('  문구에 받은 날짜', new RegExp(kst(S.now)).test(r.body.message), true);
  ck('  찍어 둔 자리는 그대로(덮어쓰지 않음)', (firstPay(S) || {}).plan, 'promo6m');
  ck('  승인은 안 됐다', U(S, OWNER).approved, false);
}
{
  const S = base();
  await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, plan: 'promo12m', trialDays: 0, amount: 1 }, 'masterTok');
  const r = await call(SRC.admin, S, { action: 'approveOrg', uid: TWIN, plan: 'promo6m', trialDays: 30, amount: 1 }, 'masterTok');
  ck('**다른 계정·같은 사업자** → 400', r.code, 400);
  ck('  그 계정은 승인되지 않았다', U(S, TWIN).approved, false);   // base() 가 false 로 넣어 둔 그대로
  const r2 = await call(SRC.admin, S, { action: 'approveOrg', uid: TWIN, plan: 'custom', months: 6, trialDays: 30, amount: 1 }, 'masterTok');
  ck('  직접 입력으로는 승인된다', r2.code, 200);
  ck('  그때 bizFirstPay 는 안 건드린다', (firstPay(S) || {}).uid, OWNER);
}

/* ══ ③ 동시에 두 번 — 트랜잭션이 하나만 통과시킨다 ═══════════════════ */
console.log('\n③ 동시에 두 번 눌러도 하나만');
{
  const S = base();
  S.txLag = 3;                      // 트랜잭션 사이에 다른 일이 끼어들 틈을 만든다
  const [a, b] = await Promise.all([
    call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, plan: 'promo6m', trialDays: 30, amount: 1 }, 'masterTok'),
    call(SRC.admin, S, { action: 'approveOrg', uid: TWIN,  plan: 'promo6m', trialDays: 30, amount: 1 }, 'masterTok')
  ]);
  const ok = [a.code, b.code].sort().join(',');
  ck('한쪽 200 · 한쪽 400', ok, '200,400');
  ck('  bizFirstPay 는 한 칸뿐', Object.keys(S.docs).filter(k => k.indexOf('bizFirstPay/') === 0).length, 1);
  const approved = [OWNER, TWIN].filter(u => U(S, u).approved === true).length;
  ck('  승인된 쪽도 하나', approved, 1);
}

/* ══ ④ 사업자 칸이 없는 계정 ═══════════════════════════════════════════ */
console.log('\n④ 사업자 정보가 없는 계정');
{
  const S = base();
  const r = await call(SRC.admin, S, { action: 'approveOrg', uid: NOBIZ, plan: 'promo6m', trialDays: 30, amount: 1 }, 'masterTok');
  ck('promo → 400', r.code, 400);
  ck('  사유를 말해 준다', /사업자 정보가 없는/.test(r.body.message), true);
  ck('  bizFirstPay 안 생김', Object.keys(S.docs).some(k => k.indexOf('bizFirstPay/') === 0), false);
  const r2 = await call(SRC.admin, S, { action: 'approveOrg', uid: NOBIZ, plan: 'custom', months: 12, trialDays: 30, amount: 1 }, 'masterTok');
  ck('직접 입력으로는 승인된다', r2.code, 200);
  ck('  12개월', U(S, NOBIZ).contractMonths, 12);
}

/* ══ ⑤ 연장에는 할인을 쓸 수 없다 ═════════════════════════════════════ */
console.log('\n⑤ 연장에 promo 를 주면 막힌다');
{
  const S = base();
  await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, plan: 'custom', months: 6, trialDays: 0, amount: 1 }, 'masterTok');
  for (const p of ['promo6m', 'promo12m']) {
    const r = await call(SRC.admin, S, { action: 'extendOrg', uid: OWNER, plan: p, amount: 1 }, 'masterTok');
    ck('extendOrg ' + p + ' → 400', r.code, 400);
    ck('  사유', /연장에 쓸 수 없어요/.test(r.body.message), true);
  }
  ck('bizFirstPay 는 그대로 비어 있다', Object.keys(S.docs).some(k => k.indexOf('bizFirstPay/') === 0), false);
}

/* ══ ⑥ 상품별 저장값 — 개월수는 **서버**가 정한다 ═════════════════════ */
console.log('\n⑥ 상품별 저장값 (원칙 B) · 화면이 보낸 개월수는 안 믿는다');
{
  const tbl = [['monthly', 1], ['yearly', 12], ['promo6m', 6], ['promo12m', 12]];
  for (const [plan, months] of tbl) {
    const S = base();
    /* 화면이 **120개월**이라고 보내도 서버는 제 표를 쓴다 */
    const r = await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, plan: plan,
                                         months: 120, trialDays: 0, amount: 1 }, 'masterTok');
    ck(plan + ' → 200', r.code, 200);
    ck('  contractMonths = ' + months + ' (120 을 보내도)', U(S, OWNER).contractMonths, months);
  }
  const S = base();
  const r = await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, plan: 'custom',
                                       months: 7, trialDays: 0, amount: 1 }, 'masterTok');
  ck('custom 은 보낸 개월수를 쓴다', U(S, OWNER).contractMonths, 7);
  ck('  custom 은 bizFirstPay 를 안 쓴다', Object.keys(S.docs).some(k => k.indexOf('bizFirstPay/') === 0), false);
  const S2 = base();
  const r2 = await call(SRC.admin, S2, { action: 'approveOrg', uid: OWNER, plan: 'custom', trialDays: 0, amount: 1 }, 'masterTok');
  ck('custom 인데 개월수가 없으면 400', r2.code, 400);
  const S3 = base();
  const r3 = await call(SRC.admin, S3, { action: 'approveOrg', uid: OWNER, plan: '열어줘', months: 6, trialDays: 0, amount: 1 }, 'masterTok');
  ck('모르는 상품 이름 → 400', r3.code, 400);
}
{
  /* 연장도 상품에서 개월수를 꺼낸다 */
  const S = base();
  await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, plan: 'custom', months: 1, trialDays: 0, amount: 1 }, 'masterTok');
  const was = U(S, OWNER).contractMonths;
  await call(SRC.admin, S, { action: 'extendOrg', uid: OWNER, plan: 'yearly', months: 120, amount: 1 }, 'masterTok');
  ck('extendOrg yearly → +12개월 (120 을 보내도)', U(S, OWNER).contractMonths - was, 12);
  const L = logs(S, OWNER);
  ck('  연장 기록 buyPlan', L[L.length - 1].buyPlan, 'yearly');
}

/* ══ ⑦ 기간 쓰기가 깨지면 찍어 둔 자리를 되돌린다 ═════════════════════ */
console.log('\n⑦ 기간 쓰기 실패 → 할인 자리를 비운다');
{
  const S = base();
  S.failUpdate = 'users/' + OWNER;
  const r = await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, plan: 'promo6m', trialDays: 30, amount: 1 }, 'masterTok');
  ck('500 으로 끝난다', r.code, 500);
  ck('  찍어 둔 자리가 비었다', Object.keys(S.docs).some(k => k.indexOf('bizFirstPay/') === 0), false);
  S.failUpdate = null;
  const r2 = await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, plan: 'promo6m', trialDays: 30, amount: 1 }, 'masterTok');
  ck('  그래서 다시 승인하면 할인이 그대로 든다', r2.code, 200);
}

/* ══ ⑧ bizPromoStatus ═════════════════════════════════════════════════ */
console.log('\n⑧ bizPromoStatus — 받을 수 있음 / 이미 받음 / 사업자 없음');
{
  const S = base();
  const a = await call(SRC.admin, S, { action: 'bizPromoStatus', uid: OWNER }, 'masterTok');
  ck('아직 안 받음 → used=false', a.body.used, false);
  ck('  hasBizNo=true', a.body.hasBizNo, true);
  ck('  응답에 사업자번호 원문 없음', JSON.stringify(a.body).indexOf(BIZ_NO) >= 0, false);
  ck('  응답에 해시도 없음', JSON.stringify(a.body).indexOf(BIZ_KEY) >= 0, false);
  await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, plan: 'promo6m', trialDays: 0, amount: 1 }, 'masterTok');
  const b2 = await call(SRC.admin, S, { action: 'bizPromoStatus', uid: TWIN }, 'masterTok');
  ck('같은 사업자 다른 계정 → used=true', b2.body.used, true);
  ck('  받은 날짜를 준다', b2.body.usedStr, kst(S.now));
  const c = await call(SRC.admin, S, { action: 'bizPromoStatus', uid: NOBIZ }, 'masterTok');
  ck('사업자 칸 없음 → hasBizNo=false', c.body.hasBizNo, false);
  const d = await call(SRC.admin, S, { action: 'bizPromoStatus', uid: OWNER }, 'ownerTok');
  ck('업체 본인 → 403', d.code, 403);
  const e = await call(SRC.admin, S, { action: 'bizPromoStatus', uid: 'NOPE' }, 'masterTok');
  ck('없는 계정 → 404', e.code, 404);
}

/* ══ ⑨ 옛 판(v263)과 대조 — 이 검사가 1건을 잡을 수 있나 ═════════════ */
console.log('\n⑨ 대조 시험 — 옛 판(269231d)에서는 이 길이 **없다**');
{
  const S = base();
  const r = await call(SRC_OLD.admin, S, { action: 'bizPromoStatus', uid: OWNER }, 'masterTok');
  ck('옛 판 bizPromoStatus → 400 (알 수 없는 요청)', r.code, 400);
  const S2 = base();
  await call(SRC_OLD.admin, S2, { action: 'approveOrg', uid: OWNER, plan: 'promo6m', months: 6, trialDays: 0, amount: 1 }, 'masterTok');
  ck('옛 판은 promo 를 모르고 그냥 6개월 승인', U(S2, OWNER).contractMonths, 6);
  ck('  옛 판은 bizFirstPay 를 안 만든다 (= 이 검사가 새 길을 본다)',
     Object.keys(S2.docs).some(k => k.indexOf('bizFirstPay/') === 0), false);
  const S3 = base();
  await call(SRC_OLD.admin, S3, { action: 'approveOrg', uid: OWNER, plan: 'promo6m', months: 120, trialDays: 0, amount: 1 }, 'masterTok');
  ck('  옛 판은 화면이 보낸 120개월을 그대로 쓴다 (새 판은 6)', U(S3, OWNER).contractMonths, 120);
}

/* ══ ⑩ 가격은 코드가 아니라 lib/price.js 한 벌 ═══════════════════════ */
console.log('\n⑩ 금액이 api 파일에 박혀 있지 않다');
{
  const fs = require('fs');
  const admin = fs.readFileSync('' + COS_ROOT + '/api/admin-account.js', 'utf8');
  const signup = fs.readFileSync('' + COS_ROOT + '/api/signup.js', 'utf8');
  const price = fs.readFileSync('' + COS_ROOT + '/lib/price.js', 'utf8');
  const money = /\b(50000|480000|180000|310000)\b/;
  ck('api/admin-account.js 에 금액 없음', money.test(admin), false);
  ck('api/signup.js 에 금액 없음', money.test(signup), false);
  ck('  대조 — 이 검사가 1건을 잡는다 (lib/price.js 에는 있다)', money.test(price), true);
  ck('admin-account 가 lib/price.js 를 가져다 쓴다', /from '\.\.\/lib\/price\.js'/.test(admin), true);
  ck('signup 이 lib/price.js 를 가져다 쓴다', /from '\.\.\/lib\/price\.js'/.test(signup), true);
  /* 안내 문구가 한 함수에서 나온다 */
  ck('signup 이 priceNotice 로 문구를 만든다', /priceNotice\(billing\)/.test(signup), true);
  ck('signup 에 옛 문구(구독료 글자칸 fee)가 없다', /billing\.fee/.test(signup), false);
}

/* ══ ⑪ 신청자 안내 문자 — billing 값으로 만든 **한 문구** ═══════════════ */
console.log('\n⑪ 가입 안내 문자 (api/signup.js · 실제 발송 0건)');
{
  const G = require('./env261.js');
  const price = await import('file:///' + COS_ROOT + '/lib/price.js');
  const CODE = '975310', PHONE = '010-1234-5678', BNO = '2118811430';
  const mk = (billing) => {
    const S = G.makeState();
    S.nts = S.nts || [];
    S.ntsReply = G.ntsValid();
    S.docs['orgs/_master/data/billing'] = billing;
    /* 인증번호를 미리 넣어 둔 상태 (otpCore 가 쓰는 자리와 같은 꼴) */
    const key = 'otp/' + require('crypto').createHash('sha256')
      .update('signup|' + PHONE.replace(/[^0-9]/g, ''), 'utf8').digest('hex');
    return { S, key };
  };
  /* 문구 자체는 lib/price.js 한 함수에서 나온다 — 그 함수의 결과를 바로 본다 */
  const b1 = { bank: '농협', account: '123-456-789', holder: '프리존' };
  const t1 = price.priceNotice(b1);
  ck('기본값 문구 — 6개월 180,000', /6개월 180,000원/.test(t1), true);
  ck('기본값 문구 — 1년 310,000', /1년 310,000원/.test(t1), true);
  ck('기본값 문구 — 사업자당 1회', /사업자당 1회/.test(t1), true);
  ck('기본값 문구 — 연장 정가', /월 50,000원 \/ 연 480,000원/.test(t1), true);
  ck('기본값 문구 — 30일 체험', /30일 체험 뒤 계약 기간 시작/.test(t1), true);
  const t2 = price.priceNotice({ promo6m: 200000, priceMonthly: '60,000', trialDays: 14 });
  ck('billing 값이 이긴다 — 6개월 200,000', /6개월 200,000원/.test(t2), true);
  ck('  쉼표가 섞여 있어도 읽는다 — 월 60,000', /월 60,000원/.test(t2), true);
  ck('  체험 일수도 billing 값 — 14일', /14일 체험/.test(t2), true);
  ck('  안 넣은 칸은 기본값 — 1년 310,000', /1년 310,000원/.test(t2), true);
  ck('trialDays 0 도 그대로 쓴다', /0일 체험/.test(price.priceNotice({ trialDays: 0 })), true);
  ck('엉뚱한 값은 기본값으로', /30일 체험/.test(price.priceNotice({ trialDays: 'abc' })), true);
  ck('0원·음수는 기본값으로', /월 50,000원/.test(price.priceNotice({ priceMonthly: 0 })), true);
  /* 대조 시험 — 이 검사가 1건을 잡는가 */
  ck('  대조 — 금액이 틀리면 잡힌다', /6개월 999,999원/.test(t1), false);
  /* signup.js 가 그 문구를 실제로 문자에 싣는다 */
  const fs2 = require('fs');
  const sg = fs2.readFileSync('' + COS_ROOT + '/api/signup.js', 'utf8');
  ck('문자 본문에 priceNotice(billing) 를 붙인다', /\+ priceNotice\(billing\)/.test(sg), true);
  ck('문자 본문에 입금자명(업체명)을 적는다', /입금자명 ' \+ orgName/.test(sg), true);
}

console.log('\n' + (fail ? '✘ ' : '✔ ') + pass + '/' + (pass + fail) + (fail ? '  (실패 ' + fail + ')' : ' 전부 통과'));
process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e && e.stack || e); process.exit(1); });
