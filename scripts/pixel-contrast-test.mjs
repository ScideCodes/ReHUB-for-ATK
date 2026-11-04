import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { resolve } from "node:path";

const PORT = 4178;
const URL = `http://127.0.0.1:${PORT}`;
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "compact", width: 1100, height: 700 },
  { name: "narrow", width: 900, height: 700 },
];

const COLORWAYS = [
  { name: "grey", hex: "#808080" },
  { name: "white", hex: "#FFFFFF" },
  { name: "saturated", hex: "#E0570E" },
  { name: "blue", hex: "#1D9BF6", desktopOnly: true },
  { name: "mint", hex: "#06E0B8", desktopOnly: true },
];

const THEMES = ["dark", "light"];

const label = process.env.CONTRAST_LABEL ?? "after";
const output = resolve("audit/theme-cleanup");
mkdirSync(output, { recursive: true });
const rootDir = resolve(import.meta.dirname, "..");
mkdirSync(resolve(rootDir, "shots"), { recursive: true });
mkdirSync(resolve(rootDir, "audit"), { recursive: true });

const server = spawn(
  process.execPath,
  [
    resolve(rootDir, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(PORT),
    "--strictPort",
  ],
  {
    cwd: rootDir,
    windowsHide: true,
    stdio: "ignore",
  },
);

function stopServer() {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    server.kill();
  }
}

process.on("exit", stopServer);
process.on("SIGINT", () => {
  stopServer();
  process.exit(1);
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(URL);
      if (res.ok) return;
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Server failed to start on " + URL);
}

async function evaluatePixelContrast(page) {
  // 1. Gather all visible text elements
  const textNodesInfo = await page.evaluate(() => {
    const results = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    let node;
    let id = 0;
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim();
      if (!text) continue;
      const el = node.parentElement;
      if (
        !el ||
        el.closest(
          "button:disabled,input:disabled,fieldset:disabled,[aria-disabled=true]",
        )
      )
        continue;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
        continue;
      if (el.closest(".hub-sr-only") || el.closest('[aria-hidden="true"]'))
        continue;
      const style = window.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        parseFloat(style.opacity) === 0
      )
        continue;

      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width <= 4 || rect.height <= 4) continue;
      // Skip off-screen or obscured
      if (
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth
      )
        continue;

      let parent = el.parentElement;
      let clipped = false;
      while (parent && parent !== document.body) {
        const pStyle = window.getComputedStyle(parent);
        const overflow = pStyle.overflow + pStyle.overflowX + pStyle.overflowY;
        if (/auto|hidden|scroll/.test(overflow)) {
          const pRect = parent.getBoundingClientRect();
          if (
            rect.bottom <= pRect.top + 2 ||
            rect.top >= pRect.bottom - 2 ||
            rect.right <= pRect.left + 2 ||
            rect.left >= pRect.right - 2
          ) {
            clipped = true;
            break;
          }
        }
        parent = parent.parentElement;
      }
      if (clipped) continue;

      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const topEl = document.elementFromPoint(cx, cy);
      if (topEl && !el.contains(topEl) && !topEl.contains(el)) continue;

      const fontSize = parseFloat(style.fontSize);
      const fontWeight = parseInt(style.fontWeight) || 400;
      const isLarge =
        fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      const minRatio = isLarge ? 3.0 : 4.5;

      let textColor = style.color;
      if (el instanceof SVGElement || el.tagName.toLowerCase() === "text") {
        if (style.fill && style.fill !== "none") {
          textColor = style.fill;
        }
      }

      el.setAttribute("data-contrast-target", String(id));
      results.push({
        id,
        tag: el.tagName.toLowerCase(),
        classes: el.className ? String(el.className).slice(0, 40) : "",
        text: text.slice(0, 30),
        color: textColor,
        opacity: (() => {
          let value = 1,
            item = el;
          while (item) {
            value *= Number(getComputedStyle(item).opacity);
            item = item.parentElement;
          }
          return value;
        })(),
        fontSize,
        fontWeight,
        isLarge,
        minRatio,
        x: Math.max(0, Math.round(rect.x)),
        y: Math.max(0, Math.round(rect.y)),
        width: Math.min(
          window.innerWidth - Math.max(0, Math.round(rect.x)),
          Math.round(rect.width),
        ),
        height: Math.min(
          window.innerHeight - Math.max(0, Math.round(rect.y)),
          Math.round(rect.height),
        ),
      });
      id++;
    }
    return results;
  });

  if (!textNodesInfo.length) return [];

  // 2. Hide text temporarily to capture backdrop pixels
  await page.evaluate(() => {
    const styleEl = document.createElement("style");
    styleEl.id = "contrast-hide-text";
    styleEl.textContent =
      "[data-contrast-target] { color: transparent !important; fill: transparent !important; }";
    document.head.appendChild(styleEl);
  });

  // Capture backdrop screenshot as base64
  const screenshotBuffer = await page.screenshot();
  const base64Image = screenshotBuffer.toString("base64");

  // Remove hiding style
  await page.evaluate(() => {
    document.getElementById("contrast-hide-text")?.remove();
    document
      .querySelectorAll("[data-contrast-target]")
      .forEach((e) => e.removeAttribute("data-contrast-target"));
  });

  // 3. Sample backdrop pixels inside browser canvas
  const contrastResults = await page.evaluate(
    async ({ base64, targets }) => {
      const img = new Image();
      await new Promise((res) => {
        img.onload = res;
        img.src = "data:image/png;base64," + base64;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      const toLinear = (c) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };

      const lum = (r, g, b) =>
        0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
      const ratio = (l1, l2) =>
        (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

      const colorCanvas = document.createElement("canvas");
      colorCanvas.width = colorCanvas.height = 1;
      const colorContext = colorCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      return targets.map((t) => {
        colorContext.clearRect(0, 0, 1, 1);
        colorContext.fillStyle = t.color;
        colorContext.fillRect(0, 0, 1, 1);
        const foreground = colorContext.getImageData(0, 0, 1, 1).data;
        const alpha = (foreground[3] / 255) * t.opacity;
        // sample 9 points inside bounding box: corners, edges, center with safe inset from outer radius
        const insetX = Math.max(3, Math.min(8, Math.floor(t.width * 0.15)));
        const insetY = Math.max(2, Math.min(6, Math.floor(t.height * 0.2)));
        const points = [
          [t.x + insetX, t.y + insetY],
          [t.x + Math.floor(t.width / 2), t.y + insetY],
          [t.x + t.width - insetX, t.y + insetY],
          [t.x + insetX, t.y + Math.floor(t.height / 2)],
          [t.x + Math.floor(t.width / 2), t.y + Math.floor(t.height / 2)],
          [t.x + t.width - insetX, t.y + Math.floor(t.height / 2)],
          [t.x + insetX, t.y + t.height - insetY],
          [t.x + Math.floor(t.width / 2), t.y + t.height - insetY],
          [t.x + t.width - insetX, t.y + t.height - insetY],
        ];

        let minContrast = Infinity;
        let worstPixel = null;
        for (const [px, py] of points) {
          if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height)
            continue;
          const pixel = ctx.getImageData(px, py, 1, 1).data;
          const bgLum = lum(pixel[0], pixel[1], pixel[2]);
          const textLum = lum(
            ...[0, 1, 2].map(
              (i) => foreground[i] * alpha + pixel[i] * (1 - alpha),
            ),
          );
          const r = ratio(textLum, bgLum);
          if (r < minContrast) {
            minContrast = r;
            worstPixel = [pixel[0], pixel[1], pixel[2]];
          }
        }

        return {
          ...t,
          contrast: Math.round(minContrast * 100) / 100,
          pass: minContrast >= t.minRatio,
          worstPixel,
        };
      });
    },
    { base64: base64Image, targets: textNodesInfo },
  );

  return contrastResults;
}

async function run() {
  await waitForServer();
  const browser = await chromium.launch();
  const failures = [],
    summaryRows = [],
    errors = [];
  try {
    for (const size of VIEWPORTS)
      for (const theme of THEMES)
        for (const colorway of COLORWAYS) {
          if (colorway.desktopOnly && size.width !== 1440) continue;
          if (
            process.env.CONTRAST_SMOKE &&
            (size.width !== 1440 ||
              theme !==
                (process.env.CONTRAST_SMOKE === "dark" ? "dark" : "light") ||
              colorway.name !== "white")
          )
            continue;
          const context = await browser.newContext({
            viewport: { width: size.width, height: size.height },
            reducedMotion: "reduce",
            colorScheme: theme,
          });
          const page = await context.newPage();
          page.on("pageerror", (error) => errors.push(error.message));
          page.on("console", (message) => {
            if (message.type() === "error") errors.push(message.text());
          });
          await page.addInitScript(
            ({ theme }) => localStorage.setItem("atk-hub-theme", theme),
            { theme },
          );
          await page.goto(URL, { waitUntil: "networkidle" });
          await page.addStyleTag({
            content:
              "*,*::before,*::after{animation:none!important;transition:none!important}",
          });
          if (summaryRows.length === 0) {
            await page.evaluate(() => {
              const probe = document.createElement("span");
              probe.id = "pixel-probe";
              probe.textContent = "A";
              probe.style.cssText =
                "position:fixed;top:100px;left:16px;font-size:14px;font-weight:400;color:rgb(255,255,255);background:rgb(255,255,255);z-index:99999";
              document.body.append(probe);
            });
            let probe = (await evaluatePixelContrast(page)).find(
              (item) => item.text === "A",
            );
            assert(
              probe && !probe.pass && probe.contrast === 1,
              "Pixel probe must reject identical colors",
            );
            await page
              .locator("#pixel-probe")
              .evaluate((el) => (el.style.color = "rgb(0,0,0)"));
            probe = (await evaluatePixelContrast(page)).find(
              (item) => item.text === "A",
            );
            assert(
              probe?.pass && probe.contrast === 21,
              "Pixel probe must accept 21:1 contrast",
            );
            await page
              .locator("#pixel-probe")
              .evaluate((el) => (el.style.color = "rgba(0,0,0,.3)"));
            probe = (await evaluatePixelContrast(page)).find(
              (item) => item.text === "A",
            );
            assert(
              probe && !probe.pass,
              "Pixel probe must composite translucent text",
            );
            await page.locator("#pixel-probe").evaluate((el) => el.remove());
          }
          const paint = async () => {
            await page.evaluate(
              async ({ theme, hex }) => {
                const { setTheme } = await import("/src/ui/useTheme.ts");
                const { applyColorwayHex } =
                  await import("/src/ui/colorPalette.ts");
                setTheme(theme);
                applyColorwayHex(hex);
                await document.fonts.ready;
              },
              { theme, hex: colorway.hex },
            );
            await page.waitForTimeout(40);
          };
          const scan = async (screen, expected) => {
            await paint();
            assert.equal(
              await page.locator(".app-screen").getAttribute("data-screen"),
              expected,
            );
            assert.equal(
              await page.locator("html").getAttribute("data-theme"),
              theme,
            );
            assert.equal(
              await page.locator("html").getAttribute("data-colorway-hex"),
              colorway.hex,
            );
            const results = await evaluatePixelContrast(page);
            assert(results.length > 0, `${screen} must contain visible text`);
            const state = {
              screen,
              theme,
              colorway: colorway.name,
              hex: colorway.hex,
              width: size.width,
            };
            failures.push(
              ...results
                .filter((r) => !r.pass)
                .map((r) => ({
                  ...r,
                  textWidth: r.width,
                  textHeight: r.height,
                  ...state,
                })),
            );
            summaryRows.push({
              ...state,
              nodesChecked: results.length,
              minContrast: Math.min(...results.map((r) => r.contrast)),
              pass: results.every((r) => r.pass),
            });
            console.log(
              `${screen} ${size.width} ${theme} ${colorway.name}: ${results.filter((r) => !r.pass).length} failures / ${results.length} text nodes`,
            );
            if (
              label === "after" &&
              ((screen === "Keyboard/Lighting" &&
                size.width === 900 &&
                theme === "light" &&
                colorway.name === "white") ||
                (screen === "Mouse/Power" &&
                  size.width === 1440 &&
                  theme === "dark" &&
                  colorway.name === "grey"))
            ) {
              await page.screenshot({
                path: `${output}/${screen.startsWith("Mouse") ? "mouse-dark-1440" : "keyboard-light-900"}.png`,
              });
            }
          };
          const openMock = async (model) => {
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
              .getByRole("option", { name: model, exact: true })
              .click();
            await picker
              .getByRole("button", { name: "Mock device", exact: true })
              .click();
            await picker.waitFor({ state: "hidden" });
            await page.getByRole("tablist").waitFor();
          };
          await scan("Home/Disconnected", "home");
          await openMock("ATK 68 V2 Pro");
          for (const tab of [
            "Keys",
            "Trigger",
            "Lighting",
            "Advanced",
            "Macros",
            "Settings",
          ]) {
            await page.getByRole("tab", { name: tab, exact: true }).click();
            await scan(`Keyboard/${tab}`, "keyboard");
          }
          const expand = page.getByRole("button", {
            name: "Expand maps",
            exact: true,
          });
          if (await expand.isVisible()) await expand.click();
          await scan("Keyboard/Maps", "keyboard");
          await page
            .getByRole("button", { name: "Diagnostics", exact: true })
            .click();
          await page
            .getByRole("dialog", { name: "Diagnostics", exact: true })
            .waitFor();
          await scan("Keyboard/Diagnostics", "keyboard");
          await page
            .getByRole("dialog")
            .getByRole("button", { name: "Close", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Back to device list", exact: true })
            .click();
          await scan("Home/Saved", "home");
          await openMock("ATK Frost Zero Extreme");
          // Original driver's mouse sections (Power lives in Parameter Settings).
          for (const tab of [
            "Key Change Settings",
            "Macro Settings",
            "DPI Settings",
            "Performance Settings",
            "Parameter Settings",
            "Lighting Settings",
            "Configuration Management",
            "Other settings",
          ]) {
            await page.getByRole("tab", { name: tab, exact: true }).click();
            await scan(`Mouse/${tab}`, "mouse");
          }
          await page
            .getByRole("button", { name: "Manage maps", exact: true })
            .filter({ visible: true })
            .first()
            .click();
          await scan("Mouse/Maps", "mouse");
          await page
            .getByRole("button", { name: "Diagnostics", exact: true })
            .click();
          await page
            .getByRole("dialog", { name: "Diagnostics", exact: true })
            .waitFor();
          await scan("Mouse/Diagnostics", "mouse");
          await context.close();
        }
    // 20 screens per run: home, keyboard tabs, 8 mouse sections (original sidebar), maps, diagnostics.
    const expected = process.env.CONTRAST_SMOKE ? 20 : 22 * 20;
    assert.equal(
      summaryRows.length,
      expected,
      "Every intended screen must be inspected",
    );
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log(
      `Pixel contrast: ${summaryRows.length} states; ${failures.length} failing text nodes`,
    );
    if (failures.length && label !== "before") process.exitCode = 1;
  } finally {
    writeFileSync(
      `${output}/contrast-${label}.json`,
      JSON.stringify({ summaryRows, failures, errors }, null, 2),
    );
    await browser.close();
    stopServer();
  }
}
run().catch((error) => {
  console.error(error);
  stopServer();
  process.exitCode = 1;
});
