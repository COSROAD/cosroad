// COSROAD — 알리고 호출 **한 벌** (v319 · 코스로드74-B)
//
// 왜 — 알리고가 **고정 IP만** 받게 바뀌었다. Vercel 함수는 나가는 IP 가 바뀌므로 등록해 둔 IP
//   넷이 모두 「신청 필요」가 되었다. 그래서 가비아에 **중계 서버**(공인 IP 하나)를 두고
//   알리고 호출만 그 길로 보낸다 → 알리고가 보는 IP 는 **늘 같다**.
//
// ★★ **부르는 자리는 셋뿐이다**(74-A 조사 · 전수):
//     ① `lib/otp-core.js`      aligoSend()    — 인증번호 문자
//     ② `lib/sms-core.js`      postSms()      — 공지·«알림장»·출석·하원 문자
//     ③ `lib/alimtalk-core.js` postAlimtalk() — 알림톡
//   셋이 **이 한 벌**을 부른다. 복사해 두면 한쪽만 고쳐져 어긋난다(`lib/otp-core.js` 교훈).
//
// ★★ **`Content-Type` 은 자리마다 원래 값 그대로** 넘긴다 —
//   ①②는 `application/x-www-form-urlencoded;charset=UTF-8`, ③은 `application/x-www-form-urlencoded`
//   (charset 없음)이다. 하나로 통일하면 알리고 쪽에서 글자가 깨질 수 있다(74-A 1절 ★).
//
// ★★ **응답은 손대지 않는다** — `fetch` 가 돌려준 것을 **그대로** 돌려준다(교훈 ⑳).
//   부르는 쪽이 지금처럼 `r.json()` 을 부르고 `result_code` 를 본다 → 세 자리의 셈이 안 바뀐다.
//
// ★ **되돌리기**: Vercel 에서 `ALIGO_RELAY_URL` 을 지우면 **지금처럼 바로** 알리고로 간다.
//   (단 알리고가 Vercel IP 를 막고 있으면 그 길은 안 나간다.)
//
// ★★ **다시 보내지 않는다(재시도 0)** — 문자는 두 번 보내면 **두 번 간다**(되돌릴 수 없다).
//   시간이 넘으면 던지고, 부르는 쪽이 「보내지 못했어요」로 끝낸다. 다시 보낼지는 **사람이** 정한다.
//
// ★ 키·토큰 원문은 로그에 적지 않는다(절대규칙 1).

/* 알리고 본래 주소 — **중계를 안 쓸 때** 쓰는 그 주소다(지금까지와 같다) */
export const ALIGO_DIRECT = {
  sms:      'https://apis.aligo.in/send/',
  alimtalk: 'https://kakaoapi.aligo.in/akv10/alimtalk/send/'
};
/* 중계 서버의 경로 — 보낼 곳은 **중계 쪽 코드에 박혀** 있다(열린 프록시가 아니다) */
export const RELAY_PATH = { sms: '/a/sms', alimtalk: '/a/alimtalk' };
/* 20초 — 알리고가 늦으면 포기한다(Vercel 함수 제한보다 짧게) */
export const ALIGO_TIMEOUT_MS = 20000;

/* 중계를 쓰는가 — `ALIGO_RELAY_URL` 이 있으면 쓴다(끝의 `/` 는 떼어 둔다) */
export function relayBase() {
  return String(process.env.ALIGO_RELAY_URL || '').trim().replace(/\/+$/, '');
}

/* 보낼 주소 한 자리 — 묶음이 이것으로 「어디로 가는가」를 잰다 */
export function aligoUrl(kind) {
  const k = (kind === 'alimtalk') ? 'alimtalk' : 'sms';
  const base = relayBase();
  return base ? (base + RELAY_PATH[k]) : ALIGO_DIRECT[k];
}

/* 알리고(또는 중계)로 보낸다.
   kind  : 'sms' | 'alimtalk'
   body  : `form.toString()` — **부르는 쪽이 만든 글자 그대로** 보낸다
   ctype : 그 자리가 쓰던 `Content-Type` 값 **그대로**
   반환  : `fetch` 의 응답 객체 **그대로**(부르는 쪽이 `r.json()` 을 부른다) */
export async function aligoFetch(kind, body, ctype) {
  const base = relayBase();
  const headers = { 'Content-Type': String(ctype || 'application/x-www-form-urlencoded') };
  if (base) headers['X-Relay-Token'] = String(process.env.ALIGO_RELAY_TOKEN || '');
  return await fetch(aligoUrl(kind), {
    method: 'POST',
    headers: headers,
    body: body,
    signal: AbortSignal.timeout(ALIGO_TIMEOUT_MS)
  });
}
