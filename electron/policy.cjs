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
      (u.hostname === "www.yuque.com" &&
        u.pathname.startsWith("/yunyanyingraorenjian/atk"));
    return allowed ? u.href : null;
  } catch {
    return null;
  }
}
function safeDevices(devices) {
  return devices
    .filter((d) => !(d.collections ?? []).some((c) => c.usagePage === 0xff02))
    .map((d) => ({
      deviceId: d.deviceId,
      name: String(d.name || "HID device").slice(0, 120),
      vendorId: d.vendorId,
      productId: d.productId,
    }));
}
module.exports = { isAppUrl, assetPath, externalUrl, safeDevices };
