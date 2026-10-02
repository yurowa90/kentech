/* 2025학년도: 켄테시아 타임스 발행 순서 추론 */
(function () {
  const KCP = window.KCP;
  const esc = KCP.esc;

  const P = {
    red: { sym: "■", cls: "sym-red", short: "창간호 · 이주 300년" },
    blue: { sym: "●", cls: "sym-blue", short: "켄트로늄 고갈 · AI 접속권" },
    green: { sym: "▲", cls: "sym-green", short: "거대 인공위성 · AI 교사" },
    black: { sym: "◆", cls: "sym-black", short: "기억 클라우드 · 제노스" },
  };
  const IDS = ["blue", "red", "green", "black"]; // 자료 2~5번 순서
  const tagOf = (id) => `<span class="${P[id].cls}">${P[id].sym}</span>`;

  const FACTS = {
    red: ["창간호 특집기사", "켄테시아 이주 300년", "단일 행성·단일 국가 체제 유지", "인류의 켄트로늄 의존도가 매우 높아짐", "한정된 매장량이 가장 큰 숙제", "로봇 수가 200년 이후 급증(그래프)", "삶의 만족도는 200년 무렵 가장 낮음(그래프)"],
    blue: ["켄트로늄 고갈 시점이 과학적으로 처음 확인", "고갈 예측은 AI 연구 결과", "에너지 절약 캠페인·대체 에너지 개발 논의 시작", "AI 로봇을 인격체로 대우하자는 목소리", "기억 클라우드는 지금까지 인간의 전유물", "AI 로봇 기억 클라우드 접속권 요구 증가"],
    green: ["길이 1,200m 거대 인공위성 궤도 안착", "시민 79% 동의로 개발 시작", "무선 에너지 전송 기술", "자원 낭비·경제적 부담 우려로 반대", "AI 로봇이 아이들의 개인 교사", "로봇 생산 증가로 켄트로늄 대량 소모 우려"],
    black: ["기억 클라우드 출시와 동시에 수백만 명 확보", "경험 공유로 갈등 해결의 실마리", "개인정보 침해·정체성 혼란 우려", "외부 행성 '제노스' 에너지 자원 발견", "AI 로봇 파견 탐사 논의", "우주청·환경청 우주 생태계 보호 규범 계획"],
  };

  const PAPER = {
    blue: () => `
      <article><h4>켄트로늄 고갈 이제 현실이 되나?</h4>
        <p>켄테시아 에너지 관리청(이하, 에너지청)은 오늘 켄트로늄의 고갈 가능성을 언급했다. 켄트로늄의 고갈 시점이 과학적으로 확인된 것은 이번이 처음으로, 많은 사람들의 이목이 쏠리고 있다. 그동안 켄트로늄의 높은 활용성에 따라 소비량이 매년 급격히 증가해 왔다. 이번 발표는 이러한 켄트로늄 소비 추세와 켄트로늄 매장량 등을 반영하여 AI가 예측한 연구 결과에 기반한 것이라고 에너지청은 설명했다. 켄트로늄 고갈 시 켄테시아 전체 시스템 붕괴는 물론, 인류의 생존도 위협받을 수 있기에, 에너지청은 비상 에너지 공급 전략을 신속히 마련하고 장기적인 에너지 대책을 수립해야 한다고 덧붙였다. 이에 켄테시아 정부는 에너지 절약 캠페인과 대체 에너지 개발 프로젝트 착수에 대한 논의를 시작하겠다고 밝혔다.</p>
        <div class="by">한계치 기자 (ghan@ktimes.com)</div>
        <div class="cap">사진: 켄트로늄의 채굴장 전경과 켄트로늄 사용량 그래프 (사용량 곡선이 최근 급격히 치솟음)</div>
      </article>
      <article><h4>AI 로봇, 기억 클라우드 접속권을 요구하다</h4>
        <p>최근 AI 로봇의 처우에 대한 논란이 화제다. 마틴 박사의 연구 결과를 기점으로, AI 로봇의 인지능력이 대폭 향상되면서 이제는 AI 로봇도 하나의 인격체로서 대우해야 한다는 목소리가 높아지고 있다. 이에 더해 기억 클라우드(경험 공유 시스템)에 대한 접근 권한을 AI 로봇에게도 부여해달라는 요구가 늘어나고 있다. 지금까지 기억 클라우드는 인간의 전유물이었다. 기억 클라우드를 통해 사람들은 자신이 직접 경험한 것들을 공유하며 타인과 소통하는 문화를 만들어 왔다. 그런데, 최근 AI 로봇을 친구나 가족으로 의지하는 사람들이 늘어나면서, 자연스럽게 이들과 경험을 공유할 수 있게 해달라는 요청이 늘어나고 있는 것이다. 하지만 기억 클라우드에 AI 로봇이 접속하는 것에 대한 우려의 목소리도 높다. 단순히 인간과 경험을 공유하는 것을 넘어, 이 경험들이 AI 로봇의 행동에 영향을 줄 수 있다는 것이다. 인간들의 다양한 경험에 빗대어 스스로 판단하게 되면, 판타지 소설에서 나오는 인간과 로봇의 전쟁이 현실이 될 것이라는 주장도 나온다.</p>
        <div class="by">모두우리 기자 (modoo@ktimes.com)</div>
        <div class="cap">사진: 인간과 기억을 공유하는 AI 로봇</div>
      </article>`,
    red: () => `
      <article><span class="kicker">창간호 특집기사</span><h4>“켄테시아 이주 300년, 우리는?”</h4>
        <div class="cap">사진: 켄테시아 수도 전경 (녹지와 수로가 어우러진 고층 도시)</div>
        <p>이제는 아득해진 푸른 별 지구. 46억 년의 역사에 인류가 살았던 것은 고작 4천여 년에 불과하지만, 에너지 고갈과 기후 재앙으로 인해 결국 우리는 이곳 켄테시아에 정착했다. 인류가 지구를 떠날 수밖에 없게 만들었던 잘못을 복기하며, 같은 실수를 하지 않으려는 노력이 켄테시아 문명의 미래를 결정한다. 인류는 새로운 고향, 켄테시아에서 영원할 것인가? 아니면 또 다시 떠나게 될 것인가? 그 의문에 답하기 위해 오늘 우리는 켄테시아의 사회, 과학, 생활 등 다양한 분야를 되짚어 본다. 켄테시아는 단일 행성, 단일 국가 체제를 유지해 왔다. 이는 다국가 체제하에서의 갈등과 다툼을 반복하지 않기 위해서 내린 결정이었다. 이 선택은 훌륭하게 작동했다. 인류는 불필요한 경쟁을 멈추고, 고도로 발전된 과학기술을 영위하며, 지구에서 문명시대를 꽃피웠듯 켄테시아의 일부로 녹아들었다. 우리는 이제 자연과 인류가 완벽하게 공존하는 시대에 살고 있다. 켄트로늄이 주는 혜택은 실로 놀라웠다. 켄트로늄의 높은 에너지 밀도를 기반으로 인류는 더 많은 기술 발전을 이룩할 수 있었다. 또한 에너지 자원외에도 제조, 식품, 의료 등 다양한 분야에 사용되어 많은 혜택을 주고 있다. 그동안 에너지와 기술의 한계로 인해 제한되었던 로봇, 인공지능, 통신, 자동차 기술 등의 발전이 가장 대표적인 예이다. 이에 따라 그동안 인류의 켄트로늄 의존도가 매우 높아졌다. 그렇기 때문에 켄트로늄의 한정된 매장량은 여전히 가장 큰 숙제로 남아있다. 이제는 없어서는 안 될 존재가 되어버린 켄트로늄. 인류는 이제 켄트로늄과 함께 지속 가능한 방법을 찾아야 할 때이다.</p>
        <div class="charts">
          <div><b class="small">켄테시아 삶의 만족도</b>${KCP.vbar(
            ["0", "50", "100", "150", "200", "250", "300"],
            [{ name: "만족도(%)", color: "#2fbf6a", data: [70, 64, 73, 59, 49, 54, 65] }],
            { max: 100, ticks: [0, 20, 40, 60, 80, 100], w: 300, h: 190, xlabel: "정착 후 시간(년)", aria: "삶의 만족도" }
          )}</div>
          <div><b class="small">켄테시아의 인구와 로봇 수 변화</b>${KCP.vbar(
            ["0", "50", "100", "150", "200", "250", "300"],
            [
              { name: "인구", color: "#3d8ef0", data: [5, 11, 32, 45, 70, 92, 100] },
              { name: "로봇", color: "#1f3d9c", data: [0, 1, 3, 5, 20, 64, 92] },
            ],
            { max: 120, ticks: [0, 20, 40, 60, 80, 100, 120], w: 300, h: 190, xlabel: "정착 후 시간(년)", aria: "인구와 로봇 수" }
          )}</div>
        </div>
        <p class="hint">그래프 값은 원자료 그림을 눈금에 맞춰 근사했습니다.</p>
        <div class="by">성창의 기자 (csung@kentesia.com)</div>
      </article>`,
    green: () => `
      <article><h4>켄테시아 역사상 가장 거대한 인공위성 프로젝트 성공</h4>
        <div class="cap">사진: 켄테시아 궤도에 안착하여 무선 에너지 전송을 테스트 하고 있는 거대 인공위성</div>
        <p>켄테시아 과학기술의 결정체로 평가받는 역사상 가장 거대한 인공위성이 궤도에 성공적으로 안착하며 새로운 시대를 열었다. 길이 1,200미터에 달하는 이 거대 인공위성은 막대한 자원과 에너지가 투입되는 만큼, 개발 초기부터 개발 필요성에 대한 찬반 논쟁이 뜨거웠다. 일각에서는 자원 낭비와 경제적 부담을 우려하며 강력히 반대했으나, 기후문제와 에너지 공급의 근본적 해결책이 될 것이라는 주장이 설득력을 얻으며, 켄테시아 전체 시민 중 79%의 동의를 얻어 개발을 시작할 수 있었다. 이 인공위성의 핵심 기술 중 하나는 에너지를 무선으로 전송하는 기술이다. 무선 에너지 전송 기술의 개발을 주도한 켄텍 연구원은 “무선 에너지 전송은 에너지를 먼 거리로 효율적으로 전달할 수 있는 기술”이라며, “켄테시아의 에너지 확보 문제에 새로운 전환점을 가져올 것”이라고 강조했다. 켄테시아는 이를 통해 에너지 공급의 지속 가능성을 확보하고, 미래를 위한 기후 대응 및 자원 활용의 새로운 가능성을 열 것으로 기대된다.</p>
        <div class="by">김거대 기자 (giantkim@kentesia.com)</div>
      </article>
      <article><h4>AI 로봇, 인류 생활 혁신을 이끌다</h4>
        <p>이제는 AI 로봇이 켄테시아 사회 전반에 없어서는 안될 존재가 되었다. 초기 AI 로봇은 단순한 업무를 자율적으로 수행하는 수준에 그쳤으나, 기술의 발전으로 가정과 직장, 교육 등 다양한 분야에서 그 활용 범위가 빠르게 확대되고 있다. 최근 고도화된 AI 로봇은 물건을 옮기거나 청소하는 단순 작업을 넘어, 인간의 감정을 이해하고 표현할 수 있는 단계에 이르렀다. 이에 따라 아이들의 개인 교사로 AI 로봇을 활용하는 사례가 늘어나고 있다. 로봇이 학생들에게 개별적으로 학습을 지도하거나, 감정적으로 어려움을 겪는 아이들에게 위로와 격려를 건네는 모습은 이제 더 이상 낯선 광경이 아니다. AI 로봇의 뛰어난 활용성과 다재다능함은 수요 폭증을 불러왔으나, AI 로봇의 생산량 증가로 인해 자원 고갈 문제도 점차 심각해지고 있다. 특히 AI 로봇의 핵심 소재인 켄트로늄의 대량 소모가 우려의 중심에 있다. 켄트로늄은 에너지 밀도가 높은 자원으로, 로봇이 높은 성능을 발휘하는데 필수적이지만 전문가들 사이에서 한정적인 매장량에 대한 우려의 목소리가 커지고 있다.</p>
        <div class="by">크리스 윤택 기자 (chrisyt@kentesia.com)</div>
        <div class="cap">사진: 학생을 가르치고 있는 AI로봇</div>
      </article>`,
    black: () => `
      <article><h4>기억 클라우드, 사회 문제 해결의 열쇠가 될까?</h4>
        <p>경험 공유 시스템 '기억 클라우드'가 세간의 이목을 집중시키고 있다. 이 시스템은 개인의 기억과 경험을 실시간으로 클라우드에 업로드하고, 다른 사람들이 이를 다운로드하여 신경 연결 장치를 통해 신속하게 타인의 경험을 얻을 수 있게 한다. 이는 단순히 영상을 시청하는 것과 달리, 오감을 통해 타인의 경험을 직접 체험한 것처럼 생생하게 느낄 수 있다는 점에서 혁신적이다. 사용자들은 자신의 경험과 노하우를 업로드하고 다른 이들의 다양한 경험도 단시간에 습득할 수 있다. 예를 들어, 요리 전문가가 수년간 쌓아온 요리 기술을 공유하면, 다른 사용자는 그 기술을 즉시 익혀 전문 요리사와 같은 실력을 발휘할 수 있다. 마인드링크사가 개발한 이 시스템은 고속 신경 데이터 압축 기술과 오감 데이터 전송 기술을 활용하여 방대한 기억 데이터를 효율적으로 공유한다. 개인의 뇌파와 신경 신호를 데이터로 변환하여 안전하게 전달하는 방식이다. 마인드링크사의 대표는 “경험 공유 시스템은 개인의 소중한 경험을 그대로 다른 이들과 나눌 수 있는 플랫폼”이라며 “이를 통해 사회 전체의 공감 능력과 이해도가 비약적으로 향상될 것”이라고 말했다. 그러나 일부 전문가들은 개인정보 침해, 정체성 혼란, 감각 데이터 오용 등에 대한 우려를 제기하고 있다. 특히 타인의 강렬한 경험을 무분별하게 수용할 경우 심리적 부작용이 발생할 수 있다는 지적도 있다. 이에 대해 마인드링크사는 “사용자가 공개하고자 하는 정보만 선택적으로 공유할 수 있으며, 보안장치와 필터링 시스템을 통해 부작용을 최소화하였다”고 강조했다. 한편, 기억 클라우드는 출시와 동시에 수백만 명의 사용자를 확보하며 큰 호응을 얻고 있다. 사용자들은 “타인의 입장에서 세상을 바라볼 수 있어 편견이 줄었다.”, “갈등 상황에서 상대방의 감정을 이해하니 해결의 실마리를 찾을 수 있었다”는 긍정적인 반응을 보였다.</p>
        <blockquote>모두가 공유하는 경험과 지식, 개인의 벽을 허물고 사회문제를 해결하는 열쇠가 될 수 있을까?</blockquote>
        <div class="by">안망각 기자 (noslip@kentesia.com)</div>
      </article>
      <article><h4>외부 행성 에너지 자원 발견, AI 로봇 투입 논의</h4>
        <p>최근 과학자들이 외부 행성 '제노스'에 대량의 에너지 자원이 존재한다는 연구 결과를 발표했다. 이에 따라 켄테시아 사회에서는 AI 로봇을 파견하여 자원을 탐사하자는 의견이 대두되고 있다. 켄테시아 에너지 연구소의 한 관계자는 “제노스 행성의 에너지 자원은 켄트로늄을 대체할 수 있을 만큼 풍부한 것으로 보인다”며 “AI 로봇을 활용하면 인간의 위험 부담 없이 자원을 확보할 수 있다”고 말했다. AI 로봇은 극한의 환경에서도 작업이 가능하므로, 인간의 직접적인 파견 없이도 효율적인 자원 채굴이 가능하다는 설명이다. 정부는 이에 대해 전문가들의 의견을 수렴하여 안전하고 지속 가능한 자원 확보 방안을 모색하겠다고 밝혔다. 또한 우주청과 환경청의 협력으로 우주 생태계 보호를 위한 규범을 마련할 계획이다.</p>
        <div class="by">차저감 기자 (gotoplace@kentesia.com)</div>
        <div class="cap">사진: '제노스'에서 에너지 자원을 추출하는 모습</div>
      </article>`,
  };

  function g(state) {
    state.game = Object.assign({ tab: "blue", order: [null, null, null, null], links: {}, gaps: {}, overall: "", sel: null }, state.game || {});
    return state.game;
  }

  KCP.games["2025"] = {
    brief() {
      return `<div class="scenario">
          <p class="label">창의성 문제 배경</p>
          <p>기후 위기와 에너지 고갈에 대응하기 위해 지구를 떠나 새로운 정착지를 찾아 나선 탐험대는 긴 여정 끝에 '켄테시아' 행성에 도착했다. 이곳에는 새로운 에너지원인 '켄트로늄'이 존재했으며, 이를 기반으로 인류는 정착을 시작했다.</p>
          <p>이후 오랜 시간 동안 켄트로늄은 인류의 생존에 필요한 자원을 제공하고 필수품의 생산을 가능하게 했다. 켄트로늄은 켄테시아 문명과 기술을 비약적으로 발전시키는 원동력이 되었다. 높은 에너지 효율을 가진 켄트로늄은 이제 인류에게 없어서는 안 될 핵심 자원으로 자리 잡았다.</p>
          <ul class="rules">
            <li>신문 기사들 사이의 인과관계나 연관성을 고려하여 설명해야 한다.</li>
            <li>기사에서 드러나는 켄테시아 사회의 모습을 바탕으로 기술이 사회에 미치는 영향을 고려해야 한다.</li>
            <li>신문 기사에서 직접 기술하지 않은 내용이나 상황도 합리적인 수준에서 자유롭게 가정할 수 있다. 각 신문 사이의 시간 간격이나 사이에 발생할 수 있는 일도 창의적으로 상상할 수 있다.</li>
            <li>신문 상단의 색상과 기호(● ■ ▲ ◆)는 구별을 위한 표시로 특별한 의미는 없다.</li>
          </ul>
        </div>
        <div class="task"><b>문제</b><p>제시된 자료는 켄테시아에서 발행한 신문 KENTESIA TIMES 4부이다. 기사의 내용을 바탕으로 <b>신문이 발행된 순서를 추정하고 이유를 설명</b>하시오.</p></div>`;
    },

    renderPrep(root, state, save, next) {
      const G = g(state);
      root.innerHTML = `
        <div class="desk">
          <div class="stack">
            <section class="panel">
              <h3>KENTESIA TIMES 4부 <span class="chip">순서와 무관하게 배부됨</span></h3>
              <div class="tabs" role="tablist">${IDS.map(
                (id, i) => `<button role="tab" data-tab="${id}" aria-selected="${G.tab === id}">자료 ${i + 2} ${tagOf(id)}</button>`
              ).join("")}</div>
              <div class="paper" id="paper"></div>
              <div style="margin-top:10px"><p class="label" style="margin-bottom:6px">단서 카드 · 누르면 선택한 연결 근거 칸에 들어갑니다</p><div class="tray" id="facts"></div></div>
            </section>
          </div>
          <div class="stack">
            <section class="panel">
              <h3>발행 순서 추정</h3>
              <p class="small muted" style="margin-bottom:8px">신문을 고른 다음 빈 칸을 누르세요. 칸의 신문을 누르면 빠집니다. 신문 사이 칸에는 인과관계 근거와, 그 사이에 있었을 법한 사건을 적습니다.</p>
              <div class="tray" id="tray" style="margin-bottom:10px"></div>
              <div class="slots" id="slots"></div>
            </section>
            <section class="panel">
              <h3>종합 설명</h3>
              <textarea class="note" id="overall25" style="min-height:120px" placeholder="이 순서로 보면 켄테시아 사회는 어떤 흐름을 겪었나요? 기술이 사회에 미친 영향을 한 줄기 이야기로 정리하세요.">${esc(G.overall)}</textarea>
            </section>
            ${KCP.memoPanel(state, save, "memo25")}
            <div class="row"><span class="spacer"></span><button class="btn primary" id="go25">면접실로 이동</button></div>
          </div>
        </div>`;

      let lastLink = null;
      const paper = KCP.$("#paper", root);
      const facts = KCP.$("#facts", root);
      const paintPaper = () => {
        KCP.$$("[data-tab]", root).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === G.tab)));
        paper.innerHTML = `<div class="mast"><b>KENTESIA TIMES</b><span class="sym ${P[G.tab].cls}">${P[G.tab].sym}</span></div>${PAPER[G.tab]()}`;
        facts.innerHTML = FACTS[G.tab].map((f) => `<button data-fact="${esc(f)}">${tagOf(G.tab)} ${esc(f)}</button>`).join("");
        KCP.$$("[data-fact]", facts).forEach((b) =>
          (b.onclick = () => {
            const ta = lastLink && document.body.contains(lastLink) ? lastLink : KCP.$("#overall25", root);
            const add = `[${P[G.tab].sym}] ${b.dataset.fact}`;
            ta.value = ta.value ? ta.value.replace(/\s*$/, "") + "\n" + add : add;
            ta.dispatchEvent(new Event("input"));
            KCP.toast("단서를 넣었습니다");
          })
        );
      };
      KCP.$$("[data-tab]", root).forEach((b) => (b.onclick = () => { G.tab = b.dataset.tab; save(); paintPaper(); }));
      paintPaper();

      const tray = KCP.$("#tray", root);
      const slots = KCP.$("#slots", root);
      const paintOrder = () => {
        const placed = G.order.filter(Boolean);
        tray.innerHTML = IDS.filter((id) => !placed.includes(id))
          .map((id) => `<button data-sel="${id}" aria-pressed="${G.sel === id}">${tagOf(id)} ${esc(P[id].short)}</button>`)
          .join("") || '<span class="small muted">4부를 모두 배치했습니다.</span>';
        let html = "";
        G.order.forEach((id, i) => {
          html += `<div class="slot ${id ? "filled" : ""}" data-slot="${i}">
            <span class="n">${i + 1}</span>
            <span>${id ? `<span class="pp">${tagOf(id)} ${esc(P[id].short)}</span>` : '<span class="small muted">여기를 눌러 배치</span>'}</span>
            <span class="row">${id ? `<button class="btn small ghost" data-up="${i}" aria-label="위로" ${i === 0 ? "disabled" : ""}>↑</button><button class="btn small ghost" data-down="${i}" aria-label="아래로" ${i === 3 ? "disabled" : ""}>↓</button>` : ""}</span>
          </div>`;
          if (i < 3) {
            const a = G.order[i], b = G.order[i + 1];
            html += `<div class="link stack" style="gap:6px">
              <div class="field"><label for="lk-${i}">${a ? tagOf(a) : "?"} → ${b ? tagOf(b) : "?"} 연결 근거</label>
              <textarea class="note" id="lk-${i}" data-link="${i}" style="min-height:56px" placeholder="앞 신문의 어떤 사건이 뒤 신문의 원인이 되었나요?">${esc(G.links[i] || "")}</textarea></div>
              <div class="field"><label for="gp-${i}">그 사이에 있었을 사건 (상상)</label>
              <input class="note" id="gp-${i}" data-gap="${i}" placeholder="예: 에너지청이 대체 에너지 공모를 시작했다" value="${esc(G.gaps[i] || "")}"></div>
            </div>`;
          }
        });
        slots.innerHTML = html;
        KCP.$$("[data-sel]", tray).forEach((b) => (b.onclick = () => { G.sel = G.sel === b.dataset.sel ? null : b.dataset.sel; save(); paintOrder(); }));
        KCP.$$("[data-slot]", slots).forEach((s) =>
          s.addEventListener("click", (e) => {
            if (e.target.closest("button")) return;
            const i = Number(s.dataset.slot);
            if (G.order[i]) G.order[i] = null;
            else if (G.sel) { G.order[i] = G.sel; G.sel = null; }
            else { KCP.toast("먼저 위에서 신문을 고르세요"); return; }
            save(); paintOrder();
          })
        );
        const swap = (i, j) => { const t = G.order[i]; G.order[i] = G.order[j]; G.order[j] = t; save(); paintOrder(); };
        KCP.$$("[data-up]", slots).forEach((b) => (b.onclick = () => swap(Number(b.dataset.up), Number(b.dataset.up) - 1)));
        KCP.$$("[data-down]", slots).forEach((b) => (b.onclick = () => swap(Number(b.dataset.down), Number(b.dataset.down) + 1)));
        KCP.$$("[data-link]", slots).forEach((t) => {
          t.addEventListener("focus", () => (lastLink = t));
          t.addEventListener("input", () => { G.links[t.dataset.link] = t.value; save(); });
        });
        KCP.$$("[data-gap]", slots).forEach((t) => t.addEventListener("input", () => { G.gaps[t.dataset.gap] = t.value; save(); }));
      };
      paintOrder();
      const ov = KCP.$("#overall25", root);
      ov.addEventListener("focus", () => (lastLink = ov));
      ov.addEventListener("input", () => { G.overall = ov.value; save(); });
      KCP.$("#go25", root).onclick = next;
    },

    questions(state) {
      const G = g(state);
      const o = G.order;
      const full = o.every(Boolean);
      const s = (id) => (id ? P[id].sym : "?");
      const qs = [{ k: "25-q", src: "report", tag: "문항", q: "추정한 신문 발행 순서와 그 이유를 설명해 주세요." }];
      if (full) {
        qs.push({ k: "25-first", tag: "문제해결", q: `${s(o[0])} 신문을 가장 먼저 놓았습니다. 첫 신문이라고 판단한 결정적 근거는 무엇인가요?` });
        qs.push({ k: "25-swap", tag: "문제해결", q: `${s(o[2])}와 ${s(o[3])}의 순서를 바꾸면 어떤 인과관계가 끊어지나요?` });
      }
      qs.push({ k: "25-data", tag: "자료 해석", q: "◆ 기사는 기억 클라우드가 '출시와 동시에' 사용자를 모았다고 쓰고, ● 기사는 기억 클라우드가 '지금까지 인간의 전유물'이었다고 씁니다. 이 두 문장을 순서 판단에 어떻게 반영했나요?" });
      qs.push({ k: "25-div-ai", tag: "발산적 사고", q: "● 기사의 켄트로늄 고갈 예측이 AI의 예측 오류였다고 밝혀진다면, 당신의 순서와 해석은 어떻게 달라지나요?", rec: "보고서의 면접 질문 기준: 조건이 바뀌거나 예상하지 못한 상황이 주어졌을 때 유연하게 새로운 해결 방안을 제시하는가" });
      qs.push({ k: "25-div-fifth", tag: "발산적 사고", q: "당신의 순서에서 두 신문 사이에 발행되었을 법한 다섯 번째 신문의 헤드라인을 하나 지어 보세요." });
      qs.push({ k: "25-hum-access", tag: "인문적 통찰", q: "AI 로봇에게 기억 클라우드 접속권을 주는 것에 찬성하나요, 반대하나요? 켄테시아 사회의 맥락에서 설명해 주세요." });
      qs.push({ k: "25-hum-future", tag: "인문적 통찰", q: "창간호는 '인류는 켄테시아에서 영원할 것인가, 또 다시 떠나게 될 것인가'라고 묻습니다. 마지막 신문 이후 켄테시아의 미래를 예측해 보세요." });
      return qs;
    },

    recap(state) {
      const G = g(state);
      const sym = (id) => (id ? P[id].sym : "?");
      const orderTxt = G.order.map(sym).join(" → ");
      const out = [{ t: "발행 순서", d: orderTxt }];
      [0, 1, 2].forEach((i) => {
        if (G.links[i] || G.gaps[i])
          out.push({ t: `${sym(G.order[i])} → ${sym(G.order[i + 1])}`, d: (G.links[i] || "") + (G.gaps[i] ? `\n(사이의 사건) ${G.gaps[i]}` : "") });
      });
      out.push({ t: "종합 설명", d: G.overall });
      return out;
    },

    reflectExtra(state) {
      const G = g(state);
      const mine = G.order.every(Boolean) ? G.order.map((id) => P[id].sym).join(" → ") : "(미완성)";
      const ex = [
        ["■ → ● → ▲ → ◆", "창간호 다음 켄트로늄 고갈 문제를 인지하고, 무선 에너지 전송 인공위성을 띄운 뒤, 외부 행성 제노스를 발견해 에너지 문제를 해결하는 흐름. AI 로봇 접속권 논란은 결국 수용되어 이해와 화합으로 이어졌다고 봄."],
        ["■ → ● → ◆ → ▲", "고갈 위기와 접속권 논란이 기억 클라우드 홍보 효과를 낳아 사회 갈등이 완화되고, 제노스 채굴에 투입할 AI 로봇과 무선 에너지 전송 위성이 마지막에 등장한다고 봄."],
        ["■ → ▲ → ● → ◆", "창간호의 매장량 우려로 위성을 먼저 개발했고, 위성 제작에 쓴 막대한 자원이 고갈을 앞당겨 ● 기사로 이어졌으며, AI 로봇과의 친밀감이 접속권 논란으로 이어졌다고 봄."],
      ];
      return `<p class="small">내 순서: <b class="num">${esc(mine)}</b></p>
        <p class="small muted" style="margin:4px 0 8px">보고서의 예시 답안 세 개는 순서가 모두 다릅니다. 모두 창간호(■)를 처음에 두었고, 그 뒤의 인과 사슬을 서로 다르게 엮었습니다.</p>
        ${ex.map(([o, t], i) => `<details class="reveal"><summary>예시 답안 ${i + 1} · <span class="num">${o}</span> <span class="tag-official">보고서 요약</span></summary><p class="small">${esc(t)}</p></details>`).join("")}
        <details class="reveal"><summary>더 따져 볼 지점 <span class="tag-mine">비공식 해설</span></summary>
          <ul class="small" style="margin:0;padding-left:1.1em">
            <li>◆ 기사는 기억 클라우드를 막 출시된 서비스로 소개합니다. ● 기사는 기억 클라우드를 오래된 문화로 서술합니다. 문장 그대로 읽으면 ◆가 ●보다 앞설 수 있습니다. 세 예시 답안은 모두 ●를 ◆보다 앞에 두었습니다. 다른 근거가 이 단서를 이기는지 설명할 수 있다면 좋은 답입니다.</li>
            <li>▲ 기사의 AI 로봇은 '감정을 이해하는 단계'에 이르렀고, ● 기사는 '인격체로 대우하자'는 논쟁을 다룹니다. 기술 수준이 올라간 뒤에 권리 논쟁이 생긴다는 흐름으로 ▲ → ●를 주장할 수 있습니다.</li>
            <li>창간호 그래프에서 로봇 수는 200년 이후 급증하고, 삶의 만족도는 200년 무렵 가장 낮습니다. 신문들이 300년 전후의 짧은 기간에 몰려 있다고 가정할 수도, 긴 시간에 흩어져 있다고 가정할 수도 있습니다.</li>
            <li>네 신문의 제호가 모두 KENTESIA TIMES이므로, 창간호(■)가 가장 먼저라는 판단은 자료에서 곧바로 나오는 가장 단단한 근거입니다. 나머지 세 부의 순서가 해석의 영역입니다.</li>
          </ul></details>`;
    },
  };
})();
