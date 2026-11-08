/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v268 앱 검사 — ① 문서 보기 창 + 단추 합치기 ② 수납관리(물류) 매출·매입 분리
   전: 0322876 (v267) · 후: 작업 중
   ★ 가장 중요한 것 — **새 창에 들어가는 문서 HTML 이 v267 과 글자 하나 다르지 않은가**
     (문서 만드는 코드를 함수로 떼어 냈으므로, 떼어 내다 한 글자라도 틀리면 여기서 걸린다)
   ★ 실제 Firestore 쓰기·카카오 전송 0 — env246 의 가짜 Firestore·가짜 Kakao 를 쓴다. */
const fs = require('fs');
const cp = require('child_process');
const crypto = require('crypto');
/* ★ v272 보정1: 이 묶음은 **v268 회차 기록**이다 — 「새」쪽을 그 회차 커밋에 고정한다.
   전에는 작업트리(지금 코드)를 보았다. 그래서 뒤 회차가 쌓일 때마다 거짓으로 실패했다
   (v272 가 규칙을 고치자 「firestore.rules 무변경」이 깨졌다 — v268 이 건드린 게 아니다).
   ★ env246 은 **require 할 때** COS_SRC_NEW 를 읽는다 → 그 전에 넣어야 한다. */
const NEW_REF = process.env.COS_SRC_NEW_REF || 'c221090';   /* v268 */
if (!process.env.COS_SRC_NEW) {
  const f = require('path').join(__dirname, 'pin268_index.html');
  require('fs').writeFileSync(f, cp.execSync(
    'git -C ' + COS_ROOT + ' show ' + NEW_REF + ':index.html', { maxBuffer: 1 << 28 }));
  process.env.COS_SRC_NEW = f;
}
const E = require('./env246.js');

const OLD_REF = process.env.COS_SRC_OLD_REF || '0322876';
const NEW = E.SRC_NEW;
const OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const SUF = '__cosroad_default';
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 64)
    + (ok ? '' : '   (기대 ' + String(want).slice(0, 40) + ')'));
};

/* ── 스텁 자료 — **매출·매입이 같은 날·같은 거래처에 섞인** 자료를 일부러 넣는다 ── */
const MEMBERS = [
  { id: 1, name: '주식회사 가나다물류', bizNo: '635-88-02710', ceo: '문준식',
    location: '인천광역시 연수구 용담로 111번길 22', phone: '010-1111-1111',
    bizCat: '도매', bizItem: '생활용품', on: true },
  { id: 2, name: '나라상사', bizNo: '123-45-67890', ceo: '김대표',
    location: '서울시 강남구 테헤란로 1', phone: '010-2222-2222', on: true }
];
const ORG = { name: '프리존물류', bizNo: '635-88-02710', ceo: '문준식',
  address: '인천광역시 연수구 용담로 111, 6537호', bizCat: '운수', bizItem: '화물운송',
  bankAccount: '기업 123-456789-01-011' };
const IT = (n, q, p) => ({ name: n, spec: '', unit: 'EA', qty: q, price: p });
const INVOICES = [
  /* 같은 날(10-05) 같은 거래처에 매출 1건 + 매입 1건 — 섞임을 잡는 자료 */
  { id: 'S1', kind: 'sale', date: '2026-10-05', createdAt: 1, memberId: 1, memberName: '주식회사 가나다물류',
    items: [IT('친환경 무세제 세탁볼 대용량 리필세트 12입', 10, 12000), IT('초극세사 걸레 청소포 100매입', 5, 8000)],
    supply: 160000, vat: 16000, total: 176000, payments: [{ date: '2026-10-07', method: '계좌이체', amount: 50000 }] },
  { id: 'P1', kind: 'purchase', date: '2026-10-05', createdAt: 2, memberId: 1, memberName: '주식회사 가나다물류',
    items: [IT('포장 테이프 48mm', 100, 900)], supply: 90000, vat: 9000, total: 99000, payments: [] },
  { id: 'S2', kind: 'sale', date: '2026-10-12', createdAt: 3, memberId: 1, memberName: '주식회사 가나다물류',
    items: [IT('박스 대', 200, 700)], supply: 140000, vat: 14000, total: 154000, payments: [] },
  { id: 'P2', kind: 'purchase', date: '2026-10-20', createdAt: 4, memberId: 1, memberName: '주식회사 가나다물류',
    items: [IT('노끈', 50, 500)], supply: 25000, vat: 2500, total: 27500, payments: [] },
  { id: 'S3', kind: 'sale', date: '2026-10-22', createdAt: 5, memberId: 2, memberName: '나라상사',
    items: [IT('완충재', 30, 1500)], supply: 45000, vat: 4500, total: 49500, payments: [] }
];
function storeOf() {
  const s = {};
  const put = (k, v) => { s[k + SUF] = JSON.stringify(v); };
  put('tkd_members', MEMBERS); put('tkd_invoices', INVOICES); put('tkd_org', ORG);
  put('tkd_cars', []); put('tkd_courses', []); put('tkd_staff', []);
  put('tkd_products', []); put('tkd_payments', {}); put('tkd_tax', {});
  return s;
}

/* 앱을 올리고, 새 창(window.open)에 쓰는 글자를 모은다 */
function stage(src) {
  const R = E.build({ src: src, biz: 'logistics', localStorage: storeOf() });
  if (R.error) throw R.error;
  ['admin-content', 'app-content'].forEach((id) => {
    const el = E.makeEl('div'); el.id = id;
    el.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
    R.document.registerId(id, el);
  });
  const wins = [];
  const fakeOpen = function () {
    const w = { html: '', closed: false,
      document: { write(h){ w.html += String(h); }, close(){ w.closed = true; } },
      print(){}, close(){} };
    wins.push(w);
    return w;
  };
  R.sandbox.open = fakeOpen; R.win.open = fakeOpen;
  R.wins = wins;
  return R;
}

/* ══ ① 새 창 문서 HTML — v267 과 글자 하나 다르지 않은가 ═══════════════ */
console.log('① 새 창 문서 HTML 동일 증명 (가장 중요)');
{
  const A = stage(OLD), B = stage(NEW);
  /* 거래명세서 한 건 */
  A.ev("printInvoice('S1')"); B.ev("printInvoice('S1')");
  ck('거래명세서 — 새 창 1개씩 열렸다', A.wins.length + '/' + B.wins.length, '1/1');
  const a1 = A.wins[0].html, b1 = B.wins[0].html;
  ck('  글자 수가 같다', b1.length + ' / ' + a1.length, a1.length + ' / ' + a1.length);
  ck('  sha256 이 같다', sha(b1) === sha(a1), true);
  console.log('     sha256 = ' + sha(b1).slice(0, 32) + '…  (' + b1.length + '자)');
  ck('  (대조) 빈 글자가 아니다', b1.length > 5000, true);
  ck('  문서가 닫혔다(document.close)', B.wins[0].closed, true);

  /* 기간 거래내역 */
  const setR = (R) => { R.ev("clientRangeMemberId='1'; clientRangeStart='2026-10'; clientRangeEnd='2026-10';"); };
  setR(A); setR(B);
  A.ev('printClientRange()'); B.ev('printClientRange()');
  ck('기간 거래내역 — 새 창 2개씩', A.wins.length + '/' + B.wins.length, '2/2');
  const a2 = A.wins[1].html, b2 = B.wins[1].html;
  ck('  글자 수가 같다', b2.length + ' / ' + a2.length, a2.length + ' / ' + a2.length);
  ck('  sha256 이 같다', sha(b2) === sha(a2), true);
  console.log('     sha256 = ' + sha(b2).slice(0, 32) + '…  (' + b2.length + '자)');
  ck('  (대조) 빈 글자가 아니다', b2.length > 3000, true);
  ck('  기간 문서 내용 그대로 — 매출 미수', /매출 미수 :/.test(b2), true);
  ck('  기간 문서 내용 그대로 — 매입 미지급', /매입 미지급 :/.test(b2), true);
  ck('  기간 문서 내용 그대로 — 순 미수', /순 미수 :/.test(b2), true);
  ck('  매출·매입 둘 다 들어 있다', /<td class="ctr">매출<\/td>/.test(b2) && /<td class="ctr">매입<\/td>/.test(b2), true);

  /* 알림 0건 — 정상 흐름에서는 경고가 안 뜬다 */
  ck('알림(alert) 0건', B.alerts.length, 0);
  ck('실제 Firestore 쓰기 0건', B.savedAll.length, 0);
  ck('카카오 전송 0건', B.kakaoCalls.length, 0);
}

/* ══ ② 보기 창 — 새 창과 같은 문서, 회색 막대만 뺀다 ═════════════════ */
console.log('\n② 앱 안 보기 창 (iframe srcdoc)');
{
  const B = stage(NEW);
  B.ev("openInvoiceDocView('S1')");
  ck('보기 창이 열렸다', !!B.byId['docViewWrap'], true);
  ck('  새 창은 안 열렸다', B.wins.length, 0);
  const wrap = B.byId['docViewWrap'];
  ck('  z-index 9990 (카톡창 10000 보다 아래)', /z-index:9990;/.test(wrap.style.cssText), true);
  ck('  화면 전체를 덮는다', /position:fixed;inset:0/.test(wrap.style.cssText), true);
  const bar = B.byId['docViewBar'] || null;
  const h = wrap.innerHTML;
  ck('  🖨 인쇄·PDF 단추', /id="docViewPrintBtn"[\s\S]*?🖨 인쇄·PDF/.test(h), true);
  ck('  💬 카톡 보내기 단추', /id="docViewKakaoBtn"[\s\S]*?💬 카톡 보내기/.test(h), true);
  ck('  ✕ 닫기 단추', /id="docViewCloseBtn"[\s\S]*?✕ 닫기/.test(h), true);
  ck('  요약 한 줄에 거래처·일자·건수', /주식회사 가나다물류 · 2026-10-05 · 품목 2건/.test(h), true);
  ck('  줄바꿈 keep-all', /word-break:keep-all/.test(h), true);
  /* 문서 알맹이 — 스텁에는 진짜 iframe 이 없으므로 _docView.html 을 본다.
     진짜 iframe 의 폭·높이·가로 넘침은 pw262/run268.js 가 **실제 크롬**에서 잰다. */
  const doc = B.ev('(_docView && _docView.html) || ""');
  ck('  문서가 보기 창에 들어갔다', doc.length > 5000, true);
  ck('  iframe 을 만든다 (소스)', /createElement\('iframe'\)/.test(NEW), true);
  ck('  srcdoc 을 자리값으로 넣는다', /fr\.srcdoc = opts\.html/.test(NEW), true);
  ck('  위쪽 회색 막대(no-print)는 없다', /cos-topbar|PDF로 저장: 버튼/.test(doc), false);
  ck('  빈칸(spacer)도 없다', /height:48px/.test(doc), false);
  ck('  글자 맞춤 스크립트는 있다', /beforeprint/.test(doc), true);
  /* 새 창 문서와 **본문·CSS 가 같은지** — 막대·빈칸만 빠졌는지 */
  B.ev("printInvoice('S1')");
  const win = B.wins[0].html;
  const strip = (s) => s.replace(/<div class="no-print"[\s\S]*?<\/div>\s*/, '')
                        .replace(/<div class="no-print" style="height:48px;"><\/div>/, '');
  ck('  새 창 본문(inv-page)이 보기 창에도 그대로',
     doc.indexOf(win.slice(win.indexOf('<div class="inv-page">'), win.indexOf('<script>'))) >= 0, true);
  /* 카톡·인쇄 단추가 지금 함수를 그대로 부른다 */
  ck('docViewPrint → printInvoice 를 부른다', (function(){
      const n = B.wins.length; B.ev('docViewPrint()'); return B.wins.length - n; })(), 1);
  ck('docViewKakao → 카톡 확인창이 뜬다', (function(){
      B.ev('docViewKakao()'); return !!B.byId['invShareSheet']; })(), true);
  ck('  확인창이 보기 창보다 위(z-index 10000 > 9990)',
     /z-index:10000;/.test((B.byId['invShareSheet'] || { style:{ cssText:'' } }).style.cssText), true);
  ck('  확인창을 닫아도 보기 창은 남는다', (function(){
      B.ev('closeInvoiceShare()');
      return !B.byId['invShareSheet'] && !!B.byId['docViewWrap']; })(), true);
  ck('  ✕ 닫기 → 보기 창이 사라진다', (function(){
      B.ev('closeDocView()'); return !B.byId['docViewWrap']; })(), true);
}

/* ══ ③ 기간 거래내역 보기 창 — 검사 문구·순서가 옛 판과 같은가 ═══════ */
console.log('\n③ 기간 거래내역 — 검사 문구·순서');
{
  const cases = [
    ['거래처 안 고름', "clientRangeMemberId=''; clientRangeStart='2026-10'; clientRangeEnd='2026-10';", '거래처를 선택하세요.'],
    ['월 안 고름',    "clientRangeMemberId='1'; clientRangeStart=''; clientRangeEnd='';",               '시작 월과 끝 월을 선택하세요.'],
    ['그 기간 0건',   "clientRangeMemberId='2'; clientRangeStart='2026-01'; clientRangeEnd='2026-01';", '선택한 거래처의 해당 기간에 거래내역이 없습니다.']
  ];
  cases.forEach(function (c) {
    const A = stage(OLD), B = stage(NEW);
    A.ev(c[1]); B.ev(c[1]);
    A.ev('printClientRange()');          /* 옛 판: 같은 칸의 PDF 단추 */
    B.ev('openRangeDocView()');          /* 새 판: 합친 단추 */
    ck(c[0] + ' — 문구가 옛 판과 같다', B.alerts.join('|'), A.alerts.join('|'));
    ck('  그 문구', (B.alerts[0] || ''), c[2]);
    ck('  보기 창이 안 열린다', !!B.byId['docViewWrap'], false);
    ck('  새 창도 안 열린다', B.wins.length, 0);
  });
  /* 제대로 고르면 열린다 */
  const B = stage(NEW);
  B.ev("clientRangeMemberId='1'; clientRangeStart='2026-10'; clientRangeEnd='2026-10';");
  B.ev('openRangeDocView()');
  ck('제대로 고르면 보기 창이 열린다', !!B.byId['docViewWrap'], true);
  ck('  요약에 거래처·기간·건수', /주식회사 가나다물류 · 2026-10 ~ 2026-10 · 4건/.test(B.byId['docViewWrap'].innerHTML), true);
  ck('  알림 0건', B.alerts.length, 0);
  ck('  카톡 전송 0건', B.kakaoCalls.length, 0);
}

/* ══ ④ 단추 합치기 ═══════════════════════════════════════════════════ */
console.log('\n④ 단추 합치기');
{
  const A = stage(OLD), B = stage(NEW);
  A.ev("clientRangeMemberId=''; renderInvoice();");
  B.ev("clientRangeMemberId=''; renderInvoice();");
  const ah = A.byId['admin-content'].innerHTML, bh = B.byId['admin-content'].innerHTML;
  /* 기간 칸 */
  ck('[옛] 기간 칸 단추 2개', (ah.match(/printClientRange\(\)|openRangeShare\(\)/g) || []).length, 2);
  ck('[새] 기간 칸 단추 1개', (bh.match(/openRangeDocView\(\)/g) || []).length, 1);
  ck('  옛 단추 둘은 화면에 없다', /printClientRange\(\)|openRangeShare\(\)/.test(bh), false);
  ck('  이름', /📄 기간 거래내역 보기 · 인쇄 · 💬 카톡/.test(bh), true);
  ck('  칸 제목에서 PDF 를 뺐다', /📄 거래처별 기간 거래내역<\/div>/.test(bh), true);
  ck('  아래 안내 한 줄도 새 흐름', /문서를 보면서 「🖨 인쇄·PDF」나 「💬 카톡 보내기」/.test(bh), true);
  /* 매출 카드 */
  const nOldSale = (ah.match(/printInvoice\('S1'\)/g) || []).length
                 + (ah.match(/openInvoiceShare\('S1'\)/g) || []).length;
  ck('[옛] 매출 카드에 인쇄+카톡 두 단추', nOldSale, 2);
  ck('[새] 매출 카드에 합친 단추 1개', (bh.match(/openInvoiceDocView\('S1'\)/g) || []).length, 1);
  ck('  이름', /📄 보기 · 인쇄 · 💬 카톡/.test(bh), true);
  ck('  영수증 단추는 그대로', (bh.match(/receiptPrintInvoice\('S1'\)/g) || []).length, 1);
  ck('  수정·삭제도 그대로', (bh.match(/startEditInvoice\('S1'\)/g) || []).length + '/'
     + (bh.match(/deleteInvoice\('S1'\)/g) || []).length, '1/1');
  /* 매입 카드는 손대지 않았다 */
  ck('매입 카드 — 보기 단추 없음(옛 판과 같다)',
     /openInvoiceDocView\('P1'\)/.test(bh), false);
  ck('  (대조) 옛 판도 매입엔 인쇄 단추가 없었다', /printInvoice\('P1'\)/.test(ah), false);
  ck('  매입 카드 수정·삭제는 있다', /startEditInvoice\('P1'\)/.test(bh) && /deleteInvoice\('P1'\)/.test(bh), true);
}

/* ══ ⑤ 수납관리(물류) — 매출·매입 분리 ═══════════════════════════════ */
console.log('\n⑤ 수납관리 — 고른 쪽만 보인다');
{
  function payHtml(R, kind, selDate) {
    R.ev('logiPayKind=' + JSON.stringify(kind) + '; logiPayYear=2026; logiPayMonth=10; logiCalOpen=true; logiPaySelDate='
         + (selDate ? JSON.stringify(selDate) : 'null') + ';');
    R.ev('renderPayment()');
    return R.byId['admin-content'].innerHTML;
  }
  /* 달력 — 달력 한 칸에 거래가 「거래처 매출 176,000」 꼴로 한 줄씩 찍힌다.
     그 줄만 세면 「다른 종류가 섞였나」를 정확히 볼 수 있다. */
  const A = stage(OLD), B = stage(NEW);
  const calLines = (h, tag) =>
    (h.match(new RegExp('line-height:1\\.3;white-space:nowrap[^>]*>[^<]*? ' + tag + ' [0-9,]+<', 'g')) || []).length;
  const aSale = payHtml(A, 'sale', null), bSale = payHtml(B, 'sale', null);
  const aPur  = payHtml(A, 'purchase', null), bPur = payHtml(B, 'purchase', null);
  ck('[옛] 매출 달력에 매입 줄이 섞였다', calLines(aSale, '매입'), 2);
  ck('[새] 매출 달력에 매입 줄 0', calLines(bSale, '매입'), 0);
  ck('  매출 줄은 그대로 3개', calLines(bSale, '매출'), calLines(aSale, '매출'));
  ck('[옛] 매입 달력에 매출 줄이 섞였다', calLines(aPur, '매출'), 3);
  ck('[새] 매입 달력에 매출 줄 0', calLines(bPur, '매출'), 0);
  ck('  매입 줄은 그대로 2개', calLines(bPur, '매입'), calLines(aPur, '매입'));

  /* 날짜 목록 — 10-05 를 고르면 */
  const bSale5 = payHtml(B, 'sale', '2026-10-05');
  const aSale5 = payHtml(A, 'sale', '2026-10-05');
  ck('[옛] 매출 탭 10-05 목록에 매입 품목이 섞였다', /포장 테이프|전미지급/.test(aSale5), true);
  ck('[새] 매출 탭 10-05 목록에 매입 0건', /전미지급|결제완료|부분결제/.test(bSale5), false);
  ck('  매출 거래는 그대로 보인다', /전미수/.test(bSale5) && /176,000/.test(bSale5), true);
  const bPur5 = payHtml(B, 'purchase', '2026-10-05');
  ck('[새] 매입 탭 10-05 목록에 매출 0건', /전미수 |176,000/.test(bPur5), false);
  ck('  매입 거래는 그대로 보인다', /전미지급/.test(bPur5) && /99,000/.test(bPur5), true);

  /* 「상계 순액」 줄 삭제 */
  ck('[옛] 「상계 순액」 글자가 있었다', /상계 순액|상계 완료/.test(aSale5), true);
  ck('[새] 「상계 순액」 글자 0', /상계 순액|상계 완료/.test(bSale5) || /상계 순액|상계 완료/.test(bPur5), false);
  /* 위쪽 합계 3칸은 원래 종류별 */
  /* 위쪽 합계 3칸은 원래부터 종류별이었다(monthInvs 를 썼다) — 바뀌지 않았는지만 본다.
     10월 매출 = 176,000+154,000+49,500 = 379,500 · 매입 = 99,000+27,500 = 126,500 */
  ck('매출 탭 거래액 합계 379,500', /379,500/.test(bSale), true);
  ck('매입 탭 거래액 합계 126,500', /126,500/.test(bPur), true);
  ck('  (대조) 옛 판도 같은 값이었다', /379,500/.test(aSale) && /126,500/.test(aPur), true);
}

/* ══ ⑥ 수금 계산은 한 글자도 안 바뀌었나 ════════════════════════════ */
console.log('\n⑥ 수금(logiCollect) — 금액 분배가 옛 판과 같다');
{
  function collect(src) {
    const R = stage(src);
    R.ev('logiPayKind="sale"; logiPayYear=2026; logiPayMonth=10; logiCalOpen=true; logiPaySelDate="2026-10-12";');
    R.ev('renderPayment()');
    /* 입력칸을 심어 둔다 (렌더가 만든 HTML 은 글자라 DOM 이 없다) */
    const amt = E.makeEl('input'); amt.id = 'lcoll-S2'; amt.value = '200,000';
    const met = E.makeEl('select'); met.id = 'lmeth-S2'; met.value = '현금';
    const dt = E.makeEl('input'); dt.id = 'ldate-S2'; dt.value = '2026-10-25';
    R.document.registerId('lcoll-S2', amt); R.document.registerId('lmeth-S2', met);
    R.document.registerId('ldate-S2', dt);
    R.ev("logiCollect('S2')");
    const list = JSON.parse(R.store['tkd_invoices' + SUF] || '[]');
    return list.map(function (iv) {
      return iv.id + ':' + (iv.payments || []).map(function (p) {
        return p.date + '/' + p.method + '/' + p.amount + (p.pre ? '/선' : '');
      }).join('+');
    }).join(' | ');
  }
  const a = collect(OLD), b = collect(NEW);
  ck('분배 결과가 같다', b, a);
  console.log('     ' + b);
  ck('  (대조) 빈 값이 아니다', b.indexOf('S2:2026-10-25') >= 0, true);
}

/* ══ ⑦ 무변경 조건 — diff 0줄 ═══════════════════════════════════════ */
console.log('\n⑦ 손대지 않기로 한 것들 — diff 0줄');
{
  const files = ['s.html', 'firestore.rules'];
  files.forEach(function (f) {
    const d = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + OLD_REF + ' ' + NEW_REF + ' -- ' + f).toString().trim();
    ck(f + ' 무변경', d || '(변경 없음)', '(변경 없음)');
  });
  const apiD = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + OLD_REF + ' ' + NEW_REF + ' -- api lib').toString().trim();
  ck('api/ · lib/ 무변경', apiD || '(변경 없음)', '(변경 없음)');
  /* 공유 링크 발급 함수 다섯 — 함수 본문이 글자까지 같은가 */
  const fnOf = (src, name) => {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '(없음)';
    let j = src.indexOf('{', i), d = 0, e = j;
    for (; e < src.length; e++) { const c = src[e]; if (c === '{') d++; else if (c === '}') { d--; if (!d) break; } }
    return src.slice(i, e + 1);
  };
  ['shareIssueClientRange', 'shareIssueOneInvoice', 'invShareEnsureUrl', 'invSharePrepare', 'invShareSend']
    .forEach(function (n) {
      const o = fnOf(OLD, n), w = fnOf(NEW, n);
      ck(n + ' 글자까지 같다', w === o, true);
      if (w !== o) console.log('     옛 ' + o.length + '자 / 새 ' + w.length + '자');
    });
  /* 바뀐 파일 목록 — ★ 작업트리는 회차마다 늘어난다(v270 에 CLAUDE.md 가 더해졌다).
     이 묶음이 지켜야 할 것은 「**v268 회차가** index.html·version.json 만 건드렸다」이고,
     그것은 커밋 둘(0322876 -> c221090)을 맞대면 앞으로도 그대로 확인된다. */
  const st = cp.execSync('git -C ' + COS_ROOT + ' diff --name-only 0322876 c221090')
    .toString().trim().split('\n').filter(Boolean).sort().join(',');
  ck('v268 회차가 바꾼 파일', st, 'index.html,version.json');
}

/* ══ ⑧ 버전 · 문답 ══════════════════════════════════════════════════ */
console.log('\n⑧ 버전 · 문답표');
{
  /* ★ v272 보정1: version.json 도 **그 회차 커밋에서** 읽는다.
     작업트리를 읽으면 APP_VERSION(고정 268)과 안 맞아 「둘이 같음」이 거짓이 된다. */
  const vj = JSON.parse(cp.execSync(
    'git -C ' + COS_ROOT + ' show ' + NEW_REF + ':version.json').toString());
  const av = Number((NEW.match(/const APP_VERSION = (\d+);/) || [])[1]);
  ck('APP_VERSION · version.json (268 · 둘이 같음)', (av === 268 && av === vj.version) + ' / ' + av, 'true / ' + av);
  ck('옛 판은 267', Number((OLD.match(/const APP_VERSION = (\d+);/) || [])[1]), 267);
  /* ★ 문답도 회차마다 늘어난다(v270 +1). 「v268 회차가 문답을 어떻게 바꿨나」를 보는 자리라
     **작업트리 대신 v268 커밋(c221090)** 과 맞댄다 — 그러면 앞으로도 그대로 확인된다. */
  const V268 = cp.execSync('git -C ' + COS_ROOT + ' show c221090:index.html',
    { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
  const B = stage(V268), A = stage(OLD);
  const qaN = B.sandbox.HELP_QA, qaO = A.sandbox.HELP_QA;
  ck('문답 수 (v268 회차에는 그대로였다)', qaN.length + '/' + qaO.length, '73/73');
  const diff = qaN.filter(function (q, i) {
    const o = qaO.find(function (x) { return x.keys.join(',') === q.keys.join(','); });
    return !o || o.a !== q.a || o.t !== q.t;
  });
  console.log('     바뀐 문답 ' + diff.length + '개: ' + diff.map(function (q) { return q.t; }).join(' · '));
  ck('바뀐 문답 개수', diff.length, 5);
  /* 새 단추 이름이 문답에 들어갔나 */
  const all = qaN.map(function (q) { return q.t + ' ' + q.a; }).join('\n');
  ck('문답에 「보기 · 인쇄 · 💬 카톡」', /보기 · 인쇄 · 💬 카톡/.test(all), true);
  ck('문답에 「💬 카톡 보내기」', /💬 카톡 보내기/.test(all), true);
  ck('문답에서 옛 이름 「기간 거래내역 PDF 출력」 0', /기간 거래내역 PDF 출력/.test(all), false);
  ck('문답에서 옛 이름 「🖨 인쇄 / 📄 PDF」 0', /🖨 인쇄 \/ 📄 PDF/.test(all), false);
  ck('문답에 「상계 순액」 0 (카드에서 뺐다)', /상계 순액/.test(all), false);
  ck('수납 문답에 「고른 단추 쪽만」', /고른 단추 쪽만/.test(all), true);
  /* 번호가 1부터 이어지는가 */
  let badNo = 0;
  qaN.forEach(function (q) {
    const ls = q.a.split('\n').filter(function (l) { return /^\d+\./.test(l); });
    ls.forEach(function (l, i) { if (Number(l.match(/^(\d+)\./)[1]) !== i + 1) badNo++; });
  });
  ck('번호가 어긋난 문답 줄', badNo, 0);
  ck('글자에 undefined 없음', /undefined/.test(all), false);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
console.log('※ 실제 Firestore 쓰기 0 · 카카오 전송 0 (가짜 환경)');
process.exit(fail ? 1 : 0);
