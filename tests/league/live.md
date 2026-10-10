# 실제 Supabase Realtime 멀티플레이 검사

저장소 루트에서 실행한다. `mocktest.py`처럼 진행자와 팀을 서로 다른 Playwright 컨텍스트에 열며 실제 Supabase 프로젝트의 공개 Broadcast를 사용한다. 학생 자료는 사용하지 않는다. 방 코드는 로비의 **새 방 만들기**가 무작위로 생성한다.

## 실행

외부 네트워크가 허용된 총괄의 환경에서만 실행한다. 작성 샌드박스에서는 브라우저·Supabase 연결을 실행하지 않는다. 기존 uv/Playwright 환경과 Chromium이 필요하다(`.claude/rules/tests.md`의 맥 환경 기준: `tests/.venv`, Playwright 1.63). 의존성을 새로 설치하지 않는다. worktree에 가상환경이 없다면 본 저장소의 기존 인터프리터 경로를 사용한다.

첫 터미널에서 연결 대기열이 256인 프로젝트 검사 서버를 연다.

```sh
tests/.venv/bin/python tests/srv.py 9430 .
```

다른 터미널에서 `KCP_SB_URL`과 `KCP_SB_KEY`를 환경에 설정한 뒤 실행한다. 주소·키를 인자로 전달하거나 `.env`/소스/결과 파일에 저장하지 않는다. 아래 zsh 입력은 키를 화면과 셸 명령 기록에 쓰지 않는다.

```sh
read 'KCP_SB_URL?Supabase 프로젝트 HTTPS 주소 또는 ref: '
read -s 'KCP_SB_KEY?공개 publishable/anon 키: '
printf '\n'
export KCP_SB_URL KCP_SB_KEY
tests/.venv/bin/python tests/league/live.py http://127.0.0.1:9430/index.html
unset KCP_SB_URL KCP_SB_KEY
```

앱 주소 기본값은 `http://127.0.0.1:9430/index.html`이다. 앱은 loopback에서만 읽는다. Supabase 주소는 `https://<ref>.supabase.co` 또는 20자리 ref만 허용하며 가짜 서버의 `ws://` 주소는 거부한다. 해당 프로젝트에서 공개 Realtime Broadcast를 사용할 수 있어야 한다.

환경 변수 하나라도 없으면 `SKIP`과 `checks 0 fail 0`을 출력하고 코드 **0**으로 끝난다. `sb_secret_`, `service_role` 문자열과 JWT payload의 비공개 role은 연결 전에 거부한다(코드 **1**). 옛 JWT는 `role=anon`만 허용한다. 환경 변수 누락보다 비밀 키 거부가 우선한다. 유효한 공개 키를 확인한 뒤에만 앞 **6글자**를 출력한다.

## 검사 내용과 판정

- 로비에서 **온라인(Supabase)**, 자료의 3팀 추천 조합 **평택·당진·아산**, **12달**을 선택한다. 평택–당진·평택–아산은 만 횡단, 아산–당진은 육상 인접이다. 진행자 1개와 터치 태블릿을 흉내 낸 팀 3개의 컨텍스트는 저장소와 세션을 공유하지 않는다.
- 각 팀이 방 코드로 참가한다. 3달 동안 매달 연결점까지의 계획을 보내고 주민세 정책(`econ`), 준비 요청을 보낸다. 기준 칩·지킬 선(`crit`)은 입력 칸이 있는 1달에만 보낸다. 매달 새 인접 쌍에 2 MW 연계선을 제안·수락한다. 로비·계획·정책·기준·연계선·준비·결과마다 진행자 `S`를 `publicView`로 읽은 **rev·round·phase·econ 전체 요약**과 세 팀의 받은 스냅샷을 비교한다. 준비 버튼을 누른 뒤 예측 화면을 기다리고, 입력 전 확인 버튼이 비활성인지 단언한다. 활성 근거 첫 항목·예측 방향(`down`)·확신(`fairly`)을 채운 뒤 준비를 확인한다.
- 실제 Supabase Realtime 서버가 페이로드를 다시 인코딩하며 객체 키를 정렬하므로 `econ` 비교는 중첩 객체의 키 순서를 무시한다. 배열 순서와 값, rev·round·phase 단언은 유지한다. 프레임 관찰은 진행자의 **스냅 송신 > 0**, 팀의 **스냅 수신 > 0**을 요구한다. 앱은 `self:false`로 참가하므로 진행자는 자기 스냅을 수신하지 않는다. 그 밖의 단언은 그대로 유지한다.
- 2달 계획 시작 직후 아산 팀을 새로고침하여 새 소켓 연결, 자리·방·지난달 일지·기준 이유·상태 복구를 확인한다. 2달 결과 뒤 진행자를 새로고침하여 방·rev·경제·연계선·결과·팀 토큰 보존을 확인한다. 복구 뒤에도 다음 요청을 처리한다. 3달 운영 뒤 4달 계획으로 넘어가 최종 입력 이후에도 실제 스냅샷이 오게 한다.
- 탐색 전에 모든 페이지에 `page.on('websocket')`을 등록한다. 모든 `framesent`에서 고유 ASCII 표식을 검사하며 JSON escape를 해제한 값도 검사한다. 표식은 일지, 기준 이유, 실제 반문 답에 UI로 입력하고 로컬 저장도 확인한다. 새로고침 후와 컨텍스트 종료까지 감시하며 표식·프레임 원문·토큰은 출력하지 않는다. 반문은 매달 필수가 아니므로, 12달 모드의 주기 질문이 나오는 **2달 결과**에서 세 팀 모두 입력한다. 이때 반문이 없거나 입력/저장이 실패하면 통과시키지 않는다.
- 계획은 `mocktest.py`의 검사 API `KCP.league.plan`으로 경로를 수정해 실제 팀 전송을 거친다. 그 밖의 조작은 UI를 사용한다. 진행자 상태 주입, 가짜 Realtime, 규칙 엔진 직접 요청 처리는 하지 않는다. 경제 밸런스·12달 완주·실제 전력 거래량은 이 검사의 범위 밖이다.

각 단언은 `PASS`/`FAIL`, 마지막은 `checks N fail M`으로 출력한다. 단언 실패·진행 예외·콘솔 **error/warning**·페이지 오류·가로 스크롤·자기 팀 요청 거부는 모두 0이어야 통과하며 실패 시 종료 코드 **1**이다. nack은 송신 요청의 팀과 일치하는 팀 컨텍스트에서만 집계하여 같은 거부를 세 팀에 중복 계산하지 않는다. 오류는 유형/개수와 작업 단계만 출력한다. Playwright 예외 원문에는 `fill`의 키나 WebSocket URL이 들어갈 수 있어 출력하지 않는다. Google Fonts 요청은 빈 CSS로 처리한다(오류를 제외해 통과시키지 않음).

지연은 팀의 해당 `req` **송신 프레임 관찰 시각 → 요청 결과를 반영한 `snap` 수신 프레임 관찰 시각**이다. 요청 전 rev보다 새 rev이며 목표 계획/정책/기준/연계선/준비 값이 있는 스냅샷만 선택한다. 매 요청과 전체 **표본 수·중앙값·최대(ms)**를 출력한다. 최소 표본은 36개(3팀 × (plan·econ·ready 3요청 × 3달 + crit 1달 1요청) + 연계선 제안·수락 6)다. 브라우저–Supabase–진행자–Supabase–브라우저 왕복, 진행자의 150ms 스냅샷 대기, 이벤트 콜백 전달 시간을 포함하므로 순수 회선 지연은 아니다. 성능 합격 임계값은 정하지 않았으며 각 대기 제한은 30초다.

검사는 결과 파일·스크린샷·trace·HAR·storage_state·참가 링크를 만들지 않는다. 앱이 공개 키를 localStorage/sessionStorage에 보관하는 정상 동작은 임시 컨텍스트 안에서만 이루어진다. 컨텍스트를 닫으면 폐기한다. 출력 리다이렉션이 필요하면 Git에서 무시되는 `tests/results/`에 텍스트만 저장한다. 검사 프로세스 환경을 덤프하지 않는다.

## 작성 단계의 정적 검증

브라우저를 시작하지 않고 Python 구문 검사와 JavaScript 문자열의 구문 검사만 한다. `live.py`를 import/실행하여 문자열을 추출하지 않는다. 환경에 있는 Python 경로를 사용한다.

```sh
tests/.venv/bin/python -m py_compile tests/league/live.py
tests/.venv/bin/python - <<'PY'
import ast
import subprocess
from pathlib import Path
tree = ast.parse(Path('tests/league/live.py').read_text())
strings = []
for node in ast.walk(tree):
    if isinstance(node, ast.Assign):
        names = [t.id for t in node.targets if isinstance(t, ast.Name)]
        if any(name.endswith('_JS') for name in names):
            strings.append(ast.literal_eval(node.value))
    if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
            and node.func.attr in ('evaluate', 'evaluate_all', 'wait_for_function')
            and node.args and isinstance(node.args[0], ast.Constant)
            and isinstance(node.args[0].value, str)):
        strings.append(node.args[0].value)
for js in strings:
    subprocess.run(['node', '--check'],
                   input='const fixture = (' + js + ');\n',
                   text=True, check=True)
print(f'JS strings {len(strings)}: PASS')
PY
```

정적 검증의 성공은 실제 연결·복구의 성공을 의미하지 않는다. 실행 결과는 총괄이 기록한다.
