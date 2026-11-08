/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v253 보정2 — 「🧪 테스트 출입」(users.testAccess) 규칙 */
import fs from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, deleteField, collection, getDocs } from 'firebase/firestore';
/* ★ v274: 규칙을 **이 회차 커밋에 고정**한다 — v253 보정2(`318e25b`).
   전에는 이 폴더의 사본(= **지금** 규칙)을 읽었다. 그래서 뒤 회차가 규칙을 고치면
   이 회차의 기대값이 거짓으로 깨졌다 — v274 가 기사 읽기 키를 9→6 으로 줄이고
   `carData` 블록을 더하자 한꺼번에 터졌다. v253 보정2 가 틀린 것이 아니다.
   **지금** 규칙은 t274.mjs 가 본다 — 그쪽이 진짜다. */
/* ★ 기대값이 뒷 회차에 **앞으로 고쳐졌다** — 그래서 원래 회차가 아니라
   그 기대값이 가리키는 회차(v263)에 맞춘다(여러 회차로 돌려 실측으로 골랐다). */
const _RULES_REF = process.env.COS_RULES_REF || '269231d';   /* v263 */
const _PINNED_RULES = (await import('child_process')).execSync(
  'git -C ' + COS_ROOT + ' show ' + _RULES_REF + ':firestore.rules',
  { maxBuffer: 1 << 26 }).toString()
  .split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));


const env = await initializeTestEnvironment({
  projectId: 'cos-v253b',
  firestore: { host: '127.0.0.1', port: 8988, rules: _PINNED_RULES }
});

let pass = 0, fail = 0;
async function t(label, want, fn) {
  try {
    if (want === 'allow') await assertSucceeds(fn());
    else await assertFails(fn());
    pass++; console.log('  ' + (want === 'allow' ? '✔ 허용' : '✔ 거부') + '  ' + label);
  } catch (e) { fail++; console.log('  ' + (want === 'allow' ? '✘ 허용기대→거부' : '✘ 거부기대→허용') + '  ' + label); }
}
const ctx  = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const anon = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const out  = () => env.unauthenticatedContext().firestore();

const MASTER = 'MasterUid00000000000000000001';
const TA_OK  = 'TaOk00000000000000000000002';   // 승인 + testAccess:true   ← 사장님 휴대폰 계정 자리
const TA_PEND= 'TaPending000000000000000003';   // 미승인 + testAccess:true
const TA_WDR = 'TaWithdrawn00000000000004';     // 승인 + 탈퇴 + testAccess:true
const PLAIN  = 'Plain000000000000000000005';    // 승인, testAccess 없음
const TA_FALSE='TaFalse0000000000000000006';    // 승인 + testAccess:false
const DRV_TA = 'DriverTa0000000000000007';      // 기사 문서에 testAccess:true (있어선 안 되지만 심어 본다)
const DRV_T  = 'DriverTest000000000000008';     // 마스터가 만든 _test 기사
const TEST = 'freezone_test';
const DEMO = 'academy_demo';
const orgOf = u => 'academy_' + u.slice(0, 12);

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'admins', MASTER), { role: 'master' });
  const own = (uid, extra) => Object.assign({
    bizType: 'academy', orgName: '업체', orgId: orgOf(uid), contact: '010-1',
    status: 'active', approved: true, paidUntil: Date.now() + 365 * 86400000, trialEnd: Date.now() + 30 * 86400000, contractMonths: 12, plan: 'trial', trialStart: Date.now(),
    signupMethod: 'phone', phone: '01011112222', createdAt: Date.now()
  }, extra || {});
  await setDoc(doc(db, 'users', TA_OK),   own(TA_OK,   { testAccess: true }));
  await setDoc(doc(db, 'users', TA_PEND), own(TA_PEND, { testAccess: true, approved: false, status: 'pending', plan: 'pending' }));
  await setDoc(doc(db, 'users', TA_WDR),  own(TA_WDR,  { testAccess: true, withdrawn: true }));
  await setDoc(doc(db, 'users', PLAIN),   own(PLAIN));
  await setDoc(doc(db, 'users', TA_FALSE),own(TA_FALSE,{ testAccess: false }));
  await setDoc(doc(db, 'users', DRV_TA),  { role: 'driver', driverOrg: TEST, ownerUid: MASTER, carId: 'c1', testAccess: true });
  await setDoc(doc(db, 'users', DRV_T),   { role: 'driver', driverOrg: TEST, ownerUid: MASTER, carId: 'c1' });
  await setDoc(doc(db, 'orgs', TEST, 'drivers', DRV_TA), { carId: 'c1', ownerUid: MASTER });
  await setDoc(doc(db, 'orgs', TEST, 'drivers', DRV_T),  { carId: 'c1', ownerUid: MASTER });
  for (const o of [TEST, DEMO, orgOf(TA_OK), orgOf(PLAIN)]) {
    await setDoc(doc(db, 'orgs', o, 'data', 'members'), { v: 1 });
    await setDoc(doc(db, 'orgs', o, 'backups', 'members__1'), { key: 'members', v: 1 });
  }
});

console.log('════ 1. _test 출입 — 누가 되나 ════');
await t('마스터 → 읽기',                       'allow', () => getDoc(doc(ctx(MASTER), 'orgs', TEST, 'data', 'members')));
await t('마스터 → 쓰기',                       'allow', () => setDoc(doc(ctx(MASTER), 'orgs', TEST, 'data', 'members'), { v: 2 }));
await t('★ testAccess 켠 승인 계정 → 읽기',     'allow', () => getDoc(doc(ctx(TA_OK), 'orgs', TEST, 'data', 'members')));
await t('★ testAccess 켠 승인 계정 → 쓰기',     'allow', () => setDoc(doc(ctx(TA_OK), 'orgs', TEST, 'data', 'members'), { v: 3 }));
await t('★ testAccess 켠 승인 계정 → 백업 읽기','allow', () => getDoc(doc(ctx(TA_OK), 'orgs', TEST, 'backups', 'members__1')));
await t('★ testAccess 켠 승인 계정 → 백업 만들기','allow',() => setDoc(doc(ctx(TA_OK), 'orgs', TEST, 'backups', 'members__7'), { key: 'members' }));
await t('★ testAccess 켠 승인 계정 → 백업 지우기','allow',() => deleteDoc(doc(ctx(TA_OK), 'orgs', TEST, 'backups', 'members__1')));
await t('testAccess 켰지만 **미승인** → 읽기',   'deny',  () => getDoc(doc(ctx(TA_PEND), 'orgs', TEST, 'data', 'members')));
await t('testAccess 켰지만 미승인 → 쓰기',       'deny',  () => setDoc(doc(ctx(TA_PEND), 'orgs', TEST, 'data', 'members'), { v: 4 }));
await t('testAccess 켰지만 **탈퇴** → 읽기',     'deny',  () => getDoc(doc(ctx(TA_WDR), 'orgs', TEST, 'data', 'members')));
await t('testAccess 켰지만 탈퇴 → 쓰기',         'deny',  () => setDoc(doc(ctx(TA_WDR), 'orgs', TEST, 'data', 'members'), { v: 4 }));
await t('testAccess 없는 승인 계정 → 읽기',      'deny',  () => getDoc(doc(ctx(PLAIN), 'orgs', TEST, 'data', 'members')));
await t('testAccess 없는 승인 계정 → 쓰기',      'deny',  () => setDoc(doc(ctx(PLAIN), 'orgs', TEST, 'data', 'members'), { v: 4 }));
await t('testAccess:**false** 인 승인 계정 → 읽기','deny',() => getDoc(doc(ctx(TA_FALSE), 'orgs', TEST, 'data', 'members')));
await t('익명 → 읽기',                          'deny',  () => getDoc(doc(anon('A1'), 'orgs', TEST, 'data', 'members')));
await t('로그인 안 함 → 읽기',                   'deny',  () => getDoc(doc(out(), 'orgs', TEST, 'data', 'members')));
await t('users 문서 없는 계정 → 읽기',            'deny',  () => getDoc(doc(ctx('NoDoc00000000000000009'), 'orgs', TEST, 'data', 'members')));

console.log('\n════ 2. 기사는 testAccess 로 못 들어간다 ════');
/* 기사 문서에 testAccess:true 를 심어도 approved 가 없어 testAccessOk 가 막는다.
   다만 그 기사는 **isActiveDriver** 로는 들어온다(ownerUid=마스터, v253 본편) —
   그건 기사 권한이라 허용 키만 쓴다. 둘을 구분해 확인한다. */
await t('testAccess 심은 기사 → 운행 읽기 (기사 권한으로 통과)', 'allow', () => getDoc(doc(ctx(DRV_TA), 'orgs', TEST, 'data', 'members')));
await t('testAccess 심은 기사 → members 쓰기 (여전히 거부)',     'deny',  () => setDoc(doc(ctx(DRV_TA), 'orgs', TEST, 'data', 'members'), { v: 9 }));
await t('testAccess 심은 기사 → 급여 쓰기 (여전히 거부)',         'deny',  () => setDoc(doc(ctx(DRV_TA), 'orgs', TEST, 'data', 'payrollManual'), { v: 9 }));
/* v255: 출퇴근은 서버가 쓴다 → driverAtt 는 기사 쓰기 키가 아니다 */
await t('testAccess 심은 기사 → driverAtt 쓰기 (★ v255 부터 거부)', 'deny', () => setDoc(doc(ctx(DRV_TA), 'orgs', TEST, 'data', 'driverAtt'), { v: 1 }));
await t('testAccess 심은 기사 → rideState 쓰기 (허용키)',        'allow', () => setDoc(doc(ctx(DRV_TA), 'orgs', TEST, 'data', 'rideState'), { v: 1 }));
await t('testAccess 심은 기사 → 남의 업체 읽기',                 'deny',  () => getDoc(doc(ctx(DRV_TA), 'orgs', orgOf(TA_OK), 'data', 'members')));
await t('_test 기사(평범) → 운행 읽기 (v253 본편 그대로)',        'allow', () => getDoc(doc(ctx(DRV_T), 'orgs', TEST, 'data', 'members')));

console.log('\n════ 3. testAccess 를 누가 켜고 끄나 ════');
await t('★ 본인이 스스로 켜기',                  'deny',  () => updateDoc(doc(ctx(PLAIN), 'users', PLAIN), { testAccess: true }));
await t('★ 본인이 자기 것 끄기',                 'deny',  () => updateDoc(doc(ctx(TA_OK), 'users', TA_OK), { testAccess: deleteField() }));
await t('본인이 다른 값과 함께 켜기',             'deny',  () => updateDoc(doc(ctx(PLAIN), 'users', PLAIN), { orgName: 'x', testAccess: true }));
await t('남이 남의 것 켜기',                     'deny',  () => updateDoc(doc(ctx(PLAIN), 'users', TA_OK), { testAccess: true }));
await t('익명이 켜기',                           'deny',  () => updateDoc(doc(anon('A2'), 'users', PLAIN), { testAccess: true }));
await t('★ 마스터가 켜기',                       'allow', () => updateDoc(doc(ctx(MASTER), 'users', PLAIN), { testAccess: true }));
await t('★ 마스터가 끄기(필드 삭제)',            'allow', () => updateDoc(doc(ctx(MASTER), 'users', TA_OK), { testAccess: deleteField() }));
/* ★ v263: 승인은 **서버(api/admin-account)** 가 한다 — 규칙의 마스터 분기를 testAccess 하나로 좁혔다.
   그래서 이 쓰기는 이제 거부가 맞다(그때는 allow 였다). 승인 자체는 Admin SDK 로 그대로 된다. */
await t('마스터가 승인+testAccess 함께 (v263: 승인은 서버만 → 거부)', 'deny', () => updateDoc(doc(ctx(MASTER), 'users', TA_PEND), { approved: true, status: 'active', plan: 'trial', trialStart: Date.now(), testAccess: true }));
await t('마스터가 testAccess + orgId 함께 (거부)','deny',  () => updateDoc(doc(ctx(MASTER), 'users', PLAIN), { testAccess: true, orgId: 'academy_hacked' }));
await t('마스터가 testAccess + orgName 함께 (거부)','deny', () => updateDoc(doc(ctx(MASTER), 'users', PLAIN), { testAccess: true, orgName: '바뀜' }));
await t('마스터가 기사 문서에 testAccess (거부)', 'deny',  () => updateDoc(doc(ctx(MASTER), 'users', DRV_T), { testAccess: true }));
await t('본인 orgName 수정은 그대로 허용',        'allow', () => updateDoc(doc(ctx(PLAIN), 'users', PLAIN), { orgName: '새이름' }));
/* ★ 값이 **실제로 바뀌는** 쓰기로 재어야 한다. PLAIN 은 이미 approved:true 라
   { approved: true } 는 affectedKeys() 가 빈 집합인 무변경 쓰기여서 통과한다(정상).
   처음에 그렇게 짜서 「거부 기대 → 허용」 거짓 실패가 났다. */
await t('본인 approved 를 **바꾸는** 쓰기는 거부',  'deny',  () => updateDoc(doc(ctx(PLAIN), 'users', PLAIN), { approved: false }));
await t('본인 plan 을 paid 로 바꾸기 거부',         'deny',  () => updateDoc(doc(ctx(PLAIN), 'users', PLAIN), { plan: 'paid' }));
await t('본인 trialStart 늘리기 거부',              'deny',  () => updateDoc(doc(ctx(PLAIN), 'users', PLAIN), { trialStart: Date.now() + 999999 }));
await t('무변경 쓰기({approved:true} 그대로)는 통과', 'allow', () => updateDoc(doc(ctx(PLAIN), 'users', PLAIN), { approved: true }));

console.log('\n════ 4. 켠 뒤 / 끈 뒤 실제로 바뀌나 ════');
{
  /* 3장에서 PLAIN 은 켜졌고 TA_OK 는 꺼졌다 — 그 결과가 출입에 반영돼야 한다 */
  await t('켜진 PLAIN → _test 읽기 (이제 허용)', 'allow', () => getDoc(doc(ctx(PLAIN), 'orgs', TEST, 'data', 'members')));
  await t('꺼진 TA_OK → _test 읽기 (이제 거부)',  'deny',  () => getDoc(doc(ctx(TA_OK), 'orgs', TEST, 'data', 'members')));
}

console.log('\n════ 5. 출입 허용 계정이 **마스터는 아니다** ════');
await t('출입 허용 계정 → admins 자기 문서 (없으니 통과하나 빈 문서)', 'allow', () => getDoc(doc(ctx(PLAIN), 'admins', PLAIN)));
await t('출입 허용 계정 → 마스터 admins 문서 읽기', 'deny', () => getDoc(doc(ctx(PLAIN), 'admins', MASTER)));
await t('출입 허용 계정 → admins 쓰기',             'deny', () => setDoc(doc(ctx(PLAIN), 'admins', PLAIN), { role: 'master' }));
await t('출입 허용 계정 → 가입자 목록 읽기',         'deny', () => getDocs(collection(ctx(PLAIN), 'users')));
await t('출입 허용 계정 → 문의함 읽기',             'deny', () => getDocs(collection(ctx(PLAIN), 'inquiries')));
await t('출입 허용 계정 → 완료 문의 삭제',           'deny', () => deleteDoc(doc(ctx(PLAIN), 'inquiries', 'q_x')));
await t('출입 허용 계정 → 남의 업체 자료 읽기',      'deny', () => getDoc(doc(ctx(PLAIN), 'orgs', orgOf(TA_OK), 'data', 'members')));
await t('출입 허용 계정 → 자기 업체 자료는 그대로',   'allow',() => getDoc(doc(ctx(PLAIN), 'orgs', orgOf(PLAIN), 'data', 'members')));

console.log('\n════ 6. _demo·otp 회귀 ════');
await t('익명 → _demo 읽기',  'allow', () => getDoc(doc(anon('A3'), 'orgs', DEMO, 'data', 'members')));
await t('_demo 쓰기 거부',     'deny',  () => setDoc(doc(ctx(TA_OK), 'orgs', DEMO, 'data', 'members'), { v: 1 }));
await t('otp 읽기 거부(마스터)','deny', () => getDoc(doc(ctx(MASTER), 'otp', 'X')));
await t('otp 쓰기 거부(출입 계정)','deny',() => setDoc(doc(ctx(PLAIN), 'otp', 'X'), { a: 1 }));

console.log('\n════ 7. 규칙 파일 원문 ════');
{
  const src = _PINNED_RULES;
  const chk = (label, cond) => { if (cond) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✘ ' + label); } };
  chk('testOrgAdmin = _test && (isAdmin() || testAccessOk())',
    src.indexOf('return isTestOrg(orgId) && (isAdmin() || testAccessOk());') >= 0);
  chk('testAccessOk 가 approved·withdrawn 을 .get 기본값으로 읽는다',
    /testAccess', false\) == true/.test(src) && /approved', false\) == true/.test(src)
    && /withdrawn', false\) != true/.test(src));
  /* ★ v261 로 목록이 길어졌다 (사업자 정보 5 + signupMethod + phone 추가 = 17개).
     원문을 통째로 맞추던 검사라 깨졌다 — 「testAccess 가 목록에 있는가」가 이 회차의 뜻이므로
     목록 안에 있는지로 바꾸고, v253 당시 열 개였다는 것도 함께 적어 둔다. */
  const _hasAny = (src.match(/hasAny\(\['approved'[\s\S]*?\]\)/) || [''])[0];
  chk('본인 보호 목록에 testAccess', _hasAny.indexOf("'testAccess'") >= 0);
  chk('  v253 의 열 개가 그대로 남아 있다',
    ['approved','status','plan','trialStart','bizType','role','driverOrg','ownerUid','carId','testAccess']
      .every(k => _hasAny.indexOf("'" + k + "'") >= 0));
  /* v263: 목록이 testAccess 하나로 좁혀졌다 — 이 회차의 뜻은 「testAccess 가 마스터 분기에 있나」다 */
  chk('마스터 분기에 testAccess', src.indexOf("hasOnly(['testAccess'])") >= 0);
  const lines = src.split('\n');
  const calls = lines.filter(l => /testOrgAdmin\(orgId\)/.test(l) && !/function testOrgAdmin/.test(l));
  /* v254: drivers 명부 한 자리가 늘어 6곳 (자료·백업 5 + drivers 1) */
  chk('testOrgAdmin 부르는 줄 6곳 (' + calls.length + ')', calls.length === 6);
  const cp = await import('node:child_process');
  const stat = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat 070d6ab -- firestore.rules').toString().trim();
  console.log('  규칙 diff (v253 커밋 대비): ' + (stat || '없음'));
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
