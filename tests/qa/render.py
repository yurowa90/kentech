"""tests/qa/checklist.json(원본)에서 docs/qa/<축>.md를 다시 만든다. 문서를 손으로 고치지 말고 원본을 고친 뒤 이것을 돌린다.

사용: python3 tests/qa/render.py [--check]   (--check는 문서가 원본과 같은지만 보고 다르면 1로 끝난다)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'tests' / 'qa' / 'checklist.json'
OUT = ROOT / 'docs' / 'qa'
TITLE = {'ux': 'UX(조작감)', 'edu': '교육', 'model': '모형', 'visual': '시각', 'stability': '안정성',
         'release': '릴리스 관문', 'common': '축 공통'}
METHOD = {'auto-node': 'Node 검사', 'auto-browser': '브라우저 검사', 'ci': 'CI', 'recording-review': '녹화 재확인',
          'code-inspect': '코드 확인', 'doc-inspect': '문서 확인', 'independent-eval': '독립 평가',
          'device': '실기기', 'live': '실연결', 'classroom': '교실'}


def cell(text):
    return ' '.join(str(text or '').split()).replace('|', '\\|')


def render(part):
    axis = part['axis']
    lines = [f'# QA 체크리스트 — {TITLE.get(axis, axis)}', '',
             '`tests/qa/render.py`가 `tests/qa/checklist.json`에서 만든 문서다. 고칠 때는 원본을 고치고 다시 만든다. 판정 규칙은 `docs/QA-CHECKLIST.md`.', '',
             '## 축 규칙', '', cell(part.get('scoring_rules', '')), '']
    items = {}
    for check in part['items']:
        items.setdefault(check.get('item') or check['rubric_item'], []).append(check)
    for name, checks in items.items():
        lines += [f'## {name}', '', '| ID | 구간 | 확인 | 무엇을 | 통과 조건 | 절차 | 이미 있는 검사 | 원문 |', '|---|---|---|---|---|---|---|---|']
        order = {'6': 0, '8': 1, '10': 2, 'proposal': 3}
        for c in sorted(checks, key=lambda c: (order.get(c['band'], 9), c['id'])):
            band = '제안' if c['band'] == 'proposal' else c['band']
            if c.get('gate'):
                band += '(관문)'
            lines.append('| ' + ' | '.join(cell(x) for x in (c['id'], band, METHOD.get(c['method'], c['method']), c['requirement'],
                                                             c['pass_criterion'], c['procedure'], c['existing_coverage'], c['source'])) + ' |')
            if c.get('notes'):
                lines.append(f"| | | | 비고: {cell(c['notes'])} | | | | |")
        lines.append('')
    if part.get('uncovered'):
        lines += ['## 체크로 바꾸지 못한 원문 조건', ''] + [f'- {cell(u)}' for u in part['uncovered']] + ['']
    return '\n'.join(lines)


def main():
    data = json.loads(SRC.read_text(encoding='utf-8'))
    check_only = '--check' in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    stale = []
    for part in data['axes']:
        path = OUT / f"{part['axis']}.md"
        text = render(part)
        if check_only:
            if not path.exists() or path.read_text(encoding='utf-8') != text:
                stale.append(path.name)
        else:
            path.write_text(text, encoding='utf-8')
    if stale:
        print('원본과 다른 문서:', ', '.join(stale))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
