/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v260 api 스텁 검사 — ② 옛 기사 계정 세 동작 삭제 · ⑤ 업체 번호 단위 실패 상한
   전: 3ce6379 (v259) · 후: 작업 중 · 검증 3원칙 B: **실제 저장값**을 꺼내 본다 */
const cp = require('child_process');
/* ★ v280: 기대값을 v277-1 까지 앞으로 고쳐 온 묶음이라 **그 마지막 회차(d14e1c2)** 에 못 박는다.
   49 가 더한 staffPins·직원 동작이 v260 기록에 거짓 실패로 들어오기 때문이다. */
if (!('COS_API_NEW_REF' in process.env)) process.env.COS_API_NEW_REF = 'd14e1c2';
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;
const crypto = require('crypto');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 72)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const BASE = process.env.COS_SRC_OLD_REF || '3ce6379';
const OLD = {
  drv: cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':api/driver-auth.js', { maxBuffer: 1 << 26 }).toString(),
  admin: cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':api/admin-account.js', { maxBuffer: 1 << 26 }).toString()
};

const SECRET = 'SEKRIT-TEST';
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const pinHash = (pin, org) => sha(pin + '|' + org + '|' + SECRET);
const ORG = 'academy_owner1';
const ORG2 = 'academy_owner2';
const OWNER = 'OWNER1', OWNER2 = 'OWNER2', MASTER = 'MASTER1';

/* 업체 둘 · 각 업체 기사 둘 · 업체번호 123456 / 654321 */
function base(over) {
  const S = makeState(over);
  S.tokens = {
    ownerTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } },
    masterTok: { uid: MASTER, firebase: { sign_in_provider: 'password' } },
    otherTok: { uid: 'OTHER1', firebase: { sign_in_provider: 'password' } }
  };
  Object.assign(S.docs, {
    'admins/MASTER1': { role: 'master' },
    /* ★ 코스로드45(v277-1): 서버 기간 판정이 **`paidUntil` 한 줄**로 바뀌었다.
       전에는 `trialStart` 가 없거나 `plan==='paid'` 면 통과해서 이 자리도 그대로 돌았는데,
       이제는 **살아 있는 업체로 세워야** 한다(이 묶음의 주제는 「업체 단위 잠금」이지
       기간 판정이 아니다). 기간 판정 자체는 alive45.js·t45.mjs 가 본다. */
    ['users/' + OWNER]: { orgId: ORG, approved: true, plan: 'paid', paidUntil: S.now + 30 * 86400000 },
    ['users/' + OWNER2]: { orgId: ORG2, approved: true, plan: 'paid', paidUntil: S.now + 30 * 86400000 },
    'users/OTHER1': { orgId: 'academy_other1', approved: true, plan: 'paid' },
    'orgCodes/123456': { orgId: ORG, createdAt: 1 },
    'orgCodes/654321': { orgId: ORG2, createdAt: 1 },
    ['driverPins/' + ORG + '_car1']: { org: ORG, carId: 'car1', pinHash: pinHash('1234', ORG), updatedAt: 1 },
    ['driverPins/' + ORG + '_car2']: { org: ORG, carId: 'car2', pinHash: pinHash('5678', ORG), updatedAt: 1 },
    ['driverPins/' + ORG2 + '_car1']: { org: ORG2, carId: 'car1', pinHash: pinHash('1111', ORG2), updatedAt: 1 }
  });
  return S;
}
const drv = (src, S, body, ip) => call(src, S, Object.assign({ action: 'login' }, body), null, ip);
const adm = (src, S, body, tok) => call(src, S, body, tok);
const loginTry = (src, S, over, ip) =>
  drv(src, S, Object.assign({ orgCode: '123456', pin: '1234', deviceId: 'DEV-A' }, over || {}), ip);

(async () => {

console.log('════ 1. ② 옛 기사 계정 세 동작 — 400 「알 수 없는 요청이에요」 ════');
{
  const GONE = [
    ['createDriver', { org: ORG, carId: 'car1', name: '박기사', phone: '010-1111-2222', password: 'abc123' }],
    ['resetDriverPassword', { org: ORG, driverUid: 'drv_x', password: 'abc123' }],
    ['removeDriver', { org: ORG, driverUid: 'drv_x' }]
  ];
  for (const [act, body] of GONE) {
    const S = base();
    const r = await adm(SRC.admin, S, Object.assign({ action: act }, body), 'ownerTok');
    ck(act + ' → 400', r.code, 400);
    ck('   문구는 모르는 action 과 같다', r.body && r.body.message, '알 수 없는 요청이에요.');
    ck('   계정을 만들거나 바꾸지 않았다',
      S.calls.filter(c => ['createUser', 'updateUser'].indexOf(c[0]) >= 0).length, 0);
    /* 대조 — 옛 판에서는 돌았다 */
    const S2 = base();
    const r2 = await adm(OLD.admin, S2, Object.assign({ action: act }, body), 'ownerTok');
    ck('   (대조) 옛 판은 400 이 아니었다', r2.code !== 400, true);
  }
  /* 아무 action 이나 모르는 이름도 같은 400 */
  const S3 = base();
  const r3 = await adm(SRC.admin, S3, { action: 'nosuchthing' }, 'ownerTok');
  ck('모르는 action 도 같은 400', r3.code + ' / ' + (r3.body || {}).message, '400 / 알 수 없는 요청이에요.');
}

console.log('\n════ 2. ② 나머지 동작은 전/후 같은 응답 ════');
{
  const CASES = [
    ['issueOrgCode', { org: ORG }, 'ownerTok'],
    ['setDriverPin', { org: ORG, carId: 'car3', pin: '4321' }, 'ownerTok'],
    ['checkPinDup', { org: ORG, pin: '1234' }, 'ownerTok'],
    ['removeDriverPin', { org: ORG, carId: 'car2' }, 'ownerTok'],
    ['unbindDevice', { org: ORG, carId: 'car1' }, 'ownerTok'],
    ['driverInfo', { org: ORG, carId: 'car1' }, 'ownerTok'],
    ['migrateDriverData', { org: ORG, items: [] }, 'ownerTok'],
    ['masterResetPassword', { targetUid: OWNER, password: 'abcdef' }, 'masterTok'],
    ['masterResetPassword', { targetUid: OWNER, password: 'abcdef' }, 'ownerTok'],   // 권한 없음
    ['issueOrgCode', { org: ORG }, 'otherTok'],                                      // 남의 업체
    ['setDriverPin', { org: ORG, carId: 'car1', pin: '12' }, 'ownerTok']             // 잘못된 PIN
  ];
  for (const [act, body, tok] of CASES) {
    const mk = () => { const S = base({ randomQueue: ['777777'] }); return S; };
    const A = mk(), B = mk();
    const ra = await adm(OLD.admin, A, Object.assign({ action: act }, body), tok);
    const rb = await adm(SRC.admin, B, Object.assign({ action: act }, body), tok);
    ck(act + ' [' + tok + '] 상태코드·본문 같다',
      ra.code + ' ' + JSON.stringify(ra.body), rb.code + ' ' + JSON.stringify(rb.body));
    /* 저장값까지 같은가 (문서 키·값) */
    const dump = (S) => JSON.stringify(Object.keys(S.docs).sort().map(k => k + '=' + JSON.stringify(S.docs[k])));
    ck('   저장값도 같다', dump(A) === dump(B), true);
  }
}

console.log('\n════ 3. ⑤ 업체 단위 상한 — 새 기기에서 21번째 실패부터 멈춘다 ════');
{
  /* 기기를 바꿔 가며 IP 도 바꿔 가며 틀린 PIN — 기존 잠금(기기 10분 5회·IP 1시간 60회)을 피한다 */
  const S = base();
  let lastCode = 0, lastWhy = '';
  for (let i = 1; i <= 20; i++) {
    const r = await loginTry(SRC.drv, S, { pin: '9999', deviceId: 'DEV-' + i }, '10.0.0.' + i);
    lastCode = r.code; lastWhy = (r.body || {}).why || '';
  }
  ck('20번째까지는 「맞지 않아요」 (401)', lastCode, 401);
  const rl = Object.keys(S.docs).filter(k => k.indexOf('driverRl/o.') === 0);
  ck('업체 단위 기록 한 자리', rl.length, 1);
  ck('   센 횟수 20', ((S.docs[rl[0]] || {}).at || []).length, 20);
  /* 21번째 — 새 기기는 멈춘다 */
  const r21 = await loginTry(SRC.drv, S, { pin: '9999', deviceId: 'DEV-21' }, '10.0.0.21');
  ck('21번째 새 기기 → 429', r21.code, 429);
  ck('   문구는 기존 잠금과 같은 꼴', (r21.body || {}).message, '잠시 뒤 다시 시도해 주세요.');
  ck('   why 도 기존 잠금과 같다 (업체 존재가 새지 않게)', (r21.body || {}).why, 'locked');
  /* 맞는 PIN 이어도 새 기기는 멈춘다 */
  const rOk = await loginTry(SRC.drv, S, { pin: '1234', deviceId: 'DEV-22' }, '10.0.0.22');
  ck('맞는 PIN 이어도 새 기기는 멈춘다', rOk.code, 429);
  ck('   토큰을 주지 않았다', !!(rOk.body || {}).token, false);
  /* 기록에 orglock 이 남는다 (차량관리 「최근 로그인」에 보인다) */
  const lg = Object.keys(S.docs).filter(k => k.indexOf('driverLogins/') === 0).map(k => S.docs[k]);
  ck('driverLogins 에 orglock 기록', lg.filter(x => x.why === 'orglock').length >= 2, true);
  ck('   그 기록에 org 가 남는다 (관리자 화면이 본다)',
    (lg.filter(x => x.why === 'orglock')[0] || {}).org, ORG);

  /* ★ 이미 묶인 기기는 그대로 로그인된다 */
  S.docs['driverDevices/' + ORG + '_car1'] = { org: ORG, carId: 'car1', deviceId: 'DEV-BOUND', boundAt: 1 };
  const rb = await loginTry(SRC.drv, S, { pin: '1234', deviceId: 'DEV-BOUND' }, '10.0.0.99');
  ck('★ 묶인 기기는 멈춘 동안에도 200', rb.code, 200);
  ck('   토큰도 받는다', !!(rb.body || {}).token, true);
  /* 묶인 기기가 틀려도 업체 단위로는 세지 않는다 */
  const before = ((S.docs[rl[0]] || {}).at || []).length;
  await loginTry(SRC.drv, S, { pin: '9999', deviceId: 'DEV-BOUND' }, '10.0.0.98');
  ck('묶인 기기의 실패는 업체 단위로 세지 않는다', ((S.docs[rl[0]] || {}).at || []).length, before);

  /* 다른 업체는 영향 없다 */
  const r2 = await drv(SRC.drv, S, { orgCode: '654321', pin: '1111', deviceId: 'DEV-OTHER' }, '10.0.0.97');
  ck('다른 업체는 영향 없다 (200)', r2.code, 200);
}

console.log('\n════ 4. ⑤ 1시간 뒤 풀린다 · 새 기기가 묶이면 비워진다 ════');
{
  /* (가) 1시간 뒤 */
  const S = base();
  for (let i = 1; i <= 20; i++) await loginTry(SRC.drv, S, { pin: '9999', deviceId: 'DEV-' + i }, '10.0.0.' + i);
  ck('멈춘 상태', (await loginTry(SRC.drv, S, { pin: '1234', deviceId: 'DEV-X' }, '10.0.1.1')).code, 429);
  S.now += 3600 * 1000 + 1000;                 // 1시간 1초 뒤
  const rAfter = await loginTry(SRC.drv, S, { pin: '1234', deviceId: 'DEV-Y' }, '10.0.1.2');
  ck('1시간 뒤 새 기기 로그인 풀림 (200)', rAfter.code, 200);

  /* (나) 아직 1시간이 안 됐지만 **새 기기가 제대로 묶이면** 비워진다 */
  const T = base();
  for (let i = 1; i <= 20; i++) await loginTry(SRC.drv, T, { pin: '9999', deviceId: 'DEV-' + i }, '10.0.2.' + i);
  const key = Object.keys(T.docs).filter(k => k.indexOf('driverRl/o.') === 0)[0];
  ck('센 횟수 20', ((T.docs[key] || {}).at || []).length, 20);
  /* 이미 묶인 기기로 들어오면(=새 기기 아님) 비우지 않는다 */
  T.docs['driverDevices/' + ORG + '_car1'] = { org: ORG, carId: 'car1', deviceId: 'DEV-BOUND', boundAt: 1 };
  await loginTry(SRC.drv, T, { pin: '1234', deviceId: 'DEV-BOUND' }, '10.0.2.50');
  ck('묶인 기기로 들어와도 수는 그대로', ((T.docs[key] || {}).at || []).length, 20);
  /* car2 에 새 기기가 **처음** 묶이면 비운다 — 다만 지금은 멈춘 상태라 못 들어온다.
     그래서 수를 19로 낮춰(멈추기 직전) 새 기기 첫 로그인을 넣어 본다 */
  T.docs[key] = { at: ((T.docs[key] || {}).at || []).slice(0, 19), updatedAt: T.now };
  const rNew = await loginTry(SRC.drv, T, { pin: '5678', deviceId: 'DEV-NEW2' }, '10.0.2.60');
  ck('새 기기가 car2 에 처음 묶였다 (200)', rNew.code, 200);
  ck('   그 기기가 묶였다', (T.docs['driverDevices/' + ORG + '_car2'] || {}).deviceId, 'DEV-NEW2');
  ck('★ 업체 단위 수가 비워졌다', !T.docs[key], true);
}

console.log('\n════ 5. ⑤ 기존 잠금·문구는 그대로 ════');
{
  /* (가) 같은 기기로 5회 틀리면 10분 잠금 (업체 단위와 별개) */
  const S = base();
  for (let i = 1; i <= 5; i++) await loginTry(SRC.drv, S, { pin: '9999', deviceId: 'DEV-A' }, '10.1.0.1');
  const r = await loginTry(SRC.drv, S, { pin: '1234', deviceId: 'DEV-A' }, '10.1.0.1');
  ck('기기 5회 잠금 그대로 (429)', r.code, 429);
  ck('   문구 그대로', (r.body || {}).message, '여러 번 틀렸어요. 10분 뒤에 다시 시도해 주세요.');
  /* (나) 없는 번호는 업체 단위로 세지 않는다 */
  const T = base();
  for (let i = 1; i <= 25; i++) await drv(SRC.drv, T, { orgCode: '999999', pin: '9999', deviceId: 'DEV-' + i }, '10.1.1.' + i);
  ck('없는 번호 25회 — 업체 단위 기록 0자리',
    Object.keys(T.docs).filter(k => k.indexOf('driverRl/o.') === 0).length, 0);
  const rT = await drv(SRC.drv, T, { orgCode: '123456', pin: '1234', deviceId: 'DEV-FRESH' }, '10.1.1.90');
  ck('   그래서 진짜 업체는 멈추지 않았다 (200)', rT.code, 200);
  ck('   없는 번호 응답은 같은 문구', (await drv(SRC.drv, T, { orgCode: '999998', pin: '1234', deviceId: 'DEV-Z' }, '10.1.1.91')).body.message,
    '업체 번호 또는 PIN 이 맞지 않아요.');
  /* (다) 맞는 PIN·새 기기는 평소처럼 통과 */
  const U = base();
  const rU = await loginTry(SRC.drv, U, { pin: '1234', deviceId: 'DEV-FIRST' }, '10.1.2.1');
  ck('평소 첫 로그인 200', rU.code, 200);
  ck('   업체 단위 기록이 생기지 않았다',
    Object.keys(U.docs).filter(k => k.indexOf('driverRl/o.') === 0).length, 0);
}

console.log('\n════ 6. ★ 대조 — 옛 판(v259)은 새 기기 실패를 무제한 받았다 ════');
{
  const S = base();
  for (let i = 1; i <= 25; i++) await loginTry(OLD.drv, S, { pin: '9999', deviceId: 'OLD-' + i }, '10.2.0.' + i);
  const r26 = await loginTry(OLD.drv, S, { pin: '9999', deviceId: 'OLD-26' }, '10.2.0.26');
  ck('옛 판 26번째도 401 (멈추지 않는다)', r26.code, 401);
  const rOk = await loginTry(OLD.drv, S, { pin: '1234', deviceId: 'OLD-27' }, '10.2.0.27');
  ck('옛 판은 맞는 PIN 이면 새 기기로 바로 묶인다 (200)', rOk.code, 200);
  ck('옛 판에는 업체 단위 기록이 없다',
    Object.keys(S.docs).filter(k => k.indexOf('driverRl/o.') === 0).length, 0);
  /* 새 판은 같은 흐름에서 막는다 */
  const T = base();
  for (let i = 1; i <= 20; i++) await loginTry(SRC.drv, T, { pin: '9999', deviceId: 'NEW-' + i }, '10.2.1.' + i);
  ck('새 판은 같은 흐름에서 막는다',
    (await loginTry(SRC.drv, T, { pin: '1234', deviceId: 'NEW-21' }, '10.2.1.21')).code, 429);
}

console.log('\n════ 7. 상수·원문 ════');
{
  const s = SRC.drv;
  ck('ORG_FAIL_MAX 20', (s.match(/const ORG_FAIL_MAX\s*=\s*(\d+)/) || [])[1], '20');
  ck('ORG_FAIL_WINDOW 1시간', (s.match(/const ORG_FAIL_WINDOW\s*=\s*(\d+) \* 1000/) || [])[1], '3600');
  ck('기존 상수 그대로 (5회·10분·IP 60)',
    [(s.match(/const FAIL_MAX\s*=\s*(\d+)/) || [])[1], (s.match(/const FAIL_WINDOW\s*=\s*(\d+) \* 60/) || [])[1],
     (s.match(/const IP_LIMIT\s*=\s*\[3600 \* 1000, (\d+)\]/) || [])[1]].join('/'), '5/10/60');
  ck('기록 자리는 driverRl/o.<sha256(org)>', /collection\('driverRl'\)\.doc\('o\.' \+ sha256\(String\(org\)\)\)/.test(s), true);
  ck('PIN·업체번호 원문을 기록에 넣지 않는다',
    /rec\.pin|pin: pin|orgCode: code/.test(s), false);
  /* ★ v275(40-C): 서버 `punch` 가 **차량별 문서** `carState/{carId}` 를 고치게 바뀌었다.
     이 묶음은 **v260 회차 기록**이라, 뒤 회차가 더한 칸은 적어 두고 빼고 견준다
     (그 회차 표는 y_api275.js · t275.mjs). 안 빼면 v260 기록이 거짓 실패가 된다. */
  const cols = (t) => [...new Set((t.match(/collection\('([a-zA-Z]+)'\)/g) || []))].sort();
  const nowCols = cols(s), oldCols = cols(OLD.drv);
  ck('v260 뒤 늘어난 칸은 carState 하나',
    nowCols.filter((x) => oldCols.indexOf(x) < 0).join(','), "collection('carState')");
  ck("v260 뒤 없어진 칸은 data 하나 (출퇴근이 `data/driverAtt` → `carState/{carId}` 로 옮겨서)",
    oldCols.filter((x) => nowCols.indexOf(x) < 0).join(','), "collection('data')");
  ck('그 둘 말고는 v260 과 같다',
    nowCols.filter((x) => x !== "collection('carState')").join(','),
    oldCols.filter((x) => x !== "collection('data')").join(','));
  /* ② 지운 세 동작의 흔적 — 글자(코드)로는 0 */
  const noComment = SRC.admin.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  /* removeDriver 는 **남아 있는** removeDriverPin 의 앞부분이기도 하다 — 뒤에 Pin 이 붙지 않은 것만 센다 */
  [['createDriver', /createDriver/], ['resetDriverPassword', /resetDriverPassword/],
   ['removeDriver', /removeDriver(?!Pin)/]].forEach(([x, re]) =>
    ck('admin-account 코드에 ' + x + ' 0곳', re.test(noComment), false));
  ck('   removeDriverPin 은 그대로 있다', /removeDriverPin/.test(noComment), true);
  ck('   (대조) 옛 판에는 셋 다 있었다',
    ['createDriver', 'resetDriverPassword', 'removeDriver'].every(x => OLD.admin.indexOf("action === '" + x + "'") >= 0), true);
  ck('모르는 action 처리는 그대로', /return fail\(res, 400, '알 수 없는 요청이에요\.'\);/.test(SRC.admin), true);
  /* v263: 마스터 이용 기간 네 동작이 늘었다(approveOrg·extendOrg·setPeriod·unapproveOrg).
     이 표의 뜻은 「v260 이 지운 셋이 사라지고 남은 것이 그대로인가」이므로 **앞 여덟**을 본다. */
  ck('남은 action 목록 (앞 여덟 — v260 기준)',
    (SRC.admin.match(/action === '([a-zA-Z]+)'/g) || []).map(x => x.replace(/.*'([a-zA-Z]+)'/, '$1')).slice(0, 8).join(','),
    'issueOrgCode,setDriverPin,checkPinDup,removeDriverPin,unbindDevice,driverInfo,migrateDriverData,masterResetPassword');
  ck('   v263 이 더한 넷',
    [...new Set((SRC.admin.match(/'(approveOrg|extendOrg|setPeriod|unapproveOrg)'/g) || []))].length, 4);
  ck('   줄 수', SRC.admin.split('\n').length + ' (옛 ' + OLD.admin.split('\n').length + ')',
    SRC.admin.split('\n').length + ' (옛 ' + OLD.admin.split('\n').length + ')');
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
})();
