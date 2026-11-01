// COSROAD — 기사 로그인·출퇴근 (v255)
// Vercel: api/driver-auth.js
//
// 왜 서버인가 — PIN 을 폰에 두면 PIN 이 아니다.
//   v254 까지는 기사 PIN 이 `cars` 자료에 그대로 들어 있었고, 기사 폰이 그 자료를
//   내려받았다. 즉 **기사 한 명이 모든 기사의 PIN 을 볼 수 있었다**(남의 출퇴근을 찍을 수 있다).
//   그래서 PIN 은 서버에만 **해시**로 두고, 맞추기도 서버가 한다.
//   출퇴근 시각도 서버가 정한다 — 폰 시각을 바꿔 출근을 속이는 길을 막는다.
//
// 막는 것
//   ① PIN 대입      — 4자리라 1만 가지다. 업체번호+기기 5회 → 10분 잠금 · IP 1시간 상한
//   ② 남의 업체 캐기 — 없는 업체번호·틀린 PIN·잠금을 **같은 문구**로 답한다
//   ③ 남의 출퇴근   — 토큰에 박힌 자기 carId 만 쓴다(요청 본문의 carId 는 믿지 않는다)
//   ④ 기기 바꿔치기 — 첫 로그인 기기를 묶고, 다른 기기는 거절(관리자가 풀어 준다)
//   ⑤ 동시 덮어쓰기 — driverAtt 는 키 하나에 통째로 들어 있어 트랜잭션으로 고친다
//
// ★ 키는 Vercel 환경변수에만 (절대규칙 1)
//   FIREBASE_SERVICE_ACCOUNT · OTP_SECRET(PIN 해시용 — 새 변수를 만들지 않는다)
//   PIN 원문은 **어디에도 저장하지 않는다**(해시만). 로그에도 PIN·업체번호를 적지 않는다.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash, timingSafeEqual } from 'crypto';

const ALLOWED = ['https://roadjob.co.kr', 'https://www.roadjob.co.kr', 'https://cosroad.com', 'https://www.cosroad.com', 'https://roadcrew.kr', 'https://cosroad.vercel.app'];

/* 틀린 PIN 제한 — [창(ms), 허용 횟수] */
const FAIL_WINDOW = 10 * 60 * 1000;   // 10분
const FAIL_MAX    = 5;                // 5회 틀리면 잠금
const IP_LIMIT    = [3600 * 1000, 60];  // IP 1시간 60회 (한 업체에 기사가 여럿일 수 있다)
/* 로그인 기록은 지우지 않고 쌓아 둔다 — 한 번 로그인에 문서 하나로 작고,
   「언제 어디서 들어왔나」는 지난 것도 남아 있어야 쓸모가 있다.
   관리자 화면은 api driverInfo 가 **최근 5건만** 골라 준다. */

function admin() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('NO_SERVICE_ACCOUNT');
    let sa;
    try { sa = JSON.parse(raw); } catch (e) { throw new Error('BAD_SERVICE_ACCOUNT'); }
    initializeApp({ credential: cert(sa) });
  }
  return { auth: getAuth(), db: getFirestore() };
}

const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');
const fail = (res, code, message, why) => res.status(code).json(why ? { ok: false, message, why } : { ok: false, message });

/* 같은 길이의 해시를 시간차 없이 비교 */
function sameHash(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length || !x.length) return false;
  try { return timingSafeEqual(x, y); } catch (e) { return false; }
}

/* 요청자 IP — api/otp.js clientIp 와 **같은 규칙**(Vercel 공식 문서 대조, v253) */
function clientIp(req) {
  const pick = (v) => String(v || '').split(',')[0].trim();
  const h = (req && req.headers) || {};
  return pick(h['x-vercel-forwarded-for'])
      || pick(h['x-forwarded-for'])
      || pick(h['x-real-ip'])
      || String((req && req.socket && req.socket.remoteAddress) || 'unknown');
}

/* ── 한국 날짜·시각 ────────────────────────────────────────────────────────
   api 는 UTC 로 돈다. 그대로 쓰면 'HH:MM' 이 9시간 어긋나고,
   **0~9시에는 날짜가 어제**가 된다(CLAUDE.md 함정과 같은 자리).
   앱의 todayStr()·nowTimeStr() 과 같은 값이 나와야 근태·급여가 이어진다. */
const KST = (ms) => new Date((ms === undefined ? Date.now() : ms) + 9 * 3600 * 1000);
function kstDateStr(ms) {
  const d = KST(ms);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0')
       + '-' + String(d.getUTCDate()).padStart(2, '0');
}
function kstTimeStr(ms) {
  const d = KST(ms);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}
/* 앱 attKey(carId, dateStr) 와 **같은 모양** (index.html:760) */
const attKey = (carId, dateStr) => carId + '_' + dateStr;

/* 기사 uid — 차량 기준으로 우리가 정한다 (사장님 결정 10-31).
   Auth 이메일 계정을 만들지 않으므로 사용자 목록이 깨끗하다. */
const driverUidOf = (org, carId) => 'drv_' + org + '_' + carId;

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED.includes(origin) ? origin : ALLOWED[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return fail(res, 405, 'POST만 허용됩니다.');
  if (!ALLOWED.includes(origin)) return fail(res, 403, '허용되지 않은 출처입니다.');

  const secret = process.env.OTP_SECRET;
  if (!secret) return fail(res, 500, '서버 인증 설정이 아직 안 됐어요. 관리자에게 알려 주세요.');

  let A;
  try { A = admin(); }
  catch (e) {
    const m = String(e && e.message);
    return fail(res, 500, m === 'NO_SERVICE_ACCOUNT'
      ? '서버에 관리자 키가 아직 등록되지 않았어요. 관리자에게 알려 주세요.'
      : '서버 관리자 키 형식이 올바르지 않아요. 관리자에게 알려 주세요.');
  }

  const b = req.body || {};
  const action = String(b.action || '');
  const ip = clientIp(req);

  /* 로그인 실패에 쓰는 **한 문구** — 없는 업체번호·틀린 PIN·PIN 없음을 구분해 주지 않는다.
     (구분해 주면 업체번호만 바꿔 가며 「있는 업체」를 찾아낼 수 있다) */
  const SAME = '업체 번호 또는 PIN 이 맞지 않아요.';

  /* 로그인 기록 — 성공·실패 모두 남긴다. 실패해도 로그인 흐름을 막지 않는다. */
  async function writeLogin(org, carId, ok, why, deviceId, loc) {
    try {
      const now = Date.now();
      const rec = {
        org: org || '', carId: carId || '', ok: !!ok, why: why || '',
        at: now, atKst: kstDateStr(now) + ' ' + kstTimeStr(now),
        deviceId: deviceId ? sha256(deviceId).slice(0, 12) : '',   // 기기 id 원문은 안 남긴다
        ip: sha256(ip).slice(0, 12)                                 // IP 원문도 안 남긴다
      };
      if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        rec.lat = Number(loc.lat); rec.lng = Number(loc.lng);
        rec.acc = (typeof loc.acc === 'number') ? Math.round(loc.acc) : null;
      } else {
        rec.lat = null; rec.lng = null; rec.acc = null;   // 「위치 없음」
      }
      await A.db.collection('driverLogins').add(rec);
    } catch (e) { console.log('[driver-auth] 로그인 기록 실패'); }
  }

  /* 틀린 횟수·IP 제한 — otp 의 rl 과 같은 꼴. 한 트랜잭션에서 읽고 쓴다.
     반환: null = 통과 / 문구 = 막혔다 */
  async function rateLimited(codeKey, deviceId) {
    const now = Date.now();
    const fRef = A.db.collection('driverRl').doc('f.' + sha256(String(codeKey) + '|' + String(deviceId || '')));
    const iRef = A.db.collection('driverRl').doc('i.' + sha256(ip));
    try {
      return await A.db.runTransaction(async (tx) => {
        const [fs_, is_] = await tx.getAll(fRef, iRef);
        const fAt = (((fs_.exists && fs_.data()) || {}).at || []).filter(t => now - t < FAIL_WINDOW);
        const iAt = (((is_.exists && is_.data()) || {}).at || []).filter(t => now - t < IP_LIMIT[0]);
        if (fAt.length >= FAIL_MAX) {
          return '여러 번 틀렸어요. 10분 뒤에 다시 시도해 주세요.';
        }
        if (iAt.length >= IP_LIMIT[1]) {
          return '요청이 너무 잦아요. 잠시 뒤에 다시 시도해 주세요.';
        }
        /* IP 는 **모든 시도**를 센다. 틀린 횟수는 아래 bumpFail 에서만 센다. */
        iAt.push(now);
        tx.set(iRef, { at: iAt.slice(-80), updatedAt: now });
        return null;
      });
    } catch (e) {
      console.log('[driver-auth] 빈도 기록 실패');
      return '잠시 뒤 다시 시도해 주세요.';
    }
  }
  async function bumpFail(codeKey, deviceId) {
    const now = Date.now();
    const fRef = A.db.collection('driverRl').doc('f.' + sha256(String(codeKey) + '|' + String(deviceId || '')));
    try {
      await A.db.runTransaction(async (tx) => {
        const s = await tx.get(fRef);
        const at = (((s.exists && s.data()) || {}).at || []).filter(t => now - t < FAIL_WINDOW);
        at.push(now);
        tx.set(fRef, { at: at.slice(-20), updatedAt: now });
      });
    } catch (e) { console.log('[driver-auth] 실패 기록 못 남김'); }
  }
  async function clearFail(codeKey, deviceId) {
    try {
      await A.db.collection('driverRl')
        .doc('f.' + sha256(String(codeKey) + '|' + String(deviceId || ''))).delete();
    } catch (e) {}
  }

  /* 업체가 살아 있나 — 규칙 ownerAlive 와 **같은 뜻**(v253: 소유자가 마스터면 살아 있음) */
  async function ownerAlive(ownerUid) {
    if (!ownerUid) return false;
    try {
      if ((await A.db.collection('admins').doc(ownerUid).get()).exists) return true;
      const s = await A.db.collection('users').doc(ownerUid).get();
      if (!s.exists) return false;
      const u = s.data() || {};
      if (u.approved !== true) return false;
      if (u.withdrawn === true) return false;
      if (u.plan === 'paid') return true;
      if (!('trialStart' in u)) return true;
      return Date.now() < Number(u.trialStart) + 2592000000;
    } catch (e) { return false; }
  }

  /* 이 기관의 소유자 uid — api/admin-account resolveOwnerUid 와 **같은 규칙**(v251·v254).
     _test 는 마스터를 소유자로 둔다(그 계정 체험이 끝나도 기사가 잠기지 않게). */
  async function resolveOwnerUid(org) {
    let owners = [];
    try {
      const snap = await A.db.collection('users').where('orgId', '==', org).get();
      snap.forEach(d => {
        const u = d.data() || {};
        if (u.role === 'driver') return;
        if (u.approved !== true) return;
        if (u.withdrawn === true) return;
        owners.push(d.id);
      });
    } catch (e) { return null; }
    if (owners.length === 1) return owners[0];
    if (/_test$/.test(org)) {
      try {
        const snap = await A.db.collection('admins').limit(1).get();
        let uid = null; snap.forEach(d => { if (!uid) uid = d.id; });
        return uid;
      } catch (e) { return null; }
    }
    return null;
  }

  /* orgs/{org}/data/driverAtt 를 **트랜잭션으로** 고친다.
     저장 모양은 앱 saveToFirebase 와 똑같다 — { value: JSON 문자열, updatedAt }.
     덮어쓰기 직전 백업도 앱 _backupBeforeSave 와 같은 꼴로 남긴다.
     반환: { ok, kind:'in'|'out'|'done', time } | { error } */
  async function punch(org, carId) {
    const ref = A.db.collection('orgs').doc(org).collection('data').doc('driverAtt');
    const now = Date.now();
    const dateStr = kstDateStr(now);
    const timeStr = kstTimeStr(now);
    const k = attKey(carId, dateStr);
    try {
      return await A.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        let att = {}, prevStr = null;
        if (snap.exists) {
          prevStr = (snap.data() || {}).value || null;
          try { att = prevStr ? JSON.parse(prevStr) : {}; } catch (e) { att = {}; }
          if (!att || typeof att !== 'object' || Array.isArray(att)) att = {};
        }
        if (!att[k] || typeof att[k] !== 'object') att[k] = {};
        let kind;
        if (!att[k].in)       { att[k].in = timeStr;  kind = 'in'; }
        else if (!att[k].out) { att[k].out = timeStr; kind = 'out'; }
        else                  { return { ok: true, kind: 'done', time: att[k].out }; }
        tx.set(ref, { value: JSON.stringify(att), updatedAt: now });
        /* 백업 — 앱과 같은 자리·같은 필드 (orgs/{org}/backups/{key}__{시각}) */
        if (prevStr) {
          tx.set(A.db.collection('orgs').doc(org).collection('backups').doc('driverAtt__' + now),
                 { key: 'driverAtt', value: prevStr, backupAt: now });
        }
        return { ok: true, kind: kind, time: timeStr };
      });
    } catch (e) {
      console.log('[driver-auth] 출퇴근 기록 실패');
      return { error: '기록하지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
    }
  }

  /* 호출자 확인 — 기사 토큰인가 (checkin·checkout) */
  async function requireDriver() {
    const authz = String(req.headers.authorization || '');
    const idToken = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
    if (!idToken) return { error: '다시 로그인해 주세요.', code: 401 };
    let t;
    try { t = await A.auth.verifyIdToken(idToken); }
    catch (e) { return { error: '로그인이 만료됐어요. 다시 로그인해 주세요.', code: 401 }; }
    /* ★ carId·org 는 **토큰에 박힌 값**만 쓴다 — 요청 본문의 값은 믿지 않는다 */
    if (t.driver !== true || !t.org || !t.carId) {
      return { error: '기사 로그인으로만 쓸 수 있어요.', code: 403 };
    }
    return { uid: t.uid, org: String(t.org), carId: String(t.carId) };
  }

  /* 호출자 확인 — 관리자인가 (pinCheckin) : v254 와 같은 세 갈래 */
  async function requireManager(org) {
    const authz = String(req.headers.authorization || '');
    const idToken = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
    if (!idToken) return { error: '로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.', code: 401 };
    let caller;
    try { caller = await A.auth.verifyIdToken(idToken); }
    catch (e) { return { error: '로그인이 만료됐어요. 다시 로그인한 뒤 시도해 주세요.', code: 401 }; }
    if (caller.firebase && caller.firebase.sign_in_provider === 'anonymous') {
      return { error: '계정으로 로그인한 뒤에 쓸 수 있어요.', code: 403 };
    }
    if (caller.driver === true) return { error: '관리자만 쓸 수 있어요.', code: 403 };
    const uid = caller.uid;
    try {
      if ((await A.db.collection('admins').doc(uid).get()).exists) return { uid: uid };
    } catch (e) {}
    try {
      const s = await A.db.collection('users').doc(uid).get();
      const u = (s.exists && s.data()) || {};
      if (u.orgId === org && u.approved === true && u.withdrawn !== true) return { uid: uid };
      /* _test 출입 허용 계정 (v254 isTestAccessFor 와 같은 뜻) */
      if (/_test$/.test(org) && u.testAccess === true && u.approved === true
          && u.withdrawn !== true && u.role !== 'driver') return { uid: uid };
    } catch (e) {}
    return { error: '이 업체의 기사 출퇴근을 다룰 권한이 없어요.', code: 403 };
  }

  try {
    /* ── a) 기사 로그인 ── */
    if (action === 'login') {
      const code = String(b.orgCode || '').replace(/[^0-9]/g, '');
      const pin = String(b.pin || '').replace(/[^0-9]/g, '');
      const deviceId = String(b.deviceId || '').slice(0, 64);
      const loc = b.loc && typeof b.loc === 'object' ? b.loc : null;

      if (!/^\d{6}$/.test(code) || !/^\d{4}$/.test(pin)) {
        return fail(res, 400, '업체 번호 6자리와 PIN 4자리를 넣어 주세요.');
      }
      if (!deviceId) return fail(res, 400, '기기를 확인하지 못했어요. 브라우저를 새로 고쳐 주세요.');

      /* 잠금·IP 상한을 **먼저** 센다 */
      const blocked = await rateLimited(code, deviceId);
      if (blocked) {
        await writeLogin('', '', false, 'locked', deviceId, loc);
        return fail(res, 429, blocked, 'locked');
      }

      /* 업체 번호 → orgId */
      let org = null;
      try {
        const s = await A.db.collection('orgCodes').doc(code).get();
        if (s.exists) org = String((s.data() || {}).orgId || '') || null;
      } catch (e) { return fail(res, 500, '잠시 뒤 다시 시도해 주세요.'); }
      if (!org) {
        await bumpFail(code, deviceId);
        await writeLogin('', '', false, 'nocode', deviceId, loc);
        return fail(res, 401, SAME);     // 없는 번호도 **같은 문구**
      }

      /* 그 업체 기사 PIN 들과 대조 — 해시 비교 */
      const want = sha256(pin + '|' + org + '|' + secret);
      let carId = null;
      try {
        const snap = await A.db.collection('driverPins').where('org', '==', org).get();
        snap.forEach(d => {
          const v = d.data() || {};
          if (!carId && sameHash(v.pinHash, want)) carId = String(v.carId || '');
        });
      } catch (e) { return fail(res, 500, '잠시 뒤 다시 시도해 주세요.'); }
      if (!carId) {
        await bumpFail(code, deviceId);
        await writeLogin(org, '', false, 'badpin', deviceId, loc);
        return fail(res, 401, SAME);     // 틀린 PIN 도 **같은 문구**
      }

      /* 업체가 살아 있나 (만료·탈퇴면 기사도 잠김 — 사장님 결정) */
      const ownerUid = await resolveOwnerUid(org);
      if (!(await ownerAlive(ownerUid))) {
        await writeLogin(org, carId, false, 'expired', deviceId, loc);
        return fail(res, 403, '업체 이용 기간이 끝났거나 계정이 멈췄어요. 관리자에게 문의해 주세요.', 'expired');
      }

      /* 기기 묶기 — 첫 로그인 기기를 기억하고, 다른 기기는 거절 */
      const devRef = A.db.collection('driverDevices').doc(org + '_' + carId);
      try {
        const ds = await devRef.get();
        if (ds.exists && (ds.data() || {}).deviceId) {
          if (String((ds.data() || {}).deviceId) !== deviceId) {
            await writeLogin(org, carId, false, 'device', deviceId, loc);
            return fail(res, 403, '등록된 기기가 아니에요. 관리자에게 기기 풀기를 요청하세요.', 'device');
          }
        } else {
          await devRef.set({ org: org, carId: carId, deviceId: deviceId, boundAt: Date.now() });
        }
      } catch (e) { return fail(res, 500, '잠시 뒤 다시 시도해 주세요.'); }

      /* 기사 문서 — 없으면 만든다 (규칙 isActiveDriver 가 이 문서를 본다) */
      const uid = driverUidOf(org, carId);
      try {
        const dref = A.db.collection('orgs').doc(org).collection('drivers').doc(uid);
        if (!(await dref.get()).exists) {
          await dref.set({ carId: carId, ownerUid: ownerUid, createdAt: Date.now() });
        } else {
          await dref.set({ ownerUid: ownerUid }, { merge: true });   // 소유자가 바뀌었을 수 있다
        }
        const uref = A.db.collection('users').doc(uid);
        if (!(await uref.get()).exists) {
          await uref.set({ role: 'driver', driverOrg: org, ownerUid: ownerUid,
                           carId: carId, createdAt: Date.now() });
        } else {
          await uref.set({ role: 'driver', driverOrg: org, ownerUid: ownerUid, carId: carId }, { merge: true });
        }
      } catch (e) { return fail(res, 500, '잠시 뒤 다시 시도해 주세요.'); }

      /* custom token — Auth 이메일 계정 없이 이 uid 로 로그인시킨다 */
      let token;
      try {
        token = await A.auth.createCustomToken(uid, { driver: true, org: org, carId: carId });
      } catch (e) {
        console.log('[driver-auth] createCustomToken 실패', (e && e.code) || '');
        return fail(res, 500, '로그인 토큰을 만들지 못했어요. 관리자에게 알려 주세요.');
      }

      await clearFail(code, deviceId);
      await writeLogin(org, carId, true, '', deviceId, loc);
      /* 응답에 PIN·해시·업체번호를 담지 않는다 */
      return res.status(200).json({ ok: true, token: token, org: org, carId: carId });
    }

    /* ── b) 출근 / 퇴근 (기사 본인) ── */
    if (action === 'checkin' || action === 'checkout') {
      const who = await requireDriver();
      if (who.error) return fail(res, who.code, who.error);
      if (!(await ownerAlive((await resolveOwnerUid(who.org))))) {
        return fail(res, 403, '업체 이용 기간이 끝났어요. 관리자에게 문의해 주세요.', 'expired');
      }
      const r = await punch(who.org, who.carId);
      if (r.error) return fail(res, 500, r.error);
      await writeLogin(who.org, who.carId, true, 'punch:' + r.kind, String(b.deviceId || ''),
                       b.loc && typeof b.loc === 'object' ? b.loc : null);
      return res.status(200).json({ ok: true, kind: r.kind, time: r.time, date: kstDateStr() });
    }

    /* ── c) 관리자 공용 기기의 PIN 출퇴근 패드 ── */
    if (action === 'pinCheckin') {
      const org = String(b.org || '').trim();
      const pin = String(b.pin || '').replace(/[^0-9]/g, '');
      if (!org) return fail(res, 400, '기관 정보가 빠졌어요.');
      const m = await requireManager(org);
      if (m.error) return fail(res, m.code, m.error);
      if (!/^\d{4}$/.test(pin)) return fail(res, 400, 'PIN 4자리를 넣어 주세요.');

      const want = sha256(pin + '|' + org + '|' + secret);
      let carId = null;
      try {
        const snap = await A.db.collection('driverPins').where('org', '==', org).get();
        snap.forEach(d => {
          const v = d.data() || {};
          if (!carId && sameHash(v.pinHash, want)) carId = String(v.carId || '');
        });
      } catch (e) { return fail(res, 500, '잠시 뒤 다시 시도해 주세요.'); }
      /* 기사 PIN 이 아니면 **앱이 직원·회원 PIN 으로 이어서 본다** — 404 로 알려 준다 */
      if (!carId) return fail(res, 404, '기사 PIN 이 아니에요.', 'notdriver');

      const r = await punch(org, carId);
      if (r.error) return fail(res, 500, r.error);
      await writeLogin(org, carId, true, 'pad:' + r.kind, '', null);
      return res.status(200).json({ ok: true, kind: r.kind, time: r.time, carId: carId, date: kstDateStr() });
    }

    return fail(res, 400, '알 수 없는 요청이에요.');
  } catch (e) {
    /* 자세한 내용은 서버 로그에만 — PIN·업체번호·위치는 적지 않는다 */
    console.log('[driver-auth] 실패', action, String((e && e.code) || ''));
    return fail(res, 500, '처리에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
  }
}
