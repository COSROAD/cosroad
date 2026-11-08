# 크롬(Playwright) 묶음 전수 — 41에서 다시 셈. 네 크기(폰·작은폰·태블릿·데스크톱)는 묶음 안에서 돈다.
# ★ 묶음이 아닌 둘은 여기서 안 돈다 — `run268_seed.js`(**씨앗 자료**, 다른 묶음이 require 한다)와
#   `run262.js`(**측정 도구**: 화면 글자를 떠서 `res_262.json` 에 남긴다 · 통과·실패를 내지 않는다).
#   41에서 run262 를 묶음으로 세었다가 「문제 1건」으로 잡혔다 — **통과 문구가 없는 것은 묶음이 아니다.**
# ★ 맨 끝에 「돈 묶음 수」를 찍는다. 기대: 25 · 25 · 0.
N=0; OK=0; BAD=0
for f in run263.js run264.js run265.js run266.js run267.js run268.js run269.js run270.js run271.js run271b.js run272.js run273.js run273b.js run274.js run275.js run276.js run277.js run278.js run279.js run280.js run281.js run282.js run283.js run284.js run285.js; do
  N=$((N+1)); printf "%-12s " "$f"
  line=$(node $f 2>&1 | grep -E "(전부 통과|전부 확인|실패 [0-9]+건|Error|error:)" | tail -1)
  if printf '%s' "$line" | grep -qE "(전부 통과|전부 확인)"; then OK=$((OK+1)); echo "$line"
  elif [ -z "$line" ]; then BAD=$((BAD+1)); echo "⚠ 안 돌았다 (출력 없음)"
  else BAD=$((BAD+1)); echo "$line"; fi
done
echo "────────────────────────────────────────"
echo "돈 묶음 $N 개 · 통과 $OK · 문제 $BAD   (기대: 25 · 25 · 0)"
