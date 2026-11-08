/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* 코스로드50(43-B) 규칙 — **실제 규칙**으로 도우미 토큰이 무엇을 할 수 있나.
   ★ 규칙 파일은 **안 바꿨다**(아래 ⑦에서 diff 0·632줄을 확인한다).
     그래서 이 묶음이 하는 일은 「안 바꿔도 되는가」를 **끝까지** 재는 것이다 —
     특히 앱이 새로 읽는 **자기 배정 문서**(`drivers/{내 uid}`)가 열리는지가 핵심이다.
   ★ 표(t50_table.json)를 남긴다 — 크롬 묶음이 그 **실제 판정**을 가짜 Firestore 에 넣는다
     (v276 교훈: 스텁은 규칙을 모르므로 끝까지 통과한다). */
import fs from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, collection, getDocs, addDoc } from 'firebase/firestore';

const lf = (s) => String(s).split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));
const RULES = lf(fs.readFileSync('firestore.rules', 'utf8'));

let pass = 0, fail = 0;
const table = {};
const chk = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ✔ ' + label + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  ✘ ' + label + (extra ? '   ' + extra : '')); }
};
async function t(label, want, fn, key) {
  let got;
  try { await (want === 'allow' ? assertSucceeds(fn()) : assertFails(fn())); got = want; }
  catch (e) { got = (want === 'allow' ? 'deny' : 'allow'); }
  if (key) table[key] = got;
  if (got === want) { pass++; console.log('  ✔ ' + (want === 'allow' ? '허용' : '거부') + '  ' + label); }
  else { fail++; console.log('  ✘ ' + (want === 'allow' ? '허용기대→거부' : '거부기대→허용') + '  ' + label); }
}

const ORG = 'cosroad_acme', OWNER = 'cosroad_acme';
const DRV1 = 'drv_cosroad_acme_car1';
const HLP = 'hlp_cosroad_acme_st1';
const now = Date.now(), DAY = 86400000;

const env = await initializeTestEnvironment({
  projectId: 'cos-50', firestore: { host: '127.0.0.1', port: 8988, rules: RULES }
});
async function seed(helperCar, ownerAlive) {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'users', OWNER), { orgId: ORG, bizType: 'academy', approved: true,
      withdrawn: false, paidUntil: ownerAlive === false ? (now - DAY) : (now + 30 * DAY), plan: 'paid' });
    /* 서버 driver-auth login 이 쓰는 그 모양 그대로 (carId 없음·approved 없음) */
    await setDoc(doc(db, 'users', HLP),
      { role: 'helper', driverOrg: ORG, ownerUid: OWNER, staffId: 'st1' });
    await setDoc(doc(db, 'users', DRV1),
      { role: 'driver', driverOrg: ORG, ownerUid: OWNER, carId: 'car1' });
    await setDoc(doc(db, 'orgs', ORG, 'drivers', DRV1), { carId: 'car1', ownerUid: OWNER, createdAt: now });
    await setDoc(doc(db, 'orgs', ORG, 'drivers', HLP),
      { role: 'helper', staffId: 'st1', carId: helperCar, ownerUid: OWNER, updatedAt: now });
    for (const k of ['orgDriver', 'members', 'staff', 'staffAtt', 'attendance', 'payments'])
      await setDoc(doc(db, 'orgs', ORG, 'data', k), { value: '{}', updatedAt: now });
    for (const cid of ['car1', 'car2']) {
      await setDoc(doc(db, 'orgs', ORG, 'carData', cid), { value: '{}', updatedAt: now });
      await setDoc(doc(db, 'orgs', ORG, 'carState', cid), { value: '{"att":{}}', updatedAt: now });
    }
    await setDoc(doc(db, 'orgs', ORG, 'backups', 'carState_car1__1'),
      { key: 'carState/car1', value: '{}', backupAt: now });
  });
}
/* 실제 발급되는 claim 그대로 — **carId 가 없다** (api/driver-auth login, 43-B) */
const asHelper = () => env.authenticatedContext(HLP, { helper: true, org: ORG, staffId: 'st1' }).firestore();
const asDrv = () => env.authenticatedContext(DRV1, { driver: true, org: ORG, carId: 'car1' }).firestore();
const asOwner = () => env.authenticatedContext(OWNER, {}).firestore();

console.log('════ ① 도우미는 **자기 배정 문서**를 읽을 수 있다 (앱 리스너가 이것을 쓴다)');
await seed('car2', true);
{
  const h = asHelper();
  await t('도우미 → drivers/{내 uid} 읽기', 'allow',
    () => getDoc(doc(h, 'orgs', ORG, 'drivers', HLP)), 'helper.myDriverDoc');
  await t('도우미 → drivers/{남의 uid} 읽기', 'deny',
    () => getDoc(doc(h, 'orgs', ORG, 'drivers', DRV1)), 'helper.otherDriverDoc');
  await t('도우미 → drivers 컬렉션 훑기', 'deny',
    () => getDocs(collection(h, 'orgs', ORG, 'drivers')), 'helper.driversList');
  await t('도우미 → 자기 배정 문서 **쓰기**(차량 바꿔치기)', 'deny',
    () => setDoc(doc(h, 'orgs', ORG, 'drivers', HLP), { carId: 'car1' }), 'helper.writeMyDriverDoc');
}

console.log('\n② 배정 차량(car2) 자료는 열리고, 남의 차량은 닫힌다');
{
  const h = asHelper();
  await t('carData/car2 읽기', 'allow', () => getDoc(doc(h, 'orgs', ORG, 'carData', 'car2')), 'helper.carData.mine');
  await t('carData/car1 읽기', 'deny', () => getDoc(doc(h, 'orgs', ORG, 'carData', 'car1')), 'helper.carData.other');
  await t('carData/car2 **쓰기**(사본은 읽기 전용)', 'deny',
    () => setDoc(doc(h, 'orgs', ORG, 'carData', 'car2'), { value: '{}' }), 'helper.carData.write');
  await t('carState/car2 읽기', 'allow', () => getDoc(doc(h, 'orgs', ORG, 'carState', 'car2')), 'helper.carState.mine');
  await t('carState/car2 쓰기(탑승·완료 토글)', 'allow',
    () => setDoc(doc(h, 'orgs', ORG, 'carState', 'car2'), { value: '{"ride":{}}', updatedAt: now }), 'helper.carState.write');
  await t('carState/car1 쓰기', 'deny',
    () => setDoc(doc(h, 'orgs', ORG, 'carState', 'car1'), { value: '{}' }), 'helper.carState.otherWrite');
  await t('data/orgDriver 읽기', 'allow', () => getDoc(doc(h, 'orgs', ORG, 'data', 'orgDriver')), 'helper.orgDriver');
  for (const k of ['members', 'staff', 'staffAtt', 'attendance', 'payments']) {
    await t('data/' + k + ' 읽기', 'deny', () => getDoc(doc(h, 'orgs', ORG, 'data', k)), 'helper.data.' + k);
  }
  await t('data/orgDriver 쓰기', 'deny',
    () => setDoc(doc(h, 'orgs', ORG, 'data', 'orgDriver'), { value: '{}' }), 'helper.orgDriver.write');
}

console.log('\n③ 백업 — 자기 차량 기록만 남길 수 있고, 읽기는 막힌다 (기사와 같다)');
{
  const h = asHelper();
  await t('backups create (key: carState/car2)', 'allow',
    () => addDoc(collection(h, 'orgs', ORG, 'backups'),
      { key: 'carState/car2', value: '{}', backupAt: now }), 'helper.backup.mine');
  await t('backups create (key: carState/car1)', 'deny',
    () => addDoc(collection(h, 'orgs', ORG, 'backups'),
      { key: 'carState/car1', value: '{}', backupAt: now }), 'helper.backup.other');
  await t('backups 읽기', 'deny',
    () => getDoc(doc(h, 'orgs', ORG, 'backups', 'carState_car1__1')), 'helper.backup.read');
}

console.log('\n④ 권한을 스스로 올릴 수 없다 (users 자기 문서)');
{
  const h = asHelper();
  await t('users/{내 uid} 읽기', 'allow', () => getDoc(doc(h, 'users', HLP)), 'helper.myUser');
  await t('users 에 orgId 를 적어 업체가 되기', 'deny',
    () => updateDoc(doc(h, 'users', HLP), { orgId: ORG }), 'helper.users.orgId');
  await t('users 에 approved·paidUntil 적기', 'deny',
    () => updateDoc(doc(h, 'users', HLP), { approved: true, paidUntil: now + 99 * DAY }), 'helper.users.approve');
  await t('users 의 role 을 바꾸기', 'deny',
    () => updateDoc(doc(h, 'users', HLP), { role: 'driver' }), 'helper.users.role');
  await t('users 에 testAccess 켜기', 'deny',
    () => updateDoc(doc(h, 'users', HLP), { testAccess: true }), 'helper.users.testAccess');
  await t('남의 users 문서 읽기', 'deny', () => getDoc(doc(h, 'users', OWNER)), 'helper.users.other');
  await t('staffPins 읽기(내 PIN 해시)', 'deny',
    () => getDoc(doc(h, 'staffPins', ORG + '_st1')), 'helper.staffPins');
}

console.log('\n⑤ 배정을 car1 로 **옮기면** 그 자리에서 바뀐다');
{
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'orgs', ORG, 'drivers', HLP),
      { role: 'helper', staffId: 'st1', carId: 'car1', ownerUid: OWNER, updatedAt: now });
  });
  const h = asHelper();
  await t('carData/car1(새 차량) 읽기', 'allow', () => getDoc(doc(h, 'orgs', ORG, 'carData', 'car1')), 'helper2.carData.new');
  await t('carData/car2(옛 차량) 읽기', 'deny', () => getDoc(doc(h, 'orgs', ORG, 'carData', 'car2')), 'helper2.carData.old');
  await t('carState/car2(옛 차량) 쓰기', 'deny',
    () => setDoc(doc(h, 'orgs', ORG, 'carState', 'car2'), { value: '{}' }), 'helper2.carState.old');
}

console.log('\n⑥ 배정을 떼거나 업체 기간이 끝나면 **전부 닫힌다**');
{
  await seed('', true);
  const h = asHelper();
  await t('[배정 없음] carData/car1', 'deny', () => getDoc(doc(h, 'orgs', ORG, 'carData', 'car1')), 'nocar.carData');
  await t('[배정 없음] carState/car1 쓰기', 'deny',
    () => setDoc(doc(h, 'orgs', ORG, 'carState', 'car1'), { value: '{}' }), 'nocar.carState');
  await t('[배정 없음] data/orgDriver 는 그대로 열린다(막힘 화면이 아니라 안내)', 'allow',
    () => getDoc(doc(h, 'orgs', ORG, 'data', 'orgDriver')), 'nocar.orgDriver');
  await t('[배정 없음] 자기 배정 문서는 읽을 수 있다(안내를 띄우려면 필요)', 'allow',
    () => getDoc(doc(h, 'orgs', ORG, 'drivers', HLP)), 'nocar.myDriverDoc');

  await seed('car1', false);               /* 업체 기간 끝남 */
  const h2 = asHelper();
  await t('[기간 끝남] carData/car1', 'deny', () => getDoc(doc(h2, 'orgs', ORG, 'carData', 'car1')), 'expired.carData');
  await t('[기간 끝남] carState/car1 쓰기', 'deny',
    () => setDoc(doc(h2, 'orgs', ORG, 'carState', 'car1'), { value: '{}' }), 'expired.carState');
  await t('[기간 끝남] data/orgDriver', 'deny',
    () => getDoc(doc(h2, 'orgs', ORG, 'data', 'orgDriver')), 'expired.orgDriver');
  /* 대조 — 같은 상태에서 **기사**도 막힌다(같은 규칙 ownerAlive) */
  await t('[기간 끝남·대조] 기사 → data/orgDriver', 'deny',
    () => getDoc(doc(asDrv(), 'orgs', ORG, 'data', 'orgDriver')), 'expired.driver.orgDriver');
}

console.log('\n⑦ 회귀 — 기사·관리자는 그대로 · 규칙 파일은 안 바뀌었다');
{
  await seed('car2', true);
  const d = asDrv(), o = asOwner();
  await t('기사 → carData/car1', 'allow', () => getDoc(doc(d, 'orgs', ORG, 'carData', 'car1')), 'drv.carData');
  await t('기사 → carState/car1 쓰기', 'allow',
    () => setDoc(doc(d, 'orgs', ORG, 'carState', 'car1'), { value: '{}', updatedAt: now }), 'drv.carState');
  await t('기사 → data/orgDriver', 'allow', () => getDoc(doc(d, 'orgs', ORG, 'data', 'orgDriver')), 'drv.orgDriver');
  await t('기사 → data/members', 'deny', () => getDoc(doc(d, 'orgs', ORG, 'data', 'members')), 'drv.members');
  await t('기사 → carData/car2', 'deny', () => getDoc(doc(d, 'orgs', ORG, 'carData', 'car2')), 'drv.carData.other');
  await t('관리자 → data/members', 'allow', () => getDoc(doc(o, 'orgs', ORG, 'data', 'members')), 'adm.members');
  await t('관리자 → carState 훑기', 'allow', () => getDocs(collection(o, 'orgs', ORG, 'carState')), 'adm.carStateList');
  await t('관리자 → drivers 훑기(차량관리 명부)', 'allow',
    () => getDocs(collection(o, 'orgs', ORG, 'drivers')), 'adm.driversList');

  const cp = await import('child_process');
  const diff = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat -- firestore.rules').toString().trim();
  chk('firestore.rules diff 0 (게시할 것 없음)', diff === '', diff || '(변경 없음)');
  const n = RULES.split('\n').length - (RULES.endsWith('\n') ? 1 : 0);
  chk('규칙 632줄 그대로', n === 632, n + '줄');
}

fs.writeFileSync('t50_table.json', JSON.stringify(table, null, 1));
console.log('\n표를 남겼다: rulestest/t50_table.json (' + Object.keys(table).length + '칸)');
console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
  : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
