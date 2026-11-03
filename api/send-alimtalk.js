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
  admin, openGate, fail, whoIsCalling, canSendFor, orgPhones, rateHit,
  orgLimits, phoneDigits, sha256, TPL_ALLOWED
} from '../lib/send-guard.js';

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

    /* 받는 번호는 그 업체 회원 명부에 있는 번호만 (기사는 자기 차량 회원만) */
    const allow = await orgPhones(A, org, caller.driver ? caller.carId : '');
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

    const formData = new URLSearchParams();
    formData.append('apikey', apikey);
    formData.append('userid', userid);
    formData.append('senderkey', senderkey);
    formData.append('tpl_code', String(tpl_code));
    formData.append('sender', sender);
    formData.append('receiver_1', rcv);
    formData.append('recvname_1', String(name || ''));
    formData.append('subject_1', '알림');
    formData.append('message_1', String(message || ''));

    // 업종별 버튼 처리 (v265 까지와 같다)
    if (biz === 'academy' || !biz) {
      // 학원: 패밀리링크 웹링크 버튼
      const button = {
        button: [
          {
            name: '패밀리 링크 열기',
            linkType: 'WL',
            linkTypeName: '웹링크',
            linkMo: 'https://families.google.com',
            linkPc: 'https://families.google.com'
          }
        ]
      };
      formData.append('button_1', JSON.stringify(button));
    } else if (biz === 'delivery') {
      // 택배: 배송조회 버튼(택배사+송장번호 자동) + CJ대한통운 웹링크 버튼
      const buttons = [];
      const dsBtn = { name: '배송조회', linkType: 'DS', linkTypeName: '배송조회' };
      if (courier) dsBtn.prtcl = String(courier);
      if (invoice) dsBtn.invoice = String(invoice);
      buttons.push(dsBtn);
      buttons.push({
        name: 'CJ대한통운 배송조회',
        linkType: 'WL',
        linkTypeName: '웹링크',
        linkMo: 'https://www.cjlogistics.com/ko/tool/parcel/tracking',
        linkPc: 'https://www.cjlogistics.com/ko/tool/parcel/tracking'
      });
      formData.append('button_1', JSON.stringify({ button: buttons }));
    }
    // 물류(logistics), 공공(public)은 버튼 없음

    const response = await fetch('https://kakaoapi.aligo.in/akv10/alimtalk/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.log('[send-alimtalk] 실패');
    return fail(res, 500, '알림톡을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
}
