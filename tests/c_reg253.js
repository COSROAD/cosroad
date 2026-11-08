/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ⑤ v253 회귀 — v252(edd2752) 와 **바뀐 곳 외**가 바이트 동일한가
   ※ c_reg252.js 는 v252 회차의 기록이라 그대로 두고(그 회차 기대값이 박혀 있다),
     이 회차용으로 따로 둔다. 화면·값 함수 비교 방식은 같다. */
const cp = require('child_process');
const fs = require('fs');
/* ★ v272 보정1: 이 묶음은 **v253 회차 기록**이다 — 「새」쪽도 그 회차 커밋에 고정한다.
   전에는 작업트리(지금 코드)를 「후」로 보았다. 그래서 회차가 지날수록 문답 수·함수 목록·
   버전이 어긋나 **거짓으로 실패**했다(v272 기준 1건). v253 가 틀린 것이 아니다.
   지금 코드는 **그 회차의 묶음**이 본다 — 이 표는 그때 무엇이 바뀌었는지의 기록이다.
   ★ env246 은 **require 할 때** COS_SRC_NEW 를 읽는다 → 그 전에 넣어야 한다. */
/* ★ 기대값이 뒷 회차에 앞으로 고쳐진 묶음이다 — 그 기대값이 가리키는 회차(v253 보정4)에 맞춘다.
   (실측: 다른 회차로 맞추면 더 많이 틀어진다.) */
const NEW_REF = process.env.COS_SRC_NEW_REF || '23202fc';   /* v253 */
if (!process.env.COS_SRC_NEW) {
  const _pf = require('path').join(__dirname, 'pin253_index.html');
  require('fs').writeFileSync(_pf, require('child_process').execSync(
    'git -C ' + COS_ROOT + ' show ' + NEW_REF + ':index.html', { maxBuffer: 1 << 28 }));
  process.env.COS_SRC_NEW = _pf;
}
const E = require('./env246.js');
/* ★ v272 보정1: 버전·규칙도 **그 회차 커밋에서** 읽는다.
   작업트리를 읽으면 고정해 둔 APP_VERSION 과 안 맞아 「둘이 같음」이 거짓이 된다. */
const _pinRead = (p) => require('child_process')
  .execSync('git -C ' + COS_ROOT + ' show ' + NEW_REF + ':' + p, { maxBuffer: 1 << 28 })
  .toString().split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));


let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + label.padEnd(52) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const BASE = process.env.COS_SRC_OLD_REF || 'edd2752';
const OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':index.html', { maxBuffer: 1 << 28 }).toString();
const NEW = E.SRC_NEW;
/* ※ v255 주기: 이 뭉음은 **그 회차의 기록**이다. v255 가 기사 로그인을 일원화하면서
     리스너 키·함수 목록·문답표·버전·바뀐 파일은 **일부러** 달라졌다. 그래서 그 자리들은
     「그대로인가」를 못 박지 않고 사실만 적고(아래 console.log), 이 회차가 지키려던
     **값 함수·화면 바이트 동일**만 그대로 본다. 이번 회차 누적 표는 c_reg255.js 다. */

/* Storage 래퍼가 키에 '__<orgId>' 를 붙인다 — 접미사 없이 넣으면 빈 자료로 헛돈다 */
const SUF = '__cosroad_default';
const raw = {
  tkd_members: JSON.stringify([
    { id: 1, name: '김아이', phone: '010-1111-2222', location: '인천 연수구 용담로 111', detail: '101동 202호',
      lat: 37.4, lng: 126.7, course: 'A', on: true, offOn: true, fee: 150000 },
    { id: 2, name: '이아이', phone: '010-3333-4444', location: '인천 연수구 송도동 1', lat: 37.39, lng: 126.65,
      course: 'A', on: false, offOn: true, fee: 150000 }
  ]),
  tkd_cars: JSON.stringify([{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-5555-6666', cap: 15 }]),
  tkd_courses: JSON.stringify([{ name: 'A', carId: 'car1' }]),
  tkd_org: JSON.stringify({ name: '코스로드학원', lat: 37.41, lng: 126.68, addr: '인천 연수구 용담로 111' }),
  tkd_payments: JSON.stringify({ '2026-10': { 1: { paid: 150000, date: '2026-10-05' } } }),
  tkd_attendance: JSON.stringify({ '2026-10-26': { 1: 'o', 2: 'x' } }),
  tkd_notices: JSON.stringify([{ date: '2026-10-26', content: '오늘은 비가 옵니다', images: [] }]),
  tkd_staff: JSON.stringify([{ id: 's1', name: '박기사', role: '운전', pay: 2500000 }]),
  tkd_attendance_time: JSON.stringify({ '2026-10-26': { s1: { in: '08:00', out: '18:00' } } }),
  tkd_products: JSON.stringify([{ code: 'P1', name: '박스', price: 1000 }]),
  tkd_invoices: JSON.stringify([]),
  tkd_ridestate: JSON.stringify({ '1': { on: true, offOn: true }, '2': { on: false, offOn: true } })
};
const store = {};
Object.keys(raw).forEach(k => { store[k + SUF] = raw[k]; });
const run = (src, biz) => {
  const R = E.build({ src: src, biz: biz, localStorage: Object.assign({}, store) });
  if (R.error) throw R.error;
  return R;
};

console.log('════ 0. 비교 전 — 샘플 자료가 실제로 읽히나 ════');
{
  const B = run(NEW, 'academy');
  ck('members 2명', B.ev('loadMembers().length'), 2);
  ck('cars 1대', B.ev('loadCars().length'), 1);
  ck('rideState 덮어쓰기 (2번 on=false)', B.ev('loadMembers()[1].on'), false);
}

console.log('\n════ 1. 화면 HTML 바이트 비교 (업종 4 × 화면 9) ════');
{
  let same = 0, diff = 0;
  ['academy', 'public', 'logistics', 'delivery'].forEach(biz => {
    const A = run(OLD, biz), B = run(NEW, biz);
    ['renderDashboard', 'renderAdminMembers', 'renderNotice', 'renderExcel', 'renderSchedule',
     'renderSettings', 'renderGuide', 'renderShop', 'renderPrintHtml'].forEach(fn => {
      const call = (R) => {
        if (typeof R.sandbox[fn] !== 'function') return 'NOFN';
        try { return String(R.sandbox[fn]()); } catch (e) { return 'ERR:' + e.message; }
      };
      const a = call(A), b = call(B);
      /* v256 보정3: 설정 화면의 회색 글자 한 곳(--gray-300 → --gray-400)만 달라진다 — 그 색은 빼고 견준다 */
      if (a === b || a.split('var(--gray-300)').join('var(--gray-400)') === b) same++;
      else {
        diff++;
        console.log('  ✘ ' + biz + ' / ' + fn + ' 길이 ' + a.length + ' → ' + b.length);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
          if (a[i] !== b[i]) { console.log('      첫 차이 ' + i + ': …' + a.slice(i - 40, i + 60) + '  ≠  …' + b.slice(i - 40, i + 60)); break; }
        }
      }
    });
  });
  ck('바이트 다른 칸', diff, 0);
  console.log('      ' + same + '칸 비교 (모두 같음)');
}

console.log('\n════ 2. 값을 돌려주는 함수 — 반환값 바이트 동일 ════');
{
  const A = run(OLD, 'academy'), B = run(NEW, 'academy');
  [['phoneDigits(82)', "phoneDigits('+82 10-1111-2222')"],
   ['phoneLoginId', "phoneLoginId('010-1111-2222')"],
   ['looksLikePhoneId(번호)', "looksLikePhoneId('010-1111-2222')"],
   ['looksLikePhoneId(메일)', "looksLikePhoneId('a@b.com')"],
   ['fullLoc', 'fullLoc(members[0])'],
   ['loadRideState', 'JSON.stringify(loadRideState())'],
   ['applyRideState', 'JSON.stringify((members||[]).map(function(m){return [m.id,m.on,m.offOn];}))'],
   ['escapeMasterHtml', 'escapeMasterHtml(String.fromCharCode(60)+"a b"+String.fromCharCode(34)+"c"+String.fromCharCode(39))'],
   ['escapeNoticeHtml', 'escapeNoticeHtml("x"+String.fromCharCode(38)+"y")'],
   ['jsArg', 'jsArg("a"+String.fromCharCode(34)+"b")'],
   ['buildPayslipData 키', 'Object.keys(buildPayslipData("2026-10","s1","2026-11-10")||{}).sort().join(",")'],
   ['SHARE_DAYS', 'SHARE_DAYS'], ['PAYSLIP_SHARE_DAYS', 'PAYSLIP_SHARE_DAYS'],
   ['SIGNUP_EXPIRE_DAYS', 'SIGNUP_EXPIRE_DAYS'],
   ['getFbOrgId', 'String(getFbOrgId())'],
   ['orgIdFromUrlOrDefault', 'String(orgIdFromUrlOrDefault())'],
   ['keepLoginKey', 'String(keepLoginKey())'],
   ['isDemoMode', 'String(isDemoMode())'],
   ['isAccountApproved', 'String(isAccountApproved())'],
   /* v263: 이용 기간 판정이 바뀌어 돌려주는 칸이 늘었다(trialing·untilStr·trialEndStr).
      이 표의 뜻은 「보정3 이 이 값을 안 건드렸나」이므로 **공통 칸 셋**만 견준다. */
   ['getTrialStatus(공통 칸)', '(function(){var s=getTrialStatus();return JSON.stringify([s.blocked,s.banner,s.daysLeft]);})()'],
   /* v255: 리스너에 driverPay 가 늘고 기사 모드 걸러내기가 붙었다 → 목록은 c_reg255 에서 본다 */
  ].forEach(([name, ex]) => {
    let a, b;
    try { a = String(A.ev(ex)); } catch (e) { a = 'ERR:' + e.message; }
    try { b = String(B.ev(ex)); } catch (e) { b = 'ERR:' + e.message; }
    ck(name, b, a);
  });
}

console.log('\n════ 3. 함수 목록 — 새로 생긴 것만 늘었나 ════');
{
  const A = run(OLD, 'academy'), B = run(NEW, 'academy');
  const fnsOf = (R) => Object.keys(R.sandbox).filter(k => typeof R.sandbox[k] === 'function').sort();
  const a = fnsOf(A), b = fnsOf(B);
  const added = b.filter(x => a.indexOf(x) < 0).sort();
  const gone  = a.filter(x => b.indexOf(x) < 0);
  const V255_GONE = ['driverAcctCreate','driverAcctHtml','driverAcctLoad','driverAcctOf',
                     'driverAcctRefresh','driverAcctRemoveAsk','driverAcctResetAsk'];
  /* v260: 개통 대장 죽은 함수 다섯(addMasterCompany·copyMasterUrl·deleteMasterCompany
     ·loadMasterCompanies·saveMasterCompanies)을 지웠다 — 부르는 곳 0 을 먼저 확인했다.
     이번 회차 표는 q_app260.js. 그 다섯은 아래 목록에서 뺀 뒤 견준다. */
  const V260_GONE = ['addMasterCompany', 'copyMasterUrl', 'deleteMasterCompany', 'loadMasterCompanies', 'saveMasterCompanies'];
  /* v261(코스로드27 가입 개편): 가입을 서버(api/signup.js)로 옮기면서
     화면의 옛 가입 함수 열 개를 지웠다 — 부르는 곳 0 을 먼저 확인했다.
     이번 회차 표는 t_app261.js. 그 열 개는 아래 목록에서 뺀 뒤 견준다. */
  const V261_GONE = ['suCreateAccount','suSaveUserDoc','doSignupEmail','doSignupPhone',
                     'suSetMethod','suSyncContact','suCheckCommon',
                     'notifyMasterSignup','notifyApplicantAccount','sendSignupSms'];
  const V263_GONE = ['setUserApproval'];   /* v263: 승인을 서버로 옮기며 지움 */
  ck('없어진 함수는 v255·v260·v261·v263 이 지운 것뿐',
    gone.filter(x => V255_GONE.indexOf(x) < 0 && V260_GONE.indexOf(x) < 0 && V261_GONE.indexOf(x) < 0
                  && V263_GONE.indexOf(x) < 0)
        .join(',') || '없음', '없음');
  console.log('      없어진 함수: ' + (gone.join(',') || '없음'));
  console.log('      새 함수: ' + added.join(','));
  /* v255 가 함수를 더 늘렸으니 목록을 못 박지 않고, **이 회차의 13개가 모두 있는지**만 본다 */
  ck('v253 의 새 함수 13개가 모두 있다',
    ['isTestOrgUrl', 'testOrgBlockedIfNotMaster', 'showTestOrgBlocked',
     'masterLogout', 'masterLogoutGo', 'deleteInquiry',
     /* v253 보정2 */ 'masterTestAccessAsk', 'masterTestAccessGo',
     /* v253 보정3 */ 'masterLoginId', 'masterJoinDate', 'masterUidTail',
     'masterDupName', 'masterIdLine'].every(f => added.indexOf(f) >= 0), true);
  ck('v252 의 pwr*·mcp* 는 그대로 있나',
    ['openPwResetSheet', 'pwrSendCode', 'pwrDoReset', 'pwrMailPath', 'masterChangePhoneAsk',
     'mcpSendCode', 'mcpDoChange', 'mcpApi'].every(f => b.indexOf(f) >= 0), true);
  ck('logout·sendPwReset 도 그대로', b.indexOf('logout') >= 0 && b.indexOf('sendPwReset') >= 0, true);
}

console.log('\n════ 4. 문답표 — 변경 없음 (지시문 ■6) ════');
{
  const qa = require('./qa252.js');
  const a = qa.read(OLD), b = qa.read(NEW);
  console.log('      문답 수: ' + a.length + ' → ' + b.length + ' (v255 기사 로그인 문답)');
  ck('문답이 줄지 않았다', b.length >= a.length, true);
  ck('_test 를 안내하는 문답 0개',
    b.filter(q => /_test|테스트 공간|테스트 기관/.test(q.t + q.a + q.keys.join(','))).length, 0);
}

console.log('\n════ 5. 버전·파일 ════');
{
  console.log('      지금 버전: ' + JSON.parse(_pinRead('version.json')).version
    + ' (이 회차는 253 이었다)');
  ck('둘이 같은가', JSON.parse(_pinRead('version.json')).version
     === Number(/const APP_VERSION = (\d+);/.exec(NEW)[1]), true);
  const stat = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + BASE).toString().trim().split('\n');
  console.log('      바뀐 파일:');
  stat.forEach(l => { const p = l.split('\t'); console.log('        ' + p[2].padEnd(22) + '+' + p[0] + ' / −' + p[1]); });
  console.log('      바뀐 파일 수: ' + stat.length + ' (이 회차는 5었다 — v255 가 더 바꿨다)');
  /* v256 보정3 이 s.html 에 한국어 줄바꿈 두 줄을 넣었다 (사장님 원칙) →
     이 회차가 **자신은** 안 건드렸는지로 본다 */
  ck('이 회차는 s.html 을 안 건드렸다',
    cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + BASE + ' 05a0f30').toString()
      .split(String.fromCharCode(10)).every(n => n.indexOf('s.html') < 0), true);
  /* v255 는 admin-account.js 를 **일부러** 바꾼다(기사 로그인 7동작) → 이 회차 기준은 뻐다 */
  ck('package.json 은 안 건드렸나', stat.every(l => l.indexOf('package.json') < 0), true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
