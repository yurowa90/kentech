"""네 해 자료 탭의 독립 수용 검사. 브라우저 실행은 총괄이 맡는다.

근거: _briefs/lanes/fix2426/tabs/impl.md 명세 1·2 및 검사 작성 지시서.
탭 순서는 화면의 DOM 순서이며, 이동 기대 인덱스는 명세의 순환 규칙으로 계산한다.
앱의 KCP.tabs/sync/paint를 호출하지 않고 evaluate는 DOM·초점 읽기에만 쓴다.
1280/390 × 밝음/어두움과 오류 수집은 기존 harness를 사용한다.
"""

from harness import Ctx
from d76_helpers import tab_to


LIST = '#prep-body [role="tablist"]'
TAB = '[role="tab"]'


def _state(c: Ctx, panel: str, index: int, label: str, *, focused=False):
    """명세 1: 선택·유일한 정지점·양방향 ID 연결을 매 전환 뒤 모두 검사한다."""
    rows = c.page.locator(f"{LIST} {TAB}").evaluate_all("""els => els.map(e => ({
      id: e.id, selected: e.getAttribute('aria-selected'), stop: e.getAttribute('tabindex'),
      controls: e.getAttribute('aria-controls'), focused: e === document.activeElement,
      unique: !!e.id && [...document.querySelectorAll('[id]')].filter(n => n.id === e.id).length === 1
    }))""")
    c.eq([i for i, row in enumerate(rows) if row["selected"] == "true"], [index],
         f"T1 {label}: 기대 탭 하나만 aria-selected=true")
    c.eq([i for i, row in enumerate(rows) if row["stop"] == "0"], [index],
         f"T1 {label}: 선택 탭만 tabindex=0, 정지점 정확히 하나")
    c.eq([row["stop"] for i, row in enumerate(rows) if i != index],
         ["-1"] * (len(rows) - 1), f"T1 {label}: 나머지 모든 탭 tabindex=-1")
    c.expect(all(row["selected"] == "false" for i, row in enumerate(rows) if i != index),
             f"T1 {label}: 비선택 탭 aria-selected=false")
    c.expect(all(row["unique"] for row in rows), f"T1 {label}: 모든 탭 id 존재·문서 안 고유")
    target = c.page.locator(panel)
    panel_id = target.get_attribute("id")
    c.expect(bool(panel_id), f"T1 {label}: 실제 패널 id 존재")
    c.eq(target.get_attribute("role"), "tabpanel", f"T1 {label}: 패널 role=tabpanel")
    c.eq([row["controls"] for row in rows], [panel_id] * len(rows),
         f"T1 {label}: 모든 aria-controls는 이 해의 실제 패널 id")
    c.expect(target.evaluate("""e => !!e.id && document.getElementById(e.id) === e &&
      [...document.querySelectorAll('[id]')].filter(n => n.id === e.id).length === 1"""),
             f"T1 {label}: controls가 참조하는 패널 id도 고유")
    c.eq(target.get_attribute("aria-labelledby"), rows[index]["id"],
         f"T1 {label}: 패널 aria-labelledby는 기대 선택 탭 id")
    if focused:
        c.eq([i for i, row in enumerate(rows) if row["focused"]], [index],
             f"T1 {label}: 실제 키보드 초점이 기대 선택 탭")
    c.check(f"T1 {label}")


def _tab_out_and_back(c: Ctx, index: int, label: str):
    # 명세 1의 한 정지점·다른 키 미차단: Tab 한 번에 다음 외부 조작으로 나간다.
    # 기대 요소는 누르기 전에 DOM에서 읽으며, 다른 자료 탭은 후보에서 제외한다.
    next_stop = c.page.locator(LIST).evaluate_handle("""list =>
      [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex],[contenteditable]')]
        .find(e => !list.contains(e) && e.tabIndex >= 0 && !e.matches(':disabled') &&
          !e.closest('[inert]') && e.getClientRects().length &&
          !['hidden', 'collapse'].includes(getComputedStyle(e).visibility) &&
          !!(list.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)) || null
    """)
    try:
        c.expect(next_stop.evaluate("e => e !== null"), f"T1 {label}: 묶음 다음 Tab 조작 존재")
        c.page.keyboard.press("Tab")
        c.expect(c.page.locator(LIST).evaluate("e => !e.contains(document.activeElement)"),
                 f"T1 {label}: Tab 한 번으로 묶음 밖, 다른 자료 탭에 머물지 않음")
        c.expect(next_stop.evaluate("e => e !== null && e === document.activeElement"),
                 f"T1 {label}: 패널 안 첫 조작 또는 바로 다음 외부 조작에 초점")
        c.check(f"T1 {label}: Tab 이탈")
        c.page.keyboard.press("Shift+Tab")
        c.expect(c.page.locator(f"{LIST} {TAB}").nth(index).evaluate("e => e === document.activeElement"),
                 f"T1 {label}: Shift+Tab 재진입도 선택 탭")
    finally:
        next_stop.dispose()


def tabs_a11y(c: Ctx, year: str, panel: str, field: str, value_attr: str):
    c.goto(f"#y{year}", wait=panel)
    if not c.eq(c.page.locator(LIST).count(), 1, f"T1 {year}: 자료 tablist 하나"):
        return
    tabs = c.page.locator(f"{LIST} {TAB}")
    count = tabs.count()
    if not c.expect(count >= 2, f"T1 {year}: 서로 전환할 자료 탭 둘 이상"):
        return
    # 선택 결과에서 다음 기대값을 만들지 않는다. 조작 전에 읽은 탭 순서·저장 키만 사용.
    values = tabs.evaluate_all("(els, attr) => els.map(e => e.getAttribute(attr))", value_attr)
    c.expect(all(values) and len(set(values)) == count, f"T1 {year}: 탭별 저장 선택 키 고유")
    selected = tabs.evaluate_all("els => els.flatMap((e,i) => e.getAttribute('aria-selected') === 'true' ? [i] : [])")
    if not c.eq(len(selected), 1, f"T1 {year}: 최초 선택 탭 하나"):
        return
    index = selected[0]
    _state(c, panel, index, f"{year} 최초")
    if not tab_to(c, f'{LIST} {TAB}[aria-selected="true"]'):
        return
    _state(c, panel, index, f"{year} 실제 Tab 진입", focused=True)

    def activate(target_index, label, *, key=None):
        nonlocal index
        before = c.page.locator(panel).inner_text().strip()
        changed = target_index != index
        if key is None:
            tabs.nth(target_index).click()  # 실제 포인터 입력, JS click() 아님.
        else:
            c.page.keyboard.press(key)  # locator.press/focus로 초점을 대신 잡지 않는다.
        _state(c, panel, target_index, label, focused=key is not None)
        after = c.page.locator(panel).inner_text().strip()
        c.expect(bool(after), f"T1 {label}: 실제 패널 글자 존재")
        if changed:
            c.expect(after != before, f"T1 {label}: 선택만 바뀌지 않고 패널 글자도 전환")
        # tests.md: 250ms 지연 저장을 400ms 뒤 확인. flush/저장값 주입 없음.
        c.wait_saved(400)
        c.eq((c.ls(f"kcp:v1:{year}") or {}).get("game", {}).get(field), values[target_index],
             f"T1 {label}: 400ms 뒤 G.{field} 저장")
        index = target_index

    # 명세 1: 자동 활성화, 양방향 끝 순환, Home/End. 첫 탭부터 모든 자료를 순회한다.
    activate(0, f"{year} Home 시작", key="Home")
    for step in range(1, count + 1):
        activate(step % count, f"{year} → {step}회(끝→처음 포함)", key="ArrowRight")
    for step in range(1, count + 1):
        activate((-step) % count, f"{year} ← {step}회(처음→끝 포함)", key="ArrowLeft")
    activate(count - 1, f"{year} End", key="End")
    activate(0, f"{year} Home 복귀", key="Home")
    _tab_out_and_back(c, index, f"{year} 첫 탭")

    # 명세 1: 기존 마우스 처리 뒤에도 roving tabindex·패널 이름이 따라와야 한다.
    activate(1, f"{year} 마우스로 비첫 탭 선택")
    text = c.page.locator(panel).inner_text().strip()
    # 명세 2의 기존 저장 계약: 비첫 선택 복원도 동일한 접근성 연결을 가져야 한다.
    c.page.reload()
    c.page.wait_for_selector(panel)
    _state(c, panel, index, f"{year} 비첫 선택 새로고침")
    c.eq(c.page.locator(panel).inner_text().strip(), text, f"T1 {year}: 새로고침 뒤 같은 패널 내용")
    if tab_to(c, f'{LIST} {TAB}[aria-selected="true"]'):
        _state(c, panel, index, f"{year} 비첫 탭 Tab 진입", focused=True)
        _tab_out_and_back(c, index, f"{year} 비첫 탭")
    c.wait_saved(400)
    c.check(f"T1 {year}: 최종")
    # 2022/2023의 기존 main은 폰트 콘솔을 넓게 제외하므로 이 새 검사에서는
    # tests.md·검사 지시서의 콘솔 error/warning·pageerror 0을 직접 단언한다.
    for bucket in ("console", "pageerrors"):
        c.eq([item for item in c.rec[bucket] if item["test"] == c.test], [],
             f"T1 {year}: {bucket} 0")
