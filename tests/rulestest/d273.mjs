/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v273 — 「배정은 관리자만」 확인 (규칙 쪽). 규칙은 **이번에 안 고쳤다**(582줄 그대로) —
   `members` 가 기사 쓰기 키에 없어 **규칙으로도** 막히는지만 본다. */
import fs from 'fs';
import cp from 'child_process';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';

/* ★ v274: 규칙을 **v273 커밋에 고정**한다 — 이 묶음은 「v273 은 규칙을 안 고쳤다(582줄)」는
   기록이다. 지금 규칙을 읽으면 v274 가 608줄로 늘린 것과 어긋나 거짓으로 깨진다. */
const _RULES_REF = process.env.COS_RULES_REF || '06e30f3';   /* v273 */
const RULES = cp.execSync('git -C ' + COS_ROOT + ' show ' + _RULES_REF + ':firestore.rules',
  { maxBuffer: 1 << 26 }).toString()
  .split(String.fromCharCode(13) + String.fromCharCode(10)).join(String.fromCharCode(10));

let pass = 0, fail = 0;
async function t(label, want, fn) {
  try {
    await (want === 'allow' ? assertSucceeds(fn()) : assertFails(fn()));
    pass++; console.log('  ✔ ' + (want === 'allow' ? '허용' : '거부') + '  ' + label);
  } catch (e) { fail++; console.log('  ✘ ' + (want === 'allow' ? '허용기대→거부' : '거부기대→허용') + '  ' + label); }
}
const chk = (label, cond) => { if (cond) { pass++; console.log('  ✔ ' + label); }
                               else { fail++; console.log('  ✘ ' + label); } };

const ORG = 'cosroad_acme', OWNER = 'cosroad_acme', DRV = 'drv_cosroad_acme_car1';
const now = Date.now(), DAY = 86400000;

const env = await initializeTestEnvironment({
  projectId: 'cos-v273', firestore: { host: '127.0.0.1', port: 8988, rules: RULES }
});
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'users', OWNER), { orgId: ORG, bizType: 'academy', approved: true,
    withdrawn: false, paidUntil: now + 30 * DAY, plan: 'paid' });
  await setDoc(doc(db, 'orgs', ORG, 'drivers', DRV), { carId: 'car1', ownerUid: OWNER, createdAt: now });
  await setDoc(doc(db, 'orgs', ORG, 'data', 'members'),
    { value: JSON.stringify([{ id: 1, carId: 'car1', carIdDrop: 'car2' }]), updatedAt: now });
});
const asDrv = () => env.authenticatedContext(DRV, { driver: true, org: ORG, carId: 'car1' }).firestore();
const asOwner = () => env.authenticatedContext(OWNER, {}).firestore();

console.log('════ 배정(members)을 누가 쓸 수 있나');
await t('기사 → members **쓰기** (배정 바꾸기)', 'deny',
  () => setDoc(doc(asDrv(), 'orgs', ORG, 'data', 'members'),
    { value: JSON.stringify([{ id: 1, carId: 'car2' }]), updatedAt: 1 }));
await t('관리자(소유자) → members 쓰기', 'allow',
  () => setDoc(doc(asOwner(), 'orgs', ORG, 'data', 'members'),
    { value: JSON.stringify([{ id: 1, carId: 'car1', carIdDrop: 'car2' }]), updatedAt: 2 }));
await t('(대조) 기사 → carlog 쓰기는 된다 (쓰기 키에 있다)', 'allow',
  () => setDoc(doc(asDrv(), 'orgs', ORG, 'data', 'carlog'),
    { value: '{"records":[],"plans":{}}', updatedAt: 3 }));
await t('기사 → cars 쓰기 (차량 자체 고치기)', 'deny',
  () => setDoc(doc(asDrv(), 'orgs', ORG, 'data', 'cars'), { value: '[]', updatedAt: 4 }));

console.log('\n════ 규칙 글 — 이번 회차는 규칙을 안 고쳤다');
{
  const wm = RULES.match(/function driverWritableKey\(key\) \{\s*return key in \[([\s\S]*?)\];/);
  const wk = wm ? wm[1].match(/'([^']+)'/g).map((x) => x.replace(/'/g, '')) : [];
  chk('기사 쓰기 키 4개 그대로: ' + wk.join(','), wk.length === 4
    && wk.indexOf('members') < 0 && wk.indexOf('cars') < 0);
  const n = RULES.split('\n').length - (RULES.endsWith('\n') ? 1 : 0);
  chk('규칙 582줄 그대로 (지금 ' + n + ')', n === 582);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
  : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
