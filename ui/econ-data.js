/* 도시 경제 모형의 자료. ui/econ.js가 읽는다(SPEC v2, 3차(v1.2) 보정, 1턴 = 1달).
 * start: 도시마다 시작 인구(pop0)·산업 종사자(ind0)·집단 비중·항만·수출 비중·산업 구성.
 *   est: true = 자리표시 추정값. 조사 담당이 통계(주민등록 인구, 전국사업체조사 종사자, 재정자립도)로 바꾼다.
 * params: 계수마다 {v, grade, note}. 등급 O(공식 원문)·O*(공식 통계 검색 요약)·P(논문·보고서)·M(모형 추정)·G(게임 가정, D-56).
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
    // 산업 부문. re100 숫자 필드는 아래에서 params.sectorRe100을 복사해 기존 자료 계약 유지.
    sectors: {
      semi: { name: "반도체" },
      display: { name: "디스플레이" },
      auto: { name: "자동차" },
      steel: { name: "철강" },
      chem: { name: "화학" },
      bio: { name: "바이오" },
      other: { name: "기타" }
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
      neutralScore: p(50, G, "중립 부분 점수"),
      airDefault: p(60, G, "배출 자료가 없을 때 대기 점수"),
      jobsSlope: p(1.5, G, "일자리 비율 민감도"),
      serviceCurve: p([-30, -12, 0, 10, 16], G, "GAMES §11.1 E2: 삭감 손실·증액 체감; 근거 약함: 게임 눈금 가정"),
      taxCurve: p([14, 8, 0, -14, -36], G, "GAMES §11.1 E1: 절대 세율의 집단 만족; 근거 약함: 비대칭 크기는 게임 가정"),
      eduMax: p(25, G, "교육 가산 상한"),
      taxBase: p(60, G, "세금 중립 점수"),
      taxPoints: p(10, G, "EVIDENCE §5: 상대 세율 단계당 이주 매력 감점; 근거 약함: 일자리보다 작은 가중 가정"),
      crowdKnee: p(0.9, G, "혼잡 감점 시작 수용률"),
      crowdBase: p(90, G, "혼잡 문턱 점수"),
      crowdSlope: p(400, G, "수용 초과 혼잡 감점"),
      laborLog: p(20, G, "인구 로그 인력 점수"),
      laborYouth: p(200, G, "청년 비중 인력 점수"),
      talentBase: p(30, G, "인재 기본 점수"),
      talentUni: p(20, G, "대학 인재 가산"),
      talentLab: p(15, G, "연구소 인재 가산"),
      logiBase: p(40, G, "물류 기본 점수"),
      logiPortPoints: p(30, G, "항만 물류 가산"),
      logiSitePoints: p(15, G, "산단 물류 가산"),
      reWeightBase: p(0.3, G, "EVIDENCE §4 설문(P) 방향; 근거 약함: 재생 가중 기본 몫은 게임 가정"),
      sectorRe100: p({ semi: 0.5, display: 0.4, auto: 0.3, bio: 0.2, chem: 0.15, steel: 0.15, other: 0.1 }, G, "EVIDENCE §4 대한상의(O*)·무역협회(P) 요구 15~30%; 근거 약함: 업종별 외삽"),
      priceSlopeA: p(25 / 0.3, G, "EVIDENCE §3 설문(P): 원가 30% 차이에 산업 부분 점수 25점; 근거 약함: 점수 환산"),
      priceWeightBase: p(0.5, G, "EVIDENCE §3 Kahn–Mansur(P) 방향; 근거 약함: 산업 요금 가중에 에너지 집약 몫을 더할 기본값"),
      carbonRefMul: p(2, G, "탄소 점수 기준 배수"),
      carbonWeight: p(0.3, G, "CBAM 산업 가중"),
      unrestPenalty: p(3, G, "시위 중 만족 감점"),
      newsMin: p(100, G, "이동 뉴스 최소 인원"),
      newsFrac: p(0.0005, G, "이동 뉴스 출발 도시 규모 대비 문턱"),
      monthEventP: p(0.5, G, "달 턴 사건 발생 확률"),
      normalCost: p(0.012, G, "시작 보정 전력 원가 억/MWh"),
      normalCo2: p(0.4, G, "시작 보정 t/MWh"),
      normalRen: p(15, G, "시작 보정 재생 비중"),
      // B18: 경제 리그만. ECON-EVIDENCE §11의 접속·출력제어·ESS 근거.
      hostCapMul: p(0.3, G, "B18 · EVIDENCE §11.2·11.6: 시작 접속 상한/도시 기준 피크; 0.72×0.4≈0.29의 게임 근사"),
      hostEssMul: p(1, G, "B18 · EVIDENCE §11.2: ESS 1 MW당 접속 상한 +1 MW; ESS로 재생 수용 확대 정책의 방향만 반영"),
      hostTieMul: p(0.5, G, "B18 · EVIDENCE §11.2: 양 끝 내부 전선이 연결된 연계선 MW당 접속 상한 +0.5 MW"),
      connPerMonth: p(0.1, G, "B18 · EVIDENCE §11.6: 월 접속 진행 한도/기준 피크; 자료 환산·시간 압축 뒤보다 약 7배 느슨한 교육용 값"),
      curtailLoadMul: p(0.4, M, "B18 · EVIDENCE §11.3: 봄 최저부하/여름 피크 약 0.39~0.41 환산"),
      curtailSlope: p(1.7, M, "B18 · EVIDENCE §11.3·11.6: 육지 봄 제어일 비율 근사 기울기(P/O*·가정 용량 혼합), 인과 추정 아님"),
      curtailKnee: p(0.72, M, "B18 · EVIDENCE §11.3·11.6: 변동 재생/최저부하의 제어 시작점 근사"),
      curtailMax: p(0.6, G, "B18 · EVIDENCE §11.6: 제어일 비율 상한"),
      curtailOffSeason: p(0.3, G, "B18 · EVIDENCE §11.6: 여름·겨울 제어일 비율 배수"),
      curtailLoss: p(0.06, G, "B18 · EVIDENCE §11.3·11.6: 제어일 발전 손실 6%; 육지 1.8%와 제주 13% 사이 교육용 확대"),
      essCap: p(0.9, "O*", "B18 · EVIDENCE §11.5: 2020 산업부 옥외 ESS 충전 상한 90%, 보도 확인·최신 법령 원문 미대조"),
      historyMonths: p(48, G, "경제 이력 보관 길이"),
      // 시간·지연
      lambdaFast: p(0.5, G, "GAMES E3: 정전·요금·세금·집단 만족의 월 반영률; 근거 약함: 게임 시차"),
      lambdaSlow: p(0.15, G, "GAMES E3: 서비스·교육·재생·혼잡·인력·대기 효과의 월 반영률; 근거 약함: 게임 시차"),
      // 이동(이주·기업 이전)
      betaPopReal: p(0.02, M, "EVIDENCE §1: κ=0.04와 짝, κβ=0.0008/달. ΔL=10 출발 연환산 약 1%; O* 순이동·P(FE) 범위에 맞춘 계산"),
      eduSpeed: p(4.8, G, "B15: 주민 게임 κβ=0.00384 / 자료 κβ=0.0008 = 4.8; 출발 월 선형 반응 배속, 누적 이주율의 배수 아님"),
      startMix: p(0.9, G, "목표 몫에 섞는 시작 몫; 24달 회복 목표 검산으로 기본안 0.2에서 조정"),
      kappaPop: p(0.04, G, "달마다 목표 인구와의 차이 중 움직이는 몫"),
      betaIndReal: p(0.02, G, "EVIDENCE §1 주민 탄력 0.02 준용; 근거 약함: 산업 직접 추정 없음, κ=0.005와 짝"),
      kappaInd: p(0.005, G, "달마다 목표 산업과의 차이 중 움직이는 몫"),
      anchor: p(0.9, G, "시작 매력 차이를 상쇄하는 몫(지금 분포는 이미 지금 조건의 균형)"),
      gpYear: p(0.01, M, "EVIDENCE §10: 최근 약 1.5%와 장래추계 0.3~0.6%(O*)의 중간 시나리오, 자연증가만이 아님"),
      giYear: p(0.012, G, "근거 약함: EVIDENCE §10 전국 종사자 증가(O*)보다 높은 투자 집중 지역을 가정"),
      // 살기 좋음 L 가중치
      wL: p({ rel: 0.26, price: 0.08, air: 0.12, jobs: 0.22, svc: 0.10, tax: 0.10, crowd: 0.12 }, G, "EVIDENCE §1·3·6: 일자리 방향 P, 주민 요금·서비스 축소; 근거 약함: 크기와 혼잡 재배분은 G"),
      // 산업 매력 A 가중치(carbon은 CBAM 때 철강 수출 비중만큼 더 커진다)
      wA: p({ rel: 0.26, price: 0.18, re: 0.10, labor: 0.11, talent: 0.08, logi: 0.10, tax: 0.07, inc: 0.05, land: 0.05, carbon: 0.02 }, G, "EVIDENCE §3: 요금 입지 설문·RD(P)의 방향; 근거 약함: 가중 크기는 G"),
      unsZeroL: p(16, G, "주민: 정전 이 %에서 전력 신뢰 0점"),
      unsZeroA: p(3, G, "기업: 정전 이 %에서 전력 신뢰 0점(반도체·데이터센터 민감)"),
      hospPen: p(20, G, "병원 정전이 있으면 전력 신뢰 감점"),
      airRef: p(30, G, "근거 약함: EVIDENCE §7 CO₂는 농도·건강의 대리값일 뿐; t/주민 만 명/달이 30이면 37점"),
      crowdCapMul: p(1.15, G, "주거 수용 = 시작 인구 × 이 값(타일 정보가 없을 때)"),
      landCapMul: p(1.2, G, "산업 용지 수용 = 시작 종사자 × 이 값"),
      reTarget: p(50, G, "재생 비중 이 %면 RE 부분 만점"),
      incRef: p(0.2, G, "유치 보조: 종사자 만 명당 달 이 억이면 63점"),
      eduUni: p(8, G, "대학 하나당 공공서비스 보너스"),
      eduLab: p(5, G, "연구소 하나당 공공서비스 보너스"),
      // 재정(게임 억, 도시 예산 눈금에 맞춤)
      resTax: p(3.0e-5, G, "주민 관련 세: 1명당 달 억(실제 구조: 지방세 중 주민세·재산세 몫 참고)"),
      indTax: p(1.8e-5, G, "산업 관련 세: 종사자 1명당 달 억(지방소득세·법인분 참고)"),
      indTaxK: p(3, G, "EVIDENCE §5 세수 급락 보도(O*) 방향; 근거 약함: 매출보다 큰 이익 변동을 out^3으로 단순화, 추정 지수 아님"),
      subRevenueRate: p(0.8, "O", "EVIDENCE §5 지방교부세법 제8조 원문(위키문헌 판본 확인, 최신 개정 미대조): 표준세율 기준 수입 80%"),
      subAdjust: p(0.5, G, "근거 약함: EVIDENCE §5 교부세 조정률 근사; 전년 표준세입 증가분의 40%를 1월 지원금에서 상쇄"),
      taxStep: p(0.4, G, "B12: 세율 단계당 세입 40%, 최저·최고는 기준의 20~180%; 법정 탄력세율이 아닌 세입 증감의 게임 눈금"),
      svcCost: p(3.3e-5, G, "공공서비스: 1명당 달 억"),
      svcStep: p(0.5, G, "서비스 단계 하나당 비용 +50%"),
      tariffMarkup: p(0.02, G, "지역 평균 원가 대비 전기 판매 가산율; 세입에는 차익만 반영"),
      priceFloor: p(0.5, G, "전기요금 점수 원가 하한: 지역 평균의 절반"),
      subBase: p(45, G, "국가 재정지원금 기본(억/년)"),
      subPerCap: p(4e-5, G, "근거 약함: 교부세 수요 원리만 EVIDENCE §5, 1인당 억/년 단가는 게임 눈금"),
      subEq: p(6e-5, G, "근거 약함: EVIDENCE §5 교부세 원리를 단순화한 게임 균형 단가"),
      fsrRef: p(0.6, G, "근거 약함: 균형 지원금 기준 자립도 60%는 법정 기준이 아닌 게임 가정"),
      fiscalTarget: p(0.6, G, "보통 조건 연 운영 수지 / 시작 현금; 시작 때 정액 보정 지원금 계산"),
      equalizeMaxShare: p(0.5, G, "B14: 1월 지원금에서 정액 보정이 차지할 최대 몫"),
      approvalWindow: p(12, G, "B13: 점수용 월말 지지율 평균 기간"),
      revenueVersion: p(2, G, "B11: 세금·지원금만 저장하는 지방채 세입 이력 판본"),
      debtRate: p(0.003, G, "지방채 이자(월)"),
      debtCapRatio: p(0.5, G, "v1.3: 지방채 한도 = 연 세입 추정 × 이 값; 12달 전은 반복 세금 월평균 × 12 + 올해 1월 지원금 1회, 이후 최근 12달 세금·지원금 합"),
      // 산업 산출 지수
      outRel: p(0.006, M, "EVIDENCE §2 ACO(2016) P·IV: 부족 10%→매출 -5.6%를 1%당 -0.6%로 환산"),
      outRelSemi: p(0.03, G, "EVIDENCE §2 순간 정전 사례(O*) 방향; 근거 약함: 반도체·디스플레이 몫에 곱하는 추가 산출 손실"),
      outMin: p(0.5, G, "산출 지수 하한"),
      outMax: p(1.2, G, "산출 지수 상한"),
      logiPort: p(0.05, G, "EVIDENCE §9 해운 설문(O*) 방향; 근거 약함: 운임 비중 미확인, 지수 -0.3→산출 -1.5% 가정"),
      fxExport: p(0.1, M, "EVIDENCE §9 기업 설문(보도 요약): 환율 +10%→수출 +1%p 환산, 인과 추정 아님"),
      cbamRate: p(0.02, G, "EVIDENCE §9 임재헌·정윤세(2023, P) 모형 방향; 근거 약함: EU 몫 미확인, 0.12×0.167≈0.02로 근사"),
      lngMarketK: p(0.03, G, "GAMES B1: 지역 화석 사용량/시작 기준 -1의 다음 달 LNG 효과; 근거 약함: 국제시장 가격 결정의 교육용 축소 모형"),
      lngMarketMax: p(0.05, G, "근거 약함: 공유 LNG 시장 가감 상한 ±0.05, 누적하지 않음"),
      co2IntRef: p(0.45, G, "근거 약함: EVIDENCE §9 탄소집약도 정규화 기준 t/MWh, 정확한 연도·공식 원문 미확인"),
      co2IntDef: p(0.45, G, "탄소집약도 정보가 없을 때 쓰는 값"),
      // 집단 만족(부분 점수 가중)
      groupW: p({
        worker: { rel: 0.35, jobs: 0.10, price: 0.05, tax: 0.25, svc: 0.20, crowd: 0.05 },
        youth: { rel: 0.30, jobs: 0.15, crowd: 0.10, svc: 0.25, tax: 0.15, air: 0.05 },
        senior: { rel: 0.35, svc: 0.35, tax: 0.10, price: 0.10, air: 0.10 },
        business: { rel: 0.25, A: 0.20, out: 0.20, taxI: 0.25, svc: 0.10 },
        farm: { rel: 0.30, tax: 0.25, svc: 0.25, price: 0.10, air: 0.10 },
        green: { rel: 0.20, svc: 0.15, tax: 0.10, air: 0.20, ren: 0.20, co2: 0.15 }
      }, G, "정전·세금·서비스를 각 집단의 생활 만족에 반영"),
      seniorHosp: p(15, G, "병원 정전 때 노년 만족 추가 감점"),
      sat0: p(55, G, "집단 만족 시작값"),
      outageSatThreshold: p(1, G, "EVIDENCE §8: 정전 불만이 붙는 %; 근거 약함: 문턱은 게임 가정"),
      outageSatPenalty: p(3, G, "EVIDENCE §8 정전·지지 P 방향; 근거 약함: 정전 달 만족 목표 -3, 누적 감점 아님"),
      unrestOffDrop: p(4, G, "GAMES E3: 시작 지지율 -4 이상 회복해야 시위 종료; 근거 약함: 게임 문턱"),
      unrestAttract: p(2, G, "GAMES E3: 시위 중 기업 유치 순위 감점; 근거 약함: 게임 점수"),
      approvalDrop: p(10, G, "평가 통과: 보정 뒤 시작 지지율에서 허용할 하락 폭"),
      reviewEvery: p(12, G, "주민 평가 주기(턴)"),
      unrestMonths: p(12, G, "시위 켜짐을 기존 화면에 전달하는 양수 값; 회복 문턱까지 유지"),
      polChangeCost: p(2, G, "시위 기간에 정책 단계 하나 바꿀 때 드는 억"),
      // 기업 이전 희망
      offerGap: p([3, 6], G, "기업 이전 희망 사이 턴 수"),
      offerLife: p(2, G, "제안이 열려 있는 턴 수"),
      seekRate: p(0.05, G, "구직 인력 = 주민 × (직장인+청년 비중) × 이 값"),
      // 점수
      wScore: p({ pop: 0.2, ind: 0.2, fin: 0.1, co2: 0.15, appr: 0.15, rel: 0.2 }, G, "도시 점수 가중치"),
      scoreGrowthK: p(500, G, "증가율 10% → 100점, −10% → 0점"),

      scoreCo2Ref: p(3, G, "CO₂ 점수: 주민 천 명당 달 t이 이 값이면 37점")
    },
    intl: {
      // 지수 기본값(1 = 2026년 수준). 무작위 걷기 + 평균 회귀.
      base: { lng: 1, fx: 1, ship: 1, export: { semi: 1, display: 1, auto: 1, steel: 1, chem: 1, bio: 1, other: 1 } },
      theta: 0.15,
      sigma: { lng: 0.05, fx: 0.02, ship: 0.03, export: 0.04 },
      eventP: 0.12,
      maxActive: 2,
      // 사건 효과 손잡이: lng·fx·ship는 지수에 더함, export는 부문별로 더함, cbam은 켜짐(1).
      events: [
        { id: "ship_red", name: "홍해 해운 차질", dur: [3, 6], fx: { ship: -0.3, lng: 0.1 }, text: "물류비가 오르고 항만 산출이 줄어요" },
        { id: "lng_spike", name: "LNG 가격 급등", dur: [2, 5], fx: { lng: 0.5 }, text: "LNG·디젤 연료비가 크게 올라요" },
        { id: "export_boom", name: "반도체 수출 호황", dur: [4, 8], fx: { export: { semi: 0.25, display: 0.1 } }, text: "반도체 도시 산출이 늘어요" },
        { id: "auto_slump", name: "자동차 수출 둔화", dur: [3, 6], fx: { export: { auto: -0.2 } }, text: "자동차 도시 산출이 줄어요" },
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
  Object.keys(KCP.ECON_DATA.sectors).forEach(k => {
    KCP.ECON_DATA.sectors[k].re100 = KCP.ECON_DATA.params.sectorRe100.v[k];
  });
})();
