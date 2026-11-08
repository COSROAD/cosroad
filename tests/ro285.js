/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드58 보정1 — v284 의 「얹기·줄 세우기」가 만든 셋을 재현하고 고친다.
   ① 읽기 전용(기간 끝) 업체: 막힌 토글이 **화면에 그대로 남는다**
      (readOnlyBlocked → syncFromFirebase 로 되돌리는데, v284 얹기가 그 변경을 다시 얹는다)
   ② `_csSyncing` 이 **켜진 채 남는다**(try/finally 없음) → 그 뒤 저장이 조용히 안 올라간다
   ③ `saveCarState` 의 finally 가 **새 저장의 `_csSaveRun` 까지** 비운다 → 저장이 겹쳐 돈다
   ★ 대조 먼저 — 고치기 전(v284 · af68df3)에서 셋이 **실제로 그러한지** 보이고, 고친 뒤 본다.
   실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const OLD_REF = process.env.COS_SRC_OLD_REF || 'af68df3';   /* v284 — 고치기 전 */
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
const STAFF = [{ id: 'st1', name: '최도우미', role: '도우미', hasPin: true }];
const SUF = '__cosroad_default';
const TODAY = '2026-11-08';

function emptyCar(o) {
  return Object.assign({ ride: {}, rideOff: {}, carlog: { records: [], plans: {} },
                         delivDone: {}, dropDone: {}, att: {} }, o || {});
}
function makeServer(init) {
  return { carState: JSON.parse(JSON.stringify(init || {})), data: {}, backups: {},
           writes: [], listeners: [], hook: null, live: 0, maxLive: 0 };
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
  if (opt.ride) store['tkd_ridestate' + SUF] = JSON.stringify(opt.ride);
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
      SRV.live++; if (SRV.live > SRV.maxLive) SRV.maxLive = SRV.live;
      try {
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
        return await fn(tx);
      } finally { SRV.live--; }
    },
    onSnapshot: (ref, cb) => { listeners.push({ col: ref.col, key: ref.key, cb: cb }); return () => {}; }
  };
  R.sandbox._db = R.win._db = {};
  R.ev("currentMode='" + mode + "';");
  R.sandbox._userOrgId = 'cosroad_default';
  R.ev("window._userOrgId='cosroad_default';");
  /* 안내(alert)를 담는다 — 읽기 전용 안내가 떴는지 본다 */
  R.ev("window.__al=[]; alert=function(m){ window.__al.push(String(m)); };");
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

/* ── ① 읽기 전용 — 막힌 변경이 **화면에서 되돌아가야** 한다 ──────────────────── */
async function roRevert(src, mode, what) {
  const SRV = makeServer({ car1: emptyCar({ ride: { '1': { on: true }, '2': { on: true } } }) });
  SRV.data.staffAtt = {};
  const p = phone(SRV, mode, { src, carId: 'car1', ride: { '1': { on: true }, '2': { on: true } },
    members: mode === 'driver' ? MEMBERS.filter((m) => m.carId === 'car1') : MEMBERS });
  await p.R.ev('syncFromFirebase()');
  await wait(350);
  p.R.ev('_readOnlyMode = true; window.__al=[]; _roNoticeAt = 0;');
  if (what === 'att') {
    p.R.ev("(function(){var a=loadDriverAtt(); a['st1_" + TODAY + "']={in:'08:00'};"
         + " localStorage.setItem('tkd_driver_att', JSON.stringify(a));})()");
  } else {
    p.R.ev("(function(){var st=loadRideState(); st['1']={on:false};"
         + " localStorage.setItem('tkd_ridestate', JSON.stringify(st));})()");
  }
  const ok = await p.R.ev('saveCarState()');
  await wait(700);                       /* readOnlyBlocked 의 동기화까지 */
  return {
    돌려준값: String(ok),
    안내수: Number(p.R.ev('(window.__al||[]).length')),
    폰토글: p.R.ev("JSON.stringify(loadRideState()['1']||null)"),
    폰근태: p.R.ev("JSON.stringify((loadDriverAtt()||{})['st1_" + TODAY + "']||null)"),
    서버토글: JSON.stringify(SRV.carState.car1.ride['1']),
    쓴횟수: SRV.writes.filter((w) => /^tx /.test(w)).length
  };
}

/* ── ② 동기화 중간에 예외 — 표시가 켜진 채 남으면 그 뒤 저장이 안 간다 ────────── */
async function syncStuck(src) {
  const SRV = makeServer({ car1: emptyCar({ ride: { '1': { on: true } } }) });
  const a = phone(SRV, 'admin', { src, ride: { '1': { on: true } } });
  await a.R.ev('syncFromFirebase()');
  await wait(300);
  /* 동기화 구간 **안**에서 한 번 던진다(mergeCarState 는 그 구간에서 불린다) */
  a.R.ev("(function(){ var o=mergeCarState; var n=0;"
       + " mergeCarState=function(){ if(n++===0) throw new Error('일부러'); return o.apply(null,arguments); }; })()");
  let threw = false;
  try { await a.R.ev('syncFromFirebase()'); } catch (e) { threw = true; }
  await wait(300);
  const syncing = String(a.R.ev('String(_csSyncing)'));
  /* 그 뒤 평범한 저장이 서버에 가나 */
  a.R.ev("(function(){var st=loadRideState(); st['1']={on:false};"
       + " localStorage.setItem('tkd_ridestate', JSON.stringify(st));})()");
  const ok = await a.R.ev('saveCarState()');
  await wait(400);
  return { 던졌나: String(threw), 표시: syncing, 그뒤저장: String(ok),
           서버: JSON.stringify(SRV.carState.car1.ride['1']),
           쓴횟수: SRV.writes.filter((w) => /^tx /.test(w)).length };
}

/* ── ③ 줄 비우기 — **셋째 저장이 줄을 서나** ────────────────────────────────
   ★ `csQueueReset()` 은 **일부러** 앞 저장을 놓아준다(로그아웃·차량 바뀜) — 그래서
     저장1과 저장2 가 겹치는 것은 **정상**이다. 지시문이 말한 결함은 다른 것이다:
     저장1 의 `finally` 가 **저장2 의 표시까지** 비워, 그 뒤 저장3 이 줄을 안 서는 것.
   → 그래서 「저장1 이 끝난 뒤에도 저장2 의 표시가 살아 있나」와
     「저장3 이 줄을 서나(겹쳐 돌지 않나)」를 잰다. */
async function queueOverlap(src) {
  const SRV = makeServer({ car1: emptyCar({ ride: { '1': { on: true }, '2': { on: true } } }) });
  const a = phone(SRV, 'admin', { src, ride: { '1': { on: true }, '2': { on: true } } });
  await a.R.ev('syncFromFirebase()');
  await wait(300);
  /* ★ 저장1 은 **빨리**, 저장2 는 **오래** 걸리게 한다 — 그래야 「저장1 이 끝났는데
     저장2 는 아직 도는」 순간이 넉넉히 생긴다(40ms 차이로는 재기 어렵다). */
  let txN = 0;
  SRV.hook = async (where, ref) => {
    if (where !== 'tx' || ref.col !== 'carState') return;
    txN++;
    await wait(txN === 1 ? 200 : 900);
  };
  /* 저장1 시작 → (도는 중에) 줄 비우기 → 저장2 시작 */
  a.R.ev("(function(){var st=loadRideState(); st['1']={on:false};"
       + " localStorage.setItem('tkd_ridestate', JSON.stringify(st)); saveCarState();})()");
  await wait(40);
  a.R.ev('try{ csQueueReset(); }catch(e){}');
  a.R.ev("(function(){var st=loadRideState(); st['2']={on:false};"
       + " localStorage.setItem('tkd_ridestate', JSON.stringify(st)); saveCarState();})()");
  /* 저장1 이 끝날 즈음까지 기다린다(저장2 는 아직 돈다 — 둘의 시작이 40ms 차이다) */
  await wait(420);
  const handleAlive = String(a.R.ev('String(_csSaveRun !== null)'));
  /* 이제 저장3 — 줄을 서야 한다(저장2 가 아직 도는 중) */
  SRV.maxLive = 0;
  a.R.ev("(function(){var st=loadRideState(); st['1']={on:true};"
       + " localStorage.setItem('tkd_ridestate', JSON.stringify(st)); saveCarState();})()");
  await wait(2500);
  return { 저장2표시: handleAlive, 셋째뒤한꺼번에: SRV.maxLive,
           서버: JSON.stringify(SRV.carState.car1.ride['1']) };
}

(async () => {
  console.log('════ ① 읽기 전용 — 막힌 변경이 화면에서 되돌아가나');
  for (const [mode, what] of [['admin', 'ride'], ['driver', 'ride'], ['admin', 'att']]) {
    const tag = '[' + mode + '/' + what + '] ';
    const o = await roRevert(OLD_SRC, mode, what);
    console.log(tag + '옛 판(v284)');
    ck(tag + '안내가 떴다', o.안내수 >= 1, true);
    ck(tag + '서버에 안 썼다', o.쓴횟수, 0);
    if (what === 'att') ck(tag + '[옛] 폰에 **남아 있다**(안 되돌아감)', o.폰근태, '{"in":"08:00"}');
    else ck(tag + '[옛] 폰에 **남아 있다**(안 되돌아감)', o.폰토글, '{"on":false}');
  }

  console.log('\n════ ② 동기화 중간에 예외 — 표시가 켜진 채 남나');
  {
    const o = await syncStuck(OLD_SRC);
    ck('[옛] 동기화가 던졌다', o.던졌나, 'true');
    ck('[옛] `_csSyncing` 이 **켜진 채 남는다**', o.표시, 'true');
    ck('[옛] 그 뒤 저장이 거짓만 돌려준다', o.그뒤저장, 'false');
    ck('[옛] 서버에 안 올라갔다', o.쓴횟수, 0);
  }

  console.log('\n════ ③ 줄 비우기 뒤 저장이 겹쳐 도나');
  {
    const o = await queueOverlap(OLD_SRC);
    ck('[옛] 저장1 이 끝나면 저장2 의 표시가 **지워진다**', o.저장2표시, 'false');
    ck('[옛] 그래서 셋째 저장이 줄을 안 서고 겹쳐 돈다', o.셋째뒤한꺼번에 >= 2, true);
  }

  console.log('\n════ 고친 판 — 셋이 바로잡혔나');
  {
    for (const [mode, what] of [['admin', 'ride'], ['driver', 'ride'], ['admin', 'att']]) {
      const tag = '[' + mode + '/' + what + '] ';
      const n = await roRevert(E.SRC_NEW, mode, what);
      ck('★ ' + tag + '안내가 떴다', n.안내수 >= 1, true);
      ck('★ ' + tag + '서버에 안 썼다', n.쓴횟수, 0);
      if (what === 'att') ck('★ ' + tag + '폰이 **되돌아갔다**', n.폰근태, 'null');
      else ck('★ ' + tag + '폰이 **되돌아갔다**', n.폰토글, '{"on":true}');
    }
    const b = await syncStuck(E.SRC_NEW);
    ck('★ 동기화가 던져도 표시가 꺼진다', b.표시, 'false');
    ck('★ 그 뒤 저장이 올라간다', b.그뒤저장, 'true');
    ck('★   서버 값도 바뀌었다', b.서버, '{"on":false}');
    const c = await queueOverlap(E.SRC_NEW);
    ck('★ 저장1 이 끝나도 저장2 의 표시가 살아 있다', c.저장2표시, 'true');
    ck('★ 셋째 저장은 줄을 선다(한꺼번에 1개)', c.셋째뒤한꺼번에, 1);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  process.exit(fail ? 1 : 0);
})();
