'use strict';
// V5-s7-fix.md §2·§2-1·§3. 실행: node tests/league/review/40-v5-s7.js
// 잡는 회귀: 접힘 요약 누락/잘못된 직접 연결·단위·최대 선택/정답 유출,
// 기록의 모순된 꼬리말, 공개 직후 판정 줄·기존 본문·접근성 속성 변경.
// 10~16: 실제 꼴 근거 길이, 미선택, 작은 몫 경계·개수, 직접 연결 표시,
// target 없는 gridImport 구기록, summary 원문 HTML의 근거 이스케이프.
// 브라우저·통신 없음. 계산/렌더러는 추출하거나 교체하지 않는다.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const ROOT = path.resolve(__dirname, '../../..'), clone = x => JSON.parse(JSON.stringify(x));
const id = 'pyeongtaek', ids = [id, 'dangjin'], storage = new Map();
const session = { room: 'V5S7FIXTURE', team: id, role: 'fixture', rev: 0 };
const ctx = vm.createContext({ console, performance, structuredClone, __session: session,
  document: { documentElement: {}, addEventListener() {}, getElementById() { return null; } },
  addEventListener() {}, localStorage: { getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
  KCP: { route() {}, on() {}, esc: s => String(s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    leagueNet: { expandSnapshot: x => x } } });
ctx.window = ctx;
vm.runInContext('Math.random = () => { throw Error("unseeded random"); };', ctx);
for (const name of ['build-maps', 'tech-data', 'build', 'econ-data', 'econ', 'league-data', 'league-core'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, `ui/${name}.js`), 'utf8'), ctx, { filename: name });
const source = fs.readFileSync(path.join(ROOT, 'ui/league.js'), 'utf8');
assert.equal(source.split('let L = null;').length, 2, '30·32번의 VM 세션 연결점');
assert.equal(source.split('state: () =>').length, 2, '30·32번의 기록 경로 연결점');
// 세션·수신·기록 진입점만 메모리에서 연결한다. missedText가 비공개이므로
// 실제 소비자인 공개 trendHTML과 기존 일지·다음 달 표시 경로로 검증한다.
vm.runInContext(source.replace('let L = null;', 'let L = globalThis.__session;')
  .replace('state: () =>', '__receive: onSnap, __worksheet: worksheet, __carryHTML: missedCarryHTML, state: () =>'), ctx);
const { leagueCore: C, buildGame: B, ECON_DATA: D, league: U } = ctx.KCP;
const M = U.uiMath, R = C.regionOf('south');
const teamKey = `kcp-league-data-v1:${session.room}:${id}`;
const trialKeys = ['choice', 'weather', 'event', 'trade'];
const monthlyKeys = ['choice', 'weather', 'event', 'progress', 'growth', 'trade'];
const names = basis => ({ choice: '내 선택', weather: basis === 'monthly' ? '날씨·계절·운전 기간' : '날씨·운전 기간',
  event: '사건·대응', progress: '접속·공사·기술 진행', growth: '도시 성장·연료 값', trade: '이웃 거래' });
// V5 §2의 기존 연결 규칙을 검사 쪽에 명시한다. UI 소스의 연결표는 읽지 않는다.
// 같은 단계/간접 연결은 직접 연결에 넣지 않는다. 시험 기준에는 진행·성장 몫이 없다.
const evidenceCases = [
  { key: 'evening', text: '저녁 수요', direct: ['weather', 'event', 'growth'] },
  { key: 'wind', text: '평균 풍속', wind: true, direct: ['weather', 'event'] },
  { key: 'wind', text: '평균 풍속', wind: false, direct: [] },
  { key: 'wind', text: '평균 풍속', direct: [] }, // 접속 정보 없는 옛 기록도 직접 효과 없음.
  { key: 'grid', text: '접속 여유', direct: ['choice', 'progress'] },
  { key: 'fuel', text: 'LNG 연료 값', direct: [] },
  { key: 'neighbor', text: '이웃 정전', direct: ['trade'] }
];
const prefix = '내 예측이 놓친 것 · ';
const uniqueLabel = '가장 큰 몫을 맞게 짚음';
const tiedLabel = '크기가 같은 가장 큰 몫 중 하나를 짚음';
let checks = 0;
const failures = [];
function check(label, fn) {
  checks++;
  try { fn(); } catch (e) { failures.push(label); console.error(`FAIL ${label}: ${e.message}`); }
}
const decode = s => s.replace(/&(?:amp|lt|gt|quot|#39);/g,
  x => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[x]));
const textOf = s => decode(s.replace(/<[^>]*>/g, ''));
function evidenceBlock(html) {
  return html.match(/<details\b[^>]*id="lg-outage-evidence"[^>]*>([\s\S]*?)<\/details>/)?.[1] || '';
}
function summaryHTML(html) {
  return evidenceBlock(html).match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1] || '';
}
function summaryOf(html) {
  return textOf(summaryHTML(html));
}
function summaryBody(html) {
  const summary = summaryOf(html);
  return summary.startsWith(prefix) ? summary.slice(prefix.length) : '';
}
function firstVerdict(html) {
  return textOf(html.match(/<div\b[^>]*id="lg-outage-verdict"[^>]*>\s*<p>([\s\S]*?)<\/p>/)?.[1] || '');
}
// outageValue를 호출하지 않고 계약의 표시 자릿수·부호·단위를 독립적으로 계산한다.
function valueText(value, target) {
  const digits = target === 'grid' ? 1 : 2, rounded = Number(value.toFixed(digits)) + 0;
  const body = target === 'grid' ? Math.abs(rounded).toLocaleString('ko-KR',
    { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : Math.abs(rounded).toFixed(2);
  return `${rounded < 0 ? '−' : rounded > 0 ? '+' : ''}${body}${target === 'grid' ? ' MWh/일' : '%p'}`; // D-82: 합성 기록도 계약의 하루 평균 단위로 표시를 독립 계산.
}
function reset() { session.outCache = {}; session.outFailures = {}; session.outShownPending = null; }
function select() { B.selectPack(C.teamDef(R, id).pack, 'league'); }
function operate(S) {
  U.__receive(clone(C.publicView(S, 0)));
  const res = C.run(S, B, 0), V = clone(C.publicView(S, 0));
  U.__receive(V); reset();
  return { V, res };
}
function fixture(basis, target) {
  storage.clear(); reset(); session.snap = null; delete session.interview;
  const S = C.newState(session.room, R.id, 0, ids, { turns: 12, seedMode: 'fixed' });
  C.host(S, 'next', 0);
  for (const city of ids) S.teams[city].plan = clone(D.normalStartPlans[city]);
  // 정전 대상도 여러 후보를 실제 계산하게 한다. 상한은 각 fixture 뒤 복원한다.
  const savedShare = D.params.gridImportShare.v;
  try {
    if (target === 'uns') D.params.gridImportShare.v = .1;
    if (basis === 'monthly') { operate(S); C.host(S, 'next', 0); }
    else {
      select();
      const rd = C.roundsOf(S)[S.round - 1], plan = clone(S.teams[id].plan), seed = 1;
      const raw = B.simulate({ ...B.sanitize(plan, 1e9), seed, season: rd.season }, 7,
        { league: true, mods: C.trialMods(S, R, id) });
      const imported = raw.tot.by.import, filled = C.gridFill(raw);
      const map = C.teamDef(R, id).pack, scope = JSON.stringify([session.room, id]);
      const trial = { map, scope, year: rd.year, month: rd.month, season: rd.season, seed, days: 7, plan,
        unsPct: 100 * filled.unsTotal / filled.tot.dem, gridMWh: filled.tot.by.import - imported,
        outH: 0, co2: filled.co2, cost: filled.cost.total };
      storage.set('kcp-build-trial-v1', JSON.stringify({ [JSON.stringify([scope, map])]: trial }));
    }
    S.teams[id].plan.policies = ['save'];
    const f = operate(S);
    // 공개 전 검사용 실제 분해를 캐시에 계산한다. 기대값은 이 반환값에서 만들지 않는다.
    const a = M.outageAttribution(f.V, f.res, id);
    assert.ok(a, '실제 분해 fixture 존재');
    assert.equal(a.basis, basis, 'fixture 기준'); assert.equal(a.target, target, 'fixture 대상');
    return f;
  } finally { D.params.gridImportShare.v = savedShare; }
}
// 저장 자료 경계의 합성 기록. 연결된 몫보다 전체 최대(trade)가 더 크며,
// event는 음수라 부호 순서 정렬도 잡는다. 기대값을 S7 반환값에서 복사하지 않는다.
function frozen(f, basis, target, overrides = {}, wind) {
  const values = { choice: .31, weather: 1.23, event: -4.56, progress: -3.45, growth: 2.34, trade: 8.76,
    ...overrides };
  const scale = target === 'grid' ? 100 : 1;
  const keys = basis === 'monthly' ? monthlyKeys : trialKeys;
  const parts = keys.map(key => ({ key, value: values[key] * scale }));
  const total = parts.reduce((n, p) => n + p.value, 0), base = target === 'grid' ? 1000 : 10;
  return { id, round: f.res.round, basis, target, trial: base, actual: base + total, total, replay: 0,
    ...(target === 'grid' ? { unit: 'MWh/일' } : {}), // D-82: 새 하루 평균 고정본을 단위 없는 옛 월 합계와 구별.
    replayOutsideSum: basis === 'monthly', parts, grid: { value: 0, waitingMW: 0 },
    clues: Object.fromEntries(keys.map(k => [k, '가상 단서'])),
    clueMore: Object.fromEntries(keys.map(k => [k, '가상 상세 단서'])),
    ...(wind === undefined ? {} : { hasConnectedWind: wind }), simulations: 0, gridFills: 0, ms: 0 };
}
function opened(f, a, evidence, missed = 'trade') {
  return M.outageCardsHTML(f.V, f.res, id, { outageOpened: true, outageFrozen: a,
    missed, ...(evidence ? { evidence: { key: evidence.key, text: evidence.text, value: 100 } } : {}) });
}
// 표시 경계용 합성 기록. 입력 몫은 대상 단위 그대로 넣고 합계만 맞춘다.
function partRecord(f, basis, target, base, values) {
  const a = frozen(f, basis, target);
  a.parts = a.parts.map(p => ({ key: p.key, value: values[p.key] ?? p.value }));
  a.trial = base;
  a.total = a.parts.reduce((n, p) => n + p.value, 0);
  a.actual = base + a.total;
  return a;
}
function records(f, a, missed) {
  const note = { outageOpened: true, outageFrozen: a, missed, missedBasis: a.basis,
    evidence: { key: 'grid', text: '접속 여유', value: 100 },
    missedCarry: { missed, basis: a.basis, target: a.target } };
  storage.set(teamKey, JSON.stringify({ interview: { months: { [f.res.round]: note } } }));
  return { journal: U.__worksheet(f.V), timeline: M.trendHTML(f.V, id, true),
    carry: U.__carryHTML({ ...f.V, round: f.res.round + 1 }) };
}

for (const basis of ['trial', 'monthly']) for (const target of ['uns', 'grid']) {
  const scope = `${basis}/${target}`;
  let f;
  check(`fixture ${scope}`, () => { f = fixture(basis, target); });
  if (!f) continue; // fixture 오류도 실패로 누적하고 다음 독립 조합은 계속 검사한다.
  for (const [index, evidence] of evidenceCases.entries()) {
    const a = frozen(f, basis, target, {}, evidence.wind), label = `${scope}/${evidence.key}/${index}`;
    const html = opened(f, a, evidence), summary = summaryBody(html), ns = names(basis);
    const direct = evidence.direct.filter(k => (basis === 'monthly' ? monthlyKeys : trialKeys).includes(k));
    check(`1 §2 ${label} 접힘 요약`, () => {
      assert.ok(summaryOf(html).startsWith(prefix), `summary 접두: ${summaryOf(html)}`);
      assert.ok(summary.trim(), '접두 뒤 비어 있지 않은 요약');
    });
    check(`2 §2 ${label} 근거·직접 연결`, () => {
      assert.ok(summary.includes(evidence.text), '고른 근거 이름');
      if (!direct.length) {
        assert.ok(summary.includes('따로 계산하지 않음'), '직접 연결이 없으면 별도 계산 안 함');
        assert.ok(!/[+−-]?[\d,]+(?:\.\d+)?\s*(?:MWh|%p)/.test(summary), '간접 연결 몫을 직접 효과로 쓰지 않음');
      } else {
        const lead = [...a.parts].filter(p => direct.includes(p.key))
          .sort((x, y) => Math.abs(y.value) - Math.abs(x.value))[0];
        assert.ok(summary.includes(ns[lead.key]), `가장 큰 직접 연결 몫: ${ns[lead.key]}`);
        assert.ok(summary.includes(valueText(lead.value, target)), '직접 연결 몫 값·부호·단위');
        const shown = Object.entries(ns).filter(([, name]) => summary.includes(name)).map(([key]) => key);
        assert.deepEqual(shown, [lead.key], '직접 연결 몫 이름 하나만 표시');
        if (direct.length > 1) assert.ok(summary.includes(`외 ${direct.length - 1}개`), '나머지 직접 연결 몫 수');
        else assert.ok(!/외\s*\d+개/.test(summary), '직접 연결 하나면 나머지 없음');
        assert.ok(!summary.includes(target === 'grid' ? '%p' : 'MWh'), '다른 대상 단위 없음');
      }
    });
    check(`3 §2 ${label} 요약 길이`, () => {
      assert.ok(summary.trim(), '빈 요약으로 길이 검사를 통과하지 않음');
      // 명세의 "대략 80자"에 띄어쓰기·부호·구분자 차이 10자를 허용한다.
      // 접두는 제외하고 학생에게 보이는 문자 기준으로 세며 90자를 상한으로 둔다.
      assert.ok([...summary].length <= 90, `요약 ${[...summary].length}자`);
    });
    check(`4 §2 ${label} 본문·초점·알림 보존`, () => {
      // 30·32번이 읽는 기존 정규식과 문단 접두를 유지한다.
      const body = html.match(/<p>내 예측이 놓친 것: ([\s\S]*?)<\/p>/)?.[1];
      assert.ok(body, '기존 본문 정규식으로 내용 읽힘');
      assert.ok(textOf(body).startsWith(`고른 근거 ‘${evidence.text}’`), '기존 근거 설명 형식');
      const tag = html.match(/<div\b[^>]*id="lg-outage-verdict"[^>]*>/)?.[0] || '';
      assert.match(tag, /\btabindex="-1"/); assert.match(tag, /\baria-live="polite"/);
    });
    if (direct.length) check(`14 §2-1 ${label} 대표 몫 앞 직접 연결 표시`, () => {
      const lead = [...a.parts].filter(p => direct.includes(p.key))
        .sort((x, y) => Math.abs(y.value) - Math.abs(x.value))[0];
      assert.ok(summary.includes(`직접 연결 몫 ${ns[lead.key]} ${valueText(lead.value, target)}`),
        '대표 이름·값 앞에 직접 연결 몫 낱말');
    });
  }
  for (const evidence of [
    { key: 'evening', text: '저녁 수요: 12.34 MW' },
    { key: 'neighbor', text: '가상도시 · 이웃 정전: 12.34%' }
  ]) check(`10 §2 ${scope}/${evidence.key} 실제 꼴 근거 요약 길이`, () => {
    const summary = summaryBody(opened(f, frozen(f, basis, target), evidence));
    assert.ok(summary.trim(), '빈 요약으로 길이 검사를 통과하지 않음');
    assert.ok(summary.includes(evidence.text), '수치·단위를 포함한 고른 근거');
    // 3번과 같은 기준: 접두 제외, 보이는 문자 수, 대략 80자에 여유 10자.
    assert.ok([...summary].length <= 90, `요약 ${[...summary].length}자: ${summary}`);
  });
  check(`11 §2-1 ${scope} 근거 미선택`, () => {
    // n.evidence 속성 자체를 보내지 않는다. 빈 근거 객체와 구별한다.
    assert.equal(summaryBody(opened(f, frozen(f, basis, target))), '고른 근거 없음');
  });
  // 명세 §2-1의 독립 식. UI의 outageMinPart/gridSameTol은 호출하지 않는다.
  // 계통은 하한·양수·음수 기준을 모두 쓰고 actual/total은 기준과 다르게 둔다.
  const bases = target === 'grid' ? [0, 10, 1000, -1000] : [10];
  for (const base of bases) {
    // D-82 수정 2(총괄 결정): 계통 최소 몫 = max('같음' 문턱/10, 0.05 MWh/일), 문턱 = max(0.05, 기준×5%).
    // 기준 0은 하한 0.05가, ±1000은 문턱/10이 정한다. 10은 둘이 같은 경계다.
    const minPart = target === 'grid' ? Math.max(Math.max(.05, .05 * Math.abs(base)) / 10, .05) : .05;
    const evidence = { key: 'evening', text: '저녁 수요: 12.34 MW' }, ns = names(basis);
    for (const mode of ['zero', 'below']) check(`12 §2-1 ${scope}/${base}/${mode} 직접 연결 모두 작은 몫`, () => {
      const tiny = mode === 'zero' ? 0 : minPart * .999;
      const a = partRecord(f, basis, target, base,
        { weather: tiny, event: -tiny, growth: tiny, choice: 99, trade: -88 });
      const summary = summaryBody(opened(f, a, evidence));
      assert.equal(summary, `고른 근거 ‘${evidence.text}’ · 직접 연결 몫은 거의 0`,
        '직접 연결은 있으나 모두 문턱 미만: 간접 큰 몫·외 n개·수치 없음');
    });
    const boundaryCases = [
      { label: '바로 위 하나', weather: -minPart * 1.001, event: minPart * .999,
        growth: -minPart * .999, lead: 'weather', extra: 0 },
      { label: '문턱과 같은 음수 하나', weather: -minPart, event: minPart * .999,
        growth: 0, lead: 'weather', extra: 0 },
      ...(basis === 'monthly' ? [
        { label: '바로 아래 하나 제외', weather: -minPart * .999, event: minPart * 1.001,
          growth: -minPart * 2, lead: 'growth', extra: 1 }
      ] : [])
    ];
    for (const row of boundaryCases) {
      const a = partRecord(f, basis, target, base,
        { weather: row.weather, event: row.event, growth: row.growth, choice: 99, trade: -88 });
      check(`13 §2-1 ${scope}/${base}/${row.label} 대표·외 개수`, () => {
        const summary = summaryBody(opened(f, a, evidence));
        assert.ok(summary.includes(`${ns[row.lead]} ${valueText(row[row.lead], target)}`),
          '문턱 이상 중 절댓값 최대를 대상 단위로 표시');
        assert.deepEqual(Object.entries(ns).filter(([, name]) => summary.includes(name)).map(([key]) => key),
          [row.lead], '대표 이름 하나만 표시');
        const count = summary.match(/외\s*(\d+)개/);
        assert.equal(count ? Number(count[1]) : 0, row.extra, '외 n개에는 문턱 이상인 나머지만 셈');
        if (!row.extra) assert.equal(count, null, '대표만 남으면 외 0개도 쓰지 않음');
        assert.ok(!summary.includes('거의 0'), '문턱 이상이면 거의 0이 아님');
      });
    }
  }
  check(`15 §2·2-1/구기록 호환 ${scope} target 없는 gridImport 기록`, () => {
    const old = frozen(f, basis, 'uns');
    delete old.target;
    if (basis === 'trial') delete old.basis; // basis도 없던 첫 시험 기록.
    old.parts.push({ key: 'gridImport', value: -9.87 });
    old.clues.gridImport = '가상 계통 수입 단서';
    old.clueMore.gridImport = '가상 계통 수입 상세 단서';
    old.total -= 9.87; old.actual -= 9.87;
    let html;
    assert.doesNotThrow(() => {
      html = opened(f, old, { key: 'neighbor', text: '가상도시 · 이웃 정전: 12.34%' }, 'gridImport');
    }, 'target 없는 구기록·gridImport 선택도 렌더링 예외 없음');
    const summary = summaryBody(html);
    assert.ok(summary.includes('이웃 거래 +8.76%p'), '대상 누락 시 요약은 정전 %p 단위');
    assert.ok(!summary.includes('MWh'), '현재 달 대상이 계통이어도 구기록 단위 우선');
    assert.ok(textOf(html).includes('계통 수입'), '옛 gridImport 몫도 표시');
  });
  check(`16 §2/독립 검토 ${scope} summary 근거 HTML 이스케이프`, () => {
    const raw = summaryHTML(opened(f, frozen(f, basis, target),
      { key: 'evening', text: '<img src=x onerror=alert(1)>' }));
    // textOf를 거치면 태그가 지워져 누락을 숨기므로 원문 HTML을 검사한다.
    assert.ok(!/<img/i.test(raw), 'summary 원문에 img 태그 없음');
    assert.ok(raw.includes('&lt;img'), '근거를 버리지 않고 이스케이프하여 표시');
  });
  check(`5 §2 ${scope} 공개 전 요약·숫자 비공개·고르기 유지`, () => {
    // 고정본을 넣으면 이미 공개한 기록이므로, 공개 전에는 실제 계산 경로를 쓴다.
    for (const missed of [undefined, 'choice']) {
      const html = M.outageCardsHTML(f.V, f.res, id, { missed,
        evidence: { key: 'evening', text: '저녁 수요', value: 100 } });
      assert.ok(html.includes('data-opened="false"') && html.includes('data-single="false"'), '공개 전 여러 후보 fixture');
      assert.ok(!html.includes('id="lg-outage-evidence"'), '접힘 상세도 없음');
      assert.ok(!html.includes('내 예측이 놓친 것'), '요약 문구 없음');
      const summaries = [...html.matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)].map(m => textOf(m[1])).join(' ');
      assert.ok(!/[+−-]?[\d,]+(?:\.\d+)?\s*(?:MWh|%p)/.test(summaries), 'summary에 원인 몫 숫자 없음');
      assert.ok(!/data-out-value=|data-out-tag="largest"|id="lg-outage-verdict"/.test(html), '카드 정답 비공개');
      const button = html.match(/<button\b[^>]*id="lg-outage-open"[^>]*>/)?.[0];
      assert.ok(button, '열기 버튼'); assert.equal(/\bdisabled\b/.test(button), !missed, '고른 뒤 열기 가능');
      if (missed) assert.match(html, /data-missed="choice" aria-pressed="true"/, '고른 카드 표시');
    }
  });
  // 두 부호 모두 절댓값 최대를 맞힌 경우다. 동점은 첫 원인이 아닌 event를 고른다.
  for (const mode of ['unique', 'tied', 'smaller']) for (const sign of [-1, 1]) {
    const a = frozen(f, basis, target, { choice: sign * 9.43,
      event: mode === 'tied' ? -sign * 9.43 : -2.22 });
    const missed = mode === 'unique' ? 'choice' : 'event', ns = names(basis);
    const label = `${scope}/${mode}/${sign}`, saved = records(f, a, missed);
    for (const [route, raw] of Object.entries(saved)) {
      const text = textOf(raw);
      check(`${mode === 'unique' ? 6 : mode === 'tied' ? 7 : 8} §3 ${label}/${route} 기록 라벨`, () => {
        assert.ok(text.includes(`${route === 'carry' ? '지난달 놓친 것' : '놓친 것'}: ${ns[missed]}`), '기존 접두·선택 이름');
        assert.ok(!text.includes('가장 큰 몫과 같음') && !text.includes('가장 큰 몫과 크기 같음'), '옛 꼬리말 없음');
        if (mode === 'smaller') assert.ok(!text.includes(uniqueLabel) && !text.includes(tiedLabel), '비최대 선택에 새 칭찬 없음');
        else {
          assert.ok(text.includes(mode === 'unique' ? uniqueLabel : tiedLabel), '명세의 새 꼬리말');
          assert.ok(!text.includes(mode === 'unique' ? tiedLabel : uniqueLabel), '단독·동점 라벨 구별');
        }
      });
    }
    if (mode !== 'smaller') check(`9 §3 ${label} 공개 직후 판정 줄 보존`, () => {
      const first = firstVerdict(opened(f, a, evidenceCases[4], missed));
      assert.ok(first.startsWith(`내가 고른 것: ${ns[missed]} `), '판정 첫 줄의 선택');
      assert.ok(first.endsWith(mode === 'unique' ? ' · 가장 큰 몫과 같아요' : ' · 크기가 같은 가장 큰 몫 중 하나예요'),
        '공개 직후 판정 문구는 그대로');
      assert.ok(!first.includes(uniqueLabel) && !first.includes(tiedLabel), '기록용 꼬리말과 판정 줄 구별');
    });
  }
}
// D-82: 표시 변경 (a)(b), 반올림 동점, 옛 계통 고정본 교체를 저장·렌더링 경계에서 추가 검증한다.
for (const basis of ['trial', 'monthly']) { // D-82: 첫 달 시험과 지난달 기준을 모두 실행.
  const f = fixture(basis, 'grid'); // D-82: 실제 운영 자료와 사본은 유지하고 표시 입력만 합성.
  const allZero = Object.fromEntries((basis === 'monthly' ? monthlyKeys : trialKeys).map(k => [k, 0])); // D-82: 반환 몫을 기대값으로 쓰지 않음.
  const costText = (value, daily) => { // D-82: 공개 가격 입력과 명세의 소수 둘째 자리·부호로 비용을 독립 계산.
    const rounded = Number((value * D.params.normalCost.v * D.params.gridImportMarkup.v).toFixed(2)) + 0; // D-82: 억/MWh × MWh/일 또는 옛 MWh.
    return `(비용 ${rounded < 0 ? '−' : rounded > 0 ? '+' : ''}${Math.abs(rounded).toFixed(2)}억${daily ? '/일' : ''})`; // D-82: 새 기록 억/일, 옛 기록 억.
  }; // D-82: 비용 기대값 도우미 끝.
  for (const target of ['grid', 'uns']) for (const sign of [-1, 1]) for (const single of [false, true]) { // D-82: 양·음 비용과 단일·여러 원인 표시를 모두 검사.
    check(`17 D-82 ${basis}/${target}/${sign}/${single} 비용·사건 문구`, () => { // D-82: 새 계통·정전 기록의 표시 계약.
      const a = partRecord(f, basis, target, 30, { ...allZero, event: sign * 12.34, weather: single ? 0 : 1.23 }); // D-82: 최대 사건 몫과 비용은 합성 입력에서 결정.
      a.clues.event = '우리 도시 정전에 닿는 사건 없음(해당 2건)'; // D-82: 명세 (b)의 짧은 단서 치환 입력.
      a.clueMore.event = '우리 도시 정전에 닿는 효과 없음 / 우리 도시 정전에 닿는 사건 없음'; // D-82: 상세 단서의 모든 출현을 검사.
      const before = clone(a), text = textOf(opened(f, a, evidenceCases[0], 'event')); // D-82: 실제 렌더러 경계 호출.
      const phrase = target === 'grid' ? '우리 도시가 바깥 계통에 기댄 전기에 닿는' : '우리 도시 정전에 닿는'; // D-82: 대상별 명세 문자열.
      assert.ok(text.includes(`${phrase} 사건 없음(해당 2건)`), '짧은 사건 단서의 대상 문구'); // D-82: 카드·요약 어디서든 원문 전체 대조.
      assert.ok(text.includes(`${phrase} 효과 없음 / ${phrase} 사건 없음`), '상세 사건 단서의 모든 출현'); // D-82: 상세 치환 누락 방지.
      assert.ok(!text.includes(target === 'grid' ? '우리 도시 정전에 닿는' : '우리 도시가 바깥 계통에 기댄 전기에 닿는'), '다른 대상 문구 없음'); // D-82: 혼용 금지.
      const surfaces = { result: text, ...Object.fromEntries(Object.entries(records(f, a, 'event')).map(([k, v]) => [k, textOf(v)])) }; // D-82: 결과·일지·타임라인·다음 달 비용 경로.
      for (const [route, surface] of Object.entries(surfaces)) { // D-82: 같은 저장 입력의 소비자를 모두 검사.
        const costs = surface.match(/\(비용 [^)]*\)/g) || []; // D-82: 기존 다른 비용 문구와 S7 비용을 구별.
        if (target === 'grid') { // D-82: 계통에는 계산한 비용이 반드시 존재.
          assert.ok(costs.length > 0, `${route} 비용 표시 존재`); // D-82: 빈 출력으로 통과하지 않음.
          assert.ok(costs.every(v => v === costText(sign * 12.34, true)), `${route} 독립 비용·부호·억/일`); // D-82: 허용 오차 없이 문자열 전체 비교.
        } else assert.deepEqual(costs, [], `${route} 정전에는 계통 비용 표기 없음`); // D-82: 정전 표시 계약 보존.
      } // D-82: 비용 경로 검사 끝.
      assert.deepEqual(a, before, '표시가 입력 고정본의 수치·원문을 변경하지 않음'); // D-82: 표시 문구 전환은 저장 입력의 변형이 아님.
    }); // D-82: 새 표시 계약 검사 끝.
  } // D-82: 대상·부호·단일/여러 원인 순회 끝.
  for (const sign of [-1, 1]) check(`18 D-82 ${basis}/${sign} 단위 없는 옛 계통 기록`, () => { // D-82: 과거 기록은 월 합계 단위로 읽고 현재 결과에서는 교체.
    const old = partRecord(f, basis, 'grid', 1000, { ...allZero, trade: sign * 123.45 }); // D-82: 새 값과 혼동할 수 없는 옛 월 합계 입력.
    delete old.unit; // D-82: 실제 단위 없는 옛 계통 고정본.
    const before = clone(old), saved = records(f, old, 'trade'); // D-82: 닫힌 과거 기록의 소비 경로.
    for (const [route, raw] of Object.entries(saved)) { // D-82: 과거 일지·타임라인·다음 달 표시는 기존 단위 유지.
      const text = textOf(raw); // D-82: 실제 보이는 문자열을 검사.
      assert.ok(text.includes(costText(sign * 123.45, false)), `${route} 옛 비용은 억`); // D-82: 비용 값과 부호도 독립 계산.
      assert.ok(text.includes(`${sign < 0 ? '−' : '+'}123.5 MWh`), `${route} 옛 몫은 월 합계 MWh`); // D-82: 표시 반올림의 리터럴 기대값.
      assert.ok(!text.includes('억/일') && !text.includes('MWh/일'), `${route} 옛 월 합계에 하루 평균 꼬리말 없음`); // D-82: 과거 기록을 단위만 바꾸지 않음.
    } // D-82: 옛 표시 경로 검사 끝.
    storage.delete(teamKey); reset(); // D-82: 앞 합성 기록을 지우고 실제 사본·시험으로 현재 분해를 재계산.
    const previous = f.V.results.find(r => r.round === f.res.round - 1); // D-82: 지난달 공개 결과만 기대값 입력으로 사용.
    const trial = Object.values(JSON.parse(storage.get('kcp-build-trial-v1') || '{}'))[0]; // D-82: 저장 시험의 원래 형식과 일수를 읽음.
    const perDay = result => Math.max(0, result.team[id].isolated.uns - result.team[id].uns - result.team[id].imp + result.team[id].sub) / result.days; // D-82: 공개 보충량/대표 일수의 독립 산식.
    const base = basis === 'monthly' ? perDay(previous) : trial.gridMWh / trial.days; // D-82: 월 합계가 아닌 명세의 기준 하루 평균.
    const html = opened(f, old, evidenceCases[0]), replacement = session.outShownPending?.frozen; // D-82: 교체될 실제 표시 고정본 확인.
    assert.equal(replacement?.unit, 'MWh/일', '현재 결과는 새 하루 평균 고정본으로 교체'); // D-82: 옛 기록 재사용 금지.
    assert.ok(Math.abs(replacement.trial - base) <= 1e-9, '교체 분해의 독립 출발값'); // D-82: 기존 정밀도 유지.
    assert.ok(Math.abs(replacement.actual - perDay(f.res)) <= 1e-9, '교체 분해의 독립 도착값'); // D-82: 반환값을 기대값으로 복사하지 않음.
    assert.ok(textOf(html).includes('우리 도시가 바깥 계통에 기댄 전기에 닿는'), '옛 계통 고정본 교체 뒤 사건 문구도 계통 대상'); // D-82: (b)의 옛 기록 재표시 경로.
    assert.ok(!textOf(html).includes('우리 도시 정전에 닿는'), '교체 뒤 정전 문구 잔류 없음'); // D-82: (b) 혼용 금지.
    assert.deepEqual(old, before, '과거 월 합계 입력을 직접 변경하지 않음'); // D-82: 교체와 원본 변형을 구별.
  }); // D-82: 옛 계통 기록 검사 끝.
  check(`19 D-82 ${basis} target·unit 없는 옛 정전 기록`, () => { // D-82: 대상도 없던 옛 기록은 정전 표시를 유지.
    const old = partRecord(f, basis, 'uns', 30, { ...allZero, event: -12.34, weather: 1.23 }); // D-82: 옛 정전 입력.
    delete old.target; delete old.unit; // D-82: 원래 저장 형식의 누락 필드.
    old.clues.event = '우리 도시 정전에 닿는 사건 없음(해당 2건)'; // D-82: 짧은 사건 문구.
    old.clueMore.event = '우리 도시 정전에 닿는 효과 없음'; // D-82: 상세 사건 문구.
    const text = textOf(opened(f, old, evidenceCases[0], 'event')); // D-82: 실제 현재 대상이 계통이어도 고정본의 옛 대상 우선.
    assert.ok(text.includes('우리 도시 정전에 닿는 사건 없음(해당 2건)') && text.includes('우리 도시 정전에 닿는 효과 없음'), '옛 정전 단서 그대로'); // D-82: (b)의 정전 호환.
    assert.ok(!text.includes('우리 도시가 바깥 계통에 기댄 전기에 닿는') && !text.includes('(비용 '), '옛 정전에 계통 문구·비용 없음'); // D-82: (a)(b)의 옛 정전 호환.
  }); // D-82: 옛 정전 기록 검사 끝.
  for (const sign of [-1, 1]) for (const row of [{ choice: 9.44, event: 9.43, tied: true }, { choice: 9.46, event: 9.44, tied: false }]) { // D-82: 원시값은 다르되 표시가 같거나 달라지는 양·음 경계.
    check(`20 D-82 ${basis}/${sign}/${row.choice} 표시 반올림 동점`, () => { // D-82: 화면과 저장 판정의 일치.
      const a = partRecord(f, basis, 'grid', 0, { ...allZero, choice: sign * row.choice, event: -sign * row.event }); // D-82: 두 몫만 있는 독립 입력.
      const html = opened(f, a, evidenceCases[0], 'event'), first = firstVerdict(html); // D-82: 원시값이 작은 event를 선택.
      assert.ok(first.includes(valueText(-sign * row.event, 'grid')), '선택값의 표시 반올림'); // D-82: 소수 첫째 자리·부호·하루 단위.
      assert.ok(first.endsWith(row.tied ? ' · 크기가 같은 가장 큰 몫 중 하나예요' : ' · 몫은 있지만 가장 크지 않았어요'), '표시 눈금에서만 동점 판정'); // D-82: 원시값 비교 회귀 방지.
      const tagged = [...html.matchAll(/<button\b[^>]*data-missed="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)].filter(m => m[2].includes('data-out-tag="largest"')).map(m => m[1]); // D-82: 카드의 공동 최대 표식도 같은 기준.
      assert.deepEqual(tagged, row.tied ? ['choice', 'event'] : ['choice'], '반올림 동점 카드 표식'); // D-82: 첫 카드만 최대가 되는 회귀 방지.
      for (const [route, raw] of Object.entries(records(f, a, 'event'))) { // D-82: 기록의 판정도 같은 표시 눈금.
        const text = textOf(raw); // D-82: 보이는 기록 문자열.
        assert.equal(text.includes(tiedLabel), row.tied, `${route} 반올림 동점 기록 라벨`); // D-82: 원시 차이가 남아도 표시 같으면 동점.
        assert.ok(!text.includes(uniqueLabel), `${route} 작은 원시 몫을 단독 최대로 쓰지 않음`); // D-82: 반올림 동점과 단독 최대 구분.
      } // D-82: 기록 동점 검사 끝.
    }); // D-82: 반올림 동점 검사 끝.
  } // D-82: 부호·눈금 순회 끝.
  for (const replay of [.049999, .05, .050001, -.049999, -.05, -.050001]) check(`21 D-82 ${basis}/${replay} 계통 재현 반 눈금`, () => { // D-82: 정전 경계 검사는 기존 그대로 두고 하루 평균 경계를 추가.
    const a = partRecord(f, basis, 'grid', 10, { ...allZero, choice: 2, event: -1 }); // D-82: 공개 가능한 여러 원인 합성 입력.
    a.replay = replay; // D-82: 정확한 경계값 직접 주입.
    if (basis === 'trial') { a.actual += replay; a.total += replay; } // D-82: 시험은 재현 포함 합계, 월간은 합계 밖 진단 유지.
    const html = opened(f, a, evidenceCases[0]), shown = Math.abs(replay) >= .05; // D-82: 0.1 MWh/일 표시 반 눈금의 독립 기대값.
    assert.equal(html.includes('id="lg-outage-replay"'), shown, '계통 재현 설명 경계'); // D-82: 양·음 경계 모두 정확 대조.
    assert.equal(html.includes('data-out-step="replay"'), basis === 'trial' && shown, '시험만 재현 폭포 줄, 월간은 합계 밖'); // D-82: 재현의 합계 위치 보존.
  }); // D-82: 계통 재현 경계 검사 끝.
} // D-82: 추가 계약 순회 끝.
console.log(`V5 S7: ${checks} checks, ${failures.length} failures`);
process.exitCode = failures.length ? 1 : 0;
