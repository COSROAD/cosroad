/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
const { thisRef, srcAt } = require('./thisref.js');   /* 회차 커밋 찾기 한 벌 */
/* 코스로드66 — **작은 것들** (v307).
   ① 사진 올리기 **두 곳** 문지기 — `uploadNoticeImages`(«알림장») · `uploadDriveLogPhoto`(운행 사진)
      · 재현: 둘러보기·첫 동기화 전에 **실제로 Storage 로 올라갔다**(읽기 전용만 막혀 있었다)
      · 고침: 저장과 **같은 순서**(둘러보기 → 읽기 전용 → 첫 동기화) · 막히면 **`cb` 실패**
      · 「올라갔다」 표시(`n.imageUrls`·`photo`)가 **안 찍히는지**
      · 업체 경로가 무엇인지 — **보고용으로 잰다**(Storage 규칙을 못 바꾸므로 이 회차에선 안 고친다)
   ② 품목 엑셀 **겹침 검사** — 「같은 품목」 기준(코드 / 코드 없으면 이름+규격) ·
      겹치면 건너뛰고 수 안내 · **기존 값 안 덮음** · 같은 엑셀 안의 겹침도 걸러짐
   ③ 소스 전수 — 61 원칙 · 로그아웃 짝 · HELP_QA · `api/`·`lib/`·규칙 0줄
   ★ 바깥 통신 0 — 가짜 Storage·가짜 fetch. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

const OLD_REF = process.env.COS_SRC_OLD_REF || '930976d';   /* v306 — 고치기 전 */
const NEW_SRC = fs.readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
/* ★ 이 회차 커밋 — **버전 글자로 찾는다**(63~65 와 같은 방법 · 커밋 전에는 작업트리) */
const THIS_REF = thisRef(307);   /* 그 회차 커밋 — 제목이 (v307) 인 것 */

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
  location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1111-1111' }];
const NOTICES = [{ id: 1, ts: Date.UTC(2026, 10, 1, 2, 0), date: '2026-11-01',
  content: '오늘은 비가 옵니다', images: ['data:image/jpeg;base64,AAAA'],
  target: 'all', targetLabel: '전체' }];
/* 품목 — 코드 있는 것 하나 · 코드 없는 것 하나 */
const PRODUCTS = [
  { code: 'SM-000', name: '서울우유 버터 12kg', spec: '12kg', unit: 'BOX', tax: '포함',
    inPrice: 150000, price: 170000 },
  { code: '', name: '무코드품목', spec: '100g', unit: 'EA', tax: '포함', inPrice: 100, price: 200 }
];
const SUF = '__B';

function app(opt) {
  opt = opt || {};
  const src = opt.src || NEW_SRC;
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(MEM);
  store['tkd_cars' + SUF] = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify([{ id: 'c1', name: '오전반' }]);
  store['tkd_staff' + SUF] = JSON.stringify([]);
  store['tkd_notices' + SUF] = JSON.stringify(opt.notices || NOTICES);
  store['tkd_products' + SUF] = JSON.stringify(opt.products || PRODUCTS);
  store['tkd_drivelog_manual' + SUF] = JSON.stringify({});
  store['tkd_org' + SUF] = JSON.stringify({ name: '가온학원', icon: '🚐', bizType: opt.biz || 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  const R = E.build({ src: src, biz: opt.biz || 'academy', localStorage: store });
  if (R.error) throw R.error;
  const ids = new Set(['admin-content', 'app-content', 'member-list', 'confirm-modal',
    'confirm-ok-btn', 'dlv-photo-input', 'barcode-result', 'upload-result']);
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
  const L = { up: [], alerts: [], toasts: [], saved: [], api: [] };
  R.sandbox.alert = R.win.alert = (m) => { L.alerts.push(String(m)); };
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userUid='uB';"
     + " window._userPaidUntil=Date.now()+1e9;");
  R.ev("window._userBizType='" + (opt.biz || 'academy') + "';");
  if (!opt.preSync) R.ev('_firstSyncOk=true;');
  R.ev('showToast = function(m){ window.__t(String(m)); };');
  R.sandbox.__t = R.win.__t = (m) => { L.toasts.push(String(m)); };
  R.ev('saveToFirebase = function(k,v){ window.__sv(k, JSON.stringify(v===undefined?null:v)); return Promise.resolve(true); };');
  R.sandbox.__sv = R.win.__sv = (k, v) => { L.saved.push({ k: k, v: v }); };
  R.ev('saveCarState = function(){ return Promise.resolve(true); };'
     + ' rebuildCarData = function(){}; renderAdminTab = function(){};'
     + ' renderDriveLogView = function(){}; openProductManager = function(){};'
     + ' renderMembers = function(){};');
  /* ★ 가짜 Storage — **무엇이 올라갔나**를 적는다(실제 통신 0) */
  R.ev('window._storage = {};'
     + ' window._storageFns = {'
     + '   storageRef: function(st, path){ return { path: path }; },'
     + '   uploadString: function(sref, data, kind){ window.__up(sref.path); '
     + '     return Promise.resolve({ ref: sref }); },'
     + '   getDownloadURL: function(ref){ return Promise.resolve("https://fb.example/" + ref.path); }'
     + ' };');
  R.sandbox.__up = R.win.__up = (p) => { L.up.push(String(p)); };
  if (opt.demo) R.ev('isDemoMode = function(){ return true; };');
  if (opt.readOnly) R.ev('isReadOnlyMode = function(){ return true; };'
    + ' readOnlyBlocked = function(w){ window.__t("읽기 전용: " + w); };');
  R.sandbox.fetch = R.win.fetch = async (url, init) => {
    L.api.push(JSON.parse((init && init.body) || '{}'));
    return { json: async () => ({ ok: true }) };
  };
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses(); notices = loadNotices();');
  return { R, L };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* 「사진을 올려 주소를 받는다」를 직접 불러 본다 */
const upNotice = async (p) => {
  const out = await p.R.ev('(function(){ window.__r="(안 불림)";'
    + ' uploadNoticeImages(notices[0].images, function(urls){ window.__r=JSON.stringify(urls===undefined?"undef":urls); });'
    + ' return "ok"; })()');
  await wait(40);
  return { r: out, got: p.R.ev('String(window.__r)') };
};
const upDlv = async (p) => {
  p.R.ev('(function(){ window.__u="(안 불림)"; window.__w="(없음)";'
    + ' uploadDriveLogPhoto("data:image/jpeg;base64,AAAA", function(url, why){'
    + '   window.__u=String(url); window.__w=String(why); });'
    + ' })()');
  await wait(40);
  return { url: p.R.ev('String(window.__u)'), why: p.R.ev('String(window.__w)') };
};
/* 품목 엑셀 한 번 올리기 — 가짜 XLSX */
const upProducts = async (p, rows) => {
  p.R.sandbox.FileReader = p.R.win.FileReader = function () {
    const self = this;
    this.readAsArrayBuffer = function () { setTimeout(() => { self.onload({ target: { result: new Uint8Array([1]) } }); }, 0); };
  };
  p.R.sandbox.XLSX = p.R.win.XLSX = {
    read: () => ({ SheetNames: ['s'], Sheets: { s: {} } }),
    utils: { sheet_to_json: () => rows }
  };
  p.R.ev('window.XLSX=XLSX; uploadProductExcel({ target:{ files:[{name:"p.xlsx"}] } });');
  await wait(80);
  return p.R.ev('loadProducts().map(function(x){ return (x.code||"-")+"/"+x.name+"/"+x.spec+"/"+x.price; }).join(" | ")');
};
const HDR = [['코드', '품명', '규격', '단위', '과세구분', '메모', '단가', ''],
  ['', '', '', '', '', '', '입고가', '출고가_A']];

(async () => {
  console.log('════ ① 사진 올리기 두 곳 — 문지기');
  {
    /* 재현 — 옛 판은 **읽기 전용 하나만** 보고 있었다 */
    const o1 = app({ src: OLD_SRC, demo: true });
    const r1 = await upNotice(o1);
    ck('[옛] ★ 둘러보기에서 «알림장» 사진이 **올라갔다**', o1.L.up.length, 1);
    ck('[옛]   그 경로', /^notice-images\//.test(o1.L.up[0] || ''), true);
    const o2 = app({ src: OLD_SRC, preSync: true });
    await upNotice(o2);
    ck('[옛] ★ 첫 동기화 전에도 **올라갔다**', o2.L.up.length, 1);
    const o3 = app({ src: OLD_SRC, demo: true });
    const d3 = await upDlv(o3);
    ck('[옛] ★ 둘러보기에서 운행 사진도 **올라갔다**(함수를 바로 부르면)', o3.L.up.length, 1);
    const o4 = app({ src: OLD_SRC, preSync: true });
    await upDlv(o4);
    ck('[옛] ★ 첫 동기화 전에도 **올라갔다**', o4.L.up.length, 1);
    const o5 = app({ src: OLD_SRC, readOnly: true });
    await upNotice(o5);
    ck('[옛]   읽기 전용은 **이미 막혀 있었다**(v263)', o5.L.up.length, 0);

    /* 고침 — 셋 다 막힌다 · 막히면 cb 실패 */
    const cases = [['둘러보기', { demo: true }], ['읽기 전용', { readOnly: true }],
      ['첫 동기화 전', { preSync: true }]];
    for (const [nm, opt] of cases) {
      const p = app(opt);
      const r = await upNotice(p);
      ck('★ [«알림장» · ' + nm + '] 올린 사진 0', p.L.up.length, 0);
      ck('  [«알림장» · ' + nm + '] 왜 안 됐는지 알린다', p.L.toasts.length > 0, true);
      const q = app(opt);
      const d = await upDlv(q);
      ck('★ [운행 사진 · ' + nm + '] 올린 사진 0', q.L.up.length, 0);
      ck('  [운행 사진 · ' + nm + '] `cb` 가 **실패**(null)', d.url, 'null');
      ck('  [운행 사진 · ' + nm + '] 막힌 것을 가려 준다', d.why, 'blocked');
    }
    /* 「올라갔다」 표시가 안 찍히는지 — `n.imageUrls` 는 `cb` 가 주소를 줘야만 저장된다 */
    for (const [nm, opt] of cases) {
      const p = app(opt);
      p.R.ev('(function(){ noticeEnsureImageUrls(notices[0], function(){}); })()');
      await wait(40);
      ck('★ [' + nm + '] 「올라갔다」 표시(`imageUrls`)가 **안 찍힌다**',
        p.R.ev('String((notices[0].imageUrls||[]).length)'), '0');
      ck('  [' + nm + '] «알림장» 저장도 안 한다',
        p.L.saved.filter((x) => x.k === 'notices').length, 0);
    }
    /* 대조 — 멀쩡하면 **그대로 올라가고** 주소가 찍힌다(막아만 두면 기능이 죽는다) */
    const ok = app({});
    const rk = await upNotice(ok);
    ck('(대조) 멀쩡하면 올라간다', ok.L.up.length, 1);
    ck('  (대조) 주소를 돌려준다', /fb\.example/.test(rk.got), true);
    const ok2 = app({});
    ok2.R.ev('(function(){ noticeEnsureImageUrls(notices[0], function(){}); })()');
    await wait(60);
    ck('  (대조) 「올라갔다」 표시가 찍힌다', ok2.R.ev('String((notices[0].imageUrls||[]).length)'), '1');
    ck('  (대조) «알림장» 도 저장된다', ok2.L.saved.filter((x) => x.k === 'notices').length >= 1, true);
    const ok3 = app({});
    const d3b = await upDlv(ok3);
    ck('(대조) 운행 사진도 올라간다', ok3.L.up.length, 1);
    ck('  (대조) 주소를 돌려준다', /fb\.example/.test(d3b.url), true);
    ck('  (대조) 막힌 것이 아니다', d3b.why, 'undefined');

    /* 문지기 순서가 저장과 같은가(둘러보기 → 읽기 전용 → 첫 동기화) */
    const bodyOf = (src, fn) => {
      const i = src.indexOf('function ' + fn + '(');
      if (i < 0) return '';
      const f = src.slice(i);
      return f.slice(0, f.indexOf('\n}\n'));
    };
    ['uploadNoticeImages', 'uploadDriveLogPhoto'].forEach((fn) => {
      const b = bodyOf(NEW_SRC, fn);
      const a = b.indexOf('isDemoMode()'), c = b.indexOf('isReadOnlyMode()'), d = b.indexOf('okToWriteNow()');
      ck('★ ' + fn + ' — 셋이 **저장과 같은 순서**',
        (a >= 0 && c > a && d > c) ? 'demo<ro<sync' : (a + '/' + c + '/' + d), 'demo<ro<sync');
      ck('  ' + fn + ' — 맨 앞 30줄 안이다',
        b.slice(0, 1600).indexOf('okToWriteNow()') >= 0, true);
    });
    /* 문지기 자리 수 — v306 열다섯 + 사진 둘 = **열일곱** */
    /* ★★ **그 회차 수·글은 그 회차 커밋에서** 읽는다(del63~65 와 같은 손질) —
       작업트리에서 세면 뒷 회차가 문지기를 더 붙이거나 경로를 바꿀 때 **거짓으로** 깨진다. */
    const THIS_SRC = THIS_REF
      ? cp.execSync('git -C ' + COS_ROOT + ' show ' + THIS_REF + ':index.html',
        { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n')
      : NEW_SRC;
    const gates = (s) => (s.match(/!okToWriteNow\(\)/g) || []).length;
    ck('★ 문지기 자리 수(이 회차 커밋)', gates(THIS_SRC), 17);
    ck('  (대조) v306 은 열다섯', gates(OLD_SRC), 15);
    ck('  지금 소스는 **줄지 않았다**',
      gates(NEW_SRC) >= 17 ? 'OK(' + gates(NEW_SRC) + ')' : gates(NEW_SRC),
      'OK(' + gates(NEW_SRC) + ')');

    /* ★ 업체 경로 — v307 에는 **업종 글자**였다(그 사실을 기록으로 남긴다).
       ★★ v308(67-B)에서 **업체 경로로 바꿨다** → 「지금 소스」로 재면 거짓으로 깨지므로
         **그 회차 커밋에서** 잰다(del63~66 과 같은 손질). 지금 소스를 지키는 일은
         `tests/del67.js`·`rulestest/s67.mjs` 가 이어 받는다. */
    const paths = (THIS_SRC.match(/'(notice-images|drivelog-photos)\/'\+bizId/g) || []).length;
    ck('★ (기록) v307 두 경로는 **업종 글자**(`getBizType`)였다', paths, 2);
    ck('  (기록) 그때 `getFbOrgId` 는 0곳',
      /(notice-images|drivelog-photos)\/'\+\s*getFbOrgId/.test(THIS_SRC), false);
    ck('  (기록) 그 회차에서는 경로를 안 바꿨다',
      (OLD_SRC.match(/'(notice-images|drivelog-photos)\/'\+bizId/g) || []).length, paths);
    ck('★ 지금 소스는 **업체 경로**다(v308 에서 고쳤다)',
      (NEW_SRC.match(/getFbOrgId\(\)\+'\/(notice-images|drivelog-photos)/g) || []).length, 2);
    console.log('      → v308(67-B)에서 `orgs/<업체>/…` 로 바꿨다 ·');
    console.log('        콘솔 Storage 규칙(1단계)이 그 경로를 업체로 막는다(`storage.rules` 기록)');
  }

  console.log('\n② 품목 엑셀 — 겹침 검사');
  {
    const ROWS = HDR.concat([
      ['SM-000', '서울우유 버터 12kg', '12kg', 'BOX', '포함', '', 999, 888],   /* 코드 겹침 */
      ['', '무코드품목', '100g', 'EA', '포함', '', 1, 2],                       /* 이름+규격 겹침 */
      ['SM-002', '새품목', '1kg', 'EA', '포함', '', 1000, 2000],                /* 새것 */
      ['', '무코드새것', '50g', 'EA', '포함', '', 10, 20]                        /* 새것(코드 없음) */
    ]);
    /* 재현 — 옛 판은 **그대로 두 벌**이 됐다 */
    const o = app({ src: OLD_SRC });
    const after0 = await upProducts(o, ROWS);
    ck('[옛] ★ 품목이 2 → 6개가 됐다(겹친 둘도 들어갔다)', after0.split(' | ').length, 6);
    ck('[옛] ★ 같은 코드가 **두 벌**', (after0.match(/SM-000/g) || []).length, 2);
    ck('[옛]   안내에 「건너뛰었어요」가 없다', /건너뛰/.test(o.L.alerts.join(' ')), false);

    /* 고침 */
    const p = app({});
    const after = await upProducts(p, ROWS);
    ck('★ 겹친 둘은 **건너뛰었다**(2 → 4개)', after.split(' | ').length, 4);
    ck('★ 같은 코드는 **한 벌**', (after.match(/SM-000/g) || []).length, 1);
    ck('★ 기존 값이 **그대로**(단가 170000 · 엑셀의 888 로 안 덮였다)',
      /SM-000\/서울우유 버터 12kg\/12kg\/170000/.test(after), true);
    ck('  코드 없는 겹침도 건너뛰었다', (after.match(/무코드품목/g) || []).length, 1);
    ck('  그 값도 그대로(200)', /-\/무코드품목\/100g\/200/.test(after), true);
    ck('★ 새 둘은 들어갔다', /SM-002/.test(after) && /무코드새것/.test(after), true);
    ck('★ 안내에 건너뛴 수', /2건은 이미 있어 건너뛰었어요/.test(p.L.alerts.join(' ')), true);
    ck('  더한 수도 적는다', /품목 2개를 추가했어요/.test(p.L.alerts.join(' ')), true);
    ck('  기존 값은 그대로라고 적는다', /기존 값은 그대로예요/.test(p.L.alerts.join(' ')), true);

    /* 같은 엑셀 **안에서** 겹친 줄도 걸러지나 */
    const q = app({ products: [] });
    const after2 = await upProducts(q, HDR.concat([
      ['A-1', '가', '1', 'EA', '포함', '', 1, 2],
      ['A-1', '가(다시)', '1', 'EA', '포함', '', 3, 4],
      ['', '나', '2', 'EA', '포함', '', 1, 2],
      ['', '나', '2', 'EA', '포함', '', 5, 6]
    ]));
    ck('★ 같은 엑셀 안의 겹침도 걸러진다(4줄 → 2개)', after2.split(' | ').length, 2);
    ck('  먼저 나온 줄이 남는다', /A-1\/가\/1\/2/.test(after2), true);
    ck('  안내', /2건은 이미 있어 건너뛰었어요/.test(q.L.alerts.join(' ')), true);

    /* 하나도 안 겹치면 그 줄이 안 뜬다 */
    const r2 = app({ products: [] });
    await upProducts(r2, HDR.concat([['B-1', '다', '1', 'EA', '포함', '', 1, 2]]));
    ck('  겹침이 없으면 그 줄이 **안 뜬다**', /건너뛰/.test(r2.L.alerts.join(' ')), false);

    /* 기준은 **한 벌**이고 바코드가 보는 칸과 같다 */
    ck('★ `prodSameExists` 한 벌',
      (NEW_SRC.match(/^function prodSameExists\(/mg) || []).length, 1);
    ck('  코드가 있으면 `code` 로 본다',
      /if\(c\)\{ if\(String\(p\.code\|\|''\)\.trim\(\)===c\) return true; \}/.test(NEW_SRC), true);
    ck('  바코드도 같은 칸을 같은 꼴로 본다',
      /String\(list\[i\]\.code\|\|''\)\.trim\(\)===code/.test(NEW_SRC), true);
    ck('  (61-1) 수는 `fmtNum`',
      /fmtNum\(skipped\)/.test(NEW_SRC), true);
  }

  console.log('\n③ 소스 전수');
  {
    /* 63~65 가 넣은 것이 그대로인가 */
    ['carLinkBlock', 'staffLinkBlock', 'courseLinkBlock', '_dumpHas', 'courseNameOf',
      'noCourseLineHtml', 'prodSameExists'].forEach((f) => {
      ck('  `' + f + '` 한 벌',
        (NEW_SRC.match(new RegExp('^function ' + f + '\\(', 'mg')) || []).length, 1);
    });
    const panels = (src) => (src.match(/BACK_PANEL_IDS\s*=\s*\[[\s\S]*?\]/) || [''])[0];
    ck('★ 새 창(덮개) 0 — `BACK_PANEL_IDS` 그대로',
      panels(NEW_SRC) === panels(OLD_SRC) ? '그대로' : '바뀜', '그대로');
    ck('  (61-1) `fmtNum`·`numOf` 한 벌 그대로',
      (NEW_SRC.match(/^function fmtNum\(/mg) || []).length + '/'
        + (NEW_SRC.match(/^function numOf\(/mg) || []).length, '1/1');
    ck('  (61-2) 카톡 변수 둘 그대로', (NEW_SRC.match(/--kakao[a-z-]*:/g) || []).length, 2);
    ck('  (로그아웃 짝) 새 `setInterval`·리스너 0',
      (NEW_SRC.match(/setInterval\(/g) || []).length === (OLD_SRC.match(/setInterval\(/g) || []).length
        && (NEW_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length === (OLD_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length,
      true);
    ck('  (업체 분리) `ORG_KEYS` 그대로',
      (NEW_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0] === (OLD_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0], true);
    ck('★ `api/`·`lib/`·규칙은 **한 줄도** 안 바뀌었다',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF
        + (THIS_REF ? ' ' + THIS_REF : '') + ' -- api lib firestore.rules',
        { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
    console.log('      (잰 자리: ' + OLD_REF + ' → ' + (THIS_REF || '작업트리') + ')');
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    /* ★ 이 회차는 307 이었다 — 뒷 회차가 올리므로 **그 이상**으로 본다 */
    ck('  버전 307 이상', appV >= 307 ? 'OK(' + appV + ')' : appV, 'OK(' + appV + ')');
    ck('  `version.json` 과 같다',
      String(JSON.parse(fs.readFileSync(COS_ROOT + '/version.json', 'utf8')).version), String(appV));
    const QA = (s) => { const i = s.indexOf('var HELP_QA=['); return i < 0 ? '' : s.slice(i, s.indexOf('\n];', i)); };
    ck('★ HELP_QA — 사진은 저장과 같은 때만', /사진은 저장과 같은 때만 올라가요/.test(QA(NEW_SRC)), true);
    ck('★ HELP_QA — 품목 겹침', /같은 품목이 두 벌로 쌓이지 않아요/.test(QA(NEW_SRC)), true);
    ck('  (대조) 옛 문답표에는 둘 다 없다',
      [/사진은 저장과 같은 때만/, /두 벌로 쌓이지 않아요/].filter((r) => r.test(QA(OLD_SRC))).length, 0);
    const qaN = (s) => (QA(s).match(/\{role:'(admin|driver|all)'/g) || []).length;
    /* ★ v315(72-B): 이 수는 **그 회차 커밋에서** 잰다 — 작업트리로 재면
       뒷 회차가 문답을 하나 더할 때마다 거짓으로 깨진다(공용 `srcAt` 한 벌). */
    ck('  문답 항목 수는 그대로', qaN(srcAt(THIS_REF)), qaN(OLD_SRC));
    ck('  CLAUDE.md 기본 점검 그대로',
      /지우는 길을 새로 만들면 서버 칸\(PIN·기기·배정\)도 같이 지운다/
        .test(fs.readFileSync(COS_ROOT + '/CLAUDE.md', 'utf8').replace(/\r\n/g, '\n')), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 가짜 Storage · 가짜 XLSX/FileReader');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
