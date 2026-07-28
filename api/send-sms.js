// COSROAD - 알리고 문자(SMS/LMS) 발송 중계 함수
// Vercel: api/send-sms.js 로 저장하세요 (기존 send-alimtalk.js 와 같은 api/ 폴더)
// 앱 -> 이 함수 -> 알리고 /send/ API
// 알림장 본문 + 사진 링크(URL)를 LMS로 보냅니다.

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

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ result_code: -1, message: 'POST만 허용됩니다.' });
  if (!ALLOWED.includes(origin)) {
    return res.status(403).json({ result_code: -1, message: '허용되지 않은 출처입니다.' });
  }

  try {
    const b = req.body || {};
    const { receiver, msg, title, msg_type, testmode_yn } = b;

    /* 형식 검증 — 조직 확인은 이 서버에서 불가(COSROAD Firestore 관리자 연결 없음)하므로 최소 방어 */
    const rcvList = String(receiver || '').split(',').map(function (r) { return r.replace(/-/g, '').trim(); }).filter(Boolean);
    if (!rcvList.length || rcvList.length > 50 || !rcvList.every(function (r) { return /^0\d{8,10}$/.test(r); })) {
      return res.status(400).json({ result_code: -1, message: '수신번호 형식이 올바르지 않습니다.' });
    }
    if (String(msg || '').length > 2000) {
      return res.status(400).json({ result_code: -1, message: '본문이 너무 깁니다 (2000자 이내).' });
    }

    // 알리고 인증정보는 서버(Vercel 환경변수) 우선. 브라우저의 옛 키를 쓰지 않는다.
    const apikey = process.env.ALIGO_KEY     || b.apikey;
    const userid = process.env.ALIGO_USER_ID || b.userid;
    const sender = process.env.ALIGO_SENDER  || b.sender;

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
