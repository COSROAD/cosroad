/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v275(40-C) 규칙 — 운행 기록·출퇴근이 차량별 문서로.
   ★ 대조 먼저: 옛 규칙(889fbec · v274)에서는 기사가 `data/rideState` 등 다섯 키를
     읽고 쓸 수 있었음을 보인 뒤, 새 규칙에서 막히는지 본다. */
import fs from 'fs';
import cp from 'child_process';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const lf = (s) => String(s).split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));
const NEW_RULES = lf(fs.readFileSync('firestore.rules', 'utf8'));
const OLD_REF = process.env.COS_RULES_OLD_REF || '889fbec';          /* v274 */
const OLD_RULES = lf(cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':firestore.rules',
  { maxBuffer: 1 << 26 }).toString());

let pass = 0, fail = 0;
const chk = (label, cond) => { if (cond) { pass++; console.log('  ✔ ' + label); }
                               else { fail++; console.log('  ✘ ' + label); } };
const ORG = 'cosroad_acme', OWNER = 'cosroad_acme', EXPIRED = 'cosroad_exp';
const MASTER = 'MASTER1', DEMO = 'cosroad_demo';
const DRV1 = 'drv_cosroad_acme_car1', DRV2 = 'drv_cosroad_acme_car2';
const now = Date.now(), DAY = 86400000;
const FIVE = ['rideState', 'carlog', 'deliveryDone', 'dropoffDone', 'driverAtt'];

async function makeEnv(id, rules) {
  const env = await initializeTestEnvironment({
    projectId: id, firestore: { host: '127.0.0.1', port: 8988, rules: rules }
  });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'admins', MASTER), { role: 'master' });
    await setDoc(doc(db, 'users', OWNER), { orgId: ORG, bizType: 'academy', approved: true,
      withdrawn: false, paidUntil: now + 30 * DAY, plan: 'paid' });
    await setDoc(doc(db, 'users', EXPIRED), { orgId: EXPIRED, bizType: 'academy', approved: true,
      withdrawn: false, paidUntil: now - DAY, plan: 'expired' });
    for (const o of [ORG, EXPIRED, DEMO]) {
      await setDoc(doc(db, 'orgs', o, 'drivers', DRV1), { carId: 'car1', ownerUid: OWNER, createdAt: now });
      await setDoc(doc(db, 'orgs', o, 'drivers', DRV2), { carId: 'car2', ownerUid: OWNER, createdAt: now });
      for (const k of FIVE.concat(['orgDriver', 'staffAtt', 'migration', 'members']))
        await setDoc(doc(db, 'orgs', o, 'data', k), { value: '{}', updatedAt: now });
      for (const cid of ['car1', 'car2']) {
        await setDoc(doc(db, 'orgs', o, 'carData', cid), { value: '{}', updatedAt: now });
        await setDoc(doc(db, 'orgs', o, 'carState', cid), { value: '{"att":{}}', updatedAt: now });
      }
    }
  });
  return env;
}
const ctxDrv = (env, uid, carId) =>
  env.authenticatedContext(uid, { driver: true, org: ORG, carId: carId }).firestore();
const ctx = (env, uid) => env.authenticatedContext(uid, {}).firestore();
async function t(label, want, fn) {
  try {
    await (want === 'allow' ? assertSucceeds(fn()) : assertFails(fn()));
    pass++; console.log('  ✔ ' + (want === 'allow' ? '허용' : '거부') + '  ' + label);
  } catch (e) { fail++; console.log('  ✘ ' + (want === 'allow' ? '허용기대→거부' : '거부기대→허용') + '  ' + label); }
}

console.log('════ ① 대조 — 옛 규칙(v274)에서 기사가 다섯 키를 읽고 썼나');
{
  const env = await makeEnv('cos-275-old', OLD_RULES);
  for (const k of FIVE) {
    await t('[옛] 기사 → ' + k + ' 읽기', 'allow',
      () => getDoc(doc(ctxDrv(env, DRV1, 'car1'), 'orgs', ORG, 'data', k)));
  }
  for (const k of ['rideState', 'carlog', 'deliveryDone', 'dropoffDone']) {
    await t('[옛] 기사 → ' + k + ' **쓰기**', 'allow',
      () => setDoc(doc(ctxDrv(env, DRV1, 'car1'), 'orgs', ORG, 'data', k), { value: '{}', updatedAt: 1 }));
  }
  await t('[옛] 기사 → carState 읽기 (그때는 그 블록이 없었다)', 'deny',
    () => getDoc(doc(ctxDrv(env, DRV1, 'car1'), 'orgs', ORG, 'carState', 'car1')));
  await env.cleanup();
}

console.log('\n② 새 규칙 — 다섯 키는 막히고 자기 차량 문서만 열린다');
const env = await makeEnv('cos-275-new', NEW_RULES);
for (const k of FIVE) {
  await t('기사 → ' + k + ' 읽기', 'deny',
    () => getDoc(doc(ctxDrv(env, DRV1, 'car1'), 'orgs', ORG, 'data', k)));
  await t('기사 → ' + k + ' 쓰기', 'deny',
    () => setDoc(doc(ctxDrv(env, DRV1, 'car1'), 'orgs', ORG, 'data', k), { value: '{}', updatedAt: 2 }));
}
await t('기사 → orgDriver 읽기 (남은 하나)', 'allow',
  () => getDoc(doc(ctxDrv(env, DRV1, 'car1'), 'orgs', ORG, 'data', 'orgDriver')));
await t('기사 → staffAtt 읽기 (직원 근태)', 'deny',
  () => getDoc(doc(ctxDrv(env, DRV1, 'car1'), 'orgs', ORG, 'data', 'staffAtt')));

console.log('\n③ carState — 자기 차량만 읽고 쓴다 (기사끼리 못 덮는다)');
await t('1호차 기사 → 자기 carState 읽기', 'allow',
  () => getDoc(doc(ctxDrv(env, DRV1, 'car1'), 'orgs', ORG, 'carState', 'car1')));
await t('1호차 기사 → 자기 carState 쓰기', 'allow',
  () => setDoc(doc(ctxDrv(env, DRV1, 'car1'), 'orgs', ORG, 'carState', 'car1'),
    { value: '{"att":{"2026-11-05":{"in":"08:30"}}}', updatedAt: 3 }));
await t('1호차 기사 → **2호차** carState 읽기 ★', 'deny',
  () => getDoc(doc(ctxDrv(env, DRV1, 'car1'), 'orgs', ORG, 'carState', 'car2')));
await t('1호차 기사 → **2호차** carState 쓰기 ★ (남의 기록 덮기)', 'deny',
  () => setDoc(doc(ctxDrv(env, DRV1, 'car1'), 'orgs', ORG, 'carState', 'car2'), { value: '{}', updatedAt: 4 }));
await t('2호차 기사 → 자기 carState 쓰기 (서로 막지 않는다)', 'allow',
  () => setDoc(doc(ctxDrv(env, DRV2, 'car2'), 'orgs', ORG, 'carState', 'car2'), { value: '{}', updatedAt: 5 }));
await t('토큰에 carId=car2 라 적고 2호차 쓰기', 'deny',
  () => setDoc(doc(ctxDrv(env, DRV1, 'car2'), 'orgs', ORG, 'carState', 'car2'), { value: '{}', updatedAt: 6 }));

console.log('\n④ 백업 — 기사는 **자기 carState 것만** 남길 수 있다');
await t('기사 → carState/car1 백업 create', 'allow',
  () => setDoc(doc(ctxDrv(env, DRV1, 'car1'), 'orgs', ORG, 'backups', 'carState_car1__1'),
    { key: 'carState/car1', value: '{}', backupAt: 1 }));
await t('기사 → **carState/car2** 백업 create ★', 'deny',
  () => setDoc(doc(ctxDrv(env, DRV1, 'car1'), 'orgs', ORG, 'backups', 'carState_car2__1'),
    { key: 'carState/car2', value: '{}', backupAt: 1 }));
await t('기사 → members 백업 create (옛 분기는 닫혔다)', 'deny',
  () => setDoc(doc(ctxDrv(env, DRV1, 'car1'), 'orgs', ORG, 'backups', 'members__1'),
    { key: 'members', value: '[]', backupAt: 1 }));
await t('기사 → 백업 읽기 (v255대로 막힘)', 'deny',
  () => getDoc(doc(ctxDrv(env, DRV1, 'car1'), 'orgs', ORG, 'backups', 'carState_car1__1')));
await t('관리자 → 아무 백업 create', 'allow',
  () => setDoc(doc(ctx(env, OWNER), 'orgs', ORG, 'backups', 'members__2'),
    { key: 'members', value: '[]', backupAt: 2 }));

console.log('\n⑤ 관리자·마스터·만료·데모');
await t('소유자 → 모든 차량 carState 읽기·쓰기', 'allow',
  () => setDoc(doc(ctx(env, OWNER), 'orgs', ORG, 'carState', 'car2'), { value: '{}', updatedAt: 7 }));
await t('소유자 → staffAtt 쓰기', 'allow',
  () => setDoc(doc(ctx(env, OWNER), 'orgs', ORG, 'data', 'staffAtt'), { value: '{}', updatedAt: 8 }));
await t('소유자 → migration 쓰기 (옮김 표시)', 'allow',
  () => setDoc(doc(ctx(env, OWNER), 'orgs', ORG, 'data', 'migration'), { value: '{}', updatedAt: 9 }));
await t('(대조) 마스터 → 남의 업체 carState', 'deny',
  () => getDoc(doc(ctx(env, MASTER), 'orgs', ORG, 'carState', 'car1')));
await t('남의 업체 소유자 → carState', 'deny',
  () => getDoc(doc(ctx(env, EXPIRED), 'orgs', ORG, 'carState', 'car1')));
await t('로그인 안 함 → carState', 'deny',
  () => getDoc(doc(env.unauthenticatedContext().firestore(), 'orgs', ORG, 'carState', 'car1')));
await t('만료 업체 → carState **읽기만**', 'allow',
  () => getDoc(doc(ctx(env, EXPIRED), 'orgs', EXPIRED, 'carState', 'car1')));
await t('만료 업체 → carState 쓰기', 'deny',
  () => setDoc(doc(ctx(env, EXPIRED), 'orgs', EXPIRED, 'carState', 'car1'), { value: '{}', updatedAt: 10 }));
await t('둘러보기(_demo) → carState 읽기', 'allow',
  () => getDoc(doc(ctx(env, OWNER), 'orgs', DEMO, 'carState', 'car1')));
await t('둘러보기(_demo) → carState 쓰기', 'deny',
  () => setDoc(doc(ctx(env, OWNER), 'orgs', DEMO, 'carState', 'car1'), { value: '{}', updatedAt: 11 }));

console.log('\n⑥ 규칙 글 · 앱 목록과 같은가');
{
  const rm = NEW_RULES.match(/function driverReadableKey\(key\) \{\s*return key in \[([\s\S]*?)\];/);
  const rk = rm ? rm[1].match(/'([^']+)'/g).map((x) => x.replace(/'/g, '')) : [];
  chk('규칙 읽기 키 **하나**뿐 (' + rk.join(',') + ')', rk.length === 1 && rk[0] === 'orgDriver');
  chk('규칙 쓰기 키는 **항상 거짓**',
    /function driverWritableKey\(key\) \{\s*return false;\s*\}/.test(NEW_RULES));
  chk('carState 블록이 있다', /match \/orgs\/\{orgId\}\/carState\/\{carId\}/.test(NEW_RULES));
  chk('백업 기사 분기가 carState 글자를 본다',
    /request\.resource\.data\.key == 'carState\/' \+ myCarId\(orgId\)/.test(NEW_RULES));
  const app = lf(process.env.COS_SRC_NEW_REF
    ? cp.execSync('git -C ' + COS_ROOT + ' show ' + process.env.COS_SRC_NEW_REF + ':index.html',
        { maxBuffer: 1 << 28 }).toString()
    : fs.readFileSync('' + COS_ROOT + '/index.html', 'utf8'));
  const am = app.match(/var DRIVER_READ_KEYS = \[([\s\S]*?)\];/);
  const ak = am ? (am[1].match(/'([^']+)'/g) || []).map((x) => x.replace(/'/g, '')) : null;
  chk('앱 DRIVER_READ_KEYS 가 규칙과 같다 (' + (ak || []).join(',') + ')',
    ak && ak.length === 1 && ak[0] === 'orgDriver');
  const wm = app.match(/var DRIVER_WRITE_KEYS = \[([\s\S]*?)\];/);
  chk('앱 DRIVER_WRITE_KEYS 가 **빈 배열**', wm && !/'/.test(wm[1]));
  /* 서버도 같은 자리를 고치나 */
  const api = lf(cp.execSync('git -C ' + COS_ROOT + ' show :api/driver-auth.js', { maxBuffer: 1 << 26 })
    .toString() || fs.readFileSync('' + COS_ROOT + '/api/driver-auth.js', 'utf8'));
  const apiNow = lf(fs.readFileSync('' + COS_ROOT + '/api/driver-auth.js', 'utf8'));
  chk("서버 punch 가 carState 문서를 고친다",
    /collection\('carState'\)\.doc\(String\(carId\)\)/.test(apiNow));
  chk('서버 백업 key 가 앱과 같은 글자', /'carState\/' \+ String\(carId\)/.test(apiNow));
  const n = NEW_RULES.split('\n').length - (NEW_RULES.endsWith('\n') ? 1 : 0);
  console.log('      규칙 줄 수: ' + n + '줄 (v274 608 → +' + (n - 608) + ')');
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
  : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
