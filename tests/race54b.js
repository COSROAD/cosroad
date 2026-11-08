/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드54 연관 조사 — **고치지 않고 재현만** 한다(CLAUDE.md 절대 규칙 6).
   보는 것 셋:
     ① `syncFromFirebase` 가 기준본을 먼저 넣고 로컬은 **여러 await 뒤에** 넣는다.
        그 사이에 저장이 돌면 어떻게 되나.
     ③ 늦게 끝난 쓰기(`_csSetBase(cid, written)`)가 **더 새 리스너 값**을 옛 값으로 덮나.
     ⑤ 빠르게 두 번 누른 탑승 토글(끄기→켜기)이 **마지막 누름대로** 남나.
   ★ 셋을 **고치기 전(v282 · f279101)과 고친 뒤(작업트리)에서 똑같이** 재서,
     54 의 고침이 이 셋을 바꾸는지/안 바꾸는지 **숫자로** 적는다.
   실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const OLD_REF = process.env.COS_SRC_OLD_REF || 'f279101';   /* v282 — 고치기 전 */
if (!('COS_SRC_NEW_REF' in process.env)) process.env.COS_SRC_NEW_REF = '';
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 46)
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
           writes: [], listeners: [], hook: null };
}

function phone(SRV, mode, opt) {
  opt = opt || {};
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(opt.members || MEMBERS);
  store['tkd_cars' + SUF]    = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify(COURSES);
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
      /* ★ ③ 을 위한 자리 — 쓰기가 **끝나고 돌아가기 직전**에 더 새 값이 온다 */
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

/* ── ① 로그인 동기화 중에 저장이 돌면 ──────────────────────────────────
   기준본은 `loadAllCarState()`(앞)에서 넣고, 로컬은 **여러 await 뒤**에 넣는다.
   그 틈에 저장이 돌면 「기준본=서버 최신 / 로컬=폰의 옛 값」으로 차이표를 만든다. */
async function syncWindow(src) {
  const SRV = makeServer({ car1: emptyCar({ ride: { '1': { on: true }, '2': { on: true } } }) });
  /* 폰에는 **옛 값**이 들어 있다 — 서버에는 둘 다 켜져 있는데 폰은 아무것도 모른다 */
  const a = phone(SRV, 'admin', { src, ride: {} });
  let did = false;
  SRV.hook = async (where, ref) => {
    /* 기준본을 넣은 **뒤**에 오는 읽기(products)에서 저장을 끼워 넣는다 */
    if (did || ref.key !== 'products') return;
    did = true;
    await a.R.ev('saveCarState()');
  };
  await a.R.ev('syncFromFirebase()');
  await wait(400);
  return { 끼어들었나: did,
           서버1: JSON.stringify(SRV.carState.car1.ride['1'] || null),
           서버2: JSON.stringify(SRV.carState.car1.ride['2'] || null),
           쓴횟수: SRV.writes.filter((w) => /^tx /.test(w)).length };
}

/* ── ③ 늦게 끝난 쓰기가 더 새 리스너 값을 옛 값으로 덮나 ─────────────────
   쓰기가 끝나고 `_csSetBase(cid, written)` 로 돌아가기 **직전**에
   다른 사람이 쓴 더 새 값(리스너)이 온다 → 기준본이 **옛 것**으로 되돌아가나. */
async function lateWrite(src) {
  const SRV = makeServer({ car1: emptyCar({ ride: { '1': { on: true } } }) });
  const a = phone(SRV, 'admin', { src, ride: { '1': { on: true } } });
  await a.R.ev('syncFromFirebase()');
  await wait(300);
  a.R.ev("(function(){var st=loadRideState(); st['1']={on:false};"
       + " localStorage.setItem('tkd_ridestate', JSON.stringify(st));})()");
  let once = false;
  SRV.afterTx = async () => {
    if (once) return; once = true;
    /* 서버 punch 가 출근을 찍고 리스너가 **쓰기가 끝나는 순간** 온다 */
    SRV.carState.car1.att = { '2026-11-08': { in: '08:00' } };
    SRV.fire('carState');
  };
  await a.R.ev('saveCarState()');
  await wait(250);
  /* 기준본에 그 출근이 들어 있나? 없으면 **다음 저장이 그것을 지운다** */
  const base = a.R.ev("JSON.stringify((_csBase['car1']||{}).att||{})");
  /* 그래서 바로 한 번 더 저장해 본다(관리자가 «회원» 하나 더 고친 상황) */
  a.R.ev("(function(){var st=loadRideState(); st['1']={on:true};"
       + " localStorage.setItem('tkd_ridestate', JSON.stringify(st));})()");
  await a.R.ev('saveCarState()');
  await wait(250);
  return { 기준본에출근: /08:00/.test(String(base)) ? '있다' : '없다',
           서버출근: JSON.stringify((SRV.carState.car1.att || {})['2026-11-08'] || null) };
}

/* ── ⑤ 빠르게 두 번 누른 탑승 토글 ───────────────────────────────────
   끄기 → (기다리지 않고) 켜기. 마지막 누름(켜짐)대로 서버에 남아야 한다. */
async function doubleTap(src, mode) {
  const SRV = makeServer({ car1: emptyCar({ ride: { '1': { on: true } } }) });
  const p = phone(SRV, mode, { src, carId: 'car1', ride: { '1': { on: true } },
    members: MEMBERS.filter((m) => m.carId === 'car1') });
  await p.R.ev('syncFromFirebase()');
  await wait(300);
  /* 두 번 누름 — 앱이 하는 그대로 `saveRideState` 를 **기다리지 않고** 두 번 */
  p.R.ev("(function(){var st=loadRideState(); st['1']={on:false}; saveRideState(st);"
       + " var s2=loadRideState(); s2['1']={on:true}; saveRideState(s2); })()");
  await wait(500);
  return { 폰: JSON.stringify(p.R.ev("JSON.stringify(loadRideState()['1'])")),
           서버: JSON.stringify(SRV.carState.car1.ride['1']),
           쓴횟수: SRV.writes.filter((w) => /^tx /.test(w)).length };
}

/* ── ⑥ 차계부 계기판 km **수정** — 지우기 저장 + 넣기 저장을 기다리지 않고 연달아 ─────
   `index.html` 14606·14616 근처: `saveCarlog(d0)`(그 기록 지우기) → `carlogSetDailyOdo*`
   (같은 id 로 다시 넣기) → 둘 다 `saveCarState()` 를 **기다리지 않고** 부른다.
   쓰기가 **시작한 순서대로** 끝나면 맞지만, **뒤집히면** 뒤늦은 「지우기」가 방금 넣은 것을 지운다. */
async function carlogEdit(src, reverse) {
  const REC = { id: 'r1', carId: 'car1', type: 'odo', date: '2026-11-08', odo: 100, by: 'admin' };
  const SRV = makeServer({ car1: emptyCar({ carlog: { records: [REC], plans: {} } }) });
  const a = phone(SRV, 'admin', { src });
  await a.R.ev('syncFromFirebase()');
  await wait(300);
  if (reverse) {
    /* 첫 트랜잭션만 늦게 끝나게 만든다(네트워크가 뒤집힌 상황) */
    let first = true;
    SRV.hook = async (where, ref) => {
      if (where !== 'tx' || ref.col !== 'carState') return;
      if (first) { first = false; await wait(200); }
    };
  }
  /* 「계기판 km 수정」이 하는 그대로 — 지우고 저장 → 같은 id 로 다시 넣고 저장 */
  a.R.ev("(function(){"
    + " var d0=loadCarlog(); d0.records=d0.records.filter(function(r){return r.id!=='r1';});"
    + " saveCarlog(d0);"
    + " var d1=loadCarlog(); d1.records.push({id:'r1',carId:'car1',type:'odo',"
    + "   date:'2026-11-08',odo:777,by:'admin'}); saveCarlog(d1);"
    + "})()");
  await wait(600);
  const recs = (SRV.carState.car1.carlog || {}).records || [];
  return { 기록수: recs.length, 계기판: recs.length ? String(recs[0].odo) : '없음',
           쓴횟수: SRV.writes.filter((w) => /^tx /.test(w)).length };
}

(async () => {
  console.log('════ ① 로그인 동기화 중에 저장이 돌면 (기준본은 새것 · 로컬은 옛것)');
  {
    const o = await syncWindow(OLD_SRC), n = await syncWindow(E.SRC_NEW);
    ck('[옛] 저장이 그 틈에 끼어들었다', o.끼어들었나, 'true');
    ck('[옛] 서버 «회원»1 탑승', o.서버1, 'null');
    ck('[옛] 서버 «회원»2 탑승', o.서버2, 'null');
    ck('[옛] 트랜잭션 쓴 횟수', o.쓴횟수, 1);
    ck('[새] 서버 «회원»1 탑승 — 옛과 같다', n.서버1, o.서버1);
    ck('[새] 서버 «회원»2 탑승 — 옛과 같다', n.서버2, o.서버2);
    ck('[새] 쓴 횟수 — 옛과 같다', n.쓴횟수, o.쓴횟수);
    console.log('      → 서버에 켜져 있던 탑승 둘이 **폰의 빈 값으로 지워졌다**'
      + (n.서버1 === 'null' ? ' (54 의 고침과 무관 — 같은 결과)' : ''));
  }

  console.log('\n════ ③ 늦게 끝난 쓰기가 기준본을 옛 것으로 덮나');
  {
    const o = await lateWrite(OLD_SRC), n = await lateWrite(E.SRC_NEW);
    /* ★ 재 보니 — 기준본은 **정말 옛 것으로 되돌아간다**(확인). 그런데 그것만으로는
       지워지지 않는다: 지우기는 「기준본에 있는데 로컬에 없을 때」 나오므로,
       기준본이 **뒤처진** 경우에는 지우기가 안 생긴다(위험한 쪽은 기준본이 **앞설** 때 —
       그것이 54 에서 고친 ①②③ 이다). 그래서 이 자리는 **위험 「하」**로 적는다. */
    ck('[옛] 쓰기가 끝난 뒤 기준본이 옛 것으로 되돌아간다', o.기준본에출근, '없다');
    ck('[옛] 그래도 다음 저장이 서버 출근을 지우지는 않았다', o.서버출근, '{"in":"08:00"}');
    ck('[새] 기준본 — 옛과 같다', n.기준본에출근, o.기준본에출근);
    ck('[새] 서버 출근 — 옛과 같다', n.서버출근, o.서버출근);
    console.log('      → 기준본이 **뒤처지는** 것은 확인됐지만, 뒤처진 기준본은 지우기를 만들지 않는다.'
      + '\n        (지우기는 기준본이 **앞설** 때 나온다 — 54 에서 고친 그 셋이다.) 54 의 고침과 무관.');
  }

  console.log('\n════ ⑤ 빠르게 두 번 누른 탑승 토글 (끄기 → 켜기)');
  for (const mode of ['driver', 'admin']) {
    const o = await doubleTap(OLD_SRC, mode), n = await doubleTap(E.SRC_NEW, mode);
    /* ★★ 재 보니 — **마지막 누름이 사라진다.** 폰도 서버도 **첫 누름(끄기)** 으로 남는다.
       까닭 둘이 겹친다:
         (a) 두 번째 저장은 기준본(아직 「켜짐」)과 로컬(「켜짐」)이 같아 **차이표가 비어** 안 쓴다
         (b) 그 뒤 첫 저장이 「꺼짐」을 쓰고, 그 **리스너 메아리**가 폰의 「켜짐」을 덮는다
       → 쓴 트랜잭션은 **1번**뿐이다. 고치지 않고 보고만 한다(지시문 ⑤). */
    console.log('  [' + mode + ']');
    ck('  [옛] 폰이 **첫 누름**으로 남는다(마지막 누름 사라짐)', o.폰, '"{\\"on\\":false}"');
    ck('  [옛] 서버도 첫 누름으로 남는다', o.서버, '{"on":false}');
    ck('  [옛] 트랜잭션은 1번만 돌았다', o.쓴횟수, 1);
    ck('  [새] 폰 — 옛과 같다(54 의 고침과 무관)', n.폰, o.폰);
    ck('  [새] 서버 — 옛과 같다', n.서버, o.서버);
    ck('  [새] 쓴 횟수 — 옛과 같다', n.쓴횟수, o.쓴횟수);
  }

  console.log('\n════ ⑥ 차계부 계기판 수정 — 「지우기 저장 + 넣기 저장」을 연달아');
  {
    const inOrder = await carlogEdit(E.SRC_NEW, false);
    ck('순서대로 끝나면 기록 1개', inOrder.기록수, 1);
    ck('  계기판 값은 고친 값', inOrder.계기판, '777');
    ck('  트랜잭션 2번', inOrder.쓴횟수, 2);
    const rev = await carlogEdit(E.SRC_NEW, true);
    ck('★ 순서가 뒤집히면 기록이', rev.기록수, 0);
    ck('  (옛 판도 같다)', (await carlogEdit(OLD_SRC, true)).기록수, 0);
    console.log('      → 뒤늦게 끝난 「지우기」가 방금 넣은 같은 id 를 지운다.'
      + '\n        54 의 고침과 무관(두 저장이 **따로** 도는 것 자체가 원인). 고치지 않고 보고.');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건  ← 기대와 다른 칸이 조사 결과다'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  /* ★ 이 묶음은 **조사**다 — 실패가 있어도 1 로 끝내지 않는다(돌림판이 결과를 보여 주면 된다). */
  process.exit(0);
})();
