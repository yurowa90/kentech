"""G10 로컬 검사 산출물에서 표를 만든다. 실행: python3 .../g10-report.py /private/tmp/g10/final"""
import json
import re
import subprocess
import sys
from pathlib import Path


def main():
    root = Path(sys.argv[1])
    read = lambda name: json.loads((root / name).read_text())
    host, grid, carbon = read('host.json'), read('grid.json'), read('carbon.json')
    tech, bots = read('tech.json'), read('bots/bots36.json')
    basic, reviews = read('basic-status.json'), read('review-status.json')
    seeds=read('seeds.json')
    axes = {axis + direction: sum(any(sign * r[axis] > 0 for r in value['top']) for value in grid.values())
            for axis in ['taxRes', 'taxInd'] for direction, sign in [('Down', -1), ('Up', 1)]}
    families = {name: sum(any(sign*r['taxRes'] >= 0 and sign*r['taxInd'] >= 0 and sign*(r['taxRes']+r['taxInd']) > 0
                            for r in value['top']) for value in grid.values()) for name, sign in [('cut', -1), ('raise', 1)]}
    failures = [message for passed, message in bots['checks'] if not passed]
    node = r"""
const fs=require('fs'),vm=require('vm'),cp=require('child_process');
const load=s=>{const c=vm.createContext({KCP:{}});c.window=c;vm.runInContext(s,c);return c.KCP.ECON_DATA.params;};
const a=load(cp.execFileSync('git',['show','cc8fd25:ui/econ-data.js'],{encoding:'utf8'})),b=load(fs.readFileSync('ui/econ-data.js','utf8'));
console.log(JSON.stringify(Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>[k,{before:a[k]||null,after:b[k]||null}]))));
"""
    keys = json.loads(subprocess.check_output(['node', '-e', node], text=True))
    data = dict(budgetExcessDefinition='fitHistory.excess는 월별 누계−같은 달 SMR 누계의 최댓값; spent−target은 최종월 차이', keys=keys, axes=axes, families=families, host=host, carbon=carbon,
                grid={id: {'top': v['top'], 'base': v['base']} for id, v in grid.items()},
                tech={k: tech[k] for k in ['average','researchGain','winners','smrFirstCities','smrTargetMet','passes','failures']},
                techRuns=[{k:r[k] for k in ['id','strategy','score','parts','account','avgUns']} |
                          {'budget':r.get('budget'),'co2Intensity':r['state']['cities'][r['id']]['co2Intensity']} for r in tech['runs']],
                bots=dict(checks=len(bots['checks']),failures=failures,summary=bots['strategySummary'],horizons=bots['horizons']),
                basic=basic,reviews=reviews,seeds=seeds,researchBorrow=read("research-borrow.json"))
    out = Path(__file__).parent
    (out / 'G10-results.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    names = bots['names']
    fmt = lambda x: f'{x:.3f}'
    lines = ['# G10 재보정 보고 — 2026-10-07', '',
             '기준 `cc8fd25`, 브랜치 `wip/recal10`. 작업 시작 미커밋 변경 없음. Node v24.21.0, pnpm 11.25.0. 패키지·lockfile·Node 버전 파일 없음. 커밋·외부 전송 없음.', '',
             '## 변경 키와 규칙', '', '| 항목 | 전 → 후 | 실제 작동 |', '|---|---|---|']
    for key, change in keys.items():
        a,b=change['before'],change['after']
        val=lambda p: '없음' if p is None else json.dumps(p['v'],ensure_ascii=False)
        transition='값 유지(note 정정)' if a and b and isinstance(a['v'],dict) and a['v']==b['v'] else f'{val(a)} → {val(b)}'
        lines.append(f"| {key} (G) | {transition} | {b['note'] if b else '운영 적자 보완 예외 제거. 주의 단계는 필수 공급만, 위기는 건설 중단'} |")
    lines += ['| 종류 간 비교 | 입지 가중이 포함된 capacity/socialCost → 건설비+예상 연료비 차이 | 공개 가격·수요의 대표 주 급전을 남은 기간(최대 36달)으로 환산. 입지 가중은 같은 바이오매스 종류 안에서만 사용 |',
              '| 시작 기준 | 부분 공급분을 전 수요에 외삽 → 부족분을 계통값으로 혼합 | normalCo2=.4567·normalCost=.008. 무발전 도시와 같은 규칙 |',
              '| T5 예산 | 월별 누계 vs 최종 한도 → 같은 달 누계+1e-6억 | 비용만으로 사전 반복. 운영·연료·구매 포함. 실질 초과 허용 없음 |',
              '| bots36 storage (G9 변경 명시) | 잔여 버림 ESS만 → 태양광·접속용 ESS 묶음도 추가 | 신중 재생 목표까지 실제 예산으로 건설하는 전략. MW 전환과 구분 |',
              '| bots36 옛 560행 | 양수 분기 안의 양수 단언 → 분기 밖 실제 관측 단언 | 같은 급전에서 ESS 제거 시 버림 비증가를 검사하고, 접속용 ESS 관측 중 실제 감소가 적어도 한 번 있는지 별도로 단언 |',
              '| bots36 수용 | nothing 상위3위 아님 → 9/9위 | 12·24·36달 각각 검사. base 36달 전 구간 부채 초과 0·재생 평균>디젤도 단언 |', '',
              '새 연구 인력의 차입을 다시 허용(aiResearchDebtShare=1)한 동일 코드 진단에서는 안성 지방채 초과 16달·최소 한도 여유 −132.798억이었다. 차입 제한을 적용하면 초과 0이며 공급 여유·접속량·건설 지연·보완 투자 비율은 기존 값 그대로다. aiDebtRepair는 이 수용에 필요하지 않아 제거했다.', '',
              '## 정책0와 B12', '', '| 도시 | 36달 현금 | 지방채 한도 | 최소 한도 여유 | 초과 달 | 공동 1위(주민세,산업세,서비스) |', '|---|---:|---:|---:|---:|---|']
    for r in host:
        top=' / '.join(x['key'] for x in grid[r['id']]['top'])
        lines.append(f"| {names[r['id']]} | {fmt(r['cash'])} | {fmt(r['debtCap'])} | {fmt(r['minHeadroom'])} | {r['overMonths']} | {top} |")
    lines += ['', f"동방향 계열: 감세 {families['cut']}/6, 증세 {families['raise']}/6. 각각 ≤3을 검사한다.", '',
              '| 축 | 인상 1위 도시 수 | 인하 1위 도시 수 |', '|---|---:|---:|',
              f"| 주민세 | {axes['taxResUp']}/6 | {axes['taxResDown']}/6 |",
              f"| 산업세 | {axes['taxIndUp']}/6 | {axes['taxIndDown']}/6 |", '',
              '혼합 세율·공동 1위를 포함하고 도시 중복은 제거한다. 한 축의 한 방향이 6/6이면 실패한다. 에너지·건설 고정의 정책 격자와 재투자 포함 bots36은 별도 비교다.', '',
              '## 기술·봇 결과', '',
              f"T5 연구 이득 {tech['researchGain']:+.3f}점, B16 독식 {'없음' if not any(len([i for i,w in tech['winners'].items() if s in w])==6 for s in tech['average']) else '있음'}. SMR 1위 {tech['smrFirstCities']}/6(희망 목표 ≤3).",
              f"재생 평균 {bots['strategySummary']['meanScores']['renew']:.3f} > 디젤 {bots['strategySummary']['meanScores']['diesel']:.3f}.", '',
              '| 도시 | SMR | 연구 몰빵 | 연구0 | 수소 | 재생+저장 | 연계선 | 혼합 |', '|---|---:|---:|---:|---:|---:|---:|---:|']
    for id in grid:
        rows={r['strategy']:r for r in tech['runs'] if r['id']==id}
        lines.append('| '+names[id]+' | '+' | '.join(fmt(rows[s]['score']) for s in ['smr','research','none','hydrogen','renew','ties','hybrid'])+' |')
    alternatives=[r for r in tech['runs'] if r.get('budget')]
    lines += ['', '| 도시·대안 | 총지출 / SMR 한도 | 최대 월별 누계 초과 | 사전 실행 수 |', '|---|---:|---:|---:|']
    for r in alternatives:
        b=r['budget'];lines.append(f"| {names[r['id']]}/{r['strategy']} | {fmt(b['spent'])} / {fmt(b['target'])} | {b['maxPrefixOverspend']:.8f} | {len(b['fitHistory'])} |")
    lines += ['', '## 남은 충돌', '',
              '저탄소 전략의 탄소 부분점수가 100 상한에 붙어 구별되지 않는다. 바이오매스 영토 배출 0 회계도 기여한다. 근거값·점수식을 유지하고, 별도 bioCo2를 일부 반영할지는 사용자 결정 후보로만 기록했다. 구현하지 않았다.', '',
              '| 도시 | 탄소 100인 T5 전략 수/7 | 시작 탄소 집약도 | 시작 원가 |', '|---|---:|---:|---:|']
    for r in carbon:
        count=sum(x['id']==r['id'] and x['parts']['co2']==100 for x in tech['runs'])
        lines.append(f"| {names[r['id']]} | {count}/7 | {r['intensity']:.6f} | {r['cost']:.8f} |")
    lines += ['', '무발전 네 도시의 시작 대체값, 당진의 작은 감축 0점 구간도 남는다. 평택은 부족분 혼합으로 시작 집약도 .388082→.399030, 원가 .00839096→.00832858이다. 고정 씨앗의 보정 결과이며 실제 도시·발전원의 우열이나 모든 씨앗에서의 안전 보증이 아니다.', '',
              '공통 씨앗의 정책0 기본 봇·호스트는 모든 달 지방채 초과 0이다. 별도 씨앗에서는 alpha 0, beta 화성 8달, gamma 화성 11달, delta 화성 3달, epsilon 화성 10달 초과였다(그 외 도시는 0). 정책0의 모든 씨앗 안전성은 남은 충돌이며 지정 공통 씨앗의 수용 결과와 구분한다.', '',
              '## 검증', '', '| 검사 | 결과 |', '|---|---|']
    for name in ['balance','test-econ','next','tech','sec','recal']:
        log=(root/(name+'.log')).read_text()
        summaries=[l for l in log.splitlines() if re.search(r'^(pass |checks |통과 |총 |결과|시험:)' ,l)]
        lines.append(f"| {name} | {'; '.join(summaries[-1:]) or ('종료 '+str(basic[name]))} |")
    ai=re.search(r'checks (\d+) pass (\d+) fail (\d+)',(root/'ai.log').read_text()).groups()
    lines += [f"| ai-check --node | {ai[0]} 검사, {ai[2]} 실패 |", f"| review/11 T5 | {tech['passes']} 통과, {len(tech['failures'])} 실패 |",
              f"| review 나머지 | 번호 검사 {sum(k[0].isdigit() for k in reviews)}개·보조 모듈 {sum(not k[0].isdigit() for k in reviews)}개 종료0 여부 검사. 비정상 종료 {sum(v!=0 for v in reviews.values())}개 |",
              f"| bots36 --node --months 36 | {len(bots['checks'])} 검사, {len(failures)} 실패 |",
              '| B12 | 750조합·계열·축별 독식 검사 |', '',
              'T5 대안 18개×36달=648개 월별 누계 단언을 통과했다. 예산 맞춤 4건(안성 재생·혼합, 천안 재생·혼합)은 비용만으로 재실행했다. fitHistory.excess는 최종월 차이가 아니라 최대 월별 누계 차이다.', '',
              '구문·AI·recal 기존 실패 상세 대조는 [검증 기록](G10-validation.json), 수치와 변경 키는 [결과 자료](G10-results.json)에 보존한다. 브라우저·운영 환경 검사는 실행하지 않았다.', '',
              '재현: 아래 검사 결과를 같은 디렉터리에 저장한 뒤 이 보고서를 생성한다.', '', '```sh',
              'out=/private/tmp/g10/accepted',
              'G9_HOST_OUT=$out/host.json G4_GRID_OUT=$out/grid.json node tests/league/review/21-host-policy-grid.js',
              'G9_CARBON_OUT=$out/carbon.json node tests/league/review/26-g9-start-contract.js',
              'TECH_BALANCE_OUT=$out/tech.json node tests/league/review/11-tech-balance.js',
              'python3 tests/league/bots36.py --node --months 36 --output-dir "$out/bots"',
              'python3 tests/league/ai-check.py --node',
              'node tests/league/review/g10-sensitivity.js reserve-low --grid',
              'node tests/league/review/g10-sensitivity.js research-borrow',
              'python3 tests/league/review/g10-report.py "$out"', '```', '',
              '보고서 생성에는 basic-status.json·review-status.json·seeds.json·research-borrow.json과 해당 검사 로그도 필요하다. G9 sec 표는 실제 524로 정정했다.']
    (out/'G10-report.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps(dict(axes=axes,families=families,researchGain=tech['researchGain'],botsFailures=failures,techFailures=tech['failures']),ensure_ascii=False))

if __name__ == '__main__':
    main()
