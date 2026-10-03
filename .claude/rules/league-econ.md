---
paths:
  - "ui/econ*.js"
  - "ui/league*.js"
  - "ui/build*.js"
  - "docs/ECON-*.md"
  - "docs/HANDOFF-econ.md"
  - "tests/league/**"
---
# 리그·경제 층 규칙

- 1턴 = 1달(12·24·36턴). 경제 엔진 `ui/econ.js`, 시작값 `ui/econ-data.js`, 설계 `docs/ECON-SPEC.md`, 자료와 출처 `docs/ECON-DATA.md`.
- 숫자마다 근거 등급을 붙인다: O(공식 통계 원문), O*(공식 통계를 검색 요약으로 확인), P(논문·보고서), M(모형에서 계산), G(게임 가정).
- 도시 이름(D-58): 지금은 실제 도시명으로 작업하고, 나중에 가상 이름으로 한 번에 바꾼다. 그래서 도시 이름은 `ui/econ-data.js`·`ui/league-data.js`의 자료에서만 읽고, 로직·화면 문구·검사에 직접 적지 않는다(새로 쓰는 곳은 자료의 이름 필드를 참조).
- 화면에 실제 회사 이름을 쓰지 않는다. 지도 캡처 원본을 저장소에 넣지 않는다.
- 멀티플레이 서버는 공개(anon/publishable) 키만 쓰고 비밀 키(sb_secret_, service_role)는 거부한다. 학생 개인정보는 보내지 않는다. Supabase 재개 같은 외부 동작은 사용자 동의 뒤.
- 밸런스를 바꾸면 전략 봇 36달 결과표와 `node tests/league/test-econ.js` 불변 조건을 함께 보고한다. '현실 속도'(자료 근거)와 '수업에서 보이는 속도'(교육용 배속)를 나눠 쓰고 배속을 화면에 표시한다.
