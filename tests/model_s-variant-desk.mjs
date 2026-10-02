// 기대값의 원본: 사용자 제공 수정 명세 4~6절, 8절. 앱의 데이터/식을 복사하지 않는다.
import fs from 'node:fs';
import vm from 'node:vm';
import {isDeepStrictEqual} from 'node:util';

function josa(word, pair) {
  const w = String(word).trim(), code = w.charCodeAt(w.length - 1);
  const jong = code >= 0xAC00 && code <= 0xD7A3 ? (code - 0xAC00) % 28 : null;
  const endings = {'을/를':['을','를','을(를)'], '이/가':['이','가','이(가)'],
    '은/는':['은','는','은(는)'], '와/과':['과','와','과(와)'],
    '이고/고':['이고','고','이고'], '으로/로':['으로','로','(으)로']};
  const choices = Object.hasOwn(endings, pair) ? endings[pair] : null;
  return choices ? w + choices[jong === null ? 2 : jong && !(pair === '으로/로' && jong === 8) ? 0 : 1] : w;
}
const KCP = {games:{}, YEARS:{}, ORIGINAL_ORDER:[], josa,
  esc:s=>String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};
const context = vm.createContext({window:{KCP}, KCP});
vm.runInContext(fs.readFileSync(new URL('../games/s-variant-desk.js', import.meta.url), 'utf8'), context);
// 객체의 prototype을 검사하는 API도 실제 앱과 같은 realm의 입력을 받게 한다.
const rawModel = KCP.games['s-variant-desk'].model;
const realm = value => value !== null && typeof value === 'object'
  ? vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(value))})`, context) : value;
const m = Object.fromEntries(Object.entries(rawModel).filter(([,fn])=>typeof fn==='function')
  .map(([name,fn])=>[name,(...args)=>fn(...args.map(realm))]));
const plain = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
let passed = 0, failed = 0;
function check(label, actual, expected, tolerance) {
  const ok = tolerance === undefined ? isDeepStrictEqual(plain(actual), expected)
    : Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
  if (ok) passed++;
  else { failed++; console.error(`실패 ${label}: 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`); }
}
function test(label, fn) {
  try { fn(); } catch (e) { failed++; console.error(`실패 ${label}: ${e.message || e}`); }
}

// 명세 4.2의 고정 자료만 전사. 기대 계산은 이 배열로 독립 수행한다.
// 검토 H1: P-11·P-12는 드물지만(빈도 +1·+2) 강한 반대 근거(가계 −2, 기능 −2)를 가진 비병원성 카드다.
const vectors = [[3,2,3,1,2],[2,2,3,2,1],[2,1,2,2,2],[1,2,3,1,2],
  [0,0,0,1,0],[0,1,0,0,0],[-1,-2,-2,3,0],[0,-1,-2,3,0],
  [0,0,0,1,0],[0,1,0,0,0],[-2,1,-1,-1,-1],[-1,2,-2,0,-1],
  [1,1,0,2,0],[0,2,1,-1,1],[-1,1,2,0,1],[0,0,1,1,-1]];
const pens = [[40,70],[50,80],[30,60],[30,60],[20,40],[40,70],[20,50],[10,30],
  [20,40],[40,70],[30,50],[20,50],[20,60],[30,70],[10,40],[20,50]];
const actions = [[1,1,0,1],[1,0,1,0],[1,0,0,1],[0,0,0,1],[1,0,0,0],[0,0,1,1],
  [1,1,0,0],[0,0,0,0],[1,0,0,0],[0,0,1,1],[1,0,0,0],[1,0,1,0],
  [1,0,0,0],[0,0,1,1],[1,0,1,0],[0,0,0,1]];
const ids = ns => ns.map(n=>`P-${String(n).padStart(2,'0')}`);
const cards = vectors.map((e,i)=>({id:ids([i+1])[0], e, pen:pens[i], a:actions[i],
  truth:i<6?'P':i<12?'B':'U', secondary:[2,3,11].includes(i), minor:[2,10].includes(i),
  noCare:[3,7].includes(i), family:[0,8].includes(i), refused:i===0}));
const policy = (a,b,c,d)=>({secondary:a,minors:b,noCare:c,relatives:d});
// 기본 무게: 드물다는 근거가 약하다는 점을 반영해 빈도 무게를 1로 둔다(검토 H1).
const base = extra=>({version:1,weights:[2,1,3,1,1],t1:12,t2:1,overrides:{},
  policyMode:'skip',policy:policy(null,null,null,null),piPct:1,piTouched:false,
  replannedAfterReveal:false,plan:'',...extra});
const cases = {
  A:base({weights:[3,3,3,3,3],t1:-30,t2:-31}),
  B:base({weights:[3,3,3,3,3],t1:47,t2:46}), C:base(),
  D:base({weights:[0,0,0,3,0],t1:6,t2:1,policyMode:'apply',policy:policy(true,false,false,true)}),
  E:base({weights:[0,0,0,0,0],t1:1,t2:0}),
  F:base({overrides:{'P-05':{to:'R',reason:'추가 확인의 기회를 남기겠습니다.'},
    'P-06':{to:'R',reason:'판독 근거의 한계를 설명하며 보고하겠습니다.'}}}),
  G:base({policyMode:'apply',policy:policy(true,true,true,true)}),
  X1:base({weights:[3,2,3,1,1],t1:1,t2:0,policyMode:'apply',policy:policy(true,true,true,true)}),
  X2:base({weights:[2,3,3,0,1],t1:18,t2:10,policyMode:'apply',policy:policy(false,false,false,false)}),
  X3:base({weights:[2,2,2,1,1],t1:22,t2:0})};
const cm = a=>Object.fromEntries(['TP','FP','FN','TN'].map((k,i)=>[k,a[i]]));
// 명세 6.1~6.5의 표: 장수, 목록, 제외, 조치, 참여자, 혈족, 수요, R/RC/f, PPV,
// 재검토·재연락 등록(보고한 미확정), 비병원성인데 보고, 상담에서 제외(정책 필터, 검토 M3).
const all = Array.from({length:16},(_,i)=>i+1);
const universal = '1.0%(범위 없음 — 전부 양성인 규칙에서는 π와 같습니다)';
const none = '양성 판정이 없어 계산하지 않음';
const tables = {
  A:[[16,0,0],all,[],[8,2,4,5],16,0,16,[6,6,0,0],[6,6,0,0],[6,6,0,0],universal,universal,[13,14,15,16],[7,8,9,10,11,12],[]],
  B:[[0,0,16],[],[],[0,0,0,0],0,0,0,[0,0,6,6],[0,0,6,6],[0,0,6,6],none,none,[],[],[]],
  C:[[4,8,4],[1,2,3,4],[],[3,1,1,3],12,0,12,[4,0,2,6],[6,2,0,4],[4,0,2,6],'0.7~100.0%','0.8~9.5%',[],[],[]],
  D:[[5,5,6],[2,7,13],[3,8],[2,1,1,0],7,2,9,[2,2,4,4],[5,3,1,3],[1,1,5,5],'0.1~6.9%','0.5~5.0%',[13],[7],[4]],
  E:[[0,16,0],[],[],[0,0,0,0],16,0,16,[0,0,6,6],[6,6,0,0],[0,0,6,6],none,universal,[],[],[]],
  F:[[6,6,4],[1,2,3,4,5,6],[],[4,1,2,4],12,0,12,[6,0,0,6],[6,2,0,4],[6,0,0,6],'1.5~100.0%','0.8~9.5%',[],[],[]],
  G:[[4,8,4],[1,2,3,4],[],[3,1,1,3],12,2,14,[4,0,2,6],[6,2,0,4],[4,0,2,6],'0.7~100.0%','0.8~9.5%',[],[],[]],
  X1:[[12,0,4],[1,2,3,4,5,6,9,10,13,14,15,16],[],[5,1,3,5],12,2,14,[6,2,0,4],[6,2,0,4],[6,2,0,4],'0.8~9.5%','0.8~9.5%',[13,14,15,16],[9,10],[]],
  X2:[[3,2,11],[1,2],[4],[2,1,1,1],3,0,3,[3,0,3,6],[4,0,2,6],[2,0,4,6],'0.4~100.0%','0.7~100.0%',[],[],[3]],
  X3:[[0,12,4],[],[],[0,0,0,0],12,0,12,[0,0,6,6],[6,2,0,4],[0,0,6,6],none,'0.8~9.5%',[],[],[]]};

// 명세 5.2 Wilson/Bayes 규범식을 독립 구현. UI 표시 반올림은 바깥 방향.
function wilson(k,n) {
  if (!n) return null;
  const z2=1.96**2, p=k/n, d=1+z2/n, mid=(p+z2/(2*n))/d;
  const half=1.96*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/d;
  return [k===0?0:Math.max(0,mid-half),k===n?1:Math.min(1,mid+half)];
}
function range(c,s,t) {
  if (!c.TP&&!c.FP) return null;
  const p=s.piPct/100;
  // 가능한 최소 점수: 가계·빈도·기능 −2, 예측·같은 위치 −1(검토 Low: 이전 −2×합은 너무 낮았다).
  const w=s.weights;
  if (!Object.keys(s.overrides).length && t<=-2*(w[0]+w[1]+w[2])-(w[3]+w[4])) return [p,p];
  const se=wilson(c.TP,6), sp=wilson(c.TN,6);
  return [0,1].map(i=>{const a=se[i]*p, d=a+(1-sp[i])*(1-p);return d?a/d:i;});
}
function pct(a) {return a ? `${(Math.floor(a[0]*1000+1e-10)/10).toFixed(1)}~${(Math.ceil(a[1]*1000-1e-10)/10).toFixed(1)}%`:'계산하지 않음';}
function oracle(s) {
  const rows=cards.map(v=>{const score=v.e.reduce((sum,e,k)=>sum+e*s.weights[k],0);
    const auto=score>=s.t1?'R':score>=s.t2?'C':'N';return {...v,score,auto,group:s.overrides[v.id]?.to||auto};});
  const select=gs=>rows.filter(v=>gs.includes(v.group)).map(v=>v.id);
  const report=select(['R']), inclusive=select(['R','C']);
  const ok=v=>s.policyMode!=='apply'||(s.policy.secondary||!v.secondary)&&(s.policy.minors||!v.minor)&&(s.policy.noCare||!v.noCare);
  const final=rows.filter(v=>v.group==='R'&&ok(v)).map(v=>v.id);
  const consult=rows.filter(v=>v.group==='C'&&ok(v)).map(v=>v.id);
  const family=s.policyMode==='apply'&&s.policy.relatives?rows.filter(v=>v.family&&v.group!=='N').map(v=>v.id):[];
  const counts=list=>{const a={TP:0,FP:0,FN:0,TN:0};for(const v of rows) if(v.truth!=='U') a[v.truth==='P'?(list.includes(v.id)?'TP':'FN'):(list.includes(v.id)?'FP':'TN')]++;return a;};
  const r=counts(report), rc=counts(inclusive);
  const ranges={r:range(r,s,s.t1),rc:range(rc,s,s.t2)};
  const distinct=[...new Map(rows.filter(v=>final.includes(v.id)&&v.truth!=='U').map(v=>[v.pen.join('-'),v.pen]))]
    .sort((a,b)=>a[1][0]-b[1][0]||a[1][1]-b[1][1]);
  const actions=[0,0,0,0];rows.filter(v=>final.includes(v.id)&&v.truth!=='U').forEach(v=>v.a.forEach((n,k)=>{actions[k]+=n;}));
  return {rows,report,inclusive,final,consult,actions,demand:final.length+consult.length+family.length,family,r,rc,ranges,onset:distinct.map(([key,pen])=>({key,pen,
    range:ranges.r?ranges.r.map((v,i)=>v*pen[i]/100):null}))};
}
for (const [name,s] of Object.entries(cases)) test(name,()=>{
  const before=JSON.stringify(s), r=m.compute(s), o=oracle(s), t=tables[name];
  check(`${name} 순수 연산`,JSON.stringify(s),before);
  check(`${name} 장수`,[r.groups.R,r.groups.C,r.groups.N],t[0]);
  for (const [field,expected] of [['final',ids(t[1])],['removed',ids(t[2])],['actions',t[3]],
    ['demand',t[6]],['waiting',t[6]>8],['r',cm(t[7])],['rc',cm(t[8])],['f',cm(t[9])]]) check(`${name} ${field}`,r[field],expected);
  check(`${name} 참여자`,r.participantConsult.length,t[4]);check(`${name} 혈족`,r.family.length,t[5]);
  check(`${name} 재검토·재연락`,r.recontact,ids(t[12]));check(`${name} 비병원성 보고`,r.overreported,ids(t[13]));
  check(`${name} 상담 제외`,r.consultRemoved,ids(t[14]));
  check(`${name} 조치·수요 독립 계산`,[r.actions,r.demand],[o.actions,o.demand]);
  check(`${name} 거부 경고`,r.refusalWarning,['D','G','X1'].includes(name));
  check(`${name} R PPV`,m.ppvText(r.ranges.r),t[10]);check(`${name} RC PPV`,m.ppvText(r.ranges.rc),t[11]);
  check(`${name} U ID`,r.uncertain.map(v=>v.id),ids([13,14,15,16]));
  for (const field of ['report','inclusive','family']) check(`${name} ${field}`,r[field],o[field]);
  check(`${name} 점수/자동/수동 분류`,r.rows.map(v=>[v.id,v.score,v.auto,v.group]),o.rows.map(v=>[v.id,v.score,v.auto,v.group]));
  check(`${name} 침투율 행`,r.onset.map(v=>[v.key,plain(v.pen),m.pctRange(v.range)]),o.onset.map(v=>[v.key,v.pen,pct(v.range)]));
  for (const k of ['r','rc']) if(o.ranges[k]) for(let i=0;i<2;i++) check(`${name} ${k} 내부범위 ${i}`,r.ranges[k][i],o.ranges[k][i],1e-14);
});
const scoreTables={A:[33,30,27,27,3,3,-6,0,3,3,-12,-6,12,9,9,3],
  C:[20,18,15,16,1,1,-7,-4,1,1,-8,-7,5,5,6,3],D:[3,6,6,3,3,0,9,9,3,0,-3,0,6,-3,0,3],E:Array(16).fill(0)};
for(const [name,scores] of Object.entries(scoreTables)) test(`점수 ${name}`,()=>check(`6.1 ${name}`,m.compute(cases[name]).rows.map(v=>v.score),scores));
const wilsonTable=[[0,.390343],[.030053,.563509],[.096769,.700012],[.187613,.812387],[.299988,.903231],[.436491,.969947],[.609657,1]];
wilsonTable.forEach((v,k)=>test(`Wilson ${k}`,()=>v.forEach((x,i)=>check(`6.4 Wilson ${k}/6 ${i}`,m.wilson(k,6)[i],x,0.0000005))));
for(const [name,key,expected] of [['A','40-70','0.4~0.7%'],['C','40-70','0.3~70.0%'],['G','40-70','0.3~70.0%'],
  ['C','50-80','0.3~80.0%'],['C','30-60','0.2~60.0%'],['D','50-80','0.0~5.5%'],['D','20-50','0.0~3.5%'],['X1','40-70','0.3~6.7%']])
  test(`발병 ${name}/${key}`,()=>check(`6.4 ${name}/${key}`,m.pctRange(m.compute(cases[name]).onset.find(v=>v.key===key).range),expected));
for(const [piPct,expected] of [[.2,['0.1~100.0%','0.1~2.1%']],[1,['0.7~100.0%','0.8~9.5%']],[5,['3.8~100.0%','4.3~35.3%']]]) test(`π ${piPct}`,()=>{
  const r=m.compute(base({piPct}));check(`6.4 π ${piPct} PPV`,[m.ppvText(r.ranges.r),m.ppvText(r.ranges.rc)],expected);
  check(`6.4 π ${piPct} 불변`,[plain(r.groups),r.final.length,plain(r.actions),r.demand],[{R:4,C:8,N:4},4,[3,1,1,3],12]);
});
for(const [p,n,d] of [[policy(true,true,false,true),4,10],[policy(true,true,true,true),5,12],[policy(false,true,true,true),4,10]])
  test('D 정책 변형',()=>{const r=m.compute({...cases.D,policy:p});check('6.2 D 정책 목록/수요',[r.final.length,r.demand],[n,d]);});

// 8절 질문 규칙(검토 반영)을 명세 조건식으로 독립 구성한다. 면접 카드는 6~7장, 카드마다 주된 물음 하나.
// 세 습관: 공통 1(기준 먼저), 오류 질문(얻는 것·잃는 것 한 문장), 반문(고침/유지와 이유).
const FLAG={relatives:'family',minors:'minor',noCare:'noCare',secondary:'secondary'};
// 명세의 카드판 표시 순서. 질문 속 ID 나열도 이 순서를 따른다.
const ORDER=ids([1,7,13,2,9,14,3,8,15,4,10,16,5,11,6,12]);
function policyPick(s,r) {
  const hit=k=>ORDER.filter(id=>r.rows.some(v=>v.id===id&&v[FLAG[k]]&&v.group!=='N'));
  const keys=['relatives','minors','noCare','secondary'].filter(k=>hit(k).length);
  if(!keys.length) return {key:'vd-policy-reason',ids:[]};
  const seed=s.weights.reduce((a,b)=>a+b,0)+s.t1+s.t2, k=keys[((seed%keys.length)+keys.length)%keys.length];
  return {key:`vd-${k.toLowerCase()}-${s.policy[k]?'on':'off'}`,ids:hit(k)};
}
function questionKeys(s) {
  const r=oracle(s);
  const result=r.r.TP>=5&&r.r.TN<=2?'vd-error-more-report':r.r.TP<=2&&r.rc.TP>=5?'vd-error-consult':r.r.TN>=5&&r.r.TP<=2?'vd-error-more-miss':'vd-error-balance';
  const w=s.weights;
  const evidence=Object.keys(s.overrides).length?'vd-manual':w[3]>0&&w[3]>Math.max(w[0],w[2])?'vd-prediction':
    w[1]>0&&w[1]>Math.max(w[0],w[2])?'vd-frequency':w[0]===0?'vd-segregation-zero':'vd-evidence-pair';
  const assumption=s.replannedAfterReveal?'vd-replanned':s.piTouched?'vd-pi-moved':'vd-pi-unmoved';
  return ['vd-c1',result,evidence,...(s.policyMode==='apply'?[policyPick(s,r).key]:[]),assumption,'vd-counter-capacity','vd-divergent-system'];
}
function questionTexts(s) {
  const r=oracle(s), group=id=>({R:'보고',C:'상담 후 결정',N:'보고하지 않음'}[r.rows.find(v=>v.id===id).group]);
  const lose='이 기준이 얻는 것과 잃는 것을 한 문장으로 말해 보세요.', pp=policyPick(s,r), ids=pp.ids.join(', ');
  const text={
    'vd-c1':'가장 큰 무게를 둔 증거와 두 문턱의 위치를 왜 그렇게 정했는지, 판단 기준부터 먼저 말해 주세요.'+
      (s.weights.every(w=>w===0)?' 모두 0이라면 증거에 무게를 두지 않은 이유를 말해 주세요.':''),
    'vd-error-more-report':`정책 적용 전 보고 분류에서 병원성 ${r.r.TP}장과 함께 비병원성 ${r.r.FP}장도 보고했습니다. 불필요한 관찰이나 수술 상담을 검토하게 될 사람을 떠올리며, ${lose}`,
    'vd-error-consult':`정책 적용 전 보고 분류에서는 병원성 ${r.r.TP}장만 바로 보고했고, 보고와 상담을 함께 세면 병원성 ${r.rc.TP}장과 비병원성 ${r.rc.FP}장이 상담 후 결정까지 올라왔습니다. 결정을 상담으로 미룬 ${lose}`,
    'vd-error-more-miss':(r.r.FP===0?`정책 적용 전 보고 분류에서 비병원성은 한 장도 보고하지 않았지만 병원성 ${r.r.FN}장도 보고하지 않았습니다.`:
      `정책 적용 전 보고 분류에서 비병원성 ${r.r.FP}장을 보고하고 병원성 ${r.r.FN}장은 보고하지 않았습니다.`)+` 그중 한 사람이 10년 뒤 진단받는다고 할 때, ${lose}`,
    'vd-error-balance':`정책 적용 전 보고 분류에서는 놓침 ${r.r.FN}장과 과보고 ${r.r.FP}장이 남았고, 보고와 상담을 함께 세면 상담까지 올라간 비병원성 ${r.rc.FP}장, 어느 쪽에도 들지 않은 병원성 ${r.rc.FN}장입니다. 어느 쪽 오류를 더 감수했는지 드러나게, ${lose}`,
    'vd-manual':`${Object.keys(s.overrides).length}장을 저울과 별도로 분류하고 이유를 남겼습니다. 그 이유를 다른 카드에도 적용할 규칙으로 바꾸겠습니까, 예외로 남기겠습니까?`,
    'vd-prediction':`컴퓨터 예측에 가계 근거·기능 실험보다 큰 무게를 두었습니다. 예측만 높은 P-07은 ‘${group('P-07')}’, P-08은 ‘${group('P-08')}’입니다. 기능 실험과 예측이 다른 방향일 때 무엇을 추가로 확인하겠습니까?`,
    'vd-frequency':`집단 내 빈도에 가계 근거·기능 실험보다 큰 무게를 두었습니다. 드물지만 비병원성으로 설정된 P-11은 ‘${group('P-11')}’, P-12는 ‘${group('P-12')}’입니다. ‘드물다’는 근거를 어디까지 믿겠습니까?`,
    'vd-segregation-zero':'가계 내 공동분리에 무게를 두지 않았습니다. 가계 자료를 빼서 어떤 불확실성을 줄이려 했습니까?',
    'vd-evidence-pair':`같은 증거를 가진 P-05와 P-09는 각각 ‘${group('P-05')}’와 ‘${group('P-09')}’입니다. 이 게임이 정한 분류가 서로 다른 두 카드를 구별하려면 어떤 자료가 새로 필요합니까?`,
    'vd-relatives-on':r.family.includes('P-01')?'연락을 거부한 P-01의 참여자가 있는데도 혈족 고지를 검토 대상으로 삼았습니다. 본인의 비밀과 혈족의 위험·선택권 가운데 무엇을 앞세웠습니까?':
      `참여자가 거부해도 혈족 고지를 검토하기로 했습니다(${ids}). 앞으로 연락을 거부하는 참여자가 생기면 이 원칙을 어떻게 설명하겠습니까?`,
    'vd-relatives-off':`사업이 혈족에게 따로 연락하지 않기로 했습니다. 같은 변이를 가질 수 있는 ${ids} 카드 참여자의 혈족이 나중에 이 사실을 알게 된다면 어떻게 설명하겠습니까?`,
    'vd-minors-on':`미성년 참여자(${ids})의 보호자에게 성인기 위험을 알리기로 했습니다. 이 참여자가 성인이 되어 듣고 싶지 않았다고 말한다면 어떻게 설명하겠습니까?`,
    'vd-minors-off':`미성년이라는 이유로 ${ids} 카드를 보고와 상담에서 뺐습니다. 보호자가 지금 준비할 기회를 원한다면 어떻게 답하겠습니까?`,
    'vd-nocare-on':`예방·치료법이 없는 ${ids} 카드도 보고와 상담 대상에 남겼습니다. 듣지 않을 권리를 원하는 참여자에게 어떻게 설명하겠습니까?`,
    'vd-nocare-off':`예방·치료법이 없다는 이유로 ${ids} 카드를 보고와 상담에서 뺐습니다. 생활 계획을 위해 정보를 원하는 참여자에게 어떻게 설명하겠습니까?`,
    'vd-secondary-on':`2차 발견 표식 카드(${ids})도 보고와 상담 대상에 남겼습니다. 실제 ACMG 권고는 예방·치료 조치가 가능한 유전자만 2차 발견 보고 목록에 넣습니다. 이 사업은 목적 밖의 발견을 어디까지 전하겠습니까?`,
    'vd-secondary-off':`검사 목적과 무관하다는 이유로 2차 발견 표식 카드(${ids})를 보고와 상담에서 뺐습니다. 이런 정보도 받겠다고 동의한 참여자에게 어떻게 설명하겠습니까?`,
    'vd-policy-reason':'네 보고 정책은 이번 카드 분류에서 결과를 바꾸지 않았습니다. 다른 카드 묶음에서도 같은 선택을 유지할 원칙을 한 문장으로 말해 주세요.',
    'vd-replanned':'결과를 본 뒤 기준을 다시 계획했습니다. 답을 보고 고친 기준은 이 12장에만 잘 맞는 과적합일 수 있습니다. 새 카드 묶음에서도 이 기준을 유지할 근거는 무엇입니까?',
    'vd-pi-unmoved':'‘검사한 변이 중 병원성 변이의 비율 π’를 바꿔 보지 않았습니다. 게임의 기본값을 실제 판독 대상 변이 집단의 비율로 볼 수 있습니까?',
    'vd-pi-moved':`검사한 변이 중 병원성 변이의 비율 π를 바꾸어 보았고, 확정값은 ${s.piPct.toFixed(1)}%입니다. 카드 분류는 그대로인데 양성예측도 범위가 달라지는 이유를 설명해 주세요.`,
    'vd-counter-capacity':'상담 인력이 절반으로 줄어 한 차례에 4건만 맡을 수 있다면, 원래 기준을 고치겠습니까, 유지하겠습니까? 무엇을 먼저 미룰지와 함께 그 이유를 말해 주세요.',
    'vd-divergent-system':'미확정 4장처럼 지금 자료로는 판단할 수 없는 정보를 다룰 제도를 저울과 문턱 밖에서 하나 제안해 보세요. 단계별 동의, 새 증거에 따른 재분류 통보, 상담 배분 규칙 등을 생각할 수 있습니다.'};
  return questionKeys(s).map(k=>text[k]);
}
function verifyQuestions(label,s) {
  const before=JSON.stringify(s), qs=m.questionsFromSnapshot(s), keys=qs.map(q=>q.k);
  check(`${label} 질문 키/순서`,keys,questionKeys(s));
  qs.forEach((q,i)=>check(`${label} ${q.k} 전문/보간`,q.q,questionTexts(s)[i]));
  check(`${label} 질문 수`,qs.length,s.policyMode==='apply'?7:6);
  check(`${label} 세 습관 질문`,['vd-c1','vd-counter-capacity'].every(k=>keys.includes(k))&&keys.some(k=>k.startsWith('vd-error-'))&&qs.find(q=>q.k.startsWith('vd-error-')).q.endsWith('얻는 것과 잃는 것을 한 문장으로 말해 보세요.'),true);
  check(`${label} 키 유일`,new Set(keys).size,qs.length);
  check(`${label} 출처/시간 생략`,qs.every(q=>q.src===undefined&&q.time===undefined),true);
  check(`${label} 결정적 질문`,qs,plain(m.questionsFromSnapshot(s)));
  check(`${label} 질문 순수성`,JSON.stringify(s),before);
  check(`${label} state 어댑터`,m.questionKeys({game:{...s,locked:s}}),questionKeys(s));
  check(`${label} 무게0 문구`,qs[0].q.includes('모두 0이라면 증거에 무게를 두지 않은 이유를 말해 주세요.'),s.weights.every(w=>w===0));
  const pi=qs.find(q=>q.k.startsWith('vd-pi-'));
  if(s.piTouched&&!s.replannedAfterReveal) check(`${label} π 보간`,pi.q.includes(`확정값은 ${s.piPct.toFixed(1)}%입니다.`),true);
  if(keys.includes('vd-error-consult')) check(`${label} 상담 보간`,qs[1].q,
    `정책 적용 전 보고 분류에서는 병원성 ${oracle(s).r.TP}장만 바로 보고했고, 보고와 상담을 함께 세면 병원성 ${oracle(s).rc.TP}장과 비병원성 ${oracle(s).rc.FP}장이 상담 후 결정까지 올라왔습니다. 결정을 상담으로 미룬 이 기준이 얻는 것과 잃는 것을 한 문장으로 말해 보세요.`);
}
for(const [name,s] of Object.entries(cases)) test(`질문 ${name}`,()=>verifyQuestions(`8 ${name}`,s));
test('π 조작 질문',()=>verifyQuestions('8 C π 조작',base({piTouched:true,piPct:1})));
test('가계0 질문',()=>verifyQuestions('8 가계0',base({weights:[0,2,3,1,1]})));
test('예측 동률',()=>verifyQuestions('8 예측 동률',base({weights:[3,2,3,3,1]})));
test('수동 우선',()=>verifyQuestions('8 수동 우선',{...cases.D,overrides:cases.F.overrides}));
test('빈도 우선',()=>verifyQuestions('8 빈도 우선',base({weights:[1,3,2,1,1]})));
test('다시 계획 질문',()=>{const s=base({replannedAfterReveal:true,piTouched:true});verifyQuestions('8 다시 계획',s);
  check('8 다시 계획은 π 질문 대신',m.questionKeys({game:{...s,locked:s}}).filter(k=>/^vd-(pi|replanned)/.test(k)),['vd-replanned']);});
// 검토 M5: 정책 질문은 켬·끔 양쪽에 반문이 있고, 결과를 바꾼 스위치가 여럿이면 한 스위치에 몰리지 않는다.
test('정책 질문 대칭',()=>{const seen={};
  for(const w of [[2,1,3,1,1],[3,3,3,3,3],[0,0,0,3,0],[3,2,3,1,1],[2,3,3,0,1],[2,2,2,1,1],[1,2,1,1,1]]) for(const [t1,t2] of [[12,1],[1,0],[18,10],[22,0],[6,1],[-5,-10]])
    for(let bits=0;bits<16;bits++){const s=base({weights:w,t1,t2,policyMode:'apply',policy:policy(...[0,1,2,3].map(k=>Boolean(bits&(1<<k))))});
      const k=m.questionKeys({game:{...s,locked:s}}).find(k=>/^vd-(relatives|minors|nocare|secondary|policy)/.test(k));seen[k]=(seen[k]||0)+1;}
  for(const k of ['relatives','minors','nocare','secondary']) check(`8 ${k} 켬·끔 질문 모두 등장·같은 횟수`,(seen[`vd-${k}-on`]||0)>0&&seen[`vd-${k}-on`]===seen[`vd-${k}-off`],true);
  check('8 결과를 바꾸지 않은 정책의 질문 등장',(seen['vd-policy-reason']||0)>0,true);
  check('8 한 질문이 절반을 넘지 않음',Math.max(...Object.values(seen))<=Object.values(seen).reduce((a,b)=>a+b,0)/2,true);});
test('나 예시: 미성년 정책이 상담 칸에도 적용',()=>{const r=m.compute(cases.X2);
  check('M3 X2 P-03 상담 제외',[r.participantConsult.includes('P-03'),r.consultRemoved],[false,['P-03']]);});
test('미확정 질문',()=>check('8 확정 전',m.questionKeys({game:{}}),[]));
for(let bits=0;bits<16;bits++) for(const [name,input] of Object.entries(cases)) test(`정책 ${name}/${bits}`,()=>{
  const s={...input,policyMode:'apply',policy:policy(...[0,1,2,3].map(k=>Boolean(bits&(1<<k))))},r=m.compute(s),o=oracle(s);
  check(`5 ${name}/${bits} AND 필터`,r.final,o.final);
  check(`5 ${name}/${bits} 혈족`,r.family,o.family);
  check(`5 ${name}/${bits} 정책 PPV 불변`,r.ranges,plain(m.compute({...s,policyMode:'skip'}).ranges));
  check(`5 ${name}/${bits} 발병 행`,r.onset.map(v=>[v.key,m.pctRange(v.range)]),o.onset.map(v=>[v.key,pct(v.range)]));
  verifyQuestions(`8 ${name}/${bits}`,s);
});
test('6.5 자동 전수',()=>{
  let checked=0,minError=12,perfect=0;
  for(let n=0;n<1024;n++) {const w=Array.from({length:5},(_,k)=>(n>>(2*k))&3);
    for(let t=-31;t<=47;t++) {let err=0;
      for(const v of cards.filter(v=>v.truth!=='U')) {const score=v.e.reduce((a,e,k)=>a+e*w[k],0);
        if((m.classify(score,{t1:t,t2:t-1})==='R')!==(v.truth==='P')) err++;}
      minError=Math.min(minError,err);if(!err)perfect++;checked++;
    }
  }
  check('6.5 이진 조합 수',checked,80896);check('6.5 최소 FP+FN',minError,2);check('6.5 완전 구분',perfect,0);
});
// 검토 H1: 증거 하나만 쓸 때의 최소 오분류. 빈도만으로는 강한 근거 조합(최소 2)을 따라가지 못한다.
test('6.5 단일 증거',()=>{
  const best=k=>{let min=12;for(let t=-3;t<=4;t++){let e=0;for(const v of cards.filter(v=>v.truth!=='U')) if((v.e[k]>=t)!==(v.truth==='P')) e++;min=Math.min(min,e);}return min;};
  check('6.5 단일 증거 최소 오분류(가계·빈도·기능·예측·같은 위치)',[0,1,2,3,4].map(best),[2,4,2,4,2]);
  const appBest=k=>{let min=12;for(let t=-31;t<=47;t++){const w=[0,0,0,0,0];w[k]=1;const r=m.compute(base({weights:w,t1:t,t2:t-1}));min=Math.min(min,r.r.FP+r.r.FN);}return min;};
  check('6.5 앱 분류로 빈도만 쓴 최소 오분류',appBest(1),4);
});
test('경계/null',()=>{
  check('5 Wilson n0',m.wilson(0,0),null);check('5 Bayes 분모0',m.bayes(0,1,.01),null);
  check('5 U만 보고 PPV',m.compute(base({t1:47,t2:46,overrides:{'P-13':{to:'R',reason:'미확정 자료의 한계를 설명합니다.'}}})).ranges.r,null);
  check('5 현재 카드만 전부 양성 예외 금지',m.compute(base({weights:[3,3,3,3,3],t1:-21,t2:-22})).universal.r,false);
  check('5 가능한 최소 점수 바닥 −24에서 전부 양성',[m.compute(base({weights:[3,3,3,3,3],t1:-24,t2:-25})).universal.r,m.compute(base({weights:[3,3,3,3,3],t1:-23,t2:-24})).universal.r],[true,false]);
  check('5 미확정 보고는 조치에서 제외',m.compute(base({t1:47,t2:46,overrides:{'P-13':{to:'R',reason:'미확정 자료의 한계를 설명합니다.'}}})).actions,[0,0,0,0]);
  check('5 등호 T1',m.classify(12,base()),'R');check('5 등호 T2',m.classify(2,base()),'C');
  check('5 원래 분모',m.fraction(6,6),'6/6');
});
if(failed) {console.error(`통과 ${passed}건 · 실패 ${failed}건`);process.exitCode=1;}
else console.log(`통과 ${passed}건`);
