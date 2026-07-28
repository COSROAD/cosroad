/* 발송 API 보호 — 돈 나가는 구멍 막기
   허용 목록 밖 출처(주소 없음 = curl 등 포함)의 요청은 발송을 거부한다.
   cosroad.vercel.app 은 앱 실서비스 주소(카카오톡 인앱 브라우저 포함) —
   빠지면 정상 발송이 막힌다 (rc-quick 9401 때와 같은 함정). */
const ALLOWED = ['https://roadjob.co.kr', 'https://www.roadjob.co.kr', 'https://cosroad.com', 'https://www.cosroad.com', 'https://roadcrew.kr', 'https://cosroad.vercel.app'];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED.includes(origin) ? origin : ALLOWED[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!ALLOWED.includes(origin)) {
    return res.status(403).json({ error: '허용되지 않은 출처입니다.' });
  }
  // biz(업종), courier(택배사코드), invoice(송장번호) 추가 수신
  const b = req.body || {};
  const { tpl_code, receiver, name, message, biz, courier, invoice } = b;

  /* 형식 검증 — 조직 확인은 이 서버에서 불가(COSROAD Firestore 관리자 연결 없음)하므로 최소 방어 */
  if (receiver && !/^0\d{8,10}$/.test(String(receiver).replace(/-/g, '').trim())) {
    return res.status(400).json({ error: '수신번호 형식이 올바르지 않습니다.' });
  }
  if (tpl_code && !/^[A-Za-z]{1,4}_?\d{3,6}$/.test(String(tpl_code))) {
    return res.status(400).json({ error: '템플릿코드 형식이 올바르지 않습니다.' });
  }
  if (String(message || '').length > 1000) {
    return res.status(400).json({ error: '본문이 너무 깁니다 (1000자 이내).' });
  }

  // 알리고 인증정보는 서버(Vercel 환경변수)에서 가져온다.
  // 브라우저가 보낸 값은 옛 키일 수 있으므로 환경변수가 있으면 그것을 우선한다.
  const apikey    = process.env.ALIGO_KEY        || b.apikey;
  const userid    = process.env.ALIGO_USER_ID    || b.userid;
  const senderkey = process.env.ALIGO_SENDER_KEY || b.senderkey;
  const sender    = process.env.ALIGO_SENDER     || b.sender;

  /* 무엇이 빠졌는지 정확히 알려준다 (값 자체는 절대 노출하지 않는다) */
  const missing = [];
  if (!apikey)    missing.push('ALIGO_KEY(서버)');
  if (!userid)    missing.push('ALIGO_USER_ID(서버)');
  if (!senderkey) missing.push('ALIGO_SENDER_KEY(서버)');
  if (!sender)    missing.push('ALIGO_SENDER(서버)');
  if (!tpl_code)  missing.push('템플릿코드(앱)');
  if (!receiver)  missing.push('받는번호(앱)');
  if (missing.length) {
    return res.status(400).json({
      error: '누락: ' + missing.join(', '),
      env: {
        ALIGO_KEY:        !!process.env.ALIGO_KEY,
        ALIGO_USER_ID:    !!process.env.ALIGO_USER_ID,
        ALIGO_SENDER:     !!process.env.ALIGO_SENDER,
        ALIGO_SENDER_KEY: !!process.env.ALIGO_SENDER_KEY
      }
    });
  }
  try {
    const formData = new URLSearchParams();
    formData.append('apikey', apikey);
    formData.append('userid', userid);
    formData.append('senderkey', senderkey);
    formData.append('tpl_code', tpl_code);
    formData.append('sender', sender);
    formData.append('receiver_1', receiver);
    formData.append('recvname_1', name || '');
    formData.append('subject_1', '알림');
    formData.append('message_1', message || '');

    // 업종별 버튼 처리
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
      // 1) 배송조회 버튼 (DS: 배송조회 타입)
      const dsBtn = {
        name: '배송조회',
        linkType: 'DS',
        linkTypeName: '배송조회'
      };
      if (courier) dsBtn.prtcl = courier;      // 택배사 코드
      if (invoice) dsBtn.invoice = invoice;    // 송장번호
      buttons.push(dsBtn);
      // 2) CJ대한통운 배송조회 (웹링크)
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
    return res.status(500).json({ error: error.message });
  }
}
