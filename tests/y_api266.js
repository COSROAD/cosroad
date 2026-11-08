/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v266 api 스텁 — 문자·알림톡 문지기
   전: a542802 (v265) · 후: 작업 중
   ★ 실제 발송 0건 — 알리고 호출은 직전에서 끊어 「나갈 뻔한 것」만 본다. */
const E = require('./sendenv.js');
const { SRC, SRC_OLD, OLD_REF, makeState, call } = E;
const crypto = require('crypto');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(58) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const DAY = 86400000;
const OWNER = 'OWNER1', OTHER = 'OTHER1', DRV = 'drv_academy_OWNER1_car1', MASTER = 'MASTER1';
const ORG = 'academy_OWNER1', ORG2 = 'academy_OTHER1';
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

/* 회원 명부 — 앱이 저장하는 꼴 그대로 { value: '<JSON>' } */
const MEMBERS = [
  { id: 1, name: '가', carId: 'car1', phone: '010-1111-1111', phone2: '01022222222' },
  { id: 2, name: '나', carId: 'car2', phone: '010-3333-3333' },
  { id: 3, name: '다', carId: 'car1', phone: '010-4444-4444' }
];

function base(over) {
  const S = makeState(over);
  S.tokens = {
    ownerTok:  { uid: OWNER,  firebase: { sign_in_provider: 'password' } },
    otherTok:  { uid: OTHER,  firebase: { sign_in_provider: 'password' } },
    anonTok:   { uid: 'ANON', firebase: { sign_in_provider: 'anonymous' } },
    drvTok:    { uid: DRV, driver: true, org: ORG, carId: 'car1', firebase: { sign_in_provider: 'custom' } },
    drv2Tok:   { uid: DRV, driver: true, org: ORG, carId: 'car2', firebase: { sign_in_provider: 'custom' } },
    masterTok: { uid: MASTER, firebase: { sign_in_provider: 'password' } }
  };
  Object.assign(S.docs, {
    ['users/' + OWNER]: { orgId: ORG, approved: true, withdrawn: false, paidUntil: S.now + 100 * DAY },
    ['users/' + OTHER]: { orgId: ORG2, approved: true, withdrawn: false, paidUntil: S.now + 100 * DAY },
    ['users/' + DRV]:   { role: 'driver', driverOrg: ORG, ownerUid: OWNER, carId: 'car1' },
    'admins/MASTER1': { role: 'master' },
    ['orgs/' + ORG + '/data/members']:  { value: JSON.stringify(MEMBERS) },
    ['orgs/' + ORG2 + '/data/members']: { value: JSON.stringify([{ id: 9, phone: '010-9999-9999' }]) },
    'orgs/_master/data/billing': { bank: '농협', notifyPhone: '010-7777-8888' }
  });
  return S;
}
const SMS = (over) => ({ org: ORG, receiver: '010-1111-1111', msg: '알림장 시험', title: 'T', ...(over || {}) });
const ALIM = (over) => ({ org: ORG, tpl_code: 'UI_7310', receiver: '010-1111-1111', name: '가', message: '시험', biz: 'academy', ...(over || {}) });
const lastForm = (S) => (S.aligo.length ? S.aligo[S.aligo.length - 1].form : new URLSearchParams(''));

(async () => {

/* ══ ① 토큰이 없으면 못 보낸다 (★ 이번 회차의 핵심) ════════════════════ */
console.log('\n① 토큰 — 없으면 401, 익명도 401');
{
  for (const [src, body, name] of [[SRC.sms, SMS(), 'send-sms'], [SRC.alim, ALIM(), 'send-alimtalk']]) {
    const S = base();
    const r = await call(src, S, body, null);               // 토큰 없음
    ck(name + ' 토큰 없음 → 401', r.code, 401);
    ck('  알리고로 안 나감', S.aligo.length, 0);
    const S2 = base();
    const r2 = await call(src, S2, body, 'anonTok');
    ck(name + ' 익명 로그인 → 401', r2.code, 401);
    const S3 = base();
    const r3 = await call(src, S3, body, '엉터리토큰');
    ck(name + ' 틀린 토큰 → 401', r3.code, 401);
    ck('  알리고로 안 나감', S3.aligo.length, 0);
  }
}

/* ══ ② ★ Origin 만 맞춘 요청 — 옛 판 200 / 새 판 401 ═══════════════════ */
console.log('\n② 대조 — Origin 만 맞춘 요청 (0단계에서 찾은 구멍)');
{
  const S = base();
  const old = await call(SRC_OLD.sms, S, { receiver: '010-0000-0001', msg: '아무 글' }, null, 'https://cosroad.com');
  ck('[옛 판 ' + OLD_REF + '] Origin 만 맞추면 → 200', old.code, 200);
  ck('  그때 알리고로 나갈 뻔했다', S.aligo.length, 1);
  ck('  나갈 뻔한 번호(명부에 없는 번호)', lastForm(S).get('receiver'), '010-0000-0001');

  const S2 = base();
  const neo = await call(SRC.sms, S2, { receiver: '010-0000-0001', msg: '아무 글' }, null, 'https://cosroad.com');
  ck('[새 판] 같은 요청 → **401**', neo.code, 401);
  ck('  알리고로 안 나감', S2.aligo.length, 0);

  const S3 = base();
  const oldA = await call(SRC_OLD.alim, S3, { tpl_code: 'XX_999', receiver: '01000000001', message: 'x' }, null, 'https://cosroad.com');
  ck('[옛 판] 알림톡도 모르는 템플릿으로 → 200', oldA.code, 200);
  const S4 = base();
  const neoA = await call(SRC.alim, S4, { tpl_code: 'XX_999', receiver: '01000000001', message: 'x' }, null, 'https://cosroad.com');
  ck('[새 판] 같은 요청 → **401**', neoA.code, 401);
}

/* ══ ③ 승인 전·탈퇴·만료 ═══════════════════════════════════════════════ */
console.log('\n③ 승인 전 · 탈퇴 · 이용 기간 끝');
{
  const T = [
    ['승인 전', { approved: false }],
    ['탈퇴', { withdrawn: true }],
    ['기간 끝(어제)', { paidUntil: null }],
    ['기간 값 없음', { paidUntil: undefined }]
  ];
  for (const [label, over] of T) {
    const S = base();
    const u = Object.assign({}, S.docs['users/' + OWNER], over);
    if (label === '기간 끝(어제)') u.paidUntil = S.now - DAY;
    if (label === '기간 값 없음') delete u.paidUntil;
    S.docs['users/' + OWNER] = u;
    const r = await call(SRC.sms, S, SMS(), 'ownerTok');
    ck(label + ' → 403', r.code, 403);
    ck('  까닭을 말해 준다', /이용 기간이 끝났거나 승인 전/.test(r.body.message), true);
    ck('  알리고로 안 나감', S.aligo.length, 0);
  }
  /* 살아 있으면 나간다 */
  const S = base();
  const r = await call(SRC.sms, S, SMS(), 'ownerTok');
  ck('활성 업체 → 200', r.code, 200);
  ck('  알리고 호출 1건', S.aligo.length, 1);
}

/* ══ ④ 남의 업체 · 둘러보기 ════════════════════════════════════════════ */
console.log('\n④ 남의 업체 · 둘러보기(_demo)');
{
  const S = base();
  const r = await call(SRC.sms, S, SMS({ org: ORG2 }), 'ownerTok');   // 내 org 가 아니다
  ck('남의 업체 org 로 보내기 → 403', r.code, 403);
  ck('  까닭', /내 업체가 아니에요/.test(r.body.message), true);
  ck('  알리고로 안 나감', S.aligo.length, 0);

  const S2 = base();
  S2.docs['users/' + OWNER].orgId = 'academy_demo';
  S2.docs['orgs/academy_demo/data/members'] = { value: JSON.stringify(MEMBERS) };
  const r2 = await call(SRC.sms, S2, SMS({ org: 'academy_demo' }), 'ownerTok');
  ck('둘러보기(_demo) → 403 (서버도 거부)', r2.code, 403);
  ck('  까닭', /둘러보기에서는/.test(r2.body.message), true);
  ck('  알리고로 안 나감', S2.aligo.length, 0);

  const S3 = base();
  const r3 = await call(SRC.sms, S3, SMS({ org: '' }), 'ownerTok');
  ck('업체가 빠지면 400', r3.code, 400);
}

/* ══ ⑤ ★ 받는 번호는 회원 명부에 있는 번호만 ═════════════════════════ */
console.log('\n⑤ 받는 번호 — 그 업체 회원 명부만');
{
  const S = base();
  const r = await call(SRC.sms, S, SMS({ receiver: '010-1111-1111,01022222222,010-3333-3333' }), 'ownerTok');
  ck('명부 번호 3개 → 200', r.code, 200);
  ck('  알리고에 나간 번호', lastForm(S).get('receiver'), '01011111111,01022222222,01033333333');
  ck('  (줄표를 떼고 숫자만 보낸다)', /^[0-9,]+$/.test(lastForm(S).get('receiver')), true);

  const S2 = base();
  const r2 = await call(SRC.sms, S2, SMS({ receiver: '010-1111-1111,010-0000-0000' }), 'ownerTok');
  ck('명부에 없는 번호가 섞이면 → 403', r2.code, 403);
  ck('  **한 명만 빼지 않고 요청 전체 거부**', S2.aligo.length, 0);
  ck('  몇 개가 안 맞는지만 알려 준다', /없는 번호가 1개/.test(r2.body.message), true);
  ck('  ★ 응답에 번호 원문 없음', /0000-0000|01000000000/.test(JSON.stringify(r2.body)), false);
  ck('  대조 — 같은 검사가 1건을 잡는다',
     /0000-0000|01000000000/.test(JSON.stringify(r2.body) + ' 01000000000'), true);

  const S3 = base();
  const r3 = await call(SRC.sms, S3, SMS({ receiver: '010-9999-9999' }), 'ownerTok');  // 남의 업체 회원
  ck('남의 업체 회원 번호 → 403', r3.code, 403);

  /* 알림톡도 같다 */
  const S4 = base();
  ck('알림톡 명부 번호 → 200', (await call(SRC.alim, S4, ALIM(), 'ownerTok')).code, 200);
  const S5 = base();
  const r5 = await call(SRC.alim, S5, ALIM({ receiver: '010-0000-0000' }), 'ownerTok');
  ck('알림톡 명부 밖 번호 → 403', r5.code, 403);
  ck('  알리고로 안 나감', S5.aligo.length, 0);
}

/* ══ ⑥ 기사 — 자기 차량 회원만 ═════════════════════════════════════════ */
console.log('\n⑥ 기사는 자기 차량 회원만');
{
  const S = base();
  const r = await call(SRC.sms, S, SMS({ receiver: '010-1111-1111,010-4444-4444' }), 'drvTok');  // 둘 다 car1
  ck('기사 → 자기 차량(car1) 회원 2명 → 200', r.code, 200);

  const S2 = base();
  const r2 = await call(SRC.sms, S2, SMS({ receiver: '010-3333-3333' }), 'drvTok');   // car2 회원
  ck('기사 → 남의 차량(car2) 회원 → 403', r2.code, 403);
  ck('  알리고로 안 나감', S2.aligo.length, 0);

  const S3 = base();
  const r3 = await call(SRC.sms, S3, SMS({ org: ORG2, receiver: '010-9999-9999' }), 'drvTok');
  ck('기사 → 남의 업체 → 403', r3.code, 403);

  /* 소유자가 만료되면 기사도 막힌다 (규칙 ownerAlive 와 같은 뜻) */
  const S4 = base();
  S4.docs['users/' + OWNER].paidUntil = S4.now - DAY;
  const r4 = await call(SRC.sms, S4, SMS(), 'drvTok');
  ck('소유자 기간이 끝나면 기사도 → 403', r4.code, 403);
  ck('  알리고로 안 나감', S4.aligo.length, 0);
}

/* ══ ⑦ 상한 ════════════════════════════════════════════════════════════ */
console.log('\n⑦ 업체별 1분 · 하루 상한');
{
  /* ★ v266 보정1 — 상한이 1분 60/하루 500 에서 **1분 300 / 하루 3,000** 으로 올랐다.
     그래서 이 묶음의 숫자도 같이 올렸다(옛 숫자로는 「50+50 이면 걸린다」가 더 이상 참이 아니다).
     경계 자체는 y2_api266b.js 가 300/301 · 3000/3050 으로 따로 본다. */
  /* 1분 상한 300명 — 50씩 여섯 번은 되고 일곱 번째에서 걸린다 */
  const S = base();
  const many = Array.from({ length: 50 }, () => '010-1111-1111').join(',');
  for (let i = 0; i < 6; i++) {
    const r = await call(SRC.sms, S, SMS({ receiver: many }), 'ownerTok');
    if (i === 0) ck('50명 한 번 → 200', r.code, 200);
    if (i === 5) ck('50명씩 여섯 번(=300) → 200', r.code, 200);
  }
  const b = await call(SRC.sms, S, SMS({ receiver: many }), 'ownerTok');
  ck('이어서 50명 더 → 429 (1분 300명)', b.code, 429);
  ck('  까닭', /1분 뒤에/.test(b.body.message), true);
  ck('  까닭에 숫자가 상수에서 온다', /1분에 300명까지/.test(b.body.message), true);
  ck('  막힌 요청은 알리고로 안 나감', S.aligo.length, 6);

  /* 하루 상한 3,000 — 1분 창을 넘기며 쌓는다 */
  const S2 = base();
  let last = null;
  for (let i = 0; i < 64; i++) {
    S2.now += 61 * 1000;                       // 1분 창을 넘긴다
    last = await call(SRC.sms, S2, SMS({ receiver: many }), 'ownerTok');
    if (last.code !== 200) break;
  }
  ck('하루 3,000명을 넘기면 → 429', last.code, 429);
  ck('  까닭', /오늘 보낼 수 있는 문자 수\(3,000건\)/.test(last.body.message), true);
  ck('  그 전까지 나간 건수 (50×60)', S2.aligo.length, 60);

  /* 51명은 한 요청에 못 넣는다 */
  const S3 = base();
  const over = Array.from({ length: 51 }, () => '010-1111-1111').join(',');
  const r3 = await call(SRC.sms, S3, SMS({ receiver: over }), 'ownerTok');
  ck('한 요청 51명 → 400', r3.code, 400);
}

/* ══ ⑧ 알림톡 템플릿 ═══════════════════════════════════════════════════ */
console.log('\n⑧ 알림톡 — 아는 템플릿만');
{
  for (const t of ['UI_7310', 'UI_7550', 'UI_7542', 'UI_7257', 'UJ_4933', 'UJ_4932']) {
    const S = base();
    ck('아는 템플릿 ' + t + ' → 200', (await call(SRC.alim, S, ALIM({ tpl_code: t }), 'ownerTok')).code, 200);
  }
  for (const t of ['XX_9999', 'UI_0001', '', 'DROP TABLE']) {
    const S = base();
    const r = await call(SRC.alim, S, ALIM({ tpl_code: t }), 'ownerTok');
    ck('모르는 템플릿 ' + JSON.stringify(t) + ' → 400', r.code, 400);
    ck('  알리고로 안 나감', S.aligo.length, 0);
  }
}

/* ══ ⑨ 문의 알림 — 받는 번호를 서버가 정한다 ═════════════════════════ */
console.log('\n⑨ 문의 — 번호는 서버가 정한다');
{
  const S = base();
  const r = await call(SRC.sms, S, { mode: 'inquiry', msg: '요금이 궁금해요' }, null);
  ck('로그인 없이도 보낼 수 있다 → 200', r.code, 200);
  ck('  받는 번호 = billing.notifyPhone', lastForm(S).get('receiver'), '01077778888');
  ck('  앞머리를 서버가 붙인다', lastForm(S).get('msg'), '[코스로드 문의] 요금이 궁금해요');

  /* 화면이 번호를 보내도 **무시**한다 */
  const S2 = base();
  await call(SRC.sms, S2, { mode: 'inquiry', msg: '시험', receiver: '010-5555-5555', title: 'x' }, null);
  ck('화면이 번호를 보내도 무시 → 서버 번호', lastForm(S2).get('receiver'), '01077778888');
  ck('  보낸 번호가 안 쓰였다', /5555/.test(lastForm(S2).get('receiver')), false);

  /* notifyPhone 이 없으면 기본 번호 */
  const S3 = base();
  delete S3.docs['orgs/_master/data/billing'];
  await call(SRC.sms, S3, { mode: 'inquiry', msg: '시험' }, null, undefined, '9.9.9.1');
  ck('notifyPhone 이 없으면 기본 번호', lastForm(S3).get('receiver'), '01036603911');

  /* 본문 길이 */
  const S4 = base();
  const r4 = await call(SRC.sms, S4, { mode: 'inquiry', msg: 'x'.repeat(501) }, null);
  ck('본문 501자 → 400', r4.code, 400);
  const S5 = base();
  ck('빈 본문 → 400', (await call(SRC.sms, S5, { mode: 'inquiry', msg: '  ' }, null)).code, 400);
}

/* ══ ⑩ 문의 상한 (IP · 계정) ═══════════════════════════════════════════ */
console.log('\n⑩ 문의 상한');
{
  const S = base();
  ck('같은 IP 첫 번째 → 200', (await call(SRC.sms, S, { mode: 'inquiry', msg: 'a' }, null, undefined, '5.5.5.5')).code, 200);
  const b = await call(SRC.sms, S, { mode: 'inquiry', msg: 'b' }, null, undefined, '5.5.5.5');
  ck('  바로 두 번째 → 429 (1분 1회)', b.code, 429);
  ck('  다른 IP 는 통과', (await call(SRC.sms, S, { mode: 'inquiry', msg: 'c' }, null, undefined, '6.6.6.6')).code, 200);

  /* 하루 5회 */
  const S2 = base();
  let last = null;
  for (let i = 0; i < 7; i++) {
    S2.now += 61 * 1000;
    last = await call(SRC.sms, S2, { mode: 'inquiry', msg: 'x' }, null, undefined, '7.7.7.7');
    if (last.code !== 200) break;
  }
  ck('같은 IP 하루 6번째 → 429', last.code, 429);
  ck('  까닭', /오늘은 문의를 더/.test(last.body.message), true);
  ck('  그 전까지 나간 건수 5', S2.aligo.length, 5);
}

/* ══ ⑪ 허용 출처 · 메서드 ══════════════════════════════════════════════ */
console.log('\n⑪ 허용 출처 (CORS) — 로드잡 주소를 뺐다');
{
  for (const [o, want] of [['https://cosroad.com', 401], ['https://www.cosroad.com', 401],
                           ['https://cosroad.vercel.app', 401],
                           ['https://roadjob.co.kr', 403], ['https://roadcrew.kr', 403],
                           ['https://evil.example', 403], [null, 403]]) {
    const S = base();
    const r = await call(SRC.sms, S, SMS(), null, o);
    ck(String(o) + ' → ' + want + (want === 401 ? ' (출처는 통과, 토큰에서 막힘)' : ' (출처에서 막힘)'), r.code, want);
  }
  const S = base();
  const h = require('./sendenv.js').makeHandler(SRC.sms, S);
  const rs = E.res(); await h(Object.assign(E.req(SMS(), 'ownerTok'), { method: 'GET' }), rs);
  ck('GET → 405', rs.code, 405);
}

/* ══ ⑫ 번호·본문·키가 응답·로그에 새지 않는가 ═══════════════════════ */
console.log('\n⑫ 새는 것이 없는가');
{
  const S = base();
  await call(SRC.sms, S, SMS({ receiver: '010-1111-1111', msg: '비밀 알림장' }), 'ownerTok');
  const logs = S.logs.join('|');
  ck('로그에 번호 없음', /1111/.test(logs), false);
  ck('로그에 본문 없음', /비밀 알림장/.test(logs), false);
  ck('로그에 키 없음', /KEY|SKEY/.test(logs), false);
  ck('  대조 — 같은 검사가 1건을 잡는다', /1111/.test(logs + ' 01011111111'), true);

  /* 막힐 때 응답에도 안 샌다 */
  const S2 = base();
  const r2 = await call(SRC.sms, S2, SMS({ receiver: '010-0000-0000', msg: '비밀' }), 'ownerTok');
  const body = JSON.stringify(r2.body);
  ck('막힌 응답에 번호 없음', /0000/.test(body), false);
  ck('막힌 응답에 본문 없음', /비밀/.test(body), false);

  /* 서버가 터져도 안 샌다 */
  const S3 = base();
  S3.aligoThrows = true;
  const r3 = await call(SRC.sms, S3, SMS(), 'ownerTok');
  ck('알리고 호출이 터지면 500', r3.code, 500);
  ck('  속사정을 응답에 안 넣는다', /network|stack|Error/.test(JSON.stringify(r3.body)), false);
}

/* ══ ⑬ 글로 확인 — 허용 목록·상수 ═════════════════════════════════════ */
console.log('\n⑬ 글로 확인');
{
  const fs = require('fs');
  const g = fs.readFileSync('' + COS_ROOT + '/lib/send-guard.js', 'utf8');
  ck('허용 출처는 코스로드 3개만', (g.match(/'https:\/\/[a-z.]+'/g) || []).join(','),
     "'https://cosroad.com','https://www.cosroad.com','https://cosroad.vercel.app'");
  ck('  로드잡 주소가 없다', /'https:\/\/roadjob|'https:\/\/roadcrew/.test(g), false);
  for (const f of ['api/admin-account.js', 'api/driver-auth.js', 'lib/otp-core.js']) {
    const s = fs.readFileSync('' + COS_ROOT + '/' + f, 'utf8');
    ck(f + ' 에도 로드잡 주소 없음', /'https:\/\/roadjob|'https:\/\/roadcrew/.test(s), false);
    const old = require('child_process').execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':' + f).toString();
    ck('  (대조) 옛 판에는 있었다', /'https:\/\/roadjob/.test(old), true);
  }
  /* ★ v266 보정1 — api/rc-notify.js 를 **지웠다**(사장님 결정 11-04 · 부르는 곳 0곳).
     그래서 「손대지 않았다」 검사를 「없어졌다」 검사로 바꿨다. */
  ck('rc-notify 는 지웠다 (파일 없음)', fs.existsSync('' + COS_ROOT + '/api/rc-notify.js'), false);
  ck('  (대조) 옛 판에는 있었다', (() => { try {
        require('child_process').execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/rc-notify.js',
          { stdio: ['ignore', 'pipe', 'ignore'] }); return true; } catch (e) { return false; } })(), true);
  ck('  남은 api 파일에 로드잡 주소 0', (() => {
        const dir = '' + COS_ROOT + '/api';
        return fs.readdirSync(dir).filter((f) => /'https:\/\/roadjob|'https:\/\/roadcrew/
          .test(fs.readFileSync(dir + '/' + f, 'utf8'))).join(',') || '없음'; })(), '없음');
  ck('상한 숫자가 한 곳에 있다', /ORG_PER_DAY\s*=\s*3000/.test(g) && /ORG_PER_MIN\s*=\s*300/.test(g), true);
  ck('  429 문구에 숫자를 박지 않았다', /'오늘 보낼 수 있는 문자 수\(500|1분에 60명/.test(g), false);
  ck('한 요청 50명', /REQ_MAX_RCV\s*=\s*50/.test(g), true);
  ck('알림톡 템플릿 6개', (g.match(/U[IJ]_\d{4}/g) || []).length, 6);
  const sms = fs.readFileSync('' + COS_ROOT + '/api/send-sms.js', 'utf8');
  const alim = fs.readFileSync('' + COS_ROOT + '/api/send-alimtalk.js', 'utf8');
  ck('send-sms 가 화면이 보낸 키를 안 쓴다', /b\.apikey|b\.userid|b\.sender/.test(sms), false);
  ck('send-alimtalk 도 안 쓴다', /b\.apikey|b\.userid|b\.senderkey/.test(alim), false);
  const oldSms = require('child_process').execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/send-sms.js').toString();
  ck('  (대조) 옛 판은 화면 키를 받았다', /b\.apikey/.test(oldSms), true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
console.log('※ 이 묶음이 돈 동안 바깥으로 나간 통신 0건 (알리고는 가짜)');
process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e && e.stack || e); process.exit(1); });
