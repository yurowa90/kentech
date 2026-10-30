'use strict';
// 기대값 근거: _briefs/lanes/q8/rev14-fix/spec.md만 사용한다.
// ui 원문은 VM 로드·기존 함수 연결·명세가 요구한 원문 단언에만 사용한다.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const ROOT = path.resolve(__dirname, '../../..');
const read = name => fs.readFileSync(path.join(ROOT, `ui/${name}.js`), 'utf8');
const source = read('league'), build = read('build');
// 독립 oracle: M1 §1·2와 끝의 'M1 보완 2'를 눈금 배열로 계산한다.
// ui 구현·표시 Map·공유 oracle의 결과를 기대값 계산에 사용하지 않는다.
function contract(a) {
  const d=a.target==='grid'?1:2, scale=10**d, start=a.trial??a.base;
  const parts=[...a.parts];
  if (!a.replayOutsideSum && Number.isFinite(a.replay) && Math.abs(a.replay)>=(d===1?.05:.005))
    parts.push({key:'replay',value:a.replay});
  if (!parts.length || ![start,a.actual,a.total,...parts.map(p=>p.value)].every(Number.isFinite))
    return new Map();
  // 보완 2: 내림은 1e-9 여유, 눈금 위(0 포함)는 같은 여유로 판별한다.
  const rawTicks=parts.map(p=>p.value*scale);
  const floors=rawTicks.map(x=>Math.floor(x+1e-9));
  const onGrid=rawTicks.map(x=>Math.abs(x-Math.round(x))<=1e-9);
  const left=Math.round((Number(a.total.toFixed(d))+0)*scale)-floors.reduce((s,x)=>s+x,0);
  if (left<0 || left>parts.length) return new Map();
  const order=parts.map((p,i)=>i).sort((i,j)=>
    (parts[j].value*scale-floors[j])-(parts[i].value*scale-floors[i]) || i-j);
  // 기존 공동 최대 선정 문턱은 유지한다. replay는 공동 최대 후보가 아니다.
  const max=Math.max(...a.parts.map(p=>Math.abs(p.value)));
  const minimum=a.target==='grid'?Math.max(.05,.005*Math.abs(start)):.05;
  const threshold=Math.max(minimum,.05*Math.abs(a.total));
  const tied=new Set(a.parts.flatMap((p,i)=>Math.abs(p.value)>=threshold &&
    Math.abs(Number(p.value.toFixed(d)))===Number(max.toFixed(d))?[i]:[]));
  const rankSafe=values=>{
    if (!tied.size) return true;
    const top=Math.abs(values[[...tied][0]]);
    return values.every((n,i)=>tied.has(i)?Math.abs(n)===top:Math.abs(n)<top);
  };
  const toMap=values=>new Map(parts.map((p,i)=>[p.key,values[i]/scale||0]));
  // (가) 보통 큰 나머지 배분이 순위를 보존하면 그 결과가 우선이다.
  const ordinary=floors.map((n,i)=>n+(order.indexOf(i)<left?1:0));
  if (rankSafe(ordinary)) return toMap(ordinary);
  // (나) 보완 2의 ①~③. 눈금 위 몫은 제외하고 각 몫에 많아야 한 번 준다.
  const protectedTicks=[...floors];
  let remaining=left;
  const received=new Set(), eligible=order.filter(i=>!onGrid[i]);
  const topNow=()=>Math.max(...[...tied].map(i=>Math.abs(protectedTicks[i])));
  for (let stage=1; stage<=3 && remaining; stage++) {
    for (const i of eligible) {
      if (!remaining) break;
      if (received.has(i)) continue;
      if (stage===1 && !(tied.has(i) && floors[i]>=0)) continue;
      if (stage===2 && !(!tied.has(i) && floors[i]<0 && Math.abs(protectedTicks[i])>=topNow())) continue;
      if (stage===3) {
        if (tied.has(i)) continue;
        const next=Math.abs(protectedTicks[i]+1);
        if (next>Math.abs(protectedTicks[i]) && next>=topNow()) continue;
      }
      protectedTicks[i]++;
      received.add(i);
      remaining--;
    }
  }
  // (다) 한 번의 보호 배분으로 합과 순위를 함께 지킬 수 없으면 빈 Map.
  return !remaining && rankSafe(protectedTicks)?toMap(protectedTicks):new Map();
}
const G1 = '남은 특별교부세 {n}억은 새 설비·선로·재난 대응에 써요. 계획에 쓰고 남은 돈은 이달 말에 사라져요.';
const H1 = '오후 냉방 수요가 늘고 LNG·일반 태양광 출력이 조금 줄며 공공시설 보수비가 한 번 들어요. 재난이라 특별교부세가 나와요.';
const T1 = '(내 예측과 같은 쪽)', T2 = '(내 예측과 반대쪽)';
let assertions = 0, failures = 0;
function test(label, run) {
  assertions++;
  try { run(); } catch (error) {
    failures++;
    console.error(`${error.blocked ? 'BLOCKED' : 'FAIL'} ${label}: ${error.message.split('\n')[0]}`);
  }
}
function blocked(message) { throw Object.assign(new Error(message), { blocked: true }); }
const body = name => source.match(new RegExp(`^  function ${name}\\([^]*?^  }`, 'm'))?.[0] || '';
const memory = new Map(), storage = {
  getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,v), removeItem: k => memory.delete(k),
};
const ctx = vm.createContext({ console, performance, structuredClone, URL,
  document: { documentElement: {}, addEventListener() {}, getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [] },
  addEventListener() {}, setTimeout() { return 0; }, clearTimeout() {},
  localStorage: storage, sessionStorage: storage,
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  KCP: { route() {}, on() {}, esc: String, gradeWords: String, leagueNet: { expandSnapshot: x => x } } });
ctx.window = ctx;
let bootError;
try {
  for (const name of ['build-maps','tech-data','build','econ-data','econ','league-data','league-core','league']) {
    let text = name === 'league' ? source : name === 'build' ? build : read(name);
    if (['build','league-core','league'].includes(name)) {
      const end = text.lastIndexOf('})();');
      assert.ok(end >= 0, '기존 IIFE 연결점');
      // 기존 소비 함수만 메모리 노출. 새 계약 함수는 실제 공개 API를 요구한다.
      const [hook, functions] = name === 'build' ? ['__rev14Build',['cityOutageHours']] :
        name === 'league-core' ? ['__rev14Core',['outageFloor','isOutHour']] :
        ['__rev14',['missedText','outageHoursDef']];
      text = text.slice(0,end) + `\nglobalThis.${hook} = {` +
        functions.map(n => `${n}: typeof ${n} === "function" ? ${n} : undefined`).join(',') +
        '};\n' + text.slice(end);
    }
    vm.runInContext(text, ctx, { filename: `ui/${name}.js`, timeout:10000 });
  }
} catch (error) { bootError = error; }
const need = name => {
  if (bootError) blocked(`VM 초기화: ${bootError.message}`);
  const fn = ctx.KCP.league?.[name];
  if (typeof fn !== 'function') blocked(`함수 없음: KCP.league.${name}`);
  return fn;
};
test('VM 초기화', () => assert.ifError(bootError));
const names = ['outageShownTotal','outageDisplayValues','outagePartShown','outageWaterfallHTML'];
for (const name of [...names,'outageEvidenceSummary']) test(`공개 ${name}`, () => need(name));
const keys = ['choice','weather','event','progress','growth','trade'];
const digits = a => a.target === 'grid' ? 1 : 2;
const rounded = (x,d) => Number(x.toFixed(d))+0;
const ticks = (x,d) => Math.round(x*10**d)+0;
const displayNumber = (x,d) => Number(Math.abs(x)).toLocaleString('en-US', {
  useGrouping:true, minimumFractionDigits:d, maximumFractionDigits:d });
const signed = (x,d) => (x<0?'−':x>0?'+':'')+displayNumber(x,d);
const plain = html => html.replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|#39);/g,
  s => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[s]));
function afterWaterfall(html) {
  // 명세는 폭포의 태그 종류를 정하지 않는다. id 요소의 끝을 구조로 찾는다.
  const root=/<([a-z][\w-]*)\b[^>]*\bid="lg-outage-waterfall"[^>]*>/i.exec(html);
  assert.ok(root,'폭포 id');
  const tags=new RegExp(`<(/?)${root[1]}\\b[^>]*>`, 'gi');
  tags.lastIndex=root.index+root[0].length;
  let depth=1, token;
  while((token=tags.exec(html))) {
    depth+=token[1]?-1:1;
    if(!depth) return html.slice(tags.lastIndex);
  }
  assert.fail('폭포 닫힘 태그 없음');
}
function attribution(start, values, grid=true, replay=0, outside=true) {
  const total=values.reduce((s,x)=>s+x,0)+(outside?0:replay);
  return {basis:'monthly',round:2,id:'pyeongtaek',target:grid?'grid':'uns',unit:grid?'MWh/일':'%p',
    trial:start,base:start,actual:start+total,total,replay,replayOutsideSum:outside,
    parts:values.map((value,i)=>({key:keys[i],value})),
    clues:Object.fromEntries(keys.map(k=>[k,'가상 검사 단서'])),grid:{value:0,waitingMW:0}};
}
let allocated=0, fallback=0, notes=0, randomized=0;
let randomFallback=0, oracleFallback=0;
// oracle의 배분 순서와 별도로 결과의 성질만 검사한다. 구현이 양쪽에서 같은
// 잘못된 배분을 내도 합·오차·눈금 위 몫·순위 위반을 각각 잡는다.
function allocationProperties(a,map,label) {
  if (!map.size) return;
  const d=digits(a), scale=10**d;
  const visible=[...a.parts];
  if (!a.replayOutsideSum && Number.isFinite(a.replay) && Math.abs(a.replay)>=(d===1?.05:.005))
    visible.push({key:'replay',value:a.replay});
  assert.equal(map.size,visible.length,`${label}: 모든 표시 몫을 배분`);
  let sum=0;
  for (const {key,value} of visible) {
    assert.ok(map.has(key),`${label}: ${key} 누락`);
    const shown=map.get(key), integer=ticks(shown,d), raw=value*scale;
    assert.ok(Number.isFinite(shown),`${label}: ${key} 유한 표시값`);
    assert.equal(shown,integer/scale,`${label}: ${key} 눈금 단위 표시`);
    sum+=integer;
    assert.ok(Math.abs(integer-raw)<1,`${label} (b): ${key} 표시 오차 < 1눈금 (${integer} vs ${raw})`);
    // 보완 2가 정의한 '눈금 위'의 오차 1e-9만 적용한다.
    if (Math.abs(raw-Math.round(raw))<=1e-9)
      assert.equal(shown,Math.round(raw)/scale||0,`${label} (c): ${key} 0·눈금 위 몫 보존`);
  }
  assert.equal(sum,ticks(rounded(a.total,d),d),`${label} (a): 표시 몫 눈금 합 = 머리 눈금`);
  // 기존 최대 선정 문턱은 명세대로 유지한다. replay는 최대 후보에서 제외하되
  // 실제 표시 순위 비교에는 포함한다. 배분 oracle의 rankSafe를 호출하지 않는다.
  const start=a.trial??a.base;
  const cutoff=Math.max(a.target==='grid'?Math.max(.05,.005*Math.abs(start)):.05,.05*Math.abs(a.total));
  const largest=rounded(Math.max(...a.parts.map(p=>Math.abs(p.value))),d);
  const leaders=a.parts.filter(p=>Math.abs(p.value)>=cutoff && Math.abs(rounded(p.value,d))===largest);
  if (leaders.length) {
    const top=Math.abs(map.get(leaders[0].key));
    for (const {key} of leaders)
      assert.equal(Math.abs(map.get(key)),top,`${label} (d): 공동 최대 표시는 모두 같음`);
    for (const {key} of visible.filter(p=>!leaders.some(q=>q.key===p.key)))
      assert.ok(Math.abs(map.get(key))<top,`${label} (d): ${key}는 공동 최대보다 작음`);
  }
}
function allocation(a, randomCase=false) {
  const original=structuredClone(a), d=digits(a), want=rounded(a.total,d);
  assert.equal(need('outageShownTotal')(a),want,'M1 §1 머리 = Number(total.toFixed(d))+0');
  const map=need('outageDisplayValues')(a), expected=contract(a);
  assert.equal(Object.prototype.toString.call(map),'[object Map]','배분 Map');
  // oracle 불일치로 아래 단언이 실패해도 무작위 전체의 비율을 집계한다.
  if (randomCase) {
    if (!map.size) randomFallback++;
    if (!expected.size) oracleFallback++;
  }
  allocationProperties(a,map,'실제');
  allocationProperties(a,expected,'oracle');
  const sorted=m=>Array.from(m,([k,v])=>[k,v]).sort(([a],[b])=>a.localeCompare(b));
  assert.deepEqual(sorted(map),sorted(expected),'M1 §2 큰 나머지·동순서·보호는 독립 명세 oracle');
  const shown=a.parts.map(p=>need('outagePartShown')(a,p.key,p.value));
  a.parts.forEach((p,i)=>assert.equal(shown[i],map.get(p.key)??p.value,`M1 §5 ${p.key} 같은 표시 배분`));
  // 같은 고정본을 재호출/복제해도 원값으로 되돌아가지 않는다.
  a.parts.forEach((p,i)=>assert.equal(need('outagePartShown')(structuredClone(a),p.key,p.value),shown[i]));
  let sum=shown.reduce((s,x)=>s+ticks(x,d),0);
  if (!a.replayOutsideSum && map.has('replay')) sum+=ticks(map.get('replay'),d);
  if (map.size) { allocated++; assert.equal(sum,ticks(want,d),'M1 §2 몫 눈금 합 = 머리 눈금'); }
  else fallback++;
  const html=need('outageWaterfallHTML')(a);
  const note=[...html.matchAll(/<p\b([^>]*\bid="lg-outage-round-note"[^>]*)>([^]*?)<\/p>/g)];
  const show=!!map.size && ticks(Number(a.trial.toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:d})),d)+sum !==
    ticks(Number(a.actual.toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:d})),d);
  assert.equal(note.length,show?1:0,'M1 §4 W1은 표시 시작 + 표시 몫 ≠ 표시 끝일 때만');
  if (show) {
    notes++;
    assert.match(note[0][1],/class="lg-hint"/);
    const value=signed(want,d)+(d===1?' MWh/일':'%p');
    const step=d===1?'0.1 MWh/일':'0.01%p';
    assert.equal(plain(note[0][2]),`몫의 합은 ${value}에 맞췄어요. 시작·끝 값은 따로 반올림해 ${step}만큼 어긋날 수 있어요.`,'W1 자리 채움');
    assert.match(afterWaterfall(html),/^\s*<p\b[^>]*id="lg-outage-round-note"/,'W1은 폭포 바로 뒤에 펼쳐 둠');
  }
  // 원값 data 속성 및 시작/끝 표시 숫자도 독립 입력과 대조한다.
  const rows=[...html.matchAll(/data-out-step="([^"]+)" data-out-value="([^"]+)"[^]*?<b>([^<]+)<\/b>/g)];
  for (const p of a.parts) {
    const row=rows.find(r=>r[1]===p.key); assert.ok(row,`폭포 몫 ${p.key}`);
    const visible=Number(plain(row[3]).replace(/MWh\/일|%p|%|[ ,]/g,'').replace('−','-'));
    const part=map.get(p.key)??p.value;
    const want=Number(part.toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:d}));
    assert.equal(visible,want,`M1 §5 폭포 ${p.key} = 공유 표시 몫`);
    assert.equal(Number(row[2])+0,p.value+0,'폭포 data 원값 보존(표시 −0은 0)');
  }
  for (const key of [a.basis==='trial'?'trial':'previous','actual']) {
    const row=rows.find(r=>r[1]===key);
    assert.ok(row,`폭포 ${key} 줄`);
    const raw=key==='actual'?a.actual:a.trial;
    assert.equal(Number(row[2]),raw,'시작/끝 원값');
    const got=Number(plain(row[3]).replace(/MWh\/일|%p|%|[ ,]/g,'').replace('−','-'));
    const endpoint=Number(raw.toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:d}));
    assert.equal(got,endpoint,'시작/끝 독립 반올림');
  }
  assert.deepEqual(a,original,'M1 원값·순서 불변');
}
let seed=0x14c0ffee;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
if (names.every(n=>typeof ctx.KCP.league?.[n]==='function')) {
  for(let i=0;i<2400;i++) test(`M1 무작위 ${i+1}`,()=>{
    randomized++;
    const grid=i%2===0, start=random()*100;
    // 합 안/밖 × 양/음 재현 차이, 상쇄 몫, 공동 최대와 옛 기록을 고르게 섞는다.
    const values=keys.map(()=> (random()-.5)*(grid?40:8));
    const replay=(random()-.5)*(grid?2:.2), outside=Math.floor(i/2)%2===0;
    const a=attribution(start,values,grid,replay,outside);
    if(i%19===0) { a.parts=[]; } // 배분 불가능한 옛 기록: 머리 계약은 유지.
    if(i%23===0 && a.parts.length) {
      const tie=grid?.26:.026;
      Object.assign(a,attribution(start,[tie,tie,0,0,0,0],grid));
    }
    allocation(a,true);
  });
  test('M1 보완 계통 여섯 몫: 보호 배분으로 합과 단독 최대 유지',()=>{
    const a=attribution(10,[.27,.24,.03,.02,.02,.02]);
    const expected=[.3,.2,.1,0,0,0]; // 보통 배분 .3/.3 대신 weather를 건너뛰고 event에 준다.
    assert.equal(rounded(a.total,1),.6);
    assert.deepEqual(keys.map(k=>contract(a).get(k)),expected,'M1 보완 (나) 독립 oracle 고정값');
    const map=need('outageDisplayValues')(a);
    assert.deepEqual(keys.map(k=>map.get(k)),expected,'M1 보완 (나) 실제 표시 배분');
    assert.equal(need('outageShownTotal')(a),.6,'머리 +0.6 MWh/일');
    assert.equal([...map.values()].reduce((s,x)=>s+ticks(x,1),0),6,'표시 합 0.6 MWh/일');
    assert.equal(map.get('choice'),.3,'원래 가장 큰 몫은 0.3 MWh/일');
    assert.ok(keys.slice(1).every(k=>Math.abs(map.get(k))<.3),'가장 큰 몫이 단독 최대');
    allocation(a);
  });
  for (const [label,values,grid,expected] of [
    ['부호 반전',[-.27,-.24,-.03,-.02,-.02,-.02],true,[-.3,-.2,-.1,0,0,0]],
    ['알려진 한계',[.27,.24,.24,0,0,0],true,[]],
    ['정전 %p',[.127,.124,.003,.002,.002,.002],false,[.13,.12,.01,0,0,0]],
  ]) test(`M1 보완 2 고정 ${label}`,()=>{
    const a=attribution(0,values,grid);
    for (const map of [contract(a),need('outageDisplayValues')(a)]) {
      if (!expected.length) assert.equal(map.size,0,'순위·0 몫을 함께 지킬 수 없으면 빈 Map');
      else assert.deepEqual(keys.map(k=>map.get(k)),expected,'보완 2 고정 표시 몫');
    }
    allocation(a);
  });
  test('M1 보완 2 첫 달: 합 안의 숨은 재현 차이 0.04',()=>{
    const a=attribution(0,[.27,.24,.03,.02,.02,.02],true,.04,false);
    a.basis='trial'; a.round=1;
    const expected=[.3,.2,.1,0,0,0];
    for (const map of [contract(a),need('outageDisplayValues')(a)]) {
      assert.deepEqual(keys.map(k=>map.get(k)),expected);
      assert.equal(map.has('replay'),false,'0.04는 0.05 표시 문턱 아래');
      assert.equal(map.size,6,'숨은 재현 차이는 별도 표시 몫 없음');
    }
    assert.equal(need('outageShownTotal')(a),.6,'합 안의 재현 차이를 포함한 머리 반올림');
    allocation(a);
  });
  // 명세의 390 녹화 숫자만 재현하는 합성 예. 녹화 원자료를 주장하지 않는다.
  for(const [month,start,total,old,now] of [[12,100.06,11.06,11.0,11.1],[6,100.04,9.74,9.8,9.7],
    [9,100.04,38.54,38.6,38.5],[10,100.06,-56.64,-56.7,-56.6],[11,100.04,8.14,8.2,8.1]])
    test(`M1 390 ${month}월 합성 S6/S7 어긋남`,()=>{
      const a=attribution(start,[total,0,0,0,0,0]); a.total=total;
      assert.equal(ticks(rounded(a.actual,1),1)-ticks(rounded(start,1),1),ticks(old,1));
      assert.equal(need('outageShownTotal')(a),now,'녹화와 같은 두 표시 숫자의 합성 회귀');
      allocation(a);
    });
  for(const grid of [true,false]) {
    for(const value of [1.25,1.249999,1.250001,-1.25,-1.249999,-1.250001,0,-0,.0001,-.0001])
      test(`M1 경계 ${grid}/${value}`,()=>allocation(attribution(1.886,[value,0,0,0,0,0],grid)));
    test(`M1 빈 Map 동점 보호 ${grid}`,()=>{
      const a=attribution(1.96,grid?[.26,.26,0,0,0,0]:[.056,.056,0,0,0,0],grid);
      assert.equal(need('outageDisplayValues')(a).size,0); allocation(a);
    });
    for(const value of [Infinity,-Infinity,NaN]) test(`M1 비유한 total ${grid}/${value}`,()=>{
      const a=attribution(0,[0,0,0,0,0,0],grid); a.total=value;
      assert.ok(Object.is(need('outageShownTotal')(a),value));
    });
  }
  test('M1 배분·빈 Map·W1을 실제로 모두 관측',()=>assert.ok(allocated>0&&fallback>0&&notes>0));
} else test('M1 무작위 2400건 실행',()=>blocked('필수 공개 함수 없음: 무작위 검사를 실행하지 못함'));
console.log(`INFO M1 random=${randomized}/2400 seed=0x14c0ffee 계통/정전 반반 배분=${allocated} 빈Map=${fallback} W1=${notes}`);
const emptyRate=n=>randomized?`${n}/${randomized} (${(100*n/randomized).toFixed(2)}%)`:'미실행';
console.log(`INFO M1 무작위 빈Map 비율 실제=${emptyRate(randomFallback)} oracle=${emptyRate(oracleFallback)}`);

// 배분 순서·0 제외·음수 최대 보호·내림 여유를 잘못 바꾸면 (a)~(d)에서 실패한다.
// 15,000개 입력 × 계통/정전 × 원부호/반전 = 60,000건. HTML 검사는 위 2,400건에서 한다.
const propertyTotal=60000;
let propertySeed=0x14d2cafe, propertyCount=0, propertyEmpty=0, propertyOracleEmpty=0;
const propertyRandom=()=>((propertySeed=(Math.imul(propertySeed,1664525)+1013904223)>>>0)/2**32);
const propertyCoverage={grid:0,uns:0,trial:0,inside:0,outside:0,hiddenReplay:0,zeroAndGrid:0};
if (names.every(n=>typeof ctx.KCP.league?.[n]==='function')) {
  for (let i=0;i<propertyTotal/4;i++) {
    // 눈금 좌표에서 만든 뒤 단위만 바꾼다. 정수·0·연속값·상쇄·동점·작은 몫을 섞는다.
    let raw=keys.map(()=>{
      const kind=propertyRandom();
      return kind<.2?0:kind<.4?Math.floor(propertyRandom()*81)-40:(propertyRandom()-.5)*80;
    });
    switch (i%6) {
      case 0: raw[0]=0; raw[1]=29; break; // .29×100 등 이진 부동소수 내림 잡음
      case 1: raw=[2.7,2.4,.3,.2,.2,.2].map(x=>x*(1+Math.floor(propertyRandom()*4))); break;
      case 2: { const tie=5+propertyRandom()*35; raw=[tie,-tie,tie,...raw.slice(3)]; break; }
      case 3: raw=raw.map(x=>x/10); break;
      case 4: raw=[0,0,-29,29,propertyRandom()-.5,propertyRandom()-.5]; break;
      case 5: raw[0]*=10; raw[1]=-raw[0]+propertyRandom(); break;
    }
    const outside=i%2===0, first=i%3===0;
    const replayTicks=[.4,.7,-.4,-1.6][Math.floor(i/2)%4];
    const start=propertyRandom()*20;
    for (const grid of [true,false]) for (const sign of [1,-1])
      test(`M1 성질 ${i+1}/${grid?'계통':'정전'}/${sign}`,()=>{
        const scale=grid?10:100;
        const a=attribution(start,raw.map(x=>sign*x/scale),grid,sign*replayTicks/scale,outside);
        if (first) { a.basis='trial'; a.round=1; }
        propertyCount++;
        propertyCoverage[grid?'grid':'uns']++;
        propertyCoverage[outside?'outside':'inside']++;
        if (first) propertyCoverage.trial++;
        if (!outside && Math.abs(replayTicks)<.5) propertyCoverage.hiddenReplay++;
        if (a.parts.some(p=>p.value===0) && a.parts.some(p=>p.value!==0 &&
          Math.abs(p.value*scale-Math.round(p.value*scale))<=1e-9)) propertyCoverage.zeroAndGrid++;
        const map=need('outageDisplayValues')(a), expected=contract(a);
        if (!map.size) propertyEmpty++;
        if (!expected.size) propertyOracleEmpty++;
        assert.equal(need('outageShownTotal')(a),rounded(a.total,grid?1:2),'머리 계약');
        allocationProperties(a,map,'실제');
        allocationProperties(a,expected,'oracle');
        const entries=m=>Array.from(m,([k,v])=>[k,v]).sort(([k],[l])=>k.localeCompare(l));
        assert.deepEqual(entries(map),entries(expected),'보완 2 독립 oracle과 배분 일치');
      });
  }
  test('M1 성질 표본과 비어 있지 않은 Map을 실제 관측',()=>{
    assert.equal(propertyCount,propertyTotal);
    assert.ok(propertyEmpty>0 && propertyEmpty<propertyCount,'빈 Map과 실제 배분 모두 관측');
    assert.equal(propertyCoverage.grid,propertyTotal/2);
    assert.equal(propertyCoverage.uns,propertyTotal/2);
    for (const kind of ['trial','inside','outside','hiddenReplay','zeroAndGrid'])
      assert.ok(propertyCoverage[kind]>0,`성질 표본 ${kind}`);
  });
} else test('M1 성질 60000건 실행',()=>blocked('필수 공개 함수 없음: 성질 검사를 실행하지 못함'));
const propertyRate=n=>propertyCount?`${n}/${propertyCount} (${(100*n/propertyCount).toFixed(2)}%)`:'미실행';
console.log(`INFO M1 성질=${propertyCount}/${propertyTotal} seed=0x14d2cafe 부호 반전 짝 포함 ${JSON.stringify(propertyCoverage)}`);
console.log(`INFO M1 성질 빈Map 비율 실제=${propertyRate(propertyEmpty)} oracle=${propertyRate(propertyOracleEmpty)}`);

for(const name of ['outageCardsHTML','missedCarryHTML','missedText']) test(`M1 §5 ${name} 공유 표시 함수 연결`,()=>{
  const text=body(name); assert.ok(text,`${name} 함수 없음`);
  assert.match(text,/outagePartShown\(/,'카드·carry·끝 화면도 outagePartShown 사용');
});
test('M1 §5 끝 화면 실제 문자열',()=>{
  const a=attribution(1.886,[1.663,0,0,0,0,0]);
  const fn=ctx.__rev14?.missedText;
  if(typeof fn!=='function') blocked('함수 없음: missedText');
  const text=fn({outageFrozen:a,outageOpened:true,outageSingleShown:true,
    outageLargest:{key:'choice',value:1.663},missed:'choice',missedBasis:'monthly'});
  assert.match(text,/가장 큰 몫[^]*?\+1\.7 MWh\/일/);
});
test('M1 §5 옛 기록의 몫 원값 fallback',()=>{
  assert.equal(need('outagePartShown')(null,'choice',1.663),1.663);
});

test('M2 G1 글자 그대로',()=>assert.equal(ctx.KCP.ECON_DATA.disasterFacts.grant.textNoRepair,G1));
const C=ctx.KCP.leagueCore;
for(const [id,want] of [['heavy_rain',true],['heatwave_peak',true],['coldwave_heating',false]])
  test(`M2 보수비 분기 ${id}`,()=>{
    const fn=ctx.KCP.league?.grantHasRepair;
    if(typeof fn!=='function') {
      // 명세 M2의 대체 수용: ! 팝업이 textNoRepair를 고르는 분기 원문.
      assert.match(body('renderBar'),/textNoRepair/,'보수비 판단 함수 부재; ! 팝업 textNoRepair 분기 필요');
      assert.match(body('renderBar'),/\.lg-money-info[^]*?(?:\?|if\s*\()[^]*?textNoRepair/);
      console.log(`INFO M2 ${id} 함수 없음 → 원문 분기만 단언`); return;
    }
    const S=C.newState('R14CHECK','south',0,['pyeongtaek','dangjin'],{turns:12,seedMode:'room'});
    S.round=id==='coldwave_heating'?1:7; S.events=[{id,round:S.round,x:1}];
    assert.equal(fn(S,'pyeongtaek'),want);
    S.events=[{id,round:S.round-1,x:1}]; assert.equal(fn(S,'pyeongtaek'),false,'이전 달 보수비 제외');
  });
test('M3 운영 띠 B1',()=>{
  assert.ok(build.includes('" · 무더위"'),'B1 원문');
  assert.doesNotMatch(build,/wx\.hot\s*\?\s*" · 폭염"/);
});

// 명세 m3의 54조합. wind는 기존 검사에서 weather 직접 연결 근거로 확인했다.
for(const pred of ['up','down','same']) for(const sign of [1,-1,0])
  for(const topic of ['grid','uns','cash']) for(const target of ['grid','uns'])
    test(`m3 ${pred}/${sign}/${topic}/${target}`,()=>{
      const a=attribution(10,[0,sign*2,0,0,0,0],target==='grid'); a.hasConnectedWind=true;
      const n={topic,pred:{[topic]:pred},evidence:{key:'wind',text:'풍속',value:5}};
      const original=JSON.stringify({a,n}), text=need('outageEvidenceSummary')(n,a);
      const direction=pred==='up'?1:pred==='down'?-1:0;
      const sameTarget=topic==='grid'?target==='grid':topic==='uns'&&target!=='grid';
      const tail=direction&&sign&&sameTarget?(direction===sign?T1:T2):'';
      if(tail) { assert.match(text,/직접 연결 몫/,'연결 분기 확보'); assert.ok(text.endsWith(' '+tail),text); }
      else assert.ok(!text.includes(T1)&&!text.includes(T2),text);
      assert.equal(JSON.stringify({a,n}),original,'m3 기록 불변');
    });
for(const kind of ['근거 없음','연결 없음','반올림 0','예측 없음']) test(`m3 꼬리 없음 ${kind}`,()=>{
  const a=attribution(10,[0,kind==='반올림 0'?.001:2,0,0,0,0]); a.hasConnectedWind=true;
  const n={topic:'grid',pred:{grid:'up'},evidence:{key:'wind',text:'풍속',value:5}};
  if(kind==='근거 없음') delete n.evidence;
  if(kind==='연결 없음') n.evidence.key='unlinked';
  if(kind==='예측 없음') delete n.pred;
  const text=need('outageEvidenceSummary')(n,a);
  assert.ok(!text.includes(T1)&&!text.includes(T2),text);
});

test('m4 H1·속성 불변',()=>{
  const R=C.regionOf('south'), heat=R.events.find(e=>e.id==='heatwave_peak');
  assert.equal(heat.text,H1);
  // 불변 계약의 기준 데이터만 HEAD에서 읽는다. 계산 구현/기대 알고리즘은 가져오지 않는다.
  const oldCtx=vm.createContext({KCP:{}}); oldCtx.window=oldCtx;
  vm.runInContext(execFileSync('git',['show','HEAD:ui/league-data.js'],{cwd:ROOT,encoding:'utf8'}),oldCtx);
  const old=JSON.parse(JSON.stringify(oldCtx.KCP.LEAGUE_REGIONS));
  const find=x=>x&&typeof x==='object'?(x.id==='heatwave_peak'?x:Object.values(x).map(find).find(Boolean)):null;
  const baseline=find(old); assert.ok(baseline,'기준 heatwave_peak 자료');
  const current=JSON.parse(JSON.stringify(heat));
  assert.ok(Object.values(current.effect).includes(1.12),'명세 effect 1.12 유지');
  const S=C.newState('R14HEAT','south',0,['pyeongtaek','dangjin'],{turns:12,seedMode:'room'});
  S.round=7; S.events=[{id:'heatwave_peak',round:7,x:1}];
  assert.deepEqual(Array.from(C.modsFor(S,R,'pyeongtaek').demandHours),[13,19]);
  delete current.text; delete baseline.text;
  assert.deepEqual(current,baseline,'text 외 effect·hours·grant·repairParam 포함 모든 속성 불변');
});

// rev14-B: 기대 판정식·변이값은 총괄 명세에서 직접 작성한다.
// 운영 함수의 본문은 바꾸지 않고 기존 도시 시간/설명/정산 판정만 VM에서 호출한다.
test('rev14-B 정전 시간 계수 변이: 실제 운영·도시 합계·설명·정산 일치',()=>{
  assert.ifError(bootError);
  const B=ctx.KCP.buildGame, P=ctx.KCP.ECON_DATA.params;
  const A=ctx.__rev14Build, E=ctx.__rev14Core, U=ctx.__rev14;
  assert.equal(typeof B?.simulate,'function','Node에서 실제 build 운영 실행');
  for(const [label,fn] of [['도시 시간',A?.cityOutageHours],['정산 판정선',E?.outageFloor],
    ['정산 시간 판정',E?.isOutHour],['정의 문장',U?.outageHoursDef]])
    assert.equal(typeof fn,'function',label);
  const savedShare=P.outageHourShare.v, savedMin=P.outageHourMinMW.v;
  const previousPack=B.PK.id;
  let baseline;
  try {
    assert.equal(savedShare,.02,'명세 기본 비율');
    assert.equal(savedMin,.005,'명세 기본 최소 MW');
    B.selectPack('pyeongtaek','league');
    // 디젤 1기와 도시 수요지를 연결: 2%~20% 사이 부족 시간이 있어 비율 변이도 관측된다.
    const tile=B.TILES.find(t=>!B.siteRule('diesel',t));
    assert.ok(tile,'합법 디젤 위치');
    const lines=B.TOWNS.flatMap(t=>{
      const p=B.routePath(tile.i,t.tile);
      assert.ok(p&&p.length<=80,'수요지 연결 경로');
      return p.length>1?[{p}]:[];
    });
    const plan=B.sanitize({seed:1402,season:'summer',builds:[{t:'diesel',i:tile.i}],
      lines,policies:[],missions:[]},1e9);
    assert.equal(plan.builds.length,1,'디젤 1기 보존');
    assert.equal(plan.lines.length,lines.length,'선로 보존');
    const run=(share,min)=>{
      P.outageHourShare.v=share; P.outageHourMinMW.v=min;
      const res=B.simulate(structuredClone(plan),7,{league:true});
      assert.equal(res.H,168,'고정 씨앗 7일 운영');
      assert.equal(res.seed,1402,'씨앗 유지');
      assert.equal(res.hrDem.length,res.H); assert.equal(res.hrSup.length,res.H);
      const expected=Array.from(res.hrDem).reduce((n,dem,k)=>
        n+(dem-res.hrSup[k]>Math.max(min,share*dem)?1:0),0);
      const actual=A.cityOutageHours(res);
      assert.equal(actual,expected,`도시 시간 독립 계산: share=${share}, min=${min}`);
      // simulate가 실제 기록한 수요지별 outH도 같은 자료 계수를 읽어야 한다.
      const detail=B.gridFillContext(res);
      assert.ok(detail?.townDemand,'실제 운영의 시간별 수요지 수요');
      res.town.forEach((town,ti)=>{
        let hours=0;
        for(let k=0;k<res.H;k++) {
          const at=k*res.NT+ti;
          if(res.hrUns[at]>Math.max(min,share*detail.townDemand[at])) hours++;
        }
        assert.equal(town.outH,hours,`운영 수요지 ${ti} 시간`);
      });
      for(let k=0;k<res.H;k++) {
        const dem=res.hrDem[k], shortage=dem-res.hrSup[k];
        assert.equal(E.outageFloor(dem),Math.max(min,share*dem),'정산 판정선 독립 계산');
        assert.equal(E.isOutHour([shortage],[0],[dem],0),
          shortage>min&&shortage>share*dem,'정산도 두 판정선을 모두 초과할 때만');
      }
      // 실제 운영에 정확한 경계값이 없어도 >가 >=로 변하는 것을 잡는다.
      for(const dem of [0,.01,10]) {
        const floor=Math.max(min,share*dem);
        for(const shortage of [floor-1e-6,floor,floor+1e-6])
          assert.equal(E.isOutHour([shortage],[0],[dem],0),shortage>min&&shortage>share*dem);
      }
      const sentence=U.outageHoursDef(7);
      const pct=sentence.match(/수요의\s*([\d,.]+)%/), mw=sentence.match(/최소 판정선\s*([\d,.]+)\s*MW/);
      assert.ok(pct,`설명 비율: ${sentence}`); assert.ok(mw,`설명 최소 MW: ${sentence}`);
      assert.equal(Number(pct[1].replace(/,/g,'')),share*100,'설명 %도 변이된 자료');
      assert.equal(Number(mw[1].replace(/,/g,'')),min,'설명 MW도 변이된 자료');
      if(baseline) {
        assert.deepEqual(Array.from(res.hrDem),Array.from(baseline.res.hrDem),'계수만 바꿔 수요 동일');
        assert.deepEqual(Array.from(res.hrSup),Array.from(baseline.res.hrSup),'계수만 바꿔 공급 동일');
        assert.ok(actual<=baseline.hours,'판정선 상승 시 도시 정전 시간 증가 금지');
        assert.ok(res.outTotal<=baseline.res.outTotal,'판정선 상승 시 수요지 정전 시간 증가 금지');
      }
      return {res,hours:actual,sentence};
    };
    baseline=run(savedShare,savedMin);
    assert.ok(baseline.hours>0,'정전이 있는 기본 운영으로 1000 MW 변이를 검증');
    const shareChanged=run(.2,savedMin); // 최소 MW는 기본값으로 유지.
    assert.ok(shareChanged.hours<baseline.hours,'비율 변이로 실제 도시 정전 시간 감소 관측');
    const minChanged=run(savedShare,1000); // 비율은 기본값으로 복구하고 따로 변이.
    assert.equal(minChanged.hours,0,'1000 MW면 도시 정전 0시간');
    assert.equal(minChanged.res.outTotal,0,'1000 MW면 모든 수요지 정전 0시간');
    const restored=run(savedShare,savedMin);
    assert.equal(restored.hours,baseline.hours,'기본 계수 복구 후 도시 정전 시간 재현');
    assert.equal(restored.res.outTotal,baseline.res.outTotal,'기본 계수 복구 후 운영 시간 재현');
    assert.equal(restored.sentence,baseline.sentence,'기본 계수 복구 후 설명 재현');
    console.log(`INFO rev14-B seed=1402 도시 정전 시간 기본=${baseline.hours} share=0.2:${shareChanged.hours} min=1000:${minChanged.hours}`);
  } finally {
    P.outageHourShare.v=savedShare; P.outageHourMinMW.v=savedMin;
    B.selectPack(previousPack,'league');
  }
});
console.log(`assertions ${assertions} failures ${failures}`);
process.exitCode=failures?1:0;
