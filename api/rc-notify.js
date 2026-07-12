// ═══════════════════════════════════════════════════════════
//  ROADCREW 알림 문자 (알리고 SMS)
//  앱 → 이 함수 → 알리고
//
//  보안 설계
//   1. 알리고 키는 Vercel 환경변수에만 있음 (앱에는 없음)
//   2. 로그인한 사용자만 호출 가능 (Firebase ID 토큰 검증)
//   3. 문자 내용·받는 사람을 앱이 정할 수 없음.
//      서버가 Firestore에서 원본을 직접 읽어서 만든다.
//      → 앱을 조작해도 아무 번호로 아무 문자나 못 보냄
// ═══════════════════════════════════════════════════════════

const RC_PROJECT = 'roadcrew-1e9cd';
const RC_WEB_KEY = 'AIzaSyBUed_pgSzq6kmtZ3y5fPexV-7mEGzJSuw'; // 공개 키 (원래 앱에 노출되는 값)
const FS = `https://firestore.googleapis.com/v1/projects/${RC_PROJECT}/databases/(default)/documents`;

/* Firestore REST 응답을 평범한 객체로 */
function flat(doc) {
  const f = (doc && doc.fields) || {};
  const o = {};
  for (const k in f) {
    const v = f[k];
    o[k] = v.stringValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue ?? v.timestampValue ?? null;
  }
  return o;
}

async function fsGet(path, idToken) {
  const r = await fetch(`${FS}/${path}`, { headers: { Authorization: 'Bearer ' + idToken } });
  if (!r.ok) return null;
  return flat(await r.json());
}

function fmt(p) {
  return String(p || '').replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
}

/* ── 문자 문구 (서버가 만든다) ── */
const TPL = {
  apply: (a) =>
    '[로드크루] 새 지원자\n\n'
    + '공고: ' + (a.jobTitle || '-') + '\n'
    + '기사: ' + (a.driverName || '-') + '\n'
    + '연락처: ' + fmt(a.driverPhone) + '\n\n'
    + '앱에서 지원자 프로필을 확인하세요.\nroadcrew.kr/company.html',

  offer: (a) =>
    '[로드크루] 채용 제안이 도착했습니다\n\n'
    + '업체: ' + (a.company || '-') + '\n'
    + '공고: ' + (a.jobTitle || '-') + '\n\n'
    + '앱에서 내용을 확인하고 응답해 주세요.\nroadcrew.kr',

  hired: (a) =>
    '[로드크루] 🎉 채용이 확정되었습니다\n\n'
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
    + '다른 좋은 공고가 많이 있습니다.\nroadcrew.kr'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST만 허용' });

  try {
    const { idToken, appId, kind } = req.body || {};
    if (!idToken || !appId || !kind) return res.status(400).json({ ok: false, message: '필수 항목 누락' });
    if (!TPL[kind]) return res.status(400).json({ ok: false, message: '알 수 없는 종류: ' + kind });

    const KEY    = process.env.ALIGO_KEY;
    const USERID = process.env.ALIGO_USER_ID;
    const SENDER = process.env.ALIGO_SENDER;
    if (!KEY || !USERID || !SENDER) {
      return res.status(500).json({ ok: false, message: '서버에 알리고 설정이 없습니다.' });
    }

    /* 1) 로그인 확인 — 진짜 로드크루 사용자인지 */
    const vr = await fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + RC_WEB_KEY,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
    );
    const vj = await vr.json();
    const uid = vj && vj.users && vj.users[0] && vj.users[0].localId;
    if (!uid) return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });

    /* 2) 원본을 서버가 직접 읽는다 (앱이 준 내용은 안 믿는다) */
    const a = await fsGet('applications/' + encodeURIComponent(appId), idToken);
    if (!a) return res.status(404).json({ ok: false, message: '지원 내역을 찾을 수 없습니다.' });

    /* 3) 당사자만 발송 가능 */
    if (uid !== a.driverId && uid !== a.companyId) {
      return res.status(403).json({ ok: false, message: '권한이 없습니다.' });
    }

    /* 4) 받는 사람도 서버가 정한다 */
    let to = '';
    if (kind === 'apply') {
      if (uid !== a.driverId) return res.status(403).json({ ok: false, message: '권한이 없습니다.' });
      const c = await fsGet('companies/' + encodeURIComponent(a.companyId || ''), idToken);
      to = (c && c.phone) || '';
    } else {
      if (uid !== a.companyId) return res.status(403).json({ ok: false, message: '권한이 없습니다.' });
      to = a.driverPhone || '';
    }

    to = String(to).replace(/[^0-9]/g, '');
    if (!/^01[0-9]{8,9}$/.test(to)) {
      return res.status(200).json({ ok: false, message: '받는 사람 번호가 없어 문자를 보내지 않았습니다.' });
    }

    /* 5) 발송 */
    const msg = TPL[kind](a);
    const form = new URLSearchParams();
    form.append('key', KEY);
    form.append('user_id', USERID);
    form.append('sender', SENDER);
    form.append('receiver', to);
    form.append('msg', msg);
    form.append('msg_type', msg.length > 90 ? 'LMS' : 'SMS');
    form.append('title', '로드크루');

    const ar = await fetch('https://apis.aligo.in/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form.toString()
    });
    const data = await ar.json();

    return res.status(200).json({ ok: String(data.result_code) === '1', aligo: data });
  } catch (e) {
    return res.status(500).json({ ok: false, message: '서버 오류: ' + (e && e.message ? e.message : String(e)) });
  }
}
