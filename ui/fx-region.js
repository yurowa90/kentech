/* 광역 지도 전용 그리기·배치. 모형·저장·전송 상태를 갖지 않는다. */
(function () {
  "use strict";
  const KCP = window.KCP;
  // 색 출처: build.js PAL(육지·강·호수), paintStatic의 바다 그라디언트.
  // 도시 지도는 승인 범위 밖이므로 고치지 않고 광역용 대응표를 이곳에 모은다.
  const terrain = Object.freeze({ "~": "#2378a0", b: "#e6d39e", p: "#84c060", f: "#5b9c4b",
    h: "#a8bd6c", m: "#9b9a8f", u: "#aeb4b6", r: "#3f8fc4", l: "#3a7fb8", g: "#9cc27a", ".": "#84c060", out: "#6d7a72" });
  const overlap = (a, b, gap = 3) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
  const layouts = new Map();
  function placeCards(cards, labels, bounds) {
    // 배율 1의 CSS px 입력. 확대는 호출부에서 결과에 곱하므로 탐색하지 않는다.
    // 부동소수점 확대/축소 오차만 없애며 크기·장애물·경계의 실제 변경은 키에 남긴다.
    const key = JSON.stringify([cards, labels, bounds], (_, v) => typeof v === "number" ? Math.round(v * 1e4) / 1e4 : v);
    if (layouts.has(key)) return layouts.get(key);
    const now = () => typeof performance === "undefined" ? Date.now() : performance.now();
    const deadline = now() + 12;
    let expired = false;
    const timedOut = () => expired || (expired = now() >= deadline);
    const pad = 4, gap = 4;
    const hard = labels.filter(l => !l.soft), soft = labels.filter(l => l.soft);
    // 큰 카드 우선. 동률은 원래 도시 순서로 고정한다.
    const order = cards.map((c, i) => ({ ...c, order: i })).sort((a, b) => b.width * b.height - a.width * a.height || a.order - b.order);
    const byCost = (a, b) => a.cost - b.cost || a.rect.y - b.rect.y || a.rect.x - b.rect.x;
    function candidates(card, full) {
      const result = [], seen = new Set();
      const maxX = bounds.width - pad - card.width, maxY = bounds.height - pad - card.height;
      if (maxX < pad || maxY < pad) return result;
      const add = (x, y) => {
        x = Math.max(pad, Math.min(maxX, x)); y = Math.max(pad, Math.min(maxY, y));
        const key = `${Math.round(x * 100)},${Math.round(y * 100)}`;
        if (seen.has(key)) return;
        seen.add(key);
        const rect = { id: card.id, x, y, width: card.width, height: card.height };
        if (hard.some(l => overlap(rect, l, gap))) return;
        const edge = Math.min(x - pad, maxX - x, y - pad, maxY - y);
        const waterCost = soft.reduce((sum, l) => sum + (overlap(rect, l, 0) ? card.width * card.height : 0), 0);
        result.push({ rect, edge, cost: (x + card.width / 2 - card.x) ** 2 + (y + card.height / 2 - card.y) ** 2 + waterCost });
      };
      // 중심 근처 여덟 방향 → 주변 띠 → 지도 전체 격자 및 경계.
      for (let ring = 1; ring <= 3; ring++) for (const [dx, dy] of [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1]]) {
        add(card.x - card.width / 2 + dx * (card.width / 2 + 14) * ring,
          card.y - card.height / 2 + dy * (card.height / 2 + 18) * ring);
      }
      for (const label of hard) if (card.x >= label.x && card.x <= label.x + label.width && card.y >= label.y && card.y <= label.y + label.height) {
        add(card.x - card.width / 2, label.y + label.height + gap);
        add(card.x - card.width / 2, label.y - card.height - gap);
        add(label.x - card.width - gap, card.y - card.height / 2);
        add(label.x + label.width + gap, card.y - card.height / 2);
      }
      if (!full) return result.sort(byCost);
      const step = Math.max(10, Math.min(card.width, card.height) / 3, Math.min(bounds.width, bounds.height) / 20);
      for (let y = pad; y <= maxY; y += step) {
        if (timedOut()) return [];
        for (let x = pad; x <= maxX; x += step) add(x, y);
        add(maxX, y);
      }
      for (let x = pad; x <= maxX; x += step) add(x, maxY);
      add(maxX, maxY);
      // 라벨 옆의 빈 띠는 격자보다 좁을 수 있어 실제 변도 후보로 쓴다.
      const xs = [pad, maxX], ys = [pad, maxY];
      for (const box of hard) {
        xs.push(box.x - card.width - gap, box.x + box.width + gap);
        ys.push(box.y - card.height - gap, box.y + box.height + gap);
      }
      for (const x of xs) {
        if (timedOut()) return [];
        for (const y of ys) add(x, y);
      }
      result.sort(byCost);
      return result;
    }
    // 가까운 방향·도시 이름표 가장자리로 먼저 배치한다. 넓은 지도도 전체 격자 없이 끝난다.
    let placed = [];
    for (const card of order) {
      const found = candidates(card, false).find(c => !placed.some(p => overlap(c.rect, p, gap)));
      if (!found || timedOut()) { placed = null; break; }
      placed.push(found.rect);
    }
    // 막힌 경우 도시별 전체 후보를 한 번만 생성·정렬. 재귀에서는 교차만 검사한다.
    const lists = [];
    if (!placed) for (const card of order) {
      if (timedOut()) break;
      lists.push(candidates(card, true));
    }
    let attempts = 0;
    function search(i, placed) {
      if (i === order.length) return placed;
      if (++attempts > 800 || timedOut()) return null;
      for (const { rect } of lists[i]) {
        if (placed.some(p => overlap(rect, p, gap))) continue;
        const found = search(i + 1, [...placed, rect]);
        if (found) return found;
        if (attempts > 800 || expired) break;
      }
      return null;
    }
    if (!placed) placed = !expired && lists.length === order.length && search(0, []);
    if (!placed && !timedOut()) {
      lists.forEach(list => list.sort((a, b) => a.edge - b.edge || a.cost - b.cost));
      attempts = 0; placed = search(0, []);
    }
    // 물리적으로 들어가지 않는 영역에서는 기존 도시 목록을 대안으로 둔다.
    const result = Object.freeze(placed ? cards.map(c => Object.freeze(placed.find(p => p.id === c.id))) : []);
    if (layouts.size >= 24) layouts.delete(layouts.keys().next().value);
    layouts.set(key, result);
    return result;
  }
  function newBuildCount(team, round, phase) {
    if (!team?.plan?.builds?.length) return 0;
    if (["lobby", "plan", "run"].includes(phase)) {
      const base = new Set((team.base || []).map(b => b.k));
      return team.plan.builds.filter(b => !base.has(`b:${b.t}:${b.i}`)).length;
    }
    // 운영 뒤에는 base가 갱신되므로 공개 건설 기록에서 확인되는 증가만 그린다.
    const previous = (team.hist || []).filter(h => h.r < round).at(-1);
    const current = (team.hist || []).filter(h => h.r === round).at(-1);
    return current && (previous || round === 1) ? Math.max(0, current.n - (previous?.n || 0)) : 0;
  }
  const legend = "번개 = 지난달 정전(0.05% 이상, 소수 1자리 표시가 0이 아닐 때) · ＋ = 이번 달 계획에 새 설비(계획 단계) / 지난달 설비 수 늘어남(결과 단계)";
  let last = null;
  function recordLayout(canvas, layout) {
    last = { canvas, ...Object.fromEntries(["cards", "names", "icons"].map(k => [k,
      (layout[k] || (last?.canvas === canvas ? last[k] : [])).map(b => ({ ...b }))])) };
  }
  function lastLayout() {
    if (!last) return null;
    // viewport CSS px. 스크롤·지도 이동 뒤에도 현재 캔버스 원점을 반영한다.
    const rect = last.canvas.getBoundingClientRect(), scale = rect.width / last.canvas.clientWidth;
    return Object.freeze(Object.fromEntries(["cards", "names", "icons"].map(k => [k, Object.freeze(last[k].map(b => Object.freeze({ ...b,
      x: rect.left + b.x * scale, y: rect.top + b.y * scale, width: b.width * scale, height: b.height * scale
    })))])));
  }
  KCP.fxRegion = { terrain, placeCards, newBuildCount, legend, recordLayout, lastLayout };
})();
