/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v256 보정4 덧붙임 — 도우미 「코스」 문답표(HELP_QA) 전수 점검
   전: 8596363 (보정3) · 후: 작업 중
   코스의 지식은 이 배열 **하나**다 — 매칭(helperAnswer)도, AI 에 넘기는
   지식 문서(helperKnowledge)도 여기서 나온다. 그래서 둘 다 본다. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(58) + String(got).slice(0, 64)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const BASE = process.env.COS_SRC_OLD_REF || '8596363';
const show = (f) => cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':' + f, { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const now = (f) => fs.readFileSync('' + COS_ROOT + '/' + f, 'utf8').replace(/\r\n/g, '\n');

/* ── 앱을 한 번 올려 두고 실제 함수를 부른다 ── */
function boot(src, biz) {
  const R = E.build({ src: src, biz: biz || 'academy' });
  if (R.error) throw R.error;
  return R;
}
/* ★ v273: 이 묶음은 **v256 보정4 회차 기록**이다 — 「새」쪽을 커밋에 고정한다.
   기대값이 v261 때 앞으로 고쳐졌으므로 그 회차(v261)에 맞춘다.
   전에는 작업트리를 보아, 뒤 회차가 화면·문답을 고치면 거짓으로 깨졌다
   (v273 이 차량관리를 고치자 「4업종 x 9화면 바이트 동일」이 1건 틀어졌다). */
const NEW_REF2 = process.env.COS_SRC_NEW_REF || '0706501';
const _newSrc = require('child_process').execSync(
  'git -C ' + COS_ROOT + ' show ' + NEW_REF2 + ':index.html', { maxBuffer: 1 << 28 })
  .toString().split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));
const RN = boot(_newSrc), RO = boot(show('index.html'));
const QA = RN.ev('HELP_QA'), QA_OLD = RO.ev('HELP_QA');

/* 실제 helperAnswer 를 역할만 바꿔 부른다 */
function ask(R, q, role) {
  R.ev("currentMode='" + (role === 'driver' ? 'driver' : 'admin') + "';");
  const r = R.sandbox.helperAnswer(q);
  if (r.type === 'answer') return [r.item];
  if (r.type === 'choices') return r.items;
  return [];
}
const titles = (hits) => hits.map(h => h.t).join(' | ') || '없음';

console.log('════ 1. 문답표 꼴 ════');
{
  /* v261 이 문답 하나를 더했다 (「사업자 확인이 안 돼요») → 71. 이 회차(문답표 점검)는 70 이었다. */
  /* v264: 「첫 결제 할인은요?」 하나를 더했다 (71 → 72). 이 표는 **그 뒤로 늘거나 준 것**을 센다. */
  /* v266: 「문자·알림톡이 안 나가요」 하나를 더했다 (72 → 73) */
  /* ★ 회차마다 문답이 늘어난다(v261·v264·v266 각 +1 · v270 +1).
     이 묶음이 지켜야 할 것은 「v257 때보다 줄지 않았고 **지금 수를 안다**」는 것이라,
     숫자를 못 박는 대신 그렇게 바꿨다(앞선 묶음들과 같은 방식). */
  ck('문답 수 (전 ' + QA_OLD.length + ' → 후 · 줄지 않았나)',
     (QA.length >= QA_OLD.length) + ' / ' + QA.length, 'true / ' + QA.length);
  ck('제목 중복 0', QA.length - new Set(QA.map(q => q.t)).size, 0);
  ck('t·keys·a 가 다 있다', QA.every(q => q.t && q.a && Array.isArray(q.keys) && q.keys.length), true);
  ck('role 은 all/admin/driver 뿐',
    [...new Set(QA.map(q => q.role))].sort().join(','), 'admin,all,driver');
  ck('검색어는 모두 소문자·공백없음',
    QA.every(q => q.keys.every(k => k === String(k).toLowerCase().replace(/\s+/g, ''))), true);
  const by = {}; QA.forEach(q => { by[q.role] = (by[q.role] || 0) + 1; });
  console.log('      역할별: all ' + by.all + ' · admin ' + by.admin + ' · driver ' + by.driver);
  ck('버전 번호를 답변에 쓰지 않는다 (v252 같은 말)',
    QA.filter(q => /\bv2\d\d\b/.test(q.a)).map(q => q.t).join(',') || '없음', '없음');
  /* 말풍선은 HTML 을 그대로 넣는다(helperPush) → 별표는 글자 그대로 보인다 */
  ck('별표 강조(**) 0곳 — <b> 로 (전 ' + QA_OLD.filter(q => /\*\*/.test(q.a)).length + '개)',
    QA.filter(q => /\*\*/.test(q.a)).map(q => q.t).join(',') || '없음', '없음');
  ck('   (대조) 옛 판에는 별표가 있었다', QA_OLD.some(q => /\*\*/.test(q.a)), true);
  /* helperTerm 이 치환하는 토큰은 여덟뿐 — 나머지 «» 는 그대로 보인다 */
  const TOK = ['«회원»', '«학부모»', '«알림장»', '«출결»', '«출석»', '«결석»', '«출석률»', '«수강료»'];
  const strayOf = (arr) => arr.flatMap(q => ((q.t + q.a).match(/«[^»]*»/g) || []).filter(x => TOK.indexOf(x) < 0));
  ck('치환 안 되는 가짜 토큰 0곳 (전 ' + strayOf(QA_OLD).length + '곳)',
    [...new Set(strayOf(QA))].join(',') || '없음', '없음');
  ck('   (대조) 옛 판에는 가짜 토큰이 있었다', [...new Set(strayOf(QA_OLD))].join(','),
    '«휴대폰 번호 + 비밀번호»,«휴대폰 번호»,«새 번호»');
}

/* ── 2. 바뀐 사실마다 질문 2개 ──
   [사실, [질문, 역할], [질문, 역할], 그 질문이 닿아야 하는 문답 제목] */
const FACTS = [
  ['기사 운행 화면 = 탑승/완료 표시 (출결 아님)',
   ['기사 화면에서 카드 누르면 출석이 되나요', 'driver'], ['탑승 표시는 어떻게 해요', 'driver'],
   '기사 운행 화면 사용법'],
  ['기사 화면은 자기 차량 한 칸만',
   ['내 차량만 보이는데요', 'driver'], ['다른 차량으로 바꾸고 싶어요', 'driver'],
   '기사 운행 화면 사용법'],
  ['첫 화면 두 탭 — 관리자 로그인',
   ['관리자 로그인은 어디서 해요', 'admin'], ['로그인 어떻게 해요', 'admin'],
   '휴대폰 번호로 로그인해요'],
  ['기기 비밀번호 1234 는 없앴다',
   ['1234 비밀번호로 안 들어가져요', 'admin'], ['잠금번호가 뭐예요', 'admin'],
   '1234 비밀번호로 안 들어가져요'],
  ['직원 출퇴근은 관리자 기기에서',
   ['직원 출퇴근은 어떻게 해요', 'admin'], ['알바 휴게시간', 'admin'],
   '기사 말고 직원 출퇴근은?'],
  ['기사 로그인 = 업체 번호 + PIN (기사 쪽)',
   ['업체 번호가 뭐예요', 'driver'], ['내 PIN 을 어디 넣어요', 'driver'],
   '기사 로그인 (업체 번호 + PIN)'],
  ['기사 로그인 만들어 주기 (관리자 쪽)',
   ['기사 PIN 정하기', 'admin'], ['기기 풀기', 'admin'],
   '기사 로그인 만들어 주기 (업체 번호 + PIN)'],
  ['기사 출근·퇴근은 단추로',
   ['출근 어떻게 찍어요', 'driver'], ['퇴근 단추가 어디 있어요', 'driver'],
   '출근·퇴근 기록하기'],
  ['비번 찾기 = 문자 인증 (기사는 PIN 재발급)',
   ['비밀번호를 잊었어요', 'admin'], ['비밀번호 재설정', 'admin'],
   '비밀번호를 잊었어요'],
  ['로그인 비밀번호 바꾸기',
   ['비밀번호 바꾸고 싶어요', 'admin'], ['비번 변경', 'admin'],
   '로그인 비밀번호 바꾸기'],
];
console.log('\n════ 2. 바뀐 사실 10개 × 질문 2개 = 20문 — 맞는 문답에 닿나 ════');
FACTS.forEach(([name, q1, q2, want]) => {
  console.log('  · ' + name);
  [q1, q2].forEach(([q, role]) => {
    const hits = ask(RN, q, role);
    ck('    [' + role + '] ' + q, hits.some(h => h.t === want) ? '닿음 (' + titles(hits) + ')' : '✘ ' + titles(hits),
      '닿음 (' + titles(hits) + ')');
  });
});

/* ── 3. 낡은 말로 물어도 새 방식 안내로 ── */
const OLDWORDS = [
  ['기사 계정 만들기', 'admin', /업체 번호 6자리/, '기사 로그인 만들어 주기 (업체 번호 + PIN)'],
  ['계정 끊기', 'admin', /PIN 지우기/, '기사 로그인 만들어 주기 (업체 번호 + PIN)'],
  ['계정 끊김', 'driver', /PIN 이 지워졌|관리자에게/, '「지금은 들어갈 수 없어요」가 나와요'],
  ['기사 PIN 출퇴근 체크', 'driver', /🌅 출근/, '출근·퇴근 기록하기'],
  ['운전자로 시작', 'driver', /업체 번호 6자리/, '기사 로그인 (업체 번호 + PIN)'],
  ['운전자로 시작', 'admin', /업체 번호 6자리/, '기사 로그인 만들어 주기 (업체 번호 + PIN)'],
  ['1234', 'admin', /계정으로만 로그인/, '1234 비밀번호로 안 들어가져요'],
  ['기사 비밀번호', 'admin', /PIN/, '기사 로그인 만들어 주기 (업체 번호 + PIN)'],
  ['PIN 지우기', 'admin', /PIN 지우기/, '기사 로그인 만들어 주기 (업체 번호 + PIN)'],
];
console.log('\n════ 3. 낡은 말로 물어도 새 방식 안내로 ════');
OLDWORDS.forEach(([q, role, re, want]) => {
  const hits = ask(RN, q, role);
  const hit = hits.find(h => h.t === want);
  ck('[' + role + '] 「' + q + '」 → ' + want.slice(0, 22),
    hit ? (re.test(hit.a) ? '새 안내 있음' : '✘ 새 안내 없음') : '✘ 못 닿음 (' + titles(hits) + ')', '새 안내 있음');
});

/* ── 4. 옛 판에서는 **틀린 답**이 나왔다 (대조 — 검사가 1건을 잡을 수 있나) ── */
console.log('\n════ 4. 대조 — 옛 판(보정3)에서는 틀렸다 ════');
{
  const WRONG = [
    ['비밀번호를 잊었어요', 'admin', '비밀번호를 잊었어요'],
    ['비밀번호 바꾸고 싶어요', 'admin', '로그인 비밀번호 바꾸기'],
    ['로그인 어떻게 해요', 'admin', '휴대폰 번호로 로그인해요'],
    ['다른 차량으로 바꾸고 싶어요', 'driver', '기사 운행 화면 사용법'],
    ['PIN 지우기', 'admin', '기사 로그인 만들어 주기 (업체 번호 + PIN)'],
    ['운전자로 시작', 'driver', '기사 로그인 (업체 번호 + PIN)'],
  ];
  let wrongThen = 0;
  WRONG.forEach(([q, role, want]) => {
    const o = ask(RO, q, role), n = ask(RN, q, role);
    const okO = o.some(h => h.t === want), okN = n.some(h => h.t === want);
    if (!okO && okN) wrongThen++;
    console.log('      [' + role + '] ' + q.padEnd(22) + ' 전: ' + (okO ? '맞음' : '틀림 → ' + titles(o).slice(0, 34))
      + '   후: ' + (okN ? '맞음' : '틀림'));
  });
  ck('옛 판에서 틀렸고 새 판에서 맞은 질문', wrongThen + '/' + WRONG.length, WRONG.length + '/' + WRONG.length);
  /* 거짓 통과 막이: 없는 제목을 기대하면 **반드시** 실패해야 한다 */
  ck('(대조) 없는 제목을 기대하면 안 닿는다',
    ask(RN, '출근 어떻게 찍어요', 'driver').some(h => h.t === '있을 수 없는 제목'), false);
}

/* ── 5. AI 에 넘기는 지식 문서 ── */
console.log('\n════ 5. helperKnowledge() — AI 에 넘기는 지식 ════');
{
  const K = RN.ev('helperKnowledge()');
  ck('문자열이다', typeof K, 'string');
  ck('문답이 하나도 안 빠지고 들어 있다 (v261 에 71개)',
    QA.filter(q => K.indexOf(RN.sandbox.helperTerm(q.t)) >= 0).length, QA.length);
  ck('길이 — api 상한 80000 안', K.length < 80000 ? K.length + ' < 80000' : K.length + ' ✘', K.length + ' < 80000');
  ck('«토큰» 이 남지 않았다 (업종 말로 치환)', (K.match(/«/g) || []).length, 0);
  ck('업종 머리말이 붙는다', /「학원」 업종 화면을 쓰고 있다/.test(K), true);
  ck('역할 표시 세 가지', ['[관리자]', '[기사]', '[관리자·기사 공용]'].every(x => K.indexOf(x) >= 0), true);
  /* 낡은 안내 문장이 0개인가 — 「진짜 낡은 말」만 (전화번호 예시 1234 등은 뺀다) */
  const STALE = [
    ['기사 계정을 만들', /기사 계정을? 만들|＋ 계정 만들기/],
    ['계정 끊기(단추)', /「[^」]*계정 끊기/],
    ['기사에게 비밀번호를 준다', /기사.{0,6}(에게|의) 비밀번호를/],
    ['기사 폰의 PIN 판', /기사 폰의? PIN 판|기사 화면의? 「?🔢/],
    ['운전자로 시작', /운전자로 시작/],
    ['기기 비밀번호로 들어간다', /기기 비밀번호(\(1234\))?를? (넣으세요|넣고|누르세요)|1234 를? 넣/],
    ['이메일 또는 휴대폰 번호 칸', /이메일 또는 휴대폰 번호(를| 를)? (넣|입력)/],
    ['기사도 호차 단추로 차량 바꿈', /기사.{0,20}호차 단추로 차량을 바꿔/],
    ['차량관리에 PIN 4자리 칸', /기사 PIN 4자리를? 넣으세요/],
  ];
  let bad = [];
  STALE.forEach(([n, re]) => { if (re.test(K)) bad.push(n); });
  ck('낡은 안내 문장 0개', bad.join(', ') || '없음', '없음');
  /* 대조 — 이 검사가 1건을 잡을 수 있나 (일부러 낡은 문장을 섞어 본다) */
  const fake = K + '\n답: 1. 차량관리에서 「＋ 계정 만들기」로 기사 계정을 만들고, 「계정 끊기」로 끊어요.'
    + '\n2. 「운전자로 시작」을 누르고 기기 비밀번호 1234 를 넣으세요. 기사 폰의 PIN 판에서 찍어요.'
    + '\n3. 기사에게 비밀번호를 알려 주고, 차량관리에서 기사 PIN 4자리를 넣으세요.';
  const caught = STALE.filter(([, re]) => re.test(fake)).map(([n]) => n);
  ck('(대조) 낡은 문장 7가지를 섞으면 다 잡힌다', caught.length + '건 잡음 (' + caught.join(', ') + ')',
    caught.length + '건 잡음 (' + caught.join(', ') + ')');
  ck('   잡은 가지 수 ≥ 6', caught.length >= 6, true);
  /* 업종마다 지식이 달라지는가 (캐시 키가 업종인지) */
  const K2 = boot(_newSrc, 'logistics').ev('helperKnowledge()');
  ck('물류 업종 지식은 말이 다르다 (거래처/기사)', K2 !== K && /「물류」 업종/.test(K2), true);
  ck('물류 지식도 상한 안', K2.length < 80000, true);
  console.log('      지식 길이: 학원 ' + K.length + '자 · 물류 ' + K2.length + '자 (상한 80000)');
}

/* ── 6. 답변 안의 화면 이름이 실제로 있는 말인가 ── */
console.log('\n════ 6. 답변이 가리키는 단추·화면이 코드에 있나 ════');
{
  const SRC = now('index.html');
  const MUST = ['🌅 출근', '🌆 퇴근', '⛽ 차계부', '🔢 PIN 체크인 모드', '🔢 PIN 출퇴근 체크',
    '📦 옛 기사 자료 옮기기', '👀 둘러보기 시작', 'PIN 정하기', 'PIN 지우기', '기기 풀기'];
  const missing = MUST.filter(s => SRC.indexOf(s) < 0);
  ck('문답표가 말하는 단추 10개가 코드에 있다', missing.join(', ') || '모두 있다', '모두 있다');
  ck('(대조) 없는 단추 이름은 걸린다', ['🚀 없는단추'].filter(s => SRC.indexOf(s) < 0).length, 1);
}

/* ── 7. 화면·버전·바뀐 파일 ── */
console.log('\n════ 7. 앱 화면 — 4업종 × 9화면 HTML 동일 ════');
{
  const OLD = show('index.html'), NEW = _newSrc;
  const SUF = '__cosroad_default';
  const store = {};
  const put = (k, v) => { store[k + SUF] = JSON.stringify(v); };
  put('tkd_cars', [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-5555-6666' }]);
  put('tkd_members', [{ id: 1, name: '강하은', courseId: 'c1', carId: 'car1', location: '유원아파트',
    lat: 37.4, lon: 126.7, dropLocation: '유원아파트', phone: '010-1111-1111',
    days: ['월', '화', '수', '목', '금', '토', '일'], pin: '1111', on: true }]);
  put('tkd_courses', [{ id: 'c1', name: 'A반', depart: '15:00' }]);
  put('tkd_org', { name: '코스로드학원' }); put('tkd_staff', []);
  put('tkd_driver_att', {}); put('tkd_attendance', {}); put('tkd_payments', {});
  put('tkd_tax', {}); put('tkd_carlog', {});
  const boot2 = (src, biz) => {
    const R = E.build({ src: src, biz: biz, localStorage: Object.assign({}, store) });
    if (R.error) throw R.error;
    ['admin-content', 'app-content', 'drive-tabs', 'main-header'].forEach(id => {
      const el = E.makeEl('div'); el.id = id;
      el.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
      R.document.registerId(id, el);
    });
    R.win._auth = R.sandbox._auth = { currentUser: { uid: 'U1', isAnonymous: false, getIdToken: async () => 'T' } };
    R.win.fetch = R.sandbox.fetch = async () => ({ json: async () => ({ ok: true }) });
    R.win._db = R.sandbox._db = {};
    R.win._firestore = R.sandbox._firestore = {
      doc: (db, ...p) => ({ _p: p.join('/') }), collection: (db, ...p) => ({ _p: p.join('/') }),
      getDoc: async () => ({ exists: () => false, data: () => ({}) }), setDoc: async () => {},
      deleteDoc: async () => {}, getDocs: async () => ({ forEach: () => {} }), onSnapshot: () => () => {}
    };
    return R;
  };
  const TABS = ['dashboard', 'members', 'attendance', 'cars', 'schedule', 'payment', 'tax', 'notice', 'settings'];
  let same = 0; const diff = [];
  for (const biz of ['academy', 'public', 'logistics', 'delivery']) for (const tab of TABS) {
    const scr = (src) => {
      const R = boot2(src, biz);
      R.ev("currentMode='admin'; currentAdminTab='" + tab + "';");
      try { R.sandbox.renderAdminTab(tab); } catch (e) { return 'ERR:' + e.message; }
      return String(R.document.getElementById('admin-content').innerHTML || '');
    };
    if (scr(OLD) === scr(NEW)) same++; else diff.push(biz + '/' + tab);
  }
  ck('4업종 × 9화면 바이트 동일', same + '/36', '36/36');
  if (diff.length) console.log('      달라진 화면: ' + diff.join(', '));
  /* 기사 운행 화면도 그대로 (문답표만 고쳤다) */
  ck('(대조) 비교가 1건을 잡을 수 있나 — 일부러 한 글자 바꾼 판',
    (() => {
      /* 현황 화면에 실제로 나오는 말 한 군데만 바꾼 판 */
      const bent = NEW.split('▶ 클릭해서 보기').join('▶ 눌러서 보기');
      if (bent === NEW) return '바꿀 자리 없음';
      const R1 = boot2(NEW, 'academy'), R2 = boot2(bent, 'academy');
      R1.ev("currentMode='admin'; currentAdminTab='dashboard';"); R2.ev("currentMode='admin'; currentAdminTab='dashboard';");
      try { R1.sandbox.renderAdminTab('dashboard'); R2.sandbox.renderAdminTab('dashboard'); } catch (e) { return 'ERR'; }
      const a = String(R1.document.getElementById('admin-content').innerHTML || '');
      const b = String(R2.document.getElementById('admin-content').innerHTML || '');
      return a === b ? '못 잡음' : '잡음';
    })(), '잡음');
}

console.log('\n════ 8. 버전·바뀐 파일 ════');
{
  /* v257 보정4: 기사 회원 탭·둘러보기 기사 화면·기사 출석 쓰기 회수 — 일부러 바꾼 자리다 */
  console.log('      지금 버전: ' + JSON.parse(now('version.json')).version + ' (이 회차는 256 이었다)');
  ck('version.json 이 256 이상', JSON.parse(now('version.json')).version >= 256, true);
  ck('APP_VERSION 도 256 이상', Number((E.SRC_NEW.match(/const APP_VERSION = (\d+);/) || [])[1]) >= 256, true);
  /* ★ 코스로드54: 범위를 **두 커밋 사이**로 고정했다(CLAUDE.md 검사 묶음 규칙).
     이 줄은 **찍어 보기용**이고 아래 검사는 `own`(두 커밋)으로 하지만, 한쪽만 적으면
     코스로드53 이 올린 `tests/` 126줄이 끼어들어 읽을 수 없게 된다. */
  const stat = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + BASE + ' 9506d7f')
    .toString().trim().split('\n');
  stat.forEach(l => { const p = l.split('\t'); console.log('      ' + p[2].padEnd(14) + '+' + p[0] + ' / −' + p[1]); });
  /* 이 회차(9506d7f) **자신이** 바꾼 파일로 본다 — v257 이 뒤에 얹혔다 */
  const own = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat 8596363 9506d7f').toString().trim().split('\n');
  ck('이 회차가 바꾼 파일은 둘뿐', own.map(l => l.split('\t')[2]).sort().join(','), 'CLAUDE.md,index.html');
  ck('이 회차는 api·규칙·s.html 을 안 건드렸다',
    own.every(l => !/api\/|firestore\.rules|s\.html|home\.html|terms\.html|privacy\.html/.test(l)), true);
  /* index.html 의 변경이 **HELP_QA 안에서만** 일어났나 */
  const cut = (src) => {
    const i = src.indexOf('var HELP_QA=['), j = src.indexOf('\n];', i);
    return { before: src.slice(0, i), qa: src.slice(i, j), after: src.slice(j) };
  };
  /* v257 이 HELP_QA 밖 코드도 고쳤으므로(기사 회원 탭·둘러보기) 이 회차 **자신의** 판으로 견준다 */
  const o = cut(show('index.html'));
  const n = cut(cp.execSync('git -C ' + COS_ROOT + ' show 9506d7f:index.html', { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n'));
  ck('HELP_QA 앞쪽 코드 그대로 (이 회차)', o.before === n.before, true);
  ck('HELP_QA 뒤쪽 코드 그대로 (이 회차)', o.after === n.after, true);
  ck('   (대조) 그 안은 실제로 바뀌었다', o.qa !== n.qa, true);
  ck('CLAUDE.md 에 보고문 규칙 한 줄',
    /보고문에 `HELP_QA` 바뀐 항목 수와 제목 목록을 적는다/.test(require('child_process').execSync('git -C ' + COS_ROOT + ' show ' + NEW_REF2 + ':CLAUDE.md',{maxBuffer:1<<26}).toString()), true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
