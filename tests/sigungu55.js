/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드55 — 지원사업 지역 판정: **시군구 이름 겹침** (api/support-info.js)
   ① 재현 — `regionPass` 가 **우리 시군구를 맨 먼저 · 글자만** 보아 타 지역 공고가 통과한다
      · 인천 중구 ← 「[부산] 부산광역시 중구 …」  · 인천 서구 ← 「서울특별시 강**서구** …」
   ② 겹치는 시군구 이름 **전수**(중구·동구·서구·남구·북구·강서구·고성군·광주시 …)
   ③ 대조 — **맞게 통과해야 하는 것**(우리 시도 + 우리 시군구 · 「중구청」 · 전국 공고)
   ④ 낱말 단위 — 「강서구」 안의 「서구」가 안 걸리나 (51 의 짧은 이름 규칙과 **같은 함수**)
   ⑤ 51 이 지킨 것 그대로 — 전국 공고 빠짐 **0** · 「대전환」·「세종대왕」·「경기 침체」 오탐 **0**
      (시군구를 **지정한 채로도** 그대로인지 같이 본다)
   ⑥ 소스 전수 — `hasWord` 한 벌 · 시군구 줄이 **맨 뒤**인가
   ★ 기업마당·정부24 **실제 호출 0** — 소스에서 판정 함수만 뜯어 와 돌린다. */
const cp = require('child_process');
const fs = require('fs');

/* ★ 회차 기록 묶음 — **양쪽을 커밋에 못 박는다**(CLAUDE.md 검사 묶음 규칙).
   고치기 전 = v298(f0276f5) · 고친 뒤 = 작업트리(이번 회차를 보는 묶음이라 트리로 둔다). */
const OLD_REF = process.env.COS_API_OLD_REF || 'f0276f5';
const readOld = () => cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/support-info.js',
  { maxBuffer: 1 << 26 }).toString();
const readNew = () => fs.readFileSync('' + COS_ROOT + '/api/support-info.js', 'utf8');

/* 소스에서 함수들만 꺼내 돌린다 — handler 는 부르지 않는다(바깥 통신 0) */
function load(src) {
  const code = src
    .replace(/^import [^;]*;$/mg, '')
    .replace(/^export default async function handler[\s\S]*$/m, '')
    + '\nreturn { regionPass: regionPass, findSido: findSido, regionHay: regionHay,'
    + ' wordKeys: wordKeys, SIDO_LIST: SIDO_LIST,'
    + ' hasWord: typeof hasWord==="function"?hasWord:null };';
  return new Function('process', 'console', 'fetch', code)(
    { env: {} }, { log: () => {}, error: () => {} }, async () => { throw new Error('no net'); });
}
const OLD = load(readOld());
const NEW = load(readNew());
const SRC_NEW = readNew().replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(60) + String(got).slice(0, 36)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
/* 한 줄 = 「우리 업체(시도·시군구)가 이 공고를 보나」 */
const run = (M, sido, sigungu, c) => {
  const e = M.findSido(sido);
  const it = { title: c.t, org: c.org || '', field: '', tags: c.tags || '' };
  return M.regionPass(M.regionHay(it), e, sigungu, it.tags, it.org) ? '통과' : '제외';
};

/* ── 겹치는 시군구 이름 (행정구역 실제 목록) ───────────────────────────────
   같은 이름의 구·군이 여러 시도에 있다. 아래는 그 전수다(기초자치단체 기준). */
const DUP = [
  { sg: '중구',   sidos: ['서울', '부산', '대구', '인천', '대전', '울산'] },
  { sg: '동구',   sidos: ['부산', '대구', '인천', '광주', '대전', '울산'] },
  { sg: '서구',   sidos: ['부산', '대구', '인천', '광주', '대전'] },
  { sg: '남구',   sidos: ['부산', '대구', '광주', '울산'] },
  { sg: '북구',   sidos: ['부산', '대구', '광주', '울산'] },
  { sg: '강서구', sidos: ['서울', '부산'] },
  { sg: '고성군', sidos: ['강원', '경남'] },
  { sg: '광주시', sidos: ['경기'] }        /* ↔ 광주광역시 (시도 이름과 겹친다) */
];
const OFFICIAL = {};
NEW.SIDO_LIST.forEach((e) => { OFFICIAL[e.key] = e.official; });

(async () => {
  console.log('════ ① 재현 — 고치기 전(' + OLD_REF + ') 타 지역 공고가 **우리 시군구 글자로** 통과한다');
  {
    const bad = [
      { who: ['인천', '중구'], t: '[부산] 부산광역시 중구 소상공인 지원', org: '부산광역시 중구청' },
      { who: ['인천', '서구'], t: '서울특별시 강서구 소상공인 지원사업', org: '강서구청' },
      { who: ['인천', '중구'], t: '대구 중구 전통시장 지원', org: '대구 중구청' }
    ];
    bad.forEach((c) => {
      ck('[옛] ' + c.who[1] + ' 업체 ← ' + c.t.slice(0, 30), run(OLD, c.who[0], c.who[1], c), '통과');
    });
    console.log('  → 셋 다 「통과」 = 사장님이 보실 뻔한 화면을 재현했습니다.');
    bad.forEach((c) => {
      ck('[새] ' + c.who[1] + ' 업체 ← ' + c.t.slice(0, 30), run(NEW, c.who[0], c.who[1], c), '제외');
    });
    /* 왜 통과했나 — **시군구 글자가 맨 앞에서 이겼다**(강한 신호보다 먼저) */
    ck('[옛] 시군구를 안 주면 걸러진다(대조)',
      run(OLD, '인천', '', { t: '[부산] 부산광역시 중구 소상공인 지원' }), '제외');
    ck('[옛] 「강서구」 안의 「서구」도 글자로 맞아 **다른 시도 신호를 이겼다**(대조)',
      run(OLD, '인천', '서구', { t: '[서울] 강서구 지원사업' }), '통과');
    ck('[새] 그 자리는 **낱말이 아니라** 안 맞는다 → 머리말 「서울」로 제외',
      run(NEW, '인천', '서구', { t: '[서울] 강서구 지원사업' }), '제외');
    /* ★ 시도 신호가 **하나도 없는** 제목은 종전 정책대로 통과한다(전국 공고 간주) —
       「강서구 지원사업」만 있으면 어느 시도인지 알 길이 없다. 시군구 글자가 맞든 안 맞든
       답은 **통과**이고, 그래서 시군구 줄을 맨 뒤에 두어도 손해가 없다(보고문에 적었다). */
    ck('[새] 시도 신호가 없는 「강서구 지원사업」 — 종전대로 통과(전국 공고 간주)',
      run(NEW, '인천', '서구', { t: '강서구 지원사업' }), '통과');
    ck('[옛] 그때도 통과였다(이 자리는 안 바뀌었다)',
      run(OLD, '인천', '서구', { t: '강서구 지원사업' }), '통과');
  }

  console.log('\n② 겹치는 시군구 이름 전수 — 다른 시도 공고는 **모두 제외**');
  for (const d of DUP) {
    /* 우리 업체는 「인천」을 기준으로 두고(중구·동구·서구가 인천에 다 있다),
       고성군·광주시는 그 시군구가 있는 시도를 우리로 둔다 */
    const mineSido = (d.sg === '고성군') ? '강원' : (d.sg === '광주시') ? '경기' : '인천';
    const others = d.sidos.filter((k) => k !== mineSido);
    let badCnt = 0, bads = [];
    for (const k of others) {
      const t = OFFICIAL[k] + ' ' + d.sg + ' 소상공인 지원';
      if (run(NEW, mineSido, d.sg, { t: t, org: d.sg + '청' }) !== '제외') { badCnt++; bads.push(t); }
      /* 짧은 이름만 쓴 제목도 같이 (「대구 중구 …」) */
      const t2 = k + ' ' + d.sg + ' 전통시장 지원';
      if (run(NEW, mineSido, d.sg, { t: t2, org: '' }) !== '제외') { badCnt++; bads.push(t2); }
      /* 머리말로 쓴 제목도 (「[부산] 중구 …」) */
      const t3 = '[' + k + '] ' + d.sg + ' 지원';
      if (run(NEW, mineSido, d.sg, { t: t3, org: '' }) !== '제외') { badCnt++; bads.push(t3); }
    }
    ck('[' + mineSido + ' ' + d.sg + '] 다른 시도 ' + others.length + '곳 × 3꼴 → 새는 것',
      badCnt, 0);
    if (badCnt) console.log('      새는 것: ' + bads.join(' | '));
    /* 대조 — **우리 시도** 것은 통과해야 한다(검사가 살아 있다는 뜻) */
    ck('  (대조) 우리 시도 + 우리 시군구는 통과',
      run(NEW, mineSido, d.sg, { t: OFFICIAL[mineSido] + ' ' + d.sg + ' 소상공인 지원', org: d.sg + '청' }),
      '통과');
  }

  console.log('\n②-2 시도 이름과 겹치는 시군구 — 경기 **광주시** ↔ **광주**광역시');
  {
    /* 「광주시」가 있는 시도는 경기 하나라 위 고리에서는 견줄 상대가 없다 — 따로 본다 */
    ck('[경기 광주시] ← 「광주광역시 청년 고용 지원」',
      run(NEW, '경기', '광주시', { t: '광주광역시 2026년 청년 고용 지원', org: '광주광역시' }), '제외');
    ck('[경기 광주시] ← 「경기도 광주시 운영자금」 (우리 것)',
      run(NEW, '경기', '광주시', { t: '경기도 광주시 중소기업 운영자금 지원', org: '광주시청' }), '통과');
    ck('[광주광역시] ← 「경기도 광주시 운영자금」',
      run(NEW, '광주', '서구', { t: '경기도 광주시 중소기업 운영자금 지원', org: '광주시청' }), '제외');
    ck('  (옛 판) 경기 광주시 업체에 광주광역시 공고가 통과했다',
      run(OLD, '경기', '광주시', { t: '광주광역시 청년 고용 지원 (광주시 포함)', org: '광주광역시' }), '통과');
    ck('  (새 판) 제외',
      run(NEW, '경기', '광주시', { t: '광주광역시 청년 고용 지원 (광주시 포함)', org: '광주광역시' }), '제외');
  }

  console.log('\n③ 대조 — **맞게 통과해야 하는 것**은 그대로 통과한다');
  {
    const okCases = [
      ['인천광역시 중구 소상공인 지원', '', '우리 시도 정식 명칭 + 우리 시군구'],
      ['인천 중구 전통시장 지원', '', '우리 시도 짧은 이름 + 우리 시군구'],
      ['중구청 소상공인 교육 안내', '중구청', '시도 없이 우리 시군구만 (지금 정책은 통과)'],
      ['중구 지역상권 활성화 공모', '', '시도 없이 우리 시군구만'],
      ['2026년 중소기업 스마트공장 보급·확산 사업', '중소벤처기업부', '전국 공고'],
      ['2026년 교육부 방과후 돌봄 운영 지원', '교육부', '전국 공고'],
      ['소상공인 정책자금 융자 계획 공고', '소상공인시장진흥공단', '전국 공고']
    ];
    okCases.forEach((c) => {
      ck(c[2] + ' — 「' + c[0].slice(0, 26) + '」', run(NEW, '인천', '중구', { t: c[0], org: c[1] }), '통과');
    });
    /* 태그가 우리 것이면 시군구가 달라도 통과(태그는 시도 칸이다) */
    ck('우리 지역 태그 + 다른 구 — 통과',
      run(NEW, '인천', '중구', { t: '남동구 창업 지원', org: '', tags: '2026,금융,인천' }), '통과');
    /* 우리 시도 + 우리 시군구 글자가 함께 있으면, 다른 시도 신호가 있어도 통과(공동 공고) */
    ck('「[인천·부산] 중구 공동 공고」 — 통과(우리 시도 신호가 함께)',
      run(NEW, '인천', '중구', { t: '[인천·부산] 중구 공동 지원' }), '통과');
    ck('「인천광역시·부산광역시 중구 …」 — 통과(우리 정식 명칭)',
      run(NEW, '인천', '중구', { t: '인천광역시·부산광역시 중구 공동 지원' }), '통과');
  }

  console.log('\n④ 낱말 단위 — 51 의 짧은 이름 규칙과 **같은 함수**를 쓴다');
  {
    ck('`hasWord` 가 있다', NEW.hasWord ? '있다' : '없다', '있다');
    if (NEW.hasWord) {
      ck('「강서구」 안의 「서구」 — 앞이 한글이라 안 맞는다', String(NEW.hasWord('강서구 지원', '서구', true)), 'false');
      ck('「인천 서구 …」 — 맞는다', String(NEW.hasWord('인천 서구 지원', '서구', true)), 'true');
      ck('「(인천)서구 …」 — 괄호 뒤도 맞는다', String(NEW.hasWord('(인천)서구 지원', '서구', true)), 'true');
      ck('「중구청」 — 앞 경계만 보므로 맞는다(시군구)', String(NEW.hasWord('중구청 안내', '중구', true)), 'true');
      ck('「대전환」 — 뒤도 보므로 안 맞는다(짧은 이름)', String(NEW.hasWord('2026 대전환 교육', '대전')), 'false');
      ck('「세종대왕」 — 안 맞는다', String(NEW.hasWord('세종대왕 기념', '세종')), 'false');
      ck('「세종 창업 …」 — 맞는다', String(NEW.hasWord('세종 창업 지원', '세종')), 'true');
    }
    /* `wordKeys` 가 그 함수를 쓰는지 — 결과로 확인 */
    ck('`wordKeys`(「2026 대전환」) → 빈 목록', JSON.stringify(NEW.wordKeys('2026 대전환 교육')), '[]');
    ck('`wordKeys`(「대전 창업」) → 대전', JSON.stringify(NEW.wordKeys('대전 창업 지원')), '["대전"]');
  }

  console.log('\n⑤ 51 이 지킨 것 그대로 — 전국 공고 빠짐 0 · 오탐 0 (**시군구를 지정한 채로도**)');
  {
    const 전국 = [
      { t: '2026년 중소기업 스마트공장 보급·확산 사업', org: '중소벤처기업부', tags: '2026,기술,중소벤처기업부' },
      { t: '2026년 교육부 방과후 돌봄 운영 지원', org: '교육부', tags: '' },
      { t: '소상공인 정책자금 융자 계획 공고', org: '소상공인시장진흥공단', tags: '' },
      { t: '2026 대전환 시대 중소기업 경영혁신 교육', org: '중소벤처기업부', tags: '' },
      { t: '세종대왕 나신 날 기념 문화사업 공모', org: '문화체육관광부', tags: '' },
      { t: '경기 침체 대응 소상공인 특별 융자', org: '중소벤처기업부', tags: '' },
      { t: '경기장 시설 개선 지원', org: '중소벤처기업부', tags: '' },
      { t: '제주항공 협력사 지원', org: '중소벤처기업부', tags: '' }
    ];
    const 업체 = [['인천', ''], ['인천', '중구'], ['경기', '광주시'], ['강원', '고성군'],
                  ['광주', '서구'], ['전남', '']];
    업체.forEach((u) => {
      const out = 전국.filter((c) => run(NEW, u[0], u[1], c) !== '통과');
      ck('[' + u[0] + (u[1] ? ' ' + u[1] : '') + '] 빠진 전국 공고 수', out.length, 0);
      if (out.length) console.log('      빠진 것: ' + out.map((c) => c.t).join(' | '));
    });
    /* 옛 판과 **같은 답**인지 — 시군구를 안 쓰는 길은 한 줄도 안 달라져야 한다 */
    let diff = 0;
    const 표본 = 전국.concat([
      { t: '[전남광주·제주] 2026년 10월 동행축제 참여기업 모집', org: '중소벤처기업부', tags: '2026,내수,전남광주' },
      { t: '2026년 전남 4차 중소기업 연구조직 지원사업 공고', org: '(재)전남정보문화산업진흥원', tags: '2026,기술,전남' },
      { t: '[경남] 함양군 2026년 시군구연고산업육성 지원', org: '함양군', tags: '2026,경영,경남' },
      { t: '[인천] 2026년 소상공인 경영안정 자금 지원', org: '인천광역시', tags: '2026,금융,인천' },
      { t: '경기도 광주시 중소기업 운영자금 지원', org: '광주시청', tags: '2026,금융,경기' },
      { t: '광주광역시 2026년 청년 고용 지원', org: '광주광역시', tags: '2026,인력,전남광주' }
    ]);
    ['인천', '경기', '광주', '전남', '제주', '부산'].forEach((sido) => {
      표본.forEach((c) => { if (run(OLD, sido, '', c) !== run(NEW, sido, '', c)) diff++; });
    });
    ck('★ 시군구를 안 쓰면 옛 판과 **답이 같다**(다른 칸 수)', diff, 0);
  }

  console.log('\n⑥ 소스 전수 — 한 자리에서 갈리나');
  {
    ck('★ `hasWord` 가 **한 벌**', (SRC_NEW.match(/^function hasWord\(/mg) || []).length, 1);
    ck('  낱말 짧은 이름·기관명 약칭·시군구 **셋**이 그것을 쓴다',
      (SRC_NEW.match(/hasWord\(/g) || []).length, 4);     /* 선언 1 + 쓰는 곳 3 */
    ck('★ 시군구 줄이 **맨 뒤**다(전국 공고 통과 바로 앞)',
      /if \(sigungu && hasWord\(s, sigungu, true\)\) return true;\s*\n[^\n]*\n\s*return true;\s*\n\}/.test(SRC_NEW),
      true);
    ck('  (대조) 옛 판은 **맨 앞**이었다',
      /const s = String\(hay \|\| ''\);\s*\n\s*if \(sigungu && s\.indexOf\(sigungu\) >= 0\) return true;/
        .test(readOld().replace(/\r\n/g, '\n')), true);
    ck('  다른 시도 정식 명칭 제외가 시군구보다 **앞**이다',
      SRC_NEW.indexOf('return false;    /* 다른 시도 정식 명칭') < SRC_NEW.indexOf('if (sigungu && hasWord('),
      true);
    const CM = fs.readFileSync(COS_ROOT + '/CLAUDE.md', 'utf8').replace(/\r\n/g, '\n');
    ck('  CLAUDE.md 에 바뀐 순서를 적었다(「시군구를 맨 뒤로」)',
      /코스로드55에서 시군구를 맨 뒤로\*\* 옮겼다/.test(CM), true);
    ck('  CLAUDE.md 순서 ⑧ 이 시군구다',
      /⑧ 우리 \*\*시군구\*\*\(낱말 단위\)/.test(CM), true);
    ck('  CLAUDE.md 에 `hasWord` 한 벌을 적었다', /`hasWord` 한 벌/.test(CM), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 기업마당·정부24 **실제 호출 0** — 소스의 판정 함수만 돌렸습니다');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
