# 경제 모드 통합 검사: 달 턴, 현금 = 시작 시 쓸 수 있는 돈, 세입·세출, 이주, 수요 배수, 정책 요청
import json, sys
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:9430/index.html"
AUTO = open(__import__("os").path.join(__import__("os").path.dirname(__import__("os").path.abspath(__file__)), "calib.py")).read().split('AUTO = """')[1].split('"""')[0]
JS = r"""
() => {
  const C = KCP.leagueCore, BG = KCP.buildGame, R = C.regionOf("south"), out = { checks: [] }, ok = (c, m) => out.checks.push([!!c, m]);
  const ids = ["pyeongtaek", "dangjin", "asan"], tok = id => "tok-" + id + "-0001";
  const S = C.newState("ECON1", "south", 0, ids, { turns: 12 });
  ok(S.rounds.length === 12 && S.rounds[0].month === 1 && S.rounds[0].season === "winter" && S.rounds[6].season === "summer", "12 month turns, Jan=winter, Jul=summer");
  ok(S.econ && S.econ.order.length === 3, "econ state created");
  ids.forEach(id => C.reduce(S, { type: "claim", team: id, token: tok(id) }, 1, BG));
  const plans = {}; ids.forEach(id => { plans[id] = __auto(id); });
  // 평택만 디젤로 전기를 넉넉히, 당진은 아무것도 안 함
  BG.selectPack("pyeongtaek", "league");
  const near = plans.pyeongtaek.lines.flatMap(L => L.p).flatMap(i => BG.TILES[i].nb).filter((i, k, a) => a.indexOf(i) === k && !BG.TILES[i].out && BG.TILES[i].site < 0 && !BG.siteRule("diesel", BG.TILES[i]));
  plans.pyeongtaek.builds = near.slice(0, 6).map(i => ({ t: "diesel", i }));
  plans.pyeongtaek.lines = plans.pyeongtaek.lines.concat(near.slice(0, 6).map(i => { const c = plans.pyeongtaek.lines.flatMap(L => L.p).find(x => BG.TILES[x].nb.includes(i)); return { p: [c, i] }; }));
  const hist = [];
  for (let m = 1; m <= 12; m++) {
    C.host(S, "next", m * 100); S.events = S.events.filter(x => x.round !== S.round);
    const pv = C.publicView(S, m * 100 + 1);
    if (m === 1) ids.forEach(id => ok(Math.abs(pv.teams[id].budget - (pv.econ.cities[id].cash + (pv.econ.cities[id].debtCap || 0))) < 0.01, `turn start: budget = cash + debtCap (${id})`) /* ECON-BALANCE B7: 남은 지방채 한도까지 쓸 수 있다 */);
    if (m === 2) ids.forEach(id => { const sp = C.spendOf(BG, S, R, id, S.teams[id].plan || { builds: [], lines: [] }); ok(Math.abs((C.budget(S, id) - sp) - (S.econ.cities[id].cash + (S.econ.cities[id].debtCap || 0))) < 0.05, `month 2: left = cash + debtCap (${id}) ${(C.budget(S, id) - sp).toFixed(2)} vs ${S.econ.cities[id].cash}+${S.econ.cities[id].debtCap}`) /* ECON-BALANCE B7 */; });
    if (m === 1) ids.forEach(id => C.reduce(S, { type: "plan", team: id, token: tok(id), rev: 1, plan: id === "dangjin" ? { builds: [], lines: [] } : plans[id] }, m * 100 + 2, BG));
    if (m === 2) ok(C.reduce(S, { type: "econ", team: "asan", token: tok("asan"), taxRes: -2, taxInd: -1, service: 2, incentive: 0 }, m * 100 + 3, BG).ok, "econ policy request accepted");
    const cash0 = Object.fromEntries(ids.map(id => [id, S.econ.cities[id].cash]));
    const res = C.run(S, BG, m * 100 + 50);
    const rep = res.econ;
    ok(rep && rep.month === m, `month ${m} econ report`);
    ids.forEach(id => { const f = rep.fiscal[id]; ok(Math.abs(f.cashBefore + f.revTotal - f.expTotal - f.cashAfter) < 0.01, `cash identity ${id} m${m}`); });
    const tot = ids.reduce((a, id) => a + S.econ.cities[id].pop, 0);
    ok(tot === S.econ.totals.pop, `pop conserved m${m}`);
    hist.push({ m, pop: Object.fromEntries(ids.map(id => [id, S.econ.cities[id].pop])), cash: Object.fromEntries(ids.map(id => [id, Math.round(S.econ.cities[id].cash)])), uns: Object.fromEntries(ids.map(id => [id, res.team[id].unsPct])), appr: Object.fromEntries(ids.map(id => [id, Math.round(S.econ.cities[id].approval)])), news: rep.news.slice(0, 3), mods: C.modsFor(S, R, "pyeongtaek") });
  }
  C.host(S, "next", 9999);
  ok(S.phase === "end", "ends after 12 months");
  const sz = JSON.stringify(C.publicView(S, 10000)).length;
  ok(sz < 400000, "snapshot size " + sz);
  out.hist = hist; out.score = KCP.econ.score(S.econ).rank.map(x => [x.name, x.score]);
  return out;
}
"""
with sync_playwright() as pw:
    br = pw.chromium.launch(); pg = br.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "#home"); pg.wait_for_timeout(500); pg.evaluate(AUTO)
    out = pg.evaluate(JS); br.close()
bad = [m for c, m in out["checks"] if not c]
print("checks", len(out["checks"]), "fail", len(bad)); [print("FAIL", m) for m in bad[:20]]
for h in out["hist"]: print(h["m"], h["pop"], h["cash"], h["uns"], h["appr"], h["news"][:2])
print("mods m12", out["hist"][-1]["mods"]); print("score", out["score"]); print("errors", errs)
