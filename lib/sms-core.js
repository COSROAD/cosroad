// COSROAD — 문자(SMS/LMS) 공용 한 벌 (v319 · 코스로드73-B)
//
// ★★ 왜 서버에도 두는가 — v311(68 보정2)은 **앱 쪽 출구 둘**(`smsOpen`·`doSendNoticeMessage`)에만
//   그림 글자 거르기를 넣었다. 73-B 부터 **서버가 직접** 문자를 보낸다(하원 알림 — 출석 전용 기기는
//   번호를 모르고, 관리자 판도 같은 글이어야 한다). 서버에 거르기가 없으면 그 글이 「?」로 나간다
//   (문자는 EUC-KR 로 실려 간다 — 그 글자표에 없는 글자는 전부 「?」).
// ★★ 표(`SMS_SAFE_MAP`)는 **앱 `index.html` 과 글자까지 같아야 한다** — 두 벌로 베끼면 한쪽만
//   고쳐져 어긋난다(`lib/otp-core.js` 교훈). `tests/leave73.js` 가 **두 표를 맞대어** 지킨다.
// ★ `api/send-sms.js` 도 이 한 벌을 쓴다 — 앱이 빠뜨린 자리도 서버가 한 번 더 막는다.
// ★ 번호·본문·키 원문은 응답에도 로그에도 넣지 않는다.

/* 「가리키는」 표시는 ▶ · 「줄 머리」 표시는 - · 꾸밈은 뺀다 (앱과 같은 표) */
export const SMS_SAFE_MAP = {
  '👉': '▶', '📷': '▶', '📩': '▶', '🔗': '▶', '▶️': '▶',
  '👤': '-', '⏰': '-', '✅': '-', '📅': '-', '📚': '-', '🏠': '-', '📍': '-', '🕘': '-',
  '🚐': '-', '🏢': '-', '🏫': '-', '🎒': '-', '🚚': '-', '💰': '-', '🔔': '-', '📊': '-',
  '📝': '-', '📄': '-', '🔒': '-', '💬': '-', '🙏': '-', '😊': '', '👍': ''
};

/* 문자로 실릴 수 있게 다듬는다 — **앱 `smsSafe()` 와 같은 순서·같은 규칙**이다.
   ① 줄 머리의 그림 글자는 표대로 기호로 바꾼다(들여쓰기는 지킨다)
   ② 남은 그림 글자는 **뺀다**(문자에 실리는 기호 `▶ ※ ━ ♥ ★ ■ ● ◆ ☎ → ①` 는 건드리지 않는다)
   ③ 글 가운데에서 글자를 뺀 자리에 생긴 겹친 공백만 하나로(줄 머리 들여쓰기는 그대로) */
export function smsSafe(text) {
  let s = String(text == null ? '' : text);
  const keys = Object.keys(SMS_SAFE_MAP);
  s = s.split('\n').map((line) => {
    const pad = (line.match(/^[ \t]*/) || [''])[0];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (line.slice(pad.length).indexOf(k) === 0) {
        return pad + SMS_SAFE_MAP[k] + line.slice(pad.length + k.length);
      }
    }
    return line;
  }).join('\n');
  s = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')      /* U+10000~ (그림 글자 대부분) */
       .replace(/[⌀-⏿✀-➿⬀-⯿]/g, '')  /* ⏰ ✅ ⬆ 같은 것 */
       .replace(/[︀-️‍⃣]/g, '')         /* 꾸밈·이어붙임 글자 */
       .replace(/[ \t]+$/gm, '')
       .replace(/(\S)[ \t]{2,}/g, '$1 ');
  return s;
}

/* 알리고 문자 보내기 — `api/send-sms.js` 가 하던 그 호출을 한 자리로 모은 것이다.
   ★ 본문·제목은 **여기서 `smsSafe` 를 한 번 더** 지난다(부르는 쪽이 빠뜨려도 막힌다).
   ★ 설정(환경변수)이 없으면 보내지 않고 `{ ok:false, why:'nokey' }` 를 돌려준다. */
export async function postSms({ receiver, msg, title, msgType }) {
  const apikey = process.env.ALIGO_KEY;
  const userid = process.env.ALIGO_USER_ID;
  const sender = process.env.ALIGO_SENDER;
  if (!apikey || !userid || !sender) return { ok: false, why: 'nokey' };
  const to = Array.isArray(receiver) ? receiver.join(',') : String(receiver || '');
  if (!to) return { ok: false, why: 'norcv' };
  const form = new URLSearchParams();
  form.append('key', apikey);
  form.append('user_id', userid);
  form.append('sender', sender);
  form.append('receiver', to);
  form.append('msg', smsSafe(msg));
  if (title) form.append('title', smsSafe(title));
  form.append('msg_type', String(msgType || 'LMS'));
  const r = await fetch('https://apis.aligo.in/send/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: form.toString()
  });
  const data = await r.json();
  return { ok: true, data: data };
}
