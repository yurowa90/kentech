"use strict";
// Measurement only. No UI writes/network/browser. One serial worker, resumable signals.
// node tests/league/review/rel3-scale.js [--self-test]
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const os = require("node:os"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const {spawn, execFileSync} = require("node:child_process");
const ROOT = path.resolve(__dirname, "../../..");
const read = f => fs.readFileSync(path.resolve(ROOT, f), "utf8");
const clone = x => JSON.parse(JSON.stringify(x));
const hash = x => crypto.createHash("sha256").update(x).digest("hex");
const mean = a => a.reduce((s,x)=>s+x,0)/a.length;
const round = x => Math.round(x*10)/10, clamp = x => Math.max(0,Math.min(100,x));
const VARIANTS = ["current","A","B2","B1","C"];
const MODULES = ["build-maps","tech-data","build","econ-data","econ","league-data","league-core","league-ai"];
let checks = 0;
function ok(x,label) {assert.ok(x,label);checks++;}
function eq(a,b,label) {assert.equal(JSON.stringify(a),JSON.stringify(b),label);checks++;}
function near(a,b,label,tol=1e-8) {ok(Number.isFinite(a)&&Math.abs(a-b)<=tol,`${label}: ${a} / ${b}`);}
function once(s,a,b) {eq(s.split(a).length,2,`unique observer: ${a}`);return s.replace(a,b);}
function loadHelper(file,exports,extra={}) {
  const box={require,module:{exports:{}},__dirname,console,process,structuredClone,...extra};
  vm.runInNewContext(read(file)+`\nmodule.exports={${exports}};`,box,{filename:file});
  return box.module.exports;
}
const base=loadHelper("tests/league/review/rel-gridshare.js",
  "context,attach,loadModule,distribution,summarize,pythonString,pythonPost,hashes,assertions:()=>assertions");
const rel2=loadHelper("tests/league/review/rel2-student.js","student,connect,base,hashes,checks:()=>checks");
const originalContext=rel2.base.context;
rel2.base.context=(...args)=>setup(originalContext(...args));
const AI=read("ui/league-ai.js");
// Extract actual AI functions verbatim: no duplicated firm-supply definition.
const mapFunction=AI.slice(AI.indexOf("  function withMap("),AI.indexOf("\n  // 여러 출발점"));
const supplyFunction=AI.slice(AI.indexOf("  function supply("),AI.indexOf("\n  // 호스트의 승인"));
function setup(ctx) {
  vm.runInContext(`(()=>{const KCP=window.KCP;${mapFunction}\n${supplyFunction}
    globalThis.__firm=(B,S,id,p)=>withMap(B,KCP.leagueCore.regionOf(S.region),id,()=>supply(B,S,id,p));})();`,ctx);
  const {leagueCore:C,buildGame:B,econ:X,ECON_DATA:D}=ctx.KCP;
  const run=C.run, histories=new WeakMap();
  C.run=function(S,bg,now) {
    if(S.phase!=="plan") return run(S,bg,now);
    const ids=C.activeOf(S), initial=histories.get(S)||Object.fromEntries(ids.map(id=>[id,0]));
    const supplies=Object.fromEntries(ids.map(id=>[id,clone(ctx.__firm(B,S,id,S.teams[id].plan||{builds:[],lines:[]}))]));
    const result=run(S,bg,now);
    const scored=X.score({...S.econ,len:S.round}), monthly={};
    for(const id of ids) {
      const g=ctx.__relActual[id], city=S.econ.cities[id], f=supplies[id];
      ok(g.demandMWh>0,`${id} positive monthly demand`);
      const gridPct=100*g.gridMWh/g.demandMWh;
      initial[id]+=D.params.lambdaFast.v*(gridPct-initial[id]);
      monthly[id]={month:S.round,unsPct:result.team[id].unsPct,unsS:city.unsS,
        gridMWh:g.gridMWh,demandMWh:g.demandMWh,gridPct,gridS:initial[id],
        firm:f.firm,peak:f.peak,m:f.firm/f.peak,score:clone(scored.by[id])};
    }
    histories.set(S,initial);ctx.__rel3=monthly;
    return result;
  };
  return ctx;
}
const context=()=>setup(base.context(.5));
function scoreRel(variant,r) {
  const outage=clamp(100*(1-r.unsS/16));
  if(variant==="current") return round(outage);
  if(variant==="A") return round(clamp(100*(1-r.unsS/4)));
  if(variant==="B2"||variant==="B1")
    return round(clamp(100*(1-r.unsS/16)-(variant==="B2"?2:1)*r.gridS));
  if(variant==="C") return round(Math.min(outage,clamp(100*(r.m-.85)/(.30))));
  throw Error("unknown scale "+variant);
}
function rescore(variant,r,D) {
  const parts={...r.score.parts,rel:scoreRel(variant,r)};
  const w=D.params.wScore.v, floor=Math.max(1,Math.min(100,D.params.scorePartFloor.v));
  const score=round(clamp(Math.exp(Object.keys(w).reduce((s,k)=>s+w[k]*Math.log(Math.max(floor,parts[k])),0)/
    Object.values(w).reduce((s,x)=>s+x,0))+(r.score.coop||0)));
  if(variant==="current") {near(score,r.score.score,"baseline total reproduction");eq(parts,r.score.parts,"baseline parts reproduction");}
  return {id:r.id,strategy:r.strategy,score,parts};
}
function summarize(rows,strategies,ids) {
  const s=base.summarize(rows,strategies,ids), groups={};
  rows.forEach(r=>(groups[r.score]??=[]).push(`${r.id}/${r.strategy}`));
  return {...s,distribution:base.distribution(rows.map(r=>r.parts.rel)),
    meanScore:mean(rows.map(r=>r.score)),scoreDistribution:base.distribution(rows.map(r=>r.score)),
    tieGroups:Object.entries(groups).filter(([,v])=>v.length>1).map(([score,members])=>({score:+score,members})),
    distinctTotals:Object.keys(groups).length,
    topCounts:Object.fromEntries(ids.map(id=>[id,s.winners[id].length])),
    nothingLast:strategies.includes("nothing")?rows.filter(r=>r.strategy==="nothing").every(r=>r.strategyRank===9):null,
    renewAboveDiesel:strategies.includes("diesel")?s.means.renew>s.means.diesel:null,
    smrFirstCities:strategies.includes("smr")?s.firstCounts.smr:null,
    researchGain:strategies.includes("research")?s.means.research-s.means.none:null};
}
// Compact rows keep the reproducible monthly inputs below 1 MB.
const COLUMNS=["month","unsPct","unsS","gridMWh","demandMWh","gridPct","gridS","firm","peak","m"];
const compact=r=>COLUMNS.map(k=>r[k]);
function finish(rows,strategies,ids,D,extra={}) {
  for(const r of rows) {
    ok(r.monthly.length===(extra.months||36),"complete monthly observations");
    let u=0,g=0;
    for(const a of r.monthly) {
      const x=Object.fromEntries(COLUMNS.map((k,i)=>[k,a[i]]));
      u+=D.params.lambdaFast.v*(x.unsPct-u);g+=D.params.lambdaFast.v*(x.gridPct-g);
      near(x.unsS,u,"outage EMA");near(x.gridS,g,"grid EMA");
      near(x.gridPct,100*x.gridMWh/x.demandMWh,"grid percent");near(x.m,x.firm/x.peak,"margin");
    }
  }
  const scales=Object.fromEntries(VARIANTS.map(v=>[v,summarize(rows.map(r=>rescore(v,r,D)),strategies,ids)]));
  return {ids,strategies,names:Object.fromEntries(ids.map(id=>[id,D.start[id].name])),
    monthlyColumns:COLUMNS,rows,scales,...extra};
}
function general() {
  const ctx=context();
  vm.runInContext(base.pythonString("tests/league/calib.py","AUTO"),ctx);
  let js=base.pythonString("tests/league/bots36.py","JS");
  js=once(js,"run.hist.push({month: m,","__progress(rotation,m); run.hist.push({rel3: clone(globalThis.__rel3), month: m,");
  ctx.__progress=(rotation,month)=>process.send?.({kind:"bots",rotation,month});
  const raw=vm.runInContext(js,ctx)({months:36,rotations:9});
  const post=base.pythonPost(raw);
  const rows=raw.runs.flatMap(run=>run.rows.map(r=>({...clone(run.hist.at(-1).rel3[r.id]),id:r.id,strategy:r.strategy,
    monthly:run.hist.map(h=>compact(h.rel3[r.id]))})));
  const result=finish(rows,raw.strategies,raw.ids,ctx.KCP.ECON_DATA,
    {seed:"bots-strategy-common",sourceChecks:post.sourceChecks,rawHash:hash(JSON.stringify(raw))});
  const prior=JSON.parse(read("tests/league/review/rel2-results.json")).jobs.find(j=>j.key==="bots-1").result;
  for(const r of result.scales.current.rows) {
    const old=prior.rows.find(o=>o.id===r.id&&o.strategy===r.strategy);
    eq([r.score,r.parts],[old.score,old.parts],"REL2 baseline crosscheck");
  }
  return result;
}
function technology() {
  let engine;
  const evaluated={};
  const shimVM={...vm,runInContext(source,ctx,...args) {
    for(const name of MODULES) if(source===read(`ui/${name}.js`)) {
      evaluated[name]=(evaluated[name]||0)+1;
      if(name==="build-maps") base.attach(ctx,.5);
      base.loadModule(ctx,name,.5,true);
      if(name==="league-ai") {setup(ctx);engine=ctx;}
      return;
    }
    return vm.runInContext(source,ctx,...args);
  }};
  const allowed={"node:fs":{...fs,writeFileSync(file){eq(file,"/rel3-memory.json","T5 memory sink");}},
    "node:path":path,"node:vm":shimVM,"node:crypto":crypto};
  const box={__dirname,process:{env:{TECH_BALANCE_OUT:"/rel3-memory.json"},exitCode:0},
    console:{log(...args){if(args[0]==="FAIL:"||String(args[0]).startsWith('{"city":')) console.log(...args);}},
    require(name){ok(Object.hasOwn(allowed,name),"T5 allowed dependency");return allowed[name];},
    __progress:(id,strategy,month)=>process.send?.({kind:"T5",id,strategy,month})};
  let source=read("tests/league/review/11-tech-balance.js");
  source=once(source,"run.months.push({ budget:","__progress(focal,strategy,m); run.months.push({ rel3: clone(ctx.__rel3[focal]), budget:");
  vm.runInNewContext(source+"\nglobalThis.__report=report;",box,{filename:"11-tech-balance.js"});
  const raw=box.__report;
  ok(MODULES.every(n=>evaluated[n]===1),"T5 engine loaded once");
  eq(raw.runs.length,42,"T5 complete runs");eq(box.process.exitCode,raw.failures.length?1:0,"T5 exit status");
  for(const run of raw.runs) if(["renew","ties","hybrid"].includes(run.strategy)) {
    const smr=raw.runs.find(r=>r.id===run.id&&r.strategy==="smr");
    for(const m of run.months) ok(m.cumulativeMatchedSpend<=smr.months[m.month-1].cumulativeMatchedSpend+raw.budgetTolerance,"T5 monthly matched budget");
  }
  const rows=raw.runs.map(r=>({...r.months.at(-1).rel3,id:r.id,strategy:r.strategy,monthly:r.months.map(m=>compact(m.rel3)),
    budget:r.budget||null}));
  const result=finish(rows,Object.keys(raw.strategies),[...new Set(rows.map(r=>r.id))],engine.KCP.ECON_DATA,
    {seed:raw.seed,sourceChecks:{passCount:raw.passes,fail:raw.failures},rawHash:hash(JSON.stringify(raw))});
  near(result.scales.current.researchGain,raw.researchGain,"T5 original research gain");
  eq(result.scales.current.smrFirstCities,raw.smrFirstCities,"T5 original SMR winners");
  return result;
}
function student() {
  let observations,ctx;
  const original=rel2.base.context;
  rel2.base.context=(...args)=>{
    ctx=original(...args);observations=[];
    const run=ctx.KCP.leagueCore.run;
    ctx.KCP.leagueCore.run=(...a)=>{const result=run(...a);observations.push(clone(ctx.__rel3));return result;};
    return ctx;
  };
  let replay;
  try {replay=rel2.student({share:.5,variant:"solar"});} finally {rel2.base.context=original;}
  const ids=Object.keys(observations[0]), id="pyeongtaek";
  const scales={};
  for(const v of VARIANTS) {
    const ranking=ids.map(id=>rescore(v,{...observations.at(-1)[id],id},ctx.KCP.ECON_DATA))
      .sort((a,b)=>b.score-a.score||ids.indexOf(a.id)-ids.indexOf(b.id));
    const row=ranking.find(r=>r.id===id);
    scales[v]={rel:row.parts.rel,score:row.score,rank:ranking.indexOf(row)+1,
      sharedRank:1+ranking.filter(r=>r.score>row.score).length,ranking};
  }
  const prior=JSON.parse(read("tests/league/review/rel2-results.json")).jobs.find(j=>j.key==="student-solar-0.5").result;
  eq(replay.stateHash,prior.stateHash,"REL2 student entire final state");
  eq([scales.current.score,scales.current.rank],[prior.score,prior.rank],"REL2 score/rank");
  for(let i=0;i<12;i++) eq(replay.rows[i].placed,prior.rows[i].placed,"REL2 solar sites");
  return {scales,observation:observations.at(-1)[id],monthly:observations.map(o=>compact(o[id])),
    stateHash:replay.stateHash,maxReferenceError:replay.maxReferenceError};
}
function starting() {
  const ctx=context(),{leagueCore:C,buildGame:B}=ctx.KCP;
  const R=C.regionOf("south"),ids=R.teams.map(t=>t.id);
  const S=C.newState("rel3-start",R.id,0,ids,{turns:12,seedMode:"fixed"});
  const plans={},initial={},monthly=Object.fromEntries(ids.map(id=>[id,[]]));
  for(const id of ids) {
    B.selectPack(C.teamDef(R,id).pack,"league");
    const p=B.sanitize({builds:[],lines:[],policies:[],missions:[]},1e9);
    const empty=ctx.__firm(B,S,id,p);
    rel2.connect(ctx,p);plans[id]=clone(p);
    const f=ctx.__firm(B,S,id,p);
    initial[id]={...clone(f),m:f.firm/f.peak,emptyFirm:empty.firm,lineCount:p.lines.length};
    S.teams[id].token="rel3-start";
  }
  for(let m=1;m<=12;m++) {
    C.host(S,"next",0);
    for(const id of ids) {
      const p=clone(plans[id]);p.season=C.roundsOf(S)[m-1].season;
      const applied=C.reduce(S,{team:id,token:"rel3-start",type:"plan",rev:S.teams[id].rev+1,plan:p},0,B);
      ok(applied.ok,`${id}/${m} retained lines accepted: ${applied.err}`);
      eq(S.teams[id].plan.builds,[],"no new buildings");eq(S.teams[id].plan.lines,plans[id].lines,"lines unchanged");
    }
    C.run(S,B,0);
    ids.forEach(id=>monthly[id].push(compact(ctx.__rel3[id])));
  }
  return {ids,names:Object.fromEntries(ids.map(id=>[id,ctx.KCP.ECON_DATA.start[id].name])),initial,plans,monthly,
    monthlyColumns:COLUMNS,covered:ids.filter(id=>initial[id].m>=1).length,
    seedKey:S.seedKey,stateHash:hash(JSON.stringify(S))};
}
function selfTest() {
  const sample={unsS:0,gridS:10,m:1};
  eq(VARIANTS.map(v=>scoreRel(v,sample)),[100,100,80,90,50],"specified scales");
  eq([.85,1,1.15].map(m=>scoreRel("C",{...sample,m})),[0,50,100],"C boundaries");
  eq(scoreRel("A",{...sample,unsS:4}),0,"A 4 percent zero");
  eq(scoreRel("B2",{...sample,unsS:20}),0,"clamp B after both penalties");
  eq(scoreRel("C",{...sample,unsS:8,m:1.3}),50,"C outage minimum");
  eq(scoreRel("current",{...sample,unsS:.007}),100,"display saturation rounding");
  const a=context(),b=base.context(.5),{leagueCore:C,buildGame:B}=a.KCP;
  const ids=C.regionOf("south").teams.map(t=>t.id);
  function first(ctx) {
    const {leagueCore:C,buildGame:B}=ctx.KCP;
    const S=C.newState("rel3-test","south",0,ids,{turns:12,seedMode:"fixed"});
    C.host(S,"next",0);
    const result=C.run(S,B,0);
    return {result,state:S};
  }
  eq(first(a),first(b),"observer preserves entire engine state and result");
  const p=a.KCP.ECON_DATA.params;
  eq([p.scoreUnsZero.v,p.unsZeroL.v,p.unsZeroA.v,p.lambdaFast.v],[16,16,3,.5],"unchanged parameter values");
  eq([p.scoreUnsZero.grade,p.unsZeroL.grade,p.unsZeroA.grade],["G","G","M"],"unchanged parameter grades");
  const orig=b.KCP.ECON_DATA.params;
  eq(p,orig,"all parameters unchanged");
  // Score call-site audit: score reads unsS; L/A have separate reliability inputs.
  const econ=read("ui/econ.js");
  eq((econ.match(/P\("scoreUnsZero"\)/g)||[]).length,1,"scoreUnsZero only in score");
  ok(!/econ\.score|parts\.rel|unsS|econPreviousScore/.test(AI),"AI does not read score reliability");
  const summary=summarize([{id:"x",strategy:"a",score:60,parts:{rel:100}},{id:"x",strategy:"b",score:60,parts:{rel:100}}],
    ["a","b"],["x"]);
  eq(summary.topCounts.x,2,"shared first counts");eq(summary.tieGroups.length,1,"duplicate-value groups");
  eq(summary.B16,false,"B16 includes shared first");
  // Hand-built network tests exercise verbatim supply(), including readyRound.
  const fn=vm.runInNewContext(`(${supplyFunction.trim().replace(/^function supply/,"function")})`);
  const bg={network:()=>({nodes:[{live:true,kind:"plant",cap:9},{live:true,kind:"diesel"},
    {live:true,kind:"solar"},{live:true,kind:"battery"},{live:true,kind:"smr",tile:4},
    {live:false,kind:"plant",cap:50},{live:true,kind:"import",cap:70},{live:true,kind:"town",cap:80}],comps:[]}),
    BLD:{diesel:{cls:"disp",mw:2},solar:{cls:"ren",mw:8},battery:{cls:"bat",mw:7},smr:{cls:"disp",mw:3}},
    SITES:[],peakDemand:()=>10};
  const S={round:1,econ:{cities:{x:{pop:100,pop0:100,ind:120,ind0:100}}},teams:{x:{construction:{"smr:4":{readyRound:2}}}}};
  const f=fn(bg,S,"x",{});
  eq([f.firm,f.peak,f.renew,f.storage],[11,12,8,7],"firm excludes renewable/storage/disconnected/import/town/unfinished SMR");
  S.round=2;eq(fn(bg,S,"x",{}).firm,14,"ready SMR counted");
  // Perturb score-only G in a separate VM; decisions, economics and energy must match.
  function dynamics(ctx,zero) {
    const {leagueCore:C,buildGame:B}=ctx.KCP;
    ctx.KCP.ECON_DATA.params.scoreUnsZero.v=zero;
    const S=C.newState("rel3-dynamics","south",0,ids,{turns:12,seedMode:"fixed"});
    ids.forEach(id=>{S.teams[id].token="rel3-dynamics";S.econ.cities[id].unsS=2;});
    for(let m=1;m<=2;m++) {
      C.host(S,"next",0);
      const answers=[...C.computerPlans(S,B,null,"balanced",false),...C.computerPlans(S,B,null,"balanced",true)];
      answers.forEach(r=>ok(r.ok||r.type==="tie","AI non-tie action accepted"));
      C.run(S,B,0);
    }
    const strip=x=>Array.isArray(x)?x.map(strip):x&&typeof x==="object"?
      Object.fromEntries(Object.entries(x).filter(([k])=>!["score","econPreviousScore"].includes(k)).map(([k,v])=>[k,strip(v)])):x;
    return {state:strip(clone(S)),score:ctx.KCP.econ.score(S.econ)};
  }
  const d1=dynamics(context(),16),d2=dynamics(context(),4);
  eq(d1.state,d2.state,"score-only perturbation leaves all nonscore state identical after AI operation");
  ok(JSON.stringify(d1.score)!==JSON.stringify(d2.score),"perturbation really changes scores");
  // Complete manual aggregation with floor=1 and nonzero coop.
  const r={...sample,score:{parts:{pop:100,ind:100,fin:100,co2:100,appr:100,rel:100},coop:2,score:100}};
  eq(rescore("current",r,a.KCP.ECON_DATA).score,100,"coop after geometric mean then clamp");
  return {checks:checks+base.assertions(),failures:0};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),loadLog=[];
function load(label) {const value=os.loadavg()[0];loadLog.push({at:new Date().toISOString(),label,value});return value;}
async function runJob(kind,dir) {
  while(load("before "+kind)>150) {console.log("WAIT load >150");await sleep(10000);}
  const out=path.join(dir,kind+".json");
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[__filename,"--worker",kind,out],
      {stdio:["ignore","inherit","inherit","ipc"],env:{...process.env,REL3_SERIAL:"1"}});
    console.log(`START ${kind} pid=${child.pid}`);
    let ownedStop=false;
    const timer=setInterval(()=>{
      const value=load(kind);
      if(value>150&&!ownedStop) {child.kill("SIGSTOP");ownedStop=true;console.log("LOAD STOP",kind);}
      else if(value<=150&&ownedStop) {child.kill("SIGCONT");ownedStop=false;console.log("LOAD CONT",kind);}
    },10000);
    const stop=()=>{child.kill("SIGCONT");child.kill("SIGTERM");};
    process.once("SIGTERM",stop);process.once("SIGINT",stop);
    child.on("message",m=>{if(m.month===1||m.month%12===0) console.log(JSON.stringify(m));});
    child.on("error",e=>{clearInterval(timer);reject(e);});
    child.on("exit",(code,signal)=>{
      clearInterval(timer);process.removeListener("SIGTERM",stop);process.removeListener("SIGINT",stop);
      code===0?resolve():reject(Error(`${kind} exit ${code} ${signal}`));
    });
  });
  load("after "+kind);return JSON.parse(read(out));
}
function save(file,data) {
  const s=JSON.stringify(data)+"\n";
  if(Buffer.byteLength(s)>1000000) file=path.join(os.homedir(),"Projects/kentech-wt/_briefs/lanes/q8/results/rel3",path.basename(file));
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,s);
  return {file,bytes:Buffer.byteLength(s)};
}
function hashes() {
  return {...base.hashes(),...rel2.hashes(),
    "tests/league/review/rel2-student.js":hash(read("tests/league/review/rel2-student.js")),
    "tests/league/review/rel2-results.json":hash(read("tests/league/review/rel2-results.json"))};
}
async function main() {
  const started=Date.now(),before=hashes();
  const head=execFileSync("git",["rev-parse","HEAD"],{cwd:ROOT,encoding:"utf8"}).trim();
  const dir=fs.mkdtempSync("/tmp/rel3-");
  const output={head,node:process.version,started:new Date(started).toISOString(),sourceHashes:before,dir,jobs:{},loadLog};
  console.log(`REL3 controller=${process.pid} checkpoint=${dir}`);
  for(const kind of ["self-test","starting","student","general","technology"]) {
    // All five scales share ONE trajectory: no separate T5 reruns needed for post hoc scoring.
    output.jobs[kind]=await runJob(kind,dir);
    save(path.join(dir,"checkpoint.json"),output);
  }
  eq(hashes(),before,"UI and all measured inputs unchanged");
  eq(execFileSync("git",["rev-parse","HEAD"],{cwd:ROOT,encoding:"utf8"}).trim(),head,"HEAD unchanged");
  output.seconds=(Date.now()-started)/1000;output.maxLoad=Math.max(...loadLog.map(x=>x.value));
  output.scriptHash=hash(read(__filename));output.checks=checks+Object.values(output.jobs).reduce((s,j)=>s+j.checks,0);
  const saved=save(path.join(__dirname,"rel3-results.json"),output);
  fs.writeFileSync(path.join(__dirname,"REL3-report.md"),report(output,saved));
  console.log(JSON.stringify({...saved,seconds:output.seconds,maxLoad:output.maxLoad,checks:output.checks}));
}
const fmt=(x,n=2)=>Number.isFinite(x)?x.toFixed(n):"—";
function report(o,saved) {
  const start=o.jobs.starting.result,g=o.jobs.general.result,t=o.jobs.technology.result,student=o.jobs.student.result;
  const lines=["# REL3 시작 확정 공급·신뢰 점수 눈금 측정","",
    `HEAD ${o.head}; Node ${o.node}; 실행 ${fmt(o.seconds/60)}분; 10초 간격 표본 최대 1분 부하 ${fmt(o.maxLoad)}.`,
    "`node tests/league/review/rel3-scale.js`; 자체 검사 `node tests/league/review/rel3-scale.js --self-test`.",
    `결과 JSON: ${saved.file} (${saved.bytes} bytes). ui·기존 측정 입력 해시와 HEAD 보존 확인.`,"",
    "## 1. 시작 지도","",
    "newState의 plan은 null이며 자동 송전선은 없다. REL2 LINE_PAIRS_JS의 거리 순 연결 규칙으로 기존 발전소(없으면 첫 시설)에서 수요 시설까지 선을 만들고, 그 선만 12달 유지했다. 발전설비·정책·연계선·연구·세율 변경은 없다. 6도시 동시 운영, 고정 seedKey=0, 기본 사건과 경제 피드백은 유지한다. 이것은 선 공사까지 하지 않는 무조작 대조군과 다르다.",
    "확정 공급과 피크는 league-ai.js의 supply·withMap 함수를 원문 그대로 추출했다. 연결된 고정 cap 및 완공된 dispatchable 발전만 포함하며 import/town·재생 정격·저장 정격은 제외한다. 피크는 peakDemand({},false)×max(pop/pop0,ind/ind0)로, 그 달 운전 직전의 AI 기준 피크다. 날씨·절전·사건이 반영된 실제 시간별 최대와 구분한다.","",
    "| 도시 | 확정 MW | 피크 MW | 공급/피크 | 피크 충족 | 유지 선 수 | 12달 평균 정전% | 계통 MWh 합계 |",
    "|---|---:|---:|---:|---|---:|---:|---:|"];
  for(const id of start.ids) {
    const f=start.initial[id],ms=start.monthly[id];
    lines.push(`| ${start.names[id]} | ${fmt(f.firm,3)} | ${fmt(f.peak,3)} | ${fmt(f.m,3)} | ${f.m>=1?"예":"아니오"} | ${f.lineCount} | ${fmt(mean(ms.map(a=>a[1])),4)} | ${fmt(ms.reduce((s,a)=>s+a[3],0),3)} |`);
  }
  lines.push("",`시작 지도의 확정 공급만으로 피크를 덮는 도시는 **${start.covered}/6**이다. 피크 충족과 정전 0은 같은 조건이 아니다. 계통 수입·시간별 수요·공급 구성에 따라 피크 미충족 도시도 정전 0일 수 있다.`,
    "bots36 nothing은 매달 builds·lines·policies·missions를 비운다. 이 경우 시작 고정 발전소도 수요와 연결되지 않아 확정 공급 0이며, 매시간 50% 계통 보충 뒤 정전 50%가 남는다. 종료 unsS가 약 50이 되어 현재 신뢰가 0이다. 선을 유지한 시작 지도 결과와 혼동하지 않는다.","",
    "| 도시 | 월 | 정전% | 계통 보충 MWh | 확정 MW | 피크 MW | 공급/피크 |","|---|---:|---:|---:|---:|---:|---:|");
  for(const id of start.ids) for(const a of start.monthly[id])
    lines.push(`| ${start.names[id]} | ${a[0]} | ${fmt(a[1],4)} | ${fmt(a[3],3)} | ${fmt(a[7],3)} | ${fmt(a[8],3)} | ${fmt(a[9],3)} |`);
  lines.push("","## 2. 사후 재채점 방법","",
    "scoreUnsZero 참조는 econ.js score()의 parts.rel 한 곳뿐이다. monthStep은 계산 끝에 report.score를 붙이며, 경제 입력·이주·지지·산업 매력에는 이 점수가 들어가지 않는다. league-core의 econPreviousScore/publicView는 보고용이다. AI는 score/parts.rel/unsS/econPreviousScore를 읽지 않으며 T5 예산 맞춤도 점수로 한도를 선택하지 않는다. 별도 VM에서 점수 G를 바꾼 2달 AI 운전은 점수 차이가 실제 생겼고, 점수 필드만 제거한 전체 상태는 동일했다.",
    "따라서 bots36 9회전·6도시×36달과 T5 42개 채택 궤적×36달을 각각 한 번만 실행하고 동일 궤적에 다섯 눈금을 적용했다. T5 예산 사전 반복과 월 누계 검사는 원문 그대로 유지했다. 재채점 결과를 운영에 되먹이지 않았다. 다른 전략으로 행동을 바꾼 반응은 이 실험 범위 밖이다.",
    "unsS는 기존 lambdaFast=0.5의 지수 평활이며 gridS도 초기 0에서 같은 방식으로 갱신했다. gridPct=100×(그 달 바깥 계통 보충 MWh)/(그 달 수요 MWh). 원 gridSupply의 반환량과 시간별 수요를 대표 주간→달력 월로 같은 배율 환산했으며 이웃 거래 수입은 제외한다. attribution의 재운전이 아닌 실제 runRound 직후 관측을 사용한다.",
    "기준: clamp(100×(1−unsS/16)); A: 16→4(G); B2/B1: clamp(100×(1−unsS/16)−2/1×gridS); C: min(기준의 반올림 전 값,clamp(100×(m−0.85)/0.30)). C는 제시 수식 그대로라 m=1.0에서 50점, m=1.15에서 100점이며 1.0~1.15도 감점한다. '1.0 이하만 감점'이라는 문구와 식의 차이를 숨기지 않는다.",
    "부분점수를 소수 첫째 자리로 반올림한 다음 원 wScore·floor≥1로 가중 기하평균을 계산하고 coop을 더해 0~100으로 자른 뒤 총점도 한 자리 반올림한다. 근거 unsZeroA=3(M), unsZeroL=16(G), 다른 O·P·M·G 및 L/A 식은 변경하지 않았다.",
    "분포는 종료 54개(bots)·42개(T5), 사분위는 (n−1)p 선형 보간이다. 총점 동점은 공개 한 자리 점수의 정확한 동일 값으로 묶는다. '동일값 묶음'은 크기≥2인 묶음 수이며 유일값 수도 병기한다. 도시 내 순위는 공동 순위, 학생 표에는 엔진의 도시 순서 동률 해소 순위와 공동 순위를 함께 쓴다.","");
  for(const [title,r] of [["bots36",g],["T5",t]]) {
    lines.push(`## ${title} 핵심 결과`,"",
      "| 시안 | 신뢰100 | 비율 | 신뢰 min/Q1/중앙/Q3/max | 총점 평균 | 총점 min/중앙/max | 동일값 묶음 | 유일 총점 | B16 |",
      "|---|---:|---:|---|---:|---|---:|---:|---|");
    for(const v of VARIANTS) {
      const s=r.scales[v],d=s.distribution,sd=s.scoreDistribution;
      lines.push(`| ${v} | ${d.hundred}/${d.n} | ${fmt(d.hundredFraction*100)}% | ${["min","q1","median","q3","max"].map(k=>fmt(d[k],1)).join("/")} | ${fmt(s.meanScore,3)} | ${["min","median","max"].map(k=>fmt(sd[k],1)).join("/")} | ${s.tieGroups.length} | ${s.distinctTotals} | ${s.B16?"충족":"미충족"} |`);
    }
    lines.push("","| 시안 | "+r.ids.map(id=>r.names[id]+" 공동 1위 수").join(" | ")+" |","|---|"+r.ids.map(()=>"---:|").join(""));
    for(const v of VARIANTS) lines.push(`| ${v} | ${r.ids.map(id=>r.scales[v].topCounts[id]).join(" | ")} |`);
    if(title==="bots36") {
      lines.push("","| 시안 | 재생 평균 | 디젤 평균 | 재생>디젤 | nothing 9/9위 도시 |","|---|---:|---:|---|---:|");
      for(const v of VARIANTS) {const s=r.scales[v];lines.push(`| ${v} | ${fmt(s.means.renew,3)} | ${fmt(s.means.diesel,3)} | ${s.renewAboveDiesel?"충족":"미충족"} | ${s.rows.filter(x=>x.strategy==="nothing"&&x.strategyRank===9).length}/6 |`);}
    } else {
      lines.push("","| 시안 | SMR 1위 도시 | 연구 몰빵−연구0 평균 | 연구 이득 (0,15] |","|---|---:|---:|---|");
      for(const v of VARIANTS) {const s=r.scales[v];lines.push(`| ${v} | ${s.smrFirstCities}/6 | ${fmt(s.researchGain,3)} | ${s.researchGain>0&&s.researchGain<=15?"충족":"미충족"} |`);}
      lines.push("","T5에는 diesel/nothing 전략이 없어 재생>디젤·nothing 9/9위는 적용하지 않는다. T5 none은 연구만 하지 않는 운영 전략이며 nothing과 다르다.");
    }
    for(const v of VARIANTS) {
      lines.push("",`### ${title} ${v}: 신뢰 / 총점 / 공동 순위`,"",
        `| 도시 | ${r.strategies.join(" | ")} |`,`|---|${r.strategies.map(()=>"---:|").join("")}`);
      for(const id of r.ids) lines.push(`| ${r.names[id]} | ${r.strategies.map(strategy=>{
        const x=r.scales[v].rows.find(x=>x.id===id&&x.strategy===strategy);
        return `${fmt(x.parts.rel,1)}/${fmt(x.score,1)}/${x.strategyRank}`;
      }).join(" | ")} |`);
    }
  }
  lines.push("","## REL2 4차 학생 계획: 평택 연말","",
    "| 시안 | 신뢰 | 총점 | 순위/6 | 공동 순위 |","|---|---:|---:|---:|---:|");
  for(const v of VARIANTS) {const s=student.scales[v];lines.push(`| ${v} | ${fmt(s.rel,1)} | ${fmt(s.score,1)} | ${s.rank} | ${s.sharedRank} |`);}
  lines.push("",`REL2와 학생 최종 상태 해시·태양광 설치 칸·기준 점수 및 순위를 대조했다. 녹화 공개 계통 MWh 반올림값과 최대 차이 ${fmt(student.maxReferenceError,6)} MWh. 연말 gridS=${fmt(student.observation.gridS,6)}%, 확정 공급/피크=${fmt(student.observation.m,6)}. 순위는 같은 판 다른 5개 AI 도시도 동일 눈금으로 재채점한 결과다.`,
    "","## 3. G 손잡이 후보와 예상 방향(추천·결정 아님)","",
    "- A의 scoreUnsZero: 양의 정전 평활값의 감점을 키운다. unsS=0이면 신뢰100은 그대로이며 반올림도 포화에 관여한다.",
    "- B의 k: 같은 정전이라도 계통 의존 평활값이 크면 낮아진다. k=2는 k=1보다 계통 의존 10%당 10점을 더 낮춘다. 자체 공급이 충분한 봇은 변화가 작거나 없을 수 있다. 여기서 신뢰는 무정전만이 아니라 외부 계통 의존까지 포함하는 G 정의가 된다.",
    "- C의 0.85·1.15: 연결된 확정 공급의 여유가 낮으면 무정전이어도 낮아진다. 재생·저장의 실제 기여나 이웃 지원을 이 확정 공급 정의가 보증하지 않는다는 한계가 있다. 경계를 높이면 같은 m의 점수 상한이 낮아질 수 있다.",
    "- 이번 결과는 고정된 행동의 점수 정의 비교다. 눈금 변경에 따른 학생·AI 행동 변화, 실제 전력 신뢰·자립도의 경험적 타당성을 입증하지 않는다.",
    "","## 검증·부하·미검증","",
    `측정 단언 ${o.checks}개 통과. 자체 검사 ${o.jobs["self-test"].result.checks}개 통과. 기준 bots36은 REL2의 54개 점수·부분점수와 대조했고, 모든 시안은 현재 눈금 총점 복원·월별 EMA/공급비를 확인했다.`,
    "| 실행 | 초 | 원 검사 통과 | 원 검사 실패 |","|---|---:|---:|---:|");
  for(const [key,j] of Object.entries(o.jobs)) lines.push(`| ${key} | ${fmt(j.seconds,1)} | ${j.result.sourceChecks?.passCount??"—"} | ${j.result.sourceChecks?.fail.length??"—"} |`);
  for(const [key,j] of Object.entries(o.jobs)) for(const failure of j.result.sourceChecks?.fail||[]) lines.push(`- 원 검사 실패 ${key}: ${failure}`);
  lines.push("","무거운 워커는 직렬 1개. 시작 전·실행 중 10초마다 부하를 표본화하며 150 초과면 대기/SIGSTOP, 내려가면 자신이 멈춘 워커만 SIGCONT한다. 외부에서 멈출 경우 controller와 worker를 함께 멈추고 함께 재개한다. 벽시계 제한으로 작업을 폐기하지 않으므로 SIGSTOP 구간 뒤 계산이 이어진다.",
    `150 초과 표본 ${o.loadLog.filter(x=>x.value>150).length}개. 최대 부하는 표본 최대이며 순간 피크는 아니다. ${fmt(o.seconds/60)}분은 실행기 시작부터 저장 전까지이며 자료 읽기·작성·후속 검증 시간은 제외한다.`,
    "축소 없음: 사후 재채점이므로 T5를 시안마다 재실행하지 않아 모든 눈금을 같은 36달 궤적에 적용했다.",
    "미검증: 다른 씨앗·AI 성향, 실제 학생 행동 반응, 브라우저·외부 네트워크·운영 환경. 실제 부하150 초과가 없었다면 고부하 자동 신호 경로는 미검증이다. UI 수정·커밋·브라우저·외부 네트워크는 실행하지 않았다.","");
  return lines.join("\n");
}
if(require.main===module) {
  if(process.argv[2]==="--worker") {
    ok(process.env.REL3_SERIAL==="1","serial parent required");
    const started=Date.now(),kind=process.argv[3];
    const result=({"self-test":selfTest,starting,student,general,technology})[kind]();
    const saved=save(process.argv[4],{result,seconds:(Date.now()-started)/1000,checks:checks+base.assertions()+rel2.checks()});
    eq(saved.file,process.argv[4],"worker result under 1 MB");
  } else if(process.argv[2]==="--self-test") {
    (async()=>{const dir=fs.mkdtempSync("/tmp/rel3-self-");console.log(JSON.stringify(await runJob("self-test",dir)));})()
      .catch(e=>{console.error(e);process.exitCode=1;});
  } else main().catch(e=>{console.error(e);process.exitCode=1;});
}
