/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v274(40-B) 실제 크롬 — 기사 화면이 v273 과 **같은지** · 폰에 다른 차량 자료 0건.
   ★ 가짜 Firestore: 기사는 **사본만** 받고, 옛 판은 **전체 명단**을 받는다(그 판의 실제 동작).
     그래야 「화면은 같은데 받는 자료는 줄었다」를 보일 수 있다. */
const { chromium } = require('playwright');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');
/* ★ v275: 이 묶음은 **v274 회차 기록**이다 — 새 쪽도 그 커밋(889fbec)에 못 박는다.
   작업트리를 보면 뒤 회차(v275)의 버전·규칙 줄수·바뀐 파일이 거짓 실패로 들어온다.
   COS_SRC_NEW_REF='' 를 주면 작업트리를 본다(그 회차를 손볼 때). */
const PIN = ('COS_SRC_NEW_REF' in process.env) ? process.env.COS_SRC_NEW_REF : '889fbec';
const APP = PIN ? path.join(__dirname, 'pin_run274.html') : '' + COS_ROOT + '/index.html';
if (PIN) {
  fs.writeFileSync(APP, cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN + ':index.html',
    { maxBuffer: 1 << 28 }));
}
const OLD_REF = process.env.COS_SRC_OLD_REF || '06e30f3';   /* v273 */
const OLD = path.join(__dirname, 'old_index274.html');
const SIZES = [[390, 844], [360, 640], [768, 1024], [1366, 768]];
const BIZ = ['academy', 'public', 'logistics', 'delivery'];

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const ALL = [
  { id: 1, name: '가하은', carId: 'car1', carIdDrop: 'car2', courseId: 'c1', days: D7,
    location: '인천 연수구 1', addrDetail: '101호', lat: 37.41, lon: 126.68,
    dropLocation: '하차 1', dropLat: 37.42, dropLon: 126.69,
    phone: '010-1111-1111', phone2: '010-1111-2222', note: '정문', invoice: 'INV1', courier: '04',
    pin: '1001', monthly: 130000, regfee: 150000, bizNo: '635-88-02710', ceo: '문준식',
    on: true, offOn: true },
  { id: 2, name: '나여름', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2',
    lat: 37.43, lon: 126.70, phone: '010-2222-2222', pin: '1002', monthly: 120000, on: true, offOn: true },
  { id: 3, name: '다가을', carId: 'car3', courseId: 'c1', days: D7, location: '인천 3',
    lat: 37.45, lon: 126.73, phone: '010-3333-3333', pin: '1003', monthly: 110000, on: true, offOn: true }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-9999-1', plate: '12가3456' },
              { id: 'car2', name: '2호차', driver: '김기사', phone: '010-9999-2', plate: '34나5678' },
              { id: 'car3', name: '3호차', driver: '이기사', phone: '010-9999-3', plate: '56다7890' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00', arrive: '14:50' }];
const CAR_KEYS = ['id','name','carId','carIdDrop','courseId','days','phone','phone2','location',
                  'addrDetail','lat','lon','dropLocation','dropLat','dropLon','note','photo',
                  'invoice','courier'];
const carDataFor = (cid) => ({
  members: ALL.filter((m) => m.carId === cid || (m.carIdDrop || m.carId) === cid)
    .map((m) => { const o = {}; CAR_KEYS.forEach((k) => { if (m[k] !== undefined) o[k] = m[k]; }); return o; }),
  car: (() => { const c = CARS.find((x) => x.id === cid); return c ? { id: c.id, name: c.name, plate: c.plate, driver: c.driver, phone: c.phone } : null; })(),
  courses: COURSES
});

/* isNew=true → 기사는 carData 만 받는다 (v274) · false → data/members 전체 (v273) */
function seed(biz, carId, isNew) {
  return `(function(){
    var SUF='__cosroad_default';
    localStorage.setItem('tkd_org'+SUF, JSON.stringify({name:'가온',icon:'🚐',bizType:'${biz}',
      destName:'학원',destLat:37.4467,destLon:126.6516}));
    localStorage.setItem('tkd_ridestate'+SUF,'{}');
    var SERVER = ${JSON.stringify({ members: ALL, cars: CARS, courses: COURSES, orgDriver: {}, rideState: {} })};
    var CARDOCS = ${JSON.stringify({ car1: carDataFor('car1'), car2: carDataFor('car2'), car3: carDataFor('car3') })};
    var IS_NEW = ${isNew ? 'true' : 'false'};
    window.__asked = [];
    window._db={}; window._fbReady=true;
    window._firestore={
      doc:function(db,c1,o,c2,k){ return {col:c2,key:k}; },
      collection:function(db,c1,o,c2){ return {col:c2}; },
      getDoc:async function(ref){
        window.__asked.push((ref.col||'')+'/'+(ref.key||''));
        var src = (ref.col==='carData') ? CARDOCS : SERVER;
        var has = Object.prototype.hasOwnProperty.call(src, ref.key);
        return { exists:function(){return has;}, data:function(){return {value:JSON.stringify(src[ref.key])};} };
      },
      setDoc:async function(){}, deleteDoc:async function(){},
      getDocs:async function(){ return {forEach:function(){}}; },
      onSnapshot:function(ref,cb){ window.__asked.push('listen:'+(ref.col||'')+'/'+(ref.key||'')); return function(){}; }
    };
    window.alert=function(m){ (window.__a=window.__a||[]).push(String(m)); };
    window.confirm=function(){return true;}; window.open=function(){return null;};
  })();`;
}

async function driverPage(b, w, h, file, biz, carId, isNew) {
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
  await p.evaluate(seed(biz, carId, isNew));
  await p.evaluate(async ({ biz, carId }) => {
    currentMode = 'driver';
    window._isDriverAcct = true; window._driverCarId = carId;
    window._userOrgId = 'cosroad_default'; window._userBizType = null;
    ['tkd_members__cosroad_default', 'tkd_cars__cosroad_default', 'tkd_courses__cosroad_default']
      .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
    await syncFromFirebase();
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    currentCourseId = 'c1';
    currentDay = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
    currentCarId = carId;
  }, { biz, carId });
  p.__errs = errs;
  return p;
}
const shot = (p, leg) => p.evaluate((leg) => {
  driveLeg = leg; switchTab('drive'); renderDrive();
  const el = document.getElementById('app-content');
  let dump = '';
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i); dump += k + '=' + (localStorage.getItem(k) || '') + '\n';
  }
  return { 화면: (el.textContent || '').replace(/\s+/g, ' ').trim(),
           목록: getActiveStudents().map((x) => x.name).join(','),
           폰: dump, asked: (window.__asked || []).slice() };
}, leg);

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('① 기사 화면이 v273 과 같은가 — 네 업종 × 네 크기 × 등원/하원');
  for (const biz of BIZ) {
    for (const [w, h] of SIZES) {
      for (const leg of ['pickup', 'dropoff']) {
        const pn = await driverPage(b, w, h, APP, biz, 'car1', true);
        const rn = await shot(pn, leg);
        const po = await driverPage(b, w, h, OLD, biz, 'car1', false);
        const ro = await shot(po, leg);
        const tag = '[' + biz + ' ' + w + 'x' + h + ' ' + (leg === 'pickup' ? '등원' : '하원') + '] ';
        say(rn.화면 === ro.화면 && rn.화면.length > 20,
          (tag + '화면 글자 같음').padEnd(40) + '새 ' + rn.화면.length + '자 / 옛 ' + ro.화면.length + '자'
          + (rn.화면 === ro.화면 ? '' : '  ★다름'));
        say(rn.목록 === ro.목록, (tag + '목록 같음').padEnd(40) + (rn.목록 || '없음'));
        say(pn.__errs.length === 0, (tag + '오류 0').padEnd(40) + (pn.__errs[0] || 'OK'));
        await pn.close(); await po.close();
      }
    }
  }

  console.log('\n② 기사 폰에 **다른 차량 자료가 0건** 인가 (옛 판과 대조)');
  for (const biz of BIZ) {
    const pn = await driverPage(b, 390, 844, APP, biz, 'car1', true);
    const rn = await shot(pn, 'pickup');
    const po = await driverPage(b, 390, 844, OLD, biz, 'car1', false);
    const ro = await shot(po, 'pickup');
    const tag = '[' + biz + '] ';
    say(/다가을/.test(ro.폰), (tag + '(대조) 옛 판에는 3호차 «회원» 이 있었다').padEnd(44) + /다가을/.test(ro.폰));
    say(!/다가을/.test(rn.폰), (tag + '새 판: 3호차 «회원» 0건 ★').padEnd(44) + !/다가을/.test(rn.폰));
    say(!/130000|120000|110000/.test(rn.폰), (tag + '새 판: 수강료 0건').padEnd(44) + !/130000|120000/.test(rn.폰));
    say(!/1001|1002|1003/.test(rn.폰), (tag + '새 판: 출석 PIN 0건').padEnd(44) + !/1001|1002/.test(rn.폰));
    say(!/635-88-02710/.test(rn.폰), (tag + '새 판: 사업자번호 0건').padEnd(44) + !/635-88/.test(rn.폰));
    say(!/김기사|이기사|34나5678|56다7890/.test(rn.폰),
      (tag + '새 판: 다른 차량 기사·번호판 0건').padEnd(44) + !/김기사|이기사/.test(rn.폰));
    say(!rn.asked.some((k) => /^data\/(members|cars|courses)$/.test(k)),
      (tag + 'members·cars·courses 를 안 달라고 함').padEnd(44)
      + JSON.stringify(rn.asked.filter((k) => /members|cars|courses|carData/.test(k))));
    say(rn.asked.some((k) => k === 'carData/car1'), (tag + '자기 carData 만 달라고 함').padEnd(44) + 'true');
    await pn.close(); await po.close();
  }

  console.log('\n③ 하원만 2호차인 «회원» 이 2호차 기사에게 보이나 (사본 기준)');
  {
    for (const [carId, leg, want] of [['car2', 'pickup', ''], ['car2', 'dropoff', '가하은'],
                                      ['car1', 'pickup', '가하은,나여름'], ['car1', 'dropoff', '나여름']]) {
      const p = await driverPage(b, 390, 844, APP, 'academy', carId, true);
      const r = await shot(p, leg);
      say(r.목록.split(',').filter(Boolean).sort().join(',') === want.split(',').filter(Boolean).sort().join(','),
        ('[' + carId + ' ' + (leg === 'pickup' ? '등원' : '하원') + ']').padEnd(20)
        + (r.목록 || '없음') + '   (기대 ' + (want || '없음') + ')');
      await p.close();
    }
  }

  console.log('\n④ 범위·버전');
  {
    /* ★ v275: 범위의 **끝쪽도** 못 박은 커밋으로 (위 PIN 쪽지 참고) */
    const names = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' ' + (PIN || ''))
      .toString().trim().split('\n').filter(Boolean).sort();
    say(names.join(',') === 'CLAUDE.md,firestore.rules,index.html,version.json',
      '바뀐 파일            ' + names.join(','));
    const keep = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + OLD_REF + ' ' + (PIN || '')
      + ' -- api lib s.html home.html terms.html privacy.html').toString().trim();
    say(keep === '', 'api·lib·s·home·terms·privacy diff 0   ' + (keep || '(변경 없음)'));
    const vj = JSON.parse(PIN
      ? cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN + ':version.json').toString()
      : fs.readFileSync('' + COS_ROOT + '/version.json', 'utf8'));
    const av = /const APP_VERSION = (\d+);/.exec(fs.readFileSync(APP, 'utf8'))[1];
    say(vj.version === 274 && av === '274', '버전 274            ' + vj.version + ' · ' + av);
    const rl = (PIN
      ? cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN + ':firestore.rules',
          { maxBuffer: 1 << 26 }).toString()
      : fs.readFileSync('' + COS_ROOT + '/firestore.rules', 'utf8'))
      .split('\r\n').join('\n')
      .split('\n').filter((x, i, a) => i < a.length - 1 || x !== '').length;
    say(rl === 608, '규칙 608줄          ' + rl);
  }

  await b.close();
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
