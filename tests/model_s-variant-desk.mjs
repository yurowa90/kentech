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
const vectors = [[3,2,3,1,2],[2,2,3,2,1],[2,1,2,2,2],[1,2,3,1,2],
  [0,0,0,1,0],[0,1,0,0,0],[-1,-2,-2,3,0],[0,-1,-2,3,0],
  [0,0,0,1,0],[0,1,0,0,0],[-2,-2,-1,-1,-1],[-1,-1,-2,0,-1],
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
const base = extra=>({version:1,weights:[2,2,3,1,1],t1:12,t2:2,overrides:{},
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
  X1:base({weights:[3,2,3,1,1],t1:1,t2:0,policyMode:'apply',policy:policy(true,false,true,false)}),
  X2:base({weights:[2,3,3,0,1],t1:18,t2:10,policyMode:'apply',policy:policy(false,false,false,false)}),
  X3:base({weights:[2,2,2,1,1],t1:22,t2:0})};
const cm = a=>Object.fromEntries(['TP','FP','FN','TN'].map((k,i)=>[k,a[i]]));
// 명세 6.1~6.5의 표: 장수, 목록, 제외, 조치, 참여자, 혈족, 수요, R/RC/f, PPV.
const all = Array.from({length:16},(_,i)=>i+1);
const universal = '1.0%(범위 없음 — 전부 양성인 규칙에서는 π와 같습니다)';
const none = '양성 판정이 없어 계산하지 않음';
const tables = {
  A:[[16,0,0],all,[],[10,2,6,7],16,0,16,[6,6,0,0],[6,6,0,0],[6,6,0,0],universal,universal],
  B:[[0,0,16],[],[],[0,0,0,0],0,0,0,[0,0,6,6],[0,0,6,6],[0,0,6,6],none,none],
  C:[[4,6,6],[1,2,3,4],[],[3,1,1,3],10,0,10,[4,0,2,6],[5,1,1,5],[4,0,2,6],'0.7~100.0%','0.7~24.6%'],
  D:[[5,5,6],[2,7,13],[3,8],[3,1,1,0],8,2,10,[2,2,4,4],[5,3,1,3],[1,1,5,5],'0.1~6.9%','0.5~5.0%'],
  E:[[0,16,0],[],[],[0,0,0,0],16,0,16,[0,0,6,6],[6,6,0,0],[0,0,6,6],none,universal],
  F:[[6,5,5],[1,2,3,4,5,6],[],[4,1,2,4],11,0,11,[6,0,0,6],[6,1,0,5],[6,0,0,6],'1.5~100.0%','1.0~25.2%'],
  G:[[4,6,6],[1,2,3,4],[],[3,1,1,3],10,1,11,[4,0,2,6],[5,1,1,5],[4,0,2,6],'0.7~100.0%','0.7~24.6%'],
  X1:[[12,0,4],[1,2,4,5,6,9,10,13,14,15,16],[3],[6,1,5,6],11,0,11,[6,2,0,4],[6,2,0,4],[5,2,1,4],'0.8~9.5%','0.8~9.5%'],
  X2:[[3,2,11],[1,2],[4],[2,1,1,1],4,0,4,[3,0,3,6],[4,0,2,6],[2,0,4,6],'0.4~100.0%','0.7~100.0%'],
  X3:[[0,12,4],[],[],[0,0,0,0],12,0,12,[0,0,6,6],[6,2,0,4],[0,0,6,6],none,'0.8~9.5%']};

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
  if (!Object.keys(s.overrides).length && t<=-2*s.weights.reduce((a,b)=>a+b,0)) return [p,p];
  const se=wilson(c.TP,6), sp=wilson(c.TN,6);
  return [0,1].map(i=>{const a=se[i]*p, d=a+(1-sp[i])*(1-p);return d?a/d:i;});
}
function pct(a) {return a ? `${(Math.floor(a[0]*1000+1e-10)/10).toFixed(1)}~${(Math.ceil(a[1]*1000-1e-10)/10).toFixed(1)}%`:'계산하지 않음';}
function oracle(s) {
  const rows=cards.map(v=>{const score=v.e.reduce((sum,e,k)=>sum+e*s.weights[k],0);
    const auto=score>=s.t1?'R':score>=s.t2?'C':'N';return {...v,score,auto,group:s.overrides[v.id]?.to||auto};});
  const select=gs=>rows.filter(v=>gs.includes(v.group)).map(v=>v.id);
  const report=select(['R']), inclusive=select(['R','C']);
  const final=rows.filter(v=>v.group==='R'&&(s.policyMode!=='apply'||
    (s.policy.secondary||!v.secondary)&&(s.policy.minors||!v.minor)&&(s.policy.noCare||!v.noCare))).map(v=>v.id);
  const family=s.policyMode==='apply'&&s.policy.relatives?rows.filter(v=>v.family&&v.group!=='N').map(v=>v.id):[];
  const counts=list=>{const a={TP:0,FP:0,FN:0,TN:0};for(const v of rows) if(v.truth!=='U') a[v.truth==='P'?(list.includes(v.id)?'TP':'FN'):(list.includes(v.id)?'FP':'TN')]++;return a;};
  const r=counts(report), rc=counts(inclusive);
  const ranges={r:range(r,s,s.t1),rc:range(rc,s,s.t2)};
  const distinct=[...new Map(rows.filter(v=>final.includes(v.id)&&v.truth!=='U').map(v=>[v.pen.join('-'),v.pen]))]
    .sort((a,b)=>a[1][0]-b[1][0]||a[1][1]-b[1][1]);
  return {rows,report,inclusive,final,family,r,rc,ranges,onset:distinct.map(([key,pen])=>({key,pen,
    range:ranges.r?ranges.r.map((v,i)=>v*pen[i]/100):null}))};
}
for (const [name,s] of Object.entries(cases)) test(name,()=>{
  const before=JSON.stringify(s), r=m.compute(s), o=oracle(s), t=tables[name];
  check(`${name} 순수 연산`,JSON.stringify(s),before);
  check(`${name} 장수`,[r.groups.R,r.groups.C,r.groups.N],t[0]);
  for (const [field,expected] of [['final',ids(t[1])],['removed',ids(t[2])],['actions',t[3]],
    ['demand',t[6]],['waiting',t[6]>8],['r',cm(t[7])],['rc',cm(t[8])],['f',cm(t[9])]]) check(`${name} ${field}`,r[field],expected);
  check(`${name} 참여자`,r.participantConsult.length,t[4]);check(`${name} 혈족`,r.family.length,t[5]);
  check(`${name} 거부 경고`,r.refusalWarning,['D','G'].includes(name));
  check(`${name} R PPV`,m.ppvText(r.ranges.r),t[10]);check(`${name} RC PPV`,m.ppvText(r.ranges.rc),t[11]);
  check(`${name} U ID`,r.uncertain.map(v=>v.id),ids([13,14,15,16]));
  for (const field of ['report','inclusive','family']) check(`${name} ${field}`,r[field],o[field]);
  check(`${name} 점수/자동/수동 분류`,r.rows.map(v=>[v.id,v.score,v.auto,v.group]),o.rows.map(v=>[v.id,v.score,v.auto,v.group]));
  check(`${name} 침투율 행`,r.onset.map(v=>[v.key,plain(v.pen),m.pctRange(v.range)]),o.onset.map(v=>[v.key,v.pen,pct(v.range)]));
  for (const k of ['r','rc']) if(o.ranges[k]) for(let i=0;i<2;i++) check(`${name} ${k} 내부범위 ${i}`,r.ranges[k][i],o.ranges[k][i],1e-14);
});
const scoreTables={A:[33,30,27,27,3,3,-6,0,3,3,-21,-15,12,9,9,3],
  C:[22,20,16,18,1,2,-9,-5,1,2,-13,-11,6,7,7,3],D:[3,6,6,3,3,0,9,9,3,0,-3,0,6,-3,0,3],E:Array(16).fill(0)};
for(const [name,scores] of Object.entries(scoreTables)) test(`점수 ${name}`,()=>check(`6.1 ${name}`,m.compute(cases[name]).rows.map(v=>v.score),scores));
const wilsonTable=[[0,.390343],[.030053,.563509],[.096769,.700012],[.187613,.812387],[.299988,.903231],[.436491,.969947],[.609657,1]];
wilsonTable.forEach((v,k)=>test(`Wilson ${k}`,()=>v.forEach((x,i)=>check(`6.4 Wilson ${k}/6 ${i}`,m.wilson(k,6)[i],x,0.0000005))));
for(const [name,key,expected] of [['A','40-70','0.4~0.7%'],['C','40-70','0.3~70.0%'],['G','40-70','0.3~70.0%'],
  ['C','50-80','0.3~80.0%'],['C','30-60','0.2~60.0%'],['D','50-80','0.0~5.5%'],['D','20-50','0.0~3.5%'],['X1','40-70','0.3~6.7%']])
  test(`발병 ${name}/${key}`,()=>check(`6.4 ${name}/${key}`,m.pctRange(m.compute(cases[name]).onset.find(v=>v.key===key).range),expected));
for(const [piPct,expected] of [[.2,['0.1~100.0%','0.1~6.1%']],[1,['0.7~100.0%','0.7~24.6%']],[5,['3.8~100.0%','3.9~63.0%']]]) test(`π ${piPct}`,()=>{
  const r=m.compute(base({piPct}));check(`6.4 π ${piPct} PPV`,[m.ppvText(r.ranges.r),m.ppvText(r.ranges.rc)],expected);
  check(`6.4 π ${piPct} 불변`,[plain(r.groups),r.final.length,plain(r.actions),r.demand],[{R:4,C:6,N:6},4,[3,1,1,3],10]);
});
for(const [p,n,d] of [[policy(true,true,false,true),4,11],[policy(true,true,true,true),5,12],[policy(false,true,true,true),4,11]])
  test('D 정책 변형',()=>{const r=m.compute({...cases.D,policy:p});check('6.2 D 정책 목록/수요',[r.final.length,r.demand],[n,d]);});

// 8절의 첫 일치 규칙을 명세 조건식으로 독립 구성한다.
function questionKeys(s) {
  const r=oracle(s), g=id=>r.rows.find(v=>v.id===id).group;
  const result=r.r.TP>=5&&r.r.TN<=2?'vd-error-more-report':r.r.TP<=2&&r.rc.TP>=5?'vd-error-consult':r.r.TN>=5&&r.r.TP<=2?'vd-error-more-miss':'vd-error-balance';
  const evidence=Object.keys(s.overrides).length?'vd-manual':s.weights[3]>0&&s.weights[3]>Math.max(s.weights[0],s.weights[2])?'vd-prediction':s.weights[0]===0?'vd-segregation-zero':'vd-evidence-pair';
  const p=s.policy;
  const pk=p.relatives&&r.family.includes('P-01')?'vd-relatives':p.minors?'vd-minors':!p.minors&&r.report.includes('P-03')?'vd-minors-off':p.secondary&&!p.noCare?'vd-secondary-nocare':!p.noCare&&r.report.includes('P-04')?'vd-nocare-off':!p.relatives&&g('P-01')!=='N'?'vd-relatives-off':'vd-policy-reason';
  return ['vd-c1','vd-c2','vd-c3',result,evidence,...(s.policyMode==='apply'?[pk]:[]),s.piTouched?'vd-pi-moved':'vd-pi-unmoved','vd-counter-capacity','vd-divergent-system'];
}
function questionTexts(s) {
  const r=oracle(s), group=id=>({R:'보고',C:'상담 후 결정',N:'보고하지 않음'}[r.rows.find(v=>v.id===id).group]);
  const text={
    'vd-c1':'증거 다섯 종에 둔 무게와 두 문턱의 위치를 설명해 주세요. 가장 큰 무게를 둔 증거를 왜 그렇게 보았습니까?'+
      (s.weights.every(w=>w===0)?' 모두 0이라면 증거에 무게를 두지 않은 이유를 말해 주세요.':''),
    'vd-c2':'이 기준이 얻는 것과 잃는 것을 한 문장으로 말해 보세요. 어느 쪽을 더 중하게 보았는지도 설명해 주세요.',
    'vd-c3':'미확정 4장은 참여자에게 어떻게 전달하겠습니까? ‘모른다’를 숨기지 않으면서 다시 검토할 조건을 설명해 보세요.',
    'vd-error-more-report':`정책 적용 전 보고 분류에서 병원성 ${r.r.TP}장을 보고하고 비병원성 ${r.r.FP}장도 보고했습니다. 어느 쪽 오류를 감수한 기준입니까? 불필요한 관찰이나 수술 상담을 검토하게 될 사람에게 얻는 것과 잃는 것을 어떻게 설명하겠습니까?`,
    'vd-error-consult':`정책 적용 전 보고 분류에서는 병원성 ${r.r.TP}장만 바로 보고했고, 보고와 상담을 함께 세면 병원성 ${r.rc.TP}장과 비병원성 ${r.rc.FP}장이 상담 후 결정까지 올라왔습니다. 결정을 상담으로 미룬 기준이 얻는 것과 잃는 것은 무엇이며, 상담을 기다리는 사람에게 무엇을 먼저 설명하겠습니까?`,
    'vd-error-more-miss':(r.r.FP===0?`정책 적용 전 보고 분류에서 비병원성은 한 장도 보고하지 않았지만 병원성 ${r.r.FN}장도 보고하지 않았습니다.`:
      `정책 적용 전 보고 분류에서 비병원성 ${r.r.FP}장을 보고하고 병원성 ${r.r.FN}장은 보고하지 않았습니다.`)+
      ' 어느 쪽 오류를 감수한 기준입니까? 이 가상 사례 중 한 사람이 10년 뒤 진단받는다면 기준을 유지하거나 고칠 이유는 무엇입니까?',
    'vd-error-balance':`정책 적용 전 보고 분류에서는 놓침 ${r.r.FN}장과 과보고 ${r.r.FP}장이 남았습니다. 보고와 상담을 함께 세면 상담까지 올라간 비병원성 ${r.rc.FP}장, 어느 쪽에도 들지 않은 병원성 ${r.rc.FN}장입니다. 어느 쪽 오류를 어디까지 감수했으며, 상담 칸은 그 판단에서 어떤 역할을 합니까?`,
    'vd-manual':`${Object.keys(s.overrides).length}장을 저울과 별도로 분류하고 이유를 남겼습니다. 그 이유를 다른 카드에도 적용할 수 있는 규칙으로 바꾸겠습니까, 예외로 남기겠습니까? 얻는 것과 잃는 것을 설명해 주세요.`,
    'vd-prediction':`컴퓨터 예측에 가계 근거·기능 실험보다 큰 무게를 두었습니다. 예측만 높은 P-07은 ‘${group('P-07')}’, P-08은 ‘${group('P-08')}’입니다. 기능 실험 자료와 예측이 다른 방향일 때 무엇을 추가로 확인하고 싶습니까?`,
    'vd-segregation-zero':'가계 내 공동분리에 무게를 두지 않았습니다. 어떤 불확실성을 줄이려는 선택이었습니까? 가계 자료가 기능 실험이나 컴퓨터 예측과 다른 종류의 근거라는 점도 설명해 주세요.',
    'vd-evidence-pair':`같은 증거를 가진 P-05와 P-09는 각각 ‘${group('P-05')}’와 ‘${group('P-09')}’입니다. 이 게임이 정한 분류가 서로 다른데도 같은 증거만으로 구별하기 어려운 이유와, 새로 필요한 자료를 설명해 주세요.`,
    'vd-relatives':'P-01의 참여자가 연락을 거부했는데도 혈족 고지를 검토 대상으로 삼았습니다. 본인의 비밀과 혈족의 위험·선택권 중 무엇을 앞세웠고, 그 판단의 한계는 무엇입니까?',
    'vd-minors':'미성년 참여자(보호자)에게 성인기 위험을 보고할 수 있도록 했습니다. 이 가상 참여자가 성인이 되어 정보를 듣고 싶지 않았다고 말한다면, 현재의 준비 기회와 나중의 선택권을 어떻게 설명하겠습니까?',
    'vd-minors-off':'미성년이라는 이유로 P-03을 최종 보고 목록에서 뺐습니다. 보호자가 지금 준비할 기회를 원한다면 어떻게 답하겠습니까? 그 참여자가 성인이 되어 직접 정할 기회는 어떻게 남기겠습니까?',
    'vd-secondary-nocare':'목적과 무관한 발견은 보고하되 예방·치료법이 없는 경우는 제외했습니다. 2차 발견이면서 예방·치료법이 없는 P-04는 어느 원칙을 따르게 됩니까? 두 규칙을 가르는 원칙을 한 문장으로 말해 주세요.',
    'vd-nocare-off':'예방·치료법이 없다는 이유로 P-04를 최종 보고 목록에서 뺐습니다. 생활 계획을 위해 정보를 원하는 참여자에게 어떻게 설명하겠습니까?',
    'vd-relatives-off':'혈족 고지를 검토하지 않기로 했습니다. 같은 변이를 가질 수 있는 P-01의 혈족이 나중에 이 사실을 알게 된다면 어떻게 설명하겠습니까?',
    'vd-policy-reason':'네 보고 정책에서 무엇을 전하고 무엇을 전하지 않기로 했습니까? 그 선택이 얻는 것과 잃는 것, 반대 선택을 원하는 참여자에게 설명할 원칙을 말해 주세요.',
    'vd-pi-unmoved':'‘검사한 변이 중 병원성 변이의 비율 π’를 바꿔 보지 않았습니다. 확인하지 않기로 한 판단의 근거는 무엇이었습니까? 게임의 기본값을 실제 비율로 볼 수 있는지도 설명해 주세요.',
    'vd-pi-moved':`검사한 변이 중 병원성 변이의 비율 π를 바꾸어 보았고, 확정값은 ${s.piPct.toFixed(1)}%입니다. 카드 분류는 그대로인데 양성예측도 범위가 달라지는 이유와, 범위가 넓게 남는 이유를 설명해 주세요.`,
    'vd-counter-capacity':'상담 인력이 절반으로 줄어 한 차례에 4건만 맡을 수 있다면, 어느 보고를 먼저 포기하거나 미루겠습니까? 모두 유지하겠다면 필요한 자원과 대기 설명을 제안하고, 원래 기준을 고치거나 유지하는 이유를 말해 주세요.',
    'vd-divergent-system':'저울과 문턱 밖에서 이 문제를 다루는 제도를 하나 제안해 보세요. 단계별 동의, 새 증거에 따른 재분류 통보, 상담 배분 규칙 등을 생각할 수 있습니다. 그 제도가 얻는 것과 잃는 것, 운영에 드는 비용을 설명해 주세요.'};
  return questionKeys(s).map(k=>text[k]);
}
function verifyQuestions(label,s) {
  const before=JSON.stringify(s), qs=m.questionsFromSnapshot(s), keys=qs.map(q=>q.k);
  check(`${label} 질문 키/순서`,keys,questionKeys(s));
  qs.forEach((q,i)=>check(`${label} ${q.k} 전문/보간`,q.q,questionTexts(s)[i]));
  check(`${label} 질문 수`,qs.length,s.policyMode==='apply'?9:8);
  check(`${label} 키 유일`,new Set(keys).size,qs.length);
  check(`${label} 출처/시간 생략`,qs.every(q=>q.src===undefined&&q.time===undefined),true);
  check(`${label} 결정적 질문`,qs,plain(m.questionsFromSnapshot(s)));
  check(`${label} 질문 순수성`,JSON.stringify(s),before);
  check(`${label} state 어댑터`,m.questionKeys({game:{...s,locked:s}}),questionKeys(s));
  check(`${label} 무게0 문구`,qs[0].q.includes('모두 0이라면 증거에 무게를 두지 않은 이유를 말해 주세요.'),s.weights.every(w=>w===0));
  const pi=qs.find(q=>q.k.startsWith('vd-pi-'));
  if(s.piTouched) check(`${label} π 보간`,pi.q.includes(`확정값은 ${s.piPct.toFixed(1)}%입니다.`),true);
  if(keys.includes('vd-error-consult')) check(`${label} 상담 보간`,qs[3].q,
    `정책 적용 전 보고 분류에서는 병원성 ${oracle(s).r.TP}장만 바로 보고했고, 보고와 상담을 함께 세면 병원성 ${oracle(s).rc.TP}장과 비병원성 ${oracle(s).rc.FP}장이 상담 후 결정까지 올라왔습니다. 결정을 상담으로 미룬 기준이 얻는 것과 잃는 것은 무엇이며, 상담을 기다리는 사람에게 무엇을 먼저 설명하겠습니까?`);
}
for(const [name,s] of Object.entries(cases)) test(`질문 ${name}`,()=>verifyQuestions(`8 ${name}`,s));
test('π 조작 질문',()=>verifyQuestions('8 C π 조작',base({piTouched:true,piPct:1})));
test('가계0 질문',()=>verifyQuestions('8 가계0',base({weights:[0,2,3,1,1]})));
test('예측 동률',()=>verifyQuestions('8 예측 동률',base({weights:[3,2,3,3,1]})));
test('수동 우선',()=>verifyQuestions('8 수동 우선',{...cases.D,overrides:cases.F.overrides}));
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
test('경계/null',()=>{
  check('5 Wilson n0',m.wilson(0,0),null);check('5 Bayes 분모0',m.bayes(0,1,.01),null);
  check('5 U만 보고 PPV',m.compute(base({t1:47,t2:46,overrides:{'P-13':{to:'R',reason:'미확정 자료의 한계를 설명합니다.'}}})).ranges.r,null);
  check('5 현재 카드만 전부 양성 예외 금지',m.compute(base({weights:[3,3,3,3,3],t1:-21,t2:-22})).universal.r,false);
  check('5 등호 T1',m.classify(12,base()),'R');check('5 등호 T2',m.classify(2,base()),'C');
  check('5 원래 분모',m.fraction(6,6),'6/6');
});
if(failed) {console.error(`통과 ${passed}건 · 실패 ${failed}건`);process.exitCode=1;}
else console.log(`통과 ${passed}건`);
