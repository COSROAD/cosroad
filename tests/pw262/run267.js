/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '../..').replace(/\\/g, '/');
/* v267 — 안내 쪽지(showToast)가 긴 글에서도 화면 밖으로 안 나가나, 실제 크롬 4크기로.
   ★ 바깥 요청은 전부 막는다(file:// 만).
   ★ 대조: **옛 판(57f6b83)에서 같은 문구가 잘리던 것**을 먼저 보인다.
     그래야 「안 잘린다」가 「원래 안 잘렸다」와 구별된다. */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const cp = require('child_process');

const NEW = '' + COS_ROOT + '/index.html';
const OLD = path.join(__dirname, 'old_index267.html');
const SHOT = path.join(__dirname, 'shots267');
const SIZES = [[1920, 969], [1366, 768], [390, 844], [360, 640]];

/* 실제로 쓰이는 가장 긴 문구 다섯 (서버 문구가 '발송 실패: ' 를 달고 오는 것까지) */
const LONG = [
  ['① 하루 상한 429 (가장 긴 것)',
   '발송 실패: 오늘 보낼 수 있는 문자 수(3,000건)를 다 썼어요. 내일 다시 보내시거나 cosroad@cosroad.com 으로 알려 주세요.'],
  ['② 명부 밖 번호 403',
   '발송 실패: 회원 명부에 없는 번호가 3개 있어요. 회원관리에서 번호를 확인해 주세요.'],
  ['③ 주소 미확인 (글자 그대로 중 가장 긴 것)',
   '⚠ 주소 위치가 확인되지 않았어요 — 주소 옆 「검색」을 눌러 결과를 선택해 주세요'],
  ['④ 기간·승인 403',
   '🔒 이용 기간이 끝났거나 승인 전이라 문자를 보낼 수 없어요.'],
  ['⑤ 하차 장소 미확인',
   '⚠ 하차 장소 위치가 확인되지 않았어요 — 「검색」으로 결과를 선택해 주세요']
];
/* 짧은 것 — 지금처럼 한 줄이어야 한다 */
const SHORT = [
  ['짧은 것 ㉠', '✅ 저장됐어요!'],
  ['짧은 것 ㉡', '🔒 이용 기간이 끝나 문자를 보낼 수 없어요']
];

const measure = async (p, msg) => p.evaluate((m) => {
  document.querySelectorAll('.__t267').forEach((e) => e.remove());
  window.showToast(m);
  const t = Array.from(document.body.children).reverse()
    .find((e) => e.textContent === m && /fixed/.test(e.style.position));
  if (!t) return null;
  t.classList.add('__t267');
  const r = t.getBoundingClientRect();
  const cs = getComputedStyle(t);
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
  return {
    left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height),
    vw: window.innerWidth,
    out: Math.round(Math.max(0, -r.left) + Math.max(0, r.right - window.innerWidth)),
    lines: Math.max(1, Math.round((r.height - (parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom))) / lh)),
    nowrap: cs.whiteSpace === 'nowrap', bottom: Math.round(window.innerHeight - r.bottom),
    bg: cs.backgroundColor, fs: cs.fontSize, align: cs.textAlign
  };
}, msg);

(async () => {
  cp.execSync('git -C ' + COS_ROOT + ' show 57f6b83:index.html > "' + OLD + '"', { shell: 'bash' });
  fs.mkdirSync(SHOT, { recursive: true });
  const b = await chromium.launch({ channel: 'chrome' });
  const out = { new: {}, old: {} };

  for (const [tag, file, store] of [['새 판', NEW, out.new], ['옛 판', OLD, out.old]]) {
    for (const [w, h] of SIZES) {
      const key = w + 'x' + h;
      const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await p.route('**', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
      await p.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => typeof window.showToast === 'function', { timeout: 20000 });
      store[key] = {};
      for (const [label, msg] of LONG.concat(SHORT)) store[key][label] = await measure(p, msg);

      /* 캡처 — 새 판에서만. 360 은 가장 긴 문구, 1920 은 짧은 문구 (원본 색 그대로) */
      if (tag === '새 판' && (w === 360 || w === 1920)) {
        const msg = (w === 360) ? LONG[0][1] : SHORT[1][1];
        const r = await p.evaluate((m) => {
          document.querySelectorAll('.__t267').forEach((e) => e.remove());
          window.showToast(m);
          const t = Array.from(document.body.children).reverse()
            .find((e) => e.textContent === m && /fixed/.test(e.style.position));
          t.classList.add('__t267');
          const b = t.getBoundingClientRect();
          return { x: Math.max(0, b.left - 8), y: Math.max(0, b.top - 8),
                   width: Math.min(window.innerWidth, b.width + 16), height: b.height + 16 };
        }, msg);
        await p.screenshot({ path: path.join(SHOT, 'v267_toast_' + w + '.png'), clip: r });
      }
      await p.close();
    }
  }
  await b.close();
  fs.writeFileSync(path.join(__dirname, 'res267.json'), JSON.stringify(out, null, 1));

  let bad = 0;
  const say = (ok, line) => { if (!ok) bad++; console.log('  ' + (ok ? 'o' : 'X') + ' ' + line); };

  console.log('① 대조 — 옛 판(57f6b83)에서는 긴 문구가 화면 밖으로 삐져나갔다');
  for (const [label] of LONG) {
    const v = out.old['360x640'][label];
    say(v.out > 0 && v.nowrap && v.lines === 1,
      ('[옛 판 360] ' + label).padEnd(44) + '폭 ' + String(v.w).padEnd(5) + '화면 밖 ' + String(v.out).padEnd(5)
      + '줄 ' + v.lines + '  nowrap=' + v.nowrap);
  }
  console.log('   (삐져나간 양이 0보다 커야 「고칠 것이 있었다」가 참이다)');

  console.log('\n② 새 판 — 긴 문구 다섯이 네 크기에서 화면 안에 다 들어온다');
  for (const [w, h] of SIZES) {
    const key = w + 'x' + h;
    for (const [label] of LONG) {
      const v = out.new[key][label];
      say(v.out === 0 && v.left >= 0 && v.right <= v.vw && !v.nowrap,
        ('[' + key + '] ' + label).padEnd(50) + '폭 ' + String(v.w).padEnd(5)
        + '왼 ' + String(v.left).padEnd(5) + '오른 ' + String(v.right).padEnd(5)
        + '화면 ' + String(v.vw).padEnd(5) + '줄 ' + v.lines);
    }
  }

  console.log('\n③ 새 판 — max-width 는 화면폭−32px 를 넘지 않는다');
  for (const [w] of SIZES) {
    const key = w + 'x' + SIZES.find((s) => s[0] === w)[1];
    const worst = Math.max.apply(null, LONG.map(([l]) => out.new[key][l].w));
    say(worst <= w - 32, ('[' + key + '] 가장 넓은 쪽지').padEnd(30) + worst + ' ≤ ' + (w - 32));
  }

  console.log('\n④ 새 판 — 짧은 문구는 지금처럼 한 줄');
  for (const [w] of SIZES) {
    const key = w + 'x' + SIZES.find((s) => s[0] === w)[1];
    for (const [label] of SHORT) {
      const v = out.new[key][label];
      say(v.lines === 1 && v.out === 0,
        ('[' + key + '] ' + label).padEnd(30) + '폭 ' + String(v.w).padEnd(5) + '줄 ' + v.lines);
    }
  }

  console.log('\n⑤ 위치·색·글자 크기는 그대로 (옛 판과 같은 값)');
  for (const [w] of SIZES) {
    const key = w + 'x' + SIZES.find((s) => s[0] === w)[1];
    const n = out.new[key]['짧은 것 ㉠'], o = out.old[key]['짧은 것 ㉠'];
    say(n.bottom === o.bottom && n.bg === o.bg && n.fs === o.fs,
      ('[' + key + ']').padEnd(12) + '아래에서 ' + n.bottom + 'px(옛 ' + o.bottom + ') · '
      + n.bg + '(옛 ' + o.bg + ') · ' + n.fs + '(옛 ' + o.fs + ')');
  }
  {
    const a = out.new['360x640']['짧은 것 ㉠'];
    say(a.align === 'center', '가운데 정렬  text-align=' + a.align);
  }

  console.log('\n⑥ 캡처 (원본 색 그대로)');
  for (const f of ['v267_toast_360.png', 'v267_toast_1920.png']) {
    const sz = fs.existsSync(path.join(SHOT, f)) ? fs.statSync(path.join(SHOT, f)).size : 0;
    say(sz > 0, f.padEnd(26) + sz + ' B');
  }

  console.log('\n' + (bad ? '✘ 실패 ' + bad + '건' : '✔ 전부 통과'));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
