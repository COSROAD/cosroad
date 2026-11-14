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

/* ★★ v319(73-B): **하차 알림톡은 그날 하원 알림이 이미 갔으면 보내지 않는다.**
   왜 — 패드·출석 기기에서 **두 번째 PIN**(하원)을 누르면 서버가 귀가 알림을 보낸다(73-B).
   그 뒤 기사가 「하차 완료」를 누르면 **같은 사람에게 그날 두 번째 알림**이 간다.
   ★ 이 가드는 **서버에만** 둘 수 있다 — 기사는 규칙상 `data/attendanceTime` 을 못 읽는다.
   ★ 앱이 `memberId` 를 함께 보내고, 서버는 **그 차량 «회원» 인지**(`callerCarScope`) 확인한 뒤
     그 사람 칸의 `out` 을 본다. 있으면 `{ ok:true, skipped:'left' }` — 하차 완료 표시는 그대로 남는다.
   ★ `memberId` 가 **없는 옛 앱**은 종전 그대로 보낸다(배포 틈을 막는다 · 교훈 ⑳). */
const DROPOFF_TPLS = ['UJ_4933', 'UJ_4932'];
function kstDateStr2(ms) {
  const d = new Date((ms || Date.now()) + 9 * 3600 * 1000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0')
       + '-' + String(d.getUTCDate()).padStart(2, '0');
}
/* 그 `memberId` 가 **지금 보내는 그 번호의 주인**인가 — 남의 «회원» id 를 적어 보내
   남의 기록을 들여다보지 못하게 한다(앱은 늘 같은 사람의 id·번호를 함께 보낸다).
   ★ 위 `callerCarScope`·`orgPhones` 가 **번호**를 그 차량 «회원» 로 이미 좁혔으므로,
     「그 번호가 이 id 의 번호인가」만 더 보면 범위가 같아진다. */
async function memberOwnsRcv(A, org, memberId, rcv) {
  try {
    const snap = await A.db.collection('orgs').doc(org).collection('data').doc('members').get();
    if (!snap.exists) return false;
    const list = JSON.parse(String((snap.data() || {}).value || '[]'));
    if (!Array.isArray(list)) return false;
    const m = list.find((x) => x && String(x.id) === String(memberId));
    if (!m) return false;
    return phoneDigits(m.phone) === rcv || phoneDigits(m.phone2) === rcv;
  } catch (e) { return false; }
}
async function leftAlready(A, org, memberId) {
  try {
    const snap = await A.db.collection('orgs').doc(org).collection('data').doc('attendanceTime').get();
    if (!snap.exists) return false;
    const map = JSON.parse(String((snap.data() || {}).value || '{}'));
    const day = (map && map[kstDateStr2()]) || {};
    const v = day[String(memberId)];
    return !!(v && typeof v === 'object' && v.out);
  } catch (e) { return false; }
}

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

    /* ★★ v319(73-B): 하차 알림톡인데 **그날 하원 알림이 이미 갔으면** 보내지 않는다.
       ★ `memberId` 는 **지금 보내는 번호의 주인**이어야 한다(`memberOwnsRcv`) — 번호는 위
         `callerCarScope`·`orgPhones` 가 그 차량 «회원» 로 이미 좁혔으므로 범위가 같아진다
         (남의 «회원» id 를 적어 보내 남의 기록을 들여다보지 못하게). */
    const mid = String(b.memberId || '').trim();
    if (mid && DROPOFF_TPLS.includes(String(tpl_code || ''))) {
      if (await memberOwnsRcv(A, org, mid, rcv) && await leftAlready(A, org, mid)) {
        return res.status(200).json({ ok: true, skipped: 'left' });
      }
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
