/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ① v253 — 인증번호 확인을 원자적으로 + 확인 빈도 제한 (v252 와 전/후 비교)
   ★ 가짜 Firestore 가 **낙관적 동시성**(읽은 판이 바뀌면 재시도)을 흉내 내도록 고쳐 뒀다.
     그게 없으면 트랜잭션으로 고친 코드와 안 고친 코드가 똑같이 보인다. */
const { SRC_NEW, makeState, makeHandler, req, res } = require('./otpenv.js');
const crypto = require('crypto');
/* ★ 이 회차의 「전」은 **v252 판**(edd2752) 으로 못 박는다 (v261 에서 넣음).
   otpenv 의 SRC_OLD 는 기본이 HEAD 라, 회차가 지나면 「전」이 새 코드가 되어
   v252 대조 칸이 전부 거짓으로 깨진다. 이 suite 는 v252↔v253 비교가 뜻이다. */
const SRC_OLD = require('child_process')
  .execSync('git -C ' + COS_ROOT + ' show edd2752:api/otp.js', { maxBuffer: 1 << 26 }).toString();

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + label.padEnd(56) + String(got).slice(0, 64)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const SECRET = 'SEKRIT-TEST';
const otpKeyOf = (digits, purpose) => 'otp/' + crypto.createHash('sha256').update(digits + purpose).digest('hex');
const liveDocs = (S) => Object.keys(S.docs).filter(k => /^otp\//.test(k) && !/^otp\/rl\./.test(k));

function base() {
  const S = makeState();
  S.tokens.masterTok = { uid: 'MASTER', firebase: { sign_in_provider: 'password' } };
  S.docs['admins/MASTER'] = { role: 'master' };
  S.authByEmail['01011112222@phone.cosroad.com'] = { uid: 'OWNER1', email: '01011112222@phone.cosroad.com' };
  S.docs['users/OWNER1'] = { orgId: 'academy_o1', approved: true, signupMethod: 'phone',
                             phone: '01011112222', contact: '01011112222' };
  return S;
}
/* 인증번호 문서를 손으로 심는다 — 보내기 빈도 제한을 쓰지 않고 확인만 재어 보려고 */
function seedCode(S, digits, purpose, code) {
  S.docs[otpKeyOf(digits, purpose)] = {
    codeHash: crypto.createHash('sha256').update(code + SECRET).digest('hex'),
    expiresAt: Date.now() + 300000, tries: 0, sentAt: [Date.now()]
  };
}
/* N 건을 **동시에** 던진다 (Promise.all — await 마다 서로 끼어든다) */
async function fire(SRC, S, bodies, tok, ip) {
  const h = makeHandler(SRC, S);
  return await Promise.all(bodies.map(b => {
    const s = res();
    return h(req(b, tok, ip), s).then(() => ({ code: s.code, msg: (s.body && s.body.message) || '', ok: !!(s.body && s.body.ok) }));
  }));
}
const tally = (rs) => {
  const t = {};
  rs.forEach(r => { const k = r.ok ? '성공' : (r.code + ' ' + r.msg.slice(0, 18)); t[k] = (t[k] || 0) + 1; });
  return t;
};
const show = (name, rs, S) => {
  console.log('      [' + name + '] ' + JSON.stringify(tally(rs), null, 0)
    + ' / 재시도 ' + (S.txRetries || 0) + '회 / 문서 ' + liveDocs(S).length + '개');
};

(async () => {
  console.log('════ 0. 검증 환경 대조 — 동시 요청이 실제로 끼어드는가 ════');
  {
    /* 가짜 Firestore 가 직렬로 돌면 아래 비교가 전부 무의미하다. 먼저 확인한다. */
    const S = base(); seedCode(S, '01011112222', 'reset', '111111');
    const rs = await fire(SRC_OLD, S, Array(4).fill(0).map(() => (
      { action: 'verify-reset', phone: '01011112222', code: '999999', newPassword: 'newpw123' })), null, '9.9.9.9');
    const d = S.docs[otpKeyOf('01011112222', 'reset')];
    ck('v252 에서 4건이 전부 tries=0 을 읽었나 (끼어듦 확인)', d && d.tries, 1);
    console.log('      → tries 가 4가 아니라 1 = 네 건이 같은 값을 읽고 각자 1로 올렸다(덮어씀)');
  }

  console.log('\n════ 1. 같은 인증번호에 틀린 코드 — 동시 6건 (빈도 제한 아래) ════');
  for (const [name, SRC] of [['v252 (전)', SRC_OLD], ['v253 (후)', SRC_NEW]]) {
    const S = base(); seedCode(S, '01011112222', 'reset', '111111');
    const rs = await fire(SRC, S, Array(6).fill(0).map(() => (
      { action: 'verify-reset', phone: '01011112222', code: '999999', newPassword: 'newpw123' })), null, '7.7.7.7');
    show(name, rs, S);
    const judged = rs.filter(r => /맞지 않아요/.test(r.msg)).length;
    const burned = rs.filter(r => /너무 여러 번/.test(r.msg)).length;
    const gone   = rs.filter(r => /만료/.test(r.msg)).length;
    if (SRC === SRC_OLD) {
      ck('   v252: 6건이 모두 「맞지 않아요」 판정을 받았나', judged, 6);
      ck('   v252: 인증번호가 아직 살아 있나 (끝없이 대입 가능)', liveDocs(S).length, 1);
      ck('   v252: 폐기 0건', burned, 0);
    } else {
      ck('   v253: 「맞지 않아요」 판정은 최대 5번', judged <= 5, true);
      ck('   v253: 폐기 1건', burned, 1);
      ck('   v253: 판정+폐기 합이 6 이하', judged + burned <= 6, true);
      ck('   v253: 인증번호 문서가 사라졌나', liveDocs(S).length, 0);
      ck('   v253: 나머지는 만료 응답', judged + burned + gone, 6);
      ck('   v253: 트랜잭션 충돌 재시도가 실제로 일어났나', (S.txRetries || 0) > 0, true);
    }
  }

  console.log('\n════ 2. 동시 20건 (지시문 숫자 — 빈도 제한까지 함께) ════');
  for (const [name, SRC] of [['v252 (전)', SRC_OLD], ['v253 (후)', SRC_NEW]]) {
    const S = base(); seedCode(S, '01011112222', 'reset', '111111');
    const rs = await fire(SRC, S, Array(20).fill(0).map(() => (
      { action: 'verify-reset', phone: '01011112222', code: '999999', newPassword: 'newpw123' })), null, '8.8.8.8');
    show(name, rs, S);
    const judged = rs.filter(r => /맞지 않아요/.test(r.msg)).length;
    const burned = rs.filter(r => /너무 여러 번/.test(r.msg)).length;
    const r429   = rs.filter(r => r.code === 429).length;
    if (SRC === SRC_OLD) {
      ck('   v252: 20건 모두 판정 (빈도 제한 없음)', judged, 20);
      ck('   v252: 429 0건', r429, 0);
      ck('   v252: 문서 살아 있음', liveDocs(S).length, 1);
    } else {
      /* ★ 빈도 제한은 **통과 건수가 한도를 넘지 않는 것**이 조건이다(fail-closed).
         동시 20건이 몰리면 제한 기록 트랜잭션도 충돌해 재시도하므로, 통과가 10보다
         **적어질 수는 있어도 많아질 수는 없다.** 적어지는 쪽은 안전한 방향이다.
         (정확히 10/11 경계는 아래 4장 직렬 시험에서 확인한다) */
      ck('   v253: 429 가 10건 이상 (통과가 한도를 안 넘음)', r429 >= 10, true);
      ck('   v253: 통과 건수 ≤ 10', 20 - r429 <= 10, true);
      ck('   v253: 「맞지 않아요」 판정은 최대 5번', judged <= 5, true);
      ck('   v253: 폐기 1건', burned, 1);
      ck('   v253: 문서 사라짐', liveDocs(S).length, 0);
      ck('   v253: 비밀번호 한 번도 안 바뀜',
        S.calls.filter(c => c[0] === 'updateUser').length, 0);
    }
  }

  console.log('\n════ 3. 맞는 코드를 동시 2건 — 한 번만 성공해야 한다 ════');
  for (const [name, SRC] of [['v252 (전)', SRC_OLD], ['v253 (후)', SRC_NEW]]) {
    const S = base(); seedCode(S, '01011112222', 'reset', '123456');
    const rs = await fire(SRC, S, [
      { action: 'verify-reset', phone: '01011112222', code: '123456', newPassword: 'aaaaaa1' },
      { action: 'verify-reset', phone: '01011112222', code: '123456', newPassword: 'bbbbbb2' }
    ], null, '6.6.6.6');
    show(name, rs, S);
    const okN = rs.filter(r => r.ok).length;
    const pwN = S.calls.filter(c => c[0] === 'updateUser').length;
    if (SRC === SRC_OLD) {
      ck('   v252: 둘 다 성공해 버렸나 (재사용 구멍)', okN, 2);
      ck('   v252: 비밀번호를 두 번 바꿨나', pwN, 2);
      console.log('      → 나중 요청의 비밀번호가 이김 = 어느 것이 적용됐는지 알 수 없다');
    } else {
      ck('   v253: 성공 1건만', okN, 1);
      ck('   v253: 비밀번호 변경 1회', pwN, 1);
      ck('   v253: 나머지는 만료 응답', rs.filter(r => /만료/.test(r.msg)).length, 1);
    }
  }

  console.log('\n════ 4. 확인 쪽 빈도 제한 (v253 신설) ════');
  {
    /* 번호 10분 10회 — 11회째 429. 코드를 안 심어 두면 「만료」가 먼저 나므로 심어 둔다 */
    const S = base(); seedCode(S, '01011112222', 'reset', '111111');
    const h = makeHandler(SRC_NEW, S);
    const outs = [];
    for (let i = 1; i <= 11; i++) {
      const s = res();
      await h(req({ action: 'verify-reset', phone: '01011112222', code: '999999', newPassword: 'newpw123' }, null, '5.5.5.' + i), s);
      outs.push(s.code + ' ' + ((s.body && s.body.message) || '').slice(0, 16));
    }
    console.log('      차례대로: ' + outs.map((o, i) => (i + 1) + ')' + o).join('  '));
    ck('번호 확인 11회째 → 429', outs[10].indexOf('429') === 0, true);
    ck('   문구', outs[10].indexOf('잠시 뒤 다시') > 0, true);
    ck('   1~10회째는 429 아님', outs.slice(0, 10).every(o => o.indexOf('429') !== 0), true);
  }
  {
    /* IP 10분 30회 — 31회째 429. 번호를 매번 바꿔 번호 제한을 피한다 */
    const S = base();
    const h = makeHandler(SRC_NEW, S);
    let last = '';
    for (let i = 1; i <= 31; i++) {
      const ph = '010' + String(10000000 + i);
      seedCode(S, ph, 'reset', '111111');
      const s = res();
      await h(req({ action: 'verify-reset', phone: ph, code: '999999', newPassword: 'newpw123' }, null, '4.4.4.4'), s);
      last = s.code + ' ' + ((s.body && s.body.message) || '').slice(0, 16);
      if (i === 30) ck('IP 확인 30회째는 통과', s.code, 400);
    }
    ck('IP 확인 31회째 → 429', last.indexOf('429') === 0, true);
  }
  {
    /* changePhone 에도 걸리나 */
    const S = base();
    const h = makeHandler(SRC_NEW, S);
    let last = 0;
    for (let i = 1; i <= 11; i++) {
      seedCode(S, '01077778888', 'changeNew', '111111');
      const s = res();
      await h(req({ action: 'changePhone', targetUid: 'OWNER1', newPhone: '01077778888', code: '999999' }, 'masterTok', '3.3.3.3'), s);
      last = s.code;
    }
    ck('changePhone 확인 11회째 → 429', last, 429);
    ck('   로그인 아이디는 한 번도 안 바뀜',
      S.calls.filter(c => c[0] === 'updateUser').length, 0);
  }
  {
    /* 보내기 제한과 **따로** 세는가 — 확인을 많이 해도 보내기는 막히지 않아야 한다 */
    const S = base(); seedCode(S, '01011112222', 'reset', '111111');
    const h = makeHandler(SRC_NEW, S);
    for (let i = 1; i <= 5; i++) {
      const s = res();
      await h(req({ action: 'verify-reset', phone: '01011112222', code: '999999', newPassword: 'newpw123' }, null, '2.2.2.2'), s);
    }
    const s2 = res();
    await h(req({ action: 'send', purpose: 'reset', phone: '01011112222' }, null, '2.2.2.2'), s2);
    ck('확인 5회 뒤에도 보내기는 된다 (기록이 따로)', s2.body.ok, true);
    const keys = Object.keys(S.docs).filter(k => /^otp\/rl\./.test(k)).map(k => k.split('.').slice(0, 2).join('.')).sort();
    ck('   빈도 기록 종류 4가지', JSON.stringify([...new Set(keys)]), '["otp/rl.i","otp/rl.p","otp/rl.v","otp/rl.vi"]');
  }

  console.log('\n════ 5. 요청자 IP 헤더 (Vercel 공식 문서 대조) ════');
  {
    const ipDocOf = (S) => Object.keys(S.docs).filter(k => /^otp\/rl\.i\./.test(k))[0] || '';
    const want = (ip) => 'otp/rl.i.' + crypto.createHash('sha256').update(ip).digest('hex');
    const hdr = async (headers) => {
      const S = base();
      const h = makeHandler(SRC_NEW, S);
      const s = res();
      await h({ method: 'POST', headers: Object.assign({ origin: 'https://cosroad.com' }, headers),
                socket: { remoteAddress: '0.0.0.0' },
                body: { action: 'send', purpose: 'reset', phone: '01011112222' } }, s);
      return ipDocOf(S);
    };
    ck('x-vercel-forwarded-for 를 가장 먼저 본다',
      await hdr({ 'x-vercel-forwarded-for': '1.1.1.1', 'x-forwarded-for': '2.2.2.2', 'x-real-ip': '3.3.3.3' }),
      want('1.1.1.1'));
    ck('없으면 x-forwarded-for',
      await hdr({ 'x-forwarded-for': '2.2.2.2', 'x-real-ip': '3.3.3.3' }), want('2.2.2.2'));
    ck('그다음 x-real-ip', await hdr({ 'x-real-ip': '3.3.3.3' }), want('3.3.3.3'));
    ck('아무것도 없으면 소켓 주소', await hdr({}), want('0.0.0.0'));
    ck('쉼표 목록이면 첫 값',
      await hdr({ 'x-vercel-forwarded-for': '5.5.5.5, 6.6.6.6, 7.7.7.7' }), want('5.5.5.5'));
    ck('공백이 섞여도 잘라낸다',
      await hdr({ 'x-forwarded-for': '  8.8.8.8 , 9.9.9.9 ' }), want('8.8.8.8'));
  }

  console.log('\n════ 6. 회귀 — 정상 흐름이 그대로인가 ════');
  {
    const S = base();
    const h = makeHandler(SRC_NEW, S);
    let s = res();
    await h(req({ action: 'send', purpose: 'reset', phone: '01011112222' }, null, '1.1.1.9'), s);
    ck('보내기 → 200', s.code, 200);
    const code = /인증번호 (\d{6}) /.exec(S.aligo[0].form.msg)[1];
    s = res();
    await h(req({ action: 'verify-reset', phone: '01011112222', code: code, newPassword: 'newpw123' }, null, '1.1.1.9'), s);
    ck('재설정 → 200', s.code, 200);
    ck('   응답', JSON.stringify(s.body), '{"ok":true}');
    const up = S.calls.find(c => c[0] === 'updateUser');
    ck('   password 하나만 바꿈', Object.keys(up[2]).join(','), 'password');
    ck('   세션 끊기 1회', S.calls.filter(c => c[0] === 'revokeRefreshTokens').length, 1);
    ck('   문서 지워짐', liveDocs(S).length, 0);
  }
  {
    const S = base();
    const h = makeHandler(SRC_NEW, S);
    let s = res();
    await h(req({ action: 'send', purpose: 'changeNew', phone: '01077778888' }, 'masterTok', '1.1.1.8'), s);
    ck('마스터 changeNew 보내기 → 200', s.code, 200);
    const code = /인증번호 (\d{6}) /.exec(S.aligo[0].form.msg)[1];
    s = res();
    await h(req({ action: 'changePhone', targetUid: 'OWNER1', newPhone: '01077778888', code: code }, 'masterTok', '1.1.1.8'), s);
    ck('번호 교체 → 200', s.code, 200);
    ck('   응답', JSON.stringify(s.body), '{"ok":true,"loginPhone":"01077778888"}');
    ck('   users.phone', S.docs['users/OWNER1'].phone, '01077778888');
    ck('   문서 지워짐', liveDocs(S).length, 0);
  }
  {
    /* 틀린 코드 5회 → 6회째 폐기 (직렬일 때도 v252 와 같은 문구) */
    const S = base(); seedCode(S, '01011112222', 'reset', '123456');
    const h = makeHandler(SRC_NEW, S);
    const msgs = [];
    for (let i = 1; i <= 6; i++) {
      const s = res();
      await h(req({ action: 'verify-reset', phone: '01011112222', code: '999999', newPassword: 'newpw123' }, null, '1.1.1.7'), s);
      msgs.push(s.body.message);
    }
    ck('1회 틀림 문구 (v252 와 같음)', msgs[0], '인증번호가 맞지 않아요. (5번 더 넣을 수 있어요)');
    ck('5회 틀림 문구', msgs[4], '인증번호가 맞지 않아요. (1번 더 넣을 수 있어요)');
    ck('6회째 폐기 문구', msgs[5], '인증번호를 너무 여러 번 틀렸어요. 다시 받아 주세요.');
    ck('   문서 지워짐', liveDocs(S).length, 0);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
})().catch(e => { console.log('오류: ' + e.message); console.log(e.stack.split('\n').slice(0, 6).join('\n')); });
