/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
import { fileURLToPath as _cosF } from 'url';
import { dirname as _cosD, resolve as _cosR } from 'path';
const COS_ROOT = _cosR(_cosD(_cosF(import.meta.url)), '../..').replace(/\\/g, '/');
/* v274(40-B) 규칙 — 기사 폰엔 **자기 차량 사본만**.
   ★ 대조 먼저: 옛 규칙(06e30f3)에서는 기사가 **업체 전체 명단**(data/members)을 읽을 수
     있었음을 보인 뒤, 새 규칙에서 막히는지 본다. */
import fs from 'fs';
import cp from 'child_process';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const lf = (s) => String(s).split(String.fromCharCode(13) + String.fromCharCode(10))
  .join(String.fromCharCode(10));
/* ★ v275: 「새 판」 쪽도 **못 박는다**(회차 기록 묶음이라 뒤 회차 규칙을 시험하면 거짓 실패).
   기본값 889fbec = v274 — 이 묶음의 기대값이 말하는 그 회차다.
   COS_RULES_NEW_REF='' 를 주면 지금 작업트리를 본다(그 회차를 손볼 때). */
const _NEW_REF = ('COS_RULES_NEW_REF' in process.env) ? process.env.COS_RULES_NEW_REF : '889fbec';
const NEW_RULES = lf(_NEW_REF
  ? cp.execSync('git -C ' + COS_ROOT + ' show ' + _NEW_REF + ':firestore.rules',
      { maxBuffer: 1 << 26 }).toString()
  : fs.readFileSync('firestore.rules', 'utf8'));
const OLD_REF = process.env.COS_RULES_OLD_REF || '06e30f3';          /* v273 */
const OLD_RULES = lf(cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':firestore.rules',
  { maxBuffer: 1 << 26 }).toString());

let pass = 0, fail = 0;
const chk = (label, cond) => { if (cond) { pass++; console.log('  ✔ ' + label); }
                               else { fail++; console.log('  ✘ ' + label); } };

const ORG = 'cosroad_acme', OWNER = 'cosroad_acme', EXPIRED = 'cosroad_exp';
const MASTER = 'MASTER1', DEMO = 'cosroad_demo';
const DRV1 = 'drv_cosroad_acme_car1', DRV2 = 'drv_cosroad_acme_car2';
const now = Date.now(), DAY = 86400000;

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
      await setDoc(doc(db, 'orgs', o, 'data', 'members'),
        { value: JSON.stringify([{ id: 1, name: '가하은', carId: 'car1', phone: '010-1' }]), updatedAt: now });
      await setDoc(doc(db, 'orgs', o, 'data', 'cars'), { value: '[]', updatedAt: now });
      await setDoc(doc(db, 'orgs', o, 'data', 'courses'), { value: '[]', updatedAt: now });
      await setDoc(doc(db, 'orgs', o, 'data', 'orgDriver'), { value: '{}', updatedAt: now });
      await setDoc(doc(db, 'orgs', o, 'data', 'rideState'), { value: '{}', updatedAt: now });
      for (const cid of ['car1', 'car2']) {
        await setDoc(doc(db, 'orgs', o, 'carData', cid),
          { value: JSON.stringify({ members: [], car: { id: cid }, courses: [] }), updatedAt: now });
      }
    }
  });
  return env;
}
function mk(env) {
  const asDrv = (uid, carId) => env.authenticatedContext(uid, { driver: true, org: ORG, carId: carId }).firestore();
  const as = (uid) => env.authenticatedContext(uid, {}).firestore();
  return { asDrv, as, anon: () => env.unauthenticatedContext().firestore() };
}
async function t(label, want, fn) {
  try {
    await (want === 'allow' ? assertSucceeds(fn()) : assertFails(fn()));
    pass++; console.log('  ✔ ' + (want === 'allow' ? '허용' : '거부') + '  ' + label);
  } catch (e) { fail++; console.log('  ✘ ' + (want === 'allow' ? '허용기대→거부' : '거부기대→허용') + '  ' + label); }
}

console.log('════ ① 대조 — 옛 규칙(v273)에서 기사가 전체 명단을 읽을 수 있었나');
{
  const env = await makeEnv('cos-274-old', OLD_RULES);
  const { asDrv } = mk(env);
  await t('[옛] 1호차 기사 → data/members 읽기 (= 전체 명단이 내려왔다)', 'allow',
    () => getDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'data', 'members')));
  await t('[옛] 1호차 기사 → data/cars 읽기', 'allow',
    () => getDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'data', 'cars')));
  await t('[옛] 1호차 기사 → data/courses 읽기', 'allow',
    () => getDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'data', 'courses')));
  await t('[옛] 1호차 기사 → carData 읽기 (그때는 그 블록이 없었다)', 'deny',
    () => getDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'carData', 'car1')));
  const m = OLD_RULES.match(/function driverReadableKey\(key\) \{\s*return key in \[([\s\S]*?)\];/);
  const k = m ? m[1].match(/'([^']+)'/g).map((x) => x.replace(/'/g, '')) : [];
  chk('[옛] 목록에 members·cars·courses 가 있었다 (' + k.length + '키)',
    k.indexOf('members') >= 0 && k.indexOf('cars') >= 0 && k.indexOf('courses') >= 0);
  await env.cleanup();
}

console.log('\n② 새 규칙 — 전체 명단은 막히고 자기 차량 사본만 열린다');
const env = await makeEnv('cos-274-new', NEW_RULES);
const { asDrv, as, anon } = mk(env);
await t('기사 → data/members 읽기', 'deny',
  () => getDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'data', 'members')));
await t('기사 → data/cars 읽기', 'deny',
  () => getDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'data', 'cars')));
await t('기사 → data/courses 읽기', 'deny',
  () => getDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'data', 'courses')));
await t('1호차 기사 → 자기 carData 읽기', 'allow',
  () => getDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'carData', 'car1')));
await t('1호차 기사 → **2호차** carData 읽기 ★', 'deny',
  () => getDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'carData', 'car2')));
await t('1호차 기사 → 자기 carData **쓰기** ★', 'deny',
  () => setDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'carData', 'car1'), { value: '{}', updatedAt: 1 }));
await t('1호차 기사가 토큰에 carId=car2 라 적고 2호차 읽기', 'deny',
  () => getDoc(doc(asDrv(DRV1, 'car2'), 'orgs', ORG, 'carData', 'car2')));
await t('2호차 기사 → 자기 carData 읽기', 'allow',
  () => getDoc(doc(asDrv(DRV2, 'car2'), 'orgs', ORG, 'carData', 'car2')));

console.log('\n③ 기사에게 남은 키는 그대로');
for (const k of ['orgDriver', 'rideState', 'carlog', 'deliveryDone', 'dropoffDone', 'driverAtt']) {
  await t('기사 → ' + k + ' 읽기', 'allow',
    () => getDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'data', k)));
}
await t('기사 → rideState 쓰기 (40-B 에선 그대로 쓴다)', 'allow',
  () => setDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'data', 'rideState'), { value: '{}', updatedAt: 2 }));
await t('기사 → payments 읽기', 'deny',
  () => getDoc(doc(asDrv(DRV1, 'car1'), 'orgs', ORG, 'data', 'payments')));

console.log('\n④ 관리자·소유자·마스터·만료·데모');
await t('소유자 → carData 읽기', 'allow', () => getDoc(doc(as(OWNER), 'orgs', ORG, 'carData', 'car2')));
await t('소유자 → carData 쓰기', 'allow',
  () => setDoc(doc(as(OWNER), 'orgs', ORG, 'carData', 'car1'), { value: '{}', updatedAt: 3 }));
await t('소유자 → data/members 읽기 (관리자는 원본)', 'allow',
  () => getDoc(doc(as(OWNER), 'orgs', ORG, 'data', 'members')));
await t('(대조) 마스터 → 남의 업체 carData (v263대로 거부)', 'deny',
  () => getDoc(doc(as(MASTER), 'orgs', ORG, 'carData', 'car1')));
await t('남의 업체 소유자 → carData 읽기', 'deny',
  () => getDoc(doc(as(EXPIRED), 'orgs', ORG, 'carData', 'car1')));
await t('로그인 안 함 → carData 읽기', 'deny',
  () => getDoc(doc(anon(), 'orgs', ORG, 'carData', 'car1')));
await t('만료 업체 → carData **읽기만**', 'allow',
  () => getDoc(doc(as(EXPIRED), 'orgs', EXPIRED, 'carData', 'car1')));
await t('만료 업체 → carData 쓰기', 'deny',
  () => setDoc(doc(as(EXPIRED), 'orgs', EXPIRED, 'carData', 'car1'), { value: '{}', updatedAt: 4 }));
await t('둘러보기(_demo) → carData 읽기', 'allow',
  () => getDoc(doc(as(OWNER), 'orgs', DEMO, 'carData', 'car1')));
await t('둘러보기(_demo) → carData 쓰기', 'deny',
  () => setDoc(doc(as(OWNER), 'orgs', DEMO, 'carData', 'car1'), { value: '{}', updatedAt: 5 }));

console.log('\n⑤ 규칙 글 · 앱 목록과 같은가');
{
  const m = NEW_RULES.match(/function driverReadableKey\(key\) \{\s*return key in \[([\s\S]*?)\];/);
  const rk = m ? m[1].match(/'([^']+)'/g).map((x) => x.replace(/'/g, '')) : [];
  chk('규칙 읽기 키 6개 (' + rk.join(',') + ')', rk.length === 6
    && rk.indexOf('members') < 0 && rk.indexOf('cars') < 0 && rk.indexOf('courses') < 0);
  /* ★ `git show :index.html` 은 **스테이징**을 읽어 커밋 전에는 옛 값이 나온다 —
     일하는 폴더(또는 고정한 커밋)를 읽는다. */
  /* ★ v275: 앱 쪽도 **그 회차 커밋**을 본다 — 작업트리를 보면 뒤 회차가 키를 줄일 때마다 거짓 실패 */
  const _APP_REF = ('COS_SRC_NEW_REF' in process.env) ? process.env.COS_SRC_NEW_REF : '889fbec';
  const app = lf(_APP_REF
    ? cp.execSync('git -C ' + COS_ROOT + ' show ' + _APP_REF + ':index.html',
        { maxBuffer: 1 << 28 }).toString()
    : fs.readFileSync('' + COS_ROOT + '/index.html', 'utf8'));
  const am = app.match(/var DRIVER_READ_KEYS = \[([\s\S]*?)\];/);
  const ak = am ? am[1].match(/'([^']+)'/g).map((x) => x.replace(/'/g, '')) : [];
  chk('앱 DRIVER_READ_KEYS 가 규칙과 같다 (' + ak.length + '키)',
    ak.slice().sort().join(',') === rk.slice().sort().join(','));
  chk('carData 블록이 있다', /match \/orgs\/\{orgId\}\/carData\/\{carId\}/.test(NEW_RULES));
  chk('myCarId 가 drivers 문서를 본다',
    /function myCarId\(orgId\) \{[\s\S]{0,80}driverDoc\(orgId\)\.carId;/.test(NEW_RULES));
  const n = NEW_RULES.split('\n').length - (NEW_RULES.endsWith('\n') ? 1 : 0);
  console.log('      규칙 줄 수: ' + n + '줄 (v273 582 → +' + (n - 582) + ')');
  /* ★ v275: 못 박았으니 「사본 = 저장소」 대신 **못 박은 자리가 그 회차인지**를 본다 */
  chk('못 박은 규칙이 v274 (' + (_NEW_REF || '작업트리') + ')',
    !_NEW_REF || lf(cp.execSync('git -C ' + COS_ROOT + ' show ' + _NEW_REF + ':firestore.rules',
      { maxBuffer: 1 << 26 }).toString()) === NEW_RULES);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
  : '✔ ' + pass + '/' + pass + ' 전부 통과'));
await env.cleanup();
process.exit(fail ? 1 : 0);
