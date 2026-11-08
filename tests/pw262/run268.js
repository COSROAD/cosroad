/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v268 — 실제 크롬 4크기로: 합친 단추 · 문서 보기 창 · 카톡 확인창 겹침 · 수납 분리
   ★ 바깥 요청은 전부 막는다(file:// 만) — Firestore·카카오로 나가는 길이 아예 없다.
   ★ 「🖨 인쇄·PDF」 새 창 HTML 은 **옛 판(0322876)을 같은 브라우저로 돌려** sha256 으로 맞댄다. */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const NEW = '' + COS_ROOT + '/index.html';
const OLD_REF = process.env.COS_SRC_OLD_REF || '0322876';
const OLD = path.join(__dirname, 'old_index268.html');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

/* 매출·매입이 **같은 날·같은 거래처**에 섞인 자료 (섞임을 잡는다) */
const SEED = {
  members: [
    { id: 1, name: '주식회사 가나다물류', bizNo: '635-88-02710', ceo: '문준식',
      location: '인천광역시 연수구 용담로 111번길 22', phone: '010-1111-1111',
      bizCat: '도매', bizItem: '생활용품', on: true },
    { id: 2, name: '나라상사', bizNo: '123-45-67890', ceo: '김대표',
      location: '서울시 강남구 테헤란로 1', phone: '010-2222-2222', on: true }
  ],
  org: { name: '프리존물류', bizNo: '635-88-02710', ceo: '문준식',
    address: '인천광역시 연수구 용담로 111, 6537호', bizCat: '운수', bizItem: '화물운송',
    bankAccount: '기업 123-456789-01-011' },
  invoices: [
    { id: 'S1', kind: 'sale', date: '2026-10-05', createdAt: 1, memberId: 1, memberName: '주식회사 가나다물류',
      items: [{ name: '친환경 무세제 세탁볼 대용량 리필세트 12입', spec: '', unit: 'EA', qty: 10, price: 12000 },
              { name: '초극세사 걸레 청소포 100매입', spec: '', unit: 'EA', qty: 5, price: 8000 }],
      supply: 160000, vat: 16000, total: 176000,
      payments: [{ date: '2026-10-07', method: '계좌이체', amount: 50000 }] },
    { id: 'P1', kind: 'purchase', date: '2026-10-05', createdAt: 2, memberId: 1, memberName: '주식회사 가나다물류',
      items: [{ name: '포장 테이프 48mm', spec: '', unit: 'EA', qty: 100, price: 900 }],
      supply: 90000, vat: 9000, total: 99000, payments: [] },
    { id: 'S2', kind: 'sale', date: '2026-10-12', createdAt: 3, memberId: 1, memberName: '주식회사 가나다물류',
      items: [{ name: '박스 대', spec: '', unit: 'EA', qty: 200, price: 700 }],
      supply: 140000, vat: 14000, total: 154000, payments: [] },
    { id: 'P2', kind: 'purchase', date: '2026-10-20', createdAt: 4, memberId: 1, memberName: '주식회사 가나다물류',
      items: [{ name: '노끈', spec: '', unit: 'EA', qty: 50, price: 500 }],
      supply: 25000, vat: 2500, total: 27500, payments: [] },
    { id: 'S3', kind: 'sale', date: '2026-10-22', createdAt: 5, memberId: 2, memberName: '나라상사',
      items: [{ name: '완충재', spec: '', unit: 'EA', qty: 30, price: 1500 }],
      supply: 45000, vat: 4500, total: 49500, payments: [] }
  ]
};

/* 앱을 열고, 자료를 심고, 거래명세서 탭을 그린다. 새 창은 가로채 글자만 모은다. */
async function openApp(b, file, w, h) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof window.renderInvoice === 'function'
    || typeof renderInvoice === 'function', {}, { timeout: 20000 });
  await p.evaluate((seed) => {
    /* 새 창을 가로챈다 — 글자만 모으고 실제로 열지 않는다 */
    window.__wins = [];
    window.open = function () {
      const w = { html: '', closed: false,
        document: { write(h){ w.html += String(h); }, close(){ w.closed = true; } },
        print(){}, close(){}, focus(){} };
      window.__wins.push(w); return w;
    };
    window.__alerts = [];
    window.alert = function (m) { window.__alerts.push(String(m)); };
    window.confirm = function(){ return true; };
    /* 업종·로그인 흉내 — 실제 로그인·Firestore 는 건드리지 않는다 */
    try { window._userBizType = 'logistics'; } catch (e) {}
    try { DEFAULT_BIZ_TYPE = 'logistics'; } catch (e) {}
    try { _userBizType = 'logistics'; } catch (e) {}
    /* 자료 심기 — 앱이 감싼 localStorage 를 쓰므로 기관 접미사가 저절로 붙는다 */
    localStorage.setItem('tkd_members', JSON.stringify(seed.members));
    localStorage.setItem('tkd_invoices', JSON.stringify(seed.invoices));
    localStorage.setItem('tkd_org', JSON.stringify(seed.org));
    localStorage.setItem('tkd_products', '[]');
    try { members = loadMembers(); } catch (e) {}
    try { orgSettings = loadOrgSettings(); } catch (e) {}
    /* 화면 띄우기 */
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const app = document.getElementById('main-app'); if (app) app.style.display = 'block';
    /* 관리 화면을 실제로 **보이게** 한다 — .admin-screen 은 .show 가 붙어야 display:flex 가 된다.
       안 붙이면 단추들의 폭·높이가 0 이라 「화면 밖인가」를 잴 수 없다(처음에 그렇게 0개로 나왔다). */
    const ad = document.getElementById('admin-screen'); if (ad) ad.classList.add('show');
    try { clientRangeMemberId = '1'; clientRangeStart = '2026-10'; clientRangeEnd = '2026-10'; } catch (e) {}
    try { invListYear = 2026; invListMonth = 10; } catch (e) {}
    renderInvoice();
  }, SEED);
  return p;
}

/* 화면 안에 있는지 — 왼쪽 끝 ≥ 0, 오른쪽 끝 ≤ 화면 폭 */
const btnBox = (p, sel) => p.evaluate((s) => {
  const out = [];
  document.querySelectorAll(s).forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    out.push({ t: (e.textContent || '').trim().slice(0, 28),
      left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top),
      w: Math.round(r.width) });
  });
  return { vw: window.innerWidth, scrollW: document.documentElement.scrollWidth, items: out };
}, sel);

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };
  const res = { print: {}, geo: {} };

  console.log('① 합친 단추 — 네 크기에서 화면 밖으로 안 나간다');
  for (const [w, h] of SIZES) {
    const key = w + 'x' + h;
    const p = await openApp(b, NEW, w, h);
    const r = await btnBox(p, '#admin-content button');
    const out = r.items.filter((x) => x.left < 0 || x.right > r.vw);
    say(out.length === 0, ('[' + key + '] 단추 ' + r.items.length + '개').padEnd(26)
      + '화면 밖 ' + out.length + '개' + (out.length ? ' → ' + JSON.stringify(out[0]) : ''));
    say(r.scrollW <= r.vw, ('[' + key + '] 가로 넘침').padEnd(26)
      + 'scrollWidth ' + r.scrollW + ' ≤ 화면 ' + r.vw);
    /* 합친 단추 둘이 있고 옛 단추가 없다 */
    const names = r.items.map((x) => x.t);
    say(names.some((t) => /기간 거래내역 보기/.test(t)), ('[' + key + '] 기간 단추 하나').padEnd(26)
      + (names.find((t) => /기간 거래내역/.test(t)) || '(없음)'));
    const CARD = '📄 보기 · 인쇄 · 💬 카톡';
    /* 거래처 1 로 걸러 둔 목록이라 매출 카드는 S1·S2 두 장이다 */
    say(names.filter((t) => t === CARD).length === 2, ('[' + key + '] 매출 카드 합친 단추').padEnd(26)
      + names.filter((t) => t === CARD).length + '개 (매출 카드 2장)');
    say(!names.some((t) => /카톡 공유/.test(t) || /인쇄 \/ 📄 PDF/.test(t) || /PDF 출력/.test(t)),
      ('[' + key + '] 옛 단추 0개').padEnd(26) + (names.filter((t) => /카톡 공유|PDF 출력/.test(t)).join(',') || '없음'));
    /* 매출 카드 단추 줄이 몇 줄로 접혔나 (360 숫자 보고) */
    /* 매출 카드 **한 장**의 단추 줄이 몇 줄로 접혔나 (360 에서 접히는 것은 정상) */
    const rows = await p.evaluate(() => {
      const hit = Array.from(document.querySelectorAll('#admin-content button'))
        .find((e) => (e.textContent || '').trim() === '📄 보기 · 인쇄 · 💬 카톡');
      if (!hit) return { btn: 0, rows: 0 };
      const row = hit.parentElement;
      const bs = Array.from(row.querySelectorAll('button'));
      const tops = {}; bs.forEach((e) => { tops[Math.round(e.getBoundingClientRect().top)] = 1; });
      return { btn: bs.length, rows: Object.keys(tops).length,
               names: bs.map((e) => (e.textContent || '').trim()
                 + '(' + Math.round(e.getBoundingClientRect().width) + 'x'
                 + Math.round(e.getBoundingClientRect().height) + ')') };
    });
    res.geo[key] = { btns: r.items.length, scrollW: r.scrollW, vw: r.vw, cardRows: rows };
    console.log('     매출 카드 한 장: 단추 ' + rows.btn + '개 · ' + rows.rows + '줄  ['
      + (rows.names || []).join(' | ') + ']');
    await p.close();
  }

  console.log('\n② 문서 보기 창 — 단추 3개가 화면 안 · 문서가 가로로 안 넘친다');
  for (const [w, h] of SIZES) {
    const key = w + 'x' + h;
    const p = await openApp(b, NEW, w, h);
    await p.evaluate(() => openInvoiceDocView('S1'));
    await p.waitForTimeout(700);
    const v = await p.evaluate(() => {
      const wrap = document.getElementById('docViewWrap');
      const fr = document.getElementById('docViewFrame');
      const bd = document.getElementById('docViewBody');
      const b3 = ['docViewPrintBtn', 'docViewKakaoBtn', 'docViewCloseBtn'].map((id) => {
        const e = document.getElementById(id); const r = e.getBoundingClientRect();
        return { t: e.textContent.trim(), left: Math.round(r.left), right: Math.round(r.right),
                 top: Math.round(r.top), bottom: Math.round(r.bottom) };
      });
      const fb = fr.getBoundingClientRect();
      let sheets = 0, firstTable = 0, docW = 0;
      try {
        const d = fr.contentDocument;
        sheets = d.querySelectorAll('.inv-sheet').length;
        const t = d.querySelector('.inv-items');
        firstTable = t ? Math.round(t.getBoundingClientRect().width) : 0;
        docW = d.documentElement.scrollWidth;
      } catch (e) {}
      return { vw: window.innerWidth, vh: window.innerHeight,
        scrollW: document.documentElement.scrollWidth,
        wrapZ: getComputedStyle(wrap).zIndex,
        btns: b3, frLeft: Math.round(fb.left), frRight: Math.round(fb.right),
        frW: Math.round(fb.width), frH: Math.round(fb.height),
        bodyW: bd.clientWidth, sheets: sheets, firstTable: firstTable, docW: docW,
        scaleW: document.getElementById('docViewScale').getBoundingClientRect().width
      };
    });
    const outB = v.btns.filter((x) => x.left < 0 || x.right > v.vw);
    say(outB.length === 0, ('[' + key + '] 위쪽 단추 3개').padEnd(26)
      + '화면 밖 ' + outB.length + '개 · ' + v.btns.map((x) => x.t).join(' / '));
    say(v.btns.every((x) => x.top >= 0 && x.bottom <= v.vh), ('[' + key + '] 단추가 세로로도 안 넘침').padEnd(26)
      + 'top ' + v.btns[0].top + ' ~ bottom ' + v.btns[2].bottom + ' ≤ ' + v.vh);
    say(v.scrollW <= v.vw, ('[' + key + '] 페이지 가로 스크롤 0').padEnd(26)
      + 'scrollWidth ' + v.scrollW + ' ≤ ' + v.vw);
    say(v.frLeft >= 0 && v.frRight <= v.vw + 1, ('[' + key + '] 문서가 화면 안').padEnd(26)
      + '왼 ' + v.frLeft + ' ~ 오른 ' + v.frRight + ' (화면 ' + v.vw + ')');
    say(Math.round(v.scaleW) <= v.bodyW, ('[' + key + '] 줄인 폭 ≤ 창 폭').padEnd(26)
      + Math.round(v.scaleW) + ' ≤ ' + v.bodyW);
    say(v.sheets === 2, ('[' + key + '] 문서 장 수(공급자/공급받는자)').padEnd(26) + v.sheets);
    say(v.firstTable > 100, ('[' + key + '] 첫 표가 보인다').padEnd(26) + '표 폭 ' + v.firstTable + 'px');
    say(v.wrapZ === '9990', ('[' + key + '] 보기 창 z-index').padEnd(26) + v.wrapZ);

    /* 카톡 확인창이 보기 창 **위**에 뜨는가 — 실제로 그 자리를 짚어 본다 */
    await p.evaluate(() => docViewKakao());
    await p.waitForTimeout(250);
    const k = await p.evaluate(() => {
      const sheet = document.getElementById('invShareSheet');
      const btn = sheet.querySelector('#invShareSendBtn');
      const r = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return { sheetZ: getComputedStyle(sheet).zIndex,
        topIsSheet: !!(hit && sheet.contains(hit)),
        hitId: hit ? (hit.id || hit.tagName) : '(없음)' };
    });
    say(k.topIsSheet, ('[' + key + '] 확인창이 맨 위').padEnd(26)
      + '짚은 것 = ' + k.hitId + ' · z-index ' + k.sheetZ);
    const after = await p.evaluate(() => {
      closeInvoiceShare();
      return { sheet: !!document.getElementById('invShareSheet'),
               view: !!document.getElementById('docViewWrap') };
    });
    say(!after.sheet && after.view, ('[' + key + '] 확인창 닫아도 보기 창 남음').padEnd(26)
      + '확인창 ' + after.sheet + ' · 보기 창 ' + after.view);
    const closed = await p.evaluate(() => { closeDocView(); return !!document.getElementById('docViewWrap'); });
    say(!closed, ('[' + key + '] ✕ 닫기 → 사라짐').padEnd(26) + String(!closed));
    await p.close();
  }

  console.log('\n2-2. 기간 거래내역 보기 창 — 표가 여덟 칸이라 가장 넓다');
  for (const [w, h] of SIZES) {
    const key = w + 'x' + h;
    const p = await openApp(b, NEW, w, h);
    await p.evaluate(() => openRangeDocView());
    await p.waitForTimeout(700);
    const v = await p.evaluate(() => {
      const fr = document.getElementById('docViewFrame');
      const bd = document.getElementById('docViewBody');
      const fb = fr.getBoundingClientRect();
      let cols = 0, tblW = 0, rows = 0, net = '';
      try {
        const d = fr.contentDocument;
        cols = d.querySelectorAll('.range-tbl thead th').length;
        const t = d.querySelector('.range-tbl');
        tblW = t ? Math.round(t.getBoundingClientRect().width) : 0;
        rows = d.querySelectorAll('.range-tbl tbody tr').length;
        const n = d.querySelector('.inv-net');
        net = n ? (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) : '';
      } catch (e) {}
      return { vw: window.innerWidth, scrollW: document.documentElement.scrollWidth,
        frLeft: Math.round(fb.left), frRight: Math.round(fb.right),
        scaleW: Math.round(document.getElementById('docViewScale').getBoundingClientRect().width),
        bodyW: bd.clientWidth, cols: cols, tblW: tblW, rows: rows, net: net,
        summary: ((document.querySelector('#docViewBar span') || {}).textContent || '').trim() };
    });
    say(v.scrollW <= v.vw, ('[' + key + '] 페이지 가로 스크롤 0').padEnd(30) + v.scrollW + ' <= ' + v.vw);
    say(v.frLeft >= 0 && v.frRight <= v.vw + 1, ('[' + key + '] 문서가 화면 안').padEnd(30)
      + '왼 ' + v.frLeft + ' ~ 오른 ' + v.frRight);
    say(v.scaleW <= v.bodyW, ('[' + key + '] 줄인 폭 <= 창 폭').padEnd(30) + v.scaleW + ' <= ' + v.bodyW);
    say(v.cols === 8, ('[' + key + '] 표 칸 8개').padEnd(30) + v.cols + '칸 · 표 폭 ' + v.tblW + 'px');
    say(v.rows >= 4, ('[' + key + '] 거래 줄이 보인다').padEnd(30) + v.rows + '줄');
    say(/순 미수/.test(v.net), ('[' + key + '] 맨 아래 순 미수').padEnd(30) + v.net);
    say(/2026-10 ~ 2026-10 · 4건/.test(v.summary), ('[' + key + '] 위쪽 요약').padEnd(30) + v.summary);
    await p.close();
  }

  console.log('\n③ 🖨 인쇄·PDF → 새 창 1개 · 그 글자가 옛 판과 같은가 (sha256)');
  for (const [tag, file] of [['새 판', NEW], ['옛 판', OLD]]) {
    const p = await openApp(b, file, 1366, 768);
    const got = await p.evaluate((isNew) => {
      /* 새 판은 보기 창을 거쳐, 옛 판은 카드 단추를 바로 (두 길이 같은 함수를 부른다) */
      if (isNew) { openInvoiceDocView('S1'); docViewPrint(); }
      else { printInvoice('S1'); }
      const a = window.__wins.map((w) => w.html);
      window.__wins = [];
      if (isNew) { openRangeDocView(); docViewPrint(); } else { printClientRange(); }
      return { inv: a, rng: window.__wins.map((w) => w.html), alerts: window.__alerts };
    }, file === NEW);
    res.print[tag] = { inv: got.inv, rng: got.rng, alerts: got.alerts };
    say(got.inv.length === 1, ('[' + tag + '] 거래명세서 새 창 1개').padEnd(30) + got.inv.length + '개');
    say(got.rng.length === 1, ('[' + tag + '] 기간 거래내역 새 창 1개').padEnd(30) + got.rng.length + '개');
    say(got.alerts.length === 0, ('[' + tag + '] 알림 0건').padEnd(30) + JSON.stringify(got.alerts));
    await p.close();
  }
  {
    const n = res.print['새 판'], o = res.print['옛 판'];
    say(sha(n.inv[0]) === sha(o.inv[0]), '거래명세서 sha256 같다        ' + sha(n.inv[0]).slice(0, 24)
      + '… (' + n.inv[0].length + '자)');
    say(sha(n.rng[0]) === sha(o.rng[0]), '기간 거래내역 sha256 같다      ' + sha(n.rng[0]).slice(0, 24)
      + '… (' + n.rng[0].length + '자)');
    say(/PDF로 저장: 버튼/.test(n.inv[0]), '새 창에는 회색 막대가 있다     ' + /PDF로 저장: 버튼/.test(n.inv[0]));
    say(n.inv[0].length > 5000 && n.rng[0].length > 3000, '빈 글자가 아니다            '
      + n.inv[0].length + ' / ' + n.rng[0].length);
  }

  console.log('\n④ 수납관리 — 고른 쪽만 (실제 화면)');
  for (const [w, h] of SIZES) {
    const key = w + 'x' + h;
    const p = await openApp(b, NEW, w, h);
    const r = await p.evaluate(() => {
      const out = {};
      const count = (tag) => {
        let n = 0;
        document.querySelectorAll('#admin-content div').forEach((e) => {
          if (e.children.length) return;
          const t = (e.textContent || '').trim();
          if (new RegExp('^.+ ' + tag + ' [0-9,]+$').test(t)) n++;
        });
        return n;
      };
      const draw = (kind, sel) => {
        logiPayKind = kind; logiPayYear = 2026; logiPayMonth = 10; logiCalOpen = true;
        logiPaySelDate = sel || null;
        renderPayment();
        return { sale: count('매출'), pur: count('매입'),
          offset: (document.getElementById('admin-content').innerHTML.match(/상계 순액|상계 완료/g) || []).length,
          scrollW: document.documentElement.scrollWidth };
      };
      out.sale = draw('sale', null);
      out.pur = draw('purchase', null);
      out.sale5 = draw('sale', '2026-10-05');
      out.pur5 = draw('purchase', '2026-10-05');
      out.vw = window.innerWidth;
      return out;
    });
    say(r.sale.pur === 0, ('[' + key + '] 매출 달력에 매입 줄 0').padEnd(30)
      + '매입 ' + r.sale.pur + ' · 매출 ' + r.sale.sale);
    say(r.pur.sale === 0, ('[' + key + '] 매입 달력에 매출 줄 0').padEnd(30)
      + '매출 ' + r.pur.sale + ' · 매입 ' + r.pur.pur);
    say(r.sale5.offset === 0 && r.pur5.offset === 0, ('[' + key + '] 「상계 순액」 글자 0').padEnd(30)
      + r.sale5.offset + ' / ' + r.pur5.offset);
    say(r.sale.scrollW <= r.vw && r.sale5.scrollW <= r.vw, ('[' + key + '] 수납 화면 가로 넘침 0').padEnd(30)
      + r.sale.scrollW + ' ≤ ' + r.vw);
    await p.close();
  }

  await b.close();
  fs.writeFileSync(path.join(__dirname, 'res268.json'), JSON.stringify(
    { geo: res.geo, printLens: { inv: res.print['새 판'].inv[0].length, rng: res.print['새 판'].rng[0].length } }, null, 1));
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 — Firestore 쓰기 0 · 카카오 전송 0 · 실제 새 창 0');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
