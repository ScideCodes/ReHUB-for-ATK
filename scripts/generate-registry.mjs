import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const root = resolve("src/devices");
const source = JSON.parse(
  readFileSync(resolve(root, "deviceRegistry.source.json"), "utf8"),
);
assert.equal(
  new Set(source.devices.map((device) => device.id)).size,
  source.devices.length,
);
assert(source.devices.every((device) => device.usagePage !== 0xff02));
const write = (name, value) =>
  writeFileSync(resolve(root, name), JSON.stringify(value, null, 2) + "\n");
write("registry.generated.json", source.devices);
write("mouseModels.generated.json", source.mouseModels);
write(
  "mice.json",
  source.devices.filter((device) => device.kind === "mouse"),
);
write(
  "devices.json",
  source.devices.filter((device) => device.kind === "keyboard"),
);
const keyboardSource = JSON.parse(
  readFileSync(resolve(root, "sourceCatalog.json"), "utf8"),
);
write(
  "keyboardIdentities.json",
  Object.fromEntries(
    keyboardSource.entries.map((entry) => [
      `${entry.vendorId}:${entry.productId}`,
      {
        name: entry.custom.title ?? entry.custom.name,
        protocolFamily: entry.protocolFamily,
      },
    ]),
  ),
);
write(
  "sourceMouseIdentities.json",
  Object.fromEntries(
    source.devices
      .filter(
        (device) =>
          device.kind === "mouse" &&
          device.cid !== undefined &&
          device.mid !== undefined,
      )
      .map((device) => [
        `${Number(device.VID)}:${Number(device.PID)}`,
        [device.cid, device.mid],
      ]),
  ),
);
console.log(
  `Generated ${source.devices.length} device definitions and ${source.mouseModels.length} mouse models.`,
);
