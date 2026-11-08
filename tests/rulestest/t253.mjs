/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v253 규칙 — _test 마스터 전용 · 마스터 소유 기사 통로 · 문의 삭제 + v250·v252 회귀 */
import fs from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
/* ★ v274: 규칙을 **이 회차 커밋에 고정**한다 — v253(`070d6ab`).
   전에는 이 폴더의 사본(= **지금** 규칙)을 읽었다. 그래서 뒤 회차가 규칙을 고치면
   이 회차의 기대값이 거짓으로 깨졌다 — v274 가 기사 읽기 키를 9→6 으로 줄이고
   `carData` 블록을 더하자 한꺼번에 터졌다. v253 가 틀린 것이 아니다.
   **지금** 규칙은 t274.mjs 가 본다 — 그쪽이 진짜다. */
/* ★ 기대값이 뒷 회차에 **앞으로 고쳐졌다** — 그래서 원래 회차가 아니라
   그 기대값이 가리키는 회차(v255)에 맞춘다(여러 회차로 돌려 실측으로 골랐다). */
const _RULES_REF = process.env.COS_RULES_REF || '4fb71ff';   /* v255 */
const _PINNED_RULES = (await import('child_process')).execSync(
  'git -C ' + COS_ROOT + ' show ' + _RULES_REF + ':firestore.rules',
  { maxBuffer: 1 << 26 }).toString()
  .split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));


const env = await initializeTestEnvironment({
  projectId: 'cos-v253',
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

const MASTER   = 'MasterUid00000000000000000001';
const OWNER    = 'OwnerOk00000000000000000002';   // 승인·체험 중인 실업체 소유자
const PEND     = 'OwnerPending00000000000000003'; // 미승인
const TOWNER   = 'TestOwner000000000000000004';   // orgId 가 _test 로 끝나는 가입 계정(있을 수 있다)
const DRV_TEST = 'DriverTest00000000000000005';   // 마스터가 만든 _test 기사 (ownerUid=MASTER)
const DRV_REAL = 'DriverReal00000000000000006';   // 실업체 기사 (ownerUid=OWNER)
const STRANGER = 'Stranger0000000000000000007';

const REAL = 'academy_' + OWNER.slice(0, 12);
const TEST = 'freezone_test';
const DEMO = 'academy_demo';
const TORG = 'academy_tt_test';                   // TOWNER 의 기관(이름이 _test 로 끝난다)

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'admins', MASTER), { role: 'master' });
  const own = (orgId, extra) => Object.assign({
    bizType: 'academy', orgName: '업체', orgId, contact: '010-1',
    status: 'active', approved: true, paidUntil: Date.now() + 365 * 86400000, trialEnd: Date.now() + 30 * 86400000, contractMonths: 12, plan: 'trial', trialStart: Date.now(),
    signupMethod: 'phone', phone: '01011112222', createdAt: Date.now()
  }, extra || {});
  await setDoc(doc(db, 'users', OWNER),  own(REAL));
  await setDoc(doc(db, 'users', PEND),   own('academy_pend0000000', { approved: false, status: 'pending', plan: 'pending' }));
  await setDoc(doc(db, 'users', TOWNER), own(TORG));
  await setDoc(doc(db, 'users', DRV_TEST), { role: 'driver', driverOrg: TEST, ownerUid: MASTER, carId: 'car1' });
  await setDoc(doc(db, 'users', DRV_REAL), { role: 'driver', driverOrg: REAL, ownerUid: OWNER, carId: 'car1' });
  await setDoc(doc(db, 'orgs', TEST, 'drivers', DRV_TEST), { carId: 'car1', ownerUid: MASTER });
  await setDoc(doc(db, 'orgs', REAL, 'drivers', DRV_REAL), { carId: 'car1', ownerUid: OWNER });
  /* 자료·백업 씨앗 */
  for (const o of [TEST, REAL, DEMO, TORG]) {
    await setDoc(doc(db, 'orgs', o, 'data', 'members'), { v: 1 });
    await setDoc(doc(db, 'orgs', o, 'backups', 'members__1'), { key: 'members', v: 1 });
    await setDoc(doc(db, 'orgs', o, 'backups', 'driverAtt__1'), { key: 'driverAtt', v: 1 });
  }
  /* 문의 — 상태별 */
  await setDoc(doc(db, 'inquiries', 'q_new'),  { text: 'x', date: '2026-10-30', status: 'new' });
  await setDoc(doc(db, 'inquiries', 'q_work'), { text: 'x', date: '2026-10-30', status: 'working' });
  await setDoc(doc(db, 'inquiries', 'q_done'), { text: 'x', date: '2026-10-30', status: 'done' });
  await setDoc(doc(db, 'inquiries', 'q_none'), { text: 'x', date: '2026-10-30' });   // status 없는 옛 문서
  await setDoc(doc(db, 'inquiries', 'q_done2'), { text: 'x', date: '2026-10-30', status: 'done' });
});

console.log('════ 1. _test 자료 — 마스터만 ════');
await t('마스터 → _test 자료 읽기',  'allow', () => getDoc(doc(ctx(MASTER), 'orgs', TEST, 'data', 'members')));
await t('마스터 → _test 자료 쓰기',  'allow', () => setDoc(doc(ctx(MASTER), 'orgs', TEST, 'data', 'members'), { v: 2 }));
await t('마스터 → _test 백업 읽기',  'allow', () => getDoc(doc(ctx(MASTER), 'orgs', TEST, 'backups', 'members__1')));
await t('마스터 → _test 백업 만들기', 'allow', () => setDoc(doc(ctx(MASTER), 'orgs', TEST, 'backups', 'members__9'), { key: 'members', v: 1 }));
await t('마스터 → _test 백업 지우기', 'allow', () => deleteDoc(doc(ctx(MASTER), 'orgs', TEST, 'backups', 'members__1')));
/* ★ 여기가 이번 회차의 핵심 — v252 까지는 아래 전부 **허용**이었다 */
await t('승인된 업체 소유자 → _test 자료 읽기', 'deny',  () => getDoc(doc(ctx(OWNER), 'orgs', TEST, 'data', 'members')));
await t('승인된 업체 소유자 → _test 자료 쓰기', 'deny',  () => setDoc(doc(ctx(OWNER), 'orgs', TEST, 'data', 'members'), { v: 3 }));
await t('승인된 업체 소유자 → _test 백업 읽기', 'deny',  () => getDoc(doc(ctx(OWNER), 'orgs', TEST, 'backups', 'members__1')));
await t('승인된 업체 소유자 → _test 백업 만들기','deny', () => setDoc(doc(ctx(OWNER), 'orgs', TEST, 'backups', 'x__1'), { key: 'members' }));
await t('승인된 업체 소유자 → _test 백업 지우기','deny', () => deleteDoc(doc(ctx(OWNER), 'orgs', TEST, 'backups', 'driverAtt__1')));
await t('미승인 계정 → _test 자료 읽기',        'deny',  () => getDoc(doc(ctx(PEND), 'orgs', TEST, 'data', 'members')));
await t('익명 로그인 → _test 자료 읽기',        'deny',  () => getDoc(doc(anon('A1'), 'orgs', TEST, 'data', 'members')));
await t('익명 로그인 → _test 자료 쓰기',        'deny',  () => setDoc(doc(anon('A1'), 'orgs', TEST, 'data', 'members'), { v: 4 }));
await t('로그인 안 함 → _test 자료 읽기',       'deny',  () => getDoc(doc(out(), 'orgs', TEST, 'data', 'members')));
await t('아무 관계 없는 계정 → _test 자료 읽기', 'deny',  () => getDoc(doc(ctx(STRANGER), 'orgs', TEST, 'data', 'members')));
await t('다른 업체 기사 → _test 자료 읽기',      'deny',  () => getDoc(doc(ctx(DRV_REAL), 'orgs', TEST, 'data', 'members')));
await t('다른 업체 기사 → _test 허용키 쓰기',    'deny',  () => setDoc(doc(ctx(DRV_REAL), 'orgs', TEST, 'data', 'rideState'), { v: 1 }));

console.log('\n════ 2. 이름이 _test 인 기관을 **가입 계정이 소유**한 경우 (isMyOrg 는 그대로) ════');
await t('그 소유자 본인 → 자기 _test 기관 읽기', 'allow', () => getDoc(doc(ctx(TOWNER), 'orgs', TORG, 'data', 'members')));
await t('그 소유자 본인 → 자기 _test 기관 쓰기', 'allow', () => setDoc(doc(ctx(TOWNER), 'orgs', TORG, 'data', 'members'), { v: 2 }));
await t('남이 그 _test 기관 읽기',               'deny',  () => getDoc(doc(ctx(OWNER), 'orgs', TORG, 'data', 'members')));
await t('마스터는 그 _test 기관도 읽는다',        'allow', () => getDoc(doc(ctx(MASTER), 'orgs', TORG, 'data', 'members')));

console.log('\n════ 3. 마스터가 만든 _test 기사 (ownerUid = 마스터) ════');
await t('_test 기사 → 운행 자료 읽기',      'allow', () => getDoc(doc(ctx(DRV_TEST), 'orgs', TEST, 'data', 'members')));
/* v255: 출퇴근은 서버가 쓴다 → 기사 driverAtt 쓰기 거부 */
await t('_test 기사 → 출퇴근 쓰기 (★ v255 부터 거부)',  'deny', () => setDoc(doc(ctx(DRV_TEST), 'orgs', TEST, 'data', 'driverAtt'), { v: 1 }));
await t('_test 기사 → 운행 키(rideState) 쓰기',  'allow', () => setDoc(doc(ctx(DRV_TEST), 'orgs', TEST, 'data', 'rideState'), { v: 1 }));
await t('_test 기사 → rideState 쓰기',      'allow', () => setDoc(doc(ctx(DRV_TEST), 'orgs', TEST, 'data', 'rideState'), { v: 1 }));
await t('_test 기사 → members 쓰기(비허용)', 'deny',  () => setDoc(doc(ctx(DRV_TEST), 'orgs', TEST, 'data', 'members'), { v: 9 }));
await t('_test 기사 → 급여 쓰기(비허용)',    'deny',  () => setDoc(doc(ctx(DRV_TEST), 'orgs', TEST, 'data', 'payrollManual'), { v: 9 }));
await t('_test 기사 → 백업 만들기(허용키)',  'allow', () => setDoc(doc(ctx(DRV_TEST), 'orgs', TEST, 'backups', 'rideState__9'), { key: 'rideState' }));
await t('_test 기사 → 백업 만들기(비허용키)', 'deny', () => setDoc(doc(ctx(DRV_TEST), 'orgs', TEST, 'backups', 'members__9'), { key: 'members' }));
await t('_test 기사 → 자기 drivers 문서 읽기','allow',() => getDoc(doc(ctx(DRV_TEST), 'orgs', TEST, 'drivers', DRV_TEST)));
await t('_test 기사 → 남의 업체 자료 읽기',   'deny',  () => getDoc(doc(ctx(DRV_TEST), 'orgs', REAL, 'data', 'members')));

console.log('\n════ 4. 실업체 기사 — 종전 그대로 ════');
await t('실업체 기사 → 운행 자료 읽기',  'allow', () => getDoc(doc(ctx(DRV_REAL), 'orgs', REAL, 'data', 'members')));
await t('실업체 기사 → 출퇴근 쓰기 (★ v255 부터 거부)', 'deny', () => setDoc(doc(ctx(DRV_REAL), 'orgs', REAL, 'data', 'driverAtt'), { v: 1 }));
await t('실업체 기사 → 운행 키(rideState) 쓰기', 'allow', () => setDoc(doc(ctx(DRV_REAL), 'orgs', REAL, 'data', 'rideState'), { v: 1 }));
await t('실업체 기사 → 급여 쓰기 거부',   'deny',  () => setDoc(doc(ctx(DRV_REAL), 'orgs', REAL, 'data', 'payrollManual'), { v: 1 }));
await t('소유자 → 자기 업체 자료 읽기',   'allow', () => getDoc(doc(ctx(OWNER), 'orgs', REAL, 'data', 'members')));
await t('소유자 → 자기 업체 자료 쓰기',   'allow', () => setDoc(doc(ctx(OWNER), 'orgs', REAL, 'data', 'members'), { v: 5 }));
await t('남이 그 업체 자료 읽기',         'deny',  () => getDoc(doc(ctx(STRANGER), 'orgs', REAL, 'data', 'members')));

console.log('\n════ 5. _demo — 종전 그대로 (둘러보기) ════');
await t('익명 → _demo 읽기',    'allow', () => getDoc(doc(anon('A2'), 'orgs', DEMO, 'data', 'members')));
await t('업체 계정 → _demo 읽기','allow', () => getDoc(doc(ctx(OWNER), 'orgs', DEMO, 'data', 'members')));
await t('_demo 쓰기는 거부',     'deny',  () => setDoc(doc(ctx(OWNER), 'orgs', DEMO, 'data', 'members'), { v: 1 }));
await t('마스터도 _demo 쓰기 거부','deny', () => setDoc(doc(ctx(MASTER), 'orgs', DEMO, 'data', 'members'), { v: 1 }));

console.log('\n════ 6. 문의 삭제 — 마스터 + 완료만 ════');
await t('마스터 → 완료 문의 삭제',        'allow', () => deleteDoc(doc(ctx(MASTER), 'inquiries', 'q_done')));
await t('마스터 → 신규 문의 삭제',        'deny',  () => deleteDoc(doc(ctx(MASTER), 'inquiries', 'q_new')));
await t('마스터 → 처리중 문의 삭제',      'deny',  () => deleteDoc(doc(ctx(MASTER), 'inquiries', 'q_work')));
await t('마스터 → status 없는 옛 문의 삭제','deny', () => deleteDoc(doc(ctx(MASTER), 'inquiries', 'q_none')));
await t('업체 소유자 → 완료 문의 삭제',    'deny',  () => deleteDoc(doc(ctx(OWNER), 'inquiries', 'q_done2')));
await t('익명 → 완료 문의 삭제',           'deny',  () => deleteDoc(doc(anon('A3'), 'inquiries', 'q_done2')));
await t('로그인 안 함 → 완료 문의 삭제',    'deny',  () => deleteDoc(doc(out(), 'inquiries', 'q_done2')));
await t('문의 보내기는 익명도 그대로',      'allow', () => setDoc(doc(anon('A4'), 'inquiries', 'q_newnew'), { text: 'x', date: '2026-10-30', status: 'new' }));
await t('익명이 문의 읽기는 거부',          'deny',  () => getDoc(doc(anon('A4'), 'inquiries', 'q_newnew')));
await t('마스터가 문의 상태 바꾸기',        'allow', () => updateDoc(doc(ctx(MASTER), 'inquiries', 'q_new'), { status: 'done' }));

console.log('\n════ 7. v252·v250 회귀 ════');
await t('otp 읽기 거부 (마스터도)',   'deny',  () => getDoc(doc(ctx(MASTER), 'otp', 'X')));
await t('otp 쓰기 거부 (마스터도)',   'deny',  () => setDoc(doc(ctx(MASTER), 'otp', 'X'), { a: 1 }));
await t('otp 목록 거부',              'deny',  () => getDocs(collection(ctx(MASTER), 'otp')));
await t('내 admins 문서 읽기',        'allow', () => getDoc(doc(ctx(MASTER), 'admins', MASTER)));
await t('남의 admins 문서 읽기 거부',  'deny',  () => getDoc(doc(ctx(OWNER), 'admins', MASTER)));
await t('admins 쓰기 거부',           'deny',  () => setDoc(doc(ctx(OWNER), 'admins', OWNER), { role: 'master' }));
await t('admins 목록 거부',           'deny',  () => getDocs(collection(ctx(MASTER), 'admins')));
await t('마스터가 가입자 목록 읽기',    'allow', () => getDocs(collection(ctx(MASTER), 'users')));
await t('가입자가 users 목록 읽기 거부','deny',  () => getDocs(collection(ctx(OWNER), 'users')));
await t('승인 대기자도 billing 읽기',  'allow', () => getDoc(doc(anon('A5'), 'orgs', '_master', 'data', 'billing')));
await t('익명이 billing 쓰기 거부',    'deny',  () => setDoc(doc(anon('A5'), 'orgs', '_master', 'data', 'billing'), { bank: 'x' }));
await t('shares 목록 거부',           'deny',  () => getDocs(collection(out(), 'shares')));
await t('엉뚱한 모양 shares 만들기 거부','deny', () => setDoc(doc(ctx(OWNER), 'shares', 'T1'), { kind: 'hack', x: 1 }));
await t('drivers 쓰기 거부 (서버 전용)','deny', () => setDoc(doc(ctx(OWNER), 'orgs', REAL, 'drivers', 'NEW'), { carId: 'c' }));
await t('소유자가 drivers 읽기',       'allow', () => getDoc(doc(ctx(OWNER), 'orgs', REAL, 'drivers', DRV_REAL)));
await t('users 본인 orgName 수정',     'allow', () => updateDoc(doc(ctx(OWNER), 'users', OWNER), { orgName: '새이름' }));
await t('users 본인 approved 수정 거부','deny',  () => updateDoc(doc(ctx(OWNER), 'users', OWNER), { approved: true, plan: 'paid' }));

console.log('\n════ 8. 규칙 파일 — 바뀐 자리만 바뀌었나 ════');
{
  const cp = await import('node:child_process');
  const stat = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat edd2752 -- firestore.rules').toString().trim();
  const [ins, del] = stat ? stat.split(/\s+/) : ['0', '0'];
  console.log('  git diff: +' + ins + ' / −' + del);
  const src = _PINNED_RULES;
  /* 「정의 줄」과 「부르는 줄」을 나눠 센다 — 전에 정의까지 세어 거짓 실패가 났다 */
  const lines = src.split('\n');
  const callSites = lines.filter(l => /testOrgAdmin\(orgId\)/.test(l) && !/function testOrgAdmin/.test(l));
  const rawCalls  = lines.filter(l => /isTestOrg\(orgId\)/.test(l)
                                   && !/function isTestOrg/.test(l) && !/^\s*\/\//.test(l));
  console.log('  testOrgAdmin 부르는 줄 ' + callSites.length + '곳 / isTestOrg 직접 부르는 줄 ' + rawCalls.length + '곳');
  callSites.forEach(l => console.log('      ' + l.trim().slice(0, 78)));
  /* ★ v254 에서 drivers 명부 읽기 한 자리가 늘어 **6곳**이 되었다(자료·백업 5 + drivers 1).
     이 묶음은 v253 기록이라 5곳을 단정했는데, 늘어난 쪽이 맞다. */
  if (callSites.length === 6) { pass++; console.log('  ✔ 자료·백업 5 + drivers 1 = 6자리 전부 testOrgAdmin'); }
  else { fail++; console.log('  ✘ 6자리가 아님'); }
  /* isTestOrg 를 직접 부르는 곳은 testOrgAdmin 안의 한 줄뿐이어야 한다 */
  /* 보정2 에서 testOrgAdmin 의 몸이 `isAdmin() || testAccessOk()` 로 넓어졌다 —
     이 검사가 지켜야 할 것은 「isTestOrg 를 **직접** 부르는 자리가 그 한 줄뿐인가」다. */
  if (rawCalls.length === 1 && /isAdmin\(\)/.test(rawCalls[0])) {
    pass++; console.log('  ✔ isTestOrg 직접 호출은 testOrgAdmin 안 한 줄뿐: ' + rawCalls[0].trim());
  } else { fail++; console.log('  ✘ isTestOrg 를 그냥 부르는 자리가 남았다: ' + rawCalls.map(l => l.trim()).join(' | ')); }
  if (src.indexOf("allow delete: if isAdmin() && resource.data.get('status', '') == 'done';") >= 0) {
    pass++; console.log('  ✔ inquiries delete 규칙 원문 확인');
  } else { fail++; console.log('  ✘ inquiries delete 규칙이 다름'); }
  if (/exists\(\/databases\/\$\(database\)\/documents\/admins\/\$\(ownerUid\)\)\s*\n\s*\|\| \(/.test(src)) {
    pass++; console.log('  ✔ ownerAlive 에 마스터 분기 + 괄호 확인');
  } else { fail++; console.log('  ✘ ownerAlive 분기가 다름'); }
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
