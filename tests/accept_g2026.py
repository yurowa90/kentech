"""2026 D-76 독립 수용 검사와 2022·2023 머리말 회귀.

기준: B-2526.md 작업 3~5, DECISIONS D-76, AUDIT-2026 §5.2,
지시서 C. 점수 합계는 고정된 가상 입력을 Python에서 독립 계산한다.
성찰 예시의 선정 기술은 AUDIT-2026 §5.2에서 전사한다.
harness: 네 환경, problems: 출력, 콘솔 error/warning·pageerror·가로 넘침 0.
브라우저 실행은 총괄의 샌드박스 밖 로컬 환경에서만 한다.
"""

from harness import Ctx, main
from d76_helpers import reload_at, set_mode, touch_targets


KEY = "kcp:v1:2026"
TECHS = ("bb", "db", "ml", "wc")
CRITERIA = "fsegu"
# 가상 입력. 모두 다른 합계와 동점 최고를 만들어 강조 회귀를 검출한다.
SCORES = {"bb": (4, 4, 4, 4, 4), "db": (3, 3, 3, 3, 3),
          "ml": (2, 2, 2, 2, 2), "wc": (5, 5, 5, 5, 5)}
# AUDIT-2026 §5.2: 예시 1~4가 선택한 기술(학생 표의 합계 1위가 아님).
EXAMPLE_PICKS = ("울버린 켄텍카솔", "브레인부스트 듀오", "드림밴드", "AI 마음렌즈")


def assert_prep_table(c: Ctx, label: str):
    c.eq(c.page.locator("#score tr.best").count(), 0, f"B 작업 3 {label}: 준비실 최고 합계 행 강조 없음")
    c.eq(c.page.locator("#score th").last.inner_text(), "연습실 합계", f"B 작업 3 {label}: 연습실 합계 열 머리")
    c.expect("연습실 합계" in c.page.inner_text(".score-note26"), f"B 작업 3 {label}: 연습실 계산 안내")
    c.check(f"2026 {label}")


def t_B3_totals_without_best_highlight(c: Ctx):
    c.goto("#y2026", wait="#score select")
    assert_prep_table(c, "빈 표")
    for tech, scores in SCORES.items():
        for criterion, score in zip(CRITERIA, scores):
            c.page.select_option(f"#sc-{tech}-{criterion}", str(score))
        c.eq(c.page.locator(f'[data-tot="{tech}"]').inner_text(), f"연습실 합계 {sum(scores)}점", f"B 작업 3: {tech} 독립 합계")
        c.eq(c.page.locator("#score tr.best").count(), 0, f"B 작업 3: {tech} 채점 도중 강조 없음")
    assert_prep_table(c, "서로 다른 합계")
    # 합계 최고는 wc지만 학생이 ml을 고르면 추천을 자동 변경하지 않는다.
    c.page.locator('[data-pick="ml"]').click()
    for criterion in CRITERIA:
        c.page.select_option(f"#sc-bb-{criterion}", "5")
    assert_prep_table(c, "최고 합계 동점")
    c.wait_saved(400)
    c.eq((c.ls(KEY) or {}).get("game", {}).get("best"), "ml", "B 작업 3: 합계 최고와 달라도 학생 추천 유지")
    reload_at(c, "#score select", "prep")
    assert_prep_table(c, "새로고침")
    c.eq(c.page.locator('[data-tot="bb"]').inner_text(), "연습실 합계 25점", "B 작업 3: 채점 합계 저장·복원")
    touch_targets(c, "2026 채점·추천 뒤 준비실")


def t_B3_reflection_example_tables_unchanged(c: Ctx):
    c.goto("#y2026", wait="#go26")
    c.page.locator("#go26").click()
    c.page.wait_for_selector("#toReflect")
    c.page.locator("#toReflect").click()
    # 총괄 정정: 첫 details.reveal이 보이지 않는 자리에 있어 "보일 때까지" 기다리면 시간이 초과된다. 붙을 때까지만 기다린다.
    c.page.wait_for_selector("details.reveal table.scoretable", state="attached")
    # 예시는 "열기 전 한 줄" 관문(app.js #exwrap) 뒤에 있다. 교사 시연용 열기로 연다.
    c.page.locator("#skipEx").click()
    c.page.wait_for_selector("#exwrap details.reveal", state="visible")
    examples = c.page.locator("details.reveal").filter(has=c.page.locator("table.scoretable"))
    c.eq(examples.count(), 4, "B 작업 3 / AUDIT §5.2: 성찰 예시 표 네 개 유지")
    for i, name in enumerate(EXAMPLE_PICKS):
        example = examples.nth(i)
        example.locator("summary").click()
        c.expect(example.locator("table.scoretable").is_visible(), f"B 작업 3: 예시 {i + 1} 표 렌더링")
        c.eq(example.locator("tbody tr").count(), 4, f"B 작업 3: 예시 {i + 1} 후보 네 행 유지")
        c.eq(example.locator("tbody td").count(), 28, f"B 작업 3: 예시 {i + 1} 이름·점수 5칸·합계 유지")
        c.eq(example.locator("tr.best").count(), 1, f"B 작업 3: 예시 {i + 1} 선정 행 하나 표시")
        c.eq(example.locator("tr.best td.name").inner_text(), name, f"AUDIT §5.2: 예시 {i + 1} 선정 기술 유지")
        c.eq(example.locator("thead th").last.inner_text(), "합계", f"B 작업 3: 성찰 예시 원래 합계 제목 유지")
        c.check(f"2026 성찰 예시 {i + 1}")


def t_B4_room_header_without_question_examples(c: Ctx):
    c.goto("#y2026", wait="#go26")
    c.page.locator("#go26").click()
    c.page.wait_for_selector(".room-sources")
    header = c.page.inner_text(".room-tip") + c.page.inner_text(".room-sources")
    # 지시서 C 2(g2026-c)의 문자열 부재 계약. 구현의 부정문도 예외로 풀지 않는다.
    # 총괄 정정: 결함은 질문 예시를 '바탕으로 했다'는 잘못된 주장이다(AUDIT-2025 §3). "질문 예시가 없습니다"라는 부정문은 사실이므로 허용한다.
    c.expect("질문 예시를 바탕" not in header, "C g2026(c): 머리말이 질문 예시를 근거로 들지 않음")
    c.expect("질문 예시가 없" in header, "C g2026(c): 보고서에 질문 예시가 없다는 안내")
    c.expect("평가 기준" in header, "B 작업 4: 연습 질문이 기댄 평가 기준 설명")
    c.expect("15분" in header, "B 작업 4: 전체 답변 시간 안내")
    c.check("2026 면접실 머리말")


def t_B4_2022_2023_header_preserved(c: Ctx):
    # B-2526 작업 4: 새 필드가 없는 두 해는 기존 문구 일부 문자열을 그대로 유지.
    for year, ready in (("2022", "#grid"), ("2023", "[data-node]")):
        c.goto(f"#y{year}", wait=ready)
        c.phase("room")
        c.page.wait_for_selector(".room-sources")
        c.expect("질문을 소리 내어 읽고 1~3분 안에 말로 답해 보세요" in c.page.inner_text(".room-tip"), f"B 작업 4: {year} 기존 시간 머리말 유지")
        c.expect("일부는 보고서의 질문 예시를 바탕으로 했습니다" in c.page.inner_text(".room-sources"), f"B 작업 4: {year} 기존 출처 머리말 유지")
        c.expect("면접위원이 답을 들으며 후속 질문을 이어 갑니다" in c.page.inner_text(".room-sources"), f"B 작업 4: {year} 기존 면접 안내 유지")
        c.check(f"{year} 기존 면접실 머리말")


def t_B5_touch_targets(c: Ctx):
    c.goto("#y2026", wait="#score select")
    for mode in ("real", "ext"):
        if mode == "ext":
            set_mode(c, mode)
        for tab in TECHS + ("crit",):
            c.page.locator(f'[data-tab="{tab}"]').click()
            touch_targets(c, f"2026 {mode} 자료 {tab}")
    c.page.select_option("#sc-wc-u", "5")
    touch_targets(c, "2026 점수 선택 후")


def t_T1_tabs_a11y(c: Ctx):
    # tabs/impl.md 명세 1·2: 홍보자료·기준표 탭 → #bro, 기존 G.tab 저장 계약.
    from tabs_helpers import tabs_a11y
    # tabs/minor-impl.md §1·2·검사 지시: 기술 네 탭·평가 기준표 모두 빈 #bro 진입 검사.
    tabs_a11y(c, "2026", "#bro", "tab", "data-tab", group_label="기술 홍보자료와 기준표")


if __name__ == "__main__":
    main(globals(), strict_errors=True)
