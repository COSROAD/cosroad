/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v253 보정4 — users delete 에서 기사 문서 제외 */
import fs from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
/* ★ v274: 규칙을 **이 회차 커밋에 고정**한다 — v253 보정4(`23202fc`).
   전에는 이 폴더의 사본(= **지금** 규칙)을 읽었다. 그래서 뒤 회차가 규칙을 고치면
   이 회차의 기대값이 거짓으로 깨졌다 — v274 가 기사 읽기 키를 9→6 으로 줄이고
   `carData` 블록을 더하자 한꺼번에 터졌다. v253 보정4 가 틀린 것이 아니다.
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
  projectId: 'cos-v253d',
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
const OWNER  = 'OwnerOk00000000000000000002';   // 승인된 업체
const PEND   = 'OwnerPending00000000000003';    // 미승인 업체 신청
const OLDDOC = 'OwnerOldNoApproved0000004';     // approved 필드가 아예 없는 옛 업체 문서
const WDR    = 'OwnerWithdrawn00000000005';     // 탈퇴(미승인 상태)
const DRV    = 'DriverOk000000000000006';       // 기사 (approved 없음)
const DRV2   = 'DriverTest00000000000007';      // 마스터 소유 _test 기사
const DRV3   = 'DriverOdd000000000000008';      // 기사인데 orgName 이 있는 이상 문서
const REAL = 'academy_' + OWNER.slice(0, 12);

async function seed() {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'admins', MASTER), { role: 'master' });
    const own = (uid, extra) => Object.assign({
      bizType: 'academy', orgName: '업체', orgId: 'academy_' + uid.slice(0, 12), contact: '010-1',
      status: 'active', approved: true, paidUntil: Date.now() + 365 * 86400000, trialEnd: Date.now() + 30 * 86400000, contractMonths: 12, plan: 'trial', trialStart: Date.now(), createdAt: Date.now()
    }, extra || {});
    await setDoc(doc(db, 'users', OWNER), own(OWNER));
    await setDoc(doc(db, 'users', PEND),  own(PEND,  { approved: false, status: 'pending', plan: 'pending' }));
    await setDoc(doc(db, 'users', WDR),   own(WDR,   { approved: false, withdrawn: true }));
    const oldd = own(OLDDOC); delete oldd.approved;
    await setDoc(doc(db, 'users', OLDDOC), oldd);
    await setDoc(doc(db, 'users', DRV),  { role: 'driver', driverOrg: REAL, ownerUid: OWNER, carId: 'c1', name: '박기사', phone: '01011112222', createdAt: Date.now() });
    await setDoc(doc(db, 'users', DRV2), { role: 'driver', driverOrg: 'freezone_test', ownerUid: MASTER, carId: 'c2' });
    await setDoc(doc(db, 'users', DRV3), { role: 'driver', driverOrg: REAL, ownerUid: OWNER, carId: 'c3', orgName: '업체', approved: false });
    await setDoc(doc(db, 'orgs', REAL, 'drivers', DRV), { carId: 'c1', ownerUid: OWNER });
    await setDoc(doc(db, 'orgs', REAL, 'data', 'members'), { v: 1 });
  });
}
await seed();

console.log('════ 1. users delete — 기사 문서는 못 지운다 ════');
await t('★ 마스터 → 기사 문서 삭제',                  'deny',  () => deleteDoc(doc(ctx(MASTER), 'users', DRV)));
await t('★ 마스터 → _test 기사 문서 삭제',            'deny',  () => deleteDoc(doc(ctx(MASTER), 'users', DRV2)));
await t('★ 마스터 → 기사인데 approved:false 인 문서 삭제','deny',() => deleteDoc(doc(ctx(MASTER), 'users', DRV3)));
await t('기사 본인 → 자기 문서 삭제',                   'deny',  () => deleteDoc(doc(ctx(DRV), 'users', DRV)));
await t('업체 소유자 → 기사 문서 삭제',                 'deny',  () => deleteDoc(doc(ctx(OWNER), 'users', DRV)));
await t('익명 → 기사 문서 삭제',                       'deny',  () => deleteDoc(doc(anon('A1'), 'users', DRV)));
await t('로그인 안 함 → 기사 문서 삭제',                'deny',  () => deleteDoc(doc(out(), 'users', DRV)));

console.log('\n════ 2. 업체 신청 삭제는 종전대로 ════');
await t('마스터 → **미승인** 업체 신청 삭제',            'allow', () => deleteDoc(doc(ctx(MASTER), 'users', PEND)));
await t('마스터 → approved 필드 없는 옛 업체 문서 삭제',  'allow', () => deleteDoc(doc(ctx(MASTER), 'users', OLDDOC)));
await t('마스터 → 탈퇴(미승인) 업체 삭제',               'allow', () => deleteDoc(doc(ctx(MASTER), 'users', WDR)));
await t('마스터 → **승인된** 업체 삭제 (종전 거부)',      'deny',  () => deleteDoc(doc(ctx(MASTER), 'users', OWNER)));
await t('업체 본인 → 자기 문서 삭제 (종전 거부)',         'deny',  () => deleteDoc(doc(ctx(OWNER), 'users', OWNER)));
await t('다른 업체가 미승인 신청 삭제 (거부)',            'deny',  () => deleteDoc(doc(ctx(OWNER), 'users', PEND)));

console.log('\n════ 3. 기사 계정은 removeDriver 길로만 (drivers 명부) ════');
await t('drivers 명부는 클라이언트 쓰기 금지 (서버 전용)', 'deny', () => deleteDoc(doc(ctx(MASTER), 'orgs', REAL, 'drivers', DRV)));
await t('   소유자도 금지',                            'deny',  () => deleteDoc(doc(ctx(OWNER), 'orgs', REAL, 'drivers', DRV)));
await t('   읽기는 소유자·마스터·본인 허용',              'allow', () => getDoc(doc(ctx(OWNER), 'orgs', REAL, 'drivers', DRV)));

console.log('\n════ 4. 회귀 — 기사 권한·목록 ════');
await t('기사 → 운행 자료 읽기',        'allow', () => getDoc(doc(ctx(DRV), 'orgs', REAL, 'data', 'members')));
await t('기사 → 출퇴근 쓰기 (★ v255 부터 거부)', 'deny', () => setDoc(doc(ctx(DRV), 'orgs', REAL, 'data', 'driverAtt'), { v: 1 }));
await t('기사 → 운행 키(rideState) 쓰기', 'allow', () => setDoc(doc(ctx(DRV), 'orgs', REAL, 'data', 'rideState'), { v: 1 }));
await t('기사 → 급여 쓰기 거부',         'deny',  () => setDoc(doc(ctx(DRV), 'orgs', REAL, 'data', 'payrollManual'), { v: 1 }));
await t('마스터 → 가입자 목록 읽기',      'allow', () => getDocs(collection(ctx(MASTER), 'users')));
await t('마스터 → 기사 문서 읽기',        'allow', () => getDoc(doc(ctx(MASTER), 'users', DRV)));
await t('업체 소유자 → 기사 문서 읽기 거부','deny',  () => getDoc(doc(ctx(OWNER), 'users', DRV)));
await t('cosroad_global 마스터만 (보정3)','allow', () => setDoc(doc(ctx(MASTER), 'orgs', 'cosroad_global', 'data', 'aligo'), { v: 1 }));
await t('cosroad_global 업체 거부 (보정3)','deny',  () => getDoc(doc(ctx(OWNER), 'orgs', 'cosroad_global', 'data', 'aligo')));
await t('otp 읽기 거부 (v252)',          'deny',  () => getDoc(doc(ctx(MASTER), 'otp', 'X')));

console.log('\n════ 5. 규칙 원문 ════');
{
  const src = _PINNED_RULES;
  const chk = (label, cond) => { if (cond) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✘ ' + label); } };
  chk('delete 에 세 조건이 모두 있다',
    /allow delete: if isAdmin\(\)\s*\n\s*&& resource\.data\.get\('approved', false\) != true\s*\n\s*&& resource\.data\.get\('role', ''\) != 'driver';/.test(src));
  chk('주석에 removeDriver 로만 정리한다고 적었다', /api\/admin-account\(removeDriver\)로만/.test(src));
  chk('앱에서도 걸러낸다고 적었다 (두 겹)', /orgUsers/.test(src));
  const cp = await import('node:child_process');
  console.log('  규칙 diff (c407fc3 대비): '
    + (cp.execSync('git -C ' + COS_ROOT + ' diff --numstat c407fc3 -- firestore.rules').toString().trim() || '없음'));
  console.log('  규칙 줄 수: ' + (src.split('\n').length - (src.endsWith('\n') ? 1 : 0)));
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
