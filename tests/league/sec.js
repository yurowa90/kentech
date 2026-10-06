/* 지시서 F 수용 검사. 외부 연결 없이 실제 WebCrypto와 게임 엔진을 사용한다. */
"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
// 구현 파일을 쓰지 않고 require/VM이 읽는 메모리 문자열만 바꾼다.
const fs = require("node:fs"), child = require("node:child_process");
const mutations = {
  team: ["league-net.js", 'm.team !== team || ', '', "대상 팀에도 같은 키 등록"],
  kick: ["league-net.js", '(T.seatVersion || 0) !== epoch || ', '', "검증 도중 kick"],
  events: ["league-core.js", 'const rnd = rng(hashStr((S.seedKey ?? S.room) + ":" + S.round)), out = [];', 'const rnd = rng(hashStr("constant:" + S.round)), out = [];', "room 모드: 실제로 뽑힌 사건"],
  replay: ["league.js", 'state: structuredClone(L.initial), initial:', 'state: structuredClone(L.S), initial:', "실제 같은 조건으로 다시"],
  host_sig: ["league-net.js", 'if (!await crypto.subtle.verify(signing, key, Uint8Array.from(atob(sig)', 'if (false && !await crypto.subtle.verify(signing, key, Uint8Array.from(atob(sig)', "진행자 서명 뒤 내용 변조"],
  canonical: ["league-net.js", 'json = canonical(data);', 'json = JSON.stringify(data);', "정규 JSON: 재귀 키 섞기"],
  code_binding: ["league-net.js", 'binding.room !== trust.room || ', '', "첫 키도 방 코드와 다르면"],
  link_binding: ["league-net.js", 'trust.fingerprint && binding.fingerprint !== trust.fingerprint ||', 'false ||', "링크 지문 불일치"],
  kid: ["league.js", 'm.kid !== await NET.fingerprint(L.identity.publicKey)', 'false', "위조 nack·다른 kid"],
  sid: ["league-net.js", 'if (!S.sid || m.sid !== S.sid)', 'if (false)', "다른 방 봉투"],
  seat: ["league-net.js", 'm.seat !== epoch', 'false', "kick 이전 claim 봉투"],
  retired: ["league-net.js", 'T.retired?.[', '{}?.[', "같은 키 재착석도 retired"],
  debounce: ["league.js", 'L.hostSaveT = setTimeout(() => { if (L?.role === "host") flushHost(); }, 1000);', 'flushHost();', "전체 저장은 1초 디바운스"],
  ai: ["league-ai.js", '${S.seedKey ?? S.room}:', '${S.room}:', "fixed 컴퓨터 도시 계획"],
  trim: ["league-net.js", 'if (size > 178000)', 'if (false)', "크기 위험 시 오래된 팀 기록"],
  warning_loop: ["league.js", '        connectionWarning();\n        if (!L.team)', '        if (L.hostWarning) return;\n        connectionWarning();\n        if (!L.team)', "F3-1 위조 snap 연타"],
  stale_retry: ["league.js", 'pending && m.err === "replay"', 'pending && ["replay", "stale"].includes(m.err)', "F3-2 stale은 재전송 없이"],
  retry_stamp: ["league.js", '...(pending?.stamp || stamp)', '...stamp', "F3-11 새 sid snap 뒤 원래"],
  nack_signature: ["league-net.js", '["bad", "signature"].includes(result.err)', 'false', "F3-3 bad·signature nack"],
  nack_echo: ["league-net.js", 'const reply = { team: m.team,', 'const reply = { ...m, team: m.team,', "F3-3 응답 필드 제한"],
  nack_rate: ["league-net.js", 'if (++rate.count > 2)', 'if (false)', "F3-3 kid 교체 포함"],
  claim_ack: ["league.js", 'if (!L.claimAccepted) return;', 'if (false) return;', "F3-4 첫 snap만으로"],
  lost_seat: ["league.js", 'if (previousSeat != null && me.seatVersion !== previousSeat)', 'if (!me.seated && previousSeat != null && me.seatVersion !== previousSeat)', "F3-4 kick 직후 새 기기"],
  claim_reject: ["league.js", '      releaseSeat();\n      BG.toast(msg);', '      BG.toast(msg);', "F3-4 taken 자리 선택"],
  early_request: ["league-net.js", 'if (m.n <= Math.max(claim && T.token !== m.kid ? 0 : lastN(), T.retired?.[m.kid] || 0)) return reject("replay");', '', "F3-5 진행자 sid·순번·크기"],
  request_queue: ["league-net.js", '(queued.get(team) || 0) >= 16', 'false', "F3-5 진행자 검증 대기열"],
  early_host: ["league-net.js", 'if (queued >= 16 || !cheap(incoming) || incoming.event !== event)', 'if (queued >= 16 || incoming.event !== event)', "F3-5 팀 sid·순번·크기"],
  host_queue: ["league-net.js", 'queued >= 16', 'false', "F3-5 팀 검증 대기열"],
  compact_loop: ["league-net.js", 'const ratio = Math.max(0, Math.min(1,', 'while (bytes(view).length > 178000 && view.teams[Object.keys(view.teams)[0]].hist.length > 2) view.teams[Object.keys(view.teams)[0]].hist.shift(); const ratio = Math.max(0, Math.min(1,', "F3-6 부풀린 상태"],
  compact_summary: ["league-net.js", 'if (i >= t.hist.length - 2 || !row.plan)', 'if (true)', "F3-6 오래된 계획 전문"],
  apply_json: ["league-net.js", 'await apply(event, signed.data);', 'await apply(event, incoming.data);', "F3-7 검증한 정규 JSON"],
  json_values: ["league-net.js", 'return encode(value);', 'return encode(JSON.parse(JSON.stringify(value)));', "F3-7 JSON 밖 값 거절"],
  room_bits: ["league-net.js", 'length: 8', 'length: 6', "F3-8 기존 ALPHA 40비트 고정 벡터"],
  room_alphabet: ["league-net.js", '"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"', '"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"', "F3-8 기존 ALPHA 40비트 고정 벡터"],
  room_input: ["league.js", 'replace(/[-\\s]/g, "")', 'trim()', "F3-8 코드 정규화"],
  migrate_data: ["league.js", 'if (data) store.set(dataKey(), data);', '', "F3-9 같은 팀 새 방"],
  broken_legacy: ["league.js", 'Object.keys(save.state.teams || {})', 'Object.keys(save.state.teams)', "F3-9 teams 없는 옛 저장 hostView"],
  fallback_sid: ["league.js", 'L.S.sid = NET.sessionId();', 'if (ok) L.S.sid = NET.sessionId();', "F3-9 teams 없는 옛 저장"],
  born_floor: ["league-net.js", 'm.born <= (T.receiptFloor || 0)', 'false', "F3-10 퇴거한 born"],
  pending_limit: ["league.js", 'L.pendingRequests.size >= 32', 'false', "F3-10 팀 대기 요청 상한"],
  restart_sid: ["league.js", 'L.S.sid = NET.sessionId();', 'L.S.sid ||= NET.sessionId();', "F3-11 진행자 시작마다"],
  restore_base: ["league-net.js", '([k, c]) => ({ k, c })', '([k, c]) => ({ k, c: c + 1 })', "F3-12 운영 자료 축약 복원"],
  restore_grid: ["league-net.js", '([key, allocatedMW]) => ({ key, allocatedMW })', '([key, allocatedMW]) => ({ key, allocatedMW: 0 })', "F3-12 운영 자료 축약 복원"],
  state_crit_order: ["league-net.js", 'stateful ? stateNs?.values[m.type] || 0 : T.lastN || 0', 'stateful && m.type !== "crit" ? stateNs?.values[m.type] || 0 : T.lastN || 0', "F4 ready(568) → crit(567)"],
  state_plan_order: ["league-net.js", 'stateful ? stateNs?.values[m.type] || 0 : T.lastN || 0', 'stateful && m.type !== "plan" ? stateNs?.values[m.type] || 0 : T.lastN || 0', "F4 준비 → 계획"],
  state_replay: ["league-net.js", 'stateNs?.values[m.type] || 0', 'm.type === "crit" ? 0 : stateNs?.values[m.type] || 0', "F4 같은 type 옛 n"],
  state_max: ["league-net.js", 'T.lastN = Math.max(T.lastN || 0, m.n);', 'T.lastN = m.n;', "F4 역순 반영 뒤에도 퇴거용"],
  state_seat: ["league-net.js", 'T.lastNByType?.seat === epoch && T.lastNByType.kid === m.kid', 'T.lastNByType', "F4 새 키·자리"],
  state_ack: ["league.js", 'sent.acked = true;', 'return;', "F4 최신 상태 ack"],
  state_ack_n: ["league.js", 'sent.n === m.n && ', '', "F4 이전·다른 대상 ack"],
  state_ack_queued: ["league.js", 'session.stateRequests[type] = stateRequest;', 'session.sending?.then(() => { session.stateRequests[type] = stateRequest; });', "F4 서명 대기 중 이전 ack"],
  state_cooldown: ["league.js", 'Date.now() - sent.sentAt >= 2000', 'true', "F4 1999ms"],
  state_ack_timer: ["league.js", '(type !== "plan" || !sent.acked || sent.rev !== L.rev)', 'true', "F4 ack 후 계획 재전송 중단"],
  state_unsent_crit: ["league.js", 'type !== "plan" || !sent.acked || sent.rev !== L.rev', 'type === "hello" || !sent.acked', "F4 이전 ack 뒤 아직 보내지 않은 기준 편집"],

};
if (process.env.F2_MUTATION) {
  const [file, from, to] = mutations[process.env.F2_MUTATION];
  const read = fs.readFileSync;
  fs.readFileSync = function (name, ...args) {
    const value = read.call(this, name, ...args);
    if (typeof value === "string" && String(name).endsWith("/ui/" + file)) {
      assert.ok(value.includes(from), "변형 대상 없음: " + file);
      let changed = value.replaceAll(from, to);
      if (process.env.F2_MUTATION === "early_host") changed = changed.replace('if (!cheap(wire)) return false;', '').replace('          if (event === "snap" &&', '          if (!cheap(wire)) return false;\n          if (event === "snap" &&');
      return changed;
    }
    return value;
  };
}
if (process.argv.includes("--mutations")) {
  for (const [name, [, , , expected]] of Object.entries(mutations)) {
    const result = child.spawnSync(process.execPath, [__filename, "--quick"], { env: { ...process.env, F2_MUTATION: name }, encoding: "utf8" });
    const out = result.stdout + result.stderr;
    assert.ok(result.status !== 0 && out.includes(expected), name + " 변형이 기대 단언에서 실패하지 않음:\n" + out);
    console.log(name + " → " + expected + " [실패 확인]");
  }
  process.exit(0);
}
global.window = { KCP: { route() {}, on() {}, esc: String } };
global.document = { documentElement: {} };
for (const file of ["build-maps", "tech-data", "build", "econ-data", "econ", "league-data", "league-core", "league-ai", "league-net"]) require(path.resolve(__dirname, "../../ui", file + ".js"));
const K = window.KCP, C = K.leagueCore, N = K.leagueNet, BG = K.buildGame;
const R = Object.values(K.LEAGUE_REGIONS).find(r => r.teams.length === 6), ids = R.teams.map(t => t.id);
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; }
const state = (room = "SEC01", seedMode) => Object.assign(C.newState(room, R.id, 0, ids, { turns: 36, ...(seedMode ? { seedMode } : {}) }), { sid: "fixture-session-" + room });
async function security() {
  const S = state(), applied = [];
  const sign = (key, team, request, now) => N.signEnvelope(key, team, { sid: S.sid, seat: S.teams[team]?.seatVersion || 0, ...request }, now);
  const a = await N.createIdentity(), b = await N.createIdentity(), team = ids[0];
  const e = await sign(a, team, { type: "ready", ready: true }, 100);
  ok(await N.verifyEnvelope(e, a.publicKey), "P-256/SHA-256 서명 검증");
  ok(!await N.verifyEnvelope({ ...e, body: e.body.replace("100", "101") }, a.publicKey), "body 한 글자 변조 거절");
  ok(!await N.verifyEnvelope(await sign(b, team, { type: "ready" }), a.publicKey), "다른 팀 키 거절");
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k => [k, reorder(value[k])])) : value;
  ok(await N.verifyEnvelope(JSON.parse(JSON.stringify(reorder(e))), reorder(a.publicKey)), "봉투·공개 키 재정렬 뒤 문자열 body 검증");
  ok(!await N.verifyEnvelope({ ...e, sig: "invalid" }, a.publicKey), "깨진 서명 거절");
  const receive = N.receiver(S, m => { applied.push(m.n); return C.reduce(S, m, 1, BG); });
  const claim = key => sign(key, team, { type: "claim", publicKey: key.publicKey });
  ok((await receive(await claim(a))).ok, "공개 키만으로 첫 착석");
  const high = await sign(a, team, { type: "ready", ready: true });
  ok((await receive(high)).ok, "등록 키 요청 반영");
  ok((await receive(high)).err === "replay", "같은 순번 거절");
  ok((await receive(e)).err === "replay", "작은 순번 거절");
  ok(!(await receive({ team, type: "ready", token: S.teams[team].token, ready: false })).ok, "원문·내부 지문을 알아도 봉투 없이는 거절");
  ok(!(await receive(await sign(b, team, { type: "ready", ready: false }))).ok, "다른 팀 서명으로 상태 수정 불가");
  ok((await receive(await claim(b))).err === "taken", "등록된 자리에 다른 키 claim은 taken으로 거절");
  await receive(await sign(a, ids[1], { type: "claim", publicKey: a.publicKey }));
  const renamed = { ...await sign(a, team, { type: "ready", ready: false }), team: ids[1] };
  ok(!(await receive(renamed)).ok, "대상 팀에도 같은 키 등록: 바깥 팀 이름 변조 거절");
  const secret = JSON.stringify(C.publicView(S, 2));
  for (const needle of [a.publicKey.x, a.publicKey.y, a.privateKey.d, S.teams[team].token, high.sig, '"publicKey"', '"privateKey"', '"sig"', '"token"', '"lastN"', '"lastNByType"']) ok(!secret.includes(needle), "공개 상태에서 인증 자료 제외: " + needle.slice(0, 12));
  const before = applied.length;
  const first = await sign(a, team, { type: "ready", ready: false });
  const second = await sign(a, team, { type: "ready", ready: true });
  const third = await sign(a, team, { type: "ready", ready: false });
  let active = 0, maxActive = 0;
  const delayed = N.receiver(S, m => { applied.push(m.n); return C.reduce(S, m, 3, BG); }, async (wire, key) => {
    active++; maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, wire.body === second.body ? 20 : 1));
    const valid = await N.verifyEnvelope(wire, key); active--; return valid;
  });
  const results = await Promise.all([delayed(second), delayed(first), delayed(third)]);
  ok(results[0].ok && !results[1].ok && results[2].ok, "뒤섞인 같은 type 동시 도착: 단조 증가 순번만 반영");
  ok(maxActive === 1 && applied.slice(before).every((n, i, all) => i === 0 || n > all[i - 1]), "팀별 검증·반영 직렬 처리");
  const restored = JSON.parse(JSON.stringify(S));
  ok(!(await N.receiver(restored, m => C.reduce(restored, m, 4, BG))(third)).ok, "진행자 저장 복원 뒤 되풀이 거절");
  const restoredKey = JSON.parse(JSON.stringify(a));
  ok((await receive(await sign(restoredKey, team, { type: "hello" }, 1))).ok, "기기 키·순번 복원, 시계 역행에도 재접속");
  let resume;
  const held = N.receiver(S, m => C.reduce(S, m, 5, BG), async (wire, key) => { await new Promise(resolve => { resume = resolve; }); return N.verifyEnvelope(wire, key); });
  const pending = held(await sign(restoredKey, team, { type: "claim", publicKey: restoredKey.publicKey }));
  await new Promise(resolve => setImmediate(resolve));
  const preKick = await claim(a), oldN = S.teams[team].lastN;
  C.host(S, "kick", 6, team); resume();
  ok(!(await pending).ok, "검증 도중 kick: 이전 요청 반영 불가");
  ok(!S.teams[team].publicKey, "kick은 등록 키 삭제");
  ok(S.teams[team].retired[await N.fingerprint(a.publicKey)] === oldN, "kick은 retired에 마지막 순번 보존");
  ok((await receive(preKick)).err === "seat", "kick 이전 claim 봉투 거절");
  const cross = state("OTHER1");
  ok((await N.receiver(cross, m => C.reduce(cross, m, 1, BG))(preKick)).err === "session", "다른 방 봉투 거절");
  const rewind = { ...a, n: 0 };
  const low = await N.signEnvelope(rewind, team, { type: "claim", publicKey: a.publicKey, sid: S.sid, seat: S.teams[team].seatVersion }, 1);
  ok((await receive(low)).err === "replay", "같은 키 재착석도 retired 이하 순번 거절");
  ok((await receive(await claim(b))).ok, "kick 뒤 새 키 허용");
  const legacy = state(); C.reduce(legacy, { team, type: "claim", token: "legacy-seat" }, 0, BG);
  ok(!(await N.receiver(legacy, m => C.reduce(legacy, m, 0, BG))(await sign(a, team, { type: "claim", publicKey: a.publicKey, seat: 0 }))).ok, "옛 토큰 자리는 kick 없이 키로 교체 불가");
  C.host(legacy, "kick", 1, team);
  ok((await N.receiver(legacy, m => C.reduce(legacy, m, 2, BG))(await claim(a))).ok, "옛 자리 kick 뒤 새 키 착석");
  const internal = state();
  ok(C.reduce(internal, { type: "claim", team, token: "solo-city-" + team }, 0, BG).ok && C.reduce(internal, { type: "ready", team, token: "solo-city-" + team, ready: true }, 0, BG).ok, "혼자 하기의 내부 무서명 경로 유지");
}
async function floor4Network() {
  const S = state(), team = ids[0], key = await N.createIdentity();
  S.phase = "plan"; S.round = 1;
  const sign = (request, n) => N.signEnvelope({ ...key, n: 0 }, team,
    { sid: S.sid, seat: S.teams[team].seatVersion || 0, rd: S.round, ph: S.phase, ...request }, n);
  const receive = N.receiver(S, m => C.reduce(S, m, 1, BG));
  await receive(await sign({ type: "claim", publicKey: key.publicKey }, 1));
  const crit = await sign({ type: "crit", chips: ["rel"], line: 57, choice: "keep" }, 567);
  const ready = await sign({ type: "ready", ready: true }, 568);
  const readyResult = await receive(ready), critResult = await receive(crit);
  ok(readyResult.ok && critResult.ok && S.teams[team].ready && S.teams[team].crit.line === 57,
    "F4 ready(568) → crit(567) 역순 도착도 둘 다 반영");
  const oldCrit = await sign({ type: "crit", chips: ["pop"], line: 12, choice: "change" }, 566);
  ok((await receive(oldCrit)).err === "replay" && S.teams[team].crit.line === 57,
    "F4 같은 type 옛 n은 replay·기준 유지");
  const plan = { builds: [], lines: [] }, rev = S.teams[team].rev + 1;
  const planned = await sign({ type: "plan", plan, rev }, 569);
  const readyAgain = await sign({ type: "ready", ready: false }, 570);
  await receive(readyAgain);
  ok((await receive(planned)).ok && S.teams[team].rev === rev && S.teams[team].plan.lines.length === 0,
    "F4 준비 → 계획 역순 도착도 마지막 계획 반영");
  ok(S.teams[team].lastN === 570, "F4 역순 반영 뒤에도 퇴거용 최대 순번 보존");
  for (const type of ["hello", "plan", "econ", "crit", "ready"]) {
    const data = { hello: {}, plan: { plan, rev: rev + 1 }, econ: { taxRes: 1 },
      crit: { chips: ["pop"], line: 60, choice: "change" }, ready: { ready: true } }[type];
    const wire = await sign({ type, ...data }, 580);
    ok((await receive(wire)).ok, `F4 ${type}는 다른 type과 같은 n도 허용`);
    const restored = JSON.parse(JSON.stringify(S));
    const restoredReceive = N.receiver(restored, m => C.reduce(restored, m, 1, BG));
    for (const n of [580, 579]) ok((await restoredReceive(await sign({ type, ...data }, n))).err === "replay",
      `F4 ${type} 저장 복원 뒤 같거나 옛 n(${n}) replay`);
  }
  C.host(S, "kick", 2, team);
  ok((await receive(crit)).err === "seat", "F4 type 순번이 있어도 kick 이전 상태 봉투 거절");
  ok((await receive(await sign({ type: "claim", publicKey: key.publicKey }, 581))).ok,
    "F4 같은 키 재착석은 퇴거 순번보다 커야 허용");
  ok((await receive(await sign({ type: "hello" }, 580))).err === "replay",
    "F4 새 자리의 상태 요청도 retired 이하 차단");
  const otherKey = await N.createIdentity();
  C.host(S, "kick", 3, team);
  const signOther = (type, n) => N.signEnvelope({ ...otherKey, n: 0 }, team,
    { type, publicKey: otherKey.publicKey, sid: S.sid, seat: S.teams[team].seatVersion }, n);
  await receive(await signOther("claim", 1));
  ok((await receive(await signOther("hello", 2))).ok, "F4 새 키·자리에 이전 type 순번을 적용하지 않음");
}
async function hostSecurity() {
  const host = await N.createIdentity(), attacker = await N.createIdentity(), binding = await N.hostBinding(host.publicKey);
  const keyShuffle = value => Array.isArray(value) ? value.map(keyShuffle) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().reverse().map(k => [k, keyShuffle(value[k])])) : value;
  const fixtureKey = { kty: "EC", crv: "P-256", x: "fixture-x", y: "fixture-y" };
  const digest = require("node:crypto").createHash("sha256").update(N.canonical(fixtureKey)).digest();
  const bits = [...digest.subarray(0, 5)].map(x => x.toString(2).padStart(8, "0")).join("");
  const expected = Array.from({ length: 8 }, (_, i) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[parseInt(bits.slice(i * 5, i * 5 + 5), 2)]).join("");
  ok((await N.hostBinding(fixtureKey)).room === expected, "F3-8 기존 ALPHA 40비트 고정 벡터");
  ok(/^[A-HJ-NP-Z2-9]{8}$/.test(binding.room) && binding.fingerprint.length === 22, "공개 키에서 8자리 방 코드·22자 지문 파생");
  ok(JSON.stringify(await N.hostBinding(keyShuffle(host.publicKey))) === JSON.stringify(binding), "정규 공개 JWK는 키 순서 무관");
  const S = state(binding.room), V = C.publicView(S, 1); V.numericFixture = { a: 1, z: -0, nested: [0.0000001, 1e21, { b: 2, a: 1 }] };
  const wire = await N.signHost(host, "snap", S.room, S.sid, V);
  const transformed = JSON.parse(JSON.stringify(keyShuffle(wire)).replace('"a":1,', '"a":1.0,').replace('"z":0', '"z":-0'));
  let received = null, count = 0;
  const trust = { room: S.room }, receive = N.hostReceiver(trust, (event, data) => { received = data; count++; });
  ok(await receive("snap", transformed), "정규 JSON: 재귀 키 섞기 + JSON 왕복 + 1.0→1/-0→0 검증");
  ok(N.canonical(wire) === N.canonical(transformed), "파싱한 값이 같으면 정규 JSON 바이트도 동일");
  ok(trust.hostKey.x === host.publicKey.x && received.numericFixture.a === 1, "코드 결속·서명 확인 후 첫 진행자 키 고정");
  ok(!await receive("snap", wire) && count === 1, "진행자 옛 순번 재방송 거절");
  const tampered = structuredClone(wire); tampered.n++; tampered.data.phase = "end";
  ok(!await receive("snap", tampered) && count === 1, "진행자 서명 뒤 내용 변조 거절");
  ok(!await receive("nack", wire), "snap 봉투를 nack 이벤트로 전용 불가");
  ok(!await N.hostReceiver({ room: S.room }, () => {})("snap", await N.signHost(attacker, "snap", S.room, S.sid, V)), "첫 키도 방 코드와 다르면 거절");
  ok(!await receive("snap", await N.signHost(attacker, "snap", S.room, S.sid, V)), "고정 진행자 키와 다른 키 거절");
  ok(!await N.hostReceiver({ room: S.room, fingerprint: "wrong-link-fingerprint" }, () => {})("snap", wire), "링크 지문 불일치면 첫 키도 거절");
  ok(!await N.hostReceiver({ room: "AAAAAA" }, () => {})("snap", { ...wire, room: "AAAAAA" }), "방 코드 불일치 키 거절");
  ok(await N.hostReceiver({ room: S.room, fingerprint: binding.fingerprint }, () => {})("snap", wire), "링크 지문 일치 참가");
  const packed = N.compactSnapshot(V), expanded = N.expandSnapshot(structuredClone(packed));
  ok(N.canonical(expanded) === N.canonical(V), "건설 base·계통 entries 전송 축약은 무손실 복원");
  // 인위적으로 오래된 팀 기록만 키운다. 현재 계획과 최근 두 기록은 그대로 남아야 한다.
  const large = structuredClone(V); large.teams[ids[0]].hist = Array.from({ length: 40 }, (_, i) => ({ round: i, detail: "x".repeat(6000) }));
  const shrunk = N.compactSnapshot(large);
  ok(N.byteLength(shrunk) <= 178000 && shrunk.teams[ids[0]].hist.at(-1).round === 39 && shrunk.teams[ids[0]].hist.length < 40 && JSON.stringify(shrunk.teams[ids[0]].plan) === JSON.stringify(large.teams[ids[0]].plan), "크기 위험 시 오래된 팀 기록부터 단계 축약");
}
async function transport() {
  const identity = await N.createIdentity(), team = ids[0];
  const make = (type, extra = {}) => N.signEnvelope(identity, team, { type, ...extra });
  const plan1 = await make("plan", { rev: 1 }), plan2 = await make("plan", { rev: 2 });
  const tie1 = await make("tie", { other: ids[1] }), tie2 = await make("tie", { other: ids[2] });
  const ev1 = await make("respond", { ev: "fixture-a" }), ev2 = await make("respond", { ev: "fixture-b" });
  const oldSocket = global.WebSocket, oldChannel = global.BroadcastChannel;
  const sockets = [], channels = [];
  class Socket {
    constructor() { this.readyState = 1; this.sent = []; sockets.push(this); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  class Channel {
    constructor() { channels.push(this); }
    postMessage(data) { channels.filter(c => c !== this).forEach(c => c.onmessage?.({ data: structuredClone(data) })); }
    close() {}
  }
  let online, localA, localB;
  try {
    global.WebSocket = Socket; global.BroadcastChannel = Channel;
    online = N.open({ kind: "supabase", room: "MOCK01", url: "https://fixture.supabase.co", key: "fixture-public-key" });
    const socket = sockets[0]; socket.onopen();
    for (const wire of [plan1, tie1, tie2, ev1, ev2, { ...plan2, type: "untrusted", other: "untrusted" }]) online.send("req", wire);
    const join = socket.sent.find(m => m.event === "phx_join");
    socket.onmessage({ data: JSON.stringify({ topic: join.topic, event: "phx_reply", ref: join.ref, payload: { status: "ok" } }) });
    const sent = socket.sent.filter(m => m.event === "broadcast");
    ok(sent.length === 5 && sent.filter(m => N.requestBody(m.payload.payload).type === "plan").every(m => N.requestBody(m.payload.payload).rev === 2), "끊김 큐: 같은 팀·요청만 최신 봉투 유지");
    ok(sent.filter(m => N.requestBody(m.payload.payload).type === "tie").length === 2 && sent.filter(m => N.requestBody(m.payload.payload).type === "respond").length === 2, "큐는 다른 연계선·사건 요청을 보존");
    ok(await N.verifyEnvelope(sent.at(-1).payload.payload, identity.publicKey), "큐·외부 비교 필드가 문자열 서명을 바꾸지 않음");
    let warns = 0; online.on("oversize", m => { if (m.ev === "snap") warns++; });
    const count = socket.sent.length;
    ok(online.send("snap", { text: "가".repeat(90000) }) === false && warns === 1 && socket.sent.length === count, "Supabase UTF-8 200,000바이트 초과는 전송 안 함·경고 이벤트");
    localA = N.open({ kind: "local", room: "MOCK02" }); localB = N.open({ kind: "local", room: "MOCK02" });
    let received; localB.on("req", m => { received = m; });
    localA.send("req", plan2);
    ok(await N.verifyEnvelope(received, identity.publicKey), "로컬 채널도 같은 서명 봉투");
    localA.on("oversize", () => warns++);
    ok(localA.send("snap", { text: "가".repeat(90000) }) === false && warns === 2, "로컬 초과도 경고 이벤트");
    // 네트워크 대신 메모리 모형만 사용한다. 안전하지 않은 문맥도 독립 VM에서 검사한다.
    const vm = require("node:vm"), fs = require("node:fs"), context = { window: { KCP: {} }, TextEncoder };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../../ui/league-net.js"), "utf8"), context);
    ok(!context.window.KCP.leagueNet.secure(), "WebCrypto 없으면 안전한 연결 불가 판정");
    await assert.rejects(context.window.KCP.leagueNet.createIdentity()); checks++;
  } finally {
    online?.close(); localA?.close(); localB?.close();
    global.WebSocket = oldSocket; global.BroadcastChannel = oldChannel;
  }
}
async function uiProtocol() {
  const vm = require("node:vm"), fs = require("node:fs");
  const storage = () => { const values = new Map(); return { writes: 0, fail: false, getItem: k => values.get(k) || null, setItem(k, v) { if (this.fail) throw Error("full"); this.writes++; values.set(k, v); }, removeItem: k => values.delete(k) }; };
  const localStorage = storage(), sessionStorage = storage(), connections = [], timers = new Map(), events = {}, dom = {};
  let notices = [], cryptoAvailable = true, timerId = 0, uiNow = null;
  class UIDate extends Date { static now() { return uiNow ?? Date.now(); } }
  const net = { ...N, secure: () => cryptoAvailable, open() {
    const handlers = {}, sent = [], conn = { sent, on: (event, fn) => { handlers[event] = fn; }, onStatus() {}, close() {}, send: (event, payload) => { sent.push({ event, payload }); return true; }, emit: (event, payload) => handlers[event]?.(payload) };
    connections.push(conn); return conn;
  } };
  const uiK = { ...K, leagueNet: net, buildGame: { ...BG, toast: text => notices.push(text) }, route() {}, on() {} };
  const context = { window: { KCP: uiK, localStorage, sessionStorage, addEventListener: (e, fn) => { events[e] = fn; } }, document: { getElementById: id => dom[id] || null, addEventListener() {} }, location: { hash: "#league/team", origin: "https://fixture", pathname: "/" }, setInterval: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms, interval: true }); return id; }, clearInterval: id => timers.delete(id), setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id), structuredClone, TextEncoder, Date: UIDate, console, queueMicrotask, btoa, atob };
  const source = fs.readFileSync(path.resolve(__dirname, "../../ui/league.js"), "utf8");
  vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, `
    renderHost = () => {}; mountCity = () => { KCP.mounts = (KCP.mounts || 0) + 1; }; seatPicker = () => {}; renderPanel = () => {}; sendPlan = () => { KCP.planSends = (KCP.planSends || 0) + 1; };
    KCP.secUI = { normalizeRoom, newRoom, validRoom, displayRoom, onSnap, send, queueCrit, teamSave, teamView, hostView, hostInit, close, saveHost, flushHost, joinLink, replaySolo,
      replayFixture: () => { startSolo = (app, save) => { KCP.replayed = save; }; },
      set: value => { L = value; }, get: () => L };
  })();`), context);
  const ui = uiK.secUI, team = ids[0], hostIdentity = await N.createIdentity(), binding = await N.hostBinding(hostIdentity.publicKey), room = binding.room;
  const S = state(room), hostWire = (event, data) => N.signHost(hostIdentity, event, room, S.sid, data);
  const old = { room, team, net: { kind: "local" }, token: "legacy-seat" };
  sessionStorage.setItem("kcp-league-tab-v1", JSON.stringify(old));
  const teamApp = { isConnected: true, querySelector: selector => selector === "#lg-team-wait" ? {} : null };
  ui.teamView(teamApp); const conn = connections.at(-1);
  ok(ui.normalizeRoom(" abcd - efgh ") === "ABCDEFGH" && ui.newRoom("ABCDEFGH") && !ui.newRoom("ABCD") && ui.validRoom("ABCD") && ui.validRoom("ABCDEF") && ui.validRoom("ABCDEFGH") && ui.displayRoom("ABCDEFGH") === "ABCD-EFGH", "F3-8 코드 정규화·4-4 표시·옛 코드 신규 참가 금지");
  await conn.emit("snap", await hostWire("snap", C.publicView(S, Date.now()))); await ui.get().sending;
  ok(!uiK.mounts, "F3-4 첫 snap만으로 도시 화면을 붙이지 않음");
  const first = conn.sent.at(-1).payload, saved = JSON.parse(sessionStorage.getItem("kcp-league-tab-v1"));
  ok(saved.identity?.privateKey?.d && !Object.hasOwn(saved, "token") && await N.verifyEnvelope(first, saved.identity.publicKey), "옛 팀 저장: 진행자 검증 후 새 키 claim");
  ok(!JSON.stringify(first).includes(saved.identity.privateKey.d) && !JSON.stringify(first).includes(old.token), "UI 전송에 개인 키·옛 토큰 없음");
  const receive = N.receiver(S, m => C.reduce(S, m, 1, BG));
  ok((await receive(first)).ok, "UI claim을 진행자 실제 검증·reduce로 반영");
  await conn.emit("ack", await hostWire("ack", { ...N.requestBody(first) }));
  await conn.emit("snap", await hostWire("snap", C.publicView(S, Date.now())));
  ok(uiK.mounts > 0 && ui.get().claimAccepted, "F3-4 내 claim ack 뒤에만 도시 화면 표시");
  const phase = ui.get().snap.phase;
  const fake = C.publicView(S, Date.now()); fake.phase = "end"; fake.teams[team].seated = false;
  dom["lg-conn"] = { textContent: "", dataset: {} };
  await conn.emit("snap", fake);
  ok(ui.get().snap.phase === phase && ui.get().team === team && !ui.get().hostWarning, "무서명 snap 거절·정상 메시지 10초 이내는 연결 유지");
  const evil = await N.createIdentity();
  await conn.emit("snap", await N.signHost(evil, "snap", room, S.sid, fake));
  ok(ui.get().snap.phase === phase && !ui.get().hostWarning, "공격자 키로 서명한 snap 거절·10초 이내 연결 유지");
  const badNack = { team, type: "claim", err: "taken", kid: await N.fingerprint(evil.publicKey), n: N.requestBody(first).n };
  await conn.emit("nack", badNack);
  await conn.emit("nack", await hostWire("nack", badNack));
  ok(ui.get().team === team && notices.length === 0, "위조 nack·다른 kid의 서명된 nack 무시");
  const ownKid = await N.fingerprint(saved.identity.publicKey);
  for (const err of ["signature", "replay", "seat"]) await conn.emit("nack", await hostWire("nack", { ...badNack, kid: ownKid, err }));
  ok(ui.get().team === team, "signature/replay/seat nack은 자리 유지");
  ui.send("price", { price: 0.2 }); await ui.get().sending;
  const request = N.requestBody(conn.sent.at(-1).payload);
  for (let i = 0; i < 4; i++) {
    const latest = N.requestBody(conn.sent.at(-1).payload);
    await conn.emit("nack", await hostWire("nack", { ...latest, err: "replay", current: { rd: 99, ph: "plan" } }));
    await ui.get().sending;
  }
  const attempts = conn.sent.map(x => N.requestBody(x.payload)).filter(m => m.id === request.id);
  ok(attempts.length === 4 && attempts.every((m, i) => !i || m.n > attempts[i - 1].n) && !ui.get().pendingRequests.size, "요청 id별 replay 새 순번 최대 3회 재전송");
  ok(attempts.every(m => m.rd === request.rd && m.ph === request.ph && m.born === request.born), "F3-2 replay는 원래 rd·ph·born 유지");
  ui.send("price", { price: 0.25 }); await ui.get().sending;
  const stale = N.requestBody(conn.sent.at(-1).payload), beforeStale = conn.sent.length;
  await conn.emit("nack", await hostWire("nack", { ...stale, err: "stale", current: { rd: 99, ph: "plan" } }));
  await ui.get().sending;
  ok(conn.sent.length === beforeStale && !ui.get().pendingRequests.has(stale.id) && notices.at(-1).includes("지난 단계 요청"), "F3-2 stale은 재전송 없이 사용자 재확인");
  ui.send("price", { price: 0.3 }); await ui.get().sending;
  const goodPrice = conn.sent.at(-1).payload;
  const waiting = N.requestBody(goodPrice);
  for (const reply of [{ ...waiting, n: waiting.n - 1 }, { ...waiting, id: "wrong-id" }, { ...waiting, kid: "wrong-kid" }]) await conn.emit("ack", await hostWire("ack", reply));
  await conn.emit("nack", await hostWire("nack", { ...waiting, err: "signature" }));
  ok(ui.get().pendingRequests.has(waiting.id), "다른 n/id/kid ack·인증 전 signature nack은 대기 요청을 취소하지 않음");
  ok((await receive(goodPrice)).ok, "한 번짜리 요청 반영");
  const originalRev = S.rev, goodBody = N.requestBody(goodPrice);
  saved.identity.n = goodBody.n;
  const duplicate = await N.signEnvelope(saved.identity, team, { ...goodBody, n: undefined });
  ok((await receive(duplicate)).ok && S.rev === originalRev, "같은 요청 id 재전송은 중복 적용 안 함");
  await conn.emit("ack", await hostWire("ack", goodBody));
  ok(!ui.get().pendingRequests.size, "자기 kid·요청 id·n ack만 대기 해제");
  await conn.emit("snap", await hostWire("snap", C.publicView(S, Date.now())));
  const unchangedSeat = C.publicView(S, Date.now()); unchangedSeat.teams[team].seated = false;
  await conn.emit("snap", await hostWire("snap", unchangedSeat));
  ok(ui.get().team === team, "진행자 서명 snap도 seatVersion 변화 없이는 자리 해제 안 함");
  await conn.emit("snap", await hostWire("snap", C.publicView(S, Date.now())));
  for (const type of ["tie", "respond", "research", "license", "joint"]) {
    ui.send(type, { other: ids[1], ev: "fixture" }); await ui.get().sending;
    const body = N.requestBody(conn.sent.at(-1).payload);
    ok(body.id && ui.get().pendingRequests.has(body.id), type + "도 요청 id별 ack 대기");
    await conn.emit("ack", await hostWire("ack", body));
    ok(!ui.get().pendingRequests.has(body.id), type + " ack 후 대기 해제");
  }
  const tick = () => [...timers.values()].find(t => t.ms === 5000 && t.interval).fn();
  uiNow = Date.now();
  const originalSnap = ui.get().snap;
  ui.get().snap = structuredClone(originalSnap); ui.get().snap.phase = "plan";
  ui.get().snap.teams[team].ready = false;
  const stateFields = { ready: "wantReady", crit: "pendingCrit", econ: "pendingPol" };
  for (const [type, field] of Object.entries(stateFields)) {
    const extra = type === "ready" ? { ready: true } : type === "crit"
      ? { chips: ["rel"], line: 57, choice: "keep" } : { taxRes: 1 };
    if (type === "econ") ui.get().pendingPol = extra;
    ui.send(type, extra); await ui.get().sending;
    const previous = N.requestBody(conn.sent.at(-1).payload);
    const next = type === "ready" ? { ready: false } : { ...extra, ...(type === "crit" ? { line: 58 } : { taxRes: 2 }) };
    if (type === "econ") ui.get().pendingPol = next;
    ui.send(type, next); await ui.get().sending;
    const current = N.requestBody(conn.sent.at(-1).payload), value = ui.get()[field];
    for (const reply of [previous, { ...current, n: current.n + 1 }, { ...current, kid: "wrong" }, { ...current, team: ids[1] }])
      await conn.emit("ack", await hostWire("ack", reply));
    ok(ui.get()[field] === value, "F4 이전·다른 대상 ack는 새 " + type + " 대기를 보존");
    await conn.emit("ack", await hostWire("ack", current));
    ok(ui.get()[field] === null, "F4 최신 상태 ack만으로 " + type + " 대기 해제(스냅 없음)");
  }
  // 최신 편집이 아직 서명 대기 중일 때도 이전 ack가 이를 완료 처리하면 안 된다.
  const oldReady = N.requestBody(conn.sent.findLast(x => N.requestBody(x.payload).type === "ready").payload);
  let releaseSigning;
  ui.get().sending = new Promise(resolve => { releaseSigning = resolve; });
  ui.send("ready", { ready: false });
  await conn.emit("ack", await hostWire("ack", oldReady));
  ok(ui.get().wantReady === false && !ui.get().stateRequests.ready.acked,
    "F4 서명 대기 중 이전 ack는 같은 값의 새 요청도 보존");
  releaseSigning(); await ui.get().sending;
  ui.send("hello"); ui.send("plan", { plan: S.teams[team].plan, rev: S.teams[team].rev + 1 });
  ui.send("ready", { ready: true });
  ui.send("crit", { chips: ["rel"], line: 60, choice: "keep" });
  ui.get().pendingPol = { taxRes: 1 }; ui.send("econ", ui.get().pendingPol);
  await ui.get().sending;
  ui.get().rev = ui.get().snap.teams[team].rev + 1;
  const beforeCooldown = conn.sent.length, beforePlans = uiK.planSends || 0;
  uiNow += 1999; tick(); await ui.get().sending;
  ok(conn.sent.length === beforeCooldown && (uiK.planSends || 0) === beforePlans,
    "F4 1999ms 안에는 모든 상태 type 타이머 재전송 없음");
  uiNow++; tick(); await ui.get().sending;
  const retriedTypes = conn.sent.slice(beforeCooldown).map(x => N.requestBody(x.payload).type);
  ok(["hello", "econ", "crit", "ready"].every(type => retriedTypes.includes(type)) && uiK.planSends === beforePlans + 1,
    "F4 2000ms부터 미확인 상태 요청 재전송");
  for (const type of ["plan", "econ", "crit", "ready"]) {
    const body = N.requestBody(conn.sent.findLast(x => N.requestBody(x.payload).type === type).payload);
    await conn.emit("ack", await hostWire("ack", body));
  }
  const beforeAckTick = conn.sent.length, plansAfterAck = uiK.planSends;
  uiNow += 5000; tick(); await ui.get().sending;
  ok(uiK.planSends === plansAfterAck && conn.sent.slice(beforeAckTick).every(x => N.requestBody(x.payload).type === "hello"),
    "F4 ack 후 계획 재전송 중단·나머지 상태 대기 해제·hello 접속 확인 유지");
  ui.queueCrit({ chips: ["rel"], line: 61, choice: "keep" });
  const beforeEditTick = conn.sent.length;
  tick(); await ui.get().sending;
  ok(conn.sent.slice(beforeEditTick).some(x => { const m = N.requestBody(x.payload); return m.type === "crit" && m.line === 61; }),
    "F4 이전 ack 뒤 아직 보내지 않은 기준 편집도 타이머 전송");
  ui.get().pendingCrit = null;
  ui.get().snap = originalSnap; ui.get().stateRequests = {}; uiNow = null;
  ui.send("price", { price: 0.4 }); await ui.get().sending;
  const timeoutBody = N.requestBody(conn.sent.at(-1).payload), pending = ui.get().pendingRequests.get(timeoutBody.id);
  ui.get().lastHostAt = Date.now() - 11000; ui.get().hostWarning = true; pending.sentAt = Date.now() - 6000;
  ui.get().rev = ui.get().snap.teams[team].rev + 1;
  for (let i = 0; i < 20; i++) await conn.emit("snap", { ...await hostWire("snap", fake), sig: "invalid" });
  const beforeTick = conn.sent.length; tick(); await ui.get().sending;
  const tickBodies = conn.sent.slice(beforeTick).map(x => N.requestBody(x.payload));
  ok(ui.get().hostWarning && tickBodies.some(m => m.type === "hello") && tickBodies.some(m => m.id === timeoutBody.id) && uiK.planSends > 0, "F3-1 위조 snap 연타·경고 중 hello·계획·대기 재전송 계속");
  ok(tickBodies.find(m => m.id === timeoutBody.id).born === timeoutBody.born, "F3-2 시간 초과도 원래 born 보존");
  ui.get().claimAccepted = false; ui.get().claimAfter = 0;
  tick(); await ui.get().sending;
  const reclaim = N.requestBody(conn.sent.at(-1).payload);
  ok(reclaim.type === "claim", "F3-1 경고 중에도 claim 재시도");
  await conn.emit("ack", await hostWire("ack", reclaim));
  const beforeRestart = N.requestBody(conn.sent.findLast(x => N.requestBody(x.payload)?.id === timeoutBody.id).payload);
  S.sid = N.sessionId(); S.round = 1; S.phase = "plan";
  await conn.emit("snap", await hostWire("snap", C.publicView(S, Date.now()))); await ui.get().sending;
  const afterRestart = N.requestBody(conn.sent.at(-1).payload);
  ok(afterRestart.id === beforeRestart.id && afterRestart.sid === S.sid && afterRestart.n > beforeRestart.n && afterRestart.born === beforeRestart.born && afterRestart.rd === beforeRestart.rd && afterRestart.ph === beforeRestart.ph, "F3-11 새 sid snap 뒤 원래 rd·ph·born으로 대기 요청 재서명");
  ok((await receive(conn.sent.at(-1).payload)).err === "stale", "F3-2 재시작 중 달 변경은 stale로 거절");
  ui.get().pendingRequests.clear();
  for (let i = 0; i < 33; i++) ui.send("price", { price: 0.1 });
  await ui.get().sending;
  ok(ui.get().pendingRequests.size === 32, "F3-10 팀 대기 요청 상한 32");
  ui.get().pendingRequests.clear();
  const identityBefore = ui.get().identity.privateKey.d;
  ui.close(); ui.teamView({}); const restoredConn = connections.at(-1);
  await restoredConn.emit("snap", await hostWire("snap", C.publicView(S, Date.now()))); await ui.get().sending;
  ok(ui.get().identity.privateKey.d === identityBefore && ui.get().hostKey.x === hostIdentity.publicKey.x, "새로고침에 팀 키·고정 진행자 키 보존");
  const restoredClaim = N.requestBody(restoredConn.sent.at(-1).payload);
  await restoredConn.emit("ack", await hostWire("ack", restoredClaim));
  C.host(S, "kick", 6, team);
  const replacement = await N.createIdentity();
  await receive(await N.signEnvelope(replacement, team, { type: "claim", publicKey: replacement.publicKey, sid: S.sid, seat: S.teams[team].seatVersion }));
  await restoredConn.emit("snap", await hostWire("snap", C.publicView(S, Date.now())));
  ok(ui.get().team === null, "F3-4 kick 직후 새 기기 재착석·seated=true여도 옛 기기 해제");
  for (const err of ["taken", "legacy"]) {
    ui.get().team = team; ui.get().claimAccepted = false; ui.get().claimAfter = 0;
    ui.send("claim"); await ui.get().sending;
    const claimBody = N.requestBody(restoredConn.sent.at(-1).payload);
    await restoredConn.emit("nack", await hostWire("nack", { ...claimBody, err }));
    const count = restoredConn.sent.length;
    [...timers.values()].find(t => t.ms === 5000 && t.interval).fn(); await ui.get().sending;
    ok(ui.get().team === null && !ui.get().claimAccepted && ui.get().claimAfter > Date.now() + 20000 && restoredConn.sent.length === count, "F3-4 " + err + " 자리 선택으로 복귀·claim 지연·토스트 반복 없음");
  }
  ui.close(); cryptoAvailable = false;
  const app = {}; ui.teamView(app);
  ok(app.innerHTML.includes("이 주소에서는 안전한 연결을 만들 수 없어요") && !ui.get(), "WebCrypto 없음: 팀 경고");
  await ui.hostView(app);
  ok(app.innerHTML.includes("이 주소에서는 팀이 앉을 수 없어요"), "WebCrypto 없음: 진행자 경고");
  cryptoAvailable = true;
  ui.teamView({}); const failureConn = connections.at(-1);
  await failureConn.emit("snap", await hostWire("snap", C.publicView(S, Date.now())));
  ui.get().team = team; sessionStorage.fail = true;
  const beforeSend = failureConn.sent.length;
  ui.send("claim"); await ui.get().sending;
  ok(failureConn.sent.length === beforeSend && notices.at(-1).includes("안전한 연결"), "팀 키 저장 실패는 전송 중단");
  sessionStorage.fail = false; ui.close();
  C.host(S, "kick", 7, team);
  localStorage.setItem("kcp-league-host-v1", JSON.stringify({ room, net: { kind: "local" }, state: S, identity: hostIdentity, fingerprint: binding.fingerprint }));
  await ui.hostInit(); const host = connections.at(-1), H = ui.get().S;
  const sign = type => N.signEnvelope(saved.identity, team, { type, publicKey: saved.identity.publicKey, sid: H.sid, seat: H.teams[team].seatVersion });
  await host.emit("req", await sign("claim"));
  const beforeUnsigned = host.sent.length;
  for (let i = 0; i < 8; i++) await host.emit("req", { team, body: JSON.stringify({ team, type: "claim", kid: ownKid, n: saved.identity.n + 1000 + i, sid: H.sid, seat: H.teams[team].seatVersion, publicKey: saved.identity.publicKey }), sig: "invalid" });
  ok(host.sent.length === beforeUnsigned, "F3-3 UI 서명 없는 요청은 서명 nack 방송 없음");
  const writes = localStorage.writes;
  let hello;
  for (let i = 0; i < 10; i++) { hello = await sign("hello"); await host.emit("req", hello); }
  ok(localStorage.writes === writes && [...timers.values()].filter(t => t.ms === 1000 && !t.interval).length === 1, "검증된 요청 10개: 전체 저장은 1초 디바운스 한 번");
  timers.get(ui.get().hostSaveT).fn();
  ok(localStorage.writes === writes + 1 && JSON.parse(localStorage.getItem("kcp-league-host-v1")).state.teams[team].lastN === N.requestBody(hello).n, "디바운스 저장에 마지막 순번 반영");
  dom["lg-host-warning"] = { textContent: "" };
  localStorage.fail = true; ui.flushHost();
  ok(ui.get().saveWarning && dom["lg-host-warning"].textContent.includes("진행을 저장하지 못했어요"), "진행자 저장 실패 경고");
  ui.saveHost(); ok(ui.get().saveWarning, "다시 성공할 때까지 저장 경고 유지");
  localStorage.fail = false; events.pagehide();
  ok(!ui.get().saveWarning && !ui.get().hostSaveT, "pagehide 즉시 저장 성공·경고 해제");
  const storedHost = JSON.parse(localStorage.getItem("kcp-league-host-v1"));
  const link = JSON.parse(Buffer.from(ui.joinLink().split("j=")[1], "base64url").toString());
  ok(link.f === binding.fingerprint && link.r === room, "참가 링크에 132비트 지문 포함");
  ui.close(); await ui.hostInit();
  ok(ui.get().identity.privateKey.d === storedHost.identity.privateKey.d && ui.get().room === room, "진행자 새로고침·이어서 진행에 같은 키·코드");
  ok(ui.get().S.sid !== storedHost.state.sid, "F3-11 진행자 시작마다 새 sid");
  const h2 = connections.at(-1); await h2.emit("req", hello);
  const reply = h2.sent.at(-1).payload;
  ok(reply.event === "nack" && reply.data.err === "session" && reply.data.kid === ownKid && reply.data.n === N.requestBody(hello).n, "진행자 session 거절도 대상 kid·n 포함 서명 nack");
  const failedSid = ui.get().S.sid;
  const lostEnvelope = await N.signEnvelope(saved.identity, team, { type: "price", price: 0.3, sid: failedSid, seat: ui.get().S.teams[team].seatVersion, id: "lost-write" });
  localStorage.fail = true;
  await h2.emit("req", lostEnvelope); ui.flushHost(); ui.close();
  localStorage.fail = false; await ui.hostInit();
  const recovered = connections.at(-1), recoveredRev = ui.get().S.rev;
  await recovered.emit("req", lostEnvelope);
  ok(ui.get().S.sid !== failedSid && ui.get().S.rev === recoveredRev && recovered.sent.at(-1).payload.data.err === "session", "F3-11 저장 실패·재시작 뒤 이전 봉투 반영 금지");
  ui.close();
  const legacy = state("OLD42"); legacy.round = 7;
  localStorage.setItem("kcp-league-host-v1", JSON.stringify({ room: legacy.room, net: { kind: "local" }, state: legacy }));
  await ui.hostInit();
  ok(ui.get().room.length === 8 && ui.get().room !== legacy.room && ui.get().S.round === 7 && ui.get().migration.includes("새 코드로 다시 참가"), "예전 방은 상태 보존·새 키·새 코드·재참가 안내");
  ui.close();
  localStorage.setItem("kcp-league-host-v1", JSON.stringify({ room: "OLD42", net: { kind: "local" }, state: { region: "south" } }));
  await assert.doesNotReject(() => ui.hostView({}), "F3-9 teams 없는 옛 저장 hostView"); checks++;
  ok(ui.get().S.teams && typeof ui.get().S.sid === "string", "F3-9 teams 없는 옛 저장 hostView 복구");
  ui.close();
  localStorage.setItem("kcp-league-host-v1", JSON.stringify({ room, net: { kind: "local" }, identity: hostIdentity, state: { region: "broken", sid: "old" } }));
  await ui.hostInit();
  ok(typeof ui.get().S.sid === "string" && ui.get().S.sid !== "old", "F3-9 검증 실패 새 저장 대체 상태 sid");
  ui.close();
  const priorData = { journal: { fixture: "가상 일지" }, docs: {}, interview: { answer: "가상 답변" } };
  localStorage.setItem("kcp-league-data-v1:OLD42:" + team, JSON.stringify(priorData));
  sessionStorage.setItem("kcp-league-tab-v1", JSON.stringify({ room, net: { kind: "local" }, team, migrationFrom: { room: "OLD42", team } }));
  ui.teamView({}); const migrated = connections.at(-1);
  await migrated.emit("snap", await hostWire("snap", C.publicView(S, Date.now()))); await ui.get().sending;
  const migratedClaim = N.requestBody(migrated.sent.at(-1).payload);
  await migrated.emit("ack", await hostWire("ack", migratedClaim));
  ok(localStorage.getItem("kcp-league-data-v1:" + room + ":" + team) === JSON.stringify(priorData) && localStorage.getItem("kcp-league-data-v1:OLD42:" + team), "F3-9 같은 팀 새 방 참가 때 일지·답변 복사·옛 키 보존");
  ui.close();
  const initial = state("REPLAY", "room"), summaryState = structuredClone(initial);
  summaryState.phase = "end"; summaryState.round = 5;
  // 실제 같은 조건으로 다시 함수의 시작 상태 복원을 검사한다. DOM 시작만 대체한다.
  ui.set({ role: "solo", initial, S: summaryState, snap: C.publicView(summaryState, 0), team, style: "careful", timers: [], app: {}, interview: {} });
  ui.replayFixture(); ui.replaySolo();
  ok(uiK.replayed.state.salt === initial.salt && uiK.replayed.state.seedKey === initial.seedKey && uiK.replayed.state.round === 0, "실제 같은 조건으로 다시 함수는 시작 씨앗·상태 복원");
}

function seeds() {
  const a = state("ROOMA", "room"), b = state("ROOMB", "room"), again = state("ROOMA", "room"), fixed = state("ROOMA", "fixed"), legacy = C.newState("ROOMA", R.id, 0, ids);
  const seed = S => { S.round = 1; return C.runRound(S, BG).seed; };
  const x = seed(a), y = seed(b);
  ok(x !== y, "다른 방 운영 씨앗은 다름");
  ok(seed(again) === x, "같은 방 운영 씨앗은 같음");
  ok(seed(fixed) === 7013 && seed(legacy) === 7013, "fixed·opts 없음: 기존 운영 씨앗 유지");
  ok(seed(JSON.parse(JSON.stringify(a))) === x, "저장 불러오기는 소금 보존");
  ok(a.econ.seed !== b.econ.seed && a.econ.seed === again.econ.seed, "경제 난수도 판 소금으로 재현");
  const fixedOther = state("ROOMB", "fixed");
  fixedOther.round = fixed.round = 1;
  ok(fixed.salt === 0 && fixed.econ.seed === fixedOther.econ.seed, "명시적 fixed는 다른 방에서도 같은 경제 씨앗");
  // 계절 모드는 적합한 사건이 있으면 반드시 뽑는다. 빈 배열 비교를 금지한다.
  for (const S of [a, b, again, fixed, fixedOther]) { delete S.rounds; S.round = 1; C.drawEvents(S, R); }
  ok(a.events.length > 0 && b.events.length > 0 && JSON.stringify(a.events) !== JSON.stringify(b.events), "room 모드: 실제로 뽑힌 사건·크기는 방마다 다름");
  ok(JSON.stringify(a.events) === JSON.stringify(again.events), "같은 판 사건·실제 크기 재현");
  ok(fixed.events.length > 0 && JSON.stringify(fixed.events) === JSON.stringify(fixedOther.events), "fixed 실제 사건도 방과 무관");
  for (const S of [fixed, fixedOther]) { ids.forEach(team => C.reduce(S, { type: "claim", team, token: "solo-city-" + team }, 0, BG)); S.phase = "plan"; C.computerPlans(S, BG, null, "careful"); C.computerPlans(S, BG, null, "careful", true); }
  ok(ids.every(id => JSON.stringify(fixed.teams[id].plan) === JSON.stringify(fixedOther.teams[id].plan)) && JSON.stringify(fixed.ties) === JSON.stringify(fixedOther.ties), "fixed 컴퓨터 도시 계획·연계선 동일");
  const trial = C.trialMods(a, R, ids[0], BG);
  const copy = structuredClone(a); copy.salt++; copy.seedKey = "different"; copy.events = [];
  ok(JSON.stringify(trial) === JSON.stringify(C.trialMods(copy, R, ids[0], BG)), "시험 운전에 숨은 사건·판 소금 미사용");
}
async function measure(oldView, style = "bold") {
  const host = await N.createIdentity();
  let maxSnapshot, maxSize = 0;
  const S = state("SIZE36", "room"), stats = { before: {}, after: {}, builds: 0, research: 0, ties: 0 };
  S.sid = N.sessionId();
  const clock = 1700000000000;
  ids.forEach(id => C.reduce(S, { type: "claim", team: id, token: "solo-city-" + id }, 0, BG));
  async function record(view, maxima, month) {
    const snap = view(S, 1700000000000), signed = await N.signHost(host, "snap", S.room, S.sid, snap), payload = JSON.stringify(signed), local = JSON.stringify({ ev: "snap", data: signed });
    const wire = JSON.stringify(N.broadcastMessage(S.room, "snap", signed, "9999999999", "9999999999"));
    if (Buffer.byteLength(wire) > maxSize) { maxSize = Buffer.byteLength(wire); maxSnapshot = snap; }
    for (const [key, value] of Object.entries({ jsonChars: payload.length, jsonBytes: Buffer.byteLength(payload), localBytes: Buffer.byteLength(local), wireChars: wire.length, wireBytes: Buffer.byteLength(wire) })) if (!maxima[key] || value > maxima[key].value) maxima[key] = { value, month, phase: S.phase };
  }
  for (let month = 1; month <= 36; month++) {
    C.host(S, "next", clock + month * 100);
    C.computerPlans(S, BG, null, style); C.computerPlans(S, BG, null, style, true);
    if (oldView) await record(oldView, stats.before, month);
    await record(C.publicView, stats.after, month);
    const res = C.run(S, BG, clock + month * 100 + 1);
    ok(!!res && S.phase === "review", `6팀 ${month}달 운영`);
    if (oldView) await record(oldView, stats.before, month);
    await record(C.publicView, stats.after, month);
    const view = C.publicView(S, clock + month * 100 + 2);
    ok(view.results.length === month && view.results.every((r, i) => r.round === S.results[i].round && r.region.co2 === S.results[i].region.co2 && ids.every(id => ["outH", "imp", "unsPct"].every(k => r.team[id][k] === S.results[i].team[id][k]))), `${month}달 누적 정전·거래·기록 요약 보존`);
    ok(JSON.stringify(view.results.at(-1)) === JSON.stringify(S.results.at(-1)) && (month < 2 || JSON.stringify(view.results.at(-2)) === JSON.stringify({ ...S.results.at(-2), econ: null })), `${month}달 최근 두 결과 상세 보존`);
    ok(stats.after.wireBytes.value < 180000, `${month}달 실제 봉투 포함 180,000바이트 미만`);
    if (month % 6 === 0) console.log(`size: ${month}/36 months, ${stats.after.wireBytes.value} bytes max`);
  }
  C.host(S, "next", clock + 3700);
  if (oldView) await record(oldView, stats.before, 36);
  await record(C.publicView, stats.after, 36);
  ok(S.phase === "end" && stats.after.wireBytes.value < 180000, "끝 상태도 실제 봉투 포함 180,000바이트 미만");
  stats.builds = ids.reduce((sum, id) => sum + S.teams[id].plan.builds.length, 0);
  stats.research = ids.reduce((sum, id) => sum + Object.keys(S.teams[id].research.stage).length, 0);
  stats.ties = S.ties.filter(t => t.st === "built").length;
  ok(stats.builds > 6 && stats.research > 0 && stats.ties > 0, "건설·연구·연계선을 실제로 사용하는 6팀 조건");
  const sample = [], verifySample = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now(), wire = await N.signHost(host, "snap", S.room, S.sid, maxSnapshot);
    sample.push(performance.now() - start);
    // room 검사는 실제 코드로 별도 검사했다. 최대 크기 자료의 코드도 키에 맞춘다.
    const binding = await N.hostBinding(host.publicKey); wire.room = binding.room; wire.data.room = binding.room;
    const corrected = await N.signHost(host, "snap", binding.room, S.sid, { ...maxSnapshot, room: binding.room });
    const begin = performance.now();
    ok(await N.hostReceiver({ room: binding.room }, () => {})("snap", corrected), "최대 snap 실제 서명·검증");
    verifySample.push(performance.now() - begin);
  }
  const ms = values => ({ mean: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(3), max: +Math.max(...values).toFixed(3) });
  console.log("36달 최대 크기·비용", JSON.stringify({ style, ...stats, signMs: ms(sample), verifyMs: ms(verifySample) }));
  return stats;
}
async function floor3Network() {
  const host = await N.createIdentity(), binding = await N.hostBinding(host.publicKey), S = state(binding.room), team = ids[0], key = await N.createIdentity();
  const sign = request => N.signEnvelope(key, team, { type: "price", price: 0.2, sid: S.sid, seat: 0, ...request });
  let verifies = 0, applied = 0;
  const receive = N.receiver(S, m => { applied++; return C.reduce(S, m, 1, BG); }, async (...args) => { verifies++; return N.verifyEnvelope(...args); });
  await receive(await sign({ type: "claim", publicKey: key.publicKey }));
  const good = await sign({}), old = await sign({ sid: "old-session" }), repeat = await sign({});
  await receive(repeat); const before = verifies;
  for (const wire of [old, good, { ...good, body: "x".repeat(200001) }]) await receive(wire);
  ok(verifies === before, "F3-5 진행자 sid·순번·크기 싼 검사가 검증보다 먼저");
  let unblock, calls = 0;
  const held = N.receiver(S, () => ({ ok: true }), async () => { calls++; await new Promise(r => { unblock = r; }); return false; });
  const wave = Array.from({ length: 60 }, () => held({ ...repeat, body: repeat.body.replace('"n":' + N.requestBody(repeat).n, '"n":' + (N.requestBody(repeat).n + 100)) }));
  let done = false; Promise.all(wave).then(() => { done = true; });
  for (let i = 0; i < 70 && !done; i++) { await new Promise(r => setImmediate(r)); unblock?.(); }
  await Promise.all(wave);
  ok(calls <= 16, "F3-5 진행자 검증 대기열 상한 16");
  const gate = N.replyGate(), kid = await N.fingerprint(key.publicKey);
  const request = { team, kid, n: 1, type: "claim", id: "x".repeat(65), rid: { large: "x".repeat(5000) }, publicKey: key.publicKey, price: "echo" };
  ok(!gate({ request, err: "signature" }) && !gate({ request, err: "bad" }), "F3-3 bad·signature nack 무방송");
  const reply = gate({ request, err: "taken" }, 1);
  ok(reply && !('id' in reply) && !('rid' in reply) && Object.keys(reply).sort().join() === "err,kid,n,team,type", "F3-3 응답 필드 제한·id/rid 64자 상한");
  const limited = [gate({ request, err: "taken" }, 1), gate({ request: { ...request, kid: "f".repeat(64) }, err: "taken" }, 1)];
  ok(limited[0] && !limited[1] && gate({ request, err: "taken" }, 1001), "F3-3 kid 교체 포함 팀별 nack 초당 2개");
  const first = await sign({ id: "once" }); await receive(first);
  for (let i = 0; i < 65; i++) await receive(await sign({ id: "next-" + i }));
  const count = applied, body = N.requestBody(first);
  const replay = await sign({ ...body, n: undefined });
  ok((await receive(replay)).err === "expired" && applied === count, "F3-10 퇴거한 born 이하 요청 재적용 차단");
  const view = C.publicView(S, 1), wire = await N.signHost(host, "snap", S.room, S.sid, view);
  const subtle = crypto.subtle, originalVerify = subtle.verify, originalDigest = subtle.digest;
  let expensive = 0;
  subtle.verify = function (...args) { expensive++; return originalVerify.apply(this, args); };
  subtle.digest = function (...args) { expensive++; return originalDigest.apply(this, args); };
  try {
    const trusted = { room: S.room, sid: S.sid, hostN: wire.n }, receiveHost = N.hostReceiver(trusted, () => {});
    await receiveHost("snap", wire);
    await receiveHost("ack", { ...wire, event: "ack", sid: "wrong", n: wire.n + 1 });
    await receiveHost("snap", { ...wire, n: wire.n + 1, data: { text: "x".repeat(200001) } });
    ok(expensive === 0, "F3-5 팀 sid·순번·크기 싼 검사가 암호 계산보다 먼저");
    let hostCalls = 0;
    const crowded = N.hostReceiver({ room: S.room }, () => { hostCalls++; });
    // 서명 불일치 봉투는 hostN을 올리지 않는다. 따라서 큐 상한 자체를 측정한다.
    const start = expensive;
    await Promise.all(Array.from({ length: 60 }, (_, i) => crowded("snap", { ...wire, n: wire.n + i + 1 })));
    ok(expensive - start <= 32 && hostCalls === 0, "F3-5 팀 검증 대기열 상한 16");
  } finally { subtle.verify = originalVerify; subtle.digest = originalDigest; }
  for (const value of [Infinity, undefined, new String("plan"), NaN]) {
    const valid = await N.signHost(host, "snap", S.room, S.sid, { ...view, probe: value === undefined ? 1 : null });
    valid.data.probe = value;
    ok(!await N.hostReceiver({ room: S.room }, () => {})("snap", valid), "F3-7 JSON 밖 값 거절 " + String(value));
  }
  let normalized;
  const zero = await N.signHost(host, "snap", S.room, S.sid, { ...view, probe: 0 }); zero.data.probe = -0;
  await N.hostReceiver({ room: S.room }, (_, data) => { normalized = data; })("snap", zero);
  ok(normalized && !Object.is(normalized.probe, -0), "F3-7 검증한 정규 JSON 파싱 값을 반영");
  const large = structuredClone(view);
  large.teams[team].hist = Array.from({ length: 400 }, (_, r) => ({ r, detail: "x".repeat(6000) }));
  const stringify = JSON.stringify; let serializations = 0;
  JSON.stringify = function (v, ...args) { if (v?.teams) serializations++; return stringify.call(this, v, ...args); };
  const start = performance.now(); let compact;
  try { compact = N.compactSnapshot(large); } finally { JSON.stringify = stringify; }
  const elapsed = performance.now() - start;
  ok(N.byteLength(compact) <= 178000 && serializations <= 3 && elapsed < 150, "F3-6 부풀린 상태 한 번 축약·목표 이하·반복 직렬화 없음");
  const planned = structuredClone(view);
  planned.teams[team].hist = Array.from({ length: 20 }, (_, r) => ({ r, t: r, cap: r * 2, n: r, l: 0, plan: { builds: [], detail: "x".repeat(10000) } }));
  const summarized = N.compactSnapshot(planned);
  ok(N.byteLength(summarized) <= 178000 && summarized.teams[team].hist.length === 20 && !summarized.teams[team].hist[0].plan && summarized.teams[team].hist[0].cap === 0 && summarized.teams[team].hist.at(-1).plan, "F3-6 오래된 계획 전문은 해당 팀 건설 속도 요약으로 축약");
  console.log("F3 compact", JSON.stringify({ input: N.byteLength(large), output: N.byteLength(compact), ms: +elapsed.toFixed(3), serializations }));
}
function floor3Restore() {
  const S = state("SIZE36", "room");
  ids.forEach(team => C.reduce(S, { type: "claim", team, token: "solo-city-" + team }, 0, BG));
  for (let month = 1; month <= 4; month++) {
    C.host(S, "next", month * 100); C.computerPlans(S, BG, null, "careful"); C.computerPlans(S, BG, null, "careful", true); C.run(S, BG, month * 100 + 1);
    if (month === 1) continue;
    const original = C.publicView(S, month * 100 + 2), restored = N.expandSnapshot(N.compactSnapshot(original));
    ok(ids.some(id => original.teams[id].base.length > 0) && ids.some(id => original.teams[id].trialGrid?.entries.some(e => e.allocatedMW > 0)), "F3-12 실제 운영 " + month + "달 base·계통 배분 비어 있지 않음");
    ok(N.canonical(restored) === N.canonical(original), "F3-12 운영 자료 축약 복원 동일 " + month);
    const id = ids.find(id => original.teams[id].base.some(x => x.k.startsWith("b:"))), plan = structuredClone(original.teams[id].plan);
    plan.builds = [];
    const loss = C.lossOf(original.teams[id].base, plan);
    ok(loss > 0 && C.lossOf(restored.teams[id].base, plan) === loss, "F3-12 철거 손실 보존 " + month);
    ok(N.canonical(C.trialMods(restored, R, id, BG)) === N.canonical(C.trialMods(original, R, id, BG)), "F3-12 시험 운전 배분 보존 " + month);
  }
}

async function main() { await security(); await floor4Network(); await hostSecurity(); await floor3Network(); floor3Restore(); await transport(); await uiProtocol(); seeds(); if (!process.argv.includes("--quick")) { await measure(); await measure(null, "careful"); } console.log(`checks ${checks} fail 0`); }
module.exports = { measure, C, K };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
