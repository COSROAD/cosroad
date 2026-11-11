/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* 코스로드72-B(v315) 규칙 — **`users/{uid}` 를 「그 칸만」 고쳐도 규칙이 통과하나**,
   그리고 **서버가 쓴 `paidUntil` 이 남나**.
   ★★ 왜 재나 — v314 까지 앱은 두 곳에서 `users/{uid}` 를 **통째로(setDoc)** 썼다
     (탈퇴 `doWithdraw` · 테스트 출입 `masterTestAccessGo`). 그 문서는 **서버도 쓴다**
     (승인·연장·기간 → `paidUntil`·`trialEnd`·`contractMonths`·`paidAt`).
     폰이 읽어 둔 사본으로 통째로 되쓰면 **그 사이 서버가 찍은 기간이 지워진다**
     — 기간이 지워지면 규칙 `isMyOrgActive` 가 거짓이 되어 **업체가 바로 읽기 전용**이 된다.
   ★ 규칙 파일은 **한 줄도 안 바꿨다** — 이 묶음은 「안 바꿔도 되는가」를 끝까지 잰다.
     `updateDoc` 은 `request.resource.data` 가 **합쳐진 문서**라 `orgId` 대조와
     `affectedKeys()` 가 종전과 같은 뜻으로 돈다(그 전제를 아래 ①②가 못 박는다). */
import fs from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteField } from 'firebase/firestore';

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

const ORG = 'academy_acme', OWNER = 'uOwner', OTHER = 'uOther', MASTER = 'uMaster';
const PEND = 'uPend';                  /* 승인 대기 — 「값이 같은 쓰기」와 섞이지 않게 따로 둔다 */
const now = Date.now(), DAY = 86400000;
const PAID0 = now + 10 * DAY;          /* 승인 때 넣은 기간 */
const PAID1 = now + 400 * DAY;         /* 서버가 **그 뒤에** 연장한 기간 */

const env = await initializeTestEnvironment({
  projectId: 'cos-72', firestore: { host: '127.0.0.1', port: 8988, rules: RULES }
});
await env.clearFirestore();            /* ★ 묶음마다 비운다 — 안 비우면 create 가 update 가 된다(t68 교훈) */
const seed = async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'admins', MASTER), { role: 'master' });
    await setDoc(doc(db, 'users', OWNER), {
      orgId: ORG, bizType: 'academy', approved: true, status: 'active', plan: 'paid',
      withdrawn: false, paidUntil: PAID0, trialEnd: PAID0, contractMonths: 6, paidAt: now,
      name: '가온학원', phone: '010-1111-2222'
    });
    await setDoc(doc(db, 'users', PEND), {
      orgId: 'academy_pend', bizType: 'academy', approved: false, status: 'pending', withdrawn: false
    });
    await setDoc(doc(db, 'users', OTHER), {
      orgId: 'academy_other', bizType: 'academy', approved: true, status: 'active',
      withdrawn: false, paidUntil: PAID0
    });
  });
};
await seed();
const srvWrite = async (obj) => {      /* 서버(Admin SDK)는 규칙을 안 거친다 — 그 자리를 흉내 낸다 */
  await env.withSecurityRulesDisabled(async (c) => {
    await updateDoc(doc(c.firestore(), 'users', OWNER), obj);
  });
};
const srvRead = async () => {
  let d = null;
  await env.withSecurityRulesDisabled(async (c) => {
    d = (await getDoc(doc(c.firestore(), 'users', OWNER))).data();
  });
  return d;
};
const asOwner = () => env.authenticatedContext(OWNER, {}).firestore();
const asMaster = () => env.authenticatedContext(MASTER, {}).firestore();

console.log('════ ① 탈퇴 — 본인이 **두 칸만** 고친다 (`doWithdraw`)');
{
  await t('본인 → withdrawn·withdrawnAt 만 updateDoc', 'allow',
    () => updateDoc(doc(asOwner(), 'users', OWNER), { withdrawn: true, withdrawnAt: now }),
    'self.withdraw.fieldsOnly');
  const d = await srvRead();
  ck('  표시가 찍혔다', String(d.withdrawn), 'true');
  ck('★ 서버가 넣은 `paidUntil` 이 **남았다**', String(d.paidUntil), String(PAID0));
  ck('  기간 네 칸 모두 남았다',
    [d.paidUntil, d.trialEnd, d.contractMonths, d.paidAt].join(','),
    [PAID0, PAID0, 6, now].join(','));
  ck('  승인 값도 그대로', String(d.approved) + '/' + d.status + '/' + d.plan, 'true/active/paid');
}

console.log('\n② 테스트 출입 — 마스터가 **그 칸만** (`masterTestAccessGo`)');
await env.clearFirestore(); await seed();
{
  await t('마스터 → testAccess 켜기(updateDoc)', 'allow',
    () => updateDoc(doc(asMaster(), 'users', OWNER), { testAccess: true }), 'master.testAccess.on');
  ck('  켜졌다', String((await srvRead()).testAccess), 'true');
  await t('마스터 → testAccess 끄기(deleteField)', 'allow',
    () => updateDoc(doc(asMaster(), 'users', OWNER), { testAccess: deleteField() }),
    'master.testAccess.off');
  const d = await srvRead();
  ck('  칸이 없어졌다', String(d.testAccess === undefined), 'true');
  ck('★ 기간도 그대로', String(d.paidUntil), String(PAID0));
}

console.log('\n③ ★★ 서버가 **그 사이에** 기간을 연장했을 때 — 「그 칸만」이면 안 지워진다');
await env.clearFirestore(); await seed();
{
  /* 앱이 문서를 읽는다(옛 판은 이 사본으로 통째로 되썼다) */
  const stale = await srvRead();
  ck('  앱이 읽은 기간(옛 값)', String(stale.paidUntil), String(PAID0));
  await srvWrite({ paidUntil: PAID1, contractMonths: 12 });      /* 마스터가 서버로 연장 */
  /* 지금 판 — 두 칸만 고친다 */
  await t('본인 → 탈퇴 두 칸만', 'allow',
    () => updateDoc(doc(asOwner(), 'users', OWNER), { withdrawn: true, withdrawnAt: now }),
    'race.fieldsOnly');
  const d = await srvRead();
  ck('★ 새 기간이 **살아 있다**', String(d.paidUntil), String(PAID1));
  ck('  계약 개월수도', String(d.contractMonths), '12');
}

/* ★★ 여기서 알게 된 것 — 옛 판(통째로 setDoc)은 **값을 지우지 못한다. 쓰기 자체가 거부된다.**
   보호 목록(`paidUntil`·`contractMonths` …)이 `affectedKeys()` 에 들어가기 때문이다.
   즉 피해는 「기간이 지워진다」가 아니라 **「탈퇴·테스트 출입이 실패한다」**다.
   (옛 `doWithdraw`·`masterTestAccessGo` 는 읽고 바로 썼으니 겹침 창이 밀리초였다 —
    그래서 평소에는 통과했다. 아래 두 줄이 그 둘을 나란히 잰다.) */
console.log('\n④ ★ 대조 — **옛 판처럼 통째로** 쓰면 겹쳤을 때 **거부된다**');
await env.clearFirestore(); await seed();
{
  const stale = await srvRead();                 /* 앱이 읽어 둔 사본 */
  await srvWrite({ paidUntil: PAID1, contractMonths: 12 });
  const rec = Object.assign({}, stale);          /* 옛 `doWithdraw` 가 하던 일 그대로 */
  rec.withdrawn = true; rec.withdrawnAt = now;
  await t('[옛] 본인 → 문서 통째로 setDoc (서버가 그 사이 기간을 고쳤다)', 'deny',
    () => setDoc(doc(asOwner(), 'users', OWNER), rec), 'old.wholeDoc.race');
  const d = await srvRead();
  ck('  그래서 탈퇴 표시가 **안 찍혔다**', String(d.withdrawn), 'false');
  ck('  새 기간은 그대로다(지워지지는 않았다)', String(d.paidUntil), String(PAID1));
}
await env.clearFirestore(); await seed();
{
  const stale = await srvRead();
  const rec = Object.assign({}, stale);          /* 겹치지 않았을 때 — 평소 */
  rec.withdrawn = true; rec.withdrawnAt = now;
  await t('[옛] 겹치지 않으면 통째로도 통과했다(그래서 평소엔 됐다)', 'allow',
    () => setDoc(doc(asOwner(), 'users', OWNER), rec), 'old.wholeDoc.calm');
}

console.log('\n⑤ 막아야 할 것은 그대로 막힌다 (구멍을 내지 않았다)');
await env.clearFirestore(); await seed();
{
  await t('본인 → `paidUntil` 고치기', 'deny',
    () => updateDoc(doc(asOwner(), 'users', OWNER), { paidUntil: now + 3650 * DAY }), 'self.paidUntil');
  await t('본인 → `testAccess` 켜기', 'deny',
    () => updateDoc(doc(asOwner(), 'users', OWNER), { testAccess: true }), 'self.testAccess');
  /* ★ 「값이 같은 쓰기」는 `affectedKeys()` 가 비어 통과한다 — 그래서 **승인 대기 계정**으로 잰다
     (승인된 계정에 `approved:true` 를 또 쓰면 바뀐 칸이 없어 허용된다 · 그것은 구멍이 아니다). */
  await t('승인 대기 본인 → `approved` 찍기', 'deny',
    () => updateDoc(doc(env.authenticatedContext(PEND, {}).firestore(), 'users', PEND),
      { approved: true, status: 'active' }), 'self.approved');
  await t('본인 → `orgId` 바꾸기', 'deny',
    () => updateDoc(doc(asOwner(), 'users', OWNER), { orgId: 'academy_other' }), 'self.orgId');
  await t('본인 → **남의 문서** 두 칸만', 'deny',
    () => updateDoc(doc(asOwner(), 'users', OTHER), { withdrawn: true, withdrawnAt: now }), 'self.other');
  await t('마스터 → `paidUntil` 고치기(돈이 걸린 값은 서버만)', 'deny',
    () => updateDoc(doc(asMaster(), 'users', OWNER), { paidUntil: now + 3650 * DAY }), 'master.paidUntil');
  await t('마스터 → testAccess + 다른 칸 같이', 'deny',
    () => updateDoc(doc(asMaster(), 'users', OWNER), { testAccess: true, plan: 'trial' }), 'master.testAccessPlus');
}

console.log('\n⑥ 규칙 파일은 **한 줄도 안 바뀌었다**');
{
  ck('규칙 줄 수(632줄 + 끝 줄바꿈)', RULES.split(String.fromCharCode(10)).length, 633);
  ck('`users` 보호 목록 그대로(21개)',
    ((RULES.match(/hasAny\(\['approved'[\s\S]*?\]\)/) || [''])[0].match(/'/g) || []).length / 2, 21);
  ck('마스터 화면 쓰기는 `testAccess` 하나',
    /hasOnly\(\['testAccess'\]\)/.test(RULES), true);
}

fs.writeFileSync('t72_table.json', JSON.stringify(table, null, 1));
console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과') + '  (표: t72_table.json)');
await env.cleanup();
process.exit(fail ? 1 : 0);
