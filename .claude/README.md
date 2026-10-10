# Claude 작업 설정 구조

컨텍스트가 압축되거나 세션이 바뀌어도 일이 이어지도록, 정보를 '매번 필요한 것'과 '필요할 때만 불러올 것'으로 나눴다. Claude Code 공식 권장(CLAUDE.md 200줄 이내, 길수록 규칙을 덜 따름)을 따른다.

| 층 | 위치 | 언제 읽히나 | 담는 것 |
|---|---|---|---|
| 프로젝트 기억 | `/CLAUDE.md` | 세션마다 자동 | 소개, 자주 쓰는 명령, 문서 위치, 일하는 방식 요지 |
| 진행·인계 | `docs/PROGRESS.md`, `docs/HANDOFF-econ.md` | CLAUDE.md가 불러옴 | 현재 과제, 다음 단계, 알려진 문제 |
| 결정 로그 | `docs/DECISIONS.md` | 결정을 바꾸기 전에 직접 연다 | D-번호마다 맥락·대안·근거·결과 |
| 경로별 규칙 | `.claude/rules/*.md` | 머리의 `paths`에 맞는 파일을 만질 때만 | 화면·게임 계약, 검사 판정, 리그·경제 규칙 |
| 절차(스킬) | `.claude/skills/<이름>/SKILL.md` | 설명이 맞는 일을 할 때만 본문 | 인계(kcp-handoff), 검사(kcp-run-tests), 스킨(kcp-ui-skin) |
| 서브에이전트 | `.claude/agents/*.md` | 맡길 때 | test-runner(긴 검사 출력 요약), opus-reviewer(독립 검토) |
| 홈 설정 | `~/.claude/CLAUDE.md`, `~/.claude/skills/` | 모든 프로젝트 | 개인 작업 원칙, 분업 절차 스킬 `codex-orchestrate` |
| 자동 메모 | 프로젝트 메모리(`/memory`) | Claude가 쓰고 다음 세션에 읽음 | 실행 방법, 디버깅에서 알게 된 것. 틀리면 `/memory`로 고친다 |

## 쓰는 법
- 새 세션: "PROGRESS.md와 HANDOFF-econ.md 보고 이어서 해줘"면 된다.
- 오래 지킬 사실은 CLAUDE.md, 한 주제의 규칙은 rules, 반복 절차는 skills, 이번 작업 상태는 PROGRESS.md에 둔다. CLAUDE.md가 길어지면 세부를 rules나 skills로 옮긴다.

## 아직 하지 않은 것(후보)
- 훅(`.claude/settings.json`의 hooks): 부탁이 아니라 시스템으로 막을 규칙. 후보는 커밋 메시지의 모델 이름 차단, `git push --force` 차단, 비밀 키(sb_secret_, service_role) 커밋 차단. 설정 파일을 바꾸는 일이라 사용자 확인 뒤에 넣는다.
- 허용 목록(`~/.claude/settings.json`의 permissions.allow): 매번 묻는 읽기 명령(git diff, git log 등).
