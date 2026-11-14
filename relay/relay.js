#!/usr/bin/env node
// COSROAD — 알리고 중계 문지기 (v319 · 코스로드74-B)
//
// 왜 — 알리고가 **고정 IP만** 받는다. Vercel 함수는 나가는 IP 가 바뀌므로, 알리고 호출만
//   이 서버(공인 IP 하나)를 거쳐 나가게 한다. 알리고가 보는 IP 는 **늘 같다**.
//
// ★★ **열린 프록시가 아니다** — 보낼 곳을 요청에서 받지 않는다. 경로마다 주소가 **코드에 박혀** 있고
//   (`UPSTREAM`), `?url=` 같은 칸이 없다. 물음표가 붙은 주소는 아예 **404** 로 끊는다.
//
// ★★ **몸통을 읽지 않는다** — 받은 바이트를 **그대로** 알리고로 넘긴다. 그래서 알리고 키·전화번호·
//   문자 내용이 이 서버의 **기록에도 변수에도 글자로 남지 않는다**(키는 Vercel 에만 있다 · 74-A 5절).
//
// ★★ **다시 보내지 않는다(재시도 0)** — 문자는 두 번 보내면 **두 번 간다**(되돌릴 수 없다).
//   20초가 넘으면 504 로 알리고 끝낸다. 다시 보낼지는 **사람이** 화면에서 정한다.
//
// 바깥 의존 0 (Node 20 내장만) · `127.0.0.1` 만 듣는다(바깥은 Caddy 가 받는다).
// 기록에 남기는 것: 시각 · 경로 · 내 상태 · 알리고 상태 · 걸린 ms · 몸통 바이트 수. **그것만.**

'use strict';
const http = require('node:http');
const crypto = require('node:crypto');

/* ── 정해진 값 ─────────────────────────────────────────────────────────── */
const PORT = Number(process.env.RELAY_PORT || 8080);
const HOST = '127.0.0.1';                    /* 바깥에서 직접 못 닿는다 */
const MAX_BODY = 64 * 1024;                  /* 64KB — 실제 최대치는 문자 ~8KB·알림톡 ~10KB */
const UPSTREAM_TIMEOUT_MS = 20000;           /* 20초 — 앱 쪽 `aligoFetch` 와 같은 값 */
const RATE = [                               /* [창 ms, 허용 횟수] — 토큰이 샜을 때를 위한 둑 */
  [60 * 1000, 600],
  [3600 * 1000, 6000]
];
/* 보낼 곳 — **여기에 박혀 있다.** 요청이 정하지 못한다. */
const UPSTREAM = {
  '/a/sms':      'https://apis.aligo.in/send/',
  '/a/alimtalk': 'https://kakaoapi.aligo.in/akv10/alimtalk/send/'
};

/* ── 토큰 — 비어 있으면 **시작하지 않는다** ──────────────────────────────
   왜 — 토큰 없이 뜨면 **누구나** 우리 알리고 계정으로 넘길 수 있는 창구가 열린다.
   값은 `/etc/cosroad-relay/env` 의 `RELAY_TOKEN`(권한 600)에만 둔다. 기록에 적지 않는다. */
const TOKEN = String(process.env.RELAY_TOKEN || '');
if (TOKEN.length < 16) {
  console.error('[relay] RELAY_TOKEN 이 없거나 너무 짧습니다(16자 이상). 시작하지 않습니다.');
  process.exit(1);
}
const TOKEN_BUF = Buffer.from(TOKEN, 'utf8');

/* ── 기록 — 본문·번호·키·토큰은 **절대** 적지 않는다 ───────────────────── */
function log(path, status, up, ms, bytes) {
  console.log([
    new Date().toISOString(),
    String(path || '-').padEnd(12),
    String(status).padStart(3),
    'aligo=' + String(up == null ? '-' : up),
    String(ms) + 'ms',
    String(bytes) + 'B'
  ].join('  '));
}
function send(res, status, obj) {
  const b = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
                          'Content-Length': b.length });
  res.end(b);
}

/* ── 토큰 맞추기 — **길이를 먼저** 보고 `timingSafeEqual` ─────────────────
   길이가 다른 버퍼를 `timingSafeEqual` 에 넣으면 **던진다**. 그래서 길이부터 본다.
   (길이가 새는 것은 상관없다 — 토큰 길이는 비밀이 아니다.) */
function tokenOk(raw) {
  const got = Buffer.from(String(raw == null ? '' : raw), 'utf8');
  if (got.length !== TOKEN_BUF.length) return false;
  try { return crypto.timingSafeEqual(got, TOKEN_BUF); } catch (e) { return false; }
}

/* ── 횟수 제한 — 창마다 시각을 쌓고 합으로 센다(한 프로세스라 메모리로 충분) ── */
const hits = [];
function rateOver(now) {
  const keep = Math.max.apply(null, RATE.map((r) => r[0]));
  while (hits.length && now - hits[0] > keep) hits.shift();
  for (let i = 0; i < RATE.length; i++) {
    const [win, max] = RATE[i];
    let n = 0;
    for (let j = hits.length - 1; j >= 0; j--) { if (now - hits[j] > win) break; n++; }
    if (n >= max) return true;
  }
  return false;
}

/* ── 몸통 받기 — 상한을 **읽는 중에** 본다(다 받고 재지 않는다)
   ★★ 넘쳤을 때 **소켓을 바로 끊지 않는다** — 끊으면 보낸 쪽이 **413 을 못 읽고**
     「연결이 끊겼다」로만 본다(묶음이 상태 0 으로 잡았다). 읽기만 멈추고
     413 을 **먼저 보낸 뒤** 끝에서 닫는다. */
function readBody(req) {
  return new Promise((resolve) => {
    const parts = [];
    let n = 0, done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    req.on('data', (c) => {
      if (done) return;
      n += c.length;
      if (n > MAX_BODY) { req.pause(); return fin({ tooBig: true }); }
      parts.push(c);
    });
    req.on('end', () => fin({ buf: Buffer.concat(parts) }));
    req.on('error', () => fin({ err: true }));
    req.on('aborted', () => fin({ err: true }));
  });
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  const url = String(req.url || '');
  const path = url.split('?')[0];

  /* ★ 물음표가 붙은 주소는 받지 않는다 — `?url=` 류를 아예 끊는다 */
  if (url.indexOf('?') >= 0) { log(path, 404, null, Date.now() - t0, 0); return send(res, 404, { ok: false }); }

  /* 살아있음 확인 — 토큰 없이 볼 수 있다(알리고를 부르지 않는다 · 아무것도 안 한다) */
  if (path === '/healthz') {
    if (req.method !== 'GET') { log(path, 405, null, Date.now() - t0, 0); return send(res, 405, { ok: false }); }
    return send(res, 200, { ok: true });
  }

  /* 아는 경로 셋뿐 */
  const upstream = UPSTREAM[path];
  if (!upstream) { log(path, 404, null, Date.now() - t0, 0); return send(res, 404, { ok: false }); }
  if (req.method !== 'POST') { log(path, 405, null, Date.now() - t0, 0); return send(res, 405, { ok: false }); }

  /* 비밀 머리말 — 틀리면 **401**, 몸통은 `{ok:false}` 뿐(까닭을 알려 주지 않는다) */
  if (!tokenOk(req.headers['x-relay-token'])) {
    log(path, 401, null, Date.now() - t0, 0);
    return send(res, 401, { ok: false });
  }

  /* 모양 — 알리고는 form 만 받는다 */
  const ctype = String(req.headers['content-type'] || '');
  if (ctype.toLowerCase().indexOf('application/x-www-form-urlencoded') !== 0) {
    log(path, 415, null, Date.now() - t0, 0);
    return send(res, 415, { ok: false });
  }

  /* 횟수 */
  const now = Date.now();
  if (rateOver(now)) { log(path, 429, null, Date.now() - t0, 0); return send(res, 429, { ok: false }); }
  hits.push(now);

  /* 몸통 — **바이트 그대로** */
  const got = await readBody(req);
  if (!got.buf) {
    const code = got.tooBig ? 413 : 400;
    log(path, code, null, Date.now() - t0, 0);
    if (res.headersSent) return;
    /* 다 받지 않았으므로 이 연결은 **답을 보낸 뒤 닫는다**(그래야 상대가 413 을 읽는다) */
    res.setHeader('Connection', 'close');
    res.on('finish', () => { try { req.destroy(); } catch (e) {} });
    return send(res, code, { ok: false });
  }
  const body = got.buf;

  /* 알리고로 — **받은 Content-Type 그대로** · 다른 머리말은 **넘기지 않는다**
     (`Host`·`X-Relay-Token`·쿠키 따위가 알리고로 새지 않게) · **재시도 0** */
  let up = null, bytes = body.length;
  try {
    const r = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': ctype },
      body: body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });
    up = r.status;
    const buf = Buffer.from(await r.arrayBuffer());
    log(path, r.status, up, Date.now() - t0, bytes);
    res.writeHead(r.status, {
      'Content-Type': r.headers.get('content-type') || 'application/json; charset=utf-8',
      'Content-Length': buf.length
    });
    return res.end(buf);
  } catch (e) {
    const timedOut = (e && (e.name === 'TimeoutError' || e.name === 'AbortError'));
    const code = timedOut ? 504 : 502;
    log(path, code, null, Date.now() - t0, bytes);
    return send(res, code, { ok: false });
  }
});

server.listen(PORT, HOST, () => {
  console.log('[relay] ' + HOST + ':' + PORT + ' 듣는 중 · 경로 ' +
              Object.keys(UPSTREAM).concat(['/healthz']).join(' '));
});

/* systemd 가 멈추라고 하면 깨끗이 닫는다(보내는 중인 것은 끝낸다) */
['SIGTERM', 'SIGINT'].forEach((s) => process.on(s, () => {
  console.log('[relay] ' + s + ' — 닫습니다');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
}));
