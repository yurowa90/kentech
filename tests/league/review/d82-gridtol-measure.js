'use strict';
// 읽기 전용: 로그·현재 게임 달력만 읽고 JSON/Markdown을 stdout에 출력한다.
// node tests/league/review/d82-gridtol-measure.js [--json] [--briefs /absolute/_briefs]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const expectedSolo = [1632.2, 1053.4, 1002.4, 692, 1137.6, 843.3, 1119.5, 955.7, 765.9, 993.6, 960.3, 1495];
const files = ['video4/solo/solo-log.json', 'video4/multi/team-log.json', 'video5/solo/solo-log.json',
  'video5/multi/team-log.json', 'video5/mobile/mobile/mobile-log.json'];
const number = s => Number(s.replaceAll(',', '').replaceAll('−', '-'));
const near = (a, b, eps, message) => assert.ok(Math.abs(a - b) <= eps, `${message}: ${a} / ${b}`);
function calendar() {
  const ctx = vm.createContext({ KCP: {} }); ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'ui/league-core.js'), 'utf8'), ctx);
  const C = ctx.KCP.leagueCore;
  return Array.from(C.roundsOf({ rounds: C.monthRounds(12, 2027, 1) }), r => r.mdays);
}
function parse(file, root, days) {
  const raw = fs.readFileSync(path.join(root, file), 'utf8'), log = JSON.parse(raw), months = new Map();
  for (const scene of log.scenes) {
    const month = Number(scene.id.match(/^(\d+)월/)?.[1]); if (!month) continue;
    const r = months.get(month) || { month, sources: [], displayed: [], exact: [], deltas: [], parts: [] };
    for (const [label, v] of scene.notes || []) {
      if (typeof v === 'string') {
        const text = v.match(/계통이 메운 전기\s*([\d,.]+)\s*MWh/);
        if (text) {
          r.displayed.push(number(text[1])); r.sources.push(`${scene.id}/${label}`);
          const delta = v.slice(text.index).match(/지난달 대비 Δ\s*([+−\-\d,.]+)\s*MWh/);
          if (delta) r.deltas.push(number(delta[1]));
        }
      }
      if (v?.topic === 'grid' && Number.isFinite(v.actual)) {
        r.exact.push(v.actual); r.sources.push(`${scene.id}/${label}`);
      }
      const a = v?.outageFrozen || (label === 'S7 분해 기준' ? v : null);
      if (a?.id) r.city = a.id;
      if (a?.target === 'grid' && Number.isFinite(a.actual)) {
        r.exact.push(a.actual); r.sources.push(`${scene.id}/${label}`);
        const base = a.trial ?? a.trial_or_last;
        const parts = a.parts.map(p => Array.isArray(p) ? p[1] : p.value);
        if (Number.isFinite(base)) near(parts.reduce((s, p) => s + p, 0) + (a.replayOutsideSum ? 0 : a.replay || 0), a.actual - base, .004, `${file}/${month} S7 합계`);
        r.parts.push({ basis: a.basis, base, parts: a.parts });
      }
      if (v?.operatingPlan) r.plan = JSON.stringify(v.operatingPlan);
    }
    months.set(month, r);
  }
  const cities = [...new Set([...months.values()].map(r => r.city).filter(Boolean))];
  assert.deepEqual(cities, ['pyeongtaek'], `${file}: 복원 대상 도시를 기록으로 확인`);
  const rows = [...months.values()].filter(r => r.displayed.length || r.exact.length).sort((a, b) => a.month - b.month).map(r => {
    const mwh = r.exact[0] ?? r.displayed[0];
    r.exact.forEach(v => near(v, mwh, 1e-8, `${file}/${r.month} 원시 화면 관측 일치`));
    r.displayed.forEach(v => near(v, mwh, .050001, `${file}/${r.month} 화면 반올림 일치`));
    return { ...r, city: cities[0], mwh, days: days[r.month - 1], perDay: mwh / days[r.month - 1], precision: r.exact.length ? '원시 화면 관측' : '표시 0.1 MWh' };
  });
  for (const r of rows) {
    const prev = rows.find(p => p.month === r.month - 1);
    if (prev) r.deltas.forEach(v => near(v, r.mwh - prev.mwh, .100001, `${file}/${r.month} S6 Δ 대조`));
    if (prev) r.parts.filter(p => p.basis === 'monthly').forEach(p => near(p.base, prev.mwh, .050001, `${file}/${r.month} S7 지난달 기준 대조`));
    if (file.includes('/solo/')) near(r.mwh, expectedSolo[r.month - 1], .050001, `${file}/${r.month} review 혼자 값 대조`);
  }
  return { file, sha256: createHash('sha256').update(raw).digest('hex'), rows };
}
const direction = (delta, tol) => Math.abs(delta) <= tol ? 'same' : delta > 0 ? 'up' : 'down';
function pairs(rows) {
  return rows.flatMap(r => {
    const p = rows.find(p => p.city === r.city && p.month === r.month - 1); if (!p) return [];
    return [{ month: r.month, city: r.city, base: p.perDay, delta: r.perDay - p.perDay,
      rate: p.perDay === 0 ? null : (r.perDay / p.perDay - 1) * 100,
      old: direction(r.mwh - p.mwh, Math.max(1, .05 * Math.abs(p.mwh))) }];
  });
}
function distribution(xs) {
  const a = xs.filter(Number.isFinite).sort((a, b) => a - b);
  const q = p => { const i = (a.length - 1) * p, lo = Math.floor(i); return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo); };
  return { n: a.length, min: a[0], q25: q(.25), median: q(.5), q75: q(.75), max: a.at(-1) };
}
function measure(root) {
  const days = calendar(), logs = files.map(file => parse(file, root, days));
  // 같은 대본·씨앗의 4/5차는 독립 관측으로 세지 않는다. 월값·계획도 대조한다.
  for (const mode of ['solo', 'multi']) {
    const a = logs.find(l => l.file === `video4/${mode}/${mode === 'solo' ? 'solo' : 'team'}-log.json`);
    const b = logs.find(l => l.file === `video5/${mode}/${mode === 'solo' ? 'solo' : 'team'}-log.json`);
    assert.equal(a.rows.length, b.rows.length);
    for (const r of a.rows) {
      const s = b.rows.find(s => s.month === r.month); near(r.mwh, s.mwh, .050001, '4/5차 중복 월값');
      if (r.plan && s.plan) assert.deepEqual(JSON.parse(r.plan), JSON.parse(s.plan), '4/5차 운영 계획');
    }
  }
  const solo = logs[2].rows, multi = logs[3].rows;
  assert.equal(solo.length, 12); assert.equal(multi.length, 6); assert.equal(logs[4].rows.length, 1);
  near(logs[4].rows[0].mwh, solo[0].mwh, 1e-8, '모바일 1월 중복');
  const groups = { solo: pairs(solo), multi: pairs(multi) };
  groups.combined = [...groups.solo, ...groups.multi];
  // 혼자/멀티도 동일한 전후 월값인 비교는 보수적으로 한 번만 센다(5·6월만 다름).
  groups.unique = groups.combined.filter((r, i, arr) => arr.findIndex(s => s.month === r.month && Math.abs(s.base - r.base) < 1e-8 && Math.abs(s.delta - r.delta) < 1e-8) === i);
  const candidates = [];
  for (const floor of [.02, .05, .1]) for (const share of [.03, .05, .07, .1]) {
    const result = { floor, share };
    for (const [key, rs] of Object.entries(groups)) {
      const ds = rs.map(r => ({ ...r, actual: direction(r.delta, Math.max(floor, share * Math.abs(r.base))) }));
      const same = ds.filter(r => r.actual === 'same').length;
      result[key] = { n: rs.length, same, percent: 100 * same / rs.length,
        changed: ds.filter(r => r.old !== r.actual).map(r => `${r.city}/${r.month}월 ${r.old}→${r.actual}`) };
    }
    candidates.push(result);
  }
  return { days, logs, groups, candidates, distribution: Object.fromEntries(Object.entries(groups).map(([k, r]) => [k, { signedPercent: distribution(r.map(r => r.rate)), absolutePercent: distribution(r.map(r => Math.abs(r.rate))) }])) };
}
function markdown(o) {
  const f = x => x == null ? '—' : x.toFixed(4), rate = r => `${r.same}/${r.n} (${r.percent.toFixed(2)}%)`;
  const lines = ['# D-82 하루 평균 계통 문턱 측정', '',
    '**G 제안: max(0.05 MWh/일, |기준 하루 평균| × 5%). 최종 선택은 총괄.**', '',
    'D-80과 같은 10~60%를 탐색 목표로 둔다(G). 거의 매번 같거나 다른 답만 나오는 것을 피하려는 교육용 범위이며 통계적 적정성 기준은 아니다. 모든 후보가 혼자 9.09%, 멀티 0%로 목표에 못 미쳤다. 이 표본에 맞추려고 약 14.1% 이상으로 넓히면 문제로 지적된 3월 감소도 다시 같음에 들어가므로 5%를 잠정 유지한다. 절대 하한 0.05는 후보 중간값인 G 선택이며 데이터로 식별되지 않았다. 최적 문턱을 찾았다는 뜻이 아니다.', '',
    '## 입력·중복·정밀도', '',
    '- 장면 문자열의 `계통이 메운 전기 N MWh`, 그 뒤의 `지난달 대비 Δ`를 읽고, S4 복제 운영 관측 및 S7 actual·parts와 대조한다. review의 혼자 12개 값 전부 표시 오차 ±0.05 MWh 안에서 일치한다.',
    '- 4·5차 혼자 12달은 같은 대본·씨앗·운영 계획과 계통값이므로 5차만 센다. 멀티 4·5차 6달도 같은 기준으로 한 번만 센다. 모바일 1월은 혼자 1월과 같고 월간 비교도 없어 제외한다.',
    '- 멀티는 6팀 참가지만 이 로그에서 관측 가능한 월별 계통값은 평택 하나뿐이다. 다른 다섯 도시를 추정하거나 0으로 채우지 않는다.',
    '- 주 표본은 혼자 12도시·달/11비교. 멀티 6도시·달/5비교는 보조 표본이다. 합쳐 18도시·달/16비교지만 독립 판 18개가 아니다. 혼자·멀티의 2~4월 비교도 일치하므로 보수적 중복 제거는 13비교다(5·6월만 추가).',
    '- 월 일수는 현재 league-core.js를 VM으로 읽어 C.monthRounds(12,2027,1) → C.roundsOf의 mdays를 사용한다. 첫 달은 지난달 비교에서 제외한다. 시험 대비는 이 문턱 표본에 넣지 않는다.',
    '- 원시 화면 관측이 있으면 이를 쓰고 S6의 소수 첫째 자리와 대조한다. 없다면 표시값을 쓴다. S7 parts의 반올림 합계 허용차는 0.004 MWh. 분포 분위수는 (n−1)p 선형 보간, 변화율 분모 0은 제외한다.', '',
    `달력: ${o.days.join(', ')}일.`, '',
    '| 입력 | 복원 도시·달 | SHA-256 |', '|---|---:|---|'];
  for (const l of o.logs) lines.push(`| ${l.file} | ${l.rows.length} | ${l.sha256} |`);
  lines.push('', '## 복원 월별 값', '', '| 판 | 도시 | 월 | 일수 | 월 MWh | MWh/일 | 하루 평균 변화율 % |', '|---|---|---:|---:|---:|---:|---:|');
  for (const [key, log] of [['solo', o.logs[2]], ['multi', o.logs[3]]]) for (const r of log.rows)
    lines.push(`| ${key} | ${r.city} | ${r.month} | ${r.days} | ${f(r.mwh)} | ${f(r.perDay)} | ${f(o.groups[key].find(p => p.month === r.month)?.rate)} |`);
  lines.push('', '## 변화율 분포', '', '| 표본·변화율 | n | 최소 | 25% | 중앙 | 75% | 최대 |', '|---|---:|---:|---:|---:|---:|---:|');
  for (const [key, values] of Object.entries(o.distribution)) for (const [kind, d] of Object.entries(values)) lines.push(`| ${key}/${kind} | ${d.n} | ${[d.min,d.q25,d.median,d.q75,d.max].map(f).join(' | ')} |`);
  lines.push('', '## 후보: 포함 경계 |Δ| ≤ max(하한, 비율×|기준|)', '', '| 하한 MWh/일 | 비율 | 혼자 | 멀티 | 합산 | 비교 중복 제거 | 옛 월 문턱과 다른 달 |', '|---:|---:|---|---|---|---|---|');
  for (const c of o.candidates) lines.push(`| ${c.floor} | ${Math.round(c.share * 100)}% | ${['solo','multi','combined','unique'].map(k => rate(c[k])).join(' | ')} | 혼자: ${c.solo.changed.join(', ') || '없음'}; 멀티: ${c.multi.changed.join(', ') || '없음'} |`);
  lines.push('', '모든 관측 기준은 약 23~53 MWh/일로 비율 문턱이 절대 하한보다 크다. 0 또는 작은 계통값, 다른 도시·씨앗·학생 전략에 대한 절대 하한의 적정성은 미측정이다. 기존 월 문턱은 혼자 2/11(18.18%), 멀티 1/5(20%). 새 후보 모두 3월을 same→down으로 바꾸고 11월은 same을 유지한다.', '',
    '실행: `node tests/league/review/d82-gridtol-measure.js` (Markdown stdout), `--json` (전체 관측·후보 JSON stdout). 다른 입력 루트는 `--briefs <경로>`. 스크립트는 파일을 쓰지 않는다. 결과를 저장한다면 `tests/results/` 아래로 리다이렉트한다. 브라우저·네트워크·봇 장기 운전 없음.', '');
  return lines.join('\n');
}
if (require.main === module) {
  const args = process.argv.slice(2), index = args.indexOf('--briefs');
  const root = index >= 0 ? args[index + 1] : path.join(os.homedir(), 'Projects/kentech-wt/_briefs');
  assert.ok(root, '--briefs 경로 필요');
  const o = measure(root); console.log(args.includes('--json') ? JSON.stringify(o, null, 2) : markdown(o));
}
module.exports = { measure, markdown, calendar };
