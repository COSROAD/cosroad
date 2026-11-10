/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
const { thisRef } = require('./thisref.js');   /* 회차 커밋 찾기 한 벌 */
/* 코스로드68 — **보기 글·예시도 업종에 맞게** · **기본 원칙은 다섯 파일 전부** (v309).
   ① 보기 글(placeholder) — 네 업종에서 이름·주소·검색·코스·도착지 보기가 업종에 맞나 ·
      **한 벌**(`bizPlaceholders`·`noticeSearchPh`)이고 가지마다 적지 않나
   ② 기본 원칙 다섯 파일 — 카톡 변수 둘 · 줄바꿈 두 줄 · `break-word` 0 · 천단위
   ③ 카드 높이 맞춤이 소스에 있나(subgrid + 못 쓰는 브라우저 대비) — 실제 px 은 크롬 묶음이 잰다
   ④ 소스 전수 — 63~67 것 그대로 · HELP_QA · CLAUDE.md 두 줄
   ⑤ **백업 파일 이름의 업체 표시**(v310 · 68 보정1) — 「마지막 `_` 뒤」 전수 표 + 실제 저장 이름
   ★ 바깥 통신 0. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

const OLD_REF = process.env.COS_SRC_OLD_REF || '1a97c05';   /* v308 — 고치기 전 */
const F = (p) => fs.readFileSync(COS_ROOT + '/' + p, 'utf8').replace(/\r\n/g, '\n');
const OLD = (p) => cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':' + p,
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const NEW_SRC = F('index.html'), OLD_SRC = OLD('index.html');
const HOME = F('home.html'), HOME_OLD = OLD('home.html');
const SHTML = F('s.html'), SHTML_OLD = OLD('s.html');
/* ★ 이 회차 커밋 — 버전 글자로 찾는다(63~67 과 같은 방법) */
const THIS_REF = thisRef(309);   /* 그 회차 커밋 — 제목이 (v309) 인 것 */

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 40)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
  location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1' }];

function app(biz, src) {
  const SUF = '__B';
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(MEM);
  store['tkd_cars' + SUF] = JSON.stringify([{ id: 'car1', name: '1호차' }]);
  store['tkd_courses' + SUF] = JSON.stringify([{ id: 'c1', name: '오전반' }]);
  store['tkd_staff' + SUF] = JSON.stringify([]);
  store['tkd_org' + SUF] = JSON.stringify({ name: '가온', icon: '🚐', bizType: biz,
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  const R = E.build({ src: src || NEW_SRC, biz: biz, localStorage: store });
  if (R.error) throw R.error;
  const ids = new Set(['m-name', 'm-location', 'm-droplocation', 'admin-content', 'confirm-modal']);
  ((src || NEW_SRC).match(/id="[a-zA-Z0-9_-]+"/g) || []).forEach((x) => ids.add(x.slice(4, -1)));
  ids.forEach((id) => {
    const el = E.makeEl('input'); el.id = id;
    const bag = {};
    el.setAttribute = (k, v) => { bag[k] = String(v); };
    el.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null);
    if (!el.classList) {
      const cl = new Set();
      el.classList = { add: (c) => cl.add(c), remove: (c) => cl.delete(c), contains: (c) => cl.has(c) };
    }
    R.byId[id] = el;
  });
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userBizType='" + biz + "';"
     + " window._userPaidUntil=Date.now()+1e9; _firstSyncOk=true;");
  R.ev('showToast=function(){}; renderAdminTab=function(){};'
     + ' saveToFirebase=function(){ return Promise.resolve(true); };'
     + ' saveCarState=function(){ return Promise.resolve(true); }; rebuildCarData=function(){};');
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses(); orgSettings = loadOrgSettings();');
  return R;
}
const ph = (R, id) => R.ev('(function(){ var e=document.getElementById("' + id + '");'
  + ' return e ? String(e.placeholder||"") : "(칸 없음)"; })()');
/* ★ 「글자가 있나」를 셀 때는 **쪽지(주석)를 떼고** 센다 — 왜 안 쓰는지 쪽지에 적어 두므로
   떼지 않으면 그 쪽지가 「쓰고 있다」로 잡힌다(이 묶음을 만들며 실제로 겪었다). */
const noCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

(async () => {
  console.log('════ ① 보기 글(placeholder)이 업종에 맞나');
  {
    /* 재현 — 옛 판은 네 업종 모두 「예) 홍길동」 */
    const o = app('logistics', OLD_SRC);
    o.R ? 0 : 0;
    ck('[옛] 물류에서도 이름 보기가 「예) 홍길동」',
      (OLD_SRC.match(/id="m-name" placeholder="예\) 홍길동"/) || [''])[0] ? '그렇다' : '아니다', '그렇다');
    ck('[옛] «알림장» 검색 보기가 업종과 무관',
      /placeholder="🔍 이름 검색 \(쉼표로 여러 명: 강하은,문소율\)"/.test(OLD_SRC), true);
    ck('[옛] 명단 검색도 「🔍 이름 검색」',
      /id="admin-search" placeholder="🔍 이름 검색"/.test(OLD_SRC), true);

    /* 고침 — 네 업종 */
    const want = {
      academy:   { name: '예) 홍길동', loc: '예) 용현초 정문', drop: '예) 행복아파트 101동',
                   note: '예) 정문 우측 대기', org: '예) 우리 태권도장',
                   detail: '상세 주소 (동·호수 등, 선택) 예) 3동 502호', car: '차종 (예: 스타렉스)' },
      public:    { name: '예) 김복순', loc: '예) 복지관 앞',   drop: '예) 행복아파트 101동',
                   note: '예) 보행 보조 필요', org: '예) ○○노인복지관',
                   detail: '상세 주소 (동·호수 등, 선택) 예) 3동 502호', car: '차종 (예: 스타렉스)' },
      logistics: { name: '예) 한빛상사', loc: '예) 인천 연수구 ...', drop: '',
                   note: '예) 하차장 뒤편 · 지게차 필요', org: '예) 한빛물류',
                   detail: '상세 주소 (선택) 예) B동 하차장', car: '차종 (예: 포터2)' },
      delivery:  { name: '예) 홍길동', loc: '예) 인천 연수구 ...', drop: '',
                   note: '예) 부재 시 문 앞', org: '예) ○○택배 연수지점',
                   detail: '상세 주소 (동·호수 등, 선택) 예) 3동 502호', car: '차종 (예: 포터2)' }
    };
    for (const biz of Object.keys(want)) {
      const R = app(biz);
      R.ev('applyBizModalLayout();');
      ck('★ [' + biz + '] 이름 보기', ph(R, 'm-name'), want[biz].name);
      ck('  [' + biz + '] 주소 보기', ph(R, 'm-location'), want[biz].loc);
      if (want[biz].drop) {
        ck('  [' + biz + '] 하원 장소 보기', ph(R, 'm-droplocation'), want[biz].drop);
      } else {
        ck('  [' + biz + '] 하원 장소 칸은 **숨는다**(v273)',
          R.ev("(function(){ var w=document.getElementById('wrap-droplocation');"
             + " return w ? String(w.style.display) : '(없음)'; })()"), 'none');
      }
      ck('  [' + biz + '] 특이사항 보기', ph(R, 'm-note'), want[biz].note);
      ck('  [' + biz + '] 상세 주소 보기', ph(R, 'm-addrdetail'), want[biz].detail);
      ck('  [' + biz + '] 차종 보기', R.ev('bizPlaceholders().car'), want[biz].car);
      ck('★ [' + biz + '] 업체명 보기', R.ev("orgNamePh('" + biz + "')"), want[biz].org);
      /* «알림장» 검색 보기 */
      const want2 = { academy: '🔍 회원 검색 (쉼표로 여러 명: 강하은,문소율)',
        public: '🔍 이용자 검색 (쉼표로 여러 명: 김복순,박영수)',
        logistics: '🔍 거래처 검색 (쉼표로 여러 곳: 한빛상사,푸른유통)',
        delivery: '🔍 배송지 검색 (쉼표로 여러 곳: 홍길동,김영희)' };
      ck('★ [' + biz + '] «알림장» 검색 보기', R.ev('noticeSearchPh()'), want2[biz]);
    }
    /* 한 벌인가 */
    ck('★ `bizPlaceholders` 한 벌', (NEW_SRC.match(/^function bizPlaceholders\(/mg) || []).length, 1);
    ck('★ `noticeSearchPh` 한 벌', (NEW_SRC.match(/^function noticeSearchPh\(/mg) || []).length, 1);
    ck('★ `orgNamePh` 한 벌', (NEW_SRC.match(/^function orgNamePh\(/mg) || []).length, 1);
    ck('★ 가지마다 적던 줄이 **사라졌다**',
      /mLoc\)mLoc\.placeholder=/.test(NEW_SRC) || /_mNoteEl\.placeholder=/.test(NEW_SRC), false);
    ck('  (대조) 옛 판은 주소를 두 가지에 적고 있었다',
      (OLD_SRC.match(/mLoc\)mLoc\.placeholder=/g) || []).length, 2);
    ck('  (대조) 옛 판은 특이사항을 택배 가지에만 적었다',
      (OLD_SRC.match(/_mNoteEl\.placeholder=/g) || []).length, 1);
    ck('  쓰지 않는 `mLoc` 변수도 지웠다', /var mLoc=document/.test(NEW_SRC), false);
    ck('★ 가입 창도 업종을 따라간다(`suBizPicked`)',
      /onchange="suBizPicked\(\)"/.test(NEW_SRC)
        && /id="su-name" type="text" placeholder="'\+orgNamePh\(presetBiz\|\|'academy'\)\+'"/.test(NEW_SRC), true);
    ck('  설정 업체명 칸도 한 벌을 쓴다',
      /id="org-name"[\s\S]{0,80}?placeholder="\$\{orgNamePh\(getBizType\(\)\)\}"/.test(NEW_SRC), true);
    ck('  `applyBizModalLayout` 이 그 한 벌을 부른다',
      /applyBizModalLayout\(\)\{[\s\S]{0,200}?applyBizPlaceholders\(\)/.test(NEW_SRC), true);
    /* 명단 검색·코스 이름·도착지 — 업종 용어/업종별 */
    ck('★ 명단 검색이 업종 용어',
      /id="admin-search" placeholder="🔍 '\+T\('회원'\)\+' 검색"/.test(NEW_SRC), true);
    ck('★ 코스 이름 보기가 업종별',
      /새 코스 이름 \(예: \$\{getBizType\(\)==='logistics'\?'오전배송':'오전반'\}\)/.test(NEW_SRC), true);
    ck('★ 도착지 이름 보기가 업종별',
      /id="dest-name"[\s\S]{0,120}?getBizType\(\)==='logistics'\?'○○유통 창고'/.test(NEW_SRC), true);
  }

  console.log('\n② 기본 원칙은 **다섯 파일 전부**');
  {
    const files = { 'index.html': NEW_SRC, 'home.html': HOME, 's.html': SHTML,
      'terms.html': F('terms.html'), 'privacy.html': F('privacy.html') };
    /* 줄바꿈 두 줄 */
    Object.keys(files).forEach((n) => {
      ck('  [' + n + '] `body` 에 줄바꿈 두 줄',
        /body\{[^}]*word-break:keep-all[^}]*overflow-wrap:anywhere/.test(files[n]), true);
    });
    /* `break-word` 는 쓰지 않는다 */
    ck('★ 다섯 파일에 `word-break:break-word` **0곳**(쪽지 뺀 글)',
      Object.keys(files).filter((n) => /word-break:break-word/.test(noCmt(files[n]))).join(',') || '0곳', '0곳');
    ck('  (대조) 옛 `s.html` 에는 있었다', /word-break:break-word/.test(noCmt(SHTML_OLD)), true);
    ck('  `s.html` 그 자리가 두 줄로 바뀌었다',
      /\.nt-body\{[^}]*word-break:keep-all;overflow-wrap:anywhere/.test(SHTML), true);
    /* 카톡 변수 둘 — 앱·홈페이지 */
    ck('★ `index.html` 카톡 변수 둘', (NEW_SRC.match(/--kakao[a-z-]*:/g) || []).length, 2);
    ck('★ `home.html` 카톡 변수 둘(새로)', (HOME.match(/--kakao[a-z-]*:/g) || []).length, 2);
    ck('  (대조) 옛 `home.html` 에는 0', (HOME_OLD.match(/--kakao[a-z-]*:/g) || []).length, 0);
    ck('  홈페이지 값이 앱과 **같다**',
      /--kakao:#FEE500/.test(HOME) && /--kakao-ink:rgba\(0, 0, 0, \.85\)/.test(HOME), true);
    ck('★ 섞인 글은 **카톡 조각만** 감쌌다(`.kko` 두 곳)',
      (HOME.match(/class="kko"/g) || []).length, 2);
    ck('  그 둘이 「알림톡」이다',
      (HOME.match(/<span class="kko">알림톡<\/span>/g) || []).length, 2);
    ck('  `.kko` 가 변수 둘을 쓴다',
      /\.kko\{[^}]*background:var\(--kakao\)[^}]*color:var\(--kakao-ink\)/.test(HOME), true);
    ck('★ 하드코딩 색 0곳(홈페이지) — `#FEE500` 은 변수 선언 한 줄만',
      (noCmt(HOME).match(/#FEE500/gi) || []).length, 1);
    ck('  그 한 줄이 변수 선언이다',
      /--kakao:#FEE500/.test(noCmt(HOME).match(/[^;{}]*#FEE500[^;{}]*/)[0]), true);
    /* 천단위 — 홈페이지 요금 */
    const nums = [...HOME.matchAll(/(?:^|[^0-9,])([0-9]{4,})\s*원/g)].map((m) => m[1]);
    ck('★ 홈페이지 금액에 쉼표 빠진 곳', nums.length ? nums.join(',') : '0곳', '0곳');
    ck('  `s.html` 금액은 `toLocaleString` 한 벌', (SHTML.match(/function won\(/g) || []).length, 1);
    /* 업종 용어 — 공유 화면도 (v309) */
    ck('★ `s.html` 이 「알림장」을 글자로 적지 않는다',
      /'<h1>알림장<\/h1>'/.test(SHTML), false);
    ck('  (대조) 옛 판은 글자로 적었다', /'<h1>알림장<\/h1>'/.test(SHTML_OLD), true);
    ck('  용어는 `org.label` 에서 온다',
      /const label = String\(\(d\.org && d\.org\.label\) \|\| '알림장'\)/.test(SHTML), true);
    ck('  **옛 링크**는 「알림장」으로 떨어진다', /\|\| '알림장'\)/.test(SHTML), true);
    ck('★ 발급 쪽이 그 칸을 담는다(`org` **안에**)',
      /org:  \{ name: String\(org\.name\|\|''\), label: T\('알림장'\) \}/.test(NEW_SRC), true);
    ck('  (대조) 옛 판은 이름만 담았다',
      /org:  \{ name: String\(org\.name\|\|''\) \},/.test(OLD_SRC), true);
    ck('★ 윗단 키는 **안 늘렸다** — 규칙이 9개로 못 박았다',
      (F('firestore.rules').match(/'v','kind','org','date','content','images','createdAt','expiresAt','ownerUid'/g) || []).length, 1);
  }

  console.log('\n③ 카드 높이 맞춤이 소스에 있나 (px 은 크롬 묶음이 잰다)');
  {
    ck('★ 업종 카드가 subgrid', /\.biz\{[\s\S]{0,260}?grid-template-rows:subgrid;grid-row:span 3/.test(HOME), true);
    ck('  그 묶음 부모에 줄이 적혀 있다', /\.biz-grid\{[\s\S]{0,160}?grid-template-rows:auto auto auto/.test(HOME), true);
    ck('★ 「경영 비서」 카드도 subgrid(연관)', /\.asst-card\{[^}]*grid-template-rows:subgrid;grid-row:span 4/.test(HOME), true);
    ck('  주황 한 줄에 자리를 준다', /\.asst-card > \.asst-quote\{grid-row:3;\}/.test(HOME), true);
    ck('  설명은 넷째 줄', /\.asst-card > p\{grid-row:4;\}/.test(HOME), true);
    /* ★ 대비 규칙은 **업종 카드 한 곳만** — 「경영 비서」는 높이를 줄 대상이 없어 일부러 안 뒀다
       (쪽지에 그 까닭이 적혀 있어야 한다). */
    ck('★ subgrid 못 쓰는 브라우저 대비 한 곳',
      (HOME.match(/@supports not \(grid-template-rows: subgrid\)/g) || []).length, 1);
    ck('  그 대비는 **여러 장일 때만**', /@supports not \(grid-template-rows: subgrid\)\{\s*@media\(min-width:461px\)/.test(HOME), true);
    ck('  「경영 비서」에 안 둔 까닭이 적혀 있다',
      /대비 규칙을 두지 않았다/.test(HOME), true);
    ck('  (대조) 옛 판에는 subgrid 가 0곳', /subgrid/.test(HOME_OLD), false);
  }

  console.log('\n④ 소스 전수');
  {
    ['carLinkBlock', 'staffLinkBlock', 'courseLinkBlock', '_dumpHas', 'courseNameOf',
      'prodSameExists', 'supportLastKey', 'bizPlaceholders', 'noticeSearchPh',
      'orgNamePh', 'backupOrgTag'].forEach((f) => {
      ck('  `' + f + '` 한 벌',
        (NEW_SRC.match(new RegExp('^function ' + f + '\\(', 'mg')) || []).length, 1);
    });
    ck('  문지기 자리 수(줄지 않았다)',
      (NEW_SRC.match(/!okToWriteNow\(\)/g) || []).length >= 17 ? 'OK' : 'NG', 'OK');
    ck('  사진 경로는 업체별 그대로(v308)',
      (NEW_SRC.match(/getFbOrgId\(\)\+'\/(notice-images|drivelog-photos)/g) || []).length, 2);
    const panels = (src) => (src.match(/BACK_PANEL_IDS\s*=\s*\[[\s\S]*?\]/) || [''])[0];
    ck('★ 새 창(덮개) 0 — `BACK_PANEL_IDS` 그대로',
      panels(NEW_SRC) === panels(OLD_SRC) ? '그대로' : '바뀜', '그대로');
    ck('  (로그아웃 짝) 새 `setInterval`·리스너 0',
      (NEW_SRC.match(/setInterval\(/g) || []).length === (OLD_SRC.match(/setInterval\(/g) || []).length
        && (NEW_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length === (OLD_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length,
      true);
    ck('  (업체 분리) `ORG_KEYS` 그대로',
      (NEW_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0] === (OLD_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0], true);
    ck('★ `api/`·`lib/`·규칙·`storage.rules` 는 **한 줄도** 안 바뀌었다',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF
        + (THIS_REF ? ' ' + THIS_REF : '') + ' -- api lib firestore.rules storage.rules',
        { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
    console.log('      (잰 자리: ' + OLD_REF + ' → ' + (THIS_REF || '작업트리') + ')');
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    /* ★ 버전은 **309 이상**으로 본다 — 보정 회차가 올리면 거짓으로 깨진다(63~67 과 같은 손질) */
    ck('  버전 309 이상', appV >= 309 ? 'OK(' + appV + ')' : 'NG(' + appV + ')', 'OK(' + appV + ')');
    ck('  `version.json` 과 같다',
      String(JSON.parse(F('version.json')).version), String(appV));
    const QA = (s) => { const i = s.indexOf('var HELP_QA=['); return i < 0 ? '' : s.slice(i, s.indexOf('\n];', i)); };
    ck('★ HELP_QA — 보기 글이 업종별', /칸의 보기 글도 업종에 맞게 나와요/.test(QA(NEW_SRC)), true);
    ck('★ HELP_QA — 검색 안내가 업종 용어', /업종에 맞는 보기가 칸에 나와요/.test(QA(NEW_SRC)), true);
    ck('  (대조) 옛 문답표에는 둘 다 없다',
      [/칸의 보기 글도 업종에 맞게/, /업종에 맞는 보기가 칸에 나와요/]
        .filter((r) => r.test(QA(OLD_SRC))).length, 0);
    ck('  (대조) 옛 문답표에 학생 이름 예시가 있었다',
      /이름 검색\(쉼표로 여러 명: 강하은,문소율\)/.test(QA(OLD_SRC)), true);
    const qaN = (s) => (QA(s).match(/\{role:'(admin|driver|all)'/g) || []).length;
    ck('  문답 항목 수는 그대로', qaN(NEW_SRC), qaN(OLD_SRC));
    const CM = F('CLAUDE.md');
    ck('★ CLAUDE.md — 연관은 같이 고친다',
      /연관은 찾아서 같이 고친다/.test(CM), true);
    ck('  그 예외 셋이 적혀 있다',
      /서버\(`api\/`·`lib\/`\)·규칙이 바뀌어야/.test(CM) && /사장님 판단이 필요한 것/.test(CM)
        && /범위가 커서 따로 회차가 맞는 것/.test(CM), true);
    ck('★ CLAUDE.md — 기본 원칙은 다섯 파일 전부',
      /기본 원칙은 앱만이 아니라 홈페이지·공유 화면 전부에 적용한다/.test(CM), true);
  }

  console.log('\n⑤ 백업 파일 이름의 업체 표시 — 「마지막 `_` 뒤」 (v310 · 68 보정1)');
  {
    /* 재현 — v308·v309 는 **뒤 6자**라 `academy_acme` 가 `y_acme` 로 잘렸다 */
    ck('[옛] 뒤 6자로 자르고 있었다', /String\(_org\)\.slice\(-6\)/.test(OLD_SRC), true);
    ck('★ 이제 한 벌 `backupOrgTag` 를 부른다',
      /var _tail = _org \? \('_'\+backupOrgTag\(_org\)\) : '';/.test(NEW_SRC), true);
    /* 전수 표 — 네 모양 */
    const R = app('academy');
    const tag = (org) => R.ev('backupOrgTag(' + JSON.stringify(org) + ')');
    [['academy_acme', 'acme', '보통 업체 — 마지막 `_` 뒤'],
     ['logistics_hanbit', 'hanbit', '다른 업종도 같다'],
     ['cosroad_default', 'default', '되돌림 칸'],
     ['cosroad_test', 'test', '테스트 공간'],
     ['academy_demo', 'demo', '둘러보기'],
     ['B', 'B', '`_` 가 없으면 그대로'],
     ['academy_abc123def456', 'abc123def456', '꼬리 12자는 그대로'],
     ['academy_abc123def4567', 'ef4567', '꼬리 13자는 **뒤 6자**'],
     ['academy_', 'ademy', '끝이 `_` 면 뒤 6자 + 끝 `_` 를 뗀다'],
     ['', '', '빈 값은 빈 값']].forEach(([org, want, why]) => {
      ck('  ' + String(org || '(빈 값)').padEnd(22) + '→ ' + why, tag(org), want);
    });
    /* 실제 저장되는 **파일 이름**을 본다(스텁이 `a.download` 를 받아 적는다) */
    const names = [];
    R.sandbox.Blob = R.win.Blob = function () {};
    R.sandbox.URL = R.win.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
    const origCreate = R.sandbox.document.createElement;
    R.sandbox.document.createElement = (t) => {
      const el = origCreate.call(R.sandbox.document, t);
      if (String(t).toLowerCase() === 'a') {
        Object.defineProperty(el, 'download', {
          get() { return el.__dl || ''; }, set(v) { el.__dl = String(v); names.push(String(v)); }
        });
      }
      return el;
    };
    R.ev('window._userOrgId="academy_acme"; orgSettings.name="가온학원"; backupData();');
    ck('★ 실제 파일 이름', /^COSROAD_백업_가온학원_acme_\d{4}-\d{2}-\d{2}\.json$/.test(names[0] || '')
      ? 'OK' : (names[0] || '없음'), 'OK');
    ck('  (대조) 잘린 `y_acme` 는 **안 나온다**', /y_acme/.test(names[0] || ''), false);
    ck('  `_` 가 겹치지 않는다', /__/.test(names[0] || ''), false);
    ck('★ HELP_QA — 새 이름 규칙을 적었다',
      /업체 id 의 마지막 「_」 뒤/.test(NEW_SRC), true);
    ck('★ CLAUDE.md — 그 한 줄', /마지막 `_` 뒤/.test(F('CLAUDE.md')), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 소스·가짜 DOM 만 봤습니다');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
