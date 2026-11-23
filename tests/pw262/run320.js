/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v320(코스로드75) 실제 크롬 — 공유 입구 넷이 **같은 화면**을 그리고, 주소가 종류별로 갈린다.
   ⓐ **확장자 없는 주소**(`/notice`·`/invoice`·`/payslip`)로 열린다 · **되돌려보내기 없음** ·
     `#토큰` 이 **그대로 살아 있다** · 토큰이 **서버 요청에 안 실린다**
   ⓑ 입구 넷이 **같은 화면**을 그린다(네 크기 · 그려진 글자 비교) — 한 벌을 쓰므로
   ⓒ 입구마다 **자기 제목**(`document.title` 은 열린 뒤 바뀌지만, **미리보기가 보는 정적 제목**은 다르다)
   ⓓ 옛 `s.html#토큰` 이 **그대로 열린다**
   ⓔ 토큰이 없으면 안내 · 없는 토큰이면 만료 안내(종전 그대로)
   ★ **로컬 http 서버**로 띄운다 — `type="module"` 외부 스크립트는 `file://` 에서 막힌다.
     GitHub Pages 의 「확장자 없는 주소」 규칙은 그 서버에도 같게 넣고(`/foo` → `foo.html`),
     **실제 동작은 배포본으로 따로 실측**했다(`tests/share75.js` 쪽지 · 보고문 표).
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 읽기·쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];
const TYPE = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
               '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };

/* ── 저장소를 http 로 내준다 · GitHub Pages 처럼 `/foo` → `foo.html` ─────────── */
function serve() {
  const hits = [];
  const srv = http.createServer((req, res) => {
    const u = String(req.url || '/');
    hits.push(u);                                  /* ★ 토큰이 실려 오는지 보려고 전부 적어 둔다 */
    let p = u.split('?')[0];
    if (p === '/') p = '/index.html';
    let f = path.join(COS_ROOT, p);
    if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f = f + '.html';   /* Pages 규칙 */
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPE[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, hits, port: srv.address().port })));
}

/* 가짜 Firestore — 입구가 부르는 Firebase 모듈을 **그물로 가로채** 스냅샷을 돌려준다 */
/* ★★ 가짜 스냅샷은 **그리는 글이 실제로 읽는 칸 이름**으로 적는다 —
   처음에 `title`·`body` 로 적었더니 화면에 글자가 안 나왔다(묶음이 잡았다).
   `share/view.js` 의 `renderNotice`(content·date·images·org.label) ·
   `render`(거래) · `renderPayslip`(급여)이 읽는 칸을 보고 맞췄다. */
const SNAP = {
  notice: { kind: 'notice', org: { name: '가온학원', icon: '🚐', label: '알림장' },
            date: '2026-11-24', content: '이번 주 준비물은 체육복입니다.', images: [] },
  invoice: { kind: 'oneInvoice', org: { name: '가온학원' }, client: { name: '한빛상사' },
             date: '2026-11-20', rows: [{ date: '2026-11-20', kind: '매출',
               items: [{ label: '우유', qty: 10, price: 1000, amount: 10000 }] }],
             totals: { amount: 10000 }, net: { total: 10000 } },
  payslip: { kind: 'payslip', org: { name: '가온학원' }, w: { name: '박기사' },
             ym: '2026-11', payDate: '2026-11-25', net: 2500000, dedTotal: 0,
             pay: [{ label: '기본급', amount: 2400000 }], ded: [] }
};
function seed(kind) {
  const d = JSON.stringify(SNAP[kind] || SNAP.notice);
  return '(function(){\n'
    + '  window.__snap = ' + d + ';\n'
    + '  window.__fsCalls = [];\n'
    + '  var real = window.fetch;\n'
    /* Firebase SDK 를 못 받게 하고, 입구가 쓰는 세 함수를 우리가 끼워 넣는다 */
    + '  window.__noFirebase = true;\n'
    + '})();';
}

async function openEntry(b, port, pathname, token, size, kind) {
  const [w, h] = size || [390, 844];
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
  /* ★★ **막는 그물을 먼저** 건다 — Playwright 는 **나중에 건 그물이 이긴다**.
     거꾸로 걸면 `**` 가 Firebase 요청까지 끊어 화면이 「불러오는 중…」에서 멈춘다(실측). */
  await p.route('**', (r) => {
    const u = r.request().url();
    if (u.indexOf('http://127.0.0.1:') === 0) return r.continue();
    return r.abort();
  });
  /* ★★ Firebase SDK 요청을 **우리 가짜 모듈**로 바꿔치기한다(바깥 통신 0) */
  await p.route('**/firebasejs/**/firebase-app.js', (r) => r.fulfill({
    status: 200, contentType: 'text/javascript',
    body: 'export function initializeApp(c){ return { name:"fake" }; }' }));
  await p.route('**/firebasejs/**/firebase-firestore.js', (r) => r.fulfill({
    status: 200, contentType: 'text/javascript',
    body: 'export function getFirestore(){ return {}; }\n'
        + 'export function doc(db, col, id){ return { col: col, id: id }; }\n'
        + 'export async function getDoc(ref){\n'
        + '  window.__fsCalls = (window.__fsCalls||[]).concat([ref.col + "/" + ref.id]);\n'
        + '  var s = window.__snap;\n'
        + '  if(!s || ref.id !== window.__wantId) return { exists:()=>false, data:()=>null };\n'
        + '  return { exists:()=>true, data:()=>s };\n'
        + '}' }));
  await p.addInitScript('window.__snap = ' + JSON.stringify(SNAP[kind] || SNAP.notice) + ';'
    + 'window.__wantId = ' + JSON.stringify(kind === '__missing' ? '__none__' : (token || '')) + ';');
  const url = 'http://127.0.0.1:' + port + pathname + (token ? '#' + token : '');
  const resp = await p.goto(url, { waitUntil: 'load' });
  p.__errs = errs;
  p.__resp = resp;
  return p;
}
const textOf = (p) => p.evaluate(() => String(document.getElementById('root').innerText || '')
  .replace(/\s+/g, ' ').trim());

(async () => {
  const { srv, hits, port } = await serve();
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('ⓐ 확장자 없는 주소로 열린다 · `#토큰` 이 살아 있다 · 토큰이 서버로 안 간다');
  {
    const TOK = 'Tok123456789012345678ab';
    for (const w of ['notice', 'invoice', 'payslip']) {
      hits.length = 0;
      const p = await openEntry(b, port, '/' + w, TOK, [390, 844], w === 'payslip' ? 'payslip' : (w === 'invoice' ? 'invoice' : 'notice'));
      const st = p.__resp ? p.__resp.status() : 0;
      const href = await p.evaluate(() => location.href);
      const hash = await p.evaluate(() => location.hash);
      say(st === 200, ('/' + w + ' → 200').padEnd(44) + st);
      say(hash === '#' + TOK, ('/' + w + ' 의 `#토큰` 이 그대로').padEnd(44) + hash.slice(0, 12) + '…');
      say(href.indexOf('/' + w + '#') > 0, ('/' + w + ' 주소가 안 바뀌었다(되돌려보내기 0)').padEnd(44) + '✓');
      /* ★★ 토큰이 **서버 요청에 안 실렸다** */
      const leaked = hits.filter((u) => u.indexOf(TOK) >= 0).length;
      say(leaked === 0, ('/' + w + ' 토큰이 서버 요청에 0번').padEnd(44) + leaked + '번');
      say(p.__errs.length === 0, ('/' + w + ' 오류 0').padEnd(44) + (p.__errs[0] || 'OK'));
      await p.close();
    }
    /* (대조) 없는 이름은 404 */
    const p404 = await openEntry(b, port, '/nosuchpage', '', [390, 844], 'notice');
    say(p404.__resp.status() === 404, '(대조) 없는 이름은 404'.padEnd(44) + p404.__resp.status());
    await p404.close();
  }

  console.log('\nⓑ 입구 넷이 **같은 화면**을 그린다 (네 크기)');
  {
    const TOK = 'SameScreen00000000001x';
    for (const [w, h] of SIZES) {
      const texts = [];
      for (const pn of ['/s.html', '/notice', '/invoice', '/payslip']) {
        const p = await openEntry(b, port, pn, TOK, [w, h], 'notice');
        await p.waitForFunction(() => !/불러오는 중/.test(document.getElementById('root').innerText),
          {}, { timeout: 15000 }).catch(() => {});
        texts.push(await textOf(p));
        if (pn === '/notice') {
          say(/준비물은 체육복/.test(texts[texts.length - 1]),
            (w + '×' + h + ' «알림장» 이 그려졌다').padEnd(44) + texts[texts.length - 1].slice(0, 22));
        }
        await p.close();
      }
      const same = texts.every((t) => t === texts[0]);
      say(same, (w + '×' + h + ' 네 입구의 화면이 **같다**').padEnd(44) + (same ? '같음' : '다름!'));
      say(texts[0].length > 10, (w + '×' + h + ' 빈 화면이 아니다').padEnd(44) + texts[0].length + '자');
    }
  }

  console.log('\nⓒ 입구마다 **정적 제목**이 다르다 (미리보기가 보는 그것)');
  {
    /* ★ 열린 뒤에는 `document.title` 을 자료로 바꾼다(종전 그대로) — 그래서 **받아 온 HTML**을 본다 */
    const WANT = { '/s.html': '코스로드 공유 문서', '/notice': '알림장·공지 — 코스로드',
                   '/invoice': '거래명세 — 코스로드', '/payslip': '급여명세서 — 코스로드' };
    for (const pn of Object.keys(WANT)) {
      const r = await new Promise((res) => {
        http.get('http://127.0.0.1:' + port + pn, (x) => {
          let d = ''; x.on('data', (c) => { d += c; }); x.on('end', () => res(d));
        });
      });
      const t = (r.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
      const ot = (r.match(/og:title" content="([^"]*)"/) || [])[1] || '';
      say(t === WANT[pn], (pn + ' 제목').padEnd(44) + t);
      say(ot === WANT[pn], (pn + ' og:title 같다').padEnd(44) + ot);
      say(/og:description" content="[^"]{10,}"/.test(r), (pn + ' og:description 있다').padEnd(44) + '✓');
    }
  }

  console.log('\nⓓ 옛 `s.html#토큰` 이 그대로 열린다');
  {
    const TOK = 'OldLink0000000000001ab';
    const p = await openEntry(b, port, '/s.html', TOK, [390, 844], 'invoice');
    await p.waitForFunction(() => !/불러오는 중/.test(document.getElementById('root').innerText),
      {}, { timeout: 15000 }).catch(() => {});
    const t = await textOf(p);
    say(p.__resp.status() === 200, '옛 주소 200'.padEnd(44) + p.__resp.status());
    say(/한빛상사|거래/.test(t), '거래명세가 그려졌다'.padEnd(44) + t.slice(0, 24));
    say(p.__errs.length === 0, '오류 0'.padEnd(44) + (p.__errs[0] || 'OK'));
    const calls = await p.evaluate(() => (window.__fsCalls || []).slice());
    say(calls.length === 1 && calls[0] === 'shares/' + TOK,
      '`shares/<토큰>` 한 번만 읽었다'.padEnd(44) + calls.join(','));
    await p.close();
  }

  console.log('\nⓔ 토큰이 없거나 틀리면 안내 (종전 그대로)');
  {
    const p1 = await openEntry(b, port, '/notice', '', [390, 844], 'notice');
    await p1.evaluate(() => new Promise((r) => setTimeout(r, 400)));
    const t1 = await textOf(p1);
    say(/주소가 올바르지 않|링크/.test(t1), '토큰 없음 → 안내'.padEnd(44) + t1.slice(0, 30));
    await p1.close();
    /* ★ 「없는 토큰」은 **가짜 쪽에서 못 찾게** 해야 한다(`__missing`) —
       처음에는 토큰만 바꿔 놓고 가짜가 그대로 돌려주어 화면이 그려졌다(묶음이 잡았다). */
    const p2 = await openEntry(b, port, '/notice', 'WrongToken000000000001', [390, 844], '__missing');
    await p2.evaluate(() => new Promise((r) => setTimeout(r, 600)));
    const t2 = await textOf(p2);
    say(/만료|올바르지 않/.test(t2), '없는 토큰 → 만료 안내'.padEnd(44) + t2.slice(0, 30));
    await p2.close();
  }

  await b.close();
  srv.close();
  console.log('\n' + (bad ? 'X 문제 ' + bad + '건' : 'o 전부 통과'));
  console.log('※ 로컬 http 서버 · Firebase SDK 는 가짜로 바꿔치기 — 바깥 통신 0 · 실제 읽기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})();
