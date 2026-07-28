export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { query, type, x, y } = req.query;
  if (!query) { res.status(400).json({ error: 'query 파라미터가 필요합니다' }); return; }

  /* 키는 Vercel 환경변수에만 둔다 (공개 저장소 노출 방지) */
  const KAKAO_REST_KEY = (process.env.KAKAO_REST_KEY || '').trim();
  if (!KAKAO_REST_KEY) {
    res.status(500).json({ error: '서버에 카카오 키(KAKAO_REST_KEY)가 없습니다. Vercel 환경변수를 확인하세요.' });
    return;
  }

  try {
    const endpoint = type === 'address'
      ? 'https://dapi.kakao.com/v2/local/search/address.json'
      : 'https://dapi.kakao.com/v2/local/search/keyword.json';

    /* 기관 좌표(x=경도, y=위도)가 오면 가까운 순 정렬 — 동명 시설의 타지역 오등록 방지.
       카카오 문서상 x·y·sort는 keyword.json 전용이라 address.json에는 붙이지 않는다. */
    let url = `${endpoint}?query=${encodeURIComponent(query)}&size=5`;
    if (type !== 'address' && x && y && isFinite(Number(x)) && isFinite(Number(y))) {
      url += `&x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}&sort=distance`;
    }

    const response = await fetch(url, {
      headers: { 'Authorization': `KakaoAK ${KAKAO_REST_KEY}` }
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
