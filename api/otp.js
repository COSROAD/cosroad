// COSROAD — 알리고 문자 인증번호(OTP) 공통 기반 (v252)
// Vercel: api/otp.js
//
// 왜 서버인가 — 인증번호를 **화면에서 만들면 인증이 아니다.**
//   브라우저가 코드를 만들어 문자로 보내고 자기가 맞춰 보는 구조는, 코드가 이미
//   화면 안에 있으므로 누구나 통과한다. 그래서 만들기·보관·맞추기를 **전부 서버**가 한다.
//   화면이 보내는 것은 「번호」와 사람이 문자로 받아 입력한 「6자리」뿐이다.
//
// 막는 것 네 가지
//   ① 문자 폭탄(요금) — 번호별 1분1회·10분3회·하루10회 / IP별 1시간 20회 (Firestore 기록)
//   ② 코드 대입      — 6자리 · 5분 · 5회 틀리면 그 인증번호를 버린다
//   ③ 남의 번호로 비번 바꾸기 — 그 번호로 받은 문자의 코드를 맞춰야만 바꾼다
//   ④ 가입자 존재 캐내기 — 없는 번호·기사·탈퇴 계정도 **성공과 똑같이** 응답한다(문자만 안 간다)
//
// ★ 키는 Vercel 환경변수에만 (절대규칙 1)
//   FIREBASE_SERVICE_ACCOUNT · ALIGO_KEY · ALIGO_USER_ID · ALIGO_SENDER · OTP_SECRET
//   코드 원문은 **어디에도 저장하지 않는다**(해시만). 로그에도 번호·코드를 적지 않는다.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash, randomInt, timingSafeEqual } from 'crypto';

const ALLOWED = ['https://roadjob.co.kr', 'https://www.roadjob.co.kr', 'https://cosroad.com', 'https://www.cosroad.com', 'https://roadcrew.kr', 'https://cosroad.vercel.app'];

/* 쓰임새 목록 — 목록으로 관리한다. 'signup'(가입 인증)은 다음 회차에 여기 한 줄만 더한다. */
const PURPOSES = ['reset', 'changeNew'];

const CODE_TTL_MS = 5 * 60 * 1000;   // 5분
const MAX_TRIES   = 5;               // 5회 틀리면 그 인증번호를 버린다

/* 번호별 **보내기** 빈도 제한 — [창(ms), 허용 횟수] */
const PHONE_LIMITS = [[60 * 1000, 1], [10 * 60 * 1000, 3], [24 * 3600 * 1000, 10]];
/* IP별 **보내기** 빈도 제한 */
const IP_LIMIT = [3600 * 1000, 20];
/* ── v253: **확인(맞추기)** 쪽 빈도 제한 ──────────────────────────────────
   보내기만 막아도 구멍이 남는다 — 남의 번호로 재설정 문자를 **한 번** 보내게 한 뒤,
   5분 안에 6자리를 대량으로 **동시에** 대입하면 「5회 틀리면 폐기」가
   따로따로 읽고 쓰는 구조에서는 무력해졌다(아래 checkCode 트랜잭션과 함께 막는다).
   그래서 확인 횟수 자체에도 제한을 건다. */
const VERIFY_PHONE_LIMIT = [10 * 60 * 1000, 10];
const VERIFY_IP_LIMIT    = [10 * 60 * 1000, 30];

/* 서비스 계정 — 함수가 깨어 있는 동안 한 번만 초기화한다 (admin-account.js 와 같은 모양) */
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

/* 마스터 호출분 빈도 제한 — 같은 호출자 1분 10회 (admin-account.js 와 같다) */
const hits = new Map();
function tooMany(uid) {
  const now = Date.now();
  const arr = (hits.get(uid) || []).filter(t => now - t < 60000);
  arr.push(now);
  hits.set(uid, arr);
  if (hits.size > 500) { for (const k of hits.keys()) { if (!hits.get(k).length) hits.delete(k); } }
  return arr.length > 10;
}

/* 앱(index.html phoneDigits·phoneLoginId)과 **같은 규칙**. 어긋나면 로그인이 안 된다. */
function phoneDigits(raw) {
  let t = String(raw || '').replace(/[^0-9]/g, '');
  if (t.indexOf('82') === 0 && t.length >= 11) t = '0' + t.slice(2);
  return t;
}
function phoneLoginId(raw) {
  const d = phoneDigits(raw);
  return d ? (d + '@phone.cosroad.com') : '';
}

const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');

/* 인증번호 문서 id — 번호가 그대로 드러나지 않게 해시로 둔다.
   번호는 길이가 고정된 숫자(01…)이고 쓰임새는 영문이라, 이어 붙여도 다른 조합과
   겹칠 수 없다(예: '01012345678'+'reset'). */
const otpId = (digits, purpose) => sha256(digits + purpose);

/* 빈도 제한 기록도 **같은 otp 컬렉션** 안에 둔다 —
   규칙(firestore.rules)에 otp 한 줄만 더해 전부 잠그기 위해서다.
   인증번호 문서는 성공·초과 때 지워지므로, 제한 기록은 **따로** 남겨야 살아 있다. */
const rlPhoneId = (digits) => 'rl.p.' + sha256(digits);
const rlIpId     = (ip)     => 'rl.i.' + sha256(ip);
/* 확인(맞추기) 쪽 기록은 보내기 쪽과 **따로** 센다 (v253) */
const rlVerifyPhoneId = (digits) => 'rl.v.'  + sha256(digits);
const rlVerifyIpId    = (ip)     => 'rl.vi.' + sha256(ip);

/* 요청자 IP — Vercel 공식 문서 대조 (2026-10-30, /docs/headers/request-headers)
     · x-forwarded-for         "The public IP address of the client that made the request."
       그리고 "we currently overwrite the X-Forwarded-For header and do not forward
       external IPs. This restriction is in place to prevent IP spoofing."
       → Vercel 이 덮어쓰므로 **브라우저가 위조할 수 없다.**
     · x-vercel-forwarded-for  "identical to the x-forwarded-for header. However,
       x-forwarded-for could be overwritten if you're using a proxy on top of Vercel."
       → 위에 프록시가 끼어도 안 덮이는 쪽.
     · x-real-ip               "identical to the x-forwarded-for header."
   그래서 x-vercel-forwarded-for 를 먼저 보고, 없으면 나머지 순서로 내려간다.
   세 헤더 모두 쉼표 목록일 수 있어 **첫 값**을 쓴다. 보내기·확인이 같은 함수를 쓴다. */
function clientIp(req) {
  const pick = (v) => String(v || '').split(',')[0].trim();
  const h = (req && req.headers) || {};
  return pick(h['x-vercel-forwarded-for'])
      || pick(h['x-forwarded-for'])
      || pick(h['x-real-ip'])
      || String((req && req.socket && req.socket.remoteAddress) || 'unknown');
}

const fail = (res, code, message) => res.status(code).json({ ok: false, message });

/* 같은 길이의 해시 두 개를 시간차 없이 비교한다 */
function sameHash(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length || !x.length) return false;
  try { return timingSafeEqual(x, y); } catch (e) { return false; }
}

/* 알리고 /send/ 로 **이 서버에서 직접** 보낸다 (api/send-sms 경유 금지).
   공식 문서 대조: POST https://apis.aligo.in/send/ · x-www-form-urlencoded
   필수 key·user_id·sender·receiver·msg / 선택 msg_type · 성공 result_code=1
   본문은 42바이트(EUC-KR 기준)로 SMS 한도 90바이트 안이고, 이모지를 쓰지 않는다. */
async function sendOtpSms(digits, code) {
  const key    = process.env.ALIGO_KEY;
  const userid = process.env.ALIGO_USER_ID;
  const sender = process.env.ALIGO_SENDER;
  if (!key || !userid || !sender) return { ok: false, why: 'NO_ALIGO' };

  const form = new URLSearchParams();
  form.append('key', key);
  form.append('user_id', userid);
  form.append('sender', sender);
  form.append('receiver', digits);
  /* 무엇에 쓰는 코드인지 적지 않는다 — 문자를 본 사람이 용도를 알아도 득이 없다 */
  form.append('msg', '[코스로드] 인증번호 ' + code + ' (5분 안에 입력)');
  form.append('msg_type', 'SMS');

  let data;
  try {
    const r = await fetch('https://apis.aligo.in/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form.toString()
    });
    data = await r.json();
  } catch (e) {
    console.log('[otp] 알리고 호출 실패');           // 번호·코드는 적지 않는다
    return { ok: false, why: 'FETCH' };
  }
  if (Number(data && data.result_code) !== 1) {
    /* 남길 것은 result_code·message 뿐이다 (번호·코드 금지) */
    console.log('[otp] 알리고 거부', (data && data.result_code), (data && data.message));
    return { ok: false, why: 'ALIGO' };
  }
  return { ok: true };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED.includes(origin) ? origin : ALLOWED[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return fail(res, 405, 'POST만 허용됩니다.');
  if (!ALLOWED.includes(origin)) return fail(res, 403, '허용되지 않은 출처입니다.');

  const secret = process.env.OTP_SECRET;
  if (!secret) {
    /* 비밀값이 없으면 해시가 추측 가능해진다 — 조용히 약하게 돌아가지 않고 멈춘다 */
    return fail(res, 500, '서버 인증 설정이 아직 안 됐어요. 관리자에게 알려 주세요.');
  }

  let A;
  try { A = admin(); }
  catch (e) {
    const m = String(e && e.message);
    return fail(res, 500, m === 'NO_SERVICE_ACCOUNT'
      ? '서버에 관리자 키가 아직 등록되지 않았어요. 관리자에게 알려 주세요.'
      : '서버 관리자 키 형식이 올바르지 않아요. 관리자에게 알려 주세요.');
  }

  const b = req.body || {};
  const action = String(b.action || '');
  const otpCol = A.db.collection('otp');

  /* 호출한 곳의 IP (v253 — Vercel 공식 문서 대조 결과를 clientIp 에 모았다) */
  const ip = clientIp(req);

  /* 마스터인가 — Bearer ID 토큰으로 서버가 직접 확인한다.
     반환: { uid } | { error, code } */
  async function requireMaster() {
    const authz = String(req.headers.authorization || '');
    const idToken = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
    if (!idToken) return { error: '로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.', code: 401 };
    let caller;
    try { caller = await A.auth.verifyIdToken(idToken); }
    catch (e) { return { error: '로그인이 만료됐어요. 다시 로그인한 뒤 시도해 주세요.', code: 401 }; }
    if (caller.firebase && caller.firebase.sign_in_provider === 'anonymous') {
      return { error: '계정으로 로그인한 뒤에 쓸 수 있어요.', code: 403 };
    }
    if (tooMany(caller.uid)) return { error: '요청이 너무 잦아요. 1분 뒤에 다시 시도해 주세요.', code: 429 };
    let isMaster = false;
    try { isMaster = (await A.db.collection('admins').doc(caller.uid).get()).exists; }
    catch (e) { isMaster = false; }
    if (!isMaster) return { error: '마스터만 쓸 수 있어요.', code: 403 };
    return { uid: caller.uid };
  }

  /* 빈도 제한 — 한 번의 트랜잭션에서 읽고 쓴다(같은 순간에 여러 번 들어와도 새지 않는다).
     인스턴스가 바뀌어도 살아 있도록 Firestore 에 남긴다.
     반환: null = 통과 / 문구 = 막혔다 */
  async function rateLimited(digits) {
    const now = Date.now();
    const pRef = otpCol.doc(rlPhoneId(digits));
    const iRef = otpCol.doc(rlIpId(ip));
    const keep = Math.max(PHONE_LIMITS[PHONE_LIMITS.length - 1][0], IP_LIMIT[0]);
    try {
      return await A.db.runTransaction(async (tx) => {
        const [ps, is] = await tx.getAll(pRef, iRef);
        const pAt = (((ps.exists && ps.data()) || {}).at || []).filter(t => now - t < keep);
        const iAt = (((is.exists && is.data()) || {}).at || []).filter(t => now - t < keep);

        for (const [win, max] of PHONE_LIMITS) {
          if (pAt.filter(t => now - t < win).length >= max) {
            if (win <= 60 * 1000)        return '방금 보냈어요. 1분 뒤에 다시 받아 주세요.';
            if (win <= 10 * 60 * 1000)   return '인증번호를 너무 자주 받았어요. 10분 뒤에 다시 시도해 주세요.';
            return '오늘은 이 번호로 더 보낼 수 없어요. 내일 다시 시도하시거나 cosroad@cosroad.com 으로 알려 주세요.';
          }
        }
        if (iAt.filter(t => now - t < IP_LIMIT[0]).length >= IP_LIMIT[1]) {
          return '요청이 너무 잦아요. 한 시간 뒤에 다시 시도해 주세요.';
        }
        pAt.push(now); iAt.push(now);
        tx.set(pRef, { at: pAt.slice(-40), updatedAt: now });
        tx.set(iRef, { at: iAt.slice(-40), updatedAt: now });
        return null;
      });
    } catch (e) {
      console.log('[otp] 빈도 기록 실패');
      return '잠시 뒤 다시 시도해 주세요.';
    }
  }

  /* 확인(맞추기) 쪽 빈도 제한 (v253) — 보내기 쪽 rateLimited 와 같은 방식.
     ★ checkCode **전에** 센다. 아니면 대량 대입이 제한에 걸리기 전에 판정을 다 써 버린다.
     반환: null = 통과 / 문구 = 막혔다 */
  async function verifyRateLimited(digits) {
    const now = Date.now();
    const pRef = otpCol.doc(rlVerifyPhoneId(digits));
    const iRef = otpCol.doc(rlVerifyIpId(ip));
    const keep = Math.max(VERIFY_PHONE_LIMIT[0], VERIFY_IP_LIMIT[0]);
    try {
      return await A.db.runTransaction(async (tx) => {
        const [ps, is] = await tx.getAll(pRef, iRef);
        const pAt = (((ps.exists && ps.data()) || {}).at || []).filter(t => now - t < keep);
        const iAt = (((is.exists && is.data()) || {}).at || []).filter(t => now - t < keep);
        if (pAt.filter(t => now - t < VERIFY_PHONE_LIMIT[0]).length >= VERIFY_PHONE_LIMIT[1]
         || iAt.filter(t => now - t < VERIFY_IP_LIMIT[0]).length >= VERIFY_IP_LIMIT[1]) {
          return '잠시 뒤 다시 시도해 주세요.';
        }
        pAt.push(now); iAt.push(now);
        tx.set(pRef, { at: pAt.slice(-60), updatedAt: now });
        tx.set(iRef, { at: iAt.slice(-60), updatedAt: now });
        return null;
      });
    } catch (e) {
      console.log('[otp] 확인 빈도 기록 실패');
      return '잠시 뒤 다시 시도해 주세요.';
    }
  }

  /* 인증번호 맞추기 — 공통. 반환: { ok:true } | { error, code }
     ── v253: 전부 **한 트랜잭션** 안에서 한다 ──────────────────────────────
     전에는 읽기 → 비교 → update 를 따로따로 했다. 그래서 같은 인증번호에 틀린 코드가
     **동시에** 여러 건 들어오면 모두 tries=0 을 읽어 각자 1 로 올렸고,
     「5회 틀리면 폐기」가 무력해져 6자리를 대량 대입할 수 있었다.
     트랜잭션 안에서 읽고 쓰면 Firestore 가 충돌을 직렬화하므로
     한 인증번호당 판정은 최대 5번이고 그 뒤에는 문서가 사라진다.
     ※ 문구·응답 모양은 v252 와 똑같다. */
  async function checkCode(digits, purpose, code) {
    const ref = otpCol.doc(otpId(digits, purpose));
    const want = sha256(String(code) + secret);
    try {
      return await A.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const d = (snap.exists && snap.data()) || null;
        /* 없는 경우와 만료된 경우를 **같은 문구**로 답한다 — 번호 있고 없고를 알려 주지 않는다 */
        if (!d || !d.expiresAt || d.expiresAt < Date.now()) {
          return { error: '인증번호가 만료됐어요. 다시 받아 주세요.', code: 400 };
        }
        if (sameHash(d.codeHash, want)) {
          tx.delete(ref);                           // 한 번 쓰면 버린다(재사용 금지)
          return { ok: true };
        }
        const tries = Number(d.tries || 0) + 1;
        if (tries > MAX_TRIES) {
          tx.delete(ref);
          return { error: '인증번호를 너무 여러 번 틀렸어요. 다시 받아 주세요.', code: 400 };
        }
        tx.update(ref, { tries: tries });
        return { error: '인증번호가 맞지 않아요. (' + (MAX_TRIES + 1 - tries) + '번 더 넣을 수 있어요)', code: 400 };
      });
    } catch (e) {
      /* 충돌이 거듭돼 트랜잭션이 끝내 실패한 경우 — 판정하지 않고 멈춘다(열어 주지 않는다) */
      console.log('[otp] 인증번호 확인 실패');
      return { error: '잠시 뒤 다시 시도해 주세요.', code: 500 };
    }
  }

  try {
    /* ── a) 인증번호 보내기 ── */
    if (action === 'send') {
      const purpose = String(b.purpose || '');
      if (PURPOSES.indexOf(purpose) < 0) return fail(res, 400, '알 수 없는 요청이에요.');

      const digits = phoneDigits(b.phone);
      if (!/^01\d{8,9}$/.test(digits)) {
        return fail(res, 400, '휴대폰 번호를 정확히 넣어 주세요. (예: 010-1234-5678)');
      }

      /* 번호 바꾸기용 코드는 **마스터만** 받을 수 있다 */
      if (purpose === 'changeNew') {
        const m = await requireMaster();
        if (m.error) return fail(res, m.code, m.error);
        /* 이미 쓰는 번호로는 바꿀 수 없다 — 마스터에게는 사실대로 알린다
           (마스터는 가입자 목록을 이미 볼 수 있으므로 캐낼 것이 없다) */
        try {
          await A.auth.getUserByEmail(phoneLoginId(digits));
          return fail(res, 409, '이미 쓰는 번호예요. 다른 번호를 넣어 주세요.');
        } catch (e) {
          if (!e || e.code !== 'auth/user-not-found') {
            return fail(res, 500, '번호 확인에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
          }
        }
      }

      /* 빈도 제한을 **먼저** 센다 — 뒤에서 멈추더라도 문자 폭탄 횟수는 소모돼야 한다 */
      const blocked = await rateLimited(digits);
      if (blocked) return fail(res, 429, blocked);

      /* 비밀번호 재설정 — 쓸 수 있는 계정일 때만 실제로 보낸다.
         아니어도 **성공과 똑같이** 답한다(가입자 존재 여부를 알려 주지 않는다). */
      if (purpose === 'reset') {
        let eligible = false;
        try {
          const u = await A.auth.getUserByEmail(phoneLoginId(digits));
          const s = await A.db.collection('users').doc(u.uid).get();
          const ud = (s.exists && s.data()) || {};
          eligible = (ud.role !== 'driver') && (ud.withdrawn !== true);
        } catch (e) { eligible = false; }
        if (!eligible) return res.status(200).json({ ok: true, ttlSec: CODE_TTL_MS / 1000 });
      }

      const code = String(randomInt(100000, 1000000));   // 100000~999999
      const now = Date.now();
      const ref = otpCol.doc(otpId(digits, purpose));
      let prevSent = [];
      try {
        const prev = await ref.get();
        prevSent = (((prev.exists && prev.data()) || {}).sentAt || []).slice(-9);
      } catch (e) {}
      try {
        /* 코드 원문은 넣지 않는다 — 해시만 (문서를 보더라도 코드를 알 수 없다) */
        await ref.set({ codeHash: sha256(code + secret), expiresAt: now + CODE_TTL_MS,
                        tries: 0, sentAt: prevSent.concat([now]) });
      } catch (e) {
        return fail(res, 500, '잠시 뒤 다시 시도해 주세요.');
      }

      const sent = await sendOtpSms(digits, code);
      if (!sent.ok) {
        try { await ref.delete(); } catch (e) {}       // 못 보냈으면 남겨 두지 않는다
        return fail(res, 500, sent.why === 'NO_ALIGO'
          ? '문자 설정이 아직 안 됐어요. 관리자에게 알려 주세요.'
          : '문자를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      }
      return res.status(200).json({ ok: true, ttlSec: CODE_TTL_MS / 1000 });
    }

    /* ── b) 본인 비밀번호 재설정 (로그인 없이) ── */
    if (action === 'verify-reset') {
      const digits = phoneDigits(b.phone);
      const code = String(b.code || '').replace(/[^0-9]/g, '');
      const pw = String(b.newPassword || '');
      if (!/^01\d{8,9}$/.test(digits)) return fail(res, 400, '휴대폰 번호를 정확히 넣어 주세요.');
      if (!/^\d{6}$/.test(code))       return fail(res, 400, '인증번호 6자리를 넣어 주세요.');
      if (pw.length < 6)               return fail(res, 400, '새 비밀번호는 6자 이상이어야 해요.');

      /* 대량 대입 막기 (v253) — 판정을 쓰기 **전에** 센다 */
      const vBlocked = await verifyRateLimited(digits);
      if (vBlocked) return fail(res, 429, vBlocked);

      const ck = await checkCode(digits, 'reset', code);
      if (ck.error) return fail(res, ck.code, ck.error);

      /* 코드가 맞았다 — 이제 그 번호의 계정을 찾아 비밀번호를 바꾼다 */
      let uid;
      try { uid = (await A.auth.getUserByEmail(phoneLoginId(digits))).uid; }
      catch (e) { return fail(res, 400, '그 번호로 가입한 계정을 찾을 수 없어요.'); }

      try {
        const s = await A.db.collection('users').doc(uid).get();
        const ud = (s.exists && s.data()) || {};
        if (ud.role === 'driver') {
          return fail(res, 400, '기사 계정은 업체 관리자가 다시 정해 줘요. 관리자에게 문의해 주세요.');
        }
        if (ud.withdrawn === true) {
          return fail(res, 400, '탈퇴 처리된 계정이에요. cosroad@cosroad.com 으로 알려 주세요.');
        }
      } catch (e) { return fail(res, 500, '잠시 뒤 다시 시도해 주세요.'); }

      await A.auth.updateUser(uid, { password: pw });
      /* 다른 기기에 남아 있던 세션을 끊는다 — 비밀번호를 바꾼 뜻이 그것이다 */
      try { await A.auth.revokeRefreshTokens(uid); } catch (e) {}
      /* 응답에 비밀번호·토큰·uid 를 담지 않는다 */
      return res.status(200).json({ ok: true });
    }

    /* ── c) 마스터 — 가입자 휴대폰 번호 바꾸기 ── */
    if (action === 'changePhone') {
      const m = await requireMaster();
      if (m.error) return fail(res, m.code, m.error);

      const targetUid = String(b.targetUid || '').trim();
      const digits = phoneDigits(b.newPhone);
      const code = String(b.code || '').replace(/[^0-9]/g, '');
      if (!targetUid)                  return fail(res, 400, '대상 계정이 빠졌어요.');
      if (!/^01\d{8,9}$/.test(digits)) return fail(res, 400, '새 휴대폰 번호를 정확히 넣어 주세요.');
      if (!/^\d{6}$/.test(code))       return fail(res, 400, '새 번호로 받은 인증번호 6자리를 넣어 주세요.');

      /* 바꿀 수 있는 계정인가 — 휴대폰으로 가입한 업체 계정만 */
      let ud;
      try {
        const s = await A.db.collection('users').doc(targetUid).get();
        if (!s.exists) return fail(res, 404, '그 계정을 찾을 수 없어요.');
        ud = s.data() || {};
      } catch (e) { return fail(res, 500, '잠시 뒤 다시 시도해 주세요.'); }
      if (ud.role === 'driver') {
        return fail(res, 400, '기사 계정은 여기서 바꿀 수 없어요. 차량관리에서 계정을 다시 만들어 주세요.');
      }
      if (ud.signupMethod !== 'phone') {
        return fail(res, 400, '이메일로 가입한 계정이에요. 번호 바꾸기는 휴대폰으로 가입한 계정만 돼요.');
      }

      /* 이미 쓰는 번호인가 — 코드를 맞춰 보기 **전에** 본다(엉뚱하게 코드만 소모되지 않도록) */
      try {
        await A.auth.getUserByEmail(phoneLoginId(digits));
        return fail(res, 409, '이미 쓰는 번호예요. 다른 번호를 넣어 주세요.');
      } catch (e) {
        if (!e || e.code !== 'auth/user-not-found') {
          return fail(res, 500, '번호 확인에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
        }
      }

      /* 대량 대입 막기 (v253) — 마스터 1분 10회 제한과 **별도**로, 판정 쓰기 전에 센다 */
      const vBlocked = await verifyRateLimited(digits);
      if (vBlocked) return fail(res, 429, vBlocked);

      /* **새 번호로** 보낸 코드를 맞춰야 바꾼다 — 그 번호를 실제로 들고 있다는 증거다 */
      const ck = await checkCode(digits, 'changeNew', code);
      if (ck.error) return fail(res, ck.code, ck.error);

      await A.auth.updateUser(targetUid, { email: phoneLoginId(digits) });
      try {
        await A.db.collection('users').doc(targetUid)
          .update({ phone: digits, contact: digits, phoneChangedAt: Date.now() });
      } catch (e) {
        /* 로그인 아이디는 이미 바뀌었다 — 되돌리지 않고 사실대로 알린다 */
        console.log('[otp] users 갱신 실패 (로그인 아이디는 바뀜)');
        return fail(res, 500, '로그인 번호는 바뀌었는데 업체 정보 갱신에 실패했어요. 목록을 새로 고쳐 확인해 주세요.');
      }
      /* 옛 번호로 남아 있던 세션을 끊는다 */
      try { await A.auth.revokeRefreshTokens(targetUid); } catch (e) {}
      return res.status(200).json({ ok: true, loginPhone: digits });
    }

    return fail(res, 400, '알 수 없는 요청이에요.');
  } catch (e) {
    const code = String((e && e.code) || '');
    if (code === 'auth/email-already-exists') return fail(res, 409, '이미 쓰는 번호예요.');
    if (code === 'auth/invalid-password')     return fail(res, 400, '비밀번호는 6자 이상이어야 해요.');
    if (code === 'auth/user-not-found')       return fail(res, 404, '그 계정을 찾을 수 없어요.');
    /* 자세한 내용은 서버 로그에만 — 번호·코드·비밀번호는 적지 않는다 */
    console.log('[otp] 실패', action, code);
    return fail(res, 500, '처리에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
  }
}
