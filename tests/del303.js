/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드57 보정1 — **차량·«회원» 삭제도 서버 먼저 · 실패하면 멈춤** (v303).
   직원 삭제(v300)와 **같은 꼴**로 맞춘다.
   ① 재현 — 차량 삭제: 기사 PIN(`driverPins`)·묶인 기기(`driverDevices`)를 **아예 안 지웠고**
      도우미 배정(`setCarHelper`)은 **기다리지 않았다**(빈 try/catch) → 지운 차량 PIN 으로 **로그인된다**
   ② 고침 — `removeDriverPin` → `unbindDevice` → `setCarHelper('')` 를 **차례로 기다리고**
      하나라도 실패면 **아무것도 안 지운다**
   ③ «회원» 삭제 — PIN 있으면 `removeMemberPin` 먼저 · 선택 삭제는 **성공한 사람만** 지우고
      「N명 남겨 두었어요」
   ④ ★ **지운 «회원»의 남은 해시로 출석이 찍히나**(서버 `punchMember` 실측 — 위험 등급 판정)
   ⑤ 덧붙임 — 차계부 **고치기**로 다시 열 때 계기판 km 처음 값에 쉼표
   ⑥ 소스 전수 — 「서버에만 있는 것」을 지우는 짝
   ★ 바깥 통신 0 — 가짜 fetch · 가짜 firebase-admin. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');
const D = require('./drvenv.js');
const crypto = require('crypto');

const OLD_REF = process.env.COS_SRC_OLD_REF || 'c2220ad';   /* v302 — 고치기 전 */
const NEW_SRC = fs.readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(58) + String(got).slice(0, 38)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const CARS = [{ id: 'car1', name: '1호차', helperStaffId: 'st1' }, { id: 'car2', name: '2호차' }];
const MEM = [
  { id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '인천 1',
    lat: 37.41, lon: 126.68, phone: '010-1', hasPin: true },
  { id: 2, name: '나다움', carId: 'car1', carIdDrop: 'car1', courseId: 'c1', days: D7,
    location: '인천 2', lat: 37.42, lon: 126.69, phone: '010-2', hasPin: true },
  { id: 3, name: '다가을', carId: 'car2', courseId: 'c1', days: D7, location: '인천 3',
    lat: 37.43, lon: 126.70, phone: '010-3' }                     /* PIN 없음 */
];
const SUF = '__B';

function app(opt) {
  opt = opt || {};
  const src = opt.src || NEW_SRC;
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(opt.members || MEM);
  store['tkd_cars' + SUF] = JSON.stringify(CARS);
  store['tkd_courses' + SUF] = JSON.stringify([{ id: 'c1', name: 'A반', depart: '15:00' }]);
  store['tkd_staff' + SUF] = JSON.stringify([{ id: 'st1', name: '최직원', hasPin: true }]);
  store['tkd_org' + SUF] = JSON.stringify({ name: '가온학원', icon: '🚐', bizType: 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  store['tkd_carlog' + SUF] = JSON.stringify({ records: [
    { id: 'r1', carId: 'car1', date: '2026-11-01', type: 'odo', item: '계기판',
      amount: 0, odo: 123456, odoStart: 123000 }], plans: {} });
  const R = E.build({ src: src, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  const ids = new Set(['admin-content', 'app-content', 'member-list', 'admin-search',
    'main-header', 'today-date', 'org-name-display', 'org-icon', 'confirm-modal',
    'confirm-ok-btn', 'bulk-del-btn', 'driver-att-host']);
  (src.match(/id="[a-zA-Z0-9_-]+"/g) || []).forEach((x) => ids.add(x.slice(4, -1)));
  ['cl-odo', 'cl-amount', 'cl-liters', 'cl-item', 'cl-note', 'cl-date'].forEach((x) => ids.add(x));
  ids.forEach((id) => {
    const el = E.makeEl('input'); el.id = id;
    const bag = {};
    el.setAttribute = (k, v) => { bag[k] = String(v); };
    el.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null);
    el.removeAttribute = (k) => { delete bag[k]; };
    R.byId[id] = el;
  });
  /* 가짜 **서버 전용 칸** — 이 묶음의 핵심은 「여기가 지워졌나 / 남았나」다 */
  const SRV = { driverPins: { 'B_car1': 1 }, driverDevices: { 'B_car1': 1 },
                helperOfCar: { car1: 'st1' }, memberPins: { 'B_1': 1, 'B_2': 1 } };
  const L = { api: [], alerts: [], toasts: [] };
  R.sandbox.alert = R.win.alert = (m) => { L.alerts.push(String(m)); };
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userUid='uB';"
     + " window._userBizType='academy'; window._userPaidUntil=Date.now()+1e9; _firstSyncOk=true;");
  /* ★ `driverAcctApi` 는 로그인 토큰이 없으면 **창구를 부르지도 않고** `{ok:false}` 를 돌려준다 —
     가짜 `_auth` 를 안 깔면 옛 판이 「부른 창구 0」으로 보여 재현이 흐려진다(처음에 그랬다). */
  R.ev("window._auth={ currentUser:{ isAnonymous:false, getIdToken:function(){ return Promise.resolve('tok'); } } };");
  R.ev('showToast = function(m){ window.__t(String(m)); };');
  R.sandbox.__t = R.win.__t = (m) => { L.toasts.push(String(m)); };
  R.ev('saveToFirebase = function(){ return Promise.resolve(true); };'
     + ' saveCarState = function(){ return Promise.resolve(true); };'
     + ' rebuildCarData = function(){}; refreshDriverAttHost = function(){};'
     + ' renderAdminTab = function(){}; renderMembers = function(){};'
     + ' driverInfoLoad = function(){ return Promise.resolve(); };');
  if (opt.demo) R.ev('isDemoMode = function(){ return true; };');
  R.sandbox.fetch = R.win.fetch = async (url, init) => {
    const body = JSON.parse((init && init.body) || '{}');
    L.api.push(body);
    const failAt = opt.failAt || '';
    if (body.action === failAt) {
      if (opt.mode === 'expired') {
        return { json: async () => ({ ok: false, why: 'expired',
          message: '업체 이용 기간이 끝났어요. 연장하시면 바로 다시 됩니다.' }) };
      }
      return { json: async () => ({ ok: false, message: '지우지 못했어요.' }) };
    }
    if (body.action === 'removeDriverPin') {
      delete SRV.driverPins['B_' + body.carId];
      delete SRV.driverDevices['B_' + body.carId];     /* 서버는 기기도 같이 지운다 */
      return { json: async () => ({ ok: true }) };
    }
    if (body.action === 'unbindDevice') {
      delete SRV.driverDevices['B_' + (body.carId || '')];
      return { json: async () => ({ ok: true }) };
    }
    if (body.action === 'setCarHelper') {
      if (!body.staffId) delete SRV.helperOfCar[body.carId];
      else SRV.helperOfCar[body.carId] = body.staffId;
      return { json: async () => ({ ok: true }) };
    }
    if (body.action === 'removeMemberPin') {
      delete SRV.memberPins['B_' + body.memberId];
      return { json: async () => ({ ok: true }) };
    }
    return { json: async () => ({ ok: true }) };
  };
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses(); staff = loadStaff();');
  return { R, SRV, L };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* 확인 창의 「삭제」를 누른 것 — `confirmOk()` 는 async 콜백을 안 기다리므로 직접 받아 기다린다 */
const press = async (p, code) => {
  p.R.ev(code);
  const cb = p.R.sandbox._confirmCallback;
  if (typeof cb !== 'function') return 'NOCB';
  try { await cb(); } catch (e) { return 'THROW:' + e.message; }
  await wait(40);
  return 'ok';
};
const carNames = (p) => p.R.ev('loadCars().map(function(c){return c.name;}).join(",")');
const memNames = (p) => p.R.ev('loadMembers().map(function(m){return m.name;}).join(",")');
const srvCar = (p) => Object.keys(p.SRV.driverPins).join(',') + '|'
  + Object.keys(p.SRV.driverDevices).join(',') + '|' + JSON.stringify(p.SRV.helperOfCar);
const srvMem = (p) => Object.keys(p.SRV.memberPins).join(',');

(async () => {
  console.log('════ ① 재현 — 차량 삭제가 서버를 안 지웠다 (고치기 전 ' + OLD_REF + ')');
  {
    const o = app({ src: OLD_SRC });
    await press(o, 'currentCarTab=0; deleteCurrentCar();');
    ck('[옛] 차량은 지워졌다', carNames(o), '2호차');
    ck('[옛] ★ 기사 PIN·기기가 **서버에 남았다**',
      Object.keys(o.SRV.driverPins).join(',') + '|' + Object.keys(o.SRV.driverDevices).join(','),
      'B_car1|B_car1');
    ck('[옛] 부른 창구', o.L.api.map((x) => x.action).join(',') || '없음', 'setCarHelper');
    ck('[옛]   그것도 **기다리지 않았다**(빈 try/catch)',
      /try\{ driverAcctApi\(\{ action:'setCarHelper'[\s\S]{0,90}?\}catch\(e\)\{\}/.test(OLD_SRC), true);
    ck('[옛] «회원» 배정은 비웠다', o.R.ev('String(loadMembers()[0].carId)') === '' ? '비움' : '남음', '비움');
  }

  console.log('\n② 고침 — 셋을 차례로 기다리고, 하나라도 실패면 **아무것도 안 지운다**');
  {
    /* 성공 길 */
    const p = app({});
    await press(p, 'currentCarTab=0; deleteCurrentCar();');
    ck('부른 창구 **셋**(차례대로)', p.L.api.map((x) => x.action).join(','),
      'removeDriverPin,unbindDevice,setCarHelper');
    ck('★ 서버가 깨끗해졌다(PIN|기기|도우미)', srvCar(p), '||{}');
    ck('차량이 지워졌다', carNames(p), '2호차');
    ck('  «회원» 등원·하원 배정도 비웠다',
      p.R.ev('loadMembers().map(function(m){return (m.carId||"-")+"/"+(m.carIdDrop||"-");}).join(" ")'),
      '-/- -/- car2/-');
    ck('  안내창은 안 뜬다', p.L.alerts.length, 0);

    /* 실패 길 — 셋 가운데 어디서 걸려도 아무것도 안 지운다 */
    for (const at of ['removeDriverPin', 'unbindDevice', 'setCarHelper']) {
      const q = app({ failAt: at });
      await press(q, 'currentCarTab=0; deleteCurrentCar();');
      ck('[' + at + ' 실패] ★ 차량이 **그대로**', carNames(q), '1호차,2호차');
      ck('[' + at + ' 실패] ★ «회원» 배정도 그대로',
        q.R.ev('String(loadMembers()[0].carId)'), 'car1');
      ck('[' + at + ' 실패] 안내가 한 번', q.L.alerts.length, 1);
      ck('[' + at + ' 실패] 안내 글',
        /서버에서 이 차량의 기사 PIN·기기·동승 배정을 지우지 못해 삭제를 멈췄어요/.test(q.L.alerts[0] || ''), true);
    }
    /* 기간 끝은 서버 안내 그대로 */
    const r2 = app({ failAt: 'removeDriverPin', mode: 'expired' });
    await press(r2, 'currentCarTab=0; deleteCurrentCar();');
    ck('★ 기간 끝은 **서버 안내 그대로**',
      /이용 기간이 끝났어요[\s\S]*연장/.test(r2.L.alerts[0] || ''), true);
    /* 둘러보기는 서버를 안 부른다 */
    const r3 = app({ demo: true, failAt: 'removeDriverPin' });
    await press(r3, 'currentCarTab=0; deleteCurrentCar();');
    ck('★ 둘러보기는 서버를 안 부른다', r3.L.api.length, 0);
    ck('  화면에서는 지워진다(종전 그대로)', carNames(r3), '2호차');
    /* 도우미 배정이 없는 차량 — `setCarHelper` 는 안 부른다(종전과 같다) */
    const r4 = app({});
    await press(r4, 'currentCarTab=1; deleteCurrentCar();');
    ck('도우미 없는 차량 — 부른 창구 둘', r4.L.api.map((x) => x.action).join(','),
      'removeDriverPin,unbindDevice');
    ck('  지워졌다', carNames(r4), '1호차');
  }

  console.log('\n③ «회원» 삭제 — PIN 있으면 서버 먼저 · 선택 삭제는 성공한 사람만');
  {
    /* 한 명 — 성공 */
    const p = app({});
    await press(p, 'deleteMemberById(1);');
    ck('지워졌다', memNames(p), '나다움,다가을');
    ck('★ 서버 PIN 도 지워졌다', srvMem(p), 'B_2');
    ck('부른 창구', p.L.api.map((x) => x.action + ':' + x.memberId).join(','), 'removeMemberPin:1');

    /* 한 명 — 실패하면 아무것도 안 지운다 */
    const q = app({ failAt: 'removeMemberPin' });
    await press(q, 'deleteMemberById(1);');
    ck('★ 실패하면 **그대로**', memNames(q), '가하은,나다움,다가을');
    ck('  안내가 한 번', q.L.alerts.length, 1);
    ck('  안내 글', /서버에서 이 .*PIN 을 지우지 못해 삭제를 멈췄어요/.test(q.L.alerts[0] || ''), true);
    ck('  서버도 그대로(다시 시도 가능)', srvMem(q), 'B_1,B_2');

    /* PIN 없는 «회원» — 서버를 안 부른다 */
    const r2 = app({ failAt: 'removeMemberPin' });
    await press(r2, 'deleteMemberById(3);');
    ck('PIN 없는 «회원» — 서버 호출 0', r2.L.api.length, 0);
    ck('  바로 지워졌다', memNames(r2), '가하은,나다움');

    /* 선택 삭제 — 셋 가운데 하나만 실패 */
    const r3 = app({});
    /* 「2번만 실패」를 만든다 */
    const base = r3.R.sandbox.fetch;
    r3.R.sandbox.fetch = r3.R.win.fetch = async (url, init) => {
      const body = JSON.parse((init && init.body) || '{}');
      if (body.action === 'removeMemberPin' && String(body.memberId) === '2') {
        r3.L.api.push(body);
        return { json: async () => ({ ok: false, message: '지우지 못했어요.' }) };
      }
      return base(url, init);
    };
    await press(r3, '_memberSel={1:true,2:true,3:true}; bulkDeleteMembers();');
    ck('★ 성공한 사람만 지워졌다(2번은 남았다)', memNames(r3), '나다움');
    ck('★ 서버 PIN 은 1번만 지워졌다', srvMem(r3), 'B_2');
    ck('★ 「남겨 두었어요」 안내',
      /1.*(명|곳).*서버 PIN 을 못 지워 남겨 두었어요/.test(r3.L.toasts.concat(r3.L.alerts).join(' | ')), true);
    ck('  고른 것에서 **실패한 사람만** 남는다', r3.R.ev('Object.keys(_memberSel).join(",")'), '2');
  }

  console.log('\n════ ④ ★ 지운 «회원»의 **남은 해시로 출석이 찍히나** (서버 실측)');
  {
    /* 서버 `punchMember` 는 해시로 id 를 찾은 뒤 **명단에서 그 id 를 다시 찾는다** —
       명단에 없으면 `me` 가 비어 404 `nomember` 가 된다(출석이 안 찍힌다). */
    const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
    const SECRET = 'SEKRIT-TEST', ORG = 'academy_owner1', OWNER = 'OWNER1';
    const NOW = Date.UTC(2026, 9, 31, 11, 20, 0), DAY = 86400000;
    const S = D.makeState({ now: NOW });
    S.docs['users/' + OWNER] = { orgId: ORG, approved: true, withdrawn: false,
      paidUntil: NOW + 30 * DAY, plan: 'paid' };
    /* 명단에는 **1번이 없다**(지웠다) · 서버 해시는 **남아 있다** */
    S.docs['orgs/' + ORG + '/data/members'] = {
      value: JSON.stringify([{ id: 2, name: '나다움', phone: '010-2' }]), updatedAt: 1 };
    S.docs['memberPins/' + ORG + '_1'] = { org: ORG, memberId: '1',
      pinHash: sha('1111' + '|' + ORG + '|' + SECRET), updatedAt: 1 };
    S.tokens = { ownerTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } } };
    S.env = { FIREBASE_SERVICE_ACCOUNT: '{"project_id":"x"}', OTP_SECRET: SECRET };
    const r = await D.call(D.SRC.drv, S,
      { action: 'pinCheckin', org: ORG, pin: '1111', member: true }, 'ownerTok', '1.2.3.4');
    ck('★ 지운 «회원» PIN 으로 찍으면', r.code + '/' + ((r.body || {}).why || ''), '404/nomember');
    ck('★ 출석 문서가 안 생겼다',
      String(S.docs['orgs/' + ORG + '/data/attendance'] || null), 'null');
    console.log('      → 남은 해시로는 **출석이 찍히지 않는다**. 위험은 「하」 그대로다');
    console.log('        (남는 피해는 「그 번호를 다른 «회원» 에게 줄 때 겹침으로 걸린다」 하나다)');
    /* 대조 — 명단에 있으면 찍힌다(검사가 살아 있다는 뜻) */
    const S2 = D.makeState({ now: NOW });
    S2.docs['users/' + OWNER] = S.docs['users/' + OWNER];
    S2.docs['orgs/' + ORG + '/data/members'] = {
      value: JSON.stringify([{ id: 1, name: '가하은', phone: '010-1' }]), updatedAt: 1 };
    S2.docs['memberPins/' + ORG + '_1'] = S.docs['memberPins/' + ORG + '_1'];
    S2.tokens = S.tokens; S2.env = S.env;
    const r2 = await D.call(D.SRC.drv, S2,
      { action: 'pinCheckin', org: ORG, pin: '1111', member: true }, 'ownerTok', '1.2.3.4');
    ck('  (대조) 명단에 있으면 찍힌다', r2.code + '/' + ((r2.body || {}).kind || ''), '200/member');
  }

  console.log('\n⑤ 덧붙임 — 차계부 **고치기**로 다시 열 때 계기판 km 에 쉼표');
  {
    /* 차계부 **고치기** 창을 그리는 함수는 `renderCarlogModal()` 이다(소스로 확인).
       가짜 DOM 에서 끝까지 그려지지 않을 수 있으니 **쓴 HTML** 에서 칸을 뽑고,
       그래도 안 되면 소스로 본다(어느 쪽으로 확인했는지 아래 줄에 찍는다). */
    const odoVal = (src) => {
      const P = app({ src: src });
      return P.R.ev('(function(){ try{'
        + ' carlogEditId="r1"; carlogType="odo"; carlogOdoWhen="end"; carlogCarId="car1";'
        + ' var box=document.getElementById("carlog-modal")||document.getElementById("admin-content");'
        + ' if(typeof renderCarlogModal==="function") renderCarlogModal();'
        + ' var h=String((box&&box.innerHTML)||"");'
        + ' var m=/id="cl-odo"[^>]*value="([^"]*)"/.exec(h);'
        + ' return m ? m[1] : "NOFORM"; }catch(e){ return "NOFORM"; } })()');
    };
    const ov = odoVal(OLD_SRC), nv = odoVal(NEW_SRC);
    console.log('      (화면에서 뽑기: 옛 ' + ov + ' · 새 ' + nv + ')');
    if (ov === 'NOFORM' || nv === 'NOFORM') {
      /* 화면 함수 이름이 다르면 **소스로** 본다(그래도 사실은 확인된다) */
      ck('[옛] `_odoVal` 이 쉼표 없이 들어갔다',
        /value="'\+_odoVal\+'"/.test(OLD_SRC), true);
      ck('★ [새] `_odoVal` 을 `fmtNum` 으로 채운다',
        /var _odoVal = _odoRaw===''\? '' : fmtNum\(_odoRaw\);/.test(NEW_SRC), true);
      ck('  (대조) 옛 판은 생값을 그대로 넣었다',
        /var _odoVal = \(carlogType==='odo'/.test(OLD_SRC), true);
    } else {
      ck('[옛] 쉼표 없음', ov, '123456');
      ck('★ [새] 쉼표', nv, '123,456');
    }
    /* 읽기는 그대로 숫자 */
    const p2 = app({});
    ck('  읽을 때는 숫자(`numOf`)',
      p2.R.ev('(function(){ var e=document.getElementById("cl-odo"); e.value="123,456";'
        + ' return numOf(e); })()'), 123456);
    /* 처음 값을 채우는 **쉼표 칸 전수** — 쉼표 없이 채우는 곳이 0이어야 한다 */
    const prefills = (NEW_SRC.match(/oninput="fmtAmountInput\(this\)[^>]*value="[^"]*"|value="[^"]*"[^>]*oninput="fmtAmountInput\(this\)/g) || []);
    /* ★ `value="'+_odoVal+'"` 처럼 **변수를 끼우는** 자리는 그 변수가 어떻게 만들어졌나로 본다 —
       `_odoVal` 은 위에서 `fmtNum` 으로 만든다(그래서 쉼표가 든다). */
    const madeWithFmt = (v) => {
      const nm = /^'\+([A-Za-z_$][\w$]*)\+'$/.exec(String(v).trim());
      if (!nm) return false;
      /* 정규식을 만들지 않고 **글자로** 본다(괄호 escape 로 두 번 깨졌다) */
      const at = NEW_SRC.indexOf('var ' + nm[1] + ' = ');
      if (at < 0) return false;
      const stmt = NEW_SRC.slice(at, NEW_SRC.indexOf(';', at) + 1);
      return stmt.indexOf('fmtNum(') >= 0;
    };
    const noComma = prefills.filter((s) => {
      const m = /value="([^"]*)"/.exec(s);
      if (!m || !m[1]) return false;
      if (/toLocaleString|fmtNum/.test(m[1])) return false;
      return !madeWithFmt(m[1]);
    });
    ck('★ 쉼표 칸 가운데 **쉼표 없이** 처음 값을 채우는 곳',
      noComma.length ? noComma.map((s) => (/value="([^"]*)"/.exec(s) || [])[1]).join(' | ') : '0곳', '0곳');
  }

  console.log('\n⑥ 소스 전수 — 직원 삭제(v300)와 같은 꼴인가');
  {
    const bodyOf = (src, fn) => {
      const f = src.slice(src.indexOf('function ' + fn + '('));
      return f.slice(0, f.indexOf('\n}\n')).replace(/\/\*[\s\S]*?\*\//g, '');
    };
    const car = bodyOf(NEW_SRC, 'deleteCurrentCar');
    ck('★ 차량: 서버 셋이 `cars.splice` **앞**이다',
      car.indexOf("action:'setCarHelper'") >= 0 && car.indexOf("action:'setCarHelper'") < car.indexOf('cars.splice'),
      true);
    /* 셋을 **고리(for)로 차례로** 기다린다 — `await` 글자는 한 번이지만 돌 때는 세 번이다
       (실제로 세 번 부르는 것은 ②가 창구 순서로 확인한다). */
    ck('  차량: `await` 로 기다린다', (car.match(/await driverAcctApi\(/g) || []).length, 1);
    ck('  차량: 셋을 차례로 도는 고리',
      /_steps\.length[\s\S]{0,200}?await driverAcctApi\(_steps\[_si\]\)/.test(car), true);
    ck('  차량: 창구 셋이 적혀 있다',
      ["removeDriverPin", "unbindDevice", "setCarHelper"].every((a) => car.indexOf(a) >= 0), true);
    ck('  차량: 빈 try/catch 가 없다', /\}catch\(e\)\{\}/.test(car), false);
    /* 서버 지우기는 **공용 함수 한 벌**(`_memberPinWipe`)로 모았다 — 한 명 삭제와 선택 삭제가
       같은 코드를 쓴다(복사해 두면 한쪽만 고쳐진다 · 이 저장소의 반복 교훈). */
    ck('★ «회원»: 서버 지우기가 **한 벌**(`_memberPinWipe`)',
      (NEW_SRC.match(/^async function _memberPinWipe\(/mg) || []).length, 1);
    ck('  그 함수가 `removeMemberPin` 을 부른다',
      /_memberPinWipe[\s\S]{0,500}?action:'removeMemberPin'/.test(NEW_SRC), true);
    const mem = bodyOf(NEW_SRC, 'deleteMemberById');
    ck('★ «회원»: 서버가 `members = members.filter` **앞**이다',
      mem.indexOf('_memberPinWipe') >= 0
        && mem.indexOf('_memberPinWipe') < mem.indexOf('members = members.filter'), true);
    const bulk = bodyOf(NEW_SRC, 'bulkDeleteMembers');
    ck('  선택 삭제도 서버 먼저', bulk.indexOf('_memberPinWipe') >= 0
      && bulk.indexOf('_memberPinWipe') < bulk.indexOf('members=members.filter'), true);
    ck('  (대조) 옛 판은 서버를 아예 안 불렀다',
      /removeMemberPin|_memberPinWipe/.test(bodyOf(OLD_SRC, 'deleteMemberById')), false);
    ck('★ `api/`·`lib/`·규칙은 **한 줄도** 안 바뀌었다',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' -- api lib firestore.rules',
        { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    ck('  버전 303 이상', appV >= 303, true);
    ck('  `version.json` 과 같다',
      String(JSON.parse(fs.readFileSync(COS_ROOT + '/version.json', 'utf8')).version), String(appV));
    /* 61 기본 원칙이 그대로인가 */
    ck('  (61-1) `fmtNum`·`numOf` 한 벌 그대로',
      (NEW_SRC.match(/^function fmtNum\(/mg) || []).length + '/' + (NEW_SRC.match(/^function numOf\(/mg) || []).length,
      '1/1');
    ck('  (61-2) 카톡 변수 둘 그대로',
      (NEW_SRC.match(/--kakao[a-z-]*:/g) || []).length, 2);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 가짜 fetch · 가짜 firebase-admin');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
