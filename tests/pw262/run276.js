/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v276(코스로드42 긴급) 실제 크롬 — **기사 로그인 → 첫 화면**까지 끝까지.
   ★ 가짜 Firestore 가 **실제 규칙(632)에서 잰 허용/거부 표**를 그대로 따른다
     (rulestest/t276_table.json — 에뮬레이터가 만든 파일). 그래서 「규칙에서 거부되는 읽기」가
     앱에서 어떻게 보이는지를 **실제와 같은 조건**으로 본다.
   ★ 대조 먼저: v275(c1c7b47)로 돌리면 **막힘 화면이 뜬다**.
   바깥 요청 전부 차단 · 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');
/* ★ v277: 이 묶음은 **v276 회차 기록**이다 — 앱을 그 커밋(b0f695a)에 못 박는다.
   '' 를 주면 작업트리(그 회차를 손볼 때). */
const PIN276 = ('COS_SRC_NEW_REF' in process.env) ? process.env.COS_SRC_NEW_REF : 'b0f695a';
const APP = PIN276 ? path.join(__dirname, 'pin_run276.html') : '' + COS_ROOT + '/index.html';
const OLD_REF = process.env.COS_SRC_OLD_REF || 'c1c7b47';   /* v275 — 막히던 판 */
const OLD = path.join(__dirname, 'old_index276.html');
const SIZES = [[390, 844], [360, 640]];
const BIZ = ['academy', 'public', 'logistics', 'delivery'];

/* 에뮬레이터가 잰 표 — 없으면 멈춘다(짐작으로 돌리지 않는다) */
const TBL = path.join(__dirname, '..', 'rulestest', 't276_table.json');
if (!fs.existsSync(TBL)) {
  console.log('ERR 규칙 표(t276_table.json)가 없다 — rulestest/t276.mjs 를 먼저 돌려라');
  process.exit(1);
}
const TABLE = JSON.parse(fs.readFileSync(TBL, 'utf8'));
const tbl = (frag) => {
  const k = Object.keys(TABLE).find((x) => x.indexOf(frag) >= 0);
  return k ? TABLE[k] : null;
};

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [
  { id: 1, name: '가하은', carId: 'car1', carIdDrop: 'car2', courseId: 'c1', days: D7,
    location: '인천 1', lat: 37.41, lon: 126.68, dropLocation: '하차 1', dropLat: 37.42, dropLon: 126.69,
    phone: '010-1111-1111', invoice: 'INV1', courier: '04' },
  { id: 2, name: '나여름', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2',
    lat: 37.43, lon: 126.70, phone: '010-2222-2222' }
];
const CAR = { id: 'car1', name: '1호차', driver: '박기사', plate: '12가3456', phone: '010-9-1' };
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00', arrive: '14:50' }];

/* state: 'ok' | 'expired' | 'nopin' — 뒤 둘은 규칙이 **전부 거부**한다(t276 ③에서 잰 대로) */
function seed(biz, state) {
  return `(function(){
    var ORGDRIVER = ${JSON.stringify({ name: '가온', icon: '🚐', bizType: '__BIZ__',
      destName: '학원', destLat: 37.4467, destLon: 126.6516, tel: '032-111-2222' }).replace('__BIZ__', biz)};
    var CARDATA = ${JSON.stringify({ members: MEMBERS, car: CAR, courses: COURSES })};
    var CARSTATE = { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},
                     delivDone:{}, dropDone:{}, att:{} };
    var STATE = ${JSON.stringify(state)};
    window.__denied = []; window.__wrote = [];
    /* 규칙이 거부하는 자리 — 실제 SDK 와 **같은 꼴**의 오류를 던진다 */
    function denied(p){
      window.__denied.push(p);
      var e = new Error('Missing or insufficient permissions.');
      e.code = 'permission-denied';
      throw e;
    }
    window._db={}; window._fbReady=true;
    window._firestore={
      doc:function(db,c1,o,c2,k){ return {col:c2,key:k,org:o}; },
      collection:function(db,c1,o,c2){ return {col:c2,org:o}; },
      getDoc:async function(ref){
        var p=(ref.col||'')+'/'+(ref.key||'');
        if(STATE!=='ok') denied(p);                 /* 만료·PIN 지움 → 전부 거부 */
        if(ref.col==='data'){
          if(ref.key!=='orgDriver') denied(p);      /* driverReadableKey = ['orgDriver'] */
          return { exists:function(){return true;}, data:function(){return {value:JSON.stringify(ORGDRIVER)};} };
        }
        if(ref.col==='carData'){
          if(String(ref.key)!=='car1') denied(p);
          return { exists:function(){return true;}, data:function(){return {value:JSON.stringify(CARDATA)};} };
        }
        if(ref.col==='carState'){
          if(String(ref.key)!=='car1') denied(p);
          return { exists:function(){return true;}, data:function(){return {value:JSON.stringify(CARSTATE)};} };
        }
        if(ref.col==='users') return { exists:function(){return false;}, data:function(){return {};} };
        denied(p);
      },
      getDocs:async function(ref){
        if(ref.col==='backups') denied('list backups');   /* 규칙: 기사 list 거부 */
        denied('list '+(ref.col||''));
      },
      setDoc:async function(ref,d){
        var p=(ref.col||'')+'/'+(ref.key||'');
        if(STATE!=='ok') denied(p);
        if(ref.col==='carState'){ if(String(ref.key)!=='car1') denied(p);
          window.__wrote.push(p); CARSTATE=JSON.parse(d.value); return; }
        if(ref.col==='backups'){
          if(!d || d.key!=='carState/car1') denied(p);
          window.__wrote.push('backups/'+ref.key); return;
        }
        denied(p);
      },
      deleteDoc:async function(ref){ denied('del '+(ref.col||'')); },
      onSnapshot:function(ref,cb,err){
        var p=(ref.col||'')+'/'+(ref.key||'');
        if(STATE!=='ok' || (ref.col==='data' && ref.key!=='orgDriver')
           || ((ref.col==='carData'||ref.col==='carState') && String(ref.key)!=='car1')){
          window.__denied.push('listen '+p);
          if(err) err({ code:'permission-denied' });
          return function(){};
        }
        return function(){};
      }
    };
    window.alert=function(m){ (window.__a=window.__a||[]).push(String(m)); };
    window.confirm=function(){return true;}; window.open=function(){return null;};
  })();`;
}

async function driverPage(b, w, h, file, biz, state) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errs = [], denied = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    const t = m.text();
    if (/permission-denied|insufficient permissions/.test(t)) denied.push(t.slice(0, 120));
    if (m.type() !== 'error') return;
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    errs.push(t.slice(0, 130));
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  const js = seed(biz, state);
  if (js.indexOf('(function(){') !== 0) throw new Error('seed 틀이 끊겼다');
  await p.evaluate(js);
  const ok = await p.evaluate(() => !!(window._db && window._firestore && window.__denied));
  if (!ok) throw new Error('가짜 Firestore 가 안 깔렸다 — 대조가 헛돈다');
  /* 기사 로그인 뒤와 **같은 상태**로 만든 다음 initApp 을 그대로 부른다 */
  await p.evaluate(async ({ biz }) => {
    ['tkd_members__cosroad_default', 'tkd_cars__cosroad_default', 'tkd_courses__cosroad_default',
     'tkd_ridestate__cosroad_default', 'tkd_carlog__cosroad_default', 'tkd_driver_att__cosroad_default']
      .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
    window._userOrgId = 'cosroad_default';
    window._isDriverAcct = true; window._driverCarId = 'car1'; window._driverOrg = 'cosroad_default';
    window._userUid = 'drv_cosroad_default_car1'; window._userBizType = null;
    onDriverLoggedIn();                 /* ← 실제 로그인 직후에 도는 그 길 (initApp 포함) */
    /* ★ initApp 은 syncFromFirebase 를 **1초 뒤에** 부른다(setTimeout 1000).
       그보다 일찍 보면 명단이 비어 있다 — 처음에 400ms 만 기다렸다가 「빈 목록」으로 헛돌았다. */
    await new Promise((r) => setTimeout(r, 2200));
  }, { biz });
  p.__errs = errs; p.__denied = denied;
  return p;
}

const look = (p) => p.evaluate(() => {
  const blocked = !!document.getElementById('driver-blocked');
  const blockTxt = blocked ? (document.getElementById('driver-blocked').textContent || '').replace(/\s+/g, ' ').trim() : '';
  driveLeg = 'pickup'; try { switchTab('drive'); renderDrive(); } catch (e) {}
  const el = document.getElementById('app-content');
  return {
    막힘: blocked, 막힘글: blockTxt.slice(0, 60),
    화면: (el ? el.textContent || '' : '').replace(/\s+/g, ' ').trim(),
    목록: (typeof getActiveStudents === 'function' ? getActiveStudents().map((x) => x.name).join(',') : ''),
    거부: (window.__denied || []).slice(),
    쓴것: (window.__wrote || []).slice()
  };
});

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  if (PIN276) cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN276 + ':index.html > "' + APP + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('0. 규칙 표(에뮬레이터 실측)를 그대로 쓰는가');
  say(tbl('data/members') === 'deny', '규칙: data/members 는 기사에게 거부   ' + tbl('data/members'));
  say(tbl('data/orgDriver (v276') === 'allow', '규칙: data/orgDriver 는 허용      ' + tbl('data/orgDriver (v276'));
  say(tbl('문서가 없는 업체') === 'allow', '규칙: 문서가 없어도 오류 아님      ' + tbl('문서가 없는 업체'));

  console.log('\n① ★ 대조 — v275(c1c7b47)에서는 **막힘 화면이 뜬다**');
  for (const [w, h] of SIZES) {
    const p = await driverPage(b, w, h, OLD, 'academy', 'ok');
    const r = await look(p);
    say(r.막힘 === true, ('[v275 ' + w + 'x' + h + '] 막힘 화면이 뜬다').padEnd(40) + (r.막힘글 || '(안 뜸)'));
    say(r.거부.some((x) => /data\/members/.test(x)),
      ('[v275 ' + w + 'x' + h + '] 거부된 자리 = data/members').padEnd(40) + JSON.stringify(r.거부));
    await p.close();
  }

  console.log('\n② v276 — 막힘 화면이 **안 뜨고** 운행 화면이 그려진다 (네 업종 × 두 크기)');
  for (const biz of BIZ) {
    for (const [w, h] of SIZES) {
      const p = await driverPage(b, w, h, APP, biz, 'ok');
      const r = await look(p);
      const tag = '[' + biz + ' ' + w + 'x' + h + '] ';
      say(r.막힘 === false, (tag + '막힘 화면 0 ★').padEnd(40) + (r.막힘글 || 'OK'));
      say(r.거부.length === 0, (tag + 'permission-denied 0 ★').padEnd(40) + JSON.stringify(r.거부));
      say(p.__denied.length === 0, (tag + '콘솔 permission-denied 0').padEnd(40) + (p.__denied[0] || 'OK'));
      say(r.목록.length > 0, (tag + '운행 목록이 그려진다').padEnd(40) + (r.목록 || '(빈 목록)'));
      say(/출근|퇴근/.test(r.화면), (tag + '출근·퇴근 단추').padEnd(40) + (/출근/.test(r.화면) ? 'OK' : '없음'));
      say(/차계부/.test(r.화면), (tag + '차계부 단추').padEnd(40) + (/차계부/.test(r.화면) ? 'OK' : '없음'));
      say(p.__errs.length === 0, (tag + '오류 0').padEnd(40) + (p.__errs[0] || 'OK'));
      await p.close();
    }
  }

  console.log('\n③ v276 — 탑승 토글을 저장하면 **내 차량 문서에만** 쓰인다');
  {
    const p = await driverPage(b, 390, 844, APP, 'academy', 'ok');
    const r0 = await look(p);
    const r = await p.evaluate(async () => {
      window.__wrote = []; window.__denied = [];
      var st = loadRideState(); st['1'] = { on: false }; saveRideState(st);
      await new Promise((x) => setTimeout(x, 400));
      return { 쓴것: window.__wrote.slice(), 거부: window.__denied.slice() };
    });
    say(r.쓴것.indexOf('carState/car1') >= 0, '내 차량 문서에 썼다'.padEnd(40) + JSON.stringify(r.쓴것));
    say(!r.쓴것.some((x) => /^data\//.test(x)), '`data/*` 에는 안 썼다'.padEnd(40) + 'OK');
    const onlyBackupList = r.거부.every((x) => /list backups/.test(x));
    say(onlyBackupList, '거부는 「백업 목록 읽기」뿐(설계대로)'.padEnd(40) + JSON.stringify(r.거부));
    say(r0.목록.length > 0, '(헛돌지 않게) 목록이 있었다'.padEnd(40) + r0.목록);
    await p.close();
  }

  console.log('\n④ ★ 막아야 할 때는 **그대로 막힌다** (구멍 안 냈나)');
  for (const state of ['expired', 'nopin']) {
    const p = await driverPage(b, 390, 844, APP, 'academy', state);
    const r = await look(p);
    say(r.막힘 === true, ('[' + state + '] 막힘 화면이 뜬다 ★').padEnd(40) + (r.막힘글 || '(안 뜸)'));
    await p.close();
  }

  console.log('\n⑤ 범위·버전');
  {
    const names = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' ' + (PIN276 || ''))
      .toString().trim().split('\n').filter(Boolean).sort();
    say(names.every((n) => ['CLAUDE.md', 'index.html', 'version.json'].indexOf(n) >= 0),
      '바뀐 파일은 화면·버전·문서뿐   ' + names.join(','));
    const keep = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + OLD_REF + ' ' + (PIN276 || '')
      + ' -- api lib firestore.rules s.html home.html terms.html privacy.html').toString().trim();
    say(keep === '', 'api·lib·규칙·정적 diff 0   ' + (keep || '(변경 없음)'));
    const vj = JSON.parse(PIN276
      ? cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN276 + ':version.json').toString()
      : fs.readFileSync('' + COS_ROOT + '/version.json', 'utf8'));
    const av = /const APP_VERSION = (\d+);/.exec(fs.readFileSync(APP, 'utf8'))[1];
    say(vj.version === 276 && av === '276', '버전 276            ' + vj.version + ' · ' + av);
  }

  await b.close();
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 · Firestore 가짜(규칙 표는 에뮬레이터 실측) — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
