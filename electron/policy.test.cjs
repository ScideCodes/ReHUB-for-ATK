const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  isAppUrl,
  assetPath,
  externalUrl,
  safeDevices,
} = require("./policy.cjs");
test("only the app origin is trusted", () => {
  assert.equal(isAppUrl("rehub://app/index.html"), true);
  for (const url of [
    "https://app/",
    "rehub://evil/",
    "rehub://app.evil/",
    "rehub://user@app/",
    "garbage",
  ])
    assert.equal(isAppUrl(url), false);
});
test("assets stay inside dist and reject malformed paths", () => {
  const root = path.resolve("dist");
  assert.equal(assetPath(root, "rehub://app/"), path.join(root, "index.html"));
  assert.equal(
    assetPath(root, "rehub://app/assets/main.js"),
    path.join(root, "assets/main.js"),
  );
  for (const url of [
    "rehub://evil/a",
    "rehub://app/%2e%2e%2fsecret",
    "rehub://app/%5c..%5csecret",
    "rehub://app/%00",
    "rehub://app/%ZZ",
    "rehub://app/C:/secret",
  ])
    assert.equal(assetPath(root, url), null);
});
test("external links are explicit HTTPS destinations", () => {
  assert.equal(
    externalUrl("https://www.atk.store/pages/contact/?ref=xStore"),
    "https://www.atk.store/pages/contact/?ref=xStore",
  );
  assert.ok(
    externalUrl(
      "https://github.com/ScideCodes/ReHUB-for-ATK/issues/new?body=hello",
    ),
  );
  for (const url of [
    "file:///C:/Windows/",
    "https://github.com.evil/",
    "https://github.com/other/repo",
    "https://user@github.com/ScideCodes/ReHUB-for-ATK",
    "javascript:alert(1)",
    "https://www.atk.store.evil/pages/contact/?ref=xStore",
    "https://www.atk.store/other-page",
    "https://www.yuque.com/yunyanyingraorenjian/atk",
  ])
    assert.equal(externalUrl(url), null);
});
test("chooser exposes no serials and excludes boot collections", () => {
  const device = {
    deviceId: "1",
    name: "Mouse",
    vendorId: 0x373b,
    productId: 1,
    serialNumber: "SECRET",
  };
  assert.equal(JSON.stringify(safeDevices([device])).includes("SECRET"), false);
  assert.equal(
    safeDevices([{ ...device, collections: [{ usagePage: 0xff02 }] }]).length,
    0,
  );
  assert.equal(
    safeDevices([{ ...device, collections: [{ usagePage: 1, children: [{ usagePage: 0xff02 }] }] }]).length,
    0,
  );
});

test("chooser maps dongle and known device names to model names", () => {
  const dongle = {
    deviceId: "dongle-1",
    name: "Wireless mouse 8k dongle-H",
    vendorId: 0x373b,
    productId: 0x11d8,
  };
  const list = safeDevices([dongle]);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "ATK Frost Zero Extreme");
});

test("HID grants keep valid unique VID/PID pairs and match devices by them", () => {
  const { hidGrants, granted } = require("./policy.cjs");
  const grants = hidGrants([
    { vendorId: 0x373b, productId: 0x109c, serialNumber: "x" },
    { vendorId: 0x373b, productId: 0x109c },
    { vendorId: 0, productId: 1 },
    { vendorId: "1", productId: 2 },
    null,
    { vendorId: 0x3554, productId: 0xf5d5 },
  ]);
  assert.deepEqual(grants, [
    { vendorId: 0x373b, productId: 0x109c },
    { vendorId: 0x3554, productId: 0xf5d5 },
  ]);
  assert.deepEqual(hidGrants("nope"), []);
  assert.equal(hidGrants(Array.from({ length: 80 }, (_, i) => ({ vendorId: 1, productId: i + 1 }))).length, 64);
  assert.equal(granted(grants, { vendorId: 0x373b, productId: 0x109c }), true);
  assert.equal(granted(grants, { vendorId: 0x373b, productId: 0x1 }), false);
  assert.equal(granted(grants, undefined), false);
});

test("update check finds newer stable releases and the installer link", () => {
  const { newerRelease, installerUrl } = require("./policy.cjs");
  assert.equal(newerRelease("v1.5.6", "1.5.5"), "1.5.6");
  assert.equal(newerRelease("v1.10.0", "1.9.9"), "1.10.0");
  assert.equal(newerRelease("v1.5.5", "1.5.5"), null);
  assert.equal(newerRelease("v1.5.4", "1.5.5"), null);
  assert.equal(newerRelease("v2.0.0-beta", "1.5.5"), null);
  assert.equal(newerRelease(undefined, "1.5.5"), null);
  const repo = "https://github.com/ScideCodes/ReHUB-for-ATK";
  const good = `${repo}/releases/download/v1.5.6/ReHUB-Setup-1.5.6-x64.exe`;
  assert.equal(installerUrl({ assets: [{ name: "ReHUB-Setup-1.5.6-x64.exe", browser_download_url: good }] }, "1.5.6", repo), good);
  assert.equal(installerUrl({ assets: [{ name: "ReHUB-Setup-1.5.6-x64.exe", browser_download_url: "https://evil.example/x.exe" }] }, "1.5.6", repo), `${repo}/releases/tag/v1.5.6`);
  assert.equal(installerUrl({}, "1.5.6", repo), `${repo}/releases/tag/v1.5.6`);
});

test("self-update needs allowlisted installer and checksum assets, and reads SHA256SUMS lines", () => {
  const { updateAssets, checksumFor } = require("./policy.cjs");
  const base = "https://github.com/ScideCodes/ReHUB-for-ATK/releases/download/v1.5.7/";
  const assets = [
    { name: "ReHUB-Setup-1.5.7-x64.exe", browser_download_url: `${base}ReHUB-Setup-1.5.7-x64.exe` },
    { name: "SHA256SUMS.txt", browser_download_url: `${base}SHA256SUMS.txt` },
  ];
  assert.deepEqual(updateAssets({ assets }, "1.5.7"), {
    file: "ReHUB-Setup-1.5.7-x64.exe",
    installer: `${base}ReHUB-Setup-1.5.7-x64.exe`,
    sums: `${base}SHA256SUMS.txt`,
  });
  assert.equal(updateAssets({ assets: assets.slice(0, 1) }, "1.5.7"), null);
  assert.equal(updateAssets({ assets: [{ ...assets[0], browser_download_url: "https://evil.example/a.exe" }, assets[1]] }, "1.5.7"), null);
  const hash = "A".repeat(64);
  assert.equal(checksumFor(`${hash}  ReHUB-Setup-1.5.7-x64.exe\r\n`, "ReHUB-Setup-1.5.7-x64.exe"), "a".repeat(64));
  assert.equal(checksumFor(`${hash} *ReHUB-Setup-1.5.7-x64.exe`, "ReHUB-Setup-1.5.7-x64.exe"), "a".repeat(64));
  assert.equal(checksumFor(`${hash}  other.exe`, "ReHUB-Setup-1.5.7-x64.exe"), null);
  assert.equal(checksumFor("garbage", "x"), null);
});
