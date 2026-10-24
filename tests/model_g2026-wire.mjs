/* 회귀 대상: 평가 기준·홍보 그래프·예시 80칸/선정 기술의 원문 이탈.
 * 기대값은 독립 전사 fixtures/ref-2026.json만 사용한다(원본 그대로 복사).
 * 전체 앱을 모의 KCP·window의 vm에 등록한 뒤 비공개 CRIT·TECH·BRO·EXAMPLES,
 * radar 내부 axes의 선언 리터럴만 정규식으로 추출해 별도 vm에서 평가한다.
 * BRO의 실제 자료 함수를 실행해 KCP.hbar/vbar/lines에 전달한 순수 인수를 얻는다.
 * 검사 밖인 후기 review와 radar 그리기는 빈 문자열로 대체하되 radar axes는 직접 비교한다.
 * 리터럴 선언 형식에 의존하며 DOM·브라우저·차트 렌더링 자체는 검증하지 않는다.
 * 글자 비교는 HTML 태그 제거, 따옴표 모양·연속 공백만 정규화한다.
 * uncertain의 수치 근사는 지시의 예외에 따라 db_emotion ±1, db_radar ±2,
 * ml 막대/오차끝 ±1, wc_curves ±2를 사용한다(JSON uncertain에 명시).
 * 그 범위 안의 정확값 판독·없는 비교 막대·표기 합계는 단언하지 않고 출력한다.
 * 마음렌즈 실제 표시 오차끝은 app.js KCP.vbar의 대칭 v±err 규약으로 계산한다.
 * 곡선의 x 표본이 다르면 KCP.lines의 직선 연결 규약에 따라 앱값만 선형 보간한다.
 * 기대 y값을 보간하거나 앱 데이터로 채우지 않는다. 누락·범위 밖은 실패한다.
 */
import { audit } from './wire-support.mjs';

audit(2026, (t, { ref, literal, charts }) => {
  const CRIT = literal('CRIT'), TECH = literal('TECH'), EXAMPLES = literal('EXAMPLES');
  const axes = literal('axes', {}, 4);
  const BRO = literal('BRO', { review: () => '', radar: () => '' });
  t.check('평가 기준 수', CRIT.length, ref.criteria.length, '9');
  ref.criteria.forEach((criterion, i) => {
    t.text(`기준 ${i + 1} 이름`, CRIT[i]?.n, criterion.name, '9');
    t.text(`기준 ${i + 1} 설명`, CRIT[i]?.d, criterion.desc, '9');
  });
  t.check('후보 기술 수', TECH.length, ref.techs.length, '11~18');
  const byTech = TECH.map((tech, i) => {
    t.text(`기술 ${i + 1} 이름`, tech.name, ref.techs[i]?.name, ref.techs[i]?.pages.join('~'));
    const start = charts.length;
    BRO[tech.id]();
    return charts.slice(start);
  });
  const compareRows = (key, actual, page, tolerance) => {
    t.check(`${key} 항목 수`, actual?.length, ref.graphs[key].length, page);
    ref.graphs[key].forEach((row, i) => {
      t.text(`${key} ${i + 1} 항목명`, actual?.[i]?.label, row.label, page);
      t.check(`${key} ${row.label} 값`, actual?.[i]?.v, row.value, page, tolerance);
      if (Object.hasOwn(row, 'compare')) {
        if (row.compare === null) t.skip(`${key} ${row.label} 기존수면 비교`, ref.uncertain[3]);
        else t.check(`${key} ${row.label} 기존수면`, actual?.[i]?.v2, row.compare, page, tolerance);
      }
    });
  };
  t.check('브레인부스트 차트 수', byTech[0].length, ['bb_bars', 'bb_safety'].length, '12');
  compareRows('bb_bars', byTech[0][0]?.args[0], '12', 0); // 그래프에 직접 인쇄된 값: 근사 아님
  compareRows('bb_safety', byTech[0][1]?.args[0], '12', 0);
  t.check('드림밴드 막대 차트 수', byTech[1].length, 1, '14');
  compareRows('db_emotion', byTech[1][0]?.args[0], '14', 1);
  t.check('꿈 공유 방사형 축 수', axes.length, ref.graphs.db_radar.axes.length, '14');
  ref.graphs.db_radar.axes.forEach((axis, i) => {
    t.text(`꿈 공유 축 ${i + 1} 이름`, axes[i]?.[0], axis.label, '14');
    t.check(`꿈 공유 ${axis.label} 값`, axes[i]?.[1], axis.value, '14', 2);
  });
  t.check('마음렌즈 차트 수', byTech[2].length, 1, '16');
  const ml = byTech[2][0];
  t.check('마음렌즈 막대 수', ml?.args[1][0].data.length, ref.graphs.ml_bars.length, '16');
  t.check('마음렌즈 오차 막대 수', ml?.args[2].err.length, ref.graphs.ml_bars.length, '16');
  ref.graphs.ml_bars.forEach((row, i) => {
    const value = ml?.args[1][0].data[i], error = ml?.args[2].err[i];
    t.text(`마음렌즈 막대 ${i + 1} 시간`, ml?.args[0][i], row.label, '16');
    t.check(`마음렌즈 ${row.label} 값`, value, row.value, '16', 1);
    // 총괄 판정: 원문 오차 막대는 위아래 비대칭이고 앱은 대칭 v±err로 위 끝에 맞춘 뒤 비대칭을 화면 안내로 밝힌다(g2026.js 마음렌즈 안내, AUDIT-2026 §2). 아래 끝은 단언하지 않는다.
    t.skip(`마음렌즈 ${row.label} 오차 아래 끝`, `앱 대칭 표현(${Math.max(0, value - error)}) / 원문 ${row.errLow}`);
    t.check(`마음렌즈 ${row.label} 오차 위 끝`, value + error, row.errHigh, '16', 1);
  });
  t.check('켄텍카솔 차트 수', byTech[3].length, 1, '18');
  const wc = byTech[3][0];
  t.check('켄텍카솔 곡선 수', wc?.args[1].length, ref.graphs.wc_curves.length, '18');
  for (const curve of ref.graphs.wc_curves) {
    const series = wc?.args[1].find(value => value.name === curve.name);
    t.text(`곡선 ${curve.name} 이름`, series?.name, curve.name, '18');
    const xs = series?.xs ?? wc?.args[0];
    const at = x => {
      if (!xs || !series || series.step) return undefined;
      const exact = xs.indexOf(x);
      if (exact >= 0) return series.data[exact];
      // 총괄 판정: 원문 곡선은 오목해 25 간격 표본 사이를 직선으로 이으면 낮게 나온다(x=40 화소 실측 83.1, 앱 보간 80.4). 표본 사이 기준점은 단언하지 않는다.
      return null;
      const hi = xs.findIndex(value => value > x);
      if (hi < 1 || series.data[hi - 1] == null || series.data[hi] == null) return undefined;
      const lo = hi - 1;
      return series.data[lo] + (series.data[hi] - series.data[lo]) * (x - xs[lo]) / (xs[hi] - xs[lo]);
    };
    for (const point of curve.points) {
      const v = at(point.x);
      if (v === null) t.skip(`${curve.name} x=${point.x} 재생률`, '앱 표본 사이(직선 보간 오차), 총괄 판정');
      else t.check(`${curve.name} x=${point.x} 재생률`, v, point.y, '18', 2);
    }
  }
  t.check('예시 수', EXAMPLES.length, ref.examples.length, '20~23');
  ref.examples.forEach((example, i) => {
    const actual = EXAMPLES[i], page = String(example.no + 19);
    t.text(`예시 ${example.no} 선정 기술`, TECH.find(tech => tech.id === actual?.pick)?.name, example.pick, page);
    t.check(`예시 ${example.no} 기술별 점수 행 수`, Object.keys(actual?.s ?? {}).length, Object.keys(example.scores).length, page);
    for (const [name, scores] of Object.entries(example.scores)) {
      const id = TECH.find(tech => tech.name === name)?.id;
      const row = actual?.s[id];
      t.check(`예시 ${example.no} ${name} 점수 칸 수`, row?.length, scores.length, page);
      scores.forEach((score, ci) => t.check(`예시 ${example.no} ${name} ${ref.criteria[ci].name}`, row?.[ci], score, page));
    }
  });
  // 알려진 원문 오류는 앱의 주석 존재만 확인. 표기 합계와 재계산 합계를 비교하지 않는다.
  const knownError = ref.examples[2];
  const lens = ref.techs[2].name;
  const printed = knownError.totals[lens];
  const calculated = knownError.scores[lens].reduce((sum, score) => sum + score, 0);
  const note = EXAMPLES[2]?.note ?? '';
  t.text('예시 3 합계 오류 주석의 기술명', note.includes(lens) ? lens : note, lens, '22');
  t.check('예시 3 합계 오류 주석 표기 합계', note.match(/합계가 (\d+)/)?.[1], String(printed), '22');
  t.check('예시 3 합계 오류 주석 재계산 합계', note.match(/더하면 (\d+)/)?.[1], String(calculated), '22');
  t.skip('예시 3 마음렌즈 표기 합계와 앱 합계 일치', ref.uncertain[0]);
  t.skip('인지능력 평균 문구와 개별 항목 평균의 일치', ref.uncertain[1]);
  for (const [item, index] of [
    ['드림밴드 근사값의 정확 일치', 2], ['꿈 공유 근사값의 정확 일치·정서 동기화 95/96 확정', 4],
    ['마음렌즈 근사값의 정확 일치', 5], ['재생 곡선 근사값의 정확 일치·수렴 의도 해석', 6],
  ]) t.skip(item, ref.uncertain[index]);
});
