/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드72-C — **map 꼴 다섯도 「바뀐 레코드만」 얹어 쓴다** (v317).
   ① 재현 — 옛 판은 관리자 둘이 **다른 달·다른 차량**을 고치면 하나가 **사라졌다**(다섯 키 모두)
   ② 고친 뒤 — 다섯 모두 **둘 다 남는다** · 레코드 단위(깊이) 표가 맞나
   ③ 셈 규칙 — 같은 레코드는 나중 이김 · 지움이 이김 · 깊은 가지도 · 빈 가지 치우기
   ④ 메아리 · 읽기 전용·둘러보기 · 첫 저장 · 전부 비우기 · 복원(통째+기준본)
   ⑤ ★ `saveToFirebase` 가 **참·거짓**을 돌려준다 — 실패를 「완료」로 보지 않는다
   ⑥ ★ 기준본 **업체 표시 한 자리**(`baseOrgGuard`) — 다섯 묶음 전부 버린다
   ⑦ ★ 기준본 **덮기 순서** — 쓰는 사이 리스너가 바꾸면 덮지 않는다
   ⑧ ★ `driverPay` 를 **내려받는다**(v255부터 올리기만 했다) · import·노출 줄 · 소스 전수
   ★ 바깥 통신 0 — 가짜 Firestore. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');
const { thisRef, srcAt } = require('./thisref.js');

const OLD_REF = process.env.COS_SRC_OLD_REF || 'c568589';   /* v316 — 고치기 전 */
const F = (p) => fs.readFileSync(COS_ROOT + '/' + p, 'utf8').replace(/\r\n/g, '\n');
const NEW_SRC = F('index.html');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const THIS_REF = thisRef(317);

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(50)
    + String(got).slice(0, 42) + (ok ? '' : '   (기대 ' + want + ')'));
};

/* ★ `JSON.stringify(undefined)` 는 **글자가 아니라 undefined** 다 — 그대로 견주면
   「없다」가 「있다」로 읽혀 검사가 **거짓 통과**한다(처음에 그렇게 틀렸다). */
const J = (v) => String(JSON.stringify(v));

/* 다섯 키 — 「A가 고치는 칸」과 「B가 고치는 칸」이 **서로 다른 레코드**다 */
const KEYS = [
  { key: 'payments', local: 'tkd_payments', srv: 'data/payments',
    seed: { '1_2026_10': { amount: 1000 } },
    a: "(function(){ var d=loadPayments(); d['1_2026_11']={amount:5000}; savePayments(d); })()",
    b: { '2_2026_11': { amount: 7000 } },
    aCell: '1_2026_11', bCell: '2_2026_11', peek: (o, c) => J((o || {})[c]) },
  { key: 'tax', local: 'tkd_tax', srv: 'data/tax',
    seed: { '2026_10': { income: [], expense: [] } },
    a: "(function(){ var d=loadTaxData(); d['2026_11']={income:[{name:'A'}],expense:[]}; saveTaxData(d); })()",
    b: { '2026_12': { income: [{ name: 'B' }], expense: [] } },
    aCell: '2026_11', bCell: '2026_12', peek: (o, c) => J(((o || {})[c] || {}).income) },
  { key: 'driverPay', local: 'tkd_driver_pay', srv: 'data/driverPay',
    seed: { car3: { hourlyWage: 9000 } },
    a: "(function(){ var d=loadDriverPay(); d.car1={hourlyWage:11000}; saveDriverPay(d); })()",
    b: { car2: { hourlyWage: 12000 } },
    aCell: 'car1', bCell: 'car2', peek: (o, c) => J((o || {})[c]) },
  { key: 'drivelogManual', local: 'tkd_drivelog_manual', srv: 'data/drivelogManual',
    seed: { car3: { '2026-10': { note: 'x' } } },
    a: "(function(){ var d=loadDriveLogManual(); d.car1={'2026-11':{note:'A'}}; saveDriveLogManual(d); })()",
    b: { car1: { '2026-12': { note: 'B' } } },
    aCell: 'car1/2026-11', bCell: 'car1/2026-12',
    peek: (o, c) => { const [a, b] = c.split('/'); return J((((o || {})[a]) || {})[b]); } },
  { key: 'payrollManual', local: 'tkd_payroll_manual', srv: 'data/payrollManual',
    seed: { holidays: {}, cars: { car3: { '2026-10': { w: 1 } } } },
    a: "(function(){ var d=loadPayrollManual(); d.cars.car1={'2026-11':{w:'A'}}; savePayrollManual(d); })()",
    b: { holidays: { '2026-11': ['2026-11-11'] }, cars: { car3: { '2026-10': { w: 1 } } } },
    aCell: 'cars/car1/2026-11', bCell: 'holidays/2026-11',
    peek: (o, c) => { const s = c.split('/'); let v = o || {}; for (const k of s) v = (v || {})[k]; return J(v); } }
];

function boot(src, opt) {
  opt = opt || {};
  const org = opt.org || 'B';
  const SUF = '__' + org;
  const SERVER = Object.assign({
    'data/members': '[]', 'data/cars': '[]', 'data/courses': '[]', 'data/staff': '[]',
    'data/org': JSON.stringify({ name: '가온학원', icon: '🚐', bizType: 'academy' }),
    'data/migration': JSON.stringify({ carState: true, at: 1 })
  }, opt.server || {});
  const store = {};
  ['tkd_members', 'tkd_cars', 'tkd_courses', 'tkd_staff', 'tkd_notices'].forEach((k) => {
    store[k] = '[]'; store[k + SUF] = '[]';
  });
  store['tkd_org'] = store['tkd_org' + SUF] = JSON.stringify({ name: '가온학원', icon: '🚐', bizType: 'academy' });
  Object.keys(opt.local || {}).forEach((k) => { store[k] = opt.local[k]; store[k + SUF] = opt.local[k]; });
  const R = E.build({ src: src, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  R.ev('currentMode="admin"; window._userOrgId=' + JSON.stringify(org) + '; window._userUid="uB";'
     + ' window._userBizType="academy"; window._userPaidUntil=Date.now()+1e9; window._userApproved=true;');
  R.ev('rebuildCarData=function(){}; renderAdminTab=function(){}; showToast=function(){};'
     + ' renderByTab=function(){}; saveCarState=function(){ return Promise.resolve(true); };');
  R.ev('members=loadMembers(); cars=loadCars(); courses=loadCourses(); orgSettings=loadOrgSettings();');
  R.sandbox.__srv = R.win.__srv = (k) => (Object.prototype.hasOwnProperty.call(SERVER, k) ? SERVER[k] : null);
  R.sandbox.__srvSet = R.win.__srvSet = (k, j) => { SERVER[k] = j; };
  R.sandbox.__srvKeys = R.win.__srvKeys = () => Object.keys(SERVER);
  R.ev('window.__writes = []; window.__subs = []; window.__alerts = [];');
  R.ev('window._firestore = {'
     + ' doc: function(){ var p=Array.prototype.slice.call(arguments,1); return { key: p.slice(2).join("/"), org: p[1] }; },'
     + ' collection: function(){ var p=Array.prototype.slice.call(arguments,1); return { key: p.slice(2).join("/"), org: p[1] }; },'
     + ' getDoc: async function(ref){ var v = window.__srv(ref.key);'
     + '   return { exists: function(){ return v !== null; }, data: function(){ return { value: v }; } }; },'
     + ' getDocs: async function(ref){ var pre = ref.key + "/";'
     + '   var ks = window.__srvKeys().filter(function(k){ return k.indexOf(pre)===0; });'
     + '   return { forEach: function(cb){ ks.forEach(function(k){ cb({ id:k.slice(pre.length),'
     + '     data: function(){ return { value: window.__srv(k) }; } }); }); } }; },'
     + ' setDoc: async function(ref,o){ if(window.__failWrite) throw new Error("망 끊김");'
     + '   window.__writes.push("set "+ref.key);'
     + '   window.__srvSet(ref.key, (o && o.value!==undefined) ? o.value : JSON.stringify(o)); },'
     + ' updateDoc: async function(){}, deleteField: function(){ return "__DEL__"; },'
     + ' deleteDoc: async function(){},'
     + ' runTransaction: async function(db, fn){ var sets=[];'
     + '   var out = await fn({ get: async function(ref){ var v=window.__srv(ref.key);'
     + '       return { exists: function(){ return v!==null; }, data: function(){ return { value: v }; } }; },'
     + '     set: function(ref,o){ sets.push([ref,o]); } });'
     + '   if(window.__midWrite){ try{ window.__midWrite(); }catch(e){} }'
     + '   sets.forEach(function(x){ window.__writes.push("tx "+x[0].key);'
     + '     window.__srvSet(x[0].key, x[1].value); });'
     + '   return out; },'
     + ' onSnapshot: function(ref, cb){ var s={key:ref.key, cb:cb, alive:true};'
     + '   window.__subs.push(s); return function(){ s.alive=false; }; } };');
  R.ev('window._db={}; window._fbReady=true; _firstSyncOk=true;');
  R.ev('window._auth={currentUser:{uid:"uB",isAnonymous:false,getIdToken:function(){return Promise.resolve("t");}}};');
  R.ev('_backupBeforeSave=function(){ return Promise.resolve(); };');
  R.ev('window.alert=function(m){ window.__alerts.push(String(m)); }; window.confirm=function(){ return true; };');
  R.SERVER = SERVER; R.SUF = SUF;
  return R;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = (R, k) => { try { return JSON.parse(R.SERVER[k] || 'null'); } catch (e) { return null; } };
const loc = (R, k) => { try { return JSON.parse(R.ev('localStorage.getItem(' + JSON.stringify(k + R.SUF) + ')') || 'null'); } catch (e) { return null; } };

(async () => {
  console.log('════ ① 재현 — 옛 판(v316)은 **다른 레코드**를 고쳐도 하나가 사라졌다');
  for (const K of KEYS) {
    const L = {}; L[K.local] = JSON.stringify(K.seed);
    const S = {}; S[K.srv] = JSON.stringify(K.seed);
    const R = boot(OLD_SRC, { local: L, server: S });
    R.ev('window.__srvSet(' + JSON.stringify(K.srv) + ', ' + JSON.stringify(JSON.stringify(
      Object.assign(JSON.parse(JSON.stringify(K.seed)), K.b))) + ');');   /* B 가 먼저 서버에 적었다 */
    R.ev(K.a);                                                            /* A 가 폰에서 고쳐 저장 */
    await wait(60);
    const after = srv(R, K.srv);
    ck('[옛] ' + K.key + ' — A 의 수정은 올라갔다', K.peek(after, K.aCell) !== 'undefined', true);
    ck('[옛] ★ ' + K.key + ' — **B 의 수정이 사라졌다**',
      K.peek(after, K.bCell) === 'undefined' ? '사라졌다' : '남았다', '사라졌다');
  }

  console.log('\n② 고친 뒤 — 다섯 모두 **둘 다 남는다**');
  for (const K of KEYS) {
    const L = {}; L[K.local] = JSON.stringify(K.seed);
    const S = {}; S[K.srv] = JSON.stringify(K.seed);
    const R = boot(NEW_SRC, { local: L, server: S });
    R.ev('_mpSetBase(' + JSON.stringify(K.key) + ', ' + JSON.stringify(JSON.stringify(K.seed)) + ' && JSON.parse('
       + JSON.stringify(JSON.stringify(K.seed)) + '));');                 /* 동기화로 받아 둔 기준본 */
    R.ev('window.__srvSet(' + JSON.stringify(K.srv) + ', ' + JSON.stringify(JSON.stringify(
      Object.assign(JSON.parse(JSON.stringify(K.seed)), K.b))) + ');');
    R.ev(K.a);
    await wait(80);
    const after = srv(R, K.srv);
    ck('★ ' + K.key + ' — A 의 수정이 남았다', K.peek(after, K.aCell) !== 'undefined', true);
    ck('★ ' + K.key + ' — **B 의 수정도 남았다**', K.peek(after, K.bCell) !== 'undefined', true);
    ck('  ' + K.key + ' — 트랜잭션으로 썼다',
      R.ev('window.__writes.filter(function(w){ return w.indexOf("tx ")===0; }).length') >= 1, true);
  }

  console.log('\n③ 셈 규칙 (레코드 단위 표 · 지움 · 깊은 가지)');
  {
    const R = boot(NEW_SRC, {});
    const flat = (k, o) => R.ev('Object.keys(mapFlat(' + JSON.stringify(o) + ',' + JSON.stringify(k) + ')).join("|")')
      .split('\u0001').join('›');
    ck('payments 깊이 1', flat('payments', { '1_2026_11': { a: 1 } }), '1_2026_11');
    ck('tax 깊이 1(그 달 한 칸)', flat('tax', { '2026_11': { income: [1] } }), '2026_11');
    ck('driverPay 깊이 1', flat('driverPay', { car1: { h: 1 } }), 'car1');
    ck('drivelogManual 깊이 2', flat('drivelogManual', { car1: { '2026-11': { a: 1 } } }), 'car1›2026-11');
    ck('payrollManual holidays 2 · cars 3',
      flat('payrollManual', { holidays: { '2026-11': [1] }, cars: { car1: { '2026-11': { b: 2 } } } }),
      'holidays›2026-11|cars›car1›2026-11');
    const dif = (k, b, l) => JSON.parse(R.ev('JSON.stringify(mapDiff(' + JSON.stringify(b) + ','
      + JSON.stringify(l) + ',' + JSON.stringify(k) + '))'));
    const app = (r, p) => JSON.parse(R.ev('JSON.stringify(mapApply(' + JSON.stringify(r) + ','
      + JSON.stringify(p) + '))'));
    const B0 = { car1: { '2026-11': { w: 1 } }, car2: { '2026-11': { w: 2 } } };
    ck('바뀐 레코드만 `put`',
      Object.keys(dif('drivelogManual', B0, { car1: { '2026-11': { w: 9 } }, car2: { '2026-11': { w: 2 } } }).put)
        .join(',').split('\u0001').join('›'), 'car1›2026-11');
    ck('지운 레코드는 `drop`',
      dif('drivelogManual', B0, { car1: { '2026-11': { w: 1 } } }).drop.join(',').split('\u0001').join('›'),
      'car2›2026-11');
    ck('바뀐 것이 없으면 빈 차이표',
      R.ev('mapPatchEmpty(mapDiff(' + JSON.stringify(B0) + ',' + JSON.stringify(B0) + ',"drivelogManual"))'), true);
    const Rsrv = { car1: { '2026-11': { w: '남이고침' } }, car2: { '2026-11': { w: 2 } } };
    ck('★ 같은 레코드는 **나중 이김**',
      JSON.stringify(app(Rsrv, dif('drivelogManual', B0, { car1: { '2026-11': { w: '내가' } }, car2: { '2026-11': { w: 2 } } })).car1),
      JSON.stringify({ '2026-11': { w: '내가' } }));
    ck('★ **지움이 이긴다** · 빈 가지를 치운다',
      JSON.stringify(app(Rsrv, dif('drivelogManual', B0, { car1: { '2026-11': { w: 1 } } }))),
      JSON.stringify({ car1: { '2026-11': { w: '남이고침' } } }));
    ck('  깊은 가지(payrollManual cars) 더하기',
      JSON.stringify(app({ holidays: {}, cars: {} },
        dif('payrollManual', { holidays: {}, cars: {} }, { holidays: {}, cars: { car9: { '2026-11': { w: 3 } } } }))),
      JSON.stringify({ holidays: {}, cars: { car9: { '2026-11': { w: 3 } } } }));
  }

  console.log('\n④ 메아리 · 읽기 전용·둘러보기 · 첫 저장 · 전부 비우기 · 복원');
  {
    const R = boot(NEW_SRC, { local: { 'tkd_driver_pay': JSON.stringify({ car1: { h: 1 } }) } });
    R.ev('_mpFlight["driverPay"] = { car1: { h: 1 } };');
    R.ev('(function(){ var d=loadDriverPay(); d.car1={h:99}; localStorage.setItem("tkd_driver_pay",JSON.stringify(d)); })()');
    ck('★ 메아리 — 보낸 뒤 또 고친 것이 남는다',
      JSON.stringify(JSON.parse(R.ev('JSON.stringify(mpRebase("driverPay", {car1:{h:1}}, _mpLocal("driverPay"), _mpFlight["driverPay"]))')).car1),
      JSON.stringify({ h: 99 }));
    const ro = boot(NEW_SRC, { local: { 'tkd_driver_pay': JSON.stringify({ car1: { h: 5 } }) } });
    ro.ev('isReadOnlyMode = function(){ return true; };');
    ck('★ 읽기 전용이면 **서버 값 그대로**',
      ro.ev('JSON.stringify(mpRebase("driverPay", {car2:{h:7}}, _mpLocal("driverPay")))'), '{"car2":{"h":7}}');
    ck('  읽기 전용은 저장도 막는다', await ro.ev('saveMapKey("driverPay")'), false);
    const dm = boot(NEW_SRC, {});
    dm.ev('isDemoMode = function(){ return true; };');
    ck('  둘러보기도 막는다', await dm.ev('saveMapKey("tax")'), false);
    /* 첫 저장 — 기준본이 없으면 통째로(그래도 올라간다) */
    const fs0 = boot(NEW_SRC, { local: { 'tkd_payments': JSON.stringify({ '1_2026_11': { amount: 1 } }) } });
    ck('기준본이 없으면 `null`', fs0.ev('_mpBaseOf("payments") === null'), true);
    ck('★ 첫 저장은 통째로 — 참을 돌려준다', await fs0.ev('saveMapKey("payments")'), true);
    await wait(40);
    ck('  서버에 올라갔다', JSON.stringify(srv(fs0, 'data/payments')), JSON.stringify({ '1_2026_11': { amount: 1 } }));
    ck('  그 값이 기준본이 된다', fs0.ev('_mpBaseOf("payments") !== null'), true);
    /* 전부 비우기 — 한 번 묻는다 */
    const ez = boot(NEW_SRC, { local: { 'tkd_payments': '{}' },
      server: { 'data/payments': JSON.stringify({ '1_2026_11': { amount: 1 } }) } });
    ez.ev('_mpSetBase("payments", { "1_2026_11": { amount: 1 } });');
    let asked = 0;
    ez.sandbox.confirm = ez.win.confirm = () => { asked++; return false; };
    const r0 = await ez.ev('saveMapKey("payments")');
    ck('★ 전부 비우려면 **묻는다**', asked, 1);
    ck('  「아니요」면 안 쓴다', r0 + '/' + JSON.stringify(srv(ez, 'data/payments')),
      'false/' + JSON.stringify({ '1_2026_11': { amount: 1 } }));
    /* 복원·전체 삭제 — 일부러 통째 + 기준본 맞춤(소스로) */
    ck('  소스 — 복원이 다섯 키 기준본을 맞춘다',
      (NEW_SRC.match(/_mpSetBase\('\w+', JSON\.parse\(/g) || []).length, 5);
  }

  console.log('\n⑤ ★ `saveToFirebase` 가 참·거짓을 돌려준다 (실패를 「완료」로 보지 않는다)');
  {
    const R = boot(NEW_SRC, { local: { 'tkd_payments': JSON.stringify({ '1_2026_11': { amount: 1 } }) } });
    ck('[옛] v316 은 아무것도 안 돌려줬다',
      /await setDoc\(ref, \{ value: JSON\.stringify\(data\), updatedAt: Date\.now\(\) \}\);\s*\n\s*console\.log\('Firebase 저장:', key\);\s*\n\s*\} catch/.test(OLD_SRC), true);
    ck('★ 성공하면 참', await R.ev('saveToFirebase("payments", {a:1})'), true);
    R.ev('window.__failWrite = true;');
    ck('★ 망이 끊기면 **거짓**', await R.ev('saveToFirebase("payments", {a:2})'), false);
    ck('★ 그때 첫 저장도 **거짓**을 돌려준다(완료로 안 본다)',
      await R.ev('(function(){ _mpBase["tax"]=null; return saveMapKey("tax"); })()'), false);
    R.ev('window.__failWrite = false;');
    ck('  둘러보기·읽기 전용·첫 동기화도 거짓',
      await R.ev('(function(){ var f=isDemoMode; isDemoMode=function(){return true;};'
        + ' var p=saveToFirebase("tax",{}); isDemoMode=f; return p; })()'), false);
  }

  console.log('\n⑥ ★ 기준본 업체 표시 — **한 자리**에서 다섯 묶음 전부 버린다');
  {
    const R = boot(NEW_SRC, {});
    R.ev('_mpSetBase("payments", {"1_2026_11":{amount:1}}); _csSetBase("car1", emptyCarState());'
       + ' _saSetBase({"st1_2026-11-11":{in:"09:00"}}); _atSetBase("attendance", {"2026-11-11":{"1":"present"}});'
       + ' _lsSetBase("members", []);');
    ck('다섯 묶음 기준본이 섰다',
      R.ev('[_mpBaseOf("payments")!==null, _csBaseOf("car1")!==undefined, _saBaseOf()!==null,'
        + ' _atBaseOf("attendance")!==null, _lsBaseOf("members")!==null].join(",")'),
      'true,true,true,true,true');
    ck('  업체 표시가 B', R.ev('_baseOrg'), 'B');
    R.ev('window._userOrgId = "C";');                       /* 같은 탭에서 계정만 바꿨다 */
    ck('★ map 꼴 기준본을 안 쓴다', R.ev('_mpBaseOf("payments") === null'), true);
    ck('★ 차량 기록도', R.ev('_csBaseOf("car1") === undefined'), true);
    ck('★ 직원 근태도', R.ev('_saBaseOf() === null'), true);
    ck('★ 출석도', R.ev('_atBaseOf("attendance") === null'), true);
    ck('★ 배열+id 도', R.ev('_lsBaseOf("members") === null'), true);
    ck('  표시가 C 로 바뀌었다', R.ev('_baseOrg'), 'C');
    const R2 = boot(NEW_SRC, {});
    R2.ev('_mpSetBase("tax", {"2026_11":{income:[]}});');
    ck('★ (대조) 업체가 그대로면 기준본을 쓴다', R2.ev('_mpBaseOf("tax") !== null'), true);
    /* ★ 로그아웃 짝 — `csQueueReset()` 이 **돌려서** 다섯 묶음을 비우나(소스 글자만 보지 않는다) */
    const R3 = boot(NEW_SRC, {});
    R3.ev('_mpSetBase("payments", {"1_2026_11":{amount:1}}); _csSetBase("car1", emptyCarState());'
        + ' _saSetBase({"st1_2026-11-11":{in:"09:00"}}); _atSetBase("attendance", {"2026-11-11":{"1":"present"}});'
        + ' _lsSetBase("members", []); _mpFlight["payments"] = {}; _mpSaving["payments"] = true;');
    R3.ev('csQueueReset();');
    ck('★ 로그아웃 — 다섯 묶음이 다 비었다',
      R3.ev('[MAP_KEYS.every(function(k){ return _mpBase[k]===null && _mpFlight[k]===null && _mpSaving[k]===false; }),'
        + ' Object.keys(_csBase).length===0, _saBase===null,'
        + ' _atBase.attendance===null && _atBase.attendanceTime===null,'
        + ' LIST_KEYS.every(function(k){ return _lsBase[k]===null; })].join(",")'),
      'true,true,true,true,true');
    ck('  업체 표시도 비운다', R3.ev('_baseOrg'), '');
  }

  console.log('\n⑦ ★ 기준본 덮기 순서 — 쓰는 사이 리스너가 바꾸면 **덮지 않는다**');
  {
    const R = boot(NEW_SRC, { local: { 'tkd_driver_pay': JSON.stringify({ car1: { h: 1 } }) },
      server: { 'data/driverPay': JSON.stringify({}) } });
    R.ev('_mpSetBase("driverPay", {});');
    /* 트랜잭션을 기다리는 사이 리스너가 더 새 서버값으로 기준본을 바꾼다 */
    R.ev('window.__midWrite = function(){ _mpSetBase("driverPay", { car9: { h: 9 } }); };');
    await R.ev('saveMapKey("driverPay")');
    await wait(40);
    ck('★ 리스너가 넣은 기준본이 **그대로**', JSON.stringify(R.ev('JSON.stringify(_mpBaseOf("driverPay"))')),
      JSON.stringify(JSON.stringify({ car9: { h: 9 } })));
    ck('  서버에는 내 변경이 들어갔다', JSON.stringify(srv(R, 'data/driverPay')), JSON.stringify({ car1: { h: 1 } }));
    ck('  소스 — 다섯 쓰기 모두 같은 꼴', (NEW_SRC.match(/if\(_baseSeq === _seq\)/g) || []).length, 5);
  }

  console.log('\n⑧ ★ `driverPay` 를 내려받는다 · 소스 전수');
  {
    ck('[옛] v316 은 동기화에 읽는 줄이 없었다', /loadFromFirebase\('driverPay'\)/.test(OLD_SRC), false);
    ck('[옛] 리스너에도 가지가 없었다', /key==='driverPay'/.test(OLD_SRC), false);
    ck('★ 이제 동기화가 읽는다', /loadFromFirebase\('driverPay'\)/.test(NEW_SRC), true);
    ck('★ 리스너 가지도 있다', /key==='driverPay'/.test(NEW_SRC), true);
    const R = boot(NEW_SRC, { server: { 'data/driverPay': JSON.stringify({ car1: { hourlyWage: 11000 } }) } });
    await R.ev('syncFromFirebase()');
    await wait(300);
    ck('★ 동기화가 폰에 넣었다', JSON.stringify(loc(R, 'tkd_driver_pay')),
      JSON.stringify({ car1: { hourlyWage: 11000 } }));
    /* 소스 전수 */
    ck('★ 다섯 저장 함수가 모두 `saveMapKey` 를 지난다',
      (NEW_SRC.match(/saveMapKey\('(payments|tax|driverPay|drivelogManual|payrollManual)'\)/g) || []).length, 5);
    ck('  한 벌 — `mapDiff`·`mapApply`·`mpRebase`·`writeMapPatch`·`saveMapKey`',
      (NEW_SRC.match(/^(async )?function (mapDiff|mapApply|mpRebase|writeMapPatch|saveMapKey)\(/mg) || []).length, 5);
    const impOf = (s) => (s.match(/import \{([^}]*)\} from "https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.0\/firebase-firestore\.js"/) || ['', ''])[1];
    const expOf = (s) => (s.match(/window\._firestore = \{([^}]*)\}/) || ['', ''])[1];
    ck('★ import·노출 줄에 쓰는 함수가 다 있다',
      ['doc', 'setDoc', 'getDoc', 'collection', 'getDocs', 'deleteDoc', 'onSnapshot', 'runTransaction', 'updateDoc', 'deleteField']
        .filter(function (n) { return !(new RegExp('\\b' + n + '\\b').test(impOf(NEW_SRC))
          && new RegExp('\\b' + n + '\\b').test(expOf(NEW_SRC))); }).join(',') || '빠진 것 없음', '빠진 것 없음');
    ck('★ 규칙·`storage.rules`·서버 0줄',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF
        + (THIS_REF ? ' ' + THIS_REF : '')
        + ' -- api lib firestore.rules storage.rules', { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
    console.log('      (잰 자리: ' + OLD_REF + ' → ' + (THIS_REF || '작업트리') + ')');
    const panels = (s) => (s.match(/BACK_PANEL_IDS\s*=\s*\[[\s\S]*?\]/) || [''])[0];
    ck('  새 창(덮개) 0', panels(NEW_SRC) === panels(OLD_SRC) ? '그대로' : '바뀜', '그대로');
    ck('  `ORG_KEYS` 그대로',
      (NEW_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0] === (OLD_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0], true);
    ck('  로그아웃 짝 — `csQueueReset` 이 map 꼴도 비운다',
      /MAP_KEYS\.forEach\(function\(k\)\{ _mpBase\[k\] = null/.test(NEW_SRC), true);
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    ck('  버전 317 이상', appV >= 317 ? 'OK(' + appV + ')' : 'NG(' + appV + ')', 'OK(' + appV + ')');
    ck('  `version.json` 과 같다', String(JSON.parse(F('version.json')).version), String(appV));
    const QA = (s) => { const i = s.indexOf('var HELP_QA=['); return i < 0 ? '' : s.slice(i, s.indexOf('\n];', i)); };
    ck('  문답표 그대로(화면 글자 0줄)', QA(NEW_SRC) === QA(OLD_SRC) ? '그대로' : '바뀜', '그대로');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 가짜 Firestore · 실서비스 읽기·쓰기 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
