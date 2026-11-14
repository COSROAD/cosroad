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

/* 업종별 템플릿코드 — 앱 `BIZ_TEMPLATE_CODES` 와 **같은 값**이어야 한다
   (서버가 아는 목록은 `lib/send-guard.js TPL_ALLOWED` 하나다 — 그 안에 있어야 나간다). */
/* ★ 앱 `BIZ_TEMPLATE_CODES`(index.html)와 **글자까지 같아야 한다** — 처음에 다른 값을 적었다가
   묶음·대조로 잡았다. 바꿀 때는 **셋을 같이** 본다: 여기 · 앱 · `send-guard.js TPL_ALLOWED`. */
export const TPL_BY_BIZ = {
  academy:   'UI_7310',
  logistics: 'UI_7550',
  public:    'UI_7542',
  delivery:  'UI_7257'
};
/* ★★ v319(73-B): **하원(귀가) 알림 템플릿 자리** — 지금은 **빈 값**이다(심사 중).
   ★ 빈 값이면 하원 알림은 **문자**로 간다(`buildLeaveSmsText`) — 서버가 그렇게 갈라 부른다.
   ★★ 승인 코드가 들어오면 **고칠 곳은 여기 두 줄뿐이다** — 하원 알림은 **서버가 직접**
     `postAlimtalk()` 로 보내므로 `api/send-alimtalk.js` 창구를 지나지 않고,
     따라서 `lib/send-guard.js` 의 `TPL_ALLOWED` 도 **앱이 보내는 코드 목록**이라 상관이 없다
     (앱이 하원 알림을 보내는 길은 **0개**다 — `tests/leave73.js` ⑧ 이 지킨다).
     ★ 나중에 **앱도** 이 템플릿으로 보내게 되면 그때 `TPL_ALLOWED` 와 앱의 코드 목록까지
       **셋을 같이** 고쳐야 한다(v297 에 한 번 틀렸다 — CLAUDE.md 출석 알림톡 쪽지). */
export const TPL_LEAVE_BY_BIZ = {
  academy: '',
  public:  ''
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
  const btn = buttonFor(opts.biz, opts.courier, opts.invoice);
  if (btn) f.append('button_1', JSON.stringify(btn));
  return f;
}

/* 실제 호출 — **한 자리**. 보낸 결과(알리고 응답)를 그대로 돌려준다. */
export async function postAlimtalk(form) {
  const r = await fetch('https://kakaoapi.aligo.in/akv10/alimtalk/send/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  return await r.json();
}
