import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const output = "audit/phase6",
  url = "http://127.0.0.1:4186";
mkdirSync(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "4186",
    "--strictPort",
  ],
  { windowsHide: true, stdio: "ignore" },
);
const previous = readFileSync("scripts/phase4-browser.mjs", "utf8");
const start = previous.indexOf("await context.addInitScript("),
  end = previous.indexOf("\n    const page =", start);
const keyboardSetup = previous
  .slice(start, end)
  .trim()
  .replace(/^await context.addInitScript\(/, "")
  .replace(/\);$/, "")
  .replace(
    "Object.assign(hid, {",
    "window.__phase6Device = device;\n      Object.assign(hid, {",
  );
const result = { cases: [], errors: [] };
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch { /* Retry while the local server starts or an expected test fault is exercised. */ }
    await new Promise((done) => setTimeout(done, 100));
  }
  browser = await chromium.launch();
  for (const width of [1440, 1100])
    for (const kind of ["mouse", "keyboard"]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 1440 ? 900 : 700 },
        reducedMotion: "reduce",
      });
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (text) => {
              if (window.__copyFail) throw new Error("denied");
              window.__copied = text;
            },
          },
        });
      });
      if (kind === "keyboard")
        await context.addInitScript({ content: `(${keyboardSetup})();` });
      const page = await context.newPage();
      page.on("pageerror", (e) => result.errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") result.errors.push(m.text());
      });
      await page.goto(url, { waitUntil: "networkidle" });
      if (kind === "mouse")
        await page.evaluate(async () => {
          const { MockHidDevice } = await import("/src/mock/mockDevice.ts");
          const device = new MockHidDevice();
          device.productId = 0x11d8;
          device.productName = "PRIVATE Alex mouse";
          device.collections[0].inputReports = [{ reportId: 8 }];
          device.collections[0].outputReports = [{ reportId: 8 }];
          window.__phase6Device = device;
          window.__mouseFrames = [];
          const send = device.sendReport.bind(device);
          device.sendReport = async (id, frame) => {
            window.__mouseFrames.push([...frame]);
            return send(id, frame);
          };
          const hid = new EventTarget();
          hid.getDevices = async () => [device];
          hid.requestDevice = async () => [device];
          Object.defineProperty(navigator, "hid", {
            value: hid,
            configurable: true,
          });
        });
      await page
        .getByRole("button", { name: "Connect device", exact: true })
        .click();
      await page.locator(".device-card-open").click();
      if (kind === "keyboard")
        await page.waitForFunction(() => window.__phase4.frames.length === 65);
      else await page.locator("#settings-editor").waitFor();
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector(".app-screen")).opacity ===
          "1",
      );
      const count = () =>
        page.evaluate(
          (kind) =>
            kind === "mouse"
              ? window.__mouseFrames.length
              : window.__phase4.frames.length,
          kind,
        );
      const before = await count();
      await page
        .getByRole("button", { name: "Diagnostics", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Diagnostics",
        exact: true,
      });
      await dialog.waitFor();
      assert(
        (await dialog.innerText()).includes(
          kind === "mouse" ? "0xFF04" : "0xFF60",
        ),
      );
      await dialog.getByText(/^Collections and report IDs/).click();
      assert(
        (await dialog.innerText()).includes(
          kind === "mouse" ? "Input 0x08" : "Output 0x00",
        ),
      );
      await dialog
        .getByRole("button", { name: "Copy report", exact: true })
        .click();
      await dialog
        .getByRole("status")
        .filter({ hasText: "Report copied" })
        .waitFor();
      let report = await page.evaluate(() => JSON.parse(window.__copied));
      assert.equal(report.kind, kind);
      assert(report.frames.length > 0 && report.frames.length <= 50);
      assert(report.timing.exchanges > 0);
      assert(
        report.frames.every((f) =>
          f.hex
            .split(" ")
            .slice(kind === "mouse" ? 5 : 3)
            .every((b) => b === "**"),
        ),
      );
      assert(!JSON.stringify(report).match(/Alex|PRIVATE|54 20 E4 D0/));
      assert.equal(await count(), before);
      await page.evaluate(() => {
        window.__copyFail = true;
      });
      await dialog
        .getByRole("button", { name: "Copy report", exact: true })
        .click();
      await dialog
        .getByRole("status")
        .filter({ hasText: "Could not copy" })
        .waitFor();
      await page.evaluate(async (kind) => {
        window.__copyFail = false;
        const device = window.__phase6Device;
        const send = device.sendReport;
        device.sendReport = async () => {
          throw new Error("Permission denied PRIVATE Alex C:/secret");
        };
        try {
          if (kind === "mouse") {
            const { hidClient } = await import("/src/hid/hidClient.ts");
            const { buildPacket } = await import("/src/protocol/codec.ts");
            await hidClient.transfer(buildPacket(4));
          } else {
            const { keyboardSession } =
              await import("/src/hid/keyboardClient.ts");
            const { ATK68 } = await import("/src/devices/registry.ts");
            const { keyboardRead } = await import("/src/protocol/keyboard.ts");
            await keyboardSession(ATK68).read(keyboardRead("pollingRate"));
          }
        } catch {
          /* The simulated transport fault is expected. */
        } finally {
          device.sendReport = send;
        }
      }, kind);
      await dialog.getByText("permission-denied", { exact: true }).waitFor();
      await dialog
        .getByRole("button", { name: "Copy report", exact: true })
        .click();
      await dialog
        .getByRole("status")
        .filter({ hasText: "Report copied" })
        .waitFor();
      report = await page.evaluate(() => JSON.parse(window.__copied));
      assert(report.errors.some((e) => e.code === "permission-denied"));
      assert(!JSON.stringify(report).match(/Alex|PRIVATE|secret/));
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector(".hub-diagnostics"))
            .opacity === "1",
      );
      const accessibility = await new AxeBuilder({ page })
        .include(".hub-diagnostics")
        .withRules([
          "aria-prohibited-attr",
          "aria-valid-attr-value",
          "button-name",
          "label-content-name-mismatch",
          "color-contrast",
        ])
        .analyze();
      assert.deepEqual(
        accessibility.violations.map((item) => item.id),
        [],
      );
      const bounds = await dialog.boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      assert(
        bounds.y >= 0 &&
          bounds.y + bounds.height <= (width === 1440 ? 900 : 700) + 1,
      );
      if (
        (width === 1440 && kind === "keyboard") ||
        (width === 1100 && kind === "mouse")
      )
        await page.screenshot({ path: `${output}/${kind}-${width}.png` });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        await page
          .getByRole("button", { name: "Diagnostics", exact: true })
          .evaluate((el) => document.activeElement === el),
        true,
      );
      result.cases.push({
        kind,
        width,
        frames: report.frames.length,
        errors: report.errors.length,
        timing: report.timing,
        copyRedacted: true,
        clipboardFailureVisible: true,
        noCommandsOnOpenOrCopy: true,
        focusRestored: true,
      });
      await context.close();
    }
  assert.equal(result.errors.length, 0);
} catch (error) {
  result.errors.push(error.stack ?? String(error));
  process.exitCode = 1;
} finally {
  writeFileSync(
    `${output}/browser.json`,
    JSON.stringify(result, null, 2) + "\n",
  );
  await browser?.close();
  if (process.platform === "win32")
    spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else server.kill();
}
console.log(result);
