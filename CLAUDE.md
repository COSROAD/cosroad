# CLAUDE.md — COSROAD 작업 규칙

> 이 파일은 Claude Code가 이 폴더에서 작업할 때마다 자동으로 읽는 규칙서입니다.

## 프로젝트 개요
- COSROAD (cosroad.com): 학원·공공·물류·택배 4업종 차량 운행 관리 웹앱 — 주식회사 프리존
- 앱: `index.html` 단일 파일(약 50만 자, PWA) / 홈페이지: `home.html` / 약관: `terms.html`·`privacy.html`
- 서버: `api/` Vercel 서버리스 (cosroad.vercel.app)
  - `rc-quick.js` 티맵(검색·경로·경유지 최적화·역지오코딩) — ROADJOB과 공용
  - `kakao-search.js` 주소검색 (카카오 정확도+거리 병합, 카카오에 없으면 네이버 보조)
  - `send-sms.js`·`send-alimtalk.js` 알리고 문자·알림톡 (허용 출처 검사 있음 — 완화 금지)
  - `admin-account.js` 기사 계정 만들기·비밀번호 다시 정하기 (firebase-admin, v250)
    환경변수 `FIREBASE_SERVICE_ACCOUNT` 필요 · ID 토큰 검사 + 허용 출처 검사
    v255 추가: 기사 로그인 관리 — `issueOrgCode`(업체 번호 6자리) · `setDriverPin` · `checkPinDup`
    · `removeDriverPin` · `unbindDevice` · `driverInfo`(PIN 설정 여부·기기·최근 로그인 5건)
    · `migrateDriverData`(옛 `cars[].driverPin` → 해시). 권한은 모두 **마스터 · 소유자 · `_test` 출입 계정** 세 갈래.
    PIN 해시 = `sha256(pin|org|OTP_SECRET)` — 새 환경변수 없음. **PIN 원문·해시는 응답·로그에 넣지 않는다.**
  - `driver-auth.js` 기사 로그인·출퇴근 (firebase-admin, v255) — `login` / `checkin` / `checkout` / `pinCheckin`
    환경변수 `FIREBASE_SERVICE_ACCOUNT`·`OTP_SECRET` 필요
    `login`: 업체 번호 + PIN → 해시 대조 → 기기 묶기 → `createCustomToken(drv_<org>_<carId>, {driver,org,carId})`
    없는 번호·틀린 PIN 은 **같은 문구**(업체 존재 여부가 새지 않게) · 10분 5회 잠금 · IP 1시간 60회
    **v260 — 업체 번호 단위 상한 하나 더**: `ORG_FAIL_MAX 20` / `ORG_FAIL_WINDOW 1시간`.
    기기 id 를 바꿔 가며 여러 IP 로 나눠 시도하면 「아직 한 번도 로그인 안 한 기사」의 PIN 을
    맞혀 그 기기로 먼저 묶을 수 있었다. 그래서 **아직 묶이지 않은 기기의 실패만** 업체 단위로 센다
    (`driverRl/o.<sha256(org)>`). 넘으면 그 업체는 **새 기기 로그인만** 1시간 멈추고,
    **이미 묶인 기기는 그대로 로그인된다**(공격으로 업체가 멈추지 않게).
    없는 번호는 세지 않는다(셀 업체가 없고, 앞으로 만들 번호를 미리 막는 길도 막는다).
    새 기기가 제대로 묶이면 그 수를 **비운다**(기사 여럿이 첫 로그인에서 잘못 눌러도 한 명이
    들어오면 풀린다). 멈춘 동안 응답은 기존 잠금과 **같은 꼴**(`why:'orglock'` 은 기록에만 남고
    차량관리 「최근 로그인」에 「새 기기 로그인 잠시 멈춤」으로 보인다).
    `checkin`/`checkout`: carId·org 는 **토큰 claim 만** 쓴다(본문 값 불신) · `driverAtt` 를 트랜잭션으로 고친다
    시각은 **서버 KST**(`new Date(ms+9h)` 후 UTC getter) — 폰 시계를 바꿔도 안 바뀐다
    `pinCheckin`: 관리자 공용 패드용. 기사 PIN 이 아니면 404 `why:'notdriver'` → 앱이 직원·회원 PIN 으로 이어 본다
    서버 전용 컬렉션(규칙 `read, write: if false`): `orgCodes`·`driverPins`·`driverDevices`·`driverLogins`·`driverRl`
  - `signup.js` **가입** (firebase-admin, v261) — `bizCheck` / `create`
    환경변수 `FIREBASE_SERVICE_ACCOUNT`·`OTP_SECRET`·`ALIGO_*`·**`DATA_GO_KR_KEY`**(국세청) 필요
    순서: 인증번호 확인(`purpose:'signup'`) → **국세청 진위+계속사업자 확인을 서버에서 다시**
    → `createUser` → `users/{uid}` → 문자 2건(마스터 알림·신청자 계좌). users 쓰기가 실패하면
    **방금 만든 계정을 지운다**(반쪽 계정 금지). 응답은 `{ok:true}` 뿐 — 토큰·비번·uid 를 안 준다.
    국세청: `POST https://api.odcloud.kr/api/nts-businessman/v1/validate` · `serviceKey`·`returnType` 은 쿼리,
    본문 `{businesses:[{b_no,start_dt,p_nm}]}` — **선택 칸은 보내지 않는다**(`p_nm2` 를 넣으면 진위확인이 안 된다).
    `valid=='01'` AND `status.b_stt_cd=='01'`(계속사업자)만 통과 · **장애·키 없음이면 가입을 막는다**(조용히 통과 금지).
    체크섬(`bizNoChecksumOk`)에서 걸리면 국세청을 **부르지 않는다**. 미리 확인(`bizCheck`)은 IP 1시간 30회.
    같은 사업자번호는 **막지 않고** `bizNoDup` 으로 표시만 한다(지점 운영이 있다 — 사장님 결정).
    마스터 알림 받을 번호는 `orgs/_master/data/billing.notifyPhone`(비면 `010-3660-3911`).
  - `otp.js` 문자 인증번호 (firebase-admin, v252 · v261 공용 분리) — `send` / `verify-reset` / `changePhone`
    환경변수 `FIREBASE_SERVICE_ACCOUNT`·`OTP_SECRET`·`ALIGO_KEY`·`ALIGO_USER_ID`·`ALIGO_SENDER` 필요
    인증번호는 **서버에서만** 만들고 맞춘다 (화면은 번호·6자리만 보낸다) · 코드 원문은 저장·로그 금지(해시만)
    Firestore `otp` 컬렉션에 보관 — 규칙은 `read, write: if false` (Admin SDK 만 접근)
    쓰임새(`purpose`): `reset`(본인 비번 재설정) · `changeNew`(마스터 번호 교체) · **`signup`(가입, v261)**
    `reset` 은 **없는 번호도 성공처럼** 답한다(남의 가입 여부 감추기). `signup` 은 반대로 이미 가입된 번호면 409 —
    가입 창이라 숨길 이유가 없고, 숨기면 왜 안 되는지 알 수 없다.
  - `lib/otp-core.js` 인증번호 공용 한 벌 (v261) — `otp.js`·`signup.js` 가 **같은 코드**로 맞춘다
    만들기·맞추기(`checkCode`)·빈도 제한·번호 규칙(`phoneDigits`·`phoneLoginId`)·`clientIp`·알리고 호출.
    **왜 `api/` 밖인가** — Vercel 공식 문서대로다: `api/` 안의 파일은 **그 자체가 함수 주소로 열린다**
    (「Keep shared utilities and route modules outside `api/`」). 밑줄(`_`) 예외는 공식 문서에 없다.
    ★ 맞추는 코드를 복사하면 두 파일이 서로 다른 셈을 해 v253 의 「5회 틀리면 폐기」가 반쪽이 된다.
    v253: 코드 확인(`checkCode`)은 **한 트랜잭션** — 따로 읽고 쓰면 동시 요청이 「5회 틀리면 폐기」를
    무력화한다. 확인 쪽 빈도 제한도 별도(`rl.v.*` 번호 10분 10회 · `rl.vi.*` IP 10분 30회).
    요청자 IP 는 `clientIp()` 하나로 — `x-vercel-forwarded-for` → `x-forwarded-for` → `x-real-ip` 순
    (Vercel 공식 문서: `x-forwarded-for` 는 플랫폼이 덮어써 위조를 막고, `x-vercel-...` 는 프록시에도 안 덮인다)
- **가입: 사업자만, 한 길 (v261).** 가입 창은 업종·업체명 → **휴대폰 문자 인증 6자리**
  → **사업자등록번호·대표자·개업일자 + 「🔎 사업자 확인」**(국세청) → 비밀번호 → 약관 → 「가입 신청」.
  「사업자 확인」을 통과해야 「가입 신청」 단추가 열리고, 사업자 칸을 고치면 다시 잠긴다.
  **계정과 `users/{uid}` 는 서버(`api/signup.js`)만 만든다** — 규칙도 `users create: if false` 로 닫았다.
  화면이 보내온 사업자 확인 결과는 **서버가 다시** 물어 확인한다(화면 값 불신).
  가입 뒤에는 그 번호·비밀번호로 `loginAdmin()` 을 한 번 불러 **승인 대기 화면**으로 간다.
  `users` 에 더해진 칸: `bizNo`·`bizCeo`·`bizOpenDate`·`bizCheckedAt`·`bizNoDup`(+`phone`·`signupMethod`).
  **이 일곱은 본인이 못 바꾼다**(규칙 update 보호 목록 17개). 연락처 칸은 없앴다 — 인증한 번호가 연락처다.
  **이메일 가입은 없앴지만 이미 이메일로 가입한 계정은 그대로** — 이메일 로그인과
  재설정 메일(`pwrMailPath`)은 남겨 뒀다. v260 이전 가입자는 사업자 칸이 없어 마스터 패널에
  「사업자 확인 전」으로 나온다.
- **로그인: 입구가 둘이다 (v255).** 로그인 화면에서 「🚐 기사 로그인」·「👨‍💼 관리자 로그인」을 고른다.
  - 관리자: 휴대폰 번호(또는 이메일) + 비밀번호 — 계정 로그인 (기기 비밀번호 없음, v249)
  - 기사: **업체 번호 6자리 + 내 PIN 4자리** — 서버가 맞추고 custom token 을 준다(`api/driver-auth`).
    기사는 스스로 가입하지 않는다. 관리자가 차량관리에서 PIN 을 정해 준다.
    v250~v254 의 기사 계정(휴대폰+비밀번호)은 없앴다 — **v260 에 그 api 세 동작까지 지웠다**
    (`createDriver`·`resetDriverPassword`·`removeDriver`). 그 이름으로 요청이 오면 400 「알 수 없는 요청이에요」.
    기사 정리는 「PIN 지우기」(`removeDriverPin`)·「기기 풀기」(`unbindDevice`)로 한다.
    새 차량 기본값에도 `driverPin` 칸이 없다(v260) — PIN 은 서버 `driverPins` 에만 둔다.
    (둘러보기 `_demo` 샘플 차량의 `driverPin` 은 체험용이라 그대로 남아 있다.)
  - **로그인 ≠ 출근.** 근태로 세는 출퇴근은 운행 화면의 「🌅 출근」·「🌆 퇴근」 단추로만 기록한다.
  - 둘러보기(`_demo`)만 계정 없이 들어간다 — 기사 둘러보기는 종전 PIN 판(앱 자료) 그대로다.
- 배포: GitHub push → Vercel 자동 배포. 정적 페이지는 GitHub Pages(cosroad.com)
- 데이터: localStorage(기관별 키) + Firebase 동기화. `_demo` 기관은 읽기전용 샘플,
  **`_test` 는 마스터 + 마스터가 「🧪 테스트 출입」을 켠 승인 계정만**(규칙·앱 모두, v253) —
  규칙 `testOrgAdmin()` = `_test && (isAdmin() || testAccessOk())`,
  `testAccessOk()` = `users/{uid}.testAccess==true && approved && !withdrawn` (기사는 `approved` 가 없어 막힘).
  `testAccess` 는 **마스터만** 켜고 끈다(본인 변경은 users update 보호 목록으로 차단).
  마스터 권한을 안 주는 이유: 휴대폰 계정은 문자 인증만으로 비번을 바꿀 수 있다(v252).
  앱은 로그인 직후 `testOrgBlockedIfNotMaster()` 로 막는다(마스터·출입 허용 계정만 통과).
  마스터가 만든 `_test` 기사는 `ownerAlive` 에 「소유자가 마스터면 살아 있음」을 두어 통과한다.
  **v254: 출입 허용 계정도 `_test` 에서 기사 계정을 만들고·비번 바꾸고·끊는다**
  (규칙 `drivers` read 에 `testOrgAdmin` · `api/admin-account` 의 `isTestAccessFor(org)` —
  `_test` 기관에서만 열린다). `_test` 기사의 `ownerUid` 는 **항상 마스터**다
  (출입 허용 계정을 소유자로 두면 그 계정 체험이 끝날 때 기사가 같이 잠긴다).
- **v255 기사 읽기·쓰기 범위** (규칙 `firestore.rules`)
  - 읽기 `driverReadableKey` **10개**(v258): `members`·`cars`·`courses`·`org`
    ·`notices`·`rideState`·`carlog`·`deliveryDone`·`dropoffDone`·`driverAtt`
    → `payments`·`tax`·`payrollManual`·`staff`·`drivelogManual`·**`driverPay`** 는 막힌다.
    **v258: `attendance`·`attendanceTime` 도 뺐다** — 기사 화면에는 «회원» 출결을 읽는 자리가
    없는데 덩어리 동기화·리스너가 키 목록을 훑어 **출결 기록 전체가 기사 폰에 내려오고 있었다.**
    목록에서 빼면 `loadFromFirebase` 의 기사 가드가 **부르기 전에** 막아 요청이 안 나간다.
    앱도 `loadFromFirebase`·리스너에서 같은 목록(`DRIVER_READ_KEYS`)으로 한 번 더 막는다 — **두 곳을 같이 고쳐야 한다.**
  - 쓰기 `driverWritableKey` **4개**(v257): `carlog`·`deliveryDone`·`dropoffDone`·`rideState`
    → `driverAtt` 를 뺐고(v255 — 기사 출퇴근은 서버가 트랜잭션으로 쓴다),
    **`attendance`·`attendanceTime` 도 뺐다**(v257 — 기사 화면에 출결을 저장하는 길이 0개임을
    호출 그래프 + 실제 실행으로 전수 확인했다. 카드 토글은 `rideState` 에만 쓴다).
    앱도 같은 목록(`DRIVER_WRITE_KEYS`, `saveToFirebase` 가드)으로 한 번 더 막는다 —
    **두 곳을 같이 고쳐야 한다**(읽기 `DRIVER_READ_KEYS` 와 같은 규칙).
    백업 create 규칙도 이 목록을 따라가므로 자동으로 좁아진다.
    관리자·소유자 쓰기는 그대로다(직원 근태·수기 토글이 같은 키를 쓴다).
  - 백업: 기사는 `backups` read·delete 안 되고 **create 만** 된다(쓰기 전 백업을 남겨야 하므로).
  - 급여 4값(시급·식대·공제방식·출퇴근거리)은 `cars` → **`driverPay`** 로 옮겼다
    (`{ carId: {hourlyWage, mealAllow, taxMode, commuteKm} }`). `carPay(car)` 가 옛 값도 함께 봐서
    「옮기기」 전에도 급여가 맞게 나온다. 급여 계산 코드는 `buildPayrollData` 에서 차량에 붙여 주므로 한 줄도 안 바뀌었다.
- 요금제: 마스터 승인 시점부터 30일 무료 체험(승인 순간 trialStart·plan=trial),
  만료 시 차단 + 구독 안내 (plan: trial/paid). 농협 구독료 월 45,000 / 년 540,000.
- 모델 B (v232 `350f960`)
  - 로그인: 이메일 인증 제거, 휴대폰번호 + 비밀번호 로그인.
  - 가입은 승인 대기(pending). 마스터가 승인해야 이용 시작(= 체험 30일 시작).
  - 마스터: 실계정 `admins/{uid}` (MASTER_PW 제거). 기관 격리 `isMyOrg`.
  - Firestore `users` delete = `isAdmin() && get('approved',false)!=true` (미승인만 삭제).
  - 미승인 대기 항목은 마스터 패널에서 수동 삭제(🗑), 가입 7일 경과 시 만료 표시.

## 절대 규칙
1. **API 키는 Vercel 환경변수에만.** 코드·커밋·로그·주석 어디에도 키를 넣지 않는다.
   - 예외(사장님 결정 2026-10-14): 카카오 **JavaScript 키**만 `index.html` 포함 허용 — 공개용이고 도메인 제한(JavaScript SDK 도메인)이 걸린 키다. REST 키 등 나머지는 종전대로 환경변수만.
2. **지시문에 명시된 것 외 다른 코드는 건드리지 않는다.**
3. 삭제 동작은 반드시 확인 모달을 거친다.
4. `index.html` 변경 시 `version.json`(과 APP_VERSION)을 1 올린다. `api/`만 변경 시 버전 유지.
5. **삭제됨 (v249, 기기 비밀번호 진입 폐지)** — 예전 규칙: "초기 비밀번호(1234) 안내는
   `_demo`/`_test` 기관에서만 노출한다". 이제 기기 비밀번호(`ADMIN_PW`·`tkd_adminpw`)가 없고
   **계정 로그인(휴대폰·이메일 + 비밀번호)만** 쓴다. 둘러보기(`_demo`)는 로그인 화면의
   「👀 둘러보기 시작」 단추로 계정 없이 들어간다. 기사 진입(`loginDriver`)은 아직 그대로다(코스로드24 예정).
6. **연관 작업은 먼저 보고한다 (사장님 지시 2026-10-25)** — 작업 중 지시문에 없는 연관 항목
   (같은 원인·같은 데이터·같은 화면으로 이어진 곳)을 발견하면 고치지 말고 결과 회신에 목록으로 보고한다.
   한 번에 같이 할지는 사장님이 정한다. (사례: v241 급여상세 닫기 → 학원·공공 화면·UTC 날짜 12곳 → v242)

## 검증 3원칙 (커밋 전 필수)
A. **외부 API 코드**: 공식 문서와 항목 단위 대조표를 만든 후 작성한다. 추측 금지.
B. **저장 코드**: 스텁 테스트로 실제 저장값을 확인한다.
C. **오류 수정**: 오류 원문(로그·스크린샷) 확보가 먼저다. 추측 수정 커밋 금지.

## 커밋 규칙
- 메시지: `무엇을 했는지 (v버전)` 한 줄 + 본문에 검증한 항목·대조표를 적는다.
- **브랜치: `main`에 직접 커밋한다.** 작업 브랜치를 따로 만들지 않는다.
- **커밋하면 push까지가 기본이다.** 검증자(클라우드 Claude)가 GitHub에서 커밋을
  확인하는 체계라, 로컬에만 남기면 검증이 막힌다. 묻지 말고 바로 올린다.
  - **예외 — push 전에 사용자에게 한 번 확인**: `api/` 서버 코드, 결제·요금제,
    보안(인증·허용 출처·키 취급) 관련 변경.

### 커밋 전 체크리스트
1. `index.html` 변경 → `version.json`과 `APP_VERSION`을 같은 숫자로 +1.
   (`api/`·문서만 변경이면 버전 유지)
2. **패턴 전수 검색**: 같은 데이터를 다른 변수 이름으로 쓰는 곳까지
   필드 이름 기준(예: `.location`)으로 찾는다. (상세주소 때 m/s 변수 차이로 2번 놓친 사례)
3. **사용자 기능을 추가·변경하면 도우미 챗 문답표도 함께 갱신한다.**
   → `index.html`의 `HELP_QA` 배열(각 항목 `t` 제목 / `keys` 검색어 / `a` 답변).
   기능만 바뀌고 안내가 그대로면 도우미가 틀린 답을 하게 된다.
   **회차 끝 보고문에 `HELP_QA` 바뀐 항목 수와 제목 목록을 적는다** (v256 보정4, 사장님 11-01).
   문답표는 도우미 「코스」의 **유일한** 지식이다 — 매칭(`helperAnswer`)도, AI 에 넘기는
   지식 문서(`helperKnowledge()`)도 이 배열 하나로 만든다. 답변 문구만 고치지 말고
   `keys`(검색어)도 같이 본다: 질문 글에 검색어가 **글자 그대로** 들어가야 찾아지고,
   한 역할 쪽에 못 찾으면 반대 역할 문답으로 넘어가 **엉뚱한 답**이 나간다.
   (사례: v256 보정4 — 관리자가 「비밀번호를 잊었어요」를 물으면 기사 로그인 안내가 나왔다)
4. 메시지 본문에 검증한 항목을 적는다 (검증 3원칙 A·B·C 해당분).
5. push. (위 예외에 해당하면 먼저 확인)

## 화면 규칙
- **기사 화면 원칙 — 간결하게: 출근·퇴근·차계부·자기 차량 운행만** (v256 보정2, 사장님 11-01).
  「사용하는 앱 창은 항상 간결하고 직관적으로 — 버튼이 많으면 사용자가 불편」.
  기사 화면에 단추를 더하기 전에 먼저 되물을 것. 회원 출석 PIN 판은 **관리자 화면에만** 있다.
  차량 탭도 기사에게는 **자기 차량 한 칸**만 보인다(`driverLockedCarId()` — 토큰의 carId, 화면에서 못 바꿈).
- **기사 화면은 「자기 차량 한 대」가 전부다 — 운행·회원 두 탭이 **같은 기준**을 쓴다** (v257·v258).
  **차량이 없으면 두 화면 모두 `driverNoCarHtml()` 안내만** 내고 돌아간다(v258) —
  차량 탭·출근·퇴근·차계부가 아예 안 나온다. 문구는 그 함수 한 곳에서만 쓴다.
  기준 함수는 `driverLockedCarId()` 하나(토큰의 carId · 둘러보기는 `demoDriverCarId()`),
  회원 목록은 `driverScopeMembers()` 로 거른다. 회원 목록을 그리는 함수는 **둘**이다 —
  `renderMembers()`(처음)와 `filterDriverMembers()`(검색·정렬). **한쪽만 고치면 새어 나간다.**
  ★ 이것은 **화면에서 거르는 것**이다. `members` 는 기관 키 하나라 규칙으로는 차량별로
  못 나눈다 — 기사 폰에는 전체 명단이 내려간다. 자료를 차량별로 쪼개야 막힌다.
- **둘러보기(`_demo`) 기사 화면도 실서비스와 같은 모양** (v257) — 출근·퇴근 단추 + 차계부,
  차량 한 대, 출석 PIN 판 없음. 다만 `demoPunch()` 는 **서버·저장을 안 부른다**(새로고침하면 처음).
- **한국어 줄바꿈은 5개 파일 `body` 에 모두 같은 두 줄** (v256 보정3) —
  `index.html`·`s.html`·`home.html`·`terms.html`·`privacy.html` 전부 `word-break:keep-all; overflow-wrap:anywhere;`.
  **인쇄·PDF 표 칸도 같은 두 줄**(거래명세서·거래내역·급여명세서). 낱글자로 쪼개지 않는다.
  **`break-all` 로 남기는 자리는 URL 상자 `.share-link-box`(235) 한 곳뿐** (v259에 바로잡음).
  보정3 때 「공유 링크 미리보기(3916)」로 적어 둔 둘째 자리는 소스로 보면
  **마스터 패널 「개통 대장」의 `?org=` 주소 줄**이었고, v259가 그 묶음을 화면에서 빼면서 함께 없어졌다.
- **한국어 줄바꿈 `keep-all` 은 `body` 에 전체 적용 — 새 화면도 따로 끄지 말 것** (v256).
  `index.html` `body{word-break:keep-all; overflow-wrap:anywhere;}` 한 자리에서 걸고,
  JS 로 만드는 화면(문자열 HTML)은 상속으로 함께 받는다. 둘을 **같이** 써야 한다 —
  `keep-all` 만 쓰면 띄어쓰기 없는 긴 URL·번호가 가로 스크롤을 만든다.
  일부러 끊는 자리(공유 링크 상자·PDF 표의 `break-all`)는 그 자리에만 남긴다.
- **CSS 변수는 `:root`(index.html 36~45행)에 있는 것만 쓴다.** 없는 이름을 `var()` 로 쓰면
  배경·색이 **조용히 빠져** 글자가 안 보인다 (v255 기사 탭이 `var(--driver)` 로 그랬다 → v256 에서 `--primary` 로).

## 이 프로젝트에서 겪은 함정 (반복 금지)
- 날짜 문자열은 한국(기기) 날짜 — `toISOString().slice(0,10)` 금지(UTC라 0~9시에 어제).
  오늘은 `todayStr()`, Date 객체는 `localDateStr(d)`.
- 탭 안에서 연 화면을 닫을 때는 `currentAdminTab` 으로 복귀 —
  근태 블록은 학원·공공=cars 탭, 물류·택배=attendance 탭.
- 티맵 `viaPointId`는 **1부터** (0이면 9401 "필수 파라메터 없음")
- 티맵 내비 앱은 경유지 5곳까지 → 앱은 "5곳씩 이어가기" 방식 (isStopCompleted)
- 회원/거래처 수정 모달은 **4업종 공용** — 한 곳 수정이 4업종에 영향
- 운행 화면은 회원을 `s`(legView 결과)로 다룸 — `m.` 으로만 검색하면 놓침
- 좌표 없는 회원 저장 시 기관좌표로 조용히 대체하는 코드 금지 (v156에서 제거)
- 주소 표시는 `fullLoc(m)` 사용 (기본주소+상세주소), 좌표·티맵·지오코딩에는 상세주소 미사용
- 품목 바코드 매칭은 품목의 `code` 필드 기준 (별도 바코드 필드 없음)
- Firebase Storage에 **새 업로드 경로**를 쓰는 기능을 만들면 반드시 콘솔의 Storage
  규칙에 그 경로를 추가해야 한다 — 코드만으로는 403(`storage/unauthorized`)이 난다.
  지시문에 이 단계가 없으면 **작업 전에 되물을 것.**
- **알리고 문자는 발송 서버 IP 등록제** — Vercel 발신 IP는 가변이라 등록 안 된
  대역이 나오면 차단됨(-101 인증오류-IP). 문자가 조용히 안 나가는 형태로 나타난다.
  차단 의심 시: `send-sms.js` 알리고 호출 직전에 발신 IP 로그를 임시로 넣어
  실측(추측 금지) → 알리고에 그 대역(`[0-255]` 형식) 추가 등록 → 로그 제거.
  상세 절차는 로드잡 CLAUDE.md 함정 ④ 참조.
  현재 등록 4건: `43.201.208.226` / `15.164.80.56` / `13.209.67.[0-255]` / `15.164.208.[0-255]`
