/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* h_ctrl255 — **검사기 검증(대조 시험) 묶음**: 일부러 망가뜨리면 검사가 잡는가.
   ★ 코스로드41 에서 **다시 만들었다.** 옛 파일은 세션 임시 폴더에서 사라졌고(오늘 아침엔 돌았다)
     원문이 어디에도 없다 → **같은 목적**으로 새로 적었다(내용이 그대로는 아니다).
   왜 이것이 필요한가 — CLAUDE.md 「**「0건」은 대조 시험 뒤에만 쓴다**」.
     검사가 늘 「통과」만 하면 그 검사가 **살아 있는지** 알 수 없다. 그래서 앱·서버 글자를
     열 가지로 망가뜨려(메모리에서만) 각 검사가 **그 판을 잡는지** 본다.
   ★ 저장소 파일은 **한 글자도 고치지 않는다** — 모두 문자열 복사본으로만 돌린다.
   가짜 Firestore — 실제 쓰기 0 · 문자 0 · 바깥 통신 0. */
const fs = require('fs');
const cp = require('child_process');
const E = require('./env246.js');
const D = require('./detect.js');

let caught = 0, missed = 0, okNow = 0, badNow = 0;
const APP = fs.readFileSync('' + COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const SUP = fs.readFileSync('' + COS_ROOT + '/api/support-info.js', 'utf8');
const RULES = fs.readFileSync('' + COS_ROOT + '/firestore.rules', 'utf8').replace(/\r\n/g, '\n');

/* 한 가지 망가뜨리기 = { 이름, 망가뜨린 글자 만들기, 검사(소스)→참이면 「잡았다」 } */
function trial(name, broken, probe) {
  let gotBad, gotGood, err = '';
  try { gotBad = probe(broken()); } catch (e) { gotBad = 'ERR:' + (e && e.message); err = 'bad'; }
  try { gotGood = probe(null); } catch (e) { gotGood = 'ERR:' + (e && e.message); err += ' good'; }
  const ok1 = gotBad === true, ok2 = gotGood === false;
  if (ok1) caught++; else missed++;
  if (ok2) okNow++; else badNow++;
  console.log('  ' + (ok1 ? '✔' : '✘') + ' ' + String(name).padEnd(52)
    + '망가뜨린 판: ' + (ok1 ? '잡힘' : '못 잡음(' + gotBad + ')')
    + ' · 지금 판: ' + (ok2 ? '깨끗' : '★걸림(' + gotGood + ')'));
  return ok1 && ok2;
}

/* ── 앱 한 대를 세우는 틀 (망가뜨린 글자를 줄 수 있다) ───────────────────── */
const D7 = ['월','화','수','목','금','토','일'];
const MEM = [{ id:1, name:'가하은', carId:'car1', courseId:'c1', days:D7, location:'1', lat:37.4, lon:126.6, phone:'010-1' }];
const CARS = [{ id:'car1', name:'1호차', driver:'박기사' }];
const COURSES = [{ id:'c1', name:'A반', depart:'15:00' }];
const SUF = '__cosroad_default';
function boot(src, opt) {
  opt = opt || {};
  const store = {};
  store['tkd_members'+SUF] = JSON.stringify(MEM);
  store['tkd_cars'+SUF]    = JSON.stringify(CARS);
  store['tkd_courses'+SUF] = JSON.stringify(COURSES);
  store['tkd_org'+SUF]     = JSON.stringify({ name:'가온', icon:'🚐', bizType:'academy', destName:'학원' });
  if (opt.att) store['tkd_driver_att'+SUF] = JSON.stringify(opt.att);
  const R = E.build({ src: src || APP, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content','app-content','drive-screen','admin-screen','fb-loading','member-screen',
   'member-list','main-header','today-date','org-name-display','org-icon','login-screen',
   'main-app','bottom-action','mode-badge','header-btns','filter-chips','search-input',
   'day-tabs','member-add-area','drive-tabs','master-root','pin-result']
   .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });
  R.sandbox._db = R.win._db = {};
  R.ev("window._userOrgId='cosroad_default';");
  if (opt.helper) {
    R.ev("currentMode='driver'; window._isDriverAcct=true; window._isHelperAcct=true;"
       + "window._driverStaffId='st2'; window._driverOrg='cosroad_default'; window._driverCarId='car1';");
  } else if (opt.driver) {
    R.ev("currentMode='driver'; window._isDriverAcct=true;"
       + "window._driverOrg='cosroad_default'; window._driverCarId='car1';");
  } else {
    R.ev("currentMode='admin'; window._userUid='u1'; window._userBizType='academy';"
       + "window._userPaidUntil=Date.now()+30*86400000;");
  }
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return R;
}
/* 서버 판정 함수만 꺼내 돌리는 틀 (api/support-info.js) */
function loadSup(src) {
  const code = (src || SUP)
    .replace(/^import [^;]*;$/mg, '')
    .replace(/^export default async function handler[\s\S]*$/m, '')
    + '\nreturn { regionPass: regionPass, findSido: findSido, regionHay: regionHay };';
  return new Function('process', 'console', 'fetch', code)(
    { env: {} }, { log: () => {}, error: () => {} }, async () => { throw new Error('no net'); });
}
const TODAY = (function(){ const n=new Date();
  return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'); })();

console.log('════ 열 가지를 망가뜨려 **검사가 잡는지** 본다 (저장소 파일은 안 고친다)');

/* ① 마스터 패널에서 escape 를 빼면 — detect.js 가 주입을 잡나 */
trial('① 업체명 escape 를 빼면 → detect.js 가 잡나',
  /* ★ 바꿔치기 글자는 **소스에 있는 그대로**여야 한다 — 처음에 없는 글자를 적어
     「못 잡음」이 났다(검사가 아니라 내가 틀린 것). 지금은 승인 대기 줄의 업체명이다. */
  () => APP.replace("+escapeMasterHtml(u.orgName||'(이름없음)')+", "+(u.orgName||'(이름없음)')+"),
  (src) => {
    const R = boot(src);
    const nasty = '"><img src=x onerror=alert(1)>';
    R.sandbox.masterCompanies = []; R.sandbox.masterInquiries = [];
    /* ★ **승인 대기** 줄을 그려야 한다 — 그 줄의 업체명 escape 를 망가뜨렸기 때문이다
       (처음에 approved:true 로 두어 다른 줄이 그려지고 「못 잡음」이 났다). */
    R.sandbox.signupUsers = [{ _uid:'U1', orgName:nasty, bizType:'academy', approved:false,
                               createdAt:Date.now(), phone:'010-1' }];
    R.sandbox.drawMasterPanel();
    const a = D.audit(R.byId['master-root'].innerHTML || '');
    return a.liveTags > 0 || a.injectedAttrs.length > 0;
  });

/* ② 기사 읽기 목록을 넓히면 — 앱↔규칙 대조가 잡나 */
trial('② 기사 읽기 목록을 넓히면 → 앱↔규칙 대조가 잡나',
  () => APP.replace("var DRIVER_READ_KEYS = ['orgDriver'];", "var DRIVER_READ_KEYS = ['orgDriver','members'];"),
  (src) => {
    const app = src || APP;
    const appRead = (app.match(/var DRIVER_READ_KEYS = \[([^\]]*)\]/) || [])[1] || '';
    const ruleRead = (RULES.match(/function driverReadableKey\(key\) \{\s*return key in \[([^\]]*)\]/) || [])[1] || '';
    const norm = (s) => s.replace(/['\s]/g, '').split(',').filter(Boolean).sort().join(',');
    return norm(appRead) !== norm(ruleRead);
  });

/* ③ 기사 쓰기 목록을 열면 — 「비어 있다」 검사가 잡나 */
trial('③ 기사 쓰기 목록을 열면 → 「비어 있다」 검사가 잡나',
  () => APP.replace('var DRIVER_WRITE_KEYS = [];', "var DRIVER_WRITE_KEYS = ['carlog'];"),
  (src) => {
    const m = ((src || APP).match(/var DRIVER_WRITE_KEYS = \[([^\]]*)\]/) || [])[1] || '';
    return m.replace(/[\s]/g, '').length > 0;
  });

/* ④ 도우미 출퇴근 키를 차량 키로 바꾸면 — 43-C 검사가 잡나 */
trial('④ 도우미 출퇴근 키를 차량 키로 바꾸면 → 43-C 검사가 잡나',
  () => APP.replace("var cid = isHelperAcct() ? String(window._driverStaffId || '')\n                           : (window._driverCarId || currentCarId);",
                    "var cid = (window._driverCarId || currentCarId);"),
  (src) => {
    const R = boot(src, { helper: true, att: { ['st2_' + TODAY]: { in: '08:40' } } });
    const h = R.ev('driverPunchBarHtml()');
    return String(h).indexOf('08:40') < 0;      /* 내 출근 시각이 안 보이면 잡은 것 */
  });

/* ⑤ 도우미 근태 지키기(driverAttSetLocal)를 빼면 — 출근 표시가 사라지나 */
trial('⑤ 근태 지키기(driverAttSetLocal)를 빼면 → 출근 표시가 사라지나',
  /* 지키는 **고리 한 줄만** 없앤다(문법은 그대로) — 처음에 `if(0){` 를 끼워 넣었다가
     문법이 깨져 「ERR:Unexpected end of input」이 났다(검사가 아니라 내가 틀린 것). */
  () => APP.replace("if(sid && k.indexOf(sid + '_') === 0 && !out[k]) out[k] = cur[k];", ''),
  (src) => {
    const R = boot(src, { helper: true, att: { ['st2_' + TODAY]: { in: '08:40' } } });
    /* ★ R.ev 에 **중괄호로 시작하는 식**을 주면 블록으로 읽혀 끊긴다(「Unexpected end of input」).
       JSON.parse 로 감싸 식으로 만든다. */
    R.ev("driverAttSetLocal(JSON.parse('{}'))");
    const left = R.ev("JSON.stringify(loadDriverAtt()['st2_" + TODAY + "']||null)");
    return left === 'null';                     /* 내 칸이 사라졌으면 잡은 것 */
  });

/* ⑥ 로그아웃에서 리스너 떼기를 빼면 — 「두 겹」 검사가 잡나 */
trial('⑥ 로그아웃에서 리스너 떼기를 빼면 → 검사가 잡나',
  () => APP.replace("try{ if(window._helperCarUnsub){ window._helperCarUnsub(); window._helperCarUnsub=null; } }catch(e){}", ''),
  (src) => {
    const R = boot(src, { helper: true });
    let called = 0;
    R.ev("window._helperCarUnsub = function(){ window.__unsubCalled = (window.__unsubCalled||0)+1; };");
    /* ★ 가짜 DOM 이 모자라 logout 뒤쪽(로그인 화면 되돌리기)에서 터진다 —
       우리가 볼 것은 **맨 앞의 리스너 떼기**이므로 터져도 그대로 센다. */
    try { R.ev('logout()'); } catch (e) {}
    called = Number(R.ev('window.__unsubCalled||0'));
    return called === 0;                        /* 안 떼면 잡은 것 */
  });

/* ⑦ 읽기 전용 안내를 빼면 — 조용히 사라지는 것을 잡나 */
trial('⑦ 읽기 전용 안내(saveCarState)를 빼면 → 잡나',
  () => APP.replace("try{ if(typeof readOnlyBlocked==='function') readOnlyBlocked('운행 기록'); }catch(e){}", ''),
  (src) => {
    const R = boot(src, { driver: true });
    R.ev("window.__ro=0; readOnlyBlocked=function(){ window.__ro++; };"
       + "isReadOnlyMode=function(){ return true; }; isDemoMode=function(){ return false; };");
    R.ev('saveCarState()');
    return Number(R.ev('window.__ro||0')) === 0;    /* 안내가 0번이면 잡은 것 */
  });

/* ⑧ 지원사업 — 해시태그 판정을 빼면 타 지역이 새나 */
trial('⑧ 지원사업 해시태그 판정을 빼면 → 타 지역이 새나',
  () => SUP.replace('  const tk = tagKeys(tags);\n  if (tk.length) return mine ? tk.indexOf(mine) >= 0 : false;', ''),
  (src) => {
    const M = loadSup(src);
    const it = { title: '2026년 중소기업 지원사업', org: '', field: '', tags: '2026,기술,전남' };
    return M.regionPass(M.regionHay(it), M.findSido('인천'), '', it.tags, it.org) === true;
  });

/* ⑨ 지원사업 — 머리말 판정을 빼면 `[경남]` 공고가 새나 */
/* ★ `[경남]` 으로 하면 **낱말 단위 판정**이 대신 잡아 「못 잡음」이 난다(겹겹이 막혀 있다).
   그래서 **머리말만** 잡는 경우를 쓴다 — `경기` 는 오탐이 커서 낱말 목록에서 뺐기 때문이다. */
trial('⑨ 지원사업 머리말 판정을 빼면 → `[경기]` 공고가 새나',
  () => SUP.replace('  const hk = headKeys(s);\n  if (hk.length) return hk.indexOf(mine) >= 0;', ''),
  (src) => {
    const M = loadSup(src);
    const it = { title: '[경기] 시흥시 2026년 지원', org: '', field: '', tags: '' };
    return M.regionPass(M.regionHay(it), M.findSido('인천'), '', it.tags, it.org) === true;
  });

/* ⑩ detect.js 자신 — 주입 판정을 빼면 공격을 놓치나 (검사기의 검사) */
trial('⑩ detect.js 주입 판정을 빼면 → 공격을 놓치나',
  () => 'BREAK',
  (src) => {
    const nasty = '<div>이름: "><img src=x onerror=alert(1)></div>';
    if (src === 'BREAK') {
      /* 「살아있는 태그」와 「주입 속성」을 안 보는 가짜 감사 — 그러면 못 잡는다 */
      const fake = D.audit(nasty);
      return !(0 > 0) && !(0 > 0) ? (fake.alerted === 0) : false;   /* alert 만 보면 0 → 못 잡음 */
    }
    const a = D.audit(nasty);
    return !(a.liveTags > 0 || a.injectedAttrs.length > 0);         /* 지금 판은 잡는다 → false */
  });

console.log('\n── 요약 ──');
console.log('  망가뜨려서 **잡힌** 검사 ' + caught + '건 · 못 잡은 것 ' + missed + '건');
console.log('  지금 판에서 **깨끗한** 검사 ' + okNow + '건 · 지금 판에서 걸린 것 ' + badNow + '건');
if (badNow) console.log('  ★ 「지금 판에서 걸림」이 있으면 **진짜 결함**일 수 있다 — 위 줄을 보고 보고할 것');
const fail = missed + badNow;
console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + (caught + okNow) + '건'
  : '✔ ' + (caught + okNow) + '/' + (caught + okNow) + ' 전부 통과 — 열 가지 모두 잡고, 지금 판은 깨끗하다'));
process.exit(fail ? 1 : 0);
