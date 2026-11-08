/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v277(43-0) — 차량 기록을 **바뀐 칸만 트랜잭션으로**.
   ★ 대조 먼저: 옛 판(v276 · b0f695a)에서 ①기사 토글이 되살아나고 ②서버 punch 의 출근 기록이
     지워지는 것을 **실측**한 뒤, 새 판에서 안 그런지 본다.
   가짜 Firestore 지만 **runTransaction 을 진짜처럼** 돌린다(읽고→고치고→쓰기, 충돌 시 재시도).
   실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const OLD_REF = process.env.COS_SRC_OLD_REF || 'b0f695a';   /* v276 */
if (!('COS_SRC_NEW_REF' in process.env)) process.env.COS_SRC_NEW_REF = '';   /* 새 쪽 = 작업트리 */
const E = require('./env246.js');
const fs = require('fs');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(50) + String(got).slice(0, 56)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');

const D7 = ['월','화','수','목','금','토','일'];
const MEMBERS = [
  { id:1, name:'가하은', carId:'car1', courseId:'c1', days:D7, location:'1', lat:37.41, lon:126.68, phone:'010-1' },
  { id:2, name:'나여름', carId:'car1', courseId:'c1', days:D7, location:'2', lat:37.43, lon:126.70, phone:'010-2' },
  { id:3, name:'다가을', carId:'car2', courseId:'c1', days:D7, location:'3', lat:37.45, lon:126.73, phone:'010-3' }
];
const CARS = [{ id:'car1', name:'1호차', driver:'박기사', phone:'010-9-1' },
              { id:'car2', name:'2호차', driver:'김기사', phone:'010-9-2' }];
const COURSES = [{ id:'c1', name:'A반', depart:'15:00' }];
const SUF = '__cosroad_default';
const TODAY = '2026-11-05';

/* 서버 한 벌 — carState 문서들을 들고 있고 runTransaction 을 흉내 낸다 */
function makeServer(init) {
  /* ★ 리스너는 **서버에** 둔다 — 폰마다 따로 두면 서로의 변경을 못 받아
     「실시간 듣기」 시험이 헛돈다(처음에 그렇게 짰다가 ③④가 거짓 실패했다). */
  return { carState: JSON.parse(JSON.stringify(init || {})), data: {}, backups: {}, writes: [],
           listeners: [] };
}

function phone(SRV, mode, opt) {
  opt = opt || {};
  const store = {};
  store['tkd_members'+SUF] = JSON.stringify(opt.members || MEMBERS);
  store['tkd_cars'+SUF]    = JSON.stringify(CARS);
  store['tkd_courses'+SUF] = JSON.stringify(COURSES);
  store['tkd_org'+SUF]     = JSON.stringify({ name:'가온', icon:'🚐', bizType:'academy',
    destName:'학원', destLat:37.44, destLon:126.65 });
  const R = E.build({ src: opt.src || E.SRC_NEW, biz:'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content','app-content','drive-screen','admin-screen','fb-loading','member-screen',
   'member-list','main-header','today-date','org-name-display','org-icon','login-screen',
   'main-app','bottom-action','mode-badge','header-btns','filter-chips','search-input',
   'day-tabs','member-add-area','drive-tabs']
   .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });
  const listeners = SRV.listeners;
  const fire = (col) => {
    listeners.filter((l) => l.col === col).forEach((l) => {
      try {
        if (l.key !== undefined) {
          const v = SRV[col][l.key];
          l.cb({ exists: () => v !== undefined, data: () => ({ value: JSON.stringify(v) }) });
        } else {
          l.cb({ forEach: (f) => Object.keys(SRV[col]).forEach((k) =>
            f({ id: k, data: () => ({ value: JSON.stringify(SRV[col][k]) }) })) });
        }
      } catch (e) {}
    });
  };
  R.sandbox._firestore = R.win._firestore = {
    doc: (db,c1,o,c2,k) => ({ col:c2, key:k }),
    collection: (db,c1,o,c2) => ({ col:c2 }),
    getDoc: async (ref) => {
      const src = SRV[ref.col] || {};
      const has = Object.prototype.hasOwnProperty.call(src, ref.key);
      return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
    },
    getDocs: async (ref) => ({
      forEach: (cb) => Object.keys(SRV[ref.col] || {}).forEach((k) =>
        cb({ id:k, data: () => ({ value: JSON.stringify(SRV[ref.col][k]) }) }))
    }),
    setDoc: async (ref, d) => {
      if (opt.deny) { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
      SRV[ref.col] = SRV[ref.col] || {};
      SRV.writes.push(ref.col + '/' + ref.key);
      SRV[ref.col][ref.key] = d.value !== undefined ? JSON.parse(d.value) : d;
      fire(ref.col);
    },
    deleteDoc: async () => {},
    /* 진짜처럼 — 읽고 → 고치고 → 쓴다 */
    runTransaction: async (db, fn) => {
      const tx = {
        get: async (ref) => {
          const src = SRV[ref.col] || {};
          const has = Object.prototype.hasOwnProperty.call(src, ref.key);
          return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
        },
        set: (ref, d) => {
          if (opt.deny) { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
          SRV[ref.col] = SRV[ref.col] || {};
          SRV.writes.push('tx ' + ref.col + '/' + ref.key);
          SRV[ref.col][ref.key] = JSON.parse(d.value);
          fire(ref.col);
        }
      };
      return await fn(tx);
    },
    onSnapshot: (ref, cb) => { listeners.push({ col: ref.col, key: ref.key, cb: cb }); return () => {}; }
  };
  R.sandbox._db = R.win._db = {};
  R.ev("currentMode='" + mode + "';");
  R.sandbox._userOrgId = 'cosroad_default';
  R.ev("window._userOrgId='cosroad_default';");
  if (mode === 'driver') {
    R.sandbox._isDriverAcct = true;
    R.ev("window._isDriverAcct=true; window._driverCarId='" + (opt.carId || 'car1') + "';");
  } else {
    R.ev("window._userUid='u1'; window._userPaidUntil=Date.now()+30*86400000; window._userBizType='academy';");
  }
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return { R, SRV };
}

/* 한 장면: 기사가 회원1 탑승 끔 → (관리자는 그 사이 아무것도 못 받음) → 관리자가 회원 저장 */
async function scene(src, label) {
  const SRV = makeServer({
    car1: { ride:{'1':{on:true},'2':{on:true}}, rideOff:{}, carlog:{records:[],plans:{}},
            delivDone:{}, dropDone:{}, att:{} },
    car2: { ride:{'3':{on:true}}, rideOff:{}, carlog:{records:[],plans:{}},
            delivDone:{}, dropDone:{}, att:{} }
  });
  const admin = phone(SRV, 'admin', { src });
  const drv = phone(SRV, 'driver', { src, carId:'car1', members: MEMBERS.filter((m)=>m.carId==='car1') });
  await admin.R.ev('syncFromFirebase()');
  await drv.R.ev('syncFromFirebase()');
  await new Promise((r) => setTimeout(r, 350));
  /* 서버 punch 가 출근을 찍는다 (api/driver-auth.js 가 하는 그 일) */
  SRV.carState.car1.att = { [TODAY]: { in: '08:00' } };
  /* 기사가 회원1 탑승 끔 */
  await drv.R.ev("(function(){ var st=loadRideState(); st['1']={on:false}; saveRideState(st); })()");
  await new Promise((r) => setTimeout(r, 250));
  /* 관리자가 «회원» 을 저장(주소 고침 등) */
  await admin.R.ev("saveMembers(members)");
  await new Promise((r) => setTimeout(r, 350));
  const c1 = SRV.carState.car1;
  return { 토글: JSON.stringify(c1.ride['1']), 출근: JSON.stringify((c1.att||{})[TODAY] || null) };
}

(async () => {
  console.log('════ ① ② 대조 — 옛 판(v276)에서 정말 지워지나');
  {
    const r = await scene(OLD_SRC, 'v276');
    ck('[옛] ① 기사 토글이 되살아난다', r.토글, '{"on":true}');
    ck('[옛] ② 서버 punch 출근 기록이 **지워진다**', r.출근, 'null');
  }

  console.log('\n②-새 v277 — 둘 다 그대로 남는다');
  {
    const r = await scene(E.SRC_NEW, 'v277');
    ck('★ ① 기사 토글 그대로(꺼짐)', r.토글, '{"on":false}');
    ck('★ ② 서버 punch 출근 기록 그대로', r.출근, '{"in":"08:00"}');
  }

  console.log('\n③④ 관리자 ↔ 기사 실시간 듣기');
  {
    const SRV = makeServer({ car1: { ride:{'1':{on:true},'2':{on:true}}, rideOff:{},
      carlog:{records:[],plans:{}}, delivDone:{}, dropDone:{}, att:{} } });
    const admin = phone(SRV, 'admin', {});
    const drv = phone(SRV, 'driver', { carId:'car1', members: MEMBERS.filter((m)=>m.carId==='car1') });
    await admin.R.ev('syncFromFirebase()');
    await drv.R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 350));
    /* ④ 기사 토글 → 관리자 화면에 바로 */
    await drv.R.ev("(function(){ var st=loadRideState(); st['2']={on:false}; saveRideState(st); })()");
    await new Promise((r) => setTimeout(r, 250));
    ck('④ 관리자 폰이 기사 변경을 **바로 받는다**',
      admin.R.ev("JSON.stringify(loadRideState()['2'])"), '{"on":false}');
    /* ③ 관리자 수기 토글 → 기사 폰에 바로 */
    await admin.R.ev("(function(){ var st=loadRideState(); st['1']={on:false}; saveRideState(st); })()");
    await new Promise((r) => setTimeout(r, 250));
    ck('③ 기사 폰이 관리자 변경을 **바로 받는다**',
      drv.R.ev("JSON.stringify(loadRideState()['1'])"), '{"on":false}');
  }

  console.log('\n⑤ 거의 같은 순간에 서로 다른 회원을 바꿔도 둘 다 남는다');
  {
    const SRV = makeServer({ car1: { ride:{'1':{on:true},'2':{on:true}}, rideOff:{},
      carlog:{records:[],plans:{}}, delivDone:{}, dropDone:{}, att:{} } });
    const a = phone(SRV, 'driver', { carId:'car1', members: MEMBERS.filter((m)=>m.carId==='car1') });
    const b2 = phone(SRV, 'driver', { carId:'car1', members: MEMBERS.filter((m)=>m.carId==='car1') });
    await a.R.ev('syncFromFirebase()'); await b2.R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 350));
    await Promise.all([
      a.R.ev("(function(){ var st=loadRideState(); st['1']={on:false}; saveRideState(st); })()"),
      b2.R.ev("(function(){ var st=loadRideState(); st['2']={on:false}; saveRideState(st); })()")
    ]);
    await new Promise((r) => setTimeout(r, 400));
    ck('★ 둘 다 남는다', JSON.stringify(SRV.carState.car1.ride), '{"1":{"on":false},"2":{"on":false}}');
  }

  console.log('\n⑥ 차계부 — 둘이 넣어도 둘 다 · 지운 것은 안 살아남');
  {
    const SRV = makeServer({ car1: { ride:{}, rideOff:{},
      carlog:{records:[{id:'r0',carId:'car1',type:'etc',date:TODAY,amount:1000,item:'옛 기록'}],plans:{}},
      delivDone:{}, dropDone:{}, att:{} } });
    const a = phone(SRV, 'driver', { carId:'car1', members: MEMBERS.filter((m)=>m.carId==='car1') });
    const adm = phone(SRV, 'admin', {});
    await a.R.ev('syncFromFirebase()'); await adm.R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 350));
    await a.R.ev("(function(){ var d=loadCarlog(); d.records.push({id:'r1',carId:'car1',type:'fuel',date:'"+TODAY+"',amount:50000,item:'기사 주유'}); saveCarlog(d); })()");
    await new Promise((r) => setTimeout(r, 250));
    await adm.R.ev("(function(){ var d=loadCarlog(); d.records.push({id:'r2',carId:'car1',type:'etc',date:'"+TODAY+"',amount:3000,item:'관리자 기록'}); saveCarlog(d); })()");
    await new Promise((r) => setTimeout(r, 300));
    ck('셋 다 남는다', (SRV.carState.car1.carlog.records||[]).map((r)=>r.id).sort().join(','), 'r0,r1,r2');
    /* 관리자가 r0 을 지운다 */
    await adm.R.ev("(function(){ var d=loadCarlog(); d.records=d.records.filter(function(r){return r.id!=='r0';}); saveCarlog(d); })()");
    await new Promise((r) => setTimeout(r, 300));
    ck('★ 지운 기록은 안 살아난다', (SRV.carState.car1.carlog.records||[]).map((r)=>r.id).sort().join(','), 'r1,r2');
  }

  console.log('\n⑦ 배정 바꾸기 — 그 회원 칸만 옮기고 나머지는 그대로 (v275 실측표 재현)');
  {
    const SRV = makeServer({
      car1: { ride:{'1':{on:true}}, rideOff:{}, carlog:{records:[],plans:{}},
              delivDone:{'1':TODAY}, dropDone:{}, att:{ [TODAY]:{in:'08:00'} } },
      car2: { ride:{'3':{on:false}}, rideOff:{'3':{offOn:false}}, carlog:{records:[],plans:{}},
              delivDone:{'3':TODAY}, dropDone:{'3':TODAY}, att:{} }
    });
    const adm = phone(SRV, 'admin', {});
    await adm.R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 350));
    /* 실제 «회원» 수정 화면은 전역 members 를 고친 뒤 saveMembers(members) 를 부른다 —
       전역을 안 바꾸면 splitCarState 가 **옛 배정**을 보고 아무것도 안 옮긴다(처음에 그래서 실패). */
    await adm.R.ev("(function(){ members.forEach(function(m){ if(String(m.id)==='3') m.carId='car1'; });"
      + " localStorage.setItem('tkd_members', JSON.stringify(members)); saveMembers(members); })()");
    await new Promise((r) => setTimeout(r, 400));
    ck('다가을 탑승이 1호차로', JSON.stringify(SRV.carState.car1.ride['3']), '{"on":false}');
    ck('★ 2호차에서 빠졌다', JSON.stringify(SRV.carState.car2.ride['3'] || null), 'null');
    ck('다가을 납품 완료도 1호차로', JSON.stringify(SRV.carState.car1.delivDone['3']), '"'+TODAY+'"');
    ck('가하은(1) 은 그대로', JSON.stringify(SRV.carState.car1.ride['1']), '{"on":true}');
    ck('★ 1호차 출퇴근은 안 건드렸다', JSON.stringify(SRV.carState.car1.att[TODAY]), '{"in":"08:00"}');
  }

  console.log('\n⑧⑨ 둘러보기·읽기 전용 쓰기 0 · 규칙 전 틈이면 거짓');
  {
    const SRV = makeServer({ car1: { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},
      delivDone:{}, dropDone:{}, att:{} } });
    const demo = phone(SRV, 'admin', {});
    demo.R.sandbox._userOrgId = 'cosroad_demo';
    demo.R.ev("window._userOrgId='cosroad_demo';");
    const n0 = SRV.writes.length;
    ck('⑧ 둘러보기: 쓰기 0', await demo.R.ev('saveCarState()') === false
       && SRV.writes.length === n0, true);

    const SRV2 = makeServer({ car1: { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},
      delivDone:{}, dropDone:{}, att:{} } });
    const blocked = phone(SRV2, 'admin', { deny: true });
    await blocked.R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 300));
    await blocked.R.ev("(function(){ var st=loadRideState(); st['1']={on:false}; saveRideState(st); })()");
    await new Promise((r) => setTimeout(r, 250));
    ck('⑨ 쓰기 거부면 거짓을 돌려준다', await blocked.R.ev('saveCarState()'), false);
    ck('   그래서 migration 표시도 안 찍힌다', JSON.stringify(SRV2.data.migration || null), 'null');
  }

  console.log('\n⑩ 기사는 출퇴근(att)을 **아예 안 보낸다** (원본은 서버 punch)');
  {
    const src = fs.readFileSync('' + COS_ROOT + '/index.html', 'utf8');
    const m = src.match(/if\(currentMode==='driver'\)\{[\s\S]*?return await writeCarStatePatch/);
    ck('기사 가지에 mine.att 를 채우는 줄이 0',
      m ? (m[0].match(/mine\.att/g) || []).length : -1, 0);
    ck('기사 patch 는 withAtt=false', /carStatePatch\(_csBase\[cid\], mine, false\)/.test(src), true);
    ck('관리자 patch 는 withAtt=true', /carStatePatch\(_csBase\[ids\[i\]\], sp\.byCar\[ids\[i\]\], true\)/.test(src), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 Firestore(트랜잭션 포함) — 실제 쓰기 0 · 문자 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
