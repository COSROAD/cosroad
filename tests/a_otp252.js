/* ① api/otp.js — 보내기·재설정·번호 바꾸기 전체 분기 (v252) */
const { SRC_NEW, makeState, makeHandler, req, res } = require('./otpenv.js');
const crypto = require('crypto');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + label.padEnd(56) + String(got).slice(0, 70)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

/* 테스트 안에서 「문자로 받은 코드」를 알아내는 길 — 알리고로 나간 본문에서 꺼낸다.
   (실서비스에서는 아무도 이걸 볼 수 없다. 서버가 코드를 저장하지 않기 때문) */
const codeFromSms = (S) => {
  const m = /인증번호 (\d{6}) /.exec((S.aligo[S.aligo.length - 1] || { form: {} }).form.msg || '');
  return m ? m[1] : null;
};

function base() {
  const S = makeState();
  S.tokens.masterTok = { uid: 'MASTER', firebase: { sign_in_provider: 'password' } };
  S.tokens.ownerTok  = { uid: 'OWNER1', firebase: { sign_in_provider: 'password' } };
  S.tokens.anonTok   = { uid: 'ANON',   firebase: { sign_in_provider: 'anonymous' } };
  S.docs['admins/MASTER'] = { role: 'master' };
  /* 휴대폰 가입 업체 — 01011112222 */
  S.authByEmail['01011112222@phone.cosroad.com'] = { uid: 'OWNER1', email: '01011112222@phone.cosroad.com' };
  S.docs['users/OWNER1'] = { orgId: 'academy_o1', approved: true, signupMethod: 'phone',
                             phone: '01011112222', contact: '01011112222', orgName: '코스로드학원' };
  /* 이메일 가입 업체 */
  S.authByEmail['boss@x.com'] = { uid: 'OWNER2', email: 'boss@x.com' };
  S.docs['users/OWNER2'] = { orgId: 'public_o2', approved: true, signupMethod: 'email', email: 'boss@x.com' };
  /* 기사 계정 — 01033334444 */
  S.authByEmail['01033334444@phone.cosroad.com'] = { uid: 'DRV1', email: '01033334444@phone.cosroad.com' };
  S.docs['users/DRV1'] = { role: 'driver', driverOrg: 'academy_o1', ownerUid: 'OWNER1', phone: '01033334444' };
  /* 탈퇴 계정 — 01055556666 */
  S.authByEmail['01055556666@phone.cosroad.com'] = { uid: 'WDR1', email: '01055556666@phone.cosroad.com' };
  S.docs['users/WDR1'] = { orgId: 'logistics_o3', approved: true, signupMethod: 'phone', withdrawn: true };
  return S;
}
async function call(S, body, tok, ip) {
  const h = makeHandler(SRC_NEW, S);
  const s = res();
  await h(req(body, tok, ip), s);
  return s;
}

(async () => {
  console.log('════ 1. 문 앞 검사 (출처·메서드·환경변수) ════');
  {
    const S = base(); const h = makeHandler(SRC_NEW, S);
    let s = res(); await h({ method: 'GET', headers: { origin: 'https://cosroad.com' } }, s);
    ck('GET → 405', s.code, 405);
    s = res(); await h({ method: 'OPTIONS', headers: { origin: 'https://cosroad.com' }, body: {} }, s);
    ck('OPTIONS → 200 (프리플라이트)', s.code, 200);
    s = res(); await h({ method: 'POST', headers: {}, body: { action: 'send' } }, s);
    ck('출처 없음(curl) → 403', s.code, 403);
    ck('   문자 안 나감', S.aligo.length, 0);
    s = res(); await h({ method: 'POST', headers: { origin: 'https://evil.example' }, body: { action: 'send' } }, s);
    ck('엉뚱한 출처 → 403', s.code, 403);
  }
  {
    const S = base(); delete S.env.OTP_SECRET;
    const s = await call(S, { action: 'send', purpose: 'reset', phone: '01011112222' });
    ck('OTP_SECRET 없음 → 500 (약하게 돌지 않고 멈춘다)', s.code, 500);
    ck('   문자 안 나감', S.aligo.length, 0);
  }
  {
    const S = base(); delete S.env.FIREBASE_SERVICE_ACCOUNT;
    /* getApps()가 [1] 을 돌려주는 가짜라 admin() 은 통과한다 — 실제 환경과 다르므로
       여기서는 "키 없음 문구가 코드에 있나"만 본문 검사로 따로 확인한다 */
    ck('서비스 계정 없음 문구가 코드에 있나',
      /서버에 관리자 키가 아직 등록되지 않았어요/.test(SRC_NEW), true);
  }

  console.log('\n════ 2. send — 입력 검사 ════');
  {
    const S = base();
    for (const [label, body, want] of [
      ['purpose 없음',            { action: 'send', phone: '01011112222' }, 400],
      /* v261: 'signup' 을 쓰임새로 받아들였다(v260 까지는 모르는 purpose → 400).
         이 번호(01011112222)는 base() 에서 **이미 가입된 계정**으로 깔려 있으므로
         가입용 인증번호는 409 로 막히는 것이 맞다 — 기대를 400 → 409 로 바꿨다. */
      ["purpose 'signup' (v261 부터 받는다 · 이미 가입된 번호라 409)",
        { action: 'send', purpose: 'signup', phone: '01011112222' }, 409],
      ['purpose 엉뚱',            { action: 'send', purpose: 'hack', phone: '01011112222' }, 400],
      ['번호 짧음',               { action: 'send', purpose: 'reset', phone: '010111' }, 400],
      ['번호가 02 (휴대폰 아님)',  { action: 'send', purpose: 'reset', phone: '0212345678' }, 400],
      ['알 수 없는 action',       { action: 'nope' }, 400]
    ]) {
      const s = await call(S, body);
      ck(label + ' → ' + want, s.code, want);
    }
    ck('   여기까지 문자 0건', S.aligo.length, 0);
  }
  {
    const S = base();
    const s = await call(S, { action: 'send', purpose: 'reset', phone: '+82 10-1111-2222' });
    ck('82로 시작하는 번호도 받아 준다 (앱 phoneDigits 와 같은 규칙)', s.body.ok, true);
    ck('   수신번호가 0으로 바뀌었나', S.aligo[0].form.receiver, '01011112222');
  }

  console.log('\n════ 3. send/reset — 가입자 존재 캐내기 막기 ════');
  {
    /* 네 경우의 응답이 **완전히 같아야** 한다 */
    const cases = [
      ['쓸 수 있는 가입자', '01011112222', true],
      ['없는 번호',        '01099998888', false],
      ['기사 계정',        '01033334444', false],
      ['탈퇴 계정',        '01055556666', false]
    ];
    const bodies = [];
    for (const [label, phone, shouldSend] of cases) {
      const S = base();
      const s = await call(S, { action: 'send', purpose: 'reset', phone: phone }, null, '7.7.7.' + phone.slice(-1));
      bodies.push(JSON.stringify(s.body) + '|' + s.code);
      ck(label + ' → 응답', JSON.stringify(s.body), '{"ok":true,"ttlSec":300}');
      ck('   실제 문자 ' + (shouldSend ? '나감' : '안 나감'), S.aligo.length, shouldSend ? 1 : 0);
      ck('   인증번호 문서 ' + (shouldSend ? '생김' : '안 생김'),
        Object.keys(S.docs).filter(k => /^otp\//.test(k) && !/^otp\/rl\./.test(k)).length, shouldSend ? 1 : 0);
    }
    ck('네 경우 응답 바이트 동일', new Set(bodies).size, 1);
  }

  console.log('\n════ 4. 코드가 어디에도 평문으로 남지 않나 ════');
  {
    const S = base();
    await call(S, { action: 'send', purpose: 'reset', phone: '01011112222' });
    const code = codeFromSms(S);
    ck('6자리 코드가 문자로 나갔나', /^\d{6}$/.test(code || ''), true);
    const otpKey = Object.keys(S.docs).find(k => /^otp\//.test(k) && !/^otp\/rl\./.test(k));
    const doc = S.docs[otpKey];
    ck('문서 필드 구성', Object.keys(doc).sort().join(','), 'codeHash,expiresAt,sentAt,tries');
    ck('   codeHash 는 sha256(코드+비밀값)',
      doc.codeHash, crypto.createHash('sha256').update(code + 'SEKRIT-TEST').digest('hex'));
    ck('   문서 어디에도 코드 평문 없음', JSON.stringify(doc).indexOf(code) < 0, true);
    ck('   문서 어디에도 번호 평문 없음', JSON.stringify(doc).indexOf('01011112222') < 0, true);
    ck('   문서 id 도 해시 (번호가 안 보인다)', otpKey.indexOf('01011112222') < 0, true);
    ck('   id = sha256(번호+쓰임새)',
      otpKey, 'otp/' + crypto.createHash('sha256').update('01011112222reset').digest('hex'));
    ck('   tries 는 0 에서 시작', doc.tries, 0);
    ck('   5분 뒤 만료', doc.expiresAt - Date.now() > 4.9 * 60000, true);
    ck('   로그 0건 (성공 때는 아무것도 안 적는다)', S.logs.length, 0);
  }
  {
    /* 알리고가 거부했을 때 — 로그에 result_code·message 만 */
    const S = base();
    S.aligoReply = { result_code: -101, message: '인증오류입니다.' };
    const s = await call(S, { action: 'send', purpose: 'reset', phone: '01011112222' });
    ck('알리고 거부 → 500', s.code, 500);
    ck('   사람 문구', s.body.message, '문자를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    ck('   인증번호 문서를 남기지 않는다',
      Object.keys(S.docs).filter(k => /^otp\//.test(k) && !/^otp\/rl\./.test(k)).length, 0);
    const log = S.logs.join('\n');
    ck('   로그에 result_code 있나', log.indexOf('-101') >= 0, true);
    ck('   로그에 번호 없음', log.indexOf('01011112222') < 0, true);
    ck('   로그에 코드 없음', /\b\d{6}\b/.test(log.replace(/-101/g, '')), false);
  }
  {
    const S = base(); S.aligoThrow = true;
    const s = await call(S, { action: 'send', purpose: 'reset', phone: '01011112222' });
    ck('알리고 호출 자체 실패 → 500', s.code, 500);
    ck('   문서 안 남김',
      Object.keys(S.docs).filter(k => /^otp\//.test(k) && !/^otp\/rl\./.test(k)).length, 0);
  }
  {
    const S = base(); delete S.env.ALIGO_KEY;
    const s = await call(S, { action: 'send', purpose: 'reset', phone: '01011112222' });
    ck('알리고 키 없음 → 500', s.code, 500);
    ck('   문구', s.body.message, '문자 설정이 아직 안 됐어요. 관리자에게 알려 주세요.');
  }

  console.log('\n════ 5. 문자 폭탄 막기 (번호별·IP별) ════');
  {
    const S = base();
    let s = await call(S, { action: 'send', purpose: 'reset', phone: '01011112222' }, null, '5.5.5.5');
    ck('1회차 통과', s.body.ok, true);
    s = await call(S, { action: 'send', purpose: 'reset', phone: '01011112222' }, null, '5.5.5.5');
    ck('연속 2회차 → 429', s.code, 429);
    ck('   문구', s.body.message, '방금 보냈어요. 1분 뒤에 다시 받아 주세요.');
    ck('   문자는 1건만', S.aligo.length, 1);
  }
  {
    /* 1분 창을 넘긴 척 — 기록 시각을 과거로 밀어 둔다 */
    const S = base();
    const rl = 'otp/rl.p.' + crypto.createHash('sha256').update('01011112222').digest('hex');
    const t = Date.now();
    S.docs[rl] = { at: [t - 70000, t - 140000, t - 210000], updatedAt: t };   // 10분 안 3건
    const s = await call(S, { action: 'send', purpose: 'reset', phone: '01011112222' }, null, '5.5.5.6');
    ck('10분 안에 이미 3건 → 429', s.code, 429);
    ck('   문구', s.body.message, '인증번호를 너무 자주 받았어요. 10분 뒤에 다시 시도해 주세요.');
  }
  {
    const S = base();
    const rl = 'otp/rl.p.' + crypto.createHash('sha256').update('01011112222').digest('hex');
    const t = Date.now();
    const at = []; for (let i = 0; i < 10; i++) at.push(t - (3600000 + i * 60000));  // 1시간~ 전 10건
    S.docs[rl] = { at: at, updatedAt: t };
    const s = await call(S, { action: 'send', purpose: 'reset', phone: '01011112222' }, null, '5.5.5.7');
    ck('하루 안에 이미 10건 → 429', s.code, 429);
    ck('   문구에 내일 안내', /내일 다시 시도/.test(s.body.message), true);
  }
  {
    const S = base();
    const t = Date.now();
    const ipRl = 'otp/rl.i.' + crypto.createHash('sha256').update('8.8.8.8').digest('hex');
    const at = []; for (let i = 0; i < 20; i++) at.push(t - i * 60000);
    S.docs[ipRl] = { at: at, updatedAt: t };
    const s = await call(S, { action: 'send', purpose: 'reset', phone: '01077778888' }, null, '8.8.8.8');
    ck('같은 IP 1시간 20건 넘김 → 429', s.code, 429);
    ck('   문구', s.body.message, '요청이 너무 잦아요. 한 시간 뒤에 다시 시도해 주세요.');
  }
  {
    /* x-forwarded-for 의 **첫 값**을 쓰는가 */
    const S = base();
    await call(S, { action: 'send', purpose: 'reset', phone: '01011112222' }, null, '3.3.3.3');
    const want = 'otp/rl.i.' + crypto.createHash('sha256').update('3.3.3.3').digest('hex');
    ck('IP 기록은 x-forwarded-for 첫 값 기준', !!S.docs[want], true);
  }
  {
    /* 없는 번호여도 횟수는 소모돼야 한다 — 아니면 캐내기가 공짜가 된다 */
    const S = base();
    let s = await call(S, { action: 'send', purpose: 'reset', phone: '01099998888' }, null, '4.4.4.4');
    ck('없는 번호 1회차 → 성공 모양', s.body.ok, true);
    s = await call(S, { action: 'send', purpose: 'reset', phone: '01099998888' }, null, '4.4.4.4');
    ck('없는 번호 2회차도 429 (횟수 소모됨)', s.code, 429);
  }

  console.log('\n════ 6. verify-reset — 코드 대입·만료 ════');
  {
    const S = base();
    for (const [label, body, want] of [
      ['번호 틀림',   { action: 'verify-reset', phone: '010', code: '123456', newPassword: 'abcdef' }, 400],
      ['코드 5자리',  { action: 'verify-reset', phone: '01011112222', code: '12345', newPassword: 'abcdef' }, 400],
      ['코드 문자',   { action: 'verify-reset', phone: '01011112222', code: 'abcdef', newPassword: 'abcdef' }, 400],
      ['비번 5자',    { action: 'verify-reset', phone: '01011112222', code: '123456', newPassword: 'abcde' }, 400]
    ]) {
      const s = await call(S, body);
      ck(label + ' → ' + want, s.code, want);
    }
    ck('   계정 건드린 적 없음', S.calls.filter(c => c[0] === 'updateUser').length, 0);
  }
  {
    /* 인증번호를 받지 않고 바로 비번 바꾸기 */
    const S = base();
    const s = await call(S, { action: 'verify-reset', phone: '01011112222', code: '123456', newPassword: 'newpw1' });
    ck('코드를 받지 않고 바로 → 400', s.code, 400);
    ck('   문구 (있고 없고를 알려 주지 않는다)', s.body.message, '인증번호가 만료됐어요. 다시 받아 주세요.');
    ck('   비밀번호 안 바뀜', S.calls.filter(c => c[0] === 'updateUser').length, 0);
  }
  {
    /* 정상 흐름 */
    const S = base();
    await call(S, { action: 'send', purpose: 'reset', phone: '01011112222' });
    const code = codeFromSms(S);
    const s = await call(S, { action: 'verify-reset', phone: '01011112222', code: code, newPassword: 'newpw123' });
    ck('맞는 코드 → 200', s.code, 200);
    ck('   응답 = { ok:true } 만 (비번·토큰·uid 없음)', JSON.stringify(s.body), '{"ok":true}');
    const up = S.calls.find(c => c[0] === 'updateUser');
    ck('   updateUser 대상 uid', up && up[1], 'OWNER1');
    ck('   바꾼 것은 password 하나', up && Object.keys(up[2]).join(','), 'password');
    ck('   새 비밀번호가 그대로 전달됐나', up && up[2].password, 'newpw123');
    ck('   다른 기기 세션 끊기', S.calls.filter(c => c[0] === 'revokeRefreshTokens').length, 1);
    ck('   인증번호 문서 지워짐',
      Object.keys(S.docs).filter(k => /^otp\//.test(k) && !/^otp\/rl\./.test(k)).length, 0);
    /* 같은 코드 재사용 */
    const s2 = await call(S, { action: 'verify-reset', phone: '01011112222', code: code, newPassword: 'again99' });
    ck('같은 코드 재사용 → 400', s2.code, 400);
  }
  {
    /* 틀린 코드 6번 */
    const S = base();
    await call(S, { action: 'send', purpose: 'reset', phone: '01011112222' });
    const real = codeFromSms(S);
    const wrong = String((Number(real) + 1) % 1000000).padStart(6, '0');
    const msgs = [];
    for (let i = 1; i <= 6; i++) {
      const s = await call(S, { action: 'verify-reset', phone: '01011112222', code: wrong, newPassword: 'newpw123' });
      msgs.push(s.body.message);
    }
    ck('1회 틀림 문구', msgs[0], '인증번호가 맞지 않아요. (5번 더 넣을 수 있어요)');
    ck('5회 틀림 문구', msgs[4], '인증번호가 맞지 않아요. (1번 더 넣을 수 있어요)');
    ck('6회째 → 인증번호 버림', msgs[5], '인증번호를 너무 여러 번 틀렸어요. 다시 받아 주세요.');
    ck('   문서 지워짐',
      Object.keys(S.docs).filter(k => /^otp\//.test(k) && !/^otp\/rl\./.test(k)).length, 0);
    /* 이제 맞는 코드를 넣어도 통하지 않는다 */
    const s = await call(S, { action: 'verify-reset', phone: '01011112222', code: real, newPassword: 'newpw123' });
    ck('버린 뒤 맞는 코드도 → 400', s.code, 400);
    ck('   비밀번호 끝까지 안 바뀜', S.calls.filter(c => c[0] === 'updateUser').length, 0);
  }
  {
    /* 만료 */
    const S = base();
    await call(S, { action: 'send', purpose: 'reset', phone: '01011112222' });
    const code = codeFromSms(S);
    const k = Object.keys(S.docs).find(x => /^otp\//.test(x) && !/^otp\/rl\./.test(x));
    S.docs[k].expiresAt = Date.now() - 1;
    const s = await call(S, { action: 'verify-reset', phone: '01011112222', code: code, newPassword: 'newpw123' });
    ck('5분 지난 코드 → 400', s.code, 400);
    ck('   문구', s.body.message, '인증번호가 만료됐어요. 다시 받아 주세요.');
  }
  {
    /* 남의 쓰임새 코드로 비번 바꾸기 — changeNew 코드를 reset 에 쓸 수 없다 */
    const S = base();
    const s0 = await call(S, { action: 'send', purpose: 'changeNew', phone: '01077778888' }, 'masterTok');
    ck('마스터가 changeNew 코드 받기 → 200', s0.code, 200);
    const code = codeFromSms(S);
    const s = await call(S, { action: 'verify-reset', phone: '01077778888', code: code, newPassword: 'newpw123' });
    ck('changeNew 코드를 reset 에 쓰기 → 400 (쓰임새가 다르면 문서가 다르다)', s.code, 400);
  }
  {
    /* 기사·탈퇴 계정은 코드가 아예 안 나가므로 여기까지 못 온다.
       그래도 2중 안전 — 문서를 손으로 넣어 두고 확인한다 */
    const S = base();
    const mk = (digits, purpose, code) => {
      const id = 'otp/' + crypto.createHash('sha256').update(digits + purpose).digest('hex');
      S.docs[id] = { codeHash: crypto.createHash('sha256').update(code + 'SEKRIT-TEST').digest('hex'),
                     expiresAt: Date.now() + 300000, tries: 0, sentAt: [Date.now()] };
    };
    mk('01033334444', 'reset', '111111');
    let s = await call(S, { action: 'verify-reset', phone: '01033334444', code: '111111', newPassword: 'newpw123' });
    ck('기사 계정 (코드가 맞아도) → 400', s.code, 400);
    ck('   문구에 관리자 안내', /관리자에게 문의/.test(s.body.message), true);
    mk('01055556666', 'reset', '222222');
    s = await call(S, { action: 'verify-reset', phone: '01055556666', code: '222222', newPassword: 'newpw123' });
    ck('탈퇴 계정 (코드가 맞아도) → 400', s.code, 400);
    ck('   비밀번호 안 바뀜', S.calls.filter(c => c[0] === 'updateUser').length, 0);
  }

  console.log('\n════ 7. changePhone — 마스터만 · 새 번호 OTP 필수 ════');
  {
    const S = base();
    let s = await call(S, { action: 'changePhone', targetUid: 'OWNER1', newPhone: '01077778888', code: '123456' });
    ck('토큰 없이 → 401', s.code, 401);
    s = await call(S, { action: 'changePhone', targetUid: 'OWNER1', newPhone: '01077778888', code: '123456' }, 'badtok');
    ck('엉터리 토큰 → 401', s.code, 401);
    s = await call(S, { action: 'changePhone', targetUid: 'OWNER1', newPhone: '01077778888', code: '123456' }, 'anonTok');
    ck('익명 계정 → 403', s.code, 403);
    s = await call(S, { action: 'changePhone', targetUid: 'OWNER1', newPhone: '01077778888', code: '123456' }, 'ownerTok');
    ck('마스터 아닌 가입자 → 403', s.code, 403);
    ck('   문구', s.body.message, '마스터만 쓸 수 있어요.');
    ck('   아무것도 안 바뀜', S.calls.filter(c => c[0] === 'updateUser').length, 0);
    s = await call(S, { action: 'send', purpose: 'changeNew', phone: '01077778888' }, 'ownerTok');
    ck('가입자가 changeNew 코드 받기 → 403', s.code, 403);
    ck('   문자 안 나감', S.aligo.length, 0);
  }
  {
    const S = base();
    /* 코드 없이 / 틀린 코드 */
    let s = await call(S, { action: 'changePhone', targetUid: 'OWNER1', newPhone: '01077778888', code: '123456' }, 'masterTok');
    ck('마스터지만 코드를 안 받았음 → 400', s.code, 400);
    ck('   로그인 아이디 안 바뀜', S.calls.filter(c => c[0] === 'updateUser').length, 0);
  }
  {
    const S = base();
    await call(S, { action: 'send', purpose: 'changeNew', phone: '01077778888' }, 'masterTok');
    const code = codeFromSms(S);
    ck('문자는 **새 번호**로 갔나', S.aligo[0].form.receiver, '01077778888');
    /* 다른 번호의 코드로 바꾸려 하기 */
    let s = await call(S, { action: 'changePhone', targetUid: 'OWNER1', newPhone: '01066665555', code: code }, 'masterTok');
    ck('다른 번호에 그 코드 쓰기 → 400', s.code, 400);
    /* 정상 */
    s = await call(S, { action: 'changePhone', targetUid: 'OWNER1', newPhone: '01077778888', code: code }, 'masterTok');
    ck('맞는 코드 → 200', s.code, 200);
    ck('   응답', JSON.stringify(s.body), '{"ok":true,"loginPhone":"01077778888"}');
    const up = S.calls.filter(c => c[0] === 'updateUser').pop();
    ck('   Auth 아이디를 새 번호로', up && up[2].email, '01077778888@phone.cosroad.com');
    ck('   users.phone', S.docs['users/OWNER1'].phone, '01077778888');
    ck('   users.contact', S.docs['users/OWNER1'].contact, '01077778888');
    ck('   orgId 는 그대로 (자료가 딸려 있다)', S.docs['users/OWNER1'].orgId, 'academy_o1');
    ck('   approved 그대로', S.docs['users/OWNER1'].approved, true);
    ck('   세션 끊기', S.calls.filter(c => c[0] === 'revokeRefreshTokens').pop()[1], 'OWNER1');
    ck('   코드 문서 지워짐',
      Object.keys(S.docs).filter(k => /^otp\//.test(k) && !/^otp\/rl\./.test(k)).length, 0);
  }
  {
    const S = base();
    /* 이미 쓰는 번호 */
    let s = await call(S, { action: 'send', purpose: 'changeNew', phone: '01033334444' }, 'masterTok');
    ck('이미 쓰는 번호로 코드 요청 → 409', s.code, 409);
    ck('   문자 안 나감', S.aligo.length, 0);
    /* 쓰임새 분리 확인 — reset 코드를 changePhone 에 */
    const S2 = base();
    await call(S2, { action: 'send', purpose: 'reset', phone: '01011112222' });
    const code = codeFromSms(S2);
    s = await call(S2, { action: 'changePhone', targetUid: 'OWNER1', newPhone: '01011112222', code: code }, 'masterTok');
    ck('reset 코드를 changePhone 에 → 409 (이미 쓰는 번호)', s.code, 409);
  }
  {
    const S = base();
    await call(S, { action: 'send', purpose: 'changeNew', phone: '01077778888' }, 'masterTok');
    const code = codeFromSms(S);
    let s = await call(S, { action: 'changePhone', targetUid: 'OWNER2', newPhone: '01077778888', code: code }, 'masterTok');
    ck('이메일 가입 계정 → 400 (이번 범위 아님)', s.code, 400);
    ck('   문구', /이메일로 가입한 계정/.test(s.body.message), true);
    s = await call(S, { action: 'changePhone', targetUid: 'DRV1', newPhone: '01077778888', code: code }, 'masterTok');
    ck('기사 계정 → 400', s.code, 400);
    s = await call(S, { action: 'changePhone', targetUid: 'NOPE', newPhone: '01077778888', code: code }, 'masterTok');
    ck('없는 계정 → 404', s.code, 404);
    ck('   세 번 다 코드는 아직 살아 있나 (헛되게 소모되지 않는다)',
      Object.keys(S.docs).filter(k => /^otp\//.test(k) && !/^otp\/rl\./.test(k)).length, 1);
    ck('   아무것도 안 바뀜', S.calls.filter(c => c[0] === 'updateUser').length, 0);
  }
  {
    /* 마스터 호출 1분 10회 제한 */
    const S = base();
    const h = makeHandler(SRC_NEW, S);
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const s = res();
      await h(req({ action: 'changePhone', targetUid: 'OWNER1', newPhone: '01077778888', code: '123456' }, 'masterTok'), s);
      last = s.code;
    }
    ck('같은 마스터 1분 11회째 → 429', last, 429);
  }

  console.log('\n════ 8. 알리고 호출이 공식 문서와 같나 ════');
  {
    const S = base();
    await call(S, { action: 'send', purpose: 'reset', phone: '01011112222' });
    const a = S.aligo[0];
    ck('주소', a.url, 'https://apis.aligo.in/send/');
    ck('메서드', a.method, 'POST');
    ck('Content-Type', a.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
    ck('필수 파라미터 전부 있나',
      ['key', 'user_id', 'sender', 'receiver', 'msg'].every(k => !!a.form[k]), true);
    ck('보낸 항목 목록', Object.keys(a.form).sort().join(','), 'key,msg,msg_type,receiver,sender,user_id');
    ck('msg_type = SMS (문서 권고: 직접 지정)', a.form.msg_type, 'SMS');
    ck('본문 모양', a.form.msg.replace(/\d{6}/, '######'), '[코스로드] 인증번호 ###### (5분 안에 입력)');
    ck('본문에 용도 표현 없음', /재설정|비밀번호|번호 바꾸|가입/.test(a.form.msg), false);
    /* EUC-KR 바이트 — 한글 2바이트, 나머지 1바이트 */
    const bytes = Array.from(a.form.msg).reduce((n, ch) => n + (ch.charCodeAt(0) > 127 ? 2 : 1), 0);
    ck('EUC-KR 바이트 수 (SMS 한도 90)', bytes <= 90, true);
    console.log('      실측 ' + bytes + '바이트');
    ck('이모지 없음 (문서: EUC-KR 밖 글자는 ? 로 바뀐다)',
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(a.form.msg), false);
    ck('testmode_yn 안 보냄 (실발송)', a.form.testmode_yn === undefined, true);
    /* 같은 번호에 두 쓰임새를 보내도 수신번호 한 개씩만 */
    ck('receiver 는 한 번호만 (쉼표 없음)', a.form.receiver.indexOf(',') < 0, true);
  }

  console.log('\n════ 9. 빈도 기록 문서가 otp 컬렉션 안인가 (규칙 한 줄로 덮이게) ════');
  {
    const S = base();
    await call(S, { action: 'send', purpose: 'reset', phone: '01011112222' }, null, '6.6.6.6');
    const keys = Object.keys(S.docs).filter(k => /^otp\//.test(k));
    ck('문서 3개 (인증번호 + 번호제한 + IP제한)', keys.length, 3);
    ck('전부 otp/ 로 시작', keys.every(k => k.indexOf('otp/') === 0), true);
    ck('다른 컬렉션에 쓴 것 없음',
      Object.keys(S.docs).filter(k => !/^(otp|users|admins)\//.test(k)).length, 0);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
})().catch(e => { console.log('오류: ' + e.message); console.log(e.stack.split('\n').slice(0, 6).join('\n')); });
