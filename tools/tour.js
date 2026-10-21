// Plays the guided tour in Chromium and captures each step (iPad-like viewport).
// Usage: node tools/tour.js [outDir] [width] [height]
const { chromium } = require("playwright");
const path = require("path"); const fs = require("fs"); const http = require("http");
(async () => {
  const out = process.argv[2] || path.join(__dirname, "..", "shots"); fs.mkdirSync(out, { recursive: true });
  const W = +(process.argv[3] || 1024), H = +(process.argv[4] || 768);
  const root = path.join(__dirname, "..");
  const server = http.createServer((q, r) => { r.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); fs.createReadStream(path.join(root, "index.html")).pipe(r); }).listen(0);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForTimeout(500);
  const t0 = Date.now();
  await page.click(".tour-btn");
  let seen = "";
  for (let k = 0; k < 400; k++) {
    const n = await page.evaluate(() => document.querySelector("#tc-n").textContent);
    if (n && n !== seen) {
      seen = n; await page.waitForTimeout(1000);
      const idx = n.split(" / ")[0];
      await page.screenshot({ path: path.join(out, `tour-${W}-${idx.padStart(2, "0")}.png`) });
      console.log(`step ${n} at ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      if (n.split(" / ")[0] === n.split(" / ")[1]) break;
    }
    await page.waitForTimeout(100);
  }
  const mid = await page.evaluate(() => SLR.synth.compute("mortality", "cfr").n);
  await page.click('[data-tc="end"]'); await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({ n: SLR.synth.compute("mortality", "cfr").n, screen: SLR.store.screen, decisions: Object.keys(SLR.store.decisions).length, touring: document.body.classList.contains("touring") }));
  console.log("during tour mortality n:", mid, "| after exit:", JSON.stringify(after));
  if (after.n !== 7 || after.touring || after.screen !== "results") errors.push("tour did not restore state");
  await page.screenshot({ path: path.join(out, `tour-${W}-end.png`) });
  await browser.close(); server.close();
  if (errors.length) { console.log("ERRORS\n" + errors.join("\n")); process.exit(1); }
  console.log("OK");
})();
