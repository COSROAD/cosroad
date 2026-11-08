/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드45 — 서버 기사 기간 판정을 규칙·문자 문지기와 **같은 한 줄**로.
   ★ 대조 먼저: 고치기 전 코드(f7a29ca)로 **기간 끝난 업체가 통과하는 것**(=구멍)을 보이고,
     고친 뒤 거부되는 것을 본다.
   ★ 세 곳(규칙 뜻 · lib/send-guard · api/driver-auth)이 같은 입력에서 같은 답을 내는지 표로.
   가짜 firebase-admin — 실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const crypto = require('crypto');
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;
const OLD_REF = process.env.COS_API_OLD_REF || 'f7a29ca';     /* 고치기 전 */
const OLD_DRV = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/driver-auth.js',
  { maxBuffer: 1 << 26 }).toString();
const NEW_DRV = SRC.drv;

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 48)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const SECRET = 'SEKRIT-TEST';
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const pinHash = (pin, org) => sha(pin + '|' + org + '|' + SECRET);
const ORG = 'academy_owner1', OWNER = 'OWNER1', MASTER = 'MASTER1';
const TEST_ORG = 'freezone_test';
const DAY = 86400000;

/* 소유자 users 문서를 바꿔 가며 세운다 */
function stateWith(ownerDoc, opt) {
  opt = opt || {};
  const org = opt.org || ORG;
  const S = makeState();
  S.tokens = { ownerTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } } };
  Object.assign(S.docs, {
    'admins/MASTER1': { role: 'master' },
    ['orgCodes/123456']: { orgId: org, createdAt: 1 },
    ['driverPins/' + org + '_car1']: { org: org, carId: 'car1', pinHash: pinHash('1234', org), updatedAt: 1 }
  });
  if (ownerDoc) S.docs['users/' + OWNER] = Object.assign({ orgId: org }, ownerDoc);
  return S;
}

async function loginTry(src, S, dev) {
  return await call(src, S, { action: 'login', orgCode: '123456', pin: '1234',
                              deviceId: dev || 'DEV-1' }, null, '1.2.3.' + (dev ? 9 : 4));
}
/* 출퇴근 — 기사 토큰을 손으로 만들어 넣는다(로그인이 막힌 경우도 재 보려고) */
async function punchTry(src, S, org) {
  S.tokens['drvTok'] = { uid: 'drv_' + (org || ORG) + '_car1', driver: true,
                         org: org || ORG, carId: 'car1',
                         firebase: { sign_in_provider: 'custom' } };
  return await call(src, S, { action: 'checkin' }, 'drvTok', '1.2.3.4');
}

/* ★ 이 틀은 **가짜 시계**를 쓴다(drvenv makeState 의 now = 2026-10-31 11:20 UTC).
   기간을 **실제 오늘**로 만들면 「지난 기간」이 가짜 시계에서는 아직 미래라 거짓 통과가 난다
   — 처음에 그렇게 짰다가 「기간 끝남」이 통과해 버렸다. 시계를 맞춰 둔다. */
const NOW = Date.UTC(2026, 9, 31, 11, 20, 0);
/* 소유자 문서 다섯 가지 */
const CASES = {
  '살아 있음(paidUntil 미래)': { approved: true, withdrawn: false, paidUntil: NOW + 30 * DAY, plan: 'paid' },
  '기간 끝남(paidUntil 과거)': { approved: true, withdrawn: false, paidUntil: NOW - DAY, plan: 'paid' },
  'paidUntil 없음(승인만)':    { approved: true, withdrawn: false, plan: 'paid' },
  '탈퇴':                      { approved: true, withdrawn: true,  paidUntil: NOW + 30 * DAY },
  '미승인':                    { approved: false, withdrawn: false, paidUntil: NOW + 30 * DAY }
};

(async () => {
  console.log('════ ① 대조 — 고치기 전(' + OLD_REF + ') 코드는 **기간 끝난 업체를 통과시킨다**');
  {
    for (const name of ['기간 끝남(paidUntil 과거)', 'paidUntil 없음(승인만)']) {
      const S = stateWith(CASES[name]);
      const r = await loginTry(OLD_DRV, S);
      ck('[옛] ' + name + ' → 로그인', r.code === 200 ? '통과(구멍)' : '거부 ' + r.code, '통과(구멍)');
      const S2 = stateWith(CASES[name]);
      const p = await punchTry(OLD_DRV, S2);
      ck('[옛] ' + name + ' → 출근(punch)',
        p.code === 200 ? '기록됨(구멍) ' + (p.body && p.body.kind) : '거부 ' + p.code, '기록됨(구멍) in');
      const wrote = Object.keys(S2.docs).filter((k) => /carState/.test(k)).length;
      ck('[옛]    서버에 출퇴근이 쌓였다', wrote > 0, true);
    }
  }

  console.log('\n② 고친 뒤 — 다섯 경우');
  const table = {};
  for (const name of Object.keys(CASES)) {
    const want = name === '살아 있음(paidUntil 미래)';
    const S = stateWith(CASES[name]);
    const r = await loginTry(NEW_DRV, S);
    const okLogin = r.code === 200;
    const S2 = stateWith(CASES[name]);
    const p = await punchTry(NEW_DRV, S2);
    const okPunch = p.code === 200;
    const wrote = Object.keys(S2.docs).filter((k) => /carState/.test(k)).length;
    table[name] = { 'api/driver-auth': okLogin ? '통과' : '거부' };
    ck((want ? '허용' : '거부') + '  ' + name + ' → 로그인', okLogin ? '통과' : '거부 ' + r.code,
       want ? '통과' : '거부 ' + r.code);
    ck('   ' + (want ? '허용' : '거부') + '  → 출근(punch)', okPunch ? '기록' : '거부', want ? '기록' : '거부');
    if (!want) ck('      서버에 쌓인 출퇴근 0건', wrote, 0);
  }

  console.log('\n③ `_test`(소유자가 마스터) 는 그대로 통과');
  {
    const S = makeState();
    Object.assign(S.docs, {
      'admins/MASTER1': { role: 'master' },
      ['orgCodes/123456']: { orgId: TEST_ORG, createdAt: 1 },
      ['driverPins/' + TEST_ORG + '_car1']: { org: TEST_ORG, carId: 'car1',
        pinHash: pinHash('1234', TEST_ORG), updatedAt: 1 }
    });
    const r = await loginTry(NEW_DRV, S);
    ck('_test 기사 로그인 (소유자 = 마스터)', r.code === 200 ? '통과' : '거부 ' + r.code
      + ' ' + JSON.stringify(r.body), '통과');
  }

  console.log('\n④ 문구·`why` 는 그대로인가 (새 문구를 만들지 않았다)');
  {
    const S = stateWith(CASES['기간 끝남(paidUntil 과거)']);
    const r = await loginTry(NEW_DRV, S);
    ck('상태코드 403', r.code, 403);
    ck('문구 그대로', (r.body || {}).message,
      '업체 이용 기간이 끝났거나 계정이 멈췄어요. 관리자에게 문의해 주세요.');
    ck("why 'expired'", (r.body || {}).why, 'expired');
    const S2 = stateWith(CASES['기간 끝남(paidUntil 과거)']);
    const p = await punchTry(NEW_DRV, S2);
    ck('출퇴근 거부 문구도 그대로', (p.body || {}).message,
      '업체 이용 기간이 끝났어요. 관리자에게 문의해 주세요.');
  }

  console.log('\n⑤ 세 곳이 **같은 한 줄**인가');
  {
    const { isAliveUser } = await import('file:///' + COS_ROOT + '/lib/period.js');
    const now = NOW;                       /* 서버 스텁과 **같은 시계**로 견준다 */
    /* 규칙의 뜻을 글자로 옮긴 것 — firestore.rules userApprovedAlive + userPaidNow */
    const ruleSays = (u) => u.approved === true && u.withdrawn !== true
                            && Number(u.paidUntil || 0) > now;
    let same = true;
    Object.keys(CASES).forEach((name) => {
      const u = CASES[name];
      const a = ruleSays(u), b = isAliveUser(u, now), c = (table[name]['api/driver-auth'] === '통과');
      table[name]['규칙'] = a ? '통과' : '거부';
      table[name]['send-guard(period)'] = b ? '통과' : '거부';
      if (!(a === b && b === c)) same = false;
    });
    console.log('      ' + JSON.stringify(table, null, 1).split('\n').join('\n      '));
    ck('★ 규칙 · send-guard · api/driver-auth 판정이 모두 같다', same, true);
    /* 코드로도 한 곳을 보는지 */
    const fs = require('fs');
    ck('driver-auth 가 lib/period.js 를 쓴다',
      /import \{ isAliveUser \} from '\.\.\/lib\/period\.js'/.test(fs.readFileSync('' + COS_ROOT + '/api/driver-auth.js','utf8')), true);
    ck('send-guard 도 같은 함수를 쓴다',
      /import \{ isAliveUser \} from '\.\/period\.js'/.test(fs.readFileSync('' + COS_ROOT + '/lib/send-guard.js','utf8')), true);
    const drv = fs.readFileSync('' + COS_ROOT + '/api/driver-auth.js','utf8');
    ck('옛 판정 글자(trialStart·plan===) 가 코드에서 0',
      (drv.replace(/\/\*[\s\S]*?\*\//g,' ').match(/trialStart|plan === 'paid'|plan==='paid'/g) || []).length, 0);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 firebase-admin — 실제 쓰기 0 · 문자 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
