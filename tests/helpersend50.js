/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드50(43-B) — 동승 도우미 **알림 보내기** (lib/send-guard.js · 두 창구)
   ★ 대조 먼저: 고치기 전(766347e = v280)에서는 도우미 토큰으로 **못 보낸다**를 보이고,
     고친 뒤 **자기 차량 «회원» 에게만** 나가는 것을 본다.
   ★ 받는 번호 판정까지만 본다 — 알리고 호출은 직전에서 끊긴다(바깥 통신 0 · 요금 0).
   ★ 기사·관리자 쪽은 그대로여야 한다(회귀). */
if (!('COS_SRC_OLD_REF' in process.env)) process.env.COS_SRC_OLD_REF = '766347e';  /* v280 */
const cp = require('child_process');
const crypto = require('crypto');
const E = require('./sendenv.js');
const { SRC, SRC_OLD, makeState, call } = E;
const OLD_GUARD = cp.execSync('git -C ' + COS_ROOT + ' show '
  + process.env.COS_SRC_OLD_REF + ':lib/send-guard.js', { maxBuffer: 1 << 26 }).toString();

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const ORG = 'academy_owner1', OWNER = 'OWNER1', ST = 'st7';
const HUID = 'hlp_' + ORG + '_' + ST, DUID = 'drv_' + ORG + '_car1';
const DAY = 86400000, NOW = Date.UTC(2026, 10, 4, 3, 0, 0);     /* sendenv 가짜 시계 */
const LIVE    = { approved: true, withdrawn: false, paidUntil: NOW + 30 * DAY };
const EXPIRED = { approved: true, withdrawn: false, paidUntil: NOW - DAY };

/* «회원» 넷 — car1 등원 / car2 등원 / car2 등원+car1 하원 / 차량 없음 */
const MEMBERS = [
  { id: 'm1', name: '가하은', carId: 'car1', phone: '010-1111-0001' },
  { id: 'm2', name: '나지후', carId: 'car2', phone: '010-2222-0002' },
  { id: 'm3', name: '다가을', carId: 'car2', carIdDrop: 'car1', phone: '010-3333-0003' },
  { id: 'm4', name: '라은우', carId: '',     phone: '010-4444-0004' }
];
function st(over) {
  over = over || {};
  const S = makeState();
  S.docs['users/' + OWNER] = Object.assign({ orgId: ORG }, over.owner || LIVE);
  S.docs['users/' + HUID] = { role: 'helper', driverOrg: ORG, ownerUid: OWNER, staffId: ST };
  S.docs['users/' + DUID] = { role: 'driver', driverOrg: ORG, ownerUid: OWNER, carId: 'car1' };
  S.docs['orgs/' + ORG + '/drivers/' + HUID] =
    { role: 'helper', staffId: ST, carId: (over.helperCar === undefined ? 'car1' : over.helperCar), ownerUid: OWNER };
  S.docs['orgs/' + ORG + '/data/members'] = { value: JSON.stringify(MEMBERS) };
  S.tokens = {
    hTok: { uid: HUID, helper: true, org: ORG, staffId: ST, firebase: { sign_in_provider: 'custom' } },
    dTok: { uid: DUID, driver: true, org: ORG, carId: 'car1', firebase: { sign_in_provider: 'custom' } },
    aTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } }
  };
  return S;
}
const sms = (src, S, tok, rcv, guard) =>
  call(src, Object.assign(S, guard ? { guardSrc: guard } : {}),
       { org: ORG, receiver: rcv, msg: '곧 도착합니다', title: 't' }, tok, 'https://cosroad.com');
const alim = (src, S, tok, rcv, guard) =>
  call(src, Object.assign(S, guard ? { guardSrc: guard } : {}),
       { org: ORG, receiver: rcv, tpl_code: 'UI_7310', name: '가하은', message: '하차했습니다' },
       tok, 'https://cosroad.com');

(async () => {
  console.log('════ ① 대조 — 고치기 전(v280)은 도우미 토큰으로 **못 보낸다**');
  {
    const S = st();
    const r = await sms(SRC_OLD.sms, S, 'hTok', '010-1111-0001', OLD_GUARD);
    ck('[옛] 문자 → 막힘', r.code, 403);
    ck('[옛]    문구(관리자 길로 떨어진다)', (r.body || {}).message, '내 업체가 아니에요.');
    ck('[옛]    알리고 0건', S.aligo.length, 0);
    const S2 = st();
    const r2 = await alim(SRC_OLD.alim, S2, 'hTok', '010-1111-0001', OLD_GUARD);
    ck('[옛] 알림톡 → 막힘', r2.code, 403);
    ck('[옛]    알리고 0건', S2.aligo.length, 0);
    /* 대조군 — 옛 판에서도 **기사**는 보낼 수 있었다(묶음이 멀쩡함을 보인다) */
    const S3 = st();
    const r3 = await sms(SRC_OLD.sms, S3, 'dTok', '010-1111-0001', OLD_GUARD);
    ck('[옛] 기사는 그때도 보냈다', r3.code, 200);
  }

  console.log('\n② 고친 뒤 — 도우미는 **자기 차량 «회원»** 에게만');
  {
    const S = st();
    const r = await sms(SRC.sms, S, 'hTok', '010-1111-0001');
    ck('1. 내 차량(car1) «회원» → 200', r.code, 200);
    ck('   알리고 1건', S.aligo.length, 1);
    const S2 = st();
    const r2 = await sms(SRC.sms, S2, 'hTok', '010-2222-0002');
    ck('2. 남의 차량(car2) «회원» → 403', r2.code, 403);
    ck('   문구(명부에 없는 번호)',
       /회원 명부에 없는 번호가 1개 있어요/.test((r2.body || {}).message || ''), true);
    ck('   알리고 0건', S2.aligo.length, 0);
    const S3 = st();
    const r3 = await sms(SRC.sms, S3, 'hTok', '010-1111-0001,010-2222-0002');
    ck('3. 하나만 끼워 넣어도 **요청 전체 거부**', r3.code, 403);
    ck('   알리고 0건', S3.aligo.length, 0);
    const S4 = st();
    const r4 = await sms(SRC.sms, S4, 'hTok', '010-3333-0003');
    ck('4. **하원만** 내 차량인 «회원» → 200 (v273 그대로)', r4.code, 200);
    const S5 = st();
    const r5 = await sms(SRC.sms, S5, 'hTok', '010-4444-0004');
    ck('5. 차량 없는 «회원» → 403', r5.code, 403);
  }

  console.log('\n③ 배정을 **떼면** 아무에게도 못 보낸다 (업체 전체로 넓어지지 않는다)');
  for (const [name, car] of [['배정 칸이 빈 값', ''], ['배정 문서가 없음', null]]) {
    const S = st({ helperCar: car === null ? '' : car });
    if (car === null) delete S.docs['orgs/' + ORG + '/drivers/' + HUID];
    const r = await sms(SRC.sms, S, 'hTok', '010-1111-0001');
    ck(name + ' → 403', r.code, 403);
    ck('   문구', (r.body || {}).message, '동승할 차량이 배정되지 않았어요. 관리자에게 말씀해 주세요.');
    ck('   알리고 0건', S.aligo.length, 0);
  }

  console.log('\n④ 배정이 바뀌면 **그때부터** 새 차량 (토큰은 그대로다)');
  {
    const S = st({ helperCar: 'car2' });
    const r1 = await sms(SRC.sms, S, 'hTok', '010-2222-0002');
    ck('새 차량(car2) «회원» → 200', r1.code, 200);
    const S2 = st({ helperCar: 'car2' });
    const r2 = await sms(SRC.sms, S2, 'hTok', '010-1111-0001');
    ck('옛 차량(car1) «회원» → 403', r2.code, 403);
    ck('   알리고 0건', S2.aligo.length, 0);
  }

  console.log('\n⑤ 알림톡도 같은 길');
  {
    const S = st();
    const r = await alim(SRC.alim, S, 'hTok', '010-1111-0001');
    ck('내 차량 «회원» → 200', r.code, 200);
    ck('   알리고 1건', S.aligo.length, 1);
    const S2 = st();
    const r2 = await alim(SRC.alim, S2, 'hTok', '010-2222-0002');
    ck('남의 차량 «회원» → 403', r2.code, 403);
    ck('   문구', (r2.body || {}).message, '회원 명부에 없는 번호예요. 회원관리에서 번호를 확인해 주세요.');
    const S3 = st({ helperCar: '' });
    const r3 = await alim(SRC.alim, S3, 'hTok', '010-1111-0001');
    ck('배정 없음 → 403 nocar 문구', (r3.body || {}).message,
       '동승할 차량이 배정되지 않았어요. 관리자에게 말씀해 주세요.');
    const S4 = st();
    const r4 = await call(SRC.alim, S4, { org: ORG, receiver: '010-1111-0001', tpl_code: 'NOPE' },
                          'hTok', 'https://cosroad.com');
    ck('모르는 템플릿은 그대로 400', r4.code, 400);
  }

  console.log('\n⑥ 기간이 끝난 업체 — 도우미도 못 보낸다 (기사와 같은 문구)');
  {
    const S = st({ owner: EXPIRED });
    const r = await sms(SRC.sms, S, 'hTok', '010-1111-0001');
    ck('기간 끝남 → 403', r.code, 403);
    ck('   문구가 기사와 같다', (r.body || {}).message,
       '이용 기간이 끝났거나 승인 전이라 문자를 보낼 수 없어요.');
    const S2 = st({ owner: EXPIRED });
    const r2 = await sms(SRC.sms, S2, 'dTok', '010-1111-0001');
    ck('   같은 상태에서 기사도 403', r2.code, 403);
  }

  console.log('\n⑦ 회귀 — 기사·관리자는 그대로');
  {
    const S = st();
    ck('기사 car1 «회원» → 200', (await sms(SRC.sms, S, 'dTok', '010-1111-0001')).code, 200);
    const S2 = st();
    ck('기사 남의 차량 → 403', (await sms(SRC.sms, S2, 'dTok', '010-2222-0002')).code, 403);
    const S3 = st();
    ck('기사 하원만 내 차량 → 200', (await sms(SRC.sms, S3, 'dTok', '010-3333-0003')).code, 200);
    const S4 = st();
    ck('관리자 — 업체 «회원» 전체 가능', (await sms(SRC.sms, S4, 'aTok', '010-2222-0002')).code, 200);
    const S5 = st();
    ck('관리자 — 차량 없는 «회원» 도 가능', (await sms(SRC.sms, S5, 'aTok', '010-4444-0004')).code, 200);
    const S6 = st();
    ck('관리자 — 명부에 없는 번호는 403',
       (await sms(SRC.sms, S6, 'aTok', '010-9999-9999')).code, 403);
    const S7 = st();
    ck('토큰 없으면 401', (await sms(SRC.sms, S7, null, '010-1111-0001')).code, 401);
    const S8 = st();
    S8.tokens.anon = { uid: 'ANON', firebase: { sign_in_provider: 'anonymous' } };
    ck('익명 로그인은 401', (await sms(SRC.sms, S8, 'anon', '010-1111-0001')).code, 401);
    /* 문의(mode:'inquiry')는 비로그인 허용 — 그대로 */
    const S9 = st();
    S9.docs['orgs/_master/data/billing'] = { notifyPhone: '010-3660-3911' };
    ck('문의 알림은 그대로 200',
       (await call(SRC.sms, S9, { mode: 'inquiry', msg: '문의합니다' }, null, 'https://cosroad.com')).code, 200);
  }

  console.log('\n⑧ 소스 대조 — 차량을 보는 자리가 **한 곳**인가');
  {
    const g = require('fs').readFileSync('' + COS_ROOT + '/lib/send-guard.js', 'utf8');
    const two = [SRC.sms, SRC.alim];
    const oldTwo = [SRC_OLD.sms, SRC_OLD.alim];
    ck('옛 판: 두 창구가 각각 적고 있었다',
       oldTwo.filter(s => /caller\.driver \? caller\.carId : ''/.test(s)).length, 2);
    ck('새 판: 그 글이 **0곳**', two.filter(s => /caller\.driver \? caller\.carId : ''/.test(s)).length, 0);
    ck('두 창구가 callerCarScope 를 쓴다',
       two.filter(s => /await callerCarScope\(A, caller\)/.test(s)).length, 2);
    ck('callerCarScope 는 send-guard 에 한 벌',
       (g.match(/export async function callerCarScope/g) || []).length, 1);
    ck('도우미 차량은 **drivers 문서**에서 읽는다',
       /collection\('drivers'\)\.doc\(caller\.uid\)/.test(g), true);
    ck('canSendFor 가 기사·도우미를 같은 길로 본다',
       /if \(caller\.driver \|\| caller\.helper\) \{/.test(g), true);
    ck('whoIsCalling 이 helper claim 을 읽는다', /helper: t\.helper === true,/.test(g), true);
    ck('상한 숫자는 그대로(300·3000·50)',
       /ORG_PER_MIN  = 300/.test(g) && /ORG_PER_DAY  = 3000/.test(g) && /REQ_MAX_RCV  = 50/.test(g), true);
    ck('템플릿 목록도 그대로 6개', (g.match(/'U[IJ]_\d+'/g) || []).length, 6);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 firebase-admin + 가짜 알리고 — 바깥 통신 0 · 요금 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
