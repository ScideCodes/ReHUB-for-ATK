const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  protocol,
  net,
  ipcMain,
  shell,
  dialog,
  screen,
} = require("electron");
const fs = require("node:fs/promises");
const { writeFileSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { isAppUrl, assetPath, externalUrl } = require("./policy.cjs");
const { DeviceChooser } = require("./chooser.cjs");
const REPO = "https://github.com/ScideCodes/ReHUB-for-ATK";
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'";
protocol.registerSchemesAsPrivileged([
  {
    scheme: "rehub",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
// Test processes use an isolated profile; normal installs always retain their profile.
const smoke = !app.isPackaged && process.argv.includes("--smoke-test");
if (smoke)
  app.setPath(
    "userData",
    path.join(app.getPath("temp"), `rehub-smoke-${process.pid}`),
  );
let window,
  tray,
  quitting = false;
let preferences = { closeToTray: false, launchAtLogin: false };
let windowBounds = null;
let prefPath = null;
// Synchronous so close and quit cannot interleave two writes of the same file.
function writePreferences() {
  if (!prefPath) return;
  writeFileSync(
    prefPath,
    JSON.stringify({ ...preferences, ...(windowBounds ? { windowBounds } : {}) }),
    "utf8",
  );
}
function saveWindowBounds() {
  if (!window || window.isDestroyed()) return;
  try {
    windowBounds = window.isMaximized()
      ? { isMaximized: true }
      : { ...window.getBounds(), isMaximized: false };
    writePreferences();
  } catch {
    /* bounds are a convenience; never block closing */
  }
}
const chooser = new DeviceChooser((devices) => {
  if (window && !window.isDestroyed())
    window.webContents.send("desktop:chooser-changed", devices);
});
function trusted(event) {
  return (
    window &&
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    isAppUrl(event.senderFrame.url)
  );
}
function handle(channel, action) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error("Untrusted request");
    return action(...args);
  });
}
function show() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
async function openExternal(url) {
  const safe = externalUrl(url);
  if (safe) {
    try {
      await shell.openExternal(safe);
    } catch {
      await dialog.showMessageBox(window, {
        type: "error",
        message: "Could not open your browser.",
        detail:
          "Open the ReHUB repository on GitHub in your browser and try again.",
      });
    }
  }
}
async function disconnect() {
  const { response } = await dialog.showMessageBox(window, {
    type: "question",
    buttons: ["Cancel", "Disconnect and reload"],
    defaultId: 0,
    cancelId: 0,
    message: "Disconnect all devices?",
    detail:
      "ReHUB will reload and close its device connections. Unsaved changes will be lost. Do not continue during a save.",
  });
  if (response === 1) {
    chooser.cancel();
    window.reload();
  }
}
async function checkUpdates() {
  try {
    const response = await net.fetch(
      "https://api.github.com/repos/ScideCodes/ReHUB-for-ATK/releases/latest",
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (response.status === 404)
      return {
        message:
          "No published release found. Your installed app is ready to use.",
      };
    if (!response.ok) throw new Error("GitHub unavailable");
    const release = await response.json();
    const latest = /^v?(\d+\.\d+\.\d+)$/.exec(release.tag_name ?? "")?.[1];
    if (!latest)
      return {
        message: "Check GitHub Releases for available downloads.",
        url: `${REPO}/releases`,
      };
    const currentParts = app.getVersion().split(".").map(Number);
    const newer =
      latest
        .split(".")
        .map(Number)
        .reduce((result, n, i) => result || Math.sign(n - currentParts[i]), 0) >
      0;
    return {
      message: newer
        ? `ReHUB ${latest} is available. Download the installer from GitHub Releases.`
        : `You are using ReHUB ${app.getVersion()}. No newer stable release was found.`,
      ...(newer ? { url: `${REPO}/releases/latest` } : {}),
    };
  } catch {
    return {
      message:
        "Could not check GitHub. Check your internet connection and try again.",
      url: `${REPO}/releases`,
    };
  }
}
async function start() {
  prefPath = path.join(app.getPath("userData"), "desktop-preferences.json");
  let initialBounds = null;
  try {
    const p = JSON.parse(await fs.readFile(prefPath, "utf8"));
    preferences = {
      closeToTray: p.closeToTray === true,
      launchAtLogin: p.launchAtLogin === true,
    };
    if (p.windowBounds && typeof p.windowBounds === "object")
      windowBounds = initialBounds = p.windowBounds;
  } catch {
    /* first launch */
  }
  if (app.isPackaged && process.platform === "win32")
    preferences.launchAtLogin = app.getLoginItemSettings().openAtLogin;
  const dist = path.join(app.getAppPath(), "dist");
  protocol.handle("rehub", async (request) => {
    const file = assetPath(dist, request.url);
    if (!file || request.method !== "GET")
      return new Response("Not found", { status: 404 });
    try {
      const response = await net.fetch(pathToFileURL(file).href, {
        headers: request.headers,
      });
      const headers = new Headers(response.headers);
      headers.set("Content-Security-Policy", CSP);
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  let defaultWidth = 1480;
  let defaultHeight = 960;
  try {
    const primaryDisplay = screen?.getPrimaryDisplay();
    if (primaryDisplay?.workArea) {
      const { width: w, height: h } = primaryDisplay.workArea;
      defaultWidth = Math.min(1480, Math.max(1200, Math.round(w * 0.85)));
      defaultHeight = Math.min(960, Math.max(760, Math.round(h * 0.88)));
    }
  } catch {
    defaultWidth = 1480;
    defaultHeight = 960;
  }

  window = new BrowserWindow({
    width: defaultWidth,
    height: defaultHeight,
    minWidth: 1024,
    minHeight: 700,
    center: true,
    show: false,
    title: "ReHUB for ATK",
    backgroundColor: "#161616",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
    },
  });

  if (initialBounds) {
    try {
      if (initialBounds.isMaximized) {
        window.maximize();
      } else if (
        ["x", "y", "width", "height"].every((k) =>
          Number.isFinite(initialBounds[k]),
        )
      ) {
        const displays = screen.getAllDisplays();
        const isVisible = displays.some((d) => {
          const { x, y, width, height } = d.bounds;
          return (
            initialBounds.x >= x &&
            initialBounds.x + initialBounds.width <= x + width + 50 &&
            initialBounds.y >= y &&
            initialBounds.y + initialBounds.height <= y + height + 50
          );
        });
        if (isVisible) {
          const { x, y, width, height } = initialBounds;
          window.setBounds({ x, y, width, height });
        }
      }
    } catch {
      /* fall back to the default centered size */
    }
  }
  const session = window.webContents.session;
  const permitted = (permission) =>
    permission === "hid" || permission === "clipboard-sanitized-write";
  session.setPermissionCheckHandler(
    (contents, permission, origin, details) =>
      contents === window.webContents &&
      details.isMainFrame &&
      permitted(permission) &&
      isAppUrl(origin),
  );
  session.setPermissionRequestHandler(
    (contents, permission, callback, details) =>
      callback(
        contents === window.webContents &&
          details.isMainFrame &&
          permitted(permission) &&
          isAppUrl(details.requestingUrl),
      ),
  );
  session.on("select-hid-device", (event, details, callback) => {
    event.preventDefault();
    if (
      details.frame !== window.webContents.mainFrame ||
      !isAppUrl(details.frame.url)
    ) {
      callback("");
      return;
    }
    chooser.start(details.deviceList, callback);
  });
  session.on("hid-device-added", (_event, details) => {
    if (details.frame === window.webContents.mainFrame)
      chooser.add(details.device);
  });
  session.on("hid-device-removed", (_event, details) => {
    if (details.frame === window.webContents.mainFrame)
      chooser.remove(details.device);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    event.preventDefault();
    if (!isAppUrl(url)) void openExternal(url);
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.on(
    "did-start-navigation",
    (_event, _url, _inPlace, mainFrame) => {
      if (mainFrame) chooser.cancel();
    },
  );
  window.webContents.on("render-process-gone", () => chooser.cancel());
  window.webContents.on("destroyed", () => chooser.cancel());
  handle("desktop:preferences", () => ({
    ...preferences,
    version: app.getVersion(),
    canLaunchAtLogin: app.isPackaged && process.platform === "win32",
  }));
  handle("desktop:set-preferences", async (input) => {
    if (
      !input ||
      typeof input.closeToTray !== "boolean" ||
      typeof input.launchAtLogin !== "boolean" ||
      Object.keys(input).some(
        (k) => !["closeToTray", "launchAtLogin"].includes(k),
      )
    )
      throw new Error("Invalid preferences");
    const next = {
      closeToTray: input.closeToTray,
      launchAtLogin:
        app.isPackaged && process.platform === "win32"
          ? input.launchAtLogin
          : false,
    };
    const previous = preferences;
    preferences = next;
    try {
      writePreferences();
    } catch (error) {
      preferences = previous;
      throw error;
    }
    if (app.isPackaged && process.platform === "win32")
      app.setLoginItemSettings({
        openAtLogin: next.launchAtLogin,
        path: process.execPath,
      });
    return {
      ...preferences,
      version: app.getVersion(),
      canLaunchAtLogin: app.isPackaged && process.platform === "win32",
    };
  });
  handle("desktop:chooser", () => chooser.pending?.devices ?? null);
  handle("desktop:choose-device", (id) => {
    if (typeof id !== "string" || id.length > 512)
      throw new Error("Invalid device");
    return chooser.choose(id);
  });
  handle("desktop:disconnect", disconnect);
  handle("desktop:check-updates", checkUpdates);
  handle("desktop:save-report", async (text) => {
    if (
      typeof text !== "string" ||
      Buffer.byteLength(text, "utf8") > 512 * 1024
    )
      throw new Error("Invalid report");
    const report = JSON.parse(text);
    if (
      report.schemaVersion !== 1 ||
      typeof report.userProvided?.model !== "string"
    )
      throw new Error("Invalid report");
    const result = await dialog.showSaveDialog(window, {
      title: "Save device report",
      defaultPath: "rehub-device-report.txt",
      filters: [{ name: "Device report", extensions: ["txt"] }],
    });
    if (result.canceled || !result.filePath) return false;
    if (path.extname(result.filePath).toLowerCase() !== ".txt")
      throw new Error("Save the report as a .txt file.");
    await fs.writeFile(result.filePath, text, "utf8");
    return true;
  });
  const icon = nativeImage.createFromPath(path.join(__dirname, "icon.png"));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("ReHUB for ATK");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open ReHUB", click: show },
      {
        label: "Disconnect devices…",
        click: () => {
          show();
          void disconnect();
        },
      },
      { type: "separator" },
      { label: "GitHub repository", click: () => void openExternal(REPO) },
      { label: "Quit ReHUB", click: () => app.quit() },
    ]),
  );
  tray.on("double-click", show);
  Menu.setApplicationMenu(null);
  window.on("close", (event) => {
    saveWindowBounds();
    if (!quitting && preferences.closeToTray && !tray.isDestroyed()) {
      event.preventDefault();
      window.hide();
    }
  });
  window.once("ready-to-show", () => {
    if (!smoke) show();
  });
  await window.loadURL("rehub://app/");
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", show);
  app.on("before-quit", () => {
    quitting = true;
    saveWindowBounds();
    chooser.cancel();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => tray?.destroy());
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox("ReHUB could not start", String(error.message));
      app.quit();
    });
}
