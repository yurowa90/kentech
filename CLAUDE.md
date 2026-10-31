# 켄텍 창의성 면접 연습실

KENTECH 수시 창의성 면접을 연습하는 정적 웹앱(바닐라 JS, 빌드 없음, 외부 스크립트 금지 D-31). 전역 객체 `KCP` 하나에 공용 함수가 붙는다. 기출 5종(g2022~g2026.js), 연습 도구(ext/), 창작 쟁점 게임 5종(games/), 화면 시안 v2와 건설·리그 시뮬레이션(ui/)으로 이뤄진다. 소개는 README.md.

## 지금 할 일
- 현재 과제와 다음 단계: @docs/PROGRESS.md
- 리그 경제 층 인계(설계·알려진 문제·남은 일 순서): @docs/HANDOFF-econ.md
- 결정 기록(바꾸기 전에 확인, 바꾸면 새 D-번호 추가): docs/DECISIONS.md

## 자주 쓰는 명령
- 로컬 서버: `python3 tests/srv.py 8000 .` → http://127.0.0.1:8000/
- 문법 검사: `for f in *.js ext/*.js games/*.js ui/*.js; do node --check "$f"; done`
- 브라우저 검사 전체: `tests/run.sh` (특정 검사: `tests/run.sh base drill s-riverdeal`)
- 창작 게임 모형 검산: `for f in tests/model_*.mjs; do node "$f"; done`
- 리그 엔진: `node tests/league/test-econ.js` / 리그 화면: `python3 tests/league/{rules,e2e3,econint}.py http://127.0.0.1:<포트>/index.html`
- 출력이 긴 검사는 test-runner 에이전트에게 맡기고 요약만 받는다.

## 일하는 방식
- 사용자는 과학·생물 교사, 교육공학 박사, 교과서 편집자. 답은 한국어로, 근거와 수치로, 한계와 개선안을 함께. 돌리지 않은 검사를 통과라고 쓰지 않는다.
- 분업: 총괄 세션이 범위·판정·병합·통합 검사를 맡고, 이슈 브랜치마다 작업 세션이 구현 담당 → 다른 세션의 검사 담당 → 맥락 없는 독립 검토자(opus-reviewer 에이전트)를 돌린다. 절차는 docs/DEV-WORKFLOW.md와 스킬 `/codex-orchestrate`, 운영 기록은 docs/ORCHESTRATION.md.
- 끝난 작업은 변경 내용, 검사 결과, 데스크톱 1280×900·모바일 390×844 캡처로 보고한다.

## 저장소 규칙
- 작업 흐름은 docs/DEV-WORKFLOW.md(D-92). 결함·과제는 GitHub 이슈(마일스톤 'v1.0 2022 확장판'), 이슈마다 작업 줄기 `claude/kentech-league-econ-balance`에서 `<fix|feat|refactor|test|docs|chore>/<이슈번호>-<짧은말>` 브랜치를 만들고 작업 줄기로 PR을 연다. 작업 줄기가 앞서가면 병합으로 받는다.
- 브랜치마다 총괄이 맡긴 작업 세션이 자기 브랜치에 커밋까지만 한다. 구현 담당·검사 담당·독립 검토자는 커밋하지 않는다. push·이슈·PR·리뷰 글·병합·태그는 총괄만 한다. 총괄의 인계·결정 문서(PROGRESS·ORCHESTRATION·DECISIONS) 갱신만 작업 줄기에 직접 커밋한다.
- 병합 조건: CI 통과, 같은 SHA에서 맥 로컬 브라우저 검사 통과(샌드박스 밖, 최종 판정. 그 뒤 인계 문서 직접 커밋만 들어왔으면 차이 기록으로 갈음), 독립 검토 blocker·major 0. 병합은 `gh pr merge --merge --match-head-commit <병합할 머리 SHA>`. squash·rebase 금지(D-78).
- 릴리스: 품질 8 목표와 통합 검사를 통과한 작업 줄기 커밋에 CHANGELOG를 정리하고 `vX.Y.Z-rc.N` 태그, main PR. main PR은 CI 녹색을 확인한 뒤 매번 사용자 확인을 받고 병합한다. 정식 판은 실제 태블릿 확인 뒤 CHANGELOG 절을 더한 커밋에 태그를 달고 main PR을 한 번 더 연다.
- 커밋은 한국어 한 줄 요약 + 본문, 관련 이슈 번호. 커밋·PR·이슈에 모델 이름, 채점 점수, 저장소 밖 작업 폴더의 경로를 쓰지 않는다(점수는 저장소 밖). 커밋 끝 서명 줄과 PR 끝 생성 도구 표시 줄은 붙이지 않는다. 올리기 전 저장소 밖 금칙어 목록으로 거른다. 스테이징은 파일을 명시한다.
- push·이슈·작업 줄기 대상 PR 외의 외부 동작(main 병합, GitHub 릴리스, 원격 브랜치 삭제, Supabase 재개, 외부 API, 저장소 설정, Cloudflare 배포)은 사용자 확인 뒤에 한다.
- 세부 규칙은 경로별로 `.claude/rules/`에 있다(화면·게임, 검사, 리그·경제). 압축·인계 전에는 스킬 `kcp-handoff`.
