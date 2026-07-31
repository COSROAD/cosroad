// COSROAD — 바코드 상품정보 조회 (식약처 C005 바코드연계제품정보)
// 공식 명세: http://openapi.foodsafetykorea.go.kr/api/{인증키}/C005/json/{시작}/{끝}/BAR_CD={바코드}
// 응답: C005.row[] = { BAR_CD, PRDLST_NM(제품명), BSSH_NM(제조사·업소명), PRDLST_DCNM(식품유형), ... }
// 결과코드: INFO-000 정상 / INFO-200 데이터 없음
// 키는 Vercel 환경변수 FOODSAFETY_KEY 에만 둔다.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const code = String((req.query && req.query.code) || '').trim();
  /* 바코드는 숫자 8~14자리만 허용 (EAN-8/13, ITF-14 등) */
  if (!/^[0-9]{8,14}$/.test(code)) {
    return res.status(400).json({ ok: false, message: '바코드는 숫자 8~14자리여야 합니다.' });
  }

  const KEY = (process.env.FOODSAFETY_KEY || '').trim();
  if (!KEY) {
    return res.status(500).json({ ok: false, message: '서버에 식품안전나라 키(FOODSAFETY_KEY)가 없습니다.' });
  }

  try {
    const url = 'http://openapi.foodsafetykorea.go.kr/api/' + encodeURIComponent(KEY)
      + '/C005/json/1/1/BAR_CD=' + encodeURIComponent(code);
    const r = await fetch(url);
    const j = await r.json();

    const box = j && j.C005;
    const rc = (box && box.RESULT && box.RESULT.CODE) || (j && j.RESULT && j.RESULT.CODE) || '';
    const row = box && Array.isArray(box.row) && box.row[0];

    if (row && (row.PRDLST_NM || row.BSSH_NM)) {
      return res.status(200).json({
        ok: true,
        name: String(row.PRDLST_NM || '').trim(),      // 제품명
        maker: String(row.BSSH_NM || '').trim(),       // 제조사(업소명)
        type: String(row.PRDLST_DCNM || '').trim(),    // 식품유형
        code: code,
        출처: '식품안전나라'
      });
    }
    if (rc === 'INFO-000' || rc === 'INFO-200') {
      /* 정상 응답인데 데이터가 없는 경우 */
      return res.status(200).json({ ok: false, notFound: true,
        message: '상품 DB에 없는 바코드예요. 품명을 직접 입력해 주세요.' });
    }
    /* 그 외 오류코드 (키 오류 등) — 원문 코드를 그대로 남긴다 */
    console.error('barcode-info C005 오류:', rc, JSON.stringify(j).slice(0, 300));
    return res.status(200).json({ ok: false, message: '상품 조회 실패 (' + rc + ')' });
  } catch (e) {
    console.error('barcode-info 오류:', e && e.message);
    return res.status(500).json({ ok: false, message: '서버 오류: ' + (e && e.message ? e.message : String(e)) });
  }
}
