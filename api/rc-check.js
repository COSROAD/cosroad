// 서버 설정 진단. 값은 절대 보여주지 않고, 있는지/작동하는지만 알려줍니다.
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const has = (v) => (v && String(v).trim().length > 0);
  const out = {
    ok: true,
    설명: 'true = 정상 / false = 문제. 값 자체는 표시하지 않습니다.',
    알리고: {
      ALIGO_KEY:        has(process.env.ALIGO_KEY),
      ALIGO_USER_ID:    has(process.env.ALIGO_USER_ID),
      ALIGO_SENDER:     has(process.env.ALIGO_SENDER),
      ALIGO_SENDER_KEY: has(process.env.ALIGO_SENDER_KEY)
    },
    로드크루_서비스계정: {
      RC_SA_EMAIL: has(process.env.RC_SA_EMAIL),
      RC_SA_KEY:   has(process.env.RC_SA_KEY)
    },
    로드크루_티맵키: has(process.env.RC_TMAP_KEY),
    서버위치: process.env.VERCEL_REGION || '(모름)',
  };

  /* 티맵 호출은 중단했습니다 (SK 차단 의심). 설정 확인만 합니다. */
  out.티맵 = { 호출시험: "중단됨", 키있음: has(process.env.RC_TMAP_KEY) };

  return res.status(200).json(out);
}
