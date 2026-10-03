# 켄텍 창의성 면접 연습실 — Claude 작업 기억

빌드 없는 정적 웹앱(바닐라 JS). 전역 객체 `KCP` 하나에 모든 공용 함수가 붙는다. 자세한 소개는 @README.md, 지금 진행 중인 작업과 다음 단계는 @docs/PROGRESS.md, 되돌리면 안 되는 결정과 근거는 @docs/DECISIONS.md 에 있다. 새 세션이나 압축 뒤에는 PROGRESS.md부터 읽고 이어서 한다. 기존 결정을 바꾸기 전에는 DECISIONS.md를 확인하고, 바꾸면 새 항목을 남긴다.

## 사용자와 일하는 방식
- 답은 한국어로, 학술적·비판적으로. 근거와 수치로 말하고, 동의만 하지 말고 한계와 개선안을 함께 제시한다.
- 사용자는 과학·생물 교사, AI 융합교육 전공, 교육공학 박사. 화면 문구는 고교생이 읽는 교육용 한국어.
- 작업이 끝나면 변경 내용·검사 결과·화면 캡처(데스크톱 1280×900, 모바일 390×844)를 함께 보고한다.
- 결과를 미리 단정하지 않는다. 검사를 돌리지 않았으면 돌리지 않았다고 말한다.

## 저장소 규칙
- 브랜치마다 초안 PR. 진행 중인 PR은 docs/PROGRESS.md의 표를 본다. 이어지는 작업은 앞 PR 브랜치 위에 쌓는다(stacked).
- 커밋 메시지는 한국어 요약 한 줄 + 본문. 모델 이름을 커밋·PR에 쓰지 않는다.
- 사용자가 확인 알림을 싫어한다. PR 감시용 주기 알림(send_later)을 따로 걸지 않는다.

## 구조와 계약(깨면 검사가 실패한다)
- 라우트: `#home`, `#y<id>`(기출 `#y2022`, 창작 `#ys-island-grid` 등), 확장 라우트(`KCP.route`).
- 이벤트(`KCP.on/emit`): `route:change`(그리기 전), `phase:change`(단계 화면 그리기 전), `prep:render`, `room:render`, `reflect:render`, `home:render`, `export:text`, `settings:change`, `storage:clear`.
- `#strip`의 id와 `position: sticky`를 유지한다. 모듈은 `offsetHeight`와 계산된 `top`만 읽는다. 문서형 화면에서는 `top`을 0으로 둔다(시멘트 게임 `#cc-mini`가 띠 바로 아래에 붙는다).
- `index.html` 로드 순서: 구글 폰트 → `styles.css`, `ext/*.css` 다섯 개 연속 → 그 뒤 게임·UI CSS. 스크립트는 `data.js, app.js, practice-data.js, g2022~g2026.js` → `games/*.js`(g2026과 ext 사이에만) → `ext/*.js` → `ui/*.js` → 마지막에 `KCP.boot()` 한 번.
- 게임별 CSS 제약: `games/s-island-grid.css`의 선택자는 모두 `.ig-`/`#ig-`로 시작. `games/s-shuttle-permit.css`는 `.sp-`/`#sp-` 접두어, CSS 변수 재정의 금지, 색 리터럴·url 금지. 다른 경로(ui/, *-scene.css)에는 이 제약이 없다.
- 공통 접근성 기준: 글자 대비 4.5 이상(첫 번째 불투명도 0.5 초과 배경 기준), 조작 44px, 390px에서 가로 스크롤 없음, 콘솔 error/warning 0, focus 윤곽 폭·모양·간격 변경 금지(셔틀은 정확히 2px solid, offset 2px).
- 창작 게임의 계산 모형은 `KCP.games[id].model`. 화면 작업에서 모형·저장 형식·판정을 바꾸지 않는다.

## 화면 시안 v2(현재 작업)
- `ui/v2.css`·`ui/v2.js`: 남색 게임 UI 토큰(화면 미디어에서만), 홈(`html.v2-home`), 큰 안내 창 `KCP.v2.dialog`, 문서형 게임의 장면 등록 `KCP.v2.skin(id, {kicker, title, render(ctx)})`.
- 섬 전력망 24시: `games/s-island-grid-scene.js`·`.css`. `html.v2-scene` + `v2-prep`(섬 전체 화면, 패널) / `v2-doc`(면접실·성찰 문서). 게임과의 계약은 `s-island-grid.js`가 내보내는 `ig:prep {root, api}`, `ig:paint {G, preview, run}` 두 이벤트뿐. 장면은 사용자가 장면에서 누른 조작만 `api.set/select`로 전달한다.
- 오마주 스킨: `ui/skin-<게임>.css` + `ui/stage-<게임>.js`. 선택자는 모두 `html.v2-skin-<id>`로 범위를 묶고, 색 토큰은 밝은·어두운 두 벌을 둔다.
- 새 스킨이나 장면을 만들 때는 스킬 `kcp-ui-skin`을, 검사는 `kcp-run-tests`를, 압축·인계 전에는 `kcp-handoff`를 따른다.

## 검사 요약
- 브라우저 검사: `tests/run.sh [이름…]` 또는 스킬 `kcp-run-tests`. 모형 검산: `for f in tests/model_*.mjs; do node "$f"; done`.
- 이 샌드박스에서는 구글 폰트 TLS 실패로 `ERR_CERT_AUTHORITY_INVALID` 콘솔 오류가 '문제'로 잡힌다. 그 줄을 뺀 나머지가 0이면 통과다. 같은 원인으로 기존부터 실패하는 단언: screens T0b-2, s-riverdeal 12.4-5, s-shuttle-permit SP-12.4-08.
- Python Playwright는 1.56.0으로 고정(설치된 chromium-1194와 맞춤). `playwright install`을 돌리지 않는다.
