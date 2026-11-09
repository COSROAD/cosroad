/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드49(43-A) 서버 — 직원 PIN 해시 + 동승 도우미 배정.
   ★ 대조 먼저: 고치기 전(d14e1c2)에는 `setStaffPin` 같은 동작이 **아예 없고**,
     PIN 패드는 직원을 **못 가린다**(404 notdriver) — 앱이 평문으로 맞추고 있었다.
   가짜 firebase-admin — 실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const crypto = require('crypto');
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;
const OLD_REF = process.env.COS_API_OLD_REF || 'd14e1c2';
const OLD_ADM = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/admin-account.js',
  { maxBuffer: 1 << 26 }).toString();
const OLD_DRV = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/driver-auth.js',
  { maxBuffer: 1 << 26 }).toString();

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(48) + String(got).slice(0, 48)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const SECRET = 'SEKRIT-TEST';
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const hashOf = (pin, org) => sha(pin + '|' + org + '|' + SECRET);
const ORG = 'academy_owner1', OWNER = 'OWNER1', MASTER = 'MASTER1';
const NOW = Date.UTC(2026, 9, 31, 11, 20, 0);
const DAY = 86400000;
const LIVE = { approved: true, withdrawn: false, paidUntil: NOW + 30 * DAY, plan: 'paid' };
const EXPIRED = { approved: true, withdrawn: false, paidUntil: NOW - DAY, plan: 'paid' };

function st(ownerDoc, over) {
  const S = makeState();
  S.tokens = { ownerTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } },
               masterTok: { uid: MASTER, firebase: { sign_in_provider: 'password' } } };
  Object.assign(S.docs, {
    'admins/MASTER1': { role: 'master' },
    ['users/' + OWNER]: Object.assign({ orgId: ORG }, ownerDoc || LIVE),
    ['orgCodes/123456']: { orgId: ORG, createdAt: 1 },
    ['driverPins/' + ORG + '_car1']: { org: ORG, carId: 'car1', pinHash: hashOf('1111', ORG), updatedAt: 1 }
  }, over || {});
  return S;
}
const adm = (src, S, body, tok) => call(src, S, body, tok || 'ownerTok', '1.2.3.4');
const pad = (src, S, pin) => call(src, S, { action: 'pinCheckin', org: ORG, pin: pin }, 'ownerTok', '1.2.3.4');
const staffDoc = (S, id) => S.docs['staffPins/' + ORG + '_' + id];
const helperDoc = (S, id) => S.docs['orgs/' + ORG + '/drivers/hlp_' + ORG + '_' + id];

(async () => {
  console.log('════ ① 대조 — 고치기 전(' + OLD_REF + ')');
  {
    const S = st();
    const r = await adm(OLD_ADM, S, { action: 'setStaffPin', org: ORG, staffId: 'st1', pin: '2222' });
    ck('[옛] setStaffPin 이 아예 없다', r.code + '/' + ((r.body || {}).message || ''),
       "400/알 수 없는 요청이에요.");
    const S2 = st(null, { ['staffPins/' + ORG + '_st1']: { org: ORG, staffId: 'st1', pinHash: hashOf('2222', ORG) } });
    const p = await pad(OLD_DRV, S2, '2222');
    ck('[옛] PIN 패드가 직원을 **못 가린다**', p.code + '/' + ((p.body || {}).why || ''), '404/notdriver');
  }

  console.log('\n② 직원 PIN 정하기·지우기');
  {
    const S = st();
    const r = await adm(SRC.admin, S, { action: 'setStaffPin', org: ORG, staffId: 'st1', pin: '2222' });
    ck('setStaffPin 200', r.code, 200);
    ck('응답에 PIN·해시가 없다', JSON.stringify(r.body), '{"ok":true}');
    ck('staffPins 에 **해시로** 저장됐다', (staffDoc(S, 'st1') || {}).pinHash, hashOf('2222', ORG));
    ck('평문은 어디에도 없다',
      JSON.stringify(S.docs).indexOf('"2222"') < 0, true);
    /* 기사와 겹치면 거절 */
    const r2 = await adm(SRC.admin, S, { action: 'setStaffPin', org: ORG, staffId: 'st2', pin: '1111' });
    ck('기사 PIN 과 겹치면 409', r2.code, 409);
    /* 다른 직원과 겹치면 거절 */
    const r3 = await adm(SRC.admin, S, { action: 'setStaffPin', org: ORG, staffId: 'st2', pin: '2222' });
    ck('다른 직원과 겹치면 409', r3.code, 409);
    /* 자기 PIN 을 그대로 다시 저장하는 것은 된다 */
    const r4 = await adm(SRC.admin, S, { action: 'setStaffPin', org: ORG, staffId: 'st1', pin: '2222' });
    ck('자기 것 다시 저장은 200', r4.code, 200);
    /* 지우기 */
    const r5 = await adm(SRC.admin, S, { action: 'removeStaffPin', org: ORG, staffId: 'st1' });
    ck('removeStaffPin 200', r5.code, 200);
    ck('   staffPins 문서가 사라졌다', staffDoc(S, 'st1') === undefined, true);
    /* ★★ v294(60-B2)에서 바뀌었다 — **배정 문서를 지운다**(전에는 `carId` 만 비웠다).
       까닭: v294 부터 그 문서가 **PIN 있는 직원 모두**에게 생기므로, 남겨 두면
       그만둔 직원의 토큰이 살아 있는 동안 `data/orgDriver` 를 읽을 수 있다. */
    ck('   동승 배정 문서가 **지워졌다**(v294)', String(helperDoc(S, 'st1')), 'undefined');
  }

  console.log('\n③ PIN 패드 — 서버가 **직원을 가려 준다**');
  {
    const S = st();
    await adm(SRC.admin, S, { action: 'setStaffPin', org: ORG, staffId: 'st1', pin: '2222' });
    const p = await pad(SRC.drv, S, '2222');
    ck('직원 PIN → kind=staff', (p.body || {}).kind, 'staff');
    ck('   누구인지 알려 준다', (p.body || {}).staffId, 'st1');
    /* ★★ v294(60-B2 · 56)에서 바뀌었다 — **서버가 찍는다**(`punchStaff`).
       전에는 앱이 `staffAtt` 에 적어 폰이 읽는 사본(`drivers/hlp_….att`)이 안 생겼다. */
    ck('   기록을 **서버가 한다**(v294 · staffAtt 1건)',
      Object.keys(S.docs).filter((k) => /staffAtt/.test(k)).length, 1);
    ck('   폰이 읽는 **사본**도 적혔다(56 해결)',
      String(((helperDoc(S, 'st1') || {}).att || {}).in || '').length > 0, true);
    ck('   응답에 `punch` 가 온다', (p.body || {}).punch, 'in');
    const p2 = await pad(SRC.drv, S, '1111');
    ck('기사 PIN 은 그대로 출퇴근', (p2.body || {}).kind, 'in');
    const p3 = await pad(SRC.drv, S, '9999');
    ck('둘 다 아니면 404 notdriver(«회원» 으로 이어 봄)',
      p3.code + '/' + ((p3.body || {}).why || ''), '404/notdriver');
  }

  console.log('\n④ 옛 평문 옮기기 — 멱등 · 겹치면 안 옮김');
  {
    const S = st();
    const body = { action: 'migrateStaffPins', org: ORG,
                   staff: [{ staffId: 'st1', pin: '2222' }, { staffId: 'st2', pin: '3333' },
                           { staffId: 'st3', pin: '1111' },          /* 기사와 겹침 */
                           { staffId: 'st4', pin: '2222' },          /* 직원끼리 겹침 */
                           { staffId: 'st5', pin: 'ab' }] };         /* 모양 틀림 */
    const r = await adm(SRC.admin, S, body);
    ck('옮김 2 · 겹침 2 · 오류 1',
      [r.body.moved, r.body.dup, r.body.bad].join('/'), '2/2/1');
    ck('   st1·st2 만 해시로 들어갔다',
      [staffDoc(S, 'st1'), staffDoc(S, 'st2'), staffDoc(S, 'st3'), staffDoc(S, 'st4')]
        .map((x) => (x ? 'o' : 'x')).join(''), 'ooxx');
    const r2 = await adm(SRC.admin, S, body);
    ck('두 번 돌려도 같다(멱등)', [r2.body.moved, r2.body.dup, r2.body.bad].join('/'), '2/2/1');
  }

  console.log('\n⑤ 중복 확인(checkPinDup) — 기사 + 직원');
  {
    const S = st();
    await adm(SRC.admin, S, { action: 'setStaffPin', org: ORG, staffId: 'st1', pin: '2222' });
    const a = await adm(SRC.admin, S, { action: 'checkPinDup', org: ORG, pin: '1111' });
    ck('기사 PIN → dup/driver', a.body.dup + '/' + a.body.kind + '/' + a.body.carId, 'true/driver/car1');
    const b2 = await adm(SRC.admin, S, { action: 'checkPinDup', org: ORG, pin: '2222' });
    ck('직원 PIN → dup/staff', b2.body.dup + '/' + b2.body.kind + '/' + b2.body.staffId, 'true/staff/st1');
    const c = await adm(SRC.admin, S, { action: 'checkPinDup', org: ORG, pin: '2222', exceptStaffId: 'st1' });
    ck('자기 자신은 빼고 본다', c.body.dup, false);
    const d = await adm(SRC.admin, S, { action: 'checkPinDup', org: ORG, pin: '7777' });
    ck('안 겹치면 dup=false', d.body.dup, false);
    ck('응답에 해시가 없다', JSON.stringify(b2.body).indexOf(hashOf('2222', ORG)) < 0, true);
  }

  console.log('\n⑥ 동승 도우미 배정');
  {
    const S = st();
    await adm(SRC.admin, S, { action: 'setStaffPin', org: ORG, staffId: 'st1', pin: '2222' });
    const r0 = await adm(SRC.admin, S, { action: 'setCarHelper', org: ORG, carId: 'car1', staffId: 'st9' });
    ck('PIN 없는 직원은 못 고른다', r0.code + '/' + ((r0.body || {}).why || ''), '400/nopin');
    const r = await adm(SRC.admin, S, { action: 'setCarHelper', org: ORG, carId: 'car1', staffId: 'st1' });
    ck('배정 200', r.code, 200);
    const d1 = helperDoc(S, 'st1') || {};
    ck('   drivers/hlp_… 문서 모양',
      [d1.role, d1.staffId, d1.carId, d1.ownerUid].join('/'), 'helper/st1/car1/' + OWNER);
    /* 다른 차량으로 옮기기 */
    await adm(SRC.admin, S, { action: 'setCarHelper', org: ORG, carId: 'car2', staffId: 'st1' });
    ck('다른 차량으로 옮기면 carId 가 바뀐다', (helperDoc(S, 'st1') || {}).carId, 'car2');
    /* 떼기 */
    await adm(SRC.admin, S, { action: 'setCarHelper', org: ORG, carId: 'car2', staffId: '' });
    ck('「없음」으로 떼면 carId 가 빈다', JSON.stringify((helperDoc(S, 'st1') || {}).carId), '""');
  }

  console.log('\n⑦ 권한·이용 기간 (47 과 같은 길)');
  {
    const S = st(EXPIRED);
    const a = await adm(SRC.admin, S, { action: 'setStaffPin', org: ORG, staffId: 'st1', pin: '2222' });
    ck('기간 끝남 · setStaffPin → 403 expired', a.code + '/' + ((a.body || {}).why || ''), '403/expired');
    const b2 = await adm(SRC.admin, S, { action: 'setCarHelper', org: ORG, carId: 'car1', staffId: 'st1' });
    ck('기간 끝남 · setCarHelper → 403 expired', b2.code + '/' + ((b2.body || {}).why || ''), '403/expired');
    const c = await adm(SRC.admin, S, { action: 'setStaffPin', org: ORG, staffId: 'st1', pin: '2222' }, 'masterTok');
    ck('마스터는 통과', c.code, 200);
  }

  console.log('\n⑧ 글자 대조 — 새 환경변수 0 · PIN 을 로그에 안 적는다');
  {
    const fs = require('fs');
    const adm2 = fs.readFileSync('' + COS_ROOT + '/api/admin-account.js', 'utf8');
    const drv2 = fs.readFileSync('' + COS_ROOT + '/api/driver-auth.js', 'utf8');
    const envs = (adm2 + drv2).match(/process\.env\.[A-Z_]+/g) || [];
    ck('쓰는 환경변수 그대로', [...new Set(envs)].sort().join(','),
      'process.env.FIREBASE_SERVICE_ACCOUNT,process.env.OTP_SECRET');
    ck('해시 재료가 기사와 같다', /sha256\(String\(pin\) \+ '\|' \+ String\(org\) \+ '\|' \+ String\(secret\)\)/.test(adm2), true);
    ck('console.log 에 pin 을 안 넣는다', /console\.log\([^)]*\bpin\b/.test(adm2 + drv2), false);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 firebase-admin — 실제 쓰기 0 · 문자 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
