/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* 코스로드60-B4a(v296) 규칙 — **`memberPins` 가 「규칙 없음 = 거부」인지** 실제 규칙으로 확인한다.
   ★★ 왜 재나 — «회원» PIN 해시를 담는 새 컬렉션인데 **규칙 파일에 한 줄도 안 넣었다**.
     Firestore 는 「맞는 규칙이 없으면 거부」이고 `staffPins`(v280)도 같은 방식이다.
     그 전제가 맞는지 **코드가 아니라 에뮬레이터로** 못 박는다(「0건」은 대조 뒤에만 — 아래 ⑤).
   ★ 규칙 파일은 **한 줄도 안 바꿨다** — 그래서 이 묶음이 하는 일은
     「안 넣어도 되는가」를 끝까지 재는 것이다. */
import fs from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

const lf = (s) => String(s).split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));
const RULES = lf(fs.readFileSync('firestore.rules', 'utf8'));

let pass = 0, fail = 0;
const table = {};
async function t(label, want, fn, key) {
  let got;
  try { await (want === 'allow' ? assertSucceeds(fn()) : assertFails(fn())); got = want; }
  catch (e) { got = (want === 'allow' ? 'deny' : 'allow'); }
  if (key) table[key] = got;
  if (got === want) { pass++; console.log('  ✔ ' + (want === 'allow' ? '허용' : '거부') + '  ' + label); }
  else { fail++; console.log('  ✘ ' + (want === 'allow' ? '허용기대→거부' : '거부기대→허용') + '  ' + label); }
}
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) { pass++; console.log('  ✔ ' + label + '   ' + got); }
  else { fail++; console.log('  ✘ ' + label + '   ' + got + '   (기대 ' + want + ')'); }
};

const ORG = 'cosroad_acme', OWNER = 'cosroad_acme';
const DRV = 'drv_cosroad_acme_car1', HLP = 'hlp_cosroad_acme_st1', KSK = 'ksk_cosroad_acme';
const now = Date.now(), DAY = 86400000;
const MP = ORG + '_1';

const env = await initializeTestEnvironment({
  projectId: 'cos-296', firestore: { host: '127.0.0.1', port: 8988, rules: RULES }
});
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'users', OWNER), { orgId: ORG, bizType: 'academy', approved: true,
    withdrawn: false, paidUntil: now + 30 * DAY, plan: 'paid' });
  await setDoc(doc(db, 'users', DRV), { role: 'driver', driverOrg: ORG, ownerUid: OWNER, carId: 'car1' });
  await setDoc(doc(db, 'users', HLP), { role: 'helper', driverOrg: ORG, ownerUid: OWNER, staffId: 'st1' });
  await setDoc(doc(db, 'orgs', ORG, 'drivers', DRV), { carId: 'car1', ownerUid: OWNER, createdAt: now });
  await setDoc(doc(db, 'orgs', ORG, 'drivers', HLP), { role: 'helper', staffId: 'st1', carId: 'car1', ownerUid: OWNER });
  await setDoc(doc(db, 'orgs', ORG, 'data', 'members'), { value: '[]', updatedAt: now });
  /* 서버(Admin SDK)가 만든 PIN 해시 — 사람은 이것을 못 봐야 한다 */
  await setDoc(doc(db, 'memberPins', MP), { org: ORG, memberId: '1', pinHash: 'HASH', updatedAt: now });
  await setDoc(doc(db, 'staffPins', ORG + '_st1'), { org: ORG, staffId: 'st1', pinHash: 'HASH', updatedAt: now });
});

const asOwner = () => env.authenticatedContext(OWNER, {}).firestore();
const asDrv = () => env.authenticatedContext(DRV, { driver: true, org: ORG, carId: 'car1' }).firestore();
const asHelper = () => env.authenticatedContext(HLP, { helper: true, org: ORG, staffId: 'st1' }).firestore();
/* 60-B4b 의 출석 기기 토큰(미리 재 둔다 — 그 회차에서 규칙을 안 바꿀 수 있는지) */
const asKiosk = () => env.authenticatedContext(KSK, { kiosk: true, org: ORG }).firestore();
const asAnon = () => env.unauthenticatedContext().firestore();

console.log('════ ① `memberPins` — 누구도 못 읽고 못 쓴다 (규칙 없음 = 거부)');
for (const [who, db] of [['업체 소유자', asOwner()], ['기사', asDrv()], ['도우미', asHelper()],
                         ['출석 기기', asKiosk()], ['로그인 안 함', asAnon()]]) {
  await t(who + ' → memberPins 읽기', 'deny', () => getDoc(doc(db, 'memberPins', MP)), 'memberPins.read.' + who);
  await t(who + ' → memberPins 쓰기', 'deny',
    () => setDoc(doc(db, 'memberPins', MP), { pinHash: 'X' }), 'memberPins.write.' + who);
  await t(who + ' → memberPins 목록', 'deny', () => getDocs(collection(db, 'memberPins')), 'memberPins.list.' + who);
  await t(who + ' → memberPins 지우기', 'deny', () => deleteDoc(doc(db, 'memberPins', MP)), 'memberPins.delete.' + who);
}

console.log('\n② 같은 방식인 `staffPins`(v280)도 거부 — 대조');
{
  const o = asOwner();
  await t('소유자 → staffPins 읽기', 'deny', () => getDoc(doc(o, 'staffPins', ORG + '_st1')), 'staffPins.read');
  await t('소유자 → staffPins 쓰기', 'deny',
    () => setDoc(doc(o, 'staffPins', ORG + '_st1'), { pinHash: 'X' }), 'staffPins.write');
}

console.log('\n③ ★ 대조 시험 — 같은 검사로 **허용도 잡히나** (검사가 살아 있나)');
{
  const o = asOwner();
  await t('소유자 → 자기 업체 data/members 읽기', 'allow',
    () => getDoc(doc(o, 'orgs', ORG, 'data', 'members')), 'contrast.ownerReadMembers');
}

console.log('\n④ 규칙 파일에 `memberPins` 가 **없다** (코드로도 확인)');
{
  ck('`memberPins` 글자 수', (RULES.match(/memberPins/g) || []).length, 0);
  ck('`staffPins` 도 없다(같은 방식)', (RULES.match(/staffPins/g) || []).length, 0);
  /* 632줄 파일 + 끝 줄바꿈 → 쪼개면 **633칸**(마지막은 빈 칸)이다 */
  ck('규칙 줄 수(바뀌지 않았다 · 632줄)', RULES.split(String.fromCharCode(10)).length, 633);
}

fs.writeFileSync('t296_table.json', JSON.stringify(table, null, 1));
console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과') + '  (표: t296_table.json)');
await env.cleanup();
process.exit(fail ? 1 : 0);
