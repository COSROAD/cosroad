/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ② 앱 — v253 보정2 「🧪 테스트 출입」 (게이트 3경우 · 마스터 패널 단추·배지·저장값) */
const cp = require('child_process');
const E = require('./env246.js');
const D = require('./detect.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + label.padEnd(58) + String(got).slice(0, 62)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const BASE = process.env.COS_SRC_OLD_REF || '070d6ab';   // 보정2 **전** = v253 커밋
const OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':index.html', { maxBuffer: 1 << 28 }).toString();
const NEW = E.SRC_NEW;

const IDS = ['admin-email', 'admin-pw', 'keep-login', 'login-err', 'login-screen', 'main-app', 'master-root'];

function boot(src, opts) {
  opts = opts || {};
  const R = E.build({ src: src, biz: 'academy' });
  if (R.error) throw R.error;
  R.win.location.search = opts.org ? ('?org=' + opts.org) : '';
  R.sandbox.location.search = R.win.location.search;
  IDS.forEach(id => {
    const el = E.makeEl(id === 'master-root' ? 'div' : 'input');
    el.id = id; el.classList = { add(){}, remove(){}, toggle(){} };
    R.document.registerId(id, el);
  });
  /* loadUserProfile 이 세워 두는 값 — 게이트가 이것을 본다 */
  R.win._userUid = opts.uid || 'U1';
  R.win._userApproved = (opts.approved !== false);
  R.win._userWithdrawn = (opts.withdrawn === true);
  if (opts.testAccess !== undefined) R.win._userTestAccess = opts.testAccess;
  const reads = [], saved = [];
  R.win._firestore = R.sandbox._firestore = {
    doc: (db, ...p) => ({ _p: p.join('/') }),
    getDoc: (ref) => {
      reads.push(ref._p);
      if (/^admins\//.test(ref._p)) return Promise.resolve({ exists: () => !!opts.isMaster, data: () => ({}) });
      const d = opts.docs && opts.docs[ref._p];
      return Promise.resolve({ exists: () => !!d, data: () => JSON.parse(JSON.stringify(d || {})) });
    },
    setDoc: (ref, data) => { saved.push([ref._p, data]); return Promise.resolve(); },
    /* ★ v315(72-B): 테스트 출입은 **그 칸만** 고친다(`updateDoc`·`deleteField`) —
       전에는 문서를 통째로 `setDoc` 했다. 받은 칸을 **같은 `saved` 자리**에 담아
       아래 검사가 「무엇이 저장됐나」를 그대로 보게 한다(셋째 칸에 `'only'` 표시만 더한다). */
    updateDoc: (ref, data) => { saved.push([ref._p, data, 'only']); return Promise.resolve(); },
    deleteField: () => '__DEL__',
    deleteDoc: () => Promise.resolve(),
    collection: () => ({}), getDocs: () => Promise.resolve({ forEach: () => {} })
  };
  const signOuts = [];
  R.win._auth = R.sandbox._auth = { currentUser: { uid: opts.uid || 'U1', isAnonymous: false } };
  R.win._authFns = R.sandbox._authFns = Object.assign({}, R.win._authFns,
    { signOut: () => { signOuts.push(1); return Promise.resolve(); } });
  R.reads = reads; R.saved = saved; R.signOuts = signOuts;
  return R;
}
const wait = () => new Promise(r => setImmediate(r));
const blocked = (R) => !!R.byId['testorg-blocked'];

(async () => {
  console.log('════ 1. loadUserProfile 이 testAccess 를 읽어 두나 ════');
  {
    ck('_userTestAccess 를 세우는 줄이 있나', /window\._userTestAccess = u\.testAccess===true;/.test(NEW), true);
    ck('_userApproved 바로 뒤인가',
      NEW.indexOf('window._userTestAccess') - NEW.indexOf('window._userApproved = u.approved===true') < 300, true);
    ck('보정2 전에는 없던 줄', /_userTestAccess/.test(OLD), false);
  }

  console.log('\n════ 2. _test 게이트 — 세 경우 ════');
  {
    /* ① 마스터 */
    const R = boot(NEW, { org: 'freezone_test', uid: 'MASTER', isMaster: true, testAccess: false });
    ck('① 마스터 → 통과', await R.sandbox.testOrgBlockedIfNotMaster('MASTER'), false);
    ck('   admins 를 읽어 판정', R.reads.join(','), 'admins/MASTER');
    ck('   화면 안 뜸 · signOut 없음', blocked(R) === false && R.signOuts.length === 0, true);
  }
  {
    /* ② 테스트 출입 허용 계정 — 마스터 아님 */
    const R = boot(NEW, { org: 'freezone_test', uid: 'TAOK', isMaster: false, testAccess: true });
    ck('② 출입 허용 승인 계정 → 통과', await R.sandbox.testOrgBlockedIfNotMaster('TAOK'), false);
    ck('   admins 를 **읽지도 않는다**(추가 읽기 0건)', R.reads.length, 0);
    ck('   화면 안 뜸 · signOut 없음', blocked(R) === false && R.signOuts.length === 0, true);
  }
  {
    /* ③ 일반 업체 계정 */
    const R = boot(NEW, { org: 'freezone_test', uid: 'PLAIN', isMaster: false, testAccess: false });
    ck('③ 일반 승인 계정 → 막힘', await R.sandbox.testOrgBlockedIfNotMaster('PLAIN'), true);
    await wait();
    ck('   안내 화면', /테스트 공간은 관리자 전용이에요/.test((R.byId['testorg-blocked'] || {}).innerHTML || ''), true);
    ck('   signOut 1회', R.signOuts.length, 1);
  }
  {
    /* 출입은 켜졌지만 미승인·탈퇴 */
    const a = boot(NEW, { org: 'freezone_test', uid: 'P', isMaster: false, testAccess: true, approved: false });
    ck('출입 켬 + 미승인 → 막힘', await a.sandbox.testOrgBlockedIfNotMaster('P'), true);
    const b = boot(NEW, { org: 'freezone_test', uid: 'P', isMaster: false, testAccess: true, withdrawn: true });
    ck('출입 켬 + 탈퇴 → 막힘', await b.sandbox.testOrgBlockedIfNotMaster('P'), true);
  }
  {
    /* 프로필을 안 읽은 상태(undefined) → 막는 쪽 */
    const R = boot(NEW, { org: 'freezone_test', uid: 'X', isMaster: false });
    R.win._userTestAccess = undefined;
    ck('testAccess 를 모르는 상태 → 막는다(안전한 쪽)', await R.sandbox.testOrgBlockedIfNotMaster('X'), true);
  }
  {
    /* 실업체·_demo 주소는 그대로 */
    const a = boot(NEW, { org: 'academy_abc123', uid: 'U', isMaster: false, testAccess: false });
    ck('실업체 주소 → 통과(읽기 0건)',
      (await a.sandbox.testOrgBlockedIfNotMaster('U')) === false && a.reads.length === 0, true);
    const b = boot(NEW, { org: 'academy_demo', uid: 'U', isMaster: false, testAccess: false });
    ck('_demo 주소 → 통과', await b.sandbox.testOrgBlockedIfNotMaster('U'), false);
  }

  console.log('\n════ 3. 마스터 패널 — 단추·배지 ════');
  function panel(users) {
    const R = boot(NEW, { org: 'admin', uid: 'MASTER', isMaster: true });
    R.sandbox.masterCompanies = []; R.sandbox.masterInquiries = [];
    R.sandbox.signupUsers = users;
    R.sandbox.drawMasterPanel();
    /* ★ 가짜 DOM 은 innerHTML 을 **해석하지 않는다** — 실제 브라우저라면 그려진 뒤
       mta-box-<uid> 칸이 생기지만 여기서는 안 생긴다. 그래서 손으로 등록해 준다.
       (처음에 빼먹어 확인 칸 검사 7건이 거짓 실패했다) */
    users.forEach(u => {
      const el = E.makeEl('div');
      el.id = 'mta-box-' + u._uid;
      R.document.registerId(el.id, el);
    });
    return { R: R, h: R.byId['master-root'].innerHTML || '' };
  }
  const APPROVED = { _uid: 'A1', orgName: '가온학원', bizType: 'academy', approved: true,
                     createdAt: Date.now(), signupMethod: 'phone', phone: '01011112222', email: '' };
  const PENDING  = { _uid: 'P1', orgName: '대기업체', bizType: 'public', approved: false,
                     createdAt: Date.now(), signupMethod: 'phone', phone: '01033334444' };
  {
    const { h } = panel([APPROVED, PENDING]);
    ck('승인 업체 줄에 🧪 단추 1개', (h.match(/masterTestAccessAsk\(/g) || []).length, 1);
    ck('   글자는 「🧪 테스트 출입」', /🧪 테스트 출입</.test(h), true);
    ck('   세 번째 인자 false (아직 꺼짐)', /masterTestAccessAsk\(&quot;A1&quot;,&quot;가온학원&quot;,false\)/.test(h), true);
    ck('승인 대기 줄에는 없다', /masterTestAccessAsk\(&quot;P1&quot;/.test(h), false);
    ck('배지 안 보임', /🧪 테스트 허용/.test(h), false);
    ck('확인 칸이 붙을 상자가 있나', /id="mta-box-A1"/.test(h), true);
    /* v263: 승인 취소도 서버로 갔다 — setUserApproval → masterUnapproveAsk */
    ck('기존 단추 그대로 (🔑·📱·승인취소)',
      /masterResetPwAsk\(&quot;A1&quot;/.test(h) && /masterChangePhoneAsk\(&quot;A1&quot;/.test(h)
      && /masterUnapproveAsk\(&quot;A1&quot;/.test(h), true);
  }
  {
    const on = Object.assign({}, APPROVED, { testAccess: true });
    const { h } = panel([on]);
    ck('켜진 줄 — 배지 「🧪 테스트 허용」', /🧪 테스트 허용</.test(h), true);
    ck('   단추 글자는 「🧪 출입 끄기」', /🧪 출입 끄기</.test(h), true);
    ck('   세 번째 인자 true', /masterTestAccessAsk\(&quot;A1&quot;,&quot;가온학원&quot;,true\)/.test(h), true);
  }
  {
    /* 기사 계정은 signupUsers 에 들어와도 승인 목록에 없다(approved 아님) */
    const drv = { _uid: 'D1', role: 'driver', driverOrg: 'freezone_test', ownerUid: 'MASTER' };
    const { h } = panel([APPROVED, drv]);
    ck('기사 줄에는 🧪 단추 없음', /masterTestAccessAsk\(&quot;D1&quot;/.test(h), false);
  }

  console.log('\n════ 4. 확인 칸 → 저장값 ════');
  {
    const { R, h } = panel([APPROVED]);
    const box = R.byId['mta-box-A1'];
    R.sandbox.masterTestAccessAsk('A1', '가온학원', false);
    const h2 = (box && box.innerHTML) || '';
    ck('확인 칸이 그 줄 상자에 붙었나', /id="mta-A1"/.test(h2), true);
    ck('   켜는 문구', /_test 공간의 자료를 보고 바꿀 수 있게/.test(h2), true);
    ck('   마스터 권한은 아니라고 적었나', /마스터 권한은 주지 않아요/.test(h2), true);
    ck('   「네, 켭니다」 단추', /masterTestAccessGo\(&quot;A1&quot;,true\)/.test(h2), true);
    /* 한 번 더 누르면 접힌다.
       ★ 가짜 DOM 은 insertAdjacentHTML 로 들어간 글자를 **요소로 등록하지 않는다** —
         실제 브라우저라면 mta-A1 요소가 있어 .remove() 가 먹는다. 그 상태를 손으로 만든다.
         (안 만들면 코드가 「없다」로 보고 확인 칸을 하나 더 붙인다 — 거짓 실패였다) */
    const fake = E.makeEl('div');
    fake.id = 'mta-A1';
    fake.remove = () => { box.innerHTML = ''; R.document.registerId('mta-A1', null); };
    R.document.registerId('mta-A1', fake);
    R.sandbox.masterTestAccessAsk('A1', '가온학원', false);
    ck('다시 누르면 접힌다 (확인 칸을 지우고 되돌아간다)',
      (R.byId['mta-box-A1'].innerHTML || ''), '');
  }
  {
    const { R } = panel([APPROVED]);
    R.sandbox.masterTestAccessAsk('A1', '가온학원', true);
    const h2 = (R.byId['mta-box-A1'] || {}).innerHTML || '';
    ck('끄는 문구', /다시 _test 공간에 들어갈 수 없게/.test(h2), true);
    ck('   자기 업체 자료는 그대로라고 적었나', /자기 업체 자료는 그대로/.test(h2), true);
    ck('   「네, 끕니다」 단추', /masterTestAccessGo\(&quot;A1&quot;,false\)/.test(h2), true);
  }
  {
    /* 실제 저장 — 켜기 */
    const R = boot(NEW, { org: 'admin', uid: 'MASTER', isMaster: true,
      docs: { 'users/A1': { orgId: 'academy_a1', orgName: '가온학원', approved: true, plan: 'trial' } } });
    R.sandbox.masterCompanies = []; R.sandbox.masterInquiries = []; R.sandbox.signupUsers = [APPROVED];
    await R.sandbox.masterTestAccessGo('A1', true);
    await wait();
    ck('쓰기 경로', (R.saved[0] || [])[0], 'users/A1');
    ck('   testAccess:true 로 저장', ((R.saved[0] || [])[1] || {}).testAccess, true);
    /* ★ v315: 「다른 값은 그대로」를 **보내는 칸이 그것 하나뿐인가**로 잰다 —
       통째로 보내지 않으므로 `orgId`·`approved`·`plan` 은 애초에 요청에 없다(그래서 안 덮인다). */
    ck('   보내는 칸은 `testAccess` 하나뿐', JSON.stringify(Object.keys(R.saved[0][1])), '["testAccess"]');
    ck('   그 칸만 고치는 길로 보냈다', (R.saved[0] || [])[2], 'only');
    ck('   알림 문구', /테스트 출입을 켰어요/.test(R.alerts.join('\n')), true);
  }
  {
    /* 실제 저장 — 끄기 (필드가 사라져야 한다) */
    const R = boot(NEW, { org: 'admin', uid: 'MASTER', isMaster: true,
      docs: { 'users/A1': { orgId: 'academy_a1', approved: true, testAccess: true } } });
    R.sandbox.masterCompanies = []; R.sandbox.masterInquiries = []; R.sandbox.signupUsers = [];
    await R.sandbox.masterTestAccessGo('A1', false);
    await wait();
    /* ★ v315: 끄기는 **칸을 지우는 표시**(`deleteField()`)를 보낸다 — false 로 남기지 않는다 */
    ck('끄면 **칸을 지우는 표시**를 보내나', R.saved[0][1].testAccess, '__DEL__');
    ck('   false 로 남겨 두지 않는다', R.saved[0][1].testAccess === false, false);
    ck('   보내는 칸도 그것 하나뿐', JSON.stringify(Object.keys(R.saved[0][1])), '["testAccess"]');
    ck('   알림 문구', /테스트 출입을 껐어요/.test(R.alerts.join('\n')), true);
  }
  {
    /* 기사·미승인은 서버에 쓰기 전에 앱이 막는다 */
    const a = boot(NEW, { org: 'admin', uid: 'MASTER', isMaster: true,
      docs: { 'users/D1': { role: 'driver', driverOrg: 'freezone_test' } } });
    a.sandbox.signupUsers = []; a.sandbox.masterCompanies = []; a.sandbox.masterInquiries = [];
    await a.sandbox.masterTestAccessGo('D1', true);
    ck('기사 계정 → 저장 안 함', a.saved.length, 0);
    ck('   안내', /기사 계정에는 테스트 출입을 줄 수 없어요/.test(a.alerts.join('\n')), true);
    const b = boot(NEW, { org: 'admin', uid: 'MASTER', isMaster: true,
      docs: { 'users/P1': { orgId: 'public_p1', approved: false } } });
    b.sandbox.signupUsers = []; b.sandbox.masterCompanies = []; b.sandbox.masterInquiries = [];
    await b.sandbox.masterTestAccessGo('P1', true);
    ck('미승인 계정 → 저장 안 함', b.saved.length, 0);
    ck('   안내', /먼저 승인된 업체여야 해요/.test(b.alerts.join('\n')), true);
    const c = boot(NEW, { org: 'admin', uid: 'MASTER', isMaster: true, docs: {} });
    c.sandbox.signupUsers = []; c.sandbox.masterCompanies = []; c.sandbox.masterInquiries = [];
    await c.sandbox.masterTestAccessGo('NONE', true);
    ck('없는 계정 → 저장 안 함', c.saved.length, 0);
  }
  {
    /* 규칙 미게시 안내 */
    const R = boot(NEW, { org: 'admin', uid: 'MASTER', isMaster: true,
      docs: { 'users/A1': { orgId: 'academy_a1', approved: true } } });
    R.sandbox.signupUsers = []; R.sandbox.masterCompanies = []; R.sandbox.masterInquiries = [];
    /* ★ v315(72-B): 쓰는 길이 `updateDoc` 으로 바뀌었다 — **거부를 내는 자리도** 그쪽이다 */
    R.win._firestore.updateDoc = () => { const e = new Error('x'); e.code = 'permission-denied'; return Promise.reject(e); };
    await R.sandbox.masterTestAccessGo('A1', true);
    await wait();
    ck('permission-denied → 규칙 미게시 안내',
      /규칙이 아직 게시되지 않았어요/.test(R.alerts.join('\n')), true);
    ck('   어느 규칙인지 적었나', /testAccess 를 여는 규칙/.test(R.alerts.join('\n')), true);
  }

  console.log('\n════ 5. 따옴표 escape (업체명·uid) ════');
  {
    const nasty = '"><img src=x onerror=alert(1)>';
    const u = { _uid: nasty, orgName: nasty, bizType: 'academy', approved: true, createdAt: Date.now(),
                signupMethod: 'phone', phone: nasty, email: nasty, testAccess: true };
    const { R, h } = panel([u]);
    const a = D.audit(h);
    ck('마스터 패널 — 주입된 속성 0', a.injectedAttrs.length, 0);
    ck('   살아있는 태그 0', a.liveTags, 0);
    ck('   alert 0', a.alerted, 0);
    ck('   핸들러가 실제로 돌았나', a.ran > 0, true);
    ck('   문법 오류 0', a.errors.length, 0);
    const call = a.calls.find(c => c[0] === 'masterTestAccessAsk');
    ck('   masterTestAccessAsk 가 원본 uid 를 받나', call && call[1], nasty);
    ck('   원본 업체명을 받나', call && call[2], nasty);
    ck('   켜짐 여부 true 로 전달', call && call[3], true);
    /* 확인 칸도 */
    R.sandbox.masterTestAccessAsk(nasty, nasty, false);
    const box = Object.keys(R.byId).map(k => R.byId[k]).find(e => e.id && e.id.indexOf('mta-box-') === 0);
    const h2 = (box && box.innerHTML) || '';
    const a2 = D.audit(h2);
    ck('확인 칸 — 주입된 속성 0', a2.injectedAttrs.length, 0);
    ck('   alert 0 · 문법 오류 0', a2.alerted + a2.errors.length, 0);
    const go = a2.calls.find(c => c[0] === 'masterTestAccessGo');
    ck('   masterTestAccessGo 가 원본 uid 를 받나', go && go[1], nasty);
  }

  console.log('\n════ 6. 출입 허용 계정에게 마스터 기능이 새지 않나 ════');
  {
    /* 일반 앱 화면에 마스터 패널로 가는 링크가 있나 — 전수 검색 */
    const links = (NEW.match(/org=admin/g) || []).length;
    const inApp = /href="[^"]*org=admin/.test(NEW) || /location\.href='\?org=admin'/.test(NEW);
    console.log('      org=admin 글자 ' + links + '곳 (주석·masterLogout 포함)');
    ck('일반 화면에 마스터 패널 링크 <a> 없음', /href="[^"]*\?org=admin"/.test(NEW), false);
    ck('마스터 패널은 showMasterGate 로만 열린다',
      (NEW.match(/showMasterGate\(\);/g) || []).length, 2);
    ck('renderMasterPanel 은 checkIsAdmin 통과 뒤에만',
      /checkIsAdmin\(u\.uid\)\.then\(function\(ok\)\{ if\(ok\) renderMasterPanel\(\); \}\)/.test(NEW), true);
    /* drawMasterPanel 호출은 보정2 에서 **1곳**만 늘어야 한다 (masterTestAccessGo 안) */
    /* v260: 개통 대장 죽은 함수 다섯(addMasterCompany·copyMasterUrl·deleteMasterCompany
     ·loadMasterCompanies·saveMasterCompanies)을 지웠다 — 부르는 곳 0 을 먼저 확인했다.
     이번 회차 표는 q_app260.js. 그 다섯은 아래 목록에서 뺀 뒤 견준다. */
    /* 지운 두 함수가 drawMasterPanel() 을 불렀다 → 호출 수가 줄었다. 늘어난 쪽만 보던 못을 푼다 */
    /* v263: 마스터 기간 네 동작이 끝나고 다시 그린다 → 호출이 늘었다.
       이 표의 뜻은 「보정2 가 호출을 없애지 않았나」이므로 **줄지 않았나**로 본다. */
    ck('drawMasterPanel 호출이 줄지 않았다',
      (NEW.match(/drawMasterPanel\(\)/g) || []).length
      >= (OLD.match(/drawMasterPanel\(\)/g) || []).length, true);
    console.log('      drawMasterPanel 호출: 옛 ' + (OLD.match(/drawMasterPanel\(\)/g) || []).length
      + '곳 → 지금 ' + (NEW.match(/drawMasterPanel\(\)/g) || []).length + '곳'
      + '  (v253 보정2 가 하나 더했고, v260 이 지운 두 함수가 둘 불렀다)');
    const goBody = NEW.slice(NEW.indexOf('async function masterTestAccessGo'),
                             NEW.indexOf('/* ── 문의함 — 처리 끝난 문의 지우기'));
    ck('   늘어난 곳이 masterTestAccessGo 안인가',
      (goBody.match(/drawMasterPanel\(\)/g) || []).length, 1);
  }

  console.log('\n════ 7. 버전·문답표·회귀 ════');
  {
    const fs = require('fs');
    /* ★ 숫자를 못 박지 않는다 — 회차가 지나면 올라간다(v253 → v254).
       이 묶음이 지켜야 할 것은 **version.json 과 APP_VERSION 이 같은가** 다. */
    const _vj = JSON.parse(fs.readFileSync('' + COS_ROOT + '/version.json', 'utf8')).version;
    const _av = Number(/const APP_VERSION = (\d+);/.exec(NEW)[1]);
    ck('version.json 과 APP_VERSION 이 같은 숫자 (' + _av + ')', _vj, _av);
    const qa = require('./qa252.js');
    /* v255 가 기사 로그인 문답을 일부러 늘렸다 → 「그대로」를 못 박지 않는다 */
    console.log('      문답 수: ' + qa.read(OLD).length + ' → ' + qa.read(NEW).length);
    ck('문답이 줄지 않았다', qa.read(NEW).length >= qa.read(OLD).length, true);
    const fnsOf = (src) => {
      const R = E.build({ src: src, biz: 'academy' });
      return Object.keys(R.sandbox).filter(k => typeof R.sandbox[k] === 'function').sort();
    };
    const a = fnsOf(OLD), b = fnsOf(NEW);
    /* v255 는 「기사 계정」 칸을 없애면서 그 함수들을 일부러 지웠다 */
    const V255_GONE = ['driverAcctCreate','driverAcctHtml','driverAcctLoad','driverAcctOf',
                       'driverAcctRefresh','driverAcctRemoveAsk','driverAcctResetAsk'];
    const V260_GONE = ['addMasterCompany', 'copyMasterUrl', 'deleteMasterCompany', 'loadMasterCompanies', 'saveMasterCompanies'];
    /* v261: 가입을 서버로 옮기며 화면의 옛 가입 함수 열 개를 지웠다 (표는 t_app261.js) */
    const V261_GONE = ['suCreateAccount','suSaveUserDoc','doSignupEmail','doSignupPhone',
                       'suSetMethod','suSyncContact','suCheckCommon',
                       'notifyMasterSignup','notifyApplicantAccount','sendSignupSms'];
    const V263_GONE = ['setUserApproval'];   /* v263: 승인을 서버로 옮기며 지움 */
    /* ★ 코스로드41 에 더함 — v269·v270 이 **안 쓰는 창**을 일부러 지웠다.
       (git 으로 확인: v269 「안 쓰는 savePdfInvoice 삭제」 · v270 「안 쓰는 미납 알림 미리보기 창 삭제」)
       그래서 「없어진 함수」 목록에 그 둘을 더했다 — 모르고 사라진 것이 아니다. */
    const V269_GONE = ['savePdfInvoice'];
    const V270_GONE = ['sendUnpaidSMS'];
    ck('없어진 함수는 v255·v260·v261·v263·v269·v270 이 지운 것뿐',
      a.filter(x => b.indexOf(x) < 0)
       .filter(x => V255_GONE.indexOf(x) < 0 && V260_GONE.indexOf(x) < 0 && V261_GONE.indexOf(x) < 0
                 && V263_GONE.indexOf(x) < 0 && V269_GONE.indexOf(x) < 0 && V270_GONE.indexOf(x) < 0)
       .join(',') || '없음', '없음');
    ck('   그 둘이 **정말** 없어졌나(대조 — 목록만 늘린 게 아니다)',
      V269_GONE.concat(V270_GONE).filter(x => a.indexOf(x) >= 0 && b.indexOf(x) < 0).join(','),
      'savePdfInvoice,sendUnpaidSMS');
    /* ★ 이 묶음은 **보정2 기록**이다. 보정3 이 같은 트리에 얹히면서 「새 함수」가
       보정2 의 2개 + 보정3 의 5개가 됐다. 그래서 여기서는 **보정2 의 두 함수가 있는지**만
       본다. 정확한 전체 목록은 누적 표(c_reg253.js)가 센다. */
    const added = b.filter(x => a.indexOf(x) < 0);
    ck('보정2 의 두 함수가 들어 있나',
      ['masterTestAccessAsk', 'masterTestAccessGo'].every(f => added.indexOf(f) >= 0), true);
    console.log('      (이 기준 대비 새 함수 ' + added.length + '개: ' + added.join(', ') + ')');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
})().catch(e => { console.log('오류: ' + e.message); console.log(e.stack.split('\n').slice(0, 6).join('\n')); });
