// ═══════════════════════════════════════════════════════════
//  ROADCREW 알림 문자 (알리고 SMS)
//
//  보안 설계
//   1. 알리고 키는 Vercel 환경변수에만 있음 (앱에는 없음)
//   2. 로그인한 사용자만 호출 가능 (Firebase ID 토큰 검증)
//   3. 문자 내용·받는 사람을 앱이 정할 수 없음.
//      서버가 서비스 계정(관리자) 권한으로 Firestore 원본을 읽어서 만든다.
//   4. 같은 알림은 한 번만 발송 (중복·스팸·요금폭탄 차단)
//
//  Vercel 환경변수
//   ALIGO_KEY, ALIGO_USER_ID, ALIGO_SENDER
//   RC_SA_EMAIL  서비스 계정 client_email
//   RC_SA_KEY    서비스 계정 private_key
// ═══════════════════════════════════════════════════════════

import crypto from 'crypto';

const RC_PROJECT = 'roadcrew-1e9cd';
const RC_WEB_KEY = 'AIzaSyBUed_pgSzq6kmtZ3y5fPexV-7mEGzJSuw';
const FS = `https://firestore.googleapis.com/v1/projects/${RC_PROJECT}/databases/(default)/documents`;
const ALLOWED = ['https://roadcrew.kr', 'https://www.roadcrew.kr'];

let _tok = null;

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function adminToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_tok && _tok.exp > now + 60) return _tok.token;

  const email = process.env.RC_SA_EMAIL;
  let key = (process.env.RC_SA_KEY || '').replace(/\\n/g, '\n').trim();
  if (!email || !key) throw new Error('서비스 계정 설정 누락 (RC_SA_EMAIL / RC_SA_KEY)');

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(header + '.' + claim);
  const sig = b64url(signer.sign(key));

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: header + '.' + claim + '.' + sig
    })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('관리자 토큰 발급 실패: ' + JSON.stringify(j));
  _tok = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return _tok.token;
}

function flat(doc) {
  const f = (doc && doc.fields) || {};
  const o = {};
  for (const k in f) {
    const v = f[k];
    o[k] = v.stringValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue ?? v.timestampValue ?? null;
  }
  return o;
}

async function fsGet(path) {
  const t = await adminToken();
  const r = await fetch(`${FS}/${path}`, { headers: { Authorization: 'Bearer ' + t } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Firestore 읽기 실패 (' + r.status + ') ' + path);
  return flat(await r.json());
}

async function fsMark(path, field) {
  const t = await adminToken();
  await fetch(`${FS}/${path}?updateMask.fieldPaths=${field}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [field]: { timestampValue: new Date().toISOString() } } })
  });
}

function fmt(p) {
  return String(p || '').replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
}

function byteLen(s) {
  let n = 0;
  for (const ch of String(s)) n += ch.charCodeAt(0) < 128 ? 1 : 2;
  return n;
}

const TPL = {
  apply: (a) =>
    '[로드크루] 새 지원자\n\n'
    + '공고: ' + (a.jobTitle || '-') + '\n'
    + '기사: ' + (a.driverName || '-') + '\n'
    + '연락처: ' + fmt(a.driverPhone) + '\n\n'
    + '앱에서 지원자 프로필을 확인하세요.\nroadcrew.kr',
  offer: (a) =>
    '[로드크루] 채용 제안이 도착했습니다\n\n'
    + '업체: ' + (a.company || '-') + '\n'
    + '공고: ' + (a.jobTitle || '-') + '\n\n'
    + '앱에서 내용을 확인해 주세요.\nroadcrew.kr',
  hired: (a) =>
    '[로드크루] 채용이 확정되었습니다\n\n'
    + '업체: ' + (a.company || '-') + '\n'
    + '공고: ' + (a.jobTitle || '-') + '\n\n'
    + '업체에서 곧 연락드릴 예정입니다.\nroadcrew.kr',
  contact: (a) =>
    '[로드크루] 업체가 연락을 준비 중입니다\n\n'
    + '업체: ' + (a.company || '-') + '\n'
    + '공고: ' + (a.jobTitle || '-') + '\n\n'
    + '전화를 받아 주세요.\nroadcrew.kr',
  rejected: (a) =>
    '[로드크루] 지원 결과 안내\n\n'
    + '공고: ' + (a.jobTitle || '-') + '\n\n'
    + '아쉽게도 이번에는 함께하지 못하게 되었습니다.\n'
    + '다른 좋은 공고가 많이 있습니다.\nroadcrew.kr',

  /* 기사가 채용 제안을 수락 -> 업체에 알림 */
  accepted: (a) =>
    '[로드크루] 기사님이 제안을 수락했습니다\n\n'
    + '공고: ' + (a.jobTitle || '-') + '\n'
    + '기사: ' + (a.driverName || '-') + '\n'
    + '연락처: ' + fmt(a.driverPhone) + '\n\n'
    + '기사님께 연락해 주세요.\nroadcrew.kr'
};

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED.includes(origin) ? origin : ALLOWED[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST만 허용' });

  try {
    const { idToken, appId, kind } = req.body || {};
    if (!idToken || !appId || !kind) return res.status(400).json({ ok: false, message: '필수 항목 누락' });
    if (!TPL[kind]) return res.status(400).json({ ok: false, message: '알 수 없는 종류: ' + kind });

    const KEY = process.env.ALIGO_KEY;
    const USERID = process.env.ALIGO_USER_ID;
    const SENDER = process.env.ALIGO_SENDER;
    if (!KEY || !USERID || !SENDER) return res.status(500).json({ ok: false, message: '서버에 알리고 설정이 없습니다.' });

    const vr = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + RC_WEB_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken })
    });
    const vj = await vr.json();
    const uid = vj && vj.users && vj.users[0] && vj.users[0].localId;
    if (!uid) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });

    const appPath = 'applications/' + encodeURIComponent(appId);
    const a = await fsGet(appPath);
    if (!a) return res.status(404).json({ ok: false, message: '지원 내역을 찾을 수 없습니다.' });

    /* 기사가 보내는 알림: apply(지원), accepted(제안 수락) -> 업체에게 간다
       업체가 보내는 알림: offer(제안), hired/contact/rejected(상태변경) -> 기사에게 간다 */
    const fromDriver = (kind === 'apply' || kind === 'accepted');
    if (fromDriver) {
      if (uid !== a.driverId) return res.status(403).json({ ok: false, message: '권한이 없습니다.' });
    } else {
      if (uid !== a.companyId) return res.status(403).json({ ok: false, message: '권한이 없습니다.' });
    }

    const mark = 'sms_' + kind;
    if (a[mark]) return res.status(200).json({ ok: true, skipped: true, message: '이미 발송된 알림입니다.' });

    let to = '';
    if (fromDriver) {
      const c = await fsGet('companies/' + encodeURIComponent(a.companyId || ''));
      to = (c && c.phone) || '';
    } else {
      to = a.driverPhone || '';
    }
    to = String(to).replace(/[^0-9]/g, '');
    if (!/^01[0-9]{8,9}$/.test(to)) {
      return res.status(200).json({ ok: false, message: '받는 사람 번호가 없어 문자를 보내지 않았습니다.' });
    }

    const msg = TPL[kind](a);
    const form = new URLSearchParams();
    form.append('key', KEY);
    form.append('user_id', USERID);
    form.append('sender', SENDER);
    form.append('receiver', to);
    form.append('msg', msg);
    form.append('msg_type', byteLen(msg) > 90 ? 'LMS' : 'SMS');
    form.append('title', '로드크루');

    const ar = await fetch('https://apis.aligo.in/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form.toString()
    });
    const data = await ar.json();
    const sent = String(data.result_code) === '1';
    if (sent) await fsMark(appPath, mark).catch(function(){});

    return res.status(200).json({
      ok: sent,
      message: sent ? '문자를 보냈습니다.' : ('문자 발송 실패: ' + (data.message || '')),
      aligo: data
    });
  } catch (e) {
    console.error('rc-notify 오류:', e);
    return res.status(500).json({ ok: false, message: '서버 오류: ' + (e && e.message ? e.message : String(e)) });
  }
}
