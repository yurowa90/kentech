/* 도시 경제 모형의 자료. ui/econ.js가 읽는다(SPEC v1, 1턴 = 1달).
 * start: 도시마다 시작 인구(pop0)·산업 종사자(ind0)·집단 비중·항만·수출 비중·산업 구성.
 *   est: true = 자리표시 추정값. 조사 담당이 통계(주민등록 인구, 전국사업체조사 종사자, 재정자립도)로 바꾼다.
 * params: 계수마다 {v, grade, note}. 등급 O(공식 자료)·P(논문·보고서)·M(모형 추정)·G(게임 가정, D-56).
 * intl: 국제 지수(달마다 씨앗 고정 무작위 걷기)와 사건. 사건 효과는 손잡이(지수에 더하는 값).
 * 돈 단위는 게임 억(도시 예산 160–365억과 같은 눈금), 사람 단위는 실제 명.
 */
(function () {
  "use strict";
  const KCP = window.KCP;
  if (!KCP) return;
  const G = "G", M = "M";
  const p = (v, grade, note) => ({ v, grade, note });

  KCP.ECON_DATA = {
    version: 1,
    startYear: 2027,
    // 집단 6개(Democracy): 이름표와 짧은 설명
    groups: {
      worker: { name: "직장인", short: "직장" },
      youth: { name: "청년", short: "청년" },
      senior: { name: "노년", short: "노년" },
      business: { name: "기업", short: "기업" },
      farm: { name: "농어민", short: "농어" },
      green: { name: "환경단체", short: "환경" }
    },
    // 산업 부문: 수출 지수 이름과 RE100 요구 정도(0–1, 그 부문 기업 중 재생 비중을 요구하는 몫, G)
    sectors: {
      semi: { name: "반도체", re100: 0.9 },
      display: { name: "디스플레이", re100: 0.8 },
      auto: { name: "자동차", re100: 0.6 },
      steel: { name: "철강", re100: 0.2 },
      chem: { name: "화학", re100: 0.3 },
      bio: { name: "바이오", re100: 0.4 },
      other: { name: "기타", re100: 0.1 }
    },
    // 도시 시작값 — 2025 공식 통계(검색 요약으로 확인, O*)와 추정(G). 출처·등급은 docs/ECON-DATA.md. cash0 = 도시 지도 예산(게임 단위 억, 실제 시 예산이 아니라 에너지·산업 계정).
    start: {
      hwaseong: {
        name: "화성·오산", est: false, pop0: 1239379, ind0: 655000, cash0: 365, fsr0: 0.485,
        groups: { worker: 0.408, youth: 0.21, senior: 0.117, business: 0.082, farm: 0.051, green: 0.133 },
        port: false, site: true, uni: 2, lab: 1, exportShare: 0.55,
        mix: { semi: 0.35, auto: 0.30, other: 0.35 },
        note: "주민등록 2025-12 1,239,379명(O*) · 종사자 655,000(G) · 재정자립도 48.5%(O*/derived) · 노년 비중 11.7% · 청년 비중은 G"
      },
      pyeongtaek: {
        name: "평택", est: false, pop0: 610402, ind0: 283849, cash0: 320, fsr0: 0.416,
        groups: { worker: 0.378, youth: 0.21, senior: 0.144, business: 0.08, farm: 0.06, green: 0.129 },
        port: true, site: true, uni: 1, lab: 0, exportShare: 0.60,
        mix: { semi: 0.45, auto: 0.10, other: 0.45 },
        note: "주민등록 2025-12 610,402명(O*) · 종사자 283,849(O*) · 재정자립도 41.6%(O*) · 노년 비중 14.4% · 청년 비중은 G"
      },
      anseong: {
        name: "안성", est: false, pop0: 196592, ind0: 120000, cash0: 160, fsr0: 0.285,
        groups: { worker: 0.292, youth: 0.17, senior: 0.216, business: 0.058, farm: 0.146, green: 0.117 },
        port: false, site: false, uni: 2, lab: 0, exportShare: 0.30,
        mix: { semi: 0.05, auto: 0.10, bio: 0.10, other: 0.75 },
        note: "주민등록 2025-12 196,592명(O*) · 종사자 120,000(O*) · 재정자립도 28.5%(O*) · 노년 비중 21.6% · 청년 비중은 G"
      },
      dangjin: {
        name: "당진", est: false, pop0: 172564, ind0: 85000, cash0: 215, fsr0: 0.216,
        groups: { worker: 0.314, youth: 0.17, senior: 0.22, business: 0.074, farm: 0.129, green: 0.092 },
        port: true, site: true, uni: 0, lab: 0, exportShare: 0.55,
        mix: { steel: 0.55, chem: 0.10, other: 0.35 },
        note: "주민등록 2025-12 172,564명(O*) · 종사자 85,000(G) · 재정자립도 21.6%(O*) · 노년 비중 22.0% · 청년 비중은 G"
      },
      asan: {
        name: "아산", est: false, pop0: 359378, ind0: 185000, cash0: 220, fsr0: 0.324,
        groups: { worker: 0.38, youth: 0.21, senior: 0.153, business: 0.086, farm: 0.067, green: 0.105 },
        port: false, site: false, uni: 3, lab: 0, exportShare: 0.60,
        mix: { display: 0.35, auto: 0.20, semi: 0.15, other: 0.30 },
        note: "주민등록 2025-12 359,378명(O*) · 종사자 185,000(G) · 재정자립도 32.4%(O*) · 노년 비중 15.3% · 청년 비중은 G"
      },
      cheonan: {
        name: "천안", est: false, pop0: 664322, ind0: 323557, cash0: 205, fsr0: 0.337,
        groups: { worker: 0.381, youth: 0.22, senior: 0.145, business: 0.074, farm: 0.042, green: 0.138 },
        port: false, site: false, uni: 4, lab: 1, exportShare: 0.40,
        mix: { semi: 0.15, display: 0.10, other: 0.75 },
        note: "주민등록 2025-12 664,322명(O*) · 종사자 323,557(O*) · 재정자립도 33.7%(O*) · 노년 비중 14.5% · 청년 비중은 G"
      }
    },
    params: {
      // 시간·지연
      lambda: p(0.25, G, "지연 효과: 달마다 목표값으로 다가가는 몫"),
      // 이동(이주·기업 이전)
      betaPop: p(0.3, G, "이주 탄력: 살기 좋음 10점 차이 → 목표 몫 e^0.3배"),
      kappaPop: p(0.01, G, "달마다 목표 인구와의 차이 중 움직이는 몫"),
      betaInd: p(0.3, G, "기업 이전 탄력: 산업 매력 10점 차이당"),
      kappaInd: p(0.005, G, "달마다 목표 산업과의 차이 중 움직이는 몫"),
      anchor: p(0.9, G, "시작 매력 차이를 상쇄하는 몫(지금 분포는 이미 지금 조건의 균형)"),
      gpYear: p(0.006, M, "지역 인구 연 증가율(경기 남부·충남 북부 최근 추세 참고, 추정)"),
      giYear: p(0.012, M, "지역 산업 종사자 연 증가율(추정)"),
      // 살기 좋음 L 가중치
      wL: p({ rel: 0.26, price: 0.12, air: 0.12, jobs: 0.16, svc: 0.14, tax: 0.10, crowd: 0.10 }, G, "살기 좋음 부분 가중치"),
      // 산업 매력 A 가중치(carbon은 CBAM 때 철강 수출 비중만큼 더 커진다)
      wA: p({ rel: 0.26, price: 0.13, re: 0.10, labor: 0.13, talent: 0.08, logi: 0.10, tax: 0.07, inc: 0.05, land: 0.08, carbon: 0.02 }, G, "산업 매력 부분 가중치"),
      unsZeroL: p(5, G, "주민: 정전 이 %에서 전력 신뢰 0점"),
      unsZeroA: p(3, G, "기업: 정전 이 %에서 전력 신뢰 0점(반도체·데이터센터 민감)"),
      hospPen: p(20, G, "병원 정전이 있으면 전력 신뢰 감점"),
      airRef: p(30, G, "대기: 지역 배출 t/주민 만 명/달이 이 값이면 37점"),
      crowdCapMul: p(1.15, G, "주거 수용 = 시작 인구 × 이 값(타일 정보가 없을 때)"),
      landCapMul: p(1.2, G, "산업 용지 수용 = 시작 종사자 × 이 값"),
      reTarget: p(50, G, "재생 비중 이 %면 RE 부분 만점"),
      incRef: p(0.2, G, "유치 보조: 종사자 만 명당 달 이 억이면 63점"),
      eduUni: p(8, G, "대학 하나당 공공서비스 보너스"),
      eduLab: p(5, G, "연구소 하나당 공공서비스 보너스"),
      // 재정(게임 억, 도시 예산 눈금에 맞춤)
      resTax: p(1.0e-5, G, "주민 관련 세: 1명당 달 억(실제 구조: 지방세 중 주민세·재산세 몫 참고)"),
      indTax: p(1.8e-5, G, "산업 관련 세: 종사자 1명당 달 억(지방소득세·법인분 참고)"),
      taxStep: p(0.1, G, "세율 단계 하나당 세입 +10%"),
      svcCost: p(0.6e-5, G, "공공서비스: 1명당 달 억"),
      svcStep: p(0.25, G, "서비스 단계 하나당 비용 +25%"),
      tariff: p(0.013, G, "전기요금 수입 억/MWh(평균 연료비보다 조금 높게: 전력 계정은 대략 본전, 흑자는 세금에서). demMWh를 넘길 때만"),
      subBase: p(15, G, "국가 재정지원금 기본(억/년)"),
      subPerCap: p(2.5e-5, M, "재정지원금 1인당(억/년). 보통교부세 수요 측정 원리"),
      subEq: p(6e-5, M, "균형 몫: 1인당 × (기준 − 재정자립도)(지방교부세 원리)"),
      fsrRef: p(0.6, M, "균형 몫 기준 재정자립도"),
      fiscalNorm: p(0.4, G, "재정 눈금: 시작 때 (세금 − 공공서비스 + 지원금)/년 = 시작 예산 × 이 값이 되게 도시마다 배수를 맞춤. 0이면 끔"),
      debtRate: p(0.003, G, "지방채 이자(월)"),
      debtCapRatio: p(0.5, G, "지방채 한도 = 연간 세입 × 이 값"),
      // 산업 산출 지수
      outRel: p(0.04, G, "정전 1%당 산출 −4%"),
      outMin: p(0.5, G, "산출 지수 하한"),
      outMax: p(1.2, G, "산출 지수 상한"),
      logiPort: p(0.3, G, "항만 도시: 해운 지수 1 차이당 산출 변화"),
      fxExport: p(0.5, G, "환율 1 차이당 수출 산출 변화(원화 약세 → 수출↑)"),
      cbamRate: p(0.25, G, "CBAM: 철강 수출 몫 × 탄소집약도/기준 × 이 값만큼 산출 감점"),
      co2IntRef: p(0.45, "P", "t/MWh 전국 평균 전력 배출계수 근사(CBAM 기준)"),
      co2IntDef: p(0.45, G, "탄소집약도 정보가 없을 때 쓰는 값"),
      // 집단 만족(부분 점수 가중)
      groupW: p({
        worker: { jobs: 0.35, rel: 0.15, price: 0.15, tax: 0.2, crowd: 0.15 },
        youth: { jobs: 0.3, crowd: 0.3, svc: 0.15, air: 0.1, rel: 0.15 },
        senior: { svc: 0.35, price: 0.25, air: 0.2, rel: 0.2 },
        business: { A: 0.5, out: 0.25, taxI: 0.25 },
        farm: { price: 0.35, tax: 0.25, air: 0.2, svc: 0.2 },
        green: { air: 0.35, ren: 0.45, co2: 0.2 }
      }, G, "집단마다 신경 쓰는 부분"),
      seniorHosp: p(15, G, "병원 정전 때 노년 만족 추가 감점"),
      sat0: p(55, G, "집단 만족 시작값"),
      approvalMin: p(35, G, "평가 기준 지지율"),
      reviewEvery: p(12, G, "주민 평가 주기(턴)"),
      unrestMonths: p(12, G, "평가 탈락 뒤 시위·정책 비용↑ 기간(턴)"),
      polChangeCost: p(2, G, "시위 기간에 정책 단계 하나 바꿀 때 드는 억"),
      // 기업 이전 희망
      offerGap: p([3, 6], G, "기업 이전 희망 사이 턴 수"),
      offerLife: p(2, G, "제안이 열려 있는 턴 수"),
      seekRate: p(0.05, G, "구직 인력 = 주민 × (직장인+청년 비중) × 이 값"),
      // 점수
      wScore: p({ pop: 0.2, ind: 0.2, cash: 0.15, co2: 0.15, appr: 0.15, rel: 0.15 }, G, "도시 점수 가중치"),
      scoreGrowthK: p(500, G, "증가율 10% → 100점, −10% → 0점"),
      scoreCashRef: p(2, G, "현금 점수: 50 + 50·tanh(현금 / (시작 예산 × 이 값)). 빚이면 50 아래"),
      scoreCo2Ref: p(3, G, "CO₂ 점수: 주민 천 명당 달 t이 이 값이면 37점")
    },
    intl: {
      // 지수 기본값(1 = 2026년 수준). 무작위 걷기 + 평균 회귀.
      base: { lng: 1, fx: 1, ship: 1, export: { semi: 1, display: 1, auto: 1, steel: 1, chem: 1, bio: 1, other: 1 } },
      theta: 0.15,
      sigma: { lng: 0.05, fx: 0.02, ship: 0.03, export: 0.04 },
      eventP: 0.12,
      maxActive: 2,
      // 사건 효과 손잡이: lng·fx·ship·capex는 지수에 더함, export는 부문별로 더함, cbam은 켜짐(1).
      events: [
        { id: "ship_red", name: "홍해 해운 차질", dur: [3, 6], fx: { ship: -0.3, lng: 0.1 }, text: "물류비가 오르고 항만 산출이 줄어요" },
        { id: "lng_spike", name: "LNG 가격 급등", dur: [2, 5], fx: { lng: 0.5 }, text: "LNG·디젤 연료비가 크게 올라요" },
        { id: "export_boom", name: "반도체 수출 호황", dur: [4, 8], fx: { export: { semi: 0.25, display: 0.1 } }, text: "반도체 도시 산출이 늘어요" },
        { id: "auto_slump", name: "자동차 수출 둔화", dur: [3, 6], fx: { export: { auto: -0.2 } }, text: "자동차 도시 산출이 줄어요" },
        { id: "equip", name: "기자재 가격 상승", dur: [3, 6], fx: { capex: 0.15 }, text: "새 설비 건설비가 올라요" },
        { id: "cbam", name: "EU 탄소국경조정(CBAM)", dur: [999, 999], fx: { cbam: 1 }, sched: true, text: "철강 수출 도시는 전력이 더러울수록 산출이 깎여요" }
      ],
      // 정해진 때 오는 사건(t = 몇 번째 턴, 0부터)
      schedule: [{ t: 12, id: "cbam" }]
    },
    // 기업 이전 희망 틀: workers 명, mw 게임 MW, re 재생 요구 %, uns 허용 정전 %
    offers: [
      { id: "semi_pkg", name: "반도체 후공정 공장", sector: "semi", workers: [2500, 5000], mw: [1.5, 3], re: [30, 60], uns: 0.5 },
      { id: "dc", name: "데이터센터", sector: "other", workers: [300, 800], mw: [1, 2.5], re: [40, 80], uns: 0.2 },
      { id: "battery", name: "배터리 공장", sector: "auto", workers: [2000, 4000], mw: [1, 2], re: [20, 50], uns: 1 },
      { id: "bio", name: "바이오 의약품 공장", sector: "bio", workers: [1000, 2500], mw: [0.5, 1], re: [10, 40], uns: 0.5 },
      { id: "steel_proc", name: "철강 가공 공장", sector: "steel", workers: [800, 2000], mw: [1, 2], re: [0, 10], uns: 2 }
    ],
    sources: [
      { id: "placeholder", text: "시작값은 모두 자리표시(est). 주민등록 인구 통계(행정안전부), 전국사업체조사(통계청), 지방재정365 재정자립도로 바꿀 것." },
      { id: "fiscal", text: "재정지원금 구조는 지방교부세(기준재정수요 − 수입) 원리를 단순화(M)." },
      { id: "cbam", text: "EU CBAM: 2026년 본격 시행, 철강·시멘트·알루미늄 등. 게임에선 2028년 1월부터(G)." }
    ]
  };
})();
