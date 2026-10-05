"""리그 v3: 사건 예보·대응 버튼, 실제 크기 공개, 연구(대학·연구소) 진척, 철거 회수, 현금 흐름 표시."""
import sys, os
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__)); SH = os.path.join(D, "shots")
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:9420/index.html"
problems = []
def panel(P, name):
    b = P.locator(f'.lg-bar [data-panel="{name}"]')
    if b.get_attribute("aria-expanded") != "true": b.click()
    P.wait_for_timeout(200)
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: problems.append(m)
with sync_playwright() as pw:
    br = pw.chromium.launch(); ctx = br.new_context(viewport={"width": 1280, "height": 860}, locale="ko-KR")
    errs = []
    def page():
        p = ctx.new_page(); p.on("pageerror", lambda e: errs.append(str(e))); p.on("console", lambda m: m.type == "error" and "ERR_CERT" not in m.text and errs.append(m.text)); return p
    h = page(); h.goto(BASE + "#home"); h.evaluate("() => { localStorage.clear(); sessionStorage.clear(); }")
    h.goto(BASE + "#league"); h.wait_for_selector("[data-preset]"); h.click('[data-preset="2"]')
    (h.click('[data-turns="0"]') if h.locator('[data-turns="0"]').count() else None); h.click("#lg-host"); h.wait_for_selector("#lg-roomcode"); room = h.inner_text("#lg-roomcode")
    tp = {}
    for t in ["pyeongtaek", "dangjin"]:
        p = page(); tp[t] = p
        p.goto(BASE + "#league"); p.fill("#lg-code", room); p.click("#lg-join")
        p.wait_for_selector(f'[data-seat="{t}"]:not([disabled])', timeout=10000); p.click(f'[data-seat="{t}"]'); p.wait_for_selector("#lg-bar", timeout=10000)
    P = tp["pyeongtaek"]
    # 내 도시: 태양광·배터리 + 대학·연구소, 연구 순서
    P.evaluate("""() => KCP.league.plan(st => { const BG = KCP.buildGame; const T = BG.TILES; const free = t => T.filter(x => !x.out && x.site < 0 && !BG.siteRule(t, x)).map(x => x.i);
      const s = free('solar'), u = free('uni'); st.builds = [{ t: 'solar', i: s[0] }, { t: 'solar', i: s[1] }, { t: 'battery', i: s[2] }, { t: 'uni', i: u[30] }, { t: 'lab', i: u[50] }]; st.rq = ['bms']; })""")
    h.evaluate("() => KCP.league.next()"); h.wait_for_timeout(500)
    # 사건 강제: 폭염(참가 도시 해당)
    h.evaluate("() => { const S = KCP.league.state().S; S.events = [{ id: 'heatwave_peak', round: S.round, x: 1.3 }]; S.rev++; }")
    h.wait_for_timeout(5000)
    panel(P, "deal"); P.wait_for_selector(".lg-evopt", timeout=10000)
    txt = P.inner_text(".lg-ev")
    ok("예보" in txt and "수요 +6~18%" in txt, "forecast range shown (수요 +6~18%)")
    ok(P.locator('.lg-evopt[data-resp="none"][aria-pressed="true"]').count() == 1, "default: no response")
    left0 = P.inner_text(".lg-left b")
    P.click('.lg-evopt[data-resp="dr"]'); h.wait_for_timeout(5500)
    resp = h.evaluate("() => KCP.league.state().S.teams.pyeongtaek.resp")
    ok(resp and list(resp.values()) == ["dr"], f"host recorded response {resp}")
    panel(P, "deal"); P.wait_for_selector(".lg-left b")
    left1 = P.inner_text(".lg-left b")
    ok(left0 != left1, f"budget left changed {left0} → {left1}")
    P.click('#lg-ready')
    P.wait_for_selector('#lg-predict', timeout=10000)
    ok(P.locator('#lg-evidence').count() == 1, "event response opens criterion / evidence gate")
    ok(P.locator('#lg-predict-skip').count() == 0, "team learning loop has no solo skip")
    ok("수요반응 계약" in h.inner_text("#lg-evbox"), "host shows team responses")
    P.screenshot(path=f"{SH}/v3-1-team-event.png")
    h.screenshot(path=f"{SH}/v3-2-host-event.png", full_page=True)
    # 운영 → 실제 크기 공개, 결과 현금 흐름
    h.evaluate("() => KCP.league.next()"); h.wait_for_timeout(5500)
    panel(P, "result")
    P.wait_for_selector(".lg-kpi", timeout=10000)
    rt = P.inner_text(".lg-pbody")
    ok("확정" in rt, "confirmed size revealed after run")
    ok(P.locator('.lg-ask[data-question="lg-f-event"]').count() == 1, "event month uses lg-f-event")
    ok(P.locator('.lg-ask [data-answer]').count() == 2, "event follow-up has revise / keep controls")
    ok("새 투자" in rt and "누적 투자" in rt, "cash-flow KPI shown")
    rs = h.evaluate("() => KCP.league.state().S.teams.pyeongtaek.rs")
    ok(rs and rs["prog"].get("bms") == 3, f"research progressed in round 1 (lab only) {rs}")
    P.screenshot(path=f"{SH}/v3-3-team-result.png")
    # 2라운드: 지난 라운드 태양광 철거 → 손실 표시
    h.evaluate("() => KCP.league.next()"); h.wait_for_timeout(5500)
    P.evaluate("() => KCP.league.plan(st => { st.builds = st.builds.slice(1); })"); h.wait_for_timeout(5500)
    panel(P, "deal"); P.wait_for_selector(".lg-left")
    ok("철거 손실" in P.inner_text(".lg-left"), "demolition loss shown in budget line")
    P.click(".lg-px") if P.locator(".lg-px").count() else None
    # 연구 서랍(리그)
    P.click("#bd-pm"); P.click("[data-tab=research]"); P.wait_for_timeout(300)
    rtx = P.inner_text("#bd-drawer-body")
    ok("진척 3/6" in rtx and "다음 라운드부터" in rtx, "league research drawer shows host progress")
    P.screenshot(path=f"{SH}/v3-4-team-research.png")
    ok(not errs, f"no errors {errs[:3]}")
    br.close()
print("PROBLEMS", len(problems))
for p in problems: print(" -", p)
