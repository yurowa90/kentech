"""컴퓨터 도시 6곳 × 12달. --node로 실제 엔진 호스트 검사, URL로 브라우저 계약 검사."""
import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

# AST로 추출하여 node --check 가능. 기대값은 U3·GAMES A1·leagueCore 계약에서 정한다.
JS = r"""
({months = 12} = {}) => {
  const C = KCP.leagueCore, bg = KCP.buildGame, AI = KCP.leagueAI;
  const R = C.regionOf("south"), ids = R.teams.map(t => t.id);
  const clone = x => JSON.parse(JSON.stringify(x)), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const empty = () => ({builds: [], lines: []});
  const checks = [], runs = [], timings = [], snapshots = {};
  let acceptanceCase;
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
    const input = frozen(clone(S)), region = frozen(clone(R)), before = JSON.stringify(S), regionBefore = JSON.stringify(R), random = Math.random;
    const priorTiles = bg.TILES, priorBLD = bg.BLD;
    let answer, elapsed;
    try {
      Math.random = () => { throw new Error("씨앗 없는 난수 호출"); };
      const start = performance.now(); answer = AI.plan(input, region, id, bg, style);
      elapsed = performance.now() - start;
      ok(same(answer, AI.plan(input, region, id, bg, style)), `${style}/${id}/${S.round} 결정성`);
    } finally { Math.random = random; }
    timings.push(elapsed);
    ok(elapsed < 1000, `${style}/${id}/${S.round} plan < 1초 (${elapsed.toFixed(1)}ms)`);
    ok(before === JSON.stringify(S) && before === JSON.stringify(input) && regionBefore === JSON.stringify(region) && regionBefore === JSON.stringify(R), `${style}/${id}/${S.round} 입력 불변`);
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
    const S = newGame(), row = {style, cities: {}, tieRequests: 0, tieAccepted: 0, tradedMWh: 0, maxMs: 0};
    ids.forEach(id => { row.cities[id] = {name: R.teams.find(t => t.id === id).name, uns: [], ren: [], invested: [], policies: [], tieAccepted: 0, builds: 0, types: {}}; });
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
          // 작업 M: 안전 공급은 지연·투자 몫보다 우선. 선택 투자의 지연만 유지한다.
          if (month === 1) {
            bg.selectPack(R.teams.find(t => t.id === id).pack, "league");
            const net = bg.network(answer.plan);
            const firm = sum(net.nodes.filter(n => n.live && n.kind !== "import" && n.kind !== "town")
              .map(n => n.cap || (bg.BLD[n.kind]?.cls === "disp" ? bg.BLD[n.kind].mw : 0)));
            ok(firm > bg.peakDemand({}, false), `${style}/${id} 첫 달 확정 공급 > 피크`);
            if (style === "careful") ok(!answer.plan.builds.some(b => ["ren", "bat"].includes(bg.BLD[b.t].cls)),
              `${style}/${id} 첫 달 선택 투자 지연`);
          }
          row.cities[id].invested.push(Math.max(0, spent - (S.teams[id].committed || 0)));
          row.cities[id].policies.push(answer.econPol);
        }
        const saved = clone(answer.plan);
        const rp = request(S, id, {type: "plan", rev: S.teams[id].rev + 1, plan: answer.plan});
        ok(rp.ok && same(saved, {builds: S.teams[id].plan?.builds, lines: S.teams[id].plan?.lines}),
          `${style}/${id}/${month} reduce plan: ${rp.err || "ok"}`);
        ok(request(S, id, {type: "econ", ...answer.econPol}).ok, `${style}/${id}/${month} reduce econ`);
        for (const t of answer.ties) {
          if (t.type === "accept" && !acceptanceCase) acceptanceCase = {S: clone(S), id, other: t.other, style};
          const r = request(S, id, {type: "tie", op: t.type, other: t.other, cap: t.cap});
          if (r.ok && t.type === "accept") { row.tieAccepted++; row.cities[id].tieAccepted++; }
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
        row.cities[id].ren.push(result.team[id].renPct);
        row.tradedMWh += result.team[id].imp || 0;
      });
    }
    ok(C.host(S, "next", months + 1) && S.phase === "end", `${style} ${months}달 완료`);
    row.maxMs = Math.max(0, ...timings.slice(timingStart));
    ids.forEach(id => {
      const city = row.cities[id], plan = S.teams[id].plan;
      city.unsPct = sum(city.uns) / months; city.renPct = sum(city.ren) / months; city.builds = plan.builds.length;
      city.types = plan.builds.reduce((a, b) => { a[b.t] = (a[b.t] || 0) + 1; return a; }, {});
      if (style !== "nothing") {
        ok(city.builds > 0, `${style}/${id} 설비 수 > 0`);
        ok(city.unsPct <= 5, `${style}/${id} 평균 정전 ≤ 5%: ${city.unsPct}`);
        ok(city.ren.every(Number.isFinite), `${style}/${id} 재생 비중 유한 값`);
      }
    });
    runs.push(row);
  }
  const baseline = runs.find(r => r.style === "nothing");
  runs.filter(r => r !== baseline).forEach(run => ids.forEach(id =>
    ok(run.cities[id].unsPct < baseline.cities[id].unsPct, `${run.style}/${id} 무행동보다 정전 감소`)));
  const byStyle = Object.fromEntries(runs.map(r => [r.style, r]));
  ids.forEach(id => {
    const safe = byStyle.careful.cities[id], mix = byStyle.balanced.cities[id], bold = byStyle.bold.cities[id];
    ok(safe.renPct > mix.renPct && mix.renPct > bold.renPct,
      `${id} 실제 발전 재생 비중 신중 > 균형 > 공격: ${safe.renPct}/${mix.renPct}/${bold.renPct}`);
    ok(safe.types.battery > (bold.types.battery || 0), `${id} 신중 저장 > 공격 저장`);
    ok(safe.invested[1] > 0 && bold.invested[0] > 0, `${id} 신중 2월 선택 투자·공격 1월 투자`);
  });
  ok(new Set(runs.filter(r => r !== baseline).map(r => JSON.stringify(Object.values(r.cities).map(c => c.types)))).size === 3,
    "성향별 실제 설비 구성 차이");
  ok(byStyle.bold.tieAccepted > 0, `${months}달 정상 게임: 공격 선제 제안에 수락 ${byStyle.bold.tieAccepted}건`);
  ok(byStyle.bold.tradedMWh > 0, "수락한 연계선으로 실제 전력 거래 발생");

  // 지지율·현금·부채 입력에 대한 반응. 보완 달이 아닌 3월에 시험한다.
  const policyCase = clone(snapshots.balanced), id = ids[0]; policyCase.round = 3;
  policyCase.teams[id].econPol = {taxRes: 0, taxInd: 0, service: 0, incentive: 0};
  let city = policyCase.econ.cities[id];
  city.cash = 10000;
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

  // 같은 공개 재정 상태에서 성향별 정책 차이와 비축 대응을 확인한다.
  policyCase.round = 3; city.cash = 10000; city.approval = 100;
  const policies = ["careful", "balanced", "bold"].map(style => calculate(policyCase, id, style).econPol);
  ok(policies[0].taxRes > policies[1].taxRes && policies[1].taxRes > policies[2].taxRes,
    "동일 현금: 신중 > 균형 > 공격 세율");
  ok(policies[0].service < policies[2].service, "동일 현금: 신중 < 공격 서비스");
  city.cash = 0;
  const tight = calculate(policyCase, id, "careful").econPol;
  ok(tight.taxRes === 1 && tight.taxInd === 1 && tight.service === 0, "신중: 비축 부족이면 증세·서비스 유지");

  // 현금·설비를 주입하지 않고 정상 12달 게임의 수락 직전 상태를 재현한다.
  ok(!!acceptanceCase, "정상 게임에서 연계선 수락 사례 확보");
  if (acceptanceCase) {
    const {S: tieCase, id: receiver, other: supplier, style} = acceptanceCase;
    for (const responseStyle of ["careful", "balanced", "bold"]) {
      const answer = calculate(tieCase, receiver, responseStyle);
      ok(answer.ties.some(t => t.other === supplier && t.type === "accept"),
        `${responseStyle}: 정상 공급 도시도 비용 절감·판매 이익으로 수락`);
    }
    const disconnected = clone(tieCase); disconnected.teams[supplier].plan = empty();
    ok(calculate(disconnected, receiver, style).ties.some(t => t.other === supplier && t.type === "cancel"),
      "연결되지 않은 공급 제안 거절");
    const poor = clone(tieCase); poor.econ.cities[supplier].cash = -poor.econ.cities[supplier].debtCap - 1;
    ok(calculate(poor, receiver, style).ties.some(t => t.other === supplier && t.type === "cancel"), "상대 부채 한도 초과 제안 거절");
    const expensive = clone(tieCase); expensive.teams[supplier].price = C.PRICE.max;
    expensive.teams[receiver].price = C.PRICE.max;
    ok(calculate(expensive, receiver, style).ties.some(t => t.other === supplier && t.type === "cancel"),
      "양쪽 단가가 비싸고 정전도 없으면 수락 거절");
  }
  return {checks, runs, maxMs: Math.max(...timings), planCalls: timings.length, months, cities: ids.length};
}
"""


def node_check(months):
    # build.js의 화면 등록만 비활성화한다. 지도·수요·발전·경제·요청 처리는 원본 전체를 읽는다.
    runner = r"""
const fs = require('node:fs'), vm = require('node:vm');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
global.window = global;
global.document = {documentElement: {}};
global.KCP = {route() {}, on() {}, esc: x => x};
for (const name of ['build-maps', 'build', 'econ-data', 'econ', 'league-data', 'league-core', 'league-ai']) {
  const file = `ui/${name}.js`;
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), {filename: file});
}
const out = vm.runInThisContext(`(${input.js})`)({months: input.months});
out.checks.push([!/Math\s*\.\s*random\s*\(/.test(fs.readFileSync('ui/league-ai.js', 'utf8')), 'AI 소스 Math.random 호출 없음']);
process.stdout.write(JSON.stringify(out));
"""
    result = subprocess.run(["node", "-e", runner], cwd=Path(__file__).resolve().parents[2],
                            input=json.dumps({"js": JS, "months": months}),
                            text=True, capture_output=True, check=True, timeout=180)
    if result.stderr:
        raise RuntimeError(result.stderr)
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", nargs="?", default="http://127.0.0.1:9430/index.html")
    parser.add_argument("--node", action="store_true", help="브라우저 없이 원본 엔진 실행")
    parser.add_argument("--months", type=int, choices=(12, 36), default=12)
    args = parser.parse_args()
    out = {"checks": [], "runs": []}
    errors = []
    try:
        if args.node:
            out = node_check(args.months)
        else:
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
                    out = page.evaluate(JS, {"months": args.months})
                    out["scriptInjected"] = injected
                finally:
                    browser.close()
    except Exception as exc:
        errors.append(f"실행 예외: {exc}")
    error_label = "Node 실행" if args.node else "페이지·콘솔·실행"
    out["checks"].append([not errors, f"{error_label} 오류 {len(errors)}개"])
    out["checks"].extend([[False, message] for message in errors])
    for run in out["runs"]:
        print(f"{run['style']}: 최대 계획 {run['maxMs']:.1f}ms, 연계선 수락 {run['tieAccepted']}건 / 응답 {run['tieRequests']}건, 대표 주 거래 합계 {run['tradedMWh']:.2f} MWh")
        for city in run["cities"].values():
            print(f"  {city['name']}: 정전 평균 {city['unsPct']:.2f}%, 재생 평균 {city['renPct']:.2f}%, 수락 {city['tieAccepted']}건, 설비 {city['builds']}개 {city['types']}")
    failed = [message for passed, message in out["checks"] if not passed]
    for message in failed:
        print(f"FAIL {message}")
    if out.get("scriptInjected"):
        print("AI 파일 직접 주입: index.html 연결 여부는 별도 통합 검사 필요")
    if out.get("planCalls"):
        print(f"계획 {out['planCalls']}회, 최대 {out['maxMs']:.1f}ms")
    print(f"checks {len(out['checks'])} pass {len(out['checks']) - len(failed)} fail {len(failed)}")
    # 소유 파일 외 결과 파일을 만들지 않고 요약을 표준 출력으로만 남긴다.
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
