"""score.py 점수 규칙 단위 검사(가짜 체크리스트). 사용: python3 tests/qa/test_score.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from score import PASS, FAIL, UNKNOWN, NA, axis_score, item_score  # noqa: E402

failures = 0


def ok(cond, label):
    global failures
    failures += not cond
    print(('PASS ' if cond else 'FAIL ') + label)


def c(i, method='auto-browser'):
    return {'id': i, 'method': method}


bands = {'6': [c('a6')], '8': [c('a8'), c('b8'), c('c8')], '10': [c('a10'), c('b10')]}
ok(item_score(bands, {'a6': PASS, 'a8': PASS, 'b8': PASS, 'c8': PASS, 'a10': PASS, 'b10': PASS}) == 10, '전부 통과 → 10')
ok(item_score(bands, {'a6': PASS, 'a8': PASS, 'b8': PASS, 'c8': PASS, 'a10': PASS}) == 8, '10 절반(1/2)은 넘지 않음 → 8')
ok(item_score(bands, {'a6': PASS, 'a8': PASS, 'b8': PASS, 'c8': FAIL}) == 7, '8 셋 중 둘 → 7')
ok(item_score(bands, {'a6': PASS, 'a8': PASS, 'b8': FAIL, 'c8': FAIL}) == 6, '8 셋 중 하나 → 6')
ok(item_score(bands, {'a8': PASS, 'b8': PASS, 'c8': PASS}) == 4, '6 미확인이면 누적 규칙으로 4')
ok(item_score(bands, {'a6': PASS, 'a8': PASS, 'b8': PASS, 'c8': NA}) == 8, '해당 없음은 셈에서 뺌')
field = {'6': [c('a6')], '8': [c('a8'), c('d8', 'device')]}
ok(item_score(field, {'a6': PASS, 'a8': PASS}) == 6, '실기기 확인 못 함이 섞인 8 구간(1/2) → 6')
ok(item_score(field, {'a6': PASS, 'a8': PASS}, skip_field=True) == 8, '개발 단계 점수는 현장 확인 전 체크를 뺌')
ok(item_score({'6': [c('a6')], '8': [c('a8')]}, {'a6': PASS, 'a8': PASS}) == 8, '10 구간이 없으면 8이 최고')
ok(axis_score('ux', {'A': 8, 'B': 8}, gates_ok=False) == 7.0, 'UX 휴리스틱 관문 실패면 8 이상을 7로')
ok(axis_score('ux', {'A': 10, 'B': 4}, gates_ok=True) == 5.0, 'UX 한 항목 4 이하면 5 이하')
ok(axis_score('stability', {'A': 10, 'B': 6, 'C': 8}, gates_ok=True) == 7.0, '안정성은 가장 낮은 두 항목 평균 상한')
ok(axis_score('edu', {'E1': 9, 'E2': 7}, gates_ok=True) == 8.0, '교육은 평균 그대로')
print(f'assertions {13} failures {failures}')
sys.exit(1 if failures else 0)
