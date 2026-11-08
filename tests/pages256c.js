/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v256 보정3 브라우저 실측
   ① s.html·terms.html·privacy.html·home.html 을 360px 에서 — 가로 넘침 (전/후)
      s.html 은 공유 종류별로 (알림장·거래명세서·거래내역·급여명세서 …)
   ② 인쇄·PDF 표 3종의 **칸 좌표**가 전/후 같은지 (보정1 때와 같은 자)
   ★ 보기창은 --window-size 가 아니라 **360px iframe** 으로 만든다 (보정1에서 겪은 함정) */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const E = require('./env246.js');

const DIR = __dirname.replace(/\\/g, '/');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(DIR, 'pg256');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.COS_SRC_OLD_REF || '05a0f30';
const show = (f) => cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':' + f, { maxBuffer: 1 << 28 }).toString();
const now = (f) => fs.readFileSync('' + COS_ROOT + '/' + f, 'utf8');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 55)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
function dump(file, budget) {
  const out = cp.execSync('"' + CHROME + '" --headless=new --disable-gpu --no-sandbox --hide-scrollbars'
    + ' --allow-file-access-from-files --host-resolver-rules="MAP * 0.0.0.0"'
    + ' --virtual-time-budget=' + (budget || 9000) + ' --dump-dom "file:///' + file + '"',
    { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const m = /<title>COSMEASURE([\s\S]*?)<\/title>/.exec(out);
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')); }
  catch (e) { return null; }
}
const W = 360;
const PROBE_OVER = `
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
      over.push({tag:el.tagName.toLowerCase(), cls:String(el.className||'').slice(0,30),
                 left:Math.round(r.left), right:Math.round(r.right), txt:String(el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,32)});
    }
  }
  var out=[]; for(var j=0;j<over.length;j++){ if(!out.some(function(o){return o.right>=over[j].right&&o.left<=over[j].left;})) out.push(over[j]); }
  return {name:name, scrollW:de.scrollWidth, clientW:de.clientWidth, over:out.slice(0,5)};
}`;

/* ── ① 4개 페이지 ── */
function pageFile(ver, f, body) {
  const src = (ver === 'old' ? show(f) : now(f));
  const out = path.join(OUT, ver + '_' + f);
  fs.writeFileSync(out, body ? src.replace('</body>', body + '</body>') : src);
  return path.basename(out);
}
function wrapper(ver, items) {
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>t</title>'
    + '<style>body{margin:0}iframe{width:' + W + 'px;height:2400px;border:0;display:block}</style></head><body>'
    + items.map((it, i) => '<iframe id="f' + i + '" src="' + it.file + '"></iframe>').join('')
    + '<script>' + PROBE_OVER + '\nvar N=' + items.length + ', NAMES=' + JSON.stringify(items.map(x => x.name)) + ';\n'
    + 'var done=0; function go(){ setTimeout(function(){ var res=[]; for(var i=0;i<N;i++) res.push(measure(document.getElementById("f"+i), NAMES[i]));'
    + ' document.title="COSMEASURE"+JSON.stringify(res); }, 1500); }\n'
    + 'for(var i=0;i<N;i++){ document.getElementById("f"+i).addEventListener("load", function(){ if(++done===N) go(); }); }\n'
    + 'setTimeout(go, 8000);<\/script></body></html>';
  const out = path.join(OUT, 'wrap_' + ver + '.html');
  fs.writeFileSync(out, html);
  return out.replace(/\\/g, '/');
}

console.log('════ 0. 검사기 대조 — 넘침을 잡나 · 보기창이 360 인가 ════');
{
  fs.writeFileSync(path.join(OUT, 'wide.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0"><div style="width:1000px;height:20px;background:#f00">넘침</div></body>');
  fs.writeFileSync(path.join(OUT, 'narrow.html'),
    '<!doctype html><meta charset="utf-8"><body style="margin:0"><div style="width:200px;height:20px;background:#0a0">보통</div></body>');
  const r = dump(wrapper('ctrl', [{ file: 'wide.html', name: '일부러 1000px' }, { file: 'narrow.html', name: '보통 200px' }]), 6000);
  const ok1 = r && r[0] && (r[0].scrollW - r[0].clientW) > 0;
  const ok2 = r && r[1] && (r[1].scrollW - r[1].clientW) === 0;
  const ok3 = r && r[0] && r[0].clientW === W;
  ck('넘치는 칸을 잡는다', ok1, true);
  ck('안 넘치는 칸은 0', ok2, true);
  ck('보기창이 360px', ok3, true);
}

console.log('\n════ 1. 4개 페이지 — 360px 가로 넘침 (전/후) ════');
{
  const FILES = ['s.html', 'terms.html', 'privacy.html', 'home.html'];
  const res = {};
  for (const ver of ['old', 'new']) {
    const items = FILES.map(f => ({ file: pageFile(ver, f), name: f }));
    const r = dump(wrapper(ver, items), 14000);
    res[ver] = {}; (r || []).forEach(x => { res[ver][x.name] = x; });
  }
  for (const f of FILES) {
    const a = res.old[f] || {}, b = res.new[f] || {};
    const oa = (a.scrollW || 0) - (a.clientW || 0), ob = (b.scrollW || 0) - (b.clientW || 0);
    ck(f.padEnd(14) + ' 전 넘침 ' + (oa > 0 ? oa : 0) + ' → 후 넘침 ' + (ob > 0 ? ob : 0), ob <= 0, true);
    if (ob > 0) (b.over || []).forEach(o => console.log('        ' + o.tag + '.' + o.cls + ' ' + o.left + '~' + o.right + ' ' + o.txt));
  }
}

console.log('\n════ 2. s.html 공유 종류별 — 360px ════');
{
  /* s.html 은 ?d=<base64> 로 자료를 받는다. 종류별로 하나씩 만들어 넣는다. */
  const SHARES = {
    '알림장': { kind: 'notice', orgName: '코스로드태권도학원', title: '11월 행사 안내',
      body: '11월 1일(토) 승급심사가 있습니다. 도복과 띠를 꼭 챙겨 주세요.\n\n자세한 내용은 https://cosroad.com/notice/2026-11-01-seungGeupSimSa-annae 에서 보실 수 있어요.',
      date: '2026-11-01', photos: [] },
    '거래명세서': { kind: 'invoice', orgName: '프리존물류', client: '주식회사 가나다라마바사아자차카타파하',
      date: '2026-11-01', items: [
        { name: '친환경 무세제 세탁볼 대용량 리필세트 12입', qty: 10, price: 12000, amt: 120000 },
        { name: '초극세사 극세사 걸레 청소포 100매', qty: 5, price: 8000, amt: 40000 }],
      supply: 160000, vat: 16000, total: 176000 },
    '거래내역': { kind: 'range', orgName: '프리존물류', client: '주식회사 가나다라마바사아자차카타파하',
      from: '2026-10-01', to: '2026-10-31', rows: [
        { date: '2026-10-05', item: '친환경 무세제 세탁볼 대용량 리필세트 12입', qty: 10, price: 12000, amt: 120000 },
        { date: '2026-10-20', item: '초극세사 극세사 걸레 청소포 100매', qty: 5, price: 8000, amt: 40000 }],
      supply: 160000, vat: 16000, total: 176000, unpaid: 50000 },
    '급여명세서': { kind: 'payslip', orgName: '코스로드태권도학원', name: '박기사', ym: '2026-10',
      payDay: '2026-11-10', rows: [{ k: '기본', h: 160, w: 10030, a: 1604800 }],
      meal: 200000, total: 1604800, ded: 52958, net: 1751842 }
  };
  const b64 = (o) => Buffer.from(encodeURIComponent(JSON.stringify(o))).toString('base64');
  const items = { old: [], new: [] };
  for (const ver of ['old', 'new']) {
    for (const [name, data] of Object.entries(SHARES)) {
      const src = (ver === 'old' ? show('s.html') : now('s.html'));
      /* 주소 물음표가 iframe src 에 그대로 들어가게 파일을 따로 만든다 */
      const f = ver + '_s_' + name + '.html';
      fs.writeFileSync(path.join(OUT, f), src);
      items[ver].push({ file: f + '?d=' + encodeURIComponent(b64(data)), name: name });
    }
  }
  const res = {};
  for (const ver of ['old', 'new']) {
    const r = dump(wrapper(ver + '_s', items[ver]), 14000);
    res[ver] = {}; (r || []).forEach(x => { res[ver][x.name] = x; });
  }
  let any = false;
  for (const name of Object.keys(SHARES)) {
    const a = res.old[name] || {}, b = res.new[name] || {};
    if (!b.scrollW) { console.log('  ? ' + name + ' — 못 쟀음 (s.html 이 이 자료를 안 그림)'); continue; }
    any = true;
    const oa = (a.scrollW || 0) - (a.clientW || 0), ob = b.scrollW - b.clientW;
    ck('s.html · ' + name.padEnd(8) + ' 전 ' + (oa > 0 ? oa : 0) + ' → 후 ' + (ob > 0 ? ob : 0), ob <= 0, true);
    if (ob > 0) (b.over || []).forEach(o => console.log('        ' + o.tag + '.' + o.cls + ' ' + o.left + '~' + o.right + ' ' + o.txt));
  }
  ck('(대조) 공유 화면을 실제로 그렸다', any, true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
