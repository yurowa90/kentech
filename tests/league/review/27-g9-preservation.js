"use strict";
// 승인 범위: G 값만 변경, 기술 자료는 note만, recal.js는 기준 커밋과 바이트 단위로 동일.
const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict');
const base='4aad101';
const original=file=>cp.execFileSync('git',['show',`${base}:${file}`],{encoding:'utf8'});
function load(source){const c=vm.createContext({KCP:{}});c.window=c;vm.runInContext(source,c);return c.KCP;}
const old=load(original('ui/econ-data.js')).ECON_DATA,now=load(fs.readFileSync('ui/econ-data.js','utf8')).ECON_DATA;
let checks=0;const equal=(a,b,label)=>{assert.equal(JSON.stringify(a),JSON.stringify(b),label);checks++;};
for(const [key,p] of Object.entries(old.params)) if(p.grade!=='G') equal(now.params[key],p,`O·P·M 자료 그대로 ${key}`);
for(const key of Object.keys(now.params)) if(!old.params[key]) equal(now.params[key].grade,'G',`새 손잡이 G ${key}`);
for(const key of Object.keys(old)) if(!['params','normalStartPlans'].includes(key))equal(now[key],old[key],`도시·자료 ${key}`);
for(const id of Object.keys(old.normalStartPlans))equal(now.normalStartPlans[id].lines,old.normalStartPlans[id].lines,`시작 전선 배치 보존 ${id}`);
const a=load(original('ui/tech-data.js')).TECH_DATA,b=load(fs.readFileSync('ui/tech-data.js','utf8')).TECH_DATA;
for(const key of Object.keys(a.params)){
 const {note:oldNote,...oldValue}=a.params[key],{note:newNote,...newValue}=b.params[key];
 equal(newValue,oldValue,`기술 note 밖 불변 ${key}`);
}
for(const key of Object.keys(a))if(key!=='params')equal(b[key],a[key],`기술 구성 불변 ${key}`);
equal(fs.readFileSync('tests/league/recal.js','utf8'),original('tests/league/recal.js'),'recal.js 바이트 불변');
console.log(`G9 preservation pass ${checks} fail 0`);
