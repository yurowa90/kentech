/* 회귀 대상: 문제지·기사 원문 이탈, 그래프 데이터 누락/수치 변경.
 * 기대값은 독립 전사 fixtures/ref-2025.json만 사용한다(원본 그대로 복사).
 * 앱 전체를 모의 KCP·window의 vm에 올리고 공개 brief()로 문제지를 얻는다.
 * 비공개 P·IDS·PAPER 선언 리터럴만 정규식으로 떼어 별도 vm에서 평가한다.
 * PAPER의 실제 자료 함수를 실행하며 KCP.vbar는 그래프 인수만 포착한다.
 * 선언/HTML 구조에 의존하며 실제 DOM·레이아웃·차트 렌더링은 검사하지 않는다.
 * 글자 비교는 HTML 태그 제거, 따옴표 모양·연속 공백(양끝 포함)만 정규화한다.
 * 기사 사진 설명의 UI 접두 '사진: '만 분리하고, 원문 뒤 괄호 보충만 허용한다
 * (사용자 지시 AUDIT-2025 §2). 그 밖의 철자·문장부호 정규화는 하지 않는다.
 * uncertain의 띄어쓰기는 그 문단만 공백 무시 비교한다. 글자 판독은 기록된
 * 낱말 후보만 허용하고, 문단 경계는 명시된 한 곳만 붙여 비교한다.
 * 사진 설명은 모든 자료에서 원문 접두와 괄호 보충만 허용한다.
 * 그래프는 지시의 근사값 예외에 따라
 * JSON uncertain의 ±2를 사용한다. 축 없는 자료 2 상대 곡선은 단언하지 않는다.
 */
import { audit, blocks, textOf } from './wire-support.mjs';

audit(2025, (t, { ref, game, literal, charts }) => {
  const brief = game.brief();
  const paras = blocks(brief, 'p');
  t.check('문제지 배경 문단 수', paras.slice(1, -1).length, ref.sheet.background.length, '9');
  ref.sheet.background.forEach((value, i) => t.text(`문제지 배경 ${i + 1}`, paras[i + 1], value, '9'));
  t.text('문제지 과제', paras.at(-1), ref.sheet.task, '9');
  const items = [...brief.matchAll(/<li\b[^>]*>([\s\S]*?)(?=<ul\b|<\/li>)/g)].map(match => match[1]);
  t.check('문제지 조건·원칙·주석 항목 수', items.length,
    ref.sheet.conditions.length + ref.sheet.principles.length + 1, '9');
  ref.sheet.conditions.forEach((value, i) => t.text(`문제지 조건 ${i + 1}`, items[i], value, '9'));
  ref.sheet.principles.forEach((value, i) => t.text(`문제지 원칙 ${i + 1}`, items[ref.sheet.conditions.length + i], value, '9'));
  t.text('문제지 주석 전체', items.at(-1), ref.sheet.footnote, '9', {
    ignoreWhitespace: true, reason: ref.uncertain[13],
  });

  const P = literal('P'), IDS = literal('IDS'), PAPER = literal('PAPER');
  t.check('신문 수', Object.keys(PAPER).length, ref.papers.length, '10~13');
  // 키는 앱의 자료 2~5 순서, 기대 기사와 기호는 fixture에서만 가져온다.
  const spacedParagraphs = new Map([
    ['2/1/0', [5]], ['2/1/1', [4]],
    ['3/0/0', [1, 2]], ['3/0/2', [3]], ['3/0/3', [3]],
    ['4/0/1', [6]], ['4/1/0', [8]], ['4/1/1', [8]],
  ]);
  const reason = indices => indices.map(i => ref.uncertain[i]).join(' / ');
  const quoted = note => [...note.matchAll(/["']([^"']+)["']/g)].map(match => match[1]);
  // '아늑'은 글자 설명이고, '아늑해진'/'아득해진'만 같은 자리의 낱말 후보다.
  const words = quoted(ref.uncertain[1]);
  const wordCandidates = words.filter(word => word.length === words[0].length);
  const joinBoundary = quoted(ref.uncertain[4]);
  let articleCount = 0;
  ref.papers.forEach((paper, paperIndex) => {
    const id = IDS[paperIndex], page = String(paper.material + 8);
    t.text(`자료 ${paper.material} 식별 기호`, P[id]?.sym, paper.symbol, page);
    const start = charts.length;
    const html = PAPER[id]();
    charts.slice(start).forEach(chart => { chart.material = paper.material; });
    const articles = blocks(html, 'article');
    articleCount += articles.length;
    t.check(`자료 ${paper.material} 기사 수`, articles.length, paper.articles.length, page);
    paper.articles.forEach((article, ai) => {
      const actual = articles[ai] ?? '';
      const label = `자료 ${paper.material} 기사 ${ai + 1}`;
      t.text(`${label} 제목`, blocks(actual, 'h4')[0], article.title, page);
      // 차트 근사 안내는 앱 보충문이다. 본문 <p>와 class=hint를 구분한다.
      const paragraphs = blocks(actual, 'p', '(?![^>]*\\bclass="hint")[^>]*');
      // uncertain에 적힌 '만들어 왔다. / 그런데,' 경계 한 곳의 분리만 허용한다.
      if (paper.material === 2 && ai === 1 && paragraphs.length === article.paragraphs.length + 1 &&
          textOf(paragraphs[1]).endsWith(joinBoundary[0].replace(/^…/, '')) &&
          textOf(paragraphs[2]).startsWith(joinBoundary[1])) {
        paragraphs.splice(1, 2, `${paragraphs[1]} ${paragraphs[2]}`);
      }
      t.check(`${label} 본문 문단 수(불확실 경계 붙임 후)`, paragraphs.length, article.paragraphs.length, page);
      article.paragraphs.forEach((value, pi) => {
        const key = `${paper.material}/${ai}/${pi}`;
        const uncertain = spacedParagraphs.get(key);
        t.text(`${label} 문단 ${pi + 1}`, paragraphs[pi], value, page, {
          ignoreWhitespace: Boolean(uncertain),
          variants: key === '3/0/0' ? [wordCandidates] : [],
          reason: uncertain ? reason(uncertain) : ref.uncertain[0],
        });
      });
      // uncertain은 전자우편 도메인의 마지막 마침표/쉼표 한 자리만 의심한다.
      const domainEnd = article.byline.match(/\.[^.)]+\)$/)?.[0];
      t.text(`${label} 기자`, blocks(actual, 'div', '[^>]*class="by"[^>]*')[0], article.byline, page, {
        variants: paper.material === 2 && ai === 0 ? [[domainEnd, domainEnd.replace('.', ',')]] : [],
        reason: ref.uncertain[10],
      });
      const captions = blocks(actual, 'div', '[^>]*class="cap"[^>]*');
      if (article.caption === null) t.check(`${label} 사진 설명 없음`, captions.length, 0, page);
      else {
        t.check(`${label} 사진 설명 수`, captions.length, 1, page);
        const caption = textOf(captions[0]).replace(/^사진: /, '');
        t.text(`${label} 사진 설명(괄호 보충 허용)`, caption, article.caption, page, {
          parentheticalSuffix: true,
          reason: 'AUDIT-2025 §2: 원문 접두 전체 일치, 뒤의 괄호 보충만 허용. ' + ref.uncertain[9],
        });
      }
    });
  });
  t.check('기사 총수', articleCount, ref.papers.reduce((sum, p) => sum + p.articles.length, 0), '10~13');
  const graphSeries = charts.filter(c => c.kind === 'vbar').flatMap(chart => chart.args[1].map(series => ({ chart, series })));
  t.check('자료 3 그래프 시리즈 수', graphSeries.length, ref.graphs.filter(g => g.paper === 3).length, '11');
  for (const graph of ref.graphs) {
    if (graph.paper === 2) { t.skip('자료 2 축 없는 상대 곡선', ref.uncertain[11]); continue; }
    const found = graphSeries.find(({ chart, series }) => chart.material === graph.paper &&
      (series.name === graph.series || series.name === '만족도(%)' && graph.series === '만족도(초록 막대)'));
    t.check(`${graph.series} 값 개수`, found?.series.data.length, graph.values.length, '11');
    graph.values.forEach((point, i) => {
      t.text(`${graph.series} 가로축 ${i}`, found?.chart.args[0][i], point.label, '11');
      if (graph.series === '로봇' && point.label === '0') t.skip('로봇 0년 막대 수치 확정', ref.uncertain[12]);
      else t.check(`${graph.series} ${point.label}년 값`, found?.series.data[i], point.value, '11', 2);
    });
  }
});
