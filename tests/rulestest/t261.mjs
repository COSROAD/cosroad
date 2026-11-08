/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v261 — users create 를 **서버 전용**으로 닫음 + 본인이 사업자 정보·로그인 번호를 못 바꾸게
   ★ 대조를 먼저: 옛 규칙(b6651bc)으로 「전에는 브라우저가 가입 문서를 직접 만들었다」를
     보인 뒤, 새 규칙으로 「이제 막힌다」를 보인다.
   ※ api/signup.js 는 Admin SDK 라 규칙을 거치지 않는다 — false 로 닫아도 가입은 된다.
     그 점은 withSecurityRulesDisabled(=Admin 과 같은 길)로 쓰기가 되는 것으로 확인한다. */
import fs from 'fs';
import cp from 'node:child_process';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const NEW_RULES = fs.readFileSync('firestore.rules', 'utf8').split(String.fromCharCode(13) + String.fromCharCode(10)).join(String.fromCharCode(10));
const OLD_RULES = cp.execSync('git -C ' + COS_ROOT + ' show b6651bc:firestore.rules', { maxBuffer: 1 << 26 }).toString();

let pass = 0, fail = 0;
async function t(label, want, fn) {
  try {
    if (want === 'allow') await assertSucceeds(fn());
    else await assertFails(fn());
    pass++; console.log('  ' + (want === 'allow' ? '✔ 허용' : '✔ 거부') + '  ' + label);
  } catch (e) { fail++; console.log('  ' + (want === 'allow' ? '✘ 허용기대→거부' : '✘ 거부기대→허용') + '  ' + label); }
}
const chk = (label, cond) => { if (cond) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✘ ' + label); } };

const MASTER = 'MasterUid00000000000000000001';
const OWNER_A = 'OwnerA000000000000000000002';
const OWNER_B = 'OwnerB000000000000000000003';
const NEWBIE  = 'Newbie000000000000000000009';
const ORG_A = 'academy_' + OWNER_A.slice(0, 12);

/* v261 가입 문서 모양 — api/signup.js 가 만드는 그대로 */
const signupDoc = (uid) => ({
  bizType: 'academy', orgName: '코스로드학원',
  orgId: 'academy_' + uid.slice(0, 12),
  phone: '01012345678', contact: '01012345678', signupMethod: 'phone',
  status: 'pending', approved: false, plan: 'pending',
  bizNo: '2118811430', bizCeo: '홍길동', bizOpenDate: '20200301',
  bizCheckedAt: 1762000000000, bizNoDup: false, createdAt: 1762000000000
});
/* v249~v260 모양 (사업자 칸 없음) — 옛 규칙이 통과시켰던 그 모양 */
const oldShapeDoc = (uid) => ({
  bizType: 'academy', orgName: '코스로드학원',
  orgId: 'academy_' + uid.slice(0, 12), contact: '010-1234-5678',
  status: 'pending', approved: false, plan: 'pending',
  phone: '01012345678', signupMethod: 'phone', createdAt: 1762000000000
});

async function makeEnv(projectId, rules) {
  const env = await initializeTestEnvironment({
    projectId, firestore: { host: '127.0.0.1', port: 8988, rules }
  });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'admins', MASTER), { role: 'master' });
    const own = (uid) => Object.assign(signupDoc(uid), {
      status: 'active', approved: true, paidUntil: Date.now() + 365 * 86400000, trialEnd: Date.now() + 30 * 86400000, contractMonths: 12, plan: 'trial', trialStart: 1762000000000
    });
    await setDoc(doc(db, 'users', OWNER_A), own(OWNER_A));
    await setDoc(doc(db, 'users', OWNER_B), own(OWNER_B));
  });
  return env;
}
const ctx = (env, uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const anon = (env) => env.unauthenticatedContext().firestore();

console.log('════ 0. 대조 (옛 규칙 b6651bc) — 전에는 브라우저가 가입 문서를 직접 만들었다 ════');
{
  const env = await makeEnv('cos-v261-old', OLD_RULES);
  await t('[옛] 본인 uid 로 가입 문서 만들기 (v249 모양)', 'allow',
    () => setDoc(doc(ctx(env, NEWBIE), 'users', NEWBIE), oldShapeDoc(NEWBIE)));
  await t('[옛] 본인이 bizNo 를 넣어 고치기 (막는 목록에 없었다)', 'allow',
    () => updateDoc(doc(ctx(env, OWNER_A), 'users', OWNER_A), { bizNo: '9999999999' }));
  await t('[옛] 본인이 phone 을 고치기 (막는 목록에 없었다)', 'allow',
    () => updateDoc(doc(ctx(env, OWNER_A), 'users', OWNER_A), { phone: '01099990000' }));
  await t('[옛] 승인·plan 은 그때도 막혔다', 'deny',
    () => updateDoc(doc(ctx(env, OWNER_A), 'users', OWNER_A), { approved: true, plan: 'paid' }));
  await env.cleanup();
}

const env = await makeEnv('cos-v261', NEW_RULES);

console.log('\n════ 1. users create — 어떤 모양으로도 브라우저는 못 만든다 (★ v261) ════');
await t('본인 uid · v261 모양', 'deny',
  () => setDoc(doc(ctx(env, NEWBIE), 'users', NEWBIE), signupDoc(NEWBIE)));
await t('본인 uid · v249 모양 (옛 규칙이 통과시켰던 그것)', 'deny',
  () => setDoc(doc(ctx(env, NEWBIE), 'users', NEWBIE), oldShapeDoc(NEWBIE)));
await t('approved:true 를 스스로 넣기', 'deny',
  () => setDoc(doc(ctx(env, NEWBIE), 'users', NEWBIE),
    Object.assign(signupDoc(NEWBIE), { approved: true, status: 'active', plan: 'paid' })));
await t('남의 업체 orgId 로 만들기', 'deny',
  () => setDoc(doc(ctx(env, NEWBIE), 'users', NEWBIE),
    Object.assign(signupDoc(NEWBIE), { orgId: ORG_A })));
await t('role:driver 로 만들기', 'deny',
  () => setDoc(doc(ctx(env, NEWBIE), 'users', NEWBIE),
    Object.assign(signupDoc(NEWBIE), { role: 'driver', driverOrg: ORG_A, ownerUid: OWNER_A })));
await t('testAccess:true 로 만들기', 'deny',
  () => setDoc(doc(ctx(env, NEWBIE), 'users', NEWBIE),
    Object.assign(signupDoc(NEWBIE), { testAccess: true })));
await t('남의 uid 문서 만들기', 'deny',
  () => setDoc(doc(ctx(env, NEWBIE), 'users', 'SomeoneElse0000000000000000'), signupDoc(NEWBIE)));
await t('로그인하지 않고 만들기', 'deny',
  () => setDoc(doc(anon(env), 'users', NEWBIE), signupDoc(NEWBIE)));
await t('마스터도 users create 로는 못 만든다 (승인만 한다)', 'deny',
  () => setDoc(doc(ctx(env, MASTER), 'users', NEWBIE), signupDoc(NEWBIE)));
await t('★ Admin SDK(=api/signup.js) 는 그대로 쓴다 — 규칙을 거치지 않는다', 'allow',
  () => env.withSecurityRulesDisabled(async (c) =>
    setDoc(doc(c.firestore(), 'users', NEWBIE), signupDoc(NEWBIE))));

console.log('\n════ 2. 본인 update — 사업자 정보·번호는 못 바꾼다 (★ v261) ════');
const BLOCK = {
  bizNo: '9999999999', bizCeo: '남의대표', bizOpenDate: '19990101',
  /* bizNoDup 은 **지금 값과 다르게** 둔다 — 같은 값이면 affectedKeys 에 안 들어가
     「고쳐도 통과」로 보여 검사가 헛돈다(처음에 false 로 두어 실제로 그랬다) */
  bizCheckedAt: 1, bizNoDup: true, signupMethod: 'email', phone: '01099990000'
};
for (const k of Object.keys(BLOCK))
  await t('본인 → ' + k + ' 고치기', 'deny',
    () => updateDoc(doc(ctx(env, OWNER_A), 'users', OWNER_A), { [k]: BLOCK[k] }));
await t('본인 → 여러 칸 묶어서 고치기', 'deny',
  () => updateDoc(doc(ctx(env, OWNER_A), 'users', OWNER_A), BLOCK));
await t('본인 → 바른 칸에 섞어 넣기 (orgName + bizNo)', 'deny',
  () => updateDoc(doc(ctx(env, OWNER_A), 'users', OWNER_A), { orgName: '새 이름', bizNo: '9999999999' }));

console.log('\n════ 3. 종전에 되던 것은 그대로 (v260 회귀) ════');
await t('본인 → orgName 고치기', 'allow',
  () => updateDoc(doc(ctx(env, OWNER_A), 'users', OWNER_A), { orgName: '새 이름' }));
await t('본인 → contact 고치기', 'allow',
  () => updateDoc(doc(ctx(env, OWNER_A), 'users', OWNER_A), { contact: '010-2222-3333' }));
await t('본인 → orgId 는 그때도 못 바꿨다', 'deny',
  () => updateDoc(doc(ctx(env, OWNER_A), 'users', OWNER_A), { orgId: ORG_A + 'x' }));
await t('본인 → approved·plan 못 바꾼다', 'deny',
  () => updateDoc(doc(ctx(env, OWNER_A), 'users', OWNER_A), { approved: true, plan: 'paid' }));
await t('본인 → testAccess 못 켠다 (v253)', 'deny',
  () => updateDoc(doc(ctx(env, OWNER_A), 'users', OWNER_A), { testAccess: true }));
await t('본인 → 자기 문서 읽기', 'allow',
  () => getDoc(doc(ctx(env, OWNER_A), 'users', OWNER_A)));
await t('남의 문서 읽기 거부', 'deny',
  () => getDoc(doc(ctx(env, OWNER_A), 'users', OWNER_B)));
/* ★ v263: 승인은 **서버(api/admin-account approveOrg)** 가 한다 — 규칙의 마스터 분기를
   testAccess 하나로 좁혔다. 그래서 화면에서 보낸 이 쓰기는 이제 거부가 맞다. */
await t('마스터 → 승인 (v263: 서버만 → 거부)', 'deny',
  () => updateDoc(doc(ctx(env, MASTER), 'users', NEWBIE),
    { approved: true, status: 'active', plan: 'trial', trialStart: 1762000000001 }));
await t('마스터 → testAccess 켜기 (v253)', 'allow',
  () => updateDoc(doc(ctx(env, MASTER), 'users', NEWBIE), { testAccess: true }));
/* v263: 위 승인이 거부되므로 이 문서는 **아직 미승인**이다 → 미승인 정리는 그대로 된다.
   (v261 때는 바로 위에서 승인이 성공해 「승인됐으니 못 지운다」를 보였다) */
await t('마스터 → 미승인 문서 삭제 (미승인이라 허용)', 'allow',
  () => deleteDoc(doc(ctx(env, MASTER), 'users', NEWBIE)));

console.log('\n════ 4. 규칙 원문 확인 ════');
{
  chk('users create 가 false 다',
    /match \/users\/\{uid\} \{[\s\S]*?allow create: if false;/.test(NEW_RULES));
  const m = NEW_RULES.match(/\.hasAny\(\['approved'[\s\S]*?\]\)\)/);
  const keys = m ? (m[0].match(/'([^']+)'/g) || []).map(x => x.replace(/'/g, '')) : [];
  /* v263: 이용 기간 값 넷(paidUntil·trialEnd·contractMonths·paidAt)이 더해져 21개가 됐다 */
  chk('본인 update 보호 목록 21개 (' + keys.length + ')', keys.length === 21);
  ['approved','status','plan','trialStart','bizType','role','driverOrg','ownerUid','carId',
   'testAccess','bizNo','bizCeo','bizOpenDate','bizCheckedAt','bizNoDup','signupMethod','phone']
    .forEach(k => chk('  보호 목록에 ' + k, keys.indexOf(k) >= 0));
  const om = OLD_RULES.match(/\.hasAny\(\['approved'[\s\S]*?\]\)\)/);
  const ok = om ? (om[0].match(/'([^']+)'/g) || []).length : 0;
  chk('(대조) 옛 규칙은 10개였다 (' + ok + ')', ok === 10);
  chk('서버 전용 컬렉션은 그대로 닫혀 있다',
    ['orgCodes', 'driverPins', 'driverDevices', 'driverLogins', 'driverRl', 'otp']
      .every(c => new RegExp('match /' + c + '/\\{[^}]*\\}\\s*\\{\\s*allow read, write: if false;').test(NEW_RULES)));
  chk('  (대조) 같은 검사로 안 닫힌 컬렉션은 걸러낸다',
    !(new RegExp('match /users/\\{[^}]*\\}\\s*\\{\\s*allow read, write: if false;').test(NEW_RULES)));
  const lines = NEW_RULES.split('\n').length - (NEW_RULES.endsWith('\n') ? 1 : 0);
  console.log('  규칙 줄 수: ' + lines + ' (재게시용) · 옛 판 '
    + (OLD_RULES.split('\n').length - (OLD_RULES.endsWith('\n') ? 1 : 0)) + '줄');
  console.log('  규칙 diff (b6651bc 대비): '
    + (cp.execSync('git -C ' + COS_ROOT + ' diff --numstat b6651bc -- firestore.rules').toString().trim() || '없음'));
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
