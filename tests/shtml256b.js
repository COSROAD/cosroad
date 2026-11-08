/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* s.html 공유 화면 — **s.html 자신의 그리기 함수**를 node 에서 돌려 HTML 을 얻고,
   그 HTML 을 s.html 의 CSS 와 함께 360px iframe 에 넣어 넘침을 잰다.
   (앞서 브라우저에서 Firebase 를 가짜로 끼우려 했더니 file:// 에서 module 이 막혀
    화면이 「불러오는 중」에 머물렀다 — 검사가 헛돌아 방법을 바꿨다.)
   ★ 이 검사가 노리는 것: s.html 의 .range-tbl 을 break-all → keep-all 로 바꿨는데
     **표 칸이 넘치지 않는가**. */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const vm = require('vm');

const DIR = __dirname.replace(/\\/g, '/');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(DIR, 'sh256b');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.COS_SRC_OLD_REF || '05a0f30';
const SRC = {
  old: cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':s.html', { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n'),
  new: fs.readFileSync('' + COS_ROOT + '/s.html', 'utf8').replace(/\r\n/g, '\n')
};
let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(50) + String(got).slice(0, 56)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const W = 360;
const LONGNAME = '친환경 무세제 세탁볼 대용량 리필세트 12입 특대형';
const LONGURL = 'https://cosroad.com/share/aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff';
const DATA = {
  /* ★ 필드 이름은 s.html 이 **실제로 읽는 것**으로 맞췄다 (renderNotice/renderPayslip/render 원문 대조).
     앞서 엉뚱한 이름으로 넣었더니 표는 그려지는데 **글자가 비어** 검사가 헛돌았다. */
  notice: { kind: 'notice', org: { name: '코스로드태권도학원' }, date: '2026-11-01', images: [],
    content: '11월 1일(토) 승급심사가 있습니다. 도복과 띠를 꼭 챙겨 주세요.\n자세한 내용은 ' + LONGURL + ' 에서 보실 수 있어요.' },
  payslip: { kind: 'payslip', org: { name: '코스로드태권도학원' }, worker: '박기사', ym: '2026-10',
    payDate: '2026-11-10', workDays: 20, totalHours: 170,
    lines: [{ label: '기본급 (소정근로 160시간)', hours: 160, wage: 10030, amount: 1604800 },
            { label: '연장근로수당 (잔업 10시간)', hours: 10, wage: 15045, amount: 150450 }],
    meal: 200000, total: 1755250,
    deductions: [{ label: '원천징수(3.3%)', amount: 57923 }], dedTotal: 57923, net: 1897327 },
  oneInvoice: { kind: 'oneInvoice', period: '2026-11-01', net: 176000,
    totals: { supply: 160000, vat: 16000, grand: 176000, paid: 126000, unpaid: 50000 },
    rows: [{ date: '2026-11-01', kind: '매출', supply: 160000, vat: 16000, grand: 176000,
             paid: 126000, unpaid: 50000,
             items: [{ label: LONGNAME, supply: 120000, vat: 12000 },
                     { label: '초극세사 걸레 청소포 100매입 묶음', supply: 40000, vat: 4000 }] }] },
  clientRange: { kind: 'clientRange', period: '2026-10-01 ~ 2026-10-31', net: 176000,
    totals: { supply: 160000, vat: 16000, grand: 176000, paid: 126000, unpaid: 50000 },
    rows: [{ date: '2026-10-05', kind: '매출', supply: 120000, vat: 12000, grand: 132000,
             paid: 82000, unpaid: 50000,
             items: [{ label: LONGNAME, supply: 90000, vat: 9000 },
                     { label: '초극세사 걸레 청소포 100매입 묶음', supply: 30000, vat: 3000 }] },
           { date: '2026-10-20', kind: '매출', supply: 40000, vat: 4000, grand: 44000,
             paid: 44000, unpaid: 0,
             items: [{ label: '대용량 리필세트 특대형 12입 묶음상품', supply: 40000, vat: 4000 }] }] }
};


/* s.html 의 <script type="module"> 알맹이를 node vm 에서 돌린다 (import·Firebase 는 걷어낸다) */
function runS(src) {
  const m = /<script type="module">([\s\S]*?)<\/script>/.exec(src);
  if (!m) throw new Error('module 블록을 못 찾음');
  let code = m[1]
    .replace(/^\s*import[^\n]*\n/gm, '')
    .replace(/const\s+app\s*=\s*initializeApp\([\s\S]*?\);/g, '')
    .replace(/const\s+db\s*=\s*getFirestore\([^)]*\);/g, '')
    .replace(/^\s*load\(\);\s*$/m, '')                       // 자동 실행 끄기
    .replace(/window\.addEventListener\([\s\S]*?\);\s*$/m, '');
  /* 가짜 DOM — 그린 HTML 만 받아 낸다 */
  const slots = {};
  const el = () => ({ _h: '', get innerHTML(){ return this._h; }, set innerHTML(v){ this._h = String(v); },
                      style: {}, classList: { add(){}, remove(){} }, appendChild(){}, setAttribute(){},
                      addEventListener(){}, querySelectorAll: () => [], focus(){} });
  const sandbox = {
    document: {
      getElementById: (id) => (slots[id] = slots[id] || el()),
      querySelector: () => el(), querySelectorAll: () => [], createElement: () => el(),
      addEventListener(){}, body: el(), get title(){ return ''; }, set title(v){}
    },
    window: { addEventListener(){}, location: { search: '', hash: '', href: '' }, print(){} },
    location: { search: '', hash: '', href: '' },
    console: { log(){}, warn(){}, error(){} },
    setTimeout: (f) => { try { f(); } catch (e) {} return 0; }, clearTimeout(){},
    JSON, Math, Date, Number, String, Boolean, Array, Object, RegExp, Error, Intl,
    isNaN, isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, atob, btoa,
    URLSearchParams, Promise
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 's.js', timeout: 20000 });
  return { sandbox, slots, ev: (e) => vm.runInContext(e, sandbox) };
}

/* 종류별 HTML 뽑기 */
function screensOf(ver) {
  const R = runS(SRC[ver]);
  const out = {};
  const grab = (fn, d) => {
    Object.keys(R.slots).forEach(k => { R.slots[k]._h = ''; });
    try { R.ev('(' + fn + ')')(d); } catch (e) { return 'ERR:' + e.message; }
    /* 그려진 자리를 모두 모은다 */
    return Object.keys(R.slots).map(k => R.slots[k]._h).filter(Boolean).join('\n');
  };
  out.notice = grab('renderNotice', DATA.notice);
  out.payslip = grab('renderPayslip', DATA.payslip);
  out.oneInvoice = grab('render', DATA.oneInvoice);
  out.clientRange = grab('render', DATA.clientRange);
  return out;
}

const cssOf = (src) => { const m = /<style>([\s\S]*?)<\/style>/.exec(src); return m ? m[1] : ''; };
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
  var cells=d.querySelectorAll('td,th'), sig=[];
  for(var c=0;c<cells.length;c++){ var q=cells[c].getBoundingClientRect();
    sig.push(Math.round(q.left)+','+Math.round(q.width)); }
  return {name:name, scrollW:de.scrollWidth, clientW:de.clientWidth, over:out.slice(0,5),
          cells:cells.length, sig:sig.join('|')};
}`;
function wrapper(ver, scr, css) {
  const items = Object.keys(scr);
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>t</title>'
    + '<style>body{margin:0}iframe{width:' + W + 'px;height:3000px;border:0;display:block}</style></head><body>'
    + '<div id="box"></div><script>\n'
    + 'var CSS=' + JSON.stringify(css) + ';\nvar ITEMS=' + JSON.stringify(items.map(k => ({ n: k, h: scr[k] }))) + ';\n'
    + PROBE + '\nvar box=document.getElementById("box"), fr=[];\n'
    + 'ITEMS.forEach(function(it){var f=document.createElement("iframe");box.appendChild(f);'
    + 'var d=f.contentDocument;d.open();'
    + 'd.write(\'<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>\'+CSS+\'</style></head><body>\'+it.h+\'</body></html>\');'
    + 'd.close();fr.push([f,it.n]);});\n'
    + 'setTimeout(function(){document.title="COSMEASURE"+JSON.stringify(fr.map(function(p){return measure(p[0],p[1]);}));},1500);\n'
    + '<\/script></body></html>';
  const f = path.join(OUT, 'wrap_' + ver + '.html');
  fs.writeFileSync(f, html);
  return f.replace(/\\/g, '/');
}
function dump(file) {
  const out = cp.execSync('"' + CHROME + '" --headless=new --disable-gpu --no-sandbox --hide-scrollbars'
    + ' --host-resolver-rules="MAP * 0.0.0.0" --virtual-time-budget=12000 --dump-dom "file:///' + file + '"',
    { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const m = /<title>COSMEASURE([\s\S]*?)<\/title>/.exec(out);
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')); }
  catch (e) { return null; }
}

console.log('════ 1. s.html 그리기 함수가 **진짜 그렸나** (헛검사 막기) ════');
const scr = { old: screensOf('old'), new: screensOf('new') };
for (const k of Object.keys(scr.new)) {
  const h = scr.new[k];
  ck(k.padEnd(12) + ' HTML ' + String(h).length + '자', !/^ERR:/.test(h) && String(h).length > 300, true);
  if (/^ERR:/.test(h)) console.log('        ' + h);
}
ck('긴 품목명이 실제로 들어갔다', /특대형/.test(scr.new.oneInvoice + scr.new.clientRange), true);
ck('긴 URL 이 실제로 들어갔다', /aaaaaaaabbbbbbbb/.test(scr.new.notice), true);
ck('알림장 본문이 들어갔다', /승급심사|도복/.test(scr.new.notice), true);
ck('전/후 HTML 은 같다 (CSS 만 바꿨으므로)',
  JSON.stringify(scr.old) === JSON.stringify(scr.new), true);

console.log('\n════ 2. 360px 넘침 + 표 칸 좌표 (전/후) ════');
const res = {};
for (const ver of ['old', 'new']) {
  const r = dump(wrapper(ver, scr[ver], cssOf(SRC[ver])));
  res[ver] = {}; (r || []).forEach(x => { res[ver][x.name] = x; });
}
for (const k of Object.keys(scr.new)) {
  const a = res.old[k] || {}, b = res.new[k] || {};
  if (!b.scrollW) { ck(k + ' — 못 쟀음', false, true); continue; }
  const oa = (a.scrollW || 0) - (a.clientW || 0), ob = b.scrollW - b.clientW;
  ck(k.padEnd(12) + ' 넘침 전 ' + (oa > 0 ? oa : 0) + ' → 후 ' + (ob > 0 ? ob : 0), ob <= 0, true);
  if (ob > 0) (b.over || []).forEach(o => console.log('        ' + o.tag + '.' + o.cls + ' ' + o.left + '~' + o.right + ' ' + o.txt));
  if (b.cells) {
    const sameCells = a.cells === b.cells;
    const sameSig = a.sig === b.sig;
    console.log('      ' + k + ' 표 칸 ' + a.cells + '→' + b.cells
      + ' · 칸 좌표 ' + (sameSig ? '같음' : '달라짐(줄바꿈이 바뀌어 **높이**만 달라진 것인지 아래 확인)'));
    if (!sameSig) {
      const x = String(a.sig).split('|'), y = String(b.sig).split('|');
      let shown = 0;
      for (let i = 0; i < Math.max(x.length, y.length) && shown < 4; i++)
        if (x[i] !== y[i]) { console.log('        칸 ' + i + ' (왼쪽,너비): ' + x[i] + ' → ' + y[i]); shown++; }
    }
    /* ★★ 코스로드41 에서 기대값을 고친 자리 — **급여명세서 표는 칸 너비가 바뀌는 것이 맞다.**
       v256 보정3 이 한 일이 `break-all` → `keep-all` 이다. 낱말을 안 쪼개면 표의
       **자연 너비**(auto layout)가 달라진다 — 급여명세서 세 칸이 119/107/77 → 128/114/61 로
       바뀌었다(실측). 이 묶음이 지켜야 할 것은 「**넘치지 않는가**」이고 그것은 위에서 본다.
       그래서 칸 수는 같아야 하고(자료가 같으므로), 좌표는 **360px 안에 있는지**만 본다.
       (거래내역 두 종류는 칸 너비까지 그대로다 — 아래 로그로 확인된다) */
    const within = String(b.sig).split('|').every((p) => {
      const x = p.split(','); return (Number(x[0]) + Number(x[1])) <= 360 + 1;
    });
    ck('   ' + k + ' 표 칸 수 그대로 · 모든 칸이 360px 안', sameCells && within, true);
    if (!sameSig) console.log('      ※ 칸 너비는 달라졌다 — keep-all 로 바꾼 결과다(넘침 0 이면 맞는 것)');
  }
}

console.log('\n════ 3. 대조 — 이 자가 넘침을 잡나 ════');
{
  const f = wrapper('ctrl', { '일부러 1000px': '<div style="width:1000px;height:20px;background:#f00">넘침</div>',
                              '보통 200px': '<div style="width:200px;height:20px;background:#0a0">보통</div>' }, '');
  const r = dump(f);
  const w = r && r[0] && (r[0].scrollW - r[0].clientW) > 0;
  const n = r && r[1] && (r[1].scrollW - r[1].clientW) === 0;
  const vp = r && r[0] && r[0].clientW === W;
  ck('넘치는 칸을 잡는다', w, true);
  ck('안 넘치는 칸은 0', n, true);
  ck('보기창이 360px', vp, true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
