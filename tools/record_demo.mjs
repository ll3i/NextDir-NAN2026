import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GAME_DIR = path.join(ROOT, "game");
const DEMO_DIR = path.join(ROOT, "demo");
const OUT_WEBM = path.join(DEMO_DIR, "NextDir_DirectorLoop_Demo.webm");

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
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(fs.readFileSync(filePath));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, port };
}

async function main() {
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  const { server, port } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: DEMO_DIR, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  const url = `http://127.0.0.1:${port}/index.html?demo=1`;
  console.log("Open", url);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  // Wait until demo finishes or timeout (~100s)
  const started = Date.now();
  while (Date.now() - started < 100000) {
    const done = await page.evaluate(() => window.__NAN_DEMO_DONE__ === true);
    if (done) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2500);

  const video = page.video();
  await page.close();
  const videoPath = await video.path();
  await context.close();
  await browser.close();
  server.close();

  if (fs.existsSync(OUT_WEBM)) fs.unlinkSync(OUT_WEBM);
  fs.renameSync(videoPath, OUT_WEBM);

  // cleanup other temporary videos
  for (const f of fs.readdirSync(DEMO_DIR)) {
    if (f.endsWith(".webm") && f !== path.basename(OUT_WEBM)) {
      try { fs.unlinkSync(path.join(DEMO_DIR, f)); } catch {}
    }
  }
  console.log("Demo video:", OUT_WEBM);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
