/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v264 — 실제 크롬으로 화면을 열어 보고(4크기) 재고 캡처한다.
   ① 승인 창(할인 가능)  ② 승인 창(이미 받음)  ③ 연장 창  ④ 기간 정하기(달력)
   ⑤ 가입 창 개업일자(달력)  ⑥ 승인 대기 화면  ⑦ 홈페이지 요금 영역
   ★ 바깥 요청은 전부 막는다 — 서버 호출 0. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FILE = '' + COS_ROOT + '/index.html';
const HOME = '' + COS_ROOT + '/home.html';
const SHOT = path.join(__dirname, 'shots264');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

/* 서버를 부르지 않고 「할인 가능 / 이미 받음」을 만들어 준다 */
const STUB = (promo) => {
  window.alert = function () {}; window.confirm = function () { return true; };
  window._auth = { currentUser: { uid: 'UID123456789012', email: 'a@b.c', isAnonymous: false,
                                  getIdToken: function () { return Promise.resolve('tok'); } } };
  window._authFns = { signOut: function () { return Promise.resolve(); },
                      onAuthStateChanged: function (a, cb) { try { cb(null); } catch (e) {} return function () {}; } };
  window._userUid = 'UID123456789012';
  window._userApproved = true;
  window._userOrgId = 'academy_UID123456789';
  window._userOrgName = '가온학원';
  window._isDriverAcct = false;
  window.getUrlOrg = function () { return 'academy_UID123456789'; };
  /* 계좌·요금은 마스터가 넣어 둔 값(billing) — 코드 기본값과 섞이는지도 함께 본다 */
  window._billingInfo = { bank: '농협', account: '301-1234-5678-91', holder: '주식회사 프리존' };
  window.driverAcctApi = function (b) {
    window.__calls = window.__calls || []; window.__calls.push(b);
    if (b.action === 'bizPromoStatus') return Promise.resolve(promo);
    return Promise.resolve({ ok: true, trialEndStr: '2026-12-04', paidUntilStr: '2027-06-04' });
  };
  window.loadSignupUsers = function () { return Promise.resolve(); };
  window.drawMasterPanel = function () {};
};

const PROMO_OK   = { ok: true, hasBizNo: true,  used: false, usedAt: null, usedStr: null };
const PROMO_USED = { ok: true, hasBizNo: true,  used: true,  usedAt: Date.now(), usedStr: '2026-10-01' };

/* 창이 위로 잘리지 않는지(= v262 규칙) 함께 잰다 */
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
/* 날짜 칸이 진짜 달력인지 — 브라우저가 type 을 받아들였는지 본다 */
const DATEFIELD = (id) => {
  const el = document.getElementById(id);
  if (!el) return null;
  return { type: el.type, value: el.value, min: el.getAttribute('min') || '', max: el.getAttribute('max') || '',
           hasPicker: typeof el.showPicker === 'function' };
};

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  fs.mkdirSync(SHOT, { recursive: true });
  const out = {};
  const put = (k, tag, v) => { out[k] = out[k] || {}; out[k][tag] = v; };

  for (const [w, h] of SIZES) {
    const tag = w + 'x' + h;
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.route('**', r => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
    await p.goto('file:///' + FILE + '?org=academy_demo', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => typeof window.getTrialStatus === 'function', { timeout: 20000 });

    /* ① 승인 창 — 첫 결제 할인을 쓸 수 있는 업체 */
    await p.evaluate(STUB, PROMO_OK);
    await p.evaluate(async () => {
      document.body.innerHTML = '<div id="master-root" style="max-width:680px;margin:0 auto;padding:20px;"></div>';
      document.body.style.background = '#F9FAFB';
      await masterApproveAsk('UIDAAAAAAAAAAAA', '가온학원');
      masterPickPlan('promo6m');
    });
    await p.waitForTimeout(150);
    put('approve_ok', tag, await p.evaluate(MEASURE, 'mp-approve'));
    put('approve_ok_fields', tag, await p.evaluate(() => ({
      months: (document.getElementById('mp-months') || {}).value,
      amount: (document.getElementById('mp-amount') || {}).value,
      trial: (document.getElementById('mp-trial') || {}).value,
      promoLocked: /disabled/.test((document.getElementById('mp-plans') || {}).innerHTML || '')
    })));
    await p.screenshot({ path: path.join(SHOT, 'v264_approve_' + w + '.png') });

    /* ② 승인 창 — 이미 할인을 받은 사업자 */
    await p.evaluate(() => { const x = document.getElementById('mp-approve'); if (x) x.remove(); });
    await p.evaluate(STUB, PROMO_USED);
    await p.evaluate(async () => { await masterApproveAsk('UIDBBBBBBBBBBBB', '가온학원 2호점'); });
    await p.waitForTimeout(150);
    put('approve_used', tag, await p.evaluate(() => {
      const h = (document.getElementById('mp-plans') || {}).innerHTML || '';
      /* 브라우저가 파싱한 innerHTML 은 disabled 를 disabled="" 로 돌려준다 — 둘 다 센다 */
      return { locked: (h.match(/disabled(=""| )/g) || []).length,
               why: /이미 받았어요/.test(h), date: /2026-10-01/.test(h) };
    }));
    await p.screenshot({ path: path.join(SHOT, 'v264_approve_used_' + w + '.png') });

    /* ③ 연장 창 */
    await p.evaluate(() => {
      const x = document.getElementById('mp-approve'); if (x) x.remove();
      masterExtendAsk('UIDAAAAAAAAAAAA', '가온학원', '2027-06-04');
      masterPickExtendPlan('yearly');
    });
    await p.waitForTimeout(150);
    put('extend', tag, await p.evaluate(MEASURE, 'mp-extend'));
    put('extend_fields', tag, await p.evaluate(() => ({
      months: (document.getElementById('mpx-months') || {}).value,
      amount: (document.getElementById('mpx-amount') || {}).value,
      noPromo: !/첫 결제/.test((document.getElementById('mpx-plans') || {}).innerHTML || '')
    })));
    await p.screenshot({ path: path.join(SHOT, 'v264_extend_' + w + '.png') });

    /* ④ 기간 정하기 — 달력 */
    await p.evaluate(() => {
      const x = document.getElementById('mp-extend'); if (x) x.remove();
      masterSetPeriodAsk('UIDAAAAAAAAAAAA', '가온학원', '2027-06-30');
    });
    await p.waitForTimeout(150);
    put('setperiod', tag, await p.evaluate(MEASURE, 'mp-set'));
    put('setperiod_date', tag, await p.evaluate(DATEFIELD, 'mps-until'));
    await p.screenshot({ path: path.join(SHOT, 'v264_setperiod_' + w + '.png') });

    /* ⑤ 가입 창 — 개업일자 달력 */
    await p.evaluate(() => {
      const x = document.getElementById('mp-set'); if (x) x.remove();
      openSignupModal();
    });
    await p.waitForTimeout(150);
    put('signup', tag, await p.evaluate(MEASURE, 'signup-modal'));
    put('signup_date', tag, await p.evaluate(DATEFIELD, 'su-open'));
    await p.screenshot({ path: path.join(SHOT, 'v264_signupdate_' + w + '.png') });

    /* ⑥ 승인 대기 화면 — 요금 안내가 들어갔는지 */
    await p.evaluate(() => {
      const x = document.getElementById('signup-modal'); if (x) x.remove();
      document.body.innerHTML = '';
      const ls = document.createElement('div'); ls.id = 'login-screen'; document.body.appendChild(ls);
      const ma = document.createElement('div'); ma.id = 'main-app'; document.body.appendChild(ma);
      window.loadBillingInfo = function () { return Promise.resolve(window._billingInfo); };
      showPendingScreen();
    });
    await p.waitForTimeout(200);
    put('pending', tag, await p.evaluate(() => {
      const el = document.getElementById('pending-screen');
      const t = el ? (el.textContent || '') : '';
      return { promo: /6개월 180,000원/.test(t), promo12: /1년 310,000원/.test(t),
               once: /사업자당 1회/.test(t), renew: /월 50,000원/.test(t),
               trial: /30일 체험 뒤 계약 기간 시작/.test(t), bank: /301-1234-5678-91/.test(t) };
    }));
    await p.screenshot({ path: path.join(SHOT, 'v264_pending_' + w + '.png') });

    /* ⑦ 홈페이지 요금 영역 */
    await p.goto('file:///' + HOME, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(250);
    const band = await p.evaluate(() => {
      const els = Array.from(document.querySelectorAll('div'));
      /* 띠 제목이 든 **가장 안쪽** 칸을 집는다(바깥 묶음을 집으면 요금 영역 전체가 잡힌다) */
      const hits = els.filter(e => /🎁 첫 결제 할인/.test(e.textContent || ''));
      const title = hits[hits.length - 1];
      if (!title) return null;
      const box = title.parentElement;          // 제목을 감싼 주황 띠
      box.scrollIntoView({ block: 'center' });
      const r = box.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height),
               inView: r.left >= -1 && r.right <= window.innerWidth + 1,
               text: (box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) };
    });
    put('home_band', tag, band);
    await p.evaluate(() => { const s = document.querySelector('#price, section'); });
    await p.screenshot({ path: path.join(SHOT, 'v264_homeprice_' + w + '.png') });

    await p.close();
  }
  await b.close();
  fs.writeFileSync(path.join(__dirname, 'res264.json'), JSON.stringify(out, null, 1));

  /* ── 판정 ───────────────────────────────────────────────────────── */
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };
  for (const k of ['approve_ok', 'extend', 'setperiod', 'signup']) {
    for (const tag of Object.keys(out[k] || {})) {
      const v = out[k][tag];
      const ok = v && v.align === 'flex-start' && v.top >= -0.5;
      say(ok, (k + ' 창 안 잘림 ').padEnd(22) + tag.padEnd(10)
          + (v ? ('align=' + v.align + ' 윗변=' + v.top + '/' + v.vh) : '(못 찾음)'));
    }
  }
  for (const tag of Object.keys(out.approve_ok_fields || {})) {
    const v = out.approve_ok_fields[tag];
    say(v && v.months === '6' && v.amount === '180,000' && v.trial === '30' && !v.promoLocked,
        '승인 창 promo6m 채움   '.padEnd(22) + tag.padEnd(10) + JSON.stringify(v));
  }
  for (const tag of Object.keys(out.approve_used || {})) {
    const v = out.approve_used[tag];
    say(v && v.locked === 2 && v.why && v.date,
        '이미 받음 → 잠김      '.padEnd(22) + tag.padEnd(10) + JSON.stringify(v));
  }
  for (const tag of Object.keys(out.extend_fields || {})) {
    const v = out.extend_fields[tag];
    say(v && v.months === '12' && v.amount === '480,000' && v.noPromo,
        '연장 창 yearly 채움   '.padEnd(22) + tag.padEnd(10) + JSON.stringify(v));
  }
  for (const tag of Object.keys(out.setperiod_date || {})) {
    const v = out.setperiod_date[tag];
    say(v && v.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v.value) && v.min && v.hasPicker,
        '기간 정하기 달력      '.padEnd(22) + tag.padEnd(10) + JSON.stringify(v));
  }
  for (const tag of Object.keys(out.signup_date || {})) {
    const v = out.signup_date[tag];
    say(v && v.type === 'date' && v.max && v.hasPicker,
        '개업일자 달력         '.padEnd(22) + tag.padEnd(10) + JSON.stringify(v));
  }
  for (const tag of Object.keys(out.pending || {})) {
    const v = out.pending[tag];
    say(v && v.promo && v.promo12 && v.once && v.renew && v.trial && v.bank,
        '승인 대기 요금 안내   '.padEnd(22) + tag.padEnd(10) + JSON.stringify(v));
  }
  for (const tag of Object.keys(out.home_band || {})) {
    const v = out.home_band[tag];
    say(v && v.inView, '홈 첫결제 할인 띠     '.padEnd(22) + tag.padEnd(10) + (v ? (v.w + 'px ' + v.text) : '(못 찾음)'));
  }
  console.log(bad ? ('\n실패 ' + bad) : '\n화면 전부 통과');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('ERR', e && e.stack || e); process.exit(1); });
