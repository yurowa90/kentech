"""score.py 점수 규칙 단위 검사(가짜 체크리스트). 사용: python3 tests/qa/test_score.py"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from score import PASS, FAIL, UNKNOWN, NA, axis_score, collect, item_score  # noqa: E402

count = failures = 0


def ok(cond, label):
    global count, failures
    count += 1
    failures += not cond
    print(('PASS ' if cond else 'FAIL ') + label)


def c(i, method='auto-browser'):
    return {'id': i, 'method': method}


bands = {'6': [c('a6')], '8': [c('a8'), c('b8'), c('c8')], '10': [c('a10'), c('b10')]}
allp = {k: PASS for k in ('a6', 'a8', 'b8', 'c8', 'a10', 'b10')}
ok(item_score(bands, allp) == 10, '전부 통과 → 10')
ok(item_score(bands, {**allp, 'b10': FAIL}) == 8, '10 절반(1/2)은 넘지 않음 → 8')
ok(item_score(bands, {'a6': PASS, 'a8': PASS, 'b8': PASS, 'c8': FAIL}) == 7, '8 셋 중 둘 → 7')
ok(item_score(bands, {'a6': PASS, 'a8': PASS, 'b8': FAIL, 'c8': FAIL}) == 6, '8 셋 중 하나 → 6')
ok(item_score(bands, {'a8': PASS, 'b8': PASS, 'c8': PASS}) == 4, '6 미확인이면 누적 규칙으로 4')
ok(item_score(bands, {'a6': PASS, 'a8': PASS, 'b8': PASS, 'c8': NA}) == 8, '해당 없음은 셈에서 뺌')
ok(item_score({'6': [c('a6')], '8': [c('a8')]}, {'a6': PASS, 'a8': PASS}) == 8, '10 구간이 없으면 8이 최고')
ok(item_score({'8': [c('a8')]}, {'a8': PASS}) == 8, '원문에 6 조건이 없는 항목은 6 구간을 채운 것으로 봄')
ok(item_score({'6': [c('a6')], '8': [c('n8'), c('m8')]}, {'a6': PASS, 'n8': NA, 'm8': NA}) == 8, '체크가 모두 해당 없음인 구간은 채운 것으로 봄')

field = {'6': [c('a6')], '8': [c('a8'), c('d8', 'device')]}
ok(item_score(field, {'a6': PASS, 'a8': PASS}) == 6, '실기기 확인 못 함이 섞인 8 구간(1/2) → 6')
ok(item_score(field, {'a6': PASS, 'a8': PASS}, skip_field=True) == 8, '개발 단계 점수는 현장 확인 전 체크를 뺌')
only_field10 = {'6': [c('a6')], '8': [c('a8')], '10': [c('d10', 'device'), c('e10', 'classroom')]}
ok(item_score(only_field10, {'a6': PASS, 'a8': PASS}, skip_field=True) == 8, '현장 체크를 빼서 빈 10 구간은 채우지 않은 것 → 8')
ok(item_score(only_field10, {'a6': PASS, 'a8': PASS, 'd10': PASS, 'e10': PASS}, skip_field=True) == 10, '현장 체크가 통과면 개발 단계도 10')

shared = [c('g1'), c('g2')]
own = {'6': [c('o6')], '8': [c('o8')]}
ok(item_score(own, {'g1': PASS, 'g2': PASS, 'o6': PASS, 'o8': PASS}, gates=shared) == 8, '공통 전제 통과면 항목 고유 체크로 셈')
ok(item_score(own, {'g1': PASS, 'g2': FAIL, 'o6': PASS, 'o8': PASS}, gates=shared) == 4, '공통 전제 하나라도 실패면 4')
ok(item_score(own, {'g1': PASS, 'g2': NA, 'o6': PASS, 'o8': PASS}, gates=shared) == 4, '공통 전제는 해당 없음도 통과가 아님')
ok(item_score(own, {'g1': PASS, 'g2': PASS, 'o6': FAIL, 'o8': PASS}, gates=shared) == 4, '항목 고유 6 실패는 공통 전제 수와 상관없이 4(과반을 부풀리지 않음)')

ok(axis_score('ux', {'A': 8, 'B': 8}, gates_ok=False) == 7.0, 'UX 관문 실패면 7 이하')
ok(axis_score('ux', {'A': 8, 'B': 7.8}, gates_ok=False) == 7.0, 'UX 관문 실패면 7.9도 7로(역전 없음)')
ok(axis_score('ux', {'A': 10, 'B': 4}, gates_ok=True) == 5.9, 'UX 한 항목 4 이하면 6 미만')
ok(axis_score('model', {'A': 10, 'B': 10, 'C': 6}, gates_ok=True) == 7.0, '모형 한 항목 6 이하면 7 이하')
ok(axis_score('model', {'A': 8, 'B': 8, 'C': 7}, gates_ok=True) == 7.667, '모형 항목 모두 7 이상이면 평균')
ok(axis_score('stability', {'A': 10, 'B': 6, 'C': 8}, gates_ok=True) == 7.0, '안정성은 가장 낮은 두 항목 평균 상한')
ok(axis_score('edu', {'E1': 9, 'E2': 7}, gates_ok=True) == 8.0, '교육은 평균 그대로')

mini = {'axes': [
    {'axis': 'ux', 'items': [
        {'id': 'U1', 'item': 'A 첫', 'band': '8', 'method': 'auto-browser'},
        {'id': 'UH', 'item': '휴리스틱', 'band': '8', 'method': 'independent-eval', 'gate': True},
        {'id': 'UT', 'item': '10점', 'band': '10', 'method': 'classroom', 'targets': ['*']},
        {'id': 'UP', 'item': 'A 첫', 'band': 'proposal', 'method': 'auto-browser'}]},
    {'axis': 'visual', 'items': [
        {'id': 'V1', 'item': 'V1 그림', 'band': '8', 'method': 'auto-browser'},
        {'id': 'VC', 'item': '공통 조건', 'band': '6', 'method': 'auto-browser', 'targets': ['*']}]},
    {'axis': 'common', 'items': [
        {'id': 'CV', 'item': '공통', 'band': '6', 'method': 'doc-inspect', 'validity': True},
        {'id': 'CR', 'item': '공통', 'band': '6', 'method': 'auto-node', 'release': True, 'stage': 'rc',
         'applies_to': [{'axis': 'visual', 'item': '*', 'band': '6'}]},
        {'id': 'CD', 'item': '공통', 'band': '10', 'method': 'device', 'release': True, 'stage': 'formal',
         'applies_to': [{'axis': 'ux', 'item': 'A 첫', 'band': '10'}]}]},
    {'axis': 'release', 'items': [
        {'id': 'R1', 'item': '빌드', 'band': '8', 'method': 'ci', 'stage': 'rc'},
        {'id': 'R2', 'item': '실기기', 'band': '8', 'method': 'device', 'stage': 'formal'},
        {'id': 'R3', 'item': '시범', 'band': '8', 'method': 'classroom', 'stage': 'after'}]}]}
table, pre, gates, validity, release = collect(mini)
ok([x['id'] for x in table['ux']['A 첫']['10']] == ['UT', 'CD'], '축 \'*\' 대상과 공통 applies_to가 같은 항목·구간에 모임')
ok('UP' not in json.dumps(table), '제안 체크는 셈하지 않음')
ok([x['id'] for x in gates['ux']] == ['UH'], 'UX 휴리스틱은 축 관문')
ok([x['id'] for x in pre['visual']['V1 그림']] == ['VC', 'CR'], '시각 공통 조건과 공통 \'*\' 6은 항목 전제')
ok([x['id'] for x in validity] == ['CV'], '공통 validity만 채점 유효 조건')
ok([x['id'] for x in release['rc']] == ['CR', 'R1'] and [x['id'] for x in release['formal']] == ['CD', 'R2']
   and [x['id'] for x in release['after']] == ['R3'], '릴리스 관문 단계 rc·formal·after')

with tempfile.TemporaryDirectory() as tmp:
    cl, res = Path(tmp) / 'c.json', Path(tmp) / 'r.json'
    cl.write_text(json.dumps(mini, ensure_ascii=False), encoding='utf-8')
    res.write_text(json.dumps({'sha': 'T', 'checks': {'U1': {'status': PASS}, 'NOPE': {'status': PASS}, 'UH': {}}}, ensure_ascii=False), encoding='utf-8')
    out = subprocess.run([sys.executable, str(HERE / 'score.py'), str(res), '--checklist', str(cl)], capture_output=True, text=True)
    ok('체크리스트에 없는 ID(무시): NOPE' in out.stdout, '모르는 ID는 경고')
    ok('UH: 상태 없음' in out.stdout and out.returncode == 1, '상태 없는 줄은 경고 뒤 확인 못 함, 종료 1')
    ok('판정 무효' in out.stdout, '채점 유효 조건 미확인이면 판정 무효 표시')

print(f'assertions {count} failures {failures}')
sys.exit(1 if failures else 0)
