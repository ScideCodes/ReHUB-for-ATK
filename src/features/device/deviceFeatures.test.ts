import { describe, expect, it } from "vitest";
import { isDeviceFeatureSupported } from "./deviceFeatures";
import { DEVICES } from "../../protocol/constants";
import type { DeviceDefinition } from "../../types/schema";

describe("deviceFeatures", () => {
  const atk68V2Pro = DEVICES.find((d) => d.name === "ATK 68 V2 Pro");

  it("shows supported features for ATK 68 V2 Pro and hides unsupported features", () => {
    expect(atk68V2Pro).toBeDefined();

    // Supported on ATK 68 V2 Pro
    expect(isDeviceFeatureSupported("buttons", atk68V2Pro)).toBe(true);
    expect(isDeviceFeatureSupported("performance", atk68V2Pro)).toBe(true);
    expect(isDeviceFeatureSupported("lighting", atk68V2Pro)).toBe(true);
    expect(isDeviceFeatureSupported("macro", atk68V2Pro)).toBe(true);

    // Unsupported on ATK 68 V2 Pro (optical mouse features / power)
    expect(isDeviceFeatureSupported("sensitivity", atk68V2Pro)).toBe(false);
    expect(isDeviceFeatureSupported("clicks", atk68V2Pro)).toBe(false);
    expect(isDeviceFeatureSupported("power", atk68V2Pro)).toBe(false);
    expect(isDeviceFeatureSupported("lod", atk68V2Pro)).toBe(false);
    expect(isDeviceFeatureSupported("sensorAngle", atk68V2Pro)).toBe(false);
  });

  it("hides features for a device without those features", () => {
    // Device without features list
    const unconfigured: DeviceDefinition = {
      name: "Bare Device",
      VID: "0x373B",
      PID: "0x0000",
      features: [],
    };
    expect(isDeviceFeatureSupported("buttons", unconfigured)).toBe(false);
    expect(isDeviceFeatureSupported("performance", unconfigured)).toBe(false);
    expect(isDeviceFeatureSupported("lighting", unconfigured)).toBe(false);
    expect(isDeviceFeatureSupported("macro", unconfigured)).toBe(false);

    // Device with only lighting
    const lightingOnlyDevice: DeviceDefinition = {
      name: "Light Key",
      VID: "0x373B",
      PID: "0x9999",
      features: ["Custom Lighting (Per-Key RGB)"],
    };
    expect(isDeviceFeatureSupported("lighting", lightingOnlyDevice)).toBe(true);
    expect(isDeviceFeatureSupported("performance", lightingOnlyDevice)).toBe(
      false,
    );
    expect(isDeviceFeatureSupported("buttons", lightingOnlyDevice)).toBe(false);
    expect(isDeviceFeatureSupported("macro", lightingOnlyDevice)).toBe(false);
  });

  it("keeps standard mouse features enabled when no keyboard is selected", () => {
    expect(isDeviceFeatureSupported("sensitivity", null)).toBe(true);
    expect(isDeviceFeatureSupported("buttons", null)).toBe(true);
    expect(isDeviceFeatureSupported("performance", null)).toBe(true);
    expect(isDeviceFeatureSupported("lighting", null)).toBe(true);
    expect(isDeviceFeatureSupported("clicks", null)).toBe(true);
    expect(isDeviceFeatureSupported("power", null)).toBe(true);
    expect(isDeviceFeatureSupported("macro", null)).toBe(true);
    expect(isDeviceFeatureSupported("lod", null)).toBe(true);
  });

  it("loops over every device in devices.json and checks that the UI shows exactly the tabs and controls for the features it lists, and none for features it doesn't", () => {
    const UI_TABS = [
      {
        id: "sensitivity",
        match: (f: string) => f.includes("dpi") || f.includes("sensitivity"),
      },
      {
        id: "buttons",
        match: (f: string) =>
          f.includes("key remapping") ||
          f.includes("button") ||
          f.includes("keys"),
      },
      {
        id: "performance",
        match: (f: string) =>
          f.includes("rapid trigger") ||
          f.includes("rt") ||
          f.includes("performance") ||
          f.includes("actuation") ||
          f.includes("snap tap") ||
          f.includes("socd"),
      },
      {
        id: "lighting",
        match: (f: string) =>
          f.includes("lighting") || f.includes("rgb") || f.includes("light"),
      },
      {
        id: "clicks",
        match: (f: string) => f.includes("debounce") || f.includes("click"),
      },
      {
        id: "power",
        match: (f: string) =>
          f.includes("power") ||
          f.includes("battery") ||
          f.includes("wireless"),
      },
      { id: "macro", match: (f: string) => f.includes("macro") },
    ] as const;

    const UI_CONTROLS = [
      {
        id: "lod",
        match: (f: string) => f.includes("lod") || f.includes("lift-off"),
      },
      {
        id: "sensorAngle",
        match: (f: string) =>
          f.includes("sensor angle") || f.includes("rotation"),
      },
      {
        id: "longDistance",
        match: (f: string) =>
          f.includes("long distance") || f.includes("rf boost"),
      },
      { id: "sensorPower", match: (f: string) => f.includes("sensor power") },
      { id: "rippleControl", match: (f: string) => f.includes("ripple") },
      {
        id: "motionSync",
        match: (f: string) =>
          f.includes("motion sync") || f.includes("motionsync"),
      },
      {
        id: "angleSnapping",
        match: (f: string) =>
          f.includes("angle snap") || f.includes("anglesnap"),
      },
    ] as const;

    expect(DEVICES.length).toBeGreaterThan(0);

    for (const dev of DEVICES) {
      const normalizedFeatures = (dev.features || []).map((f) =>
        f.toLowerCase(),
      );

      // Check all UI tabs
      for (const tab of UI_TABS) {
        const expected = normalizedFeatures.some(tab.match);
        const actual = isDeviceFeatureSupported(tab.id, dev);
        expect(
          actual,
          `Device "${dev.name}" (${dev.VID}:${dev.PID}) tab "${tab.id}" expected ${expected} but got ${actual}`,
        ).toBe(expected);
      }

      // Check all UI controls
      for (const control of UI_CONTROLS) {
        const expected = normalizedFeatures.some(control.match);
        const actual = isDeviceFeatureSupported(control.id, dev);
        expect(
          actual,
          `Device "${dev.name}" (${dev.VID}:${dev.PID}) control "${control.id}" expected ${expected} but got ${actual}`,
        ).toBe(expected);
      }

      // Check rapid trigger control
      const hasRapidTriggerExpected = normalizedFeatures.some((f) =>
        f.includes("rapid trigger"),
      );
      const hasRapidTriggerActual = Boolean(
        dev.features?.some((f) => f.toLowerCase().includes("rapid trigger")),
      );
      expect(hasRapidTriggerActual).toBe(hasRapidTriggerExpected);
    }
  });
});
