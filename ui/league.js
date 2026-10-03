/* 멀티플레이 리그 화면: #league(로비) · #league/host(진행자 판) · #league/team(팀 = 도시 건설 화면 + 리그 띠)
 * 진행자 기기가 규칙(league-core)으로 상태를 정하고 4초마다·바뀔 때마다 모두에게 알린다. 팀 기기는 자기 도시만 짓고
 * 계획·판매 단가·연계선 요청을 보낸다. 학생 이름은 받지 않는다(팀 = 도시).
 */
(function () {
  "use strict";
  const KCP = window.KCP;
  if (!KCP || typeof KCP.route !== "function" || !KCP.leagueCore || !KCP.leagueNet || !KCP.buildGame) return;
  const C = KCP.leagueCore, NET = KCP.leagueNet, BG = KCP.buildGame, esc = KCP.esc;
  const REGION = "south";
  // K_TEAM: 이 기기에서 마지막으로 쓴 팀(이어서 하기). K_TAB(sessionStorage): 이 탭의 팀·토큰 — 한 PC에서 탭 여러 개로 시연해도 섞이지 않게.
  // 팀 자료(건설·일지)는 방·팀마다 따로: K_DATA + ":" + 방 + ":" + 팀
  const K_NET = "kcp-league-net-v1", K_HOST = "kcp-league-host-v1", K_TEAM = "kcp-league-team-v1", K_TAB = "kcp-league-tab-v1", K_DATA = "kcp-league-data-v1";
  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const SEASON_NAME = { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" };
  const PHASE_NAME = { lobby: "준비", plan: "계획·협상", run: "운영 중", review: "결과·일지", end: "끝" };
  const JQ = [
    { k: "why", q: "우리 도시는 무엇을, 왜 지었나요?" },
    { k: "nb", q: "우리 선택이 이웃 도시에 준 영향은?" },
    { k: "next", q: "다음 라운드에 바꿀 것 하나와 이유" }
  ];
  const store = {
    get(k) { try { return JSON.parse(window.localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 없이도 진행 */ } },
    del(k) { try { window.localStorage.removeItem(k); } catch (e) { /* 무시 */ } }
  };
  const tab = {
    get() { try { return JSON.parse(window.sessionStorage.getItem(K_TAB)); } catch (e) { return null; } },
    set(v) { try { window.sessionStorage.setItem(K_TAB, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
  };
  const dataKey = () => `${K_DATA}:${L.room}:${L.team}`;
  const tdata = () => { const d = store.get(dataKey()) || {}; d.docs = d.docs || {}; d.journal = d.journal || {}; return d; };
  const R = () => C.regionOf(REGION);
  // 이 방에 참가한 도시(2~6곳). 상태 S나 공개 상태 V 둘 다 받는다.
  const actT = X => { const ids = X && Array.isArray(X.active) && X.active.length ? X.active : X && X.teams ? Object.keys(X.teams) : R().teams.map(t => t.id); return R().teams.filter(t => ids.includes(t.id)); };
  const teamName = id => (C.teamDef(R(), id) || { name: id }).name;
  const teamCol = id => (C.teamDef(R(), id) || { color: "#888" }).color;
  const fmt = (x, d = 0) => (typeof x === "number" && isFinite(x) ? x.toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: 0 }) : "–");
  const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const code = n => Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
  const validRoom = r => typeof r === "string" && /^[A-Z2-9]{4,6}$/.test(r);
  const netCfg = () => store.get(K_NET) || { kind: "local", url: "", key: "" };
  const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

  let L = null; // { role, room, net, conn, S?(진행자 상태), snap?(받은 공개 상태), team?, token?, timers[] }
  function close() {
    if (!L) return;
    L.timers.forEach(t => clearInterval(t));
    if (L.conn) L.conn.close();
    L = null;
  }
  KCP.on("route:change", ({ name, arg }) => {
    if (name !== "league") { close(); return; }
    if (L && L.role === "host" && arg !== "host" && !/^view\//.test(arg || "")) close();
    if (L && L.role === "host") L.viewing = /^view\//.test(arg || "") ? arg.slice(5) : null;
    if (L && L.role === "team" && !/^team/.test(arg)) close();
  });

  /* ================= 로비 ================= */
  function lobby(app, joinArg) {
    let pre = null;
    if (joinArg) { try { pre = JSON.parse(b64d(joinArg)); } catch (e) { pre = null; } }
    if (pre && pre.n && pre.n.kind === "supabase") store.set(K_NET, { kind: "supabase", url: String(pre.n.url || ""), key: String(pre.n.key || "") });
    const net = netCfg(), hostSave = store.get(K_HOST), lastTeam = store.get(K_TEAM);
    const reg = R();
    app.innerHTML = `
      <main class="lg-lobby">
        <header class="lg-lhead">
          <a class="lg-back" href="#home">← 연습실 홈</a>
          <p class="v2-kicker">GRID TYCOON · ${esc(reg.short)}</p>
          <h1>${esc(reg.name)} 전력 리그</h1>
          <p class="lg-sub">6팀이 도시 하나씩 맡아 전력망을 짓고, 남는 전기를 이웃과 사고팝니다. 계절마다 한 라운드.</p>
          <ul class="lg-cities">${reg.teams.map(t => `<li style="--c:${t.color}">${esc(t.name)}</li>`).join("")}</ul>
        </header>
        <section class="lg-cards">
          <article class="lg-card">
            <h2>팀으로 참가</h2>
            <label class="lg-field"><span>방 코드</span><input id="lg-code" inputmode="text" autocomplete="off" maxlength="6" value="${esc(pre && validRoom(pre.r) ? pre.r : "")}" placeholder="예: K7QH2" aria-describedby="lg-code-h"></label>
            <p class="lg-hint" id="lg-code-h">진행자 화면에 보이는 4~6글자</p>
            <button type="button" class="v2-btn primary lg-big" id="lg-join">참가하기</button>
            ${lastTeam && validRoom(lastTeam.room) && lastTeam.team ? `<button type="button" class="v2-btn lg-big" id="lg-rejoin">이어서: ${esc(teamName(lastTeam.team))} 팀 · 방 ${esc(lastTeam.room)}</button>` : ""}
          </article>
          <article class="lg-card">
            <h2>진행자(교사)</h2>
            <p class="lg-hint">방을 만들고 라운드를 넘깁니다. 프로젝터에 띄우기 좋은 화면입니다.</p>
            <fieldset class="lg-pick">
              <legend>참가 도시 <b id="lg-pickn"></b></legend>
              <div class="lg-presets" role="group" aria-label="인원별 추천">${[2, 3, 4, 5, 6].map(n => `<button type="button" class="lg-preset" data-preset="${n}" aria-pressed="${n === 6}">${n}팀</button>`).join("")}</div>
              <div class="lg-pickc">${reg.teams.map(t => { const must = (reg.must || []).includes(t.id); return `<label class="lg-pickcity" style="--c:${t.color}"><input type="checkbox" value="${t.id}" checked ${must ? "disabled" : ""}><span>${esc(t.name)}${must ? " <small>필수</small>" : ""}</span></label>`; }).join("")}</div>
              <p class="lg-hint" id="lg-pickmsg">평택은 꼭 들어가고, 고른 도시끼리 이웃해야 합니다.</p>
            </fieldset>
            <button type="button" class="v2-btn primary lg-big" id="lg-host">새 방 만들기</button>
            ${hostSave && validRoom(hostSave.room) ? `<button type="button" class="v2-btn lg-big" id="lg-rehost">이어서 진행: 방 ${esc(hostSave.room)}</button>` : ""}
          </article>
        </section>
        <details class="lg-net" ${net.kind === "supabase" ? "open" : ""}>
          <summary>연결 방식: <b id="lg-net-now">${net.kind === "supabase" ? "온라인(태블릿마다)" : "이 기기(탭끼리)"}</b></summary>
          <fieldset class="lg-radio">
            <legend class="lg-sr">연결 방식</legend>
            <label><input type="radio" name="lg-net" value="local" ${net.kind !== "supabase" ? "checked" : ""}> 이 기기(같은 브라우저의 탭끼리 — 시연·연습)</label>
            <label><input type="radio" name="lg-net" value="supabase" ${net.kind === "supabase" ? "checked" : ""}> 온라인(Supabase Realtime — 태블릿마다)</label>
          </fieldset>
          <div class="lg-sb" ${net.kind === "supabase" ? "" : "hidden"}>
            <label class="lg-field"><span>프로젝트 주소</span><input id="lg-url" autocomplete="off" placeholder="https://xxxx.supabase.co" value="${esc(net.url || "")}"></label>
            <label class="lg-field"><span>공개 키(publishable / anon)</span><input id="lg-key" autocomplete="off" value="${esc(net.key || "")}"></label>
            <p class="lg-hint">서버에 저장하지 않는 실시간 중계만 씁니다. 학생 이름·개인정보는 오가지 않습니다. 비밀(service) 키는 넣지 마세요.</p>
          </div>
        </details>
        <p class="lg-err" id="lg-err" role="alert"></p>
      </main>`;
    const $ = s => app.querySelector(s);
    const errEl = $("#lg-err");
    const readNet = () => {
      const kind = app.querySelector("input[name=lg-net]:checked").value;
      const cfg = { kind, url: $("#lg-url").value.trim(), key: $("#lg-key").value.trim() };
      if (kind === "supabase") {
        if (!NET.wsUrl(cfg.url, cfg.key) || !cfg.key) { errEl.textContent = "Supabase 프로젝트 주소와 공개 키를 확인하세요."; return null; }
        if (/service_role|sb_secret_/.test(cfg.key)) { errEl.textContent = "비밀 키는 쓰면 안 됩니다. 공개(publishable/anon) 키를 넣으세요."; return null; }
      }
      store.set(K_NET, cfg);
      return cfg;
    };
    app.querySelectorAll("input[name=lg-net]").forEach(r => r.addEventListener("change", () => {
      const sb = r.value === "supabase" && r.checked;
      $(".lg-sb").hidden = !sb && r.checked ? true : $(".lg-sb").hidden;
      if (r.checked) { $(".lg-sb").hidden = r.value !== "supabase"; $("#lg-net-now").textContent = r.value === "supabase" ? "온라인(태블릿마다)" : "이 기기(탭끼리)"; }
    }));
    $("#lg-join").addEventListener("click", () => {
      const room = $("#lg-code").value.trim().toUpperCase();
      if (!validRoom(room)) { errEl.textContent = "방 코드는 4~6글자(영문·숫자)입니다."; $("#lg-code").focus(); return; }
      const n = readNet();
      if (!n) return;
      const cur = tab.get();
      tab.set(cur && cur.room === room ? cur : { room, net: n, team: null, token: code(16) });
      location.hash = "#league/team";
    });
    const rj = $("#lg-rejoin");
    if (rj) rj.addEventListener("click", () => { tab.set({ room: lastTeam.room, net: lastTeam.net, team: lastTeam.team, token: lastTeam.token }); location.hash = "#league/team"; });
    $("#lg-host").addEventListener("click", () => {
      const n = readNet();
      if (!n) return;
      if (hostSave && hostSave.state && hostSave.state.phase !== "end" && !window.confirm(`진행 중인 방 ${hostSave.room}을 닫고 새로 만들까요?`)) return;
      const V = C.validTeams(reg, picked());
      if (!V.ok) { errEl.textContent = V.err; return; }
      const room = code(5);
      store.set(K_HOST, { room, net: n, state: C.newState(room, REGION, Date.now(), V.ids) });
      location.hash = "#league/host";
    });
    // 참가 도시 고르기
    const boxes = [...app.querySelectorAll(".lg-pickc input")];
    const picked = () => boxes.filter(b => b.checked).map(b => b.value);
    const showPick = () => {
      const V = C.validTeams(reg, picked());
      $("#lg-pickn").textContent = `${V.ids.length}팀`;
      $("#lg-pickmsg").textContent = V.ok ? `${V.ids.map(teamName).join(" · ")}` : V.err;
      $("#lg-pickmsg").dataset.bad = String(!V.ok);
      app.querySelectorAll("[data-preset]").forEach(b => b.setAttribute("aria-pressed", String(JSON.stringify((reg.presets[b.dataset.preset] || []).slice().sort()) === JSON.stringify(V.ids.slice().sort()))));
    };
    boxes.forEach(b => b.addEventListener("change", showPick));
    app.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => { const set = reg.presets[b.dataset.preset] || []; boxes.forEach(x => { x.checked = set.includes(x.value) || x.disabled; }); showPick(); }));
    showPick();
    const rh = $("#lg-rehost");
    if (rh) rh.addEventListener("click", () => { location.hash = "#league/host"; });
  }

  /* ================= 진행자 ================= */
  function hostView(app) {
    if (!hostInit()) { location.hash = "#league"; return; }
    L.app = app;
    L.viewing = null;
    renderHost(true);
    pushSnap();
  }
  function hostInit() {
    const save = store.get(K_HOST);
    if (!save || !validRoom(save.room) || !save.state) return false;
    if (!L || L.role !== "host" || L.room !== save.room) {
      close();
      const S = save.state;
      // 저장본 바로잡기: 지역·팀이 맞지 않으면 새로
      const ok = S && S.region === REGION && S.teams && actT(S).length >= 2 && actT(S).every(t => S.teams[t.id]);
      L = { role: "host", room: save.room, net: save.net, S: ok ? S : C.newState(save.room, REGION, Date.now()), timers: [], pending: 0 };
      L.conn = NET.open(Object.assign({ room: save.room }, save.net));
      L.conn.on("req", m => {
        const r = C.reduce(L.S, m, Date.now(), BG);
        // 규칙 검사가 다른 도시 지도로 바꿔 놓았을 수 있다 — 보고 있는 도시로 되돌린다.
        if (L.viewing) BG.selectPack(C.teamDef(R(), L.viewing).pack, "league");
        if (!r.ok && m && typeof m.team === "string") L.conn.send("nack", { team: m.team, type: m.type, err: r.err });
        if (r.ok && !r.quiet) changed();
        else if (r.ok && m.type === "claim") pushSnap();
      });
      L.conn.onStatus(s => { const el = document.getElementById("lg-conn"); if (el) { el.dataset.s = s; el.textContent = connLabel(s); } });
      L.timers.push(setInterval(() => { pushSnap(); renderHost(); }, 4000));
      L.timers.push(setInterval(tickTimer, 1000));
    }
    return true;
  }
  const connLabel = s => ({ open: "연결됨", connecting: "연결 중", reconnecting: "다시 연결 중", error: "연결 오류", closed: "닫힘" }[s] || s);
  function saveHost() { store.set(K_HOST, { room: L.room, net: L.net, state: L.S }); }
  function pushSnap() { if (L && L.role === "host") L.conn.send("snap", C.publicView(L.S, Date.now())); }
  function changed() {
    saveHost();
    if (L.viewing) updateView();
    clearTimeout(L.pending);
    L.pending = setTimeout(() => { pushSnap(); renderHost(); }, 150);
  }
  function tickTimer() {
    const el = document.getElementById("lg-timer");
    if (!el || !L) return;
    const S = L.S || L.snap, now = L.S ? Date.now() : Date.now() + (L.skew || 0);
    el.textContent = S && S.ends ? mmss(S.ends - now) : "";
    el.dataset.low = String(!!(S && S.ends && S.ends - now < 60000));
  }
  function nextLabel(S) {
    const n = R().rounds.length;
    if (S.phase === "lobby") return "1라운드 시작";
    if (S.phase === "plan") return `${S.round}라운드 운영`;
    if (S.phase === "review") return S.round >= n ? "최종 결과" : `${S.round + 1}라운드 시작`;
    return "";
  }
  function hostNext() {
    const S = L.S, now = Date.now();
    if (S.phase === "plan") {
      const btn = document.getElementById("lg-next");
      if (btn) { btn.disabled = true; btn.textContent = "운영 중…"; }
      setTimeout(() => { C.run(S, BG, now); L.flash = S.round; changed(); renderHost(true); }, 30);
      return;
    }
    if (C.host(S, "next", now)) { changed(); renderHost(true); }
  }
  function joinLink() {
    const n = L.net && L.net.kind === "supabase" ? { kind: "supabase", url: L.net.url, key: L.net.key } : { kind: "local" };
    return `${location.origin}${location.pathname}#league/j=${b64e(JSON.stringify({ r: L.room, n }))}`;
  }
  function renderHost(full) {
    if (!L || L.role !== "host" || !L.app || !L.app.isConnected || L.viewing) return;
    const S = L.S, reg = R(), now = Date.now(), V = C.publicView(S, now);
    const res = S.results[S.results.length - 1] || null;
    const rd = S.round ? reg.rounds[S.round - 1] : reg.rounds[0];
    if (full || !L.app.querySelector(".lg-host")) {
      L.app.innerHTML = `
        <main class="lg-host">
          <header class="lg-hbar">
            <a class="lg-back" href="#league" aria-label="로비로">←</a>
            <div class="lg-room"><span>방 코드</span><b id="lg-roomcode">${esc(L.room)}</b></div>
            <div class="lg-hmeta">
              <p class="v2-kicker">${esc(reg.short)} · ${esc(reg.name)}</p>
              <h1 id="lg-h1"></h1>
            </div>
            <span class="lg-conn" id="lg-conn" data-s="${esc(L.conn.status())}">${connLabel(L.conn.status())}</span>
            <b class="lg-timer num" id="lg-timer" aria-live="off"></b>
            <button type="button" class="v2-btn" id="lg-extend">+1분</button>
            <button type="button" class="v2-btn primary" id="lg-next"></button>
            <button type="button" class="v2-btn" id="lg-link">참가 링크 복사</button>
          </header>
          <section class="lg-evbox" id="lg-evbox" aria-live="polite"></section>
          <section class="lg-hgrid">
            <figure class="lg-mapbox">${R().board ? `<canvas class="lg-map lg-mapc" id="lg-mapc" role="img" aria-label="광역 지도: 여섯 도시 지도를 합친 지도와 연계선"></canvas><nav class="lg-mapnav" aria-label="도시 지도 보기">${actT(S).map(t => `<a href="#league/view/${t.id}" style="--c:${t.color}">${esc(t.name)}</a>`).join("")}</nav>` : `<svg class="lg-map" id="lg-map" viewBox="0 0 600 470" role="img" aria-label="지역 지도와 연계선"></svg>`}
              <figcaption id="lg-mapcap"></figcaption></figure>
            <div class="lg-teams" id="lg-teams"></div>
          </section>
          <section class="lg-results" id="lg-results"></section>
          <section class="lg-logbox"><h2>기록</h2><ol class="lg-log" id="lg-log"></ol></section>
          <p class="lg-sr" id="lg-live" aria-live="polite"></p>
        </main>`;
      const $ = s => L.app.querySelector(s);
      $("#lg-next").addEventListener("click", hostNext);
      const mc = $("#lg-mapc");
      if (mc) {
        mc.addEventListener("click", e => { const id = boardHit(mc, e); if (id && Object.hasOwn(L.S.teams, id)) location.hash = `#league/view/${id}`; });
        mc.addEventListener("mousemove", e => { const id = boardHit(mc, e); mc.style.cursor = id && Object.hasOwn(L.S.teams, id) ? "pointer" : "default"; mc.title = id ? `${teamName(id)} 지도 보기` : ""; });
      }
      $("#lg-extend").addEventListener("click", () => { if (C.host(L.S, "extend", Date.now())) changed(); });
      $("#lg-link").addEventListener("click", () => copyText(joinLink(), "참가 링크를 복사했습니다", $("#lg-link")));
      $("#lg-teams").addEventListener("click", e => {
        const k = e.target.closest("[data-kick]");
        if (k && window.confirm(`${teamName(k.dataset.kick)} 자리를 비울까요? (다른 기기가 그 팀으로 들어올 수 있게 됩니다)`)) { C.host(L.S, "kick", Date.now(), k.dataset.kick); changed(); }
      });
    }
    const $ = s => L.app.querySelector(s);
    $("#lg-h1").textContent = S.phase === "lobby" ? "팀 입장 기다리는 중" : S.phase === "end" ? "리그 끝 — 최종 결과" : `${S.round} / ${reg.rounds.length}라운드 · ${SEASON_NAME[rd.season]} · ${PHASE_NAME[S.phase]}`;
    const nx = $("#lg-next"), lab = nextLabel(S);
    nx.hidden = !lab; nx.disabled = false; nx.textContent = lab;
    $("#lg-extend").hidden = !S.ends;
    tickTimer();
    const ev = S.round ? evCards(S, S.round) : "";
    $("#lg-evbox").innerHTML = ev ? `<h2>${S.round}라운드 사건</h2>${ev}` : "";
    if ($("#lg-mapc")) renderBoard($("#lg-mapc"), V, res, L.flash === S.round); else renderMap($("#lg-map"), V, res, L.flash === S.round);
    $("#lg-mapcap").textContent = (res ? `${res.round}라운드(${SEASON_NAME[res.season]} ${res.days}일) 도시 사이 전력 거래 · 선 굵기 = 용량` : "점선 = 제안된 연계선, 실선 = 연결된 연계선") + (R().board ? " · 도시를 누르면 그 도시 지도" : "");
    $("#lg-teams").innerHTML = actT(S).map(t => teamCard(t, V.teams[t.id], res && res.team[t.id], S)).join("");
    $("#lg-teams").querySelectorAll("canvas[data-thumb]").forEach(cv => thumb(cv, cv.dataset.thumb, V.teams[cv.dataset.thumb].plan));
    $("#lg-results").innerHTML = res ? resultsTable(S, res) : `<p class="lg-hint">라운드를 운영하면 여기에 도시별 결과가 나옵니다. 팀은 <b>방 코드 ${esc(L.room)}</b>로 들어옵니다.</p>`;
    $("#lg-log").innerHTML = S.log.slice(-8).reverse().map(x => `<li>${esc(x.t)}</li>`).join("");
  }
  function teamCard(t, v, r, S) {
    const plan = v.plan || { builds: [], lines: [] };
    const cnt = {};
    plan.builds.forEach(b => { cnt[b.t] = (cnt[b.t] || 0) + 1; });
    const B = BG.BLD;
    const items = Object.keys(cnt).map(k => `<span class="lg-chip">${esc((B[k] || { name: k }).name)} ${cnt[k]}</span>`).join("") || `<span class="lg-hint">아직 건설 없음</span>`;
    const st = !v.seated ? "빈 자리" : v.online ? "접속" : "끊김";
    const H = v.hist || [], last = H[H.length - 1];
    const ago = last ? Math.max(0, Math.round((Date.now() - last.t) / 1000)) : null;
    return `<article class="lg-tcard" style="--c:${t.color}" data-team="${t.id}">
      <a class="lg-thumb" href="#league/view/${t.id}" aria-label="${esc(t.name)} 지도 크게 보기"><canvas data-thumb="${t.id}" width="232" height="150"></canvas><span>지도 보기</span></a>
      <div class="lg-speed">${spark(H, v.budget)}<span>${last ? `투자 <b class="num">${fmt(last.cap)}억</b> · 설비 ${last.n} · 선 ${last.l}${ago != null ? ` · <i>${ago < 60 ? `${ago}초` : `${Math.round(ago / 60)}분`} 전 변경</i>` : ""}` : "아직 계획 없음"}</span></div>
      <header><h3>${esc(t.name)}</h3><span class="lg-seat" data-s="${!v.seated ? "empty" : v.online ? "on" : "off"}">${st}</span>${v.ready ? `<span class="lg-ready">준비 ✓</span>` : ""}</header>
      <p class="lg-tline"><span>예산 <b class="num">${fmt(v.budget)}억</b></span><span>판매 단가 <b class="num">${fmt(v.price, 3)}</b></span><span>송전선 <b class="num">${plan.lines.length}</b></span></p>
      <div class="lg-chips">${items}</div>
      ${r ? `<p class="lg-tline lg-tres"><span>정전 <b class="num" data-bad="${r.unsPct > 0.5}">${fmt(r.unsPct, 2)}%</b></span><span>CO₂ <b class="num">${fmt(r.co2Prod)} t</b></span><span>수입/수출 <b class="num">${fmt(r.imp, 1)}/${fmt(r.exp, 1)}</b></span></p>` : ""}
      ${v.seated ? `<button type="button" class="lg-kick" data-kick="${t.id}">자리 비우기</button>` : ""}
    </article>`;
  }
  function resultsTable(S, res) {
    const g = C.goalsOf(S), act = actT(S);
    const rows = act.map(t => {
      const r = res.team[t.id];
      return `<tr style="--c:${t.color}"><th scope="row">${esc(t.name)}</th>
        <td class="num" data-bad="${r.unsPct > g.unsPct}">${fmt(r.unsPct, 2)}%</td><td class="num" data-bad="${r.hospH > 0}">${r.hospH}</td>
        <td class="num">${fmt(r.cost.total, 1)}</td><td class="num">${fmt(r.co2Prod)}</td><td class="num">${fmt(r.co2Cons)}</td>
        <td class="num">${fmt(r.imp, 1)} / ${fmt(r.exp, 1)}</td><td class="num">${fmt(r.earn - r.pay, 2)}</td><td class="num">${r.sat}</td></tr>`;
    }).join("");
    const maxC = Math.max(1, ...act.map(t => Math.max(res.team[t.id].co2Prod, res.team[t.id].co2Cons)));
    const bars = act.map(t => { const r = res.team[t.id]; return `<li style="--c:${t.color}"><span>${esc(t.name)}</span><i style="width:${(100 * r.co2Prod / maxC).toFixed(1)}%" class="p"></i><i style="width:${(100 * r.co2Cons / maxC).toFixed(1)}%" class="c"></i></li>`; }).join("");
    return `<h2>${res.round}라운드 결과 · ${SEASON_NAME[res.season]} ${res.days}일</h2>
      <p class="lg-goals"><span data-ok="${res.region.ok.uns}">지역 정전 ${fmt(res.region.unsPct, 2)}% (목표 ≤ ${g.unsPct}%)</span><span data-ok="${res.region.ok.co2}">지역 CO₂ ${fmt(res.region.co2)} t (목표 ≤ ${fmt(g.co2)} t)</span></p>
      <div class="lg-tablewrap"><table class="lg-table"><thead><tr><th scope="col">팀</th><th scope="col">정전</th><th scope="col">병원 정전(h)</th><th scope="col">비용(억)</th><th scope="col">CO₂ 생산(t)</th><th scope="col">CO₂ 소비(t)</th><th scope="col">수입/수출(MWh)</th><th scope="col">거래 수지(억)</th><th scope="col">최저 만족</th></tr></thead><tbody>${rows}</tbody></table></div>
      <figure class="lg-co2"><figcaption>CO₂ — <b class="p">생산 기준</b>(발전소가 있는 곳) vs <b class="c">소비 기준</b>(전기를 쓴 곳)</figcaption><ul>${bars}</ul></figure>`;
  }

  /* ---------- 라운드 사건 카드 ---------- */
  const SCOPE = { region: "지역 전체", "kind:coastal": "바다에 닿은 도시", "kind:industrial": "대형 공장이 있는 도시", "kind:coal": "석탄 발전소가 있는 도시", "kind:metro_south": "경기 남부 도시", "kind:chungcheong": "충남 도시", "kind:inland": "내륙 도시" };
  function evCards(X, round, me) {
    const reg = R(), list = (X.events || []).filter(x => x.round === round).map(x => C.eventDef(reg, x.id)).filter(Boolean);
    if (!list.length) return "";
    return `<ul class="lg-evs">${list.map(E => {
      const sc = E.scope || "region", who = SCOPE[sc] || (sc.startsWith("team:") ? teamName(sc.slice(5)) : sc);
      const mine = me ? C.hits(reg, E, me) : null;
      return `<li class="lg-ev" data-mine="${mine}"><b>${esc(E.name)}</b><span>${esc(E.text || "")}</span><small>${esc(who)}${mine === true ? " · 우리 도시 해당" : mine === false ? " · 우리 도시 해당 없음" : ""}</small></li>`;
    }).join("")}</ul>`;
  }

  /* ---------- 팀 카드: 건설 속도(투자 누적)와 축소 지도 ---------- */
  function spark(H, budget) {
    if (!H || H.length < 2) return `<svg class="lg-spark" viewBox="0 0 120 30" aria-hidden="true"></svg>`;
    const max = Math.max(1, budget || 0, ...H.map(p => p.cap)), t0 = H[0].t, t1 = Math.max(t0 + 1, H[H.length - 1].t);
    const pts = H.map(p => `${(4 + 112 * (p.t - t0) / (t1 - t0)).toFixed(1)},${(27 - 24 * p.cap / max).toFixed(1)}`).join(" ");
    return `<svg class="lg-spark" viewBox="0 0 120 30" role="img" aria-label="투자 누적 변화"><line x1="4" x2="116" y1="3" y2="3" class="lg-spark-b"/><polyline points="${pts}"/></svg>`;
  }
  const TCOL = { sea: "#3d7fb3", beach: "#d8cf9c", plain: "#9cc86a", forest: "#3f8a4f", hill: "#a9a07a", mount: "#7d6c55", urban: "#babac2", river: "#2f8fe0", lake: "#5ab0e6", out: "#59625e", grid: "#f0c83c", town: "#babac2" };
  const BCOL = { solar: "#ffd23f", roof: "#ff9f1c", wind: "#ffffff", offshore: "#cfe8ff", tidal: "#62d2c4", hydro: "#38b6ff", diesel: "#4a3b2c", biomass: "#8a6a2a", battery: "#9b6bff" };
  function thumb(cv, id, plan) {
    const t = C.teamDef(R(), id);
    if (!t || !cv.getContext) return;
    BG.selectPack(t.pack, "league");
    const T = BG.TILES, dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.width, Hh = cv.height;
    cv.width = W * dpr; cv.height = Hh * dpr; cv.style.aspectRatio = `${W} / ${Hh}`;
    const g = cv.getContext("2d");
    g.scale(dpr, dpr);
    const xs = T.map(x => x.X), ys = T.map(x => x.Y), x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
    const k = Math.min(W / (x1 - x0), Hh / (y1 - y0)), ox = (W - k * (x1 - x0)) / 2 - k * x0, oy = (Hh - k * (y1 - y0)) / 2 - k * y0;
    const P = (X, Y) => [ox + k * X, oy + k * Y];
    T.forEach(tile => {
      const [cx, cy] = P(tile.X, tile.Y);
      g.beginPath();
      for (let a = 0; a < 6; a++) { const ang = Math.PI / 180 * (60 * a - 90); const px = cx + k * 0.98 * Math.cos(ang), py = cy + k * 0.98 * Math.sin(ang); if (a) g.lineTo(px, py); else g.moveTo(px, py); }
      g.closePath(); g.fillStyle = tile.t === "river" ? TCOL.plain : tile.t === "out" && tile.vt === "river" ? TCOL.out : TCOL[tile.t] || "#888"; g.fill();
    });
    // 강은 물줄기 띠로(호수는 물 면 그대로)
    const wet = x => ["river", "lake", "sea"].includes(x.vt || x.t);
    g.strokeStyle = TCOL.river; g.lineWidth = Math.max(1, k * 0.55); g.lineCap = "round";
    T.forEach(tile => { if ((tile.vt || tile.t) !== "river") return; const [cx, cy] = P(tile.X, tile.Y); g.beginPath(); g.arc(cx, cy, g.lineWidth / 2, 0, Math.PI * 2); (tile.nb || []).map(j => T[j]).filter(o => o && wet(o)).forEach(o => { const [ox2, oy2] = P((tile.X + o.X) / 2, (tile.Y + o.Y) / 2); g.moveTo(cx, cy); g.lineTo(ox2, oy2); }); g.stroke(); });
    const pl = plan || { builds: [], lines: [] };
    g.strokeStyle = "#1b2430"; g.lineWidth = Math.max(1.2, k * 0.28); g.lineJoin = "round";
    (pl.lines || []).forEach(L0 => { if (!Array.isArray(L0.p)) return; g.beginPath(); L0.p.forEach((i, n) => { const tt = T[i]; if (!tt) return; const [x, y] = P(tt.X, tt.Y); if (n) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); });
    BG.SITES.forEach(s0 => { const tt = T[s0.tile]; if (!tt || s0.kind === "gridpt") return; const [x, y] = P(tt.X, tt.Y); g.fillStyle = "#fff"; g.strokeStyle = "#333"; g.lineWidth = 1; g.fillRect(x - k * 0.35, y - k * 0.35, k * 0.7, k * 0.7); g.strokeRect(x - k * 0.35, y - k * 0.35, k * 0.7, k * 0.7); });
    (pl.builds || []).forEach(b => { const tt = T[b.i]; if (!tt) return; const [x, y] = P(tt.X, tt.Y); g.beginPath(); g.arc(x, y, k * 0.55, 0, Math.PI * 2); g.fillStyle = BCOL[b.t] || "#f0f"; g.fill(); g.lineWidth = 1; g.strokeStyle = "#111"; g.stroke(); });
  }

  /* ---------- 진행자: 도시 지도 크게 보기(#league/view/<팀>) ---------- */
  function viewCity(app, id) {
    if (!hostInit()) { location.hash = "#league"; return; }
    const t = C.teamDef(R(), id);
    if (!t || !Object.hasOwn(L.S.teams, id)) { location.hash = "#league/host"; return; }
    L.app = app; L.viewing = id;
    const S = L.S, rd = R().rounds[Math.max(0, S.round - 1)] || R().rounds[0];
    BG.selectPack(t.pack, "league");
    const st = BG.sanitize(S.teams[id].plan || {}, 1e9);
    st.season = rd.season;
    BG.mount(app, {
      packs: [t.pack], league: true,
      load: () => ({ v: 2, map: t.pack, maps: { [t.pack]: st }, runs: 0, jAuto: true, journal: [] }),
      save: () => {},
      locked: () => "진행자 보기 전용 — 짓기는 팀 기기에서",
      season: () => rd.season,
      onMount: root => { viewBar(root, id); window.dispatchEvent(new Event("resize")); }
    });
  }
  function viewBar(root, id) {
    const ids = actT(L.S).map(t => t.id), k = ids.indexOf(id), prev = ids[(k - 1 + ids.length) % ids.length], next = ids[(k + 1) % ids.length];
    const bar = document.createElement("div");
    bar.className = "lg-bar lg-viewbar"; bar.id = "lg-bar"; bar.style.setProperty("--c", teamCol(id));
    bar.innerHTML = `<a class="lg-bbtn" href="#league/host">← 진행자 판</a><a class="lg-bbtn" href="#league/view/${prev}" aria-label="이전 도시">‹</a>
      <span class="lg-bteam">${esc(teamName(id))}</span><span class="lg-bphase">보기 전용</span><span id="lg-vstat"></span>
      <a class="lg-bbtn" href="#league/view/${next}" aria-label="다음 도시">›</a>`;
    root.append(bar);
    viewStat();
  }
  function viewStat() {
    const el = document.getElementById("lg-vstat");
    if (!el || !L || !L.viewing) return;
    const v = C.publicView(L.S, Date.now()).teams[L.viewing], H = v.hist || [], last = H[H.length - 1];
    el.textContent = `예산 ${fmt(v.budget)}억 · 투자 ${last ? fmt(last.cap) : 0}억 · ${!v.seated ? "빈 자리" : v.online ? "접속" : "끊김"}`;
  }
  // 보고 있는 도시의 계획이 바뀌면 화면을 다시 띄우지 않고 그 자리에서 바꾼다(확대·위치 유지).
  function updateView() {
    const st = BG.current();
    if (!st || !L.viewing) return;
    const t = C.teamDef(R(), L.viewing), plan = L.S.teams[L.viewing].plan;
    if (!plan) return;
    BG.selectPack(t.pack, "league");
    const clean = BG.sanitize(plan, 1e9);
    Object.assign(st, { builds: clean.builds, lines: clean.lines, policies: clean.policies, shed: clean.shed, fab2: clean.fab2 });
    BG.refresh();
    viewStat();
  }

  /* ---------- 지역 지도(개략) ---------- */
  // 경도·위도 → 화면. 지명 위치는 대략(시·군 중심). 바다·호수는 모양만 흉내 낸 개략도.
  const GEO = { hwaseong: [126.86, 37.17], pyeongtaek: [127.0, 36.99], anseong: [127.3, 37.03], dangjin: [126.68, 36.8], asan: [126.98, 36.78], cheonan: [127.2, 36.82] };
  const P = ([lon, lat]) => [Math.round((lon - 126.45) * 600 / 1.05), Math.round((37.32 - lat) * 470 / 0.72)];
  const SEA = [[126.45, 37.32], [126.74, 37.32], [126.72, 37.2], [126.78, 37.1], [126.92, 37.03], [126.98, 36.97], [126.86, 36.95], [126.74, 36.98], [126.62, 37.0], [126.45, 37.02]];
  const LAKES = [{ n: "삽교호", at: [126.83, 36.88], r: [16, 7] }, { n: "아산호", at: [126.98, 36.9], r: [20, 6] }, { n: "화성호", at: [126.75, 37.12], r: [12, 6] }, { n: "예당호", at: [126.8, 36.63], r: [12, 6] }];
  // 광역 지도: R().board = 여섯 도시 지도를 합친 한 장. 팀마다 도시 창(BUILD_MAPS[pack].win)에서 지은 선·설비를 제자리에 그린다.
  const SQ3 = Math.sqrt(3);
  const TER = { "~": "#2f6f9f", b: "#d9cc95", p: "#93c26a", f: "#4e8e4f", h: "#a3a26e", m: "#857563", u: "#b4b6bc", r: "#2f8fe0", l: "#5ab0e6", g: "#f0c83c", ".": "#c3c8bf" };
  let boardCache = null;
  function boardInfo() {
    const B = R().board;
    if (!B) return null;
    if (boardCache && boardCache.B === B) return boardCache;
    const cells = [], sum = {};
    B.rows.forEach((row, r) => [...row].forEach((ch, c) => {
      const x = SQ3 * (c + 0.5 * (r & 1)) + SQ3 / 2, y = 1.5 * r + 1, team = B.letters[B.own[r][c]] || null;
      cells.push({ c, r, ch, x, y, team });
      if (team) { const S0 = sum[team] = sum[team] || [0, 0, 0]; S0[0] += x; S0[1] += y; S0[2]++; }
    }));
    const cen = {};
    Object.keys(sum).forEach(k => { cen[k] = [sum[k][0] / sum[k][2], sum[k][1] / sum[k][2]]; });
    boardCache = { B, cells, cen, W: SQ3 * (B.cols + 0.5), H: 1.5 * (B.rows.length - 1) + 2, at: (c, r) => cells[r * B.cols + c] };
    return boardCache;
  }
  // 도시 창의 칸 번호 → 광역 칸 좌표(x, y)
  function winXY(id, i) {
    const t = C.teamDef(R(), id), P = KCP.BUILD_MAPS[t.pack], cols = P.rows[0].length, w = P.win || [0, 0];
    const c = (i % cols) + w[0], r = Math.floor(i / cols) + w[1];
    return [SQ3 * (c + 0.5 * (r & 1)) + SQ3 / 2, 1.5 * r + 1];
  }
  function gateXY(id, other) {
    const t = C.teamDef(R(), id), P = KCP.BUILD_MAPS[t.pack], g = (P.gates || []).find(x => x.to.includes(other));
    if (!g) return null;
    const w = P.win || [0, 0], c = g.c + w[0], r = g.r + w[1];
    return [SQ3 * (c + 0.5 * (r & 1)) + SQ3 / 2, 1.5 * r + 1];
  }
  function renderBoard(cv, V, res, flash) {
    const G = boardInfo(), reg = R(), on = new Set(actT(V).map(t => t.id)), goals = V.goals || reg.goals;
    const cssW = cv.clientWidth || 600, k = cssW / G.W, cssH = Math.round(G.H * k), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) { cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr); cv.style.height = cssH + "px"; }
    const g = cv.getContext("2d");
    g.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    g.clearRect(0, 0, G.W, G.H);
    const NB_E = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]], NB_O = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
    const hex = (x, y, rr) => { g.beginPath(); for (let a = 0; a < 6; a++) { const t = Math.PI / 180 * (60 * a - 90); const px = x + rr * Math.cos(t), py = y + rr * Math.sin(t); if (a) g.lineTo(px, py); else g.moveTo(px, py); } g.closePath(); };
    // 강 칸은 땅 위에 물줄기(이웃 강·호수·바다 칸까지 잇는 띠)로 그려 호수(물 면 전체)와 구별한다.
    const WET = ch => ch === "r" || ch === "l" || ch === "~", nbOf = cl => (cl.r & 1 ? NB_O : NB_E).map(([dc, dr]) => { const o = G.at(cl.c + dc, cl.r + dr); return o && o.c === cl.c + dc ? o : null; }).filter(Boolean);
    G.cells.forEach(cl => { hex(cl.x, cl.y, 1.03); g.fillStyle = cl.ch === "r" ? TER.p : TER[cl.ch] || TER.p; g.fill(); });
    g.lineCap = "round"; g.lineJoin = "round";
    [["rgba(230,244,255,0.9)", 0.95], [TER.r, 0.62]].forEach(([col, w]) => {
      g.strokeStyle = col; g.lineWidth = w;
      G.cells.forEach(cl => { if (cl.ch !== "r") return; const ns = nbOf(cl).filter(o => WET(o.ch)); g.beginPath(); if (!ns.length) g.arc(cl.x, cl.y, w / 2, 0, Math.PI * 2); ns.forEach(o => { g.moveTo(cl.x, cl.y); g.lineTo((cl.x + o.x) / 2, (cl.y + o.y) / 2); }); g.stroke(); });
    });
    G.cells.forEach(cl => { if (cl.team && !on.has(cl.team)) { hex(cl.x, cl.y, 1.03); g.fillStyle = "rgba(200,204,196,0.72)"; g.fill(); } });
    // 도시 경계(팀 색 굵은 선)
    const B = G.B;
    g.lineCap = "round";
    G.cells.forEach(cl => {
      if (!cl.team) return;
      (cl.r & 1 ? NB_O : NB_E).forEach(([dc, dr]) => {
        const o = G.at(cl.c + dc, cl.r + dr) || null, ot = o && o.c === cl.c + dc ? o.team : null;
        if (ot === cl.team) return;
        const nx = SQ3 * (cl.c + dc + 0.5 * ((cl.r + dr) & 1)) + SQ3 / 2, ny = 1.5 * (cl.r + dr) + 1, mx = (cl.x + nx) / 2, my = (cl.y + ny) / 2, dx = (ny - cl.y) / 2 / SQ3, dy = -(nx - cl.x) / 2 / SQ3;
        g.strokeStyle = on.has(cl.team) ? teamCol(cl.team) : "#9aa096"; g.lineWidth = ot ? 0.32 : 0.42;
        g.beginPath(); g.moveTo(mx + dx, my + dy); g.lineTo(mx - dx, my - dy); g.stroke();
      });
    });
    // 팀마다 지은 송전선·설비
    on.forEach(id => {
      const plan = V.teams[id] && V.teams[id].plan;
      if (!plan) return;
      g.strokeStyle = "#1b2430"; g.lineWidth = 0.34; g.lineJoin = "round";
      (plan.lines || []).forEach(L0 => { if (!Array.isArray(L0.p)) return; g.beginPath(); L0.p.forEach((i, n) => { const [x, y] = winXY(id, i); if (n) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); });
      (plan.builds || []).forEach(b0 => { const [x, y] = winXY(id, b0.i); g.beginPath(); g.arc(x, y, 0.62, 0, Math.PI * 2); g.fillStyle = BCOL[b0.t] || "#f0f"; g.fill(); g.lineWidth = 0.15; g.strokeStyle = "#111"; g.stroke(); });
    });
    // 연계선: 실제 연결점(노란 칸)끼리
    let flows = 0;
    reg.ties.filter(D => on.has(D.a) && on.has(D.b)).forEach(D => {
      const A = gateXY(D.a, D.b), Bq = gateXY(D.b, D.a);
      if (!A || !Bq) return;
      const T = V.ties.find(x => x.a === D.a && x.b === D.b), F = res && T && res.flow[C.tieId(T)], net = F ? F.ab - F.ba : 0;
      g.setLineDash(!T ? [0.5, 0.9] : T.st === "prop" ? [1.2, 0.8] : []);
      g.strokeStyle = !T ? "rgba(40,50,60,0.55)" : T.st === "prop" ? "#d08a1c" : "#1d2430"; g.lineWidth = !T ? 0.3 : T.cap === 4 ? 0.95 : 0.6;
      g.beginPath(); g.moveTo(...A); g.lineTo(...Bq); g.stroke(); g.setLineDash([]);
      if (F && Math.abs(net) > 0.05) {
        g.setLineDash([0.9, 1.1]); g.lineDashOffset = -(performance.now() / 120) % 4; g.strokeStyle = "#ffd23f"; g.lineWidth = flash ? 0.7 : 0.5;
        g.beginPath(); if (net >= 0) { g.moveTo(...A); g.lineTo(...Bq); } else { g.moveTo(...Bq); g.lineTo(...A); } g.stroke(); g.setLineDash([]);
        g.font = "700 1.35px sans-serif"; g.textAlign = "center"; g.lineWidth = 0.35; g.strokeStyle = "#fff"; g.fillStyle = "#1d2430";
        const mx = (A[0] + Bq[0]) / 2, my = (A[1] + Bq[1]) / 2 - 0.9, tx = `${fmt(Math.abs(net), 0)} MWh`;
        g.strokeText(tx, mx, my); g.fillText(tx, mx, my); flows++;
      }
    });
    // 이름표(도시·호수)
    g.textAlign = "center";
    (B.labels || []).forEach(L0 => { const x = SQ3 * (L0.c + 0.5 * (L0.r & 1)) + SQ3 / 2, y = 1.5 * L0.r + 1; g.font = "600 1.2px sans-serif"; g.fillStyle = "rgba(20,40,60,0.75)"; g.fillText(L0.t, x, y); });
    reg.teams.forEach(t => {
      const c0 = G.cen[t.id]; if (!c0) return;
      const act = on.has(t.id), r0 = res && res.team[t.id], v = V.teams[t.id];
      g.font = `800 ${act ? 2.6 : 2.0}px sans-serif`; g.lineWidth = 0.6; g.strokeStyle = act ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.7)"; g.fillStyle = act ? "#fff" : "#6a6f66";
      g.strokeText(t.name, c0[0], c0[1]); g.fillText(t.name, c0[0], c0[1]);
      const sub = !act ? "" : r0 ? `정전 ${fmt(r0.unsPct, 1)}%` : v && !v.seated ? "빈 자리" : "";
      if (sub) { g.font = "700 1.5px sans-serif"; g.lineWidth = 0.45; g.strokeText(sub, c0[0], c0[1] + 2.2); g.fillStyle = r0 && r0.unsPct > goals.unsPct ? "#ffb3a8" : "#fff"; g.fillText(sub, c0[0], c0[1] + 2.2); }
    });
    cv.dataset.k = String(k); cv.dataset.flows = String(flows);
  }
  function boardHit(cv, ev) {
    const G = boardInfo(), rect = cv.getBoundingClientRect(), k = rect.width / G.W, x = (ev.clientX - rect.left) / k, y = (ev.clientY - rect.top) / k;
    let best = null, bd = Infinity;
    G.cells.forEach(cl => { const d = (cl.x - x) ** 2 + (cl.y - y) ** 2; if (d < bd) { bd = d; best = cl; } });
    return best && bd < 1.2 ? best.team : null;
  }
  function renderMap(svg, V, res, flash) {
    const reg = R(), pts = SEA.map(P).map(p => p.join(",")).join(" ");
    const on = new Set(actT(V).map(t => t.id)), G = V.goals || reg.goals;
    const tieSvg = reg.ties.filter(D => on.has(D.a) && on.has(D.b)).map(D => {
      const T = V.ties.find(x => x.a === D.a && x.b === D.b);
      const [x1, y1] = P(GEO[D.a]), [x2, y2] = P(GEO[D.b]);
      const F = res && T && res.flow[C.tieId(T)];
      const net = F ? F.ab - F.ba : 0, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const st = !T ? "none" : T.st;
      const lab = F && (F.ab + F.ba) > 0.05 ? `<text class="lg-flowlab" x="${mx}" y="${my - 6}">${fmt(Math.abs(net), 1)} MWh ${net >= 0 ? "→" : "←"}</text>` : "";
      const dir = net >= 0 ? `M${x1},${y1} L${x2},${y2}` : `M${x2},${y2} L${x1},${y1}`;
      return `<g class="lg-tie" data-st="${st}" data-kind="${D.kind}"><path d="M${x1},${y1} L${x2},${y2}" stroke-width="${T ? (T.cap === 4 ? 7 : 4) : 2}"/>${F && Math.abs(net) > 0.05 ? `<path class="lg-flow${flash ? " lg-flash" : ""}" d="${dir}"/>` : ""}${lab}<title>${esc(teamName(D.a))}–${esc(teamName(D.b))} (${esc(D.name)}) ${!T ? "후보" : T.st === "built" ? `${T.cap} MW 연결` : `${T.cap} MW 제안`}</title></g>`;
    }).join("");
    const cities = reg.teams.map(t => {
      const [x, y] = P(GEO[t.id]), v = V.teams[t.id], r = res && res.team[t.id];
      if (!on.has(t.id)) return `<g class="lg-city" data-off="true"><circle cx="${x}" cy="${y}" r="26"/><text x="${x}" y="${y + 5}" class="lg-cname">${esc(t.name)}</text></g>`;
      const ring = r ? (r.unsPct > G.unsPct ? "bad" : "ok") : "none";
      return `<a href="#league/view/${t.id}" class="lg-citylink"><g class="lg-city" data-ring="${ring}" style="--c:${t.color}"><circle cx="${x}" cy="${y}" r="34"/><text x="${x}" y="${y + 5}" class="lg-cname">${esc(t.name)}</text>${v.seated ? "" : `<text x="${x}" y="${y + 22}" class="lg-cempty">빈 자리</text>`}</g><title>${esc(t.name)} 지도 보기</title></a>`;
    }).join("");
    svg.innerHTML = `<rect width="600" height="470" class="lg-land"/><polygon points="${pts}" class="lg-sea"/>
      ${LAKES.map(l => { const [x, y] = P(l.at); return `<ellipse cx="${x}" cy="${y}" rx="${l.r[0]}" ry="${l.r[1]}" class="lg-lake"/><text x="${x}" y="${y + 18}" class="lg-lname">${l.n}</text>`; }).join("")}
      <ellipse cx="${P([126.63, 37.17])[0]}" cy="${P([126.63, 37.17])[1]}" rx="7" ry="4" class="lg-isle"/><text x="${P([126.63, 37.17])[0]}" y="${P([126.63, 37.17])[1] - 8}" class="lg-lname">제부도</text>
      <text x="40" y="60" class="lg-seaname">서해</text><text x="${P([126.84, 37.0])[0]}" y="${P([126.84, 37.0])[1] + 4}" class="lg-seaname s">아산만</text>
      ${tieSvg}${cities}`;
  }

  /* ================= 팀 ================= */
  function teamView(app) {
    const save = tab.get();
    if (!save || !validRoom(save.room) || typeof save.token !== "string") { location.hash = "#league"; return; }
    if (!L || L.role !== "team" || L.room !== save.room) {
      close();
      L = { role: "team", room: save.room, net: save.net || { kind: "local" }, team: save.team || null, token: save.token, snap: null, timers: [], rev: 0, planT: 0, skew: 0, lastPhase: null, lastRound: 0 };
      L.conn = NET.open(Object.assign({ room: save.room }, L.net));
      L.conn.on("snap", onSnap);
      L.conn.on("nack", m => { if (m && m.team === L.team) nack(m); });
      L.conn.onStatus(s => { const el = document.getElementById("lg-conn"); if (el) { el.dataset.s = s; el.textContent = connLabel(s); } if (s === "open" && L.team) send("claim"); });
      L.timers.push(setInterval(() => { if (L.team) { send("hello"); if (L.snap && L.snap.teams[L.team] && L.snap.teams[L.team].rev < L.rev) sendPlan(); } }, 5000));
      L.timers.push(setInterval(tickTimer, 1000));
    }
    L.app = app;
    if (!L.team) seatPicker(app); else mountCity(app);
  }
  function send(type, extra) { L.conn.send("req", Object.assign({ type, team: L.team, token: L.token }, extra || {})); }
  function teamSave() { const s = { room: L.room, net: L.net, team: L.team, token: L.token }; tab.set(s); if (L.team) store.set(K_TEAM, s); }
  function seatPicker(app) {
    const reg = R(), V = L.snap;
    app.innerHTML = `<main class="lg-lobby">
      <header class="lg-lhead"><a class="lg-back" href="#league">← 로비</a><p class="v2-kicker">방 ${esc(L.room)}</p><h1>우리 팀 도시 고르기</h1>
        <p class="lg-sub" id="lg-wait">${V ? "빈 도시를 고르세요." : "진행자 화면을 찾는 중… 방 코드와 연결 방식이 맞는지 확인하세요."}</p></header>
      <div class="lg-seats">${(V ? actT(V) : reg.teams).map(t => { const v = V && V.teams[t.id]; const taken = v && v.seated; return `<button type="button" class="lg-seatbtn" style="--c:${t.color}" data-seat="${t.id}" ${!V || taken ? "disabled" : ""}><b>${esc(t.name)}</b><span>${!V ? "…" : taken ? "다른 팀이 맡음" : "비어 있음"}</span></button>`; }).join("")}</div>
      <p class="lg-err" id="lg-err" role="alert"></p></main>`;
    app.querySelectorAll("[data-seat]").forEach(b => b.addEventListener("click", () => {
      L.team = b.dataset.seat;
      L.claiming = true;
      teamSave();
      send("claim");
      app.querySelector("#lg-wait").textContent = `${teamName(L.team)} 자리를 요청했습니다…`;
    }));
  }
  function nack(m) {
    if (m.type === "claim" || m.err === "seat") {
      L.team = null; L.claiming = false; teamSave();
      if (L.app && L.app.isConnected) { location.hash !== "#league/team" ? (location.hash = "#league/team") : seatPicker(L.app); const e = L.app.querySelector("#lg-err"); if (e) e.textContent = m.err === "taken" ? "다른 기기가 이미 그 팀을 맡았습니다." : "자리가 비워졌습니다. 다시 고르세요."; }
      return;
    }
    const msg = { phase: "지금 단계에서는 바꿀 수 없습니다.", built: "이미 연결된 연계선입니다.", noprop: "제안이 없습니다.", notie: "이웃이 아닙니다." }[m.err] || (String(m.err).startsWith("budget:") ? `${teamName(String(m.err).slice(7))} 예산이 모자라 연결할 수 없습니다.` : "요청을 처리하지 못했습니다.");
    BG.toast(msg);
  }
  function onSnap(V) {
    if (!V || V.room !== L.room || V.region !== REGION || !V.teams) return;
    const prev = L.snap;
    L.snap = V; L.skew = V.now - Date.now();
    if (!L.team) { if (L.app && L.app.isConnected && L.app.querySelector(".lg-seats")) seatPicker(L.app); return; }
    const me = V.teams[L.team];
    if (L.claiming && me.seated) { L.claiming = false; if (L.app && L.app.isConnected) mountCity(L.app); return; }
    if (!L.app || !L.app.isConnected || !document.getElementById("lg-bar")) return;
    // 내 도시를 다른 기기에서 처음 여는 경우: 진행자에게 남은 계획을 가져온다.
    if (me.plan && me.rev > L.rev && L.rev === 0 && isEmptyDoc()) adoptPlan(me);
    const rd = curRound();
    BG.setSeason(rd.season);
    BG.refresh();
    if (prev && (prev.phase !== V.phase || prev.round !== V.round)) phaseChanged(V);
    renderBar();
    if (L.panel) renderPanel();
  }
  function curRound() { const reg = R(), V = L.snap; return reg.rounds[Math.max(0, (V ? V.round : 1) - 1)] || reg.rounds[0]; }
  function isEmptyDoc() { const d = L.doc, st = d && d.maps[d.map]; return !st || (!st.builds.length && !st.lines.length); }
  function adoptPlan(me) {
    const st = L.doc.maps[L.doc.map];
    Object.assign(st, { builds: me.plan.builds || [], lines: me.plan.lines || [], policies: me.plan.policies || [], shed: me.plan.shed || "home", fab2: !!me.plan.fab2 });
    L.rev = me.rev;
    mountCity(L.app);
  }
  function phaseChanged(V) {
    const live = document.getElementById("lg-live");
    const evn = (V.events || []).filter(x => x.round === V.round).map(x => (C.eventDef(R(), x.id) || {}).name).filter(Boolean);
    const t = V.phase === "plan" ? `${V.round}라운드 계획 시작${evn.length ? ` · 사건: ${evn.join(", ")}` : " — 짓고 협상하세요"}` : V.phase === "review" ? `${V.round}라운드 결과가 나왔습니다` : V.phase === "end" ? "리그가 끝났습니다" : PHASE_NAME[V.phase];
    BG.toast(t);
    if (live) live.textContent = t;
    if (V.phase === "review" || V.phase === "end") openPanel("result");
    else if (V.phase === "plan" && evn.length) openPanel("deal");
  }
  function lockMsg() {
    const V = L && L.snap;
    if (!V) return "";
    return V.phase === "lobby" || V.phase === "plan" ? "" : V.phase === "end" ? "리그가 끝났습니다" : "지금은 운영·결과 단계 — 다음 라운드 계획 때 지을 수 있어요";
  }
  function mountCity(app) {
    teamSave();
    const reg = R(), t = C.teamDef(reg, L.team), s = tdata();
    const raw = s.docs[t.pack];
    // 건설 화면의 저장 문서 모양({v, map, maps, journal ...})을 이 도시 하나로 쓴다.
    BG.selectPack(t.pack, "league");
    const st = BG.sanitize(raw && raw.maps ? raw.maps[t.pack] : null, 1e9);
    L.doc = { v: 2, map: t.pack, maps: { [t.pack]: st }, runs: raw && Number.isInteger(raw.runs) ? raw.runs : 0, jAuto: true, journal: raw && Array.isArray(raw.journal) ? raw.journal : [] };
    L.rev = Math.max(L.rev, s.rev || 0);
    BG.mount(app, {
      packs: [t.pack], league: true,
      load: () => L.doc,
      save: doc => { const z = tdata(); z.docs[t.pack] = { maps: doc.maps, runs: doc.runs, journal: doc.journal }; z.rev = L.rev; store.set(dataKey(), z); },
      budget: () => (L.snap && L.snap.teams[L.team] ? L.snap.teams[L.team].budget : C.budget({ round: 1, ties: [], region: REGION }, L.team)),
      locked: lockMsg,
      season: () => curRound().season,
      onChange: () => { L.rev++; const z = tdata(); z.rev = L.rev; store.set(dataKey(), z); clearTimeout(L.planT); L.planT = setTimeout(sendPlan, 400); },
      onMount: root => { addBar(root); window.dispatchEvent(new Event("resize")); }
    });
    send("claim");
    sendPlan();
  }
  function sendPlan() {
    const st = BG.current();
    if (!st || !L.team) return;
    send("plan", { rev: L.rev, plan: { builds: st.builds, lines: st.lines, policies: st.policies, shed: st.shed, fab2: st.fab2, missions: st.missions, seed: st.seed, season: st.season } });
  }
  function addBar(root) {
    const bar = document.createElement("div");
    bar.className = "lg-bar";
    bar.id = "lg-bar";
    bar.style.setProperty("--c", teamCol(L.team));
    bar.innerHTML = `<span class="lg-bteam">${esc(teamName(L.team))}</span>
      <span class="lg-bround" id="lg-bround"></span>
      <span class="lg-bphase" id="lg-bphase"></span><b class="lg-timer num" id="lg-timer"></b>
      <span class="lg-conn" id="lg-conn" data-s="${esc(L.conn.status())}">${connLabel(L.conn.status())}</span>
      <button type="button" class="lg-bbtn" data-panel="deal">이웃·거래<b class="lg-badge" id="lg-badge" hidden></b></button>
      <button type="button" class="lg-bbtn" data-panel="result">결과</button>
      <button type="button" class="lg-bbtn" data-panel="journal">일지</button>
      <button type="button" class="lg-bbtn lg-readybtn" id="lg-ready" aria-pressed="false">준비</button>
      <p class="lg-sr" id="lg-live" aria-live="polite"></p>`;
    root.append(bar);
    const panel = document.createElement("aside");
    panel.className = "lg-panel";
    panel.id = "lg-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "리그");
    root.append(panel);
    bar.addEventListener("click", e => {
      const p = e.target.closest("[data-panel]");
      if (p) { L.panel === p.dataset.panel ? closePanel() : openPanel(p.dataset.panel); return; }
      if (e.target.closest("#lg-ready")) { const me = L.snap && L.snap.teams[L.team]; send("ready", { ready: !(me && me.ready) }); }
    });
    panel.addEventListener("click", onPanelClick);
    panel.addEventListener("change", onPanelChange);
    panel.addEventListener("input", e => { const r = e.target.closest("#lg-price"); if (r) { const o = document.getElementById("lg-price-v"); if (o) o.textContent = (+r.value).toFixed(3); } });
    renderBar();
  }
  function renderBar() {
    const V = L.snap, reg = R();
    const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    if (!V) { set("lg-bround", "진행자 연결 대기"); set("lg-bphase", ""); return; }
    const rd = curRound();
    set("lg-bround", V.round ? `${V.round}/${reg.rounds.length}R · ${SEASON_NAME[rd.season]}` : `준비 · 1R ${SEASON_NAME[reg.rounds[0].season]}`);
    set("lg-bphase", PHASE_NAME[V.phase]);
    const me = V.teams[L.team], rb = document.getElementById("lg-ready");
    if (rb) { rb.setAttribute("aria-pressed", String(!!me.ready)); rb.textContent = me.ready ? "준비 ✓" : "준비"; }
    const inc = V.ties.filter(T => T.st === "prop" && T.by !== L.team && (T.a === L.team || T.b === L.team)).length;
    const bd = document.getElementById("lg-badge");
    if (bd) { bd.hidden = !inc; bd.textContent = String(inc); }
    tickTimer();
  }
  function openPanel(tab) { L.panel = tab; const p = document.getElementById("lg-panel"); if (!p) return; p.hidden = false; renderPanel(); document.querySelectorAll(".lg-bar [data-panel]").forEach(b => b.setAttribute("aria-expanded", String(b.dataset.panel === tab))); }
  function closePanel() { L.panel = null; const p = document.getElementById("lg-panel"); if (p) p.hidden = true; document.querySelectorAll(".lg-bar [data-panel]").forEach(b => b.setAttribute("aria-expanded", "false")); }
  // 내 도시 안에서 그 이웃 쪽 외부 연결점까지 선이 이어졌나
  function gateLinked(other) {
    const st = BG.current();
    if (!st) return false;
    const N = BG.network(st);
    return N.nodes.some(n => n.kind === "import" && (BG.SITES[n.si].to || []).includes(other) && n.comp >= 0 && n.att.length > 0 && N.comps.some(Cc => Cc.disp.includes(n) && (Cc.towns.length || Cc.ren.length || Cc.disp.length > 1)));
  }
  function renderPanel() {
    const p = document.getElementById("lg-panel");
    if (!p || !L.panel) return;
    const V = L.snap, reg = R(), tab = L.panel;
    let body = "";
    if (!V) body = `<p class="lg-hint">진행자 연결을 기다리는 중입니다.</p>`;
    else if (tab === "deal") {
      const me = V.teams[L.team], open = V.phase === "lobby" || V.phase === "plan";
      const nbs = reg.ties.filter(D => (D.a === L.team || D.b === L.team) && V.teams[D.a] && V.teams[D.b]);
      const st0 = BG.current(), spent = st0 ? BG.capex(st0) : 0, left = me.budget - spent;
      const evh = V.round ? evCards(V, V.round, L.team) : "";
      body = `${evh ? `<section class="lg-sec"><h3>이번 라운드 사건</h3>${evh}</section>` : ""}<p class="lg-left">남은 예산 <b class="num" data-bad="${left < 6}">${fmt(left, 1)}억</b> <small>(이번 라운드 예산 ${fmt(me.budget, 1)}억 − 건설 ${fmt(spent, 1)}억 · 연계선은 두 도시가 반씩)</small></p>
        <section class="lg-sec"><h3>내 전기 판매 단가</h3>
          <p class="lg-hint">이웃이 모자랄 때 남는 전기를 이 값에 팝니다(MWh당 억). 화력 여유분은 연료비보다 비쌀 때만 팝니다.</p>
          <label class="lg-price"><input type="range" id="lg-price" min="${C.PRICE.min}" max="${C.PRICE.max}" step="0.001" value="${me.price}" ${open ? "" : "disabled"} aria-label="판매 단가"><b class="num" id="lg-price-v">${me.price.toFixed(3)}</b></label></section>
        <section class="lg-sec"><h3>이웃 연계선</h3><ul class="lg-nbs">${nbs.map(D => {
          const other = D.a === L.team ? D.b : D.a, T = V.ties.find(x => x.a === D.a && x.b === D.b);
          const half2 = D.cost / 2, half4 = D.cost * 1.6 / 2, linked = gateLinked(other);
          let st = "", act = "";
          if (!T) { st = "없음"; act = open ? `<button type="button" class="v2-btn" data-tie="propose" data-other="${other}" data-cap="2">2 MW 제안 (내 몫 ${fmt(half2, 1)}억)</button><button type="button" class="v2-btn" data-tie="propose" data-other="${other}" data-cap="4">4 MW 제안 (${fmt(half4, 1)}억)</button>` : ""; }
          else if (T.st === "built") st = `${T.cap} MW 연결됨`;
          else if (T.by === L.team) { st = `${T.cap} MW 제안함 · 답 기다림`; act = open ? `<button type="button" class="v2-btn" data-tie="cancel" data-other="${other}">제안 거두기</button>` : ""; }
          else { st = `${teamName(T.by)}이(가) ${T.cap} MW 제안`; act = open ? `<button type="button" class="v2-btn primary" data-tie="accept" data-other="${other}">수락 (내 몫 ${fmt(C.tieCost(reg, T) / 2, 1)}억)</button>` : ""; }
          return `<li style="--c:${teamCol(other)}"><div class="lg-nbh"><b>${esc(teamName(other))}</b><span>${esc(D.name)} · ${D.kind === "sea" ? "해저" : D.kind === "bay" ? "만 횡단" : "육상"}</span><span class="lg-gate" data-ok="${linked}">${linked ? "연결점까지 선 이음" : "연결점(노란 칸)까지 선 필요"}</span></div>
            <p class="lg-nbs-st">${esc(st)}</p><div class="lg-acts">${act}</div></li>`;
        }).join("")}</ul></section>`;
    } else if (tab === "result") {
      const res = V.results[V.results.length - 1];
      if (!res) body = `<p class="lg-hint">라운드를 운영하면 결과가 여기에 나옵니다. 그 전에는 아래 [1주] 버튼으로 <b>우리 도시만</b> 시험 운전해 볼 수 있습니다(이웃 거래 없이).</p>`;
      else {
        const r = res.team[L.team], g = V.goals || reg.goals;
        const rank = actT(V).filter(t => res.team[t.id]).map(t => ({ t, r: res.team[t.id] }));
        body = `<section class="lg-sec"><h3>${res.round}라운드 · ${SEASON_NAME[res.season]} ${res.days}일 — ${esc(teamName(L.team))}</h3>
          <dl class="lg-kpi">
            <div><dt>정전</dt><dd class="num" data-bad="${r.unsPct > g.unsPct}">${fmt(r.unsPct, 2)}%</dd><small>혼자였다면 ${fmt(100 * r.isolated.uns / Math.max(1e-9, r.dem), 2)}%</small></div>
            <div><dt>병원 정전</dt><dd class="num" data-bad="${r.hospH > 0}">${r.hospH}시간</dd></div>
            <div><dt>사 온 전기 / 판 전기</dt><dd class="num">${fmt(r.imp, 1)} / ${fmt(r.exp, 1)} MWh</dd><small>거래 수지 ${fmt(r.earn - r.pay, 2)}억</small></div>
            <div><dt>CO₂ 생산 / 소비 기준</dt><dd class="num">${fmt(r.co2Prod)} / ${fmt(r.co2Cons)} t</dd></div>
            <div><dt>총비용</dt><dd class="num">${fmt(r.cost.total, 1)}억</dd><small>건설 ${fmt(r.cost.capex, 1)} · 연계선 ${fmt(r.cost.ties, 1)} · 연료 ${fmt(r.cost.fuel, 1)}</small></div>
            <div><dt>최저 만족 · 민원</dt><dd class="num">${r.sat} · ${r.cp}건</dd></div>
          </dl>
          ${res.events && res.events.length ? `<div class="lg-evres">${evCards(V, res.round, L.team)}</div>` : ""}${res.tieDown ? `<p class="lg-warn">고장 난 연계선: ${res.tieDown.split("~").map(teamName).map(esc).join("–")}</p>` : ""}
          ${r.unlinked.length ? `<p class="lg-warn">연계선이 있어도 연결점까지 선이 없어 거래 못 함: ${r.unlinked.map(teamName).map(esc).join(", ")}</p>` : ""}
          <p class="lg-goals"><span data-ok="${res.region.ok.uns}">지역 정전 ${fmt(res.region.unsPct, 2)}%</span><span data-ok="${res.region.ok.co2}">지역 CO₂ ${fmt(res.region.co2)} t / ${fmt(g.co2)} t</span></p></section>
          <section class="lg-sec"><h3>다른 도시</h3><table class="lg-table lg-mini"><thead><tr><th scope="col">팀</th><th scope="col">정전</th><th scope="col">CO₂ 생산</th><th scope="col">수입/수출</th></tr></thead><tbody>
          ${rank.map(x => `<tr style="--c:${x.t.color}" ${x.t.id === L.team ? 'data-me="true"' : ""}><th scope="row">${esc(x.t.name)}</th><td class="num">${fmt(x.r.unsPct, 2)}%</td><td class="num">${fmt(x.r.co2Prod)}</td><td class="num">${fmt(x.r.imp, 1)}/${fmt(x.r.exp, 1)}</td></tr>`).join("")}</tbody></table></section>`;
      }
    } else {
      const J = tdata().journal[V.round || 0] || {};
      body = `<section class="lg-sec"><h3>${V.round ? `${V.round}라운드` : "준비"} 일지</h3><p class="lg-hint">이 기기에만 저장됩니다.</p>
        ${JQ.map(q => `<label class="lg-jq"><span>${esc(q.q)}</span><textarea data-j="${q.k}" rows="3" maxlength="1000">${esc(J[q.k] || "")}</textarea></label>`).join("")}
        <button type="button" class="v2-btn" id="lg-jcopy">활동지로 복사</button></section>`;
    }
    p.innerHTML = `<div class="lg-ptabs" role="group" aria-label="리그 서랍">${[["deal", "이웃·거래"], ["result", "결과"], ["journal", "일지"]].map(([k, n]) => `<button type="button" class="lg-ptab" data-ptab="${k}" aria-pressed="${k === tab}">${n}</button>`).join("")}<button type="button" class="lg-px" data-pclose aria-label="닫기">×</button></div><div class="lg-pbody">${body}</div>`;
  }
  function onPanelClick(e) {
    const t = e.target.closest("[data-ptab]"), x = e.target.closest("[data-pclose]"), tie = e.target.closest("[data-tie]");
    if (x) { closePanel(); return; }
    if (t) { openPanel(t.dataset.ptab); return; }
    if (tie) { send("tie", { op: tie.dataset.tie, other: tie.dataset.other, cap: +tie.dataset.cap || 2 }); tie.disabled = true; return; }
    if (e.target.closest("#lg-jcopy")) {
      const V = L.snap, J = tdata().journal[V ? V.round : 0] || {}, res = V && V.results[V.results.length - 1];
      const r = res && res.team[L.team];
      const txt = [`[${R().name} 전력 리그] ${teamName(L.team)} · ${V && V.round ? `${V.round}라운드` : "준비"}`,
        r ? `결과: 정전 ${fmt(r.unsPct, 2)}% · 병원 정전 ${r.hospH}h · CO₂ 생산 ${fmt(r.co2Prod)} t / 소비 ${fmt(r.co2Cons)} t · 수입 ${fmt(r.imp, 1)} / 수출 ${fmt(r.exp, 1)} MWh` : "",
        ...JQ.map(q => `■ ${q.q}\n${J[q.k] || ""}`)].filter(Boolean).join("\n\n");
      copyText(txt, "일지를 복사했습니다", e.target.closest("#lg-jcopy"));
    }
  }
  function onPanelChange(e) {
    const pr = e.target.closest("#lg-price");
    if (pr) { send("price", { price: +pr.value }); return; }
    const j = e.target.closest("[data-j]");
    if (j) {
      const s = tdata(), rd = L.snap ? L.snap.round : 0;
      s.journal[rd] = s.journal[rd] || {}; s.journal[rd][j.dataset.j] = j.value.slice(0, 1000);
      store.set(dataKey(), s);
    }
  }
  function copyText(text, ok, btn) {
    const done = () => { if (btn) { const o = btn.textContent; btn.textContent = ok; setTimeout(() => { btn.textContent = o; }, 1600); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => window.prompt("복사하세요", text));
    else window.prompt("복사하세요", text);
  }

  KCP.route("league", (app, arg) => {
    if (arg === "host") hostView(app);
    else if (/^view\//.test(arg || "")) viewCity(app, arg.slice(5));
    else if (arg === "team") teamView(app);
    else lobby(app, /^j=/.test(arg || "") ? arg.slice(2) : null);
  });
  // 검사용
  KCP.league = {
    state: () => (L ? { role: L.role, room: L.room, team: L.team, S: L.S, snap: L.snap, rev: L.rev } : null),
    next: () => L && L.role === "host" && hostNext(),
    // 팀 기기에서 계획을 코드로 고친다(검사·시연 녹화용). 화면 조작과 같은 길(rev 올림 → 진행자에게 보냄).
    plan: fn => { const st = BG.current(); if (!st || !L || L.role !== "team" || lockMsg()) return false; fn(st); L.rev++; sendPlan(); BG.refresh(); return true; }
  };
})();
