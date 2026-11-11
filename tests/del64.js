/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
const { thisRef, srcAt } = require('./thisref.js');   /* 회차 커밋 찾기 한 벌 */
/* 코스로드64 — **같은 꼴 셋** (v305). 63 에서 만든 한 벌을 **재사용**한다(새 꼴 0).
   ① 코스(반) 삭제 — 그 코스를 쓰는 «회원» 이 있으면 **막음**(`courseLinkBlock`) ·
      확인 문구에 **코스 이름** · 맨 앞 문지기
   ② 엑셀로 명단 넣기 — **「더하기만」 하는 길임을 못 박는다**(통째로 바꾸는 길이 0개) ·
      그래서 사라지는 «회원» 이 없고 서버 PIN 정리가 **필요하지 않다**
   ③ 백업에 **자격증 이력**(`tkd_certificates`) — 업체 칸 20개가 백업 목록 20개와 **같다** ·
      옛 백업(칸 없음)을 복원하면 자격증은 **안 건드린다**
   ④ 소스 전수 — 문지기 15자리 · 함수 한 벌씩 · 61 기본 원칙 · `api/`·`lib/`·규칙 0줄
   ★ 바깥 통신 0 — 가짜 fetch. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

const OLD_REF = process.env.COS_SRC_OLD_REF || '4120ce7';   /* v304 — 고치기 전 */
const NEW_SRC = fs.readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
/* ★ 이 회차 커밋 — **버전 글자로 찾는다**(커밋 전에는 작업트리). 63 과 같은 방법이라
   커밋 뒤에는 **두 커밋 사이**가 되어 다음 회차에 거짓으로 깨지지 않는다. */
const THIS_REF = thisRef(305);   /* 그 회차 커밋 — 제목이 (v305) 인 것 */

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 40)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const CARS = [{ id: 'car1', name: '1호차' }, { id: 'car2', name: '2호차' }];
const COURSES = [
  { id: 'c1', name: '오전반', depart: '09:00' },     /* «회원» 둘이 쓴다 */
  { id: 'c2', name: '오후반', depart: '15:00' },     /* «회원» 하나 */
  { id: 'c3', name: '빈반', depart: '18:00' }        /* 아무도 안 쓴다 */
];
const MEM = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1',
    lat: 37.41, lon: 126.68, phone: '010-1', hasPin: true },
  { id: 2, name: '나다움', carId: 'car2', courseId: 'c1', days: D7, location: '인천 2',
    lat: 37.42, lon: 126.69, phone: '010-2' },
  { id: 3, name: '다가을', carId: 'car2', courseId: 'c2', days: D7, location: '인천 3',
    lat: 37.43, lon: 126.70, phone: '010-3' }
];
const CERTS = [{ id: 'ct1', memberName: '가하은', year: 2025, ts: 1 }];
const SUF = '__B';

function app(opt) {
  opt = opt || {};
  const src = opt.src || NEW_SRC;
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(opt.members || MEM);
  store['tkd_cars' + SUF] = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify(COURSES);
  store['tkd_staff' + SUF] = JSON.stringify([]);
  store['tkd_certificates' + SUF] = JSON.stringify(opt.certs || CERTS);
  store['tkd_org' + SUF] = JSON.stringify({ name: '가온학원', icon: '🚐', bizType: opt.biz || 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  const R = E.build({ src: src, biz: opt.biz || 'academy', localStorage: store });
  if (R.error) throw R.error;
  const ids = new Set(['admin-content', 'app-content', 'member-list', 'admin-search',
    'main-header', 'today-date', 'org-name-display', 'org-icon', 'confirm-modal',
    'confirm-ok-btn', 'bulk-del-btn', 'driver-att-host', 'new-course-name', 'upload-result']);
  (src.match(/id="[a-zA-Z0-9_-]+"/g) || []).forEach((x) => ids.add(x.slice(4, -1)));
  ids.forEach((id) => {
    const el = E.makeEl('input'); el.id = id;
    const bag = {};
    el.setAttribute = (k, v) => { bag[k] = String(v); };
    el.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null);
    el.removeAttribute = (k) => { delete bag[k]; };
    R.byId[id] = el;
  });
  const SRV = { memberPins: { B_1: 1 } };
  const L = { api: [], alerts: [], toasts: [], saved: [], files: [] };
  R.sandbox.alert = R.win.alert = (m) => { L.alerts.push(String(m)); };
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userUid='uB';"
     + " window._userPaidUntil=Date.now()+1e9;");
  R.ev("window._userBizType='" + (opt.biz || 'academy') + "';");
  if (!opt.preSync) R.ev('_firstSyncOk=true;');
  R.ev("window._auth={ currentUser:{ isAnonymous:false, getIdToken:function(){ return Promise.resolve('tok'); } } };");
  R.ev('showToast = function(m){ window.__t(String(m)); };');
  R.sandbox.__t = R.win.__t = (m) => { L.toasts.push(String(m)); };
  R.ev('saveToFirebase = function(k,v){ window.__sv(k, JSON.stringify(v===undefined?null:v)); return Promise.resolve(true); };');
  R.sandbox.__sv = R.win.__sv = (k, v) => { L.saved.push(k + ':' + v); };
  R.ev('saveCarState = function(){ return Promise.resolve(true); };'
     + ' rebuildCarData = function(){}; refreshDriverAttHost = function(){};'
     + ' renderAdminTab = function(){}; renderMembers = function(){};'
     + ' saveOrgDriver = function(){}; _atSetBase = function(){};'
     + ' renderCertHistory = function(){};');
  if (opt.demo) R.ev('isDemoMode = function(){ return true; };');
  R.sandbox.Blob = R.win.Blob = function (parts) { L.files.push(String((parts && parts[0]) || '')); };
  R.sandbox.URL = R.win.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
  R.sandbox.fetch = R.win.fetch = async (url, init) => {
    const body = JSON.parse((init && init.body) || '{}');
    L.api.push(body);
    if (body.action === 'removeMemberPin') { delete SRV.memberPins['B_' + body.memberId]; }
    return { json: async () => ({ ok: true }) };
  };
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return { R, SRV, L };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = async (p, code) => {
  p.R.ev(code);
  const cb = p.R.sandbox._confirmCallback;
  if (typeof cb !== 'function') return 'NOCB';
  try { await cb(); } catch (e) { return 'THROW:' + e.message; }
  await wait(40);
  return 'ok';
};
const courseNames = (p) => p.R.ev('courses.map(function(c){return c.name;}).join(",")');
/* 확인 창에 **무슨 글이 떴나** — `showConfirmModal` 이 제목을 넣는 자리를 가로챈다 */
const grabTitle = (p) => {
  p.R.ev('(function(){ window.__ttl=""; var _o=showConfirmModal;'
    + ' showConfirmModal=function(cb,t,ok){ window.__ttl=String(t===undefined?"(기본값)":t);'
    + ' window.__okl=String(ok===undefined?"(기본값)":ok); return _o(cb,t,ok); }; })()');
};
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
  await wait(40);
  return 'ok';
};

(async () => {
  console.log('════ ① 코스(반) 삭제 — 쓰는 «회원» 이 있으면 막는다');
  {
    /* 재현 — 고치기 전에는 그냥 지워져 **끊긴 참조**가 남았다 */
    const o = app({ src: OLD_SRC });
    grabTitle(o);
    const r0 = await press(o, 'deleteCourse(0);');
    ck('[옛] 확인 창이 떴다(막지 않았다)', r0, 'ok');
    ck('[옛] ★ 코스가 **지워졌다**', courseNames(o), '오후반,빈반');
    ck('[옛] ★ 그 «회원» 의 코스가 **끊긴 참조**로 남았다',
      o.R.ev('(function(){ var m=members[0];'
        + ' return String(m.courseId)+"/"+(courses.some(function(c){return c.id===m.courseId;})?"있음":"없음"); })()'),
      'c1/없음');
    ck('[옛] 확인 문구가 **기본값**이었다', o.R.ev('String(window.__ttl)'), '(기본값)');
    ck('[옛] 문지기가 없었다',
      /function deleteCourse\(i\)\{\s*\n\s*showConfirmModal/.test(OLD_SRC), true);

    /* 고침 — «회원» 이 있으면 막는다 */
    const p = app({});
    grabTitle(p);
    const r1 = await press(p, 'deleteCourse(0);');
    ck('★ [오전반] 확인 창이 안 뜬다(막힘)', r1, 'NOCB');
    ck('  [오전반] 코스 그대로', courseNames(p), '오전반,오후반,빈반');
    ck('★ [오전반] «회원» 수가 든다(둘)',
      /이 코스에 .*2명이 있어요\. 먼저 코스를 바꿔 주세요/.test(p.L.alerts[0] || ''), true);
    ck('  [오전반] 코스 이름이 든다', /^오전반 코스를 지우기 전에/.test(p.L.alerts[0] || ''), true);
    const q = app({});
    await press(q, 'deleteCourse(1);');
    ck('  [오후반] 하나여도 막힌다', /1명이 있어요/.test(q.L.alerts[0] || ''), true);

    /* 아무도 안 쓰는 코스는 지워진다 + 확인 문구에 이름 */
    const r2 = app({});
    grabTitle(r2);
    const rr = await press(r2, 'deleteCourse(2);');
    ck('★ [빈반] 아무도 안 쓰면 지워진다', courseNames(r2), '오전반,오후반');
    ck('  [빈반] 안내창 0', r2.L.alerts.length, 0);
    ck('★ [빈반] 확인 문구에 **코스 이름**',
      /「빈반」 코스를 삭제할까요\?/.test(r2.R.ev('String(window.__ttl)')), true);
    ck('  [빈반] 「저장」을 눌러야 한다고 적혀 있다',
      /저장.*눌러야 서버에 반영/.test(r2.R.ev('String(window.__ttl)')), true);
    ck('  [빈반] 단추 글자', r2.R.ev('String(window.__okl)'), '삭제');
    ck('  (확인) 서버 호출 0 — 코스에는 서버 전용 칸이 없다', r2.L.api.length, 0);

    /* 문지기 — 첫 동기화 전 */
    const r3 = app({ preSync: true });
    const r3r = await press(r3, 'deleteCourse(2);');
    ck('★ [첫 동기화 전] 확인 창도 안 뜬다', r3r, 'NOCB');
    ck('  [첫 동기화 전] 코스 그대로', courseNames(r3), '오전반,오후반,빈반');
    ck('  [첫 동기화 전] 안내', /자료를 불러오는 중이라 삭제한 내용/.test(r3.L.toasts.join(' ')), true);

    /* 네 업종 글자 — 물류는 「거래처 N곳」 */
    const r4 = app({ biz: 'logistics' });
    await press(r4, 'deleteCourse(0);');
    ck('★ 물류는 「거래처 2곳」', /이 코스에 거래처 2곳이 있어요/.test(r4.L.alerts[0] || ''), true);
    const r5 = app({ biz: 'public' });
    await press(r5, 'deleteCourse(0);');
    ck('  공공은 「이용자 2명」', /이 코스에 이용자 2명이 있어요/.test(r5.L.alerts[0] || ''), true);
    /* ★ **택배는 코스 개념을 아예 쓰지 않는다** — `loadCourses()` 가 빈 배열을 돌려주고
       그 칸을 지워 버린다(소스 쪽지: 「택배는 코스(반) 개념을 쓰지 않음」). 그래서 지울 코스가
       **0개**이고 이 길로 들어올 수 없다(처음에 「배송지 2곳」을 기대했다가 이것을 알았다). */
    const r6 = app({ biz: 'delivery' });
    ck('★ 택배는 코스가 **0개**(개념을 안 쓴다)', r6.R.ev('loadCourses().length'), 0);
    const r6r = await press(r6, 'deleteCourse(0);');
    ck('  그래서 아무 일도 안 일어난다', r6r + '/' + r6.L.alerts.length, 'NOCB/0');
    ck('  소스에 그 까닭이 적혀 있다', /택배는 코스\(반\) 개념을 쓰지 않음/.test(NEW_SRC), true);
  }

  console.log('\n② 엑셀로 명단 넣기 — **「더하기만」 하는 길임을 못 박는다**');
  {
    /* 명단을 바꾸는 자리 전수 — `push`(더하기) 와 `filter`(지우기)뿐이고
       **통째로 바꿔 넣는 자리(`members = <새 배열>`)는 복원 한 곳**이다. */
    const assigns = (NEW_SRC.match(/^\s*members\s*=\s*[^;]+;/mg) || [])
      .map((s) => s.trim())
      .filter((s) => !/members\s*=\s*members\.filter/.test(s))
      .filter((s) => !/applyRideState\(members\)/.test(s));          /* 토글만 다시 입힌다 */
    /* 남는 것: 복원 · 기사 사본(`applyCarData`) · 도우미 차량 바뀜(빈 값) · PIN 옮기기 둘 ·
       리스너 하나 · 글 맨 위 선언. **엑셀은 하나도 없다.** */
    const inExcel = (() => {
      const i = NEW_SRC.indexOf('function handleExcelFile(');
      const body = NEW_SRC.slice(i, NEW_SRC.indexOf('\n}\n', i));
      /* ★ `members=applyRideState(list)` 는 **통째로 바꿔 넣는 것이 아니다** —
         `loadMembers()` 로 읽은 **지금 명단**에 탑승 토글만 다시 입히는 자리다
         (PIN 을 서버 해시로 옮긴 뒤 평문을 비우는 그 한 곳 · v296). 그래서 빼고 센다. */
      return {
        push: (body.match(/members\.push\(/g) || []).length,
        whole: (body.match(/members\s*=\s*(?!members\.filter|applyRideState)/g) || []).length,
        reapply: (body.match(/members=applyRideState\(list\)/g) || []).length,
        skip: /skipped\+\+/.test(body)
      };
    })();
    ck('★ 엑셀은 `members.push` 로 **더하기만** 한다', inExcel.push, 1);
    ck('★ 엑셀에 **통째로 바꿔 넣는 자리 0**', inExcel.whole, 0);
    ck('  (그 한 자리는 토글 다시 입히기다 — 지금 명단에서 읽는다)', inExcel.reapply, 1);
    ck('  겹치는 이름·PIN 은 **건너뛴다**(지우지 않는다)', inExcel.skip, true);
    console.log('      (명단을 통째로 바꾸는 자리 ' + assigns.length + '곳 — 엑셀은 그 가운데 0곳)');
    /* 실제로 돌려 본다 — 명단이 **늘어나기만** 하나 */
    const p = app({});
    const n0 = p.R.ev('members.length');
    p.R.sandbox.FileReader = p.R.win.FileReader = function () {
      const self = this;
      this.readAsBinaryString = function () { setTimeout(() => { self.onload({ target: { result: 'X' } }); }, 0); };
    };
    p.R.sandbox.XLSX = p.R.win.XLSX = {
      read: () => ({ SheetNames: ['s'], Sheets: { s: {} } }),
      utils: { sheet_to_json: () => ([
        ['이름', '코스', '차량', '픽업장소', '연락처1', '연락처2', '등원요일', '등록비', '월정액', 'PIN', '특이사항'],
        ['마겨울', '오전반', '1호차', '인천 9', '010-9', '', '월,화', '0', '0', '', ''],
        ['가하은', '오전반', '1호차', '인천 1', '010-1', '', '월,화', '0', '0', '', '']   /* 겹침 */
      ]) }
    };
    p.R.ev('window.XLSX=XLSX; handleExcelFile({name:"x.xlsx"});');
    await wait(120);
    const n1 = p.R.ev('members.length');
    ck('★ 돌려 보니 명단이 **늘어났다**(지워진 사람 0)', n0 + '→' + n1, '3→4');
    ck('  겹친 이름은 안 들어갔다',
      p.R.ev('members.filter(function(m){return m.name==="가하은";}).length'), 1);
    ck('★ 그래서 서버 PIN 을 지울 일이 없다(`removeMemberPin` 0)',
      p.L.api.filter((x) => x.action === 'removeMemberPin').length, 0);
    ck('  서버 PIN 지우는 창구를 아예 안 부른다',
      /removeMemberPin|_wipeGoneServer|_restoreGone/
        .test(NEW_SRC.slice(NEW_SRC.indexOf('function handleExcelFile('),
          NEW_SRC.indexOf('\n}\n', NEW_SRC.indexOf('function handleExcelFile(')))), false);
    console.log('      → **통째로 바뀌는 길이 아니므로 손대지 않았다**(지시 그대로)');
  }

  console.log('\n③ 백업에 **자격증 이력** · 옛 백업은 안 건드린다');
  {
    const keysOf = (src) => {
      const i = src.indexOf('function backupData(');
      const m = /var keys = \[([^\]]*)\]/.exec(src.slice(i, i + 2000));
      return m ? m[1].split(',').map((x) => x.trim().replace(/'/g, '')) : [];
    };
    const orgKeys = (src) => {
      const m = /var ORG_KEYS = \[([^\]]*)\]/.exec(src);
      return m ? m[1].split(',').map((x) => x.trim().replace(/'/g, '')) : [];
    };
    ck('[옛] 백업 목록에 자격증이 **없었다**',
      keysOf(OLD_SRC).indexOf('tkd_certificates') >= 0, false);
    ck('[옛] 그래서 업체 칸 20 ≠ 백업 19',
      orgKeys(OLD_SRC).length + '/' + keysOf(OLD_SRC).length, '20/19');
    ck('★ [새] 백업 목록에 자격증이 있다',
      keysOf(NEW_SRC).indexOf('tkd_certificates') >= 0, true);
    ck('★ [새] 업체 칸 수 = 백업 목록 수',
      orgKeys(NEW_SRC).length + '/' + keysOf(NEW_SRC).length, '20/20');
    ck('  ★ 빠진 업체 칸 0곳',
      orgKeys(NEW_SRC).filter((k) => keysOf(NEW_SRC).indexOf(k) < 0).join(',') || '0곳', '0곳');
    /* 실제로 백업을 받아 본다 — 파일 안에 이력이 들어갔나 */
    const p = app({});
    p.R.ev('backupData();');
    ck('★ 백업 파일에 이력이 들어갔다', /tkd_certificates/.test(p.L.files[0] || ''), true);
    ck('  그 안에 발급 기록이 보인다', /ct1/.test(p.L.files[0] || ''), true);
    const o = app({ src: OLD_SRC });
    o.R.ev('backupData();');
    ck('  (대조) 옛 판 파일에는 없었다', /tkd_certificates/.test(o.L.files[0] || ''), false);

    /* 복원 — 새 백업(칸 있음)이면 그 값으로 바뀌고 서버에도 올라간다 */
    const DUMP = (over) => {
      const d = { _app: 'COSROAD', _version: 1, _date: '2026-11-01T00:00:00.000Z', data: {} };
      d.data['tkd_members'] = JSON.stringify(MEM);
      d.data['tkd_staff'] = JSON.stringify([]);
      d.data['tkd_cars'] = JSON.stringify(CARS);
      d.data['tkd_certificates'] = JSON.stringify([{ id: 'ct9', memberName: '나다움', year: 2026 }]);
      if (over) over(d);
      return d;
    };
    const r2 = app({});
    await restore(r2, DUMP());
    ck('★ [새 백업] 이력이 그 값으로 바뀌었다',
      r2.R.ev('loadCertificates().map(function(c){return c.id;}).join(",")'), 'ct9');
    ck('★ [새 백업] 서버에도 올라갔다',
      r2.L.saved.filter((s) => s.indexOf('certificates:') === 0).length, 1);
    ck('  그 값이 올라갔다', /ct9/.test(r2.L.saved.filter((s) => s.indexOf('certificates:') === 0)[0] || ''), true);

    /* ★★ 옛 백업(칸 없음) — 자격증은 **안 건드린다** */
    const r3 = app({});
    await restore(r3, DUMP((d) => { delete d.data['tkd_certificates']; }));
    ck('★★ [옛 백업] 이력이 **그대로**',
      r3.R.ev('loadCertificates().map(function(c){return c.id;}).join(",")'), 'ct1');
    ck('★★ [옛 백업] 서버에 **올리지도 않는다**',
      r3.L.saved.filter((s) => s.indexOf('certificates:') === 0).length, 0);
    ck('  (대조) 옛 판도 안 올렸다(기능이 아예 없었다)',
      /saveToFirebase\('certificates'/.test(OLD_SRC.slice(OLD_SRC.indexOf('function restoreData('),
        OLD_SRC.indexOf('function restoreData(') + 4000)), false);
  }

  console.log('\n④ 소스 전수');
  {
    const bodyOf = (src, fn) => {
      const i = src.indexOf('function ' + fn + '(');
      if (i < 0) return '';
      const f = src.slice(i);
      return f.slice(0, f.indexOf('\n}\n'));
    };
    /* 문지기 — v304 열넷 + 코스 하나 = **열다섯** */
    /* ★★ **그 회차 수는 그 회차 커밋에서** 읽는다 — 작업트리에서 세면 뒷 회차가 문지기를
       더 붙일 때마다 **거짓으로** 깨진다(v307/66 이 사진 둘을 더해 겪었다 · del63 과 같은 손질).
       지금 소스는 「**줄지 않았나**」로만 본다. */
    const THIS_SRC = THIS_REF
      ? cp.execSync('git -C ' + COS_ROOT + ' show ' + THIS_REF + ':index.html',
        { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n')
      : NEW_SRC;
    const gates = (s) => (s.match(/!okToWriteNow\(\)/g) || []).length;
    ck('★ 문지기 자리 수(이 회차 커밋)', gates(THIS_SRC), 15);
    ck('  (대조) v304 는 열넷', gates(OLD_SRC), 14);
    ck('  지금 소스는 **줄지 않았다**',
      gates(NEW_SRC) >= 15 ? 'OK(' + gates(NEW_SRC) + ')' : gates(NEW_SRC),
      'OK(' + gates(NEW_SRC) + ')');
    ck('★ `deleteCourse` 머리에 문지기',
      bodyOf(NEW_SRC, 'deleteCourse').indexOf('!okToWriteNow()') >= 0, true);
    /* 연결 막기 함수 — **셋이 같은 꼴**이고 각각 한 벌이다(새 꼴을 만들지 않았다) */
    ['carLinkBlock', 'staffLinkBlock', 'courseLinkBlock'].forEach((f) => {
      ck('★ `' + f + '` 한 벌',
        (NEW_SRC.match(new RegExp('^function ' + f + '\\(', 'mg')) || []).length, 1);
    });
    ck('  셋 다 「먼저 … 주세요」로 끝낸다',
      ['carLinkBlock', 'staffLinkBlock', 'courseLinkBlock']
        .filter((f) => /먼저 .*주세요/.test(bodyOf(NEW_SRC, f))).length, 3);
    ck('  막는 자리는 `alert` 한 줄 — 셋',
      (NEW_SRC.match(/if\(_lk\)\{ alert\(_lk\); return; \}/g) || []).length, 3);
    /* 새 창(덮개) 0 */
    const panels = (src) => (src.match(/BACK_PANEL_IDS\s*=\s*\[[\s\S]*?\]/) || [''])[0];
    ck('★ 새 창(덮개) 0 — `BACK_PANEL_IDS` 그대로',
      panels(NEW_SRC) === panels(OLD_SRC) ? '그대로' : '바뀜', '그대로');
    /* 61 기본 원칙 */
    ck('  (61-1) 코스 안내의 수는 `fmtNum`',
      /fmtNum\(n\)\+TUnit\(\)/.test(bodyOf(NEW_SRC, 'courseLinkBlock')), true);
    ck('  (61-1) `fmtNum`·`numOf` 한 벌 그대로',
      (NEW_SRC.match(/^function fmtNum\(/mg) || []).length + '/'
        + (NEW_SRC.match(/^function numOf\(/mg) || []).length, '1/1');
    ck('  (61-2) 카톡 변수 둘 그대로', (NEW_SRC.match(/--kakao[a-z-]*:/g) || []).length, 2);
    /* 로그아웃 짝 — 더한 것은 **함수뿐** */
    ck('  (로그아웃 짝) 새 `setInterval`·리스너 0',
      (NEW_SRC.match(/setInterval\(/g) || []).length === (OLD_SRC.match(/setInterval\(/g) || []).length
        && (NEW_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length === (OLD_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length,
      true);
    ck('  (업체 분리) `ORG_KEYS` 그대로(새 기기 저장 칸 0)',
      (NEW_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0] === (OLD_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0], true);
    /* 서버·규칙 0줄 — **두 커밋 사이**(커밋 전에는 작업트리) */
    ck('★ `api/`·`lib/`·규칙은 **한 줄도** 안 바뀌었다',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF
        + (THIS_REF ? ' ' + THIS_REF : '') + ' -- api lib firestore.rules',
        { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
    console.log('      (잰 자리: ' + OLD_REF + ' → ' + (THIS_REF || '작업트리') + ')');
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    /* ★ 이 회차는 305 였다 — 뒷 회차가 올리므로 **그 이상**으로 본다(del63 과 같은 손질) */
    ck('  버전 305 이상', appV >= 305 ? 'OK(' + appV + ')' : appV, 'OK(' + appV + ')');
    ck('  `version.json` 과 같다',
      String(JSON.parse(fs.readFileSync(COS_ROOT + '/version.json', 'utf8')).version), String(appV));
    /* HELP_QA — 문답표 **안에서** 찾는다 */
    const QA = (s) => { const i = s.indexOf('var HELP_QA=['); return i < 0 ? '' : s.slice(i, s.indexOf('\n];', i)); };
    ck('★ HELP_QA — 코스 삭제 막음', /이 코스에 «회원» N명이 있어요/.test(QA(NEW_SRC)), true);
    ck('★ HELP_QA — 백업에 증명서 이력', /교육비 납입증명서 발급 이력<\/b>\(v305\)/.test(QA(NEW_SRC)), true);
    ck('  HELP_QA — 옛 백업이면 그대로 둔다', /그대로 둬요<\/b>\(지우지 않아요\)/.test(QA(NEW_SRC)), true);
    ck('  (대조) 옛 문답표에는 둘 다 없다',
      [/이 코스에 «회원» N명/, /교육비 납입증명서 발급 이력/].filter((r) => r.test(QA(OLD_SRC))).length, 0);
    const qaN = (s) => (QA(s).match(/\{role:'(admin|driver|all)'/g) || []).length;
    /* ★ v315(72-B): 이 수는 **그 회차 커밋에서** 잰다 — 작업트리로 재면
       뒷 회차가 문답을 하나 더할 때마다 거짓으로 깨진다(공용 `srcAt` 한 벌). */
    ck('  문답 항목 수는 그대로(두 항목의 글만 늘렸다)', qaN(srcAt(THIS_REF)), qaN(OLD_SRC));
    /* CLAUDE.md 기본 점검이 그대로 있나(63에서 넣은 줄) */
    ck('  CLAUDE.md 기본 점검 그대로',
      /지우는 길을 새로 만들면 서버 칸\(PIN·기기·배정\)도 같이 지운다/
        .test(fs.readFileSync(COS_ROOT + '/CLAUDE.md', 'utf8').replace(/\r\n/g, '\n')), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 가짜 fetch · 가짜 XLSX/Blob/FileReader');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
