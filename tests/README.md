# tests/ — 코스로드 검사 묶음

여기 있는 것은 **회차마다 「무엇을 확인했는가」를 기계가 다시 재 주는 묶음**이다.
전에는 작업 폴더(scratchpad)에만 있어 **세션이 바뀌면 사라졌고**, 공용 헬퍼 하나가 없어지면
그것을 부르는 묶음이 `Cannot find module` 로 **아예 안 돌았다**(코스로드41에서 6개가 그랬다).
**돌지 않는 묶음은 통과도 실패도 아니다.** 그래서 저장소로 옮겼다(코스로드53).

## 돌아야 할 묶음 수 — 이 숫자가 줄면 사라진 것이다

| 묶이 | 돌림판 | 묶음 수 |
|---|---|---|
| 스텁(Node · 가짜 Firestore·가짜 알리고) | `tests/runall275.sh` | **83** |
| 규칙(Firestore 에뮬레이터) | `tests/rulestest/runall41.sh` | **24** |
| 화면(크롬 · Playwright) | `tests/pw262/runall41.sh` | **35** |

세 돌림판 모두 **맨 끝에 「돈 묶음 N 개 · 통과 · 문제」를 찍는다.** 먼저 그 수를 보고,
기대보다 적으면 **묶음이 사라진 것**이다(통과율부터 보지 말 것).

★ `race54b.js` 는 **조사 묶음**이다 — 고치지 않고 「지금 이렇게 된다」를 적어 둔 것이라
실패가 아니어도 **결함을 기록하고 있다**(코스로드54 보고문 3번 표와 짝이다).
그 칸이 바뀌면 누군가 그 자리를 고친 것이니 **기대값과 보고문을 같이** 고친다.

## 돌리는 법

```sh
# ① 스텁 — 아무것도 안 깔아도 된다 (node 만)
cd tests && bash runall275.sh

# ② 규칙 — 에뮬레이터가 떠 있어야 한다
cd tests/rulestest && npm i                       # 처음 한 번
npx firebase emulators:start --only firestore &   # 8988 포트 (firebase.json)
bash runall41.sh                                  # 규칙 사본을 매번 새로 받아 LF 로 맞춘다

# ③ 화면 — 크롬이 필요하다
cd tests/pw262 && npm i && npx playwright install chromium   # 처음 한 번
bash runall41.sh
```

**①→②→③ 순서로 돌린다.** `pw262/run276`·`run281`·`run282` 는 에뮬레이터가 만든
허용/거부 표(`rulestest/t276_table.json`·`t50_table.json`)를 읽는다. 표는 저장소에 넣어 두었지만
규칙을 고쳤으면 **②를 먼저 돌려 표를 새로 만든다**.

## 필요한 것

- **node**(18 이상) · 규칙 묶음은 `rulestest/package.json` · 화면 묶음은 `pw262/package.json`
- **얕은 클론(`--depth`)에서는 안 된다** — 묶음은 옛 판 소스를 `git show <커밋>:index.html` 로
  그때그때 떠서 「그 회차에 무엇이 바뀌었나」를 잰다. 전체 역사가 있어야 한다.
- 저장소 루트는 각 파일 맨 위 `COS_ROOT` 한 줄로 찾는다 — **절대경로를 적지 않는다.**
- `l_app256c.js` 의 다섯 칸은 그 컴퓨터의 `.claude/settings.local.json` 을 본다.
  그 파일은 `.gitignore` 에 있어 **새로 받은 저장소에는 없다 → 건너뛴다**(실패가 아니다).

## 올리지 않는 것 (`.gitignore`)

묶음이 **돌면서 만드는 것**은 올리지 않는다 — 옛 판 소스 사본(`pin*`·`old_index*`·`_syn*`),
화면 그림(`*.png`·`shots*`), 결과 json(`res*.json`), 에뮬레이터 기록(`*.log`),
`rulestest/firestore.rules`(돌림판이 저장소 것을 **LF 로 맞춰 새로 받는다**), `node_modules`.

## 묶음을 더할 때 지킬 것 (CLAUDE.md 「검사 묶음 규칙」과 같다)

1. **회차 기록 묶음은 양쪽을 커밋에 고정한다**(`COS_SRC_OLD_REF`·`COS_SRC_NEW_REF` 기본값을
   파일 안에 박는다). 범위 검사는 `git diff <앞커밋> <뒤커밋>` **두 커밋 사이**로.
2. **「0건」은 대조 시험 뒤에만** — 같은 검사로 1건을 잡을 수 있음을 먼저 보인다.
3. 규칙을 고치는 회차는 **에뮬레이터 표 + 크롬 「기사 로그인 → 첫 화면」을 짝으로** 돌린다.
4. **새 묶음은 돌림판에 적고**, 묶음 수 기대값(위 표·돌림판 끝줄)도 같이 올린다.
5. **묶음이 아닌 것은 돌림판에 적지 않는다** — 공용 헬퍼(`env246.js`·`detect.js`·`qa252.js`
   ·`drvenv.js`·`sendenv.js`·`otpenv.js`·`env261.js`), 측정 도구(`pw262/run262.js`),
   씨앗 자료. 통과 문구를 내지 않는 것은 묶음이 아니다.

## 폴더

- `tests/*.js` — 스텁 묶음 + 공용 헬퍼
- `tests/rulestest/*.mjs` — 실제 `firestore.rules` 를 에뮬레이터로 재는 묶음
- `tests/pw262/run*.js` — 실제 크롬으로 화면을 보는 묶음
