// COSROAD — 알리고 문자(SMS/LMS) 발송 (v266)
// 앱 -> 이 함수 -> 알리고 /send/ API
//
// ── v266 에서 바뀐 것 ────────────────────────────────────────────────────
// v265 까지 이 파일은 **Origin 헤더 한 줄만** 보고, 받는 번호·본문을 요청이 적어 준
// 그대로 알리고로 보냈다. Origin 은 브라우저 밖에서 마음대로 적을 수 있어
// 사실상 누구나 사장님 알리고 계정으로 아무 번호에 문자를 보낼 수 있었다.
// (코스로드32 0단계 조사에서 배포 서버로 확인 — 실제 발송 없이)
//
// 이제 두 길로 나뉜다. **둘 다 받는 번호를 서버가 정하거나 확인한다.**
//   ① mode:'inquiry'  문의 알림 — 받는 번호는 **서버**가 billing.notifyPhone 에서 읽는다.
//                     화면은 번호를 보내지 않는다(보내도 무시). 로그인 없이 되지만 IP 상한이 있다.
//   ② 그 밖(알림장 등) — **로그인 토큰 필수** · 승인·이용 기간 확인 ·
//                     받는 번호는 **그 업체 회원 명부에 있는 번호만** · 업체별 1분·하루 상한.
//
// ★ 번호·본문·키 원문은 응답에도 로그에도 넣지 않는다.
// ★ 새 환경변수 없음 (ALIGO_* · FIREBASE_SERVICE_ACCOUNT 이미 있음).

import {
  admin, openGate, fail, whoIsCalling, canSendFor, callerCarScope, orgPhones, rateHit,
  orgLimits, inqIpLimits, inqUidLimits, notifyPhone, clientIp, phoneDigits, sha256,
  REQ_MAX_RCV, INQ_BODY_MAX, INQ_PREFIX
} from '../lib/send-guard.js';
/* ★★ v319(73-B): 문자 보내기·그림 글자 거르기를 `lib/sms-core.js` **한 벌**로 모았다 —
   서버가 직접 보내는 하원 알림(`api/driver-auth.js`)과 **같은 코드·같은 표**를 쓰기 위한 것이다.
   ★ 여기서도 본문·제목이 그 한 벌을 지난다 — 앱이 빠뜨린 자리를 서버가 한 번 더 막는다. */
import { postSms } from '../lib/sms-core.js';

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
    const mode = String(b.mode || '');
    const ip = clientIp(req);

    let rcvList;      // 알리고로 보낼 번호 (숫자만)
    let msg;          // 본문
    let title = '';
    let msgType = 'LMS';

    /* ── ① 문의 알림 — 받는 번호는 서버가 정한다 ────────────────────── */
    if (mode === 'inquiry') {
      const body = String(b.msg || '').trim();
      if (!body) return fail(res, 400, '문의 내용이 비어 있어요.');
      if (body.length > INQ_BODY_MAX) return fail(res, 400, '문의 내용이 너무 길어요 (' + INQ_BODY_MAX + '자 이내).');

      /* 로그인했으면 계정별 상한도 함께 센다 */
      const caller = await whoIsCalling(A, req);
      const over = await rateHit(A, 'inq.ip.' + sha256(ip), inqIpLimits(), 1);
      if (over) return fail(res, 429, over);
      if (caller) {
        const over2 = await rateHit(A, 'inq.u.' + sha256(caller.uid), inqUidLimits(), 1);
        if (over2) return fail(res, 429, over2);
      }

      rcvList = [await notifyPhone(A)];
      /* 앞머리를 **서버가** 붙인다 — 본문을 통째로 남이 정하지 못하게 */
      msg = INQ_PREFIX + body;
      msgType = 'LMS';

    /* ── ② 그 밖(알림장 등) — 로그인 + 기간 + 회원 명부 ───────────── */
    } else {
      const caller = await whoIsCalling(A, req);
      if (!caller) return fail(res, 401, '로그인이 필요해요. 다시 로그인한 뒤 보내 주세요.');

      const can = await canSendFor(A, caller, String(b.org || ''));
      if (!can.ok) return fail(res, can.code, can.message);
      const org = can.org;

      rcvList = String(b.receiver || '').split(',').map((r) => phoneDigits(r)).filter(Boolean);
      if (!rcvList.length || rcvList.length > REQ_MAX_RCV
          || !rcvList.every((r) => /^0\d{8,10}$/.test(r))) {
        return fail(res, 400, '받는 번호가 올바르지 않아요 (한 번에 ' + REQ_MAX_RCV + '명까지).');
      }

      /* ★ 받는 번호는 **그 업체 회원 명부**에 있는 번호만.
         기사면 토큰의 carId 로 **자기 차량 회원**만 본다.
         **동승 도우미**(43-B)는 토큰에 carId 가 없어 `callerCarScope` 가 배정 문서에서
         그때 읽는다 — 배정을 뗀 직후에는 옛 차량으로도 못 보낸다.
         하나라도 명부에 없으면 그 번호만 빼지 않고 **요청 전체를 거부**한다
         (몰래 한 명을 끼워 넣는 길을 막는다). 번호는 응답에 넣지 않는다. */
      const scope = await callerCarScope(A, caller);
      if (!scope.ok) return fail(res, scope.code, scope.message);
      const allow = await orgPhones(A, org, scope.carId);
      if (allow === null) return fail(res, 500, '회원 명부를 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      const bad = rcvList.filter((r) => !allow.has(r)).length;
      if (bad) {
        return fail(res, 403, '회원 명부에 없는 번호가 ' + bad + '개 있어요. 회원관리에서 번호를 확인해 주세요.');
      }

      msg = String(b.msg || '');
      if (!msg) return fail(res, 400, '보낼 내용이 비어 있어요.');
      if (msg.length > 2000) return fail(res, 400, '본문이 너무 깁니다 (2000자 이내).');
      title = String(b.title || '');
      msgType = String(b.msg_type || 'LMS');

      /* 업체별 상한 — 받는 **사람 수**로 센다 */
      const over = await rateHit(A, 'org.' + sha256(org), orgLimits(), rcvList.length);
      if (over) return fail(res, 429, over);
    }

    /* ── 알리고로 — **한 벌**(`lib/sms-core.js`)이 보낸다 (v319) ─────────── */
    const sent = await postSms({ receiver: rcvList, msg: msg, title: title, msgType: msgType });
    if (!sent.ok) {
      return fail(res, 500, '문자 설정이 아직 안 됐어요. 관리자에게 알려 주세요.');
    }
    return res.status(200).json(sent.data);
  } catch (e) {
    /* 자세한 내용은 서버 로그에만 — 번호·본문·키는 적지 않는다 */
    console.log('[send-sms] 실패');
    return fail(res, 500, '문자를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
}
