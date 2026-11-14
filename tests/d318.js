/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드72-D — **얹기 3단계** (v318).
   ① 재현 — 옛 판(v317)은 «알림장»·거래명세서·품목·자격증·업체 설정·세무를 **통째로** 써서
      서로 다른 레코드·칸을 고치면 **하나가 사라졌다**
   ② 고친 뒤 — 여섯 모두 **둘 다 남는다**(72-B `saveListKey` · 72-C `saveMapKey` **한 벌 재사용**)
   ③ «알림장» 공유 스냅샷 칸(`shareToken`·`shareTs`·`shareSig`)이 얹기에서 **안 빠진다**
   ④ 업체 설정은 **칸 단위** — 다른 칸 둘 다 남음 · 같은 칸 나중 이김 · 칸 지움
   ⑤ 세무는 **줄 단위** — 같은 달 다른 줄 둘 다 남음 · 줄 지움 · **옛 줄이 섞인 달은 통째**
      (줄이 두 벌로 쌓이지 않는다) · id 붙이기는 **멱등**
   ⑥ 품목은 **id 가 없었다** — 붙이는 첫 저장은 **통째**(두 벌 금지) · 그 뒤부터 얹기
   ⑦ 메아리 · 읽기 전용·둘러보기 · 첫 로그인 · 업체 바뀜 · 복원·전체 삭제
   ⑧ `data/*` **통째 쓰기 전수 표** — 복원·전체 삭제 말고 남은 자리와 그 까닭
   ★ 바깥 통신 0 — 가짜 Firestore. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');
const { thisRef } = require('./thisref.js');

const OLD_REF = process.env.COS_SRC_OLD_REF || '4fac008';   /* v317 — 고치기 전 */
const F = (p) => fs.readFileSync(COS_ROOT + '/' + p, 'utf8').replace(/\r\n/g, '\n');
const NEW_SRC = F('index.html');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
const THIS_REF = thisRef(318);

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(50)
    + String(got).slice(0, 44) + (ok ? '' : '   (기대 ' + want + ')'));
};
/* ★ `JSON.stringify(undefined)` 는 글자가 아니라 undefined 다 — 그대로 견주면 거짓 통과한다(72-C 교훈) */
const J = (v) => String(JSON.stringify(v));

function boot(src, opt) {
  opt = opt || {};
  const org = opt.org || 'B';
  const SUF = '__' + org;
  const SERVER = Object.assign({
    'data/members': '[]', 'data/cars': '[]', 'data/courses': '[]', 'data/staff': '[]',
    'data/org': JSON.stringify({ name: '가온학원', icon: '🚐', bizType: 'academy' }),
    'data/migration': JSON.stringify({ carState: true, at: 1 })
  }, opt.server || {});
  const store = {};
  ['tkd_members', 'tkd_cars', 'tkd_courses', 'tkd_staff', 'tkd_notices'].forEach((k) => {
    store[k] = '[]'; store[k + SUF] = '[]';
  });
  store['tkd_org'] = store['tkd_org' + SUF] = JSON.stringify({ name: '가온학원', icon: '🚐', bizType: 'academy' });
  Object.keys(opt.local || {}).forEach((k) => { store[k] = opt.local[k]; store[k + SUF] = opt.local[k]; });
  const R = E.build({ src: src, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  R.ev('currentMode="admin"; window._userOrgId=' + JSON.stringify(org) + '; window._userUid="uB";'
     + ' window._userBizType="academy"; window._userPaidUntil=Date.now()+1e9; window._userApproved=true;');
  R.ev('rebuildCarData=function(){}; renderAdminTab=function(){}; showToast=function(){};'
     + ' renderByTab=function(){}; saveCarState=function(){ return Promise.resolve(true); };'
     + ' saveOrgDriver=function(){};');
  R.ev('members=loadMembers(); cars=loadCars(); courses=loadCourses(); orgSettings=loadOrgSettings();'
     + ' notices=loadNotices();');
  R.sandbox.__srv = R.win.__srv = (k) => (Object.prototype.hasOwnProperty.call(SERVER, k) ? SERVER[k] : null);
  R.sandbox.__srvSet = R.win.__srvSet = (k, j) => { SERVER[k] = j; };
  R.sandbox.__srvKeys = R.win.__srvKeys = () => Object.keys(SERVER);
  R.ev('window.__writes = []; window.__subs = []; window.__alerts = [];');
  /* ★ 가짜 Firestore — `exists` 는 **함수**다(실제 모듈 SDK 와 같게 · 72-B 에 한 번 틀렸다) */
  R.ev('window._firestore = {'
     + ' doc: function(){ var p=Array.prototype.slice.call(arguments,1); return { key: p.slice(2).join("/"), org: p[1] }; },'
     + ' collection: function(){ var p=Array.prototype.slice.call(arguments,1); return { key: p.slice(2).join("/"), org: p[1] }; },'
     + ' getDoc: async function(ref){ var v = window.__srv(ref.key);'
     + '   return { exists: function(){ return v !== null; }, data: function(){ return { value: v }; } }; },'
     + ' getDocs: async function(ref){ var pre = ref.key + "/";'
     + '   var ks = window.__srvKeys().filter(function(k){ return k.indexOf(pre)===0; });'
     + '   return { forEach: function(cb){ ks.forEach(function(k){ cb({ id:k.slice(pre.length),'
     + '     data: function(){ return { value: window.__srv(k) }; } }); }); } }; },'
     + ' setDoc: async function(ref,o){ if(window.__failWrite) throw new Error("망 끊김");'
     + '   window.__writes.push("set "+ref.key);'
     + '   window.__srvSet(ref.key, (o && o.value!==undefined) ? o.value : JSON.stringify(o)); },'
     + ' updateDoc: async function(){}, deleteField: function(){ return "__DEL__"; },'
     + ' deleteDoc: async function(){},'
     + ' runTransaction: async function(db, fn){ var sets=[];'
     + '   var out = await fn({ get: async function(ref){ var v=window.__srv(ref.key);'
     + '       return { exists: function(){ return v!==null; }, data: function(){ return { value: v }; } }; },'
     + '     set: function(ref,o){ sets.push([ref,o]); } });'
     + '   sets.forEach(function(x){ window.__writes.push("tx "+x[0].key);'
     + '     window.__srvSet(x[0].key, x[1].value); });'
     + '   return out; },'
     + ' onSnapshot: function(ref, cb){ var s={key:ref.key, cb:cb, alive:true};'
     + '   window.__subs.push(s); return function(){ s.alive=false; }; } };');
  R.ev('window._db={}; window._fbReady=true; _firstSyncOk=true;');
  R.ev('window._auth={currentUser:{uid:"uB",isAnonymous:false,getIdToken:function(){return Promise.resolve("t");}}};');
  R.ev('_backupBeforeSave=function(){ return Promise.resolve(); };');
  R.ev('window.alert=function(m){ window.__alerts.push(String(m)); }; window.confirm=function(){ return true; };');
  R.SERVER = SERVER; R.SUF = SUF;
  return R;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = (R, k) => { try { return JSON.parse(R.SERVER[k] || 'null'); } catch (e) { return null; } };
const byId = (arr, id) => (Array.isArray(arr) ? arr : []).filter((x) => String(x.id) === String(id))[0];

/* 배열+id 넷 — A 는 폰에서 고치고, B 는 이미 서버에 적어 두었다 */
const LISTS = [
  { key: 'notices', local: 'tkd_notices', srv: 'data/notices',
    seed: [{ id: 1, content: '첫 알림장', sent: false }],
    mine: { id: 2, content: '내가 쓴 알림장', sent: false },
    other: { id: 3, content: '남이 쓴 알림장', sent: false },
    save: "(function(){ notices = loadNotices(); notices.push(" },
  { key: 'invoices', local: 'tkd_invoices', srv: 'data/invoices',
    seed: [{ id: 'inv_1', memberId: 1, total: 10000 }],
    mine: { id: 'inv_2', memberId: 1, total: 20000 },
    other: { id: 'inv_3', memberId: 2, total: 30000 },
    save: "(function(){ var L = loadInvoices(); L.push(" },
  { key: 'certificates', local: 'tkd_certificates', srv: 'data/certificates',
    seed: [{ id: 'c1', memberName: '가하은', year: 2025 }],
    mine: { id: 'c2', memberName: '나다움', year: 2026 },
    other: { id: 'c3', memberName: '다보람', year: 2026 },
    save: "(function(){ var L = loadCertificates(); L.push(" }
];
const saveCall = { notices: 'saveNotices();', invoices: 'saveInvoicesList(L);',
                   certificates: 'saveCertificates(L);' };
const doSave = (K) => K.save + JSON.stringify(K.mine) + '); ' + saveCall[K.key] + ' })()';

(async () => {
  console.log('════ ① 재현 — 옛 판(v317)은 **다른 레코드**를 고쳐도 하나가 사라졌다');
  for (const K of LISTS) {
    const L = {}; L[K.local] = JSON.stringify(K.seed);
    const S = {}; S[K.srv] = JSON.stringify(K.seed);
    const R = boot(OLD_SRC, { local: L, server: S });
    R.ev('window.__srvSet(' + JSON.stringify(K.srv) + ', '
       + JSON.stringify(JSON.stringify(K.seed.concat([K.other]))) + ');');   /* B 가 먼저 적었다 */
    R.ev(doSave(K));
    await wait(80);
    const after = srv(R, K.srv);
    ck('[옛] ' + K.key + ' — 내 것은 올라갔다', !!byId(after, K.mine.id), true);
    ck('[옛] ★ ' + K.key + ' — **남의 것이 사라졌다**',
      byId(after, K.other.id) ? '남았다' : '사라졌다', '사라졌다');
  }
  {   /* 업체 설정 — 칸 */
    const R = boot(OLD_SRC, { local: { 'tkd_org': JSON.stringify({ name: '가온학원', bank: '내 계좌' }) },
      server: { 'data/org': JSON.stringify({ name: '가온학원', bank: '내 계좌' }) } });
    R.ev("window.__srvSet('data/org', JSON.stringify({ name:'가온학원', bank:'내 계좌', stamp:'남이 올린 도장' }));");
    R.ev("(function(){ var o = loadOrgSettings(); o.bank = '내가 바꾼 계좌'; saveOrgSettings(o); })()");
    await wait(80);
    const after = srv(R, 'data/org');
    ck('[옛] org — 내 칸은 올라갔다', (after || {}).bank, '내가 바꾼 계좌');
    ck('[옛] ★ org — **남의 칸이 사라졌다**', (after || {}).stamp === undefined ? '사라졌다' : '남았다', '사라졌다');
  }
  {   /* 세무 — 같은 달 다른 줄 */
    const seed = { '2026_11': { income: [{ id: 't1', name: '가하은 수강료', amount: 150000 }], expense: [] } };
    const R = boot(OLD_SRC, { local: { 'tkd_tax': JSON.stringify(seed) },
      server: { 'data/tax': JSON.stringify(seed) } });
    const withOther = JSON.parse(JSON.stringify(seed));
    withOther['2026_11'].income.push({ id: 't9', name: '남이 넣은 줄', amount: 99000 });
    R.ev("window.__srvSet('data/tax', " + JSON.stringify(JSON.stringify(withOther)) + ");");
    R.ev("(function(){ var d = loadTaxData(); d['2026_11'].income.push({id:'t2',name:'내가 넣은 줄',amount:180000}); saveTaxData(d); })()");
    await wait(80);
    const rows = ((srv(R, 'data/tax') || {})['2026_11'] || {}).income || [];
    ck('[옛] tax — 내 줄은 올라갔다', !!byId(rows, 't2'), true);
    ck('[옛] ★ tax — **남의 줄이 사라졌다**(같은 달이라)',
      byId(rows, 't9') ? '남았다' : '사라졌다', '사라졌다');
  }

  console.log('\n② 고친 뒤 — 여섯 모두 **둘 다 남는다**');
  for (const K of LISTS) {
    const L = {}; L[K.local] = JSON.stringify(K.seed);
    const S = {}; S[K.srv] = JSON.stringify(K.seed);
    const R = boot(NEW_SRC, { local: L, server: S });
    R.ev('_lsSetBase(' + JSON.stringify(K.key) + ', ' + JSON.stringify(JSON.stringify(K.seed)) + ' && JSON.parse('
       + JSON.stringify(JSON.stringify(K.seed)) + '));');
    R.ev('window.__srvSet(' + JSON.stringify(K.srv) + ', '
       + JSON.stringify(JSON.stringify(K.seed.concat([K.other]))) + ');');
    R.ev(doSave(K));
    await wait(100);
    const after = srv(R, K.srv);
    ck('★ ' + K.key + ' — 내 것이 남았다', !!byId(after, K.mine.id), true);
    ck('★ ' + K.key + ' — **남의 것도 남았다**', !!byId(after, K.other.id), true);
    ck('  ' + K.key + ' — 트랜잭션으로 썼다',
      R.ev('window.__writes.filter(function(w){ return w.indexOf("tx ")===0; }).length') >= 1, true);
  }

  console.log('\n③ ★ «알림장» 공유 스냅샷 칸이 얹기에서 **안 빠진다** (v311)');
  {
    const seed = [{ id: 1, content: '사진 알림장', shareToken: 'tok1', shareTs: 1, shareSig: 'sig1' }];
    const R = boot(NEW_SRC, { local: { 'tkd_notices': JSON.stringify(seed) },
      server: { 'data/notices': JSON.stringify(seed) } });
    R.ev('_lsSetBase("notices", ' + JSON.stringify(JSON.stringify(seed)) + ' && JSON.parse(' + JSON.stringify(JSON.stringify(seed)) + '));');
    R.ev("window.__srvSet('data/notices', " + JSON.stringify(JSON.stringify(seed.concat([{ id: 5, content: '남의 알림장' }]))) + ");");
    R.ev("(function(){ notices = loadNotices(); notices[0].sent = true; saveNotices(); })()");
    await wait(100);
    const n1 = byId(srv(R, 'data/notices'), 1) || {};
    ck('★ `shareToken` 이 남았다', n1.shareToken, 'tok1');
    ck('★ `shareSig` 도 남았다', n1.shareSig, 'sig1');
    ck('  내 변경(보냄 표시)도 올라갔다', n1.sent, true);
    ck('  남의 «알림장» 도 남았다', !!byId(srv(R, 'data/notices'), 5), true);
    /* 리스너로 받아도 안 빠진다 — 아직 안 올린 내 변경을 얹을 때 */
    const got = R.ev('JSON.stringify(lsRebase("notices", JSON.parse('
      + JSON.stringify(JSON.stringify(seed)) + '), loadNotices()))');
    ck('  리스너 얹기에서도 그대로', (byId(JSON.parse(got), 1) || {}).shareToken, 'tok1');
  }

  console.log('\n④ ★ 업체 설정은 **칸 단위** (깊이 1)');
  {
    const R = boot(NEW_SRC, {});
    ck('`org` 이 map 꼴 목록에 있다', R.ev('MAP_KEYS.indexOf("org") >= 0'), true);
    ck('  깊이 1 — 칸 하나가 레코드',
      R.ev('Object.keys(mapFlat({name:"가온",bank:"1-2-3",stamp:"img"},"org")).join("|")'), 'name|bank|stamp');
    const base = { name: '가온학원', bank: '내 계좌' };
    const R2 = boot(NEW_SRC, { local: { 'tkd_org': JSON.stringify(base) },
      server: { 'data/org': JSON.stringify(base) } });
    R2.ev('_mpSetBase("org", ' + JSON.stringify(JSON.stringify(base)) + ' && JSON.parse(' + JSON.stringify(JSON.stringify(base)) + '));');
    R2.ev("window.__srvSet('data/org', JSON.stringify({ name:'가온학원', bank:'내 계좌', stamp:'남이 올린 도장', addrSido:'incheon' }));");
    R2.ev("(function(){ var o = loadOrgSettings(); o.bank = '내가 바꾼 계좌'; saveOrgSettings(o); })()");
    await wait(100);
    const after = srv(R2, 'data/org') || {};
    ck('★ 내 칸이 남았다', after.bank, '내가 바꾼 계좌');
    ck('★ **남의 칸도 남았다**(도장)', after.stamp, '남이 올린 도장');
    ck('★ 지역 칸(v299)도 남았다', after.addrSido, 'incheon');
    ck('  백업은 건너뛴다(`_skipBackup`)', R2.ev("_skipBackup('org')"), true);
    /* 칸 지움 */
    const R3 = boot(NEW_SRC, { local: { 'tkd_org': JSON.stringify({ name: '가온학원' }) },
      server: { 'data/org': JSON.stringify({ name: '가온학원', bank: '지울 계좌' }) } });
    R3.ev('_mpSetBase("org", { name:"가온학원", bank:"지울 계좌" });');
    R3.ev("(function(){ var o = loadOrgSettings(); delete o.bank; saveOrgSettings(o); })()");
    await wait(100);
    ck('★ 지운 칸은 **지워진다**', J((srv(R3, 'data/org') || {}).bank), 'undefined');
    ck('  다른 칸은 그대로', (srv(R3, 'data/org') || {}).name, '가온학원');
  }

  console.log('\n⑤ ★ 세무는 **줄 단위** · 옛 줄이 섞인 달은 통째');
  {
    const R = boot(NEW_SRC, {});
    const flat = (o) => R.ev('Object.keys(mapFlat(' + JSON.stringify(o) + ',"tax")).join("|")').split('\u0001').join('›');
    ck('새 줄(id 있음) — 줄마다 레코드',
      flat({ '2026_11': { income: [{ id: 't1' }, { id: 't2' }], expense: [{ id: 't3' }] } }),
      '2026_11›income›t1|2026_11›income›t2|2026_11›expense›t3');
    ck('★ 옛 줄(id 없음)이 섞인 달 — **그 달 통째**',
      flat({ '2026_11': { income: [{ name: '옛 줄' }], expense: [] } }), '2026_11');
    /* ★★ 빈 달은 **아무것도 내지 않는다** — 그 달 자리를 남기면 「마지막 줄 지우기」가
       그 달 통째 쓰기가 되어 **남의 줄이 같이 지워진다**(처음에 그렇게 짰다가 이 검사가 잡았다). */
    ck('★ 줄이 하나도 없는 달 — 아무것도 안 낸다',
      flat({ '2026_12': { income: [], expense: [] } }) || '(없음)', '(없음)');
    ck('  id 붙이기는 **멱등**',
      R.ev('(function(){ var d={"2026_11":{income:[{name:"A"}],expense:[]}};'
        + ' var a=ensureTaxIds(d); var b=ensureTaxIds(d); return a+"/"+b; })()'), 'true/false');
    /* 같은 달 다른 줄 — 둘 다 남는다 */
    const seed = { '2026_11': { income: [{ id: 't1', name: '가하은 수강료', amount: 150000 }], expense: [] } };
    const R2 = boot(NEW_SRC, { local: { 'tkd_tax': JSON.stringify(seed) },
      server: { 'data/tax': JSON.stringify(seed) } });
    R2.ev('_mpSetBase("tax", ' + JSON.stringify(JSON.stringify(seed)) + ' && JSON.parse(' + JSON.stringify(JSON.stringify(seed)) + '));');
    const withOther = JSON.parse(JSON.stringify(seed));
    withOther['2026_11'].income.push({ id: 't9', name: '남이 넣은 줄', amount: 99000 });
    R2.ev("window.__srvSet('data/tax', " + JSON.stringify(JSON.stringify(withOther)) + ");");
    R2.ev("(function(){ var d = loadTaxData(); d['2026_11'].income.push({id:'t2',name:'내가 넣은 줄',amount:180000}); saveTaxData(d); })()");
    await wait(100);
    let rows = ((srv(R2, 'data/tax') || {})['2026_11'] || {}).income || [];
    ck('★ 내 줄이 남았다', !!byId(rows, 't2'), true);
    ck('★ **남의 줄도 남았다**(같은 달)', !!byId(rows, 't9'), true);
    ck('  줄 수 셋', rows.length, 3);
    /* 줄 지움 — 그 줄만 */
    const R3 = boot(NEW_SRC, { local: { 'tkd_tax': JSON.stringify({ '2026_11': { income: [], expense: [] } }) },
      server: { 'data/tax': JSON.stringify(withOther) } });
    R3.ev('_mpSetBase("tax", ' + JSON.stringify(JSON.stringify(seed)) + ' && JSON.parse(' + JSON.stringify(JSON.stringify(seed)) + '));');
    R3.ev("(function(){ var d = loadTaxData(); saveTaxData(d); })()");
    await wait(100);
    rows = ((srv(R3, 'data/tax') || {})['2026_11'] || {}).income || [];
    ck('★ 내가 지운 줄만 빠졌다', J((byId(rows, 't1') || {}).id), 'undefined');
    ck('★ 남의 줄은 그대로', !!byId(rows, 't9'), true);
    /* ★★ 옛 앱이 id 없는 줄을 넣은 달 — 통째로 쓰고 **두 벌로 쌓이지 않는다** */
    const oldRow = { '2026_11': { income: [{ name: '옛 앱이 넣은 줄', amount: 1000 }], expense: [] } };
    const R4 = boot(NEW_SRC, { local: { 'tkd_tax': JSON.stringify(oldRow) },
      server: { 'data/tax': JSON.stringify(oldRow) } });
    R4.ev('_mpSetBase("tax", ' + JSON.stringify(JSON.stringify(oldRow)) + ' && JSON.parse(' + JSON.stringify(JSON.stringify(oldRow)) + '));');
    R4.ev("(function(){ var d = loadTaxData(); d['2026_11'].income.push({name:'내가 넣은 줄',amount:2000}); saveTaxData(d); })()");
    await wait(100);
    rows = ((srv(R4, 'data/tax') || {})['2026_11'] || {}).income || [];
    ck('★ 옛 줄 + 내 줄 = **두 줄**(두 벌로 안 쌓인다)', rows.length, 2);
    ck('  둘 다 id 가 붙었다', rows.filter((r) => !!r.id).length, 2);
  }

  console.log('\n⑥ ★ 품목은 id 가 없었다 — 붙이는 첫 저장은 **통째**');
  {
    const old = [{ code: 'A1', name: '배추', price: 3000 }, { code: 'A2', name: '무', price: 2000 }];
    const R = boot(NEW_SRC, { local: { 'tkd_products': JSON.stringify(old) },
      server: { 'data/products': JSON.stringify(old) } });
    R.ev('_lsSetBase("products", ' + JSON.stringify(JSON.stringify(old)) + ' && JSON.parse(' + JSON.stringify(JSON.stringify(old)) + '));');
    ck('기준본에 id 없는 줄이 있다', R.ev('_lsHasNoId(_lsBaseOf("products"))'), true);
    R.ev("(function(){ var L = loadProducts(); L.push({code:'A3',name:'당근',price:1500}); saveProducts(L); })()");
    await wait(100);
    let after = srv(R, 'data/products') || [];
    ck('★ 셋 다 있다(두 벌 아님)', after.length, 3);
    ck('★ 모두 id 가 붙었다', after.filter((r) => !!r.id).length, 3);
    ck('  통째로 썼다(그 한 번만)',
      R.ev('window.__writes.filter(function(w){ return w.indexOf("set ")===0; }).length') >= 1, true);
    /* 그 뒤부터는 얹기 — 남의 품목이 남는다 */
    const ids = after.map((r) => r.id);
    R.ev("window.__srvSet('data/products', " + JSON.stringify(JSON.stringify(after.concat([{ id: 'p_other', code: 'B1', name: '남이 넣은 품목' }]))) + ");");
    R.ev("(function(){ var L = loadProducts(); L[0].price = 3300; saveProducts(L); })()");
    await wait(100);
    after = srv(R, 'data/products') || [];
    ck('★ 둘째 저장은 **얹는다** — 남의 품목이 남았다', !!byId(after, 'p_other'), true);
    ck('  내 수정도 올라갔다', (byId(after, ids[0]) || {}).price, 3300);
    ck('  트랜잭션으로 썼다',
      R.ev('window.__writes.filter(function(w){ return w.indexOf("tx ")===0; }).length') >= 1, true);
  }

  console.log('\n⑦ 메아리 · 읽기 전용·둘러보기 · 첫 로그인 · 업체 바뀜 · 복원');
  {
    const seed = [{ id: 1, content: '첫 알림장' }];
    const R = boot(NEW_SRC, { local: { 'tkd_notices': JSON.stringify(seed) } });
    R.ev('_lsFlight["notices"] = ' + JSON.stringify(JSON.stringify(seed)) + ' && JSON.parse(' + JSON.stringify(JSON.stringify(seed)) + ');');
    R.ev("(function(){ var L = loadNotices(); L[0].content = '보낸 뒤 또 고침'; localStorage.setItem('tkd_notices', JSON.stringify(L)); })()");
    ck('★ 메아리 — 보낸 뒤 또 고친 것이 남는다',
      (byId(JSON.parse(R.ev('JSON.stringify(lsRebase("notices", JSON.parse('
        + JSON.stringify(JSON.stringify(seed)) + '), loadNotices(), _lsFlight["notices"]))')), 1) || {}).content,
      '보낸 뒤 또 고침');
    const ro = boot(NEW_SRC, { local: { 'tkd_notices': JSON.stringify(seed) } });
    ro.ev('isReadOnlyMode = function(){ return true; };');
    ck('★ 읽기 전용이면 **서버 값 그대로**',
      ro.ev('JSON.stringify(lsRebase("notices", [{id:9,content:"서버"}], loadNotices()))'),
      '[{"id":9,"content":"서버"}]');
    ck('  읽기 전용은 저장도 막는다', await ro.ev('saveListKey("notices")'), false);
    ck('  읽기 전용 — `org` 도 막는다', await ro.ev('saveMapKey("org")'), false);
    const dm = boot(NEW_SRC, {});
    dm.ev('isDemoMode = function(){ return true; };');
    ck('  둘러보기도 막는다', (await dm.ev('saveListKey("products")')) + '/' + (await dm.ev('saveMapKey("org")')), 'false/false');
    /* 첫 로그인 — 기준본이 없으면 서버가 이긴다 */
    const fst = boot(NEW_SRC, { local: { 'tkd_notices': JSON.stringify(seed) } });
    ck('첫 로그인 — 기준본 없음', fst.ev('_lsBaseOf("notices") === null'), true);
    ck('★ 그때는 서버가 이긴다',
      fst.ev('JSON.stringify(lsRebase("notices", [{id:9,content:"서버"}], loadNotices()))'),
      '[{"id":9,"content":"서버"}]');
    /* 업체 바뀜 — 여덟+여섯 묶음을 전부 버린다 */
    const og = boot(NEW_SRC, {});
    og.ev('_lsSetBase("notices", [{id:1}]); _mpSetBase("org", {name:"가온"});');
    ck('기준본이 섰다', og.ev('_lsBaseOf("notices")!==null && _mpBaseOf("org")!==null'), true);
    og.ev('window._userOrgId = "C";');
    ck('★ 업체가 바뀌면 둘 다 안 쓴다',
      og.ev('(_lsBaseOf("notices") === null) + "/" + (_mpBaseOf("org") === null)'), 'true/true');
    ck('  로그아웃에서도 비운다(돌려서 확인)',
      og.ev('(function(){ _lsSetBase("products",[{id:"p1"}]); _mpSetBase("org",{a:1}); csQueueReset();'
        + ' return (_lsBase["products"]===null) + "/" + (_mpBase["org"]===null) + "/" + (_baseOrg===""); })()'),
      'true/true/true');
    /* 복원·전체 삭제 — 통째 + 기준본 맞춤(소스) */
    /* ★ `restoreData` **안**만 센다 — 같은 글자가 동기화·리스너에도 있다(전수로 세면 12) */
    const inRestore = (() => {
      const i = NEW_SRC.indexOf('function restoreData(');
      const j = NEW_SRC.indexOf('\nfunction ', i + 10);
      return NEW_SRC.slice(i, j < 0 ? NEW_SRC.length : j);
    })();
    ck('  소스 — 복원이 다섯 키 기준본을 맞춘다(v318 넷 + org)',
      (inRestore.match(/_lsSetBase\('(notices|invoices|products|certificates)'/g) || []).length
      + '/' + /_mpSetBase\('org', orgSettings\)/.test(inRestore), '4/true');
  }

  console.log('\n⑦-2 ★★ 쓴 값(합친 결과)을 **폰에도** 넣는다 — 리스너를 안 기다린다');
  {
    /* 왜 — 합친 값에는 **남의 레코드**가 있는데 폰에는 없다. 리스너가 오기 전에 저장이 한 번
       더 일어나면 다음 차이표가 그것을 「내가 지웠다」로 세어 **남의 것을 지운다**
       (실제 크롬 `run318.js` ⓒ 가 잡았다 · v315·v317 부터 있던 자리다). */
    const seed = [{ id: 1, content: '첫 알림장' }];
    const mk = (src) => {
      const R = boot(src, { local: { 'tkd_notices': JSON.stringify(seed) },
        server: { 'data/notices': JSON.stringify(seed) } });
      R.ev('_lsSetBase("notices", ' + JSON.stringify(JSON.stringify(seed)) + ' && JSON.parse(' + JSON.stringify(JSON.stringify(seed)) + '));');
      R.ev("window.__srvSet('data/notices', " + JSON.stringify(JSON.stringify(seed.concat([{ id: 7, content: '남의 알림장' }]))) + ");");
      return R;
    };
    const R = mk(NEW_SRC);
    R.ev("(function(){ notices = loadNotices(); notices.push({id:2,content:'내 알림장'}); saveNotices(); })()");
    await wait(120);
    ck('★ 폰에도 남의 «알림장» 이 들어왔다', !!byId(JSON.parse(R.ev('JSON.stringify(loadNotices())')), 7), true);
    ck('  내 것도 그대로', !!byId(JSON.parse(R.ev('JSON.stringify(loadNotices())')), 2), true);
    /* 그래서 **바로 한 번 더 저장**해도 남의 것이 안 지워진다 */
    R.ev("(function(){ notices = loadNotices(); notices[0].content = '또 고침'; saveNotices(); })()");
    await wait(120);
    ck('★ 한 번 더 저장해도 남의 것이 남는다', !!byId(srv(R, 'data/notices'), 7), true);
    /* ★ 대조 — 옛 판(v317)은 폰에 넣지 않아 **그 두 번째 저장이 남의 것을 지웠다** */
    const O = mk(OLD_SRC);
    O.ev("(function(){ notices = loadNotices(); notices.push({id:2,content:'내 알림장'}); saveNotices(); })()");
    await wait(120);
    ck('  [옛] 폰에는 남의 것이 없었다', byId(JSON.parse(O.ev('JSON.stringify(loadNotices())')), 7) ? '있다' : '없다', '없다');
    O.ev("(function(){ notices = loadNotices(); notices[0].content = '또 고침'; saveNotices(); })()");
    await wait(120);
    ck('★ [옛] 그 두 번째 저장이 **남의 것을 지웠다**',
      byId(srv(O, 'data/notices'), 7) ? '남았다' : '사라졌다', '사라졌다');
  }

  console.log('\n⑧ ★ `data/*` **통째 쓰기 전수 표** (복원·전체 삭제 말고 남은 자리)');
  {
    /* 소스에서 `saveToFirebase('<키>'` 를 모두 뽑아, **복원 밖**에 있는 것만 센다.
       ★★ **쪽지 글(주석)을 먼저 지운다** — 이 저장소 쪽지에는 `saveToFirebase('org')` 같은
         글자가 설명으로 들어 있다(줄 머리가 `*` 가 아닌 이어진 줄도 있어 줄 단위로는 못 가린다).
         줄 번호를 지키려고 **같은 길이의 빈칸**으로 바꾼다. */
    const noComment = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/./g, ' '));
    const lines = noComment(NEW_SRC).split('\n');
    const restoreFrom = lines.findIndex((l) => /function restoreData\(/.test(l));
    const restoreTo = (() => {
      for (let i = restoreFrom + 1; i < lines.length; i++) if (/^function /.test(lines[i])) return i;
      return lines.length;
    })();
    const out = [];
    lines.forEach((l, i) => {
      const m = l.match(/saveToFirebase\('([a-zA-Z]+)'/g);
      if (!m) return;
      if (i >= restoreFrom && i < restoreTo) return;                 /* 복원은 일부러 통째 */
      m.forEach((x) => out.push({ key: x.replace(/[^a-zA-Z]/g, '').replace('saveToFirebase', ''), line: i + 1 }));
    });
    const WHY = {
      orgDriver: '기사용 **요약 사본**(만들어 낸 것 · 한 문서가 작고 원본은 `org` 이다)',
      migration: '옮기기 **표시 한 칸**(깃발 — 레코드가 없다)',
      key: '`saveListKey`·`saveMapKey` 안의 **일부러 통째**(첫 저장 · `opt.whole`)'
    };
    out.forEach((r) => console.log('      · ' + String(r.line).padStart(6) + '행  '
      + r.key.padEnd(12) + (WHY[r.key] || '?')));
    const unknown = out.filter((r) => !WHY[r.key]);
    ck('★ 까닭을 적지 않은 통째 쓰기가 **0곳**', unknown.map((r) => r.key + '@' + r.line).join(',') || '없음', '없음');
    ck('  (대조) 옛 판에는 그런 자리가 **다섯**이었다',
      (() => {
        const ol = noComment(OLD_SRC).split('\n');
        const a = ol.findIndex((l) => /function restoreData\(/.test(l));
        let b = ol.length; for (let i = a + 1; i < ol.length; i++) if (/^function /.test(ol[i])) { b = i; break; }
        const s2 = new Set();
        ol.forEach((l, i) => {
          if (i >= a && i < b) return;
          (l.match(/saveToFirebase\('([a-zA-Z]+)'/g) || []).forEach((x) => {
            const k = x.replace(/[^a-zA-Z]/g, '').replace('saveToFirebase', '');
            if (!WHY[k]) s2.add(k);
          });
        });
        return [...s2].sort().join(',');
      })(), 'certificates,invoices,notices,org,products');
  }

  console.log('\n⑨ 소스 전수 — 한 벌 · import·노출 줄 · 규칙·서버 0줄');
  {
    ck('★ 배열+id 여덟 · map 꼴 여섯',
      NEW_SRC.match(/var LIST_KEYS = \[[\s\S]*?\];/)[0].replace(/\s+/g, ' ').replace(/.*\[|\].*/g, '').split(',').length
      + '/' + NEW_SRC.match(/var MAP_KEYS = \[[^\]]*\]/)[0].split(',').length, '8/6');
    ck('★ 다섯 저장 함수가 한 벌을 지난다',
      /function saveNotices\(\)\{[\s\S]{0,400}?saveListKey\('notices'\)/.test(NEW_SRC)
      && /function saveProducts\(list\)\{[\s\S]{0,500}?saveListKey\('products'\)/.test(NEW_SRC)
      && /function saveInvoicesList\(list\)\{[\s\S]{0,300}?saveListKey\('invoices'\)/.test(NEW_SRC)
      && /function saveCertificates\(arr\)\{[\s\S]{0,300}?saveListKey\('certificates'\)/.test(NEW_SRC)
      && /function saveOrgSettings\(s\)\{[\s\S]{0,300}?saveMapKey\('org'\)/.test(NEW_SRC), true);
    ck('  새 꼴 0 — 줄 단위도 `mapFlat`·`mapDiff`·`mapApply` 한 벌이 한다',
      (NEW_SRC.match(/^(async )?function (mapFlat|mapDiff|mapApply|mpRebase|writeMapPatch|saveMapKey|idDiff|idApply|lsRebase|writeListPatch|saveListKey)\(/mg) || []).length, 11);
    const impOf = (s) => (s.match(/import \{([^}]*)\} from "https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.0\/firebase-firestore\.js"/) || ['', ''])[1];
    const expOf = (s) => (s.match(/window\._firestore = \{([^}]*)\}/) || ['', ''])[1];
    ck('★ import·노출 줄에 쓰는 함수가 다 있다',
      ['doc', 'setDoc', 'getDoc', 'collection', 'getDocs', 'deleteDoc', 'onSnapshot', 'runTransaction', 'updateDoc', 'deleteField']
        .filter(function (n) { return !(new RegExp('\\b' + n + '\\b').test(impOf(NEW_SRC))
          && new RegExp('\\b' + n + '\\b').test(expOf(NEW_SRC))); }).join(',') || '빠진 것 없음', '빠진 것 없음');
    ck('★ 규칙·`storage.rules`·서버 0줄',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF
        + (THIS_REF ? ' ' + THIS_REF : '')
        + ' -- api lib firestore.rules storage.rules', { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
    console.log('      (잰 자리: ' + OLD_REF + ' → ' + (THIS_REF || '작업트리') + ')');
    const panels = (s) => (s.match(/BACK_PANEL_IDS\s*=\s*\[[\s\S]*?\]/) || [''])[0];
    ck('  새 창(덮개) 0', panels(NEW_SRC) === panels(OLD_SRC) ? '그대로' : '바뀜', '그대로');
    ck('  `ORG_KEYS` 그대로',
      (NEW_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0] === (OLD_SRC.match(/ORG_KEYS = \[[^\]]*\]/) || [''])[0], true);
    ck('  `ORG_DRIVER_KEYS` 그대로(기사 읽기 범위)',
      (NEW_SRC.match(/ORG_DRIVER_KEYS = \[[^\]]*\]/) || [''])[0] === (OLD_SRC.match(/ORG_DRIVER_KEYS = \[[^\]]*\]/) || [''])[0], true);
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    ck('  버전 318 이상', appV >= 318 ? 'OK(' + appV + ')' : 'NG(' + appV + ')', 'OK(' + appV + ')');
    ck('  `version.json` 과 같다', String(JSON.parse(F('version.json')).version), String(appV));
    const QA = (s) => { const i = s.indexOf('var HELP_QA=['); return i < 0 ? '' : s.slice(i, s.indexOf('\n];', i)); };
    ck('  문답표 그대로(화면 글자 0줄)', QA(NEW_SRC) === QA(OLD_SRC) ? '그대로' : '바뀜', '그대로');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 가짜 Firestore · 실서비스 읽기·쓰기 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
