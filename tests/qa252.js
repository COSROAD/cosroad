/* 도우미 문답표(HELP_QA) 읽기 — 공용 한 벌.
   ★ v272 에 **다시 만들었다**. 이 파일은 작업 폴더(scratchpad)에만 있던 것이라
     새 세션에서 사라져 있었고, 이것을 부르는 묶음 **일곱 개**가
     「Cannot find module './qa252.js'」로 아예 돌지 않았다
     (j_app256 · k_app256b · n_app257 · o_app258 · p_app259 · q_app260 · c_reg253 · c_reg255).
     돌지 않는 묶음은 **통과도 실패도 아니다** — 회귀를 못 본 것이다.
   ★ 글자를 정규식으로 긁지 않는다. env246 스텁에 **앱을 그대로 올려** HELP_QA 를
     그 자리에서 평가한다 — 배열 안에 함수·따옴표·역슬래시가 있어도 실제 값과 같다. */
const E = require('./env246.js');

const cache = new Map();

/* read(src) → HELP_QA 배열 ({t, keys, a} …). src 는 index.html 전체 글자. */
function read(src) {
  const s = String(src);
  if (cache.has(s)) return cache.get(s);
  const R = E.build({ src: s, biz: 'academy' });
  if (R.error) throw R.error;
  const qa = R.ev('HELP_QA');
  if (!Array.isArray(qa)) throw new Error('HELP_QA 를 배열로 못 읽었다: ' + typeof qa);
  cache.set(s, qa);
  return qa;
}

/* 제목으로 하나 찾기 */
function byTitle(src, t) { return read(src).find((q) => q.t === t) || null; }

/* 두 판을 견준다 — 없어진 제목·새 제목·답이나 검색어가 바뀐 것 */
function diff(oldSrc, newSrc) {
  const a = read(oldSrc), b = read(newSrc);
  const at = a.map((q) => q.t), bt = b.map((q) => q.t);
  return {
    before: a.length, after: b.length,
    gone: at.filter((t) => bt.indexOf(t) < 0).sort(),
    added: bt.filter((t) => at.indexOf(t) < 0).sort(),
    changed: b.filter((q) => {
      const o = a.find((x) => x.t === q.t);
      return o && JSON.stringify(o) !== JSON.stringify(q);
    }).map((q) => q.t).sort()
  };
}

module.exports = { read, byTitle, diff };
