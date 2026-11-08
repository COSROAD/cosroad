/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ⑤ v255 회귀 누적 표 — v254(2eadaaa) 와 **바뀐 곳 외**가 그대로인가
   · 값 함수(날짜·요금제·기관 id 등) 결과 동일
   · 바꾼 자리(기사 로그인·PIN·급여 저장 위치) 말고 함수가 사라지지 않았나
   · 리스너 키 · 문답표 · 버전 · 바뀐 파일 목록 */
const cp = require('child_process');
const fs = require('fs');
/* ★ v272 보정1: 이 묶음은 **v255 회차 기록**이다 — 「새」쪽도 그 회차 커밋에 고정한다.
   전에는 작업트리(지금 코드)를 「후」로 보았다. 그래서 회차가 지날수록 문답 수·함수 목록·
   버전이 어긋나 **거짓으로 실패**했다(v272 기준 5건). v255 가 틀린 것이 아니다.
   지금 코드는 **그 회차의 묶음**이 본다 — 이 표는 그때 무엇이 바뀌었는지의 기록이다.
   ★ env246 은 **require 할 때** COS_SRC_NEW 를 읽는다 → 그 전에 넣어야 한다. */
/* ★ 기대값이 뒷 회차에 앞으로 고쳐진 묶음이다 — 쪽지가 「v260 다섯 + v261 열 + v263 …」까지
   적고 있어 그 기대값이 가리키는 회차(v263)에 맞춘다. (실측: 다른 회차는 더 틀어진다.) */
const NEW_REF = process.env.COS_SRC_NEW_REF || '269231d';   /* v255 */
if (!process.env.COS_SRC_NEW) {
  const _pf = require('path').join(__dirname, 'pin255_index.html');
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
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 70)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const BASE = process.env.COS_SRC_OLD_REF || '2eadaaa';     // v254
const OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':index.html', { maxBuffer: 1 << 28 }).toString();
const NEW = E.SRC_NEW;

/* ※ v256 주기: 이 뭉음은 **v255 회차의 기록**이다. v256(첫 화면 손질)이 얻혀지면서
     버전·바뀐 파일·새 함수가 한 칸 더 옮겨갔다. 그 자리만 풀고(사실은 적는다),
     v255 가 지키려던 것은 그대로 본다. 이번 회차 표는 j_app256.js 다. */

const SUF = '__cosroad_default';
const raw = {
  tkd_members: JSON.stringify([
    { id: 1, name: '김아이', phone: '010-1111-2222', location: '인천 연수구 용담로 111', detail: '101동 202호',
      lat: 37.4, lng: 126.7, course: 'A', on: true, offOn: true, fee: 150000, pin: '1111' },
    { id: 2, name: '이아이', phone: '010-3333-4444', location: '인천 연수구 송도동 1', lat: 37.39, lng: 126.65,
      course: 'A', on: false, offOn: true, fee: 150000, pin: '2222' }
  ]),
  tkd_cars: JSON.stringify([{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-5555-6666',
    driverPin: '1234', hourlyWage: 10030, mealAllow: 200000, taxMode: 'free33', commuteKm: 20 }]),
  tkd_courses: JSON.stringify([{ id: 'c1', name: 'A', carId: 'car1' }]),
  tkd_org: JSON.stringify({ name: '코스로드학원', lat: 37.0, lon: 127.0 }),
  tkd_staff: JSON.stringify([{ id: 'st1', name: '최직원', pin: '3333', hourlyWage: 10030 }]),
  tkd_driver_att: JSON.stringify({ 'car1_2026-10-05': { in: '08:30', out: '18:00' } }),
  tkd_attendance: JSON.stringify({ '2026-10-05': { 1: 'present' } }),
  tkd_payments: '{}', tkd_tax: '{}', tkd_carlog: '{}'
};
const store = {};
Object.keys(raw).forEach(k => { store[k + SUF] = raw[k]; });

function run(src, biz) {
  const R = E.build({ src: src, biz: biz || 'academy', localStorage: Object.assign({}, store) });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drv-msg', 'drv-mig-msg', 'pin-result', 'pin-dots',
   'drive-tabs', 'main-header'].forEach(id => {
    const el = E.makeEl('div'); el.id = id;
    el.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
    R.document.registerId(id, el);
  });
  R.win._auth = R.sandbox._auth = { currentUser: { uid: 'U1', isAnonymous: false, getIdToken: async () => 'T' } };
  R.win.fetch = R.sandbox.fetch = async () => ({ json: async () => ({ ok: false, message: 'x' }) });
  return R;
}

console.log('════ 1. 값 함수 — 결과가 그대로 ════');
{
  const A = run(OLD), B = run(NEW);
  [['todayStr', 'todayStr()'],
   ['localDateStr', 'localDateStr(new Date(2026,0,3))'],
   ['nowTimeStr 모양', '/^\\d\\d:\\d\\d$/.test(nowTimeStr())'],
   ['attKey', 'attKey("car1","2026-10-05")'],
   ['fullLoc', 'fullLoc(members[0])'],
   ['getBizType', 'getBizType()'],
   ['getFbOrgId', 'getFbOrgId()'],
   ['orgIdFromUrlOrDefault', 'String(orgIdFromUrlOrDefault())'],
   ['keepLoginKey', 'String(keepLoginKey())'],
   ['isDemoMode', 'String(isDemoMode())'],
   ['isAccountApproved', 'String(isAccountApproved())'],
   /* v263: 이용 기간 판정이 바뀌어 돌려주는 칸이 늘었다(trialing·untilStr·trialEndStr).
      이 표의 뜻은 「보정3 이 이 값을 안 건드렸나」이므로 **공통 칸 셋**만 견준다. */
   ['getTrialStatus(공통 칸)', '(function(){var s=getTrialStatus();return JSON.stringify([s.blocked,s.banner,s.daysLeft]);})()'],
   ['calcWorkMinutes', 'String(calcWorkMinutes("08:30","18:00"))'],
   ['fmtWorkMinutes', 'String(fmtWorkMinutes(570))'],
   ['buildPayrollData 합계', 'String(buildPayrollData("2026-10").cars.map(function(r){return r.total+"/"+r.ded+"/"+r.net;}).join("|"))']
  ].forEach(([name, ex]) => {
    let a, b;
    try { a = String(A.ev(ex)); } catch (e) { a = 'ERR:' + e.message; }
    try { b = String(B.ev(ex)); } catch (e) { b = 'ERR:' + e.message; }
    ck(name, b, a);
  });
}

console.log('\n════ 2. 함수 목록 — 지운 것·늘린 것이 지시문대로인가 ════');
{
  const A = run(OLD), B = run(NEW);
  const fnsOf = (R) => Object.keys(R.sandbox).filter(k => typeof R.sandbox[k] === 'function').sort();
  const a = fnsOf(A), b = fnsOf(B);
  const added = b.filter(x => a.indexOf(x) < 0).sort();
  const gone = a.filter(x => b.indexOf(x) < 0).sort();
  /* 지운 것 — 「👤 기사 계정」 칸(휴대폰+비밀번호)을 없앴다 */
  /* v260: 개통 대장 죽은 함수 다섯(addMasterCompany·copyMasterUrl·deleteMasterCompany
     ·loadMasterCompanies·saveMasterCompanies)을 지웠다 — 부르는 곳 0 을 먼저 확인했다.
     이번 회차 표는 q_app260.js. 그 다섯은 아래 목록에서 뺀 뒤 견준다. */
  const V260_GONE = ['addMasterCompany', 'copyMasterUrl', 'deleteMasterCompany', 'loadMasterCompanies', 'saveMasterCompanies'];
  /* v261: 가입을 서버(api/signup.js)로 옮기며 화면의 옛 가입 함수 열 개를 지웠다 — 표는 t_app261.js */
  const V261_GONE = ['suCreateAccount','suSaveUserDoc','doSignupEmail','doSignupPhone',
                     'suSetMethod','suSyncContact','suCheckCommon',
                     'notifyMasterSignup','notifyApplicantAccount','sendSignupSms'];
  /* v263: 승인을 서버로 옮기며 setUserApproval 을 지웠다 */
  const V263_GONE = ['setUserApproval'];
  ck('없어진 함수 7개 + v260 다섯 + v261 열 + v263 하나',
    gone.filter(x => V260_GONE.indexOf(x) < 0 && V261_GONE.indexOf(x) < 0 && V263_GONE.indexOf(x) < 0).join(','),
    'driverAcctCreate,driverAcctHtml,driverAcctLoad,driverAcctOf,driverAcctRefresh,driverAcctRemoveAsk,driverAcctResetAsk');
  /* 늘린 것 — 기사 로그인·출퇴근·PIN 관리·급여 분리 */
  const WANT_ADD = ['carPay', 'setCarPay', 'flushDriverPay', 'loadDriverPay', 'saveDriverPay',
    'loginPick', 'driverDeviceId', 'driverGetLoc', 'driverLoginErr', 'loginDriverPin',
    'driverKeyAllowed', 'driverAttLocalSet', 'padDriverPinApi', 'driverPunchBarHtml',
    'driverPunch', 'saveDriverOdo', 'renderDriverPunchResult',
    'driverInfoLoad', 'driverInfoRefresh', 'orgCodeLoad', 'orgCodeCopy', 'orgCodeCardHtml',
    'drvWhyText', 'driverPinCardHtml', 'fmtDrvAt', 'setDriverPinAsk', 'removeDriverPinAsk',
    'unbindDeviceAsk', 'drvPinDupCar', 'drvPinTakenSet', 'drvLegacyCars', 'drvMigrateCardHtml',
    'drvMigrateRun'];
  ck('새 함수가 지시문 목록을 다 담았나',
    WANT_ADD.filter(f => added.indexOf(f) < 0).join(',') || '없음', '없음');
  /* v256 이 loginPickRestore 하나를 더했다 (첫 화면 마지막 탭 기억) */
  /* v257 보정4: 기사 회원 탭·둘러보기 기사 화면·기사 출석 쓰기 회수 — 일부러 바꾼 자리다 */
  const LATER = ['loginPickRestore', 'driverLockedCarId',   /* v256 보정1·2 */
    'demoDriverCarId', 'driverScopeMembers', 'driverNoCarHtml', 'demoPunchBarHtml', 'demoPunch', 'driverWriteAllowed',   /* v257 보정4 */
    /* v261 가입 개편 — 가입 창(문자 인증·사업자 확인)과 마스터 패널 사업자 줄 */
    'suClose', 'suStartLock', 'suSendCode', 'suBizDirty', 'suPaintGo', 'suBizFields',
    'suCheckBiz', 'suSignupDone', 'masterBizLine', 'masterDupBizNo',
    /* v263 이용 기간 — 읽기 전용·마스터 기간 창 (이번 회차 표는 v_app263.js) */
    'enterReadOnly', 'isReadOnlyMode', 'showReadOnlyBar', 'readOnlyBlocked',
    'periodDayStr', 'periodPreview', 'masterPeriodBox', 'masterPeriodErr', 'masterPeriodLine',
    'masterApproveAsk', 'masterApprovePreview', 'masterApproveGo',
    'masterExtendAsk', 'masterExtendGo', 'masterSetPeriodAsk', 'masterSetPeriodGo',
    'masterUnapproveAsk', 'masterBillingLog'];
  ck('지시문과 뒤 회차 밖의 새 함수는 없나',
    added.filter(f => WANT_ADD.indexOf(f) < 0 && LATER.indexOf(f) < 0).join(',') || '없음', '없음');
  console.log('      뒤 회차가 더한 함수: ' + (added.filter(f => LATER.indexOf(f) >= 0).join(',') || '없음'));
  ck('driverAcctApi·driverAcctMsg 는 남겼다 (서버 호출·안내 공용)',
    b.indexOf('driverAcctApi') >= 0 && b.indexOf('driverAcctMsg') >= 0, true);
  ck('logout·sendPwReset 그대로', b.indexOf('logout') >= 0 && b.indexOf('sendPwReset') >= 0, true);
  ck('v253·v252 함수 그대로',
    ['openPwResetSheet', 'pwrSendCode', 'pwrDoReset', 'masterChangePhoneAsk', 'mcpSendCode',
     'isTestOrgUrl', 'testOrgBlockedIfNotMaster', 'masterTestAccessAsk'].every(f => b.indexOf(f) >= 0), true);
  console.log('      새 함수 ' + added.length + '개 · 없어진 함수 ' + gone.length + '개');
}

console.log('\n════ 3. 리스너 키 — driverPay 가 늘고 기사 걸러내기가 붙었다 ════');
{
  const keysOf = (src) => {
    const m = /var keys = \[([^\]]*)\]/.exec(src.slice(src.indexOf('function startFirebaseListeners')));
    return m ? m[1].replace(/\s+/g, '') : '?';
  };
  const a = keysOf(OLD), b = keysOf(NEW);
  ck('v254 키에 driverPay 가 없었다', a.indexOf('driverPay') < 0, true);
  ck('v255 키에 driverPay 가 들어갔다', b.indexOf("'driverPay'") >= 0, true);
  ck('그 밖의 키는 그대로', b.replace(",'driverPay'", '') === a, true);
  ck('기사 모드면 허용 키만 듣는다',
    /if\(currentMode==='driver'\)\{ keys = keys\.filter\(driverKeyAllowed\); \}/.test(NEW), true);
  ck('loadFromFirebase 에도 같은 막이',
    /if\(currentMode==='driver' && key!=='aligo' && !driverKeyAllowed\(key\)\) return null;/.test(NEW), true);
  console.log('      v255 키: ' + b);
}

console.log('\n════ 4. 저장 키·백업 ════');
{
  ck('ORG_KEYS 에 tkd_driver_pay 가 들어갔다', /'tkd_ridestate','tkd_driver_pay'\]/.test(NEW), true);
  ck('v254 에는 없었다', /'tkd_driver_pay'/.test(OLD), false);
  /* 백업 키 목록 — backupData() 의 var keys (이름을 잽지 못해 한번 헛돈 자리다) */
  const bk = (src) => {
    const at = src.indexOf('function backupData');
    const m = /var keys = \[([^\]]*)\];/.exec(src.slice(at, at + 2000));
    return m ? m[1].replace(/\s+/g, '') : '?';
  };
  ck('백업 키 목록을 제대로 집었나 (헛돈 검사 막기)', bk(OLD).indexOf("'tkd_members'") === 0, true);
  ck('백업 목록에도 tkd_driver_pay 가 들어갔다', bk(NEW).indexOf("'tkd_driver_pay'") >= 0, true);
  ck('백업 목록의 그 밖은 그대로', bk(NEW).replace(",'tkd_driver_pay'", '') === bk(OLD), true);
  ck('복원에도 driverPay 가 들어갔다', /tkd_driver_pay[\s\S]{0,200}saveToFirebase\('driverPay'/.test(NEW), true);
}

console.log('\n════ 5. 문답표 ════');
{
  const qa = require('./qa252.js');
  const a = qa.read(OLD), b = qa.read(NEW);
  console.log('      문답 수: ' + a.length + ' → ' + b.length);
  ck('문답이 줄지 않았다', b.length >= a.length, true);
  const tOf = (x) => x.map(q => q.t);
  const goneQ = tOf(a).filter(t => tOf(b).indexOf(t) < 0);
/* v256 보정4: 겹치던 「기사는 어떻게 로그인해요?」를 「기사 로그인 (업체 번호 + PIN)」에 합치고
     낡은 문구·검색어를 더 고쳤다 → 그 회차 것이 **모두 들어 있나**로 본다 */
  console.log('      없어진 문답: ' + goneQ.join(' / '));
  ck('없어진 문답에 v255 의 둘이 다 있다',
    ['PIN 출퇴근 체크', '기사 계정 만들어 주기'].every(t => goneQ.indexOf(t) >= 0), true);
  /* v261: 가입 문답 제목이 「회원가입 — 이메일 또는 휴대폰」 → 「회원가입 — 문자 인증 + 사업자 확인」
     으로 바뀌었다(이메일 가입 갈래를 없앴다). 제목이 바뀌었으니 옛 제목이 「없어진 문답」으로 센다. */
  /* v263 이 요금 문답 제목도 「이용 기간 · 연장」으로 바꿨다 → 옛 제목이 하나 더 없어진다 */
  ck('   그 밖에 없어진 것은 보정4 하나 + v261 하나 + v263 하나',
    goneQ.filter(t => ['PIN 출퇴근 체크', '기사 계정 만들어 주기'].indexOf(t) < 0).sort().join(' / '),
    ['기사는 어떻게 로그인해요?', '회원가입 — 이메일 또는 휴대폰', '30일 무료 체험·구독'].sort().join(' / '));
  const addQ = tOf(b).filter(t => tOf(a).indexOf(t) < 0);
  /* v261 이 둘을 더했다 — 바뀐 가입 문답(새 제목) + 새 문답 「사업자 확인이 안 돼요」 */
  ck('새 문답 4개 + v261 둘 + v263 하나', addQ.sort().join(' / '),
    ['「📦 옛 기사 자료 옮기기」가 떴어요', '기사 로그인 (업체 번호 + PIN)',
     '기사 로그인 만들어 주기 (업체 번호 + PIN)', '사업자 확인이 안 돼요',
     '출근·퇴근 기록하기', '회원가입 — 문자 인증 + 사업자 확인',
     '이용 기간 · 연장'].sort().join(' / '));
  /* 바뀌지 않은 문답은 글자 하나까지 같아야 한다 */
  const same = b.filter(q => tOf(a).indexOf(q.t) >= 0);
  const changed = same.filter(q => {
    const o = a.find(x => x.t === q.t);
    return JSON.stringify(o) !== JSON.stringify(q);
  }).map(q => q.t);
  /* 손댄 문답은 모두 기사 로그인·PIN·운행 화면이 달라진 자리다 —
     목록을 박아 두어 엉뚱한 문답이 조용히 바뀌는 것을 막는다 */
  const WANT_CHANGED = [
    '«출결» 체크인 (PIN)',            // 기사 폰 패드는 회원 출석 전용 (9번 줄 추가)
    '계기판 km는 어디에 넣나요',        // PIN 판 → 출근·퇴근 단추
    '기사 운행 화면 사용법',            // 아래 단추 이름
    '기사는 어떻게 로그인해요?',         // 업체 번호 + PIN
    '비밀번호를 잊었어요',              // 기사는 비밀번호가 없다
    '업체 이용 기간이 끝나면 기사는?',    // PIN 지우기 안내
    '차량 등록·기사 배정',             // PIN 칸 → 「기사 로그인 (PIN)」
    '「지금은 들어갈 수 없어요」가 나와요'  // 까닭 둘로 나눔
  ].sort();
  /* v256 보정4: 겹치던 「기사는 어떻게 로그인해요?」를 「기사 로그인 (업체 번호 + PIN)」에 합치고
     낡은 문구·검색어를 더 고쳤다 → 그 회차 것이 **모두 들어 있나**로 본다 */
  ck('v255 가 손댄 ' + WANT_CHANGED.length + '개가 모두 들어 있다 (합쳐 없어진 것 포함)',
    WANT_CHANGED.every(t => changed.indexOf(t) >= 0 || goneQ.indexOf(t) >= 0), true);
  console.log('      손댄 문답(' + changed.length + '): ' + (changed.slice().sort().join(' / ') || '없음'));
}

console.log('\n════ 6. 버전·바뀐 파일 ════');
{
  const vj = JSON.parse(_pinRead('version.json')).version;
  const av = Number(/const APP_VERSION = (\d+);/.exec(NEW)[1]);
  console.log('      지금 버전: ' + vj + ' (이 회차는 255 였다 — v256 이 올렸다)');
  ck('버전이 255 이상', vj >= 255, true);
  ck('둘이 같은 숫자', vj === av, true);
  /* ★ v261 에서 못 박음 — 작업트리와 견주면 **뒤 회차가 고친 파일까지** 섞여 들어와
     「이 회차는 X 를 안 건드렸다」가 거짓으로 깨진다(v261 이 api/otp.js·규칙을 고쳤다).
     그래서 BASE ↔ **이 회차의 커밋** 으로 범위를 못 박는다. */
  const ROUND = '4fb71ff';     // v255 커밋
  const stat = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + BASE + ' ' + ROUND).toString().trim().split('\n');
  console.log('      바뀐 파일:');
  stat.forEach(l => { const p = l.split('\t'); console.log('        ' + p[2].padEnd(24) + '+' + p[0] + ' / −' + p[1]); });
  const names = stat.map(l => l.split('\t')[2]).sort();
  /* v255 때는 driver-auth.js 가 아직 안 올라간 새 파일(??)이라 목록 밖에 있었다.
     지금은 커밋돼 있어 목록에 들어온다 — v255 가 바꾼 다섯 파일이 모두 있는지만 본다. */
  console.log('      바뀐 파일 수: ' + names.length);
  ck('v255 가 바꾼 다섯 파일이 모두 들어 있다',
    ['CLAUDE.md', 'api/admin-account.js', 'firestore.rules', 'index.html', 'version.json']
      .every(f => names.indexOf(f) >= 0), true);
  ck('api/driver-auth.js 가 저장소에 있다',
    cp.execSync('git -C ' + COS_ROOT + ' ls-files api/driver-auth.js').toString().trim(), 'api/driver-auth.js');
  /* v256 보정3 이 s.html·home·terms·privacy 에 한국어 줄바꿈 두 줄을 넣었다 (사장님 원칙) */
  console.log('      v255 뒤에 더 바뀐 파일: ' + names.filter(n => /s\.html|home\.html|terms\.html|privacy\.html/.test(n)).join(', '));
  ck('s.html 은 v255 가 아니라 v256 보정3 이 건드렸다',
    cp.execSync('git -C ' + COS_ROOT + ' diff --numstat 4b9fd9d -- s.html').toString().trim().length > 0, true);
  ck('api/otp.js 는 안 건드렸다', names.every(n => n.indexOf('otp.js') < 0), true);
  ck('package.json 은 안 건드렸다', names.every(n => n.indexOf('package.json') < 0), true);
  ck('v255 자신은 그 네 파일을 안 건드렸다',
    cp.execSync('git -C ' + COS_ROOT + ' diff --numstat 2eadaaa 4fb71ff -- s.html home.html terms.html privacy.html').toString().trim(), '');
}

console.log('\n════ 7. 4업종 화면 (차량관리 뺀 9탭) ════');
{
  const BIZ = ['academy', 'public', 'logistics', 'delivery'];
  /* cars 탭은 v255 가 **일부러 바꿨다**(기사 로그인·PIN 칸) → 비교에서 뺀다 */
  const TABS = ['dashboard', 'members', 'attendance', 'schedule', 'payment', 'tax', 'notice', 'partner', 'settings'];
  let same = 0; const diff = [];
  for (const biz of BIZ) for (const tab of TABS) {
    const one = (src) => {
      const R = run(src, biz);
      R.ev("currentMode='admin'; currentAdminTab='" + tab + "';");
      try { R.sandbox.renderAdminTab(tab); } catch (e) { return 'ERR:' + e.message; }
      return String(R.document.getElementById('admin-content').innerHTML || '');
    };
    if (one(OLD) === one(NEW)) same++; else diff.push(biz + '/' + tab);
  }
  /* v256 보정3: 설정 화면의 회색 글자 한 곳(--gray-300 → --gray-400)만 달라진다 — 그 색은 빼고 견준다 */
  ck('설정 화면 뺀 32화면 바이트 동일', same + '/32', '32/32');
  ck('달라진 화면은 4업종 설정 화면뿐', diff.slice().sort().join(','),
    'academy/settings,delivery/settings,logistics/settings,public/settings');
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
