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
/* 이용 기간 판정 한 벌 (코스로드45) — 규칙·lib/send-guard.js 와 **같은 한 줄** */
import { isAliveUser } from '../lib/period.js';

/* v266: 안 쓰는 주소 셋(roadjob.co.kr·www.roadjob.co.kr·roadcrew.kr)을 뺐다.
   0단계 조사에서 배포된 roadjob.co.kr 을 받아 확인한 결과, 로드잡은 자기 서버
   (roadjob.vercel.app)만 부르고 cosroad.vercel.app 은 한 곳도 안 부른다. */
const ALLOWED = ['https://cosroad.com', 'https://www.cosroad.com', 'https://cosroad.vercel.app'];

/* 틀린 PIN 제한 — [창(ms), 허용 횟수] */
const FAIL_WINDOW = 10 * 60 * 1000;   // 10분
const FAIL_MAX    = 5;                // 5회 틀리면 잠금
const IP_LIMIT    = [3600 * 1000, 60];  // IP 1시간 60회 (한 업체에 기사가 여럿일 수 있다)
/* ── v260: 업체 번호 단위 실패 상한 ──────────────────────────────────────────
   지금까지의 잠금은 「업체 번호 + 기기」 10분 5회와 「IP」 1시간 60회였다.
   그러면 기기 id 를 바꿔 가며 여러 IP 로 나눠 시도할 때, **아직 한 번도 로그인하지 않은
   기사**의 PIN(1만 가지)을 맞혀 그 기기로 먼저 묶어 버릴 수 있다.
   그래서 업체 번호 단위로도 센다 — 단, **아직 묶이지 않은 기기의 실패만** 센다.
   넘으면 그 업체의 **새 기기 로그인만** 1시간 멈추고,
   **이미 묶인 기기(평소 쓰는 기사 폰)는 그대로 로그인된다**(공격으로 업체가 멈추지 않게). */
const ORG_FAIL_WINDOW = 3600 * 1000;   // 1시간
const ORG_FAIL_MAX    = 20;            // 새 기기에서 1시간 20회 틀리면 새 기기 로그인만 멈춤
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
/* v275(40-C): 출퇴근이 `carState/{carId}` 안의 `att[날짜]` 로 옮겨가 **차량 접두사가 없어졌다**
   — 그래서 이 함수를 쓰는 곳이 0 이 되었다(지웠다). 차량은 **문서 자리**가 말해 준다.
   앱 쪽 `attKey()` 는 **합친 모양**(`carId_날짜`)을 만들 때 그대로 쓴다(mergeCarState). */

/* 기사 uid — 차량 기준으로 우리가 정한다 (사장님 결정 10-31).
   Auth 이메일 계정을 만들지 않으므로 사용자 목록이 깨끗하다. */
const driverUidOf = (org, carId) => 'drv_' + org + '_' + carId;
/* 동승 도우미 uid — **사람 기준**이다 (43-B).
   차량 기준으로 두면 배정이 바뀔 때 uid 가 달라져 기기 묶기·토큰이 전부 갈린다.
   ★ `api/admin-account.js helperUidOf` 와 **같은 글자**여야 한다(배정 문서를 같은 자리에서 찾는다). */
const helperUidOf = (org, staffId) => 'hlp_' + org + '_' + staffId;

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
  /* ── v260: 업체 번호 단위 실패 (새 기기만) ──
     기록 자리: driverRl/o.<sha256(orgId)> — 기존 f.*·i.* 와 같은 꼴(서버 전용 컬렉션).
     orgOverLimit: 넘었나 본다(세지는 않는다) / bumpOrgFail: 한 번 센다
     clearOrgFail: **새 기기가 제대로 묶였을 때** 비운다 — 기사 여럿이 첫 로그인에서
       잘못 눌러 20회가 차는 일이 있어도, 한 명이 제대로 들어오면 바로 풀리게. */
  const orgRlRef = (org) => A.db.collection('driverRl').doc('o.' + sha256(String(org)));
  async function orgOverLimit(org) {
    const now = Date.now();
    try {
      const s = await orgRlRef(org).get();
      const at = (((s.exists && s.data()) || {}).at || []).filter(t => now - t < ORG_FAIL_WINDOW);
      return at.length >= ORG_FAIL_MAX;
    } catch (e) { console.log('[driver-auth] 업체 상한 읽기 실패'); return false; }
  }
  async function bumpOrgFail(org) {
    const now = Date.now();
    try {
      await A.db.runTransaction(async (tx) => {
        const ref = orgRlRef(org);
        const s = await tx.get(ref);
        const at = (((s.exists && s.data()) || {}).at || []).filter(t => now - t < ORG_FAIL_WINDOW);
        at.push(now);
        tx.set(ref, { at: at.slice(-(ORG_FAIL_MAX + 5)), updatedAt: now });
      });
    } catch (e) { console.log('[driver-auth] 업체 실패 기록 못 남김'); }
  }
  async function clearOrgFail(org) {
    try { await orgRlRef(org).delete(); } catch (e) {}
  }
  /* 이 기기가 그 업체의 **어느 차량에든 이미 묶여 있나** — PIN 을 맞추기 전에 알 수 있다.
     (묶인 기기면 업체 단위 상한을 건너뛴다) */
  async function deviceBoundToOrg(org, deviceId) {
    if (!deviceId) return false;
    try {
      const snap = await A.db.collection('driverDevices').where('org', '==', org).get();
      let found = false;
      snap.forEach(d => { if (String((d.data() || {}).deviceId || '') === deviceId) found = true; });
      return found;
    } catch (e) { console.log('[driver-auth] 기기 묶임 확인 실패'); return false; }
  }
  async function clearFail(codeKey, deviceId) {
    try {
      await A.db.collection('driverRl')
        .doc('f.' + sha256(String(codeKey) + '|' + String(deviceId || ''))).delete();
    } catch (e) {}
  }

  /* 업체가 살아 있나 — 규칙 `ownerAlive`·`lib/send-guard.js` 와 **같은 한 줄**
     (v253: 소유자가 마스터면 살아 있음 — 그 예외는 여기서 본다).
     ★★ 코스로드45(v277-1): **옛 판정을 버렸다.** v263 이전 방식(`plan==='paid'` → 참 ·
       `trialStart` 가 없으면 참 · `trialStart + 30일`)이 그대로 남아 있었는데,
       `trialStart` 는 v263 뒤로 **아무 데서도 안 쓴다**(저장소에서 이 함수에만 남아 있었다).
       그래서 「없으면 참」에 걸려 **사실상 `approved`·`!withdrawn` 만** 보았고,
       **이용 기간이 끝난 업체의 기사도 로그인하고 출퇴근이 서버에 쌓였다**
       (punch 는 Admin SDK 라 규칙을 안 거친다 — 고치기 전 코드로 실측했다).
       이제 판정은 `lib/period.js isAliveUser` **한 곳**이다 — 규칙·문자 문지기와 같은 줄. */
  async function ownerAlive(ownerUid) {
    if (!ownerUid) return false;
    try {
      if ((await A.db.collection('admins').doc(ownerUid).get()).exists) return true;
      const s = await A.db.collection('users').doc(ownerUid).get();
      if (!s.exists) return false;
      return isAliveUser(s.data() || {}, Date.now());
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

  /* ★ v275(40-C): **`orgs/{org}/carState/{carId}`** 를 트랜잭션으로 고친다.
     v274 까지는 `data/driverAtt`(업체 전체 한 문서)였다 — 기사끼리 같은 문서를 고쳤다.
     이제 차량마다 문서가 갈려 **서로 부딪히지 않는다**(트랜잭션은 그대로 둔다 —
     같은 차량에서 관리자 수기 토글과 겹칠 수 있고, 두 번 눌리는 것도 막아야 한다).
     ★ 날짜 키가 짧아졌다: 옛 `{ "car1_2026-11-05": {in,out} }` →
       이제 그 차량 문서 안의 `att: { "2026-11-05": {in,out} }` 다(차량은 문서가 말해 준다).
     ★ 다른 칸(ride·rideOff·carlog·delivDone·dropDone)은 **건드리지 않는다** —
       읽어서 그대로 다시 쓴다(한 칸만 고치는 셈이다).
     저장 모양은 앱과 똑같다 — { value: JSON 문자열, updatedAt }.
     반환: { ok, kind:'in'|'out'|'done', time } | { error } */
  async function punch(org, carId) {
    const ref = A.db.collection('orgs').doc(org).collection('carState').doc(String(carId));
    const now = Date.now();
    const dateStr = kstDateStr(now);
    const timeStr = kstTimeStr(now);
    try {
      return await A.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        let st = {}, prevStr = null;
        if (snap.exists) {
          prevStr = (snap.data() || {}).value || null;
          try { st = prevStr ? JSON.parse(prevStr) : {}; } catch (e) { st = {}; }
          if (!st || typeof st !== 'object' || Array.isArray(st)) st = {};
        }
        /* 앱 emptyCarState() 와 **같은 꼴**로 빈 칸을 채워 둔다 (한쪽만 바꾸지 말 것) */
        if (!st.ride      || typeof st.ride      !== 'object') st.ride = {};
        if (!st.rideOff   || typeof st.rideOff   !== 'object') st.rideOff = {};
        if (!st.carlog    || typeof st.carlog    !== 'object') st.carlog = { records: [], plans: {} };
        if (!Array.isArray(st.carlog.records)) st.carlog.records = [];
        if (!st.carlog.plans || typeof st.carlog.plans !== 'object') st.carlog.plans = {};
        if (!st.delivDone || typeof st.delivDone !== 'object') st.delivDone = {};
        if (!st.dropDone  || typeof st.dropDone  !== 'object') st.dropDone = {};
        if (!st.att       || typeof st.att       !== 'object') st.att = {};

        if (!st.att[dateStr] || typeof st.att[dateStr] !== 'object') st.att[dateStr] = {};
        const rec = st.att[dateStr];
        let kind;
        if (!rec.in)       { rec.in = timeStr;  kind = 'in'; }
        else if (!rec.out) { rec.out = timeStr; kind = 'out'; }
        else               { return { ok: true, kind: 'done', time: rec.out }; }
        tx.set(ref, { value: JSON.stringify(st), updatedAt: now });
        /* 백업 — 앱과 같은 자리·같은 필드. `key` 는 **앱 _backupBeforeSave 와 같은 글자**
           (`carState/<carId>`) 여야 한다 — 규칙이 그 글자로 기사 백업을 가린다. */
        if (prevStr) {
          const bk = 'carState/' + String(carId);
          tx.set(A.db.collection('orgs').doc(org).collection('backups')
                   .doc('carState_' + String(carId) + '__' + now),
                 { key: bk, value: prevStr, backupAt: now });
        }
        return { ok: true, kind: kind, time: timeStr };
      });
    } catch (e) {
      console.log('[driver-auth] 출퇴근 기록 실패');
      return { error: '기록하지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
    }
  }

  /* ── 직원 근태 출퇴근 (43-C · v282) ──────────────────────────────────────
     동승 도우미는 **차량 근태가 아니라 직원 근태**다 → `orgs/{org}/data/staffAtt` 에 찍는다.
     ★ 키는 앱 `attKey(staffId, 날짜)` 와 **같은 모양**(`st…_YYYY-MM-DD`) —
       그래서 근태 달력·직원 급여 화면이 **한 줄도 안 바뀐다**.
     ★ 그 문서는 규칙상 **관리자 전용**이라 도우미 폰은 못 쓴다 → 서버(Admin SDK)가 쓴다.
     ★ **트랜잭션으로 그 칸만** 고친다 — 통째로 쓰면 관리자·다른 직원 기록을 지운다
       (앱 쪽도 같은 회차에 「바뀐 칸만」으로 바꿨다: writeStaffAttPatch).
     반환: { ok, kind:'in'|'out'|'done', time } | { error } */
  async function punchStaff(org, staffId) {
    const ref = A.db.collection('orgs').doc(org).collection('data').doc('staffAtt');
    const now = Date.now();
    const dateStr = kstDateStr(now);
    const timeStr = kstTimeStr(now);
    const key = String(staffId) + '_' + dateStr;
    try {
      return await A.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        let st = {}, prevStr = null;
        if (snap.exists) {
          prevStr = (snap.data() || {}).value || null;
          try { st = prevStr ? JSON.parse(prevStr) : {}; } catch (e) { st = {}; }
          if (!st || typeof st !== 'object' || Array.isArray(st)) st = {};
        }
        if (!st[key] || typeof st[key] !== 'object') st[key] = {};
        const rec = st[key];
        let kind;
        if (!rec.in)       { rec.in = timeStr;  kind = 'in'; }
        else if (!rec.out) { rec.out = timeStr; kind = 'out'; }
        else               { return { ok: true, kind: 'done', time: rec.out }; }
        tx.set(ref, { value: JSON.stringify(st), updatedAt: now });
        /* ★★ 「오늘 내 출퇴근」을 **배정 문서에도 같이** 적는다 (보여 주기 전용).
           왜 — `data/staffAtt` 는 규칙상 **관리자 전용**이라 도우미 폰이 못 읽는다.
           그것만 두면 도우미가 새로고침했을 때 출근 표시가 사라져, 「출근」 단추를 또 눌러
           **퇴근이 찍히는** 혼란이 생긴다(실제로 그렇게 된다).
           ★ 규칙을 바꾸지 않는 길을 골랐다 — 도우미는 **자기 배정 문서**를 읽을 수 있다
             (규칙 `drivers` read 의 `request.auth.uid == driverUid`).
           ★ 원본은 어디까지나 `data/staffAtt` 다. 이 칸은 **그 사람 오늘치 하나**뿐이고
             급여·근태 화면은 보지 않는다(같은 자료를 두 곳에서 고치는 일이 없다 — v272 교훈).
           ★ 같은 트랜잭션에 넣어 둘이 어긋나지 않게 한다. */
        tx.set(A.db.collection('orgs').doc(org).collection('drivers')
                 .doc(helperUidOf(org, staffId)),
               { att: { date: dateStr, in: rec.in || '', out: rec.out || '' } }, { merge: true });
        /* 백업 — 앱 `_backupBeforeSave` 와 **같은 자리·같은 꼴** */
        if (prevStr) {
          tx.set(A.db.collection('orgs').doc(org).collection('backups')
                   .doc('staffAtt__' + now),
                 { key: 'staffAtt', value: prevStr, backupAt: now });
        }
        return { ok: true, kind: kind, time: timeStr };
      });
    } catch (e) {
      console.log('[driver-auth] 직원 출퇴근 기록 실패');
      return { error: '기록하지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
    }
  }

  /* 호출자 확인 — 출퇴근을 찍을 수 있는 토큰인가 (checkin·checkout)
     ★ 43-C: **기사(차량) 또는 동승 도우미(직원)** 둘이다. 그 전에는 기사만이었다.
       앱은 같은 동작 이름(`checkin`·`checkout`)을 그대로 부르고, **누구인지는 토큰이 정한다**
       (동작을 새로 만들지 않은 이유: 앱 `driverPunch()` 와 화면이 그대로 쓰인다).
     ★ carId·staffId·org 는 **토큰에 박힌 값**만 쓴다 — 요청 본문의 값은 믿지 않는다. */
  async function requirePuncher() {
    const authz = String(req.headers.authorization || '');
    const idToken = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
    if (!idToken) return { error: '다시 로그인해 주세요.', code: 401 };
    let t;
    try { t = await A.auth.verifyIdToken(idToken); }
    catch (e) { return { error: '로그인이 만료됐어요. 다시 로그인해 주세요.', code: 401 }; }
    if (t.driver === true && t.org && t.carId) {
      return { uid: t.uid, org: String(t.org), carId: String(t.carId) };
    }
    if (t.helper === true && t.org && t.staffId) {
      /* 도우미는 **배정이 없어도 출퇴근은 된다** — 근태는 차량과 무관하다(사장님 추천대로).
         자료 범위(carData·carState)는 배정 문서가 가리지만, 출퇴근은 그 사람의 근태다. */
      return { uid: t.uid, org: String(t.org), staffId: String(t.staffId), helper: true };
    }
    return { error: '기사 로그인으로만 쓸 수 있어요.', code: 403 };
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
        /* 없는 번호는 **업체 단위로 세지 않는다** — 셀 업체가 없다.
           없는 번호로 미리 카운트를 쌓아 「앞으로 만들 번호」를 막는 길도 막는다.
           번호 찍어보기는 기기 10분 5회·IP 1시간 60회가 이미 누른다. 문구·상태코드도 같다. */
        await bumpFail(code, deviceId);
        await writeLogin('', '', false, 'nocode', deviceId, loc);
        return fail(res, 401, SAME);     // 없는 번호도 **같은 문구**
      }

      /* ── v260: 업체 단위 상한 — **묶이지 않은 기기**만 걸린다 ──
         이미 묶인 기기는 건너뛴다(평소 쓰는 기사 폰은 공격 중에도 그대로 들어온다). */
      const bound = await deviceBoundToOrg(org, deviceId);
      if (!bound && await orgOverLimit(org)) {
        await writeLogin(org, '', false, 'orglock', deviceId, loc);
        /* 기존 잠금과 **같은 꼴**로 답한다 — 업체가 있는지 없는지 새지 않게 */
        return fail(res, 429, '잠시 뒤 다시 시도해 주세요.', 'locked');
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
      /* ★★ 43-B(v281): 기사 PIN 이 아니면 **직원 PIN(`staffPins`)** 을 이어서 본다 — 동승 도우미.
         · 해시 재료는 기사와 **똑같다**(`sha256(pin|org|OTP_SECRET)`) — `want` 를 그대로 쓴다.
         · 틀린 PIN 셈(`bumpFail`·`bumpOrgFail`)은 **두 대조를 합쳐 한 번만** 센다(아래 한 자리).
           따로 세면 PIN 한 번에 잠금이 두 칸씩 올라 정상 기사가 절반 횟수에 잠긴다.
         · 못 찾았을 때의 문구·상태코드는 **종전 그대로**(`SAME` · 401) — 업체에 직원이 있는지,
           그 PIN 이 기사 것인지 직원 것인지 새지 않게 한다. */
      let staffId = null;
      if (!carId) {
        try {
          const snap = await A.db.collection('staffPins').where('org', '==', org).get();
          snap.forEach(d => {
            const v = d.data() || {};
            if (!staffId && sameHash(v.pinHash, want)) staffId = String(v.staffId || '');
          });
        } catch (e) { return fail(res, 500, '잠시 뒤 다시 시도해 주세요.'); }
      }
      if (!carId && !staffId) {
        await bumpFail(code, deviceId);
        /* v260: 묶이지 않은 기기의 실패만 업체 단위로 센다 */
        if (!bound) await bumpOrgFail(org);
        await writeLogin(org, '', false, 'badpin', deviceId, loc);
        return fail(res, 401, SAME);     // 틀린 PIN 도 **같은 문구**
      }

      /* 기기 묶기 — 첫 로그인 기기를 기억하고, 다른 기기는 거절.
         ★ 기사는 **차량 기준**(`<org>_<carId>`) · 도우미는 **사람 기준**(`<org>_hlp_<staffId>`) —
           도우미는 배정이 수시로 바뀌므로 차량 기준으로 묶으면 차량이 바뀔 때마다 기기가 풀린다.
         ★ 두 갈래가 **같은 코드**를 쓴다 — 복사해 두면 한쪽만 고쳐져 셈이 어긋난다
           (lib/otp-core.js 를 공용으로 둔 것과 같은 이유).
         반환: null 통과 / 'device' 다른 기기 */
      const bindDevice = async (docId, fields) => {
        const devRef = A.db.collection('driverDevices').doc(docId);
        const ds = await devRef.get();
        if (ds.exists && (ds.data() || {}).deviceId) {
          return String((ds.data() || {}).deviceId) === deviceId ? null : 'device';
        }
        await devRef.set(Object.assign({ org: org, deviceId: deviceId, boundAt: Date.now() }, fields));
        /* v260: 새 기기가 **제대로** 묶였다 — 업체 단위 실패 수를 비운다.
           (기사 여럿이 첫 로그인에서 잘못 눌러 20회가 차도 한 명이 들어오면 풀린다) */
        await clearOrgFail(org);
        return null;
      };

      /* ── 동승 도우미 (43-B) ──────────────────────────────────────────────
         차량은 **토큰에 넣지 않는다** — 배정이 수시로 바뀌므로, 보는 자리를
         `orgs/{org}/drivers/{uid}.carId` **하나**로 둔다(규칙 `myCarId` 가 보는 그 문서다).
         앱도 그 문서를 리스너로 듣는다 — 관리자가 배정을 바꾸면 바로 따라간다. */
      if (!carId) {
        const huid = helperUidOf(org, staffId);
        let hcar = '', howner = '', hexists = false;
        try {
          const hs = await A.db.collection('orgs').doc(org).collection('drivers').doc(huid).get();
          hexists = !!hs.exists;
          const hv = (hs.exists && hs.data()) || {};
          hcar = String(hv.carId || '');
          howner = String(hv.ownerUid || '');
        } catch (e) { return fail(res, 500, '잠시 뒤 다시 시도해 주세요.'); }
        /* ★★ v294(60-B2): **배정이 없어도 들어온다.** 사장님 결정 11-08 ③ —
           「PIN 있는 직원은 모두 자기 폰으로 출퇴근」. 근태는 차량과 무관하다
           (`requirePuncher` 는 43-C 부터 이미 **배정 없는 도우미**를 받는다).
           v293 까지는 여기서 403 `nocar` 로 막아, 직원이 관리자 기기 앞까지 가야 했다.
           ★ 자료 범위는 그대로 좁다 — 배정이 없으면 `myCarId` 가 빈 값이라 규칙이
             `carData/*`·`carState/*` 를 **거부한다**(규칙 한 줄도 안 바꿨다).
           ★ 화면은 **출근·퇴근만** 보여 준다(앱 `driverNoCarHtml` + v282 의 출퇴근 줄). */
        /* 업체가 살아 있나 — 기사와 **같은 함수·같은 문구** */
        const ownerUid2 = await resolveOwnerUid(org);
        if (!(await ownerAlive(ownerUid2))) {
          await writeLogin(org, hcar, false, 'expired', deviceId, loc);
          return fail(res, 403, '업체 이용 기간이 끝났거나 계정이 멈췄어요. 관리자에게 문의해 주세요.', 'expired');
        }
        try {
          const why = await bindDevice(org + '_hlp_' + staffId, { helper: true, staffId: staffId });
          if (why) {
            await writeLogin(org, hcar, false, 'device', deviceId, loc);
            return fail(res, 403, '등록된 기기가 아니에요. 관리자에게 기기 풀기를 요청하세요.', 'device');
          }
        } catch (e) { return fail(res, 500, '잠시 뒤 다시 시도해 주세요.'); }
        try {
          /* ★★ v294(60-B2): 문서가 **없으면 여기서 만든다**(배정 없는 직원).
             왜 서버가 만드나 — `drivers` 는 규칙이 `write: if false`(Admin SDK 전용)다.
             그리고 그 문서가 **있어야** 규칙 `isActiveDriver` 가 참이 되어 자기 배정 문서와
             `data/orgDriver`(업체 이름·업종 7칸)를 읽는다. `carId` 는 **빈 값**으로 둔다 —
             배정은 관리자가 `setCarHelper` 로만 정한다(로그인이 배정을 만들면 안 된다).
             ★ 이미 있으면 **`carId` 를 건드리지 않는다**(종전 그대로 소유자만 맞춘다). */
          if (!hexists) {
            await A.db.collection('orgs').doc(org).collection('drivers').doc(huid)
              .set({ role: 'helper', staffId: staffId, carId: '', ownerUid: ownerUid2, updatedAt: Date.now() });
          } else if (howner !== String(ownerUid2 || '')) {
            await A.db.collection('orgs').doc(org).collection('drivers').doc(huid)
              .set({ ownerUid: ownerUid2 }, { merge: true });
          }
          /* ★ `carId` 를 **넣지 않는다** — 차량을 보는 자리는 drivers 문서 하나뿐이다
             (users 에도 두면 둘이 어긋나고, 어긋난 쪽을 믿는 코드가 생긴다). */
          await A.db.collection('users').doc(huid).set(
            { role: 'helper', driverOrg: org, ownerUid: ownerUid2, staffId: staffId }, { merge: true });
        } catch (e) { return fail(res, 500, '잠시 뒤 다시 시도해 주세요.'); }
        let htoken;
        try {
          /* claim 에 **carId 가 없다** — 받는 번호·자료 범위는 서버·규칙이 배정 문서에서 읽는다 */
          htoken = await A.auth.createCustomToken(huid, { helper: true, org: org, staffId: staffId });
        } catch (e) {
          console.log('[driver-auth] createCustomToken 실패(도우미)', (e && e.code) || '');
          return fail(res, 500, '로그인 토큰을 만들지 못했어요. 관리자에게 알려 주세요.');
        }
        await clearFail(code, deviceId);
        await writeLogin(org, hcar, true, 'helper', deviceId, loc);
        return res.status(200).json({ ok: true, token: htoken, org: org, carId: hcar,
                                      helper: true, staffId: staffId });
      }

      /* 업체가 살아 있나 (만료·탈퇴면 기사도 잠김 — 사장님 결정) */
      const ownerUid = await resolveOwnerUid(org);
      if (!(await ownerAlive(ownerUid))) {
        await writeLogin(org, carId, false, 'expired', deviceId, loc);
        return fail(res, 403, '업체 이용 기간이 끝났거나 계정이 멈췄어요. 관리자에게 문의해 주세요.', 'expired');
      }

      try {
        const why = await bindDevice(org + '_' + carId, { carId: carId });
        if (why) {
          await writeLogin(org, carId, false, 'device', deviceId, loc);
          return fail(res, 403, '등록된 기기가 아니에요. 관리자에게 기기 풀기를 요청하세요.', 'device');
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

    /* ── b) 출근 / 퇴근 (기사 본인 · 43-C 부터 동승 도우미도) ── */
    if (action === 'checkin' || action === 'checkout') {
      const who = await requirePuncher();
      if (who.error) return fail(res, who.code, who.error);
      if (!(await ownerAlive((await resolveOwnerUid(who.org))))) {
        return fail(res, 403, '업체 이용 기간이 끝났어요. 관리자에게 문의해 주세요.', 'expired');
      }
      /* 기사는 차량 기록(`carState/{carId}.att`) · 도우미는 직원 근태(`data/staffAtt`) */
      const r = who.helper ? await punchStaff(who.org, who.staffId)
                           : await punch(who.org, who.carId);
      if (r.error) return fail(res, 500, r.error);
      await writeLogin(who.org, who.carId || '', true,
                       (who.helper ? 'punch:helper:' : 'punch:') + r.kind,
                       String(b.deviceId || ''),
                       b.loc && typeof b.loc === 'object' ? b.loc : null);
      const out = { ok: true, kind: r.kind, time: r.time, date: kstDateStr() };
      /* 앱이 **같은 키**(`st…_날짜`)로 폰에도 적을 수 있게 알려 준다 */
      if (who.helper) out.staffId = who.staffId;
      return res.status(200).json(out);
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
      /* ★ v280(43-A): 기사 PIN 이 아니면 **직원 PIN 해시**를 이어서 본다.
         직원 PIN 도 서버 `staffPins` 로 옮겨(평문 폐기) 앱에는 더 이상 없다 —
         앱이 혼자 맞추던 길이 없어졌으므로 여기서 가려 준다.
         ★ 기록은 **앱이 지금처럼** `staffAtt` 에 한다(직원 근태 저장 길은 안 바꿨다) —
           서버는 「누구인지」만 돌려준다. 그래서 급여·근태 화면이 한 줄도 안 바뀐다. */
      let staffId = null;
      if (!carId) {
        try {
          const snap = await A.db.collection('staffPins').where('org', '==', org).get();
          snap.forEach(d => {
            const v = d.data() || {};
            if (!staffId && sameHash(v.pinHash, want)) staffId = String(v.staffId || '');
          });
        } catch (e) { return fail(res, 500, '잠시 뒤 다시 시도해 주세요.'); }
      }
      /* 기사도 직원도 아니면 **앱이 «회원» PIN 으로 이어서 본다** — 404 로 알려 준다 */
      if (!carId && !staffId) return fail(res, 404, '기사 PIN 이 아니에요.', 'notdriver');
      /* ★★ v293(60-B1): `probe:true` — **대조만** 하고 **아무 것도 쓰지 않는다.**
         왜 — 판이 갈리면서(출결 판 = «회원» PIN 만) 출결 판에서 기사·직원 PIN 을 누른 사람에게
         「직원 PIN 이에요 — 근태 판에서 찍어 주세요」라고 **알려 주되 기록은 하지 않아야** 한다.
         종전 `pinCheckin` 은 대조와 **기록**이 한 몸이라 그 말을 할 방법이 없었다.
         ★ 돌려주는 것은 **`kind` 하나**다 — 이름·차량·직원 id·PIN·해시·시각을 넣지 않는다
           (누구인지까지 알려 줄 이유가 없다 · 출결 판은 「어느 판에서 찍어라」만 알면 된다).
         ★ `writeLogin`(기록)보다 **앞**에 둔다 — probe 는 `driverLogins` 에도 남기지 않는다.
         ★ 자리를 404 `notdriver` **뒤**에 둔 까닭은 종전과 같다(틀린 PIN 은 같은 404). */
      if (b.probe === true) {
        return res.status(200).json({ ok: true, kind: carId ? 'driver' : 'staff', probe: true });
      }
      if (!carId) {
        /* 직원 — 기간을 본 뒤(기사와 같은 자리) **서버가 찍는다** */
        if (!(await ownerAlive((await resolveOwnerUid(org))))) {
          return fail(res, 403, '업체 이용 기간이 끝났어요. 관리자에게 문의해 주세요.', 'expired');
        }
        /* ★★ v294(60-B2 · 56 해결): v293 까지는 「누구인지」만 돌려주고 **앱이** `staffAtt` 에
           적었다. 그러면 폰이 읽는 **사본**(`drivers/hlp_….att`)이 안 생겨, 판으로 찍은 출근이
           그 사람 폰에 **안 보였다**(새로고침하면 사라져 「출근」을 또 누르게 됐다 — 56).
           `punchStaff()` 는 원본(`data/staffAtt`)과 사본을 **같은 트랜잭션**에 넣는다.
           ★ 응답에 `kind:'staff'` 를 **그대로 둔다** — 배포 직후 잠깐 남아 있는 **옛 앱**이
             그 글자로 직원을 가리므로, 빼면 그 창이 기사 갈래로 잘못 들어간다.
             새 앱은 **`punch`**(in|out|done)를 보고 서버 값을 그대로 그린다. */
        const sr = await punchStaff(org, staffId);
        if (sr.error) return fail(res, 500, sr.error);
        await writeLogin(org, '', true, 'pad:staff:' + sr.kind, '', null);
        return res.status(200).json({ ok: true, kind: 'staff', staffId: staffId,
          punch: sr.kind, time: sr.time, date: kstDateStr() });
      }

      /* ★★ 코스로드46: 여기서도 **이용 기간**을 본다 (로그인·출퇴근과 같은 함수·같은 문구).
         `requireManager` 는 `orgId`·`approved`·`withdrawn` 만 보고 `paidUntil` 을 안 본다 —
         그래서 **기간이 끝난 업체도 이 패드로 기사 출퇴근을 계속 찍을 수 있었다**
         (punch 는 Admin SDK 라 규칙을 안 거친다 · 고치기 전 코드로 실측).
         ★ 자리를 **404 `notdriver` 뒤**에 둔다 — 앞에 두면 기간이 끝났을 때 직원·회원 PIN 도
           403 이 되어, 앱이 「기사 PIN 이 아니면 직원·회원으로 이어 본다」는 흐름을 못 탄다. */
      if (!(await ownerAlive((await resolveOwnerUid(org))))) {
        return fail(res, 403, '업체 이용 기간이 끝났어요. 관리자에게 문의해 주세요.', 'expired');
      }

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
