/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v267 스텁 — ① api/rc-check.js 삭제 ② 안내 쪽지(showToast) 줄바꿈
   전: 57f6b83 (v266) · 후: 작업 중
   ★ 실제 동작(화면에서 안 잘리는지)은 pw262/run267.js 가 **진짜 크롬 4크기**로 본다.
     이 묶음은 「소스에 있어야 할 것/없어야 할 것」을 지킨다. */
const fs = require('fs');
const cp = require('child_process');
const DIR = '' + COS_ROOT + '/';
const OLD_REF = process.env.COS_SRC_OLD_REF || '57f6b83';
const show = (p) => cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':' + p,
  { maxBuffer: 1 << 28 }).toString();
const exists = (ref, p) => { try { show(p); return true; } catch (e) { return false; } };

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const NEW = fs.readFileSync(DIR + 'index.html', 'utf8');
const OLD = show('index.html');

console.log('① api/rc-check.js — 지웠다');
{
  ck('파일이 없다', fs.existsSync(DIR + 'api/rc-check.js'), false);
  ck('  (대조) 옛 판에는 있었다', exists(OLD_REF, 'api/rc-check.js'), true);
  /* 부르는 곳 0 — 저장소 전 파일을 훑는다(스스로 빼고) */
  /* ★ 코스로드53: `^tests` 를 더했다 — 묶음이 **저장소 안으로** 들어오면서
     이 훑기가 **자기 자신**(`tests/a_app267.js` 안의 'rc-check' 글자)을 잡아
     「부르는 파일 1개」로 거짓 실패했다(옮긴 직후 실측: 실패 2건).
     이 훑기는 **앱·서버 파일**을 보는 것이라 묶음은 대상이 아니다. */
  const skip = /node_modules|^\.git|^\.claude|^tests/;
  const walk = (d, out) => {
    for (const e of fs.readdirSync(DIR + d, { withFileTypes: true })) {
      const rel = d ? d + '/' + e.name : e.name;
      if (skip.test(rel)) continue;
      if (e.isDirectory()) walk(rel, out);
      else if (/\.(html|js|json|md|rules|txt|webmanifest)$/.test(e.name)) out.push(rel);
    }
    return out;
  };
  const files = walk('', []);
  const read = (f) => fs.readFileSync(DIR + f, 'utf8');
  /* ★ 「부르는 곳」과 「말하는 곳」을 가른다 —
     CLAUDE.md 에는 **지웠다는 기록**을 일부러 남겼으므로 글자는 하나 남아 있다. */
  const CALL = /\/api\/rc-check|rc-check\.js/;
  const calls = files.filter((f) => CALL.test(read(f)) && f !== 'CLAUDE.md');
  ck('rc-check 를 **부르는** 파일', calls.join(',') || '없음', '없음');
  const mentions = files.filter((f) => /rc-check/.test(read(f)));
  ck('  말하는 곳은 기록 한 곳뿐', mentions.join(','), 'CLAUDE.md');
  ck('  그 한 줄은 「지웠다」는 기록이다', /`rc-check\.js` \*\*지웠다\*\*/.test(read('CLAUDE.md')), true);
  ck('  (대조) 훑은 파일 수', files.length >= 10, true);
  console.log('      훑은 파일 ' + files.length + '개');
  /* 대조 시험 — 이 찾기가 진짜 호출 한 건을 잡나 */
  ck('  (대조 시험) 가짜 호출을 끼우면 잡는다',
     CALL.test('fetch("https://cosroad.vercel.app/api/rc-check")'), true);
  ck('  (대조 시험) 기록 문장만으로는 안 잡는다',
     CALL.test('`rc-check` 는 지웠다 (설명 문장)'), false);
  ck('남은 api 파일 수', fs.readdirSync(DIR + 'api').length, 12);
  ck('  rc-notify 도 없다 (v266 보정1)', fs.existsSync(DIR + 'api/rc-notify.js'), false);
  /* 환경변수는 안 건드렸다 — RC_TMAP_KEY 는 rc-quick 이 쓴다 */
  const quick = fs.readFileSync(DIR + 'api/rc-quick.js', 'utf8');
  ck('RC_TMAP_KEY 를 rc-quick 이 쓴다 (지우면 안 된다)', /process\.env\.RC_TMAP_KEY/.test(quick), true);
  /* 줄끝(CRLF/LF)만 다를 수 있으니 CR 을 떼고 비교한다 — git 은 LF 로 보관한다 */
  const noCR = (t) => t.split(String.fromCharCode(13)).join('');
  ck('rc-quick 은 한 글자도 안 바꿨다', noCR(quick) === noCR(show('api/rc-quick.js')), true);
  const left = fs.readdirSync(DIR + 'api')
    .filter((f) => /RC_SA_EMAIL|RC_SA_KEY/.test(fs.readFileSync(DIR + 'api/' + f, 'utf8')));
  ck('RC_SA_EMAIL·RC_SA_KEY 를 쓰는 api 파일', left.join(',') || '없음', '없음');
}

console.log('\n② showToast — 줄바꿈');
{
  const fn = (src) => {
    const i = src.indexOf('function showToast(');
    let j = src.indexOf('{', i), d = 0, end = j;
    for (; end < src.length; end++) { const c = src[end]; if (c === '{') d++; else if (c === '}') { d--; if (!d) break; } }
    return src.slice(i, end + 1);
  };
  const n = fn(NEW), o = fn(OLD);
  ck('nowrap 이 없다', /white-space\s*:\s*nowrap/.test(n), false);
  ck('  (대조) 옛 판에는 nowrap 이 있었다', /white-space\s*:\s*nowrap/.test(o), true);
  ck('white-space:normal', /white-space:normal/.test(n), true);
  ck('word-break:keep-all (5개 파일 body 와 같은 줄)', /word-break:keep-all/.test(n), true);
  ck('overflow-wrap:anywhere (같은 줄의 짝)', /overflow-wrap:anywhere/.test(n), true);
  ck('max-width:calc(100vw - 32px)', /max-width:calc\(100vw - 32px\)/.test(n), true);
  /* ★ width:max-content 가 빠지면 left:50% 때문에 화면 **절반**에서 접힌다 (실측으로 겪음) */
  ck('width:max-content 가 있다 (없으면 절반에서 접힌다)', /width:max-content/.test(n), true);
  ck('text-align:center', /text-align:center/.test(n), true);
  ck('line-height 가 있다', /line-height:1\.5/.test(n), true);
  /* 안 바뀐 것 — 위치·색·크기·2초 */
  for (const [what, re] of [['아래에서 100px', /bottom:100px/], ['가운데 left:50%', /left:50%/],
                            ['translateX(-50%)', /transform:translateX\(-50%\)/],
                            ['바탕색 #344054', /background:#344054/], ['글자 흰색', /color:white/],
                            ['안쪽 여백 10px 20px', /padding:10px 20px/], ['둥근 모서리 20px', /border-radius:20px/],
                            ['글자 13px', /font-size:13px/], ['굵게 700', /font-weight:700/],
                            ['z-index 9999', /z-index:9999/], ['2초 뒤 사라짐', /setTimeout\(function\(\)\{t\.remove\(\);\},2000\)/]]) {
    ck('  그대로 — ' + what, re.test(n) && re.test(o), true);
  }
  /* 보정1 에서 saveCarsAndMembers 가 showToast 를 부르게 되어 하나 늘었다 (96 -> 97) */
  /* ★ v270 에서 안 쓰는 sendUnpaidSMS 를 지워 showToast 부르는 곳이 하나 줄었다(97 -> 96).
     이 묶음이 지켜야 할 것은 「showToast 를 많이 쓰고 있고, **쪽지를 만드는 자리는 한 곳**」이다.
     부르는 곳 수는 회차마다 바뀌므로 못 박지 않고 지금 수를 적어 둔다. */
  ck('showToast 를 부르는 곳 (90곳 이상)',
     ((NEW.match(/showToast\s*\(/g) || []).length >= 90) + ' / '
     + (NEW.match(/showToast\s*\(/g) || []).length, 'true / '
     + (NEW.match(/showToast\s*\(/g) || []).length);
}

console.log('\n3. 같은 꼴 안내는 이제 showToast 하나뿐 (v267 보정1)');
{
  /* v267 까지는 saveCarsAndMembers 안에 **손으로 베낀 쪽지**가 남아 있었다.
     보정1 에서 showToast 한 줄로 합쳤다 — 검사를 「있다」에서 「없다」로 뒤집었다. */
  const fnOf = (src, name) => {
    const i = src.indexOf('function ' + name + '(');
    let j = src.indexOf('{', i), d = 0, e = j;
    for (; e < src.length; e++) { const c = src[e]; if (c === '{') d++; else if (c === '}') { d--; if (!d) break; } }
    return src.slice(j, e + 1);
  };
  const body = fnOf(NEW, 'saveCarsAndMembers');
  ck('saveCarsAndMembers 에 베낀 쪽지가 없다', /position:fixed;bottom:80px/.test(body), false);
  ck('  (대조) 옛 판에는 있었다', /position:fixed;bottom:80px/.test(fnOf(OLD, 'saveCarsAndMembers')), true);
  ck('showToast 를 부른다', /showToast\('✅ 저장됐어요!'\)/.test(body), true);
  ck('  쪽지를 손으로 만들지 않는다', /createElement\('div'\)/.test(body), false);
  ck('  저장은 그대로 한다', /saveCars\(cars\); saveMembers\(\);/.test(body), true);
  ck('  flushDriverPay 도 그대로', /flushDriverPay\(\)/.test(body), true);
  ck('「아래 가운데」 쪽지를 만드는 자리 수', (NEW.match(/position:fixed;bottom:\d+px;left:50%/g) || []).length, 1);
  ck('  (대조) 옛 판은 둘이었다', (OLD.match(/position:fixed;bottom:\d+px;left:50%/g) || []).length, 2);
  for (const f of ['home.html', 's.html', 'terms.html', 'privacy.html']) {
    const t = fs.readFileSync(DIR + f, 'utf8');
    ck(f + ' 에 떠 있다 사라지는 쪽지 없음', /white-space\s*:\s*nowrap[^]{0,400}?setTimeout/.test(t), false);
  }
}

console.log('\n3-2. 저장소 맨 위 옛 사본 둘 — 지웠다 (v267 보정1)');
{
  for (const f of ['rc-check.js', 'rc-quick.js']) {
    ck(f + ' 가 맨 위에 없다', fs.existsSync(DIR + f), false);
    ck('  (대조) 옛 판에는 있었다', (() => { try {
          cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':' + f,
            { stdio: ['ignore', 'pipe', 'ignore'] }); return true; } catch (e) { return false; } })(), true);
  }
  /* 헷갈리지 말 것 — api/rc-quick.js 는 **실제 티맵 서버**다 */
  ck('api/rc-quick.js 는 그대로 있다', fs.existsSync(DIR + 'api/rc-quick.js'), true);
  ck('  한 글자도 안 바뀌었다', (() => {
      const noCR = (t) => t.split(String.fromCharCode(13)).join('');
      return noCR(fs.readFileSync(DIR + 'api/rc-quick.js', 'utf8')) === noCR(show('api/rc-quick.js')); })(), true);
  ck('앱이 부르는 티맵 주소는 그대로', /cosroad\.vercel\.app\/api\/rc-quick/.test(NEW), true);
  ck('맨 위에 남은 .js 파일', fs.readdirSync(DIR).filter((f) => /\.js$/.test(f)).join(','), 'sw.js');
}

console.log('\n④ 버전');
{
  const vj = JSON.parse(fs.readFileSync(DIR + 'version.json', 'utf8'));
  const av = Number((NEW.match(/const APP_VERSION = (\d+);/) || [])[1]);
  /* ★ v268 에서 버전이 268 로 올랐다. 이 묶음이 지켜야 할 것은 「267 이상이고 두 값이 같다」다. */
  ck('APP_VERSION · version.json (267 이상 · 둘이 같음)', (av >= 267 && av === vj.version) + ' / ' + av, 'true / ' + av);
  ck('옛 판은 266', Number((OLD.match(/const APP_VERSION = (\d+);/) || [])[1]), 266);
}

console.log('\n⑤ 문답표 — 이번 회차는 기능 설명이 안 바뀌었다');
{
  const qa = (src) => {
    const i = src.indexOf('HELP_QA');
    const j = src.indexOf('\n];', i);
    return src.slice(i, j);
  };
  /* ★ v268 이 문답을 고쳤으므로 작업트리와는 더 비교할 수 없다.
     이 묶음이 지켜야 할 것은 「**v267 회차 자체**는 문답을 안 건드렸다」이고,
     그것은 커밋 둘(57f6b83 → 1c79940)을 맞대면 영원히 확인된다. */
  const V267 = cp.execSync('git -C ' + COS_ROOT + ' show 1c79940:index.html',
    { maxBuffer: 1 << 28 }).toString();
  ck('v267 회차는 문답을 한 글자도 안 바꿨다', qa(V267) === qa(OLD), true);
  ck('  (대조) 비교 대상이 비어 있지 않다', qa(V267).length > 10000, true);
  ck('  (대조) v268 은 문답을 고쳤다', qa(NEW) !== qa(V267), true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
