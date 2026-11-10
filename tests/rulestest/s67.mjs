/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* 코스로드67-B(v308) — **Storage 규칙을 실제 에뮬레이터로 잰다**.
   원본은 **Firebase 콘솔**이고 저장소 `storage.rules` 는 기록이다(사장님 11-10 15:19 게시).
   ★★ 교차 규칙(`firestore.get`)이 **에뮬레이터에서 정말 도는지** 먼저 재고(①),
     그 뒤에 사람·업체별 허용/거부 표를 만든다. 안 돌면 그 사실을 적고 멈춘다
     (「돈다고 치고」 넘어가면 콘솔에서만 터진다).
   ★ 실서비스 Storage·Firestore 는 **읽지 않는다** — 전부 에뮬레이터다.
   돌리는 법: `npx firebase emulators:start --only firestore,storage` 가 떠 있어야 한다. */
import fs from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadString, getBytes, listAll, deleteObject } from 'firebase/storage';

const lf = (s) => String(s).split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));
const F_RULES = lf(fs.readFileSync('firestore.rules', 'utf8'));
const S_RULES = lf(fs.readFileSync('storage.rules', 'utf8'));

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

const now = Date.now(), DAY = 86400000;
const ORG = 'academy_acme', OWNER = 'OWNER_ACME';          /* 멀쩡한 업체 */
const ORG2 = 'academy_other', OWNER2 = 'OWNER_OTHER';      /* 남의 업체 */
const EXP = 'academy_expired', OWNER_EXP = 'OWNER_EXP';    /* 기간 끝 */
const PEND = 'academy_pending', OWNER_PEND = 'OWNER_PEND'; /* 미승인 */
const TEST = 'academy_test', DEMO = 'academy_demo';
const MASTER = 'MASTER1', TACC = 'TESTACC1', NOACC = 'NOACC1';
const DRV = 'drv_' + ORG + '_car1', HLP = 'hlp_' + ORG + '_st1', KSK = 'ksk_' + ORG;
/* 가짜 사진 — 작은 JPEG dataURL */
const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAg=';
const TXT = 'data:text/plain;base64,aGVsbG8=';
/* 5MB 넘는 그림 — 규칙의 size 조건을 넘긴다 */
const BIG = 'data:image/jpeg;base64,' + 'A'.repeat(7 * 1024 * 1024);

const env = await initializeTestEnvironment({
  projectId: 'cos-s67',
  firestore: { host: '127.0.0.1', port: 8988, rules: F_RULES },
  storage: { host: '127.0.0.1', port: 9199, rules: S_RULES }
});

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'users', OWNER), { orgId: ORG, bizType: 'academy', approved: true,
    withdrawn: false, paidUntil: now + 30 * DAY, plan: 'paid' });
  await setDoc(doc(db, 'users', OWNER2), { orgId: ORG2, bizType: 'academy', approved: true,
    withdrawn: false, paidUntil: now + 30 * DAY, plan: 'paid' });
  await setDoc(doc(db, 'users', OWNER_EXP), { orgId: EXP, bizType: 'academy', approved: true,
    withdrawn: false, paidUntil: now - DAY, plan: 'expired' });          /* 기간 끝 */
  await setDoc(doc(db, 'users', OWNER_PEND), { orgId: PEND, bizType: 'academy', approved: false,
    withdrawn: false, paidUntil: now + 30 * DAY });                      /* 미승인 */
  await setDoc(doc(db, 'admins', MASTER), { role: 'master' });            /* 마스터 */
  await setDoc(doc(db, 'users', TACC), { orgId: ORG, bizType: 'academy', approved: true,
    withdrawn: false, paidUntil: now + 30 * DAY, testAccess: true });     /* 테스트 출입 */
  await setDoc(doc(db, 'users', NOACC), { orgId: ORG, bizType: 'academy', approved: true,
    withdrawn: false, paidUntil: now + 30 * DAY });                      /* 출입 없음 */
});

const st = (uid, claims) => env.authenticatedContext(uid, claims || {}).storage();
const anon = () => env.unauthenticatedContext().storage();
const asOwner = () => st(OWNER);
const asOwner2 = () => st(OWNER2);
const asExp = () => st(OWNER_EXP);
const asPend = () => st(OWNER_PEND);
const asMaster = () => st(MASTER);
const asTacc = () => st(TACC);
const asNoacc = () => st(NOACC);
const asDrv = () => st(DRV, { driver: true, org: ORG, carId: 'car1' });
const asHlp = () => st(HLP, { helper: true, org: ORG, staffId: 'st1' });
const asKsk = () => st(KSK, { kiosk: true, org: ORG });
/* 새 경로 · 옛 경로 */
let seq = 0;
const nPath = (org) => 'orgs/' + org + '/notice-images/' + (++seq) + '_x.jpg';
const dPath = (org) => 'orgs/' + org + '/drivelog-photos/' + (++seq) + '_x.jpg';
const oldN = () => 'notice-images/academy_' + (++seq) + '_x.jpg';
const oldD = () => 'drivelog-photos/academy_' + (++seq) + '_x.jpg';
const put = (s, p, data) => uploadString(ref(s, p), data || IMG, 'data_url');

console.log('════ ① 교차 규칙(`firestore.get`)이 에뮬레이터에서 도나 — 먼저 확인');
{
  /* 관리자 판정은 `users/{uid}` 를 읽어야만 참이 된다 → 허용이 나오면 교차 규칙이 돈 것이다 */
  let crossOk = false;
  try { await assertSucceeds(put(asOwner(), nPath(ORG))); crossOk = true; } catch (e) { crossOk = false; }
  ck('★★ `firestore.get` 이 돈다(관리자 자기 업체 허용)', crossOk, true);
  if (!crossOk) {
    console.log('\n✘ 교차 규칙이 안 돈다 — 아래 표는 **뜻이 없다**. 멈춘다.');
    console.log('  (에뮬레이터를 `--only firestore,storage` 로 **함께** 띄워야 한다)');
    await env.cleanup();
    process.exit(1);
  }
}

console.log('\n② 관리자 — 자기 업체만 · 기간·승인도 본다');
await t('관리자 → 자기 업체 «알림장» 사진', 'allow', () => put(asOwner(), nPath(ORG)), 'own.notice');
await t('관리자 → 자기 업체 운행 사진', 'allow', () => put(asOwner(), dPath(ORG)), 'own.drivelog');
await t('★ 관리자 → **남의 업체**', 'deny', () => put(asOwner(), nPath(ORG2)), 'own.other');
await t('관리자2 → 자기 업체', 'allow', () => put(asOwner2(), nPath(ORG2)), 'own2.own');
await t('★ 관리자2 → 첫 업체', 'deny', () => put(asOwner2(), nPath(ORG)), 'own2.other');
await t('★ **기간 끝난** 업체 관리자', 'deny', () => put(asExp(), nPath(EXP)), 'expired');
await t('★ **미승인**(승인 대기) 관리자', 'deny', () => put(asPend(), nPath(PEND)), 'pending');

console.log('\n③ `_test` — 마스터 · 테스트 출입만');
await t('마스터 → `_test`', 'allow', () => put(asMaster(), nPath(TEST)), 'test.master');
await t('테스트 출입 계정 → `_test`', 'allow', () => put(asTacc(), nPath(TEST)), 'test.tacc');
await t('★ 출입 없는 승인 계정 → `_test`', 'deny', () => put(asNoacc(), nPath(TEST)), 'test.noacc');
await t('  (대조) 출입 없는 그 계정은 **자기 업체**엔 올린다', 'allow',
  () => put(asNoacc(), nPath(ORG)), 'test.noacc.own');

console.log('\n④ 기사·도우미 — 토큰 `org` 만 본다(Firestore 읽기 0)');
await t('기사 → 자기 업체', 'allow', () => put(asDrv(), nPath(ORG)), 'drv.own');
await t('★ 기사 → 남의 업체', 'deny', () => put(asDrv(), nPath(ORG2)), 'drv.other');
await t('도우미 → 자기 업체', 'allow', () => put(asHlp(), dPath(ORG)), 'hlp.own');
await t('★ 도우미 → 남의 업체', 'deny', () => put(asHlp(), dPath(ORG2)), 'hlp.other');
await t('★ **출석 기기** → 자기 업체도 금지', 'deny', () => put(asKsk(), nPath(ORG)), 'ksk.own');

console.log('\n⑤ 둘러보기·익명 — 금지');
await t('★ `_demo` 경로 (관리자라도)', 'deny', () => put(asOwner(), nPath(DEMO)), 'demo.owner');
await t('★ `_demo` 경로 (마스터라도)', 'deny', () => put(asMaster(), nPath(DEMO)), 'demo.master');
await t('★ 익명 → 새 경로', 'deny', () => put(anon(), nPath(ORG)), 'anon.new');

console.log('\n⑥ 사진 조건 — 5MB · 그림만');
await t('★ 5MB 넘는 그림', 'deny', () => put(asOwner(), nPath(ORG), BIG), 'big');
await t('★ 그림이 아닌 파일', 'deny', () => put(asOwner(), nPath(ORG), TXT), 'nonimage');

console.log('\n⑦ 읽기 — 주소를 아는 누구나 `get` · `list` 는 금지');
{
  const p = nPath(ORG);
  await assertSucceeds(put(asOwner(), p));                 /* 먼저 하나 올려 둔다 */
  await t('익명 → 그 사진 `get`', 'allow', () => getBytes(ref(anon(), p)), 'get.anon');
  await t('관리자2(남) → 그 사진 `get`', 'allow', () => getBytes(ref(asOwner2(), p)), 'get.other');
  await t('★ 익명 → 폴더 `list`', 'deny',
    () => listAll(ref(anon(), 'orgs/' + ORG + '/notice-images')), 'list.anon');
  await t('★ 관리자 → 폴더 `list`', 'deny',
    () => listAll(ref(asOwner(), 'orgs/' + ORG + '/notice-images')), 'list.owner');
  await t('관리자 → 자기 업체 사진 지우기', 'allow', () => deleteObject(ref(asOwner(), p)), 'del.own');
  const p2 = nPath(ORG);
  await assertSucceeds(put(asOwner(), p2));
  await t('★ 관리자2(남) → 그 사진 지우기', 'deny', () => deleteObject(ref(asOwner2(), p2)), 'del.other');
}

console.log('\n⑧ 옛 경로 — 당분간 쓰기 허용(3단계에서 막는다) · 익명은 이미 금지');
await t('관리자 → 옛 «알림장» 경로', 'allow', () => put(asOwner(), oldN()), 'old.notice.owner');
await t('관리자 → 옛 운행 경로', 'allow', () => put(asOwner(), oldD()), 'old.drivelog.owner');
await t('★ 익명 → 옛 경로(이번에 막혔다)', 'deny', () => put(anon(), oldN()), 'old.anon');
{
  const p = oldN();
  await assertSucceeds(put(asOwner(), p));
  await t('익명 → 옛 사진 `get`(이미 보낸 문자가 열려야 한다)', 'allow',
    () => getBytes(ref(anon(), p)), 'old.get.anon');
  await t('★ 옛 폴더 `list`', 'deny', () => listAll(ref(anon(), 'notice-images')), 'old.list');
}

console.log('\n⑨ 규칙 글 — 저장소 기록이 콘솔 글과 같은 꼴인가');
{
  /* ★ **주석을 뗀 뒤** 센다 — 파일 끝의 「되돌리기용 옛 규칙」이 주석으로 들어 있어
     그냥 세면 옛 경로가 4개로 보인다(처음에 그렇게 세어 거짓 실패를 겪었다). */
  const s = S_RULES.split('\n').filter((ln) => !/^\s*\/\//.test(ln)).join('\n');
  ck('새 경로 둘이 적혀 있다',
    (s.match(/match \/orgs\/\{org\}\/(notice-images|drivelog-photos)\/\{file\}/g) || []).length, 2);
  ck('옛 경로 둘도 아직 있다(3단계에서 막는다)',
    (s.match(/match \/(notice-images|drivelog-photos)\/\{allPaths=\*\*\}/g) || []).length, 2);
  ck('  (대조) 주석을 안 떼면 4개로 보인다',
    (S_RULES.match(/match \/(notice-images|drivelog-photos)\/\{allPaths=\*\*\}/g) || []).length, 4);
  ck('교차 규칙을 쓴다(`firestore.get`·`firestore.exists`)',
    /firestore\.get\(/.test(s) && /firestore\.exists\(/.test(s), true);
  ck('읽기는 열려 있다(`allow get: if true`)', (s.match(/allow get: if true;/g) || []).length, 4);
  ck('`list` 는 전부 금지', (s.match(/allow list: if false;/g) || []).length, 4);
  ck('5MB·그림 조건', /size < 5 \* 1024 \* 1024/.test(s) && /image\/\.\*/.test(s), true);
  ck('`_demo` 는 쓰기 금지', /!org\.matches\('\.\*_demo'\)/.test(s), true);
  /* ★ 이 둘은 **주석에** 적힌 것이라 원문(`S_RULES`)에서 찾는다 */
  ck('머리에 「콘솔이 원본」이라고 적었다', /원본은 \*\*Firebase 콘솔\*\*이다/.test(S_RULES), true);
  ck('되돌리기용 옛 규칙도 남겼다', /되돌리기용 옛 규칙/.test(S_RULES), true);
  /* ★ Firestore 읽기는 한 평가에 2문서까지 — 쓰는 문서가 둘(users·admins)인지 */
  const docs = [...s.matchAll(/documents\/([a-zA-Z]+)\//g)].map((m) => m[1]);
  ck('★ 읽는 Firestore 컬렉션은 둘(users·admins)',
    [...new Set(docs)].sort().join(','), 'admins,users');
}

console.log('\n⑩ 앱이 그 경로로 올리나 — 소스 대조');
{
  const app = lf(fs.readFileSync(COS_ROOT + '/index.html', 'utf8'));
  ck("★ «알림장» 경로가 `orgs/<업체>/notice-images/`",
    /'orgs\/'\+getFbOrgId\(\)\+'\/notice-images\/'/.test(app), true);
  ck("★ 운행 사진 경로가 `orgs/<업체>/drivelog-photos/`",
    /'orgs\/'\+getFbOrgId\(\)\+'\/drivelog-photos\/'/.test(app), true);
  ck('  업종 글자(`bizId`)로 만드는 경로가 **0곳**',
    /(notice-images|drivelog-photos)\/'\+bizId/.test(app), false);
  ck('  업체는 `getFbOrgId()` 한 벌', (app.match(/getFbOrgId\(\)\+'\/(notice-images|drivelog-photos)/g) || []).length, 2);
}

fs.writeFileSync('s67_table.json', JSON.stringify(table, null, 2));
/* ★ 돌림판은 **맨 끝 줄**을 보고 「전부 통과」를 찾는다 → 쪽지를 **먼저** 찍는다
   (처음에 뒤에 찍어 「문제 1」로 잡혔다 · 다른 묶음도 끝줄이 판정이다). */
console.log('\n※ 실서비스 Storage·Firestore 읽기 0 — 전부 에뮬레이터');
await env.cleanup();
console.log((fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
  : '✔ ' + pass + '/' + pass + ' 전부 통과') + '  (표: s67_table.json)');
process.exit(fail ? 1 : 0);
