/* tests/ 로 옮김(코스로드53) — 저장소 루트는 이 줄로 찾는다(절대경로 금지). */
const COS_ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* 코스로드60-B2 — **PIN 있는 직원은 모두 자기 폰으로 출퇴근**(v294) + **56**(판으로 찍은 것이 폰에 안 보임).
   고치기 전:
     ① 배정(동승 차량)이 **없으면 로그인 자체가 403 `nocar`** 였다 — 그래서 직원은
        자기 폰으로 출퇴근을 못 하고 관리자 기기 앞까지 가야 했다.
     ② 관리자 판으로 직원 PIN 을 찍으면 서버는 **「누구인지」만** 돌려주고 **앱이** `staffAtt` 에
        적었다 → 폰이 읽는 **사본**(`drivers/hlp_….att`)이 안 생겨, 새로고침하면 출근 표시가
        사라지고 「출근」을 또 누르게 됐다(**56**).
   고친 뒤: 로그인은 배정 없이도 되고(문서를 서버가 만든다), 판도 **서버가 찍는다**(사본 같이).
   가짜 firebase-admin — 실제 쓰기 0 · 문자 0. */
const crypto = require('crypto');
const cp = require('child_process');
const E = require('./drvenv.js');
const { SRC, makeState, call } = E;
const DRV = SRC.drv;
const OLD_REF = process.env.COS_API_OLD_REF || '8674f21';      /* v293 — 고치기 전 */
const DRV_OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/driver-auth.js',
  { maxBuffer: 1 << 26 }).toString();
const SRC_ADMIN_OLD = cp.execSync('git -C ' + COS_ROOT + ' show ' + OLD_REF + ':api/admin-account.js',
  { maxBuffer: 1 << 26 }).toString();

let pass = 0, fail = 0;
const ck = (label, got, want) => {
  const ok = String(got) === String(want);
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + String(label).padEnd(52) + String(got).slice(0, 44)
    + (ok ? '' : '   (기대 ' + want + ')'));
};
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const SECRET = 'SEKRIT-TEST';
const ORG = 'academy_owner1', OWNER = 'OWNER1', CODE = '123456';
const ST = 'st2';                      /* PIN 있는 직원 — 배정 없음 */
const ST_CAR = 'st9';                  /* PIN 있고 배정도 있는 직원(도우미) */
const HUID = 'hlp_' + ORG + '_' + ST, HUID_CAR = 'hlp_' + ORG + '_' + ST_CAR;
const DAY = 86400000, NOW = Date.UTC(2026, 9, 31, 11, 20, 0);   /* = KST 2026-10-31 20:20 */
const pinHash = (pin) => sha(pin + '|' + ORG + '|' + SECRET);

function st(opt) {
  opt = opt || {};
  const S = makeState({ now: NOW });
  S.docs['users/' + OWNER] = { orgId: ORG, approved: true, withdrawn: false,
    paidUntil: opt.expired ? NOW - DAY : NOW + 30 * DAY, plan: 'paid' };
  S.docs['orgCodes/' + CODE] = { orgId: ORG, updatedAt: 1 };
  S.docs['staffPins/' + ORG + '_' + ST]     = { org: ORG, staffId: ST,     pinHash: pinHash('2222'), updatedAt: 1 };
  S.docs['staffPins/' + ORG + '_' + ST_CAR] = { org: ORG, staffId: ST_CAR, pinHash: pinHash('3333'), updatedAt: 1 };
  /* 배정이 **있는** 직원은 종전처럼 문서가 있다(관리자가 setCarHelper 로 만든 것) */
  S.docs['orgs/' + ORG + '/drivers/' + HUID_CAR] = { role: 'helper', staffId: ST_CAR,
    carId: 'car1', ownerUid: OWNER, updatedAt: 1 };
  S.tokens = { ownerTok: { uid: OWNER, firebase: { sign_in_provider: 'password' } } };
  return S;
}
const login = (src, S, pin) => call(src, S, { action: 'login', orgCode: CODE, pin: pin, deviceId: 'DEV1' }, '', '1.2.3.4');
const pad = (src, S, pin) => call(src, S, { action: 'pinCheckin', org: ORG, pin: pin }, 'ownerTok', '1.2.3.4');
const drvDoc = (S, uid) => S.docs['orgs/' + ORG + '/drivers/' + uid] || null;
const staffAtt = (S) => {
  const d = S.docs['orgs/' + ORG + '/data/staffAtt'];
  if (!d) return null;
  try { return JSON.parse(d.value); } catch (e) { return null; }
};

(async () => {
  console.log('════ ① 재현 — 배정 없는 직원은 **로그인 자체가 막혔다**');
  {
    const S = st();
    const r = await login(DRV_OLD, S, '2222');
    ck('[옛] 403 으로 막힌다', r.code, 403);
    ck('[옛] 까닭은 `nocar`', (r.body || {}).why, 'nocar');
    ck('[옛] 배정 문서도 안 생긴다', String(drvDoc(S, HUID)), 'null');

    const S2 = st();
    const r2 = await login(DRV, S2, '2222');
    ck('★ [새] 들어온다', r2.code, 200);
    ck('★ [새] 토큰을 받았다', !!(r2.body || {}).token, true);
  }

  console.log('\n════ ② 새 판 — 배정이 없어도 로그인되고, 문서를 **서버가 만든다**');
  {
    const S = st();
    const r = await login(DRV, S, '2222');
    ck('200 으로 들어온다', r.code, 200);
    ck('토큰을 받았다', !!(r.body || {}).token, true);
    const d = drvDoc(S, HUID);
    ck('★ 배정 문서가 **생겼다**', d ? 'O' : '없음', 'O');
    ck('★ `carId` 는 **빈 값**', d ? JSON.stringify(d.carId) : 'x', '""');
    ck('  `role:helper` · staffId · ownerUid',
      d ? [d.role, d.staffId, d.ownerUid].join('/') : 'x', 'helper/' + ST + '/' + OWNER);
    ck('  `users/hlp_…` 도 만들어졌다',
      JSON.stringify((S.docs['users/' + HUID] || {}).role || null), '"helper"');
    ck('  기기는 **사람 기준**으로 묶인다',
      JSON.stringify((S.docs['driverDevices/' + ORG + '_hlp_' + ST] || {}).deviceId || null), '"DEV1"');

    /* 배정이 **있는** 직원은 carId 를 건드리지 않는다 */
    const S2 = st();
    const r2 = await login(DRV, S2, '3333');
    ck('★ 배정 있는 직원 — 200', r2.code, 200);
    ck('★ 그 `carId` 를 **안 건드린다**', (drvDoc(S2, HUID_CAR) || {}).carId, 'car1');

    /* 기간이 끝난 업체는 종전 그대로 막는다 */
    const S3 = st({ expired: true });
    const r3 = await login(DRV, S3, '2222');
    ck('★ 기간 끝난 업체는 **막힌다**', r3.code + '/' + ((r3.body || {}).why || ''), '403/expired');
    ck('  그때는 문서도 안 만든다', String(drvDoc(S3, HUID)), 'null');
  }

  console.log('\n════ ③ 56 — 판으로 찍은 직원 출퇴근이 **폰에도 보이나**');
  {
    const S = st();
    const r = await pad(DRV_OLD, S, '2222');
    ck('[옛] 판 응답은 「누구인지」만', (r.body || {}).kind, 'staff');
    ck('[옛] 서버가 `staffAtt` 에 **안 적었다**', String(staffAtt(S)), 'null');
    ck('[옛] 폰이 읽는 사본도 **없다**(56)', String(drvDoc(S, HUID)), 'null');

    const S2 = st();
    const r2 = await pad(DRV, S2, '2222');
    /* ★ `kind` 는 **'staff' 그대로** 둔다(배포 직후 남아 있는 옛 앱이 그 글자로 직원을 가린다) —
       찍힌 결과는 **`punch`** 로 온다(v294). */
    ck('  `kind` 는 종전 그대로 staff', (r2.body || {}).kind, 'staff');
    ck('★ [새] 판이 **출근을 찍는다**', (r2.body || {}).punch, 'in');
    ck('★ 시각이 온다(서버 KST)', /^\d\d:\d\d$/.test(String((r2.body || {}).time || '')), true);
    ck('  직원 id 도 온다', (r2.body || {}).staffId, ST);
    const sa = staffAtt(S2) || {};
    ck('★ `staffAtt` 의 **그 칸**에 적혔다',
      JSON.stringify(sa[ST + '_2026-10-31'] || null),
      JSON.stringify({ in: (r2.body || {}).time }));
    ck('★★ 폰이 읽는 **사본도 같이** 적혔다(56 해결)',
      JSON.stringify((drvDoc(S2, HUID) || {}).att || null),
      JSON.stringify({ date: '2026-10-31', in: (r2.body || {}).time, out: '' }));

    /* 두 번째 · 세 번째 */
    const r3 = await pad(DRV, S2, '2222');
    ck('★ 두 번째는 퇴근', (r3.body || {}).punch, 'out');
    ck('  사본의 퇴근도 찍혔다',
      String(((drvDoc(S2, HUID) || {}).att || {}).out || '').length > 0, true);
    const r4 = await pad(DRV, S2, '2222');
    ck('★ 세 번째는 `done`', (r4.body || {}).punch, 'done');

    /* 기사 PIN 은 종전 그대로(판이 기사도 받는다) */
    const S4 = st();
    S4.docs['driverPins/' + ORG + '_car1'] = { org: ORG, carId: 'car1', pinHash: pinHash('1234'), updatedAt: 1 };
    const r5 = await pad(DRV, S4, '1234');
    ck('기사 PIN 은 종전처럼 차량에 찍힌다', (r5.body || {}).kind + '/' + ((r5.body || {}).carId || ''), 'in/car1');

    /* 기간 끝난 업체 · probe(v293) 는 그대로 */
    const S5 = st({ expired: true });
    const r6 = await pad(DRV, S5, '2222');
    ck('기간 끝난 업체는 403 expired', r6.code + '/' + ((r6.body || {}).why || ''), '403/expired');
    const S6 = st();
    const r7 = await call(DRV, S6, { action: 'pinCheckin', org: ORG, pin: '2222', probe: true }, 'ownerTok', '1.2.3.4');
    ck('★ probe 는 **여전히 쓰기 0**', r7.code + '/' + ((r7.body || {}).kind || '') + '/' + String(staffAtt(S6)),
      '200/staff/null');
  }

  console.log('\n════ ④ 직원을 지우면 배정 문서도 **지운다** (57 결정)');
  {
    const S = st();
    await login(DRV, S, '2222');                 /* 문서가 생긴 상태 */
    ck('문서가 있다', drvDoc(S, HUID) ? 'O' : '없음', 'O');
    const r = await call(SRC.admin, S, { action: 'removeStaffPin', org: ORG, staffId: ST }, 'ownerTok', '1.2.3.4');
    ck('PIN 지우기 → 200', r.code, 200);
    ck('★ 배정 문서가 **없어졌다**', String(drvDoc(S, HUID)), 'null');
    ck('  PIN 도 없어졌다', String(S.docs['staffPins/' + ORG + '_' + ST] || null), 'null');
    ck('  묶인 기기도 풀렸다', String(S.docs['driverDevices/' + ORG + '_hlp_' + ST] || null), 'null');
    /* 대조 — 옛 판은 carId 만 비우고 **문서를 남겼다** */
    const S2 = st();
    await login(DRV, S2, '2222');
    const r2 = await call(SRC_ADMIN_OLD, S2, { action: 'removeStaffPin', org: ORG, staffId: ST }, 'ownerTok', '1.2.3.4');
    ck('  (대조) 옛 판은 문서를 **남겼다**', (drvDoc(S2, HUID) || {}).carId, '');
  }

  console.log('\n════ ⑤ 앱 — 판에서 찍은 결과를 **서버 값으로** 적는가 · 배정 없음 문구');
  {
    /* 앱 쪽(env246) — 같은 회차의 index.html 로 본다 */
    const EA = require('./env246.js');
    const fsx = require('fs');
    const SRC_APP = fsx.readFileSync(COS_ROOT + '/index.html', 'utf8').replace(/\r\n/g, '\n');
    const STAFF_L = [{ id: 'st2', name: '최직원', hourlyWage: 10000, taxMode: 'free33' }];
    const mk = () => {
      const R = EA.build({ src: SRC_APP, biz: 'academy',
        localStorage: { 'tkd_staff__B': JSON.stringify(STAFF_L) } });
      if (R.error) throw R.error;
      ['pin-result', 'pin-display', 'pin-checkin-modal', 'admin-content', 'app-content',
       'drive-screen', 'member-list', 'drive-tabs'].forEach((id) => {
        const el = EA.makeEl('div'); el.id = id; R.byId[id] = el;
      });
      R.sandbox._db = R.win._db = {};
      const w = [];
      R.sandbox._firestore = R.win._firestore = {
        doc: () => ({}), collection: () => ({}),
        getDoc: async () => ({ exists: () => false }),
        getDocs: async () => ({ forEach: () => {} }),
        setDoc: async () => { w.push('set'); }, deleteDoc: async () => {},
        runTransaction: async (d, f) => f({ get: async () => ({ exists: () => false }),
                                            set: () => { w.push('tx'); } }),
        onSnapshot: () => () => {}
      };
      R.ev("currentMode='admin'; window._userOrgId='B'; window._userUid='uB';"
         + " window._userBizType='academy'; window._userPaidUntil=Date.now()+1e9; _firstSyncOk=true;");
      R.ev('staff = loadStaff();');
      return { R: R, w: w };
    };
    /* ① 서버가 찍어 준 값(`punch`)으로 적고, 서버로 **또 쓰지 않는다** */
    const a1 = mk();
    a1.R.ev("handleStaffPinCheckin({id:'st2',name:'최직원'},"
          + " {kind:'staff',staffId:'st2',punch:'in',time:'08:30',date:'2026-10-31'})");
    ck('★ 폰에 **서버 시각**이 적힌다',
      a1.R.ev("JSON.stringify((loadDriverAtt()['st2_2026-10-31']||{}).in||null)"), '"08:30"');
    ck('★ 서버로 **또 쓰지 않는다**(원본은 서버가 썼다)', a1.w.length, 0);
    /* ② `punch` 가 없는 응답(옛 서버)은 종전 길 — 앱이 적고 **저장까지** 한다 */
    const a2 = mk();
    a2.R.ev("handleStaffPinCheckin({id:'st2',name:'최직원'})");
    /* `saveDriverAtt` → `saveCarState()` 는 **기다리지 않는 비동기**다 — 한 박자 쉰다 */
    await new Promise((r) => setTimeout(r, 400));
    ck('  (옛 서버 응답) 앱이 적고 저장한다',
      a2.R.ev("String(Object.keys(loadDriverAtt()).length)") + '/' + (a2.w.length > 0), '1/true');
    /* ③ 배정 없는 직원 화면 문구 */
    const a3 = mk();
    a3.R.ev('window._isHelperAcct=true;');
    const txt = String(a3.R.ev('driverNoCarHtml()')).replace(/<[^>]*>/g, '');
    ck('★ 「출근·퇴근만」이라고 알려 준다', /출근·퇴근만/.test(txt), true);
    ck('  「동승할 차량이 배정되지 않았어요」는 더 안 쓴다', /동승할 차량이 배정되지/.test(txt), false);
    const a4 = mk();
    const txt2 = String(a4.R.ev('driverNoCarHtml()')).replace(/<[^>]*>/g, '');
    ck('  기사(도우미 아님) 문구는 그대로', /배정된 차량이 없어요/.test(txt2), true);
  }

  console.log('\n' + (fail ? '✘ 실패 ' + fail + '건 / 통과 ' + pass + '건'
                            : '✔ ' + pass + '/' + pass + ' 전부 통과'));
  process.exit(fail ? 1 : 0);
})();
