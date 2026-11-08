/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v269 — 안드로이드 뒤로가기로 창 닫기. 실제 크롬 3크기(390·360 폰 + 1366 데스크톱).
   ★ 바깥 요청은 전부 막는다(file:// 만) — Firestore·문자·카카오로 나가는 길이 아예 없다.
   ★ 창마다 열고 history.back() 을 눌러 **그 창만** 닫히는지 본다. 열지 못한 창은 숨기지 않고 적는다. */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const APP = '' + COS_ROOT + '/index.html';
const SIZES = [[390, 844], [360, 640], [1366, 768]];

/* 창마다 「어느 화면에서 누가 여나」 — 조사한 결과 그대로 */
const PANELS = [
  { id:'member-modal',        open:"openAddModal()",                      where:'관리자' },
  { id:'share-modal',         open:"showSharePanel()",                    where:'관리자' },
  { id:'pin-checkin-modal',   open:"openPinCheckin()",                    where:'관리자' },
  { id:'confirm-modal',       open:"showConfirmModal(function(){window.__ok=(window.__ok||0)+1;},'정말 지울까요?','삭제')", where:'공용', ask:true },
  { id:'pay-method-modal',    open:"document.getElementById('pay-method-modal').style.display='flex'", where:'관리자', direct:true },
  { id:'demo-tour-overlay',   open:"startDemoTour()",                     where:'둘러보기' },
  { id:'docViewWrap',         open:"openInvoiceDocView('S1')",            where:'관리자' },
  { id:'invShareSheet',       open:"openInvoiceShare('S1')",              where:'관리자' },
  { id:'dateCheckSheet',      open:"openDateCheck()",                     where:'관리자' },
  { id:'staffEditSheet',      open:"openStaffEdit()",                     where:'관리자' },
  { id:'pv-modal',            open:"pvOpen=true; pvYm='2026-10'; renderPayrollView()", where:'관리자' },
  { id:'dlv-modal',           open:"dlvOpen=true; dlvCarId='car1'; dlvYm='2026-10'; renderDriveLogView()", where:'관리자' },
  { id:'sup-modal',           open:"supportOpen=true; renderSupportList()", where:'관리자' },
  { id:'sup-alert-modal',     open:"showSupportAlertModal([{id:'q1',text:'문의',date:'2026-10-01'}])", where:'관리자' },
  { id:'prod-modal',          open:"openProductManager()",                where:'관리자' },
  { id:'settle-modal',        open:"openSettlement()",                    where:'관리자' },
  { id:'receipt-modal',       open:"openReceiptModal()",                  where:'관리자' },
  { id:'prn-guide',           open:"openPrinterGuide()",                  where:'관리자' },
  { id:'cert-modal',          open:"openCertIssueModal()",                where:'관리자' },
  { id:'cert-preview',        open:"openCertIssueModal(); previewCertificate()", where:'관리자' },
  { id:'enroll-modal',        open:"openEnrollModal()",                   where:'관리자' },
  { id:'payreport-modal',     open:"payReportYm='2026-10'; renderPayReportModal()", where:'관리자' },
  { id:'carlog-modal',        open:"renderCarlogModal()",                 where:'관리자' },
  { id:'dcarlog-modal',       open:"renderDriverCarlog()",                where:'기사' },
  { id:'bc-modal',            open:"openBarcodeScan()",                   where:'관리자' },
  { id:'signup-modal',        open:"openSignupModal()",                   where:'로그인 전' },
  { id:'pwr-modal',           open:"openPwResetSheet()",                  where:'로그인 전' },
  { id:'pwchg-modal',         open:"openPwChangeModal()",                 where:'관리자' },
  { id:'wd-modal',            open:"openWithdrawModal()",                 where:'관리자' },
  { id:'mcp-modal',           open:"masterChangePhoneAsk('UID9','가온업체','010-1111-2222')", where:'마스터' },
  { id:'install-guide-modal', open:"showInstallGuide()",                  where:'로그인 전' },
  { id:'helper-modal',        open:"openHelperChat()",                    where:'공용' }
];

const SEED = {
  members: [{ id:1, name:'주식회사 가나다물류', bizNo:'635-88-02710', ceo:'문준식',
    location:'인천 연수구 용담로 111', phone:'010-1111-1111', courseId:'c1', carId:'car1',
    days:['월','화','수','목','금'], pin:'1001', on:true, regfee:150000, monthly:130000 }],
  cars: [{ id:'car1', name:'1호차', driver:'박기사', hourlyWage:10030, mealAllow:200000, taxMode:'free33', commuteKm:20 }],
  courses: [{ id:'c1', name:'A반', depart:'15:00' }],
  staff: [{ id:'s1', name:'김직원', phone:'010-3333-3333', wage:10030 }],
  org: { name:'프리존물류', bizNo:'635-88-02710', ceo:'문준식', address:'인천 연수구 용담로 111',
         bankAccount:'기업 123-456789-01-011', bizCat:'운수', bizItem:'화물운송' },
  invoices: [{ id:'S1', kind:'sale', date:'2026-10-05', createdAt:1, memberId:1,
    memberName:'주식회사 가나다물류',
    items:[{ name:'박스 대', spec:'', unit:'EA', qty:10, price:12000 }],
    supply:120000, vat:12000, total:132000, payments:[] }]
};

async function app(b, w, h) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  /* ★ 바깥 요청을 일부러 막았으니 「net::ERR_FAILED」는 **검사 환경 소리**다 — 앱 오류가 아니다 */
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    /* file:// 에서 돌리면 version.json 읽기가 CORS 로 막힌다 — 이것도 검사 환경 소리다 */
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    errs.push('console: ' + t.slice(0, 140));
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + APP, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !!window.__back, {}, { timeout: 20000 });
  await p.evaluate((seed) => {
    window.__alerts = []; window.alert = (m) => window.__alerts.push(String(m));
    window.confirm = () => true; window.prompt = () => null;
    window.__wins = [];
    window.open = function () { const w = { document:{ write(){}, close(){} }, print(){}, close(){}, focus(){} };
      window.__wins.push(w); return w; };
    /* 로그인·카메라 흉내 — 이것을 안 해 주면 세 창(pwchg·wd·bc)이 열리지 않아 시험을 못 한다.
       ★ 실제 로그인·실제 카메라를 쓰는 것이 아니다(바깥으로 나가는 요청은 전부 막혀 있다). */
    window._auth = { currentUser: { uid:'UID1', email:'me@example.com', isAnonymous:false,
                                    getIdToken: () => Promise.resolve('TOK') } };
    window._userUid = 'UID1';
    if (!('BarcodeDetector' in window)) {
      window.BarcodeDetector = function(){ this.detect = () => Promise.resolve([]); };
    }
    if (!navigator.mediaDevices) {
      try { Object.defineProperty(navigator, 'mediaDevices',
        { value: { getUserMedia: () => Promise.reject(new Error('카메라 없음')) } }); } catch (e) {}
    }
    try { window._userBizType = 'logistics'; } catch (e) {}
    try { DEFAULT_BIZ_TYPE = 'logistics'; _userBizType = 'logistics'; } catch (e) {}
    localStorage.setItem('tkd_members', JSON.stringify(seed.members));
    localStorage.setItem('tkd_cars', JSON.stringify(seed.cars));
    localStorage.setItem('tkd_courses', JSON.stringify(seed.courses));
    localStorage.setItem('tkd_staff', JSON.stringify(seed.staff));
    localStorage.setItem('tkd_org', JSON.stringify(seed.org));
    localStorage.setItem('tkd_invoices', JSON.stringify(seed.invoices));
    localStorage.setItem('tkd_products', '[]');
    try { members = loadMembers(); } catch (e) {}
    try { cars = loadCars(); } catch (e) {}
    try { courses = loadCourses(); } catch (e) {}
    try { orgSettings = loadOrgSettings(); } catch (e) {}
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    const ad = document.getElementById('admin-screen'); if (ad) ad.classList.add('show');
  }, SEED);
  p.__errs = errs;
  return p;
}
const st = (p) => p.evaluate(() => ({
  open: window.__back.open(), depth: window.__back.depth(),
  hlen: history.length, href: location.href
}));

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };
  const table = {};

  console.log('① 창마다: 열기 → history.back() → 그 창만 닫히나 (390×844)');
  {
    /* ★ 창마다 **새 쪽**에서 한다 — 닫히지 않는 창이 하나라도 있으면 뒤로가기를 되풀이하다
       페이지를 떠나 버려 뒷 검사가 전부 무너진다(처음에 그렇게 깨졌다). */
    for (const q of PANELS) {
      const p = await app(b, 390, 844);
      const before = await st(p);
      const opened = await p.evaluate((q) => {
        window.__alerts = [];
        try { eval(q.open); } catch (e) { return { err: String(e && e.message) }; }
        return { err: null };
      }, q);
      await p.waitForTimeout(160);
      const mid = await st(p);
      if (!mid.open.includes(q.id)) {
        table[q.id] = { where: q.where, opened: false,
          why: (opened.err || (await p.evaluate(() => window.__alerts.join('|'))) || '열리지 않음') };
        console.log('  - ' + q.id.padEnd(20) + '열지 못함 — ' + table[q.id].why.slice(0, 70));
        await p.close();
        continue;
      }
      const depthUp = mid.depth - before.depth;
      await p.evaluate(() => history.back());
      await p.waitForTimeout(260);
      const after = await st(p);
      /* 「그 창만」의 뜻 = 열려 있던 것들 중 그 창이 빠지고, **새로 생긴 창이 없다**.
         ★ 단, 앱이 원래 「닫으면 앞 창으로 돌아가는」 창이 있다(차계부 → 운행기록부).
           그건 그 창의 자기 닫기 동작이라 그대로 두고, 표에 적는다. */
      const gone = mid.open.filter((x) => !after.open.includes(x));
      const born = after.open.filter((x) => !mid.open.includes(x));
      const onlyThis = gone.length === 1 && gone[0] === q.id;
      table[q.id] = { where: q.where, opened: true, depthUp: depthUp,
        closed: !after.open.includes(q.id), onlyThis: onlyThis, born: born,
        depth: after.depth, left: after.open };
      say(onlyThis,
        q.id.padEnd(20) + '열림 → 뒤로 → 닫힘 ' + (!after.open.includes(q.id))
        + ' · 그 창만 ' + onlyThis
        + (born.length ? ' · 앱이 되돌린 창 ' + JSON.stringify(born) : '')
        + ' · 칸 ' + depthUp + '→' + after.depth
        + (onlyThis ? '' : '   [열림 ' + JSON.stringify(mid.open) + ' 후 ' + JSON.stringify(after.open) + ']'));
      if (q.ask) say((await p.evaluate(() => window.__ok || 0)) === 0,
        '   ↳ 확인창 뒤로 = 취소 (확인 콜백 호출 ' + (await p.evaluate(() => window.__ok || 0)) + '회)');
      if (p.__errs.length) say(false, '   ↳ ' + q.id + ' 오류: ' + p.__errs[0]);
      await p.close();
    }
  }

  console.log('\n② 겹친 창 — 문서 보기 위에 카톡 확인창');
  for (const [w, h] of SIZES) {
    const p = await app(b, w, h);
    const r = await p.evaluate(async () => {
      const out = {};
      openInvoiceDocView('S1');
      await new Promise((r) => setTimeout(r, 120));
      out.a = window.__back.open().slice();
      docViewKakao();
      await new Promise((r) => setTimeout(r, 120));
      out.b = window.__back.open().slice();
      out.depth2 = window.__back.depth();
      history.back();
      await new Promise((r) => setTimeout(r, 260));
      out.c = window.__back.open().slice();
      history.back();
      await new Promise((r) => setTimeout(r, 260));
      out.d = window.__back.open().slice();
      out.depth0 = window.__back.depth();
      return out;
    });
    say(r.a.join() === 'docViewWrap' && r.b.sort().join() === ['docViewWrap','invShareSheet'].sort().join()
      && r.c.join() === 'docViewWrap' && r.d.length === 0 && r.depth0 === 0,
      ('[' + w + 'x' + h + ']').padEnd(12) + '열림 ' + JSON.stringify(r.b)
      + ' → 뒤로 ' + JSON.stringify(r.c) + ' → 뒤로 ' + JSON.stringify(r.d)
      + ' · 칸 ' + r.depth2 + '→' + r.depth0);
    say(p.__errs.length === 0, ('[' + w + 'x' + h + '] 오류 0건').padEnd(24)
      + (p.__errs.length ? p.__errs[0] : 'OK'));
    await p.close();
  }

  console.log('\n③ 확인창 뒤로가기 = 취소 (저장·삭제가 절대 안 불린다)');
  for (const [w, h] of SIZES) {
    const p = await app(b, w, h);
    const r = await p.evaluate(async () => {
      window.__ok = 0;
      showConfirmModal(function(){ window.__ok++; }, '정말 지울까요?', '삭제');
      await new Promise((r) => setTimeout(r, 120));
      const opened = window.__back.open().slice();
      history.back();
      await new Promise((r) => setTimeout(r, 260));
      const after = window.__back.open().slice();
      /* 대조 — 「삭제」를 누르면 콜백이 불린다(검사가 셀 수 있음을 보인다) */
      showConfirmModal(function(){ window.__ok += 10; }, '정말 지울까요?', '삭제');
      await new Promise((r) => setTimeout(r, 120));
      document.getElementById('confirm-ok-btn').click();
      await new Promise((r) => setTimeout(r, 200));
      return { opened: opened, after: after, ok: window.__ok, depth: window.__back.depth() };
    });
    say(r.opened.join() === 'confirm-modal' && r.after.length === 0 && r.ok === 10,
      ('[' + w + 'x' + h + ']').padEnd(12) + '뒤로 → 닫힘 ' + (r.after.length === 0)
      + ' · 뒤로는 콜백 0회 · (대조) 삭제 누르면 1회 → 셈 ' + r.ok);
    await p.close();
  }

  console.log('\n4. ✕ 로 10번 닫아도 history 가 쌓이지 않는다');
  /* ★ pushState 로 넣은 칸을 history.go(-1) 로 되돌리면 브라우저는 그 칸을 **앞쪽에 남겨** 둔다
     (뒤로 간다고 목록이 잘리지 않는다 — 다음 push 가 그 자리를 덮는다).
     그래서 length 는 **처음 한 번만 +1** 이고 그 뒤로는 몇 번을 여닫아도 그대로다.
     중요한 것은 「쌓이지 않는다」이고, 1번째와 10번째를 맞대 확인한다. */
  for (const [w, h] of SIZES) {
    const p = await app(b, w, h);
    const r = await p.evaluate(async () => {
      const cycle = async () => {
        openInvoiceDocView('S1');
        await new Promise((r) => setTimeout(r, 90));
        closeDocView();
        await new Promise((r) => setTimeout(r, 170));
      };
      const h0 = history.length;
      await cycle();
      const h1 = history.length;
      for (let i = 0; i < 9; i++) await cycle();
      return { h0: h0, h1: h1, h10: history.length,
               depth: window.__back.depth(), open: window.__back.open().length };
    });
    say(r.h10 === r.h1 && (r.h1 - r.h0) <= 1 && r.depth === 0 && r.open === 0,
      ('[' + w + 'x' + h + ']').padEnd(12) + 'history ' + r.h0 + ' → 1번 뒤 ' + r.h1
      + ' → 10번 뒤 ' + r.h10 + ' (10번 하는 동안 쌓인 칸 ' + (r.h10 - r.h1) + ') · 넣어 둔 칸 ' + r.depth);
    await p.close();
  }

  console.log('\n4-2. 창이 없을 때 뒤로 = 페이지를 떠난다 (지금과 같음)');
  for (const [w, h] of SIZES) {
    const p = await app(b, w, h);
    await p.evaluate(async () => {
      openInvoiceDocView('S1');
      await new Promise((r) => setTimeout(r, 90));
      closeDocView();
      await new Promise((r) => setTimeout(r, 170));
    });
    let left = false;
    try {
      await p.evaluate(() => { history.back(); setTimeout(() => { history.back(); }, 120); });
      await p.waitForTimeout(800);
      const href = await p.evaluate(() => location.href);
      left = !/index\.html/.test(href);
    } catch (e) { left = true; }   /* 문맥이 날아갔다 = 페이지를 떠났다 */
    say(left, ('[' + w + 'x' + h + ']').padEnd(12) + '창 없이 뒤로 → 페이지를 떠남 ' + left);
    try { await p.close(); } catch (e) {}
  }

  console.log('\n⑤ 새로고침 — 창이 저절로 열리지 않고 오류 0');
  for (const [w, h] of SIZES) {
    const p = await app(b, w, h);
    await p.evaluate(async () => { openInvoiceDocView('S1'); await new Promise((r) => setTimeout(r, 120)); });
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => !!window.__back, {}, { timeout: 20000 });
    await p.waitForTimeout(400);
    const r = await st(p);
    say(r.open.length === 0 && r.depth === 0,
      ('[' + w + 'x' + h + ']').padEnd(12) + '새로고침 뒤 열린 창 ' + r.open.length
      + '개 · 칸 ' + r.depth + ' · 주소 ' + (/index\.html$/.test(r.href) ? '그대로' : r.href));
    say(p.__errs.length === 0, ('[' + w + 'x' + h + '] 오류 0건').padEnd(24)
      + (p.__errs.length ? p.__errs[0] : 'OK'));
    await p.close();
  }

  console.log('\n⑥ 화면별로 최소 한 개씩 확인됐나');
  {
    const byWhere = {};
    Object.keys(table).forEach((id) => {
      const t = table[id];
      byWhere[t.where] = byWhere[t.where] || { ok: [], no: [] };
      (t.opened && t.onlyThis ? byWhere[t.where].ok : byWhere[t.where].no).push(id);
    });
    ['관리자', '기사', '마스터', '로그인 전', '공용', '둘러보기'].forEach((k) => {
      const v = byWhere[k] || { ok: [], no: [] };
      say(v.ok.length >= 1, k.padEnd(8) + '통과 ' + v.ok.length + '개'
        + (v.no.length ? ' · 열지 못함 ' + v.no.length + '개 (' + v.no.join(',') + ')' : ''));
    });
  }

  /* ★ v270: 안 쓰는 「미납 알림 미리보기」 창을 지워 목록이 33 -> 32 가 됐다.
     이 검사는 숫자를 못 박지 않고 **소스와 맞대어** 세므로 그대로 둔다. */
  console.log('\n⑦ 목록에 빠진 창이 없나 — 소스의 덮개 id 전수와 맞댄다');
  {
    const p = await app(b, 390, 844);
    const reg = await p.evaluate(() => ({ ids: window.__back.ids, skip: Object.keys(window.__back.skip) }));
    const src = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
    const found = new Set();
    let m;
    const re1 = /id=['"]([A-Za-z0-9_-]+)['"][^>]{0,400}?position:fixed;inset:0/g;
    while ((m = re1.exec(src))) found.add(m[1]);
    const re2 = /\.id\s*=\s*['"]([A-Za-z0-9_-]+)['"];[\s\S]{0,300}?position:fixed;inset:0/g;
    while ((m = re2.exec(src))) found.add(m[1]);
    const re3 = /class="modal-bg"\s+id="([A-Za-z0-9_-]+)"/g;
    while ((m = re3.exec(src))) found.add(m[1]);
    const known = new Set(reg.ids.concat(reg.skip));
    const miss = [...found].filter((id) => !known.has(id));
    say(miss.length === 0, '소스 덮개 ' + found.size + '개 · 목록 ' + reg.ids.length
      + '개 + 일부러 뺀 것 ' + reg.skip.length + '개 · 빠진 것 ' + miss.length
      + (miss.length ? ' → ' + miss.join(',') : ''));
    say(reg.ids.filter((id) => !src.includes(id)).length === 0,
      '목록에 없는 id 를 적어 두지 않았나  ' + (reg.ids.filter((id) => !src.includes(id)).join(',') || '없음'));
    await p.close();
  }

  await b.close();
  fs.writeFileSync(path.join(__dirname, 'res269.json'), JSON.stringify(table, null, 1));
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  console.log('※ 바깥 요청 전부 차단 — Firestore 쓰기 0 · 문자 0 · 카카오 0 · 실제 새 창 0');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
