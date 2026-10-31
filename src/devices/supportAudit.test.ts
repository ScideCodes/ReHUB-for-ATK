import { expect, it } from "vitest";
import { DEVICE_REGISTRY } from "./registry";
import catalog from "./sourceCatalog.json";
import mouseSource from "./sourceMouseProtocols.json";
import {
  verifiedKeyboardFilters,
  verifiedKeyboardProfile,
} from "./keyboardProtocols";
import {
  mouseEndpointSupportsReal,
  readableMouseIdentity,
  verifiedMouseIdentity,
} from "./mouseProtocols";
import { validateKeyboardWrite } from "../protocol/keyboardWrites";
import { keyboardAdapter } from "../protocol/keyboardAdapters";

it("pins the complete runtime verdict inventory without granting writes to read-only families", () => {
  const keyboards = DEVICE_REGISTRY.filter((d) => d.kind === "keyboard");
  const real = keyboards.filter((d) => verifiedKeyboardProfile(d));
  expect(keyboards).toHaveLength(130);
  expect(real).toHaveLength(111);
  expect(
    real.filter((d) => verifiedKeyboardProfile(d)?.keySettings),
  ).toHaveLength(1);
  // Opt-in untested tier: RS7 (bP), 92 BITYUAN, 7 HFD, 8 BYKB; ARBITER stays read-only.
  const untested = real.filter((d) => {
    const p = verifiedKeyboardProfile(d);
    return !!p && "untestedWrites" in p && p.untestedWrites;
  });
  expect(untested).toHaveLength(108);
  // DUCKBREAD polling: admitted only for the bP writers (ATK68 verified, RS7 untested).
  const frame = new Uint8Array(32);
  frame.set([3, 150, 34, 1]);
  for (const device of keyboards.filter(
    (d) => d.protocolFamily !== "DUCKBREAD",
  ))
    expect(() => validateKeyboardWrite(frame, device)).toThrow();
  expect(verifiedKeyboardFilters()).toHaveLength(111);
  expect(
    // ARBITER's two source filters (Nm) are usagePage 1 / usage 0; all others FF60/0061.
    verifiedKeyboardFilters().every((f) =>
      [0x105e, 0x10c2].includes(f.productId!)
        ? f.usagePage === 1 && f.usage === 0
        : f.usagePage === 0xff60 && f.usage === 0x61,
    ),
  ).toBe(true);
});

it("matches every HFD endpoint to source RP/Pm geometry and excludes forged collections", () => {
  const endpoints = catalog.entries.filter((e) => e.protocolFamily === "HFD");
  expect(endpoints).toHaveLength(7);
  for (const entry of endpoints) {
    expect(entry.symbol).toBe("RP");
    expect(entry.controller).toBe("Pm");
    const device = DEVICE_REGISTRY.find(
      (d) =>
        Number(d.VID) === entry.vendorId &&
        Number(d.PID) === entry.productId &&
        d.kind === "keyboard",
    )!;
    expect(verifiedKeyboardProfile(device)).toMatchObject({
      rows: entry.custom.row,
      columns: entry.custom.col,
      keySettings: false,
    });
    for (const patch of [
      { usagePage: 0xff02 },
      { usage: 0 },
      { reportId: 8 },
      { protocolFamily: "DUCKBREAD" },
      { PID: "0xFFFF" },
    ])
      expect(verifiedKeyboardProfile({ ...device, ...patch })).toBeUndefined();
    const adapter = keyboardAdapter(device)!;
    const frame = adapter.readFrame("version");
    expect(() => adapter.validateRead(frame, device)).not.toThrow();
    const padded = frame.slice();
    padded[31] = 1;
    expect(() => adapter.validateRead(padded, device)).toThrow();
    expect(() => adapter.validateRead(frame.slice(1), device)).toThrow();
    const wrong = frame.slice();
    wrong[2] = 0;
    expect(adapter.matchesReply(frame, wrong)).toBe(false);
  }
});

it("pins all mouse endpoint verdicts and keeps receiver writes dependent on paired identity", () => {
  const mice = DEVICE_REGISTRY.filter((d) => d.kind === "mouse");
  const compatible = mouseSource.filter(
    (d) =>
      !d.receiver &&
      d.sensor === "PAW3950Ultra" &&
      d.noDpiRGB &&
      d.noBottomButton,
  );
  expect(mice).toHaveLength(190);
  expect(compatible).toHaveLength(8);
  let wired = 0,
    writableWired = 0,
    receivers = 0,
    demo = 0;
  for (const device of mice) {
    const source = mouseSource.find(
      (e) =>
        e.vendorId === Number(device.VID) && e.productId === Number(device.PID),
    )!;
    expect(source).toBeDefined();
    if (source.receiver) {
      receivers++;
      expect(
        verifiedMouseIdentity(source.vendorId, source.productId, 0, 0),
      ).toBe(false);
      expect(
        verifiedMouseIdentity(source.vendorId, source.productId, 255, 255),
      ).toBe(false);
      for (const model of compatible) {
        const [cid, mid] = model.cidMid!.split(",").map(Number);
        expect(
          verifiedMouseIdentity(source.vendorId, source.productId, cid, mid),
        ).toBe(true);
      }
    } else if (mouseEndpointSupportsReal(source.vendorId, source.productId)) {
      wired++;
      const [cid, mid] = source.cidMid!.split(",").map(Number);
      expect(readableMouseIdentity(source.vendorId, source.productId, cid, mid)).toBe(true);
      // Read tier never grants writes: only the eight integrated profiles are writable.
      const writable = verifiedMouseIdentity(source.vendorId, source.productId, cid, mid);
      expect(writable).toBe(compatible.includes(source));
      if (writable) writableWired++;
    } else demo++;
  }
  expect({ wired, writableWired, receivers, demo }).toEqual({
    wired: 145, // every source mouse profile: 8 writable, 137 read-only
    writableWired: 8,
    receivers: 45,
    demo: 0,
  });
});
