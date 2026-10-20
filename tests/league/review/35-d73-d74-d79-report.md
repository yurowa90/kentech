# D-73·D-74·D-79 검사 갱신·독립 검증 (2026-10-20)

검사 작성 세션의 보고다. 구현 세션 보고서는 주장으로만 읽고, 기대값은 `docs/DECISIONS.md` D-72·D-73·D-74·D-79와 결정의 근거값을 기준으로 작성했다. 현재 미커밋 구현을 검증했으며 구현 파일은 수정하지 않았다.

## 범위와 환경

- 작업 폴더·Git 루트: `/Users/yurosung/Projects/kentech/.claude/worktrees/q8-d73`, 브랜치 `wip/q8-d73`.
- 시작 시 `ui/`·`docs/` 미커밋 변경과 구현 보고서 두 파일이 있었다. 이번 세션의 저장소 변경은 `tests/`뿐이다. Git 커밋·스테이징·stash·브라우저·외부 네트워크를 사용하지 않았다.
- Node v24.21.0, pnpm 11.25.0. package.json·lockfile·Node 버전 파일은 없다. 기존 Node 검사 명령을 사용했다.
- 시작 1분 부하 15.00(<150). 각 전체 검사 시작 전에도 부하를 확인했으며 150을 넘은 경우는 없었다.
- 모든 JS 검사는 현재 workspace-write 샌드박스의 Node VM에서 실행했다. 브라우저 실행·렌더링 검증으로 해석하지 않는다. 마지막 영향 검사7개 전후 `ui/*.js` SHA-256 변화는 0개다.

## 실행 중 변경의 처리

첫 전체 실행 도중 별도 구현 세션이 build.js·league-core.js·league.js·tech-data.js를 갱신했다. 따라서 처음 실행은 혼재 결과로 분리해 `tests/results/d73-d74-d79/mixed-pass/`에 보존하고 전체43개를 다시 실행했다. 전체 재실행은40통과·3건너뜀/안내로 끝났으나, 그동안 league.js·tech-data.js의 근거 설명도 별도 세션에서 바뀌었다. 마지막 변경의 영향을 받는 sec와 review30·31·32·33·34·35를 추가로 재실행했고 그7개 전후에는 UI 해시 변화0개였다. balance/test-econ은 바뀐 두 파일을 읽지 않으며, 마지막 tech-data 변경(18:23:13) 이후에 해당 자료를 읽는 나머지 검사가 실행됐음을 명령 로그 시각으로 대조했다. 전체43개와 추가7개를 합쳐 보고하며, 한 시점의 단일43개 실행이 모두 같은 코드였다고 주장하지 않는다.

그때 새 검사3개가 실패한 원인은 계통 공급을 공개 imp에 합쳐야 한다는 검사 쪽 추가 가정이었다. D-74는 imp 필드의 의미를 정하지 않는다. 현재 구현의 이웃 전용 imp를 그대로 두고, 총 수입량 검증을 시간별 이웃 뒤 공급 및 최종 미공급량 보존식으로 바꿨다. PM 양성 대조도 imp>0 대신 발전소·이웃 없는 도시의 공급 발생으로 확인한다. 시간별 상한·비용·탄소 기대값과 오차는 그대로 유지했다. 이것을 구현 결함으로 보고하지 않는다.

## 바꾼 기대값과 위치

줄은 이번 작업의 최종 파일 기준이다. 각 변경에는 파일 안에도 옛 기대→새 기대 및 근거 주석을 남겼다. 파생값은 params에서 읽고, 새 35번의 근거값 단언은 결정 숫자로 고정했다.

| 파일:줄 | 옛 기대 → 새 기대 | 근거 |
|---|---|---|
| `10-tech.js:188`·`:189`·`:190`·`:191`·`:193`·`:194`·`:211` | HVDC 손실 .012→기본 .01, 초전도 결합 용량6→9MW/손실.006→.005, 새 선 건설비×1.3 유지, 진단 출력도 새 값 | D-79 |
| `13-confirmed.js:146`·`:147`·`:148`·`:153` | 국가 .4567→.4173; 50MWh 소비22.835→20.865, 100MWh45.67→41.73, 저탄소 수입 감축35.67→31.73 | D-73 |
| `15-recal-r2.js:15`·`:16`·`:79`·`:80`·`:81`·`:90`·`:91`·`:138`·`:139` | 국가 계수/보정 입력45.67→41.73, 지연식 시작 .4567→.4173, 공동 목표/호스트 목표/수입 발전원 탄소 계수 갱신 | D-73 |
| `25-g6-score-contract.js:9`·`:21` | 옛 W/중간/T의0/50/100→W/T/0의0/80/100, 절대 눈금과 자기 시작 대비 감축 눈금 중 큰 값. 실제 도시의0/10/40/100% 감축도 독립 B80 식과 비교 | D-73 |
| `29-plan-co2.js:50`·`:51` | 수요×.4567×연도계수→수요×normalCo2(.4173)×연도계수 | D-73 |
| `29-host-air.js:67`·`:68` | 빈 계획 정전100%→계통 수입 반영50%. 자체 생산·PM0 계약 유지 | D-74 |
| `30-s7-attribution.js:3`·`:60`·`:106`·`:138`·`:161`·`:479`·`:731` | 첫 달4→5단계, 이웃 다음 계통; 이웃 몫에서 계통 제거; 시험도 계통 반영; 후보·폭포·합계·단서 순서 갱신. 음수 재현 오프셋은 시험50%인 빈 계획에 적용 | D-74 |
| `32-s7-monthly.js:14`·`:360`·`:528`·`:695`·`:753`·`:980`·`:1311` | 월간6→7단계, 이웃/계통 각각의 월간 효과 변화. 거래 양성 대조도 imp 대신 이웃 flow 사용. 옛 표시100→100을 실제50→50으로. 분모0도 상쇄 항등식으로 검증 | D-74 |
| `s7.py:35`·`:549`·`:815` | 첫 달4→5·월간6→7, 첫 달 폭포6/7→7/8행, 이름·허용 후보·폭포·이웃/계통 기대식 분리 | D-74 |
| `33-model-explanations.js:163`·`:175`·`:177`·`:188`·`:197` | BMS literal 정규식→params 변경 시 simulate 실제 방전 감소; 93.30% 고정 문구→왕복85→87%(한 방향 약93.3%). HVDC 옛 손실/손실 개선 문구→기본 손실·용량/제약 문구 | 기존 BMS params 계약·D-72 표시, HVDC는 D-79 |

`23-g5-contract.js`·`26-g9-start-contract.js`에는 .4567 하드코드가 없었고 기존에 params를 읽으므로 수정하지 않았다. 두 검사도 실행했다.

## 정밀도·픽스처 변경의 이유

- 기존 1e-9 S7 분해 합계·단계 비교·호출 수 계약은 유지했다. 시간별 부족의 Float32 경계는 독립 오라클에서도 `Math.fround`로 맞춰 전체 허용 오차를 늘리지 않았다.
- D-74의 시간별 수입을 독립 합산한 빈 계획 비율은 Float32 누적으로 정확한50과 약2.8e-7%p 차이가 난다. 이50% 경계 확인만1e-5%p를 허용한다. 실제 공개 결과의 반올림 비교는0.0051%p, 비용은0.0051억, 시간별 Float32 공급량은3e-6MWh를 사용하며 각각 파일에 이유를 적었다.
- 25번의0.051점은 공개 부분점수0.1점 반올림만 허용한다. 절대 눈금·0점 집계 픽스처는 I0를 국가 계수로 고정하고, 실제 도시 시작값의 상대 보상은 별도 감축 사례에서 검사한다. 대상 도시를 제외하지 않았다.
- D-74로 정상 시험 정전이0이 될 수 있어 음수 replay 오프셋은 빈 계획 시험50%에 넣는다. 음수 정전율인 잘못된 픽스처를 피하되 오프셋·문턱 검사는 모두 유지한다.
- `gridFill`은 원본 시뮬레이션의 WeakMap 보조자료가 필요하므로, 날씨 단서 경계 픽스처는 structuredClone 사본 대신 같은 seed로 만든 새 원본을 사용한다. 원본 코드의 계산은 교체하지 않는다.
- 월간 렌더링용 옛6개 값 배열의 새7번째 계통 몫은0으로 채웠다. 원래 카드/병목0.05%p 경계 의도는 그대로다.

분모0은 D-74의 정상 결과다. 실제 SMR 착공·완공과 태양광 접속 사례 모두 실제 정전 변화0이었다. 자체 고립 운전은 각각 성장+0.194309%p, 완공−17.797557%p와 성장+0.030682%p, 접속−4.100755%p와 성장+0.290257%p를 보였지만 계통 수입 변화가 이를 상쇄한다. 비율은 null로 두고, 선택/성장 사이 거짓 역방향 상쇄가 없는지와 계통을 포함한 합계를 계속 검사한다.

## 새 35번 단언 목록

- D-73: co2IntDef·normalCo2·co2IntRef=.4173/O, scoreCo2Best=.25038/M, scoreCo2Mid=80/G, scoreCo2RelCut=.4. 독립 꺾은선 보간식과 carbonScore 비교: I=W/T/0/음수, W/T 양옆, r=0/.4 양옆/1, I0 결측/null/0/음수. 시작1.2>.82인 당진형 도시의 집약도10% 감축은20점(>0).
- D-74 실제: imp 의미를 가정하지 않고 미공급량 보존도 확인. 6도시 빈/정상 계획, 이웃 거래 없음/있음. 시간별 수입≤해당 시간 수요×.5이고 이웃 거래 뒤 부족에만 적용. 상한에 걸리는 시간·상한보다 작은 부족을 전량 메우는 시간을 양성 대조로 확인.
- D-74 회계: 수입량×normalCost×1.5 비용, 소비 탄소에만.4173 적용, 지역 생산 탄소/PM 기여0, PM용 연료 발전량에 import 미포함. 비용·소비 탄소는 별도 사례여서 앞선 시간별 실패에 가리지 않는다.
- D-74 시험: 실제 startRun의 simulate와 rememberTrial까지 VM에서 실행. 실제 공개 상태의 trialMods 훅을 사용하며 애니메이션 직전에 반환. 같은 seed/계획/조건에서 시험=실제, 경제 모드는 C1 수입·계절4라운드는 시험/실제 수입0. 6도시×빈/정상×두 모드이며 계절 모드는 봄·여름·가을·겨울 네 라운드를 모두 확인한다.
- gridFill: 원본의 모든 중첩 값·TypedArray 불변, 독립 결과/배열, 필드 집합 유지, 공급·비용·소비/생산 배출·발전량 회계.
- publicView: fa472b4와 대표 계층 키 및 전체 중첩 키 경로5,161개 집합의 SHA-256 비교. 배열 인덱스를 정규화하고 값 자체는 지문에 넣지 않는다. 추가/삭제0.
- D-79: 정확히 kind===hvdc인 선만×1.5, 일반/미지정/대소문자 다른 종류 불변, 기본 손실, 초전도/사건과 곱, 건설비×1.3. hvdcCap/hvdcCost를 각각 바꿔 자료 카드와 학생 문구가 params에서 만들어지는지 확인.

## 현재 코드 실행 결과

- 지정 Node 명령43개: 실제 통과40개, 실패0개, 분석 입력 부재1개, 은퇴 건너뜀2개. `11-tech-balance`는 요청대로 제외했다.
- 마지막 코드의 영향 검사7개 모두 통과, 전후 UI 해시 변화0개. 새35번: 83개 사례 / 4,703개 단언 / 실패0개. 첫 달 S7 3,420 / 월간 S7 14,225 단언, 실패0개.
- 바꾼/새 JS10개 `node --check` 통과, s7.py AST 문법 검사 통과, `git diff --check -- tests` 통과.
- 18-growth-calibration은 bots36.json 없이 분석 안내만 출력하므로 통과에 세지 않았다. 27/28은 기존 은퇴 가드로 건너뛰었으며 임의로 가드를 해제하지 않았다.

| 명령 (`node tests/league/…`) | 결과 | 초 |
|---|---|---|
| `test-econ.js` | PASS (exit 0) | 0.85 |
| `balance.js` | PASS (exit 0) | 66.0 |
| `recal.js` | PASS (exit 0) | 8.25 |
| `tech.js` | PASS (exit 0) | 1.21 |
| `next.js` | PASS (exit 0) | 15.81 |
| `sec.js` | PASS (exit 0) | 60.51 |
| `review/1-invariants.js` | PASS (exit 0) | 3.65 |
| `review/2-extremes.js` | PASS (exit 0) | 0.16 |
| `review/3-policy-grid.js` | PASS (exit 0) | 4.49 |
| `review/4-drift.js` | PASS (exit 0) | 0.23 |
| `review/5-exploits.js` | PASS (exit 0) | 0.16 |
| `review/6-ind-jump.js` | PASS (exit 0) | 0.12 |
| `review/7-fiscal-approval.js` | PASS (exit 0) | 0.08 |
| `review/8-offers.js` | PASS (exit 0) | 0.22 |
| `review/9-grid.js` | PASS (exit 0) | 0.74 |
| `review/10-tech.js` | PASS (exit 0) | 2.26 |
| `review/12-next.js` | PASS (exit 0) | 5.27 |
| `review/13-confirmed.js` | PASS (exit 0) | 1.84 |
| `review/14-he.js` | PASS (exit 0) | 6.72 |
| `review/15-map.js` | PASS (exit 0) | 0.14 |
| `review/15-recal-r2.js` | PASS (exit 0) | 8.87 |
| `review/16-recal-audit.js` | PASS (exit 0) | 5.25 |
| `review/17-ai-r2.js` | PASS (exit 0) | 22.23 |
| `review/18-growth-calibration.js` | ANALYSIS_INPUT_MISSING (exit 0) | 0.06 |
| `review/19-fiscal-grid.js` | PASS (exit 0) | 15.07 |
| `review/20-fiscal-contract.js` | PASS (exit 0) | 0.13 |
| `review/21-host-policy-grid.js` | PASS (exit 0) | 53.91 |
| `review/22-g4-contract.js` | PASS (exit 0) | 16.33 |
| `review/23-g5-contract.js` | PASS (exit 0) | 0.53 |
| `review/24-g5-ai-debt.js` | PASS (exit 0) | 90.24 |
| `review/25-g6-score-contract.js` | PASS (exit 0) | 0.06 |
| `review/26-g9-start-contract.js` | PASS (exit 0) | 0.31 |
| `review/27-g9-preservation.js` | RETIRED_SKIP (exit 0) | 0.03 |
| `review/28-g10-contract.js` | RETIRED_SKIP (exit 0) | 0.03 |
| `review/29-host-air.js` | PASS (exit 0) | 1.22 |
| `review/29-plan-co2.js` | PASS (exit 0) | 10.56 |
| `review/29-r3-air.js` | PASS (exit 0) | 0.09 |
| `review/30-s7-attribution.js` | PASS (exit 0) | 3.39 |
| `review/31-reweight.js` | PASS (exit 0) | 0.38 |
| `review/32-s7-monthly.js` | PASS (exit 0) | 17.69 |
| `review/33-model-explanations.js` | PASS (exit 0) | 0.44 |
| `review/34-model-copy.js` | PASS (exit 0) | 0.39 |
| `review/35-d73-d74-d79.js` | PASS (exit 0) | 1.23 |

추가 재실행7개: `node tests/league/sec.js`, `node tests/league/review/{30-s7-attribution,31-reweight,32-s7-monthly,33-model-explanations,34-model-copy,35-d73-d74-d79}.js` 각각 실행, 전부 exit0. 상세 종료 코드·전후 해시는 `tests/results/d73-d74-d79/post-update-results.json`.

로그·명령·종료 코드·시작 부하: `tests/results/d73-d74-d79/final-results.json` 및 각 `final-*.log`.

## 수정 전 fa472b4에서의 실패 확인

각 ui 파일을 `git show fa472b4:ui/<name>.js`로 `/tmp/kcp-fa472b4-d737479/ui/`에 꺼냈다(build-maps, tech-data, build, econ-data, econ, league-data, league-core, league). 현재 작업 트리는 되돌리지 않았다. 아래 명령으로 **동일한 새 검사 파일·기대값**을 실행했다.

```sh
KCP_ROOT=/tmp/kcp-fa472b4-d737479 node tests/league/review/35-d73-d74-d79.js
```

결과: exit1, 83개 사례 중 54개 실패. 이는 의도한 회귀 검출이며 현재 코드의 실패로 합산하지 않는다.

| 검사 갈래 | fa472b4 통과/실패 | 현재 통과/실패 | 실패 원인 또는 보존 계약 |
|---|---|---|---|
| D73-params | 0/6 | 6/0 | 옛 국가 계수·최선 값, mid/relCut 미정의 |
| D73-score | 24/30 | 54/0 | 옛 단일 선형식이 B80 경계/상대 감축과 다름 |
| D74-params | 0/2 | 2/0 | gridImportShare/Markup 없음 |
| D74-operation | 0/2 | 2/0 | 시간별 수입0, 기대는 양수 |
| D74-cost | 0/2 | 2/0 | 수입비0, 예: 화성11.614806억 기대 |
| D74-carbon | 0/2 | 2/0 | 계통 소비 탄소 미계상 |
| D74-pm | 0/1 | 1/0 | 계통 수입 발생 양성 대조 실패(수입0) |
| D74-trial | 2/2 | 4/0 | 경제 빈/정상 실패, 계절 두 사례는 그대로 통과 |
| D74-gridFill | 0/1 | 1/0 | gridFill 함수 없음 |
| D74-public | 1/0 | 1/0 | 공개 키 집합 보존: 이전도 통과해야 함 |
| D79-params | 1/1 | 2/0 | hvdcCap 없음; 건설비1.3은 유지 |
| D79-line | 0/1 | 1/0 | HVDC4MW→6MW 미적용 |
| D79-loss | 0/1 | 1/0 | 손실 .012, 기대 기본 .01 |
| D79-cap | 0/1 | 1/0 | 초전도·사건 결합4.8MW, 기대7.2MW |
| D79-cost | 1/0 | 1/0 | 건설비1.3 보존: 이전도 통과해야 함 |
| D79-copy | 0/2 | 2/0 | 용량param/새 문구 없음, 비용 변경도 옛 하드코드 문구에 미반영 |

원시 실패 출력: `tests/results/d73-d74-d79/35-fa472b4.log`.

## 구현 결함·남은 미검증

이번 검사에서 재현된 D-73·D-74·D-79 구현 위반은 없다. 구현 파일은 고치지 않았다.

사용자 금지에 따라 브라우저·실제 클릭·레이아웃·화면 렌더링·`s7.py`의 브라우저 실행은 미검증이다. s7.py는 파일 갱신과 문법 확인까지만 했다. `18-growth-calibration`의 bots36.json 입력 분석도 실행되지 않았다. 로컬 Node 성공을 브라우저/운영 성공으로 표현하지 않는다.
