// Screenshots + smoke test of the demo flow with the pre-installed Chromium (iPad-like viewport).
// Usage: node tools/shoot.js [outDir]
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const http = require("http");

(async () => {
  const out = process.argv[2] || path.join(__dirname, "..", "shots");
  fs.mkdirSync(out, { recursive: true });
  const root = path.join(__dirname, "..");
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(path.join(root, "index.html")).pipe(res);
  }).listen(0);
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const errors = [];
  for (const [w, h, tag] of [[1024, 768, "ipad"], [1366, 1024, "ipadpro"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: false,
      userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(`${tag}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error") errors.push(`${tag} console: ${m.text()}`); });
    await page.goto(url); await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, `${tag}-1-idle.png`) });
    await page.click("#run-btn"); await page.waitForTimeout(9000);
    await page.screenshot({ path: path.join(out, `${tag}-2-run.png`) });
    await page.click("#skip"); await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, `${tag}-3-results.png`), fullPage: false });
    await page.screenshot({ path: path.join(out, `${tag}-3b-results-full.png`), fullPage: true });
    // tap the Boattini mortality figure (e44) and reject it
    const before = await page.evaluate(() => SLR.synth.compute("mortality", "cfr"));
    await page.click('.fig[data-ex="e44"]'); await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(out, `${tag}-4-card.png`) });
    await page.click('#sheet-foot [data-d="excluded"]'); await page.waitForTimeout(900);
    const after = await page.evaluate(() => SLR.synth.compute("mortality", "cfr"));
    await page.screenshot({ path: path.join(out, `${tag}-5-rejected.png`) });
    console.log(`${tag}: mortality n ${before.n}→${after.n}, max ${before.max}→${after.max}, median ${before.median}→${after.median}, conf ${before.confidence}→${after.confidence}`);
    if (!(after.n === before.n - 1 && after.max < before.max)) errors.push(`${tag}: rejection did not recompute as expected`);
    await page.click("[data-close]"); await page.waitForTimeout(400);
    await page.click('[data-open="method"]'); await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, `${tag}-6-method.png`) });
    await page.click('.tabs [data-tab="why"]'); await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `${tag}-7-why.png`) });
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    await page.click('[data-open="export"]'); await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, `${tag}-8-export.png`) });
    await page.keyboard.press("Escape");
    await page.click('[data-open="subjects"]'); await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, `${tag}-9-history.png`) });
    await page.click("#reset-demo"); await page.waitForTimeout(500);
    const reset = await page.evaluate(() => SLR.synth.compute("mortality", "cfr"));
    if (reset.n !== before.n) errors.push(`${tag}: reset did not restore the pool`);
    // touch target audit: visible buttons under 44px
    const small = await page.evaluate(() => Array.from(document.querySelectorAll("button")).filter(b => { const r = b.getBoundingClientRect(); return r.width && r.height && (r.height < 36 || r.width < 36); }).map(b => (b.className || b.id) + ":" + Math.round(b.getBoundingClientRect().height)));
    console.log(`${tag}: ${small.length} visible buttons under 36px: ${small.slice(0, 8).join(", ")}`);
    await ctx.close();
  }
  await browser.close(); server.close();
  // offline check: no external URLs except DOI/source links in data
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const ext = (html.match(/https?:\/\/[^\s"'<>)]+/g) || []).filter(u => !/europepmc|doi\.org|academic\.oup|railway\.app/.test(u));
  console.log(`external URLs outside sources: ${ext.length}`, ext.slice(0, 5));
  console.log(`size: ${Math.round(Buffer.byteLength(html) / 1024)} KB`);
  if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); }
  console.log("OK");
})();
