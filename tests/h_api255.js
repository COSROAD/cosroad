/* v255 api 스텁 검사 — api/driver-auth.js (신설) + api/admin-account.js (기사 로그인 7동작)
   검증 3원칙 B: **실제 저장값**을 꺼내 본다 (응답 문구만 보지 않는다) */
/* ★ v275: 이 묶음은 **v255 회차 기록**이다 — 출퇴근이 `orgs/{org}/data/driverAtt` 에
   `car1_날짜` 키로 쌓이는 것을 못 박았다. v275(40-C)가 그것을 차량별 문서
   `carState/{carId}` 의 `att[날짜]` 로 옮겼으므로, 앱·api 를 **그 전 마지막 커밋**
   (889fbec = v274)에 고정한다. 이번 회차의 같은 질문은 y_api275.js 가 본다. */
if (!('COS_API_NEW_REF' in process.env)) process.env.COS_API_NEW_REF = '889fbec';
const E = require('./drvenv.js');
const { SRC, SRC_OLD, makeState, call } = E;
const crypto = require('crypto');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(58) + String(got).slice(0, 70)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const SECRET = 'SEKRIT-TEST';
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const pinHash = (pin, org) => sha(pin + '|' + org + '|' + SECRET);

const ORG = 'academy_owner1';
const OWNER = 'OWNER1';
const MASTER = 'MASTER1';
const TEST = 'freezone_test';

/* 업체 하나 · 기사 둘(car1 PIN 1234, car2 PIN 5678) · 업체번호 123456 */
function base(over) {
  const S = makeState(over);
  S.tokens = {
    ownerTok:  { uid: OWNER,  firebase: { sign_in_provider: 'password' } },
    masterTok: { uid: MASTER, firebase: { sign_in_provider: 'password' } },
    otherTok:  { uid: 'OTHER1', firebase: { sign_in_provider: 'password' } },
    taTok:     { uid: 'TAOK',  firebase: { sign_in_provider: 'password' } },
    anonTok:   { uid: 'ANON',  firebase: { sign_in_provider: 'anonymous' } }
  };
  Object.assign(S.docs, {
    'admins/MASTER1': { role: 'master' },
    ['users/' + OWNER]: { orgId: ORG, approved: true, plan: 'trial', trialStart: S.now - 1000 },
    'users/OTHER1': { orgId: 'academy_other1', approved: true, plan: 'paid' },
    'users/TAOK': { orgId: 'academy_ta1', approved: true, testAccess: true },
    ['orgCodes/123456']: { orgId: ORG, createdAt: 1 },
    ['driverPins/' + ORG + '_car1']: { org: ORG, carId: 'car1', pinHash: pinHash('1234', ORG), updatedAt: 1 },
    ['driverPins/' + ORG + '_car2']: { org: ORG, carId: 'car2', pinHash: pinHash('5678', ORG), updatedAt: 1 }
  });
  return S;
}
const drvCall = (S, body, tok, ip) => call(SRC.drv, S, body, tok, ip);
const admCall = (S, body, tok) => call(SRC.admin, S, body, tok);
const login = (S, over, ip) => drvCall(S, Object.assign({ action: 'login', orgCode: '123456', pin: '1234', deviceId: 'DEV-A' }, over || {}), null, ip);

(async () => {

console.log('════ 1. 로그인 — 맞는 번호·PIN ════');
{
  const S = base();
  const r = await login(S);
  ck('200 으로 통과', r.code, 200);
  ck('ok', r.body.ok, true);
  ck('토큰이 왔다', !!r.body.token, true);
  ck('돌려준 org', r.body.org, ORG);
  ck('돌려준 carId', r.body.carId, 'car1');
  ck('응답에 PIN·해시·업체번호 없음',
    JSON.stringify(r.body).indexOf('1234') < 0 && JSON.stringify(r.body).indexOf('123456') < 0, true);
  const ct = S.calls.filter(c => c[0] === 'createCustomToken');
  ck('custom token uid', ct.length && ct[0][1], 'drv_' + ORG + '_car1');
  ck('custom token claims', ct.length && ct[0][2], JSON.stringify({ driver: true, org: ORG, carId: 'car1' }));
  ck('기사 명부 문서가 생겼다', !!S.docs['orgs/' + ORG + '/drivers/drv_' + ORG + '_car1'], true);
  ck('명부 ownerUid', (S.docs['orgs/' + ORG + '/drivers/drv_' + ORG + '_car1'] || {}).ownerUid, OWNER);
  ck('users 문서 role', (S.docs['users/drv_' + ORG + '_car1'] || {}).role, 'driver');
  ck('기기 묶임', (S.docs['driverDevices/' + ORG + '_car1'] || {}).deviceId, 'DEV-A');
  const lg = Object.keys(S.docs).filter(k => k.indexOf('driverLogins/') === 0).map(k => S.docs[k]);
  ck('로그인 기록 1건', lg.length, 1);
  ck('기록 ok', lg[0].ok, true);
  ck('기록 시각(KST 문자열)', lg[0].atKst, '2026-10-31 20:20');
  ck('기기 id 원문을 안 남긴다', lg[0].deviceId !== 'DEV-A' && lg[0].deviceId.length === 12, true);
  ck('IP 원문을 안 남긴다', lg[0].ip !== '1.2.3.4' && lg[0].ip.length === 12, true);
  ck('위치 없음 → lat null', lg[0].lat, null);
  ck('로그에 PIN·업체번호 없음',
    S.logs.join('|').indexOf('1234') < 0 && S.logs.join('|').indexOf('123456') < 0, true);
}

console.log('\n════ 2. 틀렸을 때 — 같은 문구 ════');
{
  const SAME = '업체 번호 또는 PIN 이 맞지 않아요.';
  let S = base();
  let r = await login(S, { orgCode: '999999' });
  ck('없는 업체 번호 → 401', r.code, 401);
  ck('없는 업체 번호 문구', r.body.message, SAME);
  ck('실패도 기록된다(why=nocode)', Object.keys(S.docs).filter(k => k.indexOf('driverLogins/') === 0).map(k => S.docs[k].why).join(), 'nocode');

  S = base();
  r = await login(S, { pin: '0000' });
  ck('틀린 PIN → 401', r.code, 401);
  ck('틀린 PIN 문구 (같다)', r.body.message, SAME);

  S = base();
  delete S.docs['driverPins/' + ORG + '_car1'];
  r = await login(S);
  ck('PIN 지워진 차량 → 401', r.code, 401);
  ck('PIN 지워진 차량 문구 (같다)', r.body.message, SAME);

  S = base();
  r = await login(S, { orgCode: '12345' });
  ck('6자리 아님 → 400', r.code, 400);
  r = await login(base(), { pin: '12' });
  ck('PIN 4자리 아님 → 400', r.code, 400);
  r = await login(base(), { deviceId: '' });
  ck('기기 id 없음 → 400', r.code, 400);
}

console.log('\n════ 3. 잠금(5회) · 10분 뒤 풀림 · IP 상한 ════');
{
  const S = base();
  for (let i = 0; i < 5; i++) await login(S, { pin: '0000' });
  let r = await login(S);           // 이제 맞는 PIN 이어도
  ck('5회 틀린 뒤 → 429', r.code, 429);
  ck('잠금 문구', r.body.message, '여러 번 틀렸어요. 10분 뒤에 다시 시도해 주세요.');
  ck('why=locked', r.body.why, 'locked');
  S.now += 10 * 60 * 1000 + 1000;   // 10분 1초 뒤
  r = await login(S);
  ck('10분 뒤 맞는 PIN → 200', r.code, 200);

  /* 다른 기기면 잠기지 않는다 (기기+번호로 센다) */
  const S2 = base();
  for (let i = 0; i < 5; i++) await login(S2, { pin: '0000', deviceId: 'DEV-A' });
  r = await login(S2, { deviceId: 'DEV-B' });
  ck('다른 기기는 안 잠긴다 → 200', r.code, 200);

  /* IP 상한 — 같은 IP 로 60번 (기기를 바꿔 가며) */
  const S3 = base();
  for (let i = 0; i < 60; i++) await login(S3, { pin: '0000', deviceId: 'D' + i }, '5.5.5.5');
  r = await login(S3, { deviceId: 'DX' }, '5.5.5.5');
  ck('IP 60회 넘으면 → 429', r.code, 429);
  ck('IP 상한 문구', r.body.message, '요청이 너무 잦아요. 잠시 뒤에 다시 시도해 주세요.');
  r = await login(base(), { deviceId: 'DX' }, '6.6.6.6');
  ck('다른 IP 는 그대로 → 200', r.code, 200);
}

console.log('\n════ 4. 기기 묶기 ════');
{
  const S = base();
  await login(S, { deviceId: 'DEV-A' });
  let r = await login(S, { deviceId: 'DEV-B' });
  ck('다른 기기 → 403', r.code, 403);
  ck('why=device', r.body.why, 'device');
  ck('안내 문구', r.body.message, '등록된 기기가 아니에요. 관리자에게 기기 풀기를 요청하세요.');
  /* 관리자가 풀어 준다 → 새 기기로 들어온다 */
  const u = await admCall(S, { action: 'unbindDevice', org: ORG, carId: 'car1' }, 'ownerTok');
  ck('기기 풀기 200', u.code, 200);
  ck('묶임 문서가 없어졌다', !S.docs['driverDevices/' + ORG + '_car1'], true);
  r = await login(S, { deviceId: 'DEV-B' });
  ck('풀고 나면 새 기기 → 200', r.code, 200);
  ck('새 기기로 다시 묶였다', S.docs['driverDevices/' + ORG + '_car1'].deviceId, 'DEV-B');
  ck('같은 기기는 계속 된다', (await login(S, { deviceId: 'DEV-B' })).code, 200);
}

console.log('\n════ 5. 업체가 만료·탈퇴·미승인이면 기사도 잠긴다 ════');
{
  const cases = [
    ['체험 만료', { plan: 'trial', trialStart: Date.UTC(2026, 9, 31, 11, 20, 0) - 31 * 86400000 }],
    ['미승인', { approved: false }],
    ['탈퇴', { withdrawn: true }]
  ];
  for (const [label, over] of cases) {
    const S = base();
    Object.assign(S.docs['users/' + OWNER], over);
    const r = await login(S);
    ck(label + ' → 403', r.code, 403);
    ck(label + ' why=expired', r.body.why, 'expired');
  }
  const S = base();
  S.docs['users/' + OWNER].plan = 'paid';
  ck('유료 업체 → 200', (await login(S)).code, 200);
}

console.log('\n════ 6. 출근·퇴근 — 서버 KST 시각 ════');
{
  const S = base();
  const lr = await login(S);
  const tok = lr.body.token;
  /* 2026-10-31 20:20 KST */
  let r = await drvCall(S, { action: 'checkin' }, tok);
  ck('출근 200', r.code, 200);
  ck('kind=in', r.body.kind, 'in');
  ck('시각(KST)', r.body.time, '20:20');
  ck('날짜(KST)', r.body.date, '2026-10-31');
  let att = JSON.parse(S.docs['orgs/' + ORG + '/data/driverAtt'].value);
  ck('저장 키 모양', Object.keys(att).join(), 'car1_2026-10-31');
  ck('저장된 in', att['car1_2026-10-31'].in, '20:20');

  S.now += 3 * 3600 * 1000;      // 3시간 뒤 (23:20 KST)
  r = await drvCall(S, { action: 'checkout' }, tok);
  ck('퇴근 kind=out', r.body.kind, 'out');
  ck('퇴근 시각', r.body.time, '23:20');
  att = JSON.parse(S.docs['orgs/' + ORG + '/data/driverAtt'].value);
  ck('in 이 지워지지 않았다', att['car1_2026-10-31'].in, '20:20');
  ck('out 이 들어갔다', att['car1_2026-10-31'].out, '23:20');
  ck('백업이 남았다', Object.keys(S.docs).some(k => /\/backups\/driverAtt__/.test(k)), true);

  r = await drvCall(S, { action: 'checkin' }, tok);
  ck('셋째 번은 done', r.body.kind, 'done');
  att = JSON.parse(S.docs['orgs/' + ORG + '/data/driverAtt'].value);
  ck('done 이면 값이 안 바뀐다', att['car1_2026-10-31'].in + '/' + att['car1_2026-10-31'].out, '20:20/23:20');
}

console.log('\n════ 7. ★ KST 날짜 경계 (UTC 0~9시) ════');
{
  /* 2026-11-01 00:30 UTC = 2026-11-01 09:30 KST → 날짜가 **하루 전(10-31)이 되면 안 된다** */
  const S = base({ now: Date.UTC(2026, 10, 1, 0, 30, 0) });
  const tok = (await login(S)).body.token;
  let r = await drvCall(S, { action: 'checkin' }, tok);
  ck('UTC 00:30 → KST 날짜', r.body.date, '2026-11-01');
  ck('UTC 00:30 → KST 시각', r.body.time, '09:30');
  ck('저장 키도 그 날짜', Object.keys(JSON.parse(S.docs['orgs/' + ORG + '/data/driverAtt'].value)).join(), 'car1_2026-11-01');

  /* 2026-10-31 15:30 UTC = 2026-11-01 00:30 KST → **다음 날**이어야 한다 */
  const S2 = base({ now: Date.UTC(2026, 9, 31, 15, 30, 0) });
  const tok2 = (await login(S2)).body.token;
  r = await drvCall(S2, { action: 'checkin' }, tok2);
  ck('UTC 15:30 → KST 날짜(다음 날)', r.body.date, '2026-11-01');
  ck('UTC 15:30 → KST 시각', r.body.time, '00:30');

  /* 2026-10-31 14:59 UTC = 23:59 KST → 그날 */
  const S3 = base({ now: Date.UTC(2026, 9, 31, 14, 59, 0) });
  const tok3 = (await login(S3)).body.token;
  r = await drvCall(S3, { action: 'checkin' }, tok3);
  ck('UTC 14:59 → KST 23:59 같은 날', r.body.date + ' ' + r.body.time, '2026-10-31 23:59');
}

console.log('\n════ 8. 남의 차량으로는 못 찍는다 (토큰 claim 만 쓴다) ════');
{
  const S = base();
  const tok = (await login(S)).body.token;              // car1 기사
  /* 본문에 car2 를 넣어 봐도 car1 로만 들어가야 한다 */
  await drvCall(S, { action: 'checkin', carId: 'car2', org: 'academy_other1' }, tok);
  const att = JSON.parse(S.docs['orgs/' + ORG + '/data/driverAtt'].value);
  ck('본문 carId 를 무시한다', Object.keys(att).join(), 'car1_2026-10-31');
  ck('본문 org 도 무시한다', !S.docs['orgs/academy_other1/data/driverAtt'], true);

  let r = await drvCall(S, { action: 'checkin' }, null);
  ck('토큰 없이 출근 → 401', r.code, 401);
  r = await drvCall(S, { action: 'checkin' }, 'ownerTok');
  ck('관리자 토큰으로 출근 → 403', r.code, 403);
  ck('문구', r.body.message, '기사 로그인으로만 쓸 수 있어요.');
}

console.log('\n════ 9. 기사 둘이 같은 순간에 찍어도 둘 다 남는다 (트랜잭션) ════');
{
  const S = base();
  S.txLag = 3;                         // 읽기와 커밋 사이에 틈을 넓게 둔다
  const t1 = (await login(S, { pin: '1234', deviceId: 'D1' })).body.token;
  const t2 = (await login(S, { pin: '5678', deviceId: 'D2' })).body.token;
  S.txRetries = 0;
  await Promise.all([
    drvCall(S, { action: 'checkin' }, t1),
    drvCall(S, { action: 'checkin' }, t2)
  ]);
  const att = JSON.parse(S.docs['orgs/' + ORG + '/data/driverAtt'].value);
  ck('두 기사 기록이 모두 남았다', Object.keys(att).sort().join(','), 'car1_2026-10-31,car2_2026-10-31');
  ck('충돌을 겪고 다시 돌았다 (재시도>0)', S.txRetries > 0, true);
}

console.log('\n════ 10. 관리자 공용 패드 (pinCheckin) ════');
{
  let S = base();
  let r = await drvCall(S, { action: 'pinCheckin', org: ORG, pin: '1234' }, 'ownerTok');
  ck('소유자 + 기사 PIN → 200', r.code, 200);
  ck('어느 차량인지 알려 준다', r.body.carId, 'car1');
  ck('kind=in', r.body.kind, 'in');
  ck('driverAtt 에 들어갔다', !!S.docs['orgs/' + ORG + '/data/driverAtt'], true);

  r = await drvCall(S, { action: 'pinCheckin', org: ORG, pin: '9999' }, 'ownerTok');
  ck('기사 PIN 아님 → 404', r.code, 404);
  ck('why=notdriver (앱이 직원·회원으로 이어 본다)', r.body.why, 'notdriver');

  r = await drvCall(S, { action: 'pinCheckin', org: ORG, pin: '1234' }, 'otherTok');
  ck('남의 업체 관리자 → 403', r.code, 403);
  r = await drvCall(S, { action: 'pinCheckin', org: ORG, pin: '1234' }, 'anonTok');
  ck('익명 로그인 → 403', r.code, 403);
  r = await drvCall(S, { action: 'pinCheckin', org: ORG, pin: '1234' }, null);
  ck('토큰 없음 → 401', r.code, 401);
  /* 기사 토큰으로 패드를 쓰려 하면 거부 */
  S = base();
  const dtok = (await login(S)).body.token;
  r = await drvCall(S, { action: 'pinCheckin', org: ORG, pin: '5678' }, dtok);
  ck('기사 토큰으로 패드 → 403', r.code, 403);
  /* 마스터는 된다 */
  ck('마스터 → 200', (await drvCall(base(), { action: 'pinCheckin', org: ORG, pin: '1234' }, 'masterTok')).code, 200);
}

console.log('\n════ 11. admin-account — 업체 번호 발급 ════');
{
  let S = base();
  delete S.docs['orgCodes/123456'];
  S.randomQueue = [555555];
  let r = await admCall(S, { action: 'issueOrgCode', org: ORG }, 'ownerTok');
  ck('없으면 만든다 → 200', r.code, 200);
  ck('번호', r.body.code, '555555');
  ck('made=true', r.body.made, true);
  ck('orgCodes 에 저장', (S.docs['orgCodes/555555'] || {}).orgId, ORG);
  r = await admCall(S, { action: 'issueOrgCode', org: ORG }, 'ownerTok');
  ck('이미 있으면 그것 (made=false)', r.body.code + '/' + r.body.made, '555555/false');

  /* 겹치면 다시 뽑는다 */
  S = base();
  delete S.docs['orgCodes/123456'];
  S.docs['orgCodes/111111'] = { orgId: 'academy_zzz' };
  S.randomQueue = [111111, 111111, 222222];
  r = await admCall(S, { action: 'issueOrgCode', org: ORG }, 'ownerTok');
  ck('겹친 번호는 건너뛴다', r.body.code, '222222');
  ck('남의 번호를 덮어쓰지 않았다', S.docs['orgCodes/111111'].orgId, 'academy_zzz');

  r = await admCall(base(), { action: 'issueOrgCode', org: ORG }, 'otherTok');
  ck('남의 업체 번호 보기 → 403', r.code, 403);
  ck('마스터는 된다', (await admCall(base(), { action: 'issueOrgCode', org: ORG }, 'masterTok')).code, 200);
}

console.log('\n════ 12. admin-account — PIN 정하기·중복·지우기 ════');
{
  let S = base();
  let r = await admCall(S, { action: 'setDriverPin', org: ORG, carId: 'car3', pin: '4321' }, 'ownerTok');
  ck('PIN 정하기 200', r.code, 200);
  ck('해시로 저장됐다', (S.docs['driverPins/' + ORG + '_car3'] || {}).pinHash, pinHash('4321', ORG));
  ck('PIN 원문을 저장하지 않는다',
    JSON.stringify(S.docs['driverPins/' + ORG + '_car3']).indexOf('4321') < 0, true);
  ck('응답에 해시·PIN 없음', JSON.stringify(r.body), JSON.stringify({ ok: true }));

  r = await admCall(S, { action: 'setDriverPin', org: ORG, carId: 'car3', pin: '1234' }, 'ownerTok');
  ck('다른 기사와 겹치면 409', r.code, 409);
  ck('겹침 문구', r.body.message, '그 PIN 은 이미 다른 기사가 쓰고 있어요. 다른 번호로 정해 주세요.');
  ck('겹쳐서 거절했으면 값이 안 바뀐다', S.docs['driverPins/' + ORG + '_car3'].pinHash, pinHash('4321', ORG));

  r = await admCall(S, { action: 'setDriverPin', org: ORG, carId: 'car1', pin: '1234' }, 'ownerTok');
  ck('자기 PIN 을 그대로 다시 정하기는 된다', r.code, 200);
  r = await admCall(S, { action: 'setDriverPin', org: ORG, carId: 'car1', pin: '12' }, 'ownerTok');
  ck('4자리 아님 → 400', r.code, 400);

  /* PIN 을 바꾸면 기기 묶기를 풀고 토큰을 무효로 한다 */
  S = base();
  await login(S, { deviceId: 'DEV-A' });
  ck('묶임이 있다(대조)', !!S.docs['driverDevices/' + ORG + '_car1'], true);
  S.calls = [];
  await admCall(S, { action: 'setDriverPin', org: ORG, carId: 'car1', pin: '7777' }, 'ownerTok');
  ck('PIN 바꾸면 기기 묶기 해제', !S.docs['driverDevices/' + ORG + '_car1'], true);
  ck('토큰 무효화 호출', S.calls.filter(c => c[0] === 'revokeRefreshTokens').length, 1);

  /* 지우기 */
  S = base();
  await login(S);
  S.calls = [];
  r = await admCall(S, { action: 'removeDriverPin', org: ORG, carId: 'car1' }, 'ownerTok');
  ck('PIN 지우기 200', r.code, 200);
  ck('PIN 문서 삭제', !S.docs['driverPins/' + ORG + '_car1'], true);
  ck('기기 묶기 삭제', !S.docs['driverDevices/' + ORG + '_car1'], true);
  ck('기사 명부 삭제(규칙이 막는다)', !S.docs['orgs/' + ORG + '/drivers/drv_' + ORG + '_car1'], true);
  ck('토큰 무효화', S.calls.filter(c => c[0] === 'revokeRefreshTokens').length, 1);
  ck('users 문서는 남긴다(기록 때문)', !!S.docs['users/drv_' + ORG + '_car1'], true);
  ck('로그인 기록은 남긴다', Object.keys(S.docs).some(k => k.indexOf('driverLogins/') === 0), true);
  ck('지운 뒤 로그인 → 401', (await login(S)).code, 401);

  r = await admCall(base(), { action: 'removeDriverPin', org: ORG, carId: 'car1' }, 'otherTok');
  ck('남의 업체 PIN 지우기 → 403', r.code, 403);
}

console.log('\n════ 13. admin-account — checkPinDup (회원·직원 PIN 저장 때) ════');
{
  const S = base();
  let r = await admCall(S, { action: 'checkPinDup', org: ORG, pin: '1234' }, 'ownerTok');
  ck('겹치면 dup=true', r.body.dup, true);
  ck('어느 차량인지 알려 준다', r.body.carId, 'car1');
  ck('PIN 값·해시를 돌려주지 않는다',
    JSON.stringify(r.body).indexOf(pinHash('1234', ORG)) < 0, true);
  ck('응답 키는 ok·dup·carId 뿐', Object.keys(r.body).sort().join(), 'carId,dup,ok');
  r = await admCall(S, { action: 'checkPinDup', org: ORG, pin: '9999' }, 'ownerTok');
  ck('안 겹치면 dup=false', r.body.dup, false);
  r = await admCall(S, { action: 'checkPinDup', org: ORG, pin: 'ab' }, 'ownerTok');
  ck('4자리 아니면 dup=false', r.body.dup, false);
  r = await admCall(S, { action: 'checkPinDup', org: ORG, pin: '1234' }, 'otherTok');
  ck('남의 업체 → 403', r.code, 403);
}

console.log('\n════ 14. admin-account — driverInfo (PIN 값이 안 나온다) ════');
{
  const S = base();
  await login(S, { deviceId: 'DEV-A' });                  // 성공
  S.now += 60000;
  await login(S, { deviceId: 'DEV-B' });                  // 실패(다른 기기) — 차량을 안다
  await login(S, { pin: '0000', deviceId: 'DEV-A' });     // 실패(틀린 PIN) — 차량을 모른다
  const r = await admCall(S, { action: 'driverInfo', org: ORG }, 'ownerTok');
  ck('200', r.code, 200);
  ck('car1 PIN 있음', r.body.info.car1.hasPin, true);
  ck('car1 기기 묶임', r.body.info.car1.deviceBound, true);
  ck('car2 PIN 있음', r.body.info.car2.hasPin, true);
  ck('car2 기기 안 묶임', r.body.info.car2.deviceBound, undefined);
  ck('car1 기록 2건 (성공 + 다른 기기)', r.body.info.car1.logins.length, 2);
  ck('최신이 먼저 (실패가 위)', r.body.info.car1.logins[0].ok, false);
  ck('실패 사유도 보인다', r.body.info.car1.logins[0].why, 'device');
  /* 틀린 PIN 은 **누구 것인지 알 수 없다** → 차량에 붙이지 않는다(붙이면 그 차량 PIN 을 캐는 단서가 된다) */
  ck('틀린 PIN 시도는 차량에 안 붙는다',
    r.body.info.car1.logins.filter(g => g.why === 'badpin').length, 0);
  const txt = JSON.stringify(r.body);
  ck('응답에 PIN 원문 없음', txt.indexOf('"1234"') < 0, true);
  ck('응답에 해시 없음', txt.indexOf(pinHash('1234', ORG)) < 0, true);
  ck('응답에 업체번호 없음', txt.indexOf('123456') < 0, true);
  ck('응답에 기기 id 원문 없음', txt.indexOf('DEV-A') < 0, true);

  /* 색인이 없으면 PIN·기기만이라도 돌려준다 */
  const S2 = base();
  S2.orderByThrows = true;
  const r2 = await admCall(S2, { action: 'driverInfo', org: ORG }, 'ownerTok');
  ck('색인 없을 때 partial=true', r2.body.partial, true);
  ck('그래도 PIN 상태는 온다', r2.body.info.car1.hasPin, true);

  ck('남의 업체 → 403', (await admCall(base(), { action: 'driverInfo', org: ORG }, 'otherTok')).code, 403);
}

console.log('\n════ 15. admin-account — migrateDriverData (옛 PIN 옮기기) ════');
{
  let S = base();
  delete S.docs['driverPins/' + ORG + '_car1'];
  delete S.docs['driverPins/' + ORG + '_car2'];
  let r = await admCall(S, { action: 'migrateDriverData', org: ORG,
    cars: [{ carId: 'car1', pin: '1111' }, { carId: 'car2', pin: '2222' }] }, 'ownerTok');
  ck('200', r.code, 200);
  ck('moved 2', r.body.moved, 2);
  ck('car1 해시', S.docs['driverPins/' + ORG + '_car1'].pinHash, pinHash('1111', ORG));
  ck('car2 해시', S.docs['driverPins/' + ORG + '_car2'].pinHash, pinHash('2222', ORG));
  ck('옮긴 PIN 으로 바로 로그인된다', (await login(S, { pin: '1111' })).code, 200);

  /* 옛 자료에 같은 PIN 이 둘 — 첫 것만 */
  S = base();
  delete S.docs['driverPins/' + ORG + '_car1'];
  delete S.docs['driverPins/' + ORG + '_car2'];
  r = await admCall(S, { action: 'migrateDriverData', org: ORG,
    cars: [{ carId: 'car1', pin: '3333' }, { carId: 'car2', pin: '3333' }] }, 'ownerTok');
  ck('겹친 PIN → dup 1', r.body.dup, 1);
  ck('첫 차량만 옮겼다', r.body.moved, 1);
  ck('car2 는 비어 있다', !S.docs['driverPins/' + ORG + '_car2'], true);

  r = await admCall(base(), { action: 'migrateDriverData', org: ORG,
    cars: [{ carId: 'car1', pin: '12' }, { carId: '', pin: '1111' }] }, 'ownerTok');
  ck('이상한 줄은 bad 로 센다', r.body.bad, 2);
  ck('남의 업체 → 403', (await admCall(base(), { action: 'migrateDriverData', org: ORG, cars: [] }, 'otherTok')).code, 403);
}

console.log('\n════ 16. _test 출입 허용 계정 (v254 와 같은 세 갈래) ════');
{
  const mk = () => {
    const S = base();
    Object.assign(S.docs, {
      ['orgCodes/654321']: { orgId: TEST },
      ['driverPins/' + TEST + '_car1']: { org: TEST, carId: 'car1', pinHash: pinHash('1234', TEST) },
      ['admins/MASTER1']: { role: 'master' }
    });
    return S;
  };
  ck('출입 허용 → _test PIN 정하기', (await admCall(mk(), { action: 'setDriverPin', org: TEST, carId: 'car9', pin: '8888' }, 'taTok')).code, 200);
  ck('출입 허용 → _test driverInfo', (await admCall(mk(), { action: 'driverInfo', org: TEST }, 'taTok')).code, 200);
  ck('출입 허용 → 남의 실업체는 거부', (await admCall(mk(), { action: 'driverInfo', org: ORG }, 'taTok')).code, 403);
  ck('표시 없는 계정 → _test 거부', (await admCall(mk(), { action: 'driverInfo', org: TEST }, 'otherTok')).code, 403);
  /* _test 기사는 소유자가 마스터 → 체험 만료와 무관하게 로그인된다 */
  const S = mk();
  const r = await drvCall(S, { action: 'login', orgCode: '654321', pin: '1234', deviceId: 'DT' });
  ck('_test 기사 로그인 200', r.code, 200);
  ck('_test 기사 ownerUid = 마스터', (S.docs['orgs/' + TEST + '/drivers/drv_' + TEST + '_car1'] || {}).ownerUid, MASTER);
}

console.log('\n════ 17. 출처·메서드·환경변수 ════');
{
  const S = base();
  const h = E.makeHandler(SRC.drv, S);
  let s = E.res();
  await h({ method: 'POST', headers: { origin: 'https://evil.example' }, body: { action: 'login' } }, s);
  ck('허용 안 된 출처 → 403', s.code, 403);
  s = E.res();
  await h({ method: 'GET', headers: { origin: 'https://cosroad.com' }, body: {} }, s);
  ck('GET → 405', s.code, 405);
  s = E.res();
  await h({ method: 'OPTIONS', headers: { origin: 'https://cosroad.com' } }, s);
  ck('OPTIONS → 200', s.code, 200);

  const S2 = base({ env: { FIREBASE_SERVICE_ACCOUNT: '{"project_id":"x"}' } });   // OTP_SECRET 없음
  ck('OTP_SECRET 없으면 → 500', (await drvCall(S2, { action: 'login' })).code, 500);
  ck('알 수 없는 action → 400', (await drvCall(base(), { action: 'nope' }, 'ownerTok')).code, 400);
  /* createCustomToken 이 터지면 안내가 나간다 */
  const S3 = base(); S3.tokenThrows = true;
  const r = await login(S3);
  ck('토큰 만들기 실패 → 500', r.code, 500);
  ck('안내 문구', r.body.message, '로그인 토큰을 만들지 못했어요. 관리자에게 알려 주세요.');
}

console.log('\n════ 18. 옛 판(2eadaaa) 과 대조 ════');
{
  const chk = (label, cond) => { if (cond) { pass++; console.log('  ✔ ' + label); } else { fail++; console.log('  ✘ ' + label); } };
  chk('옛 admin-account 에는 setDriverPin 이 없다', SRC_OLD.admin.indexOf('setDriverPin') < 0);
  chk('새 admin-account 에 7동작이 다 있다',
    ['issueOrgCode', 'setDriverPin', 'checkPinDup', 'removeDriverPin', 'unbindDevice', 'driverInfo', 'migrateDriverData']
      .every(a => SRC.admin.indexOf("action === '" + a + "'") >= 0));
  chk('driver-auth 는 toISOString 을 쓰지 않는다 (UTC 날짜 함정)', SRC.drv.indexOf('toISOString') < 0);
  chk('admin-account 도 toISOString 을 쓰지 않는다', SRC.admin.indexOf('toISOString') < 0);
  chk('새 환경변수를 만들지 않았다 (OTP_SECRET 재사용)',
    (SRC.drv.match(/process\.env\.[A-Z_]+/g) || []).concat(SRC.admin.match(/process\.env\.[A-Z_]+/g) || [])
      .every(v => ['process.env.FIREBASE_SERVICE_ACCOUNT', 'process.env.OTP_SECRET'].indexOf(v) >= 0));
  chk('허용 출처 목록이 admin-account 와 같다',
    JSON.stringify(SRC.drv.match(/const ALLOWED = \[[^\]]*\]/)[0]) === JSON.stringify(SRC.admin.match(/const ALLOWED = \[[^\]]*\]/)[0]));
  chk('PIN 해시에 OTP_SECRET 이 섞인다 (두 파일이 같은 식)',
    SRC.drv.indexOf("sha256(pin + '|' + org + '|' + secret)") >= 0
    && SRC.admin.indexOf("sha256(String(pin) + '|' + String(org) + '|' + String(secret))") >= 0);
  chk('기사 uid 규칙이 두 파일에서 같다',
    SRC.drv.indexOf("'drv_' + org + '_' + carId") >= 0 && SRC.admin.indexOf("'drv_' + org + '_' + carId") >= 0);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
})();
