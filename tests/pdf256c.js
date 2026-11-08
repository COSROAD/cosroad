/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v256 보정3 ★ — 인쇄·PDF 표 3종의 **칸 좌표**가 전/후 같은가
   (급여명세서 pvPrint · 거래내역 printClientRange · 거래명세서 dlvPrint)
   saveHtmlAsPdf 를 가로채 그 HTML·CSS 를 받아, PDF 와 같은 폭(A4)으로 그려 칸을 잰다.
   지시문: 「행 높이가 바뀌는 것은 정상 — 칸 **너비**·페이지 수가 바뀌면 보고」 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const E = require('./env246.js');

const DIR = __dirname.replace(/\\/g, '/');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(DIR, 'pdf256');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.COS_SRC_OLD_REF || '05a0f30';
const OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':index.html', { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const NEW = E.SRC_NEW;
const SUF = '__cosroad_default';

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(48) + String(got).slice(0, 56)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const LONG = '친환경 무세제 세탁볼 대용량 리필세트 12입 특대형';
const CARS = [
  { id: 'car1', name: '1호차', driver: '박기사', hourlyWage: 10030, mealAllow: 200000, taxMode: 'free33', commuteKm: 20 },
  { id: 'car2', name: '2호차', driver: '김기사', hourlyWage: 11000, mealAllow: 150000, taxMode: 'insure4', commuteKm: 15 }
];
const ATT = {};
for (let d = 1; d <= 28; d++) {
  const ds = '2026-10-' + String(d).padStart(2, '0');
  ATT['car1_' + ds] = { in: '08:30', out: '18:00' };
  ATT['car2_' + ds] = { in: '07:50', out: '19:20' };
}
const MEMBERS = [{ id: 1, name: '주식회사 가나다라마바사아자차카타파하', courseId: 'c1', carId: 'car1',
  location: '인천광역시 연수구 용담로 111번길 22', lat: 37.4, lon: 126.7, dropLocation: '인천광역시 연수구 용담로 111번길 22',
  phone: '010-1111-1111', days: ['월','화','수','목','금','토','일'], on: true,
  bizNo: '635-88-02710', ceo: '문준식' }];
const INVOICES = [{
  id: 'inv1', date: '2026-10-05', memberId: 1, clientName: '주식회사 가나다라마바사아자차카타파하',
  kind: 'out', items: [{ name: LONG, qty: 10, price: 12000, amount: 120000 },
                       { name: '초극세사 걸레 청소포 100매입 묶음', qty: 5, price: 8000, amount: 40000 }],
  supply: 160000, vat: 16000, total: 176000, paid: 126000, memo: '' }];

function storeOf() {
  const s = {};
  const put = (k, v) => { s[k + SUF] = JSON.stringify(v); };
  put('tkd_cars', CARS); put('tkd_members', MEMBERS);
  put('tkd_courses', [{ id: 'c1', name: 'A반', depart: '15:00' }]);
  put('tkd_org', { name: '프리존물류', bizNo: '635-88-02710', ceo: '문준식',
    addr: '인천광역시 연수구 용담로 111, 6537호' });
  put('tkd_staff', []); put('tkd_driver_att', ATT); put('tkd_attendance', {});
  put('tkd_payments', {}); put('tkd_tax', {}); put('tkd_carlog', {});
  put('tkd_invoices', INVOICES); put('tkd_products', []);
  return s;
}
/* saveHtmlAsPdf 를 가로채 (html, css) 를 받아 낸다 */
function grab(src, which) {
  const R = E.build({ src: src, biz: 'logistics', localStorage: storeOf() });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'pv-modal'].forEach(id => {
    const el = E.makeEl('div'); el.id = id;
    el.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
    R.document.registerId(id, el);
  });
  let got = null;
  const cap = (html, name, css, opt) => { got = { html: html, css: css, name: name, opt: opt }; };
  R.sandbox.saveHtmlAsPdf = cap; R.win.saveHtmlAsPdf = cap;
  /* 거래내역 PDF 는 saveHtmlAsPdf 가 아니라 **새 창**에 document.write 한다 —
     window.open 이 null 이면 「팝업이 차단되었습니다」로 조용히 끝난다(실제로 겪어서 넣음). */
  let written = '';
  const fakeWin = { document: { write(h){ written += String(h); }, close(){}, title: '' },
                    focus(){}, print(){}, close(){}, onload: null, addEventListener(){} };
  R.sandbox.window.open = R.win.open = () => fakeWin;
  R.sandbox.open = () => fakeWin;
  R.__written = () => written;
  R.ev("currentMode='admin';");
  try {
    if (which === 'payslip') { R.ev("pvYm='2026-10';"); R.sandbox.pvPrint(); }
    if (which === 'range') {
      R.ev("clientRangeMemberId=1; clientRangeStart='2026-10'; clientRangeEnd='2026-10';");
      R.sandbox.printClientRange();
    }
    /* ★ 13810 줄은 지시문이 「거래명세서 PDF」라 적었지만 실제로는 **운행기록부 PDF**(dlvPrint)다.
       고친 줄은 지시문이 가리킨 그 줄이 맞다 — 이름만 바로잡아 보고한다. */
    if (which === 'invoice') { R.ev("dlvCarId='car1'; dlvYm='2026-10';"); R.sandbox.dlvPrint(); }
  } catch (e) { return { err: e.message }; }
  if (got) return got;
  const w = R.__written();
  if (w && w.length > 300) {
    /* 새 창에 쓴 통짜 HTML 에서 <style> 과 <body> 를 갈라 낸다 */
    const cm = /<style>([\s\S]*?)<\/style>/.exec(w);
    const bm = /<body[^>]*>([\s\S]*?)<\/body>/.exec(w);
    return { html: bm ? bm[1] : w, css: cm ? cm[1] : '', name: which, opt: {} };
  }
  return { err: 'saveHtmlAsPdf 도 새 창도 안 받았다' };
}

const PROBE = `
function measure(ifr, name){
  var d = ifr.contentDocument; if(!d) return {name:name, error:'no doc'};
  var cells=d.querySelectorAll('td,th'), sig=[], widths=[];
  for(var c=0;c<cells.length;c++){ var q=cells[c].getBoundingClientRect();
    sig.push(Math.round(q.left)+','+Math.round(q.width));
    widths.push(Math.round(q.width)); }
  var pages=d.querySelectorAll('.pdf-page').length;
  return {name:name, cells:cells.length, pages:pages, sig:sig.join('|'),
          h: d.documentElement.scrollHeight, w: d.documentElement.scrollWidth};
}`;
const PW = 1123;   /* A4 가로(landscape) 96dpi 어림 — 두 판을 **같은 폭**으로 재면 된다 */
function wrapper(ver, items) {
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>t</title>'
    + '<style>body{margin:0}iframe{width:' + PW + 'px;height:3000px;border:0;display:block}</style></head><body>'
    /* ★ PDF HTML 안에 <script>…</script> 가 들어 있다 (거래명세서 글자 맞춤 코드 등).
       그대로 넣으면 바깥 script 가 거기서 끊겨 **재는 코드가 아예 안 돈다**(실제로 겪어서 넣음).
       </ 를 막아서 넣는다. */
    + '<div id="box"></div><script>\nvar ITEMS=' + JSON.stringify(items).split('</').join('<\\/') + ';\n' + PROBE + '\n'
    + 'var box=document.getElementById("box"), fr=[];\n'
    + 'ITEMS.forEach(function(it){var f=document.createElement("iframe");box.appendChild(f);'
    + 'var d=f.contentDocument;d.open();'
    + 'd.write(\'<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>\'+it.css+\'</style></head><body>\'+it.html+\'</body></html>\');'
    + 'd.close();fr.push([f,it.name]);});\n'
    + 'setTimeout(function(){document.title="COSMEASURE"+JSON.stringify(fr.map(function(p){return measure(p[0],p[1]);}));},1800);\n'
    + '<\/script></body></html>';
  const f = path.join(OUT, 'wrap_' + ver + '.html');
  fs.writeFileSync(f, html);
  return f.replace(/\\/g, '/');
}
function dump(file) {
  const out = cp.execSync('"' + CHROME + '" --headless=new --disable-gpu --no-sandbox --hide-scrollbars'
    + ' --host-resolver-rules="MAP * 0.0.0.0" --virtual-time-budget=14000 --dump-dom "file:///' + file + '"',
    { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const m = /<title>COSMEASURE([\s\S]*?)<\/title>/.exec(out);
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')); }
  catch (e) { return null; }
}

const KINDS = [['payslip', '급여명세서 PDF'], ['range', '거래내역 PDF'], ['invoice', '운행기록부 PDF']];
console.log('════ 1. PDF HTML 을 받아 냈나 (헛검사 막기) ════');
const got = { old: {}, new: {} };
for (const [k, label] of KINDS) {
  for (const [ver, src] of [['old', OLD], ['new', NEW]]) got[ver][k] = grab(src, k);
  const a = got.old[k], b = got.new[k];
  if (a.err || b.err) { ck(label + ' — 받아 냈나', (a.err || b.err), '오류 없음'); continue; }
  ck(label.padEnd(14) + ' HTML ' + b.html.length + '자', b.html.length > 500, true);
  ck('   CSS 가 바뀌었다 (전/후 다름)', a.css !== b.css, true);
  ck('   HTML 은 같다 (CSS 만 바꿨으므로)', a.html === b.html, true);
}
ck('긴 품목명이 실제로 들어갔다',
  /특대형/.test(String(got.new.invoice && got.new.invoice.html) + String(got.new.range && got.new.range.html)), true);

console.log('\n════ 2. 칸 좌표·쪽 수 (전/후) ════');
const res = {};
for (const ver of ['old', 'new']) {
  const items = KINDS.filter(([k]) => got[ver][k] && !got[ver][k].err)
    .map(([k, label]) => ({ name: label, html: got[ver][k].html, css: got[ver][k].css }));
  const r = dump(wrapper(ver, items));
  res[ver] = {}; (r || []).forEach(x => { res[ver][x.name] = x; });
}
for (const [k, label] of KINDS) {
  const a = res.old[label], b = res.new[label];
  if (!b) { console.log('  ? ' + label + ' — 못 쟀음'); continue; }
  const sameCells = a.cells === b.cells, samePages = a.pages === b.pages, sameSig = a.sig === b.sig;
  console.log('  ' + label + ' — 칸 ' + a.cells + '→' + b.cells + ' · 쪽 ' + a.pages + '→' + b.pages
    + ' · 높이 ' + a.h + '→' + b.h);
  ck('   칸 수 그대로', sameCells, true);
  ck('   쪽 수 그대로', samePages, true);
  ck('   칸 **너비** 그대로', sameSig, true);
  if (!sameSig) {
    const x = a.sig.split('|'), y = b.sig.split('|');
    let n = 0;
    for (let i = 0; i < Math.max(x.length, y.length) && n < 6; i++)
      if (x[i] !== y[i]) { console.log('        칸 ' + i + ' (왼쪽,너비): ' + x[i] + ' → ' + y[i]); n++; }
    const diffs = x.filter((v, i) => v !== y[i]).length;
    console.log('        달라진 칸 ' + diffs + '/' + x.length);
  }
}

console.log('\n════ 3. 대조 — 이 자가 칸 너비 차이를 잡나 ════');
{
  const one = got.new.invoice;
  if (one && !one.err) {
    const f = wrapper('ctrl', [
      { name: '그대로', html: one.html, css: one.css },
      /* ★ 이 표들은 table-layout:fixed + <col> 퍼센트라 **글꼴로는 칸 너비가 안 움직인다.**
         그래서 대조는 표 폭 자체를 줄여 본다 — 이게 안 움직이면 자가 고장 난 것이다. */
      { name: '표 폭 60%', html: one.html, css: one.css + '\ntable{width:60% !important;}' }]);
    const r = dump(f);
    const differ = r && r[0] && r[1] && r[0].sig !== r[1].sig;
    ck('표 폭을 줄이면 칸 좌표가 달라진다 (고정 레이아웃 표라 글꼴로는 안 움직인다)', differ, true);
  } else ck('대조를 못 돌렸다', false, true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
