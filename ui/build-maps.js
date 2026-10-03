/* 섬 전력망 건설(#build)의 지도 묶음. ui/build.js가 읽는다.
 * rows: 홀수 행이 반 칸 오른쪽인 뾰족한 육각 격자. 글자 뜻은 각 묶음의 legend.
 * sites: 수요지·기존 발전소·외부 전력망 연결점. kind로 수요 모양과 그림을 정한다.
 * dem: 시간별 수요(MW) 규칙. base + day{from,to,v}(그 시간엔 base 대신 v) + morn(7–9시) + eve(18–22시),
 *      weekday{from,to,v}(평일에만 그 시간 v), hot(폭염일 13–18시 +15%), dr(수요반응 대상).
 * 숫자는 모두 연습용 가상 자료다. 평택 묶음의 지명은 실제지만 시설 배치·규모·수치는 지어낸 것이다.
 */
(function () {
  "use strict";
  const KCP = window.KCP;
  if (!KCP) return;
  KCP.BUILD_MAPS = {
    island: {
      id: "island", name: "연습 섬", place: "섬", title: "섬 전력망 건설", kicker: "GRID TYCOON", virtual: "가상 모형",
      seed: 2026, budget: 100, hotAll: true, fitSea: false,
      fuel: { diesel: 0.01 },
      goals: { costBase: 50, costPerDay: 0.5, co2Day: 45 },
      tools: ["solar", "wind", "diesel", "battery", "line", "remove"],
      drText: "F4 −1.5 MW (18–21시)",
      legend: { "~": "sea", b: "beach", p: "plain", f: "forest", h: "hill", m: "mount" },
      rows: [
        "~~~~~~~~~~~~~~~",
        "~~~~~bbhpb~~~~~",
        "~~~bppp1mhbb~~~",
        "~~bpfffpmmhfbb~",
        "~bpffphmmhppp3b",
        "~2ppfphmhpfffpb",
        "~bpppfhmhppfpb~",
        "~~bpfphhppppb~~",
        "~~~bppfppppb~~~",
        "~~~~bbp4pbb~~~~",
        "~~~~~~~~~~~~~~~"
      ],
      // 숫자 칸(1~4)이 차례로 아래 수요지다.
      sites: [
        { id: "F1", code: "F1", kind: "hospital", name: "병원", note: "필수시설", pop: 300, dem: { base: 1.0 } },
        { id: "F2", code: "F2", kind: "village", name: "서부 마을", note: "고령층 많음", pop: 1400, dem: { base: 1.2, eve: 0.8 } },
        { id: "F3", code: "F3", kind: "city", name: "동부 신도시", note: "", pop: 4200, dem: { base: 1.5, morn: 0.5, eve: 1.0 } },
        { id: "F4", code: "F4", kind: "port", name: "항구 산업", note: "", pop: 600, dem: { base: 0.8, day: { from: 8, to: 21, v: 2.0 }, dr: true } }
      ],
      tips: ["능선과 서쪽 해안은 바람이 세다 — 풍속 지도를 켜 보라.", "디젤 연기는 바람을 따라 동쪽으로 간다."]
    },
    pyeongtaek: {
      id: "pyeongtaek", name: "평택", place: "평택", title: "평택 전력망 건설", kicker: "GRID TYCOON · 평택", virtual: "가상 자료",
      note: "실제 지명 · 시설 배치와 수치는 연습용 가상 자료 · 실제 규모의 축소판",
      seed: 3110, budget: 280, hotAll: false, fitSea: true, attachAny: true, lossPerHex: 0.005, lineCost: 2, gridCap: 2.5, scale: "게임 1 MW = 실제 약 100 MW",
      fuel: { diesel: 0.016 },
      bld: { hydro: { mw: 0.1, cost: 2, spec: "0.1 MW" } },
      drText: "산단 −0.6 MW (18–21시)",
      goals: { costBase: 90, costPerDay: 3, co2Day: 45 },
      groups: [
        { id: "ren", name: "재생", icon: "leaf", tools: ["solar", "roof", "wind", "offshore", "tidal", "hydro"] },
        { id: "fire", name: "화력", icon: "diesel", tools: ["diesel", "biomass"] },
        { id: "store", name: "저장", icon: "battery", tools: ["battery"] },
        { id: "grid", name: "송전", icon: "line", tools: ["line"] },
        { id: "rm", name: "철거", icon: "remove", tools: ["remove"] }
      ],
      legend: { "~": "sea", b: "beach", p: "plain", f: "forest", h: "hill", u: "urban", r: "river", l: "lake", x: "out", g: "grid" },
      tname: { beach: "갯벌·해안", plain: "농지", river: "하천(안성천)", lake: "평택호" },
      rows: [
        "~~~~xxxxxxxxxxxxxxxx",
        "~~~~xxxxxxxxxxxxxxxx",
        "~~~~xxxxxxxxxgxxxxxx",
        "~~~xxxxxxxxxhuppfxxx",
        "~~~xxxxxxxxfpuuupxxx",
        "~~~xxxxxppfppuupphxx",
        "~~~xxxxpuppppuuppxxx",
        "~~~xxxppufpppppupxxx",
        "~~~~bupppppppppuupxx",
        "~~~b~upppppppruuuuxx",
        "~~~~~buppfppprpuuuxx",
        "~~~~~uppppfprpuppxxx",
        "~~~~buu~llllrrrgxxxx",
        "~~~~~~~~xxxxxxxxxxxx",
        "~~~~~~~~~~xxxxxxxxxx"
      ],
      sites: [
        {"id": "PORT", "code": "항", "kind": "port", "name": "평택항", "c": 5, "r": 11, "pop": 1000, "dem": {"base": 0.5, "add": [{"from": 8, "to": 21, "v": 0.2}]}},
        {"id": "IND1", "code": "포", "kind": "industry", "name": "포승 국가산단", "c": 6, "r": 10, "pop": 1500, "dem": {"base": 0.8, "day": {"from": 8, "to": 21, "v": 1.5}, "dr": 0.4}},
        {"id": "LNG", "code": "L", "kind": "plant", "name": "포승 LNG 발전소", "c": 5, "r": 9, "pop": 50, "note": "기존", "cap": 9.5},
        {"id": "ANJ", "code": "안", "kind": "town_s", "name": "안중", "c": 8, "r": 6, "pop": 900, "dem": {"base": 0.3, "eve": 0.12, "cool": true, "heat": true}},
        {"id": "HOSP2", "code": "병", "kind": "hospital", "name": "종합병원(안중)", "c": 8, "r": 7, "pop": 600, "note": "필수시설", "dem": {"base": 0.06}},
        {"id": "SONG", "code": "송", "kind": "city_m", "name": "송탄", "c": 13, "r": 4, "pop": 3500, "dem": {"base": 0.6, "eve": 0.25, "morn": 0.06, "cool": true, "heat": true}},
        {"id": "SEOJ", "code": "서", "kind": "rail_s", "name": "서정리역(전철)", "c": 14, "r": 5, "pop": 300, "dem": {"base": 0.06, "off": {"from": 0, "to": 5}}},
        {"id": "JINWI", "code": "진", "kind": "industry", "name": "진위 산업단지", "c": 15, "r": 4, "pop": 1500, "dem": {"base": 0.4, "day": {"from": 8, "to": 21, "v": 0.8}, "dr": 0.2}},
        {"id": "GODEOK", "code": "고", "kind": "city_m", "name": "고덕 신도시", "c": 13, "r": 6, "pop": 3500, "dem": {"base": 0.4, "eve": 0.2, "morn": 0.04, "cool": true, "heat": true}},
        {"id": "FAB", "code": "반", "kind": "factory_big", "name": "반도체 산업단지", "c": 14, "r": 6, "pop": 2500, "dem": {"base": 5.0, "fab2": 10.0}},
        {"id": "UNI", "code": "대", "kind": "school", "name": "대학 캠퍼스", "c": 15, "r": 7, "pop": 1500, "dem": {"base": 0.03, "day": {"from": 9, "to": 18, "v": 0.1}, "cool": true}},
        {"id": "SRT", "code": "지", "kind": "rail", "name": "평택지제역(SRT·KTX)", "c": 15, "r": 8, "pop": 800, "dem": {"base": 0.15, "off": {"from": 0, "to": 5}}},
        {"id": "HOSP1", "code": "병", "kind": "hospital", "name": "종합병원(도심)", "c": 15, "r": 9, "pop": 600, "note": "필수시설", "dem": {"base": 0.06}},
        {"id": "DOWN", "code": "도", "kind": "city_l", "name": "평택 도심", "c": 16, "r": 9, "pop": 5000, "dem": {"base": 1.0, "eve": 0.4, "morn": 0.1, "cool": true, "heat": true}},
        {"id": "FIRE", "code": "소", "kind": "fire", "name": "소방서", "c": 17, "r": 9, "pop": 100, "dem": {"base": 0.01}},
        {"id": "STN", "code": "역", "kind": "rail", "name": "평택역(전철)", "c": 15, "r": 10, "pop": 800, "dem": {"base": 0.15, "off": {"from": 0, "to": 5}}},
        {"id": "HALL", "code": "청", "kind": "gov", "name": "시청·관공서", "c": 16, "r": 10, "pop": 300, "dem": {"base": 0.005, "day": {"from": 9, "to": 18, "v": 0.02}}},
        {"id": "PAENG", "code": "팽", "kind": "town_s", "name": "팽성", "c": 14, "r": 11, "pop": 900, "dem": {"base": 0.2, "eve": 0.08, "cool": true, "heat": true}},
        {"id": "FARM", "code": "농", "kind": "farm", "name": "오성 들녘 양수장", "c": 11, "r": 8, "pop": 100, "dem": {"base": 0.01, "add": [{"from": 6, "to": 18, "v": 0.05, "months": [3, 4, 5, 6, 7]}]}},
        {"id": "LIVE", "code": "축", "kind": "livestock", "name": "축산 단지", "c": 10, "r": 9, "pop": 150, "dem": {"base": 0.05, "hotAdd": 0.03}},
        {"id": "WATER", "code": "수", "kind": "water", "name": "정수·하수처리장", "c": 12, "r": 9, "pop": 100, "dem": {"base": 0.08}}
      ],
      // 월별 기후(1~12월). 노트 문장은 도움말 '자료와 가정'에 그대로 보인다.
      climate: {"lat": 36.99, "lon": 127.11, "ghi_kwh_m2_day": [2.65, 3.4, 4.23, 5.11, 5.48, 5.2, 4.52, 4.53, 4.15, 3.69, 2.74, 2.56], "ghi_note": "위도 36.99°N 대기권 밖 일사량(천문 계산) × 월별 맑음 지수(0.40~0.59). 한국 평균 일사량(연 4.01, 12월 2.56, 5월 5.48 kWh/m²/일)에 맞춰 보정한 연습용 값", "wind10_land": [1.6, 1.8, 2.2, 2.4, 2.2, 1.9, 1.9, 1.8, 1.7, 1.6, 1.8, 1.6], "wind10_note": "평택 기후평년값(1991~2020) 연평균 1.9 m/s, 4월 최대 2.4, 1·10·12월 최소 1.6. 나머지 달은 보간한 추정값", "hub_factor_land": 1.35, "hub_note": "지상 10 m → 80 m 환산(1/7 거듭제곱 법칙)", "wind100_sea": [8.0, 7.6, 7.2, 6.8, 6.0, 5.6, 5.8, 5.6, 6.4, 7.0, 7.6, 8.0], "wind100_sea_note": "서해 해상 100 m 연평균 약 7 m/s(목포대 해상기상탑 보도)를 기준으로, 겨울 북서 계절풍이 센 모양을 가정한 연습용 값", "temp_c": [-1.9, 0.6, 6.0, 12.2, 17.7, 22.4, 25.5, 26.0, 21.4, 14.6, 7.4, 0.4], "temp_note": "중부 서해안 내륙의 대략적 월평균 기온(연습용 근사)"},
      sources: [
        "평택시 인구 598,556명(2024, 평택시 통계)",
        "가정·상업 전력 1인당 연 약 4 MWh로 도시 평균 수요를 어림(→ 도시 합계 실제 약 275 MW)",
        "반도체 공장 1라인 약 500 MW, 4라인 계획 약 2 GW(언론 보도)",
        "평택2복합 LNG 연 약 52억 kWh 발전(서부발전 보도)",
        "경기도 전력소비 143,302 GWh 중 산업 51.7%(경기기후플랫폼)",
        "용도별 실제 비율은 한전 시군구별 전력사용량 자료로 보정 예정"
      ],
      tips: [
        "서해는 조수 간만의 차가 커서 조력 발전 후보지로 거론되어 왔다.",
        "평택 내륙 평균 풍속은 약 1.9 m/s(지상 10 m) — 육상풍력에는 약한 바람.",
        "7월은 장마로 일사량이 5월보다 낮다.",
        "겨울엔 해가 짧아 태양광이 줄고 해상풍은 세다.",
        "조력은 12시간 25분 주기로 오르내린다 — 날씨와 상관없이 미리 알 수 있다.",
        "도시 지붕 태양광은 땅을 새로 쓰지 않는다.",
        "외부 전력망은 편하지만 그 전기의 CO₂도 함께 들어온다(게임 가정).",
        "축산 단지 옆 바이오매스는 가축 분뇨를 연료로 써서 연료비가 싸다(게임 가정).",
        "반도체 단지용 송전망 23 km에 약 4,000억 원 — 송전선로는 주민 반대로 늦어지기도 한다.",
        "작은 시설(병원·소방서·역)은 전기를 적게 쓰지만 끊기면 피해가 크다 — 차단 순서가 중요하다."
      ]
    }
  };
})();
