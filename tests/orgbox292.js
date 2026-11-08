/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드59-B3 — **기기 저장 칸 꼬리를 「로그인한 업체」 하나로**(v292).
   v291 까지 꼬리는 `?org=` **만** 보았다(`curOrgId`). `cosroad.com` 에는 `?org=` 가 없으니
   **모든 업체가 `tkd_*__cosroad_default` 한 칸**을 같이 썼다(59-A 실측).
   v292 는 서버에 읽고 쓰는 그 함수(`getFbOrgId()`)를 **그대로** 부른다.
   보는 것: ① 역할별로 칸이 갈리나(관리자·기사·도우미) ② 옛 칸은 **그대로 남고** 새 칸은
            비어 있다가 **서버 값으로** 채워지나 ③ 서버에 안 올라가는 키가 몇 개인가(전수)
            ④ 되돌아 들어오기(무한 되돌이)가 없나 ⑤ 둘러보기 막기는 그대로인가
   실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const OLD_REF = process.env.COS_SRC_OLD_REF || '38087ae';   /* v291 — 고치기 전 */
if (!('COS_SRC_NEW_REF' in process.env)) process.env.COS_SRC_NEW_REF = '';
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(50) + String(got).slice(0, 44)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const NEW_SRC = require('fs').readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM_A = [{ id: 1, name: 'A업체 가하은', carId: 'car1', courseId: 'c1', days: D7, location: 'A주소', lat: 37.41, lon: 126.68, phone: '010-1' }];
const MEM_B = [{ id: 1, name: 'B업체 나래', carId: 'car1', courseId: 'c1', days: D7, location: 'B주소', lat: 37.42, lon: 126.69, phone: '010-2' }];
const CARS = [{ id: 'car1', name: '1호차', driver: '', phone: '', plate: '' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];

/* 폰에는 **앞 업체(A)** 자료가 옛 칸(`__cosroad_default`)에 들어 있다 */
function oldBox() {
  const s = {};
  s['tkd_members__cosroad_default'] = JSON.stringify(MEM_A);
  s['tkd_cars__cosroad_default']    = JSON.stringify(CARS);
  s['tkd_courses__cosroad_default'] = JSON.stringify(COURSES);
  s['tkd_org__cosroad_default']     = JSON.stringify({ name: 'A학원', icon: '🅰', bizType: 'academy',
    destName: 'A학원', destLat: 37.44, destLon: 126.65, bankAccount: 'A은행 111' });
  s['tkd_support_seen__cosroad_default'] = JSON.stringify({ 'notice-1': 1 });
  return s;
}

function phone(SRV, opt) {
  opt = opt || {};
  const R = E.build({ src: opt.src || NEW_SRC, biz: 'academy', localStorage: oldBox() });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-screen', 'admin-screen', 'fb-loading', 'member-screen',
   'member-list', 'main-header', 'today-date', 'org-name-display', 'org-icon', 'login-screen',
   'main-app', 'bottom-action', 'mode-badge', 'header-btns', 'filter-chips', 'search-input',
   'day-tabs', 'member-add-area', 'drive-tabs']
   .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });
  const bagOf = (p) => {
    const seg = p.split('/');
    if (seg[0] === 'orgs') return { box: (SRV[seg[1]] = SRV[seg[1]] || {}), key: seg.slice(2).join('/') || '_' };
    return { box: (SRV.etc = SRV.etc || {}), key: p };
  };
  const pathOf = (a) => a.slice(1).join('/');
  R.sandbox._firestore = R.win._firestore = {
    doc: function(){ return { path: pathOf([].slice.call(arguments)) }; },
    collection: function(){ return { path: pathOf([].slice.call(arguments)) }; },
    getDoc: async (ref) => {
      const b = bagOf(ref.path);
      const has = Object.prototype.hasOwnProperty.call(b.box, b.key);
      SRV.reads.push(ref.path);
      return { exists: () => has, data: () => ({ value: JSON.stringify(b.box[b.key]) }) };
    },
    getDocs: async (ref) => {
      const seg = ref.path.split('/');
      const box = (seg[0] === 'orgs') ? (SRV[seg[1]] = SRV[seg[1]] || {}) : {};
      const pre = seg.slice(2).join('/') + '/';
      const ids = Object.keys(box).filter((k) => k.indexOf(pre) === 0);
      return { forEach: (cb) => ids.forEach((k) =>
        cb({ id: k.slice(pre.length), data: () => ({ value: JSON.stringify(box[k]) }) })) };
    },
    setDoc: async (ref, d) => {
      SRV.writes.push('set ' + ref.path);
      const b = bagOf(ref.path);
      b.box[b.key] = (d && d.value !== undefined) ? JSON.parse(d.value) : d;
    },
    deleteDoc: async () => {},
    runTransaction: async (db, fn) => await fn({
      get: async (ref) => { const b = bagOf(ref.path);
        const has = Object.prototype.hasOwnProperty.call(b.box, b.key);
        return { exists: () => has, data: () => ({ value: JSON.stringify(b.box[b.key]) }) }; },
      set: (ref, d) => { SRV.writes.push('tx ' + ref.path); const b = bagOf(ref.path);
        b.box[b.key] = JSON.parse(d.value); }
    }),
    onSnapshot: (ref, cb) => { SRV.listeners.push(ref.path); return () => {}; }
  };
  R.sandbox._db = R.win._db = {};
  R.ev("window._userPaidUntil=Date.now()+30*86400000; window._userBizType='academy';");
  if (opt.role === 'driver' || opt.role === 'helper') {
    /* ★ 실제 앱과 같게 — 기사·도우미는 `_userOrgId` 를 **비워 둔다**(「로그인 유지」 키 때문) */
    R.ev("currentMode='driver'; window._userOrgId=null; window._isDriverAcct=true;"
       + " window._driverOrg='B'; window._driverCarId='car1';"
       + (opt.role === 'helper' ? " window._isHelperAcct=true; window._driverStaffId='st1';" : ''));
  } else {
    R.ev("currentMode='admin'; window._userUid='uB'; window._userOrgId='B';");
  }
  return { R, SRV };
}
const makeServer = () => ({
  reads: [], writes: [], listeners: [],
  B: { 'carState/car1': { ride: {}, rideOff: {}, carlog: { records: [], plans: {} },
                          delivDone: {}, dropDone: {}, att: {} },
       'carData/car1': { members: MEM_B, car: CARS[0], courses: COURSES },
       'data/members': MEM_B, 'data/cars': CARS, 'data/courses': COURSES,
       'data/migration': { carState: true },
       'data/org': { name: 'B학원', icon: '🅱', bizType: 'academy' },
       'data/orgDriver': { name: 'B학원', icon: '🅱', bizType: 'academy' } }
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('════ ① 역할별로 칸이 갈리나 (꼬리 글자)');
  {
    /* ★ 가짜 localStorage 의 칸 이름은 `R.store` 로 본다 —
       `Object.keys(localStorage)` 는 **빈 배열**이다(값이 닫힌 변수에 있다). */
    const boxes = (R, pre) => Object.keys(R.store)
      .filter((k) => k.indexOf(pre) === 0).sort().join(',');
    const n = phone(makeServer(), {});
    n.R.ev("localStorage.setItem('tkd_members','[]');");
    ck('[새] 관리자 — 꼬리가 **로그인한 업체**', boxes(n.R, 'tkd_members'),
      'tkd_members__B,tkd_members__cosroad_default');
    const o = phone(makeServer(), { src: OLD_SRC });
    o.R.ev("localStorage.setItem('tkd_members','[]');");
    ck('[옛] 관리자 — 옛 칸 하나뿐(갈리지 않는다)', boxes(o.R, 'tkd_members'),
      'tkd_members__cosroad_default');

    ['driver', 'helper'].forEach((role) => {
      const d = phone(makeServer(), { role: role });
      d.R.ev("localStorage.setItem('tkd_cars','[]');");
      ck('[새] ' + role + ' — `_driverOrg` 로 갈린다', boxes(d.R, 'tkd_cars'),
        'tkd_cars__B,tkd_cars__cosroad_default');
      const d0 = phone(makeServer(), { role: role, src: OLD_SRC });
      d0.R.ev("localStorage.setItem('tkd_cars','[]');");
      ck('  (옛) ' + role + ' — 옛 칸을 쓴다(`_userOrgId` 가 비어 있어서)', boxes(d0.R, 'tkd_cars'),
        'tkd_cars__cosroad_default');
    });
  }

  console.log('\n════ ② 들어온 직후 — 새 칸은 비어 있고, 동기화가 **서버 값**으로 채운다');
  {
    const o = phone(makeServer(), { src: OLD_SRC });
    ck('★ [옛] 들어온 직후 화면에 **앞 업체 명단**이 보인다',
      o.R.ev("JSON.stringify((loadMembers()[0]||{}).name)"), '"A업체 가하은"');
    const n = phone(makeServer(), {});
    ck('★ [새] 들어온 직후 — **비어 있다**(남의 자료 0건)',
      n.R.ev("String(loadMembers().length)"), '0');
    ck('  [새] 업체 설정도 앞 업체 것이 아니다(계좌 안 보인다)',
      n.R.ev("JSON.stringify(loadOrgSettings().bankAccount||null)"), 'null');
    await n.R.ev('syncFromFirebase()');
    await wait(500);
    ck('★ [새] 동기화 뒤 **그 업체 명단**',
      n.R.ev("JSON.stringify((loadMembers()[0]||{}).name)"), '"B업체 나래"');
    ck('★ 옛 칸은 **그대로 남아 있다**(지우지 않았다)',
      n.R.ev("JSON.stringify(JSON.parse(localStorage.getItem('tkd_members__cosroad_default')||'[]')[0].name)"),
      '"A업체 가하은"');
    ck('  옛 칸을 **고치지도 않았다**',
      n.R.ev("String(JSON.parse(localStorage.getItem('tkd_members__cosroad_default')||'[]').length)"), '1');
    ck('  서버로 나간 쓰기에 **앞 업체 명단이 없다**',
      JSON.stringify(n.SRV.B['data/members'] || []).indexOf('A업체') >= 0, false);
  }

  console.log('\n════ ③ 「서버에 안 올라가는 기기 칸」 전수 (표의 근거)');
  {
    const keys = (/var ORG_KEYS = \[([^\]]+)\]/.exec(NEW_SRC) || [, ''])[1]
      .split(',').map((x) => x.trim().replace(/'/g, ''));
    const ups = new Set([...NEW_SRC.matchAll(/saveToFirebase\('([a-zA-Z]+)'/g)].map((m) => m[1]));
    /* 서버로 가는 길이 `saveToFirebase` 말고 **차량 기록 문서**인 다섯(v275) */
    const viaCarState = ['tkd_carlog', 'tkd_ridestate', 'tkd_driver_att'];
    const camel = (k) => k.replace(/^tkd_/, '').replace(/_([a-z])/g, (m, c) => c.toUpperCase());
    const onlyLocal = keys.filter((k) => !ups.has(camel(k)) && viaCarState.indexOf(k) < 0);
    console.log('      ORG_KEYS ' + keys.length + '개 · 올라가는 키 ' + ups.size + '개');
    ck('★ 서버에 **안 올라가는** 기기 칸', onlyLocal.join(',') || '없음', 'tkd_support_seen');
    ck('  (그 하나는 「본 공고 표시」다 — 사람이 넣은 자료가 아니다)',
      /'본 공고\(seen\)'만 tkd_support_seen/.test(NEW_SRC), true);
  }

  console.log('\n════ ④ 되돌아 들어오기(무한 되돌이)가 없나 · ⑤ 둘러보기 막기');
  {
    const n = phone(makeServer(), {});
    ck('★ 칸 하나를 읽을 때 `getFbOrgId` 호출 **한 번**',
      n.R.ev("(function(){ var c=0; var f=getFbOrgId;"
           + " getFbOrgId=function(){ c++; return f(); };"
           + " localStorage.getItem('tkd_members'); getFbOrgId=f; return String(c); })()"), '1');
    ck('  깊이 깃발이 소스에 있다', /var _inScope = false;/.test(NEW_SRC), true);
    /* 둘러보기 — `_demo` 업체면 업체 자료를 **로컬에도** 쓰지 않는다(종전 그대로) */
    const d = phone(makeServer(), {});
    ck('★ 둘러보기(`_demo`)면 로컬에도 안 쓴다',
      d.R.ev("(function(){ window._userOrgId='academy_demo';"
           + " localStorage.setItem('tkd_members', JSON.stringify([{id:9,name:'데모'}]));"
           + " return String(JSON.parse(localStorage.getItem('tkd_members')||'[]').length); })()"), '0');
    ck('  (그 업체 칸이 아예 생기지 않았다)',
      d.R.ev("String(Object.keys(localStorage).filter(function(k){return k.indexOf('tkd_members__academy_demo')===0;}).length)"), '0');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  process.exit(fail ? 1 : 0);
})();
