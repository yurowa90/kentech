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
- 분업: 이 세션이 총괄 → Codex Sol·Astra가 작업 → Opus 독립 검토(opus-reviewer 에이전트). 절차는 스킬 `/codex-orchestrate`.
- 끝난 작업은 변경 내용, 검사 결과, 데스크톱 1280×900·모바일 390×844 캡처로 보고한다.

## 저장소 규칙
- 브랜치마다 초안 PR, 이어지는 작업은 앞 PR 브랜치 위에 쌓는다(stacked). 현황은 PROGRESS.md 표.
- 커밋은 한국어 한 줄 요약 + 본문. 커밋·PR에 모델 이름을 쓰지 않는다. 스테이징은 파일을 명시한다.
- push 외의 외부 동작(Supabase 재개, 외부 API, 저장소 설정)은 사용자 확인 뒤에 한다.
- 세부 규칙은 경로별로 `.claude/rules/`에 있다(화면·게임, 검사, 리그·경제). 압축·인계 전에는 스킬 `kcp-handoff`.
