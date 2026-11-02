// COSROAD — 알리고 문자 인증번호(OTP) (v252 · v261 공용 분리)
// Vercel: api/otp.js
//
// ★ v261: 만들기·맞추기·빈도 제한·번호 규칙·알리고 호출은 **lib/otp-core.js** 로 옮겼다.
//   가입(api/signup.js)이 **같은 인증번호**를 맞춰야 하는데, 맞추는 코드를 복사하면
//   두 파일이 서로 다른 셈을 해 v253 의 「5회 틀리면 폐기」가 반쪽이 된다.
//   이 파일에 남은 것: 쓰임새 목록 · 마스터 확인 · 세 동작(send·verify-reset·changePhone).
//   **동작과 응답은 v260 과 글자까지 같다**(검증에서 전/후 비교).
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

import {
  ALLOWED, CODE_TTL_MS, admin, phoneDigits, phoneLoginId, clientIp, fail, otpCore
} from '../lib/otp-core.js';

/* 쓰임새 목록 — 목록으로 관리한다. v261: 'signup'(가입 인증) 추가. */
const PURPOSES = ['reset', 'changeNew', 'signup'];

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

  /* 호출한 곳의 IP (v253 — Vercel 공식 문서 대조 결과를 clientIp 에 모았다) */
  const ip = clientIp(req);

  /* v261: 인증번호 한 벌 — api/signup.js 와 **같은 코드**를 쓴다 (lib/otp-core.js) */
  const { otpCol, rateLimited, verifyRateLimited, checkCode, issueCode } = otpCore(A, secret, ip);

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

  try {
    /* ── a) 인증번호 보내기 ── */
    if (action === 'send') {
      const purpose = String(b.purpose || '');
      if (PURPOSES.indexOf(purpose) < 0) return fail(res, 400, '알 수 없는 요청이에요.');

      const digits = phoneDigits(b.phone);
      if (!/^01\d{8,9}$/.test(digits)) {
        return fail(res, 400, '휴대폰 번호를 정확히 넣어 주세요. (예: 010-1234-5678)');
      }

      /* ── v261: 가입용 코드 ──────────────────────────────────────────────
         이미 그 번호로 계정이 있으면 **사실대로** 알린다. 가입 창에서 쓰는 길이라
         「없는 번호도 성공처럼」 숨길 필요가 없고(숨기면 사용자가 왜 안 되는지 모른다),
         이미 가입한 사람에게는 로그인·비번 재설정 길을 알려 주는 것이 맞다.
         (reset 쪽은 종전대로 **존재를 숨긴다** — 그쪽은 남의 번호를 캐는 길이 된다.) */
      if (purpose === 'signup') {
        try {
          await A.auth.getUserByEmail(phoneLoginId(digits));
          return fail(res, 409, '이미 가입된 번호예요. 로그인하거나 비밀번호를 다시 정하세요.');
        } catch (e) {
          if (!e || e.code !== 'auth/user-not-found') {
            return fail(res, 500, '번호 확인에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
          }
        }
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

      /* v261: 만들기·보관·문자 보내기는 공용 한 벌이 한다 (문구·응답은 종전과 같다) */
      const iss = await issueCode(digits, purpose);
      if (iss.error) return fail(res, iss.code, iss.error);
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
