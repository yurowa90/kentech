"""T1 판단 노트 수용 검사. 구현을 보지 않고 지시서·계약을 옮긴다.

각 t_ 함수는 harness가 제공하는 빈 저장소의 새 컨텍스트에서 실행된다.
F1은 KCP_BASE에서 받은 JS를 node --check의 표준 입력으로 검사한다.
F2는 지정된 rg 패턴과 추가된 선택자 접두어·줄 배치 규칙을 검사한다.
F5는 baseline.py의 흐름을 이 harness에 옮기고 자기 평가 문구·기출 카드 범위를
통합 계약에 맞췄다. 대기는 조건 기반으로 바꾸며 작성 시 브라우저는 실행하지 않는다.
"""

import re
import subprocess

from harness import Ctx, main


EMPTY_SUM = "자료를 훑은 뒤 기준과 무게를 적습니다."
PLAIN_CRIT = "제가 판단 기준으로 삼은 것은 효율, 비용입니다."
WEIGHTED_CRIT = "제가 판단 기준으로 삼은 것은 효율, 비용이고, 효율을 가장 무겁게 두었습니다."
TRADE = "풍력은 환경 면에서 유리하지만 공급 안정 면에서는 불리합니다."
SUMMARY = "기준: 효율(높음), 비용(중간)"
YEARS = ("2022", "2023", "2024", "2025", "2026")


def _prep(c, year="2022", opened=False):
    c.goto("#y" + year, wait="#jn-panel")
    c.page.locator("#jn-toggle").wait_for(state="visible")
    if opened and c.page.locator("#jn-toggle").get_attribute("aria-expanded") != "true":
        c.page.locator("#jn-toggle").click()
    if opened:
        c.page.locator("#jn-body").wait_for(state="visible")
    c.check(year + "/판단 노트 준비실")


def _phase(c, phase):
    c.phase(phase)
    selectors = {"prep": "#jn-panel", "room": "#jn-side", "reflect": "#copyAll"}
    c.page.wait_for_selector(selectors[phase])
    c.check("판단 노트/" + phase)


def _text(c, sel):
    return c.page.locator(sel).inner_text().strip()


def _pair(c):
    c.page.locator('[data-jchip="0"]').click()
    c.page.locator('[data-jchip="1"]').click()


def _weighted(c):
    _pair(c)
    c.page.locator('[data-jw="0"][data-jwv="3"]').click()
    c.page.locator('[data-jw="1"][data-jwv="2"]').click()


def _trade(c):
    c.page.locator("#jn-pick").fill("풍력")
    c.page.locator("#jn-gain").fill("환경")
    c.page.locator("#jn-cost").fill("공급 안정")


def _filled(c, marker=False):
    _prep(c, opened=True)
    if marker:
        c.page.locator("#jn-c0").evaluate("el => { el.__t = 1; }")
    _weighted(c)
    _trade(c)


def _buttons(c, row):
    return c.page.locator(f'[data-jw="{row}"]').evaluate_all(
        "els => els.map(el => ({pressed: el.getAttribute('aria-pressed'), disabled: el.disabled}))"
    )


def _stored_jn(c, year="2022"):
    c.wait_saved(400)
    state = c.ls("kcp:v1:" + year)
    return (state or {}).get("ext", {}).get("jn", {})


def _before_body(c):
    return c.page.evaluate("""() => {
        const panel = document.querySelector('#jn-panel');
        const top = document.querySelector('#prep-top');
        const body = document.querySelector('#prep-body');
        return !!(panel && top && body && top.contains(panel) &&
            (top.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING));
    }""")


def _inject(c, key, value):
    # 대기 저장이 손상값을 덮지 않게 공통 지시의 순서를 지킨다.
    c.goto("#home", wait=".home-grid")
    c.page.evaluate("KCP.flush && KCP.flush()")
    c.page.evaluate("([key, value]) => localStorage.setItem(key, JSON.stringify(value))", [key, value])
    c.page.reload()
    c.page.wait_for_selector(".home-grid")
    c.check("손상값 주입 뒤 홈")


def _clipboard(c):
    c.page.evaluate("""() => {
        window.__clip = null;
        Object.defineProperty(navigator, 'clipboard', {
            value: {writeText: t => { window.__clip = t; return Promise.resolve(); }},
            configurable: true
        });
    }""")


def _copy(c):
    _clipboard(c)
    c.page.locator("#copyAll").click()
    c.page.wait_for_function("typeof window.__clip === 'string'")
    return c.page.evaluate("window.__clip")


def _goal(c, acknowledged=False):
    _prep(c)
    _phase(c, "reflect")
    c.page.locator("#nextstep-2022").fill("결론을 먼저 말한다")
    c.wait_saved(400)
    _prep(c, "2023")
    c.page.locator("#jn-goalack").wait_for(state="visible")
    if acknowledged:
        c.page.locator("#jn-goalack").check()


def _source(c, path):
    return c.page.evaluate("""async path => {
        const response = await fetch(new URL(path, location.href), {cache: 'no-store'});
        if (!response.ok) throw new Error('검사 대상 파일 응답 실패: ' + response.status);
        return await response.text();
    }""", path)


def t_A1_initial_panel(c: Ctx):
    _prep(c)
    c.eq(c.page.locator("#jn-panel").count(), 1, "A1 판단 노트는 하나다")
    c.expect(_before_body(c), "A1 판단 노트는 준비실 상단 슬롯 안에서 과제 본문보다 앞에 있다")
    c.eq(c.page.locator("#jn-toggle").get_attribute("aria-expanded"), "false", "A1 처음에는 접힌 상태다")
    c.eq(_text(c, "#jn-toggle"), "펼치기", "A1 토글 글은 펼치기다")
    for sel in ("#jn-body", "#jn-c0"):
        c.expect(c.page.locator(sel).is_hidden(), "A1 본문과 기준 입력은 숨겨져 있다")
    c.expect(c.page.locator("#jn-goal").is_visible(), "A1 지난 목표는 접혀 있어도 보인다")
    c.expect("지난 목표 없음" in _text(c, "#jn-goal"), "A1 빈 저장소에는 지난 목표 없음 안내가 있다")
    c.eq(c.page.locator("#jn-goalack").count(), 0, "A1 지난 목표가 없으면 확인 체크박스를 만들지 않는다")
    c.eq(_text(c, "#jn-sum"), EMPTY_SUM, "A1 빈 기준 요약을 표시한다")
    c.eq(c.page.locator("#jn-side").count(), 0, "A1 준비실에는 면접실 패널이 없다")


def t_A2_expand_defaults(c: Ctx):
    _prep(c, opened=True)
    c.eq(c.page.locator("#jn-toggle").get_attribute("aria-expanded"), "true", "A2 펼친 토글의 접근성 상태가 맞다")
    c.eq(_text(c, "#jn-toggle"), "접기", "A2 펼치면 토글 글은 접기다")
    c.expect(c.page.locator("#jn-body").is_visible(), "A2 펼친 본문이 보인다")
    c.eq(_text(c, ".jn-chips .tag-mine"), "연습용 기준 예시", "A2 2022 칩은 연습용 기준 예시다")
    c.eq(c.page.locator(".jn-chips .tag-official").count(), 0, "A2 2022 칩에는 공식 태그가 없다")
    c.eq(c.page.locator(".jn-chips [data-jchip]").all_text_contents(),
         c.page.evaluate('KCP.CRIT_CHIPS_BY_YEAR["2022"].chips'), "A2 칩 목록은 2022 계약 데이터와 같다")
    c.eq(c.page.locator("#jn-panel [data-jw]").count(), 9, "A2 세 기준의 무게 버튼은 아홉 개다")
    for row in range(3):
        c.eq(_buttons(c, row), [{"pressed": "false", "disabled": True}] * 3, "A2 빈 기준은 모두 미정이고 무게 버튼이 비활성이다")
    c.expect(c.page.locator("#jn-cnote").is_hidden(), "A2 빈 기준에는 무게 안내를 숨긴다")


def t_A3_chips_duplicate(c: Ctx):
    _prep(c, opened=True)
    c.page.locator("#jn-c0").evaluate("el => { el.__t = 1; }")
    _pair(c)
    c.eq(c.page.locator("#jn-c0").input_value(), "효율", "A3 첫 칩은 첫 빈 기준에 들어간다")
    c.eq(c.page.locator("#jn-c1").input_value(), "비용", "A3 둘째 칩은 다음 빈 기준에 들어간다")
    c.page.locator('[data-jchip="0"]').click()
    c.page.wait_for_selector(".toast")
    c.expect("이미 넣은 기준입니다." in _text(c, ".toast"), "A3 중복 기준 안내를 표시한다")
    c.eq(c.page.locator("#jn-c2").input_value(), "", "A3 중복 기준으로 빈 칸을 채우지 않는다")
    for row in (0, 1):
        c.expect(all(not b["disabled"] for b in _buttons(c, row)), "A3 이름을 넣은 줄의 무게 버튼이 활성이다")
    c.expect(all(b["disabled"] for b in _buttons(c, 2)), "A3 빈 셋째 기준의 무게 버튼은 비활성이다")
    c.eq(_text(c, "#jn-csent"), PLAIN_CRIT, "A3 무게를 정하기 전에는 기준만 나열한다")
    c.expect(c.page.locator("#jn-cnote").is_visible(), "A3 미정인 기준 둘에는 무게 안내가 보인다")
    c.eq(c.page.locator("#jn-c0").evaluate("el => el.__t"), 1, "A3 칩 갱신은 입력 요소를 다시 만들지 않는다")


def t_A4_weights_toggle(c: Ctx):
    _prep(c, opened=True)
    _pair(c)
    high = c.page.locator('[data-jw="0"][data-jwv="3"]')
    high.click()
    c.eq([b["pressed"] for b in _buttons(c, 0)], ["true", "false", "false"], "A4 선택한 높음 버튼만 눌린 상태다")
    c.expect(c.page.locator("#jn-cnote").is_visible(), "A4 다른 기준이 미정이면 안내가 남는다")
    c.page.locator('[data-jw="1"][data-jwv="2"]').click()
    c.eq(_text(c, "#jn-csent"), WEIGHTED_CRIT, "A4 두 무게를 정하면 가장 무거운 기준을 말한다")
    c.expect(c.page.locator("#jn-cnote").is_hidden(), "A4 모든 기준의 무게를 정하면 안내를 숨긴다")
    high.click()
    c.eq(high.get_attribute("aria-pressed"), "false", "A4 같은 무게를 다시 누르면 미정으로 돌아간다")
    c.eq(_text(c, "#jn-csent"), PLAIN_CRIT, "A4 미정으로 돌아가면 기준만 나열한다")
    c.expect(c.page.locator("#jn-cnote").is_visible(), "A4 미정 기준이 생기면 안내가 다시 보인다")
    high.click()
    c.eq(_text(c, "#jn-sum"), SUMMARY, "A4 요약에 기준 이름과 무게가 나온다")


def t_A5_trade_focus(c: Ctx):
    _filled(c, marker=True)
    c.eq(_text(c, "#jn-tsent"), TRADE, "A5 얻는 것과 잃는 것 문장이 정확하다")
    c.eq(c.page.locator("#jn-gain").get_attribute("list"), "jn-critlist", "A5 얻는 것 입력은 기준 제안 목록을 쓴다")
    options = c.page.locator("#jn-critlist option").evaluate_all("els => els.map(el => el.value)")
    c.expect({"효율", "비용"}.issubset(set(options)), "A5 현재 기준을 제안 목록에 포함한다")
    c.eq(c.page.evaluate("document.activeElement.id"), "jn-cost", "A5 갱신 후 마지막 입력의 포커스가 유지된다")
    c.eq(c.page.locator("#jn-c0").evaluate("el => el.__t"), 1, "A5 입력 갱신은 패널과 기준 입력을 다시 만들지 않는다")


def t_A6_year_storage(c: Ctx):
    _prep(c)
    c.wait_saved(400)
    # 통합 시 다른 모듈이 만든 공용 저장 키의 존재는 허용한다.
    stores = c.page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('kcp:v1:x:'))")
    before = {key: c.ls(key) for key in stores}
    c.page.locator("#jn-toggle").click()
    c.page.wait_for_selector("#jn-body")
    _weighted(c)
    _trade(c)
    jn = _stored_jn(c)
    c.eq(jn.get("open"), True, "A6 펼침 상태를 연도 기록에 저장한다")
    crit = jn.get("crit", [])
    c.eq(crit, [{"n": "효율", "w": 3}, {"n": "비용", "w": 2}, {"n": "", "w": 0}], "A6 세 기준 이름과 무게를 저장한다")
    c.eq(jn.get("gain"), "환경", "A6 얻는 것 입력을 저장한다")
    c.eq(jn.get("goalAckAt"), 0, "A6 목표 확인의 기본값은 영이다")
    c.expect("goalAck" not in jn, "A6 새 기록에 옛 목표 확인 불리언을 만들지 않는다")
    keys_after = c.page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('kcp:v1:x:'))")
    c.eq({key: c.ls(key) for key in keys_after}, before, "A6 판단 노트 조작은 공용 저장값을 만들거나 바꾸지 않는다")


def t_A7_speak_collapse(c: Ctx):
    _prep(c, opened=True)
    buttons = c.page.locator("#jn-panel .speak-go")
    c.eq(buttons.count(), 2, "A7 판단 노트에는 말해 보기 위젯 두 개가 있다")
    buttons.first.click()
    c.page.wait_for_timeout(300)  # 말하기 타이머 확인에만 고정 대기를 쓴다.
    timer = c.page.locator("#jn-speak1 .speak-t")
    c.expect("말하는 중" in timer.inner_text(), "A7 첫 위젯이 말하기 시간을 잰다")
    c.expect("권장 한두 문장" in timer.inner_text(), "A7 권장값은 한두 문장이다")
    c.page.locator("#jn-toggle").click()
    c.expect(c.page.locator("#jn-body").is_hidden(), "A7 접은 본문을 숨긴다")
    c.eq(buttons.first.get_attribute("aria-pressed"), "false", "A7 접으면 숨겨진 말하기를 끝낸다")
    c.eq(c.page.evaluate("document.activeElement.id"), "jn-toggle", "A7 접은 뒤 토글에 포커스가 남는다")
    c.page.locator("#jn-toggle").click()
    c.page.wait_for_selector("#jn-body")
    c.check("A7 다시 펼친 준비실")


def t_A8_reload_state(c: Ctx):
    _filled(c)
    c.wait_saved(400)
    c.page.reload()
    c.page.wait_for_selector("#jn-body")
    c.eq(c.page.locator("#jn-toggle").get_attribute("aria-expanded"), "true", "A8 새로고침 후 펼침 상태를 복원한다")
    c.eq(c.page.locator("#jn-c0").input_value(), "효율", "A8 기준 이름을 복원한다")
    c.eq(c.page.locator('[data-jw="0"][data-jwv="3"]').get_attribute("aria-pressed"), "true", "A8 무게 선택을 복원한다")
    c.eq(_text(c, "#jn-csent"), WEIGHTED_CRIT, "A8 복원한 기준 문장이 같다")
    c.eq(_text(c, "#jn-tsent"), TRADE, "A8 복원한 얻고 잃는 것 문장이 같다")
    c.check("A8 새로고침한 펼친 준비실")
    c.page.locator("#jn-toggle").click()
    c.wait_saved(400)
    c.page.reload()
    c.page.wait_for_selector("#jn-panel")
    c.eq(c.page.locator("#jn-toggle").get_attribute("aria-expanded"), "false", "A8 접힘 상태도 복원한다")
    c.expect(c.page.locator("#jn-body").is_hidden(), "A8 복원한 접힌 본문은 숨김이다")
    c.eq(_text(c, "#jn-sum"), SUMMARY, "A8 접혀도 복원한 기준 요약을 보여 준다")
    c.check("A8 새로고침한 접힌 준비실")


def t_A9_room_panel(c: Ctx):
    _filled(c)
    _phase(c, "room")
    c.eq(c.page.locator("#room-side #jn-side").count(), 1, "A9 면접실 오른쪽 슬롯에 판단 노트 하나를 둔다")
    c.eq(c.page.locator("#jn-panel").count(), 0, "A9 면접실에는 준비실 패널이 없다")
    c.eq(_text(c, "#jn-side-c"), WEIGHTED_CRIT, "A9 면접실에 기준 문장을 보여 준다")
    c.eq(_text(c, "#jn-side-t"), TRADE, "A9 면접실에 얻고 잃는 것 문장을 보여 준다")
    c.eq(c.page.locator('.qcard [id^="jn-"], #room-tools [id^="jn-"], #room-alt [id^="jn-"]').count(), 0, "A9 판단 노트는 질문 카드와 다른 모듈 슬롯에 요소를 넣지 않는다")
    c.eq(c.page.locator(".qdeck .qcard").count(), c.page.locator("textarea[data-a]").count(), "A9 기존 질문 카드와 답변 입력의 개수가 같다")
    c.expect(all(value == "" for value in c.page.locator("textarea[data-a]").evaluate_all("els => els.map(el => el.value)")), "A9 만든 문장을 답변 칸에 자동 입력하지 않는다")


def t_A10_edit_return(c: Ctx):
    _filled(c)
    _phase(c, "room")
    c.page.locator("#jn-edit").click()
    c.page.wait_for_selector("#jn-body")
    c.eq(c.page.locator('.phases button[data-phase="prep"]').get_attribute("aria-pressed"), "true", "A10 고치기는 준비실 단계로 돌아간다")
    c.expect(c.page.locator("#jn-body").is_visible(), "A10 고치기로 돌아온 판단 노트는 펼쳐진다")
    c.eq(c.page.evaluate("document.activeElement.id"), "jn-toggle", "A10 고치기 뒤 판단 노트 토글에 포커스한다")
    c.check("A10 고치기로 돌아온 준비실")


def t_A11_clear_weight(c: Ctx):
    _filled(c)
    c.page.locator("#jn-c1").fill("")
    c.eq(_buttons(c, 1), [{"pressed": "false", "disabled": True}] * 3, "A11 기준을 지우면 무게가 미정이며 버튼은 비활성이다")
    c.eq(_text(c, "#jn-csent"), "제가 판단 기준으로 삼은 것은 효율입니다.", "A11 남은 기준 하나의 문장만 표시한다")
    c.expect(c.page.locator("#jn-cnote").is_hidden(), "A11 기준 하나에는 무게 안내를 숨긴다")


def t_B1_previous_goal(c: Ctx):
    _goal(c)
    c.expect(c.page.locator("#jn-body").is_hidden(), "B1 다음 연습의 판단 노트는 처음에 접혀 있다")
    c.expect(c.page.locator("#jn-goal").is_visible(), "B1 접혀 있어도 지난 목표가 보인다")
    goal = _text(c, "#jn-goal")
    c.expect("결론을 먼저 말한다" in goal, "B1 지난 연습의 목표 내용을 보여 준다")
    c.expect("2022 미션 켄텍" in goal, "B1 지난 목표의 게임 이름을 보여 준다")
    c.expect(not c.page.locator("#jn-goalack").is_checked(), "B1 새 연습에서는 목표 확인이 꺼져 있다")


def t_B2_goal_ack_storage(c: Ctx):
    _goal(c, acknowledged=True)
    jn = _stored_jn(c, "2023")
    goal = c.ls("kcp:v1:x:goal") or {}
    c.expect(isinstance(goal.get("at"), (int, float)) and goal["at"] > 0, "B2 지난 목표에 확인 기준 시각이 있다")
    c.eq(jn.get("goalAckAt"), goal.get("at"), "B2 확인한 목표의 시각을 연도 기록에 저장한다")
    _phase(c, "room")
    c.expect("결론을 먼저 말한다" in _text(c, "#jn-side-goal"), "B2 확인한 목표가 면접실에 보인다")


def t_B3_new_goal_unchecked(c: Ctx):
    _goal(c, acknowledged=True)
    old = _stored_jn(c, "2023").get("goalAckAt")
    _phase(c, "reflect")
    c.page.locator("#nextstep-2023").fill("자료의 수치를 하나 인용한다")
    c.wait_saved(400)
    new = c.ls("kcp:v1:x:goal") or {}
    c.expect(new.get("at") != old, "B3 새 목표의 시각은 이전 확인 시각과 다르다")
    _phase(c, "prep")
    c.expect("자료의 수치를 하나 인용한다" in _text(c, "#jn-goal"), "B3 바뀐 목표 문장을 보여 준다")
    c.expect(not c.page.locator("#jn-goalack").is_checked(), "B3 목표가 바뀌면 확인 체크가 풀린다")
    _phase(c, "room")
    c.eq(c.page.locator("#jn-side-goal").count(), 0, "B3 새 목표를 확인하기 전에는 면접실에 표시하지 않는다")


def t_C1_official_2026(c: Ctx):
    _prep(c, "2026", opened=True)
    texts = c.page.locator(".jn-chips [data-jchip]").all_text_contents()
    c.eq(texts, c.page.evaluate('KCP.CRIT_CHIPS_BY_YEAR["2026"].chips'), "C1 2026 평가표 칩 목록이 계약 데이터와 같다")
    c.expect("기능/효과" in texts, "C1 2026 칩에 기능과 효과 항목이 있다")
    c.eq(_text(c, ".jn-chips .tag-official"), "평가 기준표", "C1 2026 칩에는 평가 기준표 태그가 있다")
    c.eq(c.page.locator(".jn-chips .tag-mine").count(), 0, "C1 2026 평가표 칩에는 연습용 태그가 없다")
    c.eq(c.page.locator("#jn-c0").get_attribute("placeholder"), "평가표 항목 가운데 하나", "C1 2026 기준 입력 안내가 정확하다")


def t_C2_year_chips(c: Ctx):
    # C2는 tag-mine을 명시하지만 공통 데이터 계약은 이 두 해를 official:true로
    # 정의한다. 기대값을 완화하지 않고 수용 기준을 그대로 옮긴다.
    for year in ("2023", "2024"):
        _prep(c, year, opened=True)
        c.eq(c.page.locator(".jn-chips [data-jchip]").all_text_contents(),
             c.page.evaluate("year => KCP.CRIT_CHIPS_BY_YEAR[year].chips", year), "C2 연도별 기준 칩 목록이 계약 데이터와 같다")
        c.eq(c.page.locator(".jn-chips .tag-mine").all_text_contents(), ["연습용 기준 예시"], "C2 2023과 2024는 수용 기준의 연습용 기준 태그를 쓴다")


def t_C3_order_2025(c: Ctx):
    _prep(c, "2025", opened=True)
    c.expect("인과 연결" in c.page.locator(".jn-chips [data-jchip]").all_text_contents(), "C3 2025 기준 칩에는 인과 연결이 있다")
    col = c.page.locator("#jn-panel .jn-col").nth(2)
    c.eq(col.locator("h4").inner_text(), "정한 순서와 근거", "C3 2025의 세 번째 칸은 순서와 근거다")
    for text in ("내가 정한 순서", "가장 단단한 근거", "가장 약한 근거"):
        c.expect(text in col.locator("label").all_text_contents(), "C3 2025 입력 라벨은 순서 추론에 맞는다")
    c.expect("얻는 것" not in _text(c, "#jn-panel"), "C3 2025에는 얻는 것 틀을 씌우지 않는다")
    c.eq(c.page.locator("#jn-gain").get_attribute("list"), None, "C3 2025 근거 입력에는 기준 제안 목록을 연결하지 않는다")
    c.eq(c.page.locator("#jn-critlist").count(), 0, "C3 2025에는 기준 제안 목록이 없다")
    c.page.locator("#jn-pick").fill("■ ● ▲ ◆")
    c.page.locator("#jn-gain").fill("창간호의 매장량 우려")
    c.page.locator("#jn-cost").fill("두 기사의 시간 표현")
    expected = "제가 정한 순서는 ■ ● ▲ ◆입니다. 가장 단단한 근거는 「창간호의 매장량 우려」, 가장 약한 근거는 「두 기사의 시간 표현」입니다."
    c.eq(_text(c, "#jn-tsent"), expected, "C3 2025는 순서와 강약 근거 문장을 만든다")
    c.expect("유리하지만" not in _text(c, "#jn-tsent"), "C3 순서 문장에 얻고 잃는 것 표현이 없다")
    _phase(c, "room")
    c.eq(_text(c, "#jn-side-t"), expected, "C3 면접실에도 순서 문장을 보여 준다")


def t_C4_corrupt_storage(c: Ctx):
    for broken in ({"crit": "x", "open": "y", "gain": 5}, [1, 2]):
        _inject(c, "kcp:v1:2025", {"ext": {"jn": broken}})
        _prep(c, "2025")
        c.eq(c.page.locator("#jn-panel").count(), 1, "C4 손상된 저장값에서도 패널 하나를 그린다")
        c.eq(c.page.locator("#jn-toggle").get_attribute("aria-expanded"), "false", "C4 잘못된 펼침 값은 접힘 기본값으로 고친다")
        c.expect(c.page.locator("#jn-body").is_hidden(), "C4 손상값을 고친 본문은 숨김이다")
        c.eq(c.page.locator("#jn-c0").input_value(), "", "C4 잘못된 기준 값은 빈 기준으로 고친다")
        c.page.locator("#jn-toggle").click()
        c.page.wait_for_selector("#jn-body")
        c.eq(c.page.locator("#jn-gain").input_value(), "", "C4 문자열이 아닌 근거는 빈 값으로 고친다")
        c.eq(_stored_jn(c, "2025").get("crit"), [{"n": "", "w": 0}] * 3, "C4 사용자 조작 후 보정된 세 기준을 저장한다")


def t_C4_nested_corruption(c: Ctx):
    broken = {"open": True, "out": 8, "plan": [], "pick": {}, "gain": False,
              "cost": None, "goalAckAt": -1, "crit": [None, {"n": 7, "w": "3"}, {"n": "효율", "w": 99}, {"n": "초과", "w": 3}]}
    _inject(c, "kcp:v1:2025", {"ext": {"jn": broken}})
    _prep(c, "2025", opened=True)
    for sel in ("#jn-out", "#jn-plan", "#jn-pick", "#jn-gain", "#jn-cost", "#jn-c0", "#jn-c1"):
        c.eq(c.page.locator(sel).input_value(), "", "C4 중첩 손상값의 문자열 필드를 빈 값으로 보정한다")
    c.eq(c.page.locator("#jn-c2").input_value(), "효율", "C4 유효한 기준 이름은 보존한다")
    c.expect(all(b["pressed"] == "false" for row in range(3) for b in _buttons(c, row)), "C4 문자열이나 범위 밖의 무게를 미정으로 보정한다")
    c.page.locator("#jn-plan").fill("자료 먼저")
    saved = _stored_jn(c, "2025")
    c.eq(len(saved.get("crit", [])), 3, "C4 초과 기준을 잘라 길이 세 배열로 저장한다")
    c.eq(saved.get("goalAckAt"), 0, "C4 음수 목표 확인 시각은 영으로 고친다")


def _settle_2024(c, ident):
    c.page.wait_for_selector("[data-hex]")
    hexes = c.page.locator("[data-hex]")
    for i in range(min(hexes.count(), 16)):
        hexes.nth(i).click()
        # 클릭 완료 뒤 DOM의 변경을 기다리고 고정 지연은 넣지 않는다.
        c.page.locator("#tcount").wait_for(state="visible")
        if _text(c, "#tcount").startswith("4 /"):
            break
    c.expect(_text(c, "#tcount").startswith("4 /"), ident + " 정착지 네 칸을 선택한다")
    for _ in range(3):
        c.page.locator("[data-inc]").first.click()
    c.page.locator("[data-toggle]").nth(0).click()
    c.page.locator("[data-toggle]").nth(1).click()
    c.expect(_text(c, "#icount").startswith("5 /"), ident + " 특별 아이템 다섯 개를 선택한다")


def t_D1_prep_redraw(c: Ctx):
    _prep(c, "2024", opened=True)
    c.page.locator("#jn-out").fill("정착지와 아이템")
    c.page.locator("#jn-out").evaluate("el => { el.__t = 1; }")
    _settle_2024(c, "D1")
    c.page.locator("#lock").click()
    c.page.wait_for_selector("#unlock")
    for state in ("확정 뒤", "다시 계획하기 뒤"):
        if state == "다시 계획하기 뒤":
            c.page.locator("#unlock").click()
            c.page.wait_for_selector("#lock")
        c.eq(c.page.locator("#jn-panel").count(), 1, "D1 과제 본문을 다시 그려도 판단 노트는 하나다")
        c.expect(_before_body(c), "D1 다시 그린 뒤에도 판단 노트가 본문보다 앞에 있다")
        c.eq(c.page.locator("#jn-out").input_value(), "정착지와 아이템", "D1 다시 그린 뒤 판단 노트 입력을 보존한다")
        c.eq(c.page.locator("#jn-out").evaluate("el => el.__t"), 1, "D1 과제 본문 재그리기는 판단 노트 입력을 교체하지 않는다")
        c.check("D1 2024/" + state)


def t_E1_empty_export(c: Ctx):
    _prep(c, "2023")
    _phase(c, "reflect")
    c.expect("■ 판단 노트" not in _copy(c), "E1 빈 판단 노트는 복사 글에 블록을 추가하지 않는다")


def t_E2_filled_export(c: Ctx):
    _filled(c)
    _phase(c, "reflect")
    clip = _copy(c)
    for text in ("\n■ 판단 노트\n", SUMMARY, WEIGHTED_CRIT,
                 "고른 것: 풍력 · 얻는 것: 환경 · 잃는 것: 공급 안정", TRADE):
        c.expect(text in clip, "E2 복사 글에 판단 노트의 기준과 결론 문장이 포함된다")
    c.expect("■ 자기 평가" in clip and "■ 판단 노트" in clip and
             clip.index("■ 자기 평가") < clip.index("■ 판단 노트"), "E2 판단 노트 블록은 자기 평가 뒤에 있다")


def t_E2_export_order_and_plaintext(c: Ctx):
    _prep(c, "2025", opened=True)
    for sel, text in (("#jn-out", "과제 <가상>"), ("#jn-plan", "읽기 → 결정"),
                      ("#jn-pick", "■ ●"), ("#jn-gain", "근거 <가상>")):
        c.page.locator(sel).fill(text)
    _phase(c, "reflect")
    clip = _copy(c)
    expected = "\n■ 판단 노트\n과제: 과제 <가상>\n시간 배분: 읽기 → 결정\n정한 순서: ■ ● · 가장 단단한 근거: 근거 <가상>\n제가 정한 순서는 ■ ●입니다. 가장 단단한 근거는 「근거 <가상>」입니다."
    c.expect(expected in clip, "E2 2025 복사는 비지 않은 줄을 순서대로 평문으로 내보낸다")


def t_F1_javascript_syntax(c: Ctx):
    source = _source(c, "ext/routine.js")
    try:
        result = subprocess.run(["node", "--check"], input=source, text=True,
                                capture_output=True, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        c.expect(False, "F1 node 문법 검사 실행 실패: " + str(exc).replace("\n", " "))
        return
    c.eq(result.returncode, 0, "F1 대상 서버의 routine.js가 node 문법 검사를 통과한다: " + result.stderr.strip().replace("\n", " ")[:500])


def t_F2_static_contract(c: Ctx):
    css = _source(c, "ext/routine.css")
    js = _source(c, "ext/routine.js")
    patterns = (
        (css, r"^\s*(\.(seg|btn|desk|panel|field|chip|row|stack|note|hint|caution|small|muted|num|qcard|qdeck|speak|tag-official|tag-mine)\b|\[data-|:root|html\b|body\b|\*\s*\{)", "공통 CSS 선택자로 시작하지 않는다"),
        (css, r"transition|animation", "전환과 애니메이션을 쓰지 않는다"),
        (js, r"console\.|getUserMedia|MediaRecorder|SpeechRecognition|\.phases|data-phase", "콘솔과 음성 API 및 내부 단계 선택자를 쓰지 않는다"),
        (js, r"data-(v|k|a|tab|mode|cell|tool|ov|del|node|hex|inc|toggle|match|fact|sel|slot|up|down|tot|pick|to|r1|note|qx|stale|tm|think)\b", "다른 화면의 예약 속성을 쓰지 않는다"),
    )
    for source, pattern, label in patterns:
        hits = [f"{i}: {line.strip()}" for i, line in enumerate(source.splitlines(), 1) if re.search(pattern, line)]
        c.eq(hits, [], "F2 " + label)
    clean_css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    c.expect(re.search(r"(?:^|[;{])\s*--[\w-]+\s*:", clean_css) is None, "F2 모듈 CSS는 변수를 재정의하지 않는다")
    bad = []
    for match in re.finditer(r"([^{}]+)\{", clean_css):
        selector = match.group(1).strip()
        if selector.startswith("@"):
            c.expect(selector.startswith("@media"), "F2 모듈 CSS의 조건부 규칙은 미디어 쿼리다")
            continue
        for part in selector.split(","):
            if not re.match(r"^(?:#jn-|\.jn-)[a-zA-Z0-9_-]+", part.strip()):
                bad.append(part.strip())
        for line in selector.splitlines():
            if len([p for p in line.split(",") if p.strip()]) > 1:
                bad.append("한 줄의 복수 선택자: " + line.strip())
    c.eq(bad, [], "F2 쉼표로 나눈 모든 선택자는 자기 접두어로 시작하며 한 줄에 하나다")


def t_F3_text_contrast(c: Ctx):
    _filled(c)
    for sel in ("#jn-csent", "#jn-tsent", "#jn-guide", "#jn-sum"):
        ratio = c.contrast(sel)
        c.expect(isinstance(ratio, (int, float)) and ratio >= 4.5,
                 "F3 " + sel + " 글자와 실제 배경의 대비는 4.5 이상이다")
    c.check("F3 문장을 채운 판단 노트")


def _mobile_bounds(c, root, ident):
    if not c.cfg.mobile:
        return
    outside = c.page.locator(root).evaluate("""root => {
        const vw = document.documentElement.clientWidth;
        return [root, ...root.querySelectorAll('*')].filter(el => {
            if (el.closest('[hidden]')) return false;
            for (let p = el; p; p = p.parentElement) {
                const style = getComputedStyle(p);
                if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
            }
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.right > vw;
        }).map(el => el.id || el.className || el.tagName);
    }""")
    c.eq(outside, [], ident + " 모바일 판단 노트의 보이는 요소는 오른쪽 뷰포트 안에 있다")


def t_F4_all_screen_widths(c: Ctx):
    for year in YEARS:
        _prep(c, year)
        c.expect(c.page.locator("#jn-body").is_hidden(), "F4 각 해의 초기 판단 노트는 접혀 있다")
        c.check("F4 " + year + "/접힌 준비실")
        _mobile_bounds(c, "#jn-panel", "F4")
        c.page.locator("#jn-toggle").click()
        c.page.wait_for_selector("#jn-body")
        c.check("F4 " + year + "/펼친 준비실")
        _mobile_bounds(c, "#jn-panel", "F4")
        # 긴 문장은 실제 줄바꿈·넘침을 함께 확인한다.
        c.page.locator("#jn-out").fill("가상의긴과제설명" * 30)
        c.page.locator("#jn-c0").fill("가상의긴기준이름" * 30)
        c.check("F4 " + year + "/긴 입력 준비실")
        _mobile_bounds(c, "#jn-panel", "F4")
        _phase(c, "room")
        c.check("F4 " + year + "/면접실")
        _mobile_bounds(c, "#jn-side", "F4")


def t_C5_original_game(c: Ctx):
    """추가 수용 기준: T0a 방식의 s-test를 등록해 준비실부터 확인한다."""
    c.goto("#home", wait=".home-grid")
    c.page.evaluate("""() => {
        KCP.YEARS['s-test'] = {
            title:'시험 게임', format:'t', desc:'d', prep:20, answer:10,
            rubric:KCP.YEARS['2025'].rubric, intent:['i'], original:true,
            topics:[], concepts:[]
        };
        KCP.games['s-test'] = {
            brief:() => '<p>b</p>',
            renderPrep:(root, s, save, next) => {
                root.innerHTML = '<button type="button" id="go">go</button>';
                root.querySelector('#go').onclick = next;
            },
            questions:() => [{k:'t-1', tag:'문항', q:'질문'}],
            recap:() => [{t:'r', d:'d'}], reflectExtra:() => '<p>x</p>'
        };
        KCP.ORIGINAL_ORDER.push('s-test');
    }""")
    _prep(c, "s-test", opened=True)
    c.eq(c.page.locator("#jn-panel").count(), 1, "C5 창작 게임 준비실에도 판단 노트가 하나 나온다")
    c.eq(c.page.locator(".jn-chips [data-jchip]").all_text_contents(), c.page.evaluate("KCP.CRIT_CHIPS"), "C5 연도별 데이터가 없는 창작 게임은 일반 칩을 쓴다")
    c.eq(_text(c, ".jn-chips .tag-mine"), "연습용 기준 예시", "C5 일반 칩에는 연습용 기준 태그를 붙인다")
    c.eq(c.page.locator(".jn-chips .tag-official").count(), 0, "C5 일반 칩에 공식 태그를 붙이지 않는다")
    _weighted(c)
    _trade(c)
    c.eq(_stored_jn(c, "s-test").get("crit", [])[:2], [{"n": "효율", "w": 3}, {"n": "비용", "w": 2}], "C5 창작 게임 키에 판단 노트를 저장한다")
    _phase(c, "room")
    c.eq(_text(c, "#jn-side-c"), WEIGHTED_CRIT, "C5 창작 게임 면접실에도 기준 문장을 표시한다")
    c.eq(_text(c, "#jn-side-t"), TRADE, "C5 창작 게임에도 얻고 잃는 것 문장을 표시한다")
    _mobile_bounds(c, "#jn-side", "C5")
    _phase(c, "reflect")
    c.expect("\n■ 판단 노트\n" in _copy(c), "C5 창작 게임 성찰에서도 판단 노트를 복사한다")


def _regression_room(c, button, year, minimum):
    c.page.locator(button).click()
    c.page.wait_for_selector(".qdeck .qcard")
    c.expect(c.page.locator(".qdeck .qcard").count() >= minimum, "F5 기출 면접실의 질문 수를 유지한다")
    c.page.locator('textarea[data-a="0"]').fill("결론 먼저, 근거 둘.")
    c.check("F5 " + year + "/면접실")
    c.page.locator("#toReflect").click()
    c.page.wait_for_selector("table.rubric")
    c.page.locator('.seg button[data-v="3"]').first.click()
    c.page.locator('.seg button[data-v="2"]').nth(1).click()
    c.expect(_text(c, "#rsum").startswith("점검 2/9"), "F5 통합 계약의 자기 평가 점검 합계를 유지한다")
    c.page.locator('textarea[id^="nextstep-"]').fill("결론을 먼저 말한다")
    c.expect("결론 먼저, 근거 둘." in _copy(c), "F5 기존 답변을 성찰에서 복사한다")
    c.page.locator("#resetAll").click()
    c.page.wait_for_selector("#confirmReset")
    c.expect(c.page.locator("#confirmReset").is_visible(), "F5 기록 지우기 확인창을 표시한다")
    c.page.locator("#noReset").click()
    c.page.locator("#confirmReset").wait_for(state="hidden")
    c.expect(c.page.locator("#confirmReset").is_hidden(), "F5 기록 지우기를 취소하면 확인창을 숨긴다")
    c.check("F5 " + year + "/성찰")


def _regression_timer(c):
    before = _text(c, "#clock")
    c.page.locator("#tgo").click()
    c.page.wait_for_timeout(1600)
    running = _text(c, "#clock")
    c.expect(running != before, "F5 타이머 시작 뒤 시간이 변한다")
    c.page.locator("#tgo").click()
    # 멈추는 조작 시점의 표시를 기준으로 검사해 틱 경계 경쟁을 피한다.
    stopped = _text(c, "#clock")
    c.page.wait_for_timeout(1200)
    c.eq(_text(c, "#clock"), stopped, "F5 일시정지한 타이머의 표시가 유지된다")
    c.page.locator("#treset").click()
    c.eq(_text(c, "#clock"), before, "F5 타이머 초기화가 원래 시간을 복원한다")


def t_F5_baseline_flows(c: Ctx):
    # baseline.py의 다섯 해 흐름과 복원을 한 컨텍스트 안에서 재현한다.
    # .pkg 전체 수는 창작 게임 때문에 고정하지 않고 기출 링크로 범위를 정한다.
    c.goto("#home", wait=".pkg")
    for year in YEARS:
        c.eq(c.page.locator(f'.pkg[href="#y{year}"]').count(), 1, "F5 홈에 각 기출 게임 진입 링크가 하나 있다")
    c.check("F5 처음 홈")

    _prep(c)
    c.page.wait_for_selector("#grid .cell")
    _regression_timer(c)
    for overlay in ("wind", "current", "solar", "map"):
        c.page.locator(f'[data-ov="{overlay}"]').click()
        c.check("F5 2022/" + overlay)
    for tool, cell in (("fossil", "F5"), ("nuclear", "I9"), ("solar", "I7"), ("wind", "B1")):
        c.page.locator(f'[data-tool="{tool}"]').click()
        c.page.locator(f'[data-cell="{cell}"]').click()
    c.eq(c.page.locator("#grid .plant").count(), 4, "F5 2022 발전소 네 기를 배치한다")
    c.page.locator("#r1-solar").fill("일사량 20, 새 서식지 회피")
    c.page.locator('[data-mode="q2"]').click()
    c.page.locator('[data-tool="wind"]').click()
    for cell in ("A6", "A7", "B6"):
        c.page.locator(f'[data-cell="{cell}"]').click()
    # D-68(PDF p35 조건 3): 공급은 학생이 고른 마을과 직접 놓은 공유 전선으로만 센다.
    for i in range(3):
        c.page.locator(f"#to-{i}").select_option("배멧")
    c.page.locator('[data-tool="wire"]').click()
    for a, b in (("A6", "A7"), ("A6", "B6"), ("B6", "B9")):
        c.page.locator(f'[data-cell="{a}"]').click()
        c.page.locator(f'[data-cell="{b}"]').click()
    c.expect("충족" in c.page.locator("table.supply").first.inner_text(), "F5 2022 배멧 공급 충족을 표시한다")
    c.page.locator("#to-0").select_option("참살이")
    c.page.locator('[data-del="2"]').click()
    c.eq(c.page.locator("table.supply").nth(1).locator("tbody tr").count(), 2, "F5 2022 삭제 뒤 발전소 두 기가 남는다")
    c.page.locator("#q2t").fill("풍력 위주, 바다 외곽.")
    c.expect(c.page.locator("#warn li").count() >= 1, "F5 2022 영향 분석 항목을 표시한다")
    c.check("F5 2022/두 번째 과제")
    _regression_room(c, "#go22", "2022", 7)

    _prep(c, "2023")
    c.page.wait_for_selector("[data-node]")
    for node in ("1C", "2G", "1A", "2C", "2B", "3C", "3B", "2H", "3H", "4G"):
        c.page.locator(f'[data-node="{node}"]').click()
    c.eq(_text(c, "#yr"), "10 / 10년", "F5 2023 십 년 계획을 완성한다")
    c.page.locator("#undo").click()
    c.eq(_text(c, "#yr"), "9 / 10년", "F5 2023 마지막 해를 취소한다")
    c.page.locator('[data-node="4G"]').click()
    for tab in ("wheel", "nb", "path"):
        c.page.locator(f'[data-tab="{tab}"]').click()
        c.check("F5 2023/" + tab)
    c.page.locator("#q1-23").fill("나람국 과학 집중, 다람국 환경 집중.")
    c.page.locator("#q2-23").fill("환경 우선, 박람회 조건 충족.")
    _regression_room(c, "#go23", "2023", 9)

    _prep(c, "2024")
    _settle_2024(c, "F5")
    c.page.locator("#showK").check()
    c.expect(c.page.locator(".hexmap text").count() > 0, "F5 2024 채굴량 표시를 켠다")
    c.page.locator("#sim").click()
    c.eq(c.page.locator("#gauges .gauge").count(), 6, "F5 2024 시뮬레이션은 속성 여섯 개를 표시한다")
    c.expect(c.page.locator("#go24").is_disabled(), "F5 2024 확정 전 면접실 버튼은 비활성이다")
    c.page.locator("#lock").click()
    c.page.wait_for_selector("#unlock")
    c.expect(c.page.locator("#go24").is_enabled(), "F5 2024 확정 뒤 면접실 버튼은 활성이다")
    c.page.locator('[data-match="no"]').click()
    c.page.locator("#plan24").fill("숲과 호수 중심, 엔지니어 세 명.")
    c.check("F5 2024/확정 준비실")
    _regression_room(c, "#go24", "2024", 7)
    _phase(c, "prep")
    c.page.wait_for_selector("#unlock")
    c.page.locator("#unlock").click()
    c.page.wait_for_selector("#lock")
    c.eq(c.page.locator("#lock").count(), 1, "F5 2024 다시 계획하면 확정 버튼이 돌아온다")
    c.check("F5 2024/다시 계획하기")

    _prep(c, "2025")
    for paper in ("red", "green", "black", "blue"):
        c.page.locator(f'[data-tab="{paper}"]').click()
        c.check("F5 2025/" + paper)
    c.page.locator("[data-fact]").first.click()
    c.expect(c.page.locator("#overall25").input_value().startswith("["), "F5 2025 단서 카드를 종합 설명에 삽입한다")
    for paper, slot in (("red", 0), ("blue", 1), ("green", 2), ("black", 3)):
        c.page.locator(f'[data-sel="{paper}"]').click()
        c.page.locator(f'[data-slot="{slot}"]').click()
    c.expect("모두 배치" in _text(c, "#tray"), "F5 2025 신문 네 부를 배치한다")
    c.page.locator('[data-down="0"]').click()
    c.expect("●" in _text(c, '[data-slot="0"]'), "F5 2025 신문을 아래로 이동한다")
    c.page.locator('[data-up="1"]').click()
    c.expect("■" in _text(c, '[data-slot="0"]'), "F5 2025 신문을 위로 이동한다")
    c.page.locator("#lk-0").fill("창간호의 매장량 우려가 고갈 기사로 이어짐")
    c.page.locator("#gp-0").fill("에너지청 공모")
    c.page.locator("#lk-1").focus()
    c.page.locator("[data-fact]").nth(1).click()
    c.expect("[" in c.page.locator("#lk-1").input_value(), "F5 2025 단서를 포커스한 연결 근거에 삽입한다")
    c.check("F5 2025/완성 준비실")
    _regression_room(c, "#go25", "2025", 8)

    _prep(c, "2026")
    c.page.wait_for_selector("#score select")
    for tech in ("bb", "db", "ml", "wc", "crit"):
        c.page.locator(f'[data-tab="{tech}"]').click()
        c.check("F5 2026/" + tech)
    for tech, value in (("bb", "4"), ("db", "3"), ("ml", "2"), ("wc", "5")):
        for criterion in "fsegu":
            c.page.locator(f"#sc-{tech}-{criterion}").select_option(value)
    c.eq(_text(c, "tr.best td.name"), "울버린 켄텍카솔", "F5 2026 최고 합계 기술을 강조한다")
    c.eq(_text(c, '[data-tot="wc"]'), "합계 25점", "F5 2026 추천 버튼에 합계를 표시한다")
    c.page.locator('[data-pick="ml"]').click()
    c.page.locator("#reason26").fill("사회/윤리 기준을 가장 무겁게 봄.")
    c.page.locator("#note-bb").fill("그래프와 문구 불일치")
    c.check("F5 2026/완성 준비실")
    c.page.locator("#go26").click()
    c.page.wait_for_selector(".qdeck .qcard")
    c.expect("합계로는" in _text(c, ".qdeck"), "F5 2026 합계와 다른 추천에는 후속 질문이 나온다")
    c.check("F5 2026/후속 질문 면접실")
    _phase(c, "prep")
    _regression_room(c, "#go26", "2026", 7)
    c.expect(c.page.locator("details.reveal").count() >= 8, "F5 2026 성찰의 예시 답안과 단서 공개 요소를 유지한다")

    c.goto("#home", wait=".pkg")
    for year in YEARS:
        card = c.page.locator(f'.pkg[href="#y{year}"]')
        c.eq(card.count(), 1, "F5 창작 게임과 함께 있어도 각 기출 카드가 하나 있다")
        c.eq(card.locator(".chip.accent").count(), 1, "F5 다섯 해의 이어서 하기 상태를 표시한다")
    c.check("F5 기록을 만든 뒤 홈")
    c.page.reload()
    c.page.wait_for_selector(".pkg")
    c.goto("#y2026", wait="#phase")
    _phase(c, "prep")
    c.page.wait_for_selector("#reason26")
    c.expect(c.page.locator("#reason26").input_value().startswith("사회/윤리"), "F5 새로고침 후 기존 게임 기록을 복원한다")


if __name__ == "__main__":
    main(globals())
