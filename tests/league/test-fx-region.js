"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");
const { test } = require("node:test");
const context = vm.createContext({ window: { KCP: {} } });
const root = path.resolve(__dirname, "../../ui");
vm.runInContext(fs.readFileSync(path.join(root, "league-data.js"), "utf8"), context);
const source = path.join(root, "fx-region.js");
if (fs.existsSync(source)) vm.runInContext(fs.readFileSync(source, "utf8"), context);
const fx = context.window.KCP.fxRegion;
const board = context.window.KCP.LEAGUE_REGIONS.south.board;
const centers = {};
board.own.forEach((row, r) => [...row].forEach((ch, c) => {
  const id = board.letters[ch];
  if (!id) return;
  const p = centers[id] ||= [0, 0, 0];
  p[0] += Math.sqrt(3) * (c + .5 * (r & 1)) + Math.sqrt(3) / 2;
  p[1] += 1.5 * r + 1; p[2]++;
}));
const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

// 같은 중심 아래에 고정하면 여섯 도시 카드·이름표가 충돌한다.
for (const width of [390, 1280]) test(`${width}px: 실제 여섯 도시 중심에서 측정 크기 카드·라벨 교차 0, 경계 안, 결정적`, () => {
  assert.equal(typeof fx?.placeCards, "function", "카드 배치 함수를 제공한다");
  const k = width / (Math.sqrt(3) * (board.cols + .5)), height = (1.5 * (board.rows.length - 1) + 2) * k;
  const cards = Object.entries(centers).map(([id, [x, y, n]], i) => ({ id, x: x / n * k, y: y / n * k,
    width: width < 400 ? 106 + i % 2 * 8 : 142, height: width < 400 ? 68 : 76 }));
  const labels = cards.map(c => ({ x: c.x - 25, y: c.y - 18, width: 50, height: 34 }));
  const input = JSON.stringify({ cards, labels });
  const placed = fx.placeCards(cards, labels, { width, height });
  assert.equal(placed.length, 6);
  assert.equal(new Set(placed.map(c => c.id)).size, 6);
  assert.equal(JSON.stringify(placed), JSON.stringify(fx.placeCards(cards, labels, { width, height })));
  assert.equal(JSON.stringify({ cards, labels }), input, "입력 불변");
  placed.forEach((a, i) => {
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= width && a.y + a.height <= height, a.id);
    placed.slice(i + 1).forEach(b => assert.ok(!intersects(a, b), `${a.id}/${b.id}`));
    labels.forEach(b => assert.ok(!intersects(a, b), `${a.id}/이름표`));
  });
});

test("건설 기호는 공개 계획의 새 설비만 세고 전선·기존 설비·결과 대기를 구분한다", () => {
  assert.equal(typeof fx?.newBuildCount, "function");
  const team = { base: [{ k: "b:solar:1" }], plan: { builds: [{ t: "solar", i: 1 }, { t: "wind", i: 2 }], lines: [{ p: [1, 2] }] } };
  assert.equal(fx.newBuildCount(team, 2, "plan"), 1);
  assert.equal(fx.newBuildCount({ ...team, plan: { builds: [{ t: "solar", i: 1 }] } }, 2, "plan"), 0);
  assert.equal(fx.newBuildCount({ plan: null }, 1, "plan"), 0);
  assert.equal(fx.newBuildCount({ ...team, base: [{ k: "b:solar:1" }, { k: "b:wind:2" }], hist: [{ r: 1, n: 1 }, { r: 2, n: 2 }] }, 2, "review"), 1);
  assert.equal(fx.newBuildCount({ ...team, base: [{ k: "b:solar:1" }, { k: "b:wind:2" }] }, 2, "review"), 0, "이전 공개 기록 없으면 추측하지 않는다");
});

function drawingFixture(width, reduced = false) {
  const KCP = { route() {}, on() {}, gradeWords: String, esc: String, buildGame: {}, leagueNet: {} };
  const window = { KCP, addEventListener() {}, devicePixelRatio: 2, matchMedia: () => ({ matches: reduced }) };
  const document = { documentElement: {}, addEventListener() {} };
  const ctx = vm.createContext({ window, document,
    getComputedStyle: () => ({ getPropertyValue: () => "sans-serif" }), performance });
  for (const name of ["build-maps.js", "build.js", "econ-data.js", "league-data.js", "league-core.js", "fx-region.js", "league.js"]) {
    let js = fs.readFileSync(path.join(root, name), "utf8");
    if (name === "build.js") js = js.replace(/\}\)\(\);\s*$/, "window.cityPalette = PAL; })();");
    if (name === "league.js") js = js.replace(/\}\)\(\);\s*$/, "window.regionDrawing = { renderBoard, boardInfo, boardHit, updateTeamRegion, useRegion(snap, zoom) { L = { snap, regionZoom: zoom }; } }; })();");
    vm.runInContext(js, ctx);
  }
  const commands = [], saved = [], g = { font: "12px sans-serif", lineDashOffset: 0,
    measureText(text) { const size = +(this.font.match(/([\d.]+)px/)?.[1] || 12); return { width: text.length * size }; },
    save() { saved.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, font: this.font, lineDashOffset: this.lineDashOffset }); },
    restore() { Object.assign(this, saved.pop()); } };
  for (const name of ["setTransform", "clearRect", "beginPath", "moveTo", "lineTo", "closePath", "arc", "fill", "stroke", "fillRect", "strokeRect", "setLineDash", "strokeText", "fillText", "roundRect"]) {
    g[name] = function (...args) { commands.push({ name, args, fill: this.fillStyle, stroke: this.strokeStyle, lineWidth: this.lineWidth, offset: this.lineDashOffset }); };
  }
  const cv = { width: 0, height: 0, clientWidth: width, get clientHeight() { return parseFloat(this.style.height); },
    style: {}, dataset: {}, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; }, getContext: () => g, getBoundingClientRect: () => ({ left: 0, top: 0, width }) };
  const reg = KCP.LEAGUE_REGIONS.south;
  const V = { active: reg.teams.map(t => t.id), round: 1, phase: "plan", ties: [], teams: Object.fromEntries(reg.teams.map(t => [t.id, { seated: true, plan: { builds: [], lines: [] } }])) };
  const result = { team: Object.fromEntries(reg.teams.map((t, i) => [t.id, { unsPct: i ? 0 : 10 }])), flow: {} };
  return { KCP, window, document, cv, V, result, commands, reg };
}

test("광역 육지·강·호수 대응표는 실제 도시 PAL의 같은 지형색을 사용한다", () => {
  const e = drawingFixture(390);
  for (const [ch, terrain] of Object.entries({ b: "beach", p: "plain", f: "forest", h: "hill", m: "mount", u: "urban", r: "river", l: "lake", g: "grid" })) {
    const city = e.window.cityPalette[terrain];
    const hex = "#" + Array.from(city, n => n.toString(16).padStart(2, "0")).join("");
    assert.equal(e.KCP.fxRegion.terrain[ch], hex, terrain);
  }
});

for (const width of [390, 600, 1280]) test(`${width}px: 실제 renderBoard의 이름·정전·기호 영역을 피하고 기존 클릭 좌표를 유지한다`, () => {
  const e = drawingFixture(width), id = e.reg.teams[0].id;
  e.V.teams[id].plan.builds.push({ t: "solar", i: 1 });
  const before = JSON.stringify(e.V), boxes = e.window.regionDrawing.renderBoard(e.cv, e.V, e.result, false);
  assert.equal(boxes.filter(b => b.kind === "city").length, 6);
  const G = e.window.regionDrawing.boardInfo(), k = +e.cv.dataset.k;
  const cards = e.reg.teams.map(t => ({ id: t.id, x: G.cen[t.id][0] * k, y: G.cen[t.id][1] * k,
    width: width === 390 ? 114 : 142, height: width === 390 ? 68 : 76 }));
  const placed = e.KCP.fxRegion.placeCards(cards, boxes, { width, height: e.cv.clientHeight });
  assert.equal(placed.length, 6);
  placed.forEach((a, i) => { boxes.filter(b => !b.soft).forEach(b => assert.ok(!intersects(a, b))); placed.slice(i + 1).forEach(b => assert.ok(!intersects(a, b))); });
  assert.ok(e.commands.some(c => c.name === "fill" && c.fill === "#b52b32"), "정전은 빨간 번개 원");
  assert.ok(e.commands.some(c => c.name === "fillRect" && c.fill === "#12634c"), "새 설비는 플러스 사각형");
  assert.ok(e.commands.some(c => c.name === "fill" && c.fill === "#3a7fb8"), "호수 원색 유지");
  assert.ok(e.commands.some(c => c.name === "stroke" && c.stroke === "#3f8fc4"), "강 원색 유지");
  const cell = G.cells.find(c => c.team === id);
  assert.equal(e.window.regionDrawing.boardHit(e.cv, { clientX: cell.x * k, clientY: cell.y * k }), id);
  assert.equal(JSON.stringify(e.V), before, "그리기는 공개 상태를 바꾸지 않는다");
});

test("지어진 연계선만 공개 순거래 방향·크기로 그리며 움직임 줄이기에서도 정지 화살표가 남는다", () => {
  const e = drawingFixture(390, true), D = e.reg.ties[0], T = { ...D, cap: 2, st: "built" }, key = D.a + "~" + D.b;
  e.V.ties = [T];
  const draw = (ab, ba) => {
    e.commands.length = 0; e.result.flow = { [key]: { ab, ba } };
    e.window.regionDrawing.renderBoard(e.cv, e.V, e.result, false);
    return e.commands.filter(c => c.name === "stroke" && c.stroke === "#ffd23f");
  };
  const small = draw(10, 0), large = draw(100, 0);
  assert.equal(e.cv.dataset.flows, "1");
  assert.ok(large[0].lineWidth > small[0].lineWidth);
  assert.equal(large[0].offset, 0);
  assert.equal(e.commands.filter(c => c.name === "fill" && c.fill === "#ffd23f").length, 2, "방향 화살촉 둘");
  const startForward = e.commands.findIndex(c => c.name === "stroke" && c.stroke === "#ffd23f");
  const forward = e.commands.slice(startForward - 2, startForward).map(c => c.args);
  draw(0, 100);
  const startReverse = e.commands.findIndex(c => c.name === "stroke" && c.stroke === "#ffd23f");
  const reverse = e.commands.slice(startReverse - 2, startReverse).map(c => c.args);
  assert.deepEqual(forward[0], reverse[1]); assert.deepEqual(forward[1], reverse[0]);
  e.window.matchMedia = () => ({ matches: false }); e.KCP.v2 = { reduced: () => true };
  assert.equal(draw(100, 0)[0].offset, 0, "앱의 움직임 줄이기도 정지");
  T.st = "prop"; assert.equal(draw(100, 0).length, 0);
  T.st = "built"; assert.equal(draw(undefined, undefined).length, 0);
  delete e.result.flow;
  e.window.regionDrawing.renderBoard(e.cv, e.V, e.result, false);
  assert.equal(e.cv.dataset.flows, "0", "공개 flow가 없으면 생략");
});

// 캐시가 없거나 입력 변경을 놓치면 동일 객체 재사용·새 장애물 회피가 깨진다.
test("배치는 같은 입력을 재사용하고 크기·장애물·경계 변경은 다시 계산한다", () => {
  const cards = [{ id: "a", x: 80, y: 80, width: 40, height: 30 }], bounds = { width: 200, height: 160 };
  const a = fx.placeCards(cards, [], bounds);
  assert.strictEqual(fx.placeCards(structuredClone(cards), [], { ...bounds }), a);
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a[0]), "공유한 캐시를 호출자가 오염시키지 못한다");
  const changed = fx.placeCards([{ ...cards[0], width: 50 }], [], bounds);
  assert.equal(changed[0].width, 50);
  const blocked = fx.placeCards(cards, [a[0]], bounds);
  assert.ok(blocked.length && !intersects(blocked[0], a[0]));
  assert.equal(fx.placeCards(cards, [], { width: 20, height: 20 }).length, 0);
});

test("물 이름표는 빈 곳이 없을 때도 카드를 숨기는 장애물이 되지 않는다", () => {
  const cards = [{ id: "a", x: 50, y: 50, width: 40, height: 30 }];
  const p = fx.placeCards(cards, [{ x: 0, y: 0, width: 100, height: 100, soft: true }], { width: 100, height: 100 });
  assert.equal(p.length, 1);
});

test("되돌아가기 시간 예산이 끝나면 탐색을 중단한다", () => {
  let ticks = 0;
  const c = vm.createContext({ window: { KCP: {} }, performance: { now: () => ++ticks } });
  vm.runInContext(fs.readFileSync(source, "utf8"), c);
  const cards = Array.from({ length: 6 }, (_, i) => ({ id: String(i), x: 180, y: 130, width: 114, height: 82 }));
  c.window.KCP.fxRegion.placeCards(cards, [], { width: 390, height: 337 });
  assert.ok(ticks > 0 && ticks <= 15, `12ms 예산을 넘어서 계속 탐색함: ${ticks}`);
  const previous = ticks;
  c.window.KCP.fxRegion.placeCards(cards, [], { width: 390, height: 337 });
  assert.equal(ticks, previous, "같은 입력의 실패 결과도 기억한다");
});

for (const [pct, count] of [[0, 0], [.001, 0], [.0499, 0], [.05, 1], [.051, 1]]) test(`정전 ${pct}%의 번개 개수는 ${count}`, () => {
  const e = drawingFixture(390);
  e.result.team[e.reg.teams[0].id].unsPct = pct;
  e.window.regionDrawing.renderBoard(e.cv, e.V, e.result, false);
  assert.equal(e.commands.filter(c => c.name === "fill" && c.fill === "#b52b32").length, count);
});

test("거래량·거래 화살촉·이주 중점은 장애물이며 물 이름표는 감점 영역이다", () => {
  const e = drawingFixture(694), D = e.reg.ties[0];
  e.V.ties = [{ ...D, st: "built", cap: 2 }]; e.result.flow[D.a + "~" + D.b] = { ab: 100, ba: 0 };
  e.V.econ = { report: { flows: { pop: [{ from: D.a, to: D.b, n: 10 }] } } };
  const boxes = e.window.regionDrawing.renderBoard(e.cv, e.V, e.result, false);
  for (const [kind, count] of [["flow-text", 1], ["flow-arrow", 2], ["migration-mid", 1]]) {
    assert.equal(boxes.filter(b => b.kind === kind && !b.soft).length, count, kind);
  }
  assert.ok(boxes.some(b => b.kind === "water" && b.soft));
  const G = e.window.regionDrawing.boardInfo(), k = +e.cv.dataset.k;
  const cards = e.reg.teams.map(t => ({ id: t.id, x: G.cen[t.id][0] * k, y: G.cen[t.id][1] * k, width: 140, height: 60 }));
  const placed = e.KCP.fxRegion.placeCards(cards, boxes, { width: e.cv.clientWidth, height: e.cv.clientHeight });
  assert.equal(placed.length, 6);
  placed.forEach(card => boxes.filter(b => !b.soft).forEach(b => assert.ok(!intersects(card, b), b.kind)));
});

test("마지막 그리기 좌표는 도시 id·화면 원점을 포함하고 외부에서 수정되지 않는다", () => {
  const e = drawingFixture(390), id = e.reg.teams[0].id;
  e.V.teams[id].plan.builds = [{ t: "solar", i: 1 }];
  e.window.regionDrawing.renderBoard(e.cv, e.V, e.result, false);
  const a = e.KCP.fxRegion.lastLayout();
  assert.equal(a.names.length, 6);
  assert.deepEqual(Array.from(a.icons, p => [p.id, p.kind]), [[id, "outage"], [id, "build"]]);
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.icons[0]));
  e.cv.getBoundingClientRect = () => ({ left: 30, top: -20, width: 390 });
  const b = e.KCP.fxRegion.lastLayout();
  assert.equal(b.names[0].x, a.names[0].x + 30);
  assert.equal(b.names[0].y, a.names[0].y - 20);
});

function luminance(color) {
  const rgb = color.startsWith("#") ? [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)) : color.match(/[\d.]+/g).slice(0, 3).map(Number);
  return rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
}
const contrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
test("바깥 땅·비참가 경계·이름의 실제 그리기 색이 대비 기준을 만족한다", () => {
  const e = drawingFixture(390);
  e.V.active = [e.reg.teams[0].id];
  e.window.regionDrawing.renderBoard(e.cv, e.V, e.result, false);
  const G = e.window.regionDrawing.boardInfo(), colors = e.commands.filter(c => c.name === "fill" && /^rgb\(/.test(c.fill));
  assert.equal(colors.length, G.cells.filter(c => !["~", "l"].includes(c.ch)).length);
  let i = 0; const outer = [], forest = [];
  for (const cell of G.cells) {
    if (["~", "l"].includes(cell.ch)) continue;
    const lum = luminance(colors[i++].fill);
    if (!e.V.active.includes(cell.team)) outer.push(lum);
    else if (cell.ch === "f") forest.push(lum);
  }
  const border = e.commands.find(c => c.name === "stroke" && c.stroke === "#c2d2c6");
  const name = e.commands.find(c => c.name === "fillText" && c.args[0] === e.reg.teams[1].name);
  assert.ok(border, "비참가 경계가 밝은 회녹색이다");
  for (const out of outer) {
    for (const f of forest) assert.ok(contrast(out, f) >= 1.5);
    assert.ok(contrast(out, luminance(border.stroke)) >= 3);
    assert.ok(contrast(out, luminance(name.fill)) >= 4.5);
  }
  assert.ok(e.commands.some(c => c.name === "strokeRect" && c.lineWidth === .16), "외부 전력망 연결 기호");
});

// DOM은 측정 경계만 대체한다. 배치·확대·캡션·그리기는 실제 updateTeamRegion을 실행한다.
function regionFixture(width = 695, height = 600, cardHeight = 60) {
  const e = drawingFixture(width), viewport = { clientWidth: width, clientHeight: height };
  const board = { style: {} }, caption = {}, overlay = { style: {}, markup: "" };
  let nodes = [];
  Object.defineProperty(overlay, "innerHTML", {
    set(html) {
      this.markup = html;
      nodes = [...html.matchAll(/<span class="lg-regionlabel" /g)].map(() => ({
        style: {}, hidden: false,
        get offsetWidth() { return this.style.width ? parseFloat(this.style.width) : Math.min(140, parseFloat(overlay.style.width) * .32); },
        get offsetHeight() { return cardHeight; }
      }));
    }
  });
  Object.defineProperty(e.cv, "clientWidth", { get: () => Math.round(parseFloat(board.style.width) || width) });
  e.cv.getBoundingClientRect = () => ({ left: 10, top: 25, width: e.cv.clientWidth });
  const selectors = { ".lg-regionviewport": viewport, ".lg-regionboard": board, canvas: e.cv,
    ".lg-regionlabels": overlay, "#lg-regioncap": caption };
  const region = { querySelector: s => selectors[s], querySelectorAll: s => s === ".lg-regionlabel" ? nodes : [] };
  e.document.getElementById = id => id === "lg-region" ? region : null;
  e.V.results = [e.result];
  const update = (zoom = 1) => { e.window.regionDrawing.useRegion(e.V, zoom); e.window.regionDrawing.updateTeamRegion(); };
  return { ...e, update, viewport, overlay, caption, nodes: () => nodes };
}

test("스냅·크기 통지·1→1.5→3배 확대는 배율 1 배치를 재사용하고 공개 좌표만 확대한다", () => {
  const e = regionFixture(), placed = [], original = e.KCP.fxRegion.placeCards;
  e.KCP.fxRegion.placeCards = (...args) => { const p = original(...args); placed.push(p); return p; };
  e.update();
  const first = e.KCP.fxRegion.lastLayout();
  const firstScale = parseFloat(e.overlay.style.transform.slice(6));
  assert.equal(first.cards.length, 6);
  assert.equal(placed.length, 1);
  for (const zoom of [1, 1.5, 3, 1]) {
    e.update(zoom);
    assert.strictEqual(placed.at(-1), placed[0], "확대·반복 알림에도 재탐색하지 않는다");
    const last = e.KCP.fxRegion.lastLayout(), scale = parseFloat(e.overlay.style.transform.slice(6)) / firstScale;
    for (const key of ["cards", "names", "icons"]) last[key].forEach((b, i) => {
      assert.ok(Math.abs(b.x - 10 - (first[key][i].x - 10) * scale) < .001, key);
      assert.ok(Math.abs(b.y - 25 - (first[key][i].y - 25) * scale) < .001, key);
      assert.ok(Math.abs(b.width - first[key][i].width * scale) < .001, key);
    });
  }
  e.viewport.clientHeight = 500; e.update();
  assert.notStrictEqual(placed.at(-1), placed[0], "실제 경계가 바뀌면 다시 계산한다");
});

test("카드 이름은 자료 name의 생성 텍스트이며 캡션·aria에 기호 뜻을 함께 제공한다", () => {
  const e = regionFixture(); e.update();
  for (const t of e.reg.teams) {
    assert.ok(e.overlay.markup.includes(`class="lg-regionlabel-name" aria-hidden="true" aria-label="${t.name}"></span>`), t.id);
  }
  for (const text of ["번개", "0.05%", "계획 단계", "설비 수 늘어남", "결과 단계"]) {
    assert.ok(e.caption.textContent.includes(text)); assert.ok(e.cv.attributes["aria-label"].includes(text));
  }
  assert.ok(!e.caption.textContent.includes("지도 아래 도시 목록에서 보기"));
});

test("배치 실패는 카드를 숨기고 캡션에서 도시 목록으로 안내한다", () => {
  const e = regionFixture(190, 100, 120); e.update();
  assert.ok(e.nodes().every(n => n.hidden));
  assert.equal(e.KCP.fxRegion.lastLayout().cards.length, 0);
  assert.ok(e.caption.textContent.split("\n").includes("지도 아래 도시 목록에서 보기"));
});
