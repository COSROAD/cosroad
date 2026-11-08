/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드46 — 관리자 공용 PIN 패드(`pinCheckin`)도 **이용 기간**을 보나.
   ★ 대조 먼저: 고치기 전 코드(0ad3480)로 「기간 끝난 업체도 기록된다」를 보이고,
     고친 뒤 거부·기록 0 을 본다. 404 `notdriver` 흐름은 **그대로**여야 한다.
   가짜 firebase-admin — 실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const crypto = require('crypto');
/* ★ v280: 이 묶음은 **46 회차 기록**이다 — api 를 그 커밋(65845ce)에 못 박는다.
   뒤 회차(49)가 더한 직원 갈래·문구가 이 기록에 거짓 실패로 들어오기 때문이다. */
if (!('COS_API_NEW_REF' in process.env)) process.env.COS_API_NEW_REF = '65845ce';
const PIN_API = process.env.COS_API_NEW_REF;
const readApi = (p) => PIN_API
  ? require('child_process').execSync('git -C ' + COS_ROOT + ' show ' + PIN_API + ':' + p, { maxBuffer: 1 << 26 }).toString()
  : require('fs').readFileSync('' + COS_ROOT + '/' + p, 'utf8');
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;
const OLD_REF = process.env.COS_API_OLD_REF || '0ad3480';     /* 고치기 전(45까지) */
const OLD_DRV = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/driver-auth.js',
  { maxBuffer: 1 << 26 }).toString();
const NEW_DRV = SRC.drv;

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(50) + String(got).slice(0, 50)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const SECRET = 'SEKRIT-TEST';
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const pinHash = (pin, org) => sha(pin + '|' + org + '|' + SECRET);
const ORG = 'academy_owner1', OWNER = 'OWNER1', MASTER = 'MASTER1';
const TEST_ORG = 'freezone_test';
const DAY = 86400000;
/* drvenv 의 가짜 시계와 **같은 값** (알리브45에서 겪은 함정 — 실제 오늘로 만들면 헛돈다) */
const NOW = Date.UTC(2026, 9, 31, 11, 20, 0);

const CASES = {
  '살아 있음(paidUntil 미래)': { approved: true, withdrawn: false, paidUntil: NOW + 30 * DAY, plan: 'paid' },
  '기간 끝남(paidUntil 과거)': { approved: true, withdrawn: false, paidUntil: NOW - DAY, plan: 'paid' },
  'paidUntil 없음(승인만)':    { approved: true, withdrawn: false, plan: 'paid' }
};

function stateFor(ownerDoc, org) {
  org = org || ORG;
  const S = makeState();
  S.tokens = { ownerTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } },
               masterTok: { uid: MASTER, firebase: { sign_in_provider: 'password' } } };
  Object.assign(S.docs, {
    'admins/MASTER1': { role: 'master' },
    ['driverPins/' + org + '_car1']: { org: org, carId: 'car1', pinHash: pinHash('1234', org), updatedAt: 1 }
  });
  if (ownerDoc) S.docs['users/' + OWNER] = Object.assign({ orgId: org }, ownerDoc);
  return S;
}
const pad = (src, S, pin, org, tok) =>
  call(src, S, { action: 'pinCheckin', org: org || ORG, pin: pin }, tok || 'ownerTok', '1.2.3.4');
const wroteAtt = (S) => Object.keys(S.docs).filter((k) => /carState/.test(k)).length;

(async () => {
  console.log('════ ① 대조 — 고치기 전(' + OLD_REF + ')은 **기간이 끝나도 찍힌다**');
  for (const name of ['기간 끝남(paidUntil 과거)', 'paidUntil 없음(승인만)']) {
    const S = stateFor(CASES[name]);
    const r = await pad(OLD_DRV, S, '1234');
    ck('[옛] ' + name, r.code === 200 ? '기록됨(구멍) ' + (r.body && r.body.kind) : '거부 ' + r.code,
       '기록됨(구멍) in');
    ck('[옛]    서버에 쌓였다', wroteAtt(S) > 0, true);
  }

  console.log('\n② 고친 뒤');
  {
    /* 1. 살아 있는 업체 · 기사 PIN → 그대로 */
    const S1 = stateFor(CASES['살아 있음(paidUntil 미래)']);
    const r1 = await pad(NEW_DRV, S1, '1234');
    ck('1. 살아 있는 업체 · 기사 PIN → 기록', (r1.body || {}).kind, 'in');
    ck('   carId 를 돌려준다', (r1.body || {}).carId, 'car1');
    ck('   서버에 1건', wroteAtt(S1), 1);
    /* 2·3. 기간 끝남 / paidUntil 없음 → 거부 · 기록 0 */
    for (const name of ['기간 끝남(paidUntil 과거)', 'paidUntil 없음(승인만)']) {
      const S = stateFor(CASES[name]);
      const r = await pad(NEW_DRV, S, '1234');
      ck('2·3. ' + name + ' → 거부', r.code, 403);
      ck('     문구 그대로(출퇴근과 같은 글)', (r.body || {}).message,
         '업체 이용 기간이 끝났어요. 관리자에게 문의해 주세요.');
      ck("     why 'expired'", (r.body || {}).why, 'expired');
      ck('     서버에 쌓인 출퇴근 0건', wroteAtt(S), 0);
    }
    /* 4. _test (소유자 = 마스터) → 통과 */
    const S4 = makeState();
    S4.tokens = { masterTok: { uid: MASTER, firebase: { sign_in_provider: 'password' } } };
    Object.assign(S4.docs, {
      'admins/MASTER1': { role: 'master' },
      ['driverPins/' + TEST_ORG + '_car1']: { org: TEST_ORG, carId: 'car1',
        pinHash: pinHash('1234', TEST_ORG), updatedAt: 1 }
    });
    const r4 = await pad(NEW_DRV, S4, '1234', TEST_ORG, 'masterTok');
    ck('4. _test(소유자 마스터) → 기록', (r4.body || {}).kind, 'in');
    /* 5. 기사 PIN 이 아니면 404 notdriver — **흐름이 안 바뀌어야 한다** */
    for (const name of Object.keys(CASES)) {
      const S = stateFor(CASES[name]);
      const r = await pad(NEW_DRV, S, '9999');
      ck('5. [' + name + '] 기사 PIN 아님 → 404', r.code, 404);
      ck("   why 'notdriver' 그대로", (r.body || {}).why, 'notdriver');
    }
  }

  console.log('\n③ 다른 길은 그대로인가 (문구·판정 자리)');
  {
    const fs = require('fs');
    const src = readApi('api/driver-auth.js');
    const seg = src.slice(src.indexOf("action === 'pinCheckin'"));
    const i404 = seg.indexOf("'notdriver'"), iAlive = seg.indexOf('ownerAlive(');
    ck('★ 기간 검사가 404 notdriver **뒤**에 있다', i404 >= 0 && iAlive > i404, true);
    ck('새 문구를 안 만들었다 (출퇴근과 같은 글)',
      (src.match(/업체 이용 기간이 끝났어요\. 관리자에게 문의해 주세요\./g) || []).length, 2);
    ck('ownerAlive 를 부르는 곳 셋 (로그인·출퇴근·패드)',
      (src.replace(/\/\*[\s\S]*?\*\//g, ' ').match(/await ownerAlive\(/g) || []).length, 3);
    /* ★ v278: 범위의 **끝쪽도** 그 회차 커밋(65845ce)으로 못 박는다 —
       작업트리와 견주면 뒤 회차가 고친 index.html 이 이 46 기록에 거짓 실패로 들어온다. */
    const PIN46 = process.env.COS_API_NEW_REF || '65845ce';
    ck('index.html 은 안 건드렸다',
      cp.execSync('git -C ' + COS_ROOT + ' diff --name-only 0ad3480 ' + PIN46)
        .toString().indexOf('index.html') < 0, true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 firebase-admin — 실제 쓰기 0 · 문자 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
