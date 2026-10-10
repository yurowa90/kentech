"use strict";
// H01: 실제 월 경제 경로. 결측·무배출 구별, 인접 중복/재전파/비참가 오염 방지.
const assert = require("node:assert/strict");
const { X, D, IDS, inputsFor } = require("./lib");
const clone = x => JSON.parse(JSON.stringify(x));
let checks = 0;
const near = (a, b, label) => { assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-9, `${label}: ${a} != ${b}`); checks++; };
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const R = window.KCP.LEAGUE_REGIONS.south;
const E = X.initCities(IDS, D, { seed: "s4-edges", months: 36 });
const I = inputsFor(E, () => ({}));
IDS.forEach(id => { I[id].energy.genMWh = { coal: id === "dangjin" ? 10000 : 0 }; });
const before = JSON.stringify({ E, I, D, R });
const base = X.calibrate(E, I, D), run = X.monthStep(base, I, D);
near(run.report.cities.dangjin.pm25.own, .07, "석탄 자체 증분");
near(run.report.cities.asan.pm25.delta, .042, "이웃 증분");
near(run.report.cities.cheonan.pm25.delta, .042, "P61 수용 도시 기여");
near(run.report.cities.pyeongtaek.pm25.delta, 0, "연계선만 있는 도시는 전파 제외");
near(run.report.cities.hwaseong.pm25.delta, 0, "가상 해저 경로는 전파 제외");
eq(run.report.cities.dangjin.pm25.complete, true, "입력 완비");
eq(JSON.stringify({ E, I, D, R }), before, "입력·지역 자료 불변");
eq(X.monthStep(base, I, D), run, "같은 씨앗 결정성");

const missing = clone(I); delete missing.dangjin.energy.genMWh;
missing.dangjin.energy.co2Local = 999999;
const m = X.monthStep(base, missing, D).report.cities;
eq(m.dangjin.pm25.own, null, "누락은 무배출 0과 구별");
eq(m.dangjin.pm25.complete, false, "누락 표시");
eq(m.asan.pm25.complete, false, "이웃 누락도 표시");
near(m.dangjin.Lparts.air, 80, "누락 CO₂를 PM으로 역산하지 않음");

const ties = R.ties;
try {
  R.ties = [...ties, ties[0], { a: "dangjin", b: "pyeongtaek" }, { a: "dangjin", b: "dangjin" }];
  const duplicate = X.monthStep(base, I, D).report.cities;
  near(duplicate.asan.pm25.delta, .042, "중복·역방향 쌍 중복 계산 없음");
  near(duplicate.dangjin.pm25.delta, .07, "자기 이웃 제외");
} finally { R.ties = ties; }
const airNeighbours = D.airNeighbours;
try {
  D.airNeighbours = [...airNeighbours, airNeighbours[0], { from: "dangjin", to: "dangjin" }];
  const duplicate = X.monthStep(base, I, D).report.cities;
  near(duplicate.asan.pm25.delta, .042, "대기 목록 중복 기여 제외");
  near(duplicate.dangjin.pm25.delta, .07, "대기 목록 자기 기여 제외");
} finally { D.airNeighbours = airNeighbours; }
// 다른 지역에 같은 ID를 가진 연계선이 추가되어도 현재 대기 결과에는 영향이 없다.
try {
  window.KCP.LEAGUE_REGIONS.other = { teams: [], ties: [{ a: "dangjin", b: "anseong" }] };
  near(X.monthStep(base, I, D).report.cities.anseong.pm25.delta, 0, "다른 지역 연계선 제외");
} finally { delete window.KCP.LEAGUE_REGIONS.other; }
const reverse = clone(I);
reverse.dangjin.energy.genMWh = { coal: 0 };
reverse.asan.energy.genMWh = { coal: 10000 };
near(X.monthStep(base, reverse, D).report.cities.dangjin.pm25.delta, 0, "근거 없는 역방향 제외");
near(X.monthStep(base, reverse, D).report.cities.cheonan.pm25.delta, 0, "연계선 통한 재전파 제외");
const two = X.initCities(["asan", "cheonan"], D);
const subset = X.calibrate(two, I, D);
near(subset.cities.asan.lagL.air, 80, "비참가 당진 입력 제외");
const dirty = clone(I);
dirty.dangjin.energy.genMWh = { coal: -100, lng: NaN, diesel: Infinity, biomass: "100" };
const clean = X.monthStep(base, dirty, D).report.cities;
near(clean.dangjin.pm25.delta, 0, "비정상 발전량 유한·비음수 처리");
const huge = clone(I); huge.dangjin.energy.genMWh.coal = 1e7;
const clamped = X.calibrate(E, huge, D).cities.dangjin;
near(clamped.lagL.air, 0, "이주용 air 하한");
near(clamped.groupParts.air, 0, "집단 air 하한");

// 지도 표시 문구의 번역·변경과 숫자 환산의 독립성.
const scale = R.scale;
try {
  R.scale = "축척 문구를 바꾼 가상 지도";
  near(2 * R.mwScale, 460, "게임 2MW → 실제 460MW");
} finally { R.scale = scale; }
console.log(`S4 H01/H03/H04 pass ${checks} fail 0`);
