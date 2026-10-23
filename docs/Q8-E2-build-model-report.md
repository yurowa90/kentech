# Q8 E2 — 건설 화면 모형 설명 자료화

2026-10-21 · 시작 `be73d18` · 브랜치 `wip/q8-e3b`

`ui/build.js`의 설명 문자열과 C22의 지정된 두 엔진 참조, `ui/league.js`의 S7 문구만 수정했다. 화면 요소·마크업 배치·CSS·엔진 계산식·기본 계산값은 유지했다. 커밋·브라우저·외부 네트워크·검사 파일 수정은 하지 않았다. **B16·B22·B25·B27 및 B33·S40의 일부는 자료화하지 못했다.** 아래에 남은 이유를 구분한다.

## B10 노출 경로

100 MW 문구는 자유 건설 전용이 아니었다. `#league` 도움말의 **모형 숫자와 자료 출처** 버튼이 `BG.openHelp()`를 호출하므로 평택의 `PK.scale`에 있던 100 MW가 리그에서도 표시됐다.

- `#build`: 기존 `PK.scale` 문자열을 그대로 읽는다. 평택은 `게임 1 MW ≈ 실제 약 100 MW`를 유지한다. 이 저장소의 `PK.scale`은 숫자가 아닌 완성된 문자열이다.
- `#league`: `KCP.league.state()`의 현재 `snap.region` 또는 `S.region`으로 지역을 찾고 `region.mwScale`을 읽는다. 상태가 없는 독립 VM에서는 현재 지도에 속한 지역으로 찾는다. 현재 지역은 230 MW다.
- 지역 자료와 지도 자료 자체는 수정하지 않았다.

## 행별 전후와 자료 키

`공통`은 #build 및 #league의 같은 건설 화면/도움말 경로다. 아래 전후는 전체 문장에서 달라진 부분 또는 대표 숫자다. 현재 값이 맞는 항목은 같은 표기를 유지하고 자료 참조만 바꿨다. 불일치 항목에는 실제 원장의 숫자를 표시했다(예: .4173, .025, 1.3125).

| 행 ID | 화면 위치 | 전 → 후 | 새로 읽는 자료/계산 경계 |
|---|---|---|---|
| A07 | 공통 도시 도움말 | `CO₂ 0.1로 셈 — 바이오 탄소는 회계상 일부만 셈` → `CO₂ 총량에는 0, 바이오 배출 0.1 t/MWh는 별도 정보` | `dispOf("biomass").co2`, `.bioCo2` |
| A08 | 공통 연결점 툴팁 | `CO₂ 0.46` → `CO₂ 0.4173` | `dispOf("import").co2` → `ECON_DATA.params.normalCo2.v` |
| A09 | 공통 도시 도움말 | `CO₂ 0.46` → `CO₂ 0.4173` | 같은 키 |
| A10 | 공통 도시 도움말 | LNG `CO₂ 0.37` 유지, 석탄 지도는 `CO₂ 0.82` | `SITES[].fuel`, `dispOf(kind).co2` |
| A11 | 공통 기존 발전소 툴팁 | LNG `CO₂ 0.37` 유지, 당진 석탄은 이름과 배출계수도 석탄으로 표시 | 같은 키 |
| A12 | 공통 도시·섬 도움말 | 디젤 `CO₂ 0.75` 유지 | `dispOf("diesel").co2` |
| B01 | 공통 팁, 섬 도움말 | `각 95%` → `각 92.2%, 왕복 약 85% · BMS 도입 뒤 각 93.3%, 왕복 약 87%` | `M.batEff`, `bmsParams().efficiency` → `TECH_DATA.params.bmsEfficiency.v` |
| B02 | 공통 도시 도움말 | `GHI × 성능비 0.8` → `GHI × 성능비 0.92 × 날씨 가중치 / 월평균 날씨 가중치` | `M.pvYield`, `M.wxSun`; 날씨 정규화 설명 |
| B03 | 공통 도시 도움말 | `3 / 12 / 25 m/s` 유지 | `M.cutin`, `M.rated`, `M.cutout` |
| B04 | 공통 도시 도움말 | `해상풍력 4 MW · 조력 2 MW × …12.42h` 값 유지, `단순화한 식(실제 출력은 계수·위상 보정)` 명시 | `BLD.offshore.mw`, `BLD.tidal.mw`, `M.tidalPeriod` |
| B05 | 공통 도시 도움말 | `비 ×1.3, 맑음 사흘 넘으면 ×0.7` → 월 강수·날씨별 평균 유량 보정, `비 오면 증가, 맑은 날 사흘째부터 감소`, 정격 상한 설명 | 엔진의 `day.flow / day.flowMean`, 월 강수 정규화와 상한을 정성 설명; 중복 계수 숫자는 제거 |
| B06 | 공통 도시 도움말·연결점 툴팁 | 고정 `기존 LNG 9.5 MW` → 현재 지도 기존 발전소의 실제 용량·연료; 평택 `연결점마다 2.5 MW` → `수입 총 2.5 MW, 연결점마다 0.5 MW`; 리그는 각각 `0.0 MW` | `SITES[].cap/.fuel`, `dispOf("lng").cap`(기존 엔진 fallback), `dispOf("import").cap`, 연결점 수 |
| B07 | 공통 도시 도움말 | `디젤 3 MW(최소 1 MW) · 바이오매스 2 MW` 유지 | `BLD.diesel.mw`, `BLD.biomass.mw`, `dispOf("diesel").min` |
| B08 | 공통 도시 도움말 | 현재 손실·선 단가 표기 유지, `하천·산 ×2 · 바다·호수 ×3`도 엔진 반환값으로 생성 | 기존 `PK.lossPerHex`, `M.lossPerHex`, `lineUnit()` 및 새 `stepMul()` 참조 |
| B09 | 공통 도시 도움말 | 고정 `LNG → 수입 → 디젤·바이오매스` 삭제 → 가격·탄소세에 따라 급전 순서 변동. 자유 건설은 수입도 급전원, 리그는 도시 화력 → 이웃 거래 → 월 모드에서 자동 계통 수입 | `LG`, `leagueMonth()`로 기존 운영 경로 구분; 엔진 순서 변경 없음 |
| B10 | 공통 도시 도움말 | #build 평택 `100` 유지, #league `100` → `230` | `PK.scale` / 현재 지역 `mwScale` |
| B11 | #build 섬 도움말 | `태양광 2 MW · 맑음 1 · 흐림 0.45 · 비 0.2` 유지 | `BLD.solar.mw`, `M.wxSun` |
| B12 | #build 섬 도움말 | `풍력 2 MW × (풍속/12)³` → `풍력 2 MW × min(1, (풍속/12)³)`; 정지 기준 25 유지 | `BLD.wind.mw`, `M.rated`, `M.cutout` |
| B13 | #build 섬 도움말 | `디젤 3 MW · 최소 1 MW · 연료 0.01억/MWh` 유지 | `BLD.diesel.mw`, `dispOf("diesel").min/.fuel` |
| B14 | #build 섬 도움말 | `4 MW/16 MWh · 바닥 10%` 유지 | `BLD.battery.mw`, `M.batMWh`, `M.socFloor` |
| B15 | #build 섬 도움말 | `손실 1.5%/칸 · 선 0.5억/칸 · 산 ×2 · 바다 ×3` 유지 | `PK.lossPerHex || M.lossPerHex`, `lineUnit()`, `stepMul()` |
| B16 | 공통 팁 | `풍속이 2배면 … 약 8배(v³)` 유지・미자료화 | 아래 남은 항목 참조 |
| B18 | 공통 팁 | `흐린 날 … 절반도 안 된다` 유지, 날씨 비율을 바꾸면 실제 비율 문구 생성 | `M.wxSun[1] / M.wxSun[0]` |
| B19 | 공통 정책 카드 | 디젤 탄소세 배수 고정 `×1.5` → 섬 `×1.5` 유지, 도시 기본 `×1.3125` | `dispOf("diesel").fuel/.co2`, `M.taxPerT`, 현재 `leagueMods().fuelMul.diesel` |
| B20 | 공통 정책 카드 | `0.05억/일` 유지, VPP 도입시 `0.025억/일` | `M.drCost × (leagueMods().drCost || 1)`; 기존 실효 피크 감축 설명은 유지 |
| B21 | 공통 정책 카드 | `0.1억/일` 유지 | `M.shareCost` |
| B22 | 공통 미션 카드 | `≤0.5% · 병원 0시간` 유지・미자료화 | 아래 남은 항목 참조 |
| B25 | 공통 미션 카드 | `민원 ≤1건 · 최저 만족 ≥60` 유지・미자료화 | 같은 이유 |
| B26 | 공통 정책 카드 | 평택 `공장 5 → 10 MW` 유지; fab2 없는 지도는 `공장 증설 수요 정의 없음` | 현재 `SITES[].dem.base/.fab2`만 읽음. 노출 조건·활성 조건 유지 |
| B27 | 공통 배치 조언 | `가동 60% 가정` 유지・미자료화 | 아래 남은 항목 및 검사 영향 참조 |
| B32 | 공통 설비/피크 설명 | 기준 `7월` 유지 | `PLAIN_DAY.m + 1` |
| B33 | 공통 연구 카드·정의 | grid의 고정 효과 정의도 현재 지도 손실에서 생성. 기존 화면은 이미 `gridEffectText()`·`bmsEffectText()`를 읽음. fcst `17–22시`는 유지 | `PK.lossPerHex || M.lossPerHex`, `gridLossPerHex()`; fcst 부분은 아래 참조 |
| B34 | 공통 면접 질문 단서 | `배터리 1대 12억` 유지 | `BLD.battery.cost` |
| B39 | 공통 태양광 사양 | `2 MW` 유지 | 현재 지도 `BLD.solar.mw` |
| B40 | 공통 지붕 태양광 사양 | `0.6 MW` 유지 | `BLD.roof.mw` |
| B41 | 공통 풍력 사양 | `2 MW` 유지 | `BLD.wind.mw` |
| B42 | 공통 해상풍력 사양 | `4 MW` 유지 | `BLD.offshore.mw` |
| B43 | 공통 조력 사양 | `2 MW` 유지 | `BLD.tidal.mw` |
| B44 | 공통 소수력 사양 | 섬 `0.8 MW`, 도시 `0.1 MW` 유지 | 현재 지도 override 적용 후 `BLD.hydro.mw` |
| B45 | 공통 디젤 사양 | `3 MW` 유지 | `BLD.diesel.mw` |
| B46 | 공통 바이오매스 사양 | `2 MW` 유지 | `BLD.biomass.mw` |
| B47 | 공통 배터리 사양 | `4 MW/16 MWh` 유지 | `BLD.battery.mw`, `M.batMWh` |
| B48 | 공통 대학 사양 | `연구인력 2 · 0.3 MW` 유지 | `RS.uniStaff`, `BLD.uni.load` |
| B49 | 공통 연구소 사양 | `연구석 3 · 0.3억/주` 유지 | `RS.labSeats`, `RS.labOpexW` |
| B50 | #league 차세대 배터리 사양 | `4 MW/20 MWh` 유지 | `BLD.battery.mw`, `M.batMWh × TECH_DATA.params.nbatCapacity.v` |
| B51 | #league 수소 탱크 사양 | `4 MW/200 MWh · 왕복 35%` 유지 | `TECH_DATA.params.h2MW/h2MWh/h2Efficiency.v` |
| S40 | 공통 연구 설명 | 월 `4.35` / 계절 턴 `3`주치 및 연구소 `3억`은 이미 자료 참조라 유지. 실증 `1달/턴`은 유지・미자료화 | 기존 `TECH_DATA.params.roundSteps.v`, `RS.roundSteps`, `RS.labOpexR` |
| C22 | 엔진 및 #league S7 날씨 단서 | `28℃ 초과` 기본 출력 유지. 엔진 `day.hot`·`day.coolF`와 S7이 같은 키를 읽음 | 새 `M.hotTmax=28`(G 주석), S7 `BG.M.hotTmax` |

## 검사 영향과 문자열 소비

수정 전 `rg`로 대상 문장 조각과 숫자를 `tests/`·`ui/`에서 검색했다. 교체 직전 원문 행별 검색 기록은 `/private/tmp/q8-e2-changes.json`, 문장 조각별 재검색은 `/private/tmp/q8-e2-impact.json`에 있다.

| 발견한 소비자 | 단언/가공 | 판단 |
|---|---|---|
| `tests/league/review/30-s7-attribution.js:251` | `28℃ 초과` 포함 단언 | 기본 출력 동일, 기대값 변경 없음, 전후 통과 |
| `tests/league/review/32-s7-monthly.js:189,191` | 같은 문구 및 일수/비율 접미사 단언 | 기본 출력 동일, 기대값 변경 없음, 전후 통과 |
| 같은 파일의 28℃ 독립 날씨 계산 | 기본 기온 문턱을 28로 검산 | 기본값 유지, 전후 통과. 임시 VM에서는 문턱 35로 바꿔 엔진 두 참조 및 S7의 동반 변화도 별도 확인 |
| `tests/league/v3a.py:438` | 정규식으로 `가동 60% 가정`을 찾음 | B27 문구 유지, 브라우저 실행 금지로 이 검사는 미실행 |
| `tests/league/review/33-model-explanations.js:189` | BMS `왕복 효율 85% → 87%(한 방향 약 93.3%)` 단언 | 기존 `bmsEffectText()` 형식 유지, 전후 통과 |
| `ui/build.js`의 `leagueWords()` | `라운드`·`턴`을 `달`로 `replaceAll` | 해당 토큰과 함수 유지 |
| 배치 조언 렌더링 | `startsWith("일사 배수")`로 강조 | 해당 접두사와 문구 유지 |
| `ui/league.js`의 `POWER_CHIP_DEF` | `BG.powerChipDefinition`을 읽어 사용 | 기본 출력 전체 동일 |
| `ui/hint-data.js`의 같은 풍속 팁 | 같은 문장이 다른 도움말에도 존재 | build 문구를 찾아 치환하는 소비자가 아니며 이번 소유 범위 밖 |

**검사 기대값 변경이 필요한 수정은 발견하지 않았다. 검사 파일 변경은 0개다.**

## 검증

환경은 기존 workspace-write 셸의 Node `v24.21.0`, pnpm `11.25.0`이다. 프로젝트에 package.json·lockfile·Node 버전 파일은 없고 README의 정적 앱 실행 방식을 확인했다. 브라우저나 서버를 띄우지 않았다.

- `ui/*.js` 26개 각각에 `node --check` 실행: 변경 전후 모두 통과. 셸의 `node --check ui/*.js`는 여러 파일 전부를 검사하지 않으므로 파일별로 실행했다.
- 요청된 Node 검사 및 build를 로드하는 추가 검사의 전후 결과는 아래 표와 같다. 기본 23개 명령 중 실제 검사 22개 통과, `28-g10-contract` 1개는 명시적인 은퇴 안내로 건너뛰었다. 추가 16개도 전후 통과해 총 39개 명령 중 **실제 검사 38개 통과·은퇴 1개 건너뜀**이다.
- 변경 전후 로그: `/private/tmp/q8-e2-before/`, `/private/tmp/q8-e2-after/`. 실행 스크립트: `/private/tmp/q8-e2-run.py`.
- `git diff --check`: 통과. `git status --short -- tests`: 출력 없음.

| 검사 (`node tests/league/…`) | 변경 전 통과/실패 | 변경 후 통과/실패 |
|---|---:|---:|
| review/42-explain-model.js | 415/0 | 415/0 |
| review/33-model-explanations.js | 50/0 | 50/0 |
| review/34-model-copy.js | 174/0 | 174/0 |
| review/38-d81-buildlead.js | 176/0 | 176/0 |
| review/41-evidence-all.js | 797/0 | 797/0 |
| review/30-s7-attribution.js | 3056/0 | 3056/0 |
| review/32-s7-monthly.js | 12436/0 | 12436/0 |
| review/40-v5-s7.js | 331/0 | 331/0 |
| review/41-v5-s1.js | 124/0 | 124/0 |
| review/40-d82-perday.js | 304/0 | 304/0 |
| review/9-grid.js | 168/0 | 168/0 |
| test-econ.js | 1291435/0 | 1291435/0 |
| balance.js | 826/0 | 826/0 |
| recal.js | 261/0 | 261/0 |
| sec.js | 734/0 | 734/0 |
| next.js | 580/0 | 580/0 |
| tech.js | 171/0 | 171/0 |
| test-fx-end.js | 13/0 | 13/0 |
| test-fx-region.js | 22/0 | 22/0 |
| test-fx-map.js | 15/0 | 15/0 |
| compact-proposal.js | 743/0 | 743/0 |
| d82ux-node.js | 22/0 | 22/0 |
| review/28-g10-contract.js | 은퇴 건너뜀 | 은퇴 건너뜀 |

추가 16개는 build 모듈명 및 tech 로더 의존성을 `rg`로 찾아 실행했다. 변경 전은 `node --require /private/tmp/q8-e2-head.cjs <검사>`로 HEAD의 build.js·league.js만 메모리에서 읽도록 하고, 변경 후는 `node <검사>`로 현재 파일을 읽었다. 원본 검사와 UI 파일을 되돌리거나 수정하지 않았다. 로그는 `/private/tmp/q8-e2-extra-before/`·`/private/tmp/q8-e2-extra-after/`다.

| 추가 검사 (`tests/league/…`) | HEAD 종료 코드 | 현재 종료 코드 |
|---|---:|---:|
| review/10-tech.js | 0 | 0 |
| review/12-next.js | 0 | 0 |
| review/13-confirmed.js | 0 | 0 |
| review/14-he.js | 0 | 0 |
| review/15-map.js | 0 | 0 |
| review/21-host-policy-grid.js | 0 | 0 |
| review/29-plan-co2.js | 0 | 0 |
| review/31-reweight.js | 0 | 0 |
| review/35-d73-d74-d79.js | 0 | 0 |
| review/36-h03-h04.js | 0 | 0 |
| review/37-d80-grid.js | 0 | 0 |
| review/39-d80-s7.js | 0 | 0 |
| fx_event_seeds.js | 0 | 0 |
| keycheck.js | 0 | 0 |
| v3a-ready.js | 0 | 0 |
| test-fx-audio.js | 0 | 0 |

마지막 지역 선택 보완 뒤 `node --check` 26개와 42·33·34번 검사를 재실행했다. 별도 문구 VM에서는 현재 리그 지역을 같은 지도 묶음의 다른 지역으로 지정해 456 MW가 우선 표시되는 것도 확인했다(`/private/tmp/q8-e2-text-final.log`).

엔진 불변 비교는 `git show HEAD:ui/build.js` 사본과 현재 파일을 서로 다른 VM에 올려 실행했다. 7개 지도 × build/league 두 모드 × 4계절 × 시드 42/2026 × 7/30/90일의 **simulate 반환 전체 336건이 동일**했다. 같은 조합의 날씨 112건, 지도·모드별 BLD 값과 키 구조 14건도 동일했다. 객체 키·배열·TypedArray 타입과 값, 숫자의 음의 0 등을 보존해 재귀 비교했으며 지표 몇 개만 비교한 결과가 아니다. 실제 화면에서 노출되지 않는 섬/league 조합도 이 비교에는 포함했다.

별도 VM에서 실제 `openHelp`·정책 카드·서랍 문자열 생성 함수를 호출하고 M·RS·지도 BLD·TECH_DATA/ECON_DATA params·지역 mwScale을 변형했다. 효율·날씨 가중치·풍속 기준·주기·연구 인력·사양·배출계수·일 정책비·지역 축척의 동반 변화를 확인했다. C22는 문턱을 35로 바꿔 90일의 `day.hot`와 `day.coolF`, S7 일수/비율 문구를 확인했다. 코드는 파일 수정 없이 메모리에서 검사 경계만 노출했고 DOM 접점만 대체했다. 이 검증은 브라우저 E2E나 영구 회귀 검사가 아니다.

VM 비교 명령은 저장소 루트에서 `node /private/tmp/q8-e2-vm.js`, 결과는 `/private/tmp/q8-e2-vm.log`다. 임시 어댑터에 리그 초기화용 이벤트 스텁이 없어 실패한 실행은 스텁 보완 후 다시 실행해 최종 통과를 확인했다.

## 남은 항목과 경계

- **B22·B25·B27**: 0.005·병원 0·민원 1·최저 만족 60·미리보기 가동률 .6은 엔진 함수 안 리터럴이며 대응 M/params 키 또는 결과의 기준값 필드가 없다. 설명에만 새 M 키를 만들면 계산과 설명의 중복 원장이 남는다. 엔진 참조를 새 자료 키로 옮기는 작업은 이번의 ‘설명 문자열만’ 조건과 C22의 명시적 예외 밖이므로 수정하지 않았다. B27은 브라우저 검사 정규식 의존도 있다.
- **B16**: 2배·8배는 세제곱 법칙의 예시이며 엔진의 3승도 리터럴이다. 예시용 M 키를 새로 만들어 모형 파라미터로 보이게 하거나 엔진 지수를 옮기지 않았다.
- **B33 일부**: BMS와 송전 효과는 자료 참조지만 fcst `17–22시`는 엔진 반복문의 시간 범위 리터럴이라 유지했다.
- **S40 일부**: 4.35·3은 이미 자료를 읽는다. 실증 `1달/턴`은 연구 상태 전이 규칙이며 대응 키가 없어 유지했다. `RS`와 TECH_DATA에 새 상태 전이 파라미터는 추가하지 않았다.
- **B26**: 값의 자료화와 잘못된 숫자 표시만 바꿨다. fab2 없는 지도의 카드 노출/활성 조건과 클릭 동작은 남아 있다. 노출 조건 변경은 하지 않았다.
- **B04**: 사용자 허용안 중 ‘단순화’ 명시를 선택했다. .31·+3을 새 자료 키로 옮기거나 발전식을 수정하지 않았다.
- 단위 정의·출처의 관측값(10m/100m 관측 높이 등)은 유지했다. 게임 엔진의 새 자료 키는 승인된 `M.hotTmax` 하나다.
- 브라우저·화면 배치/시각·실제 리그 송수신·외부 자료 검증은 요청에 따라 실행하지 않았다. 장기 전략 민감도/측정 스크립트까지 전부 실행했다고 주장하지 않는다.

## 독립 검토 뒤 고친 것(10-21, Codex가 고치고 총괄 Claude가 확인)

독립 검토 결과는 blocker 0, major 0, minor 7이었다. 7건을 모두 문구로만 고쳤고 엔진 결과는 바뀌지 않았다.

1. 기존 발전소가 없는 지도에서 줄 맨 앞에 ' · '가 붙던 것을 없앴다.
2. 리그 월 모드의 연결점은 '연결점 직접 수입 없음 · 월 운영은 남은 부족을 시간별 수요의 {gridImportShare}%까지 계통에서 보충(CO₂ {normalCo2} t/MWh)'로 보인다. 숫자는 자료에서 읽는다.
3. 소수력 설명을 '맑은 날 줄고 사흘째부터 더 줄어듦'으로 고치고 평균 출력 계수 0.25를 보인다.
4. 조력 식에 계수 0.31을 넣고 '위상 보정 생략'을 밝혔다. 엔진과 설명이 같은 상수를 읽는다.
5. 리그 급전 순서를 '도시 급전원(SMR 포함) → 이웃 거래(부족 보충, 더 싸면 우리 화력 대체) → 자동 계통 수입'으로 고쳤다. SMR을 화력으로 묶지 않는다.
6. grid 기술 효과는 `gridEffectText()` 하나를 쓴다.
7. 지도 자료에 spec이 있으면 그것을 쓰고, 없을 때만 문구를 만든다.

관찰 사항이지만 고치지 않은 것은 세 가지다. 같은 평택 지도의 축척이 #build에서는 100이고 리그에서는 230이다. 평택이 아닌 #build 도시 지도에도 fab2 카드가 보인다(효과 없음 표시). 배터리 팁 '잃는다(각 92.2%)'는 문장이 모호하다.

이 판은 작업 줄기 4141f9a 위로 옮겨 다시 검사했다.

- Node: 리뷰 번호 검사 전부 0, test-econ 통과, balance 826/0, recal 261/0, sec 734/0, next 580/0, tech 171/0.
- 브라우저(샌드박스 밖 로컬): econui 2052/0, next 159/0, solo 480/0, s7 1966/0, v3a 633/0, fx_event 3467/0, econint 72/0, rules·e2e·e2e2·e2e3·mocktest 문제 0, 회귀 base·screens·regression 0. regression은 병렬 실행에서 `.pkg` 대기 시간 초과가 한 번 났고, 단독으로 다시 돌려 0이었다.
