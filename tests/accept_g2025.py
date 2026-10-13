"""2025 D-76 독립 수용 검사.

기준: B-2526.md 작업 1·2·4·5, DECISIONS D-76,
AUDIT-2025 §2·§3·§5.1·§5.3 및 지시서 C.
기사의 두 기대 문자열과 키보드 계약은 명세에서 가져온다. 배치 검사는
Tab·Enter·Space만 사용하며 click/focus/evaluate로 입력·초점을 대신하지 않는다.
harness: 네 환경, problems: 출력, 콘솔 error/warning·pageerror·가로 넘침 0.
브라우저 실행은 총괄의 샌드박스 밖 로컬 환경에서만 한다.
"""

from harness import Ctx, main
from d76_helpers import focus_remains, reload_at, set_mode, tab_to, touch_targets


KEY = "kcp:v1:2025"
PAPERS = ("red", "blue", "green", "black")
SYMBOLS = {"red": "■", "blue": "●", "green": "▲", "black": "◆"}


def saved_order(c: Ctx):
    c.wait_saved(400)
    return (c.ls(KEY) or {}).get("game", {}).get("order")


def keyboard_activate(c: Ctx, selector: str, key: str):
    if not tab_to(c, selector):
        return False
    c.page.keyboard.press(key)
    focus_remains(c, f"{selector} {key}")
    return True


def t_A1_article_transcription(c: Ctx):
    c.goto("#y2025", wait="#paper")
    c.page.locator('[data-tab="blue"]').click()
    blue = c.page.inner_text("#paper")
    c.expect("또 하나의 인격체로서" in blue, "AUDIT §2: AI 기사 원문의 '또' 보존")
    c.check("2025 AI 기사 원문")
    c.page.locator('[data-tab="green"]').click()
    green = c.page.inner_text("#paper")
    c.expect("전문가들 사이에 한정적인" in green, "AUDIT §2: AI 교사 기사 원문의 조사 보존")
    c.expect("사이에서 한정적인" not in green, "AUDIT §2: 전사 오류 '사이에서' 없음")
    c.check("2025 AI 교사 기사 원문")


def t_B1_keyboard_order_remove_and_move(c: Ctx):
    c.goto("#y2025", wait="#slots [data-slot]")
    c.eq(c.page.locator("#slots [data-slot]").count(), 4, "B 작업 1: 순서 칸 네 개")
    c.eq(c.page.evaluate("KCP.settings().timeMode"), "real", "B 작업 1: 실전에서도 키보드 배치 가능")
    # AUDIT §5.3: 마우스·강제 focus 없이 실제 Tab과 기본 활성화 키만 사용.
    for slot, paper in enumerate(PAPERS):
        target = f'#slots [data-slot="{slot}"]'
        name = c.page.locator(target).get_attribute("aria-label") or ""
        # 총괄 정정: 칸 이름을 장면의 "N번 칸"과 맞췄다(독립 검토 minor 5).
        c.expect(f"{slot + 1}번 칸" in name and "비어 있음" in name,
                 f"B 작업 1: 빈 {slot + 1}번 칸의 접근 가능한 이름")
        select = f'#tray [data-sel="{paper}"]'
        if not keyboard_activate(c, select, "Enter" if slot % 2 == 0 else "Space"):
            return
        focus_remains(c, "신문 선택 뒤", select)
        c.eq(c.page.locator(select).get_attribute("aria-pressed"), "true", f"B 작업 1: {paper} 신문 선택 상태")
        if not keyboard_activate(c, target, "Space" if slot % 2 == 0 else "Enter"):
            return
        focus_remains(c, "신문 배치 뒤", target)
        name = c.page.locator(target).get_attribute("aria-label") or ""
        c.expect(f"{slot + 1}번 칸" in name and f"신문 {SYMBOLS[paper]}" in name,
                 f"B 작업 1: 채운 {slot + 1}번 칸의 접근 가능한 이름")
        c.eq(saved_order(c), list(PAPERS[:slot + 1]) + [None] * (3 - slot), f"B 작업 1: {slot + 1}번 배치 저장값")
        c.check(f"2025 키보드 {slot + 1}칸 배치")
    c.eq(saved_order(c), list(PAPERS), "AUDIT §5.3: 키보드로 신문 넷을 칸 넷에 저장")

    if not keyboard_activate(c, '#slots [data-slot="1"]', "Enter"):
        return
    focus_remains(c, "채운 칸 Enter로 빼기 뒤", '#slots [data-slot="1"]')
    c.eq(saved_order(c), ["red", None, "green", "black"], "B 작업 1: 채운 칸 Enter로 신문 빼기")
    for selector in ('#tray [data-sel="blue"]', '#slots [data-slot="1"]'):
        if not keyboard_activate(c, selector, "Space"):
            return
    c.eq(saved_order(c), list(PAPERS), "B 작업 1: Space로 신문 재배치")
    if not keyboard_activate(c, '#slots [data-down="0"]', "Enter"):
        return
    c.eq(saved_order(c), ["blue", "red", "green", "black"], "B 작업 1: ↓ Enter로 이웃 순서 교환")
    if not keyboard_activate(c, '#slots [data-up="1"]', "Space"):
        return
    c.eq(saved_order(c), list(PAPERS), "B 작업 1: ↑ Space로 첫 칸까지 이동")
    if not keyboard_activate(c, '#slots [data-down="2"]', "Space"):
        return
    c.eq(saved_order(c), ["red", "blue", "black", "green"], "B 작업 1: ↓ Space로 마지막 칸까지 이동")
    c.check("2025 키보드 빼기·↑↓ 초점")
    # 새로고침도 조작 뒤 저장된 순서를 그대로 보여야 한다.
    reload_at(c, "#slots [data-slot]", "prep")
    c.eq(saved_order(c), ["red", "blue", "black", "green"], "B 작업 1: 키보드 배치 새로고침 유지")
    touch_targets(c, "2025 키보드로 네 칸 채운 준비실")


def t_B2_clues_real_and_practice(c: Ctx):
    c.goto("#y2025", wait="#clues25")
    c.eq(c.page.evaluate("KCP.settings().timeMode"), "real", "D-76 단서 검사 기본 실전 모드")
    for paper in PAPERS:
        c.page.locator(f'[data-tab="{paper}"]').click()
        c.eq(c.page.locator("[data-fact]").count(), 0, f"B 작업 2: 실전 {paper} 단서 카드 단추 0개")
        c.eq(c.page.locator("#facts-toggle25").count(), 0, f"B 작업 2: 실전 {paper} 단서 켜기 단추 없음")
        touch_targets(c, f"2025 실전 {paper}")
    set_mode(c, "ext")
    toggle = c.page.locator("#facts-toggle25")
    c.expect(toggle.is_visible(), "B 작업 2: 연습에서 단서 토글 표시")
    c.eq(toggle.get_attribute("aria-pressed"), "true", "B 작업 2: 연습 단서 기본 펼침")
    for paper in PAPERS:
        c.page.locator(f'[data-tab="{paper}"]').click()
        c.expect(c.page.locator("#facts [data-fact]").count() > 0, f"B 작업 2: 연습 {paper} 단서 존재")
        c.expect(c.page.locator("#facts").is_visible(), f"B 작업 2: 연습 {paper} 단서 영역 표시")
        touch_targets(c, f"2025 연습 {paper} 단서 펼침")
    toggle.click()
    c.eq(toggle.get_attribute("aria-pressed"), "false", "B 작업 2: 단서 접기 상태 표시")
    c.expect(c.page.locator("#facts").is_hidden(), "B 작업 2: 접힌 단서 숨김")
    c.eq(c.page.locator("[data-fact]").count(), 0, "B 작업 2: 접으면 단서 단추 0개")
    focus_remains(c, "단서 접기 뒤", "#facts-toggle25")
    reload_at(c, "#facts-toggle25", "prep")
    c.eq(toggle.get_attribute("aria-pressed"), "false", "B 작업 2: 새로고침 뒤 접기 선호 유지")
    toggle.click()
    c.expect(c.page.locator("#facts [data-fact]").count() > 0, "B 작업 2: 단서를 다시 펼칠 수 있음")
    set_mode(c, "real")
    c.eq(c.page.locator("[data-fact]").count(), 0, "D-76 실전 복귀 즉시 단서 단추 0개")
    c.check("2025 단서 접기·모드·저장")


def t_B4_room_header_without_question_examples(c: Ctx):
    c.goto("#y2025", wait="#go25")
    c.page.locator("#go25").click()
    c.page.wait_for_selector(".room-sources")
    header = c.page.inner_text(".room-tip") + c.page.inner_text(".room-sources")
    # 지시서 C 2(g2025-d)의 문자열 부재 계약. 구현에 맞춰 부정문도 허용하지 않는다.
    # 총괄 정정: 결함은 질문 예시를 '바탕으로 했다'는 잘못된 주장이다(AUDIT-2025 §3). "질문 예시가 없습니다"라는 부정문은 사실이므로 허용한다.
    c.expect("질문 예시를 바탕" not in header, "C g2025(d) / AUDIT §3: 머리말이 질문 예시를 근거로 들지 않음")
    c.expect("질문 예시가 없" in header, "C g2025(d) / AUDIT §3: 보고서에 질문 예시가 없다는 안내")
    c.expect("평가 기준" in header, "B 작업 4: 연습 질문이 기댄 평가 기준 설명")
    c.expect("15분" in header, "B 작업 4: 전체 답변 시간 안내")
    c.check("2025 면접실 머리말")


if __name__ == "__main__":
    main(globals(), strict_errors=True)
