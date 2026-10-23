"use strict";

// 품질 8 모형 기준표(docs/QUALITY-model.md) 축 A·F의 채점자 확인용 집계. 파일을 쓰지 않는다.
// 대상은 KCP.ECON_DATA.params 전체다(TECH_DATA를 tech_ 접두로 합친 것 포함, 독립 채점자 10-21 정의).
// - A: 등급별 개수, 근거 등급(G 밖) 계수 가운데 출처 번호가 없는 것과 근거 대장 절 표기만 있는 것.
// - F: 근거 등급 계수 가운데 근거 검사(recal.js, review/39·41)에 이름이 없는 것.
//   이름은 단어 경계로 찾고 tech_ 접두는 떼고도 찾는다. 41번은 키 목록을 실행 때 params에서 모아
//   대장 대응표로 값·등급·출처를 단언하므로, 41번이 통과하면 근거 등급 계수 전부가 값으로 단언된다.
// 실행: node tests/league/review/q8-model-audit.js
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const ROOT = path.resolve(__dirname, "../../..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const ctx = vm.createContext({ console });
ctx.window = ctx; ctx.KCP = {};
for (const f of ["ui/tech-data.js", "ui/econ-data.js"]) vm.runInContext(read(f), ctx, { filename: f });
const P = ctx.KCP.ECON_DATA.params;
const evidenceTests = ["tests/league/recal.js", "tests/league/review/39-evidence-params.js", "tests/league/review/41-evidence-all.js"]
  .filter(f => fs.existsSync(path.join(ROOT, f)));
const text = evidenceTests.map(read).join("\n");
const idRef = v => (Array.isArray(v.refs) && v.refs.some(r => /^[A-Z]\d+$/.test(r))) || /\[[A-Z]\d+\]/.test(v.note || "");
const sectionRef = v => /REF \d/.test(v.note || "");
const named = k => [k, k.replace(/^tech_/, "")].some(n => new RegExp(`(^|[^A-Za-z0-9_$])${n}($|[^A-Za-z0-9_$])`).test(text));

const grades = {}, evidence = [], noRef = [], sectionOnly = [], notNamed = [];
for (const [k, v] of Object.entries(P)) {
  const g = v?.grade || "?";
  grades[g] = (grades[g] || 0) + 1;
  if (g === "G" || g === "?") continue;
  evidence.push(k);
  if (!idRef(v)) (sectionRef(v) ? sectionOnly : noRef).push(`${k}(${g})`);
  if (!named(k)) notNamed.push(`${k}(${g})`);
}
const ostar = Object.entries(P).filter(([, v]) => v?.grade === "O*").map(([k]) => k);
console.log(`params ${Object.keys(P).length}(tech_ ${Object.keys(P).filter(k => k.startsWith("tech_")).length} 포함): ${Object.entries(grades).map(([g, n]) => `${g} ${n}`).join(" · ")}`);
console.log(`근거 등급 계수 ${evidence.length}`);
console.log(`출처 번호 없음(절 표기도 없음) ${noRef.length}: ${noRef.join(", ") || "없음"}`);
console.log(`출처 번호 없이 절 표기만 ${sectionOnly.length}: ${sectionOnly.join(", ") || "없음"}`);
console.log(`O* 계수 ${ostar.length}: ${ostar.join(", ") || "없음"}`);
console.log(`근거 검사(${evidenceTests.map(f => path.basename(f)).join("·")})에 이름이 없음 ${notNamed.length}: ${notNamed.join(", ") || "없음"}`);
