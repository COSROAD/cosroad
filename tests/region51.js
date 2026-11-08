/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드51 — 정부 지원사업 **지역 필터** (api/support-info.js)
   ① 먼저 **고치기 전 코드로 재현**한다 (검증 원칙 C) — 사장님 캡처의 세 공고가 인천 업체에 통과하나.
   ② 고친 뒤: 통과/제외 표를 네 지역(인천·경기·광주광역시·전남) 사용자로 각각 본다.
   ③ 전국·정부 공고가 빠지지 않는지(오탐)를 같은 표에서 본다.
   ★ 바깥 통신 0 — `regionPass` 들을 소스에서 뜯어 와서 돌린다(실제 API 는 따로 본다). */
const cp = require('child_process');
const fs = require('fs');

/* ★ 회차 기록 묶음 — **양쪽을 커밋에 못 박는다**(CLAUDE.md 검사 묶음 규칙).
   고치기 전 = v281(1aea23d) · 고친 뒤 = 작업트리(이번 회차를 보는 묶음이라 트리로 둔다). */
const OLD_REF = process.env.COS_API_OLD_REF || '1aea23d';   /* v281 = 고치기 전 */
const readOld = () => cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/support-info.js',
  { maxBuffer: 1 << 26 }).toString();
const readNew = () => fs.readFileSync('' + COS_ROOT + '/api/support-info.js', 'utf8');

/* 소스에서 함수들만 꺼내 돌린다 — handler 는 부르지 않는다(바깥 통신 0) */
function load(src) {
  const code = src
    .replace(/^import [^;]*;$/mg, '')
    .replace(/^export default async function handler[\s\S]*$/m, '')
    + '\nreturn { regionPass: regionPass, findSido: findSido, regionHay: regionHay,'
    + ' finalize: typeof finalize==="function"?finalize:null,'
    + ' tagKeys: typeof tagKeys==="function"?tagKeys:null,'
    + ' headKeys: typeof headKeys==="function"?headKeys:null,'
    + ' wordKeys: typeof wordKeys==="function"?wordKeys:null,'
    + ' SIDO_LIST: SIDO_LIST };';
  return new Function('process', 'console', 'fetch', code)(
    { env: {} }, { log: () => {}, error: () => {} }, async () => { throw new Error('no net'); });
}
const OLD = load(readOld());
const NEW = load(readNew());

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(58) + String(got).slice(0, 40)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

/* ── 공고 표 (지시문 3번 목록 그대로 + 캡처 세 건) ────────────────────────
   tags = 기업마당 hashTags 실제 꼴(쉼표 목록) · '' 면 정부24 처럼 지역 칸이 없는 것 */
const CASES = [
  /* 캡처의 세 건 (사장님 11-06 02:39) */
  { t: '[전남광주·제주] 2026년 10월 동행축제 참여기업 모집', org: '중소벤처기업부', tags: '2026,내수,전남광주,제주', 캡처: true },
  { t: '2026년 전남 4차 중소기업 연구조직 지원사업 공고', org: '(재)전남정보문화산업진흥원', tags: '2026,기술,전남', 캡처: true },
  { t: '[경남] 함양군 2026년 시군구연고산업육성 지원', org: '함양군', tags: '2026,경영,경남', 캡처: true },
  /* 우리 지역 */
  { t: '[인천] 2026년 소상공인 경영안정 자금 지원', org: '인천광역시', tags: '2026,금융,인천' },
  { t: '[인천·경기] 수도권 물류 디지털 전환 지원', org: '인천테크노파크', tags: '2026,기술,인천,경기' },
  /* 전국·정부 (빠지면 안 된다) */
  { t: '2026년 중소기업 스마트공장 보급·확산 사업', org: '중소벤처기업부', tags: '2026,기술,중소벤처기업부' },
  { t: '2026년 교육부 방과후 돌봄 운영 지원', org: '교육부', tags: '' },
  { t: '소상공인 정책자금 융자 계획 공고', org: '소상공인시장진흥공단', tags: '' },
  /* 동명 지명·오탐 함정 */
  { t: '경기도 광주시 중소기업 운영자금 지원', org: '광주시청', tags: '2026,금융,경기' },
  { t: '광주광역시 2026년 청년 고용 지원', org: '광주광역시', tags: '2026,인력,전남광주' },
  { t: '2026 대전환 시대 중소기업 경영혁신 교육', org: '중소벤처기업부', tags: '' },
  { t: '세종대왕 나신 날 기념 문화사업 공모', org: '문화체육관광부', tags: '' },
  { t: '경기 침체 대응 소상공인 특별 융자', org: '중소벤처기업부', tags: '' },
  { t: '2026년 지역 중소기업 육성자금 지원', org: '(재)전남정보문화산업진흥원', tags: '' }
];

/* 지역별 기대값 — 「통과」= 목록에 보여야 함 */
const WANT = {
  '인천': ['제외','제외','제외','통과','통과','통과','통과','통과','제외','제외','통과','통과','통과','제외'],
  '경기': ['제외','제외','제외','제외','통과','통과','통과','통과','통과','제외','통과','통과','통과','제외'],
  '광주': ['통과','제외','제외','제외','제외','통과','통과','통과','제외','통과','통과','통과','통과','제외'],
  '전남': ['통과','통과','제외','제외','제외','통과','통과','통과','제외','제외','통과','통과','통과','통과']
};

const run = (M, sido, c) => {
  const e = M.findSido(sido);
  const it = { title: c.t, org: c.org, field: '', tags: c.tags };
  /* 새 판은 tags(4번째)·org(5번째)를 더 받는다 — 옛 판은 그 인자를 무시한다
     (finalize 가 넘기는 것과 **같은 꼴**로 부른다: it.tags · it.org) */
  return M.regionPass(M.regionHay(it), e, '', c.tags, c.org) ? '통과' : '제외';
};

(async () => {
  console.log('════ ① 재현 — 고치기 전(' + OLD_REF + ') 인천 업체에 **타 지역 공고가 뜬다**');
  {
    const bad = CASES.filter((c) => c.캡처);
    bad.forEach((c) => {
      ck('[옛] ' + c.t.slice(0, 34), run(OLD, '인천', c), '통과');
    });
    console.log('  → 캡처 세 건이 모두 「통과」 = 사장님이 본 그 화면을 재현했습니다.');
    /* 왜 통과하나 — 짧은 이름만 있어서 「어느 시도도 없음 = 전국 공고」로 본다 */
    ck('[옛] 정식 명칭이 있으면 걸러진다(대조)',
       run(OLD, '인천', { t: '전라남도 중소기업 지원', org: '', tags: '' }), '제외');
    ck('[옛] 해시태그는 아예 안 본다',
       run(OLD, '인천', { t: '아무 제목', org: '', tags: '2026,기술,전남' }), '통과');
  }

  console.log('\n② 고친 뒤 — 네 지역 사용자별 통과/제외 표');
  for (const sido of Object.keys(WANT)) {
    const label = sido === '광주' ? '광주광역시' : sido;
    console.log('\n  [' + label + ' 업체]');
    CASES.forEach((c, i) => {
      const got = run(NEW, sido, c);
      const want = WANT[sido][i];
      ck((got === want ? '' : '') + c.t.slice(0, 40) + (c.tags ? ' ⟨' + c.tags + '⟩' : ' ⟨태그없음⟩'),
         got, want);
    });
  }

  console.log('\n③ 전국·정부 공고가 **안 빠진다** (네 지역 모두에서 통과해야 한다)');
  {
    const 전국 = CASES.filter((c) => /중소기업 스마트공장|교육부 방과후|정책자금 융자|대전환|세종대왕|경기 침체/.test(c.t));
    Object.keys(WANT).forEach((sido) => {
      const out = 전국.filter((c) => run(NEW, sido, c) !== '통과');
      ck('[' + sido + '] 빠진 전국 공고 수', out.length, 0);
      if (out.length) console.log('      빠진 것: ' + out.map((c) => c.t).join(' | '));
    });
  }

  console.log('\n④ 해시태그(기업마당 지역 칸)가 **1순위**인가');
  {
    /* 제목에는 지역이 없고 태그만 있는 경우 — 태그로 갈린다 */
    ck('태그 전남 · 인천 업체', run(NEW, '인천', { t: '중소기업 지원사업', org: '', tags: '2026,기술,전남' }), '제외');
    ck('태그 인천 · 인천 업체', run(NEW, '인천', { t: '중소기업 지원사업', org: '', tags: '2026,기술,인천' }), '통과');
    ck('태그 전남광주 · 광주 업체', run(NEW, '광주', { t: '중소기업 지원사업', org: '', tags: '2026,기술,전남광주' }), '통과');
    ck('태그 전남광주 · 전남 업체', run(NEW, '전남', { t: '중소기업 지원사업', org: '', tags: '2026,기술,전남광주' }), '통과');
    ck('태그 전남광주 · 인천 업체', run(NEW, '인천', { t: '중소기업 지원사업', org: '', tags: '2026,기술,전남광주' }), '제외');
    ck('지역 태그가 없으면 태그를 안 본다(전국 공고)',
       run(NEW, '인천', { t: '중소기업 지원사업', org: '', tags: '2026,기술,중소벤처기업부' }), '통과');
    /* 태그가 제목과 어긋나면 **태그**를 믿는다(구조화된 칸이 강한 신호) */
    ck('제목엔 전남, 태그엔 인천 → 통과(태그 우선)',
       run(NEW, '인천', { t: '[전남] 어쩌구', org: '', tags: '2026,기술,인천' }), '통과');
  }

  console.log('\n⑤ 머리말 꺾쇠·괄호 안의 짧은 이름');
  {
    ck('[경남] … · 인천', run(NEW, '인천', { t: '[경남] 함양군 지원', org: '', tags: '' }), '제외');
    ck('(경남) … · 인천', run(NEW, '인천', { t: '(경남) 함양군 지원', org: '', tags: '' }), '제외');
    ck('【부산】… · 인천', run(NEW, '인천', { t: '【부산】 창업 지원', org: '', tags: '' }), '제외');
    ck('[전남광주·제주] … · 인천', run(NEW, '인천', { t: '[전남광주·제주] 동행축제', org: '', tags: '' }), '제외');
    ck('[전남광주·제주] … · 제주', run(NEW, '제주', { t: '[전남광주·제주] 동행축제', org: '', tags: '' }), '통과');
    ck('[인천·경기] … · 경기(우리 것이 섞여 있으면 통과)',
       run(NEW, '경기', { t: '[인천·경기] 수도권 지원', org: '', tags: '' }), '통과');
    ck('[2026년] … (시도 아님) · 인천', run(NEW, '인천', { t: '[2026년] 중소기업 지원', org: '', tags: '' }), '통과');
    ck('[중소벤처기업부] … · 인천', run(NEW, '인천', { t: '[중소벤처기업부] 공고', org: '', tags: '' }), '통과');
    ck('[모집공고] … · 인천', run(NEW, '인천', { t: '[모집공고] 소상공인 자금', org: '', tags: '' }), '통과');
  }

  console.log('\n⑥ 낱말 단위 짧은 이름 — 오탐 점검 (이름별로 정한 규칙)');
  {
    ck('「2026년 전남 4차 …」 · 인천 → 제외', run(NEW, '인천', { t: '2026년 전남 4차 지원', org: '', tags: '' }), '제외');
    ck('「2026 대전환 …」 · 인천 → 통과(대전 아님)', run(NEW, '인천', { t: '2026 대전환 시대 교육', org: '', tags: '' }), '통과');
    ck('「세종대왕 …」 · 인천 → 통과(세종 아님)', run(NEW, '인천', { t: '세종대왕 기념 공모', org: '', tags: '' }), '통과');
    ck('「경기 침체 …」 · 인천 → 통과(경기는 낱말 제외에 안 쓴다)',
       run(NEW, '인천', { t: '경기 침체 대응 융자', org: '', tags: '' }), '통과');
    ck('「경기장 시설 …」 · 인천 → 통과', run(NEW, '인천', { t: '경기장 시설 개선 지원', org: '', tags: '' }), '통과');
    ck('「제주항공 …」 · 인천 → 통과(제주 아님)', run(NEW, '인천', { t: '제주항공 협력사 지원', org: '', tags: '' }), '통과');
    ck('「강원도 …」 · 인천 → 제외', run(NEW, '인천', { t: '강원도 중소기업 지원', org: '', tags: '' }), '제외');
    ck('「전라북도 …」 · 인천 → 제외', run(NEW, '인천', { t: '전라북도 기업 지원', org: '', tags: '' }), '제외');
    ck('「대구 소상공인 …」 · 인천 → 제외', run(NEW, '인천', { t: '대구 소상공인 지원', org: '', tags: '' }), '제외');
    ck('「인천 …」 · 인천 → 통과', run(NEW, '인천', { t: '인천 소상공인 지원', org: '', tags: '' }), '통과');
  }

  console.log('\n⑦ 기관 이름으로도 걸러지나 (regionHay 에 org 가 들어 있다)');
  {
    ck('(재)전남정보문화산업진흥원 · 인천 → 제외',
       run(NEW, '인천', { t: '2026년 지역 중소기업 육성자금', org: '(재)전남정보문화산업진흥원', tags: '' }), '제외');
    ck('(재)전남정보문화산업진흥원 · 전남 → 통과',
       run(NEW, '전남', { t: '2026년 지역 중소기업 육성자금', org: '(재)전남정보문화산업진흥원', tags: '' }), '통과');
    ck('중소벤처기업부 · 인천 → 통과',
       run(NEW, '인천', { t: '2026년 지원사업', org: '중소벤처기업부', tags: '' }), '통과');
  }

  console.log('\n⑧ 필터를 안 쓰면 **아무것도 안 바뀐다**(지역 미설정)');
  {
    let same = 0;
    CASES.forEach((c) => {
      const it = { title: c.t, org: c.org, field: '', tags: c.tags };
      const o = OLD.regionPass(OLD.regionHay(it), null, '');
      const n = NEW.regionPass(NEW.regionHay(it), null, '', c.tags);
      if (o === n && n === true) same++;
    });
    ck('지역 미설정이면 전부 통과(옛 판과 같다)', same, CASES.length);
  }

  console.log('\n⑨ 시군구만 지정한 경우 (시도 없이)');
  {
    const e = null;
    ck('시군구 「남동구」 가 제목에 있으면 통과',
       NEW.regionPass('인천 남동구 소상공인 지원', null, '남동구', '') ? '통과' : '제외', '통과');
    ck('시군구만 지정 + 다른 시도 정식 명칭 → 제외',
       NEW.regionPass('전라남도 기업 지원', null, '남동구', '') ? '통과' : '제외', '제외');
    ck('시군구만 지정 + 타 지역 태그 → 제외(태그도 본다)',
       NEW.regionPass('아무 제목', null, '남동구', '2026,기술,전남') ? '통과' : '제외', '제외');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 소스의 판정 함수만 돌렸습니다');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
