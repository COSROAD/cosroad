/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드63 — **삭제 단순판** (v304).
   사장님 판단(11-10 01:04~01:08): 62-B(서버가 스스로 맞대어 지우는 장치)는 복잡하다 →
   **지우는 눈에 보이는 자리**에서 처리한다.
   ① 재현 — 삭제 여섯 곳에 **문지기가 없다**(첫 동기화 전에 서버 PIN 만 사라진다) ·
      「전체 삭제」는 **로컬 한 줄**이라 서버 명단·PIN 이 그대로다 · 복원은 **사라지는 사람·차량**의
      서버 칸을 안 지운다 · 차량·직원 삭제가 **말없이** 남의 값을 고친다
   ② 고침 — 삭제 **여섯 곳** 맨 앞 `okToWriteNow()`
   ③ 「전체 삭제」 — 자동 백업 먼저(안 되면 멈춤) · PIN 실패자는 남김 · **서버에도 저장**
   ④ 「복원」 — 사라지는 것만 지움 · 실패해도 복원 진행 · 돌아온 사람 「PIN 다시」 ·
      ★ 백업에 그 칸이 **없으면 0건**(없는 것을 「전부 사라졌다」로 읽지 않는다)
   ⑤ 연결은 「먼저 해제하세요」 — 차량→«회원»·도우미 · 직원→동승 차량 ·
      ★ **지나간 기록**(출결·수납)은 **막지 않는다**
   ⑥ 소스 전수 — 문지기 수 · 61 기본 원칙 · `api/`·`lib/`·규칙 0줄
   ★ 바깥 통신 0 — 가짜 fetch. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

const OLD_REF = process.env.COS_SRC_OLD_REF || '1609c0b';   /* v303 — 고치기 전 */
const NEW_SRC = fs.readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
/* ★ 이 회차 커밋 — **버전 글자로 찾는다**(해시를 손으로 박으면 커밋 전에는 적을 수 없다).
   못 찾으면(커밋 전) 작업트리를 본다. 그래서 커밋 뒤에는 **두 커밋 사이**가 된다
   (CLAUDE.md 검사 묶음 규칙 · 다음 회차에 거짓으로 깨지지 않는다). */
const THIS_REF = (() => {
  if (process.env.COS_API_NEW_REF) return process.env.COS_API_NEW_REF;
  try {
    const h = cp.execSync('git -C ' + COS_ROOT
      + ' log --format=%H -1 --fixed-strings --grep=(v304)').toString().trim();
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
const CARS = [
  { id: 'car1', name: '1호차', helperStaffId: 'st1' },     /* «회원» 둘 + 도우미 */
  { id: 'car2', name: '2호차' },                           /* «회원» 하나 */
  { id: 'car3', name: '3호차' }                            /* 연결 없음 */
];
const MEM = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1',
    lat: 37.41, lon: 126.68, phone: '010-1', hasPin: true },
  { id: 2, name: '나다움', carId: 'car1', carIdDrop: 'car1', courseId: 'c1', days: D7,
    location: '인천 2', lat: 37.42, lon: 126.69, phone: '010-2', hasPin: true },
  { id: 3, name: '다가을', carId: 'car2', courseId: 'c1', days: D7, location: '인천 3',
    lat: 37.43, lon: 126.70, phone: '010-3' },                        /* PIN 없음 */
  { id: 4, name: '라여름', carId: '', courseId: 'c1', days: D7, location: '인천 4',
    lat: 37.44, lon: 126.71, phone: '010-4' }                         /* 차량 없음 */
];
const STAFF = [
  { id: 'st1', name: '최직원', hasPin: true },     /* 1호차 동승 도우미 */
  { id: 'st2', name: '한직원', hasPin: true }      /* 배정 없음 */
];
const SUF = '__B';

function app(opt) {
  opt = opt || {};
  const src = opt.src || NEW_SRC;
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(opt.members || MEM);
  store['tkd_cars' + SUF] = JSON.stringify(opt.cars || CARS);
  store['tkd_courses' + SUF] = JSON.stringify([{ id: 'c1', name: 'A반', depart: '15:00' }]);
  store['tkd_staff' + SUF] = JSON.stringify(opt.staff || STAFF);
  store['tkd_org' + SUF] = JSON.stringify({ name: '가온학원', icon: '🚐', bizType: 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  /* 지나간 기록 — 출결·수납이 있어도 **막지 않아야** 한다(⑤) */
  store['tkd_attendance' + SUF] = JSON.stringify({ '2026-11-01': { 1: 'present', 3: 'present' } });
  store['tkd_payments' + SUF] = JSON.stringify({ '1_2026_11': { amount: 150000 } });
  const R = E.build({ src: src, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  const ids = new Set(['admin-content', 'app-content', 'member-list', 'admin-search',
    'main-header', 'today-date', 'org-name-display', 'org-icon', 'confirm-modal',
    'confirm-ok-btn', 'bulk-del-btn', 'driver-att-host']);
  (src.match(/id="[a-zA-Z0-9_-]+"/g) || []).forEach((x) => ids.add(x.slice(4, -1)));
  ids.forEach((id) => {
    const el = E.makeEl('input'); el.id = id;
    const bag = {};
    el.setAttribute = (k, v) => { bag[k] = String(v); };
    el.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null);
    el.removeAttribute = (k) => { delete bag[k]; };
    R.byId[id] = el;
  });
  /* 가짜 **서버 전용 칸** — 이 묶음의 핵심은 「여기가 지워졌나 / 남았나」다 */
  const SRV = {
    driverPins: { B_car1: 1, B_car2: 1, B_car3: 1 },
    driverDevices: { B_car1: 1, B_car2: 1, B_car3: 1 },
    helperOfCar: { car1: 'st1' },
    staffPins: { B_st1: 1, B_st2: 1 },
    memberPins: { B_1: 1, B_2: 1 }
  };
  const L = { api: [], alerts: [], toasts: [], saved: [], files: [] };
  R.sandbox.alert = R.win.alert = (m) => { L.alerts.push(String(m)); };
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userUid='uB';"
     + " window._userBizType='academy'; window._userPaidUntil=Date.now()+1e9;");
  /* 첫 동기화 깃발 — `opt.preSync` 면 **켜지 않는다**(문지기 재현·대조) */
  if (!opt.preSync) R.ev('_firstSyncOk=true;');
  R.ev("window._auth={ currentUser:{ isAnonymous:false, getIdToken:function(){ return Promise.resolve('tok'); } } };");
  R.ev('showToast = function(m){ window.__t(String(m)); };');
  R.sandbox.__t = R.win.__t = (m) => { L.toasts.push(String(m)); };
  /* 서버 저장은 **무엇을 올렸나**까지 적어 둔다(「전체 삭제」가 서버에도 저장하나) */
  R.ev('saveToFirebase = function(k,v){ window.__sv(k, JSON.stringify(v===undefined?null:v)); return Promise.resolve(true); };');
  R.sandbox.__sv = R.win.__sv = (k, v) => { L.saved.push(k + ':' + v); };
  R.ev('saveCarState = function(){ return Promise.resolve(true); };'
     + ' rebuildCarData = function(){}; refreshDriverAttHost = function(){};'
     + ' renderAdminTab = function(){}; renderMembers = function(){};'
     + ' saveOrgDriver = function(){}; _atSetBase = function(){};'
     + ' driverInfoLoad = function(){ return Promise.resolve(); };');
  if (opt.demo) R.ev('isDemoMode = function(){ return true; };');
  /* 백업 파일 — 진짜 브라우저에는 Blob·URL 이 있다. `opt.blobFail` 이면 던진다(백업 실패 길) */
  R.sandbox.Blob = R.win.Blob = function (parts) {
    if (opt.blobFail) throw new Error('Blob 못 만듦');
    L.files.push(String((parts && parts[0]) || ''));
  };
  R.sandbox.URL = R.win.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
  R.sandbox.fetch = R.win.fetch = async (url, init) => {
    const body = JSON.parse((init && init.body) || '{}');
    L.api.push(body);
    if (opt.failAt && body.action === opt.failAt
        && (!opt.failId || String(opt.failId) === String(body.memberId || body.staffId || body.carId))) {
      if (opt.mode === 'expired') {
        return { json: async () => ({ ok: false, why: 'expired',
          message: '업체 이용 기간이 끝났어요. 연장하시면 바로 다시 됩니다.' }) };
      }
      return { json: async () => ({ ok: false, message: '지우지 못했어요.' }) };
    }
    if (body.action === 'removeDriverPin') {
      delete SRV.driverPins['B_' + body.carId];
      delete SRV.driverDevices['B_' + body.carId];
      return { json: async () => ({ ok: true }) };
    }
    if (body.action === 'unbindDevice') {
      delete SRV.driverDevices['B_' + (body.carId || '')];
      if (body.staffId) delete SRV.driverDevices['B_hlp_' + body.staffId];
      return { json: async () => ({ ok: true }) };
    }
    if (body.action === 'setCarHelper') {
      if (!body.staffId) delete SRV.helperOfCar[body.carId];
      else SRV.helperOfCar[body.carId] = body.staffId;
      return { json: async () => ({ ok: true }) };
    }
    if (body.action === 'removeMemberPin') {
      delete SRV.memberPins['B_' + body.memberId];
      return { json: async () => ({ ok: true }) };
    }
    if (body.action === 'removeStaffPin') {
      delete SRV.staffPins['B_' + body.staffId];
      delete SRV.driverDevices['B_hlp_' + body.staffId];
      Object.keys(SRV.helperOfCar).forEach((c) => {
        if (String(SRV.helperOfCar[c]) === String(body.staffId)) delete SRV.helperOfCar[c];
      });
      return { json: async () => ({ ok: true }) };
    }
    return { json: async () => ({ ok: true }) };
  };
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return { R, SRV, L };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* 확인 창의 「삭제」를 누른 것 — `confirmOk()` 는 async 콜백을 안 기다리므로 직접 받아 기다린다 */
const press = async (p, code) => {
  p.R.ev(code);
  const cb = p.R.sandbox._confirmCallback;
  if (typeof cb !== 'function') return 'NOCB';
  try { await cb(); } catch (e) { return 'THROW:' + e.message; }
  await wait(40);
  return 'ok';
};
const carNames = (p) => p.R.ev('loadCars().map(function(c){return c.name;}).join(",")');
const memNames = (p) => p.R.ev('loadMembers().map(function(m){return m.name;}).join(",")');
const stNames = (p) => p.R.ev('loadStaff().map(function(s){return s.name;}).join(",")');
const srvAll = (p) => Object.keys(p.SRV.driverPins).join(',') + '|'
  + Object.keys(p.SRV.driverDevices).join(',') + '|' + JSON.stringify(p.SRV.helperOfCar)
  + '|' + Object.keys(p.SRV.staffPins).join(',') + '|' + Object.keys(p.SRV.memberPins).join(',');
const acts = (p) => p.L.api.map((x) => x.action).join(',') || '없음';
/* 「복원」을 누른 것 — 가짜 FileReader 로 백업 글을 흘려 넣는다 */
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
  if (typeof cb !== 'function') return { r: 'NOCB', ev: ev };
  try { await cb(); } catch (e) { return { r: 'THROW:' + e.message, ev: ev }; }
  await wait(40);
  return { r: 'ok', ev: ev };
};
const DUMP = (over) => {
  const d = { _app: 'COSROAD', _version: 1, _date: '2026-11-01T00:00:00.000Z', data: {} };
  d.data['tkd_members'] = JSON.stringify([MEM[1], MEM[3]]);        /* 1·3 번이 사라진다 */
  d.data['tkd_staff'] = JSON.stringify([STAFF[1]]);                /* st1 이 사라진다 */
  d.data['tkd_cars'] = JSON.stringify([CARS[1], CARS[2]]);         /* car1 이 사라진다 */
  d.data['tkd_org'] = JSON.stringify({ name: '가온학원', bizType: 'academy' });
  if (over) over(d);
  return d;
};

(async () => {
  console.log('════ ① 재현 — 고치기 전 ' + OLD_REF + ' (v303)');
  {
    /* (가) 문지기가 없다 — 첫 동기화 전에 **서버 PIN 만** 사라진다 */
    const o = app({ src: OLD_SRC, preSync: true });
    ck('[옛] 첫 동기화 전인가', o.R.ev('okToWriteNow()'), false);
    await press(o, 'deleteStaff("st2");');
    ck('[옛] ★ 직원 삭제가 **서버를 불렀다**', acts(o), 'removeStaffPin');
    ck('[옛]   서버 PIN 이 사라졌다', Object.keys(o.SRV.staffPins).join(','), 'B_st1');
    const o2 = app({ src: OLD_SRC, preSync: true });
    await press(o2, 'deleteMemberById(1);');
    ck('[옛] ★ «회원» 삭제도 서버를 불렀다', acts(o2), 'removeMemberPin');

    /* (나) 「전체 삭제」는 **로컬 한 줄**이었다 */
    const o3 = app({ src: OLD_SRC });
    await press(o3, 'resetData();');
    ck('[옛] 명단은 비었다', memNames(o3) || '0명', '0명');
    ck('[옛] ★ **서버에 저장하지 않았다**(새로고침하면 되살아난다)',
      o3.L.saved.filter((s) => s.indexOf('members:') === 0).length, 0);
    ck('[옛] ★ 서버 «회원» PIN 이 **그대로**', Object.keys(o3.SRV.memberPins).join(','), 'B_1,B_2');
    ck('[옛] ★ 백업 파일도 안 만들었다', o3.L.files.length, 0);
    ck('[옛]   그 자리가 한 줄이었다',
      /localStorage\.removeItem\('tkd_members'\);\n\s*members=loadMembers\(\);/.test(OLD_SRC), true);

    /* (다) 복원은 **사라지는 것**의 서버 칸을 안 지웠다 */
    const o4 = app({ src: OLD_SRC });
    await restore(o4, DUMP());
    ck('[옛] 복원은 됐다', memNames(o4), '나다움,라여름');
    ck('[옛] ★ 사라진 사람·차량의 서버 칸이 **그대로**', srvAll(o4),
      'B_car1,B_car2,B_car3|B_car1,B_car2,B_car3|{"car1":"st1"}|B_st1,B_st2|B_1,B_2');
    ck('[옛]   그 함수들이 아예 없었다',
      /_restoreGone|_wipeGoneServer/.test(OLD_SRC), false);

    /* (라) 차량·직원 삭제가 **말없이** 남의 값을 고쳤다 */
    const o5 = app({ src: OLD_SRC });
    await press(o5, 'currentCarTab=0; deleteCurrentCar();');
    ck('[옛] ★ 차량 삭제가 «회원» 배정을 **말없이 비웠다**',
      o5.R.ev('loadMembers().slice(0,2).map(function(m){return (m.carId||"-")+"/"+(m.carIdDrop||"-");}).join(" ")'),
      '-/- -/-');
    ck('[옛]   안내는 없었다', o5.L.alerts.length, 0);
    const o6 = app({ src: OLD_SRC });
    await press(o6, 'deleteStaff("st1");');
    ck('[옛] ★ 직원 삭제가 동승 배정을 **말없이 비웠다**',
      o6.R.ev('loadCars().map(function(c){return c.helperStaffId||"-";}).join(",")'), '-,-,-');
  }

  console.log('\n② 고침 — 삭제 **여섯 곳** 맨 앞 문지기');
  {
    const six = [
      ['deleteStaff', 'deleteStaff("st2");', () => stNames],
      ['deleteCurrentCar', 'currentCarTab=2; deleteCurrentCar();', () => carNames],
      ['deleteMemberById', 'deleteMemberById(1);', () => memNames],
      ['bulkDeleteMembers', '_memberSel={1:true}; bulkDeleteMembers();', () => memNames],
      ['resetData', 'resetData();', () => memNames]
    ];
    for (const [name, code, pick] of six) {
      const p = app({ preSync: true });
      const before = pick()(p);
      const r = await press(p, code);
      ck('★ ' + name + ' — 서버 호출 0', p.L.api.length, 0);
      ck('  ' + name + ' — 확인 창도 안 뜬다(아무것도 안 지움)', r, 'NOCB');
      ck('  ' + name + ' — 자료 그대로', pick()(p), before);
      ck('  ' + name + ' — 왜 안 됐는지 알린다',
        /자료를 불러오는 중이라 삭제은? ?저장하지 않았어요|자료를 불러오는 중/.test(p.L.toasts.join(' ')), true);
    }
    /* 복원도 같은 문지기 — 고른 파일 칸을 비우고 돌아간다 */
    const q = app({ preSync: true });
    const got = await restore(q, DUMP());
    ck('★ restoreData — 확인 창도 안 뜬다', got.r, 'NOCB');
    ck('  restoreData — 서버 호출 0', q.L.api.length, 0);
    ck('  restoreData — 서버 저장 0', q.L.saved.length, 0);
    ck('  restoreData — 고른 파일 칸을 비운다', got.ev.target.value, '');
    ck('  restoreData — 안내', /자료를 불러오는 중/.test(q.L.toasts.join(' ')), true);
    /* 대조 — 동기화가 끝난 뒤에는 **그대로 된다**(막아만 두면 기능이 죽는다) */
    const r2 = app({});
    await press(r2, 'currentCarTab=2; deleteCurrentCar();');
    ck('(대조) 동기화 뒤에는 지워진다', carNames(r2), '1호차,2호차');
  }

  console.log('\n③ 「전체 삭제」 — 백업 먼저 · PIN 실패자는 남김 · 서버에도 저장');
  {
    const p = app({});
    await press(p, 'resetData();');
    ck('★ 백업 파일을 **먼저** 만들었다', p.L.files.length, 1);
    ck('  그 안에 명단이 들어 있다', /가하은/.test(p.L.files[0] || ''), true);
    ck('★ PIN 있는 «회원» 둘의 서버 PIN 을 지웠다',
      p.L.api.map((x) => x.action + ':' + x.memberId).join(','),
      'removeMemberPin:1,removeMemberPin:2');
    ck('  서버 «회원» PIN 이 비었다', Object.keys(p.SRV.memberPins).join(',') || '없음', '없음');
    ck('★ 명단이 비었다', memNames(p) || '0명', '0명');
    ck('★ **서버에도 저장했다**', p.L.saved.filter((s) => s === 'members:[]').length, 1);
    ck('  안내에 수가 든다(천단위 한 벌)',
      /전체\(4(명|곳)\)를 지웠어요/.test(p.L.toasts.join(' ')), true);

    /* 백업이 안 되면 **아무것도 지우지 않는다** */
    const q = app({ blobFail: true });
    await press(q, 'resetData();');
    ck('★ [백업 실패] 아무것도 안 지웠다', memNames(q), '가하은,나다움,다가을,라여름');
    ck('  [백업 실패] 서버 호출 0', q.L.api.length, 0);
    ck('  [백업 실패] 안내', /백업 파일을 만들지 못해 전체 삭제를 멈췄어요/.test(q.L.alerts.join(' ')), true);

    /* 서버 PIN 을 못 지운 사람은 **남긴다**(선택 삭제 v303 과 같은 꼴) */
    const r2 = app({ failAt: 'removeMemberPin', failId: 2 });
    await press(r2, 'resetData();');
    ck('★ [PIN 하나 실패] 그 사람만 남았다', memNames(r2), '나다움');
    ck('  [PIN 하나 실패] 서버에 그 해시가 남아 다시 지울 수 있다',
      Object.keys(r2.SRV.memberPins).join(','), 'B_2');
    ck('  [PIN 하나 실패] 「남겨 두었어요」',
      /1(명|곳)은 서버 PIN 을 못 지워 남겨 두었어요/.test(r2.L.toasts.join(' ')), true);
    /* 기간 끝은 서버 안내 그대로 */
    const r3 = app({ failAt: 'removeMemberPin', mode: 'expired' });
    await press(r3, 'resetData();');
    ck('  [기간 끝] 서버 안내 그대로',
      /이용 기간이 끝났어요[\s\S]*연장/.test(r3.L.alerts.join(' ')), true);
    /* 확인 창 글 */
    ck('★ 확인 창에 「백업 파일을 받아 둡니다」',
      /되돌릴 수 없어요\.\\n지우기 전에 백업 파일을 받아 둡니다/.test(NEW_SRC), true);
  }

  console.log('\n④ 「복원」 — 사라지는 것만 지움 · 실패해도 복원은 진행');
  {
    const p = app({});
    await restore(p, DUMP());
    ck('★ 사라진 «회원»(PIN 있음)·직원·차량의 서버 칸을 지웠다', srvAll(p),
      'B_car2,B_car3|B_car2,B_car3|{}|B_st2|B_2');
    ck('  부른 창구',
      p.L.api.map((x) => x.action).join(','),
      'removeMemberPin,removeStaffPin,removeDriverPin,unbindDevice,setCarHelper');
    ck('  복원도 됐다', memNames(p), '나다움,라여름');
    ck('★ PIN 없이 사라진 «회원»(3번)은 서버를 안 부른다',
      p.L.api.filter((x) => x.action === 'removeMemberPin').map((x) => x.memberId).join(','), '1');
    ck('  안내에 지운 수가 든다', /사라진 3건의 서버 PIN·기기·배정을 지웠어요/.test(p.L.alerts.join(' ')), true);

    /* 실패해도 복원은 멈추지 않는다 — 수만 알린다 */
    const q = app({ failAt: 'removeStaffPin' });
    await restore(q, DUMP());
    ck('★ [직원 실패] 복원은 **그대로 됐다**', memNames(q), '나다움,라여름');
    ck('  [직원 실패] 그 서버 PIN 은 남았다', Object.keys(q.SRV.staffPins).join(','), 'B_st1,B_st2');
    ck('  [직원 실패] 「지우지 못했어요」', /1건은 서버에서 지우지 못했어요/.test(q.L.alerts.join(' ')), true);

    /* ★★ 백업에 그 칸이 **없으면** 0건 — 없는 것을 「전부 사라졌다」로 읽지 않는다 */
    const r2 = app({});
    await restore(r2, DUMP((d) => { delete d.data['tkd_members']; delete d.data['tkd_staff']; delete d.data['tkd_cars']; }));
    ck('★★ [칸 없음] 서버를 **하나도** 안 지웠다', srvAll(r2),
      'B_car1,B_car2,B_car3|B_car1,B_car2,B_car3|{"car1":"st1"}|B_st1,B_st2|B_1,B_2');
    ck('  [칸 없음] 「확인해 주세요」 한 줄', /PIN 있던 분들은 한 번 확인해 주세요/.test(r2.L.alerts.join(' ')), true);
    /* 깨진 글·배열 아님도 같다 */
    const r3 = app({});
    await restore(r3, DUMP((d) => { d.data['tkd_members'] = '{오류'; d.data['tkd_staff'] = '{"a":1}'; }));
    ck('  [깨진 글·배열 아님] «회원»·직원은 안 본다',
      r3.L.api.filter((x) => x.action === 'removeMemberPin' || x.action === 'removeStaffPin').length, 0);

    /* 돌아온 사람 — 「PIN 을 다시 정해 주세요」 */
    const r4 = app({ members: [MEM[1]], staff: [STAFF[1]] });   /* 지금은 2번·st2 만 있다 */
    await restore(r4, DUMP());                                   /* 백업에는 2번·4번·st2 */
    ck('★ 돌아온 사람 수 안내',
      /PIN 을 다시 정해 주세요 \(0명\)/.test(r4.L.alerts.join(' ')) ? '0명(없음)' : (/PIN 을 다시 정해 주세요/.test(r4.L.alerts.join(' ')) ? '있음' : '없음'), '없음');
    const r5 = app({ members: [MEM[2]], staff: [] });            /* 지금은 PIN 없는 3번만 */
    await restore(r5, DUMP());                                   /* 백업에 2번(PIN)·st2(PIN) 이 돌아온다 */
    ck('★ [돌아옴] 「PIN 을 다시 정해 주세요 (2명)」',
      /PIN 을 다시 정해 주세요 \(2명\)/.test(r5.L.alerts.join(' ')), true);

    /* 둘러보기는 서버를 안 부른다 */
    const r6 = app({ demo: true });
    await restore(r6, DUMP());
    ck('★ 둘러보기 — 서버 호출 0', r6.L.api.length, 0);
  }

  console.log('\n⑤ 연결은 「먼저 해제하세요」 — 지나간 기록은 **막지 않는다**');
  {
    /* 차량 — «회원» 둘 + 도우미 */
    const p = app({});
    const r = await press(p, 'currentCarTab=0; deleteCurrentCar();');
    ck('★ [1호차] 확인 창이 안 뜬다(막힘)', r, 'NOCB');
    ck('  [1호차] 차량 그대로', carNames(p), '1호차,2호차,3호차');
    ck('  [1호차] «회원» 배정 그대로',
      p.R.ev('loadMembers().slice(0,2).map(function(m){return (m.carId||"-")+"/"+(m.carIdDrop||"-");}).join(" ")'),
      'car1/- car1/car1');
    ck('  [1호차] 서버 호출 0', p.L.api.length, 0);
    ck('★ [1호차] «회원» 수가 든다(등원·하원 둘)',
      /배정된 .*2(명|곳).*차량을 먼저 바꿔 주세요/.test(p.L.alerts[0] || ''), true);
    ck('★ [1호차] 도우미 이름이 든다',
      /동승 도우미 최직원 배정을 먼저 해제해 주세요/.test(p.L.alerts[0] || ''), true);

    /* 차량 — «회원» 하나(도우미 없음) */
    const q = app({});
    await press(q, 'currentCarTab=1; deleteCurrentCar();');
    ck('[2호차] «회원» 줄만 뜬다',
      /배정된/.test(q.L.alerts[0] || '') && !/동승 도우미/.test(q.L.alerts[0] || ''), true);

    /* 차량 — 연결 없음 → 지워진다 + 서버 두 걸음(v303 그대로) */
    const r2 = app({});
    await press(r2, 'currentCarTab=2; deleteCurrentCar();');
    ck('★ [3호차] 연결이 없으면 지워진다', carNames(r2), '1호차,2호차');
    ck('  [3호차] 서버 먼저 두 걸음(v303 그대로)', acts(r2), 'removeDriverPin,unbindDevice');
    ck('  [3호차] 안내창 0', r2.L.alerts.length, 0);

    /* 직원 — 동승 배정 있음 / 없음 */
    const r3 = app({});
    const rr = await press(r3, 'deleteStaff("st1");');
    ck('★ [최직원] 막힌다', rr, 'NOCB');
    ck('  [최직원] 명단 그대로', stNames(r3), '최직원,한직원');
    ck('  [최직원] 서버 호출 0', r3.L.api.length, 0);
    ck('★ [최직원] 어느 차량인지 알려 준다',
      /1호차 동승 도우미예요[\s\S]*먼저 해제해 주세요/.test(r3.L.alerts[0] || ''), true);
    const r4 = app({});
    await press(r4, 'deleteStaff("st2");');
    ck('★ [한직원] 배정이 없으면 지워진다', stNames(r4), '최직원');
    ck('  [한직원] 서버 먼저(v300 그대로)', acts(r4), 'removeStaffPin');

    /* ★ 지나간 기록(출결·수납)은 **막지 않는다** — 퇴원생도 지울 수 있어야 한다 */
    const r5 = app({});
    ck('(씨앗) 1번에 출결·수납 기록이 있다',
      r5.R.ev('!!(loadAttendance()["2026-11-01"]||{})[1]') + '/'
        + r5.R.ev('Object.keys(loadPayments()).length>0'), 'true/true');
    await press(r5, 'deleteMemberById(1);');
    ck('★ 기록이 있어도 «회원» 은 지워진다', memNames(r5), '나다움,다가을,라여름');
    ck('  안내창 0(막지 않는다)', r5.L.alerts.length, 0);
    ck('  기록은 **남는다**', r5.R.ev('!!(loadAttendance()["2026-11-01"]||{})[1]'), true);
    /* 「전체 삭제」·「복원」은 막지 않는다 */
    const r6 = app({});
    await press(r6, 'resetData();');
    ck('★ 「전체 삭제」는 연결로 막지 않는다', memNames(r6) || '0명', '0명');
    const r7 = app({});
    await restore(r7, DUMP());
    ck('★ 「복원」도 막지 않는다', memNames(r7), '나다움,라여름');
  }

  console.log('\n⑥ 소스 전수');
  {
    const bodyOf = (src, fn) => {
      const i = src.indexOf('function ' + fn + '(');
      if (i < 0) return '';
      const f = src.slice(i);
      return f.slice(0, f.indexOf('\n}\n'));
    };
    const SIX = ['deleteStaff', 'deleteCurrentCar', 'deleteMemberById', 'bulkDeleteMembers',
      'resetData', 'restoreData'];
    SIX.forEach((f) => {
      const b = bodyOf(NEW_SRC, f);
      ck('★ ' + f + ' 머리에 `okToWriteNow()`',
        b.indexOf('!okToWriteNow()') >= 0 && b.indexOf('!okToWriteNow()') < 1500, true);
      ck('  (대조) 옛 판에는 없다', bodyOf(OLD_SRC, f).indexOf('okToWriteNow()') >= 0, false);
    });
    /* 문지기 자리 전수 — v295 까지 여덟 + 이번 여섯 = **열넷** */
    /* ★★ **그 회차 수는 그 회차 커밋에서** 읽는다 — 작업트리에서 세면 뒷 회차가 문지기를
       더 붙일 때마다 **거짓으로** 깨진다(v305/64 가 코스 삭제에 하나를 더해 겪었다 ·
       `share291` 과 같은 손질). 지금 소스는 「**줄지 않았나**」로만 본다. */
    const THIS_SRC = THIS_REF
      ? cp.execSync('git -C ' + COS_ROOT + ' show ' + THIS_REF + ':index.html',
        { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n')
      : NEW_SRC;
    const gates = (s) => (s.match(/!okToWriteNow\(\)/g) || []).length;
    ck('★ 문지기 자리 수(이 회차 커밋)', gates(THIS_SRC), 14);
    ck('  지금 소스는 **줄지 않았다**',
      gates(NEW_SRC) >= 14 ? 'OK(' + gates(NEW_SRC) + ')' : gates(NEW_SRC),
      'OK(' + gates(NEW_SRC) + ')');
    ck('  (대조) 옛 판은 여덟', (OLD_SRC.match(/!okToWriteNow\(\)/g) || []).length, 8);
    /* 백업이 참·거짓을 돌려주고, 「전체 삭제」가 그 값을 본다 */
    const bk = bodyOf(NEW_SRC, 'backupData');
    ck('★ `backupData` 가 참·거짓을 돌려준다',
      /return true;/.test(bk) && /return false;/.test(bk), true);
    ck('  (대조) 옛 판은 아무것도 안 돌려줬다',
      /return (true|false);/.test(bodyOf(OLD_SRC, 'backupData')), false);
    ck('★ 「전체 삭제」가 그 값을 본다(안 되면 멈춘다)',
      /backupData\(\)!==false[\s\S]{0,200}?if\(!bk\)\{/.test(bodyOf(NEW_SRC, 'resetData')), true);
    /* 복원 — 「칸이 없으면 안 본다」가 **두 함수 모두**에 있다 */
    ['_restoreGone', '_restoreBack'].forEach((f) => {
      ck('★ ' + f + ' — 칸이 없으면 `null`(안 본다)',
        /hasOwnProperty\.call\(dump\.data, k\)\) return null;/.test(bodyOf(NEW_SRC, f)), true);
    });
    ck('★ 복원은 **덮기 전에** 지운다',
      (() => {
        const b = bodyOf(NEW_SRC, 'restoreData');
        return b.indexOf('_wipeGoneServer') >= 0
          && b.indexOf('_wipeGoneServer') < b.indexOf('localStorage.setItem(k, dump.data[k])');
      })(), true);
    ck('  둘러보기는 서버를 안 부른다(한 자리)',
      /isDemoMode\(\)\) return out;/.test(bodyOf(NEW_SRC, '_wipeGoneServer')), true);
    /* 연결 막기 — 공용 함수 **한 벌씩** */
    ck('★ `carLinkBlock` 한 벌', (NEW_SRC.match(/^function carLinkBlock\(/mg) || []).length, 1);
    ck('★ `staffLinkBlock` 한 벌', (NEW_SRC.match(/^function staffLinkBlock\(/mg) || []).length, 1);
    ck('  차량은 `inCarEitherLeg` 로 센다(등원·하원 한 벌 · v273)',
      /inCarEitherLeg\(m, car\.id\)/.test(bodyOf(NEW_SRC, 'carLinkBlock')), true);
    /* 61 기본 원칙 */
    ck('  (61-1) 안내의 수는 `fmtNum`',
      /fmtNum\(n\)\+TUnit\(\)/.test(bodyOf(NEW_SRC, 'carLinkBlock')), true);
    ck('  (61-1) `fmtNum`·`numOf` 한 벌 그대로',
      (NEW_SRC.match(/^function fmtNum\(/mg) || []).length + '/'
        + (NEW_SRC.match(/^function numOf\(/mg) || []).length, '1/1');
    ck('  (61-2) 카톡 변수 둘 그대로', (NEW_SRC.match(/--kakao[a-z-]*:/g) || []).length, 2);
    /* 새 창 0 — 막는 안내는 **네이티브 `alert`·토스트**뿐이다(v278·v293 과 같은 태도).
       새 덮개를 만들면 `BACK_PANEL_IDS` 에 넣어야 하니(화면 규칙 v269), **그 목록이 그대로**면
       덮개를 안 만든 것이다. */
    const panels = (src) => (src.match(/BACK_PANEL_IDS\s*=\s*\[[\s\S]*?\]/) || [''])[0];
    ck('★ 새 창(덮개) 0 — `BACK_PANEL_IDS` 그대로',
      panels(NEW_SRC) === panels(OLD_SRC) ? '그대로' : '바뀜', '그대로');
    const blocks = (s) => (s.match(/if\(_lk\)\{ alert\(_lk\); return; \}/g) || []).length;
    ck('  막는 안내는 `alert` 한 줄(이 회차 커밋)', blocks(THIS_SRC), 2);
    ck('  지금 소스는 **줄지 않았다**',
      blocks(NEW_SRC) >= 2 ? 'OK(' + blocks(NEW_SRC) + ')' : blocks(NEW_SRC),
      'OK(' + blocks(NEW_SRC) + ')');
    /* 로그아웃 짝 — 이번에 더한 전역·타이머·리스너·기기 저장 칸이 **0개**임을 못 박는다 */
    const added = NEW_SRC.length - OLD_SRC.length;
    ck('  (로그아웃 짝) 새 `setInterval`·`onSnapshot` 0',
      (NEW_SRC.match(/setInterval\(/g) || []).length === (OLD_SRC.match(/setInterval\(/g) || []).length
        && (NEW_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length === (OLD_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length,
      true);
    ck('  (로그아웃 짝) `ORG_KEYS` 그대로(새 기기 저장 칸 0)',
      (NEW_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0] === (OLD_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0], true);
    console.log('      (소스가 ' + added + '글자 늘었다)');
    /* 서버·규칙은 안 바뀌었다 — **두 커밋 사이**(커밋 전에는 작업트리) */
    ck('★ `api/`·`lib/`·규칙은 **한 줄도** 안 바뀌었다',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF
        + (THIS_REF ? ' ' + THIS_REF : '') + ' -- api lib firestore.rules',
        { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
    console.log('      (잰 자리: ' + OLD_REF + ' → ' + (THIS_REF || '작업트리') + ')');
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    /* ★ 이 회차는 304 였다 — 뒷 회차가 올리므로 **그 이상**으로 본다 */
    ck('  버전 304 이상', appV >= 304 ? 'OK(' + appV + ')' : appV, 'OK(' + appV + ')');
    ck('  `version.json` 과 같다',
      String(JSON.parse(fs.readFileSync(COS_ROOT + '/version.json', 'utf8')).version), String(appV));
    /* HELP_QA — **문답표 안에서** 찾는다(소스 쪽지에 같은 글자가 있어 전체 검색은 흐려진다) */
    const QA = (() => {
      const i = NEW_SRC.indexOf('var HELP_QA=[');
      return i < 0 ? '' : NEW_SRC.slice(i, NEW_SRC.indexOf('\n];', i));
    })();
    const QAO = (() => {
      const i = OLD_SRC.indexOf('var HELP_QA=[');
      return i < 0 ? '' : OLD_SRC.slice(i, OLD_SRC.indexOf('\n];', i));
    })();
    ck('★ HELP_QA — 차량 「먼저 해제」', /동승 도우미 ○○ 배정을 먼저 해제해 주세요/.test(QA), true);
    ck('★ HELP_QA — 직원 「먼저 해제」', /동승 도우미로 배정된 직원은 먼저 배정을 해제/.test(QA), true);
    ck('★ HELP_QA — 「전체 삭제」 백업 먼저', /「전체 삭제」는 백업 파일을 먼저 받아 둬요/.test(QA), true);
    ck('★ HELP_QA — 복원 「PIN 을 다시 정해 주세요」',
      /복원으로 돌아온 분들은 PIN 을 다시 정해 주세요/.test(QA), true);
    ck('★ HELP_QA — 문지기 안내', /자료를 불러오는 중이라 삭제한 내용/.test(QA), true);
    ck('  (대조) 옛 문답표에는 다섯 다 없다',
      [/먼저 해제해 주세요/, /백업 파일을 먼저 받아 둬요/, /돌아온 분들은 PIN/,
       /자료를 불러오는 중이라 삭제한/].filter((r) => r.test(QAO)).length, 0);
    const qaN = (s) => (s.match(/\{role:'(admin|driver|all)'/g) || []).length;
    ck('  문답 항목 수는 그대로(네 항목의 글만 늘렸다)', qaN(QA), qaN(QAO));
    /* CLAUDE.md 한 줄 */
    ck('★ CLAUDE.md 에 기본 점검 한 줄',
      /지우는 길을 새로 만들면 서버 칸\(PIN·기기·배정\)도 같이 지운다 · 연결된 것은 「먼저 해제」 안내/
        .test(fs.readFileSync(COS_ROOT + '/CLAUDE.md', 'utf8').replace(/\r\n/g, '\n')), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 가짜 fetch · 가짜 Blob/FileReader');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
