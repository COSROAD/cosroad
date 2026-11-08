/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v263 — 이용 기간 판정(paidUntil 하나) + 소유자 쓰기 구멍 막기 + billingLog
   ★ 대조를 먼저: 옛 규칙(20046e2, 501줄)으로 「전에는 미입금·만료 업체도 읽고 썼다」를
     보인 뒤, 새 규칙으로 「이제 막힌다」를 보인다. */
import fs from 'fs';
import cp from 'node:child_process';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, addDoc } from 'firebase/firestore';
/* ★ v274: 규칙을 **이 회차 커밋에 고정**한다 — v263(`269231d`).
   전에는 이 폴더의 사본(= **지금** 규칙)을 읽었다. 그래서 뒤 회차가 규칙을 고치면
   이 회차의 기대값이 거짓으로 깨졌다 — v274 가 기사 읽기 키를 9→6 으로 줄이고
   `carData` 블록을 더하자 한꺼번에 터졌다. v263 가 틀린 것이 아니다.
   **지금** 규칙은 t274.mjs 가 본다 — 그쪽이 진짜다. */
const _RULES_REF = process.env.COS_RULES_REF || '269231d';
const _PINNED_RULES = (await import('child_process')).execSync(
  'git -C ' + COS_ROOT + ' show ' + _RULES_REF + ':firestore.rules',
  { maxBuffer: 1 << 26 }).toString()
  .split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));


const NEW_RULES = _PINNED_RULES;
const OLD_RULES = cp.execSync('git -C ' + COS_ROOT + ' show 20046e2:firestore.rules', { maxBuffer: 1 << 26 }).toString();

let pass = 0, fail = 0;
async function t(label, want, fn) {
  try {
    if (want === 'allow') await assertSucceeds(fn());
    else await assertFails(fn());
    pass++; console.log('  ' + (want === 'allow' ? '✔ 허용' : '✔ 거부') + '  ' + label);
  } catch (e) { fail++; console.log('  ' + (want === 'allow' ? '✘ 허용기대→거부' : '✘ 거부기대→허용') + '  ' + label); }
}
const chk = (label, cond) => { if (cond) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✘ ' + label); } };

const DAY = 86400000;
const MASTER  = 'MasterUid00000000000000000001';
const LIVE    = 'LiveOwner000000000000000002';   // 활성 (기간 남음)
const EXPIRED = 'ExpOwner0000000000000000003';   // 만료 (기간 지남)
const PENDING = 'PendOwner000000000000000004';   // 미입금 (승인 전)
const GONE    = 'GoneOwner000000000000000005';   // 탈퇴
const NOPER   = 'NoPerOwner00000000000000006';   // 승인됐는데 paidUntil 이 없음(옛 계정 꼴)
const ORG = (u) => 'academy_' + u.slice(0, 12);

const ORG_LIVE = ORG(LIVE), ORG_EXP = ORG(EXPIRED), ORG_PEND = ORG(PENDING), ORG_GONE = ORG(GONE), ORG_NOPER = ORG(NOPER);
const DRV_LIVE = 'drv_' + ORG_LIVE + '_car1';
const DRV_EXP  = 'drv_' + ORG_EXP  + '_car1';

const now = Date.now();
function owner(uid, over) {
  return Object.assign({
    bizType: 'academy', orgName: '업체', orgId: ORG(uid), phone: '01012345678', contact: '01012345678',
    signupMethod: 'phone', status: 'active', approved: true, plan: 'paid',
    paidAt: now - 10 * DAY, trialEnd: now + 20 * DAY, paidUntil: now + 100 * DAY,
    contractMonths: 6, createdAt: now - 30 * DAY
  }, over || {});
}

async function makeEnv(projectId, rules) {
  const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8988, rules } });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'admins', MASTER), { role: 'master' });
    await setDoc(doc(db, 'users', LIVE),    owner(LIVE));
    await setDoc(doc(db, 'users', EXPIRED), owner(EXPIRED, { paidUntil: now - 1 * DAY, plan: 'expired' }));
    await setDoc(doc(db, 'users', PENDING), owner(PENDING, { approved: false, status: 'pending', plan: 'pending',
                                                             paidUntil: null, trialEnd: null, paidAt: null }));
    await setDoc(doc(db, 'users', GONE),    owner(GONE, { withdrawn: true }));
    await setDoc(doc(db, 'users', NOPER),   owner(NOPER, { paidUntil: null, trialEnd: null, plan: 'paid' }));
    await setDoc(doc(db, 'users', DRV_LIVE), { role: 'driver', driverOrg: ORG_LIVE, ownerUid: LIVE, carId: 'car1' });
    await setDoc(doc(db, 'users', DRV_EXP),  { role: 'driver', driverOrg: ORG_EXP,  ownerUid: EXPIRED, carId: 'car1' });
    await setDoc(doc(db, 'orgs', ORG_LIVE, 'drivers', DRV_LIVE), { carId: 'car1', ownerUid: LIVE });
    await setDoc(doc(db, 'orgs', ORG_EXP,  'drivers', DRV_EXP),  { carId: 'car1', ownerUid: EXPIRED });
    for (const o of [ORG_LIVE, ORG_EXP, ORG_PEND, ORG_GONE, ORG_NOPER]) {
      for (const k of ['members', 'cars', 'carlog', 'payments']) {
        await setDoc(doc(db, 'orgs', o, 'data', k), { value: '{}', updatedAt: 1 });
      }
      await setDoc(doc(db, 'orgs', o, 'backups', 'members__1'), { key: 'members', value: '{}', backupAt: 1 });
    }
    await setDoc(doc(db, 'billingLog', LIVE, 'items', 'i1'), { type: 'approve', amount: 180000, at: now });
  });
  return env;
}
const ctx  = (env, uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const dctx = (env, uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'custom' } }).firestore();

/* ★ expiresAt 은 **Date**(Timestamp)여야 한다 — 규칙이 `> request.time` 으로 견준다.
   숫자로 넣으면 형이 안 맞아 **무조건 거부**된다(처음에 숫자로 넣어 대조가 헛돌았다).
   앱도 `new Date(...)` 로 넣는다(index.html 11664). */
const share = (uid, org) => ({
  v: 1, kind: 'notice', org: org, date: '2026-11-03', content: '시험', images: [],
  createdAt: now, expiresAt: new Date(now + 10 * DAY), ownerUid: uid
});

/* ════════ 0. 대조 — 옛 규칙(20046e2)에서는 어땠나 ════════ */
console.log('════ 0. 대조 (옛 규칙 20046e2) ════');
{
  const env = await makeEnv('cos-v263-old', OLD_RULES);
  await t('[옛] 미입금 소유자 → 자기 자료 읽기 (뚫려 있었다)', 'allow',
    () => getDoc(doc(ctx(env, PENDING), 'orgs', ORG_PEND, 'data', 'members')));
  await t('[옛] 미입금 소유자 → 자기 자료 쓰기 (뚫려 있었다)', 'allow',
    () => setDoc(doc(ctx(env, PENDING), 'orgs', ORG_PEND, 'data', 'members'), { value: '{}', updatedAt: 2 }));
  await t('[옛] 만료 소유자 → 쓰기 (뚫려 있었다)', 'allow',
    () => setDoc(doc(ctx(env, EXPIRED), 'orgs', ORG_EXP, 'data', 'members'), { value: '{}', updatedAt: 2 }));
  await t('[옛] 탈퇴 소유자 → 쓰기 (뚫려 있었다)', 'allow',
    () => setDoc(doc(ctx(env, GONE), 'orgs', ORG_GONE, 'data', 'members'), { value: '{}', updatedAt: 2 }));
  await t('[옛] 만료 소유자 → 공유 링크 발급 (뚫려 있었다)', 'allow',
    () => setDoc(doc(ctx(env, EXPIRED), 'shares', 'oldtok1'), share(EXPIRED, ORG_EXP)));
  await t('[옛] 마스터가 화면에서 approved 쓰기 (열려 있었다)', 'allow',
    () => updateDoc(doc(ctx(env, MASTER), 'users', PENDING), { approved: true, status: 'active', plan: 'trial', trialStart: now }));
  await t('[옛] paidUntil 없는 승인 계정 → 기사가 읽기 (무기한으로 열렸다)', 'allow',
    () => getDoc(doc(dctx(env, DRV_LIVE), 'orgs', ORG_LIVE, 'data', 'members')));
  await env.cleanup();
}

const env = await makeEnv('cos-v263', NEW_RULES);

/* ════════ 1. 소유자 — 읽기/쓰기가 갈린다 ════════ */
console.log('\n════ 1. 소유자 (★ v263) ════');
await t('활성 소유자 → 읽기', 'allow',  () => getDoc(doc(ctx(env, LIVE), 'orgs', ORG_LIVE, 'data', 'members')));
await t('활성 소유자 → 쓰기', 'allow',  () => setDoc(doc(ctx(env, LIVE), 'orgs', ORG_LIVE, 'data', 'members'), { value: '{}', updatedAt: 3 }));
await t('★ 만료 소유자 → 읽기 (보기만 — 허용)', 'allow',
  () => getDoc(doc(ctx(env, EXPIRED), 'orgs', ORG_EXP, 'data', 'members')));
await t('★ 만료 소유자 → 쓰기 (거부)', 'deny',
  () => setDoc(doc(ctx(env, EXPIRED), 'orgs', ORG_EXP, 'data', 'members'), { value: '{}', updatedAt: 3 }));
await t('★ 미입금 소유자 → 읽기 (거부)', 'deny',
  () => getDoc(doc(ctx(env, PENDING), 'orgs', ORG_PEND, 'data', 'members')));
await t('★ 미입금 소유자 → 쓰기 (거부)', 'deny',
  () => setDoc(doc(ctx(env, PENDING), 'orgs', ORG_PEND, 'data', 'members'), { value: '{}', updatedAt: 3 }));
await t('★ 탈퇴 소유자 → 읽기 (거부)', 'deny',
  () => getDoc(doc(ctx(env, GONE), 'orgs', ORG_GONE, 'data', 'members')));
await t('★ 탈퇴 소유자 → 쓰기 (거부)', 'deny',
  () => setDoc(doc(ctx(env, GONE), 'orgs', ORG_GONE, 'data', 'members'), { value: '{}', updatedAt: 3 }));
await t('★ paidUntil 없는 승인 계정 → 읽기 (허용 — 승인은 됐다)', 'allow',
  () => getDoc(doc(ctx(env, NOPER), 'orgs', ORG_NOPER, 'data', 'members')));
await t('★ paidUntil 없는 승인 계정 → 쓰기 (거부 — 기간 없음)', 'deny',
  () => setDoc(doc(ctx(env, NOPER), 'orgs', ORG_NOPER, 'data', 'members'), { value: '{}', updatedAt: 3 }));

console.log('\n════ 2. 백업 ════');
await t('활성 → 백업 읽기', 'allow',  () => getDoc(doc(ctx(env, LIVE), 'orgs', ORG_LIVE, 'backups', 'members__1')));
await t('만료 → 백업 읽기 (보기만 — 허용)', 'allow',
  () => getDoc(doc(ctx(env, EXPIRED), 'orgs', ORG_EXP, 'backups', 'members__1')));
await t('활성 → 백업 만들기', 'allow',
  () => setDoc(doc(ctx(env, LIVE), 'orgs', ORG_LIVE, 'backups', 'members__9'), { key: 'members', value: '{}', backupAt: 9 }));
await t('만료 → 백업 만들기 (거부)', 'deny',
  () => setDoc(doc(ctx(env, EXPIRED), 'orgs', ORG_EXP, 'backups', 'members__9'), { key: 'members', value: '{}', backupAt: 9 }));
await t('만료 → 백업 지우기 (거부)', 'deny',
  () => deleteDoc(doc(ctx(env, EXPIRED), 'orgs', ORG_EXP, 'backups', 'members__1')));
await t('미입금 → 백업 읽기 (거부)', 'deny',
  () => getDoc(doc(ctx(env, PENDING), 'orgs', ORG_PEND, 'backups', 'members__1')));

console.log('\n════ 3. 기사 — 업체가 살아 있을 때만 ════');
await t('활성 업체 기사 → 읽기', 'allow',  () => getDoc(doc(dctx(env, DRV_LIVE), 'orgs', ORG_LIVE, 'data', 'members')));
await t('활성 업체 기사 → 쓰기(carlog)', 'allow',
  () => setDoc(doc(dctx(env, DRV_LIVE), 'orgs', ORG_LIVE, 'data', 'carlog'), { value: '{}', updatedAt: 4 }));
await t('★ 만료 업체 기사 → 읽기 (거부)', 'deny',
  () => getDoc(doc(dctx(env, DRV_EXP), 'orgs', ORG_EXP, 'data', 'members')));
await t('★ 만료 업체 기사 → 쓰기 (거부)', 'deny',
  () => setDoc(doc(dctx(env, DRV_EXP), 'orgs', ORG_EXP, 'data', 'carlog'), { value: '{}', updatedAt: 4 }));

console.log('\n════ 4. 공유 링크 ════');
await t('활성 → 공유 만들기', 'allow',
  () => setDoc(doc(ctx(env, LIVE), 'shares', 'tokLive1'), share(LIVE, ORG_LIVE)));
await t('★ 만료 → 공유 만들기 (거부)', 'deny',
  () => setDoc(doc(ctx(env, EXPIRED), 'shares', 'tokExp1'), share(EXPIRED, ORG_EXP)));
await t('★ 미입금 → 공유 만들기 (거부)', 'deny',
  () => setDoc(doc(ctx(env, PENDING), 'shares', 'tokPend1'), share(PENDING, ORG_PEND)));
await t('이미 나간 링크 읽기는 그대로', 'allow',
  () => getDoc(doc(env.unauthenticatedContext().firestore(), 'shares', 'tokLive1')));

console.log('\n════ 5. users — 본인·마스터가 기간을 못 쓴다 ════');
for (const k of ['paidUntil', 'trialEnd', 'contractMonths', 'paidAt'])
  await t('본인 → ' + k + ' 고치기 (거부)', 'deny',
    () => updateDoc(doc(ctx(env, LIVE), 'users', LIVE), { [k]: now + 9999 * DAY }));
await t('본인 → orgName 고치기 (그대로 허용)', 'allow',
  () => updateDoc(doc(ctx(env, LIVE), 'users', LIVE), { orgName: '새 이름' }));
await t('★ 마스터가 화면에서 approved 쓰기 (이제 거부 — 서버만)', 'deny',
  () => updateDoc(doc(ctx(env, MASTER), 'users', PENDING), { approved: true, status: 'active' }));
await t('★ 마스터가 화면에서 paidUntil 쓰기 (거부)', 'deny',
  () => updateDoc(doc(ctx(env, MASTER), 'users', LIVE), { paidUntil: now + 9999 * DAY }));
await t('마스터 → testAccess 켜기 (이것만 허용)', 'allow',
  () => updateDoc(doc(ctx(env, MASTER), 'users', LIVE), { testAccess: true }));
await t('마스터 → 미승인 계정 삭제 (그대로)', 'allow',
  () => deleteDoc(doc(ctx(env, MASTER), 'users', PENDING)));

console.log('\n════ 6. billingLog — 마스터 읽기만 ════');
await t('마스터 → 기록 읽기', 'allow',
  () => getDocs(collection(ctx(env, MASTER), 'billingLog', LIVE, 'items')));
await t('업체 본인 → 자기 기록 읽기 (거부)', 'deny',
  () => getDocs(collection(ctx(env, LIVE), 'billingLog', LIVE, 'items')));
await t('마스터 → 기록 쓰기 (거부 — 서버만)', 'deny',
  () => addDoc(collection(ctx(env, MASTER), 'billingLog', LIVE, 'items'), { type: 'approve', amount: 1 }));
await t('업체 → 기록 쓰기 (거부)', 'deny',
  () => addDoc(collection(ctx(env, LIVE), 'billingLog', LIVE, 'items'), { type: 'approve', amount: 1 }));
await t('★ Admin SDK(서버)는 그대로 쓴다', 'allow',
  () => env.withSecurityRulesDisabled(async (c) =>
    addDoc(collection(c.firestore(), 'billingLog', LIVE, 'items'), { type: 'extend', amount: 180000, at: now })));

console.log('\n════ 7. _demo · _test 는 그대로 ════');
{
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'orgs', 'academy_demo', 'data', 'members'), { value: '{}', updatedAt: 1 });
  });
  await t('누구나 _demo 읽기', 'allow',
    () => getDoc(doc(ctx(env, EXPIRED), 'orgs', 'academy_demo', 'data', 'members')));
  await t('_demo 쓰기는 그대로 거부', 'deny',
    () => setDoc(doc(ctx(env, LIVE), 'orgs', 'academy_demo', 'data', 'members'), { value: '{}', updatedAt: 2 }));
}

console.log('\n════ 8. 규칙 원문 ════');
{
  chk('판정 한 줄 — userPaidNow 가 paidUntil 만 본다',
    /function userPaidNow\(uid\) \{[\s\S]*?get\('paidUntil', 0\) > request\.time\.toMillis\(\)/.test(NEW_RULES));
  chk('isMyOrgReadable = isMyOrg && 승인·탈퇴 아님',
    /function isMyOrgReadable\(orgId\) \{\s*return isMyOrg\(orgId\) && userApprovedAlive\(request\.auth\.uid\);/.test(NEW_RULES));
  chk('isMyOrgActive = Readable + 기간',
    /function isMyOrgActive\(orgId\) \{\s*return isMyOrgReadable\(orgId\) && userPaidNow\(request\.auth\.uid\);/.test(NEW_RULES));
  chk('ownerAlive 도 같은 한 줄',
    /function ownerAlive\(ownerUid\) \{[\s\S]*?userApprovedAlive\(ownerUid\)[\s\S]*?userPaidNow\(ownerUid\)/.test(NEW_RULES));
  /* 함수 선언 두 덩어리를 뺀 나머지에서 센다
     (Readable 은 자기 선언 + Active 안에서도 불려 그냥 세면 5가 된다) */
  const allowBlock = NEW_RULES.replace(/function isMyOrg(Readable|Active)\(orgId\) \{[\s\S]*?\}/g, '');
  chk('읽기 3자리가 Readable (' + (allowBlock.match(/isMyOrgReadable\(orgId\)/g) || []).length + ')',
    (allowBlock.match(/isMyOrgReadable\(orgId\)/g) || []).length === 3);
  chk('쓰기 3자리가 Active (' + (allowBlock.match(/isMyOrgActive\(orgId\)/g) || []).length + ')',
    (allowBlock.match(/isMyOrgActive\(orgId\)/g) || []).length === 3);
  chk('옛 규칙에는 isMyOrg 가 6자리였다 (대조)',
    (OLD_RULES.match(/isMyOrg\(orgId\) \|\||\(isMyOrg\(orgId\)/g) || []).length === 6);
  const m = NEW_RULES.match(/\.hasAny\(\['approved'[\s\S]*?\]\)\)/);
  const keys = m ? (m[0].match(/'([^']+)'/g) || []).map(x => x.replace(/'/g, '')) : [];
  chk('본인 보호 목록 21개 (' + keys.length + ')', keys.length === 21);
  ['paidUntil', 'trialEnd', 'contractMonths', 'paidAt'].forEach(k => chk('  보호 목록에 ' + k, keys.indexOf(k) >= 0));
  chk('마스터 분기는 testAccess 하나', /hasOnly\(\['testAccess'\]\)/.test(NEW_RULES));
  chk('(대조) 옛 규칙 마스터 분기는 5개였다',
    /hasOnly\(\['approved','status','plan','trialStart','testAccess'\]\)/.test(OLD_RULES));
  chk('billingLog 블록', /match \/billingLog\/\{uid\}\/items\/\{itemId\} \{\s*allow read:  if isAdmin\(\);\s*allow write: if false;/.test(NEW_RULES));
  chk('plan 글자로 판정하는 자리가 없다', !/data\.get\('plan', ''\) == 'paid'/.test(NEW_RULES));
  chk('(대조) 옛 규칙에는 있었다', /data\.get\('plan', ''\) == 'paid'/.test(OLD_RULES));
  chk('trialStart 로 판정하는 자리가 없다', !/trialStart \+ 2592000000/.test(NEW_RULES));
  const lines = NEW_RULES.split('\n').length - (NEW_RULES.endsWith('\n') ? 1 : 0);
  console.log('  규칙 줄 수: ' + lines + ' (재게시용) · 옛 판 '
    + (OLD_RULES.split('\n').length - (OLD_RULES.endsWith('\n') ? 1 : 0)) + '줄');
  /* get 호출 수 — ownerAlive 안의 get(users/소유자) 횟수 */
  const oa = (s) => { const m2 = /function ownerAlive\(ownerUid\) \{[\s\S]*?\n    \}/.exec(s); return m2 ? (m2[0].match(/get\(\/databases/g) || []).length : -1; };
  console.log('  ownerAlive 안의 get 호출: 옛 ' + oa(OLD_RULES) + '회 → 새 ' + oa(NEW_RULES) + '회'
    + '  (userApprovedAlive 2 + userPaidNow 1 로 펼쳐진다)');
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
