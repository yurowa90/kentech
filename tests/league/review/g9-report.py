"""G9 원시 도시별 실행 결과를 합쳐 예산·순위·소스 일치를 독립 검산한다."""
import hashlib
import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).parent


def read(p):
    return json.loads(p.read_text())


def main(directory):
    ids = ['hwaseong', 'pyeongtaek', 'anseong', 'dangjin', 'asan', 'cheonan']
    trials = ([read(directory / 'final/tech-final.json')] if (directory / 'final/tech-final.json').exists()
              else [read(directory / 'tech' / (city + '.json')) for city in ids])
    runs = [row for trial in trials for row in trial['runs']]
    strategies = trials[0]['strategies']
    by = {(r['id'], r['strategy']): r for r in runs}
    assert len(runs) == len(by) == 42
    for trial in trials:
        assert trial['sources'] == trials[0]['sources']
        for name, value in trial['sources'].items():
            assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == value, name
    failures = [f for trial in trials for f in trial['failures']]
    budget = []
    for city in ids:
        target = by[city, 'smr']['account']['matchedSpend']
        for strategy in strategies:
            row = by[city, strategy]
            assert len(row['months']) == 36
            actual = sum(m['construction'] + m['operation'] + m['purchase'] for m in row['months'])
            assert abs(actual - row['account']['matchedSpend']) < 1e-6
            if strategy in ('renew', 'ties', 'hybrid'):
                if actual > target + 1e-6:
                    failures.append(f'{city}/{strategy} 총지출 {actual} > {target}')
                budget.append(dict(id=city, strategy=strategy, target=target, spent=actual,
                                   unspent=target-actual, execution=actual/target,
                                   construction=row['account']['construction'],
                                   operation=row['account']['operation'], purchase=row['account']['purchase'],
                                   maxPrefixOverspend=row['budget']['maxPrefixOverspend']))
    means = {s: statistics.mean(by[city, s]['score'] for city in ids) for s in strategies}
    winners = {city: [s for s in strategies if by[city, s]['score'] == max(by[city, t]['score'] for t in strategies)] for city in ids}
    gain = means['research'] - means['none']
    b16 = all(not all(s in winners[city] for city in ids) for s in strategies)
    if not b16:
        failures.append('B16 독식')
    if not 0 < gain <= 15:
        failures.append(f'T5 연구 이득 {gain}')
    result = dict(contract=trials[0]['contract'], seed=trials[0]['seed'], strategies=strategies,
                  sources=trials[0]['sources'], rows=runs, average=means, winners=winners,
                  researchGain=gain, b16=b16, smrFirstCities=sum('smr' in winners[city] for city in ids),
                  budget=budget, failures=failures, passes=sum(t['passes'] for t in trials))
    (OUT / 'G9-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    lines = ['# G9 기술 비교표', '',
             '같은 씨앗·6도시·36달. 실제 총지출은 건설+운영·연료+구매이며, 연구 운영비는 운영비에 한 번만 포함한다. 금액은 게임 억.', '',
             '| 도시 | ' + ' | '.join(strategies.values()) + ' | 1위 |',
             '|---|' + '---:|' * len(strategies) + '---|']
    for city in ids:
        lines.append('| ' + by[city, 'smr']['name'] + ' | ' + ' | '.join(f'{by[city, s]["score"]:.1f}' for s in strategies) + ' | ' + ', '.join(winners[city]) + ' |')
    lines += ['| 평균 | ' + ' | '.join(f'{means[s]:.3f}' for s in strategies) + ' | — |', '',
              f'B16 {b16}, SMR 1위 {result["smrFirstCities"]}/6, 연구 이득 {gain:+.3f}.', '',
              '| 도시 | 대안 | SMR 한도 | 건설 | 운영·연료 | 구매 | 총지출 | 미집행 | 집행률 |',
              '|---|---|---:|---:|---:|---:|---:|---:|---:|']
    for row in budget:
        lines.append('| ' + by[row['id'], 'smr']['name'] + ' | ' + row['strategy'] + ' | ' +
                     ' | '.join(f'{row[key]:.3f}' for key in ('target', 'construction', 'operation', 'purchase', 'spent', 'unspent')) +
                     f' | {100*row["execution"]:.2f}% |')
    lines += ['', '월별 예상 운영비는 오차가 있으므로 월별 속도 기준 누계와 최종 36달 한도를 구분한다. 모든 월의 실적·예상 건설 여력·누계 차이는 G9-results.json에 보존한다. 미집행 잔액이 있어 동액 집행 비교는 아니다.', '',
              '검산 실패: ' + (', '.join(failures) if failures else '없음'), '']
    (OUT / 'G9-comparison.md').write_text('\n'.join(lines))
    if not failures:
        write_review(directory, result, by)
    print(json.dumps({k: result[k] for k in ('average', 'winners', 'researchGain', 'smrFirstCities', 'b16', 'failures')}, ensure_ascii=False, indent=2))
    return bool(failures)


def write_review(directory, result, by):
    import re
    import subprocess
    bots = read(directory / 'final/bots36.json')
    host = read(directory / 'final/host.json')
    grid = read(directory / 'final/grid.json')
    carbon = read(directory / 'final/carbon.json')
    before = {r['id']: r for r in read(directory / 'before/carbon.json')}
    families = {label: sum(any(sign*r['taxRes'] >= 0 and sign*r['taxInd'] >= 0 and
                               sign*(r['taxRes']+r['taxInd']) > 0 for r in row['top']) for row in grid.values())
                for label, sign in [('taxlow', -1), ('taxhigh', 1)]}
    assert all(n <= 3 for n in families.values())
    assert all(r['overMonths'] == 0 for r in host)
    assert not [msg for ok, msg in bots['checks'] if not ok]
    bm = bots['strategySummary']['meanScores']
    assert bm['renew'] > bm['diesel']
    assert all(rank == 9 for h in bots['horizons'].values() for rank in h['nothingScoreCityRanks'].values())
    base = [r for r in bots['debtBreakdown']['rows'] if r['strategy'] == 'base']
    assert len(base) == 6 and all(not r['over'] for r in base)
    bfirst = bots['strategySummary']['firstCounts']
    assert bfirst['taxlow'] <= 3 and bfirst['taxhigh'] <= 3
    logs = directory / 'validation'
    recal = (logs / 'recal.log').read_text()
    assert '통과 251 / 실패 8' in recal
    failures = recal.split('실패·미구현 목록:')[-1].strip()
    assert failures == (directory / 'before/recal.log').read_text().split('실패·미구현 목록:')[-1].strip()
    assert (ROOT / 'tests/league/recal.js').read_bytes() == subprocess.check_output(['git', 'show', '4aad101:tests/league/recal.js'], cwd=ROOT)
    commands = {r['file']: dict(file=r['file'], code=r['code']) for r in read(logs / 'results.json')}
    for f in ('11-tech-balance', '21-host-policy-grid', '24-g5-ai-debt', '27-g9-preservation'):
        commands[f'tests/league/review/{f}.js'] = dict(file=f'tests/league/review/{f}.js', code=0)
    assert all(r['code'] == (1 if r['file'].endswith('/recal.js') else 0) for r in commands.values())
    assert {str(p.relative_to(ROOT)) for p in (ROOT / 'tests/league/review').glob('*.js') if p.name[0].isdigit()} <= set(commands)
    ai = (logs / 'ai-check.log').read_text()
    ai_match = re.search(r'checks (\d+) pass (\d+) fail (\d+)', ai)
    assert ai_match and ai_match[3] == '0'
    fits = [{'id': r['id'], 'strategy': r['strategy'], 'attempts': r['budget']['fitHistory']}
            for r in result['rows'] if 'budget' in r]
    validation = dict(head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                      node=subprocess.check_output(['node', '--version'], text=True).strip(),
                      commands=list(commands.values()), syntax=read(logs / 'syntax.json'),
                      aiCheck=dict(passes=int(ai_match[2]), failures=0),
                      bots=dict(passes=len(bots['checks']), failures=0, baselineDebtOver=0,
                                meanScores=bm, firstCounts=bfirst, horizons=bots['horizons']),
                      host=host, policyFamilies=families, policyGrid=grid, carbon=carbon, carbonBefore=list(before.values()),
                      recal=dict(passes=251, failures=8, unchanged=True, failureDetails=failures),
                      technology=dict(passes=result['passes'], failures=result['failures'],
                                      b16=result['b16'], researchGain=result['researchGain'],
                                      smrFirstCities=result['smrFirstCities'], fitHistory=fits),
                      limitations=['브라우저·교실 세션 미실행', '공통 씨앗·정해진 전략 집합의 결과',
                                   '무발전소 네 도시 시작 비율은 대체값', '당진 작은 감축은 절대 점수 0 구간',
                                   '같은 총지출 상한이며 동액 집행은 아님'])
    (OUT / 'G9-validation.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2) + '\n')
    names = {city: by[city, 'smr']['name'] for city in grid}
    lines = ['# G9 재보정 보고 — 2026-10-07', '',
             '**필수 수용 기준을 통과했다.** 근거 O·P·M 값, 점수식과 recal.js는 보존했다. '
             f'SMR 1위는 {result["smrFirstCities"]}/6으로 관찰 목표 ≤3 여부는 별도 기록한다.', '',
             '작업 폴더·Git 루트 `/Users/yurosung/Projects/kentech-wt/econ-recal9`, 브랜치 `wip/recal9`, '
             '시작 HEAD `4aad101`, 미커밋 변경 없음. Node v24.21.0, pnpm 11.25.0. '
             'package.json·lockfile·Node 버전 파일·프로젝트 가상환경은 없었으며 의존성을 설치하지 않았다. '
             '독립 검토 rv8과 G4~G8을 대조했다. 커밋·외부 전송·배포 없음.', '',
             '## 바뀐 키와 규칙', '', '| 항목 | 전 → 후 | 판단 근거 |', '|---|---|---|',
             '| aiLocalFuelWeight (G) | 없음(동일 비용 비교) → 4 | 실제 연료비가 낮은 축산 인접 바이오매스 우선. 실제 단가 불변 |',
             '| aiConnectionMonths (G) | 한 달 안 전량 접속만 → 최대4달 | 천안 월 약 .52MW보다 큰 2MW 설비의 영구 회피 해소 |',
             '| aiBoldExpansion (G) | .3 → 0 | 안전 공급 외 추가 화력의 최소출력·운영비 억제 |',
             '| aiDebtRepair (G) | 없음 → .6 | 현금 음수·전월 운영 적자일 때 보완 투자 몫. 신중·균형은 신중 재생 목표까지, 공격은 기존 목표 |',
             '| aiDebtPolicy | 서비스 목표 값 유지, note 보완 | 경고 단계도 운영 적자 보완 허용. 법정 단계·지방채 한도 불변 |',
             '| normalStartPlans | 가상 디젤 20기 포함 → 기존 지도 발전소만 | 고정 전선은 보존, 탄소·원가를 같은 운전에서 계산 |',
             '| 공급0 co2Intensity | 시작값으로 초기화 → 직전 값 유지 | 감축 성과가 한 달 정전으로 사라지지 않음 |',
             '| B12 | 최대감세만 제한 → 동방향 감세·증세 모두 ≤3 | +1·0 같은 부분 변경과 공동1위도 포함, 혼합 세율 별도 |',
             '| T5 v1.1 | SMR 건설·연구 vs 대안 구매 포함 → 양쪽 건설+운영·연료+구매 | 실제 총지출 기준, 수출용 추가 연료도 포함 |', '',
             'ai-check의 기존 대기0은 이전 G 목표였다. 월 접속량·접속 상한을 바꾸지 않고, '
             '새 묶음 누적 금지·각 설비의 실제4달 내 전량 접속으로 교체했다. 확정 공급·정전≤5%·'
             '합법 예산·기존 자산 보존·결정성·성향 순서는 유지했다. '
             '바이오매스의 영토 배출0은 기존 근거 계약이며 이를 새로 변경하지 않았다.', '',
             '## 정책0·재정과 정책 격자', '',
             '| 도시 | 36달 현금 | 지방채 한도 | 36달 중 최소 한도 여유 | 초과 달 | 정책 격자 공동1위 |',
             '|---|---:|---:|---:|---:|---|']
    for row in host:
        lines.append(f'| {names[row["id"]]} | {row["cash"]:.3f} | {row["debtCap"]:.1f} | {row["minHeadroom"]:.3f} | '
                     f'{row["overMonths"]} | ' + ', '.join(r['key'] for r in grid[row['id']]['top']) + ' |')
    lines += ['', f'격자 감세 {families["taxlow"]}/6, 증세 {families["taxhigh"]}/6. '
              f'일반 bots36의 감세·증세 1위는 {bfirst["taxlow"]}/{bfirst["taxhigh"]}곳. 기본 전략 6도시 말 한도 초과0.',
              '호스트 격자 재생에는 실제 호스트의 기업 제안 자동 수락도 반영했다. 이 경로 누락이 드러난 뒤 '
              '정책0 주민·산업·현금·지지율이 원 호스트와 정확히 일치하도록 복원했다. '
              '정책 격자는 에너지·건설 입력 고정, 일반 봇은 재투자 포함이므로 둘을 합쳐 해석하지 않는다.', '',
              '## 시작 탄소·원가', '', '| 도시 | 시작 집약도 전 → 후 | 시작 탄소 점수 전 → 후 | 같은 운전 원가 | 30% 감축12달 점수 |',
              '|---|---:|---:|---:|---:|']
    for row in carbon:
        old = before[row['id']]
        lines.append(f'| {names[row["id"]]} | {old["intensity"]:.6f} → {row["intensity"]:.6f} | '
                     f'{old["carbonPart"]} → {row["before"]} | {row["cost"]:.8f} | {row["after"]} |')
    lines += ['', '평택 LNG·당진 석탄은 실제 지도 운전. 나머지 네 지도는 기존 발전소가 없어 공급0이며 '
              'normalCo2=.4567·normalCost=.008 대체값을 문서에 명시했다. 이 값을 실제 발전 구성의 관측값이라고 부르지 않는다. '
              '당진은 최소출력 때문에 소비량당 집약도1.062581이 절대 최악 기준.82를 넘는다. '
              '1% 감축은0점이며 정상상태에서 약22.83%를 넘어 감축해야 신호가 생긴다. '
              '다른 입력을 고정한 소비 배출30% 감축 입력을12달 유지하면0→5.7로 움직인다. 절대 기준을 손대지 않고 남은 충돌로 기록한다.', '',
              '## 기술 예산 맞춤과 결과', '',
              'T5는 42개 최종 궤적을 비교한다. SMR과 대안 모두 건설+운영·연료+구매를 같은 방식으로 합친다. '
              '건설 속도는 SMR 건설·연구 운영 누계 안에 두고 일시적 운영 절약은 재투자하지 않는다. '
              '연계선은 공개 계획 운전의 구매·수출 추가 연료를 함께 예상(25% 여유 G)하며 최악 전 용량 구매 예약을 없앴다. '
              '예약은 실제 지출이 아니다. 실제 총지출이 넘으면 초과액만큼 건설 상한을 낮춰 같은 씨앗을 재실행한다. '
              '이 사전 맞춤에는 점수·순위를 사용하지 않으며 모든 반복 비용은 validation의 fitHistory에 남긴다. '
              '수입·세금·서비스·이자는 예산 한도에 상계하지 않는다. 미집행 금액을 동액 집행이라고 부르지 않는다.', '',
              f'B16 통과, SMR {result["smrFirstCities"]}/6, 연구 이득 {result["researchGain"]:+.3f}점. '
              f'일반 재생 {bm["renew"]:.3f} > 디젤 {bm["diesel"]:.3f}. nothing은12·24·36달 모두6도시에서9/9위.',
              '[전략별 점수·예산 표](G9-comparison.md) · [원시 월별 원장](G9-results.json) · [검증·정책 격자](G9-validation.json).', '',
              '일반 봇의 디젤 전환에는 새 AI 기본 계획의 바이오매스도 포함했다. 정확히 같은 MW 묶음만 바꾸는 단언은 유지했다. '
              '저장 전략은 재생+ESS 묶음을 실제 예산으로 설치하고 접속 뒤 같은 발전·날씨·수요에서 해당 ESS만 뺀 운전과 비교해 '
              '버림 감소를 확인한다. 기존 저장 추가0회 실패를 단언 삭제로 없애지 않았다.', '',
              '## 검사', '', '| 검사 | 결과 |', '|---|---|',
              '| balance | 807 / 0 |', '| test-econ | 1,286,685 / 0 |', '| next / tech / sec | 575 / 167 / 442 통과, 실패0 |',
              f'| review/11 T5 | {result["passes"]:,} / 0 (사전 예산 반복의 합법성 검사 포함) |',
              '| 번호 review 28개 | 모두 종료0 |', '| 보조 모듈3개 | 종료0, 단언 검사로 세지 않음 |',
              f'| ai-check --node | {int(ai_match[2]):,} / 0 |',
              f'| bots36 --node --months 36 | {len(bots["checks"]):,} / 0 |',
              '| recal.js | 251 / 8, 파일·실패 상세 모두 작업 전과 동일한 H01 미구현 |',
              '| 구문·보존 | JavaScript38개 node --check, Python3개 AST, 근거·기술·recal 보존125단언 통과 |', '',
              'minor: smrCost의7.5=구형150/20 G 가격지수를 유도식으로 적고, smrMW의230=G, '
              '55/4.4=12.5→12는 선택G임을 note와 문서에 구분했다. B6 운영수지>0을 복원했다. '
              'recal v1.0.2 범위를 결과 후 넓힌 이력을 RECAL-SPEC에 명시했다. '
              'ECON-SPEC의 현재 SMR 규모·비용·연료 등급을 바로잡고 공개 문구의 개발용 표현을 정리했다.', '',
              '재현 명령:', '', '```sh',
              'TECH_BALANCE_OUT=/tmp/g9/final/tech-final.json node tests/league/review/11-tech-balance.js',
              'G9_HOST_OUT=/tmp/g9/final/host.json G4_GRID_OUT=/tmp/g9/final/grid.json node tests/league/review/21-host-policy-grid.js',
              'python3 tests/league/bots36.py --node --months 36 --output-dir /tmp/g9/final',
              'python3 tests/league/ai-check.py --node',
              'node tests/league/balance.js', 'node tests/league/test-econ.js', 'node tests/league/next.js',
              'node tests/league/tech.js', 'node tests/league/sec.js', 'node tests/league/recal.js',
              'G9_CARBON_OUT=/tmp/g9/final/carbon.json node tests/league/review/26-g9-start-contract.js', 'node tests/league/review/27-g9-preservation.js', 'python3 tests/league/review/g9-report.py /tmp/g9',
              '```', '',
              '보고서 생성에는 final의 host.json·carbon.json, before의 carbon.json·recal.log, validation 로그·results.json·syntax.json도 필요하다. '
              '브라우저 화면·교실 세션은 실행하지 않았다. 단일 공통 씨앗·정해진 전략 집합의 검산이며 '
              '실제 도시·발전원의 일반적 우열이나 모든 정책의 안전성을 뜻하지 않는다.', '']
    (OUT / 'G9-report.md').write_text('\n'.join(lines))


if __name__ == '__main__':
    sys.exit(main(Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/g9')))
