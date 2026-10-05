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
  canonical: ["league-net.js", 'bytes(canonical(signed))', 'bytes(JSON.stringify(signed))', "정규 JSON: 재귀 키 섞기"],
  code_binding: ["league-net.js", 'binding.room !== trust.room || ', '', "첫 키도 방 코드와 다르면"],
  link_binding: ["league-net.js", 'trust.fingerprint && binding.fingerprint !== trust.fingerprint ||', 'false ||', "링크 지문 불일치"],
  kid: ["league.js", 'm.kid !== await NET.fingerprint(L.identity.publicKey)', 'false', "위조 nack·다른 kid"],
  sid: ["league-net.js", 'if (!S.sid || m.sid !== S.sid)', 'if (false)', "다른 방 봉투"],
  seat: ["league-net.js", ' || m.seat !== epoch', '', "kick 이전 claim 봉투"],
  retired: ["league-net.js", 'Math.max(T.lastN || 0, T.retired?.[token] || 0)', '(T.lastN || 0)', "같은 키 재착석도 retired"],
  debounce: ["league.js", 'L.hostSaveT = setTimeout(() => { if (L?.role === "host") flushHost(); }, 1000);', 'flushHost();', "전체 저장은 1초 디바운스"],
  ai: ["league-ai.js", '${S.seedKey ?? S.room}:', '${S.room}:', "fixed 컴퓨터 도시 계획"],
  trim: ["league-net.js", 'while (bytes(view).length > 178000)', 'while (false)', "크기 위험 시 오래된 팀 기록"],
};
if (process.env.F2_MUTATION) {
  const [file, from, to] = mutations[process.env.F2_MUTATION];
  const read = fs.readFileSync;
  fs.readFileSync = function (name, ...args) {
    const value = read.call(this, name, ...args);
    if (typeof value === "string" && String(name).endsWith("/ui/" + file)) {
      assert.ok(value.includes(from), "변형 대상 없음: " + file);
      return value.replaceAll(from, to);
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
  for (const needle of [a.publicKey.x, a.publicKey.y, a.privateKey.d, S.teams[team].token, high.sig, '"publicKey"', '"privateKey"', '"sig"', '"token"', '"lastN"']) ok(!secret.includes(needle), "공개 상태에서 인증 자료 제외: " + needle.slice(0, 12));
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
  ok(results[0].ok && !results[1].ok && results[2].ok, "뒤섞인 동시 도착: 단조 증가 순번만 반영");
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
async function hostSecurity() {
  const host = await N.createIdentity(), attacker = await N.createIdentity(), binding = await N.hostBinding(host.publicKey);
  ok(/^[A-Z2-9]{6}$/.test(binding.room) && binding.fingerprint.length === 22, "공개 키에서 6자리 방 코드·22자 지문 파생");
  const keyShuffle = value => Array.isArray(value) ? value.map(keyShuffle) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().reverse().map(k => [k, keyShuffle(value[k])])) : value;
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
  let notices = [], cryptoAvailable = true, timerId = 0;
  const net = { ...N, secure: () => cryptoAvailable, open() {
    const handlers = {}, sent = [], conn = { sent, on: (event, fn) => { handlers[event] = fn; }, onStatus() {}, close() {}, send: (event, payload) => { sent.push({ event, payload }); return true; }, emit: (event, payload) => handlers[event]?.(payload) };
    connections.push(conn); return conn;
  } };
  const uiK = { ...K, leagueNet: net, buildGame: { ...BG, toast: text => notices.push(text) }, route() {}, on() {} };
  const context = { window: { KCP: uiK, localStorage, sessionStorage, addEventListener: (e, fn) => { events[e] = fn; } }, document: { getElementById: id => dom[id] || null, addEventListener() {} }, location: { hash: "#league/team", origin: "https://fixture", pathname: "/" }, setInterval: () => 1, clearInterval() {}, setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id), structuredClone, TextEncoder, Date, console, queueMicrotask, btoa, atob };
  const source = fs.readFileSync(path.resolve(__dirname, "../../ui/league.js"), "utf8");
  vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, `
    renderHost = () => {}; mountCity = () => {}; seatPicker = () => {}; renderPanel = () => {};
    KCP.secUI = { send, teamSave, teamView, hostView, hostInit, close, saveHost, flushHost, joinLink, replaySolo,
      replayFixture: () => { startSolo = (app, save) => { KCP.replayed = save; }; },
      set: value => { L = value; }, get: () => L };
  })();`), context);
  const ui = uiK.secUI, team = ids[0], hostIdentity = await N.createIdentity(), binding = await N.hostBinding(hostIdentity.publicKey), room = binding.room;
  const S = state(room), hostWire = (event, data) => N.signHost(hostIdentity, event, room, S.sid, data);
  const old = { room, team, net: { kind: "local" }, token: "legacy-seat" };
  sessionStorage.setItem("kcp-league-tab-v1", JSON.stringify(old));
  ui.teamView({}); const conn = connections.at(-1);
  await conn.emit("snap", await hostWire("snap", C.publicView(S, Date.now()))); await ui.get().sending;
  const first = conn.sent.at(-1).payload, saved = JSON.parse(sessionStorage.getItem("kcp-league-tab-v1"));
  ok(saved.identity?.privateKey?.d && !Object.hasOwn(saved, "token") && await N.verifyEnvelope(first, saved.identity.publicKey), "옛 팀 저장: 진행자 검증 후 새 키 claim");
  ok(!JSON.stringify(first).includes(saved.identity.privateKey.d) && !JSON.stringify(first).includes(old.token), "UI 전송에 개인 키·옛 토큰 없음");
  const receive = N.receiver(S, m => C.reduce(S, m, 1, BG));
  ok((await receive(first)).ok, "UI claim을 진행자 실제 검증·reduce로 반영");
  await conn.emit("ack", await hostWire("ack", { ...N.requestBody(first) }));
  await conn.emit("snap", await hostWire("snap", C.publicView(S, Date.now())));
  const phase = ui.get().snap.phase;
  const fake = C.publicView(S, Date.now()); fake.phase = "end"; fake.teams[team].seated = false;
  dom["lg-conn"] = { textContent: "", dataset: {} };
  await conn.emit("snap", fake);
  ok(ui.get().snap.phase === phase && ui.get().team === team && ui.get().hostWarning && dom["lg-conn"].textContent === "진행자 화면과 연결을 확인하는 중", "무서명 snap 거절·연결 확인 상태");
  const evil = await N.createIdentity();
  await conn.emit("snap", await N.signHost(evil, "snap", room, S.sid, fake));
  ok(ui.get().snap.phase === phase, "공격자 키로 서명한 snap 거절");
  const badNack = { team, type: "claim", err: "taken", kid: await N.fingerprint(evil.publicKey), n: N.requestBody(first).n };
  await conn.emit("nack", badNack);
  await conn.emit("nack", await hostWire("nack", badNack));
  ok(ui.get().team === team && notices.length === 0, "위조 nack·다른 kid의 서명된 nack 무시");
  const ownKid = await N.fingerprint(saved.identity.publicKey);
  await conn.emit("nack", await hostWire("nack", { ...badNack, kid: ownKid, err: "legacy" }));
  ok(ui.get().team === team && notices.at(-1).includes("진행자에게 이 팀 자리 비우기"), "옛 토큰 자리 안내, nack은 자리를 풀지 않음");
  for (const err of ["signature", "replay", "seat"]) await conn.emit("nack", await hostWire("nack", { ...badNack, kid: ownKid, err }));
  ok(ui.get().team === team, "signature/replay/seat nack은 자리 유지");
  ui.send("price", { price: 0.2 }); await ui.get().sending;
  const request = N.requestBody(conn.sent.at(-1).payload);
  for (let i = 0; i < 4; i++) {
    const latest = N.requestBody(conn.sent.at(-1).payload);
    await conn.emit("nack", await hostWire("nack", { ...latest, err: i % 2 ? "stale" : "replay", current: { rd: S.round, ph: S.phase } }));
    await ui.get().sending;
  }
  const attempts = conn.sent.map(x => N.requestBody(x.payload)).filter(m => m.id === request.id);
  ok(attempts.length === 4 && attempts.every((m, i) => !i || m.n > attempts[i - 1].n) && !ui.get().pendingRequests.size, "요청 id별 replay/stale 새 순번 최대 3회 재전송");
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
  const identityBefore = ui.get().identity.privateKey.d;
  ui.close(); ui.teamView({}); const restoredConn = connections.at(-1);
  await restoredConn.emit("snap", await hostWire("snap", C.publicView(S, Date.now()))); await ui.get().sending;
  ok(ui.get().identity.privateKey.d === identityBefore && ui.get().hostKey.x === hostIdentity.publicKey.x, "새로고침에 팀 키·고정 진행자 키 보존");
  C.host(S, "kick", 6, team);
  await restoredConn.emit("snap", await hostWire("snap", C.publicView(S, Date.now())));
  ok(ui.get().team === null, "서명 snap의 seated=false·seatVersion 변경만 자리 해제");
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
  localStorage.setItem("kcp-league-host-v1", JSON.stringify({ room, net: { kind: "local" }, state: S, identity: hostIdentity, fingerprint: binding.fingerprint }));
  await ui.hostInit(); const host = connections.at(-1), H = ui.get().S;
  const sign = type => N.signEnvelope(saved.identity, team, { type, publicKey: saved.identity.publicKey, sid: H.sid, seat: H.teams[team].seatVersion });
  await host.emit("req", await sign("claim"));
  const writes = localStorage.writes;
  let hello;
  for (let i = 0; i < 10; i++) { hello = await sign("hello"); await host.emit("req", hello); }
  ok(localStorage.writes === writes && [...timers.values()].filter(t => t.ms === 1000).length === 1, "검증된 요청 10개: 전체 저장은 1초 디바운스 한 번");
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
  const h2 = connections.at(-1); await h2.emit("req", hello);
  const reply = h2.sent.at(-1).payload;
  ok(reply.event === "nack" && reply.data.err === "replay" && reply.data.kid === ownKid && reply.data.n === N.requestBody(hello).n, "진행자 replay 거절도 대상 kid·n 포함 서명 nack");
  ui.close();
  const legacy = state("OLD42"); legacy.round = 7;
  localStorage.setItem("kcp-league-host-v1", JSON.stringify({ room: legacy.room, net: { kind: "local" }, state: legacy }));
  await ui.hostInit();
  ok(ui.get().room.length === 6 && ui.get().room !== legacy.room && ui.get().S.round === 7 && ui.get().migration.includes("새 코드로 다시 참가"), "예전 방은 상태 보존·새 키·새 코드·재참가 안내");
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
async function main() { await security(); await hostSecurity(); await transport(); await uiProtocol(); seeds(); if (!process.argv.includes("--quick")) { await measure(); await measure(null, "careful"); } console.log(`checks ${checks} fail 0`); }
module.exports = { measure, C, K };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
