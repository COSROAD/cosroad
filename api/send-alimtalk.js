export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://cosroad.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
  const { keyword, appKey } = req.query;
  const r = await fetch(
    `https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=${encodeURIComponent(keyword)}&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=1&appKey=${appKey}`
  );
  const data = await r.json();
  return res.status(200).json(data);
}
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apikey, userid, senderkey, tpl_code, receiver, name, message, button_url } = req.body;

  if (!apikey || !userid || !senderkey || !tpl_code || !receiver) {
    return res.status(400).json({ error: '필수 파라미터 누락' });
  }

  try {
    const formData = new URLSearchParams();
    formData.append('apikey', apikey);
    formData.append('userid', userid);
    formData.append('senderkey', senderkey);
    formData.append('tpl_code', tpl_code);
    formData.append('sender', '01036603911');
    formData.append('receiver_1', receiver);
    formData.append('recvname_1', name || '');
    formData.append('subject_1', '출석 알림');
    formData.append('message_1', message || '');

    if (button_url) {
      formData.append('button_1', JSON.stringify({
        button: [{
          name: '패밀리링크 열기',
          linkType: 'WL',
          linkTypeName: '웹링크',
          linkMo: button_url,
          linkPc: button_url
        }]
      }));
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


