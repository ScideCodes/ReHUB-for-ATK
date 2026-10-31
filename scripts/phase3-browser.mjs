import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const output = "audit/phase3",
  url = "http://127.0.0.1:4183";
mkdirSync(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "4183",
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
    await new Promise((r) => setTimeout(r, 100));
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
      window.__phase3 = { frames: [], delayNext: 0, startedAt: 0 };
      const loaded = () =>
        Promise.all([
          import("/src/devices/keyboardSettings.ts"),
          import("/src/hid/testing/keyboardReply.ts"),
        ]);
      let defaults;
      Object.assign(device, {
        vendorId: 0x373b,
        productId: 0x1048,
        productName: "ATK68 V2 Pro phase3",
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
          const [settings, fixture] = await loaded();
          defaults ??= settings.createKeyboardSettings();
          const frame = new Uint8Array(bytes),
            reply = frame.slice();
          window.__phase3.frames.push({
            frame: [...frame],
            sent: performance.now(),
          });
          fixture.fillKeyboardBulkReply(frame, reply, defaults);
          if (frame[0] === 2 && frame[2] === 34) reply[3] = 4;
          if (frame[0] === 2 && frame[2] === 0) reply.set([3, 1], 5);
          if (frame[0] === 8) {
            reply[2] = 2;
            reply[4] = 128;
            reply[8] = 60;
          }
          const delay = window.__phase3.delayNext || 5;
          window.__phase3.delayNext = 0;
          setTimeout(
            () =>
              device.dispatchEvent(
                Object.assign(new Event("inputreport"), {
                  reportId,
                  data: new DataView(reply.buffer),
                }),
              ),
            delay,
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
    page.on("pageerror", (e) => result.errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") result.errors.push(m.text());
    });
    await page.goto(url, { waitUntil: "networkidle" });
    const name = await page.evaluate(async () => {
      const { ATK68 } = await import("/src/devices/registry.ts");
      return ATK68.name;
    });
    await page
      .getByRole("button", { name: "Connect device", exact: true })
      .click();
    const card = page.getByRole("button", {
      name: `Open ${name} settings`,
      exact: true,
    });
    await card.waitFor();
    await page.evaluate(() => {
      window.__phase3.startedAt = performance.now();
    });
    await card.click();
    await page.waitForFunction(
      () =>
        window.__phase3.frames.length >= 12 &&
        document.querySelector(".keyboard-stage")?.getAttribute("aria-busy") ===
          "false",
    );
    const first = await page.evaluate(() => ({
      frames: window.__phase3.frames.slice(0, 12),
      elapsed: performance.now() - window.__phase3.startedAt,
    }));
    assert(
      first.frames.every(({ frame }) => [2, 18].includes(frame[0])),
      "first view must be base plus selected key layer only",
    );
    await page.waitForFunction(() => window.__phase3.frames.length === 55);
    await page.waitForFunction(async () => {
      const { keyboardSession } = await import("/src/hid/keyboardClient.ts"),
        { ATK68 } = await import("/src/devices/registry.ts");
      return keyboardSession(ATK68).lastSnapshot?.unreadFields.length === 0;
    });
    await page.waitForTimeout(100);
    const checks = await page.evaluate(async () => {
      const {
        loadKeyboardSnapshot,
        saveKeyboardSnapshot,
        keyboardCacheIdentity,
      } = await import("/src/hid/keyboardSnapshotCache.ts");
      const { KeyboardClient, keyboardSession } =
          await import("/src/hid/keyboardClient.ts"),
        { ATK68 } = await import("/src/devices/registry.ts");
      const identity = keyboardCacheIdentity(
        {
          vendorId: 0x373b,
          productId: 0x1048,
          productName: "ATK68 V2 Pro phase3",
        },
        0xff60,
        0x61,
      );
      const saved = await loadKeyboardSnapshot(identity);
      if (!saved)
        throw Error("Missing persistent snapshot after idle completion");
      // Seed enough independent identities to exercise storage pruning in real IndexedDB.
      for (let i = 0; i < 18; i++)
        await saveKeyboardSnapshot(identity + i, saved);
      const count = await new Promise((resolve, reject) => {
        const open = indexedDB.open("atk-hub-keyboard-snapshots", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction("snapshots"),
            r = tx.objectStore("snapshots").count();
          r.onsuccess = () => resolve(r.result);
          tx.oncomplete = () => db.close();
        };
      });
      await saveKeyboardSnapshot(identity, saved);
      const clone = new KeyboardClient(ATK68);
      await clone.connect();
      const cached = clone.cachedSnapshot;
      const baseline = clone.lastSnapshot;
      let blocked = false;
      try {
        await clone.apply(saved.settings, () => {});
      } catch {
        blocked = true;
      }
      // It shares this fake physical device; leave closing to the retained UI session.
      return {
        count,
        cachedPolling: cached?.settings.pollingRate,
        baseline,
        blocked,
        savedUnread: saved.unreadFields,
        profile: keyboardSession(ATK68).lastReadProfile,
      };
    });
    assert.equal(checks.count, 16);
    assert.equal(checks.cachedPolling, 4000);
    assert.equal(checks.baseline, null);
    assert(checks.blocked);
    assert.deepEqual(checks.savedUnread, []);
    assert(
      (await page.evaluate(() => window.__phase3.frames)).every(({ frame }) =>
        [2, 8, 18].includes(frame[0]),
      ),
      "reads and cache restoration must never write",
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => {
      window.__phase3.delayNext = 1800;
    });
    await page
      .getByRole("button", { name: `Open ${name} settings`, exact: true })
      .click();
    await page
      .getByText(
        "Cached, refreshing · display only. Device writes require fresh reads.",
        { exact: true },
      )
      .waitFor();
    const cachedGuard = await page.evaluate(async () => {
      const { keyboardSession } = await import("/src/hid/keyboardClient.ts"),
        { ATK68 } = await import("/src/devices/registry.ts");
      return keyboardSession(ATK68).lastSnapshot === null;
    });
    assert(
      cachedGuard,
      "persistent data must never become a write baseline on reload",
    );
    if (width === 1440)
      await page.screenshot({ path: `${output}/1440-cached.png` });
    await page
      .getByText(
        "Cached, refreshing · display only. Device writes require fresh reads.",
        { exact: true },
      )
      .waitFor({ state: "hidden" });
    await page.waitForFunction(() => window.__phase3.frames.length === 55);
    await page.getByRole("tab", { name: "Trigger", exact: true }).click();
    await page.locator('.keyboard-stage[aria-busy="false"]').waitFor();
    if (width === 1100)
      await page.screenshot({ path: `${output}/1100-trigger.png` });
    result.cases.push({
      width,
      firstViewWallMs: Math.round(first.elapsed),
      firstViewFrames: first.frames.length,
      fullReadFrames: 55,
      persistentCache: true,
      storageEntries: checks.count,
      cachedBaselineBlocked: true,
      reloadDisplayOnly: true,
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
