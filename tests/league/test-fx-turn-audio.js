/* fxTurn 실제 모듈의 소리 콜백 검사. 브라우저 대신 최소 DOM·시계·재생 경계만 제공한다. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.resolve(__dirname, "../../ui/fx-turn.js"), "utf8");

function setup(width, unsPct = 0) {
  const elements = [], timers = new Map(), sounds = [], frames = new Map(), listeners = {};
  let clock = 0, id = 0, replay;
  class Element {
    constructor(tag) {
      this.tagName = tag; this.className = ""; this.dataset = {}; this.children = []; this.listeners = {};
      this.style = { removeProperty(k) { delete this[k]; } };
      this.classList = { contains: name => this.className.split(" ").includes(name),
        add: name => { this.className += ` ${name}`; } };
      elements.push(this);
    }
    get isConnected() { return this === root || !!this.parent?.isConnected; }
    append(...nodes) { nodes.forEach(n => { n.parent = this; this.children.push(n); }); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); this.parent = null; }
    contains(n) { return n === this || this.children.some(c => c.contains(n)); }
    setAttribute(name, value) { this[name] = value; }
    getBoundingClientRect() { return { left: 0, top: 0, right: width, bottom: 800 }; }
    getClientRects() { return this.isConnected ? [this.getBoundingClientRect()] : []; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
      const selectors = selector.split(",").map(s => s.trim());
      return elements.filter(n => n !== this && this.contains(n) && selectors.some(s =>
        s.startsWith(".") ? n.classList.contains(s.slice(1)) : s.startsWith("#") ? n.id === s.slice(1) : n.tagName === s));
    }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter(f => f !== fn); }
    click() { (this.listeners.click || []).forEach(fn => fn({ target: this })); }
  }
  const root = new Element("main"); root.className = "lg-team-map";
  const stage = new Element("div"); stage.className = "bd-stage"; root.append(stage);
  const document = { documentElement: new Element("html"), createElement: tag => new Element(tag),
    querySelector: selector => selector === ".lg-team-map" ? root : root.querySelector(selector),
    addEventListener() {}, removeEventListener() {} };
  const KCP = { v2: { reduced: () => false }, leagueCore: { replayOf: () => ({ res: {}, source: "engine" }) },
    buildGame: { skipReplay() {}, replayMonth(res, options) { replay = options; return true; } } };
  const window = { KCP, innerWidth: width, innerHeight: 800,
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    removeEventListener(name, fn) { listeners[name] = (listeners[name] || []).filter(f => f !== fn); } };
  vm.runInNewContext(source, { window, document, performance: { now: () => clock },
    requestAnimationFrame(fn) { const key = ++id; frames.set(key, fn); return key; }, cancelAnimationFrame(key) { frames.delete(key); },
    setTimeout(fn, ms) { const key = ++id; timers.set(key, { at: clock + ms, fn }); return key; },
    clearTimeout(key) { timers.delete(key); } });
  const options = { round: 1, team: "fake-city", monthLabel: "1월", result: { team: { "fake-city": { unsPct } } },
    cards: [1, 2, 3].map(n => ({ tag: "사건", title: `가상 카드 ${n}`, body: "가상 사건", big: "확정" })),
    summary: [], hud: [], sound: kind => sounds.push(kind) };
  function advance(ms) {
    const end = clock + ms;
    while (true) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]); clock = next[1].at; next[1].fn();
    }
    clock = end;
  }
  function resize(nextWidth) {
    width = nextWidth; window.innerWidth = width;
    (listeners.resize || []).forEach(fn => fn());
    const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(clock));
  }
  return { fx: KCP.fxTurn, options, sounds, elements, advance, resize, replay: () => replay };
}

test("재생 뒤 정전 달 결과는 outage, 정전 없는 결과는 done을 한 번 보낸다", () => {
  for (const [unsPct, expected] of [[0, "done"], [2, "outage"]]) {
    const e = setup(1024, unsPct);
    assert.equal(e.fx.monthEnd(e.options), true);
    e.replay().onDone(); e.replay().onDone();
    assert.deepEqual(e.sounds, [expected]);
  }
});

test("좁은 화면의 숨은 카드는 소리를 내지 않고 처음 선택되어 보일 때만 한 번 낸다", () => {
  const e = setup(390);
  e.fx.monthEnd(e.options); e.replay().onDone(); e.advance(6700);
  assert.equal(e.sounds.filter(k => k === "card").length, 1);
  const articles = e.elements.filter(n => n.classList.contains("fx-turn-card"));
  articles[0].querySelectorAll("button")[1].click();
  assert.equal(e.sounds.filter(k => k === "card").length, 2);
  articles[1].querySelectorAll("button")[0].click();
  articles[0].querySelectorAll("button")[1].click();
  assert.equal(e.sounds.filter(k => k === "card").length, 2, "이미 펼친 카드 재선택은 무음");
  articles[1].querySelectorAll("button")[1].click();
  assert.equal(e.sounds.filter(k => k === "card").length, 3);
});

test("넓은 화면에서는 각 카드가 펼쳐질 때 한 번씩 소리를 보낸다", () => {
  const e = setup(1024);
  e.fx.monthEnd(e.options); e.replay().onDone(); e.advance(6000);
  assert.equal(e.sounds.filter(k => k === "card").length, 0);
  e.advance(100); assert.equal(e.sounds.filter(k => k === "card").length, 1);
  e.advance(260); assert.equal(e.sounds.filter(k => k === "card").length, 2);
  e.advance(260); assert.equal(e.sounds.filter(k => k === "card").length, 3);
});

test("화면을 넓혀 처음 보이는 카드도 한 번 소리를 보내고 다시 크기를 바꿔도 반복하지 않는다", () => {
  const e = setup(390);
  e.fx.monthEnd(e.options); e.replay().onDone(); e.advance(6700);
  assert.equal(e.sounds.filter(k => k === "card").length, 1);
  e.resize(1024); assert.equal(e.sounds.filter(k => k === "card").length, 3);
  e.resize(390); e.resize(1024); assert.equal(e.sounds.filter(k => k === "card").length, 3);
});
