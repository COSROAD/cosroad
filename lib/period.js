// COSROAD — 이용 기간 날짜 셈 (KST 한 벌) (v263)
// 쓰는 곳: api/admin-account.js (승인·연장·기간 정하기)
//
// 왜 따로 뺐나 — 승인·연장·기간 정하기 **세 동작이 같은 셈**을 해야 한다.
//   복사해 두면 한쪽만 고쳐져 「체험 끝」과 「이용 끝」이 어긋난다.
//   (앱 화면에도 같은 셈의 **미리 보기**가 있다 — 그쪽은 보여 주기만 하고,
//    실제로 저장되는 값은 **언제나 이 파일**이 정한다. 두 셈이 같은지는 같은 표로 시험한다.)
//
// ★ api/ 밖에 둔 이유 — Vercel 공식 문서(/docs/functions/runtimes/node-js):
//   "Vercel creates a separate function for each supported source file in the root `api/` directory."
//   "Keep shared utilities and route modules outside `api/` and import them from your function entry point."
//   (v261 lib/otp-core.js 와 같은 자리·같은 이유)
//
// ── 사장님 결정 (11-03) ───────────────────────────────────────────────────
//   · 하루의 끝 = 그날 **23:59:59.999 KST** 까지 이용
//   · 달을 더했을 때 **같은 날짜가 없으면 그 달 말일로 당긴다** (1/31 +1달 → 2/28·29)
//   · 승인하면: trialEnd = 오늘 + trialDays 일 / paidUntil = trialEnd 날짜 + months 달
//
// ※ 서버 시계는 UTC 다. KST 로 보려면 9시간을 더해 **UTC 꺼내기**로 읽는다
//   (api/driver-auth.js 가 쓰는 방식 그대로 — 폰·브라우저 시계를 바꿔도 안 흔들린다).

export const KST_OFFSET = 9 * 3600 * 1000;

/* 밀리초 → KST 날짜 조각 { y, m(1~12), d } */
export function kstParts(ms) {
  const t = new Date(Number(ms) + KST_OFFSET);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/* 그 달의 마지막 날 (m 은 1~12) */
export function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();   // 다음 달 0일 = 이번 달 말일
}

/* KST 로 y-m-d 23:59:59.999 인 순간의 밀리초 */
export function kstEndOfDay(y, m, d) {
  return Date.UTC(y, m - 1, d, 23, 59, 59, 999) - KST_OFFSET;
}

/* 그 순간이 속한 KST 날짜의 끝 */
export function endOfDayMs(ms) {
  const p = kstParts(ms);
  return kstEndOfDay(p.y, p.m, p.d);
}

/* KST 날짜에 n일을 더한 날의 끝 */
export function addDaysEnd(ms, n) {
  const p = kstParts(ms);
  const base = Date.UTC(p.y, p.m - 1, p.d) + Number(n) * 86400000;
  const t = new Date(base);
  return kstEndOfDay(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/* KST 날짜에 n달을 더한 날의 끝 — **같은 날짜가 없으면 그 달 말일로 당긴다** */
export function addMonthsEnd(ms, n) {
  const p = kstParts(ms);
  const total = (p.y * 12 + (p.m - 1)) + Number(n);
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const d = Math.min(p.d, lastDayOfMonth(y, m));      // 2/30 → 2/28(29) · 6/31 → 6/30
  return kstEndOfDay(y, m, d);
}

/* 'YYYY-MM-DD' → 그날 끝 (못 읽으면 null) */
export function dateStrEnd(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > lastDayOfMonth(y, mo)) return null;
  return kstEndOfDay(y, mo, d);
}

/* 밀리초 → 'YYYY-MM-DD' (KST) — 화면·문자·기록에 쓰는 표기 */
export function dateStr(ms) {
  const p = kstParts(ms);
  return p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0');
}

/* ── 세 동작이 쓰는 셈 ──────────────────────────────────────────────────── */

/* 승인: 오늘부터 trialDays 일이 체험, 그 다음부터 months 달이 유료 */
export function approvePeriod(nowMs, trialDays, months) {
  const trialEnd = addDaysEnd(nowMs, Number(trialDays));
  const paidUntil = addMonthsEnd(trialEnd, Number(months));
  return { trialEnd, paidUntil };
}

/* 연장: 남은 기간이 있으면 그 뒤에 붙이고, 이미 지났으면 오늘부터 센다 */
export function extendPeriod(nowMs, curPaidUntil, months) {
  const base = Math.max(Number(curPaidUntil) || 0, endOfDayMs(nowMs));
  return addMonthsEnd(base, Number(months));
}
