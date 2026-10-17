/* 달 끝 연출: 엔진 자료 또는 기기 안 재계산을 재생한다. 저장·전송 없음(D-65). */
(function () {
  "use strict";
  const KCP = window.KCP;
  if (!KCP) return;
  let status = { playing: false, skipped: false, ms: 0, replayed: false, cardsOpen: false,
    source: null, fallback: null, recomputeMs: 0 };
  let layer = null, toast = null, deck = null, timers = [], off = [], raf = 0, layoutRaf = 0, epoch = 0;
  let lastMonth = null, advanceSummary = null;
  const reduced = () => KCP.v2?.reduced?.() ?? !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const threshold = dem => Math.max(0.005, 0.02 * dem);
  const sum = values => values.reduce((total, value) => total + value, 0);
  // 표시 규칙(G): 시간별 거래를 추정하지 않고 공개된 도시 합계·정전 시간에 표시값을 맞춘다.
  function calibrate(u, dem, U, N) {
    if (!Number.isFinite(U) || U < 0 || !Number.isInteger(N) || N < 0 || N > u.length) return null;
    const count = r => r.reduce((n, value, k) => n + (value > threshold(dem[k]) ? 1 : 0), 0);
    if (Math.abs(U - sum(u)) <= 0.01 && count(u) === N) return u.slice();
    const O = Array.from(u.keys()).filter(k => u[k] > 0).sort((a, b) => u[b] - u[a] || a - b).slice(0, N);
    if (O.length !== N) return null;
    const r = new Float64Array(u.length), selectedSum = O.reduce((s, k) => s + u[k], 0);
    const floor = k => threshold(dem[k]) * 1.001;
    O.forEach(k => { r[k] = u[k] * U / selectedSum; });
    for (let pass = 0; pass < 20; pass++) {
      const low = O.filter(k => r[k] <= threshold(dem[k]));
      if (!low.length) break;
      let extra = 0;
      low.forEach(k => { extra += floor(k) - r[k]; r[k] = floor(k); });
      const donors = O.filter(k => r[k] > threshold(dem[k]));
      const slack = donors.reduce((s, k) => s + r[k] - threshold(dem[k]), 0);
      if (slack <= extra) return null;
      donors.forEach(k => { r[k] -= (r[k] - threshold(dem[k])) * extra / slack; });
    }
    return Math.abs(sum(r) - U) <= 0.01 && count(r) === N ? r : null;
  }
  function recomputeReplay(V, res, id) {
    // 검사용 (round, id)도 같은 계산 경로다. 재생·DOM·소리는 조작하지 않는다.
    const inspect = typeof V === "number";
    if (inspect) {
      const round = V, session = KCP.league?.state?.();
      id = res; V = session?.snap || session?.S;
      res = V?.results?.find(r => r.round === round);
    }
    const started = performance.now();
    status.fallback = null;
    try {
      const raw = V && res && KCP.league?.uiMath?.replaySimulation(V, res, id), team = res?.team?.[id];
      if (!raw || !team) { status.fallback = "unavailable"; return null; }
      const u = new Float64Array(raw.H);
      for (let k = 0; k < raw.H; k++) {
        for (let ti = 0; ti < raw.NT; ti++) u[k] += raw.hrUns[k * raw.NT + ti];
      }
      if (!Number.isFinite(team.isolated?.uns) || !u.every(v => Number.isFinite(v) && v >= 0) ||
          Math.abs(sum(u) - team.isolated.uns) > 0.01) {
        status.fallback = "mismatch"; return null;
      }
      const dem = raw.hrDem;
      const r = dem?.length === u.length && dem.every(v => Number.isFinite(v) && v >= 0) &&
        calibrate(u, dem, team.uns, team.outH);
      if (!r) { status.fallback = "calibrate"; return null; }
      const data = { r, outH: team.outH, sum: sum(r), source: "device" };
      return inspect ? data : { ...data, res: raw, outHour: k => r[k] > threshold(dem[k]) };
    } catch (e) {
      status.fallback = "unavailable"; return null;
    } finally {
      status.recomputeMs = performance.now() - started;
    }
  }
  const later = (ms, fn) => { const token = epoch; timers.push(setTimeout(() => { if (token === epoch) fn(); }, ms)); };
  const listen = (target, name, fn, opts) => {
    target.addEventListener(name, fn, opts);
    off.push(() => target.removeEventListener(name, fn, opts));
  };
  function closeCards() { deck?.remove(); deck = null; status.cardsOpen = false; }
  function hideSummary() {
    toast?.remove(); toast = null; advanceSummary = null;
    if (raf) cancelAnimationFrame(raf); raf = 0;
  }
  function clear() {
    epoch++;
    // onDone는 이전 달 연출을 다시 열지 못한다.
    KCP.buildGame?.skipReplay?.();
    timers.forEach(clearTimeout); timers = [];
    off.forEach(fn => fn()); off = [];
    if (raf) cancelAnimationFrame(raf); raf = 0;
    if (layoutRaf) cancelAnimationFrame(layoutRaf); layoutRaf = 0;
    layer?.remove(); layer = toast = deck = null;
    advanceSummary = null;
    status.playing = false; status.cardsOpen = false;
  }
  function clearForMap(root) { if (layer && root.contains(layer)) clear(); }
  function schedulePlace(root) {
    if (layoutRaf) return;
    const token = epoch;
    layoutRaf = requestAnimationFrame(() => {
      layoutRaf = 0;
      if (token === epoch) place(root);
    });
  }
  const node = (tag, cls, text) => {
    const el = document.createElement(tag); el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };
  // 실제 막대·도구·서랍 사각형을 제외한 지도 영역. 390px에서도 서랍 아래 공간을 쓴다.
  function place(root) {
    if (!root.isConnected) { clear(); return; }
    if (!layer) return;
    const stage = root.querySelector(".bd-stage")?.getBoundingClientRect();
    if (!stage) return;
    let box = { left: Math.max(8, stage.left + 8), right: Math.min(window.innerWidth - 8, stage.right - 8),
      top: Math.max(8, stage.top + 8), bottom: Math.min(window.innerHeight - 8, stage.bottom - 8) };
    // #lg-map-result: 지도 왼쪽 위 'N월 실제' 요약 줄. 요약 띠가 이것을 덮지 않게 그 아래에서 시작한다.
    for (const sel of ["#bd-hud", ".lg-bar", "#bd-mapbar", "#lg-map-result"]) {
      const el = root.querySelector(sel);
      if (el && el.getClientRects().length) box.top = Math.max(box.top, el.getBoundingClientRect().bottom + 8);
    }
    for (const sel of ["#bd-dock"]) {
      const el = root.querySelector(sel);
      if (el && !el.hidden && el.getClientRects().length) box.bottom = Math.min(box.bottom, el.getBoundingClientRect().top - 8);
    }
    for (const sel of ["#lg-panel", "#bd-drawer"]) {
      const panel = root.querySelector(sel);
      if (!panel || panel.hidden || !panel.getClientRects().length) continue;
      const p = panel.getBoundingClientRect();
      if (p.left < box.right && p.right > box.left && p.top < box.bottom && p.bottom > box.top) {
        const spaces = [{ ...box, right: Math.min(box.right, p.left - 8) }, { ...box, left: Math.max(box.left, p.right + 8) },
          { ...box, bottom: Math.min(box.bottom, p.top - 8) }, { ...box, top: Math.max(box.top, p.bottom + 8) }];
        const area = b => Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
        box = spaces.sort((a, b) => area(b) - area(a))[0];
      }
    }
    const run = root.querySelector("#bd-run");
    if (root.classList.contains("bd-replaying") && run && !run.hidden) {
      Object.assign(run.style, { left: `${(box.left + box.right) / 2}px`,
        width: `${Math.max(0, Math.min(580, box.right - box.left))}px`, bottom: `${window.innerHeight - box.bottom}px` });
      box.bottom = Math.min(box.bottom, run.getBoundingClientRect().top - 8);
    } else if (run) {
      ["left", "width", "bottom"].forEach(k => run.style.removeProperty(k));
    }
    const width = Math.max(0, box.right - box.left), height = Math.max(0, box.bottom - box.top);
    Object.assign(layer.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${width}px`, height: `${height}px` });
    layer.dataset.compact = String(width < 600);
  }
  function showCards(cards, sound, root) {
    if (!cards.length || !layer?.isConnected || !root.isConnected) return;
    hideSummary();
    deck = node("section", "fx-turn-cards");
    deck.setAttribute("aria-label", "이번 달 사건 카드");
    const close = node("button", "fx-turn-close", "닫기"); close.type = "button";
    close.addEventListener("click", closeCards); deck.append(close);
    const row = node("div", "fx-turn-card-row"); deck.append(row);
    const articles = cards.slice(0, 3).map((card, i) => {
      const article = node("article", "fx-turn-card");
      article.dataset.active = String(i === 0);
      article.append(node("span", "fx-turn-tag", card.tag), node("h3", "", card.title),
        node("p", "", card.body), node("strong", "fx-turn-big", card.big));
      const nav = node("div", "fx-turn-card-nav");
      const prev = node("button", "", "이전"), next = node("button", "", "다음");
      prev.type = next.type = "button"; prev.disabled = i === 0; next.disabled = i === Math.min(cards.length, 3) - 1;
      const select = n => articles.forEach((a, k) => { a.dataset.active = String(k === n); });
      prev.addEventListener("click", () => select(i - 1)); next.addEventListener("click", () => select(i + 1));
      nav.append(prev, node("span", "", `${i + 1} / ${Math.min(cards.length, 3)}`), next);
      article.append(nav); row.append(article); return article;
    });
    layer.append(deck); status.cardsOpen = true;
    articles.forEach((article, i) => later(reduced() ? 0 : 80 + i * 260, () => {
      if (!deck) return;
      article.classList.add("fx-revealed");
      sound?.("card");
    }));
    later(10000, closeCards);
  }
  function showSummary(opts, root) {
    if (!layer?.isConnected || !root.isConnected) return;
    place(root);
    toast = node("div", "fx-turn-summary");
    const visual = node("div", "fx-turn-summary-values"); visual.setAttribute("aria-hidden", "true");
    visual.append(node("span", "fx-turn-tag", `${opts.monthLabel} 운영`));
    const fields = (opts.summary || []).map(item => {
      const part = node("span", "fx-turn-stat"), value = node("b", "num");
      part.append(node("span", "", item.label), value, node("span", "", item.unit)); visual.append(part);
      return { item, value };
    });
    const live = node("span", "bd-sr"); live.setAttribute("aria-live", "polite"); live.setAttribute("aria-atomic", "true");
    toast.append(visual, live); layer.append(toast);
    for (const { el, direction } of opts.hud || []) {
      if (!el || !["up", "down"].includes(direction)) continue;
      const cls = `fx-flash-${direction}`; el.classList.add(cls);
      const remove = () => el.classList.remove(cls); off.push(remove); later(1000, remove);
    }
    const token = epoch;
    const currentMonth = () => {
      const session = KCP.league?.state?.(), state = session?.snap || session?.S;
      return !session || (!session.away && session.team === opts.team &&
        ["review", "end"].includes(state?.phase) && state?.results?.at(-1)?.round === opts.round);
    };
    const final = () => {
      if (token !== epoch) return;
      fields.forEach(({ item, value }) => { value.textContent = item.format(item.value); });
      live.textContent = `${opts.monthLabel} 운영: ${(opts.summary || []).map(s => `${s.label} ${s.format(s.value)}${s.unit}`).join(" · ")}`;
    };
    if (reduced()) final();
    else {
      const t0 = performance.now();
      const count = now => {
        if (token !== epoch) return;
        const p = Math.min(1, (now - t0) / 600), eased = 1 - Math.pow(1 - p, 3);
        fields.forEach(({ item, value }) => { value.textContent = item.format(item.value * eased); });
        if (p < 1) raf = requestAnimationFrame(count); else { raf = 0; final(); }
      };
      raf = requestAnimationFrame(count);
    }
    // 타임아웃과 사용자 클릭은 같은 한 번의 전환을 쓴다.
    advanceSummary = () => {
      if (token !== epoch || !toast) return;
      hideSummary();
      if (opts.cards?.length && currentMonth()) showCards(opts.cards, opts.sound, root);
    };
    later(6000, () => advanceSummary?.());
  }
  function monthEnd(opts) {
    const session = KCP.league?.state?.();
    const room = opts.view?.room ?? session?.room ?? null;
    const salt = opts.view?.salt ?? (session?.S ? session.S.salt ?? 0 : null);
    const sid = opts.view?.sid ?? session?.S?.created ?? null;
    // review → end는 같은 달이다. true로 반환해 호출부의 완료 소리도 막는다.
    if (lastMonth?.round === opts.round && lastMonth.room === room && lastMonth.salt === salt &&
        lastMonth.sid === sid && lastMonth.team === opts.team) return true;
    clear();
    const token = epoch, root = document.querySelector(".lg-team-map");
    status = { playing: false, skipped: false, ms: reduced() ? 0 : opts.round === 1 ? 4000 : 2000,
      replayed: false, cardsOpen: false, source: null, fallback: null, recomputeMs: 0 };
    if (!root) return false;
    lastMonth = { round: opts.round, room, salt, sid, team: opts.team };
    layer = node("div", "fx-turn-layer"); root.querySelector(".bd-stage").append(layer); place(root);
    listen(window, "resize", () => schedulePlace(root));
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => schedulePlace(root));
      // place가 크기를 쓰는 #bd-run과 덧층은 관찰하지 않는다. 쓰기는 다음 프레임에 모은다.
      [root, ...root.querySelectorAll("#lg-panel, #bd-drawer, .lg-bar, #bd-hud, #bd-mapbar, #bd-dock")].forEach(el => ro.observe(el));
      off.push(() => ro.disconnect());
    }
    if (window.MutationObserver) {
      const mo = new MutationObserver(() => schedulePlace(root));
      [document.documentElement, root, ...root.querySelectorAll("#lg-panel, #bd-drawer, #bd-run")]
        .forEach(el => mo.observe(el, { attributes: true, attributeFilter: ["hidden", "class"] }));
      off.push(() => mo.disconnect());
    }
    let pointerSkipped = false, pending = false, deferred = false;
    const skip = () => {
      if (pending) { pending = false; status.skipped = true; status.ms = 0; done(); }
      else if (status.playing) { status.skipped = true; KCP.buildGame.skipReplay(); }
    };
    listen(document, "pointerdown", e => {
      if (status.playing || pending) { pointerSkipped = true; skip(); return; }
      pointerSkipped = false;
      if (status.cardsOpen && !deck?.contains(e.target)) closeCards();
      if (toast) { pointerSkipped = true; advanceSummary?.(); }
    }, true);
    // 키보드로 발생한 클릭도 기존 동작을 유지하면서 재생을 끝낸다.
    listen(document, "click", e => {
      if (pointerSkipped) { pointerSkipped = false; return; }
      if ((status.playing || pending) && e.target.closest("button, a, [role=button]")) { skip(); return; }
      if (toast && !e.target.closest("#bd-skip")) advanceSummary?.();
    }, true);
    listen(document, "keydown", e => { if (e.key === "Escape") { if (status.playing || pending) skip(); else { closeCards(); hideSummary(); } } }, true);
    let finished = false;
    const done = info => {
      if (token !== epoch) return;
      if (info?.cancelled || !root.isConnected) { clear(); return; }
      if (finished) return;
      finished = true;
      status.playing = false;
      if (status.replayed) opts.sound?.("done");
      else if (deferred) opts.sound?.(opts.result?.team?.[opts.team]?.unsPct > 0 ? "outage" : "done");
      showSummary(opts, root);
    };
    const start = replay => {
      status.source = replay.source || "engine";
      status.playing = true; status.replayed = true;
      const started = KCP.buildGame?.replayMonth(replay.res, { ms: status.ms, label: `${opts.monthLabel} 실제 운영 · 재생`,
        del: replay.del, r: replay.r, outHour: replay.outHour, onDone: done,
        note: replay.source === "device" ? "이 기기에서 다시 계산한 재생 · 합계는 실제 결과와 같음" : "",
        onDay: () => { if (token === epoch) opts.sound?.("tick"); }, onOutage: () => { if (token === epoch) opts.sound?.("outage"); } });
      if (started) { place(root); return true; }
      status.playing = false; status.replayed = false;
      return false;
    };
    const replay = KCP.leagueCore?.replayOf(opts.round, opts.team, salt, room);
    if (status.ms > 0) {
      if (replay) { if (start(replay)) return true; }
      else {
        pending = deferred = true;
        // 결과 서랍 DOM은 이미 열렸다. 기기 안 재계산·보정은 다음 틱에만 한다.
        later(0, () => {
          if (!root.isConnected) { clear(); return; }
          if (!pending) return;
          pending = false;
          const session = KCP.league?.state?.(), view = session?.snap || session?.S;
          if (session && (session.team !== opts.team || !["review", "end"].includes(view?.phase) ||
              view?.results?.at(-1)?.round !== opts.round)) { status.ms = 0; return; }
          status.source = "device";
          const data = recomputeReplay(opts.view, opts.result, opts.team);
          if (data && start(data)) return;
          status.ms = 0; done();
        });
        return true;
      }
    }
    status.ms = 0;
    done();
    return false;
  }
  KCP.on?.("route:change", clear);
  KCP.fxTurn = { monthEnd, recomputeReplay, clearForMap, state: () => ({ ...status }) };
})();
