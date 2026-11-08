/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v276(코스로드42 긴급) — **기사 모드가 닿는 Firestore 경로 전수**를 실제 규칙(632)으로.
   ★ 이 묶음이 42 의 핵심이다: 「앱이 찔러 보는 문서」가 규칙에서 **허용인지**를 맞댄다.
     v275 까지 `driverAccessCheck` 는 `data/members` 를 찔렀고 — 아래 ①에서 **거부**가 나온다.
     v276 은 `data/orgDriver` 를 찌른다 — 아래 ①에서 **허용**이 나온다.
   ★ 막아야 할 때는 그대로 막히는지도 본다(만료 업체 기사 · PIN 지운 기사).
   ★ 여기서 나온 **허용/거부 표**를 크롬 묶음(pw262/run276.js)의 가짜 Firestore 가 그대로 쓴다. */
import fs from 'fs';
import cp from 'child_process';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';

const lf = (s) => String(s).split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));
const RULES = lf(fs.readFileSync('firestore.rules', 'utf8'));

let pass = 0, fail = 0;
const chk = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ✔ ' + label + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  ✘ ' + label + (extra ? '   ' + extra : '')); }
};

const ORG = 'cosroad_acme', OWNER = 'cosroad_acme';
const EXP_ORG = 'cosroad_exp', EXP_OWNER = 'exp_owner';
const DRV1 = 'drv_cosroad_acme_car1';                 /* 정상 기사 — car1 */
const NOPIN = 'drv_cosroad_acme_car9';                /* PIN 지움 — drivers 문서 없음 */
const EDRV = 'drv_cosroad_exp_car1';                  /* 만료 업체 기사 */
const NEW_ORG = 'cosroad_new', NEW_OWNER = 'new_owner';   /* 요약 문서가 아직 없는 새 업체 */
const NEWDRV = 'drv_cosroad_new_car1';
const now = Date.now(), DAY = 86400000;

const env = await initializeTestEnvironment({
  projectId: 'cos-276', firestore: { host: '127.0.0.1', port: 8988, rules: RULES }
});
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'users', OWNER), { orgId: ORG, bizType: 'academy', approved: true,
    withdrawn: false, paidUntil: now + 30 * DAY, plan: 'paid' });
  await setDoc(doc(db, 'users', EXP_OWNER), { orgId: EXP_ORG, bizType: 'academy', approved: true,
    withdrawn: false, paidUntil: now - DAY, plan: 'expired' });
  /* 정상 업체 */
  await setDoc(doc(db, 'orgs', ORG, 'drivers', DRV1), { carId: 'car1', ownerUid: OWNER, createdAt: now });
  await setDoc(doc(db, 'users', DRV1), { role: 'driver', driverOrg: ORG, ownerUid: OWNER, carId: 'car1' });
  /* 만료 업체 */
  await setDoc(doc(db, 'orgs', EXP_ORG, 'drivers', EDRV), { carId: 'car1', ownerUid: EXP_OWNER, createdAt: now });
  /* 새 업체 — 기사·차량은 있는데 `data/orgDriver` 문서를 **안 만들었다** */
  await setDoc(doc(db, 'users', NEW_OWNER), { orgId: NEW_ORG, bizType: 'academy', approved: true,
    withdrawn: false, paidUntil: now + 30 * DAY, plan: 'paid' });
  await setDoc(doc(db, 'orgs', NEW_ORG, 'drivers', NEWDRV), { carId: 'car1', ownerUid: NEW_OWNER, createdAt: now });
  for (const o of [ORG, EXP_ORG]) {
    for (const k of ['members', 'orgDriver', 'staffAtt', 'rideState', 'carlog', 'driverAtt'])
      await setDoc(doc(db, 'orgs', o, 'data', k), { value: '{}', updatedAt: now });
    for (const cid of ['car1', 'car2']) {
      await setDoc(doc(db, 'orgs', o, 'carData', cid), { value: '{}', updatedAt: now });
      await setDoc(doc(db, 'orgs', o, 'carState', cid), { value: '{"att":{}}', updatedAt: now });
    }
    await setDoc(doc(db, 'orgs', o, 'backups', 'carState_car1__1'),
      { key: 'carState/car1', value: '{}', backupAt: now });
  }
});
const asDrv = (uid, org, carId) =>
  env.authenticatedContext(uid, { driver: true, org: org, carId: carId }).firestore();

/* 허용/거부를 **재서** 표로 모은다 (크롬 묶음이 이 표를 그대로 쓴다) */
const TABLE = {};
async function probe(key, want, fn) {
  let ok;
  try { await fn(); ok = true; } catch (e) { ok = false; }
  TABLE[key] = ok ? 'allow' : 'deny';
  chk((want === 'allow' ? '허용' : '거부') + '  ' + key, (ok ? 'allow' : 'deny') === want,
      ok ? '' : '(거부됨)');
}

console.log('════ ① ★ 로그인 직후 「들어갈 수 있나」 확인에 쓰는 문서');
{
  const d = asDrv(DRV1, ORG, 'car1');
  await probe('read data/members  (v275 까지 이것을 찔렀다)', 'deny',
    () => getDoc(doc(d, 'orgs', ORG, 'data', 'members')));
  await probe('read data/orgDriver (v276 은 이것을 찌른다)', 'allow',
    () => getDoc(doc(d, 'orgs', ORG, 'data', 'orgDriver')));
  /* 요약 문서가 **아직 없는** 업체에서도 오류가 아닌가 (새 업체).
     ★ 반드시 **같은 키**(`orgDriver`)를 **문서가 없는 업체**에서 읽어야 한다 —
       처음엔 `orgDriverNotYet` 이라는 **다른 키**로 재다가 거부가 나왔다(그 키는
       driverReadableKey 에 없으니 당연히 거부다). 「없는 문서」와 「없는 키」는 다르다. */
  const nd = asDrv(NEWDRV, NEW_ORG, 'car1');
  await probe('read data/orgDriver — **문서가 없는 업체**에서도 오류 아님', 'allow',
    () => getDoc(doc(nd, 'orgs', NEW_ORG, 'data', 'orgDriver')));
}

console.log('\n② 기사 모드가 닿는 **모든** 경로 (앱 전수에서 뽑음)');
{
  const d = asDrv(DRV1, ORG, 'car1');
  await probe('read  carData/car1   (내 차량 사본)', 'allow',
    () => getDoc(doc(d, 'orgs', ORG, 'carData', 'car1')));
  await probe('read  carData/car2   (남의 차량)', 'deny',
    () => getDoc(doc(d, 'orgs', ORG, 'carData', 'car2')));
  await probe('read  carState/car1  (내 차량 기록)', 'allow',
    () => getDoc(doc(d, 'orgs', ORG, 'carState', 'car1')));
  await probe('read  carState/car2  (남의 차량)', 'deny',
    () => getDoc(doc(d, 'orgs', ORG, 'carState', 'car2')));
  await probe('write carState/car1  (탑승·차계부·완료 저장)', 'allow',
    () => setDoc(doc(d, 'orgs', ORG, 'carState', 'car1'), { value: '{}', updatedAt: now }));
  await probe('write carState/car2', 'deny',
    () => setDoc(doc(d, 'orgs', ORG, 'carState', 'car2'), { value: '{}', updatedAt: now }));
  await probe('create backups (key=carState/car1)', 'allow',
    () => setDoc(doc(d, 'orgs', ORG, 'backups', 'carState_car1__' + now),
                 { key: 'carState/car1', value: '{}', backupAt: now }));
  await probe('create backups (key=carState/car2)', 'deny',
    () => setDoc(doc(d, 'orgs', ORG, 'backups', 'carState_car2__' + now),
                 { key: 'carState/car2', value: '{}', backupAt: now }));
  await probe('list   backups  (_backupBeforeSave 의 오래된 것 정리)', 'deny',
    () => getDocs(collection(d, 'orgs', ORG, 'backups')));
  await probe('read  users/<내 uid>', 'allow',
    () => getDoc(doc(d, 'users', DRV1)));
  await probe('read  data/staffAtt (직원 근태)', 'deny',
    () => getDoc(doc(d, 'orgs', ORG, 'data', 'staffAtt')));
  await probe('read  data/rideState (옛 키)', 'deny',
    () => getDoc(doc(d, 'orgs', ORG, 'data', 'rideState')));
  await probe('write data/rideState (옛 키)', 'deny',
    () => setDoc(doc(d, 'orgs', ORG, 'data', 'rideState'), { value: '{}', updatedAt: now }));
}

console.log('\n③ ★ 막아야 할 때는 **그대로 막힌다** (v276 이 구멍을 내지 않았나)');
{
  /* 만료 업체 기사 — orgDriver 조차 못 읽어야 한다 */
  const e = asDrv(EDRV, EXP_ORG, 'car1');
  await probe('[만료] read data/orgDriver', 'deny',
    () => getDoc(doc(e, 'orgs', EXP_ORG, 'data', 'orgDriver')));
  await probe('[만료] read carData/car1', 'deny',
    () => getDoc(doc(e, 'orgs', EXP_ORG, 'carData', 'car1')));
  await probe('[만료] write carState/car1', 'deny',
    () => setDoc(doc(e, 'orgs', EXP_ORG, 'carState', 'car1'), { value: '{}', updatedAt: now }));
  /* PIN 지운 기사 — drivers 문서가 없다 */
  const n = asDrv(NOPIN, ORG, 'car9');
  await probe('[PIN 지움] read data/orgDriver', 'deny',
    () => getDoc(doc(n, 'orgs', ORG, 'data', 'orgDriver')));
  await probe('[PIN 지움] read carData/car9', 'deny',
    () => getDoc(doc(n, 'orgs', ORG, 'carData', 'car9')));
}

console.log('\n④ 앱이 정말 그 문서를 찌르나 (소스 대조)');
{
  const app = lf(process.env.COS_SRC_NEW_REF
    ? cp.execSync('git -C ' + COS_ROOT + ' show ' + process.env.COS_SRC_NEW_REF + ':index.html',
        { maxBuffer: 1 << 28 }).toString()
    : fs.readFileSync('' + COS_ROOT + '/index.html', 'utf8'));
  const m = app.match(/async function driverAccessCheck\(\)\{[\s\S]{0,1400}?\n\}/);
  const body = m ? m[0] : '';
  chk('driverAccessCheck 가 data/orgDriver 를 찌른다',
    /'data',\s*'orgDriver'/.test(body));
  chk('더 이상 data/members 를 안 찌른다', !/'data',\s*'members'/.test(body));
  /* 옛 판 대조 — c1c7b47 은 members 를 찔렀다 */
  const old = lf(cp.execSync('git -C ' + COS_ROOT + ' show c1c7b47:index.html',
    { maxBuffer: 1 << 28 }).toString());
  const om = old.match(/async function driverAccessCheck\(\)\{[\s\S]{0,1400}?\n\}/);
  chk('(대조) v275 는 data/members 를 찔렀다', !!om && /'data',\s*'members'/.test(om[0]));
  /* 앱 목록과 규칙 목록이 같은가 */
  const rk = (RULES.match(/function driverReadableKey\(key\) \{\s*return key in \[([\s\S]*?)\];/) || [])[1] || '';
  chk("규칙 읽기 키가 ['orgDriver'] 뿐", (rk.match(/'([^']+)'/g) || []).join(',') === "'orgDriver'", rk.trim());
}

console.log('\n── 측정한 허용/거부 표 (크롬 묶음이 그대로 쓴다) ──');
console.log(JSON.stringify(TABLE, null, 1));
fs.writeFileSync('t276_table.json', JSON.stringify(TABLE, null, 1));

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
  : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
