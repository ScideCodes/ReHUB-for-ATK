import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const output = "audit/phase5";
mkdirSync(output, { recursive: true });
const url = "http://127.0.0.1:4185";
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "4185",
    "--strictPort",
  ],
  { windowsHide: true, stdio: "ignore" },
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
    for (const [pid, cid, mid, mode] of [
      [0x11cc, 1, 4, "real"],
      [0x11d8, 1, 4, "real"],
      [0x102e, 2, 42, "real"],
      [0x1084, 2, 63, "demo"],
      [0x102f, 2, 43, "demo"],
      [0x11d8, 2, 63, "readonly"],
      [0xffff, 0, 0, "unknown"],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 1440 ? 900 : 700 },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => result.errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") result.errors.push(m.text());
      });
      await page.goto(url, { waitUntil: "networkidle" });
      await page.evaluate(
        async ({ pid, cid, mid }) => {
          const { MockHidDevice } = await import("/src/mock/mockDevice.ts");
          const device = new MockHidDevice(cid, mid);
          device.productId = pid;
          device.productName = "Browser HID test";
          window.mouseFrames = [];
          window.mouseFilters = [];
          const send = device.sendReport.bind(device);
          device.sendReport = async (id, frame) => {
            window.mouseFrames.push([...frame]);
            return send(id, frame);
          };
          const hid = new EventTarget();
          hid.getDevices = async () => [device];
          hid.requestDevice = async ({ filters }) => {
            window.mouseFilters = filters;
            return [device];
          };
          Object.defineProperty(navigator, "hid", {
            value: hid,
            configurable: true,
          });
        },
        { pid, cid, mid },
      );
      await page
        .getByRole("button", { name: "Connect device", exact: true })
        .click();
      if (mode === "unknown") {
        const message = await page.getByRole("alert").innerText();
        assert(message.includes("373B:FFFF Browser HID test"));
        assert.equal((await page.evaluate(() => window.mouseFrames)).length, 0);
        result.cases.push({ width, pid, mode, message, frames: 0 });
        await context.close();
        continue;
      }
      await page.locator(".device-card-open").waitFor();
      const homeName = await page.locator(".device-card-name").innerText();
      const filters = await page.evaluate(() => window.mouseFilters);
      assert(filters.length > 190);
      assert(filters.every((f) => f.usagePage !== 0xff02));
      await page.locator(".device-card-open").click();
      await page.locator("#settings-editor").waitFor();
      if (mode === "demo") {
        await page
          .getByRole("status")
          .filter({ hasText: "Protocol unverified" })
          .waitFor();
        assert.equal((await page.evaluate(() => window.mouseFrames)).length, 0);
      } else if (mode === "readonly") {
        assert.equal(
          await page
            .getByRole("tab", { name: "DPI", exact: true })
            .isDisabled(),
          true,
        );
        assert(
          (await page.evaluate(() => window.mouseFrames)).every(
            (f) => f[0] === 16,
          ),
        );
      } else {
        assert.equal(
          await page.getByRole("tab", { name: "DPI", exact: true }).isEnabled(),
          true,
        );
        assert(
          (await page.evaluate(() => window.mouseFrames)).some(
            (f) => f[0] === 8,
          ),
        );
      }
      if (mode === "real" && pid === 0x102e) {
        const before = await page.evaluate(() => window.mouseFrames.length);
        const input = page
          .locator('#settings-editor input[type="number"]')
          .first();
        await input.fill("900");
        await input.press("Tab");
        await page.waitForFunction(
          (before) =>
            window.mouseFrames.slice(before).some((frame) => frame[0] === 7),
          before,
        );
        await page.waitForFunction(
          (before) =>
            window.mouseFrames
              .slice(before)
              .some(
                (frame) =>
                  frame[0] === 8 &&
                  [12, 20, 28, 36].includes((frame[2] << 8) | frame[3]),
              ),
          before,
        );
        await page.waitForFunction(async () => {
          const { useConfigStore } = await import("/src/store/configStore.ts");
          const state = useConfigStore.getState();
          return (
            state.activeSettings.dpiStages[state.activeSettings.activeDpiStage]
              .xDpi === 900
          );
        });
      }
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector(".app-screen")).opacity ===
          "1",
      );
      if (mode === "real")
        assert(
          (await page.locator(".lg-save-status").first().innerText()).match(
            /Live|Saved to mouse/,
          ),
        );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      if (
        (width === 1440 && pid === 0x102e) ||
        (width === 1100 && pid === 0x1084)
      )
        await page.screenshot({ path: `${output}/${mode}-${width}.png` });
      if (!result.catalog)
        result.catalog = await page.evaluate(async () => {
          const { MOUSE_DEVICES } = await import("/src/devices/registry.ts");
          const { mouseEndpoint, mouseEndpointSupportsReal } =
            await import("/src/devices/mouseProtocols.ts");
          return MOUSE_DEVICES.map((d) => ({
            name: d.name,
            VID: d.VID,
            PID: d.PID,
            cid: d.cid,
            mid: d.mid,
            mode: mouseEndpointSupportsReal(Number(d.VID), Number(d.PID))
              ? mouseEndpoint(Number(d.VID), Number(d.PID))?.receiver
                ? "real if verified CID/MID; otherwise read-only"
                : "real"
              : "demo",
            reason: mouseEndpointSupportsReal(Number(d.VID), Number(d.PID))
              ? "Source Wt; PAW3950Ultra, five buttons, no DPI RGB (receiver requires runtime identity)"
              : "Different sensor encoding, extra RGB/button capability, or no verified Wt profile",
          }));
        });
      result.cases.push({
        width,
        pid,
        mode,
        homeName,
        frames: (await page.evaluate(() => window.mouseFrames)).length,
      });
      await context.close();
    }
  assert.equal(result.errors.length, 0);
  const rows = result.catalog.map(
    (d) =>
      `| ${d.name} | ${d.VID}:${d.PID} | ${d.cid ?? "—"},${d.mid ?? "—"} | ${d.mode} | ${d.reason} |`,
  );
  writeFileSync(
    "MOUSE_ACCESS.md",
    "# Mouse hardware access\n\nSource: `../extracted/asar_unpacked/static/filter-B6RHekbD.js`; offsets/hash/methods in `audit/phase5/source-evidence.json`.\n\nReal means existing verified controls only, with readback; HP/LP, angle, macros and shortcut sequences remain local. New models keep center-point local because source Wt requires sensorCenterPointV2, absent on these profiles. Additional RGB/six-button and alternate-sensor models stay demo until integrated. Source identity alone never grants writes to an unrelated wired endpoint. No physical hardware was tested.\n\n| Model | VID:PID | CID,MID | Access | Reason |\n|---|---|---|---|---|\n" +
      rows.join("\n") +
      "\n",
  );
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
console.log(result.cases, result.errors);
