/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드59-A — **업체 분리 조사 묶음**(고치지 않는다 · 지금 이렇게 된다를 숫자로 적는다).
   뿌리: 서버는 「로그인한 업체」(`_userOrgId`)로 나뉘는데 기기 저장 칸은 `curOrgId()` →
         **주소의 `?org=` 만** 본다 → cosroad.com 이면 모든 업체가 `cosroad_default` 한 칸을 쓴다.
   보는 것:
     ① A 로그아웃 → B 로그인 때 **B 에게 남는 기기 저장 칸**(업체별/공용)
     ② **동기화가 끝나기 전에** 저장하면 어디로 가나(★ 가장 위험한 자리)
     ③ 로그아웃이 거두지 않는 **메모리 전역**
   ★ 이 묶음은 **조사 기록**이다 — 고친 회차가 생기면 기대값과 보고문을 같이 고친다
     (`tests/README.md` 규칙). 실제 쓰기 0 · 문자 0. */
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 40)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM_A = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: 'A주소', lat: 37.41, lon: 126.68, phone: '010-1' }];
const MEM_B = [{ id: 1, name: '나래비', carId: 'car1', courseId: 'c1', days: D7, location: 'B주소', lat: 37.51, lon: 126.78, phone: '010-9' }];
const CARS = [{ id: 'car1', name: '1호차', driver: '', phone: '', plate: '' }];
const COURSES = [{ id: 'c1', name: 'A반', depart: '15:00' }];
const SUF = '__cosroad_default';

function emptyCar(o) {
  return Object.assign({ ride: {}, rideOff: {}, carlog: { records: [], plans: {} },
                         delivDone: {}, dropDone: {}, att: {} }, o || {});
}
function makeServer(init) { return { byOrg: JSON.parse(JSON.stringify(init || {})), writes: [], listeners: [], live: 0 }; }

function phone(SRV, opt) {
  opt = opt || {};
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(MEM_A);
  store['tkd_cars' + SUF]    = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify(COURSES);
  store['tkd_org' + SUF]     = JSON.stringify({ name: 'A학원', icon: '🅰', bizType: 'academy',
    destName: 'A학원', destLat: 37.44, destLon: 126.65, bankAccount: 'A은행 111' });
  store['tkd_ridestate' + SUF] = JSON.stringify({ '1': { on: false } });   /* A 가 끈 상태 */
  store['tkd_certificates']    = JSON.stringify([{ id: 1, name: 'A학원 자격증' }]);  /* 꼬리가 없다! */
  store['tkd_staff' + SUF]     = JSON.stringify([{ id: 'st1', name: 'A직원' }]);
  const R = E.build({ src: opt.src || E.SRC_NEW, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-screen', 'admin-screen', 'fb-loading', 'member-screen',
   'member-list', 'main-header', 'today-date', 'org-name-display', 'org-icon', 'login-screen',
   'main-app', 'bottom-action', 'mode-badge', 'header-btns', 'filter-chips', 'search-input',
   'day-tabs', 'member-add-area', 'drive-tabs']
   .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });
  const bag = (org, col) => {
    SRV.byOrg[org] = SRV.byOrg[org] || {};
    SRV.byOrg[org][col] = SRV.byOrg[org][col] || {};
    return SRV.byOrg[org][col];
  };
  R.sandbox._firestore = R.win._firestore = {
    doc: (db, c1, org, col, k) => ({ org: org, col: col, key: k }),
    collection: (db, c1, org, col) => ({ org: org, col: col }),
    getDoc: async (ref) => {
      const src = bag(ref.org, ref.col);
      const has = Object.prototype.hasOwnProperty.call(src, ref.key);
      return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
    },
    getDocs: async (ref) => {
      const src = bag(ref.org, ref.col);
      return { forEach: (cb) => Object.keys(src).forEach((k) =>
        cb({ id: k, data: () => ({ value: JSON.stringify(src[k]) }) })) };
    },
    setDoc: async (ref, d) => {
      SRV.writes.push('set ' + ref.org + '/' + ref.col + '/' + ref.key);
      bag(ref.org, ref.col)[ref.key] = d.value !== undefined ? JSON.parse(d.value) : d;
    },
    deleteDoc: async () => {},
    runTransaction: async (db, fn) => await fn({
      get: async (ref) => {
        const src = bag(ref.org, ref.col);
        const has = Object.prototype.hasOwnProperty.call(src, ref.key);
        return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
      },
      set: (ref, d) => {
        SRV.writes.push('tx ' + ref.org + '/' + ref.col + '/' + ref.key);
        bag(ref.org, ref.col)[ref.key] = JSON.parse(d.value);
      }
    }),
    /* ★ v289(59-B4): 해지 함수를 **진짜로** 돌려준다 — 떼면 `live` 가 줄어든다.
       (전에는 빈 함수를 돌려줘서 「떼었는가」를 잴 수 없었다.) */
    onSnapshot: (ref, cb) => {
      const rec = { org: ref.org, col: ref.col, key: ref.key, alive: true };
      SRV.listeners.push(rec);
      SRV.live = (SRV.live || 0) + 1;
      return () => { if (rec.alive) { rec.alive = false; SRV.live--; } };
    }
  };
  R.sandbox._db = R.win._db = {};
  R.ev("currentMode='admin';");
  R.ev("window.__al=[]; alert=function(m){ window.__al.push(String(m)); };");
  R.ev("window._userPaidUntil=Date.now()+30*86400000; window._userBizType='academy';");
  return { R, SRV };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SERVER = {
  A: { carState: { car1: emptyCar({ ride: { '1': { on: true } } }) },
       data: { members: MEM_A, cars: CARS, courses: COURSES, migration: { carState: true },
               org: { name: 'A학원', icon: '🅰', bizType: 'academy', bankAccount: 'A은행 111' } } },
  B: { carState: { car1: emptyCar({ ride: { '1': { on: true } } }) },
       data: { members: MEM_B, cars: CARS, courses: COURSES, migration: { carState: true },
               org: { name: 'B학원', icon: '🅱', bizType: 'academy', bankAccount: 'B은행 222' } } }
};

(async () => {
  console.log('════ ① A 로그아웃 → B 로그인: **B 에게 남는 기기 저장 칸**');
  {
    const p = phone(makeServer(SERVER), {});
    p.R.ev("window._userOrgId='A'; window._userUid='uA';");
    p.R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses(); orgSettings = loadOrgSettings();');
    /* 로그아웃이 하는 일(전역 비우기) — DOM 없는 자리는 try 로 넘긴다 */
    p.R.ev('try{ csQueueReset(); }catch(e){}');
    p.R.ev("window._userOrgId='B'; window._userUid='uB';");
    /* B 가 들어온 **직후**(동기화 전) 화면이 읽는 값 */
    ck('B 가 보는 «회원» 이름 (동기화 전)', p.R.ev("JSON.stringify((loadMembers()[0]||{}).name)"), '"가하은"');
    ck('B 가 보는 업체 이름', p.R.ev("JSON.stringify(loadOrgSettings().name)"), '"A학원"');
    ck('B 가 보는 입금 계좌', p.R.ev("JSON.stringify(loadOrgSettings().bankAccount||null)"), '"A은행 111"');
    ck('B 가 보는 직원', p.R.ev("JSON.stringify((loadStaff()[0]||{}).name)"), '"A직원"');
    ck('B 가 보는 탑승 토글', p.R.ev("JSON.stringify(loadRideState()['1'])"), '{"on":false}');
    ck('★ 자격증은 **꼬리조차 없다**(업체 구분 0)',
      p.R.ev("JSON.stringify((loadCertificates()[0]||{}).name)"), '"A학원 자격증"');
    ck('납품 완료 키는 **로그인한 업체**로 갈린다', p.R.ev("deliveryDoneKey()"), 'tkd_delivery_done_B');
    ck('하차 완료 키도 그렇다', p.R.ev("dropoffDoneKey()"), 'tkd_dropoff_done_B');
    ck('「로그인 유지」 키도 그렇다', p.R.ev("keepLoginKey()"), 'tkd_keeplogin_B');
    /* ★ 명단 키가 **업체별로 갈리는지**를 직접 재 본다 —
       B 로 넣고 A 로 바꿔 읽었을 때 **같은 값이 나오면 안 갈린 것**이다. */
    ck('★ 명단 키는 **안 갈린다**(B 로 넣고 A 로 읽어도 같다)',
      p.R.ev("(function(){"
           + " window._userOrgId='B'; localStorage.setItem('tkd_members', JSON.stringify([{id:9,name:'B만'}]));"
           + " window._userOrgId='A'; var a=(JSON.parse(localStorage.getItem('tkd_members')||'[]')[0]||{}).name;"
           + " window._userOrgId='B'; return JSON.stringify(a); })()"),
      '"B만"');
  }

  console.log('\n════ ② ★ 동기화가 끝나기 전에 저장하면 **어디로** 가나');
  {
    const SRV = makeServer(SERVER);
    const p = phone(SRV, {});
    p.R.ev("window._userOrgId='A'; window._userUid='uA';");
    p.R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
    p.R.ev('try{ csQueueReset(); }catch(e){}');
    p.R.ev("window._userOrgId='B'; window._userUid='uB';");
    /* B 로 들어온 직후 — **동기화를 아직 안 돌렸다**. 사람이 토글 하나를 누른다. */
    p.R.ev("(function(){ var st=loadRideState(); st['1']={on:false};"
         + " localStorage.setItem('tkd_ridestate', JSON.stringify(st)); })()");
    await p.R.ev('saveCarState()');
    await wait(300);
    ck('B 서버 차량 기록 **그대로**(v288에서 고침)',
      JSON.stringify((((SRV.byOrg.B || {}).carState || {}).car1 || {}).ride || {}), '{"1":{"on":true}}');
    /* 명단 저장(주소 고침 등)도 같은 창에서 */
    SRV.writes.length = 0;
    await p.R.ev("(function(){ try{ saveMembers(members); }catch(e){} })()");
    await wait(300);
    /* ★★ v288(59-B2)에서 **고쳤다** — 첫 동기화가 끝나기 전에는 서버로 쓰지 않는다.
       그래서 아래 두 칸은 「올라갔다」가 아니라 **「B 서버가 그대로」**여야 한다.
       고치기 전/뒤 대조는 `tests/sync288.js` 가 본다(여기는 조사 기록을 남겨 둔다). */
    ck('B 서버 명단 **그대로**(v288에서 고침)',
      JSON.stringify((((SRV.byOrg.B || {}).data || {}).members || [{}])[0].name || null), '"나래비"');
    ck('  (A 서버 명단은 그대로)',
      JSON.stringify((((SRV.byOrg.A || {}).data || {}).members || [{}])[0].name || null), '"가하은"');
  }

  console.log('\n════ ③ 로그아웃이 거두지 않는 메모리 전역');
  {
    const p = phone(makeServer(SERVER), {});
    p.R.ev("window._userOrgId='A'; window._userUid='uA';");
    p.R.ev('members = loadMembers(); orgSettings = loadOrgSettings();');
    p.R.ev('_readOnlyMode = true;');                 /* A 가 기간 끝난 업체였다 */
    p.R.ev('try{ csQueueReset(); }catch(e){}');
    ck('★ `_readOnlyMode` 가 **그대로 참**', p.R.ev('String(isReadOnlyMode())'), 'true');
    ck('메모리 «회원» 사본도 그대로', p.R.ev("JSON.stringify((members[0]||{}).name)"), '"가하은"');
    ck('메모리 업체 설정도 그대로', p.R.ev("JSON.stringify(orgSettings.name)"), '"A학원"');
    ck('기준본은 비워졌다(v286)', p.R.ev("JSON.stringify(_csBase)"), '{}');
    ck('저장 줄도 비워졌다', p.R.ev('String(_csSaveAgain)+"/"+String(_csSaveRun!==null)'), 'false/false');
  }

  console.log('\n════ ④ 관리자 리스너가 **로그아웃 뒤에도 로컬을 덮나** (59-B1 재현)');
  {
    const SRV = makeServer(SERVER);
    const p = phone(SRV, {});
    p.R.ev("window._userOrgId='A'; window._userUid='uA';");
    await p.R.ev('syncFromFirebase()');
    await wait(400);
    const n1 = SRV.listeners.length;
    ck('A 로그인 한 번에 붙은 리스너 수', n1, 17);
    console.log('      (붙은 리스너 ' + n1 + '개 — carState 컬렉션 1 + data 키들)');
    /* 로그아웃이 하는 일만(새로 받기는 스텁에 창이 없다) */
    p.R.ev('try{ csQueueReset(); }catch(e){}');
    /* ★★ v289(59-B4)에서 고쳤다 — 관리자 리스너도 해지 함수를 들고,
       `logout()` 이 뗀다. 그래서 **로그아웃 뒤에는 0개**여야 한다.
       (가짜 onSnapshot 이 해지 함수를 돌려주면 그 수를 줄이도록 아래 셈을 바꿨다.) */
    p.R.ev('try{ stopAdminListeners(); }catch(e){}');
    ck('★ 로그아웃이 리스너를 **뗀다**(v289에서 고침)', SRV.live, 0);
    ck('  (해지 함수를 들고 있는 것은 내 차량·도우미 셋뿐)',
      p.R.ev("String((_carDocUnsub||[]).length) + '/' + String(!!window._helperCarUnsub)"), '0/false');
    /* B 로 들어와 또 동기화하면 **쌓인다** */
    p.R.ev("window._userOrgId='B'; window._userUid='uB';");
    await p.R.ev('syncFromFirebase()');
    await wait(400);
    ck('★ B 동기화 뒤에도 **쌓이지 않는다**(17개 그대로)', SRV.live, 17);
    console.log('      (살아 있는 리스너 ' + SRV.live + '개 — 모두 새 업체 B 를 듣는다)');
    const aLive = SRV.listeners.filter((l) => l.org === 'A' && l.alive).length;
    ck('★ 그중 **앞 업체(A)를 듣는 것은 0개**', aLive, 0);
  }

  console.log('\n════ ⑤ 고친 판 — 로그아웃이 **새로 받기**로 끝나나 (v287)');
  {
    const p = phone(makeServer(SERVER), {});
    p.R.ev("window._userOrgId='A'; window._userUid='uA';");
    /* 창(location)·인증을 흉내 낸다 — signOut 이 끝난 뒤에 가는지 본다 */
    p.R.ev("window.__nav=[]; window.__signOut=0;"
         + " location={ pathname:'/', search:'?x=1', replace:function(u){ window.__nav.push(String(u)); },"
         + "   reload:function(){ window.__nav.push('reload'); } }; window.location=location;"
         + " window._auth={ currentUser:{ uid:'uA' } };"
         + " window._authFns={ signOut:function(){ window.__signOut++;"
         + "   return new Promise(function(r){ setTimeout(function(){ window._auth.currentUser=null; r(); }, 120); }); } };");
    p.R.ev('_readOnlyMode = true;');
    /* ★ 새로 받기 자체는 **창이 진짜여야** 재진다 → 여기서는 「부르는가」만 보고,
       기다림·주소는 아래 ⑥ 에서 `_logoutReload()` 를 직접 재고,
       전체 흐름(자동 재로그인 없음까지)은 **크롬 `run287.js`** 가 본다. */
    p.R.ev('window.__called=0; _logoutReload = function(){ window.__called++; };');
    p.R.ev('try{ logout(); }catch(e){ window.__err=String(e&&e.message); }');
    ck('★ 읽기 전용 표시가 **꺼진다**', p.R.ev('String(isReadOnlyMode())'), 'false');
    ck('★ 새로 받기를 **부른다**', p.R.ev('String(window.__called)'), '1');
    ck('  signOut 도 불렀다', p.R.ev('String(window.__signOut)'), '1');
  }

  /* ★ ⑥ 「`signOut` 이 끝난 뒤에 가는가 · 안 끝나도 제한 뒤에 가는가 · 주소가 그대로인가」는
     **이 스텁에서 못 잰다** — 앱 코드가 보는 전역과 묶음이 넣는 전역이 **다른 객체**라
     로그인 상태를 흉내 낼 수 없다(여러 방법으로 시도해 보고 확인했다).
     → **창이 하나뿐인 실제 크롬**에서 본다: `tests/pw262/run287.js` 의 ⓐⓑ.
     (그래서 앱 쪽은 인증 확인을 `_authStillSignedIn()` **한 함수**로 빼 두었다 —
      크롬에서 그 함수만 바꿔 끼우면 기다림을 정확히 잴 수 있다.) */

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건  ← 기대와 다른 칸이 조사 결과다'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과 (지금 이렇게 된다는 기록)'));
  process.exit(fail ? 1 : 0);
})();
