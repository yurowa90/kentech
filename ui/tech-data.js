/* ECON-TECH-SPEC T1–T3가 계약. 출처는 기존 ECON-TECH 조사이며 새 외부 조회 없음.
 * 값의 단위·게임 축소는 각 params의 note, need/demo는 카드 numbers에 기록한다. */
(function () {
  "use strict";
  const KCP = window.KCP;
  if (!KCP) return;
  const source = "docs/ECON-TECH-SPEC.md", evidence = "docs/ECON-TECH.md";
  const p = (v, grade, note, sources = [source, evidence]) => ({ v, grade, note, sources });
  const params = {
    roundSteps: p(4, "G", "리그 달 턴당 4주치; 샌드박스는 기존 주 계산"),
    eurekaFrac: p(1 / 3, "G", "조건 달에 남은 연구량의 1/3, 카드당 한 번"),
    licenseNeed: p(0.5, "G", "기술 이전의 필요 연구량 비율"),
    royalty: p(0.5, "G", "이전 연구 중 원 개발 도시에 월 사용료, 억"),
    royaltyMonths: p(6, "G", "이전 연구의 사용료 최대 지급 달 수"),
    royaltyCap: p(3, "G", "도시별 월 사용료 수입 상한, 억"),
    jointShare: p(0.5, "G", "공동 실증비를 두 도시가 절반씩 부담"),
    hvdcLoss: p(0.012, "G", "연계선 2%→1.2%; 장거리 HVDC 개선폭을 축소", [evidence + "#3", "https://www.brown.edu/Departments/Engineering/Courses/ENGN1931F/HVDC_Proven_TechnologySiemens.pdf"]),
    hvdcCost: p(1.3, "G", "새 HVDC 연계선 건설비; 조사 초안 1.5보다 계약 T1 우선"),
    scableCap: p(1.5, "G", "초전도 용량; 보도 5배 대비 증가폭 배속 0.125"),
    scableLoss: p(0.5, "G", "초전도 연계선 손실 절반; 보도 1/4보다 보수적"),
    scableCooling: p(0.5, "G", "연계선당 월 냉각비 억; 양 끝이 도입하면 절반씩"),
    sicOutput: p(1.015, "P", "SiC 출력 · Hatanaka 외(2015) 최고 효율 99.1% 초과 [P95], 현실 개선 약 1% 추정 · 계산: 1+0.01×1.5 · 배속: 개선폭 ×1.5(G) · REF 12.3", ["P95"]),
    tandemOutput: p(1.2, "P", "탠덤 출력 · Fraunhofer ISE(2026) 2024Q4 결정질 22.7%·탠덤 26.9%, 2030 전망 29/24 [I21][X19][I13] · 계산: 1.18~1.21 · 배속: 없음 · REF 12.2", ["I21", "X19", "I13"]),
    tandemCost: p(1.2, "G", "설계 선택: 탠덤 W당 프리미엄 0 · NREL ATB(2025) 효율비 약 1.2 [I21][I13] · 계산: 출력 1.2×(1+프리미엄 0) · 배속: 없음 · REF 12.2", ["I21", "I13"]),
    nbatCapacity: p(1.25, "G", "새 배터리 16→20 MWh; 밀도 +40% 발표의 0.625배"),
    nbatCost: p(15, "G", "차세대 배터리 건설비 억"),
    massCost: p(0.92, "G", "도입 뒤 새 태양광·배터리 건설비, 시장 가격 하락의 인과값 아님"),
    h2Efficiency: p(0.35, "P", "전기→수소→전기 왕복 효율", [evidence, "https://www.sandia.gov/app/uploads/sites/163/2022/03/ESHB_Ch11_Hydrogen_Headley.pdf"]),
    h2MWh: p(200, "G", "수소 저장 정격 MWh, 시작 잔량 0"),
    h2MW: p(4, "G", "수소 충전·방전 MW"),
    h2Cost: p(28, "M", "수소 저장 건설비 · Sandia(2022) 수전해 740$/kW·연료전지 500$/kW·저장 35$/kWh [I17][I14] · 계산: 11.96M$→18.6~27.5억 상단 · 배속: 없음 · REF 12.4", ["I17", "I14"]),
    h2Co2: p(0.88, "M", "수소 30 vol% 혼소의 열량 약 12% 환산"),
    ccuCo2: p(0.4, "G", "포집 60%; P 포집률 85–90%를 축소"),
    ccuOutput: p(0.79, "M", "포집 후 석탄 출력 · NETL(2022) 순효율 40.2→31.7% [I19][I07] · 계산: 31.7/40.2≈0.79 · 배속: 없음 · REF 12.5", ["I19", "I07"]),
    smrMW: p(20, "G", "지도 규모로 축소한 SMR MW"),
    smrCost: p(150, "M", "SMR 건설비 · IEA(2025) 2040 빠른 경로 낙관 단가 4,500$/kW [I10] · 계산: 20MW=140~207억, 첫 호기와 다름 · 배속: 없음 · REF 12.6", ["I10"]),
    smrTurns: p(6, "P", "SMR 공사 · NREL ATB(2024) 시나리오 43/55/71개월 [I13] · 계산: 대표 55개월→6달 · 배속: 시간 약 ×9 · REF 12.6", ["I13"]),
    smrMin: p(0.8, "G", "SMR 최소 출력 비율"),
    smrFuel: p(0.002, "M", "SMR 연료비 · EIA 2022–24 원자력/가스터빈 연료비 0.16~0.34 [S33] · 계산: LNG 0.008×비=0.0013~0.0027 · 배속: 없음, smrFuelMul은 별도 G · REF 12.6", ["S33"]),
    drEffect: p(1.5, "G", "VPP 수요반응 감축량 배수; 실측 효과 미확인"),
    drCost: p(0.5, "G", "VPP 수요반응 정책비 배수"),
    vppCurtail: p(0.8, "G", "VPP 출력제어 손실 배수"),
    heatDamage: p(0.7, "G", "예측 또는 VPP 폭염 추가 수요 피해 30% 감소 근사(중복 적용 없음)"),
    re100Need: p(30, "G", "RE100 연구 시작은 직전 운영 재생 비중 30% 이상"),
    eurekaSolar: p(10, "G", "탠덤 유레카 태양광 운영 기수"),
    eurekaTies: p(2, "G", "HVDC 유레카 내부 망까지 연결된 연계선 수"),
    eurekaDr: p(3, "G", "VPP 유레카 수요반응 운영 달 수"),
    eurekaApproval: p(55, "G", "SMR 유레카 지지율"),
    titleGrid: p(3, "G", "그리드 칭호 도입 장수"),
    titleOther: p(2, "G", "신소재·수소·AI 칭호 도입 장수"),
    titleSingle: p(1, "G", "환경·원자핵 갈래는 v1 카드 한 장"),
    aiLabs: p(2, "G", "컴퓨터 연구소 목표 수"),
    aiUnis: p(1, "G", "컴퓨터 대학 목표 수"),
    aiResearchReserve: p(2, "G", "컴퓨터는 연구소 운영비 두 턴분을 남긴다"),
    aiOrder: p({ cautious: ["bms", "fcst", "tandem", "nbat", "vpp", "mass", "sic"], balanced: ["grid", "fcst", "hvdc", "vpp", "sic", "scable", "re100"], bold: ["hvdc", "smr", "grid", "sic", "fcst", "vpp", "ccu"] }, "G", "성향별 연구 우선순위")
  };
  // ECON-TECH §1의 공식 목록(O). 카드 배치는 수업용 해석(G)이며 모든 분야를 채울 의무는 없다.
  const fields = [
    "인공지능 알고리즘 및 시스템", "인공지능 기반 응용", "스마트 그리드 및 전력시스템", "전력전자 및 반도체",
    "태양 에너지 응용", "배터리 소재 및 시스템", "나노소재 제조 및 분석", "수소에너지 소재",
    "수소에너지 공정", "탄소자원화 기술", "에너지 화학공학", "원자핵 에너지 시스템"
  ];
  const concentrations = ["지능형 전기안전 융합전공", "연료전지 융합전공", "전력반도체 융합전공", "차세대 SMR 융합전공", "에너지정책 융합전공"];
  const branches = [
    { id: "ai", name: "에너지AI" }, { id: "materials", name: "에너지신소재" },
    { id: "grid", name: "차세대그리드" }, { id: "hydrogen", name: "수소에너지" },
    { id: "climate", name: "환경·기후기술" }, { id: "nuclear", name: "원자핵 에너지" }
  ];
  const card = (id, branch, field, name, need, demo, req, eff, grade, why) => ({
    id, branch, field, name, need, demo, req, eff, grade, why,
    // 공식 명칭과 게임 카드의 대응, 실제 근거와 게임 효과 크기를 각각 표시한다.
    fieldCategory: id === "re100" ? "concentration" : "research", fieldGrade: "O", mappingGrade: "G",
    evidenceGrade: grade.split("·").filter(g => g !== "G").join("·") || "G",
    effectGrade: id === "h2mix" ? "M" : id === "h2store" ? "P·G" : "G",
    sources: [source, evidence, "https://gs.kentech.ac.kr/process/research_field"],
    numbers: { need: p(need, "G", "필요 연구량; 기존 3종은 보존"), demo: p(demo, "G", "실증비 억, 실증 한 턴 뒤 도입") }
  });
  const cards = [
    card("grid", "grid", "스마트 그리드 및 전력시스템", "스마트 송전 운영", 8, 4, [], "현재 지도의 송전 손실을 ⅔로", "M·G", "기존 손실 개선 유지"),
    card("hvdc", "grid", "스마트 그리드 및 전력시스템", "HVDC 연계선", 12, 4, [], "연계선 손실 2→1.2%, 새 선 건설비 ×1.3", "P·G", "짧은 거리에서는 변환소 비용 부담이 크다"),
    card("scable", "grid", "스마트 그리드 및 전력시스템", "초전도 케이블", 24, 10, ["hvdc"], "연계선 용량 ×1.5, 손실 ×0.5, 냉각 월 0.5억/선", "P·G", "저항은 작아져도 냉각 전력과 비용이 든다"),
    card("sic", "grid", "전력전자 및 반도체", "SiC 전력변환", 9, 3, [], "재생 출력 ×1.015", "P·G", "같은 햇빛과 바람에서 변환 손실을 줄인다"),
    card("bms", "materials", "배터리 소재 및 시스템", "배터리 상태 진단·고효율 변환", 6, 3, [], "하한 10→5%, 변환 효율 95→95.5%", "M·G", "기존 배터리 개조비와 효과 유지"),
    card("tandem", "materials", "태양 에너지 응용", "탠덤 태양전지", 12, 5, [], "새 탠덤 태양광 출력·건설비 ×1.15", "P·G", "기존 패널은 바뀌지 않는다"),
    card("nbat", "materials", "배터리 소재 및 시스템", "차세대 배터리", 24, 10, ["bms"], "새 배터리 용량 ×1.25, 화재 면역", "P·G", "효율과 하한은 BMS의 몫"),
    card("mass", "materials", "나노소재 제조 및 분석", "대량 공정", 18, 8, ["tandem", "nbat"], "새 태양광·배터리 건설비 ×0.92", "G", "시장 전체 가격 하락을 한 도시의 연구 성과로 보지 않는다"),
    card("h2store", "hydrogen", "수소에너지 소재", "수전해·수소 탱크", 18, 8, [], "200 MWh 장주기 저장, 왕복 35%", "P·G", "저장은 크지만 손실이 크고 처음에는 비어 있다"),
    card("h2mix", "hydrogen", "수소에너지 공정", "수소 혼소", 12, 6, ["h2store"], "LNG CO₂ ×0.88", "M", "부피 비율과 열량 비율은 다르다"),
    card("ccu", "climate", "탄소자원화 기술", "CCU 개조", 18, 10, [], "석탄 CO₂ ×0.4, 출력 ×0.85", "P·G", "포집에 전기가 든다"),
    card("smr", "nuclear", "원자핵 에너지 시스템", "SMR", 36, 20, [], "20 MW, 150억, 건설 6턴", "P·G", "시간을 압축한 건설이며 실제 인허가 예측이 아니다"),
    card("fcst", "ai", "인공지능 알고리즘 및 시스템", "기상·수요 예측", 6, 2, [], "저녁 피크에 저장을 남기고 사건 예보 범위를 절반으로", "M·G", "예측은 날씨를 바꾸지 않는다"),
    card("vpp", "ai", "스마트 그리드 및 전력시스템", "가상발전소", 12, 4, ["fcst"], "수요반응 ×1.5·비용 ×0.5, 출력제어 ×0.8", "G", "실측 VPP 효과 대신 수업용 가정"),
    card("re100", "ai", "에너지정책 융합전공", "RE100 산단", 12, 4, [], "정책 선택 시 산업 매력 재생 항 가중 ×1.5", "G", "재생이 부족하면 산업 매력도 낮아진다; 에너지정책 융합전공 연계")
  ];
  // build.js가 나중에 로드된다. 표시할 때 현재 PK.lossPerHex에서 읽는다.
  Object.defineProperty(cards.find(c => c.id === "grid"), "eff", {
    enumerable: true,
    get: () => KCP.buildGame?.gridEffectText?.() || "현재 지도의 송전 손실을 ⅔로"
  });
  cards.forEach(c => {
    c.unlock = ({ hvdc: { tie: "hvdc" }, tandem: { builds: ["tandem", "tandem_roof"] },
      nbat: { builds: ["nbat"] }, h2store: { builds: ["h2store"] }, smr: { builds: ["smr"] }, re100: { policy: "re100" } })[c.id] || null;
  });
  const eventHints = {
    heatwave_peak: { cards: ["fcst", "vpp"], text: "예측·가상발전소 기술이 있으면 폭염 피해가 줄어요" },
    typhoon_coast: { cards: ["scable"], text: "초전도 기술이 있으면 연계선 단절을 막아요" }
  };
  const eureka = {
    grid: "내부 송전선 운영", hvdc: "연계선 2개 연결", scable: "HVDC 연계선 운영", sic: "재생 발전 운영",
    bms: "배터리 운영", tandem: "태양광 10기 운영", nbat: "BMS 도입 후 배터리 운영", mass: "탠덤 또는 차세대 배터리 운영",
    h2store: "출력제어 발생", h2mix: "수소 탱크 운영", ccu: "석탄 발전 운영", smr: "지지율 55 이상",
    fcst: "폭염 사건 경험", vpp: "수요반응 정책 3달 운영", re100: "재생 비중 30% 이상 운영"
  };
  const titles = branches.map(b => ({ id: b.id, branch: b.id,
    name: ({ grid: "그리드 개척자", materials: "신소재 개척자", hydrogen: "수소 선도 도시", climate: "탄소 순환 도시", nuclear: "원자핵 개척자", ai: "에너지AI 선도 도시" })[b.id],
    need: params[b.id === "grid" ? "titleGrid" : ["climate", "nuclear"].includes(b.id) ? "titleSingle" : "titleOther"]
  }));
  KCP.TECH_DATA = { fields, concentrations, branches, cards, pairs: [["ccu", "h2store"], ["smr", "scable"]], titles, eureka, eventHints, params };
})();
