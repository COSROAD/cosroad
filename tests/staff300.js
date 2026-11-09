/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드57 — **직원 삭제는 서버를 먼저 지운다 · 실패하면 멈춘다** (v300).
   ① 재현 — 서버가 ⓐ 던짐 ⓑ `{ok:false}` ⓒ 403 `expired` 일 때, 고치기 전에는
      명단에서 **사라지고** 「삭제했어요」가 뜨는데 **서버 문서는 남는다**(다시 지울 길 0)
   ② 고친 뒤 — **아무것도 안 지우고** 안내 · 서버 문서가 남아 **다시 시도할 수 있다**
   ③ 성공하면 — 지우고 배정 비우고 「삭제했어요」
   ④ PIN 없는 직원 — 서버를 **안 부르고** 종전대로 바로 지움
   ⑤ 둘러보기 — 서버를 **안 부른다** · ⑥ 기간 끝 — 서버 403 이 막는다
   ⑦ 대조 — 직원 **저장**(`saveStaff`)의 PIN 지우기와 **같은 꼴**인가(v280)
   ★ 바깥 통신 0 — 가짜 fetch. */
const cp = require('child_process');
const fs = require('fs');
const E = require('./env246.js');

const OLD_REF = process.env.COS_SRC_OLD_REF || '713cf9c';   /* v299 — 고치기 전 */
const NEW_SRC = fs.readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(58) + String(got).slice(0, 38)
    + (ok ? '' : '   (기대 ' + want + ')'));
};

const SUF = '__B';
const STAFF = [
  { id: 'st1', name: '최직원', hasPin: true, hourlyWage: 11000, taxMode: 'free33', breakAuto: true },
  { id: 'st2', name: '한직원', hourlyWage: 10000, taxMode: 'free33', breakAuto: true }   /* PIN 없음 */
];
const CARS = [{ id: 'car1', name: '1호차', helperStaffId: 'st1' }, { id: 'car2', name: '2호차' }];

function phone(opt) {
  opt = opt || {};
  const store = {};
  store['tkd_staff' + SUF] = JSON.stringify(STAFF);
  store['tkd_cars' + SUF] = JSON.stringify(CARS);
  store['tkd_org' + SUF] = JSON.stringify({ name: '가온학원', icon: '🚐', bizType: 'academy',
    destName: '학원', destLat: 37.44, destLon: 126.65 });
  const R = E.build({ src: opt.src || NEW_SRC, biz: 'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content', 'app-content', 'confirm-modal', 'confirm-ok-btn', 'main-header', 'today-date',
   'org-name-display', 'org-icon', 'driver-att-host', 'staff-edit-modal']
   .forEach((id) => { const e = E.makeEl('div'); e.id = id; R.byId[id] = e; });
  /* 서버 전용 칸(가짜) — 이 묶음의 핵심은 「여기가 지워졌나 / 남았나」다 */
  const SRV = { staffPins: { 'B_st1': 1 }, helperDocs: { 'B_st1': 1 }, devices: { 'B_hlp_st1': 1 } };
  const L = { api: [], alerts: [], toasts: [] };
  R.ev("currentMode='admin'; window._userOrgId='B'; window._userUid='uB';"
     + " window._userBizType='academy'; window._userPaidUntil=Date.now()+30*86400000;");
  R.ev('_firstSyncOk = true;');
  R.ev("window._auth={ currentUser:{ isAnonymous:false, getIdToken:function(){ return Promise.resolve('tok'); } } };");
  /* 서버 저장은 안 본다(이 묶음은 「서버 PIN 칸」과 「로컬 명단」만 본다) */
  R.ev('saveToFirebase = function(){ return Promise.resolve(true); };'
     + ' saveCarState = function(){ return Promise.resolve(true); };'
     + ' rebuildCarData = function(){}; refreshDriverAttHost = function(){};'
     + ' renderAdminTab = function(){};');
  R.sandbox.alert = R.win.alert = (m) => { L.alerts.push(String(m)); };
  R.ev('showToast = function(m){ window.__toast(String(m)); };');
  R.sandbox.__toast = R.win.__toast = (m) => { L.toasts.push(String(m)); };
  if (opt.demo) R.ev("isDemoMode = function(){ return true; };");
  /* 가짜 서버 — 실패 꼴 세 가지를 그대로 흉내 낸다 */
  R.sandbox.fetch = R.win.fetch = async (url, init) => {
    const body = JSON.parse((init && init.body) || '{}');
    L.api.push(body);
    if (opt.mode === 'throw') throw new Error('network down');   /* ⓐ 던짐 */
    if (body.action === 'removeStaffPin') {
      if (opt.mode === 'err') {                                   /* ⓑ {ok:false} */
        return { json: async () => ({ ok: false, message: '지우지 못했어요.' }) };
      }
      if (opt.mode === 'expired') {                               /* ⓒ 403 expired */
        return { json: async () => ({ ok: false, why: 'expired',
          message: '업체 이용 기간이 끝났어요. 연장하시면 바로 다시 됩니다.' }) };
      }
      /* 성공 — 서버가 셋을 지운다(실제 `removeStaffPin` 과 같은 꼴) */
      delete SRV.staffPins['B_' + body.staffId];
      delete SRV.helperDocs['B_' + body.staffId];
      delete SRV.devices['B_hlp_' + body.staffId];
      return { json: async () => ({ ok: true }) };
    }
    return { json: async () => ({ ok: true }) };
  };
  R.ev('staff = loadStaff(); cars = loadCars();');
  return { R, SRV, L };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* 확인 창의 「삭제」를 누른 것과 같다 — `confirmOk()` 는 async 콜백을 기다리지 않으므로
   콜백을 직접 받아 기다린다(마지막 장면에서 `confirmOk()` 자체도 한 번 눌러 본다). */
const del = async (p, id) => {
  p.R.ev('deleteStaff(' + JSON.stringify(id) + ')');
  const cb = p.R.sandbox._confirmCallback;
  if (typeof cb !== 'function') return 'NOCB';
  try { await cb(); } catch (e) { return 'THROW:' + e.message; }
  await wait(30);
  return 'ok';
};
const names = (p) => p.R.ev('loadStaff().map(function(s){return s.name;}).join(",")');
const helper = (p) => p.R.ev('String((loadCars().find(function(c){return c.id==="car1";})||{}).helperStaffId||"")');
const srvLeft = (p) => Object.keys(p.SRV.staffPins).join(',') + '|'
  + Object.keys(p.SRV.helperDocs).join(',') + '|' + Object.keys(p.SRV.devices).join(',');

(async () => {
  console.log('════ ① 재현 — 고치기 전(' + OLD_REF + ')에는 **지워지고 서버만 남는다**');
  for (const [mode, 뭐] of [['throw', '서버가 던짐(망 끊김)'], ['err', '{ok:false} 로 답함'],
                            ['expired', '403 기간 끝']]) {
    const o = phone({ src: OLD_SRC, mode: mode });
    await del(o, 'st1');
    ck('[옛/' + 뭐 + '] 명단에서 **사라졌다**', names(o), '한직원');
    ck('[옛/' + mode + '] 「삭제했어요」가 떴다', /삭제했어요/.test(o.L.toasts.join('|')), true);
    ck('[옛/' + mode + '] ★ 서버에는 **남아 있다**(PIN|배정|기기)', srvLeft(o), 'B_st1|B_st1|B_hlp_st1');
    ck('[옛/' + mode + '] ★ 다시 지울 길이 없다(명단에 없다)',
      o.R.ev('String(!!findStaff("st1"))'), 'false');
  }

  console.log('\n② 고친 뒤 — **아무것도 안 지우고** 안내 · 다시 시도할 수 있다');
  for (const [mode, 뭐] of [['throw', '서버가 던짐'], ['err', '{ok:false}'], ['expired', '403 기간 끝']]) {
    const p = phone({ mode: mode });
    await del(p, 'st1');
    ck('[새/' + 뭐 + '] ★ 명단이 **그대로**', names(p), '최직원,한직원');
    ck('[새/' + mode + '] ★ 동승 배정도 그대로', helper(p), 'st1');
    ck('[새/' + mode + '] ★ 「삭제했어요」가 **안 뜬다**', /삭제했어요/.test(p.L.toasts.join('|')), false);
    ck('[새/' + mode + '] 안내가 한 번 떴다', p.L.alerts.length, 1);
    ck('[새/' + mode + '] 서버 문서는 남아 있다(다시 시도 가능)', srvLeft(p), 'B_st1|B_st1|B_hlp_st1');
  }
  {
    const p = phone({ mode: 'err' });
    await del(p, 'st1');
    ck('★ 안내 글', /서버에서 이 직원의 PIN 을 지우지 못해 삭제를 멈췄어요/.test(p.L.alerts[0] || ''), true);
    ck('  까닭도 괄호로 붙는다', /\(지우지 못했어요\.\)/.test(p.L.alerts[0] || ''), true);
    const p2 = phone({ mode: 'expired' });
    await del(p2, 'st1');
    ck('★ 기간 끝은 **서버 안내 그대로**(연장하면 된다는 말이 있다)',
      /이용 기간이 끝났어요[\s\S]*연장/.test(p2.L.alerts[0] || ''), true);
    /* 같은 직원을 **다시** 지우기 — 이번엔 서버가 성공 */
    const p3 = phone({ mode: 'err' });
    await del(p3, 'st1');
    p3.R.ev("window.fetch = window.__okFetch;");
    p3.R.sandbox.__okFetch = p3.R.win.__okFetch = async (url, init) => {
      const body = JSON.parse((init && init.body) || '{}');
      p3.L.api.push(body);
      delete p3.SRV.staffPins['B_' + body.staffId];
      delete p3.SRV.helperDocs['B_' + body.staffId];
      delete p3.SRV.devices['B_hlp_' + body.staffId];
      return { json: async () => ({ ok: true }) };
    };
    p3.R.ev("window.fetch = window.__okFetch; fetch = window.__okFetch;");
    await del(p3, 'st1');
    ck('★ 실패한 뒤 **다시 누르면 지워진다**', names(p3), '한직원');
    ck('  서버도 깨끗해졌다', srvLeft(p3), '||');
  }

  console.log('\n③ 성공하면 — 지우고 배정 비우고 안내');
  {
    const p = phone({});
    await del(p, 'st1');
    ck('명단에서 빠졌다', names(p), '한직원');
    ck('★ 동승 배정이 비워졌다', '[' + helper(p) + ']', '[]');
    ck('★ 서버 셋이 지워졌다(PIN|배정|기기)', srvLeft(p), '||');
    ck('「삭제했어요」가 떴다', /삭제했어요/.test(p.L.toasts.join('|')), true);
    ck('안내창(alert)은 안 뜬다', p.L.alerts.length, 0);
    ck('  부른 창구는 `removeStaffPin` 하나',
      p.L.api.filter((x) => x.action === 'removeStaffPin').length, 1);
    /* 확인창의 「삭제」 단추를 **직접** 눌러도 같은지 */
    const p2 = phone({});
    p2.R.ev('deleteStaff("st1"); confirmOk();');
    await wait(60);
    ck('★ 「삭제」 단추(confirmOk)로도 같다', names(p2), '한직원');
  }

  console.log('\n④ PIN 없는 직원 — 서버를 **안 부르고** 종전대로');
  {
    const p = phone({ mode: 'err' });        /* 서버가 실패해도 상관없다 — 안 부른다 */
    await del(p, 'st2');
    ck('바로 지워졌다', names(p), '최직원');
    ck('★ 서버를 안 불렀다', p.L.api.length, 0);
    ck('「삭제했어요」가 떴다', /삭제했어요/.test(p.L.toasts.join('|')), true);
  }

  console.log('\n⑤ 둘러보기 — 서버를 **안 부른다**(체험이 끊기지 않게)');
  {
    const p = phone({ demo: true, mode: 'err' });
    await del(p, 'st1');
    ck('★ 서버를 안 불렀다', p.L.api.length, 0);
    ck('  화면에서는 지워진다(종전 그대로)', names(p), '한직원');
  }

  console.log('\n⑥⑦ 대조 — 직원 **저장**의 PIN 지우기와 같은 꼴인가 (v280)');
  {
    /* `saveStaff` 는 v280 부터 「서버 먼저 · `!rr||!rr.ok` 면 alert + return」이다.
       삭제도 **같은 검사 모양**을 쓰는지 소스로 본다(문구만 다르다). */
    ck('저장 쪽: `setStaffPin` 실패면 멈춘다',
      /if\(!rp \|\| !rp\.ok\)\{ alert\([\s\S]{0,120}?return; \}/.test(NEW_SRC), true);
    ck('저장 쪽: `removeStaffPin` 실패면 멈춘다',
      /if\(!rr \|\| !rr\.ok\)\{ alert\([\s\S]{0,120}?return; \}/.test(NEW_SRC), true);
    ck('★ 삭제 쪽도 같은 검사 모양',
      /rr=await driverAcctApi\(\{ action:'removeStaffPin'[\s\S]{0,400}?if\(!rr \|\| !rr\.ok\)\{/.test(NEW_SRC), true);
    /* ★ 쪽지(주석)에도 `saveStaff(list)` 라는 글자가 있다 — **주석을 걷어내고** 센다
       (처음에 그 글자에 걸려 거짓으로 깨졌다). */
    const bodyOf = (src) => {
      const f = src.slice(src.indexOf('function deleteStaff(id)'));
      return f.slice(0, f.indexOf('\n}\n')).replace(/\/\*[\s\S]*?\*\//g, '');
    };
    ck('★ 서버 호출이 `saveStaff(list)` **앞**이다',
      (function () {
        const body = bodyOf(NEW_SRC);
        return body.indexOf("action:'removeStaffPin'") >= 0
          && body.indexOf("action:'removeStaffPin'") < body.indexOf('saveStaff(list)');
      })(), true);
    ck('★ **빈 try/catch 로 삼키지 않는다**',
      /try\{\s*\n\s*if\(!\(typeof isDemoMode==='function' && isDemoMode\(\)\) && staffHasPin\(st\)\)\{[\s\S]{0,200}?\}catch\(e\)\{\}/
        .test(NEW_SRC), false);
    ck('  (대조) 옛 판에는 그 빈 try/catch 가 있었다',
      /try\{\s*\n\s*if\(!\(typeof isDemoMode==='function' && isDemoMode\(\)\) && staffHasPin\(st\)\)\{[\s\S]{0,200}?\}catch\(e\)\{\}/
        .test(OLD_SRC), true);
    ck('  (대조) 옛 판은 `saveStaff(list)` 가 **먼저**였다',
      (function () {
        const body = bodyOf(OLD_SRC);
        return body.indexOf('saveStaff(list)') >= 0
          && body.indexOf('saveStaff(list)') < body.indexOf("action:'removeStaffPin'");
      })(), true);
    /* ★ 버전은 「**300 이상** · `version.json` 과 같은 숫자」로 본다 —
       「=== 300」으로 못 박으면 **다음 회차에 거짓으로 깨진다**(addr299 가 그렇게 깨졌다).
       이 꼴은 CLAUDE.md 규칙 4(둘을 같이 올린다)를 **언제나** 지키는 검사다. */
    const appV = Number((NEW_SRC.match(/const APP_VERSION = (\d+);/) || [])[1] || 0);
    const jsonV = Number(JSON.parse(fs.readFileSync(COS_ROOT + '/version.json', 'utf8')).version);
    ck('  버전 300 이상', appV >= 300, true);
    ck('  `version.json` 과 `APP_VERSION` 이 같다', jsonV + '/' + appV, appV + '/' + appV);
    ck('★ `api/`·`lib/`·규칙은 **한 줄도** 안 바뀌었다',
      '[' + cp.execSync('git -C ' + COS_ROOT + ' diff --name-only ' + OLD_REF + ' -- api lib firestore.rules',
        { maxBuffer: 1 << 24 }).toString().trim() + ']', '[]');
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 바깥 통신 0 — 가짜 fetch · 실제 쓰기 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
