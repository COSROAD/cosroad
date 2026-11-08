/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v265 — 홈페이지 고친 5곳을 실제 크롬 4크기로 보고 잰다.
   ① 이용 방법 1·2·3  ② 기능 영역 단추  ③ 가입 영역 단추·안내  ④ 챗봇 칩
   가로 넘침(옆으로 밀리는 글)·keep-all 도 함께 본다. 바깥 요청은 file:// 만. */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const HOME = '' + COS_ROOT + '/home.html';
const SHOT = path.join(__dirname, 'shots265');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  fs.mkdirSync(SHOT, { recursive: true });
  const out = {};
  const put = (k, tag, v) => { out[k] = out[k] || {}; out[k][tag] = v; };

  for (const [w, h] of SIZES) {
    const tag = w + 'x' + h;
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.route('**', r => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
    await p.goto('file:///' + HOME, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(400);

    /* 고친 글자가 실제로 보이는가 */
    put('text', tag, await p.evaluate(() => {
      const t = document.body.innerText;
      return {
        step1: /회원가입<?\/?b?>?을 하세요|회원가입을 하세요/.test(t),
        step2: /입금.{0,6}하시면 확인 후 승인해 드려요/.test(t),
        step3: /홈 화면에 추가/.test(t),
        cta1:  /지금 바로 신청하세요/.test(t),
        cta2:  /🚀 지금 바로 시작하기/.test(t),
        note:  /입금 확인 후 승인되면 30일 체험이 먼저 시작돼요/.test(t),
        gone:  !/가입하면 30일 동안|30일 무료 체험으로 직접|30일 무료로 바로 시작/.test(t)
      };
    }));
    /* 챗봇 칩 */
    put('chip', tag, await p.evaluate(() => {
      if (typeof openHelperChat !== 'function') return null;
      openHelperChat();
      const m = document.getElementById('helper-modal');
      const txt = m ? m.innerText : '';
      const ok = /30일 체험/.test(txt) && !/30일 무료 체험/.test(txt);
      /* 그 칩이 여는 문답이 하나로 맞는가 */
      const a = (typeof helperAnswer === 'function') ? helperAnswer('30일 체험') : null;
      if (m) m.remove();
      return { chipOk: ok, hit: a ? a.type : null, title: (a && a.item) ? a.item.t : null };
    }));
    /* 가로 넘침 · keep-all */
    put('layout', tag, await p.evaluate(() => {
      const over = document.documentElement.scrollWidth - window.innerWidth;
      const cs = getComputedStyle(document.body);
      return { overflowPx: over, wordBreak: cs.wordBreak, overflowWrap: cs.overflowWrap };
    }));

    /* 캡처 — **원본 색 그대로** (줄이거나 흑백으로 바꾸지 않는다) */
    for (const [key, sel] of [['step', '#how, section'], ['apply', '#apply']]) {
      try {
        const el = await p.$(key === 'apply' ? '#apply' : 'section');
        if (el) { /* 아래에서 따로 찍는다 */ }
      } catch (e) {}
    }
    await p.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div'))
        .filter(e => /회원가입을 하세요/.test(e.textContent || ''))
        .sort((a, b2) => a.textContent.length - b2.textContent.length)[0];
      if (el) el.scrollIntoView({ block: 'center' });
    });
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(SHOT, 'v265_steps_' + w + '.png') });
    const ap = await p.$('#apply');
    if (ap) { await ap.scrollIntoViewIfNeeded(); await p.waitForTimeout(150); }
    await p.screenshot({ path: path.join(SHOT, 'v265_apply_' + w + '.png') });
    await p.close();
  }
  await b.close();
  fs.writeFileSync(path.join(__dirname, 'res265.json'), JSON.stringify(out, null, 1));

  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };
  for (const tag of Object.keys(out.text)) {
    const v = out.text[tag];
    say(v.step1 && v.step2 && v.step3 && v.cta1 && v.cta2 && v.note && v.gone,
        '고친 글자 ' + tag.padEnd(10) + JSON.stringify(v));
  }
  for (const tag of Object.keys(out.chip)) {
    const v = out.chip[tag];
    say(v && v.chipOk && v.hit === 'answer' && v.title === '30일 체험',
        '챗봇 칩   ' + tag.padEnd(10) + JSON.stringify(v));
  }
  for (const tag of Object.keys(out.layout)) {
    const v = out.layout[tag];
    say(v.overflowPx <= 0 && v.wordBreak === 'keep-all' && v.overflowWrap === 'anywhere',
        '가로 넘침 ' + tag.padEnd(10) + JSON.stringify(v));
  }
  console.log(bad ? ('\n실패 ' + bad) : '\n홈 화면 12칸 전부 통과');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('ERR', e && e.stack || e); process.exit(1); });
