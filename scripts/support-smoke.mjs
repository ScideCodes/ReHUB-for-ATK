import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const url = "http://127.0.0.1:4197";
const server = spawn(
  process.execPath,
  [
    path.resolve("node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "4197",
    "--strictPort",
  ],
  { windowsHide: true, stdio: "ignore" },
);
let browser;
const results = [];
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* wait for Vite */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ headless: true });
  await mkdir("audit/desktop", { recursive: true });
  for (const width of [1440, 1100, 900])
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        acceptDownloads: true,
      });
      await context.addInitScript((theme) => {
        localStorage.setItem("atk-hub-original-theme", theme);
        window.reportCalls = [];
        Object.defineProperty(navigator, "hid", {
          value: {
            getDevices: async () => [],
            addEventListener() {},
            removeEventListener() {},
            requestDevice: async () =>
              [1, 0xff60].map((usagePage) => ({
                vendorId: 0x373b,
                productId: 0x1048,
                productName: "PRIVATE_NAME",
                serialNumber: "SECRET_SERIAL",
                collections: [
                  {
                    usagePage,
                    usage: 0x61,
                    inputReports: [
                      {
                        reportId: 0,
                        items: [{ reportSize: 8, reportCount: 32 }],
                      },
                    ],
                  },
                ],
                open: () => window.reportCalls.push("open"),
                sendReport: () => window.reportCalls.push("send"),
              })),
          },
        });
      }, theme);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      await page
        .getByRole("button", { name: "Help support my device", exact: true })
        .click();
      await page.getByLabel("Model name (required)").fill("Composite ATK test");
      await page
        .getByRole("button", { name: "Select device (optional)" })
        .click();
      await page.getByText(/Interface 2: VID/).waitFor();
      let scan = await new AxeBuilder({ page })
        .include(".device-report-dialog")
        .analyze();
      assert.deepEqual(
        scan.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
      );
      await page
        .getByRole("button", { name: "Review report", exact: true })
        .click();
      const report = await page.getByLabel("Report preview").innerText();
      assert.equal(JSON.parse(report).interfaces.length, 2);
      assert.doesNotMatch(report, /PRIVATE_NAME|SECRET_SERIAL/);
      assert.deepEqual(await page.evaluate(() => window.reportCalls), []);
      await page.getByRole("checkbox").check();
      const downloadPromise = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download report", exact: true })
        .click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), "rehub-device-report.txt");
      scan = await new AxeBuilder({ page })
        .include(".device-report-dialog")
        .analyze();
      assert.deepEqual(
        scan.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
      );
      const box = await page.getByRole("dialog").boundingBox();
      assert.ok(
        box.x >= 0 &&
          box.x + box.width <= width &&
          box.y >= 0 &&
          box.y + box.height <= 900,
      );
      if (width === 900 || width === 1440)
        await page.screenshot({
          path: `audit/desktop/report-${width}-${theme}.png`,
        });
      assert.deepEqual(errors, []);
      results.push({
        width,
        theme,
        accessibilityViolations: 0,
        interfaceCount: 2,
        hardwareCommands: 0,
      });
      await context.close();
    }
  await writeFile(
    "audit/desktop/browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser?.close();
  server.kill();
}
