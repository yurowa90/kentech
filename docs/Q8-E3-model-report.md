# Q8 E3 판정 상수·설명 정정 인계

2026-10-21 · 브랜치 `wip/q8-e3b` · 시작 머리 `fb8b48b`. 커밋·브라우저·외부 네트워크는 사용하지 않았다. Node v24.21.0, pnpm 11.25.0에서 실행했다. 시작 시 미커밋 변경은 없었다.

판정 기준 검사 17개는 최종 실패 0이다. 제외 대상 `40-d82-perday.js`는 별도 보고한다. `42-explain-model`은 413개 중 실패 11 → 0이다. 기본 계수와 판정 연산 순서를 유지했다. 새로운 화면 요소·CSS·저장 계약은 추가하지 않았다.

## 옮긴 상수

아래 키는 모두 `ui/econ-data.js` params의 G이며, note에 ‘약속·S7 판정 눈금 · 게임 가정(G)’과 단위·용도를 적었다. 객체 안 숫자도 기존 값 그대로다.

| 기존 이름·위치 | 값 | 새 params 키 | league 사용 줄 |
|---|---|---|---|
| EVIDENCE_STEP | evening=.01, grid=.02, fuel=.01, wind=.02, neighbor=.02, floor=.01, neighborFloor=.5 | `promiseEvidenceStep` | `ui/league.js:816` |
| direction 반올림 | 0자리 | `promiseDirectionDigits` | `ui/league.js:819` |
| direction 같음·PREDICTION_RULE | .5 미만 | `promiseSameDelta` | `ui/league.js:819` |
| IQ | large=.2, co2Up=.05, spare=.3, gapWide=40, gapNarrow=10, approval=3, rank=2, quarter=3, target=6, max=8, line=50 | `interviewQuestionRules` | `ui/league.js:178` |
| CONFIDENCE | half=.5, fairly=.7, sure=.9 | `promiseConfidence` | `ui/league.js:976` |
| ZERO_OUTAGE_PCT | .005 | `zeroOutagePct` | `ui/league.js:2705` |
| GRID_SAME_MWH | 1 | `gridSameMwh` | `ui/league.js:2705` |
| GRID_SAME_SHARE | .05 | `gridSameShare` | `ui/league.js:2705` |
| GRID_SAME_MWH_PER_DAY | .05 | `gridSameMwhPerDay` | `ui/league.js:2708` |
| GRID_SAME_SHARE_PER_DAY | .05 | `gridSameSharePerDay` | `ui/league.js:2708` |
| OUTAGE_MIN_GRID_PART_PER_DAY | .05 | `outageMinGridPartPerDay` | `ui/league.js:1000` |
| outageReplayShown 계통 | .05 | `outageReplayGridMin` | `ui/league.js:998` |
| outageReplayShown 정전 | .005 | `outageReplayUnsMin` | `ui/league.js:998` |
| outageMinPart 정전 | .05 | `outageMinUnsPart` | `ui/league.js:1001` |
| outageMinPart 나눗수 | 10 | `outageMinPartDivisor` | `ui/league.js:1001` |
| outageCardCandidates 최대 수 | 3 | `outageCardCount` | `ui/league.js:1012` |
| outagePartRanking 동점 자릿수 | grid=1, uns=2 | `outageRankingDigits` | `ui/league.js:1019` |
| OUTAGE_HIGH_PCT | 5 | `outageHighPct` | `ui/league.js:1034` |
| outageHigh 자릿수 | 2 | `outageHighDigits` | `ui/league.js:1035` |
| gridOnlyServed 허용폭 | .01 | `gridOnlyServedMwh` | `ui/league.js:2739` |
| GRID_LEAN_PER_DAY(함께 이동) | .05 | `gridLeanPerDay` | `ui/league.js:2710` |
| 정전시간 최소 부족량(C04) | .005 MW | `outageHourMinMW` | `ui/league.js:2592` |
| 정전시간 수요 비율(C04) | .02 | `outageHourShare` | `ui/league.js:2592` |

`PREDICTION_RULE`은 `promiseSameDelta`에서 생성한다(league.js:820). ±0.5는 up/down, 그 안은 same으로 유지된다. 동점 판정 자릿수만 자료로 옮겼고 화면 서식용 `outageGridRounded`·`outageNumber`·`outageValue`·`signed`는 보존했다. `outageCost`의 함수 원문과 비용 문자열도 그대로다. 고정본에서 고른 카드 보존 경로 역시 `outageCardCount`를 읽는다(league.js:3310).

| 장부 반올림 | 값(배수) | params | 사용 줄 |
|---|---:|---|---|
| core r2 | 100 | 새 G `ledgerRound2` | ui/league-core.js:36 |
| core r3 | 1000 | 기존 G `ledgerRound3` 공유 | ui/league-core.js:37 |

곱셈 → Math.round → 나눗셈 순서를 보존했다. `ledger.income·opex`도 같은 r3를 사용한다. C04의 `isOutHour`와 설명도 같은 `outageHourMinMW·outageHourShare`를 읽는다(core.js:21).

C22(28℃ 무더위 기준)는 `ui/build.js`의 엔진 계수라 이 커밋에서 옮기지 않았다. build.js는 다른 갈래 소유이고 총괄 승인 순서상 E2(별도 커밋)에서 `BG.M.hotTmax` 하나로 옮기고 리그 설명이 그 값을 읽게 한다. 지금 리그 설명의 28℃는 그대로다.

## 문구 전후

| 항목 | 전 | 후·원천 |
|---|---|---|
| T07 | 새 배터리 용량 20 MWh(×1.25), 화재 면역 | 새 배터리 용량 20 MWh(×1.25). 미구현 화재 면역 삭제, 용량은 batMWh×nbatCapacity |
| T10 | LNG CO₂ ×0.88 | 연결된 수소가 남아 있을 때 LNG CO₂ 최대 12% 감소. 카드 eff 공유, (1−h2Co2)×100 |
| T06·T11 | 출력×1.2·건설비×1.2 / 석탄 CO₂×.4·출력×.79 | 기본 문구·숫자는 그대로, 카드 eff를 같은 원천으로 사용 |
| T46·T48 | 내부 송전선 설치 / HVDC 연계선 건설 완료 | 이미 TECH_DATA.eureka를 읽고 있어 추가 수정 없음 |
| S10 | LNG 가격 급등 빈도: 3배 | LNG 급등이 현실보다 약 3배 자주 나와요(추정 비교값, 추첨 확률에 곱하지 않음) |
| S11 | 정전 1% 환산: 87.6시간/연 | 정전 1%를 같은 수요의 시간으로 바꾼 값: 연 87.6시간(에너지 미공급률의 등가 시간 환산이며, 실제 정전시간과 다름) |
| S14 | 민원이 지지에 미치는 영향: 50~200배 | 마을 민원을 도시 전체 만족에 반영: 지지에 미치는 영향이 현실보다 약 50~200배 커요(추정 비교값, 계산 배수 아님) |
| C30 | 분기 초(1·4·7·10월)에 1/4씩 | 지급 월 목록과 1/N을 subsidyPayMonths에서 생성. 도움말·게임 길이 안내가 subsidyText를 공유하고 ‘지급 월마다 1/N씩’ 명시 |
| G47 | A에서 B보다 발전 PM2.5 증분으로 공기가 나빠서 | A에서 B보다 시작 대비 변화로 볼 때 발전 PM2.5 증분으로 공기가 나빠서. 다른 이유에도 동일한 변화 기준 적용 |
| 이주 설명 두 곳 | 두 도시 사이의 가장 큰 차이 | 두 도시의 시작 대비 변화에서 가장 큰 차이 |

S10·S11·S14는 `speeds.items[].note`의 기존 설명을 같은 행에서 읽는다. 행 구조를 추가하지 않았다. C30은 지급 월이 분기 초인 경우에만 기존 ‘분기 초’ 표현을 쓴다.

### 전수 표의 league.js 직접 기재 27행 대조

| 행 | 현재 수치 원천·처리 |
|---|---|
| Q12 | 부분 점수 수를 Object.keys(params(wScore)).length에서 생성(6 유지) |
| C04 | 정전시간 판정·설명을 동일 G params로 연결(.005 MW·2% 유지) |
| C22 | 무더위 일수·비율은 기존 엔진 결과, 28℃는 E2에서 BG.M.hotTmax로 옮김(이 커밋은 그대로) |
| C24 | 카드 최대 수·원인 문턱·동점 자릿수를 G params로 연결 |
| C30 | subsidyPayMonths의 목록·길이 |
| C43 | GRID_SAME_*와 D-82 하루 문턱을 G params로 연결; 허용폭 설명도 같은 값 |
| T03·T04·T05 | 기존 tech params 및 BG.bmsEffectText를 사용함을 확인 |
| T06·T07·T08·T09·T10·T11 | TECH_DATA.params·카드 eff·BG.M 사용; T06·T11 공유, T07·T10 정정 |
| T14·T15 | 기존 tech params·re100PolicyWeight 사용 확인 |
| T47·T51·T59·T60 | 기존 eurekaTies·eurekaSolar·eurekaDr·re100Need 사용 확인 |
| T62·T63·T64·T65·T66·T67 | 기존 TECH_DATA 카드의 scale.v·baseline(원본 비교 자료) 사용 확인. league.js에 중복 숫자를 추가하지 않음 |

## 실행한 검사와 결과

각 파일은 저장소 루트에서 `node <파일>`로 실행했다. 브라우저 실행은 없다. 수정 전에는 원본 소스를 보존했고, 오래 걸리는 검사와 겹친 마지막 recal·sec·next·tech의 기준선은 보존한 사본에서도 따로 실행했다. 표의 수치는 그 수정 전 사본과 비교했다.

| 파일(tests/league/ 기준) | 수정 전 통과/실패 | 최종 통과/실패 |
|---|---:|---:|
| review/41-evidence-all.js | 797/0 | 797/0 |
| review/30-s7-attribution.js | 3,056/0 | 3,056/0 |
| review/32-s7-monthly.js | 12,436/0 | 12,436/0 |
| review/37-d80-grid.js | 412/0 | 412/0 |
| review/39-d80-s7.js | 67/0 | 67/0 |
| review/40-v5-s7.js | 331/0 | 331/0 |
| review/41-v5-s1.js | 124/0 | 124/0 |
| review/42-explain-model.js | 402/11 | 413/0 |
| review/33-model-explanations.js | 50/0 | 50/0 |
| review/34-model-copy.js | 174/0 | 174/0 |
| review/38-d81-buildlead.js | 176/0 | 176/0 |
| test-econ.js | 1,291,435/0 | 1,291,435/0 |
| balance.js | 826/0 | 826/0 |
| recal.js | 261/0 | 261/0 |
| sec.js | 734/0 | 734/0 |
| next.js | 580/0 | 580/0 |
| tech.js | 171/0 | 171/0 |

판정 기준의 17개 검사 모두 최종 실패 0이다.

`30·32·40-v5-s7·41-v5-s1`의 기대값 변경이 필요한 실패는 없다. 중간 실행에서 34번이 새 ‘나빠져서’ 문구와 기존 ‘공기가 나빠서’ 정규식의 불일치로 1건 실패했다. 시작 대비 변화라는 접두구를 붙이고 기존 인과 표현을 보존한 후 재실행하여 174/0을 확인했다. 검사 파일은 수정하지 않았다.

### 출력·값 불변 비교

- 12개 검사(41-evidence-all·37·40-v5-s7·41-v5-s1·33·34·38·test-econ·balance·recal·next·tech)는 전후 전체 출력이 바이트 단위로 같다.
- 30·32·39·sec는 실행시간(ms·signMs·verifyMs)과 구현 소스 해시만 제외하면 출력 전체가 같다. 이 필드 외의 차이가 남지 않음을 별도 비교했다.
- 42번은 요청한 설명 정정으로 실패 11 → 0이다.
- 보존 원본과 최종 파일을 VM에서 불러 방향·문턱·원인 정렬·동점·계통만 공급·시간 정전·r2/r3·기본 설명 등을 119,418회 비교: 차이 0. 날씨는 6도시×4계절×12씨앗=288사례(각 90일)로 같았다. 기본값이 아닌 params를 넣은 별도 17개 확인도 통과했다.
- ±0.5 바로 안팎, 정전·계통 재현 문턱, 음수·0·NaN·Infinity를 포함했다. S7 비용·서식 헬퍼의 원문 불변도 비교했다.
- `node --check ui/{league,league-core,econ-data,build}.js`를 각각 실행했고, `git diff --check`도 통과했다.

### 제외 대상과 소유 밖 변경

`review/40-d82-perday.js`는 다른 세션이 수정 중이다. 작업 전 275단언 중 1실패(274통과), 이후 304/0이었다. 기존 비교 실패는 E1의 CBAM·지원금 설명 변경을 이전 기준선의 원문과 비교한 것이었다. 검사 파일 자체가 변경되었으므로 전후 증감을 본 작업의 성과나 회귀 판정 근거로 쓰지 않는다.

검사 파일(`tests/league/next.py` D-A5, `review/40-d82-perday.js` 정전 회귀의 문구 필드 제외, `review/42-explain-model.js` C30 지급 월 목록)은 구현과 다른 Codex 세션이 지시서대로 고쳤다. 구현이 쓴 파일은 `ui/league.js·ui/league-core.js·ui/econ-data.js·ui/econ.js`와 이 보고서, `docs/QUALITY-model.md`의 이동 상태 안내다. CSS는 바꾸지 않았다. C22(28℃)를 옮기는 `ui/build.js` 변경은 총괄 Claude가 E2로 미뤘다.

## 독립 검토 뒤 총괄 Claude가 고친 것

- 지원금 기록 꼬리말: `econ.js`의 `subsidyNewsPrefix`·`subsidyPayNote(data)` 하나에서 만들고 `league-core.js` `log()`의 120자 축약이 같은 함수를 쓴다(E1 문구 변경 뒤 옛 꼬리말 상수가 남아 기록 줄이 잘리던 결함). 이 수정은 Codex가 했다.
- 도움말·로비 지원금 문장(`subsidyText`): 지급 월이 정확히 1·4·7·10월일 때만 '분기 초(1·4·7·10월)에 1/4씩', 그 밖에는 '지급 월(…월)마다 1/N씩'. 로비 '게임 길이' 안내의 첫 문장도 같은 함수에서 만든다.
- 병원 정전 시간 판정도 일반 정전 시간과 같은 `outageHourMinMW`·`outageHourShare`를 쓰는 `outageFloor` 하나로 묶었다(값 0.005·0.02 그대로).
- `ledgerRound2`·`ledgerRound3`·`outageHour*`의 note를 실제로 닿는 대상(수요·정전량·정전율·연계선 MWh, 사건 예보 범위·판매 단가, 운영 결과 정전 시간 정의)으로 고쳤다.
- `league.js` 첫 줄 가드에 `!KCP.ECON_DATA`를 넣었다(불러올 때 params를 읽으므로).
- 탠덤·CCU 연구 상세 효과 문장을 원래 식으로 되돌렸다. 카드 문구(`c.eff`, 소수 둘째 자리)를 쓰면 자료 값 1.237이 1.24로 보여 econui #23 '변경된 자료 값으로 효과 표시'가 8건 실패했다.

## 남은 일

- 이주 이유(`migrationReason`)는 '시작 대비 변화로 볼 때 정전이 잦아서'처럼 뒤쪽이 아직 수준 비교로 읽힌다. WHY_L·WHY_A를 변화 표현('더 늘어서')으로 바꾸려면 34번 검사의 정규식과 함께 고쳐야 해 이번에 하지 않았다.
- C22(28℃)는 E2에서 `BG.M.hotTmax`로 옮긴다.
- 42번 C30 변형은 [1,7] 하나뿐이고 '지급 월(…)마다' 문구 자체는 단언하지 않는다(재검토 minor, 검사 보강 후보).
- 40-d82는 news 배열 전체를 비교에서 빼므로, 정전과 무관한 news 줄의 회귀는 이 검사로 감시하지 않는다.

Codex 작업 중 원본 사본·값 비교 출력은 저장소 밖 임시 폴더 `/tmp/q8-e3b-evidence/`에 있다(휘발성). 재현용 값 비교 명령: `node /tmp/q8-e3b-evidence/compare.cjs`.
