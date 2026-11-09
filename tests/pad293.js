/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드60-B1 — **판 분리**(v293).
   PIN 판이 하나뿐이라 **출결 판에서 직원 PIN 을 찍으면 근태가 기록되고**,
   **근태 판에서 회원 PIN 을 찍으면 출석이 기록됐다**(단추가 둘이지만 `openPinCheckin()`
   하나를 열어 `checkPin()` 이 기사→직원→회원을 모두 받았다).
   보는 것: ① 옛 판에서 **남의 판 PIN 이 기록된다** ② 새 판은 **기록 0 + 안내**
            ③ 자기 판 PIN 은 **그대로 된다** ④ 서버 `probe` 는 **쓰기 0 · kind 만**
            ⑤ 투어 선택자가 그대로 맞나 ⑥ 덮개가 v262 규칙을 지키나
   실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const OLD_REF = process.env.COS_SRC_OLD_REF || 'c92a058';   /* v292 — 고치기 전 */
if (!('COS_SRC_NEW_REF' in process.env)) process.env.COS_SRC_NEW_REF = '';
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(50) + String(got).slice(0, 44)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const NEW_SRC = require('fs').readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
               location: '1', lat: 37.41, lon: 126.68, phone: '010-1', pin: '1111' }];
const CARS = [{ id: 'car1', name: '1호차' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const STAFF = [{ id: 'st1', name: '최직원', hourlyWage: 10000, taxMode: 'free33' }];
const SUF = '__B';                       /* v292 — 꼬리는 「로그인한 업체」 */

function phone(SRV, opt) {
  opt = opt || {};
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(MEM);
  store['tkd_cars' + SUF]    = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify(COURSES);
  store['tkd_staff' + SUF]   = JSON.stringify(STAFF);
  store['tkd_org' + SUF]     = JSON.stringify({ name: '가온학원', icon: '🚐', bizType: 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  const R = E.build({ src: opt.src || NEW_SRC, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-screen', 'admin-screen', 'fb-loading', 'member-screen',
   'member-list', 'main-header', 'today-date', 'org-name-display', 'org-icon', 'login-screen',
   'main-app', 'bottom-action', 'mode-badge', 'header-btns', 'filter-chips', 'search-input',
   'day-tabs', 'member-add-area', 'drive-tabs', 'pin-checkin-modal', 'pin-result', 'pin-display']
   .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });
  /* ★ 판의 안내는 **쓰였다가 1.5~3초 뒤에 지워진다**(원래 그렇게 만들어졌다) —
     그래서 「지금 화면에 있나」로 재면 **지워진 뒤를 보게 되어** 늘 빈 값이다(처음에 그렇게 속았다).
     쓰기를 **전부 적어 두고** 그 목록으로 본다. */
  const _pr = R.byId['pin-result'];
  R.__writes = [];
  let _h = '';
  Object.defineProperty(_pr, 'innerHTML', {
    get(){ return _h; },
    set(v){ _h = String(v); R.__writes.push(String(v).replace(/<[^>]*>/g, '').trim()); }
  });
  const bagOf = (p) => {
    const seg = p.split('/');
    if (seg[0] === 'orgs') return { box: (SRV[seg[1]] = SRV[seg[1]] || {}), key: seg.slice(2).join('/') || '_' };
    return { box: (SRV.etc = SRV.etc || {}), key: p };
  };
  const pathOf = (a) => a.slice(1).join('/');
  R.sandbox._firestore = R.win._firestore = {
    doc: function(){ return { path: pathOf([].slice.call(arguments)) }; },
    collection: function(){ return { path: pathOf([].slice.call(arguments)) }; },
    getDoc: async (ref) => {
      const b = bagOf(ref.path);
      const has = Object.prototype.hasOwnProperty.call(b.box, b.key);
      return { exists: () => has, data: () => ({ value: JSON.stringify(b.box[b.key]) }) };
    },
    getDocs: async (ref) => {
      const seg = ref.path.split('/');
      const box = (seg[0] === 'orgs') ? (SRV[seg[1]] = SRV[seg[1]] || {}) : {};
      const pre = seg.slice(2).join('/') + '/';
      const ids = Object.keys(box).filter((k) => k.indexOf(pre) === 0);
      return { forEach: (cb) => ids.forEach((k) =>
        cb({ id: k.slice(pre.length), data: () => ({ value: JSON.stringify(box[k]) }) })) };
    },
    setDoc: async (ref, d) => { SRV.writes.push('set ' + ref.path);
      const b = bagOf(ref.path); b.box[b.key] = (d && d.value !== undefined) ? JSON.parse(d.value) : d; },
    deleteDoc: async () => {},
    runTransaction: async (db, fn) => await fn({
      get: async (ref) => { const b = bagOf(ref.path);
        const has = Object.prototype.hasOwnProperty.call(b.box, b.key);
        return { exists: () => has, data: () => ({ value: JSON.stringify(b.box[b.key]) }) }; },
      set: (ref, d) => { SRV.writes.push('tx ' + ref.path); const b = bagOf(ref.path);
        b.box[b.key] = JSON.parse(d.value); }
    }),
    onSnapshot: () => () => {}
  };
  R.sandbox._db = R.win._db = {};
  /* 로그인한 관리자 · 첫 동기화 끝남(v288 문지기 통과) */
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userUid='uB';"
     + " window._userBizType='academy'; window._userPaidUntil=Date.now()+30*86400000;");
  R.ev("_firstSyncOk = true;");
  R.ev("window._auth={ currentUser:{ isAnonymous:false, getIdToken:function(){ return Promise.resolve('tok'); } } };");
  /* 서버 창구 흉내 — 기사 PIN 은 없고, '2222' 가 **직원** PIN 이다.
     `probe` 가 오면 **쓰기 없이 kind 만** 돌려준다(v293). */
  R.sandbox.fetch = R.win.fetch = async (url, init) => {
    const body = JSON.parse((init && init.body) || '{}');
    SRV.api.push(body);
    if (body.action === 'checkPinDup') {
      /* '2222' 는 **직원** PIN 이다 — 겹침 찾기가 이 응답으로 「직원(최직원)」을 만든다 */
      return { json: async () => (String(body.pin) === '2222'
        ? { ok: true, dup: true, kind: 'staff', staffId: 'st1' }
        : { ok: true, dup: false }) };
    }
    if (body.action !== 'pinCheckin') return { json: async () => ({ ok: false }) };
    const isStaff = String(body.pin) === '2222';
    if (!isStaff) return { json: async () => ({ ok: false, why: 'notdriver', message: '기사 PIN 이 아니에요.' }) };
    if (body.probe === true) return { json: async () => ({ ok: true, kind: 'staff', probe: true }) };
    SRV.serverPunch.push(body.pin);                 /* 서버가 기록까지 했다 */
    return { json: async () => ({ ok: true, kind: 'staff', staffId: 'st1' }) };
  };
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return { R, SRV };
}
const makeServer = () => ({ writes: [], api: [], serverPunch: [],
  B: { 'carState/car1': { ride: {}, rideOff: {}, carlog: { records: [], plans: {} },
                          delivDone: {}, dropDone: {}, att: {} },
       'data/members': MEM, 'data/staff': STAFF, 'data/migration': { carState: true } } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 판을 열고 PIN 을 눌러 본다. kind 를 주면 그 판으로 연다(옛 판은 인자를 무시한다). */
async function press(p, kind, pin) {
  await p.R.ev("(function(){ try{ openPinCheckin(" + (kind ? "'" + kind + "'" : '') + "); }catch(e){} "
             + "pinInput='" + pin + "'; })()");
  var _r = await p.R.ev("checkPin().then(function(){return 'ok';},function(e){return 'ERR:'+(e&&e.message);})");
  if (_r !== 'ok') throw new Error('checkPin 이 깨졌다: ' + _r);
  await wait(300);
  return {
    att:   p.R.ev("String(Object.keys(loadAttendance()[todayStr()]||{}).length)"),
    staff: p.R.ev("String(Object.keys(loadDriverAtt()).length)"),
    /* 「쓰인 것 중 글자가 있는 마지막 것」 — 지워진 빈 값은 건너뛴다 */
    msg:   (p.R.__writes.filter((x) => x).pop() || '').slice(0, 60)
  };
}

(async () => {
  console.log('════ ① 옛 판 — **남의 판 PIN 이 그대로 기록된다**');
  {
    const a = phone(makeServer(), { src: OLD_SRC });
    const r1 = await press(a, 'member', '2222');          /* 출결 판에 **직원** PIN */
    ck('[옛] 출결 판 + 직원 PIN → 근태 기록', r1.staff, '1');
    ck('  (서버도 찍었다)', a.SRV.serverPunch.length, 1);

    const b = phone(makeServer(), { src: OLD_SRC });
    const r2 = await press(b, 'work', '1111');            /* 근태 판에 **회원** PIN */
    ck('[옛] 근태 판 + 회원 PIN → 출석 기록', r2.att, '1');
  }

  console.log('\n════ ② 새 판 — **기록 0 + 안내**');
  {
    const a = phone(makeServer(), {});
    const r1 = await press(a, 'member', '2222');
    ck('★ 출결 판 + 직원 PIN — 근태 기록 **0**', r1.staff, '0');
    ck('★ 출석도 안 찍힌다', r1.att, '0');
    ck('★ 서버가 **기록하지 않았다**', a.SRV.serverPunch.length, 0);
    ck('★ 안내가 뜬다', /근태/.test(r1.msg), true);
    console.log('      안내: ' + r1.msg);
    ck('  서버에는 **probe 로** 물었다',
      a.SRV.api.filter((x) => x.probe === true).length, 1);

    const b = phone(makeServer(), {});
    const r2 = await press(b, 'work', '1111');
    ck('★ 근태 판 + 회원 PIN — 출석 기록 **0**', r2.att, '0');
    ck('★ 근태도 안 찍힌다', r2.staff, '0');
    ck('★ 안내가 뜬다', /출결|출석/.test(r2.msg), true);
    console.log('      안내: ' + r2.msg);
  }

  console.log('\n════ ③ 자기 판 PIN 은 **그대로 된다** (기능을 죽이지 않았나)');
  {
    const a = phone(makeServer(), {});
    const r1 = await press(a, 'member', '1111');
    ck('★ 출결 판 + 회원 PIN → 출석 1건', r1.att, '1');
    console.log('      결과: ' + JSON.stringify(r1.msg));
    ck('  이름이 보인다', /가하은/.test(r1.msg), true);
    const b = phone(makeServer(), {});
    const r2 = await press(b, 'work', '2222');
    ck('★ 근태 판 + 직원 PIN → 근태 1건', r2.staff, '1');
    ck('  서버가 가려 줬다(기록까지)', b.SRV.serverPunch.length, 1);
    ck('  이름이 보인다', /최직원/.test(r2.msg), true);
  }

  console.log('\n════ ④ 틀린 PIN · 기본값 · 투어 선택자 · 덮개 규칙');
  {
    const a = phone(makeServer(), {});
    const r = await press(a, 'member', '9999');
    console.log('      결과: ' + JSON.stringify(r.msg));
    ck('틀린 PIN 은 종전 문구', /올바르지 않/.test(r.msg), true);
    ck('  기록 0', r.att + '/' + r.staff, '0/0');
    /* 인자 없이 열면 **출결 판**(근태를 잘못 찍지 않는 쪽) */
    const b = phone(makeServer(), {});
    const r2 = await press(b, '', '2222');
    ck('★ 인자 없이 열면 출결 판 — 근태 기록 0', r2.staff, '0');

    /* 단추 둘이 종류를 주고, 투어 선택자(접두사)는 그대로 맞는다 */
    /* ★ 소스에서는 **JS 문자열 안의 onclick** 이라 따옴표가 `\'` 로 **escape 되어** 있다 —
       검사도 그 꼴(백슬래시+따옴표)을 찾아야 한다(그냥 `'member'` 로 찾으면 못 찾는다). */
    ck('★ 출결 탭 단추가 `member` 를 준다',
      NEW_SRC.indexOf("openPinCheckin(\\'member\\')") >= 0, true);
    ck('★ 근태 블록 단추가 `work` 를 준다',
      NEW_SRC.indexOf("openPinCheckin(\\'work\\')") >= 0, true);
    ck('  (옛 판은 인자가 없었다 — 대조)',
      /openPinCheckin\(\)/.test(OLD_SRC), true);
    ck('★ 투어 선택자가 그대로 맞는다(접두사)',
      /selector:'button\[onclick\^="openPinCheckin"\]/.test(NEW_SRC), true);
    ck('  함수 이름을 그대로 뒀다', /function openPinCheckin\(/.test(NEW_SRC), true);

    /* v262 — 덮개는 위에서 시작 + 스크롤 · 안쪽 상자는 margin:auto */
    const ov = (/<div class="modal-bg" id="pin-checkin-modal" style="([^"]*)"/.exec(NEW_SRC) || [, ''])[1];
    ck('★ 덮개에 `align-items:center` 가 **없다**', /align-items:center/.test(ov), false);
    ck('★ 덮개가 `flex-start` + `overflow-y:auto`',
      /align-items:flex-start/.test(ov) && /overflow-y:auto/.test(ov), true);
    ck('  (옛 판은 center 였다 — 대조)',
      /id="pin-checkin-modal" style="align-items:center/.test(OLD_SRC), true);
    const box = NEW_SRC.slice(NEW_SRC.indexOf('id="pin-checkin-modal"'));
    ck('★ 안쪽 상자에 `margin:auto`',
      /margin:auto/.test(box.slice(0, 400)), true);
  }

  console.log('\n════ ⑤ 「🔍 PIN 겹침 찾기」 — 찾아서 보여 주고 **자동으로 안 바꾼다**');
  {
    const a = phone(makeServer(), {});
    /* «회원» 둘이 같은 PIN · 직원 PIN('2222')과도 겹치게 만든다 */
    a.R.ev("members=[{id:1,name:'가하은',pin:'1111',carId:'car1',courseId:'c1',days:['월']},"
         + "{id:2,name:'나다움',pin:'1111',carId:'car1',courseId:'c1',days:['월']},"
         + "{id:3,name:'다가을',pin:'2222',carId:'car1',courseId:'c1',days:['월']}];");
    a.R.ev("localStorage.setItem('tkd_members', JSON.stringify(members));");
    const out = await a.R.ev('pinDupScan()');
    const txt = JSON.stringify(out || '');
    ck('★ 회원끼리 겹친 PIN 을 찾는다', /1111/.test(txt), true);
    ck('★ 직원과 겹친 것도 찾는다', /2222/.test(txt), true);
    ck('★ 자료를 **바꾸지 않는다**(쓰기 0)',
      a.SRV.writes.filter((w) => w.indexOf('data/members') >= 0).length, 0);
    ck('  «회원» PIN 이 그대로', a.R.ev("String(members[0].pin)+members[1].pin+members[2].pin"), '111111112222');
    ck('  단추가 근태 블록 아래에 있다',
      /onclick="pinDupScanRun\(\)"/.test(NEW_SRC), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  process.exit(fail ? 1 : 0);
})();
