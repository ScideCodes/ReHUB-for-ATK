import { describe, it, expect, vi } from "vitest";
import {
  inspectDevice,
  inspectDevices,
  createReport,
  issueLink,
} from "./deviceReport";

describe("community device reports", () => {
  it("retains every selected composite-device interface", () => {
    const metadata = inspectDevices([
      { vendorId: 1, productId: 2, collections: [{ usagePage: 1 }] },
      { vendorId: 1, productId: 2, collections: [{ usagePage: 0xff60 }] },
    ]);
    expect(metadata).toHaveLength(2);
    expect(metadata.map((d) => d.collections[0].usagePage)).toEqual([
      1, 0xff60,
    ]);
  });
  it("inspects unknown devices without opening or sending and omits secrets", () => {
    const device = {
      vendorId: 123,
      productId: 456,
      productName: "PRIVATE",
      serialNumber: "SECRET",
      collections: [
        {
          usagePage: 0xff60,
          usage: 0x61,
          inputReports: [
            { reportId: 0, items: [{ reportSize: 8, reportCount: 32 }] },
          ],
        },
      ],
      open: vi.fn(),
      sendReport: vi.fn(),
    };
    const metadata = inspectDevice(device as unknown as HIDDevice);
    expect(metadata.collections[0].input[0]).toEqual({ id: 0, bytes: 32 });
    expect(device.open).not.toHaveBeenCalled();
    expect(device.sendReport).not.toHaveBeenCalled();
    expect(JSON.stringify(metadata)).not.toMatch(/PRIVATE|SECRET/);
    expect(metadata.vendorId).toBe("0x007B");
  });
  it("refuses boot collections without opening the device", () => {
    expect(() =>
      inspectDevice({ collections: [{ usagePage: 0xff02 }] } as HIDDevice),
    ).toThrow(/boot/i);
  });
  it("allowlists diagnostics fields and labels simulations", () => {
    const report = createReport(
      {
        model: "Test",
        connection: "wired",
        outcome: "not-detected",
        notes: "",
        firmware: "",
        os: "Windows 11",
      },
      null,
      JSON.stringify({
        mode: "mock",
        frames: [{ hex: "SECRET" }],
        serial: "PRIVATE",
        errors: [{ code: "timeout" }, { code: "PRIVATE" }],
        identity: { vendorId: 1, productId: 2 },
      }),
    );
    expect(report.diagnostics?.mode).toBe("mock");
    expect(JSON.stringify(report)).not.toMatch(/SECRET|PRIVATE|hex/);
    expect(report.diagnostics?.errors).toEqual(["timeout"]);
  });
  it("never silently truncates large reports in issue URLs", () => {
    const small = issueLink("Test", "short report");
    expect(small.attachmentRequired).toBe(false);
    expect(new URL(small.url).searchParams.get("body")).toContain(
      "short report",
    );
    const large = issueLink("Test", "x".repeat(20000));
    expect(large.attachmentRequired).toBe(true);
    expect(large.url.length).toBeLessThan(7000);
    expect(new URL(large.url).searchParams.get("body")).toContain("Attach");
  });
});
