import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const label = process.env.JUMP_LABEL ?? "after",
  output = "audit/open-jump",
  url = "http://127.0.0.1:4190";
mkdirSync(output, { recursive: true });
const source = readFileSync("scripts/phase4-browser.mjs", "utf8"),
  start = source.indexOf("await context.addInitScript("),
  end = source.indexOf("\n    const page =", start);
const keyboardSetup = source
  .slice(start, end)
  .trim()
  .replace(/^await context.addInitScript\(/, "")
  .replace(/\);$/, "")
  .replace(
    "Object.assign(hid, {",
    `window.__jumpDevice=device;window.__wire={frames:[],pending:0,last:performance.now()};const original=device.sendReport.bind(device);device.sendReport=async(id,bytes)=>{window.__wire.frames.push([...bytes]);window.__wire.pending++;window.__wire.last=performance.now();return original(id,bytes);};device.addEventListener("inputreport",()=>{window.__wire.pending=Math.max(0,window.__wire.pending-1);window.__wire.last=performance.now();});Object.assign(hid, {`,
  );
assert(start >= 0 && end > start, "Fake HID fixture initializer must exist");
assert(
  keyboardSetup.includes("window.__wire"),
  "Fake HID instrumentation must be installed",
);
assert(
  /\n\s*5,\s*\n\s*\);/.test(keyboardSetup),
  "Keyboard fixture must retain its measured reply delay",
);
const result = {
  label,
  fixtureReplyMs: { keyboard: 5, mouseExtra: 8 },
  physicalHardware: false,
  cases: [],
  errors: [],
};
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "4190",
    "--strictPort",
  ],
  { windowsHide: true, stdio: "ignore" },
);
let browser;
async function ready(page, kind, quiet = 2000) {
  await page.waitForFunction(
    ({ kind, quiet }) =>
      document.querySelector(".app-screen")?.dataset.screen === kind &&
      window.__wire.frames.length >= (kind === "keyboard" ? 65 : 1) &&
      window.__wire.pending === 0 &&
      performance.now() - window.__wire.last >= quiet,
    { kind, quiet },
    { timeout: 25000 },
  );
}
async function connectHome(page, color) {
  await page
    .getByRole("button", { name: "Connect device", exact: true })
    .click();
  await page.locator(".device-card-open").first().waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".device-home-card button")?.disabled,
  );
  const swatches = page.locator(
    '.device-home-connected [aria-label="Colorway"] button',
  );
  assert(
    (await swatches.count()) >= 3,
    "Fixture model must expose three source colorways",
  );
  await swatches.nth(color).click();
  await page.evaluate(() => document.fonts.ready);
}
async function open(page) {
  await page.locator(".device-card-open").first().click();
}
async function run(test) {
  const context = await browser.newContext({
    viewport: { width: test.width, height: test.width === 1440 ? 900 : 700 },
    colorScheme: test.theme,
    reducedMotion: "no-preference",
  });
  await context.addInitScript(
    ({ theme }) => {
      localStorage.setItem("atk-hub-theme", theme);
      window.__capture = {
        active: false,
        entries: [],
        timeline: [],
        start() {
          this.entries = [];
          this.timeline = [];
          this.started = performance.now();
          this.active = true;
        },
        stop() {
          this.active = false;
          return {
            entries: this.entries,
            timeline: this.timeline,
            duration: performance.now() - this.started,
          };
        },
      };
      const rect = (r) => ({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      });
      const name = (node) => {
        if (!node) return null;
        if (!(node instanceof Element))
          return (
            "#text@" +
            (node.parentElement
              ? node.parentElement.tagName.toLowerCase()
              : "detached")
          );
        let s = node.tagName.toLowerCase();
        if (node.id) s += "#" + node.id;
        else if (typeof node.className === "string")
          s +=
            "." + node.className.trim().split(/\s+/).filter(Boolean).join(".");
        return s;
      };
      new PerformanceObserver((list) => {
        if (!window.__capture.active) return;
        for (const entry of list.getEntries())
          window.__capture.entries.push({
            value: entry.value,
            hadRecentInput: entry.hadRecentInput,
            ms: entry.startTime - window.__capture.started,
            sources: entry.sources.map((source) => ({
              node: name(source.node),
              before: rect(source.previousRect),
              after: rect(source.currentRect),
            })),
          });
      }).observe({ type: "layout-shift", buffered: false });
      let previous = "";
      function sample() {
        if (window.__capture.active) {
          const state = [
            ...document.querySelectorAll(
              ".workspace-loading,.keyboard-layout,.keyboard-stage,.keyboard-stage-visual,.keyboard-matrix-viewport,.keyboard-matrix,.keyboard-device,.keyboard-tabs,.keyboard-read-placeholder,.keyboard-scroll-hint,#settings-editor",
            ),
          ].map((node) => {
            const css = getComputedStyle(node);
            return {
              node: name(node),
              rect: rect(node.getBoundingClientRect()),
              u: css.getPropertyValue("--u").trim(),
              columns: css.gridTemplateColumns,
              rows: css.gridTemplateRows,
              align: css.justifyContent,
              display: css.display,
              gutter: css.scrollbarGutter,
            };
          });
          const json = JSON.stringify(state);
          if (json !== previous && window.__capture.timeline.length < 240) {
            window.__capture.timeline.push({
              ms: performance.now() - window.__capture.started,
              state,
            });
            previous = json;
          }
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    },
    { theme: test.theme },
  );
  if (test.kind === "keyboard")
    await context.addInitScript({ content: `(${keyboardSetup})();` });
  else
    await context.addInitScript(() => {
      const device = {
        vendorId: 0x373b,
        productId: 0x11cc,
        productName: "Jump ZERO EX",
        opened: false,
        collections: [
          {
            usagePage: 0xff04,
            usage: 2,
            inputReports: [{ reportId: 8 }],
            outputReports: [{ reportId: 8 }],
          },
        ],
        oninputreport: null,
        async open() {
          this.opened = true;
        },
        async close() {
          this.opened = false;
        },
        async sendReport(id, bytes) {
          window.__wire.frames.push([...bytes]);
          window.__wire.pending++;
          window.__wire.last = performance.now();
          const { MockHidDevice } = await import("/src/mock/mockDevice.ts");
          this.mock ??= new MockHidDevice();
          this.mock.oninputreport = (event) => {
            window.__wire.pending = Math.max(0, window.__wire.pending - 1);
            window.__wire.last = performance.now();
            this.oninputreport?.(event);
          };
          await new Promise((resolve) => setTimeout(resolve, 8));
          await this.mock.sendReport(id, bytes);
        },
      };
      window.__jumpDevice = device;
      window.__wire = { frames: [], pending: 0, last: performance.now() };
      const hid = new EventTarget();
      hid.getDevices = async () => [device];
      hid.requestDevice = async () => [device];
      Object.defineProperty(navigator, "hid", {
        value: hid,
        configurable: true,
      });
    });
  const page = await context.newPage();
  if (process.env.JUMP_SKELETON === "1") {
    await page.route(
      test.kind === "keyboard"
        ? "**/src/ui/keyboard/KeyboardWorkspace.tsx"
        : "**/src/ui/MouseWorkspace.tsx",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        await route.continue();
      },
    );
  }

  page.on("pageerror", (error) =>
    result.errors.push({ ...test, message: error.message }),
  );
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await connectHome(page, test.color);
    if (test.cached) {
      await open(page);
      await ready(page, test.kind, 200);
      if (test.kind === "keyboard") {
        await page.waitForFunction(
          async () => {
            const { keyboardCacheIdentity, loadKeyboardSnapshot } =
              await import("/src/hid/keyboardSnapshotCache.ts");
            return !!(await loadKeyboardSnapshot(
              keyboardCacheIdentity(window.__jumpDevice, 0xff60, 0x61),
            ));
          },
          undefined,
          { timeout: 5000 },
        );
      }
      await page
        .getByRole("button", { name: "Back to device list", exact: true })
        .click();
      if (test.kind === "keyboard") {
        await page.reload({ waitUntil: "networkidle" });
        await connectHome(page, test.color);
      }
    }
    const homeViewportWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    const colorway = await page
      .locator("html")
      .getAttribute("data-colorway-hex");
    await page.evaluate(() => {
      window.__wire.frames = [];
      window.__capture.start();
    });
    await open(page);
    const geometry = async () =>
      page.evaluate((kind) => {
        const grid = document.querySelector(
          kind === "keyboard" ? ".keyboard-layout" : ".lg-workspace",
        );
        const tabs = document.querySelector(
          kind === "keyboard" ? ".keyboard-tabs" : ".lg-tabs",
        );
        return {
          width: grid.offsetWidth,
          height: grid.offsetHeight,
          columns: getComputedStyle(grid).gridTemplateColumns,
          rows: getComputedStyle(grid).gridTemplateRows,
          tabsHeight: tabs.offsetHeight,
          tabsCount: tabs.children.length,
        };
      }, test.kind);
    let loadingGeometry;
    if (process.env.JUMP_SKELETON === "1") {
      await page.locator(".workspace-loading").waitFor();
      loadingGeometry = await geometry();
    }
    await ready(page, test.kind);
    const finalGeometry = await geometry();
    if (loadingGeometry)
      assert.deepEqual(
        loadingGeometry,
        finalGeometry,
        "Loading shell must match final grid and tabs",
      );
    await page.waitForTimeout(50);
    if (
      label === "after" &&
      test.kind === "keyboard" &&
      ((test.width === 1440 &&
        test.theme === "dark" &&
        test.color === 0 &&
        !test.cached) ||
        (test.width === 900 &&
          test.theme === "light" &&
          test.color === 2 &&
          test.cached))
    ) {
      await page.screenshot({
        path: `${output}/after-${test.width}-${test.theme}.png`,
      });
    }
    const measured = await page.evaluate(() => ({
      ...window.__capture.stop(),
      viewportWidth: document.documentElement.clientWidth,
      gutters: [
        ...document.querySelectorAll(
          ".keyboard-scroll,.keyboard-stage-settings,.keyboard-stage-visual,.keyboard-matrix-viewport",
        ),
      ].map((node) => getComputedStyle(node).scrollbarGutter),
      frames: window.__wire.frames.length,
      finishTheme: document.documentElement.dataset.theme,
      finishColor: document.documentElement.dataset.colorwayHex,
      screen: document.querySelector(".app-screen")?.dataset.screen,
    }));
    assert.equal(
      measured.viewportWidth,
      homeViewportWidth,
      "Home and workspace must retain viewport width",
    );
    assert(
      measured.gutters.every((value) => value === "auto"),
      "Hidden keyboard scrollbars must not reserve empty gutters",
    );
    assert.equal(measured.screen, test.kind);
    assert.equal(measured.finishTheme, test.theme);
    assert.equal(measured.finishColor, colorway);
    const cls = measured.entries
        .filter((entry) => !entry.hadRecentInput)
        .reduce((sum, entry) => sum + entry.value, 0),
      allShifts = measured.entries.reduce((sum, entry) => sum + entry.value, 0),
      maxSingle = Math.max(0, ...measured.entries.map((entry) => entry.value));
    result.cases.push({
      ...test,
      colorway,
      loadingGeometry,
      finalGeometry,
      cls,
      allShifts,
      maxSingle,
      ...measured,
    });
    console.log(
      `${label} ${test.kind} ${test.width} ${test.theme} color${test.color} cache${test.cached}: CLS=${cls.toFixed(5)} all=${allShifts.toFixed(5)} max=${maxSingle.toFixed(5)}`,
    );
    if (label !== "before" || process.env.JUMP_ASSERT === "1") {
      assert(allShifts < 0.02, `Open-flow shifts ${allShifts} >= .02`);
      assert(maxSingle < 0.01, `Single shift ${maxSingle} >= .01`);
    }
  } catch (error) {
    result.errors.push({ ...test, message: error.stack ?? String(error) });
    console.error(`${test.kind}/${test.width}: ${error.message}`);
  } finally {
    await context.close();
  }
}
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
  let cases = [];
  for (const width of [1440, 1100, 900])
    for (const theme of ["dark", "light"])
      for (const color of [0, 1, 2])
        for (const cached of [false, true])
          for (const kind of ["keyboard", "mouse"])
            cases.push({ width, theme, color, cached, kind });
  if (process.env.JUMP_SKELETON === "1")
    cases = cases.filter(
      (test) => !test.cached && test.color === 0 && test.theme === "dark",
    );
  if (process.env.JUMP_LIMIT)
    cases = cases.slice(0, Number(process.env.JUMP_LIMIT));
  if (process.env.JUMP_WIDTH)
    cases = cases.filter(
      (test) => test.width === Number(process.env.JUMP_WIDTH),
    );
  const queue = [...cases];
  await Promise.all(
    [0, 1, 2].map(async () => {
      while (queue.length) await run(queue.shift());
    }),
  );
  assert.equal(
    result.cases.length,
    cases.length,
    "Every layout case must finish",
  );
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  console.log(
    `Open-flow CLS: ${result.cases.length} cases pass; max total=${Math.max(...result.cases.map((test) => test.allShifts)).toFixed(8)}, max single=${Math.max(...result.cases.map((test) => test.maxSingle)).toFixed(8)}`,
  );
} catch (error) {
  result.errors.push({ message: error.stack ?? String(error) });
  process.exitCode = 1;
} finally {
  writeFileSync(`${output}/${label}.json`, JSON.stringify(result, null, 2));
  await browser?.close();
  if (process.platform === "win32")
    spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else server.kill();
}
