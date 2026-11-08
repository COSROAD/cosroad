/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v272 — 기사 읽기: notices 빼기 · org → orgDriver
   ★ 대조 먼저 — **옛 규칙(v271)에서는 기사가 notices·org 를 읽을 수 있었다**는 것을 보인 뒤
     새 규칙에서 막히는 것을 본다. 안 그러면 「막힌다」가 새 규칙 덕인지 알 수 없다. */
import fs from 'fs';
import cp from 'node:child_process';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';
/* ★ v274: 규칙을 **이 회차 커밋에 고정**한다 — v272(`435774d`).
   전에는 이 폴더의 사본(= **지금** 규칙)을 읽었다. 그래서 뒤 회차가 규칙을 고치면
   이 회차의 기대값이 거짓으로 깨졌다 — v274 가 기사 읽기 키를 9→6 으로 줄이고
   `carData` 블록을 더하자 한꺼번에 터졌다. v272 가 틀린 것이 아니다.
   **지금** 규칙은 t274.mjs 가 본다 — 그쪽이 진짜다. */
const _RULES_REF = process.env.COS_RULES_REF || '435774d';
const _PINNED_RULES = (await import('child_process')).execSync(
  'git -C ' + COS_ROOT + ' show ' + _RULES_REF + ':firestore.rules',
  { maxBuffer: 1 << 26 }).toString()
  .split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));


const NEW_RULES = _PINNED_RULES;
const OLD_REF = process.env.COS_RULES_OLD_REF || '5480189';
const OLD_RULES = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':firestore.rules',
  { maxBuffer: 1 << 26 }).toString();

let pass = 0, fail = 0;
async function t(label, want, fn) {
  try {
    if (want === 'allow') await assertSucceeds(fn()); else await assertFails(fn());
    pass++; console.log('  ' + (want === 'allow' ? '✔ 허용' : '✔ 거부') + '  ' + label);
  } catch (e) { fail++; console.log('  ' + (want === 'allow' ? '✘ 허용기대→거부' : '✘ 거부기대→허용') + '  ' + label); }
}
const chk = (label, cond, got) => {
  if (cond) { pass++; console.log('  ✔ ' + label + (got !== undefined ? '  ' + got : '')); }
  else { fail++; console.log('  ✘ ' + label + (got !== undefined ? '  ' + got : '')); }
};

const DAY = 86400000, now = Date.now();
const MASTER = 'MasterUid00000000000000000001';
const OWNER  = 'LiveOwner000000000000000002';
const ORG    = 'academy_' + OWNER.slice(0, 12);
const DRV    = 'drv_' + ORG + '_car1';
const DEMO   = 'academy_demo';
const EXPIRED = 'ExpOwner0000000000000000003';
const ORG_EXP = 'academy_' + EXPIRED.slice(0, 12);
const DRV_EXP = 'drv_' + ORG_EXP + '_car1';

const owner = (uid, over) => Object.assign({
  bizType: 'academy', orgName: '업체', orgId: 'academy_' + uid.slice(0, 12), phone: '01012345678',
  signupMethod: 'phone', status: 'active', approved: true, plan: 'paid',
  paidAt: now - 10 * DAY, trialEnd: now + 20 * DAY, paidUntil: now + 100 * DAY,
  contractMonths: 6, createdAt: now - 30 * DAY, bizNo: '2118811430'
}, over || {});

const KEYS = ['members', 'cars', 'courses', 'rideState', 'carlog',
              'deliveryDone', 'dropoffDone', 'driverAtt', 'orgDriver',
              'org', 'notices', 'payments', 'tax', 'staff', 'driverPay'];

async function makeEnv(projectId, rules) {
  const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8988, rules } });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'admins', MASTER), { role: 'master' });
    await setDoc(doc(db, 'users', OWNER), owner(OWNER));
    await setDoc(doc(db, 'users', EXPIRED), owner(EXPIRED, { paidUntil: now - DAY, plan: 'expired' }));
    await setDoc(doc(db, 'orgs', ORG, 'drivers', DRV), { carId: 'car1', ownerUid: OWNER, createdAt: now });
    await setDoc(doc(db, 'orgs', ORG_EXP, 'drivers', DRV_EXP), { carId: 'car1', ownerUid: EXPIRED, createdAt: now });
    for (const o of [ORG, ORG_EXP, DEMO]) {
      for (const k of KEYS) await setDoc(doc(db, 'orgs', o, 'data', k), { value: '[]', updatedAt: now });
    }
  });
  return env;
}
/* 기사 토큰 — api/driver-auth.js 가 넣는 claim 그대로 */
const drv = (env, uid, org) => env.authenticatedContext(uid, {
  driver: true, org: org, carId: 'car1', firebase: { sign_in_provider: 'custom' } }).firestore();
const adm = (env, uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();

/* ══ 대조 — 옛 규칙(v271)에서는 어땠나 ═══════════════════════════════════ */
console.log('① 대조 — 옛 규칙(' + OLD_REF + ')에서 기사가 읽을 수 있었나');
{
  const env = await makeEnv('cos-v272-old', OLD_RULES);
  await t('[옛] 기사 → notices 읽기 (= 알림장이 내려왔다)', 'allow',
    () => getDoc(doc(drv(env, DRV, ORG), 'orgs', ORG, 'data', 'notices')));
  await t('[옛] 기사 → org 읽기 (= 계좌·도장이 내려왔다)', 'allow',
    () => getDoc(doc(drv(env, DRV, ORG), 'orgs', ORG, 'data', 'org')));
  await t('[옛] 기사 → orgDriver 읽기 (그때는 그 키가 목록에 없었다)', 'deny',
    () => getDoc(doc(drv(env, DRV, ORG), 'orgs', ORG, 'data', 'orgDriver')));
  const old = OLD_RULES.slice(OLD_RULES.indexOf('function driverReadableKey'),
                              OLD_RULES.indexOf('function driverReadableKey') + 300);
  chk('[옛] 목록에 notices·org 가 있었다', /'notices'/.test(old) && /'org'/.test(old));
  await env.cleanup();
}

/* ══ 새 규칙 ════════════════════════════════════════════════════════════ */
console.log('\n② 새 규칙 — 기사');
const env = await makeEnv('cos-v272-new', NEW_RULES);
{
  const d = drv(env, DRV, ORG);
  await t('기사 → notices 읽기', 'deny', () => getDoc(doc(d, 'orgs', ORG, 'data', 'notices')));
  await t('기사 → org 읽기', 'deny', () => getDoc(doc(d, 'orgs', ORG, 'data', 'org')));
  await t('기사 → orgDriver 읽기', 'allow', () => getDoc(doc(d, 'orgs', ORG, 'data', 'orgDriver')));
  await t('기사 → orgDriver **쓰기**', 'deny',
    () => setDoc(doc(d, 'orgs', ORG, 'data', 'orgDriver'), { value: '{}' }));
  await t('기사 → notices 쓰기', 'deny', () => setDoc(doc(d, 'orgs', ORG, 'data', 'notices'), { value: '[]' }));
  await t('기사 → org 쓰기', 'deny', () => setDoc(doc(d, 'orgs', ORG, 'data', 'org'), { value: '{}' }));
  /* 남은 여덟 키는 그대로 읽힌다 */
  for (const k of ['members', 'cars', 'courses', 'rideState', 'carlog', 'deliveryDone', 'dropoffDone', 'driverAtt']) {
    await t('기사 → ' + k + ' 읽기 (그대로)', 'allow', () => getDoc(doc(d, 'orgs', ORG, 'data', k)));
  }
  /* 막혀 있던 것은 그대로 막힌다 */
  for (const k of ['payments', 'tax', 'staff', 'driverPay']) {
    await t('기사 → ' + k + ' 읽기 (그대로 거부)', 'deny', () => getDoc(doc(d, 'orgs', ORG, 'data', k)));
  }
  /* 쓰기 네 키는 그대로 */
  for (const k of ['carlog', 'deliveryDone', 'dropoffDone', 'rideState']) {
    await t('기사 → ' + k + ' 쓰기 (그대로)', 'allow',
      () => setDoc(doc(d, 'orgs', ORG, 'data', k), { value: '[]', updatedAt: now }));
  }
}

console.log('\n③ 새 규칙 — 관리자·소유자는 셋 다 된다');
{
  const a = adm(env, OWNER);
  for (const k of ['org', 'orgDriver', 'notices']) {
    await t('소유자 → ' + k + ' 읽기', 'allow', () => getDoc(doc(a, 'orgs', ORG, 'data', k)));
    await t('소유자 → ' + k + ' 쓰기', 'allow',
      () => setDoc(doc(a, 'orgs', ORG, 'data', k), { value: '{}', updatedAt: now }));
  }
  /* ★ 마스터는 남의 업체 자료를 **읽지 않는다**(v263 에서 testAccess 하나로 좁혔다).
     그래서 거부가 맞다. orgDriver 가 **org 와 같은 대우**인지(새 키가 구멍이 되지 않았는지)를 본다. */
  const m = adm(env, MASTER);
  await t('마스터 → orgDriver 읽기 (거부 — org 와 같은 대우)', 'deny',
    () => getDoc(doc(m, 'orgs', ORG, 'data', 'orgDriver')));
  await t('  (대조) 마스터 → org 읽기도 거부', 'deny',
    () => getDoc(doc(m, 'orgs', ORG, 'data', 'org')));
}

console.log('\n④ 만료 업체·둘러보기는 기존대로');
{
  const de = drv(env, DRV_EXP, ORG_EXP);
  await t('만료 업체 기사 → orgDriver 읽기 (거부)', 'deny',
    () => getDoc(doc(de, 'orgs', ORG_EXP, 'data', 'orgDriver')));
  await t('만료 업체 기사 → members 읽기 (거부)', 'deny',
    () => getDoc(doc(de, 'orgs', ORG_EXP, 'data', 'members')));
  const anon = env.authenticatedContext('A1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  await t('둘러보기 orgDriver 읽기 (누구나 — 기존대로)', 'allow',
    () => getDoc(doc(anon, 'orgs', DEMO, 'data', 'orgDriver')));
  await t('둘러보기 orgDriver 쓰기 (거부 — 읽기 전용)', 'deny',
    () => setDoc(doc(anon, 'orgs', DEMO, 'data', 'orgDriver'), { value: '{}' }));
  await t('남의 업체 orgDriver 읽기 (거부)', 'deny',
    () => getDoc(doc(adm(env, EXPIRED), 'orgs', ORG, 'data', 'orgDriver')));
}

console.log('\n⑤ 규칙 파일 자체 — 목록이 둘 다 맞나');
{
  const blk = NEW_RULES.slice(NEW_RULES.indexOf('function driverReadableKey'),
                              NEW_RULES.indexOf('function driverWritableKey') + 200);
  const rd = NEW_RULES.slice(NEW_RULES.indexOf('function driverReadableKey'),
                             NEW_RULES.indexOf('}', NEW_RULES.indexOf('function driverReadableKey')));
  chk('규칙 목록에 notices 없음', !/'notices'/.test(rd));
  chk('규칙 목록에 org 없음(orgDriver 만)', !/'org'[,\]]/.test(rd) && /'orgDriver'/.test(rd));
  chk('규칙 목록 9개', (rd.match(/'[a-zA-Z]+'/g) || []).length === 9,
      (rd.match(/'[a-zA-Z]+'/g) || []).join(','));
  /* 앱 목록과 같은가 — 두 곳을 같이 고쳤는지 */
  /* ★ v274: 앱도 **그 회차 커밋에서** 읽는다 — 일하는 폴더를 읽으면 뒤 회차(v274 가
     members·cars·courses 를 뺀 것)와 어긋나 「같은 목록」이 거짓으로 깨진다. */
  const app = cp.execSync('git -C ' + COS_ROOT + ' show ' + _RULES_REF + ':index.html',
    { maxBuffer: 1 << 28 }).toString();
  const ai = app.indexOf('var DRIVER_READ_KEYS');
  const appList = app.slice(ai, app.indexOf('];', ai)).match(/'[a-zA-Z]+'/g) || [];
  const rulList = rd.match(/'[a-zA-Z]+'/g) || [];
  chk('앱 DRIVER_READ_KEYS 와 **같은 목록**',
      appList.slice().sort().join(',') === rulList.slice().sort().join(','),
      appList.join(','));
  /* ★ v275: 끝쪽도 **그 회차 커밋**으로 못 박는다 — 작업트리와 견주면 뒤 회차가 규칙을
     고칠 때마다 이 숫자가 달라져 거짓 실패가 난다(v275 에서 67/5 가 되어 실제로 겪었다). */
  const st = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + OLD_REF + ' '
    + (_RULES_REF || '') + ' -- firestore.rules').toString().trim();
  /* ★ 이 폴더의 firestore.rules 는 저장소 것의 **사본**이다(에뮬레이터 설정이 여기를 본다).
     복사를 잊으면 **옛 규칙**을 시험해 「통과」가 거짓이 된다 — v272 에서 실제로 겪었다.
     그래서 같은지 여기서 확인한다(runall264.sh 맨 앞에서도 매번 복사한다). */
  /* ★ v271 보정1: **줄끝을 뺀 알맹이**로 견준다.
     사본은 LF 로 맞춰 받고(runall264.sh) 저장소 작업트리는 autocrlf 로 CRLF 라
     글자 그대로는 절대 같아지지 않는다. 배포되는 blob 은 LF 이므로 LF 가 기준이다. */
  const lf = (s) => String(s).split('\r\n').join('\n');
  const REPO_RULES = cp.execSync('git -C ' + COS_ROOT + ' show ' + _RULES_REF + ':firestore.rules',
    { maxBuffer: 1 << 26 }).toString();
  chk('시험한 규칙이 그 회차 커밋 것과 같다 (줄끝 빼고)', lf(NEW_RULES) === lf(REPO_RULES));
  /* 지운 줄 2 = **목록 두 줄을 고친 것**이다(키를 빼고 바꿨으니 당연). 숫자를 적어 둔다. */
  chk('규칙 diff — 더한 줄만 많고 지운 줄은 목록 두 줄', /^\d+\t2\t/.test(st), st);
}

await env.cleanup();
console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
