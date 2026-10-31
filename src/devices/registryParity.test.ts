import { describe, expect, it } from "vitest";
import source from "./deviceRegistry.source.json";
import definitions from "./registry.generated.json";
import mice from "./mice.json";
import keyboards from "./devices.json";
import models from "./mouseModels.generated.json";
import { DEVICE_REGISTRY } from "./registry";
import mouseIdentities from "./sourceMouseIdentities.json";
import keyboardIdentities from "./keyboardIdentities.json";
import keyboardSource from "./sourceCatalog.json";

describe("generated registry parity", () => {
  it("keeps generated identity projections identical to their sources", () => {
    expect(mouseIdentities).toEqual(
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
    expect(keyboardIdentities).toEqual(
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
  });
  it("preserves every normalized source endpoint and model", () => {
    expect(definitions).toEqual(source.devices);
    expect(DEVICE_REGISTRY).toEqual(source.devices);
    expect(models).toEqual(source.mouseModels);
    expect(mice).toEqual(
      source.devices.filter((device) => device.kind === "mouse"),
    );
    expect(keyboards).toEqual(
      source.devices.filter((device) => device.kind === "keyboard"),
    );
    expect(new Set(definitions.map((device) => device.id)).size).toBe(
      definitions.length,
    );
    expect(definitions.some((device) => device.usagePage === 0xff02)).toBe(
      false,
    );
  });
});
