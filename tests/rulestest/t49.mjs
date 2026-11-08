/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* 코스로드49(43-A) 규칙 — **규칙을 안 바꿔도 되는가**.
   보는 것
     ① 새 컬렉션 `staffPins` 는 앱(관리자·기사)에서 **읽기·쓰기 모두 거부**되나
        (맞는 match 가 없으면 기본 거부 — 서버 Admin SDK 만 닿는다)
     ② 동승 도우미 문서 `orgs/{org}/drivers/hlp_…` 를 규칙이 어떻게 보나
        (기사와 **같은 컬렉션**이라 `isActiveDriver`·`myCarId` 가 그대로 본다 —
         그래서 43-B 에서 규칙을 안 고쳐도 도우미가 자기 차량 문서를 읽을 수 있다)
     ③ 그래도 **지금은** 그 uid 로 토큰을 받을 길이 없다(로그인은 43-B). */
import fs from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';

const lf = (s) => String(s).split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));
const RULES = lf(fs.readFileSync('firestore.rules', 'utf8'));

let pass = 0, fail = 0;
const chk = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ✔ ' + label + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  ✘ ' + label + (extra ? '   ' + extra : '')); }
};
async function t(label, want, fn) {
  try {
    await (want === 'allow' ? assertSucceeds(fn()) : assertFails(fn()));
    pass++; console.log('  ✔ ' + (want === 'allow' ? '허용' : '거부') + '  ' + label);
  } catch (e) { fail++; console.log('  ✘ ' + (want === 'allow' ? '허용기대→거부' : '거부기대→허용') + '  ' + label); }
}

const ORG = 'cosroad_acme', OWNER = 'cosroad_acme';
const DRV1 = 'drv_cosroad_acme_car1';
const HLP1 = 'hlp_cosroad_acme_st1';          /* 동승 도우미 uid (아직 토큰은 못 받는다) */
const now = Date.now(), DAY = 86400000;

const env = await initializeTestEnvironment({
  projectId: 'cos-49', firestore: { host: '127.0.0.1', port: 8988, rules: RULES }
});
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'users', OWNER), { orgId: ORG, bizType: 'academy', approved: true,
    withdrawn: false, paidUntil: now + 30 * DAY, plan: 'paid' });
  await setDoc(doc(db, 'orgs', ORG, 'drivers', DRV1), { carId: 'car1', ownerUid: OWNER, createdAt: now });
  /* 서버(setCarHelper)가 쓰는 그 모양 그대로 */
  await setDoc(doc(db, 'orgs', ORG, 'drivers', HLP1),
    { role: 'helper', staffId: 'st1', carId: 'car2', ownerUid: OWNER, updatedAt: now });
  await setDoc(doc(db, 'staffPins', ORG + '_st1'), { org: ORG, staffId: 'st1', pinHash: 'x', updatedAt: now });
  for (const k of ['orgDriver', 'staff']) await setDoc(doc(db, 'orgs', ORG, 'data', k), { value: '{}', updatedAt: now });
  for (const cid of ['car1', 'car2']) {
    await setDoc(doc(db, 'orgs', ORG, 'carData', cid), { value: '{}', updatedAt: now });
    await setDoc(doc(db, 'orgs', ORG, 'carState', cid), { value: '{"att":{}}', updatedAt: now });
  }
});
const asOwner = () => env.authenticatedContext(OWNER, {}).firestore();
const asDrv = (uid, carId) =>
  env.authenticatedContext(uid, { driver: true, org: ORG, carId: carId }).firestore();
const asHelper = (uid) => env.authenticatedContext(uid, { helper: true, org: ORG, staffId: 'st1' }).firestore();

console.log('════ ① `staffPins` 는 앱에서 **닿을 수 없다** (규칙 변경 없이도)');
{
  const o = asOwner(), d = asDrv(DRV1, 'car1');
  await t('관리자 → staffPins 읽기', 'deny', () => getDoc(doc(o, 'staffPins', ORG + '_st1')));
  await t('관리자 → staffPins 쓰기', 'deny',
    () => setDoc(doc(o, 'staffPins', ORG + '_st1'), { pinHash: 'y' }));
  await t('관리자 → staffPins 훑기', 'deny', () => getDocs(collection(o, 'staffPins')));
  await t('기사  → staffPins 읽기', 'deny', () => getDoc(doc(d, 'staffPins', ORG + '_st1')));
  await t('(대조) driverPins 도 같다', 'deny', () => getDoc(doc(o, 'driverPins', ORG + '_car1')));
}

console.log('\n② 동승 도우미 문서 — 규칙이 기사와 **같은 눈**으로 본다');
{
  const h = asHelper(HLP1);
  /* 아직 로그인이 없어 이런 토큰은 발급되지 않는다. 그래도 규칙이 어떻게 볼지 미리 잰다. */
  await t('[미리보기] 도우미 uid → carData/car2(배정 차량) 읽기', 'allow',
    () => getDoc(doc(h, 'orgs', ORG, 'carData', 'car2')));
  await t('[미리보기] 도우미 uid → carData/car1(남의 차량)', 'deny',
    () => getDoc(doc(h, 'orgs', ORG, 'carData', 'car1')));
  await t('[미리보기] 도우미 uid → carState/car2 쓰기', 'allow',
    () => setDoc(doc(h, 'orgs', ORG, 'carState', 'car2'), { value: '{}', updatedAt: now }));
  await t('[미리보기] 도우미 uid → data/orgDriver 읽기', 'allow',
    () => getDoc(doc(h, 'orgs', ORG, 'data', 'orgDriver')));
  await t('[미리보기] 도우미 uid → data/staff(직원 명부)', 'deny',
    () => getDoc(doc(h, 'orgs', ORG, 'data', 'staff')));
  await t('배정이 비면(carId:"") 아무 차량도 못 본다 — 뒤에서 확인', 'allow',
    () => getDoc(doc(h, 'orgs', ORG, 'carData', 'car2')));
}

console.log('\n③ 배정을 떼면(carId:"") 바로 닫힌다');
{
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'orgs', ORG, 'drivers', HLP1),
      { role: 'helper', staffId: 'st1', carId: '', ownerUid: OWNER, updatedAt: now });
  });
  const h = asHelper(HLP1);
  await t('도우미 uid → carData/car2', 'deny', () => getDoc(doc(h, 'orgs', ORG, 'carData', 'car2')));
  await t('도우미 uid → carState/car2 쓰기', 'deny',
    () => setDoc(doc(h, 'orgs', ORG, 'carState', 'car2'), { value: '{}', updatedAt: now }));
}

console.log('\n④ `drivers` 는 여전히 **서버만** 쓴다 (사람이 배정을 못 바꾼다)');
{
  const o = asOwner(), d = asDrv(DRV1, 'car1');
  await t('관리자 → drivers 문서 쓰기', 'deny',
    () => setDoc(doc(o, 'orgs', ORG, 'drivers', HLP1), { carId: 'car1' }));
  await t('기사  → drivers 문서 쓰기', 'deny',
    () => setDoc(doc(d, 'orgs', ORG, 'drivers', HLP1), { carId: 'car1' }));
}

console.log('\n⑤ 기사는 그대로 (49 가 아무것도 안 깨뜨렸나)');
{
  const d = asDrv(DRV1, 'car1');
  await t('기사 → carData/car1', 'allow', () => getDoc(doc(d, 'orgs', ORG, 'carData', 'car1')));
  await t('기사 → carState/car1 쓰기', 'allow',
    () => setDoc(doc(d, 'orgs', ORG, 'carState', 'car1'), { value: '{}', updatedAt: now }));
  await t('기사 → data/orgDriver', 'allow', () => getDoc(doc(d, 'orgs', ORG, 'data', 'orgDriver')));
}

console.log('\n⑥ 규칙 파일은 **한 글자도 안 바뀌었다**');
{
  const cp = await import('child_process');
  const diff = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat -- firestore.rules').toString().trim();
  chk('firestore.rules diff 0', diff === '', diff || '(변경 없음)');
  const n = RULES.split('\n').length - (RULES.endsWith('\n') ? 1 : 0);
  chk('규칙 632줄 그대로', n === 632, n + '줄');
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
  : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
