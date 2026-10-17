"""2023 충실판 T2 독립 수용 검사.

근거: /Users/yurosung/Projects/kentech-wt/_briefs/lanes/2023b/spec.md
(2026-10-13 확정) §0~8 + 같은 폴더 spec-v2.md V1~V10·W4(우선).
PLAN-2023보다 계약 명세를 우선한다.
카드 값·경로·사건·질문 기대값은 명세를 전사하여 Python에서 독립 계산한다.
옛 g2023.js는 선택자·저장 봉투 확인에만 사용했다. 런타임 구현값으로
기대값을 생성하지 않으며, --oracle은 Playwright를 import/실행하지 않는다.

해석: q/tag/src와 frame 속성 유무는 완전 일치. rec은 §1이 허용한
다듬기를 인정하되 핵심어·연차·지수별 값·이웃 이름을 검사한다.
V2 사건 rec과 V5 성찰 문안은 2판의 문장·문장부호를 그대로 검사한다.
§1.3의 카드 이름은 §0에 없으므로 ID와 지수별 숫자 및 이름 자리의
비어 있지 않음만 검사한다. 표는 기존 table.plan의 연차 열·지수 행,
그래프는 기존 KCP.lines의 SVG path를 읽으며 새 검사 전용 선택자는 요구하지 않는다.
§3 번호 표지 사이의 DOM 공백은 하나로 정규화하고 원문 글자는 바꾸지 않는다.

harness.main이 함수마다 새 컨텍스트, 1280×900/390×844 × 밝음/어두움,
콘솔·페이지 오류 및 c.check 가로 스크롤을 집계한다. 브라우저 실행은
총괄의 샌드박스 밖 로컬 환경에서만 한다. 메모와 입력은 가상 자료다.
"""

from __future__ import annotations

import random
import re
import sys

# spec §0: 구현에서 읽지 않는 독립 자료.
VALUES = dict(zip(
    "1A 1B 1C 2A 2B 2C 2D 2E 2F 2G 2H 2I 3A 3B 3C 3D 3E 3F 3G 3H 3I 4A 4B 4C 4D 4E 4F 4G".split(),
    [(1,0,0), (0,1,0), (0,0,1), (3,0,-1), (2,0,0), (1,1,0),
     (0,3,-1), (0,2,0), (0,1,1), (1,0,1), (0,0,2), (-1,0,3),
     (4,0,-1), (3,0,0), (1,1,1), (0,3,0), (1,4,-2), (0,4,-1),
     (0,1,2), (0,0,3), (2,-2,3), (6,-1,-1), (3,1,0), (3,3,-2),
     (2,5,-3), (-2,3,3), (0,-3,7), (0,2,2)]))
NEXT = {
    "1A": "2A 2B 2C", "1B": "2D 2E 2F", "1C": "2G 2H 2I",
    "2A": "3A 3B", "2B": "3B 3C", "2C": "3C 3D",
    "2D": "3D 3E", "2E": "3D 3E", "2F": "3F 3G",
    "2G": "3F 3G", "2H": "3H 3I", "2I": "3H 3I",
    "3A": "4A 4B", "3B": "4A 4B", "3C": "4B 4C",
    "3D": "4C 4D", "3E": "4D 4E", "3F": "4D 4E",
    "3G": "4E 4F", "3H": "4F 4G", "3I": "4F 4G",
}
EDGES = {(a, b) for a, bs in NEXT.items() for b in bs.split()}
LOST = set("3A 3B 3D 3E 3F 3G 3H 4A 4C 4D 4E 4F".split())
NAMES = ("과학", "행복", "환경")
COUNTRIES = ("나람국", "다람국")
NEIGHBORS = (
    "1A 2C 2B 3B 1B 2F 2A 2E 3F 3C".split(),
    "1C 1B 1A 2F 2H 2C 3G 3H 3C 3F".split(),
)
EXAMPLE = "1C 2G 1A 2C 2B 3C 3B 2H 3H 4G".split()
# 한 계획에서 전염병 -1과 박람회 +2를 모두 적용한다.
EVENT_PLAN = "1A 2B 2C 1C 2H 2G 3H 4G 3C 3B".split()
FRAME_KEYS = set("23-q2-top 23-q2-lead 23-q2-gap 23-q2-shorten 23-q2-real".split())
KEY = "kcp:v1:2023"
SCENE = "#v2-stage .v2-stage-canvas"


def compute(plan, garam=True):
    """§0: 사건 판정은 3·6년 차 말, 행복 변화는 4·7년 차에 한 번."""
    rows, total = [], [0, 0, 0]
    epidemic = fair = False
    for year, card in enumerate(plan, 1):
        effect = list(VALUES[card])
        if year == 4 and epidemic:
            effect[1] -= 1
        if year == 7 and fair:
            effect[1] += 2
        total = [a + b for a, b in zip(total, effect)]
        rows.append(tuple(total))
        if year == 3:
            epidemic = total[0] <= 0 or total[2] <= 0
        if year == 6:
            fair = garam and total[0] >= 5 and total[2] >= 3
    return rows, epidemic, fair


NB = [compute(p, False)[0] for p in NEIGHBORS]


def valid_plan(plan):
    done = set()
    for card in plan:
        if card not in VALUES or card in done:
            return False
        if card[0] != "1" and not any((p, card) in EDGES for p in done):
            return False
        done.add(card)
    return len(plan) <= 10


def gaps(rows, reverse=False):
    """§1.2/1.4: 연차→지수→이웃 순서가 동점 우선순위."""
    cells = []
    for i, row in enumerate(rows):
        for k in range(3):
            for nb in range(2):
                d = NB[nb][i][k] - row[k]
                if reverse:
                    d = -d
                if d >= 3:
                    cells.append((i + 1, k, nb, d))
    return cells


def pick_gap(cells):
    return max(cells, key=lambda x: x[3]) if cells else None


def real_candidate(cells):
    """§1.6: 다른 지수 우선, 없으면 같은 지수의 다른 연차, 늦은 해 동점."""
    worst = pick_gap(cells)
    if not worst:
        return None
    choices = [x for x in cells if x[1] != worst[1]]
    if not choices:
        choices = [x for x in cells if x[0] != worst[0]]
    return min(choices, key=lambda x: (-x[3], -x[0], x[1], x[2])) if choices else None


def longest_run(rows):
    """§1.5: 연속 경계 이상 구간을 지수별로 분리하고 길이/시작/지수로 선택."""
    runs = []
    for k in range(3):
        start, levels, countries = None, [], set()
        for i in range(len(rows) + 1):
            ds = [NB[j][i][k] - rows[i][k] for j in range(2)] if i < len(rows) else [0, 0]
            level = 2 if max(ds) >= 5 else 1 if max(ds) >= 3 else 0
            if level:
                if start is None:
                    start = i + 1
                levels.append(level)
                countries.update(j for j, d in enumerate(ds) if d >= 3)
            elif start is not None:
                if len(levels) >= 2:
                    word = "경계" if set(levels) == {1} else "위험" if set(levels) == {2} else "경계 이상"
                    runs.append((start, i, k, word, tuple(sorted(countries))))
                start, levels, countries = None, [], set()
    return min(runs, key=lambda x: (-(x[1] - x[0] + 1), x[0], x[2])) if runs else None


# spec §1 표의 24행 전사. § 기호 행만 아래 독립 계산으로 채운다.
QUESTION_ROWS = [
    ('23-q1', '문제 1', '나람국과 다람국이 세운 실행 계획의 차이점을 바탕으로 두 국가 사이에 발생할 수 있는 현상을 설명해 주세요.'),
    ('23-q1-check', '문제 1 · 이해 확인', '두 국가 중 10년 후 과학 기술 수준이 더 높은 나라는 어디인가요?'),
    ('23-q1-like', '문제 1 · 긴장 풀기', '제시된 실행 계획 중 가장 마음에 들거나 실제로 해보고 싶은 항목이 있다면 어떤 것인가요? 그 이유는 무엇인가요?'),
    ('23-q1-nation', '문제 1 · 긴장 풀기', '지구상에 있는 국가 중에서 정보에서 나타난 두 국가와 유사한 전략을 취한 곳으로 연상되는 곳이 있나요?'),
    ('23-q1-policy', '문제 1 · 흥미와 관심', '제시된 실행 항목 중 실제로 비슷한 정책을 들어본 것이 있나요? 알고 있는 정책을 문제에서 부여한 과학, 행복, 환경의 지수와 비교하면 어떤가요?'),
    ('23-q1-sustain', '문제 1 · 흥미와 관심', '나람국(다람국)의 실행 계획은 지속 가능하다고 생각하나요? 그 이유는?'),
    ('23-q1-oppose', '문제 1 · 합리적 추론', '나람국(다람국)의 실행 계획을 반대(지지)하는 집단이 있다면 그 집단은 어떤 집단일까요?'),
    ('23-q1-export', '문제 1 · 합리적 추론', '기술 수출을 바탕으로 해외여행을 활성화 한다고 했는데, 어떤 방법이 있을까요?'),
    ('23-q1-conflict', '문제 1 · 비판 수용', '상생 방안에 대해 주로 설명하였는데, 반대로 두 국가 사이에 갈등 관계가 생기지는 않을까요?'),
    ('23-q1-whole', '문제 1 · 자료 종합', '나람국의 경우 다람국과 비교하여 환경지수가 3년 차에 경계, 7년 차에 위험 수준으로 낮습니다. 반면 다람국의 과학지수는 나람국 대비 3년 차에 경계, 4년 차부터 바로 위험 수준으로 낮습니다. 지수별 연관 요소를 고려할 때 나람국(다람국)에서 발생할 것으로 생각되는 현상으로는 어떤 것이 있을까요?'),
    ('23-q1-live', '문제 1 · 자유로운 생각', '두 국가에 대해 학생이 판단한 것을 바탕으로 볼 때, 만약 두 국가 중 한 곳의 국민이 된다면 어느 나라에 더 살고 싶은가요? 그 이유는?'),
    ('23-q2', '문제 2', '가람국 지도자로서 세운 10년 실행 계획을 설명해 주세요. 가장 중요하게 생각한 부분은 무엇이었나요?'),
    ('23-q2-top', '문제 2 · 수학적 사고', '§1.1'),
    ('23-q2-avoid', '문제 2 · 수학적 사고', '이웃 나라인 나람국과 다람국의 지수들과 격차에서 발생할 수 있는 경계나 위험 상황을 어떤 방법을 사용해 회피 또는 극복하려 했나요?'),
    ('23-q2-timing', '문제 2 · 수학적 사고', '같은 실행 항목을 선택하더라도 실행 시점에 따라 최종 지수가 같을 수 있지만 그 과정은 다를 수 있습니다. 실행 계획을 세울 때 실행 항목의 시점을 고려했나요?'),
    ('23-q2-event', '문제 2 · 수학적 사고', '전염병 발생과 세계박람회 개최 사건이 실행 계획을 수립하는 데 영향을 주었나요?'),
    ('23-q2-lead', '문제 2 · 합리적 추론', '§1.2'),
    ('23-lost', '문제 2 · 합리적 추론', '§1.3'),
    ('23-q2-gap', '문제 2 · 합리적 추론', '§1.4'),
    ('23-flex', '문제 2 · 유연성', '이웃 나라인 나람국과 다람국의 지수를 모르고 격차에 대한 정보가 없었다면 실행 계획이 달라졌을까요?'),
    ('23-q2-shorten', '문제 2 · 유연성', '§1.5'),
    ('23-q2-real', '문제 2 · 실제 세계로 확장', '§1.6'),
    ('23-q2-coop', '문제 2 · 인문적 통찰', 'ㅇㅇ국과 ㅇㅇ를 위해 교류한다고 했는데, 성공적으로 협력 관계를 형성하려면 어떤 점이 필요할까요?'),
    ('23-hum-verify', '문제 2 · 인문적 통찰', '본인이 설계한 계획이 타당한지 실행하기 전에 검증하려면 실제 세계에서는 어떤 방법으로 확인해볼 수 있을까요?'),
]


def value_patterns(values):
    return [rf"{name}\s+{v}(?!\d)" for name, v in zip(NAMES, values)]


def oracle(plan):
    """§1: 실행 코드와 공유하지 않는 질문/보충 문장 계약."""
    rows, epidemic, fair = compute(plan)
    n = len(plan)
    cells = gaps(rows)
    worst, lead = pick_gap(cells), pick_gap(gaps(rows, True))
    run, real = longest_run(rows), real_candidate(cells)
    out = []
    for key, tag, sentence in QUESTION_ROWS:
        pats = None
        exact_rec = None
        if key in ("23-q2-top", "23-q2-avoid") and not n:
            continue
        if key == "23-q2-lead" and lead is None:
            continue
        if key == "23-q2-gap" and worst is None:
            continue
        if key == "23-q2-shorten" and run is None:
            continue
        if key == "23-q2-real" and real is None:
            continue
        if key == "23-q2-top":
            vals = rows[-1]
            a, b, d = sorted(range(3), key=lambda k: (-vals[k], k))
            head = "최종 " if n == 10 else f"{n}년 차까지 누적 "
            if len(set(vals)) == 1:
                body = "세 지수가 모두 같은데"
            elif vals[b] - vals[d] > vals[a] - vals[b]:
                little = "조금 " if vals[b] - vals[d] <= 3 else ""
                body = f"{NAMES[a]}과 {NAMES[b]}지수가 {NAMES[d]}지수보다 {little}높은데"
            else:
                little = "조금 " if vals[a] - vals[b] <= 3 else ""
                body = f"{NAMES[a]}지수가 {NAMES[b]}과 {NAMES[d]}지수보다 {little}높은데"
            sentence = head + body + ", 의도적으로 그렇게 한 것인가요?"
            pats = ["최종" if n == 10 else rf"{n}년 차", "누적", *value_patterns(vals)]
        elif key == "23-q2-lead":
            i, k, nb, d = lead
            sentence = f"{i}년 차에 {COUNTRIES[nb]}보다 {NAMES[k]}지수가 {d}만큼 앞섰는데 어떤 일이 발생할 수 있을까요?"
            pats = [rf"{i}년 차", rf"{NAMES[k]}\s+누적\s+{rows[i-1][k]}(?!\d)", rf"{COUNTRIES[nb]}\s+{NB[nb][i-1][k]}(?!\d)"]
        elif key == "23-lost":
            lost = "3H" if "3H" in plan else next((p for p in plan if p in LOST), "3H")
            chosen = "선택한 " if lost in plan else ""
            sentence = f"실행 항목 중 {chosen}‘{lost}’는 내용이 일부 유실됐는데, 제시된 지수에 어울리는 실행 항목이 되려면 어떤 내용이 들어가 있었을 것 같나요?"
            # §0에 이름 목록이 없으므로 이름 자체를 구현에서 베끼지 않는다.
            pats = [rf"{lost}\s+\S.+?의 지수", *value_patterns(VALUES[lost])]
        elif key == "23-q2-gap":
            i, k, nb, d = worst
            level = "위험" if d >= 5 else "경계"
            sentence = f"{i}년 차의 {NAMES[k]}지수가 매우 낮은데 주변 나라를 고려할 때 어떤 문제가 발생할 수 있을까요? 이를 해결하려면 어떤 방법이 있을까요?"
            pats = [rf"{i}년 차", NAMES[k], COUNTRIES[nb], rf"(?<!\d){d}\s*낮", level]
        elif key == "23-q2-shorten":
            start, end, k, level, countries = run
            sentence = f"{end-start+1}년 동안 {NAMES[k]}지수가 {level}인데 이 기간을 짧게 줄이는 것이 가능할까요? 불가능하다면 어떤 점 때문에 어려운가요?"
            pats = [rf"{start}~{end}년 차", NAMES[k], "·".join(COUNTRIES[j] for j in countries), r"3\s*이상"]
        elif key == "23-q2-real":
            i, k, nb, d = real
            level = "위험" if d >= 5 else "경계"
            sentence = f"{i}년 차 때 {COUNTRIES[nb]}보다 {NAMES[k]} 지수가 {d}만큼 낮아서 {level} 수준인데, 이게 실제 상황이라면 이런 경우 어떤 준비를 해야 할까요?"
        elif key == "23-q1-export":
            pats = ["상생 방안"]
        elif key == "23-q1-conflict":
            pats = ["상생할 방법"]
        elif key == "23-q1-whole":
            pats = ["자료 4", "성찰"]
        elif key == "23-q2-coop":
            pats = ["ㅇㅇ 자리"]
        elif key == "23-q2-event" and n >= 3:
            # V2: 문장부호까지 계약으로 정정한 rec은 완전 일치로 검사한다.
            if n >= 6:
                exact_rec = ("연습실 보충: 내 계획에서는 전염병이 " +
                             ("발생했고" if epidemic else "발생하지 않았고") +
                             ", 세계 박람회 효과를 " + ("얻었습니다" if fair else "얻지 못했습니다") + ".")
            else:
                exact_rec = "연습실 보충: 내 계획에서는 전염병이 " + ("발생했습니다" if epidemic else "발생하지 않았습니다") + "."
            pats = [r"\A" + re.escape(exact_rec) + r"\Z"]
        q = {"k": key, "tag": tag, "src": "report", "q": sentence}
        # V4: 계획에 유실 항목이 없으면 기본 3H 질문은 틀 채움이 아니다.
        if key in FRAME_KEYS or (key == "23-lost" and lost in plan):
            q["frame"] = True
        if exact_rec is not None:
            q["rec_exact"] = exact_rec
        q["rec_patterns"] = pats
        out.append(q)
    return out


# §1 분기를 의도적으로 고른 계획. 자기 확인에서 분기 조건 자체도 단언한다.
CASES = {
    "예시": EXAMPLE,
    "앞섬_격차_유실_없음": ["1A"],
    "세_지수_같음": "1A 1B 1C".split(),
    "한_지수만_높음": "1A 2B".split(),
    "3H_없이_다른_유실": "1A 2A 3A".split(),
    "전염병_박람회_둘다": EVENT_PLAN,
    "박람회_미달": NEIGHBORS[0],
    "경계_위험_혼합": "1A 2B 2C 1C 2G 2H 3H 4G 3C 3B".split(),
    "같은_지수_다른_연차_대체": NEIGHBORS[0],
    "격차_하나로_real_없음": "1A 1B 1C".split(),
}


def plans_to_test():
    rng = random.Random(20231013)
    plans = [list(p) for p in CASES.values()]
    # 각 길이 0~10에서 50회: 중복은 허용(짧은 계획 공간보다 표본 수가 큼).
    for length in range(11):
        for _ in range(50):
            p = []
            for _ in range(length):
                choices = [x for x in VALUES if x not in p and
                           (x.startswith("1") or any((a, x) in EDGES for a in p))]
                p.append(rng.choice(choices))
            plans.append(p)
    return plans


def oracle_self_check(verbose=True):
    """§0 예시 숫자·§1.1~1.6 문장/타이브레이크를 하드코딩 값과 대조."""
    assert len(VALUES) == 28 and len(EDGES) == 45
    assert NB[0] == [(1,0,0),(2,1,0),(4,1,0),(7,0,0),(7,1,0),(7,2,1),(10,2,0),(10,4,0),(10,8,-1),(11,9,0)]
    assert NB[1] == [(0,0,1),(0,1,1),(1,1,1),(1,2,2),(1,2,4),(2,3,4),(2,4,6),(2,4,9),(3,5,10),(3,9,9)]
    assert [b[2]-a[2] for a,b in zip(*NB)] == [1,1,1,2,4,3,6,9,11,9]
    assert [a[0]-b[0] for a,b in zip(*NB)] == [1,2,3,6,6,5,8,8,7,8]
    assert [a[1]-b[1] for a,b in zip(*NB)] == [0,0,0,-2,-1,-1,-2,0,3,0]
    rows, epi, fair = compute(EXAMPLE)
    assert rows == [(0,0,1),(1,0,2),(2,0,2),(3,1,2),(5,1,2),(6,2,3),(9,4,3),(9,4,5),(9,4,8),(9,6,10)]
    assert not epi and fair
    assert gaps(rows) == [(4,0,0,4),(7,2,1,3),(8,2,1,4),(9,1,0,4),(10,1,0,3),(10,1,1,3)]
    assert pick_gap(gaps(rows, True)) == (10,2,0,10)
    assert pick_gap(gaps(rows)) == (4,0,0,4)
    assert longest_run(rows) == (7,8,2,"경계",(1,))
    assert real_candidate(gaps(rows)) == (9,1,0,4)
    expected_frames = {
        "23-q2-top": "최종 환경과 과학지수가 행복지수보다 조금 높은데, 의도적으로 그렇게 한 것인가요?",
        "23-q2-lead": "10년 차에 나람국보다 환경지수가 10만큼 앞섰는데 어떤 일이 발생할 수 있을까요?",
        "23-lost": "실행 항목 중 선택한 ‘3H’는 내용이 일부 유실됐는데, 제시된 지수에 어울리는 실행 항목이 되려면 어떤 내용이 들어가 있었을 것 같나요?",
        "23-q2-gap": "4년 차의 과학지수가 매우 낮은데 주변 나라를 고려할 때 어떤 문제가 발생할 수 있을까요? 이를 해결하려면 어떤 방법이 있을까요?",
        "23-q2-shorten": "2년 동안 환경지수가 경계인데 이 기간을 짧게 줄이는 것이 가능할까요? 불가능하다면 어떤 점 때문에 어려운가요?",
        "23-q2-real": "9년 차 때 나람국보다 행복 지수가 4만큼 낮아서 경계 수준인데, 이게 실제 상황이라면 이런 경우 어떤 준비를 해야 할까요?",
    }
    qs = oracle(EXAMPLE)
    assert len(qs) == 24 and len(oracle([])) == 18
    assert {q["k"]: q["q"] for q in qs if q.get("frame")} == expected_frames
    assert not any("frame" in q for q in oracle([]))  # V4: 빈 상태 frame 0개.
    assert "frame" not in next(q for q in oracle(["1A"]) if q["k"] == "23-lost")
    assert next(q for q in oracle(CASES["3H_없이_다른_유실"]) if q["k"] == "23-lost")["frame"] is True
    # §1.1~1.5 예시 rec의 숫자·연차·이웃도 계산된 정규식과 독립 문장으로 대조.
    example_recs = {
        "23-q2-top": "연습실 보충: 내 계획의 최종 누적은 과학 9 · 행복 6 · 환경 10입니다.",
        "23-q2-lead": "연습실 보충: 10년 차 내 환경 누적 10, 나람국 0입니다.",
        "23-lost": "연습실 보충: 3H 가상 이름의 지수는 과학 0, 행복 0, 환경 3입니다.",
        "23-q2-gap": "연습실 보충: 4년 차 과학 지수가 나람국보다 4 낮은 경계 수준입니다.",
        "23-q2-shorten": "연습실 보충: 7~8년 차에 환경 지수가 다람국보다 3 이상 낮았습니다.",
        "23-q2-event": "연습실 보충: 내 계획에서는 전염병이 발생하지 않았고, 세계 박람회 효과를 얻었습니다.",
    }
    for q in qs:
        if q["k"] in example_recs:
            assert all(re.search(p, example_recs[q["k"]]) for p in q["rec_patterns"])
    # V2: 3/6년 문턱과 발생·미발생/효과·미달의 연결 어미를 별도로 고정한다.
    for plan, rec in (
        (EXAMPLE[:2], None),
        (EXAMPLE[:3], "연습실 보충: 내 계획에서는 전염병이 발생하지 않았습니다."),
        (EVENT_PLAN[:5], "연습실 보충: 내 계획에서는 전염병이 발생했습니다."),
        (EVENT_PLAN[:6], "연습실 보충: 내 계획에서는 전염병이 발생했고, 세계 박람회 효과를 얻었습니다."),
        (NEIGHBORS[0], "연습실 보충: 내 계획에서는 전염병이 발생했고, 세계 박람회 효과를 얻지 못했습니다."),
        (NEIGHBORS[1], "연습실 보충: 내 계획에서는 전염병이 발생하지 않았고, 세계 박람회 효과를 얻지 못했습니다."),
    ):
        event = next(q for q in oracle(plan) if q["k"] == "23-q2-event")
        assert event.get("rec_exact") == rec
        if rec is None:
            assert event["rec_patterns"] is None
    assert compute(EVENT_PLAN)[1:] == (True, True)
    assert compute(EVENT_PLAN)[0][3][1] == 0
    assert compute(EVENT_PLAN)[0][6][1] == 2
    assert compute(CASES["세_지수_같음"])[0][-1] == (1,1,1)
    assert not gaps(compute(["1A"])[0]) and not gaps(compute(["1A"])[0], True)
    assert "3A" in next(q["q"] for q in oracle(CASES["3H_없이_다른_유실"]) if q["k"] == "23-lost")
    assert not compute(CASES["박람회_미달"])[2]
    assert longest_run(compute(CASES["경계_위험_혼합"])[0])[3] == "경계 이상"
    fallback_cells = gaps(compute(CASES["같은_지수_다른_연차_대체"])[0])
    fallback, worst = real_candidate(fallback_cells), pick_gap(fallback_cells)
    assert fallback[1] == worst[1] and fallback[0] != worst[0]
    single_cells = gaps(compute(CASES["격차_하나로_real_없음"])[0])
    assert pick_gap(single_cells) and real_candidate(single_cells) is None
    assert "세 지수가 모두 같은데" in next(q["q"] for q in oracle(CASES["세_지수_같음"]) if q["k"] == "23-q2-top")
    assert "과학지수가 행복과 환경지수보다 조금 높은데" in next(q["q"] for q in oracle(CASES["한_지수만_높음"]) if q["k"] == "23-q2-top")
    plans = plans_to_test()
    assert len(plans) >= 550 and {len(p) for p in plans} == set(range(11))
    assert all(valid_plan(p) for p in plans)
    if verbose:
        print(f"오라클 자기 확인 통과: 카드 28, 화살표 45, 이웃 20연차, 격차 3목록, 계획 {len(plans)}개")
        print("2판 V2·V3·V4 통과: 사건 rec 6분기, '4년 차의 과학지수가', 빈 상태 frame 0개·예시 6개")
        print("예시 계획 기대 질문 24개:")
        for i, q in enumerate(qs, 1):
            print(f"{i:02d}. [{q['k']}] {q['q']}")
    return qs


def _game(plan=(), **extra):
    return dict(plan=list(plan), peek="1A", tab="path", q1="가상 메모: 이웃 계획을 비교한다.",
                q2="가상 메모: 사건의 적용 시점을 설명한다.", **extra)


def _seed(c, game, mode="real", phase="prep"):
    c.goto("#home", wait=".home-grid")
    c.page.evaluate("() => { KCP.flush(); }")
    c.page.evaluate("mode => KCP.setSettings({timeMode:mode})", mode)
    c.page.evaluate("([key,game,phase]) => localStorage.setItem(key,JSON.stringify({game,phase}))", [KEY, game, phase])
    c.page.reload()
    c.page.wait_for_selector(".home-grid")
    c.goto("#y2023", wait={"prep": "#mine table.plan", "room": ".qdeck .qcard", "reflect": "#copyAll"}[phase])
    c.check(f"§6 저장 읽기 {mode}/{phase}")


def _saved(c):
    c.wait_saved(400)  # 지연 저장 자체를 검증: flush로 대신 저장하지 않는다.
    state = c.ls(KEY)
    c.expect(isinstance(state, dict), "§6 kcp:v1:2023 저장 봉투")
    return (state or {}).get("game", {})


def _shown(c):
    return c.page.evaluate("() => KCP.games['2023'].shownYears(KCP.load('2023').game)")


def _pick(c, plan):
    for card in plan:
        c.page.click(f'[data-node="{card}"]')


def _questions(c):
    return c.page.evaluate("() => KCP.games['2023'].questions(KCP.load('2023'))")


def _compare_questions(c, actual, plan, label):
    expected = oracle(plan)
    c.eq([q.get("k") for q in actual], [q["k"] for q in expected], label + " 키 순서·조건")
    for want, got in zip(expected, actual):
        where = f"{label} {want['k']}"
        c.eq({k: got.get(k) for k in ("k", "tag", "src", "q")},
             {k: want[k] for k in ("k", "tag", "src", "q")}, where + " 원문·틀 채움 완전 일치")
        if want.get("frame"):
            c.expect(got.get("frame") is True, where + " frame=true")
        else:
            c.expect("frame" not in got, where + " frame 속성 없음")
        pats = want["rec_patterns"]
        if pats is None:
            c.expect("rec" not in got, where + " rec 속성 없음")
            continue
        rec = got.get("rec", "")
        if not c.expect(isinstance(rec, str), where + " rec 문자열"):
            continue
        if "rec_exact" in want:
            c.eq(rec, want["rec_exact"], where + " V2 사건 rec 완전 일치")
        rec = rec.replace("−", "-")
        c.expect(rec.startswith("연습실 "), where + " rec 출처 머리")
        c.expect(all(re.search(p, rec) for p in pats), where + f" rec 핵심어·숫자 {pats!r}: {rec!r}")
        if want["k"] == "23-q1-whole":
            # §1: 출처 쪽수는 정답이 아니다. 자료 번호·쪽수를 뺀 뒤
            # 새로 덧붙인 수치(격차/정정 연차)가 없는지 확인한다.
            prose = re.sub(r"자료\s*4|(?:보고서\s*)?\d+\s*쪽", "", rec)
            c.expect(not re.search(r"\d", prose), where + " 실제 격차·5년 차 정답 숨김")
        if want["k"] == "23-q2-event" and len(plan) < 6:
            c.expect(not re.search(r"박람회|효과를 얻|조건을 채우", rec), where + " 6개 미만 박람회 결과 없음")


def _table(c, country="가람국"):
    return c.page.locator(f'table.plan[aria-label="{country} 10년 실행 계획"]')


def _number(text):
    return [int(x) for x in re.findall(r"[+-]?\d+", text.replace("−", "-").replace("＋", "+"))]


def _table_rows(c, country="가람국"):
    return _table(c, country).evaluate("""table => [...table.rows]
      .filter(r => /과학|행복|환경/.test(r.cells[0]?.textContent || ''))
      .map(r => [...r.cells].slice(1).map(cell => ({text:cell.innerText.trim(),
        tag:cell.tagName, bold:[...cell.querySelectorAll('b')].map(e=>e.textContent.trim()),
        levels:[cell,...cell.querySelectorAll('*')].flatMap(e=>[...e.classList])
          .filter(x=>/(?:lvl-|level-)?(?:warn|bad|danger|risk|boundary)/.test(x))})))""")


def _total(c, expected, country="가람국", plan=()):
    # V1·W4: 최종 합계는 별도 열이 아니라 10년 차 머리와 굵은 누적이다.
    table = _table(c, country)
    c.eq(table.count(), 1, f"§4·5 {country} 표 하나")
    header = table.locator("th[data-final23]")
    c.eq(header.count(), 1, f"V1 {country} 최종 합계 머리 하나")
    c.expect(header.evaluate("e=>e.parentElement === e.closest('table').rows[0] && e.cellIndex===10"), f"V1 {country} 10년 차 머리 위치")
    c.eq(re.sub(r"\s+", " ", header.inner_text()).strip(), "10 최종 합계", f"V1 {country} 머리 문구")
    c.eq(header.locator("span.small").inner_text(), "최종 합계", f"V1 {country} 머리 작은 설명")
    c.eq(header.get_attribute("rowspan"), None, f"V1 {country} 별도 합계용 rowspan 없음")
    c.eq(table.evaluate("t=>[...t.rows].slice(0,2).map(r=>r.cells.length)"), [11, 11], f"V1 {country} 두 머리 줄은 이름+10연차")
    rows = _table_rows(c, country)
    c.eq(len(rows), 3, f"§4·5 {country} 세 지수 행")
    for k, row in enumerate(rows):
        c.eq([cell["tag"] for cell in row], ["TD"] * 10, f"V1 {country} {NAMES[k]} td 10개만")
        if not row:
            continue
        cell = row[-1]
        c.eq(cell["bold"], [] if expected is None else [str(expected[k])], f"V1 {country} {NAMES[k]} 10년 차 굵은 누적")
        if expected is None:
            c.eq(cell["text"], "", f"V1 {country} 미선택·미확인 10년 차 빈칸")
            c.eq(cell["levels"], [], f"V1 {country} 빈칸 경계 색 없음")
        else:
            series = NB[COUNTRIES.index(country)] if country in COUNTRIES else compute(plan)[0]
            c.eq(_number(cell["text"])[:2], [series[9][k]-series[8][k], expected[k]], f"V1 {country} 10년 차 효과·누적")
            # V1은 이웃 표에 새 비교색을 요구하지 않는다. §6의 비교색 계약은
            # 내 계획·예시 표에 적용하고 이웃 표는 10년 차 효과·누적을 검증한다.
            if country not in COUNTRIES:
                gap = max(nb[9][k] - expected[k] for nb in NB)
                level = "lvl-bad" if gap >= 5 else "lvl-warn" if gap >= 3 else None
                c.eq(cell["levels"], [level] if level else [], f"V1 {country} 10년 차도 같은 경계·위험 규칙")


def _visible_table(c, plan, shown):
    rows, _, _ = compute(plan)
    actual = _table_rows(c)
    c.eq(len(actual), 3, "§6 가람국 세 지수 행")
    for k, row in enumerate(actual):
        for year, cell in enumerate(row[:10], 1):
            if year > shown:
                c.eq(cell["text"], "", f"§6 {year}년 {NAMES[k]} 숨긴 효과·누적")
                c.eq(cell["levels"], [], f"§6 {year}년 {NAMES[k]} 숨긴 경계 색")
            else:
                prev = rows[year-2][k] if year > 1 else 0
                c.eq(_number(cell["text"])[:2], [rows[year-1][k]-prev, rows[year-1][k]],
                     f"§6 {year}년 {NAMES[k]} 자동 효과·누적")
    _total(c, rows[-1] if shown == 10 else None, plan=plan)
    # 숨긴 해도 머리의 선택 항목은 보존한다.
    text = _table(c).inner_text()
    c.expect(all(p in text for p in plan), "§6 숨긴 연차도 항목 번호 유지")


def _no_leak_or_score(c, phase):
    # §7: textContent로 닫힌 접힘/숨긴 DOM도 확인한다. 사용자 계획은 예시와 다르게 둔다.
    text = c.page.locator("#app").text_content() or ""
    caption = c.page.locator(SCENE).get_attribute("aria-label") if c.page.locator(SCENE).count() else ""
    text += " " + (caption or "")
    c.eq(c.page.locator('details[data-rv23="whole"]').count(), 0, f"§7 {phase} 성찰 주석 없음")
    c.expect(not re.search(r"1C\s*→\s*2G", text), f"§7 {phase} 보고서 예시 계획 숨김")
    c.expect("생태계 청정지대" not in text, f"§7 {phase} 3H 유실 원문 숨김")
    for pattern in (r"(?:경계|위험)\s*\d+\s*(?:회|번|개)", r"\d+\s*/\s*\d+\s*(?:맞|정답)",
                    r"(?:정답|맞힌)\s*[:：]?\s*\d+\s*/\s*\d+",
                    r"(?:맞힌|정답)\s*(?:개수|수|합계)\s*[:：]?\s*\d+", r"경계\s*0(?:\s|$)"):
        c.expect(not re.search(pattern, text), f"§6 {phase} 점수형 표시 없음 {pattern}")


def t_01_question_contract(c: Ctx):
    """§0·§1~1.7: 550개 이상 유효 계획을 단 한 번의 evaluate로 비교."""
    oracle_self_check(False)
    plans = plans_to_test()
    c.goto("#y2023", wait="#mine")
    # §6: 직접 쓰기가 활성인 상태에서도 질문은 숨긴 연차를 포함한 전체 계산.
    c.page.evaluate("() => KCP.setSettings({timeMode:'ext'})")
    actual = c.page.evaluate("""plans => plans.map(plan => KCP.games['2023'].questions({
      game:{plan,peek:'1A',tab:'path',q1:'가상 메모',q2:'가상 메모',calcOn:true,calc:{}}
    }))""", plans)
    c.eq(len(actual), len(plans), "§1 모든 계획의 questions 결과")
    for i, (plan, qs) in enumerate(zip(plans, actual)):
        _compare_questions(c, qs, plan, f"§1 표본 {i} {' '.join(plan)}")
    c.check("§1 질문 계약")


def t_02_source_tags_and_copy(c: Ctx):
    """§2: srcTag 세 문자열, 면접 카드, 성찰 복사, 2022 출처 회귀."""
    expected = ['<span class="tag-official">보고서 문항</span> <span class="tag-mine">내 계획으로 채움</span>',
                '<span class="tag-official">보고서 문항</span>', '<span class="tag-mine">연습용 질문</span>']
    c.eq(c.page.evaluate("() => [{src:'report',frame:true},{src:'report'},{}].map(q=>KCP.srcTag(q))"), expected, "§2 srcTag 완전 일치")
    _seed(c, _game(EXAMPLE), phase="room")
    qs = oracle(EXAMPLE)
    cards = c.page.locator(".qdeck .qcard")
    c.eq(cards.count(), len(qs), "§2 면접실 카드 24개")
    for i, q in enumerate(qs):
        who = cards.nth(i).locator(".who").inner_text()
        c.expect("보고서 문항" in who, f"§2 {q['k']} 보고서 표시")
        c.eq("내 계획으로 채움" in who, bool(q.get("frame")), f"§2 {q['k']} 틀 채움 구별")
    c.eq(c.page.locator('.qdeck .who .tag-mine').filter(has_text="연습용 질문").count(), 0, "§2 2023 연습용 질문 0")
    c.page.click("#toReflect")
    c.page.wait_for_selector("#copyAll")
    c.page.evaluate("""() => { Object.defineProperty(navigator,'clipboard',{configurable:true,
      value:{writeText:t=>{window.__clip23=t;return Promise.resolve();}}}); }""")
    c.page.click("#copyAll")
    c.page.wait_for_function("typeof window.__clip23 === 'string'")
    lines = c.page.evaluate("window.__clip23").splitlines()
    for q in qs:
        head = "[보고서 문항 · 내 계획으로 채움]" if q.get("frame") else "[보고서 문항]"
        matching = [line for line in lines if q["q"] in line]
        c.eq(len(matching), 1, f"§2 {q['k']} 복사 질문 한 줄")
        c.expect(bool(matching) and head in matching[0] and matching[0].index(head) < matching[0].index(q["q"]), f"§2 {q['k']} 복사 머리 {head}")
    c.goto("#y2022", wait="#grid")
    c.phase("room")
    c.page.wait_for_selector(".qdeck .qcard")
    cards = c.page.locator(".qdeck .qcard")
    c.eq(c.page.locator(".qdeck .who .tag-official").filter(has_text="보고서 문항").count(), 2, "§2 2022 보고서 문항 두 개 유지")
    c.eq(c.page.locator(".qdeck .who .tag-mine").filter(has_text="연습용 질문").count(), cards.count()-2, "§2 2022 나머지 연습용 유지")
    c.expect("내 계획으로 채움" not in c.page.locator(".qdeck").inner_text(), "§2 2022 틀 채움 없음")
    c.check("§2 2022 출처 회귀")


def t_03_brief(c: Ctx):
    """§3: 문제지 요건·정보·사건 제목과 서로 분리된 두 주의 문장."""
    c.goto("#y2023", wait="#mine")
    req = c.page.locator('[data-brief23="req"] > li')
    info = c.page.locator('[data-brief23="info"] > li')
    c.eq(req.count(), 2, "§3 요건 li 2개")
    expected_req = [
        "2 실행 항목 경로에서 10년간 매년 한 가지의 [실행 항목]을 중복 없이 선택하여 [실행 계획]을 완성해야 한다.",
        "각 [실행 항목]은 한 번만 선택할 수 있고, 그 해 처음부터 바로 효과가 누적하여 적용된다."]
    c.eq([re.sub(r"\s+", " ", t).strip() for t in req.all_text_contents()], expected_req, "§3 요건 원문")
    c.eq(info.count(), 3, "§3 정보 바로 아래 li 3개")
    expected_info = [
        "[실행 항목]의 효과는 [과학], [행복], [환경] 지수로 평가되며 3 지수별 연관 요소에 영향을 준다.",
        "[과학], [행복], [환경] 지수 중 하나라도 같은 해 이웃 국가의 해당 지수보다 3 이상 낮으면 경계 수준, 5 이상 낮으면 위험 수준으로 평가된다.",
        "10년의 계획 기간 중 다음의 사건들이 발생한다."]
    for i, want in enumerate(expected_info):
        got = re.sub(r"\s+", " ", info.nth(i).text_content()).strip()
        if i < 2:
            c.eq(got, want, f"§3 정보 {i+1} 원문")
        else:
            c.expect(got.startswith(want), "§3 셋째 정보 사건 도입 원문")
            for title in ("전염병 확산", "세계 박람회 유치"):
                c.expect(title in got, f"§3 셋째 정보 아래 {title}")
    notes = ["※ 논리적인 설명이 가능하다면, 본인의 답변을 위한 합리적인 가정과 추론을 적용하는 것은 가능하다.",
             "※ 문제에서 묘사하는 내용은 실제 현실을 반영하지 않으며 KENTECH의 공식입장이 아님."]
    # §3 두 줄은 각각 독립된 요소 또는 br로 구분된 실제 텍스트 줄이어야 한다.
    brief = c.page.locator(".brief")
    # W4 / §3: 번호가 문장에 존재하는 것과 별도 번호 표지인 것을 함께 본다.
    tasks = brief.locator(".task ol > li")
    c.eq(tasks.count(), 2, "W4 문제 1·2 지시문 두 개")
    for i, numbers in enumerate((["4"], ["4", "5"])):
        c.eq(tasks.nth(i).locator(".num").all_text_contents(), numbers, f"W4 문제 {i+1} 자료 번호 표지")
        sentence = re.sub(r"\s+", " ", tasks.nth(i).text_content()).strip()
        for number in numbers:
            name = "이웃 국가" if number == "4" else "가람국"
            c.expect(f"{number} {name}의 10년간의 실행 계획" in sentence, f"W4 문제 {i+1} 자료 {number} 이름 연결")
    lines = [s.strip() for s in brief.inner_text().splitlines()]
    for note in notes:
        c.expect(note in lines, "§3 분리된 주의 문구 " + note)
    _no_leak_or_score(c, "문제지·준비실")
    c.check("§3 문제지")


# §4 글자 대비: HTML 배경색과 SVG rect/fill을 모두 읽는다. CSS 색상 혼합의
# 실제 계산값을 사용하고 투명 배경은 조상 배경 위에 합성한다.
PATH_CONTRAST = r"""root => {
  const rgba = s => {
    const m=s.match(/^rgba?\(([^)]+)\)/); if(!m) return null;
    const v=m[1].split(/[ ,/]+/).map(Number); return [v[0],v[1],v[2],v[3]??1];
  };
  const over=(a,b)=>[0,1,2].map(k=>a[k]*a[3]+b[k]*(1-a[3])).concat(1);
  const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4})
    .reduce((s,v,k)=>s+v*[.2126,.7152,.0722][k],0);
  return [...root.querySelectorAll('[data-nbnode]')].flatMap(node=>{
    const svg=node instanceof SVGElement;
    const texts=svg ? (node.matches('text')?[node]:[...(node.matches('rect')?node.parentElement:node).querySelectorAll('text')]) :
      [node,...node.querySelectorAll('*')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));
    if(!texts.length) return [{id:node.dataset.nbnode,error:'글자 요소 없음'}];
    let bg=[255,255,255,1];
    const chain=[]; for(let e=node;e;e=e.parentElement)chain.unshift(e);
    for(const e of chain){const p=rgba(getComputedStyle(e).backgroundColor);if(p)bg=over(p,bg);}
    if(svg){const shape=node.matches('rect,polygon,path')?node:node.querySelector('rect,polygon,path') || node.parentElement.querySelector('rect,polygon,path');
      const p=shape&&rgba(getComputedStyle(shape).fill);if(p)bg=over(p,bg);}
    return texts.map(text=>{
      const raw=rgba(svg?getComputedStyle(text).fill:getComputedStyle(text).color);
      if(!raw)return {id:node.dataset.nbnode,error:'글자 색을 읽지 못함'};
      const fg=over(raw,bg), a=lum(fg), b=lum(bg);
      return {id:node.dataset.nbnode,text:text.textContent.trim(),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    });
  });
}"""


def t_04_neighbor_paths_and_totals(c: Ctx):
    """§0·§4: 28항목/45경로/10선택, 순서 접근성 이름, 합계·대비·모바일."""
    c.goto("#y2023", wait="#mine")
    c.page.click('[data-tab="nb"]')
    for j, country in enumerate(COUNTRIES):
        root = c.page.locator(f'.nbpath23[data-country="{country}"]')
        c.eq(root.count(), 1, f"§4 {country} 경로도 하나")
        nodes = root.locator("[data-nbnode]").evaluate_all("els=>els.map(e=>[e.dataset.nbnode,e.dataset.picked])")
        c.eq(len(nodes), 28, f"§4 {country} 항목 28개")
        c.eq({x[0] for x in nodes}, set(VALUES), f"§4 {country} 항목 이름 집합")
        c.expect(all(x[1] in ("true", "false") for x in nodes), f"§4 {country} 선택 표시는 명시적 boolean 문자열")
        c.eq({x[0] for x in nodes if x[1] == "true"}, set(NEIGHBORS[j]), f"§4 {country} 선택 10개")
        edges = root.locator("[data-nbedge]").evaluate_all("els=>els.map(e=>e.dataset.nbedge)")
        c.eq(len(edges), 45, f"§4 {country} 화살표 45개")
        c.eq(set(edges), {f"{a}-{b}" for a, b in EDGES}, f"§4 {country} 화살표 방향·이름")
        c.eq(root.get_attribute("role"), "img", f"§4 {country} role=img")
        label = root.get_attribute("aria-label") or ""
        c.expect(country in label, f"§4 {country} 접근성 이름")
        c.eq(re.findall(r"\b[1-4][A-I]\b", label), NEIGHBORS[j], f"§4 {country} 접근성 계획 연차 순서")
        # V9: SVG 자체 좌표에서 비교하므로 390px 축소로 잘못된 배치가 가려지지 않는다.
        for parent, middle in (("1A", "2B"), ("1B", "2E"), ("1C", "2H")):
            ys = [root.locator(f'[data-nbnode="{card}"] rect').evaluate("e=>e.y.baseVal.value") for card in (parent, middle)]
            c.expect(abs(ys[0]-ys[1]) <= 1, f"V9 {country} {parent}·{middle} y 일치(±1): {ys}")
        for color in root.evaluate(PATH_CONTRAST):
            c.expect(color.get("ratio", 0) >= 4.5, f"§4 {country}/{color['id']} {c.cfg.scheme} 대비 4.5 이상: {color}")
        _total(c, NB[j][-1], country)
    c.eq(c.page.locator('[data-recon23="graph"] .tag-mine').filter(has_text="연습실 재구성").count(), 1, "§4 그래프 재구성 태그")
    c.check("§4 자료 4 경로도·표·그래프")


def t_05_task5_and_totals(c: Ctx):
    """§5: 자료 5 원문, 두 출처 태그, 0~9 빈 합계와 10년 차 누적."""
    c.goto("#y2023", wait="#mine")
    task = c.page.locator('[data-brief23="task5"]')
    original = "가람국이 선택한 [실행 항목]의 3가지 지수와 누적치를 연차별로 아래 표에 기입하고, 그래프에 3가지 지수의 누적치를 각각 다른 색으로 표시하시오."
    c.expect(original in task.text_content(), "§5 자료 5 원문 지시 완전 일치")
    c.eq(task.locator(".tag-official").filter(has_text="원문 지시").count(), 1, "§5 원문 지시 태그")
    c.eq(task.locator(".tag-mine").filter(has_text=re.compile(r"^연습실$")).count(), 1, "§5 연습실 태그")
    c.expect(all(word in task.text_content() for word in ("자동", "누적", "그래프")), "§5 자동 계산 설명")
    _total(c, None)
    for i, card in enumerate(EVENT_PLAN, 1):
        _pick(c, [card])
        _total(c, compute(EVENT_PLAN)[0][-1] if i == 10 else None, plan=EVENT_PLAN[:i])
    c.page.click("#undo")
    _total(c, None)
    c.check("§5 자료 5 9년으로 취소")


def _watch_graph(c):
    # 렌더러에 전달한 데이터만 관찰한다. 원래 KCP.lines를 그대로 호출하며,
    # 기대값은 Python compute에서 가져온다. SVG 선 끝점도 별도로 검사한다.
    c.page.evaluate("""() => {
      window.__graph23={}; const original=KCP.lines;
      KCP.lines=function(xs,series,opts){
        if(opts?.aria && /지수 비교/.test(opts.aria))
          window.__graph23[opts.aria]=JSON.parse(JSON.stringify({xs,series}));
        return original.apply(this,arguments);
      };
    }""")


def _graph(c, plan, shown):
    snapshots = c.page.evaluate("window.__graph23")
    rows = compute(plan)[0]
    for k, name in enumerate(NAMES):
        data = snapshots.get(name + " 지수 비교", {})
        c.expect(bool(data), f"§6 {name} 그래프 렌더 호출")
        own = [s for s in data.get("series", []) if "가람" in s.get("name", "")]
        if shown == 0:
            c.expect(not own or all(not any(v is not None for v in s["data"]) for s in own), f"§6 {name} shown=0 가람국 자료 없음")
        else:
            c.eq(len(own), 1, f"§6 {name} 가람국 선 하나")
            if own:
                # spec §6은 '가람국 선은 shown년 차까지만'만 정하고 자료 모양은 정하지 않는다.
                # 공용 KCP.lines는 계열마다 xs를 받을 수 있으므로(계단 좌표를 직접 주는 방식),
                # (x, 값) 점으로 풀어 같은 x의 마지막 값이 그해 누적인지와 shown 뒤 점이 없는지를 본다.
                # 선이 10년 차까지 이어지지 않는지는 아래 SVG 끝점 검사가 따로 본다.
                sx = own[0].get("xs") or data.get("xs", [])
                pts = [(x, v) for x, v in zip(sx, own[0]["data"]) if v is not None]
                last = {}
                for x, v in pts:
                    last[x] = v
                c.eq([last.get(x) for x in range(shown + 1)], [0] + [r[k] for r in rows[:shown]], f"§6 {name} 공개 연차까지만 자료 전달")
                c.expect(all(x <= shown for x, _ in pts), f"§6 {name} 이후 자료 숨김")
    geometry = c.page.locator("#trio svg").evaluate_all(r"""svgs=>svgs.map(svg=>{
      const texts=[...svg.querySelectorAll('text')];
      const ten=texts.filter(e=>e.textContent==='10').sort((a,b)=>Number(b.getAttribute('y'))-Number(a.getAttribute('y')))[0];
      const zero=texts.filter(e=>e.textContent==='0').sort((a,b)=>Number(b.getAttribute('y'))-Number(a.getAttribute('y')))[0];
      const paths=[...svg.querySelectorAll('path')].filter(e=>/var\(--(?:sci|hap|env)\)/.test(e.getAttribute('stroke')||''));
      return {x0:Number(zero?.getAttribute('x')),x10:Number(ten?.getAttribute('x')),
        ends:paths.filter(e=>(e.getAttribute('d')||'').trim()).map(e=>e.getPointAtLength(e.getTotalLength()).x)};
    })""")
    c.eq(len(geometry), 3, "§6 지수 그래프 세 개")
    for g in geometry:
        if shown == 0:
            c.eq(g["ends"], [], "§6 shown=0 SVG 가람국 선 없음")
        else:
            c.eq(len(g["ends"]), 1, "§6 가람국 SVG 선 하나")
            target = g["x0"] + (g["x10"]-g["x0"])*shown/10
            # §6 선은 shown에서 끝나야 한다. SVG 소수 좌표 반올림 1px만 허용.
            c.expect(bool(g["ends"]) and abs(g["ends"][0]-target) <= 1, f"§6 가람국 선 끝 shown={shown}: {g}")


def _caption_at(c, plan, shown):
    c.page.wait_for_selector(SCENE)
    rows = compute(plan)[0]
    if shown:
        patterns = [rf"{name}\s*{value}(?!\d)" for name, value in zip(NAMES, rows[shown-1])]
    else:
        patterns = []
    # 장면은 다음 애니메이션 프레임에서 갱신된다. 2초는 기존 장면 검사와 동일.
    c.page.wait_for_function(r"""a=>{
      const t=document.querySelector(a.sel)?.getAttribute('aria-label')||'';
      return t && (a.shown ? a.p.every(p=>new RegExp(p).test(t)) : !/누적\s*과학\s*-?\d/.test(t));
    }""", arg={"sel": SCENE, "shown": shown, "p": patterns}, timeout=2000)
    caption = c.page.locator(SCENE).get_attribute("aria-label") or ""
    if shown == 0:
        c.expect(not re.search(r"(?:과학|행복|환경)\s*[−-]?\d", caption), "§6 shown=0 장면 누적값 없음")
        if plan:
            c.eq(caption, "가람국 개척 길 그림. 누적을 확인한 해가 아직 없어 세 나라 마차가 출발점에 서 있습니다.", "V8 준비실 미확인 장면 설명")
    else:
        c.expect(all(re.search(p, caption) for p in patterns), "§6 장면은 공개 연차 누적")
        c.expect(all(re.search(rf"\b{card}\b", caption) for card in plan[:shown]), "V8 장면 설명에 공개한 항목 모두 표시")
        if shown < len(plan):
            c.expect(f"{shown}년 차까지 누적을 확인한 항목" in caption, "V8 준비실 확인한 항목임을 명시")
    c.expect(all(not re.search(rf"\b{card}\b", caption) for card in plan[shown:]), "§6 장면 설명의 숨긴 항목 없음")


def _events(c, plan, shown):
    text = c.page.locator("#events").inner_text()
    rows, epidemic, fair = compute(plan)
    c.eq("전염병" in text, shown >= 3, f"§6 shown={shown} 전염병 결과 공개 시점")
    c.eq(bool(re.search(r"박람회", text)), shown >= 6, f"§6 shown={shown} 박람회 결과 공개 시점")
    if shown >= 3:
        c.expect(bool(re.search(r"−1|-1|발생", text)) if epidemic else "막았습니다" in text, "§6 전염병 결과")
    if shown >= 6:
        c.expect(bool(re.search(r"성공|효과|\+2", text)) if fair else bool(re.search(r"미달|채우지 못", text)), "§6 박람회 결과")
    if shown == 0:
        c.eq(c.page.locator("#events .chip").count(), 0, "§6 shown=0 누적 칩 없음")
        c.expect("누적" not in text, "§6 shown=0 사건·누적 텍스트 없음")
    else:
        # 사건 설명에 과학 5 등 조건 값도 있으므로 현재 누적 절만 비교한다.
        current = re.search(r"현재 누적[^\n]*", text)
        c.expect(bool(current) and all(re.search(p, current[0]) for p in value_patterns(rows[shown-1])), "§6 현재 누적 칩은 공개 연차 값")


def t_06_calculation_modes(c: Ctx):
    """§6: 기본 실전·옛 calcOn=true에서도 자동 계산, 세 연습 모드는 기본 꺼짐."""
    c.goto("#y2023", wait="#mine")
    c.eq(c.page.evaluate("KCP.settings().timeMode"), "real", "§6 기본 시간 모드 실전")
    c.eq(c.page.locator("#calc23-on").count(), 0, "§6 실전에서는 토글 자체 없음")
    for on in (False, True):
        _seed(c, _game(EVENT_PLAN, calcOn=on, calc={}), "real")
        c.eq(c.page.locator("#calc23-on").count(), 0, "§6 저장 calcOn과 무관하게 실전 토글 없음")
        c.eq(_shown(c), 10, "§6 비활성 shown은 계획 길이")
        _visible_table(c, EVENT_PLAN, 10)
        _events(c, EVENT_PLAN, 10)
    for mode in ("ext", "custom", "free"):
        _seed(c, _game(EVENT_PLAN[:4]), mode)
        toggle = c.page.locator("#calc23-on")
        c.expect(toggle.is_visible() and not toggle.is_checked(), f"§6 {mode} 직접 쓰기 기본 꺼짐")
        c.eq(toggle.get_attribute("type"), "checkbox", f"§6 {mode} checkbox")
        c.eq(c.page.get_by_role("checkbox", name=re.compile("누적 직접 쓰기")).count(), 1, f"§6 {mode} 접근성 이름")
        box = toggle.evaluate("""el=>{const label=el.labels?.[0];const b=(label||el).getBoundingClientRect();return {w:b.width,h:b.height,text:label?.textContent||'',tag:!!label?.querySelector('.tag-mine')};}""")
        c.expect(box["w"] >= 44 and box["h"] >= 44, f"§6 {mode} 눌림 영역 44px {box}")
        c.expect(box["tag"] and "연습실 기능" in box["text"], f"§6 {mode} 연습실 기능 태그")
        # W4 / §6: 문장 다듬기는 허용하되 원문 과제와 확인→비교 순서는 모두 남아야 한다.
        guide = c.page.locator("#calc23-tools").inner_text()
        c.expect(all(word in guide for word in ("원문 자료 5", "누적", "직접", "표", "해마다", "먼저", "확인", "자동 계산", "비교")), f"W4 {mode} 켜기 단추 설명")
        c.expect(bool(re.search(r"먼저[^.]*확인[^.]*자동 계산[^.]*비교", guide)), f"W4 {mode} 직접 쓰고 확인한 뒤 자동 계산과 비교")
        _visible_table(c, EVENT_PLAN[:4], 4)
        c.check(f"§6 {mode} 기본 꺼짐")


def _submit(c, values):
    for suffix, value in zip(("s", "h", "e"), values):
        c.page.fill(f"#calc23-{suffix}", str(value))
    c.page.click("#calc23-ok")
    return _saved(c)


def t_07_calculation_inputs_and_reveal(c: Ctx):
    """§6: 직접 입력 저장, 잘못된 정수 거부, shown=0/3/6, 두 사건, undo/clear."""
    _seed(c, _game(), "ext")
    _watch_graph(c)
    c.page.check("#calc23-on")
    _pick(c, EVENT_PLAN)
    saved = _saved(c)
    c.expect(saved.get("calcOn") is True, "§6 토글 저장")
    c.eq(saved.get("calc"), {}, "§6 입력 전 calc 빈 객체")
    c.eq(_shown(c), 0, "§6 켠 뒤 계획을 골라도 shown=0")
    _visible_table(c, EVENT_PLAN, 0)
    _events(c, EVENT_PLAN, 0)
    _graph(c, EVENT_PLAN, 0)
    _caption_at(c, EVENT_PLAN, 0)
    _no_leak_or_score(c, "직접 쓰기 shown=0")
    for suffix, name in zip(("s", "h", "e"), NAMES):
        field = c.page.locator(f"#calc23-{suffix}")
        c.eq(field.get_attribute("inputmode"), None, f"V6 {name} inputmode 속성 없음")
        c.eq(field.get_attribute("type"), "text", f"V6 {name} 음수 입력용 text")
        c.eq(field.get_attribute("autocomplete"), "off", f"V6 {name} 자동완성 끔")
        c.expect(name in field.evaluate("e=>[...(e.labels||[])].map(x=>x.textContent).join(' ')"), f"§6 {name} label 연결")
    c.expect(all(x in c.page.locator("#calc23").inner_text() for x in ("1년 차", EVENT_PLAN[0], "누적")), "§6 다음 입력 연차·항목 안내")
    guide = c.page.locator("#calc23-guide").inner_text()
    c.expect("음수는 앞에 -를 붙여 쓰세요(예: -2)." in guide, "V6 ASCII 음수 입력 안내")
    # W4 / §6: 사건의 판정 해와 실제 효과 해를 뒤섞지 않게 검사한다.
    normalized = guide.replace("−", "-")
    for pattern in (r"3년 차[^.]*판정[^.]*4년 차[^.]*행복\s*-1", r"6년 차[^.]*판정[^.]*7년 차[^.]*행복\s*\+2"):
        c.expect(bool(re.search(pattern, normalized)), "W4 직접 계산 사건 안내 " + pattern)
    for invalid in (("", "0", "0"), ("1.5", "0", "0"), ("1", "0.5", "0"), ("1", "0", "-0.5"),
                    ("1000", "0", "0"), ("0", "-1000", "0"), ("0", "0", "1e2")):
        saved = _submit(c, invalid)
        c.eq(saved.get("calc"), {}, f"§6 비정수·빈 입력 저장 안 함 {invalid}")
        c.eq(_shown(c), 0, "§6 유효하지 않은 입력은 shown 유지")
        msg = c.page.locator("#calc23-msg")
        c.eq(msg.inner_text(), "세 지수를 모두 -999~999 사이의 정수로 쓰세요.", "V6 정수 범위 입력 안내")
        c.eq(msg.get_attribute("aria-live"), "polite", "§6 비교 결과 polite 알림")
    rows = compute(EVENT_PLAN)[0]
    recorded = {}
    for year, automatic in enumerate(rows, 1):
        entered = list(automatic)
        if year == 2:
            entered[1] = -7  # 음수도 정수로 저장하고, 오답이어도 공개 연차는 증가.
        recorded[str(year)] = entered
        saved = _submit(c, entered)
        c.eq(saved.get("calc"), recorded, f"§6 {year}년 입력 정확히 저장")
        c.eq(_shown(c), year, f"§6 {year}년 확인 후 shown 증가")
        if year < len(rows):
            c.eq(c.page.evaluate("document.activeElement.id"), "calc23-s", "V6 다음 연차 과학 칸 초점")
            c.eq([c.page.input_value(f"#calc23-{s}") for s in ("s", "h", "e")], ["", "", ""], "V6 연차가 바뀌면 입력 비움")
        msg = c.page.locator("#calc23-msg").inner_text().replace("−", "-")
        if year == 2:
            c.expect("내 계산" in msg and "자동 계산" in msg and "다른 지수: 행복" in msg, "§6 오답 비교·다른 지수 안내")
            before, _, after = msg.partition("자동 계산")
            c.expect(all(re.search(p, before) for p in value_patterns(entered)), "§6 비교 메시지의 내 계산 값")
            c.expect(all(re.search(p, after) for p in value_patterns(automatic)), "§6 비교 메시지의 자동 계산 값")
            cell = _table_rows(c)[1][1]["text"].replace("−", "-")
            c.expect(bool(re.search(r"내 계산\s*-7(?!\d)", cell)), "§6 오답 연차 칸에 내 계산 -7")
        else:
            c.expect(f"{year}년 차" in msg and "맞습니다" in msg and all(re.search(p, msg) for p in value_patterns(automatic)), f"§6 {year}년 정답 비교 문구")
        if year in (1, 2, 3, 4, 5, 6, 7, 9, 10):
            _visible_table(c, EVENT_PLAN, year)
            _events(c, EVENT_PLAN, year)
            _graph(c, EVENT_PLAN, year)
            _caption_at(c, EVENT_PLAN, year)
            c.check(f"§6 shown={year}")
    c.eq(c.page.locator("#calc23").count(), 0, "§6 마지막 확인 뒤 입력 줄 제거")
    c.eq(c.page.locator("#calc23-msg").get_attribute("tabindex"), "-1", "V6 마지막 비교 알림 초점 허용")
    c.eq(c.page.evaluate("document.activeElement.id"), "calc23-msg", "V6 마지막 확인 뒤 비교 알림 초점")
    _no_leak_or_score(c, "직접 쓰기 완료")
    c.page.click("#undo")
    saved = _saved(c)
    c.eq(saved.get("plan"), EVENT_PLAN[:-1], "§6 마지막 해 취소")
    c.eq(saved.get("calc"), {k: v for k, v in recorded.items() if k != "10"}, "§6 undo는 넘친 calc 연차만 삭제")
    c.eq(_shown(c), 9, "§6 undo 뒤 shown 9")
    c.page.click("#clear")
    saved = _saved(c)
    c.eq(saved.get("calc"), {}, "§6 clear는 calc 비움")
    c.eq(saved.get("plan"), [], "§6 clear는 계획 비움")
    c.expect(saved.get("calcOn") is True and c.page.locator("#calc23-on").is_checked(), "§6 clear 뒤 calcOn 유지")
    c.eq(_shown(c), 0, "§6 clear 뒤 shown 0")
    c.check("§6 처음부터")


def t_08_live_time_mode_change(c: Ctx):
    """§6: 열린 준비실의 settings:change 즉시 반영·저장 없음·장면 복귀."""
    _seed(c, _game(EVENT_PLAN, calcOn=True, calc={}), "ext")
    _submit(c, [1, 0, 0])
    c.expect(bool(c.page.locator("#calc23-msg").inner_text()), "V6 모드 변경 전 실제 비교 문장 있음")
    _watch_graph(c)
    # 지연 저장이 끝난 뒤 KCP.save 호출을 관찰한다. 설정 자체 저장은 허용한다.
    c.page.evaluate("""() => {
      KCP.flush();window.__save23calls=0;const save=KCP.save;
      KCP.save=function(year,state){if(String(year)==='2023')window.__save23calls++;return save.apply(this,arguments);};
      window.__mode23sentinel='same-document';
    }""")
    c.page.evaluate("() => KCP.setSettings({timeMode:'real'})")
    c.page.wait_for_selector("#calc23-on", state="detached")
    c.eq(c.page.locator("#calc23").count(), 0, "§6 real 전환으로 입력 줄 제거")
    c.eq(c.page.locator("#calc23-msg").text_content(), "", "V6 real 전환 직후 이전 비교 문장 비움")
    c.eq(_shown(c), 10, "§6 real에서는 저장 calc보다 계획 길이 우선")
    _visible_table(c, EVENT_PLAN, 10)
    _events(c, EVENT_PLAN, 10)
    _graph(c, EVENT_PLAN, 10)
    _caption_at(c, EVENT_PLAN, 10)
    c.page.evaluate("() => KCP.setSettings({timeMode:'ext'})")
    c.page.wait_for_selector("#calc23-on")
    c.expect(c.page.locator("#calc23-on").is_checked(), "§6 ext 복귀 때 기존 켜짐 복원")
    c.eq(_shown(c), 1, "§6 ext 복귀 시 공개 연차 1")
    c.eq(c.page.locator("#calc23-msg").text_content(), "", "V6 모드 왕복 뒤 이전 비교 문장 비움")
    _visible_table(c, EVENT_PLAN, 1)
    _events(c, EVENT_PLAN, 1)
    _graph(c, EVENT_PLAN, 1)
    _caption_at(c, EVENT_PLAN, 1)
    c.wait_saved(400)
    c.eq(c.page.evaluate("window.__mode23sentinel"), "same-document", "§6 새로고침 없이 시간 모드 전환")
    c.eq(c.page.evaluate("window.__save23calls"), 0, "§6 settings:change에서 게임 저장 호출 안 함")
    saved = c.ls(KEY)["game"]
    c.expect(saved.get("calcOn") is True, "§6 real 왕복은 저장 calcOn 보존")
    c.eq(saved.get("calc"), {"1": [1, 0, 0]}, "§6 real 왕복은 학생 입력 보존")
    _no_leak_or_score(c, "시간 모드 왕복")
    c.check("§6 시간 모드 왕복")


def t_09_old_and_malformed_storage(c: Ctx):
    """§6: 옛 봉투·잘못된 calc·불연속 연차·길이 제한·boolean 기본값."""
    bad_values = (None, [], "가상 손상 값", 42, {
        "1": [1,0,0], "2": [3,0.5,0], "3": [4,1,0], "4": [1,2],
        "5": [True,0,0], "6": ["5",0,4], "7": None, "8": {"s": 5},
        "9": [1,2,3,4], "10": [5,4,7], "0": [9,9,9], "11": [9,9,9],
        "01": [9,9,9], "x": [9,9,9]})
    for bad in bad_values:
        _seed(c, _game(EVENT_PLAN, calcOn=True, calc=bad), "ext")
        # 렌더 단계에서 정규화된 현재 game을 일반 입력 이벤트로 저장한다.
        c.page.fill("#q1-23", "가상 메모: 손상 저장의 입력 필드를 확인한다.")
        saved = _saved(c)
        expected = {"1": [1,0,0], "3": [4,1,0], "10": [5,4,7]} if isinstance(bad, dict) else {}
        c.eq(saved.get("calc"), expected, "§6 잘못된 키·배열·정수 값을 버리고 유효 항목 유지")
        c.eq(_shown(c), 1 if expected else 0, "§6 불연속 calc는 연속 구간만 shown")
        _visible_table(c, EVENT_PLAN, 1 if expected else 0)
        c.check("§6 손상 calc 열기")
    for bad_on in (None, "true", 1, {}, []):
        _seed(c, _game(EVENT_PLAN[:3], calcOn=bad_on, calc={}), "ext")
        c.page.fill("#q1-23", "가상 메모: 잘못된 토글 값을 확인한다.")
        saved = _saved(c)
        c.expect(saved.get("calcOn") is False, "§6 boolean 아닌 calcOn 기본 false")
        c.expect(not c.page.locator("#calc23-on").is_checked(), "§6 손상 토글 꺼짐")
        c.eq(_shown(c), 3, "§6 손상 토글은 비활성 shown=계획 길이")
    _seed(c, _game(EVENT_PLAN[:3]), "ext")
    c.page.fill("#q1-23", "가상 메모: 새 필드 없는 옛 계획을 확인한다.")
    saved = _saved(c)
    c.expect(saved.get("calcOn") is False, "§6 옛 저장 calcOn=false")
    c.eq(saved.get("calc"), {}, "§6 옛 저장 calc={}")
    for key in ("plan", "peek", "tab", "q2"):
        c.eq(saved.get(key), _game(EVENT_PLAN[:3])[key], f"§6 기존 필드 {key} 의미 보존")
    # 공개 함수 자체의 계약: active=false/true, 길이를 넘는 기록, 중간 공백.
    games = [_game(EVENT_PLAN[:2], calcOn=True, calc={str(i): [0,0,0] for i in range(1,11)}),
             _game(EVENT_PLAN[:5], calcOn=True, calc={"1": [1,0,0], "3": [4,1,0]}),
             _game(EVENT_PLAN[:5], calcOn=False, calc={})]
    c.eq(c.page.evaluate("gs=>gs.map(g=>KCP.games['2023'].shownYears(g))", games), [2,1,5], "§6 shownYears 연속성·길이·비활성")
    # V7: 렌더가 정규화하기 전의 공개 함수에도 손상된 game을 직접 전달한다.
    malformed = [None, {}, {"plan": None}, {"plan": "1A"}, {"plan": {}},
                 {"calcOn": True}, {"plan": None, "calcOn": True}]
    inspect_shown = "gs=>gs.map(g=>{const n=KCP.games['2023'].shownYears(g);return [typeof n,n];})"
    c.eq(c.page.evaluate(inspect_shown, malformed), [["number", 0]] * len(malformed), "V7 game·plan 누락/비배열은 숫자 0")
    c.eq(c.page.evaluate("() => {const n=KCP.games['2023'].shownYears();return [typeof n,n];}"), ["number", 0], "V7 인자 없는 shownYears는 숫자 0")
    dirty = [_game(EVENT_PLAN, calcOn=True, calc={"1": v, "2": [0,0,0]})
             for v in ([1000,0,0], [-1000,0,0], [True,0,0], ["1",0,0], [0.5,0,0], None)]
    dirty += [_game(EVENT_PLAN, calcOn=True, calc={"1": [1,0,0], "2": [0,1000,0], "3": [0,0,0]})]
    c.eq(c.page.evaluate("gs=>gs.map(g=>KCP.games['2023'].shownYears(g))", dirty), [0]*6+[1], "V7 cleanCalc에서 버린 연차는 확인한 해로 세지 않음")
    c.page.evaluate("() => KCP.setSettings({timeMode:'real'})")
    c.eq(c.page.evaluate("gs=>gs.map(g=>KCP.games['2023'].shownYears(g))", games), [2,5,5], "§6 실전 shownYears=계획 길이")
    c.eq(c.page.evaluate(inspect_shown, malformed), [["number", 0]] * len(malformed), "V7 비활성에서도 누락·비배열 plan 허용")
    c.check("§6 옛 저장 호환")


def t_10_reflection_annotation_and_secrecy(c: Ctx):
    """§7: 성찰 전 유실·예시·계산 주석 비노출, 성찰 계산 목록·결론."""
    _seed(c, _game(EVENT_PLAN, calcOn=True, calc={"1": [1,0,0]}), "ext")
    c.eq(_shown(c), 1, "V8 10개 계획·직접 쓰기 확인 1년 준비")
    _caption_at(c, EVENT_PLAN, 1)
    # W4 / §6: active인 준비실에서도 recap은 숨긴 연차까지 전체를 계산한다.
    recap = c.page.evaluate("KCP.games['2023'].recap(KCP.load('2023'))")
    summary = {item["t"]: item["d"] for item in recap}
    c.eq(re.findall(r"\b[1-4][A-I]\b", summary.get("가람국 실행 계획", "")), EVENT_PLAN, "W4 active recap 전체 10년 계획")
    values, epidemic, fair = compute(EVENT_PLAN)
    c.expect(all(re.search(p, summary.get("최종 누적 지수", "")) for p in value_patterns(values[-1])), "W4 active recap 최종 누적 독립 계산")
    c.eq(summary.get("사건"), f"전염병 {'발생' if epidemic else '없음'} · 박람회 {'효과' if fair else '조건 미달'}", "W4 active recap 전체 사건 계산")
    _compare_questions(c, _questions(c), EVENT_PLAN, "W4 active 준비실 질문 전체 계산")
    _no_leak_or_score(c, "준비실")
    c.page.click("#go23")
    c.page.wait_for_selector(".qdeck .qcard")
    _caption_at(c, EVENT_PLAN, 10)  # V8: 면접실에서는 미확인 10년 차 항목까지 표시.
    _compare_questions(c, _questions(c), EVENT_PLAN, "§6 active 상태의 면접 질문 전체 계산")
    _no_leak_or_score(c, "면접실")
    c.page.click("#toReflect")
    c.page.wait_for_selector("#copyAll")
    _caption_at(c, EVENT_PLAN, 10)  # V8: 성찰도 전체 계획.
    reveal = c.page.locator('details.reveal[data-rv23="whole"]')
    c.eq(reveal.count(), 1, "§7 성찰에 새 접힘 하나")
    c.eq(reveal.get_attribute("open"), None, "§7 계산 주석은 기본 접힘")
    # 기존 성찰 흐름: 예시 영역(#exwrap)은 내 기준을 10자 이상 쓰고 '예시 답안과 해설 열기'를 눌러야 열린다.
    c.page.fill("#before-2023", "가상 기준: 환경 격차를 먼저 줄인다")
    c.page.click("#openEx")
    c.page.wait_for_selector("#exwrap", state="visible")
    c.expect("보고서 종합 판단 질문의 연차 확인" in reveal.locator("summary").inner_text(), "§7 주석 제목")
    c.eq(reveal.locator(".tag-mine").filter(has_text="연습실 계산").count(), 1, "§7 계산 출처 태그")
    reveal.locator("summary").click()
    text = reveal.inner_text()
    env = [b[2]-a[2] for a,b in zip(*NB)]
    sci = [a[0]-b[0] for a,b in zip(*NB)]
    for name, values in (("환경", env), ("과학", sci)):
        c.expect(", ".join(map(str, values)) in text, f"V5 {name} 1~10년 차 독립 계산 목록·쉼표 구분")
    first = "보고서의 종합 판단 질문은 나람국 환경지수를 '3년 차에 경계, 7년 차에 위험'이라고 적었습니다. 자료 4의 이웃 누적치로 계산한 1~10년 차 격차는 다음과 같습니다."
    c.expect(first in text, "V5 원문 인용을 보존한 첫 문단")
    env_warn, env_risk = (next(i for i, value in enumerate(env, 1) if value >= threshold) for threshold in (3, 5))
    sci_warn, sci_risk = (next(i for i, value in enumerate(sci, 1) if value >= threshold) for threshold in (3, 5))
    conclusion = (f"환경은 3년 차 격차가 {env[2]}이라 경계가 아니며, 처음 경계는 {env_warn}년 차({env[env_warn-1]}), "
                  f"위험은 {env_risk}년 차({env[env_risk-1]})부터입니다. 다람국 과학지수는 {sci_warn}년 차 경계({sci[sci_warn-1]}), "
                  f"{sci_risk}년 차부터 위험({sci[sci_risk-1]})으로 보고서 문장과 맞습니다.")
    c.expect(conclusion in text, "V5 독립 계산한 연차·격차 결론 문장")
    c.expect("보고서 문장은 고치지 않고 원문대로 둡니다." in text, "V5 원문 보존 설명")
    # 닫힌 details 안의 글도 보려고 text_content를 쓰고, 어떤 쪽 번호든 찾는다(검토 지적).
    c.expect(not re.search(r"\d+\s*쪽", c.page.locator("#app").text_content() or ""), "V5 학생 화면에 쪽 번호 없음")
    example = c.page.locator("details.reveal").filter(has=_table(c, "예시 가람국"))
    example.locator("summary").click()
    _total(c, compute(EXAMPLE)[0][-1], "예시 가람국", EXAMPLE)
    c.check("§7 성찰 계산 접힘 열기")


def t_12_input_draft_and_negative_values(c: Ctx):
    """V6·W4: 같은 연차의 작성 중 값 보존, 두 음수 부호와 범위 경계 저장."""
    _seed(c, _game(EVENT_PLAN[:2], calcOn=True, calc={}), "ext")
    draft = ["-2", "−2", "999"]
    for suffix, value in zip(("s", "h", "e"), draft):
        c.page.fill(f"#calc23-{suffix}", value)
    _pick(c, EVENT_PLAN[2:3])  # 계획만 늘고 묻는 연차는 여전히 1년 차.
    c.eq(_shown(c), 0, "V6 노드 추가는 작성 중 연차를 확인하지 않음")
    c.eq([c.page.input_value(f"#calc23-{s}") for s in ("s", "h", "e")], draft, "V6 경로 노드 선택 뒤 같은 연차의 세 입력 유지")
    c.page.evaluate("() => KCP.setSettings({timeMode:'free'})")
    c.eq([c.page.input_value(f"#calc23-{s}") for s in ("s", "h", "e")], draft, "V6 연습 모드 변경 뒤 같은 연차의 세 입력 유지")
    c.page.click("#calc23-ok")
    c.eq(_saved(c).get("calc"), {"1": [-2,-2,999]}, "V6 ASCII -2와 U+2212 −2를 모두 정수로 저장")
    c.eq([c.page.input_value(f"#calc23-{s}") for s in ("s", "h", "e")], ["", "", ""], "V6 다음 연차에는 이전 작성 값 없음")
    c.eq(_submit(c, [999,-999,0]).get("calc"), {"1": [-2,-2,999], "2": [999,-999,0]}, "V6 -999·999 경계 정수 허용")
    _submit(c, compute(EVENT_PLAN[:3])[0][-1])
    c.eq(c.page.locator("#calc23").count(), 0, "V6 10년 미만 계획도 마지막 확인 뒤 입력 줄 제거")
    c.eq(c.page.evaluate("document.activeElement.id"), "calc23-msg", "V6 짧은 계획의 마지막 확인 뒤 알림 초점")
    c.check("V6 작성 중 입력·음수 저장")


def t_11_existing_selectors(c: Ctx):
    """§8: 노드·연차·undo·세 탭·메모·면접 전환과 실제 questions 길이."""
    c.goto("#y2023", wait="[data-node]")
    for selector in ("#mat", "#mine", "#yr", "#undo", "#clear", "#events", "#trio", "#q1-23", "#q2-23", "#go23"):
        c.eq(c.page.locator(selector).count(), 1, f"§8 기존 선택자 {selector}")
    _pick(c, EVENT_PLAN[:4])
    c.eq(c.page.locator("#yr").inner_text().strip(), "4 / 10년", "§8 노드 클릭·연차")
    c.page.click("#undo")
    c.eq(c.page.locator("#yr").inner_text().strip(), "3 / 10년", "§8 undo 연차")
    _pick(c, EVENT_PLAN[3:])
    c.eq(c.page.locator("#yr").inner_text().strip(), "10 / 10년", "§8 10년 완성")
    for tab in ("wheel", "nb", "path"):
        button = c.page.locator(f'[data-tab="{tab}"]')
        button.click()
        c.eq(button.get_attribute("aria-selected"), "true", f"§8 {tab} 탭 선택")
        c.expect(bool(c.page.locator("#mat").inner_text().strip()), f"§8 {tab} 자료 표시")
        c.check(f"§8 탭 {tab}")
    for selector in ("#q1-23", "#q2-23"):
        c.page.fill(selector, '가상 메모: <b>비교</b> & "근거"')
    _saved(c)
    questions = _questions(c)
    _compare_questions(c, questions, EVENT_PLAN, "§8 회귀 계획")
    c.page.click("#go23")
    c.page.wait_for_selector(".qdeck .qcard")
    c.eq(c.page.locator(".qdeck .qcard").count(), len(questions), "§8 면접실 카드 수=questions 길이")
    _no_leak_or_score(c, "회귀 면접실")
    c.check("§8 면접실")


# spec-v3 X1~X3: 아래 기대값은 명세 3판에서 전사한다.
# SCI의 id→제목만 공개 자료에서 읽고, 유형·카드 연결은 구현에서 가져오지 않는다.
FOLD_KEYS = ("23-q1-like", "23-q1-nation", "23-q1-live")
HINT_V3 = {
    "23-q1": ("task", ["rel"]),
    "23-q1-check": ("task", ["cum", "rel"]),
    "23-q1-like": ("task", ["sd"]),
    "23-q1-nation": ("task", ["sd"]),
    "23-q1-policy": ("task", ["sd"]),
    "23-q1-sustain": ("human", ["sd"]),
    "23-q1-oppose": ("human", ["rel"]),
    "23-q1-export": ("divergent", ["rel"]),
    "23-q1-conflict": ("counter", ["rel"]),
    "23-q1-whole": ("task", ["rel"]),
    "23-q1-live": ("human", ["rel"]),
    "23-q2": ("task", ["sd", "cum"]),
    "23-q2-top": ("task", ["sd", "cum"]),
    "23-q2-avoid": ("task", ["rel"]),
    "23-q2-timing": ("task", ["cum"]),
    "23-q2-event": ("task", ["epi"]),
    "23-q2-lead": ("task", ["rel", "cum"]),
    "23-lost": ("calc", ["infer"]),
    "23-q2-gap": ("task", ["rel", "cum"]),
    "23-flex": ("counter", ["cum"]),
    "23-q2-shorten": ("counter", ["cum"]),
    "23-q2-real": ("human", ["rel"]),
    "23-q2-coop": ("human", ["rel"]),
    "23-hum-verify": ("human", ["sd"]),
}
SOURCE_V3 = "'보고서 문항'은 보고서에 실린 과제나 질문 예시를 면접 질문 형태로 바꾼 것입니다(일부는 내가 고른 내용이 들어갑니다)."
FRAME_SOURCE_V3 = "'내 계획으로 채움'이 붙은 질문은 보고서 질문의 틀에 내 계획을 넣어 만든 것입니다."
SOURCE_TAIL = ("'연습용 질문'은 이 연습실이 준비실 결과에 맞춰 고르거나 만든 질문이며, "
               "일부는 보고서의 질문 예시를 바탕으로 했습니다. 실제 면접에서는 면접위원이 답을 들으며 후속 질문을 이어 갑니다.")
ORIGINAL_SOURCE = ("이 게임의 질문은 모두 연습실이 준비실 결과에 맞춰 만든 연습용 질문입니다. "
                   "실제 면접에서는 면접위원이 답을 들으며 후속 질문을 이어 갑니다.")


def _fold_state_v3(c, i, opened):
    card = c.page.locator(".qdeck .qcard").nth(i)
    button, body = card.locator(".qfold-toggle"), card.locator(".qfold-body")
    c.eq(button.get_attribute("type"), "button", f"X1 {i} 접기 단추 type")
    c.eq(button.get_attribute("aria-expanded"), str(opened).lower(), f"X1 {i} 펼침 상태")
    c.eq(button.inner_text(), "질문 접기" if opened else "질문 보기", f"X1 {i} 단추 문구")
    c.eq(body.get_attribute("id"), f"qfold-2023-{i}", f"X1 {i} 본문 id")
    c.eq(button.get_attribute("aria-controls"), body.get_attribute("id"), f"X1 {i} 단추·본문 연결")
    c.eq(c.page.locator(f'[id="qfold-2023-{i}"]').count(), 1, f"X1 {i} 본문 id 고유")
    c.eq(body.evaluate("e => e.hidden"), not opened, f"X1 {i} hidden 속성")
    c.eq(body.is_visible(), opened, f"X1 {i} 실제 본문 표시")
    c.eq(body.evaluate("e => getComputedStyle(e).display === 'none'"), not opened, f"X1 {i} 숨김 display")
    return button, body


def _plain_cards_v3(c, year, questions):
    """X1: 확장 도구가 덧붙인 뒤에도 기존 카드의 직접 자식 순서를 보존한다."""
    cards = c.page.locator(".qdeck .qcard")
    c.eq(cards.count(), len(questions), f"X1 {year} 전체 카드 수")
    for i, q in enumerate(questions):
        if year == "2023" and q["k"] in FOLD_KEYS:
            continue
        card = cards.nth(i)
        c.eq(card.evaluate("e => [e.tagName, e.className]"), ["DIV", "qcard"], f"X1 {year}/{i} 기존 겉 카드")
        # X1은 기존 확장 요소(.kh 등)도 보존한다. .qx까지의 핵심 직접 자식만 비교한다.
        children = card.evaluate("""e => {
          const xs = Array.from(e.children), end = xs.findIndex(x => x.matches('.qx'));
          return xs.slice(0, end + 1).map(x => x.matches('textarea[data-a]') ? 'textarea' : x.classList[0]);
        }""")
        expected = ["who", "q"] + ["rec"] * (bool(q.get("time")) + bool(q.get("rec"))) + ["textarea", "qx"]
        c.eq(children, expected, f"X1 {year}/{i} who→q→time/rec→textarea→qx 순서")
        c.eq(card.locator(":scope > .q").text_content(), q["q"], f"X1 {year}/{i} 질문 문장 유지")
        c.eq(card.locator(f':scope > textarea[data-a="{i}"]').count(), 1, f"X1 {year}/{i} 직접 메모 자식")
        c.eq(card.locator(f':scope > .qx[data-qx="{i}"]').count(), 1, f"X1 {year}/{i} 직접 슬롯 자식")


def t_13_X1_fold_controls(c: Ctx):
    """X1: 네 환경에서 세 접기·접근성·전체 카드 수·저장 없는 여닫기."""
    _seed(c, _game(EXAMPLE), phase="room")
    qs = _questions(c)
    c.eq([q["k"] for q in qs], list(HINT_V3), "X1 예시 계획 24개 질문 순서")
    indices = [i for i, q in enumerate(qs) if q["k"] in FOLD_KEYS]
    c.eq([qs[i]["k"] for i in indices], list(FOLD_KEYS), "X1 접기 질문 키·순서")
    c.eq([q["k"] for q in qs if q.get("fold") is True], list(FOLD_KEYS), "X1 fold:true는 세 질문만")
    c.expect(all("fold" not in q for q in qs if q["k"] not in FOLD_KEYS), "X1 다른 질문에는 fold 속성 없음")
    c.eq(c.page.locator(".qfold").count(), 3, "X1 접는 카드 정확히 세 개")
    c.eq(c.page.locator(".qfold textarea[data-a]").evaluate_all("xs => xs.map(x => Number(x.dataset.a))"), indices, "X1 DOM 위치와 questions 순서 일치")
    c.eq(c.page.locator(".qdeck .qcard").count(), 24, "X1 닫혀 있어도 카드 24개")
    c.eq(c.page.locator(".qdeck textarea[data-a]").count(), 24, "X1 닫혀 있어도 메모 칸 24개")
    c.eq(c.page.locator("#room-main h3 .chip").inner_text(), "24개", "X1 카드 수 칩은 전체 24개")
    c.eq(c.page.locator("#room-folds").count(), 1, "X1 접기 안내 하나")
    # 총괄 정정(독립 검토 반영): 안내는 #room-tools 앞에 두어 '덱 바로 앞은 도구 슬롯' 확장 계약을 지키고,
    # 카드를 연 뒤에도 맞도록 '처음에 접혀 있습니다'로 쓴다.
    c.eq(c.page.locator("#room-folds").inner_text(), "가벼운 질문 3개는 처음에 접혀 있습니다. '질문 보기'를 누르면 열립니다.", "X1 접기 안내 원문")
    c.expect(c.page.locator("#room-folds").evaluate("e => e.matches('p.small.muted') && e.nextElementSibling.id === 'room-tools'"), "X1 안내는 #room-tools 바로 앞")
    c.expect(c.page.eval_on_selector(".qdeck", "e => e.previousElementSibling.id === 'room-tools'"), "X1 qdeck 바로 앞은 도구 슬롯 유지")
    c.expect(c.page.evaluate("""() => [...document.querySelectorAll('.qfold-toggle')].every(b => {
      const who = document.getElementById(b.getAttribute('aria-describedby') || '');
      return !!who && who.matches('.qcard > .who') && who.parentElement === b.parentElement;
    })"""), "X1 접기 단추는 같은 카드의 질문 머리로 설명된다")
    _plain_cards_v3(c, "2023", qs)
    c.wait_saved(400)  # 면접실 진입 자체의 대기 저장을 끝낸 뒤 접기만 감시한다.
    before = c.ls(KEY)
    c.page.evaluate("""() => {
      window.__foldWrites23 = [];
      window.__foldSetItem23 = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (this === localStorage) window.__foldWrites23.push(key);
        return window.__foldSetItem23.call(this, key, value);
      };
    }""")
    try:
        for i in indices:
            card = c.page.locator(".qdeck .qcard").nth(i)
            c.eq(card.evaluate("e => Array.from(e.children).map(x => x.classList[0])"), ["who", "btn", "qfold-body"], f"X1 {i} 겉 카드 자식 순서")
            button, body = _fold_state_v3(c, i, False)
            c.expect(button.evaluate("e => e.matches('button.btn.small.qfold-toggle')"), f"X1 {i} 단추 클래스")
            rect = button.bounding_box()
            c.expect(rect is not None and rect["width"] >= 44 and rect["height"] >= 44, f"X1 {i} 누름 영역 44px 이상")
            ratio = c.contrast(f'.qdeck .qcard:nth-child({i+1}) .qfold-toggle')
            c.expect(ratio is not None and ratio >= 4.5, f"X1 {i} 접기 단추 글자 대비 4.5 이상")
            button.focus()  # macOS 포인터 초점 정책과 별개로 키보드 초점 유지도 확인한다.
            button.click()
            _fold_state_v3(c, i, True)
            c.expect(button.evaluate("e => e === document.activeElement"), f"X1 {i} 열고 단추 초점 유지")
            c.eq(body.locator(":scope > .q").text_content(), qs[i]["q"], f"X1 {i} 본문 질문 문장")
            c.eq(body.locator(f':scope > textarea[data-a="{i}"]').count(), 1, f"X1 {i} 본문 답변 칸")
            c.eq(body.locator(f':scope > .qx[data-qx="{i}"]').count(), 1, f"X1 {i} 본문 확장 슬롯")
            c.check(f"X1 {i} 펼친 본문")
            button.press("Enter")
            _fold_state_v3(c, i, False)
            c.expect(button.evaluate("e => e === document.activeElement"), f"X1 {i} 닫고 단추 초점 유지")
            c.wait_saved(400)
        c.eq(c.page.evaluate("window.__foldWrites23"), [], "X1 여닫기만으로 localStorage 저장하지 않음")
        c.eq(c.ls(KEY), before, "X1 여닫기 전후 저장 봉투 완전 동일")
    finally:
        c.page.evaluate("() => { Storage.prototype.setItem = window.__foldSetItem23; }")
    c.check("X1 모두 접힌 면접실")


def t_14_X1_fold_notes_and_legacy(c: Ctx):
    """X1: 메모·질문 400ms 저장, 재진입 규칙, 질문 기록 없는 옛 메모."""
    _seed(c, _game(EXAMPLE), phase="room")
    qs = _questions(c)
    indices = [i for i, q in enumerate(qs) if q["k"] in FOLD_KEYS]
    c.eq(len(indices), 3, "X1 메모 검사 대상 세 질문")
    for i in indices:
        button, body = _fold_state_v3(c, i, False)
        button.click()
        note = f'가상 메모 {i}: <b>비교</b> & "근거"'
        body.locator(f'textarea[data-a="{i}"]').fill(note)
        c.wait_saved(400)
        saved = c.ls(KEY) or {}
        c.eq(saved.get("answers", {}).get(str(i)), note, f"X1 {i} answers[i] 지연 저장")
        c.eq(saved.get("answerQ", {}).get(str(i)), qs[i]["q"], f"X1 {i} answerQ[i] 질문 저장")
        button.click()
    if len(indices) != 3:
        return  # 위 단언 실패를 남기며 불완전한 fixture로 후속 입력하지 않는다.
    empty = indices[-1]
    button, body = _fold_state_v3(c, empty, False)
    button.click()
    body.locator(f'textarea[data-a="{empty}"]').fill("")
    c.wait_saved(400)
    # 저장된 둘은 닫고 빈 카드는 열어 둔다. 재렌더 뒤 이 상태가 역전되어야 한다.
    c.page.reload()
    c.page.wait_for_selector(".qdeck .qcard")
    for i in indices:
        _, body = _fold_state_v3(c, i, i != empty)
        c.eq(body.locator(f'textarea[data-a="{i}"]').input_value(), "" if i == empty else f'가상 메모 {i}: <b>비교</b> & "근거"', f"X1 {i} 메모 복원·HTML 문자 보존")
        c.eq(body.locator("textarea b").count(), 0, f"X1 {i} 메모를 HTML 요소로 만들지 않음")
    # 안내의 N은 그리는 순간 닫혀 있는 접기 카드 수(메모 둘 → 1개).
    c.eq(c.page.locator("#room-folds").inner_text(), "가벼운 질문 1개는 처음에 접혀 있습니다. '질문 보기'를 누르면 열립니다.", "X1 메모 있는 카드를 뺀 접기 안내 수")
    c.check("X1 메모에 따라 다시 열린 카드")
    legacy = indices[0]
    c.goto("#home", wait=".home-grid")
    c.page.evaluate("() => { KCP.flush(); }")
    c.page.evaluate("""([key, game, i]) => localStorage.setItem(key, JSON.stringify({
      phase:'room', game, answers:{[i]:'가상 옛 메모: <b>보존</b> & 근거'}
    }))""", [KEY, _game(EXAMPLE), legacy])
    c.page.reload()
    c.page.wait_for_selector(".home-grid")
    c.goto("#y2023", wait=".qdeck .qcard")
    for i in indices:
        _fold_state_v3(c, i, i == legacy)
    c.eq(c.page.locator(f'textarea[data-a="{legacy}"]').input_value(), "가상 옛 메모: <b>보존</b> & 근거", "X1 질문 기록 없는 옛 메모도 처음부터 열림")
    c.expect(c.page.locator("#room-legacy").is_visible(), "X1 옛 메모 안내 유지")
    c.eq(c.page.locator("#room-folds").inner_text(), "가벼운 질문 2개는 처음에 접혀 있습니다. '질문 보기'를 누르면 열립니다.", "X1 옛 메모 카드를 뺀 접기 안내 수")
    c.check("X1 옛 메모 복원")
    # 세 카드 모두 메모가 있으면 닫힌 카드가 없으므로 안내도 없다.
    c.goto("#home", wait=".home-grid")
    c.page.evaluate("() => { KCP.flush(); }")
    c.page.evaluate("""([key, game, idx]) => localStorage.setItem(key, JSON.stringify({
      phase:'room', game, answers:Object.fromEntries(idx.map(i => [i, '가상 메모']))
    }))""", [KEY, _game(EXAMPLE), indices])
    c.page.reload()
    c.page.wait_for_selector(".home-grid")
    c.goto("#y2023", wait=".qdeck .qcard")
    c.eq(c.page.locator("#room-folds").count(), 0, "X1 모두 열린 처음 상태면 접기 안내 없음")
    c.eq(c.page.locator(".qfold").count(), 3, "X1 메모가 있어도 접기 카드 구조는 셋")


def t_15_X1_fold_extension_slots(c: Ctx):
    """X1: room:card 인자와 접힌 본문의 말해 보기·반문·힌트 실제 조작."""
    _seed(c, _game(EXAMPLE), phase="prep")
    c.page.evaluate("""() => {
      KCP.setSettings({think:0});
      window.__foldEvents23 = [];
      KCP.on('room:card', ({card, slot, q, i, key, year}) => {
        if (String(year) !== '2023') return;
        window.__foldEvents23.push({i, key, same: key === KCP.qkey(q),
          card: card === document.querySelectorAll('.qdeck .qcard')[i],
          slot: slot === card.querySelector('.qx[data-qx="'+i+'"]'),
          inside: !!slot && !!slot.closest('.qfold-body')});
      });
    }""")
    c.phase("room")
    c.page.wait_for_selector(".qdeck .qcard")
    qs = _questions(c)
    events = c.page.evaluate("window.__foldEvents23")
    c.eq(events, [dict(i=i, key=q["k"], same=True, card=True, slot=True, inside=q["k"] in FOLD_KEYS) for i, q in enumerate(qs)], "X1 24개 room:card 인자·본문 슬롯 연결")
    for i, q in enumerate(qs):
        if q["k"] not in FOLD_KEYS:
            continue
        button, body = _fold_state_v3(c, i, False)
        slot = body.locator(f'.qx[data-qx="{i}"]')
        c.eq(slot.locator(".speak-go").count(), 1, f"X1 {i} 숨긴 슬롯에도 말해 보기 생성")
        c.eq(slot.locator(f'[data-pb-open="{i}"]').count(), 1, f"X1 {i} 숨긴 슬롯에도 반문 생성")
        # X1 기존 힌트는 slot.after(.kh)로 붙는다. 슬롯 안으로 옮기는 마크업 변경은 요구하지 않는다.
        c.eq(body.locator(".kh-q").count(), 1, f"X1 {i} 숨긴 본문에도 힌트 생성")
        button.click()
        speak = slot.locator(".speak-go")
        speak.click()
        c.eq(speak.get_attribute("aria-pressed"), "true", f"X1 {i} 말해 보기 시작")
        speak.click()
        c.eq(speak.get_attribute("aria-pressed"), "false", f"X1 {i} 말해 보기 종료")
        slot.locator(f'[data-pb-open="{i}"]').click()
        c.expect(slot.locator(f"#pb-box-{i}").is_visible(), f"X1 {i} 반문 펼치기")
        slot.locator('[data-pb-stance="keep"]').click()
        slot.locator(f'[data-pb-why="{i}"]').fill("가상 반문 메모: 근거를 다시 비교한다.")
        body.locator(".kh-q").click()
        c.expect(body.locator(".kh-pop").is_visible(), f"X1 {i} 힌트 펼치기")
        body.locator('[data-kh-tab="sci"]').click()
        c.expect(body.locator(".kh-fact").count() > 0, f"X1 {i} 힌트 지식 카드 사용")
        c.check(f"X1 {i} 말해 보기·반문·힌트 확장")


def t_16_X2_sources_and_X1_other_games(c: Ctx):
    """X2 안내문·frame 조건과 X1 2022/창작 게임 카드 구조·출처 회귀."""
    # X2 문장 사이의 HTML 공백만 정규화한다. 문장 내용·순서·문장부호는 완전 일치.
    for plan, frame in ((EXAMPLE, True), ([], False)):
        _seed(c, _game(plan), phase="room")
        expected = " ".join([SOURCE_V3] + ([FRAME_SOURCE_V3] if frame else []) + [SOURCE_TAIL])
        c.eq(" ".join(c.page.locator(".room-sources").inner_text().split()), expected, f"X2 2023 frame={frame} 출처 문장")
        c.check(f"X2 2023 frame={frame} 안내")
    for year in ("2022", "s-shuttle-permit"):
        if year == "2022":
            c.goto("#y2022", wait="#grid")
        else:
            c.goto("#ys-shuttle-permit", wait="#sp-prep")
            c.page.fill("#sp-reason", "가상 판단: 정지 조건과 이동 수단을 비교한다.")
            c.page.click("#sp-lock")
            c.page.wait_for_selector("#sp-results")
        c.phase("room")
        c.page.wait_for_selector(".qdeck .qcard")
        qs = c.page.evaluate("year => KCP.games[year].questions(KCP.load(year))", year)
        c.expect(len(qs) > 0, f"X1 {year} 회귀 검사는 실제 질문이 있는 면접실")
        c.expect(all("fold" not in q for q in qs), f"X1 {year} 질문에 fold 없음")
        c.eq(c.page.locator(".qfold, #room-folds").count(), 0, f"X1 {year} 접기 카드·안내 없음")
        _plain_cards_v3(c, year, qs)
        expected = SOURCE_V3 + " " + SOURCE_TAIL if year == "2022" else ORIGINAL_SOURCE
        c.eq(" ".join(c.page.locator(".room-sources").inner_text().split()), expected, f"X2 {year} 출처 문장·frame 설명 없음")
        c.eq(c.page.locator(".qdeck .who .tag-official").filter(has_text="보고서 문항").count(), 2 if year == "2022" else 0, f"X2 {year} 보고서 문항 표지 회귀")
        c.eq(c.page.locator(".qdeck .who .tag-mine").filter(has_text="연습용 질문").count(), len(qs) - (2 if year == "2022" else 0), f"X2 {year} 연습용 질문 표지 회귀")
        c.check(f"X1/X2 {year} 기존 면접실")


def t_17_X3_hint_contract(c: Ctx):
    """X3: 24개 유형·sci 제목 순서·23-lost만 calc·23-q2만 시점 요령."""
    _seed(c, _game(EXAMPLE), phase="room")
    got = c.page.evaluate("""() => KCP.games['2023'].questions(KCP.load('2023')).map(q => {
      const key = KCP.qkey(q), hint = KCP.hintFor('2023', q, key);
      return {key, type:hint.type, sci:hint.sci.map(c => c.t), pts:hint.pts};
    })""")
    c.eq([h["key"] for h in got], list(HINT_V3), "X3 명세의 24개 키·순서")
    # X3 명세에 제목 원문이 없으므로 SCI에서 id→제목만 읽는 허용 예외.
    titles = c.page.evaluate("() => Object.fromEntries(Object.entries(KCP.HINT_SCI['2023']).map(([id,c]) => [id,c.t]))")
    required_ids = {card for _, ids in HINT_V3.values() for card in ids}
    c.expect(all(isinstance(titles.get(card), str) and titles[card] for card in required_ids), "X3 다섯 SCI id의 제목 존재")
    for hint in got:
        if hint["key"] not in HINT_V3:
            continue  # 키 목록 단언이 예상 밖 질문을 보고한다.
        type_, ids = HINT_V3[hint["key"]]
        c.eq(hint["type"], type_, f"X3 {hint['key']} 힌트 유형")
        c.eq(hint["sci"], [titles.get(card) for card in ids], f"X3 {hint['key']} sci 제목 목록·순서")
        timing = [p for p in hint["pts"] if "연차별로 고른 이유를 시점" in p]
        c.eq(len(timing), 1 if hint["key"] == "23-q2" else 0, f"X3 {hint['key']} 시점 요령은 q2에만")
    c.eq([h["key"] for h in got if h["type"] == "calc"], ["23-lost"], "X3 유실 질문만 계산형")
    c.check("X3 24개 질문 힌트")


if __name__ == "__main__":
    if "--oracle" in sys.argv:
        oracle_self_check()
    else:
        from harness import Ctx, main
        main(globals())
