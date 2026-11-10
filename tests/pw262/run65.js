/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v306(코스로드65) 실제 크롬 — **복원은 백업에 있는 칸만** · **끊긴 코스는 「코스 없음」** · 네 크기.
   ⓐ 끊긴 «회원» 이 명단에 **「코스 없음」**으로 보이나(네 크기 · 글 안 잘림)
   ⓑ **진짜 `<select>`** — 수정 창에 「코스 없음」 칸이 생기고 **골라져 있나**(옛 판은 빈칸) ·
      멀쩡한 «회원» 에게는 **안 생기나** · 저장해도 **안 옮기나**
   ⓒ 코스 화면 「코스 없는 «회원» N명」 줄 — 보이고 안 잘리나 · 0명이면 안 그리나
   ⓓ 복원 — 칸이 빠진 백업은 그 자료를 **서버에 안 올리고** 끝 안내에 「그대로 두었어요」
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const fs = require('fs');

const APP = process.env.COS_APP || ('' + COS_ROOT + '/index.html');
/* ★ 대조용 옛 판(v305) — 다른 묶음과 같은 꼴로 `old_index305.html` 을 곁에 둔다.
   없으면 대조만 건너뛴다(만드는 법: `git show b963a0b:index.html > old_index305.html`). */
const OLD_APP = process.env.COS_OLD_APP
  || (fs.existsSync(__dirname + '/old_index305.html') ? (__dirname + '/old_index305.html') : '');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

const CARS = [{ id: 'car1', name: '1호차', driver: '박기사' }];
const COURSES = [{ id: 'c1', name: '오전반', depart: '09:00', arrive: '09:30' }];
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
    location: '인천 연수구 1', lat: 37.41, lon: 126.68, phone: '010-1111-1111' },
  { id: 2, name: '나다움', carId: 'car1', courseId: 'c9', days: D7,      /* 끊긴 코스 */
    location: '인천 연수구 2', lat: 37.42, lon: 126.69, phone: '010-2222-2222' }
];

function seed() {
  return '(function(){\n'
    + '  window._userOrgId="B"; currentMode="admin";\n'
    + '  var S="__B";\n'
    + '  localStorage.setItem("tkd_cars"+S, ' + JSON.stringify(JSON.stringify(CARS)) + ');\n'
    + '  localStorage.setItem("tkd_courses"+S, ' + JSON.stringify(JSON.stringify(COURSES)) + ');\n'
    + '  localStorage.setItem("tkd_members"+S, ' + JSON.stringify(JSON.stringify(MEMBERS)) + ');\n'
    + '  localStorage.setItem("tkd_staff"+S, "[]");\n'
    + '  localStorage.setItem("tkd_payments"+S, JSON.stringify({phone_old:1}));\n'
    + '  localStorage.setItem("tkd_invoices"+S, JSON.stringify([{id:"iv_old"}]));\n'
    + '  localStorage.setItem("tkd_org"+S, JSON.stringify({name:"가온학원",icon:"🚐",bizType:"academy",\n'
    + '    destName:"학원",destLat:37.4467,destLon:126.6516}));\n'
    + '  localStorage.setItem("tkd_ridestate"+S, "{}");\n'
    + '  window._db={}; window._fbReady=true; window.__saved=[];\n'
    + '  window._firestore={ doc:function(){return{path:"x"};}, collection:function(){return{path:"x"};},\n'
    + '    getDoc:async function(){return {exists:function(){return false;},data:function(){return{};}};},\n'
    + '    setDoc:async function(){}, deleteDoc:async function(){},\n'
    + '    getDocs:async function(){return {forEach:function(){}};},\n'
    + '    runTransaction:async function(){return null;}, onSnapshot:function(){return function(){};} };\n'
    + '  window._auth={ currentUser:{ isAnonymous:false, getIdToken:function(){ return Promise.resolve("t"); } } };\n'
    + '  window.__alerts=[]; window.alert=function(m){ window.__alerts.push(String(m)); };\n'
    + '  window.confirm=function(){return true;}; window.open=function(){return null;};\n'
    + '  window.__api=[];\n'
    + '  window.fetch=function(u,i){ try{ window.__api.push(JSON.parse((i&&i.body)||"{}")); }catch(e){}\n'
    + '    return Promise.resolve({ok:true,json:function(){return Promise.resolve({ok:true});}}); };\n'
    + '})();';
}

async function open(b, w, h, appPath) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    errs.push(t.slice(0, 130));
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + String(appPath || APP).replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(seed());
  await p.evaluate(() => {
    window._userBizType = 'academy'; window._userUid = 'uB';
    window._userPaidUntil = Date.now() + 30 * 86400000;
    try { _userBizType = 'academy'; } catch (e) {}
    members = loadMembers(); cars = loadCars(); courses = loadCourses();
    orgSettings = loadOrgSettings(); staff = loadStaff();
    saveToFirebase = function (k, v) { window.__saved.push(k); return Promise.resolve(true); };
    saveCarState = function () { window.__saved.push('@carState'); return Promise.resolve(true); };
    rebuildCarData = function () { window.__saved.push('@carData'); };
    _firstSyncOk = true;
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
  });
  p.__errs = errs;
  return p;
}
/* 복원을 **진짜 FileReader 로** 흘려 넣는다 */
const restore = (p, dump) => p.evaluate(async (txt) => {
  const Orig = window.FileReader;
  window.FileReader = function () {
    const self = this;
    this.readAsText = function () { setTimeout(() => { self.onload({ target: { result: txt } }); }, 0); };
  };
  window.__alerts = [];
  const ev = { target: { value: 'x', files: [{ name: 'b.json' }] } };
  restoreData(ev);
  await new Promise((r) => setTimeout(r, 60));
  const cb = window._confirmCallback;
  if (typeof cb === 'function') await cb();
  await new Promise((r) => setTimeout(r, 160));
  window.FileReader = Orig;
  return { saved: window.__saved.slice(), alerts: window.__alerts.slice() };
}, JSON.stringify(dump));

const DUMP = (drop) => {
  const d = { _app: 'COSROAD', _version: 1, _date: '2026-11-01T00:00:00.000Z', data: {} };
  d.data['tkd_members'] = JSON.stringify(MEMBERS);
  d.data['tkd_cars'] = JSON.stringify(CARS);
  d.data['tkd_courses'] = JSON.stringify(COURSES);
  d.data['tkd_org'] = JSON.stringify({ name: '가온학원', bizType: 'academy' });
  d.data['tkd_payments'] = JSON.stringify({ from_backup: 1 });
  d.data['tkd_invoices'] = JSON.stringify([{ id: 'iv_backup' }]);
  d.data['tkd_staff'] = JSON.stringify([]);
  /* ★ 업체 칸 **20개를 다 들고 온** 백업 — 그래야 둘을 빼면 안내가 「2가지」가 된다 */
  ['tkd_tax', 'tkd_attendance', 'tkd_attendance_time', 'tkd_notices', 'tkd_carlog',
    'tkd_drivelog_manual', 'tkd_payroll_manual', 'tkd_driver_att', 'tkd_products',
    'tkd_ridestate', 'tkd_driver_pay', 'tkd_support_seen', 'tkd_certificates']
    .forEach((k) => {
      const v = (k === 'tkd_carlog') ? { records: [], plans: {} }
        : (/notices|products|certificates|support/.test(k) ? [] : {});
      d.data[k] = JSON.stringify(v);
    });
  (drop || []).forEach((k) => { delete d.data[k]; });
  return d;
};

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐⓒ 네 크기 — 명단 「코스 없음」 · 코스 화면 한 줄');
  for (const [w, h] of SIZES) {
    const p = await open(b, w, h);
    const tag = (w + 'x' + h).padEnd(9);
    const r = await p.evaluate(() => {
      /* ★ 관리 화면을 **보이게** 해야 폭이 0 이 아니다 — 숨은 칸은 `0 ≤ 0` 으로
         늘 통과해서 「안 잘린다」를 재는 뜻이 없어진다(처음에 그랬다). */
      document.getElementById('admin-screen').classList.add('show');
      switchAdminTab('members');
      const host = document.getElementById('admin-content');
      const cls = [...host.querySelectorAll('.member-class')].map((e) => (e.textContent || '').trim());
      /* 「코스 없음」 칸이 가로로 삐져나가지 않나 */
      let clip = 'none';
      host.querySelectorAll('.member-class').forEach((e) => {
        if (e.scrollWidth > e.clientWidth + 1) clip = (e.textContent || '').trim();
      });
      switchAdminTab('schedule');
      const h2 = document.getElementById('admin-content');
      const row = [...h2.querySelectorAll('.setting-row')]
        .filter((e) => /코스 없는/.test(e.textContent || ''))[0];
      let rr = null;
      if (row) {
        const bb = row.getBoundingClientRect();
        rr = { txt: (row.textContent || '').replace(/\s+/g, ' ').trim(),
          sw: row.scrollWidth, cw: row.clientWidth,
          left: Math.round(bb.left), right: Math.round(bb.right), vw: window.innerWidth };
      }
      return { cls: cls, clip: clip, row: rr };
    });
    say(r.cls.some((t) => /코스 없음/.test(t)), tag + '★ 명단에 「코스 없음」'.padEnd(40)
      + (r.cls.find((t) => /코스 없음/.test(t)) || '없음').slice(0, 18));
    say(r.cls.some((t) => /오전반/.test(t)), tag + '  멀쩡한 «회원» 은 코스 이름'.padEnd(40)
      + (r.cls.find((t) => /오전반/.test(t)) || '없음').slice(0, 14));
    say(r.clip === 'none', tag + '  명단 글이 안 잘린다'.padEnd(40) + r.clip);
    say(!!r.row, tag + '★ 코스 화면에 그 줄이 있다'.padEnd(40)
      + (r.row ? r.row.txt.slice(0, 20) : '없다'));
    if (r.row) {
      say(/코스 없는 회원 1명/.test(r.row.txt), tag + '  수가 맞다'.padEnd(40)
        + (/\d+명/.exec(r.row.txt) || ['-'])[0]);
      say(r.row.sw <= r.row.cw, tag + '★ 그 줄 가로 넘침 0'.padEnd(40)
        + r.row.sw + ' ≤ ' + r.row.cw);
      say(r.row.left >= 0 && r.row.right <= r.row.vw, tag + '  화면 안에 들어온다'.padEnd(40)
        + r.row.left + '~' + r.row.right + ' / ' + r.row.vw);
    }
    say(p.__errs.length === 0, tag + '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓑ 진짜 `<select>` — 「코스 없음」 칸이 생기고 골라져 있다');
  {
    const p = await open(b, 390, 844);
    const r = await p.evaluate(() => {
      openEditModal(2);                                     /* 끊긴 «회원» */
      const e = document.getElementById('m-class');
      const bad = { opts: [...e.options].map((o) => o.value + ':' + o.textContent),
        val: e.value, idx: e.selectedIndex, shown: (e.options[e.selectedIndex] || {}).textContent || '' };
      openEditModal(1);                                     /* 멀쩡한 «회원» */
      const ok = { opts: [...e.options].map((o) => o.value), val: e.value, idx: e.selectedIndex };
      return { bad: bad, ok: ok, courseId: members[1].courseId };
    });
    say(r.bad.opts[0] === ':코스 없음', '★ 맨 위에 「코스 없음」 칸'.padEnd(46) + r.bad.opts[0]);
    say(r.bad.idx === 0 && r.bad.val === '', '★ 그 칸이 **골라져 있다**(빈칸 아님)'.padEnd(46)
      + 'idx ' + r.bad.idx + ' / val "' + r.bad.val + '"');
    say(/코스 없음/.test(r.bad.shown), '  화면에 그 글자가 보인다'.padEnd(46) + r.bad.shown);
    say(r.ok.opts.indexOf('') < 0, '★ 멀쩡한 «회원» 에게는 **안 생긴다**'.padEnd(46)
      + r.ok.opts.join(','));
    say(r.ok.val === 'c1' && r.ok.idx === 0, '  그 «회원» 은 자기 코스가 골라져 있다'.padEnd(46)
      + r.ok.val);
    say(r.courseId === 'c9', '★ 수정 창을 열어도 자료는 **안 바뀐다**'.padEnd(46) + r.courseId);
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    /* 대조 — 옛 판(있으면)은 빈칸이 된다 */
    if (OLD_APP) {
      const o = await open(b, 390, 844, OLD_APP);
      const ro = await o.evaluate(() => {
        openEditModal(2);
        const e = document.getElementById('m-class');
        return { idx: e.selectedIndex, val: e.value, n: e.options.length };
      });
      say(ro.idx === -1, '(대조) 옛 판은 **빈칸**(selectedIndex -1)'.padEnd(46) + ro.idx);
      await o.close();
    }
    await p.close();
  }

  console.log('\nⓓ 복원 — 칸이 빠진 백업은 그 자료를 서버에 안 올린다');
  {
    const p = await open(b, 1366, 768);
    const r = await restore(p, DUMP(['tkd_payments', 'tkd_invoices']));
    say(r.saved.indexOf('payments') < 0, '★ `payments` 를 안 올렸다'.padEnd(46)
      + (r.saved.indexOf('payments') < 0 ? '0번' : '올렸다'));
    say(r.saved.indexOf('invoices') < 0, '★ `invoices` 를 안 올렸다'.padEnd(46)
      + (r.saved.indexOf('invoices') < 0 ? '0번' : '올렸다'));
    say(r.saved.indexOf('members') >= 0, '  칸이 있는 `members` 는 올렸다'.padEnd(46)
      + (r.saved.indexOf('members') >= 0 ? 'OK' : '안 올렸다'));
    say(/이 백업에 없던 자료 2가지는 그대로 두었어요/.test(r.alerts.join(' ')),
      '★ 끝 안내 「그대로 두었어요」'.padEnd(46)
      + (/없던 자료 (\d+)가지/.exec(r.alerts.join(' ')) || ['없음'])[0]);
    const after = await p.evaluate(() => JSON.stringify(loadPayments()));
    say(/phone_old/.test(after), '★ 폰 값도 그대로'.padEnd(46) + after.slice(0, 20));
    /* 다 들고 오면 둘 다 올라간다(검사가 살아 있다는 증거) */
    const p2 = await open(b, 1366, 768);
    const r2 = await restore(p2, DUMP());
    say(r2.saved.indexOf('payments') >= 0 && r2.saved.indexOf('invoices') >= 0,
      '  (대조) 다 들고 오면 둘 다 올라간다'.padEnd(46) + 'OK');
    say(!/없던 자료/.test(r2.alerts.join(' ')), '  (대조) 그 줄이 안 뜬다'.padEnd(46) + 'OK');
    say(p.__errs.length === 0 && p2.__errs.length === 0, '오류 0'.padEnd(46)
      + (p.__errs[0] || p2.__errs[0] || 'OK'));
    await p.close(); await p2.close();
  }

  await b.close();
  console.log('\n' + (bad ? 'X 실패 ' + bad + '건' : 'o 전부 통과') + ' — 실제 크롬 4크기');
  console.log('※ 바깥 요청 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})();
