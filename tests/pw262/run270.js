/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v270 — ① 도우미에서 「뒤로가기」를 물으면 새 문답이 나오나 (관리자·기사 각각)
            ② 안 쓰는 「미납 알림 미리보기」 창이 없어졌나
            ③ 지금 쓰는 미납 문자 흐름(sendUnpaidAll)이 그대로인가 — **실제 문자 0**
   ★ 바깥 요청은 전부 막는다(file:// 만). 문자는 sms: 로 창을 여는 방식이라 window.open 을 가로챈다. */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const cp = require('child_process');
/* ★ v271 보정1: 이 뮶은 **v270 회차 기록**이다 — 새 죽도 그 회차 커밋에 고정한다.
   지금까지는 **일하는 폴더**의 index.html 을 읽었다. 그래서 v271 보정1 이
   문답을 하나 더하자(74→75) 「문답 수 74」가 깨졌다 — v270 이 틀린 것이 아니다.
   **지금** 문답표는 run271b.js 와 m_qa257.js 가 본다. */
const NEW_REF = process.env.COS_SRC_NEW_REF || '9296953';   /* v270 */
const APP = require('path').join(__dirname, 'pin270_index.html');
require('fs').writeFileSync(APP, cp.execSync(
  'git -C ' + COS_ROOT + ' show ' + NEW_REF + ':index.html', { maxBuffer: 1 << 28 }));
const OLD_REF = process.env.COS_SRC_OLD_REF || 'fe7cfc8';
const SIZES = [[390, 844], [360, 640], [1366, 768]];

const SEED = {
  members: [
    { id:1, name:'가하은', courseId:'c1', carId:'car1', phone:'010-1111-1111', phone2:'010-1111-2222',
      days:['월','화','수','목','금'], monthly:130000, regfee:150000, pin:'1001', on:true,
      location:'인천 연수구 용담로 111' },
    { id:2, name:'나여름', courseId:'c1', carId:'car1', phone:'010-2222-1111',
      days:['월','수','금'], monthly:120000, regfee:150000, pin:'1002', on:true,
      location:'인천 연수구 앵고개로 22' }
  ],
  cars: [{ id:'car1', name:'1호차', driver:'박기사' }],
  courses: [{ id:'c1', name:'A반', depart:'15:00' }],
  org: { name:'가온학원', bizNo:'635-88-02710', ceo:'문준식', address:'인천 연수구 용담로 111' }
};

async function app(b, w, h, file) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e && e.message)));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/net::ERR_|Failed to load resource|Failed to fetch/.test(t)) return;
    if (/version\.json/.test(t) && /CORS/.test(t)) return;
    errs.push('console: ' + t.slice(0, 140));
  });
  await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
  await p.goto('file:///' + (file || APP).replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof window.helperAnswer === 'function'
    || typeof helperAnswer === 'function', {}, { timeout: 20000 });
  await p.evaluate((seed) => {
    window.__alerts = []; window.alert = (m) => window.__alerts.push(String(m));
    window.__confirms = []; window.confirm = (m) => { window.__confirms.push(String(m)); return true; };
    /* ★ 문자는 sms: 주소로 창을 여는 방식이다 — 가로채서 「무엇이 나갈 뻔했나」만 모은다.
       실제로 문자앱이 열리거나 문자가 나가는 일은 없다. */
    window.__opened = [];
    window.open = function (u) { window.__opened.push(String(u)); return null; };
    try { window._userBizType = 'academy'; } catch (e) {}
    try { DEFAULT_BIZ_TYPE = 'academy'; _userBizType = 'academy'; } catch (e) {}
    localStorage.setItem('tkd_members', JSON.stringify(seed.members));
    localStorage.setItem('tkd_cars', JSON.stringify(seed.cars));
    localStorage.setItem('tkd_courses', JSON.stringify(seed.courses));
    localStorage.setItem('tkd_org', JSON.stringify(seed.org));
    localStorage.setItem('tkd_payments', '{}');
    try { members = loadMembers(); cars = loadCars(); courses = loadCourses();
          orgSettings = loadOrgSettings(); } catch (e) {}
    const ls = document.getElementById('login-screen'); if (ls) ls.classList.add('hide');
    const ap = document.getElementById('main-app'); if (ap) ap.style.display = 'block';
    const ad = document.getElementById('admin-screen'); if (ad) ad.classList.add('show');
  }, SEED);
  p.__errs = errs;
  return p;
}

(async () => {
  const OLD = path.join(__dirname, 'old_index270.html');
  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html > "' + OLD + '"', { shell: 'bash' });
  const b = await chromium.launch({ channel: 'chrome' });
  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('① 도우미에서 「뒤로가기」를 물으면 새 문답이 나오나');
  for (const [w, h] of SIZES) {
    const p = await app(b, w, h);
    const r = await p.evaluate(() => {
      const ask = (q, mode) => {
        currentMode = mode;                       /* 'driver' 면 기사, 그 밖은 관리자 */
        const a = helperAnswer(q);
        const items = a.item ? [a.item] : (a.items || []);
        return items.map((x) => x.t);
      };
      const out = { qa: HELP_QA.length };
      ['뒤로가기', '뒤로가기를 누르면 어떻게 되나요', '창닫기', '앱이꺼져요', '나가짐'].forEach((q) => {
        out['관리자:' + q] = ask(q, 'admin');
        out['기사:' + q] = ask(q, 'driver');
      });
      const mine = HELP_QA.find((x) => x.t === '뒤로가기를 누르면 어떻게 되나요?');
      out.role = mine ? mine.role : '(없음)';
      out.lines = mine ? mine.a.split('\n').length : 0;
      out.hasCancel = mine ? /확인창에서 뒤로가기는 「취소」/.test(mine.a) : false;
      out.hasBlocked = mine ? /안내 화면은 뒤로가기로 닫히지 않아요/.test(mine.a) : false;
      return out;
    });
    say(r.qa === 74, ('[' + w + 'x' + h + '] 문답 수').padEnd(26) + r.qa + '개');
    say(r.role === 'all', ('[' + w + 'x' + h + '] role').padEnd(26) + r.role + ' (관리자·기사 둘 다)');
    say(r.lines === 5 && r.hasCancel && r.hasBlocked,
      ('[' + w + 'x' + h + '] 답 ①~⑤').padEnd(26) + r.lines + '줄 · 확인창=취소 ' + r.hasCancel
      + ' · 막음 화면 안내 ' + r.hasBlocked);
    ['뒤로가기', '창닫기', '앱이꺼져요', '나가짐'].forEach((q) => {
      const a = r['관리자:' + q] || [], d = r['기사:' + q] || [];
      say(a.includes('뒤로가기를 누르면 어떻게 되나요?') && d.includes('뒤로가기를 누르면 어떻게 되나요?'),
        ('[' + w + 'x' + h + '] 「' + q + '」').padEnd(26)
        + '관리자 ' + JSON.stringify(a).slice(0, 40) + ' · 기사 ' + JSON.stringify(d).slice(0, 40));
    });
    say(p.__errs.length === 0, ('[' + w + 'x' + h + '] 오류 0건').padEnd(26)
      + (p.__errs.length ? p.__errs[0] : 'OK'));
    await p.close();
  }

  console.log('\n② 안 쓰는 「미납 알림 미리보기」 창이 없어졌나');
  {
    const p = await app(b, 390, 844);
    const r = await p.evaluate(() => ({
      modal: !!document.getElementById('unpaid-notice-modal'),
      preview: !!document.getElementById('unpaid-msg-preview'),
      fn: typeof window.sendUnpaidSMS,
      live: typeof window.sendUnpaidAll,
      ids: window.__back.ids.length,
      hasIt: window.__back.ids.indexOf('unpaid-notice-modal') >= 0
    }));
    say(!r.modal && !r.preview, '창·미리보기 칸이 화면에 없다        창 ' + r.modal + ' · 칸 ' + r.preview);
    say(r.fn === 'undefined', 'sendUnpaidSMS 함수가 없다            ' + r.fn);
    say(r.live === 'function', '지금 쓰는 sendUnpaidAll 은 있다       ' + r.live);
    say(r.ids === 32 && !r.hasIt, 'BACK_PANEL_IDS 32개 · 그 id 없음      ' + r.ids + '개 · 들었나 ' + r.hasIt);
    await p.close();
    /* 대조 — 옛 판에는 있었다 */
    const q = await app(b, 390, 844, OLD);
    const o = await q.evaluate(() => ({
      modal: !!document.getElementById('unpaid-notice-modal'),
      fn: typeof window.sendUnpaidSMS, ids: window.__back.ids.length
    }));
    say(o.modal && o.fn === 'function' && o.ids === 33,
      '(대조) 옛 판에는 있었다               창 ' + o.modal + ' · 함수 ' + o.fn + ' · 목록 ' + o.ids + '개');
    await q.close();
  }

  console.log('\n③ 지금 쓰는 미납 문자 흐름이 그대로인가 (실제 문자 0)');
  for (const [w, h] of SIZES) {
    const now = await app(b, w, h);
    const old = await app(b, w, h, OLD);
    const run = (p) => p.evaluate(() => {
      payViewYear = 2026; payViewMonth = 10;
      window.__opened = []; window.__confirms = []; window.__alerts = [];
      sendUnpaidAll();
      return { opened: window.__opened, confirms: window.__confirms, alerts: window.__alerts };
    });
    const a = await run(now), o = await run(old);
    say(JSON.stringify(a) === JSON.stringify(o),
      ('[' + w + 'x' + h + '] 옛 판과 같은 결과').padEnd(30)
      + '물음 ' + JSON.stringify(a.confirms).slice(0, 34) + ' · 연 주소 ' + a.opened.length + '개');
    say(a.opened.length === 1 && /^sms:/.test(a.opened[0]),
      ('[' + w + 'x' + h + '] sms: 로 한 번').padEnd(30) + (a.opened[0] || '').slice(0, 60));
    say(/010-1111-1111/.test(a.opened[0] || '') && /010-2222-1111/.test(a.opened[0] || ''),
      ('[' + w + 'x' + h + '] 미납 두 명 번호가 들었다').padEnd(30)
      + ((a.opened[0] || '').match(/010[-0-9,]*/) || [''])[0].slice(0, 50));
    say(now.__errs.length === 0, ('[' + w + 'x' + h + '] 오류 0건').padEnd(30)
      + (now.__errs.length ? now.__errs[0] : 'OK'));
    await now.close(); await old.close();
  }

  console.log('\n④ 실제로 나간 것');
  say(true, '바깥 요청 전부 차단 · 문자는 window.open 을 가로채 글자만 봄 → 실제 발송 0');

  await b.close();
  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
