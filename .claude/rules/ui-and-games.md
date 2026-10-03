---
paths:
  - "games/**"
  - "ui/**"
  - "ext/**"
  - "index.html"
  - "app.js"
  - "styles.css"
---
# 화면·게임 규칙 (깨면 검사가 실패한다)

- 라우트 `#home`, `#y<id>`(기출 `#y2022`, 창작 `#ys-island-grid`), 확장 라우트 `KCP.route`. 이벤트 `route:change`·`phase:change`·`prep:render`·`room:render`·`reflect:render`·`home:render`·`export:text`·`settings:change`·`storage:clear`. 처리기에서 `route:change`·`phase:change`·`storage:clear` 때는 저장하지 않는다.
- `index.html` 순서: 폰트 → styles.css → ext/*.css → games·ui CSS / data.js, app.js, practice-data.js, g2022~g2026 → games/*.js → ext/*.js → ui/*.js → `KCP.boot()` 한 번.
- `#strip`의 id와 `position: sticky`를 유지한다. 모듈은 `offsetHeight`와 계산된 `top`만 읽는다.
- CSS 접두어: ext는 `#jn- .jn- #pb- .pb- #pv- .pv- #dr- .dr-`, 창작 게임은 게임별(`ig- cc- vd- sp- rd-`), 쉼표 선택자는 한 줄에 하나. 셔틀 CSS는 변수 재정의·색 리터럴·url 금지. 스킨은 `html.v2-skin-<id>`로 범위를 묶고 밝은·어두운 두 벌.
- 접근성: 글자 대비 4.5 이상, 조작 44px, 390px 가로 스크롤 없음, 콘솔 error·warning 0, focus 윤곽 바꾸지 않기. `[hidden]`은 `display:none !important`.
- 창작 게임 계산 모형은 `KCP.games[id].model`(순수 함수). 화면 작업에서 모형·저장 형식·판정을 바꾸지 않는다. 창작 게임은 계획 확정 전 결과·질문·예시를 숨긴다.
- 사용자 입력과 저장값은 `KCP.esc`를 거쳐 innerHTML에 넣는다. 학생 입력은 브라우저 밖으로 보내지 않는다.
- 화면 문구: 고교생이 읽는 한국어, 과장·상투어 금지, '트레이드오프' 대신 '얻는 것과 잃는 것', 공식 자료는 `tag-official`·새로 만든 것은 `tag-mine`.
