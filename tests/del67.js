/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
const { thisRef } = require('./thisref.js');   /* 회차 커밋 찾기 한 벌 */
/* 코스로드67-B — **모든 자료는 업체별로 분리·저장** (v308).
   ① 사진 경로가 **업체별**인가(`orgs/<업체>/notice-images|drivelog-photos/…`) ·
      업종 글자로 만드는 자리 0 · 업체가 바뀌면 경로도 바뀌나 · v307 문지기 셋 그대로
   ② 백업 파일에 **`_org`·`_orgName`** · 파일 이름에 업체 id 뒤 6자 ·
      복원 때 **다른 업체면 한 번 더 물음**(아니요면 아무것도 안 함) · 표시 없는 옛 백업도 물음 ·
      같은 업체면 **더 묻지 않음**
   ③ 지원사업 팝업 시각이 **업체별**(`tkd_support_lastcheck_<업체>`) · 옛 키는 안 읽고 안 지움
   ④ 소스 전수 — `storage.rules` 기록 · 업체 분리 점검 · 61 원칙 · 로그아웃 짝 · HELP_QA
   ★ 바깥 통신 0 — 가짜 Storage·가짜 fetch. 실서비스 Storage·Firestore 읽기 0. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

const OLD_REF = process.env.COS_SRC_OLD_REF || '6586dcf';   /* v307 — 고치기 전 */
const NEW_SRC = fs.readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
/* ★ 이 회차 커밋 — **버전 글자로 찾는다**(63~66 과 같은 방법 · 커밋 전에는 작업트리) */
const THIS_REF = thisRef(308);   /* 그 회차 커밋 — 제목이 (v308) 인 것 */

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 40)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const CARS = [{ id: 'car1', name: '1호차' }];
const MEM = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
  location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1' }];
const NOTICES = [{ id: 1, ts: Date.UTC(2026, 10, 1, 2, 0), date: '2026-11-01',
  content: '오늘은 비가 옵니다', images: ['data:image/jpeg;base64,AAAA'], target: 'all' }];

function app(opt) {
  opt = opt || {};
  const src = opt.src || NEW_SRC;
  const org = opt.org || 'B';
  const SUF = '__' + org;
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(MEM);
  store['tkd_cars' + SUF] = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify([{ id: 'c1', name: '오전반' }]);
  store['tkd_staff' + SUF] = JSON.stringify([]);
  store['tkd_notices' + SUF] = JSON.stringify(NOTICES);
  store['tkd_org' + SUF] = JSON.stringify({ name: opt.orgName || '가온학원', icon: '🚐',
    bizType: 'academy', destName: '학원', destLat: 37.44, destLon: 126.65 });
  if (opt.store) Object.keys(opt.store).forEach((k) => { store[k] = opt.store[k]; });
  const R = E.build({ src: src, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  const ids = new Set(['admin-content', 'app-content', 'member-list', 'confirm-modal',
    'confirm-ok-btn', 'upload-result']);
  (src.match(/id="[a-zA-Z0-9_-]+"/g) || []).forEach((x) => ids.add(x.slice(4, -1)));
  ids.forEach((id) => {
    const el = E.makeEl('input'); el.id = id;
    const bag = {};
    el.setAttribute = (k, v) => { bag[k] = String(v); };
    el.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null);
    el.removeAttribute = (k) => { delete bag[k]; };
    if (!el.classList) {
      const cl = new Set();
      el.classList = { add: (c) => cl.add(c), remove: (c) => cl.delete(c), contains: (c) => cl.has(c) };
    }
    R.byId[id] = el;
  });
  const L = { up: [], alerts: [], toasts: [], saved: [], files: [], names: [], confirms: [] };
  R.sandbox.alert = R.win.alert = (m) => { L.alerts.push(String(m)); };
  /* 「한 번 더 묻기」 — `confirm` 이 돌려주는 값을 바꿔 가며 재 본다 */
  R.sandbox.confirm = R.win.confirm = (m) => { L.confirms.push(String(m)); return opt.answer !== false; };
  R.ev("currentMode='admin'; window._userOrgId='" + org + "'; window._userUid='u" + org + "';"
     + " window._userPaidUntil=Date.now()+1e9; _firstSyncOk=true;");
  R.ev("window._userBizType='academy';");
  R.ev('showToast = function(m){ window.__t(String(m)); };');
  R.sandbox.__t = R.win.__t = (m) => { L.toasts.push(String(m)); };
  R.ev('saveToFirebase = function(k,v){ window.__sv(k, JSON.stringify(v===undefined?null:v)); return Promise.resolve(true); };');
  R.sandbox.__sv = R.win.__sv = (k, v) => { L.saved.push({ k: k, v: v }); };
  R.ev('saveCarState = function(){ return Promise.resolve(true); };'
     + ' rebuildCarData = function(){}; renderAdminTab = function(){};'
     + ' renderMembers = function(){}; saveOrgDriver = function(){};'
     + ' _atSetBase = function(){}; renderCertHistory = function(){};'
     + ' renderDriveLogView = function(){};');
  /* 가짜 Storage — **어느 경로로 올렸나**를 적는다(실제 통신 0) */
  R.ev('window._storage = {};'
     + ' window._storageFns = {'
     + '   storageRef: function(st, path){ return { path: path }; },'
     + '   uploadString: function(sref){ window.__up(sref.path); return Promise.resolve({ ref: sref }); },'
     + '   getDownloadURL: function(ref){ return Promise.resolve("https://fb.example/" + ref.path); }'
     + ' };');
  R.sandbox.__up = R.win.__up = (p) => { L.up.push(String(p)); };
  /* 백업 파일 — 이름과 글을 적는다 */
  R.sandbox.Blob = R.win.Blob = function (parts) { L.files.push(String((parts && parts[0]) || '')); };
  R.sandbox.URL = R.win.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
  const origCreate = R.sandbox.document.createElement;
  R.sandbox.document.createElement = (tag) => {
    const el = origCreate.call(R.sandbox.document, tag);
    if (String(tag).toLowerCase() === 'a') {
      Object.defineProperty(el, 'download', {
        get() { return el.__dl || ''; },
        set(v) { el.__dl = String(v); L.names.push(String(v)); }
      });
    }
    return el;
  };
  R.sandbox.fetch = R.win.fetch = async () => ({ json: async () => ({ ok: true }) });
  /* ★ `orgSettings` 를 꼭 읽혀야 한다 — 백업의 `_orgName`·복원 안내가 그 이름을 쓴다
     (안 읽히면 'COSROAD' 로 떨어져 거짓 실패가 난다 · 처음에 겪었다). */
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();'
     + ' notices = loadNotices(); orgSettings = loadOrgSettings();');
  return { R, L };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const upNotice = async (p) => {
  p.R.ev('uploadNoticeImages(notices[0].images, function(){});');
  await wait(40);
  return p.L.up.slice();
};
const upDlv = async (p) => {
  p.R.ev('uploadDriveLogPhoto("data:image/jpeg;base64,AAAA", function(){});');
  await wait(40);
  return p.L.up.slice();
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
  await wait(30);
  const cb = p.R.sandbox._confirmCallback;
  if (typeof cb !== 'function') return { r: 'NOCB', ev: ev };
  try { await cb(); } catch (e) { return { r: 'THROW:' + e.message, ev: ev }; }
  await wait(50);
  return { r: 'ok', ev: ev };
};
const DUMP = (over) => {
  const d = { _app: 'COSROAD', _version: 1, _date: '2026-11-01T00:00:00.000Z',
    _org: 'B', _orgName: '가온학원', data: {} };
  d.data['tkd_members'] = JSON.stringify(MEM);
  d.data['tkd_cars'] = JSON.stringify(CARS);
  if (over) over(d);
  return d;
};

(async () => {
  console.log('════ ① 사진 경로가 **업체별**인가');
  {
    /* 재현 — 옛 판은 업종 글자였다 */
    const o = app({ src: OLD_SRC });
    const ou = await upNotice(o);
    ck('[옛] «알림장» 경로', /^notice-images\/academy_/.test(ou[0] || ''), true);
    const o2 = app({ src: OLD_SRC });
    const od = await upDlv(o2);
    ck('[옛] 운행 사진 경로', /^drivelog-photos\/academy_/.test(od[0] || ''), true);
    ck('[옛] ★ 업체가 달라도 **같은 폴더**였다', (() => {
      const a = app({ src: OLD_SRC, org: 'B' });
      const b = app({ src: OLD_SRC, org: 'C' });
      return a.R.ev("'notice-images/'+getBizType()") === b.R.ev("'notice-images/'+getBizType()");
    })(), true);

    /* 고침 */
    const p = app({});
    const pu = await upNotice(p);
    ck('★ «알림장» 경로가 `orgs/B/notice-images/…`',
      /^orgs\/B\/notice-images\/\d+_0_[a-z0-9]+\.jpg$/.test(pu[0] || '') ? 'OK' : (pu[0] || '없음'), 'OK');
    const q = app({});
    const qd = await upDlv(q);
    ck('★ 운행 사진 경로가 `orgs/B/drivelog-photos/…`',
      /^orgs\/B\/drivelog-photos\/\d+_[a-z0-9]+\.jpg$/.test(qd[0] || '') ? 'OK' : (qd[0] || '없음'), 'OK');
    /* 업체가 바뀌면 경로도 바뀐다 */
    const r2 = app({ org: 'C' });
    const ru = await upNotice(r2);
    ck('★ 업체가 바뀌면 **폴더도 바뀐다**', /^orgs\/C\/notice-images\//.test(ru[0] || ''), true);
    ck('  두 업체 폴더가 **다르다**',
      (pu[0] || '').split('/')[1] + '≠' + (ru[0] || '').split('/')[1], 'B≠C');
    /* 파일 이름에 시각+난수가 그대로 */
    ck('  파일 이름에 시각+난수가 남아 있다',
      /\/\d{10,}_0_[a-z0-9]{6}\.jpg$/.test(pu[0] || ''), true);
    /* v307 문지기 셋 그대로 */
    for (const [nm, code] of [['둘러보기', 'isDemoMode = function(){ return true; };'],
      ['읽기 전용', 'isReadOnlyMode = function(){ return true; }; readOnlyBlocked=function(){};'],
      ['첫 동기화 전', '_firstSyncOk=false;']]) {
      const s = app({});
      s.R.ev(code);
      const su = await upNotice(s);
      ck('  [' + nm + '] 올린 사진 0(v307 문지기 그대로)', su.length, 0);
    }
  }

  console.log('\n② 백업 파일에 업체 표시 · 복원 때 다른 업체면 한 번 더');
  {
    /* 재현 — 옛 판은 표시가 없고, 다른 업체 백업도 그냥 덮었다 */
    const o = app({ src: OLD_SRC });
    o.R.ev('backupData();');
    const od = JSON.parse(o.L.files[0] || '{}');
    ck('[옛] 백업에 `_org` 가 없다', Object.prototype.hasOwnProperty.call(od, '_org'), false);
    ck('[옛] 파일 이름에 업체 id 가 없다', /_[A-Za-z0-9]{6}_\d{4}-/.test(o.L.names[0] || ''), false);
    const o2 = app({ src: OLD_SRC });
    const or2 = await restore(o2, DUMP((d) => { d._org = 'OTHER'; d._orgName = '남의학원'; }));
    ck('[옛] ★ **남의 업체 백업을 그냥 덮었다**(묻지 않음)',
      or2.r + '/' + o2.L.confirms.length, 'ok/0');

    /* 고침 — 백업 */
    const p = app({});
    p.R.ev('backupData();');
    const pd = JSON.parse(p.L.files[0] || '{}');
    ck('★ 백업에 `_org`', pd._org, 'B');
    ck('★ 백업에 `_orgName`', pd._orgName, '가온학원');
    ck('  옛 칸은 그대로', pd._app + '/' + pd._version, 'COSROAD/1');
    /* ★ v310(68 보정1)에 **표시를 정하는 규칙이 바뀌었다**(뒤 6자 → 마지막 `_` 뒤) —
       이 묶음은 v308 의 약속 「**파일 이름에 업체 표시가 붙는다**」만 지킨다.
       네 업종·네 모양의 **정확한 표**는 그 회차 묶음(`tests/biz68.js` ⑤)이 들고 있다. */
    ck('★ 파일 이름에 업체 표시가 붙는다',
      /가온학원_[A-Za-z0-9가-힣]{1,12}_\d{4}-\d{2}-\d{2}\.json$/.test(p.L.names[0] || '')
        ? 'OK' : (p.L.names[0] || '없음'), 'OK');
    const pL = app({ org: 'academy_abc123def456' });
    pL.R.ev('backupData();');
    ck('  긴 업체 id 도 **12자까지만** 붙는다',
      /_[A-Za-z0-9]{1,12}_\d{4}-\d{2}-\d{2}\.json$/.test(pL.L.names[0] || '')
        ? 'OK' : (pL.L.names[0] || '없음'), 'OK');

    /* 고침 — 복원 */
    const sameP = app({});
    const sameR = await restore(sameP, DUMP());
    ck('★ **같은 업체** 백업은 더 묻지 않는다', sameP.L.confirms.length, 0);
    ck('  그 복원은 그대로 된다', sameR.r, 'ok');

    const diffP = app({});
    const diffR = await restore(diffP, DUMP((d) => { d._org = 'OTHER'; d._orgName = '남의학원'; }));
    ck('★ **다른 업체** 백업이면 한 번 더 묻는다', diffP.L.confirms.length, 1);
    ck('  그 글에 업체 이름이 든다', /「남의학원」 백업이에요/.test(diffP.L.confirms[0] || ''), true);
    ck('  지금 업체 이름도 든다', /지금 업체\(가온학원\)/.test(diffP.L.confirms[0] || ''), true);
    ck('  「예」면 복원된다', diffR.r, 'ok');

    const noP = app({ answer: false });
    const noR = await restore(noP, DUMP((d) => { d._org = 'OTHER'; d._orgName = '남의학원'; }));
    ck('★ 「아니요」면 **아무것도 안 한다**(확인 창도 안 뜸)', noR.r, 'NOCB');
    ck('  고른 파일 칸을 비운다', noR.ev.target.value, '');
    ck('  서버에 아무것도 안 올렸다', noP.L.saved.length, 0);
    ck('  폰 명단도 그대로', noP.R.ev('loadMembers().length'), 1);

    /* 표시 없는 옛 백업 */
    const oldP = app({});
    const oldR = await restore(oldP, DUMP((d) => { delete d._org; delete d._orgName; }));
    ck('★ 표시 없는 **옛 백업**도 한 번 더 묻는다', oldP.L.confirms.length, 1);
    ck('  그 글', /표시가 없는 옛 파일이에요/.test(oldP.L.confirms[0] || ''), true);
    ck('  「예」면 복원된다', oldR.r, 'ok');
    const oldNo = app({ answer: false });
    const oldNoR = await restore(oldNo, DUMP((d) => { delete d._org; }));
    ck('  「아니요」면 안 한다', oldNoR.r, 'NOCB');

    /* 그 확인은 **문지기 다음**이다 — 첫 동기화 전에는 묻지도 않는다 */
    const preP = app({});
    preP.R.ev('_firstSyncOk=false;');
    const preR = await restore(preP, DUMP((d) => { d._org = 'OTHER'; }));
    ck('★ 첫 동기화 전에는 **묻지도 않는다**(문지기가 먼저)',
      preR.r + '/' + preP.L.confirms.length, 'NOCB/0');
  }

  console.log('\n③ 지원사업 팝업 시각이 업체별');
  {
    ck('[옛] 꼬리 없는 한 칸을 썼다', /'tkd_support_lastcheck'/.test(OLD_SRC), true);
    ck('★ [새] 꼬리를 붙인다', /'tkd_support_lastcheck_'\+getFbOrgId\(\)/.test(NEW_SRC), true);
    ck('  (대조) 꼬리 없는 글자가 **코드에서 사라졌다**',
      /localStorage\.(get|set)Item\('tkd_support_lastcheck'/.test(NEW_SRC), false);
    const p = app({});
    ck('★ 키가 업체별', p.R.ev('supportLastKey()'), 'tkd_support_lastcheck_B');
    const q = app({ org: 'C' });
    ck('  업체가 바뀌면 키도 바뀐다', q.R.ev('supportLastKey()'), 'tkd_support_lastcheck_C');
    /* 옛 키는 안 읽고 안 지운다 */
    const r2 = app({ store: { tkd_support_lastcheck: String(Date.now()) } });
    ck('★ 옛 키가 있어도 **안 읽는다**(새 칸이 비면 확인할 때가 됐다)',
      r2.R.ev('supportDueNow()'), true);
    ck('  옛 키를 **지우지 않는다**',
      r2.R.ev("String(localStorage.getItem('tkd_support_lastcheck')||'').length>0"), true);
    ck('  한 번 확인하면 **새 칸**에 적는다', (() => {
      r2.R.ev('supportFetch = function(cb){ cb([]); }; supportAutoCheck();');
      return r2.R.ev("String(localStorage.getItem('tkd_support_lastcheck_B')||'').length>0");
    })(), true);
    ck('  그래도 옛 칸은 그대로', r2.R.ev("String(localStorage.getItem('tkd_support_lastcheck')||'').length>0"), true);
  }

  console.log('\n④ 소스 전수');
  {
    /* `storage.rules` 기록 */
    const sr = fs.readFileSync(COS_ROOT + '/storage.rules', 'utf8').replace(/\r\n/g, '\n');
    ck('★ `storage.rules` 가 저장소에 있다', sr.length > 1000, true);
    ck('  머리에 「콘솔이 원본」', /원본은 \*\*Firebase 콘솔\*\*이다/.test(sr), true);
    ck('  게시일이 적혀 있다', /2026-11-10/.test(sr), true);
    ck('  새 경로 둘', (sr.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
      .match(/match \/orgs\/\{org\}\//g) || []).length, 2);
    ck('  (대조) v307 에는 그 파일이 없었다',
      (() => {
        try {
          cp.execSync('git -C ' + COS_ROOT + ' cat-file -e ' + OLD_REF + ':storage.rules',
            { stdio: 'ignore' });
          return '있었다';
        } catch (e) { return '없었다'; }
      })(), '없었다');
    /* 업체 분리 점검 — 경로를 만드는 자리가 `getFbOrgId()` 한 벌인가 */
    ck('★ 사진 경로는 `getFbOrgId()` 한 벌',
      (NEW_SRC.match(/getFbOrgId\(\)\+'\/(notice-images|drivelog-photos)/g) || []).length, 2);
    ck('  업종 글자로 만드는 사진 경로 0곳',
      /(notice-images|drivelog-photos)\/'\+bizId/.test(NEW_SRC), false);
    /* 63~66 이 넣은 것이 그대로인가 */
    ['carLinkBlock', 'staffLinkBlock', 'courseLinkBlock', '_dumpHas', 'courseNameOf',
      'prodSameExists', 'supportLastKey'].forEach((f) => {
      ck('  `' + f + '` 한 벌',
        (NEW_SRC.match(new RegExp('^function ' + f + '\\(', 'mg')) || []).length, 1);
    });
    ck('  문지기 자리 수(줄지 않았다)',
      (NEW_SRC.match(/!okToWriteNow\(\)/g) || []).length >= 17 ? 'OK' : 'NG', 'OK');
    const panels = (src) => (src.match(/BACK_PANEL_IDS\s*=\s*\[[\s\S]*?\]/) || [''])[0];
    ck('★ 새 창(덮개) 0 — `BACK_PANEL_IDS` 그대로',
      panels(NEW_SRC) === panels(OLD_SRC) ? '그대로' : '바뀜', '그대로');
    ck('  (61-1) `fmtNum`·`numOf` 한 벌 그대로',
      (NEW_SRC.match(/^function fmtNum\(/mg) || []).length + '/'
        + (NEW_SRC.match(/^function numOf\(/mg) || []).length, '1/1');
    ck('  (61-2) 카톡 변수 둘 그대로', (NEW_SRC.match(/--kakao[a-z-]*:/g) || []).length, 2);
    /* 로그아웃 짝 — 새 전역·리스너·타이머 0 */
    ck('  (로그아웃 짝) 새 `setInterval`·리스너 0',
      (NEW_SRC.match(/setInterval\(/g) || []).length === (OLD_SRC.match(/setInterval\(/g) || []).length
        && (NEW_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length === (OLD_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length,
      true);
    ck('  (업체 분리) `ORG_KEYS` 그대로(새 키는 함수로 꼬리를 붙인다)',
      (NEW_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0] === (OLD_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0], true);
    ck('  백업 목록 20개 그대로',
      (/function backupData\(\)[\s\S]{0,2000}?var keys = \[([^\]]*)\]/.exec(NEW_SRC) || ['', ''])[1]
        .split(',').length, 20);
    /* `api/`·`lib/`·Firestore 규칙은 안 바뀐다(Storage 규칙 파일은 **새로** 넣는다) */
    ck('★ `api/`·`lib/`·Firestore 규칙은 **한 줄도** 안 바뀌었다',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF
        + (THIS_REF ? ' ' + THIS_REF : '') + ' -- api lib firestore.rules',
        { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
    console.log('      (잰 자리: ' + OLD_REF + ' → ' + (THIS_REF || '작업트리') + ')');
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    /* ★ 버전은 **308 이상**으로 본다 — 뒷 회차가 올리면 거짓으로 깨진다(63~66 과 같은 손질) */
    ck('  버전 308 이상', appV >= 308 ? 'OK(' + appV + ')' : 'NG(' + appV + ')', 'OK(' + appV + ')');
    ck('  `version.json` 과 같다',
      String(JSON.parse(fs.readFileSync(COS_ROOT + '/version.json', 'utf8')).version), String(appV));
    const QA = (s) => { const i = s.indexOf('var HELP_QA=['); return i < 0 ? '' : s.slice(i, s.indexOf('\n];', i)); };
    ck('★ HELP_QA — 백업 파일 업체 표시', /어느 업체 것인지 적혀요/.test(QA(NEW_SRC)), true);
    ck('  HELP_QA — 표시 없는 옛 백업', /표시가 없는 옛 파일이에요/.test(QA(NEW_SRC)), true);
    ck('★ HELP_QA — 사진도 업체별로', /업체별로 따로 보관/.test(QA(NEW_SRC)), true);
    ck('  (대조) 옛 문답표에는 셋 다 없다',
      [/어느 업체 것인지 적혀요/, /표시가 없는 옛 파일이에요/, /업체별로 따로 보관/]
        .filter((r) => r.test(QA(OLD_SRC))).length, 0);
    const qaN = (s) => (QA(s).match(/\{role:'(admin|driver|all)'/g) || []).length;
    ck('  문답 항목 수는 그대로', qaN(NEW_SRC), qaN(OLD_SRC));
    ck('★ CLAUDE.md 에 「사진·파일도 업체 경로」 한 줄',
      /사진·파일도 업체 경로/.test(fs.readFileSync(COS_ROOT + '/CLAUDE.md', 'utf8').replace(/\r\n/g, '\n')), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 가짜 Storage · 실서비스 Storage·Firestore 읽기 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
