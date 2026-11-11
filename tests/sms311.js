/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
const { thisRef, srcAt } = require('./thisref.js');   /* 회차 커밋 찾기 한 벌 */
/* 코스로드68 보정2 — **문자 속 긴 사진 주소 → 짧은 「알림장 보기」 하나** ·
   **문자 글에서 그림 글자 빼기** (v311).
   ① 재현 — 옛 판 문자 본문에 「문자에 못 실리는 글자」가 몇 개인가(전수 표)
   ② `smsSafe` — 자리 규칙(줄 머리는 기호 · 가운데는 뺀다) · **실리는 기호는 그대로**
   ③ 출구는 **둘뿐** — `smsOpen` · `doSendNoticeMessage`(본문+제목) · 따로 적은 `sms:` 0곳
   ④ «알림장» 문자 — 공유 주소 **하나** · 토큰 **다시 쓰기** · 글이 바뀌면 **새로** ·
      스냅샷이 실패하면 **사진 주소로 떨어지고 문자는 나간다**
   ⑤ 소스 전수 — 규칙 0줄 · 알림톡·카톡 글 그대로 · 버전 · HELP_QA · CLAUDE.md
   ★ 실제 발송 0 — 가짜 `fetch`·가짜 `window.open` 이 **무엇을 보내려 했나**만 적는다. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

const OLD_REF = process.env.COS_SRC_OLD_REF || '931e336';   /* v310 — 고치기 전 */
const F = (p) => fs.readFileSync(COS_ROOT + '/' + p, 'utf8').replace(/\r\n/g, '\n');
const OLD = (p) => cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':' + p,
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const NEW_SRC = F('index.html'), OLD_SRC = OLD('index.html');
/* ★ 이 회차 커밋 — 「서버 0줄」은 **두 커밋 사이**로 잰다(하나만 쓰면 작업트리까지 재서
   다음 회차가 서버를 고치면 거짓으로 깨진다 · v272 보정1 규칙). */
const THIS_REF_311 = thisRef(311);   /* 그 회차 커밋 — 제목이 (v311) 인 것 */

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54)
    + String(got).replace(/\n/g, '⏎').slice(0, 44) + (ok ? '' : '   (기대 ' + want + ')'));
};

/* ── 문자 글자표(EUC-KR) 대조 ──
   ★ node 에는 EUC-KR 변환기가 없다 → **파이썬 `str.encode('euc-kr')` 로 뽑아 둔 표**를 쓴다
     (그 대조는 v311 보고문에 적었다). 여기서는 「문자에 실리는 기호」 목록을 지키고,
     그 밖에 **그림 글자 영역**이 남아 있는지를 센다. */
const OK_SYM = '▶※━─│·♥→←↑↓☆★■□●○◆◇☎㈜℃±×÷°…①②③④⑤';
const badChars = (s) => [...String(s)].filter((c) => {
  const cp = c.codePointAt(0);
  if (cp < 0x2000) return false;
  if (/[가-힣ㄱ-ㅎㅏ-ㅣ一-龥ぁ-ヶ]/.test(c)) return false;
  if (OK_SYM.indexOf(c) >= 0) return false;
  return true;
});
/* 소스에 `\uXXXX` 로 쓴 그림 글자도 글자로 되돌려 센다(v311 에 실제로 그렇게 적힌 줄이 있었다) */
const unesc = (s) => String(s)
  .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const fnBlock = (src, name) => {
  const L = src.split('\n');
  const i = L.findIndex((x) => x.startsWith('function ' + name + '(')
    || x.startsWith('async function ' + name + '('));
  if (i < 0) return [];
  let d = 0, started = false, end = i;
  for (let j = i; j < L.length; j++) {
    for (const c of L[j]) { if (c === '{') { d++; started = true; } else if (c === '}') d--; }
    if (started && d === 0) { end = j; break; }
  }
  return L.slice(i, end + 1).filter((x) => {
    const t = x.trim();
    return !(t.startsWith('/*') || t.startsWith('*') || t.startsWith('//'));
  });
};

const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const MEM = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7,
  location: '인천 연수구 1', dropLocation: '행복아파트 101동',
  lat: 37.41, lon: 126.68, phone: '010-1111-1111', phone2: '010-2222-2222' }];
const NOTICE = { id: 1, ts: Date.UTC(2026, 10, 1, 2, 0), date: '2026-11-01',
  content: '오늘은 비가 옵니다', images: ['data:image/jpeg;base64,AAAA'], target: 'all' };

function app(opt) {
  opt = opt || {};
  const SUF = '__B';
  const store = {};
  const notice = Object.assign({}, NOTICE, opt.notice || {});
  store['tkd_members' + SUF] = JSON.stringify(MEM);
  store['tkd_cars' + SUF] = JSON.stringify([{ id: 'car1', name: '1호차' }]);
  store['tkd_courses' + SUF] = JSON.stringify([{ id: 'c1', name: '오전반' }]);
  store['tkd_staff' + SUF] = JSON.stringify([]);
  store['tkd_notices' + SUF] = JSON.stringify([notice]);
  store['tkd_org' + SUF] = JSON.stringify({ name: '가온학원', icon: '🚐',
    bizType: opt.biz || 'academy', destName: '학원', destLat: 37.44, destLon: 126.65 });
  const R = E.build({ src: opt.src || NEW_SRC, biz: opt.biz || 'academy', localStorage: store });
  if (R.error) throw R.error;
  const L = { sms: [], api: [], opened: [] };
  /* 가짜 문자 창구 — **무엇을 보내려 했나**만 적는다(실제 발송 0) */
  R.sandbox.fetch = R.win.fetch = function (url, init) {
    let body = {};
    try { body = JSON.parse((init && init.body) || '{}'); } catch (e) {}
    L.api.push({ url: String(url), body: body });
    const bad = opt.smsFail ? { result_code: -1, message: '막혔어요' }
      : { result_code: 1, success_cnt: 1 };
    return Promise.resolve({ json: () => Promise.resolve(bad) });
  };
  R.sandbox.window.open = R.win.open = function (u) {
    const s = String(u || '');
    L.opened.push(s);
    if (s.indexOf('sms:') === 0) {
      const q = s.indexOf('?body=');
      L.sms.push({ to: s.slice(4, q), body: decodeURIComponent(s.slice(q + 6)) });
    }
    return null;
  };
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userBizType='" + (opt.biz || 'academy') + "';"
     + " window._userPaidUntil=Date.now()+1e9; _firstSyncOk=true; window._fbReady=true;");
  R.ev('window._auth={ currentUser:{ uid:"uB", isAnonymous:false,'
     + ' getIdToken:function(){ return Promise.resolve("t"); } } };');
  R.ev('saveToFirebase=function(){ return Promise.resolve(true); };'
     + ' saveCarState=function(){ return Promise.resolve(true); }; rebuildCarData=function(){};'
     + ' renderNotice=function(){ return ""; }; renderAdminTab=function(){};');
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();'
     + ' notices = loadNotices(); orgSettings = loadOrgSettings();');
  if (opt.shareFail) {
    /* 스냅샷 쓰기가 막힌 경우 — 규칙 거부와 같은 꼴 */
    R.ev('window._firestore = Object.assign({}, window._firestore, { setDoc:function(){'
       + ' return Promise.reject({ code:"permission-denied", message:"거부" }); } });');
  }
  return { R, L };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sendNotice = async (p) => { p.R.ev('sendNoticeSms(1);'); await wait(80); return p.L; };
const smsBodyOf = (p) => {
  const hit = p.L.api.filter((x) => /send-sms/.test(x.url));
  return hit.length ? String(hit[hit.length - 1].body.msg || '') : '(안 보냄)';
};

(async () => {
  console.log('════ ① 재현 — 옛 판(v310) 문자 본문에 「문자에 못 실리는 글자」가 있다');
  {
    const FNS = ['buildDropoffMessage', 'sendDropoffSoon', 'sendCheckinSMSText',
      'sendNoticeSms', 'showSharePanel'];
    let total = 0;
    FNS.forEach((f) => {
      const bad = fnBlock(OLD_SRC, f).flatMap((x) => badChars(unesc(x)));
      total += bad.length;
      console.log('     ' + f.padEnd(22) + (bad.length ? [...new Set(bad)].join(' ') : '없음'));
    });
    ck('[옛] 문자 글을 만드는 자리에 깨질 글자가 있었다', total > 0 ? '있다(' + total + '개)' : '없다', '있다(' + total + '개)');
    ck('[옛] «알림장» 문자에 「📷 사진 보기」', /📷 사진 보기/.test(OLD_SRC), true);
    const o = app({ src: OLD_SRC });
    await sendNotice(o);
    const ob = smsBodyOf(o);
    ck('[옛] ★ 그 문자에 **사진 주소가 그대로** 들어갔다',
      /https:\/\/fb\.example\//.test(ob) ? '들어갔다' : '안 들어갔다', '들어갔다');
    ck('[옛] ★ 그 문자에 깨질 글자가 남아 있었다',
      badChars(ob).join('') || '없음', '📷');
    ck('[옛] 공유 스냅샷은 **만들지 않았다**', o.R.saved.length, 0);
  }

  console.log('\n② `smsSafe` — 자리를 보고 바꾼다 · 실리는 기호는 그대로');
  {
    const p = app({});
    const safe = (s) => p.R.ev('smsSafe(' + JSON.stringify(s) + ')');
    ck('★ 줄 머리 표시는 「-」', safe('👤 이름: 가하은'), '- 이름: 가하은');
    ck('  ⏰·✅ 도 같다', safe('⏰ 하차: 3:00\n✅ 도착'), '- 하차: 3:00\n- 도착');
    ck('★ 가리키는 표시는 「▶」', safe('📷 사진 보기:'), '▶ 사진 보기:');
    ck('  👉 도 같다', safe('👉 출석 확인: x'), '▶ 출석 확인: x');
    ck('★ 글 **가운데** 꾸밈은 뺀다', safe('[가온] 🚐 1호차 운행 안내'), '[가온] 1호차 운행 안내');
    ck('  겹친 공백도 하나로', /\s\s/.test(safe('[가온] 🚐 1호차')), false);
    ck('★ 줄 머리 들여쓰기는 **지킨다**',
      safe('✅ 보호자님!\n     안전하게 하차했습니다.'), '- 보호자님!\n     안전하게 하차했습니다.');
    ck('★ 문자에 실리는 기호는 **그대로**',
      safe('▶ ※ ━ ♥ · → ★ ■ ● ◆ ☎ ㈜ ℃ 1,234원'), '▶ ※ ━ ♥ · → ★ ■ ● ◆ ☎ ㈜ ℃ 1,234원');
    ck('  주소·글자는 안 건드린다',
      safe('https://cosroad.com/s.html#AbC-_1 가하은님'), 'https://cosroad.com/s.html#AbC-_1 가하은님');
    ck('★ 표에 없는 그림 글자도 **남지 않는다**',
      badChars(safe('🦄🧀🛸 손님')).join('') || '0개', '0개');
    ck('  (대조) 같은 검사가 고치기 전 글에서는 잡는다',
      badChars('🦄🧀🛸 손님').length, 3);
    ck('  빈 값·숫자도 안 깨진다', safe('') + '/' + safe(0), '/0');
  }

  console.log('\n③ 문자가 나가는 **출구는 둘뿐**');
  {
    /* ★ 쪽지(주석)는 떼고 센다 — 「`window.open('sms:…')` 를 따로 적지 말 것」이라는
       **쪽지 자체**가 코드로 잡혔다(68 에서 겪은 것과 같은 함정). */
    /* ★ 여러 줄 쪽지는 **덩어리로** 떼야 한다 — 이 저장소 쪽지는 둘째 줄부터 `★`·`·` 로
       시작해서 「줄 앞이 `/*` 인가」로는 안 걸러진다(이 묶음을 만들며 실제로 겪었다). */
    const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((x) => !x.trim().startsWith('//')).join('\n');
    ck('★ 따로 적은 `window.open(\'sms:` 는 **한 곳**(그 한 벌 안)',
      (codeOnly(NEW_SRC).match(/window\.open\(['"`]sms:/g) || []).length, 1);
    ck('  그 한 줄이 `smsOpen` 안이다',
      /function smsOpen\([\s\S]{0,300}?window\.open\('sms:'\+to/.test(NEW_SRC), true);
    ck('  (대조) 옛 판은 **여덟 곳**이 따로 적었다',
      (codeOnly(OLD_SRC).match(/window\.open\(['"`]sms:/g) || []).length, 8);
    ck('  그 여덟 곳이 모두 `smsOpen` 으로 바뀌었다',
      (NEW_SRC.match(/\n\s*smsOpen\(/g) || []).length, 8);
    ck('★ `smsSafe`·`smsOpen` 한 벌',
      (NEW_SRC.match(/^function (smsSafe|smsOpen)\(/mg) || []).length, 2);
    ck('  `smsOpen` 이 `smsSafe` 를 부른다',
      /function smsOpen\([\s\S]{0,260}?smsSafe\(body\)/.test(NEW_SRC), true);
    ck('★ 서버 창구도 본문·**제목** 둘 다',
      /smsBody = smsSafe\(smsBody\);[\s\S]{0,40}title = smsSafe\(title\);/.test(NEW_SRC), true);
    ck('  `send-sms` 를 부르는 곳은 둘(알림장·문의)',
      (NEW_SRC.match(/sendMsgApi\('send-sms'|api\/send-sms/g) || []).length, 2);
    /* 실제로 폰 문자앱에 넘기는 글 — 깨질 글자 0 */
    const p = app({});
    p.R.ev('sendDropoffSMS(members[0], "오후 3:00");');
    p.R.ev('sendDropoffSoon(1);');
    p.R.ev('sendCheckinSMSText(members[0], "오후 3:00");');
    p.R.ev('sendUnpaidOne(1);');
    ck('★ 폰 문자앱으로 넘긴 글 수', p.L.sms.length >= 4 ? 'OK(' + p.L.sms.length + ')' : 'NG(' + p.L.sms.length + ')',
      'OK(' + p.L.sms.length + ')');
    const allBad = p.L.sms.flatMap((x) => badChars(x.body));
    ck('★ 그 글들에 깨질 글자', allBad.join('') || '0개', '0개');
    ck('  (대조) 옛 판 같은 네 자리는 잡힌다', (() => {
      const o = app({ src: OLD_SRC });
      o.R.ev('sendDropoffSMS(members[0], "오후 3:00");');
      o.R.ev('sendDropoffSoon(1);');
      o.R.ev('sendCheckinSMSText(members[0], "오후 3:00");');
      return [...new Set(o.L.sms.flatMap((x) => badChars(x.body)))].join('');
    })(), '👤⏰✅🏠📍📅📚👉');
  }

  console.log('\n④ «알림장» 문자 — 짧은 「알림장 보기」 주소 하나');
  {
    const p = app({});
    await sendNotice(p);
    const b = smsBodyOf(p);
    console.log('     보낸 본문: ' + JSON.stringify(b));
    ck('★ 공유 스냅샷을 **하나** 만들었다', p.R.saved.length, 1);
    ck('  그 종류가 `notice`', (p.R.saved[0] || {}).data.kind, 'notice');
    ck('  업체 표시도 들어간다(68)', (p.R.saved[0] || {}).data.org.label, '알림장');
    ck('  만든 사람(`ownerUid`)도', (p.R.saved[0] || {}).data.ownerUid, 'uB');
    ck('★ 본문에 「▶ 알림장 보기:」 한 줄', /\n▶ 알림장 보기:\n/.test(b), true);
    ck('★ 그 주소가 `s.html#토큰`',
      /https:\/\/cosroad\.com\/s\.html#[A-Za-z0-9_-]{22,}$/.test(b.trim()) ? 'OK' : b.slice(-40), 'OK');
    ck('★ **사진 주소는 안 들어간다**', /fb\.example/.test(b), false);
    ck('  주소는 **한 줄뿐**', (b.match(/https?:\/\//g) || []).length, 1);
    ck('★ 그 본문에 깨질 글자', badChars(b).join('') || '0개', '0개');
    ck('  제목도 깨질 글자 0',
      badChars(String((p.L.api.filter((x) => /send-sms/.test(x.url)).pop() || {}).body.title || '')).join('') || '0개', '0개');
    ck('  「보냄」 표시가 찍혔다', p.R.ev('loadNotices()[0].sent'), true);
    ck('★ 토큰을 «알림장» 에 적어 뒀다',
      /^[A-Za-z0-9_-]{22,}$/.test(String(p.R.ev('loadNotices()[0].shareToken') || '')), true);
    ck('  시각·글 표시도 함께',
      (p.R.ev('!!loadNotices()[0].shareTs')) && (p.R.ev('!!loadNotices()[0].shareSig')), true);

    /* 다시 보내기 — **스냅샷을 또 만들지 않는다** */
    const before = p.R.saved.length;
    await sendNotice(p);
    ck('★ 다시 보내도 스냅샷은 **그대로 하나**', p.R.saved.length, before);
    const b2 = smsBodyOf(p);
    ck('  같은 주소를 다시 썼다', b2 === b ? '같다' : b2.slice(-30), '같다');

    /* 카톡 공유를 눌러도 같은 주소 */
    const r = await p.R.ev('shareIssueNotice(1)');
    ck('★ 카톡 공유도 **같은 주소**를 쓴다', String(r.url) === String(p.R.ev('shareUrlOf(loadNotices()[0].shareToken)')), true);
    ck('  다시 쓴 것임을 표시한다', r.reused, true);
    ck('  그래서 스냅샷 수도 그대로', p.R.saved.length, before);

    /* 글을 고치면 **새로** 만든다 */
    p.R.ev('notices[0].content = "내일은 쉽니다"; saveNotices();');
    await sendNotice(p);
    ck('★ 글을 고치면 **새 스냅샷**', p.R.saved.length, before + 1);
    const b3 = smsBodyOf(p);
    ck('  주소도 새것', b3 !== b ? '다르다' : '같다', '다르다');
    ck('  그 스냅샷 글이 **바뀐 글**', (p.R.saved[p.R.saved.length - 1] || {}).data.content, '내일은 쉽니다');
  }

  console.log('\n④-2 사진이 없으면 주소를 안 넣는다 · 스냅샷이 실패하면 사진 주소로 떨어진다');
  {
    const noImg = app({ notice: { images: [] } });
    await sendNotice(noImg);
    const b = smsBodyOf(noImg);
    ck('★ 사진 없는 «알림장» 은 주소 0줄', (b.match(/https?:\/\//g) || []).length, 0);
    ck('  스냅샷도 안 만든다', noImg.R.saved.length, 0);
    ck('  문자는 나간다', /오늘은 비가 옵니다/.test(b), true);

    const bad = app({ shareFail: true });
    await sendNotice(bad);
    const bb = smsBodyOf(bad);
    ck('★ 스냅샷이 막히면 **문자는 그대로 나간다**', /오늘은 비가 옵니다/.test(bb), true);
    ck('  그때는 사진 주소로 떨어진다', /fb\.example/.test(bb), true);
    ck('★ 그래도 **그림 글자는 없다**', badChars(bb).join('') || '0개', '0개');
    ck('  「사진 보기:」 로 적는다', /\n\n사진 보기:\n/.test(bb), true);
    ck('  (대조) 옛 판은 그 자리에 📷 를 썼다', /📷 사진 보기/.test(OLD_SRC), true);
  }

  console.log('\n⑤ 소스 전수 — 알림톡·카톡 글은 그대로 · 규칙 0줄');
  {
    const keep = (src, f) => fnBlock(src, f).join('\n');
    ck('★ 알림톡 승인 글(`buildDropoffMessage`)은 **한 줄도** 안 바뀜',
      keep(NEW_SRC, 'buildDropoffMessage') === keep(OLD_SRC, 'buildDropoffMessage'), true);
    ck('  그 글에 그림 글자가 **그대로 있다**(알림톡은 나온다)',
      [...new Set(badChars(keep(NEW_SRC, 'buildDropoffMessage')))].join(''), '👤⏰✅');
    ck('★ 카톡 붙여넣기 글(`showSharePanel`)도 그대로',
      /const shareText=`\[\$\{orgSettings\.name\}\] 🚐 /.test(NEW_SRC), true);
    ck('  알림톡 템플릿 코드 목록 그대로',
      (NEW_SRC.match(/BIZ_(DROPOFF_)?TEMPLATE_CODES\s*=\s*\{[^}]*\}/g) || []).join('')
        === (OLD_SRC.match(/BIZ_(DROPOFF_)?TEMPLATE_CODES\s*=\s*\{[^}]*\}/g) || []).join(''), true);
    ck('★ `api/`·`lib/`·규칙·`storage.rules` 0줄',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF
        + (THIS_REF_311 ? ' ' + THIS_REF_311 : '')
        + ' -- api lib firestore.rules storage.rules', { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
    console.log('      (잰 자리: ' + OLD_REF + ' → ' + (THIS_REF_311 || '작업트리') + ')');
    ck('  공유 스냅샷 윗단 키는 그대로 9개(규칙이 못 박았다)',
      (F('firestore.rules').match(/'v','kind','org','date','content','images','createdAt','expiresAt','ownerUid'/g) || []).length, 1);
    const panels = (s) => (s.match(/BACK_PANEL_IDS\s*=\s*\[[\s\S]*?\]/) || [''])[0];
    ck('★ 새 창(덮개) 0', panels(NEW_SRC) === panels(OLD_SRC) ? '그대로' : '바뀜', '그대로');
    ck('  (로그아웃 짝) 새 `setInterval`·리스너 0',
      (NEW_SRC.match(/setInterval\(/g) || []).length === (OLD_SRC.match(/setInterval\(/g) || []).length
        && (NEW_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length === (OLD_SRC.match(/onSnap\(|onSnapshot\(/g) || []).length, true);
    ck('  (업체 분리) `ORG_KEYS` 그대로',
      (NEW_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0] === (OLD_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0], true);
    ck('  문지기 자리(줄지 않았다)',
      (NEW_SRC.match(/!okToWriteNow\(\)/g) || []).length >= 17 ? 'OK' : 'NG', 'OK');
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    ck('  버전 311 이상', appV >= 311 ? 'OK(' + appV + ')' : 'NG(' + appV + ')', 'OK(' + appV + ')');
    ck('  `version.json` 과 같다', String(JSON.parse(F('version.json')).version), String(appV));
    const QA = (s) => { const i = s.indexOf('var HELP_QA=['); return i < 0 ? '' : s.slice(i, s.indexOf('\n];', i)); };
    ck('★ HELP_QA — 「알림장 보기」 주소 한 줄', /「▶ «알림장» 보기:」 주소 한 줄/.test(QA(NEW_SRC)), true);
    ck('★ HELP_QA — 그림 글자 안 넣는다', /문자에는 그림 글자\(이모지\)를 넣지 않아요/.test(QA(NEW_SRC)), true);
    ck('  (대조) 옛 문답표에는 둘 다 없다',
      [/「▶ «알림장» 보기:」/, /그림 글자\(이모지\)를 넣지 않아요/].filter((r) => r.test(QA(OLD_SRC))).length, 0);
    const qaN = (s) => (QA(s).match(/\{role:'(admin|driver|all)'/g) || []).length;
    /* ★ v315(72-B): 이 수는 **그 회차 커밋에서** 잰다 — 작업트리로 재면
       뒷 회차가 문답을 하나 더할 때마다 거짓으로 깨진다(공용 `srcAt` 한 벌). */
    ck('  문답 항목 수는 그대로', qaN(srcAt(THIS_REF_311)), qaN(OLD_SRC));
    const CM = F('CLAUDE.md');
    ck('★ CLAUDE.md — 문자에는 그림 글자를 넣지 않는다',
      /문자\(SMS\/LMS\)에는 그림 글자를 넣지 않는다/.test(CM), true);
    ck('  EUC-KR 대조표가 적혀 있다', /EUC-KR\(KS X 1001\)로 실려 간다/.test(CM), true);
    ck('  출구가 둘이라는 것도', /출구는 \*\*둘뿐\*\*이다/.test(CM), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 실제 발송 0 — 가짜 fetch·가짜 window.open 이 「보내려 한 글」만 적었습니다');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
