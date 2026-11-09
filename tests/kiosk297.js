/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드60-B4b — **출석 전용 기기**(v297).
   관리자 모드를 열어 둔 기기에 «회원» PIN 판을 띄우면 안 된다(사장님 결정 2) →
   업체 번호 + **출석기기 코드**로 들어오는 **PIN 판 전용** 입구를 만들었다.
   보는 것: ① 로그인(코드 대조·상한·기기 묶기·기간) ② 토큰 claim 이 `{kiosk,org}` 뿐인가
            ③ 출석 찍기(`punchMember` 재사용 · 응답은 **그 사람 것만** · 명단 0)
            ④ 알림톡을 **서버가** 보내나 · **두 번 안 나가나** · 명부에 없는 번호는 안 보내나
            ⑤ 코드 창구(발급·지우기·기기 풀기) · 코드 원문은 **발급 응답에만**
            ⑥ 기기 토큰으로 **다른 동작**(pinCheckin·checkin)은 못 하나
   가짜 firebase-admin · **실제 알리고 호출 0건**(가짜 fetch) · 실제 쓰기 0. */
const crypto = require('crypto');
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 46)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const SECRET = 'SEKRIT-TEST';
const ORG = 'academy_owner1', OWNER = 'OWNER1', CODE = '123456', KCODE = '777777';
const DAY = 86400000, NOW = Date.UTC(2026, 9, 31, 11, 20, 0);
const hashOf = (v) => sha(v + '|' + ORG + '|' + SECRET);
const MEM = [{ id: 1, name: '가하은', phone: '010-1111-1111', pin: '1111' },
             { id: 2, name: '나다움', phone: '010-2222-2222' }];

function st(over) {
  over = over || {};
  const S = makeState({ now: NOW });
  S.docs['users/' + OWNER] = { orgId: ORG, approved: true, withdrawn: false,
    paidUntil: over.expired ? NOW - DAY : NOW + 30 * DAY, plan: 'paid' };
  S.docs['orgCodes/' + CODE] = { orgId: ORG, updatedAt: 1 };
  if (over.noKiosk !== true) S.docs['kioskCodes/' + ORG] = { org: ORG, codeHash: hashOf(KCODE), updatedAt: 1 };
  S.docs['orgs/' + ORG + '/data/members'] = { value: JSON.stringify(MEM), updatedAt: 1 };
  S.docs['orgs/' + ORG + '/data/orgDriver'] = {
    value: JSON.stringify({ name: '가온학원', icon: '🚐', bizType: 'academy' }), updatedAt: 1 };
  if (over.memberPin) S.docs['memberPins/' + ORG + '_1'] = { org: ORG, memberId: '1', pinHash: hashOf(over.memberPin), updatedAt: 1 };
  S.tokens = { ownerTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } } };
  S.env = { FIREBASE_SERVICE_ACCOUNT: '{"project_id":"x"}', OTP_SECRET: SECRET,
            ALIGO_KEY: 'K', ALIGO_USER_ID: 'U', ALIGO_SENDER_KEY: 'SK', ALIGO_SENDER: '0212345678' };
  return S;
}
const kLogin = (S, over) => call(SRC.drv, S,
  Object.assign({ action: 'kioskLogin', orgCode: CODE, kioskCode: KCODE, deviceId: 'DEV1' }, over || {}),
  '', '1.2.3.4');
const kAtt = (S, pin, tok) => call(SRC.drv, S, { action: 'kioskCheckin', pin: pin }, tok || 'kioskTok', '1.2.3.4');
const adm = (S, body) => call(SRC.admin, S, body, 'ownerTok', '1.2.3.4');
/* 기기 토큰을 손에 넣는다 — 서버가 만든 custom token 을 그대로 쓸 수 없으니 claim 을 흉내 낸다 */
const asKiosk = (S) => { S.tokens.kioskTok = { uid: 'ksk_' + ORG, kiosk: true, org: ORG }; };
const attOf = (S) => {
  const d = S.docs['orgs/' + ORG + '/data/attendance'];
  if (!d) return null;
  try { return JSON.parse(d.value)['2026-10-31'] || null; } catch (e) { return null; }
};

(async () => {
  console.log('════ ① 로그인 — 코드 대조 · 기기 묶기 · 기간');
  {
    const S = st();
    const r = await kLogin(S);
    ck('업체 번호 + 출석기기 코드 → 200', r.code, 200);
    ck('★ 토큰을 받았다', !!(r.body || {}).token, true);
    ck('  업체 이름·업종도 함께 온다', ((r.body || {}).orgName || '') + '/' + ((r.body || {}).bizType || ''), '가온학원/academy');
    ck('★ 응답에 **명단이 없다**', /010-|가하은|나다움/.test(JSON.stringify(r.body)), false);
    ck('★ 기기가 묶였다(업체에 한 대)',
      JSON.stringify((S.docs['driverDevices/' + ORG + '_kiosk'] || {}).deviceId || null), '"DEV1"');
    ck('★ `users`·`drivers` 문서를 **만들지 않는다**(규칙이 전부 거부하게)',
      String(S.docs['users/ksk_' + ORG] || null) + '/' + String(S.docs['orgs/' + ORG + '/drivers/ksk_' + ORG] || null),
      'null/null');
    /* 틀린 코드 · 없는 번호는 **같은 문구** */
    const S2 = st();
    const r2 = await kLogin(S2, { kioskCode: '999999' });
    ck('틀린 코드 → 401', r2.code, 401);
    ck('  문구가 같다(업체 존재 여부가 안 샌다)', (r2.body || {}).message, '업체 번호 또는 PIN 이 맞지 않아요.');
    const S3 = st();
    const r3 = await kLogin(S3, { orgCode: '000000' });
    ck('없는 업체 번호 → 401 같은 문구', r3.code + '/' + ((r3.body || {}).message || ''),
      '401/업체 번호 또는 PIN 이 맞지 않아요.');
    /* 코드가 없는 업체 */
    const S4 = st({ noKiosk: true });
    const r4 = await kLogin(S4);
    ck('코드를 안 만든 업체 → 401', r4.code, 401);
    /* 다른 기기 */
    const S5 = st();
    await kLogin(S5);
    const r5 = await kLogin(S5, { deviceId: 'DEV2' });
    ck('★ 다른 기기는 403 device', r5.code + '/' + ((r5.body || {}).why || ''), '403/device');
    /* 기간 끝난 업체 */
    const S6 = st({ expired: true });
    const r6 = await kLogin(S6);
    ck('★ 기간 끝난 업체는 403 expired', r6.code + '/' + ((r6.body || {}).why || ''), '403/expired');
    ck('  그때는 기기도 안 묶는다', String(S6.docs['driverDevices/' + ORG + '_kiosk'] || null), 'null');
  }

  console.log('\n════ ② 출석 찍기 — `punchMember` 재사용 · 응답은 그 사람 것만');
  {
    const S = st({ memberPin: '1111' });
    asKiosk(S);
    const r = await kAtt(S, '1111');
    ck('200', r.code, 200);
    /* ★ v298(60-B4 보정1): `first`(그날 처음인가) 한 칸이 늘었다 — 알림톡을 하루 한 번만
       보내려고 **서버가** 가린다. 사람 정보는 늘지 않았다(그 점은 아래 줄이 지킨다). */
    ck('★ 이름·시각만 온다', Object.keys(r.body || {}).sort().join(','), 'date,first,name,ok,photo,sent,time');
    ck('  이름', (r.body || {}).name, '가하은');
    ck('★ 응답에 **번호가 없다**', /010-/.test(JSON.stringify(r.body)), false);
    ck('★ 출석이 그 칸에 찍혔다', JSON.stringify(attOf(S)), '{"1":"present"}');
    const t = S.docs['orgs/' + ORG + '/data/attendanceTime'];
    ck('  시각도 남는다(서버 KST)', /20:20/.test(String((t || {}).value || '')), true);
    const r2 = await kAtt(S, '9999');
    ck('틀린 PIN → 404 nomember', r2.code + '/' + ((r2.body || {}).why || ''), '404/nomember');
    /* 기간 끝난 업체 */
    const S2 = st({ memberPin: '1111', expired: true });
    asKiosk(S2);
    const r3 = await kAtt(S2, '1111');
    ck('★ 기간 끝나면 403 expired', r3.code + '/' + ((r3.body || {}).why || ''), '403/expired');
    ck('  그때는 출석도 안 찍힌다', String(attOf(S2)), 'null');
  }

  console.log('\n════ ③ 알림톡 — **서버가** 보낸다 · 두 번 안 나간다 · 명부 번호만');
  {
    const S = st({ memberPin: '1111' });
    asKiosk(S);
    const r = await kAtt(S, '1111');
    const sent = S.sent || [];
    ck('★ 알리고로 **한 번** 나갔다', sent.length, 1);
    ck('  알림톡 주소로 갔다', /alimtalk\/send/.test((sent[0] || {}).url || ''), true);
    ck('★ 응답의 `sent` 가 1', (r.body || {}).sent, 1);
    ck('  (실제 호출은 가짜다 — 바깥 통신 0건)', /aligo\.in/.test((sent[0] || {}).url || ''), true);
    /* ★ v298(60-B4 보정1): 같은 사람을 같은 날 또 찍으면 **더 안 보낸다**(쓰기·백업도 0) —
       v297 까지는 누를 때마다 한 건씩 나갔다(`tests/twice298.js` 가 그 자리를 자세히 잰다). */
    const r2 = await kAtt(S, '1111');
    ck('★ 다시 찍으면 알림톡 **0건 더**', (S.sent || []).length, 1);
    ck('  둘째 응답은 `first:false`', String((r2.body || {}).first), 'false');
    ck('  출석 칸은 그대로', JSON.stringify(attOf(S)), '{"1":"present"}');
    /* 번호가 명부에 없으면 안 보낸다 */
    const S2 = st({ memberPin: '1111' });
    S2.docs['orgs/' + ORG + '/data/members'] = {
      value: JSON.stringify([{ id: 1, name: '가하은', phone: '010-9999-9999', pin: '1111' }]), updatedAt: 1 };
    asKiosk(S2);
    /* 명부의 그 사람 번호는 **명부에 있는 번호**이므로 보낸다 — 「명부에 없는 번호」는
       서버가 명부에서 뽑으므로 생기지 않는다(그 점을 그대로 적어 둔다) */
    const r3 = await kAtt(S2, '1111');
    ck('명부에서 뽑은 번호로 보낸다', (S2.sent || []).length, 1);
    ck('  출석도 찍혔다', (r3.body || {}).ok, true);
    /* 번호가 없는 «회원» 은 알림톡 0 (출석은 찍힌다) */
    const S3 = st({ memberPin: '2222' });
    S3.docs['memberPins/' + ORG + '_2'] = { org: ORG, memberId: '2', pinHash: hashOf('3333'), updatedAt: 1 };
    S3.docs['orgs/' + ORG + '/data/members'] = {
      value: JSON.stringify([{ id: 2, name: '나다움' }]), updatedAt: 1 };
    asKiosk(S3);
    const r4 = await kAtt(S3, '3333');
    ck('번호 없는 «회원» — 출석은 찍히고 알림톡 0', String((r4.body || {}).ok) + '/' + ((S3.sent || []).length), 'true/0');
  }

  console.log('\n════ ④ 코드 창구 — 발급·지우기·기기 풀기');
  {
    const S = st({ noKiosk: true });
    const r = await adm(S, { action: 'issueKioskCode', org: ORG });
    ck('issueKioskCode → 200', r.code, 200);
    ck('★ 코드 6자리를 **그 자리에서만** 준다', /^\d{6}$/.test(String((r.body || {}).code || '')), true);
    ck('★ 서버에는 **해시만** 남는다',
      /^[0-9a-f]{64}$/.test(String((S.docs['kioskCodes/' + ORG] || {}).codeHash || '')), true);
    ck('  원문은 저장하지 않는다', /code":"\d{6}/.test(JSON.stringify(S.docs['kioskCodes/' + ORG])), false);
    /* 그 코드로 로그인된다 */
    const code2 = String((r.body || {}).code);
    const r2 = await call(SRC.drv, S, { action: 'kioskLogin', orgCode: CODE, kioskCode: code2, deviceId: 'DEV9' }, '', '1.2.3.4');
    ck('★ 새 코드로 로그인된다', r2.code, 200);
    /* 코드를 새로 만들면 기기·토큰이 끊긴다 */
    const r3 = await adm(S, { action: 'issueKioskCode', org: ORG });
    ck('코드를 새로 만들면 200', r3.code, 200);
    ck('★ 묶인 기기가 풀린다', String(S.docs['driverDevices/' + ORG + '_kiosk'] || null), 'null');
    /* 기기 풀기 */
    const S2 = st();
    await kLogin(S2);
    const r4 = await adm(S2, { action: 'unbindDevice', org: ORG, kiosk: true });
    ck('unbindDevice(kiosk) → 200', r4.code, 200);
    ck('  기기가 풀렸다', String(S2.docs['driverDevices/' + ORG + '_kiosk'] || null), 'null');
    /* 코드 지우기 */
    const S3 = st();
    const r5 = await adm(S3, { action: 'removeKioskCode', org: ORG });
    ck('removeKioskCode → 200', r5.code, 200);
    ck('  코드가 사라졌다', String(S3.docs['kioskCodes/' + ORG] || null), 'null');
    const r6 = await kLogin(S3);
    ck('★ 지운 뒤에는 로그인 안 된다', r6.code, 401);
    /* 기간 끝난 업체는 만들 수 없다(읽기만) */
    const S4 = st({ expired: true });
    const r7 = await adm(S4, { action: 'issueKioskCode', org: ORG });
    ck('★ 기간 끝난 업체는 403 expired', r7.code + '/' + ((r7.body || {}).why || ''), '403/expired');
    /* 정보 읽기는 열려 있다(규칙도 「만료 업체는 읽기만」) */
    const r8 = await adm(S4, { action: 'kioskInfo', org: ORG });
    ck('  `kioskInfo` 는 기간이 끝나도 읽힌다', r8.code + '/' + String((r8.body || {}).hasCode), '200/true');
    ck('  원문·해시는 안 준다', /[0-9a-f]{64}|\d{6}/.test(JSON.stringify(r8.body || {})), false);
  }

  console.log('\n════ ⑤ 기기 토큰으로 **다른 동작**은 못 한다');
  {
    const S = st({ memberPin: '1111' });
    asKiosk(S);
    const r = await call(SRC.drv, S, { action: 'pinCheckin', org: ORG, pin: '1111', member: true }, 'kioskTok', '1.2.3.4');
    ck('★ 관리자 판(`pinCheckin`) → 403', r.code, 403);
    const r2 = await call(SRC.drv, S, { action: 'checkin', deviceId: 'DEV1' }, 'kioskTok', '1.2.3.4');
    ck('★ 출퇴근(`checkin`) → 403', r2.code, 403);
    const r3 = await call(SRC.admin, S, { action: 'issueKioskCode', org: ORG }, 'kioskTok', '1.2.3.4');
    ck('★ 코드 발급 → 403', r3.code, 403);
    const r4 = await call(SRC.drv, S, { action: 'kioskCheckin', pin: '1111' }, 'ownerTok', '1.2.3.4');
    ck('★ 관리자 토큰으로 기기 창구 → 403', r4.code, 403);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 firebase-admin · 가짜 fetch — **실제 알리고 호출 0건** · 실제 쓰기 0');
  process.exit(fail ? 1 : 0);
})();
