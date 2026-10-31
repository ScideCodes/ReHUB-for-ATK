import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const output = "audit/source-support",
  url = "http://127.0.0.1:4195";
mkdirSync(output, { recursive: true });
const definitions = JSON.parse(
  readFileSync("src/devices/registry.generated.json", "utf8"),
);
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "4195",
    "--strictPort",
  ],
  { windowsHide: true, stdio: "ignore" },
);
const report = { cases: [], errors: [] };
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for the owned development server. */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, "Dev server did not start");
  browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
  for (const width of [1440, 1100])
    for (const theme of ["dark", "light"])
      for (const family of ["BITYUAN", "HFD"]) {
        const definition = definitions.find(
          (d) =>
            d.kind === "keyboard" &&
            d.protocolFamily === family &&
            d.capabilities.includes(
              family === "HFD" ? "pollingRate" : "actuation",
            ),
        );
        const context = await browser.newContext({
          viewport: { width, height: width === 1440 ? 900 : 700 },
          reducedMotion: "reduce",
          colorScheme: theme,
        });
        await context.addInitScript(
          ({ definition, theme }) => {
            localStorage.setItem("atk-hub-theme", theme);
            window.__sourceFrames = [];
            const device = new EventTarget();
            Object.assign(device, {
              vendorId: Number(definition.VID),
              productId: Number(definition.PID),
              productName: "Source test keyboard",
              opened: false,
              collections: [
                {
                  usagePage: 0xff60,
                  usage: 0x61,
                  outputReports: [{ reportId: 0 }],
                },
              ],
              open: async () => {
                device.opened = true;
              },
              close: async () => {
                device.opened = false;
              },
              sendReport: async (reportId, frame) => {
                window.__sourceFrames.push([...frame]);
                const reply = frame.slice();
                if (frame[0] === 2 && [0, 38].includes(frame[2])) {
                  reply[5] = 1;
                  reply[6] = 0x23;
                }
                if (frame[0] === 2 && frame[2] === 17)
                  reply.set([0, 1, 0, 1, 1], 3);
                if (frame[0] === 2 && frame[2] === 70) reply[3] = 0;
                if (frame[0] === 2 && frame[2] === 11)
                  reply.set([0, 125, 1, 244], 3);
                if (frame[0] === 8) {
                  reply[2] = 2;
                  reply[4] = 128;
                  reply[8] = 60;
                }
                queueMicrotask(() =>
                  device.dispatchEvent(
                    Object.assign(new Event("inputreport"), {
                      device,
                      reportId,
                      data: new DataView(reply.buffer),
                    }),
                  ),
                );
              },
            });
            const hid = new EventTarget();
            Object.assign(hid, {
              getDevices: async () => [device],
              requestDevice: async () => [device],
            });
            Object.defineProperty(navigator, "hid", {
              configurable: true,
              value: hid,
            });
          },
          { definition, theme },
        );
        const page = await context.newPage();
        page.on("pageerror", (e) => report.errors.push(e.message));
        page.on("console", (m) => {
          if (m.type() === "error") report.errors.push(m.text());
        });
        await page.goto(url, { waitUntil: "networkidle" });
        await page
          .getByRole("button", { name: "Connect device", exact: true })
          .click();
        await page.locator(".device-card-open").first().click();
        await page.waitForFunction(() =>
          document
            .querySelector(".keyboard-device")
            ?.textContent.includes("1.23"),
        );
        await page
          .getByRole("tab", {
            name: family === "HFD" ? "Settings" : "Trigger",
            exact: true,
          })
          .click();
        const details = page.getByRole("complementary", {
          name: "Keyboard device",
          exact: true,
        });
        if (family === "BITYUAN")
          assert(
            (await details.textContent())
              .replace(/[,\s]/g, "")
              .includes("8000Hz"),
          );
        else
          await page
            .getByText(
              "Read-only · firmware read verified in source. Settings and key-matrix reads are not integrated; edits stay local.",
              { exact: true },
            )
            .waitFor();
        if (family === "HFD") {
          const rate = page.getByRole("combobox", {
            name: "Report rate",
            exact: true,
          });
          await rate.focus();
          await rate.press("ArrowDown");
          await rate.press("ArrowDown");
          await rate.press("Enter");
          assert(
            (await rate.innerText()).includes("2,000"),
            "The HFD local polling draft did not change",
          );
        } else {
          const actuation = page.getByRole("slider", {
            name: "Actuation",
            exact: true,
          });
          await actuation.focus();
          await actuation.press("ArrowRight");
        }
        await page.waitForTimeout(500);
        assert(
          await page
            .getByRole("button", { name: "Undo", exact: true })
            .isEnabled(),
          "The local edit must create undo history",
        );
        assert.equal(
          await page
            .getByRole("dialog", { name: "Allow keyboard writes?" })
            .count(),
          0,
        );
        const frames = await page.evaluate(() => window.__sourceFrames);
        assert(frames.length > 0);
        assert(
          frames.every((f) =>
            family === "HFD"
              ? f[0] === 2 && f[1] === 150 && f[2] === 38
              : (f[0] === 2 &&
                  f[1] === 150 &&
                  [0, 17, 29, 30, 70, 11].includes(f[2])) ||
                (f[0] === 8 && f[1] === 65),
          ),
        );
        const axe = await new AxeBuilder({ page }).analyze();
        report.cases.push({
          width,
          theme,
          family,
          frames: frames.map((f) => f.slice(0, 3)),
          violations: axe.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => n.html),
          })),
        });
        assert.equal(axe.violations.length, 0);
        await page.screenshot({
          path: `${output}/${family}-${width}-${theme}.png`,
        });
        await context.close();
      }
  assert.equal(report.cases.length, 8);
  assert.equal(report.errors.length, 0);
  console.log(
    "Source support browser: 8 dark/light cases pass; edits stay local; zero axe/page/console errors.",
  );
} catch (error) {
  report.errors.push(error.stack ?? String(error));
  process.exitCode = 1;
  console.error(error.message);
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
