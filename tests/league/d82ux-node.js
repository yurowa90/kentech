'use strict';
// D-82 결정 2·5차 판정 N2/N3/S8. 브라우저 없이 실제 화면 함수를 VM에서 실행한다.
// 빈 달에 대한 화면 건너뛰기도 자동 학습 기록을 남기므로 N3는 별도 가상 기록으로 검증한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let checks = 0, failures = 0;
function test(label, fn) {
  checks++;
  try { fn(); console.log('PASS ' + label); }
  catch (error) { failures++; console.error('FAIL ' + label + ': ' + error.message); }
}
const session = {}, storage = new Map();
const mem = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const ctx = vm.createContext({ console, performance, structuredClone, __session: session,
  localStorage: mem, sessionStorage: mem, addEventListener() {},
  document: { documentElement: {}, addEventListener() {}, getElementById: () => null },
  KCP: { route() {}, on() {}, gradeWords: String,
    esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    leagueNet: {} } });
ctx.window = ctx;
for (const name of ['build-maps', 'tech-data', 'build', 'econ-data', 'econ', 'league-data', 'league-core']) {
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, `../../ui/${name}.js`), 'utf8'), ctx);
}
const source = fs.readFileSync(path.resolve(__dirname, '../../ui/league.js'), 'utf8');
assert.equal(source.split('let L = null;').length, 2);
assert.equal(source.split('KCP.league = {').length, 2);
vm.runInContext(source.replace('let L = null;', 'let L = globalThis.__session;')
  .replace('KCP.league = {', 'globalThis.__hooks = { decisionsHTML, promiseResultHTML, reasonStartsHTML, trialGoals }; KCP.league = {'), ctx);
const api = ctx.__hooks, C = ctx.KCP.leagueCore, B = ctx.KCP.buildGame;
// 도시 식별자는 기존 자료에서 고른다. 사용자 이름·실제 회사 이름이 없는 가상 기록이다.
const ids = C.regionOf('south').teams.slice(0, 2).map(t => t.id), id = ids[0];
const S = C.newState('D82UXFIX', 'south', 0, ids, { turns: 12, seedMode: 'fixed' });
C.host(S, 'next', 0);
B.selectPack(C.teamDef(C.regionOf('south'), id).pack, 'league');
B.current = () => ({ builds: [], lines: [], policies: [], rq: [] });
let trial = null;
B.lastTrial = () => trial;
Object.assign(session, { role: 'solo', room: S.room, team: id, S, snap: S,
  interview: { docs: {}, journal: {}, interview: { months: {} } } });
const months = session.interview.interview.months;
function note(topic = 'grid') {
  const n = { topic, confirmed: true, evidence: { key: 'grid', value: 1, text: '가상 근거' }, pred: { [topic]: 'same' } };
  months[S.round] = n;
  return n;
}
function result(round, co2Cons, rawGrid = 7) {
  return { ...S.rounds[round - 1], round, days: 7,
    team: { [id]: { co2Cons, co2Prod: co2Cons - 10, unsPct: 0, isolated: { uns: rawGrid }, uns: 0, imp: 0, sub: 0 } } };
}
S.round = 12; S.phase = 'end';
for (let t = 1; t <= 12; t++) months[t] = t <= 6 ? { evidence: { text: '가상 근거 ' + t } } : {};
test('N3 빈 7~12월을 제외한 최근 기록은 4·5·6월', () => {
  const html = api.decisionsHTML(S), recent = html.split('<details')[0];
  assert.ok(!recent.includes('기기에 남은 결정 기록 없음'));
  assert.deepEqual([...recent.matchAll(/data-decision-month="(\d+)"/g)].map(m => +m[1]), [4, 5, 6]);
  assert.ok(html.includes('앞의 3달 기록'));
  assert.deepEqual([...html.split('<details')[1].matchAll(/data-decision-month="(\d+)"/g)].map(m => +m[1]), [1, 2, 3]);
});
Object.keys(months).forEach(t => { months[t] = {}; });
months[2] = { askReason: '가상 <선택>' };
session.interview.journal[5] = { next: '가상 일지' };
test('N3 이유·일지만 있는 달도 최근 기록이며 자유 서술은 이스케이프', () => {
  const html = api.decisionsHTML(S);
  assert.deepEqual([...html.matchAll(/data-decision-month="(\d+)"/g)].map(m => +m[1]), [2, 5]);
  assert.ok(html.includes('&lt;선택>') && !html.includes('<details') && !html.includes('기록 없음'));
});
months[2] = {}; session.interview.journal = {};
test('N3 내용이 하나도 없는 때만 기록 없음', () => {
  const html = api.decisionsHTML(S);
  assert.ok(html.includes('<li>기기에 남은 결정 기록 없음</li>') && !html.includes('<details'));
});
S.phase = 'review'; S.round = 2; S.results = [result(1, 140), result(2, 175, 7.75)];
test('S6 소비 기준 월 합계·지난달 Δ, 판정 바로 다음 줄', () => {
  const html = api.promiseResultHTML(S, note());
  // 175×28/7=700, 140×31/7=620. 생산 배출과 다르게 둔 독립 기대값.
  assert.match(html, /id="lg-promise-summary"[^]*?<\/p><p id="lg-s6-co2cons"/);
  assert.match(html, /소비 CO₂\(이웃·계통에서 받은 전기 포함\) 700 t · 지난달 대비 Δ \+80 t/);
  assert.ok(html.includes('계통에서 끌어온 전기도 우리 도시 소비 배출에 들어가요.'));
});
test('S6 감소한 소비 CO₂는 음수 Δ이며 읽는 상태·저장 키를 늘리지 않음', () => {
  const r = S.results[1].team[id], old = r.co2Cons; r.co2Cons = 140;
  const n = note(), before = JSON.stringify([S, n, [...storage]]);
  try {
    assert.match(api.promiseResultHTML(S, n), /560 t · 지난달 대비 Δ −60 t/);
    assert.equal(JSON.stringify([S, n, [...storage]]), before);
  } finally { r.co2Cons = old; }
});
test('S8 확정된 계통 주제는 월 환산 31 MWh 칩 두 개·현금 칩 유지', () => {
  note();
  const html = api.reasonStartsHTML(S);
  assert.ok(html.includes('이번 달 계통이 메운 전기 31 MWh라서 '));
  assert.ok(html.includes('다음 달 시험에서 계통이 메운 전기가 줄어드는지 확인하고 '));
  assert.ok(html.includes('남은 돈 ') && !html.includes('정전'));
});
test('S8 계통 값 누락이면 정전 칩 유지', () => {
  const r = S.results[1].team[id], old = r.isolated; delete r.isolated;
  try { assert.ok(api.reasonStartsHTML(S).includes('이번 달 정전 0%라서 ')); }
  finally { r.isolated = old; }
});
test('S8 계통 0도 유효한 값이므로 계통 칩 유지', () => {
  const r = S.results[1].team[id], old = r.isolated;
  r.isolated = { uns: 0 };
  try { assert.ok(api.reasonStartsHTML(S).includes('이번 달 계통이 메운 전기 0 MWh라서 ')); }
  finally { r.isolated = old; }
});
test('S8 계통 월 환산은 소수 한 자리까지 표시', () => {
  const r = S.results[1].team[id], old = r.isolated;
  r.isolated = { uns: 7.8125 }; // ×28/7=31.25 → 31.3
  try { assert.ok(api.reasonStartsHTML(S).includes('이번 달 계통이 메운 전기 31.3 MWh라서 ')); }
  finally { r.isolated = old; }
});
test('정전 주제 S6에는 소비 CO₂ 한 줄 없음·S8 정전 칩 유지', () => {
  const n = note('uns');
  assert.ok(!api.promiseResultHTML(S, n).includes('lg-s6-co2cons'));
  assert.ok(api.reasonStartsHTML(S).includes('이번 달 정전 0%라서 '));
});
S.round = 1; S.results = [result(1, 175)];
trial = { map: C.teamDef(C.regionOf('south'), id).pack,
  scope: JSON.stringify([S.room, id]), ...S.rounds[0], days: 7, co2: 140, gridMWh: 7 };
test('S6 첫 달 기존 시험 소비 CO₂를 31일 환산해 Δ +155 t', () => {
  const n = note(); n.trial = { unsPct: 0, days: 7, gridMWh: 7 };
  const html = api.promiseResultHTML(S, n);
  assert.match(html, /소비 CO₂\(이웃·계통에서 받은 전기 포함\) 775 t · 시험 1주 대비 Δ \+155 t/);
});
test('S6 약속 후 다른 시험이면 CO₂ Δ를 만들지 않음', () => {
  const n = note(); n.trial = { unsPct: 0, days: 7, gridMWh: 8 };
  // 비교하지 않는 이유를 '첫 결과'가 아니라 시험이 바뀐 것으로 밝힌다(독립 검토 minor 반영).
  assert.match(api.promiseResultHTML(S, n), /Δ 비교 없음\(약속 뒤 시험이 바뀜\)/);
});
test('S6 약속 때 남긴 시험 CO₂ 사본이 있으면 최신 시험 대신 그 값을 기준으로', () => {
  const n = note(); n.trial = { unsPct: 0, days: 7, gridMWh: 8, co2: 70 };
  assert.match(api.promiseResultHTML(S, n), /시험 1주 대비 Δ/);
  assert.doesNotMatch(api.promiseResultHTML(S, n), /Δ 비교 없음/);
});
trial = null;
test('S6 첫 달 시험 없는 기록은 Δ 비교 없음', () => {
  assert.match(api.promiseResultHTML(S, note()), /Δ 비교 없음\(첫 결과\)/);
});
S.phase = 'plan';
test('N2 S3 7일 계통량→31일 합계·월 비용 한 번만·생산/소비 설명', () => {
  // 수요 1,000 중 부족 0. normalCo2는 앱의 기존 자료 계수만 사용한다.
  const info = api.trialGoals({ days: 7, tot: { dem: 1000, by: { import: 70 }, co2: 100 }, unsTotal: 0 });
  const line = info.notes.find(x => x.startsWith('바깥 계통'));
  assert.match(line, /70 MWh\(7일 시험\) → 31일 환산 약 310 MWh · 비용 약/);
  assert.equal((line.match(/비용/g) || []).length, 1);
  const price = ctx.KCP.ECON_DATA.params.normalCost.v * ctx.KCP.ECON_DATA.params.gridImportMarkup.v;
  assert.ok(line.includes((310 * price).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '억'));
  const explanation = info.notes.find(x => x.includes('머리 칩'));
  assert.ok(explanation && explanation.includes('생산 배출') && explanation.includes('소비 기준') && explanation.includes('바깥 계통에서 받은 전기'));
  assert.ok(explanation.includes((70 * ctx.KCP.ECON_DATA.params.normalCo2.v).toLocaleString('ko-KR', { maximumFractionDigits: 0 }) + ' t'));
});
console.log(`checks ${checks} fail ${failures}`);
process.exitCode = failures ? 1 : 0;
