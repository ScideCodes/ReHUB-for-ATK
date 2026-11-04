import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

// Every mouse and keyboard tab must fit without any scrollable element at 1440×900 and larger (1920×900 covers wide-but-short).
const url = "http://127.0.0.1:4196";
const server = spawn(
  process.execPath,
  [resolve("node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "4196", "--strictPort"],
  { windowsHide: true, stdio: "ignore" },
);
const devices = [
  { model: "ATK Frost Zero Extreme", root: ".liquid-app" },
  { model: "ATK 68 V2 Pro", root: ".keyboard-workspace" },
];
const failures = [];
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
  for (const [width, height] of [[1440, 900], [1920, 900], [1920, 1080]])
    for (const device of devices) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Mock device", exact: true }).first().click();
      const picker = page.getByRole("dialog", { name: "Select device", exact: true });
      await picker.getByRole("combobox", { name: "Model", exact: true }).click();
      await page.getByRole("option", { name: device.model, exact: true }).click();
      await picker.getByRole("button", { name: "Mock device", exact: true }).click();
      await picker.waitFor({ state: "hidden" });
      await page.getByRole("tablist").first().waitFor();
      for (const tab of (await page.getByRole("tab").allTextContents()).map((text) => text.trim())) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        await page.waitForTimeout(400);
        const scrollers = await page.evaluate((root) => {
          const found = [];
          for (const el of document.querySelectorAll(`${root}, ${root} *`)) {
            if (!el.checkVisibility()) continue;
            const style = getComputedStyle(el);
            const y = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
            const x = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
            if (y || x)
              found.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} ${y ? `y+${el.scrollHeight - el.clientHeight}` : ""}${x ? ` x+${el.scrollWidth - el.clientWidth}` : ""}`);
          }
          return found;
        }, device.root);
        const line = `${width}x${height} ${device.model} ${tab}: ${scrollers.length ? scrollers.join(" | ") : "fits"}`;
        console.log(line);
        if (scrollers.length) failures.push(line);
      }
      await context.close();
    }
  console.log(`No-scroll: ${failures.length ? `${failures.length} tabs scroll` : "every tab fits"}`);
  if (failures.length) process.exitCode = 1;
} finally {
  await browser?.close();
  if (process.platform === "win32")
    spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else server.kill();
}
