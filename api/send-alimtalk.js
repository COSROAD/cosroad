export default async function handler(req, res) {
  // CORS 설정 (모든 출처 허용 - 카카오톡 인앱 브라우저 등 대응)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // biz(업종), courier(택배사코드), invoice(송장번호) 추가 수신
  const b = req.body || {};
  const { tpl_code, receiver, name, message, biz, courier, invoice } = b;

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
