// 서버에 알리고 설정이 들어있는지 확인만 하는 함수.
// 값은 절대 보여주지 않고, 있는지 없는지(true/false)만 알려줍니다.
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const has = (v) => (v && String(v).trim().length > 0);
  return res.status(200).json({
    ok: true,
    설명: 'true = 서버에 값이 있음 / false = 없음. 값 자체는 표시하지 않습니다.',
    ALIGO_KEY:        has(process.env.ALIGO_KEY),
    ALIGO_USER_ID:    has(process.env.ALIGO_USER_ID),
    ALIGO_SENDER:     has(process.env.ALIGO_SENDER),
    ALIGO_SENDER_KEY: has(process.env.ALIGO_SENDER_KEY),
    RC_SA_EMAIL:      has(process.env.RC_SA_EMAIL),
    RC_SA_KEY:        has(process.env.RC_SA_KEY),
    길이: {
      ALIGO_KEY:        (process.env.ALIGO_KEY || '').trim().length,
      ALIGO_SENDER_KEY: (process.env.ALIGO_SENDER_KEY || '').trim().length,
      ALIGO_SENDER:     (process.env.ALIGO_SENDER || '').trim().length
    }
  });
}
