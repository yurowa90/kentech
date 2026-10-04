"""T0a 계약 수용 검사. 브라우저 실행은 harness.main에 맡긴다.

통합 조건 우선: #rsum은 T0b 형식, 슬롯은 모듈 접두어를 검사한다.
T0a-17 스텁의 한 줄 형식은 해당 파일이 아직 주석뿐일 때 검사한다.
T0a-16(b)의 의도적 pageerror 허용은 공개 harness API에 없으므로 미포함.
"""

import re

from harness import Ctx, main

MAP_NOTICE_24 = "정착지 지도가 보고서 배치도로 바뀌어, 예전에 고른 정착지·확정·시뮬레이션 기록을 비웠습니다. 특별 아이템과 써 둔 글은 그대로 있습니다. 새 지도에서 정착지를 다시 골라 주세요."


def _wait(c, selector, state="visible"):
    c.page.locator(selector).first.wait_for(state=state)


def _home(c):
    c.goto("#home", wait=".home-grid")


def _phase(c, phase, selector):
    c.phase(phase)
    _wait(c, selector)


def _clipboard(c):
    c.page.evaluate("""() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {writeText: t => {window.__clip = t; return Promise.resolve();}},
        configurable: true
      });
    }""")


def _results(c, ident, js):
    # JS는 [조건, 한국어 설명] 배열을 반환한다. 모든 단언은 harness에 기록한다.
    for ok, label in c.page.evaluate(js):
        c.expect(ok, f"{ident} {label}")


def _slot(c, selector, ident):
    _wait(c, selector, "attached")
    result = c.page.locator(selector).evaluate("""el => ({
      empty: el.childNodes.length === 0,
      hidden: el.hidden || getComputedStyle(el).display === 'none',
      clean: ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.length > 0),
      owned: [...el.children].every(child =>
        /^(jn|pb|pv|dr)-/.test(child.id) ||
        [...child.classList].some(s => /^(jn|pb|pv|dr)-/.test(s)))
    })""")
    c.expect(result["owned"], f"{ident} {selector}의 자식은 모듈 접두어를 갖는다")
    c.expect(result["clean"], f"{ident} {selector}에 공백이나 직접 텍스트를 넣지 않는다")
    if result["empty"]:
        c.expect(result["hidden"], f"{ident} 비어 있는 {selector}는 CSS로 숨긴다")


def _prep22(c, ident):
    c.goto("#y2022", wait="#grid .cell")
    c.check(f"{ident} 2022 준비실")
    for overlay in ("wind", "current", "solar", "map"):
        c.page.click(f'[data-ov="{overlay}"]')
        c.check(f"{ident} 2022 지도 {overlay}")
    for tool, cell in (("fossil", "F5"), ("nuclear", "I9"), ("solar", "I7"), ("wind", "B1")):
        c.page.click(f'[data-tool="{tool}"]')
        c.page.click(f'[data-cell="{cell}"]')
    c.eq(c.page.locator("#grid .plant").count(), 4, f"{ident} 2022 발전소 네 기 배치")
    c.page.fill("#r1-solar", "일사량 20, 새 서식지 회피")
    c.page.click('[data-mode="q2"]')
    c.page.click('[data-tool="wind"]')
    for cell in ("A6", "A7", "B6"):
        c.page.click(f'[data-cell="{cell}"]')
    c.expect("충족" in c.page.locator("table.supply").first.inner_text(), f"{ident} 2022 배멧 공급 충족")
    c.page.select_option("#to-0", "참살이")
    c.page.click('[data-del="2"]')
    c.eq(c.page.locator("table.supply").nth(1).locator("tbody tr").count(), 2, f"{ident} 2022 발전소 삭제")
    c.page.fill("#q2t", "풍력 위주, 바다 외곽.")
    c.expect(c.page.locator("#warn li").count() >= 1, f"{ident} 2022 영향 분석 표시")
    c.check(f"{ident} 2022 준비 완료")


def _prep23(c, ident):
    c.goto("#y2023", wait="[data-node]")
    c.check(f"{ident} 2023 준비실")
    for node in ("1C", "2G", "1A", "2C", "2B", "3C", "3B", "2H", "3H", "4G"):
        c.page.click(f'[data-node="{node}"]')
    c.eq(c.page.inner_text("#yr").strip(), "10 / 10년", f"{ident} 2023 10년 계획 완성")
    c.page.click("#undo")
    c.eq(c.page.inner_text("#yr").strip(), "9 / 10년", f"{ident} 2023 마지막 해 취소")
    c.page.click('[data-node="4G"]')
    for tab in ("wheel", "nb", "path"):
        c.page.click(f'[data-tab="{tab}"]')
        c.check(f"{ident} 2023 탭 {tab}")
    c.page.fill("#q1-23", "나람국 과학 집중, 다람국 환경 집중.")
    c.page.fill("#q2-23", "환경 우선, 박람회 조건 충족.")
    c.check(f"{ident} 2023 준비 완료")


def _prep24(c, ident, lock=True):
    c.goto("#y2024", wait="[data-hex]")
    c.check(f"{ident} 2024 준비실")
    hexes = c.page.locator("[data-hex]")
    for i in range(min(hexes.count(), 16)):
        hexes.nth(i).click()
        if c.page.inner_text("#tcount").startswith("4 /"):
            break
    c.expect(c.page.inner_text("#tcount").startswith("4 /"), f"{ident} 2024 정착지 네 칸")
    for _ in range(3):
        c.page.locator("[data-inc]").first.click()
    c.page.locator("[data-toggle]").nth(0).click()
    c.page.locator("[data-toggle]").nth(1).click()
    c.expect(c.page.inner_text("#icount").startswith("5 /"), f"{ident} 2024 아이템 다섯 개")
    c.page.check("#showK")
    c.expect(c.page.locator(".hexmap text").count() > 0, f"{ident} 2024 채굴량 표시")
    c.page.click("#sim")
    _wait(c, "#gauges .gauge")
    c.eq(c.page.locator("#gauges .gauge").count(), 6, f"{ident} 2024 속성 여섯 개")
    c.expect(c.page.locator("#go24").is_disabled(), f"{ident} 2024 확정 전 면접실 이동 비활성")
    if lock:
        _lock24(c, ident)


def _lock24(c, ident):
    c.page.click("#lock")
    _wait(c, "#unlock")
    c.expect(c.page.locator("#go24").is_enabled(), f"{ident} 2024 확정 후 면접실 이동 활성")
    c.page.click('[data-match="no"]')
    c.page.fill("#plan24", "숲과 호수 중심, 엔지니어 3명.")
    c.check(f"{ident} 2024 확정 준비실")


def _prep25(c, ident):
    c.goto("#y2025", wait="#overall25")
    c.check(f"{ident} 2025 준비실")
    for paper in ("red", "green", "black", "blue"):
        c.page.click(f'[data-tab="{paper}"]')
        c.check(f"{ident} 2025 신문 {paper}")
    c.page.locator("[data-fact]").first.click()
    c.expect(c.page.input_value("#overall25").startswith("["), f"{ident} 2025 종합 설명에 단서 삽입")
    for paper, slot in (("red", 0), ("blue", 1), ("green", 2), ("black", 3)):
        c.page.click(f'[data-sel="{paper}"]')
        c.page.click(f'[data-slot="{slot}"]')
    c.expect("모두 배치" in c.page.inner_text("#tray"), f"{ident} 2025 신문 네 부 배치")
    c.page.click('[data-down="0"]')
    c.expect("●" in c.page.locator('[data-slot="0"]').inner_text(), f"{ident} 2025 아래로 이동")
    c.page.click('[data-up="1"]')
    c.expect("■" in c.page.locator('[data-slot="0"]').inner_text(), f"{ident} 2025 위로 이동")
    c.page.fill("#lk-0", "창간호의 매장량 우려가 고갈 기사로 이어짐")
    c.page.fill("#gp-0", "에너지청 공모")
    c.page.focus("#lk-1")
    c.page.locator("[data-fact]").nth(1).click()
    c.expect("[" in c.page.input_value("#lk-1"), f"{ident} 2025 연결 근거에 단서 삽입")
    c.check(f"{ident} 2025 준비 완료")


def _prep26(c, ident):
    c.goto("#y2026", wait="#score select")
    c.check(f"{ident} 2026 준비실")
    for tab in ("bb", "db", "ml", "wc", "crit"):
        c.page.click(f'[data-tab="{tab}"]')
        c.check(f"{ident} 2026 탭 {tab}")
    for tech, score in (("bb", "4"), ("db", "3"), ("ml", "2"), ("wc", "5")):
        for key in "fsegu":
            c.page.select_option(f"#sc-{tech}-{key}", score)
    c.eq(c.page.locator("tr.best td.name").inner_text(), "울버린 켄텍카솔", f"{ident} 2026 합계 최고 행 강조")
    c.eq(c.page.locator('[data-tot="wc"]').inner_text(), "합계 25점", f"{ident} 2026 추천 버튼 합계")
    c.page.click('[data-pick="ml"]')
    c.page.fill("#reason26", "사회/윤리 기준을 가장 무겁게 봄.")
    c.page.fill("#note-bb", "그래프와 문구 불일치")
    c.check(f"{ident} 2026 준비 완료")


def _baseline_room(c, year, minimum):
    ident = "T0a-1"
    c.page.click(f"#go{year[-2:]}")
    _wait(c, ".qdeck .qcard")
    c.expect(c.page.locator(".qdeck .qcard").count() >= minimum, f"{ident} {year} 면접실 질문 수")
    c.page.fill('textarea[data-a="0"]', "결론 먼저, 근거 둘.")
    c.check(f"{ident} {year} 면접실")
    c.page.click("#toReflect")
    _wait(c, "table.rubric")
    c.page.locator('.seg button[data-v="3"]').first.click()
    c.page.locator('.seg button[data-v="2"]').nth(1).click()
    # T0b 통합 후 표시 계약을 따른다. 이전 '5 / 27' 문구는 단언하지 않는다.
    rsum = c.page.inner_text("#rsum")
    if rsum.startswith("점검"):
        c.eq(rsum, "점검 2/9 · 잘함 1 · 보통 1 · 미흡 0", f"{ident} {year} 자기 평가 점검 수")
    else:
        c.expect(c.page.evaluate("""() => {
          const b = [...document.querySelectorAll('table.rubric button[aria-pressed="true"]')];
          return b.length === 2 && b.some(x => x.dataset.v === '3') && b.some(x => x.dataset.v === '2');
        }"""), f"{ident} {year} 자기 평가 선택 두 항목 유지")
    c.page.fill(f"#nextstep-{year}", "결론을 먼저 말한다")
    c.page.click("#copyAll")
    c.page.wait_for_function("typeof window.__clip === 'string'")
    c.page.click("#resetAll")
    _wait(c, "#confirmReset")
    c.expect(c.page.locator("#confirmReset").is_visible(), f"{ident} {year} 기록 지우기 확인창")
    c.page.click("#noReset")
    c.expect(c.page.locator("#confirmReset").is_hidden(), f"{ident} {year} 지우기 취소 후 확인창 숨김")
    c.check(f"{ident} {year} 성찰")


def t_T0a_1_regression(c: Ctx):
    _home(c)
    # 창작 게임 카드가 추가되어도 기출 다섯 해 링크는 유지되어야 한다.
    for year in range(2022, 2027):
        c.eq(c.page.locator(f'.pkg[href="#y{year}"]').count(), 1, f"T0a-1 {year} 기출 홈 카드 유지")
    c.check("T0a-1 홈")
    _clipboard(c)
    for prep, year, minimum in ((_prep22, "2022", 7), (_prep23, "2023", 9), (_prep24, "2024", 7), (_prep25, "2025", 8), (_prep26, "2026", 7)):
        prep(c, "T0a-1")
        if year == "2026":
            c.page.click("#go26")
            _wait(c, ".qdeck .qcard")
            c.expect("합계로는" in c.page.inner_text(".qdeck"), "T0a-1 합계와 다른 추천 후속 질문")
            _phase(c, "prep", "#go26")
        _baseline_room(c, year, minimum)
        if year == "2024":
            _phase(c, "prep", "#unlock")
            c.page.click("#unlock")
            _wait(c, "#lock")
            c.eq(c.page.locator("#lock").count(), 1, "T0a-1 다시 계획하기 후 확정 버튼 복귀")
        if year == "2026":
            c.expect(c.page.locator("details.reveal").count() >= 8, "T0a-1 2026 성찰 예시 답안과 단서 유지")
    _home(c)
    for year in range(2022, 2027):
        c.eq(c.page.locator(f'.pkg[href="#y{year}"] .chip.accent').count(), 1, f"T0a-1 {year} 이어서 하기 표시")
    c.check("T0a-1 기록 있는 홈")
    c.page.reload()
    _wait(c, ".home-grid")
    c.goto("#y2026", wait="#phase")
    _phase(c, "prep", "#reason26")
    c.expect(c.page.input_value("#reason26").startswith("사회/윤리"), "T0a-1 새로고침 후 추천 이유 복원")
    c.check("T0a-1 저장 복원")


def t_T0a_1_timer(c: Ctx):
    c.goto("#y2022", wait="#clock")
    before = c.page.inner_text("#clock")
    c.page.click("#tgo")
    c.page.wait_for_timeout(1600)
    running = c.page.inner_text("#clock")
    c.expect(running != before, "T0a-1 타이머 시작 후 시계 감소")
    c.page.click("#tgo")
    c.page.wait_for_timeout(1200)
    c.eq(c.page.inner_text("#clock"), running, "T0a-1 일시정지한 시계 유지")
    c.page.click("#treset")
    c.eq(c.page.inner_text("#clock"), before, "T0a-1 타이머 초기화")
    c.check("T0a-1 타이머")


def t_T0a_2_route_saves(c: Ctx):
    c.goto("#y2022", wait="#tgo")
    c.page.click("#tgo")
    c.goto("#y2023", wait="#q1-23")
    c.page.fill("#q1-23", "abc")
    c.wait_saved(400)
    saved = c.ls("kcp:v1:2023")
    c.eq((saved or {}).get("game", {}).get("q1"), "abc", "T0a-2 다른 해 타이머가 입력 저장을 취소하지 않는다")
    old = c.ls("kcp:v1:2022")
    c.expect(isinstance((old or {}).get("timer", {}).get("left"), (int, float)), "T0a-2 이전 해 타이머 값이 저장된다")
    left = (old or {}).get("timer", {}).get("left")
    c.page.wait_for_timeout(1200)
    c.wait_saved(400)
    c.eq((c.ls("kcp:v1:2022") or {}).get("timer", {}).get("left"), left, "T0a-2 라우트 전환 뒤 이전 해 시계는 감소하지 않는다")
    c.check("T0a-2 2023 준비실")


def t_T0a_2_2024_old_map(c: Ctx):
    # 새 지도에도 남아 있는 옛 칸 번호를 넣어 판 번호로 정리하는지 확인한다.
    for version in (None, 1, 3):
        _home(c)
        c.page.evaluate("KCP.flush()")
        c.page.evaluate("""version => {
          const sel = ['0-6','1-5','2-5','2-4','3-4','4-5','4-6'];
          const game = {sel, items:{eng:3}, locked:{sel, items:{eng:3}},
            matched:'yes', runs:[{prod:10.5,cons:9.1}],
            plan:'숲을 골랐습니다. <img src=x onerror="window.__injected24=true">'};
          if (version !== null) game.mapV = version;
          localStorage.setItem('kcp:v1:2024', JSON.stringify({phase:'prep', game,
            memo:'물 자원을 확인하자.', answers:{'24-c1':'가상 연습 답변'}}));
        }""", version)
        c.page.reload()
        _wait(c, ".home-grid")
        c.goto("#y2024", wait="#plan24")
        notice = c.page.locator("#map-notice24")
        c.eq(notice.count(), 1, f"T0a-2 지도 판 {version} 이전 안내 한 개")
        c.eq(notice.inner_text(), MAP_NOTICE_24, "T0a-2 옛 계획 안내 문구 일치")
        c.eq(c.page.locator('[data-hex][aria-pressed="true"]').count(), 0, "T0a-2 옛 지도 선택 해제")
        c.eq(c.page.locator("#unlock, [data-match]").count(), 0, "T0a-2 옛 확정과 예상 일치 응답 해제")
        c.expect(c.page.locator("#go24").is_disabled(), "T0a-2 새 지도에서 다시 확정해야 면접실 이동 가능")
        c.eq(c.page.locator("#runs").inner_text(), "", "T0a-2 옛 시뮬레이션 횟수 해제")
        c.expect("<img" in c.page.input_value("#plan24"), "T0a-2 계획 글은 원문 그대로 보존")
        c.eq(c.page.locator("#prep-body img").count(), 0, "T0a-2 계획 글을 HTML로 실행하지 않는다")
        c.wait_saved()
        saved = c.ls("kcp:v1:2024") or {}
        game = saved.get("game", {})
        for key, expected in (("mapV", 2), ("sel", []), ("locked", None), ("matched", ""), ("runs", [])):
            c.eq(game.get(key), expected, f"T0a-2 이전 후 {key} 저장")
        c.eq(game.get("items"), {"eng": 3}, "T0a-2 기존 아이템 선택 보존")
        c.eq(saved.get("memo"), "물 자원을 확인하자.", "T0a-2 자유 메모 보존")
        c.eq(saved.get("answers"), {"24-c1": "가상 연습 답변"}, "T0a-2 직접 쓴 면접 답변 보존")
        c.page.reload()
        _wait(c, "#plan24")
        c.eq(c.page.locator("#map-notice24").count(), 0, "T0a-2 이전 안내는 새로고침 뒤 반복하지 않는다")
        c.eq(c.page.input_value("#plan24"), game.get("plan"), "T0a-2 다시 열어도 계획 글 보존")
        c.check("T0a-2 옛 지도 저장값 이전")

    # 이전 뒤 새로 확정한 계획은 다시 열어도 남아야 한다.
    c.page.click('[data-hex="0-4"]')
    c.page.click("#sim")
    c.page.click("#lock")
    c.page.click('[data-match="yes"]')
    c.wait_saved()
    c.page.reload()
    _wait(c, "#unlock")
    game = (c.ls("kcp:v1:2024") or {}).get("game", {})
    c.eq(game.get("mapV"), 2, "T0a-2 새 계획에 지도 판 번호 저장")
    c.eq(game.get("sel"), ["0-4"], "T0a-2 현재 지도 선택 복원")
    c.eq((game.get("locked") or {}).get("sel"), ["0-4"], "T0a-2 현재 지도 확정 복원")
    c.eq(game.get("matched"), "yes", "T0a-2 현재 지도 예상 일치 응답 복원")
    c.eq(len(game.get("runs", [])), 1, "T0a-2 현재 지도 실행 기록 복원")


def t_T0a_2_2024_old_map_room_reflect(c: Ctx):
    for phase, selector in (("room", ".recap"), ("reflect", "table.rubric")):
        _home(c)
        c.page.evaluate("KCP.flush()")
        c.page.evaluate("""phase => {
          const sel = ['0-4'];
          localStorage.setItem('kcp:v1:2024', JSON.stringify({phase,
            game:{mapV:1,sel,items:{eng:1},locked:{sel,items:{eng:1}}}}));
        }""", phase)
        c.page.reload()
        _wait(c, ".home-grid")
        c.goto("#y2024", wait=selector)
        c.eq(c.page.evaluate("KCP.games['2024'].recap(KCP.load('2024'))[0]"),
             {"t": "안내", "d": MAP_NOTICE_24}, f"T0a-2 {phase} recap 첫 줄에 이전 안내")
        if phase == "room":
            c.eq(c.page.locator(".recap dt").first.inner_text(), "안내", "T0a-2 면접실 recap 첫 줄 안내 제목")
            c.eq(c.page.locator(".recap dd").first.inner_text(), MAP_NOTICE_24, "T0a-2 면접실 recap 안내 문구")
        else:
            c.expect(c.page.locator("#map-notice24").is_visible(), "T0a-2 예시를 열지 않아도 성찰 안내 표시")
            c.eq(c.page.locator("#map-notice24").inner_text(), MAP_NOTICE_24, "T0a-2 성찰 안내 문구")
        c.page.evaluate("KCP.rerender()")
        c.eq(c.page.evaluate("KCP.games['2024'].recap(KCP.load('2024'))[0].t"), "안내", f"T0a-2 {phase} 다시 표시해도 안내 유지")
        c.check(f"T0a-2 {phase} 이전 안내")
        _phase(c, "prep", "#plan24")
        c.eq(c.page.locator("#map-notice24").inner_text(), MAP_NOTICE_24, "T0a-2 준비실에서 이전 안내 표시")
        c.expect(not c.page.evaluate("KCP.games['2024'].recap(KCP.load('2024')).some(r => r.t === '안내')"),
                 "T0a-2 준비실의 안내 소비 뒤 recap 안내 제거")
        c.page.click('[data-hex="0-4"]')
        c.page.click("#lock")
        c.expect(not c.page.evaluate("KCP.games['2024'].recap(KCP.load('2024')).some(r => r.t === '안내')"),
                 "T0a-2 다시 확정한 뒤 recap 안내 없음")


def t_T0a_2_2024_old_map_notice_conditions(c: Ctx):
    _results(c, "T0a-2 이전 안내 조건", """() => {
      const game = KCP.games['2024'], out = [];
      const emptyCases = [
        ['빈 객체', {}], ['지도 판만', {mapV:1}],
        ['아이템·글만', {mapV:1,items:{eng:1},plan:'가상 계획'}],
        ['빈 기록', {mapV:1,sel:[],locked:null,runs:[],matched:''}],
        ['손상 문자열', 'bad'], ['손상 배열', [{sel:['0-4'],locked:true,runs:[1],matched:'yes'}]],
      ];
      for (const [label, value] of emptyCases) {
        const s = {phase:'room',game:value}, recap = game.recap(s);
        out.push([!s.game.mapNotice && !recap.some(r => r.t === '안내'), label + ' 비울 기록이 없으면 안내 없음']);
        out.push([s.game.mapV === 2 && s.game.sel.length === 0 && s.game.locked === null && s.game.runs.length === 0 && s.game.matched === '', label + ' 저장값 정리']);
        if (label === '아이템·글만') out.push([s.game.items.eng === 1 && s.game.plan === value.plan, label + ' 보존']);
      }
      for (const patch of [{sel:['0-4']}, {locked:{sel:['0-4'],items:{eng:1}}}, {runs:[{prod:1,cons:0}]}, {matched:'yes'}]) {
        const label = Object.keys(patch)[0], s = {phase:'room',game:{mapV:1,...patch}};
        out.push([game.recap(s)[0].t === '안내', label + '만 있어도 안내']);
        s.game.locked = {sel:['0-4'],items:{eng:1}};
        out.push([!game.recap(s).some(r => r.t === '안내') && !s.game.mapNotice, label + ' 다시 확정하면 안내 해제']);
      }
      return out;
    }""")


def t_T0a_2_2024_damaged_save(c: Ctx):
    _results(c, "T0a-2 손상 저장값", """() => {
      const game = KCP.games['2024'], out = [];
      const cases = [
        ['items null', {items:null}],
        ['items 배열', {items:[]}],
        ['items 값 범위', {items:{eng:7,medP:-1,grid:0.5,ai:'1',sub:1}}],
        ['runs null', {runs:null}],
        ['constructor 칸', {sel:['constructor']}],
        ['__proto__ 칸', {sel:['__proto__']}],
        ['toString 칸', {sel:['toString']}],
        // even-q 이웃 관계로 연결된 8칸: 0-4↔0-5↔0-6, 0-4↔1-3↔2-3,
        // 0-4↔1-4, 0-4↔1-5, 0-6↔1-6. 연결 실패가 아닌 7칸 상한으로 해제된다.
        ['8칸', {sel:['0-4','0-5','0-6','1-3','1-4','1-5','1-6','2-3']}],
        ['locked items null', {locked:{sel:['0-4'],items:null},matched:'yes'}],
        ['locked items 없음', {locked:{sel:['0-4']},matched:'yes'}],
        ['locked items 배열', {locked:{sel:['0-4'],items:[]},matched:'yes'}],
        ['locked items 값 범위', {locked:{sel:['0-4'],items:{eng:7}},matched:'yes'}],
        ['locked 잘못된 칸', {locked:{sel:['constructor'],items:{eng:1}},matched:'yes'}],
      ];
      for (const [label, patch] of cases) {
        const s = {game:{mapV:2,sel:['0-4'],items:{eng:1},runs:[],locked:null,matched:'',...patch}};
        try {
          const qs = game.questions(s), recap = game.recap(s), G = s.game;
          out.push([Array.isArray(qs) && Array.isArray(recap), label + ' 질문·성찰 예외 없음']);
          if (Object.hasOwn(patch, 'sel')) out.push([G.sel.length === 0, label + ' 선택 해제']);
          if (Object.hasOwn(patch, 'locked')) out.push([G.locked === null && G.matched === '' && !qs.some(q => q.k === '24-c5-yes'), label + ' 확정·응답 함께 해제']);
          if (Object.hasOwn(patch, 'items')) out.push([JSON.stringify(G.items) === JSON.stringify(label === 'items 값 범위' ? {sub:1} : {}), label + ' 아이템 정리']);
          if (Object.hasOwn(patch, 'runs')) out.push([Array.isArray(G.runs) && G.runs.length === 0, label + ' 기록 정리']);
        } catch (e) {
          out.push([false, label + ' 예외: ' + e.message]);
        }
      }
      return out;
    }""")


def t_T0a_3_pending_reads(c: Ctx):
    _home(c)
    _results(c, "T0a-3", """() => {
      const out = [], s = KCP.load('2025'); s.memo = 'p'; KCP.save('2025', s);
      const r = KCP.load('2025');
      out.push([r.memo === 'p' && r !== s, '대기 저장값은 새로운 객체로 읽힌다']);
      out.push([localStorage.getItem('kcp:v1:2025') === null, '250ms 전에 저장소에는 기록이 없다']);
      KCP.flush();
      out.push([JSON.parse(localStorage.getItem('kcp:v1:2025')).memo === 'p', 'flush는 대기 기록을 즉시 저장한다']);
      KCP.store.set('t0', {a:1}); const v = KCP.store.get('t0', null);
      out.push([v.a === 1, 'store 대기값을 즉시 읽는다']); v.a = 9;
      out.push([KCP.store.get('t0', null).a === 1, 'store 반환 객체 변경이 저장값을 바꾸지 않는다']);
      KCP.save('2022', KCP.load('2022')); KCP.store.set('t1', 1);
      return out;
    }""")
    c.wait_saved(400)
    c.expect(c.ls("kcp:v1:2022") is not None, "T0a-3 연도 저장 키가 남는다")
    c.eq(c.ls("kcp:v1:x:t1"), 1, "T0a-3 store 키도 함께 저장된다")
    _results(c, "T0a-3", """() => {
      const s = KCP.load('2024'); s.memo = 'ph'; KCP.save('2024', s);
      window.dispatchEvent(new Event('pagehide'));
      return [[JSON.parse(localStorage.getItem('kcp:v1:2024')).memo === 'ph', 'pagehide가 대기 저장을 즉시 비운다']];
    }""")
    c.check("T0a-3 홈")


def t_T0a_4_reset_goal(c: Ctx):
    c.goto("#y2022", wait="#grid")
    c.expect(c.page.evaluate("KCP.goPhase('reflect')"), "T0a-4 성찰로 이동")
    _wait(c, "#nextstep-2022")
    c.page.fill("#nextstep-2022", "결론 먼저")
    c.wait_saved(400)
    goal = c.ls("kcp:v1:x:goal") or {}
    c.eq(c.page.evaluate("KCP.goal.get()"), goal, "T0a-4 저장 목표와 읽기 API 값 일치")
    for key, value in (("src", "2022"), ("title", "2022 미션 켄텍"), ("text", "결론 먼저")):
        c.eq(goal.get(key), value, f"T0a-4 목표 {key} 저장")
    c.expect(isinstance(goal.get("at"), (int, float)) and goal["at"] > 0, "T0a-4 목표 시각은 양수")
    c.check("T0a-4 성찰")
    c.page.click("#tgo")
    c.page.click("#resetAll")
    _wait(c, "#doReset")
    c.page.click("#doReset")
    _wait(c, ".home-grid")
    c.wait_saved(400)
    c.eq(c.ls("kcp:v1:2022"), None, "T0a-4 초기화 뒤 연도 기록이 되살아나지 않는다")
    c.eq(c.ls("kcp:v1:x:goal"), None, "T0a-4 같은 해 목표도 지운다")
    c.page.evaluate("""() => {
      KCP.goal.set('2023', '2023 가람국 10년 계획', '유지'); KCP.reset('2022');
    }""")
    c.wait_saved(400)
    before = c.ls("kcp:v1:x:goal")
    c.eq((before or {}).get("src"), "2023", "T0a-4 다른 해의 목표는 남는다")
    c.page.evaluate("KCP.goal.set('2022', 'x', '   ')")
    c.wait_saved(400)
    c.eq(c.ls("kcp:v1:x:goal"), before, "T0a-4 공백 목표 set은 기존 목표를 바꾸지 않는다")
    c.check("T0a-4 초기화 뒤 홈")


def t_T0a_4_empty_goal(c: Ctx):
    c.goto("#y2022", wait="#grid")
    _phase(c, "reflect", "#nextstep-2022")
    c.page.fill("#nextstep-2022", "목표")
    c.wait_saved(400)
    c.expect(c.ls("kcp:v1:x:goal") is not None, "T0a-4 입력한 목표가 저장된다")
    c.page.fill("#nextstep-2022", "")
    c.wait_saved(400)
    c.eq(c.page.evaluate("KCP.goal.get()"), None, "T0a-4 성찰 입력을 비우면 그 해 목표를 지운다")
    c.eq(c.ls("kcp:v1:x:goal"), None, "T0a-4 빈 목표의 저장 키도 제거한다")
    c.check("T0a-4 목표 비우기")


def t_T0a_5_clear_all(c: Ctx):
    c.goto("#y2022", wait="#grid")
    _home(c)
    # 직접 저장소 주입은 홈 이동, flush, 주입, reload 순서를 지킨다.
    c.page.evaluate("KCP.flush && KCP.flush()")
    c.page.evaluate("localStorage.setItem('other', '1')")
    c.page.reload()
    _wait(c, ".home-grid")
    c.page.evaluate("""() => {
      KCP.store.set('drill', {x:1});
      KCP.on('storage:clear', () => {window.__clearCount = (window.__clearCount || 0) + 1;});
      const s = KCP.load('2023'); s.memo = 'z'; KCP.save('2023', s); KCP.clearAll();
    }""")
    c.wait_saved(400)
    keys = c.page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('kcp:'))")
    c.eq(keys, [], "T0a-5 모든 앱 키와 대기 저장을 지워 되살아나지 않는다")
    c.eq(c.ls("other"), 1, "T0a-5 앱 외부 저장 키는 보존한다")
    c.eq(c.page.evaluate("window.__clearCount"), 1, "T0a-5 storage:clear는 한 번 발생한다")
    c.check("T0a-5 모두 지운 홈")


def t_T0a_6_slots_events(c: Ctx):
    _home(c)
    _results(c, "T0a-6", """() => {
      const slot = document.querySelector('.home-grid').nextElementSibling;
      return [[slot.id === 'home-slot' && slot.classList.contains('stack') && slot.classList.contains('ext-slot'), '홈 슬롯의 위치와 공통 클래스 유지']];
    }""")
    _slot(c, "#home-slot", "T0a-6")
    c.page.evaluate("""() => {
      window.__homeCount = 0; KCP.on('home:render', () => ++window.__homeCount); KCP.rerender();
    }""")
    c.eq(c.page.evaluate("window.__homeCount"), 1, "T0a-6 재렌더마다 홈 이벤트 한 번")
    c.check("T0a-6 홈 슬롯")
    c.goto("#y2022", wait="#grid")
    _results(c, "T0a-6", """() => {
      const kids = document.querySelector('#phase').children;
      return [[kids.length === 2 && kids[0].id === 'prep-top' && kids[1].id === 'prep-body', '준비실 슬롯과 본문 순서'],
        [!!document.querySelector('#prep-body #grid'), '기존 지도는 준비실 본문 안에 있다']];
    }""")
    _slot(c, "#prep-top", "T0a-6")
    c.page.evaluate("""() => {
      window.__ev = {prep:0, cards:[], room:0, reflect:0, phase:null};
      KCP.on('prep:render', p => {++__ev.prep; __ev.prepPayload = p;});
      KCP.on('room:card', p => __ev.cards.push({
        valid: p.key === p.q.k && p.slot === document.querySelector('.qx[data-qx="'+p.i+'"]') &&
          p.card.classList.contains('qcard'), beforeRoom: __ev.room === 0
      }));
      KCP.on('room:render', p => {++__ev.room; __ev.roomPayload = p;});
      KCP.on('reflect:render', p => {++__ev.reflect; __ev.reflectPayload = p;});
      KCP.on('phase:change', p => {__ev.phase = {from:p.from, to:p.to};});
    }""")
    _phase(c, "room", ".qdeck .qcard")
    _results(c, "T0a-6", """() => {
      const e = __ev, tools = document.querySelector('#room-tools'), side = document.querySelector('#room-side');
      const main = document.querySelector('#room-main'), alt = document.querySelector('#room-alt');
      const p = e.roomPayload;
      return [[e.cards.length === document.querySelectorAll('.qdeck .qcard').length, '카드 수와 카드 이벤트 수 일치'],
        [e.cards.every(x => x.valid && x.beforeRoom), '카드 payload와 이벤트 순서 유지'],
        [e.room === 1, '면접실 이벤트 한 번'], [e.phase.from === 'prep' && e.phase.to === 'room', '단계 이벤트 이전값과 다음값'],
        [document.querySelector('textarea[data-a="0"]').nextElementSibling === document.querySelector('.qx[data-qx="0"]'), '답변칸 바로 뒤에 카드 슬롯'],
        [document.querySelector('.qdeck').previousElementSibling === tools && tools.classList.contains('stack'), '질문 덱 바로 앞에 도구 슬롯'],
        [side.previousElementSibling.classList.contains('panel') && side.previousElementSibling.querySelector('h3').textContent.includes('준비실에서 만든 답'), '오른쪽 슬롯 앞에는 준비실 답 패널'],
        [side.nextElementSibling.classList.contains('panel') && side.nextElementSibling.querySelector('h3').textContent.startsWith('답변 요령'), '오른쪽 슬롯 뒤에는 답변 요령 패널'],
        [!!main.querySelector('.desk') && main.nextElementSibling === alt && alt.hidden && getComputedStyle(alt).display === 'none', '지원자 보기와 숨긴 면접위원 보기 위치'],
        [p.main === main && p.alt === alt && p.tools === tools && p.side === side && p.root.contains(main) && p.year === '2022' && typeof p.save === 'function', '면접실 이벤트 DOM 참조와 저장 함수']];
    }""")
    for selector in ("#room-tools", "#room-side", '.qx[data-qx="0"]'):
        _slot(c, selector, "T0a-6")
    c.check("T0a-6 지원자 보기")
    c.eq(c.page.evaluate("""() => {
      document.querySelector('#room-alt').append(document.createTextNode('시험 보기'));
      return KCP.roomAlt(true);
    }"""), True, "T0a-6 면접위원 보기 열기 반환값")
    c.expect(c.page.locator("#room-main").is_hidden(), "T0a-6 면접위원 보기에서 지원자 영역 숨김")
    c.expect(c.page.locator("#room-alt").is_visible(), "T0a-6 면접위원 영역 표시")
    c.check("T0a-6 면접위원 보기")
    c.eq(c.page.evaluate("KCP.roomAlt(false)"), True, "T0a-6 지원자 보기 복귀 반환값")
    c.expect(c.page.locator("#room-alt").is_hidden(), "T0a-6 지원자 보기에서 면접위원 영역 숨김")
    c.expect(c.page.locator("#room-main").is_visible(), "T0a-6 지원자 영역 복귀")
    _phase(c, "reflect", "table.rubric")
    _results(c, "T0a-6", """() => {
      const p = __ev.reflectPayload, stacks = document.querySelectorAll('#phase > .desk > .stack');
      return [[__ev.reflect === 1 && p.qs.length === KCP.games['2022'].questions(p.state).length, '성찰 이벤트 한 번과 현재 질문 수'],
        [stacks[0].lastElementChild.id === 'reflect-left' && stacks[1].lastElementChild.id === 'reflect-right', '성찰 슬롯은 두 열의 마지막 자식'],
        [p.left === document.querySelector('#reflect-left') && p.right === document.querySelector('#reflect-right'), '성찰 이벤트 슬롯 참조']];
    }""")
    _slot(c, "#reflect-left", "T0a-6")
    _slot(c, "#reflect-right", "T0a-6")
    c.check("T0a-6 성찰 슬롯")
    _phase(c, "prep", "#grid")
    c.eq(c.page.evaluate("window.__ev.prep"), 1, "T0a-6 준비실 복귀 이벤트 한 번")
    c.check("T0a-6 준비실 복귀")


def t_T0a_6_prep_rerender(c: Ctx):
    _prep24(c, "T0a-6", lock=False)
    c.page.evaluate("""() => {
      document.querySelector('#prep-top').dataset.mark = '1'; window.__prepCount = 0;
      KCP.on('prep:render', () => ++window.__prepCount);
    }""")
    _lock24(c, "T0a-6")
    c.eq(c.page.locator("#prep-top").get_attribute("data-mark"), "1", "T0a-6 2024 내부 재렌더에서 준비실 슬롯 보존")
    c.eq(c.page.evaluate("window.__prepCount"), 0, "T0a-6 2024 내부 재렌더는 준비실 이벤트를 중복 발행하지 않는다")


def t_T0a_7_ext_idempotent(c: Ctx):
    _home(c)
    _results(c, "T0a-7", """() => {
      const s = {}, a = KCP.ext(s, 'x', {a:1,b:{c:1}}), b = KCP.ext(s, 'x', {a:2,d:3});
      const out = [[a === b && s.ext.x === a, 'ext 호출은 동일 객체 참조를 유지한다'],
        [a.a === 1 && a.d === 3 && a.b.c === 1, '기존값을 유지하고 빠진 기본값만 채운다']];
      a.a = 5; out.push([KCP.ext(s,'x',{a:1}).a === 5, '사용자가 바꾼 값은 덮어쓰지 않는다']);
      const d = {o:{}}; out.push([KCP.ext(s,'y',d).o !== d.o, '중첩 기본값도 복제한다']);
      s.ext.z = [1]; const z = KCP.ext(s,'z',{a:1});
      out.push([!Array.isArray(z) && z.a === 1, '배열 상태는 순수 객체 기본값으로 바꾼다']);
      const s2 = {ext:'bad'}; KCP.ext(s2,'q',{});
      const plain = v => v && typeof v === 'object' && !Array.isArray(v);
      out.push([plain(s2.ext) && plain(s2.ext.q), '잘못된 ext 루트를 복구한다']);
      return out;
    }""")
    c.check("T0a-7 홈")


def t_T0a_8_strings(c: Ctx):
    _home(c)
    for word, pair, expected in (("효율", "을/를", "효율을"), ("에너지", "을/를", "에너지를"), ("서울", "으로/로", "서울로"), ("바다", "으로/로", "바다로"), ("산", "으로/로", "산으로"), ("효율", "와/과", "효율과"), ("비용", "이고/고", "비용이고"), ("에너지", "이고/고", "에너지고"), ("A", "을/를", "A을(를)"), ("A", "으로/로", "A(으)로")):
        c.eq(c.page.evaluate("a => KCP.josa(...a)", [word, pair]), expected, f"T0a-8 조사 {word} {pair}")
    h = "제가 판단 기준으로 삼은 것은 "
    cases = [
        ([{"n":"효율","w":3},{"n":"형평성","w":2},{"n":"안전","w":2}], h + "효율, 형평성, 안전이고, 효율을 가장 무겁게 두었습니다."),
        ([{"n":"효율","w":2},{"n":"형평성","w":2},{"n":"안전","w":2}], h + "효율, 형평성, 안전이고, 세 기준을 같은 무게로 두었습니다."),
        ([{"n":"안전","w":1},{"n":"비용","w":1}], h + "안전, 비용이고, 두 기준을 같은 무게로 두었습니다."),
        ([{"n":"효율","w":3},{"n":"형평성","w":3},{"n":"안전","w":1}], h + "효율, 형평성, 안전이고, 효율과 형평성을 똑같이 가장 무겁게 두었습니다."),
        ([{"n":"효율","w":3},{"n":"비용","w":2}], h + "효율, 비용이고, 효율을 가장 무겁게 두었습니다."),
        ([{"n":"효율","w":3},{"n":"비용","w":0}], h + "효율, 비용입니다."),
        ([{"n":"효율","w":3},{"n":"비용"}], h + "효율, 비용입니다."),
        ([{"n":"효율","w":0}], h + "효율입니다."), ([{"n":"  ","w":3}], ""), ([], ""), (None, ""),
    ]
    for i, (value, expected) in enumerate(cases):
        c.eq(c.page.evaluate("v => KCP.critSentence(v)", value), expected, f"T0a-8 기준 문장 사례 {i + 1} 완전 일치")
    for i, (value, expected) in enumerate([
        ({"pick":"풍력","gain":"환경","cost":"공급 안정"}, "풍력은 환경 면에서 유리하지만 공급 안정 면에서는 불리합니다."),
        ({"pick":"소형 원자로","gain":"출력 안정성","cost":"폐기물"}, "소형 원자로는 출력 안정성 면에서 유리하지만 폐기물 면에서는 불리합니다."),
        ({"pick":"이 순서","gain":"생명·건강","cost":""}, "이 순서는 생명·건강 면에서 유리합니다."),
        ({"pick":"풍력","gain":"","cost":"비용"}, "풍력은 비용 면에서 불리합니다."),
        ({"pick":"","gain":"a","cost":"b"}, ""), ({"pick":"풍력"}, ""),
    ]):
        c.eq(c.page.evaluate("v => KCP.tradeSentence(v)", value), expected, f"T0a-8 얻는 것과 잃는 것 문장 사례 {i + 1}")
    _results(c, "T0a-8", """() => {
      const hash = s => {let h = 5381; for (let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(36);};
      const key = KCP.qkey({tag:'x',q:'y'});
      return [[KCP.qkey({k:'22-q1',tag:'x',q:'y'}) === '22-q1', '명시된 질문 키 우선'],
        [/^[0-9a-z]+$/.test(key) && key === hash('x|y') && key === KCP.qkey({tag:'x',q:'y'}) && key !== KCP.qkey({tag:'x',q:'z'}), '질문 해시는 계약 알고리즘과 일치'],
        [KCP.srcTag({src:'report'}) === '<span class="tag-official">보고서 문항</span>', '보고서 출처 태그 완전 일치'],
        [KCP.srcTag({}) === '<span class="tag-mine">연습용 질문</span>', '연습용 출처 태그 완전 일치'],
        [KCP.findCriterion('2022', /비판적 의견/) === '비판적 의견을 수용하고 발전된 방안을 탐구하는가', '2022 기준 검색'],
        [(KCP.findCriterion('2024', /한계점/) || '').includes('한계점을 인정하고'), '2024 기준 검색'],
        [KCP.findCriterion('2025', /비판적 의견|한계점/) === null, '없는 기준은 null'],
        [(KCP.findCriterion('2025', /유연한 사고/) || '').includes('유연한 사고'), '2025 기준 검색'],
        [KCP.fmt(65) === '01:05' && KCP.mss(65) === '1:05' && KCP.mss(5) === '0:05', '시간 문자열 형식']];
    }""")
    c.check("T0a-8 홈")


def t_T0a_9_practice_data(c: Ctx):
    _home(c)
    _results(c, "T0a-9", """() => {
      const ids = d => d.map(x => x.id).join(','), types = d => d.map(x => x.k).join('');
      const d1 = KCP.probeDeck('1번 문제'), d2 = KCP.probeDeck('1번 문제');
      const fresh = d1 !== d2 && d1.every((v,i) => v !== d2[i]); d1[0].text = '시험 변경';
      return [[ids(KCP.PROBES) === 'E1,E2,C1,C2,T1,T2,F1,F2,L1,L2', '반문 카드 ID와 순서'],
        [ids(d2) === 'C1,C2,T1,T2,F1,F2,L1,L2,E1,E2', '일반 덱 시작 유형과 순환 순서'],
        [KCP.probeDeck('인문적 통찰')[0].k === 'T', '인문 질문은 얻고 잃는 것부터 시작'],
        [KCP.probeDeck('2번 후속 · 수학적 사고')[0].k === 'E', '수학 질문은 근거부터 시작'],
        [types(KCP.probeDeck('발산적 사고')) === 'FFLLEECCTT', '발산 질문 일반 순환'],
        [ids(KCP.probeDeck('문항','2025')) === 'E1,E2,L1,L2,C1,C2,F1,T1', '2025 제외 카드와 순환 순서'],
        [types(KCP.probeDeck('발산적 사고','2025')) === 'FTEELLCC', '2025 발산 질문 순환'],
        [KCP.probeDeck('인문적 통찰','2025')[0].k === 'T', '2025 인문 시작 유형'],
        [[...d2,...KCP.probeDeck('문항','2025')].every(c => c.typeName === KCP.PROBE_TYPES.find(t=>t.k===c.k).n), '모든 카드 유형 이름 일치'],
        [fresh && KCP.probeDeck('1번 문제')[0].text !== '시험 변경', '덱과 카드 객체는 매번 독립 복제'],
        [KCP.HABITS.map(x=>x.k).join(',') === 'c,t,r,d', '관찰 습관 네 키'],
        [KCP.STARTERS.revise.length === 3 && KCP.STARTERS.keep.length === 2, '수정과 유지 말 시작 예시 개수'],
        [KCP.CRIT_CHIPS_BY_YEAR['2026'].official === true && KCP.CRIT_CHIPS_BY_YEAR['2026'].chips[0] === '기능/효과', '2026 평가 기준표 칩'],
        [JSON.stringify(KCP.CRIT_CHIPS_BY_YEAR['2022'].chips) === JSON.stringify(KCP.CRIT_CHIPS) && KCP.CRIT_CHIPS_BY_YEAR['2022'].chips !== KCP.CRIT_CHIPS, '2022 일반 기준 칩 복사'],
        [KCP.CRIT_CHIPS_BY_YEAR['2025'].chips.includes('인과 연결') && KCP.CRIT_CHIPS_BY_YEAR['2023'].official === false, '연도별 기준 칩 구분']];
    }""")
    expected_texts = [
        "그 판단의 근거가 된 자료의 숫자나 문장을 하나만 정확히 짚어 주세요.", "그 근거가 틀렸다면 결론도 바뀌나요?",
        "가장 무겁게 본 판단 기준 하나는 무엇이고, 다른 기준보다 앞에 둔 이유는 무엇인가요?", "그 기준을 다르게 보는 사람은 누구이고, 왜 그럴까요?",
        "그 선택으로 얻는 것과 잃는 것을 한 문장에 담아 말해 주세요.", "그 선택으로 가장 손해를 보는 사람에게 어떻게 설명하겠습니까?",
        "가장 중요하게 본 조건이 반대로 바뀌면 결론도 바뀌나요?", "쓸 수 있는 자원이 절반이라면 무엇부터 포기하겠습니까?",
        "이 계획이 실패한다면 가장 먼저 무너질 곳은 어디일까요?", "내 답에서 가장 약한 고리를 스스로 하나 꼽아 보세요.",
    ]
    c.eq(c.page.evaluate("KCP.PROBES.map(p => p.text)"), expected_texts, "T0a-9 반문 열 문장 완전 일치")
    c.check("T0a-9 홈")


def t_T0a_10_settings(c: Ctx):
    c.open("#home")
    defaults = {"timeMode":"real", "prep":15, "answer":8, "think":0, "endAlert":True, "fromUrl":False}
    c.eq(c.page.evaluate("KCP.settings()"), defaults, "T0a-10 기본 설정 완전 일치")
    _results(c, "T0a-10", """() => {
      const out = [[KCP.minutes('2022','prep') === 30 && KCP.minutes('2025','answer') === 15, '실전 모드는 보고서 시간 사용']];
      KCP.on('settings:change', p => {window.__settingsChange = p.settings;});
      KCP.setSettings({timeMode:'ext'});
      out.push([KCP.settings().timeMode === 'ext' && KCP.minutes('2022','prep') === 45 &&
        KCP.minutes('2023','prep') === 52.5 && __settingsChange.timeMode === 'ext', '연장 모드와 설정 이벤트는 대기 없이 반영된다']);
      KCP.setSettings({timeMode:'free'});
      out.push([KCP.minutes('2022','prep') === null, '자유 모드 시간은 null']);
      KCP.setSettings({think:7, prep:0, answer:'8', timeMode:'x', endAlert:'no', fromUrl:true});
      const s = KCP.settings();
      out.push([s.think === 0 && s.prep === 15 && s.answer === 8 && s.timeMode === 'free' && s.endAlert === true && !s.fromUrl, '형이 틀린 설정과 fromUrl 입력은 버린다']);
      KCP.setSettings({timeMode:'custom', prep:12, answer:5});
      out.push([KCP.minutes('2022','prep') === 12 && KCP.minutes('2022','answer') === 5, '사용자 시간 모드 반영']);
      out.push([KCP.minutes('missing','prep') === null, '없는 게임의 시간은 null']);
      return out;
    }""")
    c.wait_saved(400)
    stored = c.ls("kcp:v1:x:settings") or {}
    c.expect("fromUrl" not in stored, "T0a-10 fromUrl은 저장하지 않는다")
    c.eq(stored, {"timeMode":"custom","prep":12,"answer":5,"think":0,"endAlert":True}, "T0a-10 저장 원본에는 유효한 다섯 필드만 있다")
    c.page.reload()
    _wait(c, ".home-grid")
    c.eq(c.page.evaluate("KCP.settings().timeMode"), "custom", "T0a-10 새로고침 후 설정 복원")
    c.check("T0a-10 개인 설정 홈")


def t_T0a_10_url_settings(c: Ctx):
    c.open("?prep=20&answer=10#home")
    c.eq(c.page.evaluate("KCP.settings()"), {"timeMode":"custom","prep":20,"answer":10,"think":0,"endAlert":True,"fromUrl":True}, "T0a-10 유효한 수업 주소의 설정")
    c.eq(c.page.evaluate("KCP.minutes('2022','answer')"), 10, "T0a-10 수업 주소 답변 시간")
    c.page.evaluate("KCP.setSettings({endAlert:false})")
    c.wait_saved(400)
    c.eq(c.ls("kcp:v1:x:settings"), {"timeMode":"real","prep":15,"answer":8,"think":0,"endAlert":False}, "T0a-10 수업 주소값을 개인 설정으로 저장하지 않는다")
    _results(c, "T0a-10", """() => {
      KCP.setSettings({timeMode:'ext'}); const s = KCP.settings();
      const out = [[s.timeMode === 'ext' && s.prep === 20 && KCP.minutes('2022','prep') === 30, '수업 주소에서도 1.5배 연장 선택 가능']];
      KCP.setSettings({timeMode:'free'});
      out.push([KCP.settings().timeMode === 'free' && KCP.minutes('2022','prep') === null, '수업 주소에서도 시간 제한 없음 선택 가능']);
      KCP.setSettings({timeMode:'real'});
      out.push([KCP.settings().timeMode === 'custom', '주소에서 실전 선택 시 화면 설정은 사용자 시간']);
      return out;
    }""")
    c.check("T0a-10 수업 주소 홈")
    c.wait_saved(400)
    c.expect("fromUrl" not in (c.ls("kcp:v1:x:settings") or {}), "T0a-10 주소 상태가 저장 원본에 들어가지 않는다")
    c.open("#home")
    c.eq(c.page.evaluate("KCP.settings()"), {"timeMode":"real","prep":15,"answer":8,"think":0,"endAlert":False,"fromUrl":False}, "T0a-10 주소 제거 후 개인 설정 복원")
    c.check("T0a-10 주소 제거 홈")


def t_T0a_10_invalid_urls(c: Ctx):
    for query in ("?prep=0&answer=8#home", "?prep=abc&answer=8#home", "?prep=15#home", "?prep=15&answer=91#home"):
        c.open(query)
        c.eq(c.page.evaluate("KCP.settings().fromUrl"), False, f"T0a-10 잘못된 수업 주소는 무시한다 {query}")
        c.check(f"T0a-10 주소 검사 {query}")


def _speak_fixture(c, ident, callback=False, rec=""):
    c.page.evaluate("""a => {
      const d = document.createElement('div'); d.id = a.id; document.body.append(d);
      const opts = {rec:a.rec};
      if (a.callback) opts.onEnd = s => {
        window.__speakEnds = window.__speakEnds || {};
        const old = window.__speakEnds[a.id] || {count:0};
        window.__speakEnds[a.id] = {count:old.count + 1, seconds:s};
      };
      window.__speakHandles = window.__speakHandles || {};
      window.__speakHandles[a.id] = KCP.speak(d, opts);
    }""", {"id":ident, "callback":callback, "rec":rec})
    _wait(c, f"#{ident} .speak-go")


def t_T0a_11_speak_elapsed(c: Ctx):
    _home(c)
    _speak_fixture(c, "test-d1", rec="1분")
    c.page.click("#test-d1 .speak-go")
    c.expect("말하는 중" in c.page.inner_text("#test-d1 .speak-t") and "권장 1분" in c.page.inner_text("#test-d1 .speak-t"), "T0a-11 말하기 경과와 권장 시간 표시")
    c.eq(c.page.inner_text("#test-d1 .speak-go"), "끝", "T0a-11 말하기 버튼은 끝으로 바뀐다")
    c.eq(c.page.locator("#test-d1 .speak-go").get_attribute("aria-pressed"), "true", "T0a-11 말하기 중 눌림 상태")
    c.eq(c.page.locator("#test-d1 .speak-t").get_attribute("aria-live"), "off", "T0a-11 매초 경과를 음성으로 읽지 않는다")
    c.eq(c.page.inner_text("#test-d1 .sr-only"), "말하기 시작", "T0a-11 시작 접근성 알림")
    c.page.wait_for_timeout(1200)
    c.page.click("#test-d1 .speak-go")
    c.eq(c.page.inner_text("#test-d1 .speak-t"), "방금 0:01", "T0a-11 콜백 없는 말하기 결과 시간")
    c.eq(c.page.inner_text("#test-d1 .speak-go"), "말해 보기", "T0a-11 종료 뒤 버튼 복원")
    c.eq(c.page.locator("#test-d1 .speak-go").get_attribute("aria-pressed"), "false", "T0a-11 종료 뒤 눌림 해제")
    c.eq(c.page.inner_text("#test-d1 .sr-only"), "말하기 끝, 1초", "T0a-11 종료 접근성 알림")
    c.check("T0a-11 말하기 종료")


def t_T0a_11_speak_callback(c: Ctx):
    _home(c)
    _speak_fixture(c, "test-d2", callback=True, rec="1분")
    c.page.click("#test-d2 .speak-go")
    c.page.wait_for_timeout(1200)
    c.page.click("#test-d2 .speak-go")
    end = c.page.evaluate("window.__speakEnds['test-d2']")
    c.expect(end["seconds"] >= 1 and end["count"] == 1, "T0a-11 종료 콜백에 경과 초를 한 번 전달")
    c.eq(c.page.inner_text("#test-d2 .speak-t"), "", "T0a-11 콜백이 있으면 결과 표시 영역을 비운다")
    _speak_fixture(c, "test-d3")
    c.page.click("#test-d3 .speak-go")
    c.expect("권장" not in c.page.inner_text("#test-d3 .speak-t"), "T0a-11 권장 시간 없는 위젯은 권장 문구를 생략한다")
    c.page.evaluate("KCP.speakStop()")
    c.check("T0a-11 콜백과 권장 생략")


def t_T0a_11_speak_think(c: Ctx):
    _home(c)
    c.page.evaluate("KCP.setSettings({think:10})")
    _speak_fixture(c, "test-think", callback=True)
    c.page.click("#test-think .speak-go")
    c.expect(c.page.inner_text("#test-think .speak-t").startswith("생각 "), "T0a-11 생각 카운트다운 표시")
    c.eq(c.page.inner_text("#test-think .speak-go"), "바로 말하기", "T0a-11 생각 단계 버튼")
    c.eq(c.page.locator("#test-think .speak-go").get_attribute("aria-pressed"), "false", "T0a-11 생각 단계는 눌림 상태가 아니다")
    c.page.evaluate("KCP.speakStop()")
    c.eq(c.page.inner_text("#test-think .speak-t"), "", "T0a-11 생각 단계 중단 뒤 표시 비움")
    c.eq(c.page.evaluate("window.__speakEnds || null"), None, "T0a-11 생각 단계 중단은 종료 콜백을 부르지 않는다")
    c.page.click("#test-think .speak-go")
    c.page.click("#test-think .speak-go")
    c.expect(c.page.inner_text("#test-think .speak-t").startswith("말하는 중 "), "T0a-11 바로 말하기로 말하기 단계 진입")
    c.page.click("#test-think .speak-go")
    c.page.evaluate("KCP.setSettings({think:0})")
    c.check("T0a-11 생각 단계")


def t_T0a_11_speak_single_active(c: Ctx):
    _home(c)
    _speak_fixture(c, "test-dA", callback=True)
    _speak_fixture(c, "test-dB")
    c.page.click("#test-dA .speak-go")
    c.page.click("#test-dB .speak-go")
    c.eq(c.page.evaluate("window.__speakEnds['test-dA'].count"), 1, "T0a-11 다른 위젯 시작 시 앞 위젯 종료 콜백 한 번")
    c.eq(c.page.locator("#test-dA .speak-go").get_attribute("aria-pressed"), "false", "T0a-11 앞 위젯 눌림 해제")
    c.eq(c.page.locator("#test-dB .speak-go").get_attribute("aria-pressed"), "true", "T0a-11 뒤 위젯만 말하기 중")
    c.page.evaluate("window.__speakHandles['test-dB'].stop()")
    c.eq(c.page.locator("#test-dB .speak-go").get_attribute("aria-pressed"), "false", "T0a-11 반환한 stop으로 위젯 중단")
    c.check("T0a-11 위젯 한 개만 실행")


def t_T0a_11_speak_detached(c: Ctx):
    _home(c)
    _speak_fixture(c, "test-dC", callback=True)
    c.page.click("#test-dC .speak-go")
    c.page.evaluate("document.querySelector('#test-dC').remove()")
    c.page.wait_for_timeout(600)
    c.page.evaluate("KCP.speakStop()")
    c.eq(c.page.evaluate("(window.__speakEnds && window.__speakEnds['test-dC']) || null"), None, "T0a-11 DOM에서 떨어진 위젯은 콜백 없이 중단")
    _speak_fixture(c, "test-dD", callback=True)
    c.page.click("#test-dD .speak-go")
    c.page.click("#test-dD .speak-go")
    c.eq(c.page.evaluate("window.__speakEnds['test-dD'].count"), 1, "T0a-11 이탈 위젯 뒤에도 새 위젯을 시작하고 끝낼 수 있다")
    c.check("T0a-11 이탈 위젯 정리")


def t_T0a_11_speak_route(c: Ctx):
    _home(c)
    _speak_fixture(c, "test-dE", callback=True)
    c.page.click("#test-dE .speak-go")
    c.goto("#y2022", wait="#grid")
    c.eq(c.page.evaluate("window.__speakEnds['test-dE'].count"), 1, "T0a-11 라우트 변경이 말하기를 한 번 종료")
    c.eq(c.page.locator("#test-dE .speak-go").get_attribute("aria-pressed"), "false", "T0a-11 라우트 변경 뒤 말하기 버튼 복원")
    c.check("T0a-11 라우트 변경")


def t_T0a_12_print(c: Ctx):
    _home(c)
    c.page.evaluate("""() => {
      window.print = () => {window.__printCount = (window.__printCount || 0) + 1;};
      KCP.print('<p>테스트</p>');
    }""")
    _wait(c, "#printSheet", "attached")
    c.eq(c.page.locator("#printSheet").text_content(), "테스트", "T0a-12 인쇄용 내용 채움")
    c.expect(c.page.evaluate("document.documentElement.classList.contains('kcp-printing')"), "T0a-12 인쇄 모드 클래스 추가")
    c.eq(c.page.evaluate("window.__printCount"), 1, "T0a-12 브라우저 인쇄 한 번 호출")
    c.expect(c.page.locator("#printSheet").is_hidden(), "T0a-12 화면에서는 인쇄용 시트 숨김")
    c.check("T0a-12 화면 인쇄 준비")
    c.page.emulate_media(media="print")
    _wait(c, "#printSheet")
    c.expect(c.page.locator("#app").is_hidden(), "T0a-12 전용 인쇄 중 앱 화면 숨김")
    c.eq(c.page.locator("#printSheet").evaluate("el => getComputedStyle(el).color"), "rgb(21, 34, 44)", "T0a-12 다크 환경에서도 밝은 인쇄 글자색")
    c.eq(c.page.locator("body").evaluate("el => getComputedStyle(el).backgroundColor"), "rgb(255, 255, 255)", "T0a-12 전용 인쇄의 흰 배경")
    c.expect(c.contrast("#printSheet p") >= 4.5, "T0a-12 인쇄 글자 대비 4.5 이상")
    c.check("T0a-12 전용 인쇄")
    c.page.evaluate("window.dispatchEvent(new Event('afterprint'))")
    c.expect(not c.page.evaluate("document.documentElement.classList.contains('kcp-printing')"), "T0a-12 afterprint 뒤 인쇄 클래스 제거")
    c.eq(c.page.locator("#printSheet").text_content(), "", "T0a-12 afterprint 뒤 시트 비움")
    c.expect(c.page.locator("#printSheet").is_hidden(), "T0a-12 일반 인쇄에서 전용 시트 숨김")
    c.expect(c.page.locator("#app").is_visible(), "T0a-12 전용 API를 거치지 않은 일반 인쇄는 앱 화면 표시")
    c.check("T0a-12 일반 인쇄")
    c.page.emulate_media(media="screen")
    c.check("T0a-12 화면 복귀")


QUESTION_KEYS = {
    "2022": "22-q1 22-q1-nuc 22-q1-fos 22-q2 22-q2-cost 22-q2-one 22-div-typhoon 22-hum-vote 22-hum-future".split(),
    "2023": "23-q1 23-q1-conflict 23-q1-oppose 23-q2 23-q2-top 23-q2-timing 23-q2-gap 23-q2-avoid 23-q2-event 23-lost 23-flex 23-hum-verify".split(),
    "2024": "24-c1 24-c2 24-c3 24-c4 24-c5-yes 24-c5-diff 24-c6 24-i-energy-short 24-i-energy-over 24-i-lab 24-i-nolab 24-i-attr-all 24-i-attr-high 24-i-attr-low".split(),
    "2025": "25-q 25-first 25-swap 25-data 25-div-ai 25-div-fifth 25-hum-access 25-hum-future".split(),
    "2026": "26-q1 26-q2 26-sum 26-low 26-div-hidden 26-math 26-runner 26-hum-10y 26-hum-crit".split(),
}
REPORT_KEYS = {
    "2022": {"22-q1", "22-q2"}, "2023": {"23-q1", "23-q2"},
    "2024": {"24-c1", "24-c2", "24-c3", "24-c4", "24-c5-yes", "24-c5-diff", "24-c6"},
    "2025": {"25-q"}, "2026": {"26-q1", "26-q2"},
}


def _question_contract(c, year, label):
    questions = c.page.evaluate("y => KCP.games[y].questions(KCP.load(y))", year)
    keys = [q.get("k") for q in questions]
    c.expect(all(isinstance(k, str) and re.fullmatch(r"(22|23|24|25|26)-[a-z0-9-]+", k) and k[:2] == year[-2:] for k in keys), f"T0a-13 {year} {label} 모든 질문 키 형식과 연도")
    c.eq(len(keys), len(set(keys)), f"T0a-13 {year} {label} 질문 키 중복 없음")
    c.expect(all(k in QUESTION_KEYS[year] for k in keys), f"T0a-13 {year} {label} 지정된 고정 키 사용")
    reports = [q for q in questions if q.get("src") == "report"]
    c.eq(len(reports), {"2022":2,"2023":2,"2024":6,"2025":1,"2026":2}[year], f"T0a-13 {year} {label} 보고서 문항 개수")
    c.expect(all((q.get("src") == "report") == (q.get("k") in REPORT_KEYS[year]) for q in questions), f"T0a-13 {year} {label} 보고서 문항에만 출처 부여")
    return questions


def t_T0a_13_question_keys(c: Ctx):
    _home(c)
    for year in QUESTION_KEYS:
        _question_contract(c, year, "빈 상태")
    for prep, year in ((_prep22,"2022"), (_prep23,"2023"), (_prep24,"2024"), (_prep25,"2025"), (_prep26,"2026")):
        prep(c, "T0a-13")
        c.wait_saved(400)
        c.expect(c.ls(f"kcp:v1:{year}") is not None, f"T0a-13 {year} 준비 상태 저장")
        _question_contract(c, year, "회귀 조작 뒤")
        if year == "2024":
            _phase(c, "room", ".qdeck .qcard")
            c.eq(c.page.locator(".qcard").first.locator(".rec").first.inner_text(), "권장 답변 시간: 약 2~4분", "T0a-13 2024 질문의 권장 답변 시간 표시")
            c.check("T0a-13 2024 면접실 시간")


def t_T0a_13_question_variants(c: Ctx):
    _home(c)
    _results(c, "T0a-13", """() => {
      const s = KCP.load('2022'); s.game = {q1:{nuclear:'I9'}};
      const a = KCP.games['2022'].questions(s).find(q=>q.k==='22-q1-nuc');
      s.game.q1.nuclear = 'H9';
      const b = KCP.games['2022'].questions(s).find(q=>q.k==='22-q1-nuc');
      const qs = KCP.games['2024'].questions(KCP.load('2024'));
      const c1 = qs.find(q=>q.tag==='공통 1'), c4 = qs.find(q=>q.tag==='공통 4');
      const div = KCP.games['2025'].questions(KCP.load('2025')).find(q=>q.tag==='발산적 사고');
      const empty = KCP.games['2026'].questions(KCP.load('2026'));
      const state = KCP.load('2026');
      state.game = {scores:{bb:{f:4,s:4,e:4,g:4,u:4},db:{f:3,s:3,e:3,g:3,u:3},ml:{f:2,s:2,e:2,g:2,u:2},wc:{f:5,s:5,e:5,g:5,u:5}},best:'ml'};
      const ml = KCP.games['2026'].questions(state); state.game.best = 'wc';
      const wc = KCP.games['2026'].questions(state);
      return [[a && b && a.q !== b.q && a.k === b.k, '준비실 선택으로 문장은 바뀌어도 핵심 키 유지'],
        [c1.time === '약 2~4분' && c1.rec === undefined, '2024 권장 시간은 time으로 분리'],
        [c4.time === undefined && c4.rec === undefined, '2024 공통 4에는 시간과 기준 메모 없음'],
        [div.rec.startsWith('보고서의 면접 질문 기준') && div.time === undefined, '2025 기준 메모를 답변 시간으로 쓰지 않는다'],
        [empty.find(q=>q.k==='26-q2').q === '최우수 기술 하나를 추천하고 그 이유를 설명해 주세요.' && !empty.some(q=>q.k==='26-runner'), '2026 추천 전 문장과 탈락 질문 숨김'],
        [ml.find(q=>q.k==='26-q2').q.includes('AI 마음렌즈') && ml.some(q=>q.k==='26-runner') && ml[2].k === '26-sum', '2026 합계와 다른 추천의 질문 및 고정 키'],
        [!wc.some(q=>q.k==='26-sum') && wc[2].k === '26-low', '2026 합계 최고 추천의 질문 순서']];
    }""")
    c.check("T0a-13 질문 변형 홈")


def t_T0a_14_routes_phases(c: Ctx):
    c.goto("#y2022", wait="#grid")
    c.eq(c.page.evaluate("KCP.goPhase('room')"), True, "T0a-14 유효 단계 이동 반환값")
    _wait(c, ".qdeck")
    c.eq(c.page.locator('.phases button[data-phase="room"]').get_attribute("aria-pressed"), "true", "T0a-14 면접실 단계 버튼 눌림")
    c.eq(c.page.evaluate("KCP.goPhase('zzz')"), False, "T0a-14 잘못된 단계 거부")
    c.expect(c.page.locator(".qdeck").is_visible(), "T0a-14 잘못된 단계는 현재 화면 유지")
    c.check("T0a-14 단계 이동 면접실")
    _home(c)
    c.eq(c.page.evaluate("KCP.goPhase('room')"), False, "T0a-14 홈에서는 게임 단계 이동 거부")
    c.eq(c.page.evaluate("KCP.roomAlt(true)"), False, "T0a-14 면접실 영역이 없으면 대체 보기 거부")
    _results(c, "T0a-14", """() => {
      const rejected = ['home','y2022','1x','A','x_y',''].every(n=>KCP.route(n,()=>{}) === false);
      const out = [[rejected, '예약 이름과 잘못된 라우트 이름 거부']];
      KCP.on('route:change', p => {window.__routePayload = p;});
      out.push([KCP.route('t0x',(app,arg) => {app.innerHTML='<h1>T '+KCP.esc(arg)+'</h1>';}) === true, '사용자 라우트 등록']);
      // 포커스 조건을 명시적으로 준비한다.
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      return out;
    }""")
    c.goto("#t0x/a%20b", wait="#app h1")
    c.eq(c.page.inner_text("#app"), "T a b", "T0a-14 라우트 인자의 URI 디코딩")
    c.eq(c.page.evaluate("window.__routePayload"), {"name":"t0x","arg":"a b"}, "T0a-14 라우트 이벤트 payload")
    c.expect(c.page.evaluate("document.activeElement === document.querySelector('#app h1')"), "T0a-14 본문 포커스에서 첫 제목으로 이동")
    c.eq(c.page.locator("#app h1").get_attribute("tabindex"), "-1", "T0a-14 제목 포커스용 tabindex")
    c.eq(c.page.title(), "켄텍 창의성 면접 연습실", "T0a-14 확장 라우트 문서 제목")
    c.check("T0a-14 확장 라우트")
    c.goto("#t0x/%E0%A4%A", wait="#app h1")
    c.page.wait_for_function("document.querySelector('#app h1').textContent === 'T %E0%A4%A'")
    c.eq(c.page.inner_text("#app h1"), "T %E0%A4%A", "T0a-14 디코딩 실패 인자는 원문 유지")
    c.goto("#zzz", wait=".home-grid")
    for year in range(2022, 2027):
        c.eq(c.page.locator(f'.pkg[href="#y{year}"]').count(), 1, f"T0a-14 없는 라우트에서 {year} 홈 카드 표시")
    c.page.evaluate("KCP.rerender()")
    _wait(c, ".home-grid")
    c.check("T0a-14 없는 라우트 홈 재렌더")


def t_T0a_15_common_css(c: Ctx):
    _home(c)
    _results(c, "T0a-15", """() => {
      const out = [];
      for (const [tag,cls] of [['span','chip'],['div','field'],['button','btn'],['div','row'],['div','caution']]) {
        const el = document.createElement(tag); el.className = cls; el.hidden = true; el.textContent = '시험'; document.body.append(el);
        out.push([el.hidden && getComputedStyle(el).display === 'none', cls+'는 hidden 속성으로 숨긴다']);
      }
      for (const value of ['true','false']) {
        const b = document.createElement('button'); b.id='test-btn-'+value; b.className='btn'; b.setAttribute('aria-pressed',value); b.textContent='토글 시험'; document.body.append(b);
      }
      out.push([getComputedStyle(document.querySelector('#test-btn-true')).backgroundColor !== getComputedStyle(document.querySelector('#test-btn-false')).backgroundColor, '토글 눌림 상태의 배경색 구분']);
      return out;
    }""")
    for selector in ("#test-btn-true", "#test-btn-false"):
        _wait(c, selector)
        c.expect(c.contrast(selector) >= 4.5, f"T0a-15 {selector} 글자 대비 4.5 이상")
    c.check("T0a-15 공통 숨김과 토글")
    c.goto("#y2022", wait='[data-ov="map"]')
    c.page.click('[data-ov="map"]')
    c.eq(c.page.locator('[data-ov="map"]').get_attribute("aria-pressed"), "true", "T0a-15 지도 도구 눌림 상태")
    colors = c.page.evaluate("""() => [
      getComputedStyle(document.querySelector('[data-ov="map"]')).backgroundColor,
      getComputedStyle(document.querySelector('.strip')).backgroundColor
    ]""")
    c.eq(colors[0], colors[1], "T0a-15 기존 2022 도구 모음의 배경색 유지")
    c.eq(c.page.locator("#strip").evaluate("el => getComputedStyle(el).position"), "sticky", "T0a-15 게임 띠의 sticky 배치 유지")
    _phase(c, "room", ".qdeck")
    margin = c.page.locator("#room-side").evaluate("el => getComputedStyle(el.nextElementSibling).marginTop")
    c.eq(margin, "14px", "T0a-15 오른쪽 마지막 답변 요령 패널의 위 여백 14px")
    c.check("T0a-15 면접실 패널 간격")


def t_T0a_16_export_event(c: Ctx):
    c.goto("#y2022", wait="#grid")
    _phase(c, "reflect", "#nextstep-2022")
    c.page.fill("#nextstep-2022", "목표")
    _clipboard(c)
    c.page.evaluate("() => { KCP.on('export:text', p => p.parts.push('\\n■ 시험 블록\\n내용')); }")
    c.page.click("#copyAll")
    c.page.wait_for_function("typeof window.__clip === 'string'")
    copied = c.page.evaluate("window.__clip")
    block, rubric, goal = copied.find("■ 시험 블록"), copied.find("■ 자기 평가"), copied.find("■ 다음 연습 목표")
    c.expect(0 <= rubric < block < goal, "T0a-16 확장 블록은 자기 평가 뒤와 다음 연습 목표 앞")
    c.expect("■ 시험 블록\n내용" in copied, "T0a-16 이벤트로 추가한 내용을 복사한다")
    c.check("T0a-16 확장 내보내기")


def t_T0a_16_export_without_handler(c: Ctx):
    c.goto("#y2022", wait="#grid")
    _phase(c, "reflect", "#copyAll")
    _clipboard(c)
    c.page.click("#copyAll")
    c.page.wait_for_function("typeof window.__clip === 'string'")
    c.expect("■ 시험 블록" not in c.page.evaluate("window.__clip"), "T0a-16 처리기를 등록하지 않은 컨텍스트에는 시험 블록 없음")
    c.check("T0a-16 기본 내보내기")


def t_T0a_16_event_order(c: Ctx):
    _home(c)
    _results(c, "T0a-16", """() => {
      const seen = []; let off2; let once = false;
      const off1 = KCP.on('t0a-test', () => {
        seen.push('a'); off2();
        if (!once) {once=true; KCP.on('t0a-test', () => seen.push('c'));}
      });
      off2 = KCP.on('t0a-test', () => seen.push('b'));
      KCP.emit('t0a-test', {}); const first = seen.join(','); seen.length=0;
      KCP.emit('t0a-test', {}); const second = seen.join(','); off1();
      return [[first === 'a,b', '등록 순서대로 동기 호출하고 처리기 목록 사본을 사용한다'],
        [second === 'a,c', '해제한 처리기는 다음 이벤트부터 제외한다']];
    }""")
    c.check("T0a-16 이벤트 순서 홈")


def t_T0a_17_files(c: Ctx):
    _home(c)
    structure = c.page.evaluate("""() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT), comments=[];
      while(walker.nextNode()) comments.push(walker.currentNode.textContent.trim());
      return {links:[...document.querySelectorAll('head link[rel="stylesheet"]')].map(el=>el.getAttribute('href')),
        scripts:[...document.querySelectorAll('body script')].map(el=>({src:el.getAttribute('src'),code:el.textContent})), comments};
    }""")
    styles = ["styles.css", "ext/routine.css", "ext/probe.css", "ext/peer.css", "ext/drill.css"]
    normalized = [url.split("?")[0].removeprefix("./") for url in structure["links"]]
    positions = [normalized.index(name) if name in normalized else -1 for name in styles]
    c.expect(all(i >= 0 for i in positions) and positions == list(range(positions[0], positions[0] + len(styles))), "T0a-17 공통과 모듈 스타일시트 로드 순서")
    font_positions = [i for i, url in enumerate(normalized) if "fonts.googleapis.com" in url]
    c.expect(bool(font_positions) and max(font_positions) < positions[0], "T0a-17 구글 폰트 뒤에 앱 스타일시트 로드")
    expected_scripts = ["data.js", "app.js", "practice-data.js"] + [f"g{y}.js" for y in range(2022, 2027)] + ["ext/routine.js", "ext/probe.js", "ext/peer.js", "ext/drill-data.js", "ext/drill.js"]
    external = [s["src"].split("?")[0].removeprefix("./") for s in structure["scripts"] if s["src"]]
    # 창작 games/*.js는 g2026.js와 ext 사이에 추가될 수 있다.
    c.eq([s for s in external if s in expected_scripts], expected_scripts, "T0a-17 기본 및 모듈 스크립트 로드 순서")
    c.expect(all(external.index("g2026.js") < i < external.index("ext/routine.js") for i, src in enumerate(external) if src.startswith("games/") and src.endswith(".js")), "T0a-17 창작 게임은 기출 다음과 모듈 앞에 로드")
    # 통합 뒤에는 자리 표시 주석이 실제 연결 안내로 바뀐다. 창작 게임 구역 주석이 있는지만 본다.
    c.expect(any(text.startswith("창작 게임") for text in structure["comments"]), "T0a-17 창작 게임 구역 안내 주석")
    boot_indices = [i for i, s in enumerate(structure["scripts"]) if not s["src"] and re.search(r"\bKCP\.boot\s*\(\s*\)", s["code"])]
    c.expect(len(boot_indices) == 1 and boot_indices[0] > max(i for i,s in enumerate(structure["scripts"]) if s["src"]), "T0a-17 모든 스크립트 뒤에 boot 한 번")
    files = ["routine.js", "routine.css", "probe.js", "probe.css", "peer.js", "peer.css", "drill-data.js", "drill.js", "drill.css"]
    fetched = c.page.evaluate("""async names => Promise.all(names.map(async name => {
      const r=await fetch('ext/'+name); return {name,status:r.status,text:await r.text()};
    }))""", files)
    for item in fetched:
        c.eq(item["status"], 200, f"T0a-17 ext/{item['name']} 요청 성공")
        text = item["text"].strip()
        stripped = re.sub(r"/\*.*?\*/|//[^\n]*", "", text, flags=re.S).strip()
        if not stripped:
            pattern = r"//[^\n]*" if item["name"].endswith(".js") else r"/\*[^\n]*\*/"
            c.expect(re.fullmatch(pattern, text) is not None, f"T0a-17 미구현 {item['name']} 스텁은 주석 한 줄")
    c.check("T0a-17 파일 로드 홈")


def t_T0a_17_original_game(c: Ctx):
    _home(c)
    c.expect(c.page.evaluate("Array.isArray(KCP.ORIGINAL_ORDER)"), "T0a-17 창작 게임 등록 순서 배열 존재")
    _results(c, "T0a-17", """() => {
      KCP.store.set('s-x',1);
      const reserved = KCP.store.get('s-x',null) === null;
      KCP.store.remove('s-x');
      const out = [[KCP.gameLabel('2024') === '2024학년도 켄트로늄 정착 시뮬레이터', '기출 전체 이름 함수'],
        [KCP.gameShort('2024') === '2024 켄트로늄 정착 시뮬레이터', '기출 짧은 이름 함수'],
        [reserved && KCP.store.get('s-x',null) === null, '창작 ID와 겹치는 store 이름 거부']];
      KCP.YEARS['s-test']={title:'시험 게임',format:'t',desc:'d',prep:20,answer:10,rubric:KCP.YEARS['2025'].rubric,intent:['i'],original:true,topics:[],concepts:[]};
      KCP.games['s-test']={brief:()=>'<p>b</p>',renderPrep:(root,s,save,next)=>{
        root.innerHTML='<button id="go">go</button>'; root.querySelector('#go').onclick=next;
      },questions:()=>[{k:'t-1',tag:'문항',q:'질문'}],recap:()=>[{t:'r',d:'d'}],reflectExtra:()=>'<p>x</p>'};
      KCP.ORIGINAL_ORDER.push('s-test');
      out.push([KCP.gameLabel('s-test') === '시험 게임' && KCP.gameShort('s-test') === '시험 게임', '창작 게임 이름에 연도 접미사를 붙이지 않는다']);
      out.push([KCP.probeDeck('문항','s-test').map(q=>q.id).join(',') === KCP.probeDeck('문항').map(q=>q.id).join(','), '창작 게임 반문은 일반 덱 기본값']);
      return out;
    }""")
    c.goto("#ys-test", wait="#go")
    _wait(c, "#strip")
    title = c.page.inner_text("#strip .ttl")
    c.expect("시험 게임" in title and "학년도" not in title, "T0a-17 창작 게임 라우트와 띠 제목")
    c.eq(c.page.title(), "시험 게임 · 켄텍 창의성 면접 연습실", "T0a-17 창작 게임 문서 제목")
    c.check("T0a-17 창작 게임 준비실")
    c.page.click("#go")
    _wait(c, ".qdeck .qcard")
    c.eq(c.page.locator(".qdeck .qcard").count(), 1, "T0a-17 창작 게임 질문 카드 한 개")
    c.page.fill('textarea[data-a="0"]', "가상 답변")
    c.check("T0a-17 창작 게임 면접실")
    _phase(c, "reflect", "#nextstep-s-test")
    c.page.fill("#nextstep-s-test", "다음에는 근거 먼저")
    c.wait_saved(400)
    state = c.ls("kcp:v1:s-test") or {}
    c.eq(state.get("phase"), "reflect", "T0a-17 창작 게임은 독립 저장 키로 성찰 단계 저장")
    c.eq(state.get("answers", {}).get("0"), "가상 답변", "T0a-17 창작 게임의 기존 순번 답변 저장")
    goal = c.ls("kcp:v1:x:goal") or {}
    c.eq(goal.get("title"), "시험 게임", "T0a-17 창작 게임 목표 제목에 gameShort 사용")
    c.eq(c.ls("kcp:v1:x:s-x"), None, "T0a-17 금지된 store 이름은 저장되지 않는다")
    c.check("T0a-17 창작 게임 성찰")


if __name__ == "__main__":
    main(globals())
