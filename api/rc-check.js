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

  /* 티맵 확인 — ?tmap=1 을 붙였을 때만.
     API 를 여러 개 찔러본다. 하나만 되고 나머지가 막히면 「키」가 아니라
     「그 API 를 콘솔에서 안 켰다」는 뜻이라 원인을 정확히 좁힐 수 있다. */
  if (req.query && req.query.tmap === '1') {
    const RAW = process.env.RC_TMAP_KEY || '';
    const KEY = RAW.trim();

    /* 키 모양만 알려준다. 값 전체는 절대 안 보여준다.
       앞3·뒤3 은 SK 콘솔이 이미 그만큼 보여주므로(394…XgC) 같은 수준이고,
       40자 중 6자로는 아무것도 할 수 없다. 콘솔 것과 같은지 대보기 위함. */
    out.티맵키_모양 = {
      길이: KEY.length,
      앞3: KEY.slice(0, 3),
      뒤3: KEY.slice(-3),
      앞뒤공백있었나: RAW !== KEY,
      영문숫자만인가: /^[A-Za-z0-9]+$/.test(KEY),
      줄바꿈섞였나: /[\r\n]/.test(RAW),
      따옴표섞였나: /["']/.test(RAW),
      안내: '콘솔 「앱키(appKey)」 탭에 보이는 앞뒤 글자와 같은지 대보세요. 다르면 다른 앱의 키입니다.',
    };

    /* 키는 헤더로 보낸다 — 티맵 문서 방식 */
    const 시험 = [
      ['주소검색(POI)', 'https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword='
        + encodeURIComponent('연수구청') + '&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=1'],
      ['역지오코딩', 'https://apis.openapi.sk.com/tmap/geo/reversegeocoding?version=1&lat=37.4103&lon=126.6784'
        + '&coordType=WGS84GEO&addressType=A10'],
    ];
    out.티맵 = {};
    for (const [이름, url] of 시험) {
      try {
        const r = await fetch(url, { headers: { appKey: KEY } });
        const t = await r.text();
        let code = null;
        try { code = JSON.parse(t)?.error?.id || JSON.parse(t)?.error?.code || null; } catch(e){}
        out.티맵[이름] = r.status === 200
          ? { 됨: true, 상태: 200 }
          : { 됨: false, 상태: r.status, 코드: code, 내용: t.replace(/\s+/g,' ').slice(0, 110) };
      } catch (e) { out.티맵[이름] = { 됨: false, 오류: String(e && e.message) }; }
    }

    /* 경로 안내는 POST 라 따로 */
    try {
      const r = await fetch('https://apis.openapi.sk.com/tmap/routes?version=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', appKey: KEY },
        body: JSON.stringify({ startX: 126.6784, startY: 37.4103, endX: 126.7052, endY: 37.4563,
                               reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', searchOption: 0 })
      });
      const t = await r.text();
      let code = null;
      try { code = JSON.parse(t)?.error?.id || null; } catch(e){}
      out.티맵['경로안내'] = r.status === 200 ? { 됨: true, 상태: 200 }
        : { 됨: false, 상태: r.status, 코드: code, 내용: t.replace(/\s+/g,' ').slice(0, 110) };
    } catch (e) { out.티맵['경로안내'] = { 됨: false, 오류: String(e && e.message) }; }

    /* 무엇이 문제인지 사람 말로 */
    const 된것 = Object.values(out.티맵).filter(x => x.됨).length;
    const 전부 = Object.keys(out.티맵).length;
    out.진단 =
      된것 === 전부 ? '✅ 티맵 정상. 앱에서 바로 쓰시면 됩니다.'
      : 된것 > 0    ? '⚠️ 키는 살아 있는데 일부만 막혔습니다 → SK 콘솔에서 그 API 상품을 켜주세요.'
      : '❌ 모두 403 INVALID_API_KEY. 흔한 순서대로 — '
        + '① 이 앱에 「TMAP API」 상품이 안 붙었다 (TMS 는 별개 상품입니다) '
        + '② Vercel 의 키가 이 앱의 앱키가 아니다 (앱마다 키가 다릅니다) '
        + '③ 상품 신청 직후라 아직 반영 전 (몇 분 걸립니다)';
  } else {
    out.티맵 = { 호출시험: '생략됨 (?tmap=1 을 붙이면 확인)', 키있음: has(process.env.RC_TMAP_KEY) };
  }

  return res.status(200).json(out);
}
