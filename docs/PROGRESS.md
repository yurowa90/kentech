# 진행 상황(인계 문서)

압축이나 새 세션 뒤에는 이 문서를 먼저 읽는다. 작업 단위를 끝낼 때마다 '현재 상태'와 '다음 단계'를 고친다(스킬 `kcp-handoff`).

마지막 갱신: 2026-10-07 새벽(PR #12 push, 재보정 10차·영상 남음). 이전: 2026-10-03 저녁(클라우드 세션 → 맥 로컬 세션 인계. 경제 층 작업 중, PR #11)

## 로컬 세션 인수(2026-10-03, 맥)
- 총괄이 클라우드 세션에서 맥 로컬 세션으로 넘어왔다. 분업: 로컬 총괄 → Codex Sol·Astra 작업 → Opus 독립 검토(스킬 `/codex-orchestrate`, 에이전트 opus-reviewer·test-runner).
- 작업 브랜치: `claude/kentech-league-econ-balance`(PR #11 브랜치 `claude/kentech-league-econ` 위에 쌓음). 클라우드 세션이 #11 브랜치에 독립 검토 결과와 회귀 결과를 덧붙일 수 있어 충돌을 피하려고 분리했다. 로컬 worktree: `~/Projects/kentech-wt/econ`.
- 사용자 결정 D-58: 지금은 실제 도시명으로 작업하고 나중에 가상 이름으로 한 번에 바꾼다. 도시 이름은 자료 파일에서만 읽는다.
- 작업 설정 재구성: CLAUDE.md를 사실 위주로 줄이고, 경로별 규칙 `.claude/rules/`(화면·게임, 검사, 리그·경제), 서브에이전트 `.claude/agents/`(test-runner, opus-reviewer), 홈 스킬 `~/.claude/skills/codex-orchestrate`로 나눴다. 구조는 `.claude/README.md`.
- 로컬에서 진행 중이던 것: PR #1(기출 원문 대조)·#2(창작 게임 검토 반영)의 전체 검사(worktree `~/Projects/kentech-wt/pr1`, `pr2`)와 Opus 독립 검토. 결과는 아직 PR에 반영하지 않았다.

### 다음 단계(로컬)
1. 클라우드 세션의 마지막 push(9d72b0a: 독립 검토 결과 §7, 회귀 결과 §8, D-57)는 이 브랜치에 병합해 두었다. `docs/HANDOFF-econ.md` §7·§8부터 읽는다.
2. HANDOFF-econ.md §4 '남은 일' 순서: ① 밸런스(정전 반응, 현금 점수, 순수입, 사건 빈도) → 전략 봇 36달 결과표 ② 팀 '도시' 서랍 ③ 진행자 순위표·이주 화살표·국제 지수 띠 ④ D-57, README, PROGRESS, 회귀 14종.
3. PR #1·#2: 로컬 검사 결과와 Opus 독립 검토 결과를 확인해 PR에 코멘트하고, 확인된 결함은 Sol·Astra에게 고치게 한 뒤 다시 검토한다.
   - 로컬 결과(2026-10-03): 두 PR 모두 기본 검사 8종(regression·base·screens·routine·probe·peer·drill·integration) 문제 0, PR #2 모형 검산 5종 통과(시멘트 773·섬 92,805·은여울 1,482·셔틀 1,253·변이 3,837건). 단, 그때 tests/run.sh 기본 목록에 창작 게임 검사 6종(originals와 게임 5종)이 빠져 있어 돌지 않았다. 지금은 목록에 넣었다. PR #2는 `tests/run.sh originals s-island-grid s-cement-carbon s-variant-desk s-shuttle-permit s-riverdeal`을 다시 돌릴 것. Opus 독립 검토는 끝나기 전에 세션이 넘어갔으면 opus-reviewer로 다시 돌린다.





## 이어받을 곳(2026-10-05)
- 사용자 동의(2026-10-05 "동의할테니 다 진행해, 지금 하는 싱글·멀티 구현에 집중"): Supabase 프로젝트(yurowa90's Project, ap-southeast-1) 재개함 — ACTIVE_HEALTHY.
- 실네트워크 멀티 검사 tests/league/live.py 추가(진행자 1·팀 3, 상태 일치·새로고침 복구·자유 서술 미전송·지연). 주소·공개 키는 환경 변수 KCP_SB_URL·KCP_SB_KEY로만. **아직 실행 못 함**: 프로젝트 주소 조회가 권한 판단에서 거부됨 — 사용자가 주소를 주거나 권한을 허용하면 `KCP_SB_URL=… KCP_SB_KEY=… tests/.venv/bin/python tests/league/live.py http://127.0.0.1:9430/index.html`.
- 출력제어 표시: 계통 접속 출력제어 + 출력제어 사건을 '버린 재생 전기'로 묶고 그 달 수요 대비 %로. 검사 econui 804/0·solo 372/0·rules·e2e3·econint 0.
- 다른 해 기출 재정비·PR 병합은 리그 구현 뒤.

## 이어받을 곳(2026-10-04 저녁)
- 브랜치 claude/kentech-league-econ-balance(push, 344b0b7 이후): 밸런스 v1.4.1(B18 계통 접속 여유·출력제어·ESS 상한, 소수력 포함, 배수 0.4), 혼자 하기 저장 고침, 지방채 v1.3, 컴퓨터 AI 접속 여유 고려, 도시 서랍 접속·출력제어 표시.
- 최종 검사(v1.4.1): balance 553/0, 1-invariants 2,688,699/0, 9-grid 168/0, econui 804/0, solo 372/0(직접 3회 반복도 0), ai-check 4,909/0, rules·e2e·e2e2·e2e3·econint 0, 회귀 14종 0, 콘솔·가로 스크롤 0.
- bots36.py 13,822/0(2026-10-05 검사 장치 고침): 평균 점수 연계선 67.0 · 재생+저장 66.6 · 정책 0 65.2 · 저세율 62.9 · 디젤 61.8 · 고세율 58.3 · 무행동 35.4, 6도시 1위 재생 3·연계선 2·정책 0 1·저세율 1, 정전 모두 0%.
- 출력제어량은 여전히 작음(봄 월 0.04 MWh 수준) — 근거를 넘겨 키우지 않음. 필요하면 사용자와 '교육용 배속' 표시 방식 결정.
- PR #1·#2: 검토 반영 push·코멘트 완료, 병합은 사용자 확인 뒤. 다음 큰 일: 다른 해 기출 재정비.

## 이어받을 곳(2026-10-04 오후, 사용량 한도로 중단)
- 브랜치 claude/kentech-league-econ-balance(push됨): 밸런스 v1.2, 2차 보정(ECON-EVIDENCE·GAMES 반영), 화면 U1–U4, 혼자 하기(#league/solo), 컴퓨터 도시 AI(ui/league-ai.js), D-57 확정·D-59, README·HANDOFF-econ §9.
- 마지막 통합 검사(e1d4a79 기준): econui 804/0, ai-check 3,772/0, rules·e2e·e2e2·e2e3·econint 0, balance 534/0, test-econ 791,651/0, 회귀 screens·base·regression 0. 그 이전 전체(2e7b979): 회귀 14종 0, bots36 12,322/0(연계선 4/6 도시 1위, 지배 전략 없음).
- 남은 결함과 진행 중이던 Codex 작업(결과는 ~/.claude/codex-runs/*-<이름>/last.md, 작업 폴더에 미커밋):
  1. debtcap: v1.3 구현 합침(test-econ 792,132/0). balance.js 529/24 — 남은 24개는 B7 블록의 옛 단언(1월 지원금 ×12)이라 검사 작성자(Sol)가 v1.3로 고칠 것(구현 결함 아님, B11·B17은 통과).
  2. solosave(econ-ui 폴더): 혼자 하기 저장 누락이 간헐(solo.py 4화면 중 1회 실패) → 고친 뒤 solo.py 여러 번 반복 실행으로 확인.
  3. 그 뒤 통합 검사 전체(bots36·회귀 14종), 캡처(1280·390, 밝음·어두움) 보고, HANDOFF §9 검사 결과 기입.
- PR #1: 검토 반영 push(55dd88a), 검사 9종 0, PR 코멘트 완료 — 병합은 사용자 확인 뒤.
- PR #2: 3차 수정 push(42cecaa), 검사 19종 0. 최종 Opus 확인은 중단됨 → 다시 돌린 뒤 PR 코멘트.
- 사용자 결정: 팀 기준 칩 전송 허용(D-59). 다음 큰 일: 다른 해 기출 재정비.

## 이어받을 곳(2026-10-03 밤, 사용량 한도로 중단)
- 사용자 목표(/goal): 싱글플레이(혼자 하기 vs 컴퓨터 도시, docs/ECON-UI.md U3)와 멀티플레이 모두 완성. 실제 자료·연구로 인과 모형(단순하게), 기후·에너지 레퍼런스, 켄텍 면접 문항 연결. 끝나면 다른 해 기출 재정비.
- 밸런스 B1–B10(docs/ECON-BALANCE.md) 구현 끝(Codex gpt-6-astra) — 미커밋. node 검사: balance.js 234/0(Sol 독립 작성), test-econ 738,496/0, review 1번 2,484,102/0. startMix 0.2→0.9 수용(명세 v1.1로 고침). **브라우저 검사(rules·e2e·e2e2·e2e3·econint)·bots36·회귀 14종은 test-runner가 돌리던 중 — 결과 미확인, 다시 돌릴 것.** econint.py '예산=현금' 단언은 B7(지방채 포함)로 갱신 필요.
- 조사 문서(미커밋): docs/ECON-EVIDENCE.md(실제 자료 — 제안: β 실제 0.02·eduSpeed 5, outRel 0.006, cbamRate 0.02~0.05, fxExport 0.1, logiPort 0.05, re100 하향, gpYear 0.01 등) → 다음 단계로 Astra에게 2차 보정 맡길 것. docs/ECON-INTERVIEW.md(면접 연결·질문 은행 22개, 사용자 확인 필요: 팀 기준 칩을 진행자에 보내도 되나). docs/ECON-GAMES.md(참고 게임·기후 에너지 레퍼런스·교실 롤플레이, 11절 제안 E1–E3·B1–B2·S1–S4·A1 반영할 것).
- 다음: ① 2차 보정(EVIDENCE) ② 화면 U1·U2·U3 + 면접 장치(Sol, 독립 검사 econui.py는 다른 Sol) ③ D-57·README·회귀.
- PR #1: 결함 수정(Codex gpt-6.1-sol) 미커밋 in ~/Projects/kentech-wt/pr1(브랜치 체크아웃). 1차 수정 뒤 검사 9종 문제 0, Opus 재검토 minor 4 → 2차 수정 실행 끝(결과 ~/.claude/codex-runs/*-pr1-fix2/last.md, 미확인, 브라우저 재검사 필요). 그 뒤 커밋·push·PR 코멘트.
- PR #2: 창작 게임 검사 11종 문제 0(수정 전). 결함 14건 수정 Codex gpt-6-astra 실행 끝(~/Projects/kentech-wt/pr2 미커밋, 결과는 ~/.claude/codex-runs/*-pr2-fix/last.md) → 결과 확인·검사·재검토.
- 검토 결과 원본: ~/.claude/codex-runs/kentech-plan/review-pr1-pr2.md. 지시서: 세션 스크래치패드 briefs/(사라짐 — codex-runs/*/prompt.md에 사본).

## 이어받을 곳(2026-10-07)
- push: `claude/kentech-league-econ-balance` = cc8fd25(PR #12). 작업 브랜치(wip/*)는 모두 여기 합쳐졌다. 확정 규칙 1쪽은 `docs/LEAGUE-CANON.md`, 결정 D-64(서명·씨앗·크기)·D-65(발전안 사용자 결정 4건)·D-66(재보정 원칙).
- 들어간 것: 팀·진행자 서명(방 코드 8자리, 종류별 순번, 36달 공개 상태 약 16만 바이트), 최종 검증 남은 엔진·화면 결함, 실제 게임 대비 '지금' 묶음과 하루 전 약속, 화면 독립 검토 37건, 근거 재보정 1~9차(근거 대장 ECON-REFERENCES, 명세 ECON-RECAL-SPEC v1.0.2, 밸런스 v1.8).
- 검사(cc8fd25): node 전부 0(balance 807, test-econ 1,286,685, sec 524, recal 251/8 — 8은 H01 미구현 허용), 브라우저 rules·e2e·e2e2·e2e3·econint·econui 1,708·solo 436·peek 1,200·tech 246·next·ai-check 6,588·mocktest 0, 실제 Supabase live.py 425/0, 회귀 14종 중 13종 0(s-riverdeal은 이번에 바뀌지 않은 창작 게임에서 매번 다른 항목 1~2건 간헐 예외).
- 알려진 문제: SMR 1위 4/6(필수 B16은 통과), 저탄소 전략끼리 탄소 점수 100에 붙음(바이오매스 영토 배출 0 회계), 당진 탄소 점수 0 구간, 컴퓨터 도시 손잡이 aiLocalFuelWeight 설명과 작동 불일치·B12 세율 축별 쏠림 → 재보정 10차(wip/recal10) 진행 중.
- 다음: 재보정 10차 합치기 → 혼자 하기 12달·진행자+6팀 영상(장면 S1~S8) → 장면별 독립 재확인 → 화면 기능 핵심·보조·보류 분류표 → 큰 기능은 시안 2~3개 비교 뒤 구현(첫 대상 송전 회랑). 다른 해 기출 재정비는 그 뒤.
- 사용자 결정(10-07): 밸런스 3건 기본안대로 수정(완료), origin 커밋의 모델 이름 줄은 다시 쓰지 않음, 학습 목표 초안 유지.

## 사용자가 정한 방향(원문 요지)
1. 창작 게임을 '웹 문서와 카드 목록'에서 '실제로 조작하는 시뮬레이션 게임' 느낌으로. 게임 공간이 주인공, 상태창과 메뉴는 주변 보조.
2. 밝은 로우폴리 섬 + 짙은 남색 UI(참고: 기후 생존 도시 ecocity 화면). "약간 문명 게임같은 인터페이스와 분위기".
3. 대표 게임 하나 + 홈 화면에 먼저 시안. 데스크톱·모바일 캡처로 보고.
4. 추가 요청: "다른 게임들도 다양한 고전 게임의 적절한 그래픽 디자인을 오마주해서 사용해줘."
5. 모델·규칙·저장 데이터·판정은 바꾸지 않는다. 기존 검사가 통과해야 한다.
6. 사용자 명세의 토큰: `--ui-panel rgba(10,25,42,.94)`, `--ui-hud rgba(17,43,62,.9)`, `--ui-cyan #71dceb`, `--ui-mint #7be3b4`, `--ui-gold #ecd083`, `--ui-danger #dc7890`, 반경 14px, 모달 최대 약 760px, 배경 흐림 8~12px, 모바일 터치 44px.
7. 리그(#league): 6팀 턴제, 팀별 태블릿 실시간, 도시마다 상세 지도. 오산은 화성과 합침, 예산은 뺌. 2~6팀(평택 필수·인접), 진행자 화면에 팀별 건설 속도·광역 지도(도시 지도를 합친 한 장), 혼자 하기 도시 고르기. 강·호수는 끊기지 않고 구별되게.
8. 설계안 v0.1(STS·과학정책 교육게임)은 "게임에 반영할 만한 부분만 골라" 반영. 짓는 대학 = 에너지공학대학, 연구소 = 기후에너지데이터연구소.
9. 경제(2026-10-03): 해마다 국가 재정지원금 + 주민·산업 세금. 살기 좋을수록 주민 증가, 산업 기반·자원 수급이 좋으면 산업 발전. 지역 총량은 정해져 있고 해마다 조금 늘며 좋은 도시로 이전(기업은 이전 희망). Democracy·심시티·문명 인사이트, 경쟁형 타이쿤, 해외 수입·수출·국제 물류 약간. **1턴 = 1달.**
10. 일하는 방식: 총괄 → Sol/Astra 작업 → Opus 독립 검토. 혼자 하지 말 것. GPT 교차 검토를 원함(클라우드에서는 api.openai.com이 막혀 PR #10 GitHub 통로를 만들었으나 GitHub Models가 답을 안 줌 — 저장소 비밀값 OPENAI_API_KEY가 있으면 동작). **이후 작업은 맥 로컬 세션이 이어받는다.**
11. 답은 한국어로만(영어로 답하지 말 것), 학술적·비판적, 출처·근거 등급(O/P/M/G).

## PR 현황(yurowa90/kentech)
| PR | 브랜치 | 내용 | 상태 |
|---|---|---|---|
| #1 | claude/kentech-original-fidelity | 기출 재현 충실도 | 초안, 열림 |
| #2 | claude/kentech-creative-review | 창작 게임 5종 검토 반영 | 초안, 열림 |
| #3 | claude/kentech-ui-v2-prototype | 화면 시안 v2 + 오마주 스킨 | 초안, 열림(기준: #2 브랜치) |
| #4 | claude/kentech-ui-v2-past-exams | 기출 5종 오마주 스킨 | 초안, 열림(기준: #3 브랜치) |
| #5 | claude/kentech-ui-v2-sim-feel | 섬 장면 전력 흐름·턴 보고·재생 진행(D-47), 학생 매뉴얼, ? 힌트와 TIP(D-48·49) | 초안, 열림(기준: #4 브랜치) |
| #6 | claude/kentech-ui-v2-grid-tycoon | 건설·운영 시뮬레이션 시안 #build(D-50) | 초안, 열림(기준: #5 브랜치) |
| #9 | claude/kentech-ui-v2-league | 멀티플레이 리그 1차 #league(D-54) | 초안, 열림(기준: #6 브랜치) |
| #10 | claude/gpt-bridge | GPT 교차 검토 통로(GitHub Actions → GitHub Models/OpenAI) | 초안, 열림(기준: main, 합칠 목적 아님) |
| #12 | claude/kentech-league-econ-balance | 경제 층 마무리(밸런스 B1–B18, 근거 자료, 경제 화면, 혼자 하기·컴퓨터 도시) | 초안, 열림(기준: #11 브랜치) |
| #11 | claude/kentech-league-econ | 리그 2차(D-55)·3차(D-56)·경제 층(D-57, 작업 중) | 초안, 열림(기준: #9 브랜치) — **맥 세션이 이어받을 브랜치** |

## 현재 상태(브랜치 claude/kentech-ui-v2-prototype, 푸시 완료, PR #3)
- 커밋: 68a8b66 공통 셸·홈·섬 3D 장면 / 5ac2e18 오마주 스킨 4종·셔틀 표 캡션 수정·README / 그다음 Claude 작업 문서.
- 검사 14종 모두 기준선과 같음(폰트 인증서 오류 외 실제 문제 0, 셔틀 SP-12.4-08 4건은 기존 실패). 모형 검산 5종 통과.
- 최종 캡처 31장을 찍었다(스크래치패드 final/, 세션 종료 시 사라짐). 다시 필요하면 스킬 kcp-ui-skin의 '확인' 절대로 찍는다.
- 오마주 스킨 4종 중 셋은 하위 에이전트가 사용량 한도로 멈춘 뒤 리드가 범위·문법·전체 검사로 검증했다.

## 기출 오마주 스킨(브랜치 claude/kentech-ui-v2-past-exams, #3 위에 쌓음)
- 기출 5종 오마주 스킨(D-43): `ui/skin-2022~2026.css`, `ui/stage-2022~2026.js`. 홈 기출 카드에도 장면 미리보기.
- 리드 검토에서 고친 것: 2024 지도를 화면에서 읽기(D-44), 장면 움직임 연장(D-45), 2025 기호 대비·2023 표지 문구(D-46).
- 장면이 정답을 드러내지 않는지 확인: 2022 예시 배치, 2023 예시 계획, 2024 숨은 속성, 2025 신문 순서, 2026 최우수 기술 모두 장면이 읽지 않는다.
- 검사 14종과 모형 검산 결과는 PR 본문에 적는다.

## 섬 시뮬레이션 감각 개선(브랜치 claude/kentech-ui-v2-sim-feel, #4 위)
- 사용자가 플레이 녹화를 보고 개선 요청. 전력 흐름 애니메이션, 구간 보고 카드, 재생 진행 막대(D-47). 플레이 녹화 스크립트는 스크래치패드 play/island.py(세션 종료 시 사라짐).

## 건설 시뮬레이션 시안(브랜치 claude/kentech-ui-v2-grid-tycoon, #5 위)
- 사용자 요청: 타이쿤·심시티처럼 위치를 조정하며 더 좋은 전력 수송 찾기, 정책 결정 후 며칠·몇 달 시뮬. `#build` 새 경로(D-50). 하위 에이전트가 /home/user/kentech-build 사본에서 만들고 리드가 합침.
- 다음: 사용자 반응을 보고 창작 게임으로 정식 편입(준비실·면접실·성찰 흐름, 질문 키와 힌트 연결) 여부 결정.

## 멀티플레이 리그 시안(브랜치 claude/kentech-ui-v2-league, #6 위)
- 사용자 요청: 6팀 턴제 멀티플레이, 팀별 태블릿 실시간, 도시마다 상세 지도(오산은 화성과 합침, 예산은 처음엔 당진과 합쳤다가 크기 때문에 뺌). `#league`(D-54). 도시 지도 5개는 하위 에이전트가 캡처를 보고 만들고(스크래치패드 league/*.py, 세션 종료 시 사라짐) 리드가 검사기로 확인·합침.
- 2차(D-55): 2~6팀(평택 필수·인접), 진행자 팀 카드(축소 지도·건설 속도)와 도시 크게 보기, 혼자 하기 도시 고르기, 계절 사건 16종, 실제 경계로 합친 광역 지도(도시 지도 = 그 창), OSM 강·호수, 예산 제외. 검사: e2e(6팀 전체)·e2e2(2~6팀·보기·혼자 하기) 문제 0, 회귀 14종.
- 3차(D-56): 설계안 v0.1 취사 반영 — 현금 흐름 결과, 철거 30% 회수, 사건 예보 범위·대응 선택, 근거 등급 표시, 에너지공학대학·기후에너지데이터연구소와 연구 3종(연구 → 실증 → 도입), 배터리 초기 충전분 회계. 검사: rules(불변 조건)·e2e3·e2e·e2e2 문제 0.
- 남은 일: 실제 Supabase 프로젝트로 교실 시험(사용자 동의 후 일시 중지된 프로젝트 재개), 한전 시군구별 사용량으로 추정 도시 보정, 멀티 2(전국·광역) 지역 묶음, 비공개 입찰(필요 시), 배터리 열화·사고와 집단별 부담 표시, 보류한 연구분야(원자력·수소·탄소자원화)의 새 메커니즘.

## 경제 층(브랜치 claude/kentech-league-econ, PR #11, 푸시 완료)
- 인계 문서: **docs/HANDOFF-econ.md**(요구·설계·진행·알려진 문제·독립 검토 결과·검사 방법). 설계 docs/ECON-SPEC.md, 실제 통계·게임 메커니즘 조사 docs/ECON-DATA.md.
- 끝남: 달 턴(12·24·36), 경제 엔진 ui/econ.js·econ-data.js(재정지원금·세금·전기요금 수입·이주·기업 이전·집단 지지율·국제 지수·기업 제안), 리그 연결(현금 기준 예산, 운영 뒤 econMonth, 수요·연료 배수, 정책 요청 econ), 2025 공식 통계 시작값(검색 요약 확인 O*).
- 이 세션에서 실제로 돌린 검사: tests/league/test-econ.js 697,020개 통과 / tests/league/econint.py 71개 통과 / tests/league/review/1-invariants.js 2,330,048개 실패 0 / rules 41개·e2e·e2e2·e2e3 문제 0.
- 회귀 14종(리그 3차 커밋 94e9610 기준, 스크래치패드 run6 — 세션 종료 시 사라짐): 14종 모두 기준선과 같음(probe 포함, s-shuttle-permit real=4는 원래 있던 것). 경제 층 커밋(b0f515d 이후)으로는 회귀 14종을 돌리지 않았다.
- 알려진 문제(독립 검토, HANDOFF §7): 세율 −2·서비스 +2 지배 전략, 기업 유치가 늘 화성, 지지율 평가가 사실상 꺼짐, 전기 판매 이중 이득, fiscalNorm 배수, 정전 뒤 회복 없음, 지방채 한도 출렁임과 미작동, yearStart 중복 지급 가드 없음, E.len 무시.
- 아직 없는 화면: 팀 '도시' 서랍, 진행자 순위표·이주 화살표·국제 지수 띠.
- 로컬 중간 브랜치 claude/kentech-league-next(8256015)·claude/kentech-league-v3(94e9610)의 커밋은 모두 claude/kentech-league-econ에 들어 있다(따로 푸시하지 않음).

## 다음 단계(맥 로컬 세션)
1. `git fetch origin && git checkout claude/kentech-league-econ` → docs/HANDOFF-econ.md를 끝까지 읽는다.
2. 독립 검토의 치명·중요 항목부터 고친다(HANDOFF §7: 1 지배 전략, 2 기업 유치 순위, 3 지지율, 5 판매 이중 이득 → 6~8). 고칠 때마다 `node tests/league/test-econ.js`, `cd tests/league/review && node 1-invariants.js && node 3-policy-grid.js && node 8-offers.js`.
3. 리그 통합 확인: `python3 tests/srv.py 9430 .` 띄우고 `python3 tests/league/econint.py http://127.0.0.1:9430/index.html`, rules.py·e2e3.py·e2e2.py·e2e.py도 같은 주소로.
4. 전략 봇 36달 자동 실행 결과표(디젤 몰빵, 재생+저장, 연계선 협력, 아무것도 안 함, 세율 최저·최고) → 밸런스 확정 → D-57 보완.
5. 화면: 팀 '도시' 서랍, 진행자 순위표·이주 화살표·뉴스 띠. 캡처(데스크톱·모바일, 밝음·어두움).
6. 회귀 14종(tests/accept_*.py, tests/regression.py) 기준선 비교, README·PROGRESS 갱신, PR #11 본문 갱신.
7. 이전 PR들: 사용자 검토 의견 반영(#3 이벤트), #1이 합쳐지면 2024 장면 재확인(D-44), #2가 바뀌면 병합으로 가져오기(D-02).

## 결정
되돌리면 안 되는 결정과 근거는 `docs/DECISIONS.md`(D-01~). 새 결정은 거기에 추가한다.
