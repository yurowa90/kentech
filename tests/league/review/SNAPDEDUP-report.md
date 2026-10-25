# 공개 상태 중복 접기 자체 검증

기준: `wip/q8-snapdedup`, `816d9d586f3821e9e9d245c341973c36e65b8353`.
수정 전 작업 트리는 깨끗했다. macOS 제한 셸, Node v24.21.0에서 연결 없이 실행했다.
아래 결과는 구현자 자체 검사이며 독립 검토 결과를 대신하지 않는다.

## 변경과 보존 규칙

- `ui/league-net.js`에서 `econ.report.score` → `econ.score`, `econ.report.offers` → `econ.offers`를 조건부 참조로 바꾼다.
- 추가 경로는 `econ.scoreState.totals` → `econ.totals` 하나다. `ui/league-core.js`의 `econView` 반환식에서 둘 다 `E.totals`를 사용함을 확인했다.
- `previousScore`는 `econRound`에서 `monthStep` 이전 점수를 저장한다. 현재 점수와 항상 같지 않아 접지 않았다. 다른 후보는 추가하지 않았다.
- JSON 정규화 뒤 `canonical`로 깊은 값을 비교하고, `JSON.stringify`도 같을 때만 접는다. 키 순서가 다른 객체는 펼친 JSON 바이트를 지키기 위해 그대로 보낸다. 표지보다 짧은 값도 그대로 둔다.
- D-77의 배열 표지 관례를 따라 `[-2]`로 바꾼다. `_cp: 1` 봉투의 선택 필드 `_refs`는 적용 경로의 비트(1=score, 2=offers, 4=totals)다. 임의 경로를 받거나 엔진 값을 재계산하지 않는다.
- `_refs` 없는 옛 봉투는 참조를 해석하지 않는다. 원본이 우연히 `[-2]`여도 보존한다. 알 수 없는 비트·원본 누락·잘못된 표지는 거절한다. 펼칠 때 독립 JSON 사본을 만들어 다른 필드와의 변이 공유도 막는다.
- D-64 서명 코드는 변경하지 않았다. 진행자는 압축 봉투를 포함한 전체 메시지의 정규 JSON에 서명하고, 수신기는 검증한 뒤 확장한다. 팀 요청은 기존 `body` 문자열에 서명한다.
- 엔진 계산·공개 필드·기존 단언·size-budget 상수는 변경하지 않았다.

## size-budget 전후

명령: `node tests/league/size-budget.js --json /tmp/snapdedup-size-{before,after}.json`을 각각 수정 전후 실행.
두 성향 모두 같은 `SIZE36`, south 6팀, fixed 씨앗, 36달이다. 각 달 운영 직후/다음 단계 중 큰 값이며 UTF-8 바이트다.

| 성향 | 달 | 압축 전 | 압축 후 | 차이 | 바닥 전 → 후 |
|---|---:|---:|---:|---:|---:|
| balanced | 6 | 125,522 | 121,635 | -3,887 | 125,180 → 121,293 |
| balanced | 12 | 135,499 | 131,634 | -3,865 | 134,630 → 130,765 |
| balanced | 24 | 140,058 | 138,054 | -2,004 | 138,063 → 136,059 |
| balanced | 36 | 153,200 | 149,335 | -3,865 | 150,077 → 146,212 |
| careful | 6 | 120,368 | 116,480 | -3,888 | 120,022 → 116,134 |
| careful | 12 | 126,777 | 122,897 | -3,880 | 125,904 → 122,024 |
| careful | 24 | 134,719 | 132,711 | -2,008 | 132,715 → 130,707 |
| careful | 36 | 155,801 | 151,919 | -3,882 | 152,657 → 148,775 |

두 판 모두 최대는 36달이다. 최악값 151,919B로 실패선 165,000B까지 **13,081B** 여유다.
요청서의 합본 기준 156,772B와 달리 이 작업 줄기의 변경 전 최대는 155,801B였다. 합본은 여기서 측정하지 않았다.
회귀선 `REGRESS_COMPACT=158301`, 실패선 `MAX_TARGET=165000`을 유지했다. 새 회귀선은 정하지 않았다.
전후 모두 `problems: 0`. 각 146개 상태의 왕복 검사를 통과했다.
추가로 두 판의 72개 달별 행에서 `publicBytes`, `stateBytes`, `soloBytes`, `soloChars`가 전후 완전히 같음을 단언했다.

## sec.js 36달 실제 wireBytes 전후

명령: 수정 전후 `node tests/league/sec.js`. 이 검사의 성향은 **bold·careful**, 씨앗은 room이다(size-budget의 balanced·fixed와 구분).
서명 및 Broadcast 포장을 포함한다. 두 판 모두 최대 시점은 36달 review다.

| 성향 | 변경 전 | 변경 후 | 차이 |
|---|---:|---:|---:|
| bold | 155,160 | 151,318 | -3,842 |
| careful | 162,660 | 158,760 | -3,900 |

전후 모두 `checks 744 fail 0`. 진행자·팀 서명 검증과 최대 스냅숏 서명·수신도 통과했다.

## 실행 결과

| 명령 | 결과 |
|---|---|
| `node tests/league/review/50-snap-dedup.js` | 새 왕복 146개, 옛 봉투 복원 146개, 서명·경계·변이 4종 통과 |
| `node tests/league/size-budget.js --json …` | 전후 모두 두 판 36달, problems 0 |
| `node tests/league/sec.js` | 전후 모두 744/0 |
| `node tests/league/test-econ.js` | 1,291,437 통과, 0 실패 |
| `node tests/league/next.js` | 580/0 |
| `node tests/league/live_bigsnap.js` | 종료 코드 0, 12·36달 로컬/원격 크기 상한 단언 통과 |
| `node --check` 두 변경 JS, `git diff --check` | 통과 |

`live_bigsnap.js`의 실제 프레임 최대는 12달 bold 125,830B, 36달 careful 155,939B였다. 외부로 송신하지 않았다.

새 검사는 구현 전에 중복 절감 단언의 실패를 확인한 뒤 구현했다. `git show 816d9d5:ui/league-net.js`를 VM에서 실행해 실제 구형 봉투를 만든다. 매 상태에 대해 깊은 비교, 정규 JSON 바이트, 기존 확장 결과의 JSON 바이트 및 정규 JSON 전송 후의 확장 바이트를 비교한다. 입력 불변·다른 값 유지·누락/null/배열·표지 충돌·별도 사본도 검사한다.

메모리 소스 변이 4종(펼치기 생략, 다른 값도 접기, offers 접기 생략, 참조 사본 생략)은 모두 자체 단언 실패로 검출했다. 기존 검사 파일은 수정하지 않았다.

## 남은 범위

사용자 금지에 따라 브라우저·네트워크·커밋은 실행하지 않았다. 전체 실행기 `tests/run.sh`는 브라우저 검사라 실행하지 않았다. 독립 검사는 별도 세션 범위다. 새 참조를 모르는 옛 클라이언트는 신규 봉투를 복원하지 못하므로 배포 시 모든 기기의 판본을 맞춰야 한다. 새 확장기의 옛 봉투 수용은 위 검사로 확인했다.

## 판 올림

위 `_cp: 1`에 선택 필드 `_refs`를 넣는 설명은 초기 구현 기록이다. 독립 검토 major에 따라 최종 형식을 아래처럼 수정했다. 이번 작업은 기존 미커밋 구현 위에서 수행했다(macOS 제한 셸, Node v24.21.0).

- 실제 참조가 하나라도 있으면 `_cp: 2`와 `_refs`를 보낸다. 접지 않으면 `_cp: 1`을 유지하고 `_refs`를 생략한다. 접지 않은 봉투는 `816d9d5` 코덱이 만든 봉투와 JSON 바이트까지 비교한다.
- 새 확장기는 판 1·2를 받되, 판 1에 `_refs`가 있거나 판 2에 `_refs`가 없으면 `null`로 거절한다. 판 2의 잘못된 참조 비트·원본 누락·잘못된 표지도 기존 검사로 거절한다.
- `50-snap-dedup.js`에 `git show 816d9d5:ui/league-net.js`의 실제 구형 확장기를 실행하는 거절 단언을 추가했다. 수정 전에는 구형 확장기가 `report.score=[-2]` 등을 포함한 객체를 반환해 이 단언이 실패했다. 판 2 거절과 판 1 바이트 보존을 합성 입력 및 두 성향의 상태 왕복 검사에 포함했다. 메모리 변이는 기존 4종에 판 올림 생략·판/참조 결속 생략을 더했다.
- 구형 `league.js` 소스의 안내 경로도 확인했다. `onSnap`은 확장 결과가 `null`이면 `lastSnapAt`·`snapSeq`를 갱신하지 않는다. 수신 콜백은 `snapSeq`가 바뀌어야 연결 확인 안내를 해제한다. 이후 `connectionWarning`의 공개 상태 수신 공백 20초 초과 조건에서 연결 확인 안내, 30초 초과 조건에서 새로고침 문구가 붙는다. 이 경로는 소스로 확인했으며 실제 화면은 실행하지 않았다.
- `live.py:expand_snapshot`은 프레임 관찰용으로 본문과 행 배열을 읽으며 `_refs` 참조는 복원하지 않는다고 설명을 바로잡았다. 판 조건을 `(1, 2)`로 넓혔다. 소스상 `body` 사본에 최상위 `rev`와 `teams`의 계획·rev가 보존되고, 참조 대상은 경제 보고 필드에 한정되어 관찰 경로와 겹치지 않는다. Python은 `compile(..., 'exec')`로 구문만 확인했으며 import·함수 실행·실제 연결은 하지 않았다.

판 올림 후 실제 검증 결과(아래 명령 모두 종료 코드 0):

| 명령 | 결과 |
|---|---|
| `node tests/league/review/50-snap-dedup.js` | 새 상태 146개·옛 봉투 146개, 서명·경계·변이 6종 통과. 구형 확장기의 새 참조 봉투 `null` 거절 단언 통과 |
| `node tests/league/size-budget.js` | 2판 × 36달, 각 73개 왕복, `problems: 0`. 최대 balanced 149,335B·careful 151,919B |
| `node tests/league/sec.js` | `checks 744 fail 0`. 36달 실제 wireBytes 최대 bold 151,318B·careful 158,760B |
| `node tests/league/next.js` | `checks 580 fail 0` |
| `/Users/yurosung/.codex/skill-runtimes/local-python/bin/python`에서 `compile`로 `live.py` 구문 확인 | 통과. 파일 import·실행 없음 |
| `node --check ui/league-net.js`, `node --check tests/league/review/50-snap-dedup.js`, `git diff --check` | 통과 |

판 숫자는 한 자리라 판 올림 전후의 압축·전송 최대 크기는 동일하다. 실패선·회귀선도 유지했다.

금지된 `51-snap-dedup-indep.js`·`snapcompat.py`는 수정하지 않았다. 커밋·브라우저·네트워크·stash·nice는 실행하지 않았다. `tests/run.sh`와 `live.py` 실제 실행은 이번 검증 범위에서 제외했다.
