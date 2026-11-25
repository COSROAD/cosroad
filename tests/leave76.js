/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드76 — 귀가(하원) 알림톡 **켜기** · 단추 결함 · 실패 판정 결함 (v321)
   보는 것
     ⓞ **대조 시험** — 고치기 전(v320) 글을 같은 장면에 올리면 ① 단추가 붙고
       ② 알리고가 거절해도 **성공으로 치고 문자로 안 떨어진다**
     ① 승인 코드 둘 — `TPL_LEAVE_BY_BIZ = { academy:'UN_7423', public:'UN_7424' }`
     ② **하원 길 단추 0** — `noButton:true` (귀가 템플릿은 단추 없음으로 승인됐다)
     ③ **출석 길 단추는 그대로** — 출석 템플릿은 단추가 승인돼 있다
     ④ **실패 판정** — 알리고 `code:0` → 문자 0 · `code:-99` → 문자 1 · 던짐 → 문자 1
       · 문자까지 거절(`result_code:-101`)이면 `leaveSent:0` 이고 기록 한 줄
     ⑤ **출석 기기 길도 같은 꼴** — 거절이면 `notified` 에 안 센다 + 기록 한 줄
     ⑥ **승인 본문 맞대기** — 신청 글 ↔ `buildLeaveMessage` 글자까지 같다(학원·공공)
     ⑦ **두 판정 규칙이 다르다** — 알림톡 `code===0` · 문자 `result_code>0` (섞이지 않았다)
     ⑧ 앱은 안 바뀐다 — `BIZ_TEMPLATE_CODES`·`TPL_ALLOWED` 에 귀가 코드 **0회** ·
       버전 321 · HELP_QA 수 그대로 + 답에 「알림톡」 반영
   ★ 가짜 firebase-admin · 가짜 fetch — **실제 알리고 호출 0건** · 실제 쓰기 0 */
const crypto = require('crypto');
const fs = require('fs');
const cp = require('child_process');
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 44)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const NL = String.fromCharCode(10);
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const SECRET = 'SEKRIT-TEST';
const ORG = 'academy_owner1', OWNER = 'OWNER1', KCODE = '777777';
const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 31, 11, 20, 0);        /* KST 2026-10-31 20:20 */
const KDATE = '2026-10-31';
const hashOf = (v) => sha(v + '|' + ORG + '|' + SECRET);
const MEM = [{ id: 1, name: '가하은', carId: 'car1', phone: '010-1111-1111' }];

/* ── 서버 쪽 환경 · 보낸 몸통까지 떠 둔다 ─────────────────────────────────── */
function st(over) {
  over = over || {};
  const S = makeState({ now: NOW });
  S.docs['users/' + OWNER] = { orgId: ORG, approved: true, withdrawn: false,
    paidUntil: NOW + 30 * DAY, plan: 'paid' };
  S.docs['kioskCodes/' + ORG] = { org: ORG, codeHash: hashOf(KCODE), updatedAt: 1 };
  S.docs['orgs/' + ORG + '/data/members'] = { value: JSON.stringify(MEM), updatedAt: 1 };
  S.docs['orgs/' + ORG + '/data/orgDriver'] = { value: JSON.stringify({
    name: '가온학원', icon: '🚐', bizType: over.biz || 'academy' }), updatedAt: 1 };
  S.docs['memberPins/' + ORG + '_1'] = { org: ORG, memberId: '1', pinHash: hashOf('1111'), updatedAt: 1 };
  const org = { name: '가온학원' };
  if (over.leaveOn !== false) org.leaveNotify = true;
  S.docs['orgs/' + ORG + '/data/org'] = { value: JSON.stringify(org), updatedAt: 1 };
  if (over.attTime) {
    S.docs['orgs/' + ORG + '/data/attendanceTime'] = { value: JSON.stringify(over.attTime), updatedAt: 1 };
  }
  S.tokens = { ownerTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } },
               kioskTok: { uid: 'ksk_' + ORG, kiosk: true, org: ORG } };
  S.env = { FIREBASE_SERVICE_ACCOUNT: '{"project_id":"x"}', OTP_SECRET: SECRET,
            ALIGO_KEY: 'K', ALIGO_USER_ID: 'U', ALIGO_SENDER_KEY: 'SK', ALIGO_SENDER: '0212345678' };

  /* ★ 몸통까지 떠 두는 가짜 fetch — 번호·본문은 **셈과 칸 이름만** 보고 원문은 안 적는다.
     답은 창구마다 **공식 성공 예시 꼴**이고, `over.atReply`·`over.smsReply`·`over.throwAt`
     으로 거절·던짐을 흉내 낸다(실제 알리고 호출 0건). */
  S.boxes = [];
  S.fetch = async (url, init) => {
    const u = String(url);
    const body = String((init && init.body) || '');
    const isAt = /kakaoapi\.aligo\.in|\/a\/alimtalk/.test(u);
    S.sent = S.sent || [];
    S.sent.push({ url: u, len: body.length });
    S.boxes.push({ at: isAt, hasBtn: body.indexOf('button_1') >= 0,
                   tpl: (/tpl_code=([^&]*)/.exec(body) || [, ''])[1] });
    if (isAt && over.throwAt) throw new Error('망 끊김(가짜)');
    const rep = isAt
      ? (over.atReply || { code: 0, message: '성공적으로 전송요청 하였습니다.',
                           info: { type: 'AT', mid: 1, scnt: 1, fcnt: 0 } })
      : (over.smsReply || { result_code: 1, message: 'success', msg_id: 1, success_cnt: 1 });
    return { json: async () => rep };
  };
  return S;
}
const kAtt = (S) => call(SRC.drv, S, { action: 'kioskCheckin', pin: '1111' }, 'kioskTok', '1.2.3.4');
const atBox = (S) => S.boxes.filter((b) => b.at);
const smsBox = (S) => S.boxes.filter((b) => !b.at);
const logHas = (S, s) => (S.logs || []).some((l) => l.indexOf(s) >= 0);

/* ── 소스 ───────────────────────────────────────────────────────────────── */
const LF = (x) => x.replace(/\r\n/g, '\n');
const APP = LF(fs.readFileSync(COS_ROOT + '/index.html', 'utf8'));
const AT = LF(fs.readFileSync(COS_ROOT + '/lib/alimtalk-core.js', 'utf8'));
const SMSC = LF(fs.readFileSync(COS_ROOT + '/lib/sms-core.js', 'utf8'));
const DRV = LF(fs.readFileSync(COS_ROOT + '/api/driver-auth.js', 'utf8'));
const GUARD = LF(fs.readFileSync(COS_ROOT + '/lib/send-guard.js', 'utf8'));

/* 승인된 본문 — **드라이브 신청 글**(`귀가알림_알림톡템플릿_신청글.md`)에서 그대로 옮겼고
   11-25 에 `buildLeaveMessage` 와 **바이트로** 맞대어 같음을 확인했다(학원 261 · 공공 308).
   ★ 여기 글을 고치면 이 묶음이 깨진다 — **승인본이 바뀌지 않았는지** 먼저 확인할 것. */
const WANT = {
  academy: ['[#{업체명}] 귀가 알림', '━━━━━━━━━', '👤 이름: #{이름}', '⏰ 귀가: #{시각}',
            '✅ 오늘 수업을 마치고', '      학원을 나섰습니다.', '━━━━━━━━━',
            '♥.♥안전한 귀가까지', '        함께하겠습니다.♥.♥'].join(NL),
  public:  ['[#{업체명}] 회원님 귀가 알림', '━━━━━━━━━', '👤 이름: #{이름}', '⏰ 귀가: #{시각}',
            '✅ 보호자님! 회원님이', '     오늘 이용을 마치고', '     센터를 나섰습니다.', '━━━━━━━━━',
            '♥ 회원님의 안전한', '    귀가까지', '    함께하겠습니다.♥'].join(NL)
};

/* `lib/*.js` 를 **소스에서 그대로 떠서** 돌린다(이름공간 하나로 — `drvenv.js nsOf` 와 같은 방법).
   ★ 함수 하나만 떠내면 그 안이 쓰는 **모듈 상수**(`TPL_LEAVE_BY_BIZ`·`SMS_SAFE_MAP`)를 못 본다
     (처음에 그렇게 적었다가 `ReferenceError` 로 잡혔다).
   ★ 상대경로 `import` 는 지운다 — `aligoFetch` 는 **부르지 않는 함수 안**에만 있다(실호출 0). */
function libNs(src) {
  const names = [];
  src.replace(/^export (?:async )?function ([A-Za-z0-9_]+)/mg, (m, n) => { names.push(n); return m; });
  src.replace(/^export const ([A-Za-z0-9_]+)/mg, (m, n) => { names.push(n); return m; });
  const body = src.replace(/^import .*from '\.[^']*';$/mg, '/* 떼어 냈다 */')
                  .replace(/^export /mg, '');
  return new Function(body + NL + 'return { '
    + [...new Set(names)].map((n) => n + ': ' + n).join(', ') + ' };')();
}
const ATL = libNs(LF(fs.readFileSync(COS_ROOT + '/lib/alimtalk-core.js', 'utf8')));
const SML = libNs(LF(fs.readFileSync(COS_ROOT + '/lib/sms-core.js', 'utf8')));
const fnOf = (src, name) => (src === AT ? ATL : SML)[name];

(async () => {

console.log('════ ⓞ 대조 시험 — **고치기 전**(v320) 글을 같은 장면에 올리면');
{
  const PREV = process.env.COS_SRC_PREV_REF || require('./thisref.js').thisRef(320);
  const oldDrv = cp.execSync('git -C ' + COS_ROOT + ' show ' + PREV + ':api/driver-auth.js',
    { maxBuffer: 1 << 26 }).toString().replace(/\r\n/g, '\n');
  const oldAt = cp.execSync('git -C ' + COS_ROOT + ' show ' + PREV + ':lib/alimtalk-core.js',
    { maxBuffer: 1 << 26 }).toString().replace(/\r\n/g, '\n');
  ck('★ 옛 판은 승인 코드가 **빈 값**이었다',
    /TPL_LEAVE_BY_BIZ = \{ academy: '', public: '' \}/.test(oldAt.replace(/\s+/g, ' ')), true);
  ck('  옛 판에는 `noButton` 갈래가 없다', /noButton/.test(oldAt), false);
  ck('  옛 판에는 `atOk` 가 없다', /export function atOk/.test(oldAt), false);
  ck('  옛 판 하원 길은 응답을 안 보고 성공으로 쳤다',
    /postAlimtalk\(form\); okSent = true;/.test(oldDrv), true);
  ck('  옛 판 출석 기기도 그랬다', /postAlimtalk\(form\); sent\+\+;/.test(oldDrv), true);
  ck('  옛 판 하원 문자는 `r.ok` 만 봤다', /okSent = !!\(r && r\.ok\);/.test(oldDrv), true);

  /* ★ 옛 판 + **이번 판 lib**(코드가 들어온 상태)으로 돌리면 단추가 붙는다 — 그게 거절 원인이다 */
  const S = st({ attTime: { [KDATE]: { 1: '08:10' } } });
  const r = await call(oldDrv, S, { action: 'kioskCheckin', pin: '1111' }, 'kioskTok', '1.2.3.4');
  ck('★ 옛 판은 하원 알림톡에 **단추를 붙였다**(거절 원인)',
    (atBox(S)[0] || {}).hasBtn, true);
  ck('  (그때도 하원은 찍혔다)', r.body.leg, 'out');

  /* ★ 옛 판은 알리고가 거절해도 **문자로 떨어지지 않았다** */
  const S2 = st({ attTime: { [KDATE]: { 1: '08:10' } },
                  atReply: { code: -99, message: '템플릿이 일치하지 않습니다(가짜)' } });
  const r2 = await call(oldDrv, S2, { action: 'kioskCheckin', pin: '1111' }, 'kioskTok', '1.2.3.4');
  ck('★ 옛 판 — 거절(`code:-99`)인데도 `leaveSent:1`', r2.body.leaveSent, 1);
  ck('  그래서 **문자로 안 떨어졌다**(아무것도 안 갔다)', smsBox(S2).length, 0);
}

console.log(NL + '════ ① 승인 코드 둘');
{
  const flat = AT.replace(/\s+/g, ' ');
  ck('★ academy = `UN_7423`', /TPL_LEAVE_BY_BIZ = \{ academy: 'UN_7423'/.test(flat), true);
  ck('★ public  = `UN_7424`', /public: *'UN_7424' \}/.test(flat), true);
  const tplLeave = fnOf(AT, 'tplLeaveCodeFor');
  ck('  `tplLeaveCodeFor(academy)`', tplLeave('academy'), 'UN_7423');
  ck('  `tplLeaveCodeFor(public)`', tplLeave('public'), 'UN_7424');
  ck('  모르는 업종은 빈 값(문자로 떨어진다)', JSON.stringify(tplLeave('logistics')), '""');
  /* 출석 템플릿 넷은 **안 건드렸다** */
  ck('  출석 템플릿 넷 그대로',
    /academy: *'UI_7310'/.test(flat) && /public: *'UI_7542'/.test(flat)
    && /logistics: *'UI_7550'/.test(flat) && /delivery: *'UI_7257'/.test(flat), true);
}

console.log(NL + '════ ② 하원 길 단추 **0** (귀가 템플릿은 단추 없음으로 승인)');
{
  const S = st({ attTime: { [KDATE]: { 1: '08:10' } } });
  const r = await kAtt(S);
  ck('★ 하원 알림톡 1건', atBox(S).length, 1);
  ck('★ 그 몸통에 `button_1` **없다**', atBox(S)[0].hasBtn, false);
  ck('  템플릿 코드가 귀가 코드다', atBox(S)[0].tpl, 'UN_7423');
  ck('  응답 `leaveSent:1`', r.body.leaveSent, 1);
  ck('  알림톡이 됐으니 문자 0', smsBox(S).length, 0);

  /* 공공도 같다 */
  const S2 = st({ biz: 'public', attTime: { [KDATE]: { 1: '08:10' } } });
  await call(SRC.drv, S2, { action: 'pinCheckin', org: ORG, pin: '1111', member: true },
    'ownerTok', '1.2.3.4');
  ck('★ 공공도 단추 0 · 코드 `UN_7424`',
    (atBox(S2)[0] || {}).hasBtn + '/' + (atBox(S2)[0] || {}).tpl, 'false/UN_7424');

  /* 소스에서도 — 하원 길만 `noButton` 을 준다 */
  ck('  소스: 하원 길에 `noButton: true`', /noButton: true/.test(DRV), true);
  ck('  소스: `noButton: true` 를 주는 자리 **하나**(나머지는 쪽지다)',
    (DRV.match(/noButton: true/g) || []).length, 1);
  ck('  소스: `alimtalkForm` 이 `noButton` 을 본다',
    /opts\.noButton \? null : buttonFor\(/.test(AT), true);
}

console.log(NL + '════ ③ 출석 길 단추는 **그대로** (출석 템플릿은 단추가 승인돼 있다)');
{
  const S = st();                                  /* 첫 누름 = 등원 → 출석 알림톡 */
  const r = await kAtt(S);
  ck('★ 등원이다', r.body.leg + '/' + r.body.first, 'in/true');
  ck('★ 출석 알림톡 1건', atBox(S).length, 1);
  ck('★ 그 몸통에는 `button_1` **있다**(학원 패밀리 링크)', atBox(S)[0].hasBtn, true);
  ck('  템플릿 코드가 출석 코드다', atBox(S)[0].tpl, 'UI_7310');
  ck('  하원 문자는 0(등원이라 하원 길로 안 간다)', smsBox(S).length, 0);

  /* 택배는 단추가 둘(배송조회 + 웹링크) — 그 길도 그대로다 */
  const bf = fnOf(AT, 'buttonFor');
  ck('  `buttonFor(academy)` 단추 1개', bf('academy').button.length, 1);
  ck('  `buttonFor(delivery)` 단추 2개', bf('delivery', 'CJ', '123').button.length, 2);
  ck('  `buttonFor(public)` 은 없음', JSON.stringify(bf('public')), 'null');
}

console.log(NL + '════ ④ 실패 판정 — 거절·던짐이면 **문자로 떨어진다**');
{
  /* ㉠ 성공(`code:0`) → 문자 0 */
  const S1 = st({ attTime: { [KDATE]: { 1: '08:10' } } });
  const r1 = await kAtt(S1);
  ck('㉠ `code:0` → 문자 **0건**', smsBox(S1).length, 0);
  ck('   `leaveSent:1`', r1.body.leaveSent, 1);
  ck('   기록 한 줄 없음', logHas(S1, '[leave]'), false);

  /* ㉡ 거절(`code:-99`) → 문자 1 */
  const S2 = st({ attTime: { [KDATE]: { 1: '08:10' } },
                  atReply: { code: -99, message: '템플릿 불일치(가짜)' } });
  const r2 = await kAtt(S2);
  ck('㉡ `code:-99` → 알림톡 1건 보냈지만', atBox(S2).length, 1);
  ck('   **문자로 떨어진다**(1건)', smsBox(S2).length, 1);
  ck('   그래서 `leaveSent:1`', r2.body.leaveSent, 1);

  /* ㉢ 던짐(망 끊김) → 문자 1 */
  const S3 = st({ attTime: { [KDATE]: { 1: '08:10' } }, throwAt: true });
  const r3 = await kAtt(S3);
  ck('㉢ 던지면 **문자로 떨어진다**', smsBox(S3).length, 1);
  ck('   `leaveSent:1`', r3.body.leaveSent, 1);

  /* ㉣ 둘 다 거절 → 0 · 기록 한 줄 (번호·본문 없이) */
  const S4 = st({ attTime: { [KDATE]: { 1: '08:10' } },
                  atReply: { code: -99, message: 'x' },
                  smsReply: { result_code: -101, message: '인증오류-IP(가짜)' } });
  const r4 = await kAtt(S4);
  ck('㉣ 둘 다 거절 → `leaveSent:0`', r4.body.leaveSent, 0);
  ck('   기록 한 줄이 남는다', logHas(S4, '[leave] 하원 알림 실패'), true);
  ck('   기록에 번호가 없다', (S4.logs || []).join(' ').indexOf('01011111111') < 0, true);
  ck('   그래도 **하원은 찍혔다**', r4.body.leg, 'out');

  /* ㉤ 문자 쪽 경계 — `result_code:0` 은 **실패**로 본다(공식 예시에 없다) */
  const S5 = st({ attTime: { [KDATE]: { 1: '08:10' } },
                  atReply: { code: -99, message: 'x' }, smsReply: { result_code: 0 } });
  const r5 = await kAtt(S5);
  ck('㉤ `result_code:0` 은 실패로 본다', r5.body.leaveSent, 0);
}

console.log(NL + '════ ⑤ 출석 기기 알림톡도 **같은 꼴** (연관 고침)');
{
  const S1 = st();
  const r1 = await kAtt(S1);
  ck('★ 성공이면 `sent:1`', r1.body.sent, 1);
  const S2 = st({ atReply: { code: -99, message: '거절(가짜)' } });
  const r2 = await kAtt(S2);
  ck('★ 거절이면 `sent:0`', r2.body.sent, 0);
  ck('  기록 한 줄이 남는다', logHas(S2, '[kiosk] 출석 알림톡 거절'), true);
  ck('  그래도 **출석은 찍혔다**', r2.body.leg + '/' + r2.body.first, 'in/true');
  const S3 = st({ throwAt: true });
  const r3 = await kAtt(S3);
  ck('★ 던지면 `sent:0` + 기록', r3.body.sent + '/' + logHas(S3, '[kiosk] 출석 알림톡 실패'),
    '0/true');
  /* 출석 길은 **문자로 떨어지지 않는다**(종전 그대로 — 알림톡만 쓰는 창구다) */
  ck('  출석 길은 문자로 안 떨어진다(종전 그대로)', smsBox(S3).length, 0);
}

console.log(NL + '════ ⑥ 승인 본문 맞대기 — 신청 글 ↔ `buildLeaveMessage`');
{
  const f = fnOf(AT, 'buildLeaveMessage');
  const V = ['#{업체명}', '#{이름}', '#{시각}'];
  for (const biz of ['academy', 'public']) {
    const got = f(biz, V[0], V[1], V[2]);
    ck('★ ' + biz + ' 글자까지 같다', got === WANT[biz], true);
    ck('   바이트 ' + Buffer.byteLength(WANT[biz], 'utf8'),
      Buffer.byteLength(got, 'utf8'), Buffer.byteLength(WANT[biz], 'utf8'));
    ck('   줄 수 ' + WANT[biz].split(NL).length,
      got.split(NL).length, WANT[biz].split(NL).length);
  }
  /* 문자용 글은 **그림 글자가 없다**(v311 · EUC-KR) */
  const fs2 = fnOf(AT, 'buildLeaveSmsText');
  const bad = /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{23F0}-\u{23FF}]/u;
  ck('★ 문자용 글에 그림 글자 0', bad.test(fs2('academy', '가온', '가하은', '17:05')), false);
  ck('  (대조) 알림톡 글에는 있다', bad.test(f('academy', '가온', '가하은', '17:05')), true);
}

console.log(NL + '════ ⑦ 두 판정 규칙이 **다르다** (섞이지 않았다)');
{
  const atOk = fnOf(AT, 'atOk');
  const smsOk = fnOf(SMSC, 'smsOk');
  ck('★ 알림톡 `code:0` → 성공', atOk({ code: 0 }), true);
  ck('  `code:-99` → 실패', atOk({ code: -99 }), false);
  ck('  `code:1` → 실패(알림톡은 0만 성공)', atOk({ code: 1 }), false);
  ck('  빈 응답 → 실패', atOk(null), false);
  ck('★ 문자 `result_code:1` → 성공', smsOk({ ok: true, data: { result_code: 1 } }), true);
  ck('  `result_code:-101` → 실패', smsOk({ ok: true, data: { result_code: -101 } }), false);
  ck('  `result_code:0` → 실패', smsOk({ ok: true, data: { result_code: 0 } }), false);
  ck('  `ok:false`(키 없음) → 실패', smsOk({ ok: false, why: 'nokey' }), false);
  ck('  `data` 없음 → 실패', smsOk({ ok: true }), false);
  ck('★★ 알림톡 답을 문자 자로 재면 실패한다(규칙이 다르다)',
    smsOk({ ok: true, data: { code: 0 } }), false);
  ck('★★ 문자 답을 알림톡 자로 재도 실패한다',
    atOk({ result_code: 1 }), false);
  /* 각자 제 파일에 있다 — 한 벌로 합치지 않았다 */
  ck('  `atOk` 는 `lib/alimtalk-core.js` 에만', /export function atOk/.test(AT)
    && !/function atOk/.test(SMSC), true);
  ck('  `smsOk` 는 `lib/sms-core.js` 에만', /export function smsOk/.test(SMSC)
    && !/function smsOk/.test(AT), true);
  /* 서버가 그 둘을 쓴다 — 응답을 안 보는 자리 **0** */
  /* ★ 쪽지에도 그 이름이 나오므로 **정말 부르는 꼴**로 센다(글자만 세면 주석까지 잡힌다) */
  ck('★ 서버가 정말 부르는 `AT.atOk(await AT.postAlimtalk` 자리 둘',
    (DRV.match(/AT\.atOk\(await AT\.postAlimtalk/g) || []).length, 2);
  ck('★ 서버가 정말 부르는 `okSent = SMS.smsOk(r);` 하나',
    (DRV.match(/okSent = SMS\.smsOk\(r\);/g) || []).length, 1);
  ck('★★ 응답을 안 보고 성공으로 치는 자리 **0**',
    /postAlimtalk\(form\); *(okSent = true|sent\+\+)/.test(DRV)
    || /okSent = !!\(r && r\.ok\)/.test(DRV), false);
}

console.log(NL + '════ ⑧ 앱은 안 바뀐다 · 버전 · 문답');
{
  ck('★ 앱 `BIZ_TEMPLATE_CODES` 에 `UN_7423` **0회**',
    (APP.match(/UN_7423/g) || []).length, 0);
  ck('★ 앱에 `UN_7424` 도 0회', (APP.match(/UN_7424/g) || []).length, 0);
  ck('★ `TPL_ALLOWED` 에도 0회',
    (GUARD.match(/UN_742[34]/g) || []).length, 0);
  ck('  까닭이 쪽지에 적혀 있다',
    /왜 앱\(`BIZ_TEMPLATE_CODES`\)·`TPL_ALLOWED` 에는 이 두 코드가 없는가/.test(AT), true);
  ck('  앱이 하원 알림을 보내는 길 0(v319 약속 그대로)',
    (APP.match(/tplLeaveCodeFor|TPL_LEAVE_BY_BIZ/g) || []).length, 0);

  /* 버전 — `index.html`(HELP_QA)이 바뀌었으니 321 */
  ck('★ `APP_VERSION` 321', (/const APP_VERSION = (\d+);/.exec(APP) || [])[1], '321');
  ck('★ `version.json` 321',
    JSON.parse(fs.readFileSync(COS_ROOT + '/version.json', 'utf8')).version, 321);

  /* HELP_QA — 수는 그대로(81) · 하원 답에 「알림톡」이 들어갔다 */
  const qaN = (src) => {
    const m = /HELP_QA\s*=\s*\[/.exec(src);
    let i = m.index + m[0].length, d = 1, j = i;
    while (d > 0 && j < src.length) { const c = src[j]; if (c === '[') d++; else if (c === ']') d--; j++; }
    return (src.slice(i, j - 1).match(/t:\s*['"]/g) || []).length;
  };
  ck('★ 문답 수 81(더하지 않고 **답만** 고쳤다)', qaN(APP), 81);
  const qa = APP.slice(APP.indexOf("t:'하원(귀가) 알림 켜기·끄기'") - 400,
                       APP.indexOf("t:'하원(귀가) 알림 켜기·끄기'") + 1400);
  ck('★ 하원 문답에 「귀가 알림톡」', qa.indexOf('귀가 알림톡') >= 0, true);
  ck('★ 「안 되면 문자로 다시」가 있다', qa.indexOf('문자로 다시') >= 0, true);
  ck('  「승인 심사 중」은 없앴다', qa.indexOf('승인 심사 중') >= 0, false);
}

console.log(NL + '════ ⑨ 가짜가 **실제 판이 내는 답**인가 (CLAUDE.md ★★★ 교훈)');
{
  const H = LF(fs.readFileSync(COS_ROOT + '/tests/drvenv.js', 'utf8'));
  ck('★ 알림톡 가짜는 `code`', /code: 0, message: '성공적으로 전송요청 하였습니다\.'/.test(H), true);
  ck('★ 문자 가짜는 `result_code`', /result_code: 1/.test(H), true);
  ck('★ 창구로 갈라 준다', /kakaoapi\\\.aligo\\\.in\|\\\/a\\\/alimtalk/.test(H), true);
  /* 실제로도 갈라 나오나 */
  const S = st({ attTime: { [KDATE]: { 1: '08:10' } },
                 atReply: { code: -99 } });               /* 알림톡 거절 → 문자까지 간다 */
  return (async () => {
    await kAtt(S);
    ck('  한 장면에서 두 창구가 모두 쓰였다',
      atBox(S).length + '/' + smsBox(S).length, '1/1');
    ck('  알리고로 **진짜 나간 요청 0**(가짜 fetch 가 다 받았다)',
      (S.sent || []).every((x) => /aligo\.in/.test(x.url)), true);
  })();
}

})().then(() => {
  console.log(NL + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass : '✔ ' + pass + '/' + (pass + fail) + ' 전부 통과'));
  console.log('※ 가짜 firebase-admin · 가짜 fetch — **실제 알리고 호출 0건** · 실제 쓰기 0');
  process.exit(fail ? 1 : 0);
});
