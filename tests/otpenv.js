/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* api/otp.js 를 가짜 firebase-admin·fetch·crypto 로 돌리는 환경 (v252)
   - Firestore: doc get/set/update/delete + runTransaction(tx.getAll/tx.set)
   - 알리고 호출은 실제로 나가지 않는다 (fetch 가로채기) → 요금 0원
   - console.log 전부 모아 둔다 (번호·코드가 새는지 확인용) */
const fs = require('fs');
const cp = require('child_process');

const SRC_NEW = fs.readFileSync('' + COS_ROOT + '/api/otp.js', 'utf8');
/* 전/후 비교용 — 기준 커밋을 못 박는다 (HEAD 로 두면 커밋 뒤 전/후가 같아진다) */
const OLD_REF = process.env.COS_SRC_OLD_REF || 'HEAD';
const SRC_OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/otp.js').toString();

function makeState(over) {
  const s = {
    docs: {},            // 'otp/<id>' → data
    authByEmail: {},     // email → { uid, email }
    tokens: {},          // idToken → { uid, firebase:{sign_in_provider} }
    calls: [],           // ['updateUser', uid, props] 등
    aligo: [],           // 알리고로 나간 form 본문 (파싱된 객체)
    aligoReply: { result_code: 1, message: 'success', msg_id: 1, success_cnt: 1 },
    logs: [],
    now: 1761500000000,
    env: { FIREBASE_SERVICE_ACCOUNT: '{"project_id":"x"}', OTP_SECRET: 'SEKRIT-TEST',
           ALIGO_KEY: 'AK', ALIGO_USER_ID: 'AU', ALIGO_SENDER: '0212345678' }
  };
  Object.assign(s, over || {});
  return s;
}

function makeHandler(SRC, S) {
  const docs = S.docs;
  /* ── v253: 문서마다 **판(version)** 을 센다 ───────────────────────────────
     Firestore 트랜잭션은 「읽은 문서가 커밋 전에 바뀌면 다시 읽고 다시 실행」한다
     (낙관적 동시성). 그 성질을 흉내 내지 않으면 가짜 Firestore 에서는 동시 요청이
     전부 같은 값을 읽어, **트랜잭션으로 고친 코드와 안 고친 코드가 똑같이 보인다.**
     그래서 판을 세고, 커밋 때 읽은 판이 그대로인지 확인한다. */
  S.ver = S.ver || {};
  S.txRetries = 0;
  const bump = (p) => { S.ver[p] = (S.ver[p] || 0) + 1; };
  /* 끼어들 틈 — 이게 없으면 await 가 한 번도 양보하지 않아 동시 요청이 직렬로 돈다 */
  const tick = () => new Promise(r => setImmediate(r));
  const snapOf = (path, id) => ({
    exists: Object.prototype.hasOwnProperty.call(docs, path),
    data: () => docs[path], id: id
  });

  function refOf(col, id) {
    const path = col + '/' + id;
    return {
      _path: path, _id: id,
      get: async () => { await tick(); return snapOf(path, id); },
      set: async (d) => { await tick(); docs[path] = d; bump(path); S.calls.push(['set', path]); },
      update: async (d) => {
        await tick();
        if (!Object.prototype.hasOwnProperty.call(docs, path)) { const e = new Error('no doc'); e.code = 5; throw e; }
        docs[path] = Object.assign({}, docs[path], d); bump(path); S.calls.push(['update', path, d]);
      },
      delete: async () => { await tick(); delete docs[path]; bump(path); S.calls.push(['delete', path]); }
    };
  }

  const db = {
    collection: (name) => ({ doc: (id) => refOf(name, id) }),
    runTransaction: async (fn) => {
      for (let attempt = 0; attempt < 8; attempt++) {
        const readVer = new Map();
        const writes = [];
        const mark = (r) => { readVer.set(r._path, S.ver[r._path] || 0); return snapOf(r._path, r._id); };
        const tx = {
          get: async (r) => { await tick(); return mark(r); },
          getAll: async (...refs) => { await tick(); return refs.map(mark); },
          set:    (r, d) => { writes.push(['set', r._path, d]); },
          update: (r, d) => { writes.push(['update', r._path, d]); },
          delete: (r)    => { writes.push(['delete', r._path]); }
        };
        const result = await fn(tx);
        /* 읽기와 커밋 사이의 **실제 지연**(왕복 시간)을 흉내 낸다.
           이게 없으면 콜백이 한 번만 양보해서 동시 요청이 저절로 직렬이 되고,
           **충돌·재시도 경로를 한 번도 안 거친다**(실제로 그렇게 돌아 보고 넣었다). */
        for (let i = 0; i < (S.txLag === undefined ? 1 : S.txLag); i++) await tick();
        /* ── 커밋 ── 여기서부터는 await 가 없다 = 끼어들 수 없다(원자적 커밋과 같은 뜻) */
        let stale = false;
        for (const [p, v] of readVer) { if ((S.ver[p] || 0) !== v) { stale = true; break; } }
        if (stale) { S.txRetries++; continue; }          // 다시 읽고 다시 판정
        writes.forEach(([op, p, d]) => {
          if (op === 'set') { docs[p] = d; }
          else if (op === 'update') { docs[p] = Object.assign({}, docs[p], d); }
          else { delete docs[p]; }
          bump(p);
          S.calls.push(['tx.' + op, p]);
        });
        return result;
      }
      const e = new Error('too much contention'); e.code = 10; throw e;
    }
  };

  const auth = {
    verifyIdToken: async (t) => { if (!S.tokens[t]) throw new Error('bad token'); return S.tokens[t]; },
    getUserByEmail: async (e) => {
      S.calls.push(['getUserByEmail', e]);
      if (S.authByEmail[e]) return S.authByEmail[e];
      const er = new Error('x'); er.code = 'auth/user-not-found'; throw er;
    },
    updateUser: async (uid, p) => { S.calls.push(['updateUser', uid, p]); return { uid }; },
    revokeRefreshTokens: async (uid) => { S.calls.push(['revokeRefreshTokens', uid]); }
  };

  const fakeFetch = async (url, opt) => {
    const o = {};
    String((opt && opt.body) || '').split('&').forEach(kv => {
      const i = kv.indexOf('=');
      if (i > 0) o[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    });
    S.aligo.push({ url, method: (opt && opt.method), headers: (opt && opt.headers), form: o });
    if (S.aligoThrow) throw new Error('network');
    return { json: async () => S.aligoReply };
  };

  /* v261 — api/otp.js 가 lib/otp-core.js 를 가져다 쓴다.
     실제 배포에서 import 가 하는 일과 같게 **앞에 붙여** 한 덩어리로 만든다.
     옛 코드(v260 이하)에는 그 import 가 없으므로 아무것도 붙이지 않는다 → 전/후 비교가 그대로 된다. */
  /* ★ [^}]* 로 쓴다. [\s\S]*? 로 쓰면 **윗줄의 다른 import 부터** 잡아
     firebase-admin import 세 줄까지 한꺼번에 지워 버린다(실제로 겪었다 — getApps undefined). */
  const CORE_IMP = /^import \{[^}]*\} from '\.\.\/lib\/otp-core\.js';$/m;
  const CORE_SRC = require('fs').readFileSync('' + COS_ROOT + '/lib/otp-core.js', 'utf8');
  const fbRw = (src) => src
    .replace(/^import \{[^}]*\} from 'firebase-admin\/app';$/m, "const { initializeApp, getApps, cert } = __fb.app;")
    .replace(/^import \{[^}]*\} from 'firebase-admin\/auth';$/m, "const { getAuth } = __fb.auth;")
    .replace(/^import \{[^}]*\} from 'firebase-admin\/firestore';$/m, "const { getFirestore } = __fb.fs;")
    .replace(/^import \{([^}]*)\} from 'crypto';$/m, "const {$1} = require('crypto');");
  const corePre = CORE_IMP.test(SRC) ? (fbRw(CORE_SRC).replace(/^export /mg, '') + '\n') : '';
  const code = corePre + SRC
    .replace(CORE_IMP, '/* lib/otp-core.js 는 위에 붙였다 */')
    /* ★ 순서 주의 — `export default …` 를 먼저 바꾼 뒤에 남은 `export ` 를 떼야 한다.
       거꾸로 하면 `default async function handler` 가 되어 문법 오류가 난다(겪었다). */
    .replace(/^export default async function handler/m, "module.exports = async function handler")
    .replace(/^export /mg, '')
    .replace(/^import \{[^}]*\} from 'firebase-admin\/app';$/m, "const { initializeApp, getApps, cert } = __fb.app;")
    .replace(/^import \{[^}]*\} from 'firebase-admin\/auth';$/m, "const { getAuth } = __fb.auth;")
    .replace(/^import \{[^}]*\} from 'firebase-admin\/firestore';$/m, "const { getFirestore } = __fb.fs;")
    .replace(/^import \{([^}]*)\} from 'crypto';$/m, "const {$1} = require('crypto');")
    .replace(/^export default async function handler/m, "module.exports = async function handler");

  const fn = new Function('__fb', 'module', 'exports', 'process', 'console', 'fetch', 'require',
                          code + '\nreturn module.exports;');
  const mod = { exports: {} };
  return fn(
    { app: { initializeApp: () => {}, getApps: () => [1], cert: x => x },
      auth: { getAuth: () => auth },
      fs: { getFirestore: () => db } },
    mod, mod.exports,
    { env: S.env },
    { log: (...a) => S.logs.push(a.map(x => String(x)).join(' ')) },
    fakeFetch, require);
}

const req = (body, tok, ip) => ({
  method: 'POST',
  headers: Object.assign({ origin: 'https://cosroad.com' },
    tok ? { authorization: 'Bearer ' + tok } : {},
    { 'x-forwarded-for': (ip || '1.2.3.4') + ', 9.9.9.9' }),
  socket: { remoteAddress: '1.2.3.4' },
  body
});
function res() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

module.exports = { SRC_NEW, SRC_OLD, makeState, makeHandler, req, res };
