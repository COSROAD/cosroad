/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ② v254 api/admin-account — 「🧪 테스트 출입」 계정이 _test 에서 기사 계정을 다룬다 */
const fs = require('fs');
const cp = require('child_process');
/* ★ v260: 이 묶음은 **v254 회차의 기록**이다. 그 회차가 다룬 세 동작
     (createDriver · resetDriverPassword · removeDriver)을 v260 에서 **지웠으므로**,
     지금 코드로 돌리면 전부 400 이 된다 — 그게 맞는 모습이고, 그 사실은 r_api260.js 가 본다.
     이 기록이 계속 재현되도록 **그 회차의 판(2eadaaa = v254)을 못 박는다.**
     (gate258.js 와 같은 방식 — 회차 기록은 그 회차의 코드로 돌린다) */
const PIN_REF = process.env.COS_PIN_REF || '2eadaaa';
const SRC_NEW = cp.execSync('git -C ' + COS_ROOT + ' show ' + PIN_REF + ':api/admin-account.js').toString();
const OLD_REF = process.env.COS_SRC_OLD_REF || '23202fc';
const SRC_OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/admin-account.js').toString();

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + label.padEnd(54) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

function makeHandler(SRC, S) {
  const docs = S.docs, authUsers = S.authUsers, calls = S.calls;
  const fakeAuth = {
    verifyIdToken: async (t) => { if (!S.tokens[t]) throw new Error('bad'); return S.tokens[t]; },
    getUserByEmail: async (e) => { if (authUsers[e]) return authUsers[e]; const er = new Error('x'); er.code = 'auth/user-not-found'; throw er; },
    createUser: async ({ email, password }) => {
      if (authUsers[email]) { const e = new Error('d'); e.code = 'auth/email-already-exists'; throw e; }
      const uid = 'NEWUID' + (++S.seq); authUsers[email] = { uid, email };
      calls.push(['createUser', email]); return { uid };
    },
    updateUser: async (uid, p) => { calls.push(['updateUser', uid, p]); return { uid }; }
  };
  function col(name) {
    return {
      doc: (id) => ({
        get: async () => ({ exists: !!docs[name + '/' + id], data: () => docs[name + '/' + id] }),
        set: async (d) => { docs[name + '/' + id] = d; calls.push(['set', name + '/' + id]); },
        delete: async () => { delete docs[name + '/' + id]; },
        collection: (sub) => ({
          doc: (sid) => ({
            get: async () => ({ exists: !!docs[name + '/' + id + '/' + sub + '/' + sid], data: () => docs[name + '/' + id + '/' + sub + '/' + sid] }),
            set: async (d) => { docs[name + '/' + id + '/' + sub + '/' + sid] = d; calls.push(['set', name + '/' + id + '/' + sub + '/' + sid]); },
            delete: async () => { delete docs[name + '/' + id + '/' + sub + '/' + sid]; }
          })
        })
      }),
      where: (field, op, val) => ({
        get: async () => {
          const hits = [];
          Object.keys(docs).forEach(k => {
            const p = k.split('/');
            if (p.length !== 2 || p[0] !== name) return;
            const d = docs[k];
            if (d && d[field] === val) hits.push({ id: p[1], data: () => d });
          });
          return { forEach: (f) => hits.forEach(f), size: hits.length };
        }
      }),
      /* v254: findMasterUid 가 admins.limit(1).get() 을 쓴다 */
      limit: (n) => ({
        get: async () => {
          const hits = [];
          Object.keys(docs).forEach(k => {
            const p = k.split('/');
            if (p.length !== 2 || p[0] !== name) return;
            if (hits.length < n) hits.push({ id: p[1], data: () => docs[k] });
          });
          calls.push(['limit', name, n, hits.length]);
          return { forEach: (f) => hits.forEach(f), size: hits.length };
        }
      })
    };
  }
  let code = SRC
    .replace(/^import \{[^}]*\} from 'firebase-admin\/app';$/m, "const { initializeApp, getApps, cert } = __fb.app;")
    .replace(/^import \{[^}]*\} from 'firebase-admin\/auth';$/m, "const { getAuth } = __fb.auth;")
    .replace(/^import \{[^}]*\} from 'firebase-admin\/firestore';$/m, "const { getFirestore } = __fb.fs;")
    /* v255: admin-account 가 crypto 를 쓴다(PIN 해시·업체번호) — 이 줄도 바꿔야 vm 에서 돈다 */
    .replace(/^import \{([^}]*)\} from 'crypto';$/m, "const {$1} = require('crypto');")
    .replace(/^export default async function handler/m, "module.exports = async function handler");
  const fn = new Function('__fb', 'module', 'exports', 'process', 'console', 'require', code + '\nreturn module.exports;');
  const mod = { exports: {} };
  return fn({ app: { initializeApp: () => {}, getApps: () => [1], cert: x => x },
    auth: { getAuth: () => fakeAuth }, fs: { getFirestore: () => ({ collection: col }) } },
    mod, mod.exports, { env: { FIREBASE_SERVICE_ACCOUNT: '{"project_id":"x"}', OTP_SECRET: 'SEKRIT-TEST' } },
    { log: () => {} }, require);
}

const TEST = 'freezone_test';
const REAL = 'academy_real1';
function st(opts) {
  opts = opts || {};
  const S = {
    seq: 0, authUsers: {}, calls: [],
    tokens: {
      masterTok: { uid: 'MASTER', firebase: { sign_in_provider: 'password' } },
      taTok:     { uid: 'TAOK',   firebase: { sign_in_provider: 'password' } },
      taPndTok:  { uid: 'TAPND',  firebase: { sign_in_provider: 'password' } },
      taWdrTok:  { uid: 'TAWDR',  firebase: { sign_in_provider: 'password' } },
      plainTok:  { uid: 'PLAIN',  firebase: { sign_in_provider: 'password' } },
      ownerTok:  { uid: 'OWNER',  firebase: { sign_in_provider: 'password' } },
      drvTok:    { uid: 'DRVTA',  firebase: { sign_in_provider: 'password' } }
    },
    docs: {
      'users/TAOK':  { orgId: 'academy_ta1', approved: true, testAccess: true },
      'users/TAPND': { orgId: 'academy_ta2', approved: false, testAccess: true },
      'users/TAWDR': { orgId: 'academy_ta3', approved: true, withdrawn: true, testAccess: true },
      'users/PLAIN': { orgId: 'academy_pl1', approved: true },
      'users/OWNER': { orgId: REAL, approved: true },
      /* 기사인데 testAccess·approved 를 심어 본 문서 — api 도 막아야 한다 */
      'users/DRVTA': { role: 'driver', driverOrg: TEST, ownerUid: 'MASTER', carId: 'c9',
                       approved: true, testAccess: true }
    }
  };
  if (opts.noAdmins !== true) S.docs['admins/MASTER'] = { role: 'master' };
  if (opts.extraAdmin) S.docs['admins/MASTER2'] = { role: 'master' };
  /* 끊기·비번 바꾸기 대상 기사 */
  S.docs['orgs/' + TEST + '/drivers/DRV_T'] = { carId: 'c1', ownerUid: 'MASTER' };
  S.docs['orgs/' + REAL + '/drivers/DRV_R'] = { carId: 'c1', ownerUid: 'OWNER' };
  return S;
}
const req = (body, tok) => ({ method: 'POST', headers: { origin: 'https://cosroad.com', authorization: 'Bearer ' + tok }, body });
function res() { const r = { code: 0, body: null }; r.setHeader = () => {}; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.end = () => r; return r; }
async function call(SRC, S, body, tok) {
  const h = makeHandler(SRC, S);
  const s = res();
  await h(req(body, tok), s);
  return s;
}
const newDrv = (S) => {
  const k = Object.keys(S.docs).find(x => /^users\/NEWUID/.test(x));
  const d = Object.keys(S.docs).find(x => /drivers\/NEWUID/.test(x));
  return { users: k ? S.docs[k] : null, drivers: d ? S.docs[d] : null, created: !!k };
};

(async () => {
  console.log('════ 1. 출입 허용 계정 + _test → 세 동작 모두 된다 (전/후) ════');
  for (const [name, SRC] of [['v253 (전)', SRC_OLD], ['v254 (후)', SRC_NEW]]) {
    const want = (SRC === SRC_OLD) ? 403 : 200;
    let S = st();
    let s = await call(SRC, S, { action: 'createDriver', org: TEST, carId: 'c5', phone: '010-1111-2222', password: 'pw1234', name: '김기사' }, 'taTok');
    ck(name + ' createDriver', s.code, want);
    if (SRC === SRC_NEW) {
      const d = newDrv(S);
      ck('   ★ users.ownerUid = 마스터', d.users && d.users.ownerUid, 'MASTER');
      ck('   ★ drivers.ownerUid = 마스터', d.drivers && d.drivers.ownerUid, 'MASTER');
      ck('   호출자(TAOK) 가 소유자로 들어가지 않았나', d.users && d.users.ownerUid !== 'TAOK', true);
      ck('   admins 를 limit(1) 로 찾았나', S.calls.some(c => c[0] === 'limit' && c[1] === 'admins'), true);
      ck('   role·driverOrg', (d.users.role + '/' + d.users.driverOrg), 'driver/' + TEST);
    }
    S = st();
    s = await call(SRC, S, { action: 'resetDriverPassword', org: TEST, driverUid: 'DRV_T', password: 'newpw1' }, 'taTok');
    ck(name + ' resetDriverPassword', s.code, want);
    S = st();
    s = await call(SRC, S, { action: 'removeDriver', org: TEST, driverUid: 'DRV_T' }, 'taTok');
    ck(name + ' removeDriver', s.code, want);
    if (SRC === SRC_NEW) {
      ck('   계정은 잠그고(disabled) 명부만 지웠나',
        S.calls.some(c => c[0] === 'updateUser' && c[2] && c[2].disabled === true)
        && !S.docs['orgs/' + TEST + '/drivers/DRV_T'], true);
    }
  }

  console.log('\n════ 2. ★ 실업체 org 에는 절대 열리지 않는다 ════');
  {
    for (const [label, body] of [
      ['createDriver', { action: 'createDriver', org: REAL, carId: 'c5', phone: '010-9999-8888', password: 'pw1234' }],
      ['resetDriverPassword', { action: 'resetDriverPassword', org: REAL, driverUid: 'DRV_R', password: 'newpw1' }],
      ['removeDriver', { action: 'removeDriver', org: REAL, driverUid: 'DRV_R' }]
    ]) {
      const S = st();
      const s = await call(SRC_NEW, S, body, 'taTok');
      ck('출입 허용 계정 + 실업체 ' + label + ' → 403', s.code, 403);
      ck('   Auth 계정 안 만들어짐', S.calls.filter(c => c[0] === 'createUser').length, 0);
    }
  }
  {
    /* 이름이 _test 로 끝나지 않는 비슷한 이름도 막혀야 한다 */
    const S = st();
    const s = await call(SRC_NEW, S, { action: 'createDriver', org: 'academy_test_x', carId: 'c5', phone: '010-1111-2222', password: 'pw1234' }, 'taTok');
    ck("'academy_test_x' (끝이 _test 아님) → 403", s.code, 403);
  }

  console.log('\n════ 3. 출입 표시·승인·탈퇴·기사 가리기 ════');
  for (const [label, tok] of [['출입 표시 없는 승인 계정', 'plainTok'], ['미승인 + 표시', 'taPndTok'],
                              ['탈퇴 + 표시', 'taWdrTok'], ['기사(testAccess·approved 심음)', 'drvTok']]) {
    const S = st();
    const s = await call(SRC_NEW, S, { action: 'createDriver', org: TEST, carId: 'c5', phone: '010-1111-2222', password: 'pw1234' }, tok);
    ck(label + ' + _test → 403', s.code, 403);
    ck('   Auth 계정 안 만들어짐', S.calls.filter(c => c[0] === 'createUser').length, 0);
  }
  {
    const S = st();
    const s = await call(SRC_NEW, S, { action: 'createDriver', org: TEST, carId: 'c5', phone: '010-1111-2222', password: 'pw1234' }, 'badtok');
    ck('엉터리 토큰 → 401', s.code, 401);
  }

  console.log('\n════ 4. masterResetPassword 는 그대로 마스터 전용 ════');
  for (const [label, tok, want] of [['마스터', 'masterTok', 200], ['★ 출입 허용 계정', 'taTok', 403],
                                    ['업체 소유자', 'ownerTok', 403], ['출입 표시 없음', 'plainTok', 403]]) {
    const S = st();
    const s = await call(SRC_NEW, S, { action: 'masterResetPassword', targetUid: 'OWNER', password: 'newpw1' }, tok);
    ck(label + ' → ' + want, s.code, want);
  }

  console.log('\n════ 5. admins 가 비어 있으면 (계정 만들기 전에 멈춘다) ════');
  {
    const S = st({ noAdmins: true });
    const s = await call(SRC_NEW, S, { action: 'createDriver', org: TEST, carId: 'c5', phone: '010-1111-2222', password: 'pw1234' }, 'taTok');
    ck('출입 허용 계정 + admins 없음 → 409', s.code, 409);
    ck('   문구', s.body.message, '테스트 공간 관리자 계정을 찾지 못했어요.');
    ck('   ★ Auth 계정이 만들어지지 않았다', S.calls.filter(c => c[0] === 'createUser').length, 0);
    ck('   users·drivers 문서도 없다', newDrv(S).created, false);
  }
  {
    /* 마스터가 둘이어도 하나를 고른다 (limit 1) */
    const S = st({ extraAdmin: true });
    const s = await call(SRC_NEW, S, { action: 'createDriver', org: TEST, carId: 'c5', phone: '010-1111-2222', password: 'pw1234' }, 'taTok');
    ck('admins 둘 → 200 (하나를 고른다)', s.code, 200);
    ck('   고른 ownerUid 가 admins 중 하나', ['MASTER', 'MASTER2'].indexOf(newDrv(S).users.ownerUid) >= 0, true);
  }

  console.log('\n════ 6. 마스터·소유자 경로는 전과 같다 (회귀) ════');
  {
    for (const [label, tok, org, want] of [
      ['마스터 + _test createDriver', 'masterTok', TEST, 200],
      ['마스터 + 실업체 createDriver', 'masterTok', REAL, 200],
      ['소유자 + 자기 실업체 createDriver', 'ownerTok', REAL, 200]
    ]) {
      const A = st(), B = st();
      const sa = await call(SRC_OLD, A, { action: 'createDriver', org: org, carId: 'c5', phone: '010-1111-2222', password: 'pw1234' }, tok);
      const sb = await call(SRC_NEW, B, { action: 'createDriver', org: org, carId: 'c5', phone: '010-1111-2222', password: 'pw1234' }, tok);
      ck(label + ' 전/후 같은 코드', sa.code + '/' + sb.code, want + '/' + want);
      const da = newDrv(A), db = newDrv(B);
      ck('   ownerUid 전/후 같음', String(da.users && da.users.ownerUid) + '/' + String(db.users && db.users.ownerUid),
        String(da.users && da.users.ownerUid) + '/' + String(da.users && da.users.ownerUid));
    }
  }
  {
    /* 마스터가 만든 _test 기사의 ownerUid 는 종전처럼 호출자(=마스터) */
    const S = st();
    await call(SRC_NEW, S, { action: 'createDriver', org: TEST, carId: 'c5', phone: '010-1111-2222', password: 'pw1234' }, 'masterTok');
    ck('마스터 + _test → ownerUid = 호출자(MASTER)', newDrv(S).users.ownerUid, 'MASTER');
    ck('   admins 조회를 안 했나 (마스터는 자기 uid)', S.calls.some(c => c[0] === 'limit'), false);
  }
  {
    /* 다른 action·거부 경로 회귀 */
    const S = st();
    let s = await call(SRC_NEW, S, { action: 'resetDriverPassword', org: TEST, driverUid: 'NOPE', password: 'newpw1' }, 'taTok');
    ck('남의/없는 기사 reset → 404 (명부 검사 그대로)', s.code, 404);
    s = await call(SRC_NEW, S, { action: 'removeDriver', org: TEST, driverUid: 'NOPE' }, 'taTok');
    ck('없는 기사 remove → 404', s.code, 404);
    s = await call(SRC_NEW, S, { action: 'removeDriver', org: REAL, driverUid: 'DRV_R' }, 'masterTok');
    ck('마스터 + 실업체 remove → 200 (종전)', s.code, 200);
    s = await call(SRC_NEW, S, { action: 'nope' }, 'masterTok');
    ck('모르는 action → 400', s.code, 400);
    const h = makeHandler(SRC_NEW, st()); const r = res();
    await h({ method: 'POST', headers: {}, body: { action: 'createDriver' } }, r);
    ck('출처 없음 → 403', r.code, 403);
  }
  {
    /* 비번·번호 입력 검사 회귀 */
    const S = st();
    let s = await call(SRC_NEW, S, { action: 'createDriver', org: TEST, carId: 'c5', phone: '010', password: 'pw1234' }, 'taTok');
    ck('번호 짧음 → 400', s.code, 400);
    s = await call(SRC_NEW, S, { action: 'createDriver', org: TEST, carId: 'c5', phone: '010-1111-2222', password: 'pw' }, 'taTok');
    ck('비번 5자 미만 → 400', s.code, 400);
    S.authUsers['01011112222@phone.cosroad.com'] = { uid: 'X', email: 'x' };
    s = await call(SRC_NEW, S, { action: 'createDriver', org: TEST, carId: 'c5', phone: '010-1111-2222', password: 'pw1234' }, 'taTok');
    ck('이미 쓰는 번호 → 409', s.code, 409);
  }

  console.log('\n════ 7. 코드 원문 ════');
  {
    const has = (s) => SRC_NEW.indexOf(s) >= 0;
    /* 아래 몇 줄은 **지금 코드**(살아 있는 파일)를 본다 — v255 이후에 생긴 모습이라
       못 박은 v254 판에는 없다. v260 이 세 동작을 지운 뒤에도 세 갈래 권한이 그대로인지 본다. */
    const LIVE = fs.readFileSync('' + COS_ROOT + '/api/admin-account.js', 'utf8');
    const hasLive = (s) => LIVE.indexOf(s) >= 0;
    ck('isTestAccessFor 가 org 이름을 먼저 본다',
      has("if (!org || !/_test$/.test(org)) return false;"), true);
    ck('   네 조건 (testAccess·approved·withdrawn·role)',
      has("return u.testAccess === true && u.approved === true"), true);
    ck('   기사 제외', has("&& u.withdrawn !== true && u.role !== 'driver';"), true);
    ck('findMasterUid 가 limit(1)', has("A.db.collection('admins').limit(1).get()"), true);
    ck('_test 분기: 마스터면 callerUid', has("if (isMaster) return { uid: callerUid };"), true);
    ck('   아니면 admins 에서', has("const m = await findMasterUid();"), true);
    ck('   없으면 409 문구', has("return { error: '테스트 공간 관리자 계정을 찾지 못했어요.' };"), true);
    /* v254 는 세 action(createDriver·resetDriverPassword·removeDriver)이 이 줄을 썼다.
       v255 가 기사 로그인 7동작을 더하면서 같은 뜻의 canManage() 를 **한 줄로 묶어** 네 번째가 됐다.
       지켜야 할 것은 「세 갈래가 그대로인가」이므로 3 을 못 박지 않고 3 이상을 본다. */
    const _three = (SRC_NEW.match(/isMaster \|\| await isOwnerOf\(org\) \|\| await isTestAccessFor\(org\)/g) || []).length;
    ck('(v254 판) 세 갈래 권한 줄 ' + _three + '줄', _three >= 3, true);
    /* v260 이 세 동작을 지운 뒤 **지금 코드**에 남은 세 갈래 — canManage 한 줄로 묶여 있다 */
    const _liveThree = (LIVE.match(/isMaster \|\| await isOwnerOf\(org\) \|\| await isTestAccessFor\(org\)/g) || []).length;
    ck('(지금) 세 갈래 권한 줄 ' + _liveThree + '줄 — canManage 하나로 묶였다', _liveThree, 1);
    ck('(지금) v255 canManage 가 같은 세 갈래',
      hasLive("const canManage = async (org) =>\n      !!org && (isMaster || await isOwnerOf(org) || await isTestAccessFor(org));"), true);
    ck('masterResetPassword 는 isMaster 만', has("if (action === 'masterResetPassword') {\n      if (!isMaster) return fail(res, 403, '마스터만 쓸 수 있어요.');"), true);
    ck('resolveOwnerUid 실업체 분기 무변경',
      has("return { error: '이 업체의 소유자 계정을 찾을 수 없어요. 업체가 먼저 가입·승인돼야 해요.' };"), true);
    /* ★ v261 에서 범위를 못 박았다 — 작업트리와 견주면 뒤 회차(v261)가 고친 api/otp.js 가
       섞여 들어와 이 회차 기록이 거짓으로 깨진다. OLD_REF ↔ v254 커밋으로 본다. */
    ck('api/otp.js 는 손대지 않았나 (v254 회차 범위)',
      cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' 2eadaaa').toString().indexOf('api/otp.js') < 0, true);
    ck('s.html 도 손대지 않았나',
      /* v256 보정3 이 s.html 에 줄바꿈 두 줄을 넣었다 → v254 **자신이** 안 건드렸는지로 본다 */
      cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' 2eadaaa').toString().indexOf('s.html') < 0, true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
})().catch(e => { console.log('오류: ' + e.message); console.log(e.stack.split('\n').slice(0, 6).join('\n')); });
