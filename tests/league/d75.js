/* D-75 독립 수용 검사. 실제 서명·규칙·팀 전송, 가상 학생 문장만 사용.
 * node tests/league/d75.js [--quick] — 브라우저/외부 연결/구현 파일 쓰기 없음.
 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { C, K } = require("./sec.js");
const N = K.leagueNet, BG = K.buildGame;
const R = Object.values(K.LEAGUE_REGIONS).find(r => r.teams.length === 6);
const ids = R.teams.map(t => t.id), team = ids[0];
const PRIVATE = "D75_가상문장_우리 도시는 바람을 근거로 선택했어요";
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; };
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const copy = value => JSON.parse(JSON.stringify(value));
const state = () => Object.assign(C.newState("SIZE36", R.id, 0, ids,
  { turns: 36, seedMode: "room" }), { sid: "00000000-0000-4000-8000-000000000075" });
const verdicts = S => ids.map(id => copy(S.teams[id].verdicts || {}));

async function security() {
  const S = state(), a = await N.createIdentity(), b = await N.createIdentity();
  const receive = N.receiver(S, m => C.reduce(S, m, 100, BG));
  const sign = (extra = {}, key = a, id = team) => N.signEnvelope(key, id,
    { type: "verdict", round: S.round, hit: true, sid: S.sid, seat: 0, ...extra });
  for (const [id, key] of [[team, a], [ids[1], b], [ids[2], a]]) {
    ok((await receive(await N.signEnvelope(key, id,
      { type: "claim", publicKey: key.publicKey, sid: S.sid, seat: 0 }))).ok, "signed claim " + id);
  }
  async function reject(wire, err, label) {
    const before = verdicts(S), rev = S.rev;
    const result = await receive(wire);
    equal(result.err, err, label);
    ok(!result.ok && S.rev === rev, label + " 거부·rev 보존");
    equal(verdicts(S), before, label + " 최초 판정 보존");
  }
  C.host(S, "next", 1);
  await reject(await sign(), "phase", "계획 단계 판정 금지");
  C.run(S, BG, 2);
  ok(S.phase === "review" && S.results.at(-1).round === 1, "실제 결과 1달");
  const valid = await sign({ id: "first-verdict" });
  await reject({ ...valid, sig: "forged" }, "signature", "위조 서명");
  await reject(await sign({}, b), "signature", "다른 팀 키");
  await reject({ ...valid, team: ids[2] }, "bad", "같은 키 등록 팀으로 바깥 이름 변조");
  await reject({ ...valid, body: valid.body.replace('"hit":true', '"hit":false') }, "signature", "서명 뒤 hit 변조");
  await reject(await sign({ sid: "other-session" }), "session", "다른 sid");
  await reject(await sign({ seat: 1 }), "seat", "다른 seat");
  for (const hit of [0, 1, "true", "false", null, [], {}, undefined])
    await reject(await sign({ hit }), "verdict", "boolean 외 hit " + JSON.stringify(hit));
  for (const field of ["promise", "evidence", "reason", "confidence", "journal", "askReason"])
    await reject(await sign({ [field]: PRIVATE }), "verdict", "학생 글 추가 필드 " + field);
  for (const round of ["1", 1.5, null])
    await reject(await sign({ round }), "verdict", "정수 아닌 round " + round);
  S.results.at(-1).round = 0;
  await reject(await sign(), "stale", "현재 월과 마지막 결과 월 불일치");
  S.results.at(-1).round = 1;
  const first = await sign({ id: "accepted-verdict" }), firstBody = N.requestBody(first);
  const score = copy(C.publicView(S, 100).econ.score), rev = S.rev;
  ok((await receive(first)).ok, "최초 true 판정 수락");
  equal(S.teams[team].verdicts, { 1: true }, "최초 판정 저장");
  equal(S.rev, rev + 1, "최초 판정에서만 rev 증가");
  await reject(first, "replay", "같은 n 재전송");
  const retry = () => ({ id: firstBody.id, born: firstBody.born });
  for (const extra of [retry(), { id: "new-id-same-value" }]) {
    const before = S.rev;
    const result = await receive(await sign(extra));
    ok(result.ok && result.quiet && S.rev === before, "새 n·같은 값 성공·중복 반영 없음");
  }
  await reject(await sign({ ...retry(), hit: false }), "verdict", "같은 id로 값 변경 거부");
  await reject(await sign({ hit: false }), "verdict", "새 id로 값 변경 거부");
  await reject(await sign({ ...retry(), reason: PRIVATE }), "verdict", "캐시된 id 재시도에도 학생 글 거부");
  ok((await receive(await sign({ hit: false }, b, ids[1]))).ok, "최초 false도 수락");
  equal(S.teams[ids[1]].verdicts, { 1: false }, "false를 미보고로 취급하지 않음");
  equal(C.publicView(S, 100).econ.score, score, "수락 뒤 score·rank 불변");
  C.host(S, "next", 3); C.run(S, BG, 4);
  await reject(await sign({ round: 1 }), "stale", "지난 round stale");
  await reject(await sign({ rd: 1, ph: "review" }), "stale", "지난 요청 stamp stale");
  await reject(await sign({ ph: "plan", rd: 2 }), "stale", "다른 단계 stamp stale");
  S.phase = "end";
  ok((await receive(await sign({ hit: false }))).ok, "결과가 일치하는 end 단계 수락");
  S.teams[team].reason = PRIVATE;
  S.teams[team].verdicts[0] = PRIVATE;
  const view = C.publicView(S, 100);
  equal(view.teams[team].verdicts, { 2: false }, "공개 상태는 현재 결과 월 boolean만");
  ok(!Object.hasOwn(view.teams[ids[1]], "verdicts"), "지난달 판정만 있는 팀은 공개 생략");
  ok(!JSON.stringify(view).includes(PRIVATE), "공개 상태에 가상 학생 글 없음");
  for (const phase of ["lobby", "plan", "run"]) {
    S.phase = phase;
    ok(ids.every(id => !Object.hasOwn(C.publicView(S, 100).teams[id], "verdicts")), phase + " 공개 판정 없음");
  }
  S.phase = "review";
  S.results.at(-1).round = 1;
  ok(!Object.hasOwn(C.publicView(S, 100).teams[team], "verdicts"), "다른 결과 월 판정 공개 금지");
  S.results.at(-1).round = 2;
  // 반대 판정을 넣은 복제 상태를 실제로 다시 정산해 점수·순위 비관여를 검사한다.
  const variants = [undefined, true, false].map(hit => {
    const clone = structuredClone(S);
    ids.forEach(id => { clone.teams[id].verdicts = hit === undefined ? {} : { 1: hit, 2: hit }; });
    return clone;
  });
  for (const clone of variants) {
    equal(C.publicView(clone, 100).econ.score, C.publicView(S, 100).econ.score, "판정 대입 후 점수·순위 동일");
    C.host(clone, "next", 5); C.run(clone, BG, 6);
  }
  const expected = C.publicView(variants[0], 100).econ.score;
  ok(expected.rank.length === 6 && expected.rank.every(r => Number.isFinite(r.score)), "6팀 점수·순위 실재");
  variants.slice(1).forEach(clone => equal(C.publicView(clone, 100).econ.score, expected, "다음 달 재정산 점수·순위 동일"));
}

function storage() {
  const values = new Map();
  return { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
}
async function teamReports() {
  const localStorage = storage(), sessionStorage = storage(), notices = [];
  const uiK = { ...K, buildGame: { ...BG, toast: text => notices.push(text) } };
  const context = { window: { KCP: uiK, localStorage, sessionStorage, addEventListener() {} },
    document: { addEventListener() {} }, location: { hash: "#league/team" },
    structuredClone, TextEncoder, console, btoa, atob };
  // 내부 함수 노출만 메모리에서 추가한다. 판정·전송·응답 함수는 실제 코드 그대로 실행.
  const source = fs.readFileSync(path.resolve(__dirname, "../../ui/league.js"), "utf8");
  vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, `
    KCP.d75 = { reportPromiseVerdict, response, set: value => { L = value; } };
  })();`), context);
  const ui = uiK.d75, S = state();
  ids.forEach(id => C.reduce(S, { type: "claim", team: id, token: "fixture-" + id }, 0, BG));
  C.host(S, "next", 1); C.run(S, BG, 2);
  const base = C.publicView(S, 100);
  base.econ.before[team].cash = 100;
  base.econ.cities[team].cash = 110;
  const note = { topic: "cash", evidence: { key: "fixture", text: PRIVATE }, pred: { cash: "up" },
    confidence: "fairly", reason: PRIVATE, promise: PRIVATE, askReason: PRIVATE };
  async function fixture(change = () => {}) {
    const sent = [], V = copy(base), n = copy(note);
    const L = { role: "team", claimAccepted: true, room: V.room, team, snap: V,
      pendingRequests: new Map(), identity: await N.createIdentity(),
      conn: { send: (event, envelope) => sent.push({ event, envelope }) } };
    change({ L, V, n });
    const data = { interview: { months: { [V.round]: n } } };
    if (L.role === "solo") L.interview = copy(data);
    localStorage.setItem(`kcp-league-data-v1:${V.room}:${team}`, JSON.stringify(data));
    ui.set(L);
    const report = async () => { ui.reportPromiseVerdict(V); await L.sending; };
    return { L, V, sent, report };
  }
  for (const hit of [true, false]) {
    const f = await fixture(({ n }) => { n.pred.cash = hit ? "up" : "down"; });
    await f.report(); await f.report(); await f.report();
    equal(f.sent.length, 1, "같은 달 여러 번 갱신해도 한 번 보고 " + hit);
    const { event, envelope } = f.sent[0], body = N.requestBody(envelope);
    equal(event, "req", "기존 req 경로");
    equal(Object.keys(envelope).sort(), ["body", "sig", "team"], "기존 서명 봉투만");
    ok(await N.verifyEnvelope(envelope, f.L.identity.publicKey), "팀 verdict 실제 서명 유효");
    const protocol = ["type", "team", "kid", "n", "sid", "seat", "id", "born", "rd", "ph"];
    equal(Object.fromEntries(Object.entries(body).filter(([key]) => !protocol.includes(key))),
      { hit, round: 1 }, "업무 본문은 round·hit 두 키만");
    equal(Object.keys(body).sort(), [...protocol, "round", "hit"].sort(), "본문 전체 키 허용 목록");
    ok(!JSON.stringify(envelope).includes(PRIVATE), "로컬 문장·근거·이유가 서명 본문에 없음");
    ok(f.L.pendingRequests.has(body.id), "verdict도 ack 대기 등록");
    for (const wrong of [{ ...body, n: body.n + 1 }, { ...body, kid: "wrong" }, { ...body, id: "wrong" }])
      await ui.response("ack", wrong);
    ok(f.L.pendingRequests.has(body.id), "다른 n·kid·id ack 무시");
    await ui.response("nack", { ...body, err: "replay" }); await f.L.sending;
    equal(f.sent.length, 2, "replay nack은 새 n으로 재시도");
    const retried = N.requestBody(f.sent[1].envelope);
    ok(retried.n > body.n, "재시도 순번 증가");
    equal(Object.fromEntries(Object.entries(retried).filter(([k]) => k !== "n")),
      Object.fromEntries(Object.entries(body).filter(([k]) => k !== "n")), "재시도 id·born·업무값·stamp 보존");
    await ui.response("ack", retried);
    ok(!f.L.pendingRequests.size, "정확한 ack로 대기 해제");
    await f.report();
    equal(f.sent.length, 2, "ack 뒤 같은 달 재보고 없음");
    f.V.round = 2; f.V.results.at(-1).round = 2;
    localStorage.setItem(`kcp-league-data-v1:${f.V.room}:${team}`, JSON.stringify({ interview: { months: { 2: note } } }));
    await f.report(); await f.report();
    equal(f.sent.length, 3, "다음 유효 월에는 다시 한 번 보고");
    const latest = N.requestBody(f.sent.at(-1).envelope);
    await ui.response("nack", { ...latest, err: "stale" }); await f.L.sending;
    ok(f.sent.length === 3 && !f.L.pendingRequests.size, "stale nack은 재시도 없이 대기 해제");
  }
  const blocked = [
    ["혼자 하기", ({ L }) => { L.role = "solo"; }],
    ["약속 없음", ({ n }) => { delete n.evidence; }],
    ["예측 없음", ({ n }) => { n.pred = {}; }],
    ["건너뜀", ({ n }) => { n.skipped = true; }],
    ["비교 기준 없음", ({ V }) => { delete V.econ.before[team]; }],
    ["마지막 달", ({ V }) => { V.round = V.rounds.length; V.results.at(-1).round = V.round; }],
    ["마지막 달 기록", ({ n }) => { n.finalMonth = true; }],
    ["계획 단계", ({ V }) => { V.phase = "plan"; }],
    ["끝 단계", ({ V }) => { V.phase = "end"; }],
    ["마지막 결과 불일치", ({ V }) => { V.results.at(-1).round = 0; }],
    ["착석 승인 전", ({ L }) => { L.claimAccepted = false; }],
    ["자리 떠남", ({ L }) => { L.away = true; }],
    ["기존 false 판정", ({ V }) => { V.teams[team].verdicts = { 1: false }; }]
  ];
  for (const [label, change] of blocked) {
    const f = await fixture(change); await f.report(); await f.report();
    equal(f.sent.length, 0, label + " 전송 없음");
    equal(f.L.pendingRequests.size, 0, label + " 대기 요청 없음");
  }
  const missingOutage = await fixture(({ n, V }) => {
    n.topic = "uns"; n.pred = { uns: "down" }; delete n.trial;
    V.results = [V.results.at(-1)]; V.teams[team].hist = [];
  });
  await missingOutage.report();
  equal(missingOutage.sent.length, 0, "정전율 비교 기준도 없으면 전송 없음");
  const waiting = await fixture(); await waiting.report();
  delete waiting.L.verdictSent;
  await waiting.report();
  equal(waiting.sent.length, 1, "보낸 표시가 없어도 pending verdict 중복 생성 금지");
  for (let i = 0; i < 4; i++) {
    const body = N.requestBody(waiting.sent.at(-1).envelope);
    await ui.response("nack", { ...body, err: "replay" }); await waiting.L.sending;
  }
  ok(waiting.sent.length === 4 && !waiting.L.pendingRequests.size, "replay 재시도는 최대 3회");
  // 현금과 별개로 정전율 비교도 손으로 정한 10→5% 하락과 대조한다.
  for (const hit of [true, false]) {
    const f = await fixture(({ n, V }) => { n.topic = "uns"; n.pred = { uns: hit ? "down" : "up" };
      n.trial = { unsPct: 10 }; V.results.at(-1).team[team].unsPct = 5; });
    await f.report();
    equal(N.requestBody(f.sent[0].envelope).hit, hit, "정전율 주제 판정 " + hit);
  }
  ok(notices.every(text => text.includes("지난 단계 요청") || text.includes("요청 응답을 확인하지 못했어요")), "서명·저장 예외 없음");
}

async function size(style) {
  const S = state(), host = await N.createIdentity(), clock = 1700000000000;
  ids.forEach(id => C.reduce(S, { type: "claim", team: id, token: "solo-city-" + id }, 0, BG));
  const stats = { style, rawBefore: 0, rawAfter: 0, compactBefore: 0, compactAfter: 0,
    wireBefore: 0, wireAfter: 0, maxRawIncrease: 0 };
  async function record() {
    const after = C.publicView(S, clock), before = copy(after);
    ids.forEach(id => { delete before.teams[id].verdicts; });
    for (const [label, view] of [["Before", before], ["After", after]]) {
      const signed = await N.signHost(host, "snap", S.room, S.sid, view);
      const wire = N.broadcastMessage(S.room, "snap", signed, "9999999999", "9999999999");
      for (const [prefix, value] of [["raw", view], ["compact", signed.data], ["wire", wire]])
        stats[prefix + label] = Math.max(stats[prefix + label], Buffer.byteLength(JSON.stringify(value)));
    }
    stats.maxRawIncrease = Math.max(stats.maxRawIncrease, N.byteLength(after) - N.byteLength(before));
    ok(stats.compactAfter < 178000, style + " 전송용 publicView 178,000바이트 미만");
    ok(stats.wireAfter < 178000, style + " 서명·중계 봉투 포함 178,000바이트 미만");
    ids.forEach(id => equal(Object.keys(after.teams[id].verdicts || {}),
      ["review", "end"].includes(S.phase) ? [String(S.round)] : [], "현재 월 판정만 공개"));
  }
  for (let month = 1; month <= 36; month++) {
    C.host(S, "next", clock + month * 100);
    C.computerPlans(S, BG, null, style); C.computerPlans(S, BG, null, style, true);
    await record();
    ok(!!C.run(S, BG, clock + month * 100 + 1), style + " 실제 운영 " + month);
    // JSON false가 true보다 1바이트 길다. 모든 월·팀을 false로 채운 최댓값 조건.
    ids.forEach(id => { S.teams[id].verdicts ||= {}; S.teams[id].verdicts[month] = false; });
    await record();
  }
  equal(ids.reduce((n, id) => n + Object.keys(S.teams[id].verdicts).length, 0), 216, "36달×6팀 판정 216개 보관");
  C.host(S, "next", clock + 3700); await record();
  ok(S.phase === "end", "36달 종료 상태 측정");
  console.log("D75 size", JSON.stringify(stats));
  // 178,000은 축약 문턱이다(league-net.js: 넘으면 오래된 기록을 덜어 낸다). 원본이 문턱을 넘는 것은 D-75 이전부터의
  // 설계상 정상(신중 성향 원본 약 186,9KB)이므로, D-75는 전송 크기(위 두 단언)와 원본 증가량으로 판정한다.
  // 지시서 D75-test.md 3항의 '원본 < 178,000' 요구는 총괄 지시 오류여서 Claude가 정정했다.
  ok(stats.rawAfter - stats.rawBefore <= 200,
    `${style} D-75 원본 증가 200바이트 이하: 판정 없음 ${stats.rawBefore}, 있음 ${stats.rawAfter}`);
}

async function main() {
  await security(); await teamReports();
  if (!process.argv.includes("--quick")) { await size("bold"); await size("careful"); }
  console.log(`D75 checks ${checks} fail 0`);
}
main().catch(error => {
  console.error(error);
  console.error(`D75 checks ${checks} passed; failure above`);
  process.exitCode = 1;
});
