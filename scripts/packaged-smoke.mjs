import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { getCurrentFuseWire, FuseV1Options } from "@electron/fuses";
import { FuseState } from "@electron/fuses/dist/constants.js";

const executable = path.resolve(process.argv[2] ?? "release/win-unpacked/ReHUB for ATK.exe");
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const fuses = await getCurrentFuseWire(executable);
for (const option of ["RunAsNode", "EnableNodeOptionsEnvironmentVariable", "EnableNodeCliInspectArguments"])
  assert.equal(fuses[FuseV1Options[option]], FuseState.DISABLE, option);
for (const option of ["EnableEmbeddedAsarIntegrityValidation", "OnlyLoadAppFromAsar"])
  assert.equal(fuses[FuseV1Options[option]], FuseState.ENABLE, option);

// Packaged builds disable Node debugging, so inspect the sandboxed renderer only.
await mkdir("audit/desktop", { recursive: true });
const profile = await mkdtemp(path.resolve("audit/desktop/packaged-profile-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;
const app = spawn(executable, [`--user-data-dir=${profile}`, "--remote-debugging-port=0"], {
  env, windowsHide: true, stdio: "ignore",
});
let launchError;
app.on("error", (error) => { launchError = error; });
let browser;
try {
  let endpoint;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (launchError) throw launchError;
    if (app.exitCode !== null) throw new Error(`App exited early: ${app.exitCode}`);
    try {
      const [port, route] = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/);
      endpoint = `http://127.0.0.1:${Number(port)}`;
      assert.ok(route.startsWith("/devtools/browser/"));
      break;
    } catch { await delay(250); }
  }
  assert.ok(endpoint, "App exposed renderer debugging for this test");
  browser = await chromium.connectOverCDP(endpoint);
  const page = browser.contexts()[0].pages().find((p) => p.url().startsWith("rehub://app/"));
  assert.ok(page, "Packaged app loaded its secure origin");
  await page.getByRole("button", { name: "Help support my device", exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => ({ node: typeof window.require, secure: isSecureContext, hid: !!navigator.hid })),
    { node: "undefined", secure: true, hid: true });
  const preferences = await page.evaluate(() => window.rehubDesktop.getPreferences());
  assert.equal(preferences.version, version);
  await page.getByRole("button", { name: "Help support my device", exact: true }).click();
  await page.getByLabel("Model name (required)").fill("Packaged release test");
  await page.getByRole("button", { name: "Review report", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Open GitHub issue" }).isDisabled(), true);
  assert.equal(JSON.parse(await page.getByLabel("Report preview").innerText()).userProvided.model, "Packaged release test");
  console.log("Packaged smoke passed: security fuses, secure origin, isolated renderer, HID API, preferences, report preview and consent.");
} finally {
  await browser?.close();
  app.kill();
}
