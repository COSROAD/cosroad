// COSROAD — 알리고 알림톡 발송 (v266)
//
// ── v266 에서 바뀐 것 ────────────────────────────────────────────────────
// v265 까지 이 파일도 send-sms 와 똑같이 **Origin 헤더 한 줄만** 보고,
// 받는 번호·본문·템플릿코드를 요청이 적어 준 그대로 알리고로 보냈다.
// 이제 send-sms 와 **같은 문지기**(lib/send-guard.js)를 쓴다:
//   · 로그인 토큰 필수 · 승인·이용 기간 확인
//   · 받는 번호는 **그 업체 회원 명부**에 있는 번호만 (기사는 자기 차량 회원만)
//   · 템플릿코드는 **서버가 아는 목록**에 있는 것만
//   · 업체별 1분·하루 상한
//
// ★ 번호·본문·키 원문은 응답에도 로그에도 넣지 않는다.

import {
  admin, openGate, fail, whoIsCalling, canSendFor, callerCarScope, orgPhones, rateHit,
  orgLimits, phoneDigits, sha256, TPL_ALLOWED
} from '../lib/send-guard.js';
/* ★★ v297(60-B4b): 본문·버튼·알리고 호출을 `lib/alimtalk-core.js` **한 벌**로 모았다 —
   출석 전용 기기(서버가 보낸다)와 **같은 글·같은 코드**를 쓰기 위한 것이다.
   ★ 앱이 보낸 `message` 가 있으면 **그것을 그대로** 쓴다(글자는 같다 · 배포 직후 옛 앱 호환) —
     없을 때만 여기서 만든다. */
import { buildAlimtalkMessage, alimtalkForm, postAlimtalk } from '../lib/alimtalk-core.js';

export default async function handler(req, res) {
  if (openGate(req, res)) return;

  let A;
  try { A = admin(); }
  catch (e) {
    const m = String(e && e.message);
    return fail(res, 500, m === 'NO_SERVICE_ACCOUNT'
      ? '서버에 관리자 키가 아직 등록되지 않았어요. 관리자에게 알려 주세요.'
      : '서버 관리자 키 형식이 올바르지 않아요. 관리자에게 알려 주세요.');
  }

  try {
    const b = req.body || {};
    const { tpl_code, name, message, biz, courier, invoice } = b;

    const caller = await whoIsCalling(A, req);
    if (!caller) return fail(res, 401, '로그인이 필요해요. 다시 로그인한 뒤 보내 주세요.');

    const can = await canSendFor(A, caller, String(b.org || ''));
    if (!can.ok) return fail(res, can.code, can.message);
    const org = can.org;

    /* 템플릿은 **서버가 아는 것만** — 승인 안 된 코드로 아무 글이나 나가지 못하게 */
    if (!TPL_ALLOWED.includes(String(tpl_code || ''))) {
      return fail(res, 400, '알 수 없는 알림톡 템플릿이에요.');
    }

    const rcv = phoneDigits(b.receiver);
    if (!/^0\d{8,10}$/.test(rcv)) return fail(res, 400, '받는 번호가 올바르지 않아요.');

    /* 받는 번호는 그 업체 회원 명부에 있는 번호만 (기사는 자기 차량 회원만 ·
       **동승 도우미**는 배정 문서에서 그때 읽은 차량 회원만 — 43-B, callerCarScope) */
    const scope = await callerCarScope(A, caller);
    if (!scope.ok) return fail(res, scope.code, scope.message);
    const allow = await orgPhones(A, org, scope.carId);
    if (allow === null) return fail(res, 500, '회원 명부를 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    if (!allow.has(rcv)) {
      return fail(res, 403, '회원 명부에 없는 번호예요. 회원관리에서 번호를 확인해 주세요.');
    }

    if (String(message || '').length > 1000) {
      return fail(res, 400, '본문이 너무 깁니다 (1000자 이내).');
    }

    const over = await rateHit(A, 'org.' + sha256(org), orgLimits(), 1);
    if (over) return fail(res, 429, over);

    const apikey    = process.env.ALIGO_KEY;
    const userid    = process.env.ALIGO_USER_ID;
    const senderkey = process.env.ALIGO_SENDER_KEY;
    const sender    = process.env.ALIGO_SENDER;
    if (!apikey || !userid || !senderkey || !sender) {
      return fail(res, 500, '알림톡 설정이 아직 안 됐어요. 관리자에게 알려 주세요.');
    }

    /* 본문 — 앱이 보냈으면 그대로, 없으면 **같은 한 벌**로 만든다(v297) */
    const msg = String(message || '') || buildAlimtalkMessage(biz, b.orgName, name, b.time, invoice, courier);
    const formData = alimtalkForm({ tplCode: tpl_code, receiver: rcv, name: name,
                                    message: msg, biz: biz, courier: courier, invoice: invoice });
    if (!formData) return fail(res, 500, '알림톡 설정이 아직 안 됐어요. 관리자에게 알려 주세요.');
    const data = await postAlimtalk(formData);
    return res.status(200).json(data);
  } catch (error) {
    console.log('[send-alimtalk] 실패');
    return fail(res, 500, '알림톡을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
}
