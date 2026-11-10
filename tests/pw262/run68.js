/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v309(코스로드68) 실제 크롬 — **나란한 카드 높이** · **보기 글 업종별** · 네 크기.
   ⓐ 홈페이지 — 옛 판에서 제목·설명이 **몇 px 어긋났나**(재현) → 고친 판에서 **0px**(대조)
   ⓑ 홈페이지 카톡 조각 — 실제로 그려진 색이 변수 둘과 같나 · 네 크기 가로 넘침 0
   ⓒ 공유 화면(`s.html`) — 알림장 본문이 `keep-all` 로 그려지나(옛 판 `break-word` 대조)
   ⓓ 앱 — 네 업종에서 수정 창 보기 글이 업종에 맞나 · 네 크기에서 안 잘리나
   바깥 요청 전부 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0. */
const { chromium } = require('playwright');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP = process.env.COS_APP || (COS_ROOT + '/index.html');
const HOME = COS_ROOT + '/home.html';
const SHARE = COS_ROOT + '/s.html';
const OLD_REF = process.env.COS_SRC_OLD_REF || '1a97c05';   /* v308 — 고치기 전 */
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

/* 옛 판을 **같은 폴더 안에** 풀어 둔다(상대 경로 그림·글꼴이 그대로 맞게) */
function oldCopy(name) {
  const body = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':' + name,
    { maxBuffer: 1 << 28 }).toString();
  const out = path.join(os.tmpdir(), 'cos68_' + OLD_REF + '_' + name);
  fs.writeFileSync(out, body);
  return out.replace(/\\/g, '/');
}

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + msg); };

/* 같은 줄에 있는 카드끼리 제목·설명 top 이 얼마나 어긋나나 (probe68 과 같은 셈) */
const SPREAD = `(() => {
  const groups = [
    { key: 'biz',   sel: '.biz-grid > .biz',             t: 'h3', d: 'p' },
    { key: 'asst',  sel: '#assistant .asst-card, #assistant [style*="minmax(260px"] > div', t: 'h4', d: 'p' },
    { key: 'feat',  sel: '.feat-grid > .feat',           t: 'h4', d: 'p' },
    { key: 'guide', sel: '#guide [style*="minmax(240px"] > div', t: 'h4', d: 'p' },
    { key: 'inst',  sel: '.install-grid > .install-card', t: 'h3', d: 'ol' }
  ];
  const out = {};
  groups.forEach((g) => {
    const cards = [...document.querySelectorAll(g.sel)];
    const rows = {};
    cards.forEach((c) => {
      const k = Math.round(c.getBoundingClientRect().top);
      (rows[k] = rows[k] || []).push(c);
    });
    let wt = 0, wd = 0, bands = 0;
    Object.keys(rows).forEach((k) => {
      const band = rows[k];
      if (band.length < 2) return;
      bands++;
      const tops = (sel) => band.map((c) => {
        const e = c.querySelector(sel);
        return e ? Math.round(e.getBoundingClientRect().top - c.getBoundingClientRect().top) : null;
      }).filter((x) => x !== null);
      const sp = (a) => (a.length < 2 ? 0 : Math.max.apply(null, a) - Math.min.apply(null, a));
      wt = Math.max(wt, sp(tops(g.t)));
      wd = Math.max(wd, sp(tops(g.d)));
    });
    out[g.key] = { n: cards.length, bands: bands, title: wt, desc: wd };
  });
  out._scroll = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  return out;
})()`;

async function page(b, w, h) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    errs.push(t.slice(0, 130));
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  p.__errs = errs;
  return p;
}
const load = async (p, file) => {
  await p.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'load' });
  await p.waitForTimeout(220);
};

/* ── 앱 ── 업종을 바꿔 수정 창을 연다 */
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
function seed(biz) {
  const S = '__academy_acme';
  const mem = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
    location: '인천 연수구 1', lat: 37.41, lon: 126.68, phone: '010-1111-1111' }];
  return '(function(){\n'
    + '  window._userOrgId="academy_acme"; currentMode="admin";\n'
    + '  var S=' + JSON.stringify(S) + ', B=' + JSON.stringify(biz) + ';\n'
    + '  localStorage.setItem("tkd_cars"+S, JSON.stringify([{id:"car1",name:"1호차"}]));\n'
    + '  localStorage.setItem("tkd_courses"+S, JSON.stringify([{id:"c1",name:"오전반"}]));\n'
    + '  localStorage.setItem("tkd_members"+S, ' + JSON.stringify(JSON.stringify(mem)) + ');\n'
    + '  localStorage.setItem("tkd_notices"+S, "[]");\n'
    + '  localStorage.setItem("tkd_staff"+S, "[]");\n'
    + '  localStorage.setItem("tkd_org"+S, JSON.stringify({name:"가온",icon:"🚐",bizType:B,\n'
    + '    destName:"학원",destLat:37.4467,destLon:126.6516}));\n'
    + '  localStorage.setItem("tkd_ridestate"+S, "{}");\n'
    + '  window._db={}; window._fbReady=true;\n'
    + '  window._firestore={ doc:function(){return{path:"x"};}, collection:function(){return{path:"x"};},\n'
    + '    getDoc:async function(){return {exists:function(){return false;},data:function(){return{};}};},\n'
    + '    setDoc:async function(){}, deleteDoc:async function(){},\n'
    + '    getDocs:async function(){return {forEach:function(){}};},\n'
    + '    runTransaction:async function(){return null;}, onSnapshot:function(){return function(){};} };\n'
    + '  window._auth={ currentUser:{ isAnonymous:false, getIdToken:function(){ return Promise.resolve("t"); } } };\n'
    + '  window.alert=function(){}; window.confirm=function(){ return true; };\n'
    + '  window.fetch=function(){ return Promise.resolve({ok:true,json:function(){ return Promise.resolve({ok:true}); }}); };\n'
    + '  window._userBizType=B; try{ _userBizType=B; }catch(e){}\n'
    + '  window._userUid="uB"; window._userPaidUntil=Date.now()+30*86400000;\n'
    + '  members=loadMembers(); cars=loadCars(); courses=loadCourses();\n'
    + '  orgSettings=loadOrgSettings(); staff=loadStaff(); notices=loadNotices();\n'
    + '  saveToFirebase=function(){ return Promise.resolve(true); };\n'
    + '  saveCarState=function(){ return Promise.resolve(true); };\n'
    + '  rebuildCarData=function(){}; _firstSyncOk=true;\n'
    + '  document.getElementById("admin-screen").classList.add("show");\n'
    + '  var ls=document.getElementById("login-screen"); if(ls) ls.classList.add("hide");\n'
    + '  var ap=document.getElementById("main-app"); if(ap) ap.style.display="block";\n'
    + '})();';
}

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const OLD_HOME = oldCopy('home.html');
  const OLD_SHARE = oldCopy('s.html');

  console.log('════ ⓐ 홈페이지 나란한 카드 — 제목·설명이 어긋나나 (재현 → 대조)');
  for (const [w, h] of SIZES) {
    const tag = '[' + w + 'x' + h + '] ';
    const p = await page(b, w, h);
    await load(p, OLD_HOME);
    const was = await p.evaluate(SPREAD);
    await load(p, HOME);
    const now = await p.evaluate(SPREAD);
    const many = w >= 461;
    if (many) {
      say(was.biz.title > 0 && was.biz.desc > 0, tag + '[옛] 업종 카드가 어긋났다'.padEnd(34)
        + '제목 ' + was.biz.title + 'px · 설명 ' + was.biz.desc + 'px');
      say(was.asst.desc > 0, tag + '[옛] 「경영 비서」 카드도'.padEnd(34) + '설명 ' + was.asst.desc + 'px');
    } else {
      say(was.biz.bands === 0, tag + '[옛] 한 줄에 한 장 — 어긋날 것이 없다'.padEnd(34)
        + '여러 장 줄 ' + was.biz.bands);
    }
    say(now.biz.n === 4, tag + '업종 카드 4장'.padEnd(34) + now.biz.n + '장');
    say(now.biz.title === 0 && now.biz.desc === 0, tag + '★ 업종 카드 **0px**'.padEnd(34)
      + '제목 ' + now.biz.title + 'px · 설명 ' + now.biz.desc + 'px');
    say(now.asst.title === 0 && now.asst.desc === 0, tag + '★ 「경영 비서」 카드 **0px**'.padEnd(34)
      + '제목 ' + now.asst.title + 'px · 설명 ' + now.asst.desc + 'px');
    ['feat', 'guide', 'inst'].forEach((k) => {
      say(now[k].title === 0 && now[k].desc === 0, tag + '  ' + k + ' 묶음도 0px'.padEnd(32)
        + '제목 ' + now[k].title + 'px · 설명 ' + now[k].desc + 'px');
    });
    say(now._scroll <= 0, tag + '가로 넘침 0'.padEnd(34) + now._scroll + 'px');
    say(p.__errs.length === 0, tag + '오류 0'.padEnd(34) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓑ 홈페이지 카톡 조각 — 그려진 색이 변수 둘과 같나');
  {
    const p = await page(b, 1366, 768);
    await load(p, HOME);
    const r = await p.evaluate(() => {
      const els = [...document.querySelectorAll('.kko')];
      const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
      const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const L = (a) => 0.2126 * lin(a[0]) + 0.7152 * lin(a[1]) + 0.0722 * lin(a[2]);
      return els.map((e) => {
        const cs = getComputedStyle(e);
        const bg = rgb(cs.backgroundColor), fg = rgb(cs.color);
        /* 반투명 검정이 노란 바탕에 얹힌 실제 색 */
        const a = fg.length > 3 ? fg[3] : 1;
        const mix = [0, 1, 2].map((i) => Math.round(fg[i] * a + bg[i] * (1 - a)));
        const l1 = Math.max(L(bg), L(mix)), l2 = Math.min(L(bg), L(mix));
        return { text: e.textContent, bg: bg.slice(0, 3).join(','), mix: mix.join(','),
          ratio: Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100 };
      });
    });
    say(r.length === 2, '카톡 조각 두 곳'.padEnd(40) + r.length + '곳');
    r.forEach((x, i) => {
      say(x.bg === '254,229,0', '  ' + (i + 1) + ' 바탕이 #FEE500'.padEnd(38) + 'rgb(' + x.bg + ')');
      say(x.ratio >= 7, '  ' + (i + 1) + ' 글자 대비 7:1 이상(AAA)'.padEnd(38)
        + x.ratio + ':1 · 글자 rgb(' + x.mix + ')');
      say(/알림톡/.test(x.text), '  ' + (i + 1) + ' 「알림톡」 조각만'.padEnd(38) + '"' + x.text + '"');
    });
    say(p.__errs.length === 0, '오류 0'.padEnd(40) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  console.log('\nⓒ 공유 화면 — 알림장 본문 줄바꿈');
  for (const [w, h] of [[1366, 768], [360, 640]]) {
    const tag = '[' + w + 'x' + h + '] ';
    const p = await page(b, w, h);
    const probe = `(() => {
      const d = document.createElement('div');
      d.className = 'nt-body';
      d.textContent = '오늘은 비가 와서 등원 시간이 늦어질 수 있습니다 https://cosroad.com/s.html?t=aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      (document.querySelector('.wrap') || document.body).appendChild(d);
      const cs = getComputedStyle(d);
      return { wb: cs.wordBreak, ow: cs.overflowWrap || cs.wordWrap,
        scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    })()`;
    await load(p, OLD_SHARE);
    const was = await p.evaluate(probe);
    await load(p, SHARE);
    const now = await p.evaluate(probe);
    say(was.wb === 'break-word', tag + '[옛] `break-word` 였다'.padEnd(34) + was.wb);
    say(now.wb === 'keep-all', tag + '★ 이제 `keep-all`'.padEnd(34) + now.wb);
    say(now.ow === 'anywhere', tag + '  긴 주소는 끊긴다'.padEnd(34) + now.ow);
    say(now.scroll <= 0, tag + '가로 넘침 0'.padEnd(34) + now.scroll + 'px');
    say(p.__errs.length === 0, tag + '오류 0'.padEnd(34) + (p.__errs[0] || 'OK'));
    await p.close();
    /* ★ 업종 용어 — **s.html 을 그대로 띄워** 실제로 그려진 글자를 본다.
       `s.html` 은 모듈이라 함수가 `window` 에 없다 → Firebase 모듈 두 개를 **가짜 모듈로
       바꿔치기**하고(바깥 통신 0) 공유 문서를 그 자리에서 돌려준다. */
    for (const [who, org, wantH1] of [['물류(새 링크)', { name: '한빛물류', label: '공지' }, '공지'],
                                      ['옛 링크(칸 없음)', { name: '한빛물류' }, '알림장']]) {
      const q = await page(b, w, h);
      await q.addInitScript((snapOrg) => {
        window.__SNAP = { v: 1, kind: 'notice', org: snapOrg, date: '2026-11-10',
          content: '오늘은 비가 옵니다', images: [],
          expiresAt: { toDate: () => new Date(Date.now() + 30 * 864e5) } };
      }, org);
      const mod = (body) => (r) => r.fulfill({ contentType: 'application/javascript', body: body });
      await q.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
        mod('export function initializeApp(){ return {}; }'));
      await q.route('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
        mod('export function getFirestore(){ return {}; }\n'
          + 'export function doc(){ return {}; }\n'
          + 'export function getDoc(){ return Promise.resolve({ exists:function(){ return true; },'
          + ' data:function(){ return window.__SNAP; } }); }'));
      await q.goto('file:///' + SHARE.replace(/\\/g, '/') + '#AAAAAAAAAAAAAAAAAAAAAAAA',
        { waitUntil: 'load' });
      await q.waitForFunction(() => !!document.querySelector('h1'), {}, { timeout: 10000 });
      const t2 = await q.evaluate(() => ({ h1: document.querySelector('h1').textContent,
        title: document.title, body: (document.querySelector('.nt-body') || {}).textContent || '' }));
      say(t2.h1 === wantH1, tag + '★ [' + who + '] 머리글'.padEnd(32) + t2.h1);
      say(t2.title === '한빛물류 ' + wantH1 + '_2026-11-10',
        tag + '  [' + who + '] 창 제목'.padEnd(32) + t2.title);
      say(t2.body === '오늘은 비가 옵니다', tag + '  [' + who + '] 본문 그대로'.padEnd(32) + t2.body);
      say(q.__errs.length === 0, tag + '  [' + who + '] 오류 0'.padEnd(32) + (q.__errs[0] || 'OK'));
      await q.close();
    }
  }

  console.log('\nⓓ 앱 수정 창 — 보기 글이 업종에 맞나 (네 크기)');
  const WANT = {
    academy:   { name: '예) 홍길동',   loc: '예) 용현초 정문',      note: '예) 정문 우측 대기',
                 detail: '상세 주소 (동·호수 등, 선택) 예) 3동 502호', car: '차종 (예: 스타렉스)' },
    public:    { name: '예) 김복순',   loc: '예) 복지관 앞',        note: '예) 보행 보조 필요',
                 detail: '상세 주소 (동·호수 등, 선택) 예) 3동 502호', car: '차종 (예: 스타렉스)' },
    logistics: { name: '예) 한빛상사', loc: '예) 인천 연수구 ...', note: '예) 하차장 뒤편 · 지게차 필요',
                 detail: '상세 주소 (선택) 예) B동 하차장',          car: '차종 (예: 포터2)' },
    delivery:  { name: '예) 홍길동',   loc: '예) 인천 연수구 ...', note: '예) 부재 시 문 앞',
                 detail: '상세 주소 (동·호수 등, 선택) 예) 3동 502호', car: '차종 (예: 포터2)' }
  };
  for (const [w, h] of SIZES) {
    const tag = '[' + w + 'x' + h + '] ';
    for (const biz of Object.keys(WANT)) {
      const p = await page(b, w, h);
      await p.goto('file:///' + APP.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => typeof renderDrive === 'function', {}, { timeout: 20000 });
      await p.evaluate(seed(biz));
      const r = await p.evaluate(() => {
        /* 차량 탭을 먼저 그려 **차종 보기 글**을 본다(v309) */
        let carPh = '(없음)';
        try {
          renderCars();
          const el = [...document.querySelectorAll('input.setting-input')]
            .find((e) => /^차종 \(예: /.test(String(e.placeholder || '')));
          carPh = el ? String(el.placeholder) : '(못 찾음)';
        } catch (e) { carPh = 'ERR:' + e.message; }
        openEditModal(1);
        const g = (id) => { const e = document.getElementById(id); return e ? String(e.placeholder || '') : '(없음)'; };
        const m = document.getElementById('member-modal');
        const box = m ? m.querySelector('.modal-content, .modal-box, div') : null;
        const rb = box ? box.getBoundingClientRect() : null;
        return { name: g('m-name'), loc: g('m-location'), drop: g('m-droplocation'), note: g('m-note'),
          detail: g('m-addrdetail'), carPh: carPh,
          notice: (typeof noticeSearchPh === 'function') ? noticeSearchPh() : '(없음)',
          cut: rb ? Math.round(Math.min(0, rb.top)) : 0,
          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      say(r.name === WANT[biz].name, tag + '[' + biz + '] 이름 보기'.padEnd(32) + r.name);
      say(r.loc === WANT[biz].loc, tag + '[' + biz + '] 주소 보기'.padEnd(32) + r.loc);
      say(r.note === WANT[biz].note, tag + '[' + biz + '] 특이사항 보기'.padEnd(32) + r.note);
      say(r.detail === WANT[biz].detail, tag + '[' + biz + '] 상세 주소 보기'.padEnd(32) + r.detail);
      say(r.carPh === WANT[biz].car, tag + '[' + biz + '] 차종 보기'.padEnd(32) + r.carPh);
      say(/^🔍 .+ 검색 \(쉼표로 여러 (명|곳): /.test(r.notice),
        tag + '[' + biz + '] 검색 보기'.padEnd(32) + r.notice.slice(0, 30));
      say(r.cut === 0, tag + '[' + biz + '] 위로 안 잘림'.padEnd(32) + r.cut + 'px');
      say(r.scroll <= 0, tag + '[' + biz + '] 가로 넘침 0'.padEnd(32) + r.scroll + 'px');
      say(p.__errs.length === 0, tag + '[' + biz + '] 오류 0'.padEnd(32) + (p.__errs[0] || 'OK'));
      await p.close();
    }
  }

  console.log('\nⓔ 가입 창 — 업종을 고르면 업체명 보기도 따라 바뀌나');
  for (const [w, h] of [[1366, 768], [360, 640]]) {
    const tag = '[' + w + 'x' + h + '] ';
    const p = await page(b, w, h);
    await p.goto('file:///' + APP.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => typeof openSignupModal === 'function', {}, { timeout: 20000 });
    const r = await p.evaluate(() => {
      const out = { steps: [], cut: 0, scroll: 0 };
      openSignupModal();
      const nm = () => String((document.getElementById('su-name') || {}).placeholder || '');
      out.steps.push(['처음(학원)', nm()]);
      const sb = document.getElementById('su-biz');
      ['logistics', 'public', 'delivery', 'academy'].forEach((b) => {
        sb.value = b;
        sb.dispatchEvent(new Event('change', { bubbles: true }));
        out.steps.push([b, nm()]);
      });
      const box = document.querySelector('#signup-modal > div');
      out.cut = box ? Math.round(Math.min(0, box.getBoundingClientRect().top)) : 0;
      out.scroll = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return out;
    });
    const WANT_ORG = { '처음(학원)': '예) 우리 태권도장', academy: '예) 우리 태권도장',
      logistics: '예) 한빛물류', public: '예) ○○노인복지관', delivery: '예) ○○택배 연수지점' };
    r.steps.forEach(([k, v]) => {
      say(v === WANT_ORG[k], tag + '[' + k + '] 업체명 보기'.padEnd(32) + v);
    });
    say(r.cut === 0, tag + '위로 안 잘림'.padEnd(34) + r.cut + 'px');
    say(r.scroll <= 0, tag + '가로 넘침 0'.padEnd(34) + r.scroll + 'px');
    say(p.__errs.length === 0, tag + '오류 0'.padEnd(34) + (p.__errs[0] || 'OK'));
    await p.close();
  }

  await b.close();
  console.log('\n' + (bad ? 'X 실패 ' + bad + '건' : 'o 전부 통과') + ' — 실제 크롬 4크기');
  console.log('※ 바깥 요청 차단 · Firestore 가짜 — 실제 쓰기 0 · 문자 0');
  process.exit(bad ? 1 : 0);
})();
