/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* 코스로드68(v309) 규칙 — **공유 링크에 업종 용어를 담아도 규칙이 받아 주나.**
   ★★ 왜 재나 — `s.html` 이 「알림장」을 **글자로** 적고 있어서 물류 업체의 공유 화면에도
     「알림장」이 떴다(용어는 「공지」). 용어를 담아 보내려면 칸이 하나 필요한데,
     규칙은 `shares` notice 의 **맨 윗단 키 9개**를 `hasOnly` 로 못 박아 두었다
     (`firestore.rules` 568행). 그래서 **`org` 맵 안에** 넣기로 했다 —
     「맵 안쪽은 규칙이 보지 않는다」는 전제를 **코드가 아니라 에뮬레이터로** 못 박는다.
   ★ 규칙 파일은 **한 줄도 안 바꿨다** — 이 묶음이 하는 일은 「안 바꿔도 되는가」를 재는 것이다.
   ★ 대조: 같은 값을 **윗단 키**(`label`)로 올리면 **거부**되어야 한다
     (그래야 「윗단은 못 늘린다 · 맵 안쪽은 된다」가 증명된다 — 「0건」 금지 규칙과 같은 뜻). */
import fs from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';

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

const ORG = 'cosroad_acme', OWNER = 'cosroad_acme';
const now = Date.now(), DAY = 86400000;

const env = await initializeTestEnvironment({
  projectId: 'cos-68', firestore: { host: '127.0.0.1', port: 8988, rules: RULES }
});
/* ★★ 지난 실행 자료를 **반드시** 비운다 — 안 비우면 `create` 검사가 **이미 있는 문서**를
   만나 `update`(규칙 `if false`)로 바뀌어 **거짓 실패**가 난다. `wipe264.sh` 는 업체
   목록을 손으로 적어 두므로(이 묶음의 `cos-68` 은 없다) 묶음이 스스로 비운다.
   ★ 실제로 겪었다 — 처음 돌릴 때는 통과하고 **두 번째부터** ①이 둘 다 깨졌다(v264 와 같은 함정). */
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'users', OWNER), { orgId: ORG, bizType: 'logistics', approved: true,
    withdrawn: false, paidUntil: now + 30 * DAY, plan: 'paid' });
});
const asOwner = () => env.authenticatedContext(OWNER, {}).firestore();
const asAnon = () => env.unauthenticatedContext().firestore();

/* 앱 `shareIssueNotice` 가 **실제로 담는 모양** (v309) */
const snap = (over) => {
  const d = {
    v: 1, kind: 'notice',
    org: { name: '한빛물류', label: '공지' },     /* ★ v309 — 용어는 `org` 안에 */
    date: '2026-11-10', content: '오늘은 비가 옵니다', images: [],
    createdAt: new Date(), expiresAt: new Date(now + 30 * DAY), ownerUid: OWNER
  };
  if (over) over(d);
  return d;
};

console.log('════ ① 용어를 `org` 안에 담으면 — **허용** (규칙 0줄)');
await t('업체 소유자 → `org:{name,label}` 로 발급', 'allow',
  () => setDoc(doc(asOwner(), 'shares', 'tok_label_1'), snap()), 'notice.org.label');
await t('  (종전 모양) `org:{name}` 만 — 허용 그대로', 'allow',
  () => setDoc(doc(asOwner(), 'shares', 'tok_plain_1'),
    snap((d) => { d.org = { name: '한빛물류' }; })), 'notice.org.plain');
await t('  발급한 링크는 **누구나 읽는다**(토큰만 알면)', 'allow',
  () => getDoc(doc(asAnon(), 'shares', 'tok_label_1')), 'notice.read.anon');

console.log('\n② 대조 — 같은 값을 **윗단 키**로 올리면 **거부**');
await t('윗단에 `label` 을 더하면 거부', 'deny',
  () => setDoc(doc(asOwner(), 'shares', 'tok_top_1'),
    snap((d) => { d.label = '공지'; })), 'notice.top.label');
await t('  (한 번 더) 아무 윗단 키나 거부', 'deny',
  () => setDoc(doc(asOwner(), 'shares', 'tok_top_2'),
    snap((d) => { d.bizType = 'logistics'; })), 'notice.top.bizType');

console.log('\n③ 종전 방어선은 그대로다');
await t('남의 uid 로 `ownerUid` 를 적으면 거부', 'deny',
  () => setDoc(doc(asOwner(), 'shares', 'tok_own_1'),
    snap((d) => { d.ownerUid = 'someone_else'; })), 'notice.owner.other');
await t('본문 5,000자 넘으면 거부', 'deny',
  () => setDoc(doc(asOwner(), 'shares', 'tok_big_1'),
    snap((d) => { d.content = 'ㄱ'.repeat(5001); })), 'notice.content.big');
await t('사진 3장은 거부', 'deny',
  () => setDoc(doc(asOwner(), 'shares', 'tok_img_1'),
    snap((d) => { d.images = ['a', 'b', 'c']; })), 'notice.images.3');
await t('만료가 지난 링크는 **못 읽는다**', 'deny', async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'shares', 'tok_exp_1'),
      snap((d) => { d.expiresAt = new Date(now - DAY); }));
  });
  return getDoc(doc(asAnon(), 'shares', 'tok_exp_1'));
}, 'notice.read.expired');

fs.writeFileSync('t68_table.json', JSON.stringify(table, null, 1));
await env.cleanup();
console.log('\n※ 규칙 파일은 한 줄도 안 바꿨다 — 표: t68_table.json');
console.log(fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
  : '✔ ' + pass + '/' + pass + ' 전부 통과');
process.exit(fail ? 1 : 0);
