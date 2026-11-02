// COSROAD — 가입 (휴대폰 인증 + 사업자 진위·상태 확인 + 서버에서 계정 생성) (v261)
// Vercel: api/signup.js
//
// 왜 서버인가 — v260 까지는 **브라우저가 직접** 계정을 만들고 users/{uid} 를 썼다
//   (suCreateAccount·suSaveUserDoc). 앱을 거치지 않으면 휴대폰 인증과 사업자 확인을
//   **전부 건너뛸 수 있다.** 그래서 계정 생성과 users 문서는 **서버만** 만든다.
//   규칙에서도 users create 를 닫았다(firestore.rules v261).
//
// 동작 둘
//   a) bizCheck — 가입 창에서 「사업자 확인」 단추가 미리 물어보는 길 (저장 없음)
//   b) create   — 인증번호 확인 → 사업자 확인을 **서버에서 다시** → 계정 + users 문서
//
// ★ 키는 Vercel 환경변수에만 (절대규칙 1)
//   FIREBASE_SERVICE_ACCOUNT · OTP_SECRET · ALIGO_* · DATA_GO_KR_KEY
//   키 값은 코드·응답·로그 어디에도 적지 않는다.
//
// ── 국세청 API 대조 (공식 Swagger 원문, 2026-11-02 받아서 확인) ────────────────
//   출처: https://infuser.odcloud.kr/api/stages/28493/api-docs
//   host api.odcloud.kr · basePath /api/nts-businessman/v1 · schemes https
//   · 두 경로 **POST 만** 제공 ("`GET` METHOD가 아닌 `POST` METHOD 로만 제공됩니다.")
//   · serviceKey·returnType 은 **쿼리**, 그 밖(b_no 등)은 **JSON 본문**
//   · /validate 본문: { businesses: [ BusinessDescription ] }
//       required: b_no · start_dt(YYYYMMDD) · p_nm   / 선택: p_nm2·b_nm·corp_no·b_sector·b_type·b_adr
//       ※ 선택 칸은 **보내지 않는다.** 특히 p_nm2 는 「외국인 사업자가 아닌 경우 해당 항목 및
//         값을 추가하시면 진위확인이 되지 않습니다」(공식 유의사항) — 넣으면 오히려 틀린다.
//   · /validate 응답: { status_code:'OK', request_cnt, valid_cnt, data:[ BusinessValidation ] }
//       BusinessValidation = { b_no, valid('01' 일치 | '02' 불일치), valid_msg, request_param, status }
//       status = BusinessStatus (= 상태조회 결과와 **같은 모양**)
//       ★ 공식 유의사항: 「진위확인 … 요청항목이 전부 일치하는 경우, 해당 사업자에 대해
//         **상태조회 API 호출 시의 결과가 return**」 → **validate 한 번**으로 진위+상태를 다 본다.
//   · BusinessStatus = { b_no, b_stt, b_stt_cd, tax_type, tax_type_cd, end_dt, utcc_yn,
//                        tax_type_change_dt, invoice_apply_dt, rbf_tax_type, rbf_tax_type_cd }
//       b_stt_cd: '01' 계속사업자 · '02' 휴업자 · '03' 폐업자  (공식 설명 그대로)
//   · status_code: 'OK' / 오류 BAD_JSON_REQUEST(400) · REQUEST_DATA_MALFORMED(411)
//                  · TOO_LARGE_REQUEST(413) · INTERNAL_ERROR(500) · HTTP_ERROR(-5) · 404 Not Found Service
//   · 삭제·미등록 번호: validate 는 '확인할 수 없습니다', 상태조회는
//     '국세청에 등록되지 않은 사업자등록번호입니다'
//   · 1회 100건 (우리는 1건만 보낸다)

import {
  ALLOWED, admin, phoneDigits, phoneLoginId, clientIp, fail, otpCore, aligoSend, sha256
} from '../lib/otp-core.js';

const BIZ = ['academy', 'public', 'logistics', 'delivery'];

/* 국세청 진위확인 주소 — 공식 Swagger 의 host + basePath + path */
const NTS_VALIDATE = 'https://api.odcloud.kr/api/nts-businessman/v1/validate';

/* 가입 알림 문자가 못 가도 가입은 성공시킨다 — 그래서 호출 수만 제한한다 */
const BIZCHECK_IP_LIMIT = [3600 * 1000, 30];   // 미리 확인은 IP 1시간 30회

/* 마스터 알림 문자를 받을 번호가 아직 없을 때 쓰는 번호 (v260 까지 화면에 박혀 있던 값).
   orgs/_master/data/billing.notifyPhone 이 있으면 **그것을 먼저** 쓴다. */
const MASTER_PHONE_FALLBACK = '010-3660-3911';

/* ── 사업자등록번호 체크섬 (국세청 공개 검증식) ────────────────────────────────
   10자리 중 앞 9자리에 가중치 1,3,7,1,3,7,1,3,5 를 곱해 더하고,
   9번째 자리×5 의 **십의 자리**를 한 번 더 더한 뒤, 10 에서 나머지를 뺀 값이 마지막 자리다.
   ★ 이 검사는 **번호 꼴**만 본다. 실제로 있는 사업자인지는 국세청이 답한다.
     여기서 걸리면 국세청을 **부르지 않는다**(쓸모없는 호출·요금 아끼기). */
export function bizNoChecksumOk(raw) {
  const d = String(raw || '').replace(/[^0-9]/g, '');
  if (!/^\d{10}$/.test(d)) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * w[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  return ((10 - (sum % 10)) % 10) === Number(d[9]);
}

/* ── 사업자 확인 — 진위 일치 AND 계속사업자만 통과 ──────────────────────────
   반환: { ok:true, info:{ bizNo, bStt, bSttCd, taxType, taxTypeCd, endDt } }
        | { error, code }   (code 는 우리 응답의 HTTP 코드)
   ★ 국세청 장애·키 없음·형식 이상이면 **통과시키지 않는다**(가입을 막는다). */
export async function checkBiz({ b_no, p_nm, start_dt }, deps) {
  const fetchFn = (deps && deps.fetch) || fetch;
  const key = (deps && deps.key) !== undefined ? deps.key : process.env.DATA_GO_KR_KEY;

  const bno = String(b_no || '').replace(/[^0-9]/g, '');
  const nm  = String(p_nm || '').trim();
  const dt  = String(start_dt || '').replace(/[^0-9]/g, '');

  if (!bizNoChecksumOk(bno)) {
    return { error: '사업자등록번호가 올바르지 않아요. 다시 확인해 주세요.', code: 400 };
  }
  if (!nm)              return { error: '대표자 성명을 넣어 주세요.', code: 400 };
  if (!/^\d{8}$/.test(dt)) return { error: '개업일자를 넣어 주세요. (예: 2020-03-01)', code: 400 };
  if (!key) {
    /* 키가 없으면 **확인하지 않은 것**이다 — 조용히 통과시키지 않는다 */
    console.log('[signup] 국세청 키 없음');
    return { error: '사업자 확인 서버가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.', code: 503 };
  }

  /* 공식 문서대로 POST · serviceKey 는 쿼리 · 자료는 JSON 본문 · 선택 칸은 보내지 않는다 */
  const url = NTS_VALIDATE + '?serviceKey=' + encodeURIComponent(key) + '&returnType=JSON';
  let j;
  try {
    const r = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ businesses: [{ b_no: bno, start_dt: dt, p_nm: nm }] })
    });
    j = await r.json();
    if (!r.ok && !(j && j.status_code)) {
      console.log('[signup] 국세청 HTTP', r.status);
      return { error: '사업자 확인 서버가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.', code: 503 };
    }
  } catch (e) {
    console.log('[signup] 국세청 호출 실패');       // 번호·키는 적지 않는다
    return { error: '사업자 확인 서버가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.', code: 503 };
  }

  if (!j || j.status_code !== 'OK') {
    /* BAD_JSON_REQUEST · REQUEST_DATA_MALFORMED · TOO_LARGE_REQUEST · INTERNAL_ERROR · HTTP_ERROR */
    console.log('[signup] 국세청 status_code', (j && j.status_code) || '(없음)');
    return { error: '사업자 확인 서버가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.', code: 503 };
  }

  const row = (Array.isArray(j.data) && j.data[0]) || null;
  if (!row) {
    console.log('[signup] 국세청 응답에 data 없음');
    return { error: '사업자 확인 서버가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.', code: 503 };
  }

  /* 진위 — '01' 만 일치 (공식: 01 Valid / 02 Invalid) */
  if (String(row.valid) !== '01') {
    return { error: '사업자등록번호·대표자 성명·개업일자가 국세청 자료와 맞지 않아요. '
                  + '사업자등록증과 똑같이 넣어 주세요.', code: 400 };
  }

  /* 상태 — 진위가 일치하면 상태조회 결과가 함께 온다(공식 유의사항) */
  const st = row.status || null;
  if (!st || !st.b_stt_cd) {
    /* 일치했는데 상태가 없으면 판단할 수 없다 — 통과시키지 않는다 */
    console.log('[signup] 진위는 일치했지만 상태가 없음');
    return { error: '사업자 상태를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 503 };
  }
  const code = String(st.b_stt_cd);
  if (code !== '01') {
    const why = code === '02' ? '휴업 중인 사업자예요.'
              : code === '03' ? '폐업한 사업자예요.'
              : '계속사업자가 아니에요. (' + String(st.b_stt || code) + ')';
    return { error: why + ' 영업 중인 사업자등록번호로 가입해 주세요.', code: 400 };
  }

  return { ok: true, info: {
    bizNo: bno,
    bStt: String(st.b_stt || ''), bSttCd: code,
    taxType: String(st.tax_type || ''), taxTypeCd: String(st.tax_type_cd || ''),
    endDt: String(st.end_dt || '')
  } };
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
  if (!secret) return fail(res, 500, '서버 인증 설정이 아직 안 됐어요. 관리자에게 알려 주세요.');

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
  const ip = clientIp(req);
  /* 인증번호 한 벌 — api/otp.js 와 **같은 코드**(lib/otp-core.js) */
  const { otpCol, verifyRateLimited, checkCode } = otpCore(A, secret, ip);

  /* 미리 확인(bizCheck) 횟수 제한 — 국세청 호출을 아낀다. otp 컬렉션 안에 기록한다. */
  async function bizCheckLimited() {
    const now = Date.now();
    const ref = otpCol.doc('rl.bz.' + sha256(ip));
    try {
      return await A.db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        const at = (((s.exists && s.data()) || {}).at || []).filter(t => now - t < BIZCHECK_IP_LIMIT[0]);
        if (at.length >= BIZCHECK_IP_LIMIT[1]) return '요청이 너무 잦아요. 잠시 뒤에 다시 시도해 주세요.';
        at.push(now);
        tx.set(ref, { at: at.slice(-40), updatedAt: now });
        return null;
      });
    } catch (e) {
      console.log('[signup] 확인 횟수 기록 실패');
      return '잠시 뒤 다시 시도해 주세요.';
    }
  }

  try {
    /* ── a) 사업자 확인만 (화면의 「사업자 확인」 단추) ── */
    if (action === 'bizCheck') {
      const blocked = await bizCheckLimited();
      if (blocked) return fail(res, 429, blocked);
      const r = await checkBiz({ b_no: b.b_no, p_nm: b.p_nm, start_dt: b.start_dt });
      if (r.error) return fail(res, r.code, r.error);
      /* 저장하지 않는다 — 화면에 보여 줄 것만 */
      return res.status(200).json({ ok: true, bStt: r.info.bStt, taxType: r.info.taxType });
    }

    /* ── b) 가입 ── */
    if (action === 'create') {
      const digits   = phoneDigits(b.phone);
      const code     = String(b.code || '').replace(/[^0-9]/g, '');
      const pw       = String(b.password || '');
      const bizType  = String(b.bizType || '');
      const orgName  = String(b.orgName || '').trim();
      const agree    = b.agree === true;

      /* ① 형식 — 하나라도 어긋나면 계정을 만들지 않는다 */
      if (!/^01\d{8,9}$/.test(digits)) return fail(res, 400, '휴대폰 번호를 정확히 넣어 주세요. (예: 010-1234-5678)');
      if (!/^\d{6}$/.test(code))       return fail(res, 400, '인증번호 6자리를 넣어 주세요.');
      if (pw.length < 6)               return fail(res, 400, '비밀번호는 6자 이상이어야 해요.');
      if (BIZ.indexOf(bizType) < 0)    return fail(res, 400, '업종을 골라 주세요.');
      if (!orgName || orgName.length > 40) return fail(res, 400, '업체명을 1~40자로 넣어 주세요.');
      if (!agree)                      return fail(res, 400, '약관에 동의해 주세요.');

      /* ② 인증번호 — 대량 대입 막기를 **판정 전에** 센다 (v253 과 같은 순서) */
      const vBlocked = await verifyRateLimited(digits);
      if (vBlocked) return fail(res, 429, vBlocked);
      const ck = await checkCode(digits, 'signup', code);
      if (ck.error) return fail(res, ck.code, ck.error);

      /* ③ 사업자 확인을 **서버에서 다시** — 화면이 보내온 결과는 믿지 않는다
            (화면을 거치지 않고 create 를 바로 불러도 여기서 걸린다) */
      const biz = await checkBiz({ b_no: b.b_no, p_nm: b.p_nm, start_dt: b.start_dt });
      if (biz.error) return fail(res, biz.code, biz.error);

      /* ④ 그 번호로 계정이 이미 있나 */
      const loginId = phoneLoginId(digits);
      try {
        await A.auth.getUserByEmail(loginId);
        return fail(res, 409, '이미 가입된 번호예요. 로그인하거나 비밀번호를 다시 정하세요.');
      } catch (e) {
        if (!e || e.code !== 'auth/user-not-found') {
          return fail(res, 500, '번호 확인에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
        }
      }

      /* 같은 사업자번호로 이미 가입한 곳이 있나 — **막지 않고** 마스터에게 표시만 한다
         (한 사업자가 지점을 여러 곳 쓰는 일이 있다. 사장님 결정) */
      let bizNoDup = false;
      try {
        const dup = await A.db.collection('users').where('bizNo', '==', biz.info.bizNo).limit(1).get();
        bizNoDup = !dup.empty;
      } catch (e) { bizNoDup = false; }

      /* ⑤ 계정 만들기 */
      let uid;
      try {
        uid = (await A.auth.createUser({ email: loginId, password: pw })).uid;
      } catch (e) {
        if (e && e.code === 'auth/email-already-exists') {
          return fail(res, 409, '이미 가입된 번호예요. 로그인하거나 비밀번호를 다시 정하세요.');
        }
        throw e;
      }

      /* ⑥ users 문서 — 승인 대기로 시작한다(승인은 마스터가 손으로 한다) */
      const now = Date.now();
      const rec = {
        bizType: bizType,
        orgName: orgName,
        orgId: bizType + '_' + String(uid).slice(0, 12),
        phone: digits,
        contact: digits,                 /* 연락처 칸은 없앴다 — 휴대폰 번호가 연락처다 */
        signupMethod: 'phone',
        status: 'pending',
        approved: false,
        plan: 'pending',
        bizNo: biz.info.bizNo,
        bizCeo: String(b.p_nm || '').trim(),
        bizOpenDate: String(b.start_dt || '').replace(/[^0-9]/g, ''),
        bizCheckedAt: now,
        bizNoDup: bizNoDup,
        createdAt: now
      };
      try {
        await A.db.collection('users').doc(uid).set(rec);
      } catch (e) {
        /* ⑦ 반쪽 계정 금지 — users 를 못 썼으면 방금 만든 계정을 지운다 */
        try { await A.auth.deleteUser(uid); } catch (e2) { console.log('[signup] 되돌리기 실패'); }
        console.log('[signup] users 쓰기 실패 — 계정 되돌림');
        return fail(res, 500, '가입 정보를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      }

      /* ⑧ 문자 둘 — 못 보내도 가입은 성공이다(막지 않는다) */
      let billing = {};
      try {
        const s = await A.db.collection('orgs').doc('_master').collection('data').doc('billing').get();
        billing = (s.exists && s.data()) || {};
      } catch (e) { billing = {}; }

      const bizLabel = { academy: '학원', public: '공공', logistics: '물류', delivery: '택배' }[bizType] || bizType;
      /* 마스터 알림 — 받는 번호는 billing.notifyPhone, 없으면 종전 번호 */
      const masterTo = phoneDigits(billing.notifyPhone) || phoneDigits(MASTER_PHONE_FALLBACK);
      await aligoSend(masterTo,
        '[코스로드] 가입 신청 ' + orgName + ' (' + bizLabel + ') ' + digits, 'signup');

      /* 신청자 계좌 안내 — 계좌는 코드에 박지 않고 billing 에서 읽는다 */
      const bank = String(billing.bank || '').trim();
      const acct = String(billing.account || '').trim();
      const holder = String(billing.holder || '').trim();
      if (bank && acct) {
        await aligoSend(digits,
          '[코스로드] 가입 신청 접수. 입금 확인 후 승인됩니다. '
          + bank + ' ' + acct + (holder ? ' (' + holder + ')' : ''), 'signup');
      }

      /* 응답에 비밀번호·토큰·uid 를 담지 않는다 — 화면이 같은 번호·비번으로 로그인한다 */
      return res.status(200).json({ ok: true });
    }

    return fail(res, 400, '알 수 없는 요청이에요.');
  } catch (e) {
    /* 이름을 errCode 로 둔다 — 인증번호(code)와 섞이지 않게 (검사에서도 가려진다) */
    const errCode = String((e && e.code) || '');
    if (errCode === 'auth/email-already-exists') return fail(res, 409, '이미 가입된 번호예요. 로그인하거나 비밀번호를 다시 정하세요.');
    if (errCode === 'auth/invalid-password')     return fail(res, 400, '비밀번호는 6자 이상이어야 해요.');
    /* 자세한 내용은 서버 로그에만 — 번호·코드·비밀번호·키는 적지 않는다 */
    console.log('[signup] 실패', action, errCode);
    return fail(res, 500, '처리에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
  }
}
