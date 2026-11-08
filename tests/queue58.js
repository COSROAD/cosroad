/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드58 — 저장이 겹쳐도 **사용자의 마지막 동작이 남는가**.
   A 탑승 토글을 빠르게 두 번 (기사·관리자)
   B 차계부 계기판 km 수정 — 지우기 저장 + 같은 id 넣기 저장 (끝나는 순서가 뒤집혀도)
   C 로그인 동기화 중에 토글 — 서버에 있던 값이 폰의 옛 값으로 지워지지 않아야 한다
   ★ 대조 먼저 — 고치기 전(v283 · b55ae21)에서 셋이 **실제로 깨지는 것**을 보이고,
     고친 뒤 **마지막 동작이 남는지** 본다.
   가짜 Firestore 지만 runTransaction 은 진짜처럼 돈다 · 실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const OLD_REF = process.env.COS_SRC_OLD_REF || 'b55ae21';   /* v283 — 고치기 전 */
if (!('COS_SRC_NEW_REF' in process.env)) process.env.COS_SRC_NEW_REF = '';
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 44)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBERS = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '1', lat: 37.41, lon: 126.68, phone: '010-1' },
  { id: 2, name: '나여름', carId: 'car1', courseId: 'c1', days: D7, location: '2', lat: 37.43, lon: 126.70, phone: '010-2' }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-9-1' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const SUF = '__cosroad_default';

function emptyCar(o) {
  return Object.assign({ ride: {}, rideOff: {}, carlog: { records: [], plans: {} },
                         delivDone: {}, dropDone: {}, att: {} }, o || {});
}
function makeServer(init) {
  return { carState: JSON.parse(JSON.stringify(init || {})), data: {}, backups: {},
           writes: [], listeners: [], hook: null, afterTx: null };
}

function phone(SRV, mode, opt) {
  opt = opt || {};
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(opt.members || MEMBERS);
  store['tkd_cars' + SUF]    = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify(COURSES);
  store['tkd_org' + SUF]     = JSON.stringify({ name: '가온', icon: '🚐', bizType: 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  if (opt.ride)   store['tkd_ridestate' + SUF] = JSON.stringify(opt.ride);
  if (opt.carlog) store['tkd_carlog' + SUF]    = JSON.stringify(opt.carlog);
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
      if (SRV.hook) await SRV.hook('getDoc', ref);
      const src = SRV[ref.col] || {};
      const has = Object.prototype.hasOwnProperty.call(src, ref.key);
      return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
    },
    getDocs: async (ref) => {
      if (SRV.hook) await SRV.hook('getDocs', ref);
      return { forEach: (cb) => Object.keys(SRV[ref.col] || {}).forEach((k) =>
        cb({ id: k, data: () => ({ value: JSON.stringify(SRV[ref.col][k]) }) })) };
    },
    setDoc: async (ref, d) => {
      SRV[ref.col] = SRV[ref.col] || {};
      SRV.writes.push(ref.col + '/' + ref.key);
      SRV[ref.col][ref.key] = d.value !== undefined ? JSON.parse(d.value) : d;
      fire(ref.col, ref.key);
    },
    deleteDoc: async () => {},
    runTransaction: async (db, fn) => {
      const tx = {
        get: async (ref) => {
          if (SRV.hook) await SRV.hook('tx', ref);
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
      const out = await fn(tx);
      if (SRV.afterTx) await SRV.afterTx();
      return out;
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

/* ── A 빠르게 두 번 누름 (끄기 → 켜기). 마지막 누름(켜짐)이 남아야 한다 ───────── */
async function doubleTap(src, mode) {
  const SRV = makeServer({ car1: emptyCar({ ride: { '1': { on: true } } }) });
  const p = phone(SRV, mode, { src, carId: 'car1', ride: { '1': { on: true } },
    members: MEMBERS.filter((m) => m.carId === 'car1') });
  await p.R.ev('syncFromFirebase()');
  await wait(300);
  p.R.ev("(function(){var st=loadRideState(); st['1']={on:false}; saveRideState(st);"
       + " var s2=loadRideState(); s2['1']={on:true}; saveRideState(s2); })()");
  await wait(700);
  return { 폰: p.R.ev("JSON.stringify(loadRideState()['1'])"),
           서버: JSON.stringify(SRV.carState.car1.ride['1']),
           쓴횟수: SRV.writes.filter((w) => /^tx /.test(w)).length };
}

/* ── B 차계부 계기판 km 수정 — 끝나는 순서가 뒤집혀도 기록이 남아야 한다 ───────── */
async function carlogEdit(src, reverse) {
  const REC = { id: 'r1', carId: 'car1', type: 'odo', date: '2026-11-08', odo: 100, by: 'admin' };
  const SRV = makeServer({ car1: emptyCar({ carlog: { records: [REC], plans: {} } }) });
  const a = phone(SRV, 'admin', { src, carlog: { records: [REC], plans: {} } });
  await a.R.ev('syncFromFirebase()');
  await wait(300);
  if (reverse) {
    let first = true;
    SRV.hook = async (where, ref) => {
      if (where !== 'tx' || ref.col !== 'carState') return;
      if (first) { first = false; await wait(200); }
    };
  }
  /* ★ 실제 화면 함수(`saveCarlogEntry`)를 그대로 부른다 — 「계기판 km 수정」이 하는 그 길.
     (`saveCarlog` 를 직접 두 번 부르면 **모으기**(`_carlogHold`)를 거치지 않는다.) */
  ['cl-date', 'cl-odo'].forEach((id) => { const e = E.makeEl('input'); e.id = id; a.R.byId[id] = e; });
  a.R.byId['cl-date'].value = '2026-11-08';
  a.R.byId['cl-odo'].value = '777';
  a.R.ev("carlogSelCar='car1'; carlogType='odo'; carlogOdoWhen='end'; carlogEditId='r1';");
  a.R.ev("(function(){ try{ saveCarlogEntry(); }catch(e){ window.__err=String(e&&e.message); } })()");
  await wait(900);
  const recs = (SRV.carState.car1.carlog || {}).records || [];
  return { 기록수: recs.length, 계기판: recs.length ? String(recs[0].odo) : '없음',
           쓴횟수: SRV.writes.filter((w) => /^tx /.test(w)).length };
}

/* ── B-2 (지어낸 장면) 같은 id 로 「지우기 저장 + 넣기 저장」을 연달아 ───────────
   ★ 코스로드54 보고문이 B 로 적은 그 장면이다. **실제 화면 함수는 새 id 를 쓴다**(위 B-1) —
     그래서 이 장면은 「같은 id 로 지우고 다시 넣는 코드를 누군가 새로 쓰면」의 대비다.
     저장이 한 줄로 서면 이 장면도 안전해진다. */
async function carlogEditSameId(src, reverse) {
  const REC = { id: 'r1', carId: 'car1', type: 'odo', date: '2026-11-08', odo: 100, by: 'admin' };
  const SRV = makeServer({ car1: emptyCar({ carlog: { records: [REC], plans: {} } }) });
  const a = phone(SRV, 'admin', { src, carlog: { records: [REC], plans: {} } });
  await a.R.ev('syncFromFirebase()');
  await wait(300);
  if (reverse) {
    let first = true;
    SRV.hook = async (where, ref) => {
      if (where !== 'tx' || ref.col !== 'carState') return;
      if (first) { first = false; await wait(200); }
    };
  }
  a.R.ev("(function(){"
    + " var d0=loadCarlog(); d0.records=d0.records.filter(function(r){return r.id!=='r1';});"
    + " saveCarlog(d0);"
    + " var d1=loadCarlog(); d1.records.push({id:'r1',carId:'car1',type:'odo',"
    + "   date:'2026-11-08',odo:777,by:'admin'}); saveCarlog(d1);"
    + "})()");
  await wait(900);
  const recs = (SRV.carState.car1.carlog || {}).records || [];
  return { 기록수: recs.length, 계기판: recs.length ? String(recs[0].odo) : '없음',
           쓴횟수: SRV.writes.filter((w) => /^tx /.test(w)).length };
}

/* ── C 로그인 동기화 중에 저장 — 서버 값이 폰의 옛 빈 값으로 지워지면 안 된다 ──── */
async function syncWindow(src) {
  const SRV = makeServer({ car1: emptyCar({ ride: { '1': { on: true }, '2': { on: true } } }) });
  const a = phone(SRV, 'admin', { src, ride: {} });     /* 폰은 아무것도 모른다(옛 값) */
  let did = false;
  SRV.hook = async (where, ref) => {
    if (did || ref.key !== 'products') return;          /* 기준본을 넣은 **뒤**에 오는 읽기 */
    did = true;
    await a.R.ev('saveCarState()');
  };
  await a.R.ev('syncFromFirebase()');
  await wait(600);
  return { 끼어들었나: did,
           서버1: JSON.stringify(SRV.carState.car1.ride['1'] || null),
           서버2: JSON.stringify(SRV.carState.car1.ride['2'] || null),
           쓴횟수: SRV.writes.filter((w) => /^tx /.test(w)).length };
}

/* ── 겹치지 않을 때는 종전과 같다 ─────────────────────────────────── */
async function plain(src) {
  const SRV = makeServer({
    car1: emptyCar({ ride: { '1': { on: true } } }),
    car2: emptyCar({ ride: { '3': { on: true } } })
  });
  SRV.data.staffAtt = {};
  const a = phone(SRV, 'admin', { src, ride: { '1': { on: true } } });
  await a.R.ev('syncFromFirebase()');
  await wait(300);
  a.R.ev("(function(){var st=loadRideState(); st['1']={on:false}; st['3']={on:false};"
       + " localStorage.setItem('tkd_ridestate', JSON.stringify(st));"
       + "var at=loadDriverAtt(); at['st1_2026-11-08']={in:'09:00'};"
       + " localStorage.setItem('tkd_driver_att', JSON.stringify(at));})()");
  const ok = await a.R.ev('saveCarState()');
  await wait(300);
  return { ok: String(ok),
           car1: JSON.stringify(SRV.carState.car1.ride['1']),
           car2: JSON.stringify(SRV.carState.car2.ride['3']),
           st: JSON.stringify((SRV.data.staffAtt || {})['st1_2026-11-08'] || null),
           쓴횟수: SRV.writes.filter((w) => /^tx /.test(w)).length };
}

/* ── D 읽기 전용(기간 끝)·둘러보기에서는 **줄에 남지 않는다** (지시문 조사 3) ────── */
async function blockedNotQueued(src, kind) {
  const SRV = makeServer({ car1: emptyCar({ ride: { '1': { on: true } } }) });
  const a = phone(SRV, 'admin', { src, ride: { '1': { on: true } } });
  await a.R.ev('syncFromFirebase()');
  await wait(300);
  if (kind === 'ro') a.R.ev('_readOnlyMode = true;');
  else a.R.ev("window._userOrgId='cosroad_demo';");
  a.R.ev("(function(){var st=loadRideState(); st['1']={on:false};"
       + " localStorage.setItem('tkd_ridestate', JSON.stringify(st));})()");
  const ok = await a.R.ev('saveCarState()');
  await wait(300);
  const queued = a.R.ev('String(_csSaveAgain) + "/" + String(_csSaveRun !== null)');
  return { 돌려준값: String(ok), 줄: String(queued),
           쓴횟수: SRV.writes.filter((w) => /^tx /.test(w)).length };
}

/* ── E 로그아웃하면 **줄을 비운다** — 다음 사람 문서로 가지 않는다 (지시문 조사 4) ──── */
async function logoutClearsQueue(src) {
  const SRV = makeServer({ car1: emptyCar({ ride: { '1': { on: true } } }) });
  const a = phone(SRV, 'admin', { src, ride: { '1': { on: true } } });
  await a.R.ev('syncFromFirebase()');
  await wait(300);
  /* 저장이 도는 **사이에** 한 번 더 눌러 줄에 쌓고, 그 상태로 로그아웃한다 */
  SRV.hook = async (where, ref) => { if (where === 'tx' && ref.col === 'carState') await wait(150); };
  a.R.ev("(function(){var st=loadRideState(); st['1']={on:false};"
       + " localStorage.setItem('tkd_ridestate', JSON.stringify(st)); saveCarState();"
       + " var s2=loadRideState(); s2['1']={on:true};"
       + " localStorage.setItem('tkd_ridestate', JSON.stringify(s2)); saveCarState();})()");
  await wait(60);
  const before = a.R.ev('String(_csSaveAgain)');
  a.R.ev('try{ csQueueReset(); }catch(e){}');         /* logout() 이 부르는 그 한 줄 */
  const after = a.R.ev('String(_csSaveAgain)');
  await wait(600);
  return { 쌓였었나: String(before), 비웠나: String(after) };
}

(async () => {
  console.log('════ 대조 — 고치기 전(v283 · ' + OLD_REF + ')에서 깨진다');
  {
    for (const mode of ['driver', 'admin']) {
      const o = await doubleTap(OLD_SRC, mode);
      console.log('A [' + mode + ']');
      ck('[옛] 폰이 **첫 누름**으로 남는다(마지막 누름 사라짐)', o.폰, '{"on":false}');
      ck('[옛] 서버도 첫 누름', o.서버, '{"on":false}');
      ck('[옛] 트랜잭션 1번', o.쓴횟수, 1);
    }
    const b = await carlogEdit(OLD_SRC, true);
    console.log('B-1 실제 화면 함수(saveCarlogEntry)');
    /* ★ 정정 — 실제 흐름은 다시 넣을 때 **새 id** 를 쓴다(carlogSetDailyOdo 가 만든다).
       그래서 뒤늦은 「지우기」가 **다른 id** 를 지워 기록이 **사라지지 않는다**.
       코스로드54 보고문의 B(「기록이 사라진다」)는 **같은 id 장면**(아래 B-2)에서만 맞다. */
    ck('[옛] 기록은 남는다(새 id 라서) — 54 보고 정정', b.기록수, 1);
    ck('[옛] 그러나 저장이 **여러 번** 따로 돈다', b.쓴횟수 > 1, true);
    const b0 = await carlogEditSameId(OLD_SRC, true);
    console.log('B-2 같은 id 장면(54 보고문이 쓴 그 장면)');
    ck('[옛] 순서가 뒤집히면 기록이 사라진다', b0.기록수, 0);
    const c = await syncWindow(OLD_SRC);
    console.log('C');
    ck('[옛] 저장이 동기화 중에 끼어들었다', c.끼어들었나, 'true');
    ck('[옛] 서버 «회원»1 탑승이 지워진다', c.서버1, 'null');
    ck('[옛] 서버 «회원»2 탑승이 지워진다', c.서버2, 'null');
  }

  console.log('\n════ 고친 판 — 마지막 동작이 남는다');
  {
    for (const mode of ['driver', 'admin']) {
      const n = await doubleTap(E.SRC_NEW, mode);
      console.log('A [' + mode + ']');
      ck('★ 폰이 **마지막 누름**대로', n.폰, '{"on":true}');
      ck('★ 서버도 마지막 누름대로', n.서버, '{"on":true}');
      ck('  (저장은 줄을 서서 두 번 돈다)', n.쓴횟수 >= 2, true);
    }
    const b1 = await carlogEdit(E.SRC_NEW, false);
    const b2 = await carlogEdit(E.SRC_NEW, true);
    console.log('B-1 실제 화면 함수');
    ck('★ 순서대로여도 기록 1개 · 고친 값', b1.기록수 + '/' + b1.계기판, '1/777');
    ck('★ 순서가 뒤집혀도 기록 1개 · 고친 값', b2.기록수 + '/' + b2.계기판, '1/777');
    ck('★ 저장이 **한 번**으로 줄었다', b1.쓴횟수, 1);
    const b3 = await carlogEditSameId(E.SRC_NEW, true);
    console.log('B-2 같은 id 장면');
    ck('★ 순서가 뒤집혀도 기록이 남는다(줄 세우기 덕분)', b3.기록수, 1);
    ck('★   고친 값으로', b3.계기판, '777');
    const c = await syncWindow(E.SRC_NEW);
    console.log('C');
    ck('★ 저장은 똑같이 끼어들었다(같은 장면)', c.끼어들었나, 'true');
    ck('★ 서버 «회원»1 탑승 **그대로**', c.서버1, '{"on":true}');
    ck('★ 서버 «회원»2 탑승 **그대로**', c.서버2, '{"on":true}');
    ck('★ 동기화 중에는 아무것도 안 썼다', c.쓴횟수, 0);
  }

  console.log('\n════ 겹치지 않을 때는 종전과 같다');
  {
    const o = await plain(OLD_SRC), n = await plain(E.SRC_NEW);
    /* ★ 2호차는 이 폰의 «회원» 목록에 3번이 없어 담기지 않는다 — 그래서 쓰기는 둘(1호차+직원 근태).
       숫자를 박지 말고 **옛 판과 같은지**로 본다. */
    ck('쓴 횟수 같다', n.쓴횟수 + '/' + o.쓴횟수, o.쓴횟수 + '/' + o.쓴횟수);
    ck('1호차 토글 같다', n.car1, o.car1);
    ck('2호차는 서버 값 그대로 (둘 다)', n.car2, o.car2);
    ck('직원 근태 같다', n.st, o.st);
    ck('돌려준 값 같다(참)', n.ok + '/' + o.ok, 'true/true');
  }

  console.log('\n════ D 막힌 저장은 **줄에 남지 않는다** (읽기 전용·둘러보기)');
  {
    for (const kind of ['ro', 'demo']) {
      const r = await blockedNotQueued(E.SRC_NEW, kind);
      ck('[' + kind + '] 거짓을 돌려준다(안 썼다)', r.돌려준값, 'false');
      ck('[' + kind + '] 줄이 비어 있다(한번더/도는중)', r.줄, 'false/false');
      ck('[' + kind + '] 서버에 안 썼다', r.쓴횟수, 0);
    }
  }

  console.log('\n════ E 로그아웃·차량 바뀜이면 **줄을 비운다**');
  {
    const r = await logoutClearsQueue(E.SRC_NEW);
    ck('줄에 「한 번 더」가 쌓였었다', r.쌓였었나, 'true');
    ck('csQueueReset() 이 비웠다', r.비웠나, 'false');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  process.exit(fail ? 1 : 0);
})();
