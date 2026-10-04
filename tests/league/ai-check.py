"""컴퓨터 도시 6곳 × 12달. 실행은 로컬 총괄 담당, 화면 클릭 없이 호스트 계약 검사."""
import argparse
from pathlib import Path
from urllib.parse import urlsplit

# AST로 추출하여 node --check 가능. 기대값은 U3·GAMES A1·leagueCore 계약에서 정한다.
JS = r"""
() => {
  const C = KCP.leagueCore, bg = KCP.buildGame, AI = KCP.leagueAI;
  const R = C.regionOf("south"), ids = R.teams.map(t => t.id), months = 12;
  const clone = x => JSON.parse(JSON.stringify(x)), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const empty = () => ({builds: [], lines: []});
  const checks = [], runs = [], timings = [], snapshots = {};
  const ok = (pass, message) => checks.push([!!pass, message]);
  const sum = xs => xs.reduce((a, b) => a + b, 0);
  const request = (S, id, msg) => C.reduce(S, {team: id, token: `ai-test-${id}`, ...msg}, S.round, bg);
  const newGame = () => {
    const S = C.newState("ai-check-common", R.id, 0, ids, {turns: months});
    ids.forEach(id => ok(request(S, id, {type: "claim"}).ok, `claim ${id}`));
    return S;
  };
  const frozen = x => {
    if (x && typeof x === "object" && !Object.isFrozen(x)) {
      Object.values(x).forEach(frozen); Object.freeze(x);
    }
    return x;
  };
  const calculate = (S, id, style) => {
    const input = frozen(clone(S)), before = JSON.stringify(S), random = Math.random;
    const priorTiles = bg.TILES, priorBLD = bg.BLD;
    let answer, elapsed;
    try {
      Math.random = () => { throw new Error("씨앗 없는 난수 호출"); };
      const start = performance.now(); answer = AI.plan(input, R, id, bg, style);
      elapsed = performance.now() - start;
      ok(same(answer, AI.plan(input, R, id, bg, style)), `${style}/${id}/${S.round} 결정성`);
    } finally { Math.random = random; }
    timings.push(elapsed);
    ok(elapsed < 1000, `${style}/${id}/${S.round} plan < 1초 (${elapsed.toFixed(1)}ms)`);
    ok(before === JSON.stringify(S) && before === JSON.stringify(input), `${style}/${id}/${S.round} 입력 불변`);
    ok(bg.TILES === priorTiles && bg.BLD === priorBLD, `${style}/${id}/${S.round} 지도 선택 복원`);
    ok(same(Object.keys(answer).sort(), ["econPol", "plan", "ties"]), "반환 최상위 계약");
    ok(same(Object.keys(answer.plan).sort(), ["builds", "lines"]), "반환 계획 계약");
    ok(["taxRes", "taxInd", "service"].every(k => Number.isInteger(answer.econPol[k]) &&
      answer.econPol[k] >= -1 && answer.econPol[k] <= 1) && answer.econPol.incentive === 0, "경제 정책 −1..+1, 보조 0");
    ok(answer.ties.every(t => ["propose", "accept", "cancel"].includes(t.type) &&
      ids.includes(t.other) && t.other !== id && [2, 4].includes(t.cap)), "연계선 반환 계약");
    return answer;
  };
  ok(ids.length === 6, "6도시 모두 참가");
  ok(same(Object.keys(AI.STYLES).sort(), ["balanced", "bold", "careful"]), "세 성향 공개");
  for (const [name, invest, delay] of [["careful", 0.4, 1], ["balanced", 0.6, 0], ["bold", 0.85, 0]]) {
    const style = AI.STYLES[name];
    ok(style.invest === invest && style.delay === delay && same(Object.keys(style).sort(), ["delay", "invest", "risk"]), `${name} A1 성향 값`);
  }
  ok(AI.STYLES.careful.risk < AI.STYLES.balanced.risk && AI.STYLES.balanced.risk < AI.STYLES.bold.risk,
    "careful < balanced < bold 위험 선호");

  for (const style of ["nothing", "careful", "balanced", "bold"]) {
    const S = newGame(), row = {style, cities: {}, tieRequests: 0, maxMs: 0};
    ids.forEach(id => { row.cities[id] = {name: R.teams.find(t => t.id === id).name, uns: [], builds: 0, types: {}}; });
    const timingStart = timings.length;
    for (let month = 1; month <= months; month++) {
      ok(C.host(S, "next", month) && S.round === month && S.phase === "plan", `${style}/${month} host next`);
      for (const id of ids) {
        const old = clone(S.teams[id].plan || empty());
        const answer = style === "nothing" ? {plan: empty(), econPol: {taxRes: 0, taxInd: 0, service: 0, incentive: 0}, ties: []} : calculate(S, id, style);
        const budget = C.budget(S, id), spent = C.spendOf(bg, S, R, id, answer.plan);
        const city = S.econ.cities[id], debtOver = city.cash < -city.debtCap;
        // SPEC 5절: 한도 초과 때 기존 자산 유지 예외. 새 투자에 예외를 주지 않는다.
        ok(spent <= budget + 1e-6 || debtOver && same(answer.plan, {builds: old.builds, lines: old.lines}),
          `${style}/${id}/${month} 예산 ${spent}/${budget}`);
        const clean = C.cleanPlan(bg, R, id, answer.plan,
          debtOver ? C.capexOf(bg, R, id, old) : budget - C.fixedOf(S, R, id) - C.lossOf(S.teams[id].base, answer.plan));
        ok(same(answer.plan, {builds: clean.builds, lines: clean.lines}), `${style}/${id}/${month} cleanPlan 무손실`);
        if (style !== "nothing") {
          const priorKeys = [...old.builds.map(b => C.itemKey("b", b)), ...old.lines.map(l => C.itemKey("l", l))];
          const nextKeys = new Set([...answer.plan.builds.map(b => C.itemKey("b", b)), ...answer.plan.lines.map(l => C.itemKey("l", l))]);
          ok(priorKeys.every(k => nextKeys.has(k)), `${style}/${id}/${month} 기존 설비·선 유지`);
          const age = month - 1 - AI.STYLES[style].delay;
          const prev = S.results[S.results.length - 1 - AI.STYLES[style].delay]?.team[id];
          const scheduled = age === 0 || age > 0 && age % 3 === 0 && prev?.unsPct > R.goals.unsPct;
          if (!scheduled) ok(same(answer.plan, {builds: old.builds, lines: old.lines}), `${style}/${id}/${month} 비투자 달 계획 유지`);
          if (month === 1) ok(style === "careful" ? !answer.plan.builds.length : answer.plan.builds.length > 0,
            `${style}/${id} 첫 달 지연`);
          if (scheduled && !debtOver) {
            const committed = S.teams[id].committed || 0;
            const limit = committed + Math.max(0, budget - committed) * AI.STYLES[style].invest * (age === 0 ? 1 : 0.15);
            ok(spent <= Math.max(limit, C.spendOf(bg, S, R, id, old)) + 1e-6, `${style}/${id}/${month} 투자 몫 제한`);
          }
        }
        const saved = clone(answer.plan);
        const rp = request(S, id, {type: "plan", rev: S.teams[id].rev + 1, plan: answer.plan});
        ok(rp.ok && same(saved, {builds: S.teams[id].plan?.builds, lines: S.teams[id].plan?.lines}),
          `${style}/${id}/${month} reduce plan: ${rp.err || "ok"}`);
        ok(request(S, id, {type: "econ", ...answer.econPol}).ok, `${style}/${id}/${month} reduce econ`);
        for (const t of answer.ties) {
          const r = request(S, id, {type: "tie", op: t.type, other: t.other, cap: t.cap});
          row.tieRequests++;
          ok(r.ok, `${style}/${id}/${month} reduce tie ${t.type}: ${r.err || "ok"}`);
        }
      }
      if (month === 1) snapshots[style] = clone(S);
      const result = C.run(S, bg, month);
      ok(!!result?.econ && S.phase === "review", `${style}/${month} host 운영·경제 보고서`);
      ids.forEach(id => {
        const uns = result?.team[id]?.unsPct;
        ok(Number.isFinite(uns), `${style}/${id}/${month} 유한 정전 값`);
        row.cities[id].uns.push(uns);
      });
    }
    ok(C.host(S, "next", months + 1) && S.phase === "end", `${style} 12달 완료`);
    row.maxMs = Math.max(0, ...timings.slice(timingStart));
    ids.forEach(id => {
      const city = row.cities[id], plan = S.teams[id].plan;
      city.unsPct = sum(city.uns) / months; city.builds = plan.builds.length;
      city.types = plan.builds.reduce((a, b) => { a[b.t] = (a[b.t] || 0) + 1; return a; }, {});
      if (style !== "nothing") ok(city.builds > 0, `${style}/${id} 설비 수 > 0`);
    });
    runs.push(row);
  }
  const baseline = runs.find(r => r.style === "nothing");
  runs.filter(r => r !== baseline).forEach(run => ids.forEach(id =>
    ok(run.cities[id].unsPct < baseline.cities[id].unsPct, `${run.style}/${id} 무행동보다 정전 감소`)));
  const countType = (style, type) => sum(Object.values(runs.find(r => r.style === style).cities).map(c => c.types[type] || 0));
  ok(countType("bold", "diesel") > countType("careful", "diesel"), "공격 성향 디젤 증가");
  ok(countType("careful", "battery") > countType("bold", "battery"), "신중 성향 저장 증가");
  ok(new Set(runs.filter(r => r !== baseline).map(r => JSON.stringify(Object.values(r.cities).map(c => c.types)))).size === 3,
    "성향별 실제 설비 구성 차이");

  // 지지율·현금·부채 입력에 대한 반응. 보완 달이 아닌 3월에 시험한다.
  const policyCase = clone(snapshots.balanced), id = ids[0]; policyCase.round = 3;
  policyCase.teams[id].econPol = {taxRes: 0, taxInd: 0, service: 0, incentive: 0};
  let city = policyCase.econ.cities[id];
  city.approval = city.approval0 - KCP.ECON_DATA.params.approvalDrop.v;
  let answer = calculate(policyCase, id, "balanced");
  ok(answer.econPol.taxRes === -1 && answer.econPol.taxInd === -1 && answer.econPol.service === 1, "낮은 지지율: 감세·서비스 증가");
  city.approval = 100; city.cash = -1;
  answer = calculate(policyCase, id, "balanced");
  ok(answer.econPol.taxRes === 1 && answer.econPol.taxInd === 1, "빚: 세율 증가");
  city.cash = 10000;
  ok(calculate(policyCase, id, "balanced").econPol.service === 1, "충분한 현금: 서비스 증가");
  policyCase.round = 1; city.cash = -city.debtCap - 1;
  answer = calculate(policyCase, id, "bold");
  ok(same(answer.plan, {builds: policyCase.teams[id].plan.builds, lines: policyCase.teams[id].plan.lines}), "부채 한도 초과: 자산 유지");

  // 연계선 수락 장치: 기존 발전소가 없는 수요 도시와 발전소가 있는 이웃을 자료에서 찾는다.
  const hasPlant = id => KCP.BUILD_MAPS[R.teams.find(t => t.id === id).pack].sites.some(s => s.kind === "plant");
  const def = R.ties.find(t => hasPlant(t.a) !== hasPlant(t.b));
  const supplier = hasPlant(def.a) ? def.a : def.b, receiver = supplier === def.a ? def.b : def.a;
  const tieCase = clone(snapshots.balanced); tieCase.round = 3; tieCase.ties = [];
  ids.forEach(id => { tieCase.econ.cities[id].cash = 10000; });
  tieCase.teams[receiver].plan.builds = [];
  bg.selectPack(R.teams.find(t => t.id === supplier).pack, "league");
  const producer = tieCase.teams[supplier].plan;
  const root = bg.SITES.find(s => s.kind === "plant").tile, used = new Set(producer.builds.map(b => b.i));
  // 인위적으로 충분한 공급을 만든 검사용 장치. 게임 AI의 계획에는 주입하지 않는다.
  for (const tile of bg.TILES.filter(t => !used.has(t.i) && !bg.siteRule("diesel", t)).slice(0, 20)) {
    const p = bg.routePath(root, tile.i);
    if (p && p.length > 1 && p.length <= 80) { producer.builds.push({t: "diesel", i: tile.i}); producer.lines.push({p}); }
  }
  answer = calculate(tieCase, supplier, "bold");
  ok(answer.ties.some(t => t.type === "propose" && t.other === receiver), "공격 성향: 유익한 연계선 먼저 제안");
  ok(request(tieCase, supplier, {type: "tie", op: "propose", other: receiver, cap: 2}).ok, "연계선 수락 장치 제안");
  answer = calculate(tieCase, receiver, "balanced");
  const acceptance = answer.ties.find(t => t.other === supplier);
  ok(acceptance?.type === "accept", "공급 여유·연결점·편익을 가진 제안 수락");
  const disconnected = clone(tieCase); disconnected.teams[supplier].plan = empty();
  ok(calculate(disconnected, receiver, "balanced").ties.some(t => t.other === supplier && t.type === "cancel"),
    "연결되지 않은 공급 제안 거절");
  const poor = clone(tieCase); poor.econ.cities[supplier].cash = -poor.econ.cities[supplier].debtCap - 1;
  ok(calculate(poor, receiver, "balanced").ties.some(t => t.other === supplier && t.type === "cancel"), "상대 부채 한도 초과 제안 거절");
  if (acceptance) ok(request(tieCase, receiver, {type: "tie", op: acceptance.type, other: supplier, cap: acceptance.cap}).ok,
    "연계선 응답 실제 reduce 통과");
  return {checks, runs, maxMs: Math.max(...timings), planCalls: timings.length, months, cities: ids.length};
}
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", nargs="?", default="http://127.0.0.1:9430/index.html")
    args = parser.parse_args()
    out = {"checks": [], "runs": []}
    errors = []
    try:
        parsed = urlsplit(args.url)
        if parsed.scheme not in ("http", "https") or parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
            raise ValueError("로컬 서버 주소만 허용합니다")
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            try:
                page = browser.new_page(service_workers="block")

                def local_only(route):
                    url = urlsplit(route.request.url)
                    if url.hostname in ("127.0.0.1", "localhost", "::1") or url.scheme in ("data", "blob"):
                        route.continue_()
                    elif url.hostname == "fonts.googleapis.com" and route.request.resource_type == "stylesheet":
                        route.fulfill(status=200, content_type="text/css", body="")
                    else:
                        errors.append(f"금지된 외부 요청 차단: {url.hostname}")
                        route.abort()

                page.route("**/*", local_only)
                page.on("pageerror", lambda e: errors.append(f"페이지 오류: {e}"))
                page.on("console", lambda m: errors.append(f"콘솔 {m.type}: {m.text}")
                        if m.type in ("error", "warning") else None)
                page.goto(args.url.split("#")[0] + "#home")
                page.wait_for_function("!!(window.KCP && KCP.leagueCore && KCP.buildGame && KCP.econ)")
                # index.html 연결은 다른 작업 소유. 미연결 상태도 파일 자체는 검사한다.
                injected = not page.evaluate("!!KCP.leagueAI")
                if injected:
                    page.add_script_tag(path=str(Path(__file__).resolve().parents[2] / "ui" / "league-ai.js"))
                out = page.evaluate(JS)
                out["scriptInjected"] = injected
            finally:
                browser.close()
    except Exception as exc:
        errors.append(f"실행 예외: {exc}")
    out["checks"].append([not errors, f"페이지·콘솔·실행 오류 {len(errors)}개"])
    out["checks"].extend([[False, message] for message in errors])
    for run in out["runs"]:
        print(f"{run['style']}: 최대 계획 {run['maxMs']:.1f}ms, 연계선 응답 {run['tieRequests']}건")
        for city in run["cities"].values():
            print(f"  {city['name']}: 정전 평균 {city['unsPct']:.2f}%, 설비 {city['builds']}개 {city['types']}")
    failed = [message for passed, message in out["checks"] if not passed]
    for message in failed:
        print(f"FAIL {message}")
    if out.get("scriptInjected"):
        print("AI 파일 직접 주입: index.html 연결 여부는 별도 통합 검사 필요")
    print(f"checks {len(out['checks'])} pass {len(out['checks']) - len(failed)} fail {len(failed)}")
    # 소유 파일 외 결과 파일을 만들지 않고 요약을 표준 출력으로만 남긴다.
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
