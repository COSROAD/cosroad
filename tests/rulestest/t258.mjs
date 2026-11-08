/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v258 — 기사 **읽기**에서 attendance·attendanceTime 회수 (12키 → 10키)
   ★ 대조를 먼저: 옛 규칙(4ac625b)으로 「전에는 기사가 출결을 읽었다」를 보인 뒤
     새 규칙으로 「이제 막힌다」를 보인다. */
import fs from 'fs';
import cp from 'node:child_process';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

/* ★ v272: 이 묶음은 **v258 회차 기록**이다.
   규칙과 앱을 그 회차 커밋에 **고정**한다 (v258 = 76224a8).
   전에는 `firestore.rules`·`index.html`(지금 것)을 읽었다. 그래서 v272 가
   기사 읽기에서 `notices` 를 빼고 `org`→`orgDriver` 로 바꾸자 이 묶음이 실패로 떴다 —
   v258 이 틀린 것이 아니고, **지금 자료를 v258 의 기대값으로 재던** 것이 틀렸다.
   **지금** 기사가 무엇을 읽는지는 t272.mjs 가 본다 — 그쪽이 진짜다. */
const PIN_REF = process.env.COS_RULES_REF || '76224a8';
const PIN = (p) => cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN_REF + ':' + p,
  { maxBuffer: 1 << 28 }).toString();
const NEW_RULES = PIN('firestore.rules');
const OLD_RULES = cp.execSync('git -C ' + COS_ROOT + ' show 4ac625b:firestore.rules', { maxBuffer: 1 << 26 }).toString();

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
    for (const k of keys) await setDoc(doc(db, 'orgs', ORG_A, 'data', k), { value: '{}', updatedAt: 1 });
    await setDoc(doc(db, 'orgs', ORG_A, 'backups', 'carlog__1'), { key: 'carlog', value: '{}', backupAt: 1 });
  });
  return env;
}
const ctx = (env, uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const dctx = (env, uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'custom' } }).firestore();

const ATT = ['attendance', 'attendanceTime'];
const READ10 = ['members', 'cars', 'courses', 'org', 'notices', 'rideState',
                'carlog', 'deliveryDone', 'dropoffDone', 'driverAtt'];
const WRITE4 = ['carlog', 'deliveryDone', 'dropoffDone', 'rideState'];
const DENY_READ = ['payments', 'tax', 'payrollManual', 'staff', 'drivelogManual', 'driverPay'];

console.log('════ 0. 대조 (옛 규칙 4ac625b) — 전에는 기사가 출결을 읽었다 ════');
{
  const env = await makeEnv('cos-v258-old', OLD_RULES);
  for (const k of ATT)
    await t('[옛] 기사 → ' + k + ' 읽기', 'allow',
      () => getDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'data', k)));
  for (const k of ATT)
    await t('[옛] 기사 → ' + k + ' 쓰기 (v257 에서 이미 막았다)', 'deny',
      () => setDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'data', k), { value: '{}', updatedAt: 2 }));
  await env.cleanup();
}

const env = await makeEnv('cos-v258', NEW_RULES);

console.log('\n════ 1. 기사 읽기 — 출결은 이제 막힌다 ════');
for (const k of ATT)
  await t('기사 → ' + k + ' 읽기 (★ v258 거부)', 'deny',
    () => getDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'data', k)));
for (const k of READ10)
  await t('기사 → ' + k + ' 읽기 (그대로 허용)', 'allow',
    () => getDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'data', k)));
for (const k of DENY_READ)
  await t('기사 → ' + k + ' 읽기 (종전대로 거부)', 'deny',
    () => getDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'data', k)));

console.log('\n════ 2. 기사 쓰기 — v257 그대로 4키 ════');
for (const k of WRITE4)
  await t('기사 → ' + k + ' 쓰기', 'allow',
    () => setDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'data', k), { value: '{}', updatedAt: 3 }));
for (const k of ATT.concat(['driverAtt', 'driverPay', 'members']))
  await t('기사 → ' + k + ' 쓰기 (거부)', 'deny',
    () => setDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'data', k), { value: '{}', updatedAt: 3 }));

console.log('\n════ 3. 관리자(소유자)는 출결을 그대로 읽고 쓴다 ════');
for (const k of ATT) {
  await t('소유자 → ' + k + ' 읽기', 'allow', () => getDoc(doc(ctx(env, OWNER_A), 'orgs', ORG_A, 'data', k)));
  await t('소유자 → ' + k + ' 쓰기', 'allow',
    () => setDoc(doc(ctx(env, OWNER_A), 'orgs', ORG_A, 'data', k), { value: '{}', updatedAt: 4 }));
}
await t('소유자 → driverPay 읽기 (종전 그대로)', 'allow',
  () => getDoc(doc(ctx(env, OWNER_A), 'orgs', ORG_A, 'data', 'driverPay')));

console.log('\n════ 4. 백업·기관 격리는 그대로 ════');
await t('기사 → carlog 백업 만들기', 'allow',
  () => setDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'backups', 'carlog__9'), { key: 'carlog', value: '{}', backupAt: 9 }));
for (const k of ATT)
  await t('기사 → ' + k + ' 백업 만들기 (v257 그대로 거부)', 'deny',
    () => setDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'backups', k + '__9'), { key: k, value: '{}', backupAt: 9 }));
await t('기사 → 백업 읽기 (v255 그대로 거부)', 'deny',
  () => getDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'backups', 'carlog__1')));
await t('기사 → 백업 목록 (v255 그대로 거부)', 'deny',
  () => getDocs(collection(dctx(env, DRV_A), 'orgs', ORG_A, 'backups')));
await t('기사 → 백업 삭제 (v255 그대로 거부)', 'deny',
  () => deleteDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'backups', 'carlog__1')));
await t('B 업체 기사 → A 업체 members 읽기', 'deny',
  () => getDoc(doc(dctx(env, DRV_B), 'orgs', ORG_A, 'data', 'members')));
await t('A 업체 기사 → 자기 업체 members 읽기 (대조)', 'allow',
  () => getDoc(doc(dctx(env, DRV_A), 'orgs', ORG_A, 'data', 'members')));

console.log('\n════ 5. 규칙 원문 · 앱 목록과 맞추기 ════');
{
  const rm = NEW_RULES.match(/function driverReadableKey\(key\) \{\s*return key in \[([\s\S]*?)\];/);
  chk('driverReadableKey 를 찾았다', !!rm);
  const rk = rm ? rm[1].match(/'([^']+)'/g).map(x => x.replace(/'/g, '')) : [];
  chk('읽기 키가 열 개다 — ' + rk.join(', '), rk.length === 10);
  chk('attendance·attendanceTime 이 없다', ATT.every(k => rk.indexOf(k) < 0));
  chk('열 개가 기대 목록과 같다', rk.slice().sort().join(',') === READ10.slice().sort().join(','));
  chk('driverAtt(기사 출퇴근)는 남아 있다 — 기사 화면이 자기 시각을 보여 준다', rk.indexOf('driverAtt') >= 0);
  const wm = NEW_RULES.match(/function driverWritableKey\(key\) \{\s*return key in \[([\s\S]*?)\];/);
  const wk = wm ? wm[1].match(/'([^']+)'/g).map(x => x.replace(/'/g, '')) : [];
  chk('쓰기 키는 v257 그대로 네 개', wk.slice().sort().join(',') === WRITE4.slice().sort().join(','));
  /* 앱과 글자까지 같은가 */
  const app = PIN('index.html')
    .match(/var DRIVER_READ_KEYS = \[([\s\S]*?)\];/);
  const ak = app ? app[1].match(/'([^']+)'/g).map(x => x.replace(/'/g, '')) : [];
  chk('앱 DRIVER_READ_KEYS 가 규칙과 같다 (' + ak.length + '키)',
    ak.slice().sort().join(',') === rk.slice().sort().join(','));
  /* 옛 규칙과 견주기 */
  const om = OLD_RULES.match(/function driverReadableKey\(key\) \{\s*return key in \[([\s\S]*?)\];/);
  const ok = om ? om[1].match(/'([^']+)'/g).length : 0;
  chk('(대조) 옛 규칙은 12키였다', ok === 12);
  const lines = NEW_RULES.split('\n').length - (NEW_RULES.endsWith('\n') ? 1 : 0);
  console.log('  규칙 줄 수: ' + lines + ' (재게시용) · 옛 판 '
    + (OLD_RULES.split('\n').length - (OLD_RULES.endsWith('\n') ? 1 : 0)) + '줄');
  console.log('  규칙 diff (4ac625b 대비): '
    + (cp.execSync('git -C ' + COS_ROOT + ' diff --numstat 4ac625b -- firestore.rules').toString().trim() || '없음'));
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
