/* 공통 엔진: 라우팅, 저장, 타이머, 면접실·성찰 단계, 차트 도구.
 * 확장 계약: 모듈은 이벤트와 빈 DOM 슬롯을 사용하고, 저장은 키별로 대기한다.
 * ext CSS는 쉼표로 나눈 각 선택자를 자기 접두어로 시작하고 한 줄에 하나씩 쓴다.
 * #strip의 id와 sticky 배치는 유지한다. 모듈은 offsetHeight와 계산된 top만 읽는다.
 */
(function () {
  const KCP = window.KCP;
  KCP.games = KCP.games || {};

  /* ---------- 작은 도구 ---------- */
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  KCP.esc = esc;
  KCP.$ = (sel, root) => (root || document).querySelector(sel);
  KCP.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  KCP.toast = function (msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  };

  /* ---------- 저장 (브라우저 로컬, 실패해도 동작) ---------- */
  const KEY = (y) => "kcp:v1:" + y;
  const plain = (v) => v && typeof v === "object" && !Array.isArray(v);
  const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const pending = new Map();
  function cancel(key) {
    const entry = pending.get(key);
    if (entry) clearTimeout(entry.timer);
    pending.delete(key);
  }
  function run(key) {
    const entry = pending.get(key);
    if (!entry) return;
    cancel(key);
    try {
      localStorage.setItem(key, JSON.stringify(entry.value));
    } catch (e) {}
  }
  function schedule(key, value) {
    cancel(key);
    pending.set(key, { value, timer: setTimeout(() => run(key), 250) });
  }
  function read(key, def) {
    try {
      if (pending.has(key)) return clone(pending.get(key).value);
      const value = localStorage.getItem(key);
      if (value !== null) return JSON.parse(value);
    } catch (e) {}
    return clone(def);
  }
  function remove(key) {
    cancel(key);
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }
  KCP.load = function (year) {
    const base = { phase: "prep", memo: "", answers: {}, rubric: {}, game: {}, timer: null,
      answerQ: {}, compare: { before: "", open: false, better: "", gap: "" }, ext: {} };
    const state = Object.assign(base, read(KEY(year), null) || {});
    ["answers", "rubric", "game", "answerQ", "ext"].forEach((key) => {
      if (!plain(state[key])) state[key] = {};
    });
    state.compare = Object.assign({ before: "", open: false, better: "", gap: "" }, plain(state.compare) ? state.compare : {});
    return state;
  };
  KCP.save = function (year, state) {
    schedule(KEY(year), state);
  };
  KCP.flush = function () {
    Array.from(pending.keys()).forEach(run);
  };
  KCP.reset = function (year) {
    remove(KEY(year));
    const goal = KCP.goal.get();
    if (goal && String(goal.src) === String(year)) remove(KEY("x:goal"));
  };
  KCP.clearAll = function () {
    Timer.stop();
    KCP.speakStop();
    Array.from(pending.keys()).forEach(cancel);
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith("kcp:")) localStorage.removeItem(key);
      }
    } catch (e) {}
    KCP.emit("storage:clear", {});
  };
  KCP.store = {
    get(name, def) {
      return String(name).startsWith("s-") ? clone(def) : read(KEY("x:" + name), def);
    },
    set(name, value) {
      if (!String(name).startsWith("s-")) schedule(KEY("x:" + name), value);
    },
    remove(name) {
      if (!String(name).startsWith("s-")) remove(KEY("x:" + name));
    },
  };
  KCP.ext = function (state, name, defaults) {
    if (!plain(state.ext)) state.ext = {};
    if (!plain(state.ext[name])) state.ext[name] = clone(defaults);
    else Object.keys(defaults).forEach((key) => {
      if (state.ext[name][key] === undefined) state.ext[name][key] = clone(defaults[key]);
    });
    return state.ext[name];
  };
  // 성찰 입력을 비우면 그 해가 정한 목표는 지워진다.
  KCP.goal = {
    get() {
      const v = KCP.store.get("goal", null);
      return plain(v) && typeof v.text === "string" && v.text !== ""
        ? { src: String(v.src || ""), title: String(v.title || ""), text: v.text, at: Number(v.at) || 0 } : null;
    },
    set(src, title, text) {
      const t = String(text == null ? "" : text).trim();
      if (t) KCP.store.set("goal", { src: String(src), title: String(title), text: t, at: Date.now() });
    },
  };
  window.addEventListener("pagehide", KCP.flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") KCP.flush();
  });

  /* ---------- 이벤트와 설정 ---------- */
  const listeners = new Map();
  KCP.on = function (evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, []);
    const entry = { fn };
    listeners.get(evt).push(entry);
    return () => {
      const list = listeners.get(evt);
      const i = list.indexOf(entry);
      if (i !== -1) list.splice(i, 1);
    };
  };
  KCP.emit = function (evt, payload) {
    (listeners.get(evt) || []).slice().forEach(({ fn }) => {
      try { fn(payload); } catch (e) { setTimeout(() => { throw e; }); }
    });
  };
  const DEF = { timeMode: "real", prep: 15, answer: 8, think: 0, endAlert: true };
  const validSetting = {
    timeMode: (v) => ["real", "ext", "custom", "free"].includes(v),
    prep: (v) => Number.isInteger(v) && v >= 1 && v <= 90,
    answer: (v) => Number.isInteger(v) && v >= 1 && v <= 90,
    think: (v) => [0, 10, 30].includes(v),
    endAlert: (v) => typeof v === "boolean",
  };
  function applySettings(target, patch) {
    if (plain(patch)) Object.keys(DEF).forEach((key) => {
      if (validSetting[key](patch[key])) target[key] = patch[key];
    });
    return target;
  }
  const norm = (v) => applySettings(Object.assign({}, DEF), v);
  function urlTimes() {
    const params = new URLSearchParams(location.search);
    const prep = params.get("prep"), answer = params.get("answer");
    return /^[0-9]{1,2}$/.test(prep) && /^[0-9]{1,2}$/.test(answer)
      && validSetting.prep(Number(prep)) && validSetting.answer(Number(answer))
      ? { prep: Number(prep), answer: Number(answer) } : null;
  }
  KCP.settings = function () {
    const s = norm(KCP.store.get("settings", null)), u = urlTimes();
    if (u) return { timeMode: s.timeMode === "ext" || s.timeMode === "free" ? s.timeMode : "custom",
      prep: u.prep, answer: u.answer, think: s.think, endAlert: s.endAlert, fromUrl: true };
    return Object.assign(s, { fromUrl: false });
  };
  KCP.setSettings = function (patch) {
    const cur = applySettings(norm(KCP.store.get("settings", null)), patch);
    KCP.store.set("settings", cur);
    KCP.emit("settings:change", { settings: KCP.settings() });
    return KCP.settings();
  };
  KCP.minutes = function (year, of) {
    if (!Object.hasOwn(KCP.YEARS, year)) return null;
    const meta = KCP.YEARS[year];
    if (!meta) return null;
    const s = KCP.settings(), key = of === "answer" ? "answer" : "prep";
    if (s.timeMode === "free") return null;
    if (s.timeMode === "custom") return s[key];
    if (s.timeMode === "ext") return (s.fromUrl ? s[key] : meta[key]) * 1.5;
    return meta[key];
  };

  /* ---------- 문자열과 게임 이름 ---------- */
  KCP.fmt = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  KCP.mss = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  KCP.qkey = function (q) {
    if (typeof q.k === "string" && q.k !== "") return q.k;
    const text = (q.tag || "") + "|" + q.q;
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  };
  KCP.srcTag = (q) => q && q.src === "report"
    ? '<span class="tag-official">보고서 문항</span>' : '<span class="tag-mine">연습용 질문</span>';
  KCP.josa = function (word, pair) {
    const w = String(word).trim(), code = w.charCodeAt(w.length - 1);
    const jong = code >= 0xAC00 && code <= 0xD7A3 ? (code - 0xAC00) % 28 : null;
    const endings = {
      "을/를": ["을", "를", "을(를)"], "이/가": ["이", "가", "이(가)"],
      "은/는": ["은", "는", "은(는)"], "와/과": ["과", "와", "과(와)"],
      "이고/고": ["이고", "고", "이고"], "으로/로": ["으로", "로", "(으)로"],
    };
    const choices = Object.hasOwn(endings, pair) ? endings[pair] : null;
    if (!choices) return w;
    return w + choices[jong === null ? 2 : jong && !(pair === "으로/로" && jong === 8) ? 0 : 1];
  };
  KCP.critSentence = function (crit) {
    if (!Array.isArray(crit)) return "";
    const items = crit.map((v) => ({ n: String(v && v.n || "").trim(), w: v && [1, 2, 3].includes(v.w) ? v.w : 0 }))
      .filter((v) => v.n).slice(0, 3);
    if (!items.length) return "";
    const head = "제가 판단 기준으로 삼은 것은 ";
    if (items.length === 1 || items.some((v) => !v.w)) return head + items.map((v) => v.n).join(", ") + "입니다.";
    const max = Math.max(...items.map((v) => v.w)), top = items.filter((v) => v.w === max);
    let tail;
    if (top.length === 1) tail = KCP.josa(top[0].n, "을/를") + " 가장 무겁게 두었습니다.";
    else if (top.length === items.length) tail = (items.length === 2 ? "두 기준을" : "세 기준을") + " 같은 무게로 두었습니다.";
    else tail = KCP.josa(top[0].n, "와/과") + " " + KCP.josa(top[1].n, "을/를") + " 똑같이 가장 무겁게 두었습니다.";
    return head + items.slice(0, -1).map((v) => v.n + ", ").join("") + KCP.josa(items[items.length - 1].n, "이고/고") + ", " + tail;
  };
  KCP.tradeSentence = function (o) {
    const pick = String(o && o.pick || "").trim(), gain = String(o && o.gain || "").trim(), cost = String(o && o.cost || "").trim();
    if (!pick || (!gain && !cost)) return "";
    const p = KCP.josa(pick, "은/는") + " ";
    if (gain && cost) return p + gain + " 면에서 유리하지만 " + cost + " 면에서는 불리합니다.";
    return gain ? p + gain + " 면에서 유리합니다." : p + cost + " 면에서 불리합니다.";
  };
  KCP.findCriterion = function (year, re) {
    if (!Object.hasOwn(KCP.YEARS, year)) return null;
    const meta = KCP.YEARS[year];
    return meta ? Object.values(meta.rubric).flat().find((text) => {
      re.lastIndex = 0;
      return re.test(text);
    }) || null : null;
  };
  KCP.gameLabel = (id) => KCP.YEARS[id].original ? KCP.YEARS[id].title : id + "학년도 " + KCP.YEARS[id].title;
  KCP.gameShort = (id) => KCP.YEARS[id].original ? KCP.YEARS[id].title : id + " " + KCP.YEARS[id].title;

  /* ---------- 말해 보기와 인쇄 ---------- */
  let active = null;
  const speakers = new WeakMap();
  KCP.speak = function (container, opts) {
    const previous = speakers.get(container);
    if (previous) previous.end(false);
    const o = opts || {};
    container.innerHTML = '<span class="speak"><button type="button" class="btn small speak-go" aria-pressed="false">말해 보기</button><span class="speak-t small num" aria-live="off"></span><span class="sr-only" aria-live="polite"></span></span>';
    const button = KCP.$(".speak-go", container), display = KCP.$(".speak-t", container), live = KCP.$(".sr-only", container);
    let phase = "idle", started = 0, think = 0, timer = null;
    const elapsed = () => Math.max(0, Math.floor((Date.now() - started) / 1000));
    function end(notify = true) {
      const talking = phase === "talk", seconds = Math.min(600, elapsed());
      clearInterval(timer);
      timer = null;
      phase = "idle";
      if (active === widget) active = null;
      button.textContent = "말해 보기";
      button.setAttribute("aria-pressed", "false");
      display.textContent = "";
      live.textContent = "";
      if (!notify || !talking) return;
      const minutes = Math.floor(seconds / 60);
      live.textContent = "말하기 끝, " + (minutes ? minutes + "분 " : "") + (seconds % 60) + "초";
      if (typeof o.onEnd === "function") o.onEnd(seconds);
      else display.textContent = "방금 " + KCP.mss(seconds);
    }
    function paintTalk() {
      display.textContent = "말하는 중 " + KCP.mss(Math.min(600, elapsed())) + (o.rec ? " · 권장 " + o.rec : "");
    }
    function talk() {
      phase = "talk";
      started = Date.now();
      button.textContent = "끝";
      button.setAttribute("aria-pressed", "true");
      live.textContent = "말하기 시작";
      paintTalk();
    }
    function tick() {
      if (!container.isConnected) { end(false); return; }
      if (phase === "think") {
        const left = Math.max(0, think - elapsed());
        if (!left) talk();
        else display.textContent = "생각 " + KCP.mss(left);
      } else if (phase === "talk") {
        if (elapsed() >= 600) end();
        else paintTalk();
      }
    }
    const widget = { end };
    speakers.set(container, widget);
    button.onclick = () => {
      if (phase === "talk") { end(); return; }
      if (phase === "think") { talk(); return; }
      if (active) active.end();
      active = widget;
      think = KCP.settings().think;
      live.textContent = "";
      if (think > 0) {
        phase = "think";
        started = Date.now();
        button.textContent = "바로 말하기";
        button.setAttribute("aria-pressed", "false");
        display.textContent = "생각 " + KCP.mss(think);
      } else talk();
      timer = setInterval(tick, 250);
    };
    return { stop() { if (active === widget) end(); } };
  };
  KCP.speakStop = function () {
    if (active) active.end();
  };
  KCP.print = function (html) {
    let sheet = document.getElementById("printSheet");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.id = "printSheet";
      document.body.appendChild(sheet);
    }
    sheet.innerHTML = html;
    document.documentElement.classList.add("kcp-printing");
    window.print();
  };
  window.addEventListener("afterprint", () => {
    document.documentElement.classList.remove("kcp-printing");
    const sheet = document.getElementById("printSheet");
    if (sheet) sheet.innerHTML = "";
  });
  KCP.roomAlt = function (open) {
    const main = document.getElementById("room-main"), alt = document.getElementById("room-alt");
    if (!main || !alt) return false;
    main.hidden = !!open;
    alt.hidden = !open;
    return true;
  };

  /* ---------- 클립보드 ---------- */
  KCP.copy = function (text, fallbackEl) {
    const done = () => KCP.toast("복사했습니다");
    const fail = () => {
      if (fallbackEl) {
        fallbackEl.hidden = false;
        fallbackEl.value = text;
        fallbackEl.focus();
        fallbackEl.select();
        KCP.toast("아래 상자의 글을 직접 복사하세요");
      }
    };
    try {
      navigator.clipboard.writeText(text).then(done, fail);
    } catch (e) {
      fail();
    }
  };

  /* ---------- 차트 ---------- */
  // 가로 막대: rows [{label, v, v2?}], max, opts {unit, c1, c2, legend}
  KCP.hbar = function (rows, opts) {
    const o = Object.assign({ max: 100, unit: "", c1: "var(--accent)", c2: "var(--ink-3)", w: 460 }, opts || {});
    const lw = o.labelW || 110;
    const bh = o.v2 ? 9 : 14;
    const rowH = o.v2 ? 30 : 24;
    const top = 18;
    const h = top + rows.length * rowH + 8;
    const cw = o.w - lw - 44;
    const x = (v) => lw + (v / o.max) * cw;
    let g = "";
    const ticks = o.ticks || [0, o.max / 2, o.max];
    ticks.forEach((t) => {
      g += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${top - 4}" y2="${h - 6}"/>`;
      g += `<text x="${x(t)}" y="${top - 7}" text-anchor="middle">${t}</text>`;
    });
    rows.forEach((r, i) => {
      const y = top + i * rowH + 4;
      g += `<text x="${lw - 6}" y="${y + (o.v2 ? 12 : 11)}" text-anchor="end">${esc(r.label)}</text>`;
      if (o.v2) {
        if (r.v2 != null) g += `<rect x="${lw}" y="${y}" width="${Math.max(0, x(r.v2) - lw)}" height="${bh}" fill="${o.c2}"/>`;
        g += `<rect x="${lw}" y="${y + bh + 1}" width="${Math.max(0, x(r.v) - lw)}" height="${bh}" fill="${o.c1}"/>`;
      } else {
        g += `<rect x="${lw}" y="${y}" width="${Math.max(0, x(r.v) - lw)}" height="${bh}" fill="${o.c1}" rx="1"/>`;
        g += `<text x="${x(r.v) + 4}" y="${y + 11}">${r.v}${o.unit}</text>`;
      }
    });
    return `<svg class="chart" viewBox="0 0 ${o.w} ${h}" role="img" aria-label="${esc(o.aria || "막대 그래프")}">${g}</svg>`;
  };

  // 세로 막대: cats [labels], series [{name, color, data}], opts {max, err}
  KCP.vbar = function (cats, series, opts) {
    const o = Object.assign({ max: 100, w: 460, h: 220, ticks: [0, 20, 40, 60, 80, 100] }, opts || {});
    const L = 34, R = 8, T = 12, B = 30;
    const cw = o.w - L - R, ch = o.h - T - B;
    const y = (v) => T + ch - (v / o.max) * ch;
    const gw = cw / cats.length;
    const bw = Math.min(26, (gw * 0.7) / series.length);
    let g = "";
    o.ticks.forEach((t) => {
      g += `<line class="grid" x1="${L}" x2="${o.w - R}" y1="${y(t)}" y2="${y(t)}"/>`;
      g += `<text x="${L - 5}" y="${y(t) + 4}" text-anchor="end">${t}</text>`;
    });
    cats.forEach((c, i) => {
      const cx = L + gw * i + gw / 2;
      g += `<text x="${cx}" y="${o.h - 12}" text-anchor="middle">${esc(c)}</text>`;
      series.forEach((s, j) => {
        const v = s.data[i];
        if (v == null) return;
        const bx = cx - (series.length * bw) / 2 + j * bw;
        g += `<rect x="${bx}" y="${y(v)}" width="${bw - 2}" height="${Math.max(0, y(0) - y(v))}" fill="${s.color}"/>`;
        if (o.err && o.err[i]) {
          const e = o.err[i];
          const ex = bx + (bw - 2) / 2;
          g += `<line x1="${ex}" x2="${ex}" y1="${y(v + e)}" y2="${y(Math.max(0, v - e))}" stroke="var(--bad)" stroke-width="1.5"/>`;
          g += `<line x1="${ex - 3}" x2="${ex + 3}" y1="${y(v + e)}" y2="${y(v + e)}" stroke="var(--bad)" stroke-width="1.5"/>`;
        }
      });
    });
    g += `<line class="axis" x1="${L}" x2="${o.w - R}" y1="${y(0)}" y2="${y(0)}"/>`;
    if (o.xlabel) g += `<text x="${o.w - R}" y="${o.h - 1}" text-anchor="end">${esc(o.xlabel)}</text>`;
    if (o.ylabel) g += `<text x="2" y="9">${esc(o.ylabel)}</text>`;
    let leg = "";
    if (series.length > 1 || o.legend) {
      leg = `<div class="legend small">${series
        .map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`)
        .join("")}</div>`;
    }
    return `<svg class="chart" viewBox="0 0 ${o.w} ${o.h}" role="img" aria-label="${esc(o.aria || "막대 그래프")}">${g}</svg>${leg}`;
  };

  // 선/계단 그래프: series [{name,color,data,step}], xs [numbers], opts {min,max,ticks}
  KCP.lines = function (xs, series, opts) {
    const o = Object.assign({ w: 460, h: 220, min: 0, max: 100 }, opts || {});
    const L = 34, R = 10, T = 12, B = 28;
    const cw = o.w - L - R, ch = o.h - T - B;
    const x0 = o.xmin != null ? o.xmin : xs[0];
    const x1 = o.xmax != null ? o.xmax : xs[xs.length - 1];
    const X = (v) => L + ((v - x0) / (x1 - x0)) * cw;
    const Y = (v) => T + ch - ((v - o.min) / (o.max - o.min)) * ch;
    let g = "";
    (o.ticks || []).forEach((t) => {
      g += `<line class="grid" x1="${L}" x2="${o.w - R}" y1="${Y(t)}" y2="${Y(t)}"/>`;
      g += `<text x="${L - 5}" y="${Y(t) + 4}" text-anchor="end">${t}</text>`;
    });
    (o.xticks || xs).forEach((t) => {
      g += `<text x="${X(t)}" y="${o.h - 10}" text-anchor="middle">${t}</text>`;
    });
    if (o.hline != null) g += `<line x1="${L}" x2="${o.w - R}" y1="${Y(o.hline)}" y2="${Y(o.hline)}" stroke="var(--bad)" stroke-width="1"/>`;
    series.forEach((s) => {
      let d = "";
      s.data.forEach((v, i) => {
        if (v == null) return;
        const px = X(s.xs ? s.xs[i] : xs[i]);
        const py = Y(v);
        if (!d) d = `M${px},${py}`;
        else if (s.step) {
          const prev = s.data[i - 1];
          d += ` L${px},${Y(prev)} L${px},${py}`;
        } else d += ` L${px},${py}`;
      });
      if (s.step && s.data.length) d += ` L${X(x1)},${Y(s.data[s.data.length - 1])}`;
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.2}" ${s.dash ? 'stroke-dasharray="5 4"' : ""}/>`;
    });
    if (o.xlabel) g += `<text x="${o.w - R}" y="${o.h}" text-anchor="end">${esc(o.xlabel)}</text>`;
    if (o.ylabel) g += `<text x="2" y="9">${esc(o.ylabel)}</text>`;
    const leg = `<div class="legend small">${series
      .filter((s) => s.name)
      .map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`)
      .join("")}</div>`;
    return `<svg class="chart" viewBox="0 0 ${o.w} ${o.h}" role="img" aria-label="${esc(o.aria || "선 그래프")}">${g}</svg>${leg}`;
  };

  /* ---------- 타이머 ---------- */
  const Timer = {
    id: null,
    start(state, year, onTick) {
      this.stop();
      state.timer.running = true;
      this.id = setInterval(() => {
        state.timer.left = Math.max(0, state.timer.left - 1);
        if (state.timer.left === 0) {
          state.timer.running = false;
          this.stop();
          KCP.toast(state.phase === "prep" ? "준비 시간이 끝났습니다. 면접실로 이동하세요." : "면접 시간이 끝났습니다.");
        }
        KCP.save(year, state);
        onTick();
      }, 1000);
    },
    stop() {
      if (this.id) clearInterval(this.id);
      this.id = null;
    },
  };

  /* ---------- 홈 ---------- */
  function renderHome(app) {
    Timer.stop();
    document.title = "켄텍 창의성 면접 연습실";
    const cards = KCP.ORDER.map((y) => {
      const m = KCP.YEARS[y];
      const st = KCP.load(y);
      const touched = st && (st.memo || Object.keys(st.game || {}).length);
      return `<a class="pkg" href="#y${y}">
        <span class="flap" aria-hidden="true"></span>
        <span class="label">${y}학년도 수시</span>
        <span class="yr">${y}</span>
        <span class="fmt">${esc(m.title)}</span>
        <span class="desc">${esc(m.desc)}</span>
        <span class="meta">
          <span class="chip">${esc(m.format)}</span>
          <span class="chip num">준비 ${m.prep}분 · 답변 ${m.answer}분</span>
          ${touched ? '<span class="chip accent">이어서 하기</span>' : ""}
        </span>
      </a>`;
    }).join("");

    app.innerHTML = `
      <header class="masthead">
        <span class="label">한국에너지공과대학교 수시 일반전형 2단계</span>
        <h1>켄텍 창의성 면접 <em>연습실</em></h1>
        <p class="lede">2022~2026학년도 기출 다섯 해를 각각 게임으로 옮겼습니다. 준비실에서 자료를 조작하며 답을 만들고, 면접실에서 후속 질문에 답한 뒤, 성찰 단계에서 공식 평가 기준으로 스스로 점검합니다.</p>
        <p class="disclaimer">대학의 선행학습 영향평가 보고서(2022~2026)에 공개된 문항과 자료를 학습용으로 재구성한 비공식 연습 도구입니다. 2024학년도 시뮬레이션의 내부 계산식처럼 공개되지 않은 부분은 공개 자료와 예시 답안에 맞춰 새로 설계했고, 화면에 '재구성'이라고 표시했습니다. 입력한 내용은 이 브라우저에만 저장됩니다.</p>
      </header>
      <div class="home-grid">${cards}</div>
      <div id="home-slot" class="stack ext-slot"></div>
      <div class="home-notes">
        <section>
          <h2>면접 공통 원칙</h2>
          <ul>
            <li>고교 교육과정 범위 안에서 이해하고 해결할 수 있는 열린 문항입니다. 정답이나 모범 답안이 없습니다.</li>
            <li>지원자 1명을 면접위원 2명이 평가하며, 답변에 대한 후속 질의응답으로 생각을 전개해 나가는 과정을 봅니다.</li>
            <li>평가 요소는 매년 같습니다. 발산적 사고력, 문제해결 능력, 인문적 통찰 역량입니다.</li>
            <li>대학은 매해 다른 유형을 출제해 기출 정형화에 따른 사교육 효과를 차단하겠다고 밝혔습니다.</li>
          </ul>
        </section>
        <section>
          <h2>이 연습실 쓰는 법</h2>
          <ul>
            <li><b>준비실</b>에서 타이머를 켜고 자료를 조작하며 답을 만듭니다.</li>
            <li><b>면접실</b>에서는 내 계획에 맞춰 나오는 후속 질문에 말로 답해 보고, 핵심을 적어 둡니다.</li>
            <li><b>성찰</b>에서 공식 평가 기준 9개 항목으로 자기 평가를 하고, 출제 의도와 예시 답안을 비교합니다.</li>
            <li>수업에서는 짝이 면접위원 역할을 맡아 후속 질문 카드를 읽어 주면 실제 형식에 가깝습니다.</li>
          </ul>
        </section>
      </div>
      <section class="evo">
        <h2 style="font-size:17px;margin-bottom:8px">다섯 해 형식 변화</h2>
        <table>
          <thead><tr><th>학년도</th><th>과제 형식</th><th>시간</th><th>면접 구성</th><th>핵심 사고</th></tr></thead>
          <tbody>
            <tr><td class="num">2022</td><td>카드·지도·데이터로 발전소 배치</td><td class="num">30 + 25분</td><td>학생부 30 · 창의성 70</td><td>공간 자료 통합, 트레이드오프</td></tr>
            <tr><td class="num">2023</td><td>경로도를 따라 10년 실행 계획</td><td class="num">35 + 25분</td><td>창의성 70 · 학생부 30</td><td>시간축 의사결정, 경쟁국 비교</td></tr>
            <tr><td class="num">2024</td><td>온라인 정착 시뮬레이션, 맞춤형 질문 최대 8개</td><td class="num">35 + 25분</td><td>창의성 70 · 학생부 30</td><td>균형과 집중, 가설 검증</td></tr>
            <tr><td class="num">2025</td><td>가상 신문 4부 발행 순서 추론</td><td class="num">30 + 15분</td><td>창의성 100</td><td>인과 추론, 기술과 사회</td></tr>
            <tr><td class="num">2026</td><td>평가위원이 되어 홍보자료 비판적 평가</td><td class="num">30 + 15분</td><td>창의성 100</td><td>데이터 문해력, 다기준 판단</td></tr>
          </tbody>
        </table>
      </section>`;
    KCP.emit("home:render", { app, slot: KCP.$("#home-slot", app) });
  }

  /* ---------- 게임 화면 ---------- */
  function renderGame(app, year) {
    Timer.stop();
    KCP.speakStop();
    const meta = KCP.YEARS[year];
    const game = KCP.games[year];
    const state = KCP.load(year);
    if (!state.timer) state.timer = { left: meta.prep * 60, total: meta.prep * 60, running: false, of: "prep" };
    state.timer.running = false;
    const save = () => KCP.save(year, state);
    document.title = `${KCP.gameShort(year)} · 켄텍 창의성 면접 연습실`;

    app.innerHTML = `
      <div class="strip" id="strip">
        <a href="#home">← 연습실</a>
        <span class="ttl">${esc(KCP.gameShort(year))}<small>${esc(meta.format)}</small></span>
        <div class="phases" role="group" aria-label="단계">
          <button data-phase="prep">준비실</button>
          <button data-phase="room">면접실</button>
          <button data-phase="reflect">성찰</button>
        </div>
        <div class="timer">
          <span class="label" id="tlabel" style="color:inherit;opacity:.7"></span>
          <span class="clock" id="clock" aria-live="off"></span>
          <button id="tgo">시작</button>
          <button id="treset" title="시간 초기화">↺</button>
        </div>
        <div class="progress" id="tbar"></div>
      </div>
      <div class="brief">${game.brief(state)}</div>
      <main id="phase"></main>`;

    const clock = KCP.$("#clock");
    const tgo = KCP.$("#tgo");
    const tbar = KCP.$("#tbar");
    const tlabel = KCP.$("#tlabel");
    const paintTimer = () => {
      clock.textContent = KCP.fmt(state.timer.left);
      clock.classList.toggle("low", state.timer.left <= 300);
      tgo.textContent = state.timer.running ? "일시정지" : "시작";
      tlabel.textContent = state.timer.of === "prep" ? "준비" : "답변";
      tbar.style.width = (100 * (1 - state.timer.left / state.timer.total)).toFixed(1) + "%";
    };
    const setTimerFor = (of) => {
      Timer.stop();
      const mins = of === "prep" ? meta.prep : meta.answer;
      state.timer = { left: mins * 60, total: mins * 60, running: false, of };
      paintTimer();
      save();
    };
    tgo.onclick = () => {
      if (state.timer.running) {
        state.timer.running = false;
        Timer.stop();
      } else Timer.start(state, year, paintTimer);
      paintTimer();
      save();
    };
    KCP.$("#treset").onclick = () => setTimerFor(state.phase === "room" ? "answer" : "prep");
    paintTimer();

    const phaseEl = KCP.$("#phase");
    let cur = null;
    const showPhase = (p) => {
      KCP.speakStop();
      KCP.emit("phase:change", { year, from: cur, to: p, state });
      cur = p;
      state.phase = p;
      KCP.$$(".phases button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.phase === p)));
      if (p === "room" && state.timer.of !== "answer") setTimerFor("answer");
      if (p === "prep" && state.timer.of !== "prep" && !state.timer.running) setTimerFor("prep");
      save();
      phaseEl.innerHTML = "";
      if (p === "prep") {
        phaseEl.innerHTML = '<div id="prep-top" class="stack ext-slot"></div><div id="prep-body"></div>';
        const top = KCP.$("#prep-top", phaseEl), body = KCP.$("#prep-body", phaseEl);
        game.renderPrep(body, state, save, () => showPhase("room"));
        KCP.emit("prep:render", { root: phaseEl, top, body, year, meta, state, save });
      }
      if (p === "room") renderRoom(phaseEl, state, save, year, () => showPhase("reflect"));
      if (p === "reflect") renderReflect(phaseEl, state, save, year);
      window.scrollTo({ top: 0 });
    };
    KCP.$$(".phases button").forEach((b) => (b.onclick = () => showPhase(b.dataset.phase)));
    showPhase(state.phase || "prep");
    currentGo = showPhase;
  }

  /* ---------- 면접실 ---------- */
  function renderRoom(root, state, save, year, next) {
    const game = KCP.games[year];
    const meta = KCP.YEARS[year];
    const qs = game.questions(state);
    const recap = game.recap(state);
    root.innerHTML = `
      <div id="room-main">
      <div class="desk">
        <div class="stack">
          <section class="panel">
            <h3>면접위원 질문 <span class="chip num">${qs.length}개</span></h3>
            <p class="small muted" style="margin-bottom:10px">질문을 소리 내어 읽고 1~3분 안에 말로 답해 보세요. 짝이 있다면 짝이 면접위원이 되어 읽어 줍니다. 답한 뒤 핵심만 적어 둡니다.</p>
            <div id="room-tools" class="stack ext-slot"></div>
            <div class="qdeck">
              ${qs
                .map(
                  (q, i) => `<div class="qcard">
                    <div class="who">질문 ${i + 1}${q.tag ? " · " + esc(q.tag) : ""}</div>
                    <div class="q">${esc(q.q)}</div>
                    ${q.time ? `<div class="rec">권장 답변 시간: ${esc(q.time)}</div>` : ""}
                    ${q.rec ? `<div class="rec">${esc(q.rec)}</div>` : ""}
                    <textarea class="note" data-a="${i}" id="ans-${year}-${i}" aria-label="질문 ${i + 1} 답변 메모" placeholder="답변의 핵심 한두 문장">${esc(
                      state.answers[i] || ""
                    )}</textarea>
                    <div class="qx ext-slot" data-qx="${i}"></div>
                  </div>`
                )
                .join("")}
            </div>
          </section>
        </div>
        <div class="stack">
          <section class="panel">
            <h3>준비실에서 만든 답</h3>
            <dl class="recap">${recap.map((r) => `<dt>${esc(r.t)}</dt><dd>${r.html ? r.d : esc(r.d || "(비어 있음)")}</dd>`).join("")}</dl>
          </section>
          <div id="room-side" class="stack ext-slot"></div>
          <section class="panel">
            <h3>답변 요령</h3>
            <ul class="small muted" style="margin:0;padding-left:1.1em">
              <li>결론을 먼저 말하고 근거를 두세 개 붙입니다.</li>
              <li>자료의 숫자나 문장을 짚어 근거로 씁니다.</li>
              <li>반문을 받으면 답을 고쳐도 됩니다. 보고서는 한계를 인정하고 개선안을 찾는 태도를 평가 기준으로 명시합니다.</li>
            </ul>
            <div class="row" style="margin-top:12px"><button class="btn primary" id="toReflect">성찰로 이동</button></div>
          </section>
        </div>
      </div>
      </div><div id="room-alt" hidden></div>`;
    KCP.$$("textarea[data-a]", root).forEach((t) =>
      t.addEventListener("input", () => {
        state.answers[t.dataset.a] = t.value;
        save();
      })
    );
    KCP.$("#toReflect", root).onclick = next;
    KCP.$$(".qdeck .qcard", root).forEach((card, i) => {
      const q = qs[i], slot = KCP.$(`.qx[data-qx="${i}"]`, card);
      KCP.emit("room:card", { card, slot, q, i, key: KCP.qkey(q), year, meta, state, save });
    });
    KCP.emit("room:render", { root, main: KCP.$("#room-main", root), alt: KCP.$("#room-alt", root),
      tools: KCP.$("#room-tools", root), side: KCP.$("#room-side", root), qs, year, meta, state, save });
  }

  /* ---------- 성찰 ---------- */
  function renderReflect(root, state, save, year) {
    const meta = KCP.YEARS[year];
    const game = KCP.games[year];
    const levels = ["미흡", "보통", "잘함"];
    let rows = "";
    Object.entries(meta.rubric).forEach(([dom, items]) => {
      items.forEach((it, i) => {
        const key = dom + i;
        const v = state.rubric[key];
        rows += `<tr>
          ${i === 0 ? `<td class="dom" rowspan="${items.length}">${esc(dom)}</td>` : ""}
          <td>${esc(it)}</td>
          <td><span class="seg" role="group" aria-label="${esc(it)}">${levels
            .map((l, j) => `<button data-k="${esc(key)}" data-v="${j + 1}" aria-pressed="${v === j + 1}">${l}</button>`)
            .join("")}</span></td>
        </tr>`;
      });
    });
    root.innerHTML = `
      <div class="desk">
        <div class="stack">
          <section class="panel">
            <h3>자기 평가 <span class="tag-official">공식 평가 기준</span> <span class="spacer"></span><span class="chip num" id="rsum"></span></h3>
            <div class="table-wrap"><table class="rubric">
              <thead><tr><th>평가 요소</th><th>평가 기준</th><th>나의 수준</th></tr></thead>
              <tbody>${rows}</tbody>
            </table></div>
          </section>
          <section class="panel">
            <h3>다음 연습에서 바꿀 한 가지</h3>
            <textarea class="note" id="nextstep-${year}" aria-label="다음 연습 목표" placeholder="예: 결론을 먼저 말하고, 자료의 수치를 하나 이상 인용한다">${esc(state.nextstep || "")}</textarea>
          </section>
          <div id="reflect-left" class="stack ext-slot"></div>
        </div>
        <div class="stack">
          <section class="panel">
            <h3>출제 의도 <span class="tag-official">보고서 원문 요약</span></h3>
            <ul class="intent small" style="margin:0;padding-left:1.1em">${meta.intent.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
          </section>
          <section class="panel">
            <h3>비교해 보기</h3>
            ${game.reflectExtra(state)}
          </section>
          <section class="panel">
            <h3>내 답안 내보내기</h3>
            <p class="small muted">준비실 답과 면접실 메모, 자기 평가를 글로 묶어 복사합니다. 수업 과제 제출이나 교사 피드백에 쓰세요.</p>
            <div class="row" style="margin-top:8px">
              <button class="btn primary" id="copyAll">답안 복사</button>
              <button class="btn ghost" id="resetAll">이 해 기록 지우기</button>
            </div>
            <div id="confirmReset" hidden class="caution" style="margin-top:8px">이 학년도의 입력 내용이 모두 지워집니다.
              <div class="row" style="margin-top:6px"><button class="btn small" id="doReset">지우기</button><button class="btn small ghost" id="noReset">취소</button></div>
            </div>
            <textarea class="note copybox" id="copyFallback-${year}" hidden aria-label="복사용 텍스트"></textarea>
          </section>
          <div id="reflect-right" class="stack ext-slot"></div>
        </div>
      </div>`;
    const paintSum = () => {
      const vals = Object.values(state.rubric);
      const sum = vals.reduce((a, b) => a + b, 0);
      KCP.$("#rsum", root).textContent = `${sum} / 27점 · ${vals.length}/9 항목`;
    };
    paintSum();
    KCP.$$(".seg button", root).forEach((b) =>
      b.addEventListener("click", () => {
        state.rubric[b.dataset.k] = Number(b.dataset.v);
        KCP.$$(`.seg button[data-k="${CSS.escape(b.dataset.k)}"]`, root).forEach((x) =>
          x.setAttribute("aria-pressed", String(x === b))
        );
        paintSum();
        save();
      })
    );
    KCP.$(`#nextstep-${year}`, root).addEventListener("input", (e) => {
      state.nextstep = e.target.value;
      save();
      if (state.nextstep.trim()) KCP.goal.set(year, KCP.gameShort(year), state.nextstep);
      else if (KCP.goal.get()?.src === String(year)) KCP.store.remove("goal");
    });
    if (game.afterReflect) game.afterReflect(root, state, save);
    KCP.emit("reflect:render", { root, left: KCP.$("#reflect-left", root), right: KCP.$("#reflect-right", root),
      qs: game.questions(state), year, meta, state, save });
    KCP.$("#copyAll", root).onclick = () => {
      const qs = game.questions(state);
      let out = `[${year}학년도 KENTECH 창의성 면접 연습 · ${meta.title}]\n\n`;
      out += "■ 준비실 답안\n";
      game.recap(state).forEach((r) => (out += `- ${r.t}: ${r.text != null ? r.text : r.d || "(비어 있음)"}\n`));
      out += "\n■ 면접실 답변 메모\n";
      qs.forEach((q, i) => (out += `Q${i + 1}. ${q.q}\n→ ${state.answers[i] || "(미작성)"}\n`));
      out += "\n■ 자기 평가\n";
      Object.entries(meta.rubric).forEach(([dom, items]) =>
        items.forEach((it, i) => {
          const v = state.rubric[dom + i];
          out += `- [${dom}] ${it}: ${v ? levels[v - 1] : "-"}\n`;
        })
      );
      const parts = [];
      KCP.emit("export:text", { year, meta, state, qs, parts });
      out += parts.join("");
      if (state.nextstep) out += `\n■ 다음 연습 목표\n${state.nextstep}\n`;
      if (state.memo) out += `\n■ 메모\n${state.memo}\n`;
      KCP.copy(out, KCP.$(`#copyFallback-${year}`, root));
    };
    KCP.$("#resetAll", root).onclick = () => (KCP.$("#confirmReset", root).hidden = false);
    KCP.$("#noReset", root).onclick = () => (KCP.$("#confirmReset", root).hidden = true);
    KCP.$("#doReset", root).onclick = () => {
      Timer.stop();
      KCP.speakStop();
      KCP.reset(year);
      location.hash = "#home";
    };
  }

  /* ---------- 공통 조각: 메모장 ---------- */
  KCP.memoPanel = function (state, save, id) {
    setTimeout(() => {
      const t = document.getElementById(id);
      if (t) t.addEventListener("input", () => { state.memo = t.value; save(); });
    });
    return `<section class="panel"><h3>메모장</h3>
      <textarea class="note" id="${id}" style="min-height:110px" aria-label="메모장" placeholder="문제 풀이 중 떠오른 생각을 적어 두세요. 면접 때 설명 자료로 활용할 수 있습니다.">${esc(state.memo || "")}</textarea></section>`;
  };

  /* ---------- 라우터 ---------- */
  let currentGo = null;
  KCP.goPhase = function (p) {
    if (!currentGo || !["prep", "room", "reflect"].includes(p)) return false;
    currentGo(p);
    return true;
  };
  KCP.routes = {};
  KCP.route = function (name, fn) {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || name === "home" || /^y[0-9]{4}$/.test(name)) return false;
    KCP.routes[name] = fn;
    return true;
  };
  KCP.rerender = () => route();
  function route() {
    const app = document.getElementById("app");
    const h = (location.hash || "").replace(/^#/, ""), slash = h.indexOf("/");
    const name = slash === -1 ? h : h.slice(0, slash);
    let arg = slash === -1 ? "" : h.slice(slash + 1);
    try { arg = decodeURIComponent(arg); } catch (e) {}
    KCP.flush();
    Timer.stop();
    KCP.speakStop();
    KCP.emit("route:change", { name, arg });
    KCP.flush();
    currentGo = null;
    const m = name.match(/^y([a-z0-9-]+)$/);
    if (m && Object.hasOwn(KCP.games, m[1]) && Object.hasOwn(KCP.YEARS, m[1])) renderGame(app, m[1]);
    else if (Object.hasOwn(KCP.routes, name)) {
      app.innerHTML = "";
      document.title = "켄텍 창의성 면접 연습실";
      KCP.routes[name](app, arg);
      window.scrollTo(0, 0);
      if (!document.activeElement || document.activeElement === document.body) {
        const heading = KCP.$("h1", app);
        if (heading) {
          heading.setAttribute("tabindex", "-1");
          heading.focus({ preventScroll: true });
        }
      }
    }
    else renderHome(app);
  }
  KCP.boot = function () {
    window.addEventListener("hashchange", route);
    route();
  };
})();
