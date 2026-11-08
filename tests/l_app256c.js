/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v256 보정3 — 나머지 페이지 줄바꿈 + 회색 글자 + 인쇄 표 줄바꿈 통일
   전: 05a0f30 (보정2) · 후: 작업 중 */
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const BASE = process.env.COS_SRC_OLD_REF || '05a0f30';
/* ★ v273: 이 묶음은 **v256 보정3 회차 기록**이다 — 「새」쪽도 그 회차 커밋에 고정한다.
   전에는 `now(f)` 가 **작업트리**를 읽었다. 그래서 뒤 회차가 화면을 고치면
   「32화면 바이트 동일」이 거짓으로 깨졌다(v273 이 차량관리에 하원 띠를 넣자 2건).
   v256 보정3 이 틀린 것이 아니다. 지금 화면은 그 회차의 묶음이 본다. */
/* ★ 기대값이 뒷 회차에 앞으로 고쳐졌다 — break-all 을 한 곳으로 줄인 것이 v259 라, 「남은 break-all 1곳」 기대값은 v259 를 가리킨다.
   그래서 그 기대값이 가리키는 회차(v259)에 맞춘다(실측으로 골랐다). */
const NEW_REF = process.env.COS_SRC_NEW_REF || '3ce6379';   /* v259 */
const show = (f) => cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':' + f, { maxBuffer: 1 << 28 }).toString();
const now = (f) => cp.execSync('git -C ' + COS_ROOT + ' show ' + NEW_REF + ':' + f, { maxBuffer: 1 << 28 }).toString().split(String.fromCharCode(13) + String.fromCharCode(10)).join(String.fromCharCode(10));
const PAGES = ['index.html', 's.html', 'home.html', 'terms.html', 'privacy.html'];

console.log('════ 1. 5개 파일 body 에 같은 두 줄 ════');
for (const f of PAGES) {
  const o = show(f), n = now(f);
  const bodyOf = (src) => {
    const m = /(^|\n)\s*body\{([^}]*)\}/.exec(src);
    return m ? m[2] : '';
  };
  const bo = bodyOf(o), bn = bodyOf(n);
  const has = (b) => /word-break:keep-all/.test(b) && /overflow-wrap:anywhere/.test(b);
  ck(f.padEnd(13) + ' — 후: 두 줄 다 있다', has(bn), true);
  if (f === 'index.html') ck('   (index 는 보정1에서 이미 있었다)', has(bo), true);
  else if (f === 'home.html') ck('   (home 은 keep-all 만 있었다)', /word-break:keep-all/.test(bo) && !/overflow-wrap/.test(bo), true);
  else ck('   (전에는 둘 다 없었다)', /word-break|overflow-wrap/.test(bo), false);
  /* body 의 그 밖은 건드리지 않았나 — 두 줄을 **양쪽에서** 떼고 견준다 */
  const strip = (b) => b.replace(/;?word-break:keep-all/g, '').replace(/;?overflow-wrap:anywhere/g, '');
  ck('   body 의 그 밖은 그대로', strip(bn) === strip(bo), true);
}

console.log('\n════ 2. 회색 글자 (--gray-300 → --gray-400) ════');
{
  const o = show('index.html'), n = now('index.html');
  ck('전: --gray-300 을 쓰던 곳', (o.match(/var\(--gray-300\)/g) || []).length, 2);
  ck('후: --gray-300 0곳', (n.match(/--gray-300/g) || []).length, 0);
  ck('후: 그 자리가 --gray-400', (n.match(/설정 변경이 필요하면 관리자에게 문의하세요/g) || []).length, 2);
  ck('   두 자리 모두 gray-400 으로',
    (n.match(/color:var\(--gray-400\);">설정 변경이 필요하면/g) || []).length, 2);
  /* --gray-400 은 :root 에 **있는** 변수인가 (없는 변수로 또 바꾸면 똑같은 탈) */
  const defs = new Set();
  const re = /(^|[{;\s])(--[a-zA-Z0-9_-]+)\s*:/g; let m;
  while ((m = re.exec(n)) !== null) defs.add(m[2]);
  ck('--gray-400 은 :root 에 있다', defs.has('--gray-400'), true);
  /* 정의 안 된 변수가 5개 파일 전체에 **하나도** 남지 않았나 */
  let missing = [];
  for (const f of PAGES) {
    const s = now(f); const d = new Set(); const r2 = /(^|[{;\s])(--[a-zA-Z0-9_-]+)\s*:/g; let k;
    while ((k = r2.exec(s)) !== null) d.add(k[2]);
    const u = new Set(); const r3 = /var\(\s*(--[a-zA-Z0-9_-]+)\s*[,)]/g; let q;
    while ((q = r3.exec(s)) !== null) u.add(q[1]);
    [...u].filter(x => !d.has(x)).forEach(x => missing.push(f + ':' + x));
  }
  ck('5개 파일에 정의 안 된 CSS 변수 0개', missing.join(', ') || '없음', '없음');
}

console.log('\n════ 3. 인쇄 표 줄바꿈 통일 ════');
{
  const n = now('index.html'), sn = now('s.html');
  ck('거래명세서 PDF td — keep-all + overflow-wrap',
    /td\{word-break:keep-all;overflow-wrap:anywhere;\}';\s*$/m.test(n.split('\n').filter(l => /padding:8mm;box-sizing/.test(l))[0] || ''), true);
  ck('급여명세서 PDF td — overflow-wrap 더해짐',
    /padding:8mm 12mm 8mm 18mm[\s\S]{0,160}td\{word-break:keep-all;overflow-wrap:anywhere;\}/.test(n), true);
  ck('거래내역 PDF .range-tbl — keep-all 로',
    /\.range-tbl th,\.range-tbl td\{[^}]*word-break:keep-all;overflow-wrap:anywhere;\}/.test(n), true);
  ck('s.html .range-tbl td.item — keep-all 로',
    /\.range-tbl td\.item\{text-align:left;word-break:keep-all;overflow-wrap:anywhere;\}/.test(sn), true);
  /* 남겨 둘 두 곳 */
  const brk = (n.match(/word-break:break-all/g) || []).length;
  /* v259: 그 두 번째 자리는 **마스터 패널 개통 대장의 ?org= 주소 줄**이었다
     (보정3 지시문이 「공유 링크 미리보기」로 적었지만, 소스로 보면 drawMasterPanel 안이었다).
     v259 가 그 묶음을 화면에서 빼면서 함께 없어졌다 → 이제 .share-link-box 한 곳만 남는다. */
  ck('index.html 에 남은 break-all 은 1곳 (.share-link-box)', brk, 1);
  ck('   .share-link-box 는 그대로', /\.share-link-box\{[^}]*word-break:break-all/.test(n), true);
  ck('   (옛 기대) 그 자리는 마스터 패널 개통 대장 주소 줄이었고 v259 에 없어졌다',
    /margin-top:4px;word-break:break-all;">'\+url/.test(n), false);
  ck('   (대조) 보정3 당시에는 있었다',
    /margin-top:4px;word-break:break-all;">'\+url/.test(show('index.html')), true);
  ck('s.html .nt-body 는 손대지 않았다 (지시문 밖)', /\.nt-body\{[^}]*word-break:break-word/.test(sn), true);
}

console.log('\n════ 4. 앱 화면 — 4업종 × 9화면 HTML 동일 ════');
{
  const OLD = show('index.html'), NEW = now('index.html');
  const SUF = '__cosroad_default';
  const store = {};
  const put = (k, v) => { store[k + SUF] = JSON.stringify(v); };
  put('tkd_cars', [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-5555-6666' }]);
  put('tkd_members', [{ id: 1, name: '강하은', courseId: 'c1', carId: 'car1', location: '유원아파트',
    lat: 37.4, lon: 126.7, dropLocation: '유원아파트', phone: '010-1111-1111',
    days: ['월','화','수','목','금','토','일'], pin: '1111', on: true }]);
  put('tkd_courses', [{ id: 'c1', name: 'A반', depart: '15:00' }]);
  put('tkd_org', { name: '코스로드학원' }); put('tkd_staff', []);
  put('tkd_driver_att', {}); put('tkd_attendance', {}); put('tkd_payments', {});
  put('tkd_tax', {}); put('tkd_carlog', {});
  const boot = (src, biz) => {
    const R = E.build({ src: src, biz: biz, localStorage: Object.assign({}, store) });
    if (R.error) throw R.error;
    ['admin-content', 'app-content', 'drive-tabs', 'main-header'].forEach(id => {
      const el = E.makeEl('div'); el.id = id;
      el.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
      R.document.registerId(id, el);
    });
    R.win._auth = R.sandbox._auth = { currentUser: { uid: 'U1', isAnonymous: false, getIdToken: async () => 'T' } };
    R.win.fetch = R.sandbox.fetch = async () => ({ json: async () => ({ ok: true }) });
    R.win._db = R.sandbox._db = {};
    R.win._firestore = R.sandbox._firestore = {
      doc: (db, ...p) => ({ _p: p.join('/') }), collection: (db, ...p) => ({ _p: p.join('/') }),
      getDoc: async () => ({ exists: () => false, data: () => ({}) }), setDoc: async () => {},
      deleteDoc: async () => {}, getDocs: async () => ({ forEach: () => {} }), onSnapshot: () => () => {}
    };
    return R;
  };
  const TABS = ['dashboard', 'members', 'attendance', 'cars', 'schedule', 'payment', 'tax', 'notice', 'settings'];
  let same = 0; const diff = [];
  for (const biz of ['academy', 'public', 'logistics', 'delivery']) for (const tab of TABS) {
    const scr = (src) => {
      const R = boot(src, biz);
      R.ev("currentMode='admin'; currentAdminTab='" + tab + "';");
      try { R.sandbox.renderAdminTab(tab); } catch (e) { return 'ERR:' + e.message; }
      return String(R.document.getElementById('admin-content').innerHTML || '');
    };
    if (scr(OLD) === scr(NEW)) same++; else diff.push(biz + '/' + tab);
  }
  /* ★ 설정 화면 4장은 **일부러** 달라진다 — 회색 글자(--gray-300 → --gray-400)가 거기 있다.
     나머지 32장은 글자 하나까지 같아야 하고, 설정 화면도 **그 색 말고는** 같아야 한다. */
  ck('설정 화면 뺀 32화면 바이트 동일', same + '/32', '32/32');
  ck('달라진 화면은 4업종 설정 화면뿐', diff.slice().sort().join(','),
    'academy/settings,delivery/settings,logistics/settings,public/settings');
  let colorOnly = 0;
  for (const biz of ['academy', 'public', 'logistics', 'delivery']) {
    const scr2 = (src) => {
      const R = boot(src, biz);
      R.ev("currentMode='admin'; currentAdminTab='settings';");
      try { R.sandbox.renderAdminTab('settings'); } catch (e) { return 'ERR'; }
      return String(R.document.getElementById('admin-content').innerHTML || '');
    };
    const x = scr2(OLD), y = scr2(NEW);
    if (x.split('var(--gray-300)').join('var(--gray-400)') === y) colorOnly++;
  }
  ck('   설정 화면의 차이는 그 색 하나뿐', colorOnly + '/4', '4/4');
}

console.log('\n════ 5. 버전·바뀐 파일·설정 ════');
{
  /* v257 보정4: 기사 회원 탭·둘러보기 기사 화면·기사 출석 쓰기 회수 — 일부러 바꾼 자리다 */
  console.log('      지금 버전: ' + JSON.parse(now('version.json')).version
    + ' (이 회차는 256 이었다 — v257 이 올렸다)');
  ck('version.json 이 256 이상', JSON.parse(now('version.json')).version >= 256, true);
  ck('APP_VERSION 도 256 이상', Number((now('index.html').match(/const APP_VERSION = (\d+);/) || [])[1]) >= 256, true);
  const stat = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + BASE + ' ' + NEW_REF).toString().trim().split('\n');
  stat.forEach(l => { const p = l.split('\t'); console.log('      ' + p[2].padEnd(14) + '+' + p[0] + ' / −' + p[1]); });
  /* 보정3 의 여섯 파일이 모두 들어 있나 — v257 이 firestore.rules·version.json 을 더했다 */
  ck('보정3 의 여섯 파일이 모두 들어 있다',
    ['CLAUDE.md', 'home.html', 'index.html', 'privacy.html', 's.html', 'terms.html']
      .every(f => stat.some(l => l.split('\t')[2] === f)), true);
  /* v260: api/admin-account.js(옛 기사 계정 세 동작 삭제)·api/driver-auth.js(업체 단위 상한)를 고쳤다.
     이 회차 **자신이** api 를 건드렸는지로 본다. */
  ck('보정3 자신은 api 를 안 건드렸다',
    cp.execSync('git -C ' + COS_ROOT + ' diff --name-only 05a0f30 8596363').toString().indexOf('api/') < 0, true);
  ck('보정3 자신은 firestore.rules 를 안 건드렸다',
    cp.execSync('git -C ' + COS_ROOT + ' diff --name-only 05a0f30 8596363').toString().indexOf('firestore.rules') < 0, true);
  ck('CLAUDE.md 에 5개 파일 규칙', /5개 파일 `body` 에 모두 같은 두 줄/.test(now('CLAUDE.md')), true);
  /* ★ 코스로드53: 이 다섯 칸은 **그 컴퓨터의 클로드 설정 파일**(`.claude/settings.local.json`)을 본다.
     그 파일은 `.gitignore` 에 있어 **새로 받은 저장소에는 없다** — 없으면 건너뛴다.
     (실패로 세면 다른 자리에서 묶음이 영영 빨강이 된다. 있을 때는 전과 똑같이 잰다.) */
  const permPath = '' + COS_ROOT + '/.claude/settings.local.json';
  if (!fs.existsSync(permPath)) {
    console.log('  … 클로드 설정 5칸은 건너뜀 (이 컴퓨터에 .claude/settings.local.json 이 없다)');
  } else {
    const perm = JSON.parse(fs.readFileSync(permPath, 'utf8')).permissions;
    /* 11-01 17:41 사장님 지시로 권한을 다시 맞췄다 — ask 45 → 35, allow 379 → 381 */
    ck('설정 파일 ask 35줄 (다시 맞춤)', perm.ask.length, 35);
    ck('   gh 두 줄이 들어갔다', perm.ask.filter(x => /gh \*/.test(x)).sort().join(','), 'Bash(gh *),PowerShell(gh *)');
    ck('   allow 의 gh 3줄은 그대로', perm.allow.filter(x => /\bgh /.test(x)).length, 3);
    ck('   allow 381 / deny 4', perm.allow.length + '/' + perm.deny.length, '381/4');
    ck('   allow 에 도구 이름 두 줄', ['Bash', 'PowerShell'].every(x => perm.allow.indexOf(x) >= 0), true);
  }
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
