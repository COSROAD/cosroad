/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v273 — 문자 서버 `lib/send-guard.js orgPhones` 가 **하원 차량 기사**도 허용하나.
   ★ 대조 먼저: 옛 판(d26c93e)에서는 **거부**였음을 보인 뒤 새 판을 본다.
   알리고·Firestore 는 가짜 — 실제 문자 0 · 실제 쓰기 0. */
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 56)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

/* 회원 명단 — 세 사람
   1 가하은: 등원 car1 · 하원 car2  (갈림)
   2 나여름: 등원 car1 · 하원 없음  (등원만 car1)
   3 다가을: 등원 car3            (딴 차량) */
const MEMBERS = [
  { id: 1, name: '가하은', carId: 'car1', carIdDrop: 'car2', phone: '010-1111-1111' },
  { id: 2, name: '나여름', carId: 'car1', phone: '010-2222-2222' },
  { id: 3, name: '다가을', carId: 'car3', phone: '010-3333-3333' }
];

/* send-guard 를 **그 판의 글자 그대로** 올려 orgPhones 를 꺼내 쓴다.
   ★ 글자를 고치거나 다시 묶지 않는다 — 배포되는 것과 **같은 코드**를 시험해야 한다.
     `firebase-admin` 세 갈래만 **빈 껍데기 패키지**로 옆에 두어 import 가 풀리게 한다
     (orgPhones 는 넘겨받은 `A.db` 만 쓰므로 실제 admin 이 필요 없다). */
function loadGuard(srcText, tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg273-' + tag + '-'));
  fs.writeFileSync(path.join(dir, 'send-guard.mjs'), srcText);
  /* ★ 코스로드45: send-guard 가 `./period.js`(이용 기간 판정 한 벌)를 쓴다 — 옆에 같이 둔다.
     (옛 판에는 그 import 가 없어 이 파일이 있어도 아무 일이 없다) */
  fs.writeFileSync(path.join(dir, 'period.js'),
    fs.readFileSync('' + COS_ROOT + '/lib/period.js', 'utf8'));
  const nm = path.join(dir, 'node_modules', 'firebase-admin');
  fs.mkdirSync(nm, { recursive: true });
  fs.writeFileSync(path.join(nm, 'package.json'), JSON.stringify({
    name: 'firebase-admin', version: '0.0.0-stub', type: 'module',
    exports: { '.': './index.js', './app': './app.js',
               './auth': './auth.js', './firestore': './firestore.js' }
  }));
  fs.writeFileSync(path.join(nm, 'index.js'), 'export default {};\n');
  fs.writeFileSync(path.join(nm, 'app.js'),
    'export const initializeApp=()=>({}); export const getApps=()=>[]; export const cert=()=>({});\n');
  fs.writeFileSync(path.join(nm, 'auth.js'), 'export const getAuth=()=>({});\n');
  fs.writeFileSync(path.join(nm, 'firestore.js'), 'export const getFirestore=()=>({});\n');
  return path.join(dir, 'send-guard.mjs');
}

/* 가짜 Firestore — data/members 문서 하나만 돌려준다 */
const fakeA = {
  db: {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: true, data: () => ({ value: JSON.stringify(MEMBERS) }) })
          })
        })
      })
    })
  }
};

(async () => {
  const NEW_SRC = fs.readFileSync('' + COS_ROOT + '/lib/send-guard.js', 'utf8');
  const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show d26c93e:lib/send-guard.js',
    { maxBuffer: 1 << 26 }).toString();

  const oldMod = await import('file:///' + loadGuard(OLD_SRC).replace(/\\/g, '/'));
  const newMod = await import('file:///' + loadGuard(NEW_SRC).replace(/\\/g, '/'));

  const digits = (s) => String(s).replace(/[^0-9]/g, '');
  const has = async (mod, carId, phone) => {
    const set = await mod.orgPhones(fakeA, 'cosroad_acme', carId);
    return set ? set.has(digits(phone)) : '(null)';
  };

  console.log('════ ① 대조 — 옛 판(d26c93e)은 **등원 carId 만** 보았다');
  ck('[옛] 2호차 기사 → 하원만 2호차인 가하은', await has(oldMod, 'car2', '010-1111-1111'), false);
  ck('[옛] 1호차 기사 → 가하은 (등원 1호차)', await has(oldMod, 'car1', '010-1111-1111'), true);
  ck('[옛] 관리자(차량 없음) → 모두', await has(oldMod, null, '010-3333-3333'), true);

  console.log('\n════ ② 새 판 — 등원 **또는** 하원이면 허용');
  ck('2호차 기사 → 하원만 2호차인 가하은 ★', await has(newMod, 'car2', '010-1111-1111'), true);
  ck('1호차 기사 → 가하은 (등원 1호차)', await has(newMod, 'car1', '010-1111-1111'), true);
  ck('3호차 기사 → 가하은 거부', await has(newMod, 'car3', '010-1111-1111'), false);
  ck('2호차 기사 → 등원만 1호차인 나여름 거부', await has(newMod, 'car2', '010-2222-2222'), false);
  ck('1호차 기사 → 나여름 허용', await has(newMod, 'car1', '010-2222-2222'), true);
  ck('2호차 기사 → 딴 차량 다가을 거부', await has(newMod, 'car2', '010-3333-3333'), false);
  ck('3호차 기사 → 다가을 허용', await has(newMod, 'car3', '010-3333-3333'), true);
  ck('관리자(차량 없음) → 모두 허용', await has(newMod, null, '010-3333-3333'), true);

  console.log('\n════ ③ 물류·택배 — carIdDrop 을 저장하지 않으므로 지금과 똑같다');
  {
    /* carIdDrop 이 없는 명단이면 새 판도 옛 판과 같은 답을 낸다 */
    const PLAIN = [{ id: 9, name: '거래처', carId: 'car1', phone: '010-9999-9999' }];
    const A2 = { db: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({
      get: async () => ({ exists: true, data: () => ({ value: JSON.stringify(PLAIN) }) }) }) }) }) }) } };
    const o = await oldMod.orgPhones(A2, 'o', 'car1');
    const n = await newMod.orgPhones(A2, 'o', 'car1');
    ck('1호차 기사 — 옛/새 결과가 같다', [...o].join(',') + ' | ' + [...n].join(','),
      '01099999999 | 01099999999');
    const o2 = await oldMod.orgPhones(A2, 'o', 'car2');
    const n2 = await newMod.orgPhones(A2, 'o', 'car2');
    ck('2호차 기사 — 옛/새 모두 0명', o2.size + ' | ' + n2.size, '0 | 0');
  }

  console.log('\n════ ④ 앱과 서버가 **같은 뜻**인가');
  {
    const app = fs.readFileSync('' + COS_ROOT + '/index.html', 'utf8');
    ck('앱 dropCarOf 가 「carIdDrop || carId」', /m\.carIdDrop \|\| m\.carId/.test(app), true);
    ck('서버도 「carIdDrop 비면 carId」', /String\(m\.carIdDrop \|\| ''\) \|\| pick/.test(NEW_SRC), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 알리고·Firestore 가짜 — 실제 문자 0 · 실제 쓰기 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
