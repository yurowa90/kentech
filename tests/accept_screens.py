"""T0b 수용 검사. 실행 주소·환경·오류 수집은 harness에 맡긴다.

지시서와 확장 계약으로 작성했다. 앱 파일은 기존 선택자 확인에만 사용했다.
T0b-1은 baseline 동작을 이 틀로 옮기고 rsum 단언만 새 형식으로 바꾼다.
T0b-2는 통합 상태에서 T0a-2~17을 재검사한다. T0a-16(b)의 의도적
pageerror는 Page를 통해 별도 컨텍스트를 만들어 예상한 오류만 허용한다.
T0a-17의 한 줄 스텁 내용은 모듈 구현 후 성립하지 않으므로 로드 순서와
응답 상태만 검사한다. 빈 슬롯 단언도 통합 계약에 따라 접두어 검사로 바꾼다.
"""

import re

from harness import Ctx, main


YEARS = ("2022", "2023", "2024", "2025", "2026")
PREP = {"2022": "#grid .cell", "2023": "[data-node]",
        "2024": "[data-hex]", "2025": "#overall25", "2026": "#score select"}
ADVICE = "반문을 받으면 답을 고치거나, 유지한다면 그 이유를 말합니다."


def _loc(c, sel, state="attached"):
    loc = c.page.locator(sel)
    loc.first.wait_for(state=state)
    return loc


def _text(c, sel):
    return _loc(c, sel).first.inner_text().strip()


def _visible(c, sel, aid):
    c.expect(_loc(c, sel).first.is_visible(), f"{aid} {sel}이 보인다")


def _hidden(c, sel, aid):
    c.expect(_loc(c, sel).first.is_hidden(), f"{aid} {sel}이 숨겨진다")


def _absent(c, sel, aid):
    c.page.locator(sel).first.wait_for(state="detached")
    c.eq(c.page.locator(sel).count(), 0, f"{aid} {sel}이 남지 않는다")


def _pressed(c, sel, yes, aid):
    c.eq(_loc(c, sel).first.get_attribute("aria-pressed"), str(yes).lower(),
         f"{aid} {sel}의 선택 상태가 맞다")


def _prep(c, year):
    c.goto(f"#y{year}", wait="#phase")
    c.phase("prep")
    c.page.wait_for_selector(PREP.get(year, "#prep-body"))


def _phase(c, phase):
    c.phase(phase)
    c.page.wait_for_selector({"room": ".qdeck .qcard", "reflect": "table.rubric",
                              "prep": "#prep-body"}[phase])


def _panel(c):
    _loc(c, "#tset", "visible").click()
    c.page.wait_for_selector("#timeset")


def _seconds(s):
    minutes, seconds = s.split(":")
    return int(minutes) * 60 + int(seconds)


def _clip(c):
    c.page.evaluate("""() => {
      window.__clip = null;
      Object.defineProperty(navigator, 'clipboard', {
        value: {writeText: t => {window.__clip = t; return Promise.resolve();}},
        configurable: true
      });
    }""")


def _copy(c):
    _clip(c)
    _loc(c, "#copyAll", "visible").click()
    return c.page.evaluate("window.__clip") or ""


def _inject(c, year, state):
    # 라우터와 flush를 먼저 끝내야 이전 화면의 대기 저장이 주입값을 덮지 않는다.
    c.goto("#home", wait=".home-grid")
    c.page.evaluate("KCP.flush && KCP.flush()")
    c.page.evaluate("([y, s]) => localStorage.setItem('kcp:v1:' + y, JSON.stringify(s))",
                    [year, state])
    c.page.reload()
    c.page.wait_for_selector(".home-grid")


def _score2026(c, pick="ml"):
    _prep(c, "2026")
    for tech, value in (("bb", "4"), ("db", "3"), ("ml", "2"), ("wc", "5")):
        for criterion in "fsegu":
            _loc(c, f"#sc-{tech}-{criterion}", "visible").select_option(value)
    c.page.locator(f'[data-pick="{pick}"]').click()


def _stale2026(c):
    _score2026(c)
    _phase(c, "room")
    c.page.locator('textarea[data-a="2"]').fill("합계와 다른 이유")
    _phase(c, "prep")
    c.page.wait_for_selector('[data-pick="wc"]')
    c.page.locator('[data-pick="wc"]').click()
    _phase(c, "room")
    c.page.wait_for_selector('[data-stale="2"]')


def _prepare2022(c, aid):
    _prep(c, "2022")
    for overlay in ("wind", "current", "solar", "map"):
        c.page.locator(f'[data-ov="{overlay}"]').click()
        c.check(f"{aid} 2022 자료 {overlay}")
    for tool, cell in (("fossil", "F5"), ("nuclear", "I9"),
                       ("solar", "I7"), ("wind", "B1")):
        c.page.locator(f'[data-tool="{tool}"]').click()
        c.page.locator(f'[data-cell="{cell}"]').click()
    c.eq(c.page.locator("#grid .plant").count(), 4, f"{aid} 발전소 네 기를 배치한다")
    c.page.locator("#r1-solar").fill("일사량 20, 새 서식지 회피")
    c.page.locator('[data-mode="q2"]').click()
    c.page.wait_for_selector("#q2t")
    c.page.locator('[data-tool="wind"]').click()
    for cell in ("A6", "A7", "B6"):
        c.page.locator(f'[data-cell="{cell}"]').click()
    c.expect("충족" in _text(c, "table.supply"), f"{aid} 배멧 공급 충족을 표시한다")
    c.page.locator("#to-0").select_option("참살이")
    c.page.locator('[data-del="2"]').click()
    c.eq(c.page.locator("table.supply").nth(1).locator("tbody tr").count(), 2,
         f"{aid} 발전소 삭제 후 두 기가 남는다")
    c.page.locator("#q2t").fill("풍력 위주, 바다 외곽.")
    c.expect(c.page.locator("#warn li").count() >= 1, f"{aid} 영향 분석 항목이 있다")
    c.check(f"{aid} 2022 준비실 완성")


def _prepare2024(c, aid, lock=True):
    _prep(c, "2024")
    hexes = c.page.locator("[data-hex]")
    for i in range(min(hexes.count(), 16)):
        hexes.nth(i).click()
        if _text(c, "#tcount").startswith("4 /"):
            break
    c.expect(_text(c, "#tcount").startswith("4 /"), f"{aid} 정착지 네 칸을 고른다")
    for _ in range(3):
        c.page.locator("[data-inc]").first.click()
    c.page.locator("[data-toggle]").nth(0).click()
    c.page.locator("[data-toggle]").nth(1).click()
    c.expect(_text(c, "#icount").startswith("5 /"), f"{aid} 아이템 다섯 개를 고른다")
    c.page.locator("#showK").check()
    c.expect(c.page.locator(".hexmap text").count() > 0, f"{aid} 채굴량을 표시한다")
    c.page.locator("#sim").click()
    c.page.wait_for_selector("#gauges .gauge")
    c.eq(c.page.locator("#gauges .gauge").count(), 6, f"{aid} 속성 여섯 개를 표시한다")
    c.expect(c.page.locator("#go24").is_disabled(), f"{aid} 확정 전 이동 버튼은 비활성이다")
    if lock:
        c.page.locator("#lock").click()
        c.page.wait_for_selector("#unlock")
        c.expect(c.page.locator("#go24").is_enabled(), f"{aid} 확정 후 이동 버튼은 활성이다")
        c.page.locator('[data-match="no"]').click()
        c.page.locator("#plan24").fill("숲과 호수 중심, 엔지니어 3명.")
    c.check(f"{aid} 2024 준비실")


def _baseline_room(c, year, minimum):
    aid = "T0b-1"
    _loc(c, f"#go{year[-2:]}", "visible").click()
    c.page.wait_for_selector(".qdeck .qcard")
    c.expect(c.page.locator(".qdeck .qcard").count() >= minimum,
             f"{aid} {year} 면접실 질문 수가 회귀 기준을 충족한다")
    c.page.locator('textarea[data-a="0"]').fill("결론 먼저, 근거 둘.")
    c.check(f"{aid} {year} 면접실")
    c.page.locator("#toReflect").click()
    c.page.wait_for_selector("table.rubric")
    c.page.locator('.seg button[data-v="3"]').first.click()
    c.page.locator('.seg button[data-v="2"]').nth(1).click()
    c.expect(_text(c, "#rsum").startswith("점검 2/9"),
             f"{aid} {year} 자기 평가 점검 수를 표시한다")
    c.page.locator('textarea[id^="nextstep-"]').fill("결론을 먼저 말한다")
    _copy(c)
    c.page.locator("#resetAll").click()
    _visible(c, "#confirmReset", aid)
    c.page.locator("#noReset").click()
    _hidden(c, "#confirmReset", aid)
    c.check(f"{aid} {year} 성찰")


def t_T0b_1_baseline(c: Ctx):
    aid = "T0b-1"
    c.eq(_loc(c, ".pkg").count(), 5, f"{aid} 기출 카드 다섯 개를 유지한다")
    c.check(f"{aid} 홈")
    _prep(c, "2022")
    c.check(f"{aid} 2022 준비실")
    before = _text(c, "#clock")
    c.page.locator("#tgo").click()
    c.page.wait_for_timeout(1600)  # 타이머의 실제 시간 경과만 기다린다.
    running = _text(c, "#clock")
    c.expect(running != before, f"{aid} 1.6초 뒤 타이머가 흐른다")
    c.page.locator("#tgo").click()
    paused = _text(c, "#clock")
    c.page.wait_for_timeout(1200)
    c.eq(_text(c, "#clock"), paused, f"{aid} 일시정지한 시간이 유지된다")
    c.page.locator("#treset").click()
    c.eq(_text(c, "#clock"), before, f"{aid} 초기화하면 처음 시간으로 돌아온다")
    _prepare2022(c, aid)
    _baseline_room(c, "2022", 7)

    _prep(c, "2023")
    c.check(f"{aid} 2023 준비실")
    for node in ("1C", "2G", "1A", "2C", "2B", "3C", "3B", "2H", "3H", "4G"):
        c.page.locator(f'[data-node="{node}"]').click()
    c.eq(_text(c, "#yr"), "10 / 10년", f"{aid} 10년 계획이 완성된다")
    c.page.locator("#undo").click()
    c.eq(_text(c, "#yr"), "9 / 10년", f"{aid} 마지막 해를 취소한다")
    c.page.locator('[data-node="4G"]').click()
    for tab in ("wheel", "nb", "path"):
        c.page.locator(f'[data-tab="{tab}"]').click()
        c.check(f"{aid} 2023 자료 {tab}")
    c.page.locator("#q1-23").fill("나람국 과학 집중, 다람국 환경 집중.")
    c.page.locator("#q2-23").fill("환경 우선, 박람회 조건 충족.")
    _baseline_room(c, "2023", 9)

    _prepare2024(c, aid)
    _baseline_room(c, "2024", 7)
    _phase(c, "prep")
    c.page.wait_for_selector("#unlock")
    c.page.locator("#unlock").click()
    c.page.wait_for_selector("#lock")
    c.eq(c.page.locator("#lock").count(), 1, f"{aid} 다시 계획하면 확정 버튼이 돌아온다")

    _prep(c, "2025")
    c.check(f"{aid} 2025 준비실")
    for paper in ("red", "green", "black", "blue"):
        c.page.locator(f'[data-tab="{paper}"]').click()
        c.check(f"{aid} 2025 신문 {paper}")
    c.page.locator("[data-fact]").first.click()
    c.expect(c.page.locator("#overall25").input_value().startswith("["),
             f"{aid} 단서 카드가 종합 설명에 삽입된다")
    for paper, slot in (("red", 0), ("blue", 1), ("green", 2), ("black", 3)):
        c.page.locator(f'[data-sel="{paper}"]').click()
        c.page.locator(f'[data-slot="{slot}"]').click()
    c.expect("모두 배치" in _text(c, "#tray"), f"{aid} 신문 네 부를 모두 배치한다")
    c.page.locator('[data-down="0"]').click()
    c.expect("●" in _text(c, '[data-slot="0"]'), f"{aid} 신문을 아래로 옮긴다")
    c.page.locator('[data-up="1"]').click()
    c.expect("■" in _text(c, '[data-slot="0"]'), f"{aid} 신문을 위로 옮긴다")
    c.page.locator("#lk-0").fill("창간호의 매장량 우려가 고갈 기사로 이어짐")
    c.page.locator("#gp-0").fill("에너지청 공모")
    c.page.locator("#lk-1").focus()
    c.page.locator("[data-fact]").nth(1).click()
    c.expect("[" in c.page.locator("#lk-1").input_value(),
             f"{aid} 단서가 포커스된 연결 근거 칸에 삽입된다")
    c.check(f"{aid} 2025 준비실 완성")
    _baseline_room(c, "2025", 8)

    _prep(c, "2026")
    c.check(f"{aid} 2026 준비실")
    for tab in ("bb", "db", "ml", "wc", "crit"):
        c.page.locator(f'[data-tab="{tab}"]').click()
        c.check(f"{aid} 2026 자료 {tab}")
    _score2026(c)
    c.eq(_text(c, "tr.best td.name"), "울버린 켄텍카솔", f"{aid} 최고 합계 행을 강조한다")
    c.eq(_text(c, '[data-tot="wc"]'), "합계 25점", f"{aid} 추천 버튼에 합계를 표시한다")
    c.page.locator("#reason26").fill("사회/윤리 기준을 가장 무겁게 봄.")
    c.page.locator("#note-bb").fill("그래프와 문구 불일치")
    _phase(c, "room")
    c.expect("합계로는" in _text(c, ".qdeck"), f"{aid} 합계와 다른 추천 후속 질문이 있다")
    _phase(c, "prep")
    c.page.wait_for_selector("#go26")
    _baseline_room(c, "2026", 7)
    c.expect(c.page.locator("details.reveal").count() >= 8,
             f"{aid} 숨겨진 예시와 단서도 DOM에 남는다")
    c.goto("#home", wait=".pkg")
    c.eq(c.page.locator(".pkg").count(), 5, f"{aid} 기출 카드는 여전히 다섯 개다")
    c.eq(c.page.locator(".pkg .chip.accent").count(), 5, f"{aid} 다섯 해 이어서 하기를 표시한다")
    c.check(f"{aid} 기록이 있는 홈")
    c.page.reload()
    c.page.wait_for_selector(".pkg")
    _prep(c, "2026")
    c.expect(c.page.locator("#reason26").input_value().startswith("사회/윤리"),
             f"{aid} 새로고침 후 기록이 복원된다")


def t_T0b_3_time_settings(c: Ctx):
    aid = "T0b-3"
    _prep(c, "2022")
    _hidden(c, "#tmode", aid)
    _visible(c, "#tm-tip", aid)
    _hidden(c, "#timeset", aid)
    c.eq(c.page.locator("#tset").get_attribute("aria-expanded"), "false",
         f"{aid} 시간 설정은 처음에 닫혀 있다")
    _panel(c)
    c.eq(c.page.locator("#tset").get_attribute("aria-expanded"), "true",
         f"{aid} 시간 설정의 펼침 상태를 알린다")
    c.expect(c.page.evaluate('document.activeElement.matches(\'[data-tm="real"]\')'),
             f"{aid} 처음 실전 버튼에 포커스가 간다")
    c.page.locator('[data-tm="ext"]').click()
    c.eq(_text(c, "#clock"), "45:00", f"{aid} 연장은 즉시 45분을 표시한다")
    _pressed(c, '[data-tm="ext"]', True, aid)
    _visible(c, "#tmode", aid)
    c.eq(_text(c, "#tmode"), "연장 1.5배", f"{aid} 연장 모드를 표시한다")
    _hidden(c, "#tm-tip", aid)
    _hidden(c, "#tm-prep", aid)
    c.expect(c.contrast("#tmode") >= 4.5, f"{aid} 띠 모드 글자의 대비가 4.5 이상이다")
    c.eq(c.page.eval_on_selector("#tmode", "e => getComputedStyle(e).backgroundColor"),
         "rgba(0, 0, 0, 0)", f"{aid} 띠 칩 배경은 투명하다")
    c.check(f"{aid} 연장 시간 설정")
    c.page.locator('[data-tm="custom"]').click()
    _visible(c, "#tm-prep", aid)
    _visible(c, "#tm-answer", aid)
    c.page.locator("#tm-prep").fill("12")
    c.page.locator("#tm-prep").press("Tab")
    c.eq(_text(c, "#clock"), "12:00", f"{aid} 직접 입력한 준비 시간을 적용한다")
    c.page.locator('[data-tm="free"]').click()
    c.eq(_text(c, "#clock"), "00:00", f"{aid} 제한 없음은 경과 0초로 시작한다")
    c.eq(_text(c, "#tlabel"), "준비 경과", f"{aid} 제한 없음은 준비 경과를 표시한다")
    _hidden(c, "#tbar", aid)
    c.expect(c.page.eval_on_selector("#tbar", "e => e.hidden && getComputedStyle(e).display === 'none'"),
             f"{aid} 제한 없음 진행 막대는 hidden 속성과 display로 숨긴다")
    c.expect(not c.page.locator("#clock").evaluate("e => e.classList.contains('low')"),
             f"{aid} 제한 없음 시계에 시간 부족 경고를 붙이지 않는다")
    c.page.locator("#tgo").click()
    c.page.wait_for_timeout(1500)
    c.expect(_seconds(_text(c, "#clock")) >= 1, f"{aid} 제한 없음은 경과 시간을 센다")
    c.page.locator("#tgo").click()
    stopped = _text(c, "#clock")
    c.page.locator('[data-tm="real"]').click()
    _visible(c, "#tm-confirm", aid)
    c.eq(_text(c, "#clock"), stopped, f"{aid} 확인 전에는 진행한 시간이 유지된다")
    c.page.locator("#tm-yes").click()
    c.eq(_text(c, "#clock"), "30:00", f"{aid} 확인하면 실전 30분으로 초기화한다")
    _hidden(c, "#tm-confirm", aid)
    c.expect(c.page.eval_on_selector("#tbar", "e => !e.hidden && getComputedStyle(e).display !== 'none'"),
             f"{aid} 실전으로 돌아오면 진행 막대 hidden 속성을 뗀다")
    _hidden(c, "#tmode", aid)
    c.page.locator("#tgo").click()
    c.page.locator('[data-tm="ext"]').click()
    _visible(c, "#tm-confirm", aid)
    c.page.locator("#tm-no").click()
    _hidden(c, "#tm-confirm", aid)
    _pressed(c, '[data-tm="real"]', True, aid)
    c.page.wait_for_timeout(1200)
    c.expect(_seconds(_text(c, "#clock")) < 1800, f"{aid} 변경을 취소해도 시간은 계속 흐른다")
    c.page.locator('[data-tm="ext"]').click()
    c.page.locator("#tm-yes").click()
    c.eq(_text(c, "#clock"), "45:00", f"{aid} 연장 변경을 확인하면 45분으로 초기화한다")
    c.eq(_text(c, "#tgo"), "시작", f"{aid} 바꾼 타이머는 멈춘 상태다")
    c.page.locator('[data-think="10"]').click()
    _pressed(c, '[data-think="10"]', True, aid)
    c.page.locator("#tm-alert").uncheck()
    c.wait_saved(400)
    settings = c.ls("kcp:v1:x:settings") or {}
    c.eq(settings.get("timeMode"), "ext", f"{aid} 연장 설정을 저장한다")
    c.eq(settings.get("think"), 10, f"{aid} 생각 시간 10초를 저장한다")
    c.eq(settings.get("endAlert"), False, f"{aid} 종료 알림 해제를 저장한다")
    c.page.reload()
    c.page.wait_for_selector("#clock")
    c.eq(_text(c, "#clock"), "45:00", f"{aid} 새로고침 후 연장 시간을 복원한다")
    _panel(c)
    _pressed(c, '[data-tm="ext"]', True, aid)
    c.check(f"{aid} 복원한 시간 설정")


def t_T0b_4_class_url(c: Ctx):
    aid = "T0b-4"
    c.open("?prep=15&answer=8#y2022")
    c.page.wait_for_selector("#clock")
    c.eq(_text(c, "#clock"), "15:00", f"{aid} 수업 주소의 준비 시간을 적용한다")
    _visible(c, "#tmode", aid)
    c.eq(_text(c, "#tmode"), "수업 주소 15·8분", f"{aid} 수업 주소 시간을 표시한다")
    c.check(f"{aid} 2022 수업 주소 띠")
    c.goto("#home", wait=".home-grid")
    c.goto("#y2023", wait="#clock")
    c.eq(_text(c, "#clock"), "15:00", f"{aid} 다른 게임에도 수업 주소 시간을 적용한다")
    _panel(c)
    for sel in ('[data-tm="custom"]', "#tm-prep", "#tm-answer"):
        c.expect(_loc(c, sel).first.is_disabled(), f"{aid} {sel}은 수업 주소에서 비활성이다")
    for mode in ("real", "ext", "free"):
        c.expect(c.page.locator(f'[data-tm="{mode}"]').is_enabled(),
                 f"{aid} 수업 주소에서도 {mode}를 고를 수 있다")
    c.eq(_text(c, '[data-tm="real"]'), "수업 주소 시간", f"{aid} 실전 버튼 이름을 바꾼다")
    _pressed(c, '[data-tm="real"]', True, aid)
    c.expect("연장이나 시간 제한 없음은 그대로 고를 수 있습니다" in _text(c, "#tm-url"),
             f"{aid} 수업 주소의 조절 가능성을 안내한다")
    c.page.locator('[data-tm="ext"]').click()
    c.eq(_text(c, "#clock"), "22:30", f"{aid} 수업 주소 기준으로 1.5배 연장한다")
    c.expect("연장 1.5배" in _text(c, "#tmode"), f"{aid} 수업 주소 연장을 표시한다")
    c.page.locator('[data-tm="free"]').click()
    c.eq(_text(c, "#clock"), "00:00", f"{aid} 수업 주소에서도 제한 없음을 고른다")
    c.page.locator('[data-tm="real"]').click()
    c.eq(_text(c, "#clock"), "15:00", f"{aid} 수업 주소 시간으로 돌아간다")
    c.check(f"{aid} 수업 주소 시간 설정")


def t_T0b_5_url_not_persisted(c: Ctx):
    aid = "T0b-5"
    c.open("?prep=20&answer=10#y2022")
    c.page.wait_for_selector("#clock")
    _panel(c)
    c.page.locator("#tm-alert").uncheck()
    c.wait_saved(400)
    settings = c.ls("kcp:v1:x:settings") or {}
    c.expect("fromUrl" not in settings, f"{aid} 주소 여부를 저장하지 않는다")
    c.eq(settings.get("prep"), 15, f"{aid} 주소의 20분 대신 개인 기본값 15분을 저장한다")
    c.open("#y2022")
    c.page.wait_for_selector("#clock")
    c.eq(_text(c, "#clock"), "30:00", f"{aid} 주소 매개변수를 빼면 실전 시간이다")
    _hidden(c, "#tmode", aid)
    c.eq(c.page.evaluate("KCP.settings().timeMode"), "real", f"{aid} 개인 설정은 실전이다")
    c.check(f"{aid} 주소 제거 후 준비실")


def t_T0b_6_panel_focus(c: Ctx):
    if not c.cfg.mobile:
        return
    aid = "T0b-6"
    _prep(c, "2022")
    _phase(c, "room")
    c.page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    _panel(c)
    c.expect(c.page.eval_on_selector("#timeset", "e => {const r=e.getBoundingClientRect(); return r.top>=0 && r.top<innerHeight;}"),
             f"{aid} 아래에서 열어도 설정 패널은 화면 안에 있다")
    c.expect(c.page.evaluate("document.activeElement.matches('[data-tm]')"),
             f"{aid} 모드 버튼에 포커스가 간다")
    c.page.keyboard.press("Escape")
    _hidden(c, "#timeset", aid)
    c.eq(c.page.evaluate("document.activeElement.id"), "tset", f"{aid} 닫으면 설정 버튼에 포커스가 돌아온다")
    c.check(f"{aid} 모바일 면접실")


def t_T0b_7_room_sources(c: Ctx):
    aid = "T0b-7"
    _prepare2022(c, aid)
    _phase(c, "room")
    c.expect(c.page.locator("#room-main h3").filter(has_text="면접 질문 카드").count() == 1,
             f"{aid} 질문 패널 제목을 바꾼다")
    n = c.page.locator(".qdeck .qcard").count()
    c.eq(c.page.locator(".qdeck .qcard .who .tag-official").count(), 2,
         f"{aid} 2022 보고서 문항 태그는 두 개다")
    c.eq(c.page.locator(".qdeck .qcard .who .tag-mine").count(), n - 2,
         f"{aid} 나머지는 연습용 질문이다")
    c.expect("'보고서 문항'은 보고서에 실린 과제를 면접 질문 형태로 바꾼 것입니다" in _text(c, "#room-main"),
             f"{aid} 질문 출처를 설명한다")
    c.expect(c.page.eval_on_selector(".qdeck", "e => e.previousElementSibling.id === 'room-tools'"),
             f"{aid} 질문 덱 바로 앞의 슬롯을 유지한다")
    c.check(f"{aid} 2022 출처 표시")
    _prepare2024(c, aid)
    _phase(c, "room")
    c.eq(c.page.locator(".qdeck .qcard .who .tag-official").count(), 6,
         f"{aid} 2024 확정 뒤 보고서 문항 태그는 여섯 개다")
    c.check(f"{aid} 2024 출처 표시")


def t_T0b_8_stale_memos(c: Ctx):
    aid = "T0b-8"
    _score2026(c)
    _phase(c, "room")
    c.eq(c.page.locator("[data-stale]").count(), 0, f"{aid} 새 메모에는 어긋남 경고가 없다")
    c.page.locator('textarea[data-a="2"]').fill("합계와 다른 이유")
    _phase(c, "prep")
    c.page.wait_for_selector('[data-pick="wc"]')
    c.page.locator('[data-pick="wc"]').click()
    _phase(c, "room")
    _visible(c, '[data-stale="2"]', aid)
    c.expect("평가표 합계로는" in _text(c, '[data-stale="2"]'),
             f"{aid} 경고에 메모를 쓸 때의 질문이 있다")
    now = c.page.locator(".qdeck .qcard").nth(2).locator(".q").inner_text().strip()
    c.page.locator('[data-stale-keep="2"]').click()
    _absent(c, '[data-stale="2"]', aid)
    c.wait_saved(400)
    saved = c.ls("kcp:v1:2026") or {}
    c.eq(saved.get("answerQ", {}).get("2"), now, f"{aid} 유지하면 지금 질문 문장을 저장한다")
    _phase(c, "prep")
    c.page.wait_for_selector('[data-pick="ml"]')
    c.page.locator('[data-pick="ml"]').click()
    _phase(c, "room")
    _visible(c, '[data-stale="2"]', aid)
    c.page.locator('[data-stale-clear="2"]').click()
    _absent(c, '[data-stale="2"]', aid)
    c.eq(c.page.locator('textarea[data-a="2"]').input_value(), "", f"{aid} 메모 비우기가 입력칸을 비운다")
    c.wait_saved(400)
    saved = c.ls("kcp:v1:2026") or {}
    c.expect("2" not in saved.get("answers", {}), f"{aid} 비운 메모의 저장 키를 지운다")
    c.expect("2" not in saved.get("answerQ", {}), f"{aid} 비운 메모의 질문 기록도 지운다")
    c.check(f"{aid} 어긋남 처리 뒤 면접실")


def t_T0b_8_legacy_memos(c: Ctx):
    aid = "T0b-8"
    _inject(c, "2022", {"answers": {"0": "옛 메모"}})
    _prep(c, "2022")
    _phase(c, "room")
    c.eq(c.page.locator("[data-stale]").count(), 0, f"{aid} 질문 기록 없는 옛 메모에는 어긋남 경고가 없다")
    _visible(c, "#room-legacy", aid)
    c.eq(_text(c, "#room-legacy"), "질문이 기록되기 전에 쓴 옛 메모가 있습니다. 준비실 내용이 바뀌었다면 다른 질문 아래에 보일 수 있습니다.",
         f"{aid} 옛 메모 안내 문구가 정확하다")
    c.eq(c.page.locator("#room-legacy").count(), 1, f"{aid} 옛 메모 안내는 한 번만 둔다")
    c.expect(c.page.eval_on_selector("#room-legacy", "e=>{const tools=document.querySelector('#room-tools');return e.parentElement===tools.parentElement&&!!(e.compareDocumentPosition(tools)&Node.DOCUMENT_POSITION_FOLLOWING);}"),
             f"{aid} 옛 메모 안내를 질문 패널의 도구 슬롯 앞에 둔다")
    c.check(f"{aid} 옛 메모 면접실")


def t_T0b_8_orphan_memos(c: Ctx):
    aid = "T0b-8"
    _inject(c, "2022", {"answers": {"30": "남은 메모", "nonnumeric": "가상 비숫자 메모"},
                        "answerQ": {"30": "옛 질문"}})
    _prep(c, "2022")
    _phase(c, "room")
    _visible(c, "#room-orphans", aid)
    orphan = _text(c, "#room-orphans")
    for text in ("질문 목록에서 빠진 메모", "남은 메모", "옛 질문"):
        c.expect(text in orphan, f"{aid} 빠진 메모 블록에 {text}이 있다")
    c.expect("가상 비숫자 메모" not in orphan, f"{aid} 숫자가 아닌 키는 빠진 메모로 세지 않는다")
    c.page.locator("#orphan-clear").click()
    _absent(c, "#room-orphans", aid)
    c.wait_saved(400)
    saved = c.ls("kcp:v1:2022") or {}
    c.expect("30" not in saved.get("answers", {}), f"{aid} 빠진 메모 저장 키를 지운다")
    c.expect("30" not in saved.get("answerQ", {}), f"{aid} 빠진 메모 질문 키도 지운다")
    c.eq(saved.get("answers", {}).get("nonnumeric"), "가상 비숫자 메모", f"{aid} 비숫자 키는 보존한다")
    c.check(f"{aid} 빠진 메모 지우기")


def t_T0b_8_legacy_orphan_2026(c: Ctx):
    aid = "T0b-8"
    _inject(c, "2026", {"answers": {"6": "옛 메모"}})
    _prep(c, "2026")
    _phase(c, "room")
    _visible(c, "#room-legacy", aid)
    c.check(f"{aid} 2026 목록 밖 옛 메모 안내")


def t_T0b_9_answer_advice(c: Ctx):
    aid = "T0b-9"
    for year in YEARS:
        _prep(c, year)
        _phase(c, "room")
        panel = c.page.locator("#room-main section.panel").filter(
            has=c.page.locator("h3", has_text="답변 요령"))
        panel.wait_for(state="visible")
        text = panel.inner_text()
        c.expect(ADVICE in text, f"{aid} {year} 답 수정과 유지 이유를 안내한다")
        c.expect("평가 기준으로 명시합니다" not in text, f"{aid} {year} 단정한 옛 안내를 지운다")
        c.eq(panel.locator("h3 .tag-mine").inner_text().strip(), "연습용 조언",
             f"{aid} {year} 답변 요령의 출처를 표시한다")
        if year == "2022":
            c.expect("비판적 의견을 수용하고" in text, f"{aid} 2022 평가 기준을 인용한다")
        if year == "2024":
            c.expect("한계점을 인정하고" in text, f"{aid} 2024 평가 기준을 인용한다")
        if year in ("2025", "2026"):
            c.expect("비판 수용 항목이 따로 없습니다" in text and "유연한 사고" in text,
                     f"{aid} {year} 유연한 사고와의 관련성을 설명한다")
            c.expect("연습용 해석" in panel.locator(".tag-mine").all_text_contents(),
                     f"{aid} {year} 해석 표시를 붙인다")
        if year in ("2022", "2024", "2025", "2026"):
            c.expect("평가 기준" in panel.locator(".tag-official").all_text_contents(),
                     f"{aid} {year} 인용에 평가 기준 표시를 붙인다")
        c.check(f"{aid} {year} 답변 요령")


def t_T0b_10_self_assessment(c: Ctx):
    aid = "T0b-10"
    _prep(c, "2022")
    _phase(c, "reflect")
    c.eq(_text(c, "#rsum"), "점검 0/9 · 잘함 0 · 보통 0 · 미흡 0", f"{aid} 미선택 자기 평가 요약이 정확하다")
    c.expect(c.page.eval_on_selector("#rsum", "e => e.closest('h3') === null && e.tagName === 'P' && e.previousElementSibling.tagName === 'H3'"),
             f"{aid} 요약을 제목 밖 바로 아래 문단으로 둔다")
    c.page.locator('.seg button[data-v="3"]').first.click()
    c.page.locator('.seg button[data-v="2"]').nth(1).click()
    c.eq(_text(c, "#rsum"), "점검 2/9 · 잘함 1 · 보통 1 · 미흡 0", f"{aid} 선택 단계별 개수를 표시한다")
    c.expect("/ 27" not in _text(c, "#rsum"), f"{aid} 자기 평가 합계 점수를 표시하지 않는다")
    panel = c.page.locator("section.panel").filter(has=c.page.locator("#rsum"))
    c.eq(panel.locator("h3 .tag-official").inner_text().strip(), "기준 문구: 보고서", f"{aid} 기준 문구의 출처를 표시한다")
    c.eq(panel.locator("h3 .tag-mine").inner_text().strip(), "연습용 척도", f"{aid} 연습용 척도를 구별한다")
    c.expect("대학의 채점 단계나 배점을 옮기지 않았습니다" in panel.inner_text(), f"{aid} 자기 평가 단계의 의미를 설명한다")
    c.check(f"{aid} 자기 평가")
    if c.cfg.mobile:
        c.page.set_viewport_size({"width": 375, "height": 812})
        c.expect(c.page.eval_on_selector("#rsum", "e => e.getBoundingClientRect().right <= e.closest('.panel').getBoundingClientRect().right"),
                 f"{aid} 375px에서 요약이 패널 폭 안에 있다")
        c.check(f"{aid} 375px 성찰")


def t_T0b_11_comparison(c: Ctx):
    aid = "T0b-11"
    _score2026(c)
    _phase(c, "reflect")
    for sel in ("#exwrap", "#exafter", "#better-2026"):
        _hidden(c, sel, aid)
    c.expect(c.page.locator("#openEx").is_disabled(), f"{aid} 기준을 쓰기 전 열기 버튼은 비활성이다")
    c.expect(c.page.locator("details.reveal").count() >= 8, f"{aid} 숨겨진 예시도 DOM에 여덟 개 이상 있다")
    c.eq(_text(c, "#skipEx"), "교사 시연용: 적지 않고 열기", f"{aid} 시연용 열기 이름이 정확하다")
    c.expect(c.page.eval_on_selector("#skipEx", "e => !document.querySelector('#openEx').closest('.row').contains(e)"),
             f"{aid} 시연용 버튼을 주 열기 버튼 줄과 분리한다")
    c.page.locator("#before-2026").fill("abc")
    c.expect(c.page.locator("#openEx").is_disabled(), f"{aid} 10자 미만에서는 열 수 없다")
    before = "안전성을 가장 무겁게 봄"
    c.page.locator("#before-2026").fill(before)
    c.expect(c.page.locator("#openEx").is_enabled(), f"{aid} 10자 이상이면 열 수 있다")
    c.page.locator("#openEx").click()
    for sel in ("#exwrap", "#exafter", "#better-2026", "#gap-2026"):
        _visible(c, sel, aid)
    c.expect(c.page.evaluate("document.activeElement === document.querySelector('#exwrap summary')"),
             f"{aid} 예시의 첫 summary로 포커스를 옮긴다")
    _hidden(c, "#openEx", aid)
    _hidden(c, "#skipEx", aid)
    c.expect("자료와 대조해 읽습니다" not in _text(c, "#exafter"), f"{aid} 2026에는 예시 아래 안내를 중복하지 않는다")
    c.page.locator("#better-2026").fill("수치와 문장을 함께 짚음")
    c.page.locator("#gap-2026").fill("장기 안전 자료가 부족함")
    c.wait_saved(400)
    compare = (c.ls("kcp:v1:2026") or {}).get("compare", {})
    c.eq(compare, {"before": before, "open": True, "better": "수치와 문장을 함께 짚음", "gap": "장기 안전 자료가 부족함"},
         f"{aid} 비교 입력과 열린 상태를 저장한다")
    c.check(f"{aid} 열린 예시 비교")
    c.page.reload()
    c.page.wait_for_selector("table.rubric")
    _visible(c, "#exwrap", aid)
    _prep(c, "2022")
    _phase(c, "reflect")
    c.page.locator("#skipEx").click()
    c.expect("자료와 대조해 읽습니다" in _text(c, "#exafter"), f"{aid} 2022에는 자료 대조 안내를 둔다")
    c.check(f"{aid} 2022 예시 비교")
    _prep(c, "2025")
    _phase(c, "reflect")
    c.expect("창간호" in c.page.locator("#before-2025").get_attribute("placeholder"), f"{aid} 2025에는 창간호 판단 기준 예시를 준다")


def t_T0b_11_comparison_layout(c: Ctx):
    aid = "T0b-11"
    placeholders = {
        "2022": "예: 주민 건강을 발전 비용보다 앞에 두었다",
        "2023": "예: 환경 지수를 과학 지수보다 앞에 두었다",
        "2024": "예: 정착민의 건강을 에너지 여유보다 앞에 두었다",
        "2025": "예: 창간호를 처음에 둔 근거",
        "2026": "예: 안전성을 기능/효과보다 무겁게 보았다",
    }
    for year in YEARS:
        _prep(c, year)
        _phase(c, "reflect")
        c.eq(c.page.locator(f"#before-{year}").get_attribute("placeholder"), placeholders[year],
             f"{aid} {year} 판단 기준 입력 예시가 정확하다")
        c.eq(_text(c, f'label[for="before-{year}"]'), "예시를 열기 전에 · 내 답에서 가장 무겁게 본 판단 기준 한 줄",
             f"{aid} {year} 예시보다 먼저 내 기준을 쓰게 안내한다")
        c.expect(c.page.evaluate("""() => {
          const before=document.querySelector('textarea[id^="before-"]').closest('.field');
          const open=document.querySelector('#openEx').closest('.row');
          const skip=document.querySelector('#skipEx').closest('p');
          const wrap=document.querySelector('#exwrap'),after=document.querySelector('#exafter');
          const precedes=(a,b)=>!!a&&!!b&&!!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);
          return precedes(before,open)&&precedes(open,skip)&&precedes(skip,wrap)&&precedes(wrap,after);
        }"""), f"{aid} {year} 기준·열기·시연·예시·비교 입력 순서를 유지한다")
        _hidden(c, "#exwrap", aid)
        _hidden(c, "#exafter", aid)
        c.check(f"{aid} {year} 비교 패널 순서")


def t_T0b_12_copy_stale(c: Ctx):
    aid = "T0b-12"
    _stale2026(c)
    _phase(c, "reflect")
    c.page.locator("#before-2026").fill("안전성을 가장 무겁게 봄")
    copied = _copy(c)
    for text in ("Q1. [보고서 문항]", "[연습용 질문]", "(메모를 쓸 때의 질문:",
                 "■ 예시와 비교", "내 기준: 안전성을 가장 무겁게 봄"):
        c.expect(text in copied, f"{aid} 복사 글에 {text}이 있다")
    c.expect("■ 자기 평가" in copied and "■ 예시와 비교" in copied and
             copied.index("■ 자기 평가") < copied.index("■ 예시와 비교"),
             f"{aid} 비교 블록은 자기 평가 뒤에 둔다")
    c.check(f"{aid} 복사할 성찰 화면")


def t_T0b_12_copy_without_comparison(c: Ctx):
    aid = "T0b-12"
    _prep(c, "2022")
    _phase(c, "reflect")
    c.expect("■ 예시와 비교" not in _copy(c), f"{aid} 비교 입력이 없으면 복사 블록도 없다")


def t_T0b_12_copy_orphans(c: Ctx):
    aid = "T0b-12"
    _inject(c, "2022", {"answers": {"30": "남은 메모"}, "answerQ": {"30": "옛 질문"}})
    _prep(c, "2022")
    _phase(c, "reflect")
    copied = _copy(c)
    c.expect("- 질문 목록에서 빠진 메모: (메모를 쓸 때의 질문: 옛 질문) 남은 메모" in copied,
             f"{aid} 빠진 메모도 옛 질문과 함께 복사한다")


def t_T0b_13_home_and_clear(c: Ctx):
    aid = "T0b-13"
    c.goto("#home", wait=".home-notes")
    legend = c.page.locator(".home-notes section").filter(has=c.page.locator("h2", has_text="표시 읽는 법"))
    legend.wait_for(state="visible")
    c.eq(legend.locator("ul > li").count(), 3, f"{aid} 표시 읽는 법은 세 항목이다")
    c.expect(legend.locator(".tag-official").count() >= 2 and legend.locator(".tag-mine").count() >= 2,
             f"{aid} 보고서와 연습실 표시 예시를 제공한다")
    usage = c.page.locator(".home-notes section").filter(has=c.page.locator("h2", has_text="이 연습실 쓰는 법"))
    for text in ("면접위원 보기", "시간 설정", "짧은 판단 훈련장", "창작 쟁점 게임은 기출과 같은 순서"):
        c.expect(text in usage.inner_text(), f"{aid} 사용 안내에 {text}이 있다")
    c.expect("연습용 정리" in c.page.locator(".evo th .tag-mine").all_text_contents(),
             f"{aid} 형식 변화 표의 정리를 연습용으로 표시한다")
    c.expect(c.page.eval_on_selector(".home-grid", "e => e.nextElementSibling.id === 'home-slot'"),
             f"{aid} 홈 슬롯 위치를 유지한다")
    row = c.page.locator(".evo tr").filter(has_text="2022")
    c.expect("얻는 것과 잃는 것" in row.inner_text(), f"{aid} 2022 핵심 사고 용어를 바꾼다")
    c.expect("트레이드오프" not in row.inner_text(), f"{aid} 2022 행에서 옛 용어를 지운다")
    _hidden(c, "#wipeConfirm", aid)
    c.page.locator("#wipeAll").click()
    _visible(c, "#wipeConfirm", aid)
    c.eq(c.page.evaluate("document.activeElement.id"), "wipeNo", f"{aid} 모두 지우기는 취소 버튼에 포커스를 둔다")
    c.page.locator("#wipeNo").click()
    _hidden(c, "#wipeConfirm", aid)
    c.eq(c.page.evaluate("document.activeElement.id"), "wipeAll", f"{aid} 취소하면 원래 버튼에 포커스가 돌아온다")
    c.page.evaluate("""() => {
      for (const y of ['2022','2023']) {const s=KCP.load(y); s.memo='가상 연습 메모'; KCP.save(y,s);}
      KCP.setSettings({timeMode:'ext'});
    }""")
    c.page.locator("#wipeAll").click()
    c.page.locator("#wipeYes").click()
    c.page.wait_for_selector(".home-grid")
    c.wait_saved(400)
    c.eq(c.page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('kcp:')).length"), 0,
         f"{aid} 모두 지운 기록은 대기 저장으로 되살아나지 않는다")
    c.eq(c.page.locator(".pkg .chip.accent").count(), 0, f"{aid} 기출 이어서 하기 표시도 지운다")
    c.eq(c.page.evaluate("KCP.settings().timeMode"), "real", f"{aid} 설정을 기본 실전으로 되돌린다")
    toast = c.page.get_by_text("이 기기의 기록을 지웠습니다", exact=True)
    toast.wait_for(state="visible")
    c.expect(toast.is_visible(), f"{aid} 모두 지우기 완료 토스트를 보인다")
    c.check(f"{aid} 지운 뒤 홈")
    _prep(c, "2022")
    _phase(c, "reflect")
    c.page.locator("#resetAll").click()
    c.expect("다음 연습 목표" in _text(c, "#confirmReset"), f"{aid} 연도 기록 지우기 범위에 목표도 알린다")


def t_T0b_14_all_screens(c: Ctx):
    aid = "T0b-14"
    c.goto("#home", wait=".home-grid")
    c.check(f"{aid} 홈")
    for year in YEARS:
        _prep(c, year)
        c.check(f"{aid} {year} 준비실")
        _panel(c)
        c.check(f"{aid} {year} 시간 설정")
        c.page.locator("#tset").click()
        _phase(c, "room")
        c.check(f"{aid} {year} 면접실")
        _phase(c, "reflect")
        c.check(f"{aid} {year} 성찰")
        if c.cfg.mobile:
            c.page.set_viewport_size({"width": 375, "height": 812})
            c.check(f"{aid} {year} 375px 성찰")
            c.page.set_viewport_size({"width": c.cfg.width, "height": c.cfg.height})
    c.open("?prep=15&answer=8#y2022")
    c.page.wait_for_selector("#tmode")
    c.check(f"{aid} 수업 주소 띠")
    _panel(c)
    c.check(f"{aid} 수업 주소 설정 패널")
    # console error/warning, pageerror, 요청 실패는 harness가 함수별로 수집한다.


def t_T0b_2_route_save(c: Ctx):
    aid = "T0b-2"
    _prep(c, "2022")
    c.page.locator("#tgo").click()
    c.goto("#y2023", wait="#q1-23")
    c.page.locator("#q1-23").fill("abc")
    c.wait_saved(400)
    saved23 = c.ls("kcp:v1:2023") or {}
    c.eq(saved23.get("game", {}).get("q1"), "abc", f"{aid} T0a-2 다른 연도의 입력을 독립 저장한다")
    left = (c.ls("kcp:v1:2022") or {}).get("timer", {}).get("left")
    c.expect(left is not None, f"{aid} T0a-2 이전 연도 타이머를 저장한다")
    c.page.wait_for_timeout(1200)
    c.wait_saved(400)
    c.eq((c.ls("kcp:v1:2022") or {}).get("timer", {}).get("left"), left,
         f"{aid} T0a-2 떠난 연도 타이머는 더 줄지 않는다")
    c.check(f"{aid} T0a-2 라우트 전환")


def t_T0b_2_pending_storage(c: Ctx):
    aid = "T0b-2"
    c.goto("#home", wait=".home-grid")
    r = c.page.evaluate("""() => {
      const s=KCP.load('2025'); s.memo='p'; KCP.save('2025',s);
      const r=KCP.load('2025');
      const out={memo:r.memo, copied:r!==s, pending:localStorage.getItem('kcp:v1:2025')===null};
      r.memo='changed'; out.detached=KCP.load('2025').memo==='p';
      KCP.flush();
      KCP.store.set('t0',{a:1}); const a=KCP.store.get('t0',null);
      out.store=a.a; a.a=2; out.storeDetached=KCP.store.get('t0',null).a===1;
      KCP.save('2022',KCP.load('2022')); KCP.store.set('t1',1);
      const s2=KCP.load('2024'); s2.memo='ph'; KCP.save('2024',s2);
      window.dispatchEvent(new Event('pagehide'));
      return out;
    }""")
    c.eq(r.get("memo"), "p", f"{aid} T0a-3 대기 중 저장값을 즉시 읽는다")
    for key in ("copied", "pending", "detached", "storeDetached"):
        c.expect(r.get(key), f"{aid} T0a-3 대기 저장 복제·디바운스 조건 {key}를 지킨다")
    c.eq(r.get("store"), 1, f"{aid} T0a-3 store도 쓰자마자 읽을 수 있다")
    c.wait_saved(400)
    c.eq((c.ls("kcp:v1:2025") or {}).get("memo"), "p", f"{aid} T0a-3 flush가 대기 저장을 실행한다")
    c.expect(c.ls("kcp:v1:2022") is not None, f"{aid} T0a-3 연도 키를 저장한다")
    c.eq(c.ls("kcp:v1:x:t1"), 1, f"{aid} T0a-3 별도 store 키도 저장한다")
    c.eq((c.ls("kcp:v1:2024") or {}).get("memo"), "ph", f"{aid} T0a-3 pagehide가 대기 저장을 실행한다")


def t_T0b_2_reset_goal(c: Ctx):
    aid = "T0b-2"
    _prep(c, "2022")
    c.expect(c.page.evaluate("KCP.goPhase('reflect')"), f"{aid} T0a-4 API로 성찰 단계에 간다")
    c.page.wait_for_selector("#nextstep-2022")
    c.page.locator("#nextstep-2022").fill("결론 먼저")
    c.wait_saved(400)
    goal = c.ls("kcp:v1:x:goal") or {}
    for key, value in (("src", "2022"), ("title", "2022 미션 켄텍"), ("text", "결론 먼저")):
        c.eq(goal.get(key), value, f"{aid} T0a-4 다음 목표의 {key}를 저장한다")
    c.expect(isinstance(goal.get("at"), (int, float)) and goal["at"] > 0,
             f"{aid} T0a-4 목표 생성 시각을 저장한다")
    c.eq(c.page.evaluate("KCP.goal.get()"), goal, f"{aid} T0a-4 목표 API가 저장 목표를 돌려준다")
    c.page.locator("#tgo").click()
    c.page.locator("#resetAll").click()
    c.page.locator("#doReset").click()
    c.wait_saved(400)
    c.eq(c.ls("kcp:v1:2022"), None, f"{aid} T0a-4 연도 기록을 지운다")
    c.eq(c.ls("kcp:v1:x:goal"), None, f"{aid} T0a-4 같은 연도의 목표도 지운다")
    c.page.evaluate("""() => {
      KCP.goal.set('2023','2023 가람국 10년 계획','유지'); KCP.reset('2022');
      KCP.goal.set('2022','x','   ');
    }""")
    c.wait_saved(400)
    c.eq((c.ls("kcp:v1:x:goal") or {}).get("src"), "2023", f"{aid} T0a-4 다른 연도의 목표와 빈 목표 입력을 처리한다")


def t_T0b_2_clear_api(c: Ctx):
    aid = "T0b-2"
    _prep(c, "2022")
    c.goto("#home", wait=".home-grid")
    c.page.evaluate("KCP.flush && KCP.flush()")
    c.page.evaluate("localStorage.setItem('other','1')")
    c.page.reload()
    c.page.wait_for_selector(".home-grid")
    c.page.evaluate("""() => {
      KCP.store.set('drill',{x:1});
      window.__clearCount=0; KCP.on('storage:clear',()=>window.__clearCount++);
      const s=KCP.load('2023'); s.memo='z'; KCP.save('2023',s); KCP.clearAll();
    }""")
    c.wait_saved(400)
    c.eq(c.page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('kcp:')).length"), 0,
         f"{aid} T0a-5 clearAll이 대기 저장까지 취소한다")
    c.eq(c.ls("other"), 1, f"{aid} T0a-5 앱 밖 저장 키는 보존한다")
    c.eq(c.page.evaluate("window.__clearCount"), 1, f"{aid} T0a-5 storage:clear를 한 번 발생시킨다")


def _slot_ownership(c, sel):
    return c.page.eval_on_selector(sel, """e => Array.from(e.children).every(ch =>
      /^(jn-|pb-|pv-|dr-)/.test(ch.id) ||
      Array.from(ch.classList).some(n => /^(jn-|pb-|pv-|dr-)/.test(n)))""")


def t_T0b_2_events_slots(c: Ctx):
    aid = "T0b-2"
    c.goto("#home", wait=".home-grid")
    c.expect(c.page.eval_on_selector(".home-grid", "e=>e.nextElementSibling.id==='home-slot'"), f"{aid} T0a-6 홈 슬롯 위치를 유지한다")
    c.expect(c.page.eval_on_selector("#home-slot", "e=>e.classList.contains('stack')&&e.classList.contains('ext-slot')"), f"{aid} T0a-6 홈 슬롯 클래스를 유지한다")
    c.expect(_slot_ownership(c, "#home-slot"), f"{aid} T0a-6 홈 슬롯 자식은 모듈 접두어를 가진다")
    count = c.page.evaluate("""() => {
      window.__homeCount=0; KCP.on('home:render',()=>window.__homeCount++);
      KCP.rerender(); return window.__homeCount;
    }""")
    c.eq(count, 1, f"{aid} T0a-6 다시 그릴 때 home:render를 한 번 발생시킨다")
    _prep(c, "2022")
    c.expect(c.page.eval_on_selector("#phase", "e=>e.children[0].id==='prep-top'&&e.children[1].id==='prep-body'"), f"{aid} T0a-6 준비실 슬롯 순서를 유지한다")
    c.expect(c.page.eval_on_selector("#grid", "e=>!!e.closest('#prep-body')"), f"{aid} T0a-6 기존 게임은 준비실 본문 안에 그린다")
    c.page.evaluate("""() => {
      window.__events={prep:0,card:0,room:0,reflect:0,order:[],valid:true};
      const e=window.__events;
      KCP.on('prep:render',p=>{e.prep++;e.valid&&=p.root.id==='phase'&&p.top.id==='prep-top'&&p.body.id==='prep-body'&&typeof p.save==='function';});
      KCP.on('room:card',p=>{e.card++;e.order.push('card');e.valid&&=p.key===p.q.k&&p.slot===document.querySelector('.qx[data-qx="'+p.i+'"]')&&p.card.classList.contains('qcard')&&typeof p.save==='function';});
      KCP.on('room:render',p=>{e.room++;e.order.push('room');e.valid&&=p.main.id==='room-main'&&p.alt.id==='room-alt'&&p.tools.id==='room-tools'&&p.side.id==='room-side';});
      KCP.on('reflect:render',p=>{e.reflect++;e.qs=p.qs.length;e.expected=KCP.games[p.year].questions(p.state).length;e.valid&&=p.left.id==='reflect-left'&&p.right.id==='reflect-right';});
      KCP.on('phase:change',p=>{e.phase={from:p.from,to:p.to};});
    }""")
    _phase(c, "room")
    events = c.page.evaluate("window.__events")
    n = c.page.locator(".qdeck .qcard").count()
    c.eq(events["card"], n, f"{aid} T0a-6 질문 카드별 이벤트를 한 번씩 낸다")
    c.eq(events["room"], 1, f"{aid} T0a-6 면접실 이벤트는 한 번 낸다")
    c.eq(events["order"], ["card"] * n + ["room"], f"{aid} T0a-6 카드 이벤트 뒤 면접실 이벤트를 낸다")
    c.eq(events["phase"], {"from": "prep", "to": "room"}, f"{aid} T0a-6 단계 전환 payload를 유지한다")
    c.expect(events["valid"], f"{aid} T0a-6 이벤트 payload의 요소·질문 키·저장 함수를 유지한다")
    c.expect(c.page.eval_on_selector('textarea[data-a="0"]', "e=>e.nextElementSibling.matches('.qx[data-qx=\"0\"]')"), f"{aid} T0a-6 메모 바로 뒤 카드 슬롯을 유지한다")
    c.expect(c.page.eval_on_selector(".qdeck", "e=>e.previousElementSibling.id==='room-tools'"), f"{aid} T0a-6 덱 바로 앞 도구 슬롯을 유지한다")
    c.expect(c.page.eval_on_selector("#room-side", "e=>e.previousElementSibling.querySelector('h3').textContent.includes('준비실에서 만든 답')&&e.nextElementSibling.querySelector('h3').textContent.startsWith('답변 요령')"), f"{aid} T0a-6 오른쪽 슬롯의 앞뒤 패널을 유지한다")
    c.expect(c.page.eval_on_selector("#room-main", "e=>!!e.querySelector('.desk')&&e.nextElementSibling.id==='room-alt'"), f"{aid} T0a-6 지원자 보기와 대체 보기 순서를 유지한다")
    _hidden(c, "#room-alt", aid)
    c.expect(c.page.evaluate("KCP.roomAlt(true)"), f"{aid} T0a-6 대체 보기를 열 수 있다")
    _hidden(c, "#room-main", aid)
    c.expect(c.page.eval_on_selector("#room-alt", "e=>!e.hidden&&getComputedStyle(e).display!=='none'"), f"{aid} T0a-6 대체 보기의 hidden 상태를 바꾼다")
    c.page.evaluate("KCP.roomAlt(false)")
    _visible(c, "#room-main", aid)
    _hidden(c, "#room-alt", aid)
    for sel in ("#room-tools", "#room-side", '.qx[data-qx="0"]'):
        c.expect(_slot_ownership(c, sel), f"{aid} T0a-6 {sel} 자식은 모듈 접두어를 가진다")
    c.check(f"{aid} T0a-6 면접실 슬롯")
    _phase(c, "reflect")
    events = c.page.evaluate("window.__events")
    c.eq(events["reflect"], 1, f"{aid} T0a-6 성찰 이벤트는 한 번 낸다")
    c.eq(events["qs"], events["expected"], f"{aid} T0a-6 성찰 payload에 현재 질문을 전달한다")
    c.expect(events["valid"], f"{aid} T0a-6 성찰 슬롯 payload도 유지한다")
    c.expect(c.page.eval_on_selector("#phase .desk", "e=>e.children[0].lastElementChild.id==='reflect-left'&&e.children[1].lastElementChild.id==='reflect-right'"), f"{aid} T0a-6 양쪽 성찰 열 끝에 슬롯을 둔다")
    for sel in ("#reflect-left", "#reflect-right"):
        c.expect(_slot_ownership(c, sel), f"{aid} T0a-6 {sel} 자식은 모듈 접두어를 가진다")
    _phase(c, "prep")
    c.eq(c.page.evaluate("window.__events.prep"), 1, f"{aid} T0a-6 준비실로 돌아오면 이벤트가 한 번 늘어난다")
    _prepare2024(c, aid, lock=False)
    before = c.page.evaluate("""() => {document.querySelector('#prep-top').dataset.mark='1';return window.__events.prep;}""")
    c.page.locator("#lock").click()
    c.page.wait_for_selector("#unlock")
    c.eq(c.page.locator("#prep-top").get_attribute("data-mark"), "1", f"{aid} T0a-6 2024 자체 그리기는 상단 슬롯을 보존한다")
    c.eq(c.page.evaluate("window.__events.prep"), before, f"{aid} T0a-6 2024 자체 그리기는 공통 이벤트를 중복 발생시키지 않는다")


def t_T0b_2_ext_idempotent(c: Ctx):
    aid = "T0b-2"
    checks = c.page.evaluate("""() => {
      const s={}, a=KCP.ext(s,'x',{a:1,b:{c:1}}), b=KCP.ext(s,'x',{a:2,d:3});
      const out=[a===b,s.ext.x===a,a.a===1,a.d===3,a.b.c===1];
      a.a=5; out.push(KCP.ext(s,'x',{a:1}).a===5);
      const d={o:{}};out.push(KCP.ext(s,'y',d).o!==d.o);
      s.ext.z=[1];const z=KCP.ext(s,'z',{a:1});out.push(!Array.isArray(z)&&z.a===1);
      const s2={ext:'bad'};KCP.ext(s2,'q',{});
      out.push(!!s2.ext&&typeof s2.ext==='object'&&!Array.isArray(s2.ext)&&typeof s2.ext.q==='object');
      return out;
    }""")
    for i, ok in enumerate(checks, 1):
        c.expect(ok, f"{aid} T0a-7 ext 멱등·기본값·형 보정 조건 {i}를 지킨다")


def t_T0b_2_string_tools(c: Ctx):
    aid = "T0b-2"
    for word, pair, expected in (("효율", "을/를", "효율을"), ("에너지", "을/를", "에너지를"),
                                  ("서울", "으로/로", "서울로"), ("바다", "으로/로", "바다로"),
                                  ("산", "으로/로", "산으로"), ("효율", "와/과", "효율과"),
                                  ("비용", "이고/고", "비용이고"), ("에너지", "이고/고", "에너지고"),
                                  ("A", "을/를", "A을(를)"), ("A", "으로/로", "A(으)로")):
        c.eq(c.page.evaluate("([w,p])=>KCP.josa(w,p)", [word, pair]), expected,
             f"{aid} T0a-8 {word}의 {pair} 조사를 처리한다")
    head = "제가 판단 기준으로 삼은 것은 "
    cases = [
        ([{"n": "효율", "w": 3}, {"n": "형평성", "w": 2}, {"n": "안전", "w": 2}], head + "효율, 형평성, 안전이고, 효율을 가장 무겁게 두었습니다."),
        ([{"n": n, "w": 2} for n in ("효율", "형평성", "안전")], head + "효율, 형평성, 안전이고, 세 기준을 같은 무게로 두었습니다."),
        ([{"n": "안전", "w": 1}, {"n": "비용", "w": 1}], head + "안전, 비용이고, 두 기준을 같은 무게로 두었습니다."),
        ([{"n": "효율", "w": 3}, {"n": "형평성", "w": 3}, {"n": "안전", "w": 1}], head + "효율, 형평성, 안전이고, 효율과 형평성을 똑같이 가장 무겁게 두었습니다."),
        ([{"n": "효율", "w": 3}, {"n": "비용", "w": 2}], head + "효율, 비용이고, 효율을 가장 무겁게 두었습니다."),
        ([{"n": "효율", "w": 3}, {"n": "비용", "w": 0}], head + "효율, 비용입니다."),
        ([{"n": "효율", "w": 3}, {"n": "비용"}], head + "효율, 비용입니다."),
        ([{"n": "효율", "w": 0}], head + "효율입니다."),
        ([{"n": "  ", "w": 3}], ""), ([], ""), (None, ""),
    ]
    for i, (crit, expected) in enumerate(cases, 1):
        c.eq(c.page.evaluate("a=>KCP.critSentence(a)", crit), expected,
             f"{aid} T0a-8 기준 문장 사례 {i}가 정확하다")
    for i, (trade, expected) in enumerate([
        ({"pick": "풍력", "gain": "환경", "cost": "공급 안정"}, "풍력은 환경 면에서 유리하지만 공급 안정 면에서는 불리합니다."),
        ({"pick": "소형 원자로", "gain": "출력 안정성", "cost": "폐기물"}, "소형 원자로는 출력 안정성 면에서 유리하지만 폐기물 면에서는 불리합니다."),
        ({"pick": "이 순서", "gain": "생명·건강", "cost": ""}, "이 순서는 생명·건강 면에서 유리합니다."),
        ({"pick": "풍력", "gain": "", "cost": "비용"}, "풍력은 비용 면에서 불리합니다."),
        ({"pick": "", "gain": "a", "cost": "b"}, ""), ({"pick": "풍력"}, ""),
    ], 1):
        c.eq(c.page.evaluate("a=>KCP.tradeSentence(a)", trade), expected,
             f"{aid} T0a-8 얻고 잃는 것 문장 사례 {i}가 정확하다")
    checks = c.page.evaluate("""() => [
      KCP.qkey({k:'22-q1',tag:'x',q:'y'})==='22-q1',
      /^[0-9a-z]+$/.test(KCP.qkey({tag:'x',q:'y'})),
      KCP.qkey({tag:'x',q:'y'})===KCP.qkey({tag:'x',q:'y'}),
      KCP.qkey({tag:'x',q:'y'})!==KCP.qkey({tag:'x',q:'z'}),
      /tag-official/.test(KCP.srcTag({src:'report'}))&&/보고서 문항/.test(KCP.srcTag({src:'report'})),
      /tag-mine/.test(KCP.srcTag({}))&&/연습용 질문/.test(KCP.srcTag({})),
      KCP.findCriterion('2022',/비판적 의견/)==='비판적 의견을 수용하고 발전된 방안을 탐구하는가',
      /한계점을 인정하고/.test(KCP.findCriterion('2024',/한계점/)),
      KCP.findCriterion('2025',/비판적 의견|한계점/)===null,
      /유연한 사고/.test(KCP.findCriterion('2025',/유연한 사고/)),
      KCP.fmt(65)==='01:05',KCP.mss(65)==='1:05',KCP.mss(5)==='0:05'
    ]""")
    for i, ok in enumerate(checks, 1):
        c.expect(ok, f"{aid} T0a-8 키·출처·기준·시간 도구 조건 {i}를 지킨다")


def t_T0b_2_practice_data(c: Ctx):
    aid = "T0b-2"
    checks = c.page.evaluate("""() => {
      const a=KCP.probeDeck('인문적 통찰'),b=KCP.probeDeck('인문적 통찰');
      const typed=a.every(c=>c.typeName===KCP.PROBE_TYPES.find(t=>t.k===c.k).n);
      a[0].text='changed';
      return [
        KCP.PROBES.map(p=>p.id).join(',')==='E1,E2,C1,C2,T1,T2,F1,F2,L1,L2',
        KCP.probeDeck('1번 문제').map(c=>c.id).join(',')==='C1,C2,T1,T2,F1,F2,L1,L2,E1,E2',
        KCP.probeDeck('인문적 통찰')[0].k==='T',
        KCP.probeDeck('2번 후속 · 수학적 사고')[0].k==='E',
        KCP.probeDeck('발산적 사고').map(c=>c.k).join('')==='FFLLEECCTT',
        KCP.probeDeck('문항','2025').map(c=>c.id).join(',')==='E1,E2,L1,L2,C1,C2,F1,T1',
        KCP.probeDeck('발산적 사고','2025').map(c=>c.k).join('')==='FTEELLCC',
        typed,a!==b,b[0].text!=='changed',KCP.probeDeck('인문적 통찰')[0].text!=='changed',
        KCP.HABITS.map(h=>h.k).join(',')==='c,t,r,d',
        KCP.STARTERS.revise.length===3&&KCP.STARTERS.keep.length===2,
        KCP.CRIT_CHIPS_BY_YEAR['2026'].official===true&&KCP.CRIT_CHIPS_BY_YEAR['2026'].chips[0]==='기능/효과',
        JSON.stringify(KCP.CRIT_CHIPS_BY_YEAR['2022'].chips)===JSON.stringify(KCP.CRIT_CHIPS),
        KCP.CRIT_CHIPS_BY_YEAR['2025'].chips.includes('인과 연결'),
        KCP.CRIT_CHIPS_BY_YEAR['2023'].official===false
      ];
    }""")
    for i, ok in enumerate(checks, 1):
        c.expect(ok, f"{aid} T0a-9 연습 데이터 조건 {i}를 유지한다")


def t_T0b_2_settings_api(c: Ctx):
    aid = "T0b-2"
    c.goto("#home", wait=".home-grid")
    c.eq(c.page.evaluate("KCP.settings()"), {"timeMode": "real", "prep": 15, "answer": 8, "think": 0, "endAlert": True, "fromUrl": False},
         f"{aid} T0a-10 기본 설정 형식을 유지한다")
    c.eq(c.page.evaluate("[KCP.minutes('2022','prep'),KCP.minutes('2025','answer')]"), [30, 15], f"{aid} T0a-10 실전 메타 시간을 유지한다")
    r = c.page.evaluate("""() => {
      KCP.on('settings:change',p=>window.__settingsEvent=p.settings);
      KCP.setSettings({timeMode:'ext'});
      return [KCP.settings().timeMode,KCP.minutes('2022','prep'),KCP.minutes('2023','prep'),window.__settingsEvent.timeMode];
    }""")
    c.eq(r, ["ext", 45, 52.5, "ext"], f"{aid} T0a-10 설정 변경·연장·이벤트를 즉시 적용한다")
    c.page.evaluate("KCP.setSettings({timeMode:'free'})")
    c.eq(c.page.evaluate("KCP.minutes('2022','prep')"), None, f"{aid} T0a-10 제한 없음은 분 값이 없다")
    c.page.evaluate("KCP.setSettings({think:7,prep:0,answer:'8',timeMode:'x',endAlert:'no',fromUrl:true})")
    c.eq(c.page.evaluate("KCP.settings()"), {"timeMode": "free", "prep": 15, "answer": 8, "think": 0, "endAlert": True, "fromUrl": False},
         f"{aid} T0a-10 잘못된 설정값과 fromUrl patch를 버린다")
    c.page.evaluate("KCP.setSettings({timeMode:'custom',prep:12,answer:5})")
    c.eq(c.page.evaluate("KCP.minutes('2022','prep')"), 12, f"{aid} T0a-10 직접 정한 분을 계산한다")
    c.wait_saved(400)
    c.expect("fromUrl" not in (c.ls("kcp:v1:x:settings") or {}), f"{aid} T0a-10 fromUrl을 저장하지 않는다")
    c.page.reload()
    c.page.wait_for_selector(".home-grid")
    c.eq(c.page.evaluate("KCP.settings().timeMode"), "custom", f"{aid} T0a-10 개인 모드를 복원한다")


def t_T0b_2_settings_url(c: Ctx):
    aid = "T0b-2"
    c.open("?prep=20&answer=10#home")
    c.eq(c.page.evaluate("KCP.settings()"), {"timeMode": "custom", "prep": 20, "answer": 10, "think": 0, "endAlert": True, "fromUrl": True},
         f"{aid} T0a-10 주소를 수업 설정으로 읽는다")
    c.eq(c.page.evaluate("KCP.minutes('2022','answer')"), 10, f"{aid} T0a-10 주소 답변 시간을 계산한다")
    c.page.evaluate("KCP.setSettings({endAlert:false})")
    c.wait_saved(400)
    c.eq(c.ls("kcp:v1:x:settings"), {"timeMode": "real", "prep": 15, "answer": 8, "think": 0, "endAlert": False},
         f"{aid} T0a-10 주소 값 대신 개인 설정 원본만 저장한다")
    c.page.evaluate("KCP.setSettings({timeMode:'ext'})")
    c.eq(c.page.evaluate("[KCP.settings().timeMode,KCP.settings().prep,KCP.minutes('2022','prep')]"), ["ext", 20, 30],
         f"{aid} T0a-10 주소를 기준으로 연장한다")
    c.page.evaluate("KCP.setSettings({timeMode:'real'})")
    c.eq(c.page.evaluate("KCP.settings().timeMode"), "custom", f"{aid} T0a-10 주소에서는 실전이 주소 custom으로 읽힌다")
    c.page.evaluate("KCP.flush && KCP.flush()")
    c.open("#home")
    c.eq(c.page.evaluate("KCP.settings()"), {"timeMode": "real", "prep": 15, "answer": 8, "think": 0, "endAlert": False, "fromUrl": False},
         f"{aid} T0a-10 주소를 빼면 개인 설정만 남는다")
    for query in ("?prep=0&answer=8#home", "?prep=abc&answer=8#home", "?prep=15#home"):
        c.open(query)
        c.eq(c.page.evaluate("KCP.settings().fromUrl"), False, f"{aid} T0a-10 잘못되거나 빠진 주소 시간은 무시한다")


def t_T0b_2_speak_widget(c: Ctx):
    aid = "T0b-2"
    c.goto("#home", wait=".home-grid")
    c.page.evaluate("""() => {
      for(const id of ['test-d1','test-d2','test-d3']) {
        const d=document.createElement('div');d.id=id;document.body.append(d);
      }
      KCP.speak(document.querySelector('#test-d1'),{rec:'1분'});
      KCP.speak(document.querySelector('#test-d2'),{rec:'1분',onEnd:s=>window.__speakSeconds=s});
      KCP.speak(document.querySelector('#test-d3'),{});
    }""")
    go = c.page.locator("#test-d1 .speak-go")
    go.click()
    c.expect("말하는 중" in _text(c, "#test-d1 .speak-t") and "권장 1분" in _text(c, "#test-d1 .speak-t"), f"{aid} T0a-11 말하기 상태와 권장을 표시한다")
    c.eq(go.inner_text(), "끝", f"{aid} T0a-11 말하는 중 버튼은 끝이다")
    _pressed(c, "#test-d1 .speak-go", True, aid)
    c.page.wait_for_timeout(1200)
    go.click()
    c.eq(_text(c, "#test-d1 .speak-t"), "방금 0:01", f"{aid} T0a-11 끝나면 방금 시간을 표시한다")
    c.eq(go.inner_text(), "말해 보기", f"{aid} T0a-11 끝난 버튼 이름을 복원한다")
    _pressed(c, "#test-d1 .speak-go", False, aid)
    c.expect("말하기 끝" in _text(c, "#test-d1 .sr-only"), f"{aid} T0a-11 종료를 보조기기에 알린다")
    c.page.locator("#test-d2 .speak-go").click()
    c.page.wait_for_timeout(1200)
    c.page.locator("#test-d2 .speak-go").click()
    c.expect(c.page.evaluate("window.__speakSeconds >= 1"), f"{aid} T0a-11 onEnd에 경과 초를 전달한다")
    c.eq(_text(c, "#test-d2 .speak-t"), "", f"{aid} T0a-11 onEnd가 있으면 내부 결과를 비운다")
    c.page.locator("#test-d3 .speak-go").click()
    c.expect("권장" not in _text(c, "#test-d3 .speak-t"), f"{aid} T0a-11 rec가 없으면 권장 문구를 생략한다")
    c.page.evaluate("KCP.speakStop(); KCP.setSettings({think:10})")
    go.click()
    c.expect("생각" in _text(c, "#test-d1 .speak-t"), f"{aid} T0a-11 설정한 생각 단계를 거친다")
    c.eq(go.inner_text(), "바로 말하기", f"{aid} T0a-11 생각 중 바로 말하기 버튼을 보인다")
    _pressed(c, "#test-d1 .speak-go", False, aid)
    go.click()
    c.expect("말하는 중" in _text(c, "#test-d1 .speak-t"), f"{aid} T0a-11 생각을 건너뛰면 말하기를 시작한다")
    go.click()
    c.page.evaluate("""() => {
      KCP.setSettings({think:0}); window.__speechCounts={a:0,c:0,e:0};
      for(const n of ['a','b','c','d','e']) {
        const d=document.createElement('div');d.id='test-speech-'+n;document.body.append(d);
        KCP.speak(d,{onEnd:()=>{window.__speechCounts[n]=(window.__speechCounts[n]||0)+1;}});
      }
    }""")
    c.page.locator("#test-speech-a .speak-go").click()
    c.page.locator("#test-speech-b .speak-go").click()
    c.eq(c.page.evaluate("window.__speechCounts.a"), 1, f"{aid} T0a-11 다른 위젯을 시작하면 이전 위젯을 끝낸다")
    _pressed(c, "#test-speech-a .speak-go", False, aid)
    c.page.evaluate("KCP.speakStop()")
    c.page.locator("#test-speech-c .speak-go").click()
    c.page.evaluate("document.querySelector('#test-speech-c').remove()")
    c.page.wait_for_timeout(600)
    c.page.evaluate("KCP.speakStop()")
    c.eq(c.page.evaluate("window.__speechCounts.c"), 0, f"{aid} T0a-11 떨어진 위젯은 onEnd 없이 멈춘다")
    c.page.locator("#test-speech-d .speak-go").click()
    c.page.locator("#test-speech-d .speak-go").click()
    c.eq(c.page.evaluate("window.__speechCounts.d"), 1, f"{aid} T0a-11 떨어진 위젯 뒤에도 새 말하기를 끝낼 수 있다")
    c.page.locator("#test-speech-e .speak-go").click()
    c.goto("#y2022", wait="#phase")
    c.eq(c.page.evaluate("window.__speechCounts.e"), 1, f"{aid} T0a-11 라우트 전환은 말하기를 끝낸다")


def t_T0b_2_print_scope(c: Ctx):
    aid = "T0b-2"
    c.page.evaluate("""() => {
      window.__printCount=0;window.print=()=>window.__printCount++;
      KCP.print('<p>테스트</p>');
    }""")
    c.eq(_loc(c, "#printSheet").text_content().strip(), "테스트", f"{aid} T0a-12 인쇄 내용이 DOM에 있다")
    c.expect(c.page.evaluate("document.documentElement.classList.contains('kcp-printing')"), f"{aid} T0a-12 인쇄 전용 클래스를 붙인다")
    c.eq(c.page.evaluate("window.__printCount"), 1, f"{aid} T0a-12 인쇄 API를 한 번 호출한다")
    _hidden(c, "#printSheet", aid)
    c.page.emulate_media(media="print")
    _visible(c, "#printSheet", aid)
    _hidden(c, "#app", aid)
    c.eq(c.page.eval_on_selector("#printSheet", "e=>getComputedStyle(e).color"), "rgb(21, 34, 44)", f"{aid} T0a-12 다크에서도 밝은 인쇄 글자색을 쓴다")
    c.page.evaluate("window.dispatchEvent(new Event('afterprint'))")
    c.expect(not c.page.evaluate("document.documentElement.classList.contains('kcp-printing')"), f"{aid} T0a-12 afterprint에서 클래스를 뗀다")
    c.eq(c.page.locator("#printSheet").text_content(), "", f"{aid} T0a-12 afterprint에서 인쇄 내용을 비운다")
    _visible(c, "#app", aid)
    c.page.emulate_media(media="screen")
    c.check(f"{aid} T0a-12 인쇄 후 화면")


def _question_keys(c, aid, year, state):
    qs = c.page.evaluate("([y,s])=>KCP.games[y].questions(s)", [year, state])
    c.expect(len(qs) > 0, f"{aid} T0a-13 {year} 질문 목록이 있다")
    keys = [q.get("k") for q in qs]
    c.expect(all(isinstance(k, str) and re.fullmatch(year[2:] + r"-[a-z0-9-]+", k) for k in keys),
             f"{aid} T0a-13 {year} 질문 키가 고정 형식을 따른다")
    c.eq(len(set(keys)), len(keys), f"{aid} T0a-13 {year} 질문 키가 중복되지 않는다")
    c.eq(sum(q.get("src") == "report" for q in qs), {"2022": 2, "2023": 2, "2024": 6, "2025": 1, "2026": 2}[year],
         f"{aid} T0a-13 {year} 보고서 문항 수를 유지한다")


def t_T0b_2_question_contract(c: Ctx):
    aid = "T0b-2"
    for year in YEARS:
        state = c.page.evaluate("y=>KCP.load(y)", year)
        _question_keys(c, aid, year, state)
    _prepare2022(c, aid)
    c.wait_saved(400)
    _question_keys(c, aid, "2022", c.ls("kcp:v1:2022"))
    _prep(c, "2023")
    for node in ("1C", "2G", "1A", "2C", "2B", "3C", "3B", "2H", "3H", "4G"):
        c.page.locator(f'[data-node="{node}"]').click()
    c.page.locator("#q1-23").fill("가상 계획의 격차")
    c.page.locator("#q2-23").fill("가상 환경 우선 계획")
    c.wait_saved(400)
    _question_keys(c, aid, "2023", c.ls("kcp:v1:2023"))
    _prepare2024(c, aid)
    c.wait_saved(400)
    _question_keys(c, aid, "2024", c.ls("kcp:v1:2024"))
    _phase(c, "room")
    c.expect("약 2~4분" in _text(c, ".qdeck .qcard .rec"), f"{aid} T0a-13 2024 권장 시간을 표시한다")
    _prep(c, "2025")
    for paper, slot in (("red", 0), ("blue", 1), ("green", 2), ("black", 3)):
        c.page.locator(f'[data-sel="{paper}"]').click()
        c.page.locator(f'[data-slot="{slot}"]').click()
    c.page.locator("#lk-0").fill("가상 원인 연결")
    c.wait_saved(400)
    _question_keys(c, aid, "2025", c.ls("kcp:v1:2025"))
    _score2026(c)
    c.wait_saved(400)
    _question_keys(c, aid, "2026", c.ls("kcp:v1:2026"))
    checks = c.page.evaluate("""() => {
      const s=KCP.load('2022');s.game={q1:{nuclear:'I9'}};
      const a=KCP.games['2022'].questions(s).find(q=>q.k==='22-q1-nuc');
      s.game.q1.nuclear='H9';const b=KCP.games['2022'].questions(s).find(q=>q.k==='22-q1-nuc');
      const q24=KCP.games['2024'].questions({game:{}});
      const one=q24.find(q=>q.tag==='공통 1'),four=q24.find(q=>q.tag==='공통 4');
      const q25=KCP.games['2025'].questions({game:{}}).find(q=>q.tag==='발산적 사고');
      const q26=KCP.games['2026'].questions({game:{}});
      const scores={};for(const [t,v] of [['bb',4],['db',3],['ml',2],['wc',5]]) {scores[t]={};for(const k of 'fsegu')scores[t][k]=v;}
      const g={game:{scores,best:'ml'}},ml=KCP.games['2026'].questions(g);
      g.game.best='wc';const wc=KCP.games['2026'].questions(g);
      return [a.k===b.k&&a.q!==b.q,one.time==='약 2~4분'&&one.rec===undefined,
        four.time===undefined&&four.rec===undefined,
        q25.rec.startsWith('보고서의 면접 질문 기준')&&q25.time===undefined,
        q26.find(q=>q.k==='26-q2').q==='최우수 기술 하나를 추천하고 그 이유를 설명해 주세요.',
        !q26.some(q=>q.k==='26-runner'),ml.find(q=>q.k==='26-q2').q.includes('AI 마음렌즈'),
        ml.some(q=>q.k==='26-runner'),ml[2].k==='26-sum',!wc.some(q=>q.k==='26-sum'),wc[2].k==='26-low'];
    }""")
    for i, ok in enumerate(checks, 1):
        c.expect(ok, f"{aid} T0a-13 문장·고정 키·시간·추천 조건 {i}를 지킨다")


def t_T0b_2_router_contract(c: Ctx):
    aid = "T0b-2"
    _prep(c, "2022")
    c.expect(c.page.evaluate("KCP.goPhase('room')"), f"{aid} T0a-14 API로 면접실에 간다")
    c.page.wait_for_selector(".qdeck")
    _pressed(c, '.phases button[data-phase="room"]', True, aid)
    c.eq(c.page.evaluate("KCP.goPhase('zzz')"), False, f"{aid} T0a-14 잘못된 단계는 거절한다")
    _pressed(c, '.phases button[data-phase="room"]', True, aid)
    c.goto("#home", wait=".home-grid")
    c.eq(c.page.evaluate("KCP.goPhase('room')"), False, f"{aid} T0a-14 홈에서는 게임 단계로 이동하지 않는다")
    c.eq(c.page.evaluate("[KCP.route('home',()=>{}),KCP.route('y2022',()=>{})]"), [False, False], f"{aid} T0a-14 예약 라우트 등록을 거절한다")
    c.expect(c.page.evaluate("""() => {
      KCP.on('route:change',p=>window.__testRoute=p);
      return KCP.route('t0x',(app,arg)=>{app.innerHTML='<h1>T '+KCP.esc(arg)+'</h1>';});
    }"""), f"{aid} T0a-14 확장 라우트를 등록한다")
    c.page.evaluate("document.activeElement.blur()")
    c.goto("#t0x/a%20b", wait="#app h1")
    c.eq(_text(c, "#app"), "T a b", f"{aid} T0a-14 라우트 인자를 디코딩한다")
    c.eq(c.page.evaluate("window.__testRoute"), {"name": "t0x", "arg": "a b"}, f"{aid} T0a-14 라우트 이벤트 payload를 유지한다")
    c.expect(c.page.evaluate("document.activeElement===document.querySelector('#app h1')"), f"{aid} T0a-14 새 화면 제목에 포커스를 둔다")
    c.check(f"{aid} T0a-14 확장 라우트")
    c.goto("#zzz", wait=".pkg")
    c.eq(c.page.locator(".pkg").count(), 5, f"{aid} T0a-14 모르는 라우트는 홈이다")
    c.page.evaluate("KCP.rerender()")
    c.page.wait_for_selector(".pkg")
    c.eq(c.page.locator(".pkg").count(), 5, f"{aid} T0a-14 다시 그려도 홈을 유지한다")


def t_T0b_2_shared_css(c: Ctx):
    aid = "T0b-2"
    r = c.page.evaluate("""() => {
      const out=[];
      for(const [tag,cls] of [['span','chip'],['div','field'],['button','btn'],['div','row'],['div','caution']]) {
        const e=document.createElement(tag);e.className=cls;e.hidden=true;document.body.append(e);
        out.push(getComputedStyle(e).display==='none');e.remove();
      }
      const colors=[];
      for(const value of ['true','false']) {
        const e=document.createElement('button');e.className='btn';e.setAttribute('aria-pressed',value);document.body.append(e);
        colors.push(getComputedStyle(e).backgroundColor);e.remove();
      }
      out.push(colors[0]!==colors[1]);return out;
    }""")
    for i, ok in enumerate(r, 1):
        c.expect(ok, f"{aid} T0a-15 hidden·눌림 공통 CSS 조건 {i}를 유지한다")
    _prep(c, "2022")
    c.expect(c.page.evaluate("getComputedStyle(document.querySelector('[data-ov=\"map\"]')).backgroundColor===getComputedStyle(document.querySelector('.strip')).backgroundColor"), f"{aid} T0a-15 2022 도구 모음의 기존 눌림 색을 유지한다")


def t_T0b_2_export_event(c: Ctx):
    aid = "T0b-2"
    _prep(c, "2022")
    _phase(c, "reflect")
    c.page.locator("#nextstep-2022").fill("목표")
    c.page.locator("#before-2022").fill("환경을 가장 무겁게 봄")
    c.page.evaluate("() => { KCP.on('export:text',p=>p.parts.push('\\n■ 시험 블록\\n내용')); }")
    copied = _copy(c)
    c.expect("■ 시험 블록" in copied, f"{aid} T0a-16 확장 내보내기 내용을 붙인다")
    if "■ 시험 블록" in copied:
        c.expect(copied.index("■ 자기 평가") < copied.index("■ 예시와 비교") < copied.index("■ 시험 블록") < copied.index("■ 다음 연습 목표"),
                 f"{aid} T0a-16 자기 평가·비교·모듈·목표 순서를 유지한다")


def t_T0b_2_export_without_handler(c: Ctx):
    aid = "T0b-2"
    _prep(c, "2022")
    _phase(c, "reflect")
    c.expect("■ 시험 블록" not in _copy(c), f"{aid} T0a-16 처리기가 없는 새 컨텍스트에는 시험 블록이 없다")


def t_T0b_2_handler_isolation(c: Ctx):
    aid = "T0b-2"
    c.goto("#home", wait=".home-grid")
    # 의도적 pageerror를 허용하는 시험만 별도 컨텍스트에서 직접 수집한다.
    # harness가 감시하는 기본 Page의 오류 목록은 건드리지 않는다.
    with c.page.context.browser.new_context(
        viewport={"width": c.cfg.width, "height": c.cfg.height},
        color_scheme=c.cfg.scheme, is_mobile=c.cfg.mobile,
        has_touch=c.cfg.mobile, locale="ko-KR",
    ) as context:
        page = context.new_page()
        errors, console, failed = [], [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: console.append(message.text)
                if message.type in ("error", "warning") else None)
        page.on("requestfailed", lambda request: failed.append(request.url))
        page.goto(c.page.url)
        page.wait_for_selector(".home-grid")
        page.evaluate("location.hash='#y2022'")
        page.wait_for_selector("#phase")
        page.evaluate("KCP.goPhase('reflect')")
        page.wait_for_selector("#copyAll")
        page.evaluate("""() => {
          Object.defineProperty(navigator,'clipboard',{
            value:{writeText:t=>{window.__clip=t;return Promise.resolve();}},configurable:true});
          KCP.on('export:text',()=>{throw new Error('t0a-boom');});
          KCP.on('export:text',p=>p.parts.push('\\n■ 시험 블록\\n내용'));
        }""")
        with page.expect_event("pageerror", predicate=lambda error: "t0a-boom" in str(error)):
            page.locator("#copyAll").click()
        copied = page.evaluate("window.__clip") or ""
        c.expect("■ 시험 블록" in copied, f"{aid} T0a-16 처리기가 예외를 내도 다음 처리기를 실행한다")
        c.eq(len(errors), 1, f"{aid} T0a-16 별도 컨텍스트에 예상한 pageerror 한 건만 있다")
        c.expect(all("t0a-boom" in error for error in errors), f"{aid} T0a-16 예상하지 않은 페이지 오류는 없다")
        c.eq([message for message in console if "fonts.g" not in message], [],
             f"{aid} T0a-16 별도 컨텍스트에도 콘솔 오류·경고는 없다")
        c.eq([url for url in failed if "fonts.g" not in url], [],
             f"{aid} T0a-16 별도 컨텍스트에도 요청 실패는 없다")
        c.expect(page.evaluate("Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)<=document.documentElement.clientWidth"),
                 f"{aid} T0a-16 별도 성찰 화면에도 가로 스크롤은 없다")
    c.check(f"{aid} T0a-16 기본 컨텍스트 홈")


def t_T0b_2_asset_loading(c: Ctx):
    aid = "T0b-2"
    r = c.page.evaluate("""async () => {
      const links=Array.from(document.querySelectorAll('head link[rel=stylesheet]')).map(e=>e.getAttribute('href'));
      const scripts=Array.from(document.querySelectorAll('body script[src]')).map(e=>e.getAttribute('src'));
      const names=['routine.js','routine.css','probe.js','probe.css','peer.js','peer.css','drill-data.js','drill.js','drill.css'];
      const codes=await Promise.all(names.map(async n=>[n,(await fetch('ext/'+n)).status]));
      const boot=Array.from(document.querySelectorAll('body script')).find(e=>!e.src&&/KCP\\.boot\\s*\\(/.test(e.textContent));
      const last=document.querySelector('script[src$="ext/drill.js"]');
      return {links,scripts,codes,fontBefore:!!document.querySelector('head link[href*="fonts.googleapis.com"]')&&
        !!(document.querySelector('head link[href*="fonts.googleapis.com"]').compareDocumentPosition(document.querySelector('head link[href$="styles.css"]'))&Node.DOCUMENT_POSITION_FOLLOWING),
        bootAfter:!!boot&&!!last&&!!(last.compareDocumentPosition(boot)&Node.DOCUMENT_POSITION_FOLLOWING)};
    }""")
    expected_links = ["styles.css", "ext/routine.css", "ext/probe.css", "ext/peer.css", "ext/drill.css"]
    links = [next((name for name in expected_links if str(url).endswith(name)), None) for url in r["links"]]
    c.eq([name for name in links if name], expected_links, f"{aid} T0a-17 공통·모듈 스타일 순서를 유지한다")
    c.expect(r["fontBefore"], f"{aid} T0a-17 구글 폰트를 공통 스타일보다 먼저 로드한다")
    expected_scripts = ["data.js", "app.js", "practice-data.js", "g2022.js", "g2023.js", "g2024.js", "g2025.js", "g2026.js", "ext/routine.js", "ext/probe.js", "ext/peer.js", "ext/drill-data.js", "ext/drill.js"]
    names = []
    for url in r["scripts"]:
        # drill-data.js가 data.js로 잘못 분류되지 않도록 경로 끝 전체를 비교한다.
        normalized = str(url).removeprefix("./")
        match = next((name for name in expected_scripts if normalized == name or normalized.endswith("/" + name)), None)
        if match:
            names.append(match)
    c.eq(names, expected_scripts, f"{aid} T0a-17 데이터·앱·게임·모듈 로드 순서를 유지한다")
    c.expect(r["bootAfter"], f"{aid} T0a-17 모든 모듈 뒤 boot를 호출한다")
    for name, status in r["codes"]:
        c.eq(status, 200, f"{aid} T0a-17 {name} 요청이 성공한다")


def t_T0b_3_reset_visibility(c: Ctx):
    aid = "T0b-3"
    _prep(c, "2022")
    c.page.locator("#tgo").click()
    _phase(c, "reflect")
    # 단계 전환은 타이머를 멈춘다. 삭제 시에도 실제 interval이 돌도록 다시 시작한다.
    c.page.locator("#tgo").click()
    c.page.locator("#resetAll").click()
    c.page.locator("#doReset").click()
    c.page.evaluate('document.dispatchEvent(new Event("visibilitychange"))')
    c.wait_saved(400)
    c.eq(c.ls("kcp:v1:2022"), None, f"{aid} 삭제 후 visibilitychange가 이전 타이머 기록을 되살리지 않는다")


def t_T0b_3_panel_controls(c: Ctx):
    aid = "T0b-3"
    _prep(c, "2022")
    _panel(c)
    c.eq(_text(c, "#timeset-h"), "시간 설정", f"{aid} 패널 제목이 정확하다")
    c.eq(c.page.locator("#timeset").get_attribute("aria-labelledby"), "timeset-h", f"{aid} 패널에 접근 가능한 제목을 연결한다")
    c.eq(c.page.locator("#tset").get_attribute("aria-controls"), "timeset", f"{aid} 펼침 버튼과 패널을 연결한다")
    c.eq(c.page.locator('#timeset .seg[role="group"][aria-label="시간 모드"]').count(), 1,
         f"{aid} 시간 모드 그룹에 이름과 역할을 준다")
    _hidden(c, "#tm-confirm", aid)
    _hidden(c, "#tm-url", aid)
    for mode, text in (("real", "실전"), ("ext", "연장 1.5배"),
                       ("custom", "직접 정하기"), ("free", "시간 제한 없음")):
        button = c.page.locator(f'[data-tm="{mode}"]')
        c.eq(button.inner_text().strip(), text, f"{aid} {mode} 버튼 이름이 정확하다")
        c.eq(button.get_attribute("type"), "button", f"{aid} {mode} 버튼은 제출하지 않는다")
    c.page.locator('[data-tm="custom"]').click()
    for sel in ("#tm-prep", "#tm-answer"):
        field = c.page.locator(sel)
        for attr, value in (("type", "number"), ("min", "1"), ("max", "90"), ("step", "1")):
            c.eq(field.get_attribute(attr), value, f"{aid} {sel}의 {attr} 제한이 맞다")
    c.page.locator("#tm-prep").fill("12")
    c.page.locator("#tm-prep").press("Tab")
    for invalid in ("0", "91", "12.5", ""):
        c.page.locator("#tm-prep").fill(invalid)
        c.page.locator("#tm-prep").press("Tab")
        c.eq(c.page.locator("#tm-prep").input_value(), "12", f"{aid} 잘못된 분 입력을 저장값으로 되돌린다")
        c.eq(_text(c, "#clock"), "12:00", f"{aid} 잘못된 분 입력으로 타이머를 바꾸지 않는다")
    c.page.locator("#tm-answer").fill("5")
    c.page.locator("#tm-answer").press("Tab")
    c.eq(_text(c, "#tmode"), "직접 12·5분", f"{aid} 직접 입력한 두 분 값을 띠에 표시한다")
    c.page.locator("#tgo").click()
    c.page.locator("#tm-prep").fill("13")
    c.page.locator("#tm-prep").press("Tab")
    _visible(c, "#tm-confirm", aid)
    c.page.locator("#tm-no").click()
    c.eq(c.page.locator("#tm-prep").input_value(), "12", f"{aid} 진행 중 분 변경을 취소하면 입력값을 복원한다")
    c.page.locator('[data-think="30"]').click()
    c.page.locator("#tm-alert").uncheck()
    _hidden(c, "#tm-confirm", aid)
    _pressed(c, '[data-think="30"]', True, aid)
    c.page.locator("#tgo").click()
    c.page.locator("#tset").click()
    _hidden(c, "#timeset", aid)
    c.eq(c.page.evaluate("document.activeElement.id"), "tset", f"{aid} 버튼으로 닫아도 포커스를 돌려준다")
    c.check(f"{aid} 직접 시간 입력과 취소")


def t_T0b_3_previous_timer(c: Ctx):
    aid = "T0b-3"
    c.goto("#home", wait=".home-grid")
    c.page.evaluate("KCP.setSettings({timeMode:'ext'})")
    _inject(c, "2022", {"phase": "prep", "timer": {"of": "prep", "mode": "real",
            "running": True, "left": 1798, "total": 1800, "endAt": 1}})
    c.page.evaluate("() => { KCP.on('prep:render',p=>window.__loadedTimer=p.state.timer); }")
    c.goto("#y2022", wait="#clock")
    c.eq(_text(c, "#clock"), "29:58", f"{aid} 진행했던 옛 실전 타이머를 유지한다")
    c.eq(_text(c, "#tmode"), "이전 설정으로 진행 중", f"{aid} 현재 연장 설정과 다른 타이머임을 알린다")
    c.eq(_text(c, "#tgo"), "시작", f"{aid} 복원된 진행 타이머는 멈춰서 열린다")
    timer = c.page.evaluate("window.__loadedTimer")
    c.eq(timer.get("running"), False, f"{aid} 복원 시 실행 상태를 해제한다")
    c.expect("endAt" not in timer and "startAt" not in timer, f"{aid} 복원 시 실행 기준 시각을 지운다")
    c.check(f"{aid} 이전 설정 타이머 띠")


def t_T0b_4_url_choice_persistence(c: Ctx):
    aid = "T0b-4"
    c.open("?prep=20&answer=10#y2022")
    c.page.wait_for_selector("#clock")
    _panel(c)
    for mode, clock in (("ext", "30:00"), ("free", "00:00")):
        c.page.locator(f'[data-tm="{mode}"]').click()
        c.wait_saved(400)
        settings = c.ls("kcp:v1:x:settings") or {}
        c.eq(settings.get("timeMode"), mode, f"{aid} 수업 주소에서 선택한 {mode}를 개인 설정으로 저장한다")
        c.eq(settings.get("prep"), 15, f"{aid} 개인 준비 분에 수업 주소를 저장하지 않는다")
        c.eq(settings.get("answer"), 8, f"{aid} 개인 답변 분에 수업 주소를 저장하지 않는다")
        c.expect("fromUrl" not in settings, f"{aid} 수업 주소 여부를 저장하지 않는다")
        c.page.reload()
        c.page.wait_for_selector("#clock")
        c.eq(_text(c, "#clock"), clock, f"{aid} 새로고침 후에도 수업 주소의 {mode} 선택을 유지한다")
        _panel(c)
        _pressed(c, f'[data-tm="{mode}"]', True, aid)
        c.check(f"{aid} 복원한 수업 주소 {mode}")


def _guidance_contrast(c, selector, aid):
    locators = c.page.locator(selector)
    c.expect(locators.count() > 0, f"{aid} 대비를 검사할 안내문이 있다")
    for i in range(locators.count()):
        loc = locators.nth(i)
        if loc.is_visible():
            loc.evaluate("(e,i)=>e.setAttribute('data-test-t0b-contrast',String(i))", i)
            c.expect(c.contrast(f'[data-test-t0b-contrast="{i}"]') >= 4.5,
                     f"{aid} 안내문 {i + 1}의 글자 대비가 4.5 이상이다")
            loc.evaluate("e=>e.removeAttribute('data-test-t0b-contrast')")


def t_T0b_14_guidance_contrast(c: Ctx):
    aid = "T0b-14"
    _prep(c, "2022")
    _guidance_contrast(c, "#tm-tip", aid)
    _panel(c)
    _guidance_contrast(c, "#timeset p", aid)
    c.page.locator('[data-tm="ext"]').click()
    c.expect(c.contrast("#tmode") >= 4.5, f"{aid} 모드 칩의 글자 대비가 4.5 이상이다")
    c.page.locator("#tset").click()
    _phase(c, "reflect")
    # 공통 자기 평가·비교 패널만 검사한다. ext 모듈 안내를 선택하지 않는다.
    rubric_panel = c.page.locator("section.panel").filter(has=c.page.locator("#rsum"))
    rubric_panel.evaluate("e=>e.setAttribute('data-test-t0b-panel','rubric')")
    _guidance_contrast(c, '[data-test-t0b-panel="rubric"] > p', aid)
    _guidance_contrast(c, "#openEx + .hint", aid)
    c.page.locator("#skipEx").click()
    _guidance_contrast(c, "#exafter p", aid)
    c.check(f"{aid} 안내문 대비와 열린 예시")


def _original(c):
    # T0a 계약의 공개 등록 API에만 의존하는 가상 창작 게임이다.
    c.goto("#home", wait=".home-grid")
    c.page.evaluate("""() => {
      const base=KCP.YEARS['2022'];
      KCP.YEARS['s-test']={title:'시험 게임',format:'가상 판단',desc:'가상 쟁점 판단 연습',
        prep:3,answer:2,mode:base.mode,rubric:JSON.parse(JSON.stringify(base.rubric)),
        intent:base.intent,original:true,topics:['가상 과학','가상 사회'],concepts:['가상 기준']};
      KCP.games['s-test']=Object.assign({},KCP.games['2022'],{
        renderPrep(root,state,save,next) {
          root.innerHTML='<section class="panel"><h3>가상 준비실</h3><button id="test-original-room" type="button">면접실로 이동</button></section>';
          root.querySelector('button').onclick=next;
        },
        questions() {return [{k:'s-test-q1',tag:'가상 판단',q:'가상 쟁점의 판단 기준을 설명하세요.'}];},
        recap() {return [{t: '가상 준비 요약', d: '요약'}];},
        reflectExtra() {return '<details class="reveal"><summary>가상 예시 판단</summary><p>가상 해설</p></details>';},
        afterReflect() {}
      });
      KCP.ORIGINAL_ORDER.push('s-test'); KCP.rerender();
    }""")
    c.page.wait_for_selector("#home-originals")


def t_T0b_13_original_game(c: Ctx):
    aid = "T0b-13"
    c.goto("#home", wait=".home-grid")
    original_count = c.page.evaluate("KCP.ORIGINAL_ORDER.length")
    # 실제 창작 모듈이 함께 로드된 통합 상태에서는 원래 등록된 게임을 허용한다.
    c.eq(c.page.locator("#home-originals").count(), int(original_count > 0),
         f"{aid} 등록된 창작 게임이 있을 때만 홈 구역을 그린다")
    _original(c)
    c.eq(c.page.locator("#home-originals .opkg").count(), original_count + 1,
         f"{aid} 기존 창작 카드와 주입한 카드 하나를 표시한다")
    c.eq(c.page.locator('.opkg[href="#ys-test"]').count(), 1,
         f"{aid} 시험 게임 카드를 하나만 표시한다")
    c.eq(c.page.locator(".pkg").count(), 5, f"{aid} 창작 등록 뒤에도 기출 카드는 다섯 개다")
    section = c.page.locator("section#home-originals")
    for text in ("창작 쟁점 게임", "창작 게임 · 대학 출제와 무관", "배경과 수치는 가상입니다."):
        c.expect(text in section.inner_text(), f"{aid} 창작 홈 구역에 {text}이 있다")
    card = c.page.locator('.opkg[href="#ys-test"]')
    for text in ("시험 게임", "가상 쟁점 판단 연습", "가상 과학", "가상 사회", "준비 3분", "답변 2분"):
        c.expect(text in card.inner_text(), f"{aid} 창작 카드에 {text}이 있다")
    c.check(f"{aid} 창작 카드가 있는 홈")
    c.goto("#ys-test", wait="#phase")
    c.expect("창작 게임 · 가상 자료" in _text(c, ".brief"), f"{aid} 창작 게임 안내의 가상 자료 표시가 있다")
    c.expect(c.page.eval_on_selector(".brief", "e=>e.firstElementChild.matches('p.small')&&e.firstElementChild.textContent.includes('창작 게임 · 가상 자료')"),
             f"{aid} 창작 안내 태그를 brief 맨 앞에 둔다")
    c.check(f"{aid} 창작 준비실")
    _phase(c, "room")
    c.eq(c.page.locator(".qcard .who .tag-official").count(), 0, f"{aid} 창작 질문에 보고서 문항 태그가 없다")
    c.eq(_text(c, ".qcard .who .tag-mine"), "연습용 질문", f"{aid} 창작 질문은 연습용 질문이다")
    c.check(f"{aid} 창작 면접실")
    _phase(c, "reflect")
    panel = c.page.locator("section.panel").filter(has=c.page.locator("#rsum"))
    c.expect("연습용 평가 기준" in panel.locator("h3 .tag-mine").all_text_contents(), f"{aid} 창작 자기 평가 머리에 연습용 기준을 표시한다")
    c.eq(panel.locator("h3 .tag-official").count(), 0, f"{aid} 창작 자기 평가를 보고서 기준으로 표시하지 않는다")
    intent = c.page.locator("#phase h3").filter(has_text="설계 의도")
    c.eq(intent.count(), 1, f"{aid} 창작 게임의 의도 패널은 설계 의도다")
    c.eq(intent.locator(".tag-mine").inner_text().strip(), "연습실 설계", f"{aid} 설계 의도의 출처를 표시한다")
    c.eq(_text(c, "#openEx"), "예시 판단과 해설 열기", f"{aid} 창작 예시 버튼 이름을 바꾼다")
    _hidden(c, "#exwrap", aid)
    c.expect(c.page.locator("#openEx").is_disabled(), f"{aid} 창작 게임도 내 기준을 먼저 써야 한다")
    c.page.locator("#before-s-test").fill("가상 안전 기준을 가장 무겁게 봄")
    c.page.locator("#openEx").click()
    _visible(c, "#exwrap", aid)
    copied = _copy(c)
    c.expect(copied.startswith("[시험 게임 · 창작 쟁점 게임 연습]"), f"{aid} 창작 답안 복사 머리말이 정확하다")
    c.check(f"{aid} 창작 성찰")
    # 이어서 하기 표시도 창작 전용 카드 안에서만 확인한다.
    c.page.evaluate("const s=KCP.load('s-test'); s.memo='가상 메모'; KCP.save('s-test',s)")
    c.goto("#home", wait="#home-originals")
    c.eq(c.page.locator('.opkg[href="#ys-test"] .chip.accent').count(), 1, f"{aid} 창작 카드의 이어서 하기를 표시한다")
    c.eq(c.page.locator(".pkg").count(), 5, f"{aid} 창작 기록도 기출 카드 수를 바꾸지 않는다")


def t_T0b_13_no_original_registration(c: Ctx):
    aid = "T0b-13"
    # 통합 앱에 창작 게임이 등록되어 있어도 빈 등록 목록 조건을 별도로 검증한다.
    c.goto("#home", wait=".home-grid")
    c.page.evaluate("KCP.ORIGINAL_ORDER.length=0; KCP.rerender()")
    c.page.wait_for_selector(".home-grid")
    c.eq(c.page.locator("#home-originals").count(), 0, f"{aid} 창작 게임을 등록하지 않으면 구역을 그리지 않는다")
    c.eq(c.page.locator(".pkg").count(), 5, f"{aid} 창작 미등록 상태에도 기출 카드는 다섯 개다")
    c.check(f"{aid} 창작 미등록 홈")


if __name__ == "__main__":
    main(globals())
