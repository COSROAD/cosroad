/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v250 규칙 — 기사 권한 · drivers 명부 · bizType 보호 · v248·v249 회귀 */
import fs from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
/* ★ v274: 규칙을 **이 회차 커밋에 고정**한다 — v250(`7dc146b`).
   전에는 이 폴더의 사본(= **지금** 규칙)을 읽었다. 그래서 뒤 회차가 규칙을 고치면
   이 회차의 기대값이 거짓으로 깨졌다 — v274 가 기사 읽기 키를 9→6 으로 줄이고
   `carData` 블록을 더하자 한꺼번에 터졌다. v250 가 틀린 것이 아니다.
   **지금** 규칙은 t274.mjs 가 본다 — 그쪽이 진짜다. */
/* ★ 기대값이 뒷 회차에 **앞으로 고쳐졌다** — 그래서 원래 회차가 아니라
   그 기대값이 가리키는 회차(v263)에 맞춘다(여러 회차로 돌려 실측으로 골랐다). */
const _RULES_REF = process.env.COS_RULES_REF || '269231d';   /* v263 */
const _PINNED_RULES = (await import('child_process')).execSync(
  'git -C ' + COS_ROOT + ' show ' + _RULES_REF + ':firestore.rules',
  { maxBuffer: 1 << 26 }).toString()
  .split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));


const env = await initializeTestEnvironment({
  projectId: 'cos-v250',
  firestore: { host: '127.0.0.1', port: 8988, rules: _PINNED_RULES }
});
const DAY = 86400000;
const plus = d => new Date(Date.now() + d * DAY);

let pass = 0, fail = 0;
async function t(label, want, fn) {
  try {
    if (want === 'allow') await assertSucceeds(fn());
    else await assertFails(fn());
    pass++; console.log('  ✔ ' + (want === 'allow' ? '허용' : '거부') + '  ' + label);
  } catch (e) { fail++; console.log('  ✘ ' + (want === 'allow' ? '허용기대→거부' : '거부기대→허용') + '  ' + label); }
}
const ctx = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const anonCtx = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();

/* ── 업체 소유자 5종 + 기사 5명 + 마스터 ── */
const OWN_OK    = 'OwnerOk00000000000000000001';   // 승인·체험 중
const OWN_PAID  = 'OwnerPaid0000000000000000002';  // 승인·paid
const OWN_NOTS  = 'OwnerNoTs0000000000000000003';  // 승인·trialStart 없음 (앱이 paid 로 봄)
const OWN_EXP   = 'OwnerExpired00000000000000004'; // 승인·체험 만료
const OWN_PEND  = 'OwnerPending00000000000000005'; // 미승인
const OWN_WDR   = 'OwnerWithdrawn000000000000006'; // 탈퇴
const MASTER    = 'MasterUid00000000000000000007';
const org = u => 'academy_' + u.slice(0, 12);

const DRV = {};
['OK','PAID','NOTS','EXP','PEND','WDR'].forEach((k, i) => { DRV[k] = 'Driver' + k + '000000000000000' + i; });
const ORPHAN = 'DriverOrphan0000000000000008';     // drivers 문서 없는 계정
const OUTSIDER = 'Outsider000000000000000009';     // 아무 관계 없는 계정

const ownerDoc = (uid, extra) => Object.assign({
  bizType: 'academy', orgName: '업체', orgId: org(uid), contact: '010-1',
  status: 'active', approved: true, paidUntil: Date.now() + 365 * 86400000, trialEnd: Date.now() + 30 * 86400000, contractMonths: 12, plan: 'trial', createdAt: Date.now(),
  email: 'a@b.c', signupMethod: 'email', trialStart: Date.now() - 5 * DAY
}, extra || {});

await env.withSecurityRulesDisabled(async c => {
  const f = c.firestore();
  await setDoc(doc(f, 'admins', MASTER), { role: 'master' });
  const owners = {
    OK:   [OWN_OK,   {}],
    PAID: [OWN_PAID, { plan: 'paid', trialStart: Date.now() - 400 * DAY }],
    NOTS: [OWN_NOTS, (() => { const d = ownerDoc(OWN_NOTS); delete d.trialStart; return d; })()],   /* v263: paidUntil 은 남아 있어 활성이다 */
    /* v263: 만료 판정은 paidUntil 하나로 한다 — 지난 값을 넣어야 「만료」가 된다 */
    EXP:  [OWN_EXP,  { trialStart: Date.now() - 40 * DAY, paidUntil: Date.now() - 10 * DAY }],
    PEND: [OWN_PEND, { approved: false, status: 'pending', plan: 'pending' }],
    WDR:  [OWN_WDR,  { withdrawn: true }]
  };
  for (const k of Object.keys(owners)) {
    const [uid, ex] = owners[k];
    await setDoc(doc(f, 'users', uid), (k === 'NOTS') ? ex : ownerDoc(uid, ex));
    /* 기관 자료 한 건 */
    await setDoc(doc(f, 'orgs', org(uid), 'data', 'members'), { value: '[]' });
    await setDoc(doc(f, 'orgs', org(uid), 'data', 'payments'), { value: '{}' });
    await setDoc(doc(f, 'orgs', org(uid), 'data', 'driverAtt'), { value: '{}' });
    /* 기사 */
    await setDoc(doc(f, 'orgs', org(uid), 'drivers', DRV[k]),
      { carId: 'car1', name: '기사', phone: '0101', ownerUid: uid, createdAt: Date.now() });
    await setDoc(doc(f, 'users', DRV[k]),
      { role: 'driver', driverOrg: org(uid), ownerUid: uid, carId: 'car1', name: '기사', phone: '0101', createdAt: Date.now() });
    /* 백업 한 건 (삭제 검사용) */
    await setDoc(doc(f, 'orgs', org(uid), 'backups', 'driverAtt__1'), { key: 'driverAtt', value: '{}', backupAt: 1 });
    await setDoc(doc(f, 'orgs', org(uid), 'backups', 'payments__1'), { key: 'payments', value: '{}', backupAt: 1 });
  }
  await setDoc(doc(f, 'users', ORPHAN), { role: 'driver', driverOrg: org(OWN_OK), ownerUid: OWN_OK, carId: 'car1', createdAt: Date.now() });
  await setDoc(doc(f, 'users', OUTSIDER), ownerDoc(OUTSIDER));
  await setDoc(doc(f, 'orgs', org(OUTSIDER), 'data', 'members'), { value: '[]' });
});

const O = org(OWN_OK);

console.log('════ ① 기사 읽기 — 소유자 상태별 ════');
const readCases = [
  ['승인·체험 중',        'OK',   OWN_OK,   'allow'],
  ['승인·paid',          'PAID', OWN_PAID, 'allow'],
  ['승인·trialStart 없음', 'NOTS', OWN_NOTS, 'allow'],
  ['체험 만료(40일 지남)', 'EXP',  OWN_EXP,  'deny'],
  ['미승인',              'PEND', OWN_PEND, 'deny'],
  ['탈퇴',                'WDR',  OWN_WDR,  'deny']
];
for (const [label, k, owner, want] of readCases) {
  await t('소유자 ' + label, want, () => getDoc(doc(ctx(DRV[k]), 'orgs', org(owner), 'data', 'members')));
}
await t('drivers 문서 없는 계정', 'deny', () => getDoc(doc(ctx(ORPHAN), 'orgs', O, 'data', 'members')));
await t('아무 관계 없는 계정', 'deny', () => getDoc(doc(ctx(OUTSIDER), 'orgs', O, 'data', 'members')));
await t('익명 계정', 'deny', () => getDoc(doc(anonCtx('anon00000000000000000000001'), 'orgs', O, 'data', 'members')));
await t('기사가 **남의 업체** 읽기', 'deny', () => getDoc(doc(ctx(DRV.OK), 'orgs', org(OUTSIDER), 'data', 'members')));

console.log('\n════ ② 기사 쓰기 — 허용 키 ════');
/* v255: driverAtt 를 허용 키에서 뺐다 — 출퇴근은 서버(api/driver-auth)가 쓴다
   v257: attendance·attendanceTime 도 뺐다 — 기사 화면에 출결을 저장하는 길이 0개다 */
for (const key of ['carlog', 'deliveryDone', 'dropoffDone', 'rideState']) {
  await t(key, 'allow', () => setDoc(doc(ctx(DRV.OK), 'orgs', O, 'data', key), { value: '{}' }));
}
await t('driverAtt (★ v255 부터 거부)', 'deny', () => setDoc(doc(ctx(DRV.OK), 'orgs', O, 'data', 'driverAtt'), { value: '{}' }));
for (const key of ['attendance', 'attendanceTime']) {
  await t(key + ' (★ v257 부터 거부)', 'deny', () => setDoc(doc(ctx(DRV.OK), 'orgs', O, 'data', key), { value: '{}' }));
}
console.log('── 기사 쓰기 — 막아야 하는 키 ──');
for (const key of ['members', 'payments', 'tax', 'invoices', 'products', 'cars', 'courses', 'org', 'notices',
                   'staff', 'certificates', 'payrollManual', 'drivelogManual', 'aligo']) {
  await t(key, 'deny', () => setDoc(doc(ctx(DRV.OK), 'orgs', O, 'data', key), { value: '{}' }));
}
console.log('── 만료·미승인·탈퇴 소유자의 기사는 허용 키도 못 쓴다 ──');
for (const k of ['EXP', 'PEND', 'WDR']) {
  await t(k + ' 소유자의 기사 → driverAtt', 'deny',
    () => setDoc(doc(ctx(DRV[k]), 'orgs', org({ EXP: OWN_EXP, PEND: OWN_PEND, WDR: OWN_WDR }[k]), 'data', 'driverAtt'), { value: '{}' }));
}

console.log('\n════ ③ 백업 (saveToFirebase 가 함께 쓴다) ════');
/* v255: driverAtt 가 쓰기 키가 아니므로 그 백업도 못 만든다 */
await t('기사 — driverAtt 백업 만들기 (★ v255 부터 거부)', 'deny',
  () => setDoc(doc(ctx(DRV.OK), 'orgs', O, 'backups', 'driverAtt__9'), { key: 'driverAtt', value: '{}', backupAt: 9 }));
await t('기사 — rideState 백업 만들기', 'allow',
  () => setDoc(doc(ctx(DRV.OK), 'orgs', O, 'backups', 'rideState__9'), { key: 'rideState', value: '{}', backupAt: 9 }));
await t('기사 — members 백업 만들기', 'deny',
  () => setDoc(doc(ctx(DRV.OK), 'orgs', O, 'backups', 'members__9'), { key: 'members', value: '[]', backupAt: 9 }));
await t('기사 — payments 백업 만들기', 'deny',
  () => setDoc(doc(ctx(DRV.OK), 'orgs', O, 'backups', 'payments__9'), { key: 'payments', value: '{}', backupAt: 9 }));
/* v255: 백업에는 막아야 할 키의 지난 값이 있다 — 기사 read·delete 를 닫았다.
   (목록 읽기 실패는 _backupBeforeSave 의 catch 가 삼킨다 — 본 저장은 그대로다) */
await t('기사 — 백업 목록 읽기 (★ v255 부터 거부)', 'deny', () => getDocs(collection(ctx(DRV.OK), 'orgs', O, 'backups')));
await t('기사 — driverAtt 백업 지우기 (★ v255 부터 거부)', 'deny', () => deleteDoc(doc(ctx(DRV.OK), 'orgs', O, 'backups', 'driverAtt__1')));
await t('기사 — payments 백업 지우기', 'deny', () => deleteDoc(doc(ctx(DRV.OK), 'orgs', O, 'backups', 'payments__1')));

console.log('\n════ ④ drivers 명부 (서버만 쓴다) ════');
await t('소유자가 기사 목록 읽기', 'allow', () => getDocs(collection(ctx(OWN_OK), 'orgs', O, 'drivers')));
await t('마스터가 기사 목록 읽기', 'allow', () => getDocs(collection(ctx(MASTER), 'orgs', O, 'drivers')));
await t('기사가 자기 문서 읽기', 'allow', () => getDoc(doc(ctx(DRV.OK), 'orgs', O, 'drivers', DRV.OK)));
await t('남이 기사 목록 읽기', 'deny', () => getDocs(collection(ctx(OUTSIDER), 'orgs', O, 'drivers')));
await t('기사가 스스로 등록하기', 'deny',
  () => setDoc(doc(ctx(ORPHAN), 'orgs', O, 'drivers', ORPHAN), { carId: 'car1', ownerUid: OWN_OK, createdAt: Date.now() }));
await t('소유자가 기사 문서 쓰기', 'deny',
  () => setDoc(doc(ctx(OWN_OK), 'orgs', O, 'drivers', 'xx'), { carId: 'car1', ownerUid: OWN_OK }));
await t('마스터가 기사 문서 쓰기', 'deny',
  () => setDoc(doc(ctx(MASTER), 'orgs', O, 'drivers', 'yy'), { carId: 'car1', ownerUid: MASTER }));
await t('기사가 자기 문서 지우기', 'deny', () => deleteDoc(doc(ctx(DRV.OK), 'orgs', O, 'drivers', DRV.OK)));

console.log('\n════ ⑤ users update — bizType·기사 필드 보호 (연관 ②) ════');
/* ★ 현재 문서를 그대로 읽어 한 필드만 바꿔야 한다 —
   ownerDoc() 로 다시 만들면 createdAt·trialStart 가 새 값이 되고,
   trialStart 는 보호 목록이라 「orgName 만 바꾸기」가 거짓 실패한다(실제로 겪어서 고침). */
async function patchOwn(uid, patch) {
  const cur = (await getDoc(doc(ctx(uid), 'users', uid))).data();
  return setDoc(doc(ctx(uid), 'users', uid), Object.assign({}, cur, patch));
}
await t('본인이 bizType 바꾸기', 'deny', () => patchOwn(OWN_OK, { bizType: 'logistics' }));
await t('본인이 orgName 바꾸기', 'allow', () => patchOwn(OWN_OK, { orgName: '새이름' }));
await t('본인이 trialStart 늘리기', 'deny', () => patchOwn(OWN_OK, { trialStart: Date.now() }));
await t('본인이 plan:paid 로', 'deny', () => patchOwn(OWN_OK, { plan: 'paid' }));
async function patchDrv(uid, patch) {
  const cur = (await getDoc(doc(ctx(uid), 'users', uid))).data();
  return setDoc(doc(ctx(uid), 'users', uid), Object.assign({}, cur, patch));
}
await t('기사가 driverOrg 바꾸기', 'deny', () => patchDrv(DRV.OK, { driverOrg: org(OUTSIDER) }));
await t('기사가 role 바꾸기', 'deny', () => patchDrv(DRV.OK, { role: 'owner' }));
await t('기사가 ownerUid 바꾸기', 'deny', () => patchDrv(DRV.OK, { ownerUid: OUTSIDER }));
await t('기사가 carId 바꾸기', 'deny', () => patchDrv(DRV.OK, { carId: 'car9' }));
/* 기사는 자기 users 문서를 **아무것도 못 고친다** — 본인 분기가
   resource.data.orgId 를 보는데 기사 문서에는 orgId 가 없어서 조건이 터진다.
   앱이 기사 문서를 고치는 곳은 없다(쓰는 곳 전수 확인: 가입·마스터 승인·탈퇴 세 곳뿐,
   모두 소유자용)이라 그대로 둔다. */
await t('기사가 name 바꾸기 (문서 수정 자체가 막힘)', 'deny', () => patchDrv(DRV.OK, { name: '새이름' }));
await t('기사가 자기 users 문서 읽기', 'allow', () => getDoc(doc(ctx(DRV.OK), 'users', DRV.OK)));

console.log('\n════ ⑥ 소유자·마스터 종전 권한 (회귀) ════');
await t('소유자 자기 기관 읽기', 'allow', () => getDoc(doc(ctx(OWN_OK), 'orgs', O, 'data', 'members')));
await t('소유자 자기 기관 쓰기(payments)', 'allow', () => setDoc(doc(ctx(OWN_OK), 'orgs', O, 'data', 'payments'), { value: '{}' }));
await t('소유자 남의 기관 읽기', 'deny', () => getDoc(doc(ctx(OWN_OK), 'orgs', org(OUTSIDER), 'data', 'members')));
/* ★ 2026-10-30(v253) 에 **일부러 뒤집었다.** v250~v252 에서는 isTestOrg 만 보아
   로그인한 누구나 _test 자료를 읽고 썼다(기관 격리 우회). v253 에서 마스터 전용으로
   좁혔으므로(testOrgAdmin), 승인된 업체 소유자도 이제 거부되는 것이 **맞다.**
   자세한 _test 검사는 t253.mjs 1~3장에 있다. */
await t('_test 기관은 마스터만 (v253에서 뒤집음)', 'deny', () => setDoc(doc(ctx(OWN_OK), 'orgs', 'freezone_test', 'data', 'members'), { value: '[]' }));
await t('_demo 기관 쓰기 거부(종전)', 'deny', () => setDoc(doc(ctx(OWN_OK), 'orgs', 'freezone_demo', 'data', 'members'), { value: '[]' }));

console.log('\n════ ⑦ v249 users create 회귀 ════');
let fn = 0;
function fresh() { fn++; const uid = 'FreshV250Uid' + String(fn).padStart(3, '0') + '0123456789'; return { uid, db: ctx(uid) }; }
const signup = uid => ({ bizType: 'academy', orgName: '업체', orgId: 'academy_' + uid.slice(0, 12),
  contact: '010-1', status: 'pending', approved: false, plan: 'pending', createdAt: Date.now(),
  email: 'a@b.c', signupMethod: 'email' });
/* ★ v261 로 바뀐 칸 — 이 회차 기록을 **거짓으로 통과시키지 않고** 뜻을 적어 둔다.
   v249~v260: 「앱이 만드는 그 모양」이면 브라우저가 users 문서를 직접 만들 수 있었다.
   v261: users create 를 **서버 전용(false)** 으로 닫았다 — 가입은 api/signup.js 만 만든다
   (휴대폰 인증 + 국세청 사업자 확인을 건너뛴 가입을 막기 위해서다).
   그래서 이 줄의 기대를 allow → deny 로 **뒤집었다.** 아래 세 줄(거부)은 그대로 거부다. */
await t('정상 가입 모양 — v261 부터는 거부(서버 전용)', 'deny', () => { const f = fresh(); return setDoc(doc(f.db, 'users', f.uid), signup(f.uid)); });
await t('approved:true', 'deny', () => { const f = fresh(); return setDoc(doc(f.db, 'users', f.uid), { ...signup(f.uid), approved: true }); });
await t('orgId 남의 것', 'deny', () => { const f = fresh(); return setDoc(doc(f.db, 'users', f.uid), { ...signup(f.uid), orgId: 'academy_' + OWN_OK.slice(0, 12) }); });
await t('trialStart 있음', 'deny', () => { const f = fresh(); return setDoc(doc(f.db, 'users', f.uid), { ...signup(f.uid), trialStart: Date.now() }); });

console.log('\n════ ⑧ v248 shares 회귀 ════');
const SN = u => ({ v: 1, kind: 'notice', org: { name: 'x' }, date: '2026-10-20', content: '내용',
  images: ['https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg'],
  createdAt: new Date(), expiresAt: plus(30), ownerUid: u });
let sn = 0; const tk = () => 'S250' + String(++sn).padStart(3, '0') + 'aaaaaaaaaaaaaaaa';
await t('승인 소유자', 'allow', () => setDoc(doc(ctx(OWN_OK), 'shares', tk()), SN(OWN_OK)));
await t('마스터', 'allow', () => setDoc(doc(ctx(MASTER), 'shares', tk()), SN(MASTER)));
await t('미승인 소유자', 'deny', () => setDoc(doc(ctx(OWN_PEND), 'shares', tk()), SN(OWN_PEND)));
await t('기사(users 에 approved 없음)', 'deny', () => setDoc(doc(ctx(DRV.OK), 'shares', tk()), SN(DRV.OK)));
await t('kind 이상', 'deny', () => setDoc(doc(ctx(OWN_OK), 'shares', tk()), { ...SN(OWN_OK), kind: 'evil' }));
await t('사진 3장', 'deny', () => setDoc(doc(ctx(OWN_OK), 'shares', tk()), { ...SN(OWN_OK), images: ['a','b','c'] }));
await t('만료 40일', 'deny', () => setDoc(doc(ctx(OWN_OK), 'shares', tk()), { ...SN(OWN_OK), expiresAt: plus(40) }));

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건' : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
