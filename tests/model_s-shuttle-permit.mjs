// 기대값 출처: 사용자 제공 수정 명세 5~6절, 8절. 구현값을 oracle로 사용하지 않는다.
import fs from 'node:fs';
import vm from 'node:vm';
import {isDeepStrictEqual} from 'node:util';

function josa(word, pair) {
  const w = String(word).trim(), code = w.charCodeAt(w.length - 1);
  const jong = code >= 0xAC00 && code <= 0xD7A3 ? (code - 0xAC00) % 28 : null;
  const endings = {
    '을/를':['을','를','을(를)'], '이/가':['이','가','이(가)'],
    '은/는':['은','는','은(는)'], '와/과':['과','와','과(와)'],
    '이고/고':['이고','고','이고'], '으로/로':['으로','로','(으)로']
  };
  if (!Object.hasOwn(endings, pair)) return w;
  return w + endings[pair][jong === null ? 2 : jong && !(pair === '으로/로' && jong === 8) ? 0 : 1];
}
const KCP = {
  games:{}, YEARS:{}, ORIGINAL_ORDER:[], josa,
  esc: value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
};
// prototype 판정도 동일 realm에서 실행되도록 입력을 VM 안으로 복제한다.
const context = vm.createContext({window:{KCP}, console});
vm.runInContext(fs.readFileSync(new URL('../games/s-shuttle-permit.js', import.meta.url), 'utf8'), context);
const game = KCP.games['s-shuttle-permit'], M = game.model;
const copy = x => {
  context.__inputJSON = JSON.stringify(x);
  return vm.runInContext('JSON.parse(__inputJSON)', context);
};
const plain = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
let passed = 0;
const failures = [];
function check(label, get, want, digits = null) {
  try {
    const got = get();
    const ok = digits === null ? isDeepStrictEqual(plain(got), plain(want))
      : typeof got === 'number' && Number.isFinite(got) && Math.abs(got - want) <= .5 * 10 ** -digits + 1e-13;
    if (ok) passed++;
    else failures.push(`${label}: 기대 ${JSON.stringify(want)}, 실제 ${JSON.stringify(got)}${digits === null ? '' : ` (허용 ±${.5 * 10 ** -digits})`}`);
  } catch (e) { failures.push(`${label}: ${e.message || e}`); }
}
function block(label, run) {
  try { run(); } catch (e) { failures.push(`${label}: ${e.message || e}`); }
}
const ORDER = ['clear','rain','fog'];
// 명세 5.3의 기본 입력을 직접 작성한다. defaults()의 출력에 기대값을 의존하지 않는다.
const base = () => ({v:{clear:40,rain:40,fog:30}, tests:[], useOp:false, rule:'R1', liab:'L1', assume:{auto:.1,staff:.05,proof:.4,alt:1.5}});
function add(s, c, v) { return M.addTest(s, c, v); } // 공개 API: 새 plan을 반환
function make({v, rule='R1', liab='L1', useOp=false, tests=[]} = {}) {
  let s = copy({...base(), ...(v ? {v} : {}), rule, liab, useOp});
  for (const [c, speed, count] of tests) for (let i=0; i<count; i++) s = add(s,c,speed);
  return s;
}
function locked(s, decisions=1) {
  const p = plain(s);
  const input = {version:1,...p,reason:'가상의 심사 이유',decisions,
    locked:{modelVersion:1,plan:{...p,reason:'가상의 심사 이유',decisions},result:{}}};
  // 파생 result를 신뢰하지 않고 재계산하는 계약에 맞춘 유효한 저장 입력.
  return copy({game:input});
}

block('6.1 물리', () => {
  const boundaries = [
    ['clear',80,6.5,6.8,7,101.317211,103.384468,104.731837],
    ['rain',45,3,3.5,5,50.631777,54.268061,63.560320],
    ['fog',20,4,4.5,5.5,32.887903,34.505281,37.390697]
  ];
  for (const [c,R,lo,a,hi,...want] of boundaries) {
    [lo,a,hi].forEach((acc,i) => check(`6.1 ${c} safe(${R},${acc})`,()=>M.safe(R,acc),want[i],6));
    for (const r of [0,4,5]) check(`5.2 ${c} R=${r}`,()=>M.safe(r,lo),0);
  }
  for (const [a,d] of [[3,59.629630],[5,41.111111],[4,48.055556],[5.5,38.585859]])
    check(`6.1 distance(60,${a})`,()=>M.distance(60,a),d,6);
  for (const [c,v,z] of [['rain',60,'band'],['fog',60,'above'],['fog',35,'band'],['fog',40,'above'],['clear',0,'ban']])
    check(`6.1 ${c}/${v} 물리 상태`,()=>M.zone(c,v),z);
  for (const [a,mu] of [[6.5,.66],[7,.71],[3,.31],[5,.51]])
    check(`6.1 마찰계수 a=${a}`,()=>Number(M.fmt(a/9.8)),mu);
});
block('6.1 상한', () => {
  const table = [3,4.74,6.30,7.75,9.15,10.51,11.84,13.15,14.43,15.71,16.96];
  const exact = [2.995732274,4.743864518,6.295793622,7.753656528,9.153519027,10.513034909,11.842395652,13.148113802,14.434649715,15.705216422,16.962219236,18.207514251,19.442569330];
  table.forEach((u,x)=>check(`6.1 표 U(${x})`,()=>M.upper(x),u));
  exact.forEach((u,x)=>check(`6.1 역산 U(${x})`,()=>M.upperExact(x),u,9));
  for (const x of [11,12]) check(`6.1 표 밖 U(${x})`,()=>M.upper(x),exact[x],9);
  // 독립 oracle: log(k!)로 각 확률질량을 직접 합산한다(구현의 점화식과 별개).
  function logCDF(x,mu) {
    let sum=0, logFactorial=0;
    for (let k=0;k<=x;k++) {
      if (k) logFactorial+=Math.log(k);
      sum+=Math.exp(-mu+k*Math.log(mu)-logFactorial);
    }
    return sum;
  }
  for (let x=0;x<=80;x++) check(`12.5 역산 CDF X=${x}`,()=>logCDF(x,M.upperExact(x)),.05,11);
});

const inputs = {
  A:{v:{clear:0,rain:0,fog:0}},
  B:{v:{clear:60,rain:60,fog:60},rule:'R2',liab:'L2',useOp:true,tests:[['clear',60,4],['rain',60,3],['fog',60,3]]},
  C:{rule:'R3',liab:'L3',useOp:true,tests:[['clear',40,1],['rain',40,1],['fog',30,1]]},
  D:{v:{clear:40,rain:0,fog:0},tests:[['clear',40,10]]},
  E:{rule:'R2',liab:'L2',useOp:true}
};
// 6.3: km,N,X,U,point,upper,lowX,mode (U는 증거가 있는 행만 계산).
const evidences = {
  A:[[0,0,0,null,null,null,0,'ban'],[0,0,0,null,null,null,0,'ban'],[0,0,0,null,null,null,0,'ban']],
  B:[[8000,.8,0,3,0,3.75,0,'auto'],[6000,.6,2,6.3,3.333333,10.5,0,'deny'],[6000,.6,8,14.43,13.333333,24.05,0,'deny']],
  C:[[32000,3.2,3,7.75,.937500,2.421875,0,'auto'],[4000,.4,0,3,0,7.5,0,'staff'],[2300,.23,1,4.74,4.347826,20.608696,0,'deny']],
  D:[[20000,2,1,4.74,.5,2.37,0,'auto'],[0,0,0,null,null,null,0,'ban'],[0,0,0,null,null,null,0,'ban']],
  E:[[30000,3,3,7.75,1,2.583333,0,'auto'],[2000,.2,0,3,0,15,0,'auto'],[300,.03,0,3,0,100,0,'auto']]
};
// 6.4: r,p,cost,provide,Nyear,lambda,y. 불허된 조건의 함수 cost값은 0.
const operations = {
  A:[[0,0,0,false,0,0,0],[0,0,0,false,0,0,0],[0,0,0,false,0,0,0]],
  B:[[.8,.1,.96,true,6.5,.52,0],[3.892776,0,0,false,0,0,0],[13.697887,0,0,false,0,0,0]],
  C:[[.8,.1,1.2,true,6.5,.52,0],[1.6,.05,5.2,true,2.5,.2,1],[3.5,0,0,false,0,0,0]],
  D:[[.8,.1,2.4,true,6.5,.52,0],[0,0,0,false,0,0,0],[0,0,0,false,0,0,0]],
  E:[[.8,.1,.96,true,6.5,.52,0],[1.6,.1,1.92,true,2.5,.4,1],[3.5,.1,4.2,true,1,.35,1]]
};
// 6.5: 화면 표시 자체를 검증한다. 내부 값은 fmt 후 비교, 판정에 반올림하지 않는다.
const display = {
  A:['0.0','0.00',0,'100.0','100.0','0.00','0.00',0,'0.0','0.00','1.50'],
  B:['65.0','0.52',0,'100.0','40.0','0.00','6.24',10,'65.0','0.59','0.92'],
  C:['90.0','0.72',1,'51.3','100.0','10.80','10.80',3,'90.0','0.81','0.69'],
  D:['65.0','0.52',0,'100.0','100.0','0.00','15.60',10,'65.0','0.59','0.92'],
  E:['100.0','1.27',2,'36.3','40.0','0.00','15.24',0,'97.5','0.90','0.60']
};
const plans = {};
check('5.3 defaults 수치 입력',()=>M.defaults(),base());
for (const id of Object.keys(inputs)) block(`6.2~6.5 ${id}`,()=>{
  const s=make(inputs[id]); plans[id]=s;
  const before=plain(s);
  const result=M.evaluate(s);
  for (const [i,c] of ORDER.entries()) {
    const e=M.evidence(s,c), row=result.rows.find(r=>r.c===c);
    const [km,N,X,U,point,upper,lowX,mode]=evidences[id][i];
    for (const [key,want] of Object.entries({km,N,X,lowX})) check(`6.3 ${id}/${c} ${key}`,()=>e[key],want);
    for (const [key,want] of Object.entries({point,upper})) check(`6.3 ${id}/${c} ${key}`,()=>e[key],want,want===null?null:6);
    if(U!==null) check(`6.3 ${id}/${c} U`,()=>M.upper(X),U);
    check(`6.3 ${id}/${c} evaluate mode`,()=>row.mode,mode);
    for (const [j,key] of ['r','p','cost','provide','Nyear','lambda','y'].entries())
      check(`6.4 ${id}/${c} ${key}`,()=>row[key],operations[id][i][j],['r','p','cost','Nyear','lambda'].includes(key)?6:null);
  }
  const keys=['share','expected','actual','tailPct','comp','publicCost','operatorCost','delay','benefit','altReduced','altRemaining'];
  keys.forEach((key,i)=>check(`6.5 ${id} ${key}`,()=>{
    const n=result[key];
    return ['actual','delay'].includes(key)?n:M.fmt(['share','comp'].includes(key)?100*n:n,['share','tailPct','comp','benefit'].includes(key)?1:2);
  },display[id][i]));
  const zero=M.evaluateAssumptions(s,copy({alt:0}));
  for (const key of ['altReduced','altRemaining']) check(`6.5 ${id} alt=0 ${key}`,()=>M.fmt(zero[key]),'0.00');
  for (const key of ['share','expected','actual','benefit','publicCost','operatorCost']) check(`6.5 ${id} alt 변경 불변 ${key}`,()=>zero[key],result[key]);
  check(`6.5 ${id} 원본 불변`,()=>s,before);
});

block('6.2 시드와 시험 순서',()=>{
  const sequences={clear:[0,0,0,0,1,0,0,0,0,0],rain:[0,0,0,1,1,1,0,0,2,0],fog:[1,1,0,0,1,0,0,2,0,0]};
  const seeds={clear:[.1394372869,.6521035002,.8123631021,.4046613120,.8922763390,.7736302633,.5372119972,.1750814596,.1313864759,.6048910993],rain:[.0978701620,.6984269170,.5919841065],fog:[.6875943544,.6601987921,.4332195979]};
  for (const c of ORDER) {
    const s=make({tests:[[c,c==='fog'?30:40,10]]});
    check(`6.2 ${c} 시험 1~10 건수`,()=>s.tests.map(t=>t.x),sequences[c]);
    check(`6.2 ${c} 내부 순번`,()=>s.tests.map(t=>t.n),[1,2,3,4,5,6,7,8,9,10]);
    seeds[c].forEach((u,i)=>check(`6.2 sp1|t|${c}|${i+1}`,()=>M.uniform(`sp1|t|${c}|${i+1}`),u,10));
  }
  const year={clear:.3692510540,rain:.8496764919,fog:.8941412815};
  for (const c of ORDER) check(`6.4 year|${c}`,()=>M.uniform(`year|${c}`),year[c],10);
  for (const [c,v,lambda,xs] of [['clear',40,.16,[0,0,0,0]],['rain',40,.320000000,[0,0,0]],['rain',60,.778555129,[0,1,1]],['fog',30,.700000000,[1,1,0]],['fog',60,2.739577491,[3,3,2]]]) {
    const s=make({tests:[[c,v,xs.length]]});
    check(`6.2 ${c}/${v} lambda`,()=>.2*M.rate(c,v),lambda,9);
    check(`6.2 ${c}/${v} 사건`,()=>s.tests.map(t=>t.x),xs);
  }
  const mixed=make({tests:[['fog',30,1],['rain',40,1],['clear',40,1],['rain',40,1],['fog',30,1],['clear',40,1]]});
  for (const c of ORDER) check(`6.2 교차 실행 ${c}`,()=>mixed.tests.filter(t=>t.c===c).map(t=>t.x),sequences[c].slice(0,2));
  check('6.3 D 통과 확률',()=>M.cdf(1,1.6),.524930947,9);
});

block('6.6 추가 사례 6개',()=>{
  const cases=[
    ['이동권',make({rule:'R2',liab:'L3',useOp:true}),false,['100.0','1.27',2,'100.0','19.05','19.05']],
    ['단계적',make({rule:'R3',liab:'L3',useOp:true}),false,['100.0','0.90',2,'100.0','13.43','13.43']],
    ['L1 철수',make({rule:'R2',liab:'L1',useOp:true}),false,['90.0','0.92',1,'100.0','0.00','27.60']],
    ['C 두 배',plans.C,true,['90.0','1.44',2,'100.0','21.60','21.60']],
    ['E 두 배',plans.E,true,['100.0','2.54',5,'40.0','0.00','30.48']],
    ['L1 철수 두 배',make({rule:'R2',liab:'L1',useOp:true}),true,['90.0','1.84',3,'100.0','0.00','55.20']]
  ];
  for (const [label,s,double,want] of cases) {
    const before=plain(s);
    const r=double?M.evaluateAssumptions(s,copy({auto:.2,staff:.1})):M.evaluate(s);
    const got=[M.fmt(r.share*100,1),M.fmt(r.expected),r.actual,M.fmt(r.comp*100,1),M.fmt(r.publicCost),M.fmt(r.operatorCost)];
    check(`6.6 ${label}`,()=>got,want);
    check(`6.6 ${label} 비교 원본 보존`,()=>s,before);
    if(label.startsWith('L1')) {
      const fog=r.rows.find(e=>e.c==='fog');
      check(`6.6 ${label} 안개 허가`,()=>fog.mode,'auto');
      check(`6.6 ${label} 안개 미제공`,()=>fog.provide,false);
      check(`6.6 ${label} 안개 비용`,()=>fog.cost,double?21:10.5,2);
    }
  }
  // 6.6 정책 6,006개에서 L1의 제공 비율 차이 143개를 재현.
  let policies=0,withdrawals=0;
  for(let clear=0;clear<=60;clear+=5) for(let rain=0;rain<=50;rain+=5) for(let fog=0;fog<=30;fog+=5)
    for(const rule of ['R1','R2','R3']) for(const useOp of [false,true]) {
      const s=make({v:{clear,rain,fog},rule,useOp});
      const shares=['L1','L2','L3'].map(liab=>M.evaluate(copy({...plain(s),liab})).share);
      policies++;
      if(shares[0]<shares[1] && shares[0]<shares[2]) withdrawals++;
    }
  check('6.6 전체 정책 수',()=>policies,6006);
  check('6.6 L1 제공 비율이 L2/L3보다 작은 정책 수',()=>withdrawals,143);
});

let excluded;
block('6.6 제외 기록 두 절차',()=>{
  for(const [label,speeds,want] of [
    ['원절차',[60,60,40,45,45,45],[10000,1,4.74,0,'deny']],
    ['양성',[60,60,60,60,40,45],[10000,0,3,1,'auto']]
  ]) {
    let s=make({v:{clear:45,rain:0,fog:0}});
    for(const v of speeds) s=add(s,'clear',v);
    const e=M.evidence(s,'clear');
    check(`6.6 ${label}`,()=>[e.km,e.X,e.upper,e.lowX,M.evaluate(s).rows[0].mode],want);
    if(label==='양성') {
      excluded=s;
      const again=copy({...plain(s),v:{clear:40,rain:0,fog:0}}), r=M.evaluate(again).rows[0];
      check('6.6 재포함 기록',()=>[r.km,r.X,M.fmt(r.upper),r.lowX,r.mode,again.tests.length],[12000,1,'3.95',0,'deny',6]);
    }
  }
});

block('5.2 저속 증거 전수',()=>{
  let pairs=0;
  for(const c of ORDER) for(let v=0;v<=60;v+=5) for(let tv=5;tv<=60;tv+=5) {
    check(`5.2 ${c} 시험${tv}/허용${v}`,()=>M.eligible(tv,v),v!==0 && tv>=v && (v>=30||tv===v));
    pairs++;
  }
  check('12 전수 속도 쌍',()=>pairs,468);
  for(const rule of ['R1','R2','R3']) {
    const s=make({rule});
    check(`5.2 ${rule} 증거 없음`,()=>M.evaluate(s).rows.map(r=>r.mode),['none','none','none']);
  }
  check('5.2 표시 0.585',()=>M.fmt(.585),'0.59');
  check('5.2 표시 0.915',()=>M.fmt(.915),'0.92');
});

block('8 질문 분기 예시',()=>{
  const examples={
    A:[['sp-fog-ban','sp-evidence-independent','sp-governance-R1-L1'],['안개 낀 밤은 운행 금지','추가 시험을 하지 않았습니다.','증거가 없는 조건','시험을 시작할 기준']],
    B:[['sp-boundary','sp-spread-op','sp-governance-R2-L2'],['안개 낀 밤','60 km/h','32.89 km/h','맑음 4회, 비 3회, 안개 3회','상한 기준을 충족한 조건은 0개']],
    C:[['sp-fog-denied','sp-spread-op','sp-governance-R3-L3'],['30 km/h','선택한 인증 기준을 충족하지 못해','맑음 1회, 비 1회, 안개 1회','상한 기준을 충족한 조건은 1개']],
    D:[['sp-fog-ban','sp-concentrate-independent','sp-governance-R1-L1'],['추가 시험 10회 중 10회를 맑은 밤','기다림의 비용']],
    E:[['sp-fog-permit','sp-outlier','sp-governance-R2-L2'],['300 km, 위험 상황 0건','상한 100.00','실현 사고는 2건','예상 1.27건','36.3%','쉬운 구간에 치우쳤을 가능성']],
    제외:[['sp-fog-ban','sp-excluded-independent','sp-governance-R1-L1'],['느린 시험의 위험 상황 1건','무인 허가','빠진 기록까지 넣으면 판단이 달라지나요?']]
  };
  for(const [id,[keys,fragments]] of Object.entries(examples)) {
    const state=locked(id==='제외'?excluded:plans[id]); const before=plain(state);
    const qs=game.questions(state);
    check(`8 ${id} 키 순서`,()=>qs.map(q=>q.k),['sp-c1','sp-c2','sp-hum',...keys,'sp-counter','sp-div']);
    check(`8 ${id} 고유 키`,()=>new Set(qs.map(q=>q.k)).size,8);
    check(`8 ${id} src 없음`,()=>qs.some(q=>Object.hasOwn(q,'src')),false);
    for(const fragment of fragments) check(`8 ${id} 문구 ${fragment}`,()=>qs.some(q=>q.q.includes(fragment)),true);
    check(`8 ${id} 순수 호출`,()=>state,before);
    check(`8 ${id} 재호출 동일`,()=>game.questions(state),plain(qs));
    const second=game.questions(locked(id==='제외'?excluded:plans[id],2));
    check(`8 ${id} 재결정 키 유지`,()=>second.map(q=>q.k),qs.map(q=>q.k));
    check(`8 ${id} 재결정 선행 문장`,()=>second[4].q.startsWith('앞선 결정의 1년 결과를 본 뒤 계획을 바꾸었습니다. 무엇을 보고 바꾸었나요? '),true);
    if(id==='A') check('8 A 지연 비용 단정 없음',()=>/0개월|기다림의 비용|더 늦어졌/.test(qs[4].q),false);
  }
  const state=copy({game:{}}), before=plain(state), qs=game.questions(state);
  check('8 미확정 질문',()=>qs.map(q=>q.k),['sp-c1','sp-c2','sp-hum','sp-prep','sp-counter','sp-div']);
  check('8 미확정 숨은 결과 없음',()=>qs.some(q=>/실현 사고는|모형의 예상|32\.89|100\.00/.test(q.q)),false);
  check('8 미확정 원본 보존',()=>state,before);
  const fixedText = [
    '허가 조건을 설명해 주세요. 판단 기준 세 가지와 우선순위를 먼저 말하고, 그 선택에서 얻는 것과 잃는 것을 한 문장에 담아 주세요.',
    '가정판의 사고 전환 비율, 결함 입증 비율, 대안 이동 위험 가운데 결론을 가장 크게 좌우한 것은 무엇인가요? 그 값을 바꾸면 판단이 어떻게 달라지며, 대안 이동 위험을 0으로 두어도 결정을 유지하나요?',
    '자율주행 셔틀은 사람 운전자보다 얼마나 더 안전해야 허가받아야 할까요? 같은 사고라도 기계가 낸 사고를 더 무겁게 느끼는 이유와, 그 느낌을 인증 기준에 반영할지 설명해 주세요.',
    '아직 허가를 확정하지 않았습니다. 어떤 증거를 더 확인하고 어떤 조건에서 결정을 내릴지 설명해 주세요.',
    '한 위원은 “허가하지 않는 것이 가장 안전하다”고 말하고, 다른 위원은 “야간 노동자의 귀갓길이 지금 위험하다”고 말합니다. 두 주장에 각각 어떤 근거가 더 필요할까요? 두 의견을 듣고 답을 고칠지 유지할지, 그 이유와 보완 조건을 말해 주세요.',
    '시험 주행 말고 안전 증거를 얻는 방법 두 가지를 제안해 주세요. 각 방법이 밝힐 수 있는 위험과 놓칠 수 있는 위험은 무엇이며, 누구의 검증을 받게 하겠습니까?'
  ];
  fixedText.forEach((q,i)=>check(`8 일반 질문 문안 ${i+1}`,()=>qs[i].q,q));
  const priority=copy({...plain(excluded),v:{clear:45,rain:40,fog:30},rule:'R2',liab:'L2',useOp:true});
  const priorityState=locked(priority), priorityResult=M.evaluate(priority);
  check('8 결과변동/빠진 기록 동시 성립 lowX',()=>priorityResult.rows[0].lowX,1);
  check('8 결과변동/빠진 기록 동시 성립 예상',()=>priorityResult.expected,1.27,2);
  check('8 결과변동/빠진 기록 동시 성립 실현',()=>priorityResult.actual,2);
  check('8 결과변동 우선',()=>game.questions(priorityState)[4].k,'sp-outlier');
  check('8 우선순위와 관계없이 recap 제외 사건 유지',()=>game.recap(priorityState).some(r=>r.t==='조건별 증거'&&r.d.includes('제외 시험의 위험 상황 1건')),true);
  for(const rule of ['R1','R2','R3']) for(const liab of ['L1','L2','L3']) {
    const s=make({rule,liab,useOp:true}), q=game.questions(locked(s))[5];
    const withdrawal=rule==='R2' && liab==='L1';
    check(`8 ${rule}/${liab} 책임 분기`,()=>q.k,`sp-governance-${rule}-${liab}${withdrawal?'-withdraw':''}`);
    check(`8 ${rule}/${liab} 문구`,()=>q.q.includes(liab==='L1'?(withdrawal?'안개 낀 밤은 허가됐지만':'피해자의 입증 부담을 줄였습니다'):liab==='L2'?'알고리즘과 운행 기록에 접근하기 어렵다면':'공공이 보상의 절반을 부담합니다'),true);
  }
});

for(const failure of failures) console.error(`실패 ${failure}`);
if(failures.length) {
  console.error(`통과 ${passed}건 · 실패 ${failures.length}건`);
  process.exitCode=1;
} else console.log(`통과 ${passed}건`);
