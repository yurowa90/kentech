---
name: kcp-ui-skin
description: 화면 시안 v2의 오마주 스킨·장면을 만들거나 고친다(ui/skin-*.css, ui/stage-*.js, 섬 3D 장면). 창작·기출 게임에 고전 게임 풍 그래픽을 입히거나, 홈·남색 게임 UI·큰 안내 창을 손볼 때 사용한다.
---

# 오마주 스킨과 장면

## 먼저 읽을 것
`ui/v2.js` 머리 주석(장면 등록 계약), `ui/v2.css`, 대상 게임의 JS·CSS·`tests/accept_<게임>.py`(그 게임만의 배치·대비 단언).

## 두 가지 배치
1. **장면 전체 화면형**(지금은 섬 전력망 24시만): `games/s-island-grid-scene.*`. `<html>`에 `v2-scene` + `v2-prep`/`v2-doc`. `main#phase`를 오른쪽 패널(휴대폰은 아래 시트)로 옮기고, `.brief`는 '게임 방법' 창, `#tm-tip`은 설정 패널로 옮긴다. 게임과는 `ig:prep {root, api}`, `ig:paint` 이벤트로만 연결한다.
2. **문서형 + 위쪽 장면**(시멘트·변이·셔틀·은여울강): 창 스크롤과 sticky 띠를 그대로 둔다. `KCP.v2.skin(id, {kicker, title, render(ctx)})`로 등록하면 셸이 `.brief` 앞에 `#v2-stage`를 넣고 다시 그린다.

## render(ctx) 계약
- ctx: `g`(CSS px 단위 2D 컨텍스트), `w`, `h`, `t`(초), `state`, `game`, `phase`, `thumb`(홈 카드 미리보기, 글자 없이), `reduced`, `scheme`, `model`, `root`(#phase, 읽기만).
- 반환: `{ caption(캔버스 aria-label), chips:[{label, value, tone}], animate }`.
- 게임 상태는 **읽기만** 한다. 장면에서 계획을 바꾸려면 게임이 내준 함수로만(섬의 `api.set`). 시험 전에 공개하지 않는 값(예: S2·S3 결과, 셔틀의 숨은 감속도)은 그리지 않는다.
- 예외는 셸이 잡아 장면만 숨긴다(`KCP.v2.lastError`). 상호작용 뒤 이 값이 비어 있는지 확인한다.

## CSS 규칙
- 모든 선택자를 `html.v2-skin-<id>`로 묶는다. 색 토큰은 `@media screen` 안에서 밝은·어두운 두 벌(`:root:not([data-theme="light"])` 다크 미디어, `:root[data-theme="dark"]`). `--sheet`는 두 테마에서 달라야 한다.
- `#strip`의 position·top·margin·z-index는 문서형에서 바꾸지 않는다. 게임 내부 배치(grid, width, display, overflow)도 바꾸지 않는다. 표면·테두리·글꼴·버튼만 바꾼다.
- focus 윤곽은 색만 바꾼다. 대비 4.5 이상, 조작 44px, 390px 가로 스크롤 없음, 줄인 움직임 존중.
- 게임 원본 CSS(`games/s-*.css`)에는 그 게임 검사의 접두어 규칙이 걸려 있다. 고칠 일이 있으면 접두어를 지킨다.
- 화면에 원작 게임 이름을 쓰지 않는다(README·PR에만).

## 확인
1. `node --check ui/stage-<게임>.js`
2. 그 게임 검사 + `accept_originals.py`(스킬 `kcp-run-tests`)
3. 캡처: 1280×900, 390×844, 밝은·어두운, 상태를 바꾼 뒤 한 번 더, 홈 카드 미리보기. 캡처를 직접 열어 보고 고친다.
