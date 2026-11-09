/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드59-B2 보정1 — **공유 링크도 첫 동기화를 기다린다**(v291).
   59-B2(v288)는 `saveToFirebase`·`saveCarState`·`rebuildCarData` 셋만 막았다.
   공유 링크 네 곳(`shareIssue…`)은 `setDoc(doc(_db,'shares',token))` 를 **직접** 불러
   깃발을 안 봤다 — 로그인 직후 동기화가 끝나기 전에 누르면 **폰에 남은 앞 업체 자료로**
   링크가 발급되고, 그 링크는 로그인 없이 누구나 열 수 있다(30일).
   보는 것: ① 옛 판에서 실제로 발급되나(내용까지) ② 새 판은 막고 안내하나
            ③ 동기화 뒤에는 **그대로 되나**(막아만 두면 기능이 죽는다) ④ 네 곳 전수
   실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const OLD_REF = process.env.COS_SRC_OLD_REF || 'ff801bf';   /* v290 — 고치기 전 */
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
const MEM = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '1', lat: 37.41, lon: 126.68, phone: '010-1' }];
const CARS = [{ id: 'car1', name: '1호차' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const SUF = '__cosroad_default';

/* 폰에 남은 **앞 업체(A)** 알림장 · 서버에는 **새 업체(B)** 알림장 */
const NOTICE_A = [{ id: 11, title: 'A학원 알림', content: 'A학원 비밀 공지', target: 'all', date: '2026-11-01' }];
const NOTICE_B = [{ id: 11, title: 'B학원 알림', content: 'B학원 공지', target: 'all', date: '2026-11-02' }];

function phone(SRV, opt) {
  opt = opt || {};
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(MEM);
  store['tkd_cars' + SUF]    = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify(COURSES);
  store['tkd_notices' + SUF] = JSON.stringify(NOTICE_A);
  store['tkd_org' + SUF]     = JSON.stringify({ name: 'A학원', icon: '🚐', bizType: 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  const R = E.build({ src: opt.src || NEW_SRC, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-screen', 'admin-screen', 'fb-loading', 'member-screen',
   'member-list', 'main-header', 'today-date', 'org-name-display', 'org-icon', 'login-screen',
   'main-app', 'bottom-action', 'mode-badge', 'header-btns', 'filter-chips', 'search-input',
   'day-tabs', 'member-add-area', 'drive-tabs']
   .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });

  /* ★ 길을 **글자로** 모은다 — `doc(db,'shares',token)` 처럼 칸 수가 다른 호출이 섞인다. */
  const pathOf = (args) => args.slice(1).join('/');
  /* 길 글자를 그대로 칸 이름으로 쓴다 — `orgs/B/data/notices` → SRV.B['data/notices'] */
  const bagOf = (p) => {
    const seg = p.split('/');
    if (seg[0] === 'shares') return { box: SRV.shares, key: seg[1] };
    if (seg[0] === 'orgs') return { box: (SRV[seg[1]] = SRV[seg[1]] || {}), key: seg.slice(2).join('/') || '_' };
    return { box: (SRV.etc = SRV.etc || {}), key: p };
  };
  R.sandbox._firestore = R.win._firestore = {
    doc: function(){ return { path: pathOf([].slice.call(arguments)) }; },
    collection: function(){ return { path: pathOf([].slice.call(arguments)) }; },
    getDoc: async (ref) => {
      const b = bagOf(ref.path);
      const has = Object.prototype.hasOwnProperty.call(b.box, b.key);
      SRV.reads.push(ref.path);
      return { exists: () => has, data: () => ({ value: JSON.stringify(b.box[b.key]) }) };
    },
    getDocs: async (ref) => {
      /* 컬렉션 — 그 길로 시작하는 칸을 모아 돌려준다(`orgs/B/carState` → `carState/car1`) */
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
      get: async (ref) => {
        const b = bagOf(ref.path);
        const has = Object.prototype.hasOwnProperty.call(b.box, b.key);
        return { exists: () => has, data: () => ({ value: JSON.stringify(b.box[b.key]) }) };
      },
      set: (ref, d) => { SRV.writes.push('tx ' + ref.path); const b = bagOf(ref.path);
        b.box[b.key] = JSON.parse(d.value); }
    }),
    onSnapshot: (ref, cb) => { SRV.listeners.push(ref.path); return () => {}; }
  };
  R.sandbox._db = R.win._db = {};
  R.ev("currentMode='admin';");
  R.ev("window._userOrgId='B'; window._userBizType='academy'; window._userUid='uB';");
  R.ev("window._userPaidUntil=Date.now()+30*86400000;");
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses(); notices = loadNotices();');
  return { R, SRV };
}
const makeServer = () => ({
  reads: [], writes: [], listeners: [], shares: {},
  B: { 'carState/car1': { ride: {}, rideOff: {}, carlog: { records: [], plans: {} },
                          delivDone: {}, dropDone: {}, att: {} },
       'data/members': MEM, 'data/cars': CARS, 'data/courses': COURSES,
       'data/notices': NOTICE_B, 'data/migration': { carState: true },
       'data/org': { name: 'B학원', icon: '🚐', bizType: 'academy' } }
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shareBody = (SRV) => {
  const k = Object.keys(SRV.shares);
  if (!k.length) return '(없음)';
  const s = SRV.shares[k[0]];
  return String((s && s.notice && s.notice.content) || (s && s.content) || JSON.stringify(s).slice(0, 40));
};

(async () => {
  console.log('════ ① 옛 판 — 첫 동기화 전에 「공유」를 누르면 **발급된다**');
  {
    const o = phone(makeServer(), { src: OLD_SRC });
    const r = await o.R.ev('shareIssueNotice(11)');
    ck('[옛] `shares/…` 쓰기 건수',
      o.SRV.writes.filter((w) => w.indexOf('shares/') >= 0).length, 1);
    ck('[옛] 링크가 나왔다', !!(r && r.url), true);
    ck('★ [옛] 그 안에 **앞 업체(A) 글**이 들어갔다',
      /A학원/.test(JSON.stringify(o.SRV.shares)), true);
    ck('  (서버의 B 글은 아직 폰에 없다)',
      /B학원 공지/.test(JSON.stringify(o.SRV.shares)), false);
  }

  console.log('\n════ ② 새 판 — 막고 안내한다');
  {
    const n = phone(makeServer(), {});
    const r = await n.R.ev('shareIssueNotice(11)');
    ck('★ `shares/…` 쓰기 건수 **0**',
      n.SRV.writes.filter((w) => w.indexOf('shares/') >= 0).length, 0);
    ck('★ 링크 대신 **안내**가 온다', !!(r && r.error && !r.url), true);
    ck('  안내 문구', String((r && r.error) || ''),
      '자료를 불러오는 중이에요. 잠시 뒤 다시 시도해 주세요.');
  }

  console.log('\n════ ③ 동기화가 끝난 뒤에는 **그대로 된다** (기능을 죽이지 않았나)');
  {
    const n = phone(makeServer(), {});
    await n.R.ev('syncFromFirebase()');
    await wait(500);
    n.R.ev('notices = loadNotices();');
    const r = await n.R.ev('shareIssueNotice(11)');
    ck('★ 쓰기 1건',
      n.SRV.writes.filter((w) => w.indexOf('shares/') >= 0).length, 1);
    ck('★ 링크가 나온다', !!(r && r.url), true);
    ck('★ 내용은 **그 업체(B) 글**', /B학원 공지/.test(JSON.stringify(n.SRV.shares)), true);
    ck('  앞 업체(A) 글은 없다', /A학원 비밀/.test(JSON.stringify(n.SRV.shares)), false);
  }

  console.log('\n════ ④ 네 곳 전수 — 같은 문지기를 지나나');
  {
    const four = ['shareIssueClientRange', 'shareIssueOneInvoice', 'shareIssueNotice', 'shareIssuePayslip'];
    /* 각 함수의 **머리 30줄** 안에 `okToWriteNow()` 가 있나 — 사진 올리기·자료 만들기보다 앞이어야 한다 */
    const headHas = (src, name) => {
      const i = src.indexOf('async function ' + name + '(');
      if (i < 0) return 'no-func';
      const head = src.slice(i, i + 1400);
      return /okToWriteNow\(\)/.test(head);
    };
    four.forEach((f) => ck('★ ' + f + ' 머리에 문지기', headHas(NEW_SRC, f), true));
    ck('  (대조) 옛 판 네 곳은 **하나도 없다**',
      four.filter((f) => headHas(OLD_SRC, f) === true).length, 0);
    /* 문지기 자리 전수 — v288 셋(`saveToFirebase`·`saveCarState`·`rebuildCarData`) + 공유 넷 = **일곱** */
    const gates = (src) => (src.match(/!okToWriteNow\(\)/g) || []).length;
    /* ★★ **그 회차 수는 그 회차 커밋에서** 읽는다 — 작업트리에서 세면 뒷 회차가 문지기를
       더 붙일 때마다 **거짓으로** 깨진다(v295 가 하나, v304/63 이 여섯을 더했다).
       지금 소스는 「**줄지 않았나**」로만 본다 — 문지기를 떼면 그때 잡힌다. */
    const THIS_REF = process.env.COS_API_NEW_REF || '38087ae';   /* v291 — 이 회차 커밋 */
    const THIS_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + THIS_REF + ':index.html',
      { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
    ck('★ 문지기 자리 수(이 회차 커밋)', gates(THIS_SRC), 7);
    ck('  (대조) 옛 판은 셋', gates(OLD_SRC), 3);
    ck('★ 지금 소스는 **줄지 않았다**', gates(NEW_SRC) >= 7 ? 'OK(' + gates(NEW_SRC) + ')' : gates(NEW_SRC),
      'OK(' + gates(NEW_SRC) + ')');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  process.exit(fail ? 1 : 0);
})();
