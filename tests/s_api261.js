/* v261 api 스텁 검사 — api/signup.js 신설 · api/otp.js purpose 'signup' · lib/otp-core.js 분리
   전: b6651bc (v260) · 후: 작업 중
   검증 3원칙 A: 국세청 호출 모양을 **공식 Swagger 와 항목 단위**로 본다
             B: users 문서·계정·문자의 **실제 값**을 꺼내 본다
   ★ 실제 호출 0 · 실제 키 0 (fetch 를 전부 가로챈다) */
const crypto = require('crypto');
const E = require('./env261.js');
const { SRC_SIGNUP, SRC_OTP, SRC_CORE, OLD_OTP, OLD_REF,
        makeState, makeHandler, req, res, ntsValid, ntsInvalid } = E;

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(58) + String(got).slice(0, 70)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const SECRET = 'SEKRIT-TEST';
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const otpId = (digits, purpose) => sha(digits + purpose);
const PHONE = '01012345678';
const CODE  = '975310';          // 폰번호 안에 들어 있지 않은 6자리 (검사가 헛걸리지 않게)
const LOGIN = PHONE + '@phone.cosroad.com';
const CEO = '홍길동';
const OPEN = '20200301';

/* 체크섬이 맞는 사업자번호 — 마지막 자리를 식으로 직접 구한다(국세청 공개 검증식) */
function fixBizNo(nine) {
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(nine[i]) * w[i];
  sum += Math.floor((Number(nine[8]) * 5) / 10);
  return nine + String((10 - (sum % 10)) % 10);
}
const BNO = fixBizNo('211881143');          // 체크섬 통과용 10자리 (실제 업체와 무관)

/* 인증번호가 살아 있는 상태를 만든다 */
function withCode(S, code, purpose) {
  S.docs['otp/' + otpId(PHONE, purpose || 'signup')] = {
    codeHash: sha(String(code) + SECRET), expiresAt: Date.now() + 60000, tries: 0, sentAt: [Date.now()]
  };
  return S;
}

function sgState(over) {
  const S = makeState(over);
  /* 넘겨준 국세청 응답이 있으면 그것을 쓴다 — 여기서 덮으면 ④⑤가 늘 통과해 버린다 */
  if (!(over && 'ntsReply' in over)) S.ntsReply = ntsValid('01');
  return S;
}

const body = (over) => Object.assign({
  action: 'create', phone: PHONE, code: CODE, password: 'pw1234',
  bizType: 'academy', orgName: '코스로드학원', agree: true,
  b_no: BNO, p_nm: CEO, start_dt: OPEN
}, over || {});

async function callSg(S, b, ip) {
  const h = makeHandler(SRC_SIGNUP, S).handler;
  const r = res();
  await h(req(b, null, ip), r);
  return r;
}
async function callOtp(SRC, S, b, ip) {
  const h = makeHandler(SRC, S).handler;
  const r = res();
  await h(req(b, null, ip), r);
  return r;
}

(async () => {

/* ══ ① 사업자번호 체크섬 20건 (국세청 공개 검증식) ══════════════════════════ */
console.log('\n① 사업자번호 체크섬 — 맞는 번호 10 · 틀린 번호 10');
{
  const mod = makeHandler(SRC_SIGNUP, sgState());
  const f = mod.bizNoChecksumOk;
  ck('bizNoChecksumOk 를 꺼낼 수 있다', typeof f, 'function');
  const nines = ['211881143', '123456789', '000000000', '999999999', '101010101',
                 '314159265', '271828182', '602214076', '662607015', '137035999'];
  let okc = 0, badc = 0;
  nines.forEach((n) => { if (f(fixBizNo(n))) okc++; });
  nines.forEach((n) => {
    const good = fixBizNo(n);
    const wrong = good.slice(0, 9) + String((Number(good[9]) + 1) % 10);   // 마지막 자리만 틀린 번호
    if (!f(wrong)) badc++;
  });
  ck('맞는 번호 10건 전부 통과', okc, 10);
  ck('마지막 자리만 틀린 10건 전부 거부', badc, 10);
  ck('9자리·11자리·글자 섞임 거부',
    [f('12345678'), f('12345678901'), f('12345678ab'), f(''), f(null)].join(','),
    'false,false,false,false,false');
  ck('줄표가 있어도 본다 (211-88-1143 꼴)', f(BNO.slice(0,3)+'-'+BNO.slice(3,5)+'-'+BNO.slice(5)), true);
}

/* ══ ② bizCheck — 국세청 호출 모양 (원칙 A, 공식 Swagger 대조) ══════════════ */
console.log('\n② bizCheck — 국세청 호출 모양이 공식 명세와 같은가');
{
  const S = sgState();
  const r = await callSg(S, { action: 'bizCheck', b_no: BNO, p_nm: CEO, start_dt: OPEN });
  ck('통과 응답', r.code + ' ' + (r.body && r.body.ok), '200 true');
  ck('국세청 호출 1회', S.nts.length, 1);
  const c = S.nts[0] || {};
  ck('POST 만 쓴다', c.method, 'POST');
  ck('주소 = host+basePath+/validate',
    c.url.split('?')[0], 'https://api.odcloud.kr/api/nts-businessman/v1/validate');
  ck('serviceKey 는 쿼리', /[?&]serviceKey=/.test(c.url), true);
  ck('returnType=JSON 쿼리', /[?&]returnType=JSON/.test(c.url), true);
  ck('본문 = { businesses:[ … ] }', Object.keys(c.body || {}).join(','), 'businesses');
  ck('본문 1건만', (c.body.businesses || []).length, 1);
  ck('보내는 칸은 셋뿐 (b_no·start_dt·p_nm)',
    Object.keys(c.body.businesses[0]).sort().join(','), 'b_no,p_nm,start_dt');
  ck('   p_nm2 를 보내지 않는다 (공식 유의사항)', 'p_nm2' in c.body.businesses[0], false);
  ck('b_no 는 숫자 10자리', c.body.businesses[0].b_no, BNO);
  ck('start_dt 는 YYYYMMDD', c.body.businesses[0].start_dt, OPEN);
  ck('Content-Type JSON', (c.headers || {})['Content-Type'], 'application/json');
  ck('응답에 사업자번호·대표자를 담지 않는다',
    JSON.stringify(r.body).indexOf(BNO) < 0 && JSON.stringify(r.body).indexOf(CEO) < 0, true);
  ck('응답 칸은 ok·bStt·taxType 뿐', Object.keys(r.body).sort().join(','), 'bStt,ok,taxType');
  ck('로그·응답에 키 값이 없다',
    (S.logs.join('|') + JSON.stringify(r.body)).indexOf('TEST-KEY-NOT-REAL') < 0, true);
  ck('   대조 — 키 값은 국세청 호출 URL 에는 들어간다(들어가야 호출된다)',
    c.url.indexOf('TEST-KEY-NOT-REAL') >= 0, true);
}

/* ══ ③ 체크섬이 틀리면 국세청을 부르지 않는다 (대조 시험) ═══════════════════ */
console.log('\n③ 체크섬이 틀리면 국세청 호출 0 — 맞으면 1 (대조)');
{
  const bad = BNO.slice(0, 9) + String((Number(BNO[9]) + 1) % 10);
  const S1 = sgState();
  const r1 = await callSg(S1, { action: 'bizCheck', b_no: bad, p_nm: CEO, start_dt: OPEN });
  ck('틀린 체크섬 → 400', r1.code, 400);
  ck('   국세청 호출 0', S1.nts.length, 0);
  const S2 = sgState();
  await callSg(S2, { action: 'bizCheck', b_no: BNO, p_nm: CEO, start_dt: OPEN });
  ck('   대조: 맞는 체크섬이면 1 (검사가 살아 있다)', S2.nts.length, 1);
}

/* ══ ④ 진위 불일치·휴업·폐업은 통과시키지 않는다 ═══════════════════════════ */
console.log('\n④ 진위 불일치 · 휴업 · 폐업');
{
  const S1 = sgState({ ntsReply: ntsInvalid() });
  const r1 = await callSg(S1, { action: 'bizCheck', b_no: BNO, p_nm: CEO, start_dt: OPEN });
  ck('valid 02 → 400', r1.code, 400);
  ck('   문구에 「맞지 않아요」', /맞지 않아요/.test(r1.body.message), true);

  const S2 = sgState({ ntsReply: ntsValid('02', '휴업자') });
  const r2 = await callSg(S2, { action: 'bizCheck', b_no: BNO, p_nm: CEO, start_dt: OPEN });
  ck('b_stt_cd 02 휴업 → 400', r2.code, 400);
  ck('   문구에 「휴업」', /휴업/.test(r2.body.message), true);

  const S3 = sgState({ ntsReply: ntsValid('03', '폐업자') });
  const r3 = await callSg(S3, { action: 'bizCheck', b_no: BNO, p_nm: CEO, start_dt: OPEN });
  ck('b_stt_cd 03 폐업 → 400', r3.code, 400);
  ck('   문구에 「폐업」', /폐업/.test(r3.body.message), true);

  const S4 = sgState({ ntsReply: ntsValid('09', '알 수 없음') });
  const r4 = await callSg(S4, { action: 'bizCheck', b_no: BNO, p_nm: CEO, start_dt: OPEN });
  ck('모르는 상태코드도 막는다 → 400', r4.code, 400);

  /* 진위는 맞았는데 status 가 없는 응답 — 판단할 수 없으니 통과시키지 않는다 */
  const noStatus = ntsValid('01'); delete noStatus.data[0].status;
  const S5 = sgState({ ntsReply: noStatus });
  const r5 = await callSg(S5, { action: 'bizCheck', b_no: BNO, p_nm: CEO, start_dt: OPEN });
  ck('status 가 없으면 → 503', r5.code, 503);
}

/* ══ ⑤ 국세청 장애·키 없음이면 가입을 막는다 ═══════════════════════════════ */
console.log('\n⑤ 국세청 장애 · 키 없음 → 막는다 (조용히 통과 금지)');
{
  const noKey = sgState();
  delete noKey.env.DATA_GO_KR_KEY;
  const r0 = await callSg(noKey, { action: 'bizCheck', b_no: BNO, p_nm: CEO, start_dt: OPEN });
  ck('키 없음 → 503', r0.code, 503);
  ck('   국세청 호출 0', noKey.nts.length, 0);
  ck('   로그에 키 없음만 적는다', noKey.logs.join('|'), '[signup] 국세청 키 없음');

  const thr = sgState({ ntsThrow: true });
  ck('호출 자체 실패 → 503', (await callSg(thr, { action: 'bizCheck', b_no: BNO, p_nm: CEO, start_dt: OPEN })).code, 503);
  ck('   로그에 번호·키를 적지 않는다',
    thr.logs.join('|').indexOf(BNO) < 0 && thr.logs.join('|').indexOf('TEST-KEY-NOT-REAL') < 0, true);

  for (const sc of ['BAD_JSON_REQUEST', 'REQUEST_DATA_MALFORMED', 'TOO_LARGE_REQUEST', 'INTERNAL_ERROR', 'HTTP_ERROR']) {
    const S = sgState({ ntsReply: { status_code: sc } });
    const r = await callSg(S, { action: 'bizCheck', b_no: BNO, p_nm: CEO, start_dt: OPEN });
    ck('status_code ' + sc + ' → 503', r.code, 503);
  }
  const noData = sgState({ ntsReply: { status_code: 'OK', data: [] } });
  ck('data 가 비면 → 503', (await callSg(noData, { action: 'bizCheck', b_no: BNO, p_nm: CEO, start_dt: OPEN })).code, 503);
  const http500 = sgState({ ntsStatus: 500, ntsReply: null });
  ck('HTTP 500 + 본문 없음 → 503', (await callSg(http500, { action: 'bizCheck', b_no: BNO, p_nm: CEO, start_dt: OPEN })).code, 503);
}

/* ══ ⑥ bizCheck 빈도 제한 — IP 1시간 30회 (대조: 30번째는 통과) ═════════════ */
console.log('\n⑥ bizCheck 빈도 제한');
{
  const S = sgState();
  let last = null;
  for (let i = 0; i < 30; i++) last = await callSg(S, { action: 'bizCheck', b_no: BNO, p_nm: CEO, start_dt: OPEN });
  ck('30번째까지 통과 (대조)', last.code, 200);
  const r31 = await callSg(S, { action: 'bizCheck', b_no: BNO, p_nm: CEO, start_dt: OPEN });
  ck('31번째 → 429', r31.code, 429);
  ck('   국세청 호출은 30회에서 멈춘다', S.nts.length, 30);
}

/* ══ ⑦ create — 형식 검사 (어긋나면 계정을 만들지 않는다) ══════════════════ */
console.log('\n⑦ create 형식 검사 — 계정 생성 0');
{
  const cases = [
    ['번호 형식', { phone: '0211112222' }],
    ['인증번호 5자리', { code: '12345' }],
    ['비밀번호 5자', { password: 'pw123' }],
    ['업종 목록 밖', { bizType: 'hospital' }],
    ['업체명 빈 칸', { orgName: '  ' }],
    ['업체명 41자', { orgName: '가'.repeat(41) }],
    ['약관 미동의', { agree: false }]
  ];
  for (const [label, over] of cases) {
    const S = withCode(sgState(), CODE);
    const r = await callSg(S, body(over));
    const made = S.calls.filter(c => c[0] === 'createUser').length;
    ck(label + ' → 400 · 계정 0', r.code + '/' + made, '400/0');
  }
  /* 대조 — 같은 환경에서 바른 입력이면 계정이 하나 생긴다 */
  const S2 = withCode(sgState(), CODE);
  const r2 = await callSg(S2, body());
  ck('대조: 바른 입력이면 200 · 계정 1',
    r2.code + '/' + S2.calls.filter(c => c[0] === 'createUser').length, '200/1');
}

/* ══ ⑧ create — 인증번호 ════════════════════════════════════════════════════ */
console.log('\n⑧ create 인증번호 — 틀림 · 만료 · 재사용');
{
  const S1 = withCode(sgState(), CODE);
  const r1 = await callSg(S1, body({ code: '000111' }));
  ck('틀린 인증번호 → 400 · 계정 0',
    r1.code + '/' + S1.calls.filter(c => c[0] === 'createUser').length, '400/0');
  ck('   국세청도 부르지 않는다 (인증이 먼저)', S1.nts.length, 0);
  ck('   틀린 횟수가 올라간다', (S1.docs['otp/' + otpId(PHONE, 'signup')] || {}).tries, 1);

  const S2 = sgState();
  S2.docs['otp/' + otpId(PHONE, 'signup')] =
    { codeHash: sha(CODE + SECRET), expiresAt: Date.now() - 1000, tries: 0 };
  const r2 = await callSg(S2, body());
  ck('만료된 인증번호 → 400', r2.code, 400);
  ck('   문구는 「만료」', /만료/.test(r2.body.message), true);

  const S3 = withCode(sgState(), CODE);
  await callSg(S3, body());
  ck('맞춘 인증번호는 바로 버린다', S3.docs['otp/' + otpId(PHONE, 'signup')] === undefined, true);
  const r3b = await callSg(S3, body({ phone: PHONE }));
  ck('   같은 코드 재사용 → 400', r3b.code, 400);

  const S4 = sgState();   // 아예 받은 적이 없는 번호
  const r4 = await callSg(S4, body());
  ck('받은 적 없는 번호 → 400 · 계정 0',
    r4.code + '/' + S4.calls.filter(c => c[0] === 'createUser').length, '400/0');

  /* 쓰임새가 다르면 안 맞는다 — reset 코드로 가입할 수 없다 */
  const S5 = withCode(sgState(), CODE, 'reset');
  const r5 = await callSg(S5, body());
  ck('reset 쓰임새 코드로는 가입 안 됨 → 400', r5.code, 400);
}

/* ══ ⑨ 화면을 건너뛰어도 서버가 다시 거부한다 ══════════════════════════════ */
console.log('\n⑨ bizCheck 를 건너뛰고 create 직행 — 서버가 다시 묻는다');
{
  const S = withCode(sgState({ ntsReply: ntsInvalid() }), CODE);
  const r = await callSg(S, body());
  ck('진위 불일치 → 400 · 계정 0',
    r.code + '/' + S.calls.filter(c => c[0] === 'createUser').length, '400/0');
  ck('   create 안에서도 국세청을 1회 부른다', S.nts.length, 1);

  const S2 = withCode(sgState({ ntsReply: ntsValid('03', '폐업자') }), CODE);
  const r2 = await callSg(S2, body());
  ck('폐업 사업자 → 400 · 계정 0',
    r2.code + '/' + S2.calls.filter(c => c[0] === 'createUser').length, '400/0');

  const S3 = withCode(sgState({ ntsThrow: true }), CODE);
  const r3 = await callSg(S3, body());
  ck('국세청 장애 → 503 · 계정 0',
    r3.code + '/' + S3.calls.filter(c => c[0] === 'createUser').length, '503/0');

  const S4 = withCode(sgState(), CODE);
  delete S4.env.DATA_GO_KR_KEY;
  const r4 = await callSg(S4, body());
  ck('키 없음 → 503 · 계정 0',
    r4.code + '/' + S4.calls.filter(c => c[0] === 'createUser').length, '503/0');
  /* 사업자 칸을 아예 빼고 불러도 통과하지 않는다 */
  const S5 = withCode(sgState(), CODE);
  const r5 = await callSg(S5, body({ b_no: undefined, p_nm: undefined, start_dt: undefined }));
  ck('사업자 칸 없이 호출 → 400 · 계정 0',
    r5.code + '/' + S5.calls.filter(c => c[0] === 'createUser').length, '400/0');
}

/* ══ ⑩ 이미 가입된 번호 ════════════════════════════════════════════════════ */
console.log('\n⑩ 이미 가입된 번호');
{
  const S = withCode(sgState(), CODE);
  S.authByEmail[LOGIN] = { uid: 'OLD1', email: LOGIN };
  const r = await callSg(S, body());
  ck('409', r.code, 409);
  ck('   계정을 또 만들지 않는다', S.calls.filter(c => c[0] === 'createUser').length, 0);
  ck('   문구에 로그인·비밀번호 길 안내', /로그인/.test(r.body.message), true);
}

/* ══ ⑪ users 쓰기 실패 → 반쪽 계정을 남기지 않는다 ═════════════════════════ */
console.log('\n⑪ users 쓰기 실패 → 방금 만든 계정을 지운다');
{
  const S = withCode(sgState(), CODE);
  const real = makeHandler(SRC_SIGNUP, S);     // 핸들러를 먼저 만들고 set 을 막는다
  /* users 문서 set 만 실패시킨다 */
  const r = res();
  S.docs.__blockUsersSet = true;
  const h = real.handler;
  /* set 가로채기 — docs 프록시 대신 users/ 경로 쓰기를 막는 가장 작은 방법 */
  const origSet = Object.getOwnPropertyDescriptor(Object.prototype, '__x');   // (사용 안 함)
  S.queryThrow = false;
  /* makeHandler 안의 refOf 는 S.docs 에 바로 쓰므로, Object.defineProperty 로 막는다 */
  Object.defineProperty(S.docs, 'users/UID1', {
    configurable: true,
    get() { return undefined; },
    set() { throw new Error('users 쓰기 실패(일부러)'); }
  });
  await h(req(body(), null, '5.5.5.5'), r);
  ck('500', r.code, 500);
  ck('   계정을 만들었다가', S.calls.filter(c => c[0] === 'createUser').length, 1);
  ck('   되돌린다 (deleteUser 1회)', S.calls.filter(c => c[0] === 'deleteUser').length, 1);
  ck('   남은 계정 0', Object.keys(S.authByEmail).length, 0);
  ck('   로그에 되돌림 기록', /계정 되돌림/.test(S.logs.join('|')), true);
  ck('   문자는 나가지 않는다', S.aligo.length, 0);
}

/* ══ ⑫ create 정상 — users 문서의 실제 값 (원칙 B) ═════════════════════════ */
console.log('\n⑫ create 정상 — 저장된 users 문서를 꺼내 본다');
{
  const S = withCode(sgState(), CODE);
  S.docs['orgs/_master/data/billing'] =
    { bank: '농협', account: '123-456-789', holder: '프리존', fee: '월 45,000원', notifyPhone: '010-9999-8888' };
  const r = await callSg(S, body());
  ck('200', r.code, 200);
  ck('응답은 ok 한 칸뿐', JSON.stringify(r.body), '{"ok":true}');
  ck('   응답에 비밀번호·토큰·uid 없음',
    /pw1234|token|uid|UID/.test(JSON.stringify(r.body)), false);

  const uid = (S.authByEmail[LOGIN] || {}).uid;
  ck('계정 아이디 = 번호@phone.cosroad.com', !!uid, true);
  const rec = S.docs['users/' + uid] || {};
  ck('users 문서 칸 전수', Object.keys(rec).sort().join(','),
    ['approved','bizCeo','bizCheckedAt','bizNo','bizNoDup','bizOpenDate','bizType',
     'contact','createdAt','orgId','orgName','phone','plan','signupMethod','status'].join(','));
  ck('  status/approved/plan', [rec.status, rec.approved, rec.plan].join('/'), 'pending/false/pending');
  ck('  orgId = 업종_uid앞12', rec.orgId, 'academy_' + String(uid).slice(0, 12));
  ck('  phone·contact 모두 인증한 번호', rec.phone + '/' + rec.contact, PHONE + '/' + PHONE);
  ck('  signupMethod', rec.signupMethod, 'phone');
  ck('  bizNo (숫자만)', rec.bizNo, BNO);
  ck('  bizCeo', rec.bizCeo, CEO);
  ck('  bizOpenDate (YYYYMMDD)', rec.bizOpenDate, OPEN);
  ck('  bizCheckedAt 은 시각', typeof rec.bizCheckedAt === 'number' && rec.bizCheckedAt > 1700000000000, true);
  ck('  bizNoDup (첫 가입이라 false)', rec.bizNoDup, false);
  const strVals = Object.keys(rec).filter(k => typeof rec[k] === 'string').map(k => rec[k]);
  ck('  비밀번호·인증번호가 **값으로** 들어가 있지 않다',
    strVals.some(v => v.indexOf('pw1234') >= 0 || v.indexOf(CODE) >= 0), false);
  ck('  대조 — 같은 검사로 섞인 값은 잡는다',
    strVals.concat(['x pw1234 y']).some(v => v.indexOf('pw1234') >= 0), true);
  ck('  trialStart 를 넣지 않는다 (승인 때 시작)', 'trialStart' in rec, false);
  ck('  role·testAccess 를 넣지 않는다', ('role' in rec) || ('testAccess' in rec), false);

  /* 문자 둘 */
  ck('문자 2건', S.aligo.length, 2);
  ck('  ① 마스터 알림은 notifyPhone 으로', (S.aligo[0].form || {}).receiver, '01099998888');
  ck('     본문에 업체명·업종·번호', /코스로드학원.*학원.*01012345678/.test(S.aligo[0].form.msg), true);
  ck('  ② 신청자에게 계좌 안내', (S.aligo[1].form || {}).receiver, PHONE);
  ck('     본문에 은행·계좌·예금주', /농협.*123-456-789.*프리존/.test(S.aligo[1].form.msg), true);
  const msgs = S.aligo.map(a => a.form.msg).join('|');
  ck('  문자 본문에 비밀번호·인증번호 없음',
    msgs.indexOf('pw1234') >= 0 || msgs.indexOf(CODE) >= 0, false);
  ck('  대조 — 같은 검사로 섞인 값은 잡는다',
    (msgs + ' ' + CODE).indexOf(CODE) >= 0, true);
  ck('  로그에 번호·비번·코드·사업자번호 없음',
    new RegExp(PHONE + '|pw1234|' + CODE + '|' + BNO).test(S.logs.join('|')), false);
  ck('  대조 — 같은 검사로 1건은 잡힌다(검사가 살아 있다)',
    new RegExp(PHONE).test('x ' + PHONE + ' y'), true);
}

/* ══ ⑬ 알림 번호 — notifyPhone 이 비면 종전 번호 ═══════════════════════════ */
console.log('\n⑬ 알림 번호 · 계좌 미입력');
{
  const S = withCode(sgState(), CODE);
  S.docs['orgs/_master/data/billing'] = { bank: '농협', account: '1-2-3' };   // notifyPhone 없음
  await callSg(S, body());
  ck('notifyPhone 이 없으면 010-3660-3911', (S.aligo[0].form || {}).receiver, '01036603911');

  const S2 = withCode(sgState(), CODE);     // billing 문서 자체가 없음
  await callSg(S2, body());
  ck('billing 문서가 없어도 가입 성공', Object.keys(S2.users).length, 1);
  ck('   마스터 알림만 1건 (계좌 안내는 생략)', S2.aligo.length, 1);

  const S3 = withCode(sgState({ aligoThrow: true }), CODE);
  const r3 = await callSg(S3, body());
  ck('문자가 못 나가도 가입은 성공', r3.code, 200);
  ck('   users 문서는 남는다', Object.keys(S3.users).length, 1);
}

/* ══ ⑭ 같은 사업자번호 ⚠ (막지 않고 표시만) ════════════════════════════════ */
console.log('\n⑭ 같은 사업자번호 — 막지 않고 bizNoDup 만 적는다');
{
  const S = withCode(sgState(), CODE);
  S.docs['users/OTHER'] = { bizNo: BNO, orgName: '먼저 가입한 곳', approved: true };
  const r = await callSg(S, body());
  ck('가입은 된다 (200)', r.code, 200);
  const uid = (S.authByEmail[LOGIN] || {}).uid;
  ck('   bizNoDup true', (S.docs['users/' + uid] || {}).bizNoDup, true);

  const S2 = withCode(sgState(), CODE);
  S2.docs['users/OTHER'] = { bizNo: '9999999999', approved: true };
  await callSg(S2, body());
  const uid2 = (S2.authByEmail[LOGIN] || {}).uid;
  ck('   대조: 다른 번호면 false', (S2.docs['users/' + uid2] || {}).bizNoDup, false);
}

/* ══ ⑮ 출처·메서드 ═════════════════════════════════════════════════════════ */
console.log('\n⑮ 허용 출처 · 메서드');
{
  const S = sgState();
  const h = makeHandler(SRC_SIGNUP, S).handler;
  let r = res();
  await h({ method: 'OPTIONS', headers: { origin: 'https://cosroad.com' }, body: {} }, r);
  ck('OPTIONS → 200', r.code, 200);
  r = res();
  await h({ method: 'GET', headers: { origin: 'https://cosroad.com' }, body: {} }, r);
  ck('GET → 405', r.code, 405);
  r = res();
  await h({ method: 'POST', headers: { origin: 'https://evil.example' }, body: { action: 'bizCheck' } }, r);
  ck('허용 안 된 출처 → 403', r.code, 403);
  ck('   국세청 호출 0', S.nts.length, 0);
  r = res();
  await h(req({ action: 'nope' }), r);
  ck('모르는 action → 400', r.code, 400);
}

/* ══ ⑯ api/otp.js — purpose 'signup' ═══════════════════════════════════════ */
console.log('\n⑯ api/otp.js — 가입용 인증번호(signup)');
{
  const S = makeState();
  const r = await callOtp(SRC_OTP, S, { action: 'send', purpose: 'signup', phone: PHONE });
  ck('미가입 번호 → 200', r.code, 200);
  ck('   문자 1건', S.aligo.length, 1);
  ck('   코드 원문은 저장하지 않는다 (codeHash 만)',
    Object.keys(S.docs['otp/' + otpId(PHONE, 'signup')]).sort().join(','),
    'codeHash,expiresAt,sentAt,tries');
  const sent = (S.aligo[0].form.msg.match(/\d{6}/) || [])[0];
  ck('   문자 속 6자리의 해시가 저장값과 같다',
    S.docs['otp/' + otpId(PHONE, 'signup')].codeHash, sha(sent + SECRET));
  ck('   로그에 코드가 없다', S.logs.join('|').indexOf(sent) < 0, true);

  const S2 = makeState();
  S2.authByEmail[LOGIN] = { uid: 'OLD', email: LOGIN };
  const r2 = await callOtp(SRC_OTP, S2, { action: 'send', purpose: 'signup', phone: PHONE });
  ck('이미 가입된 번호 → 409', r2.code, 409);
  ck('   문자 0건', S2.aligo.length, 0);
  ck('   인증번호 문서도 안 만든다', Object.keys(S2.docs).length, 0);

  const S3 = makeState();
  const r3 = await callOtp(SRC_OTP, S3, { action: 'send', purpose: 'nope', phone: PHONE });
  ck('모르는 purpose → 400', r3.code, 400);
  ck('쓰임새 목록', (SRC_OTP.match(/const PURPOSES = \[([^\]]*)\]/) || [])[1].replace(/['\s]/g, ''),
    'reset,changeNew,signup');
}

/* ══ ⑰ api/otp.js — reset·changeNew 가 전/후 **똑같은가** ══════════════════ */
console.log('\n⑰ otp.js 전/후 비교 (기준 ' + OLD_REF + ') — reset·changeNew 동작 그대로');
{
  /* 같은 입력을 옛 코드와 새 코드에 각각 넣고 응답·저장 모양·문자를 맞춘다.
     인증번호는 매번 달라지므로 **모양**(칸 이름·만료 길이·받는 번호)으로 맞춘다. */
  async function run(SRC, b, pre) {
    const S = makeState();
    if (pre) pre(S);
    const r = await callOtp(SRC, S, b);
    const id = otpId(PHONE, b.purpose || 'reset');
    const d = S.docs['otp/' + id] || null;
    return {
      code: r.code, ok: !!(r.body && r.body.ok), msg: (r.body && r.body.message) || '',
      ttl: (r.body && r.body.ttlSec) || 0,
      keys: d ? Object.keys(d).sort().join(',') : '(없음)',
      /* 만료 길이는 sentAt 이 있을 때만 본다 — 없으면 절대시각이라 두 번 돌릴 때
         ms 단위로 달라져 전/후가 늘 어긋난다(코드 차이가 아니다) */
      ttlMs: (d && d.sentAt) ? (d.expiresAt - d.sentAt[0]) : 'n/a',
      tries: d ? d.tries : null,
      aligo: S.aligo.length, to: S.aligo.length ? S.aligo[0].form.receiver : '',
      msgShape: S.aligo.length ? S.aligo[0].form.msg.replace(/\d{6}/, 'NNNNNN') : '',
      logs: S.logs.join('|')
    };
  }
  const cases = [
    ['reset 보내기', { action: 'send', purpose: 'reset', phone: PHONE }, null],
    ['reset — 가입 안 된 번호도 같은 문구', { action: 'send', purpose: 'reset', phone: '01099990000' }, null],
    ['reset 1분 2회', { action: 'send', purpose: 'reset', phone: PHONE },
      (S) => { S.docs['otp/rl.p.' + sha(PHONE)] = { at: [Date.now()] }; }],
    ['changeNew 는 마스터만', { action: 'send', purpose: 'changeNew', phone: PHONE }, null],
    ['verify-reset 코드 틀림', { action: 'verify-reset', phone: PHONE, code: '000000', newPassword: 'abcdef' },
      (S) => { S.docs['otp/' + otpId(PHONE, 'reset')] = { codeHash: sha('123456' + SECRET), expiresAt: Date.now() + 60000, tries: 0 };
               S.authByEmail[LOGIN] = { uid: 'U1', email: LOGIN }; }],
    ['verify-reset 코드 맞음', { action: 'verify-reset', phone: PHONE, code: '123456', newPassword: 'abcdef' },
      (S) => { S.docs['otp/' + otpId(PHONE, 'reset')] = { codeHash: sha('123456' + SECRET), expiresAt: Date.now() + 60000, tries: 0 };
               S.authByEmail[LOGIN] = { uid: 'U1', email: LOGIN }; }],
    ['verify-reset 만료', { action: 'verify-reset', phone: PHONE, code: '123456', newPassword: 'abcdef' },
      (S) => { S.docs['otp/' + otpId(PHONE, 'reset')] = { codeHash: sha('123456' + SECRET), expiresAt: Date.now() - 1, tries: 0 };
               S.authByEmail[LOGIN] = { uid: 'U1', email: LOGIN }; }],
    ['verify-reset 6회 틀림', { action: 'verify-reset', phone: PHONE, code: '000000', newPassword: 'abcdef' },
      (S) => { S.docs['otp/' + otpId(PHONE, 'reset')] = { codeHash: sha('123456' + SECRET), expiresAt: Date.now() + 60000, tries: 5 };
               S.authByEmail[LOGIN] = { uid: 'U1', email: LOGIN }; }],
    ['verify-reset 번호 형식', { action: 'verify-reset', phone: '02', code: '123456', newPassword: 'abcdef' }, null],
    ['verify-reset 짧은 비번', { action: 'verify-reset', phone: PHONE, code: '123456', newPassword: 'abc' }, null],
    ['모르는 action', { action: 'zzz' }, null]
  ];
  for (const [label, b, pre] of cases) {
    const a = await run(OLD_OTP, b, pre);
    const n = await run(SRC_OTP, b, pre);
    ck(label, JSON.stringify(n), JSON.stringify(a));
  }
  ck('줄 수 (옛 → 새)', OLD_OTP.split('\n').length + ' → ' + SRC_OTP.split('\n').length,
     OLD_OTP.split('\n').length + ' → ' + SRC_OTP.split('\n').length);
}

/* ══ ⑱ 키·비밀을 코드에 적지 않았다 (절대규칙 1) ═══════════════════════════ */
console.log('\n⑱ 절대규칙 1 — 코드에 키 값이 없다');
{
  const all = SRC_SIGNUP + SRC_OTP + SRC_CORE;
  ck('env 이름만 쓰고 값은 없다',
    /process\.env\.DATA_GO_KR_KEY/.test(SRC_SIGNUP), true);
  ck('serviceKey 를 코드에 박지 않았다',
    /serviceKey\s*=\s*['"][A-Za-z0-9%+\/=]{10,}/.test(all), false);
  ck('   대조 — 같은 검사로 박은 꼴은 잡힌다',
    /serviceKey\s*=\s*['"][A-Za-z0-9%+\/=]{10,}/.test("const serviceKey = 'abcdefghijklmn'"), true);
  ck('길이 20자 넘는 base64 꼴 비밀 문자열 없음',
    (all.match(/['"][A-Za-z0-9+\/]{40,}={0,2}['"]/g) || []).length, 0);
  /* console.log 에 인증번호·비밀번호 변수를 넣지 않는다.
     ★ 예외 한 줄 — api/otp.js 의 **오류 코드**(e.code) 로그다(v252 그대로, 이번에 안 건드렸다).
       새로 만든 api/signup.js 는 같은 자리를 errCode 로 이름 지어 아예 안 걸리게 했다. */
  const LOGRE = /console\.log\([^)]*\b(code|pw|password|pin|codeHash)\b[^)]*\)/g;
  ck('console.log 에 code·pw·pin 변수를 넣지 않는다 (예외 1줄)',
    (all.match(LOGRE) || []).join(' / '), "console.log('[otp] 실패', action, code)");
  ck('   그 한 줄은 오류 코드다 (바로 위에서 e.code 로 받는다)',
    /const code = String\(\(e && e\.code\) \|\| ''\);/.test(SRC_OTP), true);
  ck('   signup.js 는 errCode 로 두어 걸리지 않는다',
    (SRC_SIGNUP.match(LOGRE) || []).length, 0);
  ck('   대조 — 같은 검사로 인증번호 로그는 잡힌다',
    (("console.log('x', code)").match(LOGRE) || []).length, 1);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
})();
