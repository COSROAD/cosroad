// COSROAD — 기사 계정 관리 · 비밀번호 다시 정하기 (v250)
// Vercel: api/admin-account.js
//
// 왜 서버가 필요한가
//   계정을 만들고 비밀번호를 바꾸는 일은 **브라우저에서 할 수 없다.**
//   Firebase 클라이언트 SDK 로 createUser 를 하면 지금 로그인한 사람이 그 계정으로
//   바뀌어 버리고(관리자가 로그아웃된다), 남의 비밀번호는 아예 바꿀 수 없다.
//   그래서 Admin SDK 를 쓰는 서버 함수가 필요하다.
//
// 보안 — 네 겹
//   ① 허용 출처(ALLOWED) 검사 — send-sms.js 와 같은 목록
//   ② Authorization: Bearer <Firebase ID 토큰> → verifyIdToken (누가 불렀는지 서버가 직접 확인)
//   ③ 권한 판정 — 그 기관의 승인된 소유자이거나 마스터(admins/{uid})일 때만
//   ④ 같은 호출자 1분 10회 제한 (비밀번호 대입 시도 늦추기)
//
// ★ 서비스 계정 키는 환경변수 FIREBASE_SERVICE_ACCOUNT 에만 둔다 (절대규칙 1).
//   코드·커밋·로그·응답 어디에도 키나 비밀번호를 적지 않는다.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const ALLOWED = ['https://roadjob.co.kr', 'https://www.roadjob.co.kr', 'https://cosroad.com', 'https://www.cosroad.com', 'https://roadcrew.kr', 'https://cosroad.vercel.app'];
const BIZ = ['academy', 'public', 'logistics', 'delivery'];

/* 서비스 계정 — 함수가 깨어 있는 동안 한 번만 초기화한다 */
function admin() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('NO_SERVICE_ACCOUNT');
    let sa;
    try { sa = JSON.parse(raw); } catch (e) { throw new Error('BAD_SERVICE_ACCOUNT'); }
    initializeApp({ credential: cert(sa) });
  }
  return { auth: getAuth(), db: getFirestore() };
}

/* 빈도 제한 — 같은 호출자 1분에 10회.
   서버리스라 인스턴스가 여러 개일 수 있어 완벽하진 않지만, 한 인스턴스에서의
   연속 대입은 막힌다(없는 것보다 낫다). */
const hits = new Map();
function tooMany(uid) {
  const now = Date.now();
  const arr = (hits.get(uid) || []).filter(t => now - t < 60000);
  arr.push(now);
  hits.set(uid, arr);
  if (hits.size > 500) { for (const k of hits.keys()) { if (!hits.get(k).length) hits.delete(k); } }
  return arr.length > 10;
}

/* 앱(index.html phoneLoginId)과 **같은 규칙**으로 내부 아이디를 만든다.
   두 곳이 어긋나면 만든 계정으로 로그인이 안 된다. */
function phoneDigits(raw) {
  let t = String(raw || '').replace(/[^0-9]/g, '');
  if (t.indexOf('82') === 0 && t.length >= 11) t = '0' + t.slice(2);
  return t;
}
function phoneLoginId(raw) {
  const d = phoneDigits(raw);
  return d ? (d + '@phone.cosroad.com') : '';
}

const fail = (res, code, message) => res.status(code).json({ ok: false, message });

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED.includes(origin) ? origin : ALLOWED[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return fail(res, 405, 'POST만 허용됩니다.');
  if (!ALLOWED.includes(origin)) return fail(res, 403, '허용되지 않은 출처입니다.');

  let A;
  try { A = admin(); }
  catch (e) {
    const m = String(e && e.message);
    return fail(res, 500, m === 'NO_SERVICE_ACCOUNT'
      ? '서버에 관리자 키가 아직 등록되지 않았어요. 관리자에게 알려 주세요.'
      : '서버 관리자 키 형식이 올바르지 않아요. 관리자에게 알려 주세요.');
  }

  /* ② 호출자 확인 */
  const authz = String(req.headers.authorization || '');
  const idToken = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
  if (!idToken) return fail(res, 401, '로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.');
  let caller;
  try { caller = await A.auth.verifyIdToken(idToken); }
  catch (e) { return fail(res, 401, '로그인이 만료됐어요. 다시 로그인한 뒤 시도해 주세요.'); }
  if (caller.firebase && caller.firebase.sign_in_provider === 'anonymous') {
    return fail(res, 403, '계정으로 로그인한 뒤에 쓸 수 있어요.');
  }
  const callerUid = caller.uid;
  if (tooMany(callerUid)) return fail(res, 429, '요청이 너무 잦아요. 1분 뒤에 다시 시도해 주세요.');

  const b = req.body || {};
  const action = String(b.action || '');

  /* ③ 권한 — 마스터인가 / 그 기관의 승인된 소유자인가 */
  let isMaster = false;
  try {
    const s = await A.db.collection('admins').doc(callerUid).get();
    isMaster = s.exists;
  } catch (e) { isMaster = false; }

  async function isOwnerOf(org) {
    if (!org) return false;
    try {
      const s = await A.db.collection('users').doc(callerUid).get();
      if (!s.exists) return false;
      const u = s.data() || {};
      return u.orgId === org && u.approved === true && u.withdrawn !== true;
    } catch (e) { return false; }
  }

  /* 「🧪 테스트 출입」이 켜진 계정인가 (v254) — **_test 기관에서만** 통한다.
     규칙의 testAccessOk() 와 같은 뜻이고, 거기에 **기사 제외**를 더했다
     (기사 문서에는 approved 가 없어 어차피 막히지만 뜻을 또렷하게 둔다).
     사장님 결정 10-31(A안): 출입 허용 계정도 _test 에서 기사 계정을 다룰 수 있게 한다.
     ★ 실업체(_test 아닌 org)에는 **절대 열리지 않는다** — org 이름을 먼저 본다. */
  async function isTestAccessFor(org) {
    if (!org || !/_test$/.test(org)) return false;
    try {
      const s = await A.db.collection('users').doc(callerUid).get();
      if (!s.exists) return false;
      const u = s.data() || {};
      return u.testAccess === true && u.approved === true
             && u.withdrawn !== true && u.role !== 'driver';
    } catch (e) { return false; }
  }

  /* 마스터 uid 하나 — admins 컬렉션의 문서 id (v254).
     _test 기사의 소유자로 쓴다. 반환: uid | null */
  async function findMasterUid() {
    try {
      const snap = await A.db.collection('admins').limit(1).get();
      let uid = null;
      snap.forEach(d => { if (!uid) uid = d.id; });
      return uid;
    } catch (e) { return null; }
  }

  /* 이 기관의 **실제 소유자 uid** 를 찾는다 (v251).
     규칙의 ownerAlive(ownerUid) 가 users/{ownerUid} 의 승인·만료를 보므로,
     기사 문서의 ownerUid 는 반드시 **그 업체 소유자** 여야 한다.
     v250 에서는 호출자 uid 를 그대로 넣었다 — 마스터가 실업체 기사를 만들면
     ownerUid=마스터가 되고, 마스터는 users 문서가 없어 ownerAlive 가 실패해
     **그 기사가 자료를 못 봤다.**
     반환: { uid } | { error:'사람에게 보여줄 문구' } */
  async function resolveOwnerUid(org) {
    /* 호출자가 그 업체 소유자면 그 사람이 소유자다 (v250 과 같은 결과) */
    if (await isOwnerOf(org)) return { uid: callerUid };
    /* 마스터가 부른 경우 — users 에서 그 기관의 소유자를 찾는다.
       걸러내는 조건: 기사 문서(role:'driver') 제외 · **승인된** 계정만 · 탈퇴 아님.
       승인 안 된 계정을 소유자로 넣으면 규칙 ownerAlive(approved==true)가 막아
       **그 기사가 자료를 못 본다** — 그래서 여기서 미리 가린다. */
    let owners = [];
    try {
      const snap = await A.db.collection('users').where('orgId', '==', org).get();
      snap.forEach(d => {
        const u = d.data() || {};
        if (u.role === 'driver') return;
        if (u.approved !== true) return;
        if (u.withdrawn === true) return;
        owners.push(d.id);
      });
    } catch (e) {
      return { error: '업체 소유자를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
    }
    if (owners.length === 1) return { uid: owners[0] };
    /* 테스트 공간(_test)은 소유자 계정 없이 쓴다 — **소유자는 항상 마스터**로 둔다 (v254).
       규칙 ownerAlive 가 admins/{ownerUid} 가 있으면 살아 있다고 보므로(v253) 막히지 않는다.
       ★ 출입 허용 계정(휴대폰)을 소유자로 두면 안 된다 — 그 계정의 체험 30일이 끝나거나
         출입을 끄면 ownerAlive 가 거짓이 되어 **_test 기사가 같이 잠긴다.**
       호출자가 마스터면 그 사람이 마스터다. 출입 허용 계정이면 admins 에서 찾아 쓴다. */
    if (/_test$/.test(org)) {
      if (isMaster) return { uid: callerUid };
      const m = await findMasterUid();
      if (m) return { uid: m };
      return { error: '테스트 공간 관리자 계정을 찾지 못했어요.' };
    }
    if (owners.length === 0) {
      return { error: '이 업체의 소유자 계정을 찾을 수 없어요. 업체가 먼저 가입·승인돼야 해요.' };
    }
    return { error: '이 업체에 소유자 계정이 ' + owners.length + '개 있어요. 정리한 뒤 다시 시도해 주세요.' };
  }

  try {
    /* ── a) 기사 계정 만들기 ── */
    if (action === 'createDriver') {
      const org = String(b.org || '').trim();
      const carId = String(b.carId || '').trim();
      const name = String(b.name || '').trim();
      const pw = String(b.password || '');
      const loginId = phoneLoginId(b.phone);
      const digits = phoneDigits(b.phone);

      if (!org || !carId) return fail(res, 400, '기관·차량 정보가 빠졌어요.');
      if (!(isMaster || await isOwnerOf(org) || await isTestAccessFor(org))) return fail(res, 403, '이 업체의 기사 계정을 만들 권한이 없어요.');
      if (digits.length < 10 || digits.indexOf('0') !== 0) return fail(res, 400, '휴대폰 번호를 정확히 넣어 주세요. (예: 010-1234-5678)');
      if (pw.length < 6) return fail(res, 400, '비밀번호는 6자 이상이어야 해요.');

      /* 이미 쓰는 번호인가 */
      try {
        await A.auth.getUserByEmail(loginId);
        return fail(res, 409, '이미 쓰는 번호예요. 다른 번호를 쓰거나, 그 기사 계정의 비밀번호를 다시 정해 주세요.');
      } catch (e) {
        if (!e || e.code !== 'auth/user-not-found') {
          return fail(res, 500, '번호 확인에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
        }
      }

      /* ownerUid — 이 기사가 딸린 업체의 **소유자**. 규칙(isActiveDriver → ownerAlive)이
         이 값으로 소유자의 승인·만료를 본다. 계정을 만들기 **전에** 정해 둔다 —
         못 찾으면 계정만 떠도는 일이 없도록 여기서 멈춘다. (v251) */
      const own = await resolveOwnerUid(org);
      if (own.error) return fail(res, 409, own.error);
      const ownerUid = own.uid;

      const created = await A.auth.createUser({ email: loginId, password: pw, displayName: name || undefined });
      const now = Date.now();
      const rec = { role: 'driver', driverOrg: org, ownerUid: ownerUid,
                    carId: carId, name: name, phone: digits, createdAt: now };
      await A.db.collection('users').doc(created.uid).set(rec);
      await A.db.collection('orgs').doc(org).collection('drivers').doc(created.uid)
        .set({ carId: carId, name: name, phone: digits, ownerUid: ownerUid, createdAt: now });
      return res.status(200).json({ ok: true, driverUid: created.uid, loginPhone: digits });
    }

    /* ── b) 기사 비밀번호 다시 정하기 ── */
    if (action === 'resetDriverPassword') {
      const org = String(b.org || '').trim();
      const driverUid = String(b.driverUid || '').trim();
      const pw = String(b.password || '');
      if (!org || !driverUid) return fail(res, 400, '기관·기사 정보가 빠졌어요.');
      if (!(isMaster || await isOwnerOf(org) || await isTestAccessFor(org))) return fail(res, 403, '이 업체의 기사 비밀번호를 바꿀 권한이 없어요.');
      if (pw.length < 6) return fail(res, 400, '비밀번호는 6자 이상이어야 해요.');
      const d = await A.db.collection('orgs').doc(org).collection('drivers').doc(driverUid).get();
      if (!d.exists) return fail(res, 404, '이 업체의 기사 계정이 아니에요.');
      await A.auth.updateUser(driverUid, { password: pw, disabled: false });
      return res.status(200).json({ ok: true });
    }

    /* ── c) 기사 계정 끊기 ── */
    if (action === 'removeDriver') {
      const org = String(b.org || '').trim();
      const driverUid = String(b.driverUid || '').trim();
      if (!org || !driverUid) return fail(res, 400, '기관·기사 정보가 빠졌어요.');
      if (!(isMaster || await isOwnerOf(org) || await isTestAccessFor(org))) return fail(res, 403, '이 업체의 기사 계정을 끊을 권한이 없어요.');
      const d = await A.db.collection('orgs').doc(org).collection('drivers').doc(driverUid).get();
      if (!d.exists) return fail(res, 404, '이 업체의 기사 계정이 아니에요.');
      /* 계정은 **지우지 않고 잠근다** — 출퇴근·차계부 기록이 그 uid 로 남아 있다 */
      await A.auth.updateUser(driverUid, { disabled: true });
      await A.db.collection('orgs').doc(org).collection('drivers').doc(driverUid).delete();
      return res.status(200).json({ ok: true });
    }

    /* ── d) 마스터 — 가입자 비밀번호 다시 정하기 ── */
    if (action === 'masterResetPassword') {
      if (!isMaster) return fail(res, 403, '마스터만 쓸 수 있어요.');
      const targetUid = String(b.targetUid || '').trim();
      const pw = String(b.password || '');
      if (!targetUid) return fail(res, 400, '대상 계정이 빠졌어요.');
      if (pw.length < 6) return fail(res, 400, '비밀번호는 6자 이상이어야 해요.');
      await A.auth.updateUser(targetUid, { password: pw, disabled: false });
      return res.status(200).json({ ok: true });
    }

    return fail(res, 400, '알 수 없는 요청이에요.');
  } catch (e) {
    const code = String((e && e.code) || '');
    if (code === 'auth/email-already-exists') return fail(res, 409, '이미 쓰는 번호예요.');
    if (code === 'auth/invalid-password')     return fail(res, 400, '비밀번호는 6자 이상이어야 해요.');
    if (code === 'auth/user-not-found')       return fail(res, 404, '그 계정을 찾을 수 없어요.');
    /* 자세한 내용은 서버 로그에만 (응답으로 내보내면 안쪽 사정이 새어 나간다) */
    console.log('[admin-account] 실패', action, code, e && e.message);
    return fail(res, 500, '처리에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
  }
}
