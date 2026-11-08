/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v271 — 환불 규정 문구가 실제로 보이나, 세 크기(390·360·1366)에서.
   ★ 바깥 요청은 전부 막는다(file:// 만) — 서버로 나가는 길이 아예 없다. */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const cp = require('child_process');
/* ★ v271 보정1: 이 뮶은 **v271 회차 기록**이다 — 읽는 쪽을 그 회차
   커밋(5480189)에 고정한다. 지금까지는 **일하는 폴더**를 읽었고,
   v271 보정1 이 제11조에 7항(혁택)을 넣어 1~9항이 1~10항이 되자
   「1~9 이어짐」이 깨졌다 — v271 이 틀린 것이 아니다.
   **지금** 약관은 run271b.js 가 본다(1~10항). */
const NEW_REF2 = process.env.COS_SRC_NEW_REF || '5480189';   /* v271 */
const _pinDir = require('path').join(__dirname, 'pin271');
require('fs').mkdirSync(_pinDir, { recursive: true });
['terms.html', 'home.html'].forEach(function (f) {
  require('fs').writeFileSync(require('path').join(_pinDir, f), require('child_process').execSync(
    'git -C ' + COS_ROOT + ' show ' + NEW_REF2 + ':' + f, { maxBuffer: 1 << 28 }));
});
const DIR = _pinDir.split(String.fromCharCode(92)).join('/') + '/';
const OLD_REF = process.env.COS_SRC_OLD_REF || '9296953';
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

  console.log('① terms.html#refund — 제11조가 보이고 가로 넘침 0');
  for (const [w, h] of SIZES) {
    const p = await page(b, w, h, DIR + 'terms.html', '#refund');
    const r = await p.evaluate(() => {
      const el = document.getElementById('refund');
      const body = el.nextElementSibling;
      const rect = el.getBoundingClientRect();
      const lines = (body.innerHTML.match(/<br>/g) || []).length + 1;
      const nums = (body.textContent.match(/(^|\n)?\s*(\d+)\./g) || [])
        .map((x) => Number(x.replace(/\D/g, '')));
      const cs = getComputedStyle(document.body);
      return {
        vw: window.innerWidth, scrollW: document.documentElement.scrollWidth,
        anchorTop: Math.round(rect.top), title: el.textContent.trim(),
        lines: lines, nums: nums,
        wordBreak: cs.wordBreak, overflowWrap: cs.overflowWrap,
        right: Math.round(body.getBoundingClientRect().right),
        has7: /7일 이내에 환불을 요청하면/.test(body.textContent),
        hasNoNum: !/50,000|180,000|310,000|480,000/.test(body.textContent),
        hasPromo: /첫 결제 할인\(6개월·1년\)은 사업자등록번호당 1회/.test(body.textContent),
        hasTrial: /30일 체험이 먼저 제공되며/.test(body.textContent),
        hasVat: /부가가치세는 같은 비율/.test(body.textContent),
        notice: (document.querySelector('.meta') || {}).textContent || ''
      };
    });
    say(r.scrollW <= r.vw, ('[' + w + 'x' + h + '] 가로 넘침 0').padEnd(28)
      + 'scrollWidth ' + r.scrollW + ' ≤ ' + r.vw);
    say(r.right <= r.vw, ('[' + w + 'x' + h + '] 본문이 화면 안').padEnd(28) + '오른쪽 끝 ' + r.right);
    say(r.lines === 9 && JSON.stringify(r.nums) === JSON.stringify([1,2,3,4,5,6,7,8,9]),
      ('[' + w + 'x' + h + '] 1~9 이어짐').padEnd(28) + r.lines + '항 · ' + r.nums.join(','));
    say(r.wordBreak === 'keep-all', ('[' + w + 'x' + h + '] keep-all').padEnd(28)
      + r.wordBreak + ' / ' + r.overflowWrap);
    say(r.has7 && r.hasPromo && r.hasTrial && r.hasVat,
      ('[' + w + 'x' + h + '] 새 문장 네 개').padEnd(28)
      + '7일 ' + r.has7 + ' · 할인 ' + r.hasPromo + ' · 체험 ' + r.hasTrial + ' · 부가세 ' + r.hasVat);
    say(r.hasNoNum, ('[' + w + 'x' + h + '] 금액 숫자 0개').padEnd(28) + r.hasNoNum);
    say(/2026년 11월 4일/.test(r.notice) && /최초 시행 2026년 8월 1일/.test(r.notice),
      ('[' + w + 'x' + h + '] 공고일·시행일').padEnd(28)
      + r.notice.replace(/\s+/g, ' ').trim().slice(0, 62));
    say(r.anchorTop >= -2 && r.anchorTop < h, ('[' + w + 'x' + h + '] #refund 닻이 보인다').padEnd(28)
      + 'top ' + r.anchorTop);
    say(p.__errs.length === 0, ('[' + w + 'x' + h + '] 오류 0건').padEnd(28)
      + (p.__errs.length ? p.__errs[0] : 'OK'));
    await p.close();
  }

  console.log('\n② home.html — 요금 띠 · 도우미 문답');
  for (const [w, h] of SIZES) {
    const p = await page(b, w, h, DIR + 'home.html');
    const r = await p.evaluate(() => {
      const band = Array.from(document.querySelectorAll('.price-free'))
        .find((e) => /30일 체험이 먼저 시작/.test(e.textContent));
      const br = band ? band.getBoundingClientRect() : null;
      /* 도우미 문답을 글자로 찾는다 (챗을 열지 않고 배열을 본다) */
      const ask = (q) => {
        const n = (s) => String(s || '').toLowerCase().replace(/\s/g, '');
        const k = n(q);
        return (window.HELP_QA || []).filter((x) => (x.keys || []).some((y) => k.indexOf(n(y)) >= 0))
          .map((x) => x.t);
      };
      const refund = (window.HELP_QA || []).find((x) => x.t === '환불·해지');
      const trial = (window.HELP_QA || []).find((x) => x.t === '30일 체험');
      return {
        vw: window.innerWidth, scrollW: document.documentElement.scrollWidth,
        bandText: band ? band.textContent.trim() : '(못 찾음)',
        bandLeft: br ? Math.round(br.left) : -1, bandRight: br ? Math.round(br.right) : -1,
        qaCount: (window.HELP_QA || []).length,
        askRefund: ask('환불'), ask7: ask('7일'), askTrial: ask('체험'), askCancel: ask('해지'),
        refundKeys: refund ? refund.keys : null,
        refundHas7: refund ? /7일 안에 요청하시면/.test(refund.a) : false,
        refundHasPromo: refund ? /환불을 받으셔도 할인은 쓴 것으로 봐요/.test(refund.a) : false,
        refundHasLink: refund ? /terms\.html#refund/.test(refund.a) : false,
        refundOld: refund ? /이용을 시작하지 않았다면|체험 중 해지/.test(refund.a) : true,
        trialLast: trial ? trial.a.split('\n').pop() : '(없음)'
      };
    });
    say(r.scrollW <= r.vw, ('[' + w + 'x' + h + '] 가로 넘침 0').padEnd(28)
      + r.scrollW + ' ≤ ' + r.vw);
    say(/결제 후 7일 안에는 전액 환불/.test(r.bandText),
      ('[' + w + 'x' + h + '] 요금 띠').padEnd(28) + r.bandText.slice(0, 54));
    say(r.bandLeft >= 0 && r.bandRight <= r.vw, ('[' + w + 'x' + h + '] 띠가 화면 안').padEnd(28)
      + '왼 ' + r.bandLeft + ' ~ 오른 ' + r.bandRight);
    say(r.askRefund.includes('환불·해지') && r.ask7.includes('환불·해지')
        && r.askCancel.includes('환불·해지'),
      ('[' + w + 'x' + h + '] 「환불」·「7일」·「해지」').padEnd(28)
      + JSON.stringify(r.askRefund) + ' / ' + JSON.stringify(r.ask7));
    say(r.askTrial.includes('30일 체험'), ('[' + w + 'x' + h + '] 「체험」').padEnd(28)
      + JSON.stringify(r.askTrial));
    say(r.refundHas7 && r.refundHasPromo && r.refundHasLink && !r.refundOld,
      ('[' + w + 'x' + h + '] 환불 문답 알맹이').padEnd(28)
      + '7일 ' + r.refundHas7 + ' · 할인 ' + r.refundHasPromo + ' · 약관 링크 '
      + r.refundHasLink + ' · 옛 문구 남음 ' + r.refundOld);
    say(/7일 안에 요청하시면 전액 환불/.test(r.trialLast),
      ('[' + w + 'x' + h + '] 체험 문답 마지막 줄').padEnd(28) + r.trialLast.slice(0, 50));
    say(p.__errs.length === 0, ('[' + w + 'x' + h + '] 오류 0건').padEnd(28)
      + (p.__errs.length ? p.__errs[0] : 'OK'));
    await p.close();
  }

  console.log('\n③ 범위 — 바꾼 파일과 안 바꾼 것');
  {
    /* ★ v272: 범위는 **v270→v271 두 커밋 사이**로 고정한다.
       전에는 `diff <v270>` 하나뿐이라 **일하는 폴더까지** 견주었다. 그래서 v272 가
       CLAUDE.md·firestore.rules·index.html 을 고치자 v271 의 범위 주장 세 개가 깨졌다 —
       v271 이 그 파일들을 건드린 것이 아니다. 이 회차의 참말은 이제 영원히 참말이다. */
    const NEW_REF = process.env.COS_SRC_NEW_REF || '5480189';   /* v271 */
    const RANGE = OLD_REF + ' ' + NEW_REF;
    const names = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + RANGE)
      .toString().trim().split('\n').filter(Boolean).sort();
    say(names.join(',') === 'home.html,index.html,terms.html,version.json',
      '바뀐 파일            ' + names.join(','));
    const keep = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + RANGE
      + ' -- firestore.rules api lib s.html privacy.html CLAUDE.md').toString().trim();
    say(keep === '', '규칙·api·lib·s.html·privacy·CLAUDE.md diff 0   ' + (keep || '(변경 없음)'));
    const idx = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + RANGE + ' -- index.html')
      .toString().trim();
    say(idx.startsWith('1\t1\t'), 'index.html 은 버전 한 줄만        ' + idx);
    /* 글자 검사는 **그 회차 커밋의** index.html 에서 본다 (지금 것이 아니라) */
    const src = cp.execSync('git -C ' + COS_ROOT + ' show ' + NEW_REF + ':index.html',
      { maxBuffer: 1 << 28 }).toString();
    say(!/환불/.test(src), 'index.html 에 「환불」 글자 0개      ' + ((src.match(/환불/g) || []).length) + '개');
  }

  await b.close();
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 — 서버로 나간 것 0');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
