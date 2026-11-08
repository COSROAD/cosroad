/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* api/driver-auth.js · api/admin-account.js 를 가짜 firebase-admin 으로 돌리는 환경 (v255)
   담은 것
     - 중첩 컬렉션: orgs/{org}/data/{key} · orgs/{org}/drivers/{uid} · orgs/{org}/backups/{id}
     - where / orderBy / limit / get / add
     - runTransaction — 문서 판(version)을 세고, 읽은 판이 바뀌면 다시 돈다 (otpenv.js 와 같은 방식)
     - auth: verifyIdToken · createUser · updateUser · revokeRefreshTokens · createCustomToken · getUserByEmail
     - 시계를 우리가 쥔다 (S.now) → KST 날짜 경계(UTC 0~9시)를 실제로 돌려 볼 수 있다
   ★ 바깥으로 나가는 통신은 없다 (알리고·Firebase 모두 가짜) — 요금 0원 */
const fs = require('fs');
const cp = require('child_process');

/* ★ v275: 부르는 묶음이 `COS_API_NEW_REF` 를 주면 **그 커밋의 api** 를 올린다.
   회차 기록 묶음(h_api255 처럼 「출퇴근은 data/driverAtt 에 쌓인다」를 못 박은 것)은
   그 회차에 고정해야 한다 — 안 하면 v275 가 자리를 옮긴 것이 거짓 실패로 들어온다.
   값을 안 주면 **지금 작업트리**(이번 회차를 보는 묶음은 그대로 쓴다). */
const apiRef = process.env.COS_API_NEW_REF || '';
const _api = (p) => apiRef
  ? cp.execSync('git -C ' + COS_ROOT + ' show ' + apiRef + ':' + p, { maxBuffer: 1 << 26 }).toString()
  : fs.readFileSync('' + COS_ROOT + '/' + p, 'utf8');
const SRC = {
  drv:   _api('api/driver-auth.js'),
  admin: _api('api/admin-account.js')
};
const oldRef = process.env.COS_SRC_OLD_REF || '2eadaaa';
const SRC_OLD = {
  /* driver-auth 는 v255 신설이라 옛 판이 없다 */
  admin: cp.execSync('git -C ' + COS_ROOT + ' show ' + oldRef + ':api/admin-account.js').toString()
};

function makeState(over) {
  const S = {
    docs: {},              // 'users/UID' · 'orgs/ORG/data/driverAtt' …
    ver: {},
    seq: 0,
    txRetries: 0,
    txLag: 1,
    calls: [],
    logs: [],
    tokens: {},
    authUsers: {},         // email → {uid,email}
    randomQueue: [],       // issueOrgCode 가 뽑을 6자리를 미리 정해 둔다
    /* 2026-10-31 11:20 UTC = **2026-10-31 20:20 KST** — 테스트마다 바꾼다 */
    now: Date.UTC(2026, 9, 31, 11, 20, 0),
    env: { FIREBASE_SERVICE_ACCOUNT: '{"project_id":"x"}', OTP_SECRET: 'SEKRIT-TEST' }
  };
  Object.assign(S, over || {});
  return S;
}

function makeHandler(src, S) {
  const docs = S.docs;
  const bump = (p) => { S.ver[p] = (S.ver[p] || 0) + 1; };
  const tick = () => new Promise(r => setImmediate(r));
  const snapOf = (path, id) => ({
    exists: Object.prototype.hasOwnProperty.call(docs, path),
    data: () => docs[path], id: id
  });
  /* 'orgs/A/data' 처럼 **부모 경로**가 같고 한 칸 더 깊은 문서들 */
  const childrenOf = (prefix) => Object.keys(docs).filter(k => {
    if (k.indexOf(prefix + '/') !== 0) return false;
    return k.slice(prefix.length + 1).indexOf('/') < 0;
  });

  function refOf(path) {
    const id = path.slice(path.lastIndexOf('/') + 1);
    return {
      _path: path, _id: id, id: id,
      get: async () => { await tick(); return snapOf(path, id); },
      set: async (d, opt) => {
        await tick();
        if (opt && opt.merge) docs[path] = Object.assign({}, docs[path] || {}, d);
        else docs[path] = d;
        bump(path); S.calls.push(['set', path]);
      },
      update: async (d) => {
        await tick();
        /* v264: 「기간 쓰기가 깨졌을 때」를 실제로 돌려 보려고 한 자리만 터뜨린다 */
        if (S.failUpdate && path.indexOf(S.failUpdate) >= 0) { const e = new Error('boom'); e.code = 13; throw e; }
        if (!Object.prototype.hasOwnProperty.call(docs, path)) { const e = new Error('no doc'); e.code = 5; throw e; }
        docs[path] = Object.assign({}, docs[path], d); bump(path); S.calls.push(['update', path]);
      },
      delete: async () => { await tick(); delete docs[path]; bump(path); S.calls.push(['delete', path]); },
      collection: (sub) => colOf(path + '/' + sub)
    };
  }

  /* 쿼리 — where/orderBy/limit 은 **새 객체**를 돌려준다 (Firestore 와 같다) */
  function colOf(prefix, q) {
    q = q || { wh: [], order: null, lim: 0 };
    const next = (over) => colOf(prefix, Object.assign({}, q, over));
    return {
      where:   (f, op, v) => next({ wh: q.wh.concat([[f, op, v]]) }),
      orderBy: (f, dir)   => next({ order: [f, dir || 'asc'] }),
      limit:   (n)        => next({ lim: n }),
      doc:     (id)       => refOf(prefix + '/' + id),
      add: async (d) => {
        await tick();
        const id = 'AUTO' + (++S.seq);
        docs[prefix + '/' + id] = d; bump(prefix + '/' + id);
        S.calls.push(['add', prefix + '/' + id]);
        return refOf(prefix + '/' + id);
      },
      get: async () => {
        await tick();
        /* 색인이 없으면 orderBy 쿼리가 터진다 — driverInfo 의 partial 길을 보려고 흉내 낸다 */
        if (q.order && S.orderByThrows) { const e = new Error('index'); e.code = 9; throw e; }
        let hits = childrenOf(prefix).map(k => ({ id: k.slice(k.lastIndexOf('/') + 1), d: docs[k] }));
        q.wh.forEach(([f, op, v]) => {
          hits = hits.filter(h => (op === '==' ? (h.d ? h.d[f] : undefined) === v : false));
        });
        if (q.order) {
          const f = q.order[0], desc = q.order[1] === 'desc';
          hits.sort((a, b) => {
            const x = (a.d && a.d[f]) || 0, y = (b.d && b.d[f]) || 0;
            return desc ? (y - x) : (x - y);
          });
        }
        if (q.lim) hits = hits.slice(0, q.lim);
        S.calls.push(['query', prefix, q.wh.map(w => w.join('')).join('&'), hits.length]);
        const out = hits.map(h => ({ id: h.id, data: () => h.d, exists: true }));
        return { forEach: (fn) => out.forEach(fn), size: out.length, docs: out, empty: !out.length };
      }
    };
  }

  const db = {
    collection: (name) => colOf(name),
    runTransaction: async (fn) => {
      for (let attempt = 0; attempt < 8; attempt++) {
        const readVer = new Map();
        const writes = [];
        const mark = (r) => { readVer.set(r._path, S.ver[r._path] || 0); return snapOf(r._path, r._id); };
        const tx = {
          get: async (r) => { await tick(); return mark(r); },
          getAll: async (...refs) => { await tick(); return refs.map(mark); },
          set: (r, d, opt) => { writes.push([(opt && opt.merge) ? 'merge' : 'set', r._path, d]); },
          update: (r, d) => { writes.push(['update', r._path, d]); },
          delete: (r) => { writes.push(['delete', r._path]); }
        };
        const result = await fn(tx);
        for (let i = 0; i < (S.txLag === undefined ? 1 : S.txLag); i++) await tick();
        let stale = false;
        for (const [p, v] of readVer) { if ((S.ver[p] || 0) !== v) { stale = true; break; } }
        if (stale) { S.txRetries++; continue; }
        writes.forEach(([op, p, d]) => {
          if (op === 'set') docs[p] = d;
          else if (op === 'merge' || op === 'update') docs[p] = Object.assign({}, docs[p], d);
          else delete docs[p];
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
      if (S.authUsers[e]) return S.authUsers[e];
      const er = new Error('x'); er.code = 'auth/user-not-found'; throw er;
    },
    createUser: async ({ email, password }) => {
      if (S.authUsers[email]) { const e = new Error('d'); e.code = 'auth/email-already-exists'; throw e; }
      const uid = 'NEWUID' + (++S.seq); S.authUsers[email] = { uid, email };
      S.calls.push(['createUser', email]); return { uid };
    },
    updateUser: async (uid, p) => { S.calls.push(['updateUser', uid, p]); return { uid }; },
    revokeRefreshTokens: async (uid) => { S.calls.push(['revokeRefreshTokens', uid]); },
    createCustomToken: async (uid, claims) => {
      S.calls.push(['createCustomToken', uid, JSON.stringify(claims || {})]);
      if (S.tokenThrows) { const e = new Error('no key'); e.code = 'auth/insufficient-permission'; throw e; }
      /* 가짜 토큰 — 바로 tokens 에 등록해 두면 그 토큰으로 checkin 을 부를 수 있다 */
      const t = 'CT:' + uid;
      S.tokens[t] = Object.assign({ uid: uid, firebase: { sign_in_provider: 'custom' } }, claims || {});
      return t;
    }
  };

  /* crypto.randomInt — issueOrgCode 가 뽑는 6자리를 우리가 정한다 */
  const realCrypto = require('crypto');
  const fakeRequire = (name) => {
    if (name !== 'crypto') return require(name);
    return Object.assign({}, realCrypto, {
      randomInt: (a, b) => {
        if (S.randomQueue.length) return S.randomQueue.shift();
        return realCrypto.randomInt(a, b);
      }
    });
  };

  /* 시계 — Date.now() 와 new Date() 를 S.now 로 고정한다 */
  const RealDate = Date;
  function FakeDate(...a) {
    if (!a.length) return new RealDate(S.now);
    return new RealDate(...a);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => S.now;
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;

  /* v263: api/admin-account.js 가 lib/period.js 를 가져다 쓴다.
     실제 배포에서 import 가 하는 일과 같게 **앞에 붙여** 한 덩어리로 만든다.
     옛 코드(v262 이하)에는 그 import 가 없으므로 아무것도 붙지 않는다 → 전/후 비교 그대로. */
  /* ★ [^}]* 로 쓴다. [\s\S]*? 로 쓰면 **윗줄의 다른 import 부터** 잡아
     firebase-admin import 세 줄까지 한꺼번에 지워 버린다(실제로 겪었다 — getApps undefined). */
  const PER_IMP = /^import \{[^}]*\} from '\.\.\/lib\/period\.js';$/m;
  const perPre = PER_IMP.test(src)
    ? (require('fs').readFileSync('' + COS_ROOT + '/lib/period.js', 'utf8')
         .replace(/^export /mg, '') + String.fromCharCode(10))
    : '';
  /* v264: lib/price.js 도 같은 방식으로 앞에 붙인다 (옛 판에는 없으므로 아무것도 안 붙는다) */
  const PRC_IMP = /^import \{[^}]*\} from '\.\.\/lib\/price\.js';$/m;
  const prcPre = PRC_IMP.test(src)
    ? (require('fs').readFileSync('' + COS_ROOT + '/lib/price.js', 'utf8')
         .replace(/^export /mg, '') + String.fromCharCode(10))
    : '';
  const code = perPre + prcPre + src
    .replace(PER_IMP, '/* lib/period.js 는 위에 붙였다 */')
    .replace(PRC_IMP, '/* lib/price.js 는 위에 붙였다 */')
    .replace(/^import \{[^}]*\} from 'firebase-admin\/app';$/m, "const { initializeApp, getApps, cert } = __fb.app;")
    .replace(/^import \{[^}]*\} from 'firebase-admin\/auth';$/m, "const { getAuth } = __fb.auth;")
    .replace(/^import \{[^}]*\} from 'firebase-admin\/firestore';$/m, "const { getFirestore } = __fb.fs;")
    .replace(/^import \{([^}]*)\} from 'crypto';$/m, "const {$1} = require('crypto');")
    .replace(/^export default async function handler/m, "module.exports = async function handler");

  const fn = new Function('__fb', 'module', 'exports', 'process', 'console', 'require', 'Date',
                          code + '\nreturn module.exports;');
  const mod = { exports: {} };
  return fn(
    { app: { initializeApp: () => {}, getApps: () => [1], cert: x => x },
      auth: { getAuth: () => auth },
      fs: { getFirestore: () => db } },
    mod, mod.exports,
    { env: S.env },
    { log: (...a) => S.logs.push(a.map(x => String(x)).join(' ')) },
    fakeRequire, FakeDate);
}

const req = (body, tok, ip) => ({
  method: 'POST',
  headers: Object.assign({ origin: 'https://cosroad.com' },
    tok ? { authorization: 'Bearer ' + tok } : {},
    { 'x-forwarded-for': (ip || '1.2.3.4') + ', 9.9.9.9' }),
  socket: { remoteAddress: ip || '1.2.3.4' },
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
async function call(src, S, body, tok, ip) {
  const h = makeHandler(src, S);
  const s = res();
  await h(req(body, tok, ip), s);
  return s;
}

module.exports = { SRC, SRC_OLD, makeState, makeHandler, req, res, call };
