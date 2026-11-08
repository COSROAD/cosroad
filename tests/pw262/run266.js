/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v266 — 실제 크롬 4크기로 「문자가 막혔을 때」를 보고 캡처한다.
   ★ 바깥 요청은 전부 막는다(file:// 만) — 알리고로 나가는 길이 아예 없다. */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const FILE = '' + COS_ROOT + '/index.html';
const SHOT = path.join(__dirname, 'shots266');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

const STUB = () => {
  window.alert = function(){}; window.confirm = function(){ return true; };
  window._userUid = 'UID123456789012'; window._isDriverAcct = false;
  window._userOrgName = '가온학원';
  window._auth = { currentUser: { uid:'UID1', isAnonymous:false, getIdToken: () => Promise.resolve('TOK') } };
  window.getUrlOrg = function(){ return 'academy_UID123456789'; };
  window.__calls = [];
  const realFetch = window.fetch;
  window.fetch = function(u, o){
    window.__calls.push(String(u));
    return Promise.resolve({ json: () => Promise.resolve({ result_code: 1, success_cnt: 1 }) });
  };
  window.orgSettings = window.orgSettings || { name: '가온학원' };
  window.notices = [];
  window.saveNotices = function(){};
  window.renderNotice = function(){ return ''; };
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
    await p.waitForFunction(() => typeof window.sendMsgApi === 'function', { timeout: 20000 });
    await p.evaluate(STUB);

    /* ① 이용 기간이 끝났을 때 — 서버를 **부르지 않고** 안내만 */
    put('readonly', tag, await p.evaluate(async () => {
      window._readOnlyMode = true;
      window.__calls = [];
      const r = await sendMsgApi('send-sms', { receiver: '01011111111', msg: 'x' });
      return { calls: window.__calls.length, blocked: !!r.blocked, msg: r.message };
    }));

    /* ② 알림장을 그 상태로 보내면 토스트가 뜬다 */
    await p.evaluate(async () => {
      document.getElementById('login-screen').classList.add('hide');
      const app = document.getElementById('main-app'); if (app) app.style.display = 'block';
      window.__calls = [];
      const n = { id: 1, content: 'c' };
      await doSendNoticeMessage(n, ['01011111111', '01022222222'], '본문');
      window.__notice = n;
    });
    await p.waitForTimeout(120);
    put('notice', tag, await p.evaluate(() => {
      const t = Array.from(document.querySelectorAll('div'))
        .filter(e => /이용 기간이 끝나/.test(e.textContent || '') && e.children.length === 0)
        .pop();
      return { calls: window.__calls.length, sent: !!(window.__notice && window.__notice.sent),
               toast: t ? (t.textContent || '').trim() : null };
    }));
    await p.screenshot({ path: path.join(SHOT, 'v266_blocked_' + w + '.png') });

    /* ③ 기간이 살아 있으면 보낸다 (대조) */
    put('alive', tag, await p.evaluate(async () => {
      window._readOnlyMode = false;
      window.__calls = [];
      const r = await sendMsgApi('send-sms', { receiver: '01011111111', msg: 'x' });
      const last = window.__calls[window.__calls.length - 1] || '';
      return { calls: window.__calls.length, url: last, ok: r.result_code === 1 };
    }));
    await p.close();
  }
  await b.close();
  fs.writeFileSync(path.join(__dirname, 'res266.json'), JSON.stringify(out, null, 1));

  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };
  for (const tag of Object.keys(out.readonly)) {
    const v = out.readonly[tag];
    say(v.calls === 0 && v.blocked && /이용 기간이 끝나 문자를 보낼 수 없어요/.test(v.msg || ''),
        '기간 끝 → 서버 안 부름  '.padEnd(26) + tag.padEnd(10) + JSON.stringify(v));
  }
  for (const tag of Object.keys(out.notice)) {
    const v = out.notice[tag];
    say(v.calls === 0 && v.sent === false && /이용 기간이 끝나/.test(v.toast || ''),
        '알림장 막힘 안내       '.padEnd(26) + tag.padEnd(10) + JSON.stringify(v));
  }
  for (const tag of Object.keys(out.alive)) {
    const v = out.alive[tag];
    say(v.calls === 1 && /\/api\/send-sms$/.test(v.url) && v.ok,
        '(대조) 살아 있으면 보냄 '.padEnd(26) + tag.padEnd(10) + JSON.stringify(v));
  }
  console.log(bad ? ('\n실패 ' + bad) : '\n화면 12칸 전부 통과');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('ERR', e && e.stack || e); process.exit(1); });
