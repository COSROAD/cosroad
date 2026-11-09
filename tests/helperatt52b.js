/* 확인만 (코스로드52 push 승인 B 항) — 배정을 바꾸거나 떼면
   배정 문서의 **`.att`(오늘 출퇴근 사본)** 가 지워지나?
   ★ 고치는 것 없이 **재기만** 한다(지시문: 지워짐/안 지워짐만 보고).
   가짜 firebase-admin — 실제 쓰기 0 · 문자 0. */
const crypto = require('crypto');
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;
const ADM = SRC.admin;

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 44)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const ORG = 'academy_owner1', OWNER = 'OWNER1';
const ST = 'st2', ST2 = 'st5';
const HUID = 'hlp_' + ORG + '_' + ST, HUID2 = 'hlp_' + ORG + '_' + ST2;
const DAY = 86400000, NOW = Date.UTC(2026, 9, 31, 11, 20, 0);
const ATT = { date: '2026-10-31', in: '09:00', out: '' };

function st() {
  const S = makeState();
  S.docs['users/' + OWNER] = { orgId: ORG, approved: true, withdrawn: false,
    paidUntil: NOW + 30 * DAY, plan: 'paid' };
  S.docs['staffPins/' + ORG + '_' + ST]  = { org: ORG, staffId: ST,  pinHash: sha('a'), updatedAt: 1 };
  S.docs['staffPins/' + ORG + '_' + ST2] = { org: ORG, staffId: ST2, pinHash: sha('b'), updatedAt: 1 };
  /* 도우미 배정 문서 — 서버 punchStaff 가 적어 둔 `.att` 가 들어 있다 */
  S.docs['orgs/' + ORG + '/drivers/' + HUID] = { role: 'helper', staffId: ST, carId: 'car1',
    ownerUid: OWNER, updatedAt: 1, att: JSON.parse(JSON.stringify(ATT)) };
  S.tokens = { ownerTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } } };
  return S;
}
const adm = (S, body) => call(ADM, S, body, 'ownerTok', '1.2.3.4');
const attOf = (S, uid) => JSON.stringify((S.docs['orgs/' + ORG + '/drivers/' + (uid || HUID)] || {}).att || null);

(async () => {
  console.log('════ 배정을 바꾸거나 떼면 `.att` 가 지워지나 (확인만)');
  {
    /* ① 같은 직원을 **다른 차량**으로 옮긴다 */
    const S = st();
    const r = await adm(S, { action: 'setCarHelper', org: ORG, carId: 'car3', staffId: ST });
    ck('① 다른 차량으로 옮김 → 200', r.code, 200);
    ck('   배정이 car3 으로 바뀌었다', (S.docs['orgs/' + ORG + '/drivers/' + HUID] || {}).carId, 'car3');
    ck('★ `.att` 는 **그대로 남는다**', attOf(S), JSON.stringify(ATT));

    /* ② 그 차량의 도우미를 **다른 직원으로 바꾼다**(앞사람은 떼어진다) */
    const S2 = st();
    const r2 = await adm(S2, { action: 'setCarHelper', org: ORG, carId: 'car1', staffId: ST2 });
    ck('② 다른 직원으로 바꿈 → 200', r2.code, 200);
    ck('   앞사람 배정이 비워졌다', (S2.docs['orgs/' + ORG + '/drivers/' + HUID] || {}).carId, '');
    ck('★ 떼어진 앞사람 `.att` 도 **그대로 남는다**', attOf(S2), JSON.stringify(ATT));
    ck('   새 사람 문서가 생겼다', (S2.docs['orgs/' + ORG + '/drivers/' + HUID2] || {}).carId, 'car1');

    /* ③ 「없음」으로 떼기 */
    const S3 = st();
    const r3 = await adm(S3, { action: 'setCarHelper', org: ORG, carId: 'car1', staffId: '' });
    ck('③ 「없음」으로 떼기 → 200', r3.code, 200);
    ck('   배정이 비워졌다', (S3.docs['orgs/' + ORG + '/drivers/' + HUID] || {}).carId, '');
    ck('★ `.att` 그대로', attOf(S3), JSON.stringify(ATT));

    /* ④ PIN 지우기 — ★★ v294(60-B2)부터 **문서를 지운다**(전에는 `carId` 만 비웠다).
       그래서 `.att` 사본도 **함께 사라진다** — 그만둔 사람의 흔적을 남기지 않는 쪽이다.
       원본 근태(`data/staffAtt`)는 그대로 남아 급여·근태 화면은 바뀌지 않는다. */
    const S4 = st();
    const r4 = await adm(S4, { action: 'removeStaffPin', org: ORG, staffId: ST });
    ck('④ PIN 지우기 → 200', r4.code, 200);
    ck('   배정 문서가 **지워졌다**(v294)', String(S4.docs['orgs/' + ORG + '/drivers/' + HUID]), 'undefined');
    ck('★ 그래서 `.att` 사본도 사라진다(v294)', attOf(S4), 'null');

    /* ⑤ 왜 안 지워지나 — 네 자리 모두 **merge** 로 쓴다(소스 대조) */
    const noCmt = ADM.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/mg, ' ');
    const seg = noCmt.slice(noCmt.indexOf("action === 'setCarHelper'"));
    ck('⑤ setCarHelper 의 쓰기는 전부 { merge: true }',
       (seg.slice(0, 1600).match(/\{ merge: true \}/g) || []).length, 2);
    ck('   merge 없이 통째로 쓰는 자리 0',
       /col\.doc\([^)]*\)\.set\(\s*\{[^}]*\}\s*\)\s*;/.test(seg.slice(0, 1600)), false);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과 — **`.att` 는 지워지지 않는다**'));
  console.log('※ 가짜 firebase-admin — 실제 쓰기 0 · 문자 0 · 고친 코드 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
