"""실제 Supabase Broadcast 검사. 실행 범위·사용법: live.md.

키/프레임 원문/예외 원문은 출력·저장하지 않는다. 설정이 없으면
Playwright를 import하기 전에 종료하여 의존성 없이 건너뛴다.
"""
import base64
import json
import os
import re
import secrets
import statistics
import sys
import time
from collections import Counter
from urllib.parse import parse_qs, urlsplit
from league_flow import confirm_seat, select_mode

WAIT = 30000
IDS = ("pyeongtaek", "dangjin", "asan")  # south.presets[3]: 평택 필수, 만/육상 인접.
BOOT_JS = "() => !!(window.KCP && KCP.league && KCP.leagueCore && KCP.buildGame)"
OPEN_JS = "() => document.querySelector('#lg-conn')?.dataset.s === 'open'"
STATE_JS = "() => { const L = KCP.league.state(); return L && (L.S || L.snap); }"
SUMMARY_JS = """() => {
  const L = KCP.league.state();
  const V = L?.S ? KCP.leagueCore.publicView(L.S, Date.now()) : L?.snap;
  return V && {rev:V.rev, round:V.round, phase:V.phase, econ:V.econ};
}"""
SYNC_JS = """raw => {
  // wait_for_function은 객체 속성의 None을 undefined로 넘겨 null 키가 사라진다 — JSON 문자열로 받는다.
  const expected = JSON.parse(raw);
  const V = KCP.league.state()?.snap;
  // 실서버 키 정렬: 중첩 객체의 키 순서는 무시하고 배열 순서는 유지한다.
  const canon = x => JSON.stringify(x, (_, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))
      : value);
  return !!V && V.rev === expected.rev && V.round === expected.round &&
    V.phase === expected.phase && canon(V.econ) === canon(expected.econ);
}"""
PHASE_JS = """([round, phase]) => {
  const L = KCP.league.state(), V = L && (L.S || L.snap);
  return !!V && V.round === round && V.phase === phase;
}"""
SEATED_JS = "ids => ids.every(id => !!KCP.league.state().S.teams[id].token)"
IDENTITY_JS = """() => {
  const L = KCP.league.state(); return {role:L.role, room:L.room, team:L.team};
}"""
LOCAL_JS = """([room, id, round]) => {
  const d = JSON.parse(localStorage.getItem('kcp-league-data-v1:' + room + ':' + id));
  return {journal:d?.journal?.[round]?.why,
    reason:d?.interview?.months?.[round]?.critReason,
    answer:d?.interview?.months?.[round]?.askReason};
}"""
PLAN_JS = """ids => {
  // mocktest.py의 검사 API: 실제 팀 sendPlan 경로만 사용한다.
  const L = KCP.league.state(), BG = KCP.buildGame;
  const anchor = BG.SITES.find(s => s.kind === 'plant') ||
    BG.SITES.find(s => s.kind === 'city_l') || BG.SITES.find(s => s.kind.startsWith('city'));
  const gates = BG.SITES.filter(s => s.kind === 'gridpt' &&
    (s.to || []).some(id => ids.includes(id) && id !== L.team));
  if (!anchor || !gates.length) throw new Error('fixture sites');
  const lines = gates.map(g => ({p:BG.routePath(anchor.tile, g.tile)}));
  if (lines.some(l => !l.p || l.p.length < 2)) throw new Error('fixture paths');
  const sent = KCP.league.plan(st => { st.lines = lines; });
  return {sent, rev:KCP.league.state().rev, lines:lines.map(l => l.p)};
}"""
OVERFLOW_JS = """() => Math.max(document.documentElement.scrollWidth,
  document.body.scrollWidth) - document.documentElement.clientWidth"""


class ConfigError(Exception):
    """인자를 포함하지 않는 고정 안내 문자열만 사용한다."""


class StopScenario(Exception):
    pass


class Checks:
    def __init__(self):
        self.count = self.failed = 0
        self.stage = "설정"

    def ok(self, condition, label):
        self.count += 1
        self.failed += not bool(condition)
        print(("PASS " if condition else "FAIL ") + label, flush=True)
        return bool(condition)

    def require(self, condition, label):
        if not self.ok(condition, label):
            raise StopScenario()

    def finish(self):
        print(f"checks {self.count} fail {self.failed}", flush=True)
        return int(self.failed > 0)


def settings():
    url = os.environ.get("KCP_SB_URL", "").strip()
    key = os.environ.get("KCP_SB_KEY", "").strip()
    # 주소가 없더라도 비밀 키부터 거부한다.
    if re.search(r"sb_secret_|service_role", key, re.I):
        raise ConfigError("비밀 키 거부: 공개 publishable/anon 키만 사용하세요")
    payload = None
    if key.startswith("eyJ"):
        try:
            part = key.split(".")[1]
            payload = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
        except (ValueError, IndexError, UnicodeError):
            if url:
                raise ConfigError("공개 키 거부: JWT 형식을 확인하세요") from None
        if isinstance(payload, dict) and payload.get("role") == "service_role":
            raise ConfigError("비밀 JWT 거부: anon 키만 사용하세요")
    if not url or not key:
        return None
    if key.startswith("eyJ"):
        if not isinstance(payload, dict) or payload.get("role") != "anon":
            raise ConfigError("비밀/비공개 JWT 거부: anon 키만 사용하세요")
    elif not (key.startswith("sb_publishable_") and len(key) > 15):
        raise ConfigError("공개 키 거부: publishable/anon 형식을 확인하세요")
    # 실제 검사에서 mockrt.js 주소를 받아 거짓 통과하는 것을 방지한다.
    if re.fullmatch(r"[a-z0-9]{20}", url):
        url = "https://" + url + ".supabase.co"
    if not re.fullmatch(r"https://[a-z0-9-]+\.supabase\.co/?", url):
        raise ConfigError("주소 거부: Supabase 프로젝트 HTTPS 주소/ref만 사용하세요")
    return url.rstrip("/"), key


def local_base():
    if len(sys.argv) > 2:
        raise ConfigError("사용법: live.py [로컬 index.html 주소]; 연결 설정은 환경 변수만 사용")
    base = sys.argv[1] if len(sys.argv) == 2 else "http://127.0.0.1:9430/index.html"
    u = urlsplit(base)
    if (u.scheme not in ("http", "https") or
            u.hostname not in ("localhost", "127.0.0.1", "::1") or
            u.username or u.password or u.query):
        raise ConfigError("앱 주소 거부: 인증정보/쿼리 없는 loopback 주소만 사용하세요")
    return base.split("#", 1)[0]


class Wire:
    """원문·토큰·키가 있는 URL은 보관하지 않는다. 카운터와 측정값만 남긴다."""
    def __init__(self, project, key, markers):
        self.project, self.key, self.markers = urlsplit(project).hostname, key, markers
        self.sockets = self.bad_sockets = self.sent = self.snaps = self.leaks = 0
        self.sent_snaps = 0
        self.nacks = self.callback_errors = self.blocked = 0
        self.requests, self.errors = Counter(), Counter()
        self.pending, self.latencies = None, []
        self.team = None

    def attach(self, page):
        page.on("console", lambda m: self.errors.update([m.type])
                if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda _: self.errors.update(["pageerror"]))
        page.on("websocket", self.websocket)

    def websocket(self, ws):
        u = urlsplit(ws.url)
        self.sockets += 1
        self.bad_sockets += not (u.scheme == "wss" and u.hostname == self.project and
                                 u.path == "/realtime/v1/websocket" and
                                 parse_qs(u.query).get("apikey") == [self.key])
        ws.on("framesent", lambda frame: self.frame(frame, True))
        ws.on("framereceived", lambda frame: self.frame(frame, False))

    def frame(self, frame, sent):
        try:
            raw = frame.decode("utf-8", errors="replace") if isinstance(frame, bytes) else frame
            if sent:
                self.sent += 1
                self.leaks += any(marker in raw for marker in self.markers)
            try:
                msg = json.loads(raw)
            except (ValueError, TypeError):
                return  # JSON이 아닌 프레임도 원문 표식 검사는 이미 거쳤다.
            if sent and not any(marker in raw for marker in self.markers):
                # Unicode escape로 표식이 들어간 경우도 확인한다.
                self.leaks += any(marker in json.dumps(msg, ensure_ascii=False)
                                  for marker in self.markers)
            if not isinstance(msg, dict) or msg.get("event") != "broadcast":
                return
            envelope = msg.get("payload", {})
            event, data = envelope.get("event"), envelope.get("payload")
            if not isinstance(data, dict):
                return
            # 팀 요청 body는 문자열 JSON, 진행자 봉투는 객체 data를 그대로 싣는다.
            if event == "req" and isinstance(data.get("body"), str):
                data = json.loads(data["body"])
            elif event in ("snap", "nack", "ack") and isinstance(data.get("data"), dict):
                data = data["data"]
            p = self.pending
            if sent and event == "req":
                self.team = data.get("team")
                self.requests[data.get("type")] += 1
                if p and p["start"] is None and p["request"](data):
                    p["start"] = time.perf_counter()
            elif sent and event == "snap":
                self.sent_snaps += 1
            elif not sent and event == "nack" and self.team is not None and data.get("team") == self.team:
                self.nacks += 1
            elif not sent and event == "snap":
                self.snaps += 1
                if (p and p["start"] is not None and p["ms"] is None and
                        data.get("rev", 0) > p["baseline"] and p["snapshot"](data)):
                    p["ms"] = (time.perf_counter() - p["start"]) * 1000
        except Exception:
            self.callback_errors += 1  # 콜백 예외 원문에 프레임/키가 포함될 수 있다.


def make_page(browser, base, project, key, markers, mobile=False):
    context = browser.new_context(
        viewport={"width": 1024 if mobile else 1440, "height": 900},
        is_mobile=mobile, has_touch=mobile, locale="ko-KR", service_workers="block")
    context.set_default_timeout(WAIT)
    context.set_default_navigation_timeout(WAIT)
    wire, origin = Wire(project, key, markers), urlsplit(base)

    def route(r):
        u = urlsplit(r.request.url)
        if (u.scheme, u.netloc) == (origin.scheme, origin.netloc):
            r.continue_()
        elif u.hostname in ("fonts.googleapis.com", "fonts.gstatic.com"):
            # 외부 폰트는 빈 CSS 응답. 오류 허용 예외를 만들지 않는다.
            r.fulfill(status=200, content_type="text/css", body="")
        else:
            wire.blocked += 1
            r.abort()

    context.route("**/*", route)
    page = context.new_page()
    wire.attach(page)  # goto 전 등록: reload 뒤의 새 WebSocket에도 적용.
    return context, page, wire


def online(page, base, project, key, mode):
    page.goto(base + "#league")
    page.wait_for_function(BOOT_JS)
    select_mode(page, mode)
    if not page.locator(".lg-net[open]").count():
        page.locator(".lg-net summary").click()
    page.check('input[name="lg-net"][value="supabase"]')
    page.fill("#lg-url", project)
    page.fill("#lg-key", key)


def panel(page, name):
    button = page.locator(f'#lg-bar [data-panel="{name}"]')
    if button.get_attribute("aria-expanded") != "true":
        button.click()
    page.wait_for_selector("#lg-panel:not([hidden])")


def sync_all(checks, host, teams, label):
    checks.stage = label + " 상태 동기화"
    expected = host.evaluate(SUMMARY_JS)
    checks.require(bool(expected and expected["econ"]), label + " 경제 요약 존재")
    for tid, (page, _) in teams.items():
        page.wait_for_function(SYNC_JS, arg=json.dumps(expected))
        checks.require(page.evaluate(SUMMARY_JS) == expected,
                       f"{label} {tid} rev·round·phase·econ 일치")
        checks.ok(page.evaluate(OVERFLOW_JS) <= 0, f"{label} {tid} 가로 스크롤 0")
    checks.ok(host.evaluate(OVERFLOW_JS) <= 0, label + " 진행자 가로 스크롤 0")
    return expected


def timed(checks, host, page, wire, label, kind, action, received, request=None):
    checks.stage = label
    baseline = host.evaluate(STATE_JS)["rev"]
    wire.pending = {"baseline": baseline, "start": None, "ms": None,
                    "request": lambda m: m.get("type") == kind and
                    (request is None or request(m)), "snapshot": received}
    try:
        action()
        deadline = time.monotonic() + WAIT / 1000
        while wire.pending["ms"] is None and time.monotonic() < deadline:
            page.wait_for_timeout(25)  # Playwright 이벤트를 계속 처리한다.
        ms = wire.pending["ms"]
        checks.require(ms is not None, label + " 요청→해당 스냅 수신")
        wire.latencies.append(ms)
        print(f"latency {label}: {ms:.1f} ms", flush=True)
    finally:
        wire.pending = None


def advance(checks, host, teams, month, phase):
    checks.stage = f"{month}달 {phase} 진행자 다음"
    host.click("#lg-next")
    host.wait_for_function(PHASE_JS, arg=[month, phase])
    for page, _ in teams.values():
        page.wait_for_function(PHASE_JS, arg=[month, phase])
    return sync_all(checks, host, teams, f"{month}달 {phase}")


def scenario(checks, host, teams, base, project, key, markers):
    checks.stage = "온라인 로비/12달 방 만들기"
    online(host, base, project, key, "host")
    host.click('[data-preset="3"]')
    host.click('[data-turns="12"]')
    selected = host.locator(".lg-pickc input:checked").evaluate_all("ns => ns.map(n => n.value)")
    checks.require(set(selected) == set(IDS) and
                   host.locator("#lg-pickmsg").get_attribute("data-bad") == "false",
                   "평택·당진·아산 3팀 인접 조합")
    host.click("#lg-host")  # 앱의 무작위 방 코드 생성 그대로 사용.
    host.wait_for_selector("#lg-roomcode")
    host.wait_for_function(OPEN_JS)
    room_display = host.inner_text("#lg-roomcode").strip()
    room = room_display.replace("-", "")
    checks.require(bool(re.fullmatch(r"[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}", room_display)), "8글자 방 코드·4-4 표시")
    state = host.evaluate(STATE_JS)
    checks.require(len(state["rounds"]) == 12 and bool(state.get("econ")), "경제 모드 12달")
    for tid, (page, _) in teams.items():
        checks.stage = tid + " 온라인 방 코드 참가"
        online(page, base, project, key, "join")
        page.fill("#lg-code", room_display.lower())
        page.click("#lg-join")
        confirm_seat(page, tid, timeout=WAIT)
        page.wait_for_function(OPEN_JS)
    host.wait_for_function(SEATED_JS, arg=list(IDS))
    checks.require(all(host.evaluate(STATE_JS)["teams"][t]["token"] for t in IDS),
                   "별도 브라우저 컨텍스트 3팀 착석")
    sync_all(checks, host, teams, "로비")
    journal_mark, reason_mark, answer_mark = markers
    for month in range(1, 4):
        advance(checks, host, teams, month, "plan")
        if month == 2:
            tid = "asan"
            page, wire = teams[tid]
            checks.stage = "팀 기기 새로고침 복구"
            identity = page.evaluate(IDENTITY_JS)
            before = page.evaluate(LOCAL_JS, [room, tid, 1])
            sockets = wire.sockets
            page.reload()
            page.wait_for_selector("#lg-bar")
            page.wait_for_function(OPEN_JS)
            sync_all(checks, host, teams, "팀 새로고침 후")
            checks.require(page.evaluate(IDENTITY_JS) == identity and wire.sockets > sockets and
                           page.evaluate(LOCAL_JS, [room, tid, 1]) == before,
                           "팀 자리·방·지난달 일지·기준 이유 새 연결 복구")
        for tid, (page, wire) in teams.items():
            # 빈 입력으로 개인정보 검사가 통과하지 않게 UI·저장도 확인.
            checks.stage = f"{month}달 {tid} 일지 입력"
            panel(page, "journal")
            page.fill('textarea[data-j="why"]', journal_mark)
            # ECON-UI U4: 기준 이유 칸은 첫 달·새해 기준 변경 때만 보인다 — 있을 때만 입력한다.
            has_reason = page.locator('textarea[data-note="critReason"]').count() > 0
            if has_reason:
                page.fill('textarea[data-note="critReason"]', reason_mark)
            page.wait_for_timeout(400)  # tests.md: 저장 대기 250ms 뒤 확인.
            local = page.evaluate(LOCAL_JS, [room, tid, month])
            checks.require(local["journal"] == journal_mark and (not has_reason or local["reason"] == reason_mark),
                           f"{month}달 {tid} 일지·기준 이유 표식 로컬 저장")
            # 계획 변경은 실제 팀 전송 API를 사용. 같은 자산을 유지해 철거 손실 방지.
            prior_rev = page.evaluate("() => KCP.league.state().rev")
            expected_rev = prior_rev + 1
            fixture = {}

            def plan_action():
                fixture.update(page.evaluate(PLAN_JS, list(IDS)))

            timed(checks, host, page, wire, f"{month}달 {tid} plan", "plan", plan_action,
                  lambda v: v["teams"][tid]["rev"] == expected_rev,
                  lambda m: m.get("rev") == expected_rev)
            accepted = host.evaluate(STATE_JS)["teams"][tid]
            checks.require(fixture.get("sent") and fixture.get("rev") == expected_rev and
                           accepted["rev"] == expected_rev and accepted["plan"] and
                           [l["p"] for l in accepted["plan"]["lines"]] == fixture["lines"],
                           f"{month}달 {tid} 계획 경로·rev 진행자 반영")
            sync_all(checks, host, teams, f"{month}달 {tid} 계획 후")
            panel(page, "city")
            tax = month - 2  # -1, 0, 1: 매달 다른 정책.
            slider = page.locator('[data-pol="taxRes"]')

            def policy_action():
                slider.focus()
                slider.press("Home")
                for _ in range(tax + 2):
                    page.locator('[data-pol="taxRes"]').press("ArrowRight")

            timed(checks, host, page, wire, f"{month}달 {tid} econ", "econ", policy_action,
                  lambda v: (v["teams"][tid].get("econPol") or {}).get("taxRes") == tax,
                  lambda m: m.get("taxRes") == tax)
            checks.require(host.evaluate(STATE_JS)["teams"][tid]["econPol"]["taxRes"] == tax,
                           f"{month}달 {tid} 정책 econ 반영")
            sync_all(checks, host, teams, f"{month}달 {tid} 정책 후")
            checks.stage = f"{month}달 {tid} 기준 입력"
            panel(page, "journal")
            # ECON-UI U4: 기준 칸은 1월 계획 단계에만 그려진다 — 칸이 있을 때만 기준 요청을 검사한다.
            if page.locator("#lg-crit-line").count():
                line = 40 + month
                page.fill("#lg-crit-line", str(line))
                # 매달 다른 칩을 추가하여 항상 click → crit 요청 생성(최대 2개).
                chip = ("pop", "rel", "co2")[month - 1]
                timed(checks, host, page, wire, f"{month}달 {tid} crit", "crit",
                      lambda: page.click(f'[data-crit="{chip}"]'),
                      lambda v: (v["teams"][tid].get("crit") or {}).get("line") == line and
                      chip in (v["teams"][tid].get("crit") or {}).get("chips", []),
                      lambda m: m.get("line") == line and chip in m.get("chips", []))
                crit = host.evaluate(STATE_JS)["teams"][tid]["crit"]
                checks.require(set(crit) == {"chips", "line", "choice"} and crit["line"] == line,
                               f"{month}달 {tid} 기준 칩·숫자·선택만 반영")
                sync_all(checks, host, teams, f"{month}달 {tid} 기준 후")
        # 매달 아직 연결되지 않은 인접 쌍: 총 3개의 연계선.
        a, b = (("pyeongtaek", "dangjin"), ("pyeongtaek", "asan"),
                ("asan", "dangjin"))[month - 1]
        pa, wa = teams[a]
        pb, wb = teams[b]

        def tie_state(v, st):
            return any({t["a"], t["b"]} == {a, b} and t["st"] == st and t["cap"] == 2
                       for t in v["ties"])

        panel(pa, "deal")
        timed(checks, host, pa, wa, f"{month}달 {a}→{b} 제안", "tie",
              lambda: pa.click(f'[data-tie="propose"][data-other="{b}"][data-cap="2"]'),
              lambda v: tie_state(v, "prop"),
              lambda m: m.get("op") == "propose" and m.get("other") == b)
        panel(pb, "deal")
        timed(checks, host, pb, wb, f"{month}달 {b} 수락", "tie",
              lambda: pb.click(f'[data-tie="accept"][data-other="{a}"]'),
              lambda v: tie_state(v, "built"),
              lambda m: m.get("op") == "accept" and m.get("other") == a)
        checks.require(tie_state(host.evaluate(STATE_JS), "built"), f"{month}달 연계선 2 MW 연결")
        sync_all(checks, host, teams, f"{month}달 연계선 후")
        for tid, (page, wire) in teams.items():
            def ready_action():
                page.click("#lg-ready")
                page.wait_for_selector("#lg-predict")
                checks.require(page.locator("#lg-ready-confirm").is_disabled(),
                               f"{month}달 {tid} 하루 전 약속 입력 전 준비 확인 비활성")
                page.locator("[data-evidence]:not([disabled])").first.click()
                page.locator("[data-pred]").select_option("down")
                page.locator('[data-confidence="fairly"]').click()
                page.click("#lg-ready-confirm")

            timed(checks, host, page, wire, f"{month}달 {tid} ready", "ready", ready_action,
                  lambda v: v["teams"][tid]["ready"] is True,
                  lambda m: m.get("ready") is True)
        checks.require(all(host.evaluate(STATE_JS)["teams"][t]["ready"] for t in IDS),
                       f"{month}달 3팀 모두 준비")
        sync_all(checks, host, teams, f"{month}달 준비 후")
        advance(checks, host, teams, month, "review")
        state = host.evaluate(STATE_JS)
        checks.require(state["econ"]["t"] == month and len(state["results"]) == month,
                       f"{month}달 경제 정산·결과 누적")
        for tid, (page, _) in teams.items():
            checks.stage = f"{month}달 {tid} 반문 답 입력"
            panel(page, "result")
            # ECON-UI U4: 반문은 매달 필수가 아니다. 12달 모드의 2달 주기
            # 질문은 실제 UI에서 반드시 입력한다. D-59: 답은 기기에만 저장.
            if month == 2:
                page.wait_for_selector('textarea[data-note="askReason"]')
                page.click('[data-answer="keep"]')
                page.fill('textarea[data-note="askReason"]', answer_mark)
                page.wait_for_timeout(400)
                checks.require(page.evaluate(LOCAL_JS, [room, tid, month])["answer"] == answer_mark,
                               f"{month}달 {tid} 반문 답 표식 로컬 저장")
        if month == 2:
            checks.stage = "진행자 새로고침 복구"
            before = host.evaluate(STATE_JS)
            host.reload()
            host.wait_for_selector("#lg-roomcode")
            host.wait_for_function(OPEN_JS)
            after = host.evaluate(STATE_JS)
            checks.require(host.inner_text("#lg-roomcode").strip().replace("-", "") == room and
                           all(after[k] == before[k] for k in
                               ("rev", "round", "phase", "econ", "ties", "results")) and
                           all(after["teams"][t]["token"] == before["teams"][t]["token"] for t in IDS),
                           "진행자 방·rev·경제·연계선·결과·팀 자리 저장본 복구")
            sync_all(checks, host, teams, "진행자 새로고침 후")
    # 반문 표식 입력 이후에도 실제 요청과 회신을 추가로 통과시킨다.
    advance(checks, host, teams, 4, "plan")
    checks.require(len(host.evaluate(STATE_JS)["results"]) == 3, "3달 운영 완료·4달 계획 진입")


def report_wires(checks, pages):
    samples = []
    for label, _, wire in pages:
        for kind in ("error", "warning", "pageerror"):
            checks.ok(wire.errors[kind] == 0, f"{label} {kind} {wire.errors[kind]} (기대 0)")
        checks.ok(wire.sockets > 0 and wire.bad_sockets == 0,
                  f"{label} 실제 프로젝트 WSS만 연결 ({wire.sockets}회)")
        # live.md 검사 내용: self:false이므로 진행자는 자기 스냅을 수신하지 않는다.
        if label == "진행자":
            checks.ok(wire.sent > 0 and wire.sent_snaps > 0,
                      f"{label} 프레임 관찰 송신 {wire.sent}·스냅 송신 {wire.sent_snaps}")
        else:
            checks.ok(wire.sent > 0 and wire.snaps > 0,
                      f"{label} 프레임 관찰 송신 {wire.sent}·스냅 수신 {wire.snaps}")
        checks.ok(wire.leaks == 0, f"{label} 모든 송신 프레임 자유 서술 표식 {wire.leaks} (기대 0)")
        checks.ok(wire.callback_errors == 0 and wire.blocked == 0,
                  f"{label} 프레임 검사 예외·예상 밖 HTTP 요청 0")
        if label != "진행자":
            checks.ok(wire.nacks == 0, f"{label} 요청 거부 {wire.nacks} (기대 0)")
            checks.ok(all(wire.requests[k] >= 3 for k in ("plan", "econ", "ready")) and wire.requests["crit"] >= 1 and
                      wire.requests["tie"] >= 2,
                      f"{label} 3달 plan·econ·ready, 1달 crit 및 연계선 요청 관찰")
        samples.extend(wire.latencies)
    if pages:
        checks.ok(len(samples) >= 36, f"지연 표본 {len(samples)} (기대 최소 36: 3팀×(3요청×3달+기준 1) + 제안/수락 6)")
        if samples:
            print(f"latency n={len(samples)} median={statistics.median(samples):.1f} ms "
                  f"max={max(samples):.1f} ms", flush=True)
        else:
            print("latency n=0 median=N/A max=N/A", flush=True)


def main():
    checks, contexts, pages = Checks(), [], []
    try:
        config = settings()
        base = local_base() if config else None
    except ConfigError as exc:
        checks.ok(False, str(exc))  # 검증된 고정 안내만 출력.
        return checks.finish()
    except Exception as exc:
        checks.ok(False, f"설정 검사 예외 {type(exc).__name__} (원문 출력 생략)")
        return checks.finish()
    if config is None:
        print("SKIP KCP_SB_URL 또는 KCP_SB_KEY 없음: 실제 Supabase 검사 건너뜀", flush=True)
        return checks.finish()
    project, key = config
    print(f"공개 키: {key[:6]}…", flush=True)
    markers = tuple(f"LIVE_PRIVATE_{kind}_{secrets.token_hex(16)}"
                    for kind in ("JOURNAL", "REASON", "ANSWER"))
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            try:
                for label in ("진행자", *IDS):
                    context, page, wire = make_page(browser, base, project, key, markers,
                                                    mobile=label != "진행자")
                    contexts.append(context)
                    pages.append((label, page, wire))
                host = pages[0][1]
                teams = {label: (page, wire) for label, page, wire in pages[1:]}
                scenario(checks, host, teams, base, project, key, markers)
            except StopScenario:
                pass
            except Exception as exc:
                checks.ok(False, f"{checks.stage}: {type(exc).__name__} (원문/호출 인자 출력 생략)")
            finally:
                # close 때 콜백도 개인정보/오류 집계에 포함. 하나가 실패해도 나머지 정리.
                for context in contexts:
                    try:
                        context.close()
                    except Exception as exc:
                        checks.ok(False, f"컨텍스트 정리 {type(exc).__name__} (원문 출력 생략)")
                browser.close()
    except Exception as exc:
        checks.ok(False, f"{checks.stage}: 실행 예외 {type(exc).__name__} (원문 출력 생략)")
    finally:
        report_wires(checks, pages)
    return checks.finish()


if __name__ == "__main__":
    sys.exit(main())
