export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', 'https://cosroad.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // biz(업종) 추가 수신
  const { apikey, userid, senderkey, tpl_code, sender, receiver, name, message, biz } = req.body;
  if (!apikey || !userid || !senderkey || !tpl_code || !sender || !receiver) {
    return res.status(400).json({ error: '필수 파라미터 누락 (sender 발신번호 포함 확인)' });
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

    // 학원(academy)만 패밀리링크 버튼 추가. 나머지 업종은 버튼 없음.
    if (biz === 'academy' || !biz) {
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
    }

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
