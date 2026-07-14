// ═══════════════════════════════════════════════════════════
//  ROADCREW 퀵 — 주소 검색 · 거리 계산
//  티맵 키는 서버에만 둔다 (앱에는 없음)
//  Vercel 환경변수: TMAP_KEY (없으면 COSROAD와 같은 키 사용)
// ═══════════════════════════════════════════════════════════

const TMAP = process.env.TMAP_KEY || 'Ev7Wbwethh8ekp1gFRZEJ55f99mltQ24C5nNwpOg';
const ALLOWED = ['https://roadcrew.kr', 'https://www.roadcrew.kr'];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED.includes(origin) ? origin : ALLOWED[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST만 허용' });

  const { action } = req.body || {};

  try {
    /* ── 주소 검색 ── */
    if (action === 'search') {
      const { keyword } = req.body;
      if (!keyword || String(keyword).trim().length < 2) {
        return res.status(400).json({ ok: false, message: '두 글자 이상 입력해 주세요.' });
      }
      const url = 'https://apis.openapi.sk.com/tmap/pois?version=1'
        + '&searchKeyword=' + encodeURIComponent(keyword)
        + '&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=8&appKey=' + TMAP;
      const r = await fetch(url);
      const j = await r.json();
      const list = (((j.searchPoiInfo || {}).pois || {}).poi || []).map(function (p) {
        const road = [p.upperAddrName, p.middleAddrName, p.roadName, p.firstBuildNo].filter(Boolean).join(' ');
        return {
          name: p.name,
          addr: road || [p.upperAddrName, p.middleAddrName, p.lowerAddrName].filter(Boolean).join(' '),
          lat: Number(p.frontLat || p.noorLat),
          lon: Number(p.frontLon || p.noorLon)
        };
      }).filter(function (x) { return x.lat && x.lon; });
      return res.status(200).json({ ok: true, list });
    }

    /* ── 거리 계산 ── */
    if (action === 'route') {
      const { sx, sy, ex, ey } = req.body;
      if (!sx || !sy || !ex || !ey) return res.status(400).json({ ok: false, message: '좌표 누락' });

      const r = await fetch('https://apis.openapi.sk.com/tmap/routes?version=1&format=json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', appKey: TMAP },
        body: JSON.stringify({
          startX: String(sx), startY: String(sy),
          endX: String(ex), endY: String(ey),
          reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO',
          searchOption: '0'
        })
      });
      const j = await r.json();
      const f = (j.features && j.features[0] && j.features[0].properties) || null;
      if (!f) return res.status(200).json({ ok: false, message: '경로를 찾지 못했습니다.' });

      return res.status(200).json({
        ok: true,
        distanceM: f.totalDistance || 0,   // 미터
        timeSec: f.totalTime || 0          // 초
      });
    }

    /* ── 좌표 -> 주소 (내 위치) ── */
    if (action === 'reverse') {
      const { lat, lon } = req.body;
      if (!lat || !lon) return res.status(400).json({ ok: false, message: '좌표 누락' });

      const url = 'https://apis.openapi.sk.com/tmap/geo/reversegeocoding?version=1'
        + '&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon)
        + '&coordType=WGS84GEO&addressType=A10&appKey=' + TMAP;
      const r = await fetch(url);
      const j = await r.json();
      const a = (j.addressInfo) || null;
      if (!a) return res.status(200).json({ ok: false, message: '주소를 찾지 못했습니다.' });

      const road = a.fullAddress ? String(a.fullAddress).split(',')[0] : '';
      const name = a.buildingName || road || '내 위치';
      return res.status(200).json({
        ok: true,
        name: name,
        addr: road || a.fullAddress || '',
        lat: Number(lat), lon: Number(lon)
      });
    }

    return res.status(400).json({ ok: false, message: '알 수 없는 요청' });
  } catch (e) {
    console.error('rc-quick 오류:', e);
    return res.status(500).json({ ok: false, message: '서버 오류: ' + (e && e.message ? e.message : String(e)) });
  }
}
