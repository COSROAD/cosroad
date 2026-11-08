/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v254 — orgs/{org}/drivers 읽기에 testOrgAdmin 추가 */
import fs from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
/* ★ v274: 규칙을 **이 회차 커밋에 고정**한다 — v254(`2eadaaa`).
   전에는 이 폴더의 사본(= **지금** 규칙)을 읽었다. 그래서 뒤 회차가 규칙을 고치면
   이 회차의 기대값이 거짓으로 깨졌다 — v274 가 기사 읽기 키를 9→6 으로 줄이고
   `carData` 블록을 더하자 한꺼번에 터졌다. v254 가 틀린 것이 아니다.
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
  projectId: 'cos-v254',
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
const TA_OK  = 'TaOk00000000000000000000002';   // 승인 + testAccess  ← 사장님 휴대폰 계정 자리
const TA_PND = 'TaPend000000000000000003';      // 미승인 + testAccess
const TA_WDR = 'TaWdr0000000000000000004';      // 승인 + 탈퇴 + testAccess
const PLAIN  = 'Plain000000000000000005';       // 승인, 표시 없음
const OWNER  = 'OwnerReal0000000000006';        // 실업체 소유자
const DRV_T  = 'DriverTest00000000007';         // _test 기사
const DRV_TA = 'DriverTa0000000000008';         // _test 기사인데 testAccess 를 심어 봤다
const DRV_R  = 'DriverReal000000000009';        // 실업체 기사
const TEST = 'freezone_test';
const REAL = 'academy_' + OWNER.slice(0, 12);

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'admins', MASTER), { role: 'master' });
  const own = (uid, extra) => Object.assign({
    bizType: 'academy', orgName: '업체', orgId: 'academy_' + uid.slice(0, 12), contact: '010-1',
    status: 'active', approved: true, paidUntil: Date.now() + 365 * 86400000, trialEnd: Date.now() + 30 * 86400000, contractMonths: 12, plan: 'trial', trialStart: Date.now(), createdAt: Date.now()
  }, extra || {});
  await setDoc(doc(db, 'users', TA_OK),  own(TA_OK,  { testAccess: true }));
  await setDoc(doc(db, 'users', TA_PND), own(TA_PND, { testAccess: true, approved: false }));
  await setDoc(doc(db, 'users', TA_WDR), own(TA_WDR, { testAccess: true, withdrawn: true }));
  await setDoc(doc(db, 'users', PLAIN),  own(PLAIN));
  await setDoc(doc(db, 'users', OWNER),  own(OWNER,  { orgId: REAL }));
  await setDoc(doc(db, 'users', DRV_T),  { role: 'driver', driverOrg: TEST, ownerUid: MASTER, carId: 'c1' });
  await setDoc(doc(db, 'users', DRV_TA), { role: 'driver', driverOrg: TEST, ownerUid: MASTER, carId: 'c2', testAccess: true, approved: true });
  await setDoc(doc(db, 'users', DRV_R),  { role: 'driver', driverOrg: REAL, ownerUid: OWNER, carId: 'c1' });
  await setDoc(doc(db, 'orgs', TEST, 'drivers', DRV_T),  { carId: 'c1', ownerUid: MASTER, phone: '01011112222' });
  await setDoc(doc(db, 'orgs', TEST, 'drivers', DRV_TA), { carId: 'c2', ownerUid: MASTER });
  await setDoc(doc(db, 'orgs', REAL, 'drivers', DRV_R),  { carId: 'c1', ownerUid: OWNER });
  await setDoc(doc(db, 'orgs', TEST, 'data', 'members'), { v: 1 });
  await setDoc(doc(db, 'orgs', REAL, 'data', 'members'), { v: 1 });
});

console.log('════ 1. _test drivers 명부 읽기 (이번에 고친 자리) ════');
await t('마스터 → 문서 읽기',               'allow', () => getDoc(doc(ctx(MASTER), 'orgs', TEST, 'drivers', DRV_T)));
await t('마스터 → 명부 목록',               'allow', () => getDocs(collection(ctx(MASTER), 'orgs', TEST, 'drivers')));
await t('★ 출입 허용(승인) → 문서 읽기',     'allow', () => getDoc(doc(ctx(TA_OK), 'orgs', TEST, 'drivers', DRV_T)));
await t('★ 출입 허용(승인) → 명부 목록',     'allow', () => getDocs(collection(ctx(TA_OK), 'orgs', TEST, 'drivers')));
await t('출입 허용인데 **미승인** → 목록',    'deny',  () => getDocs(collection(ctx(TA_PND), 'orgs', TEST, 'drivers')));
await t('출입 허용인데 **탈퇴** → 목록',      'deny',  () => getDocs(collection(ctx(TA_WDR), 'orgs', TEST, 'drivers')));
await t('출입 표시 없는 승인 계정 → 목록',     'deny',  () => getDocs(collection(ctx(PLAIN), 'orgs', TEST, 'drivers')));
await t('실업체 소유자 → 남의 _test 목록',    'deny',  () => getDocs(collection(ctx(OWNER), 'orgs', TEST, 'drivers')));
await t('기사(testAccess 심어도) → 목록',    'deny',  () => getDocs(collection(ctx(DRV_TA), 'orgs', TEST, 'drivers')));
await t('   그 기사 → 자기 문서는 읽는다',     'allow', () => getDoc(doc(ctx(DRV_TA), 'orgs', TEST, 'drivers', DRV_TA)));
await t('   그 기사 → 남의 기사 문서는 거부',  'deny',  () => getDoc(doc(ctx(DRV_TA), 'orgs', TEST, 'drivers', DRV_T)));
await t('익명 → 목록',                      'deny',  () => getDocs(collection(anon('A1'), 'orgs', TEST, 'drivers')));
await t('로그인 안 함 → 목록',               'deny',  () => getDocs(collection(out(), 'orgs', TEST, 'drivers')));

console.log('\n════ 2. 실업체 drivers 명부 — 종전과 같아야 한다 ════');
await t('자기 업체 소유자 → 목록',            'allow', () => getDocs(collection(ctx(OWNER), 'orgs', REAL, 'drivers')));
await t('★ 출입 허용 계정 → **남의 실업체** 목록', 'deny', () => getDocs(collection(ctx(TA_OK), 'orgs', REAL, 'drivers')));
await t('★ 출입 허용 계정 → 남의 실업체 문서',     'deny', () => getDoc(doc(ctx(TA_OK), 'orgs', REAL, 'drivers', DRV_R)));
await t('마스터 → 실업체 목록 (종전 허용)',      'allow', () => getDocs(collection(ctx(MASTER), 'orgs', REAL, 'drivers')));
await t('실업체 기사 → 자기 문서',              'allow', () => getDoc(doc(ctx(DRV_R), 'orgs', REAL, 'drivers', DRV_R)));
await t('출입 표시 없는 계정 → 남의 실업체 목록',  'deny',  () => getDocs(collection(ctx(PLAIN), 'orgs', REAL, 'drivers')));

console.log('\n════ 3. 쓰기는 여전히 서버 전용 ════');
await t('마스터 → drivers 쓰기',             'deny',  () => setDoc(doc(ctx(MASTER), 'orgs', TEST, 'drivers', 'NEW'), { carId: 'x' }));
await t('★ 출입 허용 계정 → drivers 쓰기',    'deny',  () => setDoc(doc(ctx(TA_OK), 'orgs', TEST, 'drivers', 'NEW'), { carId: 'x' }));
await t('★ 출입 허용 계정 → drivers 지우기',  'deny',  () => deleteDoc(doc(ctx(TA_OK), 'orgs', TEST, 'drivers', DRV_T)));
await t('소유자 → drivers 쓰기',             'deny',  () => setDoc(doc(ctx(OWNER), 'orgs', REAL, 'drivers', 'NEW'), { carId: 'x' }));

console.log('\n════ 4. 회귀 — 자료·백업·users·otp ════');
await t('출입 허용 → _test 자료 읽기',        'allow', () => getDoc(doc(ctx(TA_OK), 'orgs', TEST, 'data', 'members')));
await t('출입 허용 → _test 자료 쓰기',        'allow', () => setDoc(doc(ctx(TA_OK), 'orgs', TEST, 'data', 'members'), { v: 2 }));
await t('출입 표시 없는 계정 → _test 자료',    'deny',  () => getDoc(doc(ctx(PLAIN), 'orgs', TEST, 'data', 'members')));
await t('_test 기사 → 운행 자료 읽기',         'allow', () => getDoc(doc(ctx(DRV_T), 'orgs', TEST, 'data', 'members')));
/* v255: 출퇴근은 서버가 쓴다 → driverAtt 는 기사 쓰기 키가 아니다 */
await t('_test 기사 → driverAtt 쓰기 (★ v255 부터 거부)', 'deny', () => setDoc(doc(ctx(DRV_T), 'orgs', TEST, 'data', 'driverAtt'), { v: 1 }));
await t('_test 기사 → rideState 쓰기',        'allow', () => setDoc(doc(ctx(DRV_T), 'orgs', TEST, 'data', 'rideState'), { v: 1 }));
await t('_test 기사 → members 쓰기 거부',      'deny',  () => setDoc(doc(ctx(DRV_T), 'orgs', TEST, 'data', 'members'), { v: 9 }));
await t('마스터 → 기사 users 문서 삭제 거부',   'deny',  () => deleteDoc(doc(ctx(MASTER), 'users', DRV_T)));
await t('출입 허용 → cosroad_global 거부',     'deny',  () => getDoc(doc(ctx(TA_OK), 'orgs', 'cosroad_global', 'data', 'aligo')));
await t('출입 허용 → 가입자 목록 거부',          'deny',  () => getDocs(collection(ctx(TA_OK), 'users')));
await t('출입 허용 → otp 거부',                'deny',  () => getDoc(doc(ctx(TA_OK), 'otp', 'X')));
await t('본인이 testAccess 켜기 거부',          'deny',  () => setDoc(doc(ctx(PLAIN), 'users', PLAIN), { testAccess: true }, { merge: true }));

console.log('\n════ 5. 규칙 파일 원문 ════');
{
  const src = _PINNED_RULES;
  const chk = (label, cond) => { if (cond) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✘ ' + label); } };
  /* v263: isMyOrg → isMyOrgReadable 로 바뀌었다(만료여도 읽기 허용). 이 회차의 뜻은
     「drivers read 에 testOrgAdmin 이 있나」이므로 그 부분만 본다. */
  chk('drivers read 에 testOrgAdmin 이 들어갔다',
    /allow read:  if signedIn\(\) && \(isMyOrgReadable\(orgId\) \|\| isAdmin\(\) \|\| testOrgAdmin\(orgId\) \|\| request\.auth\.uid == driverUid\);/.test(src));
  chk('drivers write 는 false 그대로', /match \/orgs\/\{orgId\}\/drivers\/\{driverUid\} \{[\s\S]*?allow write: if false;/.test(src));
  const lines = src.split('\n');
  const calls = lines.filter(l => /testOrgAdmin\(orgId\)/.test(l) && !/function testOrgAdmin/.test(l));
  /* v255: 백업 delete 에서 isActiveDriver 를 빼면서 testOrgAdmin 호출 줄 수는 그대로 6곳이다 */
chk('testOrgAdmin 부르는 줄 6곳 (자료·백업 5 + drivers 1): ' + calls.length, calls.length === 6);
  const cp = await import('node:child_process');
  console.log('  규칙 diff (23202fc 대비): '
    + (cp.execSync('git -C ' + COS_ROOT + ' diff --numstat 23202fc -- firestore.rules').toString().trim() || '없음'));
  console.log('  규칙 줄 수: ' + (lines.length - (src.endsWith('\n') ? 1 : 0)));
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
