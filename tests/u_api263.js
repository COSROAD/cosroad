/* v263 api 스텁 — 이용 기간 네 동작 (approveOrg · extendOrg · setPeriod · unapproveOrg)
   전: 20046e2 (v262) · 후: 작업 중
   검증 3원칙 B: **저장된 실제 값**을 꺼내 본다 (바뀐 칸만 쓰는지까지)
   ★ 날짜는 0단계 보고 5장 표 그대로 + 말일·윤년을 더 시험한다. */
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 70)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const DAY = 86400000;
const MASTER = 'MASTER1', OWNER = 'OWNER1', OTHER = 'OTHER1';
const ORG = 'academy_OWNER1';

/* KST 로 'YYYY-MM-DD' (시험 쪽 셈 — 서버와 **따로** 센다) */
const kst = (ms) => {
  const t = new Date(ms + 9 * 3600 * 1000);
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0')
       + '-' + String(t.getUTCDate()).padStart(2, '0');
};
/* 그 순간이 KST 로 그날 23:59:59.999 인가 */
const isKstEnd = (ms) => {
  const t = new Date(ms + 9 * 3600 * 1000);
  return t.getUTCHours() === 23 && t.getUTCMinutes() === 59
      && t.getUTCSeconds() === 59 && t.getUTCMilliseconds() === 999;
};

function base(over) {
  const S = makeState(over);
  S.tokens = {
    masterTok: { uid: MASTER, firebase: { sign_in_provider: 'password' } },
    ownerTok:  { uid: OWNER,  firebase: { sign_in_provider: 'password' } },
    otherTok:  { uid: OTHER,  firebase: { sign_in_provider: 'password' } }
  };
  Object.assign(S.docs, {
    'admins/MASTER1': { role: 'master' },
    ['users/' + OWNER]: { orgId: ORG, orgName: '코스로드학원', approved: false,
                          status: 'pending', plan: 'pending', createdAt: S.now - 5 * DAY,
                          bizNo: '2118811430', phone: '01012345678' },
    ['users/' + OTHER]: { orgId: 'academy_OTHER1', approved: true, plan: 'paid' }
  });
  return S;
}
const U = (S) => S.docs['users/' + OWNER] || {};
const logs = (S) => Object.keys(S.docs).filter(k => k.indexOf('billingLog/' + OWNER + '/items/') === 0)
                          .map(k => S.docs[k]);

(async () => {

/* ══ ① 권한 ════════════════════════════════════════════════════════════ */
console.log('\n① 권한 — 마스터만');
{
  for (const act of ['approveOrg', 'extendOrg', 'setPeriod', 'unapproveOrg']) {
    const S = base();
    const r = await call(SRC.admin, S, { action: act, uid: OWNER, months: 6, paidUntil: '2027-06-30' }, 'ownerTok');
    ck(act + ' — 업체 본인 → 403', r.code, 403);
  }
  const S2 = base();
  const r2 = await call(SRC.admin, S2, { action: 'approveOrg', uid: OWNER, months: 6 }, null);
  ck('토큰 없음 → 401', r2.code, 401);
  const S3 = base();
  const r3 = await call(SRC.admin, S3, { action: 'approveOrg', uid: OWNER, months: 6 }, 'otherTok');
  ck('남의 계정 → 403', r3.code, 403);
}

/* ══ ② approveOrg — 저장된 값 전수 ══════════════════════════════════════ */
console.log('\n② approveOrg — 실제 저장값');
{
  /* 2026-11-03 14:00 KST 에 승인 */
  const S = base({ now: Date.UTC(2026, 10, 3, 5, 0, 0) });
  const before = JSON.stringify(S.docs['users/' + OWNER]);
  const r = await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, trialDays: 30, months: 6,
                                       amount: 180000, memo: '홍길동 입금' }, 'masterTok');
  ck('200', r.code, 200);
  const u = U(S);
  ck('approved', u.approved, true);
  ck('status', u.status, 'active');
  ck('plan (표시용)', u.plan, 'trial');
  ck('contractMonths', u.contractMonths, 6);
  ck('paidAt = 지금', u.paidAt, S.now);
  ck('trialEnd 날짜 (오늘+30일)', kst(u.trialEnd), '2026-12-03');
  ck('   그날 23:59:59.999 KST 인가', isKstEnd(u.trialEnd), true);
  ck('paidUntil 날짜 (+6달)', kst(u.paidUntil), '2027-06-03');
  ck('   그날 23:59:59.999 KST 인가', isKstEnd(u.paidUntil), true);
  ck('응답에 날짜 글자', r.body.trialEndStr + '/' + r.body.paidUntilStr, '2026-12-03/2027-06-03');
  /* ★ 바뀐 칸만 — 손대지 않은 칸은 그대로여야 한다 */
  ck('orgId·bizNo·phone 그대로',
    [u.orgId, u.bizNo, u.phone].join(','), [ORG, '2118811430', '01012345678'].join(','));
  ck('update 로 썼다 (set 아님)',
    S.calls.filter(c => c[0] === 'update' && c[1] === 'users/' + OWNER).length, 1);
  ck('   통째 쓰기(set) 0건', S.calls.filter(c => c[0] === 'set' && c[1] === 'users/' + OWNER).length, 0);
  /* 기록 */
  const L = logs(S);
  ck('기록 1건', L.length, 1);
  ck('  type·금액·개월·체험일', [L[0].type, L[0].amount, L[0].months, L[0].trialDays].join('/'),
     'approve/180000/6/30');
  ck('  메모·누가', [L[0].memo, L[0].by].join('/'), '홍길동 입금/' + MASTER);
  ck('  기록에도 기간', kst(L[0].paidUntil), '2027-06-03');
  ck('응답에 다른 사람 정보 없음',
    Object.keys(r.body).sort().join(','), 'approved,ok,paidUntil,paidUntilStr,trialEnd,trialEndStr');
  ck('(대조) 승인 전 문서와 달라졌다', before !== JSON.stringify(S.docs['users/' + OWNER]), true);
}

/* ══ ③ 날짜 표 — 0단계 5장 그대로 + 말일·윤년 ═══════════════════════════ */
console.log('\n③ 날짜 — 말일 당김·윤년');
{
  const T = [
    ['2026-11-03 · 30일 · 6달',  Date.UTC(2026, 10, 3, 5), 30, 6,  '2026-12-03', '2027-06-03'],
    ['2026-11-03 · 30일 · 12달', Date.UTC(2026, 10, 3, 5), 30, 12, '2026-12-03', '2027-12-03'],
    ['2026-12-01 · 30일 · 6달',  Date.UTC(2026, 11, 1, 5), 30, 6,  '2026-12-31', '2027-06-30'],
    ['2027-01-30 · 30일 · 12달', Date.UTC(2027, 0, 30, 5), 30, 12, '2027-03-01', '2028-03-01'],
    ['2026-11-30 · 30일 · 6달',  Date.UTC(2026, 10, 30, 5), 30, 6, '2026-12-30', '2027-06-30'],
    ['2027-12-30 · 30일 · 12달', Date.UTC(2027, 11, 30, 5), 30, 12, '2028-01-29', '2029-01-29'],
    ['2026-10-01 · 30일 · 6달',  Date.UTC(2026, 9, 1, 5), 30, 6,  '2026-10-31', '2027-04-30'],
    ['체험 0일 · 1달',            Date.UTC(2027, 0, 31, 5), 0, 1,  '2027-01-31', '2027-02-28'],
    ['체험 0일 · 1달 (윤년)',      Date.UTC(2028, 0, 31, 5), 0, 1,  '2028-01-31', '2028-02-29'],
    ['밤 23:30 KST 에 승인',      Date.UTC(2026, 10, 3, 14, 30), 30, 6, '2026-12-03', '2027-06-03'],
    ['새벽 00:30 KST 에 승인',    Date.UTC(2026, 10, 2, 15, 30), 30, 6, '2026-12-03', '2027-06-03']
  ];
  for (const [label, now, td, mo, wTrial, wPaid] of T) {
    const S = base({ now: now });
    await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, trialDays: td, months: mo, amount: 0 }, 'masterTok');
    const u = U(S);
    ck(label, kst(u.trialEnd) + ' / ' + kst(u.paidUntil), wTrial + ' / ' + wPaid);
  }
}

/* ══ ④ extendOrg ═══════════════════════════════════════════════════════ */
console.log('\n④ extendOrg — 남으면 뒤에, 지났으면 오늘부터');
{
  /* 아직 남아 있는 경우 — 끝 뒤에 붙인다 */
  const S = base({ now: Date.UTC(2027, 0, 10, 5) });
  S.docs['users/' + OWNER] = Object.assign({}, S.docs['users/' + OWNER],
    { approved: true, status: 'active', paidUntil: Date.UTC(2027, 5, 3, 14, 59, 59, 999), contractMonths: 6 });
  const r = await call(SRC.admin, S, { action: 'extendOrg', uid: OWNER, months: 6, amount: 180000 }, 'masterTok');
  ck('200', r.code, 200);
  ck('남은 기간 뒤에 붙는다', kst(U(S).paidUntil), '2027-12-03');
  ck('  끝은 그날 23:59:59.999', isKstEnd(U(S).paidUntil), true);
  ck('  개월수가 쌓인다', U(S).contractMonths, 12);
  ck('  plan 표시', U(S).plan, 'paid');
  ck('  기록', logs(S).map(x => x.type).join(','), 'extend');

  /* 이미 지난 경우 — 오늘부터 */
  const S2 = base({ now: Date.UTC(2027, 7, 10, 5) });     // 2027-08-10 KST
  S2.docs['users/' + OWNER] = Object.assign({}, S2.docs['users/' + OWNER],
    { approved: true, status: 'active', paidUntil: Date.UTC(2027, 5, 3, 14, 59, 59, 999) });
  await call(SRC.admin, S2, { action: 'extendOrg', uid: OWNER, months: 6, amount: 0 }, 'masterTok');
  ck('지났으면 오늘부터 센다', kst(U(S2).paidUntil), '2028-02-10');

  const S3 = base();
  S3.docs['users/' + OWNER] = Object.assign({}, S3.docs['users/' + OWNER], { approved: true });
  const r3 = await call(SRC.admin, S3, { action: 'extendOrg', uid: OWNER, months: 0 }, 'masterTok');
  ck('개월수 0 → 400', r3.code, 400);
  const r4 = await call(SRC.admin, S3, { action: 'extendOrg', uid: OWNER, months: 200 }, 'masterTok');
  ck('개월수 200 → 400', r4.code, 400);
}

/* ══ ⑤ setPeriod · unapproveOrg ════════════════════════════════════════ */
console.log('\n⑤ setPeriod · unapproveOrg');
{
  const S = base({ now: Date.UTC(2026, 10, 3, 5) });
  S.docs['users/' + OWNER] = Object.assign({}, S.docs['users/' + OWNER], { approved: true, status: 'active' });
  const r = await call(SRC.admin, S, { action: 'setPeriod', uid: OWNER, paidUntil: '2027-06-30', memo: '예제' }, 'masterTok');
  ck('200', r.code, 200);
  ck('그 날짜의 끝으로', kst(U(S).paidUntil) + '/' + isKstEnd(U(S).paidUntil), '2027-06-30/true');
  ck('  기록', logs(S).map(x => x.type).join(','), 'set');
  ck('날짜 형식 틀림 → 400',
    (await call(SRC.admin, S, { action: 'setPeriod', uid: OWNER, paidUntil: '2027/06/30' }, 'masterTok')).code, 400);
  ck('없는 날짜(2027-02-30) → 400',
    (await call(SRC.admin, S, { action: 'setPeriod', uid: OWNER, paidUntil: '2027-02-30' }, 'masterTok')).code, 400);

  const S2 = base();
  const r2 = await call(SRC.admin, S2, { action: 'setPeriod', uid: OWNER, paidUntil: '2027-06-30' }, 'masterTok');
  ck('승인 안 된 계정에 기간 정하기 → 400', r2.code, 400);

  const S3 = base({ now: Date.UTC(2026, 10, 3, 5) });
  S3.docs['users/' + OWNER] = Object.assign({}, S3.docs['users/' + OWNER],
    { approved: true, status: 'active', paidUntil: Date.UTC(2027, 5, 3, 14, 59, 59, 999), trialEnd: 123 });
  const r3 = await call(SRC.admin, S3, { action: 'unapproveOrg', uid: OWNER }, 'masterTok');
  ck('승인 취소 200', r3.code, 200);
  ck('  approved/status', U(S3).approved + '/' + U(S3).status, 'false/pending');
  ck('  ★ 기간 값은 남긴다', kst(U(S3).paidUntil), '2027-06-03');
  ck('  기록', logs(S3).map(x => x.type).join(','), 'unapprove');
}

/* ══ ⑥ 형식·대상 검사 ══════════════════════════════════════════════════ */
console.log('\n⑥ 형식 검사');
{
  const S = base();
  ck('uid 빠짐 → 400', (await call(SRC.admin, S, { action: 'approveOrg', months: 6 }, 'masterTok')).code, 400);
  ck('없는 계정 → 404',
    (await call(SRC.admin, S, { action: 'approveOrg', uid: 'NOPE', months: 6 }, 'masterTok')).code, 404);
  S.docs['users/DRV1'] = { role: 'driver', driverOrg: ORG, ownerUid: OWNER };
  ck('기사 계정 → 400',
    (await call(SRC.admin, S, { action: 'approveOrg', uid: 'DRV1', months: 6 }, 'masterTok')).code, 400);
  ck('개월수 없음 → 400', (await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER }, 'masterTok')).code, 400);
  ck('체험 일수 400 → 400',
    (await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, trialDays: 400, months: 6 }, 'masterTok')).code, 400);
  ck('금액이 글자 → 400',
    (await call(SRC.admin, S, { action: 'approveOrg', uid: OWNER, months: 6, amount: 'ㅋ' }, 'masterTok')).code, 400);
  const S2 = base({ now: Date.UTC(2026, 10, 3, 5) });
  await call(SRC.admin, S2, { action: 'approveOrg', uid: OWNER, months: 6 }, 'masterTok');
  ck('체험 일수 안 주면 30일', kst(U(S2).trialEnd), '2026-12-03');
  const S3 = base({ now: Date.UTC(2026, 10, 3, 5) });
  await call(SRC.admin, S3, { action: 'approveOrg', uid: OWNER, trialDays: 0, months: 6 }, 'masterTok');
  ck('체험 0일이면 plan 이 paid', U(S3).plan, 'paid');
  ck('  그날 끝 + 6달', kst(U(S3).paidUntil), '2027-05-03');
}

/* ══ ⑦ 종전 동작이 그대로인가 (회귀) ════════════════════════════════════ */
console.log('\n⑦ 옛 동작 그대로');
{
  const S = base();
  ck('모르는 action → 400',
    (await call(SRC.admin, S, { action: 'zzz' }, 'masterTok')).code, 400);
  ck('issueOrgCode 는 그대로 있다', /action === 'issueOrgCode'/.test(SRC.admin), true);
  ck('masterResetPassword 그대로', /action === 'masterResetPassword'/.test(SRC.admin), true);
  /* 이름이 분기 안에서 다시 쓰여 그냥 세면 7이다 — **서로 다른 이름**을 센다 */
  ck('새 action 네 개',
    [...new Set((SRC.admin.match(/'(approveOrg|extendOrg|setPeriod|unapproveOrg)'/g) || []))].sort().join(','),
    "'approveOrg','extendOrg','setPeriod','unapproveOrg'");
  ck('가격이 코드에 없다', /180000|310000|45000|540000/.test(SRC.admin), false);
  ck('   대조 — 같은 검사로 박은 꼴은 잡힌다', /180000/.test('var p=180000;'), true);
  ck('로그에 금액·메모를 적지 않는다',
    /console\.log\([^)]*\b(amount|memo)\b/.test(SRC.admin), false);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
})();
