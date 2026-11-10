/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드70 — **출석 전용 기기: 물류·택배는 기사·직원 출퇴근** (업종별 · v314).
   ① 재현 — 고치기 전에는 물류 기기에 기사·직원 PIN 을 눌러도 **404**(찍히는 것 0)
   ② 업종을 **무엇으로 정하나** — 소유자 계정 `bizType` 원본 · 요약으로 떨어짐 · 모르면 막는 쪽
      (업체 id 앞붙이 글자를 **안 본다** — 대조로 못 박는다)
   ③ 물류·택배 — 기사 PIN → `carState.att` · 직원 PIN → `data/staffAtt` · «회원» PIN 은 **안 받음**
   ④ 학원·공공 — 종전 그대로 «회원» 출석만 · 기사·직원 PIN 은 **찍지 않고** 안내
   ⑤ 같은 날 **섞어 찍기** — 기기 → 관리자 판 → 직원 폰 셈이 맞나(출근·퇴근·이미 퇴근)
   ⑥ 업체 분리 — **남의 업체 PIN 은 안 찍힌다** · 기사 기기 묶기(`driverDevices`) 안 건드림 ·
      알림톡 **0** · 기간 끝이면 막힘
   ★ 바깥 통신 0 — 가짜 firebase-admin·가짜 알리고. 실제 발송 0 · 실제 쓰기 0. */
const crypto = require('crypto');
const cp = require('child_process');
const fs = require('fs');
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;

const OLD_REF = process.env.COS_SRC_OLD_REF || 'f23e964';   /* v313 — 고치기 전 */
const SRC_OLD_DRV = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/driver-auth.js',
  { maxBuffer: 1 << 26 }).toString().replace(/\r\n/g, '\n');
const F = (p) => fs.readFileSync(COS_ROOT + '/' + p, 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 46)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const SECRET = 'SEKRIT-TEST';
const DAY = 86400000, NOW = Date.UTC(2026, 9, 31, 11, 20, 0);   /* = 2026-10-31 20:20 KST */
const DATE = '2026-10-31';
const ORG = 'logi_owner1', OWNER = 'OWNER1';
const OTHER = 'logi_other9', OWNER2 = 'OWNER9';
const hashOf = (org, v) => sha(v + '|' + org + '|' + SECRET);

const CARS = [{ id: 'car1', name: '1호차', driver: '박기사' }];
const STAFF = [{ id: 'st1', name: '김직원', hasPin: true }];
const MEM = [{ id: 1, name: '가하은', phone: '010-1111-1111', pin: '1111' }];

/* 업체 하나 — `biz` 로 업종을 정한다(소유자 계정 `bizType` 이 **원본**) */
function st(over) {
  over = over || {};
  const S = makeState({ now: NOW });
  const biz = over.biz || 'logistics';
  S.docs['users/' + OWNER] = { orgId: ORG, bizType: (over.noOwnerBiz ? undefined : biz),
    approved: true, withdrawn: false,
    paidUntil: over.expired ? NOW - DAY : NOW + 30 * DAY, plan: 'paid' };
  S.docs['orgs/' + ORG + '/data/cars'] = { value: JSON.stringify(CARS), updatedAt: 1 };
  S.docs['orgs/' + ORG + '/data/staff'] = { value: JSON.stringify(STAFF), updatedAt: 1 };
  S.docs['orgs/' + ORG + '/data/members'] = { value: JSON.stringify(MEM), updatedAt: 1 };
  if (over.orgDriverBiz !== null) {
    S.docs['orgs/' + ORG + '/data/orgDriver'] = {
      value: JSON.stringify({ name: '한빛물류', icon: '🚚',
        bizType: over.orgDriverBiz || biz }), updatedAt: 1 };
  }
  /* 서버 전용 PIN 곳간 — 기사 2222 · 직원 3333 · «회원» 1111 */
  S.docs['driverPins/' + ORG + '_car1'] = { org: ORG, carId: 'car1', pinHash: hashOf(ORG, '2222'), updatedAt: 1 };
  S.docs['staffPins/' + ORG + '_st1'] = { org: ORG, staffId: 'st1', pinHash: hashOf(ORG, '3333'), updatedAt: 1 };
  S.docs['memberPins/' + ORG + '_1'] = { org: ORG, memberId: '1', pinHash: hashOf(ORG, '1111'), updatedAt: 1 };
  /* 남의 업체 — PIN 9999(기사) */
  S.docs['users/' + OWNER2] = { orgId: OTHER, bizType: 'logistics', approved: true,
    withdrawn: false, paidUntil: NOW + 30 * DAY, plan: 'paid' };
  S.docs['driverPins/' + OTHER + '_car1'] = { org: OTHER, carId: 'car1', pinHash: hashOf(OTHER, '9999'), updatedAt: 1 };
  S.tokens = {
    kioskTok: { uid: 'ksk_' + ORG, kiosk: true, org: ORG },
    ownerTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } }
  };
  S.env = { FIREBASE_SERVICE_ACCOUNT: '{"project_id":"x"}', OTP_SECRET: SECRET,
            ALIGO_KEY: 'K', ALIGO_USER_ID: 'U', ALIGO_SENDER_KEY: 'SK', ALIGO_SENDER: '0212345678' };
  return S;
}
const kAtt = (S, pin, src) => call(src || SRC.drv, S,
  { action: 'kioskCheckin', pin: pin }, 'kioskTok', '1.2.3.4');
const pad = (S, body) => call(SRC.drv, S, Object.assign({ org: ORG }, body), 'ownerTok', '1.2.3.4');
const att = (S) => {                       /* 차량 출퇴근 칸 */
  const d = S.docs['orgs/' + ORG + '/carState/car1'];
  if (!d) return null;
  try { return (JSON.parse(d.value || '{}').att || {})[DATE] || null; } catch (e) { return null; }
};
const satt = (S) => {                      /* 직원 근태 칸 */
  const d = S.docs['orgs/' + ORG + '/data/staffAtt'];
  if (!d) return null;
  try { return (JSON.parse(d.value || '{}'))['st1_' + DATE] || null; } catch (e) { return null; }
};
const memAtt = (S) => {                    /* «회원» 출석 칸 */
  const d = S.docs['orgs/' + ORG + '/data/attendance'];
  if (!d) return null;
  try { return (JSON.parse(d.value || '{}')[DATE] || {})['1'] || null; } catch (e) { return null; }
};
const sms = (S) => (S.calls || []).filter((c) => /aligo|alimtalk/i.test(String(c.url || c))).length;

(async () => {
  console.log('════ ① 재현 — 고치기 전(v313) 물류 기기는 **아무것도 못 찍었다**');
  {
    const S = st({});
    const r1 = await kAtt(S, '2222', SRC_OLD_DRV);    /* 기사 PIN */
    const r2 = await kAtt(S, '3333', SRC_OLD_DRV);    /* 직원 PIN */
    ck('[옛] 기사 PIN → 상태코드', r1.code, 404);
    ck('[옛] 그 글', (r1.body && r1.body.message) || '', 'PIN 번호가 올바르지 않습니다.');
    ck('[옛] 직원 PIN → 상태코드', r2.code, 404);
    ck('[옛] ★ 찍힌 것 0 — 차량 칸', att(S) === null ? '없음' : JSON.stringify(att(S)), '없음');
    ck('[옛] ★ 찍힌 것 0 — 직원 칸', satt(S) === null ? '없음' : JSON.stringify(satt(S)), '없음');
  }

  console.log('\n② 업종을 **무엇으로 정하나** (글자 쪼개기 짐작 0)');
  {
    ck('★ 업체 id 앞붙이를 보는 코드 0',
      /org\.(split|slice|indexOf)\([^)]*(_|academy|logistics)/.test(F('api/driver-auth.js')), false);
    ck('  `orgBizType` 한 벌', (F('api/driver-auth.js').match(/async function orgBizType\(/g) || []).length, 1);
    /* ⓐ 소유자 계정이 원본 */
    const A = st({ biz: 'logistics', orgDriverBiz: 'academy' });   /* 요약이 틀려도 */
    const ra = await kAtt(A, '2222');
    ck('★ 소유자 계정 `bizType` 이 **이긴다**(요약이 academy 라도 물류로 본다)',
      ra.code + '/' + ((ra.body && ra.body.kind) || ''), '200/in');
    /* ⓑ 소유자 계정에 없으면 요약으로 */
    const B = st({ noOwnerBiz: true, orgDriverBiz: 'logistics' });
    const rb = await kAtt(B, '2222');
    ck('★ 소유자 계정에 없으면 **요약**(`orgDriver`)으로', rb.code + '/' + ((rb.body && rb.body.kind) || ''), '200/in');
    /* ⓒ 둘 다 없으면 막는 쪽(academy) */
    const C = st({ noOwnerBiz: true, orgDriverBiz: null });
    const rc = await kAtt(C, '2222');
    ck('★ 둘 다 없으면 **막는 쪽**(기사 PIN 거부)', rc.code, 404);
    ck('  그때 찍힌 것 0', att(C) === null ? '없음' : '찍힘', '없음');
    ck('  그 글은 「출석 전용」 안내', /출석 전용이에요/.test((rc.body && rc.body.message) || ''), true);
  }

  console.log('\n③ 물류·택배 — 기사·직원 출퇴근이 찍힌다');
  for (const biz of ['logistics', 'delivery']) {
    const S = st({ biz: biz });
    /* 기사 — 출근 */
    const r1 = await kAtt(S, '2222');
    ck('★ [' + biz + '] 기사 PIN → 출근', r1.code + '/' + ((r1.body && r1.body.kind) || ''), '200/in');
    ck('  [' + biz + '] 차량 칸에 출근 시각', JSON.stringify(att(S)), '{"in":"20:20"}');
    ck('  [' + biz + '] 응답 꼴(관리자 판과 같다)',
      ['ok', 'kind', 'carId', 'time', 'date'].filter((k) => r1.body && r1.body[k] !== undefined).join(','),
      'ok,kind,carId,time,date');
    ck('  [' + biz + '] 보여 줄 이름 하나', (r1.body && r1.body.name) || '', '1호차 · 박기사');
    /* 기사 — 퇴근 → 이미 퇴근 */
    const r2 = await kAtt(S, '2222');
    ck('★ [' + biz + '] 다시 누르면 퇴근', (r2.body && r2.body.kind) || '', 'out');
    const r3 = await kAtt(S, '2222');
    ck('  [' + biz + '] 세 번째는 「이미」', (r3.body && r3.body.kind) || '', 'done');
    ck('  [' + biz + '] 차량 칸은 출·퇴근 둘', JSON.stringify(att(S)), '{"in":"20:20","out":"20:20"}');
    /* 직원 */
    const r4 = await kAtt(S, '3333');
    ck('★ [' + biz + '] 직원 PIN → 출근',
      ((r4.body && r4.body.kind) || '') + '/' + ((r4.body && r4.body.punch) || ''), 'staff/in');
    ck('  [' + biz + '] 직원 근태 칸', JSON.stringify(satt(S)), '{"in":"20:20"}');
    ck('  [' + biz + '] 직원 이름', (r4.body && r4.body.name) || '', '김직원');
    ck('  [' + biz + '] 배정 문서 사본도 생긴다',
      S.docs['orgs/' + ORG + '/drivers/hlp_' + ORG + '_st1'] ? '있음' : '없음', '있음');
    /* «회원» PIN 은 안 받는다 */
    const r5 = await kAtt(S, '1111');
    ck('★ [' + biz + '] «회원» PIN 은 **안 받는다**', r5.code, 404);
    ck('  [' + biz + '] 출석도 안 찍힌다', memAtt(S) === null ? '없음' : memAtt(S), '없음');
    /* 알림톡 0 */
    ck('★ [' + biz + '] 알림톡 **0건**', sms(S), 0);
    /* 기사 기기 묶기는 안 건드린다 */
    ck('★ [' + biz + '] `driverDevices` 안 건드림',
      Object.keys(S.docs).filter((k) => k.indexOf('driverDevices/') === 0).length, 0);
  }

  console.log('\n④ 학원·공공 — 종전 그대로 «회원» 출석만');
  for (const biz of ['academy', 'public']) {
    const S = st({ biz: biz });
    const r1 = await kAtt(S, '1111');
    ck('★ [' + biz + '] «회원» PIN → 출석', r1.code + '/' + ((r1.body && r1.body.name) || ''), '200/가하은');
    ck('  [' + biz + '] 출석 칸', memAtt(S), 'present');
    ck('  [' + biz + '] 응답 꼴 그대로',
      ['ok', 'name', 'time', 'date', 'first'].filter((k) => r1.body && r1.body[k] !== undefined).join(','),
      'ok,name,time,date,first');
    const r2 = await kAtt(S, '2222');
    ck('★ [' + biz + '] 기사 PIN → **찍지 않고** 안내', r2.code, 404);
    ck('  [' + biz + '] 그 글', /출석 전용이에요/.test((r2.body && r2.body.message) || ''), true);
    /* 업종 용어 — 공공은 「이용자」, 학원은 「회원」 */
    ck('  [' + biz + '] 업종 용어',
      (((r2.body && r2.body.message) || '').match(/이 기기는 (\S+) 출석 전용/) || ['', '?'])[1],
      biz === 'public' ? '이용자' : '회원');
    ck('  [' + biz + '] 차량 칸 0', att(S) === null ? '없음' : '찍힘', '없음');
    const r3 = await kAtt(S, '3333');
    ck('★ [' + biz + '] 직원 PIN 도 안내만', r3.code, 404);
    ck('  [' + biz + '] 직원 칸 0', satt(S) === null ? '없음' : '찍힘', '없음');
  }

  console.log('\n⑤ 같은 날 **섞어 찍기** — 기기 → 관리자 판 (같은 함수라 셈이 맞는다)');
  {
    const S = st({ biz: 'logistics' });
    const a = await kAtt(S, '2222');                                  /* 기기에서 출근 */
    const b = await pad(S, { action: 'pinCheckin', pin: '2222' });    /* 관리자 판에서 퇴근 */
    const c = await kAtt(S, '2222');                                  /* 기기에서 또 */
    ck('★ 기기 출근 → 판 퇴근 → 기기 「이미」',
      ((a.body && a.body.kind) || '') + '→' + ((b.body && b.body.kind) || '') + '→' + ((c.body && c.body.kind) || ''),
      'in→out→done');
    ck('  차량 칸은 하나(출·퇴근 한 벌)', JSON.stringify(att(S)), '{"in":"20:20","out":"20:20"}');
    const S2 = st({ biz: 'logistics' });
    const d = await pad(S2, { action: 'pinCheckin', pin: '3333' });   /* 판에서 직원 출근 */
    const e = await kAtt(S2, '3333');                                 /* 기기에서 퇴근 */
    ck('★ 직원도 섞인다 — 판 출근 → 기기 퇴근',
      ((d.body && d.body.punch) || '') + '→' + ((e.body && e.body.punch) || ''), 'in→out');
    ck('  직원 근태 칸 한 벌', JSON.stringify(satt(S2)), '{"in":"20:20","out":"20:20"}');
  }

  console.log('\n⑥ 업체 분리 · 기간 · 토큰');
  {
    const S = st({ biz: 'logistics' });
    const r = await kAtt(S, '9999');                 /* 남의 업체 기사 PIN */
    ck('★ **남의 업체 PIN 은 안 찍힌다**', r.code, 404);
    ck('  남의 업체 차량 칸 0',
      S.docs['orgs/' + OTHER + '/carState/car1'] ? '찍힘' : '없음', '없음');
    const Sx = st({ biz: 'logistics', expired: true });
    const rx = await kAtt(Sx, '2222');
    ck('★ 기간이 끝나면 막힌다', rx.code + '/' + ((rx.body && rx.body.why) || ''), '403/expired');
    ck('  그때도 찍힌 것 0', att(Sx) === null ? '없음' : '찍힘', '없음');
    const So = st({ biz: 'logistics' });
    const ro = await call(SRC.drv, So, { action: 'kioskCheckin', pin: '2222' }, 'ownerTok', '1.2.3.4');
    ck('★ 기기 토큰이 아니면 막힌다(관리자 토큰)', ro.code, 403);
    const Sn = st({ biz: 'logistics' });
    const rn = await call(SRC.drv, Sn, { action: 'kioskCheckin', pin: '2222' }, '', '1.2.3.4');
    ck('  토큰이 없으면 401', rn.code, 401);
    const Sb = st({ biz: 'logistics' });
    const rb2 = await kAtt(Sb, '22');
    ck('  4자리가 아니면 400', rb2.code, 400);
  }

  console.log('\n⑦ 소스 전수');
  {
    const S2 = F('api/driver-auth.js');
    ck('★ 찍는 함수는 **이미 있던 셋**을 그대로 쓴다',
      ['punch(', 'punchStaff(', 'punchMember('].filter((f) => S2.indexOf('await ' + f) >= 0).length, 3);
    ck('  새 찍기 함수 0', (S2.match(/async function punch[A-Za-z]*\(/g) || []).length,
      (SRC_OLD_DRV.match(/async function punch[A-Za-z]*\(/g) || []).length);
    ck('★ 규칙·`storage.rules`·`lib/` 0줄',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF
        + ' -- lib firestore.rules storage.rules', { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
    ck('  바뀐 서버 파일은 `driver-auth` 하나',
      cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' -- api',
        { maxBuffer: 1 << 24 }).toString().trim(), 'api/driver-auth.js');
    ck('  기기 로그인(`kioskLogin`)은 안 건드렸다',
      S2.slice(S2.indexOf("action === 'kioskLogin'"), S2.indexOf("action === 'kioskCheckin'"))
        === SRC_OLD_DRV.slice(SRC_OLD_DRV.indexOf("action === 'kioskLogin'"), SRC_OLD_DRV.indexOf("action === 'kioskCheckin'")),
      true);
    ck('  관리자 판(`pinCheckin`)도 안 건드렸다',
      S2.slice(S2.indexOf("action === 'pinCheckin'")) === SRC_OLD_DRV.slice(SRC_OLD_DRV.indexOf("action === 'pinCheckin'")), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 firebase-admin·가짜 알리고 — 실제 쓰기 0 · 실제 발송 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
