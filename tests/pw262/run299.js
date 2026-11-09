/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v299(코스로드55 보정1) 실제 크롬 390×844 — **주소 검색이 준 공식 시도·시군구를 쓴다**.
   ⓐ 설정 탭의 주소 칸이 저장값(`addrSido`)을 **들고 그려지나**
   ⓑ 「📍 검색」 → 목록 한 줄을 **실제로 눌러** 고르면 칸에 공식 값이 박히고 **저장되나**
      · 사업장 주소는 **표준 주소 검색**(`&type=address`)을 먼저 부르나
   ⓒ 주소를 **손으로 고치면** 두 칸이 비고, 저장 뒤 「📍 지역을 못 찾았어요」가 뜨나
   ⓓ 옛 업체(칸 없음) — 「중구 세종대로 110」이 **세종으로 잡히지 않나**(짐작 길 낱말 규칙)
   바깥 요청 전부 차단 · Firestore·카카오 가짜 — **실제 카카오·네이버 호출 0** · 실제 쓰기 0. */
const { chromium } = require('playwright');

const APP = process.env.COS_APP || ('' + COS_ROOT + '/index.html');

/* 가짜 카카오 **주소 검색** 응답 — 칸 이름은 공식 문서대로(백틱 금지 · v275 교훈) */
const ADDR_DOC = {
  address_name: '인천광역시 미추홀구 매소홀로 1', address_type: 'ROAD_ADDR', x: '126.70', y: '37.45',
  address: { address_name: '인천 미추홀구 숭의동 1', region_1depth_name: '인천',
             region_2depth_name: '미추홀구', region_3depth_name: '숭의동', h_code: '1', b_code: '1',
             mountain_yn: 'N', main_address_no: '1', sub_address_no: '', x: '126.70', y: '37.45' },
  road_address: { address_name: '인천광역시 미추홀구 매소홀로 1', region_1depth_name: '인천',
                  region_2depth_name: '미추홀구', region_3depth_name: '숭의동',
                  road_name: '매소홀로', underground_yn: 'N', main_building_no: '1',
                  sub_building_no: '', building_name: '', zone_no: '22100', x: '126.70', y: '37.45' }
};

function seed(org) {
  return '(function(){\n'
    + '  var ORG = ' + JSON.stringify(org) + ';\n'
    + '  window.__api = []; window.__writes = []; window.__alerts = [];\n'
    /* ★ 업체를 **먼저** 세운다 — 기기 저장 칸 꼬리가 `getFbOrgId()` 라(v292) 이 줄이 없으면
       씨앗이 `tkd_org__cosroad_default` 로 들어가고, 뒤에 업체를 세운 앱은 **못 읽는다**
       (처음에 ⓒⓓ 가 그렇게 깨졌다 — v286·v292 가 적어 둔 그 자리다). */
    + '  window._userOrgId = "B"; currentMode = "admin";\n'
    + '  localStorage.setItem("tkd_org", JSON.stringify(ORG));\n'
    + '  window._db = {}; window._fbReady = true;\n'
    + '  window._firestore = {\n'
    + '    doc:function(){ return {path:"x"}; }, collection:function(){ return {path:"x"}; },\n'
    + '    getDoc:async function(){ return { exists:function(){return false;}, data:function(){return {};} }; },\n'
    + '    getDocs:async function(){ return { forEach:function(){} }; },\n'
    + '    setDoc:async function(ref){ window.__writes.push("set"); },\n'
    + '    deleteDoc:async function(){}, runTransaction:async function(db,fn){ return null; },\n'
    + '    onSnapshot:function(){ return function(){}; }\n'
    + '  };\n'
    + '  window._auth = { currentUser:{ isAnonymous:false,\n'
    + '    getIdToken:function(){ return Promise.resolve("tok"); } } };\n'
    /* 가짜 카카오 — 부른 주소를 적어 둔다. type=address 면 공식 칸이 있는 응답, 아니면 빈 목록 */
    + '  window.fetch = function(url){\n'
    + '    window.__api.push(String(url));\n'
    + '    var isAddr = /type=address/.test(String(url));\n'
    + '    var ds = isAddr ? [' + JSON.stringify(ADDR_DOC) + '] : [];\n'
    + '    return Promise.resolve({ ok:true, json:function(){ return Promise.resolve({documents:ds, meta:{}}); } });\n'
    + '  };\n'
    + '  window.alert=function(m){ window.__alerts.push(String(m)); };\n'
    + '  window.confirm=function(){return true;}; window.open=function(){return null;};\n'
    + '})();';
}

async function openSettings(b, org) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    errs.push(t.slice(0, 130));
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + APP.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
  await p.evaluate(seed(org));
  await p.evaluate(async () => {
    currentMode = 'admin'; window._userOrgId = 'B'; window._userUid = 'uB';
    window._userBizType = 'academy'; window._userPaidUntil = Date.now() + 30 * 86400000;
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    initApp();
    orgSettings = loadOrgSettings();
    _firstSyncOk = true;
    switchAdminTab('settings');
    await new Promise((r) => setTimeout(r, 200));
  });
  p.__errs = errs;
  return p;
}
const attrs = (p) => p.evaluate(() => {
  const e = document.getElementById('org-addr');
  return e ? { v: e.value, sido: e.getAttribute('data-sido'), sgg: e.getAttribute('data-sigungu') } : null;
});

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐⓑ 「📍 검색」 → 목록 한 줄을 **눌러** 고르고 저장한다');
  {
    const p = await openSettings(b, { name: '가온학원', icon: '🚐', bizType: 'academy',
      destName: '학원', destLat: 37.44, destLon: 126.65, address: '' });
    const a0 = await attrs(p);
    say(!!a0, '설정 탭에 주소 칸이 있다'.padEnd(46) + (a0 ? 'OK' : '없다'));
    say(a0 && !a0.sido, '  (옛 업체) 지역 칸은 비어 있다'.padEnd(46) + '[' + ((a0 && a0.sido) || '') + ']');
    say(await p.evaluate(() => /검색으로 고르면 지역이 정확히 잡혀요/
      .test(document.getElementById('admin-content').textContent)),
      '★ 설정에 안내 한 줄이 보인다'.padEnd(46) + 'OK');

    const r = await p.evaluate(async () => {
      document.getElementById('org-addr').value = '인천 미추홀구 매소홀로 1';
      searchOrgAddr();
      await new Promise((x) => setTimeout(x, 400));
      const box = document.getElementById('org-addr-result-box');
      const rows = box ? box.querySelectorAll('.addr-ri') : [];
      const first = (window.__api || [])[0] || '';
      if (rows.length) rows[0].click();                 /* ★ 사람이 누르는 그 자리 */
      await new Promise((x) => setTimeout(x, 150));
      return { rows: rows.length, first: first, calls: (window.__api || []).length };
    });
    say(/type=address/.test(r.first), '★ 첫 호출이 **표준 주소 검색**'.padEnd(46) + r.first.slice(-24));
    say(r.calls === 1, '  그 한 번으로 끝난다(장소 검색 안 부름)'.padEnd(46) + r.calls + '번');
    say(r.rows === 1, '  목록이 떴다'.padEnd(46) + r.rows + '줄');
    const a1 = await attrs(p);
    say(a1.sido === '인천' && a1.sgg === '미추홀구',
      '★ 누른 뒤 칸에 공식 값이 박혔다'.padEnd(46) + a1.sido + '/' + a1.sgg);
    say(a1.v === '인천광역시 미추홀구 매소홀로 1', '  주소 글자도 들어갔다'.padEnd(46) + a1.v);

    const r2 = await p.evaluate(() => {
      saveOrgInfo();
      return { sido: orgSettings.addrSido, sgg: orgSettings.addrSigungu,
               auto: JSON.stringify(supportRegionAuto()), label: supportRegionLabel(),
               box: String(localStorage.getItem('tkd_org') || '') };
    });
    say(r2.sido === '인천' && r2.sgg === '미추홀구',
      '★ 저장됐다(`orgSettings.addrSido`)'.padEnd(46) + r2.sido + '/' + r2.sgg);
    say(/addrSido/.test(r2.box), '  기기 저장 칸에도 들어갔다'.padEnd(46) + 'OK');
    say(r2.auto === JSON.stringify({ sido: '인천', sigungu: '미추홀구' }),
      '★ 지역 판정이 그 값을 쓴다(짐작 안 함)'.padEnd(46) + r2.auto);
    say(/인천광역시 미추홀구/.test(r2.label), '  「📍」 줄에 그 지역이 보인다'.padEnd(46) + r2.label.slice(0, 24));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒ 주소를 **손으로 고치면** 두 칸이 비고 짐작 길로 간다');
  {
    const p = await openSettings(b, { name: '가온학원', icon: '🚐', bizType: 'academy',
      destName: '학원', destLat: 37.44, destLon: 126.65,
      address: '인천광역시 미추홀구 매소홀로 1', addrSido: '인천', addrSigungu: '미추홀구' });
    const a0 = await attrs(p);
    say(a0.sido === '인천' && a0.sgg === '미추홀구',
      '★ 저장값을 **들고 그려진다**'.padEnd(46) + a0.sido + '/' + a0.sgg);
    const r = await p.evaluate(async () => {
      const e = document.getElementById('org-addr');
      e.value = '중구 세종대로 110';
      e.dispatchEvent(new Event('input', { bubbles: true }));   /* 사람이 글자를 고친 것 */
      await new Promise((x) => setTimeout(x, 80));
      const after = { sido: e.getAttribute('data-sido'), sgg: e.getAttribute('data-sigungu') };
      saveOrgInfo();
      return { after: after, sido: orgSettings.addrSido, sgg: orgSettings.addrSigungu,
               auto: JSON.stringify(supportRegionAuto()), label: supportRegionLabel() };
    });
    say(!r.after.sido && !r.after.sgg, '★ 칸이 비워졌다'.padEnd(46)
      + '[' + (r.after.sido || '') + '/' + (r.after.sgg || '') + ']');
    say(!r.sido && !r.sgg, '★ 저장값도 비었다'.padEnd(46) + '[' + r.sido + '/' + r.sgg + ']');
    say(r.auto === JSON.stringify({ sido: '', sigungu: '' }),
      '★ 「세종」으로 안 읽는다(짐작 길 낱말 규칙)'.padEnd(46) + r.auto);
    say(/지역을 못 찾았어요/.test(r.label), '★ 「📍 지역을 못 찾았어요」 가 뜬다'.padEnd(46) + r.label.slice(0, 22));
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓓ 옛 업체(칸 없음) — 맞던 주소는 그대로 · 틀렸던 네 주소는 못 찾음');
  {
    const p = await openSettings(b, { name: '가온학원', icon: '🚐', bizType: 'academy',
      destName: '학원', destLat: 37.44, destLon: 126.65, address: '인천광역시 미추홀구 숭의동 1' });
    const r = await p.evaluate(() => {
      const out = {};
      out.ok = JSON.stringify(supportRegionAuto());
      const BAD = ['중구 세종대로 110', '수원시 영통구 광주길 5',
                   '성남시 분당구 서울로 100', '천안시 동남구 대전동 3'];
      out.bad = BAD.map((a) => { orgSettings.address = a; return supportRegionAuto().sido || '-'; }).join(',');
      return out;
    });
    say(r.ok === JSON.stringify({ sido: '인천', sigungu: '미추홀구' }),
      '맞던 주소는 그대로 잡힌다'.padEnd(46) + r.ok);
    say(r.bad === '-,-,-,-', '★ 틀렸던 네 주소는 모두 못 찾음'.padEnd(46) + r.bad);
    say(p.__errs.length === 0, '오류 0'.padEnd(46) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log('\n' + (bad ? 'X 실패 ' + bad + '건' : 'o 전부 통과') + ' — 실제 크롬 390×844');
  console.log('※ 바깥 요청 차단 — **실제 카카오·네이버 호출 0** · 실제 쓰기 0');
  process.exit(bad ? 1 : 0);
})();
