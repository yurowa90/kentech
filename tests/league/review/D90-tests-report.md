# D-90 기존 검사 갱신 보고

2026-10-25 · `wip/q8-d90` · HEAD `52f4607`(D-90 `81fa187` 포함). 이 해시들은 커밋 메시지 정리로 `a8a217d`·`45b2c6f`로 바뀌었고 D-90 직전 판은 `186e182`다(검사도 186e182를 읽게 고침).
시작 시 실제 Git 루트·브랜치·미커밋 변경 없음 확인. Node v24.21.0, pnpm 11.25.0, Python 3.14.7. 정적 프로젝트이며 package.json·lockfile·Node 버전 지정 파일 없음.

지정 검사와 합류 검사 갱신을 마쳤다. 최종 Node 검사 15명령과 bots36은 모두 종료 0이다. 기존 근거값·점수·계산 구현을 바꾸지 않았다. 이 담당자의 변경은 tests/ 안의 검사·공통 하네스·본 보고서뿐이다. 다른 담당자가 수정한 ui/와 D90-screen-report.md는 보존했다. docs/ 수정, 커밋, 브라우저, 네트워크, stash, nice는 실행하지 않았다.

## 독립 기대값과 보존 범위

- `41-evidence-all.js`: DECISIONS D-89·D-90 각주, ECON-REFERENCES §19.1과 RECAL-SPEC의 해당 행을 읽고 LNG 기울기를 `0.226/(35−5)`(M, D90-R1), PV 기울기를 승인값 `0.004165`(P, D90-R2)로 고정 전사했다. sourceIds에 D90-R 식별자를 추가했다. 기존 91키의 기대값·등급·출처는 그대로이며 두 키를 더해 93키다. 새 두 출처의 대장 삭제도 검출한다.
- `44-grant.js`: 독립 재난 목록에 heavy_rain과 6도시를 포함했다. 장부 출력에서 기대값을 복사하지 않고 `Urepair=min(G−Uplan, 적격 보수비)`, `used=Uplan+Urepair`, `expired=G−used`, `netRepair=repair−Urepair`, `bonus=기타 지원금+used`로 계산한다. 금액은 장부의 소수 둘째 자리 규칙을 적용한다.
- 계획 단계 grantOf/fundingOf에는 보수비를 넣지 않는다. 폭염·호우 x=.7/1/1.3에서 새 설비8억에 대한 적격8·사용8·잔액2와 승인 결과가 동일함을 단언했다. 비재난 열대야 대응3억은 끝까지 일반 비용으로 남긴다. 한도 초과·연구 예약·연계선 예외의 기존 거절 계약도 유지했다.
- 정산은 cost.repair, fiscal.exp.repair, disasterGrant의 정확한 6키(awarded/planUsed/repairUsed/used/expired/netRepair), 세입·세출 합과 현금 항등식, 월말 소멸·다음 달 이월 없음을 확인한다. 호우 무대응12억·점검9.6억(대응1.5)·배수6.6억(대응4), 기타 지원금7억의 가상 사례도 독립 검사했다.
- `35`·`38`·`40`: 공통 `d90-public-contract.js`가 승인된 결과의 cost.repair와 현재·결과 재정보고의 exp.repair만 정확한 경로로 검사하고 제거한다. 기존 비교 fixture의 보수비는 0이며 피해 사건이 끼면 실패한다. disasterGrant가 있으면 위 6키와 독립 금액을 먼저 검사한다. 다른 이름·다른 위치의 repair는 예외가 아니다. undefined 키와 객체 공유를 보존한다.
- 35의 고정 지문 5,161키·SHA-256 `9a4825d2426c95f50f75e4c844831c23910f5da6a78a3d53eab8faa1cc43a148`, 38의 777805a 중첩 키·모든 숫자 비교, 40의 3dca4f9 결과 깊은 동일성은 유지했다. 보수0→1·별도 세출0→1·미승인 중첩 키·기존 현금 변경·팀 상태의 repair 추가를 실제로 거부했다.
- D-65: D-90 직전 `186e182`(당시 `81fa187^`)와 reduce/send/sendPlan 함수 및 league-net.js 전체를 비교해 팀→진행자 요청 생성·수신·서명 봉투가 바뀌지 않았음을 단언했다.
- `bots36.py`: debt_breakdown에 exp.repair를 별도 누적 지출로 추가하고 출력 표에도 보수 열을 붙였다. 연료·운영의 기존 분해식과 기존 요약 단언을 바꾸지 않았다. 보수 항목이 없는 옛 자료도 0으로 처리한다.

폭염 x=1·보수4억의 고정 정산 기대값은 다음과 같다.

| 계획 사례 | Uplan | Urepair | bonus(기타0) | 소멸 | 순보수 |
|---|---:|---:|---:|---:|---:|
| 미사용 | 0 | 4 | 4 | 6 | 0 |
| 태양광 | 8 | 2 | 10 | 0 | 2 |
| 선로 | 6 | 4 | 10 | 0 | 0 |
| 재난 대응 | 4 | 4 | 8 | 2 | 0 |
| 연구 | 0 | 4 | 4 | 6 | 0 |

## 합류 변경과 검사 충돌

화면 담당자의 후속 UI가 들어와 41-v5-s1의 옛 사건 카드 HTML 바이트 계약이 실패했다. D90-screen-report의 승인 폭염 도움말·총괄 최종 교부세 안내 문구만 고정 기대값으로 추가했다. 정확한 도움말 본문·aria-label·접힘 키·role을 가진 블록 하나만 정규화하며 다른 바이트는 계속 비교한다. 비재난·교부세0 카드의 바이트 계약은 유지했다. 44의 돈 칩·지도 설명도 같은 보고서의 최종 요약 문구로 갱신했다.

초기 42 변이 실행은 29/29를 검출했으나 실행 도중 다른 담당자의 league.js 수정으로 마지막 원본 바이트 보존 단언에서 종료 1이었다. 당시 내부 S1 기준도 위 HTML 계약으로 1실패였다. 최종 실행은 기준 S1/S7 실패 0, 변이 29/29, 원본 바이트 보존까지 통과했다. 기대값 완화로 이 오류를 숨기지 않았다.

## 최종 실행 결과

아래 Node 명령은 화면 후속 변경이 끝난 뒤 직렬 재실행했다. 각 명령 시작·끝과 보고서 작성 시의 ui/ JS·경제 문서 해시가 일치하며 sourceChanged=false다. DETECTED 행 안의 FAIL은 의도된 변이 탐지이며 실제 실패에 합산하지 않는다.

| 명령 | 종료 | 결과 |
|---|---:|---|
| `node tests/league/review/35-d73-d74-d79.js` | 0 | 4,704개 단언 / 실패 0; 기존 5,161키 지문 유지 |
| `node tests/league/review/38-d81-buildlead.js` | 0 | 182개 단언 / 실패 0; 변이 6/6, D-65 확인 |
| `node tests/league/review/40-d82-perday.js` | 0 | 304개 단언 / 실패 0; 변이 3/3 |
| `node tests/league/review/41-evidence-all.js` | 0 | 849개 단언 / 실패 0; 93키, 값·등급·출처 변이 279/279 |
| `node tests/league/review/44-grant.js` | 0 | 검사 206건: 통과 206 / 실패 0; 단언 실행 23859회; 변이 DETECTED 9/9 |
| `node tests/league/review/32-s7-monthly.js` | 0 | S7 monthly: 12428 assertions, 0 failures |
| `node tests/league/review/42-explain-model.js` | 0 | 415개 단언 / 실패 0 |
| `node tests/league/review/41-v5-s1.js` | 0 | S1 cards: 407 cases, 0 failures (0 API blockers) |
| `node tests/league/review/42-s1-s7-mutations.js` | 0 | 기준 S7/S1 실패 0/0; 변이 29/29; 원본 바이트 보존 |
| `node tests/league/review/43-dispfuel.js` | 0 | 통과 130 / 실패 0 |
| `node tests/league/review/45-d87-engine.js` | 0 | PASS D-87 engine contracts |
| `node tests/league/review/46-d87-ai-score.js` | 0 | 탄소·민원·계통 소비·후보 선택·숨은 사건 계약 PASS |
| `node tests/league/review/47-d87.js` | 0 | 47-d87 checks 21 fail 0 |
| `node tests/league/test-econ.js` | 0 | 시험: 1293801 통과, 0 실패 |
| `node tests/league/next.js` | 0 | checks 580 fail 0 |
| `python3 tests/league/bots36.py --node --months 36 --output-dir /tmp/q8-d90-tests-review/bots36-results` | 0 | 18,178개 단언 / 실패 0; 1회 실행 |

bots36은 2026-10-25 18:02:44 KST에 시작해 356.96초 실행했다. 1초 간격 1분 부하 관측 최댓값 9.43, 일시정지 0회로 요구한 150 미만이었다. 140에서 자식 프로세스 그룹을 정지하고 130 미만에서 재개하는 보호를 두었으나 작동할 필요가 없었다. nice는 사용하지 않았다.

54개 도시×전략의 현금 분해가 모두 끝났고, 원자료를 별도로 합산한 보수비 총액 966.6억과 분해표 합이 일치했다. 현금 항등식 최대 절대 오차는 2.05e-12억이다. debt_breakdown 뒤에 있는 12/24/36달 nothing 꼴찌·B16 독식 없음, base 6도시 지방채 초과0달, 36달 재생 평균>디젤 평균 단언까지 실행됐다. storage 36달 1위는 3/6이다. B18 묶음 효과 양수는 11/92달, 버림 감소 395.081487 MWh였다. 개별 ESS 효과0은 정보이며 별도 단언을 만들지 않았다.

bots36 시작 뒤 변경된 것은 다른 담당자의 league.js 표시 문구·대응 비용 표시, build.js 예산 설명 문자열과 이 담당자의 S1/44 기대 문구다. 봇은 league.js를 적재하지 않으며 build.js 변경은 budgetDescription의 문자열 한 곳뿐이다. 계산 엔진·AI·숫자 자료는 시작·끝 동일했다. 무거운 봇은 다시 돌리지 않았고, 최종 표시 코드를 포함한 Node 검사는 위 표처럼 모두 재실행했다.

수정 JS 7개에 node --check, bots36.py에 Python AST 파싱, git diff --check도 통과했다. 별도 가상 장부로 보수 지출1회·보수 키 없는 옛 자료 호환도 확인했다. 보호한 econ.js·league-core.js·league-ai.js·league-net.js와 docs/는 HEAD 대비 변경 없음이다.

## 재현 자료와 검증 한계

로그·실행기·해시·manifest·봇 원자료: `/tmp/q8-d90-tests-review/`. 최종 Node 결과는 `*.post.log`·`post-manifest.json`, 봇은 `bots36.final.log`·`final-manifest.json`·`bots36-results/bots36.json`·`bots36-audit.json`이다. 초기 실패 로그는 삭제하지 않았다. /tmp 자료는 임시 보관이다.

최종 ui/ JS·경제 문서 해시 목록의 집계 SHA-256: `c9a5e6a93cd8c2e37a8cf982a22ecb5e3d3342f5bab0e143734d9f8544dd4f2b`.

지정한 Node/Python 검사의 미완료 항목은 없다. 브라우저·실제 교실 연결·운영 검증은 사용자 금지 범위여서 실행하지 않았다. 로컬 검사 결과만 보고한다.
