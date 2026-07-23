export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { query, type, x, y } = req.query;
  if (!query) { res.status(400).json({ error: 'query 파라미터가 필요합니다' }); return; }

  const KAKAO_REST_KEY = 'cc336e7f9819aabe81555c8f7bac53de';

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
