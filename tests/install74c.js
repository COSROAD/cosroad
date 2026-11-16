/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드74-C — 중계 서버 **설치 스크립트** (`relay/install.sh` · v319)
   사장님이 SSH 창에서 붙여 넣기가 어려워(Shift+Insert 만 됨) 두 줄로 끝나게 만든 한 벌이다.
   보는 것
     ① 글이 성한가(`bash -n`) · `set -euo pipefail` · 단계 표시
     ② **순서** — 22 허용이 `ufw --force enable` **앞** · `sshd -t`·`sshd -T` 가 `reload ssh` **앞**
     ③ **잠길 위험** — `00-cosroad.conf`(`99-` 0곳) · `PermitRootLogin no` 0곳 ·
        어긋나면 **되돌리고 멈춤**(reload 안 함) · 키가 없으면 잠금 **건너뜀**
     ④ **비밀** — 토큰을 화면·기록에 찍는 줄 0 · 요약에 비밀 값 0
     ⑤ **안전** — 80 여는 줄 0 · `| bash` 로 받으라는 안내 0 · 알리고 주소 0(발송 0)
     ⑥ **진짜로 두 번 돌려 본다**(가짜 명령 + 임시 뿌리) — 둘 다 성공 · **토큰이 안 바뀐다**
     ⑦ **되돌림**을 진짜로 겪어 본다 — `sshd -T` 가 `yes` 를 주면 파일을 지우고 멈춘다
     ⑧ **IP 를 못 찾으면** 방화벽을 **켜지 않고** 멈춘다
     ⑨ 설치 글·CLAUDE.md 가 그 두 줄을 안내하나
   ★ 바깥 통신 0 · 진짜 발송 0 · 서버에 손대지 않는다(임시 폴더에만 쓴다) */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

let pass = 0, fail = 0, skipped = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 44)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const note = (label, why) => { skipped++; console.log('  • ' + String(label).padEnd(56) + why); };
const LF = (x) => x.replace(/\r\n/g, '\n');
const SH = LF(fs.readFileSync(COS_ROOT + '/relay/install.sh', 'utf8'));
const GUIDE = LF(fs.readFileSync(COS_ROOT + '/relay/README.md', 'utf8'));
const CLAUDE = LF(fs.readFileSync(COS_ROOT + '/CLAUDE.md', 'utf8'));
const RELAY = LF(fs.readFileSync(COS_ROOT + '/relay/relay.js', 'utf8'));

/* bash 를 찾는다 — 없으면 ⑥⑦⑧ 은 「못 함 · 까닭」으로 남긴다(지시문 그대로) */
function findBash() {
  const cands = ['C:/Program Files/Git/usr/bin/bash.exe', 'C:/Program Files/Git/bin/bash.exe',
                 '/usr/bin/bash', '/bin/bash'];
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  try {
    const r = cp.spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf8' });
    if (r.status === 0) return 'bash';
  } catch (e) {}
  return '';
}
const BASH = findBash();

(async () => {

console.log('════ ① 글이 성한가 · 뼈대');
{
  const r = cp.spawnSync(BASH || 'bash', ['-n', COS_ROOT + '/relay/install.sh'], { encoding: 'utf8' });
  ck('★ `bash -n` 통과', r.status, 0);
  if (r.status !== 0) console.log('      ' + String(r.stderr || '').slice(0, 200));
  ck('★ `set -euo pipefail`', /^set -euo pipefail$/m.test(SH), true);
  ck('  `#!/usr/bin/env bash`', /^#!\/usr\/bin\/env bash$/m.test(SH), true);
  ck('★ 단계가 여덟', (SH.match(/^step \d /mg) || []).length, 8);
  ck('  `STEPS=8`', /^STEPS=8$/m.test(SH), true);
  ck('  멈출 때 까닭을 보인다(`die`)', /^die\(\)/m.test(SH) && (SH.match(/\bdie "/g) || []).length >= 8, true);
  ck('  단계마다 ✓/• 표시', /✓/.test(SH) && /•/.test(SH), true);
  /* ★ 끝 요약은 **단계마다 표시가 있어야** 한다(지시문 11) — ✓ 했음 · • 건너뜀 · ✗ 아직 안 됨.
     처음에는 두 줄(건너뜀·밖에서 아직)에 표시가 없어 눈으로 훑기 어려웠다. */
  ck('★ 요약 줄 **전부**에 ✓·•·✗ 가 있다',
    (SH.match(/^\s*note "[^"]*"/mg) || []).filter((l) => !/[✓•✗]/.test(l)).length, 0);
  ck('  요약 머리줄이 그 표시를 설명한다', /✓ 했음 · • 건너뜀 · ✗ 아직 안 됨/.test(SH), true);

  /* ── v319(74-C 보정1) 셋 ───────────────────────────────────────────────── */
  /* ① ★★ Caddy 접근 기록에 **`X-Relay-Token` 이 남지 않아야** 한다.
     Caddy 는 요청 머리말을 함께 적고, 기본으로 가리는 것은 `Cookie`·`Set-Cookie`
     ·`Authorization`·`Proxy-Authorization` **넷뿐**이다(공식 문서) → 켜면 토큰이 쌓인다.
     고른 길: **`log` 블록을 아예 안 쓴다**(지우는 목록은 새 머리말이 생기면 또 샌다). */
  const cfBlock = SH.slice(SH.indexOf('${DOMAIN} {'), SH.indexOf('EOF', SH.indexOf('${DOMAIN} {')));
  ck('★★ Caddyfile 에 `log` 블록이 **없다**(토큰이 기록에 안 쌓인다)',
    /\blog\s*\{/.test(cfBlock), false);
  ck('  설치 글 Caddyfile 에도 없다', /\n\tlog \{/.test(GUIDE), false);
  ck('  까닭을 적어 두었다(기본으로 가리는 건 넷뿐)',
    /REDACTED/.test(SH) && /X-Relay-Token/.test(SH), true);
  ck('  Caddy 기록 보는 길을 알려 준다', /journalctl -u caddy/.test(SH + GUIDE), true);
  ck('  쓸데없는 기록 폴더를 만들지 않는다', /var\/log\/caddy/.test(SH), false);

  /* ② ★★ `AF_UNIX` — 공식 `systemd.exec`: "in most cases, the local AF_UNIX address family
     should be included … including for syslog(2) logging." 막히면 이름 풀이·기록이 막혀
     **확인은 통과하는데 보내는 날 502** 가 난다. */
  ck('★★ unit 에 `AF_UNIX` 가 있다',
    /RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6/.test(SH), true);
  ck('  설치 글 unit 에도 있다',
    /RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6/.test(GUIDE), true);
  ck('★ 확인에 **이름 풀이** 줄이 있다(요청 0)', /getent hosts "\$h"/.test(SH), true);
  ck('★ 확인에 **유닉스 소켓 쓸 수 있나** 줄이 있다',
    /systemctl show cosroad-relay -p RestrictAddressFamilies/.test(SH), true);
  ck('  막혔으면 「보내는 날 502」라고 알려 준다', (SH.match(/502/g) || []).length >= 2, true);

  /* ③ ★★ 우분투 24.04 는 ssh 를 소켓으로 켠다 → `reload` 가 실패할 수 있다.
     `set -e` 라 거기서 멈춰 버리므로 **`restart` 로 떨어진다**.
     `restart` 가 지금 접속을 안 끊는 근거: 공식 `man sshd` "It forks a new daemon for each
     incoming connection." */
  ck('★★ `reload ssh` 가 실패하면 `restart ssh` 로 떨어진다',
    /if systemctl reload ssh 2>\/dev\/null; then[\s\S]{0,200}elif systemctl restart ssh/.test(SH), true);
  ck('  둘 다 실패하면 까닭을 보이고 멈춘다',
    /reload·restart 둘 다 실패/.test(SH), true);
  ck('  「지금 접속은 안 끊깁니다」를 알려 준다', /지금 접속은 안 끊깁니다/.test(SH), true);
  ck('  까닭(소켓 활성화)을 적어 두었다', /ssh\.socket/.test(SH) && /forks a new daemon/.test(SH), true);
  ck('  설치 글에도 같은 떨어짐', /reload ssh \|\| sudo systemctl restart ssh/.test(GUIDE), true);
  ck('★ 멱등이라고 적어 두었다', /멱등/.test(SH), true);
}

console.log('\n════ ② 순서 — 끊기지 않게');
{
  const iAllow22 = SH.indexOf('ufw allow from "$myip" to any port 22');
  const iAllow443 = SH.indexOf('ufw allow 443/tcp');
  const iEnable = SH.indexOf('ufw --force enable');
  ck('★ 22 허용이 **켜기보다 앞**', iAllow22 > 0 && iAllow22 < iEnable, true);
  ck('★ 443 허용도 켜기보다 앞', iAllow443 > 0 && iAllow443 < iEnable, true);
  ck('★ 켜기 전에 `ufw status` 로 **눈으로 확인**',
    SH.indexOf('ufw status') > 0 && SH.indexOf('ufw status') < iEnable, true);
  const iT = SH.indexOf('sshd -t'), iTT = SH.indexOf('sshd -T'), iRe = SH.indexOf('systemctl reload ssh');
  ck('★ `sshd -t` 가 reload 보다 앞', iT > 0 && iT < iRe, true);
  ck('★ `sshd -T` 확인이 reload 보다 앞', iTT > 0 && iTT < iRe, true);
  ck('  `caddy validate` 가 reload caddy 보다 앞',
    SH.indexOf('caddy validate') > 0 && SH.indexOf('caddy validate') < SH.indexOf('systemctl reload caddy'), true);
}

console.log('\n════ ③ 잠길 위험을 막는다');
{
  /* ★ 경로는 변수로 만든다(`SSHD_DIR`) — 글자가 한 줄에 붙어 있지 않다 */
  ck('★ 우리 설정은 `00-cosroad.conf`',
    /SSHD_OURS="\$\{SSHD_DIR\}\/00-cosroad\.conf"/.test(SH)
      && /SSHD_DIR="\$\{DRY\}\/etc\/ssh\/sshd_config\.d"/.test(SH), true);
  ck('★★ `99-cosroad.conf` 0곳', /99-cosroad\.conf/.test(SH), false);
  ck('★ `PermitRootLogin prohibit-password`', /PermitRootLogin prohibit-password/.test(SH), true);
  ck('★★ `PermitRootLogin no` 0곳', /PermitRootLogin no\b/.test(SH), false);
  ck('★ 어긋나면 **그 파일을 지운다**', /rm -f "\$SSHD_OURS"/.test(SH), true);
  ck('★ 그리고 **되돌린다**(백업이 있으면)', /mv "\$\{SSHD_OURS\}\.bak-\$\{STAMP\}" "\$SSHD_OURS"/.test(SH), true);
  ck('★★ 어긋날 때 **reload 하지 않는다**(지우기·되돌리기가 reload 보다 앞)',
    SH.indexOf('rm -f "$SSHD_OURS"') < SH.indexOf('systemctl reload ssh'), true);
  ck('  그 안내에 「되돌렸고 reload 하지 않았습니다」', /되돌렸고 reload 하지 않았습니다/.test(SH), true);
  ck('★ 키가 없으면 잠금을 **건너뛴다**', /등록된 키가 없습니다[\s\S]{0,200}건너뜁니다/.test(SH), true);
  ck('  본 파일 `Include` 위 겹침을 본다', /\^\[\[:space:\]\]\*Include/.test(SH), true);
  ck('★ 「새 창으로 한 번 더 접속」 안내', /새 창으로 한 번 더 접속/.test(SH), true);
}

console.log('\n════ ④ 비밀 — 토큰은 서버가 만들고 **안 보여 준다**');
{
  ck('★ 서버가 만든다(`openssl rand -hex 32`)', /openssl rand -hex 32/.test(SH), true);
  /* 토큰 만드는 줄의 결과는 **파일로** 간다 — 화면으로 가는 줄이 있으면 안 된다 */
  const randLines = SH.split('\n').filter((l) => /openssl rand/.test(l));
  ck('  그 줄은 하나', randLines.length, 1);
  ck('★★ 그 줄의 결과가 **파일로** 간다(`> "${ENV_DIR}/env"`)',
    /> "\$\{ENV_DIR\}\/env"/.test(randLines[0] || ''), true);
  ck('★★ 토큰 값을 화면에 찍는 줄 0',
    /(echo|printf|cat)[^\n]*\$\{?RELAY_TOKEN/.test(SH), false);
  ck('  `cat .*env` 를 스크립트가 직접 하지 않는다',
    /^[^#\n]*\bcat "?\$\{?ENV_DIR/m.test(SH), false);
  ck('★ 이미 있으면 **그대로 둔다**(Vercel 과 어긋나지 않게)',
    /이미 있습니다 — 그대로 둡니다/.test(SH), true);
  ck('  권한 600', /chmod 600 "\$\{ENV_DIR\}\/env"/.test(SH), true);
  ck('★ 요약에 「아무에게도 보내지 마세요」', /아무에게도 보내지 마세요/.test(SH), true);
  ck('★ 요약에 비밀처럼 보이는 긴 16진수 0',
    /[0-9a-f]{32,}/.test(SH), false);
}

console.log('\n════ ⑤ 안전 — 80·파이프·발송');
{
  ck('★★ 80 을 여는 줄 0', /ufw allow[^\n]*\b80\b/.test(SH), false);
  ck('  80 은 안 연다고 적어 두었다', /80 (번 포트)?는? ?\*\*?열지 않습니다|80 은 열지 않았습니다/.test(SH), true);
  ck('★★ `install.sh | bash` 로 받으라는 안내 0(스크립트)',
    /install\.sh[^\n]*\|[^\n]*bash/.test(SH), false);
  ck('★★ 같은 안내 0(설치 글)', /install\.sh[^\n]*\|[^\n]*bash/.test(GUIDE), false);
  ck('  파이프로 하지 말라고 적어 두었다', /\| bash` 로 바로 돌리지 마세요|파이프로/.test(SH + GUIDE), true);
  /* ★ `ALIGO_RELAY_URL`·`ALIGO_RELAY_TOKEN` 은 **Vercel 환경변수 이름**이라 괜찮다 —
     가려야 할 것은 **알리고 서버 주소**다(그것이 있으면 설치가 문자를 보낼 수 있다는 뜻). */
  /* ★★ v319(74-C 보정1): 알리고 이름이 **`getent` 줄에만** 나온다 —
     ⑤ 확인에서 **이름만 묻고**(요청 0) 이름 풀이가 막혔는지 본다.
     ① 위 ①~④ 는 바깥으로 안 나가므로 **이름 풀이가 막혀도 다 통과**하고, 그러면
       실제 발송 날에야 502 로 드러난다 → 그 틈을 여기서 막는다.
     ★ 그래서 「알리고 글자 0」이 아니라 **「요청 보내는 줄 0」**을 재야 한다. */
  const lines = SH.split('\n');
  const aligoAt = lines.map((l, i) => [l, i]).filter(([l]) => /aligo\.in/i.test(l));
  ck('★★ 알리고 주소가 나오는 줄은 **하나뿐**(이름 풀이 목록)', aligoAt.length, 1);
  ck('★★ 그 줄은 `getent` 로 **이름만 묻는** 고리다',
    aligoAt.length === 1
      && /^\s*for h in apis\.aligo\.in kakaoapi\.aligo\.in; do\s*$/.test(aligoAt[0][0])
      && /getent hosts "\$h"/.test(lines[aligoAt[0][1] + 1] || ''), true);
  ck('★★ 알리고로 **요청 보내는 줄 0**(curl·wget 으로 부르지 않는다)',
    /(curl|wget)[^\n]*aligo\.in|aligo\.in[^\n]*(\/send\/|akv10)/i.test(SH), false);
  ck('  문자·알림톡 **둘 다** 이름을 묻는다',
    /apis\.aligo\.in/.test(SH) && /kakaoapi\.aligo\.in/.test(SH), true);
  ck('  나오는 `ALIGO_` 글자는 Vercel 환경변수 이름뿐',
    (SH.match(/ALIGO_[A-Z_]+/g) || [])
      .filter((x) => x !== 'ALIGO_RELAY_URL' && x !== 'ALIGO_RELAY_TOKEN').length, 0);
  ck('  확인은 `healthz`·401·404 뿐', /healthz/.test(SH) && /= ?401|401 이 아닙니다/.test(SH)
    && /404 가 아닙니다/.test(SH), true);
  ck('  「한 통도 나가지 않았습니다」', /한 통도 나가지 않았습니다/.test(SH), true);
  ck('★ 받아올 커밋은 한 자리(`REF`)', /^REF="\$\{COS_RELAY_REF:-main\}"/m.test(SH), true);
  ck('  받는 임시 이름이 `.js` 로 끝난다(`node --check` 가 확장자를 본다)',
    /tmp="\$\{APP_DIR\}\/relay\.new\.js"/.test(SH), true);
  ck('  받은 것을 `node --check` 한다', /node --check "\$tmp"/.test(SH), true);
}

/* ── 진짜로 돌려 보는 틀 (가짜 명령 + 임시 뿌리) ───────────────────────────── */
function sandbox(opt) {
  opt = opt || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cos74c-'));
  const binDir = path.join(root, 'fakebin');
  const dry = path.join(root, 'tree').replace(/\\/g, '/');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(path.join(dry, 'home/ubuntu/.ssh'), { recursive: true });
  fs.mkdirSync(path.join(dry, 'etc/ssh/sshd_config.d'), { recursive: true });
  /* ubuntu 계정 키가 있다고 둔다(없으면 잠금 단계를 건너뛴다 — 그 갈래는 따로 잰다) */
  if (opt.noKeys !== true) {
    fs.writeFileSync(path.join(dry, 'home/ubuntu/.ssh/authorized_keys'), 'ssh-ed25519 AAAA… test\n');
  } else {
    fs.writeFileSync(path.join(dry, 'home/ubuntu/.ssh/authorized_keys'), '');
  }
  /* 본 sshd_config — Include 가 맨 위 */
  fs.writeFileSync(path.join(dry, 'etc/ssh/sshd_config'),
    'Include /etc/ssh/sshd_config.d/*.conf\nPort 22\n');
  /* 50-cloud-init.conf — 실제 우분투처럼 yes 를 들고 있다 */
  fs.writeFileSync(path.join(dry, 'etc/ssh/sshd_config.d/50-cloud-init.conf'),
    'PasswordAuthentication yes\n');
  /* ★ v319(74-C 보정1): **이미 옛 글이 깔린 서버**를 흉내 낼 수 있게 한다 —
     보정1 이 Caddyfile(`log` 블록)과 unit(`AF_UNIX` 없음)을 고쳤으므로,
     「다시 돌리면 **백업 뒤 새 글로 바뀐다**」를 재야 한다(안 바뀌면 토큰이 계속 쌓인다). */
  if (opt.oldFiles === true) {
    fs.mkdirSync(path.join(dry, 'etc/caddy'), { recursive: true });
    fs.mkdirSync(path.join(dry, 'etc/systemd/system'), { recursive: true });
    fs.writeFileSync(path.join(dry, 'etc/caddy/Caddyfile'),
      'relay.cosroad.com {\n\thandle {\n\t\trespond 404\n\t}\n'
      + '\tlog {\n\t\toutput file /var/log/caddy/relay.log\n\t\tformat console\n\t}\n}\n');
    fs.writeFileSync(path.join(dry, 'etc/systemd/system/cosroad-relay.service'),
      '[Service]\nRestrictAddressFamilies=AF_INET AF_INET6\n');
  }

  const log = path.join(root, 'calls.log').replace(/\\/g, '/');
  const w = (name, body) => {
    fs.writeFileSync(path.join(binDir, name),
      '#!/usr/bin/env bash\necho "' + name + ' $*" >> "' + log + '"\n' + body + '\n');
    try { fs.chmodSync(path.join(binDir, name), 0o755); } catch (e) {}
  };
  /* ufw — 상태를 파일에 둔다(두 번째 돌림에서 「이미 켜져 있습니다」 갈래를 지나게) */
  const ufwState = path.join(root, 'ufw.state').replace(/\\/g, '/');
  w('ufw', [
    'case "$1" in',
    '  status) if [ -f "' + ufwState + '" ]; then echo "Status: active"; else echo "Status: inactive"; fi;',
    '          echo "22/tcp ALLOW"; echo "443/tcp ALLOW";;',
    '  --force) touch "' + ufwState + '";;',
    'esac',
    'exit 0'
  ].join('\n'));
  /* who — 접속한 IP 를 준다(없다고 두면 ⑧ 갈래) */
  w('who', opt.noIp ? 'exit 0'
    : 'echo "ubuntu   pts/0        2026-11-15 02:00 (203.0.113.7)"');
  w('ss', 'exit 1');
  /* sshd — `-T` 가 기대값을 주면 통과, `yes` 를 주면 되돌림 갈래 */
  w('sshd', opt.sshdBad
    ? 'if [ "$1" = "-T" ]; then echo "passwordauthentication yes"; echo "permitrootlogin yes";'
      + ' echo "kbdinteractiveauthentication yes"; fi; exit 0'
    : 'if [ "$1" = "-T" ]; then echo "passwordauthentication no";'
      + ' echo "permitrootlogin prohibit-password";'
      + ' echo "kbdinteractiveauthentication no"; fi; exit 0');
  /* caddy 가 이미 있다고 둔다 → apt 단계를 지나간다 */
  w('caddy', 'if [ "$1" = "version" ]; then echo "v2.8.4 (fake)"; fi; exit 0');
  w('apt-get', 'exit 0');
  w('gpg', 'exit 0');
  w('useradd', 'exit 0');
  w('systemctl', 'exit 0');
  /* curl — 중계 프로그램만 내려 준다(바깥 통신 0) */
  w('curl', [
    'out=""; prev=""',
    'for a in "$@"; do if [ "$prev" = "-o" ]; then out="$a"; fi; prev="$a"; done',
    'if [ -n "$out" ]; then cp "' + (COS_ROOT + '/relay/relay.js') + '" "$out"; fi',
    'exit 0'
  ].join('\n'));
  return { root, binDir, dry, log, ufwState };
}
function runSh(sb, extraEnv) {
  const env = Object.assign({}, process.env, {
    COS_RELAY_DRY_ROOT: sb.dry,
    PATH: sb.binDir + path.delimiter + process.env.PATH
  }, extraEnv || {});
  delete env.SSH_CLIENT; delete env.SSH_CONNECTION;
  const r = cp.spawnSync(BASH, [COS_ROOT + '/relay/install.sh'],
    { encoding: 'utf8', env: env, timeout: 120000, cwd: sb.root });
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}

console.log('\n════ ⑥ **진짜로 두 번 돌려 본다** (가짜 명령 · 임시 뿌리 · 바깥 통신 0)');
if (!BASH) {
  note('★ 두 번 돌리기', '못 함 — 이 컴퓨터에서 bash 를 못 찾았다');
} else {
  const sb = sandbox({});
  const a = runSh(sb);
  ck('★ 첫 번째 돌림 성공', a.code, 0);
  if (a.code !== 0) console.log('      ' + a.out.slice(-400));
  /* ★ 파일이 없을 때 **묶음이 터지지 않게** 읽기를 감싼다(터지면 아래 칸이 아예 안 돈다) */
  const rd = (d, rel) => { try { return LF(fs.readFileSync(path.join(d, rel), 'utf8')); }
                           catch (e) { return '(없음)'; } };
  const tok1 = rd(sb.dry, 'etc/cosroad-relay/env').trim();
  ck('  토큰 파일이 생겼다', /^RELAY_TOKEN=[0-9a-f]{64}$/.test(tok1), true);
  ck('★★ 토큰이 **화면에 안 찍혔다**', a.out.indexOf(tok1.split('=')[1] || '§') < 0, true);
  ck('  `00-cosroad.conf` 를 썼다',
    fs.existsSync(path.join(sb.dry, 'etc/ssh/sshd_config.d/00-cosroad.conf')), true);
  ck('  `relay.js` 를 넣었다', rd(sb.dry, 'opt/cosroad-relay/relay.js') === RELAY, true);
  ck('★ 받던 임시 파일은 안 남았다',
    fs.existsSync(path.join(sb.dry, 'opt/cosroad-relay/relay.new.js')), false);
  ck('  systemd unit 을 썼다', fs.existsSync(path.join(sb.dry, 'etc/systemd/system/cosroad-relay.service')), true);
  ck('  Caddyfile 을 썼다', /relay\.cosroad\.com \{/.test(rd(sb.dry, 'etc/caddy/Caddyfile')), true);
  ck('★ 켜기 전에 22·443 을 허용했다(가짜 ufw 기록 차례)',
    (() => { const L = fs.readFileSync(sb.log, 'utf8');
      const i22 = L.indexOf('port 22'), ie = L.indexOf('--force enable');
      return i22 >= 0 && ie > i22; })(), true);
  ck('★★ 80 을 여는 호출 0', /ufw allow[^\n]*\b80\b/.test(fs.readFileSync(sb.log, 'utf8')), false);

  /* 두 번째 돌림 — 멱등 */
  const b = runSh(sb);
  ck('★★ 두 번째 돌림도 성공', b.code, 0);
  if (b.code !== 0) console.log('      ' + b.out.slice(-400));
  const tok2 = fs.readFileSync(path.join(sb.dry, 'etc/cosroad-relay/env'), 'utf8').trim();
  ck('★★ **토큰이 안 바뀌었다**(Vercel 과 어긋나지 않게)', tok2 === tok1, true);
  ck('★ 「이미 …」 로 지나간 단계가 여럿', (b.out.match(/이미 |건너뜁니다/g) || []).length >= 3, true);
  ck('  Caddyfile 백업이 늘지 않았다(같으면 안 쓴다)',
    fs.readdirSync(path.join(sb.dry, 'etc/caddy')).filter((f) => /bak-/.test(f)).length, 0);
  ck('  ufw 는 「이미 켜져 있습니다」', /이미 켜져 있습니다/.test(b.out), true);
  ck('  요약 줄이 여덟 자리 다 나온다', (b.out.match(/\n  \d /g) || []).length >= 7, true);
  ck('★ 두 돌림 모두 알리고로 나간 호출 0',
    /aligo/i.test(fs.readFileSync(sb.log, 'utf8')), false);
  try { fs.rmSync(sb.root, { recursive: true, force: true }); } catch (e) {}
}

console.log('\n════ ⑦ **되돌림을 진짜로 겪어 본다** — `sshd -T` 가 어긋나면');
if (!BASH) {
  note('★ 되돌림', '못 함 — bash 없음');
} else {
  const sb = sandbox({ sshdBad: true });
  const r = runSh(sb);
  ck('★★ 멈춘다(나감값 0 아님)', r.code !== 0, true);
  ck('★★ `00-cosroad.conf` 를 **지웠다**',
    fs.existsSync(path.join(sb.dry, 'etc/ssh/sshd_config.d/00-cosroad.conf')), false);
  ck('★★ `reload ssh` 를 **부르지 않았다**',
    /systemctl reload ssh/.test(fs.readFileSync(sb.log, 'utf8')), false);
  ck('  까닭을 보여 준다', /읽힌 값이 기대와 다릅니다/.test(r.out), true);
  ck('  찾는 두 줄을 알려 준다', /sshd_config\.d\/\*\.conf/.test(r.out), true);
  ck('  앞 단계(방화벽)는 그대로 했다', /1 방화벽|22 허용/.test(r.out), true);
  ck('  50-cloud-init.conf 는 안 건드렸다',
    fs.readFileSync(path.join(sb.dry, 'etc/ssh/sshd_config.d/50-cloud-init.conf'), 'utf8').trim(),
    'PasswordAuthentication yes');
  try { fs.rmSync(sb.root, { recursive: true, force: true }); } catch (e) {}
}

console.log('\n════ ⑧ IP 를 못 찾으면 **방화벽을 켜지 않고** 멈춘다');
if (!BASH) {
  note('★ IP 못 찾음', '못 함 — bash 없음');
} else {
  const sb = sandbox({ noIp: true });
  const r = runSh(sb);
  ck('★★ 멈춘다', r.code !== 0, true);
  ck('★★ `ufw --force enable` 을 **안 불렀다**',
    /--force enable/.test(fs.readFileSync(sb.log, 'utf8')), false);
  ck('  22 허용도 안 했다', /port 22/.test(fs.readFileSync(sb.log, 'utf8')), false);
  ck('  까닭을 보여 준다', /지금 접속한 IP 를 찾지 못했습니다/.test(r.out), true);
  ck('  알려 줄 한 줄을 안내한다', /echo "\$SSH_CLIENT"/.test(r.out), true);
  try { fs.rmSync(sb.root, { recursive: true, force: true }); } catch (e) {}

  /* 키가 없으면 잠금만 건너뛰고 **나머지는 계속** */
  const sb2 = sandbox({ noKeys: true });
  const r2 = runSh(sb2);
  ck('★ 키가 없으면 잠금만 건너뛰고 끝까지 간다', r2.code, 0);
  ck('  그때 `00-cosroad.conf` 를 안 썼다',
    fs.existsSync(path.join(sb2.dry, 'etc/ssh/sshd_config.d/00-cosroad.conf')), false);
  ck('  경고를 보여 준다', /아무도 못 들어옵니다/.test(r2.out), true);
  ck('  그래도 토큰·중계·Caddyfile 은 됐다',
    fs.existsSync(path.join(sb2.dry, 'etc/cosroad-relay/env'))
    && fs.existsSync(path.join(sb2.dry, 'opt/cosroad-relay/relay.js'))
    && fs.existsSync(path.join(sb2.dry, 'etc/caddy/Caddyfile')), true);
  try { fs.rmSync(sb2.root, { recursive: true, force: true }); } catch (e) {}
}

console.log('\n════ ⑩ **옛 글이 깔린 서버**에서 다시 돌리면 — 백업 뒤 새 글로 바뀐다');
if (!BASH) {
  note('★ 옛 글 바꿔 끼우기', '못 함 — bash 없음');
} else {
  /* 보정1 이 Caddyfile(`log` 블록 → 없음)과 unit(AF_UNIX 추가)을 고쳤다.
     이미 옛 글이 깔린 서버에서 **다시 돌려** 정말 바뀌는지 본다(안 바뀌면 토큰이 계속 쌓인다). */
  const sb = sandbox({ oldFiles: true });
  const a = runSh(sb);
  ck('★ 돌림 성공', a.code, 0);
  const cfp = path.join(sb.dry, 'etc/caddy/Caddyfile');
  const unp = path.join(sb.dry, 'etc/systemd/system/cosroad-relay.service');
  const rdx = (f) => { try { return LF(fs.readFileSync(f, 'utf8')); } catch (e) { return '(없음)'; } };
  ck('★★ Caddyfile 의 `log` 블록이 **없어졌다**', /\blog\s*\{/.test(rdx(cfp)), false);
  ck('★★ unit 에 `AF_UNIX` 가 **들어갔다**',
    /RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6/.test(rdx(unp)), true);
  const baks = (d) => fs.readdirSync(path.join(sb.dry, d)).filter((f) => /\.bak-/.test(f)).length;
  ck('★ 옛 Caddyfile 을 **백업해 두었다**', baks('etc/caddy') >= 1, true);
  ck('★ 옛 unit 도 백업해 두었다', baks('etc/systemd/system') >= 1, true);
  /* 두 번째 돌림 — 이제는 같으므로 「이미 같음」 갈래 */
  const b = runSh(sb);
  ck('★★ 두 번째 돌림도 성공', b.code, 0);
  ck('★★ 「이미 같습니다」로 지나간다(Caddyfile)', /Caddyfile 이 이미 같습니다/.test(b.out), true);
  ck('★★ unit 도 「같은 내용이 이미 있습니다」', /같은 내용이 이미 있습니다/.test(b.out), true);
  ck('★ 백업이 **더 늘지 않았다**', baks('etc/caddy') + baks('etc/systemd/system'), 2);
  try { fs.rmSync(sb.root, { recursive: true, force: true }); } catch (e) {}
}

console.log('\n════ ⑨ 설치 글 · CLAUDE.md');
{
  ck('★ 설치 글 맨 위에 **두 줄**이 있다',
    /curl -fsSL https:\/\/raw\.githubusercontent\.com\/COSROAD\/cosroad\/main\/relay\/install\.sh -o install\.sh/.test(GUIDE)
    && /sudo bash install\.sh/.test(GUIDE), true);
  ck('  그 두 줄이 ⓞ·ⓐ 보다 앞',
    GUIDE.indexOf('sudo bash install.sh') < GUIDE.indexOf('## ⓐ'), true);
  ck('★ 손으로 할 때(ⓐ~ⓗ)는 남겨 두었다',
    /## ⓐ/.test(GUIDE) && /## ⓗ/.test(GUIDE), true);
  ck('★★ ⓓ 의 PowerShell 토큰 줄은 **없앴다**(16자밖에 안 나왔다)',
    /Get-Random -Count 64/.test(GUIDE), false);
  ck('  토큰은 **서버가 만든다**고 적었다', /openssl rand -hex 32/.test(GUIDE), true);
  /* ★★ v319(74-C): `.sh` 가 CRLF 면 리눅스 bash 가 `$'\r': command not found` 로 **아예 안 돈다**.
     `raw.githubusercontent.com` 은 커밋된 그대로 주므로 **커밋 blob 이 LF** 여야 하고,
     윈도우에서 새로 clone 해도 그러도록 `.gitattributes` 에 못 박아 둔다. */
  const ATTR = LF(fs.readFileSync(COS_ROOT + '/.gitattributes', 'utf8'));
  ck('★★ `.gitattributes` 가 `relay/*.sh` 를 LF 로 고정', /^relay\/\*\.sh text eol=lf$/m.test(ATTR), true);
  ck('★★ 지금 파일에 CR 바이트 0',
    fs.readFileSync(COS_ROOT + '/relay/install.sh').filter
      ? Buffer.from(fs.readFileSync(COS_ROOT + '/relay/install.sh')).includes(13) : true, false);
  ck('  git 이 본 줄끝도 LF(index·작업트리)',
    (() => { try { const r = cp.spawnSync('git', ['-C', COS_ROOT, 'ls-files', '--eol', 'relay/install.sh'],
      { encoding: 'utf8' }); return /i\/lf\s+w\/lf/.test(String(r.stdout || '')); } catch (e) { return '못 봄'; } })(), true);
  ck('★ CLAUDE.md 에 74-C 한 단락', /74-C/.test(CLAUDE) && /install\.sh/.test(CLAUDE), true);
  ck('  그 단락에 멱등·토큰·되돌리기가 있다',
    /멱등/.test(CLAUDE) && /00-cosroad\.conf/.test(CLAUDE), true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과')
  + (skipped ? '  (못 한 검사 ' + skipped + '건 — 위 • 줄)' : ''));
console.log('※ 가짜 명령(ufw·sshd·systemctl·caddy·curl) + 임시 폴더 — **바깥 통신 0 · 진짜 발송 0 · 서버 손 0**');
process.exit(fail ? 1 : 0);
})();
