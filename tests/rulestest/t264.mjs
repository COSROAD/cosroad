/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v264 — bizFirstPay (첫 결제 할인 1회) 규칙
   ★ 대조를 먼저: 옛 규칙(269231d, 561줄 전의 549줄)에서는 이 컬렉션이 **아예 없어**
     기본 거부에 걸린다. 그래서 「막힌다」만으로는 새 규칙이 일하는지 알 수 없다 —
     새 규칙에서 **마스터 읽기가 열리는지**를 함께 본다(그게 이번에 더한 길이다). */
import fs from 'fs';
import cp from 'node:child_process';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

/* ★ v272: 이 뮶은 **v264 회차 기록**이다 — 새 죽도 그 회차 커밋에 고정한다.
   지금 까지는 `firestore.rules`(지금 규시기)를 읽었다. 그래서 아래
   「지운 줄이 없다」가 뒤 회차가 한 줄이라도 지우면 깨졌다
   (v272 는 기사 읽기 목록 두 줄을 고치면서 **지운 줄 2**가 나왔다).
   v264 가 「더하기만 했다」는 그 회차의 참말이고, 그대로 남아야 한다.
   **지금** 규칙은 t272.mjs 가 본다. */
const PIN_REF = process.env.COS_RULES_REF || '18c90a7';
const NEW_RULES = cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN_REF + ':firestore.rules',
  { maxBuffer: 1 << 26 }).toString();
const OLD_RULES = cp.execSync('git -C ' + COS_ROOT + ' show 269231d:firestore.rules', { maxBuffer: 1 << 26 }).toString();

let pass = 0, fail = 0;
async function t(label, want, fn) {
  try {
    if (want === 'allow') await assertSucceeds(fn());
    else await assertFails(fn());
    pass++; console.log('  ' + (want === 'allow' ? '✔ 허용' : '✔ 거부') + '  ' + label);
  } catch (e) { fail++; console.log('  ' + (want === 'allow' ? '✘ 허용기대→거부' : '✘ 거부기대→허용') + '  ' + label); }
}
const chk = (label, cond) => { if (cond) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✘ ' + label); } };

const DAY = 86400000, now = Date.now();
const MASTER = 'MasterUid00000000000000000001';
const LIVE   = 'LiveOwner000000000000000002';
const OTHER  = 'OtherOwner00000000000000003';
const ORG = (u) => 'academy_' + u.slice(0, 12);
const BIZ_KEY = 'a'.repeat(64);          // sha256 자리 (서버가 넣는 꼴)

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
    await setDoc(doc(db, 'users', LIVE),  owner(LIVE));
    await setDoc(doc(db, 'users', OTHER), owner(OTHER));
    /* 서버(Admin SDK)가 찍어 둔 「받았음」 한 칸 */
    await setDoc(doc(db, 'bizFirstPay', BIZ_KEY),
                 { at: now - DAY, uid: LIVE, plan: 'promo6m', amount: 198000, months: 6 });
  });
  return env;
}
const ctx = (env, uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const anon = (env) => env.unauthenticatedContext().firestore();

/* ════════ 0. 대조 — 옛 규칙(269231d)에는 이 자리가 없다 ════════ */
console.log('════ 0. 대조 (옛 규칙 269231d · 549줄) ════');
{
  const env = await makeEnv('cos-v264-old', OLD_RULES);
  chk('[옛] 규칙 글에 bizFirstPay 가 없다', !/bizFirstPay/.test(OLD_RULES));
  await t('[옛] 마스터도 읽지 못한다 (기본 거부)', 'deny',
    () => getDoc(doc(ctx(env, MASTER), 'bizFirstPay', BIZ_KEY)));
  await t('[옛] 업체도 읽지 못한다', 'deny',
    () => getDoc(doc(ctx(env, LIVE), 'bizFirstPay', BIZ_KEY)));
  await env.cleanup();
}

/* ════════ 1. 새 규칙 ════════ */
console.log('\n════ 1. 새 규칙 (bizFirstPay) ════');
const env = await makeEnv('cos-v264-new', NEW_RULES);
{
  await t('마스터 → 읽기 (승인 창에서 「이미 받음」을 보여 준다)', 'allow',
    () => getDoc(doc(ctx(env, MASTER), 'bizFirstPay', BIZ_KEY)));
  await t('마스터 → 목록 읽기', 'allow',
    () => getDocs(collection(ctx(env, MASTER), 'bizFirstPay')));
  await t('업체(활성) → 읽기 ✘', 'deny',
    () => getDoc(doc(ctx(env, LIVE), 'bizFirstPay', BIZ_KEY)));
  await t('남의 업체 → 읽기 ✘', 'deny',
    () => getDoc(doc(ctx(env, OTHER), 'bizFirstPay', BIZ_KEY)));
  await t('로그인 안 함 → 읽기 ✘', 'deny',
    () => getDoc(doc(anon(env), 'bizFirstPay', BIZ_KEY)));

  /* 쓰기는 **아무도** 못 한다 — 마스터도 못 한다(지우고 다시 받는 길을 막는다) */
  await t('마스터 → 새로 만들기 ✘', 'deny',
    () => setDoc(doc(ctx(env, MASTER), 'bizFirstPay', 'b'.repeat(64)), { at: now }));
  await t('마스터 → 고치기 ✘', 'deny',
    () => updateDoc(doc(ctx(env, MASTER), 'bizFirstPay', BIZ_KEY), { plan: 'promo12m' }));
  await t('마스터 → 지우기 ✘ (지우면 할인을 또 받는다)', 'deny',
    () => deleteDoc(doc(ctx(env, MASTER), 'bizFirstPay', BIZ_KEY)));
  await t('업체 → 지우기 ✘', 'deny',
    () => deleteDoc(doc(ctx(env, LIVE), 'bizFirstPay', BIZ_KEY)));
  await t('업체 → 새로 만들기 ✘', 'deny',
    () => setDoc(doc(ctx(env, LIVE), 'bizFirstPay', 'c'.repeat(64)), { at: now }));
  await t('로그인 안 함 → 쓰기 ✘', 'deny',
    () => setDoc(doc(anon(env), 'bizFirstPay', 'd'.repeat(64)), { at: now }));
}

/* ════════ 2. 나머지는 그대로인가 (v263 자리 되짚기) ════════ */
console.log('\n════ 2. v263 자리는 그대로 ════');
{
  await t('billingLog — 마스터 읽기', 'allow',
    () => getDocs(collection(ctx(env, MASTER), 'billingLog', LIVE, 'items')));
  await t('billingLog — 업체 읽기 ✘', 'deny',
    () => getDocs(collection(ctx(env, LIVE), 'billingLog', LIVE, 'items')));
  await t('활성 업체 → 자기 자료 쓰기', 'allow',
    () => setDoc(doc(ctx(env, LIVE), 'orgs', ORG(LIVE), 'data', 'members'), { value: '{}', updatedAt: 2 }));
}

/* ════════ 3. 규칙 글 자체 ════════ */
console.log('\n════ 3. 규칙 글 ════');
{
  chk('bizFirstPay 블록이 있다',
    /match \/bizFirstPay\/\{id\} \{\s*\n\s*allow read:  if isAdmin\(\);\s*\n\s*allow write: if false;/.test(NEW_RULES));
  chk('(대조) 옛 규칙에는 없었다', !/match \/bizFirstPay/.test(OLD_RULES));
  chk('v263 자리는 그대로 — billingLog', /match \/billingLog\/\{uid\}\/items\/\{itemId\}/.test(NEW_RULES));
  chk('v263 자리는 그대로 — isMyOrgActive', /function isMyOrgActive\(orgId\)/.test(NEW_RULES));
  const diff = cp.execSync('git -C ' + COS_ROOT + ' diff 269231d ' + PIN_REF + ' -- firestore.rules').toString();
  const added = (diff.match(/^\+[^+]/mg) || []).length;
  const removed = (diff.match(/^-[^-]/mg) || []).length;
  chk('옛 판에서 **지운 줄이 없다** (더하기만 했다)', removed === 0);
  console.log('  더한 줄 ' + added + ' · 지운 줄 ' + removed);
  const lines = NEW_RULES.split('\n').length - (NEW_RULES.endsWith('\n') ? 1 : 0);
  const oldLines = OLD_RULES.split('\n').length - (OLD_RULES.endsWith('\n') ? 1 : 0);
  console.log('  규칙 줄 수: ' + oldLines + ' → ' + lines + ' (재게시용)');
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
