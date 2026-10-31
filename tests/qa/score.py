"""QA 체크 결과로 항목·축 점수와 출시 판정을 낸다(D-93, 규칙 원본은 docs/QA-CHECKLIST.md §2).

사용: python3 tests/qa/score.py <결과 JSON> [--checklist tests/qa/checklist.json] [--open-severe N]

결과 JSON: {"sha": "...", "date": "...", "checks": {"<체크 ID>": {"status": "통과|실패|확인 못 함|해당 없음", "evidence": "..."}}}
결과 파일에는 점수가 드러나므로 저장소 밖에 둔다. 이 스크립트는 표준출력에만 쓴다.
종료 코드: 정식판 가능 0, 그 밖 1, 입력 오류 2.
"""
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

PASS, FAIL, UNKNOWN, NA = '통과', '실패', '확인 못 함', '해당 없음'
STATES = {PASS, FAIL, UNKNOWN, NA}
FIELD = {'device', 'live', 'classroom'}
QUALITY_AXES = ('ux', 'edu', 'model', 'visual', 'stability')
BANDS = ('6', '8', '10')


def counted(checks, status, skip_field):
    """구간 하나에서 셈할 체크의 통과 여부 목록과, 현장 확인 전이라 뺀 체크가 있었는지.
    해당 없음과(개발 단계 계산이면) 현장 확인 전 체크는 뺀다."""
    out, skipped = [], False
    for check in checks:
        state = status.get(check['id'], UNKNOWN)
        if state == NA:
            continue
        if skip_field and state == UNKNOWN and check['method'] in FIELD:
            skipped = True
            continue
        out.append(state == PASS)
    return out, skipped


def item_score(bands, status, skip_field=False, gates=()):
    """항목 점수. bands: {'6': [...], '8': [...], '10': [...]}(항목 고유 + 공통 구간 체크), gates: 6 구간 전제(공통 조건).

    - 전제(gates) 가운데 하나라도 '통과'가 아니면 4(원문 '모든 구간의 관문'). 전제는 늘 해당하는 조건이라 해당 없음도 통과로 보지 않는다.
    - 구간 누적: 아래 구간을 모두 통과하고 위 구간을 절반 넘게 통과하면 사이 홀수.
    - 셈할 체크가 처음부터 없는 구간은 채운 것으로 본다(원문에 그 구간 조건이 없음).
      체크가 모두 해당 없음인 구간도 채운 것으로 본다. 현장 확인 전 체크를 빼서 비게 된 구간만 채우지 않은 것으로 본다.
    - 10 구간 체크가 없는 항목의 최고는 8이다.
    """
    for check in gates:
        if status.get(check['id'], UNKNOWN) != PASS:
            return 4

    def state(band):
        checks = bands.get(band, [])
        marks, skipped = counted(checks, status, skip_field)
        if not marks:
            return (False, False) if skipped else (True, False)  # 현장 확인 전으로 비었음 / 원래 없거나 모두 해당 없음
        return all(marks), sum(marks) * 2 > len(marks)

    full6, half6 = state('6')
    if not full6:
        return 5 if half6 else 4
    full8, half8 = state('8')
    if not full8:
        return 7 if half8 else 6
    if not bands.get('10'):
        return 8
    full10, half10 = state('10')
    if not full10:
        return 9 if half10 else 8
    return 10


def axis_score(axis, scores, gates_ok):
    """원문 기준표의 축 규칙. UX: 관문 실패면 7 이하, 한 항목 4 이하면 6 미만. 모형: 한 항목 6 이하면 7 이하. 안정성: 가장 낮은 두 항목 평균 상한."""
    if not scores:
        return None
    values = list(scores.values())
    mean = sum(values) / len(values)
    if axis == 'ux':
        if not gates_ok:
            mean = min(mean, 7.0)
        if min(values) <= 4:
            mean = min(mean, 5.9)
    if axis == 'model' and min(values) <= 6:
        mean = min(mean, 7.0)
    if axis == 'stability' and len(values) >= 2:
        low = sorted(values)[:2]
        mean = min(mean, sum(low) / 2)
    return round(mean, 3)


def collect(checklist):
    """축·항목·구간별 체크, 항목별 6 구간 전제, 축 관문, 채점 유효 조건, 릴리스 관문(단계별)을 모은다.

    - 축 체크: item에 들어간다. targets가 있으면 그 항목들('*'는 그 축의 모든 항목)에 들어가는데,
      '*'로 걸린 6 구간 체크는 항목마다의 전제(gate)가 된다(원문 '공통 조건: 모든 구간의 관문').
    - 공통 체크: applies_to의 (축, 항목, 구간)에 들어간다. 항목이 '*'이고 구간이 6이면 전제다.
      release가 참이면 그 stage(rc·formal·after)의 릴리스 관문에도 든다.
    - validity가 참인 공통 체크는 점수에 넣지 않고 채점 유효 조건으로만 본다.
    - gate가 참인 축 체크는 축 관문(UX 휴리스틱)이다.
    """
    parts = {part['axis']: part for part in checklist['axes']}
    names = {axis: sorted({c['item'] for c in part['items'] if c['band'] != 'proposal' and not c.get('gate')
                           and not c.get('validity') and not c.get('targets')})
             for axis, part in parts.items() if axis in QUALITY_AXES}
    table = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    pre = defaultdict(lambda: defaultdict(list))
    gates, validity = defaultdict(list), []
    release = {'rc': [], 'formal': [], 'after': []}

    def put(axis, item, band, check):
        if item == '*':
            for name in names.get(axis, []):
                (pre[axis][name].append(check) if band == '6' else table[axis][name][band].append(check))
        else:
            table[axis][item][band].append(check)

    for axis, part in parts.items():
        for check in part['items']:
            if check['band'] == 'proposal':
                continue
            if axis == 'release' or check.get('release'):
                release[check.get('stage', 'rc')].append(check)
            if axis == 'release':
                continue
            if axis == 'common':
                if check.get('validity'):
                    validity.append(check)
                for target in check.get('applies_to', []):
                    put(target['axis'], target['item'], target['band'], check)
            elif check.get('gate'):
                gates[axis].append(check)
            else:
                for item in check.get('targets') or [check['item']]:
                    put(axis, item, check['band'], check)
    return table, pre, gates, validity, release


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('results')
    parser.add_argument('--checklist', default=str(Path(__file__).with_name('checklist.json')))
    parser.add_argument('--open-severe', type=int, default=None, help='마일스톤의 열린 blocker·major 수')
    args = parser.parse_args()
    checklist = json.loads(Path(args.checklist).read_text(encoding='utf-8'))
    result = json.loads(Path(args.results).read_text(encoding='utf-8'))
    known = {c['id']: c for part in checklist['axes'] for c in part['items']}
    status, warnings = {}, []
    for key, value in result.get('checks', {}).items():
        state = value.get('status') if isinstance(value, dict) else None
        if key not in known:
            warnings.append(f'체크리스트에 없는 ID(무시): {key}')
            continue
        if state not in STATES:
            warnings.append(f'{key}: 상태 없음 또는 알 수 없음({state!r}) → 확인 못 함으로 셈')
            state = UNKNOWN
        status[key] = state
    table, pre, gates, validity, release = collect(checklist)
    invalid = [c['id'] for c in validity if status.get(c['id'], UNKNOWN) not in (PASS, NA)]

    print(f"# QA 판정 — {result.get('sha', '?')} ({result.get('date', '?')})\n")
    for line in warnings:
        print(f'경고: {line}')
    if warnings:
        print()
    if invalid:
        print(f"**채점 유효 조건 미통과 {len(invalid)}개 — 아래 점수는 참고값이다(판정 무효):** {', '.join(invalid)}\n")
    verdict, verdict_dev = {}, {}
    for axis in QUALITY_AXES:
        items = table.get(axis, {})
        names = sorted(set(items) | set(pre.get(axis, {})))
        gate_checks = gates.get(axis, [])
        gates_ok = all(status.get(c['id']) == PASS for c in gate_checks)
        gates_dev = all(status.get(c['id']) == PASS or (status.get(c['id'], UNKNOWN) == UNKNOWN and c['method'] in FIELD)
                        for c in gate_checks)
        scores = {n: item_score(items.get(n, {}), status, gates=pre[axis].get(n, ())) for n in names}
        dev = {n: item_score(items.get(n, {}), status, skip_field=True, gates=pre[axis].get(n, ())) for n in names}
        total, total_dev = axis_score(axis, scores, gates_ok), axis_score(axis, dev, gates_dev)
        verdict[axis], verdict_dev[axis] = total, total_dev
        field_wait = any(status.get(c['id'], UNKNOWN) == UNKNOWN and c['method'] in FIELD
                         for n in names for b in BANDS for c in items.get(n, {}).get(b, []))
        tag = ' (현장 확인 전)' if field_wait else ''
        print(f'## {axis}: {total} · 개발 단계 {total_dev}{tag}')
        print('| 항목 | 점수 | 개발 단계 | 실패·확인 못 함 |\n|---|---|---|---|')
        for n in names:
            open_ids = [c['id'] for c in pre[axis].get(n, []) if status.get(c['id'], UNKNOWN) != PASS]
            open_ids += [c['id'] for b in BANDS for c in items.get(n, {}).get(b, []) if status.get(c['id'], UNKNOWN) not in (PASS, NA)]
            shown = ', '.join(open_ids[:12]) + (f' 외 {len(open_ids) - 12}개' if len(open_ids) > 12 else '')
            print(f'| {n} | {scores[n]} | {dev[n]} | {shown} |')
        if gate_checks:
            print(f"\n축 관문: {'통과' if gates_ok else '미통과'} ({', '.join(c['id'] for c in gate_checks)})")
        print()

    def gate_report(name, checks):
        failed = [c['id'] for c in checks if status.get(c['id'], UNKNOWN) not in (PASS, NA)]
        print(f'## 릴리스 관문({name}): {len(checks) - len(failed)}/{len(checks)} 통과')
        if failed:
            print(f"미통과: {', '.join(failed)}")
        return failed

    rc_fail = gate_report('rc — 시점 A·B', release['rc'])
    formal_fail = gate_report('정식판 — 시점 A~D, 실기기·실연결 포함', release['rc'] + release['formal'])
    gate_report('출시 판정 밖 — 시점 E·F(첫 시범 수업 전, 2022 짝 완성)', release['after'])
    axes_ok = all(v is not None and v >= 8 for v in verdict.values())
    axes_dev_ok = all(v is not None and v >= 8 for v in verdict_dev.values())
    severe_ok = args.open_severe == 0 if args.open_severe is not None else None
    rc_ready = not invalid and not rc_fail and axes_dev_ok and severe_ok is True
    ready = not invalid and not formal_fail and axes_ok and severe_ok is True
    print(f"\n## 판정\n- rc 후보: {'가능' if rc_ready else '불가'} (다섯 축 개발 단계 점수 8 이상: {'예' if axes_dev_ok else '아니오'}, rc 관문: {'통과' if not rc_fail else '미통과'})")
    print(f"- 정식판: {'가능' if ready else '불가'} (다섯 축 8 이상: {'예' if axes_ok else '아니오'}, 정식판 관문: {'통과' if not formal_fail else '미통과'})")
    print(f"- 열린 blocker·major 0: {'확인 안 함(--open-severe)' if severe_ok is None else ('예' if severe_ok else '아니오')}")
    print(f"- 채점 유효 조건: {'통과' if not invalid else '미통과'}")
    return 0 if ready else 1


if __name__ == '__main__':
    sys.exit(main())
