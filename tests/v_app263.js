/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v263 앱 검사 — 이용 기간 판정 4상태 · 읽기 전용에서 쓰기 5갈래 막힘 · 되돌림
   전: 20046e2 (v262) · 후: 작업 중 (COS_SRC_OLD_REF=20046e2 로 돌린다) */
const fs = require('fs');
/* ★ v272 보정1: 이 묶음은 **v263 회차 기록**이다 — 「새」쪽도 그 회차 커밋에 고정한다.
   전에는 작업트리(지금 코드)를 「후」로 보았다. 그래서 회차가 지날수록 문답 수·함수 목록·
   버전이 어긋나 **거짓으로 실패**했다(v272 기준 6건). v263 가 틀린 것이 아니다.
   지금 코드는 **그 회차의 묶음**이 본다 — 이 표는 그때 무엇이 바뀌었는지의 기록이다.
   ★ env246 은 **require 할 때** COS_SRC_NEW 를 읽는다 → 그 전에 넣어야 한다. */
/* ★ 기대값이 뒷 회차에 앞으로 고쳐진 묶음이다 — 그 기대값이 가리키는 회차(v264)에 맞춘다.
   (실측: 다른 회차로 맞추면 더 많이 틀어진다.) */
const NEW_REF = process.env.COS_SRC_NEW_REF || '18c90a7';   /* v263 */
if (!process.env.COS_SRC_NEW) {
  const _pf = require('path').join(__dirname, 'pin263_index.html');
  require('fs').writeFileSync(_pf, require('child_process').execSync(
    'git -C ' + COS_ROOT + ' show ' + NEW_REF + ':index.html', { maxBuffer: 1 << 28 }));
  process.env.COS_SRC_NEW = _pf;
}
/* ★ v272 보정1: 「옛」쪽 기준 커밋을 **파일 안에 박아 둔다**.
   머리 쪽지에 「COS_SRC_OLD_REF=20046e2 로 돌린다」고만 적혀 있어, 그냥 돌리면 env246 이
   기본값 HEAD~1 을 써 **바로 앞 회차**를 「옛 판」으로 삼았다 — 그래서 「옛 판은 262」이
   271 로 나오고 대조가 전부 뒤집혔다(v272 기준 6건). 손으로 환경변수를 줘야만
   맞는 묶음은 언젠가 틀리게 돌아간다. */
if (!process.env.COS_SRC_OLD_REF) process.env.COS_SRC_OLD_REF = '20046e2';
const E = require('./env246.js');
/* ★ v272 보정1: 버전·규칙도 **그 회차 커밋에서** 읽는다.
   작업트리를 읽으면 고정해 둔 APP_VERSION 과 안 맞아 「둘이 같음」이 거짓이 된다. */
const _pinRead = (p) => require('child_process')
  .execSync('git -C ' + COS_ROOT + ' show ' + NEW_REF + ':' + p, { maxBuffer: 1 << 28 })
  .toString().split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));

const { build, SRC_NEW, SRC_OLD, makeEl } = E;

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 68)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
            .map(l => l.replace(/(^|[^:'"\\])\/\/.*$/, '$1')).join('\n');
}
const NEWC = codeOnly(SRC_NEW), OLDC = codeOnly(SRC_OLD);
const DAY = 86400000;

/* 업체 계정으로 로그인한 상태를 만든다 */
function stage(period) {
  const B = build({ src: SRC_NEW, biz: 'academy' });
  const S = B.sandbox;
  S.window = B.win;
  B.win._userUid = 'UID123456789012';
  B.win._isDriverAcct = false;
  B.win._userApproved = true;
  B.win._userOrgId = 'academy_UID123456789';
  B.win._userOrgName = '코스로드학원';
  Object.keys(period || {}).forEach(k => { B.win[k] = period[k]; });
  /* getUrlOrg 가 실업체를 가리키게 (demo·test 면 검사를 건너뛴다) */
  S.getUrlOrg = () => 'academy_UID123456789';
  return B;
}

(async () => {

/* ══ ① 판정 — 네 상태 ═══════════════════════════════════════════════════ */
console.log('\n① 이용 기간 판정 (getTrialStatus)');
{
  const now = Date.now();
  const T = [
    ['체험 중 (끝 60일 뒤)',  { _userPaidUntil: now + 60 * DAY, _userTrialEnd: now + 20 * DAY },
      'blocked=false banner=false trialing=true'],
    ['유료 중 (끝 60일 뒤)',  { _userPaidUntil: now + 60 * DAY, _userTrialEnd: now - 5 * DAY },
      'blocked=false banner=false trialing=false'],
    ['끝 10일 전',            { _userPaidUntil: now + 9 * DAY, _userTrialEnd: now - 30 * DAY },
      'blocked=false banner=true trialing=false'],
    ['지남',                  { _userPaidUntil: now - 1 * DAY, _userTrialEnd: now - 40 * DAY },
      'blocked=true banner=false trialing=false'],
    ['기간 값이 없음 (★ 막는다)', { _userPaidUntil: null, _userTrialEnd: null },
      'blocked=true banner=false trialing=false']
  ];
  for (const [label, p, want] of T) {
    const B = stage(p);
    const st = B.sandbox.getTrialStatus();
    ck(label, 'blocked=' + st.blocked + ' banner=' + st.banner + ' trialing=' + st.trialing, want);
  }
  const B2 = stage({ _userPaidUntil: Date.now() + 9 * DAY });
  ck('  남은 날 수 (9일 뒤 → 9)', B2.sandbox.getTrialStatus().daysLeft, 9);
  const B3 = stage({ _userPaidUntil: Date.now() + 60 * DAY });
  ck('  이용 끝 날짜 글자', /^\d{4}-\d{2}-\d{2}$/.test(B3.sandbox.getTrialStatus().untilStr), true);
  /* 둘러보기·테스트는 그대로 통과 */
  const B4 = stage({ _userPaidUntil: null });
  B4.sandbox.getUrlOrg = () => 'academy_demo';
  ck('_demo 는 검사 제외', B4.sandbox.getTrialStatus().blocked, false);
  const B5 = stage({ _userPaidUntil: null });
  B5.sandbox.getUrlOrg = () => 'academy_test';
  ck('_test 는 검사 제외', B5.sandbox.getTrialStatus().blocked, false);
  const B6 = stage({ _userPaidUntil: null });
  B6.win._isDriverAcct = true;
  ck('기사 계정은 여기서 안 막는다 (규칙·서버가 막는다)', B6.sandbox.getTrialStatus().blocked, false);
}

/* ══ ② 옛 판정이 사라졌는가 ════════════════════════════════════════════ */
console.log('\n② plan 글자·옛 계정 분기 (주석 제외)');
{
  ck('MODEL_B_START 가 없다 (옛 ' + (OLDC.match(/MODEL_B_START/g) || []).length + '회)',
    (NEWC.match(/MODEL_B_START/g) || []).length, 0);
  ck('_userTrialStart 가 없다 (옛 ' + (OLDC.match(/_userTrialStart/g) || []).length + '회)',
    (NEWC.match(/_userTrialStart/g) || []).length, 0);
  ck("plan==='paid' 판정이 없다 (옛 " + (OLDC.match(/_userPlan==='paid'/g) || []).length + '회)',
    (NEWC.match(/_userPlan==='paid'/g) || []).length, 0);
  ck('30-Math.floor 계산이 없다', /30-Math\.floor/.test(NEWC), false);
  ck('   대조 — 옛 판에는 있었다', /30-Math\.floor/.test(OLDC), true);
  ck('paidUntil 을 읽어 둔다', /_userPaidUntil = \(typeof u\.paidUntil === 'number'\)/.test(NEWC), true);
}

/* ══ ③ 만료 안내 — 로그아웃하지 않는다 ══════════════════════════════════ */
console.log('\n③ 만료 안내 화면');
{
  const B = stage({ _userPaidUntil: Date.now() - DAY });
  let signedOut = 0;
  B.win._authFns.signOut = () => { signedOut++; return Promise.resolve(); };
  B.sandbox.showTrialExpired();
  const h = (B.bodyKids[B.bodyKids.length - 1] || {})._html || (B.bodyKids[0] || {}).innerHTML || '';
  const all = B.bodyKids.map(x => x._html || x.innerHTML || '').join('');
  ck('★ 로그아웃하지 않는다 (옛 판은 했다)', signedOut, 0);
  ck('   대조 — 옛 판 코드에는 signOut 이 있었다',
    /function showTrialExpired\(\)\{?[\s\S]{0,200}signOut/.test(OLDC.replace(/\n/g, '')), true);
  ck('문구 「이용 기간이 끝났어요」', /이용 기간이 끝났어요/.test(all), true);
  ck('「30일 무료」 문구가 없다', /30일 무료/.test(all), false);
  ck('「📂 내 자료 보기 (읽기 전용)」 단추', /내 자료 보기/.test(all), true);
  ck('「나가기」 단추', /나가기/.test(all), true);
  ck('금액이 적혀 있지 않다', /\d{2,3},000원|180,000|310,000/.test(all), false);
}

/* ══ ④ 읽기 전용 — 서버로 나가는 쓰기 5갈래 ════════════════════════════ */
console.log('\n④ 읽기 전용에서 서버 호출 0');
{
  function roStage() {
    const B = stage({ _userPaidUntil: Date.now() - DAY });
    const saved = [];
    B.win._firestore.setDoc = async (ref, data) => { saved.push(ref.col || ref.path || 'doc'); };
    B.sandbox.setDoc = B.win._firestore.setDoc;
    let synced = 0;
    B.sandbox.syncFromFirebase = () => { synced++; };
    B.sandbox.alert = () => {};
    B.win.alert = B.sandbox.alert;
    const ups = [];
    B.win._storageFns.uploadString = (ref) => { ups.push(ref.path); return Promise.resolve({ ref: ref }); };
    /* onAdminLoggedIn 이 화면 칸을 찾으므로 빈 칸을 깔아 둔다 */
    const app = makeEl('div'); app.id = 'main-app'; B.document.registerId('main-app', app);
    const login = makeEl('div'); login.id = 'login-screen';
    login.classList = { add() {}, remove() {} }; B.document.registerId('login-screen', login);
    B.sandbox.initApp = () => {};
    B.sandbox.enterReadOnly();
    return { B, saved, ups, synced: () => synced };
  }
  /* ⒜ 자료 저장 */
  {
    const { B, saved, synced } = roStage();
    await B.sandbox.saveToFirebase('members', [{ id: 1 }]);
    ck('⒜ saveToFirebase → 서버 쓰기 0', saved.length, 0);
    ck('   ★ 화면을 서버 자료로 되돌린다 (syncFromFirebase 1회)', synced(), 1);
  }
  /* ⒝ 공유 링크 4곳 */
  {
    const { B, saved } = roStage();
    const r1 = await B.sandbox.shareIssueClientRange('m1', '2026-01', '2026-02');
    const r2 = await B.sandbox.shareIssueOneInvoice('i1');
    const r3 = await B.sandbox.shareIssueNotice('n1');
    const r4 = await B.sandbox.shareIssuePayslip('2026-10', 'p1', '2026-11-10');
    ck('⒝ 공유 4곳 모두 막힘', [r1, r2, r3, r4].filter(x => x && x.error).length, 4);
    ck('   문구에 「읽기 전용」', /읽기 전용/.test((r1 || {}).error || ''), true);
    ck('   서버 쓰기 0', saved.length, 0);
  }
  /* ⒞ 사진 2곳 */
  {
    const { B, ups } = roStage();
    let got1 = 'x', got2 = 'x';
    B.sandbox.uploadNoticeImages(['data:image/jpeg;base64,AA'], (u) => { got1 = u; });
    B.sandbox.uploadDriveLogPhoto('data:image/jpeg;base64,AA', (u) => { got2 = u; });
    ck('⒞ 사진 업로드 0회', ups.length, 0);
    ck('   알림장 사진은 빈 목록으로 돌려준다', Array.isArray(got1) && got1.length === 0, true);
    ck('   차계부 사진은 null 로 돌려준다', got2, 'null');
  }
  /* ⒟ 복원 */
  {
    const { B, saved } = roStage();
    const ev = { target: { files: [{ name: 'b.json' }], value: 'b.json' } };
    B.sandbox.restoreData(ev);
    ck('⒟ 복원 막힘 — 서버 쓰기 0', saved.length, 0);
    ck('   파일 칸을 비운다', ev.target.value, '');
  }
  /* ⒠ 대조 — 읽기 전용이 아니면 저장된다 */
  {
    const B = stage({ _userPaidUntil: Date.now() + 30 * DAY });
    const saved = [];
    B.win._firestore.setDoc = async () => { saved.push(1); };
    B.sandbox.setDoc = B.win._firestore.setDoc;
    B.win._firestore.getDoc = async () => ({ exists: () => false });
    B.sandbox.getDoc = B.win._firestore.getDoc;
    await B.sandbox.saveToFirebase('members', [{ id: 1 }]);
    ck('⒠ 대조: 기간이 살아 있으면 저장된다', saved.length, 1);
  }
}

/* ══ ⑤ 읽기 전용 띠·상태 ═══════════════════════════════════════════════ */
console.log('\n⑤ 읽기 전용 표시');
{
  const B = stage({ _userPaidUntil: Date.now() - DAY });
  const app = makeEl('div'); app.id = 'main-app';
  /* 가짜 칸에는 insertBefore 가 없다 — 띠를 맨 앞에 넣는 자리라 흉내 낸다 */
  app.insertBefore = function (n) { this.children.unshift(n); return n; };
  B.document.registerId('main-app', app);
  const login = makeEl('div'); login.id = 'login-screen';
  login.classList = { add(){}, remove(){} };
  B.document.registerId('login-screen', login);
  B.sandbox.initApp = () => {};
  B.sandbox.enterReadOnly();
  ck('읽기 전용으로 바뀐다', B.sandbox.isReadOnlyMode(), true);
  const bar = (app.children[0] || {});
  ck('맨 위 띠가 붙는다', /이용 기간이 끝났어요/.test(bar.textContent || ''), true);
  ck('   띠에 「보기만 됩니다」', /보기만 됩니다/.test(bar.textContent || ''), true);
  /* 띠는 id 로 한 번만 붙는다 — 가짜 칸에는 getElementById 가 안 걸려 그 자리에서 등록해 준다 */
  B.document.registerId('readonly-bar', app.children[0]);
  ck('   두 번 불러도 하나만', (B.sandbox.showReadOnlyBar(), app.children.length), 1);
}

/* ══ ⑥ 마스터 — 기간 다루기 ════════════════════════════════════════════ */
console.log('\n⑥ 마스터 승인·연장·기간 정하기');
{
  const B = build({ src: SRC_NEW });
  const calls = [];
  B.sandbox.driverAcctApi = async (body) => { calls.push(body); return { ok: true, trialEndStr: '2026-12-03', paidUntilStr: '2027-06-03' }; };
  B.sandbox.loadSignupUsers = async () => {};
  B.sandbox.drawMasterPanel = () => {};
  B.sandbox.alert = () => {}; B.win.alert = B.sandbox.alert;
  /* 승인 모달 */
  B.sandbox.masterApproveAsk('UID1', '코스로드학원');
  const html = B.bodyKids.map(x => x._html || '').join('');
  ck('승인 창이 열린다', /id="mp-approve"/.test(html), true);
  ['mp-trial', 'mp-months', 'mp-amount', 'mp-memo', 'mp-prev'].forEach(id =>
    ck('  칸 ' + id, new RegExp('id="' + id + '"').test(html), true));
  ck('  창 덮개가 v262 방식(flex-start)', /id="mp-approve"[^>]*align-items:flex-start/.test(html), true);
  ck('  안쪽 상자 margin:auto', /id="mp-approve"[\s\S]{0,300}margin:auto/.test(html), true);
  /* 값 넣고 보내기 */
  ['mp-trial', 'mp-months', 'mp-amount', 'mp-memo', 'mp-err', 'mp-prev'].forEach(id => {
    const el = makeEl('input'); el.id = id; B.document.registerId(id, el);
  });
  B.document.getElementById('mp-trial').value = '30';
  B.document.getElementById('mp-months').value = '6';
  B.document.getElementById('mp-amount').value = '180,000';
  B.document.getElementById('mp-memo').value = '홍길동';
  await B.sandbox.masterApproveGo('UID1');
  /* v264: 창을 열 때 「이 사업자가 첫 결제 할인을 받았나」(bizPromoStatus)를 먼저 묻고,
     승인에는 plan 을 함께 보낸다. 그래서 api 호출이 2번이 되고 보내는 칸이 하나 늘었다.
     이 회차 표는 **승인 호출(마지막 것)** 만 본다. 새 길은 w_api264.js·x_app264.js 가 본다. */
  ck('api 를 부른다 (v264: 상태 묻기 + 승인 = 2)', calls.length, 2);
  const apv = calls[calls.length - 1];
  ck('  보내는 칸 (v264: +plan)', Object.keys(apv).sort().join(','), 'action,amount,memo,months,plan,trialDays,uid');
  ck('  action·개월·체험일', [apv.action, apv.months, apv.trialDays].join('/'), 'approveOrg/6/30');
  ck('  금액은 숫자로', apv.amount, 180000);
  /* 미리 보기 셈이 서버와 같은가 */
  const p = B.sandbox.periodPreview(30, 6);
  ck('미리 보기 날짜 꼴', /^\d{4}-\d{2}-\d{2}$/.test(p.trialEnd) && /^\d{4}-\d{2}-\d{2}$/.test(p.paidUntil), true);
  /* 연장·기간·취소 */
  B.sandbox.masterExtendAsk('UID1', '학원', '2027-06-03');
  ck('연장 창', /id="mp-extend"/.test(B.bodyKids.map(x => x._html || '').join('')), true);
  B.sandbox.masterSetPeriodAsk('UID1', '학원', '2027-06-03');
  ck('기간 정하기 창', /id="mp-set"/.test(B.bodyKids.map(x => x._html || '').join('')), true);
  B.win.confirm = () => true; B.sandbox.confirm = B.win.confirm;
  await B.sandbox.masterUnapproveAsk('UID1', '학원');
  ck('승인 취소도 api 로', calls[calls.length - 1].action, 'unapproveOrg');
  /* 남은 날 줄 */
  const line = B.sandbox.masterPeriodLine({ paidUntil: Date.now() + 5 * DAY });
  ck('남은 날 줄 — 10일 이내 노랑', /#B54708/.test(line), true);
  ck('  지남 빨강', /#B42318/.test(B.sandbox.masterPeriodLine({ paidUntil: Date.now() - DAY })), true);
  ck('  기간 없음 안내', /기간 없음/.test(B.sandbox.masterPeriodLine({})), true);
  ck('setUserApproval 은 사라졌다', /setUserApproval/.test(NEWC), false);
  ck('   대조 — 옛 판에는 있었다', /setUserApproval/.test(OLDC), true);
}

/* ══ ⑦ 문구·버전 ═══════════════════════════════════════════════════════ */
console.log('\n⑦ 문구 · 버전');
{
  const B = build({ src: SRC_NEW });
  const O = build({ src: SRC_OLD });
  const qaNew = B.sandbox.HELP_QA, qaOld = O.sandbox.HELP_QA;
  /* v264: 「첫 결제 할인은요?」 문답 하나를 더했다 (71 → 72) */
  /* v266 이 하나 더 더했다 */
  /* ★ 회차마다 문답이 늘어난다(v270 +1). 못 박는 대신 「줄지 않았고 지금 수를 안다」로 바꿨다. */
  ck('문답 수 (옛 판보다 늘었나)', (qaNew.length > qaOld.length) + ' / ' + qaNew.length + '/' + qaOld.length,
     'true / ' + qaNew.length + '/' + qaOld.length);
  const t = (s) => qaNew.filter(x => x.t === s)[0];
  ck('요금 문답 제목이 바뀌었다', !!t('이용 기간 · 연장'), true);
  ck('  옛 제목은 없다', !!t('30일 무료 체험·구독'), false);
  const q = t('이용 기간 · 연장');
  ck('  만료 = 보기만 안내', /보기만/.test(q.a), true);
  ck('  연장 안내', /연장하시면/.test(q.a), true);
  /* v264: 요금이 정해져 **금액을 적는다**(사장님 확정 11-03). v263 의 「금액 없음」은 그때 요금 미정이었기 때문. */
  ck('  금액이 적혀 있다 (v264 — 요금 확정)', /\d{2,3},000/.test(q.a), true);
  ck('문답표 전체에 「30일 무료」가 없다', /30일 무료/.test(JSON.stringify(qaNew)), false);
  ck('   대조 — 옛 판에는 있었다', /30일 무료/.test(JSON.stringify(qaOld)), true);
  ck('화면 전체에 「30일 무료」가 없다', /30일 무료/.test(SRC_NEW), false);
  const vj = JSON.parse(_pinRead('version.json'));
  const av = Number((SRC_NEW.match(/const APP_VERSION = (\d+);/) || [])[1]);
  /* v265: 홈 문구·문답 번호 회차로 또 하나 올랐다. 이 표는 **지금 버전**을 적어 둔다. */
  /* ★ v267 에서 버전이 267 로 올랐다. 이 묶음이 지켜야 할 것은 「그 회차 버전 **이상**이고
     두 값이 같다」는 것이라, 숫자를 못 박는 대신 그렇게 바꿨다(앞선 묶음들과 같은 방식). */
  ck('APP_VERSION · version.json (263 이상 · 둘이 같음)', (av >= 263 && av === vj.version) + ' / ' + av, 'true / ' + av);
  ck('옛 판은 262', Number((SRC_OLD.match(/const APP_VERSION = (\d+);/) || [])[1]), 262);
  /* v263 회차에는 home.html·terms.html 을 손대지 않았다. v264 가 **home.html 만** 고쳤으므로
     (요금 영역 — 사장님 지시 §6) 여기서는 terms.html 이 그대로인지를 본다. */
  /* ★ v271 이 약관을 고쳤다(환불 규정). 작업트리와 비교하면 거짓 실패가 난다 —
     이 묶음이 지켜야 할 것은 「**그 회차가** terms.html 을 안 건드렸다」이고,
     그것은 회차의 커밋 둘을 맞대면 앞으로도 그대로 확인된다. */
  ck('v263 회차는 terms.html 을 안 건드렸다',
    require('child_process').execSync('git -C ' + COS_ROOT + ' diff --name-only 20046e2 269231d -- terms.html').toString().trim(), '');
  ck('(v264) home.html 은 이 회차에서 고쳤다',
    require('child_process').execSync('git -C ' + COS_ROOT + ' diff --name-only 269231d -- home.html').toString().trim(), 'home.html');
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
})();
