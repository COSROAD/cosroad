/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드60-B4 보정1 — **같은 날 다시 눌러도 등원 알림은 한 번**(v298).
   사장님 결정(11-09): PIN 판·출석 기기는 **등원만** 받는다. 하원은 지금처럼 기사 「하차 완료」.
   보는 것: ① 재현 — 같은 PIN 을 두 번 누르면 알림톡·서버 쓰기·백업이 **두 번** 생기나
            ② 서버 `punchMember` 가 **그날 처음인지**(`first`)를 돌려주나 · 두 번째는 쓰기 0
            ③ **결석으로 둔 사람이 오면** 출석으로 바꾸는 쓰기는 하나(그래도 알림은 0)
            ④ 알림톡은 `first` 일 때만 — 출석 기기(서버)·관리자 판(앱) **같은 기준**
            ⑤ 화면 「✅ 이미 출석했어요 (처음 시각)」 — 기기·관리자 판 같은 문구
            ⑥ 둘러보기·오프라인도 같은 규칙 · **`first` 가 없는 옛 앱/옛 서버는 종전 그대로**
   가짜 firebase-admin · 가짜 fetch — **실제 알리고 호출 0건** · 실제 쓰기 0. */
const crypto = require('crypto');
const fs = require('fs');
const cp = require('child_process');
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;
const A = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 44)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const SECRET = 'SEKRIT-TEST';
const ORG = 'academy_owner1', OWNER = 'OWNER1', CODE = '123456', KCODE = '777777';
const DAY = 86400000, NOW = Date.UTC(2026, 9, 31, 11, 20, 0);   /* = KST 2026-10-31 20:20 */
const KDATE = '2026-10-31';
const hashOf = (v) => sha(v + '|' + ORG + '|' + SECRET);
const MEM = [{ id: 1, name: '가하은', phone: '010-1111-1111' },
             { id: 2, name: '나다움', phone: '010-2222-2222' }];

/* ── 서버 쪽 환경 ───────────────────────────────────────────────────────── */
function st(over) {
  over = over || {};
  const S = makeState({ now: NOW });
  S.docs['users/' + OWNER] = { orgId: ORG, approved: true, withdrawn: false,
    paidUntil: NOW + 30 * DAY, plan: 'paid' };
  S.docs['orgCodes/' + CODE] = { orgId: ORG, updatedAt: 1 };
  S.docs['kioskCodes/' + ORG] = { org: ORG, codeHash: hashOf(KCODE), updatedAt: 1 };
  S.docs['orgs/' + ORG + '/data/members'] = { value: JSON.stringify(MEM), updatedAt: 1 };
  S.docs['orgs/' + ORG + '/data/orgDriver'] = {
    value: JSON.stringify({ name: '가온학원', icon: '🚐', bizType: 'academy' }), updatedAt: 1 };
  S.docs['memberPins/' + ORG + '_1'] = { org: ORG, memberId: '1', pinHash: hashOf('1111'), updatedAt: 1 };
  if (over.att) S.docs['orgs/' + ORG + '/data/attendance'] = { value: JSON.stringify(over.att), updatedAt: 1 };
  if (over.attTime) S.docs['orgs/' + ORG + '/data/attendanceTime'] = { value: JSON.stringify(over.attTime), updatedAt: 1 };
  S.tokens = { ownerTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } },
               kioskTok: { uid: 'ksk_' + ORG, kiosk: true, org: ORG } };
  S.env = { FIREBASE_SERVICE_ACCOUNT: '{"project_id":"x"}', OTP_SECRET: SECRET,
            ALIGO_KEY: 'K', ALIGO_USER_ID: 'U', ALIGO_SENDER_KEY: 'SK', ALIGO_SENDER: '0212345678' };
  return S;
}
const kAtt = (S, pin) => call(SRC.drv, S, { action: 'kioskCheckin', pin: pin }, 'kioskTok', '1.2.3.4');
const padAtt = (S, pin) => call(SRC.drv, S, { action: 'pinCheckin', org: ORG, pin: pin, member: true },
  'ownerTok', '1.2.3.4');
const dayOf = (S, key) => {
  const d = S.docs['orgs/' + ORG + '/data/' + key];
  if (!d) return null;
  try { return JSON.parse(d.value)[KDATE] || null; } catch (e) { return null; }
};
/* 그 문서로 간 **쓰기**와 **백업**만 센다 */
const wrOf = (S, key) => S.calls.filter(c => /^(tx\.)?set$/.test(c[0])
  && c[1] === 'orgs/' + ORG + '/data/' + key).length;
const bkOf = (S) => S.calls.filter(c => /^(tx\.)?set$/.test(c[0])
  && c[1].indexOf('orgs/' + ORG + '/backups/') === 0).length;

/* ── 앱 쪽 환경 (출결 판 · 출석 기기 화면) ───────────────────────────────── */
const NEW_SRC = fs.readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const OLD_REF = process.env.COS_SRC_OLD_REF || 'd60f576';       /* v297 — 고치기 전 */
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const AMEM = [{ id: 1, name: '가하은', carId: 'car1', courseId: 'c1', days: D7, location: '1',
                lat: 37.41, lon: 126.68, phone: '010-1111-1111', pin: '1111' }];
const SUF = '__B';
const TODAY = (function () { const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); })();

function phone(opt) {
  opt = opt || {};
  const BOX = { 'data/members': AMEM };          /* 가짜 서버 문서 */
  const L = { api: [], alim: [], writes: [], res: [], pr: [] };
  const store = {};
  store['tkd_members' + SUF] = JSON.stringify(AMEM);
  store['tkd_cars' + SUF]    = JSON.stringify([{ id: 'car1', name: '1호차' }]);
  store['tkd_courses' + SUF] = JSON.stringify([{ id: 'c1', name: 'A반', depart: '15:00' }]);
  store['tkd_org' + SUF]     = JSON.stringify({ name: '가온학원', icon: '🚐', bizType: 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  const R = A.build({ src: opt.src || NEW_SRC, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-screen', 'admin-screen', 'fb-loading', 'member-screen',
   'member-list', 'main-header', 'today-date', 'org-name-display', 'org-icon', 'login-screen',
   'main-app', 'bottom-action', 'mode-badge', 'header-btns', 'filter-chips', 'search-input',
   'day-tabs', 'member-add-area', 'drive-tabs', 'pin-checkin-modal', 'pin-result', 'pin-display',
   'kiosk-screen']
   .forEach((id) => { const el = A.makeEl('div'); el.id = id; R.byId[id] = el; });
  /* ★ 판의 안내는 **쓰였다가 1.5~3초 뒤에 지워진다**(원래 그렇게 만들어졌다) —
     「지금 화면에 있나」로 재면 지워진 뒤를 보게 된다(pad293 에서 먼저 겪었다).
     그래서 **쓰기를 전부 적어 두고** 그 목록으로 본다. */
  {
    const _pr = R.byId['pin-result'];
    let _h = '';
    Object.defineProperty(_pr, 'innerHTML', {
      get() { return _h; },
      set(v) { _h = String(v); if (String(v).trim()) L.pr.push(String(v).replace(/<[^>]*>/g, ' ')); }
    });
  }
  R.sandbox._firestore = R.win._firestore = {
    doc: function () { return { path: [].slice.call(arguments).slice(1).join('/') }; },
    collection: function () { return { path: [].slice.call(arguments).slice(1).join('/') }; },
    getDoc: async (ref) => {
      const k = ref.path.replace(/^orgs\/B\//, '');
      const has = Object.prototype.hasOwnProperty.call(BOX, k);
      return { exists: () => has, data: () => ({ value: JSON.stringify(BOX[k]) }) };
    },
    getDocs: async () => ({ forEach: () => {} }),
    setDoc: async (ref, d) => { L.writes.push('set ' + ref.path);
      BOX[ref.path.replace(/^orgs\/B\//, '')] = (d && d.value !== undefined) ? JSON.parse(d.value) : d; },
    deleteDoc: async () => {},
    runTransaction: async (db, fn) => await fn({
      get: async (ref) => { const k = ref.path.replace(/^orgs\/B\//, '');
        const has = Object.prototype.hasOwnProperty.call(BOX, k);
        return { exists: () => has, data: () => ({ value: JSON.stringify(BOX[k]) }) }; },
      set: (ref, d) => { L.writes.push('tx ' + ref.path);
        BOX[ref.path.replace(/^orgs\/B\//, '')] = JSON.parse(d.value); }
    }),
    onSnapshot: () => () => {}
  };
  R.sandbox._db = R.win._db = {};
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userUid='uB';"
     + " window._userBizType='academy'; window._userPaidUntil=Date.now()+30*86400000;");
  R.ev('_firstSyncOk = true;');
  R.ev("window._auth={ currentUser:{ isAnonymous:false, getIdToken:function(){ return Promise.resolve('tok'); } } };");
  /* ── 가짜 서버 — **v298 서버와 같은 셈**(그날 처음인지로 `first`) ── */
  R.sandbox.fetch = R.win.fetch = async (url, init) => {
    const body = JSON.parse((init && init.body) || '{}');
    if (/send-alimtalk|send-sms/.test(String(url))) { L.alim.push(body); return { json: async () => ({ code: 0 }) }; }
    L.api.push(body);
    if (body.action === 'pinCheckin' || body.action === 'kioskCheckin') {
      const m = AMEM.find((x) => x.pin === String(body.pin));
      if (!m) return { json: async () => ({ ok: false, why: 'nomember', message: 'PIN 번호가 올바르지 않습니다.' }) };
      if (body.probe === true) return { json: async () => ({ ok: false, why: 'notdriver' }) };
      const att = BOX['data/attendance'] || {}; att[TODAY] = att[TODAY] || {};
      const atm = BOX['data/attendanceTime'] || {}; atm[TODAY] = atm[TODAY] || {};
      const first = !atm[TODAY][m.id];
      if (first) { atm[TODAY][m.id] = '09:05'; L.writes.push('tx(서버) data/attendanceTime'); }
      if (att[TODAY][m.id] !== 'present') { att[TODAY][m.id] = 'present'; L.writes.push('tx(서버) data/attendance'); }
      BOX['data/attendance'] = att; BOX['data/attendanceTime'] = atm;
      const res = { ok: true, name: m.name, photo: '', time: String(atm[TODAY][m.id]), date: TODAY };
      if (body.action === 'pinCheckin') res.kind = 'member';
      if (!opt.oldServer) res.first = first;         /* 옛 서버는 이 칸이 없다 */
      L.res.push(res);
      return { json: async () => res };
    }
    return { json: async () => ({ ok: false }) };
  };
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return { R, L, BOX };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const padPress = async (p, pin) => {
  await p.R.ev("(function(){ try{ openPinCheckin('member'); }catch(e){} pinPadKind='member'; pinInput='" + pin + "'; })()");
  await p.R.ev('checkPin()');
  await wait(900);                                  /* 알림톡은 500ms 뒤에 나간다 */
};
/* 마지막으로 **쓰인** 안내 글(지워진 뒤를 보지 않는다) */
const resultHtml = (p) => String(p.L.pr[p.L.pr.length - 1] || '');

(async () => {
  console.log('════ ① 재현 — 같은 PIN 을 **두 번** (출석 기기 · 서버)');
  {
    /* 옛 서버(v297)와 새 서버를 같은 장면으로 돌린다 — 옛 쪽은 `COS_API_NEW_REF` 로 고정해
       따로 돌린다(한 프로세스에서 두 판을 올릴 수 없다). 여기서는 **지금 판**을 잰다. */
    const S = st();
    await kAtt(S, '1111');
    const w1 = wrOf(S, 'attendance') + wrOf(S, 'attendanceTime'), b1 = bkOf(S), a1 = (S.sent || []).length;
    const r2 = await kAtt(S, '1111');
    const w2 = wrOf(S, 'attendance') + wrOf(S, 'attendanceTime'), b2 = bkOf(S), a2 = (S.sent || []).length;
    ck('첫 누름 — 쓰기 2(출석·시각)', w1, 2);
    ck('첫 누름 — 알림톡 1건', a1, 1);
    ck('★ 둘째 누름 — 쓰기 **0건 더**', w2 - w1, 0);
    ck('★ 둘째 누름 — 백업 **0건 더**', b2 - b1, 0);
    ck('★ 둘째 누름 — 알림톡 **0건 더**', a2 - a1, 0);
    ck('★ 둘째 응답에 `first:false`', String((r2.body || {}).first), 'false');
    ck('  시각은 **처음 시각**을 돌려준다', (r2.body || {}).time, '20:20');
    ck('  출석 칸은 그대로', JSON.stringify(dayOf(S, 'attendance')), '{"1":"present"}');
  }

  console.log('\n════ ② 관리자 출결 판(`pinCheckin` + member:true) — 같은 기준');
  {
    const S = st();
    const r1 = await padAtt(S, '1111');
    const w1 = wrOf(S, 'attendance') + wrOf(S, 'attendanceTime'), b1 = bkOf(S);
    const r2 = await padAtt(S, '1111');
    ck('첫 응답 `first:true`', String((r1.body || {}).first), 'true');
    ck('★ 둘째 응답 `first:false`', String((r2.body || {}).first), 'false');
    ck('★ 둘째 — 쓰기 0건 더', (wrOf(S, 'attendance') + wrOf(S, 'attendanceTime')) - w1, 0);
    ck('★ 둘째 — 백업 0건 더', bkOf(S) - b1, 0);
    ck('  서버는 관리자 판에 알림톡을 **안 보낸다**(앱이 보낸다)', (S.sent || []).length, 0);
    ck('  응답 칸', Object.keys(r2.body || {}).sort().join(','), 'date,first,kind,name,ok,photo,time');
  }

  console.log('\n════ ③ **결석으로 둔 사람이 오면** 출석으로 바꾼다(알림은 0)');
  {
    /* 관리자가 결석으로 바꿔 둔 뒤 그 «회원» 이 실제로 왔다 — 시각 칸은 이미 있다 */
    const S = st({ att: { [KDATE]: { 1: 'absent' } }, attTime: { [KDATE]: { 1: '08:10' } } });
    const r = await kAtt(S, '1111');
    ck('★ 출석으로 바뀐다', JSON.stringify(dayOf(S, 'attendance')), '{"1":"present"}');
    ck('  그 쓰기는 한다(출석 1건)', wrOf(S, 'attendance'), 1);
    ck('  시각은 **안 건드린다**', wrOf(S, 'attendanceTime'), 0);
    ck('★ 그래도 `first:false`', String((r.body || {}).first), 'false');
    ck('★ 알림톡 0건', (S.sent || []).length, 0);
    ck('  돌려주는 시각은 처음 시각', (r.body || {}).time, '08:10');
  }

  console.log('\n════ ④ 관리자가 **손으로 적은 시각**({t,by:admin})도 「처음」으로 본다');
  {
    const S = st({ attTime: { [KDATE]: { 1: { t: '08:00', by: 'admin' } } } });
    const r = await kAtt(S, '1111');
    ck('★ `first:false`', String((r.body || {}).first), 'false');
    ck('  시각은 그 값', (r.body || {}).time, '08:00');
    ck('  알림톡 0건', (S.sent || []).length, 0);
    ck('  시각 칸을 덮지 않는다',
      JSON.stringify(dayOf(S, 'attendanceTime')), '{"1":{"t":"08:00","by":"admin"}}');
  }

  console.log('\n════ ⑤ 다른 «회원» 은 **따로** 센다(한 사람의 둘째 누름만 막는다)');
  {
    const S = st();
    S.docs['memberPins/' + ORG + '_2'] = { org: ORG, memberId: '2', pinHash: hashOf('2222'), updatedAt: 1 };
    await kAtt(S, '1111');
    await kAtt(S, '1111');
    await kAtt(S, '2222');
    ck('두 사람 · 세 번 누름 → 알림톡 **2건**', (S.sent || []).length, 2);
    ck('  둘 다 찍혔다', JSON.stringify(dayOf(S, 'attendance')), '{"1":"present","2":"present"}');
  }

  console.log('\n════ ⑥ 앱 — 출결 판을 두 번 누르면 알림톡은 **한 번** · 둘째는 안내');
  {
    const p = phone({});
    await padPress(p, '1111');
    const a1 = p.L.alim.length, h1 = resultHtml(p);
    await padPress(p, '1111');
    ck('첫 누름 — 알림톡 1건', a1, 1);
    ck('  화면 「출석 완료!」', /출석 완료/.test(h1), true);
    ck('★ 둘째 누름 — 알림톡 **0건 더**', p.L.alim.length - a1, 0);
    ck('★ 둘째 화면 「이미 출석했어요」', /이미 출석했어요/.test(resultHtml(p)), true);
    ck('  처음 시각이 보인다', /09:05/.test(resultHtml(p)), true);
    ck('  폰에도 처음 시각이 남는다',
      p.R.ev("JSON.stringify(attTimeInfo(loadAttendanceTime(),'" + TODAY + "',1))"),
      '{"t":"09:05","by":"pin"}');
    ck('  출석은 그대로', p.R.ev("String((loadAttendance()['" + TODAY + "']||{})['1'])"), 'present');
  }

  console.log('\n════ ⑦ (대조) **옛 서버**(`first` 없음)면 종전 그대로 — 두 번 다 보낸다');
  {
    const p = phone({ oldServer: true });
    await padPress(p, '1111');
    await padPress(p, '1111');
    ck('★ 알림톡 2건(종전 동작)', p.L.alim.length, 2);
    ck('  화면도 종전대로 「출석 완료!」', /출석 완료/.test(resultHtml(p)), true);
  }

  console.log('\n════ ⑧ (대조) **옛 앱**(v297)은 새 서버로도 두 번 보낸다 — 고친 것이 앱이다');
  {
    const p = phone({ src: OLD_SRC });
    await padPress(p, '1111');
    await padPress(p, '1111');
    ck('★ 옛 앱 — 알림톡 2건', p.L.alim.length, 2);
  }

  console.log('\n════ ⑨ 둘러보기·오프라인(로컬 길)도 같은 규칙');
  {
    const p = phone({});
    p.R.ev('window._db=null;');                 /* 서버 창구를 안 부르는 길 */
    await padPress(p, '1111');
    const a1 = p.L.alim.length, t1 = p.R.ev("String((loadAttendanceTime()['" + TODAY + "']||{})['1'])");
    await padPress(p, '1111');
    ck('서버 창구를 안 불렀다', p.L.api.filter((x) => x.action === 'pinCheckin').length, 0);
    ck('첫 누름 — 알림톡 1건', a1, 1);
    ck('★ 둘째 누름 — 알림톡 0건 더', p.L.alim.length - a1, 0);
    ck('★ 둘째 화면 「이미 출석했어요」', /이미 출석했어요/.test(resultHtml(p)), true);
    ck('  처음 시각이 그대로', p.R.ev("String((loadAttendanceTime()['" + TODAY + "']||{})['1'])"), t1);
  }

  console.log('\n════ ⑩ 출석 전용 기기 화면도 **같은 문구**');
  {
    const p = phone({});
    p.R.ev("window._kioskOrg='B'; window._kioskMode=true;");
    const has = p.R.ev("typeof isKioskMode==='function' ? String(isKioskMode()) : 'nofn'");
    ck('출석 기기 모드로 들어갔다', has, 'true');
    await p.R.ev("pinInput='1111';"); await p.R.ev('checkPin()'); await wait(400);
    ck('첫 누름 — 「출석 완료!」', /출석 완료/.test(resultHtml(p)), true);
    await p.R.ev("pinInput='1111';"); await p.R.ev('checkPin()'); await wait(400);
    ck('★ 둘째 누름 — 「이미 출석했어요」', /이미 출석했어요/.test(resultHtml(p)), true);
    ck('  처음 시각이 보인다', /09:05/.test(resultHtml(p)), true);
    ck('★ 기기는 알림톡을 **앱에서 안 보낸다**(서버가 보낸다)', p.L.alim.length, 0);
  }

  console.log('\n════ ⑪ 소스 전수 — 한 자리에서 갈리나');
  {
    ck('★ 서버 `punchMember` 가 `first` 를 돌려준다',
      /first: *isFirst/.test(SRC.drv), true);
    ck('★ 알림톡 문지기는 `kioskNotify` **한 자리**',
      (SRC.drv.match(/if \(!mr\.first\) return 0;/g) || []).length, 1);
    ck('  (대조) 옛 판에는 그 줄이 없었다',
      /if \(!mr\.first\) return 0;/.test(cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF
        + ':api/driver-auth.js', { maxBuffer: 1 << 26 }).toString()), false);
    ck('★ 앱은 `first === false` 로만 가른다(옛 서버 보호)',
      (NEW_SRC.match(/\.first === false/g) || []).length >= 2, true);
    ck('  「이미 출석했어요」 글은 **두 자리**(판·기기)',
      (NEW_SRC.match(/\?'이미 출석했어요':'출석 완료!'/g) || []).length, 2);
    ck('  알림톡은 `_already` 가 아닐 때만 나간다',
      /if\(!_already\)\{[\s\S]{0,160}?sendKakaoAlimtalk\(member, timeStr\);/.test(NEW_SRC), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 firebase-admin · 가짜 fetch — **실제 알리고 호출 0건** · 실제 쓰기 0');
  process.exit(fail ? 1 : 0);
})();
