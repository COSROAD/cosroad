/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v271 보정1 — 혜택 조항 + 제5조·제12조 정리 + 앱 환불 문답.
   ★ 바깥 요청은 전부 막는다(file:// 만) — 서버로 나가는 길이 아예 없다. */
const { chromium } = require('playwright');
const cp = require('child_process');
/* ★ v273: 이 묶음은 **v271 보정1 회차 기록**이다 — 읽는 쪽을 그 회차 커밋(ffd3c0e)에 고정한다.
   전에는 **일하는 폴더**를 읽었다. 그래서 v273 이 문답을 하나 더하자(75→76)
   「문답 75개」가 거짓으로 깨졌다 — v271 보정1 이 틀린 것이 아니다.
   지금 문답표는 그 회차의 묶음(run273·m_qa257)이 본다. */
const PIN_REF = process.env.COS_SRC_NEW_REF || 'ffd3c0e';
const _dir = require('path').join(__dirname, 'pin271b');
require('fs').mkdirSync(_dir, { recursive: true });
['index.html', 'terms.html', 'home.html'].forEach(function (f) {
  require('fs').writeFileSync(require('path').join(_dir, f), require('child_process').execSync(
    'git -C ' + COS_ROOT + ' show ' + PIN_REF + ':' + f, { maxBuffer: 1 << 28 }));
});
const DIR = _dir.split(String.fromCharCode(92)).join('/') + '/';
const BASE = process.env.COS_SRC_OLD_REF || '5480189';   /* v271 (보정1 전) */
const SIZES = [[390, 844], [360, 640], [1366, 768]];

async function page(b, w, h, file, hash) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    errs.push('console: ' + t.slice(0, 140));
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + file + (hash || ''), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(250);
  p.__errs = errs;
  return p;
}

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('① terms.html — 제5조 · 제11조 1~10항 · 제12조');
  for (const [w, h] of SIZES) {
    const p = await page(b, w, h, DIR + 'terms.html', '#refund');
    const r = await p.evaluate(() => {
      const txt = (sel) => {
        const h2 = Array.from(document.querySelectorAll('h2'))
          .find((e) => e.textContent.indexOf(sel) >= 0);
        return h2 ? { title: h2.textContent.trim(), body: h2.nextElementSibling.textContent } : null;
      };
      const a5 = txt('제5조'), a11 = txt('제11조'), a12 = txt('제12조');
      const nums = (s) => (s.match(/(?:^|\n)\s*(\d+)\./g) || []).map((x) => Number(x.replace(/\D/g, '')));
      const cs = getComputedStyle(document.body);
      const ref = document.getElementById('refund');
      return {
        vw: window.innerWidth, scrollW: document.documentElement.scrollWidth,
        t5: a5.title, n5: nums(a5.body), b5: a5.body,
        t11: a11.title, n11: nums(a11.body), b11: a11.body,
        b12: a12.body,
        wordBreak: cs.wordBreak, overflowWrap: cs.overflowWrap,
        anchorTop: Math.round(ref.getBoundingClientRect().top),
        right11: Math.round(a11.nextElementSibling ? 0 : 0),
        bodyRight: Math.round(document.querySelector('h2 + p').getBoundingClientRect().right),
        notice: (document.querySelector('.meta') || {}).textContent || '',
        free: /무료\s*체험/.test(document.body.textContent)
      };
    });
    const tag = '[' + w + 'x' + h + '] ';
    say(r.scrollW <= r.vw, (tag + '가로 넘침 0').padEnd(30) + r.scrollW + ' <= ' + r.vw);
    say(r.wordBreak === 'keep-all' && r.overflowWrap === 'anywhere',
      (tag + 'keep-all · anywhere').padEnd(30) + r.wordBreak + ' / ' + r.overflowWrap);
    /* 제5조 */
    say(r.t5 === '제5조 (이용 계약 및 체험)', (tag + '제5조 제목').padEnd(30) + r.t5);
    say(JSON.stringify(r.n5) === JSON.stringify([1, 2, 3]),
      (tag + '제5조 1~3항').padEnd(30) + r.n5.join(','));
    say(/입금을 확인해 승인하면 성립/.test(r.b5), (tag + '제5조 1항 승인 성립').padEnd(30) + 'true');
    say(/승인일부터/.test(r.b5) && /30일간 체험 기간/.test(r.b5),
      (tag + '제5조 2항 승인일부터 30일').padEnd(30) + 'true');
    say(/끝까지 이용하는 것을 조건/.test(r.b5) && /제11조에 따릅니다/.test(r.b5),
      (tag + '제5조 3항 혜택 조건').padEnd(30) + 'true');
    say(!/비용이 청구되지 않습니다/.test(r.b5), (tag + '옛 4항 삭제됨').padEnd(30) + 'true');
    /* 제11조 */
    /* textContent 는 「1. 본 서비스는…」으로 시작하므로 1항도 nums 에 들어온다 */
    say(JSON.stringify(r.n11) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      (tag + '제11조 1~10항 이어짐').padEnd(30) + r.n11.join(','));
    say(/7일 이내에 환불을 요청하면[\s\S]*?전액을 환불합니다/.test(r.b11),
      (tag + '제11조 2항 7일 전액 그대로').padEnd(30) + 'true');
    say(/7\.\s*30일 체험과 첫 결제 할인은 결제한 이용 기간을 끝까지/.test(r.b11),
      (tag + '제11조 7항 혜택 조항').padEnd(30) + 'true');
    say(/별도의 위약금은 없습니다/.test(r.b11), (tag + '제11조 7항 위약금 없음').padEnd(30) + 'true');
    say(/10\.\s*환불·해지 문의/.test(r.b11), (tag + '제11조 10항 문의').padEnd(30) + 'true');
    /* 제12조 · 공통 */
    say(/2\.\s*회사는 체험 기간의 서비스 하자/.test(r.b12),
      (tag + '제12조 2항 「체험 기간」').padEnd(30) + 'true');
    say(r.free === false, (tag + '「무료 체험」 글자 0').padEnd(30) + (r.free ? '★ 남아 있음' : '0곳'));
    say(r.anchorTop >= -2 && r.anchorTop < h, (tag + '#refund 닻이 보인다').padEnd(30) + 'top ' + r.anchorTop);
    say(/2026년 11월 4일/.test(r.notice) && /최초 시행 2026년 8월 1일/.test(r.notice),
      (tag + '공고일·시행일 그대로').padEnd(30) + r.notice.replace(/\s+/g, ' ').trim().slice(0, 56));
    say(r.bodyRight <= r.vw, (tag + '본문이 화면 안').padEnd(30) + '오른쪽 ' + r.bodyRight);
    say(p.__errs.length === 0, (tag + '오류 0건').padEnd(30) + (p.__errs.length ? p.__errs[0] : 'OK'));
    await p.close();
  }

  console.log('\n② 앱 도우미 — 관리자에게만 새 문답이 나오나 (실제 helperAnswer)');
  for (const [w, h] of SIZES) {
    const p = await page(b, w, h, DIR + 'index.html');
    await p.waitForFunction(() => typeof helperAnswer === 'function', {}, { timeout: 20000 });
    const r = await p.evaluate(() => {
      const ask = (q, role) => {
        currentMode = (role === 'driver') ? 'driver' : 'admin';
        const res = helperAnswer(q);
        if (res.type === 'answer') return [res.item.t];
        if (res.type === 'choices') return res.items.map((x) => x.t);
        return [];
      };
      const T = '환불·해지는 어떻게 되나요?';
      const item = HELP_QA.find((x) => x.t === T);
      return {
        total: HELP_QA.length, role: item && item.role, keys: item && item.keys,
        admin환불: ask('환불', 'admin'), admin7일: ask('7일 안에 환불되나요', 'admin'),
        admin해지: ask('해지하고 싶어요', 'admin'), admin취소: ask('취소', 'admin'),
        admin위약금: ask('위약금 있나요', 'admin'),
        drv환불: ask('환불', 'driver'), drv해지: ask('해지', 'driver'),
        /* ★ 대조 — 기사가 **옛날부터 있던** 관리자 문답을 물어도 같은 일이 일어난다.
           helperAnswer 4719~4722행이 「한 역할에서 못 찾으면 반대 역할도 한 번 더」를
           **일부러** 한다. 그래서 이것은 이번 문답 탓이 아니다(v271 에서도 그랬다). */
        drv구독: ask('구독', 'driver'), drv백업: ask('백업', 'driver'),
        adm출근: ask('출근', 'admin'),
        혜택: item && /끝까지 쓰실 때 드리는 혜택/.test(item.a),
        금액: item && /50,000|180,000|310,000|480,000/.test(item.a),
        약관: item && /이용약관 제11조/.test(item.a),
        /* 도우미가 AI 에 넘기는 지식 문서에도 들어가나 */
        knowAdmin: (typeof helperKnowledge === 'function')
          ? (currentMode = 'admin', /환불·해지는 어떻게 되나요/.test(helperKnowledge())) : null,
        knowDrv: (typeof helperKnowledge === 'function')
          ? (currentMode = 'driver', /환불·해지는 어떻게 되나요/.test(helperKnowledge())) : null,
        knowLabel: (typeof helperKnowledge === 'function')
          ? /\[관리자\] 질문: 환불·해지는 어떻게 되나요/.test(helperKnowledge()) : null
      };
    });
    const tag = '[' + w + 'x' + h + '] ';
    say(r.total === 75, (tag + '문답 75개').padEnd(30) + r.total);
    say(r.role === 'admin', (tag + 'role 관리자만').padEnd(30) + r.role);
    const T = '환불·해지는 어떻게 되나요?';
    say(r.admin환불.includes(T), (tag + '관리자 「환불」').padEnd(30) + r.admin환불.join(' | '));
    say(r.admin7일.includes(T), (tag + '관리자 「7일」').padEnd(30) + r.admin7일.join(' | '));
    say(r.admin해지.includes(T), (tag + '관리자 「해지」').padEnd(30) + r.admin해지.join(' | '));
    say(r.admin취소.includes(T), (tag + '관리자 「취소」').padEnd(30) + r.admin취소.join(' | '));
    say(r.admin위약금.includes(T), (tag + '관리자 「위약금」').padEnd(30) + r.admin위약금.join(' | '));
    /* ★ 기사도 이 답을 보기는 한다 — helperAnswer 의 **반대 역할 되짚기**(4719~4722행,
       일부러 넣은 것) 때문이다. 이번 문답만 그런 게 아니라 **관리자 문답 44개 전부**가
       옛날부터 그랬다(아래 「구독」·「백업」이 그 대조다). 그래서 「기사에겐 절대 안 보이게」는
       helperAnswer 를 고쳐야 하는 일이고, 이 지시문 범위 밖이라 보고만 한다.
       약관·홈페이지에 공개된 내용이라 새는 비밀은 없다. */
    say(r.drv구독.includes('이용 기간 · 연장') && r.drv백업.includes('백업/복원'),
      (tag + '(대조) 옛 관리자 문답도 기사에게').padEnd(30)
      + '구독→' + r.drv구독.join('|') + ' · 백업→' + r.drv백업.join('|'));
    say(r.adm출근.includes('출근·퇴근 기록하기'),
      (tag + '(대조) 거꾸로도 넘어간다').padEnd(30) + '관리자 「출근」→' + r.adm출근.join('|'));
    say(r.drv환불.includes(T) && r.drv해지.includes(T),
      (tag + '기사는 되짚기로만 본다').padEnd(30) + r.drv환불.join(' | '));
    say(r.혜택 === true, (tag + '혜택 줄 들어 있다').padEnd(30) + r.혜택);
    say(r.금액 === false, (tag + '금액 숫자 0개').padEnd(30) + (r.금액 ? '★ 있음' : '없음'));
    say(r.약관 === true, (tag + '약관 제11조 안내').padEnd(30) + r.약관);
    /* helperKnowledge 는 **역할로 걸러내지 않는다**(4643~4646행) — 대신 각 항목에
       [관리자]/[기사]/[관리자·기사 공용] 딱지를 붙여 AI 가 알게 한다. 그대로 확인한다. */
    say(r.knowAdmin === true && r.knowDrv === true && r.knowLabel === true,
      (tag + 'AI 지식문서에 [관리자] 딱지로').padEnd(30)
      + '들어감 ' + r.knowAdmin + ' · 딱지 ' + r.knowLabel);
    say(p.__errs.length === 0, (tag + '오류 0건').padEnd(30) + (p.__errs.length ? p.__errs[0] : 'OK'));
    await p.close();
  }

  console.log('\n③ home.html — 환불·해지 문답에 혜택 줄');
  for (const [w, h] of SIZES) {
    const p = await page(b, w, h, DIR + 'home.html');
    const r = await p.evaluate(() => {
      const n = (s) => String(s || '').toLowerCase().replace(/\s/g, '');
      const ask = (q) => (window.HELP_QA || [])
        .filter((x) => (x.keys || []).some((y) => n(q).indexOf(n(y)) >= 0)).map((x) => x.t);
      const ref = (window.HELP_QA || []).find((x) => x.t === '환불·해지');
      return {
        vw: window.innerWidth, scrollW: document.documentElement.scrollWidth,
        ask환불: ask('환불'), ask해지: ask('해지'), ask위약금: ask('위약금'),
        혜택: ref ? /끝까지 쓰실 때 드리는 혜택/.test(ref.a) : false,
        위약금없음: ref ? /따로 위약금은 없어요/.test(ref.a) : false,
        link: ref ? /terms\.html#refund/.test(ref.a) : false,
        줄수: ref ? ref.a.split('\n').length : 0,
        free: /무료\s*체험/.test(document.body.textContent)
      };
    });
    const tag = '[' + w + 'x' + h + '] ';
    say(r.scrollW <= r.vw, (tag + '가로 넘침 0').padEnd(30) + r.scrollW + ' <= ' + r.vw);
    say(r.ask환불.includes('환불·해지'), (tag + '「환불」').padEnd(30) + r.ask환불.join(' | '));
    say(r.ask해지.includes('환불·해지'), (tag + '「해지」').padEnd(30) + r.ask해지.join(' | '));
    say(r.ask위약금.includes('환불·해지'), (tag + '「위약금」').padEnd(30) + r.ask위약금.join(' | '));
    say(r.혜택 && r.위약금없음, (tag + '혜택 줄 + 위약금 없음').padEnd(30)
      + r.혜택 + ' / ' + r.위약금없음);
    say(r.link, (tag + '약관 링크 그대로').padEnd(30) + r.link);
    say(r.줄수 === 8, (tag + '환불 문답 8줄 (7→8)').padEnd(30) + r.줄수 + '줄');
    say(r.free === false, (tag + '「무료 체험」 0곳').padEnd(30) + (r.free ? '★ 남음' : '0곳'));
    say(p.__errs.length === 0, (tag + '오류 0건').padEnd(30) + (p.__errs.length ? p.__errs[0] : 'OK'));
    await p.close();
  }

  console.log('\n④ 범위 — 이번 보정이 바꾼 것만');
  {
    /* ★ 범위는 **v271 → v271 보정1 두 커밋 사이**로 고정한다.
       `diff <BASE>` 하나로 일하는 폴더와 재면, 뒤 회차(v272)가 쌓이는 순간
       「바뀐 파일」·「버전 271」이 깨진다 — 이 회차가 그 파일을 건드린 게 아니다.
       (v271 보정1 에서 실제로 겪었다: v272 를 뒤에 얹자 3건이 틀어졌다.) */
    const MINE = process.env.COS_SRC_NEW_REF || 'ffd3c0e';   /* v271 보정1 */
    const RANGE = BASE + ' ' + MINE;
    const show = (f) => cp.execSync('git -C ' + COS_ROOT + ' show ' + MINE + ':' + f,
      { maxBuffer: 1 << 28 }).toString();
    const names = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + RANGE)
      .toString().trim().split('\n').filter(Boolean).sort();
    say(names.join(',') === 'CLAUDE.md,home.html,index.html,terms.html',
      '바뀐 파일            ' + names.join(','));
    const keep = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + RANGE
      + ' -- firestore.rules api lib s.html privacy.html version.json').toString().trim();
    say(keep === '', '규칙·api·lib·s·privacy·version diff 0   ' + (keep || '(변경 없음)'));
    const vj = show('version.json');
    const av = /const APP_VERSION = (\d+);/.exec(show('index.html'))[1];
    say(JSON.parse(vj).version === 271 && av === '271',
      '버전 271 그대로        version.json ' + JSON.parse(vj).version + ' · APP_VERSION ' + av);
    /* 「무료 체험」 전수 — 여섯 파일. 이 회차 커밋에서 읽는다(뒤 회차와 섞이지 않게). */
    const left = ['terms.html', 'home.html', 'index.html', 'privacy.html', 's.html', 'CLAUDE.md']
      .map((f) => [f, (show(f).match(/무료\s*체험/g) || []).length])
      .filter((x) => x[1] > 0);
    say(left.length === 0, '「무료 체험」 여섯 파일 전부 0곳   '
      + (left.length ? JSON.stringify(left) : '0곳'));
  }

  await b.close();
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 — 서버로 나간 것 0');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
