# Datako SLR mock-up: guide for Claude

This folder is a high-fidelity, **backend-free** mock-up of "Datako SLR · Evidence surveillance",
an AI-assisted literature review tool for pharma analysts. It is demoed on iPad and laptop as a
**single self-contained HTML file** (`index.html`) that anyone can open without a server.
The person asking you for changes is usually not a developer: explain briefly in plain language,
make the change, rebuild, and check it.

## Golden rules

1. **Never edit `index.html` by hand.** It is generated. Edit files in `src/`, then run
   `node build.js` to regenerate `index.html`.
2. **Keep it one self-contained file.** No CDN, no external fonts, no network calls. Images and
   fonts are embedded as base64 by `build.js`.
3. **Never invent scientific data.** Every study, figure and excerpt in `src/demo-data.js` was
   verified verbatim on Europe PMC (author copies in `data/`). If a new figure is needed, verify
   it against the published abstract and quote it exactly, or ask the user.
4. **Keep it simple on screen.** The demo must be understood in 10 seconds. Prefer removing
   clutter over adding widgets.
5. After each change: `node build.js`, then open `index.html` in a browser (or run the tests
   below) and confirm nothing broke.

## Files

| File | What it holds |
|---|---|
| `src/index.template.html` | HTML shell: top bar, protocol rail, the three views, overlays (scoring card, panels, guided tour), SVG icon sprite |
| `src/styles.css` | All styles. Tokens at the top in `:root`. Sections are appended by iteration (v2, v3) at the end |
| `src/app.js` | All behaviour, one IIFE. Modules in order: util, store, synth, rail, idle, run, results, card, thread, panels, drawer, overlay/router, tour, boot |
| `src/demo-data.js` | The `DEMO` object: question, outcomes, sources, funnel, screening feed, studies, extractions, subjects |
| `src/fonts.css` | Inter and Gelasio as base64 `@font-face` (large, do not open unless needed) |
| `assets/` | Datako wordmark (`logo-datako.png`) and app icon (`icon-180.png`), inlined at build |
| `build.js` | Replaces the `/*__FONTS__*/`, `/*__STYLES__*/`, `/*__DATA__*/`, `/*__APP__*/`, `__LOGO_B64__`, `__MARK_B64__` placeholders in the template |
| `data/research-*.json` | Verification records: DOI, URL read, verbatim excerpt for each figure |
| `tools/shoot.js`, `tools/tour.js` | Playwright smoke tests with iPad viewports (screenshots in `./shots`) |
| `server.js`, `railway.json` | Optional tiny static server if the page is ever hosted |

## How the app works (where to look)

- **Screens** (`router.show`): `idle` (home), `run` (animated scan), `results` (evidence base).
  Panels: `method` (tabs "Process" and "Why Datako"), `export`, drawer `subjects`.
- **Scan animation**: `run.start({ speed })`, timings in seconds via `run.at()`.
- **Evidence base**: `results.render()` draws the compact funnel, one strip per outcome
  (`results.fillStrip`, forest plot in `results.forestSVG`) and the records table (`results.renderMatrix`).
- **Synthesis rule**: `synth.compute(outcome, band)`. Only extractions with `pooled: true` and a
  numeric `plot` enter the median. Confidence: High needs ≥ 4 figures, ≥ 75 % within ±25 % of the
  median and no grade D; Moderate ≥ 2 figures, ≥ 50 % concordant; Low otherwise.
- **Reviewer decisions** are per record (study): `store.decide(studyId, "included" | "flagged" | "excluded")`,
  saved in `localStorage` under `datako-slr-demo-v2`. Excluding a record removes its figures from
  every synthesis and triggers a `decision` event that redraws strips and table.
- **AI relevance score** is illustrative and deterministic: function `score()` at the top of `app.js`.
- **Scoring card**: `card.open(extractionId, element)`; the teal "provenance thread" is `thread.draw`.
- **Guided tour**: `tour.start()`; steps are the `this.steps` array inside `tour.start`
  (`k` label, `t` caption, `ms` duration, `go` async setup returning the element(s) to spotlight,
  optional `mid`, `final`). The tour snapshots and restores reviewer decisions.
- **Deep links**: `#results` opens the evidence base directly, `#tour` starts the tour, `#run` starts a scan.

## Visual language

- Datako palette: navy `#0A2036`, blue `#1E5FC4`, sky `#7EC1EB`. Fonts: Inter (UI), Gelasio (serif numbers and headlines).
- **Teal** (`--teal`, `--teal-vif`) is reserved for provenance (sources, quotes, the thread).
- **Sand/amber** (`--sand`, `--sand-ink`) is reserved for human actions (flag, exclude).
- Touch targets ≥ 44 px, iPad landscape first (1024×768 and 1366×1024), no hover-only behaviour.

## Common requests and where to change them

- Wording on screen: search the text in `src/app.js` or `src/index.template.html`.
- Tour captions, order or timing: the `this.steps` array in `tour.start` (`src/app.js`).
- "Why Datako" content: `panels.why()` in `src/app.js`; styles under `/* v3: Why Datako */` in `src/styles.css`.
- Process panel: `panels.how()`.
- Colours and fonts: `:root` tokens at the top of `src/styles.css`.
- A new subject (disease): add studies and extractions to `src/demo-data.js` with verified excerpts,
  and an entry in `DEMO.subjects` with `status: "done"`. Today only the RSV subject is pre-computed.

## Commands

```bash
node build.js            # regenerate index.html (Node 18+, no dependencies)
node server.js           # optional: serve on http://localhost:8080
node tools/shoot.js      # optional: full click-through test + screenshots (needs Playwright)
node tools/tour.js       # optional: plays the guided tour and captures each step
```

Playwright is only needed for the tests: `npm install playwright` then `npx playwright install chromium`.
