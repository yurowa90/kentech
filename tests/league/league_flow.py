"""U5 로비·자리 선택의 공용 브라우저 조작. 엔진 API로 참가를 우회하지 않는다."""

import re

from playwright.sync_api import expect


def select_mode(page, mode):
    """숨겨진 설정을 조작하기 전에 상단 HUD에서 해당 모드를 연다."""
    tab = page.locator(f'.lg-modes [data-mode="{mode}"]')
    expect(tab).to_be_visible()
    tab.click()
    expect(tab).to_have_attribute("aria-pressed", "true")
    panel = "#lg-solo" if mode == "solo" else f"#lg-mode-{mode}"
    expect(page.locator(panel)).to_be_visible()


def confirm_seat(page, city_id, timeout=15000):
    """도시 선택은 미리보기이며, 확정 뒤에만 고른 도시의 팀 화면으로 간다."""
    seat = page.locator(f'[data-seat="{city_id}"]')
    expect(seat).to_be_enabled(timeout=timeout)
    confirm = page.locator("#lg-seat-confirm")
    expect(confirm).to_be_disabled()
    name = seat.locator("b").inner_text().strip()
    seat.click()
    expect(seat).to_have_attribute("aria-pressed", "true")
    expect(page.locator("#lg-seat-info").get_by_role("heading", name=name, exact=True)).to_be_visible()
    expect(confirm).to_be_enabled()
    expect(confirm).to_contain_text(name)
    expect(page.locator("#lg-bar")).to_have_count(0)
    confirm.click()
    expect(page.locator("#lg-bar")).to_be_visible(timeout=timeout)
    expect(page.locator("#lg-bar .lg-bteam")).to_have_text(name)


def start_solo(page, months=12):
    """HUD → 기간 선택 → 시작. 숨겨진 select나 기본값에 의존하지 않는다."""
    select_mode(page, "solo")
    length = page.locator(f'[data-select="lg-solo-turns"][data-value="{months}"]')
    length.click()
    expect(length).to_have_attribute("aria-pressed", "true")
    page.locator("#lg-solo-start").click()
    expect(page).to_have_url(re.compile(r".*#league/solo$"))
    expect(page.locator("#lg-bar")).to_be_visible(timeout=15000)


def pass_issue_check(page):
    """품질8 UX U3(docs/QUALITY-ux.md 6절): 설비가 전선에 안 닿았거나 이번 달 돌 설비가 없으면
    준비를 누를 때 확인 카드(#lg-issue-check)가 달마다 한 번 먼저 뜬다. 기존 검사의 준비 흐름은
    '그대로 진행'(#lg-issue-go)으로 이어 간다. 카드는 클릭과 같은 틱에 그려지므로 기다리지 않는다."""
    card = page.locator("#lg-issue-check")
    if card.count() and card.first.is_visible():
        page.locator("#lg-issue-go").click()
        page.wait_for_timeout(150)
        return True
    return False
