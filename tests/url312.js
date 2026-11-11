/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
const { thisRef } = require('./thisref.js');   /* 회차 커밋 찾기 한 벌 */
/* 코스로드68 보정3 — **출석 알림 문자에서 쓰지 않는 주소 줄 빼기** (v312).
   ① 재현 — 옛 판 문자에 `cosroad.com?name=<이름>&time=…&org=…` 가 들어갔다
   ② 그 칸을 **읽는 곳이 0** — `URLSearchParams` 전수(`org`·`admin`·`signup` 만 본다)
   ③ 고친 뒤 — 그 줄이 없고 **나머지 줄은 그대로** · 주소 0개
   ④ 같은 꼴 전수 — 문자·알림톡·카톡 글에 「이름·전화가 들어간 주소」 **0곳**(대조: 옛 판 1곳)
   ⑤ 알림톡 네 업종 글은 **한 줄도** 안 바뀜 · 공유 주소는 **토큰만**
   ★ 실제 발송 0 — 가짜 `window.open` 이 「보내려 한 글」만 적는다. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

const OLD_REF = process.env.COS_SRC_OLD_REF || '4d3d69a';   /* v311 — 고치기 전 */
const F = (p) => fs.readFileSync(COS_ROOT + '/' + p, 'utf8').replace(/\r\n/g, '\n');
const OLD = (p) => cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':' + p,
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
/* 아무 커밋의 글을 떠서 본다(그 회차에서 재야 하는 칸이 있다) */
const OLD2 = (ref, p) => cp.execSync('git -C ' + COS_ROOT + ' show ' + ref + ':' + p,
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const NEW_SRC = F('index.html'), OLD_SRC = OLD('index.html');
/* ★ 이 회차 커밋 — 「서버 0줄」은 **두 커밋 사이**로 잰다(하나만 쓰면 작업트리까지 재서
   다음 회차가 서버를 고치면 거짓으로 깨진다 · v272 보정1 규칙). */
const THIS_REF_312 = thisRef(312);   /* 그 회차 커밋 — 제목이 (v312) 인 것 */
/* 쪽지(주석)는 떼고 센다 — 「왜 뺐는지」 적어 둔 쪽지가 「쓰고 있다」로 잡힌다(68·보정2 교훈) */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((x) => !x.trim().startsWith('//')).join('\n');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52)
    + String(got).replace(/\n/g, '⏎').slice(0, 46) + (ok ? '' : '   (기대 ' + want + ')'));
};

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
  location: '인천 연수구 1', lat: 37.41, lon: 126.68,
  phone: '010-1111-1111', phone2: '010-2222-2222' }];

function app(src) {
  const SUF = '__B';
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(MEM);
  store['tkd_cars' + SUF] = JSON.stringify([{ id: 'car1', name: '1호차' }]);
  store['tkd_courses' + SUF] = JSON.stringify([{ id: 'c1', name: '오전반' }]);
  store['tkd_staff' + SUF] = JSON.stringify([]);
  store['tkd_notices' + SUF] = '[]';
  store['tkd_org' + SUF] = JSON.stringify({ name: '가온학원', icon: '🚐', bizType: 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  const R = E.build({ src: src || NEW_SRC, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  const L = { sms: [] };
  R.sandbox.window.open = R.win.open = function (u) {
    const s = String(u || '');
    if (s.indexOf('sms:') === 0) {
      const q = s.indexOf('?body=');
      L.sms.push({ to: s.slice(4, q), body: decodeURIComponent(s.slice(q + 6)) });
    }
    return null;
  };
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userBizType='academy';"
     + " window._userPaidUntil=Date.now()+1e9; _firstSyncOk=true;");
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();'
     + ' notices = loadNotices(); orgSettings = loadOrgSettings();');
  return { R, L };
}
const checkinBody = (p) => {
  p.R.ev('sendCheckinSMSText(members[0], "오후 3:00");');
  return (p.L.sms[0] || {}).body || '(안 보냄)';
};

(async () => {
  console.log('════ ① 재현 — 옛 판(v311) 출석 문자에 쓰지 않는 주소가 들어갔다');
  const was = checkinBody(app(OLD_SRC));
  console.log('     옛 판 끝줄: ' + JSON.stringify(was.split('\n').pop()));
  ck('[옛] 「출석 확인:」 줄이 있었다', /출석 확인: /.test(was), true);
  ck('[옛] ★ 그 주소에 **«회원» 이름**이 들어갔다',
    /cosroad\.com\?name=%/.test(was) ? '들어갔다' : '안 들어갔다', '들어갔다');
  ck('[옛] 주소 개수', (was.match(/https?:\/\//g) || []).length, 1);
  ck('[옛] 소스에도 그 주소를 만들고 있었다', /var checkUrl = 'https:\/\/cosroad\.com\?name='/.test(OLD_SRC), true);

  console.log('\n② 그 칸을 **읽는 곳이 0** (그래서 눌러도 하는 일이 없었다)');
  {
    /* `URLSearchParams(...).get('…')` 로 **실제로 읽는 칸** 전수 */
    const got = [...new Set((codeOnly(NEW_SRC).match(/\.get\('([a-zA-Z0-9_]+)'\)/g) || [])
      .map((x) => x.slice(6, -2)))].sort();
    console.log('     앱이 주소에서 읽는 칸: ' + got.join(', '));
    ck('★ `name` 을 읽는 곳 0', got.indexOf('name') < 0, true);
    ck('★ `time` 을 읽는 곳 0', got.indexOf('time') < 0, true);
    ck('  (대조) `org` 는 **읽는다**', got.indexOf('org') >= 0, true);
    ck('  옛 판도 같았다(그때부터 안 읽었다)',
      /\.get\('name'\)/.test(codeOnly(OLD_SRC)), false);
  }

  console.log('\n③ 고친 뒤 — 그 줄만 빠지고 나머지는 그대로');
  {
    const p = app();
    const now = checkinBody(p);
    console.log('     고친 뒤: ' + JSON.stringify(now));
    ck('★ 「출석 확인:」 줄이 **없다**', /출석 확인/.test(now), false);
    ck('★ 주소가 **0개**', (now.match(/https?:\/\//g) || []).length, 0);
    ck('★ 이름이 주소에 **안 들어간다**', /\?name=/.test(now), false);
    ck('  머리글은 그대로', now.split('\n')[0], '[가온학원] 출석 알림');
    ck('  이름·날짜·도착·수업 줄은 그대로',
      ['- 이름: 가하은', '- 날짜:', '- 도착: 오후 3:00', '- 수업: 오전반']
        .filter((x) => now.indexOf(x) >= 0).length, 4);
    ck('★ 마지막 줄이 안내 문구', now.split('\n').pop(), '- 학원에 안전하게 도착했습니다.');
    ck('  v311 의 그림 글자 빼기는 그대로',
      /[\u{1F300}-\u{1FAFF}\u{2300}-\u{23FF}\u{2700}-\u{27BF}]/u.test(now), false);
    ck('  빈 줄만 남지 않았다(끝이 깔끔하다)', /\n\s*$/.test(now), false);
    ck('  연락처 둘에게 보낸다', p.L.sms.length, 2);
    ck('  소스에서 `checkUrl` 이 사라졌다', (codeOnly(NEW_SRC).match(/checkUrl/g) || []).length, 0);
    ck('  (대조) 옛 판에는 두 번 나왔다(만들고 쓴다)',
      (codeOnly(OLD_SRC).match(/checkUrl/g) || []).length, 2);
  }

  console.log('\n④ 같은 꼴 전수 — 보내는 글 속 주소에 사람 정보가 들어가나');
  {
    /* ★ 보는 자리는 **「보내는 글」을 만드는 함수 안**이다 — 화면 단추의 길찾기 주소
       (티맵·네이버)는 **그 쪽이 읽는 진짜 주소**이고 글에 들어가지 않는다(아래에서 함께 센다). */
    const SENDERS = ['buildDropoffMessage', 'sendDropoffSMS', 'sendDropoffSoon', 'sendArrivalSoon',
      'sendCheckinSMSText', 'sendUnpaidOne', 'sendUnpaidAll', 'sendNoticeSms',
      'doSendNoticeMessage', 'buildAlimtalkMessage', 'sendKakaoAlimtalk', 'sendDropoffNotify'];
    const block = (s, f) => {
      const L = codeOnly(s).split('\n');
      const i = L.findIndex((x) => x.startsWith('function ' + f + '(')
        || x.startsWith('async function ' + f + '('));
      if (i < 0) return '';
      let d = 0, st = false, end = i;
      for (let j = i; j < L.length; j++) {
        for (const c of L[j]) { if (c === '{') { d++; st = true; } else if (c === '}') d--; }
        if (st && d === 0) { end = j; break; }
      }
      return L.slice(i, end + 1).join('\n');
    };
    const hits = (s) => SENDERS.flatMap((f) => (block(s, f)
      .match(/'https?:\/\/[^']*\?[^']*'\s*\+\s*encodeURIComponent\([^)]*\)/g) || [])
      .filter((x) => /member\.|\.name|\.phone/.test(x)).map((x) => f + ' → ' + x.slice(0, 44)));
    ck('★ 보내는 글에 사람 정보가 든 주소 **0곳**', hits(NEW_SRC).length, 0);
    ck('  (대조) 옛 판은 **한 곳**', hits(OLD_SRC).length, 1);
    ck('  그 한 곳이 출석 문자였다',
      /sendCheckinSMSText → 'https:\/\/cosroad\.com\?name='/.test(hits(OLD_SRC)[0] || ''), true);
    ck('  보내는 글 전체에 주소를 만드는 곳 0',
      SENDERS.flatMap((f) => block(NEW_SRC, f).match(/'https?:\/\//g) || []).length, 0);
    ck('  (화면 단추의 길찾기 주소는 그대로 둔다 — 티맵·네이버가 읽는다)',
      /tmap\.co\.kr[\s\S]{0,40}rGoName/.test(NEW_SRC) && /map\.naver\.com/.test(NEW_SRC), true);
    /* 알림톡 네 업종 글 — 주소가 애초에 없다 */
    const al = (s) => {
      const i = s.indexOf('function buildAlimtalkMessage(');
      return s.slice(i, s.indexOf('\n}', i));
    };
    ck('★ 알림톡 네 업종 글에 주소 0개', (al(NEW_SRC).match(/https?:\/\//g) || []).length, 0);
    ck('★ 알림톡 글은 **한 줄도** 안 바뀜', al(NEW_SRC) === al(OLD_SRC), true);
    ck('  하차 알림(승인 글)도 그대로',
      (NEW_SRC.match(/function buildDropoffMessage\([\s\S]*?\n\}/) || [''])[0]
        === (OLD_SRC.match(/function buildDropoffMessage\([\s\S]*?\n\}/) || [''])[0], true);
    /* 공유 주소는 토큰만 — 이름이 안 들어간다 */
    ck('★ 공유 주소는 `#토큰` 하나', /function shareUrlOf\(token\)\{ return SHARE_BASE \+ '#' \+ token; \}/.test(NEW_SRC), true);
    ck('  카톡 공유 글에도 이름 주소 0', /shareUrlOf\([^)]*name/.test(NEW_SRC), false);
  }

  console.log('\n⑤ 소스 전수');
  {
    ck('★ `api/`·`lib/`·규칙·`storage.rules` 0줄',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF
        + (THIS_REF_312 ? ' ' + THIS_REF_312 : '')
        + ' -- api lib firestore.rules storage.rules', { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
    console.log('      (잰 자리: ' + OLD_REF + ' → ' + (THIS_REF_312 || '작업트리') + ')');
    const panels = (s) => (s.match(/BACK_PANEL_IDS\s*=\s*\[[\s\S]*?\]/) || [''])[0];
    ck('  새 창(덮개) 0', panels(NEW_SRC) === panels(OLD_SRC) ? '그대로' : '바뀜', '그대로');
    ck('  (로그아웃 짝) 새 `setInterval`·리스너 0',
      (NEW_SRC.match(/setInterval\(/g) || []).length === (OLD_SRC.match(/setInterval\(/g) || []).length
        && (NEW_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length === (OLD_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length, true);
    ck('  (업체 분리) `ORG_KEYS` 그대로',
      (NEW_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0] === (OLD_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0], true);
    ck('  문자 출구 둘은 그대로(v311)',
      (codeOnly(NEW_SRC).match(/window\.open\(['"`]sms:/g) || []).length, 1);
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    ck('  버전 312 이상', appV >= 312 ? 'OK(' + appV + ')' : 'NG(' + appV + ')', 'OK(' + appV + ')');
    ck('  `version.json` 과 같다', String(JSON.parse(F('version.json')).version), String(appV));
    const QA = (s) => { const i = s.indexOf('var HELP_QA=['); return i < 0 ? '' : s.slice(i, s.indexOf('\n];', i)); };
    ck('★ 문답표에 그 줄을 설명하는 글이 **애초에 없었다**',
      /출석 확인/.test(QA(OLD_SRC)), false);
    ck('  지금도 없다', /출석 확인: https/.test(QA(NEW_SRC)), false);
    const qaN = (s) => (QA(s).match(/\{role:'(admin|driver|all)'/g) || []).length;
    /* ★ 「문답표를 안 건드렸다」는 **이 회차(v312) 커밋**에서 재야 한다 —
       뒷 회차(v313)가 다른 까닭으로 문답표를 고치면 작업트리로는 거짓으로 깨진다
       (회차 기록 묶음은 양쪽을 커밋에 고정한다 — v272 보정1 규칙). */
    const THIS_REF = thisRef(312);   /* 그 회차 커밋 — 제목이 (v312) 인 것 */
    const THIS_SRC = THIS_REF ? OLD2(THIS_REF, 'index.html') : NEW_SRC;
    ck('  이 회차는 문답표를 안 건드렸다', QA(THIS_SRC) === QA(OLD_SRC) ? '그대로' : '바뀜', '그대로');
    console.log('      (잰 자리: ' + OLD_REF + ' → ' + (THIS_REF || '작업트리') + ')');
    /* ★ v315(72-B): **그 회차 커밋에서** 잰다(위 THIS_SRC) — 작업트리로 재면
       뒷 회차가 문답을 더할 때마다 거짓으로 깨진다. */
    ck('  문답 항목 수(그 회차)', qaN(THIS_SRC), qaN(OLD_SRC));
    ck('★ 소스 쪽지에 **왜 뺐는지** 적혀 있다',
      /읽는 곳이 /.test(NEW_SRC) && /이름이 주소에 들어가/.test(NEW_SRC)
        && /URLSearchParams/.test(NEW_SRC), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 실제 발송 0 — 가짜 window.open 이 「보내려 한 글」만 적었습니다');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
