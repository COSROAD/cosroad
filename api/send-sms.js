// COSROAD - 알리고 문자(SMS/LMS) 발송 중계 함수
// Vercel: api/send-sms.js 로 저장하세요 (기존 send-alimtalk.js 와 같은 api/ 폴더)
// 앱 -> 이 함수 -> 알리고 /send/ API
// 알림장 본문 + 사진 링크(URL)를 LMS로 보냅니다.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ result_code: -1, message: 'POST만 허용됩니다.' });

  try {
    const { apikey, userid, sender, receiver, msg, title, msg_type, testmode_yn } = req.body || {};

    if (!apikey || !userid || !sender || !receiver || !msg) {
      return res.status(400).json({ result_code: -1, message: '필수 항목 누락 (apikey, userid, sender, receiver, msg)' });
    }

    const form = new URLSearchParams();
    form.append('key', apikey);
    form.append('user_id', userid);
    form.append('sender', sender);
    form.append('receiver', receiver);
    form.append('msg', msg);
    if (title) form.append('title', title);
    form.append('msg_type', msg_type || 'LMS');
    if (testmode_yn) form.append('testmode_yn', testmode_yn);

    const aligoRes = await fetch('https://apis.aligo.in/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form.toString()
    });

    const data = await aligoRes.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ result_code: -1, message: '서버 오류: ' + (e && e.message ? e.message : String(e)) });
  }
}
