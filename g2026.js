/* 2026학년도: 최우수 혁신기술 선정평가 */
(function () {
  const KCP = window.KCP;
  const esc = KCP.esc;

  const CRIT = [
    { k: "f", n: "기능/효과", d: "기술의 성능 및 문제 해결 효과" },
    { k: "s", n: "안전성", d: "부작용·오작동·사고 관련 기술 신뢰도" },
    { k: "e", n: "사회/윤리", d: "기술 이용의 윤리적 측면과 사회적 파급 효과" },
    { k: "g", n: "환경/에너지", d: "에너지·자원 활용 효율, 오염·폐기물 배출 및 장기적 환경 영향" },
    { k: "u", n: "사용자 경험", d: "사용 편의성·접근성, 일상 이용에 대한 만족도" },
  ];
  const TECH = [
    { id: "bb", name: "브레인부스트 듀오" },
    { id: "db", name: "드림밴드" },
    { id: "ml", name: "AI 마음렌즈" },
    { id: "wc", name: "울버린 켄텍카솔" },
  ];
  const nameOf = (id) => (TECH.find((t) => t.id === id) || {}).name || "";

  // stars: true면 별 5개, 숫자면 그 개수만 채운다(마음렌즈 Kiho 후기는 원본에 ★★★★☆).
  const review = (by, meta, head, body, stars) =>
    `<div class="review"><div class="by"><span>${esc(by)}</span><span>${esc(meta)}</span></div>
     ${stars ? `<div class="stars" aria-label="별점 ${stars === true ? 5 : stars}점">${"★".repeat(stars === true ? 5 : stars)}${"☆".repeat(stars === true ? 0 : 5 - stars)}</div>` : ""}
     ${head ? `<div class="head">${esc(head)}</div>` : ""}<div>${esc(body)}</div></div>`;

  const BRO = {
    bb: () => `
      <div class="bro-head b1">
        <div class="kick">집중력과 사고력을 올려 주는 뇌 보조 기술</div>
        <h4>브레인부스트 듀오</h4>
        <p><b>당신이 원하는 순간, 두뇌의 잠재력을 최대로 이끌어냅니다.</b></p>
        <p>브레인부스트 듀오는 중요한 업무, 학습, 창의적 활동 상황에서 집중력과 사고력을 일정 시간 높이도록 설계된 차세대 인지 강화 기술입니다. 머리에 착용하는 웨어러블 디바이스와 경구용 캡슐을 함께 사용해 두뇌의 집중 상태를 정밀하게 조절합니다.</p>
      </div>
      <div class="bro-grid">
        <div class="bro-sec"><h5>핵심 요소</h5><p class="small">브레인부스트 듀오는 두 가지 핵심 요소가 함께 작동하여 인지향상을 유도합니다.</p><ul>
          <li><b>브레인튜너(상태 조율)</b>: 사용자의 뇌파와 생체신호를 감지해 필요한 전기 자극을 미세하게 조절하는 장치로, 집중 상태에 빠르게 들어가도록 돕는 역할을 합니다.</li>
          <li><b>싱크업캡슐(에너지 증강)</b>: 뇌의 에너지 대사와 기억 형성 과정을 일시적으로 강화하는 보조제로, 주의 집중 능력과 정보 처리 효율을 일정 시간 높여 줍니다.</li></ul></div>
        <div class="bro-sec"><h5>핵심효과 및 기능</h5><ul>
          <li><b>평균 28.8% 인지능력 개선</b>: 임상시험을 통해 입증된 집중력, 기억력, 문제해결 능력의 유의미한 향상</li>
          <li><b>2가지 스마트 모드</b>: 집중모드(학습 및 업무 몰입도 극대화), 창의모드(아이디어 발상 및 유연한 사고 지원)</li>
          <li><b>빠른 효과 발현</b>: 사용 후 30분 내 효과 시작, 최대 4시간 지속</li></ul></div>
      </div>
      <div class="bro-sec"><h5>주요 응용 분야</h5><p class="small">최고의 퍼포먼스가 필요한 다양한 상황에서 활용할 수 있습니다.</p><ul>
        <li><b>교육·연구</b>: 시험 준비, 논문 작성 등 고도의 집중과 기억력이 필요한 학습자 및 연구원</li>
        <li><b>고위험 업무</b>: 수술, 항공 관제 등 실수가 치명적인 분야의 전문가</li>
        <li><b>의료재활</b>: 인지장애 및 집중력 저하 환자를 위한 보조 수단</li>
        <li><b>일반 사무 및 창작</b>: 중요한 프레젠테이션, 보고서 작성, 창의적 프로젝트 수행 시</li></ul></div>
      <div class="label">2쪽 · 데이터로 증명된 효과와 신뢰성</div>
      <div class="bro-grid">
        <div class="bro-sec"><h5>임상시험 기반 인지능력 향상 분석 (n=1000)</h5>
          ${KCP.hbar(
            [
              { label: "문제해결", v: 32.3 },
              { label: "주의력", v: 31.8 },
              { label: "집중력", v: 30.8 },
              { label: "기억력", v: 25.7 },
              { label: "처리속도", v: 23.5 },
            ],
            { max: 40, unit: "%", ticks: [0, 10, 20, 30, 40], w: 360, labelW: 64, aria: "인지능력 향상률" }
          )}
          <p class="hint">*각 항목 별 100점 만점 기준, 사용 전후 점수 변화율</p></div>
        <div class="bro-sec"><h5>에너지 사용량</h5>
          <table class="spec"><thead><tr><th>기기</th><th>평균 전력 소모</th></tr></thead><tbody>
          <tr><td>스마트워치</td><td class="num">0.5~1W</td></tr><tr><td>브레인튜너</td><td class="num">1~2W</td></tr>
          <tr><td>스마트폰</td><td class="num">3~6W</td></tr><tr><td>노트북</td><td class="num">15~45W</td></tr></tbody></table></div>
      </div>
      <div class="bro-grid">
        <div class="bro-sec"><h5>특징</h5><ul>
          <li><b>브레인튜너(웨어러블)</b>: 측정센서(뇌파 센서, 심장박동 센서, 안구 움직임 센서), 자극방식(저강도 전기자극), 배터리(8시간 사용 가능, 1회 최대 4시간 사용)</li>
          <li><b>싱크업캡슐(경구복용)</b>: 구성(1주 사용분, 7정), 효과지속(복용 후 30분~4시간), 핵심기능(주의 집중력과 기억력을 일시적으로 향상)</li></ul></div>
        <div class="bro-sec"><h5>안전성 프로필 및 주의사항</h5>
          ${KCP.hbar(
            [
              { label: "부작용 없음", v: 89 },
              { label: "경미한 두통·어지러움", v: 7 },
              { label: "사용 후 멍한 느낌", v: 4 },
            ],
            { max: 100, unit: "%", w: 360, labelW: 124, ticks: [0, 50, 100], aria: "안전성 프로필" }
          )}
          <p class="hint">*보고된 증상은 모두 24시간 내 자연 소실</p></div>
      </div>
      <div class="caution"><b>사용 전 확인하세요</b><br>본 제품은 단기적 인지 능력 보조를 위해 설계되었습니다. 장기사용 시 자체 능력 개발보다 시스템에 의존할 가능성이 있으므로, 필요한 상황에만 사용하는 것을 권장합니다. 장기 반복 사용에 대한 안전성은 연구가 진행 중입니다.</div>
      <div class="bro-sec"><h5>생생한 사용자 후기</h5><div class="reviews">
        ${review("정OO (수험생)", "사용목적 - 학습", "", "공무원 시험 준비 중인데 암기력과 집중력이 동시에 향상되어 학습 효율이 크게 올라갔습니다. 인생템이에요.")}
        ${review("이OO (연구원)", "사용목적 - 연구", "", "논문 쓸 때 아이디어가 잘 떠오르고 논리적 사고가 향상되는 느낌입니다. 부작용도 거의 없어서 만족합니다.")}
        ${review("박OO (의사)", "사용목적 - 고위험업무", "", "수술 전 사용하니 집중도가 높아져 실수 없이 마칠 수 있었습니다. 다만 사용 후 약간의 피로감이 있네요.")}
        ${review("김OO (회사원)", "사용목적 - 업무집중", "", "효과를 고려했을 때 가격도 과하지 않아서, 정말 필요한 날에 선택적으로 사용할 수 있는 점이 마음에 들었습니다.")}
      </div></div>`,

    db: () => `
      <div class="bro-head b2">
        <div class="kick">* 일회용 제품입니다.</div>
        <h4>드림밴드 DREAMBAND</h4>
        <p><b>이제 당신이 원하는 꿈을 꿀 수 있습니다. 꿈을 통해 꿈을 이루세요!</b></p>
      </div>
      <div class="bro-sec"><h5>드림밴드를 사용하면?</h5><ul>
        <li>잠들기 전, 원하는 꿈을 직접 설계할 수 있어요.</li>
        <li>꿈을 통해 불안한 감정을 치유하고 자존감을 회복할 수 있어요.</li>
        <li>주요 기능: <b>추억여행</b> · <b>꿈 실현</b> · <b>함께 꿈꾸기</b></li></ul></div>
      <div class="bro-sec"><h5>꿈 시간 확장 기술</h5><p class="small">드림밴드는 사용자의 감각·인지 신호 처리를 정교하게 조율해 현실의 시간 흐름과 꿈 속 시간의 체감 속도를 다르게 만들 수 있어요. 이 기술 덕분에 실제로는 짧게 자더라도 꿈 속에서는 훨씬 긴 시간이 흘러가는 것처럼 느끼게 되어요. 사용자는 원하는 길이의 '확장된 꿈 시간'을 직접 선택해, 깊고 풍부한 경험을 체험할 수 있어요.</p></div>
      <div class="label">2쪽 · 드림밴드 기술 개요</div>
      <p class="small">드림밴드는 사용자가 원하는 꿈을 직접 설계하고 체험할 수 있도록 돕는 꿈 설계 장치입니다. 사용자가 잠들면 내부의 꿈 생성 알고리즘이 작동하여, 원하는 상황·시대·인물을 자유롭게 구성한 꿈을 경험하도록 지원합니다. 신체 어디에나 부착할 수 있는 접착식 밴드형 제품이므로 안전하게 사용할 수 있습니다.</p>
      <p class="small"><b>드림밴드 효과 과학적으로 검증 완료</b></p>
      <div class="bro-grid">
        <div class="bro-sec"><h5>드림밴드 감정 효과 비교 <span class="hint">(감정·체험 지표)</span></h5>
          ${KCP.hbar(
            [
              { label: "분노·억울함 완화", v2: 49, v: 92 },
              { label: "정서 안정감", v2: 53, v: 97 },
              { label: "자존감 회복", v2: 14, v: 92 },
              { label: "마음정리 만족도", v2: null, v: 97 },
              { label: "꿈 선택 자율성 만족도", v2: null, v: 97 },
              { label: "스트레스 완화·휴식감", v2: 49, v: 60 },
            ],
            { max: 100, v2: true, w: 380, labelW: 132, c1: "#3f56b8", c2: "var(--ink-3)", ticks: [0, 20, 40, 60, 80, 100], aria: "감정 효과 비교" }
          )}
          <div class="legend small"><span><i style="background:var(--ink-3)"></i>기존수면</span><span><i style="background:#3f56b8"></i>드림밴드 사용</span></div></div>
        <div class="bro-sec"><h5>꿈 공유 모드 효과 분석</h5>${radar()}</div>
      </div>
      <p class="hint">그래프 값은 원자료 그림을 눈금에 맞춰 근사한 값입니다.</p>
      <div class="reviews">
        ${review("꿈비서**", "★★★★★", "“스트레스 정리가 이렇게 부드럽게 되는 기기가 있을 줄 몰랐어요.”", "드림밴드의 '원하는 꿈 선택' 기능은 생각보다 훨씬 실용적입니다. 하루 동안 쌓인 스트레스를 어떤 방식으로 풀고 싶은지 선택해두면, 그 분위기가 꿈 속에서 자연스럽게 이어져 감정이 스르르 정돈됩니다. 아침에 일어나면 머리도 가볍고, 하루가 훨씬 매끄럽게 시작돼요. 이 기능 하나만으로도 충분히 값어치를 합니다.")}
        ${review("꿈톡방**", "★★★★★", "“친구랑 같이 꾸는 꿈... 이건 진짜 해보면 말이 안 나옵니다.”", "드림밴드의 '꿈 링크' 공유 기능은 다른 말이 필요 없습니다. 꿈이라고 하면 보통 혼자만의 공간이라 생각하잖아요? 그런데 드림밴드 사용하는 친구들이 제 꿈 안에 들어와 함께 여행하고, 같이 움직이고, 심지어 프로젝트도 진행할 수 있다는 게... 말 그대로 신세계였습니다. 현실에서는 스케줄 맞추기 어려웠던 친구들과 꿈에서는 언제든 만나서 놀 수 있다는 점이 최대 장점입니다!")}
        ${review("감정장인**", "★★★★★", "“제 감정을 이렇게 정확하게 정리해주는 도구는 처음 봤습니다.”", "개인적으로 가장 많이 도움 받은 기능은 AI 감정·대화 정리였습니다. 꿈에서 떠올랐던 생각이나 나눴던 대화가 아침에 깔끔한 메시지로 정리돼 도착합니다. 그걸 읽어보면 '아 내가 이런 걸 신경 쓰고 있었구나' 하고 감정 흐름이 또렷하게 잡혀요. 덕분에 인간관계나 고민들을 한 단계 떨어져서 바라보게 되었고 제가 어떤 패턴으로 감정이 흔들리는지 이해하는 데 큰 도움이 됐습니다.")}
        ${review("꿈에서도**", "★★★★★", "“꿈에서 보낸 이메일이 현실에서 도착하는 순간, 솔직히 소름 돋았습니다.”", "드림밴드의 꿈-현실 연동 기능은 생산성 측면에서 말 그대로 압도적입니다. 꿈 속에서 정리해둔 아이디어가 현실 메모로 자동 저장되고, 꿈에서 작성한 메시지가 이메일로 실제 발송된 걸 확인했을 때는 아... 이제 진짜 미래가 왔구나라는 생각이 들더군요. 업무 처리도 빨라지고, 창작 아이디어도 놓치지 않아서 요즘은 이 기능을 가장 자주 사용합니다.")}
      </div>`,

    ml: () => `
      <div class="bro-head b3">
        <div class="kick">알고 싶어 너의 생각!</div>
        <h4>감정을 읽어주는 AI 마음 렌즈</h4>
        <p>상대방의 의도와 감정상태 등을 실시간으로 분석하여 알려주는 궁극의 <b>'인간 이해 증강 장치'</b></p>
      </div>
      <ol class="small" style="margin:0;padding-left:1.3em">
        <li>초소형 렌즈 내부에 탑재된 AI가 미세 표정, 호흡의 깊이와 리듬, 발성 패턴, 안구 움직임 등 <b>인간의 미세 신호를 실시간 통합 분석</b></li>
        <li>인간의 '마음 이론' 개념을 구현한 AI 엔진을 통해 <b>감정-의도-심리 상태를 즉시 시각화</b></li>
        <li>고급 옵션으로 사용자의 <b>신경에 직접 연결</b>하여 별도의 렌즈 착용 없이 <b>체내 장착 가능!</b> <span class="hint">*외관상으로 마음 렌즈 사용 여부 확인 불가</span></li>
      </ol>
      <div class="label">2쪽 · AI 마음 엔진으로 학습과 추론을 동시에!</div>
      <div class="bro-grid">
        <div class="bro-sec"><h5>눈 깜박임으로 미세 충전!</h5><p class="small"><b>하루 16시간 사용시, 최대 30일 사용 가능</b><br><span class="hint">*전용 렌즈통(별매품) 구매시 무선 충전 및 재사용 가능</span></p></div>
        <div class="bro-sec"><h5>렌즈를 착용하면 시야 위에 투명하게 다음 정보를 출력하여 제공합니다</h5><ul>
          <li>상대 발언의 진실도 추정</li><li>표정 분석 기반 감정 추론</li><li>발화 의도 분석</li>
          <li>현재 발언의 확신도 지표</li><li>호흡 기반 스트레스 시각화</li><li>대화 집중도 추정</li></ul>
          <p class="hint">*프리미엄 사용자는 추후 기능 업데이트 가능</p></div>
      </div>
      <div class="bro-sec"><h5>AI 마음렌즈 연속 사용시 성능 변화 <span class="hint">일상용으로 충분한 성능(8시간 이내)</span></h5>
        ${KCP.vbar(
          ["4시간", "5시간", "6시간", "7시간", "8시간", "9시간", "10시간", "11시간", "12시간"],
          [{ name: "예측 정확도(%)", color: "#4fb6d8", data: [89, 88, 87, 86, 80, 60, 40, 30, 25] }],
          { max: 100, err: [2, 2, 2, 3, 3, 5, 6, 12, 9], ylabel: "예측 정확도(%)", aria: "연속 사용 시간별 예측 정확도" }
        )}
        <p class="hint">그래프 값은 원자료 그림을 눈금에 맞춰 근사한 값입니다. 원 그림의 오차 막대는 8·11·12시간에서 위아래 길이가 다릅니다(아래 끝: 8시간 약 76%, 11시간 약 22%, 12시간 약 10%). 여기서는 위쪽 길이로 막대를 그렸습니다.</p></div>
      <div class="bro-sec"><h5>사용자 극찬 리뷰</h5><div class="reviews">
        ${review("Seunghyun**", "30일전 구매", "", "직장에서 상사를 대할 때 자신감이 생겼습니다. 눈치 없다는 말을 자주 들었는데, 이제 혼자 다른 이야기 하는 걱정은 없어요. 직장생활 필수품, 추천합니다!", true)}
        ${review("Kiho**", "35일전 구매", "", "마음 렌즈 덕분에 데이트는 이제 성공 100%입니다. 상대가 무엇을 원하는지 아는데 큰 도움이 됩니다. 구독 서비스가 비싸고 대리점에 방문해야만 구매할 수 있는게 불편해서 별하나 뺐어요.", 4)}
        ${review("Hynkim**", "950일전 구매", "", "마음 렌즈 없던 때와 지금은 너무 달라요. 렌즈가 판정해주는 대로 생각하면 인간관계 개선에 큰 도움이 됩니다. 마음 렌즈 없는 삶은 상상할 수 없어요!", true)}
      </div></div>`,

    wc: () => `
      <div class="bro-head b4">
        <div class="kick">의사협회가 인정한 올해 최고의 발명품!! · KEN-BIO</div>
        <h4>울버린 켄텍카솔</h4>
      </div>
      <div class="bro-grid">
        <div class="bro-sec"><h5>초고속 피부 재생 연고</h5><p class="small">피부재생 능력을 <b>최대 5배까지</b> 끌어올릴 수 있는 연고 출시!<br>수술 후 이틀이면 깨끗!<br><b>이제 기다리지 말고, 아파하지 말고 바로 바르세요!</b></p></div>
        <div class="bro-sec"><h5>임상실험을 통해 검증</h5><p class="small">특수하게 개발된 <b>피부 재생 효소</b>가 환부에 직접 작용!<br>특허받은 <b>세포 분열 가속기술</b>로 피부는 물론 내장기관도 치료가능!<br>수천 명의 임상실험을 통해 확인된 놀라운 <b>피부 재생 효과!</b></p></div>
      </div>
      <div class="caution"><b>주의사항</b><ul style="margin:4px 0 0;padding-left:1.1em">
        <li>[의·약사 상담] 의약품 복용 전에는 반드시 의사 또는 약사와 상의해야 합니다.</li>
        <li>[용량 및 투여] 의약품의 용량 및 투여 경로는 개인의 연령, 체중, 성별, 유전적 요소 등에 따라 영향을 받으므로, 의사의 지시에 따라 안전하게 복용해야 합니다.</li>
        <li>[약물상호작용] 다른 질병의 약을 함께 사용하면 약물상호작용이 발생할 수 있으므로, 복용 중인 약에 대해 반드시 의료 전문가에게 알려야 합니다.</li>
        <li>[보관시 유의사항] 2~10℃ 냉장보관이 반드시 필요합니다.</li></ul></div>
      <div class="label">2쪽 · 전 세계 어디에서나 검증된 KENT-06V의 세포 재생 효능!</div>
      <div class="bro-sec"><p class="small">Before → 도포 → After (상처 단면 그림)</p>
        ${KCP.lines(
          [0, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300],
          [
            { name: "울버린 켄텍카솔", color: "#1596a0", data: [0, 60, 94, 101, 104, 106, 108, 110, 112, 114, 115, 117, 119] },
            { name: "기존연고", color: "#9ccc3a", data: [3, 5, 7, 12, 23, 40, 62, 82, 92, 97, 100, 100, 100] },
          ],
          { min: 0, max: 120, ticks: [0, 20, 40, 60, 80, 100, 120], xticks: [0, 50, 100, 150, 200, 250, 300], hline: 100, xlabel: "시간 → 상처 재생 효과", ylabel: "재생률(%)", aria: "시간에 따른 재생률" }
        )}
        <p class="hint">빨간 선은 재생률 100%. 곡선은 원자료 그림을 근사했습니다. 가로축 '시간'에는 단위가 적혀 있지 않습니다.</p></div>
      <p class="small"><b>병원, 주방, 경기장, ... 위험이 있는 곳엔 언제나 울버린 켄텍카솔</b><br>상처치료는 물론 화상치료, 염증치료, 동물치료, 노화개선 효과까지! 솔직 후기에서 확인할 수 있는 입증된 효과! 효능!!</p>
      <div class="reviews">
        ${review("dyfigksmsehfkdl***", "86일전 구매", "", "얼마전 광고에서 보고 구매해서 구급함에 넣어 두었다가 남편이 칼에 베인 상처에 발라줬습니다. 정말 다음날 다 아문 것을 보고 너무 신기했어요. 또 구매하러 갑니다.", true)}
        ${review("ekqkffk***", "89일전 구매", "", "사용법에 나와있는 대로 상처를 요오드, 알코올 솜으로 최대한 소독하고 바로 발라 줬습니다. 진짜 효과 미쳤습니다!!", true)}
        ${review("BornToK***", "91일전 구매", "", "상처가 이제 하루이틀이면 싹 나아서 굳이 병원 갈 필요도 없어요. 일주일씩 기다렸다 제거할 실밥을 이틀만에 제거하니 제 기분도 좋아집니다. 이제 수술도 무섭지 않아요.", true)}
      </div>`,
  };

  function radar() {
    // 원 그림: 동심원 눈금 40(중심)~100, 10 간격. 첫 축(대화·소통)은 위에서 시계 방향 18°에서 시작한다.
    const axes = [
      ["대화·소통 만족도", 87],
      ["정서 동기화", 96],
      ["재구매 의향", 90],
      ["개인정보유출 위험도", 61],
      ["공동 활동 몰입도", 90],
    ];
    const cx = 200, cy = 122, R = 80, min = 40, max = 100;
    const pt = (i, v) => {
      const a = -Math.PI / 2 + Math.PI / 10 + (i * 2 * Math.PI) / axes.length;
      const r = ((v - min) / (max - min)) * R;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    let g = "";
    [50, 60, 70, 80, 90, 100].forEach((lv) => {
      g += `<circle cx="${cx}" cy="${cy}" r="${((lv - min) / (max - min)) * R}" fill="none" class="grid"/>`;
    });
    axes.forEach(([n], i) => {
      const [x, y] = pt(i, 100);
      const [lx, ly] = pt(i, 118);
      g += `<line class="grid" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`;
      g += `<text x="${lx}" y="${ly + 4}" text-anchor="${lx < cx - 5 ? "end" : lx > cx + 5 ? "start" : "middle"}">${esc(n)}</text>`;
    });
    const poly = axes.map(([, v], i) => pt(i, v).join(",")).join(" ");
    g += `<polygon points="${poly}" fill="#3f56b8" fill-opacity="0.55" stroke="#3f56b8" stroke-width="2"/>`;
    [40, 60, 80, 100].forEach((lv) => {
      g += `<text x="${pt(1, lv)[0]}" y="${cy + 12}" text-anchor="middle">${lv}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 400 250" role="img" aria-label="꿈 공유 모드 효과 분석 방사형 그래프">${g}</svg>`;
  }

  const CLUES = {
    bb: [
      "'필요한 상황에만 사용'을 권하면서 캡슐은 1주 사용분 7정으로 판매한다. 매일 복용을 전제로 한 구성이다.",
      "배터리는 8시간 사용 가능하지만 1회 최대 4시간 사용으로 제한한다. 제한 이유가 설명되지 않는다.",
      "뇌에 전기 자극을 주고 약을 먹는 두 방식이 결합되어 있다. 장기 반복 사용 안전성은 '연구 중'이다.",
      "n=1000 사용 전후 비교만 있고 대조군이 없다. 연습 효과나 위약 효과를 걸러냈는지 알 수 없다.",
      "수술·항공 관제 같은 고위험 업무에 권하지만, 사용 후 피로감·멍한 느낌이 보고되었다. 효과가 끝나는 4시간 뒤의 상태가 문제다.",
      "시험 준비생이 쓰면 공정성 문제, 살 수 있는 사람과 없는 사람 사이의 인지 격차 문제가 생긴다.",
      "브레인튜너 전력(1~2W)은 스마트워치(0.5~1W)보다 크다. 전력만 보면 스마트폰보다는 작다.",
    ],
    db: [
      "표지에 '일회용 제품'이라고 적혀 있다. 매일 쓰면 폐기물과 비용이 쌓인다.",
      "방사형 그래프에 긍정 지표들과 함께 '개인정보유출 위험도'가 들어 있다. 눈금이 40에서 시작해 약 60인 위험도가 작게 보이지만, 위험이 없다는 뜻은 아니다.",
      "꿈에서 쓴 메시지가 실제 이메일로 발송된다. 의식이 없는 상태의 행동이 현실 결과를 만든다.",
      "'꿈 링크'로 친구가 내 꿈에 들어온다. 동의, 사생활, 원치 않는 침입의 문제가 있다.",
      "스트레스 완화·휴식감은 49에서 60으로 가장 적게 오른다. 꿈 시간을 늘리면 실제 수면의 질이 떨어질 수 있다.",
      "기존 수면 막대가 없는 항목(마음정리 만족도, 꿈 선택 자율성)은 비교 대상이 없는 수치다.",
      "원하는 꿈만 꾸는 삶에 대한 의존, 현실 도피 가능성이 있다.",
    ],
    ml: [
      "'하루 16시간 사용시'를 광고하지만 그래프는 9시간부터 정확도가 60%, 12시간에는 25%로 떨어진다.",
      "긴 사용 시간일수록 오차막대가 커진다. 판정의 신뢰도가 낮아진다.",
      "체내 장착형은 외관상 사용 여부를 알 수 없다. 상대는 동의 없이 감정과 진실도를 분석당한다.",
      "'진실도 추정'이 틀리면 거짓말쟁이로 오판된다. 확률 정보를 사실로 받아들이는 위험이 있다.",
      "하루 16시간 기준 최대 30일 쓰고, 다시 쓰려면 별매 렌즈통이 필요한데 '950일전 구매' 후기가 있다. 별매품, 구독 서비스, 대리점 방문 구매로 이어지는 비용 구조가 드러난다.",
      "후기란 제목이 '사용자 극찬 리뷰'다. 별 4개 후기도 감점 이유는 성능이 아니라 구독료와 대리점 구매의 불편이다. 고른 후기만 실었을 수 있다.",
      "'렌즈가 판정해주는 대로 생각하면'이라는 후기는 판단을 기계에 맡기는 의존을 보여 준다.",
    ],
    wc: [
      "바르는 연고인데 주의사항은 '복용', '투여 경로'를 말한다. 다른 약의 문구를 옮긴 것으로 보인다.",
      "2~10℃ 냉장보관이 필수인데 후기에서는 구급함에 보관했다.",
      "재생률 곡선이 100%를 넘어 계속 오른다. 세포 분열 가속이 멈추지 않으면 과증식, 흉터, 종양 위험을 떠올릴 수 있다.",
      "그래프 가로축 '시간'에 단위가 없어 '수술 후 이틀이면 깨끗'과 맞춰 볼 수 없다. 재생률 90%에 이르는 시간은 켄텍카솔 약 45, 기존연고 약 195로 4배 남짓이다. '최대 5배'가 무엇의 5배인지 자료로 확인되지 않는다.",
      "'의사협회'가 어느 단체인지 밝히지 않는다. 피부 연고가 내장기관도 치료한다는 주장에는 근거가 제시되지 않는다.",
      "'굳이 병원 갈 필요도 없어요'라는 후기는 감염이나 깊은 상처의 진단을 놓칠 위험을 보여 준다.",
      "구매 후기가 86·89·91일 전으로 몰려 있다.",
    ],
  };

  const EXAMPLES = [
    { pick: "wc", s: { bb: [2, 2, 4, 5, 4], db: [1, 5, 4, 5, 1], ml: [3, 4, 1, 3, 1], wc: [5, 2, 5, 2, 5] }, gist: "현실에서 가장 필요하고, 최신 기술에 익숙하지 않은 사람도 쉽게 쓸 수 있다. 부작용이 불명확해 안전성은 낮게 주었다." },
    { pick: "bb", s: { bb: [5, 4, 4, 5, 5], db: [3, 2, 3, 4, 4], ml: [4, 4, 4, 4, 5], wc: [4, 4, 3, 5, 5] }, gist: "정량 데이터가 있고 적용 범위가 넓다. 고위험 직군의 실수를 줄이고, ADHD 학생·고령층의 격차를 줄이는 보정 장치가 될 수 있다." },
    { pick: "db", s: { bb: [4, 2, 4, 4, 3], db: [5, 5, 4, 4, 4], ml: [4, 3, 4, 4, 4], wc: [4, 3, 4, 4, 4] }, gist: "현실 기술이 줄 수 없는 새로운 경험의 차원을 연다. 꿈 기반 활동이 이동과 자원 소비를 대체해 에너지를 줄일 수 있다.", note: "보고서 표에는 AI 마음렌즈 합계가 21로 적혀 있지만 항목 점수(4·3·4·4·4)를 더하면 19입니다. *는 항목 점수로 다시 계산한 합계입니다." },
    { pick: "ml", s: { bb: [4, 2, 4, 5, 3], db: [5, 2, 3, 4, 5], ml: [5, 4, 4, 4, 5], wc: [4, 3, 3, 4, 5] }, gist: "오해에서 생기는 갈등을 구조적으로 줄인다. 물리적 안전성은 높지만 감정 데이터 유출에는 강력한 제도적 장치가 필요하다고 구분했다." },
  ];

  function g(state) {
    state.game = Object.assign({ tab: "bb", scores: {}, best: "", reason: "", notes: {} }, state.game || {});
    return state.game;
  }
  const total = (sc) => (sc ? CRIT.reduce((a, c) => a + (Number(sc[c.k]) || 0), 0) : 0);

  KCP.games["2026"] = {
    brief() {
      return `<div class="scenario">
          <p class="label">문제 상황</p>
          <p>당신은 혁신기술을 선정하는 평가위원으로서, 네 가지 후보 기술 중에 최우수 기술 하나를 추천해야 한다. 평가위원회로부터 평가에 활용할 평가표와 기업들이 제출한 후보기술의 홍보자료를 제공 받았다.</p>
          <p class="rules">아래 원칙을 준수하는 범위에서 창의적이고 자유롭게 지문을 해석할 수 있다.</p>
          <ul class="rules">
            <li>홍보자료에 직접 기술되지 않은 내용도 합리적인 수준에서 가정할 수 있다.</li>
            <li>각 기술을 활용했을 때 현실에서 발생할 수 있는 다양한 상황·사건을 가정할 수 있다.</li>
            <li>일반적인 상식과 과학적 사실에 근거한 유추는 허용되며, 이를 바탕으로 자신의 논리를 확장할 수 있다.</li>
          </ul>
        </div>
        <div class="task"><b>문제</b><ol><li>네 가지 후보 기술에 대하여 평가표를 작성하시오.</li><li>최우수 기술 하나를 추천하고 그 이유를 논리적으로 설명하시오.</li></ol></div>`;
    },

    renderPrep(root, state, save, next) {
      const G = g(state);
      root.innerHTML = `
        <div class="desk">
          <div class="stack">
            <section class="panel">
              <h3>후보 기술 홍보자료 <span class="chip">각 2장 · 기술 간 연관성 없음</span></h3>
              <div class="tabs" role="tablist">
                ${TECH.map((t, i) => `<button role="tab" data-tab="${t.id}" aria-selected="${G.tab === t.id}">${i + 1}. ${esc(t.name)}</button>`).join("")}
                <button role="tab" data-tab="crit" aria-selected="${G.tab === "crit"}">평가 기준표</button>
              </div>
              <div class="brochure" id="bro"></div>
            </section>
          </div>
          <div class="stack">
            <section class="panel">
              <h3>1. 평가표 <span class="chip">1점 매우 부정적 ↔ 5점 매우 긍정적</span></h3>
              <div class="table-wrap"><table class="scoretable" id="score"></table></div>
              <p class="hint" style="margin-top:6px">면접관은 평가표 점수를 보고 질문을 이어 갑니다. 점수마다 자료의 근거를 하나씩 떠올려 두세요.</p>
            </section>
            <section class="panel">
              <h3>숨은 영향 찾기</h3>
              <p class="small muted" style="margin-bottom:8px">홍보 문구 뒤에 숨은 부정적 영향이나 광고 내용과 서로 맞지 않는 부분을 기술별로 적습니다.</p>
              <div class="stack">${TECH.map(
                (t) => `<div class="field"><label for="note-${t.id}">${esc(t.name)}</label>
                  <textarea class="note" id="note-${t.id}" data-note="${t.id}" style="min-height:52px" placeholder="예: 광고 문구와 그래프가 서로 다른 말을 하는 곳">${esc(G.notes[t.id] || "")}</textarea></div>`
              ).join("")}</div>
            </section>
            <section class="panel">
              <h3>2. 최우수 기술 추천</h3>
              <div class="pick" id="pick">${TECH.map((t) => `<button data-pick="${t.id}" aria-pressed="${G.best === t.id}">${esc(t.name)}<br><span class="small muted num" data-tot="${t.id}"></span></button>`).join("")}</div>
              <div class="field" style="margin-top:10px">
                <label for="reason26">추천 이유</label>
                <textarea class="note" id="reason26" style="min-height:140px" placeholder="① 내가 가장 무겁게 본 기준 ② 자료의 수치·문장 근거 ③ 다른 후보와의 비교 ④ 이 기술의 한계와 보완책">${esc(G.reason)}</textarea>
                <span class="hint">예시 답안 네 개는 서로 다른 기술을 골랐습니다. 무엇을 고르느냐보다 근거를 어떻게 세우느냐가 평가 대상입니다.</span>
              </div>
            </section>
            ${KCP.memoPanel(state, save, "memo26")}
            <div class="row"><span class="spacer"></span><button class="btn primary" id="go26">면접실로 이동</button></div>
          </div>
        </div>`;

      const bro = KCP.$("#bro", root);
      const paintBro = () => {
        KCP.$$("[data-tab]", root).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === G.tab)));
        if (G.tab === "crit") {
          bro.innerHTML = `<p class="small">네 가지 최종 후보 기술을 아래의 다섯 가지 항목에 따라 1~5점으로 평가하시오.</p>
            <table class="spec"><thead><tr><th>번호</th><th>평가 항목</th><th>의미·설명</th></tr></thead><tbody>
            ${CRIT.map((c, i) => `<tr><td class="num">${i + 1}</td><td><b>${c.n}</b></td><td>${c.d}</td></tr>`).join("")}</tbody></table>`;
        } else bro.innerHTML = BRO[G.tab]();
      };
      KCP.$$("[data-tab]", root).forEach((b) => (b.onclick = () => { G.tab = b.dataset.tab; save(); paintBro(); }));
      paintBro();

      const table = KCP.$("#score", root);
      const paintScore = () => {
        const totals = TECH.map((t) => total(G.scores[t.id]));
        const max = Math.max(...totals);
        table.innerHTML = `<thead><tr><th>기술명</th>${CRIT.map((c) => `<th title="${esc(c.d)}">${c.n}</th>`).join("")}<th>합계</th></tr></thead>
          <tbody>${TECH.map((t, i) => {
            const sc = G.scores[t.id] || {};
            return `<tr class="${max > 0 && totals[i] === max ? "best" : ""}"><td class="name">${esc(t.name)}</td>${CRIT.map(
              (c) => `<td><select aria-label="${esc(t.name)} ${c.n}" data-t="${t.id}" data-c="${c.k}" id="sc-${t.id}-${c.k}">
                <option value="">-</option>${[1, 2, 3, 4, 5].map((v) => `<option ${Number(sc[c.k]) === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>`
            ).join("")}<td class="total">${totals[i] || "-"}</td></tr>`;
          }).join("")}</tbody>`;
        KCP.$$("select", table).forEach((s) =>
          s.addEventListener("change", () => {
            G.scores[s.dataset.t] = G.scores[s.dataset.t] || {};
            G.scores[s.dataset.t][s.dataset.c] = s.value ? Number(s.value) : "";
            save();
            paintScore();
          })
        );
        TECH.forEach((t, i) => {
          const el = KCP.$(`[data-tot="${t.id}"]`, root);
          if (el) el.textContent = totals[i] ? `합계 ${totals[i]}점` : "미채점";
        });
      };
      paintScore();

      KCP.$$("[data-pick]", root).forEach((b) =>
        (b.onclick = () => {
          G.best = b.dataset.pick;
          KCP.$$("[data-pick]", root).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          save();
        })
      );
      KCP.$("#reason26", root).addEventListener("input", (e) => { G.reason = e.target.value; save(); });
      KCP.$$("[data-note]", root).forEach((t) => t.addEventListener("input", () => { G.notes[t.dataset.note] = t.value; save(); }));
      KCP.$("#go26", root).onclick = next;
    },

    questions(state) {
      const G = g(state);
      const best = nameOf(G.best) || "추천한 기술";
      const ranked = TECH.map((t) => ({ t, v: total(G.scores[t.id]) })).sort((a, b) => b.v - a.v);
      const runner = ranked.find((r) => r.t.id !== G.best);
      let low = null;
      TECH.forEach((t) => CRIT.forEach((c) => {
        const v = Number((G.scores[t.id] || {})[c.k]);
        if (v && (!low || v < low.v)) low = { t, c, v };
      }));
      const bestTotal = total(G.scores[G.best]);
      const topTotal = ranked[0] ? ranked[0].v : 0;
      const qs = [
        { k: "26-q1", src: "report", tag: "문항 1", q: "네 가지 후보 기술에 대한 평가표를 설명해 주세요. 점수를 어떤 기준으로 매겼나요?" },
        { k: "26-q2", src: "report", tag: "문항 2", q: G.best ? `최우수 기술로 ${best}을(를) 추천한 이유를 논리적으로 설명해 주세요.` : "최우수 기술 하나를 추천하고 그 이유를 설명해 주세요." },
      ];
      if (G.best && bestTotal && bestTotal < topTotal)
        qs.push({ k: "26-sum", tag: "문제해결", q: `평가표 합계로는 ${ranked[0].t.name}이(가) ${topTotal}점으로 가장 높은데 ${best}(${bestTotal}점)을 추천했습니다. 합계와 다른 결정을 내린 이유는 무엇인가요?` });
      if (low) qs.push({ k: "26-low", tag: "문제해결", q: `${low.t.name}의 ${low.c.n}에 ${low.v}점을 주었습니다. 홍보자료의 어떤 부분을 근거로 삼았나요?` });
      qs.push({ k: "26-div-hidden", tag: "발산적 사고", q: `${best}의 홍보자료에 직접 적히지 않은 문제점이나 새로운 상황을 하나 가정해 보세요. 그 상황에서도 추천을 유지하나요?`, rec: "보고서의 면접 질문 기준: 직접적으로 제시되지 않은 문제점이나 새로운 상황을 가정하였을 때, 이를 고려하여 유연하게 새로운 해결 방안을 제시하는가" });
      qs.push({ k: "26-math", tag: "수학적 사고", q: "홍보자료의 그래프나 수치 중 가장 믿기 어려운 것은 무엇인가요? 무엇을 더 확인하면 믿을 수 있을까요?" });
      // 추천 기술을 고르지 않았으면 탈락 기술 질문을 내지 않는다. 그래서 이 수정 전에 쓴 옛 기록(answerQ 없음)은 뒤 질문 메모의 순번이 하나 당겨질 수 있다.
      if (runner && G.best) qs.push({ k: "26-runner", tag: "발산적 사고", q: `탈락시킨 ${runner.t.name}을(를) 최우수 기술로 만들려면 무엇을 바꾸어야 할까요?` });
      qs.push({ k: "26-hum-10y", tag: "인문적 통찰", q: `${best}이(가) 10년 뒤 사회 전체에 보급되었다고 가정해 봅시다. 사회 구조와 인간관계는 어떻게 달라질까요?` });
      qs.push({ k: "26-hum-crit", tag: "인문적 통찰", q: "다섯 가지 평가 항목을 같은 무게로 보았나요? 평가위원회에 평가 항목 하나를 추가하자고 제안한다면 무엇을 넣겠습니까?" });
      return qs;
    },

    recap(state) {
      const G = g(state);
      const tbl = TECH.map((t) => {
        const sc = G.scores[t.id] || {};
        return `${t.name}: ${CRIT.map((c) => sc[c.k] || "-").join("/")} (합계 ${total(sc) || "-"})`;
      });
      return [
        { t: "평가표 (기능/안전/사회윤리/환경에너지/사용자경험)", d: tbl.join("\n"), text: "\n  " + tbl.join("\n  ") },
        { t: "최우수 기술", d: nameOf(G.best) || "(미선택)" },
        { t: "추천 이유", d: G.reason },
        ...TECH.filter((t) => G.notes[t.id]).map((t) => ({ t: `숨은 영향 · ${t.name}`, d: G.notes[t.id] })),
      ];
    },

    reflectExtra(state) {
      const G = g(state);
      const ex = EXAMPLES.map(
        (e, i) => `<details class="reveal"><summary>예시 답안 ${i + 1} · ${esc(nameOf(e.pick))} 선정 <span class="tag-official">보고서</span></summary>
          <div class="table-wrap"><table class="scoretable"><thead><tr><th>기술명</th>${CRIT.map((c) => `<th>${c.n}</th>`).join("")}<th>합계</th></tr></thead><tbody>
          ${TECH.map((t) => `<tr class="${t.id === e.pick ? "best" : ""}"><td class="name">${esc(t.name)}</td>${e.s[t.id].map((v) => `<td class="num">${v}</td>`).join("")}<td class="total">${e.s[t.id].reduce((a, b) => a + b, 0)}${e.note && t.id === "ml" ? "*" : ""}</td></tr>`).join("")}
          </tbody></table></div><p class="small" style="margin-top:6px"><b>요지</b>: ${esc(e.gist)}</p>${e.note ? `<p class="small muted"><span class="tag-mine">연습실 계산</span> ${esc(e.note)}</p>` : ""}</details>`
      ).join("");
      const clues = TECH.map(
        (t) => `<details class="reveal"><summary>${esc(t.name)}: 자료 속 단서 <span class="tag-mine">비공식 해설</span></summary>
          ${G.notes[t.id] ? `<p class="small"><b>내가 찾은 것</b>: ${esc(G.notes[t.id])}</p>` : ""}
          <ul class="small" style="margin:6px 0 0;padding-left:1.1em">${CLUES[t.id].map((c) => `<li>${esc(c)}</li>`).join("")}</ul></details>`
      ).join("");
      return `<p class="small muted" style="margin-bottom:8px">공식 예시 답안 네 개는 모두 다른 기술을 최우수로 골랐습니다. 점수 분포와 근거를 내 평가표와 비교해 보세요.</p>
        ${ex}
        <div class="caution" style="margin-top:10px"><span class="tag-mine">연습실 대조</span> 예시 답안 2는 브레인부스트 듀오의 전력 소모가 스마트워치보다 낮다고 말합니다. 홍보자료 표에서는 브레인튜너 1~2W, 스마트워치 0.5~1W입니다. 같은 답안의 '집중력 +31%'는 그래프의 30.8%를 반올림한 값으로 볼 수 있습니다. '기억력 +30%'는 그래프의 25.7%와 다릅니다. '사고 속도'라는 항목은 그래프에 없습니다(처리속도 23.5%, 주의력 31.8%, 문제해결 32.3%). 예시 답안도 자료와 대조해 읽어야 합니다.</div>
        <h4 style="font-size:14px;margin:14px 0 8px">자료 속 단서</h4>
        <p class="small muted" style="margin-bottom:8px">출제 의도 가운데 하나는 "기술적 우수성으로 포장된 내용 뒤에 숨겨진 긍정적, 부정적인 영향성"을 파악하는 능력입니다. 아래는 연습용으로 정리한 관찰이며 대학의 채점 기준이 아닙니다.</p>
        ${clues}`;
    },
  };
})();
