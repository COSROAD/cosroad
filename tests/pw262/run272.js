/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v272 — 기사 폰에 알림장·업체 비밀 칸이 **안 내려오나**, 화면은 v271 과 같은가.
   ★ 바깥 요청은 전부 막고(file:// 만) Firestore 를 **가짜**로 끼운다 —
     그래서 「기사가 어느 키를 달라고 했나」를 글자로 셀 수 있다. 실제 Firestore 쓰기 0.
   ★ 대조 먼저: 옛 판(v271)에서는 org·notices 를 달라고 했고 계좌·도장이 내려왔다. */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const cp = require('child_process');
/* ★ v274: 이 묶음은 **v272 회차 기록**이다 — 화면을 그 회차 커밋에서 띄운다.
   전에는 일하는 폴더를 띄웠다. 그래서 v274 가 기사 읽기 키를 줄이고
   `carData` 사본에서 명단을 받게 바꾸자 이 회차의 기대값이 거짓으로 깨졌다
   (v272 가 틀린 것이 아니다). 지금 화면은 run274.js 가 본다. */
const PIN_REF = process.env.COS_SRC_NEW_REF || '435774d';
const NEW = (function(){
  const f = require('path').join(__dirname, 'pin_run272.html');
  require('fs').writeFileSync(f, require('child_process').execSync(
    'git -C ' + COS_ROOT + ' show ' + PIN_REF + ':index.html', { maxBuffer: 1 << 28 }));
  return f;
})();
const OLD_REF = process.env.COS_SRC_OLD_REF || '5480189';
const OLD = path.join(__dirname, 'old_index272.html');
const BIZ = ['academy', 'public', 'logistics', 'delivery'];
const SIZES = [[390, 844], [360, 640], [1366, 768]];

const SECRET = ['bankAccount', 'stamp', 'bizNo', 'ceo', 'insRates', 'senderPhone', 'address', 'bizCat', 'bizItem', 'supportAlert'];

const ORG_FULL = { name:'가온학원', icon:'🚐', destName:'학원', destLat:37.4467, destLon:126.6516,
  destAddr:'인천 연수구 용담로 111', address:'인천 연수구 용담로 111, 6537호',
  tel:'032-111-2222', phone:'010-3660-3911', bizNo:'635-88-02710', ceo:'문준식',
  bankAccount:'농협 301-0354-8212-31', stamp:'data:image/png;base64,iVBORw0KGgoDOJANG',
  bizCat:'교육', bizItem:'학원', insRates:{ np:4.5 }, senderPhone:'010-3660-3911',
  supportAlert:{ on:true }, bizType:'academy' };
const SEED = {
  members: [
    { id:1, name:'가하은', carId:'car1', courseId:'c1', location:'인천 연수구 용담로 111',
      lat:37.41, lon:126.68, dropLocation:'인천 연수구 앵고개로 22', dropLat:37.42, dropLon:126.69,
      phone:'010-1111-1111', phone2:'010-1111-2222',
      days:['월','화','수','목','금','토','일'], pin:'1001', on:true, offOn:true, monthly:130000 },
    { id:2, name:'나여름', carId:'car2', courseId:'c1', location:'인천 남동구 만수로 33',
      lat:37.45, lon:126.73, phone:'010-2222-1111',
      days:['월','화','수','목','금','토','일'], pin:'1002', on:true, offOn:true, monthly:120000 }
  ],
  cars: [{ id:'car1', name:'1호차', driver:'박기사', phone:'010-9999-1111', plate:'12가3456' },
         { id:'car2', name:'2호차', driver:'김기사', phone:'010-9999-2222', plate:'34나5678' }],
  courses: [{ id:'c1', name:'A반', depart:'15:00' }],
  notices: [{ id:1, ts:1, targets:[1], targetLabel:'가하은 외 2명', content:'알림장 비밀 본문', images:[], sent:false }],
  carlog: { records:[{ id:'cl1', carId:'car1', date:'2026-11-01', type:'주유', amount:50000, odo:1 }], plans:{} },
  driverAtt: { 'car1_2026-11-04': { in:'08:30', out:'' } },
  rideState: {}
};

/* 가짜 Firestore — 어느 키를 달라고 했는지 모으고, 쓴 것도 모은다 */
function stubScript(seed, orgFull, orgDriver) {
  return `(function(){
    window.__asked = []; window.__wrote = [];
    var DOCS = ${JSON.stringify({
      members: seed.members, cars: seed.cars, courses: seed.courses, notices: seed.notices,
      carlog: seed.carlog, driverAtt: seed.driverAtt, rideState: seed.rideState,
      org: orgFull, orgDriver: orgDriver
    })};
    window._db = {};
    window._fbReady = true;
    window._firestore = {
      doc: function(db, c1, org, c2, key){ return { key: key, org: org }; },
      getDoc: async function(ref){
        window.__asked.push(ref.key);
        var has = Object.prototype.hasOwnProperty.call(DOCS, ref.key) && DOCS[ref.key] !== null;
        return { exists: function(){ return has; },
                 data: function(){ return { value: JSON.stringify(DOCS[ref.key]) }; } };
      },
      setDoc: async function(ref, data){ window.__wrote.push({ key: ref.key, value: data && data.value }); },
      onSnapshot: function(ref, cb){ window.__asked.push('listen:' + ref.key); return function(){}; },
      collection: function(){ return {}; }, getDocs: async function(){ return { forEach: function(){} }; },
      deleteDoc: async function(){}
    };
  })();`;
}

async function app(b, w, h, file, biz, orgDriver) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    errs.push(t.slice(0, 140));
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof window.renderDrive === 'function'
    || typeof renderDrive === 'function', {}, { timeout: 20000 });
  const orgFull = Object.assign({}, ORG_FULL, { bizType: biz });
  await p.evaluate(stubScript(SEED, orgFull, orgDriver));
  p.__errs = errs;
  return p;
}

/* 기사 모드로 동기화까지 돌린다 → 폰에 남은 것을 본다 */
async function asDriver(p, biz) {
  return p.evaluate(async (biz) => {
    window.__alerts = []; window.alert = (m) => window.__alerts.push(String(m));
    window.confirm = () => true; window.open = () => null;
    /* 기사 상태 — 로그인 때 _userBizType 를 **안 받는다**(2789행) */
    try { currentMode = 'driver'; } catch (e) {}
    window.currentMode = 'driver';
    window._isDriverAcct = true; window._driverCarId = 'car1';
    window._driverOrg = 'academy_X'; window._userUid = 'drv_academy_X_car1';
    window._userBizType = null;
    try { _userBizType = null; } catch (e) {}
    try { DEFAULT_BIZ_TYPE = undefined; } catch (e) {}
    /* 폰을 비워 둔 상태에서 서버에서 받아 온다 */
    ['tkd_members','tkd_cars','tkd_courses','tkd_org','tkd_notices','tkd_carlog',
     'tkd_driver_att','tkd_ridestate'].forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
    await syncFromFirebase();
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    try { switchTab('drive'); } catch (e) {}
    try { driveLeg = 'pickup'; renderDrive(); } catch (e) {}
    const appEl = document.getElementById('app-content');
    /* 폰에 남은 글자 전부 (localStorage 통째로) */
    let dump = '';
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      dump += k + '=' + (localStorage.getItem(k) || '') + '\n';
    }
    return {
      asked: window.__asked.slice(), wrote: window.__wrote.slice(),
      readKeys: (typeof DRIVER_READ_KEYS !== 'undefined') ? DRIVER_READ_KEYS.slice() : [],
      orgKeys: Object.keys(orgSettings || {}).sort(),
      bizNow: (typeof getBizType === 'function') ? getBizType() : '?',
      word: (typeof T === 'function') ? T('회원') : '?',
      dump: dump,
      screen: appEl ? (appEl.textContent || '').replace(/\s+/g, ' ').trim() : '',
      alerts: window.__alerts.slice()
    };
  }, biz);
}

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  /* 요약 문서 — 일곱 칸만 */
  const ORG_DRV = (biz) => ({ name:'가온학원', icon:'🚐', bizType:biz,
    destName:'학원', destLat:37.4467, destLon:126.6516, tel:'032-111-2222' });

  console.log('① 대조 — 옛 판(v271)에서는 알림장·업체 비밀 칸이 기사 폰에 내려왔다');
  {
    const p = await app(b, 390, 844, OLD, 'academy', ORG_DRV('academy'));
    const r = await asDriver(p, 'academy');
    say(r.asked.includes('org') && r.asked.includes('notices'),
      '[옛] 기사가 org·notices 를 달라고 했다     ' + JSON.stringify(r.asked.filter((k) => /^(org|notices)$/.test(k))));
    const leak = SECRET.filter((k) => r.dump.indexOf(k) >= 0);
    say(leak.length > 0, '[옛] 폰에 남은 비밀 칸                 ' + leak.join(','));
    say(/알림장 비밀 본문/.test(r.dump), '[옛] 폰에 알림장 본문이 있었다          ' + /알림장 비밀 본문/.test(r.dump));
    say(r.readKeys.includes('org') && r.readKeys.includes('notices'),
      '[옛] DRIVER_READ_KEYS 10개            ' + r.readKeys.length + '개');
    await p.close();
  }

  console.log('\n② 새 판 — 네 업종 모두: 안 내려오고, 업종 글자도 맞나');
  const screens = {};
  for (const biz of BIZ) {
    const p = await app(b, 390, 844, NEW, biz, ORG_DRV(biz));
    const r = await asDriver(p, biz);
    screens[biz] = r.screen;
    say(!r.asked.includes('org') && !r.asked.includes('notices')
        && !r.asked.includes('listen:org') && !r.asked.includes('listen:notices'),
      ('[' + biz + '] org·notices 를 아예 안 달라고 함').padEnd(40)
      + JSON.stringify(r.asked.filter((k) => /org|notices/.test(k))));
    say(r.asked.includes('orgDriver'), ('[' + biz + '] orgDriver 를 달라고 함').padEnd(40) + 'true');
    const leak = SECRET.filter((k) => r.dump.indexOf(k) >= 0);
    say(leak.length === 0, ('[' + biz + '] 폰에 비밀 칸 0개').padEnd(40) + (leak.join(',') || '없음'));
    say(!/알림장 비밀 본문/.test(r.dump) && !/가하은 외 2명/.test(r.dump),
      ('[' + biz + '] 폰에 알림장 0건').padEnd(40) + 'true');
    say(!/농협 301|iVBORw0KGgoDOJANG|635-88-02710/.test(r.dump),
      ('[' + biz + '] 계좌·도장·사업자번호 글자 0건').padEnd(40) + 'true');
    say(JSON.stringify(r.orgKeys) === JSON.stringify(['bizType','destLat','destLon','destName','icon','name','tel']),
      ('[' + biz + '] orgSettings 일곱 칸만').padEnd(40) + JSON.stringify(r.orgKeys));
    say(r.bizNow === biz, ('[' + biz + '] 업종이 맞다(bizType 없으면 깨짐)').padEnd(40) + r.bizNow + ' · T(회원)=' + r.word);
    say(r.readKeys.length === 9 && !r.readKeys.includes('org') && !r.readKeys.includes('notices')
        && r.readKeys.includes('orgDriver'),
      ('[' + biz + '] DRIVER_READ_KEYS 9개').padEnd(40) + r.readKeys.join(','));
    say(r.wrote.length === 0, ('[' + biz + '] 기사가 서버에 쓴 것 0건').padEnd(40) + JSON.stringify(r.wrote));
    say(p.__errs.length === 0, ('[' + biz + '] 오류 0건').padEnd(40) + (p.__errs.length ? p.__errs[0] : 'OK'));
    await p.close();
  }

  console.log('\n③ 화면이 v271 과 같은가 (네 업종 × 세 크기)');
  for (const biz of BIZ) {
    for (const [w, h] of SIZES) {
      const pn = await app(b, w, h, NEW, biz, ORG_DRV(biz));
      const rn = await asDriver(pn, biz);
      const po = await app(b, w, h, OLD, biz, ORG_DRV(biz));
      const ro = await asDriver(po, biz);
      say(rn.screen === ro.screen && rn.screen.length > 50,
        ('[' + biz + ' ' + w + 'x' + h + '] 기사 화면 글자 같음').padEnd(42)
        + '새 ' + rn.screen.length + '자 / 옛 ' + ro.screen.length + '자'
        + (rn.screen === ro.screen ? '' : '  다른 곳: ' + rn.screen.slice(0, 60)));
      await pn.close(); await po.close();
    }
  }

  console.log('\n④ 요약이 아직 없을 때 — 빈 화면·오류 금지');
  for (const biz of ['academy', 'logistics']) {
    const p = await app(b, 390, 844, NEW, biz, null);   /* orgDriver 문서 없음 */
    const r = await asDriver(p, biz);
    say(r.screen.length > 50, ('[' + biz + '] 요약 없어도 화면이 그려진다').padEnd(40) + r.screen.length + '자');
    say(p.__errs.length === 0, ('[' + biz + '] 오류 0건').padEnd(40) + (p.__errs.length ? p.__errs[0] : 'OK'));
    say(r.alerts.length === 0, ('[' + biz + '] 알림 0건').padEnd(40) + JSON.stringify(r.alerts));
    await p.close();
  }

  console.log('\n⑤ 관리자 — 업체 설정을 저장하면 요약도 같이 쓰이나');
  {
    const p = await app(b, 1366, 768, NEW, 'academy', null);
    const r = await p.evaluate(async () => {
      window.__alerts = []; window.alert = (m) => window.__alerts.push(String(m));
      window.confirm = () => true;
      try { currentMode = 'admin'; } catch (e) {}
      window.currentMode = 'admin'; window._isDriverAcct = false;
      window._userUid = 'OWNER1'; window._userOrgId = 'academy_X'; window._userBizType = 'academy';
      window.__wrote = [];
      /* ㉠ 관리자가 업체 설정을 저장 */
      orgSettings = { name:'새이름', icon:'🚌', bizType:'public', destName:'센터',
        destLat:37.1, destLon:127.1, tel:'032-000-0000',
        bankAccount:'농협 301-0354-8212-31', stamp:'data:image/png;base64,SECRET',
        bizNo:'635-88-02710', ceo:'문준식', insRates:{ np:4.5 }, senderPhone:'010-1' };
      saveOrgSettings(orgSettings);
      await new Promise((r) => setTimeout(r, 300));
      const wrote1 = window.__wrote.slice();
      /* ㉡ 옛 업체: 요약이 없을 때 관리자가 들어오면 한 번 만들어지나 */
      window.__wrote = [];
      await syncFromFirebase();
      const wrote2 = window.__wrote.slice();
      return { wrote1: wrote1, wrote2: wrote2, keys: (typeof ORG_DRIVER_KEYS !== 'undefined') ? ORG_DRIVER_KEYS : [] };
    });
    const w1 = r.wrote1.find((x) => x.key === 'orgDriver');
    say(!!w1, '업체 설정 저장 → orgDriver 도 쓰였다    ' + JSON.stringify(r.wrote1.map((x) => x.key)));
    const v = w1 ? JSON.parse(w1.value) : {};
    say(JSON.stringify(Object.keys(v).sort()) === JSON.stringify(['bizType','destLat','destLon','destName','icon','name','tel']),
      '요약에 일곱 칸만                     ' + JSON.stringify(Object.keys(v).sort()));
    say(!/농협 301|SECRET|635-88-02710/.test(w1 ? w1.value : ''),
      '요약에 계좌·도장·사업자번호 0건        true');
    const w2 = r.wrote2.find((x) => x.key === 'orgDriver');
    say(!!w2, '옛 업체: 관리자가 들어오면 한 번 만들어진다  ' + JSON.stringify(r.wrote2.map((x) => x.key)));
    say(JSON.stringify(r.keys) === JSON.stringify(['name','icon','bizType','destName','destLat','destLon','tel']),
      'ORG_DRIVER_KEYS 목록                 ' + JSON.stringify(r.keys));
    await p.close();
  }

  console.log('\n⑥ 범위');
  {
    /* ★ 범위는 **이 회차 두 커밋 사이**로 고정한다. `diff <OLD_REF>` 하나로 일하는
       폴더와 재면 앞뒤 회차가 섞인다 — v271 보정1 을 v272 **앞에** 끼워 넣자
       「바뀐 파일」에 terms·home 이 들어와 2건이 틀어졌다(이 회차가 건드린 게 아니다). */
    const BEFORE = process.env.COS_SRC_OLD_REF || 'ffd3c0e';   /* v271 보정1 */
    const MINE = process.env.COS_SRC_NEW_REF || '435774d';     /* v272 */
    const RANGE = BEFORE + ' ' + MINE;
    const names = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + RANGE)
      .toString().trim().split('\n').filter(Boolean).sort();
    say(names.join(',') === 'CLAUDE.md,firestore.rules,index.html,version.json',
      '바뀐 파일            ' + names.join(','));
    const keep = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + RANGE
      + ' -- api lib s.html home.html terms.html privacy.html').toString().trim();
    say(keep === '', 'api·lib·s·home·terms·privacy diff 0   ' + (keep || '(변경 없음)'));
  }

  await b.close();
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 · Firestore 는 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
