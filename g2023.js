/* 2023학년도: 가람국 10년 실행 계획 */
(function () {
  const KCP = window.KCP;
  const esc = KCP.esc;

  // [id, 이름, 과학, 행복, 환경, 보이는 설명, 유실된 부분(보고서 참고사항에서 공개된 것만)]
  const RAW = [
    ["1A", "과학의 태동", 1, 0, 0, "국가의 기초과학에 투자를 늘린다. 국민들의 과학 역량이 증가한다."],
    ["1B", "최저 임금제", 0, 1, 0, "최저 임금제를 도입함으로써, 노동자들은 최소한의 수입을 보장 받는다."],
    ["1C", "분리수거", 0, 0, 1, "쓰레기 분리수거를 엄격히 시행한다. 음식물 쓰레기는 재활용하여 가축의 사료로 사용된다."],
    ["2A", "이론의 발견", 3, 0, -1, "산림을 개간하여 대규모 부지에 학교와 연구소를 신설한다. 국민들의 과학 지식수준이 높아지며, 훌륭한 연구성과들이 쏟아져 나온다."],
    ["2B", "과학 수준의 향상", 2, 0, 0, "과학과 공학 교육이 확대된다. 국민들은 다양한 문화시설에서 과학을 쉽게 접하고 익숙해진다."],
    ["2C", "배움의 즐거움", 1, 1, 0, "학생들은 실습과 실험이 함께 하는 과학 수업으로 즐거운 학교 생활을 한다. 교사들도 수업 준비에 심혈을 기울인다."],
    ["2D", "대형 쇼핑몰", 0, 3, -1, "녹지에 첨단 쇼핑몰을 건설한다. 대형 몰에서 편리한 쇼핑을 즐길 수 있으며, 해외 관광객도 쇼핑몰에 몰려든다."],
    ["2E", "로봇 대체 근무", 0, 2, 0, "자신이 원하는 시간에 로봇이 대신 근무를 한다. 부모의 여가시간이 늘어나 아이들과 더 많은 시간을 보내며 행복해한다. 일부 회사는 업무에 차질이 생겨 경쟁력 저하를 우려한다."],
    ["2F", "역사 체험의 날", 0, 1, 1, "위인들을 기리고 역사적인 건축물과 환경을 보존하는 행사를 개최한다. 국민들의 공동체 의식이 향상되고 생태 의식이 높아진다."],
    ["2G", "재활용 기술 개발", 1, 0, 1, "플라스틱을 생분해하는 기술을 개발하여, 환경 보존의 기반을 마련한다."],
    ["2H", "나무 심기의 날", 0, 0, 2, "자연환경 조성을 위해 벌거숭이 산에 대대적인 나무 심기를 진행한다. 도시에서 안 보이던 동물들이 돌아오고 공기가 더 상쾌해진다."],
    ["2I", "개발 제한", -1, 0, 3, "생태계를 위해 더 이상 자연을 훼손하지 않고 새로운 시설은 기존에 개발된 땅만 사용한다. 단, 외국의 국내 투자가 줄어들 수 있다."],
    ["3A", "생산 기술 발전", 4, 0, -1, "온라인 맞춤형 제품을 생산하는 3D 프린터를 개발한다. 국민들의 소득이 늘어나지만,", "3D 프린터의 원료가 가열되어 사용될 때, 발암 물질이 발생할 수 있다."],
    ["3B", "혁신 연구소", 3, 0, 0, "", "혁신 연구소를 건설한다. 다른 나라의 인재들도 공동 연구를 위해 찾아온다. 다양한 생각이 공존하고 존중되어 훌륭한 연구 성과가 나올 확률이 높아진다. 동시에 국가의 위상도 함께 높아진다."],
    ["3C", "엄격한 폐기물 관리", 1, 1, 1, "산업 폐기물을 정화하는 기술을 개발하여 자연을 훼손하는 폐기물을 줄인다. 일부는 불편해진 생산 공정에 불만이 있지만 안전과 환경이 더 중요하다."],
    ["3D", "의료 혜택 확대", 0, 3, 0, "병원에서 저렴하게 치료받을 수 있는 항목이 늘어난다.", "특히 소득이 높지 않은 사람은 희소병 치료나 비용이 많이 드는 수술을 저렴하게 받을 수 있어 행복하다."],
    ["3E", "황무지 개척", 1, 4, -2, "최첨단 간척 기술을 이용하여 행성의 갯벌을 간척하여 농사를 시작한다. 저렴하게 대량의 식량을 공급할 수 있어서 사람들의 먹거리가 풍부해진다.", "해당 지역에 살던 동식물들이 서식지를 잃어버린다."],
    ["3F", "더 많은 운동장", 0, 4, -1, "종합운동장을 도시마다 건설한다. 공용 운동장에서 가족, 동호회, 지자체의 다양한 행사가 진행되고, 사람들이 운동을 통해 스트레스를 해소한다. 하지만,", "많은 운동장 건설은 자연을 훼손시킨다."],
    ["3G", "1급수", 0, 1, 2, "", "하천 정비 사업을 통해 강물을 맑게 복원한다. 대규모 예산이 투입될 예정이며, 맑아진 하천을 구경하기 위해 많은 관광객이 모일 것으로 예상한다."],
    ["3H", "생태 복원 프로젝트", 0, 0, 3, "", "식물 채집과 동물 사냥을 규제하고, 생물 다양성 증가를 위한 정책을 시행한다. 출입을 제한하는 산림이 지정되고, 해상 운송과 어업이 금지되는 해역을 설정하여 생태계 청정지대를 구축한다."],
    ["3I", "초록 기금", 2, -2, 3, "친환경 기술개발을 위한 연구 기금을 추가 세금으로 확보한다. 개발된 환경 기술을 통해 사람들은 깨끗하고 쾌적한 환경에서 지속해서 살 수 있다."],
    ["4A", "천재 과학자", 6, -1, -1, "적극적인 과학기술 분야 투자로 세계적인 과학자들이 등장한다. 과학 강국은 물론, 첨단무기로 무장한 군사 대국도 곧 실현된다.", "그중 일부는 선악의 개념이 불명확해, 환경오염, 인류 말살을 초래할 수 있는 무기를 만들지도 모른다. 또한, 일부는 평범한 사람들을 이해하지 못하거나 무시한다."],
    ["4B", "직접 운전 금지", 3, 1, 0, "기술 개발로 자율주행 자동차의 사고율이 인간의 직접 운전 사고율보다 낮아진다. 사람들은 특별한 경우를 제외하고 직접 운전할 수 없다는 법안이 통과된다."],
    ["4C", "초고속 여객기", 3, 3, -2, "기존 여객기보다 5배 빠른 여객기가 등장한다. 전 세계 모든 나라들이 일일 생활권 시대가 된다. 전 세계 사람들의 교류가 급속히 늘어난다.", "초고속 여객기 제조 과정에 희귀광물이 매우 필요하여, 이에 많은 산림을 훼손해야 한다. 물론, 항공료 또한 매우 비싸다."],
    ["4D", "행복도시", 2, 5, -3, "모든 주거지역을 쾌적한 환경으로 일제히 재개발을 실시한다. 국민들은 교통지옥에서 벗어나, 통근 시간도 대폭 줄어든다. 무인 드론이 야식 배달도 대행한다. 하지만,", "국가 규모의 재건축 과정 동안 많은 자원을 소모하고 기존의 자연환경을 훼손할 수 있다."],
    ["4E", "온실 가스 감축", -2, 3, 3, "온실가스를 배출하는 에너지 생산 시설을 축소하고, 행성의 온난화를 늦춰 기후 변화를 억제한다.", "이 시설들이 위치한 공단지역을 공원으로 변경시키는 등의 정책을 펼칠 수 있다."],
    ["4F", "자동차 격일제", 0, -3, 7, "일주일에 자동차를 3일간 사용 못 한다. 배기가스가 줄어 대기질이 크게 향상된다. 하지만,", "일주일에 절반은 자동차를 이용할 수 없게 되어 국민들은 매우 불편해한다."],
    ["4G", "프로슈머", 0, 2, 2, "자신의 집에 신재생 에너지 발전시설을 구축하여 에너지를 생산하고 소비한다. 남은 에너지는 이웃에게 판매해 소득을 올리기도 한다. 잔여 에너지 판매만으로 경제 활동이 가능하기도 하다."],
  ];
  const IT = {};
  RAW.forEach(([id, n, s, h, e, d, lost]) => (IT[id] = { id, n, v: [s, h, e], d, lost }));
  const NEXT = {
    "1A": ["2A", "2B", "2C"], "1B": ["2D", "2E", "2F"], "1C": ["2G", "2H", "2I"],
    "2A": ["3A", "3B"], "2B": ["3B", "3C"], "2C": ["3C", "3D"], "2D": ["3D", "3E"], "2E": ["3D", "3E"],
    "2F": ["3F", "3G"], "2G": ["3F", "3G"], "2H": ["3H", "3I"], "2I": ["3H", "3I"],
    "3A": ["4A", "4B"], "3B": ["4A", "4B"], "3C": ["4B", "4C"], "3D": ["4C", "4D"], "3E": ["4D", "4E"],
    "3F": ["4D", "4E"], "3G": ["4E", "4F"], "3H": ["4F", "4G"], "3I": ["4F", "4G"],
  };
  const PREV = {};
  Object.entries(NEXT).forEach(([a, bs]) => bs.forEach((b) => (PREV[b] = (PREV[b] || []).concat(a))));
  const COLS = [["1A", "1B", "1C"], ["2A", "2B", "2C", "2D", "2E", "2F", "2G", "2H", "2I"], ["3A", "3B", "3C", "3D", "3E", "3F", "3G", "3H", "3I"], ["4A", "4B", "4C", "4D", "4E", "4F", "4G"]];
  const NAMES = ["과학", "행복", "환경"];
  const CLS = ["idx-sci", "idx-hap", "idx-env"];
  const NARAM = ["1A", "2C", "2B", "3B", "1B", "2F", "2A", "2E", "3F", "3C"];
  const DARAM = ["1C", "1B", "1A", "2F", "2H", "2C", "3G", "3H", "3C", "3F"];

  const available = (id, plan) => !plan.includes(id) && (id[0] === "1" || (PREV[id] || []).some((p) => plan.includes(p)));

  function compute(plan, expo) {
    const cum = [0, 0, 0];
    const rows = [];
    let epi = null, fair = null;
    plan.forEach((id, i) => {
      const d = IT[id].v.slice();
      const ev = [];
      if (i === 3 && epi) { d[1] -= 1; ev.push("전염병 −1"); }
      if (i === 6 && fair) { d[1] += 2; ev.push("박람회 +2"); }
      cum[0] += d[0]; cum[1] += d[1]; cum[2] += d[2];
      rows.push({ id, d, cum: cum.slice(), ev });
      if (i === 2) epi = cum[0] <= 0 || cum[2] <= 0;
      if (i === 5 && expo) fair = cum[0] >= 5 && cum[2] >= 3;
    });
    return { rows, epi, fair };
  }
  const NB = { 나람국: compute(NARAM, false), 다람국: compute(DARAM, false) };
  const gapLevel = (mine, other) => { const gp = other - mine; return gp >= 5 ? "bad" : gp >= 3 ? "warn" : ""; };

  function g(state) {
    state.game = Object.assign({ plan: [], peek: "1A", tab: "path", q1: "", q2: "" }, state.game || {});
    return state.game;
  }

  function planTable(name, res, plan, compareTo) {
    const head = `<tr><th>연차</th>${Array.from({ length: 10 }, (_, i) => `<th>${i + 1}</th>`).join("")}</tr>
      <tr><th>항목</th>${Array.from({ length: 10 }, (_, i) => `<th>${plan[i] || ""}</th>`).join("")}</tr>`;
    const body = NAMES.map((n, k) => `<tr><th class="${CLS[k]}">${n}<br><span class="small">누적</span></th>${Array.from({ length: 10 }, (_, i) => {
      const r = res.rows[i];
      if (!r) return "<td></td>";
      let lv = "";
      if (compareTo) {
        const levels = Object.values(compareTo).map((nb) => gapLevel(r.cum[k], nb.rows[i].cum[k]));
        lv = levels.includes("bad") ? "lvl-bad" : levels.includes("warn") ? "lvl-warn" : "";
      }
      return `<td class="${lv}">${r.d[k] >= 0 ? "+" : ""}${r.d[k]}<br><b>${r.cum[k]}</b>${k === 1 && r.ev.length ? `<br><span class="small">${r.ev.join(",")}</span>` : ""}</td>`;
    }).join("")}</tr>`).join("");
    return `<div class="table-wrap"><table class="plan" aria-label="${esc(name)} 10년 실행 계획">${head}${body}</table></div>`;
  }

  function trio(mine) {
    const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const ser = (res) => [0].concat(res.rows.map((r) => r.cum));
    return NAMES.map((n, k) => {
      const s = [
        { name: "나람국", color: "var(--ink-3)", dash: true, step: true, data: ser(NB.나람국).map((c) => (c === 0 ? 0 : c[k])) },
        { name: "다람국", color: "var(--volt)", dash: true, step: true, data: ser(NB.다람국).map((c) => (c === 0 ? 0 : c[k])) },
      ];
      if (mine) s.push({ name: "가람국(나)", color: ["var(--sci)", "var(--hap)", "var(--env)"][k], step: true, width: 3, data: ser(mine).map((c) => (c === 0 ? 0 : c[k])) });
      return `<div><b class="small ${CLS[k]}">${n} 지수 누적</b>${KCP.lines(xs, s, { w: 300, h: 170, min: -5, max: 15, ticks: [-5, 0, 5, 10, 15], xticks: [0, 5, 10], xlabel: "연차", aria: `${n} 지수 비교` })}</div>`;
    }).join("");
  }

  KCP.games["2023"] = {
    brief() {
      return `<div class="scenario">
          <p class="label">문제 상황</p>
          <p>KENTECH 행성에는 서로 경쟁 관계에 있는 가람, 나람, 다람 3개의 국가가 존재한다. 각 국가는 나라를 발전시키기 위해 과학, 행복, 환경의 측면에서 10년간의 [실행 계획]을 수립하고 있다. [실행 계획]을 수립하기 위한 [요건]과 [정보]는 아래와 같다.</p>
          <ul class="rules">
            <li>[요건] 실행 항목 경로에서 10년간 매년 한 가지의 [실행 항목]을 중복 없이 선택하여 [실행 계획]을 완성해야 한다. 각 [실행 항목]은 한 번만 선택할 수 있고, 그 해 처음부터 바로 효과가 누적하여 적용된다.</li>
            <li>[정보] [실행 항목]의 효과는 [과학], [행복], [환경] 지수로 평가되며 지수별 연관 요소에 영향을 준다.</li>
            <li>[정보] [과학], [행복], [환경] 지수 중 하나라도 같은 해 이웃 국가의 해당 지수보다 3 이상 낮으면 경계 수준, 5 이상 낮으면 위험 수준으로 평가된다.</li>
            <li>[전염병 확산] 오염된 강물에서 시작된 전염병이 유행할 것이다. 전염 속도가 빠른 편이기 때문에, 가람국으로 곧 상륙할 것이다. 가람국 하천의 수질 점검이 필요하다. 3년 차에 누적 [과학] 지수와 [환경] 지수 중 하나라도 0 이하이면 4년 차에 [행복] 지수가 1 하락한다.</li>
            <li>[세계 박람회 유치] 가람국이 세계 박람회를 개최한다. 전 세계 국가에서 가람국의 과학기술과 아름다운 자연환경을 보기 위해 방문한다. 6년 차에 누적 [과학] 지수 5, 누적 [환경] 지수 3 이상이면 7년 차에 [행복] 지수가 2 상승한다.</li>
            <li>논리적인 설명이 가능하다면, 본인의 답변을 위한 합리적인 가정과 추론을 적용하는 것은 가능하다. 문제에서 묘사하는 내용은 실제 현실을 반영하지 않으며 KENTECH의 공식입장이 아님.</li>
          </ul>
        </div>
        <div class="task"><b>문제</b><ol>
          <li>이웃 국가의 10년간의 실행 계획에 나타난 나람국과 다람국이 세운 [실행 계획]의 차이점을 바탕으로 두 국가 사이에 발생할 수 있는 현상에 대해 간략하게 설명하시오.</li>
          <li>가람국 지도자로서 위에 제시된 [요건]과 [정보]를 고려하고 이웃 국가의 10년간의 실행 계획을 참고하여 가람국의 10년간의 실행 계획을 작성하고 설명하시오.</li></ol></div>`;
    },

    renderPrep(root, state, save, next) {
      const G = g(state);
      root.innerHTML = `
        <div class="stack">
          <section class="panel">
            <div class="tabs" role="tablist">
              <button role="tab" data-tab="path">자료 2 · 실행 항목 경로</button>
              <button role="tab" data-tab="wheel">자료 3 · 지수별 연관 요소</button>
              <button role="tab" data-tab="nb">자료 4 · 이웃 국가 계획</button>
            </div>
            <div id="mat"></div>
          </section>
          <div class="desk">
            <div class="stack">
              <section class="panel">
                <h3>자료 5 · 가람국의 10년간 실행 계획 <span class="chip num" id="yr"></span><span class="spacer"></span>
                  <button class="btn small" id="undo">마지막 해 취소</button><button class="btn small ghost" id="clear">처음부터</button></h3>
                <div id="mine"></div>
                <div class="row" id="events" style="margin-top:10px"></div>
              </section>
              <section class="panel"><h3>이웃과 지수 비교</h3><div class="bro-grid" id="trio"></div>
                <p class="hint">표의 노란 칸은 이웃보다 3 이상 낮은 경계 수준, 붉은 칸은 5 이상 낮은 위험 수준입니다.</p></section>
            </div>
            <div class="stack">
              <section class="panel"><h3>문제 1 · 나람국과 다람국 사이에 생길 현상</h3>
                <textarea class="note" id="q1-23" style="min-height:120px" placeholder="두 나라의 전략 차이 → 지수 격차가 벌어지는 시점 → 연관 요소(국방력, 관광, 친환경 농수산물 등)로 생길 현상">${esc(G.q1)}</textarea></section>
              <section class="panel"><h3>문제 2 · 가람국 계획 설명</h3>
                <textarea class="note" id="q2-23" style="min-height:140px" placeholder="지도자로서 가장 중요하게 본 가치, 시점을 고려한 선택, 경계·위험을 피하거나 감수한 이유">${esc(G.q2)}</textarea></section>
              ${KCP.memoPanel(state, save, "memo23")}
              <div class="row"><span class="spacer"></span><button class="btn primary" id="go23">면접실로 이동</button></div>
            </div>
          </div>
        </div>`;

      const mat = KCP.$("#mat", root);
      const paintMat = () => {
        KCP.$$("[data-tab]", root).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === G.tab)));
        if (G.tab === "path") {
          const pk = IT[G.peek];
          mat.innerHTML = `<p class="small muted" style="margin-bottom:8px">1A·1B·1C는 선행 항목이 필요 없습니다. 그 밖의 항목은 화살표로 이어진 앞 단계 항목 중 하나를 완료해야 고를 수 있습니다. 테두리가 굵은 항목이 지금 고를 수 있는 항목입니다. 흐릿한 설명은 보고서 자료에서 일부 정보가 유실된 부분입니다.</p>
            <div class="table-wrap"><div class="pathgrid">${COLS.map((col) => `<div class="pathcol">${col.map((id) => {
              const it = IT[id];
              const done = G.plan.includes(id);
              const av = available(id, G.plan) && G.plan.length < 10;
              return `<button class="node ${done ? "done" : av ? "avail" : "lock"} ${G.peek === id ? "peek" : ""}" data-node="${id}" aria-disabled="${!av && !done}">
                <span class="top"><span>${id} ${esc(it.n)}</span></span>
                <span class="v"><span class="${done ? "" : CLS[0]}">과${it.v[0]}</span> <span class="${done ? "" : CLS[1]}">행${it.v[1]}</span> <span class="${done ? "" : CLS[2]}">환${it.v[2]}</span></span>
                ${id[0] !== "1" ? `<span class="small" style="opacity:.8">← ${PREV[id].join("·")}</span>` : ""}
              </button>`;
            }).join("")}</div>`).join("")}</div></div>
            <div class="event" style="margin-top:10px"><b>${pk.id} ${esc(pk.n)}</b> <span class="num small">(${pk.v.join(", ")})</span><br>
              <span class="small">${esc(pk.d)} ${pk.lost ? `<span class="lost" aria-hidden="true">${esc(pk.lost)}</span><span class="hint">(유실)</span>` : ""}</span>
              ${pk.id[0] !== "4" ? `<br><span class="hint">다음 단계: ${NEXT[pk.id].join(", ")}</span>` : ""}</div>`;
          KCP.$$("[data-node]", mat).forEach((b) =>
            (b.onclick = () => {
              const id = b.dataset.node;
              G.peek = id;
              if (available(id, G.plan) && G.plan.length < 10) G.plan.push(id);
              else if (G.plan.includes(id)) KCP.toast(`${id}는 이미 ${G.plan.indexOf(id) + 1}년 차에 선택했습니다`);
              else if (G.plan.length >= 10) KCP.toast("10년 계획이 완성되었습니다");
              else KCP.toast(`${id}를 고르려면 먼저 ${PREV[id].join(" 또는 ")}를 완료해야 합니다`);
              save(); paintMat(); paintMine();
            })
          );
        } else if (G.tab === "wheel") {
          mat.innerHTML = `<div class="wheel">
              <div><b class="${CLS[0]}">과학 지수</b><br>경제력 · 국가 인지도 · 국방력</div>
              <div><b class="${CLS[1]}">행복 지수</b><br>출산율 · 치안 · 봉사와 기부</div>
              <div><b class="${CLS[2]}">환경 지수</b><br>친환경 농수산물 · 관광 · 생태자원</div></div>
            <p class="label" style="margin-top:12px">연관 요소 활용 예</p>
            <ul class="small" style="margin:4px 0 0;padding-left:1.1em">
              <li>어떤 나라의 [과학] 지수가 다른 나라에 비해 5이상 낮으면(위험 수준) 낮은 국가 인지도와 국방력 등으로 인하여 인접한 나라로부터 정치 외교적 간섭을 심하게 받을 수 있다.</li>
              <li>어떤 나라의 [환경] 지수가 다른 나라에 비해 3이상 낮으면(경계 수준) 친환경 농수산물에 대한 수입 의존도가 올라가고 생태계가 제법 훼손되어 관광에 악영향을 받을 수 있다.</li></ul>`;
        } else {
          mat.innerHTML = `<p class="label">나람국 · 최종 과학 11, 행복 9, 환경 0</p>${planTable("나람국", NB.나람국, NARAM)}
            <p class="label" style="margin-top:12px">다람국 · 최종 과학 3, 행복 9, 환경 9</p>${planTable("다람국", NB.다람국, DARAM)}
            <div class="bro-grid" style="margin-top:10px">${trio(null)}</div>
            <p class="hint">나람국은 3년 차 누적 환경 지수가 0이어서 4년 차에 전염병으로 행복 지수가 1 하락했습니다.</p>`;
        }
      };
      const paintMine = () => {
        const res = compute(G.plan, true);
        KCP.$("#yr", root).textContent = `${G.plan.length} / 10년`;
        KCP.$("#mine", root).innerHTML = planTable("가람국", res, G.plan, NB);
        const last = res.rows[res.rows.length - 1];
        const ev = [];
        if (G.plan.length >= 3) ev.push(res.epi ? `<span class="event fired">전염병 확산: 3년 차 누적 과학 또는 환경이 0 이하 → 4년 차 행복 −1</span>` : `<span class="event good">전염병 확산을 막았습니다</span>`);
        if (G.plan.length >= 6) ev.push(res.fair ? `<span class="event good">세계 박람회 성공: 7년 차 행복 +2</span>` : `<span class="event">세계 박람회 조건 미달 (6년 차 누적 과학 5, 환경 3 이상 필요)</span>`);
        if (last) ev.push(`<span class="chip num">현재 누적 과학 ${last.cum[0]} · 행복 ${last.cum[1]} · 환경 ${last.cum[2]}</span>`);
        KCP.$("#events", root).innerHTML = ev.join("");
        KCP.$("#trio", root).innerHTML = trio(G.plan.length ? res : null);
      };
      KCP.$$("[data-tab]", root).forEach((b) => (b.onclick = () => { G.tab = b.dataset.tab; save(); paintMat(); }));
      KCP.$("#undo", root).onclick = () => { G.plan.pop(); save(); paintMat(); paintMine(); };
      KCP.$("#clear", root).onclick = () => { G.plan = []; save(); paintMat(); paintMine(); };
      KCP.$("#q1-23", root).addEventListener("input", (e) => { G.q1 = e.target.value; save(); });
      KCP.$("#q2-23", root).addEventListener("input", (e) => { G.q2 = e.target.value; save(); });
      KCP.$("#go23", root).onclick = next;
      paintMat(); paintMine();
    },

    questions(state) {
      const G = g(state);
      const res = compute(G.plan, true);
      const qs = [
        { k: "23-q1", src: "report", tag: "문제 1", q: "나람국과 다람국이 세운 실행 계획의 차이점을 바탕으로 두 국가 사이에 발생할 수 있는 현상을 설명해 주세요." },
        { k: "23-q1-conflict", tag: "문제 1 후속", q: "상생 방안을 주로 설명했다면, 반대로 두 국가 사이에 갈등 관계가 생기지는 않을까요? (갈등을 설명했다면, 상생할 방법은 없을까요?)" },
        { k: "23-q1-oppose", tag: "문제 1 후속", q: "나람국과 다람국의 실행 계획을 반대하는 집단이 있다면 그 집단은 어떤 집단일까요?" },
        { k: "23-q2", src: "report", tag: "문제 2", q: "가람국 지도자로서 세운 10년 실행 계획을 설명해 주세요. 가장 중요하게 생각한 부분은 무엇이었나요?" },
      ];
      const last = res.rows[res.rows.length - 1];
      if (last) {
        const hi = [0, 1, 2].sort((a, b) => last.cum[b] - last.cum[a])[0];
        qs.push({ k: "23-q2-top", tag: "문제 2 후속", q: `최종 ${NAMES[hi]} 지수가 ${last.cum[hi]}로 가장 높습니다. 의도적으로 그렇게 한 것인가요?` });
      }
      qs.push({ k: "23-q2-timing", tag: "문제 2 후속", q: "같은 실행 항목을 선택하더라도 실행 시점에 따라 최종 지수는 같을 수 있지만 그 과정은 다를 수 있습니다. 실행 계획을 세울 때 실행 항목의 시점을 고려했나요?" });
      let worst = null;
      res.rows.forEach((r, i) => [0, 1, 2].forEach((k) => Object.entries(NB).forEach(([nm, nb]) => {
        const gp = nb.rows[i].cum[k] - r.cum[k];
        if (gp >= 3 && (!worst || gp > worst.gp)) worst = { i, k, nm, gp };
      })));
      if (worst) qs.push({ k: "23-q2-gap", tag: "문제 2 후속", q: `${worst.i + 1}년 차 ${NAMES[worst.k]} 지수가 ${worst.nm}보다 ${worst.gp} 낮아 ${worst.gp >= 5 ? "위험" : "경계"} 수준입니다. 주변 나라를 고려할 때 어떤 문제가 발생할 수 있을까요? 이를 해결하려면 어떤 방법이 있을까요?` });
      else if (G.plan.length) qs.push({ k: "23-q2-avoid", tag: "문제 2 후속", q: "이웃 나라와의 격차에서 발생할 수 있는 경계, 위험 상황을 어떤 방법으로 회피했나요?" });
      qs.push({ k: "23-q2-event", tag: "문제 2 후속", q: `전염병 발생과 세계 박람회 개최 사건이 실행 계획을 수립하는 데 영향을 주었나요?${res.fair ? " (박람회 효과를 얻었습니다)" : ""}${res.epi ? " (전염병 피해를 입었습니다)" : ""}` });
      const lostPick = G.plan.find((id) => IT[id].lost) || "3H";
      qs.push({ k: "23-lost", tag: "합리적 추론", q: `실행 항목 중 '${lostPick} ${IT[lostPick].n}'은(는) 내용이 일부 유실됐습니다. 제시된 지수(${IT[lostPick].v.join(", ")})에 어울리는 실행 항목이 되려면 어떤 내용이 들어가 있었을 것 같나요?` });
      qs.push({ k: "23-flex", tag: "유연성", q: "이웃 나라인 나람국과 다람국의 지수를 모르고 격차에 대한 정보가 없었다면 실행 계획이 달라졌을까요?" });
      qs.push({ k: "23-hum-verify", tag: "인문적 통찰", q: "본인이 설계한 계획이 타당한지 실행하기 전에 검증하려면 실제 세계에서는 어떤 방법으로 확인해볼 수 있을까요?" });
      return qs;
    },

    recap(state) {
      const G = g(state);
      const res = compute(G.plan, true);
      const last = res.rows[res.rows.length - 1];
      return [
        { t: "가람국 실행 계획", d: G.plan.map((id, i) => `${i + 1}년 ${id} ${IT[id].n}`).join(" → ") || "(비어 있음)" },
        { t: "최종 누적 지수", d: last ? `과학 ${last.cum[0]} · 행복 ${last.cum[1]} · 환경 ${last.cum[2]}` : "-" },
        { t: "사건", d: `전염병 ${G.plan.length >= 3 ? (res.epi ? "발생" : "없음") : "-"} · 박람회 ${G.plan.length >= 6 ? (res.fair ? "효과" : "조건 미달") : "-"}` },
        { t: "문제 1 답", d: G.q1 },
        { t: "문제 2 설명", d: G.q2 },
      ];
    },

    reflectExtra() {
      const ex = ["1C", "2G", "1A", "2C", "2B", "3C", "3B", "2H", "3H", "4G"];
      const r = compute(ex, true);
      const lostList = RAW.filter((x) => x[6]).map(([id, n, , , , d, lost]) => `<li><b>${id} ${esc(n)}</b>: ${esc(d)} <span class="clue-hl">${esc(lost)}</span></li>`).join("");
      return `<details class="reveal"><summary>문제 1 예상 답변 세 갈래 <span class="tag-official">보고서 요약</span></summary>
          <ul class="small" style="margin:0;padding-left:1.1em">
            <li><b>발전 방향을 비교하고 상생 방안을 덧붙인 답변</b>: 나람국은 과학, 다람국은 환경에 주력. 다람국은 관광 자원을 개발하고 나람국은 기술 수출로 해외여행을 활성화하면 서로 보완할 수 있다.</li>
            <li><b>지수별로 상세하게 비교한 답변</b>: 과학 격차는 3년 차 경계, 4년 차부터 위험이라 다람국은 무역과 외교 경쟁이 약할 것. 행복은 9년 차에 잠시 위험했다가 10년 차에 격차가 사라짐. 환경은 4년 차부터 경계, 7년 차부터 위험이라 나람국 은퇴자가 다람국으로 이주할 것.</li>
            <li><b>관찰에 해석과 대안을 덧붙인 답변</b>: 최종 행복은 같지만 깨끗한 환경의 다람국 삶의 질이 더 좋을 수 있다. 다만 과학 지수가 너무 낮아 정치외교적 간섭을 받을 수 있으니 외교로 대처해야 한다.</li>
          </ul>
          <p class="small muted" style="margin-top:6px"><span class="tag-mine">연습실 계산</span> 위 답변 예시는 보고서 문장을 옮긴 것입니다. 자료 4 표로 직접 계산하면 행복 격차는 9년 차에 3(경계 수준)이고, 환경 격차는 4년 차 2, 5년 차 4(경계 수준), 7년 차 6(위험 수준)입니다.</p></details>
        <details class="reveal"><summary>문제 2 예시 계획 · 최종 ${r.rows[9].cum.join(" / ")} <span class="tag-official">보고서</span></summary>
          <p class="small num">${ex.join(" → ")}</p>
          ${planTable("예시 가람국", r, ex, NB)}
          <p class="small">최종 환경 지수가 가장 높고, 6년 차 누적 과학 6·환경 3으로 박람회 조건을 채워 7년 차 행복 +2가 적용됩니다. 3년 차 누적 과학 2·환경 2라 전염병은 피했습니다. <span class="tag-mine">연습실 설명</span></p></details>
        <details class="reveal"><summary>유실된 정보 공개 <span class="tag-official">보고서 참고사항</span></summary>
          <p class="small muted">보고서가 공개한 원래 문장입니다. 표시된 부분이 시험장에서는 가려져 있었습니다. 3G, 3H처럼 전체가 가려졌던 항목도 여기서 확인할 수 있습니다.</p>
          <ul class="small" style="margin:6px 0 0;padding-left:1.1em">${lostList}</ul></details>`;
    },
  };
})();
