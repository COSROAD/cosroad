/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드73-B — **두 번째 누름 = 하원** · 하원(귀가) 알림은 **서버가 문자로** · 기사 하차와 하루 한 번 (v319)
   보는 것
     ① 서버 갈래 **전수** — 첫(등원) / 간격 안 / 하원 / 이미 하원 · 쓰기·백업 수까지
     ② 업체가 **안 켰으면 기록만** (문자 0) · 켜면 문자 1 (받는 번호는 **명부 번호만**)
     ③ **기사 하차가 먼저**면 하원 문자 0 (하루 한 사람 한 번)
     ④ **하원이 먼저**면 기사 하차 알림톡이 안 나간다(`api/send-alimtalk.js` → `skipped:'left'`)
        · 남의 «회원» id 를 적어 보내면 그 길로 안 간다(`memberOwnsRcv`)
     ⑤ 물류·택배는 **영향 0**(하원 갈래도 문자도 없다) · 기간 끝난 업체는 403
     ⑥ `smsSafe` **두 표가 같다**(앱 `index.html` ↔ `lib/sms-core.js`) · 같은 글을 넣으면 같은 답
     ⑦ **옛 앱 호환** — `time`·`first` 뜻이 안 바뀌었다 · 저장 칸 꼴도 안 바뀌었다
     ⑧ import·노출 줄 — `api/send-sms.js` 가 **한 벌**(`lib/sms-core.js`)을 쓴다
   ★ 가짜 firebase-admin · 가짜 fetch — **실제 알리고 호출 0건**(문자·알림톡 모두) · 실제 쓰기 0 */
const crypto = require('crypto');
const fs = require('fs');
const cp = require('child_process');
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;
const SE = require('./sendenv.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 44)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const SECRET = 'SEKRIT-TEST';
const ORG = 'academy_owner1', OWNER = 'OWNER1', KCODE = '777777';
const DAY = 86400000;
/* 가짜 「지금」 = KST 2026-10-31 20:20 — 하루 한 번·간격 셈이 이 시각을 기준으로 돈다 */
const NOW = Date.UTC(2026, 9, 31, 11, 20, 0);
const KDATE = '2026-10-31';
const hashOf = (v) => sha(v + '|' + ORG + '|' + SECRET);
const MEM = [{ id: 1, name: '가하은', carId: 'car1', phone: '010-1111-1111' },
             { id: 2, name: '나다움', carId: 'car2', phone: '010-2222-2222' }];

/* ── 서버 쪽 환경 ───────────────────────────────────────────────────────── */
function st(over) {
  over = over || {};
  const S = makeState({ now: NOW });
  S.docs['users/' + OWNER] = { orgId: ORG, approved: true, withdrawn: false,
    paidUntil: over.expired ? NOW - DAY : NOW + 30 * DAY, plan: 'paid' };
  S.docs['kioskCodes/' + ORG] = { org: ORG, codeHash: hashOf(KCODE), updatedAt: 1 };
  S.docs['orgs/' + ORG + '/data/members'] = { value: JSON.stringify(MEM), updatedAt: 1 };
  S.docs['orgs/' + ORG + '/data/orgDriver'] = { value: JSON.stringify({
    name: '가온학원', icon: '🚐', bizType: over.biz || 'academy' }), updatedAt: 1 };
  S.docs['memberPins/' + ORG + '_1'] = { org: ORG, memberId: '1', pinHash: hashOf('1111'), updatedAt: 1 };
  /* 업체 설정 — 「하원 알림 보내기」는 **기본 꺼짐**이다(칸이 없으면 꺼진 것) */
  const org = { name: '가온학원' };
  if (over.leaveOn) org.leaveNotify = true;
  S.docs['orgs/' + ORG + '/data/org'] = { value: JSON.stringify(org), updatedAt: 1 };
  if (over.attTime) {
    S.docs['orgs/' + ORG + '/data/attendanceTime'] = { value: JSON.stringify(over.attTime), updatedAt: 1 };
  }
  if (over.dropDone) {
    S.docs['orgs/' + ORG + '/carState/car1'] = {
      value: JSON.stringify({ dropDone: over.dropDone }), updatedAt: 1 };
  }
  S.tokens = { ownerTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } },
               kioskTok: { uid: 'ksk_' + ORG, kiosk: true, org: ORG } };
  S.env = { FIREBASE_SERVICE_ACCOUNT: '{"project_id":"x"}', OTP_SECRET: SECRET,
            ALIGO_KEY: 'K', ALIGO_USER_ID: 'U', ALIGO_SENDER_KEY: 'SK', ALIGO_SENDER: '0212345678' };
  return S;
}
const kAtt = (S, pin) => call(SRC.drv, S, { action: 'kioskCheckin', pin: pin || '1111' }, 'kioskTok', '1.2.3.4');
const padAtt = (S, pin) => call(SRC.drv, S, { action: 'pinCheckin', org: ORG, pin: pin || '1111', member: true },
  'ownerTok', '1.2.3.4');
const dayOf = (S, key) => {
  const d = S.docs['orgs/' + ORG + '/data/' + key];
  if (!d) return null;
  try { return JSON.parse(d.value)[KDATE] || null; } catch (e) { return null; }
};
const wrOf = (S, key) => S.calls.filter(c => /^(tx\.)?set$/.test(c[0])
  && c[1] === 'orgs/' + ORG + '/data/' + key).length;
const bkOf = (S) => S.calls.filter(c => /^(tx\.)?set$/.test(c[0])
  && c[1].indexOf('orgs/' + ORG + '/backups/') === 0).length;
/* 알리고 창구가 **둘**이다 — 주소로 갈라 센다(가짜 fetch 는 한 자리에 쌓는다) */
const smsOf = (S) => (S.sent || []).filter((x) => /apis\.aligo\.in\/send/.test(x.url)).length;
const alimOf = (S) => (S.sent || []).filter((x) => /kakaoapi\.aligo\.in/.test(x.url)).length;

/* ── 소스 ───────────────────────────────────────────────────────────────── */
const LF = (x) => x.replace(/\r\n/g, '\n');
const APP = LF(fs.readFileSync(COS_ROOT + '/index.html', 'utf8'));
const CORE = LF(fs.readFileSync(COS_ROOT + '/lib/sms-core.js', 'utf8'));
const SMSAPI = LF(fs.readFileSync(COS_ROOT + '/api/send-sms.js', 'utf8'));
const DRV = LF(fs.readFileSync(COS_ROOT + '/api/driver-auth.js', 'utf8'));

(async () => {

console.log('════ ⓞ 재현 — **고치기 전**(v318)에는 두 번째 누름이 하원이 아니었다');
{
  /* 바로 앞 회차 커밋의 `api/driver-auth.js` 를 그대로 올려 **같은 장면**을 돌린다.
     ★ 이것이 「대조 시험」이다 — 아래 ①~⑧ 의 「0건·하원」이 **고친 덕**임을 먼저 보인다. */
  const PREV_REF = process.env.COS_SRC_PREV_REF || require('./thisref.js').thisRef(318);
  const OLDDRV = cp.execSync('git -C ' + COS_ROOT + ' show ' + PREV_REF + ':api/driver-auth.js',
    { maxBuffer: 1 << 26 }).toString().replace(/\r\n/g, '\n');
  const S = st({ attTime: { [KDATE]: { 1: '08:10' } }, leaveOn: true });
  const r = await call(OLDDRV, S, { action: 'kioskCheckin', pin: '1111' }, 'kioskTok', '1.2.3.4');
  ck('★ 옛 판 — `leg` 칸이 **아예 없다**', String(r.body.leg), 'undefined');
  ck('  하원 시각도 안 남는다', JSON.stringify(dayOf(S, 'attendanceTime')), '{"1":"08:10"}');
  ck('  하원 문자도 없다(그 길이 없었다)', smsOf(S), 0);
  ck('  옛 판에는 `leaveNotify` 가 없다', /async function leaveNotify\(/.test(OLDDRV), false);
  ck('  옛 판은 `lib/sms-core.js` 를 모른다', /sms-core\.js/.test(OLDDRV), false);
}

console.log('\n════ ① 서버 갈래 **전수** — 첫(등원) / 간격 안 / 하원 / 이미 하원');
{
  /* ㉠ 첫 누름 = 등원 — 칸 꼴은 **문자열 그대로**(옛 앱 호환) */
  const S = st();
  const r1 = await kAtt(S);
  ck('㉠ 첫 누름 `leg:in` · `first:true`', r1.body.leg + '/' + r1.body.first, 'in/true');
  ck('   저장 칸은 **문자열**(꼴 안 바뀜)', JSON.stringify(dayOf(S, 'attendanceTime')), '{"1":"20:20"}');
  ck('   `outTime` 은 빈 값', JSON.stringify(r1.body.outTime), '""');

  /* ㉡ 간격 안(30분 전) — 쓰기 0 · 백업 0 */
  const S2 = st({ attTime: { [KDATE]: { 1: '20:10' } } });
  const r2 = await kAtt(S2);
  ck('㉡ 10분 뒤 누름 `leg:already-in`', r2.body.leg, 'already-in');
  ck('   남은 분(30-10)', r2.body.gapLeft, 20);
  ck('   서버가 정한 간격을 알려 준다', r2.body.gapNeed, 30);
  ck('   시각 쓰기 0 · 백업 0', wrOf(S2, 'attendanceTime') + '/' + bkOf(S2), '0/0');

  /* ㉢ 하원 — 30분을 넘겼다 */
  const S3 = st({ attTime: { [KDATE]: { 1: '08:10' } } });
  const r3 = await kAtt(S3);
  ck('㉢ 12시간 뒤 누름 `leg:out`', r3.body.leg, 'out');
  ck('   `outTime` 은 그 시각', r3.body.outTime, '20:20');
  ck('   `time` 은 **등원 시각**(뜻 안 바뀜)', r3.body.time, '08:10');
  ck('   등원 칸(`t`)은 그대로 · `out` 만 더한다',
    JSON.stringify(dayOf(S3, 'attendanceTime')), '{"1":{"t":"08:10","by":"pin","out":"20:20"}}');
  ck('   백업 1건(덮어쓰기 전 자료)', bkOf(S3), 1);

  /* ㉣ 이미 하원 — 쓰기 0 · 백업 0 */
  const S4 = st({ attTime: { [KDATE]: { 1: { t: '08:10', by: 'pin', out: '17:05' } } } });
  const r4 = await kAtt(S4);
  ck('㉣ 세 번째 누름 `leg:already-out`', r4.body.leg, 'already-out');
  ck('   처음 하원 시각을 돌려준다', r4.body.outTime, '17:05');
  ck('   쓰기 0 · 백업 0', wrOf(S4, 'attendanceTime') + '/' + bkOf(S4), '0/0');

  /* ㉤ 간격 셈이 자정을 넘으면 「지났다」로 본다(음수 방지) */
  const S5 = st({ attTime: { [KDATE]: { 1: '23:50' } } });
  const r5 = await kAtt(S5);
  ck('㉤ 등원이 23:50(자정 넘김)이면 하원으로 본다', r5.body.leg, 'out');

  /* ㉥ 관리자 판(`pinCheckin`)도 **같은 한 자리**를 지난다 */
  const S6 = st({ attTime: { [KDATE]: { 1: '08:10' } } });
  const r6 = await padAtt(S6);
  ck('㉥ 관리자 판도 `leg:out`', r6.body.leg + '/' + r6.body.outTime, 'out/20:20');
}

console.log('\n════ ② 「하원 알림 보내기」 — **기본 꺼짐** · 켜면 문자 · 번호는 명부 것만');
{
  /* ㉠ 꺼짐(칸 없음) — 기록은 되고 문자는 0 */
  const S = st({ attTime: { [KDATE]: { 1: '08:10' } } });
  const r = await kAtt(S);
  ck('㉠ 꺼져 있으면 **기록만**(문자 0)', smsOf(S), 0);
  ck('   그래도 하원은 찍혔다', JSON.stringify((dayOf(S, 'attendanceTime') || {})['1'] || {}).indexOf('"out":"20:20"') > 0, true);
  ck('   응답 `leaveSent:0`', r.body.leaveSent, 0);

  /* ㉡ 켜짐 — 문자 1건 · 알림톡은 **승인 코드가 없어** 0 */
  const S2 = st({ attTime: { [KDATE]: { 1: '08:10' } }, leaveOn: true });
  const r2 = await kAtt(S2);
  ck('㉡ 켜면 문자 **1건**', smsOf(S2), 1);
  ck('   응답 `leaveSent:1`', r2.body.leaveSent, 1);
  ck('   알림톡은 0건(승인 코드가 아직 없다 — 자리만 두었다)', alimOf(S2), 0);
  ck('   등원 알림톡도 0건(하원 누름이라 안 보낸다)', alimOf(S2), 0);

  /* ㉢ 번호가 **번호 꼴이 아니면** 안 보낸다(적다가 지운 칸·내부 메모가 들어간 경우) */
  const S3 = st({ attTime: { [KDATE]: { 1: '08:10' } }, leaveOn: true });
  S3.docs['orgs/' + ORG + '/data/members'] = { value: JSON.stringify(
    [{ id: 1, name: '가하은', carId: 'car1', phone: '번호없음' }]), updatedAt: 1 };
  const r3 = await kAtt(S3);
  ck('㉢ 번호 꼴이 아니면 0건', smsOf(S3) + '/' + r3.body.leaveSent, '0/0');
  ck('   그래도 하원은 찍힌다', r3.body.leg, 'out');
  /* ㉢-2 번호 칸이 **비어 있으면** 그냥 안 보낸다 */
  const S3b = st({ attTime: { [KDATE]: { 1: '08:10' } }, leaveOn: true });
  S3b.docs['orgs/' + ORG + '/data/members'] = { value: JSON.stringify(
    [{ id: 1, name: '가하은', carId: 'car1' }]), updatedAt: 1 };
  await kAtt(S3b);
  ck('㉢-2 번호 칸이 비면 0건', smsOf(S3b), 0);

  /* ㉣ 하원이 아닌 누름에는 하원 문자가 없다(첫 누름·간격 안·이미 하원) */
  const S4 = st({ leaveOn: true });
  await kAtt(S4);
  ck('㉣ 첫 누름에는 하원 문자 0', smsOf(S4), 0);
  const S5 = st({ attTime: { [KDATE]: { 1: '20:10' } }, leaveOn: true });
  await kAtt(S5);
  ck('   간격 안에도 0', smsOf(S5), 0);
  const S6 = st({ attTime: { [KDATE]: { 1: { t: '08:10', out: '17:05' } } }, leaveOn: true });
  await kAtt(S6);
  ck('   이미 하원이면 0(하루 한 번)', smsOf(S6), 0);

  /* ㉤ 같은 사람을 두 번 눌러도 문자는 한 번 — `out` 칸이 지킨다 */
  const S7 = st({ attTime: { [KDATE]: { 1: '08:10' } }, leaveOn: true });
  await kAtt(S7);
  await kAtt(S7);
  ck('㉤ 하원을 두 번 눌러도 문자 **1건**', smsOf(S7), 1);
}

console.log('\n════ ③ 기사 「하차 완료」가 **먼저**면 하원 문자 0 (하루 한 사람 한 번)');
{
  const S = st({ attTime: { [KDATE]: { 1: '08:10' } }, leaveOn: true,
                 dropDone: { 1: KDATE } });
  const r = await kAtt(S);
  ck('★ 하차가 먼저면 문자 0', smsOf(S) + '/' + r.body.leaveSent, '0/0');
  ck('  그래도 **하원은 찍힌다**(기록은 기록이다)', r.body.leg, 'out');
  /* (대조) 어제 하차면 오늘 것이 아니다 → 보낸다 */
  const S2 = st({ attTime: { [KDATE]: { 1: '08:10' } }, leaveOn: true,
                  dropDone: { 1: '2026-10-30' } });
  await kAtt(S2);
  ck('  (대조) **어제** 하차면 오늘 문자는 간다', smsOf(S2), 1);
  /* (대조) 다른 «회원» 의 하차는 상관없다 */
  const S3 = st({ attTime: { [KDATE]: { 1: '08:10' } }, leaveOn: true,
                  dropDone: { 2: KDATE } });
  await kAtt(S3);
  ck('  (대조) **다른 «회원»** 하차는 상관없다', smsOf(S3), 1);
}

console.log('\n════ ④ 하원이 **먼저**면 기사 하차 알림톡이 안 나간다 (`skipped:left`)');
{
  const SORG = 'academy_OWNER1';
  const base = (attTime) => {
    const S = SE.makeState({ now: NOW });
    S.tokens = { drvTok: { uid: 'drv_' + SORG + '_car1', driver: true, org: SORG, carId: 'car1' },
                 ownerTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } } };
    S.docs['users/' + OWNER] = { orgId: SORG, approved: true, withdrawn: false,
      paidUntil: NOW + 30 * DAY };
    S.docs['users/drv_' + SORG + '_car1'] = { role: 'driver', driverOrg: SORG,
      carId: 'car1', ownerUid: OWNER };
    S.docs['orgs/' + SORG + '/drivers/drv_' + SORG + '_car1'] = { carId: 'car1', ownerUid: OWNER };
    S.docs['orgs/' + SORG + '/data/members'] = { value: JSON.stringify(MEM) };
    if (attTime) S.docs['orgs/' + SORG + '/data/attendanceTime'] = { value: JSON.stringify(attTime) };
    return S;
  };
  const body = (over) => Object.assign({ org: SORG, receiver: '010-1111-1111',
    tpl_code: 'UJ_4933', name: '가하은', message: '하차했습니다', biz: 'academy' }, over || {});

  /* ㉠ 하원이 이미 찍혔으면 — 보내지 않고 `skipped:'left'` */
  const S = base({ [KDATE]: { 1: { t: '08:10', out: '17:05' } } });
  const r = await SE.call(SE.SRC.alim, S, body({ memberId: '1' }), 'drvTok');
  ck('㉠ 200 `skipped:left`', r.code + '/' + (r.body || {}).skipped, '200/left');
  ck('   알리고로 나간 것 **0건**', (S.aligo || []).length, 0);

  /* ㉡ 하원이 아직이면 — 종전 그대로 나간다(대조) */
  const S2 = base({ [KDATE]: { 1: '08:10' } });
  const r2 = await SE.call(SE.SRC.alim, S2, body({ memberId: '1' }), 'drvTok');
  ck('㉡ (대조) 등원만이면 나간다', r2.code + '/' + String((r2.body || {}).skipped), '200/undefined');
  ck('   알리고 1건', (S2.aligo || []).length, 1);

  /* ㉢ `memberId` 가 **없는 옛 앱**은 종전 그대로 나간다(배포 틈) */
  const S3 = base({ [KDATE]: { 1: { t: '08:10', out: '17:05' } } });
  const r3 = await SE.call(SE.SRC.alim, S3, body({}), 'drvTok');
  ck('㉢ 옛 앱(`memberId` 없음)은 종전 그대로', r3.code + '/' + (S3.aligo || []).length, '200/1');

  /* ㉣ **남의 «회원» id** 를 적어 보내면 그 길로 안 간다(`memberOwnsRcv`) —
     2번 «회원» 이 하원했어도 1번 번호로 보내는 요청은 막히지 않는다(남의 기록을 못 쓴다) */
  const S4 = base({ [KDATE]: { 2: { t: '08:10', out: '17:05' } } });
  const r4 = await SE.call(SE.SRC.alim, S4, body({ memberId: '2' }), 'drvTok');
  ck('㉣ 번호 주인이 아닌 id 는 안 통한다', r4.code + '/' + (S4.aligo || []).length, '200/1');

  /* ㉤ 하차 템플릿이 아니면 이 가드를 안 지난다(등원 알림톡은 그대로) */
  const S5 = base({ [KDATE]: { 1: { t: '08:10', out: '17:05' } } });
  const r5 = await SE.call(SE.SRC.alim, S5, body({ memberId: '1', tpl_code: 'UI_7310' }), 'drvTok');
  ck('㉤ 하차 템플릿이 아니면 그대로 나간다', r5.code + '/' + (S5.aligo || []).length, '200/1');

  ck('★ 하차 템플릿은 **둘**(학원 UJ_4933 · 공공 UJ_4932)',
    /DROPOFF_TPLS = \['UJ_4933', 'UJ_4932'\]/.test(LF(fs.readFileSync(COS_ROOT + '/api/send-alimtalk.js', 'utf8'))), true);
}

console.log('\n════ ⑤ 물류·택배는 **영향 0** · 기간 끝난 업체는 403');
{
  /* 물류 업체는 «회원» PIN 판 자체가 출퇴근 전용이라 출석 기기로는 안 들어온다(v314) —
     그래도 **관리자 판**(pinCheckin + member:true)은 «회원» 출석을 받는다. 거기서도 문자 0 이어야 한다. */
  const S = st({ biz: 'logistics', attTime: { [KDATE]: { 1: '08:10' } }, leaveOn: true });
  const r = await padAtt(S);
  ck('★ 물류 — 하원 기록은 되지만 **문자 0**', smsOf(S) + '/' + r.body.leaveSent, '0/0');
  ck('  (대조) 같은 장면에서 학원이면 1건', await (async () => {
    const S2 = st({ attTime: { [KDATE]: { 1: '08:10' } }, leaveOn: true });
    await padAtt(S2);
    return smsOf(S2);
  })(), 1);
  const S3 = st({ biz: 'delivery', attTime: { [KDATE]: { 1: '08:10' } }, leaveOn: true });
  await padAtt(S3);
  ck('★ 택배도 문자 0', smsOf(S3), 0);

  /* 기간 끝난 업체 — 403 · 기록도 문자도 0 */
  const S4 = st({ expired: true, attTime: { [KDATE]: { 1: '08:10' } }, leaveOn: true });
  const r4 = await kAtt(S4);
  ck('★ 기간 끝 → 403 expired', r4.code + '/' + ((r4.body || {}).why || ''), '403/expired');
  ck('  그때는 기록 0 · 문자 0', wrOf(S4, 'attendanceTime') + '/' + smsOf(S4), '0/0');
  const S5 = st({ expired: true, attTime: { [KDATE]: { 1: '08:10' } }, leaveOn: true });
  const r5 = await padAtt(S5);
  ck('★ 관리자 판도 같다(403)', r5.code + '/' + ((r5.body || {}).why || ''), '403/expired');
  ck('  그때도 문자 0', smsOf(S5), 0);

  /* 남의 업체 — 기기 토큰의 org 로만 찍는다(본문 값 불신) */
  const S6 = st({ attTime: { [KDATE]: { 1: '08:10' } }, leaveOn: true });
  const r6 = await call(SRC.drv, S6, { action: 'kioskCheckin', pin: '1111', org: 'academy_other' },
    'kioskTok', '1.2.3.4');
  ck('★ 본문에 남의 업체를 적어도 **내 업체**로 찍는다', r6.body.leg + '/' + smsOf(S6), 'out/1');
  ck('  남의 업체 문서는 안 건드렸다',
    Object.keys(S6.docs).filter((k) => k.indexOf('orgs/academy_other/') === 0).length, 0);
}

console.log('\n════ ⑥ `smsSafe` — 앱과 `lib/sms-core.js` **두 표가 같다**');
{
  /* 표는 소스에서 **글자 그대로** 떠 와서 맞댄다(한쪽만 고치면 어긋난다 — otp-core 교훈) */
  const pick = (src, head) => {
    const i = src.indexOf(head);
    if (i < 0) return '';
    const j = src.indexOf('};', i);
    return src.slice(i, j)
      .replace(/\/\*[\s\S]*?\*\//g, '')            /* 쪽지는 지운다 */
      .replace(/\s+/g, '')
      .replace(/^[^{]*\{/, '');
  };
  const tApp = pick(APP, 'var SMS_SAFE_MAP = {');
  const tCore = pick(CORE, 'export const SMS_SAFE_MAP = {');
  ck('★ 두 표의 글자가 같다', tApp === tCore && tApp.length > 100, true);
  ck('  (대조) 한 글자만 바꾸면 달라진다', tApp === tCore.replace('▶', '★'), false);

  /* 같은 글을 넣으면 **같은 답**이 나온다 — 두 함수를 꺼내 나란히 돌린다 */
  /* 앱 쪽은 **표 시작 ~ `smsSafe` 끝**까지 글자로 떠 온다(가짜 DOM 이 필요 없는 순수 함수다).
     ★ 끝을 「`return s;` 다음 줄의 `}`」로 찾는다 — 괄호 수를 세는 코드를 적지 않는다. */
  const a0 = APP.indexOf('var SMS_SAFE_MAP = {');
  const a1 = APP.indexOf('\n}', APP.indexOf('return s;', APP.indexOf('function smsSafe(text){')));
  const runApp = new Function(APP.slice(a0, a1 + 2) + '\nreturn smsSafe;')();
  const runCore = new Function(CORE.replace(/^export /gm, '') + '\nreturn smsSafe;')();
  const SAMPLES = [
    '[가온학원] 귀가 알림\n━━━━━━━━━\n👤 이름: 가하은\n⏰ 귀가: 17:05\n✅ 오늘 수업을 마치고\n      학원을 나섰습니다.',
    '[가온학원] 🚐 1호차 운행 안내\n👉 사진 보기: https://x.y/z',
    '- 이름: 나다움\n♥ 안전한 귀가까지 함께하겠습니다. ♥'
  ];
  let same = 0;
  SAMPLES.forEach((s) => { if (runApp(s) === runCore(s)) same++; });
  ck('★ 같은 글 세 개 모두 같은 답', same, 3);
  ck('  그림 글자가 남지 않는다', /[\uD800-\uDBFF][\uDC00-\uDFFF]|[⌀-⏿✀-➿]/.test(runCore(SAMPLES[0])), false);
  ck('  문자에 실리는 기호(━ ♥ ▶)는 지킨다',
    /━/.test(runCore(SAMPLES[0])) && /♥/.test(runCore(SAMPLES[2])) && /▶/.test(runCore(SAMPLES[1])), true);
  ck('  줄 머리 「👤」→「-」', /^- 이름: 가하은$/m.test(runCore(SAMPLES[0])), true);
  ck('  글 가운데 「🚐」는 빼고 겹친 공백도 줄인다',
    /^\[가온학원\] 1호차 운행 안내$/m.test(runCore(SAMPLES[1])), true);
  ck('  줄 머리 들여쓰기는 지킨다', /\n {6}학원을 나섰습니다\./.test(runCore(SAMPLES[0])), true);

  /* 서버가 보내는 하원 문자 본문에는 **처음부터** 그림 글자를 넣지 않는다 */
  const core = new Function(LF(fs.readFileSync(COS_ROOT + '/lib/alimtalk-core.js', 'utf8'))
    .replace(/^export /gm, '') + '\nreturn { buildLeaveSmsText: buildLeaveSmsText, buildLeaveMessage: buildLeaveMessage };')();
  const smsBody = core.buildLeaveSmsText('academy', '가온학원', '가하은', '17:05');
  ck('★ 하원 **문자 본문**에 그림 글자 0',
    /[\uD800-\uDBFF][\uDC00-\uDFFF]|[⌀-⏿✀-➿]/.test(smsBody), false);
  ck('  (대조) 하원 **알림톡 본문**에는 있다(승인 글이라 그대로 둔다)',
    /[\uD800-\uDBFF][\uDC00-\uDFFF]|[⌀-⏿✀-➿]/.test(core.buildLeaveMessage('academy', '가온학원', '가하은', '17:05')), true);
  ck('  문자 본문이 `smsSafe` 를 지나도 안 바뀐다(이미 깨끗하다)', runCore(smsBody) === smsBody, true);
}

console.log('\n════ ⑦ 옛 앱·옛 자료 호환 — 뜻이 안 바뀌었다');
{
  /* 세 꼴을 다 읽는다: 'HH:MM'(v243) · {t,by}(v244) · {t,by,out}(v319) */
  const forms = [['HH:MM', '08:10'], ['{t,by}', { t: '08:10', by: 'admin' }],
                 ['{t,by,out}', { t: '08:10', by: 'pin', out: '17:05' }]];
  for (const [nm, v] of forms) {
    const S = st({ attTime: { [KDATE]: { 1: v } } });
    const r = await kAtt(S);
    ck('★ ' + nm + ' 꼴을 읽는다 · `time` 은 등원 시각', r.body.time, '08:10');
    ck('  `first` 는 거짓(그날 처음이 아니다)', String(r.body.first), 'false');
  }
  /* 관리자가 손으로 적은 `by:'admin'` 은 하원 때도 **그대로 남는다** */
  const S2 = st({ attTime: { [KDATE]: { 1: { t: '08:00', by: 'admin' } } } });
  await kAtt(S2);
  ck('★ `by:admin` 은 지킨다',
    JSON.stringify(dayOf(S2, 'attendanceTime')), '{"1":{"t":"08:00","by":"admin","out":"20:20"}}');
  /* 응답은 **더하기만** 했다 — 옛 칸 이름이 하나도 없어지지 않았다 */
  const S3 = st();
  const r3 = await kAtt(S3);
  const OLDKEYS = ['ok', 'name', 'photo', 'time', 'date', 'first', 'sent'];
  ck('★ 옛 응답 칸 일곱이 그대로 있다',
    OLDKEYS.filter((k) => Object.prototype.hasOwnProperty.call(r3.body, k)).length, 7);
  ck('  속에서만 쓰는 칸은 응답에 없다',
    ['_id', '_dropCar', '_phones', '_invoice', '_courier']
      .filter((k) => Object.prototype.hasOwnProperty.call(r3.body, k)).length, 0);
  /* 앱 글 한 벌(`_padView`)을 **돌려서** 본다 — 글자로 찾지 않는다(고치면 거짓이 된다).
     `fmtNum`·`LEAVE_GAP_MIN` 만 끼워 넣고 그 함수만 꺼낸다. */
  const pv0 = APP.indexOf('function _padView(');
  const pv1 = APP.indexOf('\n}', APP.indexOf("sub:(inTime||'')+' 도착' };", pv0));
  const padView = new Function('var LEAVE_GAP_MIN = 30; var fmtNum = function(n){ return String(n); };\n'
    + APP.slice(pv0, pv1 + 2) + '\nreturn _padView;')();
  /* ★★ 연관 고침(v319) — `memberId` 는 **관리자 판에만** 준다 */
  const S4 = st();
  const r4 = await padAtt(S4);
  ck('★ 관리자 판 응답에 `memberId` 가 있다', r4.body.memberId, '1');
  const S5 = st();
  const r5 = await kAtt(S5);
  ck('★ **출석 기기** 응답에는 없다(명단이 없고 쓸 데도 없다)',
    Object.prototype.hasOwnProperty.call(r5.body, 'memberId'), false);
  ck('  (대조) 바로 앞 회차(v318)에는 관리자 판에도 없었다',
    /memberId: mr\._id/.test(cp.execSync('git -C ' + COS_ROOT + ' show '
      + (process.env.COS_SRC_PREV_REF || require('./thisref.js').thisRef(318)) + ':api/driver-auth.js',
      { maxBuffer: 1 << 26 }).toString()), false);
  ck('★ 앱은 `memberId` 로 **먼저** 찾고, 없으면 평문으로 떨어진다',
    /_mr\.memberId[\s\S]{0,200}String\(m\.pin\|\|''\)===pv/.test(APP), true);
  ck('  id 를 모르면 **폰에 적지 않는다**(`""` 가짜 칸 금지)',
    /var _mid = String\(member\.id == null \? '' : member\.id\);\s*\n\s*if\(_mid\)\{/.test(APP), true);
  ck('★ 앱은 `leg` 가 **없는 옛 서버**면 종전 두 갈래로 돌아간다',
    padView('', false, '가하은', '09:05', '', 0, null).head + '/'
      + padView('', true, '가하은', '09:05', '', 0, null).head, '출석 완료!/이미 출석했어요');
  ck('  네 갈래 글 (등원 / 하원 / 간격 안 / 이미 하원)',
    ['in', 'out', 'already-in', 'already-out']
      .map((g) => padView(g, false, '가하은', '08:10', '17:05', 12, { gapNeed: 30 }).head).join(' · '),
    '출석 완료! · 하원 처리됐어요 · 이미 출석했어요 · 이미 하원했어요');
  ck('  간격 안에는 **남은 분**을 글에 넣는다',
    padView('already-in', false, '가하은', '08:10', '', 12, { gapNeed: 30 }).sub,
    '08:10 도착 · 하원은 12분 뒤부터');
  ck('  서버가 `gapNeed` 를 주면 **그 값**을 쓴다(없으면 앱 값 30)',
    padView('already-in', false, '가하은', '08:10', '', 0, { gapNeed: 45 }).sub.indexOf('45분') > 0, true);
}

console.log('\n════ ⑧ 한 벌·노출 줄 — 문자는 `lib/sms-core.js` 하나로');
{
  ck('★ `api/send-sms.js` 가 한 벌을 쓴다',
    /^import \{ postSms \} from '\.\.\/lib\/sms-core\.js';$/m.test(SMSAPI), true);
  ck('  그 파일에 알리고 주소가 **직접** 적혀 있지 않다',
    /apis\.aligo\.in/.test(SMSAPI), false);
  ck('★ `api/driver-auth.js` 가 한 벌을 쓴다',
    /^import \* as SMS from '\.\.\/lib\/sms-core\.js';$/m.test(DRV), true);
  ck('  알리고 문자 주소는 **한 자리**에만 있다',
    (CORE.match(/apis\.aligo\.in\/send/g) || []).length, 1);
  ck('★ 하원 문지기는 `leaveNotify` **한 자리**',
    (DRV.match(/if \(!mr \|\| mr\.leg !== 'out'\) return 0;/g) || []).length, 1);
  ck('  부르는 곳은 **둘**(출석 기기 · 관리자 판)',
    (DRV.match(/await leaveNotify\(org, mr\)/g) || []).length, 2);
  ck('★ 간격 상수는 서버 **한 곳**',
    (DRV.match(/const LEAVE_MIN_GAP_MIN = 30;/g) || []).length, 1);
  ck('  앱은 서버가 준 `gapNeed` 를 쓰고, 없을 때만 자기 값',
    /_gapNeed|gapNeed/.test(APP), true);
  /* 알림톡 자리는 **비워 두었다** — 승인 코드가 오면 여기만 채운다 */
  const AT = LF(fs.readFileSync(COS_ROOT + '/lib/alimtalk-core.js', 'utf8'));
  ck('★ `TPL_LEAVE_BY_BIZ` 는 아직 빈 값(학원·공공 둘)',
    /TPL_LEAVE_BY_BIZ = \{ academy: '', public: '' \}/.test(AT.replace(/\s+/g, ' ')), true);
  ck('  빈 값이면 **문자로 떨어진다**(위 ② ㉡ 가 실측)', true, true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                          : '✔ ' + pass + '/' + pass + ' 전부 통과'));
console.log('※ 가짜 firebase-admin · 가짜 fetch — **실제 알리고 호출 0건**(문자·알림톡) · 실제 쓰기 0');
process.exit(fail ? 1 : 0);
})();
