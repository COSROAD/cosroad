# 스텁 묶음 전수 (41에서 다시 셈 · 기준 v282).
# ★ 회차 기록 묶음은 **그 회차 커밋에 못 박아** 돈다(묶음 안에 기본값으로 박아 두었다).
# ★ qa252.js·detect.js·env246.js·drvenv.js·sendenv.js 는 묶음이 아니라 **공용 한 벌**이라 여기서 안 돈다
#   (detect.js 는 detect_check.js 가 따로 검사한다).
# ★ **돌지 않는 묶음은 통과도 실패도 아니다** — 그래서 맨 끝에 「돈 묶음 수」를 찍는다.
#   기대: 돈 묶음 76 · 통과 76 · 문제 0. 76보다 적으면 **묶음이 사라진 것이다**.
N=0; OK=0; BAD=0
run(){
  N=$((N+1)); printf "%-18s " "$1"; shift
  line=$(env "$@" 2>&1 | grep -E "(전부 통과|전부 확인|지우는 곳 없음|실패 [0-9]+건|지운다|Error|error:)" | tail -1)
  if printf '%s' "$line" | grep -qE "(전부 통과|전부 확인|지우는 곳 없음)"; then
    OK=$((OK+1)); echo "$line"
  elif [ -z "$line" ]; then
    BAD=$((BAD+1)); echo "⚠ 안 돌았다 (출력 없음)"
  else
    BAD=$((BAD+1)); echo "$line"
  fi
}
run a_otp252.js    node a_otp252.js
run a_otp253.js    node a_otp253.js
run c_reg252.js    node c_reg252.js
run c_reg253.js    node c_reg253.js
run c_reg254.js    node c_reg254.js
run c_reg255.js    node c_reg255.js
run f_api254.js    node f_api254.js
run h_api255.js    node h_api255.js
run h_ctrl255.js   node h_ctrl255.js
run g_drvload255.js node g_drvload255.js
run i_app255.js    node i_app255.js
run j_app256.js    node j_app256.js
run k_app256b.js   node k_app256b.js
run l_app256c.js   node l_app256c.js
run pages256c.js   node pages256c.js
run pdf256c.js     node pdf256c.js
run m_qa257.js     node m_qa257.js
run n_app257.js    node n_app257.js
run reach257.js    node reach257.js
run o_app258.js    node o_app258.js
run gate258.js     node gate258.js
run p_app259.js    node p_app259.js
run q_app260.js    node q_app260.js
run r_api260.js    node r_api260.js
run s_api261.js    node s_api261.js
run t_app261.js    COS_SRC_OLD_REF=b6651bc node t_app261.js
run u_api263.js    node u_api263.js
run v_app263.js    COS_SRC_OLD_REF=20046e2 node v_app263.js
run w_api264.js    node w_api264.js
run x_app264.js    COS_SRC_OLD_REF=269231d node x_app264.js
run y_api266.js    node y_api266.js
run y2_api266b.js  node y2_api266b.js
run z_app266.js    COS_SRC_OLD_REF=a542802 node z_app266.js
run a_app267.js    node a_app267.js
run b_app268.js    node b_app268.js
run bug272.js      node bug272.js
run c_app273.js    node c_app273.js
run z_api273.js    node z_api273.js
run design40.js    node design40.js
run d_app274.js    node d_app274.js
run wipe274.js     node wipe274.js
run e_app275.js    node e_app275.js
run y_api275.js    node y_api275.js
run merge277.js    node merge277.js
run alive45.js     node alive45.js
run pin46.js       node pin46.js
run expired47.js   node expired47.js
run staff49.js     node staff49.js
run helper50.js    node helper50.js
run helpersend50.js node helpersend50.js
run region51.js    node region51.js
run staffatt52.js  node staffatt52.js
run punch52.js     node punch52.js
run helperatt52b.js node helperatt52b.js
run detect_check.js node detect_check.js
run b_app253.js    node b_app253.js
run b_app253b.js   node b_app253b.js
run d_mp253c.js    node d_mp253c.js
run e_drv253d.js   node e_drv253d.js
run shtml256.js    node shtml256.js
run shtml256b.js   node shtml256b.js
run diff54.js      node diff54.js
run race54b.js     node race54b.js
run queue58.js     node queue58.js
run ro285.js       node ro285.js
run org286.js      node org286.js
run orgsep59.js    node orgsep59.js
run sync288.js     node sync288.js
run cert290.js     node cert290.js
run share291.js    node share291.js
run orgbox292.js   node orgbox292.js
run pad293.js      node pad293.js
run staff294.js    node staff294.js
run att295.js      node att295.js
run mpin296.js     node mpin296.js
run kiosk297.js    node kiosk297.js
echo "────────────────────────────────────────"
echo "돈 묶음 $N 개 · 통과 $OK · 문제 $BAD   (기대: 76 · 76 · 0)"
