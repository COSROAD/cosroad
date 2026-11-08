/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v257 보정4 — 기사 「회원」 탭 자기 차량만 + 기사 출석 쓰기 회수 + 둘러보기 기사 화면
   전: 9506d7f (문답표 점검) · 후: 작업 중 */
const cp = require('child_process');
const fs = require('fs');
/* ★ v272 보정1: 이 묶음은 **v257 회차 기록**이다 — 「새」쪽도 그 회차 커밋에 고정한다.
   전에는 작업트리(지금 코드)를 「후」로 보았다. 그래서 회차가 지날수록 문답 수·함수 목록·
   버전이 어긋나 **거짓으로 실패**했다(v272 기준 3건). v257 가 틀린 것이 아니다.
   지금 코드는 **그 회차의 묶음**이 본다 — 이 표는 그때 무엇이 바뀌었는지의 기록이다.
   ★ env246 은 **require 할 때** COS_SRC_NEW 를 읽는다 → 그 전에 넣어야 한다. */
/* ★ 기대값이 v261 때 앞으로 고쳐졌다(「문답 수 (v261 이 하나 더함)」) — 그 회차에 맞춘다. */
const NEW_REF = process.env.COS_SRC_NEW_REF || '0706501';   /* v261 */   /* v257 */
if (!process.env.COS_SRC_NEW) {
  const _pf = require('path').join(__dirname, 'pin257_index.html');
  require('fs').writeFileSync(_pf, require('child_process').execSync(
    'git -C ' + COS_ROOT + ' show ' + NEW_REF + ':index.html', { maxBuffer: 1 << 28 }));
  process.env.COS_SRC_NEW = _pf;
}
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 72)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const BASE = process.env.COS_SRC_OLD_REF || '9506d7f';
const show = (f) => cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':' + f, { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
/* ★ v272 보정1: 「지금」도 **그 회차 커밋**을 뜻한다 — 작업트리를 읽으면 뒤 회차가 섞여
   version.json 이 272 로 나오고 「둘이 같은 숫자」가 거짓이 된다. */
const now = (f) => cp.execSync('git -C ' + COS_ROOT + ' show ' + NEW_REF + ':' + f,
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const OLD = show('index.html'), NEW = E.SRC_NEW;

/* ── 시험 자료: 1호차 2명 · 2호차 2명 · 미배정 1명 (모든 요일) ── */
const SUF = '__cosroad_default';
const DAYS7 = ['월', '화', '수', '목', '금', '토', '일'];
function storeOf() {
  const st = {};
  /* 둘러보기(?org=academy_demo) 는 접미사가 달라진다 — 같은 자료를 두 접미사에 심는다 */
  const put = (k, v) => {
    st[k + SUF] = JSON.stringify(v);
    ['academy_demo', 'public_demo', 'logistics_demo', 'delivery_demo'].forEach(o => { st[k + '__' + o] = JSON.stringify(v); });
  };
  put('tkd_cars', [
    { id: 'car1', name: '1호차', driver: '박기사', phone: '010-5555-6666' },
    { id: 'car2', name: '2호차', driver: '최기사', phone: '010-7777-8888' }
  ]);
  put('tkd_members', [
    { id: 1, name: '가하은', courseId: 'c1', carId: 'car1', location: '유원아파트', lat: 37.40, lon: 126.70, phone: '010-1111-1111', days: DAYS7, pin: '1111', on: true },
    { id: 2, name: '나여름', courseId: 'c1', carId: 'car1', location: '송도동 1', lat: 37.39, lon: 126.65, phone: '010-2222-2222', days: DAYS7, pin: '2222', on: true },
    { id: 3, name: '다겨울', courseId: 'c2', carId: 'car2', location: '연수구 2', lat: 37.41, lon: 126.69, phone: '010-3333-3333', days: DAYS7, pin: '3333', on: true },
    { id: 4, name: '라봄', courseId: 'c2', carId: 'car2', location: '청학동 3', lat: 37.42, lon: 126.68, phone: '010-4444-4444', days: DAYS7, pin: '4444', on: true },
    { id: 5, name: '마가을', courseId: 'c1', carId: '', location: '미배정동 4', lat: 37.43, lon: 126.67, phone: '010-5555-5555', days: DAYS7, pin: '5555', on: true }
  ]);
  put('tkd_courses', [{ id: 'c1', name: 'A반', depart: '15:00', carId: 'car1' },
                      { id: 'c2', name: 'B반', depart: '16:00', carId: 'car2' }]);
  put('tkd_org', { name: '코스로드학원', lat: 37.4, lon: 126.7 });
  put('tkd_staff', []); put('tkd_driver_att', {}); put('tkd_attendance', {});
  put('tkd_payments', {}); put('tkd_tax', {}); put('tkd_carlog', {});
  return st;
}
function boot(src, biz, search) {
  const R = E.build({ src: src, biz: biz || 'academy', localStorage: storeOf() });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-tabs', 'main-header', 'member-screen', 'member-list',
   'member-add-area', 'filter-chips', 'search-input', 'day-tabs', 'header-btns', 'mode-badge',
   'drive-screen', 'admin-screen', 'bottom-action', 'drv-punch-msg', 'pin-result', 'pin-dots',
   'pin-checkin-modal', 'sort-asc-btn', 'sort-desc-btn'].forEach(id => {
    const el = E.makeEl('div'); el.id = id;
    el.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
    R.document.registerId(id, el);
  });
  if (search) R.win.location.search = R.sandbox.location.search = search;
  R.win._auth = R.sandbox._auth = { currentUser: { uid: 'u1', isAnonymous: false, getIdToken: async () => 'T' } };
  R.win._db = R.sandbox._db = {};
  R.win._firestore = R.sandbox._firestore = {
    doc: (db, ...p) => ({ _p: p.join('/') }), collection: (db, ...p) => ({ _p: p.join('/') }),
    getDoc: async () => ({ exists: () => false, data: () => ({}) }), setDoc: async () => {},
    deleteDoc: async () => {}, getDocs: async () => ({ forEach: () => {} }), onSnapshot: () => () => {}
  };
  R.fetched = [];
  R.win.fetch = R.sandbox.fetch = async (u) => { R.fetched.push(String(u)); return { json: async () => ({ ok: false }) }; };
  return R;
}
const BIZ = ['academy', 'public', 'logistics', 'delivery'];

console.log('════ 1. 버전 ════');
/* v258: 버전을 258 로 올렸다 */
console.log('      지금 버전: ' + JSON.parse(now('version.json')).version + ' (이 회차는 257 이었다)');
ck('version.json 이 257 이상', JSON.parse(now('version.json')).version >= 257, true);
ck('APP_VERSION 도 257 이상', Number((NEW.match(/const APP_VERSION = (\d+);/) || [])[1]) >= 257, true);
ck('   둘이 같은 숫자', JSON.parse(now('version.json')).version === Number((NEW.match(/const APP_VERSION = (\d+);/) || [])[1]), true);

console.log('\n════ 2. 기사 「회원」 탭 — 자기 차량 것만 (4업종) ════');
{
  const namesIn = (html) => ['가하은', '나여름', '다겨울', '라봄', '마가을'].filter(n => html.indexOf(n) >= 0);
  BIZ.forEach(biz => {
    const R = boot(NEW, biz);
    R.ev("currentMode='driver'; window._driverCarId='car1'; currentCarId='car1'; filterCourse=''; filterCar='';");
    R.sandbox.renderMembers();
    const h = String(R.document.getElementById('member-list').innerHTML || '');
    ck('[' + biz + '] 처음 그릴 때 — 1호차 두 명만', namesIn(h).join(','), '가하은,나여름');
    /* 검색·정렬도 같은 기준인가 (그리는 함수가 둘이다) */
    R.sandbox.filterDriverMembers('');
    const h2 = String(R.document.getElementById('member-list').innerHTML || '');
    ck('[' + biz + '] 검색칸으로 다시 그릴 때도 같다', namesIn(h2).join(','), '가하은,나여름');
    R.sandbox.setMemberSort(true);
    const h3 = String(R.document.getElementById('member-list').innerHTML || '');
    ck('[' + biz + '] 정렬 바꿔도 같다', namesIn(h3).sort().join(','), '가하은,나여름');
    /* 칩: 차량 칩 없음 · 반 칩은 내 차량에 있는 것만 */
    const chips = String(R.document.getElementById('filter-chips').innerHTML || '');
    ck('[' + biz + '] 칩에 다른 차량·다른 반 없음',
      ['1호차', '2호차', 'B반'].filter(x => chips.indexOf(x) >= 0).join(',') || '없음', '없음');
    /* 택배 업종은 코스(반)가 없다 — loadCourses() 가 빈 배열이라 반 칩이 아예 없다 */
    const hasCourses = R.ev('loadCourses().length') > 0;
    ck('[' + biz + '] 칩은 「전체」' + (hasCourses ? ' + 내 차량 반(A반)' : ' 하나 (이 업종은 반이 없다)'),
      /전체/.test(chips) && (hasCourses ? /A반/.test(chips) : !/반/.test(chips)), true);
  });
  /* 대조 ①: 2호차 기사는 2호차 회원만 본다 (검사가 차량을 정말 보는가) */
  {
    const R = boot(NEW, 'academy');
    R.ev("currentMode='driver'; window._driverCarId='car2'; currentCarId='car2'; filterCourse=''; filterCar='';");
    R.sandbox.renderMembers();
    ck('(대조) 2호차 기사는 2호차 두 명만',
      namesIn(String(R.document.getElementById('member-list').innerHTML || '')).join(','), '다겨울,라봄');
  }
  /* 대조 ②: 옛 판(9506d7f)에서는 다섯 명이 다 보였다 */
  {
    const R = boot(OLD, 'academy');
    R.ev("currentMode='driver'; window._driverCarId='car1'; currentCarId='car1'; filterCourse=''; filterCar='';");
    R.sandbox.renderMembers();
    ck('(대조) 옛 판에서는 다섯 명이 다 보였다',
      namesIn(String(R.document.getElementById('member-list').innerHTML || '')).length, 5);
  }
  /* 배정 차량이 없는 기사 */
  {
    const R = boot(NEW, 'academy');
    R.ev("currentMode='driver'; window._driverCarId=''; filterCourse=''; filterCar='';");
    R.sandbox.renderMembers();
    const h = String(R.document.getElementById('member-list').innerHTML || '');
    ck('배정 차량 없는 기사 — 안내 문구', /배정된 차량이 없어요/.test(h), true);
    ck('   회원 이름 0명', namesIn(h).length, 0);
    R.sandbox.filterDriverMembers('하');
    ck('   검색해도 같은 안내',
      /배정된 차량이 없어요/.test(String(R.document.getElementById('member-list').innerHTML || '')), true);
  }
  /* 지운 차량에 묶인 기사 — 운행 화면과 같은 처리 */
  {
    const R = boot(NEW, 'academy');
    R.ev("currentMode='driver'; window._driverCarId='car9'; filterCourse=''; filterCar='';");
    R.sandbox.renderMembers();
    ck('없는 차량(car9) 기사 — 회원 0명',
      namesIn(String(R.document.getElementById('member-list').innerHTML || '')).length, 0);
  }
}

console.log('\n════ 3. 관리자 회원 화면은 그대로 (바이트 동일) ════');
{
  let same = 0; const diff = [];
  BIZ.forEach(biz => {
    const one = (src) => {
      const R = boot(src, biz);
      R.ev("currentMode='admin'; filterCourse=''; filterCar='';");
      try { R.sandbox.renderMembers(); } catch (e) { return 'ERR:' + e.message; }
      return String(R.document.getElementById('filter-chips').innerHTML || '')
           + '§' + String(R.document.getElementById('member-list').innerHTML || '');
    };
    if (one(OLD) === one(NEW)) same++; else diff.push(biz);
  });
  ck('4업종 관리자 회원 화면 동일', same + '/4', '4/4');
  if (diff.length) console.log('      달라진 업종: ' + diff.join(', '));
  /* 검색·정렬 쪽도 관리자는 그대로 */
  let same2 = 0;
  BIZ.forEach(biz => {
    const one = (src) => {
      const R = boot(src, biz);
      R.ev("currentMode='admin'; filterCourse=''; filterCar='';");
      try { R.sandbox.renderMembers(); R.sandbox.filterDriverMembers(''); } catch (e) { return 'ERR:' + e.message; }
      return String(R.document.getElementById('member-list').innerHTML || '');
    };
    if (one(OLD) === one(NEW)) same2++;
  });
  ck('   관리자 검색 결과도 동일', same2 + '/4', '4/4');
  /* 대조: 비교가 1건을 잡는가 */
  ck('(대조) 한 글자 바꾼 판은 잡힌다', (() => {
    const bent = NEW.split('class="car-badge">🚐 ').join('class="car-badge">🚌 ');
    if (bent === NEW) return '바꿀 자리 없음';
    const one = (src) => {
      const R = boot(src, 'academy'); R.ev("currentMode='admin';");
      R.sandbox.renderMembers();
      return String(R.document.getElementById('member-list').innerHTML || '');
    };
    return one(bent) === one(NEW) ? '못 잡음' : '잡음';
  })(), '잡음');
}

console.log('\n════ 4. 기사 출석 쓰기 — 앱 가드 ════');
{
  /* 목록이 규칙과 글자까지 같은가 */
  const appList = (NEW.match(/var DRIVER_WRITE_KEYS = \[([^\]]+)\]/) || [])[1] || '';
  const ruleList = (now('firestore.rules').match(/function driverWritableKey\(key\) \{\s*return key in \[([^\]]+)\]/) || [])[1] || '';
  const norm = (x) => x.replace(/['\s]/g, '').split(',').filter(Boolean).sort().join(',');
  ck('앱 DRIVER_WRITE_KEYS', norm(appList), 'carlog,deliveryDone,dropoffDone,rideState');
  ck('규칙 driverWritableKey', norm(ruleList), 'carlog,deliveryDone,dropoffDone,rideState');
  ck('   두 목록이 같다', norm(appList) === norm(ruleList), true);
  ck('   attendance·attendanceTime 이 둘 다 빠졌다',
    /attendance/.test(appList) || /attendance/.test(ruleList), false);
  const oldRule = (show('firestore.rules').match(/function driverWritableKey\(key\) \{\s*return key in \[([^\]]+)\]/) || [])[1] || '';
  ck('(대조) 옛 규칙에는 attendance 가 있었다', /attendance/.test(oldRule) && /attendanceTime/.test(oldRule), true);

  /* 실제로 가드가 막는가 — setDoc 이 불리는지로 본다 */
  const tryWrite = async (mode, key) => {
    const R = boot(NEW, 'academy');
    const sets = [];
    R.win._firestore = R.sandbox._firestore = {
      doc: (db, ...p) => ({ _p: p.join('/') }), collection: (db, ...p) => ({ _p: p.join('/') }),
      getDoc: async () => ({ exists: () => false, data: () => ({}) }),
      setDoc: async (ref) => { sets.push(String(ref._p || '')); },
      deleteDoc: async () => {}, getDocs: async () => ({ forEach: () => {} }), onSnapshot: () => () => {}
    };
    R.ev("currentMode='" + mode + "';");
    await R.sandbox.saveToFirebase(key, { x: 1 });
    return sets.length;
  };
  (async () => {
    for (const k of ['attendance', 'attendanceTime']) {
      ck('기사 모드 ' + k + ' 저장 → 막힌다', await tryWrite('driver', k), 0);
      ck('   (대조) 관리자 모드 ' + k + ' 는 저장된다', (await tryWrite('admin', k)) > 0, true);
    }
    for (const k of ['carlog', 'rideState', 'deliveryDone', 'dropoffDone']) {
      ck('기사 모드 ' + k + ' 는 그대로 저장된다', (await tryWrite('driver', k)) > 0, true);
    }
    for (const k of ['payments', 'tax', 'driverPay', 'staff', 'driverAtt']) {
      ck('기사 모드 ' + k + ' 저장 → 막힌다', await tryWrite('driver', k), 0);
    }
    part5();
  })();
}

function part5() {
console.log('\n════ 5. 둘러보기(_demo) 기사 화면 ════');
{
  BIZ.forEach(biz => {
    const R = boot(NEW, biz, '?org=' + biz + '_demo');
    ck('[' + biz + '] 둘러보기로 인식', R.sandbox.isDemoMode(), true);
    R.ev("currentMode='driver'; currentCarId='car1';");
    R.sandbox.renderDrive();
    const h = String(R.document.getElementById('app-content').innerHTML || '');
    const tabs = String(R.document.getElementById('drive-tabs').innerHTML || '');
    ck('[' + biz + '] 🌅 출근·🌆 퇴근 단추 있다', /🌅 출근/.test(h) && /🌆 퇴근/.test(h), true);
    ck('[' + biz + '] ⛽ 차계부 있다', /⛽ 차계부/.test(h), true);
    ck('[' + biz + '] PIN 단추 0개', (h.match(/openPinCheckin/g) || []).length, 0);
    ck('[' + biz + '] 차량 한 대만 (1호차)', /1호차/.test(tabs) && !/2호차/.test(tabs), true);
    ck('[' + biz + '] 차량 바꾸는 단추 없음', /currentCarId='car/.test(tabs), false);
  });
  /* 대조: 옛 판에는 PIN 단추가 있었고 차량이 둘이었다 */
  {
    const R = boot(OLD, 'academy', '?org=academy_demo');
    R.ev("currentMode='driver'; currentCarId='car1';");
    R.sandbox.renderDrive();
    const h = String(R.document.getElementById('app-content').innerHTML || '');
    const t = String(R.document.getElementById('drive-tabs').innerHTML || '');
    ck('(대조) 옛 판 둘러보기엔 PIN 단추가 있었다', (h.match(/openPinCheckin/g) || []).length, 1);
    ck('(대조) 옛 판 둘러보기엔 차량이 둘이었다', /1호차/.test(t) && /2호차/.test(t), true);
  }
  /* 눌러 보기 — 서버 호출 0 · 저장 0 · 화면만 바뀜 · 새로고침하면 처음 */
  {
    const R = boot(NEW, 'academy', '?org=academy_demo');
    const sets = [];
    R.win._firestore = R.sandbox._firestore = {
      doc: (db, ...p) => ({ _p: p.join('/') }), collection: (db, ...p) => ({ _p: p.join('/') }),
      getDoc: async () => ({ exists: () => false, data: () => ({}) }),
      setDoc: async (ref) => { sets.push(String(ref._p || '')); },
      deleteDoc: async () => {}, getDocs: async () => ({ forEach: () => {} }), onSnapshot: () => () => {}
    };
    R.ev("currentMode='driver'; currentCarId='car1';");
    R.sandbox.renderDrive();
    const before = JSON.stringify(R.store);
    R.sandbox.demoPunch('checkin');
    const h1 = String(R.document.getElementById('app-content').innerHTML || '');
    ck('출근 누르면 시각이 찍힌다 (화면)', /🌅 출근 \d\d:\d\d ✓/.test(h1), true);
    ck('   안내 토스트 한 번', (R.toasts || []).filter(t => /저장되지 않아요/.test(t)).length, 1);
    R.sandbox.demoPunch('checkout');
    const h2 = String(R.document.getElementById('app-content').innerHTML || '');
    ck('퇴근도 찍힌다', /🌆 퇴근 \d\d:\d\d ✓/.test(h2), true);
    ck('   토스트는 더 안 나온다 (한 번만)', (R.toasts || []).filter(t => /저장되지 않아요/.test(t)).length, 1);
    ck('서버 호출 0 (api/driver-auth)', R.fetched.filter(u => /driver-auth/.test(u)).length, 0);
    ck('Firestore 저장 0', sets.length, 0);
    ck('localStorage 그대로 (저장 0)', JSON.stringify(R.store) === before, true);
    /* 새로고침 = 앱을 다시 올린다 */
    const R2 = boot(NEW, 'academy', '?org=academy_demo');
    R2.ev("currentMode='driver'; currentCarId='car1';");
    R2.sandbox.renderDrive();
    ck('새로고침하면 처음 상태',
      /🌅 출근<\/button>|🌅 출근"/.test(String(R2.document.getElementById('app-content').innerHTML || ''))
      || !/✓/.test(String(R2.document.getElementById('app-content').innerHTML || '')), true);
    /* 둘러보기에서도 PIN 판은 안 열린다 */
    R.sandbox.openPinCheckin();
    ck('둘러보기 기사도 PIN 판 못 연다',
      (R.toasts || []).some(t => /관리자 화면에서/.test(t)), true);
  }
  /* 둘러보기 기사 「회원」 탭도 같은 기준 (차량 한 대로 못 박았으니 그 차량 회원만) */
  {
    const R = boot(NEW, 'academy', '?org=academy_demo');
    R.ev("currentMode='driver'; filterCourse=''; filterCar='';");
    R.sandbox.renderMembers();
    const h = String(R.document.getElementById('member-list').innerHTML || '');
    const names = ['가하은', '나여름', '다겨울', '라봄', '마가을'].filter(x => h.indexOf(x) >= 0);
    ck('둘러보기 기사 회원 탭 — 그 차량 회원만', names.join(','), '가하은,나여름');
    /* 대조: 옛 판 둘러보기에서는 다섯 명이 다 보였다 */
    const O = boot(OLD, 'academy', '?org=academy_demo');
    O.ev("currentMode='driver'; filterCourse=''; filterCar='';");
    O.sandbox.renderMembers();
    ck('   (대조) 옛 판 둘러보기에서는 다 보였다',
      ['가하은', '나여름', '다겨울', '라봄', '마가을']
        .filter(x => String(O.document.getElementById('member-list').innerHTML || '').indexOf(x) >= 0).length, 5);
    /* 둘러보기 관리자 화면은 그대로 */
    const A1 = boot(OLD, 'academy', '?org=academy_demo'), A2 = boot(NEW, 'academy', '?org=academy_demo');
    [A1, A2].forEach(X => { X.ev("currentMode='admin'; filterCourse=''; filterCar='';"); X.sandbox.renderMembers(); });
    ck('둘러보기 관리자 회원 화면은 바이트 동일',
      String(A1.document.getElementById('member-list').innerHTML || '')
        === String(A2.document.getElementById('member-list').innerHTML || ''), true);
  }
  /* 실서비스 기사 화면은 종전 그대로 (출근·퇴근은 서버) */
  {
    const R = boot(NEW, 'academy');
    R.ev("currentMode='driver'; window._driverCarId='car1'; currentCarId='car1';");
    R.sandbox.renderDrive();
    const h = String(R.document.getElementById('app-content').innerHTML || '');
    ck('실서비스 기사 — driverPunch 단추 그대로', /driverPunch\('checkin'\)/.test(h), true);
    ck('   demoPunch 는 안 나온다', /demoPunch/.test(h), false);
  }
}

console.log('\n════ 6. 관리자 9화면 (4업종) 바이트 동일 ════');
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
  ck('4업종 × 9화면 동일', same + '/36', '36/36');
  if (diff.length) console.log('      달라진 화면: ' + diff.join(', '));
}

console.log('\n════ 7. 문답표 ════');
{
  const qa = require('./qa252.js');
  const a = qa.read(OLD), b = qa.read(NEW);
  /* v261 이 문답 하나를 더했다 (「사업자 확인이 안 돼요») — 이 회차는 70/70 이었다 */
  ck('문답 수 (v261 이 하나 더함)', b.length + '/' + a.length, '71/70');
  const changed = b.filter(q => { const o = a.find(x => x.t === q.t); return o && JSON.stringify(o) !== JSON.stringify(q); }).map(q => q.t).sort();
  console.log('      손댄 문답(' + changed.length + '): ' + changed.join(' / '));
  /* v261 이 손댄 문답 넷 — 가입·로그인·승인 대기·구독·1234 안내를 가입 개편에 맞춰 고쳤다
     (「회원가입」 문답은 제목까지 바뀌어 여기 「손댄 문답」에는 안 들어온다). 표는 t_app261.js */
  const V261_Q = ['휴대폰 번호로 로그인해요', '승인 대기 화면이 나와요',
                  '30일 무료 체험·구독', '1234 비밀번호로 안 들어가져요'];
  ck('손댄 문답 4개 (+ v261 넷)', changed.filter(t => V261_Q.indexOf(t) < 0).join(' / '),
    ['«출결» 체크인 (PIN)', '기사 운행 화면 사용법', '데모(샘플) 계정', '출근·퇴근 기록하기'].sort().join(' / '));
  const all = b.map(q => q.a).join('\n');
  ck('기사 회원 탭 안내가 들어갔다', /내 차량 «회원»만/.test(all), true);
  ck('둘러보기 기사 화면 안내가 들어갔다', /둘러보기에서 누른 출근·퇴근은/.test(all), true);
  ck('별표·가짜 토큰 0 (점검 회차 규칙 유지)',
    b.filter(q => /\*\*/.test(q.a)).length + (b.flatMap(q => ((q.t + q.a).match(/«[^»]*»/g) || [])
      .filter(x => ['«회원»','«학부모»','«알림장»','«출결»','«출석»','«결석»','«출석률»','«수강료»'].indexOf(x) < 0)).length), 0);
  /* 검색어로 찾아지나 — 실제 helperAnswer */
  const R = boot(NEW, 'academy');
  const ask = (q, role) => {
    R.ev("currentMode='" + role + "';");
    const r = R.sandbox.helperAnswer(q);
    return (r.type === 'answer' ? [r.item] : (r.type === 'choices' ? r.items : [])).map(x => x.t);
  };
  ck('기사 「회원탭에 다른 차량이 보여요」 → 운행 화면 사용법',
    ask('회원탭에 다른 차량이 보여요', 'driver').indexOf('기사 운행 화면 사용법') >= 0, true);
  ck('기사 「명단이 왜 이것만 나와요」 → 운행 화면 사용법',
    ask('명단이 왜 이것만 나와요', 'driver').indexOf('기사 운행 화면 사용법') >= 0, true);
  ck('「둘러보기 출퇴근」 → 데모 계정',
    ask('둘러보기 출퇴근이 저장돼요?', 'driver').indexOf('데모(샘플) 계정') >= 0, true);
}

console.log('\n════ 8. 바뀐 파일·규칙 줄 수 ════');
{
  /* ★ v272 보정1: 이 회차의 diff 는 **두 커밋 사이**다. 작업트리까지 재면 뒤 회차가 섞여,
     v271 이 home·terms 를 고치자 「s.html·home·terms·privacy 손대지 않았다」가 깨졌다. */
  const stat = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + BASE + ' ' + NEW_REF)
    .toString().trim().split('\n');
  stat.forEach(l => { const p = l.split('\t'); console.log('      ' + p[2].padEnd(16) + '+' + p[0] + ' / −' + p[1]); });
  /* v260: api/admin-account.js(옛 기사 계정 세 동작 삭제)·api/driver-auth.js(업체 단위 상한)를 고쳤다.
     이 회차 **자신이** api 를 건드렸는지로 본다. */
  ck('이 회차가 바꾼 네 파일이 모두 들어 있다',
    ['CLAUDE.md', 'firestore.rules', 'index.html', 'version.json']
      .every(f => stat.some(l => l.split('\t')[2] === f)), true);
  ck('v257 자신은 api 를 안 건드렸다',
    cp.execSync('git -C ' + COS_ROOT + ' diff --name-only 9506d7f 4ac625b').toString().indexOf('api/') < 0, true);
  ck('s.html·home·terms·privacy 손대지 않았다',
    stat.every(l => !/s\.html|home\.html|terms\.html|privacy\.html/.test(l)), true);
  const rl = now('firestore.rules').split('\n').length;
  console.log('      firestore.rules 줄 수: ' + show('firestore.rules').split('\n').length + ' → ' + rl + ' (재게시용)');
  ck('규칙 줄 수 (재게시용)', rl > 0, true);
  ck('CLAUDE.md 에 기사 화면 두 렌더러 규칙', /renderMembers\(\)`\(처음\)와 `filterDriverMembers\(\)`/.test(now('CLAUDE.md')), true);
  ck('CLAUDE.md 에 쓰기 4개 규칙', /쓰기 `driverWritableKey` \*\*4개\*\*\(v257\)/.test(now('CLAUDE.md')), true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
}
