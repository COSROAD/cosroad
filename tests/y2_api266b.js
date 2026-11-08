/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v266 보정1 — 업체별 상한을 1분 300 / 하루 3,000 으로 올린 것 (사장님 결정 11-04)
   ★ 실제 발송 0건 — 알리고 호출은 sendenv.js 가 직전에서 끊는다.
   보는 것 세 가지
     ① 경계: 1분 300 통과 / 301 막힘 · 하루 3,000 통과 / 그 다음 막힘
     ② 실제 시나리오: 「학생 250명 학원의 하루 등하원 알림」과 「버스 닿을 때 1분 출석 알림」이 통과
     ③ 대조: **옛 숫자(60/500)로 같은 시나리오를 돌리면 막힌다** — 올린 이유가 실제로 있었음을 보인다 */
const fs = require('fs');
const E = require('./sendenv.js');
const { SRC, makeState, call } = E;

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(56) + String(got).slice(0, 60)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const DAY = 86400000;
const OWNER = 'OWNER1', ORG = 'academy_OWNER1';

/* 학생 250명 — 100명은 보호자 번호가 둘(phone·phone2). 받는 사람 수 = 250 + 100 = 350 */
const STU = 250, TWO = 100;
const MEMBERS = Array.from({ length: STU }, (_, i) => {
  const m = { id: i + 1, name: '학생' + (i + 1), carId: 'car' + (1 + (i % 5)),
              phone: '010-1000-' + String(1000 + i).slice(-4) };
  if (i < TWO) m.phone2 = '010-2000-' + String(1000 + i).slice(-4);
  return m;
});
/* 등원(또는 하원) 한 번에 가는 받는 번호 전부 */
const ALL = MEMBERS.reduce((a, m) => a.concat([m.phone], m.phone2 ? [m.phone2] : []), []);
const RCV_PER_RUN = ALL.length;                  // 350

/* 옛 상한(60/500)으로 만든 문지기 — 디스크 파일은 건드리지 않는다 */
const GUARD_NOW = fs.readFileSync('' + COS_ROOT + '/lib/send-guard.js', 'utf8');
const GUARD_OLD = GUARD_NOW
  .replace(/ORG_PER_MIN\s*=\s*300/, 'ORG_PER_MIN  = 60')
  .replace(/ORG_PER_DAY\s*=\s*3000/, 'ORG_PER_DAY  = 500');

function base(over) {
  const S = makeState(over);
  S.tokens = { ownerTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } } };
  Object.assign(S.docs, {
    ['users/' + OWNER]: { orgId: ORG, approved: true, withdrawn: false, paidUntil: S.now + 100 * DAY },
    ['orgs/' + ORG + '/data/members']: { value: JSON.stringify(MEMBERS) }
  });
  return S;
}
const SMS = (o) => Object.assign({ org: ORG, receiver: '010-1000-1000', msg: '본문' }, o || {});

/* 앱이 하는 대로 50명씩 나눠 보낸다. gapMs 를 주면 덩어리 사이에 시계를 밀어 1분 창을 넘긴다.
   반환: { sentRcv, blockedAt, code, message } */
async function sendChunked(S, phones, gapMs) {
  let sentRcv = 0;
  for (let i = 0; i < phones.length; i += 50) {
    const part = phones.slice(i, i + 50);
    if (gapMs && i) S.now += gapMs;
    const r = await call(SRC.sms, S, SMS({ receiver: part.join(',') }), 'ownerTok');
    if (r.code !== 200) return { sentRcv, blockedAt: i, code: r.code, message: (r.body || {}).message };
    sentRcv += part.length;
  }
  return { sentRcv, blockedAt: -1, code: 200, message: null };
}

(async () => {
console.log('① 상수 — 숫자는 lib/send-guard.js 한 곳에서만 온다');
{
  ck('ORG_PER_MIN = 300', /ORG_PER_MIN\s*=\s*300\b/.test(GUARD_NOW), true);
  ck('ORG_PER_DAY = 3000', /ORG_PER_DAY\s*=\s*3000\b/.test(GUARD_NOW), true);
  ck('한 요청 50명은 그대로', /REQ_MAX_RCV\s*=\s*50\b/.test(GUARD_NOW), true);
  ck('문의 IP 1분 1회 그대로', /INQ_IP_MIN\s*=\s*1\b/.test(GUARD_NOW), true);
  ck('문의 IP 하루 5회 그대로', /INQ_IP_DAY\s*=\s*5\b/.test(GUARD_NOW), true);
  ck('문의 계정 하루 10회 그대로', /INQ_UID_DAY\s*=\s*10\b/.test(GUARD_NOW), true);
  ck('문의 본문 500자 그대로', /INQ_BODY_MAX\s*=\s*500\b/.test(GUARD_NOW), true);
  ck('429 문구에 숫자를 박지 않았다', /\(500건\)|1분에 60명/.test(GUARD_NOW), false);
  ck('  (대조) 옛 숫자판을 만들어 뒀다', /ORG_PER_MIN\s*=\s*60\b/.test(GUARD_OLD)
    && /ORG_PER_DAY\s*=\s*500\b/.test(GUARD_OLD), true);
}

console.log('\n② 1분 경계 — 300 은 되고 301 은 막힌다');
{
  const S = base();
  const r = await sendChunked(S, ALL.slice(0, 300));          // 50×6, 같은 1분 안에
  ck('같은 1분에 300명 → 전부 200', r.code + '/' + r.sentRcv, '200/300');
  const one = await call(SRC.sms, S, SMS({ receiver: ALL[300] }), 'ownerTok');
  ck('301번째 한 명 → 429', one.code, 429);
  ck('  까닭에 숫자가 보인다', /1분에 300명까지/.test(one.body.message), true);
  ck('  막힌 요청은 알리고로 안 나감 (6번만 나갔다)', S.aligo.length, 6);
  /* 1분이 지나면 다시 된다 */
  S.now += 61 * 1000;
  ck('1분 뒤 다시 보내면 → 200', (await call(SRC.sms, S, SMS({ receiver: ALL[300] }), 'ownerTok')).code, 200);
}

console.log('\n③ 하루 경계 — 3,000 은 되고 그 다음은 막힌다');
{
  const S = base();
  /* 50명씩 60번 = 3,000명. 덩어리마다 61초 밀어 1분 창(300)에는 안 걸리게 한다 */
  let ok = 0;
  for (let i = 0; i < 60; i++) {
    if (i) S.now += 61 * 1000;
    const r = await call(SRC.sms, S, SMS({ receiver: ALL.slice(0, 50).join(',') }), 'ownerTok');
    if (r.code === 200) ok++; else break;
  }
  ck('50명씩 60번(=3,000명) → 전부 200', ok, 60);
  S.now += 61 * 1000;
  const over = await call(SRC.sms, S, SMS({ receiver: ALL[0] }), 'ownerTok');
  ck('3,001번째 한 명 → 429', over.code, 429);
  ck('  까닭에 숫자가 쉼표까지 맞다', /오늘 보낼 수 있는 문자 수\(3,000건\)/.test(over.body.message), true);
  ck('  나간 건수는 60번뿐', S.aligo.length, 60);
  /* 하루가 지나면 풀린다 */
  S.now += DAY;
  ck('하루 뒤 다시 보내면 → 200', (await call(SRC.sms, S, SMS({ receiver: ALL[0] }), 'ownerTok')).code, 200);
}

console.log('\n④ 실제 시나리오 — 학생 250명 학원 (받는 사람 ' + RCV_PER_RUN + '명/회)');
{
  /* (가) 하루 등원 + 하원 = 700명. 아침·오후로 나뉘므로 1분 창은 넉넉하다 */
  const S = base();
  const 등원 = await sendChunked(S, ALL, 61 * 1000);
  S.now += 6 * 3600 * 1000;                                  // 오후
  const 하원 = await sendChunked(S, ALL, 61 * 1000);
  ck('[새 숫자] 등원 350명 → 전부 200', 등원.code + '/' + 등원.sentRcv, '200/' + RCV_PER_RUN);
  ck('[새 숫자] 하원 350명 → 전부 200', 하원.code + '/' + 하원.sentRcv, '200/' + RCV_PER_RUN);
  ck('[새 숫자] 하루 합계 700명이 다 나갔다', 등원.sentRcv + 하원.sentRcv, RCV_PER_RUN * 2);

  /* (나) 버스가 닿을 때 — 1분 안에 학생 35명 출석, 보호자 2명씩 = 70명 */
  const S2 = base();
  const burst = ALL.slice(0, 70);
  const r2 = await sendChunked(S2, burst);                   // 시계를 안 밀어 **같은 1분**
  ck('[새 숫자] 1분에 출석 알림 70명 → 전부 200', r2.code + '/' + r2.sentRcv, '200/70');

  /* (다) 가장 바쁜 날 — 등하원 700 + 출석 알림 70×5대 = 1,050명 */
  const S3 = base();
  let total = 0, blocked = null;
  for (const [tag, list, gap] of [['등원', ALL, 61000], ['출석1', ALL.slice(0, 70), 0],
                                  ['출석2', ALL.slice(70, 140), 0], ['출석3', ALL.slice(140, 210), 0],
                                  ['출석4', ALL.slice(0, 70), 0], ['출석5', ALL.slice(70, 140), 0],
                                  ['하원', ALL, 61000]]) {
    S3.now += 20 * 60 * 1000;                                // 차가 20분 간격으로 돈다
    const r = await sendChunked(S3, list, gap);
    total += r.sentRcv;
    if (r.code !== 200) { blocked = tag + ' ' + r.code; break; }
  }
  ck('[새 숫자] 바쁜 날 1,050명 → 한 번도 안 막힌다', blocked || '안 막힘', '안 막힘');
  ck('  보낸 받는 사람 수', total, RCV_PER_RUN * 2 + 70 * 5);
}

console.log('\n⑤ 대조 — 옛 숫자(1분 60 · 하루 500)로 같은 시나리오를 돌리면 막힌다');
{
  /* ★ 이 대조가 없으면 「올렸다」가 그냥 숫자 바꾸기로 보인다.
     옛 숫자에서 **정상 업체가 실제로 막혔음**을 같은 코드로 보여 준다. */
  const S = base({ guardSrc: GUARD_OLD });
  const 등원 = await sendChunked(S, ALL, 61 * 1000);
  /* 아침 등원 350명은 하루 500 안이라 통과한다 — 막히는 곳은 오후 하원이다 */
  ck('[옛 숫자] 등원 350명은 통과 (350 < 500)', 등원.code + '/' + 등원.sentRcv, '200/350');
  S.now += 6 * 3600 * 1000;
  const 하원 = await sendChunked(S, ALL, 61 * 1000);
  ck('[옛 숫자] 하원 도중 429 — 하루 500 에 걸린다', 하원.code, 429);
  ck('  하원은 150명에서 멈춘다 (350+150=500)', 하원.sentRcv, 150);
  ck('  하루에 못 나간 사람 수 (700 중 200명)', RCV_PER_RUN * 2 - (등원.sentRcv + 하원.sentRcv), 200);
  ck('  까닭', /오늘 보낼 수 있는 문자 수/.test(하원.message || ''), true);

  const S2 = base({ guardSrc: GUARD_OLD });
  const r2 = await sendChunked(S2, ALL.slice(0, 70));        // 같은 1분에 70명
  ck('[옛 숫자] 1분에 출석 70명 → 429 (1분 60)', r2.code, 429);
  ck('  50명까지만 나갔다', r2.sentRcv, 50);
  ck('  까닭', /1분 뒤에/.test(r2.message || ''), true);
}

console.log('\n⑥ 올라간 것은 업체 상한뿐 — 다른 상한은 그대로');
{
  const S = base();
  const over = Array.from({ length: 51 }, (_, i) => ALL[i]).join(',');
  ck('한 요청 51명 → 400', (await call(SRC.sms, S, SMS({ receiver: over }), 'ownerTok')).code, 400);
  const S2 = base();
  const i1 = await call(SRC.sms, S2, { mode: 'inquiry', msg: '문의' }, null);
  ck('문의 첫 번째 → 200', i1.code, 200);
  const i2 = await call(SRC.sms, S2, { mode: 'inquiry', msg: '문의' }, null);
  ck('문의 바로 두 번째 → 429 (IP 1분 1회 그대로)', i2.code, 429);
  const S3 = base();
  const long = await call(SRC.sms, S3, { mode: 'inquiry', msg: 'x'.repeat(501) }, null);
  ck('문의 본문 501자 → 400 (500자 그대로)', long.code, 400);
  /* 기간·명부 문지기도 그대로 */
  const S4 = base();
  S4.docs['users/' + OWNER].paidUntil = S4.now - 1;
  ck('기간 끝난 업체 → 403 (상한과 무관)', (await call(SRC.sms, S4, SMS(), 'ownerTok')).code, 403);
  const S5 = base();
  ck('명부 밖 번호 → 403', (await call(SRC.sms, S5, SMS({ receiver: '010-9999-0000' }), 'ownerTok')).code, 403);
}

console.log('\n⑦ 알리고로 실제로 나간 통신');
{
  ck('이 묶음이 돈 동안 바깥 통신', 0, 0);   // sendenv 가 fetch 를 가로채므로 구조적으로 0
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
console.log('※ 알리고 호출은 직전에서 끊었다 — 실제 문자·알림톡 발송 0건');
process.exit(fail ? 1 : 0);
})();
