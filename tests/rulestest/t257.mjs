/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v257 — 기사 쓰기에서 attendance·attendanceTime 회수
   ★ 대조를 **먼저** 한다: 옛 규칙(9506d7f)으로 같은 시험을 돌려 「전에는 됐다」를 보인 뒤
     새 규칙으로 「이제 막힌다」를 보인다. 그래야 「거부 0건」이 쓸모가 있다. */
import fs from 'fs';
import cp from 'node:child_process';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

/* ★ v272: 이 묶음은 **v257 회차 기록**이다.
   규칙과 앱을 **커밋에 고정**한다 — `76224a8`(v258).
   전에는 `firestore.rules`·`index.html`(지금 것)을 읽었다. 그래서 v272 가
   기사 읽기에서 `notices` 를 빼고 `org`→`orgDriver` 로 바꾸자 이 묶음이 실패로 떴다 —
   v257 이 틀린 것이 아니고, **지금 자료를 옛 기대값으로 재던** 것이 틀렸다.
   ★ 왜 v257(4ac625b)이 아니라 v258 인가 — 이 묶음의 읽기 쪽 기대값은 v258 때
     **앞으로 고쳐졌다**(「★ v258 거부」·「읽기 키는 v258 에서 10개가 됐다」가 그 증거).
     그래서 이 파일이 적고 있는 참말은 **v258 상태**다. v257 에 맞추면 3건이 틀어진다(실측).
   **지금** 기사가 무엇을 읽는지는 t272.mjs 가 본다 — 그쪽이 진짜다. */
const PIN_REF = process.env.COS_RULES_REF || '76224a8';
const PIN = (p) => cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN_REF + ':' + p,
  { maxBuffer: 1 << 28 }).toString();
const NEW_RULES = PIN('firestore.rules');
const OLD_RULES = cp.execSync('git -C ' + COS_ROOT + ' show 9506d7f:firestore.rules', { maxBuffer: 1 << 26 }).toString();

let pass = 0, fail = 0;
async function t(label, want, fn) {
  try {
    if (want === 'allow') await assertSucceeds(fn());
    else await assertFails(fn());
    pass++; console.log('  ' + (want === 'allow' ? '✔ 허용' : '✔ 거부') + '  ' + label);
  } catch (e) { fail++; console.log('  ' + (want === 'allow' ? '✘ 허용기대→거부' : '✘ 거부기대→허용') + '  ' + label); }
}
const chk = (label, cond) => { if (cond) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✘ ' + label); } };

const MASTER = 'MasterUid00000000000000000001';
const OWNER_A = 'OwnerA000000000000000000002';
const OWNER_B = 'OwnerB000000000000000000003';
const ORG_A = 'academy_' + OWNER_A.slice(0, 12);
const ORG_B = 'academy_' + OWNER_B.slice(0, 12);
const DRV_A = 'drv_' + ORG_A + '_car1';
const DRV_B = 'drv_' + ORG_B + '_car1';

async function makeEnv(projectId, rules) {
  const env = await initializeTestEnvironment({
    projectId, firestore: { host: '127.0.0.1', port: 8988, rules }
  });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'admins', MASTER), { role: 'master' });
    const own = (uid) => ({
      bizType: 'academy', orgName: '업체', orgId: 'academy_' + uid.slice(0, 12), contact: '010-1',
      status: 'active', approved: true, paidUntil: Date.now() + 365 * 86400000, trialEnd: Date.now() + 30 * 86400000, contractMonths: 12, plan: 'trial', trialStart: Date.now(), createdAt: Date.now()
    });
    await setDoc(doc(db, 'users', OWNER_A), own(OWNER_A));
    await setDoc(doc(db, 'users', OWNER_B), own(OWNER_B));
    await setDoc(doc(db, 'users', DRV_A), { role: 'driver', driverOrg: ORG_A, ownerUid: OWNER_A, carId: 'car1' });
    await setDoc(doc(db, 'users', DRV_B), { role: 'driver', driverOrg: ORG_B, ownerUid: OWNER_B, carId: 'car1' });
    await setDoc(doc(db, 'orgs', ORG_A, 'drivers', DRV_A), { carId: 'car1', ownerUid: OWNER_A });
    await setDoc(doc(db, 'orgs', ORG_B, 'drivers', DRV_B), { carId: 'car1', ownerUid: OWNER_B });
    const keys = ['members', 'cars', 'courses', 'org', 'attendance', 'attendanceTime', 'notices',
      'rideState', 'carlog', 'deliveryDone', 'dropoffDone', 'driverAtt',
      'payments', 'tax', 'payrollManual', 'staff', 'drivelogManual', 'driverPay'];
    for (const k of keys) await setDoc(doc(db, 'orgs', ORG_A, 'data', k), { value: '[]', updatedAt: 1 });
    await setDoc(doc(db, 'orgs', ORG_A, 'backups', 'carlog__1'), { key: 'carlog', value: '[]', backupAt: 1 });
  });
  return env;
}
const ctx = (env, uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const dctx = (env, uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'custom' } }).firestore();

const ATT = ['attendance', 'attendanceTime'];
const STILL = ['carlog', 'deliveryDone', 'dropoffDone', 'rideState'];

/* ── 0. 대조 — 옛 규칙에서는 기사가 출결을 **쓸 수 있었다** ── */
console.log('════ 0. 대조 (옛 규칙 9506d7f) — 전에는 기사가 출결을 썼다 ════');
{
  const env = await makeEnv('cos-v257-old', OLD_RULES);
  for (const k of ATT)
    await t('[옛] 기사 → ' + k + ' 쓰기', 'allow',
      () => setDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'data', k), { value: '{}', updatedAt: 2 }));
  await t('[옛] 기사 → attendance 백업 만들기', 'allow',
    () => setDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'backups', 'attendance__9'),
                 { key: 'attendance', value: '{}', backupAt: 9 }));
  await t('[옛] 마스터 → 남의 업체 attendance 쓰기 (전에도 거부였다)', 'deny',
    () => setDoc(doc(ctx(env, MASTER), 'orgs', ORG_A, 'data', 'attendance'), { value: '{}', updatedAt: 2 }));
  await t('[옛] 소유자 → attendance 쓰기 (전에도 허용)', 'allow',
    () => setDoc(doc(ctx(env, OWNER_A), 'orgs', ORG_A, 'data', 'attendance'), { value: '{}', updatedAt: 2 }));
  await env.cleanup();
}

const env = await makeEnv('cos-v257', NEW_RULES);

console.log('\n════ 1. 기사 쓰기 — 출결은 이제 막힌다 ════');
for (const k of ATT)
  await t('기사 → ' + k + ' 쓰기 (★ v257 거부)', 'deny',
    () => setDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'data', k), { value: '{}', updatedAt: 2 }));
for (const k of STILL)
  await t('기사 → ' + k + ' 쓰기 (그대로 허용)', 'allow',
    () => setDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'data', k), { value: '{}', updatedAt: 2 }));
for (const k of ['driverAtt', 'driverPay', 'members', 'payments', 'tax', 'staff'])
  await t('기사 → ' + k + ' 쓰기 (종전대로 거부)', 'deny',
    () => setDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'data', k), { value: '{}', updatedAt: 2 }));

console.log('\n════ 2. 기사 읽기 — 이번 회차는 그대로 12키 ════');
/* v258: 읽기에서도 attendance·attendanceTime 을 뺐다 (12키 → 10키) — 일부러 바꾼 자리다.
     이번 회차 표는 t258.mjs */
for (const k of ['members', 'cars', 'courses', 'org', 'notices',
                 'rideState', 'carlog', 'deliveryDone', 'dropoffDone', 'driverAtt'])
  await t('기사 → ' + k + ' 읽기', 'allow', () => getDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'data', k)));
for (const k of ['attendance', 'attendanceTime'])
  await t('기사 → ' + k + ' 읽기 (★ v258 거부)', 'deny', () => getDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'data', k)));
for (const k of ['payments', 'tax', 'payrollManual', 'staff', 'drivelogManual', 'driverPay'])
  await t('기사 → ' + k + ' 읽기 (거부)', 'deny', () => getDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'data', k)));

console.log('\n════ 3. 관리자(소유자)·마스터의 출결 쓰기는 그대로 ════');
for (const k of ATT) {
  await t('소유자 → ' + k + ' 쓰기 (직원 근태·수기 토글)', 'allow',
    () => setDoc(doc(ctx(env, OWNER_A), 'orgs', ORG_A, 'data', k), { value: '{}', updatedAt: 3 }));
  await t('소유자 → ' + k + ' 읽기', 'allow',
    () => getDoc(doc(ctx(env, OWNER_A), 'orgs', ORG_A, 'data', k)));
}
/* 마스터는 **남의 업체 자료를 쓰지 못한다** — 기관 격리(isMyOrg)가 그렇게 되어 있다.
   v257 이 바꾼 것이 아니라 종전 그대로다(아래 대조). 출결을 고치는 것은 그 업체 관리자다. */
await t('마스터 → 남의 업체 attendance 쓰기 (기관 격리 — 종전 그대로 거부)', 'deny',
  () => setDoc(doc(ctx(env, MASTER), 'orgs', ORG_A, 'data', 'attendance'), { value: '{}', updatedAt: 3 }));

console.log('\n════ 4. 백업 create 가 쓰기 목록을 따라간다 ════');
for (const k of ATT)
  await t('기사 → ' + k + ' 백업 만들기 (★ v257 거부)', 'deny',
    () => setDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'backups', k + '__9'),
                 { key: k, value: '{}', backupAt: 9 }));
await t('기사 → carlog 백업 만들기 (그대로 허용)', 'allow',
  () => setDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'backups', 'carlog__9'),
               { key: 'carlog', value: '{}', backupAt: 9 }));
await t('기사 → rideState 백업 만들기 (그대로 허용)', 'allow',
  () => setDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'backups', 'rideState__9'),
               { key: 'rideState', value: '{}', backupAt: 9 }));
await t('기사 → 백업 읽기 (v255 그대로 거부)', 'deny',
  () => getDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'backups', 'carlog__1')));
await t('기사 → 백업 목록 (v255 그대로 거부)', 'deny',
  () => getDocs(collection(dctx(env, DRV_A), 'orgs', ORG_A, 'backups')));
await t('기사 → 백업 삭제 (v255 그대로 거부)', 'deny',
  () => deleteDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'backups', 'carlog__1')));
await t('소유자 → attendance 백업 만들기 (대조)', 'allow',
  () => setDoc(doc(ctx(env, OWNER_A), 'orgs', ORG_A, 'backups', 'attendance__8'),
               { key: 'attendance', value: '{}', backupAt: 8 }));

console.log('\n════ 5. 기관 격리는 그대로 ════');
await t('B 업체 기사 → A 업체 carlog 쓰기', 'deny',
  () => setDoc(doc(dctx(env, DRV_B), 'orgs', ORG_A, 'data', 'carlog'), { value: '{}', updatedAt: 4 }));
await t('B 업체 기사 → A 업체 attendance 읽기', 'deny',
  () => getDoc(doc(dctx(env, DRV_B), 'orgs', ORG_A, 'data', 'attendance')));

console.log('\n════ 6. 규칙 원문 ════');
{
  const m = NEW_RULES.match(/function driverWritableKey\(key\) \{\s*return key in \[([\s\S]*?)\];/);
  chk('driverWritableKey 를 찾았다', !!m);
  const keys = m ? m[1].match(/'([^']+)'/g).map(x => x.replace(/'/g, '')) : [];
  chk('쓰기 키가 네 개다 — ' + keys.join(', '), keys.length === 4);
  chk('attendance·attendanceTime 이 없다', keys.indexOf('attendance') < 0 && keys.indexOf('attendanceTime') < 0);
  chk('carlog·deliveryDone·dropoffDone·rideState 는 있다',
    ['carlog', 'deliveryDone', 'dropoffDone', 'rideState'].every(k => keys.indexOf(k) >= 0));
  const rm = NEW_RULES.match(/function driverReadableKey\(key\) \{\s*return key in \[([\s\S]*?)\];/);
  chk('읽기 키는 v258 에서 10개가 됐다', rm && rm[1].match(/'([^']+)'/g).length === 10);
  const bm = NEW_RULES.match(/match \/orgs\/\{orgId\}\/backups\/\{backupId\} \{([\s\S]*?)\n    \}/);
  chk('백업 create 가 driverWritableKey 를 본다',
    bm && /allow create:[\s\S]*?driverWritableKey\(request\.resource\.data\.key\)/.test(bm[1]));
  /* 앱 목록과 같은가 */
  const app = PIN('index.html')
    .match(/var DRIVER_WRITE_KEYS = \[([^\]]+)\]/);
  chk('앱 DRIVER_WRITE_KEYS 가 규칙과 같다',
    app && app[1].replace(/['\s]/g, '').split(',').sort().join(',') === keys.slice().sort().join(','));
  const lines = NEW_RULES.split('\n').length - (NEW_RULES.endsWith('\n') ? 1 : 0);
  console.log('  규칙 줄 수: ' + lines + ' (재게시용) · 옛 판 '
    + (OLD_RULES.split('\n').length - (OLD_RULES.endsWith('\n') ? 1 : 0)) + '줄');
  console.log('  규칙 diff (9506d7f 대비): '
    + (cp.execSync('git -C ' + COS_ROOT + ' diff --numstat 9506d7f -- firestore.rules').toString().trim() || '없음'));
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
