import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const widths = (process.env.ATK_AUDIT_WIDTHS ?? "1440,1100,900")
  .split(",")
  .map(Number);
const output = resolve(process.env.ATK_AUDIT_OUTPUT ?? "audit/phase1");
mkdirSync(output, { recursive: true });
const url = "http://127.0.0.1:4181";
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "4181",
    "--strictPort",
  ],
  { windowsHide: true, stdio: "ignore" },
);
const report = { cases: [], console: [], errors: [], coverage: {} };
let browser;

async function scan(page, screen, width, theme) {
  await page.waitForTimeout(400);
  const expectedScreen = screen.startsWith("mouse/")
    ? "mouse"
    : screen.startsWith("keyboard/")
      ? "keyboard"
      : "home";
  // The hub dock names the open device page; home has no dock.
  const dock = page.locator("nav.fd-dock");
  const label = (await dock.count()) ? await dock.getAttribute("aria-label") : null;
  const state = label === "Mouse Configuration" ? "mouse" : label === "Keyboard Configuration" ? "keyboard" : "home";
  const actualTheme = await page.locator("html").getAttribute("data-theme");
  if (state !== expectedScreen || actualTheme !== theme)
    throw new Error(
      `Wrong audit state: expected ${expectedScreen}/${theme}, got ${state}/${actualTheme}`,
    );
  const result = await new AxeBuilder({ page }).analyze();
  const summarize = (issue) => ({
    id: issue.id,
    impact: issue.impact,
    help: issue.help,
    helpUrl: issue.helpUrl,
    tags: issue.tags,
    nodes: issue.nodes.map((node) => ({
      target: node.target,
      html: node.html,
      failureSummary: node.failureSummary,
      checks: [...node.any, ...node.all, ...node.none].map((check) => ({
        id: check.id,
        message: check.message,
        data: check.data,
      })),
    })),
  });
  report.cases.push({
    screen,
    actualScreen: state,
    actualTheme,
    theme,
    width,
    height: width === 1440 ? 900 : 700,
    violations: result.violations.map(summarize),
    incomplete: result.incomplete.map(summarize),
    passes: result.passes.length,
    missingTooltips: await page
      .locator("button")
      .evaluateAll((buttons) =>
        buttons
          .filter(
            (button) =>
              button.getClientRects().length &&
              !button.closest("[inert]") &&
              !button.textContent.trim() &&
              !button.title,
          )
          .map((button) => button.outerHTML),
      ),
    truncatedWithoutTitle: await page.locator("body *").evaluateAll((nodes) =>
      nodes
        .filter(
          (node) =>
            node.getClientRects().length &&
            !node.closest("[inert]") &&
            getComputedStyle(node).textOverflow === "ellipsis" &&
            node.scrollWidth > node.clientWidth + 1 &&
            node.textContent.trim() &&
            !node.closest("[title]"),
        )
        .map((node) => ({
          tag: node.tagName,
          className: node.className,
          text: node.textContent.trim(),
        })),
    ),
    pageOverflow: await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth > innerWidth,
      vertical: document.documentElement.scrollHeight > innerHeight,
    })),
  });
  console.log(
    `${width} ${screen}: ${result.violations.length} axe rules, ${result.violations.reduce((count, issue) => count + issue.nodes.length, 0)} affected nodes`,
  );
}

// Demo mode lists the original's three demo devices; each opens a local mock.
async function openDemo(page, name) {
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: `Open ${name}`, exact: true }).click();
  await page.locator("nav.fd-dock").waitFor();
}

async function scanSections(page, kind, width, theme) {
  const dock = page.locator("nav.fd-dock");
  const names = (await dock.getByRole("button").allTextContents()).map((n) => n.trim());
  report.coverage[`${kind}-${width}`] = names;
  for (const name of names) {
    await dock.getByRole("button", { name, exact: true }).click();
    await scan(page, `${kind}/${name}`, width, theme);
    await page.screenshot({
      path: `${output}/${kind}-${name.toLowerCase().replace(/\W+/g, "-")}-${width}-${theme}.png`,
    });
  }
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      ready = (await fetch(url)).ok;
    } catch {
      /* Wait for the local server. */
    }
    if (ready) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!ready) throw new Error("Audit dev server did not start");
  browser = await chromium.launch({
    headless: true,
    ignoreDefaultArgs: ["--hide-scrollbars"],
  });
  for (const width of widths)
    for (const theme of ["dark", "light"]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 1440 ? 900 : 700 },
        reducedMotion: "reduce",
        colorScheme: theme,
      });
      await context.addInitScript(
        (theme) => localStorage.setItem("atk-hub-original-theme", theme),
        theme,
      );
      const page = await context.newPage();
      page.on("console", (message) => {
        if (["warning", "error"].includes(message.type()))
          report.console.push({
            width,
            type: message.type(),
            message: message.text(),
            location: message.location(),
          });
      });
      page.on("pageerror", (error) =>
        report.errors.push({ width, message: error.message }),
      );
      await page.goto(url, { waitUntil: "networkidle" });
      if (width === 1440)
        report.catalog = await page.evaluate(async () => {
          const { DEVICE_REGISTRY } = await import("/src/devices/registry.ts");
          return {
            entries: DEVICE_REGISTRY.length,
            keyboards: DEVICE_REGISTRY.filter(
              (entry) => entry.kind === "keyboard",
            ).length,
            mice: DEVICE_REGISTRY.filter((entry) => entry.kind === "mouse")
              .length,
            keyboardFamilies: Object.fromEntries(
              [
                ...new Set(
                  DEVICE_REGISTRY.filter(
                    (entry) => entry.kind === "keyboard",
                  ).map((entry) => entry.protocolFamily),
                ),
              ].map((family) => [
                family,
                DEVICE_REGISTRY.filter(
                  (entry) =>
                    entry.kind === "keyboard" &&
                    entry.protocolFamily === family,
                ).length,
              ]),
            ),
          };
        });
      await scan(page, "home/disconnected", width, theme);
      // Header popovers must sit above the page: a real click on a menu item has to reach it.
      await page.getByRole("button", { name: "Language", exact: true }).click();
      const item = page.getByRole("menuitemradio", { name: "English" });
      const onTop = await item.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      });
      if (!onTop) throw new Error("Header menu is covered by the page");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Experience demo", exact: true }).click();
      await openDemo(page, "ATK F1 Ultimate 2.0");
      await scanSections(page, "mouse", width, theme);
      await openDemo(page, "ATK RS6");
      await scanSections(page, "keyboard", width, theme);
      await context.close();
    }
  const sections = Object.values(report.coverage).reduce((n, list) => n + list.length, 0);
  // One home scan per width and theme; section lists are the same in both themes.
  if (!sections || report.cases.length !== widths.length * 2 + 2 * sections)
    throw new Error(`Unexpected audit state count: ${report.cases.length}`);
  if (report.cases.some((test) => test.violations.length))
    throw new Error("Browser audit found accessibility violations");
  if (
    report.errors.length ||
    report.console.some((entry) => entry.type === "error")
  ) {
    throw new Error("Browser audit captured page or console errors");
  }
} catch (error) {
  report.errors.push({ message: error.stack ?? String(error) });
  process.exitCode = 1;
} finally {
  writeFileSync(
    `${output}/accessibility.json`,
    JSON.stringify(report, null, 2),
  );
  await browser?.close();
  if (process.platform === "win32")
    spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else server.kill();
}
