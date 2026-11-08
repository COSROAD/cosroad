/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v259 보정6 — 「운전자」→「기사」 통일 + 마스터 패널 「개통 대장」 정리
   전: 76224a8 (v258) · 후: 작업 중 */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 74)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const BASE = process.env.COS_SRC_OLD_REF || '76224a8';
const show = (f) => cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':' + f, { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
/* ★ v260: 이 묶음은 **v259 회차의 기록**이다. v260 이 그 회차가 손본 다섯 함수를
     (부르는 곳 0 을 확인한 뒤) 통째로 지웠으므로, 지금 코드로 돌리면 「그 함수가 없다」가 된다 —
     그게 맞는 모습이고 q_app260.js 가 본다. 이 기록이 계속 재현되도록 **그 회차의 판을 못 박는다.**
     (gate258.js · f_api254.js 와 같은 방식 — 회차 기록은 그 회차의 코드로 돌린다) */
const PIN = process.env.COS_PIN_REF || '3ce6379';
const pin = (f) => cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN + ':' + f, { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const now = (f) => pin(f);
const OLD = show('index.html'), NEW = pin('index.html');
const BIZ = ['academy', 'public', 'logistics', 'delivery'];
const LF = String.fromCharCode(10);

const SUF = '__cosroad_default';
const DAYS7 = ['월', '화', '수', '목', '금', '토', '일'];
function storeOf() {
  const st = {};
  const put = (k, v) => {
    st[k + SUF] = JSON.stringify(v);
    BIZ.forEach(o => { st[k + '__' + o + '_demo'] = JSON.stringify(v); });
  };
  put('tkd_cars', [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-5555-6666' },
                   { id: 'car2', name: '2호차', driver: '최기사', phone: '010-7777-8888' }]);
  put('tkd_members', [
    { id: 1, name: '가하은', courseId: 'c1', carId: 'car1', location: '유원아파트', lat: 37.40, lon: 126.70, phone: '010-1111-1111', days: DAYS7, pin: '1111', on: true },
    { id: 2, name: '나여름', courseId: 'c1', carId: 'car1', location: '송도동 1', lat: 37.39, lon: 126.65, phone: '010-2222-2222', days: DAYS7, pin: '2222', on: true },
    { id: 3, name: '다겨울', courseId: 'c2', carId: 'car2', location: '연수구 2', lat: 37.41, lon: 126.69, phone: '010-3333-3333', days: DAYS7, pin: '3333', on: true }]);
  put('tkd_courses', [{ id: 'c1', name: 'A반', depart: '15:00' }, { id: 'c2', name: 'B반', depart: '16:00' }]);
  put('tkd_org', { name: '코스로드학원', lat: 37.4, lon: 126.7 });
  put('tkd_staff', []); put('tkd_driver_att', {}); put('tkd_attendance', {});
  put('tkd_payments', {}); put('tkd_tax', {}); put('tkd_carlog', {});
  return st;
}
function boot(src, biz) {
  const R = E.build({ src: src || NEW, biz: biz || 'academy', localStorage: storeOf() });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-tabs', 'main-header', 'member-screen', 'member-list',
   'member-add-area', 'filter-chips', 'search-input', 'day-tabs', 'header-btns', 'mode-badge',
   'drive-screen', 'admin-screen', 'bottom-action', 'drv-punch-msg', 'pin-result', 'pin-dots',
   'pin-checkin-modal', 'sort-asc-btn', 'sort-desc-btn', 'fb-loading', 'login-err',
   'today-date', 'org-name-display', 'org-icon', 'org-icon-input', 'login-screen', 'main-app',
   'master-root'].forEach(id => {
    const el = E.makeEl('div'); el.id = id;
    el.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
    R.document.registerId(id, el);
  });
  R.win._auth = R.sandbox._auth = { currentUser: { uid: 'u1', isAnonymous: false, getIdToken: async () => 'T' } };
  R.win._db = R.sandbox._db = {};
  R.got = [];  R.wrote = [];  R.deleted = [];
  const keyOf = (p) => String(p || '');
  R.win._firestore = R.sandbox._firestore = {
    doc: (db, ...p) => ({ _p: p.join('/') }), collection: (db, ...p) => ({ _p: p.join('/') }),
    getDoc: async (ref) => { R.got.push(keyOf(ref._p)); return { exists: () => false, data: () => ({}) }; },
    setDoc: async (ref) => { R.wrote.push(keyOf(ref._p)); },
    deleteDoc: async (ref) => { R.deleted.push(keyOf(ref._p)); },
    getDocs: async () => ({ forEach: () => {} }), onSnapshot: () => () => {}
  };
  R.win.fetch = R.sandbox.fetch = async () => ({ json: async () => ({ ok: false }) });
  return R;
}

console.log('════ 1. 버전 ════');
ck('version.json 259', JSON.parse(now('version.json')).version, 259);
ck('APP_VERSION 259', (NEW.match(/const APP_VERSION = (\d+);/) || [])[1], '259');

console.log('\n════ 2. 「운전자」 → 「기사」 ════');
{
  /* 화면에 글자로 나가는 「운전자」가 남았나 — 주석·문답표 검색어·공단 교육 이름은 뺀다 */
  const scan = (src) => src.split(LF).map((l, i) => ({ n: i + 1, l: l })).filter(x => x.l.indexOf('운전자') >= 0);
  const classify = (x) => {
    const t = x.l.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.indexOf('*/') > 0 && t.indexOf("'") < 0) return '주석';
    if (/keys:\s*\[/.test(x.l)) return '문답표 검색어';
    if (/safedriving\.or\.kr|의무교육/.test(x.l)) return '공단 교육 이름';
    return '화면 글자';
  };
  const n = scan(NEW), o = scan(OLD);
  console.log('      지금 「운전자」가 있는 줄 ' + n.length + '개:');
  n.forEach(x => console.log('        ' + String(x.n).padStart(5) + ' [' + classify(x) + '] ' + x.l.trim().slice(0, 74)));
  ck('화면 글자로 남은 「운전자」 0곳', n.filter(x => classify(x) === '화면 글자').length, 0);
  ck('(대조) 옛 판에는 화면 글자가 1곳 있었다', o.filter(x => classify(x) === '화면 글자').length, 1);
  ck('그대로 둘 것 — 문답표 검색어 2곳', n.filter(x => classify(x) === '문답표 검색어').length, 2);
  ck('그대로 둘 것 — 공단 교육 이름 1곳', n.filter(x => classify(x) === '공단 교육 이름').length, 1);
  ck('클래스 이름 badge-driver 는 그대로',
    (NEW.match(/badge-driver/g) || []).length, (OLD.match(/badge-driver/g) || []).length);
  /* 실제로 배지 글자를 읽는다 (4업종) */
  BIZ.forEach(biz => {
    const one = (src) => {
      const R = boot(src, biz);
      R.ev("currentMode='driver'; window._driverCarId='car1'; currentCarId='car1';");
      /* 배지는 initApp 안에서 정해진다 (4426~) — 서버 호출은 가짜로 막아 두었다 */
      try { R.sandbox.initApp(); } catch (e) { return 'ERR:' + e.message; }
      return String(R.document.getElementById('mode-badge').textContent || '');
    };
    ck('[' + biz + '] 기사 모드 배지', one(NEW), '기사');
    ck('[' + biz + ']    (대조) 옛 판 배지', one(OLD), '운전자');
  });
  /* 관리자 배지는 그대로 */
  const A = boot(NEW, 'academy');
  A.ev("currentMode='admin';");
  try { A.sandbox.initApp(); } catch (e) {}
  ck('관리자 배지는 「관리자」 그대로', String(A.document.getElementById('mode-badge').textContent || ''), '관리자');
}

console.log('\n════ 3. 기사 화면 HTML — 배지 글자만 다르다 ════');
{
  let same = 0; const diff = [];
  BIZ.forEach(biz => {
    const one = (src) => {
      const R = boot(src, biz);
      R.ev("currentMode='driver'; window._driverCarId='car1'; currentCarId='car1'; filterCourse=''; filterCar='';");
      try { R.sandbox.renderDrive(); R.sandbox.renderMembers(); } catch (e) { return 'ERR:' + e.message; }
      return String(R.document.getElementById('drive-tabs').innerHTML || '')
        + '§' + String(R.document.getElementById('app-content').innerHTML || '')
        + '§' + String(R.document.getElementById('member-list').innerHTML || '');
    };
    if (one(OLD) === one(NEW)) same++; else diff.push(biz);
  });
  ck('4업종 기사 화면 바이트 동일 (배지는 헤더라 여기 없다)', same + '/4', '4/4');
  if (diff.length) console.log('      달라진 업종: ' + diff.join(', '));
}

/* ── 마스터 패널 ──
   signupUsers 를 직접 넣고 drawMasterPanel 을 그린다 (서버는 안 부른다) */
function master(src, users) {
  const R = boot(src, 'academy');
  R.ev('signupUsers = ' + JSON.stringify(users) + ';');
  R.ev('inquiries = [];');
  try { R.sandbox.drawMasterPanel(); } catch (e) { return { html: 'ERR:' + e.message, R: R }; }
  return { html: String(R.document.getElementById('master-root').innerHTML || ''), R: R };
}
const U = (uid, name, biz, approved, role) => ({
  _uid: uid, orgName: name, bizType: biz, approved: approved, role: role || undefined,
  contact: '010-0000-0000', createdAt: Date.now(), plan: 'trial', trialStart: Date.now()
});
const USERS = [
  U('u1', '가학원', 'academy', true), U('u2', '나물류', 'logistics', true),
  U('u3', '다물류', 'logistics', true), U('u4', '라공공', 'public', true),
  U('u5', '마택배', 'delivery', true),
  U('p1', '바대기', 'academy', false), U('p2', '사대기', 'delivery', false),
  { _uid: 'drv_academy_x_car1', role: 'driver', driverOrg: 'academy_x', carId: 'car1', createdAt: Date.now() },
  { _uid: 'drv_academy_x_car2', role: 'driver', driverOrg: 'academy_x', carId: 'car2', createdAt: Date.now() }
];

console.log('\n════ 4. 마스터 패널 — 개통 대장을 뺐다 ════');
{
  const n = master(NEW, USERS), o = master(OLD, USERS);
  ck('옛 판에는 개통 대장이 있었다 (대조)',
    /개통\(주소 발급\)은 쓰지 않습니다/.test(o.html) && /등록된 업체 없음/.test(o.html), true);
  ck('새 판에 노란 안내 칸 0', /개통\(주소 발급\)은 쓰지 않습니다/.test(n.html), false);
  ck('새 판에 「등록된 업체 없음」 0', /등록된 업체 없음/.test(n.html), false);
  ck('새 판에 「지난 기록」 0', /지난 기록/.test(n.html), false);
  ck('새 판에 「?org=」 주소 줄 0', /\?org=/.test(n.html), false);
  ck('   (대조) 옛 판 업종 묶음 4개', (o.html.match(/등록된 업체 없음/g) || []).length, 4);
}

console.log('\n════ 5. 마스터 패널 — 맨 위 수가 승인 업체 수 ════');
{
  const n = master(NEW, USERS), o = master(OLD, USERS);
  ck('옛 판은 「총 0개」였다 (대조)', /총 0개/.test(o.html), true);
  ck('새 판에 「총 N개」 0', /총 \d+개/.test(n.html), false);
  ck('새 판 맨 위 — 승인 5곳', /승인 5곳/.test(n.html), true);
  ck('   업종별 숫자', (n.html.match(/승인 5곳 \(([^)]+)\)/) || [])[1], '학원 1 · 물류 2 · 공공 1 · 택배 1');
  ck('   업종별 합 = 전체', (() => {
    const m = (n.html.match(/승인 5곳 \(([^)]+)\)/) || [])[1] || '';
    const sum = (m.match(/\d+/g) || []).map(Number).reduce((a, b) => a + b, 0);
    return sum;
  })(), 5);
  ck('아래 승인 목록 건수와 같다', /✅ 승인된 업체 \(5\)/.test(n.html), true);
  ck('기사 문서는 세지 않는다 (가입자 9명 중 기사 2명 제외)',
    /승인 5곳/.test(n.html) && /🔔 승인 대기 \(2\)/.test(n.html), true);
  /* 기사 문서를 더 넣어도 숫자가 안 변한다 */
  const more = USERS.concat([
    { _uid: 'drv_z_car9', role: 'driver', driverOrg: 'academy_z', carId: 'car9' },
    { _uid: 'drv_z_car8', role: 'driver', driverOrg: 'academy_z', carId: 'car8' }]);
  ck('   기사를 둘 더 넣어도 승인 5곳 그대로', /승인 5곳/.test(master(NEW, more).html), true);
  /* 승인 0곳 */
  const none = master(NEW, [U('p1', '가대기', 'academy', false),
    { _uid: 'drv_a', role: 'driver', driverOrg: 'academy_x', carId: 'car1' }]);
  ck('승인 0곳일 때 문구', /승인된 업체 없음/.test(none.html) && !/승인 0곳/.test(none.html), true);
  ck('   그때도 대기 목록은 나온다', /🔔 승인 대기 \(1\)/.test(none.html), true);
  /* 업종이 네 가지 밖인 자료가 섞이면 「그 밖」으로 세어 합이 맞는다 */
  const odd = master(NEW, [U('x1', '가기타', 'etc', true), U('x2', '나학원', 'academy', true)]);
  ck('모르는 업종은 「그 밖」으로', /승인 2곳 \(학원 1 · 그 밖 1\)/.test(odd.html), true);
}

console.log('\n════ 6. 마스터 패널 나머지는 바이트 동일 ════');
{
  const n = master(NEW, USERS), o = master(OLD, USERS);
  /* 맨 위 수 칸과 맨 아래 개통 대장만 빼고 견준다 */
  /* 맨 위 수 칸은 자리표로 바꾸고, 맨 아래 개통 대장 묶음은 **떼어 낸다**
     (새 판에는 그 묶음이 아예 없다 — 자리표를 남기면 그것만으로 달라 보인다) */
  const strip = (html) => html
    .replace(/<span style="font-size:13px;color:#667085;">[^<]*<\/span>/, '«수»')
    .replace(/<div style="background:#FFFAEB[\s\S]*$/, '');
  const a = strip(o.html), b = strip(n.html);
  ck('계좌 안내·대기·승인 목록·문의함·테스트 출입 모두 동일', a === b, true);
  if (a !== b) {
    const i = [...a].findIndex((c, k) => c !== b[k]);
    console.log('      처음 다른 자리 ' + i + ':\n        옛: ' + a.slice(Math.max(0, i - 60), i + 60)
      + '\n        새: ' + b.slice(Math.max(0, i - 60), i + 60));
  }
  /* 대조 — 이 비교가 1건을 잡을 수 있나 */
  ck('(대조) 한 글자 바꾼 판은 잡힌다', (() => {
    const bent = NEW.split('💳 입금 계좌 안내').join('💳 입금 계좌 안내 ');
    if (bent === NEW) return '바꿀 자리 없음';
    return strip(master(bent, USERS).html) === b ? '못 잡음' : '잡음';
  })(), '잡음');
  /* 주요 묶음이 여전히 있다 */
  ['💳 입금 계좌 안내', '🔔 승인 대기', '✅ 승인된 업체', '🧪', '🏢 업체 관리']
    .forEach(x => ck('   「' + x + '」 그대로 있다', n.html.indexOf(x) >= 0, true));
}

console.log('\n════ 7. 개통 대장 자료는 건드리지 않는다 ════');
{
  /* 마스터 패널을 그릴 때 companies 를 읽지 않는다 */
  const n = master(NEW, USERS);
  ck('drawMasterPanel 이 companies 를 읽지 않는다',
    n.R.got.filter(p => /companies/.test(p)).length, 0);
  ck('   아무 것도 지우지 않는다', n.R.deleted.length, 0);
  ck('   아무 것도 저장하지 않는다', n.R.wrote.length, 0);
  /* 소스에서 — companies 를 지우는 코드가 없나 */
  ck('companies 를 deleteDoc 하는 코드 0',
    /deleteDoc\([^)]*companies/.test(NEW) || /'companies'[^)]*deleteDoc/.test(NEW), false);
  ck('companies 를 쓰는 자리는 saveMasterCompanies 하나',
    (NEW.match(/'companies'/g) || []).length, 2);   /* 로더 1 + 저장 1 */
  ck('loadMasterCompanies 를 부르는 자리', (NEW.match(/loadMasterCompanies\(\)/g) || []).length, 3);
  console.log('      (정의 1 + addMasterCompany 1 + deleteMasterCompany 1 — showMasterPanel 에서는 뺐다)');
  ck('showMasterPanel 에서 뺐다', /불러오는 중\.\.\.[\s\S]{0,300}?await loadMasterCompanies/.test(NEW), false);
  ck('   (대조) 옛 판은 거기서 불렀다', /불러오는 중\.\.\.[\s\S]{0,300}?await loadMasterCompanies/.test(OLD), true);
  /* 화면을 그리는 함수 본문만 본다 — 닿지 못하는 add/deleteMasterCompany 안의 쓰임은 센 적 없다 */
  const drawBody = (src) => {
    const i = src.indexOf('function drawMasterPanel(){');
    const j = src.indexOf(LF + '}', i);
    return i < 0 ? '' : src.slice(i, j);
  };
  /* 주석은 뺀다 — drawMasterPanel 안에 「옛 개통 대장(masterCompanies)」을 설명하는 여러 줄 주석을
     남겼으므로, 줄머리만 보면 안 된다. 여러 줄 주석 덩어리를 통째로 지운 뒤 센다.
     (URL 의 두 겹 빗금 때문에 줄주석까지 지우면 지나치니, 줄주석은 줄머리로만 가린다) */
  const noBlock = (txt) => txt.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const codeLines = (txt) => noBlock(txt).split(LF).filter(l => {
    const t = l.trim();
    return !t.startsWith('//') && t.indexOf('masterCompanies') >= 0;
  });
  ck('drawMasterPanel 안에 masterCompanies 를 **쓰는 코드** 0줄', codeLines(drawBody(NEW)).length, 0);
  ck('   (대조) 옛 판 drawMasterPanel 에는 두 줄 있었다', codeLines(drawBody(OLD)).length, 2);
  /* 그 밖의 쓰임은 「선언 + 네 함수」 안에만 있나 */
  {
    const names = ['loadMasterCompanies', 'saveMasterCompanies', 'addMasterCompany', 'deleteMasterCompany'];
    const _NB = noBlock(NEW);
    const spans = names.map(nm => {
      const i = _NB.indexOf('async function ' + nm);
      return [i, _NB.indexOf(LF + '}', i)];
    });
    const outside = [];
    const NEWNB = noBlock(NEW);
    NEWNB.split(LF).forEach((l, i) => {
      const t = l.trim();
      if (t.indexOf('masterCompanies') < 0) return;
      if (t.startsWith('//')) return;
      if (t.startsWith('var masterCompanies = []')) return;          /* 선언 */
      const pos = NEWNB.split(LF).slice(0, i).join(LF).length;
      if (spans.some(([a, b]) => pos > a && pos < b)) return;        /* 네 함수 안 */
      outside.push((i + 1) + ': ' + t.slice(0, 70));
    });
    outside.forEach(x => console.log('      ✘ 네 함수 밖: ' + x));
    ck('선언·네 함수 밖에서 쓰는 곳 0', outside.length, 0);
  }
  ck('addMasterCompany 가 먼저 읽는다',
    /async function addMasterCompany\(\)\{[\s\S]{0,400}?await loadMasterCompanies\(\);/.test(NEW), true);
  ck('deleteMasterCompany 가 먼저 읽는다',
    /async function deleteMasterCompany\(orgId\)\{[\s\S]{0,300}?await loadMasterCompanies\(\);/.test(NEW), true);
  ck('   두 함수는 화면에서 닿지 못한다 (단추 0)',
    /onclick="(addMasterCompany|deleteMasterCompany|copyMasterUrl)/.test(NEW), false);
}

console.log('\n════ 8. 관리자 4업종 × 9화면 · 문답표 · 바뀐 파일 ════');
{
  const TABS = ['dashboard', 'members', 'attendance', 'cars', 'schedule', 'payment', 'tax', 'notice', 'settings'];
  let same = 0; const diff = [];
  BIZ.forEach(biz => TABS.forEach(tab => {
    const one = (src) => {
      const R = boot(src, biz);
      R.ev("currentMode='admin'; currentAdminTab='" + tab + "';");
      try { R.sandbox.renderAdminTab(tab); } catch (e) { return 'ERR:' + e.message; }
      return String(R.document.getElementById('admin-content').innerHTML || '');
    };
    if (one(OLD) === one(NEW)) same++; else diff.push(biz + '/' + tab);
  }));
  ck('4업종 × 9화면 바이트 동일', same + '/36', '36/36');
  if (diff.length) console.log('      달라진 화면: ' + diff.join(', '));

  const qa = require('./qa252.js');
  const a = qa.read(OLD), b = qa.read(NEW);
  ck('문답 수 그대로', b.length + '/' + a.length, '70/70');
  const changed = b.filter(q => { const o = a.find(x => x.t === q.t); return o && JSON.stringify(o) !== JSON.stringify(q); }).map(q => q.t);
  ck('손댄 문답 0개 (바뀐 기능이 문답표에 없다)', changed.join(',') || '없음', '없음');
  ck('   문답표에 「개통 대장」 설명 없음 (확인만)',
    b.filter(q => /개통 대장|주소 발급/.test(q.a)).length, 0);
  ck('   문답표 검색어의 「운전자」는 그대로 둘',
    b.filter(q => (q.keys || []).indexOf('운전자') >= 0).length, 2);

  /* 이 회차(PIN) **자신이** 바꾼 파일로 본다 — v260 이 뒤에 얹혔다 */
  const stat = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + BASE + ' ' + PIN).toString().trim().split(LF);
  stat.forEach(l => { const p = l.split('\t'); console.log('      ' + p[2].padEnd(16) + '+' + p[0] + ' / −' + p[1]); });
  ck('바뀐 파일은 셋 (화면 + 규칙서)', stat.map(l => l.split('\t')[2]).sort().join(','),
    'CLAUDE.md,index.html,version.json');
  /* CLAUDE.md 의 break-all 규칙을 바로잡았다 — 둘째 자리가 이번에 뺀 개통 대장 주소 줄이었다 */
  ck('CLAUDE.md break-all 규칙 바로잡음',
    /`\.share-link-box`\(235\) 한 곳뿐/.test(now('CLAUDE.md')), true);
  ck('   그 까닭도 적었다', /마스터 패널 「개통 대장」의 `\?org=` 주소 줄/.test(now('CLAUDE.md')), true);
  ck('index.html 에 남은 break-all 1곳', (NEW.match(/word-break:break-all/g) || []).length, 1);
  ck('   (대조) 옛 판은 2곳', (OLD.match(/word-break:break-all/g) || []).length, 2);
  ck('api·규칙 손대지 않음', stat.every(l => !/api\/|firestore\.rules/.test(l)), true);
  ck('s.html·home·terms·privacy 손대지 않음',
    stat.every(l => !/s\.html|home\.html|terms\.html|privacy\.html/.test(l)), true);
  ck('firestore.rules 는 503줄 그대로', (() => {
    const r = now('firestore.rules');
    return r.split(LF).length - (r.endsWith(LF) ? 1 : 0);
  })(), 503);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
