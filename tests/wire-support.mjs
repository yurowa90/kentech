// 원문 고정 검사용 경계 도구. 기대값은 fixtures에서만 읽는다.
// 차트 함수는 인수만 기록한다. 브라우저·DOM·차트 렌더러의 정확성은 검사하지 않는다.
import fs from 'node:fs';
import vm from 'node:vm';
import { isDeepStrictEqual } from 'node:util';

export const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
// HTML 태그 제거 후 따옴표 모양과 연속 공백(양끝 포함)만 정규화한다.
// HTML 엔티티 디코딩, 문장부호·철자·띄어쓰기 제거 등은 하지 않는다.
export const textOf = value => String(value ?? '').replace(/<[^>]*>/g, '')
  .replace(/[“”„‟]/g, '"').replace(/[‘’‚‛]/g, "'").replace(/\s+/g, ' ').trim();
export const blocks = (html, tag, attrs = '') => [...html.matchAll(
  new RegExp(`<${tag}${attrs || '\\b[^>]*'}>([\\s\\S]*?)<\\/${tag}>`, 'g'),
)].map(match => match[1]);

export function load(year) {
  const source = fs.readFileSync(new URL(`../g${year}.js`, import.meta.url), 'utf8');
  const ref = JSON.parse(fs.readFileSync(new URL(`fixtures/ref-${year}.json`, import.meta.url), 'utf8'));
  const charts = [];
  const KCP = { games: {}, esc: String, on() {}, memoPanel: () => '' };
  for (const kind of ['hbar', 'vbar', 'lines']) KCP[kind] = (...args) => {
    charts.push({ kind, args: plain(args) });
    return ''; // 실제 자료 함수는 실행하고 그리기 경계만 대체한다.
  };
  const context = vm.createContext({ window: { KCP } });
  vm.runInContext(source, context, { filename: `g${year}.js`, timeout: 1000 });
  // 앱이 Object.prototype 동일성을 검사하므로 합성 입력도 앱과 같은 realm에서 생성한다.
  const inVM = value => vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(value))})`, context, { timeout: 1000 });
  // 현재 const 선언과 같은 들여쓰기의 닫는 괄호/세미콜론 형식만 지원한다.
  // 함수/템플릿을 포함한 리터럴도 허용하며 의존성은 호출자가 명시한다.
  // 형식이 바뀌면 추출 오류로 실패한다. 소스 전체를 변조해 재실행하지 않는다.
  const literal = (name, dependencies = {}, indent = 2) => {
    const pad = ' '.repeat(indent);
    const match = source.match(new RegExp(`^${pad}const ${name} = ([^\\n]*;|[\\s\\S]*?^${pad}[}\\]];)`, 'm'));
    if (!match) throw Error(`상수 리터럴 추출 불가: ${name}`);
    return vm.runInNewContext(`(${match[1].replace(/;$/, '')})`,
      { KCP, esc: KCP.esc, ...dependencies }, { filename: `g${year}.js:${name}`, timeout: 1000 });
  };
  return { source, ref, charts, game: KCP.games[String(year)], literal, inVM };
}

export function prepHTML(game, state) {
  let html;
  const stop = new Error('innerHTML captured');
  const root = { set innerHTML(value) { html = value; throw stop; } };
  try { game.renderPrep(root, state, () => {}, () => {}); }
  catch (error) { if (error !== stop) throw error; }
  if (html === undefined) throw Error('renderPrep가 HTML을 만들지 않음');
  return html;
}

export function audit(year, body) {
  const failures = [], skips = [], loose = [];
  const recordLoose = (item, kinds, reason) => {
    if (kinds.length) loose.push({ item, kinds, reason });
  };
  const looseSummary = (entries = []) => {
    const counts = {};
    for (const entry of entries) for (const kind of entry.kinds) counts[kind] = (counts[kind] ?? 0) + 1;
    return `느슨 비교 ${entries.length}건 (${Object.entries(counts).map(([kind, count]) => `${kind} ${count}`).join(', ') || '없음'})`;
  };
  let passed = 0;
  const check = (item, actual, expected, page, tolerance = 0) => {
    if (tolerance > 0) recordLoose(item, [`수치 근사 ±${tolerance}`], 'fixture uncertain의 화소 측정 허용 오차');
    const ok = tolerance > 0
      ? typeof actual === 'number' && Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance + 1e-9
      : isDeepStrictEqual(plain(actual), plain(expected));
    if (ok) { passed++; return; }
    let context = '';
    if (typeof actual === 'string' && typeof expected === 'string') {
      let index = 0;
      while (index < Math.min(actual.length, expected.length) && actual[index] === expected[index]) index++;
      context = `첫 차이 ${index} (0부터): 기준 ${JSON.stringify(expected.slice(Math.max(0, index - 20), index + 21))} / 앱 ${JSON.stringify(actual.slice(Math.max(0, index - 20), index + 21))}`;
    }
    const failure = { file: `g${year}.js`, item, expected, actual, page, tolerance, context };
    failures.push(failure);
    console.log(`실패 ${item} (${page}): 기준 ${JSON.stringify(expected)} / 앱 ${JSON.stringify(actual)}${tolerance ? ` (±${tolerance})` : ''}${context ? `\n  ${context}` : ''}`);
  };
  const api = {
    check,
    text(item, actual, expected, page, options = {}) {
      const kinds = [];
      const raw = [actual, expected].map(value => String(value ?? '').replace(/<[^>]*>/g, ''));
      if (raw.some(value => /[“”„‟‘’‚‛]/.test(value))) kinds.push('따옴표 정규화');
      if (raw.some(value => /\s{2,}/.test(value.trim()))) kinds.push('연속 공백 정규화');
      let value = textOf(actual), target = textOf(expected);
      if (options.ignoreWhitespace) {
        kinds.push('공백 무시');
        value = value.replace(/\s/g, '');
        target = target.replace(/\s/g, '');
      }
      // 후보는 호출자가 fixture uncertain에서 읽는다. 숫자가 든 낱말은 완화하지 않는다.
      let readings = [target];
      for (const candidates of options.variants ?? []) {
        if (candidates.some(word => !word || /\d/.test(word) || word.length !== candidates[0].length) ||
            target.split(candidates[0]).length !== 2) {
          throw Error(`${item}: 잘못된 판독 후보`);
        }
        kinds.push('특정 글자 후보');
        // 기준 문장의 그 자리만 후보로 바꾼다. 앱 문장에서 낱말을 통째로 지우지 않는다.
        readings = readings.flatMap(reading => candidates.map(word => reading.replace(candidates[0], word)));
      }
      if (readings.includes(value)) value = target;
      if (options.parentheticalSuffix) {
        kinds.push('원문 접두·괄호 보충');
        const suffix = value.slice(target.length);
        if (value.startsWith(target) && (!suffix || /^ \([^()]*\)$/.test(suffix))) value = target;
      }
      recordLoose(item, [...new Set(kinds)], options.reason ?? '따옴표 모양·연속 공백만 정규화');
      check(item, value, target, page);
    },
    skip(item, reason) { skips.push({ item, reason }); console.log(`건너뜀 ${item} (${reason})`); },
  };
  try { body(api, load(year)); }
  catch (error) { check('검사 실행/자료 추출', String(error.stack), '예외 없이 모든 항목 검사', '검사 기반'); }
  const result = { year, passed, failures, skips, loose };
  const dir = '/private/tmp/kentech-wire-tests';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/result-${year}.json`, JSON.stringify(result, null, 2));
  const results = ['2024', '2025', '2026'].flatMap(y => {
    const path = `${dir}/result-${y}.json`;
    return fs.existsSync(path) ? [JSON.parse(fs.readFileSync(path, 'utf8'))] : [];
  });
  const show = value => JSON.stringify(value) ?? 'undefined (앱에 없음)';
  const lines = ['# 2024~2026 원문 전사 고정 Node 검사', '',
    '실행: 저장소 루트에서 `node tests/model_g2024-wire.mjs`, `node tests/model_g2025-wire.mjs`, `node tests/model_g2026-wire.mjs`.',
    '브라우저 없이 Node vm에서 실행. 기대값은 tests/fixtures/ref-202X.json만 사용. 앱 코드는 수정하지 않음.',
    '각 연도의 가장 최근 실행 결과를 모음. 불일치는 원문 고해상도로 총괄이 판정한다.', '', '## 차이 목록', ''];
  for (const r of results) {
    lines.push(`### ${r.year}: 통과 ${r.passed} / 실패 ${r.failures.length} / 건너뜀 ${r.skips.length} / ${looseSummary(r.loose)}`, '');
    for (const f of r.failures) lines.push(`- 파일: ${f.file} · 항목: ${f.item} · 원문 쪽: ${f.page}`,
      `  - 기준값: ${show(f.expected)}`, `  - 앱값: ${show(f.actual)}${f.tolerance ? ` (허용 오차 ±${f.tolerance})` : ''}`,
      ...(f.context ? [`  - ${f.context}`] : []));
    if (!r.failures.length) lines.push('- 차이 없음');
    lines.push('', '건너뜀(사유):', '', ...r.skips.map(s => `- ${s.item}: ${s.reason}`), '');
    lines.push('느슨 비교(한 항목에 여러 종류가 겹칠 수 있음):', '',
      ...(r.loose ?? []).map(entry => `- ${entry.item} [${entry.kinds.join(', ')}]: ${entry.reason}`), '');
  }
  fs.writeFileSync(`${dir}/last.md`, `${lines.join('\n')}\n`);
  console.log(`통과 ${passed} / 실패 ${failures.length} / 건너뜀 ${skips.length} / ${looseSummary(loose)}`);
  if (failures.length) process.exitCode = 1;
}
