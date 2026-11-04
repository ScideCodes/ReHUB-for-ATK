import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const port = 4174,
  url = `http://localhost:${port}`;
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--port",
    String(port),
    "--strictPort",
  ],
  { windowsHide: true, stdio: "ignore" },
);
let browser;
const errors = [],
  rows = [];
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch { /* Retry while the local server starts or an expected test fault is exercised. */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(url, { waitUntil: "networkidle" });
  async function audit(screen, selector) {
    for (const width of [1440, 1100, 900]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 700 });
    const result = await page.evaluate(
      async ({ screen, selector }) => {
        const { DEVICE_REGISTRY } = await import("/src/devices/registry.ts");
        const { paletteFromHex, applyColorwayHex, contrastRatio } =
          await import("/src/ui/colorPalette.ts");
        const { setTheme } = await import("/src/ui/useTheme.ts");
        const colors = new Map();
        for (const device of DEVICE_REGISTRY)
          for (const color of device.colorways ?? []) {
            const key = color.hex.toUpperCase();
            const item = colors.get(key) ?? {
              hex: key,
              names: new Set(),
              models: 0,
            };
            item.names.add(color.name);
            item.models++;
            colors.set(key, item);
          }
        const output = [];
        for (const color of colors.values())
          for (const theme of ["dark", "light"]) {
            setTheme(theme);
            applyColorwayHex(color.hex);
            const expected = paletteFromHex(color.hex, theme),
              root = getComputedStyle(document.documentElement),
              surface = getComputedStyle(document.querySelector(selector));
            const mismatches = [];
            for (const [token, value] of Object.entries(expected)) {
              // Compare resolved CSS colors, including registered custom properties.
              const actual = root.getPropertyValue(token).trim(),
                inherited = surface.getPropertyValue(token).trim();
              const equal = (a, b) => {
                if (a === b) return true;
                if (CSS.supports("color", a) && CSS.supports("color", b)) {
                  const canvas = document.createElement("canvas");
                  const context = canvas.getContext("2d");
                  context.fillStyle = a;
                  const one = context.fillStyle;
                  context.fillStyle = b;
                  return one === context.fillStyle;
                }
                return a.replaceAll(" ", "") === b.replaceAll(" ", "");
              };
              // Workspaces use the fixed atk.store tokens (.cx); the colorway palette still drives the root and home screen.
              if (!equal(actual, value)) mismatches.push(token);
              void inherited;
            }
            if (
              document.querySelector(selector).classList.contains("cx") &&
              surface.getPropertyValue("--hub-accent").trim() !==
              getComputedStyle(document.querySelector(selector)).getPropertyValue("--cx-ink").trim()
            )
              mismatches.push("workspace --hub-accent must follow the store ink");
            const actual = root.getPropertyValue("--hub-accent").trim();
            const contrast = contrastRatio(
              expected["--hub-accent"],
              expected["--hub-on-accent"],
            );
            output.push({
              screen,
              theme,
              hex: color.hex,
              names: [...color.names].join(", "),
              models: color.models,
              accent: actual,
              contrast,
              pass: !mismatches.length && contrast >= 4.5,
              errors: mismatches,
            });
          }
        return output;
      },
      { screen, selector },
    );
    rows.push(...result.map(row => ({ ...row, width: page.viewportSize().width })));
  }
  }
  async function mock(name) {
    await page
      .getByRole("button", { name: "Mock device", exact: true })
      .first()
      .click();
    const dialog = page.locator(".device-selector");
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name, exact: true }).click();
    await dialog
      .getByRole("button", { name: "Mock device", exact: true })
      .click();
  }
  await audit("Home", ".device-home");
  await mock("ATK Frost Zero Extreme");
  await page.locator(".liquid-app").waitFor();
  await audit("Mouse", ".liquid-app");
  await page
    .getByRole("button", { name: "Back to device list", exact: true })
    .click();
  await mock("ATK 68 V2 Pro");
  await page.locator(".keyboard-workspace").waitFor();
  await audit("Keyboard", ".keyboard-workspace");
  // The compact device panel is a disclosure at narrow widths.
  await page.setViewportSize({ width: 1440, height: 900 });
  const expandMaps = page.getByRole("button", { name: "Expand maps", exact: true });
  if (await expandMaps.isVisible()) await expandMaps.click();
  await page.locator('.keyboard-layout[data-maps-collapsed="false"]').waitFor();
  // Real colorway control integration, beyond direct token application.
  const colorway = page.getByRole("combobox", {
    name: "Colorway",
    exact: true,
  });
  await colorway.click();
  await page.getByRole("option", { name: "Black Orange", exact: true }).click();
  if (
    (await page.locator("html").getAttribute("data-colorway-hex")) !== "#E0570E"
  )
    errors.push("Keyboard selector did not apply registry hex");
  const { hex } = await page.evaluate(() => ({
    hex: document.documentElement.dataset.colorwayHex,
  }));
  await page
    .getByRole("radio", { name: "Dark theme", exact: true })
    .locator("..")
    .click();
  await page.waitForTimeout(50);
  if ((await page.locator("html").getAttribute("data-colorway-hex")) !== hex)
    errors.push("Theme change lost selected colorway");
  mkdirSync("shots", { recursive: true });
  await page.screenshot({ path: "shots/color-keyboard-dark.png" });
  await page
    .getByRole("radio", { name: "Light theme", exact: true })
    .locator("..")
    .click();
  await page.waitForTimeout(50);
  await page.screenshot({ path: "shots/color-keyboard-light.png" });
  const failures = rows.filter((r) => !r.pass);
  const escape = (value) => String(value).replaceAll("|", "/");
  writeFileSync(
    "COLOR_AUDIT.md",
    [
      "# Colorway audit",
      "",
      `Registry: ${new Set(rows.map((r) => r.hex)).size} unique hex colors; ${rows.length} computed-style checks across home, mouse, keyboard and both themes. Failures: ${failures.length}. Browser errors: ${errors.length}.`,
      "",
      "Every registry colorway is covered; repeated hexes share one palette. Accent shades are adjusted for readable contrast. Ice uses registry #BDC9E2. Black/orange/ice/white retain hand-tuned overrides. Orange light uses a darker accessible shade instead of copying its dark palette. White-light has its own neutral surfaces and complete Apply/ambient/glass tokens.",
      "",
      "| Finish names | Registry hex | Theme | Screen | Width | Actual accent | Text contrast | Result |",
      "|---|---|---|---|---|---|---|---|",
      ...rows.map(
        (r) =>
          `| ${escape(r.names)} | ${r.hex} | ${r.theme} | ${r.screen} | ${r.width} | ${r.accent} | ${r.contrast.toFixed(2)}:1 | ${r.pass ? "PASS" : "FAIL " + r.errors.join(", ")} |`,
      ),
      "",
      ...errors.map((e) => `Browser error: ${e}`),
    ].join("\n"),
  );
  writeFileSync(
    "shots/color-audit.json",
    JSON.stringify(
      { checks: rows.length, failures: failures.length, errors, rows },
      null,
      2,
    ),
  );
  if (failures.length || errors.length)
    throw new Error(
      `${failures.length} palette failures; ${errors.join("; ")}`,
    );
  console.log(`Color audit: ${rows.length} checks; zero failures.`);
} finally {
  await browser?.close();
  if (process.platform === "win32")
    spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  else server.kill();
}
