/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ① v253 보정3 — 마스터 목록 중복(동시 2회) · ③ 가입자 줄 구분 정보 */
const cp = require('child_process');
const E = require('./env246.js');
const D = require('./detect.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + label.padEnd(56) + String(got).slice(0, 62)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const BASE = process.env.COS_SRC_OLD_REF || '318e25b';   // 보정3 **전**
const OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':index.html', { maxBuffer: 1 << 28 }).toString();
const NEW = E.SRC_NEW;

/* 서버에 들어 있다고 할 문서들 */
const USERS = [
  { id: 'Uaaaaaaaaaaaa111111', d: { orgName: '가온학원', bizType: 'academy', approved: true,
      signupMethod: 'phone', phone: '01011112222', createdAt: Date.UTC(2026, 8, 3, 1, 0) } },
  { id: 'Ubbbbbbbbbbbb222222', d: { orgName: '가온학원', bizType: 'academy', approved: true,
      signupMethod: 'email', email: 'gaon2@x.com', createdAt: Date.UTC(2026, 9, 11, 1, 0) } },
  { id: 'Ucccccccccccc333333', d: { orgName: '대기물류', bizType: 'logistics', approved: false,
      signupMethod: 'phone', phone: '01033334444', createdAt: Date.UTC(2026, 9, 28, 1, 0) } },
  { id: 'Udddddddddddd444444', d: { orgName: '', bizType: 'public', approved: false, createdAt: 0 } },
  { id: 'Ueeeeeeeeeeee555555', d: { role: 'driver', driverOrg: 'freezone_test', ownerUid: 'M' } }
];
const INQ = [
  { id: 'q1', d: { orgName: '가온학원', text: 'a', date: '2026-10-28', status: 'new', contact: '010-1' } },
  { id: 'q2', d: { orgName: '대기물류', text: 'b', date: '2026-10-29', status: 'done', contact: '010-2' } },
  { id: 'q3', d: { orgName: '가온학원', text: 'c', date: '2026-10-30', status: 'working', contact: '010-3' } }
];

/* 읽기마다 **양보**하도록 만든다 — 그래야 두 판이 실제로 끼어든다 */
const tick = () => new Promise(r => setImmediate(r));

function boot(src) {
  const R = E.build({ src: src, biz: 'academy' });
  if (R.error) throw R.error;
  R.win.location.search = '?org=admin';
  R.sandbox.location.search = '?org=admin';
  ['master-root', 'login-screen', 'main-app'].forEach(id => {
    const el = E.makeEl('div'); el.id = id;
    el.classList = { add(){}, remove(){}, toggle(){} };
    R.document.registerId(id, el);
  });
  R.win._firestore = R.sandbox._firestore = {
    doc: (db, ...p) => ({ _p: p.join('/') }),
    getDoc: async (ref) => { await tick(); return { exists: () => false, data: () => ({}) }; },
    setDoc: async () => {},
    deleteDoc: async () => {},
    collection: (db, name) => ({ _c: name }),
    getDocs: async (c) => {
      await tick(); await tick();            // 읽는 데 시간이 걸린다 = 두 판이 겹친다
      const rows = (c._c === 'users') ? USERS : (c._c === 'inquiries' ? INQ : []);
      return { forEach: (f) => rows.forEach(r => f({ id: r.id, data: () => JSON.parse(JSON.stringify(r.d)) })) };
    }
  };
  R.win._db = R.sandbox._db = {};
  R.win._auth = R.sandbox._auth = { currentUser: { uid: 'MASTER', isAnonymous: false } };
  return R;
}

(async () => {
  console.log('════ 1. renderMasterPanel 을 **동시에 2번** (전/후) ════');
  for (const [name, src] of [['보정3 전', OLD], ['보정3 후', NEW]]) {
    const R = boot(src);
    await Promise.all([R.sandbox.renderMasterPanel(), R.sandbox.renderMasterPanel()]);
    for (let i = 0; i < 8; i++) await tick();
    const su = R.ev('signupUsers'), mi = R.ev('masterInquiries');
    console.log('  [' + name + '] signupUsers ' + su.length + '개 / masterInquiries ' + mi.length + '개'
      + ' (실제 문서 ' + USERS.length + ' / ' + INQ.length + ')');
    if (src === OLD) {
      ck('   전: 가입자가 2배로 쌓였나', su.length, USERS.length * 2);
      ck('   전: 문의도 2배', mi.length, INQ.length * 2);
      const ids = su.map(x => x._uid);
      ck('   전: 같은 uid 가 두 번', ids.filter(x => x === USERS[0].id).length, 2);
    } else {
      ck('   후: 가입자 수 = 실제 문서 수', su.length, USERS.length);
      ck('   후: 문의 수 = 실제 문서 수', mi.length, INQ.length);
      ck('   후: 중복 uid 0', su.length - new Set(su.map(x => x._uid)).size, 0);
      ck('   후: 중복 문의 id 0', mi.length - new Set(mi.map(x => x._id)).size, 0);
    }
  }
  console.log('\n════ 2. 세 번·네 번 겹쳐도 (후) ════');
  {
    const R = boot(NEW);
    await Promise.all([R.sandbox.renderMasterPanel(), R.sandbox.renderMasterPanel(),
                       R.sandbox.renderMasterPanel(), R.sandbox.renderMasterPanel()]);
    for (let i = 0; i < 10; i++) await tick();
    ck('4번 겹쳐도 가입자 5개', R.ev('signupUsers').length, USERS.length);
    ck('   문의 3개', R.ev('masterInquiries').length, INQ.length);
    ck('   순번 4까지 올랐나', R.ev('_mpSeq'), 4);
  }
  console.log('\n════ 3. showMasterGate 두 번 경로 그대로인가 (지시문 1-c) ════');
  {
    ck('호출 자리 2곳 그대로', (NEW.match(/showMasterGate\(\);/g) || []).length, 2);
    ck('   보정3 전과 같은 수', (NEW.match(/showMasterGate\(\);/g) || []).length,
      (OLD.match(/showMasterGate\(\);/g) || []).length);
    ck('initApp 쪽 그대로', /function initApp\(\)\{\n  \/\/ 마스터\(전체 관리자\) 모드: \?org=admin 이면 업체 관리 화면\n  if\(getUrlOrg\(\)==='admin'\)\{\n    showMasterGate\(\);/.test(NEW), true);
  }
  console.log('\n════ 4. 늦게 시작한 판만 그리나 ════');
  {
    const R = boot(NEW);
    let draws = 0;
    const real = R.sandbox.drawMasterPanel;
    R.sandbox.drawMasterPanel = function () { draws++; return real.apply(this, arguments); };
    R.win.drawMasterPanel = R.sandbox.drawMasterPanel;
    await Promise.all([R.sandbox.renderMasterPanel(), R.sandbox.renderMasterPanel()]);
    for (let i = 0; i < 10; i++) await tick();
    ck('동시 2번 → 실제로 그린 횟수 1회', draws, 1);
  }
  {
    const R = boot(OLD);
    let draws = 0;
    const real = R.sandbox.drawMasterPanel;
    R.sandbox.drawMasterPanel = function () { draws++; return real.apply(this, arguments); };
    R.win.drawMasterPanel = R.sandbox.drawMasterPanel;
    await Promise.all([R.sandbox.renderMasterPanel(), R.sandbox.renderMasterPanel()]);
    for (let i = 0; i < 10; i++) await tick();
    ck('(전) 동시 2번 → 두 번 그렸다', draws, 2);
  }

  console.log('\n════ 5. 가입자 줄 구분 정보 ════');
  {
    const R = boot(NEW);
    await R.sandbox.renderMasterPanel();
    for (let i = 0; i < 8; i++) await tick();
    const h = R.byId['master-root'].innerHTML || '';
    /* ★ 여기서 **기존 문제**를 하나 찾았다 (보정3 범위 아님 — 보고만 한다):
       pending 은 signupUsers.filter(u => u.approved!==true) 인데, **기사 문서에는
       approved 가 없다**(api/admin-account createDriver 가 role·driverOrg·ownerUid·carId·
       name·phone·createdAt 만 넣는다). 그래서 기사 계정이 「승인 대기」 줄로 섞여 나온다.
       → 승인 2 + 대기 3(대기물류 · 이름없음 · **기사**) = setUserApproval 단추 5개.
       v250(기사 계정 도입) 이후 줄곧 그랬다. 아래에서 「전」에도 같은지 확인한다. */
    /* ★ 2026-10-31(보정4)에 **고쳤다.** 그때는 기사 문서가 대기로 섞여 단추가 5개였고,
       이 묶음은 그 사실을 기록해 두었다. 보정4 가 pending 필터에 role!=='driver' 를 넣어
       승인 2 + 대기 2 = 4개가 되었다. 자세한 전/후는 e_drv253d.js 에 있다. */
    /* v263: 승인·승인취소가 서버로 갔다 — setUserApproval → masterApproveAsk(대기) ·
       masterUnapproveAsk(승인됨). 이 표의 뜻은 「줄 수가 2+2 인가」이므로 두 이름을 함께 센다. */
    ck('승인 2 + 대기 2 = 단추 4개 (보정4에서 기사 제외)',
      (h.match(/masterApproveAsk\(|masterUnapproveAsk\(/g) || []).length, 4);
    ck('휴대폰 아이디 전체 표시 (가리지 않음)', h.indexOf('01011112222') >= 0, true);
    ck('이메일 아이디 표시', h.indexOf('gaon2@x.com') >= 0, true);
    ck('대기 업체 번호 표시', h.indexOf('01033334444') >= 0, true);
    ck('가입일 YYYY-MM-DD (localDateStr)', /가입 2026-09-03/.test(h), true);
    ck('   둘째 업체 가입일', /가입 2026-10-11/.test(h), true);
    ck('   createdAt 0 이면 —', /가입 —/.test(h), true);
    ck('uid 끝 6자리', /uid …111111/.test(h) && /uid …222222/.test(h), true);
    ck('   아이디 없는 줄은 —', />—<\/span>/.test(h) || h.indexOf('>—</span>') >= 0, true);
    ck('같은 이름 ⚠ 표시가 2줄에만', (h.match(/⚠ 같은 이름/g) || []).length, 2);
    ck('   다른 이름 줄에는 없다', h.indexOf('대기물류') >= 0 && (h.match(/⚠ 같은 이름/g) || []).length === 2, true);
    /* 기사 줄 — 보정4 에서 **빠졌다**(그 전에는 그려졌다) */
    ck('기사 문서가 목록에 없다 (보정4)', /uid …555555/.test(h), false);
    ck('   「🗑 신청 삭제」 단추도 안 붙는다', /deleteSignupUser\(&quot;Ueeeeeeeeeeee555555&quot;/.test(h), false);
    ck('🧪 단추와 함께 보이나 (승인 업체 2줄)', (h.match(/masterTestAccessAsk\(/g) || []).length, 2);
    ck('   옛 toLocaleDateString 꼴이 사라졌나', /가입 2026\. /.test(h), false);
  }
  {
    /* 🧪 켜진 줄에서 배지와 구분 정보가 함께 나오나 */
    const R = boot(NEW);
    R.sandbox.masterCompanies = []; R.sandbox.masterInquiries = [];
    R.sandbox.signupUsers = [{ _uid: 'Uzzzzzzzzzzzz999999', orgName: '테스트업체', bizType: 'academy',
      approved: true, signupMethod: 'phone', phone: '01099998888',
      createdAt: Date.UTC(2026, 9, 30, 1, 0), testAccess: true }];
    R.sandbox.drawMasterPanel();
    const h = R.byId['master-root'].innerHTML || '';
    ck('배지 🧪 테스트 허용', /🧪 테스트 허용/.test(h), true);
    ck('   구분 정보도 함께', h.indexOf('01099998888') >= 0 && /uid …999999/.test(h), true);
    ck('   배지가 구분 정보보다 앞', h.indexOf('🧪 테스트 허용') < h.indexOf('01099998888'), true);
  }

  console.log('\n════ 5-b. 기사 줄 섞임이 **보정3 전에도** 있었나 (기존 문제 확인) ════');
  {
    const R = boot(OLD);
    await R.sandbox.renderMasterPanel();
    for (let i = 0; i < 10; i++) await tick();
    const h = R.byId['master-root'].innerHTML || '';
    ck('보정3 전에도 기사 줄이 대기로 나온다',
      /deleteSignupUser\(&quot;Ueeeeeeeeeeee555555&quot;/.test(h), true);
    console.log('      → 보정3 이 만든 문제가 아니다. v250(기사 계정 도입) 이후 줄곧 그랬다.');
    console.log('      → 고치려면 pending 필터에 u.role!==\'driver\' 한 줄. 지시문 밖이라 손대지 않았다.');
  }

  console.log('\n════ 6. 따옴표가 든 값 escape ════');
  {
    const nasty = '"><img src=x onerror=alert(1)>';
    const R = boot(NEW);
    R.sandbox.masterCompanies = []; R.sandbox.masterInquiries = [];
    R.sandbox.signupUsers = [
      { _uid: nasty, orgName: nasty, bizType: 'academy', approved: true, phone: nasty,
        email: nasty, createdAt: Date.UTC(2026, 9, 30, 1, 0), testAccess: true },
      { _uid: nasty + '2', orgName: nasty, bizType: 'academy', approved: false, phone: nasty,
        createdAt: Date.UTC(2026, 9, 30, 1, 0) }
    ];
    R.sandbox.drawMasterPanel();
    const h = R.byId['master-root'].innerHTML || '';
    const a = D.audit(h);
    ck('주입된 속성 0', a.injectedAttrs.length, 0);
    ck('   살아있는 태그 0', a.liveTags, 0);
    ck('   alert 0', a.alerted, 0);
    ck('   핸들러가 실제로 돌았나', a.ran > 0, true);
    ck('   문법 오류 0', a.errors.length, 0);
    ck('⚠ 같은 이름 표시 2줄 (업체명이 같다)', (h.match(/⚠ 같은 이름/g) || []).length, 2);
  }

  console.log('\n════ 7. helper 함수 단위 ════');
  {
    const R = boot(NEW);
    const ev = (ex) => R.ev(ex);
    ck("masterLoginId 번호 우선", ev("masterLoginId({phone:'01011112222',email:'a@b.c'})"), '01011112222');
    ck("   번호 없으면 이메일", ev("masterLoginId({email:'a@b.c'})"), 'a@b.c');
    ck("   둘 다 없으면 —", ev("masterLoginId({})"), '—');
    ck("   u 가 없으면 —", ev("masterLoginId(null)"), '—');
    ck("masterJoinDate", ev("masterJoinDate({createdAt:Date.UTC(2026,8,3,1,0)})"), '2026-09-03');
    ck("   0 이면 —", ev("masterJoinDate({createdAt:0})"), '—');
    ck("   없으면 —", ev("masterJoinDate({})"), '—');
    ck("masterUidTail", ev("masterUidTail({_uid:'Uaaaaaaaaaaaa111111'})"), '111111');
    ck("   짧은 uid 는 그대로", ev("masterUidTail({_uid:'abc'})"), 'abc');
    ck("   없으면 —", ev("masterUidTail({})"), '—');
    ck("masterDupName 같은 이름 둘", ev("masterDupName({orgName:'가'},[{orgName:'가'},{orgName:'가'}])"), true);
    ck("   하나면 false", ev("masterDupName({orgName:'가'},[{orgName:'가'},{orgName:'나'}])"), false);
    ck("   빈 이름은 false", ev("masterDupName({orgName:''},[{orgName:''},{orgName:''}])"), false);
    ck("   앞뒤 공백 무시", ev("masterDupName({orgName:' 가 '},[{orgName:'가'},{orgName:' 가'}])"), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
})().catch(e => { console.log('오류: ' + e.message); console.log(e.stack.split('\n').slice(0, 6).join('\n')); });
