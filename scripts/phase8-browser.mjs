import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const output = "audit/phase8",
  url = "http://127.0.0.1:4189";
mkdirSync(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "4189",
    "--strictPort",
  ],
  { windowsHide: true, stdio: "ignore" },
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
  for (const test of [
    {
      width: 1440,
      height: 900,
      theme: "light",
      model: "ATK Frost Zero Extreme",
      screen: "mouse",
      tab: "DPI",
    },
    {
      width: 1100,
      height: 700,
      theme: "dark",
      model: "ATK 68 V2 Pro",
      screen: "keyboard",
      tab: "Trigger",
    },
  ]) {
    const context = await browser.newContext({
      viewport: { width: test.width, height: test.height },
      reducedMotion: "reduce",
      colorScheme: test.theme,
    });
    await context.addInitScript(
      (theme) => localStorage.setItem("atk-hub-theme", theme),
      test.theme,
    );
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") report.errors.push(message.text());
    });
    await page.goto(url, { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: "Mock device", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Select device",
      exact: true,
    });
    await dialog.getByRole("combobox", { name: "Model", exact: true }).click();
    await page.getByRole("option", { name: test.model, exact: true }).click();
    await dialog
      .getByRole("button", { name: "Mock device", exact: true })
      .click();
    const tab = page.getByRole("tab", { name: test.tab, exact: true });
    await tab.click();
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector(".app-screen")).opacity === "1",
    );
    assert.equal(
      await page.locator(".app-screen").getAttribute("data-screen"),
      test.screen,
    );
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      test.theme,
    );
    assert.equal(await tab.getAttribute("aria-selected"), "true");
    assert(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    );
    let textContrast = [];
    if (test.screen === "mouse") {
      textContrast = await page.evaluate(() => {
        const rgb = (value) => value.match(/[\d.]+/g).map(Number);
        const luminance = (channels) =>
          channels
            .slice(0, 3)
            .map((value) => value / 255)
            .map((value) =>
              value <= 0.04045
                ? value / 12.92
                : ((value + 0.055) / 1.055) ** 2.4,
            )
            .reduce(
              (sum, value, index) =>
                sum + value * [0.2126, 0.7152, 0.0722][index],
              0,
            );
        const background = rgb(
          getComputedStyle(document.documentElement).backgroundColor,
        );
        return [
          ".lg-hero-number",
          '.lg-stage-strip > button[aria-pressed="true"] > strong',
          ".lg-rail-note",
          ".lg-header .hub-back-pill",
        ].map((selector) => {
          const foreground = rgb(
            getComputedStyle(document.querySelector(selector)).color,
          );
          const opacity = foreground[3] ?? 1;
          const blended = foreground
            .slice(0, 3)
            .map(
              (value, index) =>
                value * opacity + background[index] * (1 - opacity),
            );
          const light = [luminance(blended), luminance(background)].sort(
            (a, b) => b - a,
          );
          return { selector, ratio: (light[0] + 0.05) / (light[1] + 0.05) };
        });
      });
      assert(
        textContrast.every((item) => item.ratio >= 4.5),
        JSON.stringify(textContrast),
      );
    }
    const axe = await new AxeBuilder({ page }).analyze();
    assert.equal(
      axe.violations.length,
      0,
      JSON.stringify(axe.violations.map((issue) => issue.id)),
    );
    const screenshot = `${output}/${test.screen}-${test.tab.toLowerCase()}-${test.width}-${test.theme}.png`;
    await page.screenshot({ path: screenshot });
    report.cases.push({
      ...test,
      axeViolations: 0,
      textContrast,
      incompleteRules: axe.incomplete.map((issue) => issue.id),
      screenshot,
    });
    await context.close();
  }
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  console.log(
    "Two final route/theme captures pass; no overflow, axe violations or console errors.",
  );
} catch (error) {
  report.errors.push(error.stack ?? String(error));
  console.error(error);
  process.exitCode = 1;
} finally {
  writeFileSync(`${output}/browser.json`, JSON.stringify(report, null, 2));
  await browser?.close();
  if (process.platform === "win32")
    spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else server.kill();
}
