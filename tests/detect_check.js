/* 코스로드41 — **대조 시험이 먼저**: 새로 만든 `detect.js` 가 안 막은 HTML 을 정말 잡나.
   지시문: 「잡지 못하는 꼴이 하나라도 있으면 그 도구는 쓰지 않는다(보고)」
   그래서 ① 안 막은 꼴 여덟 가지를 **잡는지** ② 제대로 막은 꼴을 **거짓 경보 없이** 넘기는지
   둘 다 본다. 바깥 통신 0 · 앱 코드 0. */
const D = require('./detect.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 40)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/* 앱의 `jsArg()` 와 **같은 방법** — JSON.stringify 로 JS 글자를 만들고 그것을 HTML escape 한다.
   ★ 처음에 `esc()` 만 써서 `onclick="deleteInquiry(&quot;…&quot;)"` 를 만들었다가 ②가 깨졌다:
     자료 안의 따옴표까지 `&quot;` 가 되어 **핸들러 문법이 망가진다**.
     앱은 그 자리에서 `jsArg()` 를 쓰므로, 검사도 같은 것을 써야 실제와 같은 글자를 본다. */
const jsArg = (v) => esc(JSON.stringify(String(v == null ? '' : v)));
const NASTY = '"><img src=x onerror=alert(1)>';

console.log('════ ① 안 막은 HTML 을 **잡아내나** (대조 시험)');
{
  /* 1. 이스케이프 빠진 이름 — 자료가 그대로 태그를 연다 */
  const a1 = D.audit('<div>이름: ' + NASTY + '</div>');
  ck('1. 이스케이프 빠진 이름 → 살아있는 태그', a1.liveTags >= 1, true);
  ck('   주입된 속성(onerror)도 잡는다',
     a1.injectedAttrs.some((x) => x.attr === 'onerror' && x.tag === 'img'), true);

  /* 2. <img onerror> 단독 */
  const a2 = D.audit('<span><img src=x onerror=alert(1)></span>');
  ck('2. <img onerror> → 살아있는 태그 1', a2.liveTags, 1);
  ck('   주입된 속성 1', a2.injectedAttrs.length, 1);

  /* 3. <script> */
  const a3 = D.audit('<div><script>alert(1)</script></div>');
  ck('3. <script> → 살아있는 태그 1', a3.liveTags, 1);

  /* 4. 속성 끊기 — `" onmouseover=` */
  const a4 = D.audit('<div title="' + '" onmouseover=alert(1) x="' + '">글</div>');
  ck('4. 속성 끊기(onmouseover) → 주입된 속성 1', a4.injectedAttrs.length, 1);
  ck('   그 속성 이름', (a4.injectedAttrs[0] || {}).attr, 'onmouseover');

  /* 5. onclick 안에서 따옴표를 끊고 alert 를 넣는 꼴 (우리가 쓰는 속성이라 **돌려 본다**) */
  const a5 = D.audit('<button onclick="deleteInquiry(\'' + "a');alert(1);//" + '\')">x</button>');
  ck('5. onclick 안 alert → alert 1', a5.alerted, 1);
  ck('   그래도 핸들러는 돌았다', a5.ran >= 1, true);

  /* 6. 문법이 깨진 핸들러 (따옴표 하나가 남는 꼴) */
  const a6 = D.audit('<button onclick="deleteInquiry(\'a\'">x</button>');
  ck('6. 문법 깨진 핸들러 → errors 1', a6.errors.length, 1);

  /* 7. iframe·svg 같은 다른 살아있는 태그 */
  const a7 = D.audit('<div><iframe src=javascript:alert(1)></iframe><svg onload=alert(1)></svg></div>');
  ck('7. iframe·svg → 살아있는 태그 2', a7.liveTags, 2);
  ck('   svg onload 도 주입으로 본다', a7.injectedAttrs.some((x) => x.attr === 'onload'), true);

  /* 8. 따옴표 안의 `>` 때문에 태그가 끊기지 않는지 (파서가 제대로인가) */
  const a8 = D.audit('<div title="a>b"><img src=x onerror=alert(1)></div>');
  ck('8. 속성값 안의 `>` 를 끝으로 보지 않는다', a8.liveTags, 1);
  ck('   주입 1건', a8.injectedAttrs.length, 1);
}

console.log('\n② 제대로 막은 HTML 은 **거짓 경보가 없다**');
{
  /* 우리 코드가 쓰는 꼴 그대로 — 자료를 escape 하고 인자는 &quot; 로 감싼다 */
  const h = '<div class="row" title="' + esc(NASTY) + '">'
          + '<span>' + esc(NASTY) + '</span>'
          + '<button onclick="deleteInquiry(' + jsArg(NASTY) + ')">🗑</button>'
          + '<button onclick="setInquiryStatus(&quot;q1&quot;,&quot;done&quot;)">완료</button>'
          + '<input type="text" value="' + esc(NASTY) + '" oninput="fmtAmountInput(this)"/>'
          + '</div>';
  const a = D.audit(h);
  ck('주입된 속성 0', a.injectedAttrs.length, 0);
  ck('살아있는 태그 0', a.liveTags, 0);
  ck('alert 0', a.alerted, 0);
  ck('문법 오류 0', a.errors.length, 0);
  ck('핸들러가 돌았다(3개)', a.ran, 3);
  const call = a.calls.find((c) => c[0] === 'deleteInquiry');
  ck('deleteInquiry 가 **원본 글자**를 받는다', call && call[1], NASTY);
  const st = a.calls.find((c) => c[0] === 'setInquiryStatus');
  ck('setInquiryStatus 인자 둘', st && st.slice(1).join('|'), 'q1|done');
  ck('모르는 태그 0', a.unknownTags.join(','), '');
}

console.log('\n③ 파서·엔티티 단위 확인');
{
  ck('엔티티 풀기 — &quot;', D.unescapeHtml('a&quot;b'), 'a"b');
  ck('엔티티 풀기 — &amp;lt; 는 한 번만', D.unescapeHtml('&amp;lt;'), '&lt;');
  ck('닫는 태그는 안 센다', D.audit('<img src=x><\/img>').liveTags, 1);
  ck('주석은 건너뛴다', D.audit('<!-- <script>alert(1)</script> -->').liveTags, 0);
  ck('글자 `a < b` 는 태그가 아니다', D.audit('<div>a < b</div>').liveTags, 0);
  ck('빈 입력도 안 터진다', D.audit('').liveTags + D.audit(null).liveTags, 0);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건 — **이 도구는 쓰지 않는다**'
  : '✔ ' + pass + '/' + pass + ' 전부 통과 — 여덟 가지 공격 꼴을 모두 잡는다'));
process.exit(fail ? 1 : 0);
