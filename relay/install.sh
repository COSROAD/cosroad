#!/usr/bin/env bash
# COSROAD — 알리고 중계 서버 설치 한 벌 (v319 · 코스로드74-C)
#
# 사장님은 서버에서 **두 줄**만 치시면 됩니다:
#
#     curl -fsSL https://raw.githubusercontent.com/COSROAD/cosroad/main/relay/install.sh -o install.sh
#     sudo bash install.sh
#
# ★ `curl … | bash` 로 바로 돌리지 마세요 — 받은 뒤에 돌려야 중간에 멈췄을 때 다시 돌릴 수 있고,
#   무엇이 돌아가는지 `cat install.sh` 로 볼 수 있습니다.
#
# ★★ **두 번 돌려도 괜찮습니다**(멱등) — 이미 된 단계는 「이미 됨」으로 지나갑니다.
#   중간에 멈추면 까닭을 보여 드립니다. 고친 뒤 **그대로 다시 돌리면 이어서** 됩니다.
#
# ★★ **토큰은 이 서버가 만들고 화면에 찍지 않습니다.** Vercel 에 넣을 때만
#   `sudo cat /etc/cosroad-relay/env` 로 보세요 — 그 화면은 **아무에게도 보내지 마세요**.
#
# ★ 하는 일: 방화벽 → SSH 잠금 → Caddy → Node 20 → 토큰 → 중계 프로그램 → systemd → Caddy 설정 → 확인
# ★ **문자·알림톡은 한 통도 보내지 않습니다**(알리고로 나가는 요청 0).
# ★ 80 번 포트는 **열지 않습니다**(Caddy 가 443 만으로 인증서를 받습니다).

set -euo pipefail

# ── 정해진 값 ────────────────────────────────────────────────────────────────
REF="${COS_RELAY_REF:-main}"                 # 받아올 커밋/브랜치 (기본 main)
RAW="https://raw.githubusercontent.com/COSROAD/cosroad/${REF}/relay/relay.js"
DOMAIN="relay.cosroad.com"
RELAY_USER="cosroad-relay"
# ★ 시험용 뿌리 — **비어 있어야 정상**입니다(묶음이 임시 폴더로 두 번 돌려 봅니다).
#   `sudo` 는 환경변수를 지우므로 사장님이 돌릴 때는 **늘 비어 있습니다**.
DRY="${COS_RELAY_DRY_ROOT:-}"
ENV_DIR="${DRY}/etc/cosroad-relay"
APP_DIR="${DRY}/opt/cosroad-relay"
SSHD_MAIN="${DRY}/etc/ssh/sshd_config"
SSHD_DIR="${DRY}/etc/ssh/sshd_config.d"
SSHD_OURS="${SSHD_DIR}/00-cosroad.conf"      # ★ 이름이 **앞**일수록 이깁니다(아래 쪽지)
UNIT="${DRY}/etc/systemd/system/cosroad-relay.service"
CADDYFILE="${DRY}/etc/caddy/Caddyfile"
STAMP="$(date +%Y%m%d-%H%M%S)"

STEPS=8
declare -a RESULT=()
note() { RESULT+=("$1"); }
ok()   { printf '   ✓ %s\n' "$1"; }
skip() { printf '   • %s\n' "$1"; }
warn() { printf '   ! %s\n' "$1"; }
step() { printf '\n[%s/%s] %s\n' "$1" "$STEPS" "$2"; }
die()  {
  printf '\n   ✗ %s\n' "$1" >&2
  printf '\n멈췄습니다. 위 까닭을 고친 뒤 **같은 두 줄을 다시** 돌리시면 이어서 됩니다.\n' >&2
  exit 1
}

if [ -n "$DRY" ]; then
  printf '\n*** 시험 모드 (COS_RELAY_DRY_ROOT=%s) — 실제 서버에 쓰지 않습니다 ***\n' "$DRY"
elif [ "$(id -u)" != "0" ]; then
  die "root 로 돌려 주세요:  sudo bash install.sh"
fi

printf '\n코스로드 알리고 중계 서버 설치 — %s\n' "$DOMAIN"
printf '받아올 곳: %s\n' "$RAW"

# ── [1/8] 방화벽 ─────────────────────────────────────────────────────────────
# ★★ **22 를 먼저 허용하고, 눈으로 본 뒤에** 켭니다. 순서가 바뀌면 그 자리에서 끊깁니다.
#   허용할 IP 는 **지금 접속한 그 IP** 입니다 — 못 찾으면 **아예 켜지 않고 멈춥니다**.
step 1 "방화벽(ufw) — 지금 접속한 IP 로 22 허용 → 443 → 확인 뒤 켜기"
myip=""
# ① sudo 가 남겨 준 것이 있으면 그것
for v in "${SSH_CLIENT:-}" "${SSH_CONNECTION:-}"; do
  [ -z "$myip" ] && [ -n "$v" ] && myip="$(printf '%s' "$v" | awk '{print $1}')"
done
# ② sudo 가 지웠으면 — 로그인 기록에서(괄호 안 주소)
if [ -z "$myip" ]; then
  myip="$(who am i 2>/dev/null | sed -n 's/.*(\([^)]*\)).*/\1/p' | head -1 || true)"
fi
# ③ 그래도 없으면 — 22 번으로 이어진 연결에서
if [ -z "$myip" ]; then
  myip="$(ss -Htn state established '( sport = :22 )' 2>/dev/null \
          | awk '{print $5}' | sed 's/:[0-9]*$//' | sed 's/^\[//; s/\]$//' | head -1 || true)"
fi
case "$myip" in
  ''|'localhost'|'127.0.0.1'|'::1'|*[!0-9.:a-fA-F]*)
    die "지금 접속한 IP 를 찾지 못했습니다(찾은 값: '${myip}'). 방화벽을 켜지 않았습니다.
      SSH 로 들어온 창에서 돌려 주세요. 그래도 안 되면 이 한 줄을 먼저 알려 주세요:
        echo \"\$SSH_CLIENT\" ; who am i" ;;
esac
ok "지금 접속한 IP: ${myip}"
ufw allow from "$myip" to any port 22 proto tcp >/dev/null
ok "22 허용 (${myip} 에서만)"
ufw allow 443/tcp >/dev/null
ok "443 허용 (누구나 — Caddy 가 받습니다)"
st="$(ufw status 2>/dev/null || true)"
printf '%s\n' "$st" | grep -q '22' || die "22 허용 줄이 안 보입니다 — 켜지 않았습니다."
printf '%s\n' "$st" | grep -q '443' || die "443 허용 줄이 안 보입니다 — 켜지 않았습니다."
ok "두 줄 다 확인했습니다"
if printf '%s\n' "$st" | grep -qi 'Status: active'; then
  skip "ufw 는 이미 켜져 있습니다"
else
  ufw --force enable >/dev/null
  ok "ufw 켰습니다 (80 은 열지 않았습니다)"
fi
note "1 방화벽 ✓ (22=${myip} · 443 · 80 안 열림)"

# ── [2/8] SSH 잠금 ───────────────────────────────────────────────────────────
# ★★ sshd 는 **처음 읽은 값**이 이깁니다(공식 man sshd_config:
#   "for each keyword, the first obtained value will be used" · Include 는 **이름 차례**).
#   그래서 우리 설정은 **00-** 입니다. 99- 에 두면 50-cloud-init.conf 가 먼저 읽혀 집니다.
step 2 "SSH 잠금 — 비밀번호 로그인 끄기(키로만)"
keys="$(eval echo "~ubuntu")/.ssh/authorized_keys"
[ -n "$DRY" ] && keys="${DRY}/home/ubuntu/.ssh/authorized_keys"
if [ ! -s "$keys" ]; then
  warn "ubuntu 계정에 등록된 키가 없습니다(${keys})."
  warn "지금 잠그면 **아무도 못 들어옵니다** → 이 단계를 건너뜁니다."
  note "2 SSH 잠금 • 건너뜀 (ubuntu 계정에 키가 없어서 — 잠그면 아무도 못 들어옵니다)"
else
  ok "ubuntu 계정 키 확인"
  mkdir -p "$SSHD_DIR"
  if [ -f "$SSHD_OURS" ] \
     && grep -q '^PasswordAuthentication no$' "$SSHD_OURS" \
     && grep -q '^PermitRootLogin prohibit-password$' "$SSHD_OURS"; then
    skip "00-cosroad.conf 가 이미 있습니다"
  else
    [ -f "$SSHD_OURS" ] && cp -a "$SSHD_OURS" "${SSHD_OURS}.bak-${STAMP}"
    cat > "$SSHD_OURS" <<'EOF'
# COSROAD 중계 서버 — 키로만 들어옵니다 (install.sh)
# ★ 이름이 00- 인 까닭: sshd 는 **처음 읽은 값**이 이기고 Include 는 이름 차례로 읽습니다.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
    ok "00-cosroad.conf 썼습니다"
  fi
  # 본 파일에서 Include **위**에 같은 키워드가 있으면 그것이 이깁니다 — 줄 번호로 봅니다
  if [ -f "$SSHD_MAIN" ]; then
    inc="$(grep -nE '^[[:space:]]*Include' "$SSHD_MAIN" | head -1 | cut -d: -f1 || true)"
    if [ -n "$inc" ]; then
      above="$(grep -nE '^[[:space:]]*(PasswordAuthentication|PermitRootLogin|KbdInteractiveAuthentication)' \
               "$SSHD_MAIN" | awk -F: -v i="$inc" '$1 < i {print $0}' || true)"
      if [ -n "$above" ]; then
        warn "본 파일에서 Include(${inc}행) **위**에 같은 키워드가 있습니다 — 그것이 이깁니다:"
        printf '%s\n' "$above" | sed 's/^/       /'
        warn "아래 확인에서 어긋나면 그 줄을 # 로 막아 주세요."
      else
        ok "본 파일 Include 위에 겹치는 줄 없음"
      fi
    fi
  fi
  # 글 검사 → 읽힌 값 확인 → **어긋나면 되돌리고 멈춤**(reload 하지 않음)
  if [ -z "$DRY" ]; then sshd -t || die "sshd 설정 글에 잘못된 곳이 있습니다(sshd -t)."; fi
  eff="$(sshd -T 2>/dev/null | tr 'A-Z' 'a-z' || true)"
  bad=""
  printf '%s\n' "$eff" | grep -q '^passwordauthentication no$'       || bad="${bad} passwordauthentication"
  printf '%s\n' "$eff" | grep -q '^permitrootlogin prohibit-password$' || bad="${bad} permitrootlogin"
  printf '%s\n' "$eff" | grep -q '^kbdinteractiveauthentication no$'  || bad="${bad} kbdinteractiveauthentication"
  if [ -n "$bad" ]; then
    rm -f "$SSHD_OURS"
    [ -f "${SSHD_OURS}.bak-${STAMP}" ] && mv "${SSHD_OURS}.bak-${STAMP}" "$SSHD_OURS"
    die "읽힌 값이 기대와 다릅니다(${bad}). **되돌렸고 reload 하지 않았습니다** — 지금 로그인은 그대로입니다.
      우리보다 **앞에 있는 파일**이 그 값을 들고 있을 수 있습니다. 이 두 줄로 찾으세요:
        ls /etc/ssh/sshd_config.d/
        sudo grep -n 'PasswordAuthentication\\|PermitRootLogin' /etc/ssh/sshd_config.d/*.conf"
  fi
  ok "읽힌 값 셋 확인 (passwordauthentication no · permitrootlogin prohibit-password · kbdinteractive no)"
  if [ -z "$DRY" ]; then systemctl reload ssh; fi
  ok "ssh 다시 읽었습니다"
  warn "★ 지금 이 창은 닫지 마세요. **새 창으로 한 번 더 접속**해 보신 뒤에 닫으세요."
  note "2 SSH 잠금 ✓ (00-cosroad.conf · 키로만)"
fi

# ── [3/8] Caddy ──────────────────────────────────────────────────────────────
step 3 "Caddy 설치 (HTTPS·인증서 자동)"
if command -v caddy >/dev/null 2>&1; then
  skip "이미 있습니다 ($(caddy version 2>/dev/null | head -1))"
else
  apt-get update -qq
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
  ok "설치했습니다"
fi
command -v caddy >/dev/null 2>&1 || die "caddy 가 설치되지 않았습니다."
note "3 Caddy ✓"

# ── [4/8] Node 20 ────────────────────────────────────────────────────────────
step 4 "Node 20 설치"
nv="$(node -v 2>/dev/null || true)"
case "$nv" in
  v2[0-9].*|v2[0-9]) skip "이미 있습니다 (${nv})" ;;
  *)
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
    apt-get install -y -qq nodejs
    nv="$(node -v 2>/dev/null || true)"
    ok "설치했습니다 (${nv})"
    ;;
esac
case "$nv" in
  v2[0-9].*|v2[0-9]) ok "판 확인 ${nv}" ;;
  *) die "Node 20 이상이 아닙니다(찾은 값: '${nv}')." ;;
esac
note "4 Node ✓ (${nv})"

# ── [5/8] 토큰 ───────────────────────────────────────────────────────────────
# ★★ **서버가 만듭니다 · 화면에 찍지 않습니다 · 이미 있으면 그대로 둡니다**
#   (바꾸면 Vercel 에 넣어 둔 값과 어긋나 문자가 전부 막힙니다.)
step 5 "중계 토큰 만들기 (화면에 찍지 않습니다)"
mkdir -p "$ENV_DIR"
chmod 700 "$ENV_DIR" 2>/dev/null || true
if [ -s "${ENV_DIR}/env" ] && grep -q '^RELAY_TOKEN=.\{16,\}$' "${ENV_DIR}/env"; then
  skip "이미 있습니다 — 그대로 둡니다(바꾸면 Vercel 과 어긋납니다)"
else
  umask 077
  { printf 'RELAY_TOKEN='; openssl rand -hex 32; } > "${ENV_DIR}/env"
  chmod 600 "${ENV_DIR}/env"
  chown root:root "${ENV_DIR}/env" 2>/dev/null || true
  ok "만들어 ${ENV_DIR}/env 에 넣었습니다 (권한 600)"
fi
grep -q '^RELAY_TOKEN=.\{16,\}$' "${ENV_DIR}/env" || die "토큰 파일이 올바르지 않습니다(${ENV_DIR}/env)."
note "5 토큰 ✓ (화면에 안 찍음)"

# ── [6/8] 중계 프로그램 ──────────────────────────────────────────────────────
step 6 "중계 프로그램 받기 (${REF})"
id -u "$RELAY_USER" >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin "$RELAY_USER" 2>/dev/null || true
mkdir -p "$APP_DIR"
# ★★ 받는 파일 이름은 **`.js` 로 끝나야 합니다** — `node --check` 는 확장자로 꼴을 가리므로
#   `mktemp` 의 확장자 없는 이름을 주면 「ERR_UNKNOWN_FILE_EXTENSION」으로 **거짓 실패**합니다
#   (묶음이 실제로 그렇게 걸렸습니다). 같은 폴더에 두어 `mv` 가 한 번에 끝나게도 합니다.
tmp="${APP_DIR}/relay.new.js"
rm -f "$tmp"
curl -fsSL "$RAW" -o "$tmp" || die "받지 못했습니다: ${RAW}"
[ -s "$tmp" ] || die "받은 파일이 비어 있습니다: ${RAW}"
grep -q "RELAY_TOKEN" "$tmp" || die "받은 파일이 중계 프로그램이 아닌 것 같습니다."
node --check "$tmp" || die "받은 중계 프로그램의 글이 성하지 않습니다(node --check)."
ok "글 검사 통과"
if [ -f "${APP_DIR}/relay.js" ] && cmp -s "$tmp" "${APP_DIR}/relay.js"; then
  skip "이미 같은 것이 있습니다"
  rm -f "$tmp"
else
  mv "$tmp" "${APP_DIR}/relay.js"
  chmod 644 "${APP_DIR}/relay.js"
  chown -R "${RELAY_USER}:${RELAY_USER}" "$APP_DIR" 2>/dev/null || true
  ok "${APP_DIR}/relay.js 에 넣었습니다"
fi
note "6 중계 프로그램 ✓"

# ── [7/8] systemd ────────────────────────────────────────────────────────────
step 7 "systemd 등록 (꺼지면 되살림)"
mkdir -p "$(dirname "$UNIT")"
new_unit="$(mktemp)"
cat > "$new_unit" <<EOF
[Unit]
Description=COSROAD aligo relay
After=network-online.target
Wants=network-online.target

[Service]
User=${RELAY_USER}
EnvironmentFile=/etc/cosroad-relay/env
ExecStart=/usr/bin/node /opt/cosroad-relay/relay.js
Restart=always
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
RestrictAddressFamilies=AF_INET AF_INET6

[Install]
WantedBy=multi-user.target
EOF
if [ -f "$UNIT" ] && cmp -s "$new_unit" "$UNIT"; then
  skip "같은 내용이 이미 있습니다"
  rm -f "$new_unit"
else
  [ -f "$UNIT" ] && cp -a "$UNIT" "${UNIT}.bak-${STAMP}"
  mv "$new_unit" "$UNIT"
  ok "등록했습니다"
fi
if [ -z "$DRY" ]; then
  systemctl daemon-reload
  systemctl enable cosroad-relay >/dev/null 2>&1 || true
  systemctl restart cosroad-relay
  sleep 1
  systemctl is-active --quiet cosroad-relay \
    || die "중계가 돌지 않습니다. 이 줄로 까닭을 보세요:  sudo journalctl -u cosroad-relay -n 30 --no-pager"
  ok "돌고 있습니다 (active)"
fi
note "7 systemd ✓"

# ── [8/8] Caddy 설정 + 확인 ──────────────────────────────────────────────────
step 8 "Caddy 설정 · 확인 (문자는 한 통도 안 보냅니다)"
mkdir -p "$(dirname "$CADDYFILE")" "${DRY}/var/log/caddy"
new_cf="$(mktemp)"
cat > "$new_cf" <<EOF
${DOMAIN} {
	request_body {
		max_size 64KB
	}
	@ok path /a/sms /a/alimtalk /healthz
	handle @ok {
		reverse_proxy 127.0.0.1:8080
	}
	handle {
		respond 404
	}
	log {
		output file /var/log/caddy/relay.log
		format console
	}
}
EOF
if [ -f "$CADDYFILE" ] && cmp -s "$new_cf" "$CADDYFILE"; then
  skip "Caddyfile 이 이미 같습니다"
  rm -f "$new_cf"
else
  [ -f "$CADDYFILE" ] && cp -a "$CADDYFILE" "${CADDYFILE}.bak-${STAMP}"
  mv "$new_cf" "$CADDYFILE"
  ok "Caddyfile 썼습니다 (앞 파일은 .bak-${STAMP} 로 남겼습니다)"
fi
if [ -z "$DRY" ]; then
  caddy validate --config "$CADDYFILE" >/dev/null 2>&1 \
    || die "Caddyfile 에 잘못된 곳이 있습니다(caddy validate)."
  ok "Caddyfile 글 검사 통과"
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
  ok "Caddy 다시 읽었습니다"

  # ① 중계만 (집 안에서)
  curl -fsS --max-time 5 http://127.0.0.1:8080/healthz 2>/dev/null | grep -q '"ok":true' \
    || die "중계가 안 답합니다(127.0.0.1:8080/healthz)."
  ok "① 중계 살아있음 {\"ok\":true}"

  # ② 밖에서 — 인증서를 받는 데 1~2분 걸립니다(최대 3분 기다립니다)
  pub=""
  for i in $(seq 1 36); do
    if curl -fsS --max-time 5 "https://${DOMAIN}/healthz" 2>/dev/null | grep -q '"ok":true'; then
      pub="yes"; break
    fi
    [ "$i" = "1" ] && printf '   … 인증서를 받는 중입니다(최대 3분)'
    printf '.'
    sleep 5
  done
  printf '\n'
  if [ -z "$pub" ]; then
    warn "https://${DOMAIN}/healthz 가 아직 안 됩니다."
    warn "  · DNS: getent hosts ${DOMAIN}   (1.201.109.4 여야 합니다)"
    warn "  · 443: 가비아 보안 그룹에 열려 있나"
    warn "  · 기록: sudo journalctl -u caddy -n 30 --no-pager"
    note "8 확인 ✗ ② 밖에서 아직 안 됨 (위 세 줄을 보신 뒤 다시 돌려 주세요)"
  else
    ok "② 밖에서도 살아있음 https://${DOMAIN}/healthz"
    # ③ 토큰 없이 보내면 401
    c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 -X POST "https://${DOMAIN}/a/sms" \
         -H 'Content-Type: application/x-www-form-urlencoded' --data 'x=1' || true)"
    [ "$c" = "401" ] || die "토큰 없이 보냈을 때 401 이 아닙니다(받은 값: ${c})."
    ok "③ 토큰 없이 보내면 401"
    # ④ 모르는 경로는 404
    c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "https://${DOMAIN}/a/xyz" || true)"
    [ "$c" = "404" ] || die "모르는 경로에서 404 가 아닙니다(받은 값: ${c})."
    ok "④ 모르는 경로는 404"
    note "8 확인 ✓ (살아있음 · 401 · 404)"
  fi
fi

# ── 끝 요약 (비밀 값 0 — 이 화면은 그대로 보여 주셔도 됩니다) ─────────────────
printf '\n────────────────────────────────────────\n'
printf '설치 요약  (✓ 했음 · • 건너뜀 · ✗ 아직 안 됨)\n'
for r in "${RESULT[@]}"; do printf '  %s\n' "$r"; done
printf '────────────────────────────────────────\n'
printf '\n다음에 하실 일\n'
printf '  1) 알리고에 발송 서버 IP **1.201.109.4** 를 등록하고 승인을 기다립니다.\n'
printf '     ★ 알림톡(kakaoapi)도 같은 IP 가 필요한지 함께 물어보세요 (02-511-4560).\n'
printf '  2) 승인된 **뒤에** Vercel 환경변수 둘을 넣고 다시 배포합니다.\n'
printf '       ALIGO_RELAY_URL   = https://%s\n' "$DOMAIN"
printf '       ALIGO_RELAY_TOKEN = (아래 줄로 보신 값 · Secret 으로)\n'
printf '         sudo cat /etc/cosroad-relay/env\n'
printf '       ★ 그 화면은 **아무에게도 보내지 마세요**(클로드에게도).\n'
printf '  3) 넣은 뒤 _test 업체에서 문자 1통만 보내 확인합니다.\n'
printf '\n이 설치로 문자·알림톡은 **한 통도 나가지 않았습니다.**\n'
printf '다시 돌려도 괜찮습니다 — 이미 된 단계는 지나갑니다.\n'
