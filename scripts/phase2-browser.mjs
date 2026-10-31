import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const output = "audit/phase2";
mkdirSync(output, { recursive: true });
const url = "http://127.0.0.1:4182";
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "4182",
    "--strictPort",
  ],
  { windowsHide: true, stdio: "ignore" },
);
const results = { cases: [], errors: [] };
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      ready = (await fetch(url)).ok;
    } catch {
      /* Wait for Vite. */
    }
    if (ready) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert(ready, "Phase 2 server must start");
  browser = await chromium.launch();
  for (const width of [1440, 1100])
    for (const pid of [0x1048, 0x1044, 0x10b0]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 1440 ? 900 : 700 },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => results.errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") results.errors.push(message.text());
      });
      await page.goto(url, { waitUntil: "networkidle" });
      if (!results.catalog)
        results.catalog = await page.evaluate(async () => {
          const { DEVICE_REGISTRY } = await import("/src/devices/registry.ts");
          return DEVICE_REGISTRY.filter(
            (entry) => entry.kind === "keyboard",
          ).map(
            ({
              id,
              name,
              VID,
              PID,
              usagePage,
              usage,
              reportId,
              protocolFamily,
            }) => ({
              id,
              name,
              VID,
              PID,
              usagePage,
              usage,
              reportId,
              protocolFamily,
            }),
          );
        });
      await page.evaluate(async (pid) => {
        const { DEVICE_REGISTRY } = await import("/src/devices/registry.ts");
        const { createKeyboardSettings } =
          await import("/src/devices/keyboardSettings.ts");
        const definition = DEVICE_REGISTRY.find(
          (entry) => entry.kind === "keyboard" && Number(entry.PID) === pid,
        );
        if (!definition) throw new Error("Missing test registry definition");
        const defaults = createKeyboardSettings(),
          device = new EventTarget(),
          frames = [];
        window.__phase2 = { frames, name: definition.name, filters: [] };
        Object.assign(device, {
          vendorId: Number(definition.VID),
          productId: pid,
          productName: definition.name,
          opened: false,
          collections: [
            {
              usagePage: definition.usagePage,
              usage: definition.usage,
              outputReports: [{ reportId: definition.reportId }],
            },
          ],
          open: async () => {
            device.opened = true;
          },
          close: async () => {
            device.opened = false;
          },
          sendReport: async (reportId, bytes) => {
            const frame = new Uint8Array(bytes);
            frames.push([...frame]);
            const reply = frame.slice();
            if (frame[0] === 2) {
              if (frame[2] === 0) {
                reply[5] = 3;
                reply[6] = 1;
              }
              if (frame[2] === 34) reply[3] = 1;
              if (frame[2] === 3) reply.set([0, 150], 5);
              if (frame[2] === 7) {
                reply[7] = 10;
                reply[9] = 10;
              }
            }
            if (frame[0] === 8) {
              reply[2] = 2;
              reply[4] = 128;
              reply[8] = 60;
            }
            if (frame[0] === 4)
              reply.set(
                defaults.keys.find(
                  (key) => key.row === frame[2] && key.col === frame[3],
                ).layers[frame[1]],
                4,
              );
            setTimeout(
              () =>
                device.dispatchEvent(
                  Object.assign(new Event("inputreport"), {
                    reportId,
                    data: new DataView(reply.buffer),
                  }),
                ),
              5,
            );
          },
        });
        const hid = new EventTarget();
        Object.assign(hid, {
          getDevices: async () => [device],
          requestDevice: async ({ filters }) => {
            window.__phase2.filters = filters;
            return [device];
          },
        });
        Object.defineProperty(navigator, "hid", {
          configurable: true,
          value: hid,
        });
        localStorage.setItem(
          "atk-hub-remembered-devices-list",
          JSON.stringify([{ deviceId: definition.id, color: 0, mock: false }]),
        );
      }, pid);
      // Remount Home so it loads the remembered, authorized physical endpoint.
      await page
        .getByRole("button", { name: "Connect device", exact: true })
        .click();
      const name = await page.evaluate(() => window.__phase2.name);
      const filters = await page.evaluate(() => window.__phase2.filters);
      assert(
        filters.every((filter) => filter.usagePage !== 0xff02),
        "Home must exclude boot endpoints",
      );
      assert(
        filters.some((filter) => filter.productId === 0x1044) &&
          filters.some((filter) => filter.productId === 0x1048),
        "Home must offer both verified keyboard identities",
      );
      if (pid === 0x10b0) {
        assert(
          !filters.some((filter) => filter.productId === pid),
          "unverified family must not be offered as a verified connection",
        );
      }
      await page
        .getByRole("button", { name: `Open ${name} settings`, exact: true })
        .click();
      await page
        .getByRole("tablist", { name: "Keyboard settings", exact: true })
        .waitFor();
      await page.waitForTimeout(800);
      const frames = await page.evaluate(() => window.__phase2.frames);
      if (pid === 0x10b0) {
        assert.equal(
          frames.length,
          0,
          "unverified family must never send a frame",
        );
        assert(
          await page.getByText(/Protocol not verified, demo only/).isVisible(),
        );
      } else {
        assert(
          frames.length > 0 &&
            frames.every((frame) => [2, 4, 8].includes(frame[0])),
          "verified devices must read without writes on open",
        );
        const tray = page.locator(".keyboard-device-toggle");
        if (width <= 1100) await tray.click();
        assert(
          await page
            .getByRole("button", { name: "Disconnect", exact: true })
            .isVisible(),
          "verified connection must expose Disconnect",
        );
        if (width <= 1100) await tray.click();
        if (pid === 0x1044) {
          assert(
            frames.every(
              (frame) => frame[0] !== 4 && ![3, 7].includes(frame[2]),
            ),
            "RS7 must not read the ATK68 key matrix",
          );
          const tab = page.getByRole("tab", { name: "Trigger", exact: true });
          await tab.click();
          await page
            .getByRole("slider", { name: "Actuation", exact: true })
            .focus();
          await page.keyboard.press("ArrowRight");
          await page.waitForTimeout(500);
          assert(
            (await page.evaluate(() => window.__phase2.frames)).every((frame) =>
              [2, 8].includes(frame[0]),
            ),
            "RS7 edits must never emit writes",
          );
          assert(
            await page
              .getByText("Read-only · changes stay local", { exact: true })
              .isVisible(),
          );
        }
      }
      results.cases.push({
        width,
        name,
        pid,
        readFrames: frames.length,
        writes: frames.filter((frame) => [3, 5, 7].includes(frame[0])).length,
        passed: true,
      });
      if (
        (width === 1440 && pid === 0x1044) ||
        (width === 1100 && pid === 0x10b0)
      )
        await page.screenshot({
          path: `${output}/${width}-${pid.toString(16)}.png`,
        });
      await context.close();
    }
  assert.equal(results.cases.length, 6);
  assert.equal(results.errors.length, 0);
} catch (error) {
  results.errors.push(error.stack ?? String(error));
  process.exitCode = 1;
} finally {
  writeFileSync(`${output}/browser.json`, JSON.stringify(results, null, 2));
  await browser?.close();
  if (process.platform === "win32")
    spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else server.kill();
}
