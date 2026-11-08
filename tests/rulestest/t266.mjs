/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v266 — sendRl (문자·알림톡 빈도 기록) 규칙
   ★ 대조 먼저: 옛 규칙(a542802)에는 이 자리가 없어 기본 거부다. 그래서 「막힌다」만으로는
     새 규칙이 일하는지 알 수 없다 — **옛 판·새 판 둘 다 막히는 것**과, 새 판이
     v265 자리를 하나도 안 건드렸다는 것을 함께 본다. */
import fs from 'fs';
import cp from 'node:child_process';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

/* ★ v272: 이 뮶은 **v266 회차 기록**이다 — 새 죽도 그 회차 커밋에 고정한다.
   지금 까지는 `firestore.rules`(지금 규시기)를 읽었다. 그래서 아래
   「지운 줄이 없다」가 뒤 회차가 한 줄이라도 지우면 깨졌다
   (v272 는 기사 읽기 목록 두 줄을 고치면서 **지운 줄 2**가 나왔다).
   v266 가 「더하기만 했다」는 그 회차의 참말이고, 그대로 남아야 한다.
   **지금** 규칙은 t272.mjs 가 본다. */
const PIN_REF = process.env.COS_RULES_REF || 'f9847fe';
const NEW_RULES = cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN_REF + ':firestore.rules',
  { maxBuffer: 1 << 26 }).toString();
const OLD_RULES = cp.execSync('git -C ' + COS_ROOT + ' show a542802:firestore.rules', { maxBuffer: 1 << 26 }).toString();

let pass = 0, fail = 0;
async function t(label, want, fn) {
  try {
    if (want === 'allow') await assertSucceeds(fn()); else await assertFails(fn());
    pass++; console.log('  ' + (want === 'allow' ? '✔ 허용' : '✔ 거부') + '  ' + label);
  } catch (e) { fail++; console.log('  ' + (want === 'allow' ? '✘ 허용기대→거부' : '✘ 거부기대→허용') + '  ' + label); }
}
const chk = (label, cond) => { if (cond) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✘ ' + label); } };

const DAY = 86400000, now = Date.now();
const MASTER = 'MasterUid00000000000000000001';
const LIVE   = 'LiveOwner000000000000000002';
const ORG = (u) => 'academy_' + u.slice(0, 12);
const RL_ID = 'org.' + 'a'.repeat(64);

function owner(uid, over) {
  return Object.assign({
    bizType: 'academy', orgName: '업체', orgId: ORG(uid), phone: '01012345678',
    signupMethod: 'phone', status: 'active', approved: true, plan: 'paid',
    paidAt: now - 10 * DAY, trialEnd: now + 20 * DAY, paidUntil: now + 100 * DAY,
    contractMonths: 6, createdAt: now - 30 * DAY, bizNo: '2118811430'
  }, over || {});
}
async function makeEnv(projectId, rules) {
  const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8988, rules } });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'admins', MASTER), { role: 'master' });
    await setDoc(doc(db, 'users', LIVE), owner(LIVE));
    await setDoc(doc(db, 'sendRl', RL_ID), { at: [{ t: now, n: 3 }], updatedAt: now });
  });
  return env;
}
const ctx = (env, uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const anon = (env) => env.unauthenticatedContext().firestore();

console.log('════ 0. 대조 (옛 규칙 a542802 · 561줄) ════');
{
  const env = await makeEnv('cos-v266-old', OLD_RULES);
  chk('[옛] 규칙 글에 sendRl 이 없다', !/sendRl/.test(OLD_RULES));
  await t('[옛] 마스터도 읽지 못한다 (기본 거부)', 'deny', () => getDoc(doc(ctx(env, MASTER), 'sendRl', RL_ID)));
  await env.cleanup();
}

console.log('\n════ 1. 새 규칙 (sendRl) — 아무도 못 본다 ════');
const env = await makeEnv('cos-v266-new', NEW_RULES);
{
  await t('마스터 → 읽기 ✘ (상한 기록은 볼 이유가 없다)', 'deny', () => getDoc(doc(ctx(env, MASTER), 'sendRl', RL_ID)));
  await t('업체 → 읽기 ✘', 'deny', () => getDoc(doc(ctx(env, LIVE), 'sendRl', RL_ID)));
  await t('로그인 안 함 → 읽기 ✘', 'deny', () => getDoc(doc(anon(env), 'sendRl', RL_ID)));
  await t('목록 읽기 ✘', 'deny', () => getDocs(collection(ctx(env, MASTER), 'sendRl')));
  await t('마스터 → 새로 만들기 ✘', 'deny', () => setDoc(doc(ctx(env, MASTER), 'sendRl', 'x'), { at: [] }));
  await t('업체 → 고치기 ✘', 'deny', () => updateDoc(doc(ctx(env, LIVE), 'sendRl', RL_ID), { at: [] }));
  await t('업체 → **지우기 ✘** (지우면 상한이 공짜가 된다)', 'deny', () => deleteDoc(doc(ctx(env, LIVE), 'sendRl', RL_ID)));
  await t('마스터 → 지우기 ✘', 'deny', () => deleteDoc(doc(ctx(env, MASTER), 'sendRl', RL_ID)));
  await t('로그인 안 함 → 쓰기 ✘', 'deny', () => setDoc(doc(anon(env), 'sendRl', 'y'), { at: [] }));
}

console.log('\n════ 2. v265 자리는 그대로 ════');
{
  await t('활성 업체 → 자기 자료 쓰기', 'allow',
    () => setDoc(doc(ctx(env, LIVE), 'orgs', ORG(LIVE), 'data', 'members'), { value: '[]', updatedAt: 2 }));
  await t('bizFirstPay — 마스터 읽기', 'allow', () => getDoc(doc(ctx(env, MASTER), 'bizFirstPay', 'z')));
  await t('bizFirstPay — 업체 읽기 ✘', 'deny', () => getDoc(doc(ctx(env, LIVE), 'bizFirstPay', 'z')));
  await t('billingLog — 마스터 읽기', 'allow', () => getDocs(collection(ctx(env, MASTER), 'billingLog', LIVE, 'items')));
}

console.log('\n════ 3. 규칙 글 ════');
{
  chk('sendRl 블록이 있다', /match \/sendRl\/\{id\} \{\s*\n\s*allow read, write: if false;/.test(NEW_RULES));
  chk('(대조) 옛 규칙에는 없었다', !/match \/sendRl/.test(OLD_RULES));
  const diff = cp.execSync('git -C ' + COS_ROOT + ' diff a542802 ' + PIN_REF + ' -- firestore.rules').toString();
  const added = (diff.match(/^\+[^+]/mg) || []).length;
  const removed = (diff.match(/^-[^-]/mg) || []).length;
  chk('옛 판에서 **지운 줄이 없다**', removed === 0);
  console.log('  더한 줄 ' + added + ' · 지운 줄 ' + removed);
  const n = (s) => s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
  console.log('  규칙 줄 수: ' + n(OLD_RULES) + ' → ' + n(NEW_RULES) + ' (재게시용)');
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건' : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
