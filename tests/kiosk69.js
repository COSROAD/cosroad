/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
const { thisRef } = require('./thisref.js');   /* 회차 커밋 찾기 한 벌 */
/* 코스로드69 — **출석 전용 기기 카드를 「«출결»관리」로** · 옛 직원 PIN 카드를 근태 블록으로 (v313).
   ① 재현 — 옛 판은 네 업종 모두 **차량 탭**에 있었다
   ② ★ **그 기기가 무엇을 찍나** — 서버 코드로 전수(물류·택배는 찍을 것이 없다 → 멈춤 근거)
   ③ 고친 뒤 — 학원·공공은 출결 화면에, 물류·택배는 차량 탭에 **그대로**(숨기지 않았다)
   ④ 옛 직원 PIN 카드가 **네 업종 모두 근태 블록**에 (안내 글과 맞는다)
   ⑤ 다시 그리는 자리가 탭을 안 박아 둔다 · 소스 전수 · HELP_QA
   ★ 바깥 통신 0 — 소스와 가짜 DOM 만 본다. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

const OLD_REF = process.env.COS_SRC_OLD_REF || 'bf31bbb';   /* v312 — 고치기 전 */
const F = (p) => fs.readFileSync(COS_ROOT + '/' + p, 'utf8').replace(/\r\n/g, '\n');
const OLD = (p) => cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':' + p,
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const NEW_SRC = F('index.html'), OLD_SRC = OLD('index.html');
/* ★★ 이 회차(v313) 커밋 — **그 회차가 약속한 것은 그 커밋에서 잰다.**
   v314(코스로드70)가 물류·택배 자리와 서버 갈래를 **일부러 바꿨으므로**, 작업트리로 재면
   고친 코드와 무관하게 거짓으로 깨진다(CLAUDE.md 「회차 기록 묶음은 양쪽을 커밋에 고정」). */
const THIS_REF = thisRef(313);   /* 그 회차 커밋 — 제목이 (v313) 인 것 */
const AT = (p) => (THIS_REF
  ? cp.execSync('git -C ' + COS_ROOT + ' show ' + THIS_REF + ':' + p, { maxBuffer: 1 << 28 })
      .toString().replace(/\r\n/g, '\n')
  : F(p));
const THIS_SRC = AT('index.html');
const SRV = AT('api/driver-auth.js');   /* ★ 그 회차 커밋의 서버(v314 가 갈래를 더했다) */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((x) => !x.trim().startsWith('//')).join('\n');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(50)
    + String(got).replace(/\n/g, '⏎').slice(0, 44) + (ok ? '' : '   (기대 ' + want + ')'));
};

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
  location: '인천 1', lat: 37.41, lon: 126.68, phone: '010-1' }];

/* 그 업종으로 앱을 띄우고 **화면 글**을 받는다 */
function screen(biz, which, src) {
  const SUF = '__B';
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(MEM);
  store['tkd_cars' + SUF] = JSON.stringify([{ id: 'car1', name: '1호차', driver: '박기사' }]);
  store['tkd_courses' + SUF] = JSON.stringify([{ id: 'c1', name: '오전반' }]);
  /* 옛 직원 PIN 이 평문으로 남은 업체 — 그래야 「옮기기」 카드가 나온다 */
  store['tkd_staff' + SUF] = JSON.stringify([{ id: 'st1', name: '김직원', pin: '1234' }]);
  store['tkd_notices' + SUF] = '[]';
  store['tkd_org' + SUF] = JSON.stringify({ name: '가온', icon: '🚐', bizType: biz,
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  const R = E.build({ src: src || NEW_SRC, biz: biz, localStorage: store });
  if (R.error) throw R.error;
  /* 화면이 글을 담는 칸 — 가짜 DOM 에 만들어 둔다(없으면 `innerHTML=` 에서 멈춘다) */
  ['admin-content', 'driver-att-host', 'ksk-msg', 'att-summary-panel', 'att-summary-btn']
    .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userBizType='" + biz + "';"
     + " window._userPaidUntil=Date.now()+1e9; _firstSyncOk=true;");
  /* 기기 정보는 이미 받아 둔 것으로 둔다(불러오는 중 글이 아니라 **카드 본문**을 보려고) */
  R.ev('_kioskLoaded=true; _kioskErr=false; _kioskInfo={hasCode:true,bound:false,updatedAt:0};');
  R.ev('members=loadMembers(); cars=loadCars(); courses=loadCourses();'
     + ' notices=loadNotices(); orgSettings=loadOrgSettings(); staff=loadStaff();');
  R.ev('driverAcctApi=function(){ return Promise.resolve({ok:true}); };');
  if (which === 'cars') { R.ev("currentAdminTab='cars'; renderCars();"); }
  /* ★ `renderAttendance()`·`renderDriverAttendance()` 는 **스스로 `admin-content` 를 채운다**
     (돌려주는 값이 없다) — 앱의 `renderAdminTab` 도 그렇게 부른다. 돌려받아 넣으면 화면이 빈다. */
  else { R.ev("currentAdminTab='attendance';"
    + " if(getBizType()==='logistics'||getBizType()==='delivery') renderDriverAttendance();"
    + " else renderAttendance();"); }
  return String(R.byId['admin-content'] ? R.byId['admin-content'].innerHTML : '');
}
const hasKiosk = (h) => /🎫 출석 전용 기기/.test(h);
const hasStaffMig = (h) => /🔢 옛 직원 PIN 옮기기/.test(h);

(async () => {
  console.log('════ ① 재현 — 옛 판(v312)은 네 업종 모두 **차량 탭**에 있었다');
  {
    ['academy', 'public', 'logistics', 'delivery'].forEach((b) => {
      ck('[옛] [' + b + '] 차량 탭에 출석 기기 카드', hasKiosk(screen(b, 'cars', OLD_SRC)), true);
    });
    ck('[옛] 학원 출결 화면에는 **없었다**', hasKiosk(screen('academy', 'att', OLD_SRC)), false);
    ck('[옛] 소스에서도 차량 화면에서만 불렀다',
      (codeOnly(OLD_SRC).match(/kioskCardHtml\(\)/g) || []).length, 2);  /* 정의 + 호출 */
  }

  console.log('\n② ★ 그 기기가 **무엇을 찍나** — 서버 코드 전수 (멈춤 근거)');
  {
    /* `kioskCheckin` 덩어리를 떠서 **어떤 찍기 함수**를 부르는지 본다 */
    const i = SRV.indexOf("if (action === 'kioskCheckin')");
    const blk = SRV.slice(i, SRV.indexOf("if (action === 'pinCheckin')", i));
    ck('★ kioskCheckin 이 부르는 찍기 함수',
      ['punchMember', 'punchStaff', 'punch('].filter((f) => blk.indexOf(f) >= 0).join(','), 'punchMember');
    ck('  직원 찍기(`punchStaff`)는 **안 부른다**', /punchStaff/.test(blk), false);
    ck('  기사 찍기(`punch(`)도 **안 부른다**', /await punch\(/.test(blk), false);
    /* `punchMember` 가 보는 PIN 과 쓰는 칸 */
    const j = SRV.indexOf('async function punchMember(');
    const pm = SRV.slice(j, SRV.indexOf('\n  async function', j + 10));
    ck('★ `punchMember` 가 보는 PIN 곳간',
      ['memberPins', 'staffPins', 'driverPins'].filter((c) => pm.indexOf(c) >= 0).join(','), 'memberPins');
    ck('  평문도 «회원» 명단만 본다', /list\.find\(m => m && String\(m\.pin \|\| ''\) === pin\)/.test(pm), true);
    ck('★ 쓰는 칸은 «회원» 출석 둘',
      ['attendance', 'attendanceTime'].filter((k) => pm.indexOf("'" + k + "'") >= 0).join(','),
      'attendance,attendanceTime');
    ck('  기사·직원 근태 칸은 안 쓴다',
      ['staffAtt', 'carState'].filter((k) => pm.indexOf(k) >= 0).join(',') || '0개', '0개');
    /* 앱 — 물류·택배 «회원» 에게 PIN 을 줄 길이 있나 */
    const mb = (b) => {
      const s = codeOnly(THIS_SRC);
      const i2 = s.indexOf('function applyBizModalLayout(');
      const body = s.slice(i2, s.indexOf('\n}', s.indexOf("if(biz==='delivery')", i2)));
      const seg = body.split("if(biz==='" + b + "')")[1] || '';
      return /wrapPin\)wrapPin\.style\.display='none'/.test(seg.split('} else if')[0] || '');
    };
    ck('★ 물류 «회원» 수정 창의 PIN 칸은 **숨는다**', mb('logistics'), true);
    ck('★ 택배도 숨는다', mb('delivery'), true);
    ck('  (대조) 학원·공공은 보인다',
      /if\(wrapPin\)wrapPin\.style\.display='';/.test(codeOnly(THIS_SRC)), true);
    /* 엑셀 양식에 PIN 칸이 있나 — 학원·공공 양식에만 있다 */
    const tpl = codeOnly(THIS_SRC);
    ck('★ 물류·택배 엑셀 양식에 PIN 칸 0',
      (tpl.match(/\['배정차량','주문번호'[^\]]*'PIN'/g) || []).length
      + (tpl.match(/\['거래처명'[^\]]*'PIN'/g) || []).length, 0);
    ck('  (대조) 학원·공공 양식에는 있다',
      /\['이름','코스\(수업반\)'[\s\S]{0,160}'PIN'/.test(tpl), true);
    console.log('     → 물류·택배는 그 기기로 **찍을 것이 없다**(«회원» PIN 을 줄 길 0)');
    console.log('     → 기사·직원 근태를 찍게 하려면 **서버 변경** → 자리 안 옮기고 멈춤 보고');
  }

  console.log('\n③ 고친 뒤 — 학원·공공은 출결 화면 · 물류·택배는 차량 탭 그대로');
  {
    ['academy', 'public'].forEach((b) => {
      ck('★ [' + b + '] **출결 화면**에 카드가 있다', hasKiosk(screen(b, 'att')), true);
      ck('  [' + b + '] 차량 탭에서는 **빠졌다**', hasKiosk(screen(b, 'cars')), false);
    });
    /* ★ 물류·택배는 **그 회차(v313)에는** 차량 탭에 그대로 두었다 —
       v314 에서 「근태관리」로 옮겼으므로(서버 갈래가 생겼다) 그 커밋에서 잰다. */
    ['logistics', 'delivery'].forEach((b) => {
      ck('[그때 ' + b + '] 차량 탭에 그대로 있었다', hasKiosk(screen(b, 'cars', THIS_SRC)), true);
      ck('  [그때 ' + b + '] 근태 화면에는 없었다', hasKiosk(screen(b, 'att', THIS_SRC)), false);
    });
    /* 출결 화면에서 PIN 체크인 단추 **아래**에 온다 */
    const h = screen('academy', 'att');
    ck('★ PIN 체크인 단추가 카드보다 앞에 있다',
      h.indexOf('🔢 PIN 체크인 모드 열기') < h.indexOf('🎫 출석 전용 기기'), true);
    ck('  카드 안 단추 셋이 그대로',
      ['🔄 코드 새로 만들기', '🗑 코드 지우기', 'ksk-msg'].filter((x) => h.indexOf(x) >= 0).length, 3);
    /* 물류·택배 카드에 **사실을 적는다** */
    const lg = screen('logistics', 'cars', THIS_SRC);
    ck('[그때 물류] 카드에 「아직 쓸 수 없어요」', /아직 쓸 수 없어요/.test(lg), true);
    ck('  그 글에 업종 용어(거래처)', /거래처에는 출석 PIN 칸이 없어요/.test(lg), true);
    ck('  근태 찍는 자리를 알려 준다', /「🔢 PIN 출퇴근 체크」/.test(lg), true);
    ck('  (대조) 학원 카드에는 그 줄이 없다', /아직 쓸 수 없어요/.test(h), false);
    ck('  [그때 택배] 용어도 맞다',
      /배송지에는 출석 PIN 칸이 없어요/.test(screen('delivery', 'cars', THIS_SRC)), true);
  }

  console.log('\n④ 옛 직원 PIN 카드 — **네 업종 모두 근태 블록**에');
  {
    ['academy', 'public'].forEach((b) => {
      ck('★ [' + b + '] 근태 블록(차량 탭 안)에 있다', hasStaffMig(screen(b, 'cars')), true);
    });
    ['logistics', 'delivery'].forEach((b) => {
      ck('★ [' + b + '] **근태 화면**에 있다', hasStaffMig(screen(b, 'att')), true);
      ck('  [' + b + '] 차량 탭에서는 빠졌다', hasStaffMig(screen(b, 'cars')), false);
    });
    ck('  (대조) 옛 판은 물류 근태 화면에 **없었다**',
      hasStaffMig(screen('logistics', 'att', OLD_SRC)), false);
    ck('  (대조) 옛 판은 물류 차량 탭에 있었다',
      hasStaffMig(screen('logistics', 'cars', OLD_SRC)), true);
    ck('★ 부르는 곳은 **한 곳**(근태 블록)',
      (codeOnly(NEW_SRC).match(/staffMigrateCardHtml\(\)/g) || []).length, 2);  /* 정의 + 호출 */
  }

  console.log('\n⑤ 다시 그리는 자리 · 소스 전수');
  {
    ck('★ 탭 이름을 박아 둔 자리 0', (codeOnly(NEW_SRC).match(/currentAdminTab==='cars'/g) || []).length, 0);
    ck('  (대조) 옛 판은 넷이었다', (codeOnly(OLD_SRC).match(/currentAdminTab==='cars'/g) || []).length, 4);
    ck('  이제 열린 탭을 다시 그린다',
      (NEW_SRC.match(/renderAdminTab\(currentAdminTab\)/g) || []).length >= 5 ? 'OK' : 'NG', 'OK');
    /* ★ 「서버 0줄」은 **두 커밋 사이**로 잰다 — 하나만 쓰면 작업트리까지 재서
       다음 회차(v314 가 서버를 고쳤다)에 거짓으로 깨진다(v272 보정1 규칙). */
    ck('★ `api/`·`lib/`·규칙·`storage.rules` 0줄',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF
        + (THIS_REF ? ' ' + THIS_REF : '')
        + ' -- api lib firestore.rules storage.rules', { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
    console.log('      (잰 자리: ' + OLD_REF + ' → ' + (THIS_REF || '작업트리') + ')');
    const panels = (s) => (s.match(/BACK_PANEL_IDS\s*=\s*\[[\s\S]*?\]/) || [''])[0];
    ck('  새 창(덮개) 0', panels(NEW_SRC) === panels(OLD_SRC) ? '그대로' : '바뀜', '그대로');
    ck('  (로그아웃 짝) 새 `setInterval`·리스너 0',
      (NEW_SRC.match(/setInterval\(/g) || []).length === (OLD_SRC.match(/setInterval\(/g) || []).length
        && (NEW_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length === (OLD_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length, true);
    ck('  (로그아웃 짝) `_kioskLoaded` 깃발은 그대로 셋',
      (NEW_SRC.match(/_kioskLoaded/g) || []).length === (OLD_SRC.match(/_kioskLoaded/g) || []).length, true);
    ck('  (업체 분리) `ORG_KEYS` 그대로',
      (NEW_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0] === (OLD_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0], true);
    ck('  카드 기능 함수는 그대로',
      ['kioskCodeIssue', 'kioskUnbindAsk', 'kioskCodeRemoveAsk', 'kioskInfoLoad']
        .filter((f) => new RegExp('function ' + f + '\\(').test(NEW_SRC)).length, 4);
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    ck('  버전 313 이상', appV >= 313 ? 'OK(' + appV + ')' : 'NG(' + appV + ')', 'OK(' + appV + ')');
    ck('  `version.json` 과 같다', String(JSON.parse(F('version.json')).version), String(appV));
    const QA = (s) => { const i = s.indexOf('var HELP_QA=['); return i < 0 ? '' : s.slice(i, s.indexOf('\n];', i)); };
    ck('★ HELP_QA — 출석 기기 자리가 «출결»관리 탭',
      /«출결»관리」 탭의 「🎫 출석 전용 기기」/.test(QA(NEW_SRC)), true);
    ck('  (대조) 옛 안내는 차량관리 탭이었다',
      /차량관리 탭의 「🎫 출석 전용 기기」/.test(QA(OLD_SRC)), true);
    ck('★ HELP_QA — 직원 PIN 카드가 네 업종 모두 근태 화면',
      /네 업종 모두 <b>근태 화면<\/b>에서 보여요/.test(QA(NEW_SRC)), true);
    const qaN = (s) => (QA(s).match(/\{role:'(admin|driver|all)'/g) || []).length;
    ck('  문답 항목 수는 그대로', qaN(NEW_SRC), qaN(OLD_SRC));
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 소스·가짜 DOM 만 봤습니다');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
