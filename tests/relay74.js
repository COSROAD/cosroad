/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드74-B — 알리고 **중계** (v319)
   알리고가 고정 IP만 받게 바뀌어, 알리고 호출만 가비아 중계 서버(공인 IP 하나)를 거치게 했다.
   보는 것
     ① 환경변수가 **없으면** 지금까지와 **같은 주소**로 간다(옛 길 그대로)
     ② 있으면 **중계 주소 + `X-Relay-Token`** 으로 간다
     ③ 몸통이 **바이트 그대로**다 — 세 자리(인증번호·문자·알림톡) 모두
     ④ `Content-Type` 이 **자리마다 원래 값 그대로**(①②는 `;charset=UTF-8`, ③은 없음)
     ⑤ 응답 꼴이 **안 바뀐다**(⑳) · 토큰·키가 **응답·기록에 안 들어간다**
     ⑥ **다시 보내기 0**(한 번만 부른다) · 시간 초과 20초
     ⑦ 중계 문지기(`relay/relay.js`) 갈래 **전수** — 허용 목록 · 401 · 405 · 404 · 413 · 415 · 429
        · 물음표 붙은 주소 · 몸통 바이트 그대로 · 알리고 응답 그대로 · 504 · 재시도 0
     ⑧ 토큰이 **비어 있으면 시작하지 않는다**
     ⑨ 조용한 넷에 **실패 기록 한 줄**
   ★ 가짜 fetch·가짜 알리고 — **실제 알리고 호출 0건** · 중계는 **로컬 포트**에만 띄운다(바깥 통신 0) */
const fs = require('fs');
const cp = require('child_process');
const http = require('http');
const path = require('path');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 44)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const LF = (x) => x.replace(/\r\n/g, '\n');
const SRC = {
  ali:   LF(fs.readFileSync(COS_ROOT + '/lib/aligo-fetch.js', 'utf8')),
  otp:   LF(fs.readFileSync(COS_ROOT + '/lib/otp-core.js', 'utf8')),
  sms:   LF(fs.readFileSync(COS_ROOT + '/lib/sms-core.js', 'utf8')),
  alim:  LF(fs.readFileSync(COS_ROOT + '/lib/alimtalk-core.js', 'utf8')),
  relay: LF(fs.readFileSync(COS_ROOT + '/relay/relay.js', 'utf8')),
  guide: LF(fs.readFileSync(COS_ROOT + '/relay/README.md', 'utf8')),
  drv:   LF(fs.readFileSync(COS_ROOT + '/api/driver-auth.js', 'utf8')),
  sign:  LF(fs.readFileSync(COS_ROOT + '/api/signup.js', 'utf8'))
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 한 벌을 **가짜 fetch** 와 함께 올린다 (실제 통신 0) ──────────────────── */
function loadAligo(env) {
  const calls = [];
  const box = { env: Object.assign({}, env), calls: calls, reply: { result_code: 1, message: 'ok' } };
  const body = SRC.ali.replace(/^export /mg, '');
  const fn = new Function('process', 'fetch', 'AbortSignal', body
    + '\nreturn { aligoFetch, aligoUrl, relayBase, ALIGO_DIRECT, RELAY_PATH, ALIGO_TIMEOUT_MS };');
  const fakeFetch = async (url, opt) => {
    calls.push({ url: String(url), method: (opt || {}).method,
                 headers: Object.assign({}, (opt || {}).headers),
                 body: String((opt || {}).body == null ? '' : (opt || {}).body),
                 hasSignal: !!(opt || {}).signal });
    if (box.throwIt) throw new Error('network');
    return { status: 200, json: async () => box.reply };
  };
  const fakeAbort = { timeout: (ms) => { box.timeoutMs = ms; return { __ms: ms }; } };
  box.mod = fn({ env: box.env }, fakeFetch, fakeAbort);
  return box;
}

(async () => {

console.log('════ ① 환경변수가 없으면 — **지금까지와 같은 주소**');
{
  const B = loadAligo({});
  ck('★ 문자 주소 그대로', B.mod.aligoUrl('sms'), 'https://apis.aligo.in/send/');
  ck('★ 알림톡 주소 그대로', B.mod.aligoUrl('alimtalk'),
    'https://kakaoapi.aligo.in/akv10/alimtalk/send/');
  ck('  `relayBase()` 는 빈 글자', JSON.stringify(B.mod.relayBase()), '""');
  await B.mod.aligoFetch('sms', 'a=1', 'application/x-www-form-urlencoded;charset=UTF-8');
  ck('★ 토큰 머리말을 **안 붙인다**(중계를 안 쓴다)',
    Object.prototype.hasOwnProperty.call(B.calls[0].headers, 'X-Relay-Token'), false);
  /* 빈 글자·공백만 있는 값도 「없음」으로 본다 */
  const B2 = loadAligo({ ALIGO_RELAY_URL: '   ' });
  ck('  공백만 있으면 「없음」', B2.mod.aligoUrl('sms'), 'https://apis.aligo.in/send/');
}

console.log('\n════ ② 환경변수가 있으면 — **중계 주소 + 비밀 머리말**');
{
  const B = loadAligo({ ALIGO_RELAY_URL: 'https://relay.cosroad.com', ALIGO_RELAY_TOKEN: 'TTT' });
  ck('★ 문자', B.mod.aligoUrl('sms'), 'https://relay.cosroad.com/a/sms');
  ck('★ 알림톡', B.mod.aligoUrl('alimtalk'), 'https://relay.cosroad.com/a/alimtalk');
  const B2 = loadAligo({ ALIGO_RELAY_URL: 'https://relay.cosroad.com///' });
  ck('  끝의 `/` 는 떼어 쓴다', B2.mod.aligoUrl('sms'), 'https://relay.cosroad.com/a/sms');
  await B.mod.aligoFetch('sms', 'a=1', 'application/x-www-form-urlencoded;charset=UTF-8');
  ck('★ `X-Relay-Token` 을 붙인다', B.calls[0].headers['X-Relay-Token'], 'TTT');
  ck('  POST 로 보낸다', B.calls[0].method, 'POST');
  ck('★ 시간 초과를 건다(20초)', B.timeoutMs, 20000);
  ck('  `signal` 이 실려 있다', B.calls[0].hasSignal, true);
  /* 모르는 kind 는 문자로 본다(가지가 늘어도 알림톡으로 새지 않게) */
  ck('  모르는 kind 는 문자 쪽', B.mod.aligoUrl('zzz'), 'https://relay.cosroad.com/a/sms');
}

console.log('\n════ ③④ 세 자리 — 몸통 **바이트 그대로** · `Content-Type` 자리마다 그대로');
{
  /* 소스에서 직접 센다 — 세 자리가 **무엇을 넘기는지** */
  ck('★ 부르는 자리는 **셋**',
    (SRC.otp.match(/aligoFetch\(/g) || []).length
    + (SRC.sms.match(/aligoFetch\(/g) || []).length
    + (SRC.alim.match(/aligoFetch\(/g) || []).length, 3);
  ck('  ① 인증번호 — `form.toString()` 그대로 · `;charset=UTF-8`',
    /aligoFetch\('sms', form\.toString\(\),\s*\n?\s*'application\/x-www-form-urlencoded;charset=UTF-8'\)/.test(SRC.otp), true);
  ck('  ② 문자 — 같은 꼴',
    /aligoFetch\('sms', form\.toString\(\),\s*\n?\s*'application\/x-www-form-urlencoded;charset=UTF-8'\)/.test(SRC.sms), true);
  ck('★ ③ 알림톡 — `;charset` **없이**(원래 값 그대로)',
    /aligoFetch\('alimtalk', form\.toString\(\),\s*\n?\s*'application\/x-www-form-urlencoded'\)/.test(SRC.alim), true);
  /* ★ `aligoFetch(` 는 **대문자 F** 라 `fetch(` 에 안 걸린다 — 그래서 그냥 0 이어야 한다
     (처음에 빼기를 했다가 **음수**가 나왔다). */
  ck('★ 셋에 날 `fetch(` 가 **하나도 안 남았다**',
    (SRC.otp + SRC.sms + SRC.alim).split('fetch(').length - 1, 0);
  /* ★★ 알리고 주소가 **따옴표 안에** 있으면 그 자리가 직접 부르는 것이다 —
     쪽지에 적어 둔 주소(`…` 나 맨글자)는 **설명**이라 괜찮다. 따옴표만 센다. */
  const QUOTED = /['"]https?:\/\/[^'"]*aligo\.in/g;
  ck('★ 알리고 주소를 **따옴표로 들고 있는 자리 0**(셋 다)',
    ((SRC.otp + SRC.sms + SRC.alim).match(QUOTED) || []).length, 0);
  ck('  그 주소는 **한 벌**(`lib/aligo-fetch.js`)에 둘',
    (SRC.ali.match(QUOTED) || []).length, 2);
  ck('  import 줄 셋 (㊳ — 직접 확인)',
    [SRC.otp, SRC.sms, SRC.alim]
      .filter((s) => /^import \{ aligoFetch \} from '\.\/aligo-fetch\.js';$/m.test(s)).length, 3);
  /* 몸통을 **손대지 않는가** — 넘긴 글자가 그대로인지 */
  const B = loadAligo({ ALIGO_RELAY_URL: 'https://r.x', ALIGO_RELAY_TOKEN: 'T' });
  const raw = 'key=K&user_id=U&msg=%EA%B0%80%ED%95%98%EC%9D%80&msg_type=SMS';
  await B.mod.aligoFetch('sms', raw, 'application/x-www-form-urlencoded;charset=UTF-8');
  ck('★ 몸통이 글자 그대로', B.calls[0].body, raw);
  ck('  `Content-Type` 도 그대로', B.calls[0].headers['Content-Type'],
    'application/x-www-form-urlencoded;charset=UTF-8');
}

console.log('\n════ ⑤⑥ 응답 꼴 그대로 · 다시 보내기 0 · 토큰이 안 샌다');
{
  const B = loadAligo({ ALIGO_RELAY_URL: 'https://r.x', ALIGO_RELAY_TOKEN: 'SECRET-TOKEN' });
  B.reply = { result_code: 1, message: 'success', msg_id: 7 };
  const r = await B.mod.aligoFetch('sms', 'a=1', 'application/x-www-form-urlencoded');
  const j = await r.json();
  ck('★ 응답을 손대지 않는다(⑳)', JSON.stringify(j), '{"result_code":1,"message":"success","msg_id":7}');
  ck('★ 한 번만 부른다(재시도 0)', B.calls.length, 1);
  /* 던져도 **다시 부르지 않는다** — 부르는 쪽이 「보내지 못했어요」로 끝낸다 */
  const B2 = loadAligo({ ALIGO_RELAY_URL: 'https://r.x', ALIGO_RELAY_TOKEN: 'T' });
  B2.throwIt = true;
  let threw = false;
  try { await B2.mod.aligoFetch('sms', 'a=1', 'application/x-www-form-urlencoded'); }
  catch (e) { threw = true; }
  ck('★ 실패하면 그대로 던진다(삼키지 않는다)', threw, true);
  ck('★ 그래도 **한 번만** 불렀다', B2.calls.length, 1);
  ck('  한 벌 소스에 `retry`·`for` 다시 보내기 0',
    /retry|다시 보내/.test(SRC.ali.replace(/다시 보내지 않는다|다시 보낼지는|재시도 0/g, '')), false);
  ck('★ 토큰 원문을 기록하지 않는다(한 벌·중계 둘 다)',
    /console\.log[^\n]*TOKEN|console\.log[^\n]*token/i.test(SRC.ali + SRC.relay), false);
}

console.log('\n════ ⑦ 중계 문지기 — 갈래 **전수** (로컬 포트 · 바깥 통신 0)');
{
  /* 가짜 알리고를 **로컬**에 띄우고, 중계의 보낼 곳을 그 주소로 바꿔 돌린다.
     ★ 저장소 파일은 건드리지 않는다 — 글자만 바꿔 임시 파일로 돌린다. */
  const up = { hits: [], status: 200, body: '{"result_code":1}', delayMs: 0, ctype: 'application/json' };
  const upSrv = http.createServer((req, res) => {
    const parts = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', async () => {
      up.hits.push({ url: req.url, ctype: String(req.headers['content-type'] || ''),
                     body: Buffer.concat(parts).toString('utf8'),
                     tok: req.headers['x-relay-token'] || '', host: req.headers['host'] || '' });
      if (up.delayMs) await wait(up.delayMs);
      res.writeHead(up.status, { 'Content-Type': up.ctype });
      res.end(up.body);
    });
  });
  await new Promise((r) => upSrv.listen(0, '127.0.0.1', r));
  const upPort = upSrv.address().port;
  const upBase = 'http://127.0.0.1:' + upPort;

  const TMP = path.join(require('os').tmpdir(), 'cos-relay74-' + process.pid + '.js');
  fs.writeFileSync(TMP, SRC.relay
    .replace("'/a/sms':      'https://apis.aligo.in/send/'", "'/a/sms':      '" + upBase + "/send/'")
    .replace("'/a/alimtalk': 'https://kakaoapi.aligo.in/akv10/alimtalk/send/'",
             "'/a/alimtalk': '" + upBase + "/akv10/'")
    .replace('const UPSTREAM_TIMEOUT_MS = 20000;', 'const UPSTREAM_TIMEOUT_MS = 700;'));

  const TOKEN = 'xxxxxxxxxxxxxxxxxxxxxxxx';          /* 시험용 · 24자(16자 이상) */
  const relayPort = 18099;
  const child = cp.spawn(process.execPath, [TMP],
    { env: Object.assign({}, process.env, { RELAY_TOKEN: TOKEN, RELAY_PORT: String(relayPort) }),
      stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  for (let i = 0; i < 60 && out.indexOf('듣는 중') < 0; i++) await wait(50);

  const hit = (opt) => new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: relayPort, method: opt.method || 'POST',
      path: opt.path, headers: opt.headers || {} }, (res) => {
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => resolve({ code: res.statusCode, body: Buffer.concat(parts).toString('utf8'),
                                    ctype: String(res.headers['content-type'] || '') }));
    });
    req.on('error', (e) => resolve({ code: 0, body: String(e.message), ctype: '' }));
    if (opt.body != null) req.write(opt.body);
    req.end();
  });
  const FORM = { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' };
  const OK = Object.assign({ 'X-Relay-Token': TOKEN }, FORM);

  ck('★ 떴다', out.indexOf('듣는 중') >= 0, true);
  ck('  경로 셋을 알린다', /\/a\/sms \/a\/alimtalk \/healthz/.test(out), true);

  /* 살아있음 — 토큰 없이 · 알리고를 **안 부른다** */
  const h = await hit({ method: 'GET', path: '/healthz' });
  ck('★ `/healthz` 200', h.code + ' ' + h.body, '200 {"ok":true}');
  ck('  그때 알리고를 안 부른다', up.hits.length, 0);
  const hp = await hit({ method: 'POST', path: '/healthz' });
  ck('  `/healthz` 에 POST 면 405', hp.code, 405);

  /* 토큰 */
  const n1 = await hit({ path: '/a/sms', headers: FORM, body: 'a=1' });
  ck('★ 토큰 없으면 401', n1.code + ' ' + n1.body, '401 {"ok":false}');
  const n2 = await hit({ path: '/a/sms', headers: Object.assign({ 'X-Relay-Token': 'nope' }, FORM), body: 'a=1' });
  ck('★ 틀린 토큰도 401(까닭을 안 알려 준다)', n2.code + ' ' + n2.body, '401 {"ok":false}');
  const n3 = await hit({ path: '/a/sms',
    headers: Object.assign({ 'X-Relay-Token': TOKEN + 'x' }, FORM), body: 'a=1' });
  ck('  길이가 다른 토큰도 401(안 터진다)', n3.code, 401);
  ck('  여기까지 알리고 호출 0건', up.hits.length, 0);

  /* 경로·메서드 */
  ck('★ 모르는 경로는 404', (await hit({ path: '/aaa', headers: OK, body: 'a=1' })).code, 404);
  ck('★ 물음표가 붙으면 404(`?url=` 류를 끊는다)',
    (await hit({ path: '/a/sms?url=http://evil', headers: OK, body: 'a=1' })).code, 404);
  ck('  GET 으로 보내면 405', (await hit({ method: 'GET', path: '/a/sms', headers: OK })).code, 405);
  ck('  PUT 도 405', (await hit({ method: 'PUT', path: '/a/sms', headers: OK, body: 'a=1' })).code, 405);
  ck('  그때도 알리고 호출 0건', up.hits.length, 0);

  /* 모양·크기 */
  const bad = await hit({ path: '/a/sms',
    headers: { 'X-Relay-Token': TOKEN, 'Content-Type': 'application/json' }, body: '{}' });
  ck('★ form 이 아니면 415', bad.code, 415);
  const big = await hit({ path: '/a/sms', headers: OK, body: 'a=' + 'x'.repeat(70 * 1024) });
  ck('★ 64KB 를 넘으면 413', big.code, 413);
  ck('  그때도 알리고 호출 0건', up.hits.length, 0);

  /* 제대로 된 요청 — 몸통 바이트 그대로 · 응답 그대로 */
  const raw = 'key=K&msg=%EA%B0%80%ED%95%98%EC%9D%80&msg_type=SMS';
  const ok1 = await hit({ path: '/a/sms', headers: OK, body: raw });
  ck('★ 200', ok1.code, 200);
  ck('★ 알리고 응답을 **그대로** 돌려준다', ok1.body, '{"result_code":1}');
  ck('★ 몸통이 **바이트 그대로**', up.hits[0].body, raw);
  ck('★ `Content-Type` 도 그대로', up.hits[0].ctype, 'application/x-www-form-urlencoded;charset=UTF-8');
  ck('★★ 토큰을 알리고로 **넘기지 않는다**', JSON.stringify(up.hits[0].tok), '""');
  ck('  보낼 곳은 **코드에 박힌** 경로', up.hits[0].url, '/send/');
  const ok2 = await hit({ path: '/a/alimtalk',
    headers: Object.assign({ 'X-Relay-Token': TOKEN },
      { 'Content-Type': 'application/x-www-form-urlencoded' }), body: 'apikey=K' });
  ck('★ 알림톡도 같은 길', ok2.code + ' ' + up.hits[1].url, '200 /akv10/');
  ck('  알림톡 `Content-Type` 은 `;charset` **없이** 그대로', up.hits[1].ctype,
    'application/x-www-form-urlencoded');

  /* 알리고가 거절해도 **그대로** 돌려준다(중계가 판단하지 않는다) */
  up.status = 500; up.body = '{"result_code":-101,"message":"인증오류입니다."}';
  const bad2 = await hit({ path: '/a/sms', headers: OK, body: 'a=1' });
  ck('★ 알리고 상태·몸통을 그대로', bad2.code + ' ' + bad2.body,
    '500 {"result_code":-101,"message":"인증오류입니다."}');
  up.status = 200; up.body = '{"result_code":1}';

  /* 시간 초과 → 504 · **다시 보내지 않는다** */
  const before = up.hits.length;
  up.delayMs = 1500;                                   /* 중계 상한은 700ms 로 바꿔 두었다 */
  const to = await hit({ path: '/a/sms', headers: OK, body: 'a=1' });
  up.delayMs = 0;
  ck('★ 시간이 넘으면 504', to.code + ' ' + to.body, '504 {"ok":false}');
  ck('★★ 그때 알리고를 **한 번만** 불렀다(재시도 0)', up.hits.length - before, 1);

  /* 횟수 제한 — 1분 600 · 아직 안 걸린다(지금까지 열몇 번) */
  ck('  정상 요청은 아직 429 가 아니다',
    (await hit({ path: '/a/sms', headers: OK, body: 'a=1' })).code, 200);
  ck('★ 상한 숫자는 소스 한 곳', /\[60 \* 1000, 600\]/.test(SRC.relay) && /\[3600 \* 1000, 6000\]/.test(SRC.relay), true);

  /* 기록 — 본문·번호·키·토큰이 **없다** */
  await wait(120);
  ck('★★ 기록에 몸통·토큰이 없다',
    out.indexOf(raw) < 0 && out.indexOf(TOKEN) < 0, true);
  ck('  기록 꼴은 「경로 상태 aligo= ms B」', /\/a\/sms\s+200\s+aligo=200\s+\d+ms\s+\d+B/.test(out), true);

  child.kill('SIGTERM');
  await wait(200);
  try { child.kill('SIGKILL'); } catch (e) {}
  upSrv.close();
  try { fs.unlinkSync(TMP); } catch (e) {}
  ck('  (바깥 통신 0 — 가짜 알리고는 127.0.0.1 이었다)', upBase.indexOf('127.0.0.1') > 0, true);
}

console.log('\n════ ⑧ 토큰이 비어 있으면 **시작하지 않는다**');
{
  const run = (tok) => {
    const r = cp.spawnSync(process.execPath, [COS_ROOT + '/relay/relay.js'],
      { env: Object.assign({}, process.env, { RELAY_TOKEN: tok, RELAY_PORT: '18098' }),
        encoding: 'utf8', timeout: 8000 });
    return { code: r.status, err: String(r.stderr || '') + String(r.stdout || '') };
  };
  const a = run('');
  ck('★ 빈 토큰 → 시작 안 함(나감값 1)', a.code, 1);
  ck('  까닭을 알려 준다', /RELAY_TOKEN/.test(a.err), true);
  const b = run('short');
  ck('★ 짧은 토큰(16자 미만)도 시작 안 함', b.code, 1);
  ck('  그 글에 토큰 값이 없다', b.err.indexOf('short') < 0, true);
  ck('  소스에도 그 문지기가 있다', /TOKEN\.length < 16/.test(SRC.relay), true);
  ck('★ `127.0.0.1` 만 듣는다', /const HOST = '127\.0\.0\.1';/.test(SRC.relay), true);
  ck('  바깥 의존 0 (require 는 node: 내장만)',
    (SRC.relay.match(/require\('(?!node:)[^']*'\)/g) || []).length, 0);
}

console.log('\n════ ⑨ 조용한 넷 — 실패 기록 한 줄씩 (번호·본문 없이)');
{
  ck('★ ① 가입 마스터 알림', /\[signup\] 마스터 알림 문자 실패/.test(SRC.sign), true);
  ck('★ ② 가입 계좌 안내', /\[signup\] 계좌 안내 문자 실패/.test(SRC.sign), true);
  ck('★ ③ 하원 문자·알림톡', /\[leave\] 하원 알림 실패/.test(SRC.drv), true);
  ck('★ ④ 출석 기기 알림톡', /\[kiosk\] 출석 알림톡 실패/.test(SRC.drv), true);
  ck('  가입은 **막지 않는다**(문자만 못 간 것이다)',
    /if \(!mSent \|\| !mSent\.ok\) console\.log/.test(SRC.sign), true);
  ck('★ 그 줄에 번호·본문·이름을 넣지 않는다',
    /console\.log\('\[(signup|leave|kiosk)\][^']*', *(digits|masterTo|msg|mr\.name|rcv)/.test(SRC.sign + SRC.drv), false);
  /* (대조) 바로 앞 회차에는 그 넷이 없었다 */
  const PREV = process.env.COS_SRC_PREV_REF || require('./thisref.js').thisRef(319);
  const at = (f) => { try { return LF(cp.execSync('git -C ' + COS_ROOT + ' show ' + PREV + ':' + f,
    { maxBuffer: 1 << 26 }).toString()); } catch (e) { return ''; } };
  const oldSign = at('api/signup.js'), oldDrv = at('api/driver-auth.js');
  ck('  (대조) 앞 회차(v319 커밋)에는 그 넷이 0개',
    (oldSign + oldDrv ? [/\[signup\] 마스터 알림 문자 실패/, /\[signup\] 계좌 안내 문자 실패/,
      /\[leave\] 하원 알림 실패/, /\[kiosk\] 출석 알림톡 실패/]
      .filter((r) => r.test(oldSign + oldDrv)).length : '앞 커밋 없음'), 0);
}

console.log('\n════ ⑩ 설치 글 — 잠길 위험을 막는 줄이 있나');
{
  ck('★ `PermitRootLogin prohibit-password` (no 를 쓰지 않는다)',
    /PermitRootLogin prohibit-password/.test(SRC.guide), true);
  ck('★★ `PermitRootLogin no` 라고 적은 곳이 **0곳**',
    /PermitRootLogin no/.test(SRC.guide), false);
  ck('★ `sshd_config.d` 가 덮는 것을 본다', /sshd_config\.d/.test(SRC.guide), true);
  ck('★ `sshd -T` 로 확인하는 줄이 있다', /sshd -T/.test(SRC.guide), true);
  /* ★★ v319(74-B 보정1): sshd 는 **처음 읽은 값**이 이긴다(공식 `man sshd_config`:
     "for each keyword, the first obtained value will be used" · `Include` 는 **이름 차례**).
     그래서 우리 설정은 **이름이 앞인** `00-cosroad.conf` 여야 한다 —
     `99-` 에 두면 `50-cloud-init.conf` 의 `PasswordAuthentication yes` 가 **먼저 읽혀 이긴다**
     (보정 전에는 `99-` 로 적어 두어, 그대로 하면 비밀번호 로그인이 **안 꺼졌다**). */
  ck('★★ 우리 설정은 `00-cosroad.conf`(가장 먼저 읽힘)',
    /sshd_config\.d\/00-cosroad\.conf/.test(SRC.guide), true);
  ck('★★ `99-cosroad.conf` 라고 적은 곳이 **0곳**',
    /99-cosroad\.conf/.test(SRC.guide), false);
  ck('  까닭을 글에 적어 두었다(처음 읽은 값이 이긴다)',
    /first obtained value|처음 읽은 값/.test(SRC.guide), true);
  ck('  본 파일의 `Include` 줄 번호를 보는 줄이 있다',
    /Include[^\n]*\/etc\/ssh\/sshd_config|grep -nE '\^\[\[:space:\]\]\*Include/.test(SRC.guide), true);
  ck('★ ufw 켜기 **전에** 22 허용',
    SRC.guide.indexOf('ufw allow from') < SRC.guide.indexOf('ufw --force enable'), true);
  ck('★ 사무실 IP 가 바뀌면 들어가는 길', /웹 콘솔|VNC/.test(SRC.guide), true);
  ck('  ⓞ DNS·443 이 먼저', SRC.guide.indexOf('## ⓞ') < SRC.guide.indexOf('## ⓐ'), true);
  ck('★ Vercel 환경변수는 **알리고 승인 뒤**',
    /알리고 승인 뒤|ⓘ 보다 먼저 하면 안 됩니다|ⓙ를 ⓘ보다 먼저/.test(SRC.guide), true);
  ck('  되돌리기 한 줄', /ALIGO_RELAY_URL[^\n]*지우/.test(SRC.guide), true);
  ck('★ 글에 비밀 값이 없다(토큰은 사장님이 적는 칸)',
    /RELAY_TOKEN=[A-Za-z0-9]{8,}/.test(SRC.guide), false);
  ck('  relay.js 를 옮기는 길이 있다', /raw\.githubusercontent\.com|nano \/opt\/cosroad-relay\/relay\.js/.test(SRC.guide), true);
  ck('  토큰은 **두 곳**(서버 파일 + Vercel)', /두 곳/.test(SRC.guide), true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
console.log('※ 가짜 fetch · 가짜 알리고(127.0.0.1) — **실제 알리고 호출 0건** · 바깥 통신 0 · 실제 문자 0');
process.exit(fail ? 1 : 0);
})();
