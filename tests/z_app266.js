/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v266 앱 검사 — 문자·알림톡 부르는 곳 6곳에 토큰 붙이기 · 읽기 전용 막기 · 50명씩 나눠 보내기
   전: a542802 (v265) · 후: 작업 중 */
process.env.COS_SRC_OLD_REF = process.env.COS_SRC_OLD_REF || 'a542802';
const fs = require('fs');
const cp = require('child_process');
const E = require('./env246.js');
const { build, SRC_NEW, makeEl } = E;
const SRC_OLD = cp.execSync('git -C ' + COS_ROOT + ' show a542802:index.html', { maxBuffer: 1 << 28 }).toString();
const HOME = fs.readFileSync('' + COS_ROOT + '/home.html', 'utf8');
const HOME_OLD = cp.execSync('git -C ' + COS_ROOT + ' show a542802:home.html', { maxBuffer: 1 << 26 }).toString();

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 64)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
            .map(l => l.replace(/(^|[^:'"\\])\/\/.*$/, '$1')).join('\n');
}
const NEWC = codeOnly(SRC_NEW), OLDC = codeOnly(SRC_OLD);

/* 보낸 요청을 모으는 판 */
function stage(over) {
  const B = build({ src: SRC_NEW });
  const S = B.sandbox;
  const sent = [];
  B.win._auth = { currentUser: { uid: 'UID1', isAnonymous: false, getIdToken: () => Promise.resolve('TOK') } };
  S._auth = B.win._auth;
  B.win._driverOrg = null;
  S.getUrlOrg = () => 'academy_UID123456789';
  S.orgIdFromUrlOrDefault = () => 'academy_UID123456789';
  S.fetch = async (url, opt) => {
    sent.push({ url, headers: (opt && opt.headers) || {}, body: JSON.parse((opt && opt.body) || '{}') });
    return { json: async () => (over && over.reply) || { result_code: 1, success_cnt: 1 } };
  };
  B.win.fetch = S.fetch;
  S.showToast = (m) => { S._toast = m; };
  S.alert = () => {}; B.win.alert = S.alert;
  return { B, S, sent };
}

(async () => {

/* ══ ① 화면에서 직접 부르는 곳이 사라졌다 ══════════════════════════════ */
console.log('\n① 부르는 길 — 전부 한 곳으로');
{
  const direct = (s) => (s.match(/fetch\('https:\/\/cosroad\.vercel\.app\/api\/send-(sms|alimtalk)'/g) || []).length;
  ck('index.html 에서 직접 부르는 곳 1곳 (문의 부르개 안쪽)', direct(SRC_NEW), 1);
  ck('  (대조) 옛 판은 4곳이었다', direct(SRC_OLD), 4);
  ck('sendMsgApi 가 있다', /async function sendMsgApi\(path, body\)/.test(SRC_NEW), true);
  ck('sendInquirySms 가 있다', /async function sendInquirySms\(body\)/.test(SRC_NEW), true);
  ck('  (대조) 옛 판에는 둘 다 없다', /sendMsgApi|sendInquirySms/.test(OLDC), false);
  ck('알림장·하차·출석 세 곳이 sendMsgApi 를 쓴다',
     (NEWC.match(/sendMsgApi\('send-(sms|alimtalk)'/g) || []).length, 3);
  ck('home.html 도 번호를 안 보낸다', /receiver:'010-3660-3911'/.test(HOME), false);
  ck('  (대조) 옛 판은 번호를 보냈다', /receiver:'010-3660-3911'/.test(HOME_OLD), true);
  ck('home.html 이 mode:\'inquiry\' 로 부른다', /mode:'inquiry'/.test(HOME), true);
}

/* ══ ② 토큰이 붙는가 ═══════════════════════════════════════════════════ */
console.log('\n② 로그인 토큰이 붙는가');
{
  const { S, sent } = stage();
  const r = await S.sendMsgApi('send-sms', { receiver: '01011111111', msg: 'x' });
  ck('보냈다', sent.length, 1);
  ck('  Authorization 헤더', sent[0].headers.Authorization, 'Bearer TOK');
  ck('  주소', sent[0].url, 'https://cosroad.vercel.app/api/send-sms');
  ck('  업체(org)를 함께 보낸다', sent[0].body.org, 'academy_UID123456789');
  ck('  응답을 그대로 돌려준다', r.result_code, 1);

  /* 로그인 안 했으면 부르지도 않는다 */
  const { B: B2, S: S2, sent: s2 } = stage();
  B2.win._auth = { currentUser: null };          /* 코드는 window._auth 를 본다 */
  const r2 = await S2.sendMsgApi('send-sms', { msg: 'x' });
  ck('로그인 안 함 → 안 부른다', s2.length, 0);
  ck('  까닭을 말해 준다', /로그인이 필요해요/.test(r2.message), true);

  /* 익명 로그인도 */
  const { B: B3, S: S3, sent: s3 } = stage();
  B3.win._auth = { currentUser: { isAnonymous: true } };
  await S3.sendMsgApi('send-sms', { msg: 'x' });
  ck('익명 로그인 → 안 부른다', s3.length, 0);

  /* 기사면 기사 업체로 */
  const { B: B4, S: S4, sent: s4 } = stage();
  B4.win._driverOrg = 'academy_DRIVER';
  await S4.sendMsgApi('send-alimtalk', { receiver: '01011111111' });
  ck('기사는 자기 업체(driverOrg)로 보낸다', s4[0].body.org, 'academy_DRIVER');
}

/* ══ ③ 읽기 전용이면 **부르기 전에** 막는다 ═══════════════════════════ */
console.log('\n③ 이용 기간이 끝났으면 (읽기 전용)');
{
  const { S, sent } = stage();
  S._readOnlyMode = true;
  const r = await S.sendMsgApi('send-sms', { receiver: '01011111111', msg: 'x' });
  ck('서버를 **부르지 않는다**', sent.length, 0);
  ck('  blocked 로 알려 준다', r.blocked, true);
  ck('  사람 말로 까닭', /이용 기간이 끝나 문자를 보낼 수 없어요/.test(r.message), true);
  ck('  ★ 폰에서 안 잘리게 짧다 (showToast 는 nowrap)', r.message.length <= 24, true);
  ck('  (대조) 읽기 전용이 아니면 부른다', (await (async () => {
    const x = stage(); await x.S.sendMsgApi('send-sms', { msg: 'x' }); return x.sent.length;
  })()), 1);
  ck('isReadOnlyMode 를 보는 자리가 늘었다',
     (NEWC.match(/isReadOnlyMode\(\)/g) || []).length > (OLDC.match(/isReadOnlyMode\(\)/g) || []).length, true);
}

/* ══ ④ 문의 — 번호를 안 보낸다 ═════════════════════════════════════════ */
console.log('\n④ 문의 알림');
{
  const { S, sent } = stage();
  await S.sendInquirySms('(가온학원/관리자) 요금 — 얼마인가요');
  ck('한 번 부른다', sent.length, 1);
  ck('  mode', sent[0].body.mode, 'inquiry');
  ck('  ★ 받는 번호를 안 보낸다', 'receiver' in sent[0].body, false);
  ck('  본문만 보낸다', Object.keys(sent[0].body).sort().join(','), 'mode,msg');
  ck('  앞머리를 화면이 안 붙인다', /^\[코스로드 문의\]/.test(sent[0].body.msg), false);
  ck('  로그인했으면 토큰도 붙는다', sent[0].headers.Authorization, 'Bearer TOK');

  /* 로그인 안 했어도 보낸다 (홈 방문자) */
  const { B: Bi, S: S2, sent: s2 } = stage();
  Bi.win._auth = { currentUser: null };
  await S2.sendInquirySms('홈에서 문의');
  ck('로그인 안 해도 보낸다', s2.length, 1);
  ck('  그때는 토큰이 없다', 'Authorization' in s2[0].headers, false);

  /* 읽기 전용이어도 문의는 보낼 수 있어야 한다 */
  const { S: S3, sent: s3 } = stage();
  S3._readOnlyMode = true;
  await S3.sendInquirySms('만료됐는데 문의');
  ck('읽기 전용이어도 **문의는** 보낸다', s3.length, 1);
}

/* ══ ⑤ 알림장 — 50명씩 나눠 · 「보냄」은 결과 뒤에 ════════════════════ */
console.log('\n⑤ 알림장');
{
  ck('한 번에 보낼 수 있는 수가 상수로 있다', /var SMS_CHUNK = 50;/.test(SRC_NEW), true);

  const mk = (n) => Array.from({ length: n }, (_, i) => '0101111' + String(i).padStart(4, '0'));
  /* 120명 → 50 + 50 + 20 */
  const { S, sent } = stage();
  S.notices = [{ id: 1, content: 'c' }];
  S.saveNotices = () => {};
  S.renderNotice = () => '';
  S.T = (x) => x;
  S.orgSettings = { name: '가온학원' };
  const n = { id: 1, content: 'c' };
  await S.doSendNoticeMessage(n, mk(120), '본문');
  ck('120명 → 세 번 나눠 보낸다', sent.length, 3);
  ck('  1·2번째 50명씩', sent[0].body.receiver.split(',').length + '/' + sent[1].body.receiver.split(',').length, '50/50');
  ck('  3번째 20명', sent[2].body.receiver.split(',').length, 20);
  ck('  보냄 표시가 찍혔다', n.sent, true);
  ck('  결과를 합쳐 알려 준다', /발송 완료 \(3건\)|발송 완료/.test(S._toast), true);

  /* 막히면 거기서 멈추고 「보냄」을 안 찍는다 */
  const bad = stage({ reply: { result_code: -1, message: '이용 기간이 끝났거나 승인 전이라…' } });
  bad.S.notices = []; bad.S.saveNotices = () => {}; bad.S.renderNotice = () => ''; bad.S.T = (x) => x;
  bad.S.orgSettings = { name: '가온' };
  const n2 = { id: 2, content: 'c' };
  await bad.S.doSendNoticeMessage(n2, mk(120), '본문');
  ck('첫 묶음이 막히면 **더 안 보낸다**', bad.sent.length, 1);
  ck('  「보냄」을 안 찍는다', !!n2.sent, false);
  ck('  까닭을 그대로 보여 준다', /이용 기간이 끝났거나/.test(bad.S._toast), true);

  /* 읽기 전용이면 아예 안 부른다 */
  const ro = stage();
  ro.S.notices = []; ro.S.saveNotices = () => {}; ro.S.renderNotice = () => ''; ro.S.T = (x) => x;
  ro.S.orgSettings = { name: '가온' }; ro.S._readOnlyMode = true;
  const n3 = { id: 3, content: 'c' };
  await ro.S.doSendNoticeMessage(n3, mk(10), '본문');
  ck('읽기 전용 → 한 번도 안 부른다', ro.sent.length, 0);
  ck('  「보냄」도 안 찍는다', !!n3.sent, false);

  /* (대조) 옛 판은 「보냄」을 먼저 찍었다 */
  ck('(대조) 옛 판은 보내기 전에 n.sent=true 를 찍었다',
     /n\.sent = true;[\s\S]{0,80}saveNotices\(\);[\s\S]{0,200}fetch\('https:\/\/cosroad\.vercel\.app\/api\/send-sms'/.test(SRC_OLD), true);
  ck('새 판은 그 순서가 아니다',
     /n\.sent = true;[\s\S]{0,80}saveNotices\(\);[\s\S]{0,200}fetch\('https:\/\/cosroad\.vercel\.app\/api\/send-sms'/.test(SRC_NEW), false);
}

/* ══ ⑥ 알림톡 두 곳 — 막히면 폰 문자앱으로 안 넘긴다 ═════════════════ */
console.log('\n⑥ 알림톡 — 기간이 끝났을 때');
{
  ck('하차 쪽에 blocked 분기가 있다',
     /하차 알림톡 발송 성공[\s\S]{0,200}d\.blocked/.test(SRC_NEW), true);
  ck('출석 쪽에도 있다',
     /알림톡 발송 성공[\s\S]{0,200}data\.blocked/.test(SRC_NEW), true);
  /* 옛 판에도 testorg-blocked·driver-blocked 라는 **다른 뜻의 blocked** 가 있다 —
     그래서 낱말이 아니라 **이 분기**(d.blocked / data.blocked)가 없다는 것을 본다. */
  ck('  (대조) 옛 판에는 이 분기가 없다', /d\.blocked|data\.blocked/.test(OLDC), false);
}

/* ══ ⑦ 문답 ════════════════════════════════════════════════════════════ */
console.log('\n⑦ 문답');
{
  const B = build({ src: SRC_NEW });
  const qa = B.sandbox.HELP_QA;
  /* ★ 회차마다 문답이 늘어난다(v270 +1). 못 박는 대신 「줄지 않았고 지금 수를 안다」로 바꿨다. */
  ck('문답 수 (73 이상)', (qa.length >= 73) + ' / ' + qa.length, 'true / ' + qa.length);
  const q = qa.filter(x => x.t === '문자·알림톡이 안 나가요')[0];
  ck('새 문답이 있다', !!q, true);
  ck('  검색어에 공백 없음', (q.keys || []).some(k => /\s/.test(k)), false);
  /* ★ v266 보정1 — 답변이 「하루 상한」에서 「상한」으로 바뀌고 **숫자를 적게** 됐다
     (1분 300 · 하루 3,000). 그래서 숫자까지 같이 본다 — lib/send-guard.js 상수와 어긋나면 잡힌다. */
  ck('  기간·명부·상한 셋을 다 말한다',
     /이용 기간/.test(q.a) && /회원 명부/.test(q.a) && /<b>상한<\/b>/.test(q.a), true);
  {
    const g = require('fs').readFileSync('' + COS_ROOT + '/lib/send-guard.js', 'utf8');
    const num = (re) => (g.match(re) || [])[1];
    const comma = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const mn = num(/ORG_PER_MIN\s*=\s*(\d+)/), dy = num(/ORG_PER_DAY\s*=\s*(\d+)/);
    ck('  상한 숫자가 서버 상수와 같다 (1분)', q.a.indexOf('1분에 ' + comma(mn) + '명') >= 0, true);
    ck('  상한 숫자가 서버 상수와 같다 (하루)', q.a.indexOf('하루 ' + comma(dy) + '명') >= 0, true);
    ck('    서버 상수 실제 값', mn + '/' + dy, '300/3000');
  }
  ck('  기사 얘기도 있다', /자기 차량 회원/.test(q.a), true);
  ck('  50명씩 나눠 보내는 것도', /50명씩/.test(q.a), true);
  /* ★ 사람이 실제로 칠 말로 찾아지는지 — 「문자」만으로는 로그인 문답이 먼저 나온다(CLAUDE.md 함정).
     그래서 「안가요」·「안나가」·「못보내」 같은 **말 그대로의 조각**을 검색어에 넣었다. */
  const say = (q) => { const a = B.sandbox.helperAnswer(q);
    return (a.item ? [a.item] : (a.items || [])).some(x => x.t === '문자·알림톡이 안 나가요'); };
  ['문자가 안가요', '문자가 안 나가요', '알림톡이 안 가요', '문자를 못 보내요',
   '발송 실패', '하루 상한', '명부에 없는 번호'].forEach(q => {
    ck('  도우미가 찾는다 — ' + q, say(q), true);
  });
  ck('  (대조) 엉뚱한 질문엔 안 나온다', say('회원 등록'), false);
}

/* ══ ⑧ 버전 ════════════════════════════════════════════════════════════ */
console.log('\n⑧ 버전');
{
  const vj = JSON.parse(fs.readFileSync('' + COS_ROOT + '/version.json', 'utf8'));
  const av = Number((SRC_NEW.match(/const APP_VERSION = (\d+);/) || [])[1]);
  /* ★ v267 에서 버전이 267 로 올랐다. 이 묶음이 지켜야 할 것은 「그 회차 버전 **이상**이고
     두 값이 같다」는 것이라, 숫자를 못 박는 대신 그렇게 바꿨다(앞선 묶음들과 같은 방식). */
  ck('APP_VERSION · version.json (266 이상 · 둘이 같음)', (av >= 266 && av === vj.version) + ' / ' + av, 'true / ' + av);
  ck('옛 판은 265', Number((SRC_OLD.match(/const APP_VERSION = (\d+);/) || [])[1]), 265);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e && e.stack || e); process.exit(1); });
