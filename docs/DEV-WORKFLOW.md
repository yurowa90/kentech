# 개발 흐름

2026-10-30 총괄 초안. 결정 D-92(초안 `.github/d92-draft.md`, 확인 뒤 `docs/DECISIONS.md`로 옮김)가 정하는 작업 절차다. 결함과 과제를 GitHub 이슈로 쌓고, 이슈마다 브랜치를 만들어 작업 줄기 `claude/kentech-league-econ-balance`로 PR을 연다. 병합은 병합 커밋으로만 한다(D-78 그대로). main PR은 릴리스 후보와 정식 판마다 열고, 병합 직전에 사용자 확인을 받는다. D-78의 '단계마다 main PR 하나'는 D-92가 이렇게 바꾼다(§11).

함께 읽을 문서: 저장소 규칙 요지 `CLAUDE.md`, 경로별 계약 `.claude/rules/`(화면·게임, 검사, 리그·경제), 결정 `docs/DECISIONS.md`, 총괄 운영과 화면 문구 절차 `docs/ORCHESTRATION.md`, 교실 확인 순서 `docs/CLASSROOM-CHECK-LEAGUE.md`. 이 문서와 그 문서들이 어긋나면 결정 기록(D-번호)을 따르고, 어긋난 곳은 이슈로 남긴다.

## 흐름 한눈에

```
이슈(라벨·마일스톤) → 브랜치 <종류>/<번호>-<짧은말>
→ 구현 · 검사 작성 · 독립 검토(서로 다른 세션) → 커밋
→ PR(작업 줄기 대상) → CI → 독립 검토를 PR 리뷰 글로 → 맥 로컬 브라우저 최종 확인
→ 병합 커밋 → 이슈 닫기 → 작업 줄기 통합 검사
→ 릴리스 후보(vX.Y.Z-rc.N 태그, CHANGELOG, main PR → CI 확인 → 사용자 확인 → 병합)
→ Cloudflare Pages 미리보기(올리기 전 사용자 확인) → 실제 태블릿 현장 확인
→ 정식 판 vX.Y.Z(CHANGELOG 절, 태그, main PR → 사용자 확인 → 병합)
```

## 1. 역할

| 역할 | 하는 일 | 하지 않는 일 |
|---|---|---|
| 총괄(대화 세션) | 이슈 정리, 범위·지시서, 판정, 커밋, 브랜치 push, 이슈·PR·리뷰 글·병합·태그, 맥 로컬 브라우저 최종 확인, 사용자 보고 | 큰 구현을 혼자 하기. 몇 줄짜리 수정은 하되 '총괄이 고친 부분'으로 따로 적는다 |
| 작업 세션(총괄이 브랜치 하나를 맡긴 세션) | 지시서대로 구현 담당·검사 담당·독립 검토를 돌리고 결과를 판정해 자기 브랜치에 커밋, 검사 실행(브라우저 검사는 샌드박스 밖 맥 로컬에서 §8의 부하 규칙대로), 총괄에 보고 | push, 이슈·PR·리뷰 글·병합·태그, 다른 브랜치와 작업 줄기 수정 |
| 구현 담당 | 지시서 범위 안의 코드·문서 수정, `node --check` 같은 브라우저 없는 확인 | 커밋, 브라우저 실행, 범위 밖 파일 수정 |
| 검사 담당 | 명세와 지시서만 보고 검사 작성(구현 담당과 다른 세션) | 커밋, 구현에 맞춰 기대값 베끼기 |
| 독립 검토자 | 맥락 없이 diff·명세·실행 결과로 검토(`.claude/agents/`의 읽기 전용 검토 에이전트) | 커밋, 파일 수정, 작업 쪽 설명을 그대로 믿기 |
| 검사 실행 에이전트(`test-runner`) | 긴 검사 출력을 요약 | 코드 수정 |
| 사용자(교사) | 사용자 결정, 외부 동작 허락, main 병합 확인, 교실 확인, 문구 편집의 최종 판단 | |

커밋은 총괄과 작업 세션만 한다. 저장소·이슈·PR·리뷰 글에는 이 역할 이름만 쓴다. 실제로 실행한 모델 이름은 저장소 밖 실행 기록과 사용자 보고에만 남긴다(사용자 전역 규칙과 같다).

## 2. 백로그: 이슈·라벨·마일스톤

### 무엇이 이슈가 되나
- 녹화 재확인, 독립 평가, 독립 검토에서 나온 결함. 장면과 심각도를 붙여 결함마다 하나씩.
- 사용자 요청과 사용자 결정 대기 항목.
- 교실 확인(실제 태블릿·실제 연결)에서 나온 문제.
- `docs/PROGRESS.md`·`docs/HANDOFF-econ.md`의 '알려진 문제' 가운데 고칠 계획이 선 것.
- CI·검사 기준선의 알려진 실패. 기준선의 줄은 모두 어느 이슈에 연결돼 있어야 한다(§7.2).

### 이슈 쓰는 법
양식은 `.github/ISSUE_TEMPLATE/bug.md`(결함)와 `task.md`(과제)다. 제목은 무엇이 문제인지 한국어 한 줄로 쓴다(예: "390 결과 서랍: 결과 알림이 S7 카드 첫 줄을 가림"). 본문에는 재현한 판(커밋 SHA), 화면 폭, 단계와 달(S1~S8, 몇 월), 기대와 실제, 근거(캡처·검사 이름)를 적는다.

쓰지 않는 것(공개 저장소다. 이슈·PR·리뷰 글·댓글·커밋·저장소 문서 모두 같다):
- 학생 이름·학번·학교 식별 정보, 학생이 쓴 글. 교실 기록은 기기 종류·OS 판·시각·관찰만 적는다(CLASSROOM-CHECK-LEAGUE).
- 독립 평가(채점)의 점수. 결함 내용만 옮긴다. 점수 기록은 총괄의 저장소 밖 작업 폴더에만 두고, 그 위치도 적지 않는다. 게임 안의 점수(탄소 부분점수 같은 모형 값)는 이 금지와 관계없다.
- 모델 이름(역할 이름으로 쓴다), 비밀 키, Supabase 프로젝트 주소·키.
- 저장소 밖 작업 폴더의 이름과 경로(지시서, 실행 기록, 채점 기록, 결과 원본과 캡처 보관 위치). 가리켜야 하면 '총괄 기록', '캡처는 총괄 보관'처럼만 쓴다. 이 규칙 전에 저장소에 들어간 문서·검사 파일에는 그런 경로가 남아 있다. 새로 쓰거나 고치는 줄에는 넣지 않고, 남은 줄의 정리는 따로 이슈로 한다.

### 올리기 전 거르기
GitHub에 올리는 글(이슈, PR 본문, 리뷰 글, PR 댓글, 이슈를 닫는 댓글)과 커밋 메시지·스테이징한 변경은 올리기 전에 금칙어 목록으로 거른다.
```bash
rg -n -i -f <금칙어 목록 파일> <올릴 글 파일>        # 출력이 없어야 한다
git diff --cached | rg -n -i -f <금칙어 목록 파일>    # 커밋 전, 출력이 없어야 한다
```
- 금칙어 목록 파일은 총괄의 저장소 밖 작업 폴더에 둔다. 모델 이름, 저장소 밖 작업 폴더의 이름과 경로, 채점 점수 표기를 한 줄에 하나씩 정규식으로 적는다. 저장소 안의 폴더·파일·브랜치 이름에는 걸리지 않게 쓴다. 목록 자체가 금칙어이므로 저장소에 두지 않는다(§7의 규칙 검사도 같은 까닭).
- 걸린 줄은 지우거나 역할 이름, '총괄 기록'으로 바꾼 뒤 다시 거른다.
- 학생 정보는 목록으로 거를 수 없으므로 눈으로 본다. 학생 입력이 보이는 캡처도 같다.
- 다른 담당이 쓴 글(독립 검토 보고, 검사 실행 요약)은 원문을 그대로 올리지 않는다. 게시용 사본을 만들어 고치고 거른 뒤 그 사본을 올린다. 검토자가 받은 지시서의 경로나 실행 기록 이름이 보고에 실릴 수 있기 때문이다.

### 라벨
라벨 목록과 색·설명의 원본은 첫 백로그 초안(`.github/backlog-draft.json`의 `labels`)이다. 묶음은 다음과 같다.

| 묶음 | 라벨 | 뜻 |
|---|---|---|
| 종류 | `bug` `ux` `edu` `model` `test` `infra` `docs` `chore` | 결함, 조작감·배치, 학습 고리·문구, 계산·근거, 검사, CI·배포·실제 연결, 문서, 진행 과제 |
| 심각도 | `sev:blocker` `sev:major` `sev:minor` | 수업·병합을 막음 / 핵심 흐름·판정에 영향 / 읽기·배치·문구의 작은 결함 |
| 영역 | `area:S1`~`area:S8`, `area:end`, `area:host`, `area:team`, `area:coach`, `area:econ` | 리그의 장면(S1~S8), 끝 화면, 진행자, 팀·혼자 하기, 첫 달 코치, 경제 엔진 |
| 출처 | `src:review<N>`, `src:eval<N>-<축>`, `src:integ`, `src:progress`, `src:user`, `src:lead` | N차 녹화 재확인, N회 독립 평가의 축별 결함 목록(점수는 옮기지 않음), 통합 검사, 인계 문서, 사용자, 총괄 |
| 상태 | `needs-user` `blocked` | 사용자 확인·행동이 필요 / 앞선 일이 끝나야 시작 |

- 심각도는 독립 검토자의 보고 형식(blocker/major/minor)과 같은 뜻으로 쓴다.
- 엔진 계산을 바꾸는 이슈·PR은 `model`을 달고 PR 양식의 '엔진 계산' 칸을 채운다(§4.3).
- 기출·창작 게임 이슈가 생기면 영역 라벨(예: `area:past`, `area:games`)을 그때 더한다. 접근성은 GitHub 기본 라벨 `accessibility`를 같이 쓸 수 있다.

### 마일스톤
- `v1.0 2022 확장판`: ROADMAP 1단계 완성 기준 2(전력 리그의 S1~S8과 끝 화면이 녹화 재확인에서 '잘 됨', 혼자 하기·6팀 멀티가 실제 태블릿·실제 연결에서 끝까지 돎)와 품질 8 목표(다섯 축 독립 평가, 점수는 저장소 밖)를 채우는 일. 릴리스 후보 조건(§11)에 걸리는 이슈만 넣는다.
- 2023 짝, D-88 재개처럼 다음 단계의 일은 마일스톤 밖에 둔다. 다음 마일스톤은 그 단계를 시작할 때 만든다.

### 이슈와 PR의 크기
이슈 하나에 PR 하나가 기본이다. 녹화 재확인의 작은 결함처럼 같은 화면을 함께 고쳐야 하는 것은 PR 하나로 묶고, PR 본문에 이슈마다 `Closes #n` 줄을 둔다. 독립 검토자가 한 번에 읽기 어려운 크기면 나눈다.

결정이 필요한 이슈는 `needs-user` 라벨을 달고 선택지와 근거를 이슈에 적는다. 결정이 나면 `docs/DECISIONS.md`에 D-번호를 더하고 이슈에 그 번호를 적는다.

## 3. 브랜치

기준 브랜치는 작업 줄기 `claude/kentech-league-econ-balance`다(D-78. 워크트리·지시서 경로 때문에 이름을 바꾸지 않는다). 이슈마다 작업 줄기 머리에서 새 브랜치를 만든다.

| 접두어 | 쓰는 때 | 예 |
|---|---|---|
| `fix/` | 결함 수정 | `fix/41-s7-card-overlap` |
| `feat/` | 새 기능·새 화면 | `feat/52-grant-chip` |
| `refactor/` | 동작을 바꾸지 않는 구조 정리 | `refactor/60-drawer-split` |
| `test/` | 검사만 추가·수정 | `test/63-ci-shards` |
| `docs/` | 문서만 | `docs/58-classroom-check` |
| `chore/` | CI·설정·운영 | `chore/57-ci-workflow` |

- 모양은 `<접두어>/<이슈번호>-<짧은말>`이다. 짧은말은 영어 소문자·숫자·하이픈으로 두세 낱말. 셸 명령과 워크트리 폴더 이름에 그대로 쓰기 때문이다.
- 이슈보다 먼저 시작한 일(이 문서를 만든 `chore/dev-workflow`)은 PR을 열기 전에 이슈를 만들고, push 전이면 `git branch -m`으로 이름을 맞춘다.
- 워크트리는 브랜치마다 하나씩 `~/Projects/kentech-wt/<짧은말>`에 둔다.
  ```bash
  git -C ~/Projects/kentech-wt/econ fetch origin
  git -C ~/Projects/kentech-wt/econ worktree add ~/Projects/kentech-wt/s7-card-overlap \
    -b fix/41-s7-card-overlap origin/claude/kentech-league-econ-balance
  ln -s ~/Projects/kentech-wt/econ/tests/.venv ~/Projects/kentech-wt/s7-card-overlap/tests/.venv
  ```
  검사 포트는 워크트리마다 `KCP_PORT_BASE`로 나눈다. 워크트리·포트 대장은 총괄의 저장소 밖 작업 폴더에 둔다.
- 작업 줄기가 앞서가면 작업 줄기를 브랜치로 병합해 받는다(`git merge origin/claude/kentech-league-econ-balance`). rebase와 강제 push는 하지 않는다.
- 이 규칙 전에 시작한 `lane/*`·`wip/*` 브랜치는 이슈를 만들어 연결하고 같은 브랜치에서 PR을 연다. 이름은 바꾸지 않아도 된다. 보류한 `wip/q8-d88`은 재개할 때 이슈를 만든다.

## 4. 구현

### 4.1 지시서
총괄이 이슈를 범위로 지시서를 쓴다(총괄의 저장소 밖 작업 폴더). 고쳐도 되는 파일, 지킬 계약(결정 번호), 수용 기준, 금지(커밋·외부 전송·범위 밖 수정)를 적는다. 코드를 지시서에 붙여 넣지 않는다. 구현 담당이 저장소를 직접 읽는다.

### 4.2 나누기
- 구현 담당과 검사 담당은 서로 다른 세션이다. 검사 담당은 명세와 지시서만 본다(`.claude/rules/tests.md`). 검사와 구현이 어긋나면 명세를 기준으로 판정한다.
- 브라우저는 제한 샌드박스 안에서 띄우지 않는다. 구현·검사 담당은 브라우저 없는 확인까지만 하고, 브라우저 검사는 샌드박스 밖 맥 로컬에서 돌린다. 병합 전 최종 확인은 총괄이 직접 한다(§8).
- 독립 검토자는 작업 맥락 없이 지시서·명세와 `git diff origin/claude/kentech-league-econ-balance...<브랜치>`만 받는다. 수치 주장은 다시 계산하고 화면 동작은 직접 재현한다. 관점을 나눠 둘 이상 띄울 수 있다(정확성·계약 / 과학·균형·문구).
- 몇 줄짜리 결함은 총괄이 고치고 PR '작업 분담'에 적는다. 큰 결함은 구현 담당에게 다시 맡긴다.
- 학생 화면 문구는 화면 문구 절차(`docs/ORCHESTRATION.md` §5a: 문구 지시서 → 문구 담당 → 사실 확인 → 반영 → 맞춤법 → 사용자 편집 판단)를 거친다. PR에는 문구 원문과 사용자 편집 판단의 결과를 적는다. 숫자는 코드에서 계속 자료·params로 읽는다.

### 4.3 계산이 든 파일
계산(모형·판정)이 든 파일을 세 무리로 나눈다.

| 무리 | 파일 | 화면·문구 PR에서 |
|---|---|---|
| 엔진·자료 | `ui/econ.js`, `ui/econ-data.js`, `ui/league-core.js`, `ui/league-net.js`, `ui/league-data.js`, `ui/tech-data.js`(기술 카드 계수), `ui/build-maps.js`(지도, 시간별 수요 규칙 `dem`, 예산), `ui/league-ai.js`(컴퓨터 도시 규칙) | 바꾸지 않는다. 학생 표시 문자열만 바꿔야 하면 아래 2 |
| 화면과 계산이 섞인 파일 | `ui/build.js`(급전·시험 운전·민원·미션 판정, 예: `simulate`, `complaints`, `MISSION_TARGETS`), `ui/league.js`(약속 판정 `promise*`, S7 반사실 분해 `outage*`·`gridFillMWh`, 판정 문턱 `ZERO_OUTAGE_PCT` 등, D-80·D-82·D-91) | 화면 코드는 고쳐도 된다. 계산·판정 구간을 건드렸는지 아래 3으로 보인다 |
| 창작 게임·기출 | `games/*.js`의 `KCP.games[id].model`과 저장 형식·판정, `g20xx.js`의 계산 | 바꾸지 않는다(`.claude/rules/ui-and-games.md`). 아래 4 |

1. 엔진·자료 파일 확인. 출력이 비어 있어야 한다.
   ```bash
   git diff --stat origin/claude/kentech-league-econ-balance... -- \
     ui/econ.js ui/econ-data.js ui/league-core.js ui/league-net.js ui/league-data.js \
     ui/tech-data.js ui/build-maps.js ui/league-ai.js
   ```
2. 엔진·자료 파일의 학생 표시 문자열만 바꿀 때. 계산 경로(식·조건·상수·저장·전송)는 건드리지 않는다. `ui/league-net.js`에는 학생 표시 문자열이 없으므로(한글은 주석뿐) 이 예외를 쓰지 않는다. 그 파일을 바꾸면 통신 변경으로 보고, D-64 계약 검사(Node의 `sec`·`keycheck`·`size-budget`·`chanlimit`, 맥 로컬의 `e2e`·`mocktest`·`recover`·`chanlimit`)를 PR에 적는다.
   - 필수: 바꾼 문구를 기준판 문장으로 되돌린 사본이 기준판 파일과 바이트 단위로 같다(`docs/EXPLAIN-AUDIT-model.md`의 방법). 되돌릴 짝은 PR '새 학생 문구' 표와 같은 내용을 한 줄에 `새 문구<TAB>지금 원문`으로, 소스에 적힌 그대로 담은 파일에 둔다. 파일마다 돌린다.
     ```bash
     B=$(git merge-base HEAD origin/claude/kentech-league-econ-balance)
     python3 - "$B" ui/econ.js <짝 파일> <<'EOF'
     import subprocess, sys
     base, path, pairs = sys.argv[1:]
     text = open(path, encoding="utf-8").read()
     for row in open(pairs, encoding="utf-8"):
         new, old = row.rstrip("\n").split("\t")
         if new not in text:
             sys.exit(f"새 문구를 찾지 못함: {new}")
         text = text.replace(new, old)
     orig = subprocess.run(["git", "show", f"{base}:{path}"], capture_output=True, check=True).stdout
     print("같음" if text.encode("utf-8") == orig else "다름")
     EOF
     ```
   - 보조: `test-econ`·`balance` 출력의 숫자 열이 바꾸기 전후 같다. `test-econ`은 뉴스 문장, 집단 만족 원인의 `text`, 사건 이름을 그대로 찍으므로 문구만 바꿔도 전체 출력은 달라진다. 그래서 숫자만 뽑아 비교한다. 두 검사에는 실행 시간 줄이 없다.
     ```bash
     git worktree add --detach ../_engine-base "$B"
     nums() { grep -oE -- '-?[0-9]+([.][0-9]+)?([eE][-+]?[0-9]+)?' "$1"; }
     for t in test-econ balance; do
       (cd ../_engine-base && node tests/league/$t.js) > /tmp/kcp-base-$t.txt 2>&1
       node tests/league/$t.js > /tmp/kcp-head-$t.txt 2>&1
       cmp -s <(nums /tmp/kcp-base-$t.txt) <(nums /tmp/kcp-head-$t.txt) && echo "$t 숫자 같음" || echo "$t 숫자 다름"
     done
     git worktree remove ../_engine-base
     ```
     숫자 열이 다르면 계산이 바뀐 것으로 보고 5의 모형 PR로 다룬다. 문구 안에 숫자를 새로 넣거나 뺐다면 차이가 그 숫자뿐인지 눈으로 보고 PR에 적는다.
3. 섞인 파일을 바꿀 때. `git diff origin/claude/kentech-league-econ-balance... -- ui/build.js ui/league.js`의 덩어리마다 화면 코드인지 계산·판정 구간인지를 PR '엔진 계산' 칸에 적는다. 계산·판정 구간을 건드렸으면 5의 모형 PR이다. 화면 코드만이면 2의 숫자 열 비교 결과를 적는다(`test-econ`은 `build.js`를 불러 운영 계산을 돈다). league.js 판정 계약은 Node 전체의 S6·S7 검사(review 30·32·39·40·42 등)가 맡는다. 독립 검토자는 이 구분을 diff에서 다시 확인한다.
4. 창작 게임·기출. `games/*.js`·`g20xx.js`를 바꿨으면 모형·저장 키·판정 함수에 닿는 덩어리가 없음을 PR에 적고, 모형 검산(`tests/model_*.mjs`)과 그 게임의 회귀(`tests/run.sh <게임 id>`)를 맥 로컬에서 돌린다(§8).
5. 모형·규칙을 바꾸는 PR은 `model` 라벨을 달고 결정 번호를 받는다. D-66(근거 우선, G 손잡이로만 밸런스, 의미 비틀기 금지)을 따르고, 전략 봇 36달 결과표, `test-econ` 불변 조건, 필수 밸런스 기준(B12·B16·B18·T5)을 PR에 적는다(`.claude/rules/league-econ.md`).
6. 기기 밖으로 새로 보내는 값은 결정 번호 없이 만들지 않는다(D-65와 10-20 각주).

### 4.4 함께 지킬 계약
- 외부 스크립트 금지, 빌드 없음, 전역 `KCP` 하나(D-31).
- 근거 등급과 출처 표시(D-60·D-72). 도시 이름은 자료 파일에서만 읽는다(D-58·D-86). 화면에 실제 회사 이름을 쓰지 않는다.
- 학생 입력은 브라우저 밖으로 보내지 않고 `KCP.esc`를 거쳐 넣는다. 멀티는 공개 키만 받고 비밀 키는 거부한다.
- 화면 접근성(`.claude/rules/ui-and-games.md`): 글자 대비 4.5 이상, 조작 44px, 390px 가로 스크롤 0, 콘솔 error·warning 0.

## 5. 커밋

- 한국어 한 줄 요약, 빈 줄, 본문. 요약에는 무엇이 달라졌는지, 본문에는 왜·어떻게·무엇으로 확인했는지와 관련 이슈 번호를 쓴다.
- 스테이징은 파일 이름을 적어서 한다(`git add ui/league.js tests/league/rev14.py`). `git add .`와 `-A`는 쓰지 않는다. 커밋 전에 `git status`와 `git diff --cached --stat`으로 남의 변경이 섞이지 않았는지 본다.
- 제목과 본문에 모델 이름, 채점 점수, 저장소 밖 작업 폴더의 경로를 쓰지 않는다. 커밋 전에 메시지와 스테이징한 변경을 §2 '올리기 전 거르기'로 거른다.
- 커밋 끝의 세션 서명 줄(공동 작성자 줄, 세션 주소 줄)은 붙이지 않는다. 이 줄에는 모델 이름이 들어가고, 프로젝트 규칙 '커밋·PR에 모델 이름을 쓰지 않는다'가 서명 지침보다 앞선다. 지금까지의 커밋 다수에 이 줄이 있지만, 10-07 사용자 결정은 이미 올린 커밋을 다시 쓰지 않는다는 것이지 앞으로 붙이라는 허락이 아니다. 사용자가 따로 허락하면 그때만 붙이고, 그 허락을 결정 번호로 남긴다.
- 검사 기대값을 바꾸는 커밋은 본문에 명세 근거(결정 번호·절)를 적는다.
- 커밋은 총괄 또는 그 브랜치를 맡은 작업 세션이 한다(§1). 구현 담당·검사 담당·독립 검토자는 커밋하지 않는다.
- 올린 커밋은 다시 쓰지 않는다. amend 뒤 강제 push와 rebase를 하지 않는다.

```
S7 카드: 390에서 결과 알림이 첫 줄을 가리지 않게

결과 알림을 서랍 본문 밖 위쪽 띠로 옮겼다. 390·1024·1280에서
1~5월 프레임마다 가림이 없다. 엔진 계산 파일은 바꾸지 않았다.

검사: tests/league/rev14.py (맥 로컬, 결과는 PR 댓글)
Refs #41
```

## 6. PR

### 6.1 열기
총괄이 브랜치를 push하고 작업 줄기 대상 PR을 초안으로 연다.
```bash
git push -u origin fix/41-s7-card-overlap
gh pr create --repo yurowa90/kentech --base claude/kentech-league-econ-balance \
  --head fix/41-s7-card-overlap --draft \
  --title "S7 카드: 390 결과 알림 가림 고침" --body-file <본문 파일>
```
- 본문은 `.github/pull_request_template.md`를 따른다. 해당 없는 칸은 지우지 말고 '해당 없음'으로 둔다. 올리기 전에 §2 '올리기 전 거르기'를 거친다. PR 끝의 생성 도구 표시 줄은 붙이지 않는다(§5의 서명 줄과 같은 규칙).
- CI와 독립 검토가 끝나면 `gh pr ready <번호>`로 초안을 푼다.
- `Closes #n`: 기준 브랜치가 기본 브랜치(main)가 아닌 PR에서는 이 줄이 병합 때 이슈를 자동으로 닫지 않는다(GitHub 문서 기준, 첫 PR에서 실제 동작을 확인한다). 연결 표시로 두고, 병합 뒤 총괄이 이슈를 닫는다(§9).
- 화면이 바뀐 PR은 데스크톱 1280×900과 모바일 390×844 캡처를 붙인다. 색·대비를 바꿨으면 밝음·어두움을 둘 다 붙인다. 학생 입력이 보이는 화면은 쓰지 않는다. `gh`는 그림을 올리지 못하므로 웹 화면에서 끌어다 붙인다. 붙이지 못하면 '캡처는 총괄 보관'과 무엇을 보이는지만 적고, 보관 위치는 적지 않는다. 공개 저장소라 PR에 붙인 그림은 누구나 볼 수 있다.

### 6.2 독립 검토를 PR 리뷰로
독립 검토자의 보고를 총괄이 PR 리뷰 글로 남긴다. 같은 계정이 연 PR에는 승인·변경 요청을 할 수 없으므로 댓글 리뷰로 남기고 첫 줄에 판정을 쓴다.
1. 보고 원문을 게시용 사본으로 옮긴다. 저장소 밖 경로, 실행한 모델 이름, 채점 점수, 학생 정보가 있으면 지우거나 '총괄 기록'으로 바꾼다. 판정과 발견 내용은 바꾸지 않는다.
2. 사본을 §2 '올리기 전 거르기'로 거른다. 출력이 없어야 한다.
3. 사본을 올린다.
   ```bash
   gh pr review <번호> --repo yurowa90/kentech --comment --body-file <게시용 사본>
   ```
- 보고 형식: 발견마다 `심각도(blocker/major/minor) · 파일:줄 · 문제 · 근거(재현 절차나 계산) · 수정안`. 확인하지 못한 범위를 따로 적고, 끝에 '합쳐도 됨' 또는 '고친 뒤 다시'를 한 문단으로 쓴다.
- 글쓴이는 '독립 검토자'로 적는다.
- 고친 뒤에는 고친 커밋을 다시 검토해 새 리뷰 글로 남긴다. blocker·major가 0이 될 때까지 병합하지 않는다. 남긴 minor는 이슈로 만든다.

## 7. CI (GitHub Actions)

CI는 작업 줄기와 main을 대상으로 한 PR마다, 그리고 수동 실행으로 돈다. 워크플로는 `.github/workflows/ci.yml`, 실행기·판정기·목록은 `tests/ci/`(사용법 `tests/ci/README.md`)다. 공개 저장소의 표준 실행기는 요금이 들지 않는다는 것이 GitHub 안내이며, 요금 정책이 바뀌었는지는 워크플로를 처음 켜기 전에 다시 확인한다.

작업 줄기에 push될 때는 따로 돌지 않는다. PR은 작업 줄기 머리를 포함하거나, 포함하지 않은 쪽이 인계 문서 직접 커밋뿐일 때만 병합하므로(§9의 4), 병합 결과의 코드는 PR에서 검사한 것과 같다. 인계 문서 직접 커밋(§9 끝)은 CI 밖이다.

### 7.1 환경과 작업
- 실행기: 문법·Node 작업은 ubuntu, 리그 브라우저 작업은 macOS(`macos-15`). Node 24.21.0(맥 로컬과 같은 판), Python 3.14(맥 로컬 `tests/.venv`는 3.14.7, 끝자리 판은 실행기 이미지가 고른다)와 `tests/ci/requirements.txt`(Playwright 1.63.0과 그 의존 패키지, 맥 로컬과 같은 판). 모든 묶음에 Chromium, `webkit` 검사가 든 묶음에만 WebKit을 설치한다.
- 글꼴: 브라우저 검사 대부분은 Google Fonts CSS를 빈 응답으로 막아 운영체제의 대체 글꼴로 그린다. 리눅스에서는 `fonts-noto-cjk`를 깔아도 한글 폭·기본 줄 높이가 맥(Apple SD Gothic Neo)과 달라 CI 첫 실행에서 화면 측정 검사 8종이 리눅스에서만 실패했다. 애플 글꼴은 리눅스에 재배포할 수 없어 브라우저 작업을 macOS로 옮겼다(근거와 되돌리는 방법은 `tests/ci/README.md` '최종 판정은 맥 로컬'). 연결된 기기가 내려받는 배포 글꼴(IBM Plex Sans KR 등)로 재는 검사는 아직 없다.
- 권한은 `contents: read`, 비밀값은 쓰지 않는다. 실제 Supabase에 붙는 검사(`tests/league/live.py` 등)와 외부 API는 CI에서 돌리지 않는다.

| 작업 | 내용 |
|---|---|
| 문법 | `for f in *.js ext/*.js games/*.js ui/*.js; do node --check "$f"; done`와 `tests/ci/node-all.sh --check`(Node 목록과 파일 대조) |
| 브라우저 목록 확인 | `tests/ci/browser.sh --shards`가 `suites.txt`의 칸·중복·기준 수치 누락을 확인하고 샤드 번호 목록을 만든다. 리그 브라우저 작업의 묶음이 이것이다 |
| Node 전체 | `tests/ci/node-all.sh`가 `tests/ci/node-suites.txt`의 검사 전체(`ignore` 묶음 제외)를 두 묶음(heavy·rest)으로. 목록에 있는데 파일이 없거나, `tests/league/*.js`·`tests/league/review/[0-9]*.js`인데 목록에 없으면 실패다 |
| 리그 브라우저 | `tests/ci/browser.sh`가 `tests/ci/suites.txt`의 목록(10-30 통합 검사 18의 31종에 `rev14`·`rev14b`·`rev15`를 더한 34종에서 맥 전용 `fx_map`을 뺀 것)을 여덟 묶음으로 동시에. 묶음 목록은 `suites.txt`의 샤드 번호에서 만든다. 리그 브라우저 검사 전부가 아니다. 목록 밖 16종은 §8 |
| 최종 판정 | 앞의 작업(문법, 브라우저 목록 확인, Node 전체, 리그 브라우저)이 모두 성공이어야 성공. 취소·건너뜀도 실패로 본다 |

묶음 배분과 예상 시간은 `tests/ci/suites.txt`와 `tests/ci/README.md`의 표가 원본이다. 새 리그 브라우저 검사를 만들면 그 목록에 넣는다. 검사 결과(`tests/results/`와 캡처)는 워크플로 결과물로 남는다(14일).

지금 CI에 없는 것: 회귀 20종(`tests/run.sh`), 모형 검산(`tests/model_*.mjs`), `suites.txt` 밖의 리그 브라우저 16종(§8), 규칙 검사(비밀 키 모양, §2의 금칙어). 회귀·모형 검산·목록 밖 리그 검사는 맥 로컬에서 돌리고(§8), CI에 넣을지는 이슈로 정한다. 금칙어 검사를 넣으면 목록은 저장소 파일(워크플로 파일 포함)이 아닌 저장소 변수에 두는 것이 기본안이다. 목록을 저장소 파일에 적으면 그 파일이 규칙을 어기기 때문이다. D-92 확인 때 정한다.

### 7.2 기준선 규칙
- 기본은 0이다. 단언 실패, 콘솔 error·warning, 페이지 오류, 가로 스크롤, 예외가 하나라도 있으면 실패다.
- 판정은 `tests/ci/judge.py`가 로그 전체와 종료 코드로 한다. 마지막 줄만 보지 않는다. 시간 초과와 크래시는 기준선과 관계없이 실패다. 실행기가 남긴 기대 목록(`expected.txt`)에 있는데 돌지 않은 검사, 실행기 오류(`runner-error.txt`)도 실패다.
- 범위가 줄어든 실행도 실패다. `tests/ci/baseline-counts.txt`에 검사별 기준판 단언 수·SKIP 수·종료 코드를 두고, 요약 줄이 없거나 단언이 기준보다 적거나 SKIP이 기준보다 많으면 실패로 본다. 알려진 실패가 남은 검사는 요약의 실패 수가 실패 줄 수와 같고 종료 코드가 기준판과 같아야 통과다. 이 수치를 고치는 절차는 기준선과 같다. 앱 상태(씨앗의 사건 유무)에 따라 정해진 크기로 단언 수가 바뀌는 검사는 기준을 낮추지 않고 `tests/ci/baseline-credit.txt`의 보정 줄(그 분기를 탔다는 통과 줄 × 단언 수)로 맞춘다(지금 `fx_replay`).
- CI 참고 목록 `tests/ci/ci-advisory.txt`는 CI에서만 쓰는 예외다. 공유 실행기 속도에만 걸리는 시간 단언(수십 ms 간격, 알림 수명 안 동시 표시)과 대기 시간 초과로 끊긴 장면을 줄 패턴 또는 TimeoutError 줄에 한해 CI에서 '참고'로 남기고, 그 검사의 판정은 같은 SHA의 맥 로컬 최종 확인(§8, 참고 목록 없이 판정)이 한다. 참고로 돌리는 범위와 실패로 남는 것(시간 초과·크래시·예외 추적·페이지 오류·까닭 없는 단언 부족 등)은 `tests/ci/README.md` 'CI 참고 목록'이 원본이다. 항목은 CI 로그와 맥 로그를 대조해 시간 차이임을 사람이 확인한 뒤에만 더하고, 항목마다 근거 이슈를 단다. 줄 글자로 시간 지연과 회귀를 구별할 수 없는 시간 계약 검사는 참고로 두지 않고 `tests/ci/suites.txt` 넷째 칸 `mac`으로 CI 샤드에서 빼며(지금 `fx_map`), 그 검사의 판정은 맥 로컬 최종 확인만 한다.
- 알려진 실패는 `tests/ci/baseline-fail.txt`에 검사 이름과 실패 줄 단위로 둔다. 실패 개수만 비교하지 않는다. 이번 실패 줄이 모두 기준선에 있으면 통과, 하나라도 없으면 실패다. 기준선 줄이 사라지면 판정기가 '해소'를 알리고, 그 줄은 그 PR에서 지운다.
- 기준선에 줄을 더하는 일은 사람이 로그를 직접 보고 앱 결함이 아님을 확인한 뒤에만 한다. 근거 로그와 까닭을 커밋 본문과 PR 본문에 적고 총괄이 승인한다. 새 실패를 기준선에 넣어 CI를 통과시키지 않는다. 검사를 느슨하게 하는 변경(허용 오차·대상 제외)은 명세 근거를 주석으로 단다.
- 지금 기준선(10-30 통합 검사 18, 맥 로컬, 322bc7c): `rev9` 2줄과 `rev8c` 4줄의 BLOCKED. 검사기가 그 장면을 만들지 못한 것으로, 기준판 50d0f00과 항목이 같다. 고치는 일은 이슈로 둔다.
- Node 출력 전체에서 FAIL을 찾을 때 걸리던 42번 검사의 변이 탐지(`DETECTED`) 줄과 48번 검사의 `FAILURE_COUNTS {}` 줄은 판정기가 실패로 세지 않는다.
- 간헐 실패: 실패한 검사만 한 번 다시 돌릴 수 있다. 다시 통과하면 '간헐'로 이슈를 남기고, 두 번 실패하면 실제 실패로 본다. 맥 로컬에서는 1분 부하 150 이상에서 난 시간 초과를 판정에 쓰지 않는다(실행기의 `KCP_MAX_LOAD` 기본값 150, 총괄의 부하 규칙과 같다).
- 무엇이 기준인지 애매하면 같은 검사를 작업 줄기 머리에서 돌려 정한다(D-04).
- CI에서만 나는 실패(맥 로컬은 통과)는 글꼴·렌더링 같은 환경 차이일 수 있다. 원인을 확인할 때까지 병합하지 않는 것이 기본이고, 환경 원인이 확인되면 그 근거와 함께 기준선에 올린다.

### 7.3 CI가 보지 못하는 것
실제 태블릿(iPad 사파리, VoiceOver), 실제 Supabase 연결, 녹화 재확인(S1~S8 판정), 독립 평가, 캡처를 눈으로 보는 판정. CI 실행기(macOS)와 맥 로컬의 Playwright WebKit 결과는 iPad 사파리 결과가 아니다.

## 8. 맥 로컬 최종 브라우저 확인

CI 통과는 병합의 필요조건이고, 최종 판정은 맥 로컬 브라우저 검사다.

- 언제: PR 병합 직전, 릴리스 후보 태그 직전, 녹화·독립 평가용 고정본을 정하기 전. 검사한 SHA는 병합할 머리와 같아야 한다. 머리가 작업 줄기의 인계 문서 직접 커밋을 받느라 바뀌었으면, 그 차이가 인계 문서뿐임을 §9의 4 명령으로 보이고 PR 댓글에 남긴다. 이때는 다시 돌리지 않는다.
- 범위:
  - 화면·엔진 코드(`*.js`, `*.css`, `index.html`)를 바꾼 PR: `tests/ci/suites.txt` 전체(`browser.sh --all`).
  - 엔진·자료 파일이나 섞인 파일의 계산·판정 구간(§4.3)을 바꾼 PR: `suites.txt` 전체에 더해 목록 밖 리그 기본 검사 `rules`·`e2e`·`e2e2`·`e2e3`·`econint`·`ai-check`. `ui/league-net.js`를 바꿨으면 `mocktest`·`recover`·`chanlimit`도.
  - 리그 밖 파일(`app.js`, `styles.css`, `index.html`, `data.js`, `practice-data.js`, `g20xx.js`, `games/`, `ext/`, `ui/v2*`, `ui/skin-*`, `ui/stage-*`)을 바꾼 PR: 회귀 20종과 모형 검산도.
  - 검사 파일만 바꾼 PR: 바뀐 검사와 그 검사가 보는 화면의 검사. 문서만 바꾼 PR: 하지 않는다. 범위를 줄였으면 PR 댓글에 적는다.
- `suites.txt` 밖의 리그 브라우저 검사 16종: `rules`·`e2e`·`e2e2`·`e2e3`·`econint`·`ai-check`·`mocktest`·`recover`·`long36`·`chanlimit`·`tech`·`s1cards`·`phonedrawer`·`snapcompat`·`weights`·`fx_region`. 통합 검사 14(25ac06b)에는 있었고 15부터 빠졌다. 지금 판에서 통과하는지는 확인하지 않았다. `CLAUDE.md`, `docs/HANDOFF-econ.md` §5, 검사 실행 에이전트가 여전히 리그 화면 검사로 적는 검사들이다. 기본은 CI 목록에 넣는 것이다. 총괄이 맥 로컬에서 한 번 돌려 시간과 결과를 확인한 뒤, 통과하는 것은 `suites.txt`에 넣고 샤드를 다시 나눈다. 실패는 이슈로 만든다. 빼려면 이름마다 이유(같은 계약을 단언하는 다른 검사의 위치 등)를 CI 도입 이슈에 적고, 은퇴로 정하면 `CLAUDE.md`·`docs/HANDOFF-econ.md` §5·`.claude/agents/test-runner.md`에서도 지운다. 그때까지 이 16종은 위 범위의 모형·엔진 PR과 통합 검사(§10)에서 이름으로 돌린다. `judge.py`는 이 검사들의 `PROBLEMS N` 요약 줄과 `errors [...]` 페이지 오류 줄을 실패로 읽는다.
- 브라우저 명령: CI와 같은 실행기·판정기를 쓴다. 포트는 다른 워크트리와 겹치지 않게 고른다. 결과 폴더는 총괄의 저장소 밖 작업 폴더에 둔다.
  ```bash
  uptime                                                   # 1분 부하 150 이상이면 미룬다
  PY=tests/.venv/bin/python tests/ci/browser.sh --port <포트> --all --out <결과 폴더>/br
  python3 tests/ci/judge.py --kind browser --logs <결과 폴더>/br
  # 모형·엔진 PR: 목록 밖 리그 기본 검사를 이름으로
  PY=tests/.venv/bin/python tests/ci/browser.sh --port <포트> --out <결과 폴더>/br-extra \
    rules e2e e2e2 e2e3 econint ai-check
  python3 tests/ci/judge.py --kind browser --logs <결과 폴더>/br-extra
  ```
- 회귀 명령: 한 종씩 차례로 돌린다(bash). 목록은 `tests/run.sh`의 `ALL`과 같은 20종이다. 인자 없이 `tests/run.sh`를 부르면 네 개씩 동시에 돌므로 최종 확인에는 쓰지 않는다.
  ```bash
  for s in regression base screens routine probe peer drill integration originals \
           s-island-grid s-cement-carbon s-variant-desk s-shuttle-permit s-riverdeal \
           g2022 g2023 g2024 g2025 g2026 savefail; do
    KCP_PORT_BASE=<포트> tests/run.sh "$s"
  done
  ```
  결과는 `tests/results/<이름>.txt`이고, 종마다 `problems: 0`이어야 통과다. 0이 아니면 실패 항목을 작업 줄기 머리에서 같은 검사를 돌린 결과와 항목 단위로 대조한다(D-04). 개수만 비교하지 않는다. 회귀에는 아직 항목 단위 기준선 파일이 없으므로 대조 결과를 PR 댓글에 항목 이름으로 적는다.
- 모형 검산 명령: 종료 코드와 로그 전체로 판정한다. 실패 줄과 실패 요약은 표준 오류로 나오므로 `2>&1`로 함께 받는다. 9종 전체에 맥 로컬 약 2분.
  ```bash
  M=<결과 폴더>/model; mkdir -p "$M"; : > "$M/summary.txt"
  for f in tests/model_*.mjs; do
    n=$(basename "$f" .mjs)
    node "$f" > "$M/$n.log" 2>&1
    echo "$n exit=$?" >> "$M/summary.txt"
  done
  python3 tests/ci/judge.py --kind node --logs "$M" --status "$M/summary.txt"
  ```
  판정기는 종료 코드가 0이 아니거나, 줄머리 `실패 ` 줄이 있거나, 요약의 `실패 N건`이 0보다 크면 실패로 본다.
- 실행 환경: 총괄이 샌드박스 밖 맥 로컬에서 직접 돌린다. 구현·검사 담당의 제한 샌드박스에서는 브라우저를 띄우지 않는다. 샌드박스 제한 오류(WindowServer·LaunchServices 차단, `_RegisterApplication` 오류)가 나면 같은 환경에서 다시 시도하지 않고 기록한 뒤 허용된 실행 경로로 옮긴다. 그 경로를 쓸 수 없으면 '브라우저 미검증'으로 적고 병합하지 않는다.
- 부하: 시작 전에 `uptime`을 보고 1분 부하가 150 이상이면 미룬다. 브라우저 검사는 한 번에 하나, 회귀는 한 종씩 돌린다.
- 기록은 PR 댓글로 남긴다. 올리기 전에 §2 '올리기 전 거르기'를 거친다.
  ```
  맥 로컬 브라우저 확인 (샌드박스 밖 로컬)
  검사한 SHA: <40자>
  명령: <스크립트와 인자. 결과 폴더 경로는 뺀다>
  결과: <검사> <통과>/<실패> … (검사마다)
  기준선 항목: <있으면 항목 이름, 기준선과 같은지>
  미검증: <실제 태블릿, 실제 연결 등>
  ```
- 결과 원본(로그·캡처)은 총괄의 저장소 밖 작업 폴더에 두고, PR 댓글에는 그 위치를 적지 않는다. `tests/results/`는 git이 무시한다.

## 9. 병합

모두 맞아야 병합한다.
1. CI가 녹색이다(기준선 규칙 안).
2. 맥 로컬 최종 확인이 병합할 머리와 같은 SHA에서 통과했다. 4의 예외로 머리가 바뀌었으면 그 차이가 인계 문서뿐이라는 기록이 PR 댓글에 있다.
3. 독립 검토의 blocker·major가 0이고, 남긴 minor는 이슈가 됐다.
4. PR 브랜치가 작업 줄기 머리를 포함한다(`git merge-base --is-ancestor origin/claude/kentech-league-econ-balance <머리 SHA>`).
   - 예외: 검사한 SHA 뒤에 작업 줄기에 들어온 것이 인계 문서 직접 커밋(`docs/PROGRESS.md`, `docs/ORCHESTRATION.md`, `docs/DECISIONS.md`)뿐이면 작업 줄기를 받지 않고 병합해도 된다. 이 세 파일은 앱도, CI·맥 로컬 검사도 읽지 않는다(10-30 확인). 확인 명령의 출력이 세 파일 가운데 것뿐이어야 한다.
     ```bash
     git fetch origin
     git diff --name-only <검사한 SHA>...origin/claude/kentech-league-econ-balance
     ```
     GitHub가 충돌로 병합을 막으면(PR도 `docs/DECISIONS.md`를 고친 경우 등) 작업 줄기를 병합해 받는다. 그리고 `git diff --name-only <검사한 SHA> <새 머리>`도 세 파일 가운데 것뿐임을 PR 댓글에 남긴다. 이때 맥 로컬 확인은 다시 하지 않고 새 머리의 CI 녹색만 기다린다.
   - 다른 PR의 코드·검사 변경이 작업 줄기에 들어왔으면 작업 줄기를 받고 CI와 맥 로컬 확인을 다시 한다. 맥 로컬 한 번은 `suites.txt` 34종만으로 예상초 합 약 86분(5,188초)이다. 그래서 같은 날 합칠 PR은 순서를 정한다. 앞 PR을 병합한 뒤에 다음 PR이 작업 줄기를 받아 맥 로컬 확인을 시작한다. 맥 로컬 확인은 한 번에 하나다.
5. 사용자 결정이 필요한 변경은 결정 기록(D-번호)이 있다.

```bash
gh pr merge <번호> --repo yurowa90/kentech --merge --match-head-commit <병합할 머리 SHA>
```
squash·rebase는 쓰지 않는다(D-78). 머리가 적은 SHA와 다르면 병합이 거절된다. 이 명령은 작업 줄기 대상 PR에만 쓴다. main 대상 PR의 병합은 §11의 5를 따른다.

병합 뒤:
- 이슈를 닫는다: `gh issue close <n> --repo yurowa90/kentech --comment "작업 줄기 <병합 커밋 SHA>에 병합(#<PR 번호>)"`.
- 로컬 작업 줄기(`~/Projects/kentech-wt/econ`)를 `git pull --ff-only`로 맞춘다. 빨리 감기가 안 되면 로컬에만 있는 커밋이 있다는 뜻이니 멈추고 확인한다.
- 워크트리를 정리하고 대장을 고친다. 원격 브랜치를 지우는 일은 묶음 허락 밖이므로 사용자 확인 뒤에 한다.
- 진행 중인 다른 브랜치에 작업 줄기가 바뀌었다고 알린다. 각 브랜치는 작업 줄기를 병합해 받는다.

작업 줄기에 PR 없이 직접 커밋하는 것은 총괄의 인계·결정 문서(`docs/PROGRESS.md`, `docs/ORCHESTRATION.md`, `docs/DECISIONS.md`) 갱신뿐이다. 커밋 전에 `git pull --ff-only`로 원격을 받는다. 이 커밋은 CI를 거치지 않으므로 문서 밖 파일과 다른 문서를 섞지 않는다. 코드·검사·CHANGELOG·그 밖의 문서는 PR로만 들어온다. 직접 커밋은 될 수 있으면 그날 마지막 병합 뒤로 몰아서 하고, 릴리스 순서의 1~5 동안에는 하지 않는다(§11).

## 10. 작업 줄기 통합 검사

- 병합은 §9의 4를 지킨 PR만 하므로, 병합 결과는 그 PR의 CI·맥 로컬 확인이 본 코드에 인계 문서 직접 커밋을 더한 것과 같다. 작업 줄기에 따로 CI를 돌리고 싶으면 수동 실행을 쓴다.
- 맥 로컬 전체 검사는 고정본(녹화·독립 평가·릴리스 후보)을 정하기 전과, 하루에 PR을 여러 개 합친 뒤에 돌린다. 문법, Node 전체(`tests/ci/node-all.sh`와 `judge.py --kind node`), 모형 검산(§8 명령), 회귀 20종(한 종씩, §8 명령), 리그 브라우저 `suites.txt` 전체, 목록 밖 리그 브라우저 16종(CI에 넣기 전까지, §8)이다. 밸런스를 건드린 PR이 들어왔으면 `bots36.py --node --months 36`도 돌린다.
- Node와 브라우저를 둘 다 돌린다. 10-25에 브라우저만 돌리고 push했다가 sec·d75 대역 결함을 늦게 찾았다.
- 결과 원본은 총괄의 저장소 밖 작업 폴더에 둔다. `docs/PROGRESS.md` '이어받을 곳'에는 판(SHA)과 결과만 적는다. 돌리지 않은 검사는 '돌리지 않음'으로 적는다.

## 11. 릴리스

판 번호는 유의적 버전을 따른다. `v1.0.0`은 2022 확장판(마일스톤 `v1.0 2022 확장판`) 완성이다. 그 전의 후보는 `v1.0.0-rc.1`, `v1.0.0-rc.2` …이고, 후보 뒤에 고칠 것이 생기면 고친 뒤 rc 번호를 올린다. 2023 짝의 판 번호는 그 단계를 시작할 때 정한다.

main PR은 릴리스 후보마다 하나, 정식 판에서 하나 더 연다. D-78의 '단계마다 main PR 하나'를 D-92가 이렇게 바꾼다. main PR은 아래 후보 조건(품질 8 목표와 통합 검사 통과)을 채운 뒤에 열고, 병합 직전에 사용자 확인을 다시 받는다(10-30 사용자 결정).

후보 조건: 마일스톤의 blocker·major 이슈 0, 품질 8 목표 충족(독립 평가의 판정만 보고 점수는 저장소 밖에 둔다), 녹화 재확인에서 S1~S8과 끝 화면 '잘 됨', 작업 줄기 맥 로컬 전체 검사 통과.

순서(1부터 5까지는 작업 줄기에 다른 PR을 합치지 않고, 인계 문서 직접 커밋도 하지 않는다. 릴리스 기록은 5가 끝난 뒤 `docs/PROGRESS.md`에 남긴다):
1. 고정할 작업 줄기 SHA를 정하고 그 SHA에서 맥 로컬 전체 검사(§10)를 돌린다.
2. 릴리스 준비 PR(`chore/<n>-release-1.0.0-rc.1`)을 연다. CHANGELOG의 `[Unreleased]`를 `[1.0.0-rc.1] - YYYY-MM-DD`로 옮기고 빈 `[Unreleased]`를 새로 둔다. 병합된 PR들의 'CHANGELOG 한 줄(제안)'을 모아 교사·학생 관점으로 다듬는다. CHANGELOG를 PR마다 고치지 않고 여기서 모으는 것은, 병합 커밋만 쓰는 흐름에서 같은 파일 충돌이 PR마다 생기는 것을 피하기 위해서다. CI는 이 PR에서도 평소대로 돌고, 문서만 바꾸므로 맥 로컬 브라우저 확인은 1의 결과로 갈음한다.
3. 그 PR의 병합 커밋과 1의 SHA 사이 차이가 CHANGELOG뿐인지 본다(`git diff --stat <1의 SHA> <병합 커밋>`). 다른 파일이 있으면 1부터 다시 한다.
4. 병합 커밋에 주석 태그를 단다.
   ```bash
   git tag -a v1.0.0-rc.1 <병합 커밋 SHA> -m "v1.0.0-rc.1: 2022 확장판 후보"
   git push origin v1.0.0-rc.1
   ```
5. main PR. 네 단계로 나눈다.
   1. main PR을 연다. 본문에는 판, 검사 결과, CHANGELOG 절, 미검증 항목(실제 태블릿 등)을 쓰고 §2 '올리기 전 거르기'를 거친다.
   2. 그 PR의 CI 최종 판정이 녹색인지 확인한다(main 대상 PR에서도 CI가 돈다, §7).
   3. 사용자에게 판(태그·SHA), CI와 맥 로컬 검사 결과, CHANGELOG 절, 미검증 항목을 보이고 병합 확인을 받는다. main 병합은 묶음 허락에 들지 않는다. 확인은 그 병합 한 번에만 해당한다.
   4. 확인을 받은 뒤 병합한다. main은 작업 줄기의 조상이므로 병합 결과의 트리는 태그 판과 같다.
   ```bash
   gh pr create --repo yurowa90/kentech --base main --head claude/kentech-league-econ-balance \
     --title "v1.0.0-rc.1: 2022 확장판 후보" --body-file <본문 파일>
   gh pr checks <번호> --repo yurowa90/kentech --watch     # 최종 판정 녹색 확인
   # 사용자 확인을 받은 뒤
   gh pr merge <번호> --repo yurowa90/kentech --merge --match-head-commit <태그 SHA>
   ```
6. GitHub 릴리스(사전 공개 표시)는 선택이다. 공개 페이지가 하나 더 생기므로 만들 때마다 사용자 확인을 받는다. 만들면 CHANGELOG 절을 본문으로 쓰고 §2 거르기를 거친다.
7. 배포(§12) → 현장 확인(§13). 고칠 것이 나오면 고친 PR들을 합친 뒤 rc 번호를 올려 1부터 다시 한다. 통과하면 정식 판을 만든다.
   1. 정식 판 준비 PR(`chore/<n>-release-1.0.0`)에서 CHANGELOG에 `[1.0.0] - YYYY-MM-DD` 절을 더한다(현장 확인을 통과한 rc 판과 같은 앱이라는 것과 확인 기록 요지). 문서만 바꾸므로 맥 로컬 브라우저 확인은 rc 판의 결과로 갈음한다.
   2. 그 PR의 병합 커밋과 rc 태그 사이 차이가 CHANGELOG와 인계 문서뿐인지 본다(`git diff --stat v1.0.0-rc.N <병합 커밋>`). 앱·검사 파일이 다르면 정식 판이 아니라 다음 rc다.
   3. 그 병합 커밋에 `v1.0.0` 주석 태그를 단다.
   4. main PR을 한 번 더 연다. 5와 같이 CI 확인 → 사용자 확인 → 병합.

CHANGELOG는 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 형식으로 쓴다. 절은 추가·변경·제거·고침·보안이다. 교사·학생이 앱에서 알아챌 변화를 먼저 쓰고 검사·문서 변화는 짧게 묶는다. 커밋 해시는 꼭 필요한 곳에만 쓰고, 모델 이름·점수·학생 정보·저장소 밖 경로는 쓰지 않는다.

## 12. 배포: Cloudflare Pages 미리보기

멀티 태블릿은 https 주소로 접속해야 팀이 자리에 앉는다(요청 서명에 WebCrypto가 필요, D-64, CLASSROOM-CHECK-LEAGUE 준비 1). 그래서 교실 확인 전에 미리보기 배포가 필요하다.

- 올리기 전에 사용자 확인을 받는다. 무엇을(태그·SHA), 어디에(프로젝트 이름·주소), 누가 볼 수 있는지, 비용(무료 요금제 범위인지), 사본에 들어가는 파일 목록(특히 docs 파일)을 알린다. 허락은 그 한 번에만 해당한다. Cloudflare 계정 로그인과 프로젝트 만들기도 사용자 확인 뒤에 한다.
- 올리는 것은 태그 판을 `git archive`로 꺼낸 사본에서 앱이 쓰는 파일만 골라 담은 폴더다. `index.html`, 루트의 `*.js`·`*.css`, `ext/`, `games/`, `ui/`, 그리고 화면의 '설계 문서' 연결(기술 카드의 `sources`)이 가리키는 docs 파일만 넣는다. 나머지 docs, `README.md`, `CHANGELOG.md`, `tests/`, `.claude/`, `.github/`, `CLAUDE.md`는 넣지 않는다. 인계·결정·품질 문서가 새 공개 주소에 실리지 않게 하기 위해서다.
  ```bash
  S=$(mktemp -d); D=$(mktemp -d)
  git archive v1.0.0-rc.1 | tar -x -C "$S"
  cp "$S"/index.html "$S"/*.js "$S"/*.css "$D"/
  cp -R "$S"/ext "$S"/games "$S"/ui "$D"/
  mkdir "$D/docs"
  (cd "$S" && node -e 'global.window={KCP:{}};require("./ui/tech-data.js");const s=new Set();window.KCP.TECH_DATA.cards.forEach(c=>(c.sources||[]).forEach(x=>typeof x==="string"&&x.startsWith("docs/")&&s.add(x.split("#")[0])));console.log([...s].join("\n"))') |
    while read -r f; do cp "$S/$f" "$D/$f"; done
  (cd "$D" && find . -type f | sort)        # 사용자에게 보일 파일 목록
  ```
  10-30 판에서 이 docs 목록은 `docs/ECON-TECH-SPEC.md`, `docs/ECON-TECH.md` 둘이다. 앱 코드에 적힌 다른 docs 이름(`ECON-REFERENCES`, `ECON-DATA`, `RESEARCH-2026-10-14`, `DECISIONS`)은 화면에 연결로 나오지 않는 출처 글자다. 넣는 docs 파일도 올리기 전에 §2 거르기를 거친다.
- 배포 명령. wrangler는 이 맥에 설치돼 있지 않으므로 전역 설치하지 않고 판을 적어 `npx`로 부른다. 판은 첫 배포 전 사용자 확인 때 정해 이 문서에 적는다.
  ```bash
  # 사용자 확인 뒤, 처음 한 번
  npx --yes wrangler@<고정 판> login
  npx --yes wrangler@<고정 판> pages project create <프로젝트> --production-branch main
  # 올리기
  npx --yes wrangler@<고정 판> pages deploy "$D" --project-name <프로젝트> --branch rc
  npx --yes wrangler@<고정 판> pages deployment list --project-name <프로젝트>
  ```
  운영 브랜치를 `main`으로 정해 두면 `--branch rc` 배포는 미리보기가 되고 `<branch>.<project>.pages.dev` 별칭이 생긴다는 것이 Cloudflare 문서의 설명이다. 올린 뒤 배포 목록에서 방금 배포의 환경이 미리보기(Preview)인지 확인한다. 운영(Production)으로 나오면 멈추고 사용자에게 알린다. 첫 배포 때 실제 주소를 확인한다.
- 미리보기 주소도 주소를 아는 사람은 누구나 열 수 있다. 검색 노출을 막으려면 배포 사본에만 `_headers`(`X-Robots-Tag: noindex`)를 넣는 방법이 있다(제안, D-92 확인 때 정한다).
- 배포 사본에 비밀이 없어야 한다. Supabase 프로젝트 주소와 공개 키는 앱에 넣지 않고 진행자가 로비에서 입력한다.
- 새 판을 올린 뒤에는 수업 전에 노트북·태블릿을 모두 새로고침한다. 공개 상태 형식이 바뀐 판에서는 옛 판을 연 탭이 진행자 상태를 읽지 못한다(CLASSROOM-CHECK-LEAGUE 준비 5).
- 배포 기록(주소·태그·시각)은 `docs/PROGRESS.md`에 남긴다. 정식 공개 주소로 바꾸는 일은 따로 사용자 결정을 받는다.

## 13. 현장 확인: 실제 태블릿

- 순서는 `docs/CLASSROOM-CHECK-LEAGUE.md`다(혼자 하기 12달, 6팀 멀티 12달, 끊김과 복구). 실제 Supabase 재개와 `live.py` 실행은 사용자 확인 뒤에 한다.
- 기록에는 통과·미통과, 시각, 기기 종류와 OS 판, 관찰 메모만 쓴다. 사람 이름, 학생 정보, 학생이 쓴 글은 적지 않는다. 학생 입력이 보이는 캡처는 쓰지 않는다.
- 문제는 이슈로 만들고 출처 라벨 `src:user`를 단다(교실 확인 전용 출처 라벨이 필요하면 그때 더한다). blocker·major가 있으면 고친 뒤 rc 번호를 올리고 다시 배포·확인한다.
- 통과하면 정식 판 `v1.0.0`을 만든다(§11의 7). ROADMAP 완성 기준 2의 실제 기기·실제 연결 칸은 판정 기록과 함께 채운다.

## 14. 완료 정의

### PR을 합쳐도 되는가
- [ ] 이슈가 있고 PR 본문에 `Closes #n`이 있다. 범위가 이슈와 같다.
- [ ] 구현 담당과 검사 담당이 다른 세션이다. 검사 기대값을 바꾼 곳에는 명세 근거가 있다.
- [ ] 독립 검토 리뷰 글이 있고 blocker·major가 0이다. 남긴 minor는 이슈가 됐다.
- [ ] 엔진 계산(§4.3): 엔진·자료 파일 변경 없음 / 표시 문자열만(되돌린 사본 바이트 같음, 숫자 열 같음) / 섞인 파일은 덩어리마다 화면·계산 구분 / 창작 게임·기출의 모형·저장·판정 변경 없음 / 모형 변경 보고(D-66·결정 번호) 가운데 맞는 것을 적었다.
- [ ] 기기 밖으로 새로 보내는 값이 없다(D-65). 있으면 결정 번호가 있다.
- [ ] 근거 등급·출처를 지켰다(D-60·D-72). 도시 이름은 자료에서 읽고(D-58·D-86), 실제 회사 이름이 없다.
- [ ] 새 학생 문구는 문구 절차·사실 확인·맞춤법·사용자 편집 판단을 거쳤고 원문이 PR에 있다.
- [ ] 화면이 바뀌었으면 1280×900·390×844 캡처가 있고 접근성 규칙(대비 4.5, 44px, 390 가로 스크롤 0, 콘솔 0)을 지켰다.
- [ ] CI가 녹색이다. 기준선 항목이 바뀌었으면 까닭이 있다.
- [ ] 맥 로컬 최종 확인이 병합할 머리 SHA에서 통과했다. 머리가 인계 문서를 받느라 바뀌었으면 그 차이 기록이 있다(문서만이면 '해당 없음').
- [ ] 결정이 바뀌었으면 `docs/DECISIONS.md`에 새 D-번호가 있다. 'CHANGELOG 한 줄(제안)'을 썼다.
- [ ] 저장소·커밋·PR·리뷰 글에 학생 정보, 비밀 키, 모델 이름, 채점 점수, 저장소 밖 작업 폴더 경로가 없다. 커밋 끝 서명 줄과 PR 끝 생성 도구 표시 줄이 없다(사용자가 따로 허락해 결정 번호가 있는 경우만 예외). 올린 글은 §2 거르기를 거쳤다.
- [ ] 확인하지 못한 것을 적었다.

### 이슈를 닫아도 되는가
- [ ] 고친 PR이 작업 줄기에 병합됐고, 닫는 댓글에 병합 커밋 SHA가 있다.
- [ ] 녹화·평가·교실에서 나온 결함은 같은 장면을 다시 봤거나, 다시 볼 차례(다음 녹화 재확인 등)를 적었다.

### 릴리스 후보와 정식 판
- [ ] 마일스톤의 blocker·major가 0이고, 품질 8 목표를 충족했고, 녹화 재확인에서 S1~S8과 끝 화면이 '잘 됨'이다.
- [ ] 태그 판에서 맥 로컬 전체 검사와 CI가 통과했다. 검사한 SHA와 rc 태그 SHA의 차이는 CHANGELOG뿐이다. 정식 판 태그와 rc 태그의 차이는 CHANGELOG와 인계 문서뿐이다.
- [ ] CHANGELOG 절이 있다. main PR은 CI 녹색을 확인하고 사용자 확인을 받은 뒤 병합 커밋으로 합쳤다.
- [ ] GitHub 릴리스, 원격 브랜치 삭제, 미리보기 배포는 사용자 확인 뒤에 했다.
- [ ] 정식 `v1.0.0`은 교실 확인(실제 태블릿·실제 연결)을 통과한 뒤에 단다.

## 15. 그대로 두는 것과 바뀌는 것

- D-78에서 그대로 두는 것: 작업 줄기 하나, 병합 커밋만(squash·rebase 금지), `--match-head-commit`. D-92가 바꾸는 것: '갈래는 PR을 열지 않는다'는 '이슈마다 브랜치를 만들어 작업 줄기로 PR을 연다'로, '단계마다 main PR 하나'는 '릴리스 후보와 정식 판마다 main PR, 병합 직전 사용자 확인'으로 바뀐다.
- 외부 동작은 사용자 확인 뒤에 한다(`CLAUDE.md`). D-92 초안은 이슈·라벨·마일스톤 만들기, 브랜치 push, 작업 줄기 대상 PR(열기·리뷰 글·병합), 태그 push, CI 실행을 이 흐름의 일부로 묶어 허락받는다. main 대상 PR의 병합, GitHub 릴리스 만들기, 원격 브랜치 지우기, 브랜치 보호·기본 브랜치 변경·저장소 비밀값, 배포, Supabase는 그때마다 확인받는다.
- 검사 판정(`.claude/rules/tests.md`), 리그·경제 규칙(`.claude/rules/league-econ.md`), 화면·게임 규칙(`.claude/rules/ui-and-games.md`), 인계 절차(스킬 `kcp-handoff`). `tests.md`의 판정 예외와 Playwright 판 줄은 D-92 확인 때 고친다(초안 `.github/d92-draft.md`).
- 채점 점수는 저장소 밖에 둔다. 독립 평가 결과에서 저장소로 옮기는 것은 결함 내용뿐이다.
