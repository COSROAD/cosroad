// COSROAD — 인증번호(OTP) 공통 기반 (v261)
// 쓰는 곳: api/otp.js · api/signup.js
//
// 왜 따로 뺐나 — 가입(api/signup.js)도 **같은 인증번호**를 맞춰야 한다.
//   맞추는 코드를 복사하면 두 파일이 **서로 다른 셈**을 하게 되고,
//   v253 에서 막은 「5회 틀리면 폐기」(한 트랜잭션)가 반쪽이 된다.
//   그래서 맞추기·빈도 제한·번호 규칙·알리고 호출을 한 벌로 모았다.
//
// ★ 왜 api/ 밖인가 — Vercel 공식 문서(/docs/functions/runtimes/node-js, 2026-08-11):
//     "Vercel creates a separate function for each supported source file in the root `api/` directory."
//     "Keep shared utilities and route modules outside `api/` and import them from your function entry point."
//   즉 `api/` 안에 두면 **그 자체가 함수 주소로 열린다**(이 저장소 vercel.json 의
//   `"functions": { "api/*.js": … }` 글롭도 `api/_*.js` 를 함께 잡는다).
//   밑줄(_) 로 시작하면 빠진다는 내용은 공식 문서에 **없다** → 문서가 권하는 대로 밖에 둔다.
//   가져다 쓰는 파일이 `api/` 안에 있으면 Vercel 이 묶음에 함께 담는다(import 추적).
//
// ★ 키는 Vercel 환경변수에만 (절대규칙 1)
//   FIREBASE_SERVICE_ACCOUNT · ALIGO_KEY · ALIGO_USER_ID · ALIGO_SENDER · OTP_SECRET
//   코드 원문은 어디에도 저장하지 않는다(해시만). 로그에 번호·코드·비밀번호를 적지 않는다.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash, randomInt, timingSafeEqual } from 'crypto';

/* 허용 출처 — 두 api 가 같은 목록을 쓴다 */
export const ALLOWED = ['https://roadjob.co.kr', 'https://www.roadjob.co.kr', 'https://cosroad.com', 'https://www.cosroad.com', 'https://roadcrew.kr', 'https://cosroad.vercel.app'];

export const CODE_TTL_MS = 5 * 60 * 1000;   // 5분
export const MAX_TRIES   = 5;               // 5회 틀리면 그 인증번호를 버린다

/* 번호별 **보내기** 빈도 제한 — [창(ms), 허용 횟수] */
export const PHONE_LIMITS = [[60 * 1000, 1], [10 * 60 * 1000, 3], [24 * 3600 * 1000, 10]];
/* IP별 **보내기** 빈도 제한 */
export const IP_LIMIT = [3600 * 1000, 20];
/* **확인(맞추기)** 쪽 빈도 제한 (v253) */
export const VERIFY_PHONE_LIMIT = [10 * 60 * 1000, 10];
export const VERIFY_IP_LIMIT    = [10 * 60 * 1000, 30];

/* 서비스 계정 — 함수가 깨어 있는 동안 한 번만 초기화한다 */
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

/* 앱(index.html phoneDigits·phoneLoginId)과 **같은 규칙**. 어긋나면 로그인이 안 된다. */
export function phoneDigits(raw) {
  let t = String(raw || '').replace(/[^0-9]/g, '');
  if (t.indexOf('82') === 0 && t.length >= 11) t = '0' + t.slice(2);
  return t;
}
export function phoneLoginId(raw) {
  const d = phoneDigits(raw);
  return d ? (d + '@phone.cosroad.com') : '';
}

export const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');

/* 같은 길이의 해시 두 개를 시간차 없이 비교한다 */
export function sameHash(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length || !x.length) return false;
  try { return timingSafeEqual(x, y); } catch (e) { return false; }
}

/* 인증번호 문서 id — 번호가 그대로 드러나지 않게 해시로 둔다. */
export const otpId = (digits, purpose) => sha256(digits + purpose);

/* 빈도 제한 기록도 **같은 otp 컬렉션** 안에 둔다 (규칙 한 줄로 전부 잠근다) */
export const rlPhoneId       = (digits) => 'rl.p.'  + sha256(digits);
export const rlIpId          = (ip)     => 'rl.i.'  + sha256(ip);
export const rlVerifyPhoneId = (digits) => 'rl.v.'  + sha256(digits);
export const rlVerifyIpId    = (ip)     => 'rl.vi.' + sha256(ip);

/* 요청자 IP — Vercel 공식 문서 대조 (/docs/headers/request-headers)
     · x-forwarded-for 는 Vercel 이 덮어써 위조를 막는다
     · x-vercel-forwarded-for 는 위에 프록시가 끼어도 안 덮인다 → 먼저 본다
   세 헤더 모두 쉼표 목록일 수 있어 **첫 값**을 쓴다. */
export function clientIp(req) {
  const pick = (v) => String(v || '').split(',')[0].trim();
  const h = (req && req.headers) || {};
  return pick(h['x-vercel-forwarded-for'])
      || pick(h['x-forwarded-for'])
      || pick(h['x-real-ip'])
      || String((req && req.socket && req.socket.remoteAddress) || 'unknown');
}

export const fail = (res, code, message) => res.status(code).json({ ok: false, message });

/* 6자리 인증번호 만들기 — 서버만 만든다 */
export const newCode = () => String(randomInt(100000, 1000000));   // 100000~999999

/* 알리고 문자 — **이 서버에서 직접** 보낸다 (api/send-sms 경유 금지).
   공식 문서 대조: POST https://apis.aligo.in/send/ · x-www-form-urlencoded
   필수 key·user_id·sender·receiver·msg / 선택 msg_type · 성공 result_code=1
   ★ 번호·코드·본문을 로그에 적지 않는다. */
export async function aligoSend(to, msg, tag) {
  const key    = process.env.ALIGO_KEY;
  const userid = process.env.ALIGO_USER_ID;
  const sender = process.env.ALIGO_SENDER;
  if (!key || !userid || !sender) return { ok: false, why: 'NO_ALIGO' };

  const form = new URLSearchParams();
  form.append('key', key);
  form.append('user_id', userid);
  form.append('sender', sender);
  form.append('receiver', String(to || ''));
  form.append('msg', String(msg || ''));
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
    console.log('[' + (tag || 'sms') + '] 알리고 호출 실패');
    return { ok: false, why: 'FETCH' };
  }
  if (Number(data && data.result_code) !== 1) {
    console.log('[' + (tag || 'sms') + '] 알리고 거부', (data && data.result_code), (data && data.message));
    return { ok: false, why: 'ALIGO' };
  }
  return { ok: true };
}

/* ── 인증번호 보내기·맞추기 한 벌 ──────────────────────────────────────────
   A(admin)·secret·ip 를 받아 세 함수를 돌려준다. otp.js·signup.js 가 **같은 것**을 쓴다.
   반환: { rateLimited, verifyRateLimited, checkCode, otpCol } */
export function otpCore(A, secret, ip) {
  const otpCol = A.db.collection('otp');

  /* 보내기 빈도 제한 — 한 트랜잭션에서 읽고 쓴다. 반환: null 통과 / 문구 막힘 */
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

  /* 확인(맞추기) 쪽 빈도 제한 (v253) — checkCode **전에** 센다. */
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

  /* 인증번호 맞추기 — 전부 **한 트랜잭션** 안에서 한다 (v253).
     따로따로 읽고 쓰면 동시 요청이 「5회 틀리면 폐기」를 무력화한다.
     반환: { ok:true } | { error, code } */
  async function checkCode(digits, purpose, code) {
    const ref = otpCol.doc(otpId(digits, purpose));
    const want = sha256(String(code) + secret);
    try {
      return await A.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const d = (snap.exists && snap.data()) || null;
        /* 없는 경우와 만료된 경우를 **같은 문구**로 답한다 */
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
      /* 충돌이 거듭돼 끝내 실패한 경우 — 판정하지 않고 멈춘다(열어 주지 않는다) */
      console.log('[otp] 인증번호 확인 실패');
      return { error: '잠시 뒤 다시 시도해 주세요.', code: 500 };
    }
  }

  /* 인증번호 만들어 보관하고 문자로 보낸다 (보내기 빈도 제한은 부르는 쪽에서 먼저).
     반환: { ok:true } | { error, code } */
  async function issueCode(digits, purpose) {
    const code = newCode();
    const now = Date.now();
    const ref = otpCol.doc(otpId(digits, purpose));
    let prevSent = [];
    try {
      const prev = await ref.get();
      prevSent = (((prev.exists && prev.data()) || {}).sentAt || []).slice(-9);
    } catch (e) {}
    try {
      /* 코드 원문은 넣지 않는다 — 해시만 */
      await ref.set({ codeHash: sha256(code + secret), expiresAt: now + CODE_TTL_MS,
                      tries: 0, sentAt: prevSent.concat([now]) });
    } catch (e) {
      return { error: '잠시 뒤 다시 시도해 주세요.', code: 500 };
    }
    /* 무엇에 쓰는 코드인지 적지 않는다 — 문자를 본 사람이 용도를 알아도 득이 없다 */
    const sent = await aligoSend(digits, '[코스로드] 인증번호 ' + code + ' (5분 안에 입력)', 'otp');
    if (!sent.ok) {
      try { await ref.delete(); } catch (e) {}       // 못 보냈으면 남겨 두지 않는다
      return { error: sent.why === 'NO_ALIGO'
        ? '문자 설정이 아직 안 됐어요. 관리자에게 알려 주세요.'
        : '문자를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 500 };
    }
    return { ok: true };
  }

  return { otpCol, rateLimited, verifyRateLimited, checkCode, issueCode };
}
