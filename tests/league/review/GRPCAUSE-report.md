# 집단 만족 원인 펼침 구현 보고

> **최종 상태(2026-10-25, 총괄 정리 — 아래 본문은 작업 순서대로 남긴 기록이며 숫자·이름이 이 절과 다르면 이 절을 따른다)**
> - 공개 상태 `econ.cities[도시]`: `groupOwn`(그 달 groupTargets 목표 항, 0 아닌 것만 소수 2자리, 민원 `complaintN`·입지 `sitingN`), `groupOwnLag`(만족 기억 적용 뒤 groupContrib의 같은 항), `hospRel`. 진행자→팀 공개 상태이며 팀→진행자 전송은 바뀌지 않음(D-65).
> - 자료: `ECON_DATA.groupOwnKeys`(엔진·공개·화면이 모두 이 목록을 읽음), `groupOwnCopy`(건수·낭독 문구, 최종 반영·현재 반영). 항목 이름은 league.js `PART_NAMES`. 처음의 `groupOwnLabels`와 구현자 검사 `grp-cause.js`는 없앴다.
> - 화면: '민원(입지 1건) 최종 반영 −10.00점 · 현재 반영 −1.52점'. 낭독 이름은 (목표 0이면 반영값의) 부호로 고르고 낭독 값에 두 숫자를 다 넣는다.
> - 함께 고친 기존 결함(작업 줄기 a6e068a에도 있음): 도시 서랍의 집단 단추를 누르면 서랍이 닫혀 원인 펼침을 볼 수 없었다. league.js 루트 클릭 처리기가 건설 도구 묶음용 `[data-group]`을 서랍 안 단추에도 적용했기 때문 → `#bd-dock [data-group]`로 좁힘. 화면 상태 저장·복원의 group도 같은 이유로 `#bd-dock`으로 좁힘.
> - 평택 석탄 1기 첫 운영(375번 칸, 입지 민원 1건): 노년·청년 민원 최종 −10 / 현재 −10(악화는 즉시 반영). 회복 중 사례에서 최종 −10 / 현재 −1.52(0.152 기억).
> - 크기(size-budget, careful 36달): 압축 156,142→156,508B(+366B), 공개 원문 +707B(검토 실측). 회귀선 158,301B·실패선 165,000B 통과.
> - 검사: 독립 48(다른 세션), 구현자 49, 독립 검토(Opus) blocker·major 0. 남은 후속: 49가 항목 이름 리터럴에 의존, rel 줄 '앞으로 반영될 변화'에 병원 지연분이 섞임(검토 minor 4), 집단 단추 클릭 회귀를 브라우저 검사에 넣기.

기준: `wip/q8-grpcause`, 작업 시작 HEAD `a6e068a`, 시작 시 미커밋 변경 없음. 2026-10-25, Node v24.21.0 / pnpm 11.25.0. 저장소에 package.json·lockfile·Node 버전 파일은 없으며 기존 Node 실행 방식을 사용했다.

## 변경 범위

- `ui/econ.js`: 기존 `groupTargets`의 `terms`·`tg` 식을 유지하고, 지연을 적용하기 전 전용 항의 표시 사본 `own`을 만든다. 초기 보정과 월별 만족 갱신에서 도시의 `groupOwn`으로 보존한다. 실제 만족·지지율·점수 계산은 이 사본을 읽지 않는다.
- `ui/econ-data.js`: `groupOwnLabels`와 `groupOwnCopy`에 임시 문구를 모았다.
- `ui/league-core.js`의 `econView`: 현재 도시의 `groupOwn`과 병원 중복 보정용 `hospRel`만 공개한다. `scoreState`·`econ.before`·과거 월 보고서는 늘리지 않았다.
- `ui/league.js`: **`groupCauseHTML` 내부만 변경**. 공통 항 뒤에 전용 항을 붙이고, 민원 건수·입지 건수를 표시한다. 음수 막대는 감점의 절댓값으로 길이를 그리고 낮은 값에 대한 meter 경고 구간을 사용한다. 숫자와 `aria-valuetext`는 부호를 유지하며 접근성 이름도 감점으로 구분한다. CSS 수정 없음.
- `tests/league/review/grp-cause.js`: 실제 엔진 → 공개 상태 → HTML 숫자 합을 검사하는 Node 회귀 검사 추가. 기존 검사 단언은 변경하지 않았다.

커밋·브라우저·네트워크·stash·nice를 사용하지 않았다. 팀→진행자 요청 형식·새 전송값(D-65), 주 행동·HUD·끝 화면 UX는 변경하지 않았다.

## 공개 필드

`econ.cities[도시].groupOwn[집단]`에 다음 목표 기여만 실린다.

| 필드 | 의미 |
| --- | --- |
| hospital | 공통 rel에서 분리한 병원 기여 + 노년의 추가 병원 감점 |
| outage | 전면 정전 감점 |
| complaint | 해당 집단의 민원 감점 |
| share | 해당 집단 민원 중 재생 설비의 소음·경관 민원 이익공유 완화 |
| save | 절전 감점 |
| unrest | 시위 감점 |
| bounds | 엔진의 0~100 자르기 보정 |
| complaintN | complaint가 표시될 때, 정리된 입력 cpList 중 complaintGroups[kind]에 그 집단이 포함된 항목 수 |
| sitingN | 위 항목 중 kind=siting의 수. 0이면 생략 |

기여는 `Math.round(value * 100) / 100`으로 반올림하며, 그 결과 0이면 생략한다. 빈 집단·빈 도시 groupOwn도 공개하지 않는다. 건수는 점수 항이 아니며 합산 대상에서 제외한다. complaintN은 build의 `issues` 문턱(합계 5점 이상)과 달리 **요청한 엔진 cpList 필터** 기준이다. 민원 점수가 5 미만인 항목도 엔진에 전달되면 이 필터에 포함된다.

`econ.cities[도시].hospRel`은 엔진에 이미 있는 지연된 공통 rel의 병원 몫이다. 소수 둘째 자리로 반올림한 값이 0이 아닐 때만 공개한다. 집단 가중치를 곱하기 전 값이며 일반적으로 음수다.

## 막대 합 계약과 병원 처리

`groupContrib`은 `advanceApproval`에서 만족 회복 기억까지 반영된 값으로 바뀐다. 따라서 공통 **목표**인 groupParts에 지연된 전용 항을 더하면 tg와 맞지 않는다. 이번 구현은 groupTargets 직후 전용 목표 항을 따로 저장한다. 지난달 만족이나 월 지지율 변화와 혼동하지 않도록 기존 목표 안내를 유지한다.

집단 가중치의 유효 합을 z라 하면 공통 항은 `parts[k] × w[k] / z`다. 병원은 다음과 같이 처리한다.

```text
화면 공통 rel = groupParts.rel × w.rel / z − hospRel × w.rel / z
화면 hospital = 엔진 terms.hospital (반올림)
```

병원 감점이 든 공통 rel을 병원 분리 전 수준으로 복원한 뒤, 엔진이 분리한 hospital을 한 번 더한다. 노년의 추가 병원 감점도 hospital 안에 포함되어 있다. 엔진 식이나 총 감점을 바꾸지 않는다. 앞으로 반영될 변화의 가중치에도 같은 z를 적용한다.

화면 점수는 최대 소수 둘째 자리로 표시한다. **부호 있는 표시 숫자 합**이 계약 대상이며 meter의 value는 감점도 길이를 볼 수 있도록 절댓값이다. `aria-valuetext`에는 부호 있는 점수를 둔다. 반올림 잔차를 bounds에 임의로 더하지 않는다.

검사 방법: VM에서 실제 monthStep의 `advanceApproval` 호출 직전 g를 복사해 원본 `g.tg`를 채집한다. 공개 상태만으로 groupCauseHTML을 실행하고 HTML의 부호 있는 점수들을 읽어 합산한다. 엔진식·기대값을 화면의 분해 함수로 재계산하지 않는다.

결과: 6도시×6집단에 대해 실제 석탄 운영, 36달 정전·병원·모든 민원 종류·절전·이익공유·시위 충격과 회복, 작은 민원 반올림, 하한 bounds, 옛 상태 호환을 검사했다. **9,750개 단언 통과, 최대 표시 합 오차 0.01593545885495473점**으로 ±0.1 이내다.

수정 전 HEAD 사본에 같은 새 회귀 검사를 실행하면 `coal/hwaseong/worker: 화면 합 54.7 != 목표 51.61087889165705`로 실패한다. 수정 전에는 별도 최소 재현도 공개 정전 전용 항 누락으로 실패했고 수정 후 통과했다.

표시용 groupOwn을 제외한 12달 엔진 상태·월 보고서 JSON의 수정 전/후 SHA-256은 모두 `b2893226f1311abf6bb7a9a2f97896316ef02dbf65c213d06bb1b7dd25b42858`이다. 기존 엔진 결과가 같은 것도 확인했다.

### 평택 석탄 1기 재현

회귀 검사에서 실제 리그 `claim → next → plan(rev 증가) → ready → run`을 사용했다. 평택 지도 278번 칸에 석탄 1기, 전선·정책 없음. build의 입지 민원은 1건이며 cpList 항목의 원점수는 6이다.

| 집단 | 공개 민원 목표 | complaintN / sitingN | 화면 전체 합 | 엔진 tg |
| --- | ---: | ---: | ---: | ---: |
| 노년 | -6 | 1 / 1 | 47.62 | 47.61629960124036 |
| 청년 | -6 | 1 / 1 | 45.2 | 45.2 |

두 집단 모두 `민원(입지 민원 1건) -6점`과 감점 막대를 출력한다. 다른 네 집단에는 입지 민원 항이 없고, 정전 목표 감점은 여섯 집단에 표시된다. 전선 없는 이 재현에서 지연된 groupContrib의 민원도 -6이다.

제보의 `-1.52 / -0.912`는 이 특정 지도·이력의 재현값이라고 주장하지 않는다. 별도의 통제한 회복 사례에서 입지 점수 6 + 경관 점수 4를 입력하면 노년 민원 목표 -10, 청년 -6에 회복 기억 `0.038 × 4 = 0.152`가 적용되어 groupContrib는 정확히 -1.52 / -0.912가 된다. 이 숫자도 단언했으며, 화면은 각각 목표 -10 / -6을 써야 tg와 합이 맞는다.

## 36달 공개 상태 크기 전·후

명령:

```sh
node tests/league/size-budget.js --json /tmp/grpcause-size-before.json
node tests/league/size-budget.js --json /tmp/grpcause-size-after.json
```

같은 `SIZE36`, south 6도시, fixed 씨앗, balanced·careful 각 36달이다. 수정 전 측정은 소스 수정 전에 적재한 엔진으로 실행했다. JSON UTF-8 바이트, 매달 운영 직후/다음 단계 중 큰 값. 압축은 실제 `compactSnapshot`의 `_cp` 봉투 전체 기준이며 별도 서명·broadcast 봉투는 포함하지 않는다.

| 판 | 36달 원문 공개 전→후 | 36달 압축 전→후 | 압축 증가 | 판 전체 압축 최대 |
| --- | ---: | ---: | ---: | ---: |
| balanced | 174,512 → 174,853B | 153,200 → 153,541B | +341B | 36달 153,541B |
| careful | 178,126 → 178,467B | 155,801 → 156,142B | +341B | 36달 156,142B |

회귀선은 **수정 전 두 판 최대 155,801 + 2,500 = 158,301B**. 수정 후 최대 156,142B는 회귀선보다 2,159B, 실패선 165,000B보다 8,858B 작다. 기존 예산 검사·회귀선 단언은 변경하지 않았다. 양쪽 실행 모두 `problems: 0`, 각 판 73개 공개 상태 왕복 일치(전/후 각각 총 146개). 바닥 증가·전송 하드선·혼자 하기 저장 검사도 통과했다. 원문 공개 JSON은 165,000B를 넘지만 이 예산은 압축 봉투를 기준으로 한다.

## 같은 누락 조사: 이번에는 목록만

`rg -n 'groupParts|groupContrib|groupOwn|causeBreakdown|lowestGroupDissatisfaction|approvalChangeCause' ui` 및 각 화면의 호출 경로를 확인했다.

| 위치 | 실제 자료와 판단 |
| --- | --- |
| 도시 서랍 `groupCauseHTML`, ui/league.js:679 | 화면에서 groupParts만으로 집단 원인 막대를 만들던 유일한 곳. 이번 수정 대상 |
| S7 `outageAttribution` :3079, `outageAttributionMonthly` :3343, `outageCardsHTML` :3580 | 정전율/계통 보충량의 조건별 분해. 집단 만족 원인을 groupParts로 그리는 곳이 아니므로 같은 누락 없음 |
| 운영 결과 `causeHTML` :1635 | report.cities[id].causes의 **도시 전체 월 지지율 변화 상위 원인**. 엔진에서 전용 항까지 포함해 계산한다. 상위 causeCount개·표시 반올림에 따른 생략은 있으나 groupParts만 읽는 누락은 아님 |
| 끝 화면 `finalCausesHTML` :1743 | 월별 causes 또는 기기 안에 저장한 causes를 누적. 정전·병원·민원 등도 원인이 상위 목록에 들면 포함된다. 전체 집단 목표 막대는 제공하지 않음. 같은 누락 없음 |
| 끝 화면 `ui/fx-end.js` html :31 | 도시 전체 지지율·주민·정전·계통·CO₂ 추이. groupParts 기반 집단 원인 분해 없음 |
| 진행자 `hostSummaryHTML` :2798, `teamCard` :2813 | 지지율 수치·평가 위험과 도시 월 변화의 why 요약. 전용 항을 배제한 집단 원인 막대는 없고, 집단별 완전 분해도 제공하지 않음 |
| 도시 서랍의 최저 집단 불만 설명 :671 | report.groups[id].lowestGroupDissatisfaction는 엔진 groupContrib 전체에서 고른 부족분. 전용 항도 선택될 수 있고 PART_NAMES에 해당 라벨도 있음. 이번 전용 막대 라벨과 표현이 다른 부분은 총괄의 문구 통일 검토 대상이며 동종 누락은 아님 |
| core groupParts 헬퍼 :484, econ.before :1443 | 직전 공통 목표만 보관하는 전달/비교용 자료. 현재 UI의 완전한 전용 항 분해에는 쓰지 않음. 이번에 과거 값까지 늘리지 않았으며, 향후 과거 집단 목표 분해를 추가한다면 별도 보존이 필요 |

따라서 **나머지 화면에서 groupParts만 쓰는 동종 누락은 추가 발견하지 못했다**. 집단별 전체 설명을 새로 제공할지는 별도 UX 범위다.

## 툴팁과 민원 적용 집단

`build.js`의 thermalToolInfo(:2747)가 `ECON_DATA.thermalFacts.siting.text`를 읽고, 배치 안내(:3461)도 같은 문구를 사용한다. 기존 문구와 새 막대는 일치한다. coal·lng·smr의 siting 민원은 마을·병원·학교 수용체의 지도 거리별로 발생하며 운전 가동률과 무관하다. 만족 효과의 집단은 실제 주민의 인과 추정이 아닌 게임 가정이다.

`complaintGroups` 전체:

| 종류 | 적용 집단 |
| --- | --- |
| siting 입지 | senior 노년, youth 청년 |
| smoke 매연 | senior 노년, youth 청년 |
| noise 소음 | farm 농축산, senior 노년 |
| view 경관 | farm 농축산, senior 노년 |
| forest 숲 훼손 | green 환경 |

입지 민원은 노년·청년 외 집단에 적용되지 않는다. 민원 전체로 보면 농축산·환경 집단에도 종류별로 적용된다. worker 직장인·business 기업 집단은 현재 민원 적용 대상이 아니다. 입지 민원은 이익공유 완화 대상도 아니다(엔진은 wind/offshore/solar의 noise/view만 완화).

## 아르곤 전달용 문구 자리

`ui/econ-data.js:19`의 `KCP.ECON_DATA.groupOwnLabels`:

| 키 | 임시 라벨 |
| --- | --- |
| complaint | 민원 |
| share | 민원 이익공유 |
| outage | 전면 정전 |
| hospital | 병원 정전 |
| save | 절전 |
| unrest | 시위 |
| bounds | 범위 보정 |

같은 파일 :20의 `groupOwnCopy`: `complaintN = 민원 {n}건`, `sitingN = 입지 민원 {n}건`, `penalty = 목표 감점(지연 반영 전)`, `contribution = 목표 기여(지연 반영 전)`. 한 집단에 걸린 민원이 모두 입지라면 `민원(입지 민원 n건)`, 혼합이면 `민원(민원 n건 · 입지 민원 m건)`, 입지가 없으면 `민원(민원 n건)` 형태다. 중복 단어·용어 강도는 문구 검토에서 조정할 자리다.

## 실행 검사와 남은 항목

모두 기존 workspace-write 샌드박스 안의 Node 실행이며 실제 브라우저는 띄우지 않았다.

| 명령 | 결과 |
| --- | --- |
| node --check ui/econ-data.js / ui/econ.js / ui/league-core.js / ui/league.js / tests/league/review/grp-cause.js | 모두 통과 |
| node tests/league/review/grp-cause.js | 9,750개 단언, 실패 0 |
| node tests/league/test-econ.js | 1,301,957 통과, 실패 0 |
| node tests/league/sec.js | **실패**: uiProtocol에서 cancelAnimationFrame 미정의로 중단(exit 1) |
| node tests/league/next.js | checks 580, fail 0 |
| node tests/league/review/33-model-explanations.js | 50 tests, 0 failures |
| node tests/league/review/34-model-copy.js | 174 tests, 0 failures(최종 렌더 변경 뒤 재실행 포함) |
| node tests/league/review/42-explain-model.js | 415 assertions, failures 0 |
| node tests/league/review/42-s1-s7-mutations.js | 최종 재실행 통과(exit 0). 기준 검사 2종 모두 실패 0, 변이 29/29 탐지, 구현 바이트 보존·임시 사본 정리 확인 |
| node tests/league/review/44-grant.js | 195건 통과, 단언 23,744회, 변이 9/9 탐지 |
| node tests/league/review/45-d87-engine.js | PASS D-87 engine contracts |
| node tests/league/size-budget.js --json ... | 전/후 모두 problems 0 |
| git diff --check | 통과 |

sec.js는 변경 전 HEAD의 ui 사본에서도 **동일한 uiProtocol → close 경로, cancelAnimationFrame 미정의**로 중단됐다. 전/후 모두 테스트 531행, VM 구현 202행의 실패이며 이번 기능 변경과 무관한 기존 하네스 문제로 확인했다. 검사를 수정하거나 이 실패를 통과로 처리하지 않았다. 그 뒤에 오는 sec.js 검사는 실행되지 않았다.

42 변이 검사의 첫 실행은 제품 소스를 병행 수정한 탓에 마지막 바이트 보존 검사에서 무효가 됐다. 변이 자체는 29개 모두 탐지했으나 통과로 세지 않았으며, 제품 소스를 고정한 뒤 전체 명령을 재실행했다. 최종 재실행은 29/29 탐지와 바이트 보존까지 확인하고 exit 0으로 끝났다. 기존 검사 단언을 수정하지 않았다.

브라우저 검증은 사용자 지시대로 **미실행·미완료**다. 총괄이 샌드박스 밖 로컬에서 도시 서랍의 실제 펼침, 음수 meter 색·길이·스크린리더 이름, 좁은 화면의 건수 문구를 확인해야 한다. 옛 저장 상태는 새 표시 필드 없이 기존 공통 막대로 그려지며 다음 경제 운영/초기 보정부터 전용 항을 얻는다. 브라우저/운영 검증 완료로 보고하지 않는다.


## 총괄 후속(2026-10-25, Claude 편집)
- 항목 이름은 새 임시 라벨(`groupOwnLabels`) 대신 기존 화면 용어 `PART_NAMES`(정전·병원 정전·민원·이익공유·절전·시위·만족도 상한·하한)를 쓰도록 바꿨다. 자료에는 순서 `groupOwnKeys`와 건수·낭독 문구 `groupOwnCopy`만 남는다.
- 건수 문구는 아르곤(gemini-4-argon-medium, 기록 `~/.claude/agy-runs/20261025-165744-q8-copy-grpcause`): `민원(입지 1건)`, `민원(3건 중 입지 1건)`, `민원(2건)`. 막대 낭독 이름은 아르곤 안 '깎일/더해질'이 이미 목표에 반영된 값을 미래 일처럼 읽히게 해 Claude가 '만족 목표에서 깎인 점수'·'만족 목표에 더해진 점수'로 고쳤다.
- 구현자가 만든 `grp-cause.js`는 독립 검사 `48-group-own.js`(다른 세션)로 대체해 지웠다. 위 본문의 그 검사 결과는 구현 당시 기록이다.

## (나) 반영 — 목표값과 이번 달 반영값 (2026-10-25, Sol)

### 바꾼 곳과 공개 필드

이번 작업의 기준은 HEAD가 아니라 위 ‘총괄 후속’까지 반영된 **시작 작업 트리**다. `GRPCAUSE-impl.md`는 현재 작업 폴더와 저장소 `.claude` 검색에서 찾지 못했으며, 이번 지시의 금지 범위를 따랐다.

- `ui/league-core.js:497~506`의 `econView`: `econ.cities[도시].groupOwnLag[집단][항]`을 추가했다. 실제 `c.groupContrib`에서 `groupOwnKeys` 일곱 항만 가져와 소수 둘째 자리로 반올림하고, 반올림 뒤 0인 항·빈 집단·빈 도시 필드는 생략한다. 건수는 기존 목표 `groupOwn`에만 둔다. report·before·scoreState는 늘리지 않는다.
- `ui/econ-data.js:20`: `groupOwnCopy.target = "목표"`, `applied = "이번 달 반영"`을 임시 문구로 추가했다(아르곤 검토 대상). 항목 이름과 건수 문구는 총괄 후속 그대로다.
- `ui/league.js:679~701`, **`groupCauseHTML` 안에서만** 목표와 반영을 함께 그린다. 예: `민원(입지 1건) 목표 -10.00점 · 이번 달 반영 -1.52점`. 두 숫자는 소수 두 자리를 고정한다. meter 길이·부호 낭독·공통 항과 합산하는 값은 목표다. 목표가 0이어도 만족 기억이 남은 항은 `목표 0.00점 · 이번 달 반영 …`으로 표시한다.
- hospital 반영값은 엔진의 같은 hospital 항을 그대로 읽는다. 기존 공통 목표 rel에서 hospRel 몫을 빼고 전용 목표 hospital을 더하는 분리는 유지한다. 반영값을 공통 목표 합에 더하지 않는다.
- `tests/league/review/49-group-own-lag.js`: 실제 엔진 → JSON 왕복 공개 상태 → 반환 HTML을 검증하는 별도 Node 검사. `48-group-own.js`는 수정하지 않았다.

시작 사본과 바이트 비교로 **econ.js 전체**, **league.js의 groupCauseHTML 바깥**, **48-group-own.js 전체**가 그대로임을 확인했다. 48 파일 SHA-256: `91e245daba19b440153783c8fb8d6d06731c5708141e5331151c00b0444da11b`. 커밋·브라우저·네트워크·stash·nice는 사용하지 않았다.

### 재사용한 설명 문장 위치

`rg -n '만족.*기억|회복.*기억|기억|groupCauseHTML' ui/league.js ui/econ-data.js` 및 `rg -n '만족.*(기억|천천히|서서히)|기억.*만족|approvalMemoryReal|eduMemory' ui`로 찾았다. 화면의 별도 ‘만족 기억’ 설명 문장은 없었고, **기존 집단 만족 계산 ‘!’**(`ui/league.js:700`, 키 `city-group-${key}`)의 다음 안내를 그대로 재사용했다.

> 만족도 목표에 들어가는 점수(집단 만족이 따라가기 전) · 옅은 글 상자: 앞으로 반영될 변화(게임 가정)

마지막 근거명은 기존 `gradeWords("G")` 렌더 결과다. 새 지연 설명을 만들거나 다른 UX로 이동시키지 않았다. 관련 기존 자료는 `econ-data.js:229`의 approvalMemoryReal 근거와 `league-core.js:520`의 `speeds.items.eduMemory`(지지율 회복 시간 배속)이며, 이번 안내에 별도로 복사하지 않았다.

### 목표 합·반영값 검증과 평택 재현

수정 전 새 검사는 `pyeongtaek/youth lag: 실제 {} / 기대 {complaint:-6}`로 실패했다. 수정 후 6도시×6집단×36달, 초기 상태, 병원·정전·민원·이익공유·절전·시위·bounds·회복을 검사했다. 목표 합은 실제 groupTargets 반환 직후 tg를 관측해 비교하고, 반영은 실제 월 운영 뒤 groupContrib와 비교한다. **목표 표시 합 최대 오차 0.027263537173858765점(±0.1), 반영 최대 오차 0.005000000000000782점(±0.01)**. 반올림 경계·0 생략·건수/other 제외·목표 0/반영 잔여·옛 상태 렌더링도 검사했다.

실제 평택 재현: 방 `REPRO48`, south 6도시, 12달 판, 각 도시 `normalStartPlans`에 평택 석탄 1기를 추가한 첫 운영. 실제 건설 가능한 칸 중 마을 수용체 입지 민원 한 건인 곳을 원점수 내림차순/칸 번호순으로 골라 **375번 칸**이 선택됐다. cpList는 siting 한 건, score 10, near 16, src coal이다. 기존 보고서의 ‘278번 칸·전선 없는 빈 계획’ 재현과는 조건이 다르다.

| 집단 | 민원 목표 | 이번 달 반영(공개·화면) | 엔진 groupContrib.complaint | 건수 |
| --- | ---: | ---: | ---: | --- |
| 노년 | -10.00 | -10.00 | -10 | 입지 1건 |
| 청년 | -10.00 | -10.00 | -10 | 입지 1건 |

이 실제 첫 달은 만족 하락이 즉시 반영돼 목표와 반영이 같다. **-1.52/-0.912를 이 재현의 결과라고 쓰지 않는다.** 별도의 회복 통제 사례는 집단 이전 만족과 기여를 0으로 놓고 siting 6 + view 4를 입력한다. 이 경우 노년 목표 -10.00 / 반영 -1.52, 청년 목표 -6.00 / 반영 -0.91(엔진 -0.912)이다. 회복 기억 0.038×4=0.152를 실제 엔진이 적용한 결과이며 이 사례도 단언했다.

### 36달 공개 상태 크기: 이번 시작 작업 트리 → 수정 후

```sh
node tests/league/size-budget.js --json /tmp/grpcause-na-size-before.json
node tests/league/size-budget.js --json /tmp/grpcause-na-size-after.json
```

같은 SIZE36·south·fixed 씨앗, balanced/careful 각 36달. 수정 전 실행은 제품 소스 수정 전에 엔진을 적재했다. JSON UTF-8, 매달 운영 직후/다음 단계 중 큰 값이며 압축은 실제 compactSnapshot `_cp` 봉투 전체다.

| 판 | 36달 공개 원문 전→후 | 36달 압축 전→후 | 압축 증가 | 수정 후 판 최대 |
| --- | ---: | ---: | ---: | ---: |
| balanced | 174,853 → 175,219B | 153,541 → 153,907B | +366B | 153,907B |
| careful | 178,467 → 178,833B | 156,142 → 156,508B | +366B | 156,508B |

이번 회귀선은 **시작 두 판 최대 156,142 + 2,500 = 158,642B**다. 수정 후 최대 156,508B는 회귀선보다 2,134B, 실패선 165,000B보다 8,492B 작다. size-budget.js의 기존 더 엄격한 회귀선 158,301B도 변경 없이 통과했다. 전/후 모두 `problems: 0`, 각 판 73개 공개 상태 JSON 왕복 일치(전/후 각 146개)이며 바닥 증가·전송 하드선·혼자 하기 저장도 통과했다.

### 재실행 검사와 남은 문제

실행 환경: 기존 workspace-write 샌드박스 안의 Node v24.21.0 / pnpm 11.25.0. 프로젝트 package.json·lockfile·Node 버전 파일은 없다. 브라우저는 사용자 지시대로 실행하지 않았다.

| 명령 | 이번 결과 |
| --- | --- |
| node --check ui/econ-data.js / ui/econ.js / ui/league-core.js / ui/league.js / tests/league/review/49-group-own-lag.js | 모두 통과 |
| node tests/league/review/49-group-own-lag.js | 31,718 단언, failures 0 |
| node tests/league/test-econ.js | 1,301,957 통과, 0 실패 |
| node tests/league/next.js | checks 580, fail 0 |
| node tests/league/review/33-model-explanations.js | 50 tests, 0 failures |
| node tests/league/review/34-model-copy.js | 174 tests, 0 failures |
| node tests/league/review/42-explain-model.js | 415 assertions, failures 0 |
| node tests/league/review/42-s1-s7-mutations.js | exit 0, 기준 검사 2종 실패 0, 변이 29/29 탐지, 원본 바이트 보존·임시 사본 정리 확인 |
| node tests/league/review/44-grant.js | 195건 통과, 23,744 단언, 변이 9/9 탐지 |
| node tests/league/review/45-d87-engine.js | PASS D-87 engine contracts |
| node tests/league/sec.js | 기존 문제로 exit 1: uiProtocol(:531) → close(VM :202)의 cancelAnimationFrame 미정의. 후속 검사는 실행되지 않음 |
| node tests/league/size-budget.js --json … | 전/후 problems 0 |
| git diff --check | 통과 |

`48-group-own.js`는 요청대로 보존하고 별도로 실행했다. **통과하지 않는다.** 시작 작업 트리 사본에서도 16,930 단언 중 823 실패(public 819건: 목표 groupOwn을 지연된 groupContrib와 비교 / 평택 재현 기대값 4건)이었다. 수정 후에는 5,554 실패다. 기존 823건 외에 새 두 숫자 줄을 단일 숫자·옛 라벨로 파싱하는 검사와 목표 0/반영 잔여 행 계약이 충돌한다. 이는 새 화면 계약에 맞춘 독립 검사가 총괄 세션에서 필요하다는 뜻이며, 이 검사를 고치거나 실패를 통과로 간주하지 않았다. 새 `49-group-own-lag.js`는 목표·반영을 각각 읽고 목표만 합산한다.

브라우저 검증은 **미실행·미완료**다. 총괄의 허용된 샌드박스 밖 로컬 경로에서 실제 도시 펼침·두 숫자 문구·음수 meter·좁은 화면·접근성을 확인해야 한다. 로컬 Node 검사 결과를 브라우저·운영 성공으로 표현하지 않는다.
