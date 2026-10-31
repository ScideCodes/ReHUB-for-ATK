import { describe, expect, it } from "vitest";
import { DeviceSettingsSchema } from "../types/schema";
import { errorMessage, getDeviceErrorDetails } from "./errorMessage";

describe("user-facing errors", () => {
  it("formats validation errors as readable setting names, without raw JSON", () => {
    const result = DeviceSettingsSchema.safeParse({ sensorSleepTime: 610 });
    if (result.success) throw new Error("Expected invalid settings");
    expect(errorMessage(result.error)).toMatch(/Standby timer.*300/);
    expect(errorMessage(result.error)).not.toContain("too_big");
    expect(errorMessage(result.error)).not.toContain('"path"');
  });
  it("keeps useful connection failures and provides a fallback for unknown errors", () => {
    expect(errorMessage(new Error("Device disconnected"))).toBe(
      "Device disconnected",
    );
    expect(errorMessage(undefined)).toBe("The operation failed.");
  });
  it("converts device status errors into standard error codes with explanations", () => {
    expect(errorMessage(new Error("Device returned status 1."))).toBe(
      "ERR_DEVICE_STATUS_1",
    );
    const details = getDeviceErrorDetails("Device returned status 1.");
    expect(details).toEqual({
      code: "ERR_DEVICE_STATUS_1",
      explanation: "Device controller rejected command or setting payload.",
    });
  });
});
