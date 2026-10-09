"""ECON-UI U5 독립 수용 검사. 기대값은 docs/ECON-UI.md U5에서만 온다.

실행: tests/.venv/bin/python tests/league/peek.py http://127.0.0.1:9430/index.html
브라우저 실행은 총괄 담당. econui.py/solo.py와 구현 파일은 수정하지 않는다.
진행자+팀 탭은 local 연결, 경제 모드는 6팀/12달, 계절 모드도 별도 검사한다.
fixture만 공개 규칙/계획 API로 만들고 U5 이동은 실제 버튼으로 수행한다.
도시 표지에는 미지정 CSS 선택자 대신 도시 이름과 접근 가능한 버튼을 쓴다.
"""

import re
import sys

from playwright.sync_api import sync_playwright

from econui import (BOOT_JS, Checks, HOST_JS, SYNC_JS, context_for,
                    diagnostics, local_address, monitored_page, open_panel,
                    overflow, screenshot, shown)

IDS = ("pyeongtaek", "hwaseong", "anseong", "dangjin", "asan", "cheonan")

SEED_JS = """([ids, turns]) => {
  const C = KCP.leagueCore, room = turns ? 'PKU55' : 'PKS55', now = Date.now();
  const S = C.newState(room, 'south', now, ids, turns ? {turns} : null);
  ids.slice(1).forEach(team => C.reduce(S,
    {type:'claim', team, token:'peek-fixture-' + team}, now, KCP.buildGame));
  const net = {kind:'local'};
  localStorage.setItem('kcp-league-net-v1', JSON.stringify(net));
  localStorage.setItem('kcp-league-host-v1', JSON.stringify({room, net, state:S}));
  return {room, team:ids[0]};
}"""

# send() 자체나 UI의 비공개 변수를 바꾸지 않는다. 실제 local 전송을 관찰한다.
# phase:'plan'인 스냅을 요청으로 세지 않으며 중첩 envelope/JSON도 처리한다.
WIRE_JS = r"""(() => {
  window.__peekWire = {sent:0, plans:0};
  const containsPlan = (x, depth=0) => {
    if (depth > 8 || x == null) return false;
    if (typeof x === 'string') {
      if (!/^[\[{]/.test(x.trim())) return false;
      try { return containsPlan(JSON.parse(x), depth+1); } catch (_) { return false; }
    }
    if (typeof x !== 'object') return false;
    const keys = ['type', 'kind', 't', 'action', 'op', 'cmd', 'event', 'request'];
    if (keys.some(k => x[k] === 'plan')) return true;
    return Object.values(x).some(v => containsPlan(v, depth+1));
  };
  const original = BroadcastChannel.prototype.postMessage;
  BroadcastChannel.prototype.postMessage = function(message) {
    window.__peekWire.sent++;
    if (containsPlan(message)) window.__peekWire.plans++;
    return original.call(this, message);
  };
})();"""

STATE_JS = """() => {
  const L = KCP.league.state(), S = L && (L.S || L.snap);
  if (!S || !S.teams) throw new Error('리그 공개 상태 없음');
  const ids = S.active || Object.keys(S.teams);
  return {team:L.team, round:S.round, phase:S.phase, rev:S.rev, ids,
    econ:!!S.econ, rounds:Array.isArray(S.rounds) ? S.rounds.length : Number(S.rounds || 0),
    counts:Object.fromEntries(ids.map(id => [id,
      ((S.teams[id].plan || {}).builds || []).length])),
    names:Object.fromEntries(ids.map(id => [id, KCP.ECON_DATA.start[id].name]))};
}"""
MAP_JS = "() => KCP.buildGame.current().builds.length"
WIRE_READ_JS = "() => ({...window.__peekWire})"
PLAN_JS = """() => {
  const BG = KCP.buildGame;
  const tile = BG.TILES.find(t => !t.out && t.site < 0 && !BG.siteRule('solar', t));
  if (!tile) throw new Error('fixture 태양광을 놓을 유효 칸 없음');
  return KCP.league.plan(st => {st.builds = [{t:'solar', i:tile.i}];});
}"""
PLAN_READY_JS = """id => {
  const L = KCP.league.state(), S = L && (L.S || L.snap);
  return !!S && !!S.teams[id].plan && S.teams[id].plan.builds.length === 1;
}"""

DRAWER_JS = """() => {
  const visible = n => !!n && !!n.getClientRects().length && !n.hidden &&
    getComputedStyle(n).visibility !== 'hidden';
  const panel = document.querySelector('#lg-panel');
  const root = document.querySelector('#bd-root');
  return {open:visible(panel),
    // ECON-UI v1.2: 서랍 선택 상태는 탐색을 맡는 막대 버튼에서 수집한다.
    buttons:[...document.querySelectorAll('#lg-bar [data-panel]')]
      .filter(n => n.dataset.panel !== 'region')
      .map(n => [n.dataset.panel, n.getAttribute('aria-expanded'),
        n.getAttribute('aria-current'), n.className]),
    mode:root?.dataset.mode,
    groups:[...root.querySelectorAll('[data-group]')]
      .map(n => [n.dataset.group, n.dataset.active || null]),
    tools:[...root.querySelectorAll('[data-tool]')].filter(visible)
      .map(n => [n.dataset.tool, n.getAttribute('aria-pressed'), n.className])};
}"""
FULLSCREEN_JS = """() => {
  const n = document.querySelector('#lg-region');
  if (!n || n.closest('#lg-panel')) return false;
  const r = n.getBoundingClientRect();
  const width = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
  const height = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
  return width >= innerWidth * .9 && height >= innerHeight * .9;
}"""

# 각 도시의 요약 영역을 찾는다. 명세에 없는 data-* 계약을 추가하지 않는다.
SUMMARY_JS = r"""([names, economic]) => {
  const root = document.querySelector('#lg-region');
  if (!root) return [];
  const nodes = [...root.querySelectorAll('*')];
  return Object.entries(names).map(([id, name]) => {
    const candidates = nodes.filter(n => {
      if (!n.getClientRects().length || getComputedStyle(n).visibility === 'hidden') return false;
      const text = n.innerText || '';
      return text.includes(name) && Object.values(names).filter(s => text.includes(s)).length === 1 &&
        /설비/.test(text) && /\d/.test(text);
    }).sort((a,b) => a.innerText.length - b.innerText.length);
    // 제목+설비만 담은 작은 자식보다 지표 전체를 담은 요약을 먼저 선택한다.
    const complete = economic ? candidates.filter(n =>
      ['정전', '지지', '주민'].every(word => n.innerText.includes(word))) : candidates;
    const selected = complete.length ? complete[0] : candidates[0];
    const leaves = complete.filter(n => !complete.some(m => m !== n && n.contains(m)));
    const text = selected ? selected.innerText : '';
    const m = text.match(/설비\s*(?:수\s*)?[:：]?\s*([\d,]+)/) ||
      text.match(/([\d,]+)\s*(?:기|개)\s*(?:의\s*)?설비/);
    return {id, text, summaries:leaves.length,
      count:m ? Number(m[1].replace(/,/g,'')) : null};
  });
}"""
INACTIVE_JS = """nodes => nodes.every(n => {
  for (let p = n; p; p = p.parentElement) {
    const style = getComputedStyle(p);
    if (p.hidden || p.inert || style.display === 'none' || style.visibility === 'hidden') return true;
  }
  return n.matches(':disabled') || n.getAttribute('aria-disabled') === 'true';
})"""
MAP_POINT_JS = """() => {
  const BG = KCP.buildGame;
  const t = BG.TILES.find(t => !t.out && t.site < 0 && !BG.siteRule('solar', t));
  const point = t ? BG.tileXY(t.c, t.r) : null;
  const target = point && document.elementFromPoint(point[0], point[1]);
  return target && target.closest('canvas') ? point : null;
}"""
SOLO_READY_JS = """() => {
  const L = KCP.league.state(), S = L && (L.S || L.snap);
  return !!S && !!S.teams && !!L.team && S.phase === 'plan';
}"""


def state(page):
    return page.evaluate(STATE_JS)


def own_count(host, team, tid):
    if host is not None:
        plan = host.evaluate(HOST_JS)["teams"][tid].get("plan") or {}
        return len(plan.get("builds") or [])
    return state(team)["counts"][tid]


def setup_pair(context, base, turns, pages):
    host, events = monitored_page(context)
    pages.append((host, events, "host"))
    host.on("dialog", lambda dialog: dialog.accept())
    host.goto(base + "#home")
    host.wait_for_function(BOOT_JS)
    fixture = host.evaluate(SEED_JS, [list(IDS), turns])
    host.goto(base + "#league/host")
    host.wait_for_selector("#lg-roomcode")
    fixture["room"] = host.inner_text("#lg-roomcode").replace("-", "").strip()
    team, events = monitored_page(context)
    pages.append((team, events, "team"))
    team.goto(base + "#league")
    team.fill("#lg-code", fixture["room"])
    team.click("#lg-join")
    team.click(f'[data-seat="{fixture["team"]}"]:not([disabled])')
    team.wait_for_selector("#lg-bar")
    host.click("#lg-next")
    for page in (host, team):
        page.wait_for_function(SYNC_JS, arg=[1, "plan"])
    return host, team


def setup_solo(context, base, pages):
    page, events = monitored_page(context)
    pages.append((page, events, "solo"))
    page.goto(base + "#league")
    page.wait_for_selector("#lg-solo")
    card = page.locator("#lg-solo")
    length = card.locator('[data-turns="12"]')
    if not length.count():
        length = card.get_by_role("button", name=re.compile(r"^12\s*달"))
    if length.count() and length.first.is_visible():
        length.first.click()
    if card.evaluate("el => ['BUTTON', 'A'].includes(el.tagName)"):
        card.click()
    else:
        card.get_by_role("button", name=re.compile(r"시작|혼자 하기")).first.click()
    page.wait_for_url(re.compile(r".*#league/solo$"))
    page.wait_for_function(SOLO_READY_JS)
    page.wait_for_selector("#lg-bar")
    return None, page


def city_button(page, name, names):
    """U5의 키보드 도시 버튼 목록도 확인한다. 캔버스 좌표에는 의존하지 않는다."""
    buttons = page.locator("#lg-region").get_by_role("button", name=re.compile(re.escape(name)))
    for i in range(buttons.count()):
        button = buttons.nth(i)
        text = button.inner_text() + " " + (button.get_attribute("aria-label") or "")
        if (button.is_visible() and button.is_enabled() and
                sum(city in text for city in names.values()) == 1):
            return button
    raise AssertionError(f"{name}: 접근 가능한 도시 선택 버튼 없음")


def capture(checks, page, label, stage):
    overflow(checks, page, f"{label} {stage}")
    screenshot(checks, page, f"peek-{label}-{stage}.png")


def region(checks, page, observation, label):
    checks.test(f"{label} U5 #lg-region 표시", lambda: shown(page, "#lg-region"))
    checks.test(f"{label} U5 #lg-regionmap 표시", lambda: shown(page, "#lg-regionmap"))
    checks.test(f"{label} U5 지역 보기가 화면 전체를 차지", lambda: page.evaluate(FULLSCREEN_JS))
    checks.test(f"{label} U5 #lg-region-back 버튼", lambda: shown(page, "#lg-region-back"))
    summaries = page.evaluate(SUMMARY_JS, [observation["names"], observation["econ"]])
    present = sum(item["summaries"] for item in summaries)
    checks.ok(present == len(observation["ids"]) and all(item["summaries"] == 1 for item in summaries),
              f"{label} U5 도시 요약 {len(observation['ids'])}개(활성 팀 수): {present}")
    for item in summaries:
        checks.ok(item["count"] == observation["counts"][item["id"]],
                  f"{label} U5 {observation['names'][item['id']]} 요약 설비 수 = 공개 계획")
        if observation["econ"]:
            checks.ok(all(word in item["text"] for word in ("정전", "지지", "주민")),
                      f"{label} U5 {observation['names'][item['id']]} 정전·지지율·주민 요약")
        checks.test(f"{label} U5 {observation['names'][item['id']]} 도시 선택 버튼", lambda item=item:
                    city_button(page, observation["names"][item["id"]], observation["names"]) is not None)
    capture(checks, page, label, "region")


def peek(checks, page, observation, other, label):
    city_button(page, observation["names"][other], observation["names"]).click()
    page.wait_for_selector("#lg-peek")
    checks.test(f"{label} U5 관전 중·읽기 전용·대상 도시 표시", lambda:
                all(word in page.locator("#lg-peek").inner_text() for word in
                    ("관전 중", "읽기 전용", observation["names"][other])))
    checks.test(f"{label} U5 건설·철거 도구 비활성/숨김", lambda:
                page.locator('[data-tool]').evaluate_all(INACTIVE_JS))
    checks.test(f"{label} U5 준비 버튼 존재·비활성", lambda:
                page.locator("#lg-ready").count() == 1 and page.locator("#lg-ready").is_disabled())
    checks.test(f"{label} U5 서랍 정책 편집 비활성/숨김", lambda:
                page.locator('[data-pol], #lg-econpol input, #lg-econpol button').evaluate_all(INACTIVE_JS))
    for selector in ("#lg-peek-region", "#lg-peek-back"):
        checks.test(f"{label} U5 {selector} 표시·활성", lambda selector=selector:
                    shown(page, selector) and page.locator(selector).is_enabled())
    # 실제 지도 클릭도 계획을 바꾸지 않아야 한다.
    point = page.evaluate(MAP_POINT_JS)
    if point:
        viewport = page.viewport_size
        width, height = viewport["width"], viewport["height"]
        if 0 <= point[0] < width and 0 <= point[1] < height:
            page.mouse.click(*point)
    capture(checks, page, label, "peek")


def returned(checks, page, host, tid, count, drawer, label, route):
    page.wait_for_timeout(600)  # 지연 계획 저장도 관찰한다.
    checks.test(f"{label} U5 {route} → 우리 지도 설비 수 그대로", lambda:
                page.evaluate(MAP_JS) == count)
    checks.test(f"{label} U5 {route} → 우리 plan 설비 수 그대로", lambda:
                own_count(host, page, tid) == count)
    checks.test(f"{label} U5 {route} → 서랍·선택 도구 그대로", lambda:
                page.evaluate(DRAWER_JS) == drawer)
    checks.test(f"{label} U5 {route} → 지역·관전 화면 닫힘", lambda:
                not shown(page, "#lg-region") and not shown(page, "#lg-peek"))
    checks.test(f"{label} U5 {route} → 준비 버튼 활성 복원", lambda:
                shown(page, "#lg-ready") and page.locator("#lg-ready").is_enabled())
    capture(checks, page, label, route)


def scenario(checks, context, base, label, mode, pages):
    host, team = (setup_solo(context, base, pages) if mode == "solo" else
                  setup_pair(context, base, 12 if mode == "econ" else 0, pages))
    initial = state(team)
    tid = initial["team"]
    checks.ok(tid in initial["ids"], f"{label} U5 우리 도시 식별")
    if mode != "solo":
        checks.ok(set(initial["ids"]) == set(IDS), f"{label} U5 활성 도시 정확히 6개")
    checks.ok(initial["econ"] == (mode != "season"), f"{label} U5 경제/계절 fixture")
    checks.ok([n.get_attribute('data-run') for n in team.locator('[data-run]:visible').all()] ==
              (['7', '30', '90'] if mode == 'solo' else ['7']),
              f'{label} E C10 멀티 1주·혼자 하기 세 기간')
    if mode != "season":
        checks.ok(initial["rounds"] == 12, f"{label} U5 경제 모드 12달")
        checks.ok(not shown(team, "#lg-panel"), f"{label} U1 첫 지도는 일지 서랍 닫힘")
        guide = team.locator('#lg-guide-close')
        if guide.count():
            checks.ok(guide.evaluate('el => el === document.activeElement'), f'{label} U2 첫 안내 닫기에 바로 포커스')
            team.evaluate('document.activeElement.blur()')
            team.keyboard.press('Escape')
            checks.ok(team.locator('#lg-first-guide').count() == 0, f'{label} U2 지도 밖 포커스에서도 안내 Escape 닫기')
        team.locator('[data-run="7"]').click()
        team.wait_for_selector('#bd-skip')
        team.wait_for_function("() => !!document.querySelector('#bd-run-tip')?.textContent")
        tip = team.locator('#bd-run-tip').inner_text()
        checks.ok(all(int(m) == 1 for m in re.findall(r'(\d+)월', tip)), f'{label} U7 1월 시험 TIP의 다른 계절 문구 없음')
        team.locator('#bd-skip').click()
        checks.ok(not shown(team, "#lg-panel") and
                  team.evaluate("document.documentElement.classList.contains('bd-drawer-open')"),
                  f"{label} U2 첫 시험 성적표 유지·리그 일지 닫힘")
        team.locator('#bd-drawer-x').click()
        checks.ok(not shown(team, "#lg-panel"), f"{label} 도구 선택 전 일지 서랍 닫힘")
    checks.ok(team.locator('[data-lens="result"]').count() == 1, f'{label} U2 지도 운영 결과 토글')
    checks.ok(team.locator('[data-lens="grid"]').count() == 1 and team.locator('[data-lens="complaints"]').count() == 1,
              f'{label} U3 두 영향 렌즈')
    checks.ok(team.evaluate(PLAN_JS), f"{label} U5 우리 계획 fixture 설정")
    (host or team).wait_for_function(PLAN_READY_JS, arg=tid)
    team.wait_for_timeout(600)
    if host is not None:
        checks.ok(team.evaluate(WIRE_READ_JS)["plans"] > 0,
                  f"{label} U5 감시기가 실제 plan 전송을 포착(양성 대조)")
    # 편집 도구와 열린 서랍을 복귀 전후 비교할 수 있도록 정한다.
    group = team.locator('#bd-root [data-group="ren"]:visible')
    group.click()
    tool = team.locator('#bd-root [data-tool="solar"]:visible')
    tool.click()
    checks.ok(team.locator('#bd-root').get_attribute('data-mode') == 'solar' and
              group.get_attribute('data-active') == 'true',
              f"{label} U5 비교 기준 태양광 도구·재생 묶음 선택됨")
    open_panel(team, "deal")
    checks.ok(shown(team, "#lg-panel"), f"{label} U5 복귀 비교용 서랍 열림")
    observation = state(team)
    count = own_count(host, team, tid)
    checks.ok(count == 1 and team.evaluate(MAP_JS) == count,
              f"{label} U5 기준 우리 plan·지도 설비 한 개")
    other = next(city for city in observation["ids"] if city != tid and
                 observation["counts"][city] != count)
    drawer = team.evaluate(DRAWER_JS)
    wire_before = team.evaluate(WIRE_READ_JS)["plans"]
    capture(checks, team, label, "own-before")
    checks.test(f"{label} U5 [data-panel=region] 표시·활성", lambda:
                shown(team, '[data-panel="region"]') and
                team.locator('[data-panel="region"]').is_enabled())
    team.click('[data-panel="region"]')
    team.wait_for_selector("#lg-regionmap")
    region(checks, team, observation, label)
    peek(checks, team, observation, other, label)
    team.wait_for_timeout(600)
    checks.test(f"{label} U5 관전 진입·지도 클릭 뒤 우리 plan 설비 수 그대로", lambda:
                own_count(host, team, tid) == count)
    checks.test(f"{label} U5 관전 진입·지도 클릭 뒤 plan 요청 0", lambda:
                team.evaluate(WIRE_READ_JS)["plans"] == wire_before)
    if host is not None:
        # 단계 전환이 실제 수신되었는지도 확인한다. 무변화 스냅으로 대체하지 않는다.
        for round_number, phase in ((1, "review"), (2, "plan")):
            host.click("#lg-next")
            for page in (host, team):
                page.wait_for_function(SYNC_JS, arg=[round_number, phase])
            team.wait_for_timeout(600)
            checks.test(f"{label} U5 {round_number}턴 {phase} 스냅 뒤 관전 유지", lambda:
                        shown(team, "#lg-peek") and observation["names"][other] in
                        team.locator("#lg-peek").inner_text())
            checks.test(f"{label} U5 {phase} 스냅 뒤 진행자 우리 plan 설비 수 그대로", lambda:
                        own_count(host, team, tid) == count)
            checks.test(f"{label} U5 {phase} 스냅 뒤 plan 요청 0", lambda:
                        team.evaluate(WIRE_READ_JS)["plans"] == wire_before)
            checks.test(f"{label} U5 {phase} 스냅 뒤 준비 비활성", lambda:
                        team.locator("#lg-ready").is_disabled())
            capture(checks, team, label, f"peek-{phase}")
        capture(checks, host, label, "host-snap")
    team.click("#lg-peek-region")
    team.wait_for_selector("#lg-regionmap")
    checks.test(f"{label} U5 #lg-peek-region → 지역 지도", lambda:
                shown(team, "#lg-region") and shown(team, "#lg-regionmap") and not shown(team, "#lg-peek"))
    capture(checks, team, label, "peek-region")
    team.click("#lg-region-back")
    returned(checks, team, host, tid, count, drawer, label, "region-back")
    # 관전에서 곧장 우리 도시로 돌아오는 별도 경로.
    team.click('[data-panel="region"]')
    team.wait_for_selector("#lg-regionmap")
    observation = state(team)
    peek(checks, team, observation, other, label + "-direct")
    team.click("#lg-peek-back")
    returned(checks, team, host, tid, count, drawer, label, "peek-back")
    checks.ok([n.get_attribute('data-run') for n in team.locator('[data-run]:visible').all()] ==
              (['7', '30', '90'] if mode == 'solo' else ['7']),
              f'{label} E C10 관전 복귀 뒤 기간 표시 복원')
    # 우리 도시 버튼은 관전 없이 복귀한다. 키보드 Enter로 목록도 검증한다.
    team.click('[data-panel="region"]')
    team.wait_for_selector("#lg-regionmap")
    button = city_button(team, observation["names"][tid], observation["names"])
    button.focus()
    button.press("Enter")
    returned(checks, team, host, tid, count, drawer, label, "own-city")
    checks.test(f"{label} U5 지역·관전·모든 복귀 중 plan 요청 0", lambda:
                team.evaluate(WIRE_READ_JS)["plans"] == wire_before)


def main():
    checks = Checks()
    try:
        base = local_address(sys.argv)
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for width, height in ((1280, 900), (390, 844)):
                for scheme in ("light", "dark"):
                    for mode in ("econ", "solo", "season"):
                        label = f"{mode}-{width}x{height}-{scheme}"
                        context, external = context_for(browser, base, width, height, scheme)
                        context.add_init_script(WIRE_JS)
                        pages = []
                        try:
                            scenario(checks, context, base, label, mode, pages)
                        except Exception as exc:
                            checks.ok(False, f"{label} U5 진행 예외 {type(exc).__name__}: "
                                      f"{str(exc).splitlines()[0][:200]}")
                            for page, _, role in pages:
                                screenshot(checks, page, f"peek-{label}-{role}-failure.png")
                        finally:
                            for page, events, role in pages:
                                overflow(checks, page, f"{label} {role} 마지막 화면")
                                diagnostics(checks, events, f"{label} {role}")
                            checks.ok(not external, f"{label} U5 외부 연결 시도 0: {external}")
                            context.close()
            browser.close()
    except Exception as exc:
        checks.ok(False, f"검사 실행 예외 {type(exc).__name__}: {str(exc).splitlines()[0][:200]}")
    return checks.finish()


if __name__ == "__main__":
    sys.exit(main())
