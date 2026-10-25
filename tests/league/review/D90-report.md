# D-90 엔진·자료·측정 보고

네 조건은 모두 충족했다. 연구0 탄소의 53.85는 D-87 비교 기준이며 새 검사 단언이 아니다. 기존 60.6 대비 차이와 D-62 한계는 별도 표에 남겼다. bots36 지출 분해·35·38·40·41·44의 기존 계약 갱신 필요와 시스템 부하 조건 위반이 있어 전체 검사 통과로 보고하지 않는다.

2026-10-25, `wip/q8-d90`, 기준 `186e182` 위 미커밋 변경. 로컬 Node/Python 검사이며 브라우저·외부 네트워크·커밋은 실행하지 않았다. `aiScoreValue=35`와 기존 근거값·검사 단언을 보존했다.

## 구현과 남은 연결

재개 중 고친 실제 누락: solarHeatMul을 league-core.js의 MUL 목록에 추가해 S7의 사본·사건 교체가 PV 고온 감산을 사건 몫으로 분해하도록 했다. 32번의 17개 FAIL을 보완 전 원자료로 남기고 같은 기존 검사를 다시 실행해 12,428개 단언·0실패를 확인했다. 검사 기대값을 바꿔 해결한 것이 아니다.

호우는 기존 장마 무게 3의 별도 결정적 q=.5 분기다. 전월 제외와 주 추첨·x 난수열을 보존한다. 폭염 달 LNG는 기존·신규 모두 1−(0.226/30)×3×x, solar/roof는 1−.004165×5×x다. dr/save는 수요만 완화한다. 호우 보수 12·폭염 4억에 x와 허용된 dev를 곱해 월 1회 지출하고 남은 교부세를 계획 사용 뒤 보수에 쓴다. 계획 승인과 채무 예외는 그대로다.

석탄·SMR·디젤·탠덤은 적용할 온도계수 근거가 없어 감산하지 않는다. ΔT는 월 대표운전의 G 유효 노출이고 실측 외기·모듈 온도가 아니다. 기준 HEAD 직접 대조(static.cjs)에서 기존 params 266개, 폭염 외 사건 15개, weather/demand 함수, league-ai.js·league-net.js가 보존됨을 확인했다. 겨울 수요 ×1.1, round/year 온도 offset 없음, 사건 없는 달 감산 없음, 연도별 사건확률 상승 없음, svcCost 상시 상승 없음의 경계를 유지했다. AI 조사: `ui/league-ai.js`의 `plan()` 반환값은 plan/econPol/ties뿐이고 `ui/league-core.js`의 `computerPlans()`는 plan/econ/tie/ready만 제출한다. 자동 respond 경로가 없어 새로 만들지 않았다. 발전 설비 forecast는 `publicState={...S,events:[]}`와 `trialMods`를 사용하며 숨은 x를 읽지 않는다. 건설의 `fundingOf`는 공개 grant와 계획 지출만 읽는다.

화면 담당 연결: `ECON_DATA.disasterFacts.rain.text`, `heat.text`, `heat.limitation`, `repair.text`, `grant.text`; `heavy_rain.text`, `opts[].name/note`는 빈 문자열이다. `heavy_rain.name`은 현재 사실 명칭 `호우`이며 빈 문자열이 아니다. 최종 카드 이름은 문구 담당 검토 자리로 남긴다. `cost.repair`, `result.team[id].disasterGrant`의 awarded/planUsed/repairUsed/used/expired/netRepair, `fiscal.exp.repair`, 열 손실 params를 예보·결과·서랍·출처에 연결해야 한다. 계획 화면은 실제 x·실제 보수액을 읽지 말고 fc/fcx 범위를 써야 한다. `league.js`·build.js 화면 함수는 수정하지 않았다.

## 화면 문구 자리

| 자료 필드 | 현재 값 | 담당 인계 |
|---|---|---|
| ECON_DATA.disasterFacts.rain.text | 빈 문자열 | 집중호우와 장마 묶음의 관계 |
| ECON_DATA.disasterFacts.heat.text | 빈 문자열 | 폭염 사건 달의 추가 감산 |
| ECON_DATA.disasterFacts.heat.limitation | 빈 문자열 | 석탄·SMR·디젤·탠덤 미감산 및 근거 한계 |
| ECON_DATA.disasterFacts.repair.text | 빈 문자열 | 도시 공공시설의 월 1회 보수비·G |
| ECON_DATA.disasterFacts.grant.text | 빈 문자열 | 계획 사용 후 잔액의 보수 사용·소멸 |
| heavy_rain.name | 호우 | 사실 명칭으로 남아 있음; 최종 카드 이름 검토 |
| heavy_rain.text | 빈 문자열 | 이번 장마 중 집중호우로 읽히는 설명 |
| heavy_rain.opts[inspect].name / note | 둘 다 빈 문자열 | 비용 1.5억·보수비 dev .8; 구름 손실은 불변 |
| heavy_rain.opts[drain].name / note | 둘 다 빈 문자열 | 비용 4억·보수비 dev .55; 구름 손실은 불변 |

폭염의 기존 name/text/대응 name·note와 호우 why·gradeNote는 비어 있지 않다. 기존 폭염 설명은 수요 중심이므로 새 disasterFacts와의 연결·최종 문구 검토가 필요하다. 실제 x·실제 보수비는 계획 화면에 노출하지 않고 결과에서만 연결한다. 이번 단위의 화면·브라우저 완료로 해석하지 않는다.

## 측정 한 표

넣기 전 전략 수치는 D-87 8차 보관 원자료의 역사적 참조다. 이번에 그 전략 전부를 다시 실행한 값은 아니다. 기준 머리와 당시 기록에서 build.js·econ-data.js 전체 파일 해시는 다르므로 같은 실행으로 취급하지 않는다. 사건 빈도·5씨앗 정책0 호스트의 전기수지와 교부세 장부·실패 검사 대조는 이번에 186e182 소스를 직접 로드해 새로 실행했다. 모든 값은 승인 기본값 고정이며 결과에 맞춘 조정은 없다.

| 항목 | 넣기 전·기준 | D-90 실제 | 판단·범위 |
|---|---|---|---|
| B16 36달 도시 1위 수 | {'nothing': 0, 'base': 1, 'diesel': 1, 'renew': 0, 'ties': 1, 'taxlow': 0, 'taxhigh': 0, 'dm': 0, 'storage': 3} | {'nothing': 0, 'base': 1, 'diesel': 1, 'renew': 0, 'ties': 1, 'taxlow': 0, 'taxhigh': 0, 'dm': 0, 'storage': 3} | 독식 없음 |
| storage 36달 1위 ≤3 | 3/6 | 3/6 | 충족 |
| B16 12달 도시별 1위 | D-87 원자료 참조 | {"hwaseong": ["storage"], "pyeongtaek": ["base"], "anseong": ["diesel"], "dangjin": ["storage"], "asan": ["ties"], "cheonan": ["ties"]} | 독식 검사 결과는 검사 목록 |
| B16 24달 도시별 1위 | D-87 원자료 참조 | {"hwaseong": ["storage"], "pyeongtaek": ["base"], "anseong": ["diesel"], "dangjin": ["renew"], "asan": ["ties"], "cheonan": ["ties"]} | 독식 검사 결과는 검사 목록 |
| B16 36달 도시별 1위 | D-87 원자료 참조 | {"hwaseong": ["storage"], "pyeongtaek": ["base"], "anseong": ["diesel"], "dangjin": ["storage"], "asan": ["storage"], "cheonan": ["ties"]} | 독식 검사 결과는 검사 목록 |
| T5 연구 이득 (0,15] | 3.000000 | 3.016667 | 충족 |
| T5 SMR 1위 | 2/6 | 2/6; {'hwaseong': ['smr'], 'pyeongtaek': ['smr'], 'anseong': ['none', 'ties', 'hybrid'], 'dangjin': ['research'], 'asan': ['renew'], 'cheonan': ['hybrid']} | 희망 ≤3 True; 천안 비교 불가 별도 |
| 연구0 탄소 부분점수 | 평균 58.350000 (더 이전 60.6) | [42.5, 45.3, 98.2, 6.4, 73.2, 84.5]; 평균 58.350000 | D-87 비교선 53.85 이상; 60.6 대비 -2.250000; 값 미조정 |
| B12 화성·오산 | -1,-1,1 67.17687652457208 | -1,-1,1 67.17687652457208 / 2위 0,-1,2 67.13640119194453 / 차 0.0404753326275511 | 반올림 전 |
| B12 평택 | -2,-2,2 68.99525894567998 | -2,-2,2 68.99525894567998 / 2위 -2,-1,2 68.88215473240024 / 차 0.1131042132797404 | 반올림 전 |
| B12 안성 | 0,1,1 81.35891974949729 | 0,2,1 81.22355642066496 / 2위 1,-1,1 81.19910002282495 / 차 0.0244563978400123 | 반올림 전 |
| B12 당진 | -2,-2,2 57.68678999174804 | -2,-2,2 57.68678999174804 / 2위 -2,-1,2 57.62114050030466 / 차 0.06564949144338073 | 반올림 전 |
| B12 아산 | 2,-1,1 75.16200110168782 | 2,-1,1 75.15260173855732 / 2위 1,-1,0 75.06615846740337 / 차 0.08644327115395356 | 반올림 전 |
| B12 천안 | 1,-1,1 77.76475362390684 | 1,-1,1 77.7470951972008 / 2위 0,-1,0 77.66820535585971 / 차 0.07888984134109478 | 반올림 전 |
| B12 감세 계열 ≤3 | 3/6 | 3/6 | 충족 |
| B12 증세 계열 ≤3 | 1/6 | 1/6 | 충족 |
| B16·회계 원자료 검증 | 기존 bots36 생성기: 별도 보수비 항목 없음 | JS 18116건/실패 0; 추가 장부·전략 4049건/실패 0 | 공식 CLI 지출 분해 실패와 구분 |
| B18 | 접속 관측 92·ESS 전체 양수 11 | {"status": "통과", "bundles": 14, "observedBundles": 13, "observedMonths": 243, "improvedBundles": 0, "individualCapturedMWh": 0, "collectiveEvidence": "관측 있음", "collectiveMonths": 92, "collectiveImprovedMonths": 11, "collectiveCapturedMWh": 395.0814872140348} | 원본 b18.log 및 bots36.log의 판정 |
| sec careful·36달 크기 | 연계선 4, 양수 후보 9, 봉투 최대 162660 bytes | size: 30/36 months, 157678 bytes max; size: 36/36 months, 162942 bytes max; careful 연계선 조건부 사례 {"cases":1,"aiScoreValue":35,"half":50,"cash":{"hwaseong":116.64000000000026,"pyeongtaek":38.87999999999921},"net":{"hwaseong":66.64000000000026,"pyeongtaek":380.8799999999993}}; careful 실제 후보 순이득 요약 {"candidates":1129,"eligible":1120,"positive":9,"immediate":9,"deferred":0,"missed":0,"followupMissed":0,"maxNet":51.2891113158336}; checks 744 fail 0 | 실제 FAIL 목록 별도 |
| sec bold 36달 | D-87 careful 192기/30연구/4선, bold 63기/29연구/3선 | 63기 / 29연구 / 3선 / 최대 봉투 155396 bytes | D-77 실제 축약·복원 검사 |
| sec careful 36달 | D-87 careful 192기/30연구/4선, bold 63기/29연구/3선 | 192기 / 30연구 / 4선 / 최대 봉투 162942 bytes | D-77 실제 축약·복원 검사 |
| D-62 화성·오산 | 6.529608%p; 합법 입지 79 | 6.529608%p; 합법 입지 79 | 충족 |
| D-62 평택 | 3.516817%p; 합법 입지 40 | 3.516817%p; 합법 입지 40 | 충족 |
| D-62 안성 | 6.568569%p; 합법 입지 22 | 6.568569%p; 합법 입지 22 | 충족 |
| D-62 당진 | 1.169230%p; 합법 입지 28 | 1.169230%p; 합법 입지 28 | 미달 |
| D-62 아산 | 7.218696%p; 합법 입지 19 | 7.218696%p; 합법 입지 19 | 충족 |
| D-62 천안 | 0.000000%p; 합법 입지 1 | 0.000000%p; 합법 입지 1 | 비교 불가 |
| 화성 정책0 alpha | 0달 / 전기수지 35.615286억 | 0달 / 전기수지 35.597143억 | 36달; 전기 총매출+거래−자체연료−계통−구매 |
| 화성 정책0 beta | 0달 / 전기수지 181.111857억 | 0달 / 전기수지 181.392714억 | 36달; 전기 총매출+거래−자체연료−계통−구매 |
| 화성 정책0 gamma | 0달 / 전기수지 264.169286억 | 0달 / 전기수지 264.828714억 | 36달; 전기 총매출+거래−자체연료−계통−구매 |
| 화성 정책0 delta | 0달 / 전기수지 117.971857억 | 0달 / 전기수지 117.971857억 | 36달; 전기 총매출+거래−자체연료−계통−구매 |
| 화성 정책0 epsilon | 0달 / 전기수지 135.861429억 | 0달 / 전기수지 135.861429억 | 36달; 전기 총매출+거래−자체연료−계통−구매 |
| 5씨앗 화성·오산 교부·보수 장부 | 교부 80.00 / 계획 20.00 / 보수 0 / 소멸 60.00 / 순부담 0 | 교부 90.00 / 계획 20.00 / 보수 18.38 / 소멸 51.62 / 총보수 27.53 / 순부담 9.15 | 게임억; 180 도시·달 누계 |
| 5씨앗 화성·오산 폭염 감산 | 추가 감산 0 | 3 도시·달 / LNG 가용 736.955201 / LNG 자체 급전차(무감산−감산) -3.384192 / PV 가용 54.960637 | MWh; 같은 날씨·수요·계획의 해당 감산만 제거한 대조 |
| 5씨앗 평택 교부·보수 장부 | 교부 80.00 / 계획 34.00 / 보수 0 / 소멸 46.00 / 순부담 0 | 교부 90.00 / 계획 34.00 / 보수 13.56 / 소멸 42.44 / 총보수 27.53 / 순부담 13.97 | 게임억; 180 도시·달 누계 |
| 5씨앗 평택 폭염 감산 | 추가 감산 0 | 3 도시·달 / LNG 가용 519.031238 / LNG 자체 급전차(무감산−감산) 16.033544 / PV 가용 50.688263 | MWh; 같은 날씨·수요·계획의 해당 감산만 제거한 대조 |
| 5씨앗 안성 교부·보수 장부 | 교부 50.00 / 계획 38.00 / 보수 0 / 소멸 12.00 / 순부담 0 | 교부 60.00 / 계획 38.00 / 보수 13.56 / 소멸 8.44 / 총보수 27.53 / 순부담 13.97 | 게임억; 180 도시·달 누계 |
| 5씨앗 안성 폭염 감산 | 추가 감산 0 | 3 도시·달 / LNG 가용 0.000000 / LNG 자체 급전차(무감산−감산) 0.000000 / PV 가용 7.583865 | MWh; 같은 날씨·수요·계획의 해당 감산만 제거한 대조 |
| 5씨앗 당진 교부·보수 장부 | 교부 80.00 / 계획 10.00 / 보수 0 / 소멸 70.00 / 순부담 0 | 교부 90.00 / 계획 10.00 / 보수 23.12 / 소멸 56.88 / 총보수 27.53 / 순부담 4.41 | 게임억; 180 도시·달 누계 |
| 5씨앗 당진 폭염 감산 | 추가 감산 0 | 3 도시·달 / LNG 가용 0.000000 / LNG 자체 급전차(무감산−감산) 0.000000 / PV 가용 31.388772 | MWh; 같은 날씨·수요·계획의 해당 감산만 제거한 대조 |
| 5씨앗 아산 교부·보수 장부 | 교부 80.00 / 계획 0.00 / 보수 0 / 소멸 80.00 / 순부담 0 | 교부 90.00 / 계획 0.00 / 보수 23.12 / 소멸 66.88 / 총보수 27.53 / 순부담 4.41 | 게임억; 180 도시·달 누계 |
| 5씨앗 아산 폭염 감산 | 추가 감산 0 | 3 도시·달 / LNG 가용 315.081952 / LNG 자체 급전차(무감산−감산) 62.484381 / PV 가용 27.526197 | MWh; 같은 날씨·수요·계획의 해당 감산만 제거한 대조 |
| 5씨앗 천안 교부·보수 장부 | 교부 50.00 / 계획 10.00 / 보수 0 / 소멸 40.00 / 순부담 0 | 교부 60.00 / 계획 10.00 / 보수 23.12 / 소멸 26.88 / 총보수 27.53 / 순부담 4.41 | 게임억; 180 도시·달 누계 |
| 5씨앗 천안 폭염 감산 | 추가 감산 0 | 3 도시·달 / LNG 가용 133.261567 / LNG 자체 급전차(무감산−감산) 105.093782 / PV 가용 25.319437 | MWh; 같은 날씨·수요·계획의 해당 감산만 제거한 대조 |
| 월 사건 heatwave_peak | 1452 / 72000 | 1452 / 72000; spring 0.000000→0.000000%; summer 8.318101→8.318101%; autumn 0.000000→0.000000%; winter 0.000000→0.000000% | 표본 완전 일치 |
| 월 사건 evening_peak_tropical_night | 1088 / 72000 | 1088 / 72000; spring 0.000000→0.000000%; summer 5.686278→5.686278%; autumn 0.000000→0.000000%; winter 0.000000→0.000000% | 표본 완전 일치 |
| 월 사건 monsoon_cloud | 1566 / 72000 | 779 / 72000; spring 0.000000→0.000000%; summer 8.318101→4.159051%; autumn 0.000000→0.000000%; winter 0.000000→0.000000% | 묶음 분할 |
| 월 사건 heavy_rain | 0 / 72000 | 787 / 72000; spring 0.000000→0.000000%; summer 0.000000→4.159051%; autumn 0.000000→0.000000%; winter 0.000000→0.000000% | 묶음 분할 |
| 월 사건 typhoon_coast | 1453 / 72000 | 1453 / 72000; spring 0.000000→0.000000%; summer 5.396787→5.396787%; autumn 2.510716→2.510716%; winter 0.000000→0.000000% | 표본 완전 일치 |
| 월 사건 coldwave_heating | 2055 / 72000 | 2055 / 72000; spring 0.000000→0.000000%; summer 0.000000→0.000000%; autumn 0.000000→0.000000%; winter 10.598132→10.598132% | 표본 완전 일치 |
| 월 사건 heavy_snow_solar | 1355 / 72000 | 1355 / 72000; spring 0.000000→0.000000%; summer 0.000000→0.000000%; autumn 0.000000→0.000000%; winter 7.268046→7.268046% | 표본 완전 일치 |
| 월 사건 finedust_coal_cap | 24000 / 72000 | 24000 / 72000; spring 33.333333→33.333333%; summer 0.000000→0.000000%; autumn 0.000000→0.000000%; winter 100.000000→100.000000% | 표본 완전 일치 |
| 월 사건 spring_dust_haze | 1345 / 72000 | 1345 / 72000; spring 7.319951→7.319951%; summer 0.000000→0.000000%; autumn 0.000000→0.000000%; winter 0.000000→0.000000% | 표본 완전 일치 |
| 월 사건 light_load_curtailment | 0 / 72000 | 0 / 72000; spring 0.000000→0.000000%; summer 0.000000→0.000000%; autumn 0.000000→0.000000%; winter 0.000000→0.000000% | 표본 완전 일치 |
| 월 사건 line_opposition_delay | 2781 / 72000 | 2781 / 72000; spring 4.424811→4.424811%; summer 2.863678→2.863678%; autumn 4.449818→4.449818%; winter 3.667329→3.667329% | 표본 완전 일치 |
| 월 사건 semiconductor_fab_expansion | 5237 / 72000 | 5237 / 72000; spring 8.400575→8.400575%; summer 5.517792→5.517792%; autumn 8.479163→8.479163%; winter 7.043946→7.043946% | 표본 완전 일치 |
| 월 사건 datacenter_siting | 5333 / 72000 | 5333 / 72000; spring 8.400575→8.400575%; summer 5.517792→5.517792%; autumn 8.479163→8.479163%; winter 7.043946→7.043946% | 표본 완전 일치 |
| 월 사건 planned_maintenance | 3068 / 72000 | 3068 / 72000; spring 8.628702→8.628702%; summer 0.000000→0.000000%; autumn 8.658413→8.658413%; winter 0.000000→0.000000% | 표본 완전 일치 |
| 월 사건 coal_phaseout | 1442 / 72000 | 1442 / 72000; spring 0.000000→0.000000%; summer 0.000000→0.000000%; autumn 4.493744→4.493744%; winter 3.667326→3.667326% | 표본 완전 일치 |
| 월 사건 re100_buyer | 5328 / 72000 | 5328 / 72000; spring 8.400575→8.400575%; summer 5.517792→5.517792%; autumn 8.479163→8.479163%; winter 7.043946→7.043946% | 표본 완전 일치 |
| 월 사건 regional_tariff | 2694 / 72000 | 2694 / 72000; spring 4.424811→4.424811%; summer 2.863678→2.863678%; autumn 4.449818→4.449818%; winter 3.667329→3.667329% | 표본 완전 일치 |
| 추첨·x 난수열 보존 | 186e182 직접 로드 | 72000달 heavy_rain→monsoon_cloud 정규화 뒤 id·x 전부 동일; 이론 최대오차 2.7755575615628914e-17 | 2000씨앗×36달; q 표본 0.502554 |
| 네 조건 종합 | D-87 8차 충족 | {"B16·storage": true, "T5 연구 이득": true, "B12 반올림 전": true, "연구0 탄소(기존 비교선 53.85)": true} | 모두 충족 |

이론 확률은 6도시·당진–아산 연계선 유효, 첫 달 전월 없음의 36달 전이 누적 계절 평균이다. 표본도 같은 후보 유효조건으로 2000씨앗×36달이다. 계절관리제는 12·1·2·3월 100% 확정이며 일반 무작위 사건과 구분한다. `frequency.json`의 월별 표본과 전이 분포를 보존했다.

LNG 가용 감산 MWh는 연결된 cap 감소×24×달력일수다. LNG 자체 급전차는 거래 전 simTeam에서 해당 LNG 감산만 제거한 대조의 부호 있는 차이(무감산−감산)이며, 수출 추가 급전을 포함한 지역 순발전 감소와 다르다. 화성 합계는 -3.384192 MWh로, 감산 상태의 자체 LNG 생산이 그만큼 더 컸다. 망 손실·급전 재배분이 포함되는 발전량 차이를 가용용량 감소량으로 바꾸거나 0으로 자르지 않았다. 이 관측만으로 특정 발전소의 물리적 효율 변화를 추정하지 않는다. PV는 접속·날씨·다른 배수를 고정한 버림 전 가용량 차이다. 지역 총생산이나 판매 손실로 읽지 않는다.

## 검사 결과

초기에는 엔진 6파일 해시 일치를 확인해 이전 완료 결과와 T5 고아 로그를 인계했다. 이후 32-s7-monthly가 solarHeatMul의 공통 사건 배수 목록 누락을 17개 FAIL로 검출했다. MUL 한 줄을 보완하고 기본 검사·번호 검사·sec·T5를 모두 최종 코드로 다시 실행했다. 표의 T5 종료코드는 이번 재실행에서 직접 수집한 값이다. 보완 전 로그·manifest는 pre-mul-validation/에 보존했다. bots36·B18·도시별 호스트·D-62는 보완 뒤 시작한 실행이다. 72,000달 빈도 대조는 drawEvents·사건 자료가 한 줄 보완 전후 완전히 같아 그대로 사용했다(mul-fix.json).

기존 검사·자료 202개 파일은 기준 HEAD 사본과 바이트 단위로 동일함을 확인했다(test-preservation.json). 아래 FAIL 수는 `DETECTED`로 시작하는 의도된 변이 탐지 행을 제외한다. 번호 검사 27·28의 은퇴 건너뜀과 18의 무인자 안내는 통과 주장과 구분하며, 18은 bots36 원자료를 넣어 추가 실행했다.

| 명령/로그 이름 | 실행 구분 | 종료 | 실제 FAIL·오류 행 | DETECTED 행·JSON | 출력 요약 |
|---|---|---:|---:|---:|---|
| frequency | 추첨 함수 불변·기존 측정 재사용 | 0 | 0 | 0행 | 상세 로그 참조 |
| bots36 | MUL 보완 뒤 측정 | 1 | 2 | 0행 | B18 씨앗 집계: 통과 1 · 실패 0 · 관측 없음 0 / B18 씨앗 1: {"status": "통과", "bundles": 14, "observedBundles": 13, "observedMonths": 243, "improvedBundles": 0, "individualCapturedMWh": 0, "collectiveEvidence": "관측 있음", "collectiveMonths": 92, "collectiveImprovedMonths": 11, "collectiveCapturedMWh": 395.0814872140348} |
| host-alpha | MUL 보완 뒤 측정 | 0 | 0 | 0행 | 상세 로그 참조 |
| host-beta | MUL 보완 뒤 측정 | 0 | 0 | 0행 | 상세 로그 참조 |
| host-gamma | MUL 보완 뒤 측정 | 0 | 0 | 0행 | 상세 로그 참조 |
| host-delta | MUL 보완 뒤 측정 | 0 | 0 | 0행 | 상세 로그 참조 |
| host-epsilon | MUL 보완 뒤 측정 | 0 | 0 | 0행 | 상세 로그 참조 |
| siting | MUL 보완 뒤 측정 | 0 | 0 | 0행 | 상세 로그 참조 |
| 32-s7-monthly | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| bots36-capture | 최종 코드 재실행 | 1 | 2 | 0행 | B18 씨앗 집계: 통과 1 · 실패 0 · 관측 없음 0 / B18 씨앗 1: {"status": "통과", "bundles": 14, "observedBundles": 13, "observedMonths": 243, "improvedBundles": 0, "individualCapturedMWh": 0, "collectiveEvidence": "관측 있음", "collectiveMonths": 92, "collectiveImprovedMonths": 11, "collectiveCapturedMWh": 395.0814872140348} |
| bots36-ledger | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| b18 | 최종 코드 재실행 | 0 | 0 | 0행 | B18 씨앗 집계: 통과 1 · 실패 0 · 관측 없음 0 / B18 씨앗 1: {"status": "통과", "bundles": 14, "observedBundles": 13, "observedMonths": 243, "improvedBundles": 0, "individualCapturedMWh": 0, "collectiveEvidence": "관측 있음", "collectiveMonths": 92, "collectiveImprovedMonths": 11, "collectiveCapturedMWh": 395.0814872140348} |
| 18-growth-data | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| test-econ | 최종 코드 재실행 | 0 | 0 | 0행 | 시험: 1293801 통과, 0 실패 |
| balance | 최종 코드 재실행 | 0 | 0 | 0행 | H01 PM2.5 증분·정전 상한 통과 19/19 / pass 826 fail 0 |
| recal | 최종 코드 재실행 | 0 | 0 | 0행 | 미구현 0 (실패에 포함), 그중 H01 뒤 미구현 허용 0 / 통과 261 / 실패 0 |
| next | 최종 코드 재실행 | 0 | 0 | 0행 | checks 580 fail 0 |
| tech | 최종 코드 재실행 | 0 | 0 | 0행 | checks 173 fail 0 |
| evsrc-node | 최종 코드 재실행 | 0 | 0 | 0행 | evsrc-node: 53/53 통과, 0 실패 |
| ai-check | 최종 코드 재실행 | 0 | 0 | 0행 | checks 6736 pass 6736 fail 0 |
| 1-invariants | 최종 코드 재실행 | 0 | 0 | 0행 | checks 4510795, fails 0 |
| 2-extremes | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 3-policy-grid | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 4-drift | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 5-exploits | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 6-ind-jump | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 7-fiscal-approval | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 8-offers | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 9-grid | 최종 코드 재실행 | 0 | 0 | 0행 | B18: 168 통과, 0 실패 |
| 10-tech | 최종 코드 재실행 | 0 | 0 | 0행 | T1–T3/T5: 383 통과, 0 실패 |
| 12-next | 최종 코드 재실행 | 0 | 0 | 0행 | NEXT 독립 검사: 242 통과, 0 실패 |
| 13-confirmed | 최종 코드 재실행 | 0 | 0 | 0행 | 확정 결함: 170 통과, 0 실패 |
| 14-he | 최종 코드 재실행 | 0 | 0 | 0행 | H-E checks 159 fail 0 |
| 15-map | 최종 코드 재실행 | 0 | 0 | 0행 | 지도 유지 checks 9 fail 0 |
| 15-recal-r2 | 최종 코드 재실행 | 0 | 0 | 0행 | R2 checks 14738, fail 0 |
| 16-recal-audit | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 17-ai-r2 | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 18-growth-calibration | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 19-fiscal-grid | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 20-fiscal-contract | 최종 코드 재실행 | 0 | 0 | 0행 | G3 fiscal contract pass 864 fail 0 |
| 21-host-policy-grid | 최종 코드 재실행 | 0 | 0 | 0행 | B12 host grid 750 combinations; fail 0 |
| 22-g4-contract | 최종 코드 재실행 | 0 | 0 | 0행 | G4 contract pass 67 fail 0 |
| 23-g5-contract | 최종 코드 재실행 | 0 | 0 | 0행 | G5 contract pass 102 fail 0 |
| 24-g5-ai-debt | 최종 코드 재실행 | 0 | 0 | 0행 | G5 AI pass 2592 fail 0; /tmp/q8-d90-data/g5-ai.json |
| 25-g6-score-contract | 최종 코드 재실행 | 0 | 0 | 0행 | G7 점수 계약: 66 통과, 0 실패 |
| 26-g9-start-contract | 최종 코드 재실행 | 0 | 0 | 0행 | G9 carbon pass 42 fail 0 |
| 27-g9-preservation | 최종 코드 재실행 | 0 | 0 | 0행 | 은퇴, 건너뜀: G9(재보정 9차) 차수 전용 가드(기준 4aad101). KCP_RUN_RETIRED=1로 실행 가능 |
| 28-g10-contract | 최종 코드 재실행 | 0 | 0 | 0행 | 은퇴, 건너뜀: G10(재보정 10차) 차수 전용 가드(기준 cc8fd25). KCP_RUN_RETIRED=1로 실행 가능 |
| 29-host-air | 최종 코드 재실행 | 0 | 0 | 0행 | S8 host air checks 989 fail 0 |
| 29-plan-co2 | 최종 코드 재실행 | 0 | 0 | 0행 | S3 plan CO2 checks 1521 fail 0 |
| 29-r3-air | 최종 코드 재실행 | 0 | 0 | 0행 | S4 H01/H03/H04 pass 122 fail 0 |
| 30-s7-attribution | 최종 코드 재실행 | 0 | 0 | 0행 | S7 attribution checks 3074 fail 0 |
| 31-reweight | 최종 코드 재실행 | 0 | 0 | 0행 | 31 가중치 다시 계산: 가중 19종 × 상태 8개 = 152경우, 3551 통과, 0 실패 |
| 33-model-explanations | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 34-model-copy | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 35-d73-d74-d79 | 최종 코드 재실행 | 1 | 1 | 0행 | 상세 로그 참조 |
| 36-h03-h04 | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 37-d80-grid | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 38-d81-buildlead | 최종 코드 재실행 | 1 | 1 | 0행; JSON 1/1 | 상세 로그 참조 |
| 39-d80-s7 | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 39-evidence-params | 최종 코드 재실행 | 0 | 0 | 0행; JSON 66/66 | 상세 로그 참조 |
| 40-d82-perday | 최종 코드 재실행 | 1 | 1 | 0행; JSON 3/3 | 상세 로그 참조 |
| 40-v5-s7 | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 41-evidence-all | 최종 코드 재실행 | 1 | 2 | 0행; JSON 273/273 | 상세 로그 참조 |
| 41-v5-s1 | 최종 코드 재실행 | 0 | 0 | 0행 | PASS 2·3 §2·3 지난달 가장 큰 몫 event/missedCarry: 규칙2 건너뜀 / PASS 4 §3 지난달 가장 큰 몫 event/missedCarry: 규칙2 건너뜀 꼬리표·값·비교 |
| 42-explain-model | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 42-s1-s7-mutations | 최종 코드 재실행 | 0 | 0 | 29행 | DETECTED N2 이하를 미만·문턱 올림을 반올림으로 복귀: 51 failing cases; FAIL V8 N2 grid/고르기 건너뜀 무작위·경계 124개: 고르기 건너뜀/0.1237: 바깥 계통에 기댄 전기 변화의 원인 하나!각 단계에서 조건 하나를 바꿔 앞 단계와의 차이를 그 조건의 몫으로 계산해요.접속 대기 12 MW(효과 0.1 MWh/일 미만) / DETECTED 약속 있는 달 같음 조건을 늘 참으로: 5 failing cases; FAIL 22 S7 첫 줄 grid/늘 달·예측은 같을 것: 실제 방향·약속·건너뜀에 따른 유무 |
| 43-dispfuel | 최종 코드 재실행 | 0 | 0 | 0행 | 단언 변이: 통과 3 / 실패 0 / 통과 130 / 실패 0 |
| 44-grant | 최종 코드 재실행 | 1 | 13 | 0행 | 하네스: 통과 0 / 실패 1 / 검사 193건: 통과 180 / 실패 13; 단언 실행 23625회; 변이 DETECTED 0/9 |
| 45-d87-engine | 최종 코드 재실행 | 0 | 0 | 0행 | PASS D-87 engine contracts |
| 46-d87-ai-score | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 47-d87 | 최종 코드 재실행 | 0 | 0 | 0행 | B18 일반 main·집계 무관측 실패·CLI 7경로 종료 코드 확인 / 47-d87 checks 21 fail 0 |
| sec | 최종 코드 재실행 | 0 | 0 | 0행 | checks 744 fail 0 |
| smoke | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| physical | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| static | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| 11-tech-balance | 최종 코드 재실행 | 0 | 0 | 0행 | T5 전략: 20322 통과, 0 실패; /tmp/q8-d90-data/tech-balance.json |
| baseline-35-d73-d74-d79 | 기준 HEAD 186e182 대조 | 0 | 0 | 0행 | 상세 로그 참조 |
| baseline-38-d81-buildlead | 기준 HEAD 186e182 대조 | 0 | 0 | 0행; JSON 1/1 | 상세 로그 참조 |
| baseline-40-d82-perday | 기준 HEAD 186e182 대조 | 0 | 0 | 0행; JSON 3/3 | 상세 로그 참조 |
| baseline-41-evidence-all | 기준 HEAD 186e182 대조 | 0 | 0 | 0행; JSON 273/273 | 상세 로그 참조 |
| baseline-44-grant | 기준 HEAD 186e182 대조 | 0 | 0 | 9행 | 변이: 통과 9 / 실패 0 / 검사 195건: 통과 195 / 실패 0; 단언 실행 23744회; 변이 DETECTED 9/9 |
| baseline-32-s7-monthly | 기준 HEAD 186e182 대조 | 0 | 0 | 0행 | 상세 로그 참조 |
| baseline-host-alpha | 기준 HEAD 186e182 대조 | 0 | 0 | 0행 | 상세 로그 참조 |
| baseline-host-beta | 기준 HEAD 186e182 대조 | 0 | 0 | 0행 | 상세 로그 참조 |
| baseline-host-gamma | 기준 HEAD 186e182 대조 | 0 | 0 | 0행 | 상세 로그 참조 |
| baseline-host-delta | 기준 HEAD 186e182 대조 | 0 | 0 | 0행 | 상세 로그 참조 |
| baseline-host-epsilon | 기준 HEAD 186e182 대조 | 0 | 0 | 0행 | 상세 로그 참조 |
| syntax-build | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| syntax-league-core | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| syntax-league-data | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| syntax-econ-data | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| syntax-econ | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |
| diff-check | 최종 코드 재실행 | 0 | 0 | 0행 | 상세 로그 참조 |

### 결정 때문에 갱신이 필요한 기존 검사

검사 파일은 수정하지 않았다. (1) 41-evidence-all: 고정 expected에 heatLngSlope=(0.226/30,M,19.1,D90-R1), heatPvSlope=(.004165,P,19.1,D90-R2)를 독립 전사하고 sourceIds의 D90-R 식별자를 지원해야 한다. 문서 키·값·등급·출처는 REF 19.1 및 SPEC 해당 행에 추가했다. 현재 unmapped는 문서를 읽기 전에 expected의 키 유무로 결정되므로 대장 수정만으로 통과할 수 없다. 기존 91키의 값·등급·출처 검증과 새 키 2개의 미대응 실패를 구분한다.

(2) 44-grant: 독립 재난 목록에 heavy_rain(6도시)을 추가해야 한다. 정산 unused/solar/line/response/research의 bonus 기대는 폭염 x=1·보수4억에서 각각 0→4, 8→10, 6→10, 4→8, 0→4다. 일반50억·폭염+열대야의 비재난 대응 사례도 보수 사용 4억을 별도로 인정해야 하며 비재난 대응 자체의 적격 인정으로 바꾸면 안 된다. 계획 grantOf/fundingOf는 여전히 보수비를 포함하지 않는다.

(3) 44-grant의 미사용 교부세 이월 변이는 옛 소스 조각 `(grantUsed ?? grantOf(S, R, id).used)`의 정확한 문자열 치환에 의존한다. 새 월말 정산 fallback 때문에 연결점 탐색에서 중단되어 DETECTED 0/9다. 9변이 미실행을 통과로 보지 않으며, 새 정산 경로와 잔액 소멸 계약에 맞춘 독립 하네스 갱신이 필요하다. 이 세 가지는 검사 담당 다른 세션 작업이다.

(4) 35-d73-d74-d79는 fa472b4 대비 rev.facility만 허용한 공개 키 지문, 38-d81-buildlead는 777805a 대비 공개 중첩 키 집합, 40-d82-perday는 3dca4f9와 공개 결과 전체의 깊은 동일성을 요구한다. D-90의 cost.repair·fiscal.exp.repair(0 포함) 등 승인된 진행자 정산 필드가 추가돼 실패한다. 이 필드의 의미·현금 항등식·기존 수치 불변을 유지하면서 승인된 추가만 독립적으로 허용하도록 검사 갱신이 필요하다. 새 학생 요청값을 허용하는 변경은 아니다. 아래 기준 HEAD 대조 결과와 전체 실패 원문을 함께 본다.

(5) bots36.py의 debt_breakdown은 별도 exp.repair를 합산하지 않아 nothing/hwaseong에서 분해상 현금 442.623과 실제 424.723의 차이 17.9억으로 중단됐다. capture-bots36.py는 원래 함수 호출 직전의 out을 저장할 뿐 실패를 잡거나 단언을 바꾸지 않는다. 따라서 공식 bots36 CLI는 여전히 실패이며 그 뒤의 요약 단언은 미실행이다. 별도 bots36-ledger.cjs가 모든 도시·전략에서 실제 월 현금 항등식과 분해 차이=보수비 합을 확인하고, B16·storage·nothing·base 부채·재생/디젤 조건을 원자료로 따로 측정했다. b18-only·18-growth-data는 저장된 원자료로 다시 실행했다. 원자료에 이 수집 경계를 _d90Capture로 명시했다. 이 생성기 오류의 기준 HEAD 전체 bots36 재실행은 생략했다. 기준 파일의 debt_breakdown 코드가 같고 exp.repair를 합산하지 않는 위치를 확인하며, 실제 54개 도시·전략의 차액을 별도 대조한다. 다른 실패 번호 검사는 기준 HEAD에서도 실행했다.

### 실제 실패·오류 전체


**bots36 (종료 1)**

```text

    raise AssertionError(f"지출 분해 현금 항등식 {strategy}/{city}: {close}/{last['cashAfter']}")

AssertionError: 지출 분해 현금 항등식 nothing/hwaseong: 442.6230000000005/424.7229999999999

```


**bots36-capture (종료 1)**

```text

    raise AssertionError(f"지출 분해 현금 항등식 {strategy}/{city}: {close}/{last['cashAfter']}")

AssertionError: 지출 분해 현금 항등식 nothing/hwaseong: 442.6230000000005/424.7229999999999

```


**35-d73-d74-d79 (종료 1)**

```text

FAIL D74-public 승인된 rev.facility 이외 새 공개 필드0: fa472b4 대비 rev.facility만 허용(배열 인덱스 정규화)

```


**38-d81-buildlead (종료 1)**

```text

FAIL 777805a 대비 publicView·speeds 키 집합과 값 불변: AssertionError [ERR_ASSERTION]: review: 중첩 공개 키 집합 동일

```


**40-d82-perday (종료 1)**

```text

FAIL 정전 회귀: 3dca4f9와 같은 입력의 첫 달/월간 판정·분해: AssertionError [ERR_ASSERTION]: 두 판 공개 운전 결과 동일

```


**41-evidence-all (종료 1)**

```text

FAIL 대장 대응 / heatLngSlope: 대장 대응 없음

FAIL 대장 대응 / heatPvSlope: 대장 대응 없음

```


**44-grant (종료 1)**

```text

FAIL [지급 대상] heavy_rain/hwaseong: AssertionError [ERR_ASSERTION]: 독립 대상 목록·해안 도시 목록에 따른 지급: 실제 10, 기대 0

FAIL [지급 대상] heavy_rain/pyeongtaek: AssertionError [ERR_ASSERTION]: 독립 대상 목록·해안 도시 목록에 따른 지급: 실제 10, 기대 0

FAIL [지급 대상] heavy_rain/anseong: AssertionError [ERR_ASSERTION]: 독립 대상 목록·해안 도시 목록에 따른 지급: 실제 10, 기대 0

FAIL [지급 대상] heavy_rain/dangjin: AssertionError [ERR_ASSERTION]: 독립 대상 목록·해안 도시 목록에 따른 지급: 실제 10, 기대 0

FAIL [지급 대상] heavy_rain/asan: AssertionError [ERR_ASSERTION]: 독립 대상 목록·해안 도시 목록에 따른 지급: 실제 10, 기대 0

FAIL [지급 대상] heavy_rain/cheonan: AssertionError [ERR_ASSERTION]: 독립 대상 목록·해안 도시 목록에 따른 지급: 실제 10, 기대 0

FAIL [정산] unused: AssertionError [ERR_ASSERTION]: unused 사용한 몫만 세입: 실제 4, 기대 0

FAIL [정산] solar: AssertionError [ERR_ASSERTION]: solar 사용한 몫만 세입: 실제 10, 기대 8

FAIL [정산] line: AssertionError [ERR_ASSERTION]: line 사용한 몫만 세입: 실제 10, 기대 6

FAIL [정산] response: AssertionError [ERR_ASSERTION]: response 사용한 몫만 세입: 실제 8, 기대 4

FAIL [정산] research: AssertionError [ERR_ASSERTION]: research 사용한 몫만 세입: 실제 4, 기대 0

FAIL [대응 적격] 일반50억: 폭염과 열대야 동시 발생: AssertionError [ERR_ASSERTION]: 정산에도 재난 대응 사용액만 교부 세입: 실제 4, 기대 0

FAIL [하네스] 준비·VM 실행: AssertionError [ERR_ASSERTION]: VM 연결점 하나: (grantUsed ?? grantOf(S, R, id).used)

```


의도된 변이 탐지 행은 최종 코드 29행, 기준 HEAD 대조 9행이다. 원문은 각 로그와 manifest의 detectedLines에 보존했다. 41-evidence-all의 JSON mutations는 별도이며 기존 91키의 273개 값·등급·출처 변이를 포함한다.

## 보관·재현·미완료

재개 실행기는 resume.py, 최종 재검사는 final-run.py, 기준 HEAD 대조는 resume-followup.py다. finish-driver.py가 앞 실행의 종료를 기다려 직렬 연결했다. 진행 로그는 resume-progress.log·final-progress.log·resume-followup-progress.log다. `manifest-interrupted.json`은 중단 당시 기록, `resume-source-check.json`은 이번 재개 시 엔진 해시 일치 확인이다. `run.py`·`followup.py`는 이전 계획을 보존한 것이며 미실행 부분까지 수행됐다는 뜻은 아니다.

원자료 실제 위치: `/tmp/q8-d90-data/`. 지정된 `/Users/yurosung/Projects/kentech-wt/_briefs/lanes/q8/d90-data/`는 이 세션의 쓰기 허용 범위 밖이고 외부 실행·권한 상승도 허용되지 않아 저장하지 못했다. 허용된 로컬 담당자가 이 폴더의 원자료·스크립트·로그를 지정 경로에 복사해야 영구 보관이 완료된다. 저장소에는 이 요약 보고서만 측정 산출물로 남겼다.

`final-manifest.json`/`followup-manifest.json`: 최종 명령·종료·FAIL·DETECTED·시간·부하. `resume.py`/`final-run.py`/`resume-followup.py`: 실제 사용한 직렬 실행기. `sources.json`·`resume-source-check.json`: MUL 보완 전 엔진 해시와 인계 일치 확인. `final-manifest.json.sourceHashes`: 최종 코드 해시, 최종 실행 시작·끝 동일성 확인. `baseline/`: 186e182 읽기 비교본. `smoke.cjs`/`physical.cjs`/`frequency.cjs`: 자체 경계 검증·빈도 재현. `host-observer.cjs`/`host.cjs`: 기존 정책0 관측기에 보수비 부분항과 감산 대조만 추가(기존 단언 유지). 호스트 개별 JSON은 5씨앗×36달 입력·장부·관측을 포함한다. `tech-balance.json`·`b12-grid.json`은 기존 검사 출력 원문이다. bots36.json은 원래 보고서 생성기가 보수비 분해에서 실패하기 직전의 원자료를 관측기로 저장한 것이며 공식 CLI 완료 출력이 아니다. bots36-ledger.json은 보수비를 별도 항목으로 대조한 추가 측정이다.

실행 환경: Node v24.21.0, pnpm 11.25.0, 프로젝트 tests/.venv Python 3.14.7. 의존성 추가 없음. 무거운 계산은 한 번에 하나, 1분 부하 130 이상에서 일시 정지하도록 했고 관측 최고 부하는 190.55였다. 요구는 <150이며 전체 시스템 부하는 다른 프로세스도 포함한다. 130에서 자식 계산만 정지하는 제어로 시스템 전체 상한을 보장할 수는 없다.

브라우저·교실 실연결·운영 검증은 금지 범위로 미실행이다. 화면 문구·연결과 bots36 지출 분해·35·38·40·41·44 및 독립 D-90 검사 대응표 보강, 지정 경로 보관은 다른 담당자의 후속 작업이다. 전체 검사 통과·화면 완료로 보고하지 않는다.
