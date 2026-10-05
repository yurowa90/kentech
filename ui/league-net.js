/* 멀티플레이 연결. 모두 같은 모양: open(opts) → { send(ev, data), on(ev, fn), status(), onStatus(fn), close() }
 * - local: 같은 브라우저의 탭끼리(BroadcastChannel). 교사 PC 한 대에서 시연·연습할 때, 검사할 때.
 * - supabase: Supabase Realtime의 Broadcast(서버에 저장하지 않는 실시간 중계). 태블릿마다 다른 기기일 때.
 *   라이브러리 없이 Phoenix 웹소켓 규약(vsn 1.0.0)을 직접 쓴다 — 앱에 외부 스크립트를 들이지 않기 위해(D-31).
 *   필요한 것: 프로젝트 주소(ref 또는 https://<ref>.supabase.co)와 공개(publishable/anon) 키. 학생 개인정보는 보내지 않는다.
 * 메시지는 모두 받는 쪽에서 믿지 않고 검사한다(league-core.reduce).
 */
(function () {
  "use strict";
  const KCP = window.KCP;
  if (!KCP) return;
  const MAX_BYTES = 200000;

  const bytes = value => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
  const secure = () => !!globalThis.crypto?.subtle;
  const algorithm = { name: "ECDSA", namedCurve: "P-256" };
  const signing = { name: "ECDSA", hash: "SHA-256" };
  function publicJWK(key) {
    if (!key || key.kty !== "EC" || key.crv !== "P-256" || typeof key.x !== "string" || typeof key.y !== "string" || key.d != null) throw new Error("key");
    return { kty: "EC", crv: "P-256", x: key.x, y: key.y };
  }
  async function createIdentity() {
    const pair = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
    return { publicKey: publicJWK(await crypto.subtle.exportKey("jwk", pair.publicKey)), privateKey: await crypto.subtle.exportKey("jwk", pair.privateKey), n: 0 };
  }
  async function fingerprint(key) {
    const digest = await crypto.subtle.digest("SHA-256", bytes(publicJWK(key)));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  }
  // JSON 값만 서명한다. 객체 키 재정렬·1.0 → 1·-0 → 0은 같은 바이트가 된다.
  function canonical(value) {
    const encode = v => Array.isArray(v) ? "[" + v.map(encode).join(",") + "]" :
      v && typeof v === "object" ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + encode(v[k])).join(",") + "}" : JSON.stringify(v);
    return encode(JSON.parse(JSON.stringify(value)));
  }
  const sessionId = () => crypto.randomUUID();
  async function hostBinding(key) {
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(canonical(publicJWK(key)))));
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // 32글자, 6자리 = 30비트
    const bits = Array.from(hash.slice(0, 4), b => b.toString(2).padStart(8, "0")).join("");
    const room = Array.from({ length: 6 }, (_, i) => alphabet[parseInt(bits.slice(i * 5, i * 5 + 5), 2)]).join("");
    return { room, fingerprint: btoa(String.fromCharCode(...hash)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 22) };
  }
  // base의 키·비용과 trialGrid 배분은 모두 필요하다. 전송에서만 반복 필드명을 없앤다.
  function compactSnapshot(data) {
    const view = structuredClone(data);
    for (const t of Object.values(view.teams)) {
      if (t.base) { t.baseRows = t.base.map(({ k, c }) => [k, c]); delete t.base; }
      if (t.trialGrid?.entries) {
        t.trialGrid.rows = t.trialGrid.entries.map(({ key, allocatedMW }) => [key, allocatedMW]);
        delete t.trialGrid.entries;
      }
    }
    // 화면은 팀 hist의 마지막 행만 읽는다. 큰 판은 오래된 행부터 줄이며 마지막 둘은 남긴다.
    while (bytes(view).length > 178000) {
      const t = Object.values(view.teams).filter(t => t.hist?.length > 2).sort((a, b) => b.hist.length - a.hist.length)[0];
      if (!t) break;
      t.hist.shift();
    }
    return view;
  }
  function expandSnapshot(view) {
    for (const t of Object.values(view.teams || {})) {
      if (t.baseRows) { t.base = t.baseRows.map(([k, c]) => ({ k, c })); delete t.baseRows; }
      if (t.trialGrid?.rows) {
        t.trialGrid.entries = t.trialGrid.rows.map(([key, allocatedMW]) => ({ key, allocatedMW }));
        delete t.trialGrid.rows;
      }
    }
    return view;
  }
  async function signHost(identity, event, room, sid, data) {
    identity.n = Math.max(Date.now(), (identity.n || 0) + 1);
    const wire = { event, room, sid, n: identity.n, data: event === "snap" ? compactSnapshot(data) : data, hostKey: identity.publicKey };
    const key = await crypto.subtle.importKey("jwk", identity.privateKey, algorithm, false, ["sign"]);
    wire.sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign(signing, key, bytes(canonical(wire))))));
    return wire;
  }
  function hostReceiver(trust, apply, rejected = () => {}) {
    let chain = Promise.resolve();
    return (event, incoming) => {
      const wire = structuredClone(incoming);
      const work = async () => {
        try {
          const { sig, ...signed } = wire || {};
          if (wire.event !== event || wire.room !== trust.room || typeof wire.sid !== "string" || !Number.isSafeInteger(wire.n)) throw Error("host");
          const binding = await hostBinding(wire.hostKey);
          if (binding.room !== trust.room || trust.fingerprint && binding.fingerprint !== trust.fingerprint ||
              trust.hostKey && canonical(publicJWK(trust.hostKey)) !== canonical(publicJWK(wire.hostKey))) throw Error("host");
          const key = await crypto.subtle.importKey("jwk", publicJWK(wire.hostKey), algorithm, false, ["verify"]);
          if (!await crypto.subtle.verify(signing, key, Uint8Array.from(atob(sig), c => c.charCodeAt(0)), bytes(canonical(signed)))) throw Error("host");
          if (trust.sid && wire.sid !== trust.sid || wire.n <= (trust.hostN || 0)) return false;
          if (event === "snap" && (wire.data?.sid !== wire.sid || wire.data?.room !== trust.room)) throw Error("host");
          trust.hostKey = publicJWK(wire.hostKey); trust.fingerprint = binding.fingerprint;
          trust.sid = wire.sid; trust.hostN = wire.n;
          await apply(event, wire.data);
          return true;
        } catch (_) { rejected(event); return false; }
      };
      chain = chain.then(work);
      return chain;
    };
  }
  // body 문자열 자체를 서명한다. 봉투 객체의 키 순서와 바깥 메타데이터는 인증 근거가 아니다.
  async function signEnvelope(identity, team, request, now = Date.now()) {
    identity.n = Math.max(now, (identity.n || 0) + 1);
    const body = JSON.stringify({ ...request, team, kid: await fingerprint(identity.publicKey), n: identity.n });
    const key = await crypto.subtle.importKey("jwk", identity.privateKey, algorithm, false, ["sign"]);
    const sig = await crypto.subtle.sign(signing, key, bytes(body));
    return { team, body, sig: btoa(String.fromCharCode(...new Uint8Array(sig))) };
  }
  async function verifyEnvelope(envelope, publicKey) {
    try {
      if (typeof envelope?.body !== "string" || typeof envelope.sig !== "string") return false;
      const key = await crypto.subtle.importKey("jwk", publicJWK(publicKey), algorithm, false, ["verify"]);
      return await crypto.subtle.verify(signing, key, Uint8Array.from(atob(envelope.sig), c => c.charCodeAt(0)), bytes(envelope.body));
    } catch (_) { return false; }
  }
  function requestBody(envelope) {
    try { return JSON.parse(envelope.body); } catch (_) { return null; }
  }
  // 팀별로 검증과 반영을 한 사슬에서 실행한다. apply에는 검증된 값만 들어간다.
  function receiver(S, apply, verify = verifyEnvelope) {
    const chains = new Map();
    return envelope => {
      const team = envelope?.team;
      if (typeof team !== "string" || !Object.hasOwn(S.teams, team)) return Promise.resolve({ ok: false, err: "bad" });
      const wire = { team, body: envelope.body, sig: envelope.sig };
      const work = async () => {
        const m = requestBody(wire), T = S.teams[team];
        if (!m || m.team !== team || typeof m.type !== "string" || !Number.isSafeInteger(m.n) || m.n <= 0 || bytes(wire.body).length > MAX_BYTES) return { ok: false, err: "bad" };
        const claim = m.type === "claim", epoch = T.seatVersion || 0;
        const reject = err => ({ ok: false, err, request: m });
        const key = claim ? m.publicKey : T.publicKey;
        if (!key || !await verify(wire, key)) return reject("signature");
        const token = await fingerprint(key);
        if (m.kid !== token) return reject("signature");
        if (!S.sid || m.sid !== S.sid) return reject("session");
        if ((T.seatVersion || 0) !== epoch || m.seat !== epoch) return reject("seat");
        if (claim && T.token && (T.token !== token || !T.publicKey)) return reject(T.publicKey ? "taken" : "legacy");
        if (!claim && (!T.publicKey || T.token !== token)) return reject("seat");
        if (m.n <= Math.max(T.lastN || 0, T.retired?.[token] || 0)) return reject("replay");
        T.lastN = m.n;
        // 같은 요청 id를 새 순번으로 재전송해도 거래·연구를 두 번 적용하지 않는다.
        const cached = typeof m.id === "string" && T.receipts?.find(x => x.id === m.id && x.kid === token);
        if (cached) return { ...cached.result, quiet: true, request: m, verified: true };
        const trusted = { ...m, token };
        if (claim) trusted.publicKey = publicJWK(key);
        const result = apply(trusted);
        if (typeof m.id === "string" && m.id.length <= 64 && result.err !== "stale") {
          T.receipts = [...(T.receipts || []), { id: m.id, kid: token, result }].slice(-64);
        }
        return { ...result, request: m, verified: true };
      };
      const next = (chains.get(team) || Promise.resolve()).then(work).catch(() => ({ ok: false, err: "bad" }));
      chains.set(team, next);
      return next;
    };
  }
  function broadcastMessage(room, ev, data, ref = "1", joinRef = "1") {
    return { topic: "realtime:kcp-league-" + room, event: "broadcast", payload: { type: "broadcast", event: ev, payload: data }, ref, join_ref: joinRef };
  }

  function hub() {
    const fns = new Map(), sfns = [];
    let st = "connecting";
    return {
      on(ev, fn) { if (!fns.has(ev)) fns.set(ev, []); fns.get(ev).push(fn); },
      fire(ev, data) { (fns.get(ev) || []).forEach(fn => { try { fn(data); } catch (e) { console.warn(e); } }); },
      onStatus(fn) { sfns.push(fn); fn(st); },
      set(s) { if (s !== st) { st = s; sfns.forEach(fn => fn(s)); } },
      get status() { return st; }
    };
  }

  function local(room) {
    const H = hub();
    if (typeof BroadcastChannel !== "function") { H.set("error"); return { send() {}, on: H.on, onStatus: H.onStatus, status: () => H.status, close() {} }; }
    const ch = new BroadcastChannel("kcp-league-" + room);
    ch.onmessage = e => { const m = e.data; if (m && typeof m.ev === "string") H.fire(m.ev, m.data); };
    setTimeout(() => H.set("open"), 0);
    return {
      kind: "local",
      send(ev, data) { if (bytes({ ev, data }).length > MAX_BYTES) { H.fire("oversize", { ev }); return false; } try { ch.postMessage({ ev, data }); return true; } catch (e) { console.warn(e); return false; } },
      on: H.on, onStatus: H.onStatus, status: () => H.status,
      close() { ch.close(); H.set("closed"); }
    };
  }

  // 프로젝트 주소 → 웹소켓 주소. 검사용으로 ws://… 전체 주소도 받는다.
  function wsUrl(url, key) {
    let base = String(url || "").trim();
    if (/^wss?:\/\//.test(base)) return base + (base.includes("?") ? "&" : "?") + "apikey=" + encodeURIComponent(key) + "&vsn=1.0.0";
    if (/^[a-z0-9]{20}$/.test(base)) base = "https://" + base + ".supabase.co";
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(base)) return null;
    return base.replace(/^https/, "wss").replace(/\/$/, "") + "/realtime/v1/websocket?apikey=" + encodeURIComponent(key) + "&vsn=1.0.0";
  }

  function supabase(room, url, key, canSend = () => true) {
    const H = hub(), topic = "realtime:kcp-league-" + room, addr = wsUrl(url, key);
    let ws = null, ref = 0, joinRef = null, hb = 0, retry = 0, closed = false, joined = false, timer = 0;
    const queue = [];
    if (!addr || !key) { H.set("error"); return { kind: "supabase", send() {}, on: H.on, onStatus: H.onStatus, status: () => H.status, close() {} }; }
    const raw = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
    function enqueue(m) {
      const p = m.payload, d = p.payload;
      if (p.event === "req" && d) {
        // 연계선·사건은 대상별 최신값을 남겨 다른 협상까지 지우지 않는다.
        const body = requestBody(d);
        const i = queue.findIndex(q => {
          const old = requestBody(q.payload.payload);
          return q.payload.event === p.event && body && old && q.payload.payload.team === d.team &&
            old.type === body.type && old.other === body.other && old.ev === body.ev && old.id === body.id;
        });
        if (i >= 0) queue.splice(i, 1);
      }
      queue.push(m); if (queue.length > 50) queue.shift();
    }
    function flush() {
      if (!joined) return;
      for (let i = 0; i < queue.length;) {
        const m = queue[i];
        if (!canSend(m.payload.event, m.payload.payload)) { i++; continue; }
        queue.splice(i, 1); m.join_ref = joinRef; raw(m);
      }
    }
    function join() {
      joinRef = String(++ref);
      const payload = { config: { broadcast: { self: false, ack: false }, presence: { key: "", enabled: false }, postgres_changes: [], private: false } };
      if (/^eyJ/.test(key)) payload.access_token = key; // 예전 anon 키(JWT)만. 새 publishable 키는 주소의 apikey로 충분하다.
      raw({ topic, event: "phx_join", payload, ref: joinRef, join_ref: joinRef });
    }
    function connect() {
      if (closed) return;
      H.set(retry ? "reconnecting" : "connecting");
      try { ws = new WebSocket(addr); } catch (e) { H.set("error"); schedule(); return; }
      ws.onopen = () => { retry = 0; join(); clearInterval(hb); hb = setInterval(() => raw({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++ref) }), 25000); };
      ws.onmessage = e => {
        let m;
        try { m = JSON.parse(e.data); } catch (x) { return; }
        if (!m || m.topic !== topic) return;
        if (m.event === "phx_reply" && m.ref === joinRef) {
          if (m.payload && m.payload.status === "ok") { joined = true; H.set("open"); flush(); }
          else { H.set("error"); }
          return;
        }
        if (m.event === "phx_error" || m.event === "phx_close") { joined = false; H.set("reconnecting"); setTimeout(join, 1000); return; }
        if (m.event === "broadcast" && m.payload && typeof m.payload.event === "string") H.fire(m.payload.event, m.payload.payload);
      };
      ws.onclose = () => { joined = false; clearInterval(hb); if (!closed) { H.set("reconnecting"); schedule(); } };
      ws.onerror = () => {};
    }
    function schedule() { clearTimeout(timer); retry++; timer = setTimeout(connect, Math.min(15000, 500 * 2 ** Math.min(retry, 5))); }
    connect();
    return {
      kind: "supabase",
      send(ev, data) {
        const m = broadcastMessage(room, ev, data, String(++ref), joinRef);
        if (bytes(m).length > MAX_BYTES) { H.fire("oversize", { ev }); return false; }
        enqueue(m); flush(); return true;
      },
      flush,
      on: H.on, onStatus: H.onStatus, status: () => H.status,
      close() { closed = true; clearInterval(hb); clearTimeout(timer); if (ws) try { ws.close(); } catch (e) { /* 이미 닫힘 */ } H.set("closed"); }
    };
  }

  KCP.leagueNet = {
    open(o) { return o && o.kind === "supabase" ? supabase(o.room, o.url, o.key, o.canSend) : local(o.room); },
    compactSnapshot, expandSnapshot, canonical, sessionId, hostBinding, signHost, hostReceiver,
    wsUrl, secure, createIdentity, fingerprint, signEnvelope, verifyEnvelope, requestBody, receiver, broadcastMessage, byteLength: value => bytes(value).length
  };
})();
