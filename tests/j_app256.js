/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v256 앱 스텁 검사 — 첫 화면 손질 + 한국어 줄바꿈 전체 적용
   전: 4fb71ff (v255) · 후: 작업 중 index.html
   ① 기사 탭 색 (정의 안 된 var(--driver) → var(--primary))
   ② body 에 keep-all + overflow-wrap
   ③ 관리자 칸 안내문
   ④ 마지막 고른 탭 기억
   ⑤ 4업종 × 9화면 HTML 이 **문자열까지 같은가** (CSS 한 줄만 바꿨으므로)
   덧붙여 좁은 폭(360px) 넘침 검사용으로 화면 HTML 을 파일로 떨어뜨린다 */
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
/* ★ v272 보정1: 이 묶음은 **v256 회차 기록**이다 — 「새」쪽도 그 회차 커밋에 고정한다.
   전에는 작업트리(지금 코드)를 「후」로 보았다. 그래서 회차가 지날수록 문답 수·함수 목록·
   버전이 어긋나 **거짓으로 실패**했다(v272 기준 3건). v256 가 틀린 것이 아니다.
   지금 코드는 **그 회차의 묶음**이 본다 — 이 표는 그때 무엇이 바뀌었는지의 기록이다.
   ★ env246 은 **require 할 때** COS_SRC_NEW 를 읽는다 → 그 전에 넣어야 한다. */
/* ★ 기대값이 뒷 회차에 앞으로 고쳐진 묶음이다 — 쪽지가 「v260 다섯 + v261 열 + v263 …」까지
   적고 있어 그 기대값이 가리키는 회차(v263)에 맞춘다. (실측: 다른 회차는 더 틀어진다.) */
const NEW_REF = process.env.COS_SRC_NEW_REF || '269231d';   /* v256 */
if (!process.env.COS_SRC_NEW) {
  const _pf = require('path').join(__dirname, 'pin256_index.html');
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
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(58) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const BASE = process.env.COS_SRC_OLD_REF || '4fb71ff';
const OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':index.html', { maxBuffer: 1 << 28 }).toString();
const NEW = E.SRC_NEW;
const SUF = '__cosroad_default';
const OUT = path.join(__dirname, 'scr256');
fs.mkdirSync(OUT, { recursive: true });

/* 화면에 쓸 자료 — v255 묶음과 같은 것 */
const CARS = [
  { id: 'car1', name: '1호차', driver: '박기사', phone: '010-5555-6666', plate: '12가3456',
    model: '스타렉스', commuteKm: 20, hourlyWage: 10030, mealAllow: 200000, taxMode: 'free33' },
  { id: 'car2', name: '2호차', driver: '김기사', phone: '010-7777-8888', plate: '34나5678',
    model: '포터2', commuteKm: 15, hourlyWage: 11000, mealAllow: 150000, taxMode: 'insure4' }
];
const MEMBERS = [
  { id: 1, name: '강하은', courseId: 'c1', carId: 'car1', location: '인천광역시 연수구 용담로 111번길 22', detail: '101동 202호',
    lat: 37.4, lon: 126.7, dropLocation: '인천광역시 연수구 용담로 111번길 22', phone: '010-1111-1111',
    days: ['월', '화', '수', '목', '금'], pin: '1111', on: true, monthly: 150000,
    note: '정문 우측에서 기다립니다 — 비 오는 날에는 지하주차장 입구로 와 주세요' },
  { id: 2, name: '문소율', courseId: 'c1', carId: 'car2', location: '인천광역시 연수구 송도동 1-1', lat: 37.2, lon: 127.2,
    dropLocation: '인천광역시 연수구 송도동 1-1', phone: '010-2222-2222',
    days: ['월', '화', '수', '목', '금'], pin: '2222', on: true, monthly: 150000,
    note: 'https://example.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 참고' }
];
const STAFF = [{ id: 'st1', name: '최직원', phone: '010-9999-0000', pin: '3333',
                 hourlyWage: 10030, mealAllow: 100000, taxMode: 'free33', breakAuto: true }];
const ATT = {
  'car1_2026-10-05': { in: '08:30', out: '18:00' },
  'car2_2026-10-05': { in: '07:50', out: '17:30' },
  'st1_2026-10-05': { in: '09:00', out: '18:30' }
};
function storeOf() {
  const s = {};
  const put = (k, v) => { s[k + SUF] = typeof v === 'string' ? v : JSON.stringify(v); };
  put('tkd_cars', CARS); put('tkd_members', MEMBERS);
  put('tkd_courses', [{ id: 'c1', name: 'A반', depart: '15:00' }]);
  put('tkd_org', { name: '코스로드태권도학원', lat: 37.0, lon: 127.0 });
  put('tkd_staff', STAFF); put('tkd_driver_att', ATT);
  put('tkd_attendance', { '2026-10-05': { 1: 'present' } });
  put('tkd_attendance_time', {}); put('tkd_payments', {}); put('tkd_tax', {}); put('tkd_carlog', {});
  return s;
}
function boot(src, opts) {
  opts = opts || {};
  const R = E.build({ src: src, biz: opts.biz || 'academy', localStorage: opts.store || storeOf() });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'login-err', 'login-box-driver', 'login-box-admin',
   'login-tab-driver', 'login-tab-admin', 'drv-orgcode', 'drv-pin', 'admin-email', 'admin-pw',
   'keep-login', 'keep-login-drv', 'demo-enter-box', 'login-screen', 'main-app',
   'drive-tabs', 'main-header', 'pin-result', 'pin-dots', 'drv-msg', 'drv-mig-msg'].forEach(id => {
    const el = E.makeEl('div'); el.id = id;
    el.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
    R.document.registerId(id, el);
  });
  R.win._auth = R.sandbox._auth = { currentUser: { uid: 'U1', isAnonymous: false, getIdToken: async () => 'T' } };
  R.win.fetch = R.sandbox.fetch = async () => ({ json: async () => ({ ok: false, message: 'x' }) });
  R.win._db = R.sandbox._db = {};
  R.win._firestore = R.sandbox._firestore = {
    doc: (db, ...p) => ({ _p: p.join('/') }), collection: (db, ...p) => ({ _p: p.join('/') }),
    getDoc: async () => ({ exists: () => false, data: () => ({}) }),
    setDoc: async () => {}, deleteDoc: async () => {},
    getDocs: async () => ({ forEach: () => {} }), onSnapshot: () => () => {}
  };
  return R;
}

console.log('════ 1. 기사 탭 색 — 정의 안 된 변수를 없앴나 ════');
{
  /* 먼저 「정말 없는 변수였나」를 보인다 (대조) */
  const defsOf = (src) => {
    const set = new Set(); const re = /(^|[{;\s])(--[a-zA-Z0-9_-]+)\s*:/g; let m;
    while ((m = re.exec(src)) !== null) set.add(m[2]);
    return set;
  };
  ck('v255: :root 에 --driver 가 없었다', defsOf(OLD).has('--driver'), false);
  ck('v255: 기사 탭이 그 없는 변수를 썼다', /id="login-tab-driver"[^>]*background:var\(--driver\)/.test(OLD), true);
  ck('v255: loginPick 도 그 변수를 썼다', /on\(td,'var\(--driver\)'\)/.test(OLD), true);
  ck('v256: 기사 탭이 --primary 를 쓴다', /id="login-tab-driver"[^>]*background:var\(--primary\)/.test(NEW), true);
  ck('v256: loginPick 도 --primary', /on\(td,'var\(--primary\)'\)/.test(NEW), true);
  ck('v256: --driver 는 어디에도 없다', /var\(--driver\)/.test(NEW), false);
  ck('v256: --driver 를 새로 만들지 않았다', defsOf(NEW).has('--driver'), false);
  ck('--primary 는 :root 에 있다', defsOf(NEW).has('--primary'), true);
  /* 「🚐 기사로 시작」 단추와 같은 파랑인가 — .btn-driver 가 쓰는 색 */
  const btn = /\.btn-driver\{([^}]*)\}/.exec(NEW);
  console.log('      .btn-driver: ' + (btn ? btn[1] : '?'));
  ck('기사 단추도 --primary 계열', btn && /var\(--primary\)|#1A6BFF/.test(btn[1]), true);
}

console.log('\n════ 2. 한국어 줄바꿈 — body 에 전체 적용 ════');
{
  const bodyOf = (src) => { const m = /\nbody\{([^}]*)\}/.exec(src); return m ? m[1] : ''; };
  ck('v255 body 에는 없었다', /word-break/.test(bodyOf(OLD)), false);
  ck('v256 body 에 keep-all', /word-break:keep-all/.test(bodyOf(NEW)), true);
  ck('v256 body 에 overflow-wrap:anywhere', /overflow-wrap:anywhere/.test(bodyOf(NEW)), true);
  ck('body 의 그 밖은 그대로',
    bodyOf(NEW).replace(';word-break:keep-all;overflow-wrap:anywhere', '') === bodyOf(OLD), true);
  /* 일부러 끊는 자리 — 바뀌지 않았나 */
  const brk = (src) => (src.match(/word-break:break-all/g) || []).length;
  /* v256 보정3 이 인쇄 표 2곳을 break-all → keep-all 로 바꿨다 → 남는 것은 URL 상자 2곳 */
  console.log('      break-all 자리: ' + brk(OLD) + '곳 → ' + brk(NEW) + '곳 (보정3 이 인쇄 표를 바꿨다)');
  /* v259: 그 두 번째 자리는 **마스터 패널 개통 대장의 ?org= 주소 줄**이었다
     (보정3 지시문이 「공유 링크 미리보기」로 적었지만, 소스로 보면 drawMasterPanel 안이었다).
     v259 가 그 묶음을 화면에서 빼면서 함께 없어졌다 → 이제 .share-link-box 한 곳만 남는다. */
  ck('break-all 은 .share-link-box 한 곳만 남았다', brk(NEW), 1);
}

console.log('\n════ 3. 관리자 칸 안내문 ════');
{
  ck('v255 칸 안내문', /id="admin-email"[^>]*placeholder="이메일 또는 휴대폰 번호"/.test(OLD), true);
  ck('v256 칸 안내문 → 휴대폰 번호', /id="admin-email"[^>]*placeholder="휴대폰 번호"/.test(NEW), true);
  ck('v256 로그인 실패 문구', /'휴대폰 번호 또는 비밀번호가 올바르지 않습니다\.'/.test(NEW), true);
  ck('v256 빈 칸 문구', /'휴대폰 번호를 넣어 주세요\.'/.test(NEW), true);
  ck('v255 문구는 없어졌다', /아이디\(이메일·휴대폰 번호\)/.test(NEW), false);
  /* ★ 받는 값은 그대로 — 이메일 계정도 들어가야 한다 */
  ck('이메일 분기(looksLikePhoneId)를 손대지 않았다',
    /var email = looksLikePhoneId\(typed\) \? phoneLoginId\(typed\) : typed;/.test(NEW), true);
  const R = boot(NEW);
  R.document.getElementById('admin-email').value = 'master@example.com';
  R.document.getElementById('admin-pw').value = 'pw123456';
  let sent = null;
  R.win._authFns.signInWithEmailAndPassword = (a, em, pw) => { sent = em; return Promise.reject({ code: 'x' }); };
  try { R.sandbox.loginAdmin(); } catch (e) {}
  ck('이메일을 넣으면 이메일 그대로 보낸다', sent, 'master@example.com');
  const R2 = boot(NEW);
  R2.document.getElementById('admin-email').value = '010-1234-5678';
  R2.document.getElementById('admin-pw').value = 'pw123456';
  let sent2 = null;
  R2.win._authFns.signInWithEmailAndPassword = (a, em) => { sent2 = em; return Promise.reject({ code: 'x' }); };
  try { R2.sandbox.loginAdmin(); } catch (e) {}
  ck('번호를 넣으면 내부 아이디로 바꾼다', /@phone\.cosroad\.com$/.test(sent2 || ''), true);
  /* 이번에 손대지 않은 자리 — 가입 창·비번찾기·마스터 */
  /* ★ v261 이 가입 창을 다시 짰다 — 이메일 갈래를 없앴으므로 이 문구는 사라졌다.
     이 회차(v256)가 지키려던 뜻은 「보정1 이 가입 창을 건드리지 않았다」였다.
     그 뜻은 v256 회차 범위로 확인하고(아래), 지금 판에서는 0 인 것을 적는다. */
  ck('가입 창 「이메일로 가입」 — v261 에서 없앴다 (지금 0)',
    (NEW.match(/📧 이메일로 가입/g) || []).length, 0);
  ck('   v256 회차는 가입 창을 건드리지 않았다 (BASE↔4b9fd9d 범위)',
    cp.execSync('git -C ' + COS_ROOT + ' show 4b9fd9d:index.html', { maxBuffer: 1 << 28 })
      .toString().match(/📧 이메일로 가입/g).length,
    (OLD.match(/📧 이메일로 가입/g) || []).length);
  ck('비밀번호 찾기 메일 길 그대로', /재설정 메일 받기/.test(NEW), true);
}

console.log('\n════ 4. 마지막 고른 탭 기억 ════');
{
  const R = boot(NEW);
  const td = () => R.document.getElementById('login-tab-driver');
  const ta = () => R.document.getElementById('login-tab-admin');
  const boxD = () => R.document.getElementById('login-box-driver');
  const boxA = () => R.document.getElementById('login-box-admin');
  R.sandbox.loginPick('admin');
  ck('관리자 고르면 기억한다', R.store['cosroad_login_pick'], 'admin');
  ck('   기관 접미사가 안 붙는다 (기기 설정)', Object.keys(R.store).some(k => /^cosroad_login_pick__/.test(k)), false);
  ck('   관리자 탭 색이 칠해진다', ta().style.background, 'var(--admin)');
  ck('   기사 탭은 흰 바탕', td().style.background, '#fff');
  R.sandbox.loginPick('driver');
  ck('기사 고르면 기억한다', R.store['cosroad_login_pick'], 'driver');
  ck('   기사 탭 색이 칠해진다 (★ 안 보이던 자리)', td().style.background, 'var(--primary)');
  ck('   기사 탭 글자색', td().style.color, '#fff');

  /* 새로고침 흉내 — 같은 store 로 다시 올리고 복원 */
  const again = (saved) => {
    const st = storeOf(); if (saved) st['cosroad_login_pick'] = saved;
    const X = boot(NEW, { store: st });
    X.sandbox.loginPickRestore();
    return X;
  };
  let X = again('admin');
  ck('관리자 → 새로고침 → 관리자 칸', X.document.getElementById('login-box-admin').style.display, '');
  ck('   기사 칸은 숨음', X.document.getElementById('login-box-driver').style.display, 'none');
  X = again('driver');
  ck('기사 → 새로고침 → 기사 칸', X.document.getElementById('login-box-driver').style.display, '');
  ck('   기사 탭 색도 칠해짐', X.document.getElementById('login-tab-driver').style.background, 'var(--primary)');
  X = again(null);
  ck('기억이 없으면 기사 탭', X.document.getElementById('login-box-driver').style.display, '');
  ck('   그때는 기억을 새로 쓰지 않는다 (remember=false)', X.store['cosroad_login_pick'], 'undefined');
  /* localStorage 가 막힌 브라우저 */
  const st = storeOf();
  const Y = boot(NEW, { store: st });
  Y.sandbox.localStorage.getItem = () => { throw new Error('blocked'); };
  Y.sandbox.localStorage.setItem = () => { throw new Error('blocked'); };
  let threw = false;
  try { Y.sandbox.loginPickRestore(); } catch (e) { threw = true; }
  ck('localStorage 막혀도 터지지 않는다', threw, false);
  ck('   그래도 기사 탭으로 열린다', Y.document.getElementById('login-box-driver').style.display, '');
  let threw2 = false;
  try { Y.sandbox.loginPick('admin'); } catch (e) { threw2 = true; }
  ck('고르기도 터지지 않는다', threw2, false);
  /* 첫 화면을 그리는 자리에서 복원을 부르나 */
  ck('DOMContentLoaded 자리에서 부른다', /loginPickRestore\(\);/.test(NEW) && /function boot\(\)\{ openLastPick\(\); showDemoEnterBtn\(\); \}/.test(NEW), true);
  ck('_demo 단추 로직은 그대로', /if\(typeof isDemoMode!=='function' \|\| !isDemoMode\(\)\) return;/.test(NEW), true);
}

console.log('\n════ 5. 4업종 × 9화면 — HTML 문자열이 같아야 한다 ════');
{
  const BIZ = ['academy', 'public', 'logistics', 'delivery'];
  const TABS = ['dashboard', 'members', 'attendance', 'cars', 'schedule', 'payment', 'tax', 'notice', 'settings'];
  let same = 0; const diff = [];
  for (const biz of BIZ) for (const tab of TABS) {
    const one = (src, dump) => {
      const R = boot(src, { biz: biz, store: storeOf() });
      R.ev("currentMode='admin'; currentAdminTab='" + tab + "';");
      try { R.sandbox.renderAdminTab(tab); } catch (e) { return 'ERR:' + e.message; }
      const h = String(R.document.getElementById('admin-content').innerHTML || '');
      if (dump) fs.writeFileSync(path.join(OUT, dump + '_' + biz + '_' + tab + '.html'), h);
      return h;
    };
    const a = one(OLD, 'old'), b = one(NEW, 'new');
    if (a === b) same++; else diff.push(biz + '/' + tab + ' (' + a.length + '→' + b.length + ')');
  }
  /* v256 보정3: 설정 화면의 회색 글자 한 곳(--gray-300 → --gray-400)만 달라진다 — 그 색은 빼고 견준다 */
  ck('설정 화면 뺀 32화면 문자열 동일', same + '/32', '32/32');
  ck('달라진 화면은 4업종 설정 화면뿐', diff.map(x => String(x).split(' ')[0]).sort().join(','),
    'academy/settings,delivery/settings,logistics/settings,public/settings');
  /* 첫 화면(로그인 카드)도 떨어뜨린다 — 브라우저 검사용 */
  const card = (src) => {
    const i = src.indexOf('<div class="login-card">');
    const j = src.indexOf('</div>', src.indexOf('id="demo-enter-box"'));
    return src.slice(i, j + 6);
  };
  fs.writeFileSync(path.join(OUT, 'old_login_card.html'), card(OLD));
  fs.writeFileSync(path.join(OUT, 'new_login_card.html'), card(NEW));
  /* style 블록도 (브라우저 검사에서 같은 CSS 환경을 만들려고) */
  const styleOf = (src) => { const m = /<style>([\s\S]*?)<\/style>/.exec(src); return m ? m[1] : ''; };
  fs.writeFileSync(path.join(OUT, 'old.css'), styleOf(OLD));
  fs.writeFileSync(path.join(OUT, 'new.css'), styleOf(NEW));
  ck('style 블록을 꺼냈다', styleOf(NEW).length > 10000, true);
  console.log('      화면 HTML 을 ' + OUT + ' 에 떨어뜨렸습니다 (브라우저 넘침 검사용)');
}

console.log('\n════ 6. 버전·바뀐 파일 ════');
{
  /* v257 보정4: 기사 회원 탭·둘러보기 기사 화면·기사 출석 쓰기 회수 — 일부러 바꾼 자리다 */
  console.log('      지금 버전: ' + JSON.parse(_pinRead('version.json')).version
    + ' (이 회차는 256 이었다 — v257 이 올렸다)');
  ck('버전이 256 이상', JSON.parse(_pinRead('version.json')).version >= 256, true);
  ck('APP_VERSION 이 256 이상', Number((NEW.match(/const APP_VERSION = (\d+);/) || [])[1]) >= 256, true);
  const stat = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + BASE).toString().trim().split('\n');
  stat.forEach(l => { const p = l.split('\t'); console.log('      ' + p[2].padEnd(18) + '+' + p[0] + ' / −' + p[1]); });
  /* 보정1 회차는 세 파일만 바꿨다. 보정2·3 이 뒤에 얹혀 목록이 늘었다 */
  ck('보정1 의 세 파일이 모두 들어 있다',
    ['CLAUDE.md', 'index.html', 'version.json'].every(f => stat.some(l => l.split('\t')[2] === f)), true);
  /* v260: api/admin-account.js(옛 기사 계정 세 동작 삭제)·api/driver-auth.js(업체 단위 상한)를 고쳤다.
     이 회차 **자신이** api 를 건드렸는지로 본다. */
  ck('보정1 자신은 api 를 안 건드렸다',
    cp.execSync('git -C ' + COS_ROOT + ' diff --name-only 4fb71ff 4b9fd9d').toString().indexOf('api/') < 0, true);
  ck('보정1 자신은 firestore.rules 를 안 건드렸다',
    cp.execSync('git -C ' + COS_ROOT + ' diff --name-only 4fb71ff 4b9fd9d').toString().indexOf('firestore.rules') < 0, true);
  ck('보정1 자신은 그 네 파일을 안 건드렸다',
    cp.execSync('git -C ' + COS_ROOT + ' diff --name-only 4fb71ff 4b9fd9d').toString()
      .split('\n').every(n => !/s\.html|home\.html|terms\.html|privacy\.html/.test(n)), true);
  const qa = require('./qa252.js');
  /* 보정1 은 문답을 안 건드렸다. 보정2 가 기사 화면 PIN 판 문구 3개를 고쳤다 →
     「그대로」를 못 박지 않고, 보정1 이 고칠 이유가 없던 **수가 줄지 않았는지**만 본다. */
  const _qa0 = qa.read(OLD), _qa1 = qa.read(NEW);
  console.log('      문답 수: ' + _qa0.length + ' → ' + _qa1.length
    + ' · 손댄 문답 ' + _qa1.filter(q => { const o = _qa0.find(x => x.t === q.t); return o && JSON.stringify(o) !== JSON.stringify(q); }).length + '개 (v256 보정2)');
  /* v256 보정4: 겹치던 「기사는 어떻게 로그인해요?」를 「기사 로그인 (업체 번호 + PIN)」에 합치고
     낡은 문구·검색어를 더 고쳤다 → 그 회차 것이 **모두 들어 있나**로 본다 */
  /* v261 이 문답 하나를 더했다 (「사업자 확인이 안 돼요») → 71 */
  ck('문답 수는 보정4 가 하나 합쳐 70 · v261 이 하나 더해 71',
    _qa1.length + ' (전 ' + _qa0.length + ')', '71 (전 71)');
  const fnsOf = (src) => {
    const R = boot(src);
    return Object.keys(R.sandbox).filter(k => typeof R.sandbox[k] === 'function').sort();
  };
  const a = fnsOf(OLD), b = fnsOf(NEW);
  /* v260: 개통 대장 죽은 함수 다섯(addMasterCompany·copyMasterUrl·deleteMasterCompany
     ·loadMasterCompanies·saveMasterCompanies)을 지웠다 — 부르는 곳 0 을 먼저 확인했다.
     이번 회차 표는 q_app260.js. 그 다섯은 아래 목록에서 뺀 뒤 견준다. */
  const V260_GONE = ['addMasterCompany', 'copyMasterUrl', 'deleteMasterCompany', 'loadMasterCompanies', 'saveMasterCompanies'];
  /* v261: 가입을 서버(api/signup.js)로 옮기며 화면의 옛 가입 함수 열 개를 지웠다 — 표는 t_app261.js */
  const V261_GONE = ['suCreateAccount','suSaveUserDoc','doSignupEmail','doSignupPhone',
                     'suSetMethod','suSyncContact','suCheckCommon',
                     'notifyMasterSignup','notifyApplicantAccount','sendSignupSms'];
  /* v261 이 더한 함수 열 — 가입 창(문자 인증·사업자 확인)과 마스터 패널 사업자 줄 */
  const V261_NEW = ['suClose','suStartLock','suSendCode','suBizDirty','suPaintGo','suBizFields',
                    'suCheckBiz','suSignupDone','masterBizLine','masterDupBizNo'];
  /* v263: 승인을 서버로 옮기며 setUserApproval 을 지우고, 읽기 전용·마스터 기간 창 함수를 더했다.
     이번 회차 표는 v_app263.js. */
  const V263_GONE = ['setUserApproval'];
  const V263_NEW = ['enterReadOnly','isReadOnlyMode','showReadOnlyBar','readOnlyBlocked',
                    'periodDayStr','periodPreview','masterPeriodBox','masterPeriodErr','masterPeriodLine',
                    'masterApproveAsk','masterApprovePreview','masterApproveGo',
                    'masterExtendAsk','masterExtendGo','masterSetPeriodAsk','masterSetPeriodGo',
                    'masterUnapproveAsk','masterBillingLog'];
  ck('없어진 함수는 v260 다섯 + v261 열 + v263 하나뿐',
    a.filter(x => b.indexOf(x) < 0 && V260_GONE.indexOf(x) < 0 && V261_GONE.indexOf(x) < 0
                  && V263_GONE.indexOf(x) < 0)
     .join(',') || '없음', '없음');
  /* 보정2 가 driverLockedCarId 를 더했다 (기사 자기 차량 못 박기) */
  /* v257 보정4 가 함수 여섯을 더했다 — 그 자리만 풀고 적는다 */
  const V257 = ['demoDriverCarId', 'driverScopeMembers', 'driverNoCarHtml', 'demoPunchBarHtml', 'demoPunch', 'driverWriteAllowed'];
  ck('새 함수는 보정1·2 것 + v257 것 + v261 열 + v263 열여덟뿐',
    b.filter(x => a.indexOf(x) < 0 && V257.indexOf(x) < 0 && V261_NEW.indexOf(x) < 0
                  && V263_NEW.indexOf(x) < 0).sort().join(','),
    'driverLockedCarId,loginPickRestore');
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
