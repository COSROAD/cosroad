/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드72-B — **배열+id 자료는 「바뀐 레코드만」 얹어 쓴다** (v315).
   ① 재현 — 옛 판은 관리자 둘이 **다른 «회원»** 을 고치면 하나가 **사라졌다**
   ② 고친 뒤 — 넷(members·cars·staff·courses) 모두 **둘 다 남는다**
   ③ 셈 규칙 — 지움이 이김 · 같은 레코드는 나중 이김 · 남이 지운 것을 되살리지 않음 ·
      내가 새로 만든 것은 더함 · `on`/`offOn` 은 견줄 때 뺀다
   ④ 메아리 · 읽기 전용·둘러보기 · 첫 저장(기준본 없음) · 전부 비우기 확인창
   ⑤ 일부러 통째인 자리(복원·전체 삭제)와 기준본 맞춤
   ⑥ 로그아웃 짝(`csQueueReset` 이 기준본·줄·메아리를 비운다)
   ⑦ ★★ **`runTransaction` 이 앱에 들어와 있나** — v277·v282·v295 의 패치 쓰기가
      실서비스에서 돌지 않던 까닭이다(묶음이 가짜로 끼워 넣어 아무도 못 잡았다)
   ⑧ `users/{uid}` 두 곳이 **그 칸만** 쓴다
   ★ 바깥 통신 0 — 가짜 Firestore. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');
const { thisRef, srcAt } = require('./thisref.js');   /* 회차 커밋 찾기 한 벌 */

const OLD_REF = process.env.COS_SRC_OLD_REF || 'cda3a8a';   /* v314 — 고치기 전 */
const THIS_REF = thisRef(315);
const F = (p) => fs.readFileSync(COS_ROOT + '/' + p, 'utf8').replace(/\r\n/g, '\n');
const OLD = (p) => cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':' + p,
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const NEW_SRC = F('index.html'), OLD_SRC = OLD('index.html');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(50)
    + String(got).slice(0, 44) + (ok ? '' : '   (기대 ' + want + ')'));
};

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1' },
  { id: 2, name: '나다움', carId: 'car1', courseId: 'c1', days: D7, location: '인천 2', lat: 37.42, lon: 126.69, phone: '010-2' }
];
const CARS = [{ id: 'car1', name: '1호차', driver: '박기사' }, { id: 'car2', name: '2호차', driver: '김기사' }];
const STAFF = [{ id: 'st1', name: '김직원' }, { id: 'st2', name: '이직원' }];
const COURSES = [{ id: 'c1', name: '오전반' }, { id: 'c2', name: '오후반' }];
const SEED = { members: MEM, cars: CARS, staff: STAFF, courses: COURSES };
const LKEY = { members: 'tkd_members', cars: 'tkd_cars', staff: 'tkd_staff', courses: 'tkd_courses' };

/* 두 관리자가 **같이 보는 한 칸**(문서 하나) */
function makeServer() { const s = {}; Object.keys(SEED).forEach((k) => { s[k] = JSON.stringify(SEED[k]); }); return s; }

/* 관리자 하나 — 서버 값을 받아 둔 상태로 띄운다 */
function admin(SERVER, src, opt) {
  opt = opt || {};
  const SUF = '__B';
  const store = {};
  Object.keys(SEED).forEach((k) => { store[LKEY[k]] = SERVER[k]; });
  store['tkd_notices' + SUF] = '[]';
  store['tkd_org' + SUF] = JSON.stringify({ name: '가온', icon: '🚐', bizType: opt.biz || 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  /* 꼬리 없는 칸도 같이 넣어 둔다(앱이 꼬리를 붙이기 전에 읽는 자리 대비) */
  Object.keys(SEED).forEach((k) => { store[LKEY[k] + SUF] = SERVER[k]; });
  const R = E.build({ src: src || NEW_SRC, biz: opt.biz || 'academy', localStorage: store });
  if (R.error) throw R.error;
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userBizType='" + (opt.biz || 'academy') + "';"
     + " window._userPaidUntil=Date.now()+1e9; _firstSyncOk=true;");
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();'
     + ' staff = loadStaff(); notices = loadNotices(); orgSettings = loadOrgSettings();');
  R.ev('rebuildCarData = function(){}; saveCarState = function(){ return Promise.resolve(true); };'
     + ' renderAdminTab = function(){}; showToast = function(){};');
  /* 가짜 Firestore — 문서 하나(키마다) · 트랜잭션은 **읽고 쓰기**를 그대로 흉내 낸다 */
  R.ev('window.__srvGet = function(k){ return window.__srv(k); };');
  R.sandbox.__srv = R.win.__srv = (k) => SERVER[k] || null;
  R.sandbox.__srvSet = R.win.__srvSet = (k, json) => { SERVER[k] = json; };
  R.ev('window._firestore = {'
     + ' doc: function(){ var p=Array.prototype.slice.call(arguments,1); return { key: p[p.length-1] }; },'
     + ' collection: function(){ return { key:"col" }; },'
     + ' getDoc: async function(ref){ var v = window.__srv(ref.key);'
     + '   return { exists: function(){ return v !== null; }, data: function(){ return { value: v }; } }; },'
     + ' setDoc: async function(ref, obj){ window.__srvSet(ref.key, obj.value); },'
     + ' updateDoc: async function(){}, deleteField: function(){ return "__DEL__"; },'
     + ' deleteDoc: async function(){}, getDocs: async function(){ return { forEach: function(){} }; },'
     + ' onSnapshot: function(){ return function(){}; },'
     + ' runTransaction: async function(db, fn){ return await fn({'
     /* ★ 실제 SDK 는 `exists()` 가 **함수**다(모듈러 v10 `DocumentSnapshot.exists()`) —
        값으로 두면 앱이 `snap.exists is not a function` 으로 조용히 실패한다(한 번 겪음). */
     + '   get: async function(ref){ var v = window.__srv(ref.key);'
     + '     return { exists: function(){ return v !== null; }, data: function(){ return { value: v }; } }; },'
     + '   set: function(ref, obj){ window.__srvSet(ref.key, obj.value); } }); } };');
  R.ev('window._db = {}; window._fbReady = true;');
  R.ev('window._auth = { currentUser: { uid:"uB", isAnonymous:false, getIdToken:function(){ return Promise.resolve("t"); } } };');
  R.ev('_backupBeforeSave = function(){ return Promise.resolve(); };');
  /* 「로그인 동기화로 그 값을 받았다」 — 기준본을 서버 값으로 맞춘다(앱이 하는 일).
     ★ 옛 판(v314)에는 기준본이 아예 없다 — 그래서 있을 때만 맞춘다. */
  if (opt.noBase !== true && R.ev('typeof _lsSetBase === "function"') === true) {
    Object.keys(SEED).forEach((k) => {
      R.ev('_lsSetBase(' + JSON.stringify(k) + ', JSON.parse(' + JSON.stringify(SERVER[k]) + '))');
    });
  }
  return R;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const editSave = async (R, key, id, name) => {
  const v = { members: 'members', cars: 'cars', staff: 'staff', courses: 'courses' }[key];
  R.ev('(function(){ var a=' + v + '; for(var i=0;i<a.length;i++){ if(String(a[i].id)===' + JSON.stringify(String(id))
     + '){ a[i].name=' + JSON.stringify(name) + '; } } '
     + (key === 'members' ? 'saveMembers();' : key === 'cars' ? 'saveCars(cars);'
        : key === 'staff' ? 'saveStaff(staff);' : 'saveCourses(courses);') + ' })()');
  await wait(40);
};
const nameOf = (json, id) => {
  try {
    const a = JSON.parse(json);
    const r = a.find((x) => String(x.id) === String(id));
    return r ? r.name : '(없음)';
  } catch (e) { return '(깨짐)'; }
};
const idsOf = (json) => { try { return JSON.parse(json).map((x) => String(x.id)).join(','); } catch (e) { return '(깨짐)'; } };

(async () => {
  console.log('════ ① 재현 — 옛 판(v314)은 하나가 사라졌다');
  {
    const S = makeServer();
    const A = admin(S, OLD_SRC), B = admin(S, OLD_SRC);
    await editSave(A, 'members', 1, '가하은(A)');
    await editSave(B, 'members', 2, '나다움(B)');
    ck('[옛] A 가 고친 1번', nameOf(S.members, 1), '가하은');          /* 사라졌다 */
    ck('[옛] ★ A 의 수정이 **사라졌다**',
      nameOf(S.members, 1) === '가하은(A)' ? '남았다' : '사라졌다', '사라졌다');
    ck('[옛] B 의 수정은 남았다', nameOf(S.members, 2), '나다움(B)');
  }

  console.log('\n② 고친 뒤 — 넷 모두 **둘 다 남는다**');
  for (const key of ['members', 'cars', 'staff', 'courses']) {
    const S = makeServer();
    const A = admin(S), B = admin(S);
    const ids = Object.keys(listIdsOf(key));
    await editSave(A, key, ids[0], 'A고침');
    await editSave(B, key, ids[1], 'B고침');
    ck('★ [' + key + '] A 의 수정이 남았다', nameOf(S[key], ids[0]), 'A고침');
    ck('  [' + key + '] B 의 수정도 남았다', nameOf(S[key], ids[1]), 'B고침');
    ck('  [' + key + '] 레코드 수 그대로', idsOf(S[key]), ids.join(','));
  }
  function listIdsOf(key) {
    const o = {};
    SEED[key].forEach((r) => { o[String(r.id)] = true; });
    return o;
  }

  console.log('\n③ 셈 규칙 (idDiff·idApply 한 벌)');
  {
    const S = makeServer();
    const R = admin(S);
    const dif = (b, l) => JSON.parse(R.ev('JSON.stringify(idDiff(' + JSON.stringify(b) + ',' + JSON.stringify(l) + '))'));
    const app = (r, p) => JSON.parse(R.ev('JSON.stringify(idApply(' + JSON.stringify(r) + ',' + JSON.stringify(p) + '))'));
    const B0 = [{ id: 1, name: '가' }, { id: 2, name: '나' }];
    ck('바뀐 것만 `put`', JSON.stringify(dif(B0, [{ id: 1, name: '가2' }, { id: 2, name: '나' }]).put), '{"1":{"id":1,"name":"가2"}}');
    ck('지운 것은 `drop`', JSON.stringify(dif(B0, [{ id: 1, name: '가' }]).drop), '["2"]');
    ck('새로 만든 것은 `fresh`', JSON.stringify(dif(B0, B0.concat([{ id: 3, name: '다' }])).fresh), '{"3":true}');
    ck('바뀐 것이 없으면 빈 차이표', R.ev('idPatchEmpty(idDiff(' + JSON.stringify(B0) + ',' + JSON.stringify(B0) + '))'), true);
    ck('★ `on`·`offOn` 은 견줄 때 뺀다',
      R.ev('idPatchEmpty(idDiff(' + JSON.stringify(B0) + ','
        + JSON.stringify([{ id: 1, name: '가', on: true }, { id: 2, name: '나', offOn: false }]) + '))'), true);
    /* 얹기 */
    const Rsrv = [{ id: 1, name: '가(남이고침)' }, { id: 2, name: '나' }];
    ck('★ 같은 레코드는 **나중 이김**',
      JSON.stringify(app(Rsrv, dif(B0, [{ id: 1, name: '가(내가)' }, { id: 2, name: '나' }]))[0]),
      '{"id":1,"name":"가(내가)"}');
    ck('★ **지움이 이긴다**(내가 지운 것)', JSON.stringify(app(Rsrv, dif(B0, [{ id: 1, name: '가' }])).map((x) => x.id)), '[1]');
    ck('★ 남이 지운 것을 **되살리지 않는다**',
      JSON.stringify(app([{ id: 2, name: '나' }], dif(B0, [{ id: 1, name: '가(내가)' }, { id: 2, name: '나' }])).map((x) => x.id)), '[2]');
    ck('  내가 새로 만든 것은 **더한다**',
      JSON.stringify(app([{ id: 2, name: '나' }], dif(B0, B0.concat([{ id: 3, name: '다' }]))).map((x) => x.id)), '[2,3]');
  }

  console.log('\n④ 메아리 · 문지기 · 첫 저장 · 전부 비우기');
  {
    /* 메아리 — 보낸 뒤에 또 고친 것이 안 사라진다 */
    const S = makeServer();
    const A = admin(S);
    A.ev('_lsFlight["members"] = JSON.parse(' + JSON.stringify(S.members) + ');');
    A.ev('(function(){ members[0].name="보낸뒤또고침"; localStorage.setItem("tkd_members", JSON.stringify(members)); })()');
    const got = A.ev('JSON.stringify(lsRebase("members", JSON.parse(' + JSON.stringify(S.members) + '), loadMembers(), _lsFlight["members"]))');
    ck('★ 메아리 — 보낸 뒤 또 고친 것이 남는다', nameOf(got, 1), '보낸뒤또고침');
    /* 읽기 전용·둘러보기 — 얹지 않고 서버 값 그대로 */
    const ro = admin(makeServer());
    ro.ev('isReadOnlyMode = function(){ return true; };');
    ro.ev('(function(){ members[0].name="읽기전용에서고침"; localStorage.setItem("tkd_members", JSON.stringify(members)); })()');
    /* ★ 읽기 전용이면 **얹지 않는다** — 막힌 변경을 다시 얹으면 화면이 안 되돌아온다(v285 ①) */
    ck('★ 읽기 전용이면 **서버 값 그대로**',
      nameOf(ro.ev('JSON.stringify(lsRebase("members", JSON.parse(' + JSON.stringify(S.members) + '), loadMembers()))'), 1),
      nameOf(S.members, 1));
    ck('  (그 서버 값은 「읽기전용에서고침」이 아니다)',
      nameOf(S.members, 1) === '읽기전용에서고침' ? '얹혔다' : '그대로', '그대로');
    const dm = admin(makeServer());
    dm.ev('isDemoMode = function(){ return true; };');
    ck('  둘러보기도 그대로',
      dm.ev('JSON.stringify(lsRebase("members", [{"id":9,"name":"서버"}], [{"id":9,"name":"폰"}]))'),
      '[{"id":9,"name":"서버"}]');
    ck('  둘러보기는 저장도 막는다', await dm.ev('saveListKey("members")'), false);
    /* 첫 저장(기준본 없음) — 종전처럼 통째로 */
    const S2 = makeServer();
    const nb = admin(S2, null, { noBase: true });
    ck('기준본이 없으면 `null`', nb.ev('_lsBase["members"] === null'), true);
    nb.ev('(function(){ members[0].name="첫저장"; localStorage.setItem("tkd_members", JSON.stringify(members)); })()');
    await nb.ev('saveListKey("members")');
    await wait(30);
    ck('★ 첫 저장은 통째로 — 그래도 값이 올라간다', nameOf(S2.members, 1), '첫저장');
    ck('  그 값이 기준본이 된다', nb.ev('_lsBase["members"] !== null'), true);
    /* 전부 비우기 — 묻는다 */
    const S3 = makeServer();
    const ez = admin(S3);
    let asked = 0;
    ez.sandbox.confirm = ez.win.confirm = (m) => { asked++; return false; };
    ez.ev('(function(){ members = []; localStorage.setItem("tkd_members", JSON.stringify(members)); })()');
    const r0 = await ez.ev('saveListKey("members")');
    ck('★ 전부 비우려면 **묻는다**', asked, 1);
    ck('  「아니요」면 안 쓴다', r0 + '/' + idsOf(S3.members), 'false/1,2');
  }

  console.log('\n⑤ 일부러 통째인 자리 — 복원·전체 삭제');
  {
    const S = makeServer();
    const R = admin(S);
    let asked = 0;
    R.sandbox.confirm = R.win.confirm = () => { asked++; return true; };
    R.ev('(function(){ members = []; localStorage.setItem("tkd_members", JSON.stringify(members)); })()');
    await R.ev('saveListKey("members", { whole: true })');
    await wait(30);
    /* ★ 종전(`saveToFirebase` 의 빈 값 가드)과 **같이 한 번만** 묻는다 — 두 번 묻지 않는다.
       대조: 옛 판(v314)도 한 번 물었다(아래 줄이 그 수를 잰다). */
    const S9 = makeServer();
    const O = admin(S9, OLD_SRC);
    let askedOld = 0;
    O.sandbox.confirm = O.win.confirm = () => { askedOld++; return true; };
    O.ev('(function(){ members = []; localStorage.setItem("tkd_members", JSON.stringify(members)); saveMembers(); })()');
    await wait(40);
    ck('★ `whole` 은 **한 번만** 묻는다(옛 판과 같다)', asked + '/' + askedOld, '1/1');
    ck('  통째로 비워진다', idsOf(S.members), '');
    ck('  기준본도 그 값으로', R.ev('JSON.stringify(_lsBase["members"])'), '[]');
    ck('  소스 — 전체 삭제가 `whole` 로 부른다', /saveMembers\(\{ whole: true \}\)/.test(NEW_SRC), true);
    ck('  소스 — 복원은 통째 + 기준본 맞춤',
      /if\(H\('tkd_members'\)\) _lsSetBase\('members', members\);/.test(NEW_SRC), true);
    ck('  복원 네 키 모두', (NEW_SRC.match(/_lsSetBase\('(members|cars|courses|staff)'/g) || []).length >= 4, true);
  }

  console.log('\n⑥ 로그아웃 짝 — `csQueueReset` 이 비운다');
  {
    const R = admin(makeServer());
    R.ev('_lsFlight["cars"] = [{"id":"x"}]; _lsSaving["staff"] = true; _lsAgain["courses"] = true;');
    R.ev('csQueueReset();');
    ck('★ 기준본 넷 모두 `null`',
      R.ev('LIST_KEYS.every(function(k){ return _lsBase[k] === null; })'), true);
    ck('  「보낸 값」도 비운다', R.ev('LIST_KEYS.every(function(k){ return _lsFlight[k] === null; })'), true);
    ck('  줄·한 번 더 표시도 비운다',
      R.ev('LIST_KEYS.every(function(k){ return _lsSaving[k] === false && _lsAgain[k] === false; })'), true);
    /* ★ **부르는 자리**만 센다(`;` 가 붙은 것) — 쪽지 글에 같은 이름이 있어 흐려진다(한 번 겪음) */
    ck('  소스 — 부르는 곳 둘 그대로(로그아웃·차량 바뀜)',
      (NEW_SRC.match(/csQueueReset\(\);/g) || []).length + '곳',
      (OLD_SRC.match(/csQueueReset\(\);/g) || []).length + '곳');
    ck('  업체 표시도 비운다', R.ev('_baseOrg'), '');
  }

  console.log('\n⑥-2 ★★ 업체가 바뀌면 기준본을 **버린다** (같은 탭에서 계정만 바꿔도 바뀐다)');
  {
    /* ★★ 크롬 `run292` 가 잡은 결함 — `csQueueReset()` 은 **로그아웃·차량 바뀜**에서만 불린다.
       같은 탭에서 계정만 바꾸면 업체가 바뀌는데(`getFbOrgId()`), 앞 업체 기준본이 남아 있으면
       새 업체 동기화에서 **앞 업체 id 전부를 「지움」으로 계산**해 **새 업체 명단이 빈다**.
       (차량 id·«회원» id 는 업체 사이에 실제로 겹친다 — v286.) */
    const S = makeServer();
    const R = admin(S);                             /* 업체 B 로 들어왔다 — 기준본은 B 것 */
    ck('기준본이 서 있다(업체 B)', R.ev('_lsBase["members"] !== null'), true);
    ck('  업체 표시가 B', R.ev('_baseOrg'), 'B');
    R.ev('window._userOrgId = "C";');               /* 같은 탭에서 **계정만** 바꿨다 */
    ck('  업체가 C 로 바뀌었다', R.ev('getFbOrgId()'), 'C');
    ck('★ 그 기준본을 **안 쓴다**(없는 것으로 본다)', R.ev('_lsBaseOf("members") === null'), true);
    /* 새 업체 서버값이 들어오면 **그대로** 쓴다(깎지 않는다) */
    const srvC = JSON.stringify([{ id: 1, name: 'C업체 가하은' }, { id: 2, name: 'C업체 나다움' }]);
    const got = R.ev('JSON.stringify(lsRebase("members", JSON.parse(' + JSON.stringify(srvC) + '), loadMembers()))');
    ck('★ 새 업체 명단이 **안 깎인다**', idsOf(got), '1,2');
    ck('  이름도 새 업체 것', nameOf(got, 1), 'C업체 가하은');
    /* 기준본을 세우면 앞 업체 몫은 전부 버려진다 */
    R.ev('_lsSetBase("members", JSON.parse(' + JSON.stringify(srvC) + '));');
    ck('  기준본을 세우면 표시가 C', R.ev('_baseOrg'), 'C');
    ck('  다른 키 기준본은 비워졌다',
      R.ev('_lsBase["cars"] === null && _lsBase["staff"] === null && _lsBase["courses"] === null'), true);
    /* ★ 대조 — 「업체가 그대로면」 기준본을 그대로 쓴다(검사가 살아 있다) */
    const R2 = admin(makeServer());
    ck('★ (대조) 업체가 그대로면 기준본을 쓴다', R2.ev('_lsBaseOf("members") !== null'), true);
  }

  console.log('\n⑦ ★★ `runTransaction` 이 앱에 들어와 있나 (실서비스에서 패치 쓰기가 안 돌던 까닭)');
  {
    const impOf = (s) => (s.match(/import \{([^}]*)\} from "https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.0\/firebase-firestore\.js"/) || ['', ''])[1];
    const expOf = (s) => (s.match(/window\._firestore = \{([^}]*)\}/) || ['', ''])[1];
    ck('[옛] import 에 `runTransaction` 이 **없었다**', /runTransaction/.test(impOf(OLD_SRC)), false);
    ck('[옛] 노출 줄에도 없었다', /runTransaction/.test(expOf(OLD_SRC)), false);
    ck('[옛] 그런데 패치 쓰기 셋이 그것을 썼다',
      (OLD_SRC.match(/var \{ doc, runTransaction/g) || []).length >= 3, true);
    ck('★ 이제 import 에 있다', /runTransaction/.test(impOf(NEW_SRC)), true);
    ck('★ 노출 줄에도 있다', /runTransaction/.test(expOf(NEW_SRC)), true);
    ck('  `updateDoc`·`deleteField` 도 (users 칸만 쓰기용)',
      /updateDoc/.test(impOf(NEW_SRC)) && /deleteField/.test(impOf(NEW_SRC))
      && /updateDoc/.test(expOf(NEW_SRC)) && /deleteField/.test(expOf(NEW_SRC)), true);
    ck('  쪽지에 **왜 안 돌았는지** 적었다', /실서비스에서 한 번도 돌지 않았다/.test(NEW_SRC), true);
  }

  console.log('\n⑧ `users/{uid}` 두 곳 — **그 칸만** 쓴다');
  {
    ck('[옛] 탈퇴가 전체 `setDoc` 이었다',
      /rec\.withdrawn=true; rec\.withdrawnAt=Date\.now\(\);[\s\S]{0,40}return sd\(ref, rec\);/.test(OLD_SRC), true);
    ck('★ 이제 두 칸만 `updateDoc`',
      /ud\(ref, \{ withdrawn: true, withdrawnAt: Date\.now\(\) \}\)/.test(NEW_SRC), true);
    ck('[옛] 테스트 출입도 전체 `setDoc` 이었다', /await sd\(ref, u\);/.test(OLD_SRC), true);
    ck('★ 이제 그 칸만(끄기는 `deleteField`)',
      /await ud\(ref, \{ testAccess: turnOn \? true : df\(\) \}\)/.test(NEW_SRC), true);
    ck('  전체 `setDoc` 으로 users 를 쓰는 곳 0',
      (NEW_SRC.match(/sd\(ref, (rec|u)\)/g) || []).length, 0);
  }

  console.log('\n⑨ 소스 전수');
  {
    ck('★ 네 저장 함수가 모두 `saveListKey` 를 지난다',
      (NEW_SRC.match(/saveListKey\('(members|cars|staff|courses)'/g) || []).length, 4);
    ck('  그 넷에 `saveToFirebase` 직접 쓰기 0',
      (NEW_SRC.match(/saveToFirebase\('(members|cars|staff|courses)',\s*[a-z]/g) || []).length,
      /* 복원·첫 저장·통째 길에서만 쓴다(키를 변수로 넘긴다) */ 3);
    ck('  `idDiff`·`idApply`·`lsRebase` 한 벌',
      (NEW_SRC.match(/^function (idDiff|idApply|lsRebase)\(/mg) || []).length, 3);
    ck('★ 규칙·`storage.rules`·서버 0줄',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF
        + (THIS_REF ? ' ' + THIS_REF : '')
        + ' -- api lib firestore.rules storage.rules', { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
    console.log('      (잰 자리: ' + OLD_REF + ' → ' + (THIS_REF || '작업트리') + ')');
    const panels = (s) => (s.match(/BACK_PANEL_IDS\s*=\s*\[[\s\S]*?\]/) || [''])[0];
    ck('  새 창(덮개) 0', panels(NEW_SRC) === panels(OLD_SRC) ? '그대로' : '바뀜', '그대로');
    ck('  (업체 분리) `ORG_KEYS` 그대로',
      (NEW_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0] === (OLD_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0], true);
    ck('  (업체 분리) 문서 자리는 `getFbOrgId()`',
      /writeListPatch\(getFbOrgId\(\), key, patch\)/.test(NEW_SRC), true);
    ck('  새 `setInterval`·리스너 0',
      (NEW_SRC.match(/setInterval\(/g) || []).length === (OLD_SRC.match(/setInterval\(/g) || []).length
        && (NEW_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length === (OLD_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length, true);
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    ck('  버전 315 이상', appV >= 315 ? 'OK(' + appV + ')' : 'NG(' + appV + ')', 'OK(' + appV + ')');
    ck('  `version.json` 과 같다', String(JSON.parse(F('version.json')).version), String(appV));
    /* ★ 문답표는 **한 줄만** 늘었다 — 「둘이 같은 시간에 고쳐도 되나요」(동시 수정 정책이
       사람에게 보이는 유일한 변화다 · 커밋 전 체크리스트 3). 그 밖은 그대로여야 한다. */
    const QA = (s) => { const i = s.indexOf('var HELP_QA=['); return i < 0 ? '' : s.slice(i, s.indexOf('\n];', i)); };
    const qaN = (s) => (QA(s).match(/\{role:/g) || []).length;
    /* ★★ v319(73-B): 문답표 검사는 **그 회차 커밋**에서 잰다 (CLAUDE.md 「검사 묶음 규칙」) —
       작업트리로 재면 **다음 회차가 문답을 더할 때마다** 거짓으로 깨진다(v315 에 아홉이 그랬다).
       ★ 커밋 전에는 `srcAt('')` 가 **작업트리**를 읽는다 — 그 회차에는 그게 맞다. */
    ck('  문답이 하나만 늘었다', qaN(srcAt(THIS_REF)) - qaN(OLD_SRC), 1);
    ck('  늘어난 것은 「둘이 같은 시간에 고쳐도 되나요」',
      /t:'둘이 같은 시간에 고쳐도 되나요'/.test(NEW_SRC) && !/둘이 같은 시간에/.test(OLD_SRC), true);
    ck('  검색어에 「동시」·「덮어」가 있다',
      /keys:\['동시','둘이','같이쓰','두사람','두기기','덮어'/.test(NEW_SRC), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 가짜 Firestore(문서 하나 · 트랜잭션 흉내)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
