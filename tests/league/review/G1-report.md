# G1 근거 재보정 보고 (2026-10-06)

R1 전체와 R2 F01~F06을 적용했다. **수용 기준인 전체 실패 0은 미달**이다. 근거 값과 밸런스 단언은 유지했다. 후속 F13을 포함한 재정 보정 및 연구 전략 균형 검토가 필요하다.

작업 위치와 Git 루트는 `/Users/yurosung/Projects/kentech-wt/econ-recal`, 브랜치는 `wip/recal`이다. 시작 미커밋 변경 없음. Node v24.21.0, pnpm 11.25.0. 프로젝트 Node 버전 파일·packageManager·lockfile 없음(빌드 없는 정적 프로젝트). 커밋·외부 전송·외부 코드 조회/실행 없음. `ui/league.js`, `ui/league-net.js`와 core의 claim·publicView·씨앗 경로는 수정하지 않았다.

## 변경된 키

등급·note만 바꾼 항목도 포함한다. `tech_*` 경제 별칭은 TECH_DATA에서 자동 복사된다.

| 파일·키 | 이전 → 새 값 | 등급 이전 → 새 |
|---|---|---|
| econ-data.jobsJ | `신규` → `3` | — → M |
| econ-data.serviceCurve | `[-30,-12,0,10,16]` → `[-27,-20,0,10,14]` | G → M |
| econ-data.taxPoints | `10` → `10` (등급·note 보정) | G → M |
| econ-data.reWeightBase | `0.3` → `0.1` | G → G |
| econ-data.sectorRe100 | `{"semi":0.5,"display":0.4,"auto":0.3,"bio":0.2,"chem":0.15,"steel":0.15,"other":0.1}` → `{"semi":0.29,"display":0.29,"auto":0.29,"bio":0.17,"chem":0.17,"steel":0.17,"other":0.1}` | G → G |
| econ-data.normalCost | `0.012` → `0.008` | G → M |
| econ-data.normalCo2 | `0.4` → `0.4567` | G → O |
| econ-data.hostCapMul | `0.4` → `0.4` (등급·note 보정) | G → M |
| econ-data.hostEssMul | `1` → `1` (등급·note 보정) | G → M |
| econ-data.curtailSlope | `1.7` → `1.3` | G → M |
| econ-data.curtailKnee | `0.72` → `0.64` | G → M |
| econ-data.essCap | `0.9` → `0.9` (등급·note 보정) | O* → O* |
| econ-data.betaPopReal | `0.02` → `0.12` | M → M |
| econ-data.eduSpeed | `4.8` → `4.4` | G → G |
| econ-data.startMix | `0.9` → `1` | G → P |
| econ-data.kappaPopReal | `신규` → `0.009` | — → M |
| econ-data.betaIndReal | `0.02` → `0.08` | G → M |
| econ-data.kappaIndReal | `신규` → `0.005` | — → M |
| econ-data.anchor | `0.9` → `1` | G → P |
| econ-data.gpYear | `0.01` → `0.01` (등급·note 보정) | M → M |
| econ-data.giYear | `0.012` → `0.012` (등급·note 보정) | G → M |
| econ-data.wL | `{"rel":0.26,"price":0.08,"air":0.12,"jobs":0.22,"svc":0.1,"tax":0.1,"crowd":0.12}` → `{"rel":0.26,"price":0.08,"air":0.04,"jobs":0.3,"svc":0.09,"tax":0.04,"crowd":0.19}` | G → M |
| econ-data.unsZeroA | `3` → `3` (등급·note 보정) | G → M |
| econ-data.crowdK | `신규` → `3.5` | — → G |
| econ-data.moneyScale | `신규` → `28` | — → M |
| econ-data.indTaxK | `3` → `1.7` | G → M |
| econ-data.subRevenueRate | `0.8` → `0.8` (등급·note 보정) | O* → O |
| econ-data.taxStep | `0.4` → `0.25` | G → O |
| econ-data.svcStep | `0.5` → `0.25` | G → M |
| econ-data.fsrRef | `0.6` → `0.486` | G → G |
| econ-data.approvalWindow | `12` → `12` (등급·note 보정) | G → P |
| econ-data.debtRate | `0.003` → `0.0024` | G → M |
| econ-data.debtCapRatio | `0.5` → `0.88` | G → M |
| econ-data.outRel | `0.006` → `0.006` (등급·note 보정) | M → M |
| econ-data.fxExport | `0.1` → `0.1` (등급·note 보정) | M → M |
| econ-data.co2IntRef | `0.45` → `0.4567` | G → O |
| econ-data.co2IntDef | `0.45` → `0.4567` | G → O |
| econ-data.groupW.worker | jobs .10→.25, tax .25→.15, svc .20→.15 (나머지 유지) | G→G |
| econ-data.groupW.youth | jobs .15→.25, svc .25→.15 (나머지 유지) | G→G |
| econ-data.reviewEvery | `12` → `12` (등급·note 보정) | G → O |
| econ-data.seekRate | `0.05` → `0.05` (등급·note 보정) | G → M |
| econ-data.wScore | pop .20, ind .20, fin .10, co2 .15, appr .15, rel .20 → 각 1/6 | G→G |
| tech-data.sicOutput | `1.015` → `1.015` (등급·note 보정) | G → P |
| tech-data.tandemOutput | `1.15` → `1.2` | G → P |
| tech-data.tandemCost | `1.15` → `1.2` | G → G |
| tech-data.h2Cost | `40` → `28` | G → M |
| tech-data.ccuOutput | `0.85` → `0.79` | G → M |
| tech-data.smrCost | `150` → `150` (등급·note 보정) | G → M |
| tech-data.smrTurns | `6` → `6` (등급·note 보정) | G → P |
| tech-data.smrFuel | `0.002` → `0.002` (등급·note 보정) | G → M |

삭제·대체: `kappaPop 0.04(G) → kappaPopReal 0.009(M)`, `kappaInd 0.005(G) → kappaIndReal 0.005(M)`, `jobsSlope 1.5(G) → jobsJ 3(M)`, `crowdCapMul 1.15(G) → crowdK 3.5(G)`. 산업용 `crowdScore`, `crowdKnee/base/slope`, `landCapMul`은 유지했다.

| 파일·상수/자료 | 이전 → 새 값 | 등급·근거 |
|---|---|---|
| build.dispOf coal fuel | .006 → .0045 | M, REF 7.1 [S16] |
| build.dispOf import co2 | .46 → .4567 | O, REF 9.4 [L14] |
| build.M.pr → M.pvYield | .8 → .92 | M, REF 8.1 [S22][S31] |
| build.M.batEff | .95 → .922 | P, REF 8.6 [I13][I14] |
| build BMS 한 방향 효율 | .955 → .933 | G, 왕복 85→87%는 설계 선택, REF 8.6 |
| league-core.TIE_LOSS | .02 → .01 | G, 구간 손실 원문 없이 전국 평균 아래로 가정, REF 8.10 [S20] |
| league-core.PRICE | min .005/max .05/def .015 → .004/.025/.009 | M, REF 7.11 [S16][S18][S19] |
| league-core.modsFor fuelMul | coal 제곱근·diesel 1승 → 둘 다 0.6승 | M, REF 7.3 [S16] |
| league-core.fcxOf 예보 폭 | 0.5 → 0.7 | P, REF 12.7 [P101] |
| league-data.coldwave_heating.demandMul | 1.10 → 1.15 | M, REF 8.17 [S21][X21] |
| league-data.light_load_curtailment.why | 약 30회·호남/제주 → 93일 중 30일·제주 제외 비중앙 태양광 | REF 8.15 [X25] |
| econ-data.intl.events.ship_red.fx | ship −.3, lng +.1 → ship −.3만 | M(사건 LNG 동반 상승 제거), ship −.3 크기는 G, REF 7.9 [S28][S16] |
| econ-data.intl.events.cbam.text | 전력 탄소 연동 문구 → 직접배출·EU 수출 비중·단계 도입 | REF 7.14. 실제 식·일정 변경은 F16 담당 |
| econ-data.start.*.uni/lab | 동일 수를 univ0/lab0로 이름 변경 | SPEC §1.3 O*. 개별 시설 수 원문 출처는 기존 자료에 없어 신규 확인으로 해석하면 안 됨 |

F01: β는 .12/.08 그대로, κ에만 eduSpeed를 곱한다. F02: 시작·현재의 활성 지역 종사자/인구 비율로 일자리 로그 점수를 계산한다(E.totals의 시작 합 사용). F03: 주민 혼잡은 지역 성장 대비 초과 성장으로 계산한다. F04: '집값이 올라서 (G)', 집단 원인 '집값 (G)' 및 주민 이주 이유 등급을 표시한다. F05: 시작 보정도 econInput을 사용하고, 월 자산은 시작 수 + 지은 수로 통일했다. F06: industryAttract 인재·교육 식은 유지했다.

추가 수치 안정화: R1 후 선지급/월내 지급의 현금 `===` 검사가 두 도시에서 깨졌다. 현금에 지원금을 먼저 합산하도록 덧셈 순서만 통일했다. 현금 항등식·선지급 정확한 일치 단언은 유지했다.

## 바꾼 검사 단언

| 파일·검사 | 옛 단언 → 새 단언/fixture | SPEC 근거 |
|---|---|---|
| test-econ.js 고정 조건 | kappaPop/kappaInd를 0 → kappaPopReal/kappaIndReal을 0 | §1.2, F01, §7.1 |
| test-econ.js 첫 달 한도 | cash0×1.5 이하 → 연 세입×debtCapRatio의 반올림 값과 정확히 일치 | §1.1 debtCapRatio, §8 #6 |
| balance.js B1 등급 | betaIndReal G→M, startMix G→P | §1.1, §7.1 |
| balance.js B5 가중 | fin 가중 0~.15 → 여섯 가중 각각 1/6(오차 <1e-9), cash 키 없음 유지 | §1.1 wScore |
| balance.js B15 | κβ/자료 선형 반응 비율 오차 ≤10%, 산업 β G → 실제 move 진입 인자의 β=.12/.08, κ=.009/.005×speed(오차 <1e-9), speed 1·4.4 양쪽 확인, 산업 β M | F01, §7.2·§7.3 B15 |
| balance.js B17 | 첫 달 한도≤cash0×1.5 → 연 세입×.88 반올림 기대값과 정확히 일치 | §1.1 debtCapRatio, §8 #6 |
| review/10-tech.js 기본 선 | 손실 .02 → .01 | §1.3 TIE_LOSS |
| review/10-tech.js 탠덤 2건 | 건설비·실제 출력 각 1.15 → 각 1.2 | §1.3 tandemCost/Output |
| review/10-tech.js CCU 3건 | mods 출력 .85, 실제 공급 비 .85, 제어 비교 분모 .85 → 모두 .79 | §1.3 ccuOutput |
| review/9-grid.js 등급 3건 | hostCapMul/curtailSlope/curtailKnee G→M; 나머지 G 유지 | §1.1 해당 R1 행 |
| review/13-confirmed.js 탄소 기여 3건 | 공급50의 계통 CO₂20→22.835, 공급100의 계통 CO₂40→45.67; 저탄소 수입 감축30→35.67 | §1.1 normalCo2 |

마지막 탄소 검사의 미공급/계통 수입 감축 0 기대값과 실제 공급·소비 기준은 유지했다. 총량 보존·현금 항등식·결정성·유한값·0~100 범위 단언은 완화하지 않았다. B1 행동 목표, B3/B12 정책 균형, T5 연구 이득 목표도 그대로다.

## §7.2 측정

`review/lib.js` 근사 에너지 입력, 시작 보정 뒤 실행. 씨앗 `recal-1/2/3`, 활성 도시 6개. 도시 ID를 특정 이름으로 분기하지 않고 자료 순회로 측정했다. 국제 변동·기존 성장률은 유지했다. 현실 모드는 eduSpeed=1; 아직 구현 범위 밖인 eduMemory/F10은 없다. 일자리 충격은 시작 보정 뒤 대상 종사자 +1%를 다른 도시에서 비례 차감(정수·합 보존), κ_ind=0, 같은 씨앗 무충격 실행과 주민 로그 차이를 ln(1.01)로 나눴다.

표는 도시별 3씨앗 평균. 정전은 `(현재 인구/현재 지역 총인구)/(시작 인구/시작 지역 총인구)−1`의 상대 백분율이다. 회복은 24달 동안 최대 몫 손실 대비 마지막 손실의 회복 비율이다.

| 도시 | 일자리 현실/게임 탄력 | 100% 정전 현실/게임 몫 변화 | 5% 정전 게임 몫 변화 | 게임 회복 |
|---|---|---|---|---|
| hwaseong | 0.09934 / 0.30935 | -1.685% / -5.662% | -2.103% | 75.47% |
| pyeongtaek | 0.09450 / 0.29560 | -2.107% / -7.142% | -2.699% | 75.40% |
| anseong | 0.09966 / 0.30626 | -2.365% / -8.097% | -3.130% | 74.36% |
| dangjin | 0.09740 / 0.30285 | -2.377% / -8.091% | -3.088% | 75.78% |
| asan | 0.09686 / 0.30245 | -2.266% / -7.725% | -2.960% | 74.84% |
| cheonan | 0.09582 / 0.29852 | -2.074% / -7.046% | -2.678% | 74.77% |

| 목표 | 전체 실제 범위/결과 | 판정 |
|---|---|---|
| 일자리 현실 탄력 | 0.09450~0.09966 | 0.07~0.13 충족 |
| 일자리 게임 탄력 | 0.29560~0.30935; 현실의 약 3.07~3.13배 | >2배 충족 |
| 100% 정전 현실 몫 | −2.37686~−1.68486% | −3.9~−1.3% 충족 |
| 100% 정전 게임 몫 | −8.09784~−5.65971% | 일부 도시 −8% 아래. 아래 해석 충돌 참조 |
| 5% 정전 게임 몫 | −3.13103~−2.10019% | 일부 도시 −2.5% 아래. 아래 해석 충돌 참조 |
| 회복 게임(몫 기준) | 74.30505~75.94398% | ≥40% 충족 |
| 무변화 36달 최대 몫 표류 | 현실 .004415%, 게임 .036852% | ≤.1%/≤.6% 충족 |
| 배속 실제 move 인자 | 현실 주민 κ=.009·β=.12, 산업 κ=.005·β=.08; 게임 주민 κ=.0396·β=.12, 산업 κ=.022·β=.08 | B15 계측 단언 통과 |
| 대학 자산 36달 | svc·talent 최대 변화 0점, 새 uni/lab 1개씩 추가 시 시작 수+1 | ±1점 충족 |

기존 balance.js B1은 정전·회복에서 **절대 인구 증감**을 검사한다. 같은 측정의 게임 절대 인구 증감은 정전100% −7.179~−4.716%, 정전5% −2.162~−1.121%, 회복 100%여서 기존 B1 단언은 통과한다. §7.2의 “몫 변화”와 기존 B1을 같은 수치로 읽을 수 없다. 수치를 맞추려고 정의나 상수를 바꾸지 않았다.

| 도시 | univ0/lab0 | svc 시작→36달 | talent 시작→36달 |
|---|---|---|---|
| hwaseong | 2/1 | 71→71 | 85→85 |
| pyeongtaek | 1/0 | 58→58 | 50→50 |
| anseong | 2/0 | 66→66 | 70→70 |
| dangjin | 0/0 | 50→50 | 30→30 |
| asan | 3/0 | 74→74 | 90→90 |
| cheonan | 4/1 | 75→75 | 100→100 |

대학 측정은 실제 `leagueCore.newState()`의 시작 보정 후 매달 `econInput()`을 통해 정상 입력을 전달했다. 발전 모형의 무투자 정전 영향을 섞지 않았다. 새 검사 JS 파일은 만들지 않았으며 측정 스크립트는 작업용 임시 파일에만 뒀다.

## 화면·후속 조정 위치

- `ui/league.js:229`, `:537`: 배속 숫자는 동적으로 4.4가 되지만 문구가 아직 “이주 속도/실제보다 빠름”. “주민·기업 이동 시간 ×4.4, 게임 1달≈현실 약4.4달”로 총괄 수정 필요.
- `ui/league-core.js` econView: 현재 eduSpeed 숫자만 전달한다. `econ.speeds`의 시간 압축 메타데이터는 이번 수정 금지 범위(publicView 인근)이므로 다른 담당이 추가해야 한다.
- `ui/build.js:223`, `:287`, `:2829`: BMS·충방전 효율 문구 95/95.5%가 남음. 상수 변경만 허용되어 위치 보고.
- `ui/tech-data.js:17`, `:80`, `:83`, `:84`, `:89`: HVDC “2→1.2%”, BMS “95→95.5%”, 탠덤 “×1.15”, CCU “×.85” 카드 문구가 남음. 이번은 상수·note 보정 범위로 유지.
- CBAM 문구는 R1 계약대로 바뀌었으나 실제 효과·일정은 F16에서 바뀌므로 그 전까지 문구와 식이 다름.

`tests/run.sh` 기본 14종과 그 검사 파일에는 #build 수치 스냅숏/직접 참조가 없었다. 별도 브라우저 영향 후보는 `tests/league/calib.py`, `calib2.py`, `cities.py`, `econint.py`, `bots36.py`, `tech.py`. 브라우저 실행은 총괄 담당이라 여기서 운영 성공을 주장하지 않는다.

## 불변 동작 회귀

7개 지도×단독/leagueMods 없는 기술0장(14조합), 태양광·배터리·디젤 계획, 고정 씨앗, 7일 운영의 전체 반환 JSON을 비교했다.

- R1 직후 스냅숏 대 F01~F06 적용: 14/14 정확히 동일.
- HEAD 기준선 대 현재 코드에서 R1 build 상수만 메모리상 원복한 사본: 14/14 정확히 동일.
- 브라우저·`bots36.py`는 미실행. 필수 Node의 `review/11-tech-balance.js`가 별도의 36달·4전략×6도시 검사를 수행한다.

## 실제 검사 결과

기준선은 HEAD의 ui·tests/league를 임시 디렉터리로 추출해 독립 실행했다(진행 중 파일 변경 영향 없음). R1도 값 변경 직후 사본을 별도로 고정해 같은 전체 명령을 실행했다. 최종 R2 실행은 옛 값 단언 수정 후 결과다.

| 검사 | HEAD 기준선 실패 | R1 실패(옛 단언 그대로) | 최종 F01~F06 실패 | 최종 통과/검사 |
|---|---:|---:|---:|---|
| test-econ.js | 0 | 4 | 0 | 1,007,269 통과 |
| balance.js | 0 | 8 | 4 | 553 통과 / 557 |
| next.js | 0 | 0 | 0 | 582 / 582 |
| tech.js | 0 | 0 | 0 | 166 / 166 |
| review/1-invariants.js | 0 | 0 | 0 | 3,465,179 / 3,465,179 |
| review/10-tech.js | 0 | 6 | 0 | 367 / 367 |
| review/11-tech-balance.js | 0 | 1 | 1 | 10,438 통과 / 10,439 |
| review/12-next.js | 0 | 0 | 0 | 236 / 236 |
| review/13-confirmed.js | 0 | 3 | 0 | 167 / 167 |
| review/9-grid.js | 0 | 3 | 0 | 168 / 168 |
| review/2-extremes·3-policy-grid·4-drift·5-exploits·6-ind-jump·7-fiscal-approval·8-offers.js | 0 | 0 | 0 | 모두 exit 0(진단 출력 중심) |
| 합계 | 0 | 25 | **5** | 수용 기준 실패 0에는 미달 |

수정된 JS 11개 모두 `node --check` 성공. `git diff --check` 성공. 검사 개수 변화만으로 판단하지 않고 실제 실패 메시지·원인과 변경 단언을 대조했다. `test-econ`의 선지급 정확한 일치 실패는 해소했고, 불변 조건 단언은 그대로 통과했다.

실행 명령은 SPEC §10-1의 4개 Node 명령과 review의 lib.js 제외 전 JS이다. review의 실행 순서가 로케일 파일 순서로 1·10·11·12·13·2…9인 점 외에 동일하다. 측정용 신규 검사를 balance.js에 추가하지 않았다(B15의 기존 배속 검사 교체만 시행).

## 새로 확인한 충돌과 후속 조치

1. **재정 묶음 순서 의존(B3/B12, 실제 실패 4건).** 저세율 −2·서비스 +2의 첫 12달 운영 수지가 산업 용지 제약과 무관하게 일부 도시에서 흑자다: 안성 +8.042억, 당진 +50.266억. 36달 정책 격자의 저세율·서비스+2 1위 4/6(기준≤2), 저세율 계열 1위 5/6(기준≤3). R1부터 있었고 F01~F06으로 해소되지 않는다. SPEC §7.3·§8 #7이 지목한 F13 fiscalTargetRev 보정이 현재 위임 범위 밖이다. taxStep .25·svcStep .25를 되돌리거나 B3/B12 단언을 완화하지 않았다.
2. **연구 전략 목표(T5, 실제 실패 1건).** 연구 몰빵−연구0 평균: 기준선 통과 → R1 −2.7167점 → 최종 −3.10점(기준 0 초과·15 이하). 연구 비용/편익과 재정의 다음 묶음에서 G 손잡이만 검토해야 한다. 원인 기여를 개별 상수까지 분리한 실험은 하지 않았으므로 특정 근거 키 하나가 원인이라고 단정하지 않는다.
3. **§7.2 정전 ‘몫’과 B1 ‘절대 인구’의 정의 차이.** 기존 B1은 통과하지만 몫으로 측정하면 정전100% 일부 도시 −8.10%, 정전5% 일부 도시 −3.13%로 표의 게임 경계를 벗어난다. 기준선/성장률/비교 정의를 총괄이 통일해야 하며 근거 상수는 그대로 둔다.
4. **일반 선과 HVDC 손실 역전.** R1 일반 선 1% < 기존 hvdcLoss 1.2%. F41 적용 범위 수정 전에는 HVDC 기술이 기존 선 손실을 늘릴 수 있다. hvdcLoss는 이번 R1 변경 행이 아니므로 유지했다. 장거리 변환소 손실과 구간 손실 비교의 의미는 SPEC §9 D2에서 판단할 사항이다.
5. **대학·연구소 수의 출처 공백.** 기존 2/1 등 시작 수를 univ0/lab0로 옮겼으며 새 수를 만들지 않았다. SPEC 지정 등급 O*를 따랐지만 REF 3.9·4.8에는 각 시설 수의 개별 원문 출처가 없다. 통계 원문 확인은 별도 자료 보강이 필요하다.
6. **전환 중 표시 불일치.** CBAM 직접배출 문구(R1)는 적용됐으나 식·일정(F16)은 아직 이전 상태. 이주 시간 압축 publicView 메타데이터·화면 문구도 다른 담당 범위다.

## 36달 Node 전략 실측

`review/11-tech-balance.js`, 방 씨앗 `tech-strategy-common`, 각 표적 도시 외 나머지 5도시는 같은 균형 AI, 모든 전략 동일 기간 36달. 이는 브라우저 bots36.py와 별개다.

| 도시 | 연구 몰빵 | 연구 0 | SMR 조기 | 수소 장주기 |
|---|---:|---:|---:|---:|
| 화성·오산 | 63.4 | 63.2 | 83.7 | 60.5 |
| 평택 | 73 | 69.9 | 89.5 | 73.4 |
| 안성 | 52.5 | 65.8 | 60.8 | 51.3 |
| 당진 | 74.5 | 64.3 | 91.8 | 67.1 |
| 아산 | 41.9 | 48.8 | 82 | 41.4 |
| 천안 | 49 | 60.9 | 80.4 | 48.8 |
| 평균 | 59.05 | 62.15 | 81.37 | 57.08 |

1위: 5도시 SMR 조기, 1도시 연구0. 한 전략 6도시 독식 금지 조건은 통과한다. 24개 표적 도시 실행의 평균 정전율은 모두 0%다. LNG·디젤 의존 전략 분산과 ‘아무것도 안 함’ 대조는 이 검사 전략에 없어 별도 bots36.py 담당이 측정해야 한다.
