/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드60-B3 — **출석도 「바뀐 칸만」** + 서버 창구(v295).
   60-A 설계의 가장 위험한 자리: 출석 기기(60-B4)가 서버에서 `data/attendance` 를 쓰기
   시작하는데, 앱은 그 문서를 **통째로**(`saveToFirebase('attendance', 전체)`) 쓰고 있었다.
   → **서버가 찍은 한 칸이 관리자 저장 한 번에 지워진다**(v277 `att` · v282 `staffAtt` 와 같은 함정).
   보는 것: ① 옛 판에서 **지워지는가**(재현) ② 새 판은 **둘 다 남는가**
            ③ 기준본이 없으면 **지우기를 안 보내는가** ④ 날짜 점검(옮기기)의 **지우기**는 되는가
            ⑤ 출결 판이 **서버 창구만** 부르는가(앱이 직접 쓰지 않는다)
            ⑥ 받을 때 **얹는가**(안 올린 내 변경이 살아 있나) · 읽기 전용·둘러보기는 서버가 이김
   실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const OLD_REF = process.env.COS_SRC_OLD_REF || '4b4fb3b';   /* v294 — 고치기 전 */
if (!('COS_SRC_NEW_REF' in process.env)) process.env.COS_SRC_NEW_REF = '';
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 46)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const NEW_SRC = require('fs').readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '1', lat: 37.41, lon: 126.68, phone: '010-1', pin: '1111' },
  { id: 2, name: '나다움', carId: 'car1', courseId: 'c1', days: D7, location: '2', lat: 37.42, lon: 126.69, phone: '010-2', pin: '2222' }
];
const CARS = [{ id: 'car1', name: '1호차' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const SUF = '__B';
const TODAY = (function () { const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); })();

function phone(SRV, opt) {
  opt = opt || {};
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(MEM);
  store['tkd_cars' + SUF]    = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify(COURSES);
  store['tkd_org' + SUF]     = JSON.stringify({ name: '가온학원', icon: '🚐', bizType: 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  if (opt.localAtt) store['tkd_attendance' + SUF] = JSON.stringify(opt.localAtt);
  const R = E.build({ src: opt.src || NEW_SRC, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-screen', 'admin-screen', 'fb-loading', 'member-screen',
   'member-list', 'main-header', 'today-date', 'org-name-display', 'org-icon', 'login-screen',
   'main-app', 'bottom-action', 'mode-badge', 'header-btns', 'filter-chips', 'search-input',
   'day-tabs', 'member-add-area', 'drive-tabs', 'pin-checkin-modal', 'pin-result', 'pin-display']
   .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });
  const bagOf = (p) => {
    const seg = p.split('/');
    if (seg[0] === 'orgs') return { box: (SRV[seg[1]] = SRV[seg[1]] || {}), key: seg.slice(2).join('/') || '_' };
    return { box: (SRV.etc = SRV.etc || {}), key: p };
  };
  const pathOf = (a) => a.slice(1).join('/');
  const jsonOf = (b) => { const v = b.box[b.key]; return v === undefined ? undefined : JSON.stringify(v); };
  R.sandbox._firestore = R.win._firestore = {
    doc: function(){ return { path: pathOf([].slice.call(arguments)) }; },
    collection: function(){ return { path: pathOf([].slice.call(arguments)) }; },
    getDoc: async (ref) => {
      const b = bagOf(ref.path);
      const has = Object.prototype.hasOwnProperty.call(b.box, b.key);
      return { exists: () => has, data: () => ({ value: jsonOf(b) }) };
    },
    getDocs: async (ref) => {
      const seg = ref.path.split('/');
      const box = (seg[0] === 'orgs') ? (SRV[seg[1]] = SRV[seg[1]] || {}) : {};
      const pre = seg.slice(2).join('/') + '/';
      const ids = Object.keys(box).filter((k) => k.indexOf(pre) === 0);
      return { forEach: (cb) => ids.forEach((k) =>
        cb({ id: k.slice(pre.length), data: () => ({ value: JSON.stringify(box[k]) }) })) };
    },
    setDoc: async (ref, d) => {
      SRV.writes.push('set ' + ref.path);
      const b = bagOf(ref.path);
      b.box[b.key] = (d && d.value !== undefined) ? JSON.parse(d.value) : d;
    },
    deleteDoc: async () => {},
    runTransaction: async (db, fn) => await fn({
      get: async (ref) => { const b = bagOf(ref.path);
        const has = Object.prototype.hasOwnProperty.call(b.box, b.key);
        return { exists: () => has, data: () => ({ value: jsonOf(b) }) }; },
      set: (ref, d) => { SRV.writes.push('tx ' + ref.path); const b = bagOf(ref.path);
        b.box[b.key] = JSON.parse(d.value); }
    }),
    onSnapshot: (ref, cb) => { SRV.subs.push({ path: ref.path, cb: cb }); return () => {}; }
  };
  R.sandbox._db = R.win._db = {};
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userUid='uB';"
     + " window._userBizType='academy'; window._userPaidUntil=Date.now()+30*86400000;");
  R.ev('_firstSyncOk = true;');
  R.ev("window._auth={ currentUser:{ isAnonymous:false, getIdToken:function(){ return Promise.resolve('tok'); } } };");
  /* 서버 창구 흉내 — «회원» PIN '1111'·'2222' · 기사·직원 PIN 은 없다 */
  R.sandbox.fetch = R.win.fetch = async (url, init) => {
    const body = JSON.parse((init && init.body) || '{}');
    SRV.api.push(body);
    if (body.action === 'pinCheckin') {
      const m = MEM.find((x) => x.pin === String(body.pin));
      if (!m) return { json: async () => ({ ok: false, why: 'notdriver', message: '기사 PIN 이 아니에요.' }) };
      if (body.probe === true) return { json: async () => ({ ok: false, why: 'notdriver' }) };
      /* 서버가 **그 칸만** 찍는다(실제 서버와 같은 모양) */
      const box = (SRV.B = SRV.B || {});
      const cur = box['data/attendance'] || {};
      cur[TODAY] = cur[TODAY] || {};
      cur[TODAY][m.id] = 'present';
      box['data/attendance'] = cur;
      SRV.writes.push('tx(서버) B/data/attendance');
      SRV.lastRes = { ok: true, kind: 'member', name: m.name, photo: '', time: '09:05', date: TODAY };
      return { json: async () => SRV.lastRes };
    }
    return { json: async () => ({ ok: false }) };
  };
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return { R, SRV };
}
const makeServer = (att) => ({
  writes: [], api: [], subs: [],
  B: Object.assign({
    'carState/car1': { ride: {}, rideOff: {}, carlog: { records: [], plans: {} },
                       delivDone: {}, dropDone: {}, att: {} },
    'data/members': MEM, 'data/migration': { carState: true }
  }, att ? { 'data/attendance': att } : {})
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const srvAtt = (S) => (S.B['data/attendance'] || {})[TODAY] || {};

(async () => {
  console.log('════ ① 재현 — 서버가 찍은 출석이 **관리자 저장 한 번에 지워지나**');
  for (const [tag, SRC] of [['옛', OLD_SRC], ['새', NEW_SRC]]) {
    /* 서버에는 «회원»1 이 PIN 으로 찍어 둔 출석이 있다(기기·다른 관리자가 찍었다) */
    const S = makeServer({ [TODAY]: { 1: 'present' } });
    const p = phone(S, { src: SRC });
    await p.R.ev('syncFromFirebase()');
    await wait(400);
    /* 그 사이 서버에 **또 한 칸**이 들어온다(출석 기기가 «회원»2 를 찍었다) */
    S.B['data/attendance'][TODAY][2] = 'present';
    /* 관리자가 «회원»1 을 **결석으로** 바꾼다 → 저장 */
    p.R.ev("attViewDate='" + TODAY + "'; setAttendance(1,'absent');");
    await wait(500);
    const a = srvAtt(S);
    ck('[' + tag + '] 관리자가 바꾼 칸', JSON.stringify(a[1] || null), '"absent"');
    ck('[' + tag + '] ★ 서버가 찍은 **다른 칸**',
      JSON.stringify(a[2] || null), tag === '옛' ? 'null' : '"present"');
  }

  console.log('\n════ ② 기준본이 없으면 **지우기를 안 보낸다**');
  {
    const S = makeServer({ [TODAY]: { 1: 'present', 2: 'present' } });
    const p = phone(S, {});           /* 동기화를 **안 한다** → 기준본 없음 */
    p.R.ev("attViewDate='" + TODAY + "'; setAttendance(1,'present');");
    await wait(500);
    const a = srvAtt(S);
    ck('★ 내 칸만 바뀐다', JSON.stringify(a[1] || null), '"present"');
    ck('★ 남의 칸은 그대로', JSON.stringify(a[2] || null), '"present"');
  }

  console.log('\n════ ③ 날짜 점검(출석 옮기기) — **지우기**도 된다');
  {
    const YEST = '2026-11-08';
    const S = makeServer({ [YEST]: { 1: 'present' }, [TODAY]: { 2: 'present' } });
    const p = phone(S, {});
    await p.R.ev('syncFromFirebase()');
    await wait(400);
    /* 어제 것을 오늘로 옮긴다(앱 dcMoveAttendance 와 같은 모양으로) */
    p.R.ev("(function(){ var d=loadAttendance(); d['" + TODAY + "']=d['" + TODAY + "']||{};"
         + " d['" + TODAY + "']['1']=d['" + YEST + "']['1']; delete d['" + YEST + "']['1'];"
         + " if(Object.keys(d['" + YEST + "']).length===0) delete d['" + YEST + "'];"
         + " saveAttendanceData(d); })()");
    await wait(500);
    ck('★ 오늘로 옮겨졌다', JSON.stringify(srvAtt(S)[1] || null), '"present"');
    ck('★ 어제 칸은 **지워졌다**',
      JSON.stringify((S.B['data/attendance'] || {})[YEST] || null), 'null');
    ck('  오늘 다른 칸은 그대로', JSON.stringify(srvAtt(S)[2] || null), '"present"');
  }

  console.log('\n════ ④ 출결 판 — **서버 창구만** 부른다(앱이 attendance 에 직접 안 쓴다)');
  {
    const S = makeServer();
    const p = phone(S, {});
    await p.R.ev('syncFromFirebase()');
    await wait(300);
    const before = S.writes.length;
    /* 가짜 DOM 에는 `classList` 가 없어 `openPinCheckin` 이 거기서 멈춘다 — 종류만 세운다 */
    await p.R.ev("(function(){ try{ openPinCheckin('member'); }catch(e){} pinPadKind='member'; pinInput='1111'; })()");
    await p.R.ev('checkPin()');
    await wait(500);
    const mine = S.writes.slice(before);
    ck('★ 서버 창구를 불렀다', S.api.filter((x) => x.action === 'pinCheckin' && !x.probe).length, 1);
    ck('★ 앱이 `data/attendance` 로 **직접 쓰지 않는다**',
      mine.filter((w) => /^(set|tx) B\/data\/attendance$/.test(w)).length, 0);
    ck('  서버가 그 칸을 찍었다', JSON.stringify(srvAtt(S)[1] || null), '"present"');
    ck('  폰에도 보인다', p.R.ev("JSON.stringify((loadAttendance()['" + TODAY + "']||{})['1']||null)"), '"present"');
    /* ★ v319(73-B): 읽는 함수 `attTimeInfo` 가 **`out`(하원 시각) 칸을 하나 더** 돌려준다
       (등원만 찍혔으면 빈 값). **저장 꼴은 안 바뀐다** — 아래 줄이 그것을 지킨다. */
    ck('  출석 시각도 남는다',
      p.R.ev("JSON.stringify(attTimeInfo(loadAttendanceTime(),'" + TODAY + "',1))"),
      '{"t":"09:05","by":"pin","out":""}');
    ck('★ 저장된 칸에는 `out` 을 안 넣는다(등원만 찍혔다 · v319)',
      p.R.ev("JSON.stringify((loadAttendanceTime()['" + TODAY + "']||{})['1']||null)"),
      '"09:05"');
    /* 보낸 것은 `member:true` 깃발 하나 더(v295) · **받은 것**이 그 사람 것만인지가 핵심이다 */
    ck('  보낼 때 `member:true` 깃발을 준다',
      Object.keys((S.api.filter((x) => x.action === 'pinCheckin').pop() || {})).sort().join(','),
      'action,member,org,pin');
    ck('★ 받은 것은 **그 사람 것만**(명단이 안 온다)',
      /members|list|phone/.test(JSON.stringify(S.lastRes || {})), false);
    ck('  받은 칸은 이름·사진·시각·날짜뿐',
      Object.keys(S.lastRes || {}).sort().join(','), 'date,kind,name,ok,photo,time');
  }

  console.log('\n════ ⑤ 받을 때 **얹는다** · 읽기 전용·둘러보기는 서버가 이긴다');
  {
    const S = makeServer({ [TODAY]: { 1: 'present' } });
    const p = phone(S, {});
    await p.R.ev('syncFromFirebase()');
    await wait(300);
    /* 아직 **안 올린** 내 변경(«회원»2 결석)을 만들어 두고 서버 값을 받는다 */
    const got = p.R.ev("(function(){ var L=loadAttendance(); L['" + TODAY + "']=L['" + TODAY + "']||{};"
      + " L['" + TODAY + "']['2']='absent'; localStorage.setItem('tkd_attendance', JSON.stringify(L));"
      + " var R={}; R['" + TODAY + "']={'1':'absent'};"      /* 서버에서 «회원»1 이 결석으로 바뀌었다 */
      + " var out=atRebase('attendance', R, L);"
      + " return JSON.stringify(out['" + TODAY + "']); })()");
    ck('★ 서버 값(1=결석)과 내 변경(2=결석)이 **둘 다**', got, '{"1":"absent","2":"absent"}');
    const ro = p.R.ev("(function(){ _readOnlyMode=true;"
      + " var L=loadAttendance(); var R={}; R['" + TODAY + "']={'1':'present'};"
      + " var out=atRebase('attendance', R, L); _readOnlyMode=false;"
      + " return JSON.stringify(out['" + TODAY + "']); })()");
    ck('★ 읽기 전용이면 **서버가 이긴다**', ro, '{"1":"present"}');
  }

  console.log('\n════ ⑤-2 ★ 리스너 **순서** — 기준본을 먼저 바꾸면 서버 칸이 지워진다');
  {
    /* ★★ 크롬 묶음이 **내 순서 실수**를 잡았다(v295 작업 중) — 얹기는 **그 전 기준본**으로
       세고, 기준본은 그 다음에 받은 서버값으로 바꾼다. 거꾸로 하면 「서버값 → 로컬」 차이를
       내는 셈이 되어 **서버가 방금 찍은 칸을 지운다**(크롬 실측: 로컬이 `{}` 가 됐다). */
    const S2 = makeServer({ [TODAY]: {} });
    const p2 = phone(S2, {});
    await p2.R.ev('syncFromFirebase()');
    await wait(300);
    const out = p2.R.ev('(function(){'
      + " var L=loadAttendance(); L['" + TODAY + "']=L['" + TODAY + "']||{}; L['" + TODAY + "']['2']='absent';"
      + " localStorage.setItem('tkd_attendance', JSON.stringify(L));"
      + " var R={}; R['" + TODAY + "']={'1':'present'};"
      + " var bad = atRebase('attendance', R, loadAttendance(), R);"
      + " var good = atRebase('attendance', R, loadAttendance(), _atBase['attendance']);"
      + " return JSON.stringify({bad:bad['" + TODAY + "'], good:good['" + TODAY + "']}); })()");
    const rr = JSON.parse(out);
    ck('거꾸로 세면 **서버 칸이 사라진다**', JSON.stringify(rr.bad), '{"2":"absent"}');
    ck('★ 바른 순서면 **둘 다 남는다**', JSON.stringify(rr.good), '{"1":"present","2":"absent"}');
    ck('★ 리스너가 **그 전 기준본**을 넘긴다(소스)',
      NEW_SRC.indexOf("atRebase('attendance', data, _atL, _atBase['attendance'])") >= 0, true);
    ck('  출석시각도 같은 꼴',
      NEW_SRC.indexOf("atRebase('attendanceTime', data, _atTL, _atBase['attendanceTime'])") >= 0, true);
  }

  console.log('\n════ ⑥ 소스 전수 — 통째 쓰기가 남아 있지 않나');
  {
    /* ★ 통째 쓰기는 **복원 한 곳**만 남겼다(사람이 확인창을 지나 「덮어쓴다」고 고른 자리) —
       그 자리는 **기준본을 그 값으로 맞춘다**(안 맞추면 다음 「바뀐 칸만」이 엉뚱한 지우기를 보낸다). */
    ck("★ 통째 쓰기는 **복원 한 곳**뿐",
      (NEW_SRC.match(/saveToFirebase\('attendance', _attR\)/g) || []).length, 1);
    ck("  그 자리에서 기준본을 맞춘다",
      /saveToFirebase\('attendance', _attR\); _atSetBase\('attendance', _attR\)/.test(NEW_SRC), true);
    ck("  출석시각도 같은 꼴",
      /saveToFirebase\('attendanceTime', _atmR\); _atSetBase\('attendanceTime', _atmR\)/.test(NEW_SRC), true);
    ck("★ 저장 함수에는 통째 쓰기가 **없다**",
      /function saveAttendanceData\(data\)\{[\s\S]{0,600}?saveToFirebase/.test(NEW_SRC), false);
    ck('  (대조) 옛 판에는 있었다',
      (OLD_SRC.match(/saveToFirebase\('attendance(Time)?'/g) || []).length >= 2, true);
    ck('★ 기준본 갱신 자리 셋(동기화·리스너·쓰기 성공)',
      (NEW_SRC.match(/_atSetBase\(/g) || []).length >= 3, true);
    ck('  `writeAttendancePatch` 가 한 벌', (NEW_SRC.match(/async function writeAttendancePatch/g) || []).length, 1);
    /* ★★ 얹기는 **출퇴근 함수를 쓰지 않는다** — `_csAttApply` 는 칸을 지운 뒤
       `in`·`out` 이 없으면 **그 날짜를 지운다**(출퇴근 전용 규칙). 출석에 쓰면
       한 칸만 지워도 **그날 전체가 사라진다**(크롬·스텁이 함께 잡았다). */
    ck('★ 출석 얹기는 `_dayCellApply` 를 쓴다(출퇴근 함수가 아니다)',
      /return _dayCellApply\(JSON\.parse\(JSON\.stringify\(R \|\| \{\}\)\), p\);/.test(NEW_SRC), true);
    ck('  쓰기도 같은 함수', /var next = _dayCellApply\(srv, patch\);/.test(NEW_SRC), true);
    ck('  한 칸을 지워도 그날이 남는다(함수 결과로 확인)',
      (function(){
        const P = phone(makeServer(), {});
        return P.R.ev("JSON.stringify(_dayCellApply({'d':{'1':'present','2':'absent'}}, {put:{}, drop:['d.1']}))");
      })(), '{"d":{"2":"absent"}}');
    ck('  마지막 칸을 지우면 그날도 지운다',
      (function(){
        const P = phone(makeServer(), {});
        return P.R.ev("JSON.stringify(_dayCellApply({'d':{'1':'present'}}, {put:{}, drop:['d.1']}))");
      })(), '{}');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  process.exit(fail ? 1 : 0);
})();
