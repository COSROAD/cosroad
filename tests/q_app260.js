/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* v260 보정7 앱 쪽 — ① 개통 대장 죽은 코드 ③ 새 차량 driverPin ④ index_raw.html ⑤ 화면 라벨
   전: 3ce6379 (v259) · 후: 작업 중 */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(54) + String(got).slice(0, 74)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const BASE = process.env.COS_SRC_OLD_REF || '3ce6379';
const show = (f) => cp.execSync('git -C ' + COS_ROOT + ' show ' + BASE + ':' + f, { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
/* ★ v261 에서 **회차 커밋으로 못 박았다.**
   이 표는 「v259 → v260 사이에 무엇이 바뀌었나」를 적은 기록이다.
   작업트리를 「후」로 보면 뒤 회차(v261 가입 개편)가 섞여 들어와 기록이 거짓으로 깨진다
   (실제로 버전 261·규칙 변경·문답 추가로 8칸이 깨졌다).
   그래서 「후」를 v260 커밋(b6651bc)으로 고정한다 — 지금 코드는 이번 회차 표(t_app261.js)가 본다. */
const ROUND = process.env.COS_SRC_ROUND_REF || 'b6651bc';
const showR = (f) => cp.execSync('git -C ' + COS_ROOT + ' show ' + ROUND + ':' + f, { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const now = (f) => showR(f);
const OLD = show('index.html'), NEW = showR('index.html');
const BIZ = ['academy', 'public', 'logistics', 'delivery'];
const LF = String.fromCharCode(10);
const noComment = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split(LF).filter(l => !/^\s*\/\//.test(l)).join(LF);

const SUF = '__cosroad_default';
const DAYS7 = ['월', '화', '수', '목', '금', '토', '일'];
function storeOf(withCars) {
  const st = {};
  const put = (k, v) => {
    st[k + SUF] = JSON.stringify(v);
    BIZ.forEach(o => { st[k + '__' + o + '_demo'] = JSON.stringify(v); });
  };
  if (withCars !== false) {
    put('tkd_cars', [{ id: 'car1', name: '1호차', driver: '박기사', phone: '010-5555-6666' },
                     { id: 'car2', name: '2호차', driver: '최기사', phone: '010-7777-8888' }]);
  }
  put('tkd_members', [
    { id: 1, name: '가하은', courseId: 'c1', carId: 'car1', location: '유원아파트', lat: 37.40, lon: 126.70, phone: '010-1111-1111', days: DAYS7, pin: '1111', on: true },
    { id: 2, name: '나여름', courseId: 'c1', carId: 'car1', location: '송도동 1', lat: 37.39, lon: 126.65, phone: '010-2222-2222', days: DAYS7, pin: '2222', on: true }]);
  put('tkd_courses', [{ id: 'c1', name: 'A반', depart: '15:00' }]);
  put('tkd_org', { name: '코스로드학원', lat: 37.4, lon: 126.7 });
  put('tkd_staff', []); put('tkd_driver_att', {}); put('tkd_attendance', {});
  put('tkd_payments', {}); put('tkd_tax', {}); put('tkd_carlog', {});
  return st;
}
function boot(src, biz, opt) {
  opt = opt || {};
  const R = E.build({ src: src || NEW, biz: biz || 'academy', localStorage: storeOf(opt.cars) });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'drive-tabs', 'main-header', 'member-screen', 'member-list',
   'member-add-area', 'filter-chips', 'search-input', 'day-tabs', 'header-btns', 'mode-badge',
   'drive-screen', 'admin-screen', 'bottom-action', 'drv-punch-msg', 'pin-result', 'pin-dots',
   'pin-checkin-modal', 'sort-asc-btn', 'sort-desc-btn', 'fb-loading', 'login-err',
   'today-date', 'org-name-display', 'org-icon', 'org-icon-input', 'login-screen', 'main-app',
   'master-root'].forEach(id => {
    const el = E.makeEl('div'); el.id = id;
    el.classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
    R.document.registerId(id, el);
  });
  if (opt.search) R.win.location.search = R.sandbox.location.search = opt.search;
  R.win._auth = R.sandbox._auth = { currentUser: { uid: 'u1', isAnonymous: false, getIdToken: async () => 'T' } };
  R.win._db = R.sandbox._db = {};
  R.got = []; R.wrote = []; R.deleted = [];
  R.win._firestore = R.sandbox._firestore = {
    doc: (db, ...p) => ({ _p: p.join('/') }), collection: (db, ...p) => ({ _p: p.join('/') }),
    getDoc: async (ref) => { R.got.push(String(ref._p || '')); return { exists: () => false, data: () => ({}) }; },
    setDoc: async (ref) => { R.wrote.push(String(ref._p || '')); },
    deleteDoc: async (ref) => { R.deleted.push(String(ref._p || '')); },
    getDocs: async () => ({ forEach: () => {} }), onSnapshot: () => () => {}
  };
  R.win.fetch = R.sandbox.fetch = async () => ({ json: async () => ({ ok: false }) });
  return R;
}

console.log('════ 1. 버전 ════');
ck('version.json 260', JSON.parse(now('version.json')).version, 260);
ck('APP_VERSION 260', (NEW.match(/const APP_VERSION = (\d+);/) || [])[1], '260');

console.log('\n════ 2. ① 지우기 전 「부르는 곳 0」 — 그리고 지운 뒤 흔적 0 ════');
{
  /* 지우기 전 판(v259)에서 **부르는 곳**이 정말 0이었나 — onclick·함수 호출 둘 다 본다 */
  const GONE = ['addMasterCompany', 'deleteMasterCompany', 'copyMasterUrl',
                'loadMasterCompanies', 'saveMasterCompanies', 'masterCompanies'];
  const oldNC = noComment(OLD);
  GONE.slice(0, 3).forEach(fn => {
    ck('(전) ' + fn + ' 를 onclick 에서 부른 곳 0', (oldNC.match(new RegExp('onclick="' + fn, 'g')) || []).length, 0);
  });
  /* 옛 판에서 그 이름이 나오는 줄은 **자기들끼리뿐**이었나 — 정의·서로 부르기 */
  /* 다섯 함수가 **몇째 줄부터 몇째 줄까지**인지 줄 번호로 잡는다 (글자 위치 셈은 줄바꿈 때문에 어긋난다) */
  const oldLines = oldNC.split(LF);
  const firstLn = oldLines.findIndex(l => l.indexOf('async function loadMasterCompanies(){') >= 0);
  let lastLn = oldLines.findIndex(l => l.indexOf('function copyMasterUrl(orgId){') >= 0);
  for (let k = lastLn; k < oldLines.length; k++) { if (oldLines[k] === '}') { lastLn = k; break; } }
  console.log('      (옛 판에서 다섯 함수는 ' + (firstLn + 1) + '~' + (lastLn + 1) + '줄)');
  const outside = [];
  oldLines.forEach((l, i) => {
    if (!GONE.some(g => l.indexOf(g) >= 0)) return;
    if (l.trim().startsWith('var masterCompanies = []')) return;   /* 선언 */
    if (i >= firstLn && i <= lastLn) return;                        /* 다섯 함수 안 */
    outside.push((i + 1) + ': ' + l.trim().slice(0, 72));
  });
  outside.forEach(x => console.log('      · 다섯 함수 밖: ' + x));
  ck('(전) 선언·다섯 함수 밖에서 쓰는 곳 0', outside.length, 0);
  /* 지운 뒤 — 이름이 코드에 0곳 (주석만 남는다) */
  const newNC = noComment(NEW);
  GONE.forEach(g => ck('(후) 코드에 ' + g + ' 0곳', newNC.indexOf(g) >= 0, false));
  ck('(후) 주석에만 이름이 남았다 (지운 내력)', /다섯 함수|목록 읽기·저장·추가·삭제·주소 복사/.test(NEW), true);
  ck('(후) companies 자리를 읽거나 쓰는 코드 0', /'companies'/.test(newNC), false);
  ck('   (대조) 옛 판에는 두 곳 있었다', (oldNC.match(/'companies'/g) || []).length, 2);
  ck('(후) companies 를 지우는 코드 0', /deleteDoc[^;]*companies/.test(NEW), false);
  console.log('      index.html 줄 수: ' + OLD.split(LF).length + ' → ' + NEW.split(LF).length);
}

console.log('\n════ 3. ① 마스터 패널 HTML 바이트 동일 ════');
{
  const U = (uid, name, biz, ap) => ({ _uid: uid, orgName: name, bizType: biz, approved: ap,
    contact: '010-0000-0000', createdAt: 1, plan: 'trial', trialStart: 1 });
  const USERS = [U('u1', '가학원', 'academy', true), U('u2', '나물류', 'logistics', true),
    U('p1', '다대기', 'academy', false),
    { _uid: 'drv_a', role: 'driver', driverOrg: 'academy_x', carId: 'car1' }];
  const master = (src) => {
    const R = boot(src, 'academy');
    R.ev('signupUsers = ' + JSON.stringify(USERS) + '; inquiries = [];');
    try { R.sandbox.drawMasterPanel(); } catch (e) { return { h: 'ERR:' + e.message, R: R }; }
    return { h: String(R.document.getElementById('master-root').innerHTML || ''), R: R };
  };
  const a = master(OLD), b = master(NEW);
  ck('마스터 패널 바이트 동일', a.h === b.h, true);
  if (a.h !== b.h) {
    let i = 0; while (i < Math.min(a.h.length, b.h.length) && a.h[i] === b.h[i]) i++;
    console.log('      처음 다른 자리 ' + i + '\n        옛: ' + a.h.slice(i - 40, i + 80) + '\n        새: ' + b.h.slice(i - 40, i + 80));
  }
  ck('   승인 수 그대로 나온다', /승인 2곳/.test(b.h), true);
  ck('   그릴 때 companies 를 읽지 않는다', b.R.got.filter(p => /companies/.test(p)).length, 0);
  ck('   아무 것도 저장·삭제하지 않는다', b.R.wrote.length + b.R.deleted.length, 0);
  ck('(대조) 한 글자 바꾼 판은 잡힌다', (() => {
    const bent = NEW.split('🏢 업체 관리').join('🏢 업체 관리 ');
    return bent === NEW ? '바꿀 자리 없음' : (master(bent).h === b.h ? '못 잡음' : '잡음');
  })(), '잡음');
}

console.log('\n════ 4. ③ 새 차량 기본값에 driverPin 없음 ════');
{
  /* 기본 차량 5칸 — 앱이 처음 켜질 때 만드는 값 */
  const defOf = (src) => {
    const R = boot(src, 'academy', { cars: false });
    return R.ev('loadCars()');
  };
  const dn = defOf(NEW), doo = defOf(OLD);
  ck('기본 차량 5칸', dn.length, 5);
  ck('그 5칸에 driverPin 칸 0개', dn.filter(c => 'driverPin' in c).length, 0);
  ck('(대조) 옛 판은 5칸 모두 있었다', doo.filter(c => 'driverPin' in c).length, 5);
  ck('   그 밖의 칸은 그대로',
    JSON.stringify(dn), JSON.stringify(doo.map(c => { const x = Object.assign({}, c); delete x.driverPin; return x; })));
  /* 「＋ 차량 추가」로 만드는 새 차량 */
  const R = boot(NEW, 'academy');
  R.ev("currentMode='admin'; currentAdminTab='cars';");
  try { R.sandbox.addCar(); } catch (e) {}
  const cars = R.ev('loadCars()');
  ck('＋ 차량 추가로 만든 새 차량에도 driverPin 없음',
    'driverPin' in (cars[cars.length - 1] || {}), false);
  ck('   (옛 판도 없었다 — addCar 는 처음부터 안 넣었다)', (() => {
    const O = boot(OLD, 'academy');
    O.ev("currentMode='admin'; currentAdminTab='cars';");
    try { O.sandbox.addCar(); } catch (e) {}
    const c2 = O.ev('loadCars()');
    return 'driverPin' in (c2[c2.length - 1] || {});
  })(), false);
  /* 둘러보기 샘플은 그대로 */
  const demoOf = (src) => {
    const R2 = boot(src, 'academy', { search: '?org=academy_demo', cars: false });
    const seeds = R2.ev('JSON.stringify(typeof demoSeed!=="undefined"?demoSeed:null)');
    return seeds;
  };
  ck('둘러보기 샘플 차량의 driverPin 글자 수 그대로',
    (NEW.match(/driverPin:'\d{4}'/g) || []).length, (OLD.match(/driverPin:'\d{4}'/g) || []).length);
  ck('   그 수는 8곳 (4업종 × 2차량)', (NEW.match(/driverPin:'\d{4}'/g) || []).length, 8);
  ck('빈 칸(driverPin:\'\')은 0곳', (NEW.match(/driverPin:''/g) || []).length, 0);
  ck('   (대조) 옛 판은 5곳', (OLD.match(/driverPin:''/g) || []).length, 5);
  /* 저장된 자료에 남은 driverPin 은 손대지 않는다 — 「옮기기」가 읽는다 */
  ck('옛 PIN 을 읽는 코드(옮기기·둘러보기 패드)는 그대로',
    (noComment(NEW).match(/\.driverPin/g) || []).length, (noComment(OLD).match(/\.driverPin/g) || []).length);
  {
    /* 이미 driverPin 이 든 업체 자료를 넣어도 그 값을 지우는 코드가 돌지 않는다 */
    const R3 = boot(NEW, 'academy');
    R3.ev("cars = [{id:'car1',name:'1호차',driver:'박기사',driverPin:'1234'}]; saveCars(cars);");
    ck('저장된 driverPin 을 그냥 두면 그대로 남는다',
      (R3.ev('loadCars()')[0] || {}).driverPin, '1234');
  }
}

console.log('\n════ 5. ⑤ 화면 라벨 — 최근 로그인에 「새 기기 로그인 잠시 멈춤」 ════');
{
  const R = boot(NEW, 'academy');
  ck('drvWhyText("orglock")', R.sandbox.drvWhyText('orglock', false), '새 기기 로그인 잠시 멈춤');
  ck('(대조) 옛 판은 「실패」로만 나왔다', (() => {
    const O = boot(OLD, 'academy');
    return O.sandbox.drvWhyText('orglock', false);
  })(), '실패');
  ['nocode', 'badpin', 'locked', 'expired', 'device', 'punch:in', 'punch:out', 'pad:in'].forEach(w => {
    const O = boot(OLD, 'academy');
    ck('   「' + w + '」 라벨 그대로', R.sandbox.drvWhyText(w, false), O.sandbox.drvWhyText(w, false));
  });
}

console.log('\n════ 6. ④ index_raw.html ════');
{
  ck('작업 폴더에 없다', fs.existsSync('' + COS_ROOT + '/index_raw.html'), false);
  ck('저장소 파일 목록에 없다',
    cp.execSync('git -C ' + COS_ROOT + ' ls-files').toString().indexOf('index_raw') >= 0, false);
  ck('저장소 이력에도 없었다 (한 번도 올라간 적 없음)',
    cp.execSync('git -C ' + COS_ROOT + ' log --oneline --all -- index_raw.html').toString().trim(), '');
  ck('.gitignore 가 빼고 있었다', /index_raw\.html/.test(now('.gitignore')), true);
  ck('가리키는 곳 0 (링크·vercel·sw·CLAUDE.md)', (() => {
    const files = ['index.html', 's.html', 'home.html', 'terms.html', 'privacy.html',
                   'sw.js', 'vercel.json', 'manifest.json', 'CLAUDE.md', 'README.md'];
    return files.filter(f => { try { return now(f).indexOf('index_raw') >= 0; } catch (e) { return false; } }).join(',') || '없음';
  })(), '없음');
}

console.log('\n════ 7. 화면·문답표·바뀐 파일 ════');
{
  const TABS = ['dashboard', 'members', 'attendance', 'cars', 'schedule', 'payment', 'tax', 'notice', 'settings'];
  let same = 0; const diff = [];
  BIZ.forEach(biz => TABS.forEach(tab => {
    const one = (src) => {
      const R = boot(src, biz);
      R.ev("currentMode='admin'; currentAdminTab='" + tab + "';");
      try { R.sandbox.renderAdminTab(tab); } catch (e) { return 'ERR:' + e.message; }
      return String(R.document.getElementById('admin-content').innerHTML || '');
    };
    if (one(OLD) === one(NEW)) same++; else diff.push(biz + '/' + tab);
  }));
  ck('관리자 4업종 × 9화면 바이트 동일', same + '/36', '36/36');
  if (diff.length) console.log('      달라진 화면: ' + diff.join(', '));
  /* 기사 화면·둘러보기 */
  let dsame = 0, demosame = 0;
  BIZ.forEach(biz => {
    const one = (src, search) => {
      const R = boot(src, biz, search ? { search: search } : {});
      R.ev("currentMode='driver'; window._driverCarId='car1'; currentCarId='car1'; filterCourse=''; filterCar='';");
      try { R.sandbox.renderDrive(); R.sandbox.renderMembers(); } catch (e) { return 'ERR:' + e.message; }
      return String(R.document.getElementById('drive-tabs').innerHTML || '')
        + '§' + String(R.document.getElementById('app-content').innerHTML || '')
        + '§' + String(R.document.getElementById('member-list').innerHTML || '');
    };
    if (one(OLD) === one(NEW)) dsame++;
    if (one(OLD, '?org=' + biz + '_demo') === one(NEW, '?org=' + biz + '_demo')) demosame++;
  });
  ck('기사 화면 4업종 바이트 동일', dsame + '/4', '4/4');
  ck('둘러보기 기사 화면 4업종 바이트 동일', demosame + '/4', '4/4');

  const qa = require('./qa252.js');
  const a = qa.read(OLD), b = qa.read(NEW);
  ck('문답 수 그대로', b.length + '/' + a.length, '70/70');
  const changed = b.filter(q => { const o = a.find(x => x.t === q.t); return o && JSON.stringify(o) !== JSON.stringify(q); }).map(q => q.t);
  ck('손댄 문답 0개', changed.join(',') || '없음', '없음');
  ck('   「들어갈 수 없어요」 문답은 그대로', (() => {
    const q = b.find(x => x.t === '「지금은 들어갈 수 없어요」가 나와요');
    const o = a.find(x => x.t === '「지금은 들어갈 수 없어요」가 나와요');
    return JSON.stringify(q) === JSON.stringify(o);
  })(), true);

  const stat = cp.execSync('git -C ' + COS_ROOT + ' diff --numstat ' + BASE + ' ' + ROUND).toString().trim().split(LF);
  stat.forEach(l => { const p = l.split('\t'); console.log('      ' + p[2].padEnd(22) + '+' + p[0] + ' / −' + p[1]); });
  ck('바뀐 파일 목록', stat.map(l => l.split('\t')[2]).sort().join(','),
    'CLAUDE.md,api/admin-account.js,api/driver-auth.js,index.html,version.json');
  ck('firestore.rules 무변경', stat.every(l => !/firestore\.rules/.test(l)), true);
  ck('   규칙 503줄 그대로', (() => {
    const r = now('firestore.rules');
    return r.split(LF).length - (r.endsWith(LF) ? 1 : 0);
  })(), 503);
  ck('s.html·home·terms·privacy 손대지 않음',
    stat.every(l => !/s\.html|home\.html|terms\.html|privacy\.html/.test(l)), true);
  ck('CLAUDE.md 에 업체 단위 상한 적음',
    /ORG_FAIL_MAX 20/.test(now('CLAUDE.md')) && /새 기기 로그인만/.test(now('CLAUDE.md')), true);
  ck('CLAUDE.md 에 지운 세 동작 적음',
    /v260 에 그 api 세 동작까지 지웠다/.test(now('CLAUDE.md')), true);
  ck('CLAUDE.md 에 새 차량 driverPin 없음 적음',
    /새 차량 기본값에도 `driverPin` 칸이 없다\(v260\)/.test(now('CLAUDE.md')), true);
}

console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                        : '✔ ' + pass + '/' + pass + ' 전부 통과'));
process.exit(fail ? 1 : 0);
