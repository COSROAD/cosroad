/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드52(43-C) — 도우미 출퇴근(서버) + 기기 풀기.
   ★ 대조 먼저: 고치기 전(be5e959 = v281+51)에서 도우미 출퇴근이 **403** 이고
     직원 PIN 을 바꿔도 **기기가 안 풀리는 것**을 보인 뒤, 고친 판을 본다.
   가짜 firebase-admin — 실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const crypto = require('crypto');
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;
const NEW_DRV = SRC.drv, NEW_ADM = SRC.admin;
const OLD_REF = process.env.COS_API_OLD_REF || 'be5e959';
const show = (p) => cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':' + p,
  { maxBuffer: 1 << 26 }).toString();
const OLD_DRV = show('api/driver-auth.js'), OLD_ADM = show('api/admin-account.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 56)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const SECRET = 'SEKRIT-TEST';
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const pinHash = (pin, org) => sha(pin + '|' + org + '|' + SECRET);
const ORG = 'academy_owner1', OWNER = 'OWNER1', MASTER = 'MASTER1', CODE = '123456';
const ST = 'st2', HUID = 'hlp_' + ORG + '_' + ST, DEV = 'DEV-HELPER';
const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 31, 11, 20, 0);       /* drvenv 가짜 시계 = 2026-10-31 20:20 KST */
const TODAY = '2026-10-31';                          /* 그 시계의 KST 날짜 */
const LIVE    = { approved: true, withdrawn: false, paidUntil: NOW + 30 * DAY, plan: 'paid' };
const EXPIRED = { approved: true, withdrawn: false, paidUntil: NOW - DAY, plan: 'paid' };

function st(over) {
  over = over || {};
  const S = makeState();
  S.docs['orgCodes/' + CODE] = { orgId: ORG, createdAt: 1 };
  S.docs['users/' + OWNER] = Object.assign({ orgId: ORG }, over.owner || LIVE);
  S.docs['admins/' + MASTER] = { role: 'master' };
  S.docs['driverPins/' + ORG + '_car1'] = { org: ORG, carId: 'car1', pinHash: pinHash('1234', ORG), updatedAt: 1 };
  S.docs['staffPins/' + ORG + '_' + ST] = { org: ORG, staffId: ST, pinHash: pinHash('5678', ORG), updatedAt: 1 };
  if (over.helperDoc !== false) {
    S.docs['orgs/' + ORG + '/drivers/' + HUID] = Object.assign(
      { role: 'helper', staffId: ST, carId: 'car1', ownerUid: OWNER }, over.helperDoc || {});
  }
  if (over.staffAtt) S.docs['orgs/' + ORG + '/data/staffAtt'] = { value: JSON.stringify(over.staffAtt), updatedAt: 1 };
  S.tokens = {
    ownerTok:  { uid: OWNER,  firebase: { sign_in_provider: 'password' } },
    masterTok: { uid: MASTER, firebase: { sign_in_provider: 'password' } }
  };
  Object.assign(S.docs, over.docs || {});
  return S;
}
const login = (src, S, pin) =>
  call(src, S, { action: 'login', orgCode: CODE, pin: pin, deviceId: DEV }, null, '1.2.3.4');
const staffAttOf = (S) => {
  const d = S.docs['orgs/' + ORG + '/data/staffAtt'];
  if (!d) return null;
  try { return JSON.parse(d.value); } catch (e) { return null; }
};

(async () => {
  console.log('════ ① 대조 — 고치기 전(' + OLD_REF + ')');
  {
    const S = st();
    const r0 = await login(OLD_DRV, S, '5678');
    const tok = (r0.body || {}).token;
    ck('[옛] 도우미 로그인은 된다(43-B)', r0.code, 200);
    const r = await call(OLD_DRV, S, { action: 'checkin' }, tok, '1.2.3.4');
    ck('[옛] 도우미 출근 → **403**', r.code, 403);
    ck('[옛]    문구', (r.body || {}).message, '기사 로그인으로만 쓸 수 있어요.');
    ck('[옛]    직원 근태 문서 안 생김', staffAttOf(S), null);
    /* 기기 풀기 — 옛 판은 PIN 을 바꿔도 **기기를 안 푼다** */
    const S2 = st({ docs: { ['driverDevices/' + ORG + '_hlp_' + ST]:
      { org: ORG, helper: true, staffId: ST, deviceId: 'OLD-PHONE', boundAt: 1 } } });
    await call(OLD_ADM, S2, { action: 'setStaffPin', org: ORG, staffId: ST, pin: '1111' }, 'ownerTok', '1.2.3.4');
    ck('[옛] PIN 바꿔도 묶인 기기가 **그대로 남는다**',
       (S2.docs['driverDevices/' + ORG + '_hlp_' + ST] || {}).deviceId, 'OLD-PHONE');
    const S3 = st();
    const u = await call(OLD_ADM, S3, { action: 'unbindDevice', org: ORG, staffId: ST }, 'ownerTok', '1.2.3.4');
    ck('[옛] unbindDevice 에 직원 갈래가 없다(400)', u.code, 400);
  }

  console.log('\n② 고친 뒤 — 도우미 출퇴근이 **직원 근태**로 들어간다');
  {
    const S = st();
    const r0 = await login(NEW_DRV, S, '5678');
    const tok = (r0.body || {}).token;
    const r1 = await call(NEW_DRV, S, { action: 'checkin' }, tok, '1.2.3.4');
    ck('출근 → 200 kind in', r1.code + '/' + (r1.body || {}).kind, '200/in');
    ck('   시각은 서버 KST', (r1.body || {}).time, '20:20');
    ck('   날짜도 KST', (r1.body || {}).date, TODAY);
    ck('   staffId 를 돌려준다(앱이 같은 키로 적게)', (r1.body || {}).staffId, ST);
    const sa = staffAttOf(S) || {};
    ck('★ `data/staffAtt` 에 `st2_날짜` 로 찍혔다', JSON.stringify(sa[ST + '_' + TODAY]), '{"in":"20:20"}');
    ck('   키 모양이 앱 attKey 와 같다', Object.keys(sa).join(','), ST + '_' + TODAY);
    ck('   차량 문서(carState)는 안 건드린다',
       Object.keys(S.docs).filter((k) => /carState/.test(k)).length, 0);
    ck('★ 배정 문서에 「오늘 내 출퇴근」이 같이 적힌다(폰이 읽을 수 있게)',
       JSON.stringify((S.docs['orgs/' + ORG + '/drivers/' + HUID] || {}).att),
       '{"date":"' + TODAY + '","in":"20:20","out":""}');
    ck('   배정(carId)은 안 바뀐다', (S.docs['orgs/' + ORG + '/drivers/' + HUID] || {}).carId, 'car1');
    /* 퇴근 → done */
    const r2 = await call(NEW_DRV, S, { action: 'checkout' }, tok, '1.2.3.4');
    ck('퇴근 → kind out', (r2.body || {}).kind, 'out');
    ck('   같은 칸에 out 이 더해진다', JSON.stringify((staffAttOf(S) || {})[ST + '_' + TODAY]),
       '{"in":"20:20","out":"20:20"}');
    const r3 = await call(NEW_DRV, S, { action: 'checkout' }, tok, '1.2.3.4');
    ck('한 번 더 → done(덮지 않는다)', (r3.body || {}).kind, 'done');
    ck('   기록은 그대로', JSON.stringify((staffAttOf(S) || {})[ST + '_' + TODAY]),
       '{"in":"20:20","out":"20:20"}');
    /* 출근 없이 퇴근을 눌러도 — 기사와 **같은 규칙**(첫 번째는 in 으로 찍힌다) */
    const S4 = st();
    const r4 = await login(NEW_DRV, S4, '5678');
    const r5 = await call(NEW_DRV, S4, { action: 'checkout' }, (r4.body || {}).token, '1.2.3.4');
    ck('출근 없이 퇴근 → 기사와 같게 in 으로 찍힌다', (r5.body || {}).kind, 'in');
  }

  console.log('\n③ 남의 기록을 **안 지운다** (트랜잭션으로 그 칸만)');
  {
    const S = st({ staffAtt: { ['st1_' + TODAY]: { in: '08:30', out: '17:30' },
                               ['st9_2026-10-30']: { in: '09:00' } } });
    const r0 = await login(NEW_DRV, S, '5678');
    await call(NEW_DRV, S, { action: 'checkin' }, (r0.body || {}).token, '1.2.3.4');
    const sa = staffAttOf(S) || {};
    ck('내 칸이 생겼다', JSON.stringify(sa[ST + '_' + TODAY]), '{"in":"20:20"}');
    ck('★ 다른 직원 오늘 기록 그대로', JSON.stringify(sa['st1_' + TODAY]), '{"in":"08:30","out":"17:30"}');
    ck('★ 지난 날짜 기록도 그대로', JSON.stringify(sa['st9_2026-10-30']), '{"in":"09:00"}');
    ck('덮어쓰기 직전 백업이 남는다',
       Object.keys(S.docs).filter((k) => /\/backups\/staffAtt__/.test(k)).length, 1);
  }

  console.log('\n④ 기사 출퇴근은 **그대로** (차량 문서에)');
  {
    const S = st();
    const r0 = await login(NEW_DRV, S, '1234');
    const r1 = await call(NEW_DRV, S, { action: 'checkin' }, (r0.body || {}).token, '1.2.3.4');
    ck('기사 출근 → kind in', (r1.body || {}).kind, 'in');
    ck('   staffId 는 안 준다', ('staffId' in (r1.body || {})), false);
    const cs = S.docs['orgs/' + ORG + '/carState/car1'];
    ck('   차량 문서 att 에 찍혔다', JSON.stringify(JSON.parse(cs.value).att), '{"' + TODAY + '":{"in":"20:20"}}');
    ck('   `data/staffAtt` 는 안 만든다', staffAttOf(S), null);
  }

  console.log('\n⑤ 기간·배정·본문 값');
  {
    const S = st({ owner: EXPIRED });
    /* 기간이 끝나면 로그인부터 막히므로, 토큰은 살아 있는 동안 받은 것으로 흉내 낸다 */
    S.tokens['CT:' + HUID] = { uid: HUID, helper: true, org: ORG, staffId: ST,
                               firebase: { sign_in_provider: 'custom' } };
    const r = await call(NEW_DRV, S, { action: 'checkin' }, 'CT:' + HUID, '1.2.3.4');
    ck('기간 끝난 업체 도우미 출근 → 403 expired', r.code + '/' + (r.body || {}).why, '403/expired');
    ck('   기록 0', staffAttOf(S), null);
    /* 배정이 없어도 출퇴근은 된다 (근태는 차량과 무관 — 사장님 추천) */
    const S2 = st({ helperDoc: { carId: '' } });
    S2.tokens['CT:' + HUID] = { uid: HUID, helper: true, org: ORG, staffId: ST,
                                firebase: { sign_in_provider: 'custom' } };
    const r2 = await call(NEW_DRV, S2, { action: 'checkin' }, 'CT:' + HUID, '1.2.3.4');
    ck('★ 배정이 없어도 출근은 된다', r2.code + '/' + (r2.body || {}).kind, '200/in');
    /* 본문 값 불신 — 남의 staffId 를 적어 보내도 토큰의 것만 쓴다 */
    const S3 = st();
    const r3 = await login(NEW_DRV, S3, '5678');
    await call(NEW_DRV, S3, { action: 'checkin', staffId: 'st1', org: 'other_org' },
               (r3.body || {}).token, '1.2.3.4');
    ck('★ 본문 staffId·org 를 믿지 않는다', Object.keys(staffAttOf(S3) || {}).join(','), ST + '_' + TODAY);
    /* 기사 토큰으로 직원 근태를 찍을 수는 없다 */
    const S4 = st();
    const r4 = await login(NEW_DRV, S4, '1234');
    await call(NEW_DRV, S4, { action: 'checkin', staffId: ST }, (r4.body || {}).token, '1.2.3.4');
    ck('기사 토큰은 차량 쪽으로만 간다', staffAttOf(S4), null);
  }

  console.log('\n⑥ 기기 풀기 — PIN 을 바꾸거나 지우면 **같이 풀린다**');
  {
    const mk = () => st({ docs: { ['driverDevices/' + ORG + '_hlp_' + ST]:
      { org: ORG, helper: true, staffId: ST, deviceId: 'OLD-PHONE', boundAt: 1 } } });
    const S = mk();
    const r = await call(NEW_ADM, S, { action: 'setStaffPin', org: ORG, staffId: ST, pin: '1111' }, 'ownerTok', '1.2.3.4');
    ck('PIN 바꾸기 → 200', r.code, 200);
    ck('★ 묶인 기기가 풀렸다',
       Object.prototype.hasOwnProperty.call(S.docs, 'driverDevices/' + ORG + '_hlp_' + ST), false);
    const S2 = mk();
    await call(NEW_ADM, S2, { action: 'removeStaffPin', org: ORG, staffId: ST }, 'ownerTok', '1.2.3.4');
    ck('PIN 지우기 → 기기도 풀렸다',
       Object.prototype.hasOwnProperty.call(S2.docs, 'driverDevices/' + ORG + '_hlp_' + ST), false);
    /* 새 폰으로 로그인이 된다 (대조: 옛 판은 「등록된 기기가 아니에요」) */
    const S3 = mk();
    await call(NEW_ADM, S3, { action: 'setStaffPin', org: ORG, staffId: ST, pin: '5678' }, 'ownerTok', '1.2.3.4');
    const r3 = await call(NEW_DRV, S3, { action: 'login', orgCode: CODE, pin: '5678', deviceId: 'NEW-PHONE' }, null, '1.2.3.4');
    ck('★ 새 폰으로 로그인 된다', r3.code, 200);
    const S4 = mk();
    const r4 = await call(OLD_DRV, S4, { action: 'login', orgCode: CODE, pin: '5678', deviceId: 'NEW-PHONE' }, null, '1.2.3.4');
    ck('[옛 대조] 그때는 막혔다', (r4.body || {}).why, 'device');
  }

  console.log('\n⑦ 기기 풀기 단추(unbindDevice) 직원 갈래');
  {
    const mk = () => st({ docs: { ['driverDevices/' + ORG + '_hlp_' + ST]:
      { org: ORG, helper: true, staffId: ST, deviceId: 'OLD-PHONE', boundAt: 1 },
      ['driverDevices/' + ORG + '_car1']: { org: ORG, carId: 'car1', deviceId: 'CAR-PHONE', boundAt: 1 } } });
    const S = mk();
    const r = await call(NEW_ADM, S, { action: 'unbindDevice', org: ORG, staffId: ST }, 'ownerTok', '1.2.3.4');
    ck('소유자 → 200', r.code, 200);
    ck('   도우미 기기만 풀린다',
       Object.prototype.hasOwnProperty.call(S.docs, 'driverDevices/' + ORG + '_hlp_' + ST), false);
    ck('   기사 기기는 그대로', (S.docs['driverDevices/' + ORG + '_car1'] || {}).deviceId, 'CAR-PHONE');
    const S2 = mk();
    const r2 = await call(NEW_ADM, S2, { action: 'unbindDevice', org: ORG, carId: 'car1' }, 'ownerTok', '1.2.3.4');
    ck('기사 갈래는 종전 그대로', r2.code, 200);
    ck('   기사 기기가 풀린다',
       Object.prototype.hasOwnProperty.call(S2.docs, 'driverDevices/' + ORG + '_car1'), false);
    const S3 = mk();
    const r3 = await call(NEW_ADM, S3, { action: 'unbindDevice', org: ORG }, 'ownerTok', '1.2.3.4');
    ck('둘 다 없으면 400', r3.code, 400);
    /* 기간이 끝나면 막힌다(47 과 같은 길) */
    const S4 = st({ owner: EXPIRED, docs: { ['driverDevices/' + ORG + '_hlp_' + ST]:
      { org: ORG, helper: true, staffId: ST, deviceId: 'OLD-PHONE', boundAt: 1 } } });
    const r4 = await call(NEW_ADM, S4, { action: 'unbindDevice', org: ORG, staffId: ST }, 'ownerTok', '1.2.3.4');
    ck('기간 끝남 → 403 expired', r4.code + '/' + (r4.body || {}).why, '403/expired');
    ck('   기기는 그대로', (S4.docs['driverDevices/' + ORG + '_hlp_' + ST] || {}).deviceId, 'OLD-PHONE');
    const S5 = st({ owner: EXPIRED, docs: { ['driverDevices/' + ORG + '_hlp_' + ST]:
      { org: ORG, helper: true, staffId: ST, deviceId: 'OLD-PHONE', boundAt: 1 } } });
    const r5 = await call(NEW_ADM, S5, { action: 'unbindDevice', org: ORG, staffId: ST }, 'masterTok', '1.2.3.4');
    ck('마스터는 기간 끝나도 통과', r5.code, 200);
  }

  console.log('\n⑧ 소스 대조');
  {
    const noCmt = NEW_DRV.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/mg, ' ');
    ck('출퇴근 호출자 확인이 한 벌(requirePuncher)',
       (noCmt.match(/async function requirePuncher\(/g) || []).length, 1);
    ck('   옛 이름(requireDriver)은 남아 있지 않다', /requireDriver/.test(noCmt), false);
    ck('직원 근태 쓰기는 한 곳(punchStaff)', (noCmt.match(/async function punchStaff\(/g) || []).length, 1);
    ck('   트랜잭션으로 쓴다', /runTransaction/.test(noCmt.slice(noCmt.indexOf('async function punchStaff('))), true);
    ck('키 모양이 `staffId_날짜`',
       /const key = String\(staffId\) \+ '_' \+ dateStr;/.test(NEW_DRV), true);
    ck('기사 쪽 punch 는 그대로', (noCmt.match(/async function punch\(/g) || []).length, 1);
    const admNo = NEW_ADM.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/mg, ' ');
    ck('도우미 기기 문서를 지우는 곳 셋(PIN 바꾸기·지우기·풀기)',
       (admNo.match(/_hlp_' \+ staffId\)\.delete\(\)|doc\(devId\)\.delete\(\)/g) || []).length, 3);
    ck('unbindDevice 가 한 자리에서 권한·기간을 본다',
       /action === 'unbindDevice'[\s\S]{0,420}orgAlive\(org\)/.test(admNo), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 firebase-admin — 실제 쓰기 0 · 문자 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
