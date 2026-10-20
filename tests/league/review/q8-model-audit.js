"use strict";

// 품질 8 모형 기준표(docs/QUALITY-model.md) 축 A·F의 채점자 확인용 집계.
// params의 등급별 개수, 근거 등급(G 밖) 계수 가운데 출처 번호가 없는 것,
// 어느 검사 파일에도 키 이름이 나오지 않는 것을 센다. 파일을 쓰지 않는다.
// 이름은 단어 경계로 찾는다. 값으로만 확인하는 검사는 잡지 못한다(과소 집계 쪽 근사).
// 출처는 refs의 출처 번호(L01 꼴)와, 번호 없이 note의 절 표기(REF 5.9)만 있는 것을 나눠 센다.
// 실행: node tests/league/review/q8-model-audit.js
const fs = require("node:fs"), path = require("node:path");
const { D } = require("./lib.js");
const ROOT = path.resolve(__dirname, "../../..");
const P = D.params;
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const reviewDir = "tests/league/review";
const self = path.basename(__filename);
const tests = [
  ...fs.readdirSync(path.join(ROOT, reviewDir)).filter(f => f.endsWith(".js") && f !== self).map(f => `${reviewDir}/${f}`),
  "tests/league/test-econ.js", "tests/league/balance.js", "tests/league/recal.js",
  "tests/league/next.js", "tests/league/tech.js", "tests/league/sec.js",
].filter(f => fs.existsSync(path.join(ROOT, f)));
const recal = read("tests/league/recal.js"), all = tests.map(read).join("\n");
const idRef = v => (Array.isArray(v.refs) && v.refs.some(r => /^[A-Z]\d+$/.test(r))) || /\[[A-Z]\d+\]/.test(v.note || "");
const sectionRef = v => /REF \d/.test(v.note || "");
const named = (text, k) => new RegExp(`(^|[^A-Za-z0-9_$])${k}($|[^A-Za-z0-9_$])`).test(text);

const grades = {}, evidence = [], noRef = [], sectionOnly = [], notRecal = [], notAny = [];
for (const [k, v] of Object.entries(P)) {
  const g = v?.grade || "?";
  grades[g] = (grades[g] || 0) + 1;
  if (g === "G" || g === "?") continue;
  evidence.push(k);
  if (!idRef(v)) (sectionRef(v) ? sectionOnly : noRef).push(`${k}(${g})`);
  if (!named(recal, k)) notRecal.push(k);
  if (!named(all, k)) notAny.push(`${k}(${g})`);
}
const ostar = Object.entries(P).filter(([, v]) => v?.grade === "O*").map(([k]) => k);
console.log(`params ${Object.keys(P).length}: ${Object.entries(grades).map(([g, n]) => `${g} ${n}`).join(" · ")}`);
console.log(`근거 등급 계수 ${evidence.length}`);
console.log(`출처 번호 없음(절 표기도 없음) ${noRef.length}: ${noRef.join(", ") || "없음"}`);
console.log(`출처 번호 없이 절 표기만 ${sectionOnly.length}: ${sectionOnly.join(", ") || "없음"}`);
console.log(`O* 계수 ${ostar.length}: ${ostar.join(", ") || "없음"}`);
console.log(`recal.js에 이름이 없음 ${notRecal.length}`);
console.log(`검사 ${tests.length}개 파일 어디에도 이름이 없음 ${notAny.length}: ${notAny.join(", ") || "없음"}`);
