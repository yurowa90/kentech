/* 멀티플레이 리그의 지역 묶음. ui/league-core.js · ui/league.js가 읽는다.
 * 한 지역 = 팀(도시 지도 묶음 id) + 이웃 연계선 후보 + 라운드(계절) + 지역 목표 + 지역 한눈 지도.
 * 「멀티 2(전국·광역)」도 같은 모양의 묶음 하나를 더하면 된다(D-54).
 * 수요 규모는 실제 연간 전력사용량 비율로 맞췄다(real). est: true는 추정이라 한전 시군구별 자료로 바꿔야 한다.
 */
(function () {
  "use strict";
  const KCP = window.KCP;
  if (!KCP) return;
  KCP.LEAGUE_REGIONS = {
    south: {
      id: "south", name: "경기 남부·충청권", short: "멀티 1",
      scale: "게임 1 MW ≈ 실제 약 230 MW · 도시 사이 수요 비율은 실제 연간 전력사용량 비율",
      // 팀 순서 = 지도 위 서→동, 북→남 대략. color는 지역 지도와 카드 띠.
      teams: [
        { id: "hwaseong", pack: "hwaseong", name: "화성·오산", color: "#4f8fd6", real: { twh: 22.97, note: "화성 21.37(2024, 보도) + 오산 약 1.6(추정)", est: true } },
        { id: "pyeongtaek", pack: "pyeongtaek", name: "평택", color: "#e0a030", real: { twh: 21.77, note: "2024, 보도(한전 자료 인용)", est: false } },
        { id: "anseong", pack: "anseong", name: "안성", color: "#5fae6e", real: { twh: 3.0, note: "추정", est: true } },
        { id: "dangjin", pack: "dangjin", name: "당진·예산", color: "#8d6cc4", real: { twh: 13.3, note: "당진 약 12.5 + 예산 약 0.8(추정)", est: true } },
        { id: "asan", pack: "asan", name: "아산", color: "#d4664f", real: { twh: 11.0, note: "2012, 지역 보도(오래된 값)", est: true } },
        { id: "cheonan", pack: "cheonan", name: "천안", color: "#3aa6a0", real: { twh: 8.73, note: "2023, 보도(자립도 3.4%)", est: false } }
      ],
      // 이웃 연계선 후보: kind land(육상) · bay(만 횡단) · sea(해저). 비용은 2 MW 기준 억, 4 MW는 ×1.6.
      ties: [
        { a: "hwaseong", b: "pyeongtaek", kind: "land", cost: 10, name: "진위·서정리" },
        { a: "pyeongtaek", b: "anseong", kind: "land", cost: 10, name: "공도" },
        { a: "pyeongtaek", b: "cheonan", kind: "land", cost: 10, name: "성환" },
        { a: "pyeongtaek", b: "asan", kind: "bay", cost: 14, name: "아산호 횡단" },
        { a: "pyeongtaek", b: "dangjin", kind: "bay", cost: 16, name: "서해대교" },
        { a: "anseong", b: "cheonan", kind: "land", cost: 10, name: "입장" },
        { a: "cheonan", b: "asan", kind: "land", cost: 8, name: "배방" },
        { a: "asan", b: "dangjin", kind: "land", cost: 12, name: "북당진–신탕정" },
        { a: "hwaseong", b: "dangjin", kind: "sea", cost: 30, name: "서해 해저" }
      ],
      rounds: [
        { season: "spring", days: 7 }, { season: "summer", days: 7 },
        { season: "autumn", days: 7 }, { season: "winter", days: 7 }
      ],
      // 지역 공동 목표(라운드마다 판정). co2는 7일 지역 합계 t — 디젤만 쓰면 약 4,600~5,200 t, 재생+화력+연계선 조합이면 약 2,200~2,900 t(검사 기록 D-54).
      goals: { unsPct: 0.5, co2: 3000 },
      tips: [
        "이웃과 연계선을 이으면 남는 전기를 팔고 모자랄 때 살 수 있다.",
        "연계선은 두 도시가 모두 동의해야 놓인다 — 비용은 반씩.",
        "도시 안에서 외부 연결점(노란 칸)까지 선을 이어야 거래가 된다.",
        "생산 기준 CO₂와 소비 기준 CO₂ — 발전소가 있는 도시가 남의 배출까지 떠안는다.",
        "전기를 사 오는 도시는 깨끗해 보이지만, 그 전기의 CO₂는 어딘가에서 나왔다.",
        "송전선은 지나가는 마을의 동의가 필요하다 — 연계선 하나에 몇 년이 걸리기도 한다."
      ],
      sources: [
        "평택 21.77 TWh · 화성 21.37 TWh(2024) — 서울신문 2026-05-25 「‘반도체’ 평택·화성·용인, 서울보다 전기 더 썼다」",
        "천안 소비 8,727,421 MWh · 발전 293,161 MWh(2023, 자립도 약 3.4%) — 지역 보도(2026-01)",
        "아산 110억 kWh · 천안 79억 kWh(2012) — 온양신문 「전력소비 천안 능가 - 아산시」",
        "당진 석탄화력 6,040 MW 밀집, 생산 전력 대부분 수도권으로 — 당진시대·위키백과",
        "345 kV 북당진–신탕정 송전선로 12년 6개월 지연 끝에 완공 — 국민일보(쿠키뉴스) 2025",
        "안성·오산·예산·당진 소비량은 추정 — 한전 시군구별 전력사용량(공공데이터 3069444)으로 바꿀 것"
      ],
      // 지역 한눈 지도(육각, 홀수 행 반 칸 오른쪽). 글자: ~ 바다, l 호수, . 다른 지역, 팀 글자는 board.key.
      board: null
    }
  };
})();
