/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드75 — 공유 주소를 **종류별 단어**로 + 문자 미리보기 제목 (v320)
   왜 — v319 까지 공유 링크 넷이 모두 `s.html#토큰` 이라, 문자·카톡 **미리보기 카드**에
   `s.html` 의 고정 제목 「거래내역 명세 — 코스로드」가 찍혔다(사장님 11-24 «알림장» 실측).
   미리보기를 만드는 쪽은 **JS 를 돌리지 않고** `#토큰` 은 **서버로 가지 않으므로**,
   그 쪽이 볼 수 있는 것은 **그 입구 파일의 정적인 글자뿐**이다.
   보는 것
     ① 입구 **넷**이 있고(`s.html`·`notice`·`invoice`·`payslip`) 몸통이 **글자까지 같다**
     ② 입구마다 **자기 제목·미리보기 칸**(og) · **JS 없이도** 제목이 있다
     ③ **보여 주는 코드는 한 벌** — `share/view.css`·`share/view.js` · 복사본 **0**
        · 그 글이 옛 `s.html` 과 **글자까지 같다**(대조 커밋으로)
     ④ 앱이 만드는 주소 **전수** — kind 넷 → 단어 셋 · 모르는 종류는 **옛 주소**로
     ⑤ 옛 링크(`s.html#토큰`)가 **그대로 열린다**(종류를 안 줘도 옛 주소)
     ⑥ 토큰은 언제나 **`#` 뒤**다(서버로 안 간다) · 주소에 사람 이름·자료가 **안 들어간다**
     ⑦ 문자 길이 — 주소가 **짧아졌다**(늘지 않았다)
     ⑧ 규칙·서버 **0줄** · 버전 320 · 공통 원칙(keep-all) 새 입구에도
   ★ 바깥 통신 0 · 진짜 발송 0 · 실서비스 읽기 0 */
const fs = require('fs');
const cp = require('child_process');
const { thisRef, srcAt } = require('./thisref.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 44)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const LF = (x) => x.replace(/\r\n/g, '\n');
const F = (p) => LF(fs.readFileSync(COS_ROOT + '/' + p, 'utf8'));
const APP = F('index.html');
const ENTRIES = ['s.html', 'notice.html', 'invoice.html', 'payslip.html'];

(async () => {

console.log('════ ① 입구 넷 · 몸통이 글자까지 같다');
{
  ENTRIES.forEach((f) => {
    ck('  ' + f.padEnd(13) + ' 있다', fs.existsSync(COS_ROOT + '/' + f), true);
  });
  /* 제목·미리보기 글자와 쪽지(주소 예시)만 빼고 나머지가 **글자까지 같아야** 한다 */
  const norm = (s) => LF(s)
    .replace(/<title>[^<]*<\/title>/, 'T')
    .replace(/og:title" content="[^"]*"/, 'OT')
    .replace(/og:description" content="[^"]*"/, 'OD')
    .replace(/name="description" content="[^"]*"/, 'D')
    .replace(/^ {4}주소:.*$/m, 'ADDR');
  const base = norm(F(ENTRIES[0]));
  ENTRIES.slice(1).forEach((f) => {
    ck('★ ' + f.padEnd(13) + ' 몸통이 같다', norm(F(f)) === base, true);
  });
  ck('★ 넷 다 `noindex` 다(공유 문서라 검색에 안 올린다)',
    ENTRIES.filter((f) => /name="robots" content="noindex,nofollow"/.test(F(f))).length, 4);
  ck('  넷 다 `no-referrer` 다(토큰이 리퍼러로 안 새게)',
    ENTRIES.filter((f) => /name="referrer" content="no-referrer"/.test(F(f))).length, 4);
}

console.log('\n════ ② 입구마다 자기 제목·미리보기 칸 (JS 없이도 보인다)');
{
  const WANT = {
    's.html':       '코스로드 공유 문서',
    'notice.html':  '알림장·공지 — 코스로드',
    'invoice.html': '거래명세 — 코스로드',
    'payslip.html': '급여명세서 — 코스로드'
  };
  Object.keys(WANT).forEach((f) => {
    const s = F(f);
    ck('★ ' + f.padEnd(13) + ' 제목', (s.match(/<title>([^<]*)<\/title>/) || [])[1], WANT[f]);
    ck('  ' + f.padEnd(13) + ' og:title 같다',
      (s.match(/og:title" content="([^"]*)"/) || [])[1], WANT[f]);
    ck('  ' + f.padEnd(13) + ' og:description 있다',
      /og:description" content="[^"]{10,}"/.test(s), true);
    ck('  ' + f.padEnd(13) + ' og:site_name 코스로드',
      (s.match(/og:site_name" content="([^"]*)"/) || [])[1], '코스로드');
  });
  /* ★★ **JS 를 한 줄도 돌리지 않고** 제목이 읽히는지 — 미리보기 쪽이 보는 그대로 */
  ENTRIES.forEach((f) => {
    const head = F(f).split('</head>')[0];
    ck('★★ ' + f.padEnd(13) + ' 제목이 `</head>` 앞 정적인 글자다',
      /<title>[^<]{3,}<\/title>/.test(head) && /og:title/.test(head), true);
    ck('  ' + f.padEnd(13) + ' 그 앞에 돌아가는 글 0(인라인 script 없음)',
      /<script(?![^>]*src=)/.test(head), false);
  });
  ck('★ 옛 제목 「거래내역 명세 — 코스로드」가 **0곳**',
    ENTRIES.filter((f) => /거래내역 명세 — 코스로드/.test(F(f))).length, 0);
  ck('  (대조) 고치기 전 `s.html` 에는 그 제목이 있었다',
    /거래내역 명세 — 코스로드/.test(LF(srcAt(thisRef(319), 's.html') || '')), true);
}

console.log('\n════ ③ 보여 주는 코드는 **한 벌** (복사본 0)');
{
  ck('★ `share/view.css` 있다', fs.existsSync(COS_ROOT + '/share/view.css'), true);
  ck('★ `share/view.js` 있다', fs.existsSync(COS_ROOT + '/share/view.js'), true);
  ck('★★ 입구 넷이 **그 두 파일**을 부른다',
    ENTRIES.filter((f) => /<link rel="stylesheet" href="share\/view\.css"\/>/.test(F(f))
      && /<script type="module" src="share\/view\.js"><\/script>/.test(F(f))).length, 4);
  /* 복사본 0 — 입구에는 꾸밈·그리는 글이 **없어야** 한다 */
  ck('★★ 입구에 `<style>` 0곳(복사본 금지)',
    ENTRIES.filter((f) => /<style>/.test(F(f))).length, 0);
  ck('★★ 입구에 인라인 `<script>` 0곳',
    ENTRIES.filter((f) => /<script(?![^>]*src=)/.test(F(f))).length, 0);
  ck('  입구에 Firebase `import` 0곳',
    ENTRIES.filter((f) => /firebasejs/.test(F(f))).length, 0);
  ck('  한 벌에만 Firebase 가 있다',
    /firebasejs/.test(F('share/view.js')) && /getFirestore/.test(F('share/view.js')), true);

  /* ★★ **그 글이 옛 `s.html` 과 글자까지 같다** — 옮기면서 바꾸지 않았다 */
  const old = LF(srcAt(thisRef(319), 's.html') || '').split('\n');
  const oldCss = old.slice(16, 80).join('\n');
  const oldJs = old.slice(88, 361).join('\n');
  const css = F('share/view.css').split('\n');
  const js = F('share/view.js').split('\n');
  const cssBody = css.slice(4).join('\n').replace(/\n+$/, '');
  const jsBody = js.slice(9).join('\n').replace(/\n+$/, '');
  ck('★★ CSS 가 옛 글과 **글자까지 같다**', cssBody === oldCss, true);
  ck('★★ 그리는 글도 **글자까지 같다**', jsBody === oldJs, true);
  ck('  (대조) 옛 `s.html` 은 364줄이었다', old.length >= 363 && old.length <= 365, true);
  /* ★ 줄 수는 **끝 줄바꿈까지** 세어진다 — `< 40` 으로 적었다가 딱 40에서 걸렸다(실측 39줄+1) */
  const rows = ENTRIES.map((f) => F(f).replace(/\n$/, '').split('\n').length);
  ck('  이제 입구는 짧다(옛 364줄 → 39줄 안쪽) · ' + rows.join('·'),
    rows.every((n) => n <= 40), true);
  ck('★ 한 벌은 **상대 주소**로 부른다(`/notice` 에서도 풀린다)',
    ENTRIES.filter((f) => /href="\/share|src="\/share/.test(F(f))).length, 0);
}

console.log('\n════ ④ 앱이 만드는 주소 — 전수 · kind 넷 → 단어 셋');
{
  /* 주소 만드는 자리는 **한 곳**이어야 한다 */
  ck('★ `shareUrlOf` 선언은 하나', (APP.match(/function shareUrlOf\(/g) || []).length, 1);
  ck('  `SHARE_ENTRY` 표도 하나', (APP.match(/var SHARE_ENTRY = \{/g) || []).length, 1);
  ck('★★ 부르는 자리 **다섯이 모두 종류를 준다**',
    (APP.match(/shareUrlOf\(token, '|shareUrlOf\(String\(n\.shareToken\), '/g) || []).length, 5);
  ck('★★ 종류를 안 주고 부르는 자리 **0**',
    /shareUrlOf\((?!token, '|String\(n\.shareToken\), '|token, kind\))/.test(APP), false);

  /* 실제로 돌려 본다 — 표와 함수를 꺼내 나란히 */
  const i0 = APP.indexOf('var SHARE_BASE =');
  const i1 = APP.indexOf('\n}', APP.indexOf('function shareUrlOf('));
  const mk = new Function(APP.slice(i0, i1 + 2) + '\nreturn shareUrlOf;')();
  const T = 'AbCd1234';
  const WANT = {
    notice:      'https://cosroad.com/notice#' + T,
    oneInvoice:  'https://cosroad.com/invoice#' + T,
    clientRange: 'https://cosroad.com/invoice#' + T,
    payslip:     'https://cosroad.com/payslip#' + T
  };
  Object.keys(WANT).forEach((k) => {
    ck('★ ' + k.padEnd(12) + ' → ' + WANT[k].replace('https://cosroad.com', ''), mk(T, k), WANT[k]);
  });
  /* ★ `shares` 문서에 적히는 kind 전수가 표에 **다 있어야** 한다 */
  const kinds = [...new Set((APP.match(/kind: '(notice|payslip|oneInvoice|clientRange)'/g) || [])
    .map((x) => x.replace(/kind: '|'/g, '')))].sort();
  ck('★★ `shares` 에 적히는 kind 넷', kinds.join(','), 'clientRange,notice,oneInvoice,payslip');
  ck('★★ 그 넷이 모두 표에 있다', kinds.filter((k) => !WANT[k]).length, 0);
}

console.log('\n════ ⑤ 옛 링크는 그대로 열린다');
{
  const i0 = APP.indexOf('var SHARE_BASE =');
  const i1 = APP.indexOf('\n}', APP.indexOf('function shareUrlOf('));
  const mk = new Function(APP.slice(i0, i1 + 2) + '\nreturn shareUrlOf;')();
  ck('★ 종류를 안 주면 **옛 주소**', mk('T1'), 'https://cosroad.com/s.html#T1');
  ck('★ 모르는 종류도 **옛 주소**로 떨어진다', mk('T1', 'newKind'), 'https://cosroad.com/s.html#T1');
  ck('  빈 종류도 같다', mk('T1', ''), 'https://cosroad.com/s.html#T1');
  ck('★★ `s.html` 이 그대로 있다(이미 보낸 문자·카톡)', fs.existsSync(COS_ROOT + '/s.html'), true);
  ck('★★ `s.html` 도 같은 한 벌을 부른다(화면이 같다)',
    /src="share\/view\.js"/.test(F('s.html')), true);
  ck('  `s.html` 제목은 **중립**이다', (F('s.html').match(/<title>([^<]*)<\/title>/) || [])[1],
    '코스로드 공유 문서');
}

console.log('\n════ ⑥ 토큰은 늘 `#` 뒤 · 주소에 사람 정보 0');
{
  ck('★★ 네 입구 주소가 모두 `#` 꼴', /\+ '#' \+ token/.test(APP), true);
  ck('★★ `?t=`·`?token=` 로 바꾼 곳 0', /[?&](t|token)=/.test(APP.slice(APP.indexOf('var SHARE_BASE ='), APP.indexOf('var SHARE_BASE =') + 2000)), false);
  ck('  표의 주소 넷에 물음표 0',
    /SHARE_ENTRY = \{[\s\S]*?\};/.exec(APP)[0].indexOf('?'), -1);
  /* 주소에 이름·날짜가 안 들어간다(v312 교훈) */
  ck('★ 주소를 만드는 글에 이름·날짜 칸 0',
    /shareUrlOf\([^)]*\b(name|member|date|ym)\b/.test(APP), false);
  ck('  한 벌은 토큰을 `location.hash` 에서 읽는다',
    /location\.hash/.test(F('share/view.js')), true);
}

console.log('\n════ ⑦ 문자 길이 — 주소가 짧아졌다');
{
  const T = 'x'.repeat(22);                        /* 실제 토큰은 base64url 22자 */
  const oldLen = ('https://cosroad.com/s.html#' + T).length;
  const lens = { notice: ('https://cosroad.com/notice#' + T).length,
                 invoice: ('https://cosroad.com/invoice#' + T).length,
                 payslip: ('https://cosroad.com/payslip#' + T).length };
  ck('  옛 주소 길이(s.html)', oldLen, 49);
  ck('★ notice  길이', lens.notice, 49);
  ck('★ invoice 길이', lens.invoice, 50);
  ck('★ payslip 길이', lens.payslip, 50);
  ck('★★ 늘어난 바이트 **최대 1자**(EUC-KR 로도 1바이트 · 글자는 모두 ASCII)',
    Math.max(0, Math.max(lens.notice, lens.invoice, lens.payslip) - oldLen), 1);
  ck('  주소에 ASCII 아닌 글자 0(EUC-KR 에서 안 깨진다)',
    /[^\x20-\x7E]/.test('https://cosroad.com/invoice#' + T), false);
}

console.log('\n════ ⑧ 규칙·서버 0줄 · 버전 · 공통 원칙');
{
  /* ★★ 「이 회차에 규칙·서버를 안 건드렸다」는 **그 회차를 두고 한 약속**이다 —
     작업트리로 재면 **뒷 회차가 `api/`·`lib/`·버전을 고칠 때마다 거짓으로 깨진다**
     (v321/76 이 귀가 알림톡을 켜면서 실제로 셋이 깨졌다 · CLAUDE.md 검사 묶음 규칙).
     → **그 회차 커밋 하나**가 무엇을 바꿨는지로 잰다: `<v320 커밋>^ → <v320 커밋>`.
     ★ `thisRef(319)` 를 앞 커밋으로 쓰면 안 된다 — 그 사이에 **74-B·74-C 커밋 넷**이
       「(v319 유지)」로 `api/`·`lib/` 를 고쳤다(제목이 「(v319)」로 끝나는 커밋은 73-B 하나다).
       그래서 **부모 커밋**(`^`)이 이 약속의 올바른 기준이다. */
  const NEW_REF = process.env.COS_SRC_NEW_REF || require('./thisref.js').thisRef(320);
  const OLD_REF = process.env.COS_SRC_OLD_REF || (NEW_REF + '^');
  const changed = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only '
    + OLD_REF + ' ' + NEW_REF, { maxBuffer: 1 << 24 })
    .toString().trim().split('\n').filter(Boolean);
  ck('★★ `firestore.rules` 안 바뀜', changed.indexOf('firestore.rules'), -1);
  ck('★★ `storage.rules` 안 바뀜', changed.indexOf('storage.rules'), -1);
  ck('★★ `api/` 안 바뀜', changed.filter((f) => f.indexOf('api/') === 0).length, 0);
  ck('★★ `lib/` 안 바뀜', changed.filter((f) => f.indexOf('lib/') === 0).length, 0);
  /* 버전도 **그 커밋의 글**로 본다(지금 작업트리는 더 올라가 있을 수 있다) */
  const APP75 = require('./thisref.js').srcAt(NEW_REF, 'index.html');
  const v = Number((APP75.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
  ck('★ 그 회차 버전 320', v, 320);
  ck('  그 커밋의 `version.json` 과 같다',
    String(JSON.parse(require('./thisref.js').srcAt(NEW_REF, 'version.json')).version), String(v));
  ck('  (지금은 더 올라갔을 수 있다 — 작업트리)',
    Number((APP.match(/const APP_VERSION = (\d+);/) || [])[1] || 0) >= v, true);
  /* 공통 원칙 — 한국어 줄바꿈 두 줄은 **한 벌**에 있고 넷이 상속받는다 */
  ck('★ keep-all·overflow-wrap 이 한 벌에 있다',
    /word-break:keep-all;overflow-wrap:anywhere;/.test(F('share/view.css')), true);
  /* ★ **쪽지는 빼고** 센다 — 그 글자가 「왜 안 쓰는지」 설명으로 들어 있다(그것까지 세면 거짓이다) */
  ck('  `break-word` 를 **쓰지** 않는다(한글을 낱글자로 쪼갠다)',
    /break-word/.test(F('share/view.css').replace(/\/\*[\s\S]*?\*\//g, '')), false);
  ck('  그 까닭은 쪽지에 적어 두었다', /break-word/.test(F('share/view.css')), true);
  /* 문답표 — 사람에게 보이는 변화라 한 줄 더했다 */
  const seg = APP.slice(APP.indexOf('var HELP_QA=['), APP.indexOf('\n];', APP.indexOf('var HELP_QA=[')));
  ck('★ 문답이 하나 늘었다(80 → 81)', (seg.match(/\{role:/g) || []).length, 81);
  ck('  새 문답에 세 주소가 적혀 있다',
    /cosroad\.com\/notice/.test(seg) && /cosroad\.com\/invoice/.test(seg)
      && /cosroad\.com\/payslip/.test(seg), true);
  ck('  옛 링크도 열린다고 적었다', /s\.html#…\)도 그대로 열려요|그대로 열려요/.test(seg), true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
console.log('※ 파일·소스만 읽는다 — 바깥 통신 0 · 진짜 발송 0 · 실서비스 읽기 0');
process.exit(fail ? 1 : 0);
})();
