"""2024 D-76 독립 수용 검사.

기준: A-2024.md 작업 1~5, B-2526.md 작업 4~5,
DECISIONS D-76, AUDIT-2024 §2·§3-1·§5.1~5.5 및 지시서 C.
지형 기대값은 AUDIT §4-3의 예시 계획에서 전사한다. 구현은 셀렉터와
저장 봉투 확인에만 사용한다. 새로고침 비교의 기준은 준비실 장면을 기록하되,
독립 지형 개수와 먼저 대조해 양쪽이 같은 잘못된 값을 보이는 경우도 잡는다.
harness: 네 환경, problems: 출력, 콘솔 error/warning·pageerror·가로 넘침 0.
브라우저 실행은 총괄의 샌드박스 밖 로컬 환경에서만 한다.
"""

import re

from harness import Ctx, main
from d76_helpers import reload_at, set_mode, touch_targets


KEY = "kcp:v1:2024"
SCENE = "#v2-stage .v2-stage-canvas"
# AUDIT-2024 §4-3: 숲 4·갯벌 1·초원 1·호수 1, 서로 붙은 7칸.
MIXED = ("5-4", "5-5", "5-6", "5-7", "5-8", "6-7", "6-6")
MIXED_COUNTS = {"호수": 1, "숲": 4, "초원": 1, "갯벌": 1}
# C 작업 2(a): 오른쪽 끝 초원 칸만 고른 계획으로 옛 9×11 지도 사본을 검출.
# 칸 ID는 화면 선택자이며 지형은 독립 시나리오 '초원 7칸'을 기대한다.
RIGHT = tuple(f"6-{col}" for col in range(8, 15))


def choose_plan(c: Ctx, cells=MIXED):
    c.goto("#y2024", wait="#map polygon[data-hex]")
    c.eq(c.page.locator("#map polygon[data-hex]").count(), 133, "A 작업 1 / AUDIT §2: 지도 133칸")
    for cell in cells:
        c.page.locator(f'#map polygon[data-hex="{cell}"]').click()
    c.eq(c.page.inner_text("#tcount").strip(), "7 / 7칸", "A 작업 1: 연결된 정착지 7칸 선택")
    c.page.locator('[data-inc="eng"]').click()
    c.page.locator('[data-toggle="medP"]').click()
    c.expect(c.page.inner_text("#icount").startswith("2 /"), "A 작업 1: 아이템도 선택")
    c.page.locator("#sim").click()
    c.expect(bool(c.page.inner_text("#log").strip()), "D-76 시뮬레이션 기록 문장 있음")
    c.page.locator("#lock").click()
    c.page.wait_for_selector("#unlock")
    c.wait_saved(400)
    state = c.ls(KEY) or {}
    c.eq(set(state.get("game", {}).get("sel", [])), set(cells), "A 작업 1: 선택한 칸이 저장됨")
    # 저장 형식 변경은 명세 범위 밖이다. 기존 확정 스냅샷의 존재를 검사한다.
    c.expect(bool(state.get("game", {}).get("locked")), "A 작업 1: 탐사계획 확정 저장")
    touch_targets(c, "2024 확정 준비실")


def scene_counts(c: Ctx, expected: dict, label: str):
    c.page.wait_for_selector(SCENE)
    # 장면은 화면 밖에서 RAF를 멈춘다. 준비실 조작으로 아래까지 스크롤한 뒤
    # 장면을 다시 보이게 하고 그리기만 기다린다(기대 지형이 맞을 때까지 기다리지 않음).
    c.page.locator(SCENE).scroll_into_view_if_needed()
    c.page.wait_for_function("s => (document.querySelector(s)?.getAttribute('aria-label') || '').startsWith('정착 기지 장면.')", arg=SCENE)
    c.page.wait_for_timeout(120)
    caption = c.page.locator(SCENE).get_attribute("aria-label") or ""
    pairs = re.findall(r"(용암|호수|갯벌|사막|숲|초원)\s+(\d+)", caption)
    counts = {name: int(n) for name, n in pairs}
    c.eq(len(pairs), len(counts), f"A 작업 1 {label}: 지형 요약 중복 없음")
    c.eq(counts, expected, f"A 작업 1 {label}: 독립 계획의 지형별 개수 ({caption})")
    c.expect("고른 정착지 7칸" in caption, f"A 작업 1 {label}: 정착지 7칸, 0칸 아님")
    c.expect(not c.page.locator("#v2-stage.v2-stage-broken").count(), f"A 작업 1 {label}: 장면 그리기 오류 없음")
    c.check(f"2024 {label}")
    return counts


def refresh_phases(c: Ctx, expected: dict, label: str):
    before = scene_counts(c, expected, f"{label} 준비실")
    c.page.locator("#go24").click()
    c.page.wait_for_selector(".qdeck .qcard")
    c.eq(scene_counts(c, expected, f"{label} 면접실"), before, "A 작업 1: 면접실 이동 뒤 지형 유지")
    reload_at(c, ".qdeck .qcard", "room")
    c.eq(scene_counts(c, expected, f"{label} 면접실 새로고침"), before, "A 작업 1: 면접실 새로고침 뒤 같은 지형 수")
    c.page.locator("#toReflect").click()
    c.page.wait_for_selector("table.rubric")
    c.eq(scene_counts(c, expected, f"{label} 성찰"), before, "A 작업 1: 성찰 이동 뒤 지형 유지")
    reload_at(c, "table.rubric", "reflect")
    c.eq(scene_counts(c, expected, f"{label} 성찰 새로고침"), before, "A 작업 1: 성찰 새로고침 뒤 같은 지형 수")


def t_A1_mixed_terrain_reload(c: Ctx):
    choose_plan(c)
    refresh_phases(c, MIXED_COUNTS, "혼합 지형")


def t_A1_right_edge_reload(c: Ctx):
    choose_plan(c, RIGHT)
    refresh_phases(c, {"초원": 7}, "오른쪽 끝 초원")


def t_A2_individual_sources_and_common4(c: Ctx):
    choose_plan(c)
    c.page.locator("#go24").click()
    c.page.wait_for_selector(".qdeck .qcard")
    cards = c.page.locator(".qdeck .qcard")
    c.eq(cards.count(), 8, "AUDIT §3-1: 확정 후 공통 6·개별 2 문항")
    c.eq(cards.locator(".who .tag-official").filter(has_text="보고서 문항").count(), 8, "AUDIT §3-1: 여덟 문항 모두 보고서 출처")
    for i in (6, 7):
        who = cards.nth(i).locator(".who")
        c.eq(who.locator(".tag-official").inner_text(), "보고서 문항", f"A 작업 2: 개별 {i + 1}번 보고서 문항")
        c.eq(who.locator(".tag-mine").inner_text(), "내 계획으로 채움", f"A 작업 2: 개별 {i + 1}번 내 계획 대입")
        c.expect("연습용 질문" not in who.inner_text(), f"A 작업 2: 개별 {i + 1}번 연습용 질문 표기 없음")
    c.eq(cards.nth(3).locator(".rec").inner_text(), "권장 답변 시간: 약 2~4분", "AUDIT §2: 공통 4 권장 시간 약 2~4분")
    c.check("2024 개별 출처·공통 4 시간")


def t_A4_attribute_mode_and_persistence(c: Ctx):
    c.goto("#y2024", wait="#gauges")
    c.eq(c.page.evaluate("KCP.settings().timeMode"), "real", "D-76 기본 실전 모드")
    c.eq(c.page.locator("#gauges .gauge").count(), 0, "D-76 실전 최초 막대 0개")
    c.eq(c.page.locator("#attr24-on").count(), 0, "A 작업 4: 실전 켜기 단추 없음")
    choose_plan(c)
    c.eq(c.page.locator("#gauges .gauge").count(), 0, "D-76 시뮬레이션·확정 뒤에도 실전 막대 0개")
    log = c.page.inner_text("#log")
    runs = c.page.inner_text("#runs")
    energy = c.page.inner_text("#energy")
    set_mode(c, "ext")
    toggle = c.page.locator("#attr24-on")
    c.expect(toggle.is_visible(), "A 작업 4: 연장 1.5배에서 속성 막대 켜기 단추 표시")
    c.eq(toggle.get_attribute("aria-pressed"), "false", "A 작업 4: 연습 막대 기본 꺼짐")
    c.eq(c.page.locator("#gauges .gauge").count(), 0, "A 작업 4: 연습 기본 막대 0개")
    toggle.click()
    c.eq(toggle.get_attribute("aria-pressed"), "true", "A 작업 4: 켠 상태 접근성 표시")
    c.eq(c.page.locator("#gauges .gauge").count(), 6, "A 작업 4: 학생이 켜면 막대 6개")
    touch_targets(c, "2024 연습 막대 켬")
    c.wait_saved(400)
    c.eq((c.ls(KEY) or {}).get("game", {}).get("attrOn"), True, "A 작업 4: 켬 상태 저장")
    reload_at(c, "#attr24-on", "prep")
    c.eq(toggle.get_attribute("aria-pressed"), "true", "A 작업 4: 새로고침 뒤 켬 유지")
    c.eq(c.page.locator("#gauges .gauge").count(), 6, "A 작업 4: 새로고침 뒤 막대 6개")
    for selector, text in (("#log", log), ("#runs", runs), ("#energy", energy)):
        c.eq(c.page.inner_text(selector), text, f"A 작업 4: 토글·새로고침 뒤 {selector} 기록 유지")
    set_mode(c, "real")
    c.eq(c.page.locator("#gauges .gauge").count(), 0, "D-76 켠 뒤에도 실전 전환 즉시 막대 0개")
    set_mode(c, "ext")
    c.eq(c.page.locator("#gauges .gauge").count(), 6, "A 작업 4: 연습 복귀 뒤 저장 선호 복원")
    c.page.locator("#attr24-on").click()
    c.eq(c.page.locator("#gauges .gauge").count(), 0, "A 작업 4: 다시 끄기 가능")
    c.check("2024 속성 막대 모드·저장")


def t_B4_recorded_room_header(c: Ctx):
    choose_plan(c)
    c.page.locator("#go24").click()
    c.page.wait_for_selector(".room-sources")
    tip = c.page.inner_text(".room-tip")
    sources = c.page.inner_text(".room-sources")
    c.expect("녹화" in sources, "B 작업 4 / AUDIT §5.1: 녹화 평가 안내")
    c.expect("후속 질문을 이어 갑니다" not in sources + tip, "B 작업 4: 2024 실시간 후속 질문 안내 없음")
    c.expect("약 2~4분" in tip and "25분" in tip, "B 작업 4: 문항 권장 시간과 전체 답변 시간")
    c.expect("내 계획으로 채움" in sources, "B 작업 4: 내 계획 대입 출처 설명")
    c.check("2024 녹화 면접 안내")


def t_A1_home_preview_no_error(c: Ctx):
    # 첫 로드와 저장 계획이 있는 홈 모두 root 없는 미리보기 경로를 실행한다.
    for label in ("빈 저장", "오른쪽 끝 저장"):
        if label == "오른쪽 끝 저장":
            choose_plan(c, RIGHT)
        c.goto("#home", wait='[data-v2-game="2024"] canvas.v2-thumb')
        c.page.wait_for_timeout(400)
        canvas = c.page.locator('[data-v2-game="2024"] canvas.v2-thumb')
        c.expect(canvas.is_visible(), f"A 작업 1: {label} 홈 2024 미리보기 표시")
        c.expect(canvas.evaluate("el => el.width > 0 && el.height > 0"), f"A 작업 1: {label} 미리보기 캔버스 크기")
        c.eq(c.page.evaluate("() => KCP.v2?.lastError ? String(KCP.v2.lastError) : null"), None, f"A 작업 1: {label} KCP.v2.lastError 없음")
        c.check(f"2024 홈 미리보기 {label}")


def t_B5_touch_targets(c: Ctx):
    c.goto("#y2024", wait="#items")
    touch_targets(c, "2024 실전 빈 준비실")
    set_mode(c, "ext")
    touch_targets(c, "2024 연습 빈 준비실")
    c.page.locator('[data-inc="eng"]').click()
    c.page.locator('[data-toggle="medP"]').click()
    c.page.locator("#attr24-on").click()
    touch_targets(c, "2024 아이템·막대 조작 뒤")


if __name__ == "__main__":
    main(globals(), strict_errors=True)
