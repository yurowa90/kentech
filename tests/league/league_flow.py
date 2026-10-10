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
