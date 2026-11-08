/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ③ 회귀 — v251 과 v252 에서 **건드리지 않은 화면**이 바이트 동일한가
   ★ 이것은 **v251→v252 회차 기록**이다. 「지금 코드」를 보는 묶음이 아니다.
     양쪽을 그 회차 커밋에 **고정**한다 — 옛 e00385d(v251) · 새 edd2752(v252).
     v272 에서 바로잡음: 새 쪽이 **일하는 폴더**(지금 코드)를 보고 있었다.
     그래서 v253 부터 「기대 252」·「문답 68개」가 영영 틀려 **매 회차 11건 실패**로 떴고,
     「v272 가 깨뜨렸나」를 가려내는 데 시간이 들었다. 고정하니 35/35 통과 —
     이 회차의 참말은 영원히 참말로 남는다. */
const cp = require('child_process');
const os = require('os'); const pathMod = require('path');
if (!process.env.COS_SRC_OLD_REF) process.env.COS_SRC_OLD_REF = 'e00385d';   /* v251 */
if (!process.env.COS_SRC_NEW) {                                             /* v252 */
  const f = pathMod.join(__dirname, 'pin252_index.html');
  require('fs').writeFileSync(f, cp.execSync(
    'git -C ' + COS_ROOT + ' show ' + (process.env.COS_SRC_NEW_REF || 'edd2752') + ':index.html',
    { maxBuffer: 1 << 28 }));
  process.env.COS_SRC_NEW = f;
}
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + label.padEnd(52) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + (process.env.COS_SRC_OLD_REF || 'edd2752') + ':index.html', { maxBuffer: 1 << 28 }).toString();
const NEW = E.SRC_NEW;

/* 샘플 자료 — 두 판에 같은 것을 넣는다.
   ★ 앱은 Storage.prototype 을 감싸 데이터 키에 '__<orgId>' 를 붙인다(index.html:538).
     접미사 없이 넣으면 members 가 빈 배열로 나와 화면 비교가 헛돈다(실제로 겪었다). */
const SUF = '__cosroad_default';
const rawStore = {
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
  tkd_attendanceTime: JSON.stringify({ '2026-10-26': { s1: { in: '08:00', out: '18:00' } } }),
  tkd_products: JSON.stringify([{ code: 'P1', name: '박스', price: 1000 }]),
  tkd_invoices: JSON.stringify([]),
  tkd_ridestate: JSON.stringify({ '1': { on: true, offOn: true }, '2': { on: false, offOn: true } })
};
const store = {};
Object.keys(rawStore).forEach(k => { store[k + SUF] = rawStore[k]; });

function run(src, biz) {
  const R = E.build({ src: src, biz: biz, localStorage: Object.assign({}, store) });
  if (R.error) throw R.error;
  return R;
}

const BIZ = ['academy', 'public', 'logistics', 'delivery'];

/* 자료가 실제로 읽히는지 먼저 확인한다 — 빈 자료로 비교하면 「같다」가 거짓이 된다 */
console.log('════ 비교 전 — 샘플 자료가 읽히나 ════');
{
  const B = run(NEW, 'academy');
  ck('members 2명 읽힘', B.ev('loadMembers().length'), 2);
  ck('cars 1대 읽힘', B.ev('loadCars().length'), 1);
  ck('rideState 읽힘', B.ev('JSON.stringify(loadRideState())'), '{"1":{"on":true,"offOn":true},"2":{"on":false,"offOn":true}}');
  ck('   2번 회원 on=false 가 덮였나', B.ev('loadMembers()[1].on'), false);
}

console.log('\n════ 화면 HTML 바이트 비교 (업종 4개 × 화면 9개) ════');
let same = 0, diff = 0;
BIZ.forEach(biz => {
  const A = run(OLD, biz), B = run(NEW, biz);
  /* HTML 문자열을 **돌려주는** 함수만 쓴다 — 돌려준 값을 그대로 비교한다 */
  const screens = ['renderDashboard', 'renderAdminMembers', 'renderNotice', 'renderExcel',
                   'renderSchedule', 'renderSettings', 'renderGuide', 'renderShop', 'renderPrintHtml'];
  screens.forEach(fn => {
    const call = (R) => {
      if (typeof R.sandbox[fn] !== 'function') return 'NOFN';
      try { return String(R.sandbox[fn]()); } catch (e) { return 'ERR:' + e.message; }
    };
    const a = call(A), b = call(B);
    if (a === b) same++;
    else {
      diff++;
      console.log('  ✘ ' + biz + ' / ' + fn + ' 길이 ' + a.length + ' → ' + b.length);
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) { console.log('      첫 차이 ' + i + ': …' + a.slice(i - 40, i + 60) + ' / …' + b.slice(i - 40, i + 60)); break; }
      }
    }
  });
});
ck('화면 HTML 바이트 동일', diff, 0);
console.log('      ' + same + '칸 비교 (모두 같음)');

console.log('\n════ 값을 돌려주는 함수 — 반환값 바이트 동일 ════');
{
  const A = run(OLD, 'academy'), B = run(NEW, 'academy');
  const exprs = [
    /* ★ HELP_QA 는 이번에 1개 늘어난다 — 아래에서 따로 센다 */
    ['phoneDigits(82)', "phoneDigits('+82 10-1111-2222')"],
    ['phoneLoginId', "phoneLoginId('010-1111-2222')"],
    ['looksLikePhoneId(번호)', "looksLikePhoneId('010-1111-2222')"],
    ['looksLikePhoneId(메일)', "looksLikePhoneId('a@b.com')"],
    ['fullLoc', 'fullLoc(members[0])'],
    ['todayStr 모양', 'String(todayStr()).length'],
    ['loadRideState', 'JSON.stringify(loadRideState())'],
    ['applyRideState 적용', 'JSON.stringify((members||[]).map(function(m){return [m.id,m.on,m.offOn];}))'],
    ['escapeMasterHtml', 'escapeMasterHtml(String.fromCharCode(60)+"a b"+String.fromCharCode(34)+"c"+String.fromCharCode(39))'],
    ['escapeNoticeHtml', 'escapeNoticeHtml("x"+String.fromCharCode(38)+"y")'],
    ['jsArg', 'jsArg("a"+String.fromCharCode(34)+"b")'],
    ['buildPayslipData 키', 'Object.keys(buildPayslipData?buildPayslipData("2026-10","s1","2026-11-10")||{}:{}).sort().join(",")'],
    ['SHARE_DAYS', 'SHARE_DAYS'],
    ['PAYSLIP_SHARE_DAYS', 'PAYSLIP_SHARE_DAYS'],
    ['SIGNUP_EXPIRE_DAYS', 'SIGNUP_EXPIRE_DAYS'],
    ['getFbOrgId', 'String(getFbOrgId())'],
    ['orgIdFromUrlOrDefault', 'String(orgIdFromUrlOrDefault())'],
    ['keepLoginKey', 'String(keepLoginKey())'],
    ['리스너 키 목록', '(function(){var s=String(startFirebaseListeners);var m=/var keys = \\[([^\\]]*)\\]/.exec(s);return m?m[1]:"?";})()']
  ];
  exprs.forEach(([name, ex]) => {
    let a, b;
    try { a = String(A.ev(ex)); } catch (e) { a = 'ERR:' + e.message; }
    try { b = String(B.ev(ex)); } catch (e) { b = 'ERR:' + e.message; }
    ck(name, b, a);
  });
}

console.log('\n════ 문답표 — 1개만 늘고 나머지는 그대로인가 ════');
{
  const A = run(OLD, 'academy'), B = run(NEW, 'academy');
  const qa = (R) => R.ev('HELP_QA');
  const a = qa(A), b = qa(B);
  ck('v251 문답 수', a.length, 68);
  ck('v252 문답 수 (+1)', b.length, 69);
  const aT = a.map(x => x.t), bT = b.map(x => x.t);
  ck('없어진 제목 0개', aT.filter(t => bT.indexOf(t) < 0).join(',') || '없음', '없음');
  ck('새 제목', bT.filter(t => aT.indexOf(t) < 0).join(','), '휴대폰 번호를 바꿨어요');
  /* 답변이 바뀐 것은 비밀번호 관련 3개뿐이어야 한다 */
  const changed = [];
  a.forEach(x => { const y = b.find(z => z.t === x.t); if (y && (y.a !== x.a || y.keys.join(',') !== x.keys.join(','))) changed.push(x.t); });
  ck('답변이 바뀐 문답', changed.join(' / '),
    '휴대폰 번호로 로그인해요 / 1234 비밀번호로 안 들어가져요 / 비밀번호를 잊었어요');
}

console.log('\n════ 새로 생긴 것만 늘었나 (전역 함수 목록 비교) ════');
{
  const A = run(OLD, 'academy'), B = run(NEW, 'academy');
  const fnsOf = (R) => {
    const out = [];
    String(R.ev('1')); // 컨텍스트 깨우기
    const names = Object.keys(R.sandbox).filter(k => typeof R.sandbox[k] === 'function');
    names.forEach(n => out.push(n));
    return out.sort();
  };
  const a = fnsOf(A), b = fnsOf(B);
  const added = b.filter(x => a.indexOf(x) < 0);
  const gone  = a.filter(x => b.indexOf(x) < 0);
  ck('없어진 함수 0개', gone.join(',') || '없음', '없음');
  console.log('      새 함수 ' + added.length + '개: ' + added.join(', '));
  const want = ['openPwResetSheet', 'pwrClose', 'pwrMsg', 'pwrCheckMatch', 'pwrStartLock',
                'pwrSendCode', 'pwrDoReset', 'pwrMailPath',
                'masterChangePhoneAsk', 'mcpClose', 'mcpMsg', 'mcpStartLock', 'mcpApi',
                'mcpSendCode', 'mcpAskConfirm', 'mcpDoChange'].sort();
  ck('새 함수 목록이 예상과 같나', added.sort().join(','), want.join(','));
  ck('sendPwReset 은 그대로 남아 있나 (지우지 않았다)', b.indexOf('sendPwReset') >= 0, true);
}

console.log('\n════ 버전 ════');
{
  /* ★ v272: 버전도 **그 회차 커밋에서** 읽는다.
     여기는 저장소 루트의 `version.json`(지금 일하는 폴더)을 하드코딩해 읽었다.
     그래서 v253 부터는 「기대 252」가 영영 틀려 이 묶음이 **매 회차 실패**로 나왔다
     (v272 에서 11건 실패 → 양쪽을 제 커밋에 고정하니 2건 → 이 줄까지 고치니 0건).
     이 묶음은 v251→v252 **회차 기록**이다. 지금 코드를 보는 묶음이 아니다. */
  const VJ = cp.execSync('git -C ' + COS_ROOT + ' show '
    + (process.env.COS_SRC_NEW_REF || 'edd2752') + ':version.json').toString();
  ck('version.json', JSON.parse(VJ).version, 252);
  ck('APP_VERSION', /const APP_VERSION = (\d+);/.exec(NEW)[1], '252');
  ck('둘이 같은가', JSON.parse(VJ).version
     === Number(/const APP_VERSION = (\d+);/.exec(NEW)[1]), true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
