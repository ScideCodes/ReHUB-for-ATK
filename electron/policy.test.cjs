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
