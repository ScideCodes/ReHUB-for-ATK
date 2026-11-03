import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const output = "audit/phase7/states",
  url = "http://127.0.0.1:4187";
mkdirSync(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4187",
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
      /* Wait for the local preview. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  for (const width of [1440, 1100, 900]) {
    for (const state of [
      "no-webhid",
      "permission-denied",
      "unknown-device",
      "mock-routes",
    ]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 1440 ? 900 : 700 },
        reducedMotion: "reduce",
      });
      await context.addInitScript((state) => {
        if (state === "no-webhid") {
          delete Object.getPrototypeOf(navigator).hid;
          return;
        }
        if (state === "mock-routes") return;
        const hid = new EventTarget();
        hid.getDevices = async () => [];
        hid.requestDevice = async () => {
          if (state === "permission-denied")
            throw new DOMException("Permission denied", "NotAllowedError");
          return [
            {
              vendorId: 0xffff,
              productId: 1,
              productName: "Unknown device",
              collections: [{ usagePage: 0xff04, usage: 2 }],
            },
          ];
        };
        Object.defineProperty(navigator, "hid", {
          configurable: true,
          value: hid,
        });
      }, state);
      const page = await context.newPage();
      page.on("pageerror", (e) => report.errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") report.errors.push(m.text());
      });
      await page.goto(url, { waitUntil: "networkidle" });
      const connect = page.getByRole("button", {
        name: "Connect device",
        exact: true,
      });
      if (state === "no-webhid") {
        assert(await connect.isDisabled());
        assert(
          await page
            .getByText("WebHID unavailable — use Mock to explore.", {
              exact: true,
            })
            .isVisible(),
        );
      } else if (state === "permission-denied") {
        await connect.click();
        assert(await connect.isEnabled());
        assert.equal(await page.locator(".device-home-connected").count(), 0);
      } else if (state === "unknown-device") {
        await connect.click();
        assert(await page.getByText(/Unsupported HID device/).isVisible());
        assert.equal(await page.locator(".device-home-connected").count(), 0);
      } else {
        for (const model of ["ATK 68 V2 Pro", "ATK Frost Zero Extreme"]) {
          let releaseWorkspace;
          if (width === 1440 && model === "ATK Frost Zero Extreme")
            await page.route("**/MouseWorkspace-*.js", (route) => {
              releaseWorkspace = () => route.continue();
            });
          await page
            .getByRole("button", { name: "Mock device", exact: true })
            .first()
            .click();
          const picker = page.getByRole("dialog", {
            name: "Select device",
            exact: true,
          });
          await picker
            .getByRole("combobox", { name: "Model", exact: true })
            .click();
          await page.getByRole("option", { name: model, exact: true }).click();
          await picker
            .getByRole("button", { name: "Mock device", exact: true })
            .click();
          if (width === 1440 && model === "ATK Frost Zero Extreme") {
            await page.locator(".workspace-loading-skeleton").waitFor();
            assert.equal(
              await page.locator(".workspace-loading-skeleton > span").count(),
              3,
            );
            await releaseWorkspace();
          }
          await page.getByRole("tablist").waitFor();
          assert(await page.getByRole("heading", { level: 1 }).isVisible());
          await page
            .getByRole("button", { name: "Back to device list", exact: true })
            .click();
        }
        await page.locator(".device-home-connected").first().waitFor();
        assert.equal(await page.locator(".device-home-connected").count(), 2);
      }
      const axe = await new AxeBuilder({ page }).analyze();
      assert.equal(
        axe.violations.length,
        0,
        JSON.stringify(
          axe.violations.map((v) => ({
            id: v.id,
            targets: v.nodes.map((n) => n.target),
          })),
        ),
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({ path: `${output}/${state}-${width}.png` });
      report.cases.push({ state, width, axeViolations: 0, production: true });
      await context.close();
    }
  }
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  console.log(
    `${report.cases.length} production route/error states pass; axe zero.`,
  );
} catch (error) {
  report.errors.push(error.stack ?? String(error));
  process.exitCode = 1;
  console.error(error);
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
