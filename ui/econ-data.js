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
    // univ0·lab0: 기존 실제 대학·연구소 시작 수(O*), 게임 건설 자산과 분리. REF 3.9, 4.8(개별 시설 원문 출처는 기존 자료에 없음).
    // 도시 시작값 — 2025 공식 통계(검색 요약으로 확인, O*)와 추정(G). 출처·등급은 docs/ECON-DATA.md. cash0 = 도시 지도 예산(게임 단위 억, 실제 시 예산이 아니라 에너지·산업 계정).
    start: {
      hwaseong: {
        name: "화성·오산", est: false, pop0: 1239379, ind0: 655000, cash0: 365, fsr0: 0.485,
        groups: { worker: 0.408, youth: 0.21, senior: 0.117, business: 0.082, farm: 0.051, green: 0.133 },
        port: false, site: true, univ0: 2, lab0: 1, exportShare: 0.55,
        mix: { semi: 0.35, auto: 0.30, other: 0.35 },
        note: "주민등록 2025-12 1,239,379명(O*) · 종사자 655,000(G) · 재정자립도 48.5%(O*/derived) · 노년 비중 11.7% · 청년 비중은 G"
      },
      pyeongtaek: {
        name: "평택", est: false, pop0: 610402, ind0: 283849, cash0: 320, fsr0: 0.416,
        groups: { worker: 0.378, youth: 0.21, senior: 0.144, business: 0.08, farm: 0.06, green: 0.129 },
        port: true, site: true, univ0: 1, lab0: 0, exportShare: 0.60,
        mix: { semi: 0.45, auto: 0.10, other: 0.45 },
        note: "주민등록 2025-12 610,402명(O*) · 종사자 283,849(O*) · 재정자립도 41.6%(O*) · 노년 비중 14.4% · 청년 비중은 G"
      },
      anseong: {
        name: "안성", est: false, pop0: 196592, ind0: 120000, cash0: 160, fsr0: 0.285,
        groups: { worker: 0.292, youth: 0.17, senior: 0.216, business: 0.058, farm: 0.146, green: 0.117 },
        port: false, site: false, univ0: 2, lab0: 0, exportShare: 0.30,
        mix: { semi: 0.05, auto: 0.10, bio: 0.10, other: 0.75 },
        note: "주민등록 2025-12 196,592명(O*) · 종사자 120,000(O*) · 재정자립도 28.5%(O*) · 노년 비중 21.6% · 청년 비중은 G"
      },
      dangjin: {
        name: "당진", est: false, pop0: 172564, ind0: 85000, cash0: 215, fsr0: 0.216,
        groups: { worker: 0.314, youth: 0.17, senior: 0.22, business: 0.074, farm: 0.129, green: 0.092 },
        port: true, site: true, univ0: 0, lab0: 0, exportShare: 0.55,
        mix: { steel: 0.55, chem: 0.10, other: 0.35 },
        note: "주민등록 2025-12 172,564명(O*) · 종사자 85,000(G) · 재정자립도 21.6%(O*) · 노년 비중 22.0% · 청년 비중은 G"
      },
      asan: {
        name: "아산", est: false, pop0: 359378, ind0: 185000, cash0: 220, fsr0: 0.324,
        groups: { worker: 0.38, youth: 0.21, senior: 0.153, business: 0.086, farm: 0.067, green: 0.105 },
        port: false, site: false, univ0: 3, lab0: 0, exportShare: 0.60,
        mix: { display: 0.35, auto: 0.20, semi: 0.15, other: 0.30 },
        note: "주민등록 2025-12 359,378명(O*) · 종사자 185,000(G) · 재정자립도 32.4%(O*) · 노년 비중 15.3% · 청년 비중은 G"
      },
      cheonan: {
        name: "천안", est: false, pop0: 664322, ind0: 323557, cash0: 205, fsr0: 0.337,
        groups: { worker: 0.381, youth: 0.22, senior: 0.145, business: 0.074, farm: 0.042, green: 0.138 },
        port: false, site: false, univ0: 4, lab0: 1, exportShare: 0.40,
        mix: { semi: 0.15, display: 0.10, other: 0.75 },
        note: "주민등록 2025-12 664,322명(O*) · 종사자 323,557(O*) · 재정자립도 33.7%(O*) · 노년 비중 14.5% · 청년 비중은 G"
      }
    },
    params: {
      complaintScale: p(1, G, "D-62: 민원 점수당 해당 집단 만족 감점; 국내 인과 실증값 없음"),
      complaintCap: p(20, G, "D-62: 집단별 민원 감점 상한; 6달 입지 차이 수용 기준으로 검산"),
      complaintGroups: p({ noise: ["farm", "senior"], view: ["farm", "senior"], smoke: ["senior", "youth"], forest: ["green"] }, G, "D-62: 민원 종류별 영향 집단 가정"),
      shareRelief: p(0.5, G, "D-62: 이익공유는 민원 감점의 절반 완화; 민원 없는 곳에 가산하지 않음"),
      saveSatPenalty: p(5, G, "D-62: 절전 카드 집단 만족 목표 −5점"),
      aiComplaintCost: p(0.5, G, "D-62: AI 입지 비교에서 민원 점수당 가상 비용(억); 실제 지출 아님"),
      causeCount: p(3, G, "ECON-NEXT: 이번 달 지지율 변화 기여 원인 최대 개수"),
      coopBonus: p(2, G, "D-61: 지역 정전·CO₂ 공동목표를 모두 달성한 달 모든 활성 도시 총점 +2; 누적하지 않음"),
      coopUnsGoal: p(0.5, G, "단독 경제 검사 기본 지역 정전 목표(%); 호스트의 활성 도시 목표가 우선"),
      coopCo2Goal: p(3000, G, "단독 경제 검사 기본 지역 대표 7일 CO₂ 목표(t); 월 일수 환산, 호스트 목표 우선"),
      re100PolicyWeight: p(1.5, G, "ECON-TECH-SPEC T1: RE100 산단 선택 시 산업 매력 재생 항 가중, 낮은 재생에도 적용"),
      neutralScore: p(50, G, "중립 부분 점수"),
      airDefault: p(60, G, "배출 자료가 없을 때 대기 점수"),
      jobsJ: p(3, "M", "일자리 시작 대비 로그 점수 · 김현우·이두헌 2021 취업자 +1%p→순이동 +0.095%p [P06][I01][S03] · 계산: 1%당 3점, β와 공동 보정 · 배속: 없음 · REF 3.7"),
      serviceCurve: p([-27, -20, 0, 10, 14], "M", "서비스 증감 · Brown 외(2024) 손실회피 메타값 1.955, 높은 성과 보상 체감 [P18][P84][P85] · 계산: 이득 10·14(G)에 손실 약 −1.955배 · 배속: 없음 · REF 3.8"),
      taxCurve: p([14, 8, 0, -14, -36], G, "GAMES §11.1 E1: 절대 세율의 집단 만족; 근거 약함: 비대칭 크기는 게임 가정"),
      eduMax: p(25, G, "교육 가산 상한"),
      taxBase: p(60, G, "세금 중립 점수"),
      taxPoints: p(10, "M", "상대 세율 점수 · 지방세법(2026) ±50% [L01], 고용 탄력 0.4% [P27] · 계산: L 가중 0.04·산업 β 0.08과 짝 · 배속: 없음 · REF 3.10, 4.6"),
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
      reWeightBase: p(0.1, "G", "설계 선택: 재생 조달 가중 기본 몫 · 대한상의(2022)·무역협회(2024) 요구 비율 14.7~16.9% 보조 설문뿐 [X03][X02] · 배속: 없음 · REF 4.4"),
      sectorRe100: p({ semi: 0.29, display: 0.29, auto: 0.29, bio: 0.17, chem: 0.17, steel: 0.17, other: 0.10 }, "G", "설계 선택: 고객 재생 요구 비율을 업종에 외삽 · 대한상의(2022) 28.8%·무역협회(2024) 16.9% 보조 설문뿐 [X03][X02] · 배속: 없음 · REF 4.4"),
      priceSlopeA: p(25 / 0.3, G, "EVIDENCE §3 설문(P): 원가 30% 차이에 산업 부분 점수 25점; 근거 약함: 점수 환산"),
      priceWeightBase: p(0.5, G, "EVIDENCE §3 Kahn–Mansur(P) 방향; 근거 약함: 산업 요금 가중에 에너지 집약 몫을 더할 기본값"),
      carbonRefMul: p(2, G, "탄소 점수 기준 배수"),
      carbonWeight: p(0.3, G, "CBAM 산업 가중"),
      unrestPenalty: p(3, G, "시위 중 만족 감점"),
      newsMin: p(100, G, "이동 뉴스 최소 인원"),
      newsFrac: p(0.0005, G, "이동 뉴스 출발 도시 규모 대비 문턱"),
      monthEventP: p(0.5, G, "달 턴 사건 발생 확률"),
      normalCost: p(0.008, "M", "기준 원가 억/MWh · 전력거래소 2025 구입단가 124.1원≈LNG 연료비 124.2원 [S18][S16] · 배속: 없음 · REF 7.11"),
      normalCo2: p(0.4567, "O", "계통 전력배출계수 tCO₂/MWh · 환경부고시(2025) 국가 고유 계수 2014–16 평균 0.4567 [L14][I27] · 배속: 없음 · REF 9.7"),
      normalRen: p(15, G, "시작 보정 재생 비중"),
      smrFuelMul: p(1.25, G, "달 모형 SMR 운영 단가 배수: 0.002→0.0025억/MWh. 실제 원가 추정이 아닌 T5 전략 균형 보정; 착공 보장 뒤 드러난 6도시 독식 완화"),
      // 컴퓨터 도시: 공개 수요·재정·접속 여유로 판단하는 게임 가정.
      aiStyles: { v: {
        careful: { invest: 0.4, risk: 0, delay: 1 },
        balanced: { invest: 0.6, risk: 0.5, delay: 0 },
        bold: { invest: 0.85, risk: 1, delay: 0 }
      }, grade: "G", note: "A1 투자 몫·위험 선호(0..1)·선택 투자 지연(달); 안전 공급은 지연하지 않음" },
      aiRenewFloor: { v: 0.1, grade: "G", note: "모든 성향의 피크 대비 최소 재생 정격 목표" },
      aiSupplyReserve: { v: 0.35, grade: "G", note: "모든 성향의 확정 공급 여유; 송전 손실·날씨·수요 증가 대비" },
      aiSafeReserve: { v: 0.2, grade: "G", note: "신중할수록 추가하는 확정 공급 여유 × (1-risk)" },
      aiRenewTarget: { v: 1.6, grade: "G", note: "피크 대비 재생 정격 목표 × (1-risk); 공급 보증으로 쓰지 않음" },
      aiBoldExpansion: { v: 0.3, grade: "G", note: "선택 투자 때 공격 성향의 추가 확정 공급 목표 × risk" },
      aiStorageShare: { v: 0.35, grade: "G", note: "재생 정격 대비 저장 출력 목표 × (1-risk)" },
      aiLargeWeight: { v: 0.25, grade: "G", note: "risk에 따른 대형 설비 선호 가중" },
      aiGridRenewDelay: { v: 4, grade: "G", note: "B18 재생 선택 투자 추가 지연(달) × risk; 신중은 재생·저장 우선, 공격은 확정 공급 먼저" },
      aiGridRepairEvery: { v: 1, grade: "G", note: "B18 경제 모드 보완 주기(달); 이월되지 않는 월 접속량 안에서 분할 투자" },
      aiRepairEvery: { v: 3, grade: "G", note: "연 계획 사이 보완 판단 주기(달)" },
      aiRepairInvest: { v: 0.15, grade: "G", note: "보완 때 연 투자 몫에 추가로 곱할 비율" },
      aiApprovalMargin: { v: 3, grade: "G", note: "평가 탈락 기준 위 선제 대응 여유(점)" },
      aiCashReserveMonths: { v: 3, grade: "G", note: "공격 성향의 감세·서비스 증액 전 기본 서비스 비용 비축(달)" },
      aiSafeCashMonths: { v: 6, grade: "G", note: "신중할수록 추가하는 기본 서비스 비용 비축(달) × (1-risk)" },
      aiTieValue: { v: 0.04, grade: "G", note: "정전 회피 1 MWh의 계획상 가치(억); 실제 수입에 가산하지 않음" },
      aiTieMonths: { v: 6, grade: "G", note: "대표 주 거래 편익을 남은 달수와 비교해 최대 6달까지 환산; 수입 보너스 없음" },
      aiHydroMaxShare: p(0.2, G, "B18 v1.4.1: AI 소수력 정격 합계는 시작 피크의 20% 이하; 하천 설비 쏠림 방지"),
      // B18: 경제 리그만. ECON-EVIDENCE §11의 접속·출력제어·ESS 근거.
      hostCapMul: p(0.4, "M", "접속 상한 · 전력거래소·경향신문(2024) 국가 계통 최저/최고 약 0.4~0.44, 도시 수요비와 다름 [S21][X26] · 계산: 38.4/87.8≈0.44 · 배속: 없음 · REF 8.11"),
      hostEssMul: p(1, "M", "ESS 접속 상한 가산 · NREL ATB(2024) 4시간형 ESS는 정격 MW로 4시간 흡수 [I13] · 계산: ESS 1MW당 1MW · 배속: 없음 · REF 8.11"),
      hostTieMul: p(0.5, G, "B18 · EVIDENCE §11.2: 양 끝 내부 전선이 연결된 연계선 MW당 접속 상한 +0.5 MW"),
      connPerMonth: p(0.1, G, "B18 · EVIDENCE §11.6: 월 접속 진행 한도/기준 피크; 자료 환산·시간 압축 뒤보다 약 7배 느슨한 교육용 값"),
      curtailLoadMul: p(0.4, G, "B18 · EVIDENCE §11.3: 봄 최저부하/여름 피크 약 0.39~0.41을 참고한 게임 가정"),
      curtailSlope: p(1.3, "M", "출력제어 기울기 · 전력거래소(서울경제 2025) 봄 제어 2023 2일·2025 30/93일, 최저부하 37~39.5GW 가정으로 두 점 맞춤 [S22][X25][X26] · 배속: 없음 · REF 8.13"),
      curtailKnee: p(0.64, "M", "출력제어 시작점 · 전력거래소(서울경제 2025) 봄 제어 2023 2일·2025 30/93일, 태양광 25.9·33.6GW 가정으로 두 점 맞춤 [S22][X25][X26] · 배속: 없음 · REF 8.13"),
      curtailMax: p(0.6, G, "B18 · EVIDENCE §11.6: 제어일 비율 상한"),
      curtailOffSeason: p(0.3, G, "B18 · EVIDENCE §11.6: 여름·겨울 제어일 비율 배수"),
      curtailLoss: p(0.06, G, "B18 · EVIDENCE §11.3·11.6: 제어일 발전 손실 6%; 육지 1.8%와 제주 13% 사이 교육용 확대"),
      essCap: p(0.9, "O*", "ESS 충전 상한 · 2019·2020 정부 안전대책 옥외 90%(보도), 현행 KEC는 정격 범위만 규정 [X22][L27] · 배속: 없음 · REF 8.8"),
      historyMonths: p(48, G, "경제 이력 보관 길이"),
      // 시간·지연
      lambdaFast: p(0.5, G, "GAMES E3: 정전·요금·세금·집단 만족의 월 반영률; 근거 약함: 게임 시차"),
      lambdaSlow: p(0.15, G, "GAMES E3: 서비스·교육·재생·혼잡·인력·대기 효과의 월 반영률; 근거 약함: 게임 시차"),
      // 이동(이주·기업 이전)
      betaPopReal: p(0.12, "M", "주민 이주 탄력 · 김현우·이두헌 2021 첫해 0.095 [P06][P07] · 계산: 일자리 기울기·가중과 공동 보정 · 배속: 없음(κ에만) · REF 2.3"),
      eduSpeed: p(4.4, "G", "설계 선택: 주민·기업 이동 시간 압축 · Sterman(1989) 지연 되먹임을 수업 안에 표시 [P91][P111] · 계산: 0.0396/0.009=4.4, κ에만 곱함 · 배속: 이 키 · REF 2.4"),
      startMix: p(1, "P", "시작 몫 고정효과 로짓 · Berry(1994) 관측 몫을 대안별 상수로 사용 [P10][P01] · 배속: 없음 · REF 2.5"),
      kappaPopReal: p(0.009, "M", "주민 현실 이동 속도 · 김현우·이두헌 2021 첫해 0.095, Amior–Manning 10년 0.66 [P06][P07][P08] · 계산: 1−exp(−120κ)=0.66→0.009 · 배속: eduSpeed · REF 2.2"),
      betaIndReal: p(0.08, "M", "산업 이주 탄력 · Giroud–Rauh(2019) 법인세 1%p에 고용 0.4% [P27][L01] · 계산: 세율 1단계 약 0.55%p와 짝 · 배속: 없음 · REF 2.7"),
      kappaIndReal: p(0.005, "M", "기업 현실 이동 속도 · BEA(연도 미상) 제조업 건물 감가율 연 3.1%, 설비 7.3~14% [S34] · 계산: 설비 교체 때 입지 재검토 유추, 월 0.004~0.007 · 배속: eduSpeed · REF 2.8"),
      anchor: p(1, "P", "시작 매력 상쇄 · Davies 외(2001) 고정효과가 시작 차이를 흡수 [P01] · 배속: 없음 · REF 2.6"),
      gpYear: p(0.01, "M", "지역 주민 연 성장률 · 행안부 2022–25 연 1.86%, 시도 추계 2025–30 약 0.4% 사이 시나리오 [S01][S02] · 배속: 없음 · REF 2.9"),
      giYear: p(0.012, "M", "지역 종사자 연 성장률 · 통계청(2025) 2024 경기 0.8%·충남 2.4%, 시작 종사자 가중 약 1.4% [S04][S05] · 배속: 없음 · REF 2.10"),
      // 살기 좋음 L 가중치
      wL: p({ rel: 0.26, price: 0.08, air: 0.04, jobs: 0.30, svc: 0.09, tax: 0.04, crowd: 0.19 }, "M", "살기 좋음 가중 · 국가데이터처(2026) 2025 전입 사유 직업32.5·주택18.0·교육9.2% [S03][P15][L32] · 계산: 가족 제외 재배분, rel 0.26 교육 강조(G) · 배속: 없음 · REF 3.2"),
      // 산업 매력 A 가중치(carbon은 CBAM 때 철강 수출 비중만큼 더 커진다)
      wA: p({ rel: 0.26, price: 0.18, re: 0.10, labor: 0.11, talent: 0.08, logi: 0.10, tax: 0.07, inc: 0.05, land: 0.05, carbon: 0.02 }, G, "EVIDENCE §3: 요금 입지 설문·RD(P)의 방향; 근거 약함: 가중 크기는 G"),
      unsZeroL: p(16, G, "주민: 정전 이 %에서 전력 신뢰 0점"),
      unsZeroA: p(3, "M", "산업 전력 신뢰 0점 문턱 · Jin 외(2024) 제조업 VoLL 0.35~0.80USD/kWh [P37][P24][S17] · 계산: 0.6×요금/VoLL = 1.8~4.0% · 배속: 없음 · REF 4.1"),
      hospPen: p(20, G, "병원 정전이 있으면 전력 신뢰 감점"),
      airRef: p(30, G, "근거 약함: EVIDENCE §7 CO₂는 농도·건강의 대리값일 뿐; t/주민 만 명/달이 30이면 37점"),
      crowdK: p(3.5, "G", "설계 선택: 지역 성장 초과 인구 1%당 집값 −3.5점 · Saiz 2007 유입 1%→임대료 약 1%, 방향 근거 [P21][P16] · 배속: 없음 · REF 3.11"),
      landCapMul: p(1.2, G, "산업 용지 수용 = 시작 종사자 × 이 값"),
      reTarget: p(50, G, "재생 비중 이 %면 RE 부분 만점"),
      incRef: p(0.2, G, "유치 보조: 종사자 만 명당 달 이 억이면 63점"),
      eduUni: p(8, G, "대학 하나당 공공서비스 보너스"),
      eduLab: p(5, G, "연구소 하나당 공공서비스 보너스"),
      // 재정(게임 억, 도시 예산 눈금에 맞춤)
      moneyScale: p(28, M, "돈 눈금 · 행안부 2025 자체수입 중 세외수입 21%, 예산×자립도 역산 [S06][X28] · 계산: 세입 기준 게임 1억≈실제 28억, 에너지 원가 눈금과 다름 · 배속: 없음 · REF 6.1"),
      resTax: p(3.0e-5, G, "주민 관련 세: 1명당 달 억(실제 구조: 지방세 중 주민세·재산세 몫 참고)"),
      indTax: p(1.8e-5, G, "산업 관련 세: 종사자 1명당 달 억(지방소득세·법인분 참고)"),
      indTaxK: p(1.7, "M", "산업세 산출 지수 · O’Connell 외(2016) 매출 −5.6%·생산자잉여 −9.5% [X08] · 계산: ln(0.905)/ln(0.944)=1.73, 세수 연결은 가정 · 배속: 없음 · REF 5.3"),
      subRevenueRate: p(0.8, "O", "교부세 기준수입 · 지방교부세법(2026) §8② 표준세율의 80% [L03] · 배속: 없음 · REF 6.5"),
      subAdjust: p(0.5, G, "근거 약함: EVIDENCE §5 교부세 조정률 근사; 전년 표준세입 증가분의 40%를 1월 지원금에서 상쇄"),
      taxStep: p(0.25, "O", "세율 단계당 세입 변화 · 지방세법(2026) §92②·§103의20② 표준세율 ±50% [L01] · 계산: ±2단계=±50% · 배속: 없음 · REF 6.4"),
      svcCost: p(3.3e-5, G, "공공서비스: 1명당 달 억"),
      svcStep: p(0.25, "M", "서비스 단계 비용 · 지방교부세법 시행규칙(2025) 의무지출 근사, 노인복지 단위비용 801,940원 [L05][S11] · 계산: −2단계에도 기준 50% · 배속: 없음 · REF 6.11"),
      tariffMarkup: p(0.02, G, "지역 평균 원가 대비 전기 판매 가산율; 세입에는 차익만 반영"),
      priceFloor: p(0.5, G, "전기요금 점수 원가 하한: 지역 평균의 절반"),
      subBase: p(45, G, "국가 재정지원금 기본(억/년)"),
      subPerCap: p(4e-5, G, "근거 약함: 교부세 수요 원리만 EVIDENCE §5, 1인당 억/년 단가는 게임 눈금"),
      subEq: p(6e-5, G, "근거 약함: EVIDENCE §5 교부세 원리를 단순화한 게임 균형 단가"),
      fsrRef: p(0.486, "G", "설계 선택: 균형 지원금 기준 · 행안부 2025 전국 재정자립도 48.6%(값 O)를 규칙에 차용 [S06] · 배속: 없음 · REF 6.7"),
      fiscalTarget: p(0.6, G, "보통 조건 연 운영 수지 / 시작 현금; 시작 때 정액 보정 지원금 계산"),
      equalizeMaxShare: p(0.5, G, "B14: 1월 지원금에서 정액 보정이 차지할 최대 몫"),
      approvalWindow: p(12, "P", "점수용 누적 지지율 창 · Healy–Lenz(2014) 누적 성과 제시로 최근 편향 감소 [P89] · 계산: 최근 12달 평균 · 배속: 없음 · REF 11.7"),
      revenueVersion: p(2, G, "B11: 세금·지원금만 저장하는 지방채 세입 이력 판본"),
      debtRate: p(0.0024, "M", "지방채 월 이자 · 한국은행 국민주택채권1종 2025 연 2.853% [S13] · 계산: 0.02853/12≈0.0024 · 배속: 없음 · REF 6.13"),
      debtCapRatio: p(0.88, "M", "지방채 한도 · 지방재정법 시행령(2026) 예산 대비 채무 40% 재정위기 [L07][X28] · 계산: 예산/게임 연 세입 2.2×0.40=0.88 · 배속: 없음 · REF 6.12"),
      // 산업 산출 지수
      outRel: p(0.006, "M", "정전 산출 감소 · Allcott 외(2016) 부족 약 10%에 매출 −5.6% [P23][X08] · 계산: 0.056/10≈0.006, 10% 초과는 외삽 · 배속: 없음 · REF 5.1"),
      outRelSemi: p(0.03, G, "EVIDENCE §2 순간 정전 사례(O*) 방향; 근거 약함: 반도체·디스플레이 몫에 곱하는 추가 산출 손실"),
      outMin: p(0.5, G, "산출 지수 하한"),
      outMax: p(1.2, G, "산출 지수 상한"),
      logiPort: p(0.05, G, "EVIDENCE §9 해운 설문(O*) 방향; 근거 약함: 운임 비중 미확인, 지수 -0.3→산출 -1.5% 가정"),
      fxExport: p(0.1, "M", "환율 수출 탄력 · World Bank(2015) 제조업 REER 탄력 −0.62, 부가가치는 1/2~1/6 [I26] · 계산: 0.10~0.31 하단, 게임 명목환율과 차이 · 배속: 없음 · REF 7.12"),
      cbamRate: p(0.02, G, "EVIDENCE §9 임재헌·정윤세(2023, P) 모형 방향; 근거 약함: EU 몫 미확인, 0.12×0.167≈0.02로 근사"),
      lngMarketK: p(0.03, G, "GAMES B1: 지역 화석 사용량/시작 기준 -1의 다음 달 LNG 효과; 근거 약함: 국제시장 가격 결정의 교육용 축소 모형"),
      lngMarketMax: p(0.05, G, "근거 약함: 공유 LNG 시장 가감 상한 ±0.05, 누적하지 않음"),
      co2IntRef: p(0.4567, "O", "계통 전력배출계수 tCO₂/MWh · 환경부고시(2025) 국가 고유 계수 2014–16 평균 0.4567 [L14][I27] · 배속: 없음 · REF 9.7"),
      co2IntDef: p(0.4567, "O", "계통 전력배출계수 tCO₂/MWh · 환경부고시(2025) 국가 고유 계수 2014–16 평균 0.4567 [L14][I27] · 배속: 없음 · REF 9.7"),
      // 집단 만족(부분 점수 가중)
      groupW: p({
        worker: { rel: 0.35, jobs: 0.25, price: 0.05, tax: 0.15, svc: 0.15, crowd: 0.05 },
        youth: { rel: 0.30, jobs: 0.25, crowd: 0.10, svc: 0.15, tax: 0.15, air: 0.05 },
        senior: { rel: 0.35, svc: 0.35, tax: 0.10, price: 0.10, air: 0.10 },
        business: { rel: 0.25, A: 0.20, out: 0.20, taxI: 0.25, svc: 0.10 },
        farm: { rel: 0.30, tax: 0.25, svc: 0.25, price: 0.10, air: 0.10 },
        green: { rel: 0.20, svc: 0.15, tax: 0.10, air: 0.20, ren: 0.20, co2: 0.15 }
      }, G, "설계 선택: 직장인·청년 일자리 가중 확대 · Lewis-Beck–Stegmaier(2000) 경제 쟁점 중시 [P82], 방향 P·크기 G · 배속: 없음 · REF 11.3"),
      seniorHosp: p(15, G, "병원 정전 때 노년 만족 추가 감점"),
      sat0: p(55, G, "집단 만족 시작값"),
      outageSatThreshold: p(1, G, "EVIDENCE §8: 정전 불만이 붙는 %; 근거 약함: 문턱은 게임 가정"),
      outageSatPenalty: p(3, G, "EVIDENCE §8 정전·지지 P 방향; 근거 약함: 정전 달 만족 목표 -3, 누적 감점 아님"),
      unrestOffDrop: p(4, G, "GAMES E3: 시작 지지율 -4 이상 회복해야 시위 종료; 근거 약함: 게임 문턱"),
      unrestAttract: p(2, G, "GAMES E3: 시위 중 기업 유치 순위 감점; 근거 약함: 게임 점수"),
      approvalDrop: p(10, G, "평가 통과: 보정 뒤 시작 지지율에서 허용할 하락 폭"),
      reviewEvery: p(12, "O", "주민 평가 주기 · 지방자치법(2026) 단체장 임기 4년 [L30][L31] · 계산: 48달×1/4=12턴 · 배속: 평가 시간 ×4 · REF 11.8"),
      unrestMonths: p(12, G, "시위 켜짐을 기존 화면에 전달하는 양수 값; 회복 문턱까지 유지"),
      polChangeCost: p(2, G, "시위 기간에 정책 단계 하나 바꿀 때 드는 억"),
      // 기업 이전 희망
      offerGap: p([3, 6], G, "기업 이전 희망 사이 턴 수"),
      offerLife: p(2, G, "제안이 열려 있는 턴 수"),
      seekRate: p(0.05, "M", "구직 인력 · e-나라지표 2025.2 고용률 61.7%·실업률 3.2% [S14][S15] · 계산: 주민×경활 약 0.55×실업 약 0.03×통근권 2(G) ≈ 3.3% · 배속: 없음 · REF 4.10"),
      // 점수
      wScore: p({ pop: 1 / 6, ind: 1 / 6, fin: 1 / 6, co2: 1 / 6, appr: 1 / 6, rel: 1 / 6 }, "G", "설계 선택: 점수 가중은 가치판단 · OECD/JRC(2008) 동일 가중 관행 [I02][I03] · 계산: 여섯 항목 각 1/6 · 배속: 없음 · REF 13.1"),
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
        { id: "ship_red", name: "홍해 해운 차질", dur: [3, 6], fx: { ship: -0.3 }, grade: M, note: "홍해 차질 · World Bank 2023.12~2024.6 LNG Japan 14.44→12.13으로 하락 [S28][S16] · ship 크기 −0.3은 G · 배속: 없음 · REF 7.9", text: "물류비가 오르고 항만 산출이 줄어요" },
        { id: "lng_spike", name: "LNG 가격 급등", dur: [2, 5], fx: { lng: 0.5 }, text: "LNG·디젤 연료비가 크게 올라요" },
        { id: "export_boom", name: "반도체 수출 호황", dur: [4, 8], fx: { export: { semi: 0.25, display: 0.1 } }, text: "반도체 도시 산출이 늘어요" },
        { id: "auto_slump", name: "자동차 수출 둔화", dur: [3, 6], fx: { export: { auto: -0.2 } }, text: "자동차 도시 산출이 줄어요" },
        { id: "cbam", name: "EU 탄소국경조정(CBAM)", dur: [999, 999], fx: { cbam: 1 }, sched: true, text: "철강 공정의 직접배출이 많을수록, EU 수출 비중만큼 산출이 깎여요(단계 도입)" }
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
      { id: "placeholder", text: "시작값은 2025 주민등록·2022/2023 사업체조사·2025 재정자립도 검색 요약(O*)과 추정(G)이 섞임. start.src에 항목별 기준·출처·등급, 원문 대조는 남음." },
      { id: "fiscal", text: "재정지원금 구조는 지방교부세(기준재정수요 − 수입) 원리를 단순화(M)." },
      { id: "cbam", text: "EU CBAM: 2026년 본격 시행, 철강·시멘트·알루미늄 등. 게임에선 2028년 1월부터(G)." }
    ]
  };
  // ECON-DATA §1의 기존 값만 구조화. null 연도는 추정값의 기준연도가 확인되지 않았다는 뜻.
  Object.entries(KCP.ECON_DATA.start).forEach(([id, city]) => {
    const employmentYear = { pyeongtaek: 2022, anseong: 2023, cheonan: 2023 }[id];
    city.src = {
      pop0: { year: "2025.12", source: "행정안전부 주민등록인구", grade: "O*", unit: "명" },
      ind0: { year: employmentYear || null, source: employmentYear ? "전국사업체조사" : "산업 종사자 추정", grade: employmentYear ? "O*" : "G", unit: "명" },
      fsr0: { year: 2025, source: "지방재정365" + (id === "hwaseong" ? " · 두 도시 예산 가중 계산" : ""), grade: id === "hwaseong" ? "M" : "O*", unit: "%" }
    };
  });
  // T3: 기술 계수의 원장은 TECH_DATA. 공통 경제 자료에서도 같은 등급 레코드를 제공한다.
  if (KCP.TECH_DATA) Object.entries(KCP.TECH_DATA.params).forEach(([key, record]) => {
    KCP.ECON_DATA.params["tech_" + key] = record;
  });
  Object.keys(KCP.ECON_DATA.sectors).forEach(k => {
    KCP.ECON_DATA.sectors[k].re100 = KCP.ECON_DATA.params.sectorRe100.v[k];
  });
})();
