'use strict';
// S7-fix3.md: 카드 집합/분해 순서·최대 아닌 선택·미미한 몫·재시험·실패 문구.
// 실행: node tests/league/review/30-s7-attribution.js (브라우저 없음)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const clone = x => JSON.parse(JSON.stringify(x));
const storage = new Map();
const session = { room: 'S7FIXTURE', team: 'pyeongtaek', outCache: {} };
const ctx = vm.createContext({ console, performance, structuredClone, __session: session,
  document: { documentElement: {}, addEventListener() {} }, addEventListener() {},
  localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
  KCP: { route() {}, on() {}, esc: s => String(s), leagueNet: {} } });
ctx.window = ctx;
vm.runInContext('Math.random = () => { throw Error("unseeded random"); };', ctx);
for (const name of ['build-maps', 'tech-data', 'build', 'econ-data', 'econ', 'league-data', 'league-core']) {
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, `../../../ui/${name}.js`), 'utf8'), ctx);
}
// DOM 없는 세션 어댑터: 메모리에서 L 초기값만 연결한다. 원본 파일, 계산 함수,
// simulate/modsFor/publicView는 변경하지 않는다. 미노출 함수를 추출하지 않는다.
const source = fs.readFileSync(path.resolve(__dirname, '../../../ui/league.js'), 'utf8');
assert.equal(source.split('let L = null;').length, 2, 'VM 세션 연결점 1개');
vm.runInContext(source.replace('let L = null;', 'let L = globalThis.__session;'), ctx);
const { leagueCore: C, buildGame: B, ECON_DATA: D, league } = ctx.KCP;
assert.equal(typeof league.uiMath.outageAttribution, 'function', '공개 분해 검사 API');
const attribution = league.uiMath.outageAttribution;
const R = C.regionOf('south'), id = session.team, ids = [id, 'dangjin'];
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; }
function near(a, b, label) { ok(Number.isFinite(a) && Math.abs(a - b) <= 1e-9, `${label}: ${a} / ${b}`); }
function equal(a, b, label) { assert.deepEqual(clone(a), clone(b), label); checks++; }
const simulate = B.simulate;
let calls = [];
B.simulate = (...args) => { calls.push(clone(args)); return simulate(...args); };

function fixture({ changed = false, replayOffset = 0, sameWeather = false, noEvents = false, month = 1 } = {}) {
  session.outCache = {};
  session.outFailures = {};
  session.outShownPending = null;
  delete session.interview;
  const S = C.newState(session.room, R.id, 0, ids, { turns: 12, seedMode: 'fixed' });
  C.host(S, 'next', 0);
  for (const city of ids) S.teams[city].plan = clone(D.normalStartPlans[city]);
  B.selectPack(C.teamDef(R, id).pack, 'league');
  if (noEvents) {
    // 무사건이어도 선택·날씨의 두 몫이 생기도록 합법적인 연결 태양광 배치.
    const plan = S.teams[id].plan, connected = new Set(plan.lines.flatMap(l => l.p));
    const tiles = B.TILES.filter(t => !t.out && t.site < 0 && !B.siteRule('solar', t) &&
      t.nb.some(i => connected.has(i))).slice(0, 10);
    ok(tiles.length === 10, '무사건 카드 시나리오 태양광 배치 가능');
    for (const t of tiles) {
      plan.builds.push({ t: 'solar', i: t.i });
      plan.lines.push({ p: [t.nb.find(i => connected.has(i)), t.i] });
    }
  }
  // 첫 달 새 재생 설비는 접속 대기. 다음 달 진입으로 실제 접속 절차를 거친다.
  for (let m = 1; m < month; m++) { C.run(S, B, 0); C.host(S, 'next', 0); }
  if (sameWeather || noEvents) S.events = [];
  B.selectPack(C.teamDef(R, id).pack, 'league');
  const plan = clone(S.teams[id].plan), rd = C.roundsOf(S)[S.round - 1];
  const seed = sameWeather ? 7013 : 1;
  // 이 픽스처는 재현 경로와 같은 C.trialMods로 시험을 만든다. 같은 계획의
  // replay=0은 구조상 성립하므로 실제 시험 경로의 독립 검증은 아니다.
  // s7.py가 UI로 시험한 뒤 계획을 유지한 달에 |replay| < 0.01%p를 검사한다.
  const s = simulate({ ...B.sanitize(plan, 1e9), seed, season: rd.season }, 7,
    { league: true, mods: C.trialMods(S, R, id) });
  const scope = JSON.stringify([session.room, id]), map = C.teamDef(R, id).pack;
  const trial = { map, scope, year: rd.year, month: rd.month, season: rd.season,
    seed, days: 7, unsPct: 100 * s.unsTotal / s.tot.dem + replayOffset,
    outH: 0, co2: s.co2, cost: s.cost.total, plan };
  storage.set('kcp-build-trial-v1', JSON.stringify({ [JSON.stringify([scope, map])]: trial }));
  if (changed) S.teams[id].plan.policies = ['save'];
  const res = C.run(S, B, 0), V = C.publicView(S, 0);
  calls = [];
  return { S, V, res, trial };
}

const causes = ['choice', 'weather', 'event', 'trade'];
let orderDiffersFromRank = 0, nonlargestCases = 0, noCauseCases = 0;
function cardOrder(html, ranked, label) {
  const keys = [...html.matchAll(/data-missed="([^"]+)"/g)].map(m => m[1]);
  const top = ranked.slice(0, 3).map(p => p.key);
  equal([...keys].sort(), [...new Set(top)].sort(), `${label}: 절댓값 상위 세 원인 집합`);
  equal(keys, causes.filter(key => keys.includes(key)), `${label}: 분해 순서의 부분열`);
  if (JSON.stringify(keys) !== JSON.stringify(top)) orderDiffersFromRank++;
}
function rendered(a, html, label) {
  const rows = [...html.matchAll(/data-out-step="([^"]+)" data-out-value="([^"]+)"/g)];
  const hasReplay = Math.abs(a.replay) >= .01;
  equal(rows.map(m => m[1]), ['trial', ...(hasReplay ? ['replay'] : []), ...causes, 'actual'],
    `${label}: 겹침 없이 시험 + 별도 재현 차이 + 네 원인 + 실제`);
  equal(html.includes('id="lg-outage-replay"'), hasReplay, `${label}: 0.01%p 미만 재현 설명 생략`);
  ok(Math.abs(rows.filter(m => m[1] !== 'actual').reduce((s, m) => s + Number(m[2]), 0) - a.actual) <= .02,
    `${label}: 생략된 재현 차이를 고려한 폭포 합계 ±0.02%p`);
  const candidateKeys = [...html.matchAll(/data-(?:missed|out-other)="([^"]+)"/g)].map(m => m[1]);
  ok(candidateKeys.every(k => causes.includes(k)), `${label}: 후보는 네 원인 안에서만`);
  ok(html.includes('날씨·운전 기간') && html.includes('뒤 단계 몫'), `${label}: 표시 이름·순서 의존 안내`);
  ok(/id="lg-outage-waterfall"[^>]*role="img"[^>]*aria-label="[^"]*시험 [\d.,]+%/.test(html),
    `${label}: 폭포 이미지 역할과 수치 요약`);
  const aria = html.match(/id="lg-outage-waterfall"[^>]*aria-label="([^"]+)"/)[1];
  for (const name of ['내 선택', '날씨·운전 기간', '사건', '이웃 거래', '실제']) {
    ok(aria.includes(name), `${label}: 접근성 요약에 ${name}`);
  }
  ok(/id="lg-outage-verdict"[^>]*tabindex="-1"/.test(html), `${label}: 판정 머리 초점 대상`);
  ok(html.includes('>2022 기출로 연습하기</a>'), `${label}: 2022 링크 문구`);
}

for (const options of [{ sameWeather: true }, { sameWeather: true, replayOffset: .009 },
  { sameWeather: true, replayOffset: -.011 }, { sameWeather: true, replayOffset: .125 },
  { changed: true }, { changed: true, noEvents: true, month: 2 }, { changed: true, month: 2 }]) {
  const { S, V, res, trial } = fixture(options);
  const before = JSON.stringify({ S, V, trial });
  const a = attribution(V, res, id);
  ok(a, '당시 시험·공개 상태로 분해 가능');
  equal(a.parts.map(p => p.key), causes, 'parts는 네 원인만, 재현 차이·겹침은 후보 아님');
  ok(Number.isFinite(a.replay), '재현 차이는 별도 숫자');
  near(a.trial, trial.unsPct, '시험 출발값');
  near(a.actual, res.team[id].unsPct, '실제 도착값');
  near(a.total, a.actual - a.trial, '정전율 차이 단위 %p');
  near(a.replay + a.parts.reduce((sum, p) => sum + p.value, 0), a.total, '재현 차이 + 네 원인 합계 항등식 1e-9');
  ok(calls.length > 0 && calls.length <= 5, '추가 simulate 실제 호출 ≤5');
  equal(a.simulations, calls.length, '보고된 호출 수 = 실제 호출 수');
  equal(calls.map(([plan]) => plan.seed), [trial.seed, trial.seed, res.seed, res.seed, res.seed],
    '13–15행: 재현·계획은 시험 씨앗, 이후 단계는 실제 씨앗');
  equal(calls.map(([, days]) => days), [trial.days, trial.days, res.days, res.days, res.days],
    '13–15행: 날씨 단계부터 실제 운영 일수');
  equal(calls[0][0].policies, trial.plan.policies || [], '재현 단계에 시험 정책');
  equal(calls[1][0].policies, V.teams[id].plan.policies || [], '선택 단계에 실제 정책');
  ok(Number.isFinite(a.ms) && a.ms >= 0, '계산 시간 유한값(성능 합격선 없음)');
  ok(Number.isFinite(a.grid.value) && Number.isFinite(a.grid.waitingMW), '접속 대기 별도 반사실');
  const part = key => a.parts.find(p => p.key === key).value;
  if (options.sameWeather) {
    near(a.replay, -(options.replayOffset || 0), '재현 차이 = 재계산 − 저장 시험');
    for (const key of ['choice', 'weather', 'event']) near(part(key), 0, `동일 계획·날씨·무사건 ${key}=0`);
  } else if (!options.noEvents && options.month !== 2) {
    ok(Math.abs(part('choice')) >= .05 && Math.abs(part('event')) >= .05,
      '정상 연결 배치 + 시험 뒤 절전 정책은 고르기 생략 대상이 아님');
  }
  // 반환값만 비교하면 재계산을 놓친다. 실제 엔진 호출 수와 참조 동일성도 검사한다.
  const count = calls.length;
  ok(attribution(V, res, id) === a, '같은 도시·달 결과 캐시 반환');
  equal(calls.length, count, '캐시 재열기 추가 시뮬레이션 0');
  equal(JSON.stringify({ S, V, trial }), before, '원래 운영·공개 상태·시험 자료 불변');
  const ranked = [...a.parts].sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
  const closedNote = {}, closed = league.uiMath.outageCardsHTML(V, res, id, closedNote);
  equal(closedNote, {}, 'HTML 생성만으로 열기·요약 표시·최대 몫 기록 금지');
  if (ranked.slice(1).some(p => Math.abs(p.value) >= .05)) {
    cardOrder(closed, ranked, '열기 전');
    ok(!/data-out-value=|가장 큰 몫/.test(closed), '열기 전 원인 수치·최대 몫 비공개');
  }
  const html = league.uiMath.outageCardsHTML(V, res, id, { outageOpened: true, missed: ranked[0].key });
  rendered(a, html, JSON.stringify(options));
  if (ranked.slice(1).some(p => Math.abs(p.value) >= .05)) {
    cardOrder(html, ranked, '열기 뒤');
    const picked = ranked.slice(1, 3).find(p => .05 <= Math.abs(p.value) &&
      Math.abs(p.value) < Math.abs(ranked[0].value));
    ok(picked, '최대가 아닌 유의미한 카드 사례 존재');
    const wrong = league.uiMath.outageCardsHTML(V, res, id, { outageOpened: true, missed: picked.key });
    ok(wrong.includes('몫은 있지만 가장 크지 않았어요'), '최대가 아닌 선택의 판정 분기');
    const tagged = tag => [...wrong.matchAll(/<button\b[^>]*data-missed="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)]
      .filter(m => m[2].includes(`data-out-tag="${tag}"`)).map(m => m[1]);
    equal(tagged('picked'), [picked.key], '내가 고름은 선택한 카드에만');
    equal(tagged('largest'), [ranked[0].key], '가장 큼은 다른 최대 카드에만');
    nonlargestCases++;
  }
  if (a.parts.every(p => Math.abs(p.value) < .05)) {
    ok(closed.includes('data-single="true"') && closed.includes('뚜렷한 원인 없음'),
      '모든 몫 < 0.05%p이면 뚜렷한 원인 없음');
    ok(!closed.includes('가장 큰 몫') && !closed.includes('data-out-tag="largest"'),
      '미미한 몫을 최대 원인으로 표시하지 않음');
    ok(session.outShownPending && !session.outShownPending.largest,
      '미미한 몫은 표시 후 저장 대기 자료에도 최대 몫 없음(실제 저장은 브라우저 검사)');
    noCauseCases++;
  }
  if (options.noEvents) {
    ok(closed.includes('data-single="false"'), '무사건 달에도 여러 원인의 카드 분기 실행');
    near(part('event'), 0, '사건 없는 달의 사건 몫 0');
    ok(html.includes('우리 도시에 해당하는 사건 없음'), '무사건 단서');
  }
  if (options.month === 2) {
    equal(res.round, 2, '실제 엔진으로 2월까지 진행');
    ok(/id="lg-outage-baseline"[^>]*>[^<]*약속[^<]*지난달 대비[^<]*나누기[^<]*시험 1주 대비/.test(html),
      '2월 약속은 지난달 대비·나누기는 시험 대비 안내');
  }
  console.log(JSON.stringify({ options, ms: a.ms, simulations: a.simulations, replay: a.replay, parts: a.parts }));
}
ok(orderDiffersFromRank > 0, '크기 순위와 표시 순서가 실제로 다른 사례 실행');
ok(nonlargestCases > 0, '최대가 아닌 선택 사례 실행');
ok(noCauseCases > 0, '모든 몫 < 0.05%p 사례 실행');

// 17행: 운영 뒤 바뀐 인구를 사용하면 분해가 달라지는 회귀를 잡는다.
{
  const { V, res } = fixture({ changed: true });
  const baseline = clone(attribution(V, res, id));
  session.outCache = {};
  V.econ.cities[id].pop *= 2;
  V.econ.cities[id].ind *= 2;
  const after = attribution(V, res, id);
  equal(after.parts, baseline.parts, '분해 수요는 econ.before의 운영 당시 주민·산업');
}

for (const kind of ['no-trial', 'plan-phase', 'later-month', 'missing-event-size', 'missing-before', 'zero-days']) {
  const { V, res } = fixture({ changed: true });
  if (kind === 'no-trial') storage.delete('kcp-build-trial-v1');
  if (kind === 'plan-phase') V.phase = 'plan';
  if (kind === 'later-month') V.round++;
  if (kind === 'missing-event-size') delete V.events[0].x;
  if (kind === 'missing-before') delete V.econ.before;
  if (kind === 'zero-days') res.days = 0;
  equal(attribution(V, res, id), null, `17–19행: ${kind}는 계산하지 않음`);
  equal(calls.length, 0, `${kind} 시뮬레이션 0`);
  if (['missing-before', 'missing-event-size', 'zero-days'].includes(kind)) {
    const html = league.uiMath.outageCardsHTML(V, res, id, {});
    ok(!html.includes('한 번 더 시도') && html.includes('이번 달은 원인 나누기를 표시하지 않아요'),
      `${kind}: 구조적 null은 재시도 약속 없이 이번 달 표시 불가 안내`);
  }
}
// 재현 차이가 가장 커도 후보 순위·고르기 생략 판정에 넣지 않는다.
{
  const { V, res } = fixture({ sameWeather: true, replayOffset: .125 });
  const html = league.uiMath.outageCardsHTML(V, res, id, {});
  ok(html.includes('data-single="true"') && html.includes('id="lg-outage-single"'),
    '다른 몫이 모두 0.05%p 미만이면 한 줄 요약');
  ok(!html.includes('data-missed=') && !html.includes('id="lg-outage-open"'),
    '한 원인 분기는 고르기 강요 없음');
  ok(!session.outShownPending.largest && html.includes('뚜렷한 원인 없음'),
    '재현 차이가 커도 모든 원인이 미미하면 최대 몫 저장 대기 없음');
}

// 열기 전 같은 결과 화면에서 시험이 바뀌면 새 시험 기준으로 다시 계산한다.
for (const field of ['seed', 'days', 'plan']) {
  const { V, res, trial } = fixture({ changed: true });
  const before = attribution(V, res, id), next = clone(trial);
  if (field === 'plan') next.plan.policies = ['save'];
  else next[field]++;
  const bucket = JSON.parse(storage.get('kcp-build-trial-v1'));
  bucket[Object.keys(bucket)[0]] = next;
  storage.set('kcp-build-trial-v1', JSON.stringify(bucket));
  calls = [];
  const after = attribution(V, res, id);
  ok(after && after !== before && calls.length > 0 && calls.length <= 5, `${field} 변경 시 새 분해`);
  if (field !== 'plan') equal(field === 'seed' ? calls[0][0].seed : calls[0][1], next[field], `${field} 새 시험 입력`);
  else equal(calls[0][0].policies, next.plan.policies, '새 시험 계획 입력');
}

// DOM 없는 검사는 렌더러가 만든 저장 대기 자료를 직렬화해 기기 메모에 연결한다.
// 실제 클릭 → localStorage 저장 → 1달 재시험 → 새로고침은 s7.py에서 별도로 검사한다.
for (const single of [false, true]) {
  const { V, res, trial } = fixture(single ? { sameWeather: true } : { changed: true });
  session.role = 'solo';
  const a = attribution(V, res, id);
  const ranked = [...a.parts].sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
  const note = { evidence: { text: '가상 근거' }, pred: { uns: 'down' } };
  if (!single) Object.assign(note, { outageOpened: true, missed: ranked[1].key });
  const beforeHTML = league.uiMath.outageCardsHTML(V, res, id, note);
  const pending = session.outShownPending;
  ok(pending?.frozen, `${single ? '요약' : '열기'}: 표시 시점 분해 저장 대기 자료 존재`);
  note.outageFrozen = clone(pending.frozen);
  if (single) note.outageSingleShown = true;
  if (pending.largest) note.outageLargest = clone(pending.largest);
  note.missedCarry = { missed: single ? '뚜렷한 원인 없음' : note.missed,
    ...(pending.largest ? { largest: clone(pending.largest) } : {}) };
  session.interview = { interview: { months: { [res.round]: note } } };
  const saved = clone(note);
  const bucket = JSON.parse(storage.get('kcp-build-trial-v1'));
  bucket[Object.keys(bucket)[0]] = { ...trial, days: 30, seed: trial.seed + 1 };
  storage.set('kcp-build-trial-v1', JSON.stringify(bucket));
  session.outCache = {};
  calls = [];
  const after = attribution(V, res, id);
  equal(after, a, '공개 뒤 저장 시험·캐시가 바뀌어도 연 시점 분해 유지');
  const afterHTML = league.uiMath.outageCardsHTML(V, res, id, note);
  // 붙이기 버튼의 저장 여부만 달라지고, 카드 꼬리표·폭포·판정은 같아야 한다.
  const display = html => html.split('<button type="button" class="v2-btn" id="lg-outage-carry"')[0];
  equal(display(afterHTML), display(beforeHTML), '재시험 뒤 꼬리표·막대·판정 표시 불변');
  equal(note, saved, '재시험 뒤 기기 메모의 최대 몫·다음 달 기록 불변');
  equal(calls.length, 0, '이미 공개한 달의 재시험 뒤 분해 재시뮬레이션 0');
  if (single) {
    ok(!note.outageLargest && !note.missedCarry.largest, '미미한 몫의 기록에는 최대 몫 없음');
    const timeline = league.uiMath.trendHTML(V, id, true);
    ok(timeline.includes('뚜렷한 원인 없음') && !timeline.includes('가장 큰 몫'),
      '미미한 몫의 타임라인: 뚜렷한 원인 없음');
  }
}

// 렌더링 오류를 한꺼번에 보고하되 실패 종료를 유지한다. 문구 예외로 완화하지 않는다.
const failures = [];
for (const state of ['before-open', 'correct-prediction', 'opened', 'single-shown']) {
  const { V, res } = fixture({ changed: true });
  session.role = 'solo';
  const note = { evidence: { text: '가상 근거' }, pred: { uns: 'down' } };
  if (state === 'correct-prediction') note.outcome = { actual: 'down', hit: true };
  if (state === 'opened') note.outageOpened = true;
  if (state === 'single-shown') note.outageSingleShown = true;
  // 이전 버전에서 최대 몫만 저장한 기록도 표시 허가 없이는 유출되면 안 된다.
  note.outageLargest = { key: 'choice', value: 1.25 };
  session.interview = { interview: { months: { [res.round]: note } } };
  const html = league.uiMath.trendHTML(V, id, true);
  const allowed = state === 'opened' || state === 'single-shown';
  equal(html.includes('data-change="outage"'), allowed, `${state}: 허가된 달에만 원 표시`);
  equal(html.includes('viewBox="0 0 380 346"'), true, '타임라인 높이 346');
  if (allowed) {
    ok(html.includes('가장 큰 몫: 내 선택') && /y="310">원/.test(html), `${state}: 최대 몫·원 표시 위치`);
  } else {
    checks++;
    if (html.includes('가장 큰 몫')) failures.push(`${state}: 타임라인에 ‘가장 큰 몫’ 문구가 남음`);
  }
}
for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(`S7 attribution checks ${checks} fail ${failures.length}`);
if (failures.length) process.exitCode = 1;
