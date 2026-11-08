/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v261 앱 검사 — 가입 창 개편 · 옛 클라이언트 가입 함수 삭제 · 마스터 패널 사업자 정보 · 문답표
   전: b6651bc (v260) · 후: 작업 중 (COS_SRC_OLD_REF=b6651bc 로 돌린다)
   ★ 「0건」을 말하기 전에 **같은 검사로 1건을 잡을 수 있음**을 먼저 보인다. */
const fs = require('fs');
/* ★ v272 보정1: 「옛」쪽 기준 커밋을 **파일 안에 박아 둔다**.
   머리 쪽지에 「COS_SRC_OLD_REF=b6651bc 로 돌린다」고만 적혀 있어, 그냥 돌리면 env246 이
   기본값 HEAD~1 을 써 **바로 앞 회차**를 「옛 판」으로 삼았다 — 그래서 「옛 판은 260」이
   271 로 나오고 대조가 전부 뒤집혔다(v272 기준 7건). 손으로 환경변수를 줘야만
   맞는 묶음은 언젠가 틀리게 돌아간다. */
if (!process.env.COS_SRC_OLD_REF) process.env.COS_SRC_OLD_REF = 'b6651bc';
const E = require('./env246.js');
const { build, SRC_OLD, makeEl } = E;
/* ★ v262 에서 **회차 커밋으로 못 박았다.**
   이 표는 「v260 → v261 사이에 무엇이 바뀌었나」를 적은 기록이다. 작업트리를 「후」로 보면
   뒤 회차(v262 창 잘림 고침)가 섞여 들어와 버전 칸부터 거짓으로 깨진다.
   지금 코드는 그 회차의 표(pw262/run262.js)가 본다. */
const ROUND = process.env.COS_SRC_ROUND_REF || '0706501';
const showR = (f) => require('child_process')
  .execSync('git -C ' + COS_ROOT + ' show ' + ROUND + ':' + f, { maxBuffer: 1 << 28 })
  .toString().split(String.fromCharCode(13) + String.fromCharCode(10)).join(String.fromCharCode(10));
const SRC_NEW = showR('index.html');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(58) + String(got).slice(0, 70)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
/* 주석(/* … *​/ 과 // 줄)을 떼어 **코드만** 본다 — 설명문에 적은 이름이 호출로 세어지지 않게 */
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
            .map(l => l.replace(/(^|[^:'"\\])\/\/.*$/, '$1')).join('\n');
}
const NEWC = codeOnly(SRC_NEW), OLDC = codeOnly(SRC_OLD);

(async () => {

/* ══ ① 옛 클라이언트 가입 함수 — 부르는 곳 0 (삭제 전 확인한 그대로) ════════ */
console.log('\n① 옛 가입 함수·칸이 코드에서 사라졌는가 (주석 제외)');
{
  const gone = ['suCreateAccount', 'suSaveUserDoc', 'doSignupEmail', 'doSignupPhone',
                'suSetMethod', 'suSyncContact', 'suCheckCommon',
                'notifyMasterSignup', 'notifyApplicantAccount', 'sendSignupSms',
                '_suMethod', 'su-email', 'su-contact', 'su-pw-p', 'su-tab-email', 'su-tab-phone',
                'createUserWithEmailAndPassword'];
  gone.forEach((n) => {
    const nOld = (OLDC.match(new RegExp(n.replace(/[-]/g, '\\-'), 'g')) || []).length;
    const nNew = (NEWC.match(new RegExp(n.replace(/[-]/g, '\\-'), 'g')) || []).length;
    ck(n + ' (옛 ' + nOld + '회)', nNew, 0);
  });
  ck('대조 — 같은 검사로 살아 있는 이름은 센다 (doSignup)',
    (NEWC.match(/doSignup/g) || []).length >= 2, true);
  ck('대조 — signInWithEmailAndPassword 는 전/후 같은 수 (지우지 않았다)',
    (NEWC.match(/signInWithEmailAndPassword/g) || []).length,
    (OLDC.match(/signInWithEmailAndPassword/g) || []).length);
}

/* ══ ② 남겨 두기로 한 길 (이메일 로그인 · 재설정 메일) ═════════════════════ */
console.log('\n② 기존 계정용으로 **남긴** 길');
{
  ck('pwrMailPath 함수가 있다', /function pwrMailPath\(\)/.test(NEWC), true);
  ck('   「재설정 메일 받기」 단추도 있다', /재설정 메일 받기/.test(SRC_NEW), true);
  ck('sendPasswordResetEmail 그대로', (NEWC.match(/sendPasswordResetEmail/g) || []).length,
     (OLDC.match(/sendPasswordResetEmail/g) || []).length);
  ck('로그인은 이메일도 받는다 (looksLikePhoneId 분기)',
    /var email = looksLikePhoneId\(typed\) \? phoneLoginId\(typed\) : typed;/.test(NEWC), true);
  ck('openPwChangeModal(이메일 계정 비번 변경) 그대로', /function openPwChangeModal\(\)/.test(NEWC), true);
}

/* ══ ③ 가입 창 — 실제로 그려 보고 칸을 센다 ════════════════════════════════ */
console.log('\n③ 가입 창을 그려서 칸을 확인한다');
let H = '';
{
  const B = build({ src: SRC_NEW });
  ck('스크립트 블록이 올라간다', B.error ? String(B.error.message) : 'ok', 'ok');
  B.sandbox.openSignupModal('logistics');
  H = (B.bodyKids[0] || {})._html || '';
  ck('창이 하나 열린다', /id="signup-modal"/.test(H), true);
  const need = ['su-biz', 'su-name', 'su-phone', 'su-send', 'su-code',
                'su-bizno', 'su-ceo', 'su-open', 'su-bizchk', 'su-biz-state',
                'su-pw', 'su-pw2', 'su-pw2-msg', 'su-err', 'su-info', 'su-agree', 'su-go'];
  need.forEach(id => ck('칸 ' + id, new RegExp('id="' + id + '"').test(H), true));
  const absent = ['su-email', 'su-contact', 'su-pw-p', 'su-tab-email', 'su-tab-phone', 'su-email-box', 'su-phone-box'];
  absent.forEach(id => ck('없어진 칸 ' + id, new RegExp('id="' + id + '"').test(H), false));
  ck('대조 — 같은 검사로 있는 칸은 찾는다', /id="su-biz"/.test(H), true);

  ck('이메일·연락처라는 말이 창에 없다', /이메일로 가입|연락처/.test(H), false);
  ck('   「사업자등록증과 똑같이」 안내가 있다', /사업자등록증과 똑같이/.test(H), true);
  ck('업종 4가지 그대로', (H.match(/<option value="/g) || []).length, 4);
  ck('넘겨받은 업종이 미리 골라진다 (su-biz value)',
    (B.document.getElementById('su-biz') || {}).value || '(칸 객체 없음)', '(칸 객체 없음)');
  ck('약관·개인정보 링크 둘', (H.match(/terms\.html|privacy\.html/g) || []).length, 2);
  ck('「가입 신청」 단추는 처음엔 잠겨 있다', /id="su-go"[^>]*disabled/.test(H), true);
  ck('   잠긴 모습(opacity 0.5)도 함께', /id="su-go"[^>]*opacity:0\.5/.test(H), true);
  ck('인증번호 단추 문구', /인증번호 받기/.test(H), true);
  ck('「🔎 사업자 확인」 단추 문구', /🔎 사업자 확인/.test(H), true);
}

/* ══ ④ 사업자 확인 → 가입 신청 열림 (실제로 눌러 본다) ════════════════════ */
console.log('\n④ 사업자 확인·가입 신청 동작');
{
  function stage(over) {
    const B = build({ src: SRC_NEW });
    const els = {};
    ['su-biz','su-name','su-phone','su-code','su-bizno','su-ceo','su-open',
     'su-pw','su-pw2','su-pw2-msg','su-err','su-info','su-agree','su-go','su-send','su-bizchk',
     'su-biz-state','admin-email','admin-pw'].forEach((id) => {
      const el = makeEl('input'); el.id = id; els[id] = el; B.document.registerId(id, el);
    });
    Object.assign(els['su-biz'],  { value: 'academy' });
    Object.assign(els['su-name'], { value: '코스로드학원' });
    Object.assign(els['su-phone'],{ value: '010-1234-5678' });
    Object.assign(els['su-code'], { value: '975310' });
    Object.assign(els['su-bizno'],{ value: '211-88-11430' });
    Object.assign(els['su-ceo'],  { value: '홍길동' });
    Object.assign(els['su-open'], { value: '2020-03-01' });
    Object.assign(els['su-pw'],   { value: 'pw1234' });
    Object.assign(els['su-pw2'],  { value: 'pw1234' });
    els['su-agree'].checked = true;
    Object.keys(over || {}).forEach(k => { Object.assign(els[k], over[k]); });
    const calls = [];
    B.sandbox.fetch = (url, opt) => {
      let body = null; try { body = JSON.parse((opt && opt.body) || 'null'); } catch (e) {}
      calls.push({ url, method: (opt && opt.method), body });
      const reply = (body && body.action === 'bizCheck')
        ? { ok: true, bStt: '계속사업자', taxType: '부가가치세 일반과세자' }
        : { ok: true };
      return Promise.resolve({ json: () => Promise.resolve(reply) });
    };
    return { B, els, calls };
  }
  const flush = () => new Promise(r => setImmediate(() => setImmediate(() => setImmediate(r))));

  /* ④-1 사업자 확인 전에는 가입이 안 된다 */
  {
    const { B, els, calls } = stage();
    B.sandbox.doSignup();
    ck('확인 전 「가입 신청」 → 서버 호출 0', calls.length, 0);
    ck('   안내 문구에 「사업자 확인」', /사업자 확인/.test(els['su-err'].textContent), true);
  }
  /* ④-2 사업자 확인 호출 모양 */
  {
    const { B, els, calls } = stage();
    B.sandbox.suCheckBiz();
    await flush();
    ck('bizCheck 호출 1회', calls.length, 1);
    ck('   주소', calls[0].url, 'https://cosroad.vercel.app/api/signup');
    ck('   POST', calls[0].method, 'POST');
    ck('   보내는 칸', Object.keys(calls[0].body).sort().join(','), 'action,b_no,p_nm,start_dt');
    ck('   b_no 는 숫자만', calls[0].body.b_no, '2118811430');
    ck('   start_dt 는 숫자만', calls[0].body.start_dt, '20200301');
    ck('   확인 결과를 칸에 적는다', /계속사업자/.test(els['su-biz-state'].textContent), true);
    ck('통과하면 「가입 신청」이 열린다', els['su-go'].disabled, false);

    /* ④-3 사업자 칸을 고치면 다시 잠긴다 */
    els['su-bizno'].value = '211-88-11431';
    B.sandbox.suBizDirty();
    ck('사업자번호를 고치면 다시 잠긴다', els['su-go'].disabled, true);
    ck('   확인 표시도 사라진다', els['su-biz-state'].style.display, 'none');
  }
  /* ④-4 가입 신청이 보내는 본문 */
  {
    const { B, els, calls } = stage();
    B.sandbox.suCheckBiz();
    await flush();
    let loginCalled = 0;
    B.sandbox.loginAdmin = () => { loginCalled++; };
    B.sandbox.showInstallGuide = () => {};
    B.sandbox.doSignup();
    await flush();
    ck('create 호출', calls.length, 2);
    const c = calls[1];
    ck('   보내는 칸 전수', Object.keys(c.body).sort().join(','),
      'action,agree,b_no,bizType,code,orgName,p_nm,password,phone,start_dt');
    ck('   action', c.body.action, 'create');
    ck('   phone (숫자만)', c.body.phone, '01012345678');
    ck('   code', c.body.code, '975310');
    ck('   bizType·orgName', c.body.bizType + '/' + c.body.orgName, 'academy/코스로드학원');
    ck('   agree', c.body.agree, true);
    ck('   비밀번호를 보낸다 (서버가 계정을 만든다)', c.body.password, 'pw1234');
    ck('   uid·토큰 같은 것은 보내지 않는다', /uid|token/.test(JSON.stringify(c.body)), false);
    ck('끝나면 로그인 길로 넘긴다 (loginAdmin 1회)', loginCalled, 1);
    ck('   로그인 칸을 채워 둔다', els['admin-email'].value + '/' + els['admin-pw'].value, '01012345678/pw1234');
    ck('   알림창 문구', /승인 요청/.test((B.alerts[0] || '')), true);
  }
  /* ④-5 입력 검사 — 하나씩 어긋나게 해 본다 */
  {
    const cases = [
      ['업체명 빈 칸', { 'su-name': { value: '  ' } }, '업체명'],
      ['번호 형식', { 'su-phone': { value: '02-111-2222' } }, '휴대폰 번호'],
      ['인증번호 5자리', { 'su-code': { value: '12345' } }, '인증번호'],
      ['비밀번호 5자', { 'su-pw': { value: 'pw123' }, 'su-pw2': { value: 'pw123' } }, '6자 이상'],
      ['비밀번호 불일치', { 'su-pw2': { value: 'other1' } }, '서로 달라'],
      ['약관 미동의', { 'su-agree': { checked: false } }, '약관']
    ];
    for (const [label, over, want] of cases) {
      const { B, els, calls } = stage(over);
      B.sandbox.suCheckBiz();
      await flush();
      B.sandbox.doSignup();
      await flush();
      ck(label + ' → create 안 보냄', calls.length, 1);
      ck('   문구', new RegExp(want).test(els['su-err'].textContent), true);
    }
  }
  /* ④-6 인증번호 받기 purpose */
  {
    const { B, calls } = stage();
    B.sandbox.suSendCode();
    await flush();
    ck('인증번호 받기 주소', calls[0].url, 'https://cosroad.vercel.app/api/otp');
    ck('   보내는 칸', Object.keys(calls[0].body).sort().join(','), 'action,phone,purpose');
    ck('   purpose', calls[0].body.purpose, 'signup');
    ck('   action', calls[0].body.action, 'send');
  }
}

/* ══ ⑤ 마스터 패널 — 사업자 정보 줄 ═══════════════════════════════════════ */
console.log('\n⑤ 마스터 패널 사업자 정보 줄 (masterBizLine)');
{
  const B = build({ src: SRC_NEW });
  const u = { _uid: 'abcdef123456', orgName: '코스로드학원', bizNo: '2118811430',
              bizCeo: '홍길동', bizOpenDate: '20200301', bizCheckedAt: Date.parse('2026-11-02T01:00:00+09:00') };
  const one = B.sandbox.masterBizLine(u, [u]);
  ck('사업자번호를 000-00-00000 꼴로 보여준다', /211-88-11430/.test(one), true);
  ck('대표자', /홍길동/.test(one), true);
  ck('개업일 YYYY-MM-DD', /2020-03-01/.test(one), true);
  ck('확인 시각(한국 날짜)', /2026-11-02/.test(one), true);
  ck('같은 번호가 하나면 ⚠ 없음', /같은 사업자번호/.test(one), false);

  const v = Object.assign({}, u, { _uid: 'zzz' });
  ck('대조 — 같은 번호가 둘이면 ⚠', /같은 사업자번호/.test(B.sandbox.masterBizLine(u, [u, v])), true);
  ck('   서버가 적어 둔 bizNoDup 로도 ⚠',
    /같은 사업자번호/.test(B.sandbox.masterBizLine(Object.assign({}, u, { bizNoDup: true }), [u])), true);

  const old = { _uid: 'old1', orgName: '예전 업체' };
  ck('v260 이전 가입자는 「사업자 확인 전」', /사업자 확인 전/.test(B.sandbox.masterBizLine(old, [old])), true);
  ck('   그 줄에 ⚠ 를 붙이지 않는다', /같은 사업자번호/.test(B.sandbox.masterBizLine(old, [old])), false);

  ck('승인 대기 줄에서 부른다', (NEWC.match(/masterBizLine\(u, orgUsers\)/g) || []).length, 2);
  ck('마스터 알림 번호 칸(bill-notify)', /id="bill-notify"/.test(SRC_NEW), true);
  ck('   저장에 notifyPhone 이 들어간다', /notifyPhone:v\('bill-notify'\)/.test(NEWC), true);
  /* 가입 알림은 이제 **서버**가 보낸다 — 화면에는 번호를 보내는 코드가 없다.
     남은 세 자리: 주석 1 · 안내문(placeholder) 1 · **문의함 알림** 1(종전부터 박혀 있음). */
  ck('   가입 문자를 화면에서 보내지 않는다 (sendSignupSms 자체가 없다)',
    /sendSignupSms/.test(NEWC), false);
  ck('   옛 판은 화면에서 보냈다 (대조)', /sendSignupSms\('010-3660-3911'/.test(codeOnly(SRC_OLD)), true);
  ck('   남은 번호 자리 수 (주석·안내문·문의함)', (SRC_NEW.match(/010-3660-3911/g) || []).length, 3);
  ck('   그중 안내문(placeholder) 1',
    /placeholder="비우면 010-3660-3911 로 갑니다"/.test(SRC_NEW), true);
  ck('   그중 문의함 알림 1 (이번 회차 밖 — 보고문에 적는다)',
    (NEWC.match(/receiver:'010-3660-3911', msg:'\[코스로드 문의\]/g) || []).length, 1);
  ck('      옛 판에도 같은 자리 (안 건드렸다)',
    (OLDC.match(/receiver:'010-3660-3911', msg:'\[코스로드 문의\]/g) || []).length, 1);
}

/* ══ ⑥ 도우미 문답표 ═══════════════════════════════════════════════════════ */
console.log('\n⑥ 도우미 문답표 (HELP_QA)');
{
  const B = build({ src: SRC_NEW });
  const O = build({ src: SRC_OLD });
  const qaNew = B.sandbox.HELP_QA, qaOld = O.sandbox.HELP_QA;
  ck('문답 수 (옛 ' + qaOld.length + ' → 새)', qaNew.length, qaOld.length + 1);
  const t = (s) => qaNew.filter(x => x.t === s)[0];
  ck('가입 문답 제목', (qaNew.filter(x => x.keys.indexOf('회원가입') >= 0)[0] || {}).t,
     '회원가입 — 문자 인증 + 사업자 확인');
  const su = t('회원가입 — 문자 인증 + 사업자 확인');
  ck('   사업자등록 필수 안내', /사업자등록된 업체만/.test(su.a), true);
  ck('   인증번호 안내', /인증번호 받기/.test(su.a), true);
  ck('   「사업자 확인」 안내', /🔎 사업자 확인/.test(su.a), true);
  ck('   기존 이메일 계정은 그대로라고 적었다', /이미 이메일로 가입해 두신 계정/.test(su.a), true);
  ck('   연락처 칸 이야기가 없다', /연락처\(휴대폰\)를 넣어요/.test(su.a), false);
  const bz = t('사업자 확인이 안 돼요');
  ck('새 문답 「사업자 확인이 안 돼요」', !!bz, true);
  ck('   휴업·폐업 안내', /휴업/.test(bz.a) && /폐업/.test(bz.a), true);
  ck('   개업연월일 안내', /개업연월일/.test(bz.a), true);
  ck('   검색어로 찾힌다', B.sandbox.helperAnswer('사업자 확인이 안 돼요').type !== 'none', true);

  ck('승인 대기 문답 — 「이메일 확인 필요」 사라짐',
    /이메일 확인 필요/.test(JSON.stringify(qaNew)), false);
  ck('   옛 판에는 있었다 (대조)', /이메일 확인 필요/.test(JSON.stringify(qaOld)), true);
  ck('구독 문답 — 흐름을 새로 적었다',
    /가입\(문자 인증 \+ 사업자 확인\)/.test(JSON.stringify(qaNew)), true);
  ck('「이메일로 가입」 권하는 안내가 남아 있지 않다',
    /이메일로 가입」 또는|📧 이메일로 가입/.test(JSON.stringify(qaNew)), false);
  ck('1234 문답 번호 겹침(5·5)을 바로잡았다',
    /\\n5\. 비밀번호를 잊으셨으면[\s\S]*?\\n6\. 왜 없앴나요/.test(SRC_NEW), true);
  /* 모든 문답의 번호가 1,2,3… 로 이어지는지 (문답표 전체 점검) */
  let badNum = [];
  qaNew.forEach((it) => {
    const ns = (it.a.match(/(?:^|\n)(\d+)\. /g) || []).map(x => Number(x.replace(/\D/g, '')));
    for (let i = 0; i < ns.length; i++) if (ns[i] !== i + 1) { badNum.push(it.t); break; }
  });
  /* ★ 한 건 남아 있다 — 「기사 말고 직원 출퇴근은?」의 5.·5. 겹침.
     v260 에도 **그대로** 있던 것이고 이번 지시문 밖이라 고치지 않았다(절대규칙 6 → 보고문). */
  let badOld = [];
  qaOld.forEach((it) => {
    const ns = (it.a.match(/(?:^|\n)(\d+)\. /g) || []).map(x => Number(x.replace(/\D/g, '')));
    for (let i = 0; i < ns.length; i++) if (ns[i] !== i + 1) { badOld.push(it.t); break; }
  });
  ck('번호가 어긋난 문답 (새)', badNum.join(' / '), '기사 말고 직원 출퇴근은?');
  ck('   옛 판 (1234 문답도 함께 어긋나 있었다)', badOld.join(' / '),
     '기사 말고 직원 출퇴근은? / 1234 비밀번호로 안 들어가져요');
  ck('   이번에 한 건 줄었다', badOld.length - badNum.length, 1);
  ck('   대조 — 같은 검사로 어긋남을 잡는다',
    (function () { const ns = [1, 2, 2]; let bad = false;
      for (let i = 0; i < ns.length; i++) if (ns[i] !== i + 1) bad = true; return bad; })(), true);
}

/* ══ ⑦ 버전 ════════════════════════════════════════════════════════════════ */
console.log('\n⑦ 버전');
{
  const vj = JSON.parse(showR('version.json'));
  const av = Number((SRC_NEW.match(/const APP_VERSION = (\d+);/) || [])[1]);
  ck('APP_VERSION', av, 261);
  ck('version.json', vj.version, 261);
  ck('두 값이 같다', av === vj.version, true);
  ck('옛 판은 260', Number((SRC_OLD.match(/const APP_VERSION = (\d+);/) || [])[1]), 260);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
})();
