/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ① v253 보정4 — 기사 문서가 마스터 목록에서 빠졌나 (전/후) */
const cp = require('child_process');
const E = require('./env246.js');
const D = require('./detect.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + label.padEnd(58) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const BASE = process.env.COS_SRC_OLD_REF || 'c407fc3';   // 보정4 **전**
const OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':index.html', { maxBuffer: 1 << 28 }).toString();
const NEW = E.SRC_NEW;

/* 업체 4건(승인 2·대기 2) + 기사 3건 — 기사 문서는 createDriver 가 넣는 필드만 */
const USERS = [
  { _uid: 'Uap1aaaaaaaa111111', orgName: '가온학원', bizType: 'academy', approved: true,
    signupMethod: 'phone', phone: '01011112222', createdAt: Date.UTC(2026, 8, 3, 1, 0) },
  { _uid: 'Uap2bbbbbbbb222222', orgName: '가온학원', bizType: 'academy', approved: true,
    signupMethod: 'email', email: 'gaon2@x.com', createdAt: Date.UTC(2026, 9, 11, 1, 0) },
  { _uid: 'Upd1cccccccc333333', orgName: '대기물류', bizType: 'logistics', approved: false,
    signupMethod: 'phone', phone: '01033334444', createdAt: Date.UTC(2026, 9, 28, 1, 0) },
  { _uid: 'Upd2dddddddd444444', orgName: '대기택배', bizType: 'delivery', approved: false,
    signupMethod: 'phone', phone: '01055556666', createdAt: Date.UTC(2026, 9, 29, 1, 0) },
  /* 기사 3건 — approved 없음. 하나는 업체명과 **같은 name** 을 줘서 「같은 이름」 판정까지 본다 */
  { _uid: 'Udr1eeeeeeee555555', role: 'driver', driverOrg: 'academy_x', ownerUid: 'Uap1aaaaaaaa111111',
    carId: 'car1', name: '박기사', phone: '01077778888', createdAt: Date.UTC(2026, 9, 30, 1, 0) },
  { _uid: 'Udr2ffffffff666666', role: 'driver', driverOrg: 'freezone_test', ownerUid: 'MASTER',
    carId: 'car2', name: '이기사', phone: '01088889999', createdAt: Date.UTC(2026, 9, 30, 2, 0) },
  /* ★ 기사 문서에 orgName 이 **있는** 경우까지 — 옛 자료·손수정으로 생길 수 있다 */
  { _uid: 'Udr3gggggggg777777', role: 'driver', driverOrg: 'academy_x', ownerUid: 'Uap1aaaaaaaa111111',
    carId: 'car3', orgName: '대기물류', phone: '01000001111', createdAt: Date.UTC(2026, 9, 30, 3, 0) }
];

function boot(src, users) {
  const R = E.build({ src: src, biz: 'academy' });
  if (R.error) throw R.error;
  R.win.location.search = '?org=admin';
  R.sandbox.location.search = '?org=admin';
  const el = E.makeEl('div'); el.id = 'master-root';
  el.classList = { add(){}, remove(){}, toggle(){} };
  R.document.registerId('master-root', el);
  R.sandbox.masterCompanies = []; R.sandbox.masterInquiries = [];
  R.sandbox.signupUsers = JSON.parse(JSON.stringify(users));
  R.sandbox.drawMasterPanel();
  return { R: R, h: el.innerHTML || '' };
}
const uidTails = (h) => (h.match(/uid …(\w{6})/g) || []).map(s => s.slice(-6)).sort();

console.log('════ 1. 승인 대기 목록에 기사가 섞이나 (전/후) ════');
for (const [name, src] of [['보정4 전', OLD], ['보정4 후', NEW]]) {
  const { h } = boot(src, USERS);
  const pendN = /🔔 승인 대기 \((\d+)\)/.exec(h);
  const apprN = /✅ 승인된 업체 \((\d+)\)/.exec(h);
  const tails = uidTails(h);
  console.log('  [' + name + '] 대기 ' + (pendN && pendN[1]) + ' / 승인 ' + (apprN && apprN[1])
    + ' / 그려진 줄 uid: ' + tails.join(','));
  if (src === OLD) {
    ck('   전: 대기 건수가 5 (업체 2 + **기사 3**)', pendN && pendN[1], '5');
    ck('   전: 기사 줄이 그려졌다', tails.filter(t => /^(555555|666666|777777)$/.test(t)).length, 3);
    ck('   전: 기사 줄에 🗑 신청 삭제 단추가 붙는다',
      /deleteSignupUser\(&quot;Udr1eeeeeeee555555&quot;/.test(h), true);
    ck('   전: 승인된 업체는 2', apprN && apprN[1], '2');
  } else {
    ck('   후: 대기 건수가 2 (업체만)', pendN && pendN[1], '2');
    ck('   후: 기사 줄 0개', tails.filter(t => /^(555555|666666|777777)$/.test(t)).length, 0);
    ck('   후: 기사 uid 가 화면에 아예 없다',
      ['Udr1eeeeeeee555555', 'Udr2ffffffff666666', 'Udr3gggggggg777777']
        .some(u => h.indexOf(u) >= 0), false);
    ck('   후: 기사 번호도 화면에 없다',
      ['01077778888', '01088889999', '01000001111'].some(p => h.indexOf(p) >= 0), false);
    ck('   후: 기사에 붙던 단추 0개',
      ['Udr1eeeeeeee555555', 'Udr2ffffffff666666', 'Udr3gggggggg777777']
        .reduce((n, u) => n + (h.match(new RegExp(u, 'g')) || []).length, 0), 0);
    ck('   후: 승인된 업체는 2 (그대로)', apprN && apprN[1], '2');
    ck('   후: 업체 신청 2건은 그대로 그려진다', tails.filter(t => /^(333333|444444)$/.test(t)).length, 2);
    ck('   후: 승인 업체 2건도 그대로', tails.filter(t => /^(111111|222222)$/.test(t)).length, 2);
  }
}

console.log('\n════ 2. 「⚠ 같은 이름」 판정에서도 기사가 빠지나 ════');
{
  /* Udr3 은 orgName 이 '대기물류' 다 — 걸러내지 않으면 대기물류가 「같은 이름」으로 잘못 잡힌다 */
  const a = boot(OLD, USERS), b = boot(NEW, USERS);
  const cntA = (a.h.match(/⚠ 같은 이름/g) || []).length;
  const cntB = (b.h.match(/⚠ 같은 이름/g) || []).length;
  console.log('  전 ' + cntA + '개 / 후 ' + cntB + '개');
  /* 전: 가온학원 2줄 + 대기물류 1줄 + **기사 줄 자신**(orgName 이 '대기물류') 1줄 = 4개.
     처음에 기사 줄이 그려지는 것을 빼고 3개로 셌다 — 산수를 틀렸다. */
  ck('전: 4개 (가온 2 + 대기물류 1 + 기사 줄 자신 1 — 기사 때문에 잘못 잡혔다)', cntA, 4);
  ck('후: 가온학원 2줄만 = 2개', cntB, 2);
  ck('   후: 대기물류 줄에는 표시 없음',
    (function(){ var i=b.h.indexOf('대기물류'); return /⚠ 같은 이름/.test(b.h.slice(Math.max(0,i-400), i)); })(), false);
}

console.log('\n════ 3. 기사가 없을 때는 전과 **바이트 동일**인가 ════');
{
  const only = USERS.filter(u => u.role !== 'driver');
  const a = boot(OLD, only), b = boot(NEW, only);
  /* v259: 마스터 패널 맨 위 수를 「승인 업체 수」로 바꾸고 맨 아래 개통 대장 묶음을 뺐다 — 일부러 바꾼 자리. 이번 회차 표는 p_app259.js */
  /* 맨 위 수 칸은 자리표로 바꾸고 맨 아래 개통 대장 묶음은 떼어 내고 견준다
     (v253 보정4 가 지키려던 것은 「기사 문서가 목록에 섞이지 않는다」 — 그것은 그대로 본다) */
  const strip259 = (h) => h
    .replace(/<span style="font-size:13px;color:#667085;">[^<]*<\/span>/, '«수»')
    .replace(/<div style="background:#FFFAEB[\s\S]*$/, '');
  /* v261: 가입자 줄에 **사업자 정보 한 줄**(🧾)과 계좌 칸에 **알림 받을 번호**(🔔 + bill-notify)를
     더했다 — 일부러 바꾼 자리다. 이번 회차 표는 t_app261.js. 그 셋을 떼어 내고 견준다. */
  const strip261 = (h) => strip259(h)
    .replace(/<div style="font-size:11px;color:#(?:98A2B3|344054);margin-top:3px;">🧾[\s\S]*?<\/div>/g, '')
    .replace(/<div style="font-size:11px;color:#6941C6;font-weight:700;margin:8px 0 4px;">🔔[^<]*<\/div>/g, '')
    .replace(/<input id="bill-notify"[^>]*\/>/g, '');
  /* v263: 승인된 줄에 **남은 날·이용 끝**과 단추 셋(연장·기간·기록)이 더해졌고,
     승인·승인취소 단추 이름이 바뀌었다 — 일부러 바꾼 자리다(표는 v_app263.js). 떼고 견준다. */
  const strip263 = (h) => strip261(h)
    /* 남은 날·이용 끝 줄 */
    .replace(/<div style="margin-top:3px;"><span style="font-size:11px;color:#(?:B42318|B54708|667085);[\s\S]*?<\/span><\/div>/g, '')
    /* 더한 단추 셋 */
    .replace(/<button onclick="master(?:ExtendAsk|SetPeriodAsk|BillingLog)\([\s\S]*?<\/button>/g, '')
    /* 승인·승인취소는 **부르는 함수와 넘기는 값**이 바뀌었다 → 자리표로 바꿔 견준다 */
    /* ★ 승인취소를 **먼저** 바꾼다 — setUserApproval 한 이름이 둘 다 쓰여서,
       승인 쪽을 먼저 돌리면 취소 자리까지 «승인» 으로 바뀐다(실제로 겪었다). */
    .replace(/onclick="(?:setUserApproval\([^"]*,false\)|masterUnapproveAsk\([^"]*\))"/g, 'onclick="«승인취소»"')
    .replace(/onclick="(?:setUserApproval\([^"]*,true\)|masterApproveAsk\([^"]*\))"/g, 'onclick="«승인»"')
    .replace(/✅ 입금 확인 · 승인/g, '✅ 입금 확인 → 승인 (30일 무료 시작)')
    .replace(/flex-wrap:wrap;justify-content:flex-end;/g, '');
  /* ★ 코스로드41 에 더함 — v264 가 「💳 입금 계좌 안내」의 **구독료 한 칸**(`bill-fee`)을
     **요금 다섯 칸**(월간·연간·첫 결제 6개월·1년·체험 일수)과 미리보기 줄로 바꿨다.
     일부러 바꾼 자리다(CLAUDE.md 「옛 fee 칸은 없앴다」 · 표는 x_app264.js).
     ★ 「기사 문서가 목록에 섞이지 않는다」를 보는 것이 이 묶음의 일이므로, 그 요금 묶음은
       양쪽에서 떼어 내고 견준다. */
  const strip264 = (h) => strip263(h)
    /* 옛 쪽 — 구독료 한 칸 */
    .replace(/<input id="bill-fee"[^>]*\/>/g, '')
    /* 새 쪽 — 요금 제목 · 다섯 줄 · 미리보기 */
    .replace(/<div style="font-size:11px;color:#6941C6;font-weight:700;margin:10px 0 6px;">💰[^<]*<\/div>/g, '')
    .replace(/<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="flex:0 0 108px;[\s\S]*?<input id="bill-(?:pm|py|p6|p12|td)"[\s\S]*?\/><\/div>/g, '')
    .replace(/<div id="bill-preview"[\s\S]*?<\/div>/g, '');
  ck('업체만 있을 때 — 맨 위 수·개통 대장·v261 사업자줄·v263 기간줄·v264 요금칸 빼고 바이트 동일',
    strip264(a.h) === strip264(b.h), true);
  ck('   대조 — v264 요금 칸을 떼지 않으면 다르다',
    strip263(a.h) === strip263(b.h), false);
  ck('   대조 — 떼어 내지 않으면 다르다 (v261 이 실제로 더했다)', strip259(a.h) === strip259(b.h), false);
  console.log('      길이 ' + a.h.length + ' / ' + b.h.length
    + '  (뺀 뒤 ' + strip259(a.h).length + ' / ' + strip259(b.h).length + ')');
}

console.log('\n════ 4. 엉뚱한 자료에도 버티나 ════');
{
  const odd = [
    null, undefined,
    { _uid: 'Ux1', role: 'driver' },
    { _uid: 'Ux2' },                                     // 아무 필드도 없는 문서
    { _uid: 'Ux3', orgName: '정상', approved: true, phone: '01012341234', createdAt: Date.UTC(2026,9,30) },
    { _uid: 'Ux4', role: 'DRIVER', orgName: '대문자역할', approved: false }   // 대문자 role
  ];
  let h = '', err = '';
  try { h = boot(NEW, odd).h; } catch (e) { err = e.message; }
  ck('터지지 않는다', err || 'ok', 'ok');
  ck('role:"driver" 는 빠졌나', h.indexOf('Ux1') < 0, true);
  ck('필드 없는 문서는 대기로 (종전대로)', h.indexOf('Ux2') >= 0, true);
  ck('정상 승인 업체는 보인다', h.indexOf('01012341234') >= 0, true);
  ck("role:'DRIVER'(대문자)는 **안 걸러진다** — 실제 저장값은 소문자뿐", h.indexOf('Ux4') >= 0, true);
  console.log('      (createDriver 가 role:\'driver\' 소문자로만 넣는다 — 대문자 자료는 없다)');
}

console.log('\n════ 5. 따옴표·escape 회귀 ════');
{
  const nasty = '"><img src=x onerror=alert(1)>';
  const { h } = boot(NEW, [
    { _uid: nasty, orgName: nasty, bizType: 'academy', approved: true, phone: nasty,
      createdAt: Date.UTC(2026, 9, 30), testAccess: true },
    { _uid: nasty + '2', orgName: nasty, bizType: 'academy', approved: false, phone: nasty,
      createdAt: Date.UTC(2026, 9, 30) },
    { _uid: nasty + '3', role: 'driver', orgName: nasty, phone: nasty }
  ]);
  const a = D.audit(h);
  ck('주입된 속성 0', a.injectedAttrs.length, 0);
  ck('   살아있는 태그 0', a.liveTags, 0);
  ck('   alert 0', a.alerted, 0);
  ck('   핸들러가 실제로 돌았나', a.ran > 0, true);
  ck('   문법 오류 0', a.errors.length, 0);
  ck('기사 줄은 빠졌나 (단추 2줄분만)', (h.match(/masterResetPwAsk\(/g) || []).length, 2);
}

console.log('\n════ 6. 자리 전수 — signupUsers 를 직접 쓰는 곳이 남았나 ════');
{
  /* ★ renderMasterPanel 은 drawMasterPanel **앞**에 정의돼 있다 — 그걸 끝 표시로 쓰면
     구간이 빈 문자열이 된다(처음에 그렇게 짜서 0줄로 나왔다).
     drawMasterPanel 다음에 나오는 첫 함수 선언까지 자른다. */
  const _s = NEW.indexOf('function drawMasterPanel(){');
  const _rest = NEW.slice(_s + 30);
  const _e = _rest.search(/\n(async )?function /);
  const seg = NEW.slice(_s, _s + 30 + (_e < 0 ? _rest.length : _e));
  console.log('  (구간 길이 ' + seg.length + '자)');
  /* 주석을 **블록째로** 걷어낸다 — 줄 앞이 글자인 /* … *​/ 안쪽 줄은
     줄 단위 필터로 못 걸러진다(처음에 그래서 주석 줄까지 셌다). */
  const noBlock = seg.replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), '')
                     .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const direct = noBlock.split('\n').filter(l => /signupUsers/.test(l));
  console.log('  drawMasterPanel 안에서 signupUsers 를 쓰는 줄:');
  direct.forEach(l => console.log('      ' + l.trim().slice(0, 90)));
  /* v259 가 맨 위 「승인 N곳」을 세느라 같은 걸름을 쓰는 줄 하나를 더했다.
     중요한 것은 「signupUsers 를 쓰는 **모든** 줄이 기사를 걸러낸다」는 것이다. */
  ck('signupUsers 를 쓰는 줄이 두 줄 (orgUsers · 맨 위 승인 수)', direct.length, 2);
  ck('   두 줄 모두 기사를 걸러낸다',
    direct.every(l => /role\s*!==\s*'driver'/.test(l)), true);
  ck('   (대조) 걸름 없는 줄이 있으면 잡힌다',
    ["var x = signupUsers.filter(function(u){ return u.approved===true; });"]
      .every(l => /role\s*!==\s*'driver'/.test(l)), false);
  ck('pending·approvedList 가 orgUsers 에서 나오나',
    /var pending = orgUsers\.filter/.test(seg) && /var approvedList = orgUsers\.filter/.test(seg), true);
  ck('masterIdLine 둘째 인자가 orgUsers (2곳)',
    (seg.match(/masterIdLine\(u, orgUsers\)/g) || []).length, 2);
  ck('   signupUsers 를 넘기는 masterIdLine 0곳',
    (NEW.match(/masterIdLine\(u, signupUsers\)/g) || []).length, 0);
}

console.log('\n════ 7. 규칙 원문 ════');
{
  const fs = require('fs');
  const src = fs.readFileSync('' + COS_ROOT + '/firestore.rules', 'utf8');
  ck('users delete 에 기사 제외 조건',
    src.indexOf("&& resource.data.get('role', '') != 'driver'") >= 0, true);
  ck('   approved 조건도 그대로',
    src.indexOf("&& resource.data.get('approved', false) != true") >= 0, true);
  ck('주석에 removeDriver 안내', /api\/admin-account\(removeDriver\)로만/.test(src), true);
  /* ★ 줄 수를 못 박으면 회차마다 어긋난다(v254 에서 425 → 437).
     이 묶음이 지켜야 할 것은 「기사 제외 조건이 그대로 있나」 뿐이다 — 줄 수는 보여만 준다. */
  console.log('      (규칙 줄 수 ' + (src.split('\n').length - (src.endsWith('\n') ? 1 : 0)) + '줄)');
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
