"""온라인(Supabase Realtime 규약) 연결 검사: 가짜 Phoenix 서버 + 서로 다른 브라우저 컨텍스트 3개(진행자, 평택, 천안)."""
import json, sys, subprocess, time, urllib.request, os
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright
D = os.path.dirname(os.path.abspath(__file__))
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:9400/index.html"
WS = "ws://127.0.0.1:9310/realtime/v1/websocket"
srv = subprocess.Popen(["node", os.path.join(D, "mockrt.js"), "9310"], stdout=subprocess.PIPE); time.sleep(0.8)
problems = []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: problems.append(m)
try:
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        errs = []
        def ctxpage():
            c = br.new_context(viewport={"width": 1280, "height": 800}, locale="ko-KR"); p = c.new_page()
            p.on("pageerror", lambda e: errs.append(str(e))); p.on("console", lambda m: m.type == "error" and "ERR_CERT" not in m.text and errs.append(m.text))
            return p
        def online(p):
            p.goto(BASE + "#league"); p.wait_for_selector("#lg-host")
            p.click(".lg-net summary") if not p.locator(".lg-net[open]").count() else None
            p.check('input[name=lg-net][value=supabase]'); p.fill("#lg-url", WS); p.fill("#lg-key", "sb_publishable_test_key")
        host = ctxpage(); online(host)
        # 비밀 키는 거절
        host.fill("#lg-key", "sb_secret_abc"); host.click("#lg-host"); host.wait_for_timeout(200)
        ok("비밀 키" in host.inner_text("#lg-err"), "secret key rejected")
        host.fill("#lg-key", "sb_publishable_test_key")
        host.click("#lg-host"); host.wait_for_selector("#lg-roomcode")
        host.wait_for_function("() => document.getElementById('lg-conn').dataset.s === 'open'", timeout=8000)
        room = host.inner_text("#lg-roomcode")
        link = host.evaluate("() => { let t; const o = navigator.clipboard; return null; }")
        teams = {}
        for t in ["pyeongtaek", "cheonan"]:
            p = ctxpage(); teams[t] = p
            if t == "cheonan":
                # 참가 링크로 들어오기(연결 설정이 링크에 담긴다)
                url = host.evaluate("() => { const L = KCP.league.state(); return null; }")
                jl = host.evaluate("""() => { const s = JSON.parse(localStorage.getItem('kcp-league-host-v1')); const n = {kind:'supabase', url: s.net.url, key: s.net.key};
                   const b = btoa(unescape(encodeURIComponent(JSON.stringify({r: s.room, n})))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,''); return location.pathname + '#league/j=' + b; }""")
                p.goto(urljoin(BASE, jl)); p.wait_for_selector("#lg-code")
                ok(p.input_value("#lg-code") == room and p.is_checked('input[name=lg-net][value=supabase]'), "join link pre-fills room and online settings")
            else:
                online(p); p.fill("#lg-code", room)
            p.click("#lg-join")
            p.wait_for_selector(f'[data-seat="{t}"]:not([disabled])', timeout=10000)
            p.click(f'[data-seat="{t}"]'); p.wait_for_selector("#lg-bar", timeout=10000)
        host.wait_for_timeout(1500)
        ok(host.evaluate("() => Object.values(KCP.league.state().S.teams).filter(T => T.token).length") == 2, "2 seats over websocket")
        # 계획 1개 + 연계선
        teams["cheonan"].evaluate("() => KCP.league.plan(st => { const BG = KCP.buildGame; const s = BG.SITES; const g = s.find(x => x.kind === 'gridpt' && x.to.includes('pyeongtaek')); const town = s.find(x => x.kind === 'city_l'); st.lines.push({ p: BG.routePath(town.tile, g.tile) }); })")
        teams["pyeongtaek"].evaluate("() => KCP.league.plan(st => { const BG = KCP.buildGame; const s = BG.SITES; const g = s.find(x => x.kind === 'gridpt' && x.to.includes('cheonan')); const lng = s.find(x => x.kind === 'plant'); st.lines.push({ p: BG.routePath(lng.tile, g.tile) }); const d = s.find(x => x.id === 'DOWN'); st.lines.push({ p: BG.routePath(lng.tile, d.tile) }); })")
        teams["pyeongtaek"].click('.lg-bar [data-panel="deal"]'); teams["pyeongtaek"].click('[data-tie="propose"][data-other="cheonan"][data-cap="2"]')
        teams["cheonan"].wait_for_selector("#lg-badge:not([hidden])", timeout=8000)
        teams["cheonan"].click('.lg-bar [data-panel="deal"]'); teams["cheonan"].click('[data-tie="accept"][data-other="pyeongtaek"]')
        host.wait_for_timeout(1500)
        ok(host.evaluate("() => KCP.league.state().S.ties.filter(T => T.st === 'built').length") == 1, "tie built over websocket")
        host.click("#lg-next"); host.wait_for_timeout(500); host.click("#lg-next")
        teams["cheonan"].wait_for_selector("#lg-result-heading", timeout=10000)
        imp = host.evaluate("() => { const S = KCP.league.state().S; return S.results[0].team.cheonan.imp; }")
        ok(imp > 0, f"cheonan imported over tie ({imp} MWh)")
        stats = json.loads(urllib.request.urlopen("http://127.0.0.1:9310/stats").read())
        print("mock stats", {k: v for k, v in stats.items() if k != "keys"}, set(stats["keys"]))
        ok(stats["joins"] >= 3 and stats["badJoin"] == 0 and stats["broadcasts"] > 5, "protocol: joins ok, broadcasts relayed")
        # 서버 재시작 → 다시 연결
        srv.kill(); srv.wait(); time.sleep(0.5)
        host.wait_for_function("() => document.getElementById('lg-conn').dataset.s !== 'open'", timeout=8000)
        ok(True, "host notices disconnect")
        srv2 = subprocess.Popen(["node", os.path.join(D, "mockrt.js"), "9310"], stdout=subprocess.PIPE); time.sleep(0.5)
        host.wait_for_function("() => document.getElementById('lg-conn').dataset.s === 'open'", timeout=20000)
        teams["cheonan"].wait_for_function("() => document.getElementById('lg-conn').dataset.s === 'open'", timeout=20000)
        ok(True, "reconnect after server restart")
        host.click("#lg-next"); teams["cheonan"].wait_for_function("() => KCP.league.state().snap.round === 2", timeout=10000)
        ok(True, "state flows after reconnect")
        srv2.kill()
        ok(not errs, f"no errors {errs[:3]}")
        br.close()
finally:
    try: srv.kill()
    except Exception: pass
print("PROBLEMS", len(problems))
