/* 조사용 — 묶음이 아니다(돌림판에 적지 않는다).
   홈페이지의 **나란한 카드 묶음**에서 제목·설명 줄 높이가 얼마나 어긋나나 잰다(4크기). */
const { chromium } = require('playwright');
const path = require('path');
const HOME = process.env.COS_HOME
  || (path.resolve(__dirname, '../..').replace(/\\/g, '/') + '/home.html');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

/* 묶음마다 「한 줄에 몇 장인가」를 보고, 같은 줄 안에서 제목·설명 top 이 같은지 센다 */
const MEASURE = `(() => {
  const groups = [
    { name: '.biz (업종 4)',      sel: '.biz-grid > .biz',        t: 'h3', d: 'p' },
    { name: '.feat (기능)',        sel: '.feat-grid > .feat',      t: 'h4', d: 'p' },
    { name: '#guide 카드',         sel: '#guide [style*="minmax(240px"] > div', t: 'h4', d: 'p' },
    { name: '#assistant 카드',     sel: '#assistant [style*="minmax(260px"] > div', t: 'h4', d: 'p' },
    { name: '.install-card',       sel: '.install-grid > .install-card', t: 'h3', d: 'ol' }
  ];
  const out = [];
  groups.forEach((g) => {
    const cards = [...document.querySelectorAll(g.sel)];
    if (!cards.length) { out.push({ name: g.name, n: 0 }); return; }
    /* 같은 줄 = 카드 top 이 같은 것끼리 */
    const rows = {};
    cards.forEach((c) => {
      const b = c.getBoundingClientRect();
      const key = Math.round(b.top);
      (rows[key] = rows[key] || []).push(c);
    });
    let worstT = 0, worstD = 0, rowsOf2 = 0;
    Object.keys(rows).forEach((k) => {
      const band = rows[k];
      if (band.length < 2) return;
      rowsOf2++;
      const tops = (sel) => band.map((c) => {
        const e = c.querySelector(sel);
        if (!e) return null;
        return Math.round(e.getBoundingClientRect().top - c.getBoundingClientRect().top);
      }).filter((x) => x !== null);
      const spread = (a) => (a.length < 2 ? 0 : Math.max.apply(null, a) - Math.min.apply(null, a));
      worstT = Math.max(worstT, spread(tops(g.t)));
      worstD = Math.max(worstD, spread(tops(g.d)));
    });
    out.push({ name: g.name, n: cards.length, rows: rowsOf2, title: worstT, desc: worstD });
  });
  return out;
})()`;

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const [w, h] of SIZES) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
    await p.goto('file:///' + HOME.replace(/\\/g, '/'), { waitUntil: 'load' });
    await p.waitForTimeout(250);
    const r = await p.evaluate(MEASURE);
    console.log('── ' + w + 'x' + h);
    r.forEach((g) => {
      if (!g.n) { console.log('   ' + g.name.padEnd(22) + '카드 0장'); return; }
      console.log('   ' + g.name.padEnd(22) + '카드 ' + g.n + '장 · 여러 장 줄 ' + g.rows
        + ' · 제목 어긋남 ' + g.title + 'px · 설명 어긋남 ' + g.desc + 'px');
    });
    await p.close();
  }
  await b.close();
})();
