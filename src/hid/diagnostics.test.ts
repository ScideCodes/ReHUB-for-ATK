import { HidClient } from "./hidClient";
import { KeyboardClient } from "./keyboardClient";
import { ATK68 } from "../devices/registry";
import { describe, expect, it, vi } from "vitest";
import { DeviceDiagnostics } from "./diagnostics";
const identity = {
  vendorId: 0x373b,
  productId: 0x11cc,
  usagePage: 0xff04,
  usage: 2,
  reportId: 8,
};
describe("local HID diagnostics", () => {
  it("retains only 50 frames, bounds errors, and summarizes completed exchanges", () => {
    const log = new DeviceDiagnostics("mouse"),
      listener = vi.fn();
    const unsubscribe = log.subscribe(listener);
    for (let index = 0; index < 60; index++)
      log.frame("out", 8, new Uint8Array([index]));
    for (let index = 0; index < 25; index++)
      log.finish(5, new Error("timed out"));
    const state = log.getSnapshot();
    expect(state.frames).toHaveLength(50);
    expect(state.frames[0].id).toBe(11);
    expect(state.errors).toHaveLength(20);
    expect(state.timing).toEqual({
      exchanges: 25,
      failed: 25,
      totalMs: 125,
      maxMs: 5,
    });
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    log.disconnect();
    expect(listener).not.toHaveBeenCalled();
  });
  it.each(["mouse", "keyboard"] as const)(
    "removes personal payloads and dynamic errors from copied %s reports",
    (kind) => {
      const log = new DeviceDiagnostics(kind);
      log.frame(
        "in",
        8,
        new TextEncoder().encode(
          "\u0004\u0000\u0001\u0002\u0003PRIVATE-SERIAL-SECRET",
        ),
      );
      log.error(
        new Error("Permission denied for Alex C:/private/password.txt"),
      );
      const text = log.report(
          {
            ...identity,
            ...{ serial: "PRIVATE-SERIAL-SECRET", productName: "Alex" },
          },
          "disconnected",
        ),
        report = JSON.parse(text);
      expect(text).not.toMatch(/PRIVATE|Alex|password|C:\//);
      expect(report.frames[0].hex).toContain("**");
      expect(report.errors[0].code).toBe("permission-denied");
      expect(report.appVersion).toBeTruthy();
      expect(report.identity).toEqual(identity);
    },
  );
  it("copies collection/report metadata and resets when another device attaches", () => {
    const log = new DeviceDiagnostics("mouse");
    const device = {
      vendorId: identity.vendorId,
      productId: identity.productId,
      collections: [
        {
          usagePage: 0xff04,
          usage: 2,
          inputReports: [{ reportId: 8 }],
          outputReports: [{ reportId: 8 }],
          featureReports: [],
          children: [],
        },
      ],
    };
    log.attach(device as unknown as HIDDevice, "hardware");
    log.frame("in", 8, new Uint8Array([4]));
    log.disconnect();
    expect(log.getSnapshot().connected).toBe(false);
    expect(log.getSnapshot().collections[0].input).toEqual([8]);
    log.attach(device as unknown as HIDDevice, "mock");
    expect(log.getSnapshot().frames).toEqual([]);
    expect(log.getSnapshot().mode).toBe("mock");
  });
});

it("keeps permission errors before attachment without copying the error text", async () => {
  vi.stubGlobal("navigator", {
    hid: {
      addEventListener: vi.fn(),
      getDevices: vi.fn(async () => {
        throw new Error("Permission denied PRIVATE Alex");
      }),
      requestDevice: vi.fn(async () => {
        throw new Error("Permission denied PRIVATE Alex");
      }),
    },
  });
  try {
    for (const client of [new HidClient(), new KeyboardClient(ATK68)]) {
      const connect =
        client instanceof HidClient
          ? client.connectHardware()
          : client.connect();
      await expect(connect).rejects.toThrow(/Permission denied/);
      const report = JSON.parse(
        client.diagnostics.report(identity, "disconnected"),
      );
      expect(report.errors.at(-1).code).toBe("permission-denied");
      expect(report.frames).toEqual([]);
      expect(JSON.stringify(report)).not.toMatch(/PRIVATE|Alex/);
    }
  } finally {
    vi.unstubAllGlobals();
  }
});
