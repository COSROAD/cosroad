# tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지).
COS_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
# 에뮬레이터(규칙) 묶음 전수 — 41에서 다시 셈.
# ★ 규칙 사본을 매번 새로 받고 **줄끝을 LF 로 맞춘다**(작업트리 CRLF ≠ 배포본 LF).
# ★ probe37.mjs 는 묶음이 아니다 — 자기 probe37.rules 를 올리는 **조사용**이라 여기서 안 돈다.
# ★ 맨 끝에 「돈 묶음 수」를 찍는다. 기대: 27 · 27 · 0.
tr -d '\r' < "$COS_ROOT"/firestore.rules > firestore.rules
# ★ v308(67-B): Storage 규칙 사본도 매번 새로 받는다(s67.mjs 가 읽는다 · LF 로 맞춘다).
# ★ s67.mjs 는 **firestore,storage 를 함께** 띄우고 --project cos-s67 로 해야 돈다(교차 규칙).
tr -d '\r' < "$COS_ROOT"/storage.rules > storage.rules
sh wipe264.sh > /dev/null
N=0; OK=0; BAD=0
for f in t250.mjs t252.mjs t253.mjs t253b.mjs t253c.mjs t253d.mjs t254.mjs t255.mjs t257.mjs t258.mjs t261.mjs t263.mjs t264.mjs t266.mjs t272.mjs d273.mjs d40.mjs t274.mjs t275.mjs t276.mjs t45.mjs t49.mjs t50.mjs t296.mjs s67.mjs t68.mjs t72.mjs; do
  N=$((N+1)); printf "%-12s " "$f"
  sh wipe264.sh > /dev/null
  line=$(node $f 2>/dev/null | tail -1)
  if printf '%s' "$line" | grep -q "전부 통과"; then OK=$((OK+1)); echo "$line"
  elif [ -z "$line" ]; then BAD=$((BAD+1)); echo "⚠ 안 돌았다 (출력 없음)"
  else BAD=$((BAD+1)); echo "$line"; fi
done
echo "────────────────────────────────────────"
echo "돈 묶음 $N 개 · 통과 $OK · 문제 $BAD   (기대: 27 · 27 · 0)"
