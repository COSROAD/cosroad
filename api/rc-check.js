// 서버 설정 진단. 값은 절대 보여주지 않고, 있는지/작동하는지만 알려줍니다.
export default async function handler(req, res) {
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

  /* 티맵 확인 — ?tmap=1 을 붙였을 때만 딱 한 번 호출합니다 */
  if (req.query && req.query.tmap === '1') {
    const KEY = (process.env.RC_TMAP_KEY || '').trim();
    try {
      const r = await fetch(
        'https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=' + encodeURIComponent('연수구청')
        + '&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=1&appKey=' + KEY
      );
      const t = await r.text();
      let poi = null;
      if (r.status === 200) { try { poi = JSON.parse(t).searchPoiInfo?.pois?.poi?.[0]; } catch(e){} }
      out.티맵 = { 주소검색: !!poi, 찾은곳: poi ? poi.name : null, 상태: r.status,
                   오류: poi ? null : t.slice(0, 130) };
    } catch (e) { out.티맵 = { 오류: String(e && e.message) }; }
  } else {
    out.티맵 = { 호출시험: '생략됨 (?tmap=1 을 붙이면 확인)', 키있음: has(process.env.RC_TMAP_KEY) };
  }

  return res.status(200).json(out);
}
