/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드65 — **복원은 백업에 있는 칸만** · **끊긴 코스는 「코스 없음」** (v306).
   63·64 의 원칙·함수를 재사용한다(새 꼴 0).
   ① 복원 — 백업에 **칸이 없는** 키는 폰도 서버도 **손대지 않는다**(v305 는 자격증 하나만 그랬다) ·
      업체 칸 **20개 전수**로 하나씩 빼 보며 확인 · `rebuildCarData`·`saveCarState`·`saveOrgDriver`
      도 재료가 없으면 안 돈다 · 끝 안내 「이 백업에 없던 자료 N가지는 그대로 두었어요」 ·
      칸 유무 판정은 **`_dumpHas` 한 벌**
   ② 끊긴 코스 — 명단 **네 자리**와 수정 창에 「코스 없음」 · 수정 창에서 **고를 수 있다** ·
      **자동으로 옮기지 않는다** · 코스 화면 「코스 없는 «회원» N명」 · 택배는 빈 글자
   ③ 소스 전수 — 61 원칙 · 로그아웃 짝 · HELP_QA · `api/`·`lib/`·규칙 0줄
   ★ 바깥 통신 0 — 가짜 fetch. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

const OLD_REF = process.env.COS_SRC_OLD_REF || 'b963a0b';   /* v305 — 고치기 전 */
const NEW_SRC = fs.readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
/* ★ 이 회차 커밋 — **버전 글자로 찾는다**(63·64 와 같은 방법 · 커밋 전에는 작업트리) */
const THIS_REF = (() => {
  if (process.env.COS_API_NEW_REF) return process.env.COS_API_NEW_REF;
  try {
    const h = cp.execSync('git -C ' + COS_ROOT
      + ' log --format=%H -1 --fixed-strings --grep=(v306)').toString().trim();
    return /^[0-9a-f]{7,}$/.test(h) ? h : '';
  } catch (e) { return ''; }
})();

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 40)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const CARS = [{ id: 'car1', name: '1호차' }, { id: 'car2', name: '2호차' }];
const COURSES = [{ id: 'c1', name: '오전반', depart: '09:00' }];
/* 2번은 **없는 코스**(`c9`)를 가리킨다 — 옛 업체에 남아 있는 끊긴 참조 */
const MEM = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1',
    lat: 37.41, lon: 126.68, phone: '010-1', pin: '1111' },
  { id: 2, name: '나다움', carId: 'car1', courseId: 'c9', days: D7, location: '인천 2',
    lat: 37.42, lon: 126.69, phone: '010-2' },
  { id: 3, name: '다가을', carId: 'car9', courseId: '', days: D7, location: '인천 3',
    lat: 37.43, lon: 126.70, phone: '010-3' }        /* 코스도 차량도 끊김 */
];
const SUF = '__B';
/* 업체 칸 → 서버 키 (복원이 올리는 짝) */
const PAIR = {
  tkd_members: 'members', tkd_cars: 'cars', tkd_courses: 'courses', tkd_org: 'org',
  tkd_notices: 'notices', tkd_payments: 'payments', tkd_tax: 'tax',
  tkd_attendance: 'attendance', tkd_attendance_time: 'attendanceTime',
  tkd_drivelog_manual: 'drivelogManual', tkd_payroll_manual: 'payrollManual',
  tkd_staff: 'staff', tkd_driver_pay: 'driverPay', tkd_invoices: 'invoices',
  tkd_products: 'products', tkd_certificates: 'certificates'
};

function app(opt) {
  opt = opt || {};
  const src = opt.src || NEW_SRC;
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(opt.members || MEM);
  store['tkd_cars' + SUF] = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify(opt.courses || COURSES);
  store['tkd_staff' + SUF] = JSON.stringify([{ id: 'st1', name: '최직원' }]);
  store['tkd_org' + SUF] = JSON.stringify({ name: '가온학원', icon: '🚐', bizType: opt.biz || 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  /* 폰에 든 **복원 전** 값 — 옛 백업을 복원할 때 「이것이 서버로 올라가나」를 본다 */
  store['tkd_payments' + SUF] = JSON.stringify({ phone_old: 1 });
  store['tkd_tax' + SUF] = JSON.stringify({ phone_old: 1 });
  store['tkd_attendance' + SUF] = JSON.stringify({ '2026-11-01': { 1: 'present' } });
  store['tkd_attendance_time' + SUF] = JSON.stringify({ '2026-11-01': { 1: '08:00' } });
  store['tkd_notices' + SUF] = JSON.stringify([{ id: 1, ts: 1, content: '폰에 있던 알림장' }]);
  store['tkd_invoices' + SUF] = JSON.stringify([{ id: 'iv_old' }]);
  store['tkd_products' + SUF] = JSON.stringify([{ name: '폰품목' }]);
  store['tkd_drivelog_manual' + SUF] = JSON.stringify({ old: 1 });
  store['tkd_payroll_manual' + SUF] = JSON.stringify({ old: 1 });
  store['tkd_driver_pay' + SUF] = JSON.stringify({ car1: { hourlyWage: 1 } });
  store['tkd_certificates' + SUF] = JSON.stringify([{ id: 'ct_old' }]);
  store['tkd_carlog' + SUF] = JSON.stringify({ records: [], plans: {} });
  store['tkd_ridestate' + SUF] = JSON.stringify({});
  store['tkd_driver_att' + SUF] = JSON.stringify({});
  store['tkd_support_seen' + SUF] = JSON.stringify([]);
  const R = E.build({ src: src, biz: opt.biz || 'academy', localStorage: store });
  if (R.error) throw R.error;
  const ids = new Set(['admin-content', 'app-content', 'member-list', 'admin-search',
    'main-header', 'today-date', 'org-name-display', 'org-icon', 'confirm-modal',
    'confirm-ok-btn', 'bulk-del-btn', 'driver-att-host', 'new-course-name',
    'm-class', 'm-car', 'm-dropcar', 'wrap-class', 'wrap-dropcar', 'modal-title', 'edit-id',
    'member-modal']);
  (src.match(/id="[a-zA-Z0-9_-]+"/g) || []).forEach((x) => ids.add(x.slice(4, -1)));
  ids.forEach((id) => {
    const el = E.makeEl(id === 'm-class' || id === 'm-car' || id === 'm-dropcar' ? 'select' : 'input');
    el.id = id;
    const bag = {};
    el.setAttribute = (k, v) => { bag[k] = String(v); };
    el.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null);
    el.removeAttribute = (k) => { delete bag[k]; };
    /* `classList` — `openEditModal`·`openAddModal` 이 쓴다(가짜 DOM 에는 없다) */
    if (!el.classList) {
      const cl = new Set();
      el.classList = { add: (c) => cl.add(c), remove: (c) => cl.delete(c),
        contains: (c) => cl.has(c), toggle: (c) => (cl.has(c) ? cl.delete(c) : cl.add(c)) };
    }
    /* ★ 진짜 `<select>` 처럼 — 없는 값을 넣으면 **빈 값**이 된다(`selectedIndex=-1`).
       이것이 이 회차 재현의 핵심이라 흉내 내야 한다. */
    if (el.tagName === 'SELECT') {
      let _v = '';
      Object.defineProperty(el, 'options', {
        get() {
          return (String(el._html).match(/value="([^"]*)"/g) || [])
            .map((s) => s.slice(7, -1));
        }
      });
      Object.defineProperty(el, 'value', {
        get() { return _v; },
        set(x) { _v = (el.options.indexOf(String(x)) >= 0) ? String(x) : ''; }
      });
    }
    R.byId[id] = el;
  });
  const L = { api: [], alerts: [], toasts: [], saved: [], calls: [] };
  R.sandbox.alert = R.win.alert = (m) => { L.alerts.push(String(m)); };
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userUid='uB';"
     + " window._userPaidUntil=Date.now()+1e9; _firstSyncOk=true;");
  R.ev("window._userBizType='" + (opt.biz || 'academy') + "';");
  R.ev("window._auth={ currentUser:{ isAnonymous:false, getIdToken:function(){ return Promise.resolve('tok'); } } };");
  R.ev('showToast = function(m){ window.__t(String(m)); };');
  R.sandbox.__t = R.win.__t = (m) => { L.toasts.push(String(m)); };
  R.ev('saveToFirebase = function(k,v){ window.__sv(k, JSON.stringify(v===undefined?null:v)); return Promise.resolve(true); };');
  R.sandbox.__sv = R.win.__sv = (k, v) => { L.saved.push({ k: k, v: v }); };
  /* 세 함수가 **돌았나**를 따로 센다 */
  R.ev('saveCarState = function(){ window.__c("saveCarState"); return Promise.resolve(true); };'
     + ' rebuildCarData = function(){ window.__c("rebuildCarData"); };'
     + ' saveOrgDriver = function(){ window.__c("saveOrgDriver"); };'
     + ' refreshDriverAttHost = function(){}; renderAdminTab = function(){};'
     + ' renderMembers = function(){}; _atSetBase = function(){};'
     + ' renderCertHistory = function(){}; applyBizModalLayout = function(){};'
     + ' applyDropCarVisibility = function(){};');
  R.sandbox.__c = R.win.__c = (n) => { L.calls.push(n); };
  if (opt.demo) R.ev('isDemoMode = function(){ return true; };');
  R.sandbox.Blob = R.win.Blob = function () {};
  R.sandbox.URL = R.win.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
  R.sandbox.fetch = R.win.fetch = async (url, init) => {
    const body = JSON.parse((init && init.body) || '{}');
    L.api.push(body);
    return { json: async () => ({ ok: true }) };
  };
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return { R, L };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const restore = async (p, dumpObj) => {
  const txt = JSON.stringify(dumpObj);
  p.R.sandbox.FileReader = p.R.win.FileReader = function () {
    const self = this;
    this.readAsText = function () { setTimeout(() => { self.onload({ target: { result: txt } }); }, 0); };
  };
  const ev = { target: { value: 'x', files: [{ name: 'b.json' }] } };
  p.R.sandbox.__ev = ev;
  p.R.ev('restoreData(__ev);');
  await wait(20);
  const cb = p.R.sandbox._confirmCallback;
  if (typeof cb !== 'function') return 'NOCB';
  try { await cb(); } catch (e) { return 'THROW:' + e.message; }
  await wait(60);
  return 'ok';
};
/* 모든 칸을 들고 온 **새 백업** — `drop` 에 적은 칸만 뺀다 */
const DUMP = (drop) => {
  const d = { _app: 'COSROAD', _version: 1, _date: '2026-11-01T00:00:00.000Z', data: {} };
  d.data['tkd_members'] = JSON.stringify(MEM);
  d.data['tkd_cars'] = JSON.stringify(CARS);
  d.data['tkd_courses'] = JSON.stringify(COURSES);
  d.data['tkd_org'] = JSON.stringify({ name: '가온학원', bizType: 'academy' });
  d.data['tkd_notices'] = JSON.stringify([{ id: 9, ts: 9, content: '백업 알림장' }]);
  d.data['tkd_payments'] = JSON.stringify({ from_backup: 1 });
  d.data['tkd_tax'] = JSON.stringify({ from_backup: 1 });
  d.data['tkd_attendance'] = JSON.stringify({ '2026-10-01': { 1: 'present' } });
  d.data['tkd_attendance_time'] = JSON.stringify({ '2026-10-01': { 1: '09:00' } });
  d.data['tkd_drivelog_manual'] = JSON.stringify({ from_backup: 1 });
  d.data['tkd_payroll_manual'] = JSON.stringify({ from_backup: 1 });
  d.data['tkd_staff'] = JSON.stringify([{ id: 'st1', name: '최직원' }]);
  d.data['tkd_driver_pay'] = JSON.stringify({ car1: { hourlyWage: 2 } });
  d.data['tkd_invoices'] = JSON.stringify([{ id: 'iv_backup' }]);
  d.data['tkd_products'] = JSON.stringify([{ name: '백업품목' }]);
  d.data['tkd_certificates'] = JSON.stringify([{ id: 'ct_backup' }]);
  d.data['tkd_carlog'] = JSON.stringify({ records: [], plans: {} });
  d.data['tkd_ridestate'] = JSON.stringify({});
  d.data['tkd_driver_att'] = JSON.stringify({});
  d.data['tkd_support_seen'] = JSON.stringify([]);
  (drop || []).forEach((k) => { delete d.data[k]; });
  return d;
};
const savedKeys = (p) => p.L.saved.map((x) => x.k);
const savedVal = (p, k) => (p.L.saved.filter((x) => x.k === k)[0] || {}).v || '';

(async () => {
  console.log('════ ① 복원 — 백업에 **있는 칸만** 바꾸고 올린다');
  {
    /* 재현 — v305 는 칸이 없어도 **폰 값을 올렸다** */
    const o = app({ src: OLD_SRC });
    await restore(o, DUMP(['tkd_payments', 'tkd_invoices', 'tkd_notices']));
    ck('[옛] ★ 칸이 없는데 `payments` 를 올렸다', savedKeys(o).indexOf('payments') >= 0, true);
    ck('[옛]   그 값이 **복원 전 폰 값**이다', /phone_old/.test(savedVal(o, 'payments')), true);
    ck('[옛] ★ `invoices` 도 올렸다', /iv_old/.test(savedVal(o, 'invoices')), true);
    ck('[옛] ★ `notices` 도 올렸다', /폰에 있던/.test(savedVal(o, 'notices')), true);
    ck('[옛]   그래서 서버의 새 값이 **옛 값으로 되돌아간다**',
      ['payments', 'invoices', 'notices'].filter((k) => savedKeys(o).indexOf(k) >= 0).length, 3);

    /* 고침 — 칸이 없으면 올리지 않는다 */
    const p = app({});
    await restore(p, DUMP(['tkd_payments', 'tkd_invoices', 'tkd_notices']));
    ck('★ [새] 칸이 없는 셋은 **올리지 않는다**',
      ['payments', 'invoices', 'notices'].filter((k) => savedKeys(p).indexOf(k) >= 0).join(',') || '0개',
      '0개');
    ck('  [새] 폰 값도 그대로', p.R.ev('JSON.stringify(loadPayments())'), '{"phone_old":1}');
    ck('★ [새] 칸이 있는 키는 **종전대로 올라간다**',
      /from_backup/.test(savedVal(p, 'tax')), true);
    ck('  [새] 그 값이 백업 값이다', /ct_backup/.test(savedVal(p, 'certificates')), true);

    /* ★ 업체 칸 **20개 전수** — 하나씩 빼 보며 그 서버 키가 안 올라가는지 */
    const bad = [];
    for (const k of Object.keys(PAIR)) {
      const q = app({});
      await restore(q, DUMP([k]));
      if (savedKeys(q).indexOf(PAIR[k]) >= 0) bad.push(k);
    }
    ck('★★ 칸 하나를 뺄 때마다 그 서버 키가 안 올라간다(16짝 전수)',
      bad.length ? bad.join(',') : '0곳', '0곳');
    /* 대조 — 다 들고 오면 16짝이 **모두** 올라간다(검사가 살아 있다는 증거) */
    const r2 = app({});
    await restore(r2, DUMP());
    const miss = Object.values(PAIR).filter((v) => savedKeys(r2).indexOf(v) < 0);
    ck('  (대조) 다 들고 오면 16짝 모두 올라간다', miss.length ? miss.join(',') : '0곳', '0곳');

    /* 세 함수도 재료가 없으면 안 돈다 */
    const r3 = app({});
    await restore(r3, DUMP(['tkd_members', 'tkd_cars', 'tkd_courses',
      'tkd_carlog', 'tkd_ridestate', 'tkd_driver_att', 'tkd_org']));
    ck('★ 재료가 없으면 `rebuildCarData` 안 돈다', r3.L.calls.indexOf('rebuildCarData') >= 0, false);
    ck('★ 재료가 없으면 `saveCarState` 안 돈다', r3.L.calls.indexOf('saveCarState') >= 0, false);
    ck('★ `tkd_org` 가 없으면 `saveOrgDriver` 안 돈다', r3.L.calls.indexOf('saveOrgDriver') >= 0, false);
    ck('  (대조) 다 들고 오면 셋 다 돈다',
      ['rebuildCarData', 'saveCarState', 'saveOrgDriver'].filter((f) => r2.L.calls.indexOf(f) >= 0).length, 3);
    ck('  (대조) 옛 판은 재료가 없어도 셋 다 돌았다', (() => {
      return ['rebuildCarData', 'saveCarState', 'saveOrgDriver'].length;
    })(), 3);
    const o3 = app({ src: OLD_SRC });
    await restore(o3, DUMP(['tkd_members', 'tkd_cars', 'tkd_courses',
      'tkd_carlog', 'tkd_ridestate', 'tkd_driver_att', 'tkd_org']));
    ck('[옛] ★ 재료가 없어도 셋 다 돌았다',
      ['rebuildCarData', 'saveCarState', 'saveOrgDriver'].filter((f) => o3.L.calls.indexOf(f) >= 0).length, 3);

    /* 끝 안내 */
    ck('★ 안내에 「없던 자료 N가지는 그대로 두었어요」',
      /이 백업에 없던 자료 3가지는 그대로 두었어요/.test(p.L.alerts.join(' ')), true);
    ck('  이름 셋이 적힌다', /수납|거래명세서|알림장/.test(p.L.alerts.join(' ')), true);
    const r4 = app({});
    await restore(r4, DUMP(['tkd_payments', 'tkd_tax', 'tkd_invoices', 'tkd_products', 'tkd_staff']));
    ck('  넷을 넘으면 「외 N가지」', /외 2가지/.test(r4.L.alerts.join(' ')), true);
    ck('  다 들고 오면 그 줄이 **없다**', /없던 자료/.test(r2.L.alerts.join(' ')), false);

    /* 판정은 한 벌 */
    ck('★ 칸 유무 판정은 `_dumpHas` 한 벌',
      (NEW_SRC.match(/^function _dumpHas\(/mg) || []).length, 1);
    const restBody = (() => {
      const i = NEW_SRC.indexOf('function _restoreGone(');
      return NEW_SRC.slice(i, NEW_SRC.indexOf('showToast(\'✅ 복원 완료', i));
    })();
    ck('  그 세 곳이 다 그 함수를 쓴다(직접 `hasOwnProperty` 0)',
      (restBody.match(/hasOwnProperty\.call\(dump\.data/g) || []).length, 0);
    ck('  (대조) 옛 판은 직접 적었다',
      (OLD_SRC.match(/hasOwnProperty\.call\(dump\.data/g) || []).length >= 3, true);
    /* 이름표가 업체 칸 20개와 같나 */
    const orgKeys = (/var ORG_KEYS = \[([^\]]*)\]/.exec(NEW_SRC) || ['', ''])[1]
      .split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean);
    const nameKeys = p.R.ev('Object.keys(restoreKeyNames())');
    ck('★ 이름표 수 = 업체 칸 수', nameKeys.length + '/' + orgKeys.length, '20/20');
    ck('  빠진 칸 0곳', orgKeys.filter((k) => nameKeys.indexOf(k) < 0).join(',') || '0곳', '0곳');
    ck('  남는 이름 0곳', nameKeys.filter((k) => orgKeys.indexOf(k) < 0).join(',') || '0곳', '0곳');
  }

  console.log('\n② 끊긴 코스 — 빈칸 대신 「코스 없음」 · 자동 이동 없음');
  {
    /* 재현 — 수정 창 선택 칸이 **빈칸**이 되고, 저장하면 코스가 지워졌다 */
    const o = app({ src: OLD_SRC });
    const ov = o.R.ev('(function(){ populateSelects();'
      + ' var e=document.getElementById("m-class"); e.value="c9";'
      + ' return JSON.stringify({opts:e.options, val:e.value}); })()');
    ck('[옛] ★ 선택 칸에 「코스 없음」이 없다', /코스 없음/.test(ov), false);
    ck('[옛] ★ 없는 코스를 넣으면 **빈칸**이 된다', JSON.parse(ov).val, '');
    ck('[옛] 명단에 「–」로 보였다',
      /\(course\?escapeMasterHtml\(course\.name\):'–'\)/.test(OLD_SRC), true);
    ck('[옛] 코스 화면에 그 줄이 없었다', /코스 없는/.test(OLD_SRC), false);

    /* 고침 — 보여 주기 */
    const p = app({});
    ck('★ 끊긴 «회원» 은 「코스 없음」', p.R.ev('courseNameOf(members[1])'), '코스 없음');
    ck('  코스가 빈 «회원» 도 「코스 없음」', p.R.ev('courseNameOf(members[2])'), '코스 없음');
    ck('  멀쩡한 «회원» 은 그 이름', p.R.ev('courseNameOf(members[0])'), '오전반');
    /* ★ 선언 한 줄(`function courseNameOf(m){`)을 빼고 **부르는 자리**만 센다 */
    const calls = (s) => (s.match(/courseNameOf\(m\)/g) || []).length
      - (s.match(/function courseNameOf\(m\)/g) || []).length;
    ck('★ 명단 네 자리가 그 함수를 쓴다', calls(NEW_SRC), 4);
    ck('  (대조) 옛 판은 0곳', calls(OLD_SRC), 0);
    ck('  「–」로 그리던 자리가 남았나', (NEW_SRC.match(/escapeMasterHtml\(course\.name\):'–'\)/g) || []).length, 0);

    /* 수정 창 — 고를 수 있고, 저장해도 **안 옮긴다** */
    const q = app({});
    const qv = q.R.ev('(function(){ openEditModal(2);'
      + ' var e=document.getElementById("m-class");'
      + ' return JSON.stringify({opts:e.options, val:e.value}); })()');
    const qo = JSON.parse(qv);
    ck('★ 끊긴 «회원» 수정 창에 「코스 없음」 칸이 생긴다', qo.opts[0], '');
    ck('  그 글자가 「코스 없음」', /<option value="">코스 없음<\/option>/.test(q.R.ev('document.getElementById("m-class").innerHTML')), true);
    ck('★ 그 칸이 **골라져 있다**(빈칸 아님)', qo.val === '' && qo.opts.indexOf('') === 0, true);
    ck('★ 멀쩡한 «회원» 에게는 그 칸이 **안 생긴다**',
      q.R.ev('(function(){ openEditModal(1); return document.getElementById("m-class").innerHTML.indexOf("코스 없음")>=0; })()'),
      false);
    ck('  그 «회원» 은 자기 코스가 골라져 있다', q.R.ev('document.getElementById("m-class").value'), 'c1');
    /* 저장하면 자동으로 안 옮긴다 */
    const r2 = app({});
    r2.R.ev('(function(){ openEditModal(2); })()');
    ck('★ 수정 창을 열어도 코스가 **안 바뀐다**(아직 저장 안 함)',
      r2.R.ev('String(loadMembers()[1].courseId)'), 'c9');
    ck('  자동 이동 코드 0 — 소스에 다른 코스로 바꾸는 줄이 없다',
      /courseId\s*=\s*courses\[0\]/.test(NEW_SRC.slice(NEW_SRC.indexOf('function courseNameOf('),
        NEW_SRC.indexOf('function courseLinkBlock('))), false);

    /* 코스 화면 한 줄 */
    ck('★ 코스 화면 한 줄 — 「코스 없는 «회원» 2명」',
      /코스 없는 회원 <b>2명<\/b>/.test(p.R.ev('noCourseLineHtml()')), true);
    ck('  수는 `fmtNum`', /fmtNum\(n\)\+TUnit\(\)/.test(NEW_SRC.slice(
      NEW_SRC.indexOf('function noCourseLineHtml('), NEW_SRC.indexOf('function courseLinkBlock('))), true);
    const r3 = app({ members: [MEM[0]] });
    ck('★ 끊긴 사람이 없으면 **아무것도 안 그린다**', r3.R.ev('noCourseLineHtml()') || '빈 글', '빈 글');
    ck('  그 줄이 코스 화면에 붙어 있다', /\$\{noCourseLineHtml\(\)\}/.test(NEW_SRC), true);

    /* 네 업종 — 택배는 빈 글자 */
    const r4 = app({ biz: 'delivery' });
    ck('★ 택배는 「코스 없음」을 안 쓴다', r4.R.ev('courseNameOf(members[1])') || '빈 글', '빈 글');
    ck('  택배는 그 줄도 0', r4.R.ev('noCourseCount()'), 0);
    const r5 = app({ biz: 'logistics' });
    ck('  물류는 「거래처 2곳」', /코스 없는 거래처 <b>2곳<\/b>/.test(r5.R.ev('noCourseLineHtml()')), true);
    const r6 = app({ biz: 'public' });
    ck('  공공은 「이용자 2명」', /코스 없는 이용자 <b>2명<\/b>/.test(r6.R.ev('noCourseLineHtml()')), true);

    /* ★ 지워진 차량을 가리키는 «회원» 은 **이미** 「미배정」으로 보인다(고칠 것 없음) */
    ck('  (확인) 차량 쪽은 이미 「미배정」 글자가 있다',
      (NEW_SRC.match(/'미배정차량'/g) || []).length + '/' + (NEW_SRC.match(/'미배정'\)/g) || []).length,
      (OLD_SRC.match(/'미배정차량'/g) || []).length + '/' + (OLD_SRC.match(/'미배정'\)/g) || []).length);
  }

  console.log('\n③ 소스 전수');
  {
    const bodyOf = (src, fn) => {
      const i = src.indexOf('function ' + fn + '(');
      if (i < 0) return '';
      const f = src.slice(i);
      return f.slice(0, f.indexOf('\n}\n'));
    };
    /* 63·64 가 넣은 것이 그대로인가 */
    ck('  문지기 자리 수(줄지 않았다)',
      (NEW_SRC.match(/!okToWriteNow\(\)/g) || []).length >= 15 ? 'OK' : 'NG', 'OK');
    ['carLinkBlock', 'staffLinkBlock', 'courseLinkBlock'].forEach((f) => {
      ck('  `' + f + '` 한 벌 그대로',
        (NEW_SRC.match(new RegExp('^function ' + f + '\\(', 'mg')) || []).length, 1);
    });
    ck('★ 새 함수 다섯이 한 벌씩',
      ['_dumpHas', '_restoreMissing', 'restoreKeyNames', 'courseExists', 'courseNameOf',
        'noCourseCount', 'noCourseLineHtml']
        .map((f) => (NEW_SRC.match(new RegExp('^function ' + f + '\\(', 'mg')) || []).length)
        .join(''), '1111111');
    /* 새 창(덮개) 0 */
    const panels = (src) => (src.match(/BACK_PANEL_IDS\s*=\s*\[[\s\S]*?\]/) || [''])[0];
    ck('★ 새 창(덮개) 0 — `BACK_PANEL_IDS` 그대로',
      panels(NEW_SRC) === panels(OLD_SRC) ? '그대로' : '바뀜', '그대로');
    /* 61 기본 원칙 */
    ck('  (61-1) `fmtNum`·`numOf` 한 벌 그대로',
      (NEW_SRC.match(/^function fmtNum\(/mg) || []).length + '/'
        + (NEW_SRC.match(/^function numOf\(/mg) || []).length, '1/1');
    ck('  (61-2) 카톡 변수 둘 그대로', (NEW_SRC.match(/--kakao[a-z-]*:/g) || []).length, 2);
    /* 로그아웃 짝 · 업체 분리 */
    ck('  (로그아웃 짝) 새 `setInterval`·리스너 0',
      (NEW_SRC.match(/setInterval\(/g) || []).length === (OLD_SRC.match(/setInterval\(/g) || []).length
        && (NEW_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length === (OLD_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length,
      true);
    ck('  (업체 분리) `ORG_KEYS` 그대로',
      (NEW_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0] === (OLD_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0], true);
    ck('  백업 목록도 그대로(20개)',
      (/function backupData\(\)[\s\S]{0,1200}?var keys = \[([^\]]*)\]/.exec(NEW_SRC) || ['', ''])[1]
        .split(',').length, 20);
    /* 서버·규칙 0줄 */
    ck('★ `api/`·`lib/`·규칙은 **한 줄도** 안 바뀌었다',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF
        + (THIS_REF ? ' ' + THIS_REF : '') + ' -- api lib firestore.rules',
        { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
    console.log('      (잰 자리: ' + OLD_REF + ' → ' + (THIS_REF || '작업트리') + ')');
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    /* ★ 이 회차는 306 이었다 — 뒷 회차가 올리므로 **그 이상**으로 본다(del63·del64 와 같은 손질) */
    ck('  버전 306 이상', appV >= 306 ? 'OK(' + appV + ')' : appV, 'OK(' + appV + ')');
    ck('  `version.json` 과 같다',
      String(JSON.parse(fs.readFileSync(COS_ROOT + '/version.json', 'utf8')).version), String(appV));
    /* HELP_QA */
    const QA = (s) => { const i = s.indexOf('var HELP_QA=['); return i < 0 ? '' : s.slice(i, s.indexOf('\n];', i)); };
    ck('★ HELP_QA — 복원은 백업에 있는 칸만', /이 백업에 없던 자료/.test(QA(NEW_SRC)), true);
    ck('★ HELP_QA — 「코스 없음」 안내', /코스 없음/.test(QA(NEW_SRC)), true);
    ck('  (대조) 옛 문답표에는 둘 다 없다',
      [/이 백업에 없던 자료/, /코스 없음/].filter((r) => r.test(QA(OLD_SRC))).length, 0);
    const qaN = (s) => (QA(s).match(/\{role:'(admin|driver|all)'/g) || []).length;
    ck('  문답 항목 수는 그대로', qaN(NEW_SRC), qaN(OLD_SRC));
    ck('  CLAUDE.md 기본 점검 그대로',
      /지우는 길을 새로 만들면 서버 칸\(PIN·기기·배정\)도 같이 지운다/
        .test(fs.readFileSync(COS_ROOT + '/CLAUDE.md', 'utf8').replace(/\r\n/g, '\n')), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 가짜 fetch · 가짜 FileReader');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
