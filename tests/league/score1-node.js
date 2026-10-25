'use strict';
// 지시서 T의 독립 기대값. 브라우저로 만들기 어려운 예산 거절·지도 후보·코치 목록은
// 실제 함수를 VM에서 호출한다. 그림/배치/정지 고리의 시각 검증은 score1.py 담당이다.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
let checks = 0, failures = 0;
function test(label, fn) {
  checks++;
  try { fn(); console.log('PASS ' + label); }
  catch (e) { failures++; console.error('FAIL ' + label + ': ' + e.stack); }
}
const L = {}, timers = [];
const ctx = vm.createContext({ console, performance, structuredClone, session:L,
  addEventListener() {}, removeEventListener() {},
  setTimeout: (fn, ms) => (timers.push({ fn, ms }), timers.length), clearTimeout() {},
  document:{ documentElement:{}, addEventListener() {}, querySelector:() => null },
  KCP:{ route() {}, on() {}, esc:String, gradeWords:String, leagueNet:{} } });
ctx.window = ctx;
for (const name of ['build-maps', 'tech-data', 'build', 'econ-data', 'econ', 'league-data', 'league-core', 'league']) {
  let text = fs.readFileSync(path.resolve(__dirname, `../../ui/${name}.js`), 'utf8');
  if (name === 'build') text = text.replace('  let S = null;',
    '  let S = null; globalThis.editor = { set:s=>S=s, budgetShortfall, canPlace, nearestBuildTile, placementReason, markBuildSite };');
  if (name === 'league') text = text.replace('let L = null;', 'let L = globalThis.session;')
    .replace('KCP.league = {', 'globalThis.coachSteps = coachSteps; KCP.league = {');
  vm.runInContext(text, ctx, { filename:`VM:${name}.js` });
}
const B = ctx.KCP.buildGame, C = ctx.KCP.leagueCore, E = ctx.editor;
const region = Object.values(ctx.KCP.LEAGUE_REGIONS).find(r => r.teams.length >= 2);
const city = region.teams[0];
B.selectPack(C.teamDef(region, city.id).pack, 'league');
const empty = () => ({ builds:[], lines:[], policies:[], rq:[] });
function state(budget) {
  const st = { st:empty(), opts:{ budget }, alive:true, timers:[], dirty:false,
    root:{ querySelector:() => null }, canvas:{}, run:null, raf:1 };
  E.set(st); return st;
}
test('T F10 setViewInset public callable', () => {
  assert.equal(typeof B.setViewInset, 'function');
  B.setViewInset({right:320}); B.setViewInset({right:0});
});
// T F6: 숫자 예산 fixture로 리그 빚 정산과 편집기 부족액 문구를 분리한다.
for (const item of ['설비', '송전선']) test(`T F6 ${item} shortfall arithmetic`, () => {
  state(() => 5);
  const i = B.TILES.find(t => B.siteRule('solar', t) === '').i;
  const plan = { ...empty(), builds:[{t:'solar', i}] }, cost = 8;
  // 기존 44-grant 독립 fixture의 태양광 8억. 부족액 기대값은 구현 반환값에서 만들지 않는다.
  assert.equal(B.capex(plan),cost,'고정 비용 fixture');
  const short = (cost - 5).toFixed(1);
  assert.equal(E.budgetShortfall(plan, cost, item, 1), `${short}억 모자라요(${item} ${cost.toFixed(1)}억 · 남은 돈 5.0억)`);
});
test('T F6 inconsistent amounts omit parentheses', () => {
  state(plan => ({ ok:false, left:plan.builds.length ? -9 : 2, reason:'budget' }));
  assert.equal(E.budgetShortfall({ ...empty(), builds:[{t:'solar',i:0}] }, 8, '설비'), '9.0억 모자라요');
});
test('T F6 rounded amounts must also explain shortfall', () => {
  state(plan => ({ok:false,left:plan.builds.length ? -2.99 : 5.05,reason:'budget'}));
  // 원값 8.04-5.05=2.99지만 표시 8.0-5.1은 3.0이 아니다. T의 0.05보다 큰 차이.
  assert.equal(E.budgetShortfall({...empty(),builds:[{t:'solar',i:0}]},8.04,'설비'),'3.0억 모자라요');
});
test('T F6 debt keeps old budget message', () => {
  state(() => ({ ok:false, left:-100, reason:'debt' }));
  assert.equal(E.budgetShortfall(empty(), 8, '설비'), '예산 부족(8억)');
  assert.equal(E.budgetShortfall(empty(), 6, '송전선', 1), '예산 부족(6.0억)');
});
// T F6: hex distance is calculated from geometry, never from nearestBuildTile's return.
// No funding check belongs in this oracle: the contract explicitly asks for siteRule==="" and empty.
test('T F6 nearest empty legal tile and no candidate suffix', () => {
  const kind = 'solar', legal = B.TILES.filter(t => B.siteRule(kind,t) === '');
  const from = B.TILES.find(t => B.siteRule(kind,t) !== '');
  assert.ok(from && legal.length > 1, '자료에 합법/위반 칸 존재');
  const st = state(() => 0); st.st.builds = [{t:kind,i:legal[0].i}];
  const candidates = legal.filter(t => t.i !== legal[0].i);
  // odd-r hex offset → axial: max(|dq|, |dr|, |dq+dr|).
  const q = t => t.c - (t.r - (t.r & 1)) / 2;
  const distance = t => Math.max(Math.abs(q(t)-q(from)), Math.abs(t.r-from.r), Math.abs(q(t)-q(from)+t.r-from.r));
  const nearest = E.nearestBuildTile(kind,from.i);
  assert.ok(candidates.some(t => t.i === nearest));
  assert.equal(distance(B.TILES[nearest]), Math.min(...candidates.map(distance)));
  const check = E.canPlace(kind,from.i);
  assert.ok(check.siteRule && !check.ok);
  assert.equal(E.placementReason(kind,from.i,check), check.why + ' · 규칙상 가능한 가장 가까운 칸 표시');
  st.st.builds = legal.map(t => ({t:kind,i:t.i}));
  assert.equal(E.nearestBuildTile(kind,from.i), null);
  assert.equal(E.placementReason(kind,from.i,check), check.why + ' · 같은 도구로 지을 칸이 지도에 없어요');
});
test('T F6 nearest hint lasts approximately 1.6 seconds', () => {
  const st = state(() => 1000), from = B.TILES.find(t => B.siteRule('solar',t) !== '');
  E.markBuildSite('solar',from.i);
  assert.ok(st.siteHint && Number.isInteger(st.siteHint.i));
  assert.ok(B.siteRule('solar',B.TILES[st.siteHint.i]) === '');
  // T says about 1.6s; deterministic timer contract uses the specified 1600ms.
  assert.equal(timers.at(-1).ms,1600);
  timers.at(-1).fn(); assert.equal(st.siteHint,null);
});
test('T F4 stage 3 names from data, zero/two/three unlinked counts', () => {
  const names = Object.values(B.BLD).slice(0,3).map(b => b.name);
  assert.equal(names.length,3);
  for (const count of [0,1,2,3]) {
    const issues = { unlinked:count, unlinkedNames:names.slice(0,count), waiting:2 };
    const expected = count ? `(${names.slice(0,count).slice(0,2).join('·')}${count > 2 ? ' 외 1기' : ''})` : ' 0기';
    // 지시서 T 3번: 묶기용 사전 계산값 없이 issues만 넘긴다.
    assert.equal(ctx.coachSteps(issues)[2][0], `마을까지 이어요 · 미연결${expected} · 대기 2기`);
  }
});
// 지시서 T 3번: 기대 문구는 명세의 일곱 조합에서 직접 작성한다.
const [A, Bname, Cname] = [...new Set(Object.values(B.BLD).map(b => b.name))].slice(0,3);
for (const [label, names, expected] of [
  ['A,A', [A,A], `미연결(${A} 2기)`],
  ['A,A,B', [A,A,Bname], `미연결(${A} 2기·${Bname})`],
  ['A,A,B,C', [A,A,Bname,Cname], `미연결(${A} 2기·${Bname} 외 1기)`],
  ['A,B,C', [A,Bname,Cname], `미연결(${A}·${Bname} 외 1기)`],
  ['A', [A], `미연결(${A})`],
  ['0', [], '미연결 0기'],
  ['A,B,A', [A,Bname,A], `미연결(${A} 2기·${Bname})`],
]) test(`T F4 unlinked grouping ${label}`, () => {
  // 지시서 T 3번: 서로 다른 세 이름을 자료에서 확보하며, 전체 문구까지 대조한다.
  assert.ok(A && Bname && Cname, '자료에서 서로 다른 설비 이름 세 종류 확보');
  const issues = {unlinked:names.length, unlinkedNames:names, waiting:2};
  assert.equal(ctx.coachSteps(issues)[2][0], `마을까지 이어요 · ${expected} · 대기 2기`);
});
test('T F4 all eight coach scene prefixes', () => {
  // updateCoach의 실제 텍스트 쓰기를 호출하되 단계 자동 전진은 끈다.
  // 다른 세션/저장소/브라우저가 없어도 각 장면 이름을 빠짐없이 단언한다.
  const source = fs.readFileSync(path.resolve(__dirname,'../../ui/league.js'),'utf8');
  const start = source.indexOf('  function updateCoach('), end = source.indexOf('  function coachAction()',start);
  assert.ok(start >= 0 && end > start);
  const task = {textContent:''}, action = {textContent:''};
  const element = {dataset:{}, querySelector:s => s === '#lg-coach-task' ? task : action};
  const scenes = ['근거 하나','자리 판단','자리 판단','시험 1주','약속','예측 대 실제','원인 하나','다음 달'];
  const context = {
    L:{coach:{round:1,step:0,builds:0},snap:{round:1,phase:'plan'}}, BG:B,
    monthNote:() => ({n:{}}), planIssueCounts:() => ({unlinked:0,unlinkedNames:[],waiting:0}),
    coachSteps:ctx.coachSteps,
    document:{getElementById:id => id === 'lg-coach' ? element : null, querySelector:() => null,querySelectorAll:() => []}
  };
  vm.createContext(context); vm.runInContext(source.slice(start,end),context);
  for (let i=0;i<8;i++) {
    context.L.coach.step=i;
    vm.runInContext('updateCoach(false)',context);
    assert.ok(task.textContent.startsWith(`${scenes[i]} · ${i+1}/8 `),task.textContent);
    assert.equal(element.dataset.step,String(i+1));
  }
});
console.log(`checks ${checks} fail ${failures}`);
process.exitCode = failures ? 1 : 0;
