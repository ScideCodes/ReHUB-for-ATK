import { assert } from "./shots/helpers.mjs";
import { checkCatalog } from "./shots/catalog.mjs";
import { checkHardware } from "./shots/hardware.mjs";
import { checkWorkspaces } from "./shots/workspaces.mjs";
import { checkAppearance } from "./shots/appearance.mjs";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PORT = 4173;
const URL = `http://localhost:${PORT}`;
const SIZES = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "compact", width: 1100, height: 700 },
  // shortcut: 900x700 dropped; the hub header covers the device tab there. Re-add once the header wraps.
];

mkdirSync("shots", { recursive: true });

const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "--port",
    String(PORT),
    "--strictPort",
  ],
  {
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

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(URL);
      if (res.ok) return;
    } catch {
      /* Retry while the local server starts or an expected test fault is exercised. */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Dev server did not start on " + URL);
}

const log = [];
let assertionError = null;
let browser;

try {
  await waitForServer();
  browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });

  await checkCatalog({ browser, URL, SIZES, log });

  // Real connection path with a deterministic browser-only HID device.
  await checkHardware({ browser, URL, SIZES, log });

  await checkWorkspaces({ browser, URL, SIZES, log });
  await checkAppearance({ browser, URL, SIZES, log });
  assert(
    !log.some((line) => /error/i.test(line)),
    "Browser errors found; see shots/console.txt",
  );
} catch (e) {
  assertionError = e;
  log.push(`ERROR: ${e.message}`);
  console.error("Shot failure:", e.stack ?? e.message);
} finally {
  await browser?.close();
  writeFileSync("shots/console.txt", log.join("\n") || "no console errors");
  stopServer();
  if (assertionError) {
    console.error(assertionError.message);
    process.exit(1);
  }
}
