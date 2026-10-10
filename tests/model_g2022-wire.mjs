// PDF p13 그림을 손으로 전사한 경로. 19는 원문에 적힌 답이 아닌 그림의 선분 수다.
// 회귀 대상: 개별 거리 합산, 최근접 자동 배정, 공유선 중복 과금, 단절 공급, 저장 경로 손상.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const KCP = { games: {}, esc: s => String(s) };
vm.runInNewContext(fs.readFileSync(new URL('../g2022.js', import.meta.url), 'utf8'), { window: { KCP } });
const game = KCP.games['2022'];
const plain = x => JSON.parse(JSON.stringify(x));
const plants = [
  ...['A1','A2','A4','B1'].map(cell => ({type:'wind',cell,to:'참살이'})),
  ...['A6','A7','B6'].map(cell => ({type:'wind',cell,to:'배멧'})),
  ...['F1','G1','H1','I1','J1'].map(cell => ({type:'wind',cell,to:'빛가람'})),
];
const networks = {
  참살이: [['A1','A2'],['A2','A3'],['A3','A4'],['A1','B1'],['A2','B2'],['B2','C2'],['C2','D2']],
  배멧: [['A6','A7'],['A6','B6'],['B6','B7'],['B7','B8'],['B8','B9']],
  빛가람: [['F1','G1'],['G1','H1'],['H1','I1'],['I1','J1'],['G1','G2'],['G2','G3'],['G3','G4']],
};
const example = {wireVersion:2, q2:plants, wires:Object.values(networks).flat()};
// Public recap exercises the real calculation even before a model API exists.
assert.match(game.recap({game:plain(example)})[2].d, /총비용 43(?:\D|$)/, 'p13: 발전 24 + 공유 전선 19 = 43');
const M = game.model;
const s = M.supply(example.q2, example.wires);
assert.deepEqual(plain(s.got), {배멧:60,참살이:80,빛가람:100});
assert.equal(s.wire,19);
assert.equal(s.plantCost,24);
for (const [v, count] of [['참살이',7],['배멧',5],['빛가람',7]]) {
  assert.equal(M.supply(plants.filter(p=>p.to===v),networks[v]).wire,count);
}
assert.equal(s.connected[7],true,'F1은 학생이 지정한 빛가람에 공급');
assert.equal(M.supply(plants, []).got.빛가람,0,'선택만 하고 전선이 없으면 공급 없음');
assert.equal(M.supply(plants, example.wires.filter(e=>e.join()!=='G2,G3')).got.빛가람,0);
assert.equal(M.supply(plants, [...example.wires,['A2','A1'],['A1','A2']]).wire,19);
assert.equal(M.supply(plants, [...example.wires,['J9','J10']]).wire,20,'미연결 전선도 비용');
const unassigned = M.normalizeGame({q2:[{type:'wind',cell:'F1'}]});
assert.equal(unassigned.q2[0].to,'','F1 최근접 마을 자동 배정 없음');
assert.equal(M.supply(unassigned.q2,networks.빛가람).got.빛가람,0,'배선만으로 공급 마을을 정하지 않음');
const twoVillages = M.normalizeGame({wireVersion:2,q2:[{type:'wind',cell:'F1',to:'빛가람'}],wires:networks.빛가람});
M.editWire(twoVillages,'G1','D1');
M.editWire(twoVillages,'D1','D2');
assert.deepEqual(plain(M.supply(twoVillages.q2,twoVillages.wires).got),{배멧:0,참살이:0,빛가람:20},'두 마을이 이어져도 한 발전소 이중 공급 없음');
const reproduced = M.normalizeGame({});
for (const [a,b] of [['A1','A4'],['A1','B1'],['A2','D2'],['A6','A7'],['A6','B6'],['B6','B9'],['F1','J1'],['G1','G4']]) M.editWire(reproduced,a,b);
assert.deepEqual(plain(reproduced.wires).map(e=>e.join(':')).sort(),example.wires.map(e=>e.join(':')).sort(),'학생의 직선 조작으로 p13 그림 재현');
assert.equal(M.supply(plants.filter(p=>p.cell!=='A2'),reproduced.wires).got.참살이,60,'발전소를 지워도 남은 공유선은 사용 가능');
const editor = M.normalizeGame({});
assert.equal(M.editWire(editor,'A1','A4'), '');
assert.equal(editor.wires.length,3);
M.editWire(editor,'A4','A1');
assert.equal(editor.wires.length,3,'역방향 덧긋기 중복 없음');
assert.notEqual(M.editWire(editor,'A1','B2'), '', '대각선 거부');
assert.equal(editor.wires.length,3,'실패한 편집은 기존 전선 보존');
assert.notEqual(M.editWire(editor,'A0','A1'), '');
M.editWire(editor,'A2','A3',true);
assert.equal(editor.wires.length,2);
const old = {q1:{wind:'B1'},r1:{wind:'가상 이유'},q2:plants,q2text:'가상 계획'};
const before = JSON.stringify(old);
const migrated = M.normalizeGame(old);
assert.equal(JSON.stringify(old),before,'읽기 전용 정규화');
assert.deepEqual(plain(migrated.q2),plants);
assert.equal(migrated.wires.length,0,'옛 저장에 없던 경로를 만들지 않음');
assert.equal(migrated.wireVersion,2);
assert.equal(migrated.wireNotice,'migrated');
assert.equal(migrated.r1.wind,'가상 이유');
assert.equal(migrated.q2text,'가상 계획');
assert.deepEqual(plain(M.normalizeGame(plain(example)).wires),plain(example.wires.map(e=>e.slice().sort())));
assert.deepEqual(plain(M.normalizeGame(plain(migrated))),plain(migrated),'이전은 멱등');
const editedOld = M.normalizeGame({q2:[{type:'wind',cell:'A6',to:'배멧'}]});
assert.notEqual(M.editWire(editedOld,'A6','B7'), '');
assert.equal(editedOld.wireNotice,'migrated','거부된 편집은 이전 안내 유지');
M.editWire(editedOld,'A6','B6');
assert.equal(editedOld.wireNotice,'','첫 유효 전선 편집으로 이전 안내 해제');
M.editWire(editedOld,'B6','B9');
const editedReload = M.normalizeGame(plain(editedOld));
assert.equal(editedReload.wireNotice,'','전선 편집 뒤 JSON 왕복으로 이전 안내가 되살아나지 않음');
assert.equal(M.supply(editedReload.q2,editedReload.wires).got.배멧,20);
assert.doesNotMatch(game.recap({game:editedReload})[2].d,/저장 이전·정리 후/);
const broken = M.normalizeGame({wireVersion:2,q1:null,r1:[],q2:[null,{type:'wind',cell:'Z1'},...plants,plants[0]],wires:[null,['A1','B2'],['A1','Z1'],['A1','A2'],['A2','A1']],q2text:{}});
assert.equal(broken.q2.length,12);
assert.equal(broken.wires.length,1);
assert.equal(broken.wireNotice,'repaired');
assert.equal(broken.q2text,'');
M.editWire(broken,'A6','B6');
assert.equal(M.normalizeGame(plain(broken)).wireNotice,'','손상 정리 안내도 유효 전선 편집 뒤 해제');
assert.equal(M.normalizeGame({wireVersion:2,wires:[],q1:{wind:'Z1'}}).wireNotice,'repaired');
assert.equal(M.normalizeGame({wireVersion:2,wires:[],q2:[{type:'wind',cell:'A1',to:'없는 마을'}]}).wireNotice,'repaired');
for (const raw of [null,[],42,{q2:'bad',wires:{}},{q1:{wind:'<bad>'},q2:[{type:'constructor',cell:'A1'}]},
  {tool:{toString:null},q2:[{type:{toString:null},cell:'A1'}]},
  {q2:[{type:'wind',cell:'A1',to:{toString:null}}]}]) {
  assert.doesNotThrow(()=>game.recap({game:raw}));
}
// DOM 경계만 최소 대체해 실제 준비실 처리기와 저장 상태를 검사한다.
// 배치·마을 선택·전선 편집 로직은 대체하지 않는다. 레이아웃/실제 브라우저 검사는 별도다.
let activeElement = null;
class Element {
  constructor(attrs = {}) { this.attrs = attrs; this.dataset = {}; this.children = []; this.listeners = {}; }
  set innerHTML(html) {
    if (this.query('[data-cell]').includes(activeElement)) activeElement = null;
    this.html = html;
    this.children = [...html.matchAll(/<(?:button|select|textarea|div|p|ul)\b([^>]*)>/g)].map(m => {
      const attrs = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1],a[2]]));
      const el = new Element(attrs);
      for (const [k,v] of Object.entries(attrs)) if (k.startsWith('data-')) el.dataset[k.slice(5)] = v;
      return el;
    });
  }
  setAttribute(k,v) { this.attrs[k] = v; }
  focus() { activeElement = this; }
  addEventListener(k,fn) { this.listeners[k] = fn; }
  query(selector) {
    const matches = el => {
      if (selector.startsWith('#')) return el.attrs.id === selector.slice(1);
      const [,key,value] = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
      return Object.hasOwn(el.attrs,key) && (value === undefined || el.attrs[key] === value);
    };
    return this.children.flatMap(el => [...(matches(el) ? [el] : []), ...el.query(selector)]);
  }
}
KCP.$ = (selector,root) => root.query(selector)[0];
KCP.$$ = (selector,root) => root.query(selector);
KCP.memoPanel = () => '';
KCP.toast = () => {};
const root = new Element(), uiState = {game:{mode:'q2'}}, snapshots = [];
game.renderPrep(root,uiState,()=>snapshots.push(plain(uiState)),()=>{});
const click = (key,value) => {
  const button = KCP.$$(`[data-${key}]`,root).find(el=>el.dataset[key]===value);
  button.focus(); button.onclick();
  if (key === 'cell') assert.equal(activeElement,KCP.$(`[data-cell="${value}"]`,root),'재그리기 뒤 같은 지도 칸으로 초점 복원');
};
plants.forEach((p,i) => {
  click('cell',p.cell);
  assert.equal(uiState.game.q2[i].to,'','배치 처리기가 자동 배정하지 않음');
  const select = KCP.$(`#to-${i}`,root);
  select.value = p.to; select.listeners.change();
});
click('tool','wire');
for (const [a,b] of [['A1','A4'],['A1','B1'],['A2','D2'],['A6','A7'],['A6','B6'],['B6','B9'],['F1','J1'],['G1','G4']]) {
  click('cell',a); click('cell',b);
}
assert.equal(M.supply(uiState.game.q2,uiState.game.wires).total,43,'실제 준비실 처리기로 19칸 재현');
click('tool','unwire'); click('cell','G2'); click('cell','G3');
assert.equal(M.supply(uiState.game.q2,uiState.game.wires).got.빛가람,0,'전선 지우기 처리기로 공급 차단');
click('tool','wire'); click('cell','G2'); click('cell','G3');
click('cell','J10');
KCP.$('#wire-cancel',root).onclick();
click('cell','A1'); click('cell','A2');
assert.equal(uiState.game.wires.length,19,'시작점 취소와 중복 덧긋기');
const plan = KCP.$('#q2t',root);
plan.value = '가상 계획 유지'; plan.listeners.input({target:plan});
assert.equal(snapshots.at(-1).game.q2text,'가상 계획 유지');
assert.equal(M.supply(snapshots.at(-1).game.q2,snapshots.at(-1).game.wires).total,43,'저장 왕복 뒤 비용 유지');
click('tool','erase'); click('cell','A2');
assert.equal(uiState.game.wires.length,19,'발전소 지우개는 공유선을 보존');
assert.equal(M.supply(uiState.game.q2,uiState.game.wires).got.참살이,60);
const q1Root = new Element(), q1State = {game:{mode:'q1'}};
game.renderPrep(q1Root,q1State,()=>{},()=>{});
const q1Cell = KCP.$('[data-cell="B1"]',q1Root);
q1Cell.focus(); q1Cell.onclick();
assert.equal(q1State.game.q1.wind,'B1');
assert.equal(activeElement,KCP.$('[data-cell="B1"]',q1Root),'1번 발전소 배치 뒤 같은 칸 초점 복원');
for (const raw of [
  {mode:'q2',q2:[{type:'wind',cell:'A6',to:'배멧'}]},
  {mode:'q2',wireVersion:2,wires:[['A1','B2']]},
]) {
  const noticeRoot = new Element(), noticeState = {game:raw};
  let saved;
  game.renderPrep(noticeRoot,noticeState,()=>{saved=plain(noticeState);},()=>{});
  assert.notEqual(noticeState.game.wireNotice,'','준비실 첫 표시에서는 안내 유지');
  const text = KCP.$('#q2t',noticeRoot);
  text.value = '가상 계획'; text.listeners.input({target:text});
  assert.equal(saved.game.wireNotice,'','준비실 저장 시 이전·정리 안내 해제');
  assert.equal(KCP.$('#wire-notice',noticeRoot).hidden,true,'현재 준비실 안내도 함께 숨김');
  assert.equal(M.normalizeGame(saved.game).wireNotice,'','저장 재읽기 뒤 안내 해제 유지');
  assert.doesNotMatch(game.recap(saved)[2].d,/저장 이전·정리 후/);
}
// Canvas만 대체하고 실제 장면 render를 실행한다. 계산 이중 구현·예시 답 읽기를 잡는다.
let skin;
KCP.v2 = {skin: (_id, value) => { skin = value; }};
const canvasContext = new Proxy({}, {get: (_target, key) => key === 'getTransform' ? ()=>({a:1}) : ()=>({}), set:()=>true});
vm.runInNewContext(fs.readFileSync(new URL('../ui/stage-2022.js', import.meta.url), 'utf8'), {
  window:{KCP}, document:{createElement:()=>({getContext:()=>canvasContext})},
});
game.reflectExtra = () => { throw Error('장면에서 예시 답변 접근 금지'); };
const sceneInput = {...plain(example),mode:'q2',tool:'wire'};
const sceneBefore = JSON.stringify(sceneInput);
const renderScene = (value, model) => skin.render({game:value,model,g:canvasContext,w:600,h:400,thumb:true,reduced:true,phase:'prep'});
assert.match(renderScene(sceneInput).caption,/전선 19칸, 총비용 43/);
assert.equal(JSON.stringify(sceneInput),sceneBefore,'장면이 학생 저장값을 바꾸지 않음');
assert.match(renderScene({mode:'q2'}).caption,/발전소 0기/,'빈 계획에 예시 배치 노출 없음');
assert.match(renderScene({...sceneInput,wires:[]}).caption,/빛가람 0\/100/,'장면도 끊어진 공급 차단');
delete game.model;
try {
  assert.match(renderScene(sceneInput,M).caption,/전선 19칸, 총비용 43/,'ctx.model을 받아 등록 모형 없이도 렌더링');
  assert.equal(renderScene(sceneInput),undefined,'모형이 없으면 그리지 않음');
  delete KCP.games['2022'];
  assert.equal(renderScene(sceneInput),undefined,'게임 등록 전에도 그리지 않음');
} finally {
  KCP.games['2022'] = game;
  game.model = M;
}
console.log('2022 wire: PASS — p13 참살이 7 + 배멧 5 + 빛가람 7 = 19칸, 공급 80/60/100, 총비용 43; 편집·단절·저장 이전/방어·장면 계산');
