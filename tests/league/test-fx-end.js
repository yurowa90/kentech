/* 끝 화면의 공개 이력·월 환산·누락값·접근성을 브라우저 없이 검사한다. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}
function setup(frames = [], osReduced = false, sessionStorage = memoryStorage()) {
  const KCP = { route() {}, on() {}, esc: x => String(x).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;"),
    leagueNet: {}, leagueCore: { roundsOf: V => V.rounds, regionOf: () => ({ teams: [] }), teamDef: (_, id) => ({ color: { a: "#d86fa8", b: "#e0a030", c: "#5fae6e" }[id] }) }, buildGame: {} };
  const window = { KCP, sessionStorage, addEventListener() {}, requestAnimationFrame: fn => frames.push(fn),
    // 등장이 끝난 뒤 '이미 연출함'을 적는 타이머(fx-end mount). 검사에서는 settle()로 직접 돌린다.
    setTimeout: fn => (frames.timers ||= []).push(fn), matchMedia: () => ({ matches: osReduced }) };
  const context = vm.createContext({ window, document: { documentElement: {}, addEventListener() {} } });
  for (const file of ["build-maps.js", "build.js", "econ-data.js", "fx-turn.js", "league.js"]) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../../ui", file), "utf8"), context);
  }
  const file = path.resolve(__dirname, "../../ui/fx-end.js");
  if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, "utf8"), context);
  assert.equal(typeof KCP.fxEnd?.html, "function", "끝 화면 HTML API가 있어야 한다");
  return KCP;
}
function fixture(n = 3) {
  const rounds = Array.from({ length: n }, (_, i) => ({ year: 2026 + Math.floor(i / 12), month: i % 12 + 1, mdays: 28 }));
  const hist = (appr, pop) => Array.from({ length: n }, (_, t) => ({ t, appr: appr + t, pop: pop + t * 100 }));
  return { room: "TESTROOM", phase: "end", round: n, region: "south", rounds, active: ["a", "b", "c"], teams: { a: {}, b: {}, c: {}, inactive: {} },
    econ: { cities: { a: { name: "내 도시", pop0: 1000, hist: hist(40, 1000) }, b: { name: "이웃 하나", pop0: 2000, hist: hist(60, 2000) },
      c: { name: "이웃 둘", pop0: 4000, hist: hist(80, 4000) }, inactive: { hist: hist(100, 999999) } } },
    events: [{ id: "coldwave_heating", round: 1 }, { id: "other", round: 2 }],
    results: Array.from({ length: n }, (_, i) => ({ round: i + 1, days: 7, team: {
      a: { unsPct: i ? 0 : 77.7, co2Prod: 10 + i, outH: i ? 0 : 2 },
      b: { unsPct: 10, co2Prod: 20, outH: 1 }, c: { unsPct: 14, co2Prod: 40, outH: 1 },
      inactive: { unsPct: 100, co2Prod: 999999, outH: 7 } } })) };
}
const graph = (html, key) => html.match(new RegExp(`<article[^>]*data-fx-metric="${key}"[\\s\\S]*?</article>`))[0];
test("4개 그래프에 첫·마지막 값과 활성 이웃 평균, 월 환산 단위가 나온다", () => {
  const K = setup(), V = fixture(), before = JSON.stringify(V), html = K.fxEnd.html(V, "a");
  assert.equal((html.match(/role="img"/g) || []).length, 4);
  assert.match(graph(html, "uns"), /aria-label="정전, 2026년 1월 77.7% → 2026년 3월 0%, 이웃 평균 12%/);
  assert.match(graph(html, "appr"), /1월 40% → 2026년 3월 42%, 이웃 평균 72%/);
  assert.match(graph(html, "pop"), /주민 · 시작 대비 변화, 2026년 1월 0% → 2026년 3월 \+20%, 이웃 평균 \+7.5%/);
  assert.match(graph(html, "co2"), /1월 40 t → 2026년 3월 48 t, 이웃 평균 120 t/);
  assert.match(html, /모형 계산 · 게임 가정/);
  assert.doesNotMatch(html, />\s*[OPMG](?:\*|\s)*<|\([OPMG]\)/);
  assert.equal(JSON.stringify(V), before, "화면 생성은 공개 상태를 변경하지 않는다");
});
test("빈 달은 보간하지 않고 내 도시·이웃 선을 끊으며 0은 보존한다", () => {
  const K = setup(), V = fixture();
  delete V.results[1].team.a.unsPct;
  delete V.results[1].team.b.co2Prod; delete V.results[1].team.c.co2Prod;
  V.econ.cities.a.hist.splice(1, 1);
  const html = K.fxEnd.html(V, "a");
  for (const key of ["appr", "pop", "uns"]) {
    const d = graph(html, key).match(/data-fx-series="a"[^>]* d="([^"]*)"/)[1];
    assert.equal((d.match(/M/g) || []).length, 2, key + " 누락 달 양쪽은 별도 선분");
  }
  const d = graph(html, "co2").match(/data-fx-series="neighbors"[^>]* d="([^"]*)"/)[1];
  assert.equal((d.match(/M/g) || []).length, 2);
  assert.match(graph(html, "uns"), /3월 0%/);
  assert.match(html, /없는 달은 선을 끊/);
});
test("36달 띠는 달마다 비조작 칸 하나와 사건·정전 대안을 갖는다", () => {
  const K = setup(), html = K.fxEnd.html(fixture(36), "a");
  assert.equal((html.match(/data-fx-month="/g) || []).length, 36);
  assert.match(html, /한파/); assert.match(html, /일반 사건/); assert.match(html, /정전 있음/);
  assert.doesNotMatch(html, /<button|role="button"/);
  assert.match(html, /2028년 12월/);
});
test("진행자 모드는 모든 활성 도시 궤적과 도시 이름을 제공한다", () => {
  const K = setup(), html = K.fxEnd.html(fixture(), null, { allCities: true });
  assert.equal((html.match(/data-fx-series="[abc]"/g) || []).length, 12);
  assert.doesNotMatch(html, /data-fx-series="inactive"/);
  assert.match(html, /이웃 하나/); assert.match(html, /이웃 둘/);
});
test("생략된 과거 CO₂와 이웃 결측은 0으로 바꾸거나 평균 분모에 넣지 않는다", () => {
  const K = setup(), V = fixture();
  delete V.results[0].team.a.co2Prod;
  V.results[2].team.b.unsPct = null;
  const html = K.fxEnd.html(V, "a");
  assert.match(graph(html, "co2"), /1월 자료 없음 → 2026년 3월 48 t/);
  assert.match(graph(html, "uns"), /이웃 평균 14%/);
});
const settle = frames => (frames.timers || []).splice(0).forEach(fn => fn());
function element() {
  const classes = new Set();
  return { isConnected: true, classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) } };
}
test("mount는 기존 막대 값·구조를 유지하며 한 번 등장하고 다시 mount해도 반복하지 않는다", () => {
  const frames = [], K = setup(frames), block = element(), meter = { ...element(), value: 72 };
  const root = { offsetWidth: 300, querySelectorAll: s => s === ".lg-fx-end" ? [block] : [meter] };
  K.fxEnd.mount(root);
  assert.equal(block.classList.contains("lg-fx-enter"), true);
  assert.equal(meter.classList.contains("lg-fx-rank-enter"), true);
  frames.shift()();
  assert.equal(block.classList.contains("lg-fx-enter"), false);
  assert.equal(meter.classList.contains("lg-fx-rank-enter"), false);
  assert.equal(meter.value, 72);
  settle(frames);
  K.fxEnd.mount(root); assert.equal(frames.length, 0);
});
test("앱과 OS의 움직임 줄이기는 프레임 대기 없이 최종 상태로 둔다", () => {
  for (const os of [false, true]) {
    const frames = [], K = setup(frames, os), block = element();
    if (!os) K.v2 = { reduced: () => true };
    K.fxEnd.mount({ querySelectorAll: () => [block], get offsetWidth() { assert.fail("레이아웃 대기 없음"); } });
    assert.equal(block.classList.contains("lg-fx-enter"), false);
    assert.equal(frames.length, 0);
  }
});

// publicView는 최근 두 달 이전의 co2Prod를 생략한다.
function publicFixture(full) {
  const V = JSON.parse(JSON.stringify(full));
  V.results.slice(0, -2).forEach(r => Object.values(r.team).forEach(t => delete t.co2Prod));
  return V;
}
test("압축된 공개 사본은 CO₂ 빈 달을 끊고 그래프 아래에 한계를 알린다", () => {
  const K = setup(), V = publicFixture(fixture(12)), before = JSON.stringify(V);
  const co2 = graph(K.fxEnd.html(V, "a"), "co2");
  assert.equal((co2.match(/<circle/g) || []).length, 4);
  assert.match(co2, /1월 자료 없음/);
  assert.match(co2, /공개 상태에는 최근 두 달의 CO₂만 있어 빈 달이 있어요/);
  assert.equal(JSON.stringify(V), before);
});
test("월별 수신값은 탭 저장으로 모든 도시 CO₂를 복원하며 방·도시와 환산 일수를 보존한다", () => {
  const storage = memoryStorage(), K = setup([], false, storage), full = fixture(12);
  const before = JSON.stringify(full);
  full.results.slice(0, -2).forEach(r => K.fxEnd.remember(full, r));
  assert.equal(JSON.stringify(full), before, "수신 결과나 리그 상태에 사본을 붙이지 않는다");
  const reloaded = setup([], false, storage), V = publicFixture(full), snapshot = JSON.stringify(V);
  const co2 = graph(reloaded.fxEnd.html(V, "a"), "co2");
  assert.equal((co2.match(/<circle/g) || []).length, 24, "다른 도시도 보충되어 이웃 평균이 이어진다");
  assert.match(co2, /1월 40 t → 2026년 12월 84 t, 이웃 평균 120 t/);
  assert.doesNotMatch(co2, /공개 상태에는 최근 두 달/);
  assert.equal(JSON.stringify(V), snapshot);
  const all = graph(reloaded.fxEnd.html(V, null, { allCities: true }), "co2");
  assert.equal((all.match(/<circle/g) || []).length, 36);
  V.room = "OTHERROOM";
  assert.equal((graph(reloaded.fxEnd.html(V, "a"), "co2").match(/<circle/g) || []).length, 4);
  // 동일 방에서 다른 도시만 먼저 받았어도 내 도시 값을 대신 쓰면 안 된다.
  const partial = fixture(12); partial.room = "PARTIAL";
  partial.results.slice(0, -2).forEach(r => K.fxEnd.remember(partial, { round: r.round, days: 14, team: { b: r.team.b } }));
  const missing = graph(reloaded.fxEnd.html(publicFixture(partial), "a"), "co2");
  assert.match(missing, /1월 자료 없음/);
  assert.match(missing, /이웃 평균 120 t/); // 마지막 달 공개 값의 평균(20+40)/2 ×4
  assert.match(missing, /이웃 평균 2026년 1월 40 t<\/title>/, "저장된 대표 14일을 28일로 환산");
  assert.match(missing, /공개 상태에는 최근 두 달/);
});
test("CO₂ 저장 실패·깨진 사본은 화면을 막거나 빈 달을 0으로 만들지 않는다", () => {
  for (const storage of [
    { getItem() { throw Error("disabled"); }, setItem() { throw Error("disabled"); } },
    { getItem: () => "{broken", setItem() {} },
    { getItem: () => "[]", setItem() {} },
    { getItem: () => '{"1":{"co2Prod":null,"days":0}}', setItem() {} }
  ]) {
    const K = setup([], false, storage), V = publicFixture(fixture(12));
    assert.doesNotThrow(() => K.fxEnd.remember(V, V.results.at(-1)));
    assert.match(graph(K.fxEnd.html(V, "a"), "co2"), /1월 자료 없음/);
  }
});
test("새 DOM으로 서랍을 다시 만들어도 같은 방·도시·끝 라운드 연출을 반복하지 않는다", () => {
  const frames = [], K = setup(frames);
  const root = (V = fixture(), team = "a", opts = {}) => {
    const block = element(), html = K.fxEnd.html(V, team, opts);
    // 브라우저가 HTML 속성을 dataset으로 읽는 경계만 대신한다.
    block.dataset = { fxEndKey: html.match(/data-fx-end-key="([^"]*)"/)[1].replaceAll("&quot;", '"') };
    const meter = element();
    return { block, meter, offsetWidth: 300, querySelectorAll: s => s === ".lg-fx-end" ? [block] : [meter] };
  };
  K.fxEnd.mount(root()); frames.shift()(); settle(frames);
  const next = root(); K.fxEnd.mount(next);
  assert.equal(next.block.classList.contains("lg-fx-enter"), false);
  assert.equal(next.meter.classList.contains("lg-fx-rank-enter"), false);
  assert.equal(frames.length, 0);
  const otherRoom = fixture(); otherRoom.room = "OTHERROOM";
  for (const different of [root(otherRoom), root(fixture(), "b"), root(fixture(12)), root(fixture(), null, { allCities: true })]) {
    K.fxEnd.mount(different);
    assert.equal(different.block.classList.contains("lg-fx-enter"), true, "새 방·도시·끝 라운드·진행자는 처음 연출한다");
    frames.shift()(); settle(frames);
  }
  const hostAgain = root(fixture(), null, { allCities: true }); K.fxEnd.mount(hostAgain);
  assert.equal(hostAgain.block.classList.contains("lg-fx-enter"), true, "진행자는 기존 DOM 단위 연출을 유지한다");
});
test("진행자 도시 색은 팀 자료를 따르고 점선·수평선과 정전 범례를 구분한다", () => {
  const K = setup(), V = fixture(), html = K.fxEnd.html(V, null, { allCities: true });
  for (const [id, color] of [["a", "#d86fa8"], ["b", "#e0a030"], ["c", "#5fae6e"]]) {
    assert.match(html, new RegExp(`data-fx-series="${id}"[^>]*--fx-line:${color}`));
  }
  assert.doesNotMatch(html, /--fx-line:var\(--ui-danger\)/);
  assert.match(html, /stroke-dasharray="6 3"/);
  assert.match(html, /정전 표시/); assert.doesNotMatch(html, /빨간 점/);
  const month = html.match(/<li data-fx-month="1">[\s\S]*?<\/li>/)[0];
  assert.match(month, /<span aria-hidden="true">2026년 1월<\/span>/);
  V.events.push({ id: "heavy_snow_solar", round: 2 });
  const strip = K.fxEnd.html(V, "a");
  const cold = strip.match(/data-fx-month="1"[\s\S]*?class="lg-fx-icons"[^>]*>([^<]+)/)[1];
  const snow = strip.match(/data-fx-month="2"[\s\S]*?class="lg-fx-icons"[^>]*>([^<]+)/)[1];
  assert.notEqual(cold, snow);
});

test("탭 CO₂ 사본의 0은 보존하고 현재 공개값을 사본보다 우선한다", () => {
  const K = setup(), full = fixture(12);
  full.results[0].team.a.co2Prod = 0;
  full.results.forEach(r => K.fxEnd.remember(full, r));
  const V = publicFixture(full);
  V.results.at(-1).team.a.co2Prod = 100;
  const co2 = graph(K.fxEnd.html(V, "a"), "co2");
  assert.match(co2, /1월 0 t → 2026년 12월 400 t/);
  assert.doesNotMatch(co2, /공개 상태에는 최근 두 달/);
});
