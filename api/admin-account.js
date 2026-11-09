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
import { createHash, randomInt } from 'crypto';
/* v263: 이용 기간 날짜 셈 — 승인·연장·기간 정하기가 **같은 한 벌**을 쓴다 (lib/period.js) */
import { approvePeriod, extendPeriod, dateStrEnd, dateStr, isAliveUser } from '../lib/period.js';
import { PLANS } from '../lib/price.js';

/* v266: 안 쓰는 주소 셋(roadjob.co.kr·www.roadjob.co.kr·roadcrew.kr)을 뺐다.
   0단계 조사에서 배포된 roadjob.co.kr 을 받아 확인한 결과, 로드잡은 자기 서버
   (roadjob.vercel.app)만 부르고 cosroad.vercel.app 은 한 곳도 안 부른다. */
const ALLOWED = ['https://cosroad.com', 'https://www.cosroad.com', 'https://cosroad.vercel.app'];
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

/* ★ v278(47): 네 번째 `why` 를 받는다 — `api/driver-auth.js` 의 `fail` 과 **같은 꼴**이다.
   안 주면 지금까지와 **글자 그대로 같은 응답**(`{ok:false, message}`)이라 옛 호출은 안 바뀐다.
   화면이 「권한 없음」과 「기간 끝남」을 가려 안내하려면 이 한 칸이 필요하다. */
const fail = (res, code, message, why) =>
  res.status(code).json(why ? { ok: false, message, why } : { ok: false, message });

/* ── 기사 로그인 (v255) ───────────────────────────────────────────────────
   PIN 은 서버에만 **해시**로 둔다. 해시 비밀값은 `OTP_SECRET` 을 **그대로 쓴다** —
   새 환경변수를 만들면 사장님이 또 등록해야 하고, 빠뜨리면 조용히 약해진다.
   용도가 섞이지 않게 해시 재료에 org 를 넣는다: sha256(pin + '|' + org + '|' + 비밀값)
   → 같은 PIN 이라도 업체가 다르면 해시가 다르다(업체끼리 대조 불가). */
const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');
const pinHashOf = (pin, org, secret) => sha256(String(pin) + '|' + String(org) + '|' + String(secret));
const driverUidOf = (org, carId) => 'drv_' + org + '_' + carId;
/* 동승 도우미 uid — **사람 기준**이다(차량 기준인 기사 uid 와 다르다).
   도우미가 탈 차량은 수시로 바뀌므로 uid 에 차량을 넣으면 안 된다(코스로드43 설계 2-2). */
const helperUidOf = (org, staffId) => 'hlp_' + org + '_' + staffId;

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
    /* ── v260: 옛 기사 계정 세 동작을 지웠다 (createDriver · resetDriverPassword · removeDriver) ──
       v250~v254 의 기사 계정(휴대폰 번호 + 비밀번호)을 v255 에서 없앴다(업체 번호 + PIN).
       화면에서 부르는 곳이 0임을 먼저 전수 확인한 뒤 지웠다(앱·다른 api·문답표 모두 0).
       지운 이름으로 요청이 오면 아래 맨 끝의 **모르는 action 처리**로 떨어져 400 이 된다.
       기사 정리는 「PIN 지우기」(removeDriverPin)·「기기 풀기」(unbindDevice)로 한다. */
    /* ══════════ 기사 로그인 (v255) ══════════
       권한은 전부 **세 갈래**로 같다: 마스터 · 그 업체 소유자 · _test 출입 허용 계정.
       PIN 원문은 응답·로그 어디에도 담지 않는다. */
    const canManage = async (org) =>
      !!org && (isMaster || await isOwnerOf(org) || await isTestAccessFor(org));
    /* ★★ 코스로드47: **업체 쪽 「쓰기」 동작은 이용 기간도 본다.**
       `canManage`(= orgId·approved·withdrawn)만 보던 때는 **기간이 끝난 업체도**
       업체 번호를 만들고 기사 PIN 을 정하고 기기를 풀 수 있었다(고치기 전 코드로 실측).
       · **읽기 둘(`driverInfo`·`checkPinDup`)은 그대로 둔다** — 규칙도 「만료 업체는 읽기만」이다
         (`isMyOrgReadable`). 보는 것까지 막으면 왜 막혔는지도 못 보게 된다.
       · **마스터는 통과** — 기간을 정하는 쪽이다.
       · **`_test`** 는 소유자가 마스터(resolveOwnerUid 의 `_test` 분기)라 `admins` 에서 통과한다.
       · 마스터 전용 동작(승인·연장·기간·승인취소·비번·할인조회)은 **건드리지 않았다.**
       판정은 `lib/period.js isAliveUser` 한 줄 — 규칙·send-guard·driver-auth 와 같다(코스로드45). */
    const orgAlive = async (org) => {
      if (isMaster) return true;
      const r = await resolveOwnerUid(org);
      if (r.error || !r.uid) return false;
      try {
        if ((await A.db.collection('admins').doc(r.uid).get()).exists) return true;   /* _test 등 */
        const s = await A.db.collection('users').doc(r.uid).get();
        if (!s.exists) return false;
        return isAliveUser(s.data() || {}, Date.now());
      } catch (e) { return false; }
    };
    const EXPIRED_MSG = '업체 이용 기간이 끝났어요. 관리자에게 문의해 주세요.';
    const secretOf = () => process.env.OTP_SECRET || '';

    /* ── e) 업체 번호 발급 — 없으면 만들고, 있으면 그대로 돌려준다 ── */
    if (action === 'issueOrgCode') {
      const org = String(b.org || '').trim();
      if (!org) return fail(res, 400, '기관 정보가 빠졌어요.');
      if (!(await canManage(org))) return fail(res, 403, '이 업체의 번호를 볼 권한이 없어요.');
      /* 코스로드47: 쓰기 동작이라 **이용 기간**도 본다 */
      if (!(await orgAlive(org))) return fail(res, 403, EXPIRED_MSG, 'expired');
      /* 이미 있으면 그것 */
      try {
        const snap = await A.db.collection('orgCodes').where('orgId', '==', org).limit(1).get();
        let found = null;
        snap.forEach(d => { if (!found) found = d.id; });
        if (found) return res.status(200).json({ ok: true, code: found, made: false });
      } catch (e) { return fail(res, 500, '번호를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.' ); }
      /* 없으면 6자리를 뽑는다 — 겹치면 다시. 트랜잭션으로 **같은 순간에 둘이 같은 번호**를 못 받게 */
      for (let i = 0; i < 12; i++) {
        const code = String(randomInt(100000, 1000000));
        try {
          const got = await A.db.runTransaction(async (tx) => {
            const ref = A.db.collection('orgCodes').doc(code);
            const s = await tx.get(ref);
            if (s.exists) return false;                 // 겹쳤다 → 다시 뽑는다
            tx.set(ref, { orgId: org, createdAt: Date.now() });
            return true;
          });
          if (got) return res.status(200).json({ ok: true, code: code, made: true });
        } catch (e) { /* 충돌 — 다시 뽑는다 */ }
      }
      return fail(res, 500, '번호를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    }

    /* ── f) 기사 PIN 정하기·바꾸기 ── */
    if (action === 'setDriverPin') {
      const org = String(b.org || '').trim();
      const carId = String(b.carId || '').trim();
      const pin = String(b.pin || '').replace(/[^0-9]/g, '');
      if (!org || !carId) return fail(res, 400, '기관·차량 정보가 빠졌어요.');
      if (!(await canManage(org))) return fail(res, 403, '이 업체의 기사 PIN 을 정할 권한이 없어요.');
      /* 코스로드47: 쓰기 동작이라 **이용 기간**도 본다 */
      if (!(await orgAlive(org))) return fail(res, 403, EXPIRED_MSG, 'expired');
      if (!/^\d{4}$/.test(pin)) return fail(res, 400, 'PIN 은 숫자 4자리여야 해요.');
      const secret = secretOf();
      if (!secret) return fail(res, 500, '서버 인증 설정이 아직 안 됐어요. 관리자에게 알려 주세요.');
      const want = pinHashOf(pin, org, secret);
      /* 그 업체 **다른 기사**와 겹치면 거절 (앱의 13902~13905 중복 검사를 서버로 옮긴 것) */
      try {
        const snap = await A.db.collection('driverPins').where('org', '==', org).get();
        let dup = null;
        snap.forEach(d => {
          const v = d.data() || {};
          if (String(v.carId || '') !== carId && v.pinHash === want) dup = String(v.carId || '');
        });
        if (dup) return fail(res, 409, '그 PIN 은 이미 다른 기사가 쓰고 있어요. 다른 번호로 정해 주세요.');
      } catch (e) { return fail(res, 500, 'PIN 을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); }
      try {
        await A.db.collection('driverPins').doc(org + '_' + carId)
          .set({ org: org, carId: carId, pinHash: want, updatedAt: Date.now() });
      } catch (e) { return fail(res, 500, 'PIN 을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); }
      /* PIN 을 바꾸면 **기기 묶기를 풀고 토큰을 무효로** — 기사가 바뀐 경우를 위해서다.
         (차량 기준 uid 라 사람이 바뀌어도 uid 가 같다 — 그래서 토큰을 끊어 줘야 한다) */
      try { await A.db.collection('driverDevices').doc(org + '_' + carId).delete(); } catch (e) {}
      try { await A.auth.revokeRefreshTokens(driverUidOf(org, carId)); } catch (e) {}
      return res.status(200).json({ ok: true });
    }

    /* ── g) PIN 중복 확인 — 직원·회원 PIN 저장 때 기사 PIN 과 겹치는지 ── */
    if (action === 'checkPinDup') {
      const org = String(b.org || '').trim();
      const pin = String(b.pin || '').replace(/[^0-9]/g, '');
      if (!org) return fail(res, 400, '기관 정보가 빠졌어요.');
      if (!(await canManage(org))) return fail(res, 403, '권한이 없어요.');
      if (!/^\d{4}$/.test(pin)) return res.status(200).json({ ok: true, dup: false });
      const secret = secretOf();
      if (!secret) return fail(res, 500, '서버 인증 설정이 아직 안 됐어요.');
      const want = pinHashOf(pin, org, secret);
      /* v280(43-A): **직원 PIN 도 해시**가 되었으므로 여기서 함께 본다.
         `exceptStaffId` 는 「그 직원 자신」을 빼고 보라는 뜻이다(자기 PIN 을 다시 저장할 때). */
      const exceptStaffId = String(b.exceptStaffId || '').trim();
      try {
        const snap = await A.db.collection('driverPins').where('org', '==', org).get();
        let dup = false, carId = '', staffId = '', kind = '';
        snap.forEach(d => {
          const v = d.data() || {};
          if (!dup && v.pinHash === want) { dup = true; kind = 'driver'; carId = String(v.carId || ''); }
        });
        if (!dup) {
          const ss = await A.db.collection('staffPins').where('org', '==', org).get();
          ss.forEach(d => {
            const v = d.data() || {};
            if (dup) return;
            if (exceptStaffId && String(v.staffId || '') === exceptStaffId) return;
            if (v.pinHash === want) { dup = true; kind = 'staff'; staffId = String(v.staffId || ''); }
          });
        }
        /* 예·아니오와 **누구인지(차량·직원 id)** 만 — PIN 값이나 해시는 돌려주지 않는다 */
        return res.status(200).json({ ok: true, dup: dup, kind: kind, carId: carId, staffId: staffId });
      } catch (e) { return fail(res, 500, '확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); }
    }

    /* ── h) 기사 PIN 지우기 — 즉시 로그인 불가 ── */
    if (action === 'removeDriverPin') {
      const org = String(b.org || '').trim();
      const carId = String(b.carId || '').trim();
      if (!org || !carId) return fail(res, 400, '기관·차량 정보가 빠졌어요.');
      if (!(await canManage(org))) return fail(res, 403, '이 업체의 기사 PIN 을 지울 권한이 없어요.');
      /* 코스로드47: 쓰기 동작이라 **이용 기간**도 본다 */
      if (!(await orgAlive(org))) return fail(res, 403, EXPIRED_MSG, 'expired');
      const uid = driverUidOf(org, carId);
      /* ① PIN 삭제 ② 기기 풀기 ③ 명부 삭제(규칙 isActiveDriver 가 막는다) ④ 토큰 무효 */
      try { await A.db.collection('driverPins').doc(org + '_' + carId).delete(); } catch (e) {}
      try { await A.db.collection('driverDevices').doc(org + '_' + carId).delete(); } catch (e) {}
      try { await A.db.collection('orgs').doc(org).collection('drivers').doc(uid).delete(); } catch (e) {}
      try { await A.auth.revokeRefreshTokens(uid); } catch (e) {}
      /* users 문서와 로그인 기록은 **남긴다** — 출퇴근·차계부 기록이 그 uid 로 남아 있고,
         「언제 누가 들어왔었나」도 지우지 않는다(v250 removeDriver 와 같은 뜻). */
      return res.status(200).json({ ok: true });
    }

    /* ── i) 기기 풀기 ── */
    /* ★ 43-C(v282): **도우미 기기**도 여기서 푼다 — `staffId` 를 주면 사람 기준 문서를 지운다.
       (기사는 차량 기준 `<org>_<carId>` · 도우미는 사람 기준 `<org>_hlp_<staffId>`)
       동작을 새로 만들지 않은 이유: 권한·기간 검사와 문구가 **한 자리**에 있어야 어긋나지 않는다. */
    if (action === 'unbindDevice') {
      const org = String(b.org || '').trim();
      const carId = String(b.carId || '').trim();
      const staffId = String(b.staffId || '').trim();
      if (!org || (!carId && !staffId)) return fail(res, 400, '기관·차량 정보가 빠졌어요.');
      if (!(await canManage(org))) return fail(res, 403, '이 업체의 기기를 풀 권한이 없어요.');
      /* 코스로드47: 쓰기 동작이라 **이용 기간**도 본다 */
      if (!(await orgAlive(org))) return fail(res, 403, EXPIRED_MSG, 'expired');
      const devId = staffId ? (org + '_hlp_' + staffId) : (org + '_' + carId);
      try { await A.db.collection('driverDevices').doc(devId).delete(); } catch (e) {
        return fail(res, 500, '기기를 풀지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      }
      return res.status(200).json({ ok: true });
    }

    /* ── j) 차량별 기사 로그인 상태 — 관리자 화면이 보는 것 ── */
    if (action === 'driverInfo') {
      const org = String(b.org || '').trim();
      if (!org) return fail(res, 400, '기관 정보가 빠졌어요.');
      if (!(await canManage(org))) return fail(res, 403, '이 업체의 기사 정보를 볼 권한이 없어요.');
      const out = {};
      try {
        /* PIN 설정 여부만 — **해시도 값도 돌려주지 않는다** */
        const ps = await A.db.collection('driverPins').where('org', '==', org).get();
        ps.forEach(d => {
          const v = d.data() || {};
          const c = String(v.carId || ''); if (!c) return;
          out[c] = out[c] || {};
          out[c].hasPin = true;
          out[c].pinAt = v.updatedAt || null;
        });
        const ds = await A.db.collection('driverDevices').where('org', '==', org).get();
        ds.forEach(d => {
          const v = d.data() || {};
          const c = String(v.carId || ''); if (!c) return;
          out[c] = out[c] || {};
          out[c].deviceBound = true;
          out[c].deviceAt = v.boundAt || null;
        });
        /* 최근 로그인 기록 — 차량당 5건. 색인 없이 쓰려고 org 로만 걸러 받아서 자른다. */
        const ls = await A.db.collection('driverLogins').where('org', '==', org)
                     .orderBy('at', 'desc').limit(200).get();
        ls.forEach(d => {
          const v = d.data() || {};
          const c = String(v.carId || ''); if (!c) return;
          out[c] = out[c] || {};
          out[c].logins = out[c].logins || [];
          if (out[c].logins.length < 5) {
            out[c].logins.push({ at: v.at || 0, atKst: v.atKst || '', ok: !!v.ok, why: v.why || '',
                                 lat: (v.lat === undefined ? null : v.lat),
                                 lng: (v.lng === undefined ? null : v.lng),
                                 acc: (v.acc === undefined ? null : v.acc) });
          }
        });
      } catch (e) {
        /* orderBy 색인이 없으면 여기로 온다 — PIN·기기 상태만이라도 돌려준다 */
        console.log('[admin-account] driverInfo 일부 실패', String((e && e.code) || ''));
        return res.status(200).json({ ok: true, info: out, partial: true });
      }
      return res.status(200).json({ ok: true, info: out });
    }

    /* ── k) 옛 자료 옮기기 — cars[].driverPin → 해시 (급여 4값은 앱이 driverPay 로) ── */
    if (action === 'migrateDriverData') {
      const org = String(b.org || '').trim();
      const list = Array.isArray(b.cars) ? b.cars : [];
      if (!org) return fail(res, 400, '기관 정보가 빠졌어요.');
      if (!(await canManage(org))) return fail(res, 403, '권한이 없어요.');
      /* 코스로드47: 쓰기 동작이라 **이용 기간**도 본다 */
      if (!(await orgAlive(org))) return fail(res, 403, EXPIRED_MSG, 'expired');
      const secret = secretOf();
      if (!secret) return fail(res, 500, '서버 인증 설정이 아직 안 됐어요.');
      let moved = 0, dup = 0, bad = 0;
      const seen = {};
      for (const c of list) {
        const carId = String((c && c.carId) || '').trim();
        const pin = String((c && c.pin) || '').replace(/[^0-9]/g, '');
        if (!carId || !/^\d{4}$/.test(pin)) { bad++; continue; }
        const want = pinHashOf(pin, org, secret);
        if (seen[want]) { dup++; continue; }      // 옛 자료에 같은 PIN 이 둘 있으면 **첫 것만**
        seen[want] = carId;
        try {
          await A.db.collection('driverPins').doc(org + '_' + carId)
            .set({ org: org, carId: carId, pinHash: want, updatedAt: Date.now() });
          moved++;
        } catch (e) { bad++; }
      }
      return res.status(200).json({ ok: true, moved: moved, dup: dup, bad: bad });
    }

    /* ══════════ 직원 PIN (v280 · 43-A) ══════════
       왜 — 직원 PIN 은 `data/staff[].pin` 에 **평문**으로 있었다. 지금은 PIN 판 출퇴근에만 쓰지만
       **43-B 에서 「동승 로그인」 자격**이 된다. 기사 PIN 을 v255 에 해시로 옮긴 것과 **같은 이유**다
       (기사 PIN 은 `cars` 안에 평문으로 있어 기사 폰이 남의 PIN 을 다 봤다).
       · 서버 전용 컬렉션 `staffPins/{org}_{staffId}` = `{ org, staffId, pinHash, updatedAt }`
       · 해시는 기사와 **같은 재료** `sha256(pin|org|OTP_SECRET)` — **새 환경변수 없음**
       · PIN 원문·해시는 응답·로그에 **넣지 않는다**(기사와 같은 약속)
       · 권한·이용 기간 판정은 기사 PIN 동작과 **같은 길**(canManage + orgAlive, 코스로드47) */
    if (action === 'setStaffPin') {
      const org = String(b.org || '').trim();
      const staffId = String(b.staffId || '').trim();
      const pin = String(b.pin || '').replace(/[^0-9]/g, '');
      if (!org || !staffId) return fail(res, 400, '기관·직원 정보가 빠졌어요.');
      if (!(await canManage(org))) return fail(res, 403, '이 업체의 직원 PIN 을 정할 권한이 없어요.');
      if (!(await orgAlive(org))) return fail(res, 403, EXPIRED_MSG, 'expired');
      if (!/^\d{4}$/.test(pin)) return fail(res, 400, 'PIN 은 숫자 4자리여야 해요.');
      const secret = secretOf();
      if (!secret) return fail(res, 500, '서버 인증 설정이 아직 안 됐어요. 관리자에게 알려 주세요.');
      const want = pinHashOf(pin, org, secret);
      /* 그 업체 **기사·다른 직원**과 겹치면 거절 (업체 안에서 PIN 4자리는 유일하다는 약속) */
      try {
        const ds = await A.db.collection('driverPins').where('org', '==', org).get();
        let dupCar = null;
        ds.forEach(d => { const v = d.data() || {}; if (v.pinHash === want) dupCar = String(v.carId || ''); });
        if (dupCar) return fail(res, 409, '그 PIN 은 이미 기사가 쓰고 있어요. 다른 번호로 정해 주세요.');
        const ss = await A.db.collection('staffPins').where('org', '==', org).get();
        let dupSt = null;
        ss.forEach(d => {
          const v = d.data() || {};
          if (String(v.staffId || '') !== staffId && v.pinHash === want) dupSt = String(v.staffId || '');
        });
        if (dupSt) return fail(res, 409, '그 PIN 은 이미 다른 직원이 쓰고 있어요. 다른 번호로 정해 주세요.');
      } catch (e) { return fail(res, 500, 'PIN 을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); }
      try {
        await A.db.collection('staffPins').doc(org + '_' + staffId)
          .set({ org: org, staffId: staffId, pinHash: want, updatedAt: Date.now() });
      } catch (e) { return fail(res, 500, 'PIN 을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); }
      /* 도우미 로그인(43-B)이 열렸으므로 **토큰을 끊는다** — 옛 PIN 으로 받은 토큰은 못 쓴다 */
      try { await A.auth.revokeRefreshTokens(helperUidOf(org, staffId)); } catch (e) {}
      /* ★ 43-C: **묶인 기기도 푼다** — 기사 `setDriverPin` 과 **같은 태도**다.
         PIN 을 새로 정해 주는 때가 보통 「폰을 바꿨다」는 뜻이라, 안 풀면 새 폰으로 못 들어온다
         (43-B 보고문 ①에서 그 구멍을 보고드렸던 자리다). */
      try { await A.db.collection('driverDevices').doc(org + '_hlp_' + staffId).delete(); } catch (e) {}
      return res.status(200).json({ ok: true });
    }

    if (action === 'removeStaffPin') {
      const org = String(b.org || '').trim();
      const staffId = String(b.staffId || '').trim();
      if (!org || !staffId) return fail(res, 400, '기관·직원 정보가 빠졌어요.');
      if (!(await canManage(org))) return fail(res, 403, '이 업체의 직원 PIN 을 지울 권한이 없어요.');
      if (!(await orgAlive(org))) return fail(res, 403, EXPIRED_MSG, 'expired');
      try { await A.db.collection('staffPins').doc(org + '_' + staffId).delete(); } catch (e) {}
      /* ★★ v294(60-B2): **배정 문서를 지운다**(v293 까지는 `carId` 만 비웠다).
         왜 바꿨나 — v294 부터 그 문서가 **PIN 있는 직원 모두**에게 생긴다(로그인 때).
         `carId` 만 비우면 **그만둔 직원 문서가 남아** 규칙 `isActiveDriver` 가 계속 참이고,
         이미 받아 둔 토큰이 살아 있는 동안(최대 1시간) `data/orgDriver` 를 읽을 수 있다.
         문서를 지우면 그 자리에서 **아무것도 못 읽는다**(`exists` 가 거짓).
         ★ 잃는 것은 없다 — 배정(`carId`)은 어차피 비우던 값이고, 다시 PIN 을 주면
           로그인 때 문서가 **새로 만들어진다**(배정은 관리자가 `setCarHelper` 로 다시 정한다).
         ★ 「직원 삭제」(앱 `deleteStaff`)도 PIN 이 있으면 이 창구를 부르므로 같이 정리된다. */
      try {
        await A.db.collection('orgs').doc(org).collection('drivers').doc(helperUidOf(org, staffId)).delete();
      } catch (e) {}
      try { await A.auth.revokeRefreshTokens(helperUidOf(org, staffId)); } catch (e) {}
      /* ★ 43-C: 묶인 기기도 푼다 — PIN 이 없으면 그 기기로 들어올 일도 없다(흔적을 남기지 않는다) */
      try { await A.db.collection('driverDevices').doc(org + '_hlp_' + staffId).delete(); } catch (e) {}
      return res.status(200).json({ ok: true });
    }

    /* 옛 평문 PIN 을 해시로 옮기기 — 기사 `migrateDriverData` 와 **같은 방식 · 멱등**.
       앱은 이 응답(`moved`)이 **정말 성공했을 때만** `data/staff[].pin` 을 비운다(v275 보정1 교훈). */
    if (action === 'migrateStaffPins') {
      const org = String(b.org || '').trim();
      const list = Array.isArray(b.staff) ? b.staff : [];
      if (!org) return fail(res, 400, '기관 정보가 빠졌어요.');
      if (!(await canManage(org))) return fail(res, 403, '권한이 없어요.');
      if (!(await orgAlive(org))) return fail(res, 403, EXPIRED_MSG, 'expired');
      const secret = secretOf();
      if (!secret) return fail(res, 500, '서버 인증 설정이 아직 안 됐어요.');
      let moved = 0, dup = 0, bad = 0;
      const seen = {};
      /* 기사 PIN 과 겹치는 옛 자료는 **옮기지 않는다**(겹친 채로 두면 PIN 판이 누구인지 못 가린다) */
      let drvHashes = {};
      try {
        const ds = await A.db.collection('driverPins').where('org', '==', org).get();
        ds.forEach(d => { const v = d.data() || {}; if (v.pinHash) drvHashes[v.pinHash] = 1; });
      } catch (e) { return fail(res, 500, '확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); }
      for (const s of list) {
        const staffId = String((s && s.staffId) || '').trim();
        const pin = String((s && s.pin) || '').replace(/[^0-9]/g, '');
        if (!staffId || !/^\d{4}$/.test(pin)) { bad++; continue; }
        const want = pinHashOf(pin, org, secret);
        if (drvHashes[want] || seen[want]) { dup++; continue; }
        seen[want] = staffId;
        try {
          await A.db.collection('staffPins').doc(org + '_' + staffId)
            .set({ org: org, staffId: staffId, pinHash: want, updatedAt: Date.now() });
          moved++;
        } catch (e) { bad++; }
      }
      return res.status(200).json({ ok: true, moved: moved, dup: dup, bad: bad });
    }

    /* ── 동승 도우미 배정 (v280 · 43-A) ───────────────────────────────────
       화면(차량관리)의 `cars[].helperStaffId` 는 **보여 주는 값**이고,
       **권한의 근거는 이 서버 문서**다 — 규칙이 믿는 자리는 `orgs/{org}/drivers/{uid}` 하나다
       (기사와 **같은 컬렉션·같은 모양**이라 규칙 `myCarId`·`carData`·`carState` 가 한 줄도 안 바뀐다).
       ★ 로그인은 **아직 열지 않았다**(43-B) — 이 uid 로는 아무도 토큰을 못 받는다. */
    if (action === 'setCarHelper') {
      const org = String(b.org || '').trim();
      const carId = String(b.carId || '').trim();
      const staffId = String(b.staffId || '').trim();     /* 빈 값 = 없음(떼기) */
      if (!org || !carId) return fail(res, 400, '기관·차량 정보가 빠졌어요.');
      if (!(await canManage(org))) return fail(res, 403, '이 업체의 동승 도우미를 정할 권한이 없어요.');
      if (!(await orgAlive(org))) return fail(res, 403, EXPIRED_MSG, 'expired');
      const owner = await resolveOwnerUid(org);
      if (owner.error || !owner.uid) return fail(res, 500, owner.error || '업체 소유자를 확인하지 못했어요.');
      const col = A.db.collection('orgs').doc(org).collection('drivers');
      try {
        /* ① 이 차량에 이미 있던 도우미는 뗀다 (한 차량에 한 명) */
        /* ★ 문서 **id** 로 다시 집어서 쓴다 — 쿼리 결과의 `.ref` 를 쓰지 않는다
           (SDK 판·스텁에 따라 `.ref` 가 없을 수 있다. id 는 어디서나 있다). */
        const snap = await col.where('role', '==', 'helper').get();
        const prev = [];
        snap.forEach(d => {
          const v = d.data() || {};
          if (String(v.carId || '') === carId && String(v.staffId || '') !== staffId) prev.push(d.id);
        });
        for (const id of prev) {
          await col.doc(id).set({ carId: '', updatedAt: Date.now() }, { merge: true });
        }
        if (!staffId) return res.status(200).json({ ok: true, helper: '' });
        /* ② PIN 이 있어야 동승 로그인을 할 수 있다 — 없으면 애초에 고르지 못하게 한다 */
        const ps = await A.db.collection('staffPins').doc(org + '_' + staffId).get();
        if (!ps.exists) {
          return fail(res, 400, '그 직원은 PIN 이 없어요. 먼저 「🔢 PIN 정하기」로 PIN 을 정해 주세요.', 'nopin');
        }
        /* ③ 한 직원은 한 차량만 — 쓰면서 자연히 옮겨진다(옛 차량 칸이 덮인다) */
        await col.doc(helperUidOf(org, staffId)).set(
          { role: 'helper', staffId: staffId, carId: carId,
            ownerUid: owner.uid, updatedAt: Date.now() }, { merge: true });
      } catch (e) { return fail(res, 500, '동승 도우미를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); }
      return res.status(200).json({ ok: true, helper: staffId });
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

    /* ── e) 마스터 — 이용 기간 (승인·연장·기간 정하기·승인 취소) (v263) ────
       왜 서버인가 — 이 네 동작이 쓰는 값(approved·paidUntil·trialEnd·contractMonths)은
       **돈이 걸린 값**이다. v262 까지는 마스터 **브라우저**가 users 문서에 직접 썼고,
       규칙도 그 쓰기를 열어 두고 있었다(마스터 분기). 마스터 계정이 한 번 털리면
       그 자리에서 paidUntil 을 10년 뒤로 적을 수 있었다.
       v263: 규칙의 마스터 쓰기를 testAccess 하나로 좁히고, 기간은 여기(Admin SDK)서만 쓴다.
       · 날짜 셈은 lib/period.js 한 벌 — 세 동작이 같은 셈을 한다.
       · **바뀐 칸만 update** 한다(통째 쓰기 금지) — 다른 칸을 덮어쓰지 않는다.
       · 금액은 숫자만 기록에 남긴다. 코드에는 가격이 없다(요금 미정). */
    /* ── e-0) 이 사업자가 첫 결제 할인을 이미 받았나 (v264) ─────────────────
       승인 창을 열 때 묻는다. **사업자번호 원문은 응답에 넣지 않는다**
       (해시만 서버가 쓰고, 화면에는 「받을 수 있음 / 이미 받음(날짜)」만 보낸다). */
    if (action === 'bizPromoStatus') {
      if (!isMaster) return fail(res, 403, '마스터만 쓸 수 있어요.');
      const targetUid = String(b.uid || b.targetUid || '').trim();
      if (!targetUid) return fail(res, 400, '대상 계정이 빠졌어요.');
      const usnap = await A.db.collection('users').doc(targetUid).get();
      if (!usnap.exists) return fail(res, 404, '그 계정을 찾을 수 없어요.');
      const u = usnap.data() || {};
      const bizNo = String(u.bizNo || '').replace(/[^0-9]/g, '');
      if (!bizNo) {
        return res.status(200).json({ ok: true, hasBizNo: false, used: false, usedAt: null, usedStr: null });
      }
      let used = false, usedAt = null;
      try {
        const s = await A.db.collection('bizFirstPay').doc(sha256(bizNo)).get();
        if (s.exists) { used = true; usedAt = Number((s.data() || {}).at || 0) || null; }
      } catch (e) { used = false; }
      return res.status(200).json({
        ok: true, hasBizNo: true, used: used, usedAt: usedAt,
        usedStr: usedAt ? dateStr(usedAt) : null
      });
    }

    if (action === 'approveOrg' || action === 'extendOrg'
        || action === 'setPeriod' || action === 'unapproveOrg') {
      if (!isMaster) return fail(res, 403, '마스터만 쓸 수 있어요.');
      const targetUid = String(b.uid || b.targetUid || '').trim();
      if (!targetUid) return fail(res, 400, '대상 계정이 빠졌어요.');

      const uref = A.db.collection('users').doc(targetUid);
      const usnap = await uref.get();
      if (!usnap.exists) return fail(res, 404, '그 계정을 찾을 수 없어요.');
      const u = usnap.data() || {};
      if (u.role === 'driver') return fail(res, 400, '기사 계정에는 이용 기간이 없어요.');

      const now = Date.now();
      const memo = String(b.memo || '').slice(0, 200);
      const amount = Number(b.amount || 0);
      if (!(amount >= 0) || amount > 100000000) return fail(res, 400, '받은 금액을 숫자로 넣어 주세요.');

      /* ── 상품 (v264) ───────────────────────────────────────────────────
         화면이 보낸 `plan` 은 **이름일 뿐**이다. 개월수는 서버가 PLANS 에서 꺼내 쓴다
         — 화면 값을 그대로 믿으면 'promo6m' 이라 적고 120개월을 열 수 있다.
         'custom'(직접 입력)일 때만 마스터가 보낸 개월수를 받는다. */
      const PLAN_OK = ['promo6m', 'promo12m', 'monthly', 'yearly', 'custom'];
      const plan = String(b.plan || 'custom');
      if (!PLAN_OK.includes(plan)) return fail(res, 400, '상품을 다시 골라 주세요.');
      const planDef = PLANS[plan] || null;          // custom 이면 null

      let patch = {};
      let promoRef = null;                           // 첫 결제 할인을 「찍어 둔」 자리
      let log = { type: '', at: now, by: callerUid, memo: memo, amount: amount, buyPlan: plan };

      if (action === 'approveOrg') {
        const trialDays = (b.trialDays === undefined || b.trialDays === null || b.trialDays === '')
          ? 30 : Number(b.trialDays);
        const months = planDef ? planDef.months : Number(b.months);
        if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) {
          return fail(res, 400, '체험 일수는 0~365 사이 숫자로 넣어 주세요.');
        }
        if (!Number.isInteger(months) || months < 1 || months > 120) {
          return fail(res, 400, '계약 개월수는 1~120 사이 숫자로 넣어 주세요.');
        }

        /* 첫 결제 할인은 **사업자등록번호당 1회**다 (계정당이 아니다).
           같은 사업자가 새 번호로 다시 가입해도 할인이 또 나가면 안 되므로
           사업자번호 해시 한 칸을 **트랜잭션으로 찍는다** — 동시에 두 번 눌러도 하나만 든다. */
        if (planDef && planDef.promo) {
          const bizNo = String(u.bizNo || '').replace(/[^0-9]/g, '');
          if (!bizNo) {
            return fail(res, 400, '사업자 정보가 없는 계정이라 첫 결제 할인을 쓸 수 없어요. 「직접 입력」으로 승인해 주세요.');
          }
          promoRef = A.db.collection('bizFirstPay').doc(sha256(bizNo));
          try {
            await A.db.runTransaction(async (tx) => {
              const s = await tx.get(promoRef);
              if (s.exists) {
                const err = new Error('PROMO_USED');
                err.usedAt = Number((s.data() || {}).at || 0);
                throw err;
              }
              tx.set(promoRef, { at: now, uid: targetUid, plan: plan, amount: amount, months: months });
            });
          } catch (e) {
            if (String(e && e.message) === 'PROMO_USED') {
              const when = e.usedAt ? (' (' + dateStr(e.usedAt) + ')') : '';
              return fail(res, 400, '이 사업자는 첫 결제 할인을 이미 받았어요' + when + '.');
            }
            promoRef = null;
            console.log('[admin-account] 첫 결제 확인 실패');
            return fail(res, 500, '첫 결제 할인을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
          }
        }

        const p = approvePeriod(now, trialDays, months);
        patch = {
          approved: true, status: 'active', plan: trialDays > 0 ? 'trial' : 'paid',
          paidAt: now, trialEnd: p.trialEnd, paidUntil: p.paidUntil, contractMonths: months
        };
        log = Object.assign(log, { type: 'approve', months: months, trialDays: trialDays,
                                   trialEnd: p.trialEnd, paidUntil: p.paidUntil });

      } else if (action === 'extendOrg') {
        /* 할인은 **첫 결제에만** — 연장에는 쓸 수 없다(정가 월간·연간·직접 입력) */
        if (planDef && planDef.promo) {
          return fail(res, 400, '첫 결제 할인은 연장에 쓸 수 없어요. 월간·연간·직접 입력 중에서 골라 주세요.');
        }
        const months = planDef ? planDef.months : Number(b.months);
        if (!Number.isInteger(months) || months < 1 || months > 120) {
          return fail(res, 400, '연장할 개월수를 1~120 사이 숫자로 넣어 주세요.');
        }
        const next = extendPeriod(now, u.paidUntil, months);
        patch = { paidUntil: next, plan: 'paid',
                  contractMonths: Number(u.contractMonths || 0) + months };
        log = Object.assign(log, { type: 'extend', months: months, paidUntil: next });

      } else if (action === 'setPeriod') {
        const until = dateStrEnd(b.paidUntil);
        if (until === null) return fail(res, 400, '이용 끝 날짜를 YYYY-MM-DD 로 넣어 주세요.');
        /* 「기간 정하기」는 **바로잡기용**이다 — 승인되지 않은 계정에는 쓰지 않는다
           (승인은 approveOrg 가 한다. 여기서 approved 를 켜면 기록이 어긋난다). */
        if (u.approved !== true) return fail(res, 400, '먼저 승인해 주세요. 그 뒤에 기간을 정할 수 있어요.');
        patch = { paidUntil: until, plan: until > now ? 'paid' : 'expired' };
        log = Object.assign(log, { type: 'set', paidUntil: until });

      } else {   /* unapproveOrg — 기간 값은 남긴다(다시 승인할 때 기록이 이어지게) */
        patch = { approved: false, status: 'pending' };
        log = Object.assign(log, { type: 'unapprove' });
      }

      try {
        await uref.update(patch);                      // ★ 바뀐 칸만
      } catch (e) {
        /* 할인을 찍어 두고 기간 쓰기가 깨지면 그 사업자는 할인을 **쓰지도 못하고 잃는다.**
           그래서 찍어 둔 자리를 다시 비운다(다음에 제대로 승인할 수 있게). */
        if (promoRef) { try { await promoRef.delete(); } catch (e2) {} }
        console.log('[admin-account] 기간 쓰기 실패', action);
        return fail(res, 500, '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      }
      /* 기록은 서버 전용 컬렉션에 (규칙: read 마스터 · write false).
         기록을 못 남겨도 기간 자체는 이미 바뀌었으므로 성공으로 답한다. */
      try {
        await A.db.collection('billingLog').doc(targetUid).collection('items').add(log);
      } catch (e) { console.log('[admin-account] 기록 남기기 실패', action); }

      /* 응답에는 **그 업체의 기간만** 담는다 (다른 사람 정보 없음) */
      return res.status(200).json({
        ok: true,
        approved: patch.approved === undefined ? (u.approved === true) : patch.approved,
        trialEnd: patch.trialEnd === undefined ? (u.trialEnd || null) : patch.trialEnd,
        paidUntil: patch.paidUntil === undefined ? (u.paidUntil || null) : patch.paidUntil,
        trialEndStr: patch.trialEnd ? dateStr(patch.trialEnd) : (u.trialEnd ? dateStr(u.trialEnd) : null),
        paidUntilStr: patch.paidUntil ? dateStr(patch.paidUntil) : (u.paidUntil ? dateStr(u.paidUntil) : null)
      });
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
