/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v275 — 서버 `api/driver-auth.js punch` 가 **차량별 문서**를 고치나.
   ★ 대조 먼저: 옛 판(889fbec · v274)은 `data/driverAtt`(업체 전체 한 문서)를 고쳤다.
   ★ 실제 코드를 **글자 그대로** 올린다(바꾸거나 다시 묶지 않는다) —
     firebase-admin 세 갈래만 빈 껍데기 패키지로 옆에 둔다.
   실제 Firestore 쓰기 0 · 문자 0. */
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 58)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

function stubPkg(dir) {
  const nm = path.join(dir, 'node_modules', 'firebase-admin');
  fs.mkdirSync(nm, { recursive: true });
  fs.writeFileSync(path.join(nm, 'package.json'), JSON.stringify({
    name: 'firebase-admin', version: '0.0.0-stub', type: 'module',
    exports: { '.': './index.js', './app': './app.js', './auth': './auth.js', './firestore': './firestore.js' }
  }));
  fs.writeFileSync(path.join(nm, 'index.js'), 'export default {};\n');
  fs.writeFileSync(path.join(nm, 'app.js'),
    'export const initializeApp=()=>({}); export const getApps=()=>[]; export const cert=()=>({});\n');
  fs.writeFileSync(path.join(nm, 'auth.js'), 'export const getAuth=()=>({});\n');
  fs.writeFileSync(path.join(nm, 'firestore.js'), 'export const getFirestore=()=>({});\n');
}

/* 가짜 Firestore — 트랜잭션까지 흉내 낸다(읽고 → 고치고 → 쓴다) */
function fakeAdmin(store) {
  const refOf = (parts) => ({ _p: parts.join('/') });
  const mk = (parts) => ({
    doc: (id) => Object.assign(refOf(parts.concat([id])), {
      collection: (c) => mk(parts.concat([id, c]))
    }),
    collection: (c) => mk(parts.concat([c]))
  });
  const db = {
    collection: (c) => mk([c]),
    runTransaction: async (fn) => {
      const tx = {
        get: async (ref) => {
          const has = Object.prototype.hasOwnProperty.call(store, ref._p);
          return { exists: has, data: () => store[ref._p] };
        },
        set: (ref, d) => { store[ref._p] = d; }
      };
      return await fn(tx);
    }
  };
  return { db: db, auth: {} };
}

/* punch 만 꺼내 쓴다 — 파일은 핸들러를 export 하므로, 안의 punch 를 직접 못 부른다.
   그래서 **글자에서 punch 함수만 떼어** 같은 환경에 올린다(코드를 고치지는 않는다). */
function extractPunch(srcText, tag) {
  const i = srcText.indexOf('  async function punch(');
  if (i < 0) throw new Error('punch 를 못 찾음 (' + tag + ')');
  /* 중괄호 균형으로 끝을 찾는다 */
  let d = 0, j = srcText.indexOf('{', i), e = j;
  for (; e < srcText.length; e++) {
    const c = srcText[e];
    if (c === '{') d++;
    else if (c === '}') { d--; if (!d) break; }
  }
  const body = srcText.slice(i, e + 1);
  /* punch 가 쓰는 바깥 도우미도 함께 떼어 온다 */
  /* punch 가 쓰는 바깥 도우미를 **함수 블록째** 떼어 온다 (const 가 아니라 function 선언이다) */
  const helper = [];
  ['kstDateStr', 'kstTimeStr'].forEach((name) => {
    const k = srcText.indexOf('function ' + name + '(');
    if (k < 0) return;
    let dd = 0, jj = srcText.indexOf('{', k), ee = jj;
    for (; ee < srcText.length; ee++) {
      const c = srcText[ee];
      if (c === '{') dd++;
      else if (c === '}') { dd--; if (!dd) break; }
    }
    helper.push(srcText.slice(k, ee + 1));
  });
  /* 그 도우미들이 쓰는 `KST` 도 함께 (한 줄 const) */
  [/const KST = [^\n]+/, /const attKey = [^\n]+/].forEach((re) => {
    const m = srcText.match(re); if (m) helper.unshift(m[0]);
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'punch275-' + tag + '-'));
  stubPkg(dir);
  const f = path.join(dir, 'punch.mjs');
  fs.writeFileSync(f,
    helper.join('\n') + '\n' +
    'export function make(A){\n' + body + '\n  return punch;\n}\n');
  return f;
}

(async () => {
  /* ★ v282(코스로드52): 이 묶음은 **v275 회차 기록**이다 — 새 쪽도 그 커밋(c1c7b47)에 못 박는다.
     43-C 가 `punchStaff` 주석에 「앱 attKey(staffId,날짜) 와 같은 모양」을 적으면서
     ⑥ 「남은 attKey 는 주석 한 줄뿐」이 거짓 실패가 됐다(CLAUDE.md 검사 묶음 규칙:
     기대값이 가리키는 회차에 맞춘다). */
  const NEW_REF = process.env.COS_API_NEW_REF || 'c1c7b47';
  const NEW_SRC = NEW_REF
    ? cp.execSync('git -C ' + COS_ROOT + ' show ' + NEW_REF + ':api/driver-auth.js',
        { maxBuffer: 1 << 26 }).toString()
    : fs.readFileSync('' + COS_ROOT + '/api/driver-auth.js', 'utf8');
  const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show 889fbec:api/driver-auth.js',
    { maxBuffer: 1 << 26 }).toString();
  const newMod = await import('file:///' + extractPunch(NEW_SRC, 'new').split(path.sep).join('/'));
  const oldMod = await import('file:///' + extractPunch(OLD_SRC, 'old').split(path.sep).join('/'));

  /* (자리) */

  console.log('════ ① 대조 — 옛 판(v274)은 업체 전체 문서를 고쳤다');
  {
    const store = {};
    const A = fakeAdmin(store);
    const punch = oldMod.make(A);
    const r = await punch('cosroad_acme', 'car1');
    const keys = Object.keys(store);
    ck('[옛] 출근 기록됨', r.ok + '/' + r.kind, 'true/in');
    ck('[옛] 고친 문서', keys.join(','), 'orgs/cosroad_acme/data/driverAtt');
    const att = JSON.parse(store[keys[0]].value);
    ck('[옛] 키 모양 — 차량 접두사가 붙는다', Object.keys(att).join(','),
      Object.keys(att)[0]);
    ck('[옛] 그 키가 car1_ 로 시작', /^car1_/.test(Object.keys(att)[0]), true);
  }

  console.log('\n② 새 판 — **차량별 문서**를 고친다');
  {
    const store = {};
    const A = fakeAdmin(store);
    const punch = newMod.make(A);
    const r1 = await punch('cosroad_acme', 'car1');
    ck('출근 기록됨', r1.ok + '/' + r1.kind, 'true/in');
    const keys = Object.keys(store);
    ck('★ 고친 문서가 carState/car1', keys.join(','), 'orgs/cosroad_acme/carState/car1');
    const st = JSON.parse(store[keys[0]].value);
    ck('날짜 키로 짧아졌다 (차량 접두사 없음)',
      Object.keys(st.att).length + '/' + /^\d{4}-\d{2}-\d{2}$/.test(Object.keys(st.att)[0]), '1/true');
    ck('in 이 들어갔다', !!st.att[Object.keys(st.att)[0]].in, true);
    /* 앱 emptyCarState 와 같은 칸이 생겼나 */
    ck('빈 칸을 앱과 같은 꼴로 채운다',
      ['ride','rideOff','carlog','delivDone','dropDone','att'].filter((k)=>st[k]===undefined).join(',') || '다 있음',
      '다 있음');
    ck('carlog 속 모양도', Array.isArray(st.carlog.records) + '/' + (typeof st.carlog.plans), 'true/object');
    /* 두 번째 — 퇴근 */
    const r2 = await punch('cosroad_acme', 'car1');
    ck('두 번째는 퇴근', r2.kind, 'out');
    /* 세 번째 — 이미 끝 */
    const r3 = await punch('cosroad_acme', 'car1');
    ck('세 번째는 done (두 번 안 찍힌다)', r3.kind, 'done');
  }

  console.log('\n③ 다른 칸(ride·carlog 등)을 **건드리지 않는다**');
  {
    const store = {
      'orgs/cosroad_acme/carState/car1': { value: JSON.stringify({
        ride:{'1':{on:true}}, rideOff:{'2':{offOn:false}},
        carlog:{records:[{id:'r1',carId:'car1'}],plans:{car1:{'엔진오일':5000}}},
        delivDone:{'1':'2026-11-05'}, dropDone:{'2':'2026-11-05'}, att:{}
      }), updatedAt: 1 }
    };
    const A = fakeAdmin(store);
    const punch = newMod.make(A);
    await punch('cosroad_acme', 'car1');
    const st = JSON.parse(store['orgs/cosroad_acme/carState/car1'].value);
    ck('ride 그대로', JSON.stringify(st.ride), '{"1":{"on":true}}');
    ck('rideOff 그대로', JSON.stringify(st.rideOff), '{"2":{"offOn":false}}');
    ck('carlog 기록 그대로', (st.carlog.records||[]).length, 1);
    ck('carlog plans 그대로', JSON.stringify(st.carlog.plans), '{"car1":{"엔진오일":5000}}');
    ck('delivDone·dropDone 그대로',
      JSON.stringify(st.delivDone) + JSON.stringify(st.dropDone),
      '{"1":"2026-11-05"}{"2":"2026-11-05"}');
    ck('att 에만 들어갔다', Object.keys(st.att).length, 1);
  }

  console.log('\n④ 차량이 둘이면 **서로 다른 문서**를 고친다');
  {
    const store = {};
    const A = fakeAdmin(store);
    const punch = newMod.make(A);
    await punch('cosroad_acme', 'car1');
    await punch('cosroad_acme', 'car2');
    ck('문서 둘', Object.keys(store).sort().join(','),
      'orgs/cosroad_acme/carState/car1,orgs/cosroad_acme/carState/car2');
    const a = JSON.parse(store['orgs/cosroad_acme/carState/car1'].value);
    const b = JSON.parse(store['orgs/cosroad_acme/carState/car2'].value);
    ck('★ 서로 안 섞인다', Object.keys(a.att).length + '/' + Object.keys(b.att).length, '1/1');
  }

  console.log('\n⑤ 백업 — 앱과 **같은 글자**로 남긴다');
  {
    const store = {
      'orgs/cosroad_acme/carState/car1': { value: JSON.stringify({ att:{} }), updatedAt: 1 }
    };
    const A = fakeAdmin(store);
    const punch = newMod.make(A);
    await punch('cosroad_acme', 'car1');
    const bk = Object.keys(store).filter((k) => k.indexOf('/backups/') >= 0);
    ck('백업을 남겼다', bk.length, 1);
    ck('★ 백업 key 가 carState/car1 (규칙이 이 글자를 본다)',
      (store[bk[0]] || {}).key, 'carState/car1');
    ck('앱도 같은 글자를 쓴다',
      /'carState\/'\s*\+\s*cid/.test(fs.readFileSync('' + COS_ROOT + '/index.html', 'utf8')), true);
  }

  console.log('\n⑥ 트랜잭션을 그대로 쓰나 (두 번 눌림·관리자와 겹침 대비)');
  {
    ck('runTransaction 이 남아 있다', /A\.db\.runTransaction/.test(NEW_SRC), true);
    ck('옛 판에도 있었다 (바꾼 것은 문서 자리뿐)', /A\.db\.runTransaction/.test(OLD_SRC), true);
    /* 주석을 뺀 **코드**에서 센다 — 설명 주석에는 「앱 쪽 attKey()」 라는 글자가 남아 있다 */
    const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    ck('[옛] 코드에 attKey 가 있었다 (대조)', (code(OLD_SRC).match(/attKey/g) || []).length > 0, true);
    ck('새 판 코드에 attKey 가 0 (차량 접두사가 없어졌다)',
      (code(NEW_SRC).match(/attKey/g) || []).length, 0);
    ck('남은 attKey 는 주석 한 줄뿐', (NEW_SRC.match(/attKey/g) || []).length, 1);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 Firestore — 실제 쓰기 0 · 문자 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
