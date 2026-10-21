'use strict';
// V5-s1-tests.md 1~11 / V5-s1-cards.md §1~5. Node 전용, 브라우저·통신 없음.
// 30/32번처럼 VM의 L 초기값을 연결한다. 기준 버전에만 비교용 함수 노출을 주입한다.
// HTML/클릭 API가 없으면 BLOCKED를 실패로 집계한다(건너뛴 검사를 통과로 세지 않음).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { URL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const ROOT = path.resolve(__dirname, '../../..');
const BASE = '9c14549';
const copy = x => x === undefined ? undefined : structuredClone(x);
const order = ['evening', 'wind', 'grid', 'fuel', 'neighbor'];
const labels = { evening: '저녁 수요', wind: '풍속', grid: '접속 여유', fuel: 'LNG', neighbor: '이웃 정전' };
const promiseNames = { ...labels, fuel: 'LNG 지수' };
const units = { evening: ' MW', wind: ' m/s', grid: ' MW', fuel: '', neighbor: '%' };
const s7 = { weather: '날씨·운전 기간', event: '사건·대응', progress: '접속·공사·기술 진행',
  choice: '내 선택', trade: '이웃 거래', growth: '도시 성장·연료 값' };
const linked = { weather: 'evening', progress: 'grid', choice: 'grid', trade: 'neighbor', growth: 'fuel' };
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const decode = s => s.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g,
  x => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'" }[x]));
let assertions = 0, failures = 0, blocked = 0;
const missing = new Set();
function test(label, fn) {
  assertions++;
  try { fn(); console.log(`PASS ${label}`); }
  catch (e) {
    failures++;
    if (e.blocked) blocked++;
    console.error(`${e.blocked ? 'BLOCKED' : 'FAIL'} ${label}: ${e.message}`);
  }
}
function api(h, name) {
  // 이미 존재하는 함수 이름만 사용한다. 새 구현의 후보 함수/속성 이름을 추측하지 않는다.
  const fn = h.U[name] || h.U.uiMath?.[name];
  if (typeof fn === 'function') return fn;
  missing.add(name);
  throw Object.assign(new Error(`공개 API 필요: ${name}${h.baseline ? ` (${BASE} 기준 구현)` : ''}`), { blocked: true });
}

// 작은 HTML 트리: 클래스/신규 data 속성 이름을 계약으로 만들지 않고,
// 명세의 id·role·aria·보이는 이름으로 카드를 찾고 실제 반환 속성으로 클릭한다.
class Element {
  constructor(tag = 'root', attrs = {}, parent = null) {
    this.tagName = tag.toUpperCase(); this.attrs = attrs; this.parentElement = parent;
    this.children = []; this.parts = []; this._html = ''; this.style = {}; this.hidden = false;
    this.listeners = new Map();
    this.dataset = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-'))
      .map(([k, v]) => [k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]));
    this.classList = { add() {}, remove() {}, toggle() {}, contains: c => (attrs.class || '').split(/\s+/).includes(c) };
  }
  get textContent() { return this.parts.map(x => typeof x === 'string' ? decode(x) : x.textContent).join(''); }
  set textContent(v) { this.parts = [String(v)]; }
  get innerHTML() { return this._html; }
  set innerHTML(value) {
    this._html = String(value); const root = htmlTree(this._html);
    this.children = root.children; this.parts = root.parts;
    for (const child of this.children) child.parentElement = this;
  }
  getAttribute(k) { return this.attrs[k] ?? null; }
  hasAttribute(k) { return Object.hasOwn(this.attrs, k); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  matches(selector) {
    if (selector === '*') return true;
    return selector.split(',').some(part => {
      part = part.trim();
      const bits = part.split(/\s+(?![^\[]*\])/);
      if (bits.length > 1) {
        if (!this.matches(bits.at(-1))) return false;
        let ancestor = this.parentElement, at = bits.length - 2;
        while (ancestor && at >= 0) { if (ancestor.matches(bits[at])) at--; ancestor = ancestor.parentElement; }
        return at < 0;
      }
      if (!part || /[ :>]/.test(part.replace(/\[[^\]]*\]/g, ''))) return false;
      const tag = part.match(/^[a-z][\w-]*/i)?.[0];
      if (tag && tag.toUpperCase() !== this.tagName) return false;
      const id = part.match(/#([\w-]+)/)?.[1];
      if (id && this.attrs.id !== id) return false;
      for (const [, cls] of part.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(cls)) return false;
      for (const [, key, , value] of part.matchAll(/\[([\w-]+)(?:=(["']?)(.*?)\2)?\]/g)) {
        if (!this.hasAttribute(key) || (value !== undefined && this.attrs[key] !== value)) return false;
      }
      return true;
    });
  }
  closest(selector) {
    const bits = selector.trim().split(/\s+(?![^\[]*\])/);
    for (let el = this; el; el = el.parentElement) {
      if (!el.matches(bits.at(-1))) continue;
      let ancestor = el.parentElement, at = bits.length - 2;
      while (ancestor && at >= 0) { if (ancestor.matches(bits[at])) at--; ancestor = ancestor.parentElement; }
      if (at < 0) return el;
    }
    return null;
  }
  querySelectorAll(selector) { return this.children.flatMap(c => [...(c.matches(selector) ? [c] : []), ...c.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  click() {
    if (this.hasAttribute('disabled')) return;
    let stopped = false;
    const event = { target: this, preventDefault() {}, stopPropagation() { stopped = true; } };
    // target은 칩 그대로 유지하고, 서랍 루트의 위임 처리기까지 버블링한다.
    const ancestors = [];
    for (let el = this; el; el = el.parentElement) ancestors.push(el);
    for (const el of ancestors) {
      event.currentTarget = el;
      for (const listener of el.listeners.get('click') || []) listener.call(el, event);
      if (stopped) break;
    }
  }
  focus() { this.focused = true; }
  scrollIntoView() {}
  scrollTo() {}
  getBoundingClientRect() { return { top: 0 }; }
  contains(el) { return el === this || this.children.some(c => c.contains(el)); }
  cloneNode() { return new Element(this.tagName, { ...this.attrs }); }
}
function htmlTree(html) {
  const root = new Element(), stack = [root];
  for (const token of String(html).match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    if (token.startsWith('<')) {
      const tag = token.match(/^<([\w-]+)/)?.[1]; if (!tag) continue;
      const attrs = {};
      for (const [, k, a, b, c] of token.slice(tag.length + 1, -1).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[k] = decode(a ?? b ?? c ?? '');
      const parent = stack.at(-1), el = new Element(tag, attrs, parent);
      parent.children.push(el); parent.parts.push(el);
      if (!/^(?:br|hr|input|img|meta|link|wbr)$/i.test(tag) && !token.endsWith('/>')) stack.push(el);
    } else stack.at(-1).parts.push(token);
  }
  return root;
}
function cardKey(card) {
  const keys = order.filter(k => Object.values(card.attrs).includes(k));
  if (keys.length === 1) return keys[0];
  return order.find(k => card.textContent.includes(labels[k]));
}
function view(h) {
  const html = api(h, 'evidenceFocusHTML')(h.L.snap), root = htmlTree(html);
  const focus = root.querySelector('#lg-evidence-focus');
  const group = focus?.querySelector('[role="group"][aria-label="근거 후보"]');
  const cards = group?.querySelectorAll('button[aria-pressed]') || [];
  const promise = focus?.querySelectorAll('button').find(b => /약속/.test(b.textContent) && !cards.includes(b));
  return { html, root, focus, group, cards, promise, keys: cards.map(cardKey) };
}
function makeHarness(source, baseline = false, legacyMedia = false) {
  const storage = new Map(), wire = [], nodes = new Map();
  const L = { room: 'S1CARDS', team: 'pyeongtaek', role: 'team', rev: 0, outCache: {},
    pendingRequests: new Map(), conn: { send: (...args) => wire.push(copy(args)) } };
  const document = { documentElement: {}, activeElement: null, addEventListener() {}, createElement: tag => new Element(tag),
    getElementById: id => nodes.get(id) || null,
    querySelector: selector => [...nodes.values()].map(n => n.matches(selector) ? n : n.querySelector(selector)).find(Boolean) || null,
    querySelectorAll: () => [] };
  const ctx = vm.createContext({ console, performance, structuredClone, URL, __session: L, document,
    addEventListener() {}, setTimeout() { return 0; }, clearTimeout() {},
    matchMedia: q => ({ matches: /max-width:\s*(\d+)/.test(q) && L.width <= +q.match(/max-width:\s*(\d+)/)[1],
      ...(legacyMedia ? { addListener() {} } : { addEventListener() {} }) }),
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    KCP: { route() {}, on() {}, esc: escape, gradeWords: x => x, leagueNet: {
      expandSnapshot: x => x, createIdentity: async () => ({ publicKey: 'synthetic-public' }),
      signEnvelope: async (_, team, request) => ({ team, request }), requestBody: envelope => envelope.request } } });
  ctx.window = ctx; ctx.sessionStorage = ctx.localStorage;
  vm.runInContext('Math.random = () => { throw Error("unseeded random"); };', ctx);
  for (const name of ['build-maps', 'tech-data', 'build', 'econ-data', 'econ', 'league-data', 'league-core'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, `ui/${name}.js`), 'utf8'), ctx, { filename: name });
  assert.equal(source.split('let L = null;').length, 2, '30/32번 VM 세션 연결점');
  if (baseline) {
    // 검사용 주입: 기준 구현만 기존 함수들을 uiMath 끝에 노출해 서랍·배지를 비교한다.
    const hook = /uiMath:\s*\{[^{}]*\}/g;
    assert.equal([...source.matchAll(hook)].length, 1, '기준 구현 uiMath 노출 연결점');
    source = source.replace(hook, fields => fields.replace(/\s*\}$/, ', evidenceFocusHTML, predictionHTML, renderBar, renderPanel, onPanelClick }'));
  }
  vm.runInContext(source.replace('let L = null;', 'let L = globalThis.__session;'), ctx);
  const { leagueCore: C, buildGame: B, league: U, ECON_DATA: D } = ctx.KCP;
  return { ctx, L, U, C, B, D, storage, wire, nodes, baseline, R: C.regionOf('south') };
}
const source = fs.readFileSync(path.join(ROOT, 'ui/league.js'), 'utf8');
const h = makeHarness(source);
const old = makeHarness(execFileSync('git', ['show', `${BASE}:ui/league.js`], { cwd: ROOT, encoding: 'utf8' }), true);
const standard = { evening: 100, wind: 5, grid: 20, fuel: 100, neighbor: 10 };
function fixture(h, opt = {}) {
  h.storage.clear(); h.wire.length = 0; h.nodes.clear();
  const panel = new Element('aside', { id: 'lg-panel' });
  panel.addEventListener('click', event => api(h, 'onPanelClick')(event));
  h.nodes.set('lg-panel', panel);
  Object.assign(h.L, { role: opt.role || 'team', away: !!opt.away, panel: null, width: opt.width || 1280, rev: 0 });
  h.L.viewing = opt.viewing || null;
  delete h.L.interview;
  const S = h.C.newState('S1CARDS', 'south', 0, ['pyeongtaek', 'dangjin'], { turns: 12, seedMode: 'fixed' });
  h.C.host(S, 'next', 0);
  S.round = opt.first ? 1 : 2;
  S.events = [];
  const values = { ...standard, ...opt.values };
  const V = copy(h.C.publicView(S, 0));
  const E = opt.event === 'response' ? h.R.events.find(e => e.opts?.length && h.C.hits(h.R, e, h.L.team)) :
    opt.event === 'regulation' ? h.R.events.find(e => !e.opts?.length && h.C.hits(h.R, e, h.L.team)) : null;
  if (opt.event) assert.ok(E, `합성 ${opt.event} 사건 정의`);
  V.events = E ? [{ id: E.id, round: V.round }] : [];
  if (opt.phase) V.phase = opt.phase;
  const c = V.econ.cities[h.L.team];
  c.pop = c.pop0; c.ind = c.ind0; c.grid = { ...c.grid, headroomMW: values.grid };
  V.econ.intl.lng = values.fuel;
  V.results = opt.first ? [] : [{ round: V.round - 1, team: { dangjin: { unsPct: values.neighbor } } }];
  h.B.selectPack(h.C.teamDef(h.R, h.L.team).pack, 'league');
  // 엔진 경계 합성: S1 함수는 바꾸지 않고 공개 build 입력만 고정한다.
  h.plan = h.B.sanitize(copy(h.D.normalStartPlans[h.L.team]), 1e9);
  h.B.current = () => h.plan;
  h.B.refresh = () => {}; h.B.closeDrawer = () => {};
  h.B.demand = () => values.evening / h.B.TOWNS.length;
  const climate = h.B.PACKS[h.C.teamDef(h.R, h.L.team).pack].climate;
  climate.wind10_land = Array(13).fill(Number.isFinite(values.wind) ? values.wind / (climate.hub_factor_land || 1) : null);
  const current = { s1EvidenceValues: copy(values), s1EvidenceNeighborId: 'dangjin', ...copy(opt.note || {}) };
  const previous = { ...(opt.previous ? { s1EvidenceValues: copy(opt.previous), s1EvidenceNeighborId: opt.oldNeighbor || 'dangjin' } : {}), ...copy(opt.oldNote || {}) };
  const data = { docs: {}, journal: {}, interview: { months: { [V.round]: current, ...(opt.first ? {} : { [V.round - 1]: previous }) } } };
  V.sid = 'synthetic-session';
  const pack = h.C.teamDef(h.R, h.L.team).pack;
  h.L.snap = V; h.L.S = S; h.L.doc = { map: pack, maps: { [pack]: h.plan }, runs: [], journal: {} };
  if (opt.role === 'solo') h.L.interview = data;
  else h.storage.set(`kcp-league-data-v1:${h.L.room}:${h.L.team}`, JSON.stringify(data));
  if (opt.noEcon) delete V.econ;
  return { values, previous, current, E, opt };
}
function note(h) {
  const data = h.L.role === 'solo' ? h.L.interview : JSON.parse(h.storage.get(`kcp-league-data-v1:${h.L.room}:${h.L.team}`) || '{}');
  return data.interview?.months?.[h.L.snap.round];
}
// 독립 오라클: UI 함수/상수/반환값을 읽지 않는다. 동률은 명세 §2가 참조한 기존 목록 순서.
function expected(f) {
  const found = new Map(), valid = k => Number.isFinite(f.values[k]);
  const add = (key, rule, cause) => { if (valid(key) && !found.has(key) && found.size < 3) found.set(key, { rule, cause }); };
  const prev = f.previous.s1EvidenceValues;
  if (prev) {
    const ranked = order.filter(k => valid(k) && Number.isFinite(prev[k]) &&
      (k !== 'neighbor' || f.previous.s1EvidenceNeighborId === 'dangjin')).map(key => ({ key,
      size: prev[key] === 0 ? f.values[key] === 0 ? 0 : Infinity : Math.abs((f.values[key] - prev[key]) / Math.abs(prev[key])) }));
    ranked.sort((a, b) => b.size - a.size);
    if (ranked.length) add(ranked[0].key, 1);
  }
  const largest = f.previous.outageLargest?.key || f.previous.missedCarry?.largest?.key;
  if (linked[largest]) add(linked[largest], 2, largest);
  add('wind', 3); add('fuel', 3);
  // 부록: 숫자인 근거가 남아 있으면 세 개까지 채운다.
  for (const key of order) { if (found.size >= 3) break; add(key, 4); }
  return order.filter(k => found.has(k)).map(key => ({ key, ...found.get(key) }));
}
// 명세의 조사 규칙을 독립 계산한다. 제품의 withParticle은 사용하지 않는다.
function expectedPromise(name) {
  const last = name.codePointAt(name.length - 1);
  assert.ok(last >= 0xac00 && last <= 0xd7a3, '근거의 짧은 이름은 한글 음절로 끝남');
  const jongseong = (last - 0xac00) % 28;
  return `${name}${jongseong === 0 || jongseong === 8 ? '로' : '으로'} 약속하기`;
}
function click(h, element) {
  assert.ok(element, '클릭할 공개 HTML 단추');
  api(h, 'onPanelClick')({ target: element, preventDefault() {}, stopPropagation() {} });
}
function selected(v) { return v.cards.filter(b => b.getAttribute('aria-pressed') === 'true').map(cardKey); }
function assertCandidates(h, f) {
  const v = view(h), wanted = expected(f).map(x => x.key);
  assert.ok(v.group, '#lg-evidence-focus 안 role=group aria-label=근거 후보');
  assert.deepEqual([...v.keys].sort(), [...wanted].sort(), '독립 후보 키 집합');
  assert.equal(new Set(v.keys).size, v.keys.length, '중복 없음');
  assert.equal(v.keys.length, Math.min(3, order.filter(k => Number.isFinite(f.values[k])).length),
    '숫자인 근거를 세 개까지 채움(둘뿐이면 둘)');
  assert.deepEqual(v.keys, wanted, '선발 순위와 무관한 고정 순서');
  assert.ok(v.focus.textContent.includes(`이번 달 볼 것 · 근거 후보 ${wanted.length}개`));
  return v;
}

test('하네스 HTML 파서: 그룹·속성·조상 클릭·이스케이프', () => {
  const root = htmlTree('<section id="lg-evidence-focus"><div role="group" aria-label="근거 후보"><button type="button" aria-pressed="false" data-any-key="wind">풍속 &lt;img&gt;</button></div></section>');
  const card = root.querySelector('[role="group"][aria-label="근거 후보"]').querySelector('button[aria-pressed]');
  assert.equal(cardKey(card), 'wind'); assert.equal(card.textContent, '풍속 <img>');
  assert.equal(card.closest('#lg-evidence-focus [data-any-key]'), card);
  assert.equal(root.querySelector('img'), null);
});
test('부록 matchMedia: addListener만 있는 환경에서 리그 로드', () => {
  const legacy = makeHarness(source, false, true);
  assert.equal(legacy.U.state().role, 'team', '예외 없이 공개 리그 API까지 초기화');
});
test('브라우저 상수 근거: 고정 씨앗 4월 사건 0개', () => {
  const S = h.C.newState('S1CARDS', 'south', 0, ['pyeongtaek', 'dangjin', 'asan'], { turns: 12, seedMode: 'fixed' });
  for (let month = 1; month <= 4; month++) {
    h.C.host(S, 'next', 0);
    if (month === 2 || month === 3) assert.deepEqual(Array.from(S.events.filter(e => e.round === S.round), e => e.id), ['finedust_coal_cap']);
    if (month === 4) { assert.equal(S.seedKey, '0'); assert.equal(S.events.filter(e => e.round === S.round).length, 0); }
    else { for (const id of h.C.activeOf(S)) S.teams[id].plan = copy(h.D.normalStartPlans[id]); h.C.run(S, h.B, 0); }
  }
});
for (const role of ['team', 'solo']) for (const event of [undefined, 'regulation'])
  test(`1 §1 ${role}/${event || '사건 0개'} 카드 묶음`, () => { fixture(h, { role, event }); assert.ok(view(h).group); });
for (const opt of [{ role: 'host' }, { role: 'host', viewing: 'dangjin' }, { away: true }, { noEcon: true }, { phase: 'review' }, { phase: 'end' }])
  test(`1 §1 제외 조건 ${JSON.stringify(opt)}`, () => { fixture(h, opt); assert.ok(!view(h).group); });
test('1 §1·5 대응 사건 달 카드 없음', () => { fixture(h, { event: 'response' }); assert.ok(!view(h).group); });
test('1 §1·5 대응 사건 달 서랍 HTML = 9c14549', () => {
  for (const a of [h, old]) fixture(a, { event: 'response' });
  // 기준 버전은 하네스에서 검사용으로 노출한 기존 렌더 함수를 사용한다.
  const render = a => { const fn = api(a, 'renderPanel'); a.L.panel = 'deal';
    const panel = new Element('aside', { id: 'lg-panel' }); a.nodes.set('lg-panel', panel); fn(); return panel.innerHTML; };
  assert.equal(render(h), render(old), '사건 달 전체 서랍 바이트 동일');
});

const cases = [
  ['첫 달/지난달 값·S7 없음', { first: true }],
  ['지난달 값 없음/S7 있음', { oldNote: { missedBasis: 'monthly', outageLargest: { key: 'choice' } } }],
  ['규칙1 neighbor/규칙2 grid/규칙3 wind (선발 순위와 반대)', { previous: standard, values: { neighbor: 30 }, oldNote: { missedBasis: 'monthly', outageLargest: { key: 'progress' } } }],
  ['규칙1 음수', { previous: standard, values: { evening: 32.3 } }],
  ['규칙1 양수 두 자리 반올림', { previous: standard, values: { evening: 167.712 } }],
  ['이웃 음수 %p', { previous: standard, values: { neighbor: 1.23 }, oldNote: { missedCarry: { basis: 'monthly', largest: { key: 'growth' } } } }],
  ['규칙1 중복 wind', { previous: standard, values: { wind: 20 } }],
  ['지난달 0에서 새 변화', { previous: { ...standard, grid: 0 } }],
  ['전부 같은 값/동률', { previous: standard }],
  ['다른 이웃끼리 비교 제외', { previous: standard, values: { neighbor: 99 }, oldNeighbor: 'asan' }],
  ['다른 이웃 비교 문구/규칙2로 이웃 카드 포함', { previous: standard, oldNeighbor: 'asan', oldNote: { outageLargest: { key: 'trade' } } }],
  ['규칙4 예보 둘 다 없음', { values: { wind: null, fuel: null } }],
  ['규칙4 규칙1 뒤 두 개 채움', { previous: standard, values: { wind: null, fuel: null, grid: 100 } }],
  ['규칙4 숫자 정확히 둘', { values: { wind: null, fuel: null, neighbor: null } }],
  ['규칙4 숫자 넷에서 셋까지 채움', { values: { fuel: null } }],
  ['숫자 하나만', { values: { evening: null, wind: null, fuel: null, neighbor: null } }],
  ['숫자 없음', { values: Object.fromEntries(order.map(k => [k, null])) }],
  ['풍속 없음/LNG 예보', { values: { wind: null } }],
  ['LNG 없음/풍속 예보', { values: { fuel: null } }],
  ['숫자처럼 보이는 문자열 제외', { values: { wind: '5', fuel: '100' } }],
  ['숫자 아닌 지난달 값 제외', { previous: { evening: '100', grid: null, fuel: null, wind: null, neighbor: null } }],
];
test('2·3 §2·3 독립 기대값 검산: 규칙1~4·고정 순서', () => {
  const examples = [
    [{ first: true }, [['evening', 4], ['wind', 3], ['fuel', 3]]],
    [{ previous: standard, values: { neighbor: 30 }, oldNote: { missedBasis: 'monthly', outageLargest: { key: 'choice' } } }, [['wind', 3], ['grid', 2], ['neighbor', 1]]],
    [{ values: { wind: null, fuel: null } }, [['evening', 4], ['grid', 4], ['neighbor', 4]]],
    [{ previous: standard, values: { wind: null, fuel: null, grid: 100 } }, [['evening', 4], ['grid', 1], ['neighbor', 4]]],
    [{ values: { wind: null, fuel: null, neighbor: null } }, [['evening', 4], ['grid', 4]]],
    [{ values: { fuel: null } }, [['evening', 4], ['wind', 3], ['grid', 4]]],
    [{ previous: standard }, [['evening', 1], ['wind', 3], ['fuel', 3]]],
    [{ oldNote: { outageLargest: { key: 'event' } } }, [['evening', 4], ['wind', 3], ['fuel', 3]]],
    [{ previous: standard, values: { grid: 60 }, oldNote: { missedCarry: { largest: { key: 'event' } } } }, [['wind', 3], ['grid', 1], ['fuel', 3]]],
  ];
  for (const [opt, wanted] of examples) assert.deepEqual(expected(fixture(h, opt)).map(x => [x.key, x.rule]), wanted);
});
for (const basis of ['monthly', 'trial']) for (const cause of Object.keys(linked)) for (const field of ['outageLargest', 'missedCarry'])
  cases.push([`규칙2 ${basis}/${field}/${cause}`, { oldNote: field === 'outageLargest' ?
    { missedBasis: basis, outageLargest: { key: cause } } : { missedCarry: { basis, largest: { key: cause } } } }]);
for (const field of ['outageLargest', 'missedCarry'])
  cases.push([`지난달 가장 큰 몫 event/${field}: 규칙2 건너뜀`, {
    previous: standard, values: { grid: 60 }, oldNote: field === 'outageLargest' ?
      { outageLargest: { key: 'event' } } : { missedCarry: { largest: { key: 'event' } } },
  }]);
for (const [label, opt] of cases) {
  test(`2·3 §2·3 ${label}`, () => { const f = fixture(h, opt); assertCandidates(h, f); });
  test(`4 §3 ${label} 꼬리표·값·비교`, () => {
    const f = fixture(h, opt), v = assertCandidates(h, f);
    for (const candidate of expected(f)) {
      const card = v.cards.find(c => cardKey(c) === candidate.key), text = card.textContent;
      const before = f.previous.s1EvidenceValues?.[candidate.key];
      const numberText = value => value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
      assert.ok(text.includes(numberText(f.values[candidate.key]) + units[candidate.key]), '이번 달 값·단위');
      if (candidate.key === 'neighbor' && Number.isFinite(before) && f.previous.s1EvidenceNeighborId !== 'dangjin') {
        const oldName = h.C.teamDef(h.R, f.previous.s1EvidenceNeighborId).name;
        assert.ok(text.includes(`지난달은 다른 이웃(${oldName})`), '바뀐 이웃은 지난달 이웃 이름을 표시');
        assert.doesNotMatch(text, /→/, '다른 이웃의 값을 이어 비교하지 않음');
      } else assert.ok(Number.isFinite(before) ? text.includes(numberText(before)) && /→/.test(text) : text.includes('지난달 값 없음'), '지난달 비교 줄');
      if (candidate.rule === 1) {
        const delta = f.values[candidate.key] - before;
        if (delta === 0) {
          assert.ok(text.includes('지난달과 같음'), '규칙1 변화 0 꼬리표');
          assert.doesNotMatch(text, /0%|지난달보다/, '변화 0은 퍼센트 대신 같음으로 표시');
        } else if (candidate.key === 'neighbor' || before !== 0) {
          const amount = candidate.key === 'neighbor' ? delta : delta / Math.abs(before) * 100;
          const rounded = Number(amount.toFixed(2)) + 0;
          const number = numberText(Math.abs(rounded));
          assert.ok(text.includes(`지난달보다 ${rounded < 0 ? '−' : rounded > 0 ? '+' : ''}${number}${candidate.key === 'neighbor' ? '%p' : '%'}`), '규칙1 부호·최대 두 자리·단위');
        } else assert.ok(text.includes('지난달') && /0/.test(text) && !/Infinity|NaN|∞/.test(text), '지난달 0은 무한대 퍼센트로 쓰지 않음');
      }
      if (candidate.rule === 2) {
        const basis = f.previous.outageFrozen?.basis || f.previous.missedCarry?.basis || f.previous.missedBasis;
        const name = candidate.cause === 'weather' && basis === 'monthly' ? '날씨·계절·운전 기간' : s7[candidate.cause];
        assert.ok(text.includes(`지난달 가장 큰 몫(${name})과 이어짐`), `규칙2 ${basis} 사실 꼬리표`);
      }
      if (candidate.rule === 3) {
        assert.ok(text.includes(candidate.key === 'wind' ? '계절 대표값' : '국제 지수'), '규칙3 사실 꼬리표');
        assert.doesNotMatch(text, /이번 달 예보값/, '풍속은 예보값으로 부르지 않음');
      }
      if (candidate.rule === 4) assert.doesNotMatch(text,
        /지난달보다|지난달과 같음|지난달 가장 큰 몫\(|계절 대표값|이번 달 예보값|국제 지수/,
        `규칙4 ${candidate.key}: 세 개까지 채운 카드에도 꼬리표 없음`);
      // 카드 이름·값도 포함해 금지어를 검사하므로 숨은 순위 설명도 잡는다.
      assert.ok(!/1위|추천|가장/.test(text.replace(/지난달 가장 큰 몫\([^)]*\)과 이어짐/g, '')), '순위 표현 없음');
    }
  });
}
test('4 확정: 모든 근거가 지난달과 같으면 같음 꼬리표·0% 문자열 없음', () => {
  const f = fixture(h, { previous: standard }), v = assertCandidates(h, f);
  assert.deepEqual(v.keys, ['evening', 'wind', 'fuel'], '변화 0 동률은 고정 순서 첫 근거');
  assert.ok(v.cards.find(c => cardKey(c) === 'evening').textContent.includes('지난달과 같음'));
  assert.doesNotMatch(v.focus.textContent, /0%|지난달보다/, '모든 근거가 같은 달에는 0% 변화 문구 없음');
});
test('5 §3 처음 선택 없음·비활성 단추·안내문', () => {
  fixture(h); const v = view(h); assert.ok(v.cards.length >= 2);
  assert.ok(v.cards.every(c => c.getAttribute('aria-pressed') === 'false' && c.getAttribute('type') === 'button'));
  assert.ok(v.promise?.hasAttribute('disabled'));
  assert.equal(v.promise.textContent.trim(), '근거를 하나 고르면 약속으로 이어져요');
  assert.ok(v.focus.textContent.includes("대응을 고를 사건이 없는 달이에요. 이번 달에 눈여겨볼 근거 하나를 골라요. 고른 근거는 약속의 '근거 하나'에 미리 표시돼요. 이 값 하나가 원인이라는 뜻은 아니에요."));
});
test('부록 조사 독립 기대값: 받침 없음·ㄹ은 로, 다른 받침은 으로', () => {
  for (const [name, wanted] of [
    ['저녁 수요', '저녁 수요로 약속하기'], ['풍속', '풍속으로 약속하기'],
    ['접속 여유', '접속 여유로 약속하기'], ['LNG 지수', 'LNG 지수로 약속하기'],
    ['이웃 정전', '이웃 정전으로 약속하기'], ['효율', '효율로 약속하기'],
  ]) assert.equal(expectedPromise(name), wanted);
});
for (const key of order) test(`6 부록 ${key} 약속 단추 조사·짧은 이름`, () => {
  // 각 근거를 규칙 1로 후보에 넣고, 실제 카드 클릭 뒤 전체 문구를 대조한다.
  fixture(h, { previous: standard, values: { [key]: standard[key] * 3 } });
  let v = view(h);
  const card = v.cards.find(c => cardKey(c) === key);
  assert.ok(card, `${key} 조사 검사용 후보`);
  click(h, card); v = view(h);
  assert.deepEqual(selected(v), [key]);
  assert.ok(!v.promise.hasAttribute('disabled'));
  assert.equal(v.promise.textContent.trim(), expectedPromise(promiseNames[key]),
    '도시 이름 없이 짧은 근거 이름과 올바른 조사');
});
test('6 §3·4 카드 클릭·변경·저장·세션 재생성 뒤 선택 유지', () => {
  fixture(h); let v = view(h); const first = v.keys[0], second = v.keys[1];
  click(h, v.cards[0]); v = view(h); assert.deepEqual(selected(v), [first]);
  assert.equal(note(h).s1Pick, first); assert.ok(!v.promise.hasAttribute('disabled'));
  assert.equal(v.promise.textContent.trim(), expectedPromise(promiseNames[first]), '선택한 근거의 정확한 약속 문구');
  click(h, v.cards[1]); assert.deepEqual(selected(view(h)), [second]); assert.equal(note(h).s1Pick, second);
  const fresh = makeHarness(source); fixture(fresh);
  fresh.storage.clear(); for (const [k, value] of h.storage) fresh.storage.set(k, value);
  assert.deepEqual(selected(view(fresh)), [second], '저장소로부터 새 VM에서 재개');
});
for (const existing of [false, true]) test(`7 §4 약속 연결/기존 근거 ${existing}`, () => {
  fixture(h, { note: existing ? { evidence: { key: 'evening', value: 100, text: '저녁 수요: 100.00 MW' } } : {} });
  let v = view(h); const key = v.keys.find(k => k !== 'evening');
  click(h, v.cards.find(c => cardKey(c) === key)); v = view(h); click(h, v.promise);
  assert.equal(h.L.panel, 'journal', '일지 서랍 열림');
  assert.equal(note(h).evidence?.key, existing ? 'evening' : key, '비어 있을 때만 미리 선택');
  const root = htmlTree(api(h, 'predictionHTML')(h.L.snap));
  const chips = root.querySelector('#lg-evidence')?.querySelectorAll('button[data-evidence]') || [];
  assert.equal(chips.find(c => c.getAttribute('data-evidence') === (existing ? 'evening' : key))?.getAttribute('aria-pressed'), 'true');
  const evidence = root.querySelector('#lg-evidence'); assert.ok(evidence);
  const tagged = evidence.children.filter(c => c.textContent.includes('S1에서 고름'));
  assert.equal(tagged.length, 1, 'S1 표지는 하나');
  assert.ok(tagged[0].getAttribute('data-evidence') === key || tagged[0].querySelector(`[data-evidence="${key}"]`) ||
    evidence.children[evidence.children.indexOf(tagged[0]) - 1]?.getAttribute('data-evidence') === key, '같은 칩 안 또는 바로 옆 표지');
  for (const chip of chips) {
    const marked = chip.getAttribute('data-evidence') === key;
    const aria = chip.getAttribute('aria-label') || '';
    assert.equal(aria.endsWith(' · S1에서 고름'), marked, 'S1에서 고른 칩의 aria-label에만 표지 접미사');
    assert.equal(aria.includes('S1에서 고름'), marked, '다른 칩의 접근성 이름에는 S1 표지 없음');
  }
});
test('8 §1 규제 조건 줄은 묶음 위/규제는 후보 밖', () => {
  const f = fixture(h, { event: 'regulation' }), v = view(h); assert.ok(v.group);
  const text = v.focus.textContent, at = text.indexOf('이번 달 조건 · ');
  assert.ok(at >= 0 && text.includes(f.E.name));
  assert.ok(at < text.indexOf(v.group.textContent), '조건 줄 다음에 카드 묶음');
  assert.ok(!v.keys.includes(f.E.id));
  assert.match(text.slice(at), new RegExp(`${f.E.name}:\\s*\\S+`), '사건 이름 뒤 짧은 효과');
});
test('8 §1 사건 0개에는 조건 줄 없음', () => { fixture(h); assert.ok(!view(h).html.includes('이번 달 조건 · ')); });
function conditionText(v) {
  assert.ok(v.group, '조건 줄 아래 근거 후보 묶음');
  const text = v.focus.textContent, at = text.indexOf('이번 달 조건 · ');
  const end = text.indexOf(v.group.textContent);
  assert.ok(at >= 0 && end > at, '카드 묶음 위 조건 줄');
  return text.slice(at, end);
}
for (const kind of ['우리 도시 대응 사건', '다른 도시 규제', '다른 도시 대응 사건'])
  test(`8 §1 조건 줄 제외: ${kind}`, () => {
    const f = fixture(h, { event: 'regulation' });
    const response = h.R.events.find(e => e.opts?.length && h.C.hits(h.R, e, h.L.team));
    const other = h.R.events.find(e => !h.C.hits(h.R, e, h.L.team));
    assert.ok(response && other, '대응 선택지와 다른 도시 범위의 사건 자료');
    const target = kind === '우리 도시 대응 사건';
    const decoy = { ...copy(target ? response : other), id: 's1-condition-excluded',
      name: '조건에 섞이면 안 되는 가상 사건', text: '제외할 가상 효과 문구',
      opts: kind === '다른 도시 규제' ? [] : copy(response.opts) };
    assert.equal(h.C.hits(h.R, decoy, h.L.team), target, '합성 사건의 도시 적용 범위');
    h.R.events.push(decoy);
    try {
      h.L.snap.events.push({ id: decoy.id, round: h.L.snap.round });
      const v = view(h);
      if (target) {
        assert.ok(!v.group, '대응을 고를 사건이 있으면 카드 화면 제외');
        assert.ok(!v.html.includes('이번 달 조건 · '), '대응 사건 달에는 카드용 조건 줄 없음');
      } else {
        const text = conditionText(v);
        assert.ok(text.includes(f.E.name), '우리 도시 규제는 조건 줄에 유지');
        assert.ok(!text.includes(decoy.name) && !text.includes(decoy.text), '제외 사건의 이름·효과가 조건 줄에 섞이지 않음');
      }
    } finally { h.R.events.pop(); }
  });
// 9번은 CSS 표시 조건·접힘의 실제 가시성이므로 s1cards.py로 넘긴다.
console.log('PENDING 9 §3: 1280 summary 숨김·details open·세 카드 표시/390 마지막 카드 접힘/후보 2개 접힘 없음은 s1cards.py(브라우저 미실행)');
test('10 §4 카드 달 배지 고르기 전·후', () => {
  fixture(h); const watch = new Element('span', { id: 'lg-watch' }); h.nodes.set('lg-watch', watch);
  api(h, 'renderBar')(); assert.ok(htmlTree(watch.innerHTML).textContent.includes('근거 고르기'));
  const v = view(h); click(h, v.cards[0]); api(h, 'renderBar')();
  const text = htmlTree(watch.innerHTML).textContent;
  assert.ok(text.includes(labels[v.keys[0]]) && !text.includes('근거 고르기'));
});
test('10 §4·5 대응 사건 달 배지 = 9c14549', () => {
  const badge = a => { fixture(a, { event: 'response' }); const watch = new Element('span', { id: 'lg-watch' });
    a.nodes.set('lg-watch', watch); api(a, 'renderBar')(); return watch.innerHTML; };
  assert.equal(badge(h), badge(old), '배지 바이트 동일');
});
test('11 §3·5 이웃 이름 XSS 이스케이프', () => {
  fixture(h, { previous: standard, values: { neighbor: 30 } });
  const city = h.C.teamDef(h.R, 'dangjin'), before = city.name;
  try {
    city.name = '<img src=x onerror="throw 1">가상 이웃';
    const v = view(h); assert.ok(v.keys.includes('neighbor'), '악성 이름 카드가 실제 후보');
    assert.ok(v.html.includes('&lt;img'), '이웃 이름을 빼지 않고 이스케이프');
    assert.equal(v.root.querySelector('img'), null, 'img 태그 주입 없음');
  } finally { city.name = before; }
});
for (const field of ['name', 'text']) test(`11 §1 조건 줄 ${field === 'name' ? '사건 이름' : '효과 문구'} XSS 이스케이프`, () => {
  const f = fixture(h, { event: 'regulation' }), at = h.R.events.indexOf(f.E);
  // 기존 사건 자료 계약의 name/text에 따로 주입해 한쪽만 이스케이프한 회귀도 잡는다.
  const payload = '<img src=x onerror=1>';
  const event = { ...copy(f.E), name: '가상 규제 이름', text: '가상 규제 효과',
    [field]: `${field === 'name' ? '가상 규제 이름' : '가상 규제 효과'} ${payload}` };
  h.R.events[at] = event;
  try {
    const v = view(h), text = conditionText(v);
    assert.ok(text.includes(event.name) && text.includes(event.text), '이름·효과를 조건 줄에 실제 표시(삭제로 우회 금지)');
    assert.ok(text.includes(payload), '조건 줄의 디코딩된 텍스트에 합성 입력 유지');
    assert.ok(!v.html.includes('<img'), '원문 HTML에 img 태그 없음');
    assert.ok(v.html.includes('&lt;img'), '원문 HTML에서 img 입력 이스케이프');
    assert.equal(v.root.querySelector('img'), null, '파싱 뒤에도 img 요소 없음');
  } finally { h.R.events[at] = f.E; }
});

async function privacy() {
  assertions++;
  try {
    fixture(h); const v = view(h), card = v.cards.find(c => cardKey(c) === 'fuel'), key = cardKey(card);
    const beforeState = JSON.stringify(h.C.publicView(h.L.S, 0));
    click(h, card); assert.equal(note(h).s1Pick, key);
    assert.equal(JSON.stringify(h.C.publicView(h.L.S, 0)), beforeState, 'S1 선택은 공개 상태 불변');
    assert.ok(!JSON.stringify(h.U.state()).includes('s1Pick'), '공개 검사 상태에도 로컬 필드 없음');
    assert.equal(h.wire.length, 0, '로컬 카드 클릭은 전송 없음');
    // 실제 팀 공개 plan API로 서명 경로를 거친 진행자 요청을 만든다.
    // 서명은 메모리 어댑터이며 requestBody를 그대로 보존한다. 외부 전송은 없다.
    assert.equal(h.U.plan(() => {}), true, '실제 공개 계획 저장 경로');
    await h.L.sending;
    const requests = h.wire.filter(x => x[0] === 'req').map(x => h.ctx.KCP.leagueNet.requestBody(x[1]));
    assert.ok(requests.length > 0, '비어 있지 않은 진행자 요청을 검사');
    const hasPrivate = x => x && typeof x === 'object' && Object.entries(x).some(([k, value]) =>
      k === 's1Pick' || value === key || hasPrivate(value));
    assert.ok(!requests.some(hasPrivate), '요청 본문의 로컬 필드·고른 값 없음');
    console.log('PASS 6 §4·5 D-65 실제 공개 상태·진행자 요청');
  } catch (e) { failures++; if (e.blocked) blocked++; console.error(`${e.blocked ? 'BLOCKED' : 'FAIL'} 6 §4·5 D-65 실제 공개 상태·진행자 요청: ${e.message}`); }
}
privacy().then(() => {
  console.log(`S1 cards: ${assertions} cases, ${failures} failures (${blocked} API blockers)`);
  console.log(`실제로 막힌 공개 경로: ${[...missing].join(', ') || '없음'}`);
  console.log('후속 단언에도 필요한 기존 함수: evidenceFocusHTML, predictionHTML, onPanelClick, renderPanel, renderBar');
  process.exitCode = failures ? 1 : 0;
});
