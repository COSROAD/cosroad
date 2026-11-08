/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v255 — 기사 읽기 12키 제한 · driverAtt 쓰기 제거 · 백업 읽기/삭제 제거 · 서버 전용 5컬렉션
   ★ v272: 규칙을 **커밋에 고정**한다 — `76224a8`(v258).
     전에는 `firestore.rules`(지금 규칙)를 읽었다. 그래서 v272 가 기사 읽기에서
     `notices` 를 빼고 `org`→`orgDriver` 로 바꾸자 이 묶음이 실패로 떴다 —
     v255 가 틀린 것이 아니고, **지금 자료를 옛 기대값으로 재던** 것이 틀렸다.
     ★ 왜 v255(4fb71ff)가 아니라 v258 인가 — 이 묶음의 기대값은 v257·v258 때
       **앞으로 고쳐졌다**(아래 「★ v258 거부」·「10키(v258)」 쪽지가 그 증거다).
       그래서 이 파일이 적고 있는 참말은 **v258 상태**다. v255 규칙에 맞추면 5건이 틀어진다(실측).
     **지금** 규칙이 무엇을 허락하는지는 t272.mjs 가 본다 — 그쪽이 진짜다. */
import fs from 'fs';
import cp from 'child_process';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs, addDoc, query, where } from 'firebase/firestore';

const RULES_REF = process.env.COS_RULES_REF || '76224a8';   /* v258 — 위 쪽지 참고 */
const RULES = cp.execSync('git -C ' + COS_ROOT + ' show ' + RULES_REF + ':firestore.rules',
  { maxBuffer: 1 << 26 }).toString();

const env = await initializeTestEnvironment({
  projectId: 'cos-v255',
  firestore: { host: '127.0.0.1', port: 8988, rules: RULES }
});
let pass = 0, fail = 0;
async function t(label, want, fn) {
  try {
    if (want === 'allow') await assertSucceeds(fn());
    else await assertFails(fn());
    pass++; console.log('  ' + (want === 'allow' ? '✔ 허용' : '✔ 거부') + '  ' + label);
  } catch (e) { fail++; console.log('  ' + (want === 'allow' ? '✘ 허용기대→거부' : '✘ 거부기대→허용') + '  ' + label); }
}
const ctx = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
/* 기사는 custom token 으로 들어온다 — provider 는 custom */
const dctx = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'custom' } }).firestore();

const MASTER = 'MasterUid00000000000000000001';
const OWNER_A = 'OwnerA000000000000000000002';
const OWNER_B = 'OwnerB000000000000000000003';
const ORG_A = 'academy_' + OWNER_A.slice(0, 12);
const ORG_B = 'academy_' + OWNER_B.slice(0, 12);
const DRV_A = 'drv_' + ORG_A + '_car1';        // 앱이 쓰는 꼴 그대로
const DRV_B = 'drv_' + ORG_B + '_car1';

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'admins', MASTER), { role: 'master' });
  const own = (uid) => ({
    bizType: 'academy', orgName: '업체', orgId: 'academy_' + uid.slice(0, 12), contact: '010-1',
    status: 'active', approved: true, paidUntil: Date.now() + 365 * 86400000, trialEnd: Date.now() + 30 * 86400000, contractMonths: 12, plan: 'trial', trialStart: Date.now(), createdAt: Date.now()
  });
  await setDoc(doc(db, 'users', OWNER_A), own(OWNER_A));
  await setDoc(doc(db, 'users', OWNER_B), own(OWNER_B));
  /* 기사 문서 — api/driver-auth login 이 만드는 모양 그대로 */
  await setDoc(doc(db, 'users', DRV_A), { role: 'driver', driverOrg: ORG_A, ownerUid: OWNER_A, carId: 'car1' });
  await setDoc(doc(db, 'users', DRV_B), { role: 'driver', driverOrg: ORG_B, ownerUid: OWNER_B, carId: 'car1' });
  await setDoc(doc(db, 'orgs', ORG_A, 'drivers', DRV_A), { carId: 'car1', ownerUid: OWNER_A });
  await setDoc(doc(db, 'orgs', ORG_B, 'drivers', DRV_B), { carId: 'car1', ownerUid: OWNER_B });
  /* 자료·백업 미리 심기 */
  const keys = ['members', 'cars', 'courses', 'org', 'attendance', 'attendanceTime', 'notices',
    'rideState', 'carlog', 'deliveryDone', 'dropoffDone', 'driverAtt',
    'payments', 'tax', 'payrollManual', 'staff', 'drivelogManual', 'driverPay',
    'invoices', 'products'];
  for (const k of keys) await setDoc(doc(db, 'orgs', ORG_A, 'data', k), { value: '[]', updatedAt: 1 });
  await setDoc(doc(db, 'orgs', ORG_B, 'data', 'members'), { value: '[]', updatedAt: 1 });
  await setDoc(doc(db, 'orgs', ORG_A, 'backups', 'payments__1'), { key: 'payments', value: '[]', backupAt: 1 });
  await setDoc(doc(db, 'orgs', ORG_A, 'backups', 'carlog__1'), { key: 'carlog', value: '[]', backupAt: 1 });
  /* 서버 전용 컬렉션에 값 심기 (규칙이 막는지 보려면 값이 있어야 의미가 있다) */
  await setDoc(doc(db, 'orgCodes', '123456'), { orgId: ORG_A, createdAt: 1 });
  await setDoc(doc(db, 'driverPins', ORG_A + '_car1'), { org: ORG_A, carId: 'car1', pinHash: 'x' });
  await setDoc(doc(db, 'driverDevices', ORG_A + '_car1'), { org: ORG_A, carId: 'car1', deviceId: 'd' });
  await setDoc(doc(db, 'driverLogins', 'L1'), { org: ORG_A, carId: 'car1', ok: true, at: 1, lat: 37.1, lng: 127.1 });
  await setDoc(doc(db, 'driverRl', 'f.abc'), { at: [1, 2, 3] });
});

/* v258: 읽기에서도 attendance·attendanceTime 을 뺐다 (12키 → 10키) — 일부러 바꾼 자리다.
     이번 회차 표는 t258.mjs */
const ALLOW_READ = ['members', 'cars', 'courses', 'org',
  'notices', 'rideState', 'carlog', 'deliveryDone', 'dropoffDone', 'driverAtt'];
const V258_READ_REMOVED = ['attendance', 'attendanceTime'];
const DENY_READ = ['payments', 'tax', 'payrollManual', 'staff', 'drivelogManual', 'driverPay',
  'invoices', 'products'];
/* v257: attendance·attendanceTime 을 쓰기에서 뺐다 → 이 회차 기록은 **네 키**로 본다
   (v255 가 지키려던 것은 「driverAtt 를 뺀 것」이라 그대로 본다. 이번 회차 표는 t257.mjs) */
const ALLOW_WRITE = ['carlog', 'deliveryDone', 'dropoffDone', 'rideState'];
const V257_REMOVED = ['attendance', 'attendanceTime'];

console.log('\n════ 1. 기사 읽기 — 운행에 필요한 12키만 ════');
for (const k of ALLOW_READ)
  await t('기사 → ' + k + ' 읽기', 'allow', () => getDoc(doc(dctx(DRV_A), 'orgs', ORG_A, 'data', k)));
for (const k of DENY_READ)
  await t('기사 → ' + k + ' 읽기', 'deny', () => getDoc(doc(dctx(DRV_A), 'orgs', ORG_A, 'data', k)));
for (const k of V258_READ_REMOVED)
  await t('기사 → ' + k + ' 읽기 (★ v258 거부)', 'deny', () => getDoc(doc(dctx(DRV_A), 'orgs', ORG_A, 'data', k)));

console.log('\n════ 2. 기사 쓰기 — driverAtt 를 뺐다 ════');
for (const k of ALLOW_WRITE)
  await t('기사 → ' + k + ' 쓰기', 'allow', () => setDoc(doc(dctx(DRV_A), 'orgs', ORG_A, 'data', k), { value: '{}', updatedAt: 2 }));
await t('기사 → driverAtt 쓰기 (★ v255 거부)', 'deny',
  () => setDoc(doc(dctx(DRV_A), 'orgs', ORG_A, 'data', 'driverAtt'), { value: '{}', updatedAt: 2 }));
for (const k of V257_REMOVED)
  await t('기사 → ' + k + ' 쓰기 (★ v257 거부)', 'deny',
    () => setDoc(doc(dctx(DRV_A), 'orgs', ORG_A, 'data', k), { value: '{}', updatedAt: 2 }));
await t('기사 → driverPay 쓰기', 'deny',
  () => setDoc(doc(dctx(DRV_A), 'orgs', ORG_A, 'data', 'driverPay'), { value: '{}', updatedAt: 2 }));
await t('기사 → members 쓰기', 'deny',
  () => setDoc(doc(dctx(DRV_A), 'orgs', ORG_A, 'data', 'members'), { value: '[]', updatedAt: 2 }));

console.log('\n════ 3. 관리자(소유자)·마스터는 그대로 ════');
await t('소유자 → driverAtt 쓰기 (직원 근태·수기 토글)', 'allow',
  () => setDoc(doc(ctx(OWNER_A), 'orgs', ORG_A, 'data', 'driverAtt'), { value: '{}', updatedAt: 3 }));
await t('소유자 → driverPay 쓰기', 'allow',
  () => setDoc(doc(ctx(OWNER_A), 'orgs', ORG_A, 'data', 'driverPay'), { value: '{}', updatedAt: 3 }));
await t('소유자 → driverPay 읽기', 'allow',
  () => getDoc(doc(ctx(OWNER_A), 'orgs', ORG_A, 'data', 'driverPay')));
await t('소유자 → payments 읽기', 'allow',
  () => getDoc(doc(ctx(OWNER_A), 'orgs', ORG_A, 'data', 'payments')));

console.log('\n════ 4. 다른 업체 기사는 못 본다 ════');
await t('B 업체 기사 → A 업체 members 읽기', 'deny',
  () => getDoc(doc(dctx(DRV_B), 'orgs', ORG_A, 'data', 'members')));
await t('B 업체 기사 → A 업체 carlog 쓰기', 'deny',
  () => setDoc(doc(dctx(DRV_B), 'orgs', ORG_A, 'data', 'carlog'), { value: '{}', updatedAt: 4 }));
await t('A 업체 기사 → 자기 업체 members 읽기 (대조)', 'allow',
  () => getDoc(doc(dctx(DRV_A), 'orgs', ORG_A, 'data', 'members')));

console.log('\n════ 5. 백업 — 기사는 create 만 ════');
await t('기사 → 백업 읽기 (★ v255 거부)', 'deny',
  () => getDoc(doc(dctx(DRV_A), 'orgs', ORG_A, 'backups', 'payments__1')));
await t('기사 → 백업 목록 (★ v255 거부)', 'deny',
  () => getDocs(collection(dctx(DRV_A), 'orgs', ORG_A, 'backups')));
await t('기사 → 백업 삭제 (★ v255 거부)', 'deny',
  () => deleteDoc(doc(dctx(DRV_A), 'orgs', ORG_A, 'backups', 'carlog__1')));
await t('기사 → 쓰는 키 백업 만들기 (저장이 깨지지 않게 남겼다)', 'allow',
  () => setDoc(doc(dctx(DRV_A), 'orgs', ORG_A, 'backups', 'carlog__9'), { key: 'carlog', value: '{}', backupAt: 9 }));
await t('기사 → 못 쓰는 키(driverAtt) 백업 만들기', 'deny',
  () => setDoc(doc(dctx(DRV_A), 'orgs', ORG_A, 'backups', 'driverAtt__9'), { key: 'driverAtt', value: '{}', backupAt: 9 }));
await t('소유자 → 백업 읽기 (대조)', 'allow',
  () => getDoc(doc(ctx(OWNER_A), 'orgs', ORG_A, 'backups', 'payments__1')));

console.log('\n════ 6. 서버 전용 5컬렉션 — 누구도 못 본다 ════');
const who = { '기사': dctx(DRV_A), '소유자': ctx(OWNER_A), '마스터': ctx(MASTER) };
const cols = [['orgCodes', '123456'], ['driverPins', ORG_A + '_car1'],
              ['driverDevices', ORG_A + '_car1'], ['driverLogins', 'L1'], ['driverRl', 'f.abc']];
for (const [name, db] of Object.entries(who)) {
  for (const [col, id] of cols) {
    await t(name + ' → ' + col + ' 읽기', 'deny', () => getDoc(doc(db, col, id)));
    await t(name + ' → ' + col + ' 쓰기', 'deny', () => setDoc(doc(db, col, id), { x: 1 }));
  }
}
await t('기사 → driverPins 목록(내 업체로 걸러도)', 'deny',
  () => getDocs(query(collection(dctx(DRV_A), 'driverPins'), where('org', '==', ORG_A))));
await t('기사 → driverLogins 추가(위치 심기)', 'deny',
  () => addDoc(collection(dctx(DRV_A), 'driverLogins'), { org: ORG_A, at: 1 }));
await t('기사 → driverRl 지우기(잠금 풀기)', 'deny',
  () => deleteDoc(doc(dctx(DRV_A), 'driverRl', 'f.abc')));
await t('기사 → orgCodes 목록(남의 업체 찾기)', 'deny',
  () => getDocs(collection(dctx(DRV_A), 'orgCodes')));

console.log('\n════ 7. 규칙 파일 원문 ════');
{
  const src = RULES;   /* v272: 지금 규칙이 아니라 **이 회차 규칙**(위 RULES_REF) */
  const chk = (label, cond) => { if (cond) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✘ ' + label); } };
  chk('driverWritableKey 에 driverAtt 가 없다', !/driverWritableKey\(key\) \{\s*return key in \[[^\]]*driverAtt/.test(src));
  chk('driverReadableKey 가 있고 **10키**다 (v258)', (function () {
    const m = src.match(/function driverReadableKey\(key\) \{\s*return key in \[([\s\S]*?)\];/);
    if (!m) return false;
    return (m[1].match(/'/g) || []).length / 2 === 10;
  })());
  chk('data read 에 driverReadableKey 가 걸렸다',
    src.indexOf('(isActiveDriver(orgId) && driverReadableKey(key))') >= 0);
  chk('backups read 에 isActiveDriver 가 없다', (function () {
    const m = src.match(/match \/orgs\/\{orgId\}\/backups\/\{backupId\} \{([\s\S]*?)\n    \}/);
    if (!m) return false;
    const rd = m[1].match(/allow read:[\s\S]*?;/);
    return rd && rd[0].indexOf('isActiveDriver') < 0;
  })());
  chk('backups create 에는 isActiveDriver 가 남았다', (function () {
    const m = src.match(/match \/orgs\/\{orgId\}\/backups\/\{backupId\} \{([\s\S]*?)\n    \}/);
    const cr = m[1].match(/allow create:[\s\S]*?;/);
    return cr && cr[0].indexOf('isActiveDriver') >= 0;
  })());
  for (const c of ['orgCodes', 'driverPins', 'driverDevices', 'driverLogins', 'driverRl'])
    chk(c + ' 는 read, write: if false', new RegExp('match /' + c + '/\\{[a-z]+\\}\\s*\\{ allow read, write: if false; \\}').test(src));
  const lines = src.split('\n');
  const cp = await import('node:child_process');
  console.log('  규칙 diff (2eadaaa 대비): '
    + (cp.execSync('git -C ' + COS_ROOT + ' diff --numstat 2eadaaa -- firestore.rules').toString().trim() || '없음'));
  console.log('  규칙 줄 수: ' + (lines.length - (src.endsWith('\n') ? 1 : 0)));
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
