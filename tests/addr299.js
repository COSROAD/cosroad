/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드55 보정1 — **주소 검색이 준 공식 시도·시군구를 그대로 쓴다** (v299).
   사장님(11-09): 「주소 찾기를 표준 주소 검색에서 찾으면 전국 공통일 텐데요」
   보는 것: ① 재현 — 짐작 길이 도로·동 이름을 시도로 읽는다(네 주소)
            ② 맞게 잡혀야 하는 주소는 그대로 (정식 명칭·특별자치시/도)
            ③ 공식 칸 읽기 — `addrRegionOf`·`sidoKeyFromName`(공식 문서 모양의 **가짜** 응답)
            ④ 사업장 주소는 **표준 주소 검색을 먼저** 부른다(`&type=address`)
            ⑤ 고르면 칸에 들어가고 **저장된다**(`orgSettings.addrSido`·`addrSigungu`)
            ⑥ **손으로 고치면 비워진다** · ⑦ 옛 업체는 **그대로**(짐작 길)
            ⑧ `orgDriver` 에 **안 들어간다** · ⑨ 서버 `regionPass` 는 **안 바뀌었다**
   ★ **실제 카카오·네이버 호출 0** — 가짜 응답(칸 이름은 공식 문서대로). */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

const OLD_REF = process.env.COS_SRC_OLD_REF || '91d436d';   /* 코스로드55 — 고치기 전 */
/* ★ 이 묶음은 **회차 기록**이다 — 「이 회차는 `api/` 를 안 바꿨다」는 **두 커밋 사이**로 재야 한다. */
const THIS_REF = process.env.COS_API_NEW_REF || '713cf9c';   /* 이 회차 커밋 */
const NEW_SRC = fs.readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 40)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

/* ── 가짜 카카오 **주소 검색** 응답 — 칸 이름은 공식 문서대로 ────────────────
   /v2/local/search/address.json → documents[].{address_name, address_type, x, y,
     address{address_name, region_1depth_name, region_2depth_name, region_3depth_name, …},
     road_address{address_name, region_1depth_name, region_2depth_name, region_3depth_name,
       road_name, building_name, zone_no, …}}
   ★ `api/kakao-search.js` 는 이 응답을 **그대로 통과**시킨다(버리는 칸 0) — 서버 안 고쳤다. */
const kakaoAddrDoc = (road, sido, sgg, dong) => ({
  address_name: road, address_type: 'ROAD_ADDR', x: '126.70', y: '37.45',
  address: { address_name: road.replace(/ [^ ]*로.*$/, ' ' + (dong || '')),
             region_1depth_name: sido, region_2depth_name: sgg, region_3depth_name: dong || '',
             region_3depth_h_name: dong || '', h_code: '1', b_code: '1',
             mountain_yn: 'N', main_address_no: '1', sub_address_no: '', x: '126.70', y: '37.45' },
  road_address: { address_name: road, region_1depth_name: sido, region_2depth_name: sgg,
                  region_3depth_name: dong || '', road_name: '테스트로', underground_yn: 'N',
                  main_building_no: '1', sub_building_no: '', building_name: '', zone_no: '00000',
                  x: '126.70', y: '37.45' }
});
/* 키워드(장소) 검색 응답 — **지역 칸이 없다**(공식 문서 확인) */
const kakaoKeywordDoc = (name, road) => ({
  id: '1', place_name: name, category_name: '', category_group_code: '', category_group_name: '',
  phone: '', address_name: road, road_address_name: road, x: '126.70', y: '37.45', place_url: ''
});

/* ── 앱 띄우기 ───────────────────────────────────────────────────────────── */
const SUF = '__B';
function phone(opt) {
  opt = opt || {};
  const store = {};
  store['tkd_org' + SUF] = JSON.stringify(Object.assign({
    name: '가온학원', icon: '🚐', bizType: 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65
  }, opt.org || {}));
  const R = E.build({ src: opt.src || NEW_SRC, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  /* 칸을 진짜처럼 — `makeEl` 의 setAttribute/getAttribute 는 빈 함수라 여기서만 살려 둔다
     (공용 헬퍼를 고치면 78개 묶음이 함께 흔들린다) */
  const el = (id) => {
    const e = E.makeEl('input');
    e.id = id;
    const bag = {};
    e.setAttribute = (k, v) => { bag[k] = String(v); };
    e.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null);
    e.removeAttribute = (k) => { delete bag[k]; };
    e._bag = bag;
    R.byId[id] = e;
    return e;
  };
  ['org-addr', 'org-addr-result', 'org-name', 'org-icon-input', 'org-biztype', 'dest-name',
   'dest-addr', 'dest-lat', 'dest-lon', 'org-bizno', 'org-ceo', 'org-bizcat', 'org-bizitem',
   'org-tel', 'org-bank', 'org-name-display', 'org-icon', 'admin-content', 'app-content',
   'main-header', 'today-date',
   /* `showAddrResults` 가 목록 상자를 id 로 다시 찾는다 — 없으면 거기서 멈춘다 */
   'org-addr-result-box', 'member-addr-result-box'].forEach(el);
  R.byId['org-name'].value = '가온학원';
  R.byId['org-icon-input'].value = '🚐';
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userUid='uB';"
     + " window._userBizType='academy'; window._userPaidUntil=Date.now()+30*86400000;");
  R.ev('_firstSyncOk = true;');
  R.ev('orgSettings = loadOrgSettings ? loadOrgSettings() : orgSettings;');
  /* 서버 저장은 안 한다(이 묶음은 「무엇이 orgSettings 에 들어가나」만 본다) */
  R.ev('saveToFirebase = function(){ return Promise.resolve(true); };'
     + ' saveOrgDriver = function(){}; rebuildCarData = function(){};'
     + ' renderAdminNav = function(){}; applyOrgNameFit = function(){};');
  /* 가짜 fetch — 부른 주소를 적어 두고, 미리 정한 응답을 준다 */
  const L = { urls: [] };
  R.sandbox.fetch = R.win.fetch = async (url) => {
    L.urls.push(String(url));
    const isAddr = /type=address/.test(String(url));
    const ds = isAddr ? (opt.addrDocs || []) : (opt.keywordDocs || []);
    return { json: async () => ({ documents: ds, meta: {} }) };
  };
  return { R, L };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* 목록에서 한 줄을 고른 것과 **같은 일**을 한다 — `showAddrResults` 의 click 핸들러는
   가짜 DOM 에 `closest`/`addEventListener` 가 없어 못 부른다(그 자리는 크롬 묶음이 본다).
   여기서는 그 핸들러가 **무엇을 하는지**(칸에 적는 것)를 소스와 같은 꼴로 재현해 잰다. */
const pick = (p, r) => p.R.ev('(function(){ var loc=document.getElementById("org-addr");'
  + ' loc.value=' + JSON.stringify(r.name) + ';'
  + ' loc.setAttribute("data-lat","37.45"); loc.setAttribute("data-lon","126.70");'
  + ' var s=' + JSON.stringify(r.sido || '') + ', g=' + JSON.stringify(r.sigungu || '') + ';'
  + ' if(s){ loc.setAttribute("data-sido", s); } else { loc.removeAttribute("data-sido"); }'
  + ' if(g){ loc.setAttribute("data-sigungu", g); } else { loc.removeAttribute("data-sigungu"); }'
  + ' })()');

(async () => {
  console.log('════ ① 재현 — 짐작 길이 **도로·동 이름을 시도로** 읽는다');
  {
    const BAD = [
      ['중구 세종대로 110', '세종', '서울 중구(서울시청 주소)'],
      ['수원시 영통구 광주길 5', '광주', '경기'],
      ['성남시 분당구 서울로 100', '서울', '경기'],
      ['천안시 동남구 대전동 3', '대전', '충남']
    ];
    for (const [addr, wrong, real] of BAD) {
      const o = phone({ src: OLD_SRC, org: { address: addr } });
      ck('[옛] 「' + addr + '」 → ' + wrong + ' (실제 ' + real + ')',
        o.R.ev('supportRegionAuto().sido'), wrong);
    }
    for (const [addr] of BAD) {
      const n = phone({ org: { address: addr } });
      ck('[새] 「' + addr + '」 → 못 찾음(⚙ 안내)', '[' + n.R.ev('supportRegionAuto().sido') + ']', '[]');
    }
  }

  console.log('\n② 맞게 잡혀야 하는 주소는 **그대로**');
  {
    const OK = [
      ['인천광역시 미추홀구 숭의동 1', '인천', '미추홀구'],
      ['경기도 수원시 영통구 월드컵로 1', '경기', '수원시'],
      ['서울 중구 세종대로 110', '서울', '중구'],
      ['세종특별자치시 한솔동 1', '세종', ''],
      ['제주특별자치도 제주시 첨단로 1', '제주', '제주시'],
      ['강원특별자치도 춘천시 중앙로 1', '강원', '춘천시'],
      ['전북특별자치도 전주시 백제대로 1', '전북', '전주시'],
      ['강원도 원주시 북원로 1', '강원', '원주시'],
      ['전라남도 여수시 시청로 1', '전남', '여수시']
    ];
    OK.forEach((c) => {
      const n = phone({ org: { address: c[0] } });
      ck('「' + c[0].slice(0, 26) + '」', n.R.ev('JSON.stringify(supportRegionAuto())'),
        JSON.stringify({ sido: c[1], sigungu: c[2] }));
    });
    /* 옛 판과 **같은 답**이어야 한다(이 줄들은 안 바뀌었다) */
    let diff = 0;
    OK.forEach((c) => {
      const o = phone({ src: OLD_SRC, org: { address: c[0] } });
      const n = phone({ org: { address: c[0] } });
      if (o.R.ev('JSON.stringify(supportRegionAuto())') !== n.R.ev('JSON.stringify(supportRegionAuto())')) diff++;
    });
    ck('★ 맞던 주소는 옛 판과 답이 같다(다른 칸 수)', diff, 0);
  }

  console.log('\n③ 공식 칸 읽기 — `addrRegionOf` · `sidoKeyFromName`');
  {
    const p = phone({});
    const doc = kakaoAddrDoc('인천광역시 미추홀구 매소홀로 1', '인천', '미추홀구', '숭의동');
    ck('도로명 주소의 공식 칸을 읽는다',
      p.R.ev('JSON.stringify(addrRegionOf(' + JSON.stringify(doc) + '))'),
      JSON.stringify({ sido: '인천', sigungu: '미추홀구' }));
    /* `road_address` 가 없으면 지번(`address`)을 본다 */
    const d2 = JSON.parse(JSON.stringify(doc)); delete d2.road_address;
    ck('도로명이 없으면 지번 칸을 본다',
      p.R.ev('JSON.stringify(addrRegionOf(' + JSON.stringify(d2) + '))'),
      JSON.stringify({ sido: '인천', sigungu: '미추홀구' }));
    ck('지역 칸이 아예 없으면 빈 값',
      p.R.ev('JSON.stringify(addrRegionOf({address_name:"x"}))'),
      JSON.stringify({ sido: '', sigungu: '' }));
    /* 시도 이름 맞추기 표 — 카카오가 어떤 꼴로 주어도 앱 키로 맞는다 */
    const MAP = [['서울', '서울'], ['서울특별시', '서울'], ['서울시', '서울'],
      ['인천광역시', '인천'], ['경기', '경기'], ['경기도', '경기'],
      ['강원특별자치도', '강원'], ['강원도', '강원'], ['강원', '강원'],
      ['전북특별자치도', '전북'], ['전라북도', '전북'], ['전북', '전북'],
      ['세종특별자치시', '세종'], ['제주특별자치도', '제주'], ['제주도', '제주'],
      ['충청북도', '충북'], ['경상남도', '경남'], ['전라남도', '전남'],
      ['없는이름', '']];
    MAP.forEach((m) => {
      ck('  sidoKeyFromName(「' + m[0] + '」)', '[' + p.R.ev('sidoKeyFromName(' + JSON.stringify(m[0]) + ')') + ']',
        '[' + m[1] + ']');
    });
  }

  console.log('\n④ 사업장 주소는 **표준 주소 검색을 먼저** 부른다');
  {
    const p = phone({ addrDocs: [kakaoAddrDoc('인천광역시 미추홀구 매소홀로 1', '인천', '미추홀구', '숭의동')] });
    p.R.byId['org-addr'].value = '인천 미추홀구 매소홀로 1';
    await p.R.ev('searchOrgAddr()');
    await wait(60);
    ck('★ 첫 호출이 `&type=address`', /type=address/.test(p.L.urls[0] || ''), true);
    ck('  그 한 번으로 끝난다(장소 검색 안 부름)', p.L.urls.length, 1);
    /* 주소로 못 찾으면 **종전 장소 검색**으로 떨어진다 */
    const p2 = phone({ addrDocs: [], keywordDocs: [kakaoKeywordDoc('가온빌딩', '인천 미추홀구 매소홀로 1')] });
    p2.R.byId['org-addr'].value = '가온빌딩';
    await p2.R.ev('searchOrgAddr()');
    await wait(80);
    ck('주소로 못 찾으면 장소 검색으로 떨어진다',
      (p2.L.urls.length >= 2) && !/type=address/.test(p2.L.urls[1] || ''), true);
    /* «회원» 주소 칸은 **종전 순서 그대로**(장소 검색 먼저) */
    const p3 = phone({ keywordDocs: [kakaoKeywordDoc('가온빌딩', '인천 미추홀구 매소홀로 1')] });
    const m = E.makeEl('input'); m.id = 'm-location'; p3.R.byId['m-location'] = m;
    const mr = E.makeEl('div'); mr.id = 'member-addr-result'; p3.R.byId['member-addr-result'] = mr;
    m.value = '가온빌딩';
    await p3.R.ev('searchMemberAddr()');
    await wait(60);
    ck('★ «회원» 주소는 종전처럼 **장소 검색 먼저**', /type=address/.test(p3.L.urls[0] || ''), false);
  }

  console.log('\n⑤ 고르면 칸에 들어가고 **저장된다**');
  {
    const p = phone({});
    pick(p, { name: '인천광역시 미추홀구 매소홀로 1', sido: '인천', sigungu: '미추홀구' });
    ck('칸에 공식 값이 적혔다',
      p.R.ev('document.getElementById("org-addr").getAttribute("data-sido")+"/"'
           + '+document.getElementById("org-addr").getAttribute("data-sigungu")'), '인천/미추홀구');
    p.R.ev('saveOrgInfo()');
    ck('★ `orgSettings.addrSido`·`addrSigungu` 로 저장됐다',
      p.R.ev('orgSettings.addrSido+"/"+orgSettings.addrSigungu'), '인천/미추홀구');
    ck('  주소 글자도 그대로', p.R.ev('orgSettings.address'), '인천광역시 미추홀구 매소홀로 1');
    ck('★ 그 값이 지역 판정에 쓰인다(짐작 안 함)',
      p.R.ev('JSON.stringify(supportRegionAuto())'),
      JSON.stringify({ sido: '인천', sigungu: '미추홀구' }));
    /* 기기에 남는 칸도 확인 — 업체 자료(`tkd_org`)에 들어간다(v292 꼬리) */
    ck('  기기 저장 칸(`tkd_org`)에 들어 있다',
      /addrSido/.test(String(p.R.ev('localStorage.getItem("tkd_org")'))), true);
    /* 장소 검색으로 고른 것(지역 칸 없음)은 **비운다** */
    const p2 = phone({});
    pick(p2, { name: '인천 미추홀구 매소홀로 1', sido: '인천', sigungu: '미추홀구' });
    pick(p2, { name: '가온빌딩', sido: '', sigungu: '' });
    p2.R.ev('saveOrgInfo()');
    ck('★ 장소 검색으로 고르면 두 칸이 **비워진다**',
      '[' + p2.R.ev('orgSettings.addrSido') + '/' + p2.R.ev('orgSettings.addrSigungu') + ']', '[/]');
  }

  console.log('\n⑥ **손으로 고치면 비워진다**');
  {
    const p = phone({});
    pick(p, { name: '인천광역시 미추홀구 매소홀로 1', sido: '인천', sigungu: '미추홀구' });
    p.R.byId['org-addr'].value = '중구 세종대로 110';
    p.R.ev('orgAddrTouched()');
    ck('칸이 비었다',
      '[' + p.R.ev('String(document.getElementById("org-addr").getAttribute("data-sido")||"")') + ']', '[]');
    p.R.ev('saveOrgInfo()');
    ck('★ 저장값도 비었다', '[' + p.R.ev('orgSettings.addrSido') + ']', '[]');
    ck('★ 그래서 짐작 길로 가고 — 못 찾는다(엉뚱한 세종이 아니다)',
      '[' + p.R.ev('supportRegionAuto().sido') + ']', '[]');
  }

  console.log('\n⑦ 옛 업체는 **그대로**(칸 없음 → 짐작 길)');
  {
    const p = phone({ org: { address: '인천광역시 미추홀구 숭의동 1' } });
    ck('칸이 없어도 전처럼 잡힌다', p.R.ev('JSON.stringify(supportRegionAuto())'),
      JSON.stringify({ sido: '인천', sigungu: '미추홀구' }));
    ck('  저장값은 비어 있다(일괄 변환 안 함)', '[' + p.R.ev('String(orgSettings.addrSido||"")') + ']', '[]');
    /* 설정에서 한 번 「📍 검색」 → 고르면 채워진다 */
    pick(p, { name: '인천광역시 미추홀구 매소홀로 1', sido: '인천', sigungu: '미추홀구' });
    p.R.ev('saveOrgInfo()');
    ck('★ 한 번 검색해 고르면 채워진다', p.R.ev('orgSettings.addrSido'), '인천');
  }

  console.log('\n⑧ `orgDriver` 에 **안 들어간다** (기사는 지역을 안 쓴다)');
  {
    const p = phone({ org: { address: 'x', addrSido: '인천', addrSigungu: '미추홀구' } });
    ck('`buildOrgDriver` 결과 칸',
      p.R.ev('Object.keys(buildOrgDriver(orgSettings)).sort().join(",")'),
      'bizType,destLat,destLon,destName,icon,name');
    ck('★ 지역 칸이 없다',
      /addrSido|addrSigungu/.test(String(p.R.ev('JSON.stringify(buildOrgDriver(orgSettings))'))), false);
    ck('  `ORG_DRIVER_KEYS` 는 7개 그대로', p.R.ev('ORG_DRIVER_KEYS.length'), 7);
  }

  console.log('\n⑨ 서버는 **안 바뀌었다** · 소스 전수');
  {
    const apiDiff = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' ' + THIS_REF + ' -- api lib firestore.rules',
      { maxBuffer: 1 << 24 }).toString().trim();
    ck('★ `api/`·`lib/`·규칙이 **한 줄도** 안 바뀌었다', '[' + apiDiff + ']', '[]');
    ck('  `regionPass` 는 앱이 넘기는 시도·시군구를 그대로 쓴다(그 줄 그대로)',
      /if \(sigungu && hasWord\(s, sigungu, true\)\) return true;/
        .test(fs.readFileSync(COS_ROOT + '/api/support-info.js', 'utf8')), true);
    ck('★ `supportRegionAuto` 가 공식 칸을 **먼저** 본다',
      /function supportRegionAuto\(\)\{[\s\S]{0,600}?orgSettings\.addrSido/.test(NEW_SRC), true);
    ck('  짐작 길은 **낱말 규칙**이다(앞머리 아님)',
      /w===a \|\| \(w\.indexOf\(a\)===0 && SIDO_TAIL\.test\(w\.slice\(a\.length\)\)\)/.test(NEW_SRC), true);
    ck('  (대조) 옛 판은 앞머리만 봤다',
      /if\(w\.indexOf\(L\[i\]\.alias\[j\]\)===0\)\{ sido=L\[i\]\.key; at=p; break; \}/.test(OLD_SRC), true);
    ck('★ 저장 때 칸을 읽는다', /addrSido:ga\('org-addr','data-sido'\)/.test(NEW_SRC), true);
    ck('  손으로 고치면 비우는 자리', /function orgAddrTouched\(\)/.test(NEW_SRC), true);
    ck('  설정에 안내 한 줄', /검색으로 고르면 지역이 정확히 잡혀요/.test(NEW_SRC), true);
    /* ★ 버전은 **이 회차 커밋**으로 본다(작업트리는 다음 회차에 올라간다 — 그러면 거짓으로 깨진다 ·
       CLAUDE.md 「기대값이 뒷 회차에 앞으로 고쳐진 묶음은 그 기대값이 가리키는 회차에 맞춘다」). */
    const NEW_REF = process.env.COS_SRC_NEW_REF || '713cf9c';
    const at = (p) => cp.execSync('git -C ' + COS_ROOT + ' show ' + NEW_REF + ':' + p,
      { maxBuffer: 1 << 28 }).toString();
    ck('  버전 299 (' + NEW_REF + ')', /const APP_VERSION = 299;/.test(at('index.html')), true);
    ck('  version.json 299', String(JSON.parse(at('version.json')).version), '299');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ **실제 카카오·네이버 호출 0** — 가짜 응답(칸 이름은 공식 문서대로)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
