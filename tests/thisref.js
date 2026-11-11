/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* **회차 커밋 찾기 한 벌** (v314 · 코스로드70 에서 만들었다 — 묶음이 아니다 · 돌림판에 적지 않는다).
   회차 기록 묶음은 「그 회차가 약속한 것」을 **그 커밋에서** 재야 한다(CLAUDE.md 검사 묶음 규칙).
   ★★ **제목(subject)만 본다.** 전에는 `git log --fixed-strings --grep=(v313)` 이었는데
     `--grep` 은 **본문까지** 보므로, 뒷 회차 커밋 본문에 「(v313)」 같은 글자가 들어가면
     **그 커밋이 잡혔다**(v314 커밋 본문에 「(v313) 삭제」라고 적었더니 `kiosk69` 가 10칸 깨졌다 —
     고친 코드와 무관한 거짓 실패였다).
   ★ 커밋 제목 꼴은 「무엇을 했는지 (v버전)」이다(커밋 규칙) → **제목이 `(v313)` 으로 끝나는**
     가장 최근 커밋 하나를 고른다.
   ★ 못 찾으면 빈 글자를 돌려준다 — 부르는 쪽이 「작업트리」로 떨어진다(지금 회차는 그게 맞다).
   ★ `COS_API_NEW_REF` 가 있으면 그것이 이긴다(종전 그대로). */
const cp = require('child_process');
const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);

function thisRef(ver) {
  if (process.env.COS_API_NEW_REF) return process.env.COS_API_NEW_REF;
  const want = '(v' + String(ver) + ')';
  try {
    const out = cp.execSync('git -C ' + COS_ROOT + ' log --format=%H%x09%s -400',
      { maxBuffer: 1 << 24 }).toString();
    const row = out.split(LF).find((x) => {
      const i = x.indexOf(TAB);
      return i > 0 && x.slice(i + 1).trim().endsWith(want);
    }) || '';
    const id = row.split(TAB)[0] || '';
    return /^[0-9a-f]{7,}$/.test(id) ? id : '';
  } catch (e) { return ''; }
}
/* ★★ v315(72-B): **그 회차 커밋의 `index.html`** 한 벌.
   「이 회차에 문답(HELP_QA) 수가 안 늘었다」처럼 **그 회차를 두고 한 약속**은
   작업트리로 재면 **뒷 회차가 문답을 하나 더할 때마다 거짓으로 깨진다**
   (v315 에 아홉 묶음이 그랬다 — CLAUDE.md 「기대값이 가리키는 회차에 맞춘다」).
   → 그런 검사는 `srcAt(THIS_REF)` 로 **그 커밋의 글**을 읽는다.
   커밋 전(THIS_REF 가 빈 글자)에는 **작업트리**를 읽는다 — 지금 회차는 그게 맞다. */
function srcAt(ref, file) {
  const f = file || 'index.html';
  const LFfix = (x) => x.split(String.fromCharCode(13) + String.fromCharCode(10))
    .join(String.fromCharCode(10));
  if (!ref) return LFfix(require('fs').readFileSync(COS_ROOT + '/' + f, 'utf8'));
  return LFfix(cp.execSync('git -C ' + COS_ROOT + ' show ' + ref + ':' + f,
    { maxBuffer: 1 << 28 }).toString());
}
module.exports = { thisRef: thisRef, srcAt: srcAt };
