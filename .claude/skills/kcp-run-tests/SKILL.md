---
name: kcp-run-tests
description: 켄텍 연습실의 브라우저 수용 검사(Playwright, 14종)와 모형 검산을 돌리고 결과를 기준선과 비교한다. 코드를 바꾼 뒤, 커밋·푸시 전, "검사 돌려줘", "테스트 통과해?" 같은 요청에 사용한다.
---

# 검사 돌리기와 판정

## 준비(처음 한 번)
- 파이썬 Playwright는 **1.56.0**으로 고정한다. 설치된 브라우저(/opt/pw-browsers, chromium-1194)와 맞추기 위해서다.
  `uv venv tests/.venv && uv pip install --python tests/.venv/bin/python playwright==1.56.0`
- `playwright install`은 돌리지 않는다.

## 모형 검산(브라우저 없음, 2분 남짓)
```bash
for f in tests/model_*.mjs; do node "$f" | tail -1; done
```
기대: 773, 92805, 1482, 1253, 3837건 통과(시멘트, 섬, 은여울강, 셔틀, 변이 순).

## 브라우저 검사
- 한 개: `cd tests && python3 srv.py 8871 .. & KCP_BASE=http://127.0.0.1:8871/index.html KCP_RESULT=/tmp/x.json .venv/bin/python accept_s-island-grid.py --cfg desktop-light`
  - `--cfg`: desktop-light, desktop-dark, mobile-light, mobile-dark. 생략하면 넷 다(검사당 4~9분).
  - `-k 이름조각`: 그 검사 함수만.
- 여러 개: `tests/run.sh regression base screens routine probe peer drill integration`(인자 없으면 이 8종만). 창작 게임 검사(`originals`, `s-island-grid`, `s-cement-carbon`, `s-variant-desk`, `s-shuttle-permit`, `s-riverdeal`)는 이름을 넣어야 돈다. 결과는 `tests/results/<이름>.txt`.
- CPU가 4개뿐이다. 다른 작업과 겹치면 2개씩 돌린다. 시간 초과로 실패하면 혼자 다시 돌려 확인한다.

## 판정
샌드박스에서는 구글 폰트 TLS가 실패해 `Failed to load resource: net::ERR_CERT_AUTHORITY_INVALID`가 매 페이지 '문제'로 잡힌다. 실제 문제만 보려면:
```bash
grep -E "FAIL|PAGEERROR|OVERFLOW|EXCEPTION|REQFAIL|CONSOLE" tests/results/X.txt | grep -v ERR_CERT_AUTHORITY_INVALID
```
비어 있으면 통과. 같은 원인으로 늘 실패하는 단언(무시): screens `T0b-2`, s-riverdeal `12.4-5`, s-shuttle-permit `SP-12.4-08`(숫자가 조금 달라질 수 있음).

기준선 문제 수(4환경 합): integration 20, base 160, regression 0, s-island-grid 188, routine 140, screens 272, probe 124, peer 104, originals 24, drill 176, s-cement-carbon 348, s-variant-desk 348, s-riverdeal 200, s-shuttle-permit 248. 문제 수가 기준선보다 늘면 실제 문제가 있다는 뜻이니 원인을 찾는다.

## 보고
검사를 돌리지 않았으면 '돌리지 않음'이라고 쓴다. 숫자는 위 기준선과 나란히 적는다.
