// COSROAD — 알림톡 **한 벌** (v297 · 60-B4b)
//
// ★★ 왜 모았나 — 60-B4b 의 **출석 전용 기기**는 명단을 받지 않으므로(사장님 결정 2)
//   받는 번호를 모른다. 그래서 출석 알림톡을 **서버가** 보내야 한다.
//   그때 본문·템플릿코드·알리고 호출을 `api/send-alimtalk.js` 와 **따로 적으면**
//   두 곳이 어긋난다(otp-core·send-guard 를 한 벌로 모은 것과 **같은 까닭**).
//   → 본문 만들기·템플릿 고르기·알리고 호출을 이 파일 하나에 두고 **둘이 같이 부른다.**
//
// ★ `api/` **밖**에 둔다 — `api/` 안의 파일은 그 자체가 함수 주소로 열린다
//   (Vercel 공식 문서: "Keep shared utilities and route modules outside `api/`").
//
// ★★ 본문 글은 **여기 하나**다 — v296 까지는 앱(`index.html buildAlimtalkMessage`)이
//   만들어 `message` 로 보냈다. 지금도 **앱이 보낸 본문이 있으면 그것을 그대로 쓴다**
//   (배포 직후 남아 있는 옛 앱이 그 길로 보낸다 · 글자는 같다). 없으면 여기서 만든다.
//
// ★ 번호·본문·키 원문은 응답에도 로그에도 넣지 않는다.

import { aligoFetch } from './aligo-fetch.js';

/* 업종별 템플릿코드 — 앱 `BIZ_TEMPLATE_CODES` 와 **같은 값**이어야 한다
   (서버가 아는 목록은 `lib/send-guard.js TPL_ALLOWED` 하나다 — 그 안에 있어야 나간다). */
/* ★ 앱 `BIZ_TEMPLATE_CODES`(index.html)와 **글자까지 같아야 한다** — 처음에 다른 값을 적었다가
   묶음·대조로 잡았다. 바꿀 때는 **셋을 같이** 본다: 여기 · 앱 · `send-guard.js TPL_ALLOWED`.
   ★★ **「셋」은 「앱이 보내는 코드」에만 해당한다** — 아래 `TPL_LEAVE_BY_BIZ`(귀가 `UN_7423`
     ·`UN_7424`)는 **서버만** 보내므로 앱·`TPL_ALLOWED` 에 **없는 것이 맞다**(넣으면 앱이 그
     템플릿으로 보낼 수 있게 되어 v319 의 약속 「앱이 하원 알림을 보내는 길 0」이 깨진다).
     `tests/leave76.js` ⑧ 이 **앱·`TPL_ALLOWED` 에 귀가 코드가 0회**임을 지킨다. */
export const TPL_BY_BIZ = {
  academy:   'UI_7310',
  logistics: 'UI_7550',
  public:    'UI_7542',
  delivery:  'UI_7257'
};
/* ★★ v321(76): **하원(귀가) 알림 템플릿 — 승인됐다.** v319~v320 은 빈 값이라 문자로만 갔다.
   | 업종 | 코드 | 템플릿명 | 단추 |
   | academy | `UN_7423` | 코스로드 학원 귀가 알림 | **없음** |
   | public  | `UN_7424` | 코스로드 공공 귀가 알림 | **없음** |
   ★ 승인 본문은 `buildLeaveMessage` 와 **글자까지 같다** — 드라이브 신청 글
     (`귀가알림_알림톡템플릿_신청글.md`)과 맞대어 확인했다(학원 261바이트·9줄 · 공공 308·11 ·
     `tests/leave76.js` ⑥ 이 매번 다시 잰다). **한 글자도 바꾸지 말 것** — 다르면 카카오가 거절한다.
   ★★ **단추 없음으로 승인됐다** → 하원 길은 `alimtalkForm({ …, noButton:true })` 로 부른다.
     안 그러면 `buttonFor('academy')` 가 「패밀리 링크 열기」를 붙여 **템플릿 불일치로 거절**된다.
   ★ 빈 값으로 되돌리면 다시 **문자**로 간다(`buildLeaveSmsText`) — 되돌릴 길이다.
   ★★ **왜 앱(`BIZ_TEMPLATE_CODES`)·`TPL_ALLOWED` 에는 이 두 코드가 없는가** —
     하원 알림은 **서버가 직접** `postAlimtalk()` 로 보내고 `api/send-alimtalk.js` 창구를
     지나지 않는다. 그 둘은 **앱이 보내는 코드 목록**이므로 상관이 없다
     (앱이 하원 알림을 보내는 길은 **0개**다 — `tests/leave73.js` ⑧ 이 지킨다).
     ★ 나중에 **앱도** 이 템플릿으로 보내게 되면 그때 `TPL_ALLOWED` 와 앱의 코드 목록까지
       **셋을 같이** 고쳐야 한다(v297 에 한 번 틀렸다 — CLAUDE.md 출석 알림톡 쪽지). */
export const TPL_LEAVE_BY_BIZ = {
  academy: 'UN_7423',
  public:  'UN_7424'
};
export function tplLeaveCodeFor(biz) {
  return TPL_LEAVE_BY_BIZ[String(biz || 'academy')] || '';
}

/* 하원 알림 **알림톡 본문** — 신청글(`귀가알림_알림톡템플릿_신청글.md`)과 글자·줄바꿈이 같다.
   ⚠️ 승인되면 **이 글자 그대로** 나가야 발송된다(한 글자도 바꾸지 말 것). */
export function buildLeaveMessage(biz, orgName, name, timeStr) {
  orgName = String(orgName || ''); name = String(name || ''); timeStr = String(timeStr || '');
  if (biz === 'public') {
    return '[' + orgName + '] 회원님 귀가 알림\n━━━━━━━━━\n👤 이름: ' + name
         + '\n⏰ 귀가: ' + timeStr + '\n✅ 보호자님! 회원님이\n     오늘 이용을 마치고\n     센터를 나섰습니다.'
         + '\n━━━━━━━━━\n♥ 회원님의 안전한\n    귀가까지\n    함께하겠습니다.♥';
  }
  return '[' + orgName + '] 귀가 알림\n━━━━━━━━━\n👤 이름: ' + name
       + '\n⏰ 귀가: ' + timeStr + '\n✅ 오늘 수업을 마치고\n      학원을 나섰습니다.'
       + '\n━━━━━━━━━\n♥.♥안전한 귀가까지\n        함께하겠습니다.♥.♥';
}
/* 하원 알림 **문자 본문**(승인 전 길) — 뜻은 위와 같고 **그림 글자가 없다**.
   ★ `lib/sms-core.js smsSafe()` 가 한 번 더 지나므로 섞여도 「?」로 안 나가지만,
     **처음부터 넣지 않는다**(문자는 EUC-KR · v311). 줄 머리는 `-`, 꾸밈은 `♥`·`━` 만. */
export function buildLeaveSmsText(biz, orgName, name, timeStr) {
  orgName = String(orgName || ''); name = String(name || ''); timeStr = String(timeStr || '');
  const who = (biz === 'public')
    ? '- 오늘 이용을 마치고 센터를 나섰습니다.'
    : '- 오늘 수업을 마치고 학원을 나섰습니다.';
  const head = (biz === 'public') ? '] 회원님 귀가 알림' : '] 귀가 알림';
  return '[' + orgName + head + '\n━━━━━━━━━\n- 이름: ' + name
       + '\n- 귀가: ' + timeStr + '\n' + who
       + '\n━━━━━━━━━\n♥ 안전한 귀가까지 함께하겠습니다. ♥';
}

export function tplCodeFor(biz) {
  return TPL_BY_BIZ[String(biz || 'academy')] || TPL_BY_BIZ.academy;
}

/* 알림톡 본문 — 앱이 v296 까지 만들던 글과 **글자까지 같다**(옮겨 온 것이다). */
export function buildAlimtalkMessage(biz, orgName, name, timeStr, invoice, courier) {
  orgName = String(orgName || ''); name = String(name || ''); timeStr = String(timeStr || '');
  if (biz === 'logistics') {
    return '📦 물류\n[' + orgName + '] 납품 완료 알림\n━━━━━━━━━\n🏢 거래처: ' + name
         + '\n⏰ 완료: ' + timeStr + '\n✅ 사장님! 주문 상품이 \n      정상적으로 납품완료.'
         + '\n━━━━━━━━━\n☎  상품 주문 해주셔서 \n      감사 드립니다.';
  } else if (biz === 'public') {
    return '[' + orgName + '] 회원님 도착 알림\n━━━━━━━━━\n👤 이름: ' + name
         + '\n⏰ 도착: ' + timeStr + '\n✅ 보호자님! 회원님이 \n     센터에 안전하게  \n     도착했습니다.'
         + '\n━━━━━━━━━ \n♥ 회원님의 안전한 \n    귀가까지 \n    함께하겠습니다.♥';
  } else if (biz === 'delivery') {
    const courierNames = { '04': 'CJ대한통운', '05': '한진택배', '08': '롯데택배', '01': '우체국택배', '06': '로젠택배' };
    const courierLabel = courierNames[String(courier || '')] || '택배';
    return '🚚 택배\n[' + courierLabel + '] 배송 완료 알림\n━━━━━━━━━\n📦 받는분: ' + name
         + '\n⏰ 완료: ' + timeStr + '\n✅고객님! 주문하신 \n     상품이 정상적으로 \n     배송되었습니다.'
         + '\n━━━━━━━━━\n등기번호(운송장번호)\n: ' + String(invoice || '') + '';
  }
  // academy(학원, 기본)
  return '[' + orgName + '] 출석 알림\n━━━━━━━━━\n👤 이름: ' + name + '\n⏰ 도착: ' + timeStr
       + '\n✅ 학원에 안전하게 \n      도착했습니다.\n━━━━━━━━━\n♥.♥안전한 귀가까지 \n        함께하겠습니다.';
}

/* 업종별 버튼 — v265 까지와 같다(학원=패밀리링크 · 택배=배송조회 · 물류·공공 없음) */
export function buttonFor(biz, courier, invoice) {
  if (biz === 'academy' || !biz) {
    return { button: [{ name: '패밀리 링크 열기', linkType: 'WL', linkTypeName: '웹링크',
                        linkMo: 'https://families.google.com', linkPc: 'https://families.google.com' }] };
  }
  if (biz === 'delivery') {
    const dsBtn = { name: '배송조회', linkType: 'DS', linkTypeName: '배송조회' };
    if (courier) dsBtn.prtcl = String(courier);
    if (invoice) dsBtn.invoice = String(invoice);
    return { button: [dsBtn, { name: 'CJ대한통운 배송조회', linkType: 'WL', linkTypeName: '웹링크',
      linkMo: 'https://www.cjlogistics.com/ko/tool/parcel/tracking',
      linkPc: 'https://www.cjlogistics.com/ko/tool/parcel/tracking' }] };
  }
  return null;
}

/* 알리고에 보낼 몸통 — 호출 자리를 한 벌로 두어 두 창구가 같은 모양으로 보낸다.
   ★ 환경변수가 없으면 `null` 을 돌려준다(부르는 쪽이 「설정 안 됐다」를 답한다). */
export function alimtalkForm(opts) {
  const apikey    = process.env.ALIGO_KEY;
  const userid    = process.env.ALIGO_USER_ID;
  const senderkey = process.env.ALIGO_SENDER_KEY;
  const sender    = process.env.ALIGO_SENDER;
  if (!apikey || !userid || !senderkey || !sender) return null;
  const f = new URLSearchParams();
  f.append('apikey', apikey);
  f.append('userid', userid);
  f.append('senderkey', senderkey);
  f.append('tpl_code', String(opts.tplCode || ''));
  f.append('sender', sender);
  f.append('receiver_1', String(opts.receiver || ''));
  f.append('recvname_1', String(opts.name || ''));
  f.append('subject_1', '알림');
  f.append('message_1', String(opts.message || ''));
  /* ★★ v321(76): **`noButton` 이면 단추를 안 붙인다.** 하원(귀가) 템플릿 `UN_7423`·`UN_7424`
     는 **단추 없음**으로 승인됐는데, `buttonFor('academy')` 가 「패밀리 링크 열기」를 붙이고
     있었다 → 카카오가 **템플릿 불일치로 거절**한다(발송 0 · v319·v320 에는 코드가 빈 값이라
     드러나지 않았다). 알리고 공식 [Notice] 도 「템플릿에 추가하지 않은 버튼에 대한 정보는
     삭제하셔도 무방합니다」라고 적는다.
     ★ 출석(`UI_7310`…)·하차 템플릿은 **단추가 승인돼 있다** → 그 길은 종전 그대로다
       (`noButton` 을 주지 않는다 · `tests/leave76.js` ③ 이 그 둘을 함께 지킨다). */
  const btn = opts.noButton ? null : buttonFor(opts.biz, opts.courier, opts.invoice);
  if (btn) f.append('button_1', JSON.stringify(btn));
  return f;
}

/* ★★ v321(76): **알리고가 정말 받았는가** — 알림톡 판정 **한 자리**.
   공식 문서(https://smartsms.aligo.in/alimapi.html) 「알림톡 전송이 성공하였을 경우」 예시:
     { "code": 0, "message": "성공적으로 전송요청 하였습니다.", "info": { … } }
   → **`code === 0` 만 성공**이다.
   ★★ **문자(SMS)와 규칙이 다르다** — 문자는 `result_code` 이고 **0 보다 크면** 성공이다
     (공식 문자 문서: 성공 예시 `"result_code": 1` · 「결과 메시지( result_code 가 0 보다
     작은경우 실패사유 표기)」 · 실패 예시 `-101`). 판정은 `lib/sms-core.js smsOk()` 가 한다.
     **두 규칙을 섞으면 거꾸로 판정한다** — 그래서 각자 제 파일에 두었다.
   ★ v320 까지 서버 쪽 세 자리가 **응답을 아예 안 보고** 성공으로 쳤다(그래서 알리고가 거절해도
     문자로 떨어지지 않았다) — `api/driver-auth.js` 하원 알림톡·하원 문자·출석 기기 알림톡. */
export function atOk(data) {
  return !!data && Number(data.code) === 0;
}

/* 실제 호출 — **한 자리**. 보낸 결과(알리고 응답)를 그대로 돌려준다.
   ★★ v319(74-B): 나가는 길은 **`lib/aligo-fetch.js` 한 벌**이 정한다 —
     `ALIGO_RELAY_URL` 이 있으면 중계 서버(고정 IP)로,
     없으면 `https://kakaoapi.aligo.in/akv10/alimtalk/send/` 로 그대로.
   ★ `Content-Type` 은 **여기 있던 값 그대로**다 — 문자 쪽(①②)과 달리 **`;charset=UTF-8` 이 없다.**
     하나로 통일하지 말 것(74-A 1절 ★). */
export async function postAlimtalk(form) {
  const r = await aligoFetch('alimtalk', form.toString(),
                             'application/x-www-form-urlencoded');
  return await r.json();
}
