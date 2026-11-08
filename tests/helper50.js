/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드50(43-B) — 동승 도우미 **로그인** (api/driver-auth.js login)
   ★ 대조 먼저: 고치기 전(766347e = v280)에서 **직원 PIN 으로는 로그인이 안 된다**를 보이고,
     고친 뒤 토큰이 나오는 것을 본다.
   ★ 기사 쪽은 **그대로**여야 한다(회귀) — claim·기기 문서 id·문구·잠금 셈.
   가짜 firebase-admin — 실제 쓰기 0 · 문자 0 · 바깥 통신 0. */
const cp = require('child_process');
const crypto = require('crypto');
/* ★ v282(코스로드52): 이 묶음은 **50 회차 기록**이다 — api 를 그 커밋(1aea23d)에 못 박는다.
   뒤 회차(52)가 `requireDriver` → `requirePuncher` 로 바꾸면서 ⑫ 소스 대조가
   거짓 실패로 들어오기 때문이다(CLAUDE.md 검사 묶음 규칙). */
if (!('COS_API_NEW_REF' in process.env)) process.env.COS_API_NEW_REF = '1aea23d';
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;
const NEW_DRV = SRC.drv;                                  /* 작업트리(이번 회차) */
const OLD_REF = process.env.COS_API_OLD_REF || '766347e';  /* v280 = 고치기 전 */
const OLD_DRV = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/driver-auth.js',
  { maxBuffer: 1 << 26 }).toString();

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const SECRET = 'SEKRIT-TEST';
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const pinHash = (pin, org) => sha(pin + '|' + org + '|' + SECRET);
const ORG = 'academy_owner1', OWNER = 'OWNER1', CODE = '123456';
const ST = 'st7', DEV = 'DEV-HELPER', HUID = 'hlp_' + ORG + '_' + ST;
const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 31, 11, 20, 0);            /* drvenv 가짜 시계와 **같은 값** */
const LIVE    = { approved: true, withdrawn: false, paidUntil: NOW + 30 * DAY, plan: 'paid' };
const EXPIRED = { approved: true, withdrawn: false, paidUntil: NOW - DAY, plan: 'paid' };

/* 기본 상태 — 업체 번호 · 기사 PIN(1234) · 직원 PIN(5678) · 도우미 배정(car1) */
function st(over) {
  over = over || {};
  const S = makeState();
  S.docs['orgCodes/' + CODE] = { orgId: ORG, createdAt: 1 };
  S.docs['users/' + OWNER] = Object.assign({ orgId: ORG }, over.owner || LIVE);
  S.docs['driverPins/' + ORG + '_car1'] = { org: ORG, carId: 'car1', pinHash: pinHash('1234', ORG), updatedAt: 1 };
  if (over.staffPin !== false) {
    S.docs['staffPins/' + ORG + '_' + ST] = { org: ORG, staffId: ST, pinHash: pinHash('5678', ORG), updatedAt: 1 };
  }
  if (over.helperDoc !== false) {
    S.docs['orgs/' + ORG + '/drivers/' + HUID] = Object.assign(
      { role: 'helper', staffId: ST, carId: 'car1', ownerUid: OWNER, updatedAt: 1 }, over.helperDoc || {});
  }
  Object.assign(S.docs, over.docs || {});
  return S;
}
const login = (src, S, pin, dev) =>
  call(src, S, { action: 'login', orgCode: CODE, pin: pin, deviceId: dev || DEV }, null, '1.2.3.4');
const claimsOf = (S, uid) => {
  const c = S.calls.filter(c => c[0] === 'createCustomToken' && c[1] === uid);
  return c.length ? JSON.parse(c[c.length - 1][2]) : null;
};
const tokenCalls = (S) => S.calls.filter(c => c[0] === 'createCustomToken').length;

(async () => {
  console.log('════ ① 대조 — 고치기 전(' + OLD_REF + ')은 **직원 PIN 으로 못 들어온다**');
  {
    const S = st();
    const r = await login(OLD_DRV, S, '5678');
    ck('[옛] 직원 PIN 로그인 → 거부', r.code, 401);
    ck('[옛]    문구는 「업체 번호 또는 PIN…」', (r.body || {}).message, '업체 번호 또는 PIN 이 맞지 않아요.');
    ck('[옛]    토큰 발급 0건', tokenCalls(S), 0);
    ck('[옛]    staffPins 를 아예 안 본다',
       S.calls.filter(c => String(c[1] || '').indexOf('staffPins') >= 0).length, 0);
    /* 기사 PIN 은 옛 판에서도 된다(대조군이 살아 있음을 보인다) */
    const S2 = st();
    const r2 = await login(OLD_DRV, S2, '1234');
    ck('[옛] 기사 PIN 로그인 → 그대로 된다', (r2.body || {}).carId, 'car1');
  }

  console.log('\n② 고친 뒤 — 도우미 로그인');
  {
    const S = st();
    const r = await login(NEW_DRV, S, '5678');
    ck('1. 직원 PIN → 200', r.code, 200);
    ck('   helper:true 를 돌려준다', (r.body || {}).helper, true);
    ck('   **배정 문서의 차량**을 돌려준다', (r.body || {}).carId, 'car1');
    ck('   staffId 를 돌려준다', (r.body || {}).staffId, ST);
    ck('   PIN·해시·업체번호는 응답에 없다',
       /5678|pinHash|123456/.test(JSON.stringify(r.body || {})), false);
    const cl = claimsOf(S, HUID);
    ck('   토큰 uid = hlp_<업체>_<직원>', tokenCalls(S) === 1 && !!cl, true);
    ck('   claim helper:true', (cl || {}).helper, true);
    ck('   claim org', (cl || {}).org, ORG);
    ck('   claim staffId', (cl || {}).staffId, ST);
    ck('   ★ claim 에 **carId 가 없다**', ('carId' in (cl || {})), false);
    ck('   claim 에 driver 가 없다', ('driver' in (cl || {})), false);
    /* users 문서 */
    const u = S.docs['users/' + HUID] || {};
    ck('2. users/hlp… role', u.role, 'helper');
    ck('   users driverOrg', u.driverOrg, ORG);
    ck('   users ownerUid', u.ownerUid, OWNER);
    ck('   users staffId', u.staffId, ST);
    ck('   ★ users 에 **carId 를 안 넣는다**(원본은 배정 문서 하나)', ('carId' in u), false);
    ck('   users 에 orgId 를 안 넣는다(업체 계정으로 보이면 안 된다)', ('orgId' in u), false);
    ck('   users 에 approved 를 안 넣는다', ('approved' in u), false);
    /* 배정 문서는 안 건드린다 */
    const d = S.docs['orgs/' + ORG + '/drivers/' + HUID] || {};
    ck('3. 배정 문서 carId 그대로', d.carId, 'car1');
    ck('   role 그대로', d.role, 'helper');
    /* 기기 묶기 — **사람 기준** */
    const dv = S.docs['driverDevices/' + ORG + '_hlp_' + ST] || {};
    ck('4. 기기 문서 자리 = <업체>_hlp_<직원>', dv.deviceId, DEV);
    ck('   helper 표시', dv.helper, true);
    ck('   staffId', dv.staffId, ST);
    ck('   ★ 기기 문서에 carId 를 안 넣는다(차량이 바뀌어도 그대로)', ('carId' in dv), false);
    ck('   차량 기준 문서는 **안 만든다**',
       Object.prototype.hasOwnProperty.call(S.docs, 'driverDevices/' + ORG + '_car1'), false);
    /* 로그인 기록 */
    const lg = Object.keys(S.docs).filter(k => /^driverLogins\//.test(k)).map(k => S.docs[k]);
    ck('5. 로그인 기록 1건 · 성공', lg.length === 1 && lg[0].ok === true, true);
    ck('   why 에 helper', (lg[0] || {}).why, 'helper');
    ck('   PIN·기기 id 원문이 기록에 없다', /5678|DEV-HELPER/.test(JSON.stringify(lg)), false);
  }

  console.log('\n③ 배정이 없으면 들어오지 못한다 (why nocar)');
  for (const [name, over] of [['배정 칸이 빈 값', { helperDoc: { carId: '' } }],
                              ['배정 문서가 아예 없음', { helperDoc: false }]]) {
    const S = st(over);
    const r = await login(NEW_DRV, S, '5678');
    ck(name + ' → 403', r.code, 403);
    ck("   why 'nocar'", (r.body || {}).why, 'nocar');
    ck('   문구', (r.body || {}).message, '동승할 차량이 배정되지 않았어요. 관리자에게 말씀해 주세요.');
    ck('   토큰 0건', tokenCalls(S), 0);
    ck('   기기도 묶지 않는다',
       Object.keys(S.docs).filter(k => /^driverDevices\//.test(k)).length, 0);
  }

  console.log('\n④ 기간이 끝난 업체 — 도우미도 잠긴다 (기사와 같은 문구)');
  {
    const S = st({ owner: EXPIRED });
    const r = await login(NEW_DRV, S, '5678');
    ck('기간 끝남 → 403', r.code, 403);
    ck("   why 'expired'", (r.body || {}).why, 'expired');
    ck('   문구가 기사와 같다', (r.body || {}).message,
       '업체 이용 기간이 끝났거나 계정이 멈췄어요. 관리자에게 문의해 주세요.');
    ck('   토큰 0건', tokenCalls(S), 0);
    /* 대조 — 같은 상태에서 **기사**도 막힌다(같은 함수를 쓴다) */
    const S2 = st({ owner: EXPIRED });
    const r2 = await login(NEW_DRV, S2, '1234');
    ck('   같은 상태에서 기사도 403', r2.code, 403);
  }

  console.log('\n⑤ 다른 폰 — 「등록된 기기가 아니에요」 (사람 기준으로 묶여 있다)');
  {
    const S = st({ docs: { ['driverDevices/' + ORG + '_hlp_' + ST]:
      { org: ORG, helper: true, staffId: ST, deviceId: 'OLD-PHONE', boundAt: 1 } } });
    const r = await login(NEW_DRV, S, '5678', 'NEW-PHONE');
    ck('다른 기기 → 403', r.code, 403);
    ck("   why 'device'", (r.body || {}).why, 'device');
    ck('   문구', (r.body || {}).message, '등록된 기기가 아니에요. 관리자에게 기기 풀기를 요청하세요.');
    ck('   토큰 0건', tokenCalls(S), 0);
    ck('   묶인 기기는 안 바뀐다', S.docs['driverDevices/' + ORG + '_hlp_' + ST].deviceId, 'OLD-PHONE');
    /* 같은 기기면 그대로 들어온다 */
    const S2 = st({ docs: { ['driverDevices/' + ORG + '_hlp_' + ST]:
      { org: ORG, helper: true, staffId: ST, deviceId: DEV, boundAt: 1 } } });
    const r2 = await login(NEW_DRV, S2, '5678', DEV);
    ck('   묶인 그 기기 → 200', r2.code, 200);
  }

  console.log('\n⑥ 배정이 **차량을 옮기면** 그 차량으로 들어온다 (토큰이 아니라 문서를 본다)');
  {
    const S = st({ helperDoc: { carId: 'car3' } });
    const r = await login(NEW_DRV, S, '5678');
    ck('배정 car3 → 응답 carId car3', (r.body || {}).carId, 'car3');
    ck('   claim 에는 여전히 carId 가 없다', ('carId' in (claimsOf(S, HUID) || {})), false);
  }

  console.log('\n⑦ 틀린 PIN — 문구 같음 · 잠금은 **한 번만** 센다 (지시문 12번)');
  {
    const S = st();
    const r = await login(NEW_DRV, S, '9999');
    ck('틀린 PIN → 401', r.code, 401);
    ck('   문구 그대로', (r.body || {}).message, '업체 번호 또는 PIN 이 맞지 않아요.');
    const f = Object.keys(S.docs).filter(k => /^driverRl\/f\./.test(k)).map(k => S.docs[k]);
    const o = Object.keys(S.docs).filter(k => /^driverRl\/o\./.test(k)).map(k => S.docs[k]);
    ck('   기기 잠금 칸 1칸만 늘었다(두 대조를 합쳐 한 번)', (f[0] || { at: [] }).at.length, 1);
    ck('   업체 잠금 칸도 1칸만', (o[0] || { at: [] }).at.length, 1);
    ck('   토큰 0건', tokenCalls(S), 0);
    /* 대조 — 옛 판도 한 번만 셌다(이 셈이 안 늘어난 것이 핵심) */
    const S2 = st();
    await login(OLD_DRV, S2, '9999');
    const f2 = Object.keys(S2.docs).filter(k => /^driverRl\/f\./.test(k)).map(k => S2.docs[k]);
    ck('   [옛]도 1칸 — 셈이 안 늘었다', (f2[0] || { at: [] }).at.length, 1);
  }

  console.log('\n⑧ 성공하면 업체 잠금 셈을 비운다 (v260 그대로)');
  {
    const S = st({ docs: { ['driverRl/o.' + sha(ORG)]: { at: [NOW - 1000, NOW - 2000], updatedAt: 1 } } });
    const r = await login(NEW_DRV, S, '5678');
    ck('도우미 첫 기기 묶임 → 200', r.code, 200);
    ck('   driverRl/o.* 가 비워졌다',
       Object.prototype.hasOwnProperty.call(S.docs, 'driverRl/o.' + sha(ORG)), false);
  }

  console.log('\n⑨ 기사 쪽 회귀 — 하나도 안 바뀌었다');
  {
    const S = st();
    const r = await login(NEW_DRV, S, '1234');
    ck('기사 로그인 → 200', r.code, 200);
    ck('   carId', (r.body || {}).carId, 'car1');
    ck('   helper 칸이 없다', ('helper' in (r.body || {})), false);
    const cl = claimsOf(S, 'drv_' + ORG + '_car1');
    ck('   claim driver:true', (cl || {}).driver, true);
    ck('   claim carId', (cl || {}).carId, 'car1');
    ck('   claim 에 helper 가 없다', ('helper' in (cl || {})), false);
    const dv = S.docs['driverDevices/' + ORG + '_car1'] || {};
    ck('   기기 문서 자리 = <업체>_<차량>', dv.deviceId, DEV);
    ck('   기기 문서 carId', dv.carId, 'car1');
    ck('   기기 문서 org', dv.org, ORG);
    ck('   기기 문서에 helper 표시 없음', ('helper' in dv), false);
    const u = S.docs['users/drv_' + ORG + '_car1'] || {};
    ck('   users role driver', u.role, 'driver');
    ck('   users carId', u.carId, 'car1');
    /* 없는 업체 번호 — 문구·상태코드 그대로 */
    const S3 = st();
    const r3 = await call(NEW_DRV, S3, { action: 'login', orgCode: '999999', pin: '1234', deviceId: DEV }, null, '1.2.3.4');
    ck('   없는 업체 번호 → 401 같은 문구', r3.code + '/' + (r3.body || {}).message,
       '401/업체 번호 또는 PIN 이 맞지 않아요.');
  }

  console.log('\n⑩ 도우미는 출퇴근을 못 부른다 (43-C 전까지 · 지시문 8번)');
  {
    const S = st();
    const r = await login(NEW_DRV, S, '5678');
    const tok = (r.body || {}).token;
    for (const act of ['checkin', 'checkout']) {
      const S2 = S;
      const r2 = await call(NEW_DRV, S2, { action: act }, tok, '1.2.3.4');
      ck(act + ' → 403', r2.code, 403);
      ck('   문구', (r2.body || {}).message, '기사 로그인으로만 쓸 수 있어요.');
    }
    ck('   carState 문서가 안 생겼다',
       Object.keys(S.docs).filter(k => /carState/.test(k)).length, 0);
    /* 대조 — 기사 토큰이면 된다 */
    const S3 = st();
    const r3 = await login(NEW_DRV, S3, '1234');
    const r4 = await call(NEW_DRV, S3, { action: 'checkin' }, (r3.body || {}).token, '1.2.3.4');
    ck('   [대조] 기사 토큰 checkin → 200 kind in', (r4.body || {}).kind, 'in');
  }

  console.log('\n⑪ 관리자 PIN 패드(pinCheckin) 회귀 — v280 그대로');
  {
    const S = st();
    S.tokens.ownerTok = { uid: OWNER, firebase: { sign_in_provider: 'password' } };
    const r1 = await call(NEW_DRV, S, { action: 'pinCheckin', org: ORG, pin: '1234' }, 'ownerTok', '1.2.3.4');
    ck('기사 PIN → kind in', (r1.body || {}).kind, 'in');
    const r2 = await call(NEW_DRV, S, { action: 'pinCheckin', org: ORG, pin: '5678' }, 'ownerTok', '1.2.3.4');
    ck('직원 PIN → kind staff', (r2.body || {}).kind, 'staff');
    ck('   staffId', (r2.body || {}).staffId, ST);
    const r3 = await call(NEW_DRV, S, { action: 'pinCheckin', org: ORG, pin: '0000' }, 'ownerTok', '1.2.3.4');
    ck('둘 다 아니면 404 notdriver', r3.code + '/' + (r3.body || {}).why, '404/notdriver');
  }

  console.log('\n⑫ 소스 대조 (자리·중복·공용)');
  {
    const src = NEW_DRV;
    const noCmt = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/mg, ' ');
    const adm = cp.execSync('git -C ' + COS_ROOT + ' show HEAD:api/admin-account.js',
      { maxBuffer: 1 << 26 }).toString();
    ck('helperUidOf 가 admin-account 와 **같은 글자**',
       /const helperUidOf = \(org, staffId\) => 'hlp_' \+ org \+ '_' \+ staffId;/.test(src)
       && /const helperUidOf = \(org, staffId\) => 'hlp_' \+ org \+ '_' \+ staffId;/.test(adm), true);
    ck('기기 묶기는 **한 벌**(bindDevice) 로 모았다',
       (noCmt.match(/const bindDevice = async/g) || []).length, 1);
    ck('   부르는 곳 둘(기사·도우미)', (noCmt.match(/await bindDevice\(/g) || []).length, 2);
    ck('기기 문구는 한 곳에만 적혀 있지 않다(두 갈래가 같은 글)',
       (src.match(/등록된 기기가 아니에요\. 관리자에게 기기 풀기를 요청하세요\./g) || []).length, 2);
    ck('nocar 문구는 한 곳',
       (src.match(/동승할 차량이 배정되지 않았어요\. 관리자에게 말씀해 주세요\./g) || []).length, 1);
    ck('createCustomToken 은 둘(기사·도우미)', (noCmt.match(/createCustomToken\(/g) || []).length, 2);
    ck('도우미 claim 에 carId 를 적지 않았다',
       /createCustomToken\(huid, \{ helper: true, org: org, staffId: staffId \}\)/.test(noCmt), true);
    /* 다섯 자리: 로그인(도우미 505) · 로그인(기사 544) · 출퇴근(594) ·
       패드 직원 갈래(641, v280) · 패드 기사 갈래(654, 46회차). 옛 판은 넷이었다. */
    ck('ownerAlive 를 부르는 곳 다섯', (noCmt.match(/await ownerAlive\(/g) || []).length, 5);
    ck('   [옛] 판은 넷이었다(도우미 자리가 늘었다)',
       (OLD_DRV.replace(/\/\*[\s\S]*?\*\//g, ' ').match(/await ownerAlive\(/g) || []).length, 4);
    ck('requireDriver 는 그대로 driver claim 만 통과',
       /if \(t\.driver !== true \|\| !t\.org \|\| !t\.carId\)/.test(noCmt), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 firebase-admin — 실제 쓰기 0 · 문자 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
