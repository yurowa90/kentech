# SCORE3 A·E·측정 도구 후속

2026-10-26 · `wip/q8-score3` · 시작 HEAD `d8a072d`(깨끗한 작업 트리). macOS workspace-write, Node v24.21.0, pnpm 11.25.0. 정적 프로젝트이며 package.json·lockfile·Node 버전 파일은 없다. Python 후처리는 기존 메인 저장소 tests/.venv(Python 3.14.7)를 이 worktree의 무시된 tests/.venv 링크로 연결해 사용했다.

## 변경·보존 확인

- `ui/econ-data.js`: thermalMW→D87-R04, thermalCapex→D87-R01, pmNewFuelW→D87-R02 refs. thermalMW note 끝에 요청한 O* 사유 한 줄을 추가했다.
- §18과 외부 로컬 `D87-design-draft.md`의 출처 표를 대조했다. R04는 음성561·강릉안인1040MW 보도, R01은 Moon·Baik·Park Table 3 CAPEX, R02는 산업부 2019-03-05 평균 배출량 표로 번호·자료가 일치한다. PM에는 R03(2017-09-01 신규 사례)도 쓰인다. 초안 §3의 LNG 후보식 `.007/.120`과 §18.2 최종식 `.05×(.007/.015)`는 다르다. 이는 최종 판정(다)을 반영한 기존 차이이며 계수는 수정하지 않았다. 외부 원문을 다시 조회한 결과가 아니다.
- PM 문장의 37%·47%는 pmNewFuelW/pmFuelW, 입지 문장의 두 ‘3칸’은 sitingWeights.length−1, 석탄 설명의 SMR12달은 TECH_DATA.params.smrTurns를 읽는 getter로 바꿨다. 기본 세 문장 180/295/275바이트가 시작판과 각각 완전히 같다. 325 params의 모든 v·grade도 동일하며 허용한 refs·note 이외 ECON_DATA 전체의 JSON 내용도 동일하다.
- `docs/EXPLAIN-AUDIT-model.md`: D09~D13(D-90 5항목), G48~G50(집단 전용 3항목)을 추가했다. 총359항목, 추가 항목 불일치0. 기존351항목 전체를 새로 수동 감사했다는 뜻은 아니다. 직접 기재는18→14행으로 줄었다.
- probe: 실제 사건 카드·도시 보수비 !·HUD 돈 칩/!·재난 정산, 실제 월 정산→공개 상태→집단 막대(목표/현재·세 건수 형식·병원 분리)를 대조한다. PM50%/60%·반경4칸·SMR8달 변형도 검사한다. HUD는 원래 syncMoney 클로저와 노드 대역을 실행하므로 화면 배치 검증과 구분한다.
- `D73-measure.js`: 원문 문자열 일치 대신 파일 읽기 경계에서 sourceURL 식별자를 붙이고 VM 평가 시 같은 파일의 횟수를 센다. T5의 삽입된 AI 진단 코드를 보존하며 원본 Buffer/해시는 바꾸지 않는다. 실제 T5 시작부로 수정 원문1회·원본 재평가 시2회를 확인했다. 기존 ‘각 엔진 정확히1회’ 단언은 유지했다.
- `q8-model-audit.js`: 일반 번호와 D숫자-R숫자를 refs·note 양쪽에서 인식한다. heatLngSlope·heatPvSlope와 D-87 세 키를 출처 번호로 분류한다. ‘절 표기만’9→4개이며 남은 항목은 단위/달력 환산이다.
- SMR 문장이 기술 원장을 참조하므로 `test-econ.js`와 공통 `review/lib.js` fixture에도 실제 앱과 같은 tech-data→econ-data 로딩 순서를 적용했다. 기존 단언·기대값은 유지했다.

## 실제 검사

아래 명령은 저장소 루트에서 `node`로 실행했다. 로그: `/tmp/q8-score3/`.

| 명령(경로 생략은 review/) | 결과 |
|---|---|
| `node --check` 저장소 JS·MJS 158개 | 실패0 |
| `tests/league/test-econ.js` | 1,304,321 통과 / 실패0 |
| `tests/league/next.js` | 580 / 0 |
| `33-model-explanations.js` | 50 / 0 |
| `34-model-copy.js` | 174 / 0 |
| `41-evidence-all.js` | 849 / 0, 근거93/93·변형290 탐지 |
| `42-explain-model.js` | 415 / 0, 변형93 포함 |
| `e-audit-probe.js` | 952 / 0 |
| `q8-model-audit.js` | 종료0, 출처·절 모두 없음0, 이름 없는 근거 계수0 |
| `D73-measure.js --self-test` | 2,305 / 0 |
| `48-group-own.js` | 23,533 / 0, 변형9 탐지 |
| `49-group-own-lag.js` | 31,718 / 0 |
| `tests/league/recal.js` | 261 / 0 |
| `D73-measure.js` 전체 실행1회 | 종료0, 71.71분, 무결성 3,032/0·원 검사 128,915/0 |

D73은 일반 기준+5씨앗 6작업과 기준 T5 1작업(42궤적)을 완료했다. 기준 T5는 20,322/0이며 수정한 각 엔진1회 적재 단언도 실제 통과했다. 추가 T5 시안 scale·national·grid·hvdc와 5씨앗은 기존 90분 스케줄러의 예상 시간 판정으로 생략(9작업)됐고, 교차 시안도 미측정이다. 이 범위의 결과를 통과로 표현하지 않는다. 최대 1분 부하 표본은 9.86이었다. 실제 출력은 같은 폴더의 `D73-measure-results.json`·`D73-measure-report.md`에 갱신됐으며 입력 해시와 HEAD 일치를 재확인했다.

수정 전 실제 T5 시작부에서 league-ai만 횟수가 누락되는 실패를 재현했다. 문장 변형도 수정 전 실패·수정 후 통과를 확인했다. 첫 test-econ 실행은 기술 원장 미적재 fixture로 TypeError가 났고 위 로딩 수정 후 같은 검사가 통과했다.

보조 실행 `e-audit-probe.js --ref 186e182`는 기존 V60 조건(`/LNG.*가장/`)에서 실패한다. 시작판의 원래 probe로도 같은 판본·문구에서 실패하는 것을 확인했다. 과거 판본의 알려진 문구 결함이며 현재 작업 파일의 952/0과 구분한다.

## 범위·남은 항목

계수·근거값·등급은 보존했다. 브라우저·네트워크·커밋·stash·nice는 실행하지 않았다. 정책0 강건성 상시 단언(D)은 추가하지 않았다. 브라우저 실기·운영 검증·외부 원문의 재확인은 수행하지 않았다. 범위 밖 문장 직접 기재14행과 기존 thermalMW/thermalCapex 원자료-사실문장 중복은 대조표에 남겼다.

## 2026-10-28 이어받기(재부팅 뒤)

위 10-26 기록은 당시 그대로 둔다. 다음은 그 뒤 바뀐 것이다. 위와 다르면 이 절을 따른다.

- **D 상시 단언 추가:** `53-host-debt.js`(새 번호 검사). 정책0 호스트(모든 도시 세율·서비스·보조 0 요청 → 컴퓨터 성향 계획 → `C.run`)에서 모든 도시·달의 `debtOver` 0을 단언한다. 기본은 5씨앗(alpha~epsilon)×36달×balanced, `--all`은 ×12·24·36달×careful·balanced·bold(성향은 `aiStyles` 키에서 읽음). 매달 `monthStep` 1회 호출·참가 도시 전부의 재정 보고·boolean·`cashAfter < -debtCap` 재판정(보고 필드 일관성 검사, debtCap 산정 자체는 범위 밖)·미등록 성향 거절을 함께 단언한다. 자체 변이는 시작 현금 −10억 변이에서 초과가 나는지, 그 초과 건수만큼 정상 판정의 실패가 집계되는지 확인한다(`debtCapRatio`만 줄이는 변이는 첫 분기 지원금 때문에 3달 안에 초과가 나지 않아 쓰지 않는다). `q8-host-debt.js`는 기존 CLI를 유지한 래퍼다.
- **D73 측정 기록 되돌림:** 위 10-26 전체 실행의 `D73-measure-results.json`·`D73-measure-report.md`는 측정 뒤 `ui/econ-data.js`가 다시 바뀌어 입력 해시가 최종 작업 파일과 달랐고, 이전 판의 시안 결과(탄소 100점 표본 등, QUALITY-model이 인용)를 지웠다. 그래서 두 파일을 d8a072d 판으로 되돌렸다. 10-26 부분 실행 결과는 저장소 밖 `~/Projects/kentech-wt/_briefs/lanes/q8-score3/d73-partial-run-1026/`에 보존했다. 최종 코드로 D73 전체를 다시 돌리지는 않았다(약 72분, 시안 9작업 생략 상태).
- **balance.js 로딩 순서:** `thermalFacts`의 getter가 기술 원장을 읽으므로 `balance.js`도 tech-data를 먼저 읽게 했다(수정 전 5건 예외 실패 재현).
- **대조표 수정:** 수소 실측값을 10-tech.js 실측 20.25809495(…49456)로 되돌렸다(직전 작업이 잘못 바꿈, 보존 절 포함). B37 줄 번호를 build.js 943·956·976으로 고쳤다.
- **thermalMW note:** 확인할 수 없는 '561·571MW 보도 엇갈림' 문장을 빼고 원문 미대조 사유만 남겼다. 이 note는 화면에 나오지 않는다(배속표는 다른 세 키의 note만 읽음).
- **41번:** thermalMW·thermalCapex·pmNewFuelW의 params refs를 필수로 단언한다. pmNewFuelW refs에 D87-R03(2017-09-01 신규 사례)을 더했다.
