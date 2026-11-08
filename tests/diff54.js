/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드54 — 「바뀐 칸만」 저장의 **차이표를 만드는 시점**.
   무엇을 보나: `saveCarState()` 가 **기다리는 사이에** 리스너가 기준본(`_csBase`·`_saBase`)을
   바꾸면, 그 뒤에 만든 차이표가 **방금 서버가 찍은 칸을 「지움」으로 계산**한다.
   ★ 대조 먼저 — 고치기 전 판(v282 · f279101)에서 셋이 **정말 지워지는지** 보이고,
     고친 판에서 **남는지** 본다. 재현이 안 되면 고치지 않는다(검증 3원칙 B·C).
   가짜 Firestore 지만 runTransaction 은 진짜처럼 돈다(읽고→고치고→쓰기).
   실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const OLD_REF = process.env.COS_SRC_OLD_REF || 'f279101';   /* v282 — 고치기 전 */
if (!('COS_SRC_NEW_REF' in process.env)) process.env.COS_SRC_NEW_REF = '';   /* 새 쪽 = 작업트리 */
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 48)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '1', lat: 37.41, lon: 126.68, phone: '010-1' },
  { id: 2, name: '나여름', carId: 'car1', courseId: 'c1', days: D7, location: '2', lat: 37.43, lon: 126.70, phone: '010-2' },
  { id: 3, name: '다가을', carId: 'car2', courseId: 'c1', days: D7, location: '3', lat: 37.45, lon: 126.73, phone: '010-3' }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-9-1' },
              { id: 'car2', name: '2호차', driver: '김기사', phone: '010-9-2' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const STAFF = [{ id: 'st1', name: '최도우미', role: '도우미', hasPin: true }];
const SUF = '__cosroad_default';
const TODAY = '2026-11-08';

function emptyCar(o) {
  return Object.assign({ ride: {}, rideOff: {}, carlog: { records: [], plans: {} },
                         delivDone: {}, dropDone: {}, att: {} }, o || {});
}
function makeServer(init) {
  return { carState: JSON.parse(JSON.stringify(init || {})), data: {}, backups: {},
           writes: [], listeners: [], hook: null };
}

function phone(SRV, mode, opt) {
  opt = opt || {};
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(opt.members || MEMBERS);
  store['tkd_cars' + SUF]    = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify(COURSES);
  store['tkd_staff' + SUF]   = JSON.stringify(STAFF);
  store['tkd_org' + SUF]     = JSON.stringify({ name: '가온', icon: '🚐', bizType: 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  const R = E.build({ src: opt.src || E.SRC_NEW, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-screen', 'admin-screen', 'fb-loading', 'member-screen',
   'member-list', 'main-header', 'today-date', 'org-name-display', 'org-icon', 'login-screen',
   'main-app', 'bottom-action', 'mode-badge', 'header-btns', 'filter-chips', 'search-input',
   'day-tabs', 'member-add-area', 'drive-tabs']
   .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });
  const listeners = SRV.listeners;
  const fire = (col, onlyKey) => {
    listeners.filter((l) => l.col === col).forEach((l) => {
      if (onlyKey !== undefined && l.key !== undefined && l.key !== onlyKey) return;
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
  SRV.fire = fire;
  R.sandbox._firestore = R.win._firestore = {
    doc: (db, c1, o, c2, k) => ({ col: c2, key: k }),
    collection: (db, c1, o, c2) => ({ col: c2 }),
    getDoc: async (ref) => {
      /* ★ 기다리는 사이에 일이 벌어지는 자리 — 기사 갈래의 백업 읽기가 여기다 */
      if (SRV.hook) SRV.hook('getDoc', ref);
      const src = SRV[ref.col] || {};
      const has = Object.prototype.hasOwnProperty.call(src, ref.key);
      return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
    },
    getDocs: async (ref) => ({
      forEach: (cb) => Object.keys(SRV[ref.col] || {}).forEach((k) =>
        cb({ id: k, data: () => ({ value: JSON.stringify(SRV[ref.col][k]) }) }))
    }),
    setDoc: async (ref, d) => {
      SRV[ref.col] = SRV[ref.col] || {};
      SRV.writes.push(ref.col + '/' + ref.key);
      SRV[ref.col][ref.key] = d.value !== undefined ? JSON.parse(d.value) : d;
      fire(ref.col, ref.key);
    },
    deleteDoc: async () => {},
    runTransaction: async (db, fn) => {
      let seen = null;
      const tx = {
        get: async (ref) => {
          seen = ref;
          /* ★ 기다리는 사이 — 관리자 갈래의 차량 쓰기가 여기다 */
          if (SRV.hook) SRV.hook('tx', ref);
          const src = SRV[ref.col] || {};
          const has = Object.prototype.hasOwnProperty.call(src, ref.key);
          return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
        },
        set: (ref, d) => {
          SRV[ref.col] = SRV[ref.col] || {};
          SRV.writes.push('tx ' + ref.col + '/' + ref.key);
          SRV[ref.col][ref.key] = JSON.parse(d.value);
          fire(ref.col, ref.key);
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 장면 ① 관리자 · 둘째 차량 — 앞 차량을 쓰는 사이에 서버 punch 가 찍힌다 ───── */
async function sceneAdminCar(src) {
  const SRV = makeServer({
    car1: emptyCar({ ride: { '1': { on: true }, '2': { on: true } } }),
    car2: emptyCar({ ride: { '3': { on: true } } })
  });
  const a = phone(SRV, 'admin', { src });
  await a.R.ev('syncFromFirebase()');
  await wait(350);
  /* 관리자가 1호차 «회원» 의 탑승을 끈다 (폰에만 — 저장은 아래에서 한 번만) */
  a.R.ev("(function(){var st=loadRideState(); st['1']={on:false};"
       + " localStorage.setItem('tkd_ridestate', JSON.stringify(st));})()");
  /* 1호차를 쓰는 **그 사이에** 서버 punch 가 2호차 기사 출근을 찍고 리스너가 온다 */
  let fired = false;
  SRV.hook = (where, ref) => {
    if (fired || where !== 'tx' || ref.col !== 'carState' || ref.key !== 'car1') return;
    fired = true;
    SRV.carState.car2.att = { [TODAY]: { in: '08:00' } };
    SRV.fire('carState');
  };
  const ok = await a.R.ev('saveCarState()');
  await wait(250);
  return {
    출근: JSON.stringify((SRV.carState.car2.att || {})[TODAY] || null),
    끈토글: JSON.stringify(SRV.carState.car1.ride['1']),
    리스너왔나: fired,
    돌려준값: String(ok)
  };
}

/* ── 장면 ② 관리자 · 직원 근태 — 차량 쓰기가 끝난 뒤에 차이표를 만든다 ───────── */
async function sceneStaffAtt(src) {
  const SRV = makeServer({
    car1: emptyCar({ ride: { '1': { on: true }, '2': { on: true } } }),
    car2: emptyCar({ ride: { '3': { on: true } } })
  });
  SRV.data.staffAtt = {};
  const a = phone(SRV, 'admin', { src });
  await a.R.ev('syncFromFirebase()');
  await wait(350);
  a.R.ev("(function(){var st=loadRideState(); st['1']={on:false};"
       + " localStorage.setItem('tkd_ridestate', JSON.stringify(st));})()");
  /* 차량을 쓰는 사이에 서버 punchStaff 가 도우미 출근을 찍고 리스너가 온다 */
  let fired = false;
  SRV.hook = (where, ref) => {
    if (fired || where !== 'tx' || ref.col !== 'carState') return;
    fired = true;
    SRV.data.staffAtt = { ['st1_' + TODAY]: { in: '08:10' } };
    SRV.fire('data', 'staffAtt');
  };
  await a.R.ev('saveCarState()');
  await wait(250);
  return {
    도우미출근: JSON.stringify((SRV.data.staffAtt || {})['st1_' + TODAY] || null),
    리스너왔나: fired
  };
}

/* ── 장면 ③ 기사 — 백업 읽기를 기다리는 사이에 관리자 토글이 온다 ────────────── */
async function sceneDriver(src) {
  const SRV = makeServer({
    car1: emptyCar({ ride: { '1': { on: true }, '2': { on: true } } })
  });
  const d = phone(SRV, 'driver', { src, carId: 'car1',
    members: MEMBERS.filter((m) => m.carId === 'car1') });
  await d.R.ev('syncFromFirebase()');
  await wait(350);
  /* 기사가 «회원»1 탑승을 끈다 (폰에만) */
  d.R.ev("(function(){var st=loadRideState(); st['1']={on:false};"
       + " localStorage.setItem('tkd_ridestate', JSON.stringify(st));})()");
  /* 백업 읽기(getDoc)를 기다리는 **그 사이에** 관리자가 «회원»2 를 끄고 리스너가 온다 */
  let fired = false;
  SRV.hook = (where, ref) => {
    if (fired || where !== 'getDoc' || ref.col !== 'carState') return;
    fired = true;
    SRV.carState.car1.ride['2'] = { on: false };
    SRV.fire('carState');
  };
  await d.R.ev('saveCarState()');
  await wait(250);
  return {
    관리자토글: JSON.stringify(SRV.carState.car1.ride['2']),
    기사토글: JSON.stringify(SRV.carState.car1.ride['1']),
    리스너왔나: fired
  };
}

(async () => {
  console.log('════ 대조 — 고치기 전 판(v282 · ' + OLD_REF + ')에서 정말 지워지나');
  let oldA, oldB, oldC;
  {
    oldA = await sceneAdminCar(OLD_SRC);
    console.log('① 관리자 · 둘째 차량');
    ck('[옛] 리스너가 기다리는 사이에 왔다', oldA.리스너왔나, 'true');
    ck('[옛] 서버 punch 출근이 **지워진다**', oldA.출근, 'null');
    ck('[옛]   내가 끈 토글은 들어갔다', oldA.끈토글, '{"on":false}');

    oldB = await sceneStaffAtt(OLD_SRC);
    console.log('② 관리자 · 직원 근태');
    ck('[옛] 리스너가 기다리는 사이에 왔다', oldB.리스너왔나, 'true');
    ck('[옛] 도우미 출근이 **지워진다**', oldB.도우미출근, 'null');

    oldC = await sceneDriver(OLD_SRC);
    console.log('③ 기사 · 백업 읽기 뒤');
    ck('[옛] 리스너가 기다리는 사이에 왔다', oldC.리스너왔나, 'true');
    ck('[옛] 관리자가 끈 토글이 **되살아난다**', oldC.관리자토글, '{"on":true}');
    ck('[옛]   내가 끈 토글은 들어갔다', oldC.기사토글, '{"on":false}');
  }

  console.log('\n════ 고친 판 — 차이표를 첫 기다림 **앞에서 한꺼번에** 만든다');
  {
    const a = await sceneAdminCar(E.SRC_NEW);
    console.log('① 관리자 · 둘째 차량');
    ck('★ 리스너는 똑같이 왔다(같은 장면이다)', a.리스너왔나, 'true');
    ck('★ 서버 punch 출근 **그대로**', a.출근, '{"in":"08:00"}');
    ck('★   내가 끈 토글도 들어간다', a.끈토글, '{"on":false}');
    ck('★   돌려준 값은 참', a.돌려준값, 'true');

    const b = await sceneStaffAtt(E.SRC_NEW);
    console.log('② 관리자 · 직원 근태');
    ck('★ 리스너는 똑같이 왔다', b.리스너왔나, 'true');
    ck('★ 도우미 출근 **그대로**', b.도우미출근, '{"in":"08:10"}');

    const c = await sceneDriver(E.SRC_NEW);
    console.log('③ 기사 · 백업 읽기 뒤');
    ck('★ 리스너는 똑같이 왔다', c.리스너왔나, 'true');
    ck('★ 관리자가 끈 토글 **그대로**', c.관리자토글, '{"on":false}');
    ck('★   내가 끈 토글도 들어간다', c.기사토글, '{"on":false}');
  }

  console.log('\n════ 그 밖에 바뀌지 않았나 (기다림이 없을 때는 종전과 같다)');
  {
    /* 리스너가 안 오면 옛 판·새 판이 **같은 결과**여야 한다 */
    const plain = async (src) => {
      const SRV = makeServer({
        car1: emptyCar({ ride: { '1': { on: true }, '2': { on: true } } }),
        car2: emptyCar({ ride: { '3': { on: true } } })
      });
      SRV.data.staffAtt = {};
      const a = phone(SRV, 'admin', { src });
      await a.R.ev('syncFromFirebase()');
      await wait(350);
      a.R.ev("(function(){var st=loadRideState(); st['1']={on:false}; st['3']={on:false};"
           + " localStorage.setItem('tkd_ridestate', JSON.stringify(st));"
           + "var at=loadDriverAtt(); at['st1_" + TODAY + "']={in:'09:00'};"
           + " localStorage.setItem('tkd_driver_att', JSON.stringify(at));})()");
      const ok = await a.R.ev('saveCarState()');
      await wait(200);
      return { ok: String(ok),
               car1: JSON.stringify(SRV.carState.car1.ride['1']),
               car2: JSON.stringify(SRV.carState.car2.ride['3']),
               st: JSON.stringify((SRV.data.staffAtt || {})['st1_' + TODAY] || null),
               쓴횟수: SRV.writes.filter((w) => /^tx /.test(w)).length };
    };
    const o = await plain(OLD_SRC), n = await plain(E.SRC_NEW);
    ck('두 차량 + 직원 근태를 다 쓴다 — 옛', o.쓴횟수, 3);
    ck('                            새', n.쓴횟수, 3);
    ck('1호차 토글 같다', n.car1, o.car1);
    ck('2호차 토글 같다', n.car2, o.car2);
    ck('직원 근태 같다', n.st, o.st);
    ck('돌려준 값 같다(참)', n.ok + '/' + o.ok, 'true/true');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  process.exit(fail ? 1 : 0);
})();
