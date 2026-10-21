'use strict';
// 총괄 10-21 지시: asOf·published 계약과 실제 사건 출처 문자열을 브라우저 없이 검사한다.
// 실행: node tests/league/evsrc-node.js
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
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const ctx = vm.createContext({ KCP: {}, URL, esc });
ctx.window = ctx;
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../ui/league-data.js'), 'utf8'), ctx);
const events = Object.values(ctx.KCP.LEAGUE_REGIONS).flatMap(region => region.events);
const missing = events.filter(event => event.asOf === undefined).map(event => event.id);
console.log(`사건 ${events.length}개 / asOf 미기재 ${missing.length}개: ${missing.join(', ') || '없음'}`);
// league-data.js 계약: asOf는 항상 배열 또는 null(미기재 금지).
test('asOf 미기재 사건 없음', () => assert.deepEqual(missing, []));
function dateArray(value, label) {
  assert.ok(Array.isArray(value), label + ' 배열');
  for (const item of value) {
    assert.equal(typeof item, 'string', label + ' 문자열');
    // league-data.js 계약: 원소는 YYYY·YYYY-MM, 기간은 ISO 8601 구간 '시작/끝'.
    assert.match(item, /^\d{4}(-\d{2})?(\/\d{4}(-\d{2})?)?$/, label + ' YYYY·YYYY-MM 또는 시작/끝 구간');
  }
}
assert.ok(events.length > 0, '사건 자료 존재');
for (const event of events) {
  test(event.id + ' asOf 배열 또는 null·원소 형식', () => {
    if (event.asOf !== null) dateArray(event.asOf, 'asOf');
  });
  if (Object.hasOwn(event, 'published')) {
    test(event.id + ' published 배열·원소 형식', () => dateArray(event.published, 'published'));
  }
}

// 원본은 읽기만 한다. 기대 문자열을 복제 구현하지 않고 실제 순수 함수들을 VM에서 평가한다.
const source = fs.readFileSync(path.resolve(__dirname, '../../ui/league.js'), 'utf8');
for (const name of ['externalLinks', 'eventSourceTimeText', 'eventSourceHTML']) {
  const match = source.match(new RegExp('^  function ' + name + '\\([^]*?^  }', 'm'));
  assert.ok(match, name + ' 함수 존재');
  vm.runInContext(match[0], ctx);
}
function expectTime(event, expected) {
  const before = JSON.stringify(event);
  const html = ctx.eventSourceHTML(event);
  assert.ok(html.includes(' · ' + esc(expected) + ' · 근거 '), expected);
  assert.equal(ctx.eventSourceTimeText(event), expected, '순수 도우미');
  assert.equal(JSON.stringify(event), before, '자료 변경 없음');
  return html;
}
test('null·발표 있음은 관측 없음과 발표를 구분', () => {
  expectTime(events.find(event => event.id === 'finedust_coal_cap'),
    '자료 시점 없음 · 발표 2025-11');
});
test('자료·발표 시점을 분리하고 why의 목표 연도는 넣지 않음', () => {
  expectTime(events.find(event => event.id === 'coal_phaseout'),
    '자료 시점 2025-12 · 발표 2024-12');
});
test('여러 관측 원소·발표 생략', () => {
  expectTime(events.find(event => event.id === 'heatwave_peak'),
    '자료 시점 2024-08, 2025-07');
});
test('여러 발표 원소의 순서·구분 유지', () => {
  expectTime(events.find(event => event.id === 'line_opposition_delay'),
    '자료 시점 없음 · 발표 2024-11, 2025-04');
});
test('undefined는 null과 구분하고 why에서 시점을 추정하지 않음', () => {
  expectTime({ why: '가상 계획 2040년 · 가상 수치 20250' }, '자료 시점 미기재');
  expectTime({ asOf: null }, '자료 시점 없음');
});
test('ISO 구간은 시작~끝으로 표시', () => {
  expectTime(events.find(event => event.id === 'spring_dust_haze'), '자료 시점 2010~2018 · 발표 2020');
  expectTime({ asOf: ['2025-01/2025-06'] }, '자료 시점 2025-01~2025-06');
});
test('연도만 있는 원소도 그대로 표시', () => {
  expectTime({ asOf: ['2024'], published: ['2023'] }, '자료 시점 2024 · 발표 2023');
});
test('동적 값 이스케이프·출처 링크·등급·안내 줄 유지', () => {
  const event = { id: '<가상>', why: '<설명>', asOf: ['<관측>'], published: ['<발표>'],
    sources: ['https://example.org/?a=1&b=2'], grade: '<등급>' };
  const html = expectTime(event, '자료 시점 <관측> · 발표 <발표>');
  assert.ok(html.includes('data-event-source="&lt;가상&gt;"'));
  assert.ok(html.includes('<p>&lt;설명&gt;</p>'));
  assert.ok(html.includes('<a href="https://example.org/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">example.org</a>'));
  assert.ok(html.includes(' · 근거 &lt;등급&gt; · 크기 G</p>'));
  assert.ok(html.includes('<p class="lg-hint">실측값의 단위는 위 설명 기준이에요. 사건 크기·대응 효과는 게임 가정(G)입니다.</p>'));
  const fallback = ctx.eventSourceHTML({ asOf: null });
  assert.ok(fallback.includes('<p>실측값 자료 없음 · 게임 가정(G)</p>'));
  assert.ok(fallback.includes('출처: 외부 출처 자료 없음 · 자료 시점 없음 · 근거 G · 크기 G'));
});
console.log(`evsrc-node: ${checks - failures}/${checks} 통과, ${failures} 실패`);
process.exitCode = failures ? 1 : 0;
