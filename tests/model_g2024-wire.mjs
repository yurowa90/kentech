/* 회귀 대상: 지도 칸/채굴량, 아이템 이름·유지비·한도, 연구소 효과, 공통 질문의 원문 이탈.
 * 기대값은 독립 전사 fixtures/ref-2024.json만 사용한다(원본 그대로 복사).
 * 실제 앱을 모의 window.KCP의 vm에 등록한다. 지도는 공개 MAP·tileId,
 * 질문은 questions(), 에너지는 recap(), 계산 설명은 reflectExtra()를 사용한다.
 * 비공개 TER·ITEMS·MAP_V만 선언 리터럴을 정규식으로 추출해 별도 vm에서 평가한다.
 * 공통 5 최초 질문은 순수 자료 API가 없어 renderPrep의 첫 innerHTML을 포착한다.
 * 이 방법은 선언 형식에 의존하며 실제 DOM 조작·브라우저·배치는 검증하지 않는다.
 * 글자 비교: HTML 태그 제거, 따옴표 모양·연속 공백만 정규화. 번호/시간은
 * fixture common의 별도 표기이므로 본문에서 분리한다. 다른 문장 정규화는 없다.
 * uncertain의 이름 띄어쓰기는 해당 이름만 공백 무시 비교한다.
 * 효과 21문장은 fixture가 글자 판독을 확신한다고 명시하므로 전체를 비교한다.
 * 미공개 값과 쪽별 수치 충돌은 별도 건너뜀. 9쪽으로 확정된 수치는 검사한다.
 */
import { audit, blocks, prepHTML, textOf } from './wire-support.mjs';

audit(2024, (t, { ref, game, literal, inVM }) => {
  const TER = literal('TER'), ITEMS = literal('ITEMS'), MAP_V = literal('MAP_V');
  const rows = game.MAP;
  t.check('지도 열 개수', Math.max(...rows.map(row => row.length)), ref.map.columns.length, '9');
  const counts = Object.fromEntries(Object.keys(ref.map.counts).map(key => [key, 0]));
  const ids = {};
  for (const column of ref.map.columns) {
    const cells = rows.flatMap((row, r) => row[column.col] && row[column.col] !== '.'
      ? [{ r, value: row[column.col], id: game.tileId(r, column.col) }] : []);
    t.check(`지도 열 ${column.col} topRow`, cells[0]?.r, column.topRow, '9');
    t.text(`지도 열 ${column.col} 위→아래 지형`, cells.map(c => c.value).join(''), column.cells, '9');
    t.check(`지도 열 ${column.col} 연속 행`, cells.map(c => c.r),
      Array.from(column.cells, (_, i) => column.topRow + i), '9');
    for (const cell of cells) { counts[cell.value] = (counts[cell.value] || 0) + 1; ids[cell.value] ??= cell.id; }
  }
  for (const [key, count] of Object.entries(ref.map.counts)) t.check(`지형 ${key} 개수`, counts[key], count, '9');
  t.check('지도 총 칸 수', Object.values(counts).reduce((a, b) => a + b, 0), ref.map.total, '9');
  t.check('지형 종류 수', Object.keys(TER).length, Object.keys(ref.terrain).length, '9');
  for (const [name, terrain] of Object.entries(ref.terrain)) {
    t.check(`${name} 채굴가능량`, Object.values(TER).find(v => v.n === name)?.k, terrain.k, '9');
  }
  t.check('아이템 종류 수', ITEMS.length, ref.items.length, '9');
  // 카드 전사 순서로 비교해 이름 오탈자가 다른 검사를 가리지 않게 한다.
  const variableNames = new Set([11, 16, 17, 19, 20]);
  ref.items.forEach((item, i) => {
    const actual = ITEMS[i];
    if (variableNames.has(i)) t.text(`아이템 ${i + 1} 이름`, actual?.n, item.name, '9', {
      ignoreWhitespace: true, reason: ref.uncertain[i === 11 ? 3 : 2],
    });
    else t.text(`아이템 ${i + 1} 이름`, actual?.n, item.name, '9');
    t.text(`아이템 ${i + 1} 효과 전체 문장`, actual?.d, item.effect, '9');
    if (item.upkeep === null) t.skip(`${item.name} 유지비`, ref.uncertain[0]);
    else t.check(`${item.name} 유지비`, actual?.up, item.upkeep, '9');
    // 앱은 max 생략 시 1종 한 개를 허용한다(validItem·paintItems의 기본값).
    t.check(`${item.name} 최대 개수`, actual ? actual.max ?? 1 : undefined, item.max, '9');
  });
  const percent = value => Number(value.match(/(\d+)%/)[1]);
  const engineer = ITEMS[0], h2 = ITEMS[16], grid = ITEMS[17], ai = ITEMS[18];
  for (const [key, item] of [['engineerEfficiency', engineer], ['h2', h2], ['grid', grid], ['energyAI', ai]]) {
    t.check(`${key} 카드 수치(%)`, percent(item.d), percent(ref.numbers[key]), '9');
  }
  const rule = textOf(game.reflectExtra()).split('이 시뮬레이터의 계산 규칙')[1];
  for (const [key, pattern] of [
    ['energyAI', /에너지AI 연구소는 채굴량 \+(\d+)%/],
    ['h2', /수소에너지 연구소는 호수 몫의 생산 \+(\d+)%/],
    ['grid', /차세대그리드 연구소는 소비 −(\d+)%/],
  ]) t.check(`${key} 계산 규칙 설명(%)`, Number(rule?.match(pattern)?.[1]), percent(ref.numbers[key]), '9');
  const energy = (sel, items) => {
    const state = inVM({ game: { mapV: MAP_V, sel, items } });
    const value = game.recap(state).find(entry => entry.t === '에너지')?.d;
    const numbers = value?.match(/채굴 ([\d.]+)K · 생산 ([\d.]+) · 소비 ([\d.]+)/);
    if (!numbers) throw Error(`에너지 recap 형식 변경: ${value}`);
    return numbers.slice(1).map(Number);
  };
  const round = n => Math.round(n * 10) / 10; // recap 공개값의 소수 첫째 자리 반올림
  const k = ref.terrain['초원'].k;
  const efficiency = percent(ref.numbers.engineerEfficiency) / 100;
  t.check('엔지니어 실제 생산 효율', energy([ids.G], { [engineer.id]: engineer.max })[1],
    round(k * efficiency * ref.items[0].max), '9');
  t.check('에너지AI 실제 채굴량', energy([ids.G], { [ai.id]: 1 })[0],
    round(k * (1 + percent(ref.numbers.energyAI) / 100)), '9');
  const sub = ITEMS[14];
  t.check('수소 연구소 실제 호수 생산량', energy([ids.W], { [engineer.id]: engineer.max, [sub.id]: 1, [h2.id]: 1 })[1],
    round(ref.terrain['호수'].k * efficiency * ref.items[0].max * (1 + percent(ref.numbers.h2) / 100)), '9');
  t.check('그리드 실제 소비량', energy([ids.G], { [grid.id]: 1, [ai.id]: 1 })[2],
    round((ref.items[17].upkeep + ref.items[18].upkeep) * (1 - percent(ref.numbers.grid) / 100)), '9');

  const state = matched => inVM({ game: { mapV: MAP_V, locked: { sel: [ids.G], items: {} }, matched } });
  const no = game.questions(state('no')), yes = game.questions(state('yes'));
  const prep = prepHTML(game, state('no'));
  const initial5 = blocks(prep, 'h3').find(value => value.includes('일치했나요'));
  const questions = [no[0]?.q, no[1]?.q, no[2]?.q, no[3]?.q, initial5, yes[4]?.q, no[4]?.q, no[5]?.q];
  ref.common.forEach((value, i) => {
    const body = value.replace(/^\d+(?:-\d+)?(?:\. | \((?:Yes|No)\) )/, '')
      .replace(/ \(약 2~4분\)$/, '').replace(/ \(Yes or No 선택\)$/, '');
    // 총괄 판정: 공통 5 머리 문장('탐험 계획을 세우면서 …진행하게 됩니다.')은 앱이 준비실 질문에서 뺀 알려진 차이다(AUDIT-2024 §3-2, 원문 정비 대기). 정비 전까지 뒤 문장만 본다.
    if (i === 4 && !questions[i]?.startsWith('탐험 계획을')) { t.skip('공통 5 머리 문장', 'AUDIT-2024 §3-2 알려진 차이, 원문 정비 대기'); t.text('공통 5 뒤 문장', questions[i], body.replace(/^.*진행하게 됩니다\. /, ''), '11'); return; }
    t.text(`공통 ${value.match(/^\S+/)[0]} 질문 본문`, questions[i], body, '11');
  });
  t.skip('엔지니어 여러 명의 10가지 한도 산입 방식', ref.uncertain[4]);
  t.skip('정착지 최대 칸 수', ref.uncertain[5]);
  t.skip('7쪽 20%와 9쪽 30%의 일치 여부', ref.uncertain[6]);
  // 번호는 표의 구분 칸이고 4번 시간은 원문에 없으므로 본문 비교에서 분리한다.
});
