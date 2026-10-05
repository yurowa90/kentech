"""ECON-UI 수용 검사. 실행: python3 tests/league/econui.py <로컬 주소>.

구현과 독립된 기대값은 docs/ECON-UI.md U1/U2/U4·수용 기준에서 온다.
calib.py는 실행/import하지 않고 AUTO 문자열만 읽는다(그 파일의 브라우저 실행 방지).
브라우저 실행은 총괄 담당. solo.py도 이 파일의 공통 검사 도구를 사용한다.
"""

import ast
import json
import math
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

RESULTS = Path(__file__).resolve().parents[1] / "results"
SCORES = {"pop": "주민", "ind": "산업", "fin": "재정", "co2": "탄소",
          "appr": "지지", "rel": "전력 신뢰"}
POLICIES = ("taxRes", "taxInd", "service", "incentive")
WAIT = 12000  # 실행기 대기 한도. 경제 모형 계수가 아니다.

BOOT_JS = "() => !!(window.KCP && KCP.leagueCore && KCP.league && KCP.buildGame)"
HIDDEN_JS = r"""el => {
  for (let n = el; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (n.hidden || s.display === 'none' || s.visibility === 'hidden' ||
        s.visibility === 'collapse') return true;
  }
  return false;
}"""
OVERFLOW_JS = """() => Math.max(document.documentElement.scrollWidth,
  document.body.scrollWidth) - document.documentElement.clientWidth"""
HOST_JS = "() => KCP.league.state().S"
SYNC_JS = """([round, phase]) => {
  const L = KCP.league.state(), V = L && (L.S || L.snap);
  return !!V && V.round === round && V.phase === phase;
}"""
SEED_JS = """turns => {
  const C = KCP.leagueCore, ids = ['pyeongtaek', 'dangjin'];
  const room = turns ? 'ECNF22' : 'SEAS22', now = Date.now();
  const S = C.newState(room, 'south', now, ids, turns ? {turns} : null);
  C.reduce(S, {type:'claim', team:ids[1], token:'fixture-computer'}, now, KCP.buildGame);
  if (turns) C.reduce(S, {type:'econ', team:ids[1], token:'fixture-computer',
    taxRes:2, taxInd:2, service:-2, incentive:0}, now, KCP.buildGame);
  const net = {kind:'local'};
  localStorage.setItem('kcp-league-net-v1', JSON.stringify(net));
  localStorage.setItem('kcp-league-host-v1', JSON.stringify({room, net, state:S}));
  return {room, ids, team:ids[0]};
}"""
PLAN_JS = """() => {
  // calib.py의 연결 경로를 쓰되 이주를 관찰할 수 있도록 한 팀만 설비를 짓는다.
  KCP.league.plan(st => {
    const BG = KCP.buildGame, P = window.__auto('pyeongtaek');
    const connected = new Set(P.lines.flatMap(L => L.p));
    const candidates = BG.TILES.filter(t => !t.out && t.site < 0 &&
      !BG.siteRule('diesel', t) && t.nb.some(i => connected.has(i)));
    P.builds = candidates.slice(0, 6).map(t => ({t:'diesel', i:t.i}));
    candidates.slice(0, 6).forEach(t => {
      P.lines.push({p:[t.nb.find(i => connected.has(i)), t.i]});
    });
    Object.assign(st, P);
  });
}"""
RANK_JS = r"""() => {
  // ECON-UI v1.1: 표의 행·열 대신 계약의 팀 행·부분 점수 meter·총점을 읽는다.
  const root = document.querySelector('#lg-rank');
  if (!root) return {rows:[]};
  const keys = ['pop', 'ind', 'fin', 'co2', 'appr', 'rel'];
  const rows = [...root.querySelectorAll('[data-team]')].map(n => ({
    id:n.dataset.team,
    parts:[...n.querySelectorAll('[data-part]')].map(p => p.dataset.part),
    values:Object.fromEntries(keys.map(key => [key,
      [...n.querySelectorAll(`[data-part="${key}"] meter[value]`)]
        .map(m => m.getAttribute('value'))])),
    totals:[...n.querySelectorAll('[data-total]')].map(t => t.innerText)
  }));
  return {rows};
}"""
POLICY_JS = """([id, key, expected]) => {
  const S = KCP.league.state().S, P = S.teams[id].econPol;
  return !!P && P[key] === expected;
}"""
CRIT_JS = """id => {
  const S = KCP.league.state().S;
  return !!S.teams[id].crit;
}"""
NEXT_JS = "() => { KCP.league.next(); }"


class Checks:
    def __init__(self):
        self.count = 0
        self.failed = 0

    def ok(self, condition, label):
        self.count += 1
        self.failed += not bool(condition)
        print(("PASS " if condition else "FAIL ") + label, flush=True)
        return bool(condition)

    def test(self, label, fn):
        try:
            return self.ok(bool(fn()), label)
        except Exception as exc:
            detail = str(exc).splitlines()[0][:200]
            return self.ok(False, f"{label} ({type(exc).__name__}: {detail})")

    def finish(self):
        print(f"checks {self.count} fail {self.failed}", flush=True)
        return 1 if self.failed else 0


def local_address(argv):
    base = argv[1] if len(argv) > 1 else "http://127.0.0.1:9430/index.html"
    url = urlsplit(base)
    if url.scheme not in ("http", "https") or url.hostname not in (
            "localhost", "127.0.0.1", "::1") or url.username or url.password:
        raise ValueError("외부 네트워크 금지: loopback 주소만 사용할 수 있습니다")
    return base.split("#", 1)[0]


def context_for(browser, base, width, height, scheme):
    context = browser.new_context(viewport={"width": width, "height": height},
                                  locale="ko-KR", color_scheme=scheme,
                                  service_workers="block")
    context.set_default_timeout(WAIT)
    context.set_default_navigation_timeout(WAIT)
    context.add_init_script("""(() => {
      const apply = () => { document.documentElement.dataset.theme = %s; };
      if (document.documentElement) apply();
      else document.addEventListener('DOMContentLoaded', apply, {once:true});
    })();""" % json.dumps(scheme))
    origin = urlsplit(base)
    external = []

    def route(request_route):
        url = urlsplit(request_route.request.url)
        if (url.scheme, url.netloc) == (origin.scheme, origin.netloc):
            request_route.continue_()
        elif url.hostname in ("fonts.googleapis.com", "fonts.gstatic.com"):
            # 외부 전송 금지. 기존 Google Fonts CSS는 빈 응답 → 로컬 대체 폰트.
            request_route.fulfill(status=200, content_type="text/css", body="")
        else:
            external.append(url.hostname or url.scheme)
            request_route.abort()

    context.route("**/*", route)
    # local 리그는 BroadcastChannel. 웹소켓은 서버에 연결하기 전에 막는다.
    context.route_web_socket("**/*", lambda ws: (external.append("websocket"), ws.close()))
    return context, external


def monitored_page(context):
    page = context.new_page()
    events = {"error": [], "warning": [], "pageerror": []}
    page.on("console", lambda message: events[message.type].append(message.text)
            if message.type in ("error", "warning") else None)
    page.on("pageerror", lambda error: events["pageerror"].append(str(error)))
    return page, events


def shown(page, selector):
    nodes = page.locator(selector)
    return nodes.count() > 0 and any(
        not nodes.nth(i).evaluate(HIDDEN_JS) and nodes.nth(i).is_visible()
        for i in range(nodes.count()))


def absent_or_hidden(page, selector):
    # tests.md: 폭 0을 hidden으로 오인하지 않는다.
    nodes = page.locator(selector)
    return all(nodes.nth(i).evaluate(HIDDEN_JS) for i in range(nodes.count()))


def open_panel(page, name):
    button = page.locator(f'#lg-bar [data-panel="{name}"]')
    if button.count() != 1:
        raise AssertionError(f"{name} 서랍 버튼 1개 필요")
    if button.get_attribute("aria-expanded") != "true":
        button.click()
    page.wait_for_timeout(200)


def screenshot(checks, page, name):
    def capture():
        RESULTS.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(RESULTS / name), full_page=True)
        return True
    checks.test(f"캡처 {name}", capture)


def overflow(checks, page, label):
    checks.test(f"{label} 가로 스크롤 0", lambda: page.evaluate(OVERFLOW_JS) <= 0)


def diagnostics(checks, events, label):
    for kind in ("error", "warning", "pageerror"):
        checks.ok(not events[kind],
                  f"{label} {kind} 0" + (f": {events[kind][:2]}" if events[kind] else ""))


def automatic_plan():
    module = ast.parse(Path(__file__).with_name("calib.py").read_text())
    return next(ast.literal_eval(node.value) for node in module.body
                if isinstance(node, ast.Assign) and any(
                    isinstance(t, ast.Name) and t.id == "AUTO" for t in node.targets))


def setup_pair(context, base, turns, pages):
    host, events_h = monitored_page(context)
    pages.append((host, events_h, "진행자"))
    host.goto(base + "#home")
    host.wait_for_function(BOOT_JS)
    fixture = host.evaluate(SEED_JS, turns)
    host.goto(base + "#league/host")
    host.wait_for_selector("#lg-roomcode")
    team, events_t = monitored_page(context)
    pages.append((team, events_t, "팀"))
    team.goto(base + "#league")
    team.fill("#lg-code", fixture["room"])
    team.click("#lg-join")
    team.click(f'[data-seat="{fixture["team"]}"]:not([disabled])')
    team.wait_for_selector("#lg-bar")
    return host, team, fixture


def advance(host, team, round_number, phase):
    host.evaluate(NEXT_JS)
    host.wait_for_function(SYNC_JS, arg=[round_number, phase])
    team.wait_for_function(SYNC_JS, arg=[round_number, phase])


def disabled_policies(page):
    return all(page.locator(f'#lg-city [data-pol="{key}"]').count() > 0 and
               all(page.locator(f'#lg-city [data-pol="{key}"]').nth(i).is_disabled()
                   for i in range(page.locator(f'#lg-city [data-pol="{key}"]').count()))
               for key in POLICIES)


def change_policy(team, host, team_id, key):
    nodes = team.locator(f'#lg-city [data-pol="{key}"]')
    if not nodes.count():
        return False
    node = nodes.first
    if node.evaluate("el => el.tagName === 'INPUT' && el.type === 'range'"):
        current = float(node.input_value())
        low = float(node.get_attribute("min") or 0)
        high = float(node.get_attribute("max") or 100)
        node.focus()
        node.press("ArrowRight" if current < high else "ArrowLeft")
        expected = float(node.input_value())
        if expected == current or not low <= expected <= high:
            return False
    elif node.evaluate("el => el.tagName === 'INPUT' && el.type === 'number'"):
        current = float(node.input_value())
        maximum = node.get_attribute("max")
        expected = current - 1 if maximum is not None and current >= float(maximum) else current + 1
        node.fill(str(expected))
        node.press("Tab")
    else:
        # U1는 range 또는 5단 버튼을 허용한다. 버튼은 숫자 레이블/값으로 읽는다.
        candidates = [nodes.nth(i) for i in range(nodes.count())
                      if nodes.nth(i).get_attribute("aria-pressed") != "true"]
        if not candidates:
            return False
        node = candidates[0]
        value = node.get_attribute("value") or node.inner_text().replace("−", "-")
        number = re.search(r"[-+]?\d+(?:\.\d+)?", value)
        if not number:
            return False
        expected = float(number.group())
        node.click()
    host.wait_for_function(POLICY_JS, arg=[team_id, key, expected])
    return True


def rank_checks(checks, page, ids, label):
    # // ECON-UI v1.1: 익명 표시 여부와 무관하게 data-team으로 활성 도시를 식별한다.
    checks.test(f"{label} U2 #lg-rank 표시", lambda: shown(page, "#lg-rank"))
    snapshot = page.evaluate(RANK_JS)
    checks.ok(len(snapshot["rows"]) == len(ids), f"{label} U2 순위 행 = 활성 팀 {len(ids)}개")
    for team_id in ids:
        checks.ok(sum(row["id"] == team_id for row in snapshot["rows"]) == 1,
                  f"{label} U2 활성 도시 {team_id} 순위 1행")
    checks.ok(bool(snapshot["rows"]) and all(
        sorted(row["parts"]) == sorted(SCORES) for row in snapshot["rows"]),
        f"{label} U2 각 행 부분 점수 정확히 6종")
    # // ECON-UI v1.1: 총점은 [data-total]에서, 부분 점수는 meter의 원래 value에서 확인한다.
    totals_valid = bool(snapshot["rows"])
    for row in snapshot["rows"]:
        value = re.search(r"(?<![\d.])-?\d+(?:\.\d+)?", row["totals"][0]) if len(row["totals"]) == 1 else None
        totals_valid = totals_valid and bool(value) and math.isfinite(float(value.group()))
    checks.ok(totals_valid, f"{label} U2 각 행 총점 1개·유한 숫자")
    for key, title in SCORES.items():
        valid = bool(snapshot["rows"])
        for row in snapshot["rows"]:
            values = row["values"][key]
            try:
                value = float(values[0]) if len(values) == 1 else math.nan
            except ValueError:
                value = math.nan
            valid = valid and math.isfinite(value) and 0 <= value <= 100
        checks.ok(valid, f"{label} U2 부분 점수 {key}({title}) 각 행 0–100")


def crit_safe(value):
    # U4는 전송 필드 이름을 정하지 않았다. 필드명 스키마를 새로 강제하지 않고
    # 모든 깊이에서 자유 서술용 키를 거부하며 값도 칩·유한 숫자·유지/바꿈만 허용.
    prose_keys = re.compile(r"reason|why|text|memo|note|free|essay|body|description|"
                            r"comment|content|reflection|이유|서술|메모|내용", re.I)
    tokens = set(SCORES) | {"keep", "change", "유지", "바꿈"}
    leaves = []
    chip_keys = set()

    def visit(item):
        if isinstance(item, dict):
            chip_keys.update(set(item) & set(SCORES))
            return bool(item) and all(isinstance(key, str) and not prose_keys.search(key)
                                      for key in item) and all(visit(v) for v in item.values())
        if isinstance(item, list):
            return all(visit(v) for v in item)
        leaves.append(item)
        return (isinstance(item, bool) or
                isinstance(item, (int, float)) and math.isfinite(item) or
                isinstance(item, str) and item in tokens)

    return isinstance(value, dict) and visit(value) and any(
        isinstance(v, (int, float)) and not isinstance(v, bool) for v in leaves) and (
            "pop" in leaves or "pop" in chip_keys)


def choose_crit(team, host, team_id):
    root = team.locator("#lg-crit")
    if not root.count():
        return False
    # 칩의 data 속성은 미지정이므로 명세의 한국어 표시명으로 조작한다.
    chip = root.get_by_role("button", name=re.compile("주민"))
    if not chip.count():
        return False
    chip.first.click()
    number = root.locator('input[type="number"], input[type="range"]').first
    if not number.count():
        return False
    number.fill("1") if number.get_attribute("type") == "number" else number.press("ArrowRight")
    number.press("Tab")
    # 가상 문자열을 기기 입력에 넣어도 진행자에게 전송되어서는 안 된다(D-59).
    prose = root.locator('textarea, input[type="text"]')
    for i in range(prose.count()):
        prose.nth(i).fill("검사용 자유 서술은 기기에만 저장")
        prose.nth(i).press("Tab")
    save = root.get_by_role("button", name=re.compile("^(저장|확정|적용|기준 저장|기준 정하기)$"))
    if save.count() and save.first.is_visible():
        save.first.click()
    host.wait_for_function(CRIT_JS, arg=team_id)
    host.wait_for_timeout(400)  # tests.md: 250ms 지연 저장 뒤 확인.
    return crit_safe(host.evaluate("id => KCP.league.state().S.teams[id].crit", team_id))


def migration_caption(host, flows):
    text = host.locator("#lg-mapcap").inner_text()
    names = host.evaluate("() => Object.fromEntries(Object.entries(KCP.ECON_DATA.start).map(([k,v]) => [k,v.name]))")
    top = sorted(flows, key=lambda flow: flow["n"], reverse=True)[:3]
    return shown(host, "#lg-mapcap") and all(re.search(
        re.escape(names[flow["from"]]) + r"\s*→\s*" + re.escape(names[flow["to"]]) +
        r"\s+[\d,.]+\s*명\s*[:：]\s*\S", text) for flow in top)


def economic(checks, context, base, label, pages):
    host, team, fixture = setup_pair(context, base, 12, pages)
    tid, ids = fixture["team"], fixture["ids"]
    checks.test(f"{label} U1 로비 단계 정책 disabled", lambda:
                (open_panel(team, "city"), disabled_policies(team))[1])
    advance(host, team, 1, "plan")
    checks.test(f"{label} U1 #lg-bar 도시 버튼", lambda: shown(team, '#lg-bar [data-panel="city"]'))
    checks.test(f"{label} U1 도시 서랍 열기", lambda: (open_panel(team, "city"), shown(team, "#lg-city"))[1])
    # ECON-NEXT §2: 탐색 버튼은 막대 한 곳. 서랍은 제목·접기·닫기만 둔다.
    checks.test(f"{label} 팀 탐색 버튼 중복 없음", lambda:
                team.locator('[data-panel="city"]').count() == 1 and
                team.locator('#lg-panel [data-ptab]').count() == 0)
    checks.test(f"{label} 팀 서랍 접기", lambda:
                (team.locator('#lg-panel-fold').click(), absent_or_hidden(team, '#lg-panel .lg-pbody'))[1])
    checks.test(f"{label} 팀 서랍 펼치기", lambda:
                (team.locator('#lg-panel-fold').click(), shown(team, '#lg-city'))[1])
    checks.test(f"{label} HUD·도시 남은 돈 = 공개 left", lambda: team.evaluate("""() => {
      const V = KCP.league.state().snap, id = KCP.league.state().team;
      const expected = V.teams[id].left.toLocaleString('ko-KR', {maximumFractionDigits:1}) + '억';
      return [...document.querySelectorAll('[data-money="left"]')].every(el => el.textContent === expected);
    }"""))
    checks.test(f"{label} D-60 시작 통계 일괄 표지 없음", lambda:
                '시작값: 공식 통계' not in team.locator('#lg-city').inner_text() and
                '억 = 게임 단위' in team.locator('#lg-city').inner_text())
    groups = team.evaluate("() => Object.keys(KCP.ECON_DATA.groups)")
    checks.test(f"{label} U1 .lg-grp[data-g] 정확히 6개", lambda:
                team.locator('#lg-city .lg-grp[data-g]').count() == 6 and
                sorted(team.locator('#lg-city .lg-grp[data-g]').evaluate_all(
                    "nodes => nodes.map(n => n.dataset.g)")) == sorted(groups) and
                all(shown(team, f'#lg-city .lg-grp[data-g="{key}"]') for key in groups))
    checks.test(f"{label} U1 정책 항목은 정확히 4종", lambda:
                sorted(team.locator('#lg-city [data-pol]').evaluate_all(
                    "nodes => [...new Set(nodes.map(n => n.dataset.pol))]")) == sorted(POLICIES))
    for key in POLICIES:
        checks.test(f"{label} U1 정책 {key} 표시·활성", lambda key=key:
                    shown(team, f'#lg-city [data-pol="{key}"]') and
                    not team.locator(f'#lg-city [data-pol="{key}"]').first.is_disabled())
        checks.test(f"{label} U1 정책 {key} → 진행자 econPol", lambda key=key:
                    change_policy(team, host, tid, key))
    speed = host.evaluate("() => KCP.leagueCore.publicView(KCP.league.state().S, Date.now()).econ.eduSpeed")
    checks.test(f"{label} U1 배속 ×{speed}", lambda: shown(team, "#lg-city") and bool(re.search(
        r"×\s*" + re.escape(str(speed)) + r"(?![\d.])", team.locator("#lg-city").inner_text())))
    # // ECON-UI v1.1: 기준 카드는 일지 탭 안에 있으므로 확인 전에 직접 연다.
    checks.test(f"{label} U4 첫 달 #lg-crit", lambda:
                (open_panel(team, "journal"), shown(team, "#lg-crit"))[1])
    checks.test(f"{label} U4 crit 객체 키·칩·숫자만 전송", lambda: choose_crit(team, host, tid))
    # ECON-NEXT §2 피드백③: 근거→예측은 기기에 저장하며 서술을 전송하지 않는다.
    team.locator('[data-evidence="grid"]').click()
    team.locator('[data-pred="uns"]').select_option('down')
    team.locator('[data-pred="cash"]').select_option('down')
    team.locator('[data-note="decision"]').fill('가상 도시의 접속 여유를 먼저 확인한다')
    team.locator('[data-note="decision"]').press('Tab')
    checks.ok('가상 도시의 접속 여유를 먼저 확인한다' not in json.dumps(host.evaluate(HOST_JS), ensure_ascii=False),
              f"{label} 근거·예측·기준 설명은 기기에만 저장")
    # ECON-NEXT §2 U5: 두 번 관전·복귀해도 숨긴 이전 지도와 관전 id가 남지 않는다.
    other = next(city for city in ids if city != tid)
    team.locator('.lg-px').click()
    for visit in range(2):
        team.locator('#lg-bar [data-panel="region"]').click()
        team.locator(f'[data-region-city="{other}"]').click()
        team.wait_for_selector('#lg-peek-back')
        checks.ok(all(team.locator(selector).count() == 1 for selector in
                      ('#bd-root', '#lg-peek', '#lg-peek-region', '#lg-peek-back', '#lg-ready')),
                  f"{label} 관전 {visit + 1}회 지도·id 중복 0")
        team.locator('#lg-peek-region').click()
        team.locator('#lg-region-back').click()
        checks.ok(team.locator('#bd-root').count() == 1 and team.locator('#lg-ready').count() == 1,
                  f"{label} 관전 {visit + 1}회 복귀 지도·준비 id 중복 0")
    open_panel(team, 'journal')
    checks.ok(team.locator('[data-note="decision"]').input_value() == '가상 도시의 접속 여유를 먼저 확인한다',
              f"{label} 관전·복귀 후 기준 설명 보존")
    overflow(checks, team, label + " 계획 도시 서랍")
    overflow(checks, host, label + " 계획 진행자")
    screenshot(checks, team, f"econui-{label}-team-plan.png")
    # 허용된 규칙 엔진 fixture. solo.py에서는 이런 상태/계획 주입을 하지 않는다.
    # // ECON-UI v1.1: AUTO의 함수 값이 자동 호출되지 않도록 정의만 실행한다.
    team.evaluate("() => {" + automatic_plan() + "}")
    team.evaluate(PLAN_JS)
    host.wait_for_function("id => !!KCP.league.state().S.teams[id].plan", arg=tid)
    migration_months = 0
    for month in range(1, 13):
        if month > 1:
            advance(host, team, month, "plan")
        advance(host, team, month, "review")
        checks.test(f"{label} U4 {month}달 결과 .lg-ask ≤ 1", lambda:
                    team.locator('.lg-ask').count() <= 1)
        checks.test(f"{label} {month}달 질문 유형과 선택 버튼", lambda: team.evaluate("""() => {
          const ask = document.querySelector('.lg-ask');
          return !ask || (ask.querySelectorAll('[data-answer]').length ===
            (/^lg-[rpf]-/.test(ask.dataset.question) ? 2 : 0));
        }"""))
        if month == 1:
            checks.test(f"{label} 학습 미션은 비교 전 미달성", lambda:
                        '달성' != team.locator('#lg-learning-mission').inner_text().split(':')[-1].strip())
            team.locator('[data-compared]').check()
            team.locator('#lg-panel [data-answer="keep"]').click()
            team.locator('[data-note="askReason"]').fill('실제 결과와 비교했고 다음 달에도 근거를 확인한다')
            team.locator('[data-note="askReason"]').press('Tab')
            checks.ok(team.locator('#lg-learning-mission').inner_text().strip() == '학습 미션: 달성',
                      f"{label} 근거→예측→실제 비교→유지·수정 완료로 학습 미션 달성")
        # // ECON-UI v1.1: 결과로 자동 전환된 서랍에서 도시 탭을 직접 열어 검사한다.
        checks.test(f"{label} U1 {month}달 결과 정책 disabled", lambda:
                    (open_panel(team, "city"), disabled_policies(team))[1])
        state = host.evaluate(HOST_JS)
        flows = [flow for flow in state["results"][-1]["econ"]["flows"]["pop"] if flow["n"] > 0]
        if flows:
            migration_months += 1
            checks.test(f"{label} U2 {month}달 이주 화살표 설명", lambda flows=flows:
                        migration_caption(host, flows))
        if month == 1:
            # // ECON-UI v1.1: 지난달 돈 표도 도시 탭을 열고 기존 세입·세출 조건을 확인한다.
            checks.test(f"{label} U1 지난달 #lg-fiscal", lambda:
                        (open_panel(team, "city"), shown(team, '#lg-fiscal') and
                         all(word in team.locator('#lg-fiscal').inner_text() for word in ('세입', '세출')))[1])
            rank_checks(checks, host, ids, label)
            checks.test(f"{label} U2 #lg-ticker 표시", lambda: shown(host, '#lg-ticker'))
            for title in ("LNG", "환율", "수출", "해운"):
                checks.test(f"{label} U2 국제 지수 {title}", lambda title=title: shown(host, '#lg-ticker') and bool(re.search(
                    re.escape(title) + r"[^\d]{0,30}\d+(?:\.\d+)?", host.locator('#lg-ticker').inner_text())))
            overflow(checks, host, label + " 결과 진행자")
            overflow(checks, team, label + " 결과 도시 서랍")
            screenshot(checks, host, f"econui-{label}-host-review.png")
            screenshot(checks, team, f"econui-{label}-team-review.png")
    checks.ok(migration_months > 0, f"{label} U2 이주 있는 달을 실제로 검사")
    advance(host, team, 12, "end")
    for selector in ('#lg-debrief', '#lg-wsim'):
        checks.test(f"{label} U4 끝 {selector}", lambda selector=selector: shown(host, selector))
    # // ECON-UI v1.1: 끝 단계도 결과 탭으로 바뀌므로 도시 탭을 직접 연다.
    checks.test(f"{label} U1 끝 정책 disabled", lambda:
                (open_panel(team, "city"), disabled_policies(team))[1])
    overflow(checks, host, label + " 끝 진행자")
    overflow(checks, team, label + " 끝 팀")
    screenshot(checks, host, f"econui-{label}-host-end.png")


def seasonal(checks, context, base, label, pages):
    host, team, _ = setup_pair(context, base, 0, pages)
    stages = [("lobby", 0)] + [(phase, round_number) for round_number in range(1, 5)
                                for phase in ("plan", "review")] + [("end", 4)]
    for phase, round_number in stages:
        if phase != "lobby":
            advance(host, team, round_number, phase)
        for page, role in ((host, "진행자"), (team, "팀")):
            for selector in ('[data-panel="city"]', '#lg-rank', '#lg-ticker', '#lg-crit'):
                checks.test(f"{label} 계절 {round_number}턴 {phase} {role} {selector} 없음/hidden",
                            lambda page=page, selector=selector: absent_or_hidden(page, selector))
            overflow(checks, page, f"{label} 계절 {round_number}턴 {phase} {role}")
    screenshot(checks, host, f"econui-{label}-season-host.png")
    screenshot(checks, team, f"econui-{label}-season-team.png")


def main():
    checks = Checks()
    try:
        base = local_address(sys.argv)
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for width, height in ((1280, 900), (390, 844)):
                for scheme in ("light", "dark"):
                    label = f"{width}x{height}-{scheme}"
                    for name, scenario in (("경제", economic), ("계절", seasonal)):
                        context, external = context_for(browser, base, width, height, scheme)
                        pages = []
                        try:
                            scenario(checks, context, base, label, pages)
                        except Exception as exc:
                            checks.ok(False, f"{label} {name} 진행 예외 {type(exc).__name__}: {str(exc).splitlines()[0][:200]}")
                            for page, _, role in pages:
                                screenshot(checks, page, f"econui-{label}-{name}-{role}-failure.png")
                        finally:
                            for _, events, role in pages:
                                diagnostics(checks, events, f"{label} {name} {role}")
                            checks.ok(not external, f"{label} {name} 외부 연결 시도 0: {external}")
                            context.close()
            browser.close()
    except Exception as exc:
        checks.ok(False, f"검사 실행 예외 {type(exc).__name__}: {str(exc).splitlines()[0][:200]}")
    return checks.finish()


if __name__ == "__main__":
    sys.exit(main())
