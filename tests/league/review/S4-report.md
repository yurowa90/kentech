# S4 R3 대기 PM2.5·지도 축척 검증(2026-10-09)

기준 `fd9f057`, `wip/r3`. 커밋·외부 전송 없음(공개 출처 읽기만). Node v24.21.0, pnpm 11.25.0. package.json·lockfile·Node 버전 파일 없는 정적 앱. Python 3.14.7은 표준 라이브러리만 쓰는 bots36의 `--node` 경로로 실행했다.

## 구현과 경계

경제 엔진의 H01 계산과 H03/H04용 지역 숫자 필드를 구현했다. 금지 파일 league-core.js·league.js·build.js와 recal.js는 수정하지 않았다. 현재 호스트가 연료별 genMWh를 전달하지 않으므로 **실제 호스트 PM 통합은 미완료**다. 별도 실제 `C.econInput()` 호출에서도 `genMWhPresent=false`, `mwScale=230`을 확인했다. 아래 봇 결과는 CO₂ 대리식 제거 후의 회귀 검사다. 다른 세션에서 시작 보정과 매달 `econInput` 양쪽에 실제 생산량×wk를 전달한 뒤 봇을 다시 실행해야 한다.

| 새 키 | 값 | 등급 | 확인한 근거·환산 |
|---|---|---|---|
| kPM | 7e-6 ㎍/㎥ / (게임 MWh/월) | M | [P61 Table 6](https://www.jekosae.or.kr/xml/39664/39664.pdf) 당진 기여 .092; [동서발전](https://www.ewp.co.kr/eng/subpage/content.html?pc=QY14OHXHSVTQ9WJF3Y0BJKN7RFFVYIL) 6,040MW. .092/(6040×8760×.7)×230×12≈6.856e-6 반올림. 이용률 .7·축척은 G |
| airSlope | 29 점/(㎍/㎥) | M | [P17 게재본](https://pengzhang.weebly.com/uploads/3/1/7/6/31762679/pollution-migration.pdf) Table2·§7, 평균53.08·증가5.31에 5년 인구−2.8%; 약−0.5%/㎍을 β .12·κ .009·도달률 .42·wL.air .04로 환산 |
| airSpill | .6 | M | P61 Table6: 당진 .092, 아산 .059, 예산 .076, 천안 동남 .047/서북 .037; 인접 기여비를 단순화 |
| pmFuelW | coal 1, diesel .8, biomass .8, lng .05 | M(G 포함) | [EEA 1.A.1](https://www.eea.europa.eu/en/analysis/publications/emep-eea-guidebook-2023/part-b-sectoral-guidance-chapters/1-energy/1-a-combustion/1-a-1-energy-industries-2023/@@download/file) Tables3-11·3-19·3-21·3-8 + [Heo 외(2016)](https://pubs.acs.org/doi/10.1021/acs.est.5b06125). PM·전구물질 영향 가중이며 디젤·바이오매스 .8은 G, 한국 실측 배출 질량비 아님 |
| airBase | 80 | G | 발전 증분0의 게임 기준점(절대 청정도 아님), REF9.10 |
| eduAir | 4 | G | 집단 만족만 영향 확대, REF9.10 |
| 지역 mwScale | 230 | G | 지도 설계; 게임 MW→실제 MW, SPEC H03/H04 |

EEA 원문의 석탄 PM2.5·SOx·NOx는 각각3.4·820·209g/GJ이고 SO₂ 외에는 저감을 가정한다. 가스터빈 PM2.5<.2·NOx48, 경유 엔진 PM2.5 21.7·NOx942, 고체 바이오매스 PM2.5 133을 확인했다. 가중을 배출계수 자체로 표시하지 않는다. 미국 피해비용·중국 이주 연구를 한국 게임으로 옮긴 근사라는 한계는 그대로 남는다. DOI 일부 직접 열기가 실패하여 학회·저자 공개 PDF·EEA 공식 PDF를 대조했다. ACS는 검색 결과의 발행사 초록을 확인했으며 본문 직접 요청은403이었다.

## 바뀐 식과 입력 계약

`ownᵢ = kPM × Σ_f pmFuelW_f × genMWhᵢ,f`

`ΔPMᵢ = ownᵢ + airSpill × Σ_인접 참가 도시 ownⱼ`

`Lparts.air = clamp(airBase − airSlope × ΔPMᵢ, 0, 100)`

`groupParts.air = clamp(airBase − eduAir × airSlope × ΔPMᵢ, 0, 100)`

- genMWh는 생산 기준 월 게임 MWh다. 인구·소비·수입·CO₂로 나누거나 역산하지 않고 월·지도 배수를 재적용하지 않는다. 그 달 발전 속도를 연율화한 기여 근사이며 월별 오염을 누적 저장하는 모형이 아니다. 석탄·LNG·디젤·바이오매스를 계산하며 그 밖 전원의 자체 PM 기여는 이 모형에서0이다. genMWh 객체 안의 생략한 연료는0으로 취급하므로, 호스트는 생산량을 빠짐없이 전달해야 한다.
- 지리적 후보 쌍으로 인접을 판정하고 건설·거래 여부와 무관하게 반영한다. 중복·자기 연결·비참가 도시·2단계 전파를 제외한다.
- 누락 입력의 자체 증분은 null, 알려진 부분만 합산한 delta와 complete=false를 보고한다. 모두 누락이면 air80은 중립 기준이며 실제 무배출 확정값이 아니다. 명시적0과 구별한다.
- 기존 L의 월 지연과 집단 만족의 악화·회복 기억은 유지한다. 교육 배수는 집단 air 목표에만 적용한다.
- scale 문자열에서 숫자를 파싱하는 곳은 없었다. H03 시설세·H04 정전 피해 금액 구현은 범위 밖이다.

## 검증

기존 recal는251통과/8미구현이었다. 새 H01 검사는 기존 엔진에서 석탄10,000MWh의 air 기대77.97에 실제100으로 실패했다. 수정 후 recal는 파일 변경 없이262통과/0실패/0미구현이다. 8건 해소 뒤 각 씨앗의 유효충격 추가 단언3건이 실행되어259가 아닌262건이다.

- recal3씨앗: 당진 시작 ΔPM .078648㎍/㎥, air77.719205→80. 상승2.280795점=상한29×시작ΔPM.
- balance 독립 장치: 석탄10,000MWh→ΔPM .07·air77.97, 이웃 .042·air78.782, 비인접80. LNG79.8985·디젤/바이오78.376. 집단 air71.88(×4), 이주용 L 불변. 전면 정전 상승2.03점≤상한2.03.
- review29: 결측·인접 중복·자기/비참가 제외·2단계 전파 없음·결정성·입력 불변·유한성·하한·축척 문구 독립성17통과.
- 보존 검사27의 '모든 새 키 G'는 명세상 신규6키의 정확한 등급만 허용한다. 검사28의 econ 전체 바이트 고정은 점수식·공개 API 보존으로 좁혔다. 기존 근거·기술·build·recal 보존은 유지한다.

브라우저 검사는 실행하지 않았다. 프로젝트 tests/.venv가 없고 이 세션은 화면 수정 범위가 아니다. 저장소 tests/run.sh는 해당 환경을 요구하며 허용 파일 밖 tests/results에 쓰므로 실행하지 않았다. 노드 검사는 아래 실행별 결과로 구분한다.

## 36개월 봇 결과(재개 후 완료)

`python3 tests/league/bots36.py --node --months 36 --output-dir /private/tmp/s4-resumed-bots` — **18,326건, 실패0**. 9회전·6도시 전 전략 비교이며 quick 옵션은 쓰지 않았다. 호스트 genMWh 미연결 상태의 회귀 결과다.

| 전략 | 평균 점수 | 도시별 1위/6 |
|---|---:|---:|
| nothing | 9.533 | 0 |
| base | 69.233 | 1 |
| diesel | 48.717 | 0 |
| renew | 68.800 | 1 |
| ties | 67.783 | 1 |
| taxlow | 47.967 | 0 |
| taxhigh | 66.533 | 0 |
| dm | 71.517 | 1 |
| storage | 73.083 | 2 |

- B16: 12·24·36개월 모두 6도시를 독식하는 전략 없음. 36개월 1위는 화성·천안 storage, 평택 base, 안성 dm, 당진 renew, 아산 ties.
- 재생68.800 > 디젤48.717. nothing은 세 시점 모두 모든 도시에서 점수9/9위.
- 정책0 base의 36개월 지방채 한도 초과0달.
- 기계 판독용 요약: [S4-bots-summary.json](S4-bots-summary.json). 원본 상세 로그는 `/private/tmp/s4-resumed-bots/bots36.json`·`bots36.md`.

## 재개 검증 이력

중단 전 정상 종료한 검사19개는 `/private/tmp/s4-final/results.json`의 종료 코드와 실제 로그를 대조해 보존했다. 이 로그들은 모두 마지막 구현 변경 이후 생성됐으며 재개 후 구현 코드는 변경하지 않았다. 종료가 확인되지 않은 review16개는 이번에 순차 실행해 모두 정상 종료했다. `recal.js`도 마지막에 재실행해262/0·미구현0을 확인했다. review18은 실제 봇 JSON을 인수로 다시 실행했다. 검사별 출처·종료 코드·시간·로그 요약과 소스 SHA-256은 [S4-validation.json](S4-validation.json)에 저장한다.

## 최종 검사 결과

| 검사 | 결과 | 실행 구분 |
|---|---|---|
| recal.js | 262통과 / 0실패 / 미구현0 | 재개 후 재실행, 파일 불변 |
| balance.js | 826통과 / 0실패 | 중단 전 완료 로그 보존 |
| test-econ.js | 1,289,071통과 / 0실패 | 중단 전 완료 로그 보존 |
| next.js | 575통과 / 0실패 | 중단 전 완료 로그 보존 |
| tech.js | 167통과 / 0실패 | 중단 전 완료 로그 보존 |
| sec.js | 524통과 / 0실패 | 중단 전 완료 로그 보존 |
| review 번호 스크립트30개 | 모두 종료0, 단언 검사 실패0 | 이전 완료14개 + 재개16개; 진단 스크립트는 단언 수로 합산하지 않음 |
| review11 T5(위30개에 포함) | 22,030통과 / 0실패, 42개 도시·전략 비교 | 재개 후 전체 실행 |
| review21 정책 격자(위30개에 포함) | 750조합, 38통과 / 0실패 | 재개 후 실행 |
| review24 AI(위30개에 포함) | 2,592통과 / 0실패 | 재개 후 실행 |
| bots36 --node --months 36 | 18,326건 / 0실패 | 재개 후 전체9회전 |
| node --check | 변경 JS8파일 + bots36 내부 JS 통과 | 재개 후 실행 |
| 보존 검사 | 금지3파일·recal.js가 fd9f057과 바이트 동일 | 최종 재확인 |
| git diff --check | 통과 | 최종 확인 |

T5의 SMR 1위는2/6(목표≤3), 연구 이득은4.617점이다. 전략 평균은 SMR83.750·연구72.700·연구0 68.083·수소61.433·재생저장74.867·연계선68.283·혼합74.300이다. 호스트 PM 미연결이라는 동일한 한계가 적용된다. 보존한 검사 이후 구현 변경이 없음을 최종 SHA-256 대조로 확인했다. 재개 후 무거운 검사는 한 번에 하나씩 실행했다.

미검증은 브라우저 화면과 호스트의 실제 연료별 PM 전달을 포함한 통합 동작이다. 화면 문구·배속 표시는 요청대로 수정하지 않았다. 커밋·push·배포는 하지 않았다.

## 변경 파일

- `ui/econ.js`: 생산 월 MWh·인접 PM 계산, 이주/집단 만족 대기 식, 결측 표시.
- `ui/econ-data.js`: H01 신규6키, airRef·airDefault 삭제.
- `ui/league-data.js`: 지역 mwScale230만 추가.
- `tests/league/balance.js`: H01 연료·정전 상한19단언.
- `tests/league/review/lib.js`, `27-g9-preservation.js`, `28-g10-contract.js`, `29-r3-air.js`: 지역 자료 로드, 승인된 H01 보존 범위, 경계17단언.
- `docs/ECON-BALANCE.md`, `docs/ECON-RECAL-SPEC.md`, `docs/ECON-REFERENCES.md`: v1.9 결과·§8 연결 한계·원문 정정.
- `tests/league/review/S4-report.md`, `S4-validation.json`, `S4-bots-summary.json`: 보고·검사 근거·봇 표.

## 화면 세션 전달

`공기(CO₂ 기준 추정)`은 그대로 남겨 두었다. 바뀐 의미는 **발전 PM2.5 증분 기반 대기 영향(인접 기여 포함)**이다. 절대 관측 PM2.5·모든 대기오염·건강 예측이 아니다. 집단 만족만×4, 이주용 L은×1이며 publicView의 '대기 현재×1, 예정×4'도 후속 수정해야 한다. 먼저 호스트 genMWh 입력을 연결하고, complete=false일 때 미연결/부분 추정을 알릴 필요가 있다.
