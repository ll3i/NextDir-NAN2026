/**
 * Built-in bot playtest via ?playtest=1&fork=elite|safe
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GAME_DIR = path.join(ROOT, "game");

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

async function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel = urlPath === "/" ? "/index.html" : urlPath;
    const filePath = path.join(GAME_DIR, rel.replace(/^\//, ""));
    if (!filePath.startsWith(GAME_DIR) || !fs.existsSync(filePath)) {
      res.writeHead(404); res.end("not found"); return;
    }
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(fs.readFileSync(filePath));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: server.address().port };
}

async function runFork(page, port, fork) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  await page.goto(`http://127.0.0.1:${port}/index.html?playtest=1&fork=${fork}`, { waitUntil: "networkidle" });
  const t0 = Date.now();
  let lastSnap = null;
  while (Date.now() - t0 < 150000) {
    const state = await page.evaluate(() => ({
      done: window.__PT_DONE__ === true,
      report: window.__PT_REPORT__ || null,
      room: document.getElementById("roomLabel")?.textContent,
      hp: document.getElementById("hpText")?.textContent,
      phase: document.getElementById("phaseChip")?.textContent,
      banner: document.getElementById("banner")?.textContent,
      cardOpen: !document.getElementById("cardPick")?.classList.contains("hidden"),
      branchOpen: !document.getElementById("branchPick")?.classList.contains("hidden"),
      resultOpen: !document.getElementById("result")?.classList.contains("hidden"),
      action: document.getElementById("actionText")?.textContent,
    }));
    lastSnap = state;
    if (state.done) break;
    await page.waitForTimeout(500);
  }
  const report = await page.evaluate(() => window.__PT_REPORT__ || null);
  return { fork, errors, report, lastSnap, ms: Date.now() - t0 };
}

async function main() {
  const { server, port } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const fork of ["elite", "safe", "elite"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    console.log(`\n=== playtest fork=${fork} ===`);
    const r = await runFork(page, port, fork);
    results.push(r);
    console.log(JSON.stringify(r, null, 2));
    await ctx.close();
  }
  const out = path.join(ROOT, "tools", "playtest_report.json");
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log("\nWrote", out);
  const wins = results.filter((r) => r.report?.win).length;
  const losses = results.filter((r) => r.report && !r.report.win).length;
  const errs = results.flatMap((r) => r.errors);
  console.log("SUMMARY", { wins, losses, errs, n: results.length });
  await browser.close();
  server.close();
  if (errs.length) process.exitCode = 2;
}

main().catch((e) => { console.error(e); process.exit(1); });
