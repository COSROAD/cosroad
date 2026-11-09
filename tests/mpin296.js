/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드60-B4a — **«회원» 출석 PIN 도 서버 해시**(v296).
   v295 까지 «회원» PIN 은 업체 자료 안에 **평문**(`data/members[].pin`)이었다 —
   ① 관리자 화면에 「PIN: 1234」로 **그대로 보였고** ② 60-B4b 의 출석 전용 기기는 명단을
   받지 않으므로 평문 대조를 할 수 없다. 직원 PIN(v280)과 **같은 길**로 옮긴다.
   보는 것: ① 옛 판에서 평문이 화면에 보이나(재현) ② 새 판은 「PIN 설정됨」만
            ③ 서버 창구 셋(set·remove·migrate) ④ `checkPinDup` 이 **셋**을 보나
            ⑤ `punchMember` 가 **해시로** 대조하나(평문은 아직 안 옮긴 업체만)
            ⑥ 옮기기는 **성공했을 때만** 평문을 비우나
   가짜 firebase-admin · 실제 쓰기 0 · 문자 0. */
const crypto = require('crypto');
const cp = require('child_process');
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;
const EA = require('./env246.js');
const fs = require('fs');
const OLD_REF = process.env.COS_SRC_OLD_REF || 'd1d2b2c';   /* v295 — 고치기 전 */
const NEW_SRC = fs.readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 46)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const SECRET = 'SEKRIT-TEST';
const ORG = 'academy_owner1', OWNER = 'OWNER1';
const DAY = 86400000, NOW = Date.UTC(2026, 9, 31, 11, 20, 0);
const hashOf = (pin) => sha(pin + '|' + ORG + '|' + SECRET);
const D7 = ['월', '화', '수', '목', '금', '토', '일'];
const mk = (o) => Object.assign({ carId: 'car1', courseId: 'c1', days: D7, location: '인천',
  lat: 37.41, lon: 126.68, phone: '010-1', note: '' }, o);
const MEM = [mk({ id: 1, name: '가하은', pin: '1111' }), mk({ id: 2, name: '나다움', pin: '2222' })];

function st(over) {
  over = over || {};
  const S = makeState({ now: NOW });
  S.docs['users/' + OWNER] = { orgId: ORG, approved: true, withdrawn: false,
    paidUntil: over.expired ? NOW - DAY : NOW + 30 * DAY, plan: 'paid' };
  S.docs['orgs/' + ORG + '/data/members'] = { value: JSON.stringify(over.members || MEM), updatedAt: 1 };
  if (over.driverPin) S.docs['driverPins/' + ORG + '_car1'] = { org: ORG, carId: 'car1', pinHash: hashOf(over.driverPin), updatedAt: 1 };
  if (over.staffPin)  S.docs['staffPins/' + ORG + '_st1']  = { org: ORG, staffId: 'st1', pinHash: hashOf(over.staffPin), updatedAt: 1 };
  if (over.memberPin) S.docs['memberPins/' + ORG + '_1']   = { org: ORG, memberId: '1', pinHash: hashOf(over.memberPin), updatedAt: 1 };
  S.tokens = { ownerTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } } };
  return S;
}
const adm = (S, body) => call(SRC.admin, S, body, 'ownerTok', '1.2.3.4');
const pad = (S, body) => call(SRC.drv, S, Object.assign({ action: 'pinCheckin', org: ORG }, body), 'ownerTok', '1.2.3.4');
const mpin = (S, id) => S.docs['memberPins/' + ORG + '_' + id] || null;

/* 화면 쪽(env246) — 명단 카드·수정 창의 PIN 표시 */
function app(src, mem) {
  const R = EA.build({ src: src, biz: 'academy',
    localStorage: { 'tkd_members__B': JSON.stringify(mem),
                    'tkd_cars__B': JSON.stringify([{ id: 'car1', name: '1호차' }]),
                    'tkd_courses__B': JSON.stringify([{ id: 'c1', name: 'A반', depart: '15:00' }]) } });
  if (R.error) throw R.error;
  /* ★ 수정 창은 칸이 많다(`populateSelects` 가 select 들을 채운다) — 소스의 **id 전수**를
     가짜로 깔아 둔다(하나씩 적으면 창이 열리다 멈춘다 · 처음에 그렇게 깨졌다). */
  const ids = new Set(['admin-content', 'app-content', 'member-list', 'admin-search', 'mem-mig-msg']);
  (src.match(/id="[a-zA-Z0-9_-]+"/g) || []).forEach((x) => ids.add(x.slice(4, -1)));
  ids.forEach((id) => { const el = EA.makeEl('div'); el.id = id; R.byId[id] = el; });
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userUid='uB';"
     + " window._userBizType='academy'; window._userPaidUntil=Date.now()+1e9; _firstSyncOk=true;");
  R.ev('members = loadMembers();');
  return R;
}

(async () => {
  console.log('════ ① 재현 — 옛 판은 **평문 PIN 이 화면에 보인다**');
  {
    const O = app(OLD_SRC, MEM);
    const h0 = String(O.ev('renderAdminMembers()'));
    ck('[옛] 명단에 「PIN: 1111」이 보인다', /PIN: 1111/.test(h0), true);
    const N = app(NEW_SRC, [mk({ id: 1, name: '가하은', hasPin: true }), mk({ id: 2, name: '나다움' })]);
    const h1 = String(N.ev('renderAdminMembers()'));
    ck('★ [새] 「PIN 설정됨」만 보인다', /PIN 설정됨/.test(h1), true);
    ck('★ [새] 네 자리 숫자가 안 보인다', /PIN: ?\d{4}/.test(h1), false);
    ck('  PIN 없는 사람은 「PIN 미설정」', /PIN 미설정/.test(h1), true);
    /* 수정 창에도 원문을 되돌려 넣지 않는다 */
    /* 가짜 DOM 에는 `classList` 가 없어 창 띄우는 마지막 줄에서 멈춘다 — PIN 칸까지는 채워진다 */
    N.ev("try{ openEditModal(1); }catch(e){}");
    ck('★ 수정 창 PIN 칸이 **비어 있다**', JSON.stringify(N.byId['m-pin'].value || ''), '""');
    ck('  「설정됨」 안내가 뜬다', /서버에만 보관/.test(String(N.byId['m-pin-note'].textContent || '')), true);
  }

  console.log('\n════ ② 서버 창구 — set · remove');
  {
    const S = st();
    const r = await adm(S, { action: 'setMemberPin', org: ORG, memberId: '1', pin: '1111' });
    ck('setMemberPin → 200', r.code, 200);
    ck('★ 해시가 저장됐다', (mpin(S, '1') || {}).pinHash, hashOf('1111'));
    ck('★ 응답에 PIN·해시가 없다', /1111|[0-9a-f]{64}/.test(JSON.stringify(r.body)), false);
    const r2 = await adm(S, { action: 'removeMemberPin', org: ORG, memberId: '1' });
    ck('removeMemberPin → 200', r2.code, 200);
    ck('  문서가 사라졌다', String(mpin(S, '1')), 'null');
    /* 겹침 — 기사·직원·다른 «회원» 셋 */
    const S2 = st({ driverPin: '1234' });
    const r3 = await adm(S2, { action: 'setMemberPin', org: ORG, memberId: '1', pin: '1234' });
    ck('★ 기사 PIN 과 겹치면 409', r3.code, 409);
    const S3 = st({ staffPin: '5678' });
    const r4 = await adm(S3, { action: 'setMemberPin', org: ORG, memberId: '1', pin: '5678' });
    ck('★ 직원 PIN 과 겹치면 409', r4.code, 409);
    const S4 = st({ memberPin: '1111' });
    const r5 = await adm(S4, { action: 'setMemberPin', org: ORG, memberId: '2', pin: '1111' });
    ck('★ 다른 «회원» 과 겹치면 409', r5.code, 409);
    const r6 = await adm(S4, { action: 'setMemberPin', org: ORG, memberId: '1', pin: '1111' });
    ck('  자기 것 다시 저장은 200', r6.code, 200);
    /* 기간 끝난 업체는 쓰기 금지(읽기만) */
    const S5 = st({ expired: true });
    const r7 = await adm(S5, { action: 'setMemberPin', org: ORG, memberId: '1', pin: '1111' });
    ck('★ 기간 끝난 업체는 403 expired', r7.code + '/' + ((r7.body || {}).why || ''), '403/expired');
  }

  console.log('\n════ ③ `checkPinDup` 이 **셋**(기사·직원·«회원»)을 본다');
  {
    const S = st({ driverPin: '1234', staffPin: '5678', memberPin: '1111' });
    const a = await adm(S, { action: 'checkPinDup', org: ORG, pin: '1234' });
    ck('기사', (a.body || {}).kind, 'driver');
    const b = await adm(S, { action: 'checkPinDup', org: ORG, pin: '5678' });
    ck('직원', (b.body || {}).kind, 'staff');
    const c = await adm(S, { action: 'checkPinDup', org: ORG, pin: '1111' });
    ck('★ «회원»', (c.body || {}).kind, 'member');
    ck('  누구인지(«회원» id)만 준다', (c.body || {}).memberId, '1');
    const d = await adm(S, { action: 'checkPinDup', org: ORG, pin: '1111', exceptMemberId: '1' });
    ck('★ 자기 자신은 빼고 본다', (d.body || {}).dup, false);
    const e = await adm(S, { action: 'checkPinDup', org: ORG, pin: '9999' });
    ck('  없는 PIN', (e.body || {}).dup, false);
    ck('  응답에 해시가 없다', /[0-9a-f]{64}/.test(JSON.stringify(c.body)), false);
  }

  console.log('\n════ ④ `punchMember` — **해시로** 대조한다');
  {
    /* 옮긴 업체: 명단에 평문이 없고 `memberPins` 만 있다 */
    const S = st({ members: [mk({ id: 1, name: '가하은', hasPin: true })], memberPin: '1111' });
    const r = await pad(S, { pin: '1111', member: true });
    ck('★ 해시로 찾아 출석을 찍는다', r.code + '/' + ((r.body || {}).kind || ''), '200/member');
    ck('  이름을 돌려준다', (r.body || {}).name, '가하은');
    const att = JSON.parse((S.docs['orgs/' + ORG + '/data/attendance'] || {}).value || '{}');
    ck('  그 칸만 찍혔다', JSON.stringify(att['2026-10-31'] || null), '{"1":"present"}');
    const r2 = await pad(S, { pin: '9999', member: true });
    ck('  틀린 PIN 은 404 nomember', r2.code + '/' + ((r2.body || {}).why || ''), '404/nomember');
    /* 아직 안 옮긴 업체: 평문으로도 찾아 준다(옮기기 전에도 출석이 된다) */
    const S2 = st();
    const r3 = await pad(S2, { pin: '2222', member: true });
    ck('★ 안 옮긴 업체는 평문으로도 찍힌다', r3.code + '/' + ((r3.body || {}).name || ''), '200/나다움');
  }

  console.log('\n════ ⑤ 옮기기 — 성공한 것만 평문을 비운다');
  {
    const S = st();
    const r = await adm(S, { action: 'migrateMemberPins', org: ORG,
      members: [{ memberId: '1', pin: '1111' }, { memberId: '2', pin: '2222' }] });
    ck('migrateMemberPins → 200', r.code, 200);
    ck('★ 둘 다 옮겼다', (r.body || {}).moved, 2);
    ck('  해시가 들어갔다', (mpin(S, '2') || {}).pinHash, hashOf('2222'));
    /* 기사와 겹치는 것은 **안 옮긴다** */
    const S2 = st({ driverPin: '1111' });
    const r2 = await adm(S2, { action: 'migrateMemberPins', org: ORG,
      members: [{ memberId: '1', pin: '1111' }, { memberId: '2', pin: '2222' }] });
    ck('★ 기사와 겹친 것은 겹침으로 센다', (r2.body || {}).moved + '/' + (r2.body || {}).dup, '1/1');
    ck('  겹친 것은 문서가 없다', String(mpin(S2, '1')), 'null');
    /* 앱 쪽 — 겹침이 있으면 **평문을 그대로 둔다** */
    const N = app(NEW_SRC, MEM);
    N.sandbox.driverAcctApi = N.win.driverAcctApi = async () => ({ ok: true, moved: 1, dup: 1, bad: 0 });
    await N.ev('memberMigrateRun()');
    ck('★ 겹침이 있으면 평문을 **안 비운다**',
      N.ev("String((loadMembers().filter(function(m){return m.pin;})||[]).length)"), '2');
    const N2 = app(NEW_SRC, MEM);
    N2.sandbox.driverAcctApi = N2.win.driverAcctApi = async () => ({ ok: true, moved: 2, dup: 0, bad: 0 });
    await N2.ev('memberMigrateRun()');
    ck('★ 다 옮겼으면 평문을 비우고 `hasPin` 만 남는다',
      N2.ev("JSON.stringify(loadMembers().map(function(m){ return (m.pin||'')+'/'+(m.hasPin===true); }))"),
      '["/true","/true"]');
    const N3 = app(NEW_SRC, MEM);
    N3.sandbox.driverAcctApi = N3.win.driverAcctApi = async () => ({ ok: false, message: '안 돼요' });
    await N3.ev('memberMigrateRun()');
    ck('★ 실패하면 평문을 그대로 둔다',
      N3.ev("String((loadMembers().filter(function(m){return m.pin;})||[]).length)"), '2');
  }

  console.log('\n════ ⑥ 소스 전수 — 평문을 새로 만들지 않나');
  {
    ck('★ 저장할 때 `pin` 을 앱 자료에 넣지 않는다',
      /obj\.hasPin = true;\s*\n\s*delete obj\.pin;/.test(NEW_SRC), true);
    ck('  명단 카드 두 곳이 「설정됨」', (NEW_SRC.match(/memberHasPin\(m\)\?'PIN 설정됨'/g) || []).length, 2);
    ck('  «출결» 화면도', /memberHasPin\(m\)\?' · PIN 설정됨'/.test(NEW_SRC), true);
    ck('  (대조) 옛 판은 원문을 그렸다', (OLD_SRC.match(/'PIN: '\+m\.pin/g) || []).length, 2);
    ck('★ 엑셀 가져오기도 옮긴다', /action:'migrateMemberPins'/.test(NEW_SRC), true);
    ck('  옮기기 단추가 명단 위에 있다', /onclick="memberMigrateRun\(\)"/.test(NEW_SRC), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  process.exit(fail ? 1 : 0);
})();
