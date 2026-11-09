/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드61-2 — **카톡 공유·보내기 표식은 카카오 노란색** (v302).
   ① 재현 — 지금 색 전수 표(어디가 노란색이고 어디가 아니었나)
   ② `:root` 변수 **둘만** 쓴다(`--kakao`·`--kakao-ink`) · 하드코딩 0
   ③ 카톡 단추·표식 전수가 그 변수를 쓴다
   ④ **문자(SMS)·알림톡 단추는 그대로** — 카톡만 노란색
   ⑤ 글자가 읽히나 — 대비(contrast ratio) 셈
   ⑥ 공식 값인가 — 카카오 공식 디자인 지침(컨테이너 `#FEE500` · 레이블 `#000000 85%`)
   ★ 바깥 통신 0. */
const cp = require('child_process');
const fs = require('fs');

const OLD_REF = process.env.COS_SRC_OLD_REF || '5b36ea1';   /* v301(61-1) — 고치기 전 */
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

/* 카톡으로 내보내는 단추·표식 — **글자로** 찾는다(이름이 바뀌어도 걸린다) */
const kakaoLines = (src) => src.split('\n')
  .map((ln, i) => [i + 1, ln])
  .filter(([, ln]) => /카톡/.test(ln) && /(<button|<span|background)/.test(ln));

/* 대비 셈 (WCAG) — 글자가 읽히나 */
function contrast(fg, bg) {
  const lum = (c) => {
    const v = c.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const L1 = lum(fg), L2 = lum(bg);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
/* 85% 검정을 #FEE500 위에 얹은 실제 색 */
const over = (a, bg, fg) => fg.map((f, i) => Math.round(f * a + bg[i] * (1 - a)));

(async () => {
  console.log('════ ① 재현 — 고치기 전 색 전수');
  {
    const old = kakaoLines(OLD_SRC);
    ck('[옛] 카톡 단추·표식 줄 수', old.length >= 6, true);
    const yellow = old.filter(([, ln]) => /#FEE500/.test(ln)).length;
    /* 「카톡」 글자와 색이 **같은 줄**에 있는 것만 센다 — 공유 시트처럼 글자가 다른 줄에
       있는 단추는 여기 안 잡힌다(그 줄들은 ③에서 변수로 바뀐 것을 확인한다). */
    ck('[옛] 그 가운데 노란색', yellow, 3);
    ck('[옛] ★ 노란색이 아닌 자리도 있었다', old.length - yellow >= 1, true);
    ck('[옛] 글자색이 공식 값이 아니었다(#3C1E1E)', /#3C1E1E/.test(OLD_SRC), true);
    ck('[옛] `--kakao` 변수가 없었다', /--kakao\b/.test(OLD_SRC), false);
  }

  console.log('\n② `:root` 변수 — 공식 값 하나씩');
  {
    const root = /:root\{([\s\S]*?)\}/.exec(NEW_SRC);
    const body = root ? root[1] : '';
    ck('`:root` 에 `--kakao`', /--kakao:\s*#FEE500/.test(body), true);
    ck('`:root` 에 `--kakao-ink`', /--kakao-ink:\s*rgba\(0,\s*0,\s*0,\s*\.85\)/.test(body), true);
    ck('★ 변수는 **둘뿐**', (body.match(/--kakao[a-z-]*:/g) || []).length, 2);
    /* CSS 변수 규칙(v255) — 없는 이름을 var() 로 쓰면 색이 조용히 빠진다 */
    const used = (NEW_SRC.match(/var\(--kakao[a-z-]*\)/g) || [])
      .map((x) => x.slice(4, -1));
    const known = new Set((body.match(/--kakao[a-z-]*(?=:)/g) || []));
    ck('★ 쓰는 이름이 모두 `:root` 에 있다',
      used.filter((u) => !known.has(u)).join(',') || '없음', '없음');
  }

  console.log('\n③ 카톡 단추·표식 전수가 변수를 쓴다');
  {
    const lines = kakaoLines(NEW_SRC);
    ck('카톡 단추·표식 줄 수', lines.length >= 6, true);
    const bad = lines.filter(([, ln]) => /#FEE500|#3C1E1E|#191919/.test(ln));
    ck('★ 하드코딩이 남은 줄', bad.length ? bad.map((x) => x[0]).join(',') : '0곳', '0곳');
    const withVar = lines.filter(([, ln]) => /var\(--kakao/.test(ln)).length;
    ck('★ 변수를 쓰는 줄', withVar >= 6, true);
    /* `#FEE500` 이 남아 있는 자리 전수 — 변수 선언 1 · 그 쪽지 1 ·
       **운행 화면 알림톡 「💬」 둘**(지시문 「문자/알림톡 단추는 그대로」라 안 건드렸다). */
    const hexLines = NEW_SRC.split('\n')
      .map((ln, i) => [i + 1, ln]).filter(([, ln]) => /#FEE500/.test(ln));
    ck('`#FEE500` 글자가 남은 줄 수', hexLines.length, 4);
    ck('  ① 변수 선언', /--kakao:#FEE500/.test(hexLines[1] ? hexLines[1][1] : ''), true);
    ck('  ② 그 위 쪽지(공식 문서 근거)', /카카오 공식 디자인 지침/.test(hexLines[0] ? hexLines[0][1] : ''), true);
    ck('★ ③④ 나머지 둘은 **알림톡 「💬」**(그대로 두기로 한 자리)',
      hexLines.slice(2).every(([, ln]) => /sendDeliveryDone|sendDropoffDone/.test(ln)), true);
    ck('  `#3C1E1E`(옛 글자색)는 사라졌다', /#3C1E1E/.test(NEW_SRC), false);
  }

  console.log('\n④ **문자(SMS)·알림톡 단추는 그대로**');
  {
    /* 카톡이 아닌 보내기 단추 — 색이 노랗게 물들지 않았나 */
    const smsLines = NEW_SRC.split('\n')
      .filter((ln) => /(문자 보내기|문자 발송|알림톡|미납 문자|📩)/.test(ln) && /<button/.test(ln));
    ck('문자·알림톡 단추 줄 수', smsLines.length >= 3, true);
    ck('★ 그 가운데 카카오 노란색을 쓴 줄',
      smsLines.filter((ln) => /var\(--kakao/.test(ln)).length, 0);
  }

  console.log('\n⑤ 글자가 읽히나 — 대비 셈');
  {
    const BG = [254, 229, 0];                      /* #FEE500 */
    const INK = over(0.85, BG, [0, 0, 0]);         /* 검정 85% 를 노란 바탕에 얹은 실제 색 */
    const r = contrast(INK, BG);
    ck('노란 바탕에 얹은 글자색(rgb)', INK.join(','), '38,34,0');
    ck('★ 대비 ≥ 4.5 (WCAG AA 본문)', r >= 4.5, true);
    ck('  대비 ≥ 7 (AAA)', r >= 7, true);
    console.log('      실제 대비 ' + r + ' : 1');
    /* 옛 글자색(#3C1E1E)과 견주기 — 둘 다 읽히지만 공식 값을 쓴다 */
    const oldInk = [0x3C, 0x1E, 0x1E];
    console.log('      (옛 #3C1E1E 대비 ' + contrast(oldInk, BG) + ' : 1)');
  }

  console.log('\n⑥ 공식 값 대조 (카카오 공식 디자인 지침)');
  {
    /* 공식 문서(developers.kakao.com 디자인 가이드) 표:
         컨테이너 #FEE500 · 심볼 #000000 · 레이블 #000000 85%
       ★ 지시문의 `#191919` 는 **옛 카카오싱크 가이드** 값이다 — 지금 공식 문서는
         레이블을 `#000000 85%` 로 적는다. 지시문이 「다르면 공식 값」이라 했으므로 공식 값을 썼다. */
    ck('컨테이너 = 공식 `#FEE500`', /--kakao:\s*#FEE500/.test(NEW_SRC), true);
    ck('레이블 = 공식 `#000000 85%`', /--kakao-ink:\s*rgba\(0,\s*0,\s*0,\s*\.85\)/.test(NEW_SRC), true);
    /* 쪽지에는 「#191919 는 옛 값」이라고 적어 두었으므로 **색 값으로 쓰였나**만 본다 */
    ck('★ 옛 값 `#191919` 를 **색으로** 쓰지 않았다',
      /(background|color)\s*:\s*#191919/.test(NEW_SRC), false);
    ck('  소스 쪽지에 공식 문서 근거를 적었다',
      /카카오 공식 디자인 지침[\s\S]{0,200}#000000 85%/.test(NEW_SRC), true);
    ck('  CLAUDE.md 화면 원칙에 한 줄 더했다',
      /카톡 공유·보내기 표식은 카카오 노란색\*\*/
        .test(fs.readFileSync(COS_ROOT + '/CLAUDE.md', 'utf8').replace(/\r\n/g, '\n')), true);
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    ck('  버전 302 이상', appV >= 302, true);
    ck('  `version.json` 과 같다',
      String(JSON.parse(fs.readFileSync(COS_ROOT + '/version.json', 'utf8')).version), String(appV));
    ck('★ `api/`·`lib/`·규칙은 **한 줄도** 안 바뀌었다',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' -- api lib firestore.rules',
        { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 소스와 색 셈만 봤습니다');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
