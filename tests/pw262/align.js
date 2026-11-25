/* 묶음이 아니다 — **공용 헬퍼**다(돌림판에 적지 않는다 · `probe68.js` 와 같은 자리).
   ★★ 왜 있는가 — **크롬이 `align-items:flex-start` 의 계산값 이름을 바꿨다.**
     소스는 그대로 `align-items:flex-start` 인데(`index.html` 에 30곳),
     `getComputedStyle(...).alignItems` 가 **`flow-start`** 로 나온다.
     실측: 크롬 **158.0.8127.88** · `<div style="display:flex;align-items:flex-start">` →
     계산값 **`flow-start`**. (CSS Box Alignment 의 이름이고 뜻은 같다.)
   → 그래서 `run263`·`run264`·`run293` 세 묶음이 **한꺼번에** 거짓으로 깨졌다
     (v320 커밋 소스로도 똑같이 깨진다 — 대조로 확인했다 · 코스로드76).
   ★ 74-C 보정2 의 ★★★ 교훈과 **같은 꼴**이다 — `sshd -T` 가 `prohibit-password` 를
     옛 이름 `without-password` 로 찍던 그것. **두 이름을 둘 다 맞음으로 받는다**
     (판이 올라가도, 내려가도 안 깨진다).
   ★ 가운데 맞춤(`center`)은 **여기서 받지 않는다** — v262 가 금지한 값이다(그건 잡아야 한다). */
const FLEX_START = ['flex-start', 'flow-start', 'start'];

/* 덮개의 세로 맞춤이 「위에서 시작」인가 */
function isFlexStart(v) {
  return FLEX_START.indexOf(String(v || '')) >= 0;
}

module.exports = { FLEX_START: FLEX_START, isFlexStart: isFlexStart };
