/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v278(코스로드47 ②) 실제 크롬 — 읽기 전용(기간 끝남)일 때 PIN 패드가
   **기록하지 않고 안내**하나. 네 크기에서 안내가 보이고 안 잘리나.
   ★ 대조 먼저: 고치기 전(65845ce)에서는 **「✅ 출근」이 뜨고 폰에 기록까지 남는다**.
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');
/* ★ v279: 이 묶음은 **v278 회차 기록**이다 — 앱·범위를 그 커밋(f44c98e)에 못 박는다.
   '' 를 주면 작업트리(그 회차를 손볼 때). */
const PIN278 = ('COS_SRC_NEW_REF' in process.env) ? process.env.COS_SRC_NEW_REF : 'f44c98e';
const APP = PIN278 ? require('path').join(__dirname, 'pin_run278.html') : '' + COS_ROOT + '/index.html';
const OLD_REF = process.env.COS_SRC_OLD_REF || '65845ce';   /* 46까지 */
const OLD = path.join(__dirname, 'old_index278.html');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
  location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1', pin: '1001' }];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-9-1' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const STAFF = [{ id: 'st1', name: '최직원', phone: '010-7', pin: '7777',
                 hourlyWage: 12000, mealAllow: 0, taxMode: 'free33', breakAuto: true }];

function seed() {
  return `(function(){
    var ORG = { name:'가온', icon:'🚐', bizType:'academy', destName:'학원',
                destLat:37.4467, destLon:126.6516, tel:'032-111-2222' };
    var SERVER = { members: ${JSON.stringify(MEMBERS)}, cars: ${JSON.stringify(CARS)},
                   courses: ${JSON.stringify(COURSES)}, org: ORG, orgDriver: ORG,
                   staff: ${JSON.stringify(STAFF)}, migration: { carState:true, at:1 }, staffAtt: {} };
    window.__srv = { car1: { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},
                             delivDone:{}, dropDone:{}, att:{} } };
    window.__writes = [];
    window._db={}; window._fbReady=true;
    window._firestore={
      doc:function(db,c1,o,c2,k){ return {col:c2,key:k}; },
      collection:function(db,c1,o,c2){ return {col:c2}; },
      getDoc:async function(ref){
        var src = ref.col==='carState' ? window.__srv
                : ref.col==='carData' ? { car1:{ members:SERVER.members, car:SERVER.cars[0], courses:SERVER.courses } }
                : SERVER;
        var has = Object.prototype.hasOwnProperty.call(src, ref.key);
        return { exists:function(){return has;}, data:function(){return {value:JSON.stringify(src[ref.key])};} };
      },
      getDocs:async function(ref){
        var src = ref.col==='carState' ? window.__srv : {};
        var ks=Object.keys(src);
        return { forEach:function(cb){ ks.forEach(function(k){
          cb({ id:k, data:function(){ return {value:JSON.stringify(src[k])}; } }); }); } };
      },
      setDoc:async function(ref,d){ window.__writes.push('set '+ref.col+'/'+ref.key); },
      deleteDoc:async function(){},
      runTransaction:async function(db, fn){
        return await fn({ get:async function(ref){
            var v=window.__srv[ref.key];
            return { exists:function(){return v!==undefined;},
                     data:function(){return {value:JSON.stringify(v)};} };
          }, set:function(ref,d){ window.__writes.push('tx '+ref.col+'/'+ref.key); } });
      },
      onSnapshot:function(){ return function(){}; }
    };
    window.__alerts=[];
    window.alert=function(m){ window.__alerts.push(String(m)); };
    window.confirm=function(){return true;}; window.open=function(){return null;};
  })();`;
}

async function adminPage(b, w, h, file) {
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
  const js = seed();
  if (js.indexOf('(function(){') !== 0) throw new Error('seed 틀이 끊겼다');
  await p.evaluate(js);
  if (!(await p.evaluate(() => !!(window._db && window.__srv)))) throw new Error('가짜 Firestore 안 깔림');
  await p.evaluate(async () => {
    ['tkd_members__cosroad_default','tkd_cars__cosroad_default','tkd_courses__cosroad_default',
     'tkd_staff__cosroad_default','tkd_driver_att__cosroad_default','tkd_attendance__cosroad_default']
      .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
    currentMode = 'admin';
    window._userOrgId = 'cosroad_default'; window._userUid = 'u1';
    window._userBizType = 'academy';
    window._userPaidUntil = Date.now() - 86400000;      /* 기간이 끝난 업체 */
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    await syncFromFirebase();
    await new Promise((r) => setTimeout(r, 300));
    _readOnlyMode = true;                                /* enterReadOnly() 가 하는 그 일 */
    /* ★ 서버 `pinCheckin` 은 **기사 PIN 이 아니면 404 `notdriver`** 를 준다 —
       그래야 앱이 직원·회원 PIN 으로 이어 본다. 여기서는 바깥 통신을 막아 두었으므로
       그 답을 그대로 흉내 낸다. 안 하면 「계정으로 로그인한 뒤에…」에서 멈춰
       **직원 분기까지 가지도 못한다**(처음에 그래서 대조가 헛돌았다). */
    window.padDriverPinApi = async function(){
      return { ok:false, why:'notdriver', message:'기사 PIN 이 아니에요.' };
    };
  });
  p.__errs = errs;
  return p;
}

/* 패드를 열고 PIN 을 눌러 본다 */
const press = (p, pin) => p.evaluate(async (pin) => {
  switchTab('admin'); currentAdminTab = 'attendance'; renderAdminTab('attendance');
  openPinCheckin();
  await new Promise((r) => setTimeout(r, 150));
  const attBefore = localStorage.getItem('tkd_driver_att') || '{}';
  window.__writes = []; window.__alerts = [];
  pinInput = pin;
  await checkPin();
  await new Promise((r) => setTimeout(r, 400));
  const el = document.getElementById('pin-result');
  const box = el ? el.getBoundingClientRect() : null;
  return {
    결과: el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '(패드 없음)',
    넘침: el ? (el.scrollWidth > el.clientWidth + 1) : false,
    폭: el ? Math.round(box.width) : 0,
    att전: attBefore,
    att후: localStorage.getItem('tkd_driver_att') || '{}',
    쓴것: (window.__writes || []).slice(),
    안내: (window.__alerts || []).slice()
  };
}, pin);

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  if (PIN278) cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN278 + ':index.html > "' + APP + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('① ★ 대조 — 고치기 전(' + OLD_REF + ')은 **「✅ 출근」이 뜨고 폰에 기록까지 남는다**');
  {
    const p = await adminPage(b, 390, 844, OLD);
    const r = await press(p, '7777');                    /* 직원 PIN */
    say(/출근/.test(r.결과), '[옛] 「출근」이 떴다'.padEnd(40) + r.결과.slice(0, 34));
    say(r.att후 !== r.att전, '[옛] 폰에 기록이 남았다'.padEnd(40) + (r.att후 !== r.att전));
    say(r.안내.length === 0, '[옛] 읽기 전용 안내는 **없었다**'.padEnd(40) + JSON.stringify(r.안내).slice(0, 30));
    await p.close();
  }

  console.log('\n② v278 — 기록하지 않고 **안내**한다 (네 크기)');
  for (const [w, h] of SIZES) {
    const p = await adminPage(b, w, h, APP);
    const r = await press(p, '7777');
    const tag = '[' + w + 'x' + h + '] ';
    say(/읽기 전용/.test(r.결과), (tag + '패드에 「읽기 전용」 안내 ★').padEnd(40) + r.결과.slice(0, 30));
    /* ★ 「출근」이라는 두 글자로 찾으면 **내 안내 글의 「출퇴근」**에 걸린다(처음에 그랬다).
       성공 표시(✅)와 「님 출근」으로 본다. */
    say(!/✅/.test(r.결과) && !/님 출근|님 퇴근/.test(r.결과),
      (tag + '「✅ ○○님 출근」이 안 뜬다 ★').padEnd(40) + (/✅/.test(r.결과) ? '떴다' : 'OK'));
    say(r.att후 === r.att전, (tag + '폰에 기록 0 ★').padEnd(40) + (r.att후 === r.att전));
    say(r.쓴것.length === 0, (tag + '서버 쓰기 0').padEnd(40) + JSON.stringify(r.쓴것));
    say(r.안내.some((x) => /읽기 전용/.test(x)), (tag + '기존 읽기 전용 안내(alert)').padEnd(40)
      + (r.안내[0] || '없음').slice(0, 22));
    say(!r.넘침, (tag + '안내가 안 잘린다').padEnd(40) + '폭 ' + r.폭 + 'px');
    say(p.__errs.length === 0, (tag + '오류 0').padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\n③ «회원» 출석 PIN 도 같다 (같은 입구)');
  {
    const p = await adminPage(b, 390, 844, APP);
    const r = await press(p, '1001');
    say(/읽기 전용/.test(r.결과), '회원 PIN → 읽기 전용 안내'.padEnd(40) + r.결과.slice(0, 26));
    const att = await p.evaluate(() => localStorage.getItem('tkd_attendance') || '{}');
    say(att === '{}' || att === 'null', '출결도 기록 0'.padEnd(40) + att.slice(0, 20));
    await p.close();
  }

  console.log('\n④ 범위·버전');
  {
    /* ★ v279: 범위의 끝쪽도 못 박은 커밋으로 (위 PIN278 쪽지) */
    const names = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' ' + (PIN278 || ''))
      .toString().trim().split('\n').filter(Boolean).sort();
    say(names.join(',') === 'CLAUDE.md,api/admin-account.js,index.html,version.json',
      '바뀐 파일   ' + names.join(','));
    const vj = JSON.parse(PIN278
      ? cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN278 + ':version.json').toString()
      : fs.readFileSync('' + COS_ROOT + '/version.json', 'utf8'));
    const av = /const APP_VERSION = (\d+);/.exec(fs.readFileSync(APP, 'utf8'))[1];
    say(vj.version === 278 && av === '278', '버전 278   ' + vj.version + ' · ' + av);
    const rl = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + OLD_REF + ' ' + (PIN278 || '')
      + ' -- firestore.rules lib api/driver-auth.js').toString().trim();
    say(rl === '', '규칙·lib·driver-auth diff 0   ' + (rl || '(변경 없음)'));
  }

  await b.close();
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
