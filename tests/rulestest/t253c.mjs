/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v253 보정3 — orgs/cosroad_global/data/{key} 를 isAdmin() 으로 닫았다 */
import fs from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
/* ★ v274: 규칙을 **이 회차 커밋에 고정**한다 — v253 보정3(`c407fc3`).
   전에는 이 폴더의 사본(= **지금** 규칙)을 읽었다. 그래서 뒤 회차가 규칙을 고치면
   이 회차의 기대값이 거짓으로 깨졌다 — v274 가 기사 읽기 키를 9→6 으로 줄이고
   `carData` 블록을 더하자 한꺼번에 터졌다. v253 보정3 가 틀린 것이 아니다.
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
  projectId: 'cos-v253c',
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
const OWNER  = 'OwnerOk00000000000000000002';
const TA_OK  = 'TaOk00000000000000000000003';   // 테스트 출입 켠 승인 계정
const DRIVER = 'DriverOk000000000000000004';
const REAL = 'academy_' + OWNER.slice(0, 12);
const TEST = 'freezone_test';
const G = 'cosroad_global';

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'admins', MASTER), { role: 'master' });
  const own = (uid, extra) => Object.assign({
    bizType: 'academy', orgName: '업체', orgId: 'academy_' + uid.slice(0, 12), contact: '010-1',
    status: 'active', approved: true, paidUntil: Date.now() + 365 * 86400000, trialEnd: Date.now() + 30 * 86400000, contractMonths: 12, plan: 'trial', trialStart: Date.now(), createdAt: Date.now()
  }, extra || {});
  await setDoc(doc(db, 'users', OWNER), own(OWNER));
  await setDoc(doc(db, 'users', TA_OK), own(TA_OK, { testAccess: true }));
  await setDoc(doc(db, 'users', DRIVER), { role: 'driver', driverOrg: REAL, ownerUid: OWNER, carId: 'c1' });
  await setDoc(doc(db, 'orgs', REAL, 'drivers', DRIVER), { carId: 'c1', ownerUid: OWNER });
  await setDoc(doc(db, 'orgs', REAL, 'data', 'members'), { v: 1 });
  await setDoc(doc(db, 'orgs', TEST, 'data', 'members'), { v: 1 });
  /* 옛 판이 남겼을 수 있는 문서 (사장님 콘솔에는 없지만 있다고 쳐서 읽기도 재어 본다) */
  await setDoc(doc(db, 'orgs', G, 'data', 'aligo'), { note: 'old' });
});

console.log('════ 1. orgs/cosroad_global — 마스터만 ════');
await t('마스터 → 읽기',         'allow', () => getDoc(doc(ctx(MASTER), 'orgs', G, 'data', 'aligo')));
await t('마스터 → 쓰기',         'allow', () => setDoc(doc(ctx(MASTER), 'orgs', G, 'data', 'aligo'), { note: 'new' }));
await t('마스터 → 지우기',       'allow', () => deleteDoc(doc(ctx(MASTER), 'orgs', G, 'data', 'aligo')));
await t('★ 업체 소유자 → 읽기',  'deny',  () => getDoc(doc(ctx(OWNER), 'orgs', G, 'data', 'aligo')));
await t('★ 업체 소유자 → 쓰기',  'deny',  () => setDoc(doc(ctx(OWNER), 'orgs', G, 'data', 'aligo'), { note: 'x' }));
await t('★ 기사 → 읽기',        'deny',  () => getDoc(doc(ctx(DRIVER), 'orgs', G, 'data', 'aligo')));
await t('★ 기사 → 쓰기',        'deny',  () => setDoc(doc(ctx(DRIVER), 'orgs', G, 'data', 'aligo'), { note: 'x' }));
await t('★ 테스트 출입 계정 → 읽기','deny',() => getDoc(doc(ctx(TA_OK), 'orgs', G, 'data', 'aligo')));
await t('★ 테스트 출입 계정 → 쓰기','deny',() => setDoc(doc(ctx(TA_OK), 'orgs', G, 'data', 'aligo'), { note: 'x' }));
await t('익명 → 읽기',           'deny',  () => getDoc(doc(anon('A1'), 'orgs', G, 'data', 'aligo')));
await t('익명 → 쓰기',           'deny',  () => setDoc(doc(anon('A1'), 'orgs', G, 'data', 'aligo'), { note: 'x' }));
await t('로그인 안 함 → 읽기',    'deny',  () => getDoc(doc(out(), 'orgs', G, 'data', 'aligo')));
await t('아무 관계 없는 계정 → 읽기','deny',() => getDoc(doc(ctx('Str000000000000000009'), 'orgs', G, 'data', 'aligo')));
await t('다른 key 도 같다 (마스터 허용)','allow',() => setDoc(doc(ctx(MASTER), 'orgs', G, 'data', 'other'), { v: 1 }));
await t('다른 key — 업체 소유자 거부','deny',() => setDoc(doc(ctx(OWNER), 'orgs', G, 'data', 'other'), { v: 1 }));
await t('cosroad_global 목록 훑기 (마스터)','allow',() => getDocs(collection(ctx(MASTER), 'orgs', G, 'data')));
await t('cosroad_global 목록 훑기 (업체)','deny',() => getDocs(collection(ctx(OWNER), 'orgs', G, 'data')));

console.log('\n════ 2. 다른 기관 경로는 그대로인가 (회귀) ════');
await t('소유자 → 자기 업체 읽기',   'allow', () => getDoc(doc(ctx(OWNER), 'orgs', REAL, 'data', 'members')));
await t('소유자 → 자기 업체 쓰기',   'allow', () => setDoc(doc(ctx(OWNER), 'orgs', REAL, 'data', 'members'), { v: 2 }));
await t('기사 → 운행 읽기',         'allow', () => getDoc(doc(ctx(DRIVER), 'orgs', REAL, 'data', 'members')));
await t('기사 → 출퇴근 쓰기 (★ v255 부터 거부)', 'deny', () => setDoc(doc(ctx(DRIVER), 'orgs', REAL, 'data', 'driverAtt'), { v: 1 }));
await t('기사 → 운행 키(rideState) 쓰기', 'allow', () => setDoc(doc(ctx(DRIVER), 'orgs', REAL, 'data', 'rideState'), { v: 1 }));
await t('기사 → 급여 쓰기 거부',     'deny',  () => setDoc(doc(ctx(DRIVER), 'orgs', REAL, 'data', 'payrollManual'), { v: 1 }));
await t('테스트 출입 계정 → _test 읽기','allow',() => getDoc(doc(ctx(TA_OK), 'orgs', TEST, 'data', 'members')));
await t('업체 소유자 → _test 읽기 거부','deny', () => getDoc(doc(ctx(OWNER), 'orgs', TEST, 'data', 'members')));
await t('마스터 → _test 읽기',       'allow', () => getDoc(doc(ctx(MASTER), 'orgs', TEST, 'data', 'members')));
await t('승인 대기자도 billing 읽기', 'allow', () => getDoc(doc(anon('A2'), 'orgs', '_master', 'data', 'billing')));
await t('익명이 billing 쓰기 거부',   'deny',  () => setDoc(doc(anon('A2'), 'orgs', '_master', 'data', 'billing'), { bank: 'x' }));
await t('otp 읽기 거부 (마스터도)',   'deny',  () => getDoc(doc(ctx(MASTER), 'otp', 'X')));

console.log('\n════ 3. 규칙 파일 원문 ════');
{
  const src = _PINNED_RULES;
  const chk = (label, cond) => { if (cond) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✘ ' + label); } };
  chk('cosroad_global 이 isAdmin() 으로 닫혔다',
    src.indexOf('match /orgs/cosroad_global/data/{key} {\n      allow read, write: if isAdmin();\n    }') >= 0);
  chk('signedIn() 으로 열린 자리가 남아 있지 않다',
    src.indexOf('allow read, write: if signedIn();') < 0);
  chk('주석이 「앱 사용 0건」 근거를 적었다',
    /앱이 이 자리를 쓰는 호출이 \*\*0건\*\*/.test(src));
  chk('맨 아래 메모도 고쳤다 (「그대로 둔다」 문구 사라짐)',
    src.indexOf('orgs/cosroad_global(알리고 공통 설정)은 업체 관리자도 쓰므로 그대로 둔다') < 0);
  const cp = await import('node:child_process');
  console.log('  규칙 diff (318e25b 대비): '
    + (cp.execSync('git -C ' + COS_ROOT + ' diff --numstat 318e25b -- firestore.rules').toString().trim() || '없음'));
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
