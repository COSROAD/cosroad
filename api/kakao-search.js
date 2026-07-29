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
    /* 주소 검색은 종전대로 한 번만 (카카오 문서상 x·y·sort는 keyword.json 전용) */
    if (type === 'address') {
      const url = 'https://dapi.kakao.com/v2/local/search/address.json?query='
        + encodeURIComponent(query) + '&size=5';
      const r = await fetch(url, { headers: { Authorization: 'KakaoAK ' + KAKAO_REST_KEY } });
      res.status(200).json(await r.json());
      return;
    }

    /* ── 장소(키워드) 검색 ──
       종전(v151~): 기관 좌표가 있으면 sort=distance 한 번만 호출.
       문제: 거리순은 「이름이 맞는 곳」보다 「몇 m 더 가까운 엉뚱한 상호」를 위로 올림.
       (예: "광양프런티어밸리3차" 검색 시 건물 대신 근처 카페·인쇄소가 먼저 나옴)
       수정(2026-07-29): 정확도순(전국)과 거리순(기관 주변)을 함께 불러 합친 뒤
       ① 이름이 검색어를 포함하는 결과 먼저 → ② 그 안에서 기관에서 가까운 순.
       부산·광주 같은 타지역 동명 오등록 방지 효과는 ②로 그대로 유지됨. */
    const base = 'https://dapi.kakao.com/v2/local/search/keyword.json?query='
      + encodeURIComponent(query) + '&size=15';
    const hasXY = x && y && isFinite(Number(x)) && isFinite(Number(y));

    const urls = [base];                                   /* 정확도순(기본) — 이름 우선 */
    if (hasXY) {
      urls.push(base + '&x=' + encodeURIComponent(x) + '&y=' + encodeURIComponent(y) + '&sort=distance');
    }
    const results = await Promise.all(urls.map(function (u) {
      return fetch(u, { headers: { Authorization: 'KakaoAK ' + KAKAO_REST_KEY } })
        .then(function (r) { return r.json(); })
        .catch(function () { return null; });
    }));

    /* 합치기 (id 기준 중복 제거) */
    const seen = {};
    const all = [];
    results.forEach(function (j) {
      ((j && j.documents) || []).forEach(function (d) {
        if (d && d.id && !seen[d.id]) { seen[d.id] = 1; all.push(d); }
      });
    });

    /* 거리(m) 계산 — 기관 좌표 기준 (하버사인) */
    const R = 6371000;
    const rad = function (v) { return Number(v) * Math.PI / 180; };
    const distM = function (d) {
      if (!hasXY || !d.x || !d.y) return 99999999;
      const dLat = rad(d.y) - rad(y);
      const dLon = rad(d.x) - rad(x);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(rad(y)) * Math.cos(rad(d.y)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    };
    const norm = function (s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); };
    const q = norm(query);

    all.forEach(function (d) {
      d._m = distM(d);
      /* 이름 일치 등급: 0=장소명이 검색어와 완전 일치, 1=장소명·주소에 검색어 포함, 2=불일치 */
      d._hit = norm(d.place_name) === q ? 0
        : (norm(d.place_name).indexOf(q) !== -1
             || norm(d.road_address_name).indexOf(q) !== -1
             || norm(d.address_name).indexOf(q) !== -1) ? 1 : 2;
      if (hasXY) d.distance = String(d._m);   /* 앱 표시용 — 카카오 형식과 동일(문자열 m) */
    });
    /* ── 네이버 보조 검색 (2026-07-29) ──
       카카오에 이름 맞는 결과가 하나도 없을 때만 네이버 지역검색으로 한 번 더.
       (예: "서울우유치즈 서구 대리점" — 카카오 지도에 미등록인 소규모 사업장)
       공식 명세: GET openapi.naver.com/v1/search/local.json?query=…&display=5(최대)
       헤더 X-Naver-Client-Id / X-Naver-Client-Secret.
       응답 items[].mapx·mapy 는 WGS84 경위도 ×10,000,000 정수 (예: 경복궁 mapx 1269770162 → 126.9770162),
       title 은 <b> 태그 포함이라 제거 필요. */
    const NAVER_ID = (process.env.NAVER_CLIENT_ID || '').trim();
    const NAVER_SECRET = (process.env.NAVER_CLIENT_SECRET || '').trim();
    const 이름맞는게없음 = all.every(function (d) { return d._hit === 2; });
    if (NAVER_ID && NAVER_SECRET && (all.length === 0 || 이름맞는게없음)) {
      try {
        const nr = await fetch('https://openapi.naver.com/v1/search/local.json?query='
          + encodeURIComponent(query) + '&display=5', {
          headers: { 'X-Naver-Client-Id': NAVER_ID, 'X-Naver-Client-Secret': NAVER_SECRET }
        });
        const nj = await nr.json();
        const 태그제거 = function (s) {
          return String(s || '').replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        };
        ((nj && nj.items) || []).forEach(function (it, i) {
          const nx = Number(it.mapx) / 10000000;   /* WGS84 ×1e7 → 경도 */
          const ny = Number(it.mapy) / 10000000;   /* WGS84 ×1e7 → 위도 */
          if (!isFinite(nx) || !isFinite(ny) || nx < 124 || nx > 132 || ny < 33 || ny > 39) return;
          const d = {
            id: 'naver-' + i,
            place_name: 태그제거(it.title),
            category_name: 태그제거(it.category),
            phone: it.telephone || '',
            road_address_name: it.roadAddress || '',
            address_name: it.address || '',
            place_url: it.link || '',
            x: String(nx), y: String(ny),
            출처: '네이버'
          };
          d._m = distM(d);
          d._hit = norm(d.place_name) === q ? 0
            : (norm(d.place_name).indexOf(q) !== -1
                 || norm(d.road_address_name).indexOf(q) !== -1
                 || norm(d.address_name).indexOf(q) !== -1) ? 1 : 2;
          if (hasXY) d.distance = String(d._m);
          all.push(d);
        });
      } catch (e2) { /* 네이버 실패는 무시 — 카카오 결과만 반환 */ }
    }

    all.sort(function (a, b) { return (a._hit - b._hit) || (a._m - b._m); });
    all.forEach(function (d) { delete d._m; delete d._hit; });

    const meta = (results[0] && results[0].meta) || (results[1] && results[1].meta) || {};
    res.status(200).json({ documents: all.slice(0, 5), meta: meta });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
