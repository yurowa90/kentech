"use strict";
// Measurement only: node tests/league/review/rel2-student.js [--self-test]
// Single child worker; SIGSTOP/SIGCONT safe. No UI writes, browser, network or commits.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const os = require('node:os'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const {spawn, execFileSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../..');
const BRIEFS = process.env.REL2_BRIEFS || path.join(os.homedir(), 'Projects/kentech-wt/_briefs');
const read = f => fs.readFileSync(path.resolve(ROOT, f), 'utf8');
const clone = x => JSON.parse(JSON.stringify(x));
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const mean = a => a.reduce((s,x)=>s+x,0)/a.length;
let checks = 0;
function ok(x, label) { assert.ok(x, label); checks++; }
function eq(a,b,label) { assert.equal(JSON.stringify(a),JSON.stringify(b),label); checks++; }
function near(a,b,label,tol=1e-7) {ok(Number.isFinite(a)&&Math.abs(a-b)<=tol, `${label}: ${a} / ${b}`);}
// Reuse the reviewed VM loader, grid observer and bots36 Python postprocessor.
// A separate module object prevents rel-gridshare's CLI from running.
const baseBox = {require, module:{exports:{}}, __dirname, console, process};
vm.runInNewContext(read('tests/league/review/rel-gridshare.js') +
  '\nmodule.exports={context,distribution,summarize,pythonString,pythonPost,selfTest,assertions:()=>assertions};',baseBox);
const base = baseBox.module.exports;
function pyString(file,key) {
  const m=read(file).match(new RegExp(`^${key} = r?"""([\\s\\S]*?)"""`, 'm'));
  ok(m,`extract ${key}`); return m[1];
}
const REC = path.join(BRIEFS,'video3/rec_solo.py'), COMMON=path.join(BRIEFS,'video3/common.py');
const LOG = path.join(BRIEFS,'video4/solo/solo-log.json');
const REFERENCE = [1632.2,1053.4,1002.4,692,1137.6,843.3,1119.5,955.7,765.9,993.6,960.3,1495];
function fixture() {
  const scenes=JSON.parse(read(LOG)).scenes;
  return Array.from({length:12},(_,i)=>{
    const notes=scenes.filter(s=>s.id.startsWith(`${i+1}월-`)).flatMap(s=>s.notes||[]);
    return {plan:notes.find(([k])=>k==='시험 계획')[1], placed:notes.find(([k])=>k==='태양광 배치')[1],
      response:notes.some(([k,v])=>k==='대응'&&v==='조건부 유치')};
  });
}
function context(share=.5,factor=1,instrument=true) {
  const ctx=base.context(share,instrument), p=ctx.KCP.ECON_DATA.params;
  ctx.structuredClone=structuredClone;
  p.aiSupplyReserve.v *= factor; p.aiSafeReserve.v *= factor;
  return ctx;
}
function candidates(ctx,plan) {
  const B=ctx.KCP.buildGame, prior=B.current;
  B.current=()=>plan;
  try {
    const original=pyString(REC,'CAND_JS');
    const needle=" && (()=>{\n      const p=B.tileXY(t.c,t.r);\n      return p && document.elementFromPoint(p[0],p[1])?.tagName==='CANVAS';\n    })()";
    eq(original.split(needle).length,2,'one DOM visibility predicate');
    return clone(vm.runInContext('('+original.replace(needle,'')+')',ctx)('solar'));
  } finally {B.current=prior;}
}
function connect(ctx,plan) {
  const B=ctx.KCP.buildGame, prior=B.current; B.current=()=>plan;
  try {
    const pairs=vm.runInContext('('+pyString(COMMON,'LINE_PAIRS_JS')+')',ctx)();
    pairs.forEach(([a,b])=>plan.lines.push({p:clone(B.routePath(a,b))}));
    return clone(pairs);
  } finally {B.current=prior;}
}
function student({share,variant='solar',months=12,instrument=true}) {
  const ctx=context(share,1,instrument), {leagueCore:C,buildGame:B,econ:X}=ctx.KCP;
  const R=C.regionOf('south'), ids=R.teams.map(t=>t.id), id='pyeongtaek', observed=fixture();
  const S=C.newState('rel2-student',R.id,0,ids,{turns:12,seedMode:'fixed'}), rows=[], rejects=[];
  eq(S.seedKey,'0','recording fixed event/economy seed'); eq(S.salt,0,'fixed weather salt');
  const apply=(team,type,extra={})=>{
    const r=C.reduce(S,{team,token:`solo-city-${team}`,type,...extra},0,B);
    ok(r.ok,`${S.round}/${team}/${type}: ${r.err}`); return r;
  };
  ids.forEach(team=>apply(team,'claim'));
  function computers(repliesOnly) {
    const rs=C.computerPlans(S,B,id,'balanced',repliesOnly);
    rs.filter(r=>!r.ok).forEach(r=>{rejects.push({month:S.round,...r});ok(r.type==='tie','only tie may reject');});
  }
  for(let m=1;m<=months;m++) {
    C.host(S,'next',0); eq(S.round,m,'one month advanced');
    computers(false); computers(true); B.selectPack(C.teamDef(R,id).pack,'league');
    const rd=C.roundsOf(S)[m-1];
    const p=B.sanitize(S.teams[id].plan||{},1e9); p.season=rd.season;
    // rec_solo clicks the first applicable cond response, otherwise leaves default.
    const ev=S.events.find(ev=>ev.round===m && C.hits(R,C.eventDef(R,ev.id),id,S) &&
      C.eventDef(R,ev.id).opts?.some(o=>o.id==='cond'));
    if(ev) apply(id,'respond',{ev:ev.id,opt:'cond'});
    if(m===1) connect(ctx,p);
    const before=clone(p), ordered=candidates(ctx,p), placed=[], denied=[];
    if(variant==='solar') for(const {i} of ordered) {
      if(placed.length===([1,2,3,12].includes(m)?2:1)) break;
      const candidate=clone(p); candidate.builds.push({t:'solar',i});
      const r=C.reduce(S,{team:id,token:S.teams[id].token,type:'plan',rev:S.teams[id].rev+1,plan:candidate},0,B);
      if(r.ok) {p.builds=candidate.builds; placed.push(i);} else denied.push({i,error:r.err});
    }
    apply(id,'plan',{rev:S.teams[id].rev+1,plan:p});
    eq(p.policies,[],'student policies unchanged'); eq(p.shed,'home','shed unchanged');
    const planMatches=JSON.stringify(p.builds)===JSON.stringify(observed[m-1].plan.builds);
    eq(p.lines,observed[m-1].plan.lines,'recording line routes reproduced');
    eq(p.seed,observed[m-1].plan.seed,'trial seed reproduced');
    eq(!!ev,observed[m-1].response,'recording response reproduced');
    const mods=C.trialMods(S,R,id); B.selectPack(C.teamDef(R,id).pack,'league');
    const sim=B.simulate(p,7,{league:true,mods}); const trial=C.gridFill(sim);
    computers(true); apply(id,'ready',{ready:true});
    const res=C.run(S,B,0), r=res.team[id], score=X.score({...S.econ,len:m});
    const g=instrument?clone(ctx.__relActual[id]):null;
    const publicMWh=Math.max(0,r.isolated.uns-r.uns-r.imp+r.sub)*rd.mdays/rd.days;
    if(g) {near(g.gridCost,g.gridMWh*.012,'grid marginal cost');ok(Math.abs(g.gridMWh-publicMWh)<.15,'public rounded grid estimate');}
    const unsPct=r.unsPct, trialUnsPct=trial.tot.dem>0?100*trial.unsTotal/trial.tot.dem:0;
    ok(Number.isFinite(trialUnsPct),'trial uns finite');
    rows.push({month:m,unsPct,trialUnsPct,rel:score.by[id].parts.rel,score:score.by[id].score,
      rank:score.by[id].rank,gridMWh:g?.gridMWh,gridCost:g?.gridCost,publicMWh,
      target:unsPct<.005?'grid':'uns',targetBoth:unsPct<.005&&trialUnsPct<.005?'grid':'uns',
      placed,planMatches,denied,candidateOrder:ordered.map(x=>x.i),beforeBuilds:before.builds.length,
      builds:clone(p.builds),waitingMW:r.grid?.waitingMW,grid:clone(r.grid),seed:res.seed,trialSeed:p.seed,events:clone(res.events),
      reference:REFERENCE[m-1],difference:publicMWh-REFERENCE[m-1]});
    process.send?.({kind:'month',job:`student-${variant}-${share}`,month:m});
  }
  const last=rows.at(-1), score=X.score({...S.econ,len:months});
  return {share,variant,rows,gridMonths:rows.filter(r=>r.target==='grid').length,
    unsMonths:rows.filter(r=>r.target==='uns').length,score:last.score,rank:last.rank,
    ranking:clone(score.rank),rejects,stateHash:hash(JSON.stringify(S)),
    maxReferenceError:Math.max(...rows.map(r=>Math.abs(r.difference)))};
}
function general({factor,months=36}) {
  const ctx=context(.5,factor,false);
  vm.runInContext(base.pythonString('tests/league/calib.py','AUTO'),ctx);
  let js=base.pythonString('tests/league/bots36.py','JS');
  const needle='run.hist.push({month: m,';
  eq(js.split(needle).length,2,'bots progress instrumentation single site');
  js=js.replace(needle,'__rel2progress(run.rotation,m); run.hist.push({month: m,');
  ctx.__rel2progress=(rotation,month)=>process.send?.({kind:'month',job:`bots-${factor}`,rotation,month});
  const raw=vm.runInContext(js,ctx)({months,rotations:9});
  ok(raw.runs.length===9&&raw.runs.every(r=>r.hist.length===months&&r.rows.length===6),'full bots matrix');
  const rows=raw.runs.flatMap(run=>run.rows.map(r=>({id:r.id,strategy:r.strategy,score:r.score,parts:r.parts,avgUns:r.unsPct})));
  const summary=base.summarize(rows,raw.strategies,raw.ids);
  const post=months===36?base.pythonPost(raw):{sourceChecks:{passCount:raw.checks.filter(r=>r[0]).length,fail:raw.checks.filter(r=>!r[0]).map(r=>r[1])}};
  return {...summary,factor,months,names:raw.names,seed:'bots-strategy-common',distribution:base.distribution(rows.map(r=>r.parts.rel)),
    meanUns:mean(rows.map(r=>r.avgUns)),sourceChecks:post.sourceChecks,
    monthly:raw.runs.flatMap(run=>run.hist.map(h=>({rotation:run.rotation,month:h.month,
      uns: Object.fromEntries(raw.ids.map(id=>[id,h.energy[id].unsPct])),
      rel: h.score?Object.fromEntries(raw.ids.map(id=>[id,h.score.by[id].parts.rel])):null}))),
    rawHash:hash(JSON.stringify(raw))};
}
function selfTest() {
  base.selfTest();
  const baseline=context(.5,1,false);
  for(const factor of [1,.5,0]) {
    const ctx=context(.5,factor,false), p=ctx.KCP.ECON_DATA.params;
    for(const key of Object.keys(p)) eq(p[key].v,
      ['aiSupplyReserve','aiSafeReserve'].includes(key)?baseline.KCP.ECON_DATA.params[key].v*factor:baseline.KCP.ECON_DATA.params[key].v,
      `only reserve changes ${factor}/${key}`);
    for(const [style,{risk}] of Object.entries(p.aiStyles.v)) near(1+p.aiSupplyReserve.v+p.aiSafeReserve.v*(1-risk),
      1+factor*({balanced:.45,bold:.35,careful:.55}[style]),`${factor}/${style} target`);
  }
  eq([0,.004999,.005,.01].map(u=>u<.005?'grid':'uns'),['grid','grid','uns','uns'],'D80 boundary in percent');
  const a=student({share:.5,months:1}),b=student({share:.5,months:1,instrument:false});
  eq(a.stateHash,b.stateHash,'observer preserves whole first-month state');
  eq(a.rows[0].placed,fixture()[0].placed,'first-month candidates match recording');
  near(a.rows[0].publicMWh,REFERENCE[0],'first-month recording rounded precision',.1);
  return {checks:checks+base.assertions(),failures:0};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const loadLog=[];
function load(label) {const value=os.loadavg()[0];loadLog.push({at:new Date().toISOString(),label,value});return value;}
function hashes() {
  const files=fs.readdirSync(path.join(ROOT,'ui')).filter(f=>f.endsWith('.js')).map(f=>'ui/'+f);
  files.push('tests/league/bots36.py','tests/league/calib.py','tests/league/review/rel-gridshare.js',REC,COMMON,LOG,
    path.join(BRIEFS,'video3/script.md'),path.join(BRIEFS,'video4/review4-solo.md'),'docs/DECISIONS.md');
  return Object.fromEntries(files.map(f=>[f,hash(read(f))]));
}
async function runJob(job,dir) {
  while(load('before '+job.key)>150) await sleep(10000);
  const out=path.join(dir,job.key+'.json');
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[__filename,'--worker',JSON.stringify({...job,out})],
      {stdio:['ignore','inherit','inherit','ipc'],env:{...process.env,REL2_SERIAL:'1'}});
    console.log(`START ${job.key} pid=${child.pid}`);
    let ownedStop=false;
    const timer=setInterval(()=>{
      const value=load(job.key);
      if(value>150&&!ownedStop) {
        // Signal only our direct worker. Process inspection (ps) is unavailable
        // in the sandbox. A coordinator pausing recording should STOP both
        // controller and worker to prevent an automatic load-based resume.
        child.kill('SIGSTOP');ownedStop=true;console.log(`LOAD STOP ${child.pid} ${value}`);
      } else if(value<=150&&ownedStop) {child.kill('SIGCONT');ownedStop=false;console.log(`LOAD CONT ${child.pid}`);}
    },10000);
    const stop=()=>{child.kill('SIGCONT');child.kill('SIGTERM');};
    process.once('SIGTERM',stop);process.once('SIGINT',stop);
    child.on('message',m=>{if(m.month===1||m.month%6===0) console.log(JSON.stringify(m));});
    child.on('error',e=>{clearInterval(timer);reject(e);});
    child.on('exit',code=>{clearInterval(timer);process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
      code===0?resolve():reject(Error(`${job.key} exit ${code}`));});
  });
  load('after '+job.key);return JSON.parse(read(out));
}
function save(file,data) {
  const s=JSON.stringify(data)+'\n';
  if(Buffer.byteLength(s)>1000000) file=path.join(BRIEFS,'lanes/q8/results/rel2',path.basename(file));
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,s);return file;
}
async function main() {
  const started=Date.now(), original=hashes(),head=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
  const dir=fs.mkdtempSync('/tmp/rel2-');
  const output={head,node:process.version,started:new Date(started).toISOString(),sourceHashes:original,jobs:[],loadLog,dir};
  console.log(`REL2 controller=${process.pid} checkpoint=${dir}`);
  output.selfTest=(await runJob({key:'self-test',kind:'self-test'},dir)).result;
  const jobs=[...[.5,.4,.3].flatMap(share=>['solar','none'].map(variant=>({key:`student-${variant}-${share}`,kind:'student',share,variant}))),
    ...[1,.5,0].map(factor=>({key:`bots-${factor}`,kind:'general',factor,months:36}))];
  for(const job of jobs) {
    if(job.kind==='general') {
      const done=output.jobs.filter(j=>j.kind==='general');
      const estimate=done.length?Math.max(...done.map(j=>j.seconds*36/j.months)):300;
      if((Date.now()-started)/1000+estimate*(3-done.length)>85*60 || output.reduced) {
        output.reduced='90분 예산 예상에 따라 bots 시안을 12달로 축소';job.months=12;
      }
    }
    const result=await runJob(job,dir);output.jobs.push({...job,...result});save(path.join(dir,'checkpoint.json'),output);
  }
  eq(hashes(),original,'all input and UI hashes preserved');
  eq(execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),head,'HEAD preserved');
  output.seconds=(Date.now()-started)/1000;output.maxLoad=Math.max(...loadLog.map(x=>x.value));
  output.checks=checks+base.assertions()+output.jobs.reduce((s,j)=>s+j.checks,0)+output.selfTest.checks;
  output.scriptHash=hash(read(__filename));
  const file=save(path.join(__dirname,'rel2-results.json'),output);
  fs.writeFileSync(path.join(__dirname,'REL2-report.md'),report(output,file));
  console.log(JSON.stringify({file,seconds:output.seconds,maxLoad:output.maxLoad,checks:output.checks}));
}
function report(out,file) {
  const fmt=(x,n=2)=>Number.isFinite(x)?x.toFixed(n):'—', lines=['# REL2 학생 계획 재현·컴퓨터 공급 여유 측정','',
    `HEAD ${out.head}; Node ${out.node}; 실행 ${fmt(out.seconds/60)}분; 10초 표본 최대 1분 부하 ${fmt(out.maxLoad)}.`,
    `재현: \`node tests/league/review/rel2-student.js\`; 자체 검사: \`node tests/league/review/rel2-student.js --self-test\`.`,
    `결과: ${file}. UI와 입력 해시·HEAD 보존 확인. 측정 단언 ${out.checks}개, 자체 검사 ${out.selfTest.checks}개 통과.`,
    '', '## ① 학생 계획', '',
    '혼자 평택·6도시·12달·balanced AI 5개. newState seedMode=fixed: seedKey="0", salt=0; 실제 날씨 7000+13×월, 시험 씨앗 3110. 호스트 next → AI 계획·응답 → 학생 계획 → AI 응답 → ready → run 순서다.',
    'rec_solo.py CAND_JS를 직접 추출하여 화면 DOM 가림 판정만 제외했다. 비외부·빈칸·자리 적법·기존 선 위/인접 조건과 민원 수→타일 번호 정렬, place 호출당 한 번 후보를 만드는 순서를 유지한다. 첫 달 LINE_PAIRS_JS도 직접 추출하고 routePath로 20개 선을 재현했다. 각 달 선과 시험 씨앗·대응은 4차 로그와 단언한다. 계획은 reduce를 통해 제출하며 접속 대기는 원 엔진이 처리한다.',
    '1·2·3·12월 태양광 2기, 나머지 1기. cond 대응이 보이는 1·5월은 조건부 유치, 그 외 기본. 정책·세율·절전·연계선은 변경하지 않는다. 상한을 낮춰도 2월 배터리·5월 절전 조건 분기는 추가하지 않는다(사용자 지정 고정 계획). none 변형도 같은 첫 달 송전선·대응을 유지하고 태양광만 생략한다.',
    'gridMWh/gridCost는 반올림 전 gridSupply 호출 증분의 달력 월 환산(억); publicMWh는 4차 UI와 같은 공개 반올림 필드 (isolated.uns−uns−imp+sub)×월일수/7이다. 대조표는 publicMWh를 쓴다. 신뢰 부분점수는 그 달까지의 완화 상태를 반영한다. target은 요청한 실제 정전<0.005% 기준이고, 실제·시험 모두 0인 D-80 엄격 조건은 targetBoth로 별도 기록한다.',
    '', '| 계획 | 상한 | grid/uns 달 | 연말 신뢰 | 총점 | 순위 |', '|---|---:|---:|---:|---:|---:|'];
  const students=out.jobs.filter(j=>j.kind==='student');
  for(const {result:r} of students) lines.push(`| ${r.variant} | ${r.share} | ${r.gridMonths}/${r.unsMonths} | ${fmt(r.rows.at(-1).rel,1)} | ${fmt(r.score,1)} | ${r.rank} |`);
  lines.push('', '### 4차 대조 (상한 0.5·solar)', '', '| 월 | 4차 MWh | 재현 공개 MWh | 차이 | 태양광 칸 일치 | 대기 MW |', '|---|---:|---:|---:|---|---:|');
  const ref=students.find(j=>j.share===.5&&j.variant==='solar').result;
  for(const r of ref.rows) lines.push(`| ${r.month} | ${fmt(r.reference,1)} | ${fmt(r.publicMWh,3)} | ${fmt(r.difference,3)} | ${r.planMatches?'일치':'불일치'} | ${fmt(r.waitingMW)} |`);
  for(const {result:r} of students) {
    lines.push('',`### ${r.variant} · 상한 ${r.share}`,'','| 월 | 정전% | 시험 정전% | 신뢰 | 계통 MWh | 비용 억 | 실제 대상 | 시험·실제 대상 | 설치 칸 |','|---|---:|---:|---:|---:|---:|---|---|---|');
    for(const x of r.rows) lines.push(`| ${x.month} | ${fmt(x.unsPct,4)} | ${fmt(x.trialUnsPct,4)} | ${fmt(x.rel,1)} | ${fmt(x.gridMWh,3)} | ${fmt(x.gridCost,3)} | ${x.target} | ${x.targetBoth} | ${x.placed.join(', ')||'없음'} |`);
  }
  lines.push('', '## ② 공급 여유', '',
    '| 위치 | 값·등급 | 의미 |','|---|---|---|',
    '| ui/econ-data.js:218; ui/league-ai.js:158 | aiSupplyReserve=0.35, G | 공통 확정 공급 예비율 |',
    '| ui/econ-data.js:219; ui/league-ai.js:158 | aiSafeReserve=0.20, G | 추가 예비율×(1−risk) |',
    '| ui/econ-data.js:207–211 | careful risk=0, balanced=0.5, bold=1; G | 성향 |',
    '| ui/econ-data.js:221; ui/league-ai.js:227 | aiBoldExpansion=0, G | 선택 투자 추가 확정 공급(현재 비활성) |',
    '| ui/econ-data.js:216,220; ui/league-ai.js:229 | aiRenewFloor=0.1, aiRenewTarget=1.6; G | 재생 정격 목표, 확정 공급 보증에는 불포함 |',
    '', '| 성향 | 현재 확정 공급/피크 | −50% | 여유0 |','|---|---:|---:|---:|',
    '| balanced | 1.45 | 1.225 | 1.00 |','| bold | 1.35 | 1.175 | 1.00 |','| careful | 1.55 | 1.275 | 1.00 |',
    '', '피크는 기본 peakDemand×max(주민/초기주민,산업/초기산업). 공급은 연결된 고정 공급과 공사 완료 확정 발전으로 세며 재생 정격·빈 저장은 제외한다(league-ai.js:91–109). VM에서 aiSupplyReserve와 aiSafeReserve만 동일 비율로 바꾼다. 0은 목표상의 여유 없음이지 설비 단위 크기로 생기는 실제 잉여가 0이라는 뜻은 아니다.',
    'bots36 기본 씨앗 bots-strategy-common·6도시×9전략, 공통 기반은 balanced AI. careful·bold 별도 장기 실행은 하지 않았다. bots36의 storage 공급 판정도 같은 공개 G 계수를 읽으므로 같이 변한다. 원 JS 전체와 36달 Python 후처리 단언을 유지한다. 평균 정전은 모든 도시×전략×월 동일 가중, 분포는 종료 부분점수 54개다. B16은 공동 1위를 포함해 한 전략이 6도시 전부 1위이면 실패한다.',
    '', '| 여유 배율 | 기간 | 신뢰100/54 | 비율 | min/Q1/중앙/Q3/max | 평균 정전% | B16 |','|---|---:|---:|---:|---|---:|---|');
  const bots=out.jobs.filter(j=>j.kind==='general');
  for(const {result:r} of bots) lines.push(`| ${r.factor} | ${r.months} | ${r.distribution.hundred} | ${fmt(r.distribution.hundredFraction*100)}% | ${['min','q1','median','q3','max'].map(k=>fmt(r.distribution[k],1)).join('/')} | ${fmt(r.meanUns,4)} | ${r.B16?'충족':'미충족'} |`);
  lines.push('','| 도시 | 현재 1위 전략(수) | −50% 1위 전략(수) | 여유0 1위 전략(수) |','|---|---|---|---|');
  for(const id of bots[0].result.ids) lines.push(`| ${bots[0].result.names[id]} | ${bots.map(j=>{const w=j.result.winners[id];return `${w.join(', ')} (${w.length})`;}).join(' | ')} |`);
  for(const {result:r} of bots) {
    lines.push('',`### 여유 배율 ${r.factor} 도시×전략 총점/신뢰`,'',`| 도시 | ${r.strategies.join(' | ')} |`,`|---|${r.strategies.map(()=>'---:|').join('')}`);
    for(const id of r.ids) lines.push(`| ${r.names[id]} | ${r.strategies.map(s=>{const x=r.rows.find(x=>x.id===id&&x.strategy===s);return `${x.score}/${x.parts.rel}`;}).join(' | ')} |`);
  }
  lines.push('', '## G 손잡이 후보와 예상 방향(결정 아님)', '',
    '- aiSupplyReserve·aiSafeReserve: 낮추면 목표 확정 공급이 줄어든다. 실제 건설량·정전·점수의 변화는 설비 단위·기존 공급·예산·계통 보충·경제 피드백에 의존한다.',
    '- gridImportShare: 동일 수요·자체 공급에서 낮추면 남는 부족은 늘거나 유지된다. 장기 결과는 투자·인구 변화도 포함한다.',
    '- aiBoldExpansion: 현재 0이라 이번 실험에는 효과가 없다. 양수화하면 선택 투자 시 위험 선호가 높은 성향의 확정 공급 목표가 높아질 것으로 예상한다.',
    '', '## 검증·부하·미검증','',
    `축소: ${out.reduced||'없음, bots 세 시안 모두 36달'}.`,
    '| 작업 | 초 | 원 검사 통과 | 원 검사 실패 |','|---|---:|---:|---:|');
  for(const j of out.jobs) lines.push(`| ${j.key} | ${fmt(j.seconds,1)} | ${j.result.sourceChecks?.passCount??'—'} | ${j.result.sourceChecks?.fail.length??'—'} |`);
  for(const j of bots) for(const f of j.result.sourceChecks.fail) lines.push(`- ${j.key} 원 검사 실패: ${f}`);
  lines.push('', `부하 150 초과 표본 ${out.loadLog.filter(x=>x.value>150).length}개. 무거운 자식 워커는 직렬 1개; 시작 전 및 실행 중 10초 간격 부하 검사. 녹화용 외부 일시정지는 controller와 worker를 함께 멈춰야 부하 감시기의 자동 재개를 막을 수 있다. 상태·진행 파일은 ${out.dir}.`,
    '미검증: 브라우저·화면 가림/클릭·전송 지연·외부 네트워크·운영 환경·다른 씨앗·careful/bold 장기 실행. 사용자 금지에 따라 UI 변경·커밋·브라우저 실행은 하지 않았다. SIGSTOP 고부하 자동 경로는 실제 발생 여부를 별도로 해석해야 한다.');
  return lines.join('\n')+'\n';
}
if(require.main===module) {
  if(process.argv[2]==='--worker') {
    ok(process.env.REL2_SERIAL==='1','serial scheduler required');
    const job=JSON.parse(process.argv[3]),started=Date.now();
    const result=job.kind==='self-test'?selfTest():job.kind==='student'?student(job):general(job);
    save(job.out,{result,seconds:(Date.now()-started)/1000,checks:checks+base.assertions()});
  } else if(process.argv[2]==='--self-test') {
    (async()=>{const dir=fs.mkdtempSync('/tmp/rel2-self-'); console.log(JSON.stringify(await runJob({key:'self-test',kind:'self-test'},dir)));})().catch(e=>{console.error(e);process.exitCode=1;});
  } else main().catch(e=>{console.error(e);process.exitCode=1;});
}
