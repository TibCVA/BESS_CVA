/* ==========================================================================
   Datako SLR — Evidence surveillance (demo application)
   Modules (IIFE in one file): util · store · synth · rail · idle · run · results
   · card (scoring card + provenance thread) · panels · drawer · router · boot
   No backend: everything runs on the embedded DEMO dataset, deterministically.
   Reviewer decisions are taken per record (include / flag / exclude), as in the
   Datako process; excluding a record removes its figures from every synthesis.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------------- util ---------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ic = (n, cls) => `<svg class="ic${cls ? " " + cls : ""}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const nf = n => Math.round(n).toLocaleString("en-GB");
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const STUDY = Object.fromEntries(DEMO.studies.map(s => [s.id, s]));
  const EX = DEMO.extractions.filter(e => !e.hidden);
  const EXALL = Object.fromEntries(DEMO.extractions.map(e => [e.id, e]));
  const OUT = DEMO.outcomes;
  const OUTKEYS = Object.keys(OUT);
  const RETAINED = DEMO.studies.filter(s => !s.excluded);
  const studyRef = s => `${s.author} ${s.year}`;
  const now = () => new Date().toTimeString().slice(0, 5);

  /* AI relevance score (0-100): fit to the locked protocol, quality of the record, geography. Deterministic. */
  function score(s) {
    if (s.excluded) return 28 + (s.id.charCodeAt(2) * 7) % 20;
    const base = { A: 93, B: 85, C: 76, D: 64 }[s.grade];
    const geo = s.region === "Europe" ? 0 : -13;
    const jitter = (s.author.length * 3 + s.year) % 4;
    return Math.max(50, Math.min(99, base + geo - jitter));
  }
  const SCORE = Object.fromEntries(DEMO.studies.map(s => [s.id, score(s)]));
  const tier = sc => sc >= 85 ? "hi" : sc >= 70 ? "mid" : "lo";

  function tween(el, to, ms, fmt) {
    const from = Number(el.dataset.v || 0); const t0 = performance.now(); el.dataset.v = to;
    if (reduced || ms <= 0) { el.textContent = fmt(to); return; }
    (function step(t) {
      const p = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  function toast(msg, ms) {
    if (document.body.classList.contains("touring")) return;
    const t = $("#toast"); $("#toast-text").textContent = msg; t.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), ms || 2600);
  }

  /* ---------------- store ---------------- */
  const KEY = "datako-slr-demo-v2";
  const store = {
    screen: "idle", decisions: {}, log: [], filter: "all", showExcluded: false, subjectId: DEMO.question.id, ran: false,
    load() { try { const s = JSON.parse(localStorage.getItem(KEY) || "{}"); this.decisions = s.decisions || {}; this.log = s.log || []; } catch (e) { this.decisions = {}; this.log = []; } },
    save() { try { localStorage.setItem(KEY, JSON.stringify({ decisions: this.decisions, log: this.log })); } catch (e) { /* private mode */ } },
    /* record status: recommended (AI, awaiting reviewer) · included · flagged · excluded */
    status(sid) {
      if (this.decisions[sid]) return this.decisions[sid];
      return EX.some(e => e.s === sid && e.status === "flagged") ? "flagged" : "recommended";
    },
    decide(sid, status) {
      this.decisions[sid] = status; this.log.unshift({ t: now(), sid, status }); this.save();
      document.dispatchEvent(new CustomEvent("decision", { detail: { sid, status } }));
    },
    reset() { this.decisions = {}; this.log = []; this.save(); document.dispatchEvent(new CustomEvent("decision", { detail: {} })); }
  };
  store.load();

  /* ---------------- synth: pure computation ---------------- */
  const synth = {
    items(o, band) { return EX.filter(e => e.o === o && e.band === band && e.plot != null); },
    compute(o, band) {
      const all = this.items(o, band);
      const pooledAll = all.filter(e => e.pooled);
      const active = pooledAll.filter(e => store.status(e.s) !== "excluded");
      const excluded = pooledAll.filter(e => store.status(e.s) === "excluded");
      const vals = active.map(e => e.plot).sort((a, b) => a - b);
      const n = vals.length;
      const median = n ? (n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2) : null;
      const conc = n ? vals.filter(v => Math.abs(v - median) <= 0.25 * median).length : 0;
      const hasD = active.some(e => STUDY[e.s].grade === "D");
      let confidence = "Low";
      if (n >= 4 && conc / n >= 0.75 && !hasD) confidence = "High";
      else if (n >= 2 && conc / n >= 0.5) confidence = "Moderate";
      return { o, band, all, active, excluded, ctx: all.filter(e => !e.pooled), n, min: n ? vals[0] : null, max: n ? vals[n - 1] : null, median, conc, concPct: n ? Math.round(100 * conc / n) : 0, confidence };
    },
    scale(o) { const vals = EX.filter(e => e.o === o && e.plot != null).map(e => e.plot); return { min: 0, max: Math.max(...vals) * 1.1 }; },
    whyConf(r) {
      if (r.n === 0) return "No like-for-like estimate in the pool.";
      if (r.confidence === "High") return `${r.n} pooled estimates, ${r.concPct}% within ±25% of the median, no grade D record.`;
      if (r.confidence === "Moderate") return `${r.n} pooled estimates, ${r.concPct}% within ±25% of the median.`;
      return r.n < 2 ? `Only ${r.n} pooled estimate.` : `${r.n} pooled estimates, only ${r.concPct}% within ±25% of the median.`;
    }
  };

  /* ---------------- rail: the locked protocol ---------------- */
  const rail = {
    render() {
      const q = DEMO.question, sc = q.scope;
      const chip = (t, on) => `<button class="chip${on ? " on" : ""}" type="button">${on ? ic("check") : ""}<span>${esc(t)}</span></button>`;
      $("#rail-body").innerHTML = `
        <div class="q-box">
          <div class="q-label"><span>Question</span></div>
          <textarea class="q-text" id="q-text" rows="3" spellcheck="false">${esc(q.title)}</textarea>
          <div class="q-hint">Baseline: ${esc(DEMO.meta.baseline)} · ground truth for the AI</div>
        </div>
        <div class="field"><div class="field-k"><span><b class="pico">P</b> Population</span></div><div class="chips">${chip(sc.population, true)}${chip(sc.geography[0], true)}</div></div>
        <div class="field"><div class="field-k"><span><b class="pico">I / C</b> Intervention · comparator</span></div><div class="chips">${chip("None · burden of disease", true)}</div></div>
        <div class="field"><div class="field-k"><span><b class="pico">O</b> Outcomes</span></div><div class="chips">${sc.outcomes.map(o => chip(OUT[o].label, true)).join("")}</div></div>
        <div class="field"><div class="field-k"><span><b class="pico">S</b> Studies · period</span></div><div class="chips">${chip("Primary data or meta-analysis", true)}${chip(sc.years[0] + " – " + sc.years[1], true)}</div></div>
        <div class="field"><div class="field-k"><span>Benchmarks</span><span class="rail-sub">shown, never pooled</span></div><div class="chips">${sc.benchmarks.map(g => chip(g, true)).join("")}</div></div>
        <div class="field"><div class="field-k"><span>Licensed sources</span><span class="rail-sub">${DEMO.sources.length} connected</span></div><div class="srcs" id="srcs">${DEMO.sources.map(s => `
          <div class="src${s.type === "licensed" ? " sub" : ""}" data-src="${s.id}">
            <span class="src-dot">${s.code}</span>
            <span><div class="src-n">${esc(s.name)}</div><div class="src-d">${esc(s.desc)}</div></span>
            <span class="src-s pending" data-state>ready</span>
          </div>`).join("")}</div></div>
        <div class="field"><div class="field-k"><span>Surveillance</span></div><div class="chips">${chip("Weekly scan · alerts to reviewers", true)}</div></div>`;
      $$("#rail-body .chip").forEach(b => b.addEventListener("click", () => {
        b.classList.toggle("on");
        if (store.ran) { $("#run-label").textContent = "Scan again"; toast("Protocol changed. Scan again to refresh the evidence base."); }
      }));
      $("#q-text").addEventListener("input", () => { if (store.ran) $("#run-label").textContent = "Scan again"; });
    },
    source(id, state, n) {
      const el = $(`#srcs [data-src="${id}"] [data-state]`); if (!el) return;
      if (state === "query") { el.className = "src-s"; el.innerHTML = `<span class="spin"></span>querying`; }
      else if (state === "done") { el.className = "src-s"; el.innerHTML = `${ic("check")}${nf(n)}`; }
      else { el.className = "src-s pending"; el.textContent = "ready"; }
    },
    resetSources() { DEMO.sources.forEach(s => this.source(s.id, "ready")); }
  };

  /* ---------------- shared pieces ---------------- */
  function funnelHTML(compact) {
    const st = DEMO.funnel.stages;
    return `<div class="funnel${compact ? " compact link" : ""}" id="${compact ? "funnel-compact" : "funnel"}" ${compact ? 'role="button" tabindex="0" title="Open the process and the PRISMA flow"' : ""}>
      ${st.map((s, i) => `<div class="fstage${s.final ? " final" : ""}${compact ? " done" : ""}" data-stage="${s.id}">
        <div class="fs-k">${esc(s.label)}</div>
        <div class="fs-v ${compact ? "" : "wait"} num" data-v="${compact ? s.value : 0}">${compact ? nf(s.value) : "—"}</div>
        <div class="fs-s">${esc(s.sub)}</div>
        <div class="fs-bar"><i></i></div>
      </div>`).join("")}
    </div>`;
  }
  const statusChip = st => ({ recommended: ["spark", "AI recommended"], included: ["check", "Included by reviewer"], flagged: ["flag", "Flagged discrepancy"], excluded: ["x", "Excluded by reviewer"] }[st]);
  function scoreBadge(sid, big) { const sc = SCORE[sid]; return `<span class="score ${tier(sc)}${big ? " big" : ""}" title="AI relevance score"><b>${sc}</b><small>AI</small></span>`; }

  /* ---------------- idle ---------------- */
  const idle = {
    render() {
      const steps = [["Licensed sources", "EMBASE, MEDLINE, COCHRANE, CINAHL, Scopus, queried with one automated search protocol."], ["Clean & normalise", "Deduplicated, harmonised evidence database, traceable and PRISMA-aligned."], ["GenAI scoring", "Each record scored against PICO and the criteria, with an extraction rationale."], ["Reviewer validation", "Scoring cards, flagged discrepancies resolved, evidence selection confirmed."]];
      $("#view-idle").innerHTML = `<div class="view-inner">
        <div class="promise">
          <div>
            <div class="eyebrow">Continuous surveillance · PRISMA-compliant</div>
            <h1>Real-time evidence <em>for the subjects you monitor,</em> every number one tap from its source.</h1>
            <p>Datako SLR runs your literature review as a surveillance loop: licensed databases, AI relevance scoring with a rationale, and medical reviewers who confirm every inclusion before anything leaves the tool.</p>
            <button class="btn tour-cta" data-tour>${ic("play")}Watch the 20-second tour</button>
          </div>
          <div class="promise-steps">${steps.map((s, i) => `<div class="pstep"><b>${i + 1} · ${s[0]}</b><span>${s[1]}</span></div>`).join("")}</div>
        </div>
        <div class="card card-pad">
          <div class="card-head"><span class="card-title">Subjects under surveillance</span><span class="small muted">${DEMO.subjects.length} subjects</span></div>
          <div class="folders two-col">${DEMO.subjects.map(h => `<button class="folder${h.id === store.subjectId ? " on" : ""}" data-q="${h.id}">
            <span class="folder-ic">${ic(h.status === "done" ? "radar" : "folder")}</span><span><div class="folder-t">${esc(h.title)}</div><div class="folder-m">${esc(h.meta)}</div></span>
            <span class="folder-s ${h.status}">${h.status === "done" ? "Live" : "Draft"}</span></button>`).join("")}</div>
        </div>
      </div>`;
      $$("#view-idle .folder").forEach(b => b.addEventListener("click", () => drawer.pick(b.dataset.q)));
    }
  };

  /* ---------------- run (animated surveillance funnel) ---------------- */
  const run = {
    timers: [], raf: null, running: false,
    render() {
      $("#view-run").innerHTML = `<div class="view-inner">
        <div class="run-head">
          <div><div class="run-title">Scanning the literature <span class="live"><i></i>LIVE</span></div><div class="run-sub">${esc(DEMO.question.title)} · ${DEMO.question.scope.years.join("–")}</div></div>
          <div class="muted small num" id="run-clock">0 s</div>
        </div>
        ${funnelHTML(false)}
        <div class="run-grid">
          <div class="card feed">
            <div class="feed-head"><span class="feed-title">AI screening, live</span><span class="small muted" id="feed-count">0 records scored</span></div>
            <div class="feed-list" id="feed"></div>
          </div>
          <div class="card card-pad">
            <div class="card-head"><span class="card-title">Excluded at full text</span><span class="small muted num" id="tally-total">0</span></div>
            <div class="tally" id="tally">${DEMO.funnel.fullTextExclusions.map((x, i) => `<div class="tally-row" data-i="${i}"><span><div class="k">${esc(x.reason)}</div><div class="bar"><i></i></div></span><span class="n num" data-v="0">0</span></div>`).join("")}</div>
          </div>
        </div>
        <div class="skip-wrap"><button class="btn btn-primary skip" id="skip">Skip to the evidence base ${ic("arrow")}</button></div>
      </div>`;
      $("#skip").addEventListener("click", () => this.finish(true));
    },
    speed: 1,
    at(sec, fn) { this.timers.push(setTimeout(fn, reduced ? 0 : sec * 1000 * this.speed)); },
    start(opts) {
      this.speed = (opts && opts.speed) || 1;
      this.stop(); this.render(); router.show("run"); this.running = true; rail.resetSources();
      $("#run-btn").disabled = true; $("#run-label").textContent = "Scanning…";
      const T = DEMO.meta.runSeconds, t0 = performance.now();
      const clock = () => { if (!this.running) return; $("#run-clock").textContent = Math.min(T, Math.floor((performance.now() - t0) / 1000 / this.speed)) + " s"; this.raf = requestAnimationFrame(clock); }; clock();
      const stages = DEMO.funnel.stages;
      const setStage = i => $$("#funnel .fstage").forEach((el, j) => { el.classList.toggle("active", j === i); el.classList.toggle("done", j < i); });
      const fill = (i, p) => { const b = $(`#funnel .fstage[data-stage="${stages[i].id}"] .fs-bar i`); if (b) b.style.width = Math.round(p * 100) + "%"; };
      const count = (i, v, ms) => { const el = $(`#funnel .fstage[data-stage="${stages[i].id}"] .fs-v`); el.classList.remove("wait"); tween(el, v, ms * this.speed, nf); };
      setStage(0);
      DEMO.sources.forEach((s, k) => { this.at(0.2 + k * 0.42, () => rail.source(s.id, "query")); this.at(0.9 + k * 0.42, () => { rail.source(s.id, "done", s.found); fill(0, (k + 1) / DEMO.sources.length); count(0, k + 1, 200); }); });
      this.at(3.4, () => { setStage(1); count(1, stages[1].value, 1400); fill(1, 1); });
      this.at(5.4, () => { setStage(2); count(2, stages[2].value, 1000); fill(2, 1); });
      this.at(7.0, () => { setStage(3); count(3, stages[3].value, 3600); });
      for (let k = 1; k <= 8; k++) this.at(7.0 + k * 0.5, () => fill(3, k / 8));
      this.at(11.0, () => { setStage(4); count(4, stages[4].value, 3800); });
      for (let k = 1; k <= 9; k++) this.at(11.0 + k * 0.5, () => fill(4, k / 9));
      this.at(15.5, () => { setStage(5); count(5, stages[5].value, 5000); });
      for (let k = 1; k <= 12; k++) this.at(15.5 + k * 0.5, () => fill(5, k / 12));
      const ex = DEMO.funnel.fullTextExclusions, total = ex.reduce((a, x) => a + x.count, 0);
      ex.forEach((x, i) => { for (let k = 1; k <= 5; k++) this.at(15.8 + i * 0.3 + k * 1.0, () => { const row = $(`#tally [data-i="${i}"]`); if (!row) return; const v = Math.round(x.count * k / 5); row.querySelector(".bar i").style.width = Math.round(100 * v / ex[0].count) + "%"; tween(row.querySelector(".n"), v, 300, nf); let tt = 0; $$("#tally .n").forEach(n => tt += Number(n.dataset.v || 0)); $("#tally-total").textContent = nf(Math.min(total, tt)) + " of " + nf(total); }); });
      const recs = DEMO.records, step = 20 / recs.length;
      recs.forEach((r, k) => this.at(1.0 + k * step, () => this.push(r, k + 1)));
      this.at(T, () => this.finish(false));
    },
    push(r, k) {
      const feed = $("#feed"); if (!feed) return;
      const sc = r.d === "keep" ? 72 + ((r.t.length * 7) % 27) : 18 + ((r.t.length * 5) % 40);
      const tag = r.d === "keep" ? `<span class="tag keep">${ic("check")}${esc(r.r)}</span>` : `<span class="tag drop">${ic("x")}${esc(r.r)}</span>`;
      const el = document.createElement("div"); el.className = "rec";
      el.innerHTML = `<span class="score ${tier(sc)}"><b>${sc}</b><small>AI</small></span><span><div class="rec-t">${esc(r.t)}</div><div class="rec-m"><b>${esc(r.m)}</b></div></span>${tag}`;
      feed.prepend(el); while (feed.children.length > 9) feed.lastChild.remove();
      $("#feed-count").textContent = `${k} records scored`;
    },
    stop() { this.timers.forEach(clearTimeout); this.timers = []; if (this.raf) cancelAnimationFrame(this.raf); this.running = false; },
    finish(skipped) {
      this.stop(); store.ran = true; DEMO.sources.forEach(s => rail.source(s.id, "done", s.found));
      $("#run-btn").disabled = false; $("#run-label").textContent = "Scan again";
      results.render(); router.show("results");
      if (skipped) toast("Skipped ahead. The full PRISMA flow is under How it works.");
    }
  };

  /* ---------------- results: the evidence base ---------------- */
  const results = {
    render() {
      const q = DEMO.question, st = DEMO.funnel.stages;
      $("#view-results").innerHTML = `<div class="view-inner">
        <div class="res-head">
          <div>
            <div class="res-eyebrow">Evidence base <span class="ok">${ic("check")}Scanned ${esc(DEMO.meta.runDate)} · next scan ${esc(DEMO.meta.nextScan)}</span></div>
            <h2 class="res-title">${esc(q.title)}</h2>
            <div class="res-sub" id="res-sub"></div>
          </div>
          <div class="res-actions">
            <button class="btn btn-sm" data-open="export">${ic("download")}Export</button>
          </div>
        </div>
        ${funnelHTML(true)}
        <div class="strips" id="strips"></div>
        <div class="card matrix" id="matrix"></div>
      </div>`;
      $("#funnel-compact").addEventListener("click", () => panels.open("method"));
      $("#funnel-compact").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); panels.open("method"); } });
      this.renderSub(); this.renderStrips(true); this.renderMatrix();
    },
    renderSub() {
      const c = { recommended: 0, included: 0, flagged: 0, excluded: 0 };
      RETAINED.forEach(s => c[store.status(s.id)]++);
      $("#res-sub").innerHTML = `<span><b>${RETAINED.length}</b> records in the evidence base</span><span><b>${EX.length}</b> figures, each with its verbatim quote</span>
        <span class="val-line">${c.flagged ? `<span class="warn">${ic("flag", "ic-sm")}<b>${c.flagged}</b> flagged discrepanc${c.flagged > 1 ? "ies" : "y"} to resolve</span>` : ""}${c.included ? `<span class="good">${ic("check", "ic-sm")}<b>${c.included}</b> confirmed by you</span>` : ""}${c.excluded ? `<span class="warn">${ic("x", "ic-sm")}<b>${c.excluded}</b> excluded by you</span>` : ""}${!c.flagged && !c.included && !c.excluded ? `<span class="muted">All ${c.recommended} records await your confirmation</span>` : ""}</span>`;
    },
    renderStrips(entrance) {
      const wrap = $("#strips"); wrap.innerHTML = "";
      OUTKEYS.forEach((o, i) => {
        const el = document.createElement("div"); el.className = "card strip" + (OUT[o].bands.length > 1 ? " wide" : ""); el.id = "strip-" + o; el.dataset.o = o;
        if (entrance) el.style.animation = `rise .4s var(--ease) ${0.08 * i}s both`;
        wrap.appendChild(el); this.fillStrip(o, entrance);
      });
    },
    stripText(o) {
      const def = OUT[o], head = synth.compute(o, def.bands[0].id);
      return {
        v: `${head.n ? def.fmt(head.median) : "—"}<small>${esc(def.unitShort)}</small>`,
        r: head.n ? `median of <b>${head.n}</b> comparable figures · range <b>${def.fmt(head.min)}</b> – <b>${def.fmt(head.max)}</b>${head.excluded.length ? ` · <span class="rej">${head.excluded.length} excluded by you</span>` : ""}` : "no comparable figure",
        conf: head.confidence, why: synth.whyConf(head)
      };
    },
    fillStrip(o, entrance) {
      const el = $("#strip-" + o), def = OUT[o], bands = def.bands, t = this.stripText(o);
      el.innerHTML = `
        <div class="strip-top"><div><div class="strip-k">${esc(def.label)}</div><div class="strip-u">${esc(def.headline)}</div></div>
          <span class="conf ${t.conf}" title="${esc(t.why)}"><i></i>${t.conf} confidence</span></div>
        <div class="strip-mid"><div class="strip-v countin">${t.v}</div><div class="strip-r">${t.r}</div></div>
        <div class="forest-wrap">${this.forestSVG(o)}</div>`;
      $$(".forest .dot", el).forEach((d, k) => {
        d.addEventListener("click", () => card.open(d.dataset.ex, d));
        if (entrance && !reduced) { d.style.opacity = "0"; d.style.transform += " translateY(-14px)"; setTimeout(() => { d.style.opacity = ""; d.style.transform = d.dataset.tf; }, 120 + k * 45); }
      });
    },
    forestSVG(o) {
      const def = OUT[o], bands = def.bands, sc = synth.scale(o);
      const W = 640, L = 118, R = 24, rowH = 44, top = 8, axisH = 22;
      const H = top + bands.length * rowH + axisH;
      const x = v => L + (v - sc.min) / (sc.max - sc.min) * (W - L - R);
      const ticks = niceTicks(sc.min, sc.max, 5);
      let s = `<svg class="forest" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="aspect-ratio:${W}/${H}">`;
      s += ticks.map(tk => `<line class="tick" x1="${x(tk)}" x2="${x(tk)}" y1="${top}" y2="${top + bands.length * rowH}"/><text class="tlab" x="${x(tk)}" y="${H - 6}" text-anchor="middle">${esc(def.fmt(tk))}</text>`).join("");
      s += `<line class="axis" x1="${L}" x2="${W - R}" y1="${top + bands.length * rowH}" y2="${top + bands.length * rowH}"/>`;
      bands.forEach((b, i) => {
        const r = synth.compute(o, b.id), cy = top + i * rowH + rowH / 2;
        s += `<text x="0" y="${cy + 4}" style="fill:var(--ink);font-size:12px;font-weight:600;font-family:var(--font)">${esc(b.label)}</text>`;
        s += `<text class="bandn" data-band="${b.id}" x="0" y="${cy + 18}" style="fill:var(--muted);font-size:10px;font-family:var(--font)">${r.n ? `n ${r.n} · ${esc(def.fmt(r.median))}` : "no comparable figure"}</text>`;
        if (r.n) {
          s += `<g class="rng" data-band="${b.id}" style="transform:translate(${x(r.min)}px,${cy}px) scale(${Math.max(1, x(r.max) - x(r.min))},1)"><line class="range ${r.confidence}" x1="0" x2="1" y1="0" y2="0" vector-effect="non-scaling-stroke"/></g>`;
          s += `<g class="med" data-band="${b.id}" style="transform:translate(${x(r.median)}px,${cy}px)"><line class="median" x1="0" x2="0" y1="-11" y2="11"/></g>`;
        }
        const items = r.all.slice().sort((a, b2) => a.plot - b2.plot);
        let lastX = -99, lane = 0;
        items.forEach(e => {
          const cx = x(e.plot); lane = (cx - lastX < 9) ? (lane + 1) % 3 : 0; lastX = cx;
          const dy = [0, -7, 7][lane]; const st = store.status(e.s); const sc2 = SCORE[e.s];
          const cls = `dot ${tier(sc2)}${e.pooled ? "" : " ctx"}${st === "excluded" ? " excluded" : ""}${st === "flagged" ? " flagged" : ""}`;
          const tf = `translate(${cx}px,${cy + dy}px)`;
          s += `<g class="${cls}" data-ex="${e.id}" data-s="${e.s}" data-tf="${tf}" style="transform:${tf}" tabindex="0" role="button" aria-label="${esc(studyRef(STUDY[e.s]))}: ${esc(e.display)}">
            <circle class="hit" r="14"/><circle r="${e.pooled ? 6 : 4.5}"/>${st === "excluded" ? '<line x1="-6" y1="-6" x2="6" y2="6"/>' : ""}</g>`;
        });
      });
      s += `</svg>`;
      return s;
    },
    updateStrips() {
      OUTKEYS.forEach(o => {
        const el = $("#strip-" + o); if (!el) return;
        const def = OUT[o], sc = synth.scale(o);
        const W = 640, L = 118, R = 24; const x = v => L + (v - sc.min) / (sc.max - sc.min) * (W - L - R);
        def.bands.forEach(b => {
          const r = synth.compute(o, b.id);
          const rng = $(`.rng[data-band="${b.id}"]`, el), med = $(`.med[data-band="${b.id}"]`, el), lab = $(`.bandn[data-band="${b.id}"]`, el);
          if (rng && r.n) { rng.style.transform = `translate(${x(r.min)}px,${rng.style.transform.match(/,(.*?)px\)/)[1]}px) scale(${Math.max(1, x(r.max) - x(r.min))},1)`; rng.firstElementChild.setAttribute("class", "range " + r.confidence); }
          if (med && r.n) med.style.transform = `translate(${x(r.median)}px,${med.style.transform.match(/,(.*?)px\)/)[1]}px)`;
          if (lab) lab.textContent = r.n ? `n ${r.n} · ${def.fmt(r.median)}` : "no comparable figure";
        });
        $$(".dot", el).forEach(d => { const st = store.status(d.dataset.s); d.classList.toggle("excluded", st === "excluded"); d.classList.toggle("flagged", st === "flagged"); const line = d.querySelector("line"); if (st === "excluded" && !line) d.insertAdjacentHTML("beforeend", '<line x1="-6" y1="-6" x2="6" y2="6"/>'); if (st !== "excluded" && line) line.remove(); });
        const t = this.stripText(o);
        const v = $(".strip-v", el); v.classList.remove("countin"); void v.offsetWidth; v.classList.add("countin"); v.innerHTML = t.v;
        $(".strip-r", el).innerHTML = t.r;
        const c = $(".conf", el); c.className = "conf " + t.conf; c.title = t.why; c.innerHTML = `<i></i>${t.conf} confidence`;
      });
    },
    renderMatrix() {
      const m = $("#matrix"); if (!m) return;
      const f = store.filter;
      let rows = RETAINED.slice();
      if (f === "europe") rows = rows.filter(s => s.region === "Europe");
      if (f === "bench") rows = rows.filter(s => s.region !== "Europe");
      if (OUTKEYS.includes(f)) rows = rows.filter(s => EX.some(e => e.s === s.id && e.o === f));
      rows.sort((a, b) => SCORE[b.id] - SCORE[a.id]);
      const cols = OUTKEYS.includes(f) ? [f] : OUTKEYS;
      const seg = [["all", "All"], ["europe", "Europe"], ["bench", "Benchmarks"], ...OUTKEYS.map(o => [o, OUT[o].label])];
      const cell = (s, o) => { const ex = EX.filter(e => e.s === s.id && e.o === o); if (!ex.length) return `<span class="none">—</span>`; const st = store.status(s.id); return ex.map(e => `<button class="fig${e.pooled ? "" : " ctx"}${st === "excluded" ? " excluded" : ""}${e.status === "flagged" ? " flagged" : ""}" data-ex="${e.id}" title="${esc(e.unit)}">${esc(e.display)}</button>`).join("<br>"); };
      m.innerHTML = `
        <div class="mx-head"><span class="mx-title">Records · prioritised by AI relevance score</span>
          <div class="seg">${seg.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${f === k}">${esc(l)}</button>`).join("")}</div>
          <label class="small muted" style="display:inline-flex;align-items:center;gap:8px;min-height:36px"><input type="checkbox" id="show-excl" ${store.showExcluded ? "checked" : ""}> Show full-text exclusions</label></div>
        <div class="mx-scroll"><table class="mx">
          <thead><tr><th>Score</th><th>Record</th><th>Status</th><th>Design</th><th>Country</th><th>Age</th>${cols.map(o => `<th class="oc">${esc(OUT[o].label)}<br><span style="font-weight:400;text-transform:none;letter-spacing:0">${esc(OUT[o].unitShort)}</span></th>`).join("")}</tr></thead>
          <tbody>
            ${rows.map(s => { const st = store.status(s.id), sc = statusChip(st); return `<tr data-s="${s.id}" class="${st === "excluded" ? "excl" : ""}">
              <td>${scoreBadge(s.id)}</td>
              <td class="st"><div class="st-a">${esc(s.author)} <span class="yr">${s.year}</span>${s.journal.includes("preprint") ? ' <span class="tag drop mini">preprint</span>' : ""}${s.region !== "Europe" ? ` <span class="tag read mini">${esc(s.region)} benchmark</span>` : ""}</div><div class="st-j" title="${esc(s.title)}">${esc(s.journal)} · ${esc(s.title)}</div></td>
              <td><span class="status ${st}" data-status="${s.id}">${ic(sc[0], "ic-sm")}${sc[1]}</span></td>
              <td class="c">${esc(s.design)}</td><td class="c">${esc(s.country)}</td><td class="c">${esc(s.age)}</td>
              ${cols.map(o => `<td class="val">${cell(s, o)}</td>`).join("")}
            </tr>`; }).join("")}
            ${store.showExcluded ? DEMO.studies.filter(s => s.excluded).map(s => `<tr class="excl"><td>${scoreBadge(s.id)}</td><td class="st"><div class="st-a">${esc(s.author)} <span class="yr">${s.year}</span></div><div class="st-j">${esc(s.journal)} · ${esc(s.title)}</div></td><td><span class="status excluded">${ic("x", "ic-sm")}${esc(s.excluded)}</span></td><td class="c">${esc(s.design)}</td><td class="c">${esc(s.country)}</td><td class="c">${esc(s.age)}</td><td colspan="${cols.length}" class="small">${esc(s.exclWhy)}</td></tr>`).join("") : ""}
          </tbody></table></div>
        <div class="legend"><span><i class="sw"></i>tap a figure for its source and scoring card</span><span><i class="sw d"></i>context, shown but not pooled</span></div>`;
      $$(".seg button", m).forEach(b => b.addEventListener("click", () => { store.filter = b.dataset.f; this.renderMatrix(); }));
      $("#show-excl").addEventListener("change", e => { store.showExcluded = e.target.checked; this.renderMatrix(); });
      $$(".fig", m).forEach(b => b.addEventListener("click", () => card.open(b.dataset.ex, b)));
      $$(".status[data-status]", m).forEach(b => b.addEventListener("click", () => { const sid = b.dataset.status; const first = EX.find(e => e.s === sid); if (first) card.open(first.id, $(`.fig[data-ex="${first.id}"]`, m)); }));
    },
    updateMatrix() {
      $$("#matrix tr[data-s]").forEach(tr => {
        const sid = tr.dataset.s, st = store.status(sid), sc = statusChip(st);
        tr.classList.toggle("excl", st === "excluded");
        const chip = tr.querySelector(".status"); chip.className = "status " + st; chip.innerHTML = `${ic(sc[0], "ic-sm")}${sc[1]}`;
        $$(".fig", tr).forEach(b => b.classList.toggle("excluded", st === "excluded"));
      });
    }
  };

  function niceTicks(min, max, n) {
    const span = max - min, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag; const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(Number(v.toFixed(6)));
    return out;
  }

  /* ---------------- scoring card + provenance thread ---------------- */
  const card = {
    id: null, from: null,
    open(id, fromEl) {
      this.id = id; this.from = fromEl;
      $$(".fig.hl, .dot.hl").forEach(x => x.classList.remove("hl")); if (fromEl) fromEl.classList.add("hl");
      this.renderBody();
      overlay.open("sheet");
      setTimeout(() => {
        if (fromEl) fromEl.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
        const sc = fromEl && fromEl.closest(".mx-scroll"); if (sc) { const r = fromEl.getBoundingClientRect(), sr = sc.getBoundingClientRect(); sc.scrollLeft += r.left - sr.left - 48; }
        setTimeout(() => thread.draw(fromEl, $("#sheet mark")), reduced ? 0 : 200);
      }, reduced ? 0 : 400);
    },
    renderBody() {
      const e = EXALL[this.id], s = STUDY[e.s], st = store.status(s.id), def = OUT[e.o], sc = statusChip(st);
      const others = EX.filter(x => x.s === s.id && x.id !== e.id);
      const ciTxt = e.ci ? `95% CI ${esc(fmtCI(e, e.ci[0]))} – ${esc(fmtCI(e, e.ci[1]))}` : `no interval reported`;
      const exc = esc(e.excerpt); const mk = e.mark ? esc(e.mark) : null;
      const quote = mk && exc.includes(mk) ? exc.replace(mk, `<mark>${mk}</mark>`) : exc;
      const srcTag = s.journal.includes("preprint") ? "Europe PMC · preprint" : (SCORE[s.id] % 2 ? "EMBASE" : "MEDLINE");
      const outs = [...new Set(EX.filter(x => x.s === s.id).map(x => OUT[x.o].label))].join(", ");
      const logs = store.log.filter(l => l.sid === s.id).slice(0, 3);
      $("#sheet-body").innerHTML = `
        <div class="sc-top">${scoreBadge(s.id, true)}<div class="sc-top-r"><span class="src-tag">${esc(srcTag)}</span><span class="status ${st}">${ic(sc[0], "ic-sm")}${sc[1]}</span></div></div>
        <div class="ev-title">${esc(s.title)}</div>
        <div class="muted small">${esc(studyRef(s))} · <i>${esc(s.journal)}</i> · ${esc(s.design)}</div>
        <div class="excerpt"><div class="excerpt-k">Figure you tapped · verbatim excerpt <span>${esc(e.where)}</span></div>
          <div class="ev-value"><span class="ev-v">${esc(e.display)}</span><span class="ev-u">${esc(e.unit)} · ${ciTxt}</span></div>
          <q>${quote}</q></div>
        <div class="rationale">${ic("spark")}<div><b>AI rationale.</b> ${esc(s.gradeWhy)}. ${esc(e.how)} ${esc(e.why)}</div></div>
        <div class="pico-box"><div class="pico-k">Extracted PICO</div>
          <div class="pico-row"><b>P</b><span>${esc(s.age)} · ${esc(s.country)} · ${esc(s.setting.toLowerCase())}${s.n ? " · " + esc(s.n) : ""}</span></div>
          <div class="pico-row"><b>I</b><span>None · burden of disease</span></div>
          <div class="pico-row"><b>C</b><span>${esc(s.comparator || "—")}</span></div>
          <div class="pico-row"><b>O</b><span>${esc(outs)}</span></div></div>
        ${others.length ? `<div class="others"><div class="pico-k">Other figures from this record</div>${others.map(x => `<button class="other" data-ex="${x.id}"><span class="fig${x.pooled ? "" : " ctx"}" style="min-height:30px">${esc(x.display)}</span><span class="muted small">${esc(x.unit)}</span></button>`).join("")}</div>` : ""}
        <div class="ev-meta"><div style="grid-column:1/-1"><b>Source</b><span><a href="${esc(s.url)}" target="_blank" rel="noopener">${ic("link", "ic-sm")} doi:${esc(s.doi)}</a></span></div></div>
        ${logs.length ? `<div class="log">${logs.map(l => `<div><span class="t">${esc(l.t)}</span><span><span class="h">${esc(l.status)}</span> by you</span></div>`).join("")}</div>` : `<div class="log"><div><span class="t">${esc(DEMO.meta.lastSync)}</span><span>Scored and extracted by Datako SLR · awaiting your decision</span></div></div>`}`;
      $("#sheet-foot").innerHTML = `<div class="foot-k">Reviewer decision</div><div class="foot-btns">
        <button class="btn btn-teal" data-d="included" ${st === "included" ? 'aria-pressed="true"' : ""}>${ic("check")}Include</button>
        <button class="btn btn-human" data-d="flagged" ${st === "flagged" ? 'aria-pressed="true"' : ""}>${ic("flag")}Flag</button>
        <button class="btn btn-human" data-d="excluded" ${st === "excluded" ? 'aria-pressed="true"' : ""}>${ic("x")}Exclude</button></div>`;
      $$("#sheet-foot .btn").forEach(b => b.addEventListener("click", () => this.decide(b.dataset.d)));
      $$("#sheet-body .other").forEach(b => b.addEventListener("click", () => { thread.clear(); this.id = b.dataset.ex; this.renderBody(); $("#sheet-body").scrollTop = 0; }));
    },
    decide(status) {
      const e = EXALL[this.id], s = STUDY[e.s]; const prev = store.status(s.id); if (prev === status) return;
      store.decide(s.id, status); this.renderBody();
      const touched = [...new Set(EX.filter(x => x.s === s.id && x.pooled).map(x => x.o))];
      touched.forEach(o => { const strip = $("#strip-" + o); if (strip) { strip.classList.add("hit"); setTimeout(() => strip.classList.remove("hit"), 900); } });
      toast(status === "excluded" ? `${studyRef(s)} excluded. ${touched.length ? touched.map(o => OUT[o].label).join(" and ") + " recomputed." : ""}` : status === "flagged" ? `${studyRef(s)} flagged as a discrepancy to resolve.` : `${studyRef(s)} confirmed in the evidence base.`);
    }
  };
  function fmtCI(e, v) { const d = OUT[e.o]; if (e.o === "hospitalisation" && e.display.includes("/1,000")) return v.toFixed(2) + " /1,000"; if (e.o === "hospitalisation" && e.display.includes("attack")) return v + "%"; if (e.o === "cost" && e.display.startsWith("$")) return "$" + nf(v); if (e.o === "cost" && v < 1000 && e.display.includes("bn")) return "$" + v + " bn"; if ((e.o === "mortality" || e.o === "incidence") && v > 100) return nf(v); return d.fmt(v); }

  const thread = {
    draw(fromEl, toEl) {
      const p = $("#thread-path"), dot = $("#thread-dot");
      p.classList.remove("draw"); dot.classList.remove("show"); p.setAttribute("d", "");
      if (!fromEl || !toEl || reduced) return;
      const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
      if (!a.width || !b.width) return;
      const x1 = a.right - 2, y1 = a.top + a.height / 2, x2 = b.left - 6, y2 = b.top + b.height / 2;
      const dx = Math.max(60, (x2 - x1) * 0.45);
      p.setAttribute("d", `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
      dot.setAttribute("cx", x2); dot.setAttribute("cy", y2);
      void p.getBoundingClientRect(); p.classList.add("draw"); dot.classList.add("show");
    },
    clear() { $("#thread-path").classList.remove("draw"); $("#thread-path").setAttribute("d", ""); $("#thread-dot").classList.remove("show"); }
  };

  /* ---------------- panels ---------------- */
  const panels = {
    tab: "how",
    open(name) {
      if (name === "subjects") { drawer.render(); overlay.open("drawer"); return; }
      if (name === "method") this.method(); if (name === "export") this.export();
      overlay.open("panel-" + name);
    },
    method() {
      $$("#panel-method .tabs button").forEach(b => { b.setAttribute("aria-selected", b.dataset.tab === this.tab); b.onclick = () => { this.tab = b.dataset.tab; this.method(); }; });
      $("#method-body").innerHTML = this.tab === "how" ? this.how() : this.why();
    },
    how() {
      const st = DEMO.funnel.stages, ex = DEMO.funnel.fullTextExclusions;
      const cols = [
        { k: "Licensed sources", cls: "c1", items: [["Automated search queries", "EMBASE, MEDLINE, COCHRANE, CINAHL and Scopus, queried on a schedule with the protocol's search strategy.", "Aggregated raw literature corpus"]] },
        { k: "GenAI orchestration tool", cls: "c2", items: [["1 · Data gathering", "Records collected from every source with their metadata and abstracts.", "Raw corpus, traceable to each database"], ["2 · Data cleaning & normalisation", "Deduplicated, harmonised evidence database.", "PRISMA-aligned reporting, live counts"], ["3 · GenAI scoring with extraction rationale", "Each record scored against PICO and the inclusion/exclusion criteria; figures extracted with their verbatim sentence.", "Prioritised evidence, mapped to PICO and criteria"]] },
        { k: "Human monitoring & validation", cls: "c3", items: [["Evaluate", "AI recommendations reviewed through scoring cards.", null], ["Resolve", "Flagged discrepancies settled by a medical reviewer.", null], ["Confirm", "Evidence selection confirmed; every decision logged.", null]] }
      ];
      return `
        <div class="process">${cols.map(c => `<div class="pcol ${c.cls}"><div class="pcol-k">${esc(c.k)}</div>${c.items.map(it => `<div class="pitem"><b>${esc(it[0])}</b><span>${esc(it[1])}</span>${it[2] ? `<em>${ic("arrow", "ic-sm")}${esc(it[2])}</em>` : ""}</div>`).join("")}</div>`).join("")}</div>
        <div class="banner">${ic("shield")}<span>End-to-end traceability from raw source to human confirmation: every AI recommendation and every reviewer decision stays auditable and PRISMA-compliant.</span></div>
        <div class="two">
          <div class="card card-pad"><div class="card-head"><span class="card-title">PRISMA flow for this subject</span><span class="small muted">live counts</span></div>${this.prisma(st, ex)}</div>
          <div class="guar">
            ${[["radar", "Continuous surveillance", "Scheduled scans detect newly published evidence; reviewers are alerted, not asked to search again."],
               ["spark", "Relevance explained", "Every record carries an AI score and a rationale against the locked PICO protocol."],
               ["quote", "Verbatim extraction", "Each figure keeps the sentence it comes from, its unit and its interval. Units are never silently converted."],
               ["scale", "Like-for-like synthesis", "Only comparable figures are pooled: median, range, confidence. Benchmarks stay visible, outside the pool."],
               ["hand", "Reviewers accountable", "Include, flag or exclude any record. The evidence base recomputes on the spot and the decision is logged.", true],
               ["lock", "Licensed sources, zero retention", "Your database licences, EU hosting, no model training on your data."]]
              .map(g => `<div class="gu"><span class="ic-box${g[3] ? " h" : ""}">${ic(g[0])}</span><div><b>${g[1]}</b><span>${g[2]}</span></div></div>`).join("")}
            <p class="small muted">Confidence rule, printed with every export: <b>High</b> needs at least 4 comparable figures, 75% within ±25% of the median and no grade D record; <b>Moderate</b> at least 2 figures, half concordant; <b>Low</b> otherwise.</p>
          </div>
        </div>`;
    },
    prisma(st, ex) {
      const box = (x, y, w, h, k, v, cls) => `<rect class="${cls || ""}" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/><text class="k" x="${x + 12}" y="${y + 18}">${k}</text><text class="v" x="${x + 12}" y="${y + 40}">${v}</text>`;
      const arrow = (x, y1, y2) => `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/><path class="arr" d="M${x - 4},${y2 - 6} L${x + 4},${y2 - 6} L${x},${y2} Z"/>`;
      const side = (y, k, v) => `<rect class="excl" x="250" y="${y}" width="210" height="44" rx="6"/><text class="e" x="262" y="${y + 18}">${k}</text><text class="v" x="262" y="${y + 36}" style="font-size:14px">${v}</text><line x1="220" y1="${y + 22}" x2="250" y2="${y + 22}"/>`;
      return `<svg class="prisma" viewBox="0 0 470 470">
        ${box(10, 10, 210, 52, "Identified across 6 sources", nf(st[1].value), "keep")}${arrow(115, 62, 82)}
        ${box(10, 82, 210, 52, "After deduplication", nf(st[2].value), "keep")}${side(86, "Duplicates removed", nf(st[1].value - st[2].value))}${arrow(115, 134, 154)}
        ${box(10, 154, 210, 52, "AI relevance ≥ 50", nf(st[3].value), "keep")}${side(158, "Below threshold", nf(st[2].value - st[3].value))}${arrow(115, 206, 226)}
        ${box(10, 226, 210, 52, "Reviewer queue (abstract)", nf(st[4].value), "keep")}${side(230, "Excluded on abstract", nf(st[3].value - st[4].value))}${arrow(115, 278, 298)}
        ${box(10, 298, 210, 52, "Full text assessed", nf(st[4].value), "keep")}${arrow(115, 350, 370)}
        ${box(10, 370, 210, 52, "Included in the evidence base", nf(st[5].value), "final")}
        <rect class="excl" x="250" y="298" width="210" height="${ex.length * 20 + 36}" rx="6"/><text class="e" x="262" y="316">Excluded at full text · ${nf(ex.reduce((a, x) => a + x.count, 0))}</text>
        ${ex.map((x, i) => `<text x="262" y="${338 + i * 20}" style="font-size:11px">${esc(x.reason.length > 34 ? x.reason.slice(0, 33) + "…" : x.reason)}</text><text class="v" x="448" y="${338 + i * 20}" text-anchor="end" style="font-size:12px">${x.count}</text>`).join("")}
        <line x1="220" y1="324" x2="250" y2="324"/>
      </svg>`;
    },
    why() {
      const hb = (lv, us) => `<svg class="hb${us ? " us" : ""}" viewBox="0 0 20 20" aria-label="${["not provided", "partly", "provided"][lv]}"><circle class="o" cx="10" cy="10" r="8.2"/>${lv === 2 ? '<circle class="f" cx="10" cy="10" r="8.2"/>' : lv === 1 ? '<path class="f" d="M10 1.8 A8.2 8.2 0 0 1 10 18.2 Z"/>' : ""}</svg>`;
      const cols = ["Manual SLR", "General AI chat", "AI search tools", "Database alone"];
      const rows = [
        ["Protocol locked before the search", "PICO, inclusion and exclusion criteria", [2, 0, 1, 2, 2]],
        ["Licensed databases, continuously", "EMBASE, MEDLINE, COCHRANE, CINAHL, Scopus", [1, 0, 0, 2, 2]],
        ["Relevance score with a rationale", "for every record", [0, 0, 1, 0, 2]],
        ["Verbatim quote behind every figure", "sentence, unit, interval", [1, 0, 1, 0, 2]],
        ["PRISMA flow, every exclusion explained", "auditable and exportable", [2, 0, 0, 0, 2]],
        ["Expert decides, evidence recomputes", "every decision logged", [1, 0, 0, 0, 2]],
        ["New evidence without a new search", "scheduled surveillance", [0, 0, 1, 1, 2]],
        ["Time to a defensible first answer", "", ["Weeks", "Minutes¹", "Minutes", "Hours", "Minutes"]]
      ];
      const pillars = [
        ["c1", "Maintain real-time awareness", "Detect newly published evidence on a schedule, instead of a review every year or two.", "Weekly scan · next on " + DEMO.meta.nextScan],
        ["c2", "Automate evidence processing", "Prioritise records, explain their relevance and prepare the reviewer's decision.", "AI score and rationale on every record"],
        ["c3", "Standardise operations at scale", "One traceable workflow instead of inconsistent high-volume manual screening.", "PRISMA flow with live counts"],
        ["c4", "Guarantee expert validation", "Medical reviewers stay accountable: every recommendation is validated and audited.", "Include · Flag · Exclude, logged"]
      ];
      return `<div class="why">
        <div class="why-hero">
          <div><div class="eyebrow-k">Why Datako</div><h3>The systematic part of a systematic review, in minutes. <em>The judgement stays with your experts.</em></h3></div>
          <div class="why-proof">
            <div><b>22 s</b><span>to screen 3,412 records in this demo</span></div>
            <div><b>100%</b><span>of figures carry their verbatim quote</span></div>
            <div><b>1 tap</b><span>from any number to its source</span></div>
          </div>
        </div>
        <div class="pillars">${pillars.map((p, i) => `<div class="pillar ${p[0]}"><span class="pn">${i + 1}</span><b>${p[1]}</b><span>${p[2]}</span><em>${ic("check", "ic-sm")}${esc(p[3])}</em></div>`).join("")}</div>
        <div class="card vs">
          <div class="vs-title"><span class="card-title">Datako SLR against the alternatives</span><span class="vs-legend">${hb(2)}provided ${hb(1)}partly ${hb(0)}not provided</span></div>
          <div class="vs-grid">
            <div class="vs-layer" aria-hidden="true"><i></i></div>
            <div class="vs-h k"></div>${cols.map(c => `<div class="vs-h">${c}</div>`).join("")}<div class="vs-h us"><span class="vs-mark"></span>Datako SLR</div>
            ${rows.map(r => `<div class="vs-k">${r[0]}${r[1] ? `<small>${r[1]}</small>` : ""}</div>${r[2].map((v, j) => `<div class="vs-c${j === 4 ? " us" : ""}">${typeof v === "number" ? hb(v, j === 4) : `<b>${v}</b>`}</div>`).join("")}`).join("")}
          </div>
          <p class="vs-note">¹ Fast, but no locked protocol, no PRISMA flow and no verbatim source behind each number. General AI chat: assistants with web browsing. AI search tools: literature search assistants. Database alone: EMBASE, PubMed or Scopus used directly.</p>
        </div>
        <div class="card card-pad road">
          <div class="card-head"><span class="card-title">From pilot to continuous surveillance, in about 12 weeks</span><span class="small muted">low-risk start, Go / No-Go at week 3–4</span></div>
          <div class="road-bar">
            <div class="ph p1" style="flex:3.6"><b>1 · Proof of concept</b><span>3–4 weeks, benchmarked on a historical SLR</span></div>
            <div class="gate"><i></i><span>Go / No-Go</span></div>
            <div class="ph p2" style="flex:8"><b>2 · Data structuring & LLM deployment</b><span>8–10 weeks · pipelines, tailored model, human-in-the-loop</span></div>
            <div class="ph p3" style="flex:4.4"><b>3 · Scaling</b><span>other subjects and therapeutic areas</span></div>
          </div>
        </div>
        <div class="convict">
          <div><div class="eyebrow-k light">Datako's conviction</div><p>True transformation goes beyond automating database searches: a scalable, AI-driven surveillance engine that removes the operational burden while medical experts keep absolute rigour and accountability.</p></div>
          <div class="oss"><span class="oss-k">One-stop shop</span>${[["db", "Technology", "Pipelines, GenAI, API integration"], ["scale", "Strategic advisory", "Pharma-focused framing and KPIs"], ["hand", "Training", "Reviewer upskilling and adoption"]].map(o => `<div class="oss-i">${ic(o[0])}<span><b>${o[1]}</b><small>${o[2]}</small></span></div>`).join("")}</div>
        </div>
      </div>`;
    },
    export() {
      const st = DEMO.funnel.stages, n = Object.keys(store.decisions).length;
      $("#export-body").innerHTML = `
        <div class="exports">
          <button class="exp" data-x="PRISMA flow diagram (SVG, PNG)"><div class="pv">${this.prisma(st, DEMO.funnel.fullTextExclusions).replace('class="prisma"', 'class="prisma" preserveAspectRatio="xMidYMid meet"')}</div><b>PRISMA flow diagram</b><span>Counts and exclusion reasons for this subject.</span><span class="small" style="color:var(--blue-ink);font-weight:600">${ic("download", "ic-sm")} SVG · PNG</span></button>
          <button class="exp" data-x="Evidence table (XLSX)"><div class="pv"><svg viewBox="0 0 200 120"><g fill="none" stroke="#CDD7E2">${[0, 1, 2, 3, 4, 5].map(i => `<line x1="10" x2="190" y1="${20 + i * 17}" y2="${20 + i * 17}"/>`).join("")}${[0, 1, 2, 3].map(i => `<line y1="20" y2="105" x1="${10 + i * 45}" x2="${10 + i * 45}"/>`).join("")}</g><rect x="10" y="20" width="180" height="17" fill="#EAF4FB"/>${[1, 2, 3, 4].map(i => `<rect x="150" y="${24 + i * 17}" width="30" height="8" rx="2" fill="#2DD4BF" opacity=".6"/>`).join("")}</svg></div><b>Evidence table</b><span>${EX.length} figures with quote, DOI, score, rationale and the ${n} reviewer decision${n === 1 ? "" : "s"}.</span><span class="small" style="color:var(--blue-ink);font-weight:600">${ic("download", "ic-sm")} XLSX · CSV</span></button>
          <button class="exp" data-x="Evidence brief (PPTX, 5 slides)"><div class="pv"><svg viewBox="0 0 200 120"><rect x="20" y="14" width="160" height="92" rx="4" fill="#fff" stroke="#CDD7E2"/><rect x="30" y="24" width="80" height="8" rx="2" fill="#0A2036"/><rect x="30" y="40" width="140" height="4" rx="2" fill="#CDD7E2"/><rect x="30" y="50" width="120" height="4" rx="2" fill="#CDD7E2"/>${[0, 1, 2, 3].map(i => `<circle cx="${40 + i * 30}" cy="80" r="5" fill="#0A2036" opacity="${1 - i * .2}"/>`).join("")}<line x1="30" y1="80" x2="170" y2="80" stroke="#2DD4BF" stroke-width="2"/></svg></div><b>Evidence brief</b><span>Five slides: protocol, PRISMA flow, one per outcome, confidence rule.</span><span class="small" style="color:var(--blue-ink);font-weight:600">${ic("download", "ic-sm")} PPTX · PDF</span></button>
        </div>
        <p class="small muted">Every export carries the search strategy, the confidence rule and the reviewer log. Demo: files are prepared but not downloaded here.</p>`;
      $$("#export-body .exp").forEach(b => b.addEventListener("click", () => toast(`Prepared: ${b.dataset.x} · rsv-eu`)));
    }
  };

  /* ---------------- drawer (subjects) ---------------- */
  const drawer = {
    render() {
      $("#drawer-body").innerHTML = `
        <div class="ws"><div class="ws-k">Respiratory · vaccines workspace</div>
          <div class="folders">${DEMO.subjects.map(h => `<button class="folder${h.id === store.subjectId ? " on" : ""}" data-q="${h.id}"><span class="folder-ic">${ic(h.status === "done" ? "radar" : "folder")}</span><span><div class="folder-t">${esc(h.title)}</div><div class="folder-m">${esc(h.meta)}</div></span><span class="folder-s ${h.status}">${h.status === "done" ? "Live" : "Draft"}</span></button>`).join("")}</div></div>
        <div class="ws"><div class="ws-k">Reviewer log · this subject</div>
          ${store.log.length ? `<div class="log">${store.log.slice(0, 8).map(l => `<div><span class="t">${esc(l.t)}</span><span><span class="h">${esc(l.status)}</span> ${esc(studyRef(STUDY[l.sid]))}</span></div>`).join("")}</div>` : `<p class="small muted">No decision yet. Tap any figure to open its scoring card.</p>`}</div>
        <button class="btn btn-sm btn-ghost" style="justify-content:flex-start">${ic("plus")}New subject</button>`;
      $$("#drawer-body .folder").forEach(b => b.addEventListener("click", () => { overlay.closeAll(); drawer.pick(b.dataset.q); }));
      $("#drawer-body .btn").addEventListener("click", () => { overlay.closeAll(); toast("Demo: a new subject starts from the protocol on the left."); });
    },
    pick(id) {
      const h = DEMO.subjects.find(x => x.id === id); if (!h) return;
      if (h.status !== "done") { toast(`"${h.title}" is a draft protocol in this demo. Only the RSV subject is pre-computed.`, 3200); return; }
      store.subjectId = id; if (store.ran) router.show("results"); else toast("Protocol loaded. Tap Run surveillance scan.");
    }
  };

  /* ---------------- overlays + router ---------------- */
  const overlay = {
    open(id) { this.closeAll(true); $("#" + id).classList.add("on"); $("#scrim").classList.add("on"); document.body.dataset.overlay = id; },
    closeAll(keepScrim) { $$(".sheet.on, .drawer.on, .panel.on").forEach(x => x.classList.remove("on")); if (!keepScrim) $("#scrim").classList.remove("on"); thread.clear(); $$(".fig.hl, .dot.hl").forEach(x => x.classList.remove("hl")); delete document.body.dataset.overlay; }
  };
  const router = {
    show(screen) {
      store.screen = screen; $$(".view").forEach(v => v.classList.toggle("on", v.id === "view-" + screen));
      $("#subject-v").textContent = DEMO.question.short;
      $("#rail-sub").textContent = screen === "results" ? "Edit and scan again any time" : screen === "run" ? "Locked during the scan" : "PICO and criteria, locked before any search";
      try { history.replaceState(null, "", screen === "results" ? "#results" : screen === "run" ? "#run" : "#"); } catch (e) { /* file:// */ }
    }
  };

  /* ---------------- guided tour (≈ 20 s, auto-advancing) ---------------- */
  const tour = {
    on: false, token: 0, skip: false, snap: null, last: null,
    sleep(ms) {
      const tk = this.token;
      return new Promise(res => {
        let left = ms, prev = performance.now();
        const tick = t => {
          if (tk !== this.token) return res(false);
          if (this.skip) { this.skip = false; return res(true); }
          left -= t - prev; prev = t;
          if (left <= 0) return res(true);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },
    pause(ms) { return new Promise(r => setTimeout(r, reduced ? 0 : ms)); },
    rect(sel) {
      const els = (Array.isArray(sel) ? sel : [sel]).flatMap(x => typeof x === "string" ? $$(x) : [x]).filter(e => e && e.getBoundingClientRect().width);
      if (!els.length) return null;
      const rs = els.map(e => e.getBoundingClientRect());
      return { l: Math.min(...rs.map(r => r.left)), t: Math.min(...rs.map(r => r.top)), r: Math.max(...rs.map(r => r.right)), b: Math.max(...rs.map(r => r.bottom)) };
    },
    spot(sel, pad) {
      this.last = [sel, pad];
      const s = $("#tour-spot"), vw = innerWidth, vh = innerHeight, r = sel ? this.rect(sel) : null;
      if (!r) { s.classList.add("none"); Object.assign(s.style, { left: vw / 2 + "px", top: vh / 2 + "px", width: "0px", height: "0px" }); this.place(null); return; }
      s.classList.remove("none"); pad = pad == null ? 10 : pad;
      const l = Math.max(6, r.l - pad), t = Math.max(6, r.t - pad), w = Math.min(vw - 6, r.r + pad) - l, h = Math.min(vh - 6, r.b + pad) - t;
      Object.assign(s.style, { left: l + "px", top: t + "px", width: w + "px", height: h + "px" });
      this.place({ t, h });
    },
    place(r) {
      const c = $("#tour-cap"), vh = innerHeight, ch = c.offsetHeight || 140, gap = 14;
      let top;
      if (!r) top = (vh - ch) / 2;
      else if (vh - (r.t + r.h) >= ch + gap + 10) top = r.t + r.h + gap;
      else if (r.t >= ch + gap + 6) top = r.t - ch - gap;
      else top = vh - ch - 20;
      c.style.top = Math.max(10, top) + "px";
    },
    caption(i) {
      const st = this.steps[i], n = this.steps.length;
      $("#tc-bar").innerHTML = this.steps.map((x, j) => `<i class="${j < i ? "done" : j === i ? "cur" : ""}" style="--d:${x.ms || 0}ms"><b></b></i>`).join("");
      $("#tc-n").textContent = `${i + 1} / ${n}`; $("#tc-t").textContent = st.k;
      const p = $("#tc-p"); p.textContent = st.t; p.classList.remove("in"); void p.offsetWidth; p.classList.add("in");
      $("#tc-ctl").innerHTML = st.final
        ? `<button class="tc-b ghost" data-tc="replay">${ic("reset", "ic-sm")}Replay</button><button class="tc-b main" data-tc="end">Explore the demo ${ic("arrow", "ic-sm")}</button>`
        : `<button class="tc-b ghost" data-tc="end">Exit tour</button><button class="tc-b" data-tc="next">Next ${ic("chev", "ic-sm")}</button>`;
      $("#tour").classList.toggle("free", !!st.final);
    },
    async start() {
      this.stop(false);
      this.on = true; this.token++; const tk = this.token;
      this.snap = { d: JSON.parse(JSON.stringify(store.decisions)), l: store.log.slice() };
      store.decisions = {}; store.log = []; store.filter = "all"; store.showExcluded = false;
      document.body.classList.add("touring"); run.stop(); overlay.closeAll();
      $("#run-btn").disabled = false; $("#run-label").textContent = store.ran ? "Scan again" : "Run surveillance scan";
      router.show("idle"); $("#rail-body").scrollTop = 0; $("#view-idle").scrollTop = 0;
      $("#tour").classList.add("on");
      const ensureResults = () => { if (store.screen !== "results") run.finish(false); };
      const center = async el => { if (el) { el.scrollIntoView({ block: "center", behavior: "auto" }); await this.pause(260); } };
      const body = () => $("#method-body");
      const scrollPanel = async el => { const pb = body(); if (!pb || !el) return; pb.scrollTo({ top: Math.max(0, el.offsetTop - 18), behavior: reduced ? "auto" : "smooth" }); await this.pause(520); };
      this.steps = [
        { k: "Protocol", t: "Lock the question as a PICO protocol. Five licensed databases are queried for you.", ms: 2300, go: async () => ".rail",
          mid: async () => { if (await this.sleep(1000)) { const rb = $("#rail-body"), src = $("#srcs"); if (rb && src) rb.scrollTo({ top: src.offsetTop - 140, behavior: reduced ? "auto" : "smooth" }); } } },
        { k: "AI screening", t: "Thousands of records cleaned, deduplicated and scored by AI, live.", ms: 3700, go: async () => { run.start({ speed: 0.16 }); await this.pause(80); return ["#funnel", "#view-run .feed"]; } },
        { k: "AI relevance", t: "Every record ranked by an AI relevance score, with its rationale.", ms: 2200, go: async () => { ensureResults(); await this.pause(420); const head = $("#matrix .mx-head"); const v = $("#view-results"); if (head && v) { v.scrollTop += head.getBoundingClientRect().top - 74; await this.pause(160); } return ["#matrix .mx-head", ...$$("#matrix tbody tr").slice(0, 3)]; } },
        { k: "Source", t: "Every figure is one tap from its verbatim source.", ms: 2400, go: async () => { card.open("e44", $('.fig[data-ex="e44"]')); await this.pause(760); return "#sheet .excerpt"; } },
        { k: "Reviewer decision", t: "The medical reviewer decides. Exclude a record, and the evidence is recomputed.", ms: 2400, go: async () => "#sheet-foot",
          mid: async () => { if (await this.sleep(1000)) card.decide("excluded"); } },
        { k: "Evidence base", t: "One answer per outcome, updated on the spot: mortality now rests on 6 figures.", ms: 2300, go: async () => { overlay.closeAll(); await this.pause(420); await center($("#strip-mortality")); return "#strip-mortality"; } },
        { k: "Traceability", t: "Licensed sources, GenAI orchestration, human validation: PRISMA-compliant end to end.", ms: 2300, go: async () => { panels.tab = "how"; panels.open("method"); await this.pause(380); return "#panel-method .process"; } },
        { k: "Why Datako", t: "Built on four promises: real-time awareness, automated processing, scale, expert validation.", ms: 2500, go: async () => { panels.tab = "why"; panels.method(); body().scrollTop = 0; await this.pause(260); await scrollPanel($(".why-proof")); return ".pillars"; } },
        { k: "Against the alternatives", t: "The only option with a locked protocol, licensed sources and a quote behind every figure.", ms: 2600, go: async () => { await scrollPanel($(".vs")); return ".vs"; } },
        { k: "Next step", t: "From pilot to continuous surveillance in about 12 weeks, with a Go / No-Go at week 3.", final: true, go: async () => { const pb = body(); pb.scrollTo({ top: pb.scrollHeight, behavior: reduced ? "auto" : "smooth" }); await this.pause(560); return null; } }
      ];
      for (let i = 0; i < this.steps.length; i++) {
        if (tk !== this.token) return;
        const st = this.steps[i];
        const target = await st.go();
        if (tk !== this.token) return;
        this.caption(i);
        if (st.final) { $("#tour-spot").classList.add("none"); const c = $("#tour-cap"); c.style.top = (innerHeight - c.offsetHeight - 22) + "px"; return; }
        this.spot(target, st.pad);
        const wait = this.sleep(st.ms);
        if (st.mid) st.mid();
        if (!(await wait)) return;
      }
    },
    stop(closeView) {
      const was = this.on;
      this.token++; this.on = false; this.skip = false;
      document.body.classList.remove("touring"); $("#tour").classList.remove("on", "free");
      if (this.snap) { store.decisions = this.snap.d; store.log = this.snap.l; store.save(); this.snap = null; }
      if (was && closeView) {
        overlay.closeAll(); run.stop();
        if (!store.ran) { store.ran = true; DEMO.sources.forEach(s => rail.source(s.id, "done", s.found)); }
        $("#run-btn").disabled = false; $("#run-label").textContent = "Scan again";
        results.render(); router.show("results"); $("#view-results").scrollTop = 0;
      } else if (was) document.dispatchEvent(new CustomEvent("decision", { detail: {} }));
    }
  };

  /* ---------------- boot ---------------- */
  function boot() {
    const hash = location.hash;
    $("#sync-time").textContent = DEMO.meta.lastSync;
    rail.render(); idle.render(); router.show("idle");
    $("#run-btn").addEventListener("click", () => run.start());
    $("#brand-home").addEventListener("click", () => { run.stop(); overlay.closeAll(); router.show("idle"); $("#run-btn").disabled = false; $("#run-label").textContent = store.ran ? "Scan again" : "Run surveillance scan"; });
    document.addEventListener("click", e => {
      const o = e.target.closest("[data-open]"); if (o) { panels.open(o.dataset.open); return; }
      if (e.target.closest("[data-close]")) overlay.closeAll();
    });
    $("#scrim").addEventListener("click", () => overlay.closeAll());
    document.addEventListener("keydown", e => { if (e.key !== "Escape") return; if (tour.on) tour.stop(true); else overlay.closeAll(); });
    $("#sheet-body").addEventListener("scroll", () => thread.clear(), { passive: true });
    $$(".view").forEach(v => v.addEventListener("scroll", () => { if (document.body.dataset.overlay === "sheet") thread.clear(); }, { passive: true }));
    window.addEventListener("resize", () => thread.clear());
    $("#reset-demo").addEventListener("click", () => { store.reset(); overlay.closeAll(); toast("Demo reset: reviewer decisions cleared."); });
    document.addEventListener("decision", () => { if (store.screen === "results") { results.updateStrips(); results.updateMatrix(); results.renderSub(); } });
    if (hash === "#results") { store.ran = true; DEMO.sources.forEach(s => rail.source(s.id, "done", s.found)); $("#run-label").textContent = "Scan again"; results.render(); router.show("results"); }
    else if (hash === "#run") run.start();
    else if (hash === "#tour") setTimeout(() => tour.start(), 500);
    document.addEventListener("click", e => {
      if (e.target.closest("[data-tour]")) { tour.start(); return; }
      const b = e.target.closest("[data-tc]"); if (!b) return;
      if (b.dataset.tc === "next") tour.skip = true;
      else if (b.dataset.tc === "replay") tour.start();
      else tour.stop(true);
    });
    window.addEventListener("resize", () => { if (tour.on && tour.last) tour.spot(tour.last[0], tour.last[1]); });
    let last = 0; document.addEventListener("touchend", e => { const t = Date.now(); if (t - last < 300 && !e.target.closest("input, textarea")) e.preventDefault(); last = t; }, { passive: false });
    window.SLR = { store, synth, results, card, run, tour, DEMO, SCORE };
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();
})();
