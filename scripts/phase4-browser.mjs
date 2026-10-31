import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const output = "audit/phase4",
  url = "http://127.0.0.1:4184";
mkdirSync(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "4184",
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
    } catch {
      /* Wait for Vite. */
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  browser = await chromium.launch();
  for (const width of [1440, 1100]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 1440 ? 900 : 700 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      const device = new EventTarget(),
        hid = new EventTarget();
      let settings;
      window.__phase4 = { frames: [], failPoll: false };
      Object.assign(device, {
        vendorId: 0x373b,
        productId: 0x1048,
        productName: "Phase4 ATK68",
        opened: false,
        collections: [
          { usagePage: 0xff60, usage: 0x61, outputReports: [{ reportId: 0 }] },
        ],
        open: async () => {
          device.opened = true;
        },
        close: async () => {
          device.opened = false;
        },
        sendReport: async (reportId, bytes) => {
          const module = await import("/src/devices/keyboardSettings.ts"),
            fixture = await import("/src/hid/testing/keyboardReply.ts");
          settings ??= module.createKeyboardSettings();
          const frame = new Uint8Array(bytes),
            reply = frame.slice(),
            word = (index) => frame[index] * 256 + frame[index + 1];
          window.__phase4.frames.push([...frame]);
          const key = settings.keys.find(
            (key) => key.row === frame[3] && key.col === frame[4],
          );
          if (frame[0] === 3) {
            if (frame[2] === 34) settings.pollingRate = frame[3] * 1000;
            if (frame[2] === 29) settings.options.bottomTrigger = !!frame[3];
            if (frame[2] === 30) settings.options.performanceMode = !!frame[3];
            if (frame[2] === 17)
              Object.assign(settings.options, {
                rgbArea: frame[3],
                exchangeWasd: !!frame[4],
                macSwitch: !!frame[5],
                winLock: !!frame[6],
                sixKeyNoPunch: !frame[7],
              });
            if (frame[2] === 11)
              settings.deadZone = { top: word(3) / 100, bottom: word(5) / 100 };
            if (frame[2] === 3) key.actuation = word(5) / 100;
            if (frame[2] === 7)
              key.rt = {
                on: !!frame[5],
                release: word(6) / 100,
                press: word(8) / 100,
              };
          }
          if (frame[0] === 5)
            settings.keys.find(
              (key) => key.row === frame[2] && key.col === frame[3],
            ).layers[frame[1]] = [frame[4], frame[5]];
          if (frame[0] === 7 && frame[1] === 65)
            settings.light = {
              mode: frame[2],
              speed: frame[4],
              color:
                "#" +
                [...frame.slice(5, 8)]
                  .map((v) => v.toString(16).padStart(2, "0"))
                  .join(""),
              brightness: frame[8],
            };
          if (frame[0] === 7 && frame[1] === 66)
            settings.keys.find(
              (key) => key.row === frame[2] && key.col === frame[3],
            ).color =
              "#" +
              [...frame.slice(5, 8)]
                .map((v) => v.toString(16).padStart(2, "0"))
                .join("");
          fixture.fillKeyboardBulkReply(frame, reply, settings);
          const view = new DataView(reply.buffer);
          if (frame[0] === 2) {
            if (frame[2] === 0) reply.set([3, 1], 5);
            if (frame[2] === 34) {
              reply[3] = settings.pollingRate / 1000;
              if (window.__phase4.failPoll) {
                reply[3] = 1;
                window.__phase4.failPoll = false;
              }
            }
            if (frame[2] === 17)
              reply.set(
                [
                  settings.options.rgbArea,
                  +settings.options.exchangeWasd,
                  +settings.options.macSwitch,
                  +settings.options.winLock,
                  +!settings.options.sixKeyNoPunch,
                ],
                3,
              );
            if (frame[2] === 29) reply[3] = +settings.options.bottomTrigger;
            if (frame[2] === 30) reply[3] = +settings.options.performanceMode;
            if (frame[2] === 11) {
              view.setUint16(3, Math.round(settings.deadZone.top * 100));
              view.setUint16(5, Math.round(settings.deadZone.bottom * 100));
            }
            if (frame[2] === 3)
              view.setUint16(5, Math.round(key.actuation * 100));
            if (frame[2] === 7) {
              reply[5] = +key.rt.on;
              view.setUint16(6, Math.round(key.rt.release * 100));
              view.setUint16(8, Math.round(key.rt.press * 100));
            }
          }
          if (frame[0] === 4)
            reply.set(
              settings.keys.find(
                (key) => key.row === frame[2] && key.col === frame[3],
              ).layers[frame[1]],
              4,
            );
          if (frame[0] === 8 && frame[1] === 65) {
            const light = settings.light;
            reply.set(
              [
                light.mode,
                0,
                light.speed,
                ...light.color
                  .slice(1)
                  .match(/../g)
                  .map((v) => parseInt(v, 16)),
                light.brightness,
              ],
              2,
            );
          }
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
      Object.assign(hid, {
        getDevices: async () => [device],
        requestDevice: async () => [device],
      });
      Object.defineProperty(navigator, "hid", {
        configurable: true,
        value: hid,
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => result.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") result.errors.push(message.text());
    });
    await page.goto(url, { waitUntil: "networkidle" });
    const name = await page.evaluate(async () => {
      const { ATK68 } = await import("/src/devices/registry.ts");
      return ATK68.name;
    });
    await page
      .getByRole("button", { name: "Connect device", exact: true })
      .click();
    await page
      .getByRole("button", { name: `Open ${name} settings`, exact: true })
      .click();
    await page.waitForFunction(() => window.__phase4.frames.length === 65);
    const select = async (label, option) => {
      await page.getByRole("combobox", { name: label, exact: true }).click();
      await page.getByRole("option", { name: option, exact: true }).click();
    };
    const saved = () =>
      page
        .locator(".keyboard-live-status")
        .getByText("Saved to keyboard", { exact: true })
        .waitFor();
    const writes = () =>
      page.evaluate(
        () =>
          window.__phase4.frames.filter((f) => [3, 5, 7].includes(f[0])).length,
      );
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    await select("Report rate", "4,000 Hz");
    const consent = page.getByRole("dialog", {
      name: "Allow keyboard writes?",
      exact: true,
    });
    await consent.waitFor();
    assert.equal(await writes(), 0);
    await consent.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(100);
    assert.equal(await writes(), 0);
    await select("Report rate", "2,000 Hz");
    await consent
      .getByRole("button", { name: "Allow writes", exact: true })
      .click();
    await saved();
    assert((await writes()) > 0);
    assert.equal(await consent.count(), 0);
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      window.__phase4.failPoll = true;
    });
    await select("Report rate", "8,000 Hz");
    const failure = page
      .locator(".keyboard-save-chip")
      .getByRole("button", { name: "Failed - Retry", exact: true });
    await failure.waitFor();
    if (width === 1100)
      await page.screenshot({ path: `${output}/1100-failed.png` });
    await failure.click();
    await saved();
    await page.getByRole("tab", { name: "Trigger", exact: true }).click();
    await page.getByText("Global dead zones", { exact: true }).click();
    const dead = page.getByRole("slider", {
      name: "Top dead zone",
      exact: true,
    });
    await dead.focus();
    await page.keyboard.press("ArrowRight");
    await saved();
    assert(
      (await page.evaluate(() => window.__phase4.frames)).some(
        (f) => f[0] === 3 && f[2] === 11,
      ),
    );
    await page.getByRole("tab", { name: "Lighting", exact: true }).click();
    await select("Effect", "Custom");
    await saved();
    const paint = page.getByRole("textbox", {
      name: "Paint color hex color",
      exact: true,
    });
    await paint.fill("#123456");
    await paint.press("Tab");
    await page
      .locator('.keyboard-stage-visual button[data-key-index="0"]')
      .click();
    await saved();
    const frames = await page.evaluate(() => window.__phase4.frames);
    assert(
      frames.some(
        (f) => f[0] === 7 && f[1] === 66 && f.slice(5, 8).join() === "18,52,86",
      ),
    );
    assert(frames.some((f) => f[0] === 3 && f[2] === 18));
    const chip=page.locator('.keyboard-stage-visual .keyboard-save-chip[data-state="saved"]');
    assert.equal(await chip.count(),1,"selected RGB key must have one receipt");
    assert.equal(await chip.evaluate(element=>getComputedStyle(element).color),await page.locator('.keyboard-title h1').evaluate(element=>getComputedStyle(element).color),"save status text must use the primary readable text color");
    if (width === 1440)
      await page.screenshot({ path: `${output}/1440-lighting.png` });
    const before = await writes();
    await page.getByRole("tab", { name: "Advanced", exact: true }).click();
    await page
      .getByRole("button", { name: "Add to selected key", exact: true })
      .click();
    await page.waitForTimeout(500);
    assert.equal(await writes(), before);
    assert(
      (await page.getByText(/Local only - not sent to device/).count()) > 0,
    );
    assert(!frames.some((f) => [13, 15, 19, 254].includes(f[0])));
    result.cases.push({
      width,
      consentCancelNoWrites: true,
      oneSessionConsent: true,
      readbackFailureRetry: true,
      deadZoneVerified: true,
      customColorCommitted: true,
      advancedLocalNoWrites: true,
      writes: await writes(),
      errors: 0,
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
