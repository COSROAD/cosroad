/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* g_drvload255 — 기사(·도우미) 폰이 **무엇을 내려받는가** (자료 불러오기 길).
   ★ 코스로드41 에서 **다시 만들었다.** 옛 파일은 세션 임시 폴더에서 사라졌고(오늘 아침엔 돌았다)
     git·저장소·보고문 어디에도 원문이 없다 → **같은 목적**으로 새로 적었다(내용이 그대로는 아니다).
   보는 것 (v255~v282 에 걸쳐 좁혀 온 그 길):
     ① 기사 모드가 `data/*` 에서 부르는 키는 **`orgDriver` 하나**인가
     ② 막아야 할 키(명단·수납·세무·직원·출결…)를 **한 번도** 안 부르는가
     ③ 자기 차량 사본(`carData/{내 차량}`)·기록(`carState/{내 차량}`)만 부르는가
     ④ 그 사본으로 화면 자료(«회원»·차량·코스)가 채워지는가
     ⑤ 사본이 없으면 **폰에 있던 값을 그대로** 쓰는가(빈 화면 금지)
     ⑥ 관리자 모드는 종전대로 전 키를 부르는가 (대조 — 검사가 헛돌지 않는다는 증거)
     ⑦ 도우미(43-B)도 기사와 **같은가**
     ⑧ 앱의 두 목록(DRIVER_READ_KEYS·DRIVER_WRITE_KEYS)이 **규칙 파일과 같은가**
   가짜 Firestore — 실제 쓰기 0 · 문자 0 · 바깥 통신 0. */
const fs = require('fs');
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 44)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const D7 = ['월','화','수','목','금','토','일'];
const M1 = [{ id:1, name:'가하은', carId:'car1', courseId:'c1', days:D7, location:'인천1', lat:37.41, lon:126.68, phone:'010-1' }];
const M2 = [{ id:2, name:'나지후', carId:'car2', courseId:'c1', days:D7, location:'인천2', lat:37.42, lon:126.69, phone:'010-2' }];
const CARS = [{ id:'car1', name:'1호차', driver:'박기사' }, { id:'car2', name:'2호차', driver:'김기사' }];
const COURSES = [{ id:'c1', name:'A반', depart:'15:00' }];
const SUF = '__cosroad_default';

/* 서버에 있는 것 — `data/*` 전부 + 차량별 사본·기록 */
function server() {
  return {
    data: {
      orgDriver: { name:'가온', icon:'🚐', bizType:'academy', destName:'학원',
                   destLat:37.44, destLon:126.65, tel:'032-1' },
      org: { name:'가온', icon:'🚐', bizType:'academy', destName:'학원', bankAccount:'하나 111',
             stamp:'data:image/png;base64,AAA', bizNo:'635-88-02710', ceo:'문준식' },
      members: M1.concat(M2), cars: CARS, courses: COURSES,
      payments: { p:1 }, tax: { t:1 }, staff: [{ id:'st2', name:'한도움', hasPin:true }],
      staffAtt: { 'st2_2026-11-08': { in:'09:00' } }, attendance: { a:1 },
      attendanceTime: { at:1 }, notices: [{ id:'n1', text:'비밀 알림장' }],
      products: [], invoices: [], drivelogManual: {}, payrollManual: {},
      driverPay: { car1:{ hourlyWage:12000 } }, migration: { carState:true, at:1 }
    },
    carData: { car1: { members:M1, car:CARS[0], courses:COURSES },
               car2: { members:M2, car:CARS[1], courses:COURSES } },
    carState: { car1: { ride:{}, rideOff:{}, carlog:{records:[],plans:{}}, delivDone:{}, dropDone:{}, att:{} },
                car2: { ride:{}, rideOff:{}, carlog:{records:[],plans:{}}, delivDone:{}, dropDone:{}, att:{} } }
  };
}

/* 한 대의 폰 — 무엇을 **불렀는지**(asked) 다 적어 둔다 */
function phone(opt) {
  opt = opt || {};
  const SRV = opt.server || server();
  const asked = [];
  const store = {};
  if (opt.local !== false) {
    store['tkd_members'+SUF] = JSON.stringify(opt.localMembers || M1);
    store['tkd_cars'+SUF]    = JSON.stringify(CARS);
    store['tkd_courses'+SUF] = JSON.stringify(COURSES);
  }
  const R = E.build({ src: E.SRC_NEW, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content','app-content','drive-screen','admin-screen','fb-loading','member-screen',
   'member-list','main-header','today-date','org-name-display','org-icon','login-screen',
   'main-app','bottom-action','mode-badge','header-btns','filter-chips','search-input',
   'day-tabs','member-add-area','drive-tabs']
   .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });
  R.sandbox._firestore = R.win._firestore = {
    doc: (db, c1, o, c2, k) => ({ col:c2, key:k }),
    collection: (db, c1, o, c2) => ({ col:c2, key:'' }),
    getDoc: async (ref) => {
      asked.push(ref.col + '/' + ref.key);
      const src = SRV[ref.col] || {};
      const has = Object.prototype.hasOwnProperty.call(src, ref.key);
      return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
    },
    getDocs: async (ref) => {
      asked.push(ref.col + '/*');
      const src = SRV[ref.col] || {};
      return { forEach: (cb) => Object.keys(src).forEach((k) =>
        cb({ id:k, data: () => ({ value: JSON.stringify(src[k]) }) })) };
    },
    setDoc: async (ref, d) => { asked.push('SET ' + ref.col + '/' + ref.key); },
    deleteDoc: async () => {},
    runTransaction: async (db, fn) => fn({
      get: async (ref) => {
        asked.push('TX ' + ref.col + '/' + ref.key);
        const src = SRV[ref.col] || {};
        const has = Object.prototype.hasOwnProperty.call(src, ref.key);
        return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
      },
      set: (ref, d) => { asked.push('TXSET ' + ref.col + '/' + ref.key); }
    }),
    onSnapshot: (ref, cb) => { asked.push('WATCH ' + ref.col + '/' + (ref.key || '*')); return () => {}; }
  };
  R.sandbox._db = R.win._db = {};
  R.ev("window._userOrgId='cosroad_default';");
  R.sandbox._userOrgId = 'cosroad_default';
  if (opt.mode === 'admin') {
    R.ev("currentMode='admin'; window._userUid='u1'; window._userBizType='academy';"
       + "window._userPaidUntil=Date.now()+30*86400000;");
  } else {
    R.ev("currentMode='driver'; window._isDriverAcct=true;"
       + "window._driverOrg='cosroad_default'; window._driverCarId='" + (opt.carId || 'car1') + "';");
    if (opt.helper) {
      R.ev("window._isHelperAcct=true; window._driverStaffId='st2';"
         + "window._userUid='hlp_cosroad_default_st2';");
    }
  }
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return { R, SRV, asked };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms || 300));

/* 부른 `data/*` 키만 골라낸다 (읽기만 — 감시·쓰기는 따로 본다) */
const dataKeys = (asked) => asked.filter((x) => /^data\//.test(x)).map((x) => x.slice(5)).sort();
const watched  = (asked) => asked.filter((x) => /^WATCH /.test(x)).map((x) => x.slice(6)).sort();

(async () => {
  console.log('════ ①②③④ 기사 폰이 부르는 것');
  {
    const p = phone({ mode: 'driver', carId: 'car1' });
    await p.R.ev('syncFromFirebase()');
    await wait(400);
    ck('① `data/*` 에서 부른 키는 orgDriver 하나', dataKeys(p.asked).join(','), 'orgDriver');
    const BAD = ['members','cars','courses','org','payments','tax','staff','staffAtt','attendance',
                 'attendanceTime','notices','products','invoices','drivelogManual','payrollManual','driverPay'];
    ck('② 막아야 할 16개 키는 **한 번도** 안 불렀다',
       BAD.filter((k) => p.asked.indexOf('data/' + k) >= 0).join(',') || '없음', '없음');
    ck('③ 자기 차량 사본만', p.asked.filter((x) => /^carData\//.test(x)).join(','), 'carData/car1');
    ck('   자기 차량 기록만', p.asked.filter((x) => /^carState\//.test(x)).join(','), 'carState/car1');
    ck('   차량 기록을 **컬렉션째로** 훑지 않는다(관리자만 그렇게 한다)',
       p.asked.indexOf('carState/*') >= 0, false);
    ck('④ 사본으로 «회원» 이 채워졌다(자기 차량 몫만)',
       p.R.ev("loadMembers().map(function(m){return m.name;}).join(',')"), '가하은');
    ck('   차량도 자기 것 한 대', p.R.ev("loadCars().map(function(c){return c.id;}).join(',')"), 'car1');
    ck('   코스도 받았다', p.R.ev('loadCourses().length'), 1);
    ck('   업체 설정은 **요약**(orgDriver)으로 채워졌다 — 계좌·도장이 없다',
       p.R.ev("[loadOrgSettings().name, loadOrgSettings().bankAccount||'없음', loadOrgSettings().stamp||'없음'].join('|')"),
       '가온|없음|없음');
    ck('   리스너도 자기 차량 둘 + orgDriver 만',
       watched(p.asked).join(','), 'carData/car1,carState/car1,data/orgDriver');
  }

  console.log('\n⑤ 사본이 아직 없으면 — 폰에 있던 값을 그대로 쓴다(빈 화면 금지)');
  {
    const SRV = server();
    delete SRV.carData.car1;                 /* 관리자가 아직 안 만든 업체 */
    delete SRV.carState.car1;
    const p = phone({ mode: 'driver', carId: 'car1', server: SRV });
    await p.R.ev('syncFromFirebase()');
    await wait(400);
    ck('«회원» 이 비지 않았다', p.R.ev("loadMembers().map(function(m){return m.name;}).join(',')"), '가하은');
    ck('차량도 그대로', p.R.ev('loadCars().length'), 2);
    ck('그래도 막아야 할 키는 안 불렀다',
       ['members','cars','courses','org'].filter((k) => p.asked.indexOf('data/' + k) >= 0).join(',') || '없음', '없음');
  }

  console.log('\n⑥ 대조 — 관리자 폰은 종전대로 전 키를 부른다 (검사가 헛돌지 않는다는 증거)');
  {
    const p = phone({ mode: 'admin' });
    await p.R.ev('syncFromFirebase()');
    await wait(500);
    const got = dataKeys(p.asked);
    ck('관리자는 `members`·`cars`·`courses` 를 부른다',
       ['members','cars','courses'].every((k) => got.indexOf(k) >= 0), true);
    ck('   수납·세무·직원·출결도 부른다',
       ['payments','tax','staff','attendance'].every((k) => got.indexOf(k) >= 0), true);
    ck('   업체 설정은 **전체**(org) 로 부른다', got.indexOf('org') >= 0, true);
    ck('   기사용 요약(orgDriver)도 한 번 본다(없으면 만들어 두려고)', got.indexOf('orgDriver') >= 0, true);
    ck('   차량 기록은 **컬렉션째로** 훑는다', p.asked.indexOf('carState/*') >= 0, true);
    ck('   차량 사본 리스너는 **안 붙인다**(원본이 깎인다)',
       watched(p.asked).filter((x) => /^carData\//.test(x)).join(',') || '없음', '없음');
    ck('   부른 키 수가 기사보다 많다', got.length > 10, true);
  }

  console.log('\n⑦ 도우미(43-B)도 기사와 같다');
  {
    const p = phone({ mode: 'driver', carId: 'car2', helper: true });
    await p.R.ev('syncFromFirebase()');
    await wait(400);
    ck('`data/*` 는 orgDriver 하나', dataKeys(p.asked).join(','), 'orgDriver');
    ck('자기(배정) 차량 사본만', p.asked.filter((x) => /^carData\//.test(x)).join(','), 'carData/car2');
    ck('   그 차량 «회원» 만 받았다',
       p.R.ev("loadMembers().map(function(m){return m.name;}).join(',')"), '나지후');
    ck('배정 문서를 지켜본다(차량이 바뀌면 따라가려고)',
       watched(p.asked).some((x) => /^drivers\//.test(x)), true);
    ck('직원 근태(staffAtt)는 안 부른다', p.asked.indexOf('data/staffAtt') >= 0, false);
  }

  console.log('\n⑧ 앱의 두 목록이 **규칙 파일과 같은가** (한쪽만 고치면 안 된다)');
  {
    const app = fs.readFileSync('' + COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
    const rules = fs.readFileSync('' + COS_ROOT + '/firestore.rules', 'utf8').replace(/\r\n/g, '\n');
    const appRead = (app.match(/var DRIVER_READ_KEYS = \[([^\]]*)\]/) || [])[1] || '';
    const appWrite = (app.match(/var DRIVER_WRITE_KEYS = \[([^\]]*)\]/) || [])[1] || '';
    const ruleRead = (rules.match(/function driverReadableKey\(key\) \{\s*return key in \[([^\]]*)\]/) || [])[1] || '';
    const norm = (s) => s.replace(/['\s]/g, '').split(',').filter(Boolean).sort().join(',');
    ck('앱 읽기 목록', norm(appRead), 'orgDriver');
    ck('규칙 읽기 목록', norm(ruleRead), 'orgDriver');
    ck('★ 둘이 같다', norm(appRead) === norm(ruleRead), true);
    ck('앱 쓰기 목록은 비어 있다', norm(appWrite) || '없음', '없음');
    ck('규칙 쓰기도 항상 거짓',
       /function driverWritableKey\(key\) \{\s*return false;/.test(rules), true);
    /* 대조 — 이 검사가 어긋남을 잡는가 */
    ck('[대조] 목록이 다르면 잡는다', norm("'orgDriver','members'") === norm(ruleRead), false);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 Firestore — 실제 쓰기 0 · 문자 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
