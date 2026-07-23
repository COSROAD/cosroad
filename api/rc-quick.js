// ════════════════════════════════════════════════════════════
//  ROADJOB 퀵 — 주소 검색 · 거리 계산
//  티맵 키는 서버에만 둔다 (앱에는 없음)
//  Vercel 환경변수: TMAP_KEY (없으면 COSROAD와 같은 키 사용)
// ═══════════════════════════════════════════════════════════

/* 로드잡 전용 티맵 키. COSROAD 키(브라우저 설정 탭)와는 별개입니다.
   Vercel 환경변수: RC_TMAP_KEY */
const TMAP = (process.env.RC_TMAP_KEY || process.env.TMAP_KEY || '').trim();

export default async function handler(req, res) {
  /* 카카오톡 인앱 브라우저는 origin을 다르게 보내 허용목록 방식이 CORS로 막힌다.
     쿠키·인증을 안 쓰는 공개 API라 전체 허용(*)이 안전하다. */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST만 허용' });

  const { action } = req.body || {};

  if (!TMAP) {
    return res.status(500).json({ ok: false, message: '서버에 티맵 키(RC_TMAP_KEY)가 없습니다.' });
  }

  try {
    /* 좌표는 소수점 6자리로 정리해 보냄 (공식 샘플 형식, 구식 검증기 대비) */
    const c6 = function (x) { return Number(x).toFixed(6); };

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
          startX: c6(sx), startY: c6(sy),
          endX: c6(ex), endY: c6(ey),
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

    /* ── 경로 순서 최적화 (COSROAD 운행) ──
       공식 상품 주소는 routeOptimization10/20/30/100 (경유지 수별 상품·단가가 다름).
       옛 주소(optimized-order)는 현재 상품에 없어 항상 거절되므로 교체함 (2026-07-22).
       경유지 수에 맞는 가장 싼 상품을 자동 선택: ≤10→10(44원) ≤20→20(55원) ≤30→30(66원) ≤100→100(77원) */
    if (action === 'optimize') {
      const { sx, sy, sname, ex, ey, ename, vias } = req.body;
      if (!sx || !sy || !ex || !ey || !Array.isArray(vias)) {
        return res.status(400).json({ ok: false, message: '좌표 또는 경유지 누락' });
      }
      /* 티맵은 출발지와 도착지가 같으면 거부합니다 (022004) */
      if (String(sx) === String(ex) && String(sy) === String(ey)) {
        return res.status(400).json({ ok: false, message: '출발지와 도착지가 같습니다.' });
      }
      if (vias.length > 100) {
        return res.status(400).json({ ok: false, message: '경유지는 100곳까지 가능합니다 (현재 ' + vias.length + '곳).' });
      }

      /* 좌표 빠진 지점 잡기 — 값이 비면 티맵이 9401(필수 파라메터 없음)을 내고,
         T맵 앱은 빈 좌표 지점들을 「중복」(022004)으로 거부한다.
         어느 지점이 문제인지 이름을 콕 집어 알려준다. */
      const numOk = function (x) {
        return x !== undefined && x !== null && String(x).trim() !== '' && isFinite(Number(x));
      };
      const 좌표없는지점 = [];
      if (!numOk(sx) || !numOk(sy)) 좌표없는지점.push(sname || '출발지');
      if (!numOk(ex) || !numOk(ey)) 좌표없는지점.push(ename || '도착지');
      vias.forEach(function (v) {
        if (!numOk(v.lon) || !numOk(v.lat)) 좌표없는지점.push(v.name || '(이름 없는 지점)');
      });
      if (좌표없는지점.length) {
        console.error('최적화 불가 — 좌표 없는 지점:', 좌표없는지점.join(', '));
        return res.status(200).json({
          ok: false,
          message: '좌표가 등록되지 않은 지점이 있습니다: ' + 좌표없는지점.join(', ')
            + ' — 해당 지점의 주소를 「주소 검색」으로 다시 등록해 주세요.'
        });
      }
      const size = vias.length <= 10 ? '10' : vias.length <= 20 ? '20' : vias.length <= 30 ? '30' : '100';

      /* startTime: 한국시간 yyyyMMddHHmm (필수 입력) */
      const kst = new Date(Date.now() + 9 * 3600 * 1000);
      const p2 = function (n) { return (n < 10 ? '0' : '') + n; };
      const startTime = '' + kst.getUTCFullYear() + p2(kst.getUTCMonth() + 1) + p2(kst.getUTCDate())
                      + p2(kst.getUTCHours()) + p2(kst.getUTCMinutes());

      /* 티맵 규칙: 이름(startName·endName·viaPointName)은 URL 인코딩해서 보내야 함.
         인코딩 없이 한글을 보내면 400 이 남. */
      /* 공식 샘플과 동일한 본문 구성 — 빈 값이라도 키가 다 있어야 함 (9401 방지) */
      const r = await fetch('https://apis.openapi.sk.com/tmap/routes/routeOptimization' + size + '?version=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', appKey: TMAP },
        body: JSON.stringify({
          reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO',
          startName: encodeURIComponent(sname || '출발'), startX: c6(sx), startY: c6(sy),
          startTime: startTime,
          endName: encodeURIComponent(ename || '도착'), endX: c6(ex), endY: c6(ey),
          endPoiId: '',
          searchOption: '0', carType: '4',
          viaPoints: vias.map(function (v, i) {
            /* 공식 샘플은 viaPointId 가 1부터 — 0은 구식 검증기가 「값 없음」으로 볼 수 있어 1부터 매김 */
            return { viaPointId: String(i + 1), viaPointName: encodeURIComponent(v.name || ('경유' + (i + 1))),
                     viaDetailAddress: '',
                     viaX: c6(v.lon), viaY: c6(v.lat),
                     viaPoiId: '', viaTime: 600,
                     wishStartTime: '', wishEndTime: '' };
          })
        })
      });
      const raw = await r.text();
      let j = {};
      try { j = JSON.parse(raw); } catch (e) {}
      if (!r.ok || j.error) {
        /* 거절 사유 전문을 서버 기록에 남긴다 — 지점 이름·좌표는 개인정보가 아님 */
        console.error('최적화 T맵 거절 (' + r.status + '):', raw.replace(/\s+/g, ' ').slice(0, 400));
        console.error('보낸 요청 요약:', JSON.stringify({ sx: sx, sy: sy, ex: ex, ey: ey,
          vias: vias.map(function (v) { return { name: v.name, lat: v.lat, lon: v.lon }; }) }).slice(0, 500));
        return res.status(200).json({
          ok: false,
          message: 'T맵 오류 (' + r.status + ') ' + ((j.error && (j.error.id || j.error.code)) || ''),
          상세: j.error || raw.slice(0, 200)
        });
      }
      const p = j.properties;
      if (!p) return res.status(200).json({ ok: false, message: '경로를 찾지 못했습니다.' });

      /* 방문 순서 복원: 응답의 Point 지점들(features)을 index순으로 정렬해
         우리가 보낸 viaPointId(=원래 배열 번호)만 뽑는다. 출발·도착 지점은 숫자 id가 아니라 걸러짐. */
      const points = (j.features || []).filter(function (f) {
        return f && f.geometry && f.geometry.type === 'Point' && f.properties;
      });
      points.sort(function (a, b) { return Number(a.properties.index || 0) - Number(b.properties.index || 0); });
      const order = [];
      points.forEach(function (f) {
        const id = String(f.properties.viaPointId === undefined ? '' : f.properties.viaPointId);
        if (/^[0-9]+$/.test(id)) {
          const n = Number(id) - 1;   /* viaPointId 는 1부터 매겼으므로 */
          if (n >= 0 && n < vias.length && order.indexOf(n) === -1) order.push(n);
        }
      });

      return res.status(200).json({
        ok: true,
        order: order,                           // 경유지 최적 순서 (원래 배열 번호)
        timeSec: Number(p.totalTime) || 0,
        distanceM: Number(p.totalDistance) || 0
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
