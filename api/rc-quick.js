// ═══════════════════════════════════════════════════════════
//  ROADJOB 퀵 — 주소 검색 · 거리 계산
//  티맵 키는 서버에만 둔다 (앱에는 없음)
//  Vercel 환경변수: TMAP_KEY (없으면 COSROAD와 같은 키 사용)
// ═══════════════════════════════════════════════════════════

/* 로드잡 전용 티맵 키. COSROAD 키(브라우저 설정 탭)와는 별개입니다.
   Vercel 환경변수: RC_TMAP_KEY */
const TMAP = (process.env.RC_TMAP_KEY || process.env.TMAP_KEY || '').trim();
const ALLOWED = ['https://roadjob.co.kr', 'https://www.roadjob.co.kr', 'https://cosroad.com', 'https://www.cosroad.com', 'https://roadcrew.kr'];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED.includes(origin) ? origin : ALLOWED[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST만 허용' });

  const { action } = req.body || {};

  if (!TMAP) {
    return res.status(500).json({ ok: false, message: '서버에 티맵 키(RC_TMAP_KEY)가 없습니다.' });
  }

  try {
    /* ── 주소 검색 ── */
    if (action === 'search') {
      const { keyword } = req.body;
      if (!keyword || String(keyword).trim().length < 2) {
        return res.status(400).json({ ok: false, message: '두 글자 이상 입력해 주세요.' });
      }
      /* 키는 주소에 붙이지 않고 헤더로 — 티맵 문서 방식.
         주소에 붙이면 로그·중계서버에 키가 남을 수 있습니다. */
      const url = 'https://apis.openapi.sk.com/tmap/pois?version=1'
        + '&searchKeyword=' + encodeURIComponent(keyword)
        + '&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=8';
      const r = await fetch(url, { headers: { appKey: TMAP } });
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

    /* ── 경로 순서 최적화 (COSROAD 운행) ── */
    if (action === 'optimize') {
      const { sx, sy, sname, ex, ey, ename, vias } = req.body;
      if (!sx || !sy || !ex || !ey || !Array.isArray(vias)) {
        return res.status(400).json({ ok: false, message: '좌표 또는 경유지 누락' });
      }
      /* 티맵은 출발지와 도착지가 같으면 거부합니다 (022004) */
      if (String(sx) === String(ex) && String(sy) === String(ey)) {
        return res.status(400).json({ ok: false, message: '출발지와 도착지가 같습니다.' });
      }

      const r = await fetch('https://apis.openapi.sk.com/tmap/routes/optimized-order?version=1&format=json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', appKey: TMAP },
        body: JSON.stringify({
          reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO',
          startX: String(sx), startY: String(sy), startName: sname || '출발',
          endX: String(ex), endY: String(ey), endName: ename || '도착',
          viaPoints: vias.map(function (v, i) {
            return { viaPointId: 'p' + i, viaPointName: v.name || ('경유' + (i + 1)),
                     viaX: String(v.lon), viaY: String(v.lat) };
          })
        })
      });
      const j = await r.json();
      if (!r.ok || j.error) {
        return res.status(200).json({
          ok: false,
          message: 'T맵 오류 (' + r.status + ') ' + ((j.error && j.error.code) || ''),
          상세: j.error || null
        });
      }
      const p = j.properties;
      if (!p) return res.status(200).json({ ok: false, message: '경로를 찾지 못했습니다.' });

      return res.status(200).json({
        ok: true,
        order: p.optimalOrder || [],     // 경유지 최적 순서
        timeSec: p.totalTime || 0,
        distanceM: p.totalDistance || 0
      });
    }

    /* ── 좌표 -> 주소 (내 위치) ── */
    if (action === 'reverse') {
      const { lat, lon } = req.body;
      if (!lat || !lon) return res.status(400).json({ ok: false, message: '좌표 누락' });

      const url = 'https://apis.openapi.sk.com/tmap/geo/reversegeocoding?version=1'
        + '&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon)
        + '&coordType=WGS84GEO&addressType=A10';
      const r = await fetch(url, { headers: { appKey: TMAP } });
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
