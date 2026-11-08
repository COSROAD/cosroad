/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드52(43-C) — 직원 근태(`staffAtt`)를 **바뀐 칸만** 쓰기.
   ★ 대조 먼저: 고치기 전(v281 · be5e959)에서 **관리자 저장 한 번에 도우미 출근이 지워지는 것**을
     실측한 뒤, 고친 판에서 안 그런지 본다 (v275 `att` 와 **같은 꼴**의 함정).
   가짜 Firestore 지만 runTransaction 을 진짜처럼 돌린다. 실제 쓰기 0 · 문자 0. */
const cp = require('child_process');
const OLD_REF = process.env.COS_SRC_OLD_REF || 'be5e959';   /* v281 + 51 = 고치기 전 */
if (!('COS_SRC_NEW_REF' in process.env)) process.env.COS_SRC_NEW_REF = '';   /* 새 쪽 = 작업트리 */
const E = require('./env246.js');

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 52)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const OLD_SRC = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':index.html',
  { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');

const D7 = ['월','화','수','목','금','토','일'];
const MEMBERS = [{ id:1, name:'가하은', carId:'car1', courseId:'c1', days:D7,
                   location:'1', lat:37.41, lon:126.68, phone:'010-1' }];
const CARS = [{ id:'car1', name:'1호차', driver:'박기사', phone:'010-9-1' }];
const COURSES = [{ id:'c1', name:'A반', depart:'15:00' }];
/* 직원 둘 — st2 = 동승 도우미(서버가 찍는다) · st1 = 관리자 PIN 패드로 찍는 직원 */
const STAFF = [{ id:'st1', name:'최직원', phone:'010-7', hasPin:true, hourlyWage:12000, mealAllow:0, taxMode:'free33', breakAuto:true },
               { id:'st2', name:'한도움', phone:'010-8', hasPin:true, hourlyWage:11000, mealAllow:0, taxMode:'free33', breakAuto:true }];
const SUF = '__cosroad_default';
const TODAY = '2026-11-08';

function makeServer(init) {
  return { carState: JSON.parse(JSON.stringify((init && init.carState) || {})),
           data: JSON.parse(JSON.stringify((init && init.data) || {})),
           backups: {}, writes: [], listeners: [] };
}
function phone(SRV, mode, opt) {
  opt = opt || {};
  const store = {};
  store['tkd_members'+SUF] = JSON.stringify(MEMBERS);
  store['tkd_cars'+SUF]    = JSON.stringify(CARS);
  store['tkd_courses'+SUF] = JSON.stringify(COURSES);
  store['tkd_staff'+SUF]   = JSON.stringify(STAFF);
  store['tkd_org'+SUF]     = JSON.stringify({ name:'가온', icon:'🚐', bizType:'academy',
    destName:'학원', destLat:37.44, destLon:126.65 });
  const R = E.build({ src: opt.src || E.SRC_NEW, biz:'academy', localStorage: store });
  if (R.error) throw R.error;
  ['admin-content','app-content','drive-screen','admin-screen','fb-loading','member-screen',
   'member-list','main-header','today-date','org-name-display','org-icon','login-screen',
   'main-app','bottom-action','mode-badge','header-btns','filter-chips','search-input',
   'day-tabs','member-add-area','drive-tabs','pin-result','drv-punch-msg']
   .forEach((id) => { const el = E.makeEl('div'); el.id = id; R.byId[id] = el; });
  const listeners = SRV.listeners;
  const fire = (col) => {
    listeners.filter((l) => l.col === col).forEach((l) => {
      try {
        if (l.key !== undefined) {
          const v = SRV[col][l.key];
          l.cb({ exists: () => v !== undefined, data: () => ({ value: JSON.stringify(v) }) });
        } else {
          l.cb({ forEach: (f) => Object.keys(SRV[col]).forEach((k) =>
            f({ id: k, data: () => ({ value: JSON.stringify(SRV[col][k]) }) })) });
        }
      } catch (e) {}
    });
  };
  R.sandbox._firestore = R.win._firestore = {
    doc: (db,c1,o,c2,k) => ({ col:c2, key:k }),
    collection: (db,c1,o,c2) => ({ col:c2 }),
    getDoc: async (ref) => {
      const src = SRV[ref.col] || {};
      const has = Object.prototype.hasOwnProperty.call(src, ref.key);
      return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
    },
    getDocs: async (ref) => ({
      forEach: (cb) => Object.keys(SRV[ref.col] || {}).forEach((k) =>
        cb({ id:k, data: () => ({ value: JSON.stringify(SRV[ref.col][k]) }) }))
    }),
    setDoc: async (ref, d) => {
      SRV[ref.col] = SRV[ref.col] || {};
      SRV.writes.push(ref.col + '/' + ref.key);
      SRV[ref.col][ref.key] = d.value !== undefined ? JSON.parse(d.value) : d;
      fire(ref.col);
    },
    deleteDoc: async () => {},
    runTransaction: async (db, fn) => {
      const tx = {
        get: async (ref) => {
          const src = SRV[ref.col] || {};
          const has = Object.prototype.hasOwnProperty.call(src, ref.key);
          return { exists: () => has, data: () => ({ value: JSON.stringify(src[ref.key]) }) };
        },
        set: (ref, d) => {
          SRV[ref.col] = SRV[ref.col] || {};
          SRV.writes.push('tx ' + ref.col + '/' + ref.key);
          SRV[ref.col][ref.key] = JSON.parse(d.value);
          fire(ref.col);
        }
      };
      return await fn(tx);
    },
    onSnapshot: (ref, cb) => { listeners.push({ col: ref.col, key: ref.key, cb: cb }); return () => {}; }
  };
  R.sandbox._db = R.win._db = {};
  R.ev("currentMode='" + mode + "';");
  R.ev("window._userOrgId='cosroad_default';");
  R.sandbox._userOrgId = 'cosroad_default';
  if (mode === 'driver') {
    R.sandbox._isDriverAcct = true;
    R.ev("window._isDriverAcct=true; window._driverCarId='" + (opt.carId || 'car1') + "';");
    if (opt.helper) R.ev("window._isHelperAcct=true; window._driverStaffId='" + opt.helper + "';");
  } else {
    R.ev("window._userUid='u1'; window._userPaidUntil=Date.now()+30*86400000; window._userBizType='academy';");
  }
  R.ev('members = loadMembers(); cars = loadCars(); courses = loadCourses();');
  return { R, SRV };
}

/* 한 장면: 서버가 도우미 출근을 찍는다 → (관리자는 아직 못 받음) → 관리자가 저장한다 */
async function scene(src) {
  const SRV = makeServer({
    carState: { car1: { ride:{'1':{on:true}}, rideOff:{}, carlog:{records:[],plans:{}},
                        delivDone:{}, dropDone:{}, att:{} } },
    data: { staffAtt: { ['st1_' + TODAY]: { in:'08:30', out:'17:30' } } }
  });
  const admin = phone(SRV, 'admin', { src });
  await admin.R.ev('syncFromFirebase()');
  await new Promise((r) => setTimeout(r, 350));
  /* ★ 서버(api/driver-auth)가 도우미 출근을 찍는다 — 관리자 폰은 아직 모른다 */
  SRV.data.staffAtt['st2_' + TODAY] = { in: '09:00' };
  /* 관리자가 «회원» 을 저장한다(주소 고침 등) → saveCarState → staffAtt 저장 */
  await admin.R.ev('saveMembers(members)');
  await new Promise((r) => setTimeout(r, 400));
  const sa = SRV.data.staffAtt || {};
  return {
    도우미출근: JSON.stringify(sa['st2_' + TODAY] || null),
    직원기존: JSON.stringify(sa['st1_' + TODAY] || null),
    쓴것: SRV.writes.filter((w) => /staffAtt/.test(w)).join(',')
  };
}

(async () => {
  console.log('════ ① 대조 — 고치기 전(' + OLD_REF + ')에는 **관리자 저장이 도우미 출근을 지운다**');
  {
    const r = await scene(OLD_SRC);
    ck('[옛] 도우미 출근이 **사라진다**', r.도우미출근, 'null');
    ck('[옛] 관리자가 들고 있던 직원 기록은 남는다', r.직원기존, '{"in":"08:30","out":"17:30"}');
    /* 쓴 것에는 백업(`backups/staffAtt__시각`)도 섞인다 — 보려는 것은 **본 저장이 setDoc 인가**다
       (`tx data/staffAtt` 가 아니라 `data/staffAtt`) */
    ck('[옛] 통째로 덮어쓴다(setDoc)', /(^|,)data\/staffAtt(,|$)/.test(r.쓴것) && !/tx data\/staffAtt/.test(r.쓴것), true);
  }

  console.log('\n② 고친 뒤 — 둘 다 남는다');
  {
    const r = await scene(E.SRC_NEW);
    ck('★ 도우미 출근 그대로', r.도우미출근, '{"in":"09:00"}');
    ck('★ 기존 직원 기록도 그대로', r.직원기존, '{"in":"08:30","out":"17:30"}');
    ck('바뀐 것이 없으면 **안 쓴다**', r.쓴것, '');
  }

  console.log('\n③ 관리자가 직원 근태를 고치면 **그 칸만** 바뀐다');
  {
    const SRV = makeServer({
      carState: { car1: { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},
                          delivDone:{}, dropDone:{}, att:{} } },
      data: { staffAtt: { ['st1_' + TODAY]: { in:'08:30' } } }
    });
    const admin = phone(SRV, 'admin', {});
    await admin.R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 350));
    SRV.data.staffAtt['st2_' + TODAY] = { in:'09:00' };            /* 서버가 찍은 도우미 출근 */
    /* 관리자가 st1 퇴근을 손으로 넣는다 (PIN 패드 직원 출퇴근과 같은 길) */
    await admin.R.ev("(function(){ var a=loadDriverAtt(); a['st1_" + TODAY + "']={in:'08:30',out:'18:00'}; saveDriverAtt(a); })()");
    await new Promise((r) => setTimeout(r, 400));
    const sa = SRV.data.staffAtt;
    ck('st1 퇴근이 올라갔다', JSON.stringify(sa['st1_' + TODAY]), '{"in":"08:30","out":"18:00"}');
    ck('★ 도우미(st2) 출근은 그대로', JSON.stringify(sa['st2_' + TODAY]), '{"in":"09:00"}');
    /* 쓴 것에 백업도 섞인다 — 본 저장이 **트랜잭션**인지를 본다 */
    const w3 = SRV.writes.filter((w)=>/staffAtt/.test(w));
    ck('본 저장이 트랜잭션이다', w3.indexOf('tx data/staffAtt') >= 0 && w3.indexOf('data/staffAtt') < 0, true);
    ck('덮어쓰기 직전 백업도 남는다', w3.some((w)=>/^backups\/staffAtt__/.test(w)), true);
  }

  console.log('\n④ 관리자가 직원 근태를 **지우면** 지워진다 (한 칸만)');
  {
    const SRV = makeServer({
      carState: { car1: { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},
                          delivDone:{}, dropDone:{}, att:{} } },
      data: { staffAtt: { ['st1_' + TODAY]: { in:'08:30', out:'18:00' },
                          ['st2_' + TODAY]: { in:'09:00' } } }
    });
    const admin = phone(SRV, 'admin', {});
    await admin.R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 350));
    await admin.R.ev("(function(){ var a=loadDriverAtt(); delete a['st1_" + TODAY + "']; saveDriverAtt(a); })()");
    await new Promise((r) => setTimeout(r, 400));
    const sa = SRV.data.staffAtt;
    ck('st1 기록이 지워졌다', JSON.stringify(sa['st1_' + TODAY] || null), 'null');
    ck('★ 도우미(st2) 것은 그대로', JSON.stringify(sa['st2_' + TODAY]), '{"in":"09:00"}');
    /* 한 칸만 지우기 — in 만 지우는 경우(관리자 수기 토글) */
    SRV.data.staffAtt['st2_' + TODAY] = { in:'09:00', out:'19:00' };
    await admin.R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 350));
    await admin.R.ev("(function(){ var a=loadDriverAtt(); a['st2_" + TODAY + "']={in:'09:00'}; saveDriverAtt(a); })()");
    await new Promise((r) => setTimeout(r, 400));
    ck('out 만 지워진다', JSON.stringify(SRV.data.staffAtt['st2_' + TODAY]), '{"in":"09:00"}');
  }

  console.log('\n⑤ 관리자 폰이 서버 변경을 **받는다**(staffAtt 리스너)');
  {
    const SRV = makeServer({
      carState: { car1: { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},
                          delivDone:{}, dropDone:{}, att:{} } },
      data: { staffAtt: {} }
    });
    const admin = phone(SRV, 'admin', {});
    await admin.R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 350));
    /* 서버가 쓴 것처럼 리스너를 깨운다 */
    SRV.data.staffAtt['st2_' + TODAY] = { in:'09:10' };
    SRV.listeners.filter((l) => l.col === 'data' && l.key === 'staffAtt')
      .forEach((l) => { try { l.cb({ exists: () => true,
        data: () => ({ value: JSON.stringify(SRV.data.staffAtt) }) }); }
        catch (e) { /* 가짜 DOM 이 모자라 renderByTab 이 터지는 것은 이 시험의 관심이 아니다 */ } });
    await new Promise((r) => setTimeout(r, 250));
    ck('관리자 폰에 도우미 출근이 보인다',
      admin.R.ev("JSON.stringify(loadDriverAtt()['st2_" + TODAY + "']||null)"), '{"in":"09:10"}');
    /* 그 뒤 관리자가 저장해도 안 지워진다(기준본이 갱신됐다) */
    await admin.R.ev('saveMembers(members)');
    await new Promise((r) => setTimeout(r, 400));
    ck('그 뒤 관리자 저장에도 그대로', JSON.stringify(SRV.data.staffAtt['st2_' + TODAY]), '{"in":"09:10"}');
  }

  console.log('\n⑥ 급여·근태 셈은 안 바뀐다 (직원 몫은 직원 급여로만)');
  {
    const SRV = makeServer({
      carState: { car1: { ride:{}, rideOff:{}, carlog:{records:[],plans:{}},
                          delivDone:{}, dropDone:{}, att:{ [TODAY]: { in:'07:00', out:'19:00' } } } },
      data: { staffAtt: { ['st2_' + TODAY]: { in:'09:00', out:'18:00' } } }
    });
    const admin = phone(SRV, 'admin', {});
    await admin.R.ev('syncFromFirebase()');
    await new Promise((r) => setTimeout(r, 350));
    ck('합친 근태에 기사 칸(car1_날짜)이 있다',
      admin.R.ev("JSON.stringify(loadDriverAtt()['car1_" + TODAY + "']||null)"), '{"in":"07:00","out":"19:00"}');
    ck('합친 근태에 직원 칸(st2_날짜)이 있다',
      admin.R.ev("JSON.stringify(loadDriverAtt()['st2_" + TODAY + "']||null)"), '{"in":"09:00","out":"18:00"}');
    ck('직원 키 판정(_isStaffAttKey)', admin.R.ev("[_isStaffAttKey('st2_" + TODAY + "'),_isStaffAttKey('car1_" + TODAY + "')].join(',')"), 'true,false');
    /* 쪼갤 때도 섞이지 않는다 */
    ck('쪼개면 직원은 staffAtt 로, 기사는 차량 문서로',
      admin.R.ev("(function(){ var s=splitCarState(); return [Object.keys(s.staffAtt).join('|'), Object.keys(s.byCar.car1.att).join('|')].join(' / '); })()"),
      'st2_' + TODAY + ' / ' + TODAY);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
    : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  console.log('※ 가짜 Firestore — 실제 쓰기 0 · 문자 0');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', (e && e.stack) || e); process.exit(1); });
