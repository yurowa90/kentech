# rev10 검사 인계

명세: `/Users/yurosung/Projects/kentech-wt/_briefs/lanes/q8/rev10-fix/spec.md` R1~R9·REV10_COPY.
기준 HEAD: `50d0f00`. 이 작성 세션은 작업판 `ui/**`를 읽거나 수정하지 않았다.
UI 자료는 `git show HEAD:ui/<파일>`만 사용했다. 다른 세션의 UI 변경은 보존했다.
커밋·브라우저 실행 없음. 검사 기대값은 명세에서 작성했다.

| 파일 | 명세 대응 |
|---|---|
| `57-rev10.js` | R2 판정 낱말·N1·두 기준·경계, R3 공유 도시 시간/실제 HUD와 단독 build, R5 N2·미연결 6/0기·앞말·운영 사본, R6 월간/시험 전선 21→0·정책·변경 없음, R7 표시 합·혼합 부호·재현·정전 2자리·동점 보호·카드/낭독/한 줄·고정 난수 2,000건, R9 C10; N3 치환도 확인 |
| `../rev10.py` | 390×844 밝음/어두움·1280×900 밝음/어두움. R1 세 카드 직후 이름/몫/actual, R2 S6/S7 동일 판정·계산 줄, R3 ≤168h·outH, R4 배지 3개 이상/잘림/44×44/겹침/+n/N3/펼침/Esc, R5 실제 시험 뒤 선 모두 철거·운영 당시 n·다음 달 편집, R8 코치 3/8 행동 전 두 이름표. 콘솔 error/warning/pageerror 및 가로 스크롤 검사 |
| `../s7.py` | R1 중복 단서 숨김 허용 범위, R2 ±tol과 실제 Δ 구분, R5 운영 사본의 n별 안내, R7 독립 표시 목표·혼합 부호·동점 보호·표시 끝점 합 |
| `../solo.py` | R2 새 판정 문장에서도 실제 Δ 추출 |
| `../econui.py`, `../rev9.py` | R4 배지 전체 DOM 개수 상한 제거, 보이는 배지의 조상 잘림/44×44/scrollWidth 엄격 검사 |
| `30-s7-attribution.js`, `32-s7-monthly.js` | R5 미연결 n별 N2/기존 문장, R6 실제 전선 수, R7 표시 배분·끝점 합 |
| `rev10-display-contract.js` | 기존 Node 두 검사가 쓰는 명세 기반 독립 표시 기대값 |

기존 검사 검색 결과 C10의 옛 폭염 문장 전체를 고정한 단언은 없었다.
새 Node R9에서 C10 전체 문자열을 정확히 대조한다. 기존 C10 이름의 시험 기간 검사는 문구 키 C10과 다른 항목이므로 유지했다.
모든 변경 구간에는 `rev10 R<n>` 주석을 붙였다.

## 실행한 검사

- `python3 -m py_compile tests/league/rev10.py tests/league/rev9.py tests/league/s7.py tests/league/solo.py tests/league/econui.py`: 통과.
- `node --check tests/league/review/57-rev10.js` 및 수정한 `30-s7-attribution.js`, `32-s7-monthly.js`, 새 `rev10-display-contract.js`: 통과.
- `git diff --check -- tests/league`: 통과.
- Python `s7.py`의 순수 표시 계산 함수만 AST로 추출해 실행: `1.886 + 1.663 → 표시 1.9 + 1.6 = 3.5`, 동점 보호 빈 맵의 두 사례 통과. Playwright를 import하거나 실행하지 않았다.
- `node tests/league/review/57-rev10.js --head`: **assertions 35 failures 27**, 종료 1. 실패 27개에는 BLOCKED 4개 포함. rev10 전 HEAD에서 R2/R3/R5/R6/R7/R9 회귀가 잡힘을 확인한 결과이며, 작업판 구현의 통과 결과가 아니다.
- R7 난수 2,000건은 중간 실패에도 전부 실행했다. HEAD에서 정상 합 1,488건, 합 불일치 500건, 보호로 빈 맵 12건. 실패를 통과로 집계하지 않는다.
- 기존 Node 검사 원본과 수정본을 동일 HEAD UI로 비교(파일 읽기를 `git show HEAD`로 연결하는 임시 preload 사용): 원본 30번 3,074검사 실패 0, 원본 32번 12,734검사 실패 0. 수정본 30번은 rev10 R5 첫 달 안내에서 중단, 수정본 32번은 12,480검사 실패 62. 후자의 실패 문장은 N2 안내·전선 개수·새 표시 배분/합이며 기존 실패로 간주하지 않았다.

## BLOCKED 및 미실행

- HEAD Node BLOCKED 4개: `rev10Copy` 미존재에 따른 N1/N2/N3 세 항목, 저장과 HUD가 공유하는 도시 정전 시간 함수 미존재 한 항목.
- Node 화면 함수/VM 연결점/실제 사본 생성/원인 단서 호출을 사용할 수 없으면 해당 항목을 BLOCKED 실패로 센다.
- 브라우저 필수 세 카드 달(R1), 배지 셋 이상 달(R4), 선 없는 운영 뒤 요약(R5), 정전 주제(R2), 코치 3/8(R8)을 만들지 못해도 BLOCKED 실패다.
- 브라우저 검사는 사용자 지시로 실행하지 않았다. 화면 배치·실제 클릭·콘솔/스크롤 결과는 미검증이다. 구현 담당자가 허용된 샌드박스 밖 로컬 환경에서 실행해야 한다:
  `tests/.venv/bin/python tests/league/rev10.py http://127.0.0.1:<포트>/index.html`
- `+0.3 → 늘어남`은 `promiseVerdictText`에 확정된 `actual=up`을 전달하는 표시 계약으로 검사했다. 실제 `direction(+0.3)`을 up으로 바꾸지 않는다. 실제 경계는 `+0.2/−0.49 → same`, `−0.5 → down`을 따로 검사한다(명세 R2 판정 보존).
