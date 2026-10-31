# QA 체크리스트 — 릴리스 관문

`tests/qa/render.py`가 `tests/qa/checklist.json`에서 만든 문서다. 고칠 때는 원본을 고치고 다시 만든다. 판정 규칙은 `docs/QA-CHECKLIST.md`.

## 축 규칙

[공통, D-93 결정 1·2절] 체크 상태는 통과·실패·확인 못 함·해당 없음 넷이다. 확인 못 함은 통과가 아니다. band 'proposal'은 판정에 넣지 않는다(기록·후속 후보). 릴리스 관문에는 점수·평균·홀수 규칙이 없고 band '8' 체크만 있다(6 구간 없음). 모든 판정은 평가 SHA 하나로 하며, 관문의 평가 SHA는 <RC>다. 기대값은 명세 문서(DEV-WORKFLOW·CLASSROOM-CHECK·DECISIONS·LEAGUE-CANON·QUALITY-*)에서 가져오고 구현에서 베끼지 않는다. [출시 판정] rc(v1.0.0-rc.N)는 네 가지를 모두 채워야 한다. 시점 A·B의 RG 체크 모두 통과, 관문에 편입한 공통 체크 통과, 다섯 축 모두 8 이상(RG-REL-01), 마일스톤 blocker·major 0(RG-OPS-01·02). 정식 v1.0.0은 여기에 시점 C·D 체크까지 모두 통과해야 한다. 하나라도 실패하거나 확인 못 함이면 그 판은 출시하지 못한다. rc를 판정할 때 시점 C·D 체크는 '해당 없음(시점 C/D)'으로 둔다. method가 device·live·classroom인 체크는 보고에서 '현장 확인 전'으로 따로 묶는다. 시점 E(첫 시범 수업 전, CLASSROOM-CHECK-2022)와 F(2022 짝 완성 판정, ROADMAP 완성 기준 1·3·4)는 출시 판정 밖의 별도 관문이다(AUDIT-2022 §9, DEV-WORKFLOW §2 마일스톤 범위). [관문에 편입한 공통 체크] 시점 B: CM-REG(평가 SHA <RC>의 CI 수동 실행 또는 PR 머리 확인, Node 전체, 모형 검산, 회귀 20종 한 종씩, browser.sh --all), CM-LOAD, CM-BALANCE, CM-REC, CM-RECSHA, CM-MISREAD, CM-OVERFLOW, CM-VIRTUAL, CM-PRIVACY. 시점 D·E: CM-DEVICE. RG-REL-01의 평가는 CM-EVAL과 CM-SCORER를 따른다. [관문 시점] notes에 따로 적지 않았으면 B다. - A: 작업 줄기 PR 병합 조건(§9)을 B에서 소급해 감사한다. 조건은 CI 녹색, 같은 SHA의 맥 로컬 확인, 독립 검토 blocker·major 0과 남긴 minor의 이슈, 작업 줄기 머리 포함, 사용자 결정의 D-번호다. - B: 릴리스 후보(§11 1~5단계). 이 동안 다른 병합과 인계 문서 직접 커밋이 없다. 3단계 차이에 CHANGELOG 밖 파일이 있으면 1단계부터 다시 한다. main 병합은 CI 녹색과, 그 병합 한 번에 대한 사용자 확인 뒤에 한다. - C: 미리보기 배포(§12). 올릴 때마다 사용자 확인을 받고, 환경이 Preview가 아니면 멈춘다. - D: 정식 판(§11-7·§13). 현장 확인을 통과한 뒤 태그를 단다. 현장에서 blocker·major가 나오면 rc 번호를 올려 1단계부터 다시 한다. 정식 판 차이에 앱·검사 파일이 있으면 정식 판이 아니라 다음 rc다. [검사 판정] CM-REG와 DEV-WORKFLOW §7.2를 따른다. - 0이 기본이다. 알려진 실패는 baseline-fail.txt의 검사 이름·실패 줄 단위로만 허용한다. - 다음은 실패다: 시간 초과, 크래시, 실행 안 됨, 요약 줄 없음, 단언 부족, SKIP 초과, CI 작업의 취소·건너뜀. - 맥 로컬은 참고 목록 없이 판정한다. - 간헐 실패는 실패한 검사만 한 번 다시 돌린다. 다시 통과하면 이슈를 남긴다. - 샌드박스 제한으로 브라우저를 못 돌렸으면 '브라우저 미검증'이고, 관문을 통과하지 못한다. - 맥 로컬 확인 뒤 들어온 것이 인계 문서 세 파일의 직접 커밋뿐이면, 그 차이 기록으로 재확인을 갈음한다(§9-4). [공개 기록] 이슈·PR·리뷰·커밋·CHANGELOG·태그 메시지·배포 docs에는 채점 점수, 모델 이름, 저장소 밖 작업 폴더 경로, 학생 정보, 비밀 키, Supabase 주소·키를 쓰지 않는다. 올리기 전에 <FW>로 거른다. 녹화 재확인·채점 보고는 '총괄 보관 보고(저장소 밖)'로만 가리킨다. 돌리지 않은 검사는 '돌리지 않음'으로 적는다. [표기] - <RC>: 릴리스 1단계에서 고정한 작업 줄기 SHA. - <M>: 릴리스 준비 PR의 병합 커밋. - <TAG>: v1.0.0-rc.N(정식 판 체크에서는 v1.0.0). - <TRUNK>: claude/kentech-league-econ-balance. - <MAIN0>: 직전 main 병합 f87b406(첫 릴리스 뒤로는 직전 정식 태그). - <D92>: D-92 결정 커밋 63f4d59. - <D58>: 도시 이름 규칙(D-58)을 처음 문서화한 커밋 57f27d3. - <R>: 총괄이 보관하는 결과 폴더(위치는 기록에 적지 않는다). - <FW>: 총괄이 보관하는 금칙어 목록 파일. - <D>: 배포 사본 폴더. - <포트>: 다른 워크트리와 겹치지 않는 포트. - [U]: http://127.0.0.1:<포트>/index.html(저장소 루트에서 python3 tests/srv.py <포트> .). - <W>: gh pr list --repo yurowa90/kentech --base claude/kentech-league-econ-balance --state merged --limit 500 --json number,mergedAt,headRefOid,mergeCommit,headRefName,body,files 가운데 mergedAt이 <D92> 작성 시각 이후인 PR. - <KEYPAT>: `sb_secret_[A-Za-z0-9]{20,}\|sb_publishable_[A-Za-z0-9]{20,}\|eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\|[a-z0-9]{20}\.supabase\.co`. 실제 키 모양으로 좁힌 것이다(D-93). - <KEYOK>: 검사용 가짜 키의 정확한 문자열 목록 `sb_publishable_test_key\|sb_publishable_keycheck_fixture_never_a_real_key\|sb_secret_keycheck_fixture_never_a_real_key\|fixture_sb_secret_embedded_keycheck`. - <앱 파일>: ui app.js data.js practice-data.js index.html styles.css ext games g20*.js(D-93). - code-inspect 명령은 <RC>를 꺼낸 작업 폴더(git worktree add --detach ../_rg <RC>)에서 돌린다.

## 빌드·CI

| ID | 구간 | 확인 | 무엇을 | 통과 조건 | 절차 | 이미 있는 검사 | 원문 |
|---|---|---|---|---|---|---|---|
| RG-BLD-01 | 8 | Node 검사 | 앱 자바스크립트 전 파일이 Node 문법 검사를 통과한다. | 대상 파일 전부 node --check 종료 0, 아래 명령 출력이 0 | for f in *.js ext/*.js games/*.js ui/*.js; do node --check "$f" >/dev/null 2>&1 \|\| echo "SYNTAX-FAIL $f"; done \| grep -c SYNTAX-FAIL | .github/workflows/ci.yml · syntax 작업 '자바스크립트 문법 확인' 단계 | CLAUDE.md '자주 쓰는 명령'; docs/DEV-WORKFLOW.md §7.1 표 '문법'(239행)·§10(351행) |
| RG-BLD-02 | 8 | Node 검사 | Node 검사 목록(node-suites.txt)과 검사 파일이 어긋나지 않는다. | node-all.sh --check 종료 코드 0 | bash tests/ci/node-all.sh --check; echo exit=$? → 'exit=0' | ci.yml · syntax 작업 'Node 검사 목록과 파일 대조' 단계 | docs/DEV-WORKFLOW.md §7.1(239·241행); tests/ci/README.md '새 Node 검사' 문단 |
| RG-BLD-03 | 8 | Node 검사 | 브라우저 검사 목록(suites.txt)에 칸 오류·중복 이름·기준 수치 누락이 없다. | browser.sh --check 종료 코드 0 | bash tests/ci/browser.sh --check; echo exit=$? → 'exit=0'(서버를 띄우지 않음) | ci.yml · plan 작업 '샤드 목록 만들기'(browser.sh --shards가 같은 확인을 함) | docs/DEV-WORKFLOW.md §7.1 표 '브라우저 목록 확인'(240행); tests/ci/README.md 샤드 배분 끝 문단 |
| RG-BLD-04 | 8 | CI | 릴리스에 쓰는 PR의 머리 SHA에서 CI 최종 판정이 녹색이다(대상: 릴리스 준비 PR, rc main PR, 정식 판 준비 PR, 정식 main PR). | 대상 PR마다 '최종 판정'과 문법·브라우저 목록·노드(heavy·rest)·브라우저 샤드 전부 bucket=pass, cancel·skipping 0. 그 PR의 CI 실행 head SHA = headRefOid, conclusion = success | gh pr checks <번호> --repo yurowa90/kentech --json name,state,bucket,link → 모든 줄 bucket=pass. H=$(gh pr view <번호> --repo yurowa90/kentech --json headRefOid --jq .headRefOid); gh run list --repo yurowa90/kentech --workflow ci.yml --commit "$H" --json conclusion,headSha,event --jq '.[0]' → headSha=H, conclusion=success | ci.yml · gate 작업 '최종 판정'(넷 모두 success여야 성공, 취소·건너뜀 실패) | docs/DEV-WORKFLOW.md §7.1 '최종 판정'(243행), §11 2(365행)·5-2(374행)·7-4(389행), §14(455행) |
| | | | 비고: 관문 시점은 B(릴리스 준비 PR, rc main PR)와 D(정식 판 준비 PR, 정식 main PR)다. <RC> 자체의 CI는 CM-REG가 본다(평가 SHA <RC>에서 수동 실행). 작업 줄기 push에는 CI가 돌지 않는다(DEV-WORKFLOW 230행). 그래서 병합 커밋 SHA로는 실행 기록을 찾지 않는다. | | | | |
| RG-BLD-05 | 8 | 코드 확인 | CI 워크플로가 읽기 권한만 쓰고 비밀값을 쓰지 않는다. | ci.yml의 permissions 아래 항목이 'contents: read' 하나, 'secrets.' 문자열 0회 | rg -n -A2 '^permissions:' .github/workflows/ci.yml; rg -c 'secrets\.' .github/workflows/ci.yml → 둘째 명령 출력 없음(0) | 없음 | docs/DEV-WORKFLOW.md §7.1(235행); DECISIONS.md D-92 결정 5(513행) |
| RG-BLD-06 | 8 | 코드 확인 | CI가 실제 Supabase에 붙는 검사를 돌리지 않는다. | 세 파일에서 'live.py' 0회 | rg -c 'live\.py' .github/workflows/ci.yml tests/ci/suites.txt tests/ci/node-suites.txt → 출력 없음 | 없음 | docs/DEV-WORKFLOW.md §7.1(235행 '실제 Supabase에 붙는 검사는 CI에서 돌리지 않는다') |
| | | | 비고: node-suites.txt의 tests/league/live_bigsnap.js는 외부 연결 없이 Node로 계산하는 파일이라(파일 머리 주석) 대상이 아니다. | | | | |
| RG-BLD-07 | 8 | 코드 확인 | CI와 맥 로컬의 도구 판이 같게 고정돼 있다(대상: Node, Playwright). | ci.yml의 node-version 값 3곳 모두 "24.21.0", requirements.txt에 'playwright==1.63.0', 맥 로컬 node --version = v24.21.0, tests/.venv의 playwright = 1.63.0 | rg -n 'node-version' .github/workflows/ci.yml; rg -n '^playwright==' tests/ci/requirements.txt; node --version; tests/.venv/bin/python -c "from importlib.metadata import version; print(version('playwright'))" | 없음 | docs/DEV-WORKFLOW.md §7.1(233행); .claude/rules/tests.md 둘째 항목; tests/ci/README.md 'CI에서 도는 방식' 끝 문단 |
| RG-BLD-08 | 8 | 코드 확인 | 빌드 단계와 패키지 관리자 없이 정적 파일만으로 돈다. | 아래 명령 출력 0줄 | git ls-tree -r --name-only <RC> \| rg '(^\|/)(package(-lock)?\.json\|pnpm-lock\.yaml\|yarn\.lock\|(webpack\|vite\|rollup\|esbuild)\.config\.[cm]?[jt]s\|tsconfig\.json)$' | 없음 | CLAUDE.md 첫 문단(빌드 없음); docs/DEV-WORKFLOW.md §4.4(174행) |
| RG-BLD-09 | 8 | 코드 확인 | index.html이 KCP.boot()를 정확히 한 번, 마지막 script로 부른다. | 'KCP.boot()' 1회, 그 줄이 마지막 '<script' 줄 | grep -c 'KCP.boot()' index.html → 1; grep -n '<script' index.html \| tail -1 에 'KCP.boot()' 포함 | 없음(회귀 base·screens가 첫 화면을 띄우는 것으로 간접 확인할 뿐 단언은 없음) | .claude/rules/ui-and-games.md 둘째 항목 |
| RG-BLD-10 | 8 | 코드 확인 | index.html의 스크립트 순서가 규칙(data.js → app.js → practice-data.js → g2022~g2026 → games/*.js → ext/*.js → ui/*.js)과 같다. | 아래 명령 출력 0 | rg -o 'src="[^"]+"' index.html \| sed 's/src="//;s/"$//' \| awk '{g=($0=="data.js")?1:($0=="app.js")?2:($0=="practice-data.js")?3:($0~/^g20[0-9][0-9]\.js$/)?4:($0~/^games\//)?5:($0~/^ext\//)?6:($0~/^ui\//)?7:99; if(g<last\|\|g==99) print "ORDER-FAIL "$0; last=g}' \| grep -c ORDER-FAIL | 없음 | .claude/rules/ui-and-games.md 둘째 항목 |
| | | | 비고: CSS 순서(폰트 → styles.css → ext/*.css → games·ui CSS)도 같은 방식으로 link href에 적용할 수 있다. 해석: 규칙의 '/' 앞뒤를 CSS 묶음과 JS 묶음으로 읽었다. | | | | |
| RG-BLD-11 | 8 | 브라우저 검사 | 앱이 전역에 KCP 하나만 만든다. | 첫 화면 로드 뒤 window의 새 열거 가능 속성 목록 = ['KCP'] | 맥 로컬, 샌드박스 밖(CM-LOAD 전제). [U]를 띄운다. Playwright로 about:blank에서 Object.keys(window)를 A로 받는다. [U]#home 로드(networkidle) 뒤 Object.keys(window)를 B로 받아 B−A를 출력한다. '__pw'·'__playwright'로 시작하는 이름은 뺀다. | 없음 | docs/DEV-WORKFLOW.md §4.4(174행 '전역 KCP 하나(D-31)'); CLAUDE.md 첫 문단 |
| | | | 비고: 해석: '전역 KCP 하나'를 window에 새로 생긴 열거 가능 속성으로 읽었다. 작성 시점의 코드는 모든 모듈이 즉시 실행 함수 안에 있고, 맨 앞 줄에서 선언하는 것이 없다. | | | | |

## 회귀·통합 검사

| ID | 구간 | 확인 | 무엇을 | 통과 조건 | 절차 | 이미 있는 검사 | 원문 |
|---|---|---|---|---|---|---|---|
| RG-REG-08 | 8 | 브라우저 검사 | 해소된 기준선 줄이 기준선 파일에 남아 있지 않다. | CM-REG browser --all 판정과 RG-REG-07 판정의 요약이 모두 '해소 경고 0건' | python3 tests/ci/judge.py --kind browser --logs <R>/br \| rg -o '해소 경고 [0-9]+건'; python3 tests/ci/judge.py --kind browser --logs <R>/br-extra \| rg -o '해소 경고 [0-9]+건' → 두 줄 모두 '해소 경고 0건' | judge.py 해소 경고 | docs/DEV-WORKFLOW.md §7.2(254행 '기준선 줄이 사라지면 … 그 줄은 그 PR에서 지운다'); tests/ci/judge.py 538·548행 |
| | | | 비고: judge.py는 해소가 없어도 요약에 '해소 경고 0건'을 찍고 '### 해소 경고' 머리도 찍는다(538·548행). 그래서 '해소' 낱말을 세면 늘 걸린다. 요약의 건수로 판정한다. <R>/br는 CM-REG의 browser --all 결과 폴더다. | | | | |
| RG-REG-12 | 8 | 문서 확인 | 재실행으로 통과한 간헐 실패마다 이슈가 있다. | 재실행해 통과한 검사마다, 그 검사 이름으로 찾은 '간헐' 이슈가 1건 이상 있다. 두 번 실패한 검사는 실패로 기록돼 있다 | 실행 기록에서 재실행한 검사 이름을 모은다 → 이름마다 gh issue list --repo yurowa90/kentech --state all --search '<검사 이름> 간헐 in:title,body' --json number --jq length ≥ 1 | 없음 | docs/DEV-WORKFLOW.md §7.2(258행) |
| | | | 비고: D-93(ST-A-01·02)을 따른다. 대상은 맥 로컬에서 시작 1분 부하 150 미만으로 관찰한 실패다. s-riverdeal처럼 부하 무효(CM-LOAD)로 걸러진 실행만 있으면 간헐로 세지 않는다. 다만 근거 이슈(#40)는 둔다. CI에서만 나는 예외는 RG-OPS-04가 맡는다. | | | | |

## 보안·개인정보

| ID | 구간 | 확인 | 무엇을 | 통과 조건 | 절차 | 이미 있는 검사 | 원문 |
|---|---|---|---|---|---|---|---|
| RG-SEC-01 | 8 | Node 검사 | 앱이 비밀 키(sb_secret_, service_role)와 anon이 아닌 JWT·깨진 키를 거부하고, 공개 키만 받는다. | keycheck.js 종료 0, 요약의 실패 0 | node tests/league/keycheck.js > <R>/keycheck.log 2>&1; echo exit=$?; tail -2 <R>/keycheck.log | tests/league/keycheck.js cases 배열(18~31행: service-role·authenticated·missing-role·malformed·secret 거부, anon·publishable 허용) | .claude/rules/league-econ.md 다섯째 항목; docs/CLASSROOM-CHECK-LEAGUE.md 0.2(18행); docs/DEV-WORKFLOW.md §4.4(176행) |
| RG-SEC-02 | 8 | Node 검사 | D-64 서명·순번·세션·크기 제한·저장 이전 계약이 지켜진다. | 마지막 줄 'checks N fail 0', N>0, 종료 0 | node tests/league/sec.js > <R>/sec.log 2>&1; echo exit=$?; tail -1 <R>/sec.log | tests/league/sec.js(main 끝에 'checks ${checks} fail 0' 출력) | docs/DECISIONS.md D-64 '검증'(266행 절); docs/DEV-WORKFLOW.md §4.3-2(139행) |
| RG-SEC-03 | 8 | Node 검사 | 6팀 36달 공개 상태 크기가 D-77 실패선·회귀선 안이다. | size-budget.js 출력 'problems: 0', 종료 0 | node tests/league/size-budget.js > <R>/size.log 2>&1; echo exit=$?; rg -n 'problems:' <R>/size.log | tests/league/size-budget.js(압축 실패선 165,000B, 회귀선 155,099B) | docs/DECISIONS.md D-77 '검증'(372행 절), D-64 '크기' |
| RG-SEC-04 | 8 | Node 검사 | 전송 상한 계약(Supabase 256,000B·로컬 200,000B)이 지켜진다. | chanlimit.js 실패 0, 종료 0 | node tests/league/chanlimit.js > <R>/chanlimit.log 2>&1; echo exit=$? | tests/league/chanlimit.js(브라우저판 chanlimit.py는 RG-REG-07) | docs/DECISIONS.md D-77 '실제 채널 한도'·'전송 실패 감지'; docs/DEV-WORKFLOW.md §4.3-2(139행) |
| RG-SEC-05 | 8 | 코드 확인 | 저장소 파일에 실제 모양의 비밀 키·공개 키·Supabase 프로젝트 주소가 없다. | 아래 명령 출력 0줄 | git grep -nIoE '<KEYPAT>' <RC> -- . \| rg -v ':(<KEYOK>)$' | 없음(§7 247행: 비밀 키 모양 규칙 검사는 CI에 없음) | docs/DEV-WORKFLOW.md §2(48행), §7(247행), §12(421행); D-93 |
| | | | 비고: D-93을 따른다. 옛 패턴(sb_publishable_ 뒤 8자 이상)과 'grep -v fixture'에는 두 문제가 있었다. 검사용 가짜 키 'sb_publishable_test_key'(tests/league/chanlimit.py·mocktest.py·recover.py의 4줄)에 걸려 거짓 실패를 냈고, 'fixture'가 든 줄이면 무엇이든 빠지는 구멍이 있었다. 작성 시(90bc621) 이 명령의 출력은 0줄이다. 해석: 48행의 '비밀 키, Supabase 프로젝트 주소·키'를 공개 키까지 포함한 것으로 읽었다. 확인 못 함: 실제 키가 접두 뒤 20자 안에 '_'·'-'를 담는 형식이면 <KEYPAT>가 놓친다. 첫 배포 전에 대시보드의 실제 키 모양과 한 번 대조한다. 키 값은 어디에도 적지 않는다. | | | | |
| RG-SEC-06 | 8 | 코드 확인 | 커밋 메시지에 비밀 키·Supabase 주소 모양 문자열이 없다. | 아래 명령 출력 0줄 | git log --format=%B <MAIN0>..<RC> \| rg -no '<KEYPAT>' \| rg -v ':(<KEYOK>)$' | 없음 | docs/DEV-WORKFLOW.md §2(45·48행), §5(183행) |
| | | | 비고: 작성 시(f87b406..90bc621) 출력 0줄. | | | | |
| RG-SEC-07 | 8 | 문서 확인 | GitHub의 이슈·PR 제목·본문·댓글·리뷰에 비밀 키·Supabase 주소 모양 문자열이 없다. | 아래 두 명령 출력 0줄 | gh issue list --repo yurowa90/kentech --state all --limit 1000 --json number,title,body,comments \| rg -o '<KEYPAT>' \| rg -vx '<KEYOK>'; gh pr list --repo yurowa90/kentech --state all --limit 1000 --json number,title,body,comments,reviews \| rg -o '<KEYPAT>' \| rg -vx '<KEYOK>' | 없음 | docs/DEV-WORKFLOW.md §2(45~49행); DECISIONS.md D-92 10 |
| RG-SEC-11 | 8 | 문서 확인 | <W>의 각 PR이 기기 밖으로 새로 보내는 값의 유무를 표시했다. | <W> 각 PR 본문에 '- [x] 기기 밖으로 새로 보내는 값이 없다' 줄이 있음(값이 있으면 그 줄에 'D-' 번호). 표시 없는 PR 0 | <W>의 각 번호로 gh pr view <n> --repo yurowa90/kentech --json body --jq .body \| rg -n '\[x\] 기기 밖으로 새로 보내는 값이 없다' | .github/pull_request_template.md '엔진 계산' 마지막 줄 | docs/DEV-WORKFLOW.md §14(439행), §4.3-6(171행) |
| | | | 비고: 관문 시점 A(B에서 소급해 감사). PR 양식은 D-92(10-30)와 함께 도입됐다. 그 전에 병합된 것은 범위 밖이다. | | | | |
| RG-SEC-12 | 8 | 문서 확인 | 릴리스 때 올리는 글이 금칙어 목록 거르기를 통과한다(대상: CHANGELOG의 해당 판 절, 릴리스 준비 PR·main PR 본문, 태그 메시지, 그 기간의 리뷰 게시 사본·이슈 닫는 댓글, GitHub 릴리스 본문). | 대상마다 rg -n -i -f <FW> 출력 0줄 | gh pr view <n> --repo yurowa90/kentech --json body --jq .body > <R>/body.md; rg -n -i -f <FW> <R>/body.md. git cat-file -p <TAG> \| rg -n -i -f <FW>. awk '/^## \[1\.0\.0-rc\.N\]/{f=1;print;next} /^## \[/{f=0} f' CHANGELOG.md \| rg -n -i -f <FW> | 없음(§7 247행: 금칙어 검사는 CI에 없음) | docs/DEV-WORKFLOW.md §2 '올리기 전 거르기'(51~60행), §11(373·384·391행); DECISIONS.md D-92 10 |
| | | | 비고: 관문 시점 B(rc)와 D(정식 판). | | | | |
| RG-SEC-13 | 8 | 문서 확인 | D-92 이후 커밋 메시지가 금칙어 거르기를 통과한다. | 아래 명령 출력 0줄 | git log --format=%B <D92>..<RC> \| rg -n -i -f <FW> | 없음 | docs/DEV-WORKFLOW.md §5(183행); CLAUDE.md '저장소 규칙' |
| RG-SEC-14 | 8 | 문서 확인 | D-92 이후 작성한 커밋에 세션 서명 줄이 없고, PR에 생성 도구 표시 줄이 없다. | 첫 명령 출력 0줄, <W> PR 본문의 'Generated with' 0회 | git log --since="$(git log -1 --format=%aI <D92>)" --format=%B <MAIN0>..<RC> \| rg -n '^(Co-Authored-By\|[A-Za-z]+-Session):'; <W> 각 PR에 gh pr view <n> --repo yurowa90/kentech --json body --jq .body \| rg -c 'Generated with' | 없음 | docs/DEV-WORKFLOW.md §5(184행), §6.1(209행); DECISIONS.md D-92 10; CLAUDE.md '저장소 규칙' |
| | | | 비고: 해석: 10-07 결정은 이미 올린 커밋을 다시 쓰지 않는다는 것이다. 그래서 범위를 D-92 이후 작성분으로 두었다. 사용자가 결정 번호로 허락한 예외는 빼고 센다. 세션 주소 줄은 제품 이름을 적지 않고 '-Session:' 꼴로 찾는다. 작성 시(90bc621) 첫 명령 출력 0줄. | | | | |
| RG-SEC-15 | 8 | 독립 평가 | 공개 글과 캡처에 학생 정보가 없다(눈 확인). | 평가자 기록의 발견 건수 합계 0 | CM-EVAL 규칙에 맞는 맥락 없는 평가자 1명(이 저장소 작업에 참여하지 않은 새 세션)에게 대상 목록만 준다. 대상은 CHANGELOG 해당 판 절, 릴리스 준비·main PR 본문과 댓글, <W> PR 본문·댓글·첨부 캡처, 교실 확인 기록이다. 평가자는 다음을 항목마다 세어 표로 낸다: 학생 이름·학번·생년월일·성적, 학교 식별 정보, 학생이 쓴 글, 학생 입력이 보이는 캡처. 합계가 0이면 통과다. 준 입력 묶음(대상 목록, 판 SHA)은 CM-EVAL 형식으로 기록한다. | 없음 | docs/DEV-WORKFLOW.md §2(46·59행 '학생 정보는 목록으로 거를 수 없으므로 눈으로 본다'), §13(428행); docs/CLASSROOM-CHECK-LEAGUE.md 3행 |
| | | | 비고: 관문 시점은 B다. 교실 확인 기록은 D에서 같은 방식으로 한 번 더 본다. | | | | |
| RG-SEC-16 | 8 | 브라우저 검사 | 리그 학생 입력(일지 이유·S8 다음 달 이유·반문 답)에 HTML을 넣어도 다시 그릴 때 실행되지 않는다. | 세 칸에 '<img src=x onerror="window.__kcpx=1">가상'을 저장한 뒤 새로고침하고 서랍을 다시 열어도 window.__kcpx가 undefined, 그 칸을 그린 영역 안 img 요소 0 | 맥 로컬, 샌드박스 밖(CM-LOAD 전제). Playwright로 [U]#league/solo를 열어 혼자 하기 1달 결과까지 간다. 세 칸에 위 문자열을 넣고 400ms 기다린다. reload 뒤 일지·결과 서랍을 연다. page.evaluate('window.__kcpx') is None이고, 해당 영역의 locator('img').count()==0인지 본다. | tests/league/next.py:688('<가상 검사>' 문구), tests/accept_probe.py A8(696~711행, 연습 도구), tests/accept_base.py:330(기출). 리그 세 칸을 모두 보는 단언은 없음 | .claude/rules/ui-and-games.md 일곱째 항목; docs/DEV-WORKFLOW.md §4.4(176행) |
| RG-SEC-17 | 제안 | Node 검사 | 보안 방어를 하나씩 지운 변이를 sec.js·keycheck.js가 모두 잡는지 릴리스 판에서 확인한다. | node tests/league/sec.js --mutations, node tests/league/keycheck.js --mutations 각각 종료 0 | node tests/league/sec.js --mutations > <R>/sec-mut.log 2>&1; echo exit=$?; node tests/league/keycheck.js --mutations > <R>/key-mut.log 2>&1; echo exit=$? | 두 파일의 --mutations 모드(CI는 인자 없이 돌림, tests/ci/node-all.sh 143행) | docs/DECISIONS.md D-64 '검증'(--mutations 설명) |
| | | | 비고: D-64는 방법만 적었고 릴리스 관문으로 정하지는 않았다. 그래서 제안으로 둔다. | | | | |
| RG-SEC-18 | 제안 | 코드 확인 | 저장소와 커밋에 주민등록번호·휴대전화 번호 모양 문자열이 없다. | 두 명령 출력 0줄 | git grep -nE '[0-9]{6}-[1-4][0-9]{6}\|01[016789]-?[0-9]{3,4}-?[0-9]{4}' <RC> -- .; git log --format=%B <MAIN0>..<RC> \| rg -n '[0-9]{6}-[1-4][0-9]{6}\|01[016789]-?[0-9]{3,4}-?[0-9]{4}' | 없음 | 일반 QA 관행(개인정보 모양 검사). 저장소 근거는 §2 '학생 정보 쓰지 않음'뿐이고, 문서는 이것을 눈 확인으로만 정했다 |
| | | | 비고: 이름은 기계로 못 거르므로 RG-SEC-15를 대신하지 못한다. | | | | |
| RG-SEC-19 | 제안 | Node 검사 | 팀 요청의 생성·수신 형식(필드 수준)이 결정 없이 바뀌지 않았음을 릴리스 판에서 확인한다. | node tests/league/review/d90-public-contract.js 종료 0, 그리고 이 파일을 node-suites.txt에 넣음 | node tests/league/review/d90-public-contract.js; echo exit=$? | tests/league/review/d90-public-contract.js(91~105행 'D-65 … 팀 요청 생성·수신 형식 불변'). 이름이 숫자로 시작하지 않아 node-all.sh 대조 대상이 아니고 CI에서 돌지 않음 | docs/DECISIONS.md D-65 '새 전송값' |
| | | | 비고: 지금 판에서 통과하는지는 확인하지 않았다. 채택되면 CM-PRIVACY의 허용 필드 목록 판정에 붙이는 것이 자연스럽다. | | | | |
| RG-SEC-20 | 제안 | 코드 확인 | 앱·검사 코드에 저장소 밖 작업 폴더 경로가 없다(#62). | 총괄 금칙어 목록(저장소 밖)의 경로 항목으로 `git grep -nE -f <경로 패턴 파일> <평가 SHA> -- ui tests "*.js" "*.py"`를 돌려 출력 0줄 | 총괄이 금칙어 목록에서 경로 항목만 뽑은 패턴 파일을 저장소 밖에 만들고 `git grep -nE -f <패턴 파일> <평가 SHA> -- ui tests "*.js" "*.py"`. 패턴 자체는 저장소에 적지 않는다. | 없음 | docs/DEV-WORKFLOW.md §2(D-92), 이슈 #62 |
| | | | 비고: 지금 tests/league/review/의 측정 스크립트 몇 개가 걸린다(#62). #62를 고친 뒤 관문(8)으로 올린다. | | | | |

## 외부 의존·네트워크

| ID | 구간 | 확인 | 무엇을 | 통과 조건 | 절차 | 이미 있는 검사 | 원문 |
|---|---|---|---|---|---|---|---|
| RG-EXT-01 | 8 | 코드 확인 | index.html이 외부 주소의 스크립트를 싣지 않는다. | 아래 명령 출력 0 | rg -c '<script[^>]*\bsrc="(https?:)?//' index.html → 출력 없음 | 없음 | CLAUDE.md 첫 문단('외부 스크립트 금지 D-31'); docs/DECISIONS.md D-31(59행); docs/DEV-WORKFLOW.md §4.4(174행) |
| RG-EXT-02 | 8 | 코드 확인 | 앱 코드가 스크립트를 동적으로 불러오거나 문자열을 코드로 실행하지 않는다. | 아래 명령 출력 0줄 | rg -n "createElement\(\s*['\"]script\|\bimport\(\|importScripts\(\|new Function\(\|\beval\(" --glob '*.js' -g '!tests/**' . | 없음 | CLAUDE.md 첫 문단; docs/DECISIONS.md D-31 |
| | | | 비고: 해석: '외부 스크립트 금지'를 동적 로딩까지 포함한 것으로 읽었다. | | | | |
| RG-EXT-03 | 8 | 코드 확인 | 외부에서 받는 자원은 글꼴(Google Fonts)뿐이다. | index.html의 http(s) 줄 가운데 fonts.googleapis.com·fonts.gstatic.com이 아닌 줄 0, CSS의 외부 url()·@import 0 | rg -n 'https?://' index.html \| rg -v 'fonts\.(googleapis\|gstatic)\.com' → 0줄; rg -n "url\(\s*['\"]?(https?:)?//\|@import" --glob '*.css' -g '!tests/**' . → 0줄 | 없음 | .claude/rules/ui-and-games.md 둘째 항목(index.html 순서의 '폰트'); docs/DECISIONS.md D-31 근거('외부 요청이 검사 문제로 잡힘') |
| | | | 비고: 해석: 문서가 허용한 외부 자원은 index.html 순서 규칙에 있는 '폰트' 하나로 읽었다. 화면의 출처 링크(<a href>)는 사용자가 누를 때만 열리므로 대상이 아니다. | | | | |
| RG-EXT-04 | 8 | 코드 확인 | 앱이 브라우저 밖으로 보내는 길은 Supabase Realtime 웹소켓 하나다. | 아래 명령 출력이 정확히 1줄이고, 그 줄이 ui/league-net.js | rg -n "new WebSocket\|fetch\(\|XMLHttpRequest\|sendBeacon\|EventSource\|new Worker\(" --glob '*.js' -g '!tests/**' . | 없음 | README.md '자료 출처와 한계' 끝 항목(입력은 밖으로 보내지 않음); .claude/rules/ui-and-games.md 일곱째 항목; ui/league-net.js 머리 주석 |
| | | | 비고: 해석: '학생 입력은 브라우저 밖으로 보내지 않는다'를, 송신 지점을 멀티 연결 하나로 제한한다는 뜻으로 읽었다. 작성 시점에 관찰한 것은 league-net.js 488행 하나다. 그 길로 나가는 값의 범위는 CM-PRIVACY가 본다. | | | | |
| RG-EXT-05 | 8 | 코드 확인 | WebGL을 쓰지 않는다(Canvas 2D 자체 엔진). | 아래 명령 출력 0줄 | rg -n "getContext\(\s*['\"](webgl2?\|experimental-webgl)" --glob '*.js' -g '!tests/**' . | 없음 | docs/DECISIONS.md D-31(59행) |
| RG-EXT-06 | 제안 | 브라우저 검사 | 배포 판의 프로젝트 주소 칸이 Supabase 주소(https://<ref>.supabase.co 또는 ref) 밖의 웹소켓 주소를 받지 않는다. | 로비 '프로젝트 주소'에 wss://example.invalid/x를 넣고 방을 만들어도 페이지의 WebSocket 생성 0 | Playwright로 [U]#league를 열고 page.on('websocket')를 센다. 온라인 연결 방식에 위 주소와 합성 anon 키를 넣고 '새 방 만들기'를 누른다 → 5초 뒤 카운트 0 | 없음(ui/league-net.js wsUrl 417~422행은 검사용으로 ws(s):// 전체 주소를 그대로 받는다. 가짜 서버 거부는 live.py 쪽에만 있음) | 문서 근거 없음. 일반 QA 관행(연결 대상 고정) |
| | | | 비고: 검사 경로가 이 동작에 기대므로, 넣을 경우 검사 전용 플래그로 나눠야 한다. | | | | |
| RG-EXT-07 | 제안 | 브라우저 검사 | Google Fonts가 막힌 망에서도 앱이 같은 흐름으로 돈다. | Google Fonts 요청을 막은 상태에서 CM-REG의 browser --all 판정 통과 | CM-REG의 browser --all 실행을 그대로 쓴다. 대부분의 검사가 econui.context_for로 Google Fonts CSS를 빈 응답으로 막는다. 교실 확인(RG-DEP-16) 때 교실망에서 fonts.googleapis.com에 접근되는지도 기록한다. | tests/league/econui.py context_for(글꼴 CSS 차단) — tests/ci/README.md '최종 판정은 맥 로컬' | docs/DEV-WORKFLOW.md §7.1(234행) |
| | | | 비고: 문서는 이것을 검사 환경 설명으로만 적었고 관문으로 정하지 않았다. | | | | |
| RG-EXT-08 | 제안 | 브라우저 검사 | 배포 글꼴(IBM Plex Sans KR 등)을 실제로 받은 상태에서도 화면 측정 검사가 통과한다. | 글꼴을 막지 않은 맥 로컬 실행에서 d82ux·rev11·rev8c·rev10·econui·rev12·v3a·score1 judge 0 | 글꼴 차단을 끄는 실행 옵션을 만든다. 그 뒤 browser.sh로 여덟 검사를 이름으로 돌리고 judge.py로 판정한다. | 없음(§7.1 '배포 글꼴로 재는 검사는 아직 없다') | docs/DEV-WORKFLOW.md §7.1(234행); tests/ci/README.md '최종 판정은 맥 로컬' |

## 콘텐츠·법

| ID | 구간 | 확인 | 무엇을 | 통과 조건 | 절차 | 이미 있는 검사 | 원문 |
|---|---|---|---|---|---|---|---|
| RG-CON-01 | 8 | 코드 확인 | 앱 파일에 실제 민간 회사 이름이 없다. | 아래 명령 출력 0줄 | rg -n '삼성\|현대(자동차\|제철\|건설\|모비스\|차)\|SK(하이닉스\|이노베이션\|에너지\|E&S\|온)\|LG(전자\|화학\|에너지솔루션\|디스플레이)\|한화\|포스코\|POSCO\|두산\|롯데\|효성\|GS(칼텍스\|EPS\|E&R\|건설)\|고려아연\|테슬라\|Tesla\|TSMC\|BYD\|CATL' --glob '*.js' --glob '*.css' --glob 'index.html' -g '!tests/**' -g '!docs/**' . | 없음(tests/league/prerec-node.js·d82ux-node.js는 주석으로만 약속) | .claude/rules/league-econ.md 넷째 항목; docs/DECISIONS.md D-63(262행); docs/DEV-WORKFLOW.md §4.4(175행) |
| | | | 비고: 목록은 완전하지 않다(국내 대기업·전력·배터리 위주). 목록 밖 이름은 RG-CON-03이 이름 필드에서 함께 본다. 해석: D-63은 출처 줄에 공공기관·공기업·언론 이름만 허용한다. 그래서 민간 기업명은 출처 줄에서도 0이어야 한다. 작성 시(90bc621) 출력 0줄. | | | | |
| RG-CON-02 | 8 | 코드 확인 | 공공기관·공기업 이름은 출처 자리(자료의 출처 필드와 주석)에만 나온다. | ①의 첫 줄이 0이다. 자료 파일에서 기관명이 note·gradeNote·src·source·sources 필드와 그 배열 원소 밖에 나오지 않는다는 뜻이다. ②의 출력도 0줄이다. 주석은 ①에서 읽히지 않고 ②에서 빠지므로 허용된다 | ① 자료 파일: node -e 'global.window={KCP:{route(){},on(){},esc:String}};global.document={documentElement:{}};for(const f of ["build-maps","tech-data","econ-data","league-data"])require("./ui/"+f+".js");const K=window.KCP,re=/한국전력\|한전\|전력거래소\|한국수력원자력\|한수원\|한국가스공사\|발전공기업/,ok=new Set(["note","gradeNote","src","source","sources"]),bad=[];const walk=(o,p,k)=>{if(typeof o==="string"){if(re.test(o)&&!ok.has(k))bad.push(p+"\t"+o);return}if(!o\|\|typeof o!=="object")return;for(const[kk,v]of Object.entries(o))walk(v,p+"."+kk,/^\d+$/.test(kk)?k:kk)};walk({E:K.ECON_DATA,T:K.TECH_DATA,L:K.LEAGUE_REGIONS,B:K.BUILD_MAPS},"","");console.log(bad.length);bad.forEach(x=>console.log(x))' → 첫 줄 0. ② 자료 밖 앱 코드: rg -n '한국전력\|한전\|전력거래소\|한국수력원자력\|한수원\|한국가스공사\|발전공기업' --glob '*.js' -g '!tests/**' -g '!ui/econ-data.js' -g '!ui/league-data.js' -g '!ui/tech-data.js' -g '!ui/build-maps.js' . \| rg -v ':[0-9]+:\s*(//\|\*\|/\*)' → 0줄 | 없음 | docs/DECISIONS.md D-63(262행); D-93 |
| | | | 비고: D-93을 따른다. p(값, 등급, 설명)의 셋째 인자는 반환 객체의 note가 되므로(ui/econ-data.js 13행) ①에서 note로 잡힌다. 배열 원소는 배열의 키(sources 등)를 물려받는다. 해석: gradeNote는 사건 근거 등급의 출처 설명 필드라 note 계열로 읽었다. 작성 시(90bc621) 자료 안 일치는 15개이고 모두 허용 필드다(note 7, gradeNote 3, sources 5). 자료 밖은 0줄이다. 옛 줄 grep은 p() 줄, 블록 주석 줄, sources 배열 원소 7줄에서 거짓 실패를 냈다. 결정은 줄 grep에서 '^\s*\*'·'p\(' 줄도 출처 줄로 인정한다. 그래도 배열 원소 줄은 걸리므로 자료 파일에는 ①을 쓴다. 한계: ①은 자료 파일 안 함수 본문의 문자열을 보지 못한다. | | | | |
| RG-CON-03 | 8 | 코드 확인 | 게임 속 설비·사건·기업 제안의 이름에 기관·회사 이름이 없다. | 자료의 모든 name 필드 목록에 RG-CON-01·02 정규식 일치 0 | node -e 'global.window={KCP:{route(){},on(){},esc:String}};global.document={documentElement:{}};for(const f of ["build-maps","tech-data","econ-data","league-data"])require("./ui/"+f+".js");const K=window.KCP,out=[];const walk=(o,p)=>{if(!o\|\|typeof o!=="object")return;for(const[k,v]of Object.entries(o)){if(k==="name"&&typeof v==="string")out.push(p+"\t"+v);else walk(v,p+"."+k)}};walk({E:K.ECON_DATA,T:K.TECH_DATA,L:K.LEAGUE_REGIONS},"");console.log(out.join("\n"))' \| rg -n '<RG-CON-01 정규식>\|<RG-CON-02 정규식>' → 0줄 | 없음 | docs/DECISIONS.md D-63('게임 속 설비·사건·기업 제안의 주체로는 쓰지 않는다'); docs/HANDOFF-econ.md §6 |
| RG-CON-04 | 8 | 코드 확인 | 자료 파일 밖의 앱 코드 문자열에 도시 이름을 직접 적지 않는다. | 아래 명령 출력 0줄 | rg -n '[\x22\x27\x60][^\x22\x27\x60]*(평택\|당진\|천안\|아산\|화성\|오산\|안성)[^\x22\x27\x60]*[\x22\x27\x60]' ui/league.js ui/league-core.js ui/league-net.js ui/league-ai.js ui/econ.js ui/build.js app.js \| rg -v ':\s*(//\|\*)' | 없음 | .claude/rules/league-econ.md 셋째 항목; docs/DECISIONS.md D-58(241행)·D-86(461행); docs/DEV-WORKFLOW.md §4.4(175행) |
| | | | 비고: '예산'(군)은 D-55에서 빠졌다. '예산'(budget)이라는 낱말과도 겹쳐 목록에서 뺐다. 자료 무리(econ-data·league-data·build-maps·tech-data, §4.3)는 대상 밖이다. 줄 끝 주석에 도시 이름이 있으면 거짓 양성이 나므로, 사람이 주석인지 확인한다. 작성 시(90bc621) 출력 0줄. | | | | |
| RG-CON-05 | 8 | 코드 확인 | 도시 이름 규칙(D-58)이 생긴 뒤 검사 코드에 더한 줄에 도시 이름을 직접 적지 않는다. 알려진 예외 목록 밖의 새 줄이 없다. | 아래 명령의 마지막 출력이 0이다. 예외 목록의 줄마다 파일:줄 번호와 까닭이 적혀 있다 예외 목록은 tests/ci/city-name-exceptions.txt(줄마다 파일<탭>줄 내용<탭>까닭). 파일이 없으면 확인 못 함. | git diff -U0 <D58>..<RC> -- 'tests/*.py' 'tests/*.js' 'tests/*.mjs' 'tests/*.sh' \| awk '/^\+\+\+ b\//{f=substr($0,7)} /^\+[^+]/{sub(/^\+[ \t]*/,"");print f"\t"$0}' \| rg -v '\t(#\|//\|\*\|/\*)' \| rg '[\x22\x27\x60][^\x22\x27\x60]*(평택\|당진\|천안\|아산\|화성\|오산\|안성)[^\x22\x27\x60]*[\x22\x27\x60]' \| sort -u > <R>/city-new.tsv; 알려진 예외 목록에서 '파일<탭>줄 내용'만 뽑아 sort -u > <R>/city-known.tsv; comm -23 <R>/city-new.tsv <R>/city-known.tsv \| wc -l → 0 | 없음 | .claude/rules/league-econ.md 셋째 항목('검사에 직접 적지 않는다(새로 쓰는 곳은 자료의 이름 필드를 참조)'); docs/DECISIONS.md D-58·D-86; D-93 |
| | | | 비고: D-93을 따른다. 기준 시점은 도시 이름 규칙을 처음 문서화한 커밋 <D58>(57f27d3, 10-03)이다. DECISIONS D-58과 .claude/rules/league-econ.md의 해당 문장이 이 커밋에 함께 들어왔다(git log -S로 확인). 주석 줄은 뺀다. 해석 두 가지: 규칙의 '검사'를 검사 코드(.py·.js·.mjs·.sh)로 읽고, 실행 결과 기록(review/*.json, 보고 .md)은 뺐다. 결과 기록까지 넣으면 작성 시 약 1,100줄이고 대부분 G6~G9 결과 JSON이다. 대조는 파일 이름과 줄 내용으로 한다. 줄 번호는 판마다 바뀌므로 기록용이다. 작성 시(90bc621) 예외 후보는 59줄, 24개 파일이다. 예외 목록의 위치(D-93에 붙임 또는 tests/ci 아래 목록 파일)는 총괄이 정한다. | | | | |
| RG-CON-08 | 8 | Node 검사 | 자료 파일의 숫자마다 근거 등급과 출처가 붙어 있다. | review/41-evidence-all.js·review/39-evidence-params.js 실패 줄 0, 종료 0 | CM-REG의 Node 전체 로그에서 두 검사 로그에 rg -n '^(FAIL\|not ok\|✖)' → 0줄. 단독: node tests/league/review/41-evidence-all.js; node tests/league/review/39-evidence-params.js | tests/league/review/41-evidence-all.js, tests/league/review/39-evidence-params.js | .claude/rules/league-econ.md 둘째 항목; docs/DECISIONS.md D-60(250행) |
| RG-CON-09 | 8 | 브라우저 검사 | 경제 모드 화면에 '표시 없는 수치는 게임 가정' 범례 한 줄이 있다. | ASSUMPTIONS 상수를 쓰는 두 화면(팀·혼자 하기 도시 서랍, league.js 3139행의 경제 화면)에서 '표시 없는 수치는 게임 가정이에요' 1회 이상 | 맥 로컬, 샌드박스 밖(CM-LOAD 전제). [U]#league/solo에서 혼자 하기 경제 모드로 1달 운영하고 도시 서랍을 연다 → page.get_by_text('표시 없는 수치는 게임 가정이에요').count() ≥ 1. 3139행 화면도 같은 방식으로 본다. | 없음 | docs/DECISIONS.md D-60(250행 '각 화면에 한 줄'), D-72(354행 학생 말 범례) |
| | | | 비고: 해석: D-60의 '각 화면'을, 코드가 범례를 넣는 리그 경제 화면으로 좁혀 읽었다. | | | | |
| RG-CON-10 | 8 | Node 검사 | 실제 사건 자료의 출처·기준 시점·발표 시점 표시 계약이 지켜진다. | evsrc-node.js 실패 0, 종료 0 | node tests/league/evsrc-node.js; echo exit=$? (CM-REG의 Node 전체에 포함되므로 그 로그로 갈음할 수 있다) | tests/league/evsrc-node.js | docs/DECISIONS.md D-60('실제 자료 값은 출처·기준연도·단위와 함께') |
| RG-CON-11 | 8 | 브라우저 검사 | 학생 기본 화면에 근거 등급 글자 (G)·(M)·(P)·(O)·(O*)가 드러나지 않는다. | 팀·혼자 하기·진행자 기본 화면의 보이는 글자에서 '\((O\*?\|P\|M\|G)\)' 일치 0(자세히 보기·근거 카드·교사용 패널은 제외) | CM-REG의 browser --all 로그에서 econui·tech의 D-72 단언이 PASS이고, rg -n '^FAIL'이 0줄인지 본다. | tests/league/econui.py(600~602행 D-72), tests/league/tech.py(401~402행) | docs/DECISIONS.md D-72(354행), D-60 |
| RG-CON-12 | 8 | 문서 확인 | 새 학생 문구가 있는 병합 PR은 맞춤법 확인을 거쳤다. | <W> 가운데 '새 학생 문구' 표에 행이 있는 PR마다 '- [x] 맞춤법 확인' 1회. 미체크 0 | gh pr view <n> --repo yurowa90/kentech --json body --jq .body 에서 '## 새 학생 문구' 표의 행 수를 세고, rg -c '\[x\] 맞춤법 확인' | .github/pull_request_template.md '새 학생 문구' 체크 칸 | docs/DEV-WORKFLOW.md §4.2(122행), §14(441행) |
| | | | 비고: 관문 시점 A(B에서 소급해 감사). | | | | |
| RG-CON-13 | 8 | 문서 확인 | 새 학생 문구가 있는 병합 PR은 사용자 편집 판단을 마쳤다. | 같은 PR들의 '사용자 편집 판단:' 값이 '그대로' 또는 '고침…'. '대기'·빈칸 0 | gh pr view <n> --repo yurowa90/kentech --json body --jq .body \| rg -n '사용자 편집 판단:' | .github/pull_request_template.md | docs/DEV-WORKFLOW.md §4.2(122행), §14(441행 '…사용자 편집 판단을 거쳤고') |
| | | | 비고: 관문 시점 A(B에서 소급해 감사). 해석: §14의 '거쳤고'를 '대기가 아님'으로 읽었다. | | | | |
| RG-CON-14 | 8 | 코드 확인 | 지도 캡처 원본이 저장소에 없다. | 아래 명령 출력 0 | git ls-tree -r --name-only <RC> \| rg -ic '\.(png\|jpe?g\|webp\|gif\|bmp\|tiff?\|heic)$' | 없음 | .claude/rules/league-econ.md 넷째 항목; docs/HANDOFF-econ.md §6 |
| | | | 비고: 작성 시점 저장소의 그림 파일은 0개다. 해석: 앞으로 그림이 생기면, 파일마다 지도 캡처가 아니라는 기록으로 통과시킨다. | | | | |

## 배포·실연결

| ID | 구간 | 확인 | 무엇을 | 통과 조건 | 절차 | 이미 있는 검사 | 원문 |
|---|---|---|---|---|---|---|---|
| RG-DEP-01 | 8 | 문서 확인 | 미리보기 배포 전에 사용자 확인을 받았고, 확인 내용에 필요한 다섯 요소가 있다. | 확인 기록 1건에 다섯 요소가 모두 있고, 기록 시각이 배포 시각보다 앞선다. 다섯 요소: 태그·SHA, 프로젝트 이름·주소, 볼 수 있는 사람, 비용(무료 요금제 범위인지), 사본 파일 목록 | 총괄 기록과 PROGRESS 배포 줄을 대조한다. 배포 시각은 npx --yes wrangler@<고정 판> pages deployment list --project-name <프로젝트>의 생성 시각으로 본다. | 없음 | docs/DEV-WORKFLOW.md §12(397행); CLAUDE.md '저장소 규칙'(Cloudflare 배포는 사용자 확인 뒤); DECISIONS.md D-92 9·허락 범위 |
| | | | 비고: 관문 시점 C. | | | | |
| RG-DEP-02 | 8 | 코드 확인 | 배포 사본의 모든 파일이 태그 판과 바이트 단위로 같다. | 아래 명령 출력 0 | (cd "<D>" && find . -type f \| sed 's\|^\./\|\|') \| while read -r f; do git show "<TAG>:$f" \| cmp -s - "<D>/$f" \|\| echo "DIFF $f"; done \| grep -c DIFF | 없음 | docs/DEV-WORKFLOW.md §12(398~407행, git archive로 꺼낸 사본) |
| | | | 비고: 관문 시점 C. | | | | |
| RG-DEP-03 | 8 | 코드 확인 | 배포 사본에 앱이 쓰는 파일만 있다. | 첫 명령 출력이 둘째 명령(tech-data sources의 docs 목록)과 정확히 같다. README.md·CHANGELOG.md·CLAUDE.md·tests/·.claude/·.github/ 0개 | (cd "<D>" && find . -type f \| sort) \| rg -v '^\./(index\.html\|[^/]+\.(js\|css)\|(ext\|games\|ui)/.+)$' ↔ (cd <TAG 사본> && node -e 'global.window={KCP:{}};require("./ui/tech-data.js");const s=new Set();window.KCP.TECH_DATA.cards.forEach(c=>(c.sources\|\|[]).forEach(x=>typeof x==="string"&&x.startsWith("docs/")&&s.add(x.split("#")[0])));console.log([...s].map(x=>"./"+x).sort().join("\n"))') | 없음 | docs/DEV-WORKFLOW.md §12(398~409행) |
| | | | 비고: 관문 시점 C. 10-30 판의 docs 목록은 ECON-TECH-SPEC.md·ECON-TECH.md 둘이다(§12 409행). | | | | |
| RG-DEP-04 | 8 | 문서 확인 | 배포 사본에 넣은 docs 파일이 금칙어 거르기를 통과한다. | 아래 명령 출력 0줄 | rg -n -i -f <FW> "<D>/docs" | 없음 | docs/DEV-WORKFLOW.md §12(409행) |
| | | | 비고: 관문 시점 C. | | | | |
| RG-DEP-05 | 8 | 코드 확인 | 배포 사본에 비밀이 없다(Supabase 주소·키는 진행자가 로비에서 입력). | 아래 명령 출력 0줄 | rg -noI '<KEYPAT>' "<D>" \| rg -v ':(<KEYOK>)$' | 없음 | docs/DEV-WORKFLOW.md §12(421행) |
| | | | 비고: 관문 시점 C. <KEYPAT>·<KEYOK>는 RG-SEC-05와 같다. | | | | |
| RG-DEP-06 | 8 | 코드 확인 | wrangler를 전역 설치하지 않고, 판을 적은 npx로 부른다. | 배포 명령 기록이 'npx --yes wrangler@[0-9]+\.[0-9]+\.[0-9]+' 꼴이고 같은 판이 DEV-WORKFLOW §12에 적혀 있다. npm ls -g wrangler 결과에 wrangler 없음 | rg -n 'wrangler@[0-9]+\.[0-9]+\.[0-9]+' docs/DEV-WORKFLOW.md; npm ls -g wrangler | 없음 | docs/DEV-WORKFLOW.md §12(410행 '판은 첫 배포 전 사용자 확인 때 정해 이 문서에 적는다') |
| | | | 비고: 관문 시점 C. | | | | |
| RG-DEP-07 | 8 | 실연결 | 방금 한 배포가 운영이 아니라 미리보기 환경에 올라갔다. | 배포 목록 첫 줄의 Environment = Preview, Branch = rc | npx --yes wrangler@<고정 판> pages deployment list --project-name <프로젝트> (Production이면 멈추고 사용자에게 알린다) | 없음 | docs/DEV-WORKFLOW.md §12(419행) |
| | | | 비고: 관문 시점 C. | | | | |
| RG-DEP-08 | 8 | 실연결 | 미리보기 주소가 https이고 그 주소에서 팀이 앉을 수 있다(WebCrypto 사용 가능). | 주소가 'https://'로 시작하고, 그 주소의 로비에서 !!crypto.subtle === true, '이 주소에서는 팀이 앉을 수 없어요' 0회 | 맥 로컬 샌드박스 밖 Playwright 또는 실제 태블릿으로 <미리보기 주소>/index.html#league를 연다 → page.evaluate('!!crypto.subtle'), page.get_by_text('이 주소에서는 팀이 앉을 수 없어요').count() | 없음(ui/league.js 2722행 경고 문구만 있음) | docs/DEV-WORKFLOW.md §12(395행); docs/DECISIONS.md D-64(무서명 우회 없음); docs/CLASSROOM-CHECK-LEAGUE.md 0.1(17행) |
| | | | 비고: 관문 시점 C. | | | | |
| RG-DEP-09 | 8 | 문서 확인 | 배포 기록이 인계 문서에 남아 있다. | docs/PROGRESS.md에 그 배포의 주소·태그·시각 세 요소가 한 기록에 있음 | rg -n 'pages\.dev' docs/PROGRESS.md → 그 줄에 <TAG>와 시각이 있는지 확인 | 없음 | docs/DEV-WORKFLOW.md §12(423행) |
| | | | 비고: 관문 시점 C. | | | | |
| RG-DEP-10 | 8 | 교실 | 새 판을 올린 뒤 수업 전에 모든 기기를 새로고침했다. | 교실 확인 기록에서 새로고침한 기기 수 = 사용 기기 수(노트북 + 태블릿) | 수업 전날까지 CLASSROOM-CHECK-LEAGUE 0.5대로 노트북·태블릿을 모두 새로고침한다. 기기별 결과는 CM-DEVICE 양식으로 기록한다. | tests/league/snapcompat.py(옛 탭의 판본 혼재 안내, 실기기 아님) | docs/DEV-WORKFLOW.md §12(422행); docs/CLASSROOM-CHECK-LEAGUE.md 0.5(21행); docs/DECISIONS.md D-77 '판본 혼재와 운영 원칙' |
| | | | 비고: 관문 시점 D. | | | | |
| RG-DEP-11 | 8 | 문서 확인 | 수업 중에는 배포하지 않는다. | 배포 목록의 생성 시각이 모두 수업 시간 기록 구간 밖 | wrangler pages deployment list의 시각과 교실 확인·수업 기록의 시작·끝 시각을 대조한다. | 없음 | docs/DECISIONS.md D-77('수업 중에는 배포하지 않고') |
| | | | 비고: 관문 시점 D. | | | | |
| RG-DEP-12 | 8 | 문서 확인 | Supabase 재개와 live.py 실행 전에 사용자 확인을 받았다. | 확인 기록 시각 < 재개 시각, 확인 기록 시각 < live.py 실행 시각 | 총괄 기록·PROGRESS의 사용자 확인 줄과 Supabase 재개·live.py 실행 시각을 대조한다. | 없음 | docs/DEV-WORKFLOW.md §13(427행); CLAUDE.md '저장소 규칙'; .claude/rules/league-econ.md 다섯째 항목 |
| | | | 비고: 관문 시점 D(현장 확인 앞). | | | | |
| RG-DEP-13 | 8 | 실연결 | 현장 확인 전에 Supabase 프로젝트가 활성 상태다. | 대시보드 상태가 활성(일시 중지 아님)인 기록, 확인 시각 기재 | 사용자 확인 뒤 대시보드에서 프로젝트 상태를 보고 기록한다. | 없음 | docs/CLASSROOM-CHECK-LEAGUE.md 0.2(18행) |
| | | | 비고: 관문 시점 D. | | | | |
| RG-DEP-14 | 8 | 실연결 | rc 태그 판이 실제 Supabase 연결 검사를 통과한다. | 마지막 줄 'checks N fail 0'(N>0), '^SKIP' 줄 0, 종료 0 | <TAG>를 꺼낸 작업 폴더에서 [U]를 띄운다(tests/.venv/bin/python으로 srv.py를 실행해도 된다). read 'KCP_SB_URL?…'; read -s 'KCP_SB_KEY?…'; export KCP_SB_URL KCP_SB_KEY; tests/.venv/bin/python tests/league/live.py [U] > <R>/live.log 2>&1; echo exit=$?; unset KCP_SB_URL KCP_SB_KEY; tail -1 <R>/live.log; rg -c '^SKIP' <R>/live.log | tests/league/live.py, tests/league/live.md | docs/DEV-WORKFLOW.md §13(427행); docs/CLASSROOM-CHECK-LEAGUE.md '자동 검사로 확인한 것'(12행) |
| | | | 비고: 관문 시점 D. 환경 변수가 없으면 live.py는 SKIP을 찍고 'checks 0 fail 0'으로 종료 0을 낸다(live.md). 그래서 N>0을 따로 본다. 해석: §13이 현장 확인 단계에 live.py를 넣으므로 rc 태그 판에서 돌린 것을 기준으로 판정한다. 지연(중앙·최대)은 합격 임계값이 없어 기록만 한다. 학생 서술 미전송 단언은 CM-PRIVACY가 같은 로그를 인용한다. | | | | |
| RG-DEP-15 | 8 | 실연결 | 6팀 12·36달 최대 공개 상태가 실제 채널로 도착한다. | live.log에 '^PASS 6팀 (12\|36)달 최대 스냅\([0-9]+B\) 실제 채널 도착' 2줄 | rg -c '^PASS 6팀 (12\|36)달 최대 스냅\([0-9]+B\) 실제 채널 도착' <R>/live.log → 2 | tests/league/live.py bigsnap_scenario(615행부터) | docs/CLASSROOM-CHECK-LEAGUE.md '메시지 크기'(13행); docs/DECISIONS.md D-77 '실제 채널 한도' |
| | | | 비고: 관문 시점 D. | | | | |
| RG-DEP-16 | 8 | 교실 | 교실 무선망에서 Supabase 웹소켓이 막히지 않는다. | 교실에서 노트북이 만든 온라인 방에 태블릿 1대가 참가해 도시 화면까지 들어간 기록 1건 | CLASSROOM-CHECK-LEAGUE 0.3대로 교실 무선망에서 온라인 방을 만들고 태블릿 한 대로 참가한다. 결과는 CM-DEVICE 양식(날짜, 기기·OS·브라우저 판, 판 SHA, 결과, 학생 정보 없음)으로 남긴다. | 없음 | docs/CLASSROOM-CHECK-LEAGUE.md 0.3(19행) |
| | | | 비고: 관문 시점 D. | | | | |
| RG-DEP-17 | 제안 | 실연결 | 미리보기 주소가 검색에 노출되지 않는다. | 배포 사본에만 _headers('X-Robots-Tag: noindex')가 있고, 응답 헤더에 그 값이 있음 | curl -sI <미리보기 주소>/index.html \| rg -i 'x-robots-tag: *noindex' | 없음 | docs/DEV-WORKFLOW.md §12(420행, 제안); DECISIONS.md D-92 '남은 확인' |
| RG-DEP-18 | 제안 | 실연결 | live.py 실행 범위가 줄지 않았다. | live.py 단언 수 N ≥ 직전 통과 기록의 N(문서 기록 446) | tail -1 <R>/live.log의 N을 CLASSROOM-CHECK-LEAGUE 12행 기록과 비교한다. | 없음(live.py는 baseline-counts.txt 밖) | docs/CLASSROOM-CHECK-LEAGUE.md 12행(446/0); §7.2의 범위 축소 실패 규칙과 같은 취지 |
| | | | 비고: 문서가 live.py의 기준 단언 수를 정하지 않았으므로 제안으로 둔다. | | | | |
| RG-DEP-19 | 제안 | 문서 확인 | 새 배포가 잘못됐을 때 되돌릴 길이 기록돼 있다. | 배포 기록에 직전 미리보기 배포 ID·주소와 되돌림 방법(직전 태그 재배포 명령) 1건 | 배포 전에 wrangler pages deployment list의 직전 배포 ID를 PROGRESS 배포 줄에 함께 적는다. | 없음 | 문서 근거 없음. 일반 운영 관행(롤백 경로) |

## 실기기·접근성

| ID | 구간 | 확인 | 무엇을 | 통과 조건 | 절차 | 이미 있는 검사 | 원문 |
|---|---|---|---|---|---|---|---|
| RG-DEV-01 | 8 | 실기기 | 수업용 태블릿에서 혼자 하기 12달을 손가락만으로 끝 화면까지 마친다. | 12월 끝 화면 도달, 막힌 순간 0 | CLASSROOM-CHECK-LEAGUE §1 1~5를 따른다. 평택·12달·균형, 연습 방식 '약속 연습'으로 매달 근거→배치→시험→약속→준비→결과·원인 카드→다음 달을 한다. 결과는 CM-DEVICE 양식(날짜, 기기·OS·브라우저 판, 판 SHA, 장면별 결과, 학생 정보 없음)으로 남긴다. | tests/league/solo.py(12달 완주, 데스크톱 Chromium이며 태블릿 아님) | docs/CLASSROOM-CHECK-LEAGUE.md §1 통과(29행); docs/ROADMAP.md 완성 기준 2 |
| | | | 비고: 관문 시점 D. | | | | |
| RG-DEV-02 | 8 | 실기기 | 혼자 하기를 브라우저 완전 종료 뒤 다시 열면 같은 달·같은 상태에서 이어진다. | 6월 결과 뒤 종료→재개했을 때 달 이름·현금·정전률이 닫기 직전 기록과 같음 | CLASSROOM-CHECK-LEAGUE §1-3. 닫기 전에 달·현금·정전률을 적고, 다시 연 뒤 같은 칸을 적어 비교한다. | tests/league/storage.py·solo.py(새로고침 이어 하기, 실기기 아님) | docs/CLASSROOM-CHECK-LEAGUE.md §1 통과(29행) |
| | | | 비고: 관문 시점 D. 기록은 CM-DEVICE 양식. | | | | |
| RG-DEV-03 | 8 | 실기기 | 혼자 하기에서 손가락 설치 오조작이 적다. | 12달 동안 달마다 설치 오조작 ≤ 1회(최댓값) | CLASSROOM-CHECK-LEAGUE §1-2. 달마다 의도와 다른 칸에 놓인 횟수를 센다(첫 탭 미리보기, 둘째 탭 설치). | 없음 | docs/CLASSROOM-CHECK-LEAGUE.md §1 통과(29행) |
| | | | 비고: 관문 시점 D. 기록은 CM-DEVICE 양식. | | | | |
| RG-DEV-04 | 8 | 실기기 | 태블릿 가로·세로 두 방향에서 글자가 잘리거나 겹치지 않는다(리그). | 가로 6달·세로 6달 동안 잘림·겹침 관찰 0건 | CLASSROOM-CHECK-LEAGUE §1-4. 발견하면 화면·달·단계를 적는다(학생 입력이 보이는 캡처는 쓰지 않음). | tests/league/ux_task.py tablet·mobile 장면(Chromium 폭 흉내, 실기기 아님) | docs/CLASSROOM-CHECK-LEAGUE.md §1 통과(29행) |
| | | | 비고: 관문 시점 D. 기록은 CM-DEVICE 양식. | | | | |
| RG-DEV-05 | 8 | 실기기 | 6팀 멀티가 실제 태블릿·실제 연결에서 12달을 끝낸다. | 6/6팀이 12달의 준비·운영을 마침, 멈춰서 방을 새로 만든 횟수 0 | CLASSROOM-CHECK-LEAGUE §2 1~5. https 미리보기 주소, 온라인(Supabase), 6팀·12달·100분. 노트북 1 + 태블릿 6. | tests/league/e2e.py(6팀, 탭끼리), live.py(3팀 3달 실연결) | docs/CLASSROOM-CHECK-LEAGUE.md §2 통과(37행); docs/ROADMAP.md 완성 기준 2 |
| | | | 비고: 관문 시점 D. 기록은 CM-DEVICE 양식. | | | | |
| RG-DEV-06 | 8 | 실기기 | 결과마다 진행자 화면과 태블릿의 현금·정전률이 같다. | 12달 × (진행자, 태블릿 2대)의 현금·정전률 비교에서 불일치 0 | 결과가 나올 때마다 진행자 화면과 정한 태블릿 2대의 현금·정전률을 표에 적는다. | tests/league/live.py(상태 일치, 3팀 3달) | docs/CLASSROOM-CHECK-LEAGUE.md §2 통과(37행) |
| | | | 비고: 관문 시점 D. 기록은 CM-DEVICE 양식. | | | | |
| RG-DEV-07 | 8 | 실기기 | 끊김 네 가지 뒤 같은 자리·같은 달로 돌아오고 일지가 남는다. | 네 사례 4/4에서 자리·달로 돌아오고 써 둔 일지가 남는다. 네 사례: 3월 팀 새로고침, 6월 무선 1분 끊김, 9월 브라우저 종료 뒤 '이어서: ○○ 팀', 차시 사이 진행자 '이어서 진행' | CLASSROOM-CHECK-LEAGUE §2-4 순서대로 하고, 사례마다 결과를 적는다. | tests/league/live.py(팀·진행자 새로고침 복구), recover.py·storage.py(탭끼리) | docs/CLASSROOM-CHECK-LEAGUE.md §2 통과(37행) |
| | | | 비고: 관문 시점 D. 기록은 CM-DEVICE 양식. | | | | |
| RG-DEV-08 | 8 | 실기기 | 연결 확인 안내가 연결이 돌아온 뒤 1분 안에 사라진다. | '진행자 화면과 연결을 확인하는 중' 안내가 뜬 사례마다, 진행자·무선이 돌아온 시각부터 해제까지 ≤ 60초 | RG-DEV-07의 각 사례에서 회복 시각과 안내 해제 시각을 초 단위로 적는다. | tests/league/snapcompat.py(안내 표시, 탭끼리) | docs/CLASSROOM-CHECK-LEAGUE.md §2 통과(37행); docs/DECISIONS.md D-64·D-77(10·20·30초 문턱) |
| | | | 비고: 관문 시점 D. 기록은 CM-DEVICE 양식. | | | | |
| RG-DEV-09 | 8 | 실기기 | 팀이 쓴 일지·이유 글이 진행자 화면에 나타나지 않는다(실기기). | 12달 동안 진행자 화면에 팀 자유 서술이 보인 사례 0건 | 팀이 일지·이유에 미리 정해 둔 가상 표식 문장을 쓴다. 진행자 화면(장부·도시 상세·끝 화면)에서 그 문장을 찾는다. | tests/league/econui.py:476·712, live.py 프레임 표식 검사(CM-PRIVACY가 인용) | docs/CLASSROOM-CHECK-LEAGUE.md §2 통과(37행); docs/DECISIONS.md D-59 |
| | | | 비고: 관문 시점 D. 자동 검사로 보는 미전송은 CM-PRIVACY가 맡고, 이 체크는 실기기 화면만 본다. 기록은 CM-DEVICE 양식. | | | | |
| RG-DEV-10 | 8 | 실기기 | 첫 달 손가락 확인 두 가지를 해 보고 기록했다. | 기록에 두 항목의 결과가 모두 적혀 있다. 하나는 '○○ 방향 · 이웃 도시 연결점' 지명표 아래 칸을 눌러 설치되는지, 다른 하나는 결과 서랍의 '예측과 실제를 비교했어요' 문구를 눌러 체크되는지다 | CLASSROOM-CHECK-LEAGUE §2-3의 첫 달 확인. | 없음 | docs/CLASSROOM-CHECK-LEAGUE.md §2-3(34행, 영상 2차 M7·M11) |
| | | | 비고: 관문 시점 D. 해석: §2 통과 목록에 들어 있지 않으므로 결과의 좋고 나쁨이 아니라 기록 여부만 관문으로 둔다. 안 되면 이슈로 만든다(§13). 기록은 CM-DEVICE 양식. | | | | |
| RG-DEV-11 | 8 | 실기기 | 6팀 12달 진행 시간을 실측해 기록했다. | 달마다 계획·결과 소요 시간 24칸과 12달 총시간이 기록돼 있음 | CLASSROOM-CHECK-LEAGUE §2-3. 달마다 시각을 적는다. | 없음 | docs/CLASSROOM-CHECK-LEAGUE.md §2-3(34행), 통과 문단 끝(37행 '100분 안에 끝내는지는 통과 조건이 아니라 실측값') |
| | | | 비고: 관문 시점 D. 문서가 100분 안 완주를 통과 조건에서 뺐으므로 기록 여부만 본다. D-93(ED-E7-10)에 따라 이 100분 2차시 기록은 교육 축 E7의 '50분 한 차시에 정해진 달 수'의 근거가 아니다. 그 체크용 50분 차시 기록은 교실 시범 때 따로 남긴다. 기록은 CM-DEVICE 양식. | | | | |
| RG-DEV-12 | 8 | 실기기 | 태블릿 준비 조건을 갖췄다. | 태블릿마다 충전, 자동 잠금 끔(또는 길게), 시크릿 창 아님 세 칸이 모두 '예' | CLASSROOM-CHECK-LEAGUE 0.4 확인표를 기기별로 채운다. | 없음 | docs/CLASSROOM-CHECK-LEAGUE.md 0.4(20행) |
| | | | 비고: 관문 시점 D. 기록은 CM-DEVICE 양식. | | | | |
| RG-DEV-13 | 8 | 실기기 | 2022 충실판을 iPad VoiceOver로 화면을 보지 않고 조작할 수 있다. | CLASSROOM-CHECK-2022 §1의 1~5단계 5/5 완료 | iPad + VoiceOver(Safari)에서 쓸어넘기기·두 번 탭으로 1~5단계를 한다. 외장 키보드를 연결했으면 방향키·Enter·Esc도 함께 본다. 칸 100개 이동의 불편과 로터 '표' 이동 여부를 메모한다. 기록은 CM-DEVICE 양식. | tests/accept_g2022.py A1·A2(접근성 트리 이름·알림. 실제 낭독기 아님) | docs/CLASSROOM-CHECK-2022.md §1 통과(19행), 사용자 결정(36~37행) |
| | | | 비고: 관문 시점 E. AUDIT-2022 §9에 따라 v1.0.0 태그 조건이 아니고 개발 완성 판정도 막지 않는다. | | | | |
| RG-DEV-14 | 8 | 실기기 | VoiceOver에서 같은 알림이 겹쳐 읽히지 않는다(2022 충실판). | 1~5단계 동안 같은 알림이 두 번 읽힌 사례 0. 3단계 오류 문장은 한 번 | RG-DEV-13을 하면서 알림마다 읽힌 횟수를 센다. | 없음 | docs/CLASSROOM-CHECK-2022.md §1-3(16행), 통과(19행) |
| | | | 비고: 관문 시점 E. 기록은 CM-DEVICE 양식. | | | | |
| RG-DEV-15 | 8 | 실기기 | 2022 충실판이 실제 태블릿 세로·가로에서 막힘 없이 된다. | 세로·가로 각각 §2의 1~4단계에서 막힘 0 | CLASSROOM-CHECK-2022 §2 1~5(세로 1~4 → 가로로 돌려 1~4). | tests/accept_g2022.py A3(390px 칸 44px, 페이지 가로 스크롤 0. Chromium) | docs/CLASSROOM-CHECK-2022.md §2 통과(27행) |
| | | | 비고: 관문 시점 E. 기록은 CM-DEVICE 양식. | | | | |
| RG-DEV-16 | 8 | 실기기 | 2022 지도 칸을 손가락으로 연달아 눌러도 옆 칸 오조작이 적다. | 방향마다 칸 10개 연속 누름에서 옆 칸 오조작 ≤ 1 | CLASSROOM-CHECK-2022 §2-2를 세로·가로 각각 한다. | 없음 | docs/CLASSROOM-CHECK-2022.md §2-2(23행 '0~1회까지 통과') |
| | | | 비고: 해석: 5단계가 1~4를 가로로 반복하므로 방향마다 센다. 관문 시점 E. 기록은 CM-DEVICE 양식. | | | | |
| RG-DEV-17 | 8 | 실기기 | 2022 충실판이 태블릿 두 방향에서 글자가 잘리거나 겹치지 않는다. | 잘림·겹침 관찰 0건 | RG-DEV-15를 하면서 준비실·면접실·성찰 화면을 본다. | 없음(AUDIT-2022 §9: 겹침은 눈 확인만) | docs/CLASSROOM-CHECK-2022.md §2 통과(27행) |
| | | | 비고: 관문 시점 E. 기록은 CM-DEVICE 양식. | | | | |
| RG-DEV-18 | 8 | 교실 | 학생이 '조건이 바뀐다면' 카드의 수치를 연습실 가정으로 읽는다. | '가정' 응답 인원 / 응답 인원 ≥ 3/4 | 시범 수업 성찰 단계에서 학생 3~6명에게 묻는다: '이 카드의 숫자는 실제 통계인가요, 연습을 위한 가정인가요?' 손을 들거나 쪽지로 받아 인원수만 센다(이름은 적지 않음). | 없음 | docs/CLASSROOM-CHECK-2022.md §3 통과(33행), 사용자 결정(38행) |
| | | | 비고: 해석: 원문 '대부분(예: 3/4 이상)'의 예시값을 문턱으로 썼다. 통과하지 못하면 카드의 '연습실 가정' 표시를 키우거나 도입에서 짚는다. 관문 시점 E(시범 수업 중). | | | | |
| RG-DEV-19 | 8 | 교실 | 풍력 질문에 '과제 규칙은 같게 세지만 실제는 더 줄어든다'는 취지의 답이 나온다. | 그 취지의 응답 ≥ 1건 | RG-DEV-18에 이어 '실제로 풍속이 절반이 되면 풍력 발전량도 절반이 되나요?'를 묻고, 취지가 맞는 응답 수를 센다. | 없음 | docs/CLASSROOM-CHECK-2022.md §3 통과(33행) |
| | | | 비고: 해석: '나온다'를 1건 이상으로 읽었다. 관문 시점 E(시범 수업 중). | | | | |
| RG-DEV-20 | 8 | 코드 확인 | 새로 더한 CSS가 focus 윤곽을 없애지 않는다. | 아래 명령 출력 0줄 | git diff <MAIN0>..<RC> -- '*.css' \| rg -n '^\+.*outline\s*:\s*(none\|0)\b' | 없음 | .claude/rules/ui-and-games.md 다섯째 항목('focus 윤곽 바꾸지 않기') |
| | | | 비고: 해석: 기존 줄(styles.css 227행, ui/build.css 166·393행)은 빼고 직전 main 이후 새로 더한 줄만 본다. | | | | |
| RG-DEV-21 | 8 | 문서 확인 | 화면을 바꾼 병합 PR에 1280×900·390×844 캡처가 있다. | <W> 가운데 files에 ui/·*.css·index.html·app.js가 든 PR마다 둘 중 하나가 있다. 본문 '캡처' 표의 1280×900·390×844 칸이 채워졌거나, '캡처는 총괄 보관' 문장이 있다. 둘 다 없는 PR 0 | gh pr view <n> --repo yurowa90/kentech --json files,body로 파일 목록과 '## 캡처' 절을 확인한다. | .github/pull_request_template.md '캡처' 표 | docs/DEV-WORKFLOW.md §6.1(212행), §14(442행); CLAUDE.md '일하는 방식' |
| | | | 비고: 관문 시점 A(B에서 소급해 감사). | | | | |
| RG-DEV-23 | 제안 | 브라우저 검사 | 리그 혼자 하기 첫 달을 키보드만으로 마친다. | 마우스 없이 Tab·Shift+Tab·Enter·Space·방향키·Esc만으로 S1~S8 한 바퀴 완료, 초점이 화면에 보이지 않는 순간 0 | 맥 로컬, 샌드박스 밖(CM-LOAD 전제). Chromium·WebKit Playwright로 [U]#league/solo를 열고 keyboard.press만 써서 진행한다. 단계마다 document.activeElement의 계산된 outline 너비가 0보다 큰지 본다. | 부분: D-83 Esc 층 순서 단언(CM-ESC, tests/league/econui.py·next.py·ux_coach.py 등의 Escape 누름) | docs/DECISIONS.md D-83(439행, 참고); .claude/rules/ui-and-games.md 접근성 |
| | | | 비고: 문서에 리그 키보드 완주 요구가 없으므로 제안으로 둔다. | | | | |
| RG-DEV-24 | 제안 | 실기기 | 태블릿 화면을 껐다 켜도 연결이 돌아온다. | 6팀 멀티 중 한 대의 화면을 1분 끈 뒤 켜서, 1분 안에 연결 안내가 해제된다 | 6팀 멀티 중 한 대의 화면을 1분 끈 뒤 켜고 시각을 적는다. 기록은 CM-DEVICE 양식. | 없음 | docs/CLASSROOM-CHECK-LEAGUE.md 14행('확인하지 못한 것': 사파리·크롬 웹소켓 유지, 화면 꺼짐 재연결) |
| | | | 비고: 문서는 '아래 2가 이것을 본다'고 했지만 2의 단계에 화면 꺼짐이 없다. 그래서 제안으로 둔다. 기기별 브라우저 이름·판 기록은 CM-DEVICE 양식이 맡는다. | | | | |

## 문서·운영

| ID | 구간 | 확인 | 무엇을 | 통과 조건 | 절차 | 이미 있는 검사 | 원문 |
|---|---|---|---|---|---|---|---|
| RG-OPS-01 | 8 | 문서 확인 | 마일스톤 'v1.0 2022 확장판'에 열린 blocker 이슈가 없다. | 아래 명령 출력 0 | gh issue list --repo yurowa90/kentech --milestone 'v1.0 2022 확장판' --state open --label sev:blocker --json number --jq length | 없음 | docs/DEV-WORKFLOW.md §11 후보 조건(361행), §14(454행); CLAUDE.md '저장소 규칙' |
| | | | 비고: 관문 시점 B(rc)와 D(정식 판). | | | | |
| RG-OPS-02 | 8 | 문서 확인 | 마일스톤 'v1.0 2022 확장판'에 열린 major 이슈가 없다. | 아래 명령 출력 0 | gh issue list --repo yurowa90/kentech --milestone 'v1.0 2022 확장판' --state open --label sev:major --json number --jq length | 없음 | docs/DEV-WORKFLOW.md §11 후보 조건(361행), §14(454행) |
| | | | 비고: 관문 시점 B(rc)와 D(정식 판). | | | | |
| RG-OPS-03 | 8 | 문서 확인 | CI 기준선의 알려진 실패 줄마다 이슈가 연결돼 있다. | baseline-fail.txt의 실패 줄마다 검사 이름과 장면 라벨을 본문에 담은 이슈 1건 이상. 대응 없는 줄 0 | grep -v '^#' tests/ci/baseline-fail.txt \| cut -f1 \| sort -u → 이름마다 gh issue list --repo yurowa90/kentech --state all --search '<이름> BLOCKED in:body' --json number,body로 장면 라벨(예: 'R13', 'M5', 'R1')을 대조한다. | 없음(baseline-fail.txt 주석에 이슈 번호 없음) | docs/DEV-WORKFLOW.md §2(40행 '기준선의 줄은 모두 어느 이슈에 연결'), §7.2(256행) |
| RG-OPS-04 | 8 | 문서 확인 | CI 참고 목록(CI에서만 쓰는 예외)의 항목마다 실재하는 근거 이슈가 있다. | ci-advisory.txt의 주석 아닌 항목 줄마다 근거 번호 '#n'이 1개 이상 있고, 그 번호가 저장소에 실재한다. 근거는 파일 주석이나 그 줄을 더한 커밋 본문에서 찾는다. 대응 없는 줄 0 | grep -v '^#' tests/ci/ci-advisory.txt \| rg -v '^\s*$' 로 항목을 뽑는다. 항목마다 근거 번호를 두 곳에서 찾는다. 파일 주석은 rg -n '#[0-9]+' tests/ci/ci-advisory.txt로, 그 줄을 더한 커밋 본문은 git log --format='%h %B' -S '<항목 줄>' -- tests/ci/ci-advisory.txt \| rg -o '#[0-9]+'로 본다. 찾은 번호마다 gh issue view <n> --repo yurowa90/kentech --json number,state가 성공해야 한다(PR 번호면 gh pr view). | tests/ci/ci-advisory.txt 주석(#56, PR #51) | docs/DEV-WORKFLOW.md §7.2(253행 '항목마다 근거 이슈를 단다'); tests/ci/README.md 'CI 참고 목록'; D-93(ST-A-01·02) |
| | | | 비고: D-93에 따라, CI에서만 생기는 예외(공유 실행기 속도)는 안정성 축의 간헐 대장이 아니라 이 체크가 맡는다. suites.txt 넷째 칸 mac(지금 fx_map)은 CI 샤드에서 빠질 뿐이다. 맥 로컬 --all(CM-REG)에서 그대로 판정되므로 근거 이슈 요구 대상이 아니다(DEV-WORKFLOW §7.2). | | | | |
| RG-OPS-05 | 8 | 문서 확인 | <W>의 각 PR이 병합한 머리와 같은 SHA에서 맥 로컬 최종 확인을 받았다. | PR마다 댓글의 '검사한 SHA: <40자>'가 병합 머리 headRefOid와 같다. 다르면, git diff --name-only <검사한 SHA> <headRefOid>가 인계 문서 세 파일 안이라는 댓글이 있다. 어긋난 PR 0 | gh pr view <n> --repo yurowa90/kentech --json headRefOid,comments --jq '.headRefOid, (.comments[].body \| select(test("검사한 SHA")))' | 없음 | docs/DEV-WORKFLOW.md §9 2(323행)·4(325~331행), §14(444행) |
| | | | 비고: 관문 시점 A(B에서 소급해 감사). 문서만 바꾼 PR은 §8에 따라 해당 없음으로 친다. 댓글 형식은 RG-OPS-16이 본다. | | | | |
| RG-OPS-06 | 8 | 문서 확인 | <W>의 각 PR이 독립 검토 blocker·major 0으로 병합됐다. | PR마다 마지막 리뷰 글의 첫 줄 판정이 '합쳐도 됨'이고, 그 글의 blocker·major 발견 0 | gh pr view <n> --repo yurowa90/kentech --json reviews --jq '.reviews[-1].body' \| head -1; 같은 글에서 rg -c '^\s*[-*]?\s*(blocker\|major)' | 없음 | docs/DEV-WORKFLOW.md §6.2(215~224행), §9 3(324행) |
| | | | 비고: 관문 시점 A(B에서 소급해 감사). | | | | |
| RG-OPS-07 | 8 | 문서 확인 | 독립 검토에서 남긴 minor가 모두 이슈가 됐다. | <W> 각 PR의 '작업 분담 · 독립 검토자' 줄에 적힌 minor 수 = 그 줄의 이슈 번호 수. 모자란 PR 0 | gh pr view <n> --repo yurowa90/kentech --json body --jq .body \| rg -n '독립 검토자:'에서 minor 수와 '#n' 수를 비교한다. | .github/pull_request_template.md '작업 분담' | docs/DEV-WORKFLOW.md §6.2(224행), §9 3(324행), §14(437행) |
| | | | 비고: 관문 시점 A(B에서 소급해 감사). | | | | |
| RG-OPS-08 | 8 | 코드 확인 | 작업 줄기 PR을 병합 커밋으로만 합쳤다(squash·rebase 금지). | <W>의 mergeCommit마다 부모 2개. 아닌 것 0 | git rev-list --parents -n1 <mergeCommit> \| wc -w → 3 | 없음 | docs/DECISIONS.md D-78(396행); docs/DEV-WORKFLOW.md §9(336~338행); CLAUDE.md '저장소 규칙' |
| | | | 비고: 관문 시점 A(B에서 소급해 감사). | | | | |
| RG-OPS-09 | 8 | 문서 확인 | 병합된 PR의 연결 이슈가 병합 커밋 SHA와 함께 닫혔다. | <W> 각 PR의 'Closes #n' 이슈가 CLOSED이고, 닫는 댓글에 그 PR의 병합 커밋 SHA(7자 이상)가 있다. 어긋난 것 0 | gh pr view <n> --repo yurowa90/kentech --json body --jq .body \| rg -o 'Closes #[0-9]+' → 이슈마다 gh issue view <i> --repo yurowa90/kentech --json state,comments | 없음 | docs/DEV-WORKFLOW.md §9 병합 뒤(341행), §14 '이슈를 닫아도 되는가'(450행) |
| | | | 비고: 관문 시점 A(B에서 소급해 감사). | | | | |
| RG-OPS-10 | 8 | 코드 확인 | PR 없이 작업 줄기에 직접 들어온 커밋은 인계 문서 세 파일만 고쳤다. | 아래 명령 출력 ⊆ {docs/PROGRESS.md, docs/ORCHESTRATION.md, docs/DECISIONS.md} | git log --first-parent --no-merges --name-only --format= <D92>..<RC> \| sort -u | 없음 | docs/DEV-WORKFLOW.md §9 끝(346행); CLAUDE.md '저장소 규칙' |
| RG-OPS-11 | 8 | 문서 확인 | 인계 문서에 통합 검사의 판(SHA)과 결과가 남아 있다. | docs/PROGRESS.md '이어받을 곳'에 <RC>(7자 이상)와 검사별 결과 줄이 있고, 돌리지 않은 검사는 '돌리지 않음'으로 적힘 | rg -n "$(git rev-parse --short=7 <RC>)" docs/PROGRESS.md | 없음 | docs/DEV-WORKFLOW.md §10(353행), §11 순서 머리(363행 '릴리스 기록은 5가 끝난 뒤 PROGRESS에') |
| | | | 비고: 관문 시점 B. 릴리스 5단계가 끝난 뒤에 본다. | | | | |
| RG-OPS-13 | 8 | 문서 확인 | 현장 확인 전에 사용자가 정해야 할 네 가지가 결정돼 있다. | 네 가지 4/4에 대해 현장 확인 시작 전에 결정 기록(D-번호 또는 날짜가 있는 PROGRESS 줄)이 있다. 네 가지: https 배포 방식, 참가 링크 전달 방법, 6팀 태블릿 조작자, 별도 확인으로 할지 시범 1차시를 겸할지 | rg -n 'https 배포\|참가 링크\|태블릿 조작\|시범 수업 1차시' docs/DECISIONS.md docs/PROGRESS.md | 없음 | docs/CLASSROOM-CHECK-LEAGUE.md '사용자에게 정해 받을 것'(39~43행) |
| | | | 비고: 관문 시점 D(현장 확인 앞). 해석: 이 네 가지를 현장 확인의 전제로 읽었다. | | | | |
| RG-OPS-14 | 8 | 문서 확인 | ROADMAP 완성 기준 2의 실제 기기·실제 연결 칸이 판정 기록과 함께 채워졌다. | ROADMAP 또는 PROGRESS에 '실제 기기·실제 연결' 판정(통과), 날짜, 확인한 rc 태그가 한 기록에 있음 | rg -n '실제 기기\|실제 연결' docs/ROADMAP.md docs/PROGRESS.md | 없음 | docs/DEV-WORKFLOW.md §13(430행) |
| | | | 비고: 관문 시점 D(정식 판). | | | | |
| RG-OPS-15 | 8 | 문서 확인 | README가 결정 기록과 어긋나는 곳은 고쳤거나 이슈가 있다. | 아래 명령으로 걸린 줄마다 같은 판에서 고쳐졌거나, 그 문장을 다룬 열린 이슈가 1건 이상 있다. 대응 없는 줄 0 | git show <RC>:README.md \| rg -n '가상 이름으로 일괄 변경\|×4\.8\|GitHub Pages\|python3 -m http\.server' → 줄마다 gh issue list --repo yurowa90/kentech --state open --search '<문장 일부> in:body' | 없음 | docs/DEV-WORKFLOW.md 5행('어긋나면 결정 기록을 따르고, 어긋난 곳은 이슈로 남긴다'); D-86(실제 지명 유지); docs/HANDOFF-econ.md §3-4(×4.4 시간 압축, D-66); DEV-WORKFLOW §12(Cloudflare Pages); .claude/rules/tests.md(서버는 tests/srv.py) |
| | | | 비고: 후보 문장은 작성 시 README에서 읽은 것이다. 실제로 어긋나는지는 사람이 결정 기록과 대조해 판정한다. | | | | |
| RG-OPS-16 | 8 | 문서 확인 | <W> 각 PR의 맥 로컬 최종 확인 댓글이 정해진 기록 형식을 모두 갖췄고, 결과 폴더 위치를 적지 않았다. | 문서만 바꾼 PR을 뺀 <W>의 각 PR을 본다. 마지막 맥 로컬 확인 댓글('검사한 SHA:'가 든 마지막 댓글)에 '검사한 SHA:', '명령:', '결과:', '기준선 항목:', '미검증:' 다섯 머리말이 모두 있다. 같은 댓글에서 <FW> 일치 0, 절대 경로 일치 0. 모자란 PR 0 | gh pr view <n> --repo yurowa90/kentech --json files --jq '.files[].path'가 모두 docs/ 아래거나 .md면 해당 없음이다. 아니면 다음을 돌린다. gh pr view <n> --repo yurowa90/kentech --json comments --jq '[.comments[].body \| select(test("검사한 SHA:"))] \| last' > <R>/mac-<n>.txt; rg -o '^(검사한 SHA\|명령\|결과\|기준선 항목\|미검증):' <R>/mac-<n>.txt \| sort -u \| wc -l → 5; rg -n -i -f <FW> <R>/mac-<n>.txt → 0줄; rg -n '(^\|[\s(=])(~/\|/(Users\|home\|private\|tmp\|var)/)' <R>/mac-<n>.txt → 0줄 | 없음 | docs/DEV-WORKFLOW.md §8 기록 형식(309~316행)·결과 원본 위치(317행), §2 '올리기 전 거르기' |
| | | | 비고: 비평 missing 반영으로 새로 만든 체크다. 관문 시점 A(B에서 소급해 감사). 문서만 바꾼 PR은 §8 범위에 따라 맥 로컬 확인을 하지 않으므로 해당 없음이다. 검사한 SHA와 병합 머리의 일치는 RG-OPS-05가 본다. | | | | |

## 릴리스 절차

| ID | 구간 | 확인 | 무엇을 | 통과 조건 | 절차 | 이미 있는 검사 | 원문 |
|---|---|---|---|---|---|---|---|
| RG-REL-01 | 8 | 독립 평가 | 품질 8 목표를 채웠다. 다섯 축(모형·교육·시각·UX·안정성)의 독립 평가 판정이 모두 8 이상이다. | 축마다 D-93 산출로 낸 판정이 '8 이상'이다. 산출은 항목 점수 평균이고, UX는 UX-H-01 관문과 '4 이하 항목이면 6 미만'을, 안정성은 '가장 낮은 두 항목 평균 이하'를 적용한다. rc는 개발 단계 점수가 8 이상이면 통과로 보고 '현장 확인 전'을 함께 적는다. 개발 단계 점수는 device·live·classroom 체크 가운데 확인 못 함을 빼고 계산한 것이다. 정식 v1.0.0은 현장 체크를 포함한 판정이 8 이상이어야 한다. 다섯 축의 평가 SHA가 <RC>와 같거나, git diff --quiet <평가 SHA> <RC> -- <앱 파일>의 종료가 0이어야 한다. 판정만 확인하고 점수는 저장소에 옮기지 않는다 | 축마다 CM-EVAL 규칙의 맥락 없는 평가자에게 입력 묶음을 준다. 평가자는 새 세션 1명이 기본이고, 원문이 2명을 요구하면 2명을 두고 낮은 쪽을 쓴다. 입력 묶음은 원문 docs/QUALITY-{model,edu,visual,ux,stability}.md, 이 체크리스트의 그 축 체크, 평가 SHA, 공통 체크 결과(CM-REG·CM-BALANCE·CM-REC 등)다. 다른 축의 자체 평가와 채점 이력은 주지 않는다(CM-SCORER). 축별 판정('8 이상'/'8 미만', 현장 확인 전 여부)을 받는다. 평가 SHA와 <RC>의 앱 파일 차이는 위 명령으로 본다. | 총괄 보관 보고(저장소 밖). 공개 저장소에는 판정만 옮긴다. | docs/DEV-WORKFLOW.md §11 후보 조건(361행), §2 마일스톤(78행), §14(454행); docs/QUALITY-*.md §1; D-93 결정 1·2절 |
| | | | 비고: 관문 시점 B(rc 판정)와 D(정식 판). '잘못 읽게 만드는 곳' 0(CM-MISREAD)은 교육 축 판정에 들어가고, 관문에도 따로 편입했다(scoring_rules). 해석: rc는 현장 확인 앞이므로(§11-7·§13) 개발 단계 점수로 판정한다. 정식 판에서는 현장 체크를 채운 판정을 다시 받는다. 이 해석은 총괄의 확정이 필요하다. RG-REL-26(제안)에 있던 '평가 고정본 = rc 앱' 조건은 D-93에 따라 이 체크로 올렸다. | | | | |
| RG-REL-03 | 8 | 문서 확인 | 2022 충실판 완성 기준 1의 판정 표에 미충족이 없다. | AUDIT-2022 §9 판정 표의 '상태' 칸에 '미충족' 0 | awk '/^## 9\./,/^### 검사 기록/' docs/AUDIT-2022.md \| rg -c '\\| 미충족' → 0 | docs/AUDIT-2022.md §9(검사 근거 accept_g2022, model_g2022-wire) | docs/ROADMAP.md 완성 기준 1 |
| | | | 비고: 관문 시점 F(2022 짝 완성 판정). v1.0 마일스톤 범위는 기준 2와 품질 8이다(DEV-WORKFLOW §2). g2022 회귀·모형은 CM-REG가 본다. | | | | |
| RG-REL-04 | 8 | 브라우저 검사 | 홈과 리그 안에 2022 충실판과의 짝 연결이 있다. | accept_base U6 '홈에 2022 확장판이 보인다' PASS. s7.py의 #lg-y2022-result·#lg-y2022-end·#lg-y2022-host 링크 단언 PASS | CM-REG 결과에서 두 가지를 본다. 회귀 base 결과(tests/results/base.txt)가 'problems: 0'이어야 한다. browser --all의 s7 로그에서 rg -n '^FAIL'은 0줄이어야 한다. | tests/accept_base.py(30~31행), tests/league/s7.py(729·915·953·1586행) | docs/ROADMAP.md 완성 기준 3 |
| | | | 비고: 관문 시점 F(2022 짝 완성 판정). | | | | |
| RG-REL-05 | 8 | 문서 확인 | 쌓였던 PR #1~#12가 정리돼 열린 것이 없다. | 아래 명령 출력 0 | for n in 1 2 3 4 5 6 9 10 11 12; do gh pr view $n --repo yurowa90/kentech --json state --jq .state; done \| rg -c OPEN | 없음 | docs/ROADMAP.md 완성 기준 4; docs/DECISIONS.md D-78 근거(396행 절) |
| | | | 비고: 관문 시점 F(2022 짝 완성 판정). #7·#8은 PR이 아니라 이슈다(PROGRESS 'PR 현황'). | | | | |
| RG-REL-06 | 8 | 코드 확인 | 릴리스 1~5단계 동안 작업 줄기에 다른 병합·직접 커밋이 없었다. | git rev-list --first-parent --count <RC>..<M> = 1, main PR 병합 시점의 origin/<TRUNK> = <M> | git rev-list --first-parent --count <RC>..<M>; main PR 병합 직전 git fetch origin && git rev-parse origin/<TRUNK> | 없음 | docs/DEV-WORKFLOW.md §11 순서 머리(363행), §9 끝(346행) |
| RG-REL-07 | 8 | 문서 확인 | 릴리스 준비 PR의 브랜치 이름이 규칙을 따른다. | headRefName이 '^chore/[0-9]+-release-1\.0\.0(-rc\.[1-9][0-9]*)?$'에 맞음 | gh pr view <n> --repo yurowa90/kentech --json headRefName --jq .headRefName \| rg -c '^chore/[0-9]+-release-1\.0\.0(-rc\.[1-9][0-9]*)?$' → 1 | 없음 | docs/DEV-WORKFLOW.md §11 2(365행)·7-1(386행), §3 브랜치 표 |
| | | | 비고: 관문 시점 B(rc 준비 PR)와 D(정식 판 준비 PR). | | | | |
| RG-REL-08 | 8 | 문서 확인 | CHANGELOG에 rc 절이 생기고 그 위에 빈 [Unreleased]가 새로 있다. | <M>의 CHANGELOG에서 '^## \[' 첫 줄 = '## [Unreleased]', 둘째 줄이 '## [1.0.0-rc.N] - 20YY-MM-DD' 꼴, 두 줄 사이 '^### ' 0 | git show <M>:CHANGELOG.md \| rg -n '^## \[' \| head -2; git show <M>:CHANGELOG.md \| awk '/^## \[Unreleased\]/{f=1;next} /^## \[/{f=0} f' \| rg -c '^### ' | 없음 | docs/DEV-WORKFLOW.md §11 2(365행) |
| RG-REL-09 | 8 | 문서 확인 | CHANGELOG 판 절의 소제목이 정해진 다섯 가지뿐이다. | 해당 판 절의 '^### ' 줄이 모두 추가·변경·제거·고침·보안 가운데 하나 | awk '/^## \[<판>\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md \| rg '^### ' \| rg -v '^### (추가\|변경\|제거\|고침\|보안)$' → 0줄 | 없음 | docs/DEV-WORKFLOW.md §11 끝(391행); CHANGELOG.md 머리 문단 |
| | | | 비고: 관문 시점 B(rc 절)와 D(정식 판 절). | | | | |
| RG-REL-10 | 8 | 코드 확인 | 검사한 SHA와 rc 병합 커밋의 차이가 CHANGELOG뿐이다. | git diff --name-only <RC> <M> 출력이 정확히 'CHANGELOG.md' 한 줄 | git diff --name-only <RC> <M> | 없음 | docs/DEV-WORKFLOW.md §11 3(366행), §14(455행) |
| | | | 비고: 다른 파일이 있으면 1단계부터 다시 한다. | | | | |
| RG-REL-11 | 8 | 코드 확인 | 릴리스 태그가 주석 태그다(대상: v1.0.0-rc.N, v1.0.0). | git cat-file -t <태그> = 'tag' | git cat-file -t v1.0.0-rc.N; git cat-file -t v1.0.0 | 없음 | docs/DEV-WORKFLOW.md §11 4(367~371행)·7-3(388행) |
| | | | 비고: 관문 시점 B(rc 태그)와 D(정식 태그). | | | | |
| RG-REL-12 | 8 | 코드 확인 | 태그가 해당 릴리스 준비 PR의 병합 커밋을 가리키고 이름이 판 규칙을 따른다. | git rev-parse <태그>^{commit} = 그 준비 PR 병합 커밋(rc→<M>, v1.0.0→정식 준비 PR 병합 커밋). 태그 이름이 '^v1\.0\.0(-rc\.[1-9][0-9]*)?$'에 맞음 | git rev-parse v1.0.0-rc.N^{commit}; gh pr view <준비 PR> --repo yurowa90/kentech --json mergeCommit --jq .mergeCommit.oid | 없음 | docs/DEV-WORKFLOW.md §11 머리(357행), 4(367행)·7-3(388행) |
| | | | 비고: 관문 시점 B와 D. | | | | |
| RG-REL-13 | 8 | 코드 확인 | 태그가 원격에 올라가 있고 로컬과 같다. | git ls-remote --tags origin refs/tags/<태그>의 값 = git rev-parse <태그> | git ls-remote --tags origin refs/tags/v1.0.0-rc.N; git rev-parse v1.0.0-rc.N | 없음 | docs/DEV-WORKFLOW.md §11 4(370행) |
| | | | 비고: 관문 시점 B와 D. | | | | |
| RG-REL-14 | 8 | 문서 확인 | main PR 본문에 판·검사 결과·CHANGELOG 절·미검증 항목이 있다. | 본문에서 네 요소(태그와 SHA, CI·맥 로컬 결과, CHANGELOG 판 절, 미검증 항목)가 각각 1회 이상 | gh pr view <main PR> --repo yurowa90/kentech --json body --jq .body \| rg -n 'v1\.0\.0\|[0-9a-f]{40}\|CI\|맥 로컬\|CHANGELOG\|미검증' | 없음 | docs/DEV-WORKFLOW.md §11 5-1(373행) |
| | | | 비고: 관문 시점 B(rc main PR)와 D(정식 main PR). | | | | |
| RG-REL-15 | 8 | 문서 확인 | main PR이 main을 대상으로, 태그 커밋을 머리로 연 것이다(rc·정식 두 PR). | baseRefName = main, headRefOid = git rev-parse <태그>^{commit} | gh pr view <main PR> --repo yurowa90/kentech --json baseRefName,headRefOid | 없음 | docs/DEV-WORKFLOW.md §11 5(378~382행)·7-4(389행) |
| | | | 비고: 관문 시점 B와 D. | | | | |
| RG-REL-16 | 8 | 문서 확인 | main 병합 직전에 그 병합에 대한 사용자 확인을 받았다(rc·정식 두 PR). | 확인 기록은 네 가지를 보인 뒤 받은 것이다: 판(태그·SHA), CI와 맥 로컬 결과, CHANGELOG 절, 미검증 항목. 기록 시각 < mergedAt. 확인 한 건에 병합 한 건 | gh pr view <main PR> --repo yurowa90/kentech --json mergedAt; 총괄 기록·PROGRESS 릴리스 기록의 사용자 확인 시각과 대조한다. | 없음 | docs/DEV-WORKFLOW.md §11 5-3(375행); CLAUDE.md '저장소 규칙'(main PR은 매번 사용자 확인); DECISIONS.md D-92 8·허락 범위 |
| | | | 비고: 관문 시점 B와 D. | | | | |
| RG-REL-17 | 8 | 코드 확인 | main 병합을 병합 커밋으로, 태그 커밋을 둘째 부모로 했다. | main 병합 커밋의 부모 2개, 둘째 부모 = <태그>^{commit} | git rev-list --parents -n1 <main 병합 커밋> (병합 명령 기록: gh pr merge <번호> --merge --match-head-commit <태그 SHA>) | 없음 | docs/DECISIONS.md D-78; docs/DEV-WORKFLOW.md §11 5-4(382행) |
| | | | 비고: 관문 시점 B와 D. | | | | |
| RG-REL-18 | 8 | 코드 확인 | 병합 뒤 main의 트리가 태그 판과 같다(rc·정식). | git diff --stat <태그> origin/main 출력 0줄(병합 직후) | git fetch origin && git diff --stat <태그> origin/main | 없음 | docs/DEV-WORKFLOW.md §11 5-4(376행) |
| | | | 비고: 관문 시점 B와 D. | | | | |
| RG-REL-19 | 8 | 문서 확인 | GitHub 릴리스를 만들었다면 만들기 전에 사용자 확인을 받았다. | gh release list에 해당 판이 있으면, 그 생성 시각보다 앞선 사용자 확인 기록이 1건 있다. 없으면 '해당 없음' | gh release list --repo yurowa90/kentech; gh release view <태그> --repo yurowa90/kentech --json createdAt | 없음 | docs/DEV-WORKFLOW.md §11 6(384행), §14(457행); CLAUDE.md '저장소 규칙' |
| | | | 비고: 관문 시점 B와 D. | | | | |
| RG-REL-20 | 8 | 문서 확인 | rc 판의 GitHub 릴리스는 사전 공개로 표시된다. | rc 릴리스가 있으면 isPrerelease = true, 본문이 CHANGELOG 해당 절. 없으면 '해당 없음' | gh release view v1.0.0-rc.N --repo yurowa90/kentech --json isPrerelease,body | 없음 | docs/DEV-WORKFLOW.md §11 6(384행 '사전 공개 표시', 'CHANGELOG 절을 본문으로') |
| RG-REL-21 | 8 | 문서 확인 | 원격 브랜치를 지울 때마다 사용자 확인을 받았다. | 릴리스 기간에 지운 원격 브랜치마다, 삭제 시각보다 앞선 사용자 확인 기록 1건. 대응 없는 삭제 0 | git fetch --prune 출력이나 GitHub 이벤트로 삭제 목록을 만들고 총괄 기록과 대조한다. | 없음 | docs/DEV-WORKFLOW.md §9 병합 뒤(343행), §14(457행); DECISIONS.md D-92 허락 범위 |
| | | | 비고: 관문 시점 B와 D. | | | | |
| RG-REL-22 | 8 | 코드 확인 | 정식 판과 그 바탕이 된 rc 사이의 차이가 CHANGELOG와 인계 문서뿐이다. | git diff --name-only v1.0.0-rc.N <정식 준비 PR 병합 커밋> ⊆ {CHANGELOG.md, docs/PROGRESS.md, docs/ORCHESTRATION.md, docs/DECISIONS.md} | git diff --name-only v1.0.0-rc.N <정식 준비 PR 병합 커밋> | 없음 | docs/DEV-WORKFLOW.md §11 7-2(387행), §14(455행) |
| | | | 비고: 앱·검사 파일이 있으면 정식 판이 아니라 다음 rc다. 관문 시점 D. | | | | |
| RG-REL-23 | 8 | 문서 확인 | CHANGELOG에 정식 판 절이 있고, 같은 앱이라는 사실과 확인 기록 요지가 적혀 있다. | '## [1.0.0] - 20YY-MM-DD' 절 1개. 그 절에 바탕 rc 태그 이름 1회 이상과 현장 확인 요지 문장 1개 이상 | awk '/^## \[1\.0\.0\] - /{f=1;print;next} /^## \[/{f=0} f' CHANGELOG.md \| rg -n 'rc\.[0-9]+\|현장\|태블릿\|확인' | 없음 | docs/DEV-WORKFLOW.md §11 7-1(386행) |
| | | | 비고: 관문 시점 D. | | | | |
| RG-REL-24 | 8 | 문서 확인 | 정식 태그를 현장 확인 통과 뒤에 달았다. | v1.0.0 태그 시각 > RG-OPS-14 판정 기록의 날짜 | git for-each-ref --format='%(taggerdate:iso-strict)' refs/tags/v1.0.0 과 ROADMAP·PROGRESS 판정 기록 날짜를 비교한다. | 없음 | docs/DEV-WORKFLOW.md §11 7(385행), §13(430행), §14(458행) |
| | | | 비고: 관문 시점 D. | | | | |
| RG-REL-25 | 8 | 문서 확인 | 현장 확인에서 blocker·major가 나왔으면 rc를 올려 다시 했다. | v1.0.0의 바탕 rc 태그 시각 이후에 만든 이슈 가운데 src:user이면서 sev:blocker 또는 sev:major인 것이 0 | gh issue list --repo yurowa90/kentech --label src:user --label sev:blocker --state all --search 'created:>=<rc 태그 날짜>' --json number --jq length; 같은 명령을 sev:major로도 → 둘 다 0 | 없음 | docs/DEV-WORKFLOW.md §13(429행), §11 7(385행) |
| | | | 비고: 그런 이슈가 있으면 고친 PR을 합친 뒤 rc+1로 1단계부터 다시 한다. 관문 시점 D. | | | | |

## 체크로 바꾸지 못한 원문 조건

- ROADMAP 완성 기준 2의 '근거 대장 기반 모형'은 모형 축 기준표(docs/QUALITY-model.md)가 맡는다. 관문에서는 RG-REL-01 판정과 RG-REG-10(CM-BALANCE 결과)으로만 본다.
- league-econ 규칙 '현실 속도와 교육용 배속을 나눠 쓰고 배속을 화면에 표시'는 모형·교육 축과 공통 체크 CM-SPEED가 본다. 릴리스 관문으로 쪼개지 않았다.
- DEV-WORKFLOW §14의 '구현 담당과 검사 담당이 다른 세션', '검사 기대값을 구현에 맞춰 베끼지 않는다'는 실행 기록이 저장소 밖에만 있다. 공개 기록에는 역할 이름만 남으므로 공개 저장소만으로는 기계 판정할 수 없다. PR '작업 분담' 칸의 기재 여부로만 대리 확인할 수 있다.
- §14의 '범위가 이슈와 같다'와 §2의 'PR이 독립 검토자가 한 번에 읽기 어려운 크기면 나눈다'에는 판단 기준(줄 수 상한 등)이 문서에 없다.
- §5의 '스테이징은 파일 이름을 적어서 한다(git add . 금지)'는 커밋 뒤에 관찰할 흔적이 남지 않는다.
- §11 CHANGELOG의 '커밋 해시는 꼭 필요한 곳에만', '교사·학생이 알아챌 변화를 먼저'에는 판정 규칙이 없다. 쓰려면 평가 절차를 새로 정해야 한다.
- live.py 지연(요청→스냅의 중앙값·최대)은 live.md가 '성능 합격 임계값은 정하지 않았다'고 적어 기록만 한다. 다음도 통과 조건 없이 측정값으로만 적혀 있다: 6팀 동시 요청 지연, 학교망 필터(supabase.co 외), 혼자 하기 40~60분 소요, 원인 카드 결과 대기 시간.
- D-64의 남는 한계는 받아들인 위험으로 적혀 있을 뿐 관문 조건이 아니다. 빈자리 선점, 진행자 개인 키 분실 시 새 코드, 디바운스 중 마지막 약 1초 손실, 2⁴⁰ 해시 작업량이 여기에 든다.
- D-65의 기존 요청 종류 안에 새로 생긴 필드는 기계로 비교할 도구가 CI에 없다. RG-SEC-10은 type 수준까지, RG-SEC-11은 PR의 자기 표시까지만 본다. 허용 필드 목록은 CM-PRIVACY가 둔다(d90-public-contract.js 편입은 제안 RG-SEC-19).
- 학생 이름은 정규식으로 거를 수 없다. 금칙어 목록은 저장소 밖에 있어, 목록 자체가 완전한지(모델 이름·경로·점수 표기 누락 여부) 확인할 수 없다.
- 실제 회사 이름 목록(RG-CON-01)은 완전하지 않다. 목록 밖 민간 기업명은 RG-CON-03(이름 필드)에서만 걸리고, 설명 문장 속 이름은 사람이 읽어야 한다.
- Cloudflare 무료 요금제 범위 여부와 GitHub Actions macOS 실행기 과금 정책의 재확인(§7 228행 '처음 켜기 전')은 외부 서비스 상태다. 사용자 확인 기록이 있는지로만 볼 수 있다.
- §6.1의 'Closes #n이 작업 줄기 PR에서 자동으로 닫지 않는지 첫 PR에서 확인'은 한 번만 하는 운영 확인이라 릴리스 관문에 넣지 않았다.
- §7.3의 'iPad 사파리 결과는 CI·Playwright WebKit 결과가 아니다'는 한계 설명이다. 리그의 iPad 사파리 확인은 CLASSROOM-CHECK-LEAGUE(RG-DEV-01~12)와 CM-DEVICE 기록으로만 덮인다.
- .claude/rules/ui-and-games.md의 화면 문구 규칙(고교생 한국어, 과장·상투어 금지, '얻는 것과 잃는 것')과 접근성 수치(대비 4.5, 44px)는 UX·시각 축 기준표와 CM-REG·CM-OVERFLOW 판정에 맡겼다.
- CLASSROOM-CHECK-LEAGUE §1-5 '성찰과 활동지 복사를 눌러 본다', §2-5 '기록 내려받기로 CSV를 받는다'는 단계로만 적혀 있고 통과 문단에 기준이 없다. 그래서 체크로 만들지 않았다.
- RG-REL-03이 쓰는 AUDIT-2022 §9 판정 표는 '초안'으로 표시돼 있다. 표를 확정하는 일은 총괄 결정으로 남는다.
- RG-CON-02의 VM 확인은 자료 파일 안 함수 본문(템플릿 문자열)에 든 기관명을 보지 못한다. 작성 시 그런 문자열이 있는지는 확인하지 않았다.
- RG-CON-05의 알려진 예외 목록은 아직 없다(작성 시 후보 59줄, 24개 파일). 목록이 없으면 후보 줄이 모두 목록 밖이 되어 체크가 실패한다. 목록 위치와, 각 줄을 고칠지 예외로 둘지는 총괄이 정한다.
- <KEYPAT>를 '접두 뒤 영숫자 20자 이상'으로 좁힌 결과가 실제 Supabase 공개·비밀 키 형식과 맞는지는 확인하지 않았다(RG-SEC-05 notes의 대조 절차).
- RG-REL-01에서 rc를 개발 단계 점수(현장 체크 제외)로 판정하는 것은 결정 1절의 '현장 확인 전' 규칙을 rc에 적용한 해석이다. 총괄의 확정이 필요하다.
- 시점 F(2022 짝 완성 판정: RG-REL-03·04·05)를 v1.0 출시 판정 밖의 별도 관문으로 둔 것은 DEV-WORKFLOW §2 마일스톤 범위(기준 2와 품질 8)를 따른 정리다. 2022 짝 완성 판정의 시점은 총괄이 정한다.
