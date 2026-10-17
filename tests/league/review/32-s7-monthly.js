'use strict';
// 기준: C-fix3.md 및 총괄 확정 여섯 단계·호출 상한·0.005%p 문턱. 브라우저 없이 실행한다.
// 예상값은 S7 반환값/사본/호출 로그가 아니라 운영 직전 상태와 build/core 모델로 만든다.
// 잡는 회귀: 시험 기준 회귀, 단계 교환/입력 조기 변경, 재현의 합계/후보 혼입,
// 크기순 카드, 사본 공개/보관 누락, 캐시 재계산, 열기 전 기록 유출.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const ROOT = path.resolve(__dirname, '../../..'), clone = x => JSON.parse(JSON.stringify(x));
const id = 'pyeongtaek', ids = [id, 'dangjin'];
const names = { choice: '내 선택', weather: '날씨·계절·운전 기간', event: '사건·대응',
  progress: '접속·공사·기술 진행', growth: '도시 성장·연료 값', trade: '이웃 거래' };
const causes = Object.keys(names);
const storage = new Map(), session = { room: 'S7MONTHLY', team: id, role: 'fixture', rev: 0 };
const ctx = vm.createContext({ console, performance, structuredClone, __session: session,
  document: { documentElement: {}, addEventListener() {}, getElementById() { return null; } },
  addEventListener() {}, localStorage: { getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
  KCP: { route() {}, on() {}, esc: s => String(s), leagueNet: { expandSnapshot: x => x } } });
ctx.window = ctx;
vm.runInContext('Math.random = () => { throw Error("unseeded random"); };', ctx);
for (const name of ['build-maps', 'tech-data', 'build', 'econ-data', 'econ', 'league-data', 'league-core'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, `ui/${name}.js`), 'utf8'), ctx, { filename: name });
// 메모리에서만 세션과 수신 콜백 연결. 실제 onSnap의 사본 저장·삭제 경로를
// 실행한다. 계산 함수 추출/교체나 원본 파일 변경은 없다. 실제 GUI 저장은 s7.py.
const source = fs.readFileSync(path.join(ROOT, 'ui/league.js'), 'utf8');
console.log(`S7 implementation sha256: ${require('node:crypto').createHash('sha256').update(source).digest('hex')}`);
assert.equal(source.split('let L = null;').length, 2);
assert.equal(source.split('state: () =>').length, 2);
vm.runInContext(source.replace('let L = null;', 'let L = globalThis.__session;')
  .replace('state: () =>', '__receive: onSnap, state: () =>'), ctx);
const { leagueCore: C, buildGame: B, ECON_DATA: D, league: U } = ctx.KCP, R = C.regionOf('south');
assert.equal(typeof U.uiMath.outageAttributionMonthly, 'function');
const key = `kcp-league-s7-v1:${session.room}:${id}`;
const teamKey = `kcp-league-data-v1:${session.room}:${id}`;
const teamData = () => JSON.parse(storage.get(teamKey) || '{}');
const saveTeam = d => storage.set(teamKey, JSON.stringify(d));
const data = () => JSON.parse(storage.get(key) || '{}');
const save = d => storage.set(key, JSON.stringify(d));
let checks = 0, failures = 0, orderDiffers = 0;
// 서로 다른 명세 위반을 모두 보고한다. 실패한 단언은 누적하고 exit=1을 유지한다.
function ok(value, label) {
  checks++;
  if (!value) { failures++; console.error(`FAIL ${label}`); }
  return !!value;
}
function eq(a, b, label) {
  checks++;
  try { assert.deepEqual(clone(a), clone(b), label); }
  catch (e) { failures++; console.error(`FAIL ${label}: ${e.message}`); }
}
function near(a, b, label, tolerance = 1e-9) {
  ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance, `${label}: ${a} / ${b}`);
}
// 구조·필드·단계는 엄격 비교하되, 독립 산식의 부동소수점 연산 순서 차이만 허용한다.
function inputEq(actual, expected, label) {
  checks++;
  function compare(a, b, at) {
    if (typeof b === 'number') {
      assert.ok(Number.isFinite(a) && Math.abs(a - b) <= 1e-12, `${at}: ${a} / ${b}`);
    } else if (b && typeof b === 'object') {
      assert.equal(Array.isArray(a), Array.isArray(b), at);
      assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), at);
      for (const k of Object.keys(b)) compare(a[k], b[k], `${at}.${k}`);
    } else assert.equal(a, b, at);
  }
  try { compare(actual, expected, label); }
  catch (e) { failures++; console.error(`FAIL ${label}: ${e.message}`); }
}
function test(label, fn) { try { fn(); } catch (e) { failures++; console.error(`FAIL ${label}: ${e.stack}`); } }
const rawSimulate = B.simulate;
let calls = [];
B.simulate = (...args) => { calls.push(clone(args)); return rawSimulate(...args); };
function resetCache() { session.outCache = {}; session.outFailures = {}; session.outShownPending = null; }
function select() { B.selectPack(C.teamDef(R, id).pack, 'league'); }
function pct(plan, seed, season, days, mods) {
  select();
  const p = B.sanitize(clone(plan), 1e9);
  Object.assign(p, { seed, season });
  if (mods.tax && !p.policies.includes('tax')) p.policies.push('tax');
  const s = rawSimulate(p, days, { league: true, mods: clone(mods) });
  return s.tot.dem > 0 ? 100 * s.unsTotal / s.tot.dem : 0;
}
function privateFields(x) {
  if (!x || typeof x !== 'object') return [];
  if (['round', 'plan', 'seed', 'days', 'season', 'mods', 'unsPct', 'isolatedUnsPct'].every(k => Object.hasOwn(x, k)))
    return ['운영 사본 객체'];
  return Object.entries(x).flatMap(([k, v]) =>
    [/outageSnapshots|outageOperatingIntl|outageFrozen|outageLargest|outCache/i.test(k) ? k : [], privateFields(v)]).flat();
}
function game({ solarCount = 10, cityIds = ids, turns = 12 } = {}) {
  storage.clear(); resetCache(); session.snap = null;
  const S = C.newState(session.room, R.id, 0, cityIds, { turns, seedMode: 'fixed' });
  C.host(S, 'next', 0);
  cityIds.forEach(city => { S.teams[city].plan = clone(D.normalStartPlans[city]); });
  select();
  const p = S.teams[id].plan, connected = new Set(p.lines.flatMap(l => l.p));
  const solar = B.TILES.filter(t => !t.out && t.site < 0 && !B.siteRule('solar', t) &&
    !p.builds.some(b => b.i === t.i) && t.nb.some(i => connected.has(i))).slice(0, solarCount);
  ok(solar.length === solarCount, '유효한 태양광 배치');
  for (const t of solar) { p.builds.push({ t: 'solar', i: t.i }); p.lines.push({ p: [t.nb.find(i => connected.has(i)), t.i] }); }
  return S;
}
function operate(S, { rememberIntl = true } = {}) {
  resetCache();
  if (rememberIntl) U.__receive(clone(C.publicView(S, 0))); // 운영 전 연료 저장도 실제 수신 경로로
  // 운영 접속 예약을 독립 복제에 적용. C.run이 쓰는 당시 주민/산업/연료/대응 보존.
  const beforeOperation = clone(S), operating = clone(S);
  C.refreshGrid(operating, B, true);
  select();
  const mods = clone(C.modsFor(operating, R, id));
  const normal = clone(C.modsFor({ ...operating, events: [] }, R, id));
  const res = C.run(S, B, 0), V = clone(C.publicView(S, 0));
  const isolated = pct(operating.teams[id].plan, res.seed, res.season, res.days, mods);
  const model = { plan: clone(operating.teams[id].plan), mods, normal, res: clone(res), isolated,
    pop: operating.econ.cities[id].pop, ind: operating.econ.cities[id].ind,
    fuel: operating.econ.intl.cur.fuelMul, grid: clone(operating.grid[id]),
    input: operating, beforeOperation };
  const before = JSON.stringify({ S, V });
  calls = [];
  U.__receive(V);
  eq(calls.length, res.round === 1 ? 1 : 6 + Number(model.grid.waitingMW > 0),
    '결과 수신: 첫 사본 1회, 월간 생성 포함 대기 없으면 6회·있으면 7회');
  eq(JSON.stringify({ S, V }), before, '사본 수신이 운영/공개 상태를 변경하지 않음');
  return { S, V, res, model };
}
function oracle(old, current, { legacyTies = false } = {}) {
  // 운영 직전 독립 상태만 사용한다. 사본/S7 반환값/호출 입력은 예상값에 쓰지 않는다.
  // C-fix3 §1: 이번 계획을 지난달 이웃 연결 상태에서 독립 운영한다.
  // S7의 사본/hostTies/할당 복원 코드 대신 운영 전 예약 상태와 core 접속 엔진을 사용.
  // 우리 쪽 reduce가 취소한 예약은 그대로 둔다(같은 키 재건설도 선택).
  const choiceInput = clone(current.beforeOperation);
  if (!legacyTies) {
    choiceInput.ties = clone(old.input.ties);
    for (const city of Object.keys(choiceInput.teams))
      if (city !== id) choiceInput.teams[city] = clone(old.input.teams[city]);
    choiceInput.teams[id].research = clone(old.input.teams[id].research || {});
  }
  C.refreshGrid(choiceInput, B, true);
  const choiceCap = C.modsFor(choiceInput, R, id).reCap;
  // ① 계획 교체: 우리 선택의 접속 감소와 공사 재시작은 여기로, 이웃 변화는 ④로.
  const buildKey = b => `${b.t}:${b.i}`;
  const previousKeys = new Set(old.plan.builds.map(buildKey));
  const choiceMods = clone(old.mods);
  const additions = current.plan.builds.map(buildKey).filter(k => !previousKeys.has(k));
  for (const key of additions) {
    if (Object.hasOwn(current.mods.reCap, key)) choiceMods.reCap[key] = current.mods.reCap[key];
    else delete choiceMods.reCap[key];
  }
  if (additions.length) choiceMods.disabledBuilds = [
    ...(old.mods.disabledBuilds || []).filter(k => !additions.includes(k)),
    ...(current.mods.disabledBuilds || []).filter(k => additions.includes(k))
  ];
  for (const key of current.plan.builds.map(buildKey).filter(k => previousKeys.has(k))) {
    if (Object.hasOwn(old.mods.reCap, key) || Object.hasOwn(current.mods.reCap, key))
      choiceMods.reCap[key] = Math.min(old.mods.reCap[key] || 0, choiceCap[key] || 0);
    if (!(old.mods.disabledBuilds || []).includes(key) && (current.mods.disabledBuilds || []).includes(key))
      choiceMods.disabledBuilds = [...new Set([...(choiceMods.disabledBuilds || []), key])];
  }
  // C-fix3 §2: ① 출력제어는 이번 계획·① 접속·지난달 기술로 modsFor 재계산.
  // ②에서는 같은 접속·기술을 유지하고 계절만 바꾼다.
  const curtailInput = clone(current.input);
  curtailInput.events = [];
  curtailInput.teams[id].research = { adopted: clone(old.mods.tech || []) };
  for (const entry of curtailInput.grid[id].entries) entry.allocatedMW = choiceMods.reCap[entry.key] || 0;
  const curtail = season => {
    const input = clone(curtailInput);
    input.rounds[input.round - 1].season = season;
    return C.modsFor(input, R, id).curtailP;
  };
  choiceMods.curtailP = curtail(old.res.season);
  const weatherMods = { ...clone(choiceMods), hydroMonth: current.mods.hydroMonth,
    curtailP: curtail(current.res.season) };
  // ③ 사건 배율만 교체. 기술 coalCapMul은 지난달 사건 없는 배율로 유지.
  const eventMods = clone(weatherMods);
  for (const knob of C.MUL) eventMods[knob] = (old.normal[knob] ?? 1) *
    ((current.mods[knob] ?? 1) / (current.normal[knob] ?? 1));
  for (const knob of ['demandHours', 'tax']) {
    delete eventMods[knob];
    if (Object.hasOwn(current.mods, knob)) eventMods[knob] = clone(current.mods[knob]);
  }
  // ④ 명세의 진행 키만 교체. 수요와 국제 연료는 여전히 지난달 값.
  const progressMods = clone(eventMods);
  for (const knob of ['reCap', 'disabledBuilds', 'tech', 'renewOutput', 'co2Mul',
    'h2Co2', 'drEffect', 'drCost', 'curtailP', 'essCap']) {
    delete progressMods[knob];
    if (Object.hasOwn(current.mods, knob)) progressMods[knob] = clone(current.mods[knob]);
  }
  // 사라진 사건 손잡이의 중립값(1)은 생략 표현과 같다. 진행 단계의
  // 전체 입력 대조에서도 이번 달 mods의 생략 표현을 사용한다.
  for (const knob of C.MUL)
    if (!Object.hasOwn(current.mods, knob) && progressMods[knob] === 1) delete progressMods[knob];
  // coalCapMul의 이번 달 사건분을 유지하며 기술분만 현재로 바꾼다.
  delete progressMods.coalCapMul;
  if (Object.hasOwn(current.mods, 'coalCapMul')) progressMods.coalCapMul = current.mods.coalCapMul;
  if (progressMods.fuelMul) delete progressMods.fuelMul.smr;
  if (current.mods.fuelMul?.smr != null)
    progressMods.fuelMul = { ...progressMods.fuelMul, smr: current.mods.fuelMul.smr };
  // ⑤ 주민·산업 수요와 국제 가격분만 교체.
  const growthMods = clone(progressMods);
  for (const knob of ['demandRes', 'demandInd', 'fuelMul']) {
    delete growthMods[knob];
    if (Object.hasOwn(current.mods, knob)) growthMods[knob] = clone(current.mods[knob]);
  }
  const prev = old.res, now = current.res;
  const stages = [
    [old.plan, prev.seed, prev.season, prev.days, old.mods],
    [current.plan, prev.seed, prev.season, prev.days, choiceMods],
    [current.plan, now.seed, now.season, now.days, weatherMods],
    [current.plan, now.seed, now.season, now.days, eventMods],
    [current.plan, now.seed, now.season, now.days, progressMods],
    [current.plan, now.seed, now.season, now.days, growthMods]
  ];
  const values = stages.map(args => pct(...args));
  const parts = values.slice(1).map((v, i) => ({ key: causes[i], value: v - values[i] }));
  // ⑥ 지난달은 조건 재계산 고립값을 사용한다. 저장 고립값의 변조는 진단만 바꾼다.
  parts.push({ key: 'trade', value: (now.team[id].unsPct - values.at(-1)) -
    (prev.team[id].unsPct - values[0]) });
  return { stages, values, parts };
}
function rows(html) {
  return [...html.matchAll(/data-out-step="([^"]+)" data-out-value="([^"]+)"[\s\S]*?<b>([^<]+)<\/b>/g)]
    .map(m => ({ key: m[1], raw: +m[2], visible: +m[3].replace(/[,%p]/g, '').replace('−', '-') }));
}
function cards(html, a) {
  const keys = [...html.matchAll(/data-missed="([^"]+)"/g)].map(m => m[1]);
  const top = [...a.parts].sort((x, y) => Math.abs(y.value) - Math.abs(x.value)).slice(0, 3).map(p => p.key);
  eq(keys, causes.filter(k => top.includes(k)), '카드 = 상위3 집합을 분해 순서로 배치');
  if (JSON.stringify(keys) !== JSON.stringify(top)) orderDiffers++;
}
function validate(old, current, replayOffset = 0, oracleOptions = {}) {
  const { V, res, model } = current, expected = oracle(old.model, model, oracleOptions);
  const d = data(), savedOld = d.outageSnapshots[res.round - 1];
  // 운영 입력·지난달 실제·이번 달 사본은 그대로 두고 지난달 저장 고립값만 바꾼다.
  savedOld.isolatedUnsPct += replayOffset;
  save(d); resetCache(); calls = [];
  const a = U.uiMath.outageAttributionMonthly(V, res, id);
  ok(a, '사본 있는 2월 이후 월간 분해');
  if (!a) return;
  eq(a.basis, 'monthly', '시험 분해로 우회하지 않음');
  near(a.trial, old.res.team[id].unsPct, '분해 출발 = 지난달 실제(약속 기준)');
  near(a.actual, res.team[id].unsPct, '도착 = 이번 실제');
  near(a.total, res.team[id].unsPct - old.res.team[id].unsPct, '지난달 → 이번 달 차이');
  ok(!Object.hasOwn(a, 'priorTrade'), 'priorTrade 필드 폐기');
  near(a.replay, -replayOffset, '동일조건 독립 재현 − 사본 고립 값');
  eq(a.parts.map(p => p.key), causes, '①~⑥ 순서, 재현은 후보 밖');
  expected.parts.forEach(p => near(a.parts.find(actual => actual.key === p.key)?.value, p.value, `${p.key} 독립 모델 몫`));
  eq(a.replayOutsideSum, true, '월간 재현은 합계 밖 진단');
  near(a.parts.reduce((sum, p) => sum + p.value, 0), a.total, '여섯 원인만의 합계 1e-9');
  const waiting = model.grid.waitingMW > 0;
  eq(calls.length, waiting ? 6 : 5, '월간 사본 재사용: 접속 대기 없으면 5회·있으면 6회');
  eq(a.simulations, calls.length, '보고된 호출 수 = 실제');
  // ⑤는 검증된 이번 달 고립 사본을 재사용한다. 앞 5회 실제 실행 입력 전체를
  // 독립적으로 만든 단계와 비교하고 마지막 호출은 접속 대기 반사실로 확인한다.
  expected.stages.slice(0, 5).forEach(([p, seed, season, days, mods], i) => {
    const sanitized = B.sanitize(clone(p), 1e9); Object.assign(sanitized, { seed, season });
    if (mods.tax && !sanitized.policies.includes('tax')) sanitized.policies.push('tax');
    inputEq(calls[i], [sanitized, days, { league: true, mods }], `단계 ${i} 전체 입력`);
  });
  const full = Object.fromEntries(model.grid.entries.map(b => [b.key, b.mw]));
  const connectedPlan = B.sanitize(clone(model.plan), 1e9);
  Object.assign(connectedPlan, { seed: res.seed, season: res.season });
  if (model.mods.tax && !connectedPlan.policies.includes('tax')) connectedPlan.policies.push('tax');
  if (waiting) inputEq(calls.at(-1), [connectedPlan, res.days, { league: true, mods: { ...model.mods, reCap: full } }],
    '마지막 실제 실행 = 이번 조건 접속 대기 반사실');
  near(a.grid.value, waiting ? pct(model.plan, res.seed, res.season, res.days, { ...model.mods, reCap: full }) - model.isolated : 0,
    '접속 대기 별도 반사실(합계 밖)');
  const count = calls.length;
  ok(U.uiMath.outageAttribution(V, res, id) === a, '기존 진입도 같은 월간 캐시');
  eq(calls.length, count, '캐시 추가 실행 0');
  const ranked = [...expected.parts].sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
  if (Math.abs(replayOffset) >= 1) ok(Math.abs(a.replay) >= 1, '큰 재현 차이 회귀 사례 실제 실행');
  const multi = ranked.slice(1).some(p => Math.abs(p.value) >= .05);
  if (multi) {
    const n = {}, html = U.uiMath.outageCardsHTML(V, res, id, n);
    cards(html, a); eq(n, {}, '닫힌 HTML 생성으로 기기 노트 변경 없음');
    const saved = teamData().interview?.months?.[res.round] || {};
    ok(!saved.outageLargest && !saved.outageFrozen, '닫힌 달 기기 기록에도 원인 크기/최대 없음');
    ok(!/data-out-value=|data-out-tag="largest"|가장 큰 몫|lg-outage-waterfall/.test(html), '닫힌 DOM·aria·data 수치/최대 비노출');
    ok(!session.outShownPending, '열기 전 최대 저장 대기 없음');
    const trend = U.uiMath.trendHTML(V, id, true);
    const shownMonths = Object.entries(teamData().interview?.months || {}).filter(([, n]) => n.outageOpened || n.outageSingleShown);
    eq((trend.match(/data-change="outage"/g) || []).length, shownMonths.length,
      '닫힌 현재 달을 타임라인에 추가하지 않음(이미 공개한 지난달은 유지)');
  }
  const note = { outageOpened: true, missed: ranked[0].key, evidence: { key: 'grid', text: '가상 근거' } };
  const html = U.uiMath.outageCardsHTML(V, res, id, note), rendered = rows(html);
  eq(rendered.map(r => r.key), ['previous', ...causes, 'actual'], '폭포 분해 순서');
  const expectedRows = { previous: old.res.team[id].unsPct,
    ...Object.fromEntries(expected.parts.map(p => [p.key, p.value])), actual: res.team[id].unsPct };
  rendered.forEach(r => { near(r.raw, expectedRows[r.key], `${r.key} 독립 기대값 vs DOM 원시값`); near(r.visible, r.raw, `${r.key} 표시 반올림`, .0051); });
  near(rendered.filter(r => r.key !== 'actual').reduce((s, r) => s + r.visible, 0), rendered.at(-1).visible, '화면 합계 ±0.02%p', .0200001);
  ok(html.includes('약속 판정과 같은 기준(지난달 실제 → 이번 달 실제)'), '판정·분해 기준 안내');
  ok(!html.includes('lg-outage-prior-trade') && !html.includes('지난달 거래 되돌림') && !html.includes('시험 1주 대비'), '되돌림 줄·설명 폐기');
  eq(html.includes('id="lg-outage-replay"'), Math.abs(a.replay) >= .005, '월간 재현 설명 문턱 0.005%p');
  ok(html.includes(causes.map(k => names[k]).join(' → ')), '여섯 이름과 순서 안내 일치');
  for (const m of html.matchAll(/data-missed="([^"]+)"[^>]*><strong>([^<]+)<\/strong>/g))
    eq(m[2], names[m[1]], '카드 이름 = 월간 기준');
  const eventClue = html.match(/data-missed="event"[^>]*>[\s\S]*?<span class="lg-out-clue">([^<]+)<\/span>/)?.[1];
  if (eventClue) eq(eventClue, a.clues.event, '사건 카드에는 짧은 지난달→이번달 단서');
  const monthlyMWh = (result, kind) => {
    const days = C.roundsOf(V)[result.round - 1]?.mdays || result.days;
    return (result.team[id][kind] * days / result.days).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  };
  eq(a.clues.trade, `구매 ${monthlyMWh(old.res, 'imp')} → ${monthlyMWh(res, 'imp')} / 판매 ${monthlyMWh(old.res, 'exp')} → ${monthlyMWh(res, 'exp')} MWh(월 환산)`,
    '거래 단서는 두 달의 실제 구매·판매를 월 환산');
  ok(/^지난달 .+ → 이번 달 .+$/.test(a.clues.event) && html.includes(a.clueMore.event), '사건 전체 단서는 단서 더 보기');
  const candidates = [...html.matchAll(/data-(?:missed|out-other)="([^"]+)"/g)].map(m => m[1]);
  ok(candidates.every(k => causes.includes(k)), '되돌림·재현은 카드/나머지 후보 밖');
  if (!model.grid.waitingMW) ok(!html.includes('접속 대기'), '0 MW 달 접속 대기 문장 없음');
  if (multi) cards(html, a);
  note.outageFrozen = clone(session.outShownPending.frozen);
  eq(session.outShownPending.largest?.key || null, Math.abs(ranked[0].value) < .05 ? null : ranked[0].key,
    '기기 저장 최대도 여섯 후보만(재현 제외)');
  if (session.outShownPending.largest) note.outageLargest = clone(session.outShownPending.largest);
  const frozenData = teamData(); frozenData.interview ||= {}; frozenData.interview.months ||= {};
  frozenData.interview.months[res.round] = note; saveTeam(frozenData);
  // 연 뒤 시험 교체·캐시 제거에도 공개 당시 분해 고정.
  storage.set('kcp-build-trial-v1', '{}'); resetCache(); calls = [];
  eq(U.uiMath.outageAttributionMonthly(V, res, id), a, '연 뒤 기기 저장 분해 고정');
  eq(calls.length, 0, '고정된 분해 재실행 0');
  const timeline = U.uiMath.trendHTML(V, id, true);
  if (note.outageLargest) {
    ok(timeline.includes(names[ranked[0].key]), '월간 타임라인 최대 이름 일치');
    for (const cause of causes) {
      const labelled = clone(frozenData); labelled.interview.months[res.round].missed = cause; saveTeam(labelled);
      ok(U.uiMath.trendHTML(V, id, true).includes(`놓친 것: ${names[cause]}`), `${cause} 월간 타임라인 선택 이름 일치`);
    }
    saveTeam(frozenData);
  }
  console.log(JSON.stringify({ month: res.round, replayOffset, simulations: count, parts: a.parts }));
  return a;
}

const months = [];
test('실제 수신·사본 저장·2달 보관', () => {
  const S = game();
  for (let month = 1; month <= 4; month++) {
    if (month > 1) C.host(S, 'next', 0);
    S.teams[id].plan.policies = month % 2 ? [] : ['save'];
    const m = operate(S); months.push(m);
    ok(!Object.hasOwn(teamData(), 'outageSnapshots') && !Object.hasOwn(teamData(), 'outageOperatingIntl'),
      `${month}월 팀 자료 키에 S7 필드가 새로 생기지 않음`);
    const snapshots = data().outageSnapshots;
    eq(Object.keys(snapshots).map(Number), month === 1 ? [1] : [month - 1, month], `${month}월 최근2달만(3월에1월 삭제)`);
    const snap = snapshots[month];
    for (const field of ['round', 'plan', 'seed', 'days', 'season', 'mods', 'unsPct', 'isolatedUnsPct']) ok(Object.hasOwn(snap, field), `사본 ${field}`);
    eq(snap.plan, B.sanitize(m.model.plan, 1e9), '사본 = 운영 계획');
    eq(snap.mods, m.model.mods, '사본 = 운영 당시 모든 배수(운영 직전 독립 상태)');
    near(snap.isolatedUnsPct, m.model.isolated, '사본 고립 값 독립 재현');
    near(snap.unsPct, m.res.team[id].unsPct, '사본 실제');
    near(snap.facts.pop, m.model.pop, '운영 당시 주민'); near(snap.facts.ind, m.model.ind, '운영 당시 산업');
    near(snap.facts.fuel, m.model.fuel, '월말 갱신 전 연료');
    ok(!Object.hasOwn(snap, 'intlFallback'), '계획 국제 지수를 수신한 정상 사본에는 대체 표시 없음');
    ok(!privateFields(m.V).length && !privateFields(C.publicView(S, 0)).length, 'D-65 공개 상태 사본/분해 0');
    const before = clone(snap); U.__receive(clone(m.V)); eq(data().outageSnapshots[month], before, '결과 재수신 사본 고정');
    console.log(JSON.stringify({ month, snapshotBytes: Buffer.byteLength(JSON.stringify(snap), 'utf8') }));
    // 다음 달 입력을 독립 보존한 뒤 즉시 검사(보관기한 뒤 옛 사본 주입 없음).
    if (month > 1) validate(months.at(-2), m);
  }
});
test('큰 재현 차이도 후보 밖·합계 밖', () => {
  const S = game(), first = operate(S); C.host(S, 'next', 0);
  S.teams[id].plan.policies = ['save']; const second = operate(S);
  const baseline = clone(U.uiMath.outageAttributionMonthly(second.V, second.res, id));
  const changed = validate(first, second, 25);
  eq(changed.parts, baseline.parts, '재현 −25에도 거래·성장 포함 여섯 몫 불변');
  console.log(JSON.stringify({ regression: '재현 −25', manipulated: '지난달 사본 isolatedUnsPct +25',
    replay: changed.replay, trade: changed.parts.find(p => p.key === 'trade').value,
    growth: changed.parts.find(p => p.key === 'growth').value }));
});
test('이웃 거래 = 이번 달 실제−고립 효과에서 지난달 효과를 뺀 변화량', () => {
  const S = game();
  S.ties = R.ties.filter(t => ids.includes(t.a) && ids.includes(t.b))
    .map(t => ({ ...clone(t), id: C.tieId(t), st: 'built', cap: 4 }));
  ok(S.ties.length > 0, '자료에 있는 이웃 연계선');
  S.teams.dangjin.price = .005;
  const first = operate(S); C.host(S, 'next', 0);
  S.teams[id].plan.policies = ['save']; const second = operate(S);
  ok(first.res.team[id].imp > 0 || first.res.team[id].exp > 0, '지난달 실제 구매/판매 MWh >0');
  ok(Math.abs(first.model.isolated - first.res.team[id].unsPct) > .05, '반올림보다 큰 지난달 거래 효과');
  validate(first, second);
});
test('계획 국제 지수 미수신: 지난달 nextIntl 대체 사본 표시·독립 재현', () => {
  const S = game(), first = operate(S);
  const previousIntl = clone(data().outageSnapshots[1].nextIntl);
  C.host(S, 'next', 0);
  ok(!data().outageOperatingIntl, '2월 계획 수신 전에는 운영 지수 저장 없음');
  eq(S.econ.intl.cur, previousIntl, '독립 운영의 실제 지수 = 지난달 다음 운영 지수');
  const second = operate(S, { rememberIntl: false }), snap = data().outageSnapshots[2];
  eq(snap.intlFallback, true, '계획 지수 미수신 사본에 intlFallback: true');
  near(snap.facts.fuel, previousIntl.fuelMul, '대체 경로는 이번 월말 지수 대신 지난달 nextIntl 사용');
  near(snap.facts.fuel, second.model.fuel, '대체 지수 = 독립 운영 직전 연료');
  eq(snap.mods, second.model.mods, '대체 사본 모든 배수 = 독립 운영 배수');
  near(snap.isolatedUnsPct, second.model.isolated, '대체 사본 고립값 독립 재현');
  validate(first, second);
  const before = clone(data().outageSnapshots[2]);
  U.__receive(clone(second.V));
  eq(data().outageSnapshots[2], before, '결과 재수신에도 대체 표시·사본 유지');
});
test('대응·수요·연료·기술 배수는 지정 단계에서만 변경', () => {
  const S = game();
  S.events = [{ id: 'heatwave_peak', round: 1, x: 1.2 }];
  const first = operate(S); C.host(S, 'next', 0);
  const event = C.eventDef(R, 'heatwave_peak');
  ok(event.opts?.some(o => o.dev !== 1), '자료의 효과를 줄이는 사건 대응');
  const response = event.opts.find(o => o.dev !== 1);
  S.events = [{ id: event.id, round: 2, x: .7 }];
  S.teams[id].resp = { ...S.teams[id].resp, [`2:${event.id}`]: response.id };
  S.teams[id].plan.policies = ['save'];
  S.econ.cities[id].pop *= 1.12; S.econ.cities[id].ind *= 1.1;
  S.econ.intl.cur.fuelMul = 1.35;
  S.teams[id].research = { queue: [], prog: {}, stage: { sic: 'done', ccu: 'done', h2mix: 'done', vpp: 'done', smr: 'done' },
    adoptR: { sic: 2, ccu: 2, h2mix: 2, vpp: 2, smr: 2 }, eureka: [], licensedFrom: {}, joint: {} };
  const second = operate(S);
  ok(['sic', 'ccu', 'h2mix', 'vpp', 'smr'].every(k => second.model.mods.tech.includes(k)), '이번 달 실제 도입 기술');
  for (const field of ['renewOutput', 'co2Mul', 'coalCapMul', 'h2Co2', 'drEffect', 'drCost'])
    ok(Object.hasOwn(second.model.mods, field), `${field} 기술 진행 입력 존재`);
  near(second.model.mods.fuelMul.smr, D.params.smrFuelMul.v, 'SMR 연료 기술분(국제 가격분과 분리)');
  ok(second.model.mods.demandRes > first.model.mods.demandRes || first.model.mods.demandRes == null, '실제 수요 배수 차이');
  near(second.model.mods.fuelMul.lng, 1.35, '실제 연료 배수 차이');
  validate(first, second);
});
test('월간 뚜렷한 원인 없음·고르기 생략', () => {
  const S = game();
  ids.forEach(city => { S.teams[city].plan = { builds: [], lines: [], policies: [] }; });
  S.events = [];
  const first = operate(S); C.host(S, 'next', 0); S.events = [];
  const second = operate(S);
  validate(first, second);
  const html = U.uiMath.outageCardsHTML(second.V, second.res, id, {});
  ok(html.includes('뚜렷한 원인 없음') && html.includes('data-single="true"'), '미미한 여섯 몫은 한줄 요약');
  ok(!html.includes('data-missed=') && !html.includes('data-out-tag="largest"'), '큰 보정으로 카드/최대 만들지 않음');
  ok(!teamData().interview.months[2].outageLargest, '최대 몫 기기 기록 없음');
});
test('사본 삭제·손상·중간 참가 = 안내만', () => {
  const S = game(); operate(S); C.host(S, 'next', 0); const { V, res } = operate(S), original = data();
  for (const kind of ['deleted', 'corrupt', 'mismatch']) {
    const d = clone(original);
    if (kind === 'deleted') delete d.outageSnapshots[1];
    if (kind === 'corrupt') d.outageSnapshots[1].mods = null;
    if (kind === 'mismatch') d.outageSnapshots[1].unsPct += 1;
    save(d); resetCache();
    eq(U.uiMath.outageAttribution(V, res, id), null, `${kind} 시험으로 대신하지 않음`);
    const html = U.uiMath.outageCardsHTML(V, res, id, {});
    ok(html.includes('지난달 운영 조건이 이 기기에 없어 나누지 못해요'), `${kind} 지정 안내`);
    ok(!/data-missed=|data-out-other=|data-out-step=|lg-outage-(?:cards|waterfall|single|open)/.test(html), `${kind} 카드/분해/폭포 0`);
  }
});
// 검토자 t1/t2/t2b/t5와 같은 종류의 배치를 독립적으로 생성한다.
// 3도시 정상 시작, 3월 SMR 착공(15월 완공), 태양광 6기 추가 후 다음 달 접속.
function addBuilds(S, kind, count) {
  select();
  const plan = S.teams[id].plan, connected = new Set(plan.lines.flatMap(l => l.p));
  const used = new Set(plan.builds.map(b => b.i));
  const tiles = B.TILES.filter(t => !t.out && t.site < 0 && !used.has(t.i) &&
    !B.siteRule(kind, t) && t.nb.some(i => connected.has(i))).slice(0, count);
  ok(tiles.length === count, `${kind} 독립 픽스처 합법 배치`);
  for (const t of tiles) {
    plan.builds.push({ t: kind, i: t.i });
    plan.lines.push({ p: [t.nb.find(i => connected.has(i)), t.i] });
  }
  return tiles.map(t => `${kind}:${t.i}`);
}
function noFalseCancellation(a, label) {
  const part = k => a.parts.find(p => p.key === k).value;
  const magnitude = Math.abs(part('choice')) + Math.abs(part('growth'));
  // 검토자 결함의 수십 배 상쇄를 잡는 보수적인 상한. 수치 자체를 결과에서 복사하지 않는다.
  const ratio = magnitude / Math.abs(a.total);
  ok(Math.abs(a.total) > .05 && Number.isFinite(ratio), `${label} 0에 가까운 분모가 아닌 실제 변화`);
  ok(ratio <= 2, `${label} (|choice|+|growth|)/|total| ≤2: ${ratio}`);
  console.log(JSON.stringify({ regression: label, total: a.total, choice: part('choice'),
    progress: part('progress'), growth: part('growth'), ratio }));
}
test('SMR 착공·완공: 새 공사 키는 ①, 기존 공사 완료는 ④', () => {
  const S = game({ solarCount: 0, cityIds: [id, 'dangjin', 'asan'], turns: 24 });
  let previous, constructionKey;
  for (let month = 1; month <= 15; month++) {
    if (month > 1) C.host(S, 'next', 0);
    if (month === 3) {
      [constructionKey] = addBuilds(S, 'smr', 1);
      S.teams[id].construction = { [constructionKey]: { startRound: 3, readyRound: 15 } };
    }
    const current = operate(S);
    if (month === 3 || month === 15) {
      eq((current.model.mods.disabledBuilds || []).includes(constructionKey), month === 3, '착공은 미가동·15월은 완공');
      const a = validate(previous, current);
      noFalseCancellation(a, month === 3 ? 'SMR 착공' : 'SMR 완공');
      if (month === 3) near(a.parts.find(p => p.key === 'choice').value, 0, '미완공 SMR을 ①에서 최대 출력으로 돌리지 않음');
      else {
        near(a.parts.find(p => p.key === 'choice').value, 0, '기존 SMR 완공은 선택 몫 0');
        ok(Math.abs(a.parts.find(p => p.key === 'progress').value) > .05 && a.clues.progress.includes('공사 완료 1기'),
          '기존 SMR의 출력 변화·완공 단서는 ④');
      }
    }
    previous = current;
  }
});
test('태양광 추가·접속: 새 reCap은 ①, 기존 할당 진행은 ④', () => {
  const S = game({ solarCount: 0, cityIds: [id, 'dangjin', 'asan'] });
  let previous, added;
  for (let month = 1; month <= 4; month++) {
    if (month > 1) C.host(S, 'next', 0);
    if (month === 3) added = addBuilds(S, 'solar', 6);
    const current = operate(S);
    if (month >= 3) {
      const a = validate(previous, current);
      if (month === 4) {
        const gained = added.reduce((sum, k) => sum + (current.model.mods.reCap[k] || 0) -
          (previous.model.mods.reCap[k] || 0), 0);
        ok(gained > 0, `다음 달 실제 태양광 접속 증가: ${gained} MW`);
        near(a.parts.find(p => p.key === 'choice').value, 0, '기존 태양광 접속은 선택 몫 0');
        ok(Math.abs(a.parts.find(p => p.key === 'progress').value) > .05, '접속의 유의미한 몫은 ④');
        noFalseCancellation(a, '태양광 접속');
      }
    }
    previous = current;
  }
});
test('계절 출력제어·운전 기간은 ②, 비계절 출력제어·기술은 ④', () => {
  const S = game({ solarCount: 20 });
  // 대표 운전 일수가 다른 유효 월 입력. 실제 core 운영부터 재현해 단계 입력을 대조한다.
  S.rounds[4].days = 5; S.rounds[5].days = 9;
  let previous;
  for (let month = 1; month <= 6; month++) {
    if (month > 1) C.host(S, 'next', 0);
    const current = operate(S);
    if (month === 6) {
      ok(previous.model.mods.curtailP > 0, '계절 계수 회귀가 0 배수로 무력화되지 않는 배치');
      eq([previous.res.season, current.res.season], ['spring', 'summer'], '봄→여름 실제 계절 전환');
      eq([previous.res.days, current.res.days], [5, 9], '실제 대표 운전 일수 차이');
      validate(previous, current);
    }
    previous = current;
  }
});
// 검토자 h2/h1.js의 월·선택 경로를 재현하되 기대값은 위 독립 oracle로 계산한다.
// 실제 plan reduce를 거쳐 같은 키의 접속 취소·공사 재시작·ESS 철거를 발생시킨다.
for (const scenario of ['rebuild', 'smrrebuild', 'ess']) test(`${scenario}: 같은 자리 재건설·ESS 철거는 ①`, () => {
  const S = game({ solarCount: 0, cityIds: [id, 'dangjin', 'asan'] });
  S.teams[id].token = 'tok-s7-fixture';
  if (scenario === 'smrrebuild') S.teams[id].research = { adopted: [], adoptR: { smr: 2 } };
  let previous, rev = 100;
  function submit(plan) {
    const result = C.reduce(S, { type: 'plan', team: id, token: S.teams[id].token,
      rev: ++rev, plan: clone(plan) }, 0, B);
    ok(result.ok, `${scenario} 실제 계획 reduce 승인`);
  }
  function add(kind, count) {
    const draft = clone(S); addBuilds(draft, kind, count); submit(draft.teams[id].plan);
  }
  for (let month = 1; month <= (scenario === 'ess' ? 8 : 6); month++) {
    if (month > 1) C.host(S, 'next', 0);
    if (month === 3) {
      if (scenario === 'ess') { add('solar', 12); add('battery', 3); }
      else add(scenario === 'rebuild' ? 'solar' : 'smr', 1);
      if (scenario === 'smrrebuild')
        Object.values(S.teams[id].construction).forEach(c => { c.readyRound = 4; });
    }
    const changedMonth = scenario === 'ess' ? 8 : 6;
    if (month === changedMonth) {
      const plan = clone(S.teams[id].plan);
      const removed = scenario === 'ess' ? plan.builds.filter(b => B.BLD[b.t].cls === 'bat') :
        [plan.builds.find(b => b.t === (scenario === 'rebuild' ? 'solar' : 'smr'))];
      ok(removed.length === (scenario === 'ess' ? 3 : 1), `${scenario} 실제 철거할 설비 존재`);
      const removeKeys = new Set(removed.map(b => `${b.t}:${b.i}`));
      submit({ ...plan, builds: plan.builds.filter(b => !removeKeys.has(`${b.t}:${b.i}`)) });
      if (scenario !== 'ess') submit(plan);
    }
    const current = operate(S);
    if (month === changedMonth) {
      const a = validate(previous, current), expected = oracle(previous.model, current.model);
      const part = k => a.parts.find(p => p.key === k).value;
      const decreased = previous.model.plan.builds.filter(b => current.model.plan.builds.some(c => c.t === b.t && c.i === b.i))
        .reduce((sum, b) => sum + Math.max(0, (previous.model.mods.reCap[`${b.t}:${b.i}`] || 0) -
          (current.model.mods.reCap[`${b.t}:${b.i}`] || 0)), 0);
      if (scenario === 'smrrebuild') {
        ok(part('choice') > 10, '완공 SMR 재건설의 큰 정전 증가가 내 선택');
        ok(a.clues.choice.includes('공사 재시작 1기') && a.clues.progress.includes('공사 완료 0기'),
          'SMR 재시작 단서는 선택, 완료로 꾸미지 않음');
      } else {
        ok(decreased > 0 && a.clues.choice.includes('접속 감소'), `${scenario} 접속 감소는 선택 단서`);
        ok(part('choice') > .05, `${scenario} 접속 감소의 유의미한 몫은 내 선택`);
      }
      if (scenario !== 'ess') near(part('progress'), 0, `${scenario} 재건설 달 자연 진행 몫 0`);
      else {
        near(part('progress'), 0, 'ESS 철거의 출력제어 변화도 ①로 가므로 진행 몫 0');
        ok(expected.stages[1][4].curtailP < previous.model.mods.curtailP,
          'ESS 철거의 ① 출력제어는 지난달 값을 복사하지 않고 실제로 감소');
        near(expected.stages[1][4].curtailP, current.model.mods.curtailP,
          'ESS 철거만 있는 달의 ① 출력제어 = 이번 접속의 독립 출력제어');
      }
      // 감소를 ④로 넘기는 회귀는 전체 단계 입력과 선택 독립 몫 대조가 함께 잡는다.
      near(part('choice'), expected.parts.find(p => p.key === 'choice').value, `${scenario} 독립 선택 몫`);
      ok(!/접속 −/.test(a.clues.progress), `${scenario} 진행 단서에 접속 감소 없음`);
      console.log(JSON.stringify({ regression: scenario, month, decreasedMW: decreased,
        choice: part('choice'), progress: part('progress'), growth: part('growth') }));
    }
    previous = current;
  }
});

// h3/tie.js를 실행하거나 사본을 가져오지 않는다. 정상 시작·3월 태양광 14기와
// 4 MW 연계선·8월 접속점 전선 삭제를 독립 생성한다. 이웃/우리 단절을 같은 조건으로 비교.
function cutTiePort(S, city, other) {
  B.selectPack(C.teamDef(R, city).pack, 'league');
  const ports = B.SITES.filter(s => s.kind === 'gridpt' && (s.to || []).includes(other)).map(s => s.tile);
  ok(ports.length > 0, '독립 지도에 상대 도시 연계선 접속점 존재');
  const cutTiles = new Set(ports.flatMap(i => [i, ...B.TILES[i].nb]));
  const plan = S.teams[city].plan, before = plan.lines.length;
  plan.lines = plan.lines.filter(l => !l.p.some(i => cutTiles.has(i)));
  ok(plan.lines.length < before, '실제 접속점 전선 삭제');
  select();
  return before - plan.lines.length;
}
for (const side of ['neighbor', 'own']) test(`${side} 연계선 접속점 전선 단절의 ①/④ 귀속`, () => {
  const S = game({ solarCount: 0, cityIds: [id, 'dangjin', 'asan'] });
  S.teams[id].token = 'tok-s7-tie-fixture';
  let previous, removedLines;
  for (let month = 1; month <= 8; month++) {
    if (month > 1) C.host(S, 'next', 0);
    if (month === 3) {
      const draft = clone(S); addBuilds(draft, 'solar', 14);
      ok(C.reduce(S, { type: 'plan', team: id, token: S.teams[id].token,
        rev: 101, plan: draft.teams[id].plan }, 0, B).ok, '연계선 회귀 실제 태양광 계획 승인');
      S.ties.push({ a: id, b: 'dangjin', cap: 4, st: 'built', round: 3 });
    }
    if (month === 8) removedLines = cutTiePort(S, side === 'neighbor' ? 'dangjin' : id,
      side === 'neighbor' ? id : 'dangjin');
    const current = operate(S);
    if (month === 8) {
      const saved = clone(data()), savedTeam = teamData(), a = validate(previous, current);
      const part = key => a.parts.find(p => p.key === key).value;
      const lostHost = previous.model.grid.hostMW - current.model.grid.hostMW;
      const lostConnected = previous.model.grid.connectedMW - current.model.grid.connectedMW;
      near(lostHost, 4 * D.params.hostTieMul.v, '연계선 단절로 독립 접속 상한 감소');
      ok(lostConnected > 0, '연계선 회귀 실제 기존 접속 감소');
      near(saved.outageSnapshots[7].hostMW, previous.model.grid.hostMW, '지난달 사본 접속 상한 보존');
      near(saved.outageSnapshots[7].tieHostMW, lostHost, '지난달 사본 실제 연계선 상한 몫');
      eq(saved.outageSnapshots[7].hostTies, [['dangjin', lostHost]], '지난달 사본 이웃 연결 상태·용량');
      if (side === 'neighbor') {
        eq(current.model.plan, previous.model.plan, '이웃 단절 전후 우리 계획 불변');
        eq(removedLines, 2, 'h3 재현과 같은 이웃 전선 2개 삭제');
        near(part('choice'), 0, '우리 계획 불변이면 이웃 단절 선택 몫 ≈ 0');
        ok(part('progress') > .05, '이웃 접속 감소의 유의미한 정전 증가가 ④');
        const neighborClue = a.clues.progress.match(/연계선 변화\(이웃 단절·새 연계선\)로 접속 −([\d.,]+) MW/);
        ok(neighborClue, '④ 단서에 이웃 연계선 감소 MW 명시');
        near(neighborClue ? +neighborClue[1].replaceAll(',', '') : NaN, lostHost,
          '④ 이웃 연계선 단서의 감소량 = 독립 접속 상한 감소');
        ok(!a.clues.choice.includes('접속 감소'), '이웃 단절을 우리 선택의 접속 감소로 표시하지 않음');
        // C-fix3: 연계선 정보가 없는 옛 사본은 실제 접속 할당의 min을 유지한다.
        for (const field of ['hostMW', 'tieHostMW', 'hostTies']) delete saved.outageSnapshots[7][field];
        save(saved); saveTeam(savedTeam); resetCache();
        const legacy = validate(previous, current, 0, { legacyTies: true });
        ok(legacy.parts.find(p => p.key === 'choice').value > .05, '옛 사본은 기존 접속 감소 계산으로 ①');
        near(legacy.parts.find(p => p.key === 'progress').value, 0, '옛 사본은 이웃 복원을 새로 추측하지 않음');
        ok(!legacy.clues.progress.includes('이웃 연계선'), '옛 사본은 이웃 상태 단서 생성 없음');
      } else {
        ok(part('choice') > .05, '우리 전선 단절의 유의미한 접속 감소는 ①');
        near(part('progress'), 0, '우리 전선 단절을 자연 진행 감소로 넘기지 않음');
        ok(a.clues.choice.includes('접속 감소') && a.clues.choice.includes('전선 변경'),
          '우리 전선 단절은 선택의 접속 감소·전선 변경 단서');
        ok(!a.clues.progress.includes('이웃 연계선'), '우리 전선 단절을 이웃 단절로 꾸미지 않음');
      }
      console.log(JSON.stringify({ regression: `tie-${side}`, removedLines, lostHost, lostConnected,
        choice: part('choice'), progress: part('progress'), clue: a.clues.progress }));
    }
    previous = current;
  }
});

test('이번 달 사본 재사용 조건: unsPct·seed·days·season 불일치 시 재생성', () => {
  for (const waiting of [false, true]) {
    const S = game({ solarCount: waiting ? 10 : 0 }), first = operate(S);
    C.host(S, 'next', 0); const second = operate(S);
    eq(second.model.grid.waitingMW > 0, waiting, '재생성 호출 수의 대기 유무 픽스처');
    const original = data(), expected = oracle(first.model, second.model);
    for (const field of ['unsPct', 'seed', 'days', 'season']) {
      const d = clone(original), snap = d.outageSnapshots[2];
      snap[field] = field === 'season' ? 'summer' : snap[field] + 1;
      save(d); resetCache(); calls = [];
      const a = U.uiMath.outageAttributionMonthly(second.V, second.res, id);
      ok(a, `${field} 불일치 사본을 재생성해 분해`);
      eq(calls.length, waiting ? 7 : 6, `${field} 사본 생성은 월간 기준 +1회`);
      eq(a.simulations, calls.length, `${field} 보고 호출 수`);
      near(a.actual, second.res.team[id].unsPct, `${field} 실제값은 결과 기준`);
      expected.parts.forEach(p => near(a.parts.find(x => x.key === p.key)?.value, p.value, `${field} ${p.key} 독립 몫`));
      const count = calls.length; U.uiMath.outageAttributionMonthly(second.V, second.res, id);
      eq(calls.length, count, `${field} 재생성 뒤 캐시 실행 0`);
    }
  }
});
test('월간 재현 표시 문턱: 양·음 0.004999/0.005/0.005001%p', () => {
  const S = game(), first = operate(S); C.host(S, 'next', 0); const second = operate(S);
  const base = U.uiMath.outageAttributionMonthly(second.V, second.res, id);
  for (const value of [.004999, .005, .005001, -.004999, -.005, -.005001]) {
    // 계산 픽스처와 분리한 저장 분해 렌더링 검사: 정확한 경계값을 전달한다.
    const frozen = { ...clone(base), replay: value };
    const html = U.uiMath.outageCardsHTML(second.V, second.res, id, { outageOpened: true, outageFrozen: frozen });
    eq(rows(html).some(r => r.key === 'replay'), false, `${value} 재현은 폭포 합계에 없음`);
    ok(!html.match(/aria-label="[^"]*재현 차이/), `${value} 폭포 aria 합계에서도 재현 제외`);
    eq(html.includes('id="lg-outage-replay"'), Math.abs(value) >= .005, `${value} 월간 재현 설명`);
  }
});
test('큰 재현 차이만으로 거래 후보·최대·고르기 분기가 바뀌지 않음', () => {
  const S = game({ solarCount: 0 });
  ids.forEach(city => { S.teams[city].plan = { builds: [], lines: [], policies: [] }; });
  S.events = [];
  const first = operate(S); C.host(S, 'next', 0); S.events = [];
  const second = operate(S), baseline = clone(U.uiMath.outageAttributionMonthly(second.V, second.res, id));
  const changed = validate(first, second, -25);
  const beforeTrade = baseline.parts.find(p => p.key === 'trade').value;
  const afterTrade = changed.parts.find(p => p.key === 'trade').value;
  near(afterTrade, beforeTrade, '재현 진단만 달라질 때 거래 후보 불변');
  eq(changed.parts, baseline.parts, '재현 진단만 달라질 때 성장 포함 여섯 몫 불변');
  const html = U.uiMath.outageCardsHTML(second.V, second.res, id, {});
  ok(html.includes('뚜렷한 원인 없음'), '큰 재현 보정만으로 거래가 최대 후보가 되지 않음(재현은 후보 밖)');
  ok(!session.outShownPending?.largest, '큰 재현 보정만으로 최대 원인 저장 금지(재현은 후보 밖)');
  console.log(JSON.stringify({ regression: '재현→거래 혼입', replay: changed.replay, beforeTrade, afterTrade,
    total: changed.total, sum: changed.parts.reduce((sum, p) => sum + p.value, 0) }));
});
test('열지 않은 월간 선택도 다음 달 타임라인 이름을 월간 기준으로 유지', () => {
  const S = game(); operate(S); C.host(S, 'next', 0); operate(S);
  const d = teamData();
  d.interview = { months: { 2: { missed: 'weather', missedBasis: 'monthly' } } }; saveTeam(d);
  // 실제 선택 저장의 missedBasis는 s7.py에서 클릭 직후 검사한다.
  C.host(S, 'next', 0); const current = operate(S);
  const before = clone(teamData().interview.months[2]);
  const html = U.uiMath.trendHTML(current.V, id, true);
  ok(html.includes('놓친 것: 날씨·계절·운전 기간'), '옛 frozen 없이 missedBasis만으로 월간 이름');
  ok(!html.includes('놓친 것: 날씨·운전 기간') && !html.includes('가장 큰 몫'),
    '열지 않은 선택을 시험 이름·최대 답으로 꾸미지 않음');
  eq(teamData().interview.months[2], before, '닫힌 선택의 다음 달 렌더링은 기록 불변');
});
test('분리 전 저장: S7 사본만 옮기고 일지·답변과 월간 분해 보존', () => {
  const S = game(); operate(S); C.host(S, 'next', 0); const { V, res } = operate(S);
  resetCache();
  const before = U.uiMath.outageAttributionMonthly(V, res, id);
  ok(before?.basis === 'monthly' && before.parts.length === 6, '이전 비교용 월간 분해 실제 생성');
  const beforeHTML = U.uiMath.outageCardsHTML(V, res, id, { outageOpened: true });
  const snapshots = data();
  snapshots.outageOperatingIntl = { round: res.round, intl: clone(V.econ.intl.cur || V.econ.intl) };
  const notes = { docs: { fixture: { journal: '가상 도시 일지' } }, journal: { fixture: '가상 일지' },
    interview: { months: { 2: { answer: '가상 답변', missed: 'weather', missedBasis: 'monthly' } } } };
  saveTeam({ ...clone(notes), ...clone(snapshots) }); storage.delete(key); resetCache();
  ok(!storage.has(key) && Object.hasOwn(teamData(), 'outageSnapshots') &&
    Object.hasOwn(teamData(), 'outageOperatingIntl'), '분리 전 팀 자료만 있고 별도 S7 키 없음');
  const afterHTML = U.uiMath.outageCardsHTML(V, res, id, { outageOpened: true });
  eq(data(), snapshots, '첫 월간 그리기에서 두 S7 필드 원본 그대로 이전');
  eq(teamData(), notes, 'S7 필드 제거 후 팀 자료의 일지·답변 전체 보존');
  // 다시 계산한 실행 시간만 비교에서 제외한다. 수치·단서·호출 수는 그대로 비교한다.
  const withoutTiming = html => html.replace(/ data-ms="[^"]*"/, '');
  eq(withoutTiming(afterHTML), withoutTiming(beforeHTML), '이전 전후 월간 분해 화면 동일');
  const { ms: beforeMs, ...beforeResult } = before;
  const { ms: afterMs, ...afterResult } = U.uiMath.outageAttributionMonthly(V, res, id) || {};
  eq(afterResult, beforeResult, '이전 전후 월간 분해 결과 동일');
  resetCache();
  eq(withoutTiming(U.uiMath.outageCardsHTML(V, res, id, { outageOpened: true })), withoutTiming(beforeHTML), '다시 그려도 이전 결과 유지');
  eq(data(), snapshots, '다시 읽어도 S7 사본·운영 지수 유지');
  eq(teamData(), notes, '다시 읽어도 팀 자료에 S7 필드 재생성 없음');
});
test('크기 순위와 다른 카드 배치 실제 실행', () => ok(orderDiffers > 0, '크기순 회귀를 잡을 사례 존재'));
console.log(`S7 monthly: ${checks} assertions, ${failures} failures`);
process.exitCode = failures ? 1 : 0;
