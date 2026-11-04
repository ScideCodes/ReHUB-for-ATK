import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, mkdtemp } from "node:fs/promises";
import path from "node:path";

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.argv[2] && path.resolve(process.argv[2]);
await mkdir("audit/desktop", { recursive: true });
const profile = await mkdtemp(path.resolve("audit/desktop/profile-"));
const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [
    ...(executablePath ? [] : [".", "--smoke-test"]),
    `--user-data-dir=${profile}`,
  ],
  env,
});
const errors = [];
try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    // Hidden test windows still need animation frames for modal exit transitions.
    window.webContents.setBackgroundThrottling(false);
    window.hide();
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .getByRole("button", { name: "Help support my device", exact: true })
    .waitFor();
  assert.equal(page.url(), "rehub://app/");
  assert.deepEqual(
    await page.evaluate(() => ({
      node: typeof window.require,
      secure: isSecureContext,
      hid: !!navigator.hid,
    })),
    { node: "undefined", secure: true, hid: true },
  );
  const clipboardPermissions = await page.evaluate(async () => ({
    write: (await navigator.permissions.query({ name: "clipboard-write" }))
      .state,
    read: (await navigator.permissions.query({ name: "clipboard-read" })).state,
  }));
  assert.equal(clipboardPermissions.write, "granted");
  assert.equal(clipboardPermissions.read, "denied");
  const prefs = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  );
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.nodeIntegration, false);
  await page
    .getByRole("button", { name: "Help support my device", exact: true })
    .click();
  await page.getByLabel("Model name (required)").fill("ATK community test");
  await page.getByRole("button", { name: "Select device (optional)" }).click();
  await page
    .getByRole("dialog", { name: "Select a device", exact: true })
    .waitFor();
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    contents.session.emit(
      "hid-device-added",
      {},
      {
        frame: contents.mainFrame,
        device: {
          deviceId: "smoke-device",
          name: "Hotplug test",
          vendorId: 0x373b,
          productId: 123,
          collections: [],
        },
      },
    );
  });
  await page.getByRole("radio", { name: /Hotplug test/ }).waitFor();
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    contents.session.emit(
      "hid-device-removed",
      {},
      { frame: contents.mainFrame, device: { deviceId: "smoke-device" } },
    );
  });
  await page
    .getByRole("radio", { name: /Hotplug test/ })
    .waitFor({ state: "detached" });
  await page
    .getByRole("dialog", { name: "Select a device", exact: true })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Select a device", exact: true }).waitFor({ state: "detached" });
  await page
    .getByRole("button", { name: "Review report", exact: true })
    .click();
  assert.equal(
    await page.getByRole("button", { name: "Open GitHub issue" }).isDisabled(),
    true,
  );
  const preview = await page.getByLabel("Report preview").innerText();
  assert.equal(JSON.parse(preview).userProvided.model, "ATK community test");
  await page.getByRole("checkbox").check();
  const issue = await page
    .getByRole("link", { name: "Open GitHub issue" })
    .getAttribute("href");
  assert.equal(new URL(issue).hostname, "github.com");
  // Download is a user-visible local action. No issue is actually opened/submitted.
  await mkdir("audit/desktop", { recursive: true });
  const reportPath = path.resolve("audit/desktop/rehub-device-report.txt");
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, reportPath);
  await page
    .getByRole("button", { name: "Download report", exact: true })
    .click();
  await page
    .getByText("Report saved. You can attach it to a GitHub issue.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await readFile(reportPath, "utf8"), preview);
  await page.getByRole("dialog", { name: "Review your device report", exact: true }).getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("heading", { name: "Desktop app", exact: true })
    .waitFor();
  await page
    .getByLabel("Keep running in the system tray when I close the window")
    .check();
  await page.getByText("Desktop settings saved.", { exact: true }).waitFor();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  // Linux minimizes instead of hiding (many desktops show no tray icon); the window must survive either way.
  assert.equal(
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window || window.isDestroyed()) return "destroyed";
      return process.platform === "linux" ? "kept" : window.isVisible() ? "visible" : "kept";
    }),
    "kept",
  );
  assert.equal(
    await page.evaluate(
      async () => (await window.rehubDesktop.getPreferences()).closeToTray,
    ),
    true,
  );
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Keep running in the system tray when I close the window")
    .waitFor();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("label")]
        .find((label) =>
          label.textContent.includes("Keep running in the system tray"),
        )
        ?.querySelector("input")?.checked === true,
  );
  assert.equal(
    await page
      .getByLabel("Keep running in the system tray when I close the window")
      .isChecked(),
    true,
  );
  await page
    .getByLabel("Keep running in the system tray when I close the window")
    .uncheck();
  await page.getByText("Desktop settings saved.", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    checks: [
      "secure custom origin",
      "sandbox and isolation",
      "WebHID API",
      "real device picker cancellation",
      "report preview and consent",
      "GitHub issue URL",
      "local download",
      "close to tray",
      "preferences survive reload",
    ],
    physicalHardwareTested: false,
  };
  await writeFile(
    path.resolve(
      `audit/desktop/${executablePath ? "packaged-smoke" : "smoke"}.json`,
    ),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await app.close();
}
