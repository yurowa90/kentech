"""G8 결과·월별 예산 원장 독립 검산. python3 tests/league/review/g8-report.py /tmp/g8"""
import ast
import hashlib
import json
import statistics
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
OUT = Path(__file__).parent
ALT = ('renew', 'ties', 'hybrid')


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main(root):
    tech = read(root / 'final/tech.json')
    before = read(root / 'before/tech.json')
    bots = read(root / 'final/bots36.json')
    strategies = list(tech['strategies'])
    ids = list(tech['winners'])
    names = {r['id']: r['name'] for r in tech['runs']}
    by = {(r['id'], r['strategy']): r for r in tech['runs']}
    assert len(by) == len(tech['runs']) == 42
    assert len(ids) == 6 and len(strategies) == 7
    assert all(len(r['months']) == 36 for r in tech['runs'])
    assert all(sha(REPO / f) == v for f, v in tech['sources'].items()), '결과와 현재 코드의 해시 불일치'

    # 원래 네 전략의 도시 상태 전체와 기존 관찰 필드를 비교한다. 실패 개수만 비교하지 않는다.
    preserved = {}
    for old in before['runs']:
        new = by[old['id'], old['strategy']]
        equal = old['state'] == new['state'] and old['score'] == new['score']
        equal &= all(all(new['months'][i][k] == v for k, v in m.items())
                     for i, m in enumerate(old['months']))
        assert equal, (old['id'], old['strategy'], '기존 궤적 변경')
        preserved[f"{old['id']}/{old['strategy']}"] = equal

    budget_rows = []
    for city in ids:
        ref = by[city, 'smr']
        for strategy in ALT:
            run = by[city, strategy]
            capital = research = purchase = 0
            for index, month in enumerate(run['months']):
                capital += month['construction']
                research += month['researchOperation']
                purchase += month['purchase']
                spent = capital + research + purchase
                target = sum(m['construction'] + m['researchOperation'] for m in ref['months'][:index + 1])
                assert abs(spent - month['budget']['spent']) < 1e-6
                assert abs(target - month['budget']['target']) < 1e-6
                assert spent <= target + 1e-6, (city, strategy, index + 1, spent, target)
            assert abs(spent - run['account']['matchedSpend']) < 1e-6
            budget_rows.append(dict(id=city, strategy=strategy, **run['budget'],
                construction=capital, researchOperation=research, purchase=purchase,
                ties=len([t for t in run['months'][-1]['ties'] if t['st'] == 'built' and city in (t['a'], t['b'])]),
                importMWh=sum(m['importMWh'] for m in run['months']),
                exportMWh=sum(m['exportMWh'] for m in run['months']),
                waitingMW=run['months'][-1]['grid']['waitingMW']))

    # 기존 필수·회귀 판정을 보고서 생성 단계에서도 독립 계산한다.
    means = {s: statistics.mean(by[c, s]['score'] for c in ids) for s in strategies}
    winners = {c: [s for s in strategies if by[c, s]['score'] == max(by[c, k]['score'] for k in strategies)] for c in ids}
    assert all(abs(means[s] - tech['average'][s]) < 1e-8 for s in strategies)
    assert {c: set(v) for c, v in winners.items()} == {c: set(v) for c, v in tech['winners'].items()}
    gain = means['research'] - means['none']
    b16 = all(not all(s in winners[c] for c in ids) for s in strategies)
    assert b16 and 0 < gain <= 15 and not tech['failures']
    bm = bots['strategySummary']['meanScores']
    assert bm['renew'] > bm['diesel']
    assert all(rank == 9 for h in bots['horizons'].values() for rank in h['nothingScoreCityRanks'].values())
    previous_summary = read(OUT / 'G7-results.json')
    assert previous_summary['bots'] == bots['horizons']
    assert previous_summary['botSummary'] == bots['strategySummary']
    bot_failures = [msg for passed, msg in bots['checks'] if not passed]
    assert bot_failures == ['B18 storage 실제 ESS 추가 0회·충전으로 버림 감소 0MWh']

    commands = read(root / 'validation/results.json')
    assert len(commands) == 30
    assert all(r['code'] == (1 if r['file'].endswith('/recal.js') else 0) for r in commands)
    recal = (root / 'validation/recal.log').read_text()
    assert '통과 251 / 실패 8' in recal
    original_recal = subprocess.check_output(['git', 'show', 'HEAD:tests/league/recal.js'], cwd=REPO)
    assert original_recal == (REPO / 'tests/league/recal.js').read_bytes()
    commands.append(dict(file='tests/league/review/11-tech-balance.js', code=0,
                         passes=tech['passes'], failures=len(tech['failures'])))
    growth = subprocess.run(['node', 'tests/league/review/18-growth-calibration.js', str(root / 'final/bots36.json')],
                            cwd=REPO, text=True, capture_output=True)
    assert growth.returncode == 0
    assert len(json.loads(growth.stdout)['strategies']) == 9
    syntax = []
    for file in sorted((REPO / 'tests/league/review').glob('*.js')):
        result = subprocess.run(['node', '--check', str(file)], capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        syntax.append(dict(file=str(file.relative_to(REPO)), code=result.returncode))
    ast.parse(Path(__file__).read_text())
    protected = ['ui/build.js', 'ui/econ.js', 'ui/league-core.js', 'ui/league-ai.js',
                 'ui/econ-data.js', 'ui/tech-data.js', 'tests/league/recal.js', 'tests/league/bots36.py']
    protected += [str(f.relative_to(REPO)) for f in OUT.glob('G[567]-*')]
    preservation = {}
    for file in protected:
        original = subprocess.check_output(['git', 'show', 'HEAD:' + file], cwd=REPO)
        preservation[file] = original == (REPO / file).read_bytes()
    assert all(preservation.values())

    rows = [{k: r[k] for k in ('id', 'name', 'strategy', 'score', 'parts', 'coop', 'avgUns',
             'adopted', 'account', 'months', 'tieRequests', 'rejected')}
            | ({'budget': r['budget']} if 'budget' in r else {}) for r in tech['runs']]
    data = dict(contract=tech['contract'], seed=tech['seed'], strategies=tech['strategies'],
                average=means, winners=winners, smrFirstCities=tech['smrFirstCities'],
                smrTargetMet=tech['smrTargetMet'], researchGain=gain, b16=b16,
                budget=budget_rows, rows=rows, smrComparison=tech['smrComparison'],
                bots=bots['horizons'], botFailures=bot_failures, sources=tech['sources'])
    (OUT / 'G8-results.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    validation = dict(head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip(),
        node=subprocess.check_output(['node', '--version'], text=True).strip(),
        commands=commands, helperModules=read(root / 'validation/modules.json'), syntax=syntax, pythonAST=True, preserved=preservation,
        originalTrajectories=preserved, prefixBudgetChecks=len(budget_rows) * 36,
        growthAnalysisWithInput=True, recal=dict(passes=251, failures=8, sha256=sha(REPO / 'tests/league/recal.js'),
            failureDetails=recal.split('실패·미구현 목록:')[-1].strip()),
        bots=dict(checks=len(bots['checks']), failures=bot_failures,
                  renewMinusDiesel=bm['renew']-bm['diesel'], nothingAllCitiesAllHorizonsNinth=True),
        technology=dict(passes=tech['passes'], failures=tech['failures'], b16=b16,
                        smrFirstCities=tech['smrFirstCities'], smrGoalOnly=True),
        limitations=['브라우저 화면·교실 세션 미실행', '단일 공통 씨앗, 전략별 서로 다른 반사실 게임; AI 성향별 정책 차이 포함',
                     '동일 누적 예산 상한이며 미집행 잔액 존재; 연계선 단독을 동액 집행으로 해석하지 않음'])
    (OUT / 'G8-validation.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2) + '\n')

    lines = ['# G8 비교표 — T5 v1.1 같은 예산 대안', '',
        '기술 7전략 × 6도시 × 36달. 씨앗 tech-strategy-common, 다른 5도시는 balanced AI. 일반 9전략은 별도 실험이며 순위를 합치지 않는다. 금액은 게임 억 단위.', '',
        '| 도시 | ' + ' | '.join(tech['strategies'][s] for s in strategies) + ' | 전체 1위 |',
        '|---|' + '---:|' * len(strategies) + '---|']
    for city in ids:
        lines.append('| ' + names[city] + ' | ' + ' | '.join(f"{by[city,s]['score']:.1f}" for s in strategies) +
                     ' | ' + ', '.join(tech['strategies'][s] for s in winners[city]) + ' |')
    lines.append('| 평균 | ' + ' | '.join(f'{means[s]:.3f}' for s in strategies) + ' | — |')
    lines += ['', f"B16 통과. SMR 1위 {tech['smrFirstCities']}/6; ≤3 G 목표 {'달성' if tech['smrTargetMet'] else '미달(필수 실패 아님)'}. 연구 이득 {gain:+.3f}점.", '',
        '## 예산과 실제 집행', '',
        '목표는 해당 도시 SMR의 누적 건설비(실증비 포함)+연구 운영비다. 대안은 건설비+연구 운영비+이웃 구매대금으로 대조한다. 매달 누계 초과를 금지하며, 판매 수익은 투자 한도를 늘리지 않는다. 예약금은 비용으로 더하지 않는다.', '',
        '| 도시 | 대안 | SMR 한도 | 건설 | 연구 운영 | 이웃 구매 | 집행률 | 미집행 | 준공 연계선 |',
        '|---|---|---:|---:|---:|---:|---:|---:|---:|']
    for row in budget_rows:
        lines.append(f"| {names[row['id']]} | {row['strategy']} | {row['target']:.3f} | {row['construction']:.3f} | {row['researchOperation']:.3f} | {row['purchase']:.3f} | {100*row['execution']:.2f}% | {row['unspent']:.3f} | {row['ties']} |")
    lines += ['', '18개 대안 궤적의 648개 월별 누계는 모두 상한 이하다. 월별 한도·실제 지출·미집행·건설 허용액을 G8-results.json의 rows[].months[].budget에 보존했다. 연계선 단독은 기존 AI가 경제성이 있다고 판단한 선만 제안하고 이웃이 수락한다. 연결 후 자동 구매의 최악 상한을 예약하므로 집행률이 낮을 수 있다. 이를 동액 집행이라고 주장하지 않으며 재생+저장과 혼합의 실집행률을 함께 비교한다.', '',
        '| 도시 | 재생 수입/수출 MWh | 협력 수입/수출 MWh | 혼합 수입/수출 MWh | 재생/혼합 말 접속 대기 MW |',
        '|---|---:|---:|---:|---:|']
    for city in ids:
        rr = {r['strategy']: r for r in budget_rows if r['id'] == city}
        cells = [f"{rr[s]['importMWh']:.1f}/{rr[s]['exportMWh']:.1f}" for s in ALT]
        lines.append('| '+names[city]+' | '+' | '.join(cells)+f" | {rr['renew']['waitingMW']:.3f}/{rr['hybrid']['waitingMW']:.3f} |")
    lines += ['', '## 기존 회귀 조건', '',
        f"일반 재생 {bm['renew']:.3f} > 디젤 {bm['diesel']:.3f}(차이 {bm['renew']-bm['diesel']:+.3f}). nothing은 12·24·36달 모두 6도시에서 9/9위. 연구 몰빵 {means['research']:.3f} − 연구 0 {means['none']:.3f} = {gain:+.3f}.", '',
        f"기술 검사 {tech['passes']:,} 통과 / {len(tech['failures'])} 실패. 일반 bots36 {len(bots['checks']):,} 검사 / 기존 1실패: {bot_failures[0]}. 기존 저장 봇을 이번 작업에서 변경하지 않았다.", '',
        '## G7 대비 해석', '',
        '기존 네 전략의 24개 도시 궤적은 수정 전 직접 재실행 결과와 도시 상태·월별 기존 관찰 필드가 모두 같다. 바뀐 것은 비교 대상과 예산 검사다. SMR이 추가 대안보다 언제나 우세하다는 결론은 성립하지 않는다. SMR 6도시 독식 조건이 해소되어 지시 3의 LCOE 기반 재보정은 발동하지 않았다. 엔진 식·근거 키·G 계수는 바꾸지 않았다.', '']
    (OUT / 'G8-comparison.md').write_text('\n'.join(lines))
    report = [
        '# G8 — 공정한 기술 비교, T5 v1.1 (2026-10-06)', '',
        '명세 기준일2026-10-06, 최종 검증2026-10-07(KST).', '',
        f"**기술7전략 전체의 B16 독식 금지를 통과했다. SMR은 {tech['smrFirstCities']}/6도시 1위다.** 엔진·근거 키·G 계수는 바꾸지 않았다. SMR≤3은 희망 목표로만 기록하며 이번 결과는 {'달성' if tech['smrTargetMet'] else '미달'}이다. 지정 balance·test-econ·next·tech·sec·review는 실패0, recal.js는251통과/8실패다. 별도 일반 bots36에는 기존 B18 저장 봇1실패가 남는다.", '',
        '## 변경과 비교 범위', '',
        '작업 폴더와 실제 Git 루트는 `/Users/yurosung/Projects/kentech-wt/econ-recal`, 브랜치는 `wip/recal`, 시작 HEAD는 `1439923`이며 시작 시 미커밋 변경은 없었다. Node v24.21.0·pnpm11.25.0·Python3.14.7을 확인했다. package.json·lockfile·Node 버전 파일·프로젝트 가상환경은 없고 설치는 하지 않았다.', '',
        'review/11에 재생+저장·연계선 협력·혼합을 추가했다. 기본 공급·건설·재정 정책은 기존 leagueAI.plan의 careful(재생·혼합), bold(연계선)를 사용하고 다른5도시는 balanced를 유지한다. 연구 인력을 새로 짓지 않고 연구 큐를 비운다. 점수나 도시 이름에 따른 선택·새 최적화 AI는 없다. 재생 추가 투자에는 기존 SMR 입지 추가 함수를 재사용해 태양광→풍력→소수력 순으로 합법 묶음을 찾는다. 같은 AI의 소수력 상한·저장 비율을 사용하며, 접속 여유가 부족하면 ESS도 묶어서 확보한다. 접속 월 처리량·대기·출력제어는 엔진 그대로다.', '',
        '연계선은 기존 AI의 경제성 판단에 따라 제안하고 이웃 balanced AI가 수락한다. 혼합은 첫 연계선 준공까지 협력 예산을 확보하고 이후 남는 예산을 재생+저장에 배분한다. 강제 수락·무료 이웃 발전·무료 연결은 없다. 실제 준공과 수입/수출 발생을 검사한다.', '',
        '## 같은 예산 맞춤', '',
        '도시별 SMR을 먼저36달 실행해 월별 기준 B(m)=Σ(실제 신규 투자비+연구 운영비)를 만든다. 투자비에는 설비·전선·연구소·대학·실증비가 이미 들어 있으므로 실증비를 또 더하지 않는다. 대안은 A(m)=Σ(신규 투자비+연구 운영비+실제 이웃 구매대금)이며 모든 달 A(m)≤B(m)을 검사한다. 연계선은 자기 부담 절반이 신규 투자비에 포함된다. 판매 수입을 예산에 재투입하지 않는다. 일반 전력 연료비·세금·서비스·이자·운영수익 차이는 각 전략의 실제 결과로 남는다.', '',
        '현금이나 부채 한도에 돈을 넣지 않는다. AI가 읽는 공개 예산의 복사 인터페이스에만 실험 한도를 적용하고, 최종 요청은 원래 호스트가 실제 재정 한도로 다시 검사한다. 요청 설비가 예산 때문에 잘려 승인되지 않았는지도 확인한다.', '',
        '준공 후 전력 거래는 자동이어서 미래 구매비를 무시한 같은 건설비 비교는 불공정하다. 남은 매달에 연계선 전 용량×24시간×달력 일수×이웃 판매가(초전도 최대 용량 포함)가 수입으로 결제되는 보수적인 상한을 예약한다. 주간 결제액 반올림 여유0.03억/달을 둔다. 각 미래 월의 SMR 누적 한도를 모두 만족하도록 현재 건설 여력을 제한하므로 미래 예산을 앞당겨 쓰지 않는다. 예약은 지출이 아니며 실제 구매액만 원장에 더한다. 이 규칙은 협력의 가능성을 보수적으로 제한하며 미래 실현된 사건이나 점수로 거래 상대를 선택하지 않는다.', '',
        '돈을 태우거나 설비를 분할해 숫자만 같게 만들지 않는다. 설비 단위·실제 재정·입지·AI 협상·거래 예약으로 남은 금액은 미집행으로 공개한다. 따라서 연계선 단독을 SMR과 동액 집행했다고 해석하면 안 된다. 재생+저장·혼합의 실제 집행률도 도시별로 함께 제시한다. 648개 월별 누적 예산을 보고서 스크립트가 원시 건설·연구·구매액에서 독립 복원했다.', '',
        '## 결과', '',
        '[전체 도시×전략 점수·평균·예산·거래 비교표](G8-comparison.md), [월별 원장과 원시 관찰 요약](G8-results.json), [검증 기록](G8-validation.json).', '',
        f"연구 이득은 {gain:+.3f}점으로 `(0,15]`를 충족한다. 일반 재생{bm['renew']:.3f}>디젤{bm['diesel']:.3f}, nothing은12·24·36달 모두6도시에서9/9위다. 원래 네 기술 전략24개 궤적은 작업 전 직접 재실행 결과와 도시 상태 전체 및 기존 월별 관찰 필드가 동일하다. 일반9전략의 모든 중간·최종 요약도 G7과 동일하다.", '',
        'SMR6도시 독식이 해소되었으므로 지시3의 MWh당 비용 대조·근거 키 재보정 단계는 발동하지 않았다. 출처 키를 추가하거나 변경하지 않았다. 이 결과는 하나의 공통 씨앗과 지정 전략 집합에 대한 검증이다. AI 성향별 재정 정책 차이도 포함하므로 기술만의 인과효과나 모든 가능한 전략·실제 발전원의 우열을 뜻하지 않는다.', '',
        '## 실행과 검증', '',
        '| 검사 | 결과 |', '|---|---|',
        '| balance | 795통과 / 0실패 |',
        '| test-econ | 1,286,685통과 / 0실패 |',
        '| next / tech / sec | 575 / 167 / 442통과, 각각0실패 |',
        f"| review/11 T5 v1.1 | {tech['passes']:,}통과 / 0실패, 42개36달 궤적 |",
        '| 나머지 번호 review 24개 | 모두 종료0. review/18은 bots36 실제 결과를 넣어 추가 실행 |',
        '| review 보조 모듈3개 | 종료0, 단언 검사로 세지 않음 |',
        '| recal.js | 251통과 / 8실패. 전부 기존 H01 대기오염 미구현 |',
        '| 일반 bots36 | 18,072검사 / 기존 B18 storage 추가 ESS0회 실패1 |',
        f"| 구문 | review JavaScript {len(syntax)}개 node --check 통과, g8-report.py AST 통과 |", '',
        '주요 재현 명령(저장소 루트):', '', '```sh',
        'TECH_BALANCE_OUT=/tmp/g8/final/tech.json node tests/league/review/11-tech-balance.js',
        'python3 tests/league/bots36.py --node --months 36 --output-dir /tmp/g8/final',
        'node tests/league/balance.js', 'node tests/league/test-econ.js',
        'node tests/league/next.js', 'node tests/league/tech.js', 'node tests/league/sec.js',
        'node tests/league/recal.js',
        'node tests/league/review/18-growth-calibration.js /tmp/g8/final/bots36.json',
        'node --check tests/league/review/11-tech-balance.js',
        'python3 tests/league/review/g8-report.py /tmp/g8', '```', '',
        '전체 실행 파일 목록·종료코드는 G8-validation.json에, 로그는 `/tmp/g8/validation`에 있다. 보고서 재생성에는 위 최종 결과 외에 작업 전 `before/tech.json`과 `validation/results.json·modules.json·recal.log`가 필요하다. 원래 네 전략의 동일성은 이 작업 전 실행본과 비교한다.', '',
        '브라우저 화면·교실 세션 검사는 실행하지 않았다. 변경은 검사와 문서뿐이다. 엔진4파일·자료2파일·bots36.py·recal.js·G5~G7 산출물은 HEAD와 바이트 단위로 같다. 커밋·push·배포·프로젝트 자료 외부 전송은 하지 않았다.', '']
    (OUT / 'G8-report.md').write_text('\n'.join(report))
    print(json.dumps(dict(average=means, winners=winners, smrFirstCities=tech['smrFirstCities'],
                         passes=tech['passes'], budgetChecks=len(budget_rows)*36), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main(Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/g8'))
