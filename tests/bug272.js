/* v272 자체 점검 — 요약 문서(orgDriver)를 넣으면서 **관리자 자료가 깎이지 않나**.
   ★ 이 묶음은 v272 작업 중 **실제로 두 가지 결함을 잡았다**(둘 다 커밋 전에 고쳤다):
     ① 관리자에게 `org`·`orgDriver` 리스너가 **둘 다** 붙어, orgDriver 스냅샷이
        나중에 오면 orgSettings 가 13칸 → **7칸으로 깎였다**(계좌·도장·사업자번호·
        대표자·보험요율·발신번호 소실). localStorage 의 tkd_org 까지 깎였고,
        그 뒤 업체 설정을 저장하면 **서버 org 까지 덮여 영구 손실**이 될 자리였다.
     ② 요약 만들기(bootstrap)가 둘러보기·읽기 전용에서도 saveToFirebase 를 불러
        **들어오자마자 안내가 떴다**(데모=토스트 · 읽기 전용=alert 창 + 재동기화).
   ★ orgSettings·currentMode 는 `let` 이다 — sandbox 객체에 **안 붙는다**.
     S.currentMode='driver' 로는 앱 안의 값이 안 바뀐다(처음에 그렇게 써서 헛돌았다).
     env246 의 ev() 로 **컨텍스트 안에서** 넣고 읽는다. */
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 70)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const ORG_FULL = { name: '가온학원', icon: '🚐', bizType: 'academy', destName: '학원',
  destLat: 37.4467, destLon: 126.6516, tel: '032-111-2222',
  bankAccount: '농협 301-0354-8212-31', stamp: 'data:image/png;base64,DOJANG',
  bizNo: '635-88-02710', ceo: '문준식', insRates: { np: 4.5 }, senderPhone: '010-1' };
const ORG_DRV = { name: '가온학원', icon: '🚐', bizType: 'academy', destName: '학원',
  destLat: 37.4467, destLon: 126.6516, tel: '032-111-2222' };
const SECRET7 = ['bankAccount', 'stamp', 'bizNo', 'ceo', 'insRates', 'senderPhone'];
const DOCS = { org: ORG_FULL, orgDriver: ORG_DRV };

function boot(startOrg) {
  const R = E.build({ src: E.SRC_NEW, biz: 'academy',
    localStorage: { 'tkd_org__cosroad_default': JSON.stringify(startOrg || ORG_FULL) } });
  if (R.error) throw R.error;
  /* 리스너 핸들러가 renderByTab 까지 가므로 화면 칸을 만들어 둔다 */
  ['admin-content', 'app-content', 'drive-tabs', 'main-header', 'member-screen', 'member-list',
   'member-add-area', 'filter-chips', 'search-input', 'day-tabs', 'header-btns', 'mode-badge',
   'drive-screen', 'admin-screen', 'bottom-action', 'today-date', 'org-name-display', 'org-icon',
   'login-screen', 'main-app', 'demo-enter-box', 'helper-btn', 'fb-loading',
   'sort-asc-btn', 'sort-desc-btn'].forEach((id) => {
    const el = E.makeEl('div'); el.id = id; R.byId[id] = el;
  });
  return R;
}

/* 가짜 Firestore — 쓴 키를 모으고, 리스너는 내가 원할 때 흘려 보낸다 */
function fakeDb(R, subs, wrote, has) {
  const S = R.sandbox;
  S._firestore = R.win._firestore = {
    doc: (db, c1, org, c2, key) => ({ key: key }), collection: () => ({}),
    getDoc: async (ref) => ({
      exists: () => (has ? has(ref.key) : DOCS[ref.key] !== undefined),
      data: () => ({ value: JSON.stringify(DOCS[ref.key]) }) }),
    setDoc: async (ref) => { wrote.push(ref.key); },
    deleteDoc: async () => {}, getDocs: async () => ({ forEach: () => {} }),
    onSnapshot: (ref, cb) => { subs.push({ key: ref.key, cb: cb }); return () => {}; }
  };
  S._db = R.win._db = {};
}

/* 리스너를 붙이고, 내가 정한 순서로 스냅샷을 흘려 보낸다 */
function listen(mode, order) {
  const R = boot();
  const S = R.sandbox;
  R.ev("currentMode=" + JSON.stringify(mode) + ";");
  R.ev("orgSettings=" + JSON.stringify(ORG_FULL) + ";");
  S._userUid = 'OWNER1'; S._userOrgId = 'cosroad_default';
  S._isDriverAcct = (mode === 'driver'); S._driverCarId = 'car1';
  const subs = [], wrote = [];
  fakeDb(R, subs, wrote);
  S.startFirebaseListeners();
  /* 핸들러는 값을 넣은 **뒤** 화면을 다시 그린다. 스텁에 classList 가 없어
     다시 그리다가 터지는데, 우리가 보려는 것은 **값**이라 삼킨다. */
  (order || []).forEach((k) => {
    subs.filter((s) => s.key === k).forEach((s) => {
      try { s.cb({ exists: () => true, data: () => ({ value: JSON.stringify(DOCS[k]) }) }); }
      catch (e) {}
    });
  });
  return { attached: subs.map((s) => s.key), org: R.ev('orgSettings'),
           ls: JSON.parse(R.store['tkd_org__cosroad_default'] || '{}') };
}

/* 동기화를 끝까지 돌린다 */
async function sync(setup, startOrg, has) {
  const R = boot(startOrg);
  const S = R.sandbox;
  R.ev("currentMode='admin';");
  S._userUid = 'OWNER1'; S._userOrgId = 'cosroad_default'; S._isDriverAcct = false;
  if (setup) setup(R, S);
  const wrote = [];
  fakeDb(R, [], wrote, has);
  await R.ev('syncFromFirebase()');
  return { R: R, wrote: wrote, org: R.ev('orgSettings'),
           ls: JSON.parse(R.store['tkd_org__cosroad_default'] || '{}') };
}

(async () => {
  console.log('════ 1. 관리자 — 리스너가 어느 키에 붙나');
  {
    const r = listen('admin', []);
    ck('org 리스너가 붙는다', r.attached.indexOf('org') >= 0, true);
    ck('orgDriver 리스너는 **안** 붙는다 (①의 고침)', r.attached.indexOf('orgDriver') < 0, true);
  }

  console.log('\n════ 2. 관리자 — orgDriver 가 나중에 와도 자료가 안 깎인다 (①)');
  {
    const r = listen('admin', ['org', 'orgDriver']);
    SECRET7.forEach((k) => ck('남아 있다 — ' + k, r.org[k] !== undefined, true));
    ck('칸 수 13', Object.keys(r.org).length, 13);
    ck('localStorage 에도 계좌가 남아 있다', r.ls.bankAccount || '(사라짐)', '농협 301-0354-8212-31');
  }

  console.log('\n════ 3. 관리자 — 순서가 반대일 때도');
  {
    const r = listen('admin', ['orgDriver', 'org']);
    ck('계좌가 남아 있다', r.org.bankAccount || '(사라짐)', '농협 301-0354-8212-31');
    ck('칸 수 13', Object.keys(r.org).length, 13);
  }

  console.log('\n════ 4. 기사 — 요약만 받는다');
  {
    const r = listen('driver', ['orgDriver']);
    ck('org 리스너는 안 붙는다', r.attached.indexOf('org') < 0, true);
    ck('orgDriver 리스너는 붙는다', r.attached.indexOf('orgDriver') >= 0, true);
    ck('orgSettings 는 일곱 칸', Object.keys(r.org).sort().join(','),
      'bizType,destLat,destLon,destName,icon,name,tel');
    ck('기사 폰에 비밀 칸 0개',
      SECRET7.filter((k) => r.org[k] !== undefined).join(',') || '없음', '없음');
  }

  /* ★ 5·6 은 **요약이 없는 상태**로 돌려야 뜻이 있다(has = org 만 있음).
     요약이 이미 있고 내용이 같으면 bootstrap 이 애초에 쓰지 않아, 고침이 없어도
     「안내 0건」이 나온다 — 처음에 그렇게 써서 **대조에서 안 잡혔다**(27/27 통과).
     없게 만들면 쓰려고 들고, 그때 고침이 있나 없나가 갈린다. */
  const ONLY_ORG = (k) => k === 'org';

  console.log('\n════ 5. 둘러보기(_demo) — 들어오자마자 안내가 뜨면 안 된다 (②)');
  {
    const r = await sync((R, S) => { S._userOrgId = 'cosroad_demo'; }, ORG_FULL, ONLY_ORG);
    ck('데모로 인식된다', r.R.ev('isDemoMode()'), true);
    ck('토스트 0건', r.R.toasts.length ? r.R.toasts.join(' | ') : '없음', '없음');
    ck('orgDriver 를 쓰려 하지 않았다', r.wrote.indexOf('orgDriver') < 0, true);
  }

  console.log('\n════ 6. 읽기 전용(기간 끝) — alert 창이 뜨면 안 된다 (②)');
  {
    const r = await sync((R) => {
      R.ev("window.isReadOnlyMode=isReadOnlyMode=function(){return true;};");
    }, ORG_FULL, ONLY_ORG);
    ck('alert 0건', r.R.alerts.length ? r.R.alerts.join(' | ').slice(0, 44) : '없음', '없음');
    ck('orgDriver 를 쓰려 하지 않았다', r.wrote.indexOf('orgDriver') < 0, true);
  }

  console.log('\n════ 7. 보통 업체 — 요약이 없으면 한 번 만들어진다');
  {
    const r = await sync(null, ORG_FULL, (k) => k === 'org');   /* orgDriver 문서 없음 */
    ck('orgDriver 를 썼다', r.wrote.indexOf('orgDriver') >= 0, true);
    ck('관리자 자료는 13칸 그대로', Object.keys(r.org).length, 13);
  }

  console.log('\n════ 8. 같은 기기: 기사 뒤에 관리자로 들어오면 계좌가 되살아나나');
  {
    /* 기사 세션이 남겨 둔 일곱 칸으로 시작한다 */
    const R0 = boot(ORG_DRV);
    ck('(먼저) 폰에 남은 칸은 일곱', Object.keys(R0.ev('loadOrgSettings()')).length, 7);
    const r = await sync(null, ORG_DRV);
    ck('관리자 orgSettings 에 계좌가 되살아났다', r.org.bankAccount || '(없음)',
      '농협 301-0354-8212-31');
    ck('칸 수 13', Object.keys(r.org).length, 13);
    ck('폰(localStorage)에도 되살아났다', r.ls.bankAccount || '(없음)', '농협 301-0354-8212-31');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ Firestore 는 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
