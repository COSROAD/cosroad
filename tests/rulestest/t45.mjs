/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* 코스로드45 — 「세 곳이 같은 한 줄인가」의 **규칙 쪽을 진짜 규칙으로** 잰다.
   같은 소유자 문서 다섯 가지에 대해 기사가 `data/orgDriver` 를 읽을 수 있나를 본다
   (그 읽기는 `isActiveDriver` → `ownerAlive` 를 거친다 = 규칙의 기간 판정).
   스텁 쪽(api/driver-auth · lib/period) 과 **같은 답**이 나와야 한다. */
import fs from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';
/* 코스로드53: 올리면서 **동적 import** 로 바꿨다 — 정식 import 는 주소를 계산해 넣을 수 없다
   (`SyntaxError: Unexpected token '+'`). ESM 은 맨 위 await 가 되므로 뜻은 그대로다. */
const { isAliveUser } = await import('file:///' + COS_ROOT + '/lib/period.js');

const lf = (s) => String(s).split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));
const RULES = lf(fs.readFileSync('firestore.rules', 'utf8'));

let pass = 0, fail = 0;
const chk = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ✔ ' + label + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  ✘ ' + label + (extra ? '   ' + extra : '')); }
};

const NOW = Date.now(), DAY = 86400000;
const CASES = {
  '살아 있음(paidUntil 미래)': { approved: true, withdrawn: false, paidUntil: NOW + 30 * DAY, plan: 'paid' },
  '기간 끝남(paidUntil 과거)': { approved: true, withdrawn: false, paidUntil: NOW - DAY, plan: 'paid' },
  'paidUntil 없음(승인만)':    { approved: true, withdrawn: false, plan: 'paid' },
  '탈퇴':                      { approved: true, withdrawn: true,  paidUntil: NOW + 30 * DAY },
  '미승인':                    { approved: false, withdrawn: false, paidUntil: NOW + 30 * DAY }
};

const env = await initializeTestEnvironment({
  projectId: 'cos-45', firestore: { host: '127.0.0.1', port: 8988, rules: RULES }
});
/* 경우마다 **다른 업체**를 만들어 소유자 문서를 달리 둔다 */
const orgOf = (i) => 'cosroad_c' + i;
const ownerOf = (i) => 'owner' + i;
const drvOf = (i) => 'drv_' + orgOf(i) + '_car1';
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  Object.keys(CASES).forEach(() => {});
  let i = 0;
  for (const name of Object.keys(CASES)) {
    const org = orgOf(i), owner = ownerOf(i);
    await setDoc(doc(db, 'users', owner), Object.assign({ orgId: org, bizType: 'academy' }, CASES[name]));
    await setDoc(doc(db, 'orgs', org, 'drivers', drvOf(i)), { carId: 'car1', ownerUid: owner, createdAt: NOW });
    await setDoc(doc(db, 'orgs', org, 'data', 'orgDriver'), { value: '{}', updatedAt: NOW });
    i++;
  }
});

console.log('════ 같은 소유자 문서에 — 규칙 vs lib/period.js');
const table = {};
let i = 0, same = true;
for (const name of Object.keys(CASES)) {
  const org = orgOf(i);
  const d = env.authenticatedContext(drvOf(i), { driver: true, org: org, carId: 'car1' }).firestore();
  let ruleOk;
  try { await assertSucceeds(getDoc(doc(d, 'orgs', org, 'data', 'orgDriver'))); ruleOk = true; }
  catch (e) { ruleOk = false; }
  const libOk = isAliveUser(CASES[name], NOW);
  table[name] = { '규칙(진짜)': ruleOk ? '통과' : '거부', 'lib/period': libOk ? '통과' : '거부' };
  if (ruleOk !== libOk) same = false;
  chk((libOk ? '허용' : '거부') + '  ' + name, ruleOk === libOk,
      '규칙 ' + (ruleOk ? '통과' : '거부') + ' · lib ' + (libOk ? '통과' : '거부'));
  i++;
}
console.log('\n' + JSON.stringify(table, null, 1));
chk('★ 실제 규칙과 lib/period.js 가 **모든 경우에 같다**', same);

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
  : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
