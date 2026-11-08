/* detect.js — 화면 문자열(HTML)에 **자료가 코드로 새어 들었는지** 재는 공용 한 벌.
   (코스로드41 에서 다시 만들었다 — 옛 파일은 git·저장소·작업 폴더·보고문 어디에도 없었다)

   쓰는 묶음 넷: b_app253 · b_app253b · d_mp253c · e_drv253d
   그 넷이 기대하는 모양(묶음 코드에서 거꾸로 뽑은 표):
     audit(html) → {
       injectedAttrs : [ {tag, attr, value} ]  — **주입된 이벤트 속성**(길이를 0 으로 본다)
       liveTags      : Number                  — **살아 있는 태그** 수(script·img·iframe…)
       alerted       : Number                  — 핸들러를 돌려 봤을 때 `alert` 가 불린 횟수
       ran           : Number                  — 실제로 돌아간 핸들러 수( > 0 을 본다)
       errors        : [String]                — 핸들러 문법·실행 오류(길이를 0 으로 본다)
       calls         : [ [함수이름, 인자…] ]    — 핸들러가 부른 것(인자 **원문**까지)
     }
   ★ 보고용으로 몇 가지를 더 담는다(묶음은 안 본다): tags · unknownTags · handlers

   ── 왜 이렇게 만들었나 ───────────────────────────────────────────────────
   우리 화면은 HTML 을 **문자열로** 만든다. 그래서 자료(업체명·uid·문의 글)가
   `"><img src=x onerror=alert(1)>` 처럼 들어오면 **속성을 끊고 새 태그를 열** 수 있다.
   그걸 세 가지로 잡는다:
     ① 태그 이름이 **살아 있는 것**인가 (script·img·iframe…)  → liveTags
     ② 이벤트 속성이 **우리가 안 쓰는 이름**인가 (onerror·onmouseover…) → injectedAttrs
     ③ 우리가 쓴 핸들러를 **실제로 돌려** 보고 alert 가 뜨나 · 인자가 원문대로 오나
   ★ ②의 「우리가 쓰는 이름」은 아래 OUR_HANDLERS 하나다 — 앱이 새 이벤트 속성을 쓰기
     시작하면 여기에 **같이** 더해야 한다(안 더하면 거짓 경보가 난다). */

/* 살아 있는 태그 — 들어오면 그 자리에서 무언가 **실행·불러오기**가 일어나는 것들 */
const LIVE_TAGS = ['script', 'img', 'iframe', 'object', 'embed', 'svg', 'math', 'link',
  'style', 'video', 'audio', 'source', 'track', 'base', 'meta', 'form', 'marquee',
  'frame', 'frameset', 'applet', 'portal'];

/* 우리 화면이 **실제로 쓰는** 이벤트 속성 (index.html 전수 검색으로 뽑았다) */
const OUR_HANDLERS = ['onclick', 'onchange', 'oninput', 'onkeydown', 'onkeyup', 'onkeypress',
  'onsubmit', 'onblur', 'onfocus', 'onload', 'onerror'];
/* ★ `onload`·`onerror` 는 **우리도 쓴다**(사진 미리보기 등). 그래서 「이름만」으로는 못 가른다 —
   그 둘은 **살아 있는 태그에 붙었을 때만** 주입으로 본다(아래 isInjected). */
const RISKY_ON_LIVE = ['onload', 'onerror'];

/* 우리 화면이 쓰는 태그 — 여기 없는 것이 나오면 `unknownTags` 로 적어 둔다(보고용) */
const KNOWN_TAGS = ['div', 'span', 'button', 'input', 'select', 'option', 'optgroup', 'label',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'p', 'b', 'strong',
  'i', 'em', 'small', 'br', 'hr', 'a', 'textarea', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'pre', 'code', 'canvas', 'nav', 'header', 'footer', 'section', 'article', 'main', 'aside',
  'figure', 'figcaption', 'blockquote', 'dl', 'dt', 'dd', 'caption', 'colgroup', 'col',
  'fieldset', 'legend', 'summary', 'details', 'u', 's', 'sub', 'sup', 'mark', 'time', 'wbr'];

/* HTML 엔티티 풀기 — 핸들러 글자를 **브라우저가 보는 그대로** 만든다 */
function unescapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, d) => String.fromCharCode(parseInt(d, 16)))
    .replace(/&amp;/g, '&');     /* &amp; 는 **맨 나중** (안 그러면 두 번 풀린다) */
}

/* ── 태그·속성 뜯기 ───────────────────────────────────────────────────────
   따옴표 안의 `>` 를 끝으로 보지 않게 **상태를 들고** 훑는다
   (정규식 한 방으로 하면 `title="a>b"` 에서 끊긴다 — 그래서 손으로 훑는다). */
function parseTags(html) {
  const s = String(html || '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) break;
    const next = s.charAt(lt + 1);
    if (!/[a-zA-Z/!]/.test(next)) { i = lt + 1; continue; }   /* `a < b` 같은 글자는 태그가 아니다 */
    if (next === '!') {                                        /* 주석·doctype */
      const end = s.indexOf('>', lt);
      i = end < 0 ? s.length : end + 1;
      continue;
    }
    /* 태그 안쪽을 따옴표를 지켜 가며 읽는다 */
    let j = lt + 1, q = '';
    while (j < s.length) {
      const c = s.charAt(j);
      if (q) { if (c === q) q = ''; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '>') break;
      j++;
    }
    const inner = s.slice(lt + 1, j);
    i = j + 1;
    const closing = inner.charAt(0) === '/';
    const body = closing ? inner.slice(1) : inner;
    const m = body.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
    if (!m) continue;
    const tag = m[1].toLowerCase();
    const attrs = [];
    if (!closing) {
      const rest = body.slice(m[1].length);
      const re = /([a-zA-Z_:@][a-zA-Z0-9_:.\-]*)\s*(=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
      let am;
      while ((am = re.exec(rest))) {
        const name = am[1].toLowerCase();
        const val = am[4] !== undefined ? am[4]
                  : am[5] !== undefined ? am[5]
                  : am[6] !== undefined ? am[6] : '';
        attrs.push({ name: name, value: val, quoted: am[3] ? am[3].charAt(0) : '' });
      }
    }
    out.push({ tag: tag, closing: closing, attrs: attrs, raw: inner });
  }
  return out;
}

/* 이 속성이 **주입된 것**인가 */
function isInjected(tag, attrName) {
  if (!/^on/.test(attrName)) return false;
  if (OUR_HANDLERS.indexOf(attrName) < 0) return true;              /* 우리가 안 쓰는 이벤트 */
  if (RISKY_ON_LIVE.indexOf(attrName) >= 0 && LIVE_TAGS.indexOf(tag) >= 0) return true;
  return false;                                                      /* 우리가 쓰는 것 */
}

/* 핸들러 글자를 **돌려 본다** — 무엇을 부르는지·alert 가 뜨는지·문법이 맞는지
   ★★ 가짜 전역은 **점 접근과 이어 쓰기**를 받아야 한다.
     처음에 「이름 하나 = 함수 하나」로 만들었다가, 우리 코드의
     `var b=document.getElementById("…");if(b)b.remove();` 에서
     「document.getElementById is not a function」이 나 **거짓 오류 1건**이 떴다
     (실제 앱은 멀쩡한데 검사가 틀린 것 — 코스로드41 에서 잡아 고쳤다).
     그래서 어떤 이름·어떤 점 접근에도 **또 다른 가짜 함수**를 돌려준다. */
function runHandler(code, state) {
  const calls = [];
  let alerted = 0;
  const mk = (path) => {
    const f = function () {
      const args = Array.prototype.slice.call(arguments);
      const last = String(path).split('.').pop();
      if (last === 'alert' || last === 'confirm' || last === 'prompt') alerted++;
      calls.push([path].concat(args));
      return mk(path + '()');
    };
    return new Proxy(f, {
      get: (t, k) => {
        if (k === Symbol.toPrimitive) return () => '[' + path + ']';
        if (k === 'toString') return () => '[' + path + ']';
        if (k === Symbol.iterator || k === 'then' || k === Symbol.unscopables) return undefined;
        if (typeof k !== 'string') return undefined;
        return mk(path + '.' + k);
      },
      set: () => true,                 /* el.style.display='none' 같은 쓰기도 받아 준다 */
      has: () => true
    });
  };
  const ctx = new Proxy({}, {
    has: () => true,
    get: (t, k) => {
      if (k === Symbol.unscopables) return undefined;
      if (typeof k !== 'string') return undefined;
      return mk(k);
    }
  });
  try {
    /* eslint-disable no-new-func */
    const fn = new Function('__ctx', 'with(__ctx){ ' + code + '\n }');
    fn(ctx);
  } catch (e) {
    state.errors.push(String((e && e.message) || e) + '  ← ' + code.slice(0, 60));
    return { ok: false, calls: calls, alerted: alerted };
  }
  return { ok: true, calls: calls, alerted: alerted };
}

function audit(html) {
  const state = { errors: [] };
  const nodes = parseTags(html);
  let liveTags = 0, ran = 0, alerted = 0, handlers = 0;
  const injectedAttrs = [];
  const calls = [];
  const tags = {};
  nodes.forEach((n) => {
    if (!n.closing) tags[n.tag] = (tags[n.tag] || 0) + 1;
    if (!n.closing && LIVE_TAGS.indexOf(n.tag) >= 0) liveTags++;
    n.attrs.forEach((a) => {
      if (isInjected(n.tag, a.name)) {
        injectedAttrs.push({ tag: n.tag, attr: a.name, value: a.value });
        return;                                   /* 주입된 것은 돌려 보지 않는다(그 자체가 결함) */
      }
      if (!/^on/.test(a.name)) return;
      handlers++;
      const r = runHandler(unescapeHtml(a.value), state);
      if (r.ok) ran++;
      alerted += r.alerted;
      r.calls.forEach((c) => calls.push(c));
    });
  });
  const unknownTags = Object.keys(tags).filter((t) =>
    KNOWN_TAGS.indexOf(t) < 0 && LIVE_TAGS.indexOf(t) < 0);
  return {
    injectedAttrs: injectedAttrs,
    liveTags: liveTags,
    alerted: alerted,
    ran: ran,
    errors: state.errors,
    calls: calls,
    /* 보고용 */
    tags: tags,
    unknownTags: unknownTags,
    handlers: handlers
  };
}

module.exports = { audit, parseTags, unescapeHtml, LIVE_TAGS, OUR_HANDLERS, KNOWN_TAGS };
