/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* 코스로드40 설계 검증 — **규칙 초안이 실제로 되는가** (에뮬레이터).
   ★ 저장소 firestore.rules 는 건드리지 않는다 — `draft40.rules` 사본만 시험한다.
   보는 것: 기사가 **자기 차량 문서만** 읽고 쓰는가 · 남의 차량은 거부되는가 ·
            carData 는 기사에게 **읽기 전용**인가 · 관리자·만료·_demo 는 종전대로인가. */
import fs from 'fs';
import cp from 'child_process';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const RULES = fs.readFileSync('draft40.rules', 'utf8')
  .split(String.fromCharCode(13) + String.fromCharCode(10)).join(String.fromCharCode(10));

let pass = 0, fail = 0;
async function t(label, want, fn) {
  try {
    await (want === 'allow' ? assertSucceeds(fn()) : assertFails(fn()));
    pass++; console.log('  ✔ ' + (want === 'allow' ? '허용' : '거부') + '  ' + label);
  } catch (e) {
    fail++; console.log('  ✘ ' + (want === 'allow' ? '허용기대→거부' : '거부기대→허용') + '  ' + label);
  }
}
const chk = (label, cond) => { if (cond) { pass++; console.log('  ✔ ' + label); }
                               else { fail++; console.log('  ✘ ' + label); } };

const ORG = 'cosroad_acme', ORG_EXP = 'cosroad_exp', DEMO = 'cosroad_demo';
const OWNER = 'OWNER1', EXPIRED = 'EXP1', MASTER = 'MASTER1';
const DRV1 = 'drv_' + ORG + '_car1', DRV2 = 'drv_' + ORG + '_car2';
const now = Date.now(), DAY = 86400000;
const owner = (uid, over) => Object.assign({
  orgId: uid, bizType: 'academy', approved: true, withdrawn: false,
  paidUntil: now + 30 * DAY, plan: 'paid'
}, over || {});

const env = await initializeTestEnvironment({
  projectId: 'cos-d40', firestore: { host: '127.0.0.1', port: 8988, rules: RULES }
});
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'admins', MASTER), { role: 'master' });
  await setDoc(doc(db, 'users', OWNER), owner(OWNER));
  await setDoc(doc(db, 'users', EXPIRED), owner(EXPIRED, { paidUntil: now - DAY, plan: 'expired' }));
  /* 기사 둘 — 1호차·2호차 */
  await setDoc(doc(db, 'orgs', ORG, 'drivers', DRV1), { carId: 'car1', ownerUid: OWNER, createdAt: now });
  await setDoc(doc(db, 'orgs', ORG, 'drivers', DRV2), { carId: 'car2', ownerUid: OWNER, createdAt: now });
  for (const o of [ORG, ORG_EXP, DEMO]) {
    for (const cid of ['car1', 'car2']) {
      await setDoc(doc(db, 'orgs', o, 'carData', cid), { value: '{"members":[]}', updatedAt: now });
      await setDoc(doc(db, 'orgs', o, 'carState', cid), { value: '{"ride":{}}', updatedAt: now });
    }
  }
});
/* 업체 id 는 users/{uid}.orgId 로 묶인다 — 소유자 uid 를 org 이름으로 맞춘다 */
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'users', OWNER), owner(OWNER, { orgId: ORG }));
  await setDoc(doc(db, 'users', EXPIRED), owner(EXPIRED, { orgId: ORG_EXP, paidUntil: now - DAY, plan: 'expired' }));
});
const ctx = (uid, claims) => env.authenticatedContext(uid, claims || {}).firestore();
const asDrv = (uid, carId) => ctx(uid, { driver: true, org: ORG, carId: carId });

console.log('════ 1. 기사 — 자기 차량만 (carData: 읽기 전용)');
await t('1호차 기사 → 자기 carData 읽기', 'allow',
  () => getDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'carData', 'car1')));
await t('1호차 기사 → **2호차** carData 읽기', 'deny',
  () => getDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'carData', 'car2')));
await t('1호차 기사 → 자기 carData **쓰기**', 'deny',
  () => setDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'carData', 'car1'), { value: '{}', updatedAt: 1 }));

console.log('\n════ 2. 기사 — carState 는 자기 것만 읽고 쓴다');
await t('1호차 기사 → 자기 carState 읽기', 'allow',
  () => getDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'carState', 'car1')));
await t('1호차 기사 → 자기 carState 쓰기', 'allow',
  () => setDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'carState', 'car1'), { value: '{"ride":{"1":{"on":true}}}', updatedAt: 2 }));
await t('1호차 기사 → **2호차** carState 읽기', 'deny',
  () => getDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'carState', 'car2')));
await t('1호차 기사 → **2호차** carState 쓰기 (★ 남의 기록 덮기)', 'deny',
  () => setDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'carState', 'car2'), { value: '{}', updatedAt: 3 }));
await t('2호차 기사 → 자기 carState 쓰기 (서로 막지 않는다)', 'allow',
  () => setDoc(doc(asDrv(DRV2, 'car2'), 'orgs', ORG, 'carState', 'car2'), { value: '{"ride":{"3":{"on":true}}}', updatedAt: 4 }));

console.log('\n════ 3. 토큰을 거짓으로 적어도 막히나 (★ 중요)');
await t('1호차 기사가 **토큰에 carId=car2** 라 적고 2호차 읽기', 'deny',
  () => getDoc(doc(asDrv(DRV1, 'car2'), 'orgs', ORG, 'carData', 'car2')));
await t('1호차 기사가 토큰을 속여 2호차 carState 쓰기', 'deny',
  () => setDoc(doc(asDrv(DRV1, 'car2'), 'orgs', ORG, 'carState', 'car2'), { value: '{}', updatedAt: 5 }));
console.log('      → 규칙이 **drivers/{uid}.carId**(서버 문서)를 보므로 토큰 위조가 안 통한다');

console.log('\n════ 4. 관리자·소유자·마스터');
await t('소유자 → 모든 차량 carData 읽기', 'allow',
  () => getDoc(doc(ctx(OWNER), 'orgs', ORG, 'carData', 'car2')));
await t('소유자 → carData 쓰기', 'allow',
  () => setDoc(doc(ctx(OWNER), 'orgs', ORG, 'carData', 'car1'), { value: '{"members":[]}', updatedAt: 6 }));
await t('소유자 → 모든 차량 carState 읽기·쓰기', 'allow',
  () => setDoc(doc(ctx(OWNER), 'orgs', ORG, 'carState', 'car2'), { value: '{}', updatedAt: 7 }));
await t('(대조) 마스터 → 남의 업체 carData 읽기 (v263대로 거부)', 'deny',
  () => getDoc(doc(ctx(MASTER), 'orgs', ORG, 'carData', 'car1')));
await t('남의 업체 소유자 → carData 읽기', 'deny',
  () => getDoc(doc(ctx(EXPIRED), 'orgs', ORG, 'carData', 'car1')));
await t('로그인 안 함 → carData 읽기', 'deny',
  () => getDoc(doc(env.unauthenticatedContext().firestore(), 'orgs', ORG, 'carData', 'car1')));

console.log('\n════ 5. 만료 업체 · 둘러보기');
await t('만료 업체 → carData **읽기만**', 'allow',
  () => getDoc(doc(ctx(EXPIRED), 'orgs', ORG_EXP, 'carData', 'car1')));
await t('만료 업체 → carState 쓰기', 'deny',
  () => setDoc(doc(ctx(EXPIRED), 'orgs', ORG_EXP, 'carState', 'car1'), { value: '{}', updatedAt: 8 }));
await t('둘러보기(_demo) → carData 읽기', 'allow',
  () => getDoc(doc(ctx(OWNER), 'orgs', DEMO, 'carData', 'car1')));
await t('둘러보기(_demo) → carState 쓰기', 'deny',
  () => setDoc(doc(ctx(OWNER), 'orgs', DEMO, 'carState', 'car1'), { value: '{}', updatedAt: 9 }));

console.log('\n════ 6. 초안 글 자체');
{
  chk('carData 블록이 있다', /match \/orgs\/\{orgId\}\/carData\/\{carId\}/.test(RULES));
  chk('carState 블록이 있다', /match \/orgs\/\{orgId\}\/carState\/\{carId\}/.test(RULES));
  chk('myCarId 가 drivers 문서를 본다', /function myCarId\(orgId\) \{ return driverDoc\(orgId\)\.carId; \}/.test(RULES));
  chk('carData 기사 쓰기 분기가 **없다**', !/carData[\s\S]{0,420}allow write[\s\S]{0,180}isActiveDriver/.test(RULES));
  const n = RULES.split('\n').length - (RULES.endsWith('\n') ? 1 : 0);
  console.log('      초안 줄 수: ' + n + '줄 (지금 582 → +' + (n - 582) + ')');
  /* ★ v275: 이 묶음은 **설계 회차(코드 0)** 기록이다 — 「저장소 규칙은 손대지 않았다」를
     그 회차 커밋(d26c93e = v272 보정1)으로 못 박는다. 작업트리를 보면 뒤 회차가
     규칙을 고칠 때마다 거짓 실패가 난다(v275 에서 632줄이 되어 실제로 겪었다). */
  const _REF = process.env.COS_RULES_REF || 'd26c93e';
  chk('그 회차(' + _REF + ') 저장소 규칙은 그대로 582줄',
    cp.execSync('git -C ' + COS_ROOT + ' show ' + _REF + ':firestore.rules', { maxBuffer: 1 << 26 })
      .toString()
      .split(String.fromCharCode(13) + String.fromCharCode(10)).join(String.fromCharCode(10))
      .split('\n').filter((x, i, a) => i < a.length - 1 || x !== '').length === 582);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
  : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
