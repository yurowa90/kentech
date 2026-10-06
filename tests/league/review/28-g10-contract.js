"use strict";
const fs = require('node:fs'), vm = require('node:vm'), cp = require('node:child_process');
const assert = require('node:assert/strict'), {axes, check} = require('./21-host-policy-grid');
let checks = 0;
const equal = (a,b,label) => { assert.deepEqual(a,b,label); checks++; };
const original = file => cp.execFileSync('git',['show',`cc8fd25:${file}`],{encoding:'utf8'});
function data(source) { const ctx=vm.createContext({KCP:{}}); ctx.window=ctx; vm.runInContext(source,ctx); return JSON.parse(JSON.stringify(ctx.KCP.ECON_DATA)); }
const before=data(original('ui/econ-data.js')), after=data(fs.readFileSync('ui/econ-data.js','utf8'));
for(const [key,entry] of Object.entries(before.params)) if(entry.grade!=='G') equal(after.params[key],entry,`근거 ${key} 불변`);
for(const key of Object.keys(before)) if(key!=='params') equal(after[key],before[key],`자료 ${key} 불변`);
for(const file of ['ui/econ.js','ui/tech-data.js','ui/build.js','tests/league/recal.js'])
 equal(fs.readFileSync(file,'utf8'),original(file),`${file} 점수·근거·recal 바이트 불변`);
// 혼합 세율은 동방향 계열에는 없지만 한 축의 6도시 독식을 만들 수 있다.
const ids=['a','b','c','d','e','f'];
function fixture(top) {
 return Object.fromEntries(ids.map((id,i)=>[id,{top:top(i),rows:Array.from({length:125},()=>({score:1}))}]));
}
const mixed=fixture(i=>[{key:`2,-${i%2+1},${i}`,taxRes:2,taxInd:-(i%2+1)}]);
equal(axes(mixed),{taxResDown:0,taxResUp:6,taxIndDown:6,taxIndUp:0},'혼합 세율 축별 집계');
assert.throws(()=>check(mixed),/한 방향 6도시 독식 금지/); checks++;
// 공동 1위 양 방향을 모두 세고, 같은 도시의 같은 방향은 한 번만 센다.
const tied=fixture(i=>[{key:`${i}`,taxRes:i<3?1:-1,taxInd:i<3?-1:1},
 {key:`tie${i}`,taxRes:i<3?2:-2,taxInd:0}]);
equal(axes(tied),{taxResDown:3,taxResUp:3,taxIndDown:3,taxIndUp:3},'공동 1위 도시 중복 제거');
check(tied); checks++;
const both=fixture(i=>[{key:`up${i}`,taxRes:1,taxInd:0},{key:`down${i}`,taxRes:-1,taxInd:0}]);
equal(axes(both),{taxResDown:6,taxResUp:6,taxIndDown:0,taxIndUp:0},'공동 1위 양 방향 모두 집계');
assert.throws(()=>check(both),/한 방향 6도시 독식 금지/); checks++;
// 모든 후보 바이오매스 입지의 연료 조건이 같으면 입지 배수를 바꿔도 종류 선택은 같아야 한다.
// 과거 종류 간 socialCost 사용은 이 검사에서 탄소 0 설비 쏠림을 만든다.
const ctx=vm.createContext({console,document:{documentElement:{}},KCP:{route(){},on(){},esc:x=>x}}); ctx.window=ctx;
for(const name of ['build-maps','tech-data','build','econ-data','econ','league-data','league-core','league-ai']) {
 // G10_OLD_AI=1은 검사 민감도 진단이며 종류 격리 단언에서 실패해야 한다.
 const oldAI=process.env.G10_OLD_AI==='1' && name==='league-ai';
 if(oldAI)ctx.KCP.ECON_DATA.params.aiDebtRepair=before.params.aiDebtRepair;
 vm.runInContext(oldAI?original('ui/league-ai.js'):fs.readFileSync(`ui/${name}.js`,'utf8'),ctx);
}
const {leagueCore:C,buildGame:B,leagueAI:AI,ECON_DATA:D}=ctx.KCP, R=C.regionOf('south');
const select=B.selectPack;
B.selectPack=(...args)=>{const result=select(...args); B.TILES.forEach(t=>{t.livestock=true;}); return result;};
const state=C.newState('g10-site-isolation',R.id,0,R.teams.map(t=>t.id),{turns:36}); C.host(state,'next',1000);
const snapshot=JSON.stringify(state), plans=[];
for(const weight of [1,4,1000]) {
 D.params.aiLocalFuelWeight.v=weight;
 plans.push(JSON.stringify(AI.plan(state,R,'asan',B,'balanced').plan));
}
equal(plans[1],plans[0],'같은 입지 연료 조건: 가중 1/4 종류 비교 불변');
equal(plans[2],plans[0],'같은 입지 연료 조건: 가중 1/1000 종류 비교 불변');
equal(JSON.stringify(state),snapshot,'AI 예상 운전은 호스트 상태를 바꾸지 않음');
console.log(`G10 contract pass ${checks} fail 0`);
