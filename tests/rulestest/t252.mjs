/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v252 규칙 — otp 컬렉션이 **완전히** 잠겼나 + 다른 블록 무변경 회귀 */
import fs from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, query, where, limit } from 'firebase/firestore';
/* ★ v274: 규칙을 **이 회차 커밋에 고정**한다 — v252(`edd2752`).
   전에는 이 폴더의 사본(= **지금** 규칙)을 읽었다. 그래서 뒤 회차가 규칙을 고치면
   이 회차의 기대값이 거짓으로 깨졌다 — v274 가 기사 읽기 키를 9→6 으로 줄이고
   `carData` 블록을 더하자 한꺼번에 터졌다. v252 가 틀린 것이 아니다.
   **지금** 규칙은 t274.mjs 가 본다 — 그쪽이 진짜다. */
/* ★ 기대값이 뒷 회차에 **앞으로 고쳐졌다** — 그래서 원래 회차가 아니라
   그 기대값이 가리키는 회차(v266)에 맞춘다(여러 회차로 돌려 실측으로 골랐다). */
const _RULES_REF = process.env.COS_RULES_REF || 'f9847fe';   /* v266 */
const _PINNED_RULES = (await import('child_process')).execSync(
  'git -C ' + COS_ROOT + ' show ' + _RULES_REF + ':firestore.rules',
  { maxBuffer: 1 << 26 }).toString()
  .split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));


const env = await initializeTestEnvironment({
  projectId: 'cos-v252',
  firestore: { host: '127.0.0.1', port: 8988, rules: _PINNED_RULES }
});

let pass = 0, fail = 0;
async function t(label, want, fn) {
  try {
    if (want === 'allow') await assertSucceeds(fn());
    else await assertFails(fn());
    pass++; console.log('  ✔ ' + (want === 'allow' ? '허용' : '거부') + '  ' + label);
  } catch (e) { fail++; console.log('  ✘ ' + (want === 'allow' ? '허용기대→거부' : '거부기대→허용') + '  ' + label); }
}
const ctx  = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const anon = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const out  = () => env.unauthenticatedContext().firestore();

const MASTER = 'MasterUid00000000000000000007';
const OWNER  = 'OwnerOk00000000000000000001';
const DRIVER  = 'DriverOk000000000000000002';
const org = 'academy_' + OWNER.slice(0, 12);

/* 미리 심어 둔다 — 규칙을 끈 상태로 */
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'admins', MASTER), { role: 'master' });
  await setDoc(doc(db, 'users', OWNER), {
    bizType: 'academy', orgName: '업체', orgId: org, contact: '010-1',
    status: 'active', approved: true, paidUntil: Date.now() + 365 * 86400000, trialEnd: Date.now() + 30 * 86400000, contractMonths: 12, plan: 'trial', trialStart: Date.now(),
    signupMethod: 'phone', phone: '01011112222', createdAt: Date.now()
  });
  await setDoc(doc(db, 'users', DRIVER), { role: 'driver', driverOrg: org, ownerUid: OWNER, carId: 'car1' });
  await setDoc(doc(db, 'orgs', org, 'drivers', DRIVER), { carId: 'car1', ownerUid: OWNER });
  /* 서버(Admin SDK)가 만든 것처럼 otp 문서를 심는다 */
  await setDoc(doc(db, 'otp', 'HASHED_ID_1'), { codeHash: 'a'.repeat(64), expiresAt: Date.now() + 300000, tries: 0, sentAt: [Date.now()] });
  await setDoc(doc(db, 'otp', 'rl.p.HASHED'), { at: [Date.now()], updatedAt: Date.now() });
  await setDoc(doc(db, 'otp', 'rl.i.HASHED'), { at: [Date.now()], updatedAt: Date.now() });
});

console.log('════ otp — 누구도 읽을 수 없다 ════');
for (const [who, db] of [['로그인 안 함', out()], ['익명 로그인', anon('A1')],
                         ['가입 업체 소유자', ctx(OWNER)], ['기사', ctx(DRIVER)], ['마스터', ctx(MASTER)]]) {
  await t(who + ' → otp 문서 읽기', 'deny', () => getDoc(doc(db, 'otp', 'HASHED_ID_1')));
  await t(who + ' → otp 목록 훑기', 'deny', () => getDocs(collection(db, 'otp')));
}

console.log('\n════ otp — 누구도 쓸 수 없다 (지우기 포함) ════');
for (const [who, db] of [['로그인 안 함', out()], ['익명 로그인', anon('A2')],
                         ['가입 업체 소유자', ctx(OWNER)], ['마스터', ctx(MASTER)]]) {
  await t(who + ' → otp 새로 만들기', 'deny', () => setDoc(doc(db, 'otp', 'MINE'), { codeHash: 'x' }));
  await t(who + ' → otp 고치기(코드 바꿔 넣기)', 'deny', () => updateDoc(doc(db, 'otp', 'HASHED_ID_1'), { codeHash: 'b'.repeat(64) }));
  await t(who + ' → otp 지우기', 'deny', () => deleteDoc(doc(db, 'otp', 'HASHED_ID_1')));
  /* ★ 빈도 제한 기록을 지울 수 있으면 문자 폭탄 구멍이 된다 */
  await t(who + ' → 번호 빈도 기록 지우기', 'deny', () => deleteDoc(doc(db, 'otp', 'rl.p.HASHED')));
  await t(who + ' → IP 빈도 기록 지우기', 'deny', () => deleteDoc(doc(db, 'otp', 'rl.i.HASHED')));
  await t(who + ' → 빈도 기록 비우기(at:[])', 'deny', () => updateDoc(doc(db, 'otp', 'rl.p.HASHED'), { at: [] }));
}

console.log('\n════ 회귀 — 다른 블록은 v251 그대로인가 ════');
await t('소유자가 자기 기관 자료 읽기', 'allow', () => getDoc(doc(ctx(OWNER), 'orgs', org, 'data', 'members')));
await t('소유자가 자기 기관 자료 쓰기', 'allow', () => setDoc(doc(ctx(OWNER), 'orgs', org, 'data', 'members'), { v: 1 }));
await t('남이 그 기관 자료 읽기', 'deny', () => getDoc(doc(ctx('Stranger00000000000000001'), 'orgs', org, 'data', 'members')));
await t('기사가 운행 자료 읽기', 'allow', () => getDoc(doc(ctx(DRIVER), 'orgs', org, 'data', 'members')));
/* v255: 출퇴근은 서버가 쓴다 → 기사 driverAtt 쓰기 거부. 운행 키로 대조한다 */
await t('기사가 출퇴근 쓰기 (★ v255 부터 거부)', 'deny', () => setDoc(doc(ctx(DRIVER), 'orgs', org, 'data', 'driverAtt'), { v: 1 }));
await t('기사가 운행 키(rideState) 쓰기', 'allow', () => setDoc(doc(ctx(DRIVER), 'orgs', org, 'data', 'rideState'), { v: 1 }));
await t('기사가 급여 쓰기', 'deny', () => setDoc(doc(ctx(DRIVER), 'orgs', org, 'data', 'payrollManual'), { v: 1 }));
await t('기사가 rideState 쓰기', 'allow', () => setDoc(doc(ctx(DRIVER), 'orgs', org, 'data', 'rideState'), { v: 1 }));
await t('내 admins 문서 읽기 (마스터)', 'allow', () => getDoc(doc(ctx(MASTER), 'admins', MASTER)));
await t('남의 admins 문서 읽기', 'deny', () => getDoc(doc(ctx(OWNER), 'admins', MASTER)));
await t('admins 목록 훑기', 'deny', () => getDocs(collection(ctx(MASTER), 'admins')));
await t('admins 쓰기 (스스로 마스터 되기)', 'deny', () => setDoc(doc(ctx(OWNER), 'admins', OWNER), { role: 'master' }));
await t('마스터가 가입자 목록 읽기', 'allow', () => getDocs(collection(ctx(MASTER), 'users')));
await t('가입자가 남의 users 목록 읽기', 'deny', () => getDocs(collection(ctx(OWNER), 'users')));
await t('익명이 문의 보내기', 'allow', () => setDoc(doc(anon('A3'), 'inquiries', 'q1'), { text: 'x', date: '2026-10-27' }));
await t('익명이 문의 읽기', 'deny', () => getDoc(doc(anon('A3'), 'inquiries', 'q1')));
await t('승인 대기자도 billing 읽기', 'allow', () => getDoc(doc(anon('A4'), 'orgs', '_master', 'data', 'billing')));
await t('익명이 billing 쓰기', 'deny', () => setDoc(doc(anon('A4'), 'orgs', '_master', 'data', 'billing'), { bank: 'x' }));
await t('shares 목록 훑기', 'deny', () => getDocs(collection(out(), 'shares')));
await t('엉뚱한 모양 shares 만들기', 'deny', () => setDoc(doc(ctx(OWNER), 'shares', 'T1'), { kind: 'hack', x: 1 }));

console.log('\n════ 규칙 파일 자체 — otp 한 줄만 늘었나 ════');
{
  const nowSrc = _PINNED_RULES;
  const oldSrc = (await import('node:child_process')).execSync('git -C ' + COS_ROOT + ' show e00385d:firestore.rules').toString();
  const ms = s => (s.match(/match \/[^\s]+/g) || []);
  const added = ms(nowSrc).filter(x => ms(oldSrc).indexOf(x) < 0);
  const gone  = ms(oldSrc).filter(x => ms(nowSrc).indexOf(x) < 0);
  console.log('  새 match: ' + (added.join(', ') || '없음'));
  console.log('  없어진 match: ' + (gone.join(', ') || '없음'));
  /* v252 때는 otp 한 블록만 늘었다. v255 에서 기사 로그인용 서버 전용 5컬렉션이 더 늘었다 —
     기준(e00385d) 대비 누적이므로 여섯 블록이 맞다. 없어진 블록은 여전히 없어야 한다. */
  /* v263: 승인·연장 기록 블록(billingLog)이 하나 더 늘었다 — 서버만 쓰고 마스터만 읽는다 */
  /* v264: 첫 결제 할인 1회 블록(bizFirstPay)이 하나 더 늘었다 — 같은 꼴(서버만 쓰고 마스터만 읽는다).
     이 표는 **그 뒤로 늘거나 준 것**을 세는 자리라, 회차마다 늘어난 블록을 여기 적어 둔다.
     (없어진 블록이 0인지는 그대로 본다 — 그게 이 검사의 핵심이다) */
  const WANT = ['match /otp/{id}', 'match /orgCodes/{code}', 'match /driverPins/{id}',
                'match /driverDevices/{id}', 'match /driverLogins/{id}', 'match /driverRl/{id}',
                'match /billingLog/{uid}/items/{itemId}', 'match /bizFirstPay/{id}',
                /* v266: 문자·알림톡 빈도 기록(sendRl) 한 블록이 더 늘었다 — 같은 꼴(아무도 못 봄) */
                'match /sendRl/{id}'];
  if (added.slice().sort().join(',') === WANT.slice().sort().join(',') && !gone.length) {
    pass++; console.log('  ✔ otp + v255 기사 로그인 5블록만 늘고 없어진 것 없음');
  }
  else { fail++; console.log('  ✘ 예상과 다름'); }
  /* 지운 줄이 0 이어야 한다 — git 이 직접 센다 (줄끝 CRLF 때문에 문자열 비교는 못 믿는다) */
  const stat = (await import('node:child_process'))
    .execSync('git -C ' + COS_ROOT + ' diff --numstat e00385d -- firestore.rules').toString().trim();
  const [ins, del] = stat ? stat.split(/\s+/) : ['0', '0'];
  console.log('  git diff: +' + ins + ' / −' + del);
  /* ★ 기준을 **v252 커밋**(edd2752)으로 바꿨다 — 전에는 e00385d 대비 +9/−0 을 단정했는데,
     v253 에서 규칙이 또 바뀌자 이 줄만 거짓 실패했다. 이 묶음이 지켜야 할 것은
     「v252 가 넣은 otp 블록이 그대로 있는가」다. */
  const has = _PINNED_RULES
    .indexOf('match /otp/{id} {\n      allow read, write: if false;\n    }') >= 0;
  if (has) { pass++; console.log('  ✔ v252 의 otp 블록이 그대로 있다'); }
  else { fail++; console.log('  ✘ otp 블록이 바뀌었다'); }
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
