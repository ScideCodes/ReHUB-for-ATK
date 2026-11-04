const path = require("node:path");
function isAppUrl(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "rehub:" && u.host === "app" && !u.username && !u.password
    );
  } catch {
    return false;
  }
}
function assetPath(root, value) {
  if (!isAppUrl(value)) return null;
  try {
    const decoded = decodeURIComponent(new URL(value).pathname);
    if (/[\\\0:]/.test(decoded) || decoded.split("/").includes(".."))
      return null;
    const target = path.resolve(
      root,
      "." + (decoded === "/" ? "/index.html" : decoded),
    );
    const relative = path.relative(root, target);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
      ? target
      : null;
  } catch {
    return null;
  }
}
function externalUrl(value) {
  try {
    const u = new URL(value);
    if (
      value.length > 7500 ||
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port
    )
      return null;
    const allowed =
      (u.hostname === "github.com" &&
        (u.pathname === "/ScideCodes/ReHUB-for-ATK" ||
          u.pathname.startsWith("/ScideCodes/ReHUB-for-ATK/"))) ||
      u.hostname === "hub.atk.pro" ||
      (u.hostname === "www.atk.store" &&
        u.pathname === "/pages/contact/");
    return allowed ? u.href : null;
  } catch {
    return null;
  }
}
let knownNames = {};
try {
  knownNames = require("./deviceNames.json");
} catch {
  knownNames = {};
}

function getDeviceDisplayName(d) {
  const vid = Number(d.vendorId || 0);
  const pid = Number(d.productId || 0);
  const key = `0x${vid.toString(16).toLowerCase()}:0x${pid.toString(16).toLowerCase()}`;
  if (knownNames[key]) return knownNames[key];
  if (vid === 0x373b && (pid === 0x11d8 || pid === 0x11cc || pid === 0x12cc)) {
    return "ATK Frost Zero Extreme";
  }
  if (typeof d.name === "string" && /dongle-h/i.test(d.name)) {
    return "ATK Frost Zero Extreme";
  }
  return String(d.name || "HID device").slice(0, 120);
}

function safeDevices(devices) {
  const hasBootCollection = (collections = []) =>
    collections.some((c) => c.usagePage === 0xff02 || hasBootCollection(c.children));
  const hasConfigCollection = (collections = []) =>
    collections.some(
      (c) =>
        c.usagePage === 0xff04 ||
        c.usagePage === 0xff00 ||
        c.usagePage === 0xff01 ||
        hasConfigCollection(c.children),
    );
  return devices
    .filter((d) => !hasBootCollection(d.collections) || hasConfigCollection(d.collections))
    .map((d) => ({
      deviceId: d.deviceId,
      name: getDeviceDisplayName(d),
      vendorId: d.vendorId,
      productId: d.productId,
    }));
}
// Devices the user picked, re-granted on the next launch so the app reconnects without asking again.
// shortcut: keyed by VID/PID only (the chooser exposes no serial), so a second unit of the same model is also allowed.
const MAX_GRANTS = 64;
const isId = (n) => Number.isInteger(n) && n > 0 && n <= 0xffff;
function hidGrants(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .filter((g) => g && isId(g.vendorId) && isId(g.productId))
    .map((g) => ({ vendorId: g.vendorId, productId: g.productId }))
    .filter((g) => {
      const key = `${g.vendorId}:${g.productId}`;
      return !seen.has(key) && seen.add(key);
    })
    .slice(-MAX_GRANTS);
}
const granted = (grants, device) =>
  !!device && grants.some((g) => g.vendorId === device.vendorId && g.productId === device.productId);
module.exports = { isAppUrl, assetPath, externalUrl, safeDevices, getDeviceDisplayName, hidGrants, granted };
