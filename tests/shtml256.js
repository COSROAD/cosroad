/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* s.html 공유 화면을 **실제로 그려** 360px 넘침을 잰다.
   ★ 앞서 ?d=... 로 넣어 봤더니 s.html 은 그 길을 모른다(Firestore 토큰으로만 읽는다) —
     화면이 「불러오는 중…」에 머물러 **검사가 헛돌았다**. 그래서 Firestore 를 가짜로 끼워
     renderNotice / renderPayslip / render 가 진짜 그리게 한다.
   비교는 전(05a0f30) / 후(작업 중) 두 판. */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const DIR = __dirname.replace(/\\/g, '/');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(DIR, 'sh256');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.COS_SRC_OLD_REF || '05a0f30';
/* ★ 줄끝을 LF 로 맞춘다 — 작업트리가 CRLF 가 되는 때가 있어(core.autocrlf) 아래 정규식이
   조용히 안 먹고 화면이 「불러오는 중」에 머물렀다(실제로 겪어서 넣음). 배포본은 LF 다. */
const SRC = {
  old: cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':s.html', { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n'),
  new: fs.readFileSync('' + COS_ROOT + '/s.html', 'utf8').replace(/\r\n/g, '\n')
};
/* ★ 코스로드41 — **대조 시험용 「망가뜨린 판」**: 줄바꿈 CSS 를 빼면 넘침이 잡히는가.
   「넘침 0」이 거짓이 아니라는 것을 이 검사가 스스로 보인다(CLAUDE.md 「0건은 대조 뒤에」). */
SRC.bad = SRC.new
  .replace(/word-break:keep-all;overflow-wrap:anywhere;/g, '')
  .replace(/word-break:break-word;/g, '')
  .replace(/white-space:pre-wrap;/g, 'white-space:pre;');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(50) + String(got).slice(0, 56)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const W = 360;

/* 공유 종류별 자료 — 일부러 **긴 한국어**와 **띄어쓰기 없는 긴 URL** 을 섞는다 */
const LONGNAME = '친환경 무세제 세탁볼 대용량 리필세트 12입 특대형';
const LONGURL = 'https://cosroad.com/share/aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff';
const DATA = {
  /* ★★ 코스로드41 에서 고친 자리 (셋째 원인) — 네 자료를 **s.html 이 실제로 읽는 칸 이름**으로
     다시 적었다. 전에는 orgName·body·items·rows 처럼 **앱 쪽 이름**으로 적어 두어
     화면이 머리글만 그려지고 본문이 비었다 → 「360px 넘침」을 사실상 **빈 문서로** 재고 있었다
     (notice 는 30자만 그려져 아예 실패했고, 나머지 셋은 「넘침 0」이 거짓으로 통과할 판이었다).
     칸 이름 출처: s.html renderNotice(d.org.name·d.date·d.content·d.images) ·
     renderPayslip(d.worker·d.lines[label,hours,rate,amount]·d.deductions·d.dedTotal·d.net…) ·
     render(d.client.name·d.period.start/end·d.rows[items[label,supply,vat]]·d.totals·d.net). */
  notice: { kind: 'notice', org: { name: '코스로드태권도학원' }, date: '2026-11-01',
    /* 줄바꿈은 String.fromCharCode(10) 으로 넣는다 — 글자로 적은 역슬래시 n 이
       편집 과정에서 **진짜 줄바꿈**으로 바뀌어 문자열이 끊긴 적이 있다(한 번 겪음). */
    content: '11월 1일(토) 승급심사가 있습니다. 도복과 띠를 꼭 챙겨 주세요.' + String.fromCharCode(10)
      + '자세한 내용은 ' + LONGURL + ' 에서 보실 수 있어요.' + String.fromCharCode(10)
      + '문의는 학원으로 주시고, 늦지 않게 도착해 주시기를 부탁드립니다.',
    images: [] },
  payslip: { kind: 'payslip', org: { name: '코스로드태권도학원' },
    worker: { name: '박기사', role: '1호차 기사' }, ym: '2026-10', payDate: '2026-11-10',
    lines: [{ label: '기본', hours: 160, rate: 10030, amount: 1604800 },
            { label: '잔업 ' + LONGNAME, hours: 10, rate: 15045, amount: 150450 }],
    meal: 200000, total: 1755250,
    deductions: [{ label: '원천징수(3.3%)', amount: 57923 }], dedTotal: 57923,
    net: 1897327, workDays: 20, totalHours: 170 },
  oneInvoice: { kind: 'oneInvoice', org: { name: '프리존물류' },
    client: { name: '주식회사 가나다라마바사아자차카타파하' }, count: 1,
    period: { start: '2026-11-01', end: '2026-11-01' },
    rows: [{ date: '2026-11-01', kind: '매출',
      items: [{ label: LONGNAME, supply: 120000, vat: 12000 },
              { label: '초극세사 걸레 청소포 100매입 묶음', supply: 40000, vat: 4000 }],
      supply: 160000, vat: 16000, grand: 176000, paid: 0, unpaid: 176000 }],
    totals: { supply: 160000, vat: 16000, grand: 176000, paid: 0, unpaid: 176000 },
    net: { sale: 176000, purchase: 0, net: 176000 } },
  clientRange: { kind: 'clientRange', org: { name: '프리존물류' },
    client: { name: '주식회사 가나다라마바사아자차카타파하' }, count: 2,
    period: { start: '2026-10-01', end: '2026-10-31' },
    rows: [{ date: '2026-10-05', kind: '매출',
             items: [{ label: LONGNAME, supply: 120000, vat: 12000 },
                     { label: '초극세사 걸레 청소포 100매입 묶음', supply: 40000, vat: 4000 }],
             supply: 160000, vat: 16000, grand: 176000, paid: 100000, unpaid: 76000 },
           { date: '2026-10-20', kind: '매입',
             items: [{ label: '세탁 세제 ' + LONGNAME, supply: 80000, vat: 8000 }],
             supply: 80000, vat: 8000, grand: 88000, paid: 0, unpaid: 88000 }],
    totals: { supply: 240000, vat: 24000, grand: 264000, paid: 100000, unpaid: 164000 },
    net: { sale: 76000, purchase: 88000, net: -12000 } }
};


/* s.html 을 띄우되 Firebase 를 가짜로 바꿔치기한다 */
function makePage(ver, kind) {
  let src = SRC[ver];
  /* ① CDN 모듈 불러오기 줄을 걷어내고 ② 가짜 getDoc 을 심는다 */
  src = src.replace(/<script type="module">[\s\S]*?<\/script>/g, (m) => {
    let body = m;
    /* import 줄 제거 */
    body = body.replace(/^\s*import[^\n]*\n/gm, '');
    /* Firebase 호출을 가짜로 */
    body = body.replace(/const\s+app\s*=\s*initializeApp\([^)]*\);?/g, '');
    body = body.replace(/const\s+db\s*=\s*getFirestore\([^)]*\);?/g, 'const db = {};');
    /* ★★ 코스로드41 에서 고친 자리 — 여기가 「불러오는 중…」에 머문 **진짜 원인**이었다.
       `await getDoc(doc(db,'shares',token))` 를 `/await\s+getDoc\([^)]*\)/` 로 바꾸면
       `[^)]*` 가 **안쪽 괄호**에서 멈춰 닫는 괄호 하나가 남는다 →
       `const snap = ({…}) );` 가 되어 **스크립트 전체가 문법 오류**로 안 돈다
       (그래서 화면이 첫 글자 그대로 멈췄고, 검사는 네 건 모두 헛돌았다).
       → **문장째로** 바꿔치기한다(괄호 세는 일을 아예 피한다). */
    body = body.replace(/const\s+snap\s*=\s*await\s+getDoc\([\s\S]*?\);/,
      'const snap = { exists: () => true, data: () => window.__SHARE };');
    /* 남은 getDoc·doc 호출이 있으면 그것도 끊어 둔다(없으면 아무 일도 안 한다) */
    body = body.replace(/await\s+getDoc\([\s\S]*?\)\s*\)/g,
      '({ exists: () => true, data: () => window.__SHARE })');
    body = body.replace(/doc\(db[^;]*?\)/g, '{}');
    body = body.replace('<script type="module">', '<script>');   /* file:// 에서 module 은 막힌다 */
    return '<script>window.__SHARE = ' + JSON.stringify(DATA[kind]) + ';<\/script>' + body;
  });
  const f = path.join(OUT, ver + '_' + kind + '.html');
  fs.writeFileSync(f, src);
  /* 바꿔치기가 먹었나 — 안 먹으면 화면이 「불러오는 중」에 머물러 검사가 헛돈다 */
  const left = ['initializeApp(', 'getFirestore(', 'getDoc(', 'import {'].filter(x => src.indexOf(x) >= 0);
  if (left.length) console.log('      ★ ' + ver + '/' + kind + ' — 못 바꾼 것: ' + left.join(', '));
  return path.basename(f);
}

const PROBE = `
function measure(ifr, name){
  var d = ifr.contentDocument; if(!d) return {name:name, error:'no doc'};
  var de = d.documentElement, over = [];
  var all = d.querySelectorAll('body *');
  for (var i=0;i<all.length;i++){
    var el=all[i], r=el.getBoundingClientRect();
    if(r.width===0 && r.height===0) continue;
    var cs=ifr.contentWindow.getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden') continue;
    if(r.right > ${W}+1){
      var sc=false,p=el;
      while(p && p!==d.body){ var pc=ifr.contentWindow.getComputedStyle(p);
        if(pc.overflowX==='auto'||pc.overflowX==='scroll'||pc.overflowX==='hidden'){sc=true;break;} p=p.parentElement; }
      if(sc) continue;
      over.push({tag:el.tagName.toLowerCase(), cls:String(el.className||'').slice(0,26),
                 left:Math.round(r.left), right:Math.round(r.right),
                 txt:String(el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,30)});
    }
  }
  var out=[]; for(var j=0;j<over.length;j++){ if(!out.some(function(o){return o.right>=over[j].right&&o.left<=over[j].left;})) out.push(over[j]); }
  /* ★★ 코스로드41 에서 고친 자리 (둘째 원인) — body.textContent 는 **스크립트 안의 글자까지**
     담는다. s.html 스크립트 **주석**에 「"불러오는 중…" 에서 멈췄다」가 있어서
     loading 이 **언제나 참**이었다 → 화면이 잘 그려져도 이 검사는 절대 통과할 수 없었다.
     → 그려지는 자리(id=root)만 본다. 없으면 종전처럼 body 를 본다.
     ★ 이 글에는 **백틱을 쓰지 않는다** — 이 주석은 템플릿 문자열(PROBE) 안이라
       백틱 하나가 문자열을 끊어 버린다(CLAUDE.md 함정 · 실제로 한 번 끊었다). */
  var rootEl = d.getElementById ? d.getElementById('root') : null;
  var txtEl = rootEl || d.body;
  var txt = String(txtEl ? txtEl.textContent : '').replace(/\\s+/g,' ').trim();
  return {name:name, scrollW:de.scrollWidth, clientW:de.clientWidth, over:out.slice(0,5),
          len: txt.length, loading: /불러오는 중/.test(txt), head: txt.slice(0,40)};
}`;

function wrapper(ver, kinds) {
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>t</title>'
    + '<style>body{margin:0}iframe{width:' + W + 'px;height:3000px;border:0;display:block}</style></head><body>'
    /* ★ 코스로드41: **`#토큰`을 붙인다.** s.html 은 `#` 뒤 토큰이 형식(base64url 22자 이상)에
       맞지 않으면 조회 자체를 하지 않고 「링크가 만료…」를 띄운다 — 토큰이 없으면
       화면이 안 그려져 넘침을 잴 수 없다(그래서 네 건이 헛돌았다). */
    + kinds.map((k, i) => '<iframe id="f' + i + '" src="' + makePage(ver, k)
        + '#AAAAAAAAAAAAAAAAAAAAAA"></iframe>').join('')
    + '<script>' + PROBE + '\nvar N=' + kinds.length + ', NAMES=' + JSON.stringify(kinds) + ';\n'
    + 'setTimeout(function(){ var res=[]; for(var i=0;i<N;i++) res.push(measure(document.getElementById("f"+i), NAMES[i]));'
    + ' document.title="COSMEASURE"+JSON.stringify(res); }, 3000);<\/script></body></html>';
  const f = path.join(OUT, 'wrap_' + ver + '.html');
  fs.writeFileSync(f, html);
  return f.replace(/\\/g, '/');
}
function dump(file) {
  const out = cp.execSync('"' + CHROME + '" --headless=new --disable-gpu --no-sandbox --hide-scrollbars'
    + ' --allow-file-access-from-files --host-resolver-rules="MAP * 0.0.0.0"'
    + ' --virtual-time-budget=12000 --dump-dom "file:///' + file + '"',
    { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const m = /<title>COSMEASURE([\s\S]*?)<\/title>/.exec(out);
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')); }
  catch (e) { return null; }
}

const KINDS = ['notice', 'payslip', 'oneInvoice', 'clientRange'];
const res = {};
for (const ver of ['old', 'new', 'bad']) {
  const r = dump(wrapper(ver, KINDS));
  res[ver] = {}; (r || []).forEach(x => { res[ver][x.name] = x; });
}

console.log('════ s.html 공유 화면 — 360px (전/후) ════');
for (const k of KINDS) {
  const a = res.old[k] || {}, b = res.new[k] || {};
  if (!b.scrollW) { ck(k + ' — 못 쟀음', false, true); continue; }
  /* ★ 헛검사 막기 — 「불러오는 중」 카드에 머물러 있으면 넘침 0 은 뜻이 없다 */
  ck(k.padEnd(12) + ' 실제로 그려졌나 (글자 ' + b.len + '자)', !b.loading && b.len > 80, true);
  if (b.loading || b.len <= 80) { console.log('        화면: ' + b.head); continue; }
  const oa = (a.scrollW || 0) - (a.clientW || 0), ob = b.scrollW - b.clientW;
  ck('   전 넘침 ' + (oa > 0 ? oa : 0) + ' → 후 넘침 ' + (ob > 0 ? ob : 0), ob <= 0, true);
  if (ob > 0) (b.over || []).forEach(o => console.log('        ' + o.tag + '.' + o.cls + ' ' + o.left + '~' + o.right + ' ' + o.txt));
}
console.log('\n════ 대조 — 줄바꿈 CSS 를 빼면 **넘침을 잡나** ════');
{
  let caught = 0, seen = 0;
  for (const k of KINDS) {
    const c = res.bad[k] || {};
    if (!c.scrollW) continue;
    seen++;
    const oc = c.scrollW - c.clientW;
    if (oc > 0) caught++;
    console.log('  ' + k.padEnd(12) + ' 망가뜨린 판 넘침 ' + (oc > 0 ? oc : 0)
      + (oc > 0 && (c.over || []).length ? ('  ← ' + c.over[0].tag + '.' + c.over[0].cls) : ''));
  }
  ck('망가뜨린 판 네 종류를 다 그렸다', seen, KINDS.length);
  ck('그 가운데 **넘침을 잡은 것이 있다**(넘침 0 이 거짓이 아니다)', caught > 0, true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
