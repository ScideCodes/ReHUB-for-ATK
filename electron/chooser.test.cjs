const { test } = require("node:test");
const assert = require("node:assert/strict");
const { DeviceChooser } = require("./chooser.cjs");
test("cancel/replacement resolves each request once; removed/stale IDs cannot be selected", () => {
  const results = [];
  const views = [];
  const picker = new DeviceChooser((d) => views.push(d));
  picker.start([{ deviceId: "a" }], (id) => results.push(id));
  picker.start([{ deviceId: "b" }], (id) => results.push(id));
  assert.deepEqual(results, [""]);
  picker.remove({ deviceId: "b" });
  assert.equal(picker.choose("b"), false);
  picker.add({ deviceId: "c", serialNumber: "SECRET" });
  assert.equal(picker.choose("c"), true);
  picker.cancel();
  assert.deepEqual(results, ["", "c"]);
  assert.equal(views.at(-1), null);
  assert.equal(JSON.stringify(views).includes("SECRET"), false);
});
