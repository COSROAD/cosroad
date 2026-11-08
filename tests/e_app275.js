/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v275(40-C) — 운행 기록·출퇴근을 차량별로.
   전: 889fbec (v274) · 새 쪽은 이 회차 커밋에 고정(COS_SRC_NEW_REF).
   보는 것 ① 쪼개기·합치기 ② 기사 동시 저장 ③ 배정 바뀌면 기록 이동 ④ 출퇴근 분리
          ⑤ 급여·근태 숫자 v274 와 같음 ⑥ 옛 자료 옮기기(멱등) ⑦ 기사 폰에 남의 것 0
   가짜 Firestore — 실제 쓰기 0. */
const cp = require('child_process');
/* v276: 못 박는 자리를 **기본값**으로 (c1c7b47 = v275 커밋). 안 박으면 뒤 회차의
   버전·바뀐 파일이 이 v275 기록에 거짓 실패로 들어온다. 빈 값을 주면 작업트리. */
if (!('COS_SRC_NEW_REF' in process.env)) process.env.COS_SRC_NEW_REF = 'c1c7b47';
if (!process.env.COS_SRC_NEW && process.env.COS_SRC_NEW_REF) {
  const f = require('path').join(__dirname, 'pin275_index.html');
  require('fs').writeFileSync(f, cp.execSync(
    'git -C ' + COS_ROOT + ' show ' + process.env.COS_SRC_NEW_REF + ':index.html',
    { maxBuffer: 1 << 28 }));
  process.env.COS_SRC_NEW = f;
}
if (!process.env.COS_SRC_OLD_REF) process.env.COS_SRC_OLD_REF = '889fbec';   /* v274 */
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(50) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const D7 = ['월','화','수','목','금','토','일'];
const ALL = [
  { id:1, name:'가하은', carId:'car1', carIdDrop:'car2', courseId:'c1', days:D7,
    location:'1', lat:37.41, lon:126.68, dropLocation:'d1', dropLat:37.42, dropLon:126.69,
    phone:'010-1', on:true, offOn:true, monthly:130000 },
  { id:2, name:'나여름', carId:'car1', courseId:'c1', days:D7, location:'2',
    lat:37.43, lon:126.70, phone:'010-2', on:true, offOn:true, monthly:120000 },
  { id:3, name:'다가을', carId:'car2', courseId:'c1', days:D7, location:'3',
    lat:37.45, lon:126.73, phone:'010-3', on:true, offOn:true, monthly:110000 }
];
const CARS = [{ id:'car1', name:'1호차', driver:'박기사', phone:'010-9-1' },
              { id:'car2', name:'2호차', driver:'김기사', phone:'010-9-2' }];
const COURSES = [{ id:'c1', name:'A반', depart:'15:00' }];
const STAFF = [{ id:'st1', name:'직원가', phone:'010-7', pin:'7777' }];
const SUF = '__cosroad_default';
/* 옛 모양 — 업체 전체 한 문서 */
const OLD_RIDE  = { '1':{on:true,offOn:false}, '2':{on:false,offOn:true}, '3':{on:true,offOn:true} };
const OLD_CARLOG= { records:[{id:'r1',carId:'car1',date:'2026-11-01',type:'주유',amount:50000,odo:100},
                             {id:'r2',carId:'car2',date:'2026-11-02',type:'주유',amount:40000,odo:200}],
                    plans:{ car1:{'엔진오일':5000}, car2:{'타이어':30000} } };
const OLD_DELIV = { '1':'2026-11-05', '3':'2026-11-05' };
const OLD_DROP  = { '1':'2026-11-05', '3':'2026-11-05' };
const OLD_ATT   = { 'car1_2026-11-05':{in:'08:30',out:'18:00'},
                    'car2_2026-11-05':{in:'07:50',out:'19:20'},
                    'st1_2026-11-05':{in:'09:00',out:'18:00'} };

function boot(mode, opt) {
  opt = opt || {};
  const store = {};
  store['tkd_members'+SUF]  = JSON.stringify(opt.members || ALL);
  store['tkd_cars'+SUF]     = JSON.stringify(opt.cars || CARS);
  store['tkd_courses'+SUF]  = JSON.stringify(COURSES);
  store['tkd_staff'+SUF]    = JSON.stringify(STAFF);
  store['tkd_org'+SUF]      = JSON.stringify({ name:'가온', icon:'🚐', bizType:'academy',
    destName:'학원', destLat:37.44, destLon:126.65 });
  store['tkd_ridestate'+SUF]= JSON.stringify(opt.ride !== undefined ? opt.ride : OLD_RIDE);
  store['tkd_carlog'+SUF]   = JSON.stringify(opt.carlog !== undefined ? opt.carlog : OLD_CARLOG);
  store['tkd_delivery_done_cosroad_default'] = JSON.stringify(opt.dv !== undefined ? opt.dv : OLD_DELIV);
  store['tkd_dropoff_done_cosroad_default']  = JSON.stringify(opt.dp !== undefined ? opt.dp : OLD_DROP);
  store['tkd_driver_att'+SUF]= JSON.stringify(opt.att !== undefined ? opt.att : OLD_ATT);
  store['tkd_driver_pay'+SUF]= JSON.stringify(opt.pay || { car1:{hourlyWage:12000,mealAllow:8000,taxMode:'none',commuteKm:20},
                                                           car2:{hourlyWage:11000,mealAllow:7000,taxMode:'none',commuteKm:10} });
  const R = E.build({ src: E.SRC_NEW, biz:'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content','app-content','drive-tabs','drive-screen','admin-screen','fb-loading',
   'member-screen','member-list','main-header','today-date','org-name-display','org-icon',
   'login-screen','main-app','bottom-action','mode-badge','header-btns','filter-chips',
   'search-input','day-tabs','member-add-area','sort-asc-btn','sort-desc-btn']
   .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });
  const wrote = { data:{}, carState:{}, carData:{} }, deleted = [], backups = [];
  const SERVER = Object.assign({ members: ALL, cars: CARS, courses: COURSES, orgDriver:{} },
                               opt.server || {});
  const CS = opt.carState || {};
  R.sandbox._firestore = R.win._firestore = {
    doc: (db,c1,o,c2,k) => ({ col:c2, key:k }),
    collection: (db,c1,o,c2) => ({ col:c2 }),
    getDoc: async (ref) => {
      const src = ref.col==='carState' ? CS : (ref.col==='carData' ? wrote.carData : SERVER);
      const has = Object.prototype.hasOwnProperty.call(src, ref.key) && src[ref.key]!==undefined;
      return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
    },
    setDoc: async (ref, d) => {
      /* 규칙이 아직 안 올라간 동안을 흉내 낸다 — carState 쓰기만 거부된다 */
      if (ref.col==='carState' && opt.denyCarState) {
        throw new Error('PERMISSION_DENIED: Missing or insufficient permissions.');
      }
      if (ref.col==='backups') { backups.push({ id: ref.key, key: d.key }); return; }
      (wrote[ref.col] = wrote[ref.col] || {})[ref.key] = JSON.parse(d.value);
    },
    deleteDoc: async (ref) => { deleted.push(ref.col+'/'+ref.key); },
    getDocs: async (ref) => ({
      forEach: (cb) => {
        const src = ref.col==='carState' ? CS : (ref.col==='carData' ? wrote.carData : {});
        Object.keys(src).forEach((k) => cb({ id:k, data: () => ({ value: JSON.stringify(src[k]) }) }));
      }
    }),
    onSnapshot: () => (() => {})
  };
  R.sandbox._db = R.win._db = {};
  R.ev("currentMode='" + mode + "';");
  R.sandbox._userOrgId = 'cosroad_default';
  if (mode === 'driver') {
    R.sandbox._isDriverAcct = true;
    R.sandbox._driverCarId = opt.carId || 'car1';
    R.ev("window._driverCarId='" + (opt.carId||'car1') + "';");
  }
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return { R, wrote, deleted, backups };
}

(async () => {
  console.log('════ ① 쪼개기 — 어느 기록이 어느 차량 문서로 가나');
  {
    const { R } = boot('admin');
    const sp = R.ev('splitCarState()');
    const c1 = sp.byCar.car1, c2 = sp.byCar.car2;
    /* 가하은: 등원 car1 · 하원 car2 → on 은 car1, offOn 은 car2 */
    ck('가하은 on → 1호차', JSON.stringify(c1.ride['1']), '{"on":true}');
    ck('가하은 offOn → **2호차**', JSON.stringify(c2.rideOff['1']), '{"offOn":false}');
    ck('나여름(1호차만) on·offOn 둘 다 1호차',
      JSON.stringify(c1.ride['2']) + JSON.stringify(c1.rideOff['2']), '{"on":false}{"offOn":true}');
    ck('다가을(2호차) → 2호차', JSON.stringify(c2.ride['3']), '{"on":true}');
    ck('차계부 기록이 차량별로', (c1.carlog.records||[]).length + '/' + (c2.carlog.records||[]).length, '1/1');
    ck('차계부 plans 도', Object.keys(c1.carlog.plans).join(',') + '/' + Object.keys(c2.carlog.plans).join(','), 'car1/car2');
    ck('납품 완료(등원 기준)', Object.keys(c1.delivDone).join(',') + '/' + Object.keys(c2.delivDone).join(','), '1/3');
    ck('하차 완료(**하원** 기준) — 가하은은 2호차',
      Object.keys(c1.dropDone).join(',') + '/' + Object.keys(c2.dropDone).sort().join(','), '/1,3');
    ck('출퇴근 — 날짜 키로 짧아졌다',
      Object.keys(c1.att).join(',') + '/' + Object.keys(c2.att).join(','), '2026-11-05/2026-11-05');
    ck('★ 직원 근태는 차량 문서에 **없다**',
      JSON.stringify(c1.att['st1_2026-11-05'] || null) + JSON.stringify(c2.att['st1_2026-11-05'] || null), 'nullnull');
    ck('★ 직원 근태는 staffAtt 로', Object.keys(sp.staffAtt).join(','), 'st1_2026-11-05');
  }

  console.log('\n② 합치기 — 화면이 보는 모양이 **옛것과 똑같나**');
  {
    const { R } = boot('admin');
    const same = R.ev(`(function(){
      var sp = splitCarState();
      var mg = mergeCarState(sp.byCar, sp.staffAtt);
      return {
        ride:   JSON.stringify(mg.rideState)   === JSON.stringify(loadRideState()),
        carlogN: (mg.carlog.records||[]).length,
        plans:  JSON.stringify(mg.carlog.plans) === JSON.stringify(loadCarlog().plans),
        dv:     JSON.stringify(mg.deliveryDone)=== JSON.stringify(loadDeliveryDone()),
        dp:     JSON.stringify(mg.dropoffDone) === JSON.stringify(loadDropoffDone()),
        att:    JSON.stringify(mg.driverAtt)   === JSON.stringify(loadDriverAtt())
      };
    })()`);
    ck('탑승 토글 되돌아옴', same.ride, true);
    ck('차계부 기록 수', same.carlogN, 2);
    ck('차계부 plans 되돌아옴', same.plans, true);
    ck('납품 완료 되돌아옴', same.dv, true);
    ck('하차 완료 되돌아옴', same.dp, true);
    ck('출퇴근 되돌아옴 (직원까지)', same.att, true);
  }

  console.log('\n③ ★ 기사 둘이 동시에 저장해도 서로 기록이 그대로');
  {
    /* 1호차 기사 — 자기 차량 몫만 폰에 있다 */
    const mine1 = ALL.filter((m) => m.carId==='car1' || (m.carIdDrop||m.carId)==='car1');
    const r1 = boot('driver', { carId:'car1', members: mine1,
      ride:{'1':{on:true,offOn:false},'2':{on:false,offOn:true}},
      carlog:{records:[OLD_CARLOG.records[0]],plans:{car1:OLD_CARLOG.plans.car1}},
      dv:{'1':'2026-11-05'}, dp:{}, att:{'car1_2026-11-05':{in:'08:30',out:'18:00'}},
      /* 서버에 **이미 문서가 있어야** 덮어쓰기 직전 백업 길이 돈다(없으면 백업할 것이 없다) */
      carState:{ car1:{ ride:{}, rideOff:{}, carlog:{records:[],plans:{}},
                        delivDone:{}, dropDone:{}, att:{} } } });
    await r1.R.ev('saveCarState()');
    await new Promise((r) => setTimeout(r, 120));
    /* 2호차 기사 */
    const mine2 = ALL.filter((m) => m.carId==='car2' || (m.carIdDrop||m.carId)==='car2');
    const r2 = boot('driver', { carId:'car2', members: mine2,
      /* 2호차 기사 폰에는 **가하은(하원 담당)** 도 있다 — 그 «회원» 의 offOn 도 폰에 있다 */
      ride:{'1':{on:true,offOn:false},'3':{on:true,offOn:true}},
      carlog:{records:[OLD_CARLOG.records[1]],plans:{car2:OLD_CARLOG.plans.car2}},
      dv:{'3':'2026-11-05'}, dp:{'1':'2026-11-05','3':'2026-11-05'},
      att:{'car2_2026-11-05':{in:'07:50',out:'19:20'}} });
    await r2.R.ev('saveCarState()');
    await new Promise((r) => setTimeout(r, 120));
    ck('1호차 기사가 쓴 문서', Object.keys(r1.wrote.carState).join(','), 'car1');
    ck('2호차 기사가 쓴 문서', Object.keys(r2.wrote.carState).join(','), 'car2');
    ck('★ 서로 **다른 문서**라 덮을 일이 없다',
      (Object.keys(r1.wrote.carState)[0] !== Object.keys(r2.wrote.carState)[0]), true);
    ck('1호차 기사가 2호차 몫을 안 썼다', JSON.stringify(r1.wrote.carState.car2 || null), 'null');
    ck('1호차 문서에 가하은 등원만(하원은 2호차 것)',
      Object.keys(r1.wrote.carState.car1.ride).join(',') + '|' + Object.keys(r1.wrote.carState.car1.rideOff).join(','), '1,2|2');
    ck('2호차 문서에 가하은 하원이 들어갔다',
      Object.keys(r2.wrote.carState.car2.rideOff).sort().join(','), '1,3');
    ck('기사가 쓰기 전 **백업**을 남겼다 (carState/<내 차량>)',
      (r1.backups[0] || {}).key || '(없음)', 'carState/car1');
  }

  console.log('\n④ ★ 배정을 바꾸면 그 «회원» 기록이 새 차량 문서로 옮겨간다');
  {
    const { R, wrote } = boot('admin', { carState: { car1:{}, car2:{} } });
    R.sandbox.showConfirmModal = (cb) => cb();
    /* 다가을(2호차) 을 1호차로 — 둘 다 */
    R.ev("assignMemberToCar(3,'car1','both');");
    await new Promise((r) => setTimeout(r, 200));
    const c1 = wrote.carState.car1 || {}, c2 = wrote.carState.car2 || {};
    ck('다가을 탑승이 **1호차 문서로**', JSON.stringify(c1.ride['3'] || null), '{"on":true}');
    ck('★ 2호차 문서에서 **빠졌다**', JSON.stringify(c2.ride['3'] || null), 'null');
    ck('다가을 납품 완료도 1호차로', c1.delivDone['3'] || '(없음)', '2026-11-05');
    ck('2호차 납품 완료에서 빠졌다', JSON.stringify(c2.delivDone['3'] || null), 'null');
    ck('다가을 하차 완료도 1호차로', c1.dropDone['3'] || '(없음)', '2026-11-05');
    ck('가하은 하원은 **여전히 2호차**(안 건드렸다)',
      JSON.stringify(c2.rideOff['1'] || null), '{"offOn":false}');
  }

  console.log('\n⑤ 급여·근태 숫자가 v274 와 같은가 (mergedDriverAtt 로 화면 무변경)');
  {
    const cur = boot('admin');
    const nowPay = cur.R.ev('JSON.stringify(buildPayrollData ? buildPayrollData() : null)');
    /* 옛 판 v274 — 같은 자료를 옛 방식으로 */
    const R2 = E.build({ src: E.SRC_OLD, biz:'academy', localStorage: {
      ['tkd_members'+SUF]:JSON.stringify(ALL), ['tkd_cars'+SUF]:JSON.stringify(CARS),
      ['tkd_courses'+SUF]:JSON.stringify(COURSES), ['tkd_staff'+SUF]:JSON.stringify(STAFF),
      ['tkd_driver_att'+SUF]:JSON.stringify(OLD_ATT),
      ['tkd_driver_pay'+SUF]:JSON.stringify({ car1:{hourlyWage:12000,mealAllow:8000,taxMode:'none',commuteKm:20},
                                              car2:{hourlyWage:11000,mealAllow:7000,taxMode:'none',commuteKm:10} }),
      ['tkd_org'+SUF]:JSON.stringify({ name:'가온', bizType:'academy' }) } });
    ['admin-content','app-content','fb-loading'].forEach((id)=>{ const el=E.makeEl('div'); el.id=id; R2.byId[id]=el; });
    R2.ev("currentMode='admin';");
    R2.ev('members = loadMembers(); cars = loadCars();');
    const oldPay = R2.ev('JSON.stringify(buildPayrollData ? buildPayrollData() : null)');
    ck('급여 계산 결과가 v274 와 **같다**', nowPay === oldPay, true);
    if (nowPay !== oldPay) {
      console.log('      새: ' + String(nowPay).slice(0, 150));
      console.log('      옛: ' + String(oldPay).slice(0, 150));
    }
    /* 근태 화면도 */
    const a1 = cur.R.ev("typeof buildDriverAttHtml==='function' ? buildDriverAttHtml().length : -1");
    const a2 = R2.ev("typeof buildDriverAttHtml==='function' ? buildDriverAttHtml().length : -1");
    ck('근태 화면 글자 수가 v274 와 같다', a1 + '/' + a2, a2 + '/' + a2);
  }

  console.log('\n⑥ 옛 자료 옮기기 — 한 번만 · 멱등');
  {
    const SRV = { rideState: OLD_RIDE, carlog: OLD_CARLOG, deliveryDone: OLD_DELIV,
                  dropoffDone: OLD_DROP, driverAtt: OLD_ATT, members: ALL, cars: CARS,
                  courses: COURSES, orgDriver: {} };
    const a = boot('admin', { server: SRV, carState: {} });
    await a.R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 300));
    ck('옮김 표시를 찍었다', JSON.stringify((a.wrote.data||{}).migration || null) !== 'null', true);
    ck('차량 문서가 둘 생겼다', Object.keys(a.wrote.carState).sort().join(','), 'car1,car2');
    ck('직원 근태를 staffAtt 로 올렸다',
      Object.keys((a.wrote.data||{}).staffAtt || {}).join(','), 'st1_2026-11-05');
    /* 두 번째 로그인 — 이미 찍혀 있으면 다시 옮기지 않는다 */
    const b = boot('admin', { server: Object.assign({}, SRV, { migration:{carState:true,at:1} }), carState: {} });
    await b.R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 300));
    ck('두 번째엔 옮김 표시를 다시 안 찍는다',
      JSON.stringify((b.wrote.data||{}).migration || null), 'null');
    /* ★ 규칙이 아직 안 올라간 틈(앱 먼저 → 규칙 나중) — carState 쓰기가 거부되면
       **완료 표시를 찍어선 안 된다.** 찍히면 옛 기록이 영원히 안 옮겨진다. */
    const g = boot('admin', { server: SRV, carState: {}, denyCarState: true });
    await g.R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 300));
    ck('규칙 없을 때: 차량 문서 0개 (거부)', Object.keys(g.wrote.carState).length, 0);
    ck('★ 규칙 없을 때: 옮김 표시를 **안 찍는다**',
      JSON.stringify((g.wrote.data||{}).migration || null), 'null');
    ck('   옛 다섯 키는 그대로 (지우지 않는다)',
      ['rideState','carlog','deliveryDone','dropoffDone','driverAtt']
        .filter((k) => (g.wrote.data||{})[k] !== undefined).join(',') || '안 건드림', '안 건드림');
    /* 규칙이 올라간 뒤 다시 들어오면 그때 옮긴다(멱등) */
    const h = boot('admin', { server: SRV, carState: {} });
    await h.R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 300));
    ck('   규칙 올라간 뒤 다시 들어오면 옮긴다',
      Object.keys(h.wrote.carState).sort().join(',') + '/'
      + (JSON.stringify((h.wrote.data||{}).migration || null) !== 'null'), 'car1,car2/true');
    /* 데모·읽기 전용에서는 안 한다 */
    const c = boot('admin', { server: SRV, carState: {} });
    c.R.sandbox._userOrgId = 'cosroad_demo';
    await c.R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 200));
    ck('데모: 차량 문서 0개 · 토스트 0',
      Object.keys(c.wrote.carState).length + '/' + (c.R.toasts.length ? c.R.toasts.join('|') : '없음'), '0/없음');
  }

  console.log('\n⑦ 기사 폰에 **직원 근태·다른 차량 기록 0건**');
  {
    const CS = { car1: { ride:{'1':{on:true}}, rideOff:{'2':{offOn:true}},
                         carlog:{records:[OLD_CARLOG.records[0]],plans:{car1:OLD_CARLOG.plans.car1}},
                         delivDone:{'1':'2026-11-05'}, dropDone:{}, att:{'2026-11-05':{in:'08:30'}} } };
    const { R } = boot('driver', { carId:'car1', members: ALL.filter((m)=>m.carId==='car1'),
      carState: CS, server: { orgDriver:{} }, ride:{}, carlog:{records:[],plans:{}},
      dv:{}, dp:{}, att:{} });
    await R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 250));
    const dump = Object.keys(R.store).map((k)=>k+'='+R.store[k]).join('\n');
    ck('직원 근태(st1) 0건', /st1_/.test(dump) ? '★ 있음' : '없음', '없음');
    ck('2호차 차계부(r2) 0건', /"r2"/.test(dump) ? '★ 있음' : '없음', '없음');
    ck('2호차 plans(타이어) 0건', /타이어/.test(dump) ? '★ 있음' : '없음', '없음');
    ck('내 출퇴근은 옛 모양으로 보인다(화면이 그 모양을 쓴다)',
      Object.keys(R.ev('loadDriverAtt()')).join(','), 'car1_2026-11-05');
    ck('기사 읽기 키는 하나', JSON.stringify(R.ev('DRIVER_READ_KEYS')), '["orgDriver"]');
    ck('기사 쓰기 키는 비었다', JSON.stringify(R.ev('DRIVER_WRITE_KEYS')), '[]');
  }

  console.log('\n⑧ 버전·범위');
  {
    const fs = require('fs');
    ck('APP_VERSION 275', (E.SRC_NEW.match(/const APP_VERSION = (\d+);/)||[])[1], '275');
    const vj = process.env.COS_SRC_NEW_REF
      ? cp.execSync('git -C ' + COS_ROOT + ' show '+process.env.COS_SRC_NEW_REF+':version.json').toString()
      : fs.readFileSync('' + COS_ROOT + '/version.json','utf8');
    ck('version.json 275', JSON.parse(vj).version, 275);
    /* ★ v277-1: 범위의 **끝쪽도** 못 박는다(c1c7b47 = v275). 작업트리와 견주면
       뒤 회차가 고친 파일이 이 v275 기록에 거짓 실패로 들어온다. */
    const names = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only 889fbec '
      + (process.env.COS_SRC_NEW_REF || ''))
      .toString().trim().split('\n').filter(Boolean).sort().join(',');
    ck('바뀐 파일 다섯', names,
      'CLAUDE.md,api/driver-auth.js,firestore.rules,index.html,version.json');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 Firestore — 실제 쓰기 0 · 문자 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
