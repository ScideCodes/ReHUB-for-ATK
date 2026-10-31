import { describe, expect, it } from "vitest";
import rawDevices from "../devices/devices.json";
import { DeviceDefinitionSchema } from "../types/schema";
import { DEVICES } from "./constants";

describe("devices schema", () => {
  it("every device in the json passes the schema", () => {
    expect(DEVICES.length).toBeGreaterThan(0);
    expect(DEVICES.length).toBe(rawDevices.length);
    rawDevices.forEach((device) => {
      const result = DeviceDefinitionSchema.safeParse(device);
      expect(result.success).toBe(true);
    });
  });
});
