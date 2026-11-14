/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* api/send-sms.js · api/send-alimtalk.js 를 가짜 firebase-admin + **가짜 알리고**로 돌리는 환경 (v266)
   ★ 바깥으로 나가는 통신 0건 — 알리고 호출은 직전에서 끊어 「무엇이 나갈 뻔했나」만 모은다.
   ★ lib/send-guard.js 는 실제 배포에서 import 가 하는 일과 같게 **앞에 붙여** 한 덩어리로 만든다.
     (drvenv.js 가 lib/period.js·lib/price.js 를 붙이는 방식 그대로) */
const fs = require('fs');
const cp = require('child_process');

const read = (p) => fs.readFileSync('' + COS_ROOT + '/' + p, 'utf8');
const SRC = { sms: read('api/send-sms.js'), alim: read('api/send-alimtalk.js') };
const OLD_REF = process.env.COS_SRC_OLD_REF || 'a542802';
const SRC_OLD = {
  sms:  cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/send-sms.js').toString(),
  alim: cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/send-alimtalk.js').toString()
};

function makeState(over) {
  const S = {
    docs: {},            // 'users/UID' · 'orgs/ORG/data/members' · 'sendRl/..' …
    ver: {},
    seq: 0,
    aligo: [],           // 알리고로 나갈 뻔한 것 (url, form)
    logs: [],
    tokens: {},          // 'tok' → { uid, driver, org, carId, firebase:{…} }
    now: Date.UTC(2026, 10, 4, 3, 0, 0),
    aligoReply: { result_code: 1, success_cnt: 1, message: 'success(가짜)' },
    env: {
      FIREBASE_SERVICE_ACCOUNT: '{"project_id":"x"}',
      ALIGO_KEY: 'KEY', ALIGO_USER_ID: 'UID',
      ALIGO_SENDER: '01036603911', ALIGO_SENDER_KEY: 'SKEY'
    }
  };
  Object.assign(S, over || {});
  return S;
}

/* ★ Firestore 는 **배열 안의 배열**을 거절한다("Nested arrays are not supported").
   가짜 Firestore 가 아무거나 받아 주면, 스텁은 통과하고 배포에서만 터진다 —
   v266 에서 실제로 겪었다(에뮬레이터가 먼저 잡았다). 그래서 여기서도 같게 거절한다. */
function noNestedArray(d, path) {
  const walk = (v, inArray) => {
    if (Array.isArray(v)) {
      if (inArray) { const e = new Error('Nested arrays are not supported (found in document ' + path + ')'); e.code = 'invalid-argument'; throw e; }
      v.forEach((x) => walk(x, true));
      return;
    }
    if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k], false));
  };
  walk(d, false);
}

function makeHandler(src, S) {
  const docs = S.docs;
  const bump = (p) => { S.ver[p] = (S.ver[p] || 0) + 1; };
  const tick = () => new Promise(r => setImmediate(r));
  const snapOf = (path, id) => ({
    exists: Object.prototype.hasOwnProperty.call(docs, path),
    data: () => docs[path], id
  });

  function refOf(path) {
    const id = path.slice(path.lastIndexOf('/') + 1);
    return {
      _path: path, _id: id, id,
      get: async () => { await tick(); return snapOf(path, id); },
      set: async (d, opt) => {
        await tick();
        noNestedArray(d, path);
        docs[path] = (opt && opt.merge) ? Object.assign({}, docs[path] || {}, d) : d;
        bump(path);
      },
      collection: (sub) => colOf(path + '/' + sub)
    };
  }
  function colOf(prefix) {
    return { doc: (id) => refOf(prefix + '/' + id) };
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
          set: (r, d, opt) => { noNestedArray(d, r._path); writes.push([(opt && opt.merge) ? 'merge' : 'set', r._path, d]); }
        };
        const result = await fn(tx);
        for (let i = 0; i < (S.txLag === undefined ? 1 : S.txLag); i++) await tick();
        let stale = false;
        for (const [p, v] of readVer) { if ((S.ver[p] || 0) !== v) { stale = true; break; } }
        if (stale) continue;
        writes.forEach(([op, p, d]) => {
          docs[p] = (op === 'set') ? d : Object.assign({}, docs[p], d);
          bump(p);
        });
        return result;
      }
      const e = new Error('too much contention'); e.code = 10; throw e;
    }
  };

  const auth = {
    verifyIdToken: async (t) => { if (!S.tokens[t]) throw new Error('bad token'); return S.tokens[t]; }
  };

  /* 시계 */
  const RealDate = Date;
  function FakeDate(...a) { return a.length ? new RealDate(...a) : new RealDate(S.now); }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => S.now;
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;

  /* ★ 알리고 — 여기서 끊는다 (바깥 통신 0) */
  const fakeFetch = async (url, opt) => {
    S.aligo.push({ url, form: new URLSearchParams(String((opt && opt.body) || '')) });
    if (S.aligoThrows) throw new Error('network');
    return { json: async () => S.aligoReply };
  };

  /* lib/send-guard.js 를 앞에 붙인다 (옛 판에는 import 가 없어 아무것도 안 붙는다)
     ★ [^}]* 로 쓴다 — [\s\S]*? 로 쓰면 윗줄 import 까지 먹는다 (drvenv 에서 겪음) */
  const IMP = /^import \{[^}]*\} from '\.\.\/lib\/send-guard\.js';$/m;
  /* ★ 지우지 말고 **바꿔 끼운다** — 지우면 getApps·cert 가 없어 admin() 이 터지고,
     그 터짐이 「서버 관리자 키 형식이 올바르지 않아요」(500) 로 둔갑해 전부 500 이 된다. */
  let pre = '';
  if (IMP.test(src)) {
    /* S.guardSrc 를 주면 그것을 쓴다 — 「옛 상한 숫자로도 같은 시나리오를 돌려 본다」용 (v266 보정1).
       안 주면 늘 디스크의 실제 파일을 읽는다(기본 동작은 그대로). */
    /* ★ 코스로드45: send-guard 가 `./period.js`(이용 기간 판정 한 벌)를 쓴다 —
       그 파일도 **앞에 붙여** 한 덩어리로 만든다(옛 판에는 그 import 가 없어 아무것도 안 붙는다).
       drvenv.js 가 api 쪽에서 하는 것과 같은 방법이다. */
    const PER_IMP = /^import \{[^}]*\} from '\.\/period\.js';$/m;
    const guardSrc0 = (S.guardSrc || read('lib/send-guard.js'));
    if (PER_IMP.test(guardSrc0)) {
      pre += read('lib/period.js').replace(/^export /mg, '') + String.fromCharCode(10);
    }
    pre += guardSrc0
      .replace(PER_IMP, '/* lib/period.js 는 위에 붙였다 */')
      .replace(/^import \{[^}]*\} from 'firebase-admin\/app';$/m, "const { initializeApp, getApps, cert } = __fb.app;")
      .replace(/^import \{[^}]*\} from 'firebase-admin\/auth';$/m, "const { getAuth } = __fb.auth;")
      .replace(/^import \{[^}]*\} from 'firebase-admin\/firestore';$/m, "const { getFirestore } = __fb.fs;")
      .replace(/^import \{([^}]*)\} from 'crypto';$/m, "const {$1} = require('crypto');")
      .replace(/^export /mg, '') + String.fromCharCode(10);
  }
  /* ★ v297(60-B4b): `api/send-alimtalk.js` 가 `lib/alimtalk-core.js`(본문·버튼·알리고 호출 한 벌)도
     쓴다 — 같은 방법으로 앞에 붙인다(옛 판에는 그 import 가 없어 아무것도 안 붙는다). */
  const AT_IMP = /^import \{[^}]*\} from '\.\.\/lib\/alimtalk-core\.js';$/m;
  if (AT_IMP.test(src)) {
    pre += read('lib/alimtalk-core.js').replace(/^export /mg, '') + String.fromCharCode(10);
  }
  /* ★ v319(73-B):  가 (문자 한 벌)를 쓴다 — 같은 방법 */
  const SMSC_IMP = /^import \{[^}]*\} from '\.\.\/lib\/sms-core\.js';$/m;
  if (SMSC_IMP.test(src)) {
    pre += read('lib/sms-core.js').replace(/^export /mg, '') + String.fromCharCode(10);
  }
  const code = pre + src
    .replace(AT_IMP, '/* lib/alimtalk-core.js 는 위에 붙였다 */')
    .replace(SMSC_IMP, '/* lib/sms-core.js 는 위에 붙였다 */')
    .replace(IMP, '/* lib/send-guard.js 는 위에 붙였다 */')
    .replace(/^import \{[^}]*\} from 'firebase-admin\/app';$/m, "const { initializeApp, getApps, cert } = __fb.app;")
    .replace(/^import \{[^}]*\} from 'firebase-admin\/auth';$/m, "const { getAuth } = __fb.auth;")
    .replace(/^import \{[^}]*\} from 'firebase-admin\/firestore';$/m, "const { getFirestore } = __fb.fs;")
    .replace(/^import \{([^}]*)\} from 'crypto';$/m, "const {$1} = require('crypto');")
    .replace(/^export default async function handler/m, "module.exports = async function handler");

  const fn = new Function('__fb', 'module', 'exports', 'process', 'console', 'require',
                          'Date', 'fetch', 'URLSearchParams',
                          code + '\nreturn module.exports;');
  const mod = { exports: {} };
  return fn(
    { app: { initializeApp: () => {}, getApps: () => [1], cert: (x) => x },
      auth: { getAuth: () => auth },
      fs: { getFirestore: () => db } },
    mod, mod.exports,
    { env: S.env },
    { log: (...a) => S.logs.push(a.map(String).join(' ')) },
    require, FakeDate, fakeFetch, URLSearchParams);
}

const req = (body, tok, origin, ip) => ({
  method: 'POST',
  headers: Object.assign(
    origin === null ? {} : { origin: origin || 'https://cosroad.com' },
    tok ? { authorization: 'Bearer ' + tok } : {},
    { 'x-forwarded-for': (ip || '1.2.3.4') + ', 9.9.9.9' }),
  socket: { remoteAddress: ip || '1.2.3.4' },
  body
});
function res() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}
async function call(src, S, body, tok, origin, ip) {
  const h = makeHandler(src, S);
  const s = res();
  await h(req(body, tok, origin, ip), s);
  return s;
}

module.exports = { SRC, SRC_OLD, OLD_REF, makeState, makeHandler, req, res, call };
