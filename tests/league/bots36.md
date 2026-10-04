# 독립 밸런스 검사와 전략 봇

기준은 [ECON-BALANCE.md](../../docs/ECON-BALANCE.md)의 목표·계약이다. 현재 구현의 값을 기대값으로 삼지 않는다. 게임 계수와 자료 파일은 수정하지 않는다. 목표 범위는 명세의 G(게임 가정), 에너지 입력의 주민 수 비례 근사는 M(검사 장치)이다.

## 실행

저장소 루트에서:

```sh
node --check tests/league/balance.js
node tests/league/balance.js
python3 -m py_compile tests/league/bots36.py
```

엔진 검사는 `Math.random`을 예외로 막고 DOM 없이 실행한다. 도시 목록·이름·최소 시작 현금 도시는 자료에서 읽는다. 절별 `B3 통과 5/6`, 측정값을 포함한 실패 목록, 마지막 `pass N fail M`을 출력한다. 계약 필드 누락도 실패다. 실패 시 종료 코드 1.

브라우저 검사는 로컬 총괄이 기존 Playwright 환경에서 실행한다. 패키지 설치가 필요하면 이 작업 밖에서 준비한다.

```sh
python3 tests/srv.py 9430 .
# 다른 터미널; 기존 tests/.venv가 있으면 그 Python을 사용
tests/.venv/bin/python tests/league/bots36.py
tests/.venv/bin/python tests/league/bots36.py http://127.0.0.1:9430/index.html --months 36
tests/.venv/bin/python tests/league/bots36.py --quick
```

기본은 36달·6회전, `--months`는 12/24/36, `--quick`은 12달·2회전이다. 항상 36턴 상태를 만들고 지정한 달까지만 관찰한다. 전체 실행에서는 전략마다 모든 도시를 한 번 맡는다. 빠른 실행의 빈 도시×전략 칸은 `-`로 표시한다.

화면 클릭 없이 `calib.py`의 AUTO 문자열을 읽어 `__auto(id)`를 등록하고, `page.evaluate`에서 자리 요청 → host next → 정책·계획·연계선 요청 → run을 수행한다. `nothing`은 빈 지도, `diesel`은 자동 연결 후 예산 안에서 디젤 추가, `renew`는 태양광·풍력·배터리 순환 추가다. `ties`·`taxlow`·`taxhigh`는 AUTO 연결 계획을 쓴다. 저세율은 주민·산업 -2와 서비스 +2, 고세율은 +2와 서비스 -2다. 매년 1월 기존 계획에 설비를 더하고, 합계 비용은 `spendOf`와 `budget`으로 검사한다. 설비 분류·자리·송전 경로는 buildGame 자료와 함수에서 읽는다.

연계선 전략은 모든 후보선을 제안한다. 상대 전략은 예산이 허용하면 수락하며 비용을 분담한다. 실패한 수락 요청은 원자료에 남긴다. 회전마다 같은 방 씨앗을 써 난수 조건을 맞춘다. 사건 분포 검사는 별도 200개 방에서 한다.

표준출력과 `tests/results/bots36.md`에 평균 결과·도시×전략 점수·실패 목록, `tests/results/bots36.json`에 달별 재정·에너지·경제 상태·제안·계획을 남긴다. `fin` 등 점수 부분이 없으면 표에는 `-`를 쓰며 엔진 계약 검사에서는 실패한다. 끝은 `checks N fail M`, 실패 시 종료 코드 1이다. 페이지 오류·콘솔 error/warning도 실패다. 로컬 주소만 허용하고 외부 요청을 차단한다. 외부 글꼴 CSS는 네트워크 없이 빈 스타일시트로 대체한다.

## 절 ↔ 단언

| 절 | balance.js | bots36.py |
|---|---|---|
| B1 | 현실 계수(M)·교육 배속(G)·startMix 0..1 범위(v1.1). 6도시×40씨앗, 정전100/5%의 주민·지지율 감소, 6달 정전 뒤 18달 회복, 보통36달 몫 변화≤0.6%. 현실계수0/배속0 동치와 배속2배 반응 | 공개 econ.eduSpeed 존재 |
| B2 | approvalDrop=10(G), 보정 후 approval0, 악조건 12달 평가 false·보통 true, 시작 기준 평가식 | 전략별 평가 통과 수 보고 |
| B3 | 세금/주민 도시 간 차이≤1%, 저세율·서비스+2 적자, 고세율 수지 개선≥0.3cash0·지지율 차이≤-8, 도시별 5×5 격자에서 저세율·고서비스 1위≤2곳 | taxlow/taxhigh 전략 비교 |
| B4 | 거래만 늘리면 price 동일, 평균0.3/0.5 원가 price 동일, 원가0 도시도 평균 포함, tariffMarkup(G)·tariffGross·차익식·음수 차익 | 실제 거래 결과 보고 |
| B5 | parts 키 정확히 pop/ind/fin/co2/appr/rel, 현금3cash0와 0의 fin=100, 한도50% 부채 fin≤60, fin 가중<0.15 | 6개 점수 부분 보고 |
| B6 | 모든 도시 보통 조건 연 운영 수지/cash0=0.4~0.8 | 실제 1년차 비율은 참고 표에 보고, 합격 판정에 사용하지 않음 |
| B7 | 거래 급증 전후 한도 변화≤20%, 무거래와 같은 한도, 12/24달 최근12달 세입 기준 한도, 초기 첫달 연환산 | cash+debtCap+확정투자+tieAt−연계몫+지원금 예산식, 한도 아래 건설 요청 거부·기존 계획 보존 |
| B8 | 동일 조건 제안 40씨앗 승자≥2곳, MW 누락이면 mw.ok와 전체ok=false, 최소cash0 도시 보조20·산업세-2·재생100 40씨앗 1위 | 매달 econInput.spareMW 유한값, 실제 보고서 offers eval checks.mw.have 유한값·관찰 건수>0 |
| B9 | 브라우저 담당 | 200방×12달 사건0/1개·평균0.4~0.6·두개≤10%·직전달 같은 사건0. 계절4턴 분포 참고. eventBonus 별도 줄 |
| B10 | yearStart 입력 불변·paidYear·중복 지급 없음, 12/24/36달 초과 상태 불변·report:null, newsMin/newsFrac(G), 작은 초기 흐름 뉴스 없음 | 매달 cashAfter==다음cashBefore. 별도12달 장치에서 양수 지원금·철거 회수를 강제로 발생시켜 상태와 fiscal 일치·별도 줄·회수액 검사 |

## 명세 해석

- B1 감소·회복은 실제 주민 수의 시작 대비 변화다. 보통 조건의 몫 변화는 퍼센트포인트가 아닌 **시작 몫 대비 상대 %**다. 40씨앗 평균을 달마다 계산하고 36달 중 최대 절댓값을 판정한다. 회복은 씨앗별 최대 손실의 평균과 마지막 손실의 평균을 비교한다.
- 보통 입력은 주민10만명당 하루25MWh×30일, 원가0.012억/MWh, 지역 CO₂ 하루2.5t·소비 CO₂ 4t, 재생15%, spareMW100으로 구성한다. opex=demMWh×costPerMWh이며 정책·거래·건설은 0이다. 모든 시나리오는 먼저 이 조건으로 보정한다.
- B2의 '첫 달 보정 뒤'는 첫 monthStep 직전 calibrate 결과로 해석했다. 상태의 approval0가 이 시작값을 보존해야 한다.
- B3은 한 도시의 정책만 바꾸고 나머지는 보통 조건으로 둔다. 격자는 주민·산업 세율을 함께 움직이는 세율5단계×서비스5단계다. 동일한 한 씨앗에서 36달 점수를 비교하며 공동1위도 해당 정책의 1위로 센다. resTax 약3배·svcStep 0.5 수준·fin 가중0.10 안팎은 권고값이므로 정확한 값 대신 행동 목표와 명시적 상한을 판정한다.
- B4의 원가 하한 검사는 전체 도시 평균을 두 입력에서 같은 값으로 유지한다. 평균 포함 검사는 원가0 도시도 포함하는지 확인한다. 차익·매출 허용오차는 보고 금액 반올림을 위한 0.01억이다. 명세가 차익과 opex를 동시 보고할 때 비용 상계 방법을 정하지 않아 exp.opex의 제거 여부는 단언하지 않는다.
- B7은 거래 이외 세입은 모두 한도 산정에 포함한다. 초기 연환산은 첫달 반복 세입×12+1월 지원금1회로 해석했다. 12달 전 한도는 이 첫달 기준을 유지한다. 한도 반올림 오차는 0.1억이다.
- B8은 주민·에너지 규모가 달라도 자격 차이가 순위를 가리지 않도록 workers1·mw1·rePct0·unsMax100의 동일한 검사 제안을 사용한다. '동일 입력'은 각 도시 주민 수에 비례한 보통 입력이다. 최소 도시의 정책은 12달 반영 후 평가한다.
- B9 '계절 평균1.2 안팎·예전 분포 유지'는 기존 1개+40%두개의 평균1.4도 포함하는 1.0~1.6으로 기록한다. 달 모드의 0/1개 조건과 두개≤10%는 별도로 모두 단언한다.
- B10 작은 뉴스는 보통 조건 초기3달의 이주·이전 뉴스0으로 판정한다. 뉴스 문턱 수치는 명세에 없어 임의의 문턱을 강제하지 않는다. 회수액 줄의 이름은 fiscal.salvage로 정했다(명세는 이름을 확정하지 않음). 사건 줄은 명세가 정한 fiscal.eventBonus다. 현금 항등식 오차는 1e-6억이다.
- 봇의 B6 비율은 용어의 운영 수지에서 eventBonus를 제외해 계산한다(B9 별도 보고 요구). CO₂는 전체 관찰 달의 소비 CO₂ 합/달별 주민 수 합(t/인·월), 정전은 달별 비율 평균이다. 평가 통과는 12달마다 실제 pass=true인 횟수다.

샌드박스에서는 브라우저를 실행하지 않는다. page.evaluate JS 문법은 다음처럼 임시 디렉터리에서 검사하며 파일을 남기지 않는다:

```sh
python3 - <<'PY'
import ast, pathlib, subprocess, tempfile
def constant(file, key):
    module = ast.parse(pathlib.Path(file).read_text())
    return next(ast.literal_eval(n.value) for n in module.body
                if isinstance(n, ast.Assign) and any(
                    isinstance(t, ast.Name) and t.id == key for t in n.targets))
js = constant('tests/league/bots36.py', 'JS')
auto = constant('tests/league/calib.py', 'AUTO')
with tempfile.TemporaryDirectory(prefix='bots36-syntax-') as tmp:
    p = pathlib.Path(tmp) / 'evaluate.js'
    p.write_text(auto + '\nconst run = (' + js + ');\n')
    subprocess.run(['node', '--check', str(p)], check=True)
PY
```
