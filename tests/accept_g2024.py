"""2024 D-76 독립 수용 검사.

기준: A-2024.md 작업 1~5, B-2526.md 작업 4~5,
DECISIONS D-76, AUDIT-2024 §2·§3-1·§5.1~5.5 및 지시서 C.
지도 C1~C6 기준: lanes/fix2426/map24/impl.md 명세 1~9·문구 1~7.
지형 기대값은 AUDIT §4-3의 예시 계획에서 전사한다. 구현은 셀렉터와
저장 봉투 확인에만 사용한다. 새로고침 비교의 기준은 준비실 장면을 기록하되,
독립 지형 개수와 먼저 대조해 양쪽이 같은 잘못된 값을 보이는 경우도 잡는다.
harness: 네 환경, problems: 출력, 콘솔 error/warning·pageerror·가로 넘침 0.
브라우저 실행은 총괄의 샌드박스 밖 로컬 환경에서만 한다.
"""

import json
import re
from collections import Counter, deque
from contextlib import contextmanager

from harness import Cfg, Ctx, main
from d76_helpers import reload_at, set_mode, tab_to, touch_targets


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
    # map24 명세 공통 규칙: 3칸 경로도 장면과 대조한다. 기존 7칸 기대는 유지한다.
    total = sum(expected.values())
    c.expect(f"고른 정착지 {total}칸" in caption, f"A 작업 1 {label}: 정착지 {total}칸, 0칸 아님")
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


# map24/impl.md 명세 3·4: 짝수 열이 반 칸 아래인 even-q 좌표계.
# 구현의 nbrs/directionNeighbor/이웃 표를 호출하거나 복사하지 않는다.
HEX = "#map polygon[data-hex]"
STOP = HEX + '[tabindex="0"]'
THREE = ("6-7", "6-8", "5-8")
DIRECTIONS = {
    "N": ("ArrowUp", "↑", "위"),
    "S": ("ArrowDown", "↓", "아래"),
    "NW": ("ArrowLeft", "↖", "왼쪽 위"),
    "NE": ("ArrowRight", "↗", "오른쪽 위"),
    "SW": ("Shift+ArrowLeft", "↙", "왼쪽 아래"),
    "SE": ("Shift+ArrowRight", "↘", "오른쪽 아래"),
}
OPPOSITE = {"N": "S", "S": "N", "NW": "SE", "NE": "SW", "SW": "NE", "SE": "NW"}
# 지형·K 독립 기대: AUDIT-2024 §1(채굴량)·§4-3(가운데 계획),
# 기존 C 작업 2(a)의 RIGHT(오른쪽 초원 7칸). 구현의 class/aria-label은 읽지 않는다.
TERRAIN_K = {"용암": 18, "호수": 10, "갯벌": 6, "사막": 5, "숲": 4, "초원": 3}
CELL_TERRAIN = {
    "5-4": "호수", "5-5": "숲", "5-6": "숲", "5-7": "숲", "5-8": "숲",
    "6-6": "갯벌", "6-7": "초원", **{cell: "초원" for cell in RIGHT},
}
MAP_HELP = ("Tab으로 지도에 들어갑니다. ↑↓는 위·아래, ←→는 왼쪽·오른쪽 위, "
            "Shift+←→는 왼쪽·오른쪽 아래로 옮기고 Enter·Space로 고르거나 뺍니다.")
PAD_HINT = "점선 테두리를 방향 단추로 옮겨 큰 단추로 고르세요. 칸을 바로 눌러도 됩니다."


def _neighbor(cell, direction, ids):
    row, col = map(int, cell.split("-"))
    if direction in ("N", "S"):
        dr, dc = (-1 if direction == "N" else 1), 0
    else:
        # 같은 행의 홀수 열은 짝수 열보다 위에 있다.
        dr = (0 if col % 2 == 0 else -1) + (1 if direction in ("SW", "SE") else 0)
        dc = -1 if direction in ("NW", "SW") else 1
    candidate = f"{row + dr}-{col + dc}"
    return candidate if candidate in ids else None


def _map_open(c):
    c.goto("#y2024", wait=HEX)
    ids = c.page.locator(HEX).evaluate_all("els => els.map(el => el.dataset.hex)")
    c.eq(len(ids), 133, "C 공통: 장면이 읽는 지도 다각형 133칸")
    c.eq(len(set(ids)), 133, "C 공통: data-hex 중복/커서 도형의 칸 위장 없음")
    c.expect(set(CELL_TERRAIN).issubset(ids), "C 공통: 독립 지형표의 칸이 모두 존재")
    _map_bounds(c, "최초 지도")
    return set(ids)


def _map_bounds(c, label):
    c.check(f"C {label}")
    sizes = c.page.locator("#map").evaluate("""el => {
      const panel = el.closest('.panel');
      return [el, panel].map(n => n ? {sw:n.scrollWidth, cw:n.clientWidth} : null);
    }""")
    for name, size in zip(("지도", "지도 패널"), sizes):
        c.expect(size is not None and size["sw"] <= size["cw"], f"C {label}: {name} 가로 넘침 0 ({size})")


def _cursor(c, expected=None, *, focused=False):
    stops = c.page.locator(STOP)
    c.eq(stops.count(), 1, "C 명세 4: 지도 Tab 정지점 정확히 1개")
    c.eq(c.page.locator(HEX + '[tabindex="-1"]').count(), 132, "C 명세 4: 나머지 132칸 tabindex=-1")
    actual = stops.first.get_attribute("data-hex") if stops.count() else None
    if expected is not None:
        c.eq(actual, expected, "C 명세 3·4: 독립 even-q 계산의 커서 칸")
    if focused:
        c.eq(c.page.evaluate("() => document.activeElement?.getAttribute('data-hex')"),
             expected or actual, "C 명세 4: 실제 초점이 유일한 tabindex=0 칸")
    return actual


def _tab_into_map(c, expected):
    # 명세 4: 실제 Tab을 사용한다. focus(), JS 초점 지정, locator.press는 쓰지 않는다.
    if not tab_to(c, "#showK"):
        return False
    c.page.keyboard.press("Tab")
    _cursor(c, expected, focused=True)
    return c.page.evaluate("() => !!document.activeElement?.matches('#map polygon[data-hex]')")


def _route(start, target, ids):
    queue = deque([(start, [])])
    visited = {start}
    while queue:
        cell, path = queue.popleft()
        if cell == target:
            return path
        for direction in DIRECTIONS:
            dest = _neighbor(cell, direction, ids)
            if dest is not None and dest not in visited:
                visited.add(dest)
                queue.append((dest, path + [(direction, dest)]))
    raise AssertionError(f"독립 even-q 경로 없음: {start} → {target}")


def _move_to(c, target, ids, *, pad=False):
    for direction, dest in _route(_cursor(c), target, ids):
        if pad:
            button = c.page.locator(f'[data-map24-dir="{direction}"]')
            c.expect(button.is_enabled(), f"C 명세 5: 이웃 {dest}로 가는 패드 활성")
            button.click()
        else:
            c.page.keyboard.press(DIRECTIONS[direction][0])
        _cursor(c, dest, focused=not pad)
    _cursor(c, target, focused=not pad)
    _map_bounds(c, f"{'패드' if pad else '키보드'} {target} 이동")


def _counts(cells):
    return dict(Counter(CELL_TERRAIN[cell] for cell in cells))


def _cell_name(cell):
    row, col = map(int, cell.split("-"))
    terrain = CELL_TERRAIN[cell]
    return f"{row + 1}번째 줄 {col + 1}번째 칸, {terrain} {TERRAIN_K[terrain]}K"


def _pick_name(cell, selected=False):
    terrain = CELL_TERRAIN[cell]
    return f"이 칸 {'빼기' if selected else '고르기'} · {terrain} {TERRAIN_K[terrain]}K"


def _live_cursor(c, cell, selected=False):
    c.eq(c.page.locator("#map24-live").text_content(),
         _cell_name(cell) + (", 고른 칸" if selected else ", 안 고른 칸"), "C 문구 3: 커서 이동 알림")


def _live_pick(c, cell, n, *, removed=False):
    terrain = CELL_TERRAIN[cell]
    c.eq(c.page.locator("#map24-live").text_content(),
         f"{terrain} {TERRAIN_K[terrain]}K {'뺌' if removed else '고름'}, 정착지 {n} / 7칸",
         "C 문구 4: 고르기/빼기 알림")


def _map_texts(c):
    # SVG inner_text/textContent는 display:none인 tspan도 섞을 수 있다.
    # 명세 7의 '칸 안 글자'는 계산 스타일로 표시 중인 텍스트 노드만 잰다.
    return c.page.locator("#map svg text").evaluate_all("""els => els.map(el => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let out = '', node;
      while ((node = walker.nextNode())) {
        let visible = true;
        for (let p = node.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) === 0) {
            visible = false; break;
          }
        }
        if (visible) out += node.textContent;
      }
      return {id:el.previousElementSibling?.getAttribute('data-hex'), text:out};
    })""")


@contextmanager
def _fresh_path(c, path):
    # C3의 세 경로는 각기 새 localStorage에서 시작한다. 새 문맥에도 harness와
    # 같은 오류 수집을 붙여 콘솔·페이지 오류·실패 요청을 누락하지 않는다.
    mobile = path == "pad"
    cfg = Cfg(f"{path}-{c.cfg.scheme}", 390 if mobile else 1280, 844 if mobile else 900, c.cfg.scheme, mobile)
    context = c.page.context.browser.new_context(
        viewport={"width": cfg.width, "height": cfg.height}, color_scheme=cfg.scheme,
        is_mobile=mobile, has_touch=mobile, locale="ko-KR")
    try:
        page = context.new_page()
        name = f"{c.test}/{path}"
        page.on("console", lambda m: c.rec["console"].append({"test": name, "type": m.type, "text": m.text})
                if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: c.rec["pageerrors"].append({"test": name, "text": str(e)}))
        page.on("requestfailed", lambda r: c.rec["failed"].append({"test": name, "url": r.url, "err": r.failure}))
        child = Ctx(page, cfg, c.rec, name)
        child.open()
        c.eq((child.ls(KEY) or {}).get("game", {}).get("sel", []), [], f"C3 {path}: 새 문맥의 초기 선택 없음")
        yield child
    finally:
        context.close()


def t_C1_single_tab_stop(c: Ctx):
    _map_open(c)
    _cursor(c, "6-7")
    if not _tab_into_map(c, "6-7"):
        return
    c.page.keyboard.press("Tab")
    c.expect(c.page.evaluate("() => !!document.activeElement && document.activeElement !== document.body && "
                             "!document.activeElement.matches('#map polygon[data-hex]')"),
             "C1 명세 4: 지도 진입 뒤 실제 Tab 한 번으로 지도 밖 다음 조작에 도달")
    c.page.keyboard.press("Shift+Tab")
    _cursor(c, "6-7", focused=True)
    choose_plan(c)
    # 명세 4와 검사 지시 C1: 확정 뒤에도 읽기/이동용 정지점 하나를 둔다.
    _cursor(c, MIXED[0])
    c.expect(c.page.locator("#pick24").is_disabled(), "C1 명세 5: 확정 후 큰 고르기 단추 비활성")
    if not _tab_into_map(c, MIXED[0]):
        return
    saved = (c.ls(KEY) or {}).get("game")
    ids = set(c.page.locator(HEX).evaluate_all("els => els.map(el => el.dataset.hex)"))
    dest = _neighbor(MIXED[0], "N", ids)
    c.page.keyboard.press("ArrowUp")
    _cursor(c, dest, focused=True)
    for key in ("Enter", "Space"):
        c.page.keyboard.press(key)
        _cursor(c, dest, focused=True)
    c.wait_saved(400)
    c.eq((c.ls(KEY) or {}).get("game"), saved, "C1 명세 4: 확정 뒤 이동 가능, Enter/Space는 저장 계획 불변")
    c.page.keyboard.press("Tab")
    c.expect(c.page.evaluate("() => !!document.activeElement && document.activeElement !== document.body && "
                             "!document.activeElement.matches('#map polygon[data-hex]')"),
             "C1 확정 뒤에도 실제 Tab 한 번으로 지도 통과")
    scene_counts(c, MIXED_COUNTS, "C1 확정 뒤 c안")


def t_C2_keyboard_six_directions(c: Ctx):
    ids = _map_open(c)
    if not _tab_into_map(c, "6-7"):
        return
    for direction, (key, _, _) in DIRECTIONS.items():
        dest = _neighbor("6-7", direction, ids)
        c.expect(dest is not None, f"C2 가운데 {direction} 이웃 존재")
        c.page.keyboard.press(key)
        _cursor(c, dest, focused=True)
        c.page.keyboard.press(DIRECTIONS[OPPOSITE[direction]][0])
        _cursor(c, "6-7", focused=True)
    # 홀수 열(6-7)뿐 아니라 짝수 열에서도 여섯 방향을 대조해 오프셋 오류를 잡는다.
    _move_to(c, "6-8", ids)
    for direction, (key, _, _) in DIRECTIONS.items():
        dest = _neighbor("6-8", direction, ids)
        c.page.keyboard.press(key)
        _cursor(c, dest or "6-8", focused=True)
        if dest:
            c.page.keyboard.press(DIRECTIONS[OPPOSITE[direction]][0])
            _cursor(c, "6-8", focused=True)
    _move_to(c, "0-4", ids)
    c.eq(_neighbor("0-4", "N", ids), None, "C2 지도 위 끝에는 이웃 없음")
    c.page.keyboard.press("ArrowUp")
    _cursor(c, "0-4", focused=True)
    c.eq(c.page.locator(HEX + '[aria-pressed="true"]').count(), 0, "C2 방향 이동은 고르기를 하지 않음")
    for cell in THREE:
        _move_to(c, cell, ids)
        c.page.keyboard.press("Enter")
        _cursor(c, cell, focused=True)
    scene_counts(c, _counts(THREE), "C2 키보드 고르기")


def t_C3_same_saved_value(c: Ctx):
    games = {}
    for path in ("mouse", "keyboard", "pad"):
        with _fresh_path(c, path) as p:
            ids = _map_open(p)
            if path == "keyboard" and not _tab_into_map(p, "6-7"):
                continue
            for i, cell in enumerate(THREE):
                if path == "mouse":
                    p.page.locator(f'{HEX}[data-hex="{cell}"]').click()
                else:
                    _move_to(p, cell, ids, pad=path == "pad")
                    if path == "pad":
                        p.page.locator("#pick24").click()
                    else:
                        p.page.keyboard.press("Enter" if i % 2 == 0 else "Space")
                _cursor(p, cell, focused=path == "keyboard")
                p.eq(p.page.locator(HEX + '[aria-pressed="true"]').count(), i + 1,
                     f"C3 {path}: {cell} 선택 반영")
                _live_pick(p, cell, i + 1)
                _map_bounds(p, f"{path} {cell} 선택")
            p.wait_saved(400)
            game = (p.ls(KEY) or {}).get("game", {})
            p.eq(game.get("sel"), list(THREE), f"C3 {path}: 저장 sel의 값과 순서")
            p.expect("cursor" not in game, f"C3 {path}: 화면 커서는 game에 저장하지 않음")
            games[path] = json.dumps(game, ensure_ascii=False, sort_keys=True)
            # 선택 뒤 커서만 바꾸어도 game 전체가 그대로여야 한다.
            if path == "pad":
                _move_to(p, "6-7", ids, pad=True)
            else:
                if path == "mouse":
                    _tab_into_map(p, THREE[-1])
                _move_to(p, "6-7", ids)
            p.wait_saved(400)
            p.eq((p.ls(KEY) or {}).get("game"), game, f"C3 {path}: 커서 이동은 저장 game을 바꾸지 않음")
            scene_counts(p, _counts(THREE), f"C3 {path} 3칸")
    c.eq(set(games), {"mouse", "keyboard", "pad"}, "C3 세 경로의 저장 JSON 수집")
    c.eq(games.get("keyboard"), games.get("mouse"), "C3 키보드/마우스 game 전체 JSON 동일")
    c.eq(games.get("pad"), games.get("mouse"), "C3 390px 패드/마우스 game 전체 JSON 동일")


def t_C4_live_and_names(c: Ctx):
    ids = _map_open(c)
    panel = c.page.locator("#map").locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' panel ')][1]")
    c.eq(panel.locator("[aria-live]").count(), 1, "C4 명세 8: 지도 패널 안 live 영역 하나")
    c.eq(panel.locator('[aria-live="polite"]').count(), 1, "C4 명세 8: polite 알림")
    c.eq(panel.locator("#map24-live").count(), 1, "C4 알림 영역이 지도 패널에 속함")
    for selector in ("#map24-live", "#map24-help"):
        hidden = c.page.locator(selector).evaluate("""el => {
          const s = getComputedStyle(el), r = el.getBoundingClientRect();
          return !el.hidden && el.getAttribute('aria-hidden') !== 'true' && s.display !== 'none' &&
            s.visibility === 'visible' && (r.width <= 1 && r.height <= 1) && s.overflow === 'hidden';
        }""")
        c.expect(hidden, f"C4 명세 8: {selector}는 시각적으로 숨기되 낭독기에 노출")
    described = c.page.locator('#map [role="group"]').get_attribute("aria-describedby") or ""
    refs = described.split()
    c.expect(bool(refs), "C4 명세 8: 지도 그룹 aria-describedby 연결")
    descriptions = []
    for ref in refs:
        node = c.page.locator('[id=' + json.dumps(ref) + ']')
        c.eq(node.count(), 1, f"C4 설명 참조 {ref} 유효")
        if node.count() == 1:
            descriptions.append(node.text_content())
    c.eq(" ".join(descriptions), MAP_HELP, "C4 문구 6: 연결된 키보드 설명 원문")
    for cell in sorted(ids):
        row, col = map(int, cell.split("-"))
        allowed = {f"{row + 1}번째 줄 {col + 1}번째 칸, {terrain} {k}K" for terrain, k in TERRAIN_K.items()}
        c.expect(c.page.locator(f'{HEX}[data-hex="{cell}"]').get_attribute("aria-label") in allowed,
                 f"C4 문구 5: {cell} 실제 좌표와 지형/K 표의 조합")
    for cell in CELL_TERRAIN:
        c.eq(c.page.locator(f'{HEX}[data-hex="{cell}"]').get_attribute("aria-label"),
             _cell_name(cell), f"C4 문구 5: {cell} 좌표·독립 지형·K 이름")
    if not _tab_into_map(c, "6-7"):
        return
    c.page.keyboard.press("ArrowRight")  # even-q(홀수 열)의 NE: (r-1, c+1)
    _cursor(c, "5-8", focused=True)
    _live_cursor(c, "5-8")
    c.page.keyboard.press("Enter")
    _cursor(c, "5-8", focused=True)
    _live_pick(c, "5-8", 1)
    c.eq(c.page.locator(f'{HEX}[data-hex="5-8"]').get_attribute("aria-pressed"), "true", "C4 선택 상태 전달")
    c.page.keyboard.press("Space")
    _cursor(c, "5-8", focused=True)
    _live_pick(c, "5-8", 0, removed=True)
    c.eq(c.page.locator(f'{HEX}[data-hex="5-8"]').get_attribute("aria-pressed"), "false", "C4 해제 상태 전달")
    c.page.keyboard.press("Shift+ArrowLeft")
    _live_cursor(c, "6-7")
    c.page.keyboard.press("Enter")
    _live_pick(c, "6-7", 1)
    c.page.keyboard.press("ArrowRight")
    _live_cursor(c, "5-8")
    c.page.keyboard.press("Enter")
    _live_pick(c, "5-8", 2)
    c.page.keyboard.press("Shift+ArrowLeft")
    _cursor(c, "6-7", focused=True)
    _live_cursor(c, "6-7", selected=True)
    scene_counts(c, _counts(("6-7", "5-8")), "C4 고르기·빼기 뒤")


def t_C5_pad_mobile(c: Ctx):
    if not c.cfg.mobile:
        return
    c.eq((c.cfg.width, c.cfg.height), (390, 844), "C5 모바일 뷰포트 390×844")
    ids = _map_open(c)
    pad = c.page.locator(".map24-pad")
    c.expect(pad.is_visible(), "C5 명세 5: 모바일 방향 패드 표시")
    c.eq(pad.locator("[data-map24-dir]").count(), 6, "C5 방향 단추 6개")
    c.eq(pad.locator("button").count(), 7, "C5 방향 여섯 개와 큰 고르기 단추")
    for direction, (_, arrow, name) in DIRECTIONS.items():
        button = pad.locator(f'[data-map24-dir="{direction}"]')
        c.eq(button.get_attribute("aria-label"), f"커서를 {name} 칸으로", f"C5 문구 1: {direction}")
        c.eq(button.inner_text(), arrow, f"C5 방향 기호 {direction}")
    for item in pad.locator("button").evaluate_all("els => els.map(el => { const r=el.getBoundingClientRect(); return {name:el.getAttribute('aria-label') || el.textContent, w:r.width, h:r.height}; })"):
        c.expect(item["w"] >= 44 and item["h"] >= 44, f"C5 명세 5: {item['name']} {item['w']}×{item['h']} ≥44×44")
    c.expect(c.page.locator(".map24-pad-hint").is_visible(), "C5 패드 안내 표시")
    c.eq(c.page.locator(".map24-pad-hint").inner_text(), PAD_HINT, "C5 문구 7: 패드 안내 원문")
    containment = c.page.locator(HEX).evaluate_all("""els => {
      const p = document.querySelector('#map').closest('.panel'), r = p.getBoundingClientRect();
      const left = r.left + p.clientLeft, right = left + p.clientWidth;
      const top = r.top + p.clientTop, bottom = top + p.clientHeight;
      return els.filter(el => { const b=el.getBoundingClientRect();
        return b.width <= 0 || b.height <= 0 || b.left < left || b.right > right || b.top < top || b.bottom > bottom;
      }).map(el => el.dataset.hex);
    }""")
    c.eq(containment, [], "C5 명세 6: 133칸 모두 지도 패널 안에 표시")
    c.eq(c.page.locator("#pick24").inner_text(), _pick_name("6-7"), "C5 문구 2: 초기 큰 단추")
    for direction in DIRECTIONS:
        dest = _neighbor("6-7", direction, ids)
        c.expect(dest is not None, f"C5 가운데 {direction} 이웃 존재")
        c.page.locator(f'[data-map24-dir="{direction}"]').click()
        _cursor(c, dest)
        c.page.locator(f'[data-map24-dir="{OPPOSITE[direction]}"]').click()
        _cursor(c, "6-7")
    c.page.locator(f'{HEX}[data-hex="5-8"]').click()
    _cursor(c, "5-8")
    _live_pick(c, "5-8", 1)
    c.eq(c.page.locator("#pick24").inner_text(), _pick_name("5-8", True), "C5 직접 칸 클릭 뒤 빼기 단추")
    c.page.locator("#pick24").click()
    _live_pick(c, "5-8", 0, removed=True)
    c.eq(c.page.locator("#pick24").inner_text(), _pick_name("5-8"), "C5 큰 단추로 제거 뒤 고르기 문구")
    c.page.locator("#pick24").click()
    _live_pick(c, "5-8", 1)
    c.page.locator("#showK").check()
    c.eq({v["id"]: v["text"] for v in _map_texts(c)}.get("5-8"), "숲4", "C5 명세 7: 채굴가능량 켬 숲4")
    c.page.locator("#showK").uncheck()
    c.eq({v["id"]: v["text"] for v in _map_texts(c)}.get("5-8"), "숲", "C5 명세 7: 채굴가능량 끔 숲")
    _move_to(c, "0-4", ids, pad=True)
    for direction in DIRECTIONS:
        c.eq(c.page.locator(f'[data-map24-dir="{direction}"]').is_disabled(),
             _neighbor("0-4", direction, ids) is None, f"C5 명세 3·5: 끝 칸 {direction} 이웃 없을 때만 disabled")
    c.expect(c.page.locator('[data-map24-dir="N"]').is_disabled(), "C5 위 끝 방향 단추 disabled")
    scene_counts(c, _counts(("5-8",)), "C5 패드와 직접 클릭 뒤")


def t_C6_desktop_unchanged(c: Ctx):
    if c.cfg.mobile:
        return
    c.eq((c.cfg.width, c.cfg.height), (1280, 900), "C6 데스크톱 뷰포트 1280×900")
    _map_open(c)
    for selector in (".map24-pad", ".map24-pad-hint"):
        node = c.page.locator(selector)
        c.eq(node.count(), 1, f"C6 {selector} DOM 유지")
        c.expect(node.evaluate("el => !el.hidden && getComputedStyle(el).display === 'none'"),
                 f"C6 명세 5: {selector} hidden 속성 없이 CSS display:none")
    c.expect(c.page.locator("#map .map24-cursor").is_hidden(), "C6 명세 2: 최초 점선 커서 숨김")
    c.page.locator(f'{HEX}[data-hex="6-7"]').click()
    _cursor(c, "6-7")
    c.expect(c.page.locator("#map .map24-cursor").is_hidden(), "C6 명세 2: 마우스 클릭 뒤 점선 커서 숨김")
    dimensions = c.page.locator(HEX).evaluate_all("els => els.map(el => { const r=el.getBoundingClientRect(); return {id:el.dataset.hex, w:r.width, h:r.height}; })")
    wrong = [v for v in dimensions if not (54 <= v["w"] <= 56 and 47 <= v["h"] <= 48)]
    c.eq(wrong, [], "C6 명세 6: 133칸 크기 54~56×47~48px 유지")
    c.page.locator("#showK").check()
    texts = _map_texts(c)
    c.eq(len(texts), 133, "C6 칸 글자 대상 133개")
    c.expect(all(re.fullmatch(r"(?:18|10|6|5|4|3)", v["text"]) for v in texts), "C6 명세 7: 켬이면 숫자만 표시")
    c.eq({v["id"]: v["text"] for v in texts}.get("5-8"), "4", "C6 숲의 채굴량 숫자 4")
    c.page.locator("#showK").uncheck()
    c.expect(all(v["text"] == "" for v in _map_texts(c)), "C6 명세 7: 끔이면 칸 글자 없음")
    if _tab_into_map(c, "6-7"):
        cursor = c.page.locator("#map .map24-cursor")
        c.expect(cursor.is_visible(), "C6 명세 2: 키보드로 지도 진입 시 커서 표시")
        c.expect(cursor.evaluate("el => getComputedStyle(el).strokeDasharray !== 'none'"), "C6 명세 2: 커서 테두리는 점선")
        c.page.keyboard.press("Tab")
        c.expect(cursor.is_hidden(), "C6 키보드 초점이 지도 밖으로 나가면 점선 숨김")
    scene_counts(c, _counts(("6-7",)), "C6 마우스 고르기 뒤")


if __name__ == "__main__":
    main(globals(), strict_errors=True)
