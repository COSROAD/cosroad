/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v273 — 두 차량 칸, 실제 크롬. 네 크기 · 네 업종.
   ★ 바깥 요청은 전부 막고 Firestore 는 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');
/* ★ v274: 이 묶음은 **v273 회차 기록**이다 — 화면을 그 회차 커밋에서 띄운다.
   전에는 일하는 폴더를 띄웠다. 그래서 v274 가 기사 읽기 키를 줄이고
   `carData` 사본에서 명단을 받게 바꾸자 이 회차의 기대값이 거짓으로 깨졌다
   (v273 가 틀린 것이 아니다). 지금 화면은 run274.js 가 본다. */
const PIN_REF = process.env.COS_SRC_NEW_REF || '06e30f3';
const APP = (function(){
  const f = require('path').join(__dirname, 'pin_run273.html');
  require('fs').writeFileSync(f, require('child_process').execSync(
    'git -C ' + COS_ROOT + ' show ' + PIN_REF + ':index.html', { maxBuffer: 1 << 28 }));
  return f;
})();
const OLD_REF = process.env.COS_SRC_OLD_REF || 'd26c93e';   /* v272 */
const OLD = path.join(__dirname, 'old_index273.html');
const SIZES = [[390, 844], [360, 640], [768, 1024], [1366, 768]];

const CARS = [{ id: 'car1', name: '1호차' }, { id: 'car2', name: '2호차' }, { id: 'car3', name: '3호차' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [
  { id: 1, name: '가하은', carId: 'car1', carIdDrop: 'car2', courseId: 'c1', days: D7,
    location: '인천 연수구 1', lat: 37.41, lon: 126.68,
    dropLocation: '인천 하차 1', dropLat: 37.42, dropLon: 126.69,
    phone: '010-1111-1111', on: true, offOn: true, monthly: 130000 },
  { id: 2, name: '나여름', carId: 'car1', courseId: 'c1', days: D7,
    location: '인천 연수구 2', lat: 37.43, lon: 126.70,
    phone: '010-2222-2222', on: true, offOn: true, monthly: 120000 },
  { id: 3, name: '다가을', carId: 'car3', courseId: 'c1', days: D7,
    location: '인천 남동구 3', lat: 37.45, lon: 126.73,
    phone: '010-3333-3333', on: true, offOn: true, monthly: 110000 }
];

function seed(biz) {
  return `(function(){
    var SUF='__cosroad_default';
    localStorage.setItem('tkd_cars'+SUF, ${JSON.stringify(JSON.stringify(CARS))});
    localStorage.setItem('tkd_courses'+SUF, ${JSON.stringify(JSON.stringify(COURSES))});
    localStorage.setItem('tkd_members'+SUF, ${JSON.stringify(JSON.stringify(MEMBERS))});
    localStorage.setItem('tkd_org'+SUF, JSON.stringify({name:'가온',icon:'🚐',bizType:'${biz}',
      destName:'학원',destLat:37.4467,destLon:126.6516}));
    localStorage.setItem('tkd_ridestate'+SUF,'{}');
    window._db={}; window._fbReady=true;
    window._firestore={ doc:function(){return{};}, collection:function(){return{};},
      getDoc:async function(){return {exists:function(){return false;},data:function(){return{};}};},
      setDoc:async function(){}, deleteDoc:async function(){},
      getDocs:async function(){return {forEach:function(){}};}, onSnapshot:function(){return function(){};} };
  })();`;
}

async function open(b, w, h, file, biz) {
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
  await p.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(seed(biz));
  await p.evaluate((biz) => {
    window.__alerts = []; window.alert = (m) => window.__alerts.push(String(m));
    window.confirm = () => true; window.open = () => null;
    try { _userBizType = biz; } catch (e) {}
    window._userBizType = biz; window._userOrgId = 'cosroad_default';
    try { members = loadMembers(); cars = loadCars(); courses = loadCourses(); orgSettings = loadOrgSettings(); } catch (e) {}
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
  }, biz);
  p.__errs = errs;
  return p;
}

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('① 회원 수정 창 — 「하원 차량」 칸 (업종별)');
  for (const [w, h] of SIZES) {
    for (const biz of ['academy', 'public', 'logistics', 'delivery']) {
      const p = await open(b, w, h, APP, biz);
      const r = await p.evaluate(() => {
        currentMode = 'admin';
        populateSelects(); openEditModal(1);
        const wrap = document.getElementById('wrap-dropcar');
        const sel = document.getElementById('m-dropcar');
        const cs = wrap ? getComputedStyle(wrap) : null;
        const box = wrap ? wrap.getBoundingClientRect() : null;
        return {
          있나: !!wrap, 보이나: cs ? cs.display !== 'none' : false,
          값: sel ? sel.value : '(없음)',
          옵션: sel ? Array.from(sel.options).map((o) => o.textContent) : [],
          넘침: box ? Math.round(box.right) : 0, vw: window.innerWidth,
          scrollW: document.documentElement.scrollWidth
        };
      });
      const two = (biz === 'academy' || biz === 'public');
      const tag = '[' + w + 'x' + h + ' ' + biz + '] ';
      say(r.있나, (tag + '칸이 있다').padEnd(34) + r.있나);
      say(r.보이나 === two, (tag + (two ? '보인다' : '안 보인다')).padEnd(34) + r.보이나);
      if (two) {
        say(r.값 === 'car2', (tag + '가하은 하원 = 2호차').padEnd(34) + r.값);
        say(r.옵션[0] === '등원과 같음', (tag + '첫 보기 「등원과 같음」').padEnd(34) + r.옵션.join('/'));
        say(r.넘침 <= r.vw, (tag + '칸이 화면 안').padEnd(34) + r.넘침 + ' <= ' + r.vw);
      }
      say(r.scrollW <= r.vw, (tag + '가로 넘침 0').padEnd(34) + r.scrollW + ' <= ' + r.vw);
      say(p.__errs.length === 0, (tag + '오류 0').padEnd(34) + (p.__errs[0] || 'OK'));
      await p.close();
    }
  }

  console.log('\n② 기사 운행 화면 — 등원·하원이 갈린다 (학원 390)');
  {
    for (const [carId, leg, want] of [['car1', 'pickup', '가하은,나여름'], ['car1', 'dropoff', '나여름'],
                                      ['car2', 'pickup', ''], ['car2', 'dropoff', '가하은'],
                                      ['car3', 'pickup', '다가을'], ['car3', 'dropoff', '다가을']]) {
      const p = await open(b, 390, 844, APP, 'academy');
      const r = await p.evaluate(({ carId, leg }) => {
        currentMode = 'driver';
        window._isDriverAcct = true; window._driverCarId = carId;
        currentCourseId = 'c1';
        currentDay = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
        currentCarId = carId; driveLeg = leg;
        const list = getActiveStudents().map((x) => x.name);
        switchTab('drive'); renderDrive();
        const txt = (document.getElementById('app-content').textContent || '');
        return { list: list.join(','), 화면에가하은: txt.indexOf('가하은') >= 0,
                 화면에나여름: txt.indexOf('나여름') >= 0, 화면에다가을: txt.indexOf('다가을') >= 0 };
      }, { carId, leg });
      const tag = '[' + carId + ' ' + (leg === 'pickup' ? '등원' : '하원') + '] ';
      say(r.list.split(',').filter(Boolean).sort().join(',') === want.split(',').filter(Boolean).sort().join(','),
        (tag + '목록').padEnd(26) + (r.list || '없음') + '   (기대 ' + (want || '없음') + ')');
      say(p.__errs.length === 0, (tag + '오류 0').padEnd(26) + (p.__errs[0] || 'OK'));
      await p.close();
    }
  }

  console.log('\n③ 기사 «회원» 탭 — 등원·하원 어느 쪽이든 내 차량이면');
  {
    for (const [carId, want] of [['car1', '가하은,나여름'], ['car2', '가하은'], ['car3', '다가을']]) {
      const p = await open(b, 390, 844, APP, 'academy');
      const r = await p.evaluate((carId) => {
        currentMode = 'driver';
        window._isDriverAcct = true; window._driverCarId = carId;
        return driverScopeMembers(members).map((x) => x.name).join(',');
      }, carId);
      say(r.split(',').filter(Boolean).sort().join(',') === want.split(',').sort().join(','),
        ('[' + carId + ' 기사] «회원» 탭').padEnd(26) + (r || '없음') + '   (기대 ' + want + ')');
      await p.close();
    }
  }

  console.log('\n④ 차량관리 — 하원 띠 · 넣을 때 고르기 (학원)');
  for (const [w, h] of [[390, 844], [1366, 768]]) {
    const p = await open(b, w, h, APP, 'academy');
    const r = await p.evaluate(() => {
      currentMode = 'admin';
      const el = document.getElementById('admin-content');
      currentCarTab = 1;                        /* 2호차 */
      renderAdminTab('cars');
      const t = el.textContent || '';
      return {
        하원띠: (t.match(/하원/g) || []).length,
        가하은보임: t.indexOf('가하은') >= 0,
        하원해제: t.indexOf('하원 해제') >= 0,
        넣을때: t.indexOf('넣을 때') >= 0,
        둘다: t.indexOf('둘 다') >= 0, 등원만: t.indexOf('등원만') >= 0, 하원만: t.indexOf('하원만') >= 0,
        등원1호차: t.indexOf('등원 1호차') >= 0,
        scrollW: document.documentElement.scrollWidth, vw: window.innerWidth
      };
    });
    const tag = '[' + w + 'x' + h + '] ';
    say(r.가하은보임, (tag + '2호차에 가하은(하원만) 보인다').padEnd(36) + r.가하은보임);
    say(r.하원띠 > 0, (tag + '「하원」 띠').padEnd(36) + r.하원띠 + '곳');
    say(r.등원1호차, (tag + '「등원 1호차」 안내').padEnd(36) + r.등원1호차);
    say(r.하원해제, (tag + '「하원 해제」 단추').padEnd(36) + r.하원해제);
    say(r.넣을때 && r.둘다 && r.등원만 && r.하원만,
      (tag + '넣을 때 셋 고르기').padEnd(36) + [r.둘다, r.등원만, r.하원만].join('/'));
    say(r.scrollW <= r.vw, (tag + '가로 넘침 0').padEnd(36) + r.scrollW + ' <= ' + r.vw);
    say(p.__errs.length === 0, (tag + '오류 0').padEnd(36) + (p.__errs[0] || 'OK'));
    await p.close();
  }
  console.log('   ── 물류는 그 선택이 안 뜬다');
  {
    const p = await open(b, 390, 844, APP, 'logistics');
    const r = await p.evaluate(() => {
      currentMode = 'admin'; currentCarTab = 0; renderAdminTab('cars');
      const t = document.getElementById('admin-content').textContent || '';
      return { 넣을때: t.indexOf('넣을 때') >= 0, 하원: t.indexOf('하원') >= 0 };
    });
    say(!r.넣을때, '   물류: 「넣을 때」 없음'.padEnd(38) + r.넣을때);
    say(!r.하원, '   물류: 「하원」 글자 0'.padEnd(38) + r.하원);
    await p.close();
  }

  console.log('\n⑤ 옛 자료(칸 없음) — 관리자 숫자가 v272 와 같다');
  for (const biz of ['academy', 'public', 'logistics', 'delivery']) {
    const nums = async (file) => {
      const p = await open(b, 1366, 768, file, biz);
      const r = await p.evaluate(() => {
        /* carIdDrop 을 지운 옛 자료로 바꾼다 */
        members = members.map((m) => { const c = Object.assign({}, m); delete c.carIdDrop; return c; });
        localStorage.setItem('tkd_members__cosroad_default', JSON.stringify(members));
        currentMode = 'admin';
        const el = document.getElementById('admin-content');
        const out = {};
        ['dashboard', 'members', 'payment'].forEach((tab) => {
          try { renderAdminTab(tab); out[tab] = (el.textContent || '').replace(/\s+/g, ' ').trim().length; }
          catch (e) { out[tab] = 'X'; }
        });
        return out;
      });
      await p.close();
      return r;
    };
    const a = await nums(APP), o = await nums(OLD);
    say(JSON.stringify(a) === JSON.stringify(o),
      ('[' + biz + '] 대시보드·회원·수납 글자 수').padEnd(34)
      + JSON.stringify(a) + (JSON.stringify(a) === JSON.stringify(o) ? ' = v272' : ' ≠ ' + JSON.stringify(o)));
  }

  console.log('\n⑥ 범위·버전');
  {
    /* ★ v274: 범위는 **v272→v273 두 커밋 사이**다(일하는 폴더까지 재면 뒤 회차가 섞인다) */
    const names = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' ' + PIN_REF)
      .toString().trim().split('\n').filter(Boolean).sort();
    say(names.join(',') === 'CLAUDE.md,index.html,lib/send-guard.js,version.json',
      '바뀐 파일            ' + names.join(','));
    const keep = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + OLD_REF + ' ' + PIN_REF
      + ' -- firestore.rules api s.html home.html terms.html privacy.html').toString().trim();
    say(keep === '', '규칙·api·s·home·terms·privacy diff 0   ' + (keep || '(변경 없음)'));
    const vj = JSON.parse(cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN_REF + ':version.json').toString());
    const av = /const APP_VERSION = (\d+);/.exec(fs.readFileSync(APP, 'utf8'))[1];
    say(vj.version === 273 && av === '273', '버전 273            version.json ' + vj.version + ' · APP_VERSION ' + av);
  }

  await b.close();
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
