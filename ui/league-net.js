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
      send(ev, data) { try { ch.postMessage({ ev, data }); } catch (e) { console.warn(e); } },
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
        const i = queue.findIndex(q => q.payload.event === p.event && q.payload.payload?.type === d.type &&
          q.payload.payload.team === d.team && q.payload.payload.token === d.token &&
          q.payload.payload.other === d.other && q.payload.payload.ev === d.ev);
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
        const m = { topic, event: "broadcast", payload: { type: "broadcast", event: ev, payload: data }, ref: String(++ref), join_ref: joinRef };
        if (JSON.stringify(m).length > MAX_BYTES) { console.warn("league: message too large", ev); return; }
        enqueue(m); flush();
      },
      flush,
      on: H.on, onStatus: H.onStatus, status: () => H.status,
      close() { closed = true; clearInterval(hb); clearTimeout(timer); if (ws) try { ws.close(); } catch (e) { /* 이미 닫힘 */ } H.set("closed"); }
    };
  }

  KCP.leagueNet = {
    open(o) { return o && o.kind === "supabase" ? supabase(o.room, o.url, o.key, o.canSend) : local(o.room); },
    wsUrl
  };
})();
