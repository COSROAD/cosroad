/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v261 — api/signup.js · api/otp.js 를 가짜로 돌리는 환경.
   v252 의 otpenv.js 를 바탕으로 세 가지를 더했다:
     ① 공용 파일 lib/otp-core.js 를 **앞에 붙여** 한 덩어리로 만든다
        (api/*.js 의 `import { … } from '../lib/otp-core.js'` 줄은 지운다)
     ② users where/limit/get · orgs/_master/data/billing 같은 **중첩 컬렉션** 읽기
     ③ fetch 두 갈래 — 알리고(form) / 국세청(JSON). **둘 다 밖으로 나가지 않는다.**
   ★ 실제 호출·실제 키 없음. 요금 0원. */
const fs = require('fs');
const cp = require('child_process');

const SRC_SIGNUP = fs.readFileSync('' + COS_ROOT + '/api/signup.js', 'utf8');
const SRC_OTP    = fs.readFileSync('' + COS_ROOT + '/api/otp.js', 'utf8');
const SRC_CORE   = fs.readFileSync('' + COS_ROOT + '/lib/otp-core.js', 'utf8');
/* 전/후 비교용 — 기준 커밋을 못 박는다 */
const OLD_REF = process.env.COS_SRC_OLD_REF || 'b6651bc';
const OLD_OTP = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/otp.js').toString();

function makeState(over) {
  const s = {
    docs: {},            // 'col/id' → data
    authByEmail: {},     // email → { uid, email }
    users: {},           // uid → users 문서 (createUser 로 생긴 계정 목록)
    calls: [],
    aligo: [],           // 알리고로 나간 form
    nts: [],             // 국세청으로 나간 요청 (url·body)
    aligoReply: { result_code: 1, message: 'success' },
    ntsReply: null,      // 국세청 응답 (아래 ntsOk 등으로 만든다)
    ntsStatus: 200,
    ntsThrow: false,
    logs: [],
    env: { FIREBASE_SERVICE_ACCOUNT: '{"project_id":"x"}', OTP_SECRET: 'SEKRIT-TEST',
           ALIGO_KEY: 'AK', ALIGO_USER_ID: 'AU', ALIGO_SENDER: '0212345678',
           DATA_GO_KR_KEY: 'TEST-KEY-NOT-REAL' }
  };
  Object.assign(s, over || {});
  return s;
}

/* 국세청 응답 만들기 — 공식 Swagger 모양 그대로 */
const ntsValid = (sttCd, stt, taxType) => ({
  status_code: 'OK', request_cnt: 1, valid_cnt: 1,
  data: [{ b_no: '0000000000', valid: '01', valid_msg: '',
           status: { b_no: '0000000000', b_stt: stt || '계속사업자', b_stt_cd: sttCd || '01',
                     tax_type: taxType || '부가가치세 일반과세자', tax_type_cd: '01', end_dt: '' } }]
});
const ntsInvalid = () => ({
  status_code: 'OK', request_cnt: 1, valid_cnt: 0,
  data: [{ b_no: '0000000000', valid: '02', valid_msg: '확인할 수 없습니다.' }]
});

function makeHandler(SRC_ENTRY, S) {
  const docs = S.docs;
  S.ver = S.ver || {};
  S.txRetries = 0;
  const bump = (p) => { S.ver[p] = (S.ver[p] || 0) + 1; };
  const tick = () => new Promise(r => setImmediate(r));
  const snapOf = (path, id) => ({
    exists: Object.prototype.hasOwnProperty.call(docs, path),
    data: () => docs[path], id: id
  });

  function refOf(path, id) {
    return {
      _path: path, _id: id,
      collection: (sub) => colOf(path + '/' + sub),
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

  /* 컬렉션 — doc() 과 where().limit().get() 만 흉내 낸다 (쓰는 곳이 그 둘뿐) */
  function colOf(col) {
    const q = (conds) => ({
      where: (f, op, v) => q(conds.concat([[f, op, v]])),
      limit: (n) => ({ get: async () => run(conds, n) }),
      get: async () => run(conds, 0)
    });
    async function run(conds, n) {
      await tick();
      S.calls.push(['query', col, JSON.stringify(conds)]);
      if (S.queryThrow) throw new Error('query failed');
      const out = [];
      Object.keys(docs).forEach((p) => {
        if (p.slice(0, col.length + 1) !== col + '/') return;
        if (p.slice(col.length + 1).indexOf('/') >= 0) return;    // 하위 컬렉션 제외
        const d = docs[p];
        const ok = conds.every(([f, op, v]) => (op === '==' ? d && d[f] === v : false));
        if (ok) out.push(snapOf(p, p.slice(col.length + 1)));
      });
      const rows = n ? out.slice(0, n) : out;
      return { empty: rows.length === 0, size: rows.length, docs: rows,
               forEach: (fn) => rows.forEach(fn) };
    }
    return Object.assign(q([]), { doc: (id) => refOf(col + '/' + id, id) });
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
          set:    (r, d) => { writes.push(['set', r._path, d]); },
          update: (r, d) => { writes.push(['update', r._path, d]); },
          delete: (r)    => { writes.push(['delete', r._path]); }
        };
        const result = await fn(tx);
        for (let i = 0; i < (S.txLag === undefined ? 1 : S.txLag); i++) await tick();
        let stale = false;
        for (const [p, v] of readVer) { if ((S.ver[p] || 0) !== v) { stale = true; break; } }
        if (stale) { S.txRetries++; continue; }
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

  let uidSeq = 0;
  const auth = {
    verifyIdToken: async (t) => { if (!S.tokens || !S.tokens[t]) throw new Error('bad token'); return S.tokens[t]; },
    getUserByEmail: async (e) => {
      S.calls.push(['getUserByEmail', e]);
      if (S.authByEmail[e]) return S.authByEmail[e];
      const er = new Error('x'); er.code = 'auth/user-not-found'; throw er;
    },
    createUser: async (p) => {
      S.calls.push(['createUser', p.email, (p.password || '').length + '자']);
      if (S.createThrow) { const e = new Error('x'); e.code = S.createThrow; throw e; }
      if (S.authByEmail[p.email]) { const e = new Error('x'); e.code = 'auth/email-already-exists'; throw e; }
      const uid = 'UID' + (++uidSeq);
      S.authByEmail[p.email] = { uid, email: p.email };
      S.users[uid] = { email: p.email };
      return { uid };
    },
    deleteUser: async (uid) => {
      S.calls.push(['deleteUser', uid]);
      if (S.deleteThrow) throw new Error('delete failed');
      Object.keys(S.authByEmail).forEach(e => { if (S.authByEmail[e].uid === uid) delete S.authByEmail[e]; });
      delete S.users[uid];
    },
    updateUser: async (uid, p) => { S.calls.push(['updateUser', uid, p]); return { uid }; },
    revokeRefreshTokens: async (uid) => { S.calls.push(['revokeRefreshTokens', uid]); }
  };

  /* fetch — 알리고와 국세청 둘 다 **가로챈다**. 실제 통신 없음. */
  const fakeFetch = async (url, opt) => {
    const u = String(url || '');
    if (u.indexOf('api.odcloud.kr') >= 0) {
      let body = null;
      try { body = JSON.parse((opt && opt.body) || 'null'); } catch (e) { body = String((opt && opt.body) || ''); }
      S.nts.push({ url: u, method: (opt && opt.method), headers: (opt && opt.headers), body });
      if (S.ntsThrow) throw new Error('network');
      return { ok: S.ntsStatus >= 200 && S.ntsStatus < 300, status: S.ntsStatus,
               json: async () => { if (S.ntsBadJson) throw new Error('bad json'); return S.ntsReply; } };
    }
    const o = {};
    String((opt && opt.body) || '').split('&').forEach(kv => {
      const i = kv.indexOf('=');
      if (i > 0) o[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    });
    S.aligo.push({ url: u, method: (opt && opt.method), headers: (opt && opt.headers), form: o });
    if (S.aligoThrow) throw new Error('network');
    return { json: async () => S.aligoReply };
  };

  /* firebase-admin·crypto 의 import 를 가짜로 바꾼다 (v252 otpenv 와 같은 방식) */
  const fb = (src) => src
    .replace(/^import \{[^}]*\} from 'firebase-admin\/app';$/m, "const { initializeApp, getApps, cert } = __fb.app;")
    .replace(/^import \{[^}]*\} from 'firebase-admin\/auth';$/m, "const { getAuth } = __fb.auth;")
    .replace(/^import \{[^}]*\} from 'firebase-admin\/firestore';$/m, "const { getFirestore } = __fb.fs;")
    .replace(/^import \{([^}]*)\} from 'crypto';$/m, "const {$1} = require('crypto');");

  /* 공용 파일을 앞에 붙여 한 덩어리로 — 실제 배포에서 import 가 하는 일과 같다.
     ★ 옛 코드(v260 api/otp.js)는 공용 파일이 없다 — 그때는 붙이지 않는다.
       그래야 전/후 비교에서 **같은 입력**을 양쪽에 넣을 수 있다. */
  /* ★ [^}]* 로 쓴다. [\s\S]*? 로 쓰면 **윗줄의 다른 import 부터** 잡아
     firebase-admin import 세 줄까지 한꺼번에 지워 버린다(실제로 겪었다 — getApps undefined). */
  const impRe = /^import \{[^}]*\} from '\.\.\/lib\/otp-core\.js';$/m;
  const usesCore = impRe.test(SRC_ENTRY);
  const core = usesCore ? fb(SRC_CORE).replace(/^export /mg, '') : '';
  /* v264: api/signup.js 가 lib/price.js 도 가져다 쓴다 — 같은 방식으로 앞에 붙인다.
     옛 판(v261~v263)에는 그 import 가 없으므로 아무것도 안 붙는다(전/후 비교 그대로). */
  const prcRe = /^import \{[^}]*\} from '\.\.\/lib\/price\.js';$/m;
  const price = prcRe.test(SRC_ENTRY)
    ? fs.readFileSync('' + COS_ROOT + '/lib/price.js', 'utf8').replace(/^export /mg, '')
    : '';
  const entry = fb(SRC_ENTRY)
    .replace(impRe, '/* lib/otp-core.js 는 위에 붙였다 */')
    .replace(prcRe, '/* lib/price.js 는 위에 붙였다 */')
    .replace(/^export default async function handler/m, 'module.exports.handler = async function handler')
    .replace(/^export /mg, '');

  const code = core + '\n' + price + '\n' + entry
    + "\nif (typeof bizNoChecksumOk === 'function') module.exports.bizNoChecksumOk = bizNoChecksumOk;"
    + "\nif (typeof checkBiz === 'function') module.exports.checkBiz = checkBiz;"
    + "\nreturn module.exports;";

  const fn = new Function('__fb', 'module', 'exports', 'process', 'console', 'fetch', 'require', code);
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

module.exports = { SRC_SIGNUP, SRC_OTP, SRC_CORE, OLD_OTP, OLD_REF,
                   makeState, makeHandler, req, res, ntsValid, ntsInvalid };
