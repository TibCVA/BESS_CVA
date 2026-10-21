/* ==========================================================================
   Datako Evidence — application
   Modules (IIFE in one file): util · store · synth · rail · idle · run · results
   · card (evidence sheet + provenance thread) · panels · drawer · router · boot
   No backend: everything runs on the embedded DEMO dataset, deterministically.
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
  const studyRef = s => `${s.author} ${s.year}`;
  const now = () => { const d = new Date(); return d.toTimeString().slice(0, 5); };

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
    const t = $("#toast"); $("#toast-text").textContent = msg; t.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), ms || 2600);
  }

  /* ---------------- store ---------------- */
  const KEY = "datako-evidence-demo-v1";
  const store = {
    screen: "idle", decisions: {}, log: [], filter: "all", showExcluded: false, questionId: DEMO.question.id, ran: false,
    load() { try { const s = JSON.parse(localStorage.getItem(KEY) || "{}"); this.decisions = s.decisions || {}; this.log = s.log || []; } catch (e) { this.decisions = {}; this.log = []; } },
    save() { try { localStorage.setItem(KEY, JSON.stringify({ decisions: this.decisions, log: this.log })); } catch (e) { /* private mode */ } },
    status(id) { return this.decisions[id] || EXALL[id].status || "accepted"; },
    decide(id, status) {
      this.decisions[id] = status; this.log.unshift({ t: now(), id, status }); this.save();
      document.dispatchEvent(new CustomEvent("decision", { detail: { id, status } }));
    },
    reset() { this.decisions = {}; this.log = []; this.save(); document.dispatchEvent(new CustomEvent("decision", { detail: { id: null, status: null } })); }
  };
  store.load();

  /* ---------------- synth: pure computation ---------------- */
  const synth = {
    items(o, band) { return EX.filter(e => e.o === o && e.band === band && e.plot != null); },
    compute(o, band) {
      const all = this.items(o, band);
      const pooledAll = all.filter(e => e.pooled);
      const active = pooledAll.filter(e => store.status(e.id) !== "rejected");
      const rejected = pooledAll.filter(e => store.status(e.id) === "rejected");
      const flagged = active.filter(e => store.status(e.id) === "flagged");
      const vals = active.map(e => e.plot).sort((a, b) => a - b);
      const n = vals.length;
      const median = n ? (n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2) : null;
      const conc = n ? vals.filter(v => Math.abs(v - median) <= 0.25 * median).length : 0;
      const hasD = active.some(e => STUDY[e.s].grade === "D");
      let confidence = "Low";
      if (n >= 4 && conc / n >= 0.75 && !hasD) confidence = "High";
      else if (n >= 2 && conc / n >= 0.5) confidence = "Moderate";
      const ctx = all.filter(e => !e.pooled);
      return { o, band, all, active, rejected, flagged, ctx, n, min: n ? vals[0] : null, max: n ? vals[n - 1] : null, median, conc, concPct: n ? Math.round(100 * conc / n) : 0, confidence };
    },
    scale(o) { // one common scale per outcome, across bands, so rows stay comparable
      const vals = EX.filter(e => e.o === o && e.plot != null).map(e => e.plot);
      return { min: 0, max: Math.max(...vals) * 1.1 };
    },
    whyConf(r) {
      if (r.n === 0) return "No like-for-like estimate in the pool.";
      if (r.confidence === "High") return `${r.n} pooled estimates, ${r.concPct}% within ±25% of the median, no grade D in the pool.`;
      if (r.confidence === "Moderate") return `${r.n} pooled estimates, ${r.concPct}% within ±25% of the median.`;
      return r.n < 2 ? `Only ${r.n} pooled estimate.` : `${r.n} pooled estimates but only ${r.concPct}% within ±25% of the median${r.active.some(e => STUDY[e.s].grade === "D") ? ", and a grade D study in the pool" : ""}.`;
    }
  };

  /* ---------------- rail (scope inputs) ---------------- */
  const rail = {
    render() {
      const q = DEMO.question, sc = q.scope;
      const chip = (t, on, extra) => `<button class="chip${on ? " on" : ""}${extra ? " " + extra : ""}" type="button">${on ? ic("check") : ""}<span>${esc(t)}</span></button>`;
      const add = t => `<button class="chip add" type="button">${ic("plus")}<span>${esc(t)}</span></button>`;
      $("#rail-body").innerHTML = `
        <div class="q-box">
          <div class="q-label"><span>Question</span><span class="rail-sub">Saved</span></div>
          <textarea class="q-text" id="q-text" rows="3" spellcheck="false">${esc(q.title)}</textarea>
          <div class="q-hint">Evidence turns the question into the scope below. Edit either.</div>
        </div>
        <div class="field"><div class="field-k">Disease</div><div class="chips">${chip(sc.disease, true)}${add("Synonyms")}</div></div>
        <div class="field"><div class="field-k">Population</div><div class="chips">${chip(sc.population, true)}${chip("Community and inpatient", true)}${add("Subgroup")}</div></div>
        <div class="field"><div class="field-k">Geography <span class="rail-sub">pooled</span></div><div class="chips">${sc.geography.map(g => chip(g, true)).join("")}${add("Country")}</div></div>
        <div class="field"><div class="field-k">Benchmarks <span class="rail-sub">shown, never pooled</span></div><div class="chips">${sc.benchmarks.map(g => chip(g, true, "bench")).join("")}</div></div>
        <div class="field"><div class="field-k">Publication years</div><div class="range"><div class="yr">${sc.years[0]}</div><span class="to">to</span><div class="yr">${sc.years[1]}</div></div></div>
        <div class="field"><div class="field-k">Outcomes</div><div class="chips">${sc.outcomes.map(o => chip(OUT[o].label, true)).join("")}${add("Length of stay")}${add("ICU admission")}</div></div>
        <div class="field"><div class="field-k">Sources <span class="rail-sub">${DEMO.sources.length} connected</span></div><div class="srcs" id="srcs">${DEMO.sources.map(s => `
          <div class="src${s.type === "subscription" ? " sub" : ""}" data-src="${s.id}">
            <span class="src-dot">${s.code}</span>
            <span><div class="src-n">${esc(s.name)}</div><div class="src-d">${esc(s.desc)}${s.type === "subscription" ? " · licence" : ""}</div></span>
            <span class="src-s pending" data-state>ready</span>
          </div>`).join("")}</div></div>`;
      $$("#rail-body .chip").forEach(b => b.addEventListener("click", () => {
        if (b.classList.contains("add")) { toast("Demo: scope editing is illustrated, not wired."); return; }
        b.classList.toggle("on");
        if (store.ran) { $("#run-label").textContent = "Re-run scan"; toast("Scope changed. Re-run to refresh the evidence."); }
      }));
      $("#q-text").addEventListener("input", () => { if (store.ran) $("#run-label").textContent = "Re-run scan"; });
    },
    source(id, state, n) {
      const el = $(`#srcs [data-src="${id}"] [data-state]`); if (!el) return;
      if (state === "query") { el.className = "src-s"; el.innerHTML = `<span class="spin"></span>querying`; }
      else if (state === "done") { el.className = "src-s"; el.innerHTML = `${ic("check")}${nf(n)}`; }
      else { el.className = "src-s pending"; el.textContent = "ready"; }
    },
    resetSources() { DEMO.sources.forEach(s => this.source(s.id, "ready")); }
  };

  /* ---------------- views ---------------- */
  function funnelHTML(compact, stageIdx) {
    const st = DEMO.funnel.stages;
    return `<div class="funnel${compact ? " compact link" : ""}" id="${compact ? "funnel-compact" : "funnel"}" ${compact ? 'role="button" tabindex="0" title="Open the methodology and PRISMA flow"' : ""}>
      ${st.map((s, i) => `<div class="fstage${s.final ? " final" : ""}${compact || (stageIdx != null && i < stageIdx) ? " done" : ""}" data-stage="${s.id}">
        <div class="fs-k">${esc(s.label)}</div>
        <div class="fs-v ${compact ? "" : "wait"} num" data-v="${compact ? s.value : 0}">${compact ? nf(s.value) : "—"}</div>
        <div class="fs-s">${esc(s.sub)}</div>
        <div class="fs-bar"><i></i></div>
      </div>`).join("")}
    </div>`;
  }

  const idle = {
    render() {
      const steps = [["Scope", "Declare disease, population, geography, years, outcomes."], ["Search", "Seven sources, one strategy, public and licensed."], ["Screen", "Titles, abstracts, full text. Every exclusion explained."], ["Extract", "Each figure with its verbatim sentence."], ["Synthesise", "Like-for-like only. You accept or reject."]];
      $("#view-idle").innerHTML = `<div class="view-inner">
        <div class="idle-hero">
          <div class="promise">
            <div>
              <div class="eyebrow">Datako Evidence</div>
              <h1>The state of the evidence, <em>every number one tap from its source.</em></h1>
              <p>Ask a quantitative question. Evidence screens the literature like a systematic review, extracts each figure with its sentence, grades it, and shows how far the studies agree. You keep the final say on every number.</p>
            </div>
            <div class="promise-steps" style="grid-template-columns:repeat(5,1fr)">${steps.map((s, i) => `<div class="pstep"><b>${i + 1} · ${s[0]}</b><span>${s[1]}</span></div>`).join("")}</div>
          </div>
          <div class="stack" style="display:grid;gap:16px">
            <div class="card card-pad">
              <div class="card-head"><span class="card-title">Your questions</span><button class="card-link" data-open="history">All</button></div>
              <div class="folders">${DEMO.history.map(h => `<button class="folder${h.id === store.questionId ? " on" : ""}" data-q="${h.id}">
                <span class="folder-ic">${ic("folder")}</span><span><div class="folder-t">${esc(h.title)}</div><div class="folder-m">${esc(h.meta)} · ${esc(h.date)}</div></span>
                <span class="folder-s ${h.status}">${h.status === "done" ? "Ready" : "Draft"}</span></button>`).join("")}</div>
            </div>
            <div class="card card-pad">
              <div class="card-head"><span class="card-title">Or start from a suggestion</span></div>
              <div class="suggest">${DEMO.suggestions.map(s => `<button class="sug">${ic("spark")}<span>${esc(s)}</span></button>`).join("")}</div>
            </div>
          </div>
        </div>
        <div class="card card-pad" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px">
          <div><div class="card-title">What you get in ≈ 25 seconds</div><p class="muted" style="margin-top:8px">A PRISMA-style funnel you can audit, a matrix of studies by outcome, and one synthesis per outcome with its confidence.</p></div>
          <div><div class="card-title">What never happens</div><p class="muted" style="margin-top:8px">No figure without a verbatim quote. No pooling across units or geographies. No silent correction of a source.</p></div>
          <div><div class="card-title">What stays yours</div><p class="muted" style="margin-top:8px">Accept, flag or reject any extraction. The synthesis recomputes on the spot and every decision is logged.</p></div>
        </div>
      </div>`;
      $$("#view-idle .folder").forEach(b => b.addEventListener("click", () => drawer.pick(b.dataset.q)));
      $$("#view-idle .sug").forEach(b => b.addEventListener("click", () => { $("#q-text").value = b.textContent.trim(); toast("Question loaded into the scope. Run when ready."); }));
    }
  };

  /* ---------------- run (animated funnel) ---------------- */
  const run = {
    timers: [], raf: null, running: false,
    render() {
      $("#view-run").innerHTML = `<div class="view-inner">
        <div class="run-head">
          <div><div class="run-title">Scanning the literature <span class="live"><i></i>LIVE</span></div><div class="run-sub">${esc(DEMO.question.title)} · publication ${DEMO.question.scope.years.join("–")}</div></div>
          <div class="muted small num" id="run-clock">0 s</div>
        </div>
        ${funnelHTML(false, 0)}
        <div class="run-grid">
          <div class="card feed">
            <div class="feed-head"><span class="feed-title">Screening feed</span><span class="small muted" id="feed-count">0 records decided</span></div>
            <div class="feed-list" id="feed"></div>
          </div>
          <div class="stack" style="display:grid;gap:16px">
            <div class="card card-pad">
              <div class="card-head"><span class="card-title">Exclusions at full text</span><span class="small muted num" id="tally-total">0</span></div>
              <div class="tally" id="tally">${DEMO.funnel.fullTextExclusions.map((x, i) => `<div class="tally-row" data-i="${i}"><span><div class="k">${esc(x.reason)}</div><div class="bar"><i></i></div></span><span class="n num" data-v="0">0</span></div>`).join("")}</div>
            </div>
            <div class="card card-pad">
              <div class="card-head"><span class="card-title">Criteria applied</span></div>
              <div class="criteria">${DEMO.funnel.criteria.map(c => `<div class="crit">${ic("check")}<span>${esc(c)}</span></div>`).join("")}</div>
            </div>
          </div>
        </div>
        <div class="skip-wrap"><button class="btn btn-primary skip" id="skip">Skip to results ${ic("arrow")}</button></div>
      </div>`;
      $("#skip").addEventListener("click", () => this.finish(true));
    },
    at(sec, fn) { this.timers.push(setTimeout(fn, reduced ? 0 : sec * 1000)); },
    start() {
      this.stop(); this.render(); router.show("run"); this.running = true; rail.resetSources();
      $("#run-btn").disabled = true; $("#run-label").textContent = "Scanning…";
      const T = DEMO.meta.runSeconds, t0 = performance.now();
      const clock = () => { if (!this.running) return; $("#run-clock").textContent = Math.min(T, Math.floor((performance.now() - t0) / 1000)) + " s"; this.raf = requestAnimationFrame(clock); }; clock();
      const stages = DEMO.funnel.stages;
      const setStage = (i) => $$("#funnel .fstage").forEach((el, j) => { el.classList.toggle("active", j === i); el.classList.toggle("done", j < i); });
      const fill = (i, p) => { const b = $(`#funnel .fstage[data-stage="${stages[i].id}"] .fs-bar i`); if (b) b.style.width = Math.round(p * 100) + "%"; };
      const count = (i, v, ms) => { const el = $(`#funnel .fstage[data-stage="${stages[i].id}"] .fs-v`); el.classList.remove("wait"); tween(el, v, ms, nf); };
      // stage 0: sources
      setStage(0);
      DEMO.sources.forEach((s, k) => { this.at(0.2 + k * 0.38, () => rail.source(s.id, "query")); this.at(0.9 + k * 0.38, () => { rail.source(s.id, "done", s.found); fill(0, (k + 1) / DEMO.sources.length); count(0, k + 1, 200); }); });
      // stage 1: identified
      this.at(3.2, () => { setStage(1); count(1, stages[1].value, 1400); fill(1, 1); });
      // stage 2: dedup
      this.at(5.2, () => { setStage(2); count(2, stages[2].value, 1000); fill(2, 1); });
      // stage 3: titles (7–11s)
      this.at(7.0, () => { setStage(3); count(3, stages[3].value, 3600); });
      for (let k = 1; k <= 8; k++) this.at(7.0 + k * 0.5, () => fill(3, k / 8));
      // stage 4: abstracts (11–15.5s)
      this.at(11.0, () => { setStage(4); count(4, stages[4].value, 3800); });
      for (let k = 1; k <= 9; k++) this.at(11.0 + k * 0.5, () => fill(4, k / 9));
      // stage 5: full text (15.5–21.5s) + tally
      this.at(15.5, () => { setStage(5); count(5, stages[5].value, 5000); });
      for (let k = 1; k <= 12; k++) this.at(15.5 + k * 0.5, () => fill(5, k / 12));
      const ex = DEMO.funnel.fullTextExclusions, total = ex.reduce((a, x) => a + x.count, 0);
      ex.forEach((x, i) => { for (let k = 1; k <= 5; k++) this.at(15.8 + i * 0.3 + k * 1.0, () => { const row = $(`#tally [data-i="${i}"]`); const v = Math.round(x.count * k / 5); row.querySelector(".bar i").style.width = Math.round(100 * v / ex[0].count) + "%"; tween(row.querySelector(".n"), v, 300, nf); let tt = 0; $$("#tally .n").forEach(n => tt += Number(n.dataset.v || 0)); $("#tally-total").textContent = nf(Math.min(total, tt)) + " of " + nf(total); }); });
      // feed
      const recs = DEMO.records, step = 20 / recs.length;
      recs.forEach((r, k) => this.at(1.0 + k * step, () => this.push(r, k + 1)));
      this.at(T, () => this.finish(false));
    },
    push(r, k) {
      const feed = $("#feed"); if (!feed) return;
      const tag = r.d === "keep" ? `<span class="tag keep">${ic("check")}Retained · ${esc(r.r)}</span>` : `<span class="tag drop">${ic("x")}${esc(r.r)}</span>`;
      const el = document.createElement("div"); el.className = "rec"; el.innerHTML = `<span><div class="rec-t">${esc(r.t)}</div><div class="rec-m"><b>${esc(r.m)}</b></div></span>${tag}`;
      feed.prepend(el); while (feed.children.length > 9) feed.lastChild.remove();
      $("#feed-count").textContent = `${k} records decided`;
    },
    stop() { this.timers.forEach(clearTimeout); this.timers = []; if (this.raf) cancelAnimationFrame(this.raf); this.running = false; },
    finish(skipped) {
      this.stop(); store.ran = true; DEMO.sources.forEach(s => rail.source(s.id, "done", s.found));
      $("#run-btn").disabled = false; $("#run-label").textContent = "Re-run scan";
      results.render(); router.show("results");
      if (skipped) toast("Skipped ahead. The full funnel is in Methodology.");
    }
  };

  /* ---------------- results ---------------- */
  const results = {
    render() {
      const q = DEMO.question, st = DEMO.funnel.stages;
      const nEx = EX.length, nEu = DEMO.studies.filter(s => !s.excluded && s.region === "Europe").length, nB = DEMO.studies.filter(s => !s.excluded && s.region !== "Europe").length;
      $("#view-results").innerHTML = `<div class="view-inner">
        <div class="res-head">
          <div>
            <div class="res-eyebrow">State of the evidence <span class="ok">${ic("check")}Run completed ${esc(DEMO.meta.runDate)}</span></div>
            <h2 class="res-title">${esc(q.title)}</h2>
            <div class="res-sub"><span><b>${st[5].value}</b> studies retained (${nEu} European, ${nB} benchmarks)</span><span><b>${nEx}</b> extractions, each with its quote</span><span><b>${q.scope.outcomes.length}</b> outcomes</span><span>Sources verified ${esc(DEMO.meta.verified)}</span></div>
          </div>
          <div class="res-actions">
            <button class="btn btn-sm" data-open="method">${ic("layers")}Methodology</button>
            <button class="btn btn-sm" data-open="export">${ic("download")}Export</button>
          </div>
        </div>
        ${funnelHTML(true)}
        <div class="strips" id="strips"></div>
        <div class="card matrix" id="matrix"></div>
      </div>`;
      $("#funnel-compact").addEventListener("click", () => panels.open("method"));
      $("#funnel-compact").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); panels.open("method"); } });
      this.renderStrips(true); this.renderMatrix();
    },

    renderStrips(entrance) {
      const wrap = $("#strips"); wrap.innerHTML = "";
      OUTKEYS.forEach((o, i) => {
        const el = document.createElement("div"); el.className = "card strip" + (OUT[o].bands.length > 1 ? " wide" : ""); el.id = "strip-" + o; el.dataset.o = o;
        if (entrance) el.style.animation = `rise .4s var(--ease) ${0.08 * i}s both`;
        wrap.appendChild(el); this.fillStrip(o, entrance);
      });
    },

    fillStrip(o, entrance) {
      const el = $("#strip-" + o), def = OUT[o], bands = def.bands;
      const head = synth.compute(o, bands[0].id);
      const total = EX.filter(e => e.o === o).length;
      const rej = EX.filter(e => e.o === o && store.status(e.id) === "rejected").length;
      const flg = EX.filter(e => e.o === o && store.status(e.id) === "flagged").length;
      el.innerHTML = `
        <div class="strip-top"><div><div class="strip-k">${esc(def.label)}</div><div class="strip-u">${esc(def.headline)}${bands.length > 1 ? " · headline is the " + esc(bands[0].label) + " band" : ""}</div></div>
          <span class="conf ${head.confidence}" title="${esc(synth.whyConf(head))}"><i></i>${head.confidence} confidence</span></div>
        <div class="strip-mid">
          <div class="strip-v countin">${head.n ? def.fmt(head.median) : "—"}<small>${esc(def.unitShort)}</small></div>
          <div class="strip-r">${head.n ? `median of <b>${head.n}</b> pooled · range <b>${def.fmt(head.min)}</b> – <b>${def.fmt(head.max)}</b> · <b>${head.concPct}%</b> concordant` : "no pooled estimate"}</div>
        </div>
        <div class="forest-wrap">${this.forestSVG(o)}</div>
        <div class="strip-n"><span><b>${total}</b> extractions</span><span><b>${EX.filter(e => e.o === o && e.pooled).length}</b> pooled</span><span><b>${EX.filter(e => e.o === o && !e.pooled).length}</b> context</span>${flg ? `<span class="rej"><b>${flg}</b> flagged</span>` : ""}${rej ? `<span class="rej"><b>${rej}</b> rejected by you</span>` : ""}</div>`;
      $$(".forest .dot", el).forEach((d, k) => {
        d.addEventListener("click", ev => card.open(d.dataset.ex, d));
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
      s += ticks.map(t => `<line class="tick" x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${top + bands.length * rowH}"/><text class="tlab" x="${x(t)}" y="${H - 6}" text-anchor="middle">${esc(def.fmt(t))}</text>`).join("");
      s += `<line class="axis" x1="${L}" x2="${W - R}" y1="${top + bands.length * rowH}" y2="${top + bands.length * rowH}"/>`;
      bands.forEach((b, i) => {
        const r = synth.compute(o, b.id), cy = top + i * rowH + rowH / 2;
        s += `<text x="0" y="${cy + 4}" style="fill:var(--ink);font-size:12px;font-weight:600;font-family:var(--font)">${esc(b.label)}</text>`;
        s += `<text x="0" y="${cy + 18}" style="fill:var(--muted);font-size:10px;font-family:var(--font)">${r.n ? `n ${r.n} · ${esc(def.fmt(r.median))}` : "no pooled"}</text>`;
        if (r.n) {
          s += `<g class="rng" data-band="${b.id}" style="transform:translate(${x(r.min)}px,${cy}px) scale(${Math.max(1, x(r.max) - x(r.min))},1)"><line class="range ${r.confidence}" x1="0" x2="1" y1="0" y2="0" vector-effect="non-scaling-stroke"/></g>`;
          s += `<g class="med" data-band="${b.id}" style="transform:translate(${x(r.median)}px,${cy}px)"><line class="median" x1="0" x2="0" y1="-11" y2="11"/></g>`;
        }
        // dots: context first (behind), then pooled; jitter overlapping x
        const items = r.all.slice().sort((a, b2) => a.plot - b2.plot);
        let lastX = -99, lane = 0;
        items.forEach(e => {
          const cx = x(e.plot); lane = (cx - lastX < 9) ? (lane + 1) % 3 : 0; lastX = cx;
          const dy = [0, -7, 7][lane]; const st = store.status(e.id); const g = STUDY[e.s].grade;
          const cls = `dot g${g}${e.pooled ? "" : " ctx"}${st === "rejected" ? " rejected" : ""}${st === "flagged" ? " flagged" : ""}`;
          const tf = `translate(${cx}px,${cy + dy}px)`;
          s += `<g class="${cls}" data-ex="${e.id}" data-tf="${tf}" style="transform:${tf}" tabindex="0" role="button" aria-label="${esc(studyRef(STUDY[e.s]))}: ${esc(e.display)}">
            <circle class="hit" r="14"/><circle r="${e.pooled ? 6 : 4.5}" ${e.pooled ? "" : 'style="fill:var(--paper);stroke:var(--faint);stroke-width:1.5"'}/>${st === "rejected" ? '<line x1="-6" y1="-6" x2="6" y2="6"/>' : ""}</g>`;
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
          const rng = $(`.rng[data-band="${b.id}"]`, el), med = $(`.med[data-band="${b.id}"]`, el);
          if (rng && r.n) { rng.style.transform = `translate(${x(r.min)}px,${rng.style.transform.match(/,(.*?)px\)/)[1]}px) scale(${Math.max(1, x(r.max) - x(r.min))},1)`; rng.firstElementChild.setAttribute("class", "range " + r.confidence); }
          if (med && r.n) med.style.transform = `translate(${x(r.median)}px,${med.style.transform.match(/,(.*?)px\)/)[1]}px)`;
        });
        $$(".dot", el).forEach(d => { const st = store.status(d.dataset.ex); d.classList.toggle("rejected", st === "rejected"); d.classList.toggle("flagged", st === "flagged"); const line = d.querySelector("line"); if (st === "rejected" && !line) d.insertAdjacentHTML("beforeend", '<line x1="-6" y1="-6" x2="6" y2="6"/>'); if (st !== "rejected" && line) line.remove(); });
        const head = synth.compute(o, def.bands[0].id);
        const v = $(".strip-v", el); v.classList.remove("countin"); void v.offsetWidth; v.classList.add("countin"); v.innerHTML = `${head.n ? def.fmt(head.median) : "—"}<small>${esc(def.unitShort)}</small>`;
        $(".strip-r", el).innerHTML = head.n ? `median of <b>${head.n}</b> pooled · range <b>${def.fmt(head.min)}</b> – <b>${def.fmt(head.max)}</b> · <b>${head.concPct}%</b> concordant` : "no pooled estimate";
        const c = $(".conf", el); c.className = "conf " + head.confidence; c.title = synth.whyConf(head); c.innerHTML = `<i></i>${head.confidence} confidence`;
        $$(".forest text", el); // band labels: re-render small n labels
        def.bands.forEach((b, i) => { const r = synth.compute(o, b.id); const labs = $$(".forest > text", el).filter(t => t.getAttribute("x") === "0"); const lab = labs[i * 2 + 1]; if (lab) lab.textContent = r.n ? `n ${r.n} · ${def.fmt(r.median)}` : "no pooled"; });
        const total = EX.filter(e => e.o === o).length, rej = EX.filter(e => e.o === o && store.status(e.id) === "rejected").length, flg = EX.filter(e => e.o === o && store.status(e.id) === "flagged").length;
        $(".strip-n", el).innerHTML = `<span><b>${total}</b> extractions</span><span><b>${EX.filter(e => e.o === o && e.pooled).length}</b> pooled</span><span><b>${EX.filter(e => e.o === o && !e.pooled).length}</b> context</span>${flg ? `<span class="rej"><b>${flg}</b> flagged</span>` : ""}${rej ? `<span class="rej"><b>${rej}</b> rejected by you</span>` : ""}`;
      });
    },

    renderMatrix() {
      const m = $("#matrix"); if (!m) return;
      const f = store.filter;
      let rows = DEMO.studies.filter(s => !s.excluded);
      if (f === "europe") rows = rows.filter(s => s.region === "Europe");
      if (f === "bench") rows = rows.filter(s => s.region !== "Europe");
      if (OUTKEYS.includes(f)) rows = rows.filter(s => EX.some(e => e.s === s.id && e.o === f));
      const cols = OUTKEYS.includes(f) ? [f] : OUTKEYS;
      const seg = [["all", "All retained"], ["europe", "Europe"], ["bench", "Benchmarks"], ...OUTKEYS.map(o => [o, OUT[o].label])];
      const cell = (s, o) => { const ex = EX.filter(e => e.s === s.id && e.o === o); if (!ex.length) return `<span class="none">—</span>`; return ex.map(e => { const st = store.status(e.id); return `<button class="fig${e.pooled ? "" : " ctx"}${st === "rejected" ? " rejected" : ""}${st === "flagged" ? " flagged" : ""}" data-ex="${e.id}" title="${esc(e.unit)}">${esc(e.display)}</button>`; }).join("<br>"); };
      m.innerHTML = `
        <div class="mx-head"><span class="mx-title">Evidence matrix · ${rows.length} studies</span>
          <div class="seg">${seg.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${f === k}">${esc(l)}</button>`).join("")}</div>
          <label class="small muted" style="display:inline-flex;align-items:center;gap:8px;min-height:36px"><input type="checkbox" id="show-excl" ${store.showExcluded ? "checked" : ""}> Show full-text exclusions</label></div>
        <div class="mx-scroll"><table class="mx">
          <thead><tr><th>Study</th><th>Design</th><th>Country</th><th>Age</th><th>N / period</th><th>Grade</th>${cols.map(o => `<th class="oc">${esc(OUT[o].label)}<br><span style="font-weight:400;text-transform:none;letter-spacing:0">${esc(OUT[o].unitShort)}</span></th>`).join("")}</tr></thead>
          <tbody>
            ${rows.map(s => `<tr data-s="${s.id}">
              <td class="st"><div class="st-a">${esc(s.author)} <span class="yr">${s.year}</span>${s.journal.includes("preprint") ? ' <span class="tag drop" style="height:20px;font-size:10px">preprint</span>' : ""}${s.region !== "Europe" ? ` <span class="tag read" style="height:20px;font-size:10px">${esc(s.region)} benchmark</span>` : ""}</div><div class="st-j" title="${esc(s.title)}">${esc(s.journal)} · ${esc(s.title)}</div></td>
              <td class="c">${esc(s.design)}</td><td class="c">${esc(s.country)}</td><td class="c">${esc(s.age)}</td><td class="c">${esc(s.n)}</td>
              <td><span class="grade ${s.grade}" title="${esc(s.gradeWhy)}">${s.grade}</span></td>
              ${cols.map(o => `<td class="val">${cell(s, o)}</td>`).join("")}
            </tr>`).join("")}
            ${store.showExcluded ? DEMO.studies.filter(s => s.excluded).map(s => `<tr class="excl"><td class="st"><div class="st-a">${esc(s.author)} <span class="yr">${s.year}</span></div><div class="st-j">${esc(s.journal)} · ${esc(s.title)}</div></td><td class="c">${esc(s.design)}</td><td class="c">${esc(s.country)}</td><td class="c">${esc(s.age)}</td><td class="c">${esc(s.n)}</td><td><span class="tag drop">${ic("x")}${esc(s.excluded)}</span></td><td colspan="${cols.length}" class="small">${esc(s.exclWhy)}</td></tr>`).join("") : ""}
          </tbody></table></div>
        <div class="legend"><span><i class="sw"></i>figure, tap for its source</span><span><i class="sw d"></i>context, not pooled</span><span><i class="sw s"></i>flagged or rejected by you</span><span><span class="gdots"><i></i><i style="opacity:.78"></i><i style="opacity:.55"></i><i style="opacity:.35"></i></span>grade A → D</span></div>`;
      $$(".seg button", m).forEach(b => b.addEventListener("click", () => { store.filter = b.dataset.f; this.renderMatrix(); }));
      $("#show-excl").addEventListener("change", e => { store.showExcluded = e.target.checked; this.renderMatrix(); });
      $$(".fig", m).forEach(b => b.addEventListener("click", () => card.open(b.dataset.ex, b)));
    },

    updateMatrix() {
      $$("#matrix .fig").forEach(b => { const st = store.status(b.dataset.ex); b.classList.toggle("rejected", st === "rejected"); b.classList.toggle("flagged", st === "flagged"); });
    }
  };

  function niceTicks(min, max, n) {
    const span = max - min, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag; const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(Number(v.toFixed(6)));
    return out;
  }

  /* ---------------- evidence card + provenance thread ---------------- */
  const card = {
    id: null, from: null,
    open(id, fromEl) {
      const e = EXALL[id], s = STUDY[e.s]; this.id = id; this.from = fromEl;
      $$(".fig.hl, .dot.hl").forEach(x => x.classList.remove("hl")); if (fromEl) fromEl.classList.add("hl");
      this.renderBody();
      overlay.open("sheet");
      setTimeout(() => {
        // bring the tapped figure into the part of the stage that the card leaves visible, then draw the thread
        if (fromEl) fromEl.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
        const sc = fromEl && fromEl.closest(".mx-scroll"); if (sc) { const r = fromEl.getBoundingClientRect(), sr = sc.getBoundingClientRect(); sc.scrollLeft += r.left - sr.left - 48; }
        setTimeout(() => thread.draw(fromEl, $("#sheet mark")), reduced ? 0 : 200);
      }, reduced ? 0 : 400);
    },
    renderBody() {
      const e = EXALL[this.id], s = STUDY[e.s], st = store.status(this.id), def = OUT[e.o];
      const ciTxt = e.ci ? `95% CI <b>${esc(fmtCI(e, e.ci[0]))} – ${esc(fmtCI(e, e.ci[1]))}</b>` : `no interval reported`;
      const exc = esc(e.excerpt); const mk = e.mark ? esc(e.mark) : null;
      const quote = mk && exc.includes(mk) ? exc.replace(mk, `<mark>${mk}</mark>`) : exc;
      const statusTxt = { accepted: ["check", "Accepted · in the synthesis"], flagged: ["flag", "Flagged · needs a check, " + (e.pooled ? "kept in the pool" : "not pooled")], rejected: ["x", "Rejected by you · out of the synthesis"] }[st];
      const logs = store.log.filter(l => l.id === this.id).slice(0, 4);
      $("#sheet-body").innerHTML = `
        <span class="ev-status ${st}">${ic(statusTxt[0])}${esc(statusTxt[1])}</span>
        <div><div class="ev-value"><span class="ev-v">${esc(e.display)}</span><span class="ev-u">${esc(e.unit)}</span></div><div class="ev-ci" style="margin-top:6px">${ciTxt}</div></div>
        <div class="excerpt"><div class="excerpt-k">Verbatim source excerpt <span>${esc(e.where)} · ${esc(s.journal)} ${s.year}</span></div><q>${quote}</q></div>
        <div class="ev-title">${esc(s.title)}</div>
        <div class="ev-meta">
          <div><b>Study</b><span>${esc(studyRef(s))} · ${esc(s.journal)}</span></div>
          <div><b>Design</b><span>${esc(s.design)}</span></div>
          <div><b>Country</b><span>${esc(s.country)}${s.region !== "Europe" ? " · " + esc(s.region) + " benchmark" : ""}</span></div>
          <div><b>Age band</b><span>${esc(s.age)}</span></div>
          <div><b>Sample / period</b><span>${esc(s.n)}</span></div>
          <div><b>Setting</b><span>${esc(s.setting)}</span></div>
          <div style="grid-column:1/-1"><b>Source</b><span><a href="${esc(s.url)}" target="_blank" rel="noopener">${ic("link", "ic-sm")} doi:${esc(s.doi)}</a></span></div>
        </div>
        <div class="gradebox"><span class="grade ${s.grade}">${s.grade}</span><div><b>Quality grade ${s.grade}</b><span>${esc(s.gradeWhy)}</span></div></div>
        <div class="rationale">${ic("spark")}<div><b>How Evidence read it.</b> ${esc(e.how)}</div></div>
        <div class="pooled">${ic(e.pooled ? "layers" : "info")}<span><b>${e.pooled ? "Pooled in " + esc(def.label) : "Not pooled"}.</b> ${esc(e.why)}</span></div>
        ${logs.length ? `<div class="log">${logs.map(l => `<div><span class="t">${esc(l.t)}</span><span><span class="h">${esc(l.status)}</span> by you</span></div>`).join("")}</div>` : `<div class="log"><div><span class="t">${esc(DEMO.meta.runDate.replace("Today, ", ""))}</span><span>Extracted by Evidence · awaiting your review</span></div></div>`}`;
      $("#sheet-foot").innerHTML = `
        <button class="btn btn-teal" data-d="accepted" ${st === "accepted" ? 'aria-pressed="true" style="box-shadow:inset 0 0 0 2px var(--teal)"' : ""}>${ic("check")}Accept</button>
        <button class="btn btn-human" data-d="flagged" ${st === "flagged" ? 'aria-pressed="true" style="box-shadow:inset 0 0 0 2px var(--sand)"' : ""}>${ic("flag")}Flag</button>
        <button class="btn btn-human" data-d="rejected" ${st === "rejected" ? 'aria-pressed="true" style="box-shadow:inset 0 0 0 2px var(--sand)"' : ""}>${ic("x")}Reject</button>`;
      $$("#sheet-foot .btn").forEach(b => b.addEventListener("click", () => this.decide(b.dataset.d)));
    },
    decide(status) {
      const e = EXALL[this.id]; const prev = store.status(this.id); if (prev === status) return;
      store.decide(this.id, status); this.renderBody();
      const strip = $("#strip-" + e.o); if (strip && e.pooled) { strip.classList.add("hit"); setTimeout(() => strip.classList.remove("hit"), 900); }
      toast(status === "rejected" ? `${studyRef(STUDY[e.s])} removed from the ${OUT[e.o].label.toLowerCase()} synthesis. Recomputed.` : status === "flagged" ? `${studyRef(STUDY[e.s])} flagged for a full-text check.` : `${studyRef(STUDY[e.s])} accepted. Recomputed.`);
    }
  };
  function fmtCI(e, v) { const d = OUT[e.o]; if (e.o === "hospitalisation" && e.display.includes("/1,000")) return v.toFixed(2) + " /1,000"; if (e.o === "hospitalisation" && e.display.includes("attack")) return v + "%"; if (e.o === "cost" && e.display.startsWith("$")) return "$" + nf(v); if (e.o === "cost" && v < 1000 && e.display.includes("bn")) return "$" + v + " bn"; if (e.o === "mortality" && v > 100) return nf(v); if (e.o === "incidence" && v > 100) return nf(v); return d.fmt(v); }

  const thread = {
    draw(fromEl, toEl) {
      const svg = $("#thread"), p = $("#thread-path"), dot = $("#thread-dot");
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
    open(name) {
      if (name === "method") this.method(); if (name === "why") this.why(); if (name === "export") this.export();
      if (name === "history") { drawer.render(); overlay.open("drawer"); return; }
      overlay.open("panel-" + name);
    },
    method() {
      const st = DEMO.funnel.stages, ex = DEMO.funnel.fullTextExclusions;
      const steps = [
        ["Scope", "You declare disease, population, geography, years and outcomes before any search. Benchmarks are kept apart from the pooled geography.", "No hidden scope", null],
        ["Search", "Seven sources, public and licensed, queried with one written strategy that leaves with the results.", "Reproducible query", null],
        ["Screen", "Titles, then abstracts, then full text. Each exclusion carries a reason and the PRISMA counts are live.", "Every exclusion explained", "You can reinstate any record"],
        ["Extract", "Each figure is copied verbatim with its sentence, unit, interval and location. Units are never silently converted.", "No figure without a quote", "Accept, flag or reject"],
        ["Synthesise", "Only like-for-like figures are pooled: median, range, concordance, confidence. Recomputed on every decision you make.", "Nothing pooled across units", "Your decisions drive the numbers"]
      ];
      $("#method-body").innerHTML = `
        <div class="steps">${steps.map((s, i) => `<div class="mstep"><div class="n">${i + 1}</div><div class="t">${s[0]}</div><div class="d">${s[1]}</div><div class="g">${ic("shield")}${s[2]}</div>${s[3] ? `<div class="h">${ic("hand")}${s[3]}</div>` : ""}</div>`).join("")}</div>
        <div class="two">
          <div class="card card-pad"><div class="card-head"><span class="card-title">PRISMA flow for this question</span><span class="small muted">live counts</span></div>${this.prisma(st, ex)}</div>
          <div class="guar">
            ${[["quote", "Verbatim excerpts", "The sentence that carries the number is stored with it and shown first on every card."],
               ["scale", "Unit discipline", "Per 1,000 is converted to per 100,000 in the open; counts, rates and percentages never share a pool."],
               ["layers", "Grade with a reason", "A to D with one sentence explaining why, visible on every row and card."],
               ["eye", "Benchmarks never pooled", "Global and US figures stay hollow on the plot: visible for context, outside the synthesis."],
               ["hand", "You decide, it recomputes", "Accept, flag or reject any extraction. Median, range and confidence update immediately and the decision is logged.", true],
               ["lock", "Licensed sources, zero retention", "Embase and congress abstracts under your licence; EU hosting; nothing is used to train a model."]]
              .map(g => `<div class="gu"><span class="ic-box${g[3] ? " h" : ""}">${ic(g[0])}</span><div><b>${g[1]}</b><span>${g[2]}</span></div></div>`).join("")}
            <div class="card card-pad"><div class="card-title">Confidence rule</div>
              <p class="small muted" style="margin-top:8px"><b>High</b>: at least 4 pooled estimates, 75% within ±25% of the median, no grade D. <b>Moderate</b>: at least 2 pooled estimates, half concordant. <b>Low</b>: anything else. The rule is fixed and printed with every export.</p></div>
          </div>
        </div>`;
    },
    prisma(st, ex) {
      const box = (x, y, w, h, k, v, cls) => `<rect class="${cls || ""}" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/><text class="k" x="${x + 12}" y="${y + 18}">${k}</text><text class="v" x="${x + 12}" y="${y + 40}">${v}</text>`;
      const arrow = (x, y1, y2) => `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/><path class="arr" d="M${x - 4},${y2 - 6} L${x + 4},${y2 - 6} L${x},${y2} Z"/>`;
      const side = (y, k, v) => `<rect class="excl" x="250" y="${y}" width="210" height="44" rx="6"/><text class="e" x="262" y="${y + 18}">${k}</text><text class="v" x="262" y="${y + 36}" style="font-size:14px">${v}</text><line x1="220" y1="${y + 22}" x2="250" y2="${y + 22}"/>`;
      const H = 470;
      return `<svg class="prisma" viewBox="0 0 470 ${H}">
        ${box(10, 10, 210, 52, "Identified across 7 sources", nf(st[1].value), "keep")}${arrow(115, 62, 82)}
        ${box(10, 82, 210, 52, "After deduplication", nf(st[2].value), "keep")}${side(86, "Duplicates removed", nf(st[1].value - st[2].value))}${arrow(115, 134, 154)}
        ${box(10, 154, 210, 52, "Titles screened, kept", nf(st[3].value), "keep")}${side(158, "Excluded on title", nf(st[2].value - st[3].value))}${arrow(115, 206, 226)}
        ${box(10, 226, 210, 52, "Abstracts screened, kept", nf(st[4].value), "keep")}${side(230, "Excluded on abstract", nf(st[3].value - st[4].value))}${arrow(115, 278, 298)}
        ${box(10, 298, 210, 52, "Full text assessed", nf(st[4].value), "keep")}${arrow(115, 350, 370)}
        ${box(10, 370, 210, 52, "Retained in the matrix", nf(st[5].value), "final")}
        <rect class="excl" x="250" y="298" width="210" height="${ex.length * 20 + 36}" rx="6"/><text class="e" x="262" y="316">Excluded at full text · ${nf(ex.reduce((a, x) => a + x.count, 0))}</text>
        ${ex.map((x, i) => `<text x="262" y="${338 + i * 20}" style="font-size:11px">${esc(x.reason.length > 34 ? x.reason.slice(0, 33) + "…" : x.reason)}</text><text class="v" x="448" y="${338 + i * 20}" text-anchor="end" style="font-size:12px">${x.count}</text>`).join("")}
        <line x1="220" y1="324" x2="250" y2="324"/>
      </svg>`;
    },
    why() {
      const Y = `<span class="y">${ic("check")}</span>`, P = `<span class="p">${ic("flag")}</span>`, N = `<span class="n">${ic("x")}</span>`;
      const rows = [
        ["Scope declared before the search", "disease, population, geography, years, outcomes", Y, N, P, Y, Y],
        ["Licensed sources alongside public ones", "Embase, congress abstracts, registries", Y, N, N, Y, Y],
        ["PRISMA funnel with a reason per exclusion", "auditable, exportable", Y, N, N, N, Y],
        ["Verbatim quote attached to every figure", "the sentence, the unit, the interval", P, N, P, N, Y],
        ["Like-for-like pooling only", "no mixing of counts, rates and benchmarks", Y, N, N, N, Y],
        ["Confidence and concordance per outcome", "a fixed, printed rule", P, N, P, N, Y],
        ["Human accept / reject that recomputes", "every decision logged", Y, N, N, N, Y],
        ["Time to a defensible first answer", "", "<b>Weeks</b>", "<b>Minutes</b>", "<b>Minutes</b>", "<b>Hours</b>", "<b>Minutes</b>"],
        ["Export: PRISMA, table, brief", "with sources and decisions", Y, N, P, N, Y]
      ];
      $("#why-body").innerHTML = `
        <table class="cmp"><thead><tr><th>What a defensible number needs</th><th>Manual SLR</th><th>General AI chat</th><th>AI search tools</th><th>Database alone</th><th class="us">Datako Evidence</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${r[0]}${r[1] ? `<small>${r[1]}</small>` : ""}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td><td class="us">${r[6]}</td></tr>`).join("")}</tbody></table>
        <div class="cmp-note"><span>${Y} provided</span><span>${P} partly, or depends on the user</span><span>${N} not provided</span><span class="muted">General AI chat: assistants with web browsing. AI search tools: literature search assistants. Database alone: Embase, PubMed, Scopus used directly.</span></div>
        <div class="card card-pad" style="background:var(--navy);color:#fff;border-color:transparent"><div class="eyebrow" style="color:var(--blue)">In one sentence</div><p style="font-family:var(--serif);font-size:19px;line-height:1.4;margin-top:8px;max-width:60ch">Evidence does the systematic part of a systematic review in minutes, and leaves the judgement, visibly, to the analyst.</p></div>`;
    },
    export() {
      const st = DEMO.funnel.stages;
      const n = Object.keys(store.decisions).length;
      $("#export-body").innerHTML = `
        <div class="exports">
          <button class="exp" data-x="PRISMA flow diagram (SVG, PNG)"><div class="pv">${this.prisma(st, DEMO.funnel.fullTextExclusions).replace('class="prisma"', 'class="prisma" preserveAspectRatio="xMidYMid meet"')}</div><b>PRISMA flow diagram</b><span>Counts and exclusion reasons, as shown in Methodology.</span><span class="small" style="color:var(--blue-ink);font-weight:600">${ic("download", "ic-sm")} SVG · PNG</span></button>
          <button class="exp" data-x="Evidence table (XLSX)"><div class="pv"><svg viewBox="0 0 200 120"><g fill="none" stroke="#CDD7E2">${[0, 1, 2, 3, 4, 5].map(i => `<line x1="10" x2="190" y1="${20 + i * 17}" y2="${20 + i * 17}"/>`).join("")}${[0, 1, 2, 3].map(i => `<line y1="20" y2="105" x1="${10 + i * 45}" x2="${10 + i * 45}"/>`).join("")}</g><rect x="10" y="20" width="180" height="17" fill="#EAF4FB"/>${[1, 2, 3, 4].map(i => `<rect x="${150}" y="${24 + i * 17}" width="30" height="8" rx="2" fill="#2DD4BF" opacity=".6"/>`).join("")}</svg></div><b>Evidence table</b><span>${EX.length} extractions with quote, DOI, grade, pooling status and your ${n} decision${n === 1 ? "" : "s"}.</span><span class="small" style="color:var(--blue-ink);font-weight:600">${ic("download", "ic-sm")} XLSX · CSV</span></button>
          <button class="exp" data-x="Evidence brief (PPTX, 5 slides)"><div class="pv"><svg viewBox="0 0 200 120"><rect x="20" y="14" width="160" height="92" rx="4" fill="#fff" stroke="#CDD7E2"/><rect x="30" y="24" width="80" height="8" rx="2" fill="#0A2036"/><rect x="30" y="40" width="140" height="4" rx="2" fill="#CDD7E2"/><rect x="30" y="50" width="120" height="4" rx="2" fill="#CDD7E2"/>${[0, 1, 2, 3].map(i => `<circle cx="${40 + i * 30}" cy="80" r="5" fill="#0A2036" opacity="${1 - i * .2}"/>`).join("")}<line x1="30" y1="80" x2="170" y2="80" stroke="#2DD4BF" stroke-width="2"/></svg></div><b>Evidence brief</b><span>Five slides: scope, funnel, one slide per outcome with sources, confidence rule.</span><span class="small" style="color:var(--blue-ink);font-weight:600">${ic("download", "ic-sm")} PPTX · PDF</span></button>
        </div>
        <p class="small muted">Every export carries the search strategy, the confidence rule and the decision log. Demo: files are prepared but not downloaded here.</p>`;
      $$("#export-body .exp").forEach(b => b.addEventListener("click", () => toast(`Prepared: ${b.dataset.x} · evidence-rsv-eu`)));
    }
  };

  /* ---------------- drawer (questions) ---------------- */
  const drawer = {
    render() {
      $("#drawer-body").innerHTML = `
        <div class="ws"><div class="ws-k">Respiratory · Vaccines workspace</div>
          <div class="folders">${DEMO.history.map(h => `<button class="folder${h.id === store.questionId ? " on" : ""}" data-q="${h.id}"><span class="folder-ic">${ic("folder")}</span><span><div class="folder-t">${esc(h.title)}</div><div class="folder-m">${esc(h.meta)} · ${esc(h.date)}</div></span><span class="folder-s ${h.status}">${h.status === "done" ? "Ready" : "Draft"}</span></button>`).join("")}</div></div>
        <div class="ws"><div class="ws-k">Decision log · this question</div>
          ${store.log.length ? `<div class="log">${store.log.slice(0, 8).map(l => `<div><span class="t">${esc(l.t)}</span><span><span class="h">${esc(l.status)}</span> ${esc(studyRef(STUDY[EXALL[l.id].s]))} · ${esc(EXALL[l.id].display)}</span></div>`).join("")}</div>` : `<p class="small muted">No decision yet. Tap any figure to review it.</p>`}</div>
        <button class="btn btn-sm btn-ghost" style="justify-content:flex-start">${ic("plus")}New question</button>`;
      $$("#drawer-body .folder").forEach(b => b.addEventListener("click", () => { overlay.closeAll(); drawer.pick(b.dataset.q); }));
      $("#drawer-body .btn").addEventListener("click", () => { overlay.closeAll(); toast("Demo: new questions start from the scope on the left."); });
    },
    pick(id) {
      const h = DEMO.history.find(x => x.id === id); if (!h) return;
      if (h.status !== "done") { toast(`"${h.title}" is a draft scope in this demo. Only the RSV question is pre-computed.`, 3200); return; }
      store.questionId = id; if (store.ran) router.show("results"); else toast("Scope loaded. Tap Run evidence scan.");
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
      const q = DEMO.question;
      $("#crumbs").innerHTML = `<span class="crumb">${esc(q.short)}</span>${ic("chev")}<span>${{ idle: "Scope", run: "Scanning", results: "State of the evidence" }[screen]}</span>`;
      $("#rail-sub").textContent = screen === "results" ? "Edit and re-run any time" : screen === "run" ? "Locked during the scan" : "Declared before any search";
      try { history.replaceState(null, "", screen === "results" ? "#results" : screen === "run" ? "#run" : "#"); } catch (e) { /* file:// */ }
    }
  };

  /* ---------------- boot ---------------- */
  function boot() {
    const hash = location.hash;
    rail.render(); idle.render(); router.show("idle");
    $("#run-btn").addEventListener("click", () => run.start());
    $("#brand-home").addEventListener("click", () => { run.stop(); overlay.closeAll(); router.show("idle"); $("#run-btn").disabled = false; $("#run-label").textContent = store.ran ? "Re-run scan" : "Run evidence scan"; });
    document.addEventListener("click", e => {
      const o = e.target.closest("[data-open]"); if (o) { panels.open(o.dataset.open); return; }
      if (e.target.closest("[data-close]")) overlay.closeAll();
    });
    $("#scrim").addEventListener("click", () => overlay.closeAll());
    document.addEventListener("keydown", e => { if (e.key === "Escape") overlay.closeAll(); });
    $("#sheet-body").addEventListener("scroll", () => thread.clear(), { passive: true });
    $$(".view").forEach(v => v.addEventListener("scroll", () => { if (document.body.dataset.overlay === "sheet") thread.clear(); }, { passive: true }));
    window.addEventListener("resize", () => thread.clear());
    $("#reset-demo").addEventListener("click", () => { store.reset(); overlay.closeAll(); toast("Demo reset: all decisions cleared."); });
    document.addEventListener("decision", () => { if (store.screen === "results") { results.updateStrips(); results.updateMatrix(); } });
    // deep links for the presenter: #results jumps straight to the finished scan
    if (hash === "#results") { store.ran = true; DEMO.sources.forEach(s => rail.source(s.id, "done", s.found)); $("#run-label").textContent = "Re-run scan"; results.render(); router.show("results"); }
    else if (hash === "#run") run.start();
    // double-tap zoom guard (iOS)
    let last = 0; document.addEventListener("touchend", e => { const t = Date.now(); if (t - last < 300 && !e.target.closest("input, textarea")) e.preventDefault(); last = t; }, { passive: false });
    window.Evidence = { store, synth, results, card, run, DEMO };
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();
})();
