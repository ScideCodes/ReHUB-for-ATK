import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const label = process.env.GRAPH_LABEL ?? "after",
  out = "audit/key-graph",
  url = "http://127.0.0.1:4192";
mkdirSync(out, { recursive: true });
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "4192",
    "--strictPort",
  ],
  { windowsHide: true, stdio: "ignore" },
);
const result = { cases: [], panels: [], scroll: [], errors: [] };
let browser;
async function wheel(page, selector) {
  const el = page.locator(selector);
  if (
    !(await el.evaluate(
      (node) =>
        node.scrollHeight > node.clientHeight + 1 &&
        ["auto", "scroll"].includes(getComputedStyle(node).overflowY),
    ))
  )
    return false;
  await el.evaluate((node) => (node.scrollTop = 0));
  const box = await el.boundingBox();
  await page.mouse.move(
    box.x + box.width / 2,
    box.y + Math.min(30, box.height / 2),
  );
  await page.mouse.wheel(0, 300);
  await page.waitForFunction(
    (selector) => document.querySelector(selector).scrollTop > 0,
    selector,
  );
  return true;
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Wait for Vite. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
  for (const width of [900, 1100, 1440, 1920])
    for (const theme of ["dark", "light"]) {
      const context = await browser.newContext({
        viewport: { width, height: width <= 1100 ? 700 : 900 },
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => result.errors.push(error.message));
      await page.addInitScript(
        (theme) => localStorage.setItem("atk-hub-theme", theme),
        theme,
      );
      await page.goto(url, { waitUntil: "networkidle" });
      if (label === "after") {
        await page.setViewportSize({ width, height: 260 });
        assert(
          await wheel(page, ".device-home"),
          "Home content must remain wheel-scrollable",
        );
        result.scroll.push({ width, theme, kind: "Home wheel", pass: true });
        await page.setViewportSize({
          width,
          height: width <= 1100 ? 700 : 900,
        });
      }
      const homeBar = await page
        .locator(".device-home")
        .evaluate((el) => getComputedStyle(el).scrollbarWidth);
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
      await page
        .getByRole("option", { name: "ATK 68 V2 Pro", exact: true })
        .click();
      await picker
        .getByRole("button", { name: "Mock device", exact: true })
        .click();
      await page.locator(".keyboard-workspace").waitFor();
      await page.evaluate(() => document.fonts.ready);
      for (const tab of ["Keys", "Lighting", "Advanced"]) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        const graph = page.locator(".keyboard-matrix-viewport");
        await graph.waitFor({ state: "attached" });
        // Key floor is 34px, or the stage's --key-min (30px on dense desktop tabs, user-approved).
        const floor = await page.evaluate(
          () =>
            parseFloat(
              getComputedStyle(
                document.querySelector(".keyboard-matrix-viewport") ??
                  document.body,
              ).getPropertyValue("--key-min"),
            ) || 34,
        );
        await page.waitForFunction(
          (floor) =>
            document
              .querySelector(".keyboard-keyrow button")
              ?.getBoundingClientRect().width >=
            floor - 0.1,
          floor,
        );
        const metrics = await graph.evaluate(async (viewport) => {
          const { KEY_LAYOUT } =
            await import("/src/devices/keyboardSettings.ts");
          const css = getComputedStyle(viewport),
            content =
              viewport.clientWidth -
              parseFloat(css.paddingLeft) -
              parseFloat(css.paddingRight);
          const fit = Math.min(
            ...KEY_LAYOUT.map(
              (row) =>
                (content - 8 * (row.length - 1)) /
                row.reduce(
                  (sum, key) =>
                    sum + (key.w ?? 1) + (key.ml ?? 0) + (key.mr ?? 0),
                  0,
                ),
            ),
          );
          const keys = [...viewport.querySelectorAll("button[data-key-index]")];
          const units = keys.map(
            (el) =>
              el.getBoundingClientRect().width /
              Number(el.style.getPropertyValue("--key-w")),
          );
          const clipped = keys.flatMap((el) => {
            const text = el.querySelector(".keyboard-key-label");
            const box = el.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(text);
            const r = range.getBoundingClientRect();
            return r.left < box.left + 1 ||
              r.right > box.right - 1 ||
              r.top < box.top + 1 ||
              r.bottom > box.bottom - 1 ||
              (text.scrollWidth > text.clientWidth + 1 && text.clientWidth > 0)
              ? [el.title]
              : [];
          });
          return {
            fit,
            unit: Math.min(...units),
            keyCount: keys.length,
            clipped,
            content,
            scrollWidth: viewport.scrollWidth,
            clientWidth: viewport.clientWidth,
            bar: css.scrollbarWidth,
            container: css.containerType,
            bars: [
              ...document.querySelectorAll(
                ".keyboard-scroll,.keyboard-stage-settings,.keyboard-stage-visual,.keyboard-device,.keyboard-maplist",
              ),
            ].map((el) => ({
              node: el.className,
              bar: getComputedStyle(el).scrollbarWidth,
              webkit: getComputedStyle(el, "::-webkit-scrollbar").display,
            })),
            visual: document
              .querySelector(".keyboard-stage-visual")
              .getBoundingClientRect()
              .toJSON(),
          };
        });
        const checks = {
          minimum: metrics.unit >= floor - 0.1,
          fills: Math.abs(metrics.unit - Math.max(floor, metrics.fit)) < 0.2,
          sourceLayout: metrics.keyCount === 67,
          labels: metrics.clipped.length === 0,
          fit:
            metrics.fit < 34 || metrics.scrollWidth <= metrics.clientWidth + 1,
          bars:
            homeBar === "none" &&
            metrics.bar === "none" &&
            metrics.bars.every(
              (item) => item.bar === "none" && item.webkit === "none",
            ),
          container: metrics.container === "inline-size",
        };
        result.cases.push({ width, theme, tab, ...metrics, checks });
        console.log(
          `${label} ${width} ${theme} ${tab}: unit=${metrics.unit.toFixed(2)} clip=${metrics.clipped.join(",") || "none"} checks=${JSON.stringify(checks)}`,
        );
        if (
          label === "after" &&
          width === 1100 &&
          theme === "light" &&
          tab === "Lighting"
        )
          await page
            .getByRole("button", { name: "Show preview", exact: true })
            .click();
        if (
          (width === 1440 && theme === "dark" && tab === "Keys") ||
          (width === 1100 && theme === "light" && tab === "Lighting")
        )
          await page.screenshot({
            path: `${out}/${label}-${tab.toLowerCase()}-${width}-${theme}.png`,
          });
        if (label === "after") {
          const visual = page.locator(".keyboard-stage-visual");
          const overflow = await visual.evaluate(
            (el) =>
              el.scrollHeight > el.clientHeight + 1 &&
              getComputedStyle(el).overflowY === "auto",
          );
          if (overflow) {
            await visual.evaluate((el) => (el.scrollTop = 0));
            const box = await visual.boundingBox();
            await page.mouse.move(
              box.x + box.width / 2,
              box.y + Math.min(box.height / 2, 40),
            );
            await page.mouse.wheel(0, 400);
            await page.waitForFunction(
              () =>
                document.querySelector(".keyboard-stage-visual").scrollTop > 0,
            );
            result.scroll.push({
              width,
              theme,
              tab,
              kind: "wheel",
              pass: true,
            });
          }
        }
      }
      for (const expanded of width === 900 ? [false, true] : [width > 1100]) {
        if (width === 900 && expanded)
          await page
            .getByRole("button", { name: "Expand maps", exact: true })
            .click();
        for (const tab of [
          "Keys",
          "Trigger",
          "Lighting",
          "Advanced",
          "Macros",
          "Settings",
        ]) {
          await page.getByRole("tab", { name: tab, exact: true }).click();
          const panel = await page
            .locator(".keyboard-editor-sheet")
            .evaluate((sheet) => {
              const content = sheet.querySelector(".keyboard-scroll");
              const bounds = content.getBoundingClientRect();
              const controls = sheet.querySelector(".keyboard-stage-settings");
              const matrix = sheet.querySelector(".keyboard-matrix-viewport");
              return {
                height: bounds.height,
                pageFits:
                  document.documentElement.scrollHeight <= innerHeight + 1 &&
                  document.documentElement.scrollWidth <= innerWidth + 1,
                contentFits: content.scrollWidth <= content.clientWidth + 1,
                controlsFit: controls.scrollWidth <= controls.clientWidth + 1,
                keyboardVisible:
                  !matrix ||
                  (matrix.getBoundingClientRect().top >= bounds.top - 1 &&
                    matrix.getBoundingClientRect().bottom <= bounds.bottom + 1),
                barsHidden: [
                  ...document.querySelectorAll(
                    ".keyboard-workspace, .keyboard-workspace *",
                  ),
                ].every(
                  (el) =>
                    getComputedStyle(el).scrollbarWidth === "none" &&
                    getComputedStyle(el, "::-webkit-scrollbar").display ===
                      "none",
                ),
              };
            });
          result.panels.push({ width, theme, expanded, tab, ...panel });
          if (label === "after") {
            assert(
              panel.pageFits &&
                panel.contentFits &&
                panel.controlsFit &&
                panel.height >= 160 &&
                panel.barsHidden,
              JSON.stringify({ width, theme, tab, ...panel }),
            );
            if (
              (!expanded &&
                width <= 1100 &&
                ["Keys", "Trigger"].includes(tab)) ||
              (width >= 1440 && tab === "Keys")
            )
              assert(
                panel.keyboardVisible,
                `${tab} keyboard must fit on compact entry`,
              );
          }
        }
      }
      if (width === 900)
        await page
          .getByRole("button", { name: "Collapse maps", exact: true })
          .click();
      await page.getByRole("tab", { name: "Advanced", exact: true }).click();
      if (label === "after") {
        const viewport = page.locator(".keyboard-matrix-viewport");
        await viewport.evaluate((el) => {
          el.style.width = "360px";
          el.style.maxWidth = "100%";
        });
        await page.waitForFunction(
          () =>
            document.querySelector(".keyboard-matrix-viewport").scrollWidth >
            document.querySelector(".keyboard-matrix-viewport").clientWidth,
        );
        const narrow = await viewport.evaluate((el) => ({
          unit: el.querySelector("button").getBoundingClientRect().width,
          overflow: el.scrollWidth > el.clientWidth,
          clipped: [...el.querySelectorAll(".keyboard-key-label")].filter(
            (label) =>
              label.scrollWidth > label.clientWidth + 1 ||
              label.scrollHeight > label.clientHeight + 1,
          ).length,
        }));
        const narrowFloor =
          parseFloat(
            await viewport.evaluate((el) =>
              getComputedStyle(el).getPropertyValue("--key-min"),
            ),
          ) || 34;
        assert(
          Math.abs(narrow.unit - narrowFloor) < 0.1 &&
            narrow.overflow &&
            narrow.clipped === 0,
          "Narrow layouts keep floor-size keys and readable labels",
        );
        await page.locator(".keyboard-keyrow button").last().focus();
        assert(
          await viewport.evaluate((el) => el.scrollLeft > 0),
          "Focusing the last key must reveal it",
        );
        result.scroll.push({
          width,
          theme,
          kind: "narrow horizontal + focus",
          unit: narrow.unit,
          clipped: narrow.clipped,
          pass: true,
        });
        await viewport.evaluate((el) => {
          el.style.removeProperty("width");
          el.style.removeProperty("max-width");
        });
      }
      if (label === "after") {
        for (const selector of [".keyboard-scroll", ".keyboard-stage-settings"])
          if (await wheel(page, selector))
            result.scroll.push({
              width,
              theme,
              kind: selector + " wheel",
              pass: true,
            });
        for (let i = 0; i < 12; i++)
          await page
            .getByRole("button", { name: "New map", exact: true })
            .click();
        assert(
          await wheel(page, ".keyboard-maplist"),
          "Map list must remain wheel-scrollable",
        );
        await page
          .locator(".keyboard-maplist")
          .evaluate((el) => (el.scrollTop = 0));
        await page.locator(".keyboard-map-select").last().focus();
        assert(
          await page
            .locator(".keyboard-maplist")
            .evaluate((el) => el.scrollTop > 0),
          "Map focus must reveal the last row",
        );
        result.scroll.push({
          width,
          theme,
          kind: "Maps wheel + focus",
          pass: true,
        });
        const toggle = page.locator(
          '.keyboard-device-toggle[aria-expanded="false"]',
        );
        if (await toggle.isVisible()) await toggle.click();
        if (await wheel(page, ".keyboard-device"))
          result.scroll.push({
            width,
            theme,
            kind: "Device wheel",
            pass: true,
          });
        assert(
          await page.evaluate(
            () => document.documentElement.scrollHeight <= innerHeight + 1,
          ),
          "Only pane content should scroll",
        );
      }
      await context.close();
    }
  assert.equal(result.cases.length, 24);
  assert.equal(result.panels.length, 60);
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  for (const row of result.cases)
    assert(Object.values(row.checks).every(Boolean), JSON.stringify(row));
  for (const theme of ["dark", "light"])
    for (const tab of ["Keys", "Lighting", "Advanced"])
      assert(
        result.cases.find(
          (c) => c.width === 1920 && c.theme === theme && c.tab === tab,
        ).unit >
          result.cases.find(
            (c) => c.width === 1440 && c.theme === theme && c.tab === tab,
          ).unit,
        "Wider stages must grow keys",
      );
  console.log(
    `Key graph: 24 cases and 60 tab panels pass; ${result.scroll.length} scroll/focus checks pass`,
  );
} catch (error) {
  result.errors.push(error.stack ?? String(error));
  process.exitCode = 1;
} finally {
  writeFileSync(`${out}/${label}.json`, JSON.stringify(result, null, 2));
  await browser?.close();
  if (process.platform === "win32")
    spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else server.kill();
}
