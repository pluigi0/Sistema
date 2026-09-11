(() => {
  "use strict";

  /* ============================================================
     1. CONFIGURACIÓN
     ============================================================ */

  // Temas que la app te ofrece. Los que falten se añaden solos al
  // abrir. Si borras uno desde "Temas", no vuelve: queda anotado en
  // state.seeded para no reaparecer nunca.
  const DEFAULT_TOPICS = [
    { name: "Software / Tech",      tier: 1, hue: "#6FA8FF" },
    { name: "Oratoria",             tier: 1, hue: "#B18BF2" },
    { name: "Ventas",               tier: 1, hue: "#F2A03D" },
    { name: "Storytelling",         tier: 1, hue: "#F2647C" },
    { name: "Finanzas / Negocios",  tier: 2, hue: "#55C08C" },
    { name: "Juan",                 tier: 2, hue: "#6ED6E0" },
    { name: "Salud / Gym",          tier: 2, hue: "#A3D24C" },
    { name: "Comida",               tier: 2, hue: "#E8C25A" },
    { name: "Inglés",               tier: 2, hue: "#9FA8DA" },
    { name: "SQL",                  tier: 2, hue: "#79C7B0" },
    { name: "Marketing",            tier: 2, hue: "#E08B6F" },
    { name: "Redes sociales",       tier: 2, hue: "#C97BB0" },
    { name: "Generación de video",  tier: 2, hue: "#6ED9C0" },
    { name: "Edición de video",     tier: 2, hue: "#C4A86E" }
  ];

  const PALETTE = [
    "#6FA8FF", "#B18BF2", "#F2A03D", "#F2647C", "#55C08C", "#6ED6E0",
    "#A3D24C", "#E8C25A", "#9FA8DA", "#E08B6F", "#79C7B0", "#C97BB0",
    "#6ED9C0", "#C4A86E", "#E86EA0"
  ];

  const STORE_KEY = "panel-temas-v2";
  const LIMITS = { name: 40, goal: 300, next: 200, log: 1000, entries: 300, days: 500, topics: 24 };

  let state = { version: 2, topics: [] };
  let currentId = null;
  let newHue = PALETTE[0];
  let saveTimer = null;
  let toastTimer = null;

  /* ============================================================
     2. FECHAS
     ============================================================ */
  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dayKey(new Date());

  const daysAgoKey = (n) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return dayKey(d);
  };

  const isDayKey = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

  const daysBetween = (key) => {
    const [y, m, d] = key.split("-").map(Number);
    const then = new Date(y, m - 1, d, 12, 0, 0, 0);
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    return Math.round((now - then) / 86400000);
  };

  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const shortDate = (key) => {
    const [, m, d] = key.split("-").map(Number);
    return `${d} ${MESES[m - 1]}`;
  };

  /* ============================================================
     3. DOM SEGURO
     Nunca se usa innerHTML con datos. Todo texto entra por
     textContent, así el navegador jamás lo interpreta como HTML.
     ============================================================ */
  const $ = (id) => document.getElementById(id);

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  const clear = (node) => {
    while (node.firstChild) node.removeChild(node.firstChild);
  };

  const toast = (msg) => {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2000);
  };

  /* ============================================================
     4. VALIDACIÓN
     Todo lo que entra —guardado previo o respaldo pegado— pasa
     por aquí: tipos forzados, longitudes recortadas, colores
     comprobados con un patrón, claves desconocidas descartadas.
     ============================================================ */
  const safeText = (v, max) =>
    typeof v === "string" ? v.replace(/\u0000/g, "").trim().slice(0, max) : "";

  // Sin esto, un "color" como "red;background:url(evil)" se colaría
  // dentro de un style. Solo se aceptan seis dígitos hexadecimales.
  const isHex = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
  const safeHue = (v) => (isHex(v) ? v : PALETTE[0]);

  const makeId = () => {
    if (crypto?.randomUUID) return crypto.randomUUID();
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return a[0].toString(36) + a[1].toString(36);
  };

  const newTopic = ({ name, tier, hue }) => ({
    id: makeId(), name, tier, hue: safeHue(hue),
    goal: "", next: "", days: [], log: []
  });

  const seedState = () => ({
    version: 2,
    seeded: DEFAULT_TOPICS.map((t) => t.name),
    topics: DEFAULT_TOPICS.map(newTopic)
  });

  // Añade los temas de DEFAULT_TOPICS que todavía no existen y que
  // nunca se han ofrecido antes. No toca nada de lo que ya tienes.
  const syncDefaults = () => {
    const present = new Set(state.topics.map((t) => t.name));
    const seeded = new Set(state.seeded);
    let added = 0;

    for (const def of DEFAULT_TOPICS) {
      if (present.has(def.name) || seeded.has(def.name)) continue;
      if (state.topics.length >= LIMITS.topics) break;
      state.topics.push(newTopic(def));
      added += 1;
    }

    state.seeded = DEFAULT_TOPICS.map((t) => t.name);
    return added;
  };

  const sanitizeTopic = (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const name = safeText(raw.name, LIMITS.name);
    if (!name) return null;

    const days = [];
    if (Array.isArray(raw.days)) {
      const seen = new Set();
      for (const d of raw.days) {
        if (isDayKey(d) && !seen.has(d)) { seen.add(d); days.push(d); }
      }
      days.sort();
    }

    const log = [];
    if (Array.isArray(raw.log)) {
      for (const e of raw.log.slice(-LIMITS.entries)) {
        if (!e || typeof e !== "object" || Array.isArray(e)) continue;
        const text = safeText(e.text, LIMITS.log);
        if (!text) continue;
        log.push({
          id: safeText(e.id, 40) || makeId(),
          date: isDayKey(e.date) ? e.date : today(),
          text
        });
      }
    }

    return {
      id: safeText(raw.id, 40) || makeId(),
      name,
      tier: raw.tier === 1 ? 1 : 2,
      hue: safeHue(raw.hue),
      goal: safeText(raw.goal, LIMITS.goal),
      next: safeText(raw.next, LIMITS.next),
      days: days.slice(-LIMITS.days),
      log
    };
  };

  const sanitizeState = (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return seedState();
    if (!Array.isArray(raw.topics)) return seedState();

    const topics = [];
    const usedIds = new Set();
    for (const t of raw.topics.slice(0, LIMITS.topics)) {
      const clean = sanitizeTopic(t);
      if (!clean) continue;
      while (usedIds.has(clean.id)) clean.id = makeId();
      usedIds.add(clean.id);
      topics.push(clean);
    }
    if (!topics.length) return seedState();

    const seeded = Array.isArray(raw.seeded)
      ? raw.seeded.map((n) => safeText(n, LIMITS.name)).filter(Boolean).slice(0, 100)
      : [];

    return { version: 2, seeded, topics };
  };

  /* ============================================================
     5. PERSISTENCIA
     ============================================================ */
  let mem = null;

  const load = async () => {
    if (typeof window.storage?.get === "function") {
      try {
        const r = await window.storage.get(STORE_KEY);
        return r?.value ? JSON.parse(r.value) : null;
      } catch { return null; }
    }
    try {
      // Fuera de este entorno (tu propio hosting) se usa
      // el almacenamiento local del navegador.
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return mem; }
  };

  const persist = async () => {
    const payload = JSON.stringify(state);
    if (typeof window.storage?.set === "function") {
      try { await window.storage.set(STORE_KEY, payload); }
      catch { toast("No se pudo guardar. Usa Respaldo para no perder nada."); }
      return;
    }
    try { localStorage.setItem(STORE_KEY, payload); }
    catch { mem = JSON.parse(payload); }
  };

  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 250);
  };

  /* ============================================================
     6. CÁLCULOS
     ============================================================ */
  const findTopic = (id) => state.topics.find((t) => t.id === id) ?? null;
  const byTier = (tier) => state.topics.filter((t) => t.tier === tier);
  const lastDay = (t) => (t.days.length ? t.days[t.days.length - 1] : null);
  const age = (t) => (lastDay(t) === null ? null : daysBetween(lastDay(t)));

  const countSince = (t, n) => {
    const limit = daysAgoKey(n - 1);
    return t.days.filter((d) => d >= limit).length;
  };

  const ageLabel = (a) => {
    if (a === null) return "sin registro";
    if (a === 0) return "hoy";
    if (a === 1) return "ayer";
    return `hace ${a} d`;
  };

  const toggleToday = (id) => {
    const t = findTopic(id);
    if (!t) return;
    const key = today();
    const i = t.days.indexOf(key);
    if (i === -1) { t.days.push(key); t.days.sort(); } else { t.days.splice(i, 1); }
    save();
  };

  /* ============================================================
     7. PIEZAS DE INTERFAZ
     ============================================================ */
  const buildStrip = (t, hue, days, big = false) => {
    const strip = el("div", big ? "strip lg" : "strip");
    strip.style.setProperty("--hue", hue);
    const set = new Set(t.days);
    for (let i = days - 1; i >= 0; i--) {
      const key = daysAgoKey(i);
      const tick = el("div", `tick${set.has(key) ? " on" : ""}${i === 0 ? " today" : ""}`);
      tick.title = shortDate(key);
      strip.appendChild(tick);
    }
    return strip;
  };

  const markButton = (t, onDone) => {
    const done = t.days.includes(today());
    const btn = el("button", `btn${done ? " on" : ""}`, done ? "Hecho hoy" : "Marcar hoy");
    btn.type = "button";
    btn.style.setProperty("--hue", t.hue);
    btn.addEventListener("click", () => { toggleToday(t.id); onDone(); });
    return btn;
  };

  const nameButton = (t, className) => {
    const btn = el("button", className, t.name);
    btn.type = "button";
    btn.addEventListener("click", () => openDetail(t.id));
    return btn;
  };

  /* ============================================================
     8. TABLERO
     ============================================================ */
  const renderBoard = () => {
    $("todayLine").textContent = new Date().toLocaleDateString("es-PA", {
      weekday: "long", day: "numeric", month: "long"
    });

    renderStale();

    const main = byTier(1);
    const second = byTier(2);
    $("countMain").textContent = String(main.length);
    $("countSecond").textContent = String(second.length);
    $("emptyMain").hidden = main.length > 0;
    $("emptySecond").hidden = second.length > 0;

    const grid = $("gridMain");
    clear(grid);
    main.forEach((t) => grid.appendChild(mainCard(t)));

    const rows = $("rowsSecond");
    clear(rows);
    second.forEach((t) => rows.appendChild(secondRow(t)));
  };

  const renderStale = () => {
    const box = $("staleBox");
    const main = byTier(1);
    if (!main.length) { box.hidden = true; return; }

    let worst = null;
    let worstAge = -1;
    for (const t of main) {
      const a = age(t);
      const val = a === null ? 9999 : a;
      if (val > worstAge) { worstAge = val; worst = t; }
    }

    box.hidden = false;
    if (worstAge <= 0) {
      box.classList.add("calm");
      $("staleName").textContent = "Todo al día";
      $("staleDays").textContent = "Tocaste todos tus temas principales hoy.";
      $("staleOpen").hidden = true;
      return;
    }

    box.classList.remove("calm");
    $("staleOpen").hidden = false;
    $("staleName").textContent = worst.name;
    $("staleDays").textContent = worstAge === 9999
      ? "Sin ningún registro todavía"
      : `${worstAge} ${worstAge === 1 ? "día" : "días"} sin tocarlo`;
    $("staleOpen").dataset.id = worst.id;
  };

  const mainCard = (t) => {
    const card = el("article", "card");
    card.style.setProperty("--hue", t.hue);

    const top = el("div", "card-top");
    const a = age(t);
    top.append(
      nameButton(t, "card-name"),
      el("span", `age${a === null || a >= 4 ? " hot" : ""}`, ageLabel(a))
    );

    const next = el("p", `next${t.next ? "" : " empty"}`, t.next || "Sin siguiente acción definida");

    const foot = el("div", "card-foot");
    foot.append(buildStrip(t, t.hue, 14), markButton(t, renderBoard));

    card.append(top, next, foot);
    return card;
  };

  const secondRow = (t) => {
    const row = el("div", "row");
    row.style.setProperty("--hue", t.hue);
    const a = age(t);
    row.append(
      el("span", "dot"),
      nameButton(t, "row-name"),
      el("span", `age${a === null || a >= 7 ? " hot" : ""}`, ageLabel(a)),
      buildStrip(t, t.hue, 14),
      markButton(t, renderBoard)
    );
    return row;
  };

  /* ============================================================
     9. EDITOR DE TEMAS
     ============================================================ */
  const paletteChips = (selected, onPick) => {
    const wrap = el("div", "palette");
    PALETTE.forEach((hue) => {
      const chip = el("button", "chip");
      chip.type = "button";
      chip.style.setProperty("--hue", hue);
      chip.setAttribute("aria-pressed", hue === selected ? "true" : "false");
      chip.setAttribute("aria-label", `Color ${hue}`);
      chip.addEventListener("click", () => onPick(hue));
      wrap.appendChild(chip);
    });
    return wrap;
  };

  const moveTopic = (id, dir) => {
    const i = state.topics.findIndex((t) => t.id === id);
    if (i === -1) return;
    const { tier } = state.topics[i];
    // Intercambia con el vecino más cercano de la misma prioridad:
    // el tablero agrupa por prioridad, así que saltar de grupo
    // no produciría ningún cambio visible.
    let j = i + dir;
    while (j >= 0 && j < state.topics.length && state.topics[j].tier !== tier) j += dir;
    if (j < 0 || j >= state.topics.length) return;
    [state.topics[i], state.topics[j]] = [state.topics[j], state.topics[i]];
    save();
    renderTopics();
  };

  const removeTopic = (id) => {
    const t = findTopic(id);
    if (!t) return;
    const n = t.log.length;
    const warn = n
      ? `Se borrarán también ${n} ${n === 1 ? "nota" : "notas"} y todo su historial.`
      : "Se borrará todo su historial.";
    if (!confirm(`¿Quitar "${t.name}"? ${warn} Esto no se puede deshacer.`)) return;
    state.topics = state.topics.filter((x) => x.id !== id);
    persist();
    renderTopics();
    toast("Tema eliminado");
  };

  const topicEditorRow = (t) => {
    const row = el("div", "t-row");
    row.style.setProperty("--hue", t.hue);
    row.appendChild(el("span", "swatch"));

    const name = document.createElement("input");
    name.type = "text";
    name.value = t.name;
    name.maxLength = LIMITS.name;
    name.setAttribute("aria-label", `Nombre de ${t.name}`);
    name.addEventListener("change", () => {
      const clean = safeText(name.value, LIMITS.name);
      if (!clean) { name.value = t.name; toast("El nombre no puede quedar vacío"); return; }
      t.name = clean;
      name.value = clean;
      save();
      toast("Nombre actualizado");
    });
    row.appendChild(name);

    const tier = document.createElement("select");
    tier.setAttribute("aria-label", `Prioridad de ${t.name}`);
    [["1", "Principal"], ["2", "Segundo plano"]].forEach(([value, label]) => {
      const opt = el("option", null, label);
      opt.value = value;
      if (String(t.tier) === value) opt.selected = true;
      tier.appendChild(opt);
    });
    tier.addEventListener("change", () => {
      t.tier = tier.value === "1" ? 1 : 2;
      save();
      renderTopics();
    });
    row.appendChild(tier);

    const moves = el("div", "moves");
    [["↑", -1], ["↓", 1]].forEach(([label, dir]) => {
      const b = el("button", "btn tiny", label);
      b.type = "button";
      b.setAttribute("aria-label", `Mover ${t.name} ${dir === -1 ? "arriba" : "abajo"}`);
      b.addEventListener("click", () => moveTopic(t.id, dir));
      moves.appendChild(b);
    });
    row.appendChild(moves);

    const del = el("button", "btn tiny danger", "Quitar");
    del.type = "button";
    del.addEventListener("click", () => removeTopic(t.id));
    row.appendChild(del);

    row.appendChild(paletteChips(t.hue, (hue) => {
      t.hue = safeHue(hue);
      save();
      renderTopics();
    }));

    return row;
  };

  const renderTopics = () => {
    const list = $("editorList");
    clear(list);

    if (!state.topics.length) {
      list.appendChild(el("p", "empty-note", "No hay temas todavía. Añade el primero abajo."));
    } else {
      state.topics.forEach((t) => list.appendChild(topicEditorRow(t)));
    }

    const pal = $("newPalette");
    clear(pal);
    const chips = paletteChips(newHue, (hue) => { newHue = hue; renderTopics(); });
    while (chips.firstChild) pal.appendChild(chips.firstChild);
  };

  const addTopic = () => {
    const input = $("newName");
    const name = safeText(input.value, LIMITS.name);
    if (!name) { toast("Escribe un nombre para el tema"); input.focus(); return; }
    if (state.topics.length >= LIMITS.topics) { toast(`El máximo es ${LIMITS.topics} temas`); return; }

    state.topics.push({
      id: makeId(),
      name,
      tier: $("newTier").value === "1" ? 1 : 2,
      hue: safeHue(newHue),
      goal: "", next: "", days: [], log: []
    });
    input.value = "";
    save();
    renderTopics();
    toast(`"${name}" añadido`);
  };

  /* ============================================================
     10. DETALLE
     ============================================================ */
  const openDetail = (id) => {
    if (!findTopic(id)) return;
    currentId = id;
    showView("viewDetail");
    renderDetail();
  };

  const renderDetail = () => {
    const t = findTopic(currentId);
    if (!t) { goBoard(); return; }

    $("dTitle").textContent = t.name;
    $("dTitle").style.color = t.hue;
    $("dSub").textContent = t.tier === 1 ? "Tema principal" : "Segundo plano";

    $("mWeek").textContent = String(countSince(t, 7));
    $("mMonth").textContent = String(countSince(t, 30));
    const a = age(t);
    $("mAge").textContent = a === null ? "—" : String(a);

    const holder = $("dStrip");
    clear(holder);
    holder.style.setProperty("--hue", t.hue);
    const strip = buildStrip(t, t.hue, 30, true);
    while (strip.firstChild) holder.appendChild(strip.firstChild);

    const done = t.days.includes(today());
    const mark = $("btnMark");
    mark.textContent = done ? "Hecho hoy" : "Marcar hoy";
    mark.className = `btn${done ? " on" : ""}`;
    mark.style.setProperty("--hue", t.hue);

    $("dGoal").value = t.goal;
    $("dNext").value = t.next;
    renderLog();
  };

  const renderLog = () => {
    const t = findTopic(currentId);
    if (!t) return;

    const list = $("logList");
    clear(list);
    const entries = [...t.log].reverse();
    $("logEmpty").hidden = entries.length > 0;

    entries.forEach((entry) => {
      const li = el("li");
      li.append(
        el("span", "log-date", shortDate(entry.date)),
        el("p", "log-text", entry.text)
      );
      const del = el("button", "btn quiet danger", "Borrar");
      del.type = "button";
      del.addEventListener("click", () => {
        if (!confirm("¿Borrar esta nota?")) return;
        t.log = t.log.filter((e) => e.id !== entry.id);
        save();
        renderLog();
      });
      li.appendChild(del);
      list.appendChild(li);
    });
  };

  const addLogEntry = () => {
    const t = findTopic(currentId);
    if (!t) return;

    const input = $("logInput");
    const text = safeText(input.value, LIMITS.log);
    if (!text) { toast("Escribe algo antes de añadir"); return; }

    t.log.push({ id: makeId(), date: today(), text });
    if (t.log.length > LIMITS.entries) t.log = t.log.slice(-LIMITS.entries);
    if (!t.days.includes(today())) { t.days.push(today()); t.days.sort(); }
    input.value = "";
    save();
    renderDetail();
  };

  /* ============================================================
     11. NAVEGACIÓN
     ============================================================ */
  const VIEWS = ["viewBoard", "viewTopics", "viewDetail", "viewBackup"];

  const showView = (id) => {
    VIEWS.forEach((v) => { $(v).hidden = v !== id; });
    window.scrollTo(0, 0);
  };

  const goBoard = () => {
    currentId = null;
    showView("viewBoard");
    renderBoard();
  };

  /* ============================================================
     12. EVENTOS
     ============================================================ */
  $("btnTopics").addEventListener("click", () => { showView("viewTopics"); renderTopics(); });
  $("btnBackTopics").addEventListener("click", goBoard);
  $("btnAddTopic").addEventListener("click", addTopic);
  $("newName").addEventListener("keydown", (e) => { if (e.key === "Enter") addTopic(); });

  $("btnBack").addEventListener("click", goBoard);

  $("staleOpen").addEventListener("click", (e) => {
    const { id } = e.currentTarget.dataset;
    if (id) openDetail(id);
  });

  $("btnMark").addEventListener("click", () => { toggleToday(currentId); renderDetail(); });

  $("btnSaveFields").addEventListener("click", () => {
    const t = findTopic(currentId);
    if (!t) return;
    t.goal = safeText($("dGoal").value, LIMITS.goal);
    t.next = safeText($("dNext").value, LIMITS.next);
    $("dGoal").value = t.goal;
    $("dNext").value = t.next;
    save();
    toast("Guardado");
  });

  $("btnAddLog").addEventListener("click", addLogEntry);
  $("logInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addLogEntry(); }
  });

  $("btnBackup").addEventListener("click", () => {
    $("backupText").value = JSON.stringify(state, null, 2);
    showView("viewBackup");
  });
  $("btnBackBackup").addEventListener("click", goBoard);

  $("btnCopy").addEventListener("click", async () => {
    const ta = $("backupText");
    ta.select();
    try {
      await navigator.clipboard.writeText(ta.value);
      toast("Copiado");
    } catch {
      toast("Selecciona el texto y copia manualmente");
    }
  });

  $("btnRestore").addEventListener("click", () => {
    let parsed;
    try {
      parsed = JSON.parse($("backupText").value);
    } catch {
      toast("Ese texto no es un respaldo válido");
      return;
    }
    if (!confirm("Esto reemplaza todos tus temas y su historial. ¿Continuar?")) return;
    state = sanitizeState(parsed);
    persist();
    goBoard();
    toast("Respaldo restaurado");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("viewBoard").hidden) goBoard();
  });

  /* ============================================================
     13. ARRANQUE
     ============================================================ */
  (async () => {
    try {
      state = sanitizeState(await load());
    } catch {
      state = seedState();
    }

    const added = syncDefaults();
    if (added) {
      await persist();
      toast(`${added} ${added === 1 ? "tema nuevo" : "temas nuevos"} añadidos`);
    }

    renderBoard();
  })();
})();
