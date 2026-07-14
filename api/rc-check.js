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
    티맵: { 확인중: true }
  };

  /* 티맵이 실제로 작동하는지 직접 호출해 본다 */
  const RAW  = process.env.RC_TMAP_KEY || process.env.TMAP_KEY || '';
  const TMAP = RAW.trim();
  try {
    const url = 'https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=' + encodeURIComponent('인천 연수구청')
      + '&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=1&appKey=' + TMAP;

    /* 어떤 방식이 통하는지 3가지로 시험한다 */
    const trials = {};
    const tryFetch = async (label, opts) => {
      try {
        const rr = await fetch(url, opts);
        const tx = await rr.text();
        trials[label] = { 상태: rr.status, 응답앞부분: tx.slice(0, 140) };
        return rr.status === 200 ? JSON.parse(tx) : null;
      } catch (e) { trials[label] = { 오류: String(e && e.message) }; return null; }
    };

    /* 키를 헤더에 담아 보내는 방식도 시험한다 (COSROAD 경로최적화가 쓰는 방식) */
    const urlNoKey = url.replace('&appKey=' + TMAP, '');

    let j = await tryFetch('주소창에_키', {});
    if (!j) {
      try {
        const rh = await fetch(urlNoKey, { headers: { appKey: TMAP } });
        const th = await rh.text();
        trials['헤더에_키'] = { 상태: rh.status, 응답앞부분: th.slice(0, 140) };
        if (rh.status === 200) j = JSON.parse(th);
      } catch (e) { trials['헤더에_키'] = { 오류: String(e && e.message) }; }
    }
    if (!j) j = await tryFetch('Referer_cosroad', { headers: { Referer: 'https://cosroad.com/' } });

    /* COSROAD가 실제로 쓰는 경로 API를 서버에서 불러본다 (이건 되는지?) */
    try {
      const rr = await fetch('https://apis.openapi.sk.com/tmap/routes?version=1&format=json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', appKey: TMAP },
        body: JSON.stringify({
          startX: '126.6516', startY: '37.4467',
          endX: '126.6390',  endY: '37.3894',
          reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', searchOption: '0'
        })
      });
      const tt = await rr.text();
      const okR = rr.status === 200;
      let dist = null;
      if (okR) { try { const jj = JSON.parse(tt); dist = jj.features?.[0]?.properties?.totalDistance; } catch(e){} }
      trials['경로API'] = { 상태: rr.status, 성공: okR, 거리m: dist, 응답앞부분: okR ? '(성공)' : tt.slice(0,140) };
    } catch (e) { trials['경로API'] = { 오류: String(e && e.message) }; }

    /* 역지오코딩도 */
    try {
      const rg = await fetch('https://apis.openapi.sk.com/tmap/geo/reversegeocoding?version=1&lat=37.4467&lon=126.6516&coordType=WGS84GEO&addressType=A10', {
        headers: { appKey: TMAP }
      });
      const tg = await rg.text();
      trials['역지오코딩'] = { 상태: rg.status, 응답앞부분: rg.status===200 ? '(성공)' : tg.slice(0,120) };
    } catch (e) { trials['역지오코딩'] = { 오류: String(e && e.message) }; }

    out.티맵시험 = trials;
    if (!j) j = {};
    const poi = (((j.searchPoiInfo || {}).pois || {}).poi || [])[0];
    const first = trials['그냥호출'] || {};
    out.티맵 = {
      주소검색: !!poi,
      찾은곳: poi ? poi.name : null,
      상태코드: first.상태 || null,
      키길이: TMAP.length,
      원본길이: RAW.length,
      공백제거됨: RAW.length !== TMAP.length,
      키앞2자: TMAP.slice(0, 2),
      키뒤3자: TMAP.slice(-3),
      오류: poi ? null : '키가 거부되었습니다. 티맵 콘솔에서 (1) 앱키가 맞는지 (2) POI검색·경로안내·역지오코딩 API가 신청돼 있는지 확인하세요.'
    };

    if (poi) {
      const lat = Number(poi.frontLat || poi.noorLat);
      const lon = Number(poi.frontLon || poi.noorLon);
      const r2 = await fetch('https://apis.openapi.sk.com/tmap/routes?version=1&format=json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', appKey: TMAP },
        body: JSON.stringify({
          startX: String(lon), startY: String(lat),
          endX: '126.6390', endY: '37.3894',
          reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', searchOption: '0'
        })
      });
      const j2 = await r2.json();
      const f = (j2.features && j2.features[0] && j2.features[0].properties) || null;
      out.티맵.거리계산 = !!f;
      out.티맵.거리 = f ? Math.round(f.totalDistance / 100) / 10 + 'km' : null;
      out.티맵.거리오류 = f ? null : (r2.status + ' ' + JSON.stringify(j2).slice(0, 120));
    }
  } catch (e) {
    out.티맵 = { 오류: String(e && e.message) };
  }

  return res.status(200).json(out);
}
