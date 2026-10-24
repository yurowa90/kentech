// 정책0 호스트 하네스: 매달 모든 도시가 정책 0(세율·서비스·보조 0)을 요청하고, 컴퓨터 성향 계획(기본 balanced)을
// 호스트 reduce로 제출한 뒤 C.run으로 36달을 돌려 모든 도시·달의 지방채 초과 0을 단언한다.
// 품질 8 모형 기준표 축 D의 하네스. 독립 채점자(10-21)가 쓴 측정 스크립트를 경로만 바꿔 옮겼다. 파일을 쓰지 않는다.
// 실행: node tests/league/review/q8-host-debt.js [씨앗,씨앗,...] [달 수] [성향]
"use strict";
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'../../..');const clone=x=>JSON.parse(JSON.stringify(x));
function runSeed(seed, months, persona){
  const ctx=vm.createContext({console,document:{documentElement:{}},KCP:{route(){},on(){},esc:x=>x}});ctx.window=ctx;
  vm.runInContext('Math.random = () => { throw Error("unseeded random"); };',ctx);
  for(const n of ['build-maps','tech-data','build','econ-data','econ','league-data','league-core','league-ai']) vm.runInContext(fs.readFileSync(path.join(ROOT,'ui',n+'.js'),'utf8'),ctx);
  const {leagueCore:C,buildGame:B,leagueAI:AI,econ:X}=ctx.KCP;
  const R=C.regionOf('south'),ids=R.teams.map(t=>t.id);
  const S=C.newState(seed,R.id,0,ids,{turns:months});ids.forEach(id=>S.teams[id].token='grid-test');
  const over=Object.fromEntries(ids.map(i=>[i,0])), overMonths=Object.fromEntries(ids.map(i=>[i,[]])), minHead=Object.fromEntries(ids.map(i=>[i,Infinity]));
  const step=X.monthStep;X.monthStep=(E,inp,...a)=>{const r=step(E,inp,...a);for(const id of ids){const f=r.report.fiscal[id];if(f.debtOver){over[id]++;overMonths[id].push(S.round);}minHead[id]=Math.min(minHead[id],f.cashAfter+f.debtCap);}return r;};
  for(let m=1;m<=months;m++){const at=m*100000;C.host(S,'next',at);
    const rq=(id,msg)=>{const r=C.reduce(S,{team:id,token:'grid-test',...msg},at+1,B);assert.ok(r.ok,JSON.stringify(r));};
    ids.forEach(id=>rq(id,{type:'econ',taxRes:0,taxInd:0,service:0,incentive:0}));
    const plans=Object.fromEntries(ids.map(id=>{const p=AI.plan(S,R,id,B,persona).plan;return [id,{builds:clone(p.builds),lines:clone(p.lines)}];}));
    ids.forEach(id=>rq(id,{type:'plan',rev:S.teams[id].rev+1,plan:plans[id]}));
    C.run(S,B,at+50);}
  const sc=X.score(S.econ,ctx.KCP.ECON_DATA);
  return {seed,months,persona,over,overMonths,minHead:Object.fromEntries(ids.map(i=>[i,+minHead[i].toFixed(2)])),score:Object.fromEntries(ids.map(i=>[i,sc.by[i].score])),co2:Object.fromEntries(ids.map(i=>[i,sc.by[i].parts?.co2]))};
}
const seeds=(process.argv[2]||'alpha,beta,gamma,delta,epsilon').split(','), months=+(process.argv[3]||36), persona=process.argv[4]||'balanced';
let failures=0;
for(const s of seeds){
  const t=Date.now(),r=runSeed(s,months,persona);r.sec=((Date.now()-t)/1000).toFixed(0);console.log(JSON.stringify(r));
  for(const [id,count] of Object.entries(r.over)) if(count!==0){
    failures+=count;
    console.error(`FAIL: 정책0 지방채 seed=${s} city=${id} months=${r.overMonths[id].join(',')} over=${count}`);
  }
}
console.log(`정책0 지방채: ${seeds.length}씨앗×${months}달, 한도 초과 ${failures}건`);
process.exitCode=failures?1:0;
