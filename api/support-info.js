// COSROAD — 정부 지원사업 공고 조회 프록시 (기업마당 + 정부24 보조금24)
//
// ── 공식 명세 대조 (검증 3원칙 A) ───────────────────────────────────────────
// [1] 기업마당 지원사업정보 API
//     명세: https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi   (2025.10.22 수정본)
//     요청 URL : https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do   호출방식 GET
//     요청 파라미터(명세 표 그대로):
//       crtfcKey(서비스키, 필수) · dataType(rss|json) · searchCnt(조회건수)
//       searchLclasId(분야) · hashtags(해시태그) · pageUnit · pageIndex
//     ※ crtfcKey 는 "기업마당에서 발급받은 서비스 인증키" — 공공데이터포털 키와 별개.
//        그래서 env 를 BIZINFO_KEY 로 분리한다.
//     응답 item 필드(명세 표 그대로):
//       title(공고명) · link(공고URL) · seq(공고ID) · author(소관기관명)
//       excInsttNm(수행기관명) · description(사업개요내용) · lcategory(지원분야대분류)
//       pubDate(등록일자) · reqstDt(신청기간 "20220727 ~ 20220930") · trgetNm(지원대상)
//       inqireCo(조회수) · hashTags · totCnt · pblancNm(공고명)
//     RSS(XML) 예시에만 나오는 동의 필드: pblancUrl · pblancId · jrsdInsttNm ·
//       pldirSportRealmLclasCodeNm · reqstBeginEndDe · bsnsSumryCn (JSON 예시에도 이어짐)
//     응답 봉투(명세의 JSON 예시): { "jsonArray": { ..., "item":[ {...} ] } }
//       → 실제 배포본이 { "jsonArray":[ ... ] } 평면 배열로 오는 사례가 있어 두 형태 모두 수용.
//
// [2] 행정안전부_대한민국 공공서비스(혜택) 정보 (정부24 / 보조금24)
//     데이터 페이지: https://www.data.go.kr/data/15113968/openapi.do
//       → '활용명세(상세기능)' 탭과 참고문서 내려받기는 로그인해야 열린다(비로그인 404).
//     공개된 공식 기계판독 명세(로그인 불필요):
//       https://infuser.odcloud.kr/oas/docs?namespace=gov24/v1  → serviceDetail 전체 명세
//       https://infuser.odcloud.kr/oas/docs?namespace=gov24/v3  → 봉투·인증만 있고 paths 비어 있음
//     host/basePath : api.odcloud.kr / /api      (v1·v3 OAS 동일)
//     인증          : serviceKey(query) 또는 Authorization(header)  (v1·v3 OAS 동일)
//     요청 파라미터 : page · perPage · returnType · cond[SVC_ID::EQ]
//     응답 봉투     : { page, perPage, totalCount, currentCount, matchCount, data:[...] }
//     serviceDetail 응답 필드(v1 OAS 그대로):
//       SVC_ID · 지원유형 · 서비스명 · 서비스목적 · 신청기한 · 지원대상 · 선정기준
//       지원내용 · 신청방법 · 구비서류 · 접수기관명 · 문의처전화번호
//       온라인신청사이트URL · 수정일시 · 소관기관명 · 행정규칙 · 자치법규 · 법령
//     버전: 공지 NOTICE_0000000002221(2021) = v1 의 serviceList/serviceDetail/supportConditions,
//           공지 NOTICE_0000000004156(2025.06.13) = v3/serviceDetail 에 구비서류 2개 추가.
//       → v3 를 먼저 호출하고 실패하면 v1 로 재시도한다. 필드는 위 공식 이름으로만 읽는다.
//
// 키는 Vercel 환경변수에만 둔다: DATA_GO_KR_KEY (정부24) / BIZINFO_KEY (기업마당)
// ────────────────────────────────────────────────────────────────────────────

/* 업종별 키워드 — 제목 + 분야 문자열을 대상으로 서버에서 필터 */
const BIZ_KEYWORDS = {
  academy:   ['교육', '학원', '교습', '돌봄', '아동', '청소년', '통학'],
  public:    ['요양', '복지', '돌봄', '사회서비스', '노인', '장애'],
  logistics: ['물류', '운송', '화물', '유통'],
  delivery:  ['택배', '배송', '물류', '운송']
};

const MAX_ITEMS = 50;

/* 오늘(한국시간) YYYY-MM-DD — Vercel 서버는 UTC라 KST로 맞춘다 */
function todayKST() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

/* 신청기간 문자열에서 종료일 뽑기.
   기업마당 reqstDt 예: "20220727 ~ 20220930"
   정부24 신청기한 예: "2024-01-01 ~ 2024-12-31" / "접수기관별 상이" / "예산 소진시 마감"
   → 문자열 안의 날짜 토큰을 모두 찾아 마지막 것을 종료일로 본다. 없거나 실제 날짜가
     아니면 '' (지시문: 파싱 실패 시 목록에는 표시). */
function parseEndDate(text) {
  const s = String(text || '');
  if (!s) return '';
  const found = [];
  const re = /(\d{4})[.\-/]?\s?(\d{2})[.\-/]?\s?(\d{2})/g;
  let m;
  while ((m = re.exec(s))) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (y < 1900 || y > 2999 || mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    /* 실제 존재하는 날짜인지 확인 (2월 30일 같은 값 배제) */
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) continue;
    found.push(y + '-' + m[2] + '-' + m[3]);
  }
  return found.length ? found[found.length - 1] : '';
}

/* 업종 키워드 / 검색어 필터 — 제목 + 분야 대상 */
function matchFilter(item, biz, q) {
  const hay = (String(item.title || '') + ' ' + String(item.field || ''));
  if (q) return hay.indexOf(q) >= 0;
  const keys = BIZ_KEYWORDS[biz];
  if (!keys) return true;
  for (let i = 0; i < keys.length; i++) { if (hay.indexOf(keys[i]) >= 0) return true; }
  return false;
}

/* 공통 마무리: 필터 → 마감 지난 공고 제외 → 50건 제한 */
function finalize(items, biz, q) {
  const today = todayKST();
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || !it.title) continue;
    if (!matchFilter(it, biz, q)) continue;
    if (it.endDate && it.endDate < today) continue;   /* 종료일이 오늘 이전이면 제외 */
    out.push(it);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/* 응답을 text로 받고 JSON.parse 실패 시 원문을 로그로 남긴다 (검증 3원칙 C) */
async function fetchJson(url, label, headers) {
  const r = await fetch(url, headers ? { headers } : undefined);
  const raw = await r.text();
  try {
    return { ok: true, json: JSON.parse(raw) };
  } catch (parseErr) {
    console.error(label + ' 응답이 JSON 아님:', r.status, raw.slice(0, 200));
    return { ok: false, status: r.status, raw: raw };
  }
}

/* ── 기업마당 ── */
async function loadBizinfo(biz, q) {
  const KEY = (process.env.BIZINFO_KEY || '').trim();
  if (!KEY) {
    return { ok: false, message: '서버에 기업마당 키(BIZINFO_KEY)가 없습니다. 기업마당에서 API 사용신청 후 발급받아 넣어주세요.' };
  }
  const url = 'https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do'
    + '?crtfcKey=' + encodeURIComponent(KEY)
    + '&dataType=json'
    + '&searchCnt=200';           /* 필터 전이라 넉넉히 받고 서버에서 50건으로 줄인다 */

  const got = await fetchJson(url, 'support-info(bizinfo)');
  if (!got.ok) return { ok: false, message: '기업마당 응답 형식 오류' };

  /* 봉투 두 형태 모두 수용: {jsonArray:{item:[...]}} · {jsonArray:[...]} */
  const box = got.json && got.json.jsonArray;
  let rows = [];
  if (Array.isArray(box)) rows = box;
  else if (box && Array.isArray(box.item)) rows = box.item;
  else if (box && box.item) rows = [box.item];
  else if (Array.isArray(got.json)) rows = got.json;

  const items = rows.map(function (r) {
    const period = String(r.reqstDt || r.reqstBeginEndDe || '').trim();
    return {
      id:      'bz_' + String(r.seq || r.pblancId || r.link || r.pblancUrl || '').trim(),
      title:   String(r.title || r.pblancNm || '').trim(),
      org:     String(r.author || r.jrsdInsttNm || r.excInsttNm || '').trim(),
      period:  period,
      endDate: parseEndDate(period),
      field:   String(r.lcategory || r.pldirSportRealmLclasCodeNm || r.hashTags || '').trim(),
      url:     String(r.link || r.pblancUrl || '').trim(),
      src:     'bizinfo'
    };
  });
  return { ok: true, items: finalize(items, biz, q) };
}

/* 문자열 → 짧은 결정적 해시 (djb2). 같은 문자열이면 언제나 같은 값이라
   NEW 판정 기준으로 쓸 수 있다. 단순 charCode 합산은 글자 순서가 다른 제목끼리
   쉽게 겹쳐서, 순서를 반영하는 djb2로 충돌을 줄였다. */
function shortHash(s) {
  let h = 5381;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) + str.charCodeAt(i)) | 0;   // h*33 + c
  }
  return (h >>> 0).toString(36);
}

/* 정부24 항목 식별자 — v3 실응답에 SVC_ID가 비어 있는 경우가 있어
   SVC_ID → 서비스ID → (서비스명|소관기관명) 해시 순으로 떨어진다.
   어떤 경우에도 항목마다 고유하고 매번 같은 값이어야 seen/NEW 판정이 맞는다. */
function gov24Id(r) {
  const svc = String(r['SVC_ID'] || '').trim();
  if (svc) return svc;
  const alt = String(r['서비스ID'] || '').trim();
  if (alt) return alt;
  const name = String(r['서비스명'] || '').trim();
  const org = String(r['소관기관명'] || r['접수기관명'] || '').trim();
  if (!name && !org) return '';
  return 'h' + shortHash(name + '|' + org);
}

/* ── 정부24 (보조금24) ── */
async function loadGov24(biz, q) {
  const KEY = (process.env.DATA_GO_KR_KEY || '').trim();
  if (!KEY) {
    return { ok: false, message: '서버에 공공데이터포털 키(DATA_GO_KR_KEY)가 없습니다.' };
  }
  /* 공지대로 v3 우선, 실패하면 v1로 재시도 (필드 이름은 공식 OAS 그대로) */
  const versions = ['v3', 'v1'];
  let lastMsg = '';
  for (let v = 0; v < versions.length; v++) {
    const url = 'https://api.odcloud.kr/api/gov24/' + versions[v] + '/serviceDetail'
      + '?page=1&perPage=300&returnType=JSON'
      + '&serviceKey=' + encodeURIComponent(KEY);
    const got = await fetchJson(url, 'support-info(gov24 ' + versions[v] + ')');
    if (!got.ok) { lastMsg = '정부24 응답 형식 오류'; continue; }

    const j = got.json;
    if (j && (j.code || j.msg) && !Array.isArray(j.data)) {
      /* odcloud 인증/권한 오류는 {code:-401, msg:"인증키는 필수 항목 입니다."} 형태 */
      console.error('support-info(gov24 ' + versions[v] + ') 오류:', j.code, j.msg);
      lastMsg = '정부24 조회 실패 (' + (j.msg || j.code) + ')';
      continue;
    }
    const rows = (j && Array.isArray(j.data)) ? j.data : [];
    /* ⚠ 임시 진단 로그 — v3 실응답에 SVC_ID가 비어 있어 실제 식별자 필드명을 확인하는 중.
       Vercel 로그에서 필드 이름을 확인한 뒤 다음 커밋에서 제거할 것. */
    console.error('gov24 ' + versions[v] + ' 필드:', Object.keys(rows[0] || {}));
    const items = rows.map(function (r) {
      const period = String(r['신청기한'] || '').trim();
      return {
        id:      'g24_' + gov24Id(r),
        title:   String(r['서비스명'] || '').trim(),
        org:     String(r['소관기관명'] || r['접수기관명'] || '').trim(),
        period:  period,
        endDate: parseEndDate(period),
        field:   String(r['지원유형'] || r['지원대상'] || '').trim(),
        url:     String(r['온라인신청사이트URL'] || '').trim(),
        src:     'gov24'
      };
    });
    return { ok: true, items: finalize(items, biz, q) };
  }
  return { ok: false, message: lastMsg || '정부24 조회 실패' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const src = String((req.query && req.query.src) || '').trim();
  const biz = String((req.query && req.query.biz) || '').trim();
  const q = String((req.query && req.query.q) || '').trim().slice(0, 40);

  if (src !== 'bizinfo' && src !== 'gov24') {
    return res.status(400).json({ ok: false, message: 'src는 bizinfo 또는 gov24여야 합니다.' });
  }
  if (biz && !BIZ_KEYWORDS[biz]) {
    return res.status(400).json({ ok: false, message: '지원하지 않는 업종입니다.' });
  }

  try {
    const out = (src === 'bizinfo') ? await loadBizinfo(biz, q) : await loadGov24(biz, q);
    if (!out.ok) return res.status(200).json({ ok: false, message: out.message });
    return res.status(200).json({ ok: true, items: out.items });
  } catch (e) {
    console.error('support-info 오류:', e && e.message);
    return res.status(500).json({ ok: false, message: '서버 오류: ' + (e && e.message ? e.message : String(e)) });
  }
}
