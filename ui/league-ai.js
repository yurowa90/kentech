/* 컴퓨터 도시(U3, ECON-GAMES A1). 호스트 상태를 읽고 사람과 같은 요청 자료만 만든다.
 * 호출 순서: plan → econ → ties(type을 tie 요청의 op로). 요청마다 reduce 결과를 확인한다.
 * S·R 불변, DOM·시계·비씨앗 난수 없음. buildGame의 지도 선택은 finally에서 복원한다.
 */
(function () {
  "use strict";
  const KCP = window.KCP;
  if (!KCP) return;

  // 통합 TODO: 소유 밖인 econ-data.js params로 이 항목들을 옮긴다.
  // 그 키가 있으면 아래 기본값보다 우선한다. 자료나 params를 여기서 수정하지 않는다.
  const DEFAULTS = {
    aiStyles: { v: {
      careful: { invest: 0.4, risk: 0, delay: 1 },
      balanced: { invest: 0.6, risk: 0.5, delay: 0 },
      bold: { invest: 0.85, risk: 1, delay: 0 }
    }, grade: "G", note: "A1 투자 몫·화력 선호(0..1)·결정 지연(달)" },
    aiRenewCredit: { v: 0.3, grade: "G", note: "계획용 재생 정격의 유효 공급 몫; 발전 보너스가 아님" },
    aiSupplyReserve: { v: 0.15, grade: "G", note: "최대 수요 위 공급 여유 목표" },
    aiStorageShare: { v: 0.35, grade: "G", note: "재생 정격 대비 저장 출력 목표 × (1-risk)" },
    aiLargeWeight: { v: 0.25, grade: "G", note: "risk에 따른 대형 설비 선호 가중" },
    aiRepairEvery: { v: 3, grade: "G", note: "연 계획 사이 보완 판단 주기(달)" },
    aiRepairInvest: { v: 0.15, grade: "G", note: "보완 때 연 투자 몫에 추가로 곱할 비율" },
    aiApprovalMargin: { v: 3, grade: "G", note: "평가 탈락 기준 위 선제 대응 여유(점)" },
    aiCashReserveMonths: { v: 3, grade: "G", note: "서비스 증액에 앞서 남길 기본 서비스 비용(달)" },
    aiTieValue: { v: 0.04, grade: "G", note: "정전 회피 1 MWh의 계획상 가치(억); 실제 수입에 가산하지 않음" },
    aiTieHours: { v: 120, grade: "G", note: "연계선 편익을 비교할 공급 부족 시간(시간)" }
  };
  const value = key => (KCP.ECON_DATA.params[key] || DEFAULTS[key]).v;
  const clone = x => JSON.parse(JSON.stringify(x));
  const assets = p => ({ builds: clone(p?.builds || []), lines: clone(p?.lines || []) });
  const clampStep = x => Math.max(-1, Math.min(1, Math.round(x || 0)));
  // 아래 수치는 조정 계수가 아닌 기존 프로토콜이다: 선 80칸 이하, 연계선 최소 2 MW.
  const LINE_MAX = 80, TIE_CAP = 2;

  function withMap(bg, R, id, fn) {
    const before = Object.entries(bg.PACKS).find(([, p]) =>
      p._bL?.tiles === bg.TILES || p._b?.tiles === bg.TILES);
    const mode = before?.[1]._bL?.tiles === bg.TILES ? "league" : undefined;
    const oldBLD = bg.BLD, hadPK = Object.hasOwn(bg, "PK");
    try {
      bg.selectPack(R.teams.find(t => t.id === id).pack, "league");
      return fn();
    } finally {
      if (before) bg.selectPack(before[0], mode);
      bg.BLD = oldBLD;
      if (!hadPK) delete bg.PK;
    }
  }

  // 여러 출발점에서 한 번 탐색한다. 선 비용은 지형 계수를 복제하지 않고 capex에서 읽는다.
  function routes(bg, roots) {
    const tiles = bg.TILES, dist = tiles.map(() => Infinity), prev = tiles.map(() => -1);
    const heap = [];
    const push = item => {
      let i = heap.length; heap.push(item);
      while (i) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= item[0]) break;
        heap[i] = heap[p]; i = p;
      }
      heap[i] = item;
    };
    const pop = () => {
      const first = heap[0], last = heap.pop();
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let c = i * 2 + 1;
          if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++;
          if (heap[c][0] >= last[0]) break;
          heap[i] = heap[c]; i = c;
        }
        heap[i] = last;
      }
      return first;
    };
    roots.forEach(i => { if (tiles[i] && !tiles[i].out) { dist[i] = 0; push([0, i]); } });
    const costs = [];
    while (heap.length) {
      const [d, u] = pop();
      if (d !== dist[u]) continue;
      tiles[u].nb.forEach(v => {
        if (tiles[v].out) return;
        if (costs[v] == null) costs[v] = bg.capex({ builds: [], lines: [{ p: [u, v] }] });
        const next = d + costs[v];
        if (next < dist[v]) { dist[v] = next; prev[v] = u; push([next, v]); }
      });
    }
    return { dist, path: i => {
      if (!Number.isFinite(dist[i])) return null;
      const p = [i];
      while (prev[p[0]] >= 0) p.unshift(prev[p[0]]);
      return p;
    } };
  }
  function addPath(plan, path) {
    // 구간 경계 한 칸을 공유하여 연결성을 유지한다.
    for (let i = 0; i < path.length - 1; i += LINE_MAX - 1)
      plan.lines.push({ p: path.slice(i, i + LINE_MAX) });
  }

  function supply(bg, S, id, plan) {
    const net = bg.network(plan), city = S.econ?.cities[id];
    const growth = city ? Math.max(city.pop / city.pop0, city.ind / city.ind0) : 1;
    const peak = bg.peakDemand({}, false) * growth;
    let firm = 0, renew = 0, storage = 0;
    net.nodes.filter(n => n.live).forEach(n => {
      const b = bg.BLD[n.kind];
      if (n.kind === "import" || n.kind === "town") return;
      if (n.cap) firm += n.cap;
      else if (b?.cls === "disp") firm += b.mw;
      else if (b?.cls === "ren") renew += b.mw;
      else if (b?.cls === "bat") storage += b.mw;
    });
    const gates = bg.SITES.filter(s => s.kind === "gridpt" && net.nodes.some(n =>
      n.tile === s.tile && n.comp >= 0 && net.comps.some(c =>
        c.towns.length && c.towns[0].comp === n.comp))).flatMap(s => s.to || []);
    return { peak, firm, renew, storage, gates, total: firm + renew * value("aiRenewCredit") };
  }

  function policy(S, id) {
    const c = S.econ?.cities[id], previous = S.teams[id].econPol || c?.policy || {};
    const p = { taxRes: clampStep(previous.taxRes), taxInd: clampStep(previous.taxInd),
      service: clampStep(previous.service), incentive: 0 };
    if (!c) return p;
    const floor = (c.approval0 ?? KCP.ECON_DATA.params.sat0.v) - KCP.ECON_DATA.params.approvalDrop.v;
    if (c.approval <= floor + value("aiApprovalMargin")) {
      p.taxRes = clampStep(p.taxRes - 1); p.taxInd = clampStep(p.taxInd - 1);
      p.service = clampStep(p.service + 1);
    } else if (c.cash < 0) {
      p.taxRes = clampStep(p.taxRes + 1); p.taxInd = clampStep(p.taxInd + 1);
    } else if (c.cash > c.pop * KCP.ECON_DATA.params.svcCost.v * value("aiCashReserveMonths")) {
      p.service = clampStep(p.service + 1);
    }
    return p;
  }

  function build(S, R, id, bg, style, plan) {
    const C = KCP.leagueCore, city = S.econ?.cities[id];
    if (city && city.cash < -city.debtCap) return plan;
    const rounds = C.roundsOf(S), turn = Math.max(1, S.round);
    const origin = rounds.slice(0, turn).reduce((a, rd, i) => rd.month === 1 ? i + 1 : a, 1);
    const age = turn - origin - style.delay;
    const previous = S.results?.[S.results.length - 1 - style.delay]?.team[id];
    const annual = age === 0;
    const repair = age > 0 && age % value("aiRepairEvery") === 0 && previous?.unsPct > R.goals.unsPct;
    if (!annual && !repair) return plan;
    const budget = C.budget(S, id), fixed = C.fixedOf(S, R, id) + C.lossOf(S.teams[id].base, plan);
    // 이번 달 재호출해도 투자 몫이 다시 생기지 않게 지난 운영의 확정 투자에서 센다.
    const committed = S.teams[id].committed ??
      (S.teams[id].base || []).reduce((sum, x) => sum + x.c, 0) + fixed;
    const extra = Math.max(0, budget - committed) * style.invest * (annual ? 1 : value("aiRepairInvest"));
    const cap = committed + extra - fixed;
    if (bg.capex(plan) >= cap) return plan;
    const types = Object.keys(bg.BLD).filter(t => ["ren", "disp", "bat"].includes(bg.BLD[t].cls));
    const used = new Set(plan.builds.map(b => b.i));
    const legal = Object.fromEntries(types.map(t => [t, bg.TILES.filter(x => !bg.siteRule(t, x)).map(x => x.i)]));
    const viable = types.filter(t => legal[t].some(i => !used.has(i)));
    if (!viable.length || !extra) return plan;
    const reserve = Math.min(...viable.filter(t => bg.BLD[t].cls !== "bat").map(t => bg.BLD[t].cost));
    const start = bg.SITES.find(s => s.kind === "plant") || bg.SITES.find(s => s.dem);
    if (!start) return plan;
    const roots = new Set([start.tile]);
    const existing = bg.network(plan), originNode = existing.nodes.find(n => n.tile === start.tile);
    if (originNode?.comp >= 0) {
      originNode.bf.dist.forEach((_, i) => roots.add(i));
      existing.nodes.filter(n => n.comp === originNode.comp).forEach(n => roots.add(n.tile));
    }
    // 기존 선도 별도 섬일 수 있다. 모든 설비·수요지·연결점을 같은 나무에 차례로 붙인다.
    const targets = new Set([...bg.SITES.map(s => s.tile), ...plan.builds.map(b => b.i)]);
    roots.forEach(i => targets.delete(i));
    while (targets.size) {
      const route = routes(bg, roots);
      const target = Array.from(targets).sort((a, b) => route.dist[a] - route.dist[b] || a - b)[0];
      targets.delete(target);
      const path = route.path(target);
      if (!path) continue;
      const candidate = assets(plan); addPath(candidate, path);
      // 기존 선과 똑같은 구간을 다시 사지 않는다.
      candidate.lines = candidate.lines.filter((line, i, all) =>
        all.findIndex(l => l.p.join(",") === line.p.join(",")) === i);
      if (bg.capex(candidate) <= cap - (plan.builds.length ? 0 : reserve)) {
        plan = candidate; path.forEach(i => roots.add(i));
      }
    }
    // 실제 연결된 선 전체를 출발점으로 쓴다.
    const connected = bg.network(plan);
    const anchor = connected.nodes.find(n => n.tile === start.tile);
    connected.nodes.filter(n => anchor && n.comp === anchor.comp && n.comp >= 0)
      .forEach(n => n.att.forEach(([i]) => roots.add(i)));
    const maxMW = Math.max(...viable.map(t => bg.BLD[t].mw));
    const seed = `${S.room}:${S.round}:${id}`;
    const have = supply(bg, S, id, plan);
    const reachesDemand = bg.SITES.some(s => s.dem && roots.has(s.tile));
    let route = routes(bg, roots);
    while (used.size < bg.TILES.length) {
      const storageNeed = have.renew * value("aiStorageShare") * (1 - style.risk) - have.storage;
      if (plan.builds.length && have.total >= have.peak * (1 + value("aiSupplyReserve")) && storageNeed <= 0) break;
      const candidates = [];
      viable.forEach(t => {
        const b = bg.BLD[t], battery = b.cls === "bat";
        const weight = battery ? (storageNeed > 0 ? 1 : 0) : b.cls === "ren" ? 1 - style.risk : style.risk;
        if (!weight) return;
        let best = null;
        legal[t].forEach(i => {
          if (used.has(i) || !Number.isFinite(route.dist[i])) return;
          const cost = bg.capex({ builds: [{ t, i }], lines: [] }) + route.dist[i];
          const rank = KCP.econ.hashStr(`${seed}:${t}:${i}`);
          if (!best || cost < best.cost || cost === best.cost && rank < best.rank) best = { t, i, cost, rank };
        });
        if (!best || bg.capex(plan) + best.cost > cap) return;
        const capacity = battery ? Math.min(storageNeed, b.mw) : Math.min(
          Math.max(0, have.peak * (1 + value("aiSupplyReserve")) - have.total),
          b.mw * (b.cls === "ren" ? value("aiRenewCredit") : 1));
        best.score = capacity * weight * (1 + style.risk * value("aiLargeWeight") * b.mw / maxMW) / best.cost;
        // 재생 설비 뒤 필요한 저장 한 기를 먼저 보완한다.
        best.storage = battery && storageNeed > 0;
        candidates.push(best);
      });
      candidates.sort((a, b) => Number(b.storage) - Number(a.storage) || b.score - a.score || a.rank - b.rank);
      const best = candidates[0];
      if (!best) break;
      const path = route.path(best.i);
      plan.builds.push({ t: best.t, i: best.i }); used.add(best.i);
      const extended = path.some(i => !roots.has(i));
      addPath(plan, path); path.forEach(i => roots.add(i));
      // 나무에 붙인 설비만 더하므로 매 기마다 전체 network를 재계산할 필요가 없다.
      if (reachesDemand) {
        const b = bg.BLD[best.t];
        if (b.cls === "ren") have.renew += b.mw;
        else if (b.cls === "bat") have.storage += b.mw;
        else have.firm += b.mw;
        have.total = have.firm + have.renew * value("aiRenewCredit");
      }
      if (extended) route = routes(bg, roots);
    }
    return plan;
  }

  function ties(S, R, id, bg, style, plan) {
    const C = KCP.leagueCore, own = supply(bg, S, id, plan), actions = [];
    let free = C.budget(S, id) - C.spendOf(bg, S, R, id, plan), reservedMW = 0;
    for (const def of R.ties.filter(t => t.a === id || t.b === id)) {
      const other = def.a === id ? def.b : def.a;
      if (!S.teams[other]) continue;
      const existing = S.ties.find(t => t.a === def.a && t.b === def.b);
      if (existing?.st === "built") continue;
      const cap = existing?.cap || TIE_CAP, half = C.tieCost(R, { ...def, cap }) / 2;
      const incoming = existing?.st === "prop" && existing.by !== id;
      const theirs = assets(S.teams[other].plan);
      const neighbor = withMap(bg, R, other, () => supply(bg, S, other, theirs));
      // 코어 비용 함수도 지도 선택을 하므로 외부 지도 문맥을 되돌린다.
      const otherFree = withMap(bg, R, other, () => C.budget(S, other) - C.spendOf(bg, S, R, other, theirs));
      const debtOK = [id, other].every(key => !S.econ?.cities[key] ||
        S.econ.cities[key].cash >= -S.econ.cities[key].debtCap);
      const linked = own.gates.includes(other) && neighbor.gates.includes(id);
      const delivered = Math.min(cap, Math.max(0, neighbor.total - neighbor.peak)) * (1 - C.TIE_LOSS);
      const gain = Math.min(Math.max(0, own.peak - own.total - reservedMW), delivered);
      const benefit = gain * value("aiTieHours") * (value("aiTieValue") - S.teams[other].price);
      const affordable = debtOK && free >= half && otherFree >= half;
      if (incoming) {
        const accept = linked && affordable && benefit > half;
        actions.push({ type: accept ? "accept" : "cancel", other, cap });
        if (accept) { free -= half; reservedMW += gain; }
      } else if (style.risk === value("aiStyles").bold.risk && !existing && linked && affordable) {
        const exportGain = Math.min(cap * (1 - C.TIE_LOSS), Math.max(0, own.total - own.peak),
          Math.max(0, neighbor.peak - neighbor.total));
        if (benefit > half || exportGain * value("aiTieHours") * value("aiTieValue") > half) {
          actions.push({ type: "propose", other, cap }); free -= half;
        }
      }
    }
    return actions;
  }

  function plan(S, R, id, bg, style) {
    if (!S.teams[id] || !R.teams.some(t => t.id === id)) throw new Error("AI: 참가 도시가 아닙니다");
    const styles = value("aiStyles"), selected = typeof style === "string" ? styles[style] : style;
    const chosen = selected || styles.balanced;
    if (!(chosen.invest >= 0 && chosen.invest <= 1 && chosen.risk >= 0 && chosen.risk <= 1 &&
      Number.isInteger(chosen.delay) && chosen.delay >= 0)) throw new Error("AI: 성향 값 범위를 확인하세요");
    return withMap(bg, R, id, () => {
      const original = assets(S.teams[id].plan);
      const result = build(S, R, id, bg, chosen, original);
      return { plan: result, econPol: policy(S, id), ties: ties(S, R, id, bg, chosen, result) };
    });
  }
  KCP.leagueAI = { plan, get STYLES() { return clone(value("aiStyles")); } };
})();
