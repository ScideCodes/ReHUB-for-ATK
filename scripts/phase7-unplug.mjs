import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const output = "audit/phase7/unplug",
  url = "http://127.0.0.1:4188";
mkdirSync(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "4188",
    "--strictPort",
  ],
  { windowsHide: true, stdio: "ignore" },
);
const source = readFileSync("scripts/phase4-browser.mjs", "utf8");
const start = source.indexOf("await context.addInitScript("),
  end = source.indexOf("\n    const page =", start);
const setup = source
  .slice(start, end)
  .trim()
  .replace(/^await context.addInitScript\(/, "")
  .replace(/\);$/, "")
  .replace(
    "Object.assign(hid, {",
    `window.__unplug = () => {const event=new Event('disconnect');Object.assign(event,{device});hid.dispatchEvent(event);}; Object.assign(hid, {`,
  );
const report = { cases: [], errors: [] };
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Wait for Vite. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  for (const width of [1440, 1100, 900]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 1440 ? 900 : 700 },
      reducedMotion: "reduce",
    });
    await context.addInitScript({ content: `(${setup})();` });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.goto(url, { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: "Connect device", exact: true })
      .click();
    await page.locator(".device-card-open").click();
    await page.waitForFunction(() => window.__phase4.frames.length === 65);
    const before = await page
      .locator(".keyboard-map-select")
      .first()
      .getAttribute("title");
    await page.evaluate(() => window.__unplug());
    await page.waitForFunction(() =>
      document
        .querySelector(".keyboard-device-toggle")
        ?.textContent.includes("Disconnected"),
    );
    assert.equal(
      await page.locator(".keyboard-map-select").first().getAttribute("title"),
      before,
    );
    assert(
      await page.getByRole("tab", { name: "Keys", exact: true }).isEnabled(),
    );
    const frames = await page.evaluate(() => window.__phase4.frames);
    assert(
      frames.every((frame) => [2, 4, 8, 18].includes(frame[0])),
      "Unplug check must not send writes",
    );
    const axe = await new AxeBuilder({ page }).analyze();
    assert.equal(
      axe.violations.length,
      0,
      JSON.stringify(axe.violations.map((issue) => issue.id)),
    );
    await page.screenshot({ path: `${output}/keyboard-${width}.png` });
    report.cases.push({
      width,
      disconnected: true,
      mapRetained: true,
      writes: 0,
      axeViolations: 0,
    });
    await context.close();
  }
  assert.equal(report.errors.length, 0);
  console.log(
    "Three unplug states pass; drafts retained; no writes; axe zero.",
  );
} catch (error) {
  report.errors.push(error.stack ?? String(error));
  console.error(error);
  process.exitCode = 1;
} finally {
  writeFileSync(`${output}/results.json`, JSON.stringify(report, null, 2));
  await browser?.close();
  if (process.platform === "win32")
    spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else server.kill();
}
