export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { query, type } = req.query;
  if (!query) { res.status(400).json({ error: 'query 파라미터가 필요합니다' }); return; }

  const KAKAO_REST_KEY = 'cc336e7f9819aabe81555c8f7bac53de';

  try {
    const endpoint = type === 'address'
      ? 'https://dapi.kakao.com/v2/local/search/address.json'
      : 'https://dapi.kakao.com/v2/local/search/keyword.json';

    const response = await fetch(`${endpoint}?query=${encodeURIComponent(query)}&size=5`, {
      headers: { 'Authorization': `KakaoAK ${KAKAO_REST_KEY}` }
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
