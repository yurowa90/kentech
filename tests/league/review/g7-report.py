"""G7 36달 실행·G 후보·LMDI 요약. 원시 결과 경로만 읽고 제품 코드는 바꾸지 않는다."""
import json
import math
import statistics
import sys
from pathlib import Path

W = dict(pop=.10, ind=.10, fin=.125, co2=.275, appr=.15, rel=.25)
OUT = Path(__file__).parent


def read(path):
    return json.loads(path.read_text())


def rounded(x):
    return math.floor(x * 10 + .5) / 10


def geometric(parts, floor=1):
    return math.exp(sum(w * math.log(max(floor, parts[k])) for k, w in W.items()) / sum(W.values()))


def summary(rows, ids):
    strategies = list(dict.fromkeys(r['strategy'] for r in rows))
    means = {s: statistics.mean(r['score'] for r in rows if r['strategy'] == s) for s in strategies}
    winners = {i: [r['strategy'] for r in rows if r['id'] == i and r['score'] ==
                  max(t['score'] for t in rows if t['id'] == i)] for i in ids}
    return dict(meanScores=means, winners=winners,
                smrFirstCities=sum('smr' in w for w in winners.values()),
                researchGain=means.get('research', 0) - means.get('none', 0), rows=rows)


def lmdi(a, b):
    ga, gb = geometric(a['parts']), geometric(b['parts'])
    lm = ga if abs(ga - gb) < 1e-12 else (ga - gb) / math.log(ga / gb)
    terms = {k: lm * w / sum(W.values()) * math.log(max(1, a['parts'][k]) / max(1, b['parts'][k])) for k, w in W.items()}
    coop = a['coop'] - b['coop']
    clip = (min(100, max(0, ga + a['coop'])) - (ga + a['coop'])) - (min(100, max(0, gb + b['coop'])) - (gb + b['coop']))
    residual = (a['score'] - b['score']) - (ga - gb + coop + clip)
    assert abs(sum(terms.values()) - (ga - gb)) < 1e-8
    assert abs(sum(terms.values()) + coop + clip + residual - (a['score'] - b['score'])) < 1e-8
    return dict(contributions=terms, geometricDelta=ga-gb, coopDelta=coop, clipDelta=clip,
                roundingDelta=residual, scoreDelta=a['score']-b['score'])


def bot_account(run, city):
    hist = run['hist']
    fiscal = [h['fiscal'][city] for h in hist]
    c = hist[-1]['cities'][city]
    rev = {k: sum(f['rev'].get(k, 0) for f in fiscal) for k in set().union(*(f['rev'] for f in fiscal))}
    exp = {k: sum(f['exp'].get(k, 0) for f in fiscal) for k in set().union(*(f['exp'] for f in fiscal))}
    cash_delta = fiscal[-1]['cashAfter'] - fiscal[0]['cashBefore']
    bridge = sum(rev.values()) - sum(exp.values())
    assert abs(cash_delta - bridge) < .1, (city, cash_delta, bridge)
    row = next(r for r in run['rows'] if r['id'] == city)
    return dict(rev=rev, exp=exp, cash0=fiscal[0]['cashBefore'], cash=c['cash'],
                cashBridgeResidual=cash_delta-bridge, debtRatio=fiscal[-1]['debtRatio'],
                co2Intensity=c['co2Intensity'], waitingMW=row['waitingMW'],
                waitingMonths=sum(h['energy'][city]['grid']['waitingMW'] > 1e-8 for h in hist),
                curtailMWhPerMonth=row['curtailMWh'], co2PerPerson=row['co2PerPerson'], unsPct=row['unsPct'])


def main(root):
    tech, bots = read(root/'final/tech.json'), read(root/'final/bots36.json')
    ids, names = bots['ids'], bots['names']
    assert len(tech['runs']) == 24 and all(len(r['months']) == 36 for r in tech['runs'])
    assert len(bots['runs']) == 9 and all(len(r['hist']) == 36 for r in bots['runs'])
    ts = {}
    for m in (12, 24, 36):
        rows = [dict(r['months'][m-1]['score'], id=r['id'], strategy=r['strategy']) for r in tech['runs']]
        ts[m] = summary(rows, ids)
    decomposition = {}
    for city in ids:
        runs = {s: next(r for r in bots['runs'] if r['assignment'][city] == s) for s in ('renew', 'diesel')}
        a, b = [runs[s]['hist'][-1]['score']['by'][city] for s in ('renew', 'diesel')]
        decomposition[city] = dict(lmdi(a, b), parts=[a['parts'], b['parts']],
            accounts={s: bot_account(runs[s], city) for s in runs})
    candidate_results = {}
    for name in ['default', 'need72', 'need144', 'fuel2', 'fuel4']:
        diag = tech if name == 'default' else read(root/'candidates'/f'{name}.json')
        runs = tech['runs'] if name == 'default' else [r for r in tech['runs'] if r['strategy'] != 'smr'] + diag['runs']
        assert len(runs) == 24
        for floor in (1, 5, 10):
            rows = [dict(id=r['id'], strategy=r['strategy'], parts=r['parts'],
                         score=rounded(min(100, geometric(r['parts'], floor)+r['coop']))) for r in runs]
            result = summary(rows, ids)
            result['simulationFailures'] = diag['failures']
            result['started'] = {r['id']: next((m['month'] for m in r['months'] if 'smr' in m['builds']), None) for r in runs if r['strategy'] == 'smr'}
            result['adopted'] = {r['id']: next((m['month'] for m in r['months'] if 'smr' in m['adopted']), None) for r in runs if r['strategy'] == 'smr'}
            # 일반 봇에는 SMR 건설·연구 요청이 없음을 아래에서 검사하므로 G 후보가 상태를 바꾸지 않는다.
            bot_rows = [dict(id=r['id'], strategy=r['strategy'], score=rounded(min(100,
                geometric(r['parts'], floor)+run['hist'][-1]['score']['by'][r['id']]['coop']))) for run in bots['runs'] for r in run['rows']]
            bs = summary(bot_rows, ids)
            result['botsMeanScores'] = bs['meanScores']
            result['renewMinusDiesel'] = bs['meanScores']['renew'] - bs['meanScores']['diesel']
            result['botsWinners'] = bs['winners']
            candidate_results[f'{name}-floor{floor}'] = result
    for run in bots['runs']:
        assert all(not any(b['t'] == 'smr' for b in r['plans']['builds']) and 'smr' not in r['plans'].get('rq', []) for r in run['rows'])
    data = dict(technology=ts, bots=bots['horizons'], botSummary=bots['strategySummary'],
                techFailures=tech['failures'], botFailures=[s for ok, s in bots['checks'] if not ok],
                passes=dict(tech=tech['passes'], bots=len(bots['checks'])),
                smrComparison=tech['smrComparison'], renewDieselLMDI=decomposition,
                candidates=candidate_results)
    (OUT/'G7-results.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
    lines=['# G7 비교표 — 36달 FOAK 보정', '',
           '제품: 하한1·need36·FOAK 39.420289855억. 일반9전략은 bots-strategy-common, 기술4전략은 tech-strategy-common 씨앗을 그대로 사용했다. 두 실험군 순위를 합치지 않는다. 12·24달은36달 궤적의 중간 재채점이다.', '',
           '| 전략 | 36달 평균 |', '|---|---:|']
    lines += [f'| 일반 {s} | {v:.3f} |' for s,v in bots['strategySummary']['meanScores'].items()]
    lines += [f'| 기술 {s} | {v:.3f} |' for s,v in ts[36]['meanScores'].items()]
    lines += ['', '| 도시 | 일반1위 | 기술1위 | nothing 순위(12/24/36달, 각9개 중) | SMR 도입/착공 달 |', '|---|---|---|---|---|']
    deploy=candidate_results['default-floor1']
    for i in ids:
        ranks='/'.join(str(bots['horizons'][str(m)]['nothingScoreCityRanks'][i]) for m in (12,24,36))
        lines += [f"| {names[i]} | {'+'.join(bots['horizons']['36']['winners'][i])} | {'+'.join(ts[36]['winners'][i])} | {ranks} | {deploy['adopted'][i]}/{deploy['started'][i]} |"]
    means=bots['strategySummary']['meanScores']
    lines += ['', f"SMR1위 **{ts[36]['smrFirstCities']}/6**(목표≤3), 연구 이득 **{ts[36]['researchGain']:+.3f}점**(0 초과15 이하), 재생−디젤 **{means['renew']-means['diesel']:+.3f}점**.", '',
              '## 재생−디젤 LMDI', '',
              '도시별 기하평균 차이를 L(a,b)×w_k×ln(max(1,x재생)/max(1,x디젤))로 분해한 뒤 여섯 도시를 평균한다. L(a,b)=(a−b)/ln(a/b), 같으면a. 공동 보너스·0~100 절단·표시 반올림 잔차를 별도 합산한다. 감점 항목의 점수 기여에 대한 정확한 회계 분해이며 건설비·접속 대기 각각의 인과 효과 추정은 아니다.', '',
              '| 도시 | 주민 | 산업 | 재정 | 탄소 | 지지 | 신뢰 | 공동 | 절단 | 반올림 | 합계 |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    vectors=[]
    for i,d in decomposition.items():
        vals=list(d['contributions'].values())+[d[k] for k in ('coopDelta','clipDelta','roundingDelta','scoreDelta')];vectors.append(vals)
        lines.append('| '+names[i]+' | '+' | '.join(f'{v:+.3f}' for v in vals)+' |')
    lines.append('| 평균 | '+' | '.join(f'{statistics.mean(v):+.3f}' for v in zip(*vectors))+' |')
    lines += ['', '## 건설·B18·출력제어·재정 관찰', '',
              '각 셀은 재생 / 디젤이다. 건설비·전기 차익·이자는36달 누계(억), 대기MW·출력제어MWh는월평균, 탄소 집약도·부채비는36달 말이다. 전기 차익에는 연료비가 이미 반영돼 있어 연료를 또 차감하지 않는다. 모든 월 세입−세출로 현금 변화를 독립 복원했다(허용 반올림0.1억). 대기·출력제어와 재정의 상관을 별도 원인 기여점수로 중복 합산하지 않는다.', '',
              '| 도시 | 건설비 | 전기 차익 | 이자 | 대기MW | 대기 달 수 | 출력제어MWh/월 | 말 탄소t/MWh | 말 부채비 |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    paths=[('exp','capex'),('rev','tariff'),('exp','interest'),('waitingMW',),('waitingMonths',),('curtailMWhPerMonth',),('co2Intensity',),('debtRatio',)]
    for i,d in decomposition.items():
        cells=[]
        for path in paths:
            pair=[]
            for s in ('renew','diesel'):
                v=d['accounts'][s]
                for key in path:v=v[key]
                pair.append(f'{v:.3f}')
            cells.append(' / '.join(pair))
        lines.append('| '+names[i]+' | '+' | '.join(cells)+' |')
    lines += ['', '## 남은 G 후보 — 진단만, 제품 미적용', '',
              'need72·144, smrFuelMul2·4는SMR6도시만 새로 운영하고 영향 없는 비SMR18궤적을 재사용했다. 각 판의 다른5도시는 SMR을 연구하지 않는 balanced AI다. 하한1·5·10은 같은 최종 부분점수의 재채점이며 미래 건설·정책이 점수에 의존하지 않는다. 일반 봇은SMR 미건설이므로 하한만 재채점했다. 부분 실행을 전체 review 통과로 세지 않는다. G 후보 로더는 M/P/O 키 불변을 검증한다.', '',
              '| 안 | 기술 연구/연구0/SMR/수소 평균 | 연구 이득 | SMR1위 | 착공 실패 | 일반 재생−디젤 |', '|---|---|---:|---:|---|---:|']
    for name,r in candidate_results.items():
        scores=' / '.join(f"{r['meanScores'][s]:.3f}" for s in ('research','none','smr','hydrogen'))
        failures=', '.join(i for i,m in r['started'].items() if m is None) or '없음'
        lines.append(f"| {name} | {scores} | {r['researchGain']:+.3f} | {r['smrFirstCities']}/6 | {failures} | {r['renewMinusDiesel']:+.3f} |")
    lines += ['', '후보별 도시1위·도입/착공 시점·일반 전략 평균·실패 원문은 G7-results.json에 보존한다. 하한5·10도 각각 탄소 부분점수5·10 미만의 감축 신호를 가리는 비용이 있으므로 자동 채택하지 않는다.', '',
              '기술 검사 실패: '+('; '.join(tech['failures']) or '없음'), '',
              '일반 봇 검사 실패: '+('; '.join(data['botFailures']) or '없음'), '']
    (OUT/'G7-comparison.md').write_text('\n'.join(lines))


if __name__ == '__main__':
    main(Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/g7'))
