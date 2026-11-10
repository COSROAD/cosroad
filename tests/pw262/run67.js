/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v308(코스로드67-B) 실제 크롬 — **사진은 업체 경로** · **백업에 업체 표시** · 네 크기.
   ⓐ 사진 두 곳이 `orgs/<업체>/…` 로 올라가나 · 업체가 바뀌면 폴더도 바뀌나
   ⓑ 백업 파일을 **내려받아 열어** `_org`·`_orgName` 이 들어 있나 · 파일 이름에 업체 뒤 6자
   ⓒ 복원 — **다른 업체 백업**이면 한 번 더 묻고, 「아니요」면 아무것도 안 바뀌나(네 크기에서 글 확인)
   ⓓ 표시 없는 옛 백업도 묻나 · 같은 업체면 안 묻나
   바깥 요청 전부 차단 · Firestore·Storage 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const fs = require('fs');

const APP = process.env.COS_APP || ('' + COS_ROOT + '/index.html');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

const CARS = [{ id: 'car1', name: '1호차', driver: '박기사' }];
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
  location: '인천 연수구 1', lat: 37.41, lon: 126.68, phone: '010-1111-1111' }];
const NOTICES = [{ id: 1, ts: Date.UTC(2026, 10, 1, 2, 0), date: '2026-11-01',
  content: '오늘은 비가 옵니다', images: ['data:image/jpeg;base64,AAAA'], target: 'all' }];

function seed(org, orgName) {
  const S = '__' + org;
  return '(function(){\n'
    + '  window._userOrgId=' + JSON.stringify(org) + '; currentMode="admin";\n'
    + '  var S=' + JSON.stringify(S) + ';\n'
    + '  localStorage.setItem("tkd_cars"+S, ' + JSON.stringify(JSON.stringify(CARS)) + ');\n'
    + '  localStorage.setItem("tkd_courses"+S, JSON.stringify([{id:"c1",name:"오전반"}]));\n'
    + '  localStorage.setItem("tkd_members"+S, ' + JSON.stringify(JSON.stringify(MEMBERS)) + ');\n'
    + '  localStorage.setItem("tkd_notices"+S, ' + JSON.stringify(JSON.stringify(NOTICES)) + ');\n'
    + '  localStorage.setItem("tkd_staff"+S, "[]");\n'
    + '  localStorage.setItem("tkd_org"+S, JSON.stringify({name:' + JSON.stringify(orgName)
    + ',icon:"🚐",bizType:"academy",destName:"학원",destLat:37.4467,destLon:126.6516}));\n'
    + '  localStorage.setItem("tkd_ridestate"+S, "{}");\n'
    + '  window._db={}; window._fbReady=true; window.__saved=[];\n'
    + '  window._firestore={ doc:function(){return{path:"x"};}, collection:function(){return{path:"x"};},\n'
    + '    getDoc:async function(){return {exists:function(){return false;},data:function(){return{};}};},\n'
    + '    setDoc:async function(){}, deleteDoc:async function(){},\n'
    + '    getDocs:async function(){return {forEach:function(){}};},\n'
    + '    runTransaction:async function(){return null;}, onSnapshot:function(){return function(){};} };\n'
    + '  window._auth={ currentUser:{ isAnonymous:false, getIdToken:function(){ return Promise.resolve("t"); } } };\n'
    + '  window.__alerts=[]; window.alert=function(m){ window.__alerts.push(String(m)); };\n'
    + '  window.__confirms=[]; window.__answer=true;\n'
    + '  window.confirm=function(m){ window.__confirms.push(String(m)); return window.__answer; };\n'
    + '  window.open=function(){return null;};\n'
    + '  window.__api=[];\n'
    + '  window.fetch=function(u,i){ try{ window.__api.push(JSON.parse((i&&i.body)||"{}")); }catch(e){}\n'
    + '    return Promise.resolve({ok:true,json:function(){return Promise.resolve({ok:true});}}); };\n'
    + '  /* 가짜 Storage — **어느 경로로 올렸나**만 적는다(실제 통신 0) */\n'
    + '  window.__up=[]; window._storage={};\n'
    + '  window._storageFns={\n'
    + '    storageRef:function(st,path){ return {path:path}; },\n'
    + '    uploadString:function(sref){ window.__up.push(sref.path); return Promise.resolve({ref:sref}); },\n'
    + '    getDownloadURL:function(ref){ return Promise.resolve("https://fb.example/"+ref.path); }\n'
    + '  };\n'
    + '})();';
}

async function open(b, w, h, opt) {
  opt = opt || {};
  const org = opt.org || 'academy_acme';
  const orgName = opt.orgName || '가온학원';
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1,
    acceptDownloads: true });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    errs.push(t.slice(0, 130));
  });
  const dl = [];
  p.on('download', async (d) => {
    const rec = { name: d.suggestedFilename(), body: '' };
    try { rec.body = fs.readFileSync(await d.path(), 'utf8'); } catch (e) { rec.body = 'ERR'; }
    dl.push(rec);
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + APP.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(seed(org, orgName));
  await p.evaluate(() => {
    window._userBizType = 'academy'; window._userUid = 'uB';
    window._userPaidUntil = Date.now() + 30 * 86400000;
    try { _userBizType = 'academy'; } catch (e) {}
    members = loadMembers(); cars = loadCars(); courses = loadCourses();
    orgSettings = loadOrgSettings(); staff = loadStaff(); notices = loadNotices();
    saveToFirebase = function (k) { window.__saved.push(k); return Promise.resolve(true); };
    saveCarState = function () { return Promise.resolve(true); };
    rebuildCarData = function () {};
    _firstSyncOk = true;
    document.getElementById('admin-screen').classList.add('show');
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
  });
  p.__errs = errs;
  p.__dl = dl;
  return p;
}
const DUMP = (over) => {
  const d = { _app: 'COSROAD', _version: 1, _date: '2026-11-01T00:00:00.000Z',
    _org: 'academy_acme', _orgName: '가온학원', data: {} };
  d.data['tkd_members'] = JSON.stringify(MEMBERS);
  d.data['tkd_cars'] = JSON.stringify(CARS);
  if (over) over(d);
  return d;
};
const restore = (p, dump, answer) => p.evaluate(async (a) => {
  const Orig = window.FileReader;
  window.FileReader = function () {
    const self = this;
    this.readAsText = function () { setTimeout(() => { self.onload({ target: { result: a.txt } }); }, 0); };
  };
  /* ★ **지난 복원이 남긴 콜백을 먼저 비운다** — 한 페이지에서 여러 번 재므로, 안 비우면
     「아니요」로 막혔는데도 앞 콜백이 남아 `ok` 로 보인다(처음에 그렇게 거짓 실패했다).
     실제 앱에서는 `confirmOk()`·`closeConfirmModal()` 이 비운다. */
  window._confirmCallback = null;
  window.__confirms = []; window.__answer = a.answer; window.__alerts = [];
  const ev = { target: { value: 'x', files: [{ name: 'b.json' }] } };
  restoreData(ev);
  await new Promise((r) => setTimeout(r, 60));
  const cb = window._confirmCallback;
  let ran = 'NOCB';
  if (typeof cb === 'function') { await cb(); ran = 'ok'; }
  await new Promise((r) => setTimeout(r, 140));
  window.FileReader = Orig;
  return { ran: ran, confirms: window.__confirms.slice(), alerts: window.__alerts.slice(),
    value: ev.target.value, members: members.length, saved: window.__saved.slice() };
}, { txt: JSON.stringify(dump), answer: answer !== false });

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐ 사진 두 곳 — `orgs/<업체>/…` 로 올라간다');
  {
    const p = await open(b, 1366, 768);
    const r = await p.evaluate(async () => {
      uploadNoticeImages(notices[0].images, function () {});
      uploadDriveLogPhoto('data:image/jpeg;base64,AAAA', function () {});
      await new Promise((r2) => setTimeout(r2, 140));
      return window.__up.slice();
    });
    say(r.length === 2, '★ 둘 다 올라갔다'.padEnd(46) + r.length + '장');
    say(/^orgs\/academy_acme\/notice-images\/\d+_0_[a-z0-9]+\.jpg$/.test(r[0] || ''),
      '★ «알림장» 경로'.padEnd(46) + (r[0] || '없음'));
    say(/^orgs\/academy_acme\/drivelog-photos\/\d+_[a-z0-9]+\.jpg$/.test(r[1] || ''),
      '★ 운행 사진 경로'.padEnd(46) + (r[1] || '없음'));
    say(!/academy_\d/.test(r.join(' ')), '  업종 글자가 파일 이름에 없다'.padEnd(46) + 'OK');
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
    /* 업체가 바뀌면 폴더도 바뀐다 */
    const q = await open(b, 1366, 768, { org: 'academy_other', orgName: '다른학원' });
    const r2 = await q.evaluate(async () => {
      uploadNoticeImages(notices[0].images, function () {});
      await new Promise((r3) => setTimeout(r3, 100));
      return window.__up.slice();
    });
    say(/^orgs\/academy_other\/notice-images\//.test(r2[0] || ''),
      '★ 업체가 바뀌면 **폴더도 바뀐다**'.padEnd(46) + (r2[0] || '없음').slice(0, 30));
    say(q.__errs.length === 0, '오류 0'.padEnd(46) + (q.__errs[0] || 'OK'));
    await q.close();
  }

  console.log('\nⓑ 백업 파일의 글·이름 — `_org`·`_orgName`·파일 이름');
  {
    /* ★★ **내려받기 이벤트로는 못 잰다** — `backupData` 가 `a.click()` 바로 뒤에
       `URL.revokeObjectURL()` 을 부르는데, 헤드리스 크롬에서는 그 사이에 내려받기가
       **끊겨 이벤트가 안 온다**(실측: 같은 코드에서 revoke 를 빼면 1개가 잡힌다).
       → **파일을 만드는 자리**(`Blob` 과 `a.download`)를 가로채 **실제로 쓰는 글과 이름**을
         잰다. 앱 코드는 그대로 돌고, 재는 것은 「무엇을 파일로 내보내나」다. */
    const p = await open(b, 1366, 768);
    const r = await p.evaluate(() => {
      window.__blob = ''; window.__name = '';
      const OrigBlob = window.Blob;
      window.Blob = function (parts, o) { window.__blob = String((parts && parts[0]) || ''); return new OrigBlob(parts, o); };
      const origCreate = document.createElement.bind(document);
      document.createElement = function (tag) {
        const el = origCreate(tag);
        if (String(tag).toLowerCase() === 'a') {
          let v = '';
          Object.defineProperty(el, 'download', {
            get() { return v; }, set(x) { v = String(x); window.__name = v; }
          });
        }
        return el;
      };
      const out = backupData();
      document.createElement = origCreate; window.Blob = OrigBlob;
      return { out: String(out), body: window.__blob, name: window.__name };
    });
    say(r.out === 'true', '★ 백업이 **됐다**(참을 돌려준다)'.padEnd(46) + r.out);
    p.__dl.push({ name: r.name, body: r.body });   /* 아래 칸이 쓰는 꼴로 맞춘다 */
    const body = r.body;
    let d = {};
    try { d = JSON.parse(body); } catch (e) { d = {}; }
    say(d._org === 'academy_acme', '★ 파일 안에 `_org`'.padEnd(46) + (d._org || '없음'));
    say(d._orgName === '가온학원', '★ 파일 안에 `_orgName`'.padEnd(46) + (d._orgName || '없음'));
    say(d._app === 'COSROAD' && d._version === 1, '  옛 칸도 그대로'.padEnd(46)
      + d._app + '/' + d._version);
    say(/_y_acme_\d{4}-\d{2}-\d{2}\.json$/.test((p.__dl[0] || {}).name || ''),
      '★ 파일 이름에 업체 뒤 6자'.padEnd(46) + ((p.__dl[0] || {}).name || '없음'));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒⓓ 복원 — 다른 업체면 한 번 더 묻는다 (네 크기)');
  for (const [w, h] of SIZES) {
    const p = await open(b, w, h);
    const tag = (w + 'x' + h).padEnd(9);
    /* 같은 업체 — 안 묻는다 */
    const same = await restore(p, DUMP());
    say(same.confirms.length === 0, tag + '★ 같은 업체는 **안 묻는다**'.padEnd(40)
      + same.confirms.length + '번');
    say(same.ran === 'ok', tag + '  그 복원은 된다'.padEnd(40) + same.ran);
    /* 다른 업체 — 묻고, 「예」면 된다 */
    const diff = await restore(p, DUMP((d) => { d._org = 'academy_zzz'; d._orgName = '남의학원'; }), true);
    say(diff.confirms.length === 1, tag + '★ 다른 업체면 **한 번 더 묻는다**'.padEnd(40)
      + diff.confirms.length + '번');
    say(/「남의학원」 백업이에요/.test(diff.confirms[0] || ''), tag + '  그 글에 업체 이름'.padEnd(40)
      + (/「[^」]*」 백업이에요/.exec(diff.confirms[0] || '') || ['없음'])[0]);
    say(/지금 업체\(가온학원\)/.test(diff.confirms[0] || ''), tag + '  지금 업체 이름도'.padEnd(40)
      + (/지금 업체\([^)]*\)/.exec(diff.confirms[0] || '') || ['없음'])[0]);
    say(diff.ran === 'ok', tag + '  「예」면 복원된다'.padEnd(40) + diff.ran);
    /* 「아니요」 — 아무것도 안 한다 */
    const no = await restore(p, DUMP((d) => { d._org = 'academy_zzz'; d._orgName = '남의학원'; }), false);
    say(no.ran === 'NOCB', tag + '★ 「아니요」면 **확인 창도 안 뜬다**'.padEnd(40) + no.ran);
    say(no.value === '', tag + '  고른 파일 칸을 비운다'.padEnd(40) + '"' + no.value + '"');
    /* 표시 없는 옛 백업 */
    const old = await restore(p, DUMP((d) => { delete d._org; delete d._orgName; }), true);
    say(old.confirms.length === 1 && /표시가 없는 옛 파일이에요/.test(old.confirms[0] || ''),
      tag + '★ 표시 없는 옛 백업도 묻는다'.padEnd(40)
      + (old.confirms[0] || '안 물음').slice(0, 20));
    say(p.__errs.length === 0, tag + '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log('\n' + (bad ? 'X 실패 ' + bad + '건' : 'o 전부 통과') + ' — 실제 크롬 4크기');
  console.log('※ 바깥 요청 차단 · Firestore·Storage 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})();
