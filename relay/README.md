# 알리고 중계 서버 — 설치 글 (v319 · 코스로드74-B)

알리고가 **고정 IP만** 받게 바뀌었습니다. Vercel 함수는 나가는 IP 가 바뀌므로, **알리고 호출만**
이 서버(공인 IP 하나)를 거쳐 나가게 합니다 → 알리고가 보는 IP 는 **늘 같습니다**.

- 서버: 가비아 클라우드 **cosroad-relay** · Ubuntu 24.04 · Micro · 공인 IP **1.201.109.4**
- 주소: **`https://relay.cosroad.com`** (가비아 DNS · `cosroad.com` apex 는 **안 건드립니다**)
- 서비스 **둘**: **Caddy**(HTTPS·인증서 자동) → **Node 문지기**(`127.0.0.1:8080` · 이 폴더 `relay.js`)
- 중계는 **몸통을 읽지 않고 바이트 그대로** 넘깁니다. **알리고 키는 Vercel 에만** 있습니다.
- 중계는 **다시 보내지 않습니다(재시도 0)** — 문자는 두 번 보내면 두 번 갑니다.

> ★★ **토큰·SSH 키·비밀번호는 사장님만 가집니다.** 이 글에는 비밀 값이 **하나도 없습니다**.
> 토큰은 **서버가 스스로 만들고 화면에 찍지 않습니다**. **누구에게도(클로드에게도) 보내지 마세요.**

---

# ★ 설치 — SSH 창에서 **이 두 줄만**

```
curl -fsSL https://raw.githubusercontent.com/COSROAD/cosroad/main/relay/install.sh -o install.sh
sudo bash install.sh
```

- 방화벽 → SSH 잠금 → Caddy → Node 20 → 토큰 → 중계 프로그램 → systemd → Caddy 설정 → 확인,
  **여덟 단계를 한 번에** 합니다. 단계마다 `✓` 가 찍히고, 막히면 **까닭 한 줄**을 보여 주고 멈춥니다.
- ★★ **두 번 돌려도 괜찮습니다**(멱등). 멈춘 곳을 고친 뒤 **같은 두 줄을 그대로 다시** 돌리시면
  이미 된 단계는 지나가고 이어서 됩니다.
- ★ **`| bash` 로 바로 돌리지 마세요** — 받은 뒤에 돌려야 다시 돌릴 수 있고, `cat install.sh` 로
  무엇이 돌아가는지 보실 수 있습니다.
- ★ **문자·알림톡은 한 통도 나가지 않습니다.** 80 번 포트도 열지 않습니다.
- ★ 끝 화면(설치 요약)에는 **비밀 값이 없습니다** — 그대로 보여 주셔도 됩니다.

**그 전에 가비아 콘솔에서 두 가지**(아래 ⓞ) · **그 뒤에 알리고·Vercel**(아래 ⓘ·ⓙ)이 남습니다.

---

## 차례 (위에서 아래로)

| 단계 | 어디서 | 무엇 |
|---|---|---|
| ⓞ | **가비아 콘솔** | DNS `relay` A → 1.201.109.4 · 보안 그룹 **443 추가** |
| ★ | **SSH** | **위 두 줄**(`install.sh`) — 아래 ⓐ~ⓗ 를 한 번에 합니다 |
| ⓘ | **알리고** | 1.201.109.4 **IP 신청**(승인까지 기다립니다) |
| ⓙ | **Vercel** | `ALIGO_RELAY_URL`·`ALIGO_RELAY_TOKEN` 넣기 — **알리고 승인 뒤에** |

★★ **ⓙ를 ⓘ보다 먼저 하면 안 됩니다** — 승인 전 IP 로 나가 문자가 **전부 실패**합니다.
설치까지 해 두면 중계는 **아무 일도 하지 않고 기다립니다**(앱은 아직 바로 보냅니다).

> **아래 ⓐ~ⓗ 는 「손으로 할 때」 참고입니다** — 스크립트가 하는 일을 그대로 적어 둔 것입니다.
> 두 줄로 설치하셨다면 **ⓘ 로 건너뛰셔도 됩니다.**

---

## ⓞ 가비아 콘솔 (사장님)

1. **DNS** — `cosroad.com` 관리 → 레코드 추가
   - 타입 **A** · 호스트 **`relay`** · 값 **`1.201.109.4`** (TTL 기본)
   - ★ `@`(apex)와 `www` 는 **그대로 두세요** — GitHub Pages 가 쓰고 있습니다.
   - 확인: 잠시 뒤 `nslookup relay.cosroad.com` 이 1.201.109.4 를 돌려주면 됩니다.
2. **보안 그룹 `relay-sg`** — 들어옴에 **TCP 443** 추가 (출처 `0.0.0.0/0`)
   - SSH 22 는 **사무실 IP 하나만** 그대로 두세요.
   - **80 은 열지 않습니다** — Caddy 가 443 만으로 인증서를 받습니다(TLS-ALPN-01).
     ⓖ 에서 인증서가 안 나오면 **그때만** 80 을 잠깐 열고, 받은 뒤 다시 닫습니다.

---

## ⓐ 서버 다지기 (SSH)

★★ **ufw 를 켜기 전에 22 허용 줄을 먼저** 넣습니다. 순서가 바뀌면 **그 자리에서 끊깁니다.**

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install ufw fail2ban unattended-upgrades curl

# 방화벽 — 22 를 **먼저** 허용하고 그 다음에 켭니다
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <사무실IP> to any port 22 proto tcp     # ← 사장님 사무실 IP
sudo ufw allow 443/tcp
# ★★ 켜기 **전**에는 `ufw status` 가 아니라 **`ufw show added`** 로 봅니다 —
#    꺼져 있으면 `status` 는 `Status: inactive` **한 줄만** 내고 더한 규칙을 안 보여 줍니다
#    (공식 man ufw 의 `added` 보고: 「displays the list of rules as they were added on the
#     command-line」 · 「does not show the status of the running firewall」).
sudo ufw show added                                          # 22·443 이 보이는지 눈으로 확인
sudo ufw --force enable
sudo ufw status                                              # 켠 뒤에는 이것으로 봅니다

sudo systemctl enable --now fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades              # 「예」
```

> ★ **사무실 IP 가 바뀌어 SSH 가 막히면?** 가비아 콘솔의 **웹 콘솔(VNC/원격 접속)** 로 들어가
> `sudo ufw allow from <새IP> to any port 22 proto tcp` 를 넣으면 됩니다. 서버를 다시 만들 필요 없습니다.
> (보안 그룹 쪽 22 출처도 가비아 콘솔에서 같이 고쳐 주세요.)

### SSH 잠그기 — ★ 조심할 곳 둘

> ★★ **sshd 는 「처음 읽은 값」이 이깁니다** — 공식 `man sshd_config` :
> *"Unless noted otherwise, for each keyword, the first obtained value will be used."*
> 그리고 `Include` 의 `*.conf` 는 *"expanded and processed in lexical order"*(이름 차례)로 읽힙니다.
> → **이름이 앞일수록 이깁니다.** 그래서 우리 설정은 **`00-cosroad.conf`** 에 둡니다
> (`99-` 에 두면 `50-cloud-init.conf` 의 `PasswordAuthentication yes` 가 **먼저 읽혀 이깁니다**).

```bash
# ① 우분투 24.04 는 /etc/ssh/sshd_config.d/*.conf 를 **본 파일보다 먼저** 읽습니다
#    (예: 50-cloud-init.conf 가 PasswordAuthentication yes 를 들고 있습니다)
ls -l /etc/ssh/sshd_config.d/
sudo grep -R -nE 'PasswordAuthentication|PermitRootLogin' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/ || true

# ② 우리 설정을 **가장 먼저 읽히는 파일**로 둡니다(이름이 앞일수록 이깁니다)
sudo tee /etc/ssh/sshd_config.d/00-cosroad.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF

# ★★ PermitRootLogin 은 **no 가 아니라 prohibit-password** 입니다 —
#    「키로만 root 로 들어올 수 있다」는 뜻입니다. no 로 해 두면 어떤 사정으로
#    일반 계정이 막혔을 때 **아무도 못 들어오는** 상태가 될 수 있습니다.

# ③ 본 파일에서 Include 보다 **위에** 같은 키워드가 있으면 그것이 이깁니다 — 줄 번호로 봅니다
sudo grep -nE '^[[:space:]]*Include|PasswordAuthentication|PermitRootLogin' /etc/ssh/sshd_config
#   Include 줄 번호보다 **작은** 줄에 그 키워드가 있으면, 그 줄을 # 로 막거나 값을 고치세요.

# ④ 정말 그렇게 읽히는지 **먼저 확인**합니다
sudo sshd -t                                                  # 설정 글 검사
sudo sshd -T | grep -E 'passwordauthentication|permitrootlogin|kbdinteractive'
#   기대: passwordauthentication no
#         permitrootlogin **without-password** 또는 prohibit-password  ← 둘 다 맞습니다
#         kbdinteractiveauthentication no
#
#   ★★ `without-password` 가 나와도 맞습니다 — **옛 이름**이고 뜻이 똑같습니다(키로만 root).
#     까닭: OpenSSH 소스 `servconf.c` 의 `multistate_permitrootlogin` 표에서 두 이름이
#     **같은 값**(PERMIT_NO_PASSWD)이라 설정을 읽을 때 **글자는 버려지고**, 되돌려 찍을 때
#     표에서 **먼저 나오는 이름**이 쓰입니다. OpenSSH 9.6(우분투 24.04)은 `without-password`
#     가 먼저라 그렇게 찍히고, 지금 master 는 둘이 바뀌어 `prohibit-password` 로 찍힙니다.
#
#   ★ 그래도 yes 가 보이면 — **우리보다 앞에 있는 파일**이 그 값을 들고 있습니다.
#     ls /etc/ssh/sshd_config.d/ 로 이름 차례를 보고(00- 보다 앞선 이름이 있나),
#     그 파일의 그 줄을 no 로 고치거나 # 로 막으면 됩니다.
#     (`sudo grep -n PasswordAuthentication /etc/ssh/sshd_config.d/*.conf` 로 어디인지 찾습니다)

# ⑤ 그 다음에 다시 읽힙니다. ★ **지금 열려 있는 창은 닫지 말고**,
#    새 창으로 한 번 더 들어와 보고 나서 닫으세요.
#
#    ★★ 우분투 24.04 는 ssh 를 **소켓으로** 켜므로(`ssh.socket`) `ssh.service` 가 꺼져 있을 수
#      있고, 그때 `reload` 가 **실패합니다**. 그러면 `restart` 로 하세요 —
#      **지금 접속은 안 끊깁니다**(공식 man sshd: "It forks a new daemon for each incoming
#      connection." 들어온 연결은 따로 갈라진 자식이 들고 있습니다).
sudo systemctl reload ssh || sudo systemctl restart ssh
```

---

## ⓑ Caddy (HTTPS·인증서 자동)

```bash
sudo apt -y install debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt -y install caddy
```

## ⓒ Node 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs
node -v          # v20.x
```

## ⓓ 토큰 — **서버가 만듭니다**(사람이 옮겨 적지 않습니다)

```bash
# 서버에서 만들어 바로 파일에 넣습니다 — **화면에 찍지 않습니다**
sudo mkdir -p /etc/cosroad-relay
sudo sh -c 'umask 077; { printf "RELAY_TOKEN="; openssl rand -hex 32; } > /etc/cosroad-relay/env'
sudo chmod 600 /etc/cosroad-relay/env
sudo chown root:root /etc/cosroad-relay/env

# 들어갔는지만 봅니다(값은 보지 않습니다 — 64자면 됩니다)
sudo grep -c '^RELAY_TOKEN=[0-9a-f]\{64\}$' /etc/cosroad-relay/env      # 1
```

★★ **이미 있으면 다시 만들지 마세요** — Vercel 에 넣어 둔 값과 어긋나 문자가 **전부 막힙니다**.
(`install.sh` 는 이미 있으면 그대로 둡니다.)

★ Vercel 에 넣을 때만 이 줄로 봅니다 — **그 화면은 아무에게도 보내지 마세요**(클로드에게도):
```bash
sudo cat /etc/cosroad-relay/env
```

★ 토큰이 **없거나 16자보다 짧으면 중계가 시작하지 않습니다**(일부러 그렇게 두었습니다 —
토큰 없이 뜨면 누구나 쓸 수 있는 창구가 열립니다).

## ⓔ 중계 프로그램 올리기

저장소의 **`relay/relay.js`** 파일 하나입니다(바깥 의존 0 · 설치할 것 없음).

```bash
sudo useradd -r -s /usr/sbin/nologin cosroad-relay || true
sudo mkdir -p /opt/cosroad-relay
```

**옮기는 길 — 둘 중 편한 쪽 하나만** (둘 다 비밀 값이 없습니다)

```bash
# ㉮ 깃허브에서 바로 받기 (가장 간단 — 공개 저장소입니다)
sudo curl -fsSL -o /opt/cosroad-relay/relay.js \
  https://raw.githubusercontent.com/COSROAD/cosroad/main/relay/relay.js

# ㉯ 또는 손으로 붙여넣기
sudo nano /opt/cosroad-relay/relay.js      # 저장소 relay/relay.js 내용을 그대로 붙여넣기
```

```bash
sudo chown -R cosroad-relay: /opt/cosroad-relay
sudo chmod 644 /opt/cosroad-relay/relay.js
node --check /opt/cosroad-relay/relay.js   # 글이 성한지
```

## ⓕ systemd (꺼지면 되살림)

```bash
sudo tee /etc/systemd/system/cosroad-relay.service >/dev/null <<'EOF'
[Unit]
Description=COSROAD aligo relay
After=network-online.target
Wants=network-online.target

[Service]
User=cosroad-relay
EnvironmentFile=/etc/cosroad-relay/env
ExecStart=/usr/bin/node /opt/cosroad-relay/relay.js
Restart=always
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now cosroad-relay
sudo systemctl status cosroad-relay --no-pager        # active (running)
```

## ⓖ Caddy 설정 — 경로 **셋만** 넘김

```bash
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
relay.cosroad.com {
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
}
EOF

sudo caddy validate --config /etc/caddy/Caddyfile     # 설정 글 검사
sudo systemctl reload caddy
sudo journalctl -u caddy -n 30 --no-pager             # 인증서를 받았는지(certificate obtained)
```

★★ **접근 기록(`log` 블록)은 일부러 켜지 않습니다** — Caddy 접근 기록은 **요청 머리말을 함께
적고**, 기본으로 가리는 것은 `Cookie`·`Set-Cookie`·`Authorization`·`Proxy-Authorization` **넷뿐**
입니다(공식 문서). 그래서 켜면 **`X-Relay-Token` 이 원문 그대로 기록 파일에 쌓입니다**.
중계 프로그램이 이미 「시각·경로·상태·ms·바이트수」를 남기니 그것으로 충분합니다
(`sudo journalctl -u cosroad-relay`). Caddy 자기 기록은 `sudo journalctl -u caddy` 로 봅니다.

★ 인증서가 안 나오면: ⓞ의 DNS 가 아직 안 퍼졌거나 443 이 닫혀 있습니다.
`nslookup relay.cosroad.com` 과 보안 그룹을 보시고, 그래도 안 되면 **80 을 잠깐 열고**
`sudo systemctl reload caddy` → 받은 뒤 **다시 닫습니다**.

## ⓗ 확인 — **문자는 한 통도 안 나갑니다**

```bash
# 살아있음 (토큰 없이)
curl -s https://relay.cosroad.com/healthz                       # {"ok":true}

# 토큰 없이 보내려 하면 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://relay.cosroad.com/a/sms \
  -H 'Content-Type: application/x-www-form-urlencoded' --data 'x=1'     # 401

# GET 으로는 405
curl -s -o /dev/null -w '%{http_code}\n' https://relay.cosroad.com/a/sms          # 405

# 모르는 경로는 404
curl -s -o /dev/null -w '%{http_code}\n' https://relay.cosroad.com/aaa            # 404

# 물음표가 붙은 주소도 404 (`?url=` 류를 끊습니다)
curl -s -o /dev/null -w '%{http_code}\n' 'https://relay.cosroad.com/a/sms?url=x'  # 404

# 기록 보기 — 본문·번호·키는 **없습니다**(시각·경로·상태·ms·바이트수만)
sudo journalctl -u cosroad-relay -n 20 --no-pager
```

---

## ⓘ 알리고에 IP 신청 (사장님)

알리고 문자 API 메뉴에서 **발송 서버 IP** 에 **`1.201.109.4`** 를 등록합니다.

- ★ **알림톡(`kakaoapi.aligo.in`)도 같은 IP 가 필요한지 함께 물어보세요** (☎ 02-511-4560).
  필요하다고 하면 그쪽에도 등록합니다. 앱은 **문자·알림톡 둘 다 중계로** 보냅니다.
- ★ **공인 IP 를 반납하지 마세요** — 바뀌면 **다시 신청**해야 합니다.
- 승인될 때까지 ⓙ 를 **하지 마세요**.

## ⓙ Vercel 환경변수 — **알리고 승인 뒤에** (사장님)

Vercel → 프로젝트 → Settings → Environment Variables (Production)

| 이름 | 값 |
|---|---|
| `ALIGO_RELAY_URL` | `https://relay.cosroad.com` |
| `ALIGO_RELAY_TOKEN` | ⓓ 에서 만든 글자 (**Secret** 으로) |

넣은 뒤 **다시 배포**(Redeploy)해야 함수가 새 값을 읽습니다.

**확인** — 사장님 `_test` 업체에서 **문자 1통**만 보내 보세요(인증번호가 가장 간단합니다).
서버에서 `sudo journalctl -u cosroad-relay -n 5 --no-pager` 에 `/a/sms  200  aligo=200` 이 보이면 된 것입니다.

### 되돌리기

Vercel 에서 **`ALIGO_RELAY_URL` 만 지우고 다시 배포** → 즉시 **바로 보내기**로 돌아갑니다.
(단 알리고가 Vercel IP 를 막고 있으면 그 길로는 안 나갑니다 — 그때는 중계를 살려야 합니다.)

---

## 중계가 죽으면

| 길 | 어떻게 되나 |
|---|---|
| 인증번호 · 공지·«알림장» 문자 · 앱 알림톡 | 화면에 **500 안내**가 뜹니다(사람이 바로 압니다) |
| 가입 알림·계좌 안내 · 하원 문자/알림톡 · 출석 기기 알림톡 | **조용히 안 갑니다** — Vercel 기록에 `[signup] 마스터 알림 문자 실패` 같은 **한 줄**이 남습니다(v319 에 넣었습니다) |

- **살아있음 확인**을 무료 서비스에 걸어 두시면 좋습니다 → `https://relay.cosroad.com/healthz`
- 서버에서 바로 보기: `sudo systemctl status cosroad-relay` · `sudo journalctl -u cosroad-relay -n 50 --no-pager`

## 손이 가는 일 (한 달에 한 번쯤)

```bash
sudo apt update && sudo apt -y upgrade          # 보안 업데이트(자동도 돌지만 한 번씩)
sudo systemctl status cosroad-relay caddy       # 둘 다 active
sudo journalctl -u cosroad-relay --since '7 days ago' | grep -cE ' 50[0-9] | 429 '   # 실패 수
```

- 비용: **월 19,750원**(Micro + 공인 IP) · Caddy·Node·Let's Encrypt **0원**
- 인증서는 Caddy 가 **알아서 갱신**합니다(90일마다 · 손댈 것 없음)
