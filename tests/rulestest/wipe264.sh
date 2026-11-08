# 에뮬레이터에 남은 지난 실행 자료를 지운다.
# ★ 안 지우면 create 검사가 **이미 있는 문서**를 만나 update 로 바뀌어 거짓 실패가 난다
#   (v264 에서 겪었다 — t252 「익명이 문의 보내기」·t257·t263 의 백업/공유 만들기).
for p in cos-v250 cos-v252 cos-v253 cos-v253b cos-v253c cos-v253d cos-v254 cos-v255 \
         cos-v257 cos-v257-old cos-v258 cos-v258-old cos-v261 cos-v261-old \
         cos-v263 cos-v263-old cos-v264-new cos-v264-old cos-v266-new cos-v266-old \
         cos-v272-new cos-v272-old cos-v273 cos-d40 \
         cos-274-new cos-274-old cos-275-new cos-275-old cos-276 cos-45 cos-49 cos-50; do
  curl -s --max-time 5 -X DELETE "http://127.0.0.1:8988/emulator/v1/projects/$p/databases/(default)/documents" -o /dev/null
done
echo "에뮬레이터 자료 비움"
