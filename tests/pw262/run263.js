/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v263 — 실제 크롬으로 화면 넷을 열어 보고(4크기) 캡처한다.
   ① 마스터 승인 모달  ② 승인된 업체 줄  ③ 만료 안내  ④ 읽기 전용 띠 + 체험 배너
   ★ 바깥 요청은 전부 막는다 — 서버 호출 0. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FILE = '' + COS_ROOT + '/index.html';
const SHOT = path.join(__dirname, 'shots263');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

const STUB = () => {
  window.alert = function () {}; window.confirm = function () { return true; };
  window._auth = { currentUser: { uid: 'UID123456789012', email: 'a@b.c', isAnonymous: false,
                                  getIdToken: function () { return Promise.resolve('tok'); } } };
  window._authFns = { signOut: function () { return Promise.resolve(); },
                      onAuthStateChanged: function (a, cb) { try { cb(null); } catch (e) {} return function () {}; } };
  window._userUid = 'UID123456789012';
  window._userApproved = true;
  window._userOrgId = 'academy_UID123456789';
  window._userOrgName = '코스로드학원';
  window._isDriverAcct = false;
  window.getUrlOrg = function () { return 'academy_UID123456789'; };
  /* 마스터 패널에 쓸 가짜 가입자 둘 (승인된 업체 1 · 대기 1) */
  const DAY = 86400000, now = Date.now();
  window.signupUsers = [
    { _uid: 'UIDAAAAAAAAAAAA', orgName: '가온학원', bizType: 'academy', approved: true,
      status: 'active', plan: 'trial', phone: '01011112222', createdAt: now - 10 * DAY,
      paidUntil: now + 5 * DAY, trialEnd: now - 2 * DAY, contractMonths: 6,
      bizNo: '2118811430', bizCeo: '홍길동', bizOpenDate: '20200301', bizCheckedAt: now, signupMethod: 'phone' },
    { _uid: 'UIDBBBBBBBBBBBB', orgName: '대기물류', bizType: 'logistics', approved: false,
      status: 'pending', plan: 'pending', phone: '01033334444', createdAt: now - 2 * DAY,
      bizNo: '2118811430', bizCeo: '김철수', bizOpenDate: '20210501', bizCheckedAt: now, signupMethod: 'phone' }
  ];
  window.masterInquiries = [];
  window._billingInfo = { bank: '농협', account: '301-1234-5678-91', holder: '주식회사 프리존', fee: '' };
};

const SHOTS = [
  ['approve', '마스터 승인 모달', () => {
    const root = document.getElementById('master-root') || (function () {
      const d = document.createElement('div'); d.id = 'master-root'; document.body.appendChild(d); return d;
    })();
    drawMasterPanel();
    masterApproveAsk('UIDAAAAAAAAAAAA', '가온학원');
    const t = document.getElementById('mp-trial'); if (t) t.value = '30';
    const m = document.getElementById('mp-months'); if (m) m.value = '6';
    masterApprovePreview();
  }],
  ['masterrow', '마스터 — 승인된 업체 줄', () => {
    const b = document.getElementById('mp-approve'); if (b) b.remove();
    const root = document.getElementById('master-root') || (function () {
      const d = document.createElement('div'); d.id = 'master-root'; document.body.appendChild(d); return d;
    })();
    drawMasterPanel();
    window.scrollTo(0, 0);
  }],
  ['expired', '만료 안내', () => {
    const b = document.getElementById('mp-approve'); if (b) b.remove();
    const r = document.getElementById('master-root'); if (r) r.innerHTML = '';
    window._userPaidUntil = Date.now() - 86400000;
    window._userTrialEnd = Date.now() - 40 * 86400000;
    showTrialExpired();
  }],
  ['readonly', '읽기 전용 띠', () => {
    const p = document.getElementById('trial-expired'); if (p) p.remove();
    document.getElementById('login-screen').classList.add('hide');
    const app = document.getElementById('main-app');
    app.style.display = 'block';
    showReadOnlyBar();
    window.scrollTo(0, 0);
  }],
  ['banner', '체험 배너 (D-5)', () => {
    const bar = document.getElementById('readonly-bar'); if (bar) bar.remove();
    window._userPaidUntil = Date.now() + 5 * 86400000;
    window._userTrialEnd = Date.now() + 2 * 86400000;
    showTrialBanner(getTrialStatus().daysLeft);
    window.scrollTo(0, 0);
  }]
];

/* 창이 화면 밖으로 잘리지 않는지(= v262 규칙) 함께 잰다 */
const MEASURE = (id) => {
  const el = document.getElementById(id);
  if (!el) return null;
  const inner = el.firstElementChild;
  if (!inner) return null;
  el.scrollTop = 0;
  const cs = getComputedStyle(el);
  return { align: cs.alignItems, overflowY: cs.overflowY,
           top: Math.round(inner.getBoundingClientRect().top * 100) / 100,
           vh: window.innerHeight };
};

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  fs.mkdirSync(SHOT, { recursive: true });
  const out = {};
  for (const [w, h] of SIZES) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.route('**', r => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
    await p.goto('file:///' + FILE + '?org=academy_demo', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => typeof window.getTrialStatus === 'function', { timeout: 20000 });
    await p.evaluate(STUB);
    for (const [key, name, fn] of SHOTS) {
      await p.evaluate(fn);
      await p.waitForTimeout(120);
      const tag = w + 'x' + h;
      out[key] = out[key] || {};
      /* 창 두 개는 잘림을 잰다 */
      if (key === 'approve') out[key][tag] = await p.evaluate(MEASURE, 'mp-approve');
      if (key === 'expired') out[key][tag] = await p.evaluate(MEASURE, 'trial-expired');
      if (key === 'readonly') out[key][tag] = await p.evaluate(() => {
        const bar = document.getElementById('readonly-bar');
        return bar ? { text: (bar.textContent || '').slice(0, 20), top: Math.round(bar.getBoundingClientRect().top) } : null;
      });
      if (key === 'banner') out[key][tag] = await p.evaluate(() => {
        const bar = document.getElementById('trial-banner');
        return bar ? { text: (bar.textContent || '').slice(0, 24) } : null;
      });
      await p.screenshot({ path: path.join(SHOT, 'v263_' + key + '_' + w + '.png') });
    }
    await p.close();
  }
  await b.close();
  fs.writeFileSync(path.join(__dirname, 'res263.json'), JSON.stringify(out, null, 1));
  /* 판정 */
  let bad = 0;
  for (const k of ['approve', 'expired']) {
    for (const tag of Object.keys(out[k] || {})) {
      const v = out[k][tag];
      const ok = v && v.align === 'flex-start' && v.top >= -0.5;
      if (!ok) bad++;
      console.log('  ' + (ok ? 'o' : 'X') + ' ' + k.padEnd(10) + tag.padEnd(10)
        + (v ? ('align=' + v.align + ' 윗변=' + v.top + '/' + v.vh) : '(못 찾음)'));
    }
  }
  for (const tag of Object.keys(out.readonly || {})) {
    const v = out.readonly[tag]; const ok = v && /이용 기간이 끝났어요/.test(v.text);
    if (!ok) bad++;
    console.log('  ' + (ok ? 'o' : 'X') + ' readonly  ' + tag.padEnd(10) + (v ? v.text : '(없음)'));
  }
  for (const tag of Object.keys(out.banner || {})) {
    const v = out.banner[tag]; const ok = v && /D-5/.test(v.text);
    if (!ok) bad++;
    console.log('  ' + (ok ? 'o' : 'X') + ' banner    ' + tag.padEnd(10) + (v ? v.text : '(없음)'));
  }
  console.log(bad ? ('실패 ' + bad) : '화면 16칸 전부 통과');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
