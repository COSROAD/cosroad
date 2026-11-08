/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ④ 앱(index.html) v253 — _test 마스터 전용 게이트 · 마스터 나가기 · 문의 삭제 */
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
/* ★ v261 에서 못 박음 — 기본값이 'HEAD' 라 회차가 지날수록 「전」이 새 코드가 되어
   「v252 에는 없던 함수인가」 같은 칸이 거짓으로 깨졌다. 이 suite 는 v252↔v253 비교다. */
const OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + (process.env.COS_SRC_OLD_REF || 'edd2752') + ':index.html',
                        { maxBuffer: 1 << 28 }).toString();
const NEW = E.SRC_NEW;

const IDS = ['admin-email', 'admin-pw', 'keep-login', 'login-err', 'login-screen', 'main-app',
             'master-root'];

/* opts: { org, uid, isMaster, role, keep } */
function boot(src, opts) {
  opts = opts || {};
  const R = E.build({ src: src, biz: 'academy',
    localStorage: opts.keep ? { ['tkd_keeplogin_' + (opts.org || 'cosroad_default')]: opts.keep } : {} });
  if (R.error) throw R.error;
  R.win.location.search = opts.org ? ('?org=' + opts.org) : '';
  R.sandbox.location.search = R.win.location.search;
  /* 칸 등록 — 가짜 DOM 은 innerHTML 을 해석하지 않는다 */
  IDS.forEach(id => {
    const el = E.makeEl(id === 'master-root' ? 'div' : 'input');
    el.id = id; el.classList = { add(){ el._hidden = true; }, remove(){ el._hidden = false; }, toggle(){} };
    R.document.registerId(id, el);
  });
  /* Firestore 가짜 — admins/{uid} 존재 여부로 마스터 판정 */
  const reads = [];
  const deleted = [];
  R.win._firestore = R.sandbox._firestore = {
    doc: (db, ...p) => ({ _p: p.join('/') }),
    getDoc: (ref) => { reads.push(ref._p); return Promise.resolve({ exists: () => (opts.isMaster && /^admins\//.test(ref._p)) || false, data: () => ({}) }); },
    setDoc: () => Promise.resolve(),
    deleteDoc: (ref) => { deleted.push(ref._p); return Promise.resolve(); },
    collection: () => ({}), getDocs: () => Promise.resolve({ forEach: () => {} })
  };
  const signOuts = [];
  R.win._auth = R.sandbox._auth = { currentUser: { uid: opts.uid || 'U1', isAnonymous: false, getIdToken: () => Promise.resolve('TOK') } };
  R.win._authFns = R.sandbox._authFns = Object.assign({}, R.win._authFns, {
    signOut: () => { signOuts.push(1); return Promise.resolve(); }
  });
  R.win._userUid = opts.uid || 'U1';
  R.win._userApproved = true;
  R.win._isDriverAcct = (opts.role === 'driver');
  R.reads = reads; R.deleted = deleted; R.signOuts = signOuts;
  R.replaced = [];
  R.win.location.replace = (u) => { R.replaced.push(String(u)); };
  return R;
}
const wait = () => new Promise(r => setImmediate(r));
const blockedUp = (R) => !!R.byId['testorg-blocked'] ||
  R.bodyKids.some(x => x.id === 'testorg-blocked');

(async () => {
  console.log('════ 1. _test 판정·게이트 함수가 생겼나 ════');
  {
    const R = boot(NEW, { org: 'freezone_test' });
    ck('isTestOrgUrl() — _test 주소', R.sandbox.isTestOrgUrl(), true);
    R.win.location.search = '?org=academy_abc123';
    ck('   실업체 주소는 false', R.sandbox.isTestOrgUrl(), false);
    R.win.location.search = '?org=academy_demo';
    ck('   _demo 는 false (둘러보기는 그대로)', R.sandbox.isTestOrgUrl(), false);
    R.win.location.search = '';
    ck('   주소 없음은 false', R.sandbox.isTestOrgUrl(), false);
    ck('v252 에는 없던 함수인가', /function isTestOrgUrl/.test(OLD), false);
    ck('마스터 판정에 checkIsAdmin 을 쓰나 (규칙과 같은 문서)',
      /ok = await checkIsAdmin\(uid\)/.test(NEW), true);
  }

  console.log('════ 2. testOrgBlockedIfNotMaster ════');
  {
    const R = boot(NEW, { org: 'freezone_test', uid: 'OWNER1', isMaster: false });
    const blocked = await R.sandbox.testOrgBlockedIfNotMaster('OWNER1');
    await wait();
    ck('_test + 업체 계정 → 막혔나', blocked, true);
    ck('   admins/{uid} 를 읽어 판정했나', R.reads.join(','), 'admins/OWNER1');
    ck('   안내 화면이 떴나', blockedUp(R), true);
    ck('   signOut 했나', R.signOuts.length, 1);
    const el = R.byId['testorg-blocked'];
    ck('   문구', /테스트 공간은 관리자 전용이에요/.test(el.innerHTML), true);
    ck('   안내 한 줄', /자기 업체 주소로 들어가 주세요/.test(el.innerHTML), true);
  }
  {
    const R = boot(NEW, { org: 'freezone_test', uid: 'MASTER', isMaster: true });
    const blocked = await R.sandbox.testOrgBlockedIfNotMaster('MASTER');
    ck('_test + 마스터 → 통과', blocked, false);
    ck('   안내 화면 안 뜸', blockedUp(R), false);
    ck('   signOut 안 함', R.signOuts.length, 0);
  }
  {
    const R = boot(NEW, { org: 'academy_abc123', uid: 'OWNER1', isMaster: false });
    const blocked = await R.sandbox.testOrgBlockedIfNotMaster('OWNER1');
    ck('실업체 주소 → 그냥 통과 (admins 읽지도 않음)', blocked, false);
    ck('   읽기 0건', R.reads.length, 0);
  }
  {
    const R = boot(NEW, { org: 'academy_demo', uid: 'X', isMaster: false });
    ck('_demo 주소 → 통과 (둘러보기 그대로)', await R.sandbox.testOrgBlockedIfNotMaster('X'), false);
  }
  {
    /* admins 읽기가 터지면 막는 쪽(안전)으로 */
    const R = boot(NEW, { org: 'freezone_test', uid: 'U9', isMaster: false });
    R.win._firestore.getDoc = () => Promise.reject(new Error('permission-denied'));
    ck('admins 읽기 실패 → 막는다(안전한 쪽)', await R.sandbox.testOrgBlockedIfNotMaster('U9'), true);
  }
  {
    /* 로그인 유지 표시를 지우나 — 다음 접속에 또 들어가려 하지 않게 */
    const R = boot(NEW, { org: 'freezone_test', uid: 'OWNER1', isMaster: false, keep: 'admin' });
    ck('막기 전 로그인 유지 표시', R.store['tkd_keeplogin_freezone_test'], 'admin');
    await R.sandbox.testOrgBlockedIfNotMaster('OWNER1');
    ck('   막은 뒤 표시가 지워졌나', R.store['tkd_keeplogin_freezone_test'] === undefined, true);
  }

  console.log('\n════ 3. 게이트가 로그인 흐름의 **맞는 자리**에 있나 (소스 순서) ════');
  {
    /* 순서를 재기 전에 **주석을 걷어낸다.**
       주석에 함수 이름을 적어 두면 그 위치가 먼저 잡혀 거짓 실패가 난다
       (실제로 isAccountApproved·getTrialStatus 를 주석에 적어 두어 그랬다). */
    const BLOCK = new RegExp('/\\*[\\s\\S]*?\\*/', 'g');
    const LINE  = new RegExp('^\\s*//');
    const NL    = String.fromCharCode(10);
    const noComment = (t) => t.replace(BLOCK, '')
      .split(NL).filter(l => !LINE.test(l)).join(NL);
    const seg = (src, from, to) => {
      const i = src.indexOf(from), j = src.indexOf(to, i);
      return (i < 0 || j < 0) ? '' : noComment(src.slice(i, j));
    };
    const la = seg(NEW, 'function loginAdmin()', 'function onAdminLoggedIn()');
    ck('loginAdmin: 기사 분기가 게이트보다 먼저',
      la.indexOf('window._isDriverAcct') < la.indexOf('testOrgBlockedIfNotMaster'), true);
    ck('loginAdmin: 게이트가 승인 검사보다 먼저',
      la.indexOf('testOrgBlockedIfNotMaster') < la.indexOf('isAccountApproved'), true);
    ck('loginAdmin: 게이트가 만료 검사보다 먼저',
      la.indexOf('testOrgBlockedIfNotMaster') < la.indexOf('getTrialStatus'), true);
    ck('loginAdmin: 게이트가 로그인유지 저장보다 먼저',
      la.indexOf('testOrgBlockedIfNotMaster') < la.indexOf("keepLoginKey(),'admin'"), true);
    const ta = seg(NEW, 'function tryAutoLogin()', 'function autoLoginFailed()');
    ck('tryAutoLogin: 기사 분기가 먼저',
      ta.indexOf('window._isDriverAcct') < ta.indexOf('testOrgBlockedIfNotMaster'), true);
    ck('tryAutoLogin: 게이트가 승인 검사보다 먼저',
      ta.indexOf('testOrgBlockedIfNotMaster') < ta.indexOf('isAccountApproved'), true);
    ck('tryAutoLogin: 막히면 로그인 화면으로',
      /if\(blocked\)\{ autoLoginFailed\(\); return; \}/.test(ta), true);
    ck('두 곳에만 들어갔나 (정의 1 + 호출 2)',
      (NEW.match(/testOrgBlockedIfNotMaster\(/g) || []).length, 3);
  }

  console.log('\n════ 4. 마스터 「🚪 나가기」 ════');
  {
    const R = boot(NEW, { org: 'admin', uid: 'MASTER', isMaster: true, keep: 'admin' });
    R.sandbox.masterCompanies = []; R.sandbox.signupUsers = []; R.sandbox.masterInquiries = [];
    R.sandbox.drawMasterPanel();
    const h = R.byId['master-root'].innerHTML || '';
    ck('단추가 패널 상단에 있나', /onclick="masterLogout\(\)"[^>]*>🚪 나가기</.test(h), true);
    ck('   v252 에는 없던 단추', /masterLogout/.test(OLD), false);
    ck('   제목 줄 안에 있나 (총 N개 옆)',
      h.indexOf('masterLogout') > h.indexOf('🏢 업체 관리')
      && h.indexOf('masterLogout') < h.indexOf('입금 계좌 안내'), true);
    /* 확인 칸 → 실제 나가기 */
    R.sandbox.masterLogout();
    const h2 = R.byId['master-root'].innerHTML || '';
    ck('확인 칸이 붙었나', /id="mlo-confirm"/.test(h2), true);
    ck('   문구', /관리자 로그인 화면으로 돌아갑니다/.test(h2), true);
    ck('   「네, 나갑니다」 단추', /onclick="masterLogoutGo\(\)"/.test(h2), true);
    ck('   「취소」 단추가 확인 칸만 지우나',
      h2.indexOf("getElementById('mlo-confirm');if(b)b.remove();") >= 0, true);
    R.sandbox.masterLogoutGo();
    await wait(); await wait();
    ck('signOut 했나', R.signOuts.length, 1);
    ck('   로그인 유지 표시 지웠나', R.store['tkd_keeplogin_admin'] === undefined, true);
    ck('   ?org=admin 으로 다시 들어가나', R.replaced.join(','), '?org=admin');
  }
  {
    /* ★ 기존 logout() 을 쓰지 않는다 — 마스터 화면에는 login-screen 이 없어 깨진다 */
    const body = NEW.slice(NEW.indexOf('function masterLogout()'), NEW.indexOf('function deleteInquiry'));
    ck('masterLogout 이 logout() 을 부르지 않나', /\blogout\(\)/.test(body), false);
    /* ★ v254 가 지시문대로 logout() 에 `_drvErr=false;` 한 조각을 더했다.
       그래서 「바이트 동일」은 더 이상 맞지 않다. 이 묶음이 지켜야 할 것은
       「masterLogout 을 만들면서 기존 logout() 을 망가뜨리지 않았나」이므로,
       **그 한 조각을 빼면 같은가**로 바꾼다. */
    /* ★ 고정 길이로 자르면 안 된다 — 15자가 더해져 창이 밀려 꼬리가 어긋난다(실제로 겪었다).
       logout 은 한 줄 함수이므로 **끝 표시까지** 자른다. */
    const logoutOf = (src) => {
      const i = src.indexOf('function logout(){');
      const end = src.indexOf('if(k)k.checked=false;}', i);
      return src.slice(i, end + 'if(k)k.checked=false;}'.length);
    };
    /* v255: 「기사 계정」 칸을 없애면서 logout 이 비우던 조각도 바뀌었다
       (_drvList·_drvLoaded·_drvErr → _drvInfo·_drvInfoLoaded·_drvInfoErr·업체번호 3개).
       이 묶음이 지켜야 할 것은 **그 조각을 뺀 나머지가 그대로인가** 다. */
    const STRIP = /_drv(List=\{\}|Info=\{\}|Loaded=false|InfoLoaded=false|Err=false|InfoErr=false);|_orgCode(Err|Asked)?=(''|false);/g;
    /* ★★ 코스로드41: v281~v282(43-B·43-C)가 logout 에 **리스너 떼기**와
       도우미 표시 비우기를 더했다(도우미가 나간 뒤 관리자 화면에서 리스너가 깨어나
       명단을 밀어 버리는 것을 막은 자리). 이 묶음이 지킬 것은 여전히
       「그 조각들을 민 나머지가 그대로인가」다 — 그래서 민 목록에 넷을 더했다.
       주석·공백은 먼저 지우고 본다(여러 줄로 적혀 있다). */
    const norm = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '');
    /* ★ 정규식이 아니라 **글자 그대로** 뺀다 — 정규식 escape 를 문자열에 적다가
       한 겹이 사라져 안 맞았다(처음에 그렇게 짰다). 읽기도 이쪽이 쉽다. */
    const ADDED43 = [
      "try{if(window._helperCarUnsub){window._helperCarUnsub();window._helperCarUnsub=null;}}catch(e){}",
      "try{(_carDocUnsub||[]).forEach(function(fn){try{if(typeoffn==='function')fn();}catch(e){}});_carDocUnsub=[];}catch(e){}",
      "window._isHelperAcct=false;",
      "window._driverStaffId='';"
    ];
    const strip43 = (s) => ADDED43.reduce((a, x) => a.split(x).join(''), s);
    ck('기존 logout() 이 그대로인가 (기사·도우미 조각만 다름)',
      strip43(norm(logoutOf(NEW)).replace(STRIP, ''))
        === norm(logoutOf(OLD)).replace(STRIP, ''), true);
    ck('   43-B·43-C 가 더한 조각 넷이 다 있나(리스너 둘·도우미 표시 둘)',
      ADDED43.filter((x) => norm(logoutOf(NEW)).indexOf(x) >= 0).length, 4);
    ck('   v255 는 _drvInfo* 와 업체번호를 비운다',
      /_drvInfo=\{\};_drvInfoLoaded=false;_drvInfoErr=false;_orgCode='';_orgCodeErr=false;_orgCodeAsked=false;/.test(logoutOf(NEW)), true);
    ck('   없어진 변수(_drvList·_drvErr)를 더 건드리지 않는다',
      /_drvList|_drvErr=/.test(logoutOf(NEW)), false);
    /* signOut 이 실패해도 나가지나 */
    const R = boot(NEW, { org: 'admin', uid: 'MASTER', isMaster: true });
    R.win._authFns.signOut = () => Promise.reject(new Error('x'));
    R.sandbox.masterLogoutGo();
    await wait(); await wait();
    ck('signOut 실패해도 나가진다', R.replaced.join(','), '?org=admin');
  }

  console.log('\n════ 5. 문의함 완료 건 🗑 삭제 ════');
  {
    const R = boot(NEW, { org: 'admin', uid: 'MASTER', isMaster: true });
    R.sandbox.masterCompanies = []; R.sandbox.signupUsers = [];
    R.sandbox.masterInquiries = [
      { _id: 'q1', status: 'new',     orgName: '가', text: 'a', date: '2026-10-30', contact: '010-1' },
      { _id: 'q2', status: 'working', orgName: '나', text: 'b', date: '2026-10-30', contact: '010-2' },
      { _id: 'q3', status: 'done',    orgName: '다', text: 'c', date: '2026-10-30', contact: '010-3' },
      { _id: 'q4', status: 'done',    orgName: '라', text: 'd', date: '2026-10-30', contact: '010-4' }
    ];
    R.sandbox.drawMasterPanel();
    const h = R.byId['master-root'].innerHTML || '';
    ck('🗑 단추는 완료 2건에만', (h.match(/deleteInquiry\(/g) || []).length, 2);
    ck('   q3·q4 를 가리키나',
      /deleteInquiry\(&quot;q3&quot;\)/.test(h) && /deleteInquiry\(&quot;q4&quot;\)/.test(h), true);
    ck('   신규·처리중에는 없나',
      /deleteInquiry\(&quot;q1&quot;\)/.test(h) || /deleteInquiry\(&quot;q2&quot;\)/.test(h), false);
    ck('   상태 바꾸기 단추는 4건 모두 그대로', (h.match(/setInquiryStatus\(/g) || []).length, 4);
    const a = D.audit(h);
    ck('   주입된 속성 0', a.injectedAttrs.length, 0);
    ck('   핸들러 실행 중 alert 0', a.alerted, 0);
    ck('   핸들러가 실제로 돌았나', a.ran > 0, true);
  }
  {
    /* 따옴표가 든 문의 id·업체명도 안전한가 */
    const R = boot(NEW, { org: 'admin', uid: 'MASTER', isMaster: true });
    R.sandbox.masterCompanies = []; R.sandbox.signupUsers = [];
    const nasty = '"><img src=x onerror=alert(1)>';
    R.sandbox.masterInquiries = [{ _id: nasty, status: 'done', orgName: nasty, text: nasty,
                                   date: '2026-10-30', contact: nasty }];
    R.sandbox.drawMasterPanel();
    const h = R.byId['master-root'].innerHTML || '';
    const a = D.audit(h);
    ck('따옴표 공격 — 주입된 속성 0', a.injectedAttrs.length, 0);
    ck('   살아있는 태그 0', a.liveTags, 0);
    ck('   alert 0', a.alerted, 0);
    ck('   문법 오류 0', a.errors.length, 0);
    const call = a.calls.find(c => c[0] === 'deleteInquiry');
    ck('   deleteInquiry 가 원본 id 를 인자로 받나', call && call[1], nasty);
  }
  {
    /* 실제 삭제 호출 — 확인 → deleteDoc → 목록 다시 → 다시 그리기 */
    const R = boot(NEW, { org: 'admin', uid: 'MASTER', isMaster: true });
    R.sandbox.masterCompanies = []; R.sandbox.signupUsers = [];
    R.sandbox.masterInquiries = [{ _id: 'q9', status: 'done', orgName: '마', contact: '010-9', text: 'x', date: '2026-10-30' }];
    R.win.confirm = R.sandbox.confirm = () => true;
    await R.sandbox.deleteInquiry('q9');
    await wait();
    ck('deleteDoc 경로', R.deleted.join(','), 'inquiries/q9');
    ck('   알림 문구', /문의를 삭제했습니다/.test(R.alerts.join('\n')), true);
    /* 취소하면 아무 일도 없다 */
    const R2 = boot(NEW, { org: 'admin', uid: 'MASTER', isMaster: true });
    R2.sandbox.masterInquiries = [{ _id: 'q9', status: 'done' }];
    R2.win.confirm = R2.sandbox.confirm = () => false;
    await R2.sandbox.deleteInquiry('q9');
    ck('취소하면 지우지 않는다', R2.deleted.length, 0);
    /* 규칙 미게시 안내 */
    const R3 = boot(NEW, { org: 'admin', uid: 'MASTER', isMaster: true });
    R3.sandbox.masterInquiries = [{ _id: 'q9', status: 'done' }];
    R3.win.confirm = R3.sandbox.confirm = () => true;
    R3.win._firestore.deleteDoc = () => { const e = new Error('x'); e.code = 'permission-denied'; return Promise.reject(e); };
    await R3.sandbox.deleteInquiry('q9');
    await wait();
    ck('permission-denied → 규칙 미게시 안내', /규칙이 아직 게시되지 않았어요/.test(R3.alerts.join('\n')), true);
  }

  console.log('\n════ 6. 버전·문답표 ════');
  {
    const fs = require('fs');
    /* ★ 숫자를 못 박지 않는다 — 회차가 지나면 올라간다(v253 → v254).
       지켜야 할 것은 **version.json 과 APP_VERSION 이 같은가** 다. */
    const _vj2 = JSON.parse(fs.readFileSync('' + COS_ROOT + '/version.json', 'utf8')).version;
    const _av2 = Number(/const APP_VERSION = (\d+);/.exec(NEW)[1]);
    ck('version.json 과 APP_VERSION 이 같은 숫자 (' + _av2 + ')', _vj2, _av2);
    const qaOld = require('./qa252.js').read(OLD);
    const qaNew = require('./qa252.js').read(NEW);
    /* v253 회차는 문답을 손대지 않았다. v255 에서 기사 로그인 문답을 **일부러** 늘렸으므로
       「그대로」를 못 박지 않고, 이 회차가 지키려던 것만 본다 —
       즉 _test 를 안내하는 문답이 생기지 않았는가(아래). 늘어난 수는 적어 둔다. */
    console.log('      문답 수: v252 ' + qaOld.length + ' → 지금 ' + qaNew.length
      + ' (v255 기사 로그인 문답 추가)');
    ck('문답이 줄지는 않았다', qaNew.length >= qaOld.length, true);
    ck('   _test 를 안내하는 문답 0개 (그래서 손댈 것이 없다)',
      qaNew.filter(q => /_test|테스트 공간|테스트 기관/.test(q.t + q.a + q.keys.join(','))).length, 0);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
})().catch(e => { console.log('오류: ' + e.message); console.log(e.stack.split('\n').slice(0, 6).join('\n')); });
