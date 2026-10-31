"""QA 체크 결과로 항목·축 점수와 출시 판정을 낸다(D-93).

사용: python3 tests/qa/score.py <결과 JSON> [--checklist tests/qa/checklist.json] [--open-severe N]

결과 JSON: {"sha": "...", "date": "...", "checks": {"<체크 ID>": {"status": "통과|실패|확인 못 함|해당 없음", "evidence": "..."}}}
결과 파일에는 점수가 드러나므로 저장소 밖에 둔다. 이 스크립트는 표준출력에만 쓴다.

점수 규칙(docs/QA-CHECKLIST.md §2):
- 구간은 누적. 항목 점수 = 6 구간 체크를 모두 통과하면 6, 6·8 모두면 8, 6·8·10 모두면 10.
  아래 구간을 모두 통과하고 위 구간 체크를 절반 넘게 통과하면 사이 홀수(5·7·9). 6을 절반 넘게 못 채우면 4.
- '해당 없음'은 그 구간 계산에서 뺀다. '확인 못 함'은 통과가 아니다.
- method가 device·live·classroom인 체크의 '확인 못 함'은 '현장 확인 전'으로 따로 묶고,
  그 체크를 뺀 '개발 단계 점수'도 낸다.
- proposal 구간은 계산하지 않는다.
- 축 점수 = 항목 평균. UX: 공통 휴리스틱 관문(axis_gates)이 실패하면 8 이상을 7로 내리고,
  한 항목이라도 4 이하면 전체를 5 이하로. 안정성: 가장 낮은 두 항목 평균을 넘지 않음.
- 출시 판정 = 릴리스 관문(축 'release') 체크 모두 통과 + 다섯 축 8 이상 + 열린 blocker·major 0.
"""
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

PASS, FAIL, UNKNOWN, NA = '통과', '실패', '확인 못 함', '해당 없음'
FIELD = {'device', 'live', 'classroom'}
QUALITY_AXES = ('ux', 'edu', 'model', 'visual', 'stability')


def band_state(checks, status, skip_field):
    """구간 하나의 (통과 수, 셈 대상 수). 해당 없음과(개발 단계 계산이면) 현장 확인 전 체크는 뺀다."""
    passed = total = 0
    for check in checks:
        state = status.get(check['id'], UNKNOWN)
        if state == NA or (skip_field and state == UNKNOWN and check['method'] in FIELD):
            continue
        total += 1
        passed += state == PASS
    return passed, total


def item_score(bands, status, skip_field=False):
    def full(band):
        passed, total = band_state(bands.get(band, []), status, skip_field)
        return passed == total

    def over_half(band):
        passed, total = band_state(bands.get(band, []), status, skip_field)
        return total > 0 and passed * 2 > total

    if not full('6'):
        return 5 if over_half('6') else 4
    if not full('8'):
        return 7 if over_half('8') else 6
    if not bands.get('10'):
        return 8
    if not full('10'):
        return 9 if over_half('10') else 8
    return 10


def axis_score(axis, scores, gates_ok):
    if not scores:
        return None
    mean = sum(scores.values()) / len(scores)
    if axis == 'ux':
        if not gates_ok and mean >= 8:
            mean = 7.0
        if min(scores.values()) <= 4:
            mean = min(mean, 5.0)
    if axis == 'stability' and len(scores) >= 2:
        low = sorted(scores.values())[:2]
        mean = min(mean, sum(low) / 2)
    return round(mean, 3)


def collect(checklist):
    """축·항목·구간별 체크 목록, 축 관문, 채점 유효 조건, 릴리스 관문(단계별)을 모은다.

    축 체크는 item(기본) 또는 targets(항목 이름 목록, '*'는 그 축의 모든 항목)에 들어간다.
    공통 체크는 applies_to의 (축, 항목 또는 '*', 구간)에 들어가고, release가 참이면 릴리스 관문에도 든다.
    validity가 참인 체크는 점수에 넣지 않고 채점 유효 조건으로만 본다.
    """
    parts = {part['axis']: part for part in checklist['axes']}
    plain = {axis: sorted({c['item'] for c in part['items'] if c['band'] != 'proposal' and not c.get('gate')
                           and not c.get('validity') and not c.get('targets') and axis not in ('common', 'release')})
             for axis, part in parts.items()}
    table = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    gates, validity, release = defaultdict(list), [], {'rc': [], 'formal': []}

    def put(axis, item, band, check):
        for name in (plain.get(axis, []) if item == '*' else [item]):
            table[axis][name][band].append(check)

    for axis, part in parts.items():
        for check in part['items']:
            if check['band'] == 'proposal':
                continue
            if check.get('validity'):
                validity.append(check)
            if axis == 'release' or check.get('release'):
                release[check.get('stage', 'rc')].append(check)
            if axis == 'release' or check.get('validity') and axis != 'common':
                continue
            if axis == 'common':
                for target in check.get('applies_to', []):
                    put(target['axis'], target['item'], target['band'], check)
            elif check.get('gate'):
                gates[axis].append(check)
            else:
                for item in check.get('targets') or [check['item']]:
                    put(axis, item, check['band'], check)
    return table, gates, validity, release


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('results')
    parser.add_argument('--checklist', default=str(Path(__file__).with_name('checklist.json')))
    parser.add_argument('--open-severe', type=int, default=None, help='마일스톤의 열린 blocker·major 수')
    args = parser.parse_args()
    checklist = json.loads(Path(args.checklist).read_text(encoding='utf-8'))
    result = json.loads(Path(args.results).read_text(encoding='utf-8'))
    status = {key: value['status'] for key, value in result.get('checks', {}).items()}
    bad = sorted({s for s in status.values()} - {PASS, FAIL, UNKNOWN, NA})
    if bad:
        sys.exit(f'알 수 없는 상태: {bad}')
    table, gates, validity, release_sets = collect(checklist)
    invalid = [c['id'] for c in validity if status.get(c['id'], UNKNOWN) not in (PASS, NA)]

    print(f"# QA 판정 — {result.get('sha', '?')} ({result.get('date', '?')})\n")
    if invalid:
        print(f"**채점 유효 조건 미통과 {len(invalid)}개 — 아래 점수는 참고값이다(판정 무효):** {', '.join(invalid)}\n")
    verdict, verdict_dev = {}, {}
    for axis in QUALITY_AXES:
        items = table.get(axis, {})
        gate_checks = gates.get(axis, [])
        gates_ok = all(status.get(c['id']) == PASS for c in gate_checks)
        gates_dev = all(status.get(c['id']) == PASS or (status.get(c['id'], UNKNOWN) == UNKNOWN and c['method'] in FIELD)
                        for c in gate_checks)
        scores = {name: item_score(bands, status) for name, bands in items.items()}
        dev = {name: item_score(bands, status, skip_field=True) for name, bands in items.items()}
        total, total_dev = axis_score(axis, scores, gates_ok), axis_score(axis, dev, gates_dev)
        verdict[axis], verdict_dev[axis] = total, total_dev
        print(f'## {axis}: {total} (개발 단계 {total_dev})')
        print('| 항목 | 점수 | 개발 단계 | 실패·확인 못 함 |\n|---|---|---|---|')
        for name in sorted(items):
            open_ids = [c['id'] for band in ('6', '8', '10') for c in items[name].get(band, [])
                        if status.get(c['id'], UNKNOWN) not in (PASS, NA)]
            print(f"| {name} | {scores[name]} | {dev[name]} | {', '.join(open_ids[:12])}{' …' if len(open_ids) > 12 else ''} |")
        if gate_checks:
            print(f"\n관문: {'통과' if gates_ok else '실패'} ({', '.join(c['id'] for c in gate_checks)})")
        print()

    def gate_report(name, checks):
        failed = [c['id'] for c in checks if status.get(c['id'], UNKNOWN) not in (PASS, NA)]
        print(f'## 릴리스 관문({name}): {len(checks) - len(failed)}/{len(checks)} 통과')
        if failed:
            print(f"미통과: {', '.join(failed)}")
        return failed

    rc_fail = gate_report('rc — 후보 태그 전', release_sets['rc'])
    formal_fail = gate_report('정식판 — 실기기·실연결·교실 포함', release_sets['rc'] + release_sets['formal'])
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
