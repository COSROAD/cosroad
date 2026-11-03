// COSROAD — 문자·알림톡 문지기 한 벌 (v266)
// 쓰는 곳: api/send-sms.js · api/send-alimtalk.js
//
// 왜 — v265 까지 두 서버는 **Origin 헤더 한 줄만** 보고 받는 번호·본문을 그대로 보냈다.
//   Origin 은 브라우저 밖에서 마음대로 적을 수 있어, 사실상 누구나 사장님 알리고 계정으로
//   아무 번호에 문자를 보낼 수 있었다(0단계 조사에서 배포 서버로 확인).
//   이 파일은 그 문을 닫는다 — **받는 번호와 「보내도 되는가」를 화면이 아니라 서버가 정한다.**
//   (모범: api/rc-notify.js 머리글 · lib/otp-core.js 빈도 제한)
//
// ★ api/ 밖에 둔 이유 — Vercel 공식 문서(/docs/functions/runtimes/node-js):
//   "Keep shared utilities and route modules outside `api/` and import them from your function entry point."
//   (lib/otp-core.js · lib/period.js · lib/price.js 와 같은 자리·같은 이유)
//
// ★ 새 환경변수 없음 — FIREBASE_SERVICE_ACCOUNT · ALIGO_* 는 이미 있다.
// ★ 번호·본문·키 원문은 **응답에도 로그에도** 넣지 않는다.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'crypto';

/* ── 허용 출처 (v266) ─────────────────────────────────────────────────────
   roadjob.co.kr·www.roadjob.co.kr·roadcrew.kr 을 **뺐다**.
   0단계 조사에서 배포된 roadjob.co.kr 을 받아 확인한 결과, 로드잡은
   자기 서버(roadjob.vercel.app)만 부르고 cosroad.vercel.app 은 한 곳도 안 부른다.
   ※ 이것은 문지기가 아니라 **브라우저용 CORS 설정**이다 — 진짜 문지기는 아래 토큰 확인이다. */
export const ALLOWED = ['https://cosroad.com', 'https://www.cosroad.com', 'https://cosroad.vercel.app'];

/* 문의 알림을 받을 번호 — 마스터가 billing.notifyPhone 에 넣는다. 비면 이 번호.
   api/signup.js 의 MASTER_PHONE_FALLBACK 과 **같은 값**이다. */
export const MASTER_PHONE_FALLBACK = '010-3660-3911';

/* ── 상한 (전부 여기 한 곳) ───────────────────────────────────────────── */
export const ORG_PER_MIN  = 60;     // 업체별 1분에 보낼 수 있는 **받는 사람 수**
export const ORG_PER_DAY  = 500;    // 업체별 하루 받는 사람 수
export const REQ_MAX_RCV  = 50;     // 한 요청에 받는 사람 수 (알리고 쪽 제한과 같다)
export const INQ_IP_MIN   = 1;      // 문의: 같은 IP 1분 1회
export const INQ_IP_DAY   = 5;      // 문의: 같은 IP 하루 5회
export const INQ_UID_DAY  = 10;     // 문의: 로그인 계정 하루 10회
export const INQ_BODY_MAX = 500;    // 문의 본문 길이
export const INQ_PREFIX   = '[코스로드 문의] ';   // 앞머리 고정 — 본문을 통째로 남이 정하지 못하게

/* 알림톡 — **서버가 아는 템플릿만** (지금 앱이 쓰는 코드 전수).
   index.html BIZ_TEMPLATE_CODES(출석) · BIZ_DROPOFF_TEMPLATE_CODES(하차) 와 같은 목록 —
   ★ 템플릿을 늘리면 **두 곳을 같이** 고쳐야 한다. */
export const TPL_ALLOWED = ['UI_7310', 'UI_7550', 'UI_7542', 'UI_7257', 'UJ_4933', 'UJ_4932'];

/* 서버 전용 컬렉션 — 규칙은 read, write: if false (Admin SDK 만 쓴다) */
export const RL_COL = 'sendRl';

export const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');
export const fail = (res, code, message) => res.status(code).json({ ok: false, result_code: -1, message });

/* 서비스 계정 — 함수가 깨어 있는 동안 한 번만 (admin-account.js 와 같은 꼴) */
export function admin() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('NO_SERVICE_ACCOUNT');
    let sa;
    try { sa = JSON.parse(raw); } catch (e) { throw new Error('BAD_SERVICE_ACCOUNT'); }
    initializeApp({ credential: cert(sa) });
  }
  return { auth: getAuth(), db: getFirestore() };
}

/* 번호에서 숫자만 (+82 → 0) — index.html·admin-account.js 와 같은 규칙 */
export function phoneDigits(raw) {
  let t = String(raw || '').replace(/[^0-9]/g, '');
  if (t.indexOf('82') === 0 && t.length >= 11) t = '0' + t.slice(2);
  return t;
}

/* 요청자 IP — lib/otp-core.js clientIp() 와 같은 순서
   (Vercel 공식 문서: x-forwarded-for 는 플랫폼이 덮어써 위조를 막는다) */
export function clientIp(req) {
  const h = (req && req.headers) || {};
  const pick = (v) => String(v || '').split(',')[0].trim();
  return pick(h['x-vercel-forwarded-for']) || pick(h['x-forwarded-for'])
      || pick(h['x-real-ip']) || ((req.socket && req.socket.remoteAddress) || '');
}

/* ── ① 누가 부르나 ────────────────────────────────────────────────────────
   Authorization: Bearer <ID 토큰> 을 확인한다. 익명 로그인은 거부.
   반환: { uid, driver, org, carId } · 못 읽으면 null */
export async function whoIsCalling(A, req) {
  const authz = String((req.headers && req.headers.authorization) || '');
  const idToken = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
  if (!idToken) return null;
  let t;
  try { t = await A.auth.verifyIdToken(idToken); } catch (e) { return null; }
  if (t.firebase && t.firebase.sign_in_provider === 'anonymous') return null;
  return {
    uid: t.uid,
    driver: t.driver === true,                    // 기사 custom token claim (driver-auth.js)
    org: String(t.org || ''),
    carId: String(t.carId || '')
  };
}

/* 살아 있는 업체인가 — v263 한 줄 그대로:
     approved == true && withdrawn != true && paidUntil > 지금
   규칙 isMyOrgActive·ownerAlive 와 **같은 뜻**이다. 한 곳만 고치지 말 것. */
function aliveDoc(u, now) {
  if (!u) return false;
  return u.approved === true && u.withdrawn !== true && Number(u.paidUntil || 0) > now;
}

/* ── ② 이 사람이 이 업체로 보낼 수 있나 ─────────────────────────────────
   반환: { ok:true, org } 또는 { ok:false, code, message } */
export async function canSendFor(A, caller, org) {
  const now = Date.now();
  org = String(org || '');
  if (!org) return { ok: false, code: 400, message: '업체 정보가 빠졌어요.' };

  /* 둘러보기는 **서버도** 거부한다 — 샘플 자료로 진짜 문자를 보내면 안 된다 */
  if (/_demo$/.test(org)) {
    return { ok: false, code: 403, message: '둘러보기에서는 문자를 보낼 수 없어요.' };
  }

  if (caller.driver) {
    /* 기사 — 토큰의 org 만 믿는다(본문 값 불신, driver-auth.js checkin 과 같은 태도) */
    if (caller.org !== org) return { ok: false, code: 403, message: '내 업체가 아니에요.' };
    /* 소유자가 살아 있을 때만 (규칙 ownerAlive 와 같은 뜻) */
    let dsnap;
    try { dsnap = await A.db.collection('users').doc(caller.uid).get(); } catch (e) { dsnap = null; }
    const ownerUid = String(((dsnap && dsnap.exists && dsnap.data()) || {}).ownerUid || '');
    if (!ownerUid) return { ok: false, code: 403, message: '보낼 수 없는 계정이에요.' };
    let osnap;
    try { osnap = await A.db.collection('users').doc(ownerUid).get(); } catch (e) { osnap = null; }
    if (!osnap || !osnap.exists) {
      /* 마스터가 만든 _test 기사는 소유자가 admins 에 있다 (규칙 ownerAlive 와 같은 예외) */
      let asnap;
      try { asnap = await A.db.collection('admins').doc(ownerUid).get(); } catch (e) { asnap = null; }
      if (asnap && asnap.exists) return { ok: true, org: org };
      return { ok: false, code: 403, message: '보낼 수 없는 계정이에요.' };
    }
    if (!aliveDoc(osnap.data(), now)) {
      return { ok: false, code: 403, message: '이용 기간이 끝났거나 승인 전이라 문자를 보낼 수 없어요.' };
    }
    return { ok: true, org: org };
  }

  /* 관리자 — users/{uid} 가 살아 있고, 그 사람의 orgId 와 같아야 한다 */
  let snap;
  try { snap = await A.db.collection('users').doc(caller.uid).get(); } catch (e) { snap = null; }
  const u = (snap && snap.exists && snap.data()) || null;

  /* _test 는 기존 출입 판정 그대로 — 마스터 또는 「🧪 테스트 출입」 허용 계정 */
  if (/_test$/.test(org)) {
    let isMaster = false;
    try { isMaster = (await A.db.collection('admins').doc(caller.uid).get()).exists; } catch (e) {}
    const testOk = !!(u && u.testAccess === true && u.approved === true && u.withdrawn !== true);
    if (isMaster || testOk) return { ok: true, org: org };
    return { ok: false, code: 403, message: '이 공간에는 보낼 수 없어요.' };
  }

  if (!u) return { ok: false, code: 403, message: '보낼 수 없는 계정이에요.' };
  if (String(u.orgId || '') !== org) return { ok: false, code: 403, message: '내 업체가 아니에요.' };
  if (!aliveDoc(u, now)) {
    return { ok: false, code: 403, message: '이용 기간이 끝났거나 승인 전이라 문자를 보낼 수 없어요.' };
  }
  return { ok: true, org: org };
}

/* ── ③ 그 업체 회원 명부의 번호만 ───────────────────────────────────────
   orgs/{org}/data/members 는 { value: '<JSON 글자열>' } 꼴이다(앱 saveToFirebase).
   기사면 **자기 차량 회원**만 센다(토큰의 carId). */
export async function orgPhones(A, org, carId) {
  let snap;
  try { snap = await A.db.collection('orgs').doc(org).collection('data').doc('members').get(); }
  catch (e) { return null; }
  if (!snap.exists) return new Set();
  let list;
  try { list = JSON.parse(String((snap.data() || {}).value || '[]')); } catch (e) { return null; }
  if (!Array.isArray(list)) return new Set();
  const out = new Set();
  list.forEach((m) => {
    if (!m) return;
    if (carId && String(m.carId || '') !== String(carId)) return;   // 기사: 자기 차량만
    [m.phone, m.phone2].forEach((p) => { const d = phoneDigits(p); if (d) out.add(d); });
  });
  return out;
}

/* ── ④ 빈도 제한 ────────────────────────────────────────────────────────
   한 트랜잭션에서 읽고 쓴다(otp-core 와 같은 방식). `n` 은 이번에 보낼 받는 사람 수.
   창(window)마다 { t: 시각, n: 사람 수 } 를 쌓고 합으로 센다.
   ★ **배열 안에 배열을 넣지 않는다** — Firestore 가 「Nested arrays are not supported」로
     거절한다(에뮬레이터에서 실제로 걸렸다). 그래서 [시각, 수] 가 아니라 {t,n} 으로 둔다.
   반환: null 통과 / 문구 막힘 */
export async function rateHit(A, id, limits, n) {
  const now = Date.now();
  const ref = A.db.collection(RL_COL).doc(id);
  const keep = Math.max.apply(null, limits.map((l) => l[0]));
  try {
    return await A.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const at = (((s.exists && s.data()) || {}).at || [])
        .filter((e) => e && now - (e.t || 0) < keep);
      for (const [win, max, msg] of limits) {
        const sum = at.filter((e) => now - e.t < win).reduce((a, e) => a + (e.n || 0), 0);
        if (sum + n > max) return msg;
      }
      at.push({ t: now, n: n });
      tx.set(ref, { at: at.slice(-200), updatedAt: now });
      return null;
    });
  } catch (e) {
    console.log('[send-guard] 빈도 기록 실패');
    return '잠시 뒤 다시 시도해 주세요.';
  }
}

/* 업체별 상한 — 1분 · 하루 */
export function orgLimits() {
  return [
    [60 * 1000, ORG_PER_MIN, '문자를 너무 빨리 보내고 있어요. 1분 뒤에 다시 시도해 주세요.'],
    [24 * 3600 * 1000, ORG_PER_DAY, '오늘 보낼 수 있는 문자 수(' + ORG_PER_DAY + '건)를 다 썼어요. 내일 다시 보내시거나 cosroad@cosroad.com 으로 알려 주세요.']
  ];
}
/* 문의 — IP 별 */
export function inqIpLimits() {
  return [
    [60 * 1000, INQ_IP_MIN, '방금 보내셨어요. 1분 뒤에 다시 보내 주세요.'],
    [24 * 3600 * 1000, INQ_IP_DAY, '오늘은 문의를 더 보낼 수 없어요. 📧 cosroad@cosroad.com 으로 보내 주세요.']
  ];
}
/* 문의 — 로그인 계정별 */
export function inqUidLimits() {
  return [[24 * 3600 * 1000, INQ_UID_DAY, '오늘은 문의를 더 보낼 수 없어요. 📧 cosroad@cosroad.com 으로 보내 주세요.']];
}

/* 문의 알림을 받을 번호 — 마스터 설정값, 없으면 기본 번호 */
export async function notifyPhone(A) {
  try {
    const s = await A.db.collection('orgs').doc('_master').collection('data').doc('billing').get();
    const p = phoneDigits(((s.exists && s.data()) || {}).notifyPhone);
    if (p) return p;
  } catch (e) {}
  return phoneDigits(MASTER_PHONE_FALLBACK);
}

/* 공통 머리 — CORS·메서드·출처. 통과하면 null, 막히면 이미 응답을 보낸 뒤 true */
export function openGate(req, res) {
  const origin = (req.headers && req.headers.origin) || '';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED.includes(origin) ? origin : ALLOWED[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  if (req.method !== 'POST') { fail(res, 405, 'POST만 허용됩니다.'); return true; }
  if (!ALLOWED.includes(origin)) { fail(res, 403, '허용되지 않은 출처입니다.'); return true; }
  return false;
}
