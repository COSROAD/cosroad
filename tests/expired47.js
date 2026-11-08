/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드47 ① — 기간이 끝난 업체는 **기사 설정 쓰기**가 막히나 (api/admin-account.js).
   ★ 대조 먼저: 고치기 전(65845ce)에서 「된다」를 보이고, 고친 뒤 403 expired 를 본다.
   ★ 읽기 둘(driverInfo·checkPinDup)은 **그대로 열려 있어야** 한다(규칙: 만료 업체도 읽기는 됨).
   가짜 firebase-admin — 실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const crypto = require('crypto');
/* ★ v280: 이 묶음은 **47 회차 기록**이다 — api 를 그 커밋(f44c98e)에 못 박는다. */
if (!('COS_API_NEW_REF' in process.env)) process.env.COS_API_NEW_REF = 'f44c98e';
const PIN_API = process.env.COS_API_NEW_REF;
const readApi = (p) => PIN_API
  ? require('child_process').execSync('git -C ' + COS_ROOT + ' show ' + PIN_API + ':' + p, { maxBuffer: 1 << 26 }).toString()
  : require('fs').readFileSync('' + COS_ROOT + '/' + p, 'utf8');
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;
const OLD_REF = process.env.COS_API_OLD_REF || '65845ce';      /* 46까지 = 고치기 전 */
const OLD_ADM = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/admin-account.js',
  { maxBuffer: 1 << 26 }).toString();
const NEW_ADM = SRC.admin;

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(46) + String(got).slice(0, 50)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const ORG = 'academy_owner1', OWNER = 'OWNER1', MASTER = 'MASTER1';
const TEST_ORG = 'freezone_test', TA = 'TAOK';
const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 31, 11, 20, 0);          /* drvenv 가짜 시계와 같은 값 */
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

const LIVE   = { approved: true, withdrawn: false, paidUntil: NOW + 30 * DAY, plan: 'paid' };
const EXPIRED= { approved: true, withdrawn: false, paidUntil: NOW - DAY, plan: 'paid' };

function st(ownerDoc, org) {
  org = org || ORG;
  const S = makeState();
  S.tokens = {
    ownerTok:  { uid: OWNER,  firebase: { sign_in_provider: 'password' } },
    masterTok: { uid: MASTER, firebase: { sign_in_provider: 'password' } },
    taTok:     { uid: TA,     firebase: { sign_in_provider: 'password' } }
  };
  Object.assign(S.docs, {
    'admins/MASTER1': { role: 'master' },
    ['users/' + TA]: { orgId: 'academy_ta1', approved: true, withdrawn: false,
                       testAccess: true, paidUntil: NOW - DAY },   /* 본인 기간은 지났다 */
    ['orgCodes/123456']: { orgId: org, createdAt: 1 },
    ['driverPins/' + org + '_car1']: { org: org, carId: 'car1', pinHash: sha('x'), updatedAt: 1 },
    ['driverDevices/' + org + '_car1']: { org: org, carId: 'car1', deviceId: 'DEV-1', boundAt: 1 }
  });
  if (ownerDoc) S.docs['users/' + OWNER] = Object.assign({ orgId: org }, ownerDoc);
  return S;
}
const adm = (src, S, body, tok) => call(src, S, body, tok || 'ownerTok', '1.2.3.4');

/* 쓰기 다섯 · 읽기 둘 */
const WRITES = [
  ['issueOrgCode',      (o) => ({ action: 'issueOrgCode', org: o })],
  ['setDriverPin',      (o) => ({ action: 'setDriverPin', org: o, carId: 'car1', pin: '4321' })],
  ['removeDriverPin',   (o) => ({ action: 'removeDriverPin', org: o, carId: 'car1' })],
  ['unbindDevice',      (o) => ({ action: 'unbindDevice', org: o, carId: 'car1' })],
  ['migrateDriverData', (o) => ({ action: 'migrateDriverData', org: o, cars: [{ id: 'car2', driverPin: '1111' }] })]
];
const READS = [
  ['driverInfo',  (o) => ({ action: 'driverInfo', org: o })],
  ['checkPinDup', (o) => ({ action: 'checkPinDup', org: o, pin: '4321' })]
];
const wroteCount = (S) => Object.keys(S.docs)
  .filter((k) => /^(orgCodes|driverPins|driverDevices)\//.test(k)).length;

(async () => {
  console.log('════ ① 대조 — 고치기 전(' + OLD_REF + ')은 **기간이 끝나도 된다**');
  for (const [name, mk] of WRITES) {
    const S = st(EXPIRED);
    /* ★ 「자료가 바뀌었나」는 **칸 값으로** 본다 — 문서 수로 세면 틀린다.
       setDriverPin 은 PIN 을 바꾸면서 **묶인 기기를 풀어** 문서가 오히려 하나 줄어든다
       (처음에 수로 재다가 거짓 실패가 났다). */
    const pinBefore = JSON.stringify((S.docs['driverPins/' + ORG + '_car1'] || {}).pinHash);
    const codeBefore = Object.keys(S.docs).filter((k) => /^orgCodes\//.test(k)).length;
    const r = await adm(OLD_ADM, S, mk(ORG));
    ck('[옛] ' + name, r.code === 200 ? '됨(구멍)' : '막힘 ' + r.code, '됨(구멍)');
    if (name === 'setDriverPin') {
      ck('[옛]    기사 PIN 이 실제로 바뀌었다',
         JSON.stringify((S.docs['driverPins/' + ORG + '_car1'] || {}).pinHash) !== pinBefore, true);
    }
    if (name === 'issueOrgCode') {
      ck('[옛]    업체 번호 문서가 그대로 있다(읽거나 만듦)',
         Object.keys(S.docs).filter((k) => /^orgCodes\//.test(k)).length >= codeBefore, true);
    }
  }

  console.log('\n② 고친 뒤 — 기간 끝난 업체 소유자는 **쓰기 다섯이 막힌다**');
  for (const [name, mk] of WRITES) {
    const S = st(EXPIRED);
    const r = await adm(NEW_ADM, S, mk(ORG));
    ck(name + ' → 403', r.code, 403);
    ck('   문구·why 그대로', ((r.body || {}).message || '') + '/' + ((r.body || {}).why || ''),
       '업체 이용 기간이 끝났어요. 관리자에게 문의해 주세요./expired');
  }

  console.log('\n③ 읽기 둘은 **그대로 열려 있다** (규칙: 만료 업체도 읽기는 됨)');
  for (const [name, mk] of READS) {
    const S = st(EXPIRED);
    const r = await adm(NEW_ADM, S, mk(ORG));
    ck(name + ' → 그대로 200', r.code, 200);
  }

  console.log('\n④ 살아 있는 업체 소유자는 **그대로 된다**');
  for (const [name, mk] of WRITES) {
    const S = st(LIVE);
    const r = await adm(NEW_ADM, S, mk(ORG));
    ck(name + ' → 200', r.code, 200);
  }

  console.log('\n⑤ 마스터는 **기간 끝난 업체에도** 통과');
  for (const [name, mk] of WRITES) {
    const S = st(EXPIRED);
    const r = await adm(NEW_ADM, S, mk(ORG), 'masterTok');
    ck('[마스터] ' + name + ' → 200', r.code, 200);
  }

  console.log('\n⑥ `_test` 출입 계정 — 소유자가 마스터라 통과 (본인 기간이 지났어도)');
  for (const [name, mk] of WRITES) {
    const S = st(null, TEST_ORG);
    const r = await adm(NEW_ADM, S, mk(TEST_ORG), 'taTok');
    ck('[_test] ' + name + ' → 200', r.code, 200);
  }

  console.log('\n⑦ 마스터 전용 동작은 **안 건드렸다** (코드 대조)');
  {
    const fs = require('fs');
    const src = readApi('api/admin-account.js');
    const noCmt = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
    ck('orgAlive 를 보는 곳 다섯(쓰기만)', (noCmt.match(/await orgAlive\(org\)/g) || []).length, 5);
    ['approveOrg', 'extendOrg', 'setPeriod', 'unapproveOrg', 'masterResetPassword', 'bizPromoStatus']
      .forEach((a) => {
        const i = noCmt.indexOf("action === '" + a + "'");
        const seg = i >= 0 ? noCmt.slice(i, i + 900) : '';
        ck('   ' + a + ' 에는 기간 검사 없음', /await orgAlive\(/.test(seg), false);
      });
    ck('판정은 lib/period.js isAliveUser 한 줄',
      /import \{[^}]*isAliveUser[^}]*\} from '\.\.\/lib\/period\.js'/.test(src), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 firebase-admin — 실제 쓰기 0 · 문자 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
