import type { DeviceDefinition } from "../types/schema";
import { DEVICE_REGISTRY } from "./registry";
import keyboardMatrix from "./keyboardMatrix.json";

// Source: demoMode.store-CXKd1LXo.js:
// DUCKBREAD: xP/AP definitions instantiate bP. AP is 5x15 (verified read/write); xP is 6x16 (opt-in untested writes).
// BITYUAN: Bv/zv/Zv/ng definitions instantiate Tv (extends vv). 92 source-matched registry endpoints are read-only.
const duckbreadEndpoints = [
  {
    vendorId: 0x373b,
    productId: 0x1048,
    rows: 5,
    columns: 15,
    keySettings: true,
  },
  {
    vendorId: 0x373b,
    productId: 0x1044,
    rows: 6,
    columns: 16,
    keySettings: false,
    // Same bP controller and setters as the ATK68 writer; opt-in, untested on RS7 hardware.
    untestedWrites: true,
  },
] as const;

// demoMode.store-CXKd1LXo.js: RP -> Pm, bm.get; sourceCatalog RP endpoints, 8x16 matrix. Firmware reads only.
const hfdProductIds = [0x111e, 0x111f, 0x1231, 0x114d, 0x114e, 0x1151, 0x1152];

// bykb-keyboard-controller Bt via Aee filters (solutionProvider 13): A87/A98/V75X Ultra and RS8 Neo, wired and 8K receiver.
// demoMode.store Nm filters: ATK68 V2 (105E) and ATK68 V2 S (10C2).
const arbiterProductIds = [0x105e, 0x10c2];
const bykbProductIds = [0x1241, 0x1242, 0x1243, 0x1244, 0x1247, 0x124b, 0x1254, 0x1255];

export function verifiedKeyboardProfile(definition: DeviceDefinition) {
  const arbiter = definition.protocolFamily === "ARBITER";
  const canonical = DEVICE_REGISTRY.find(
    (entry) =>
      entry.kind === "keyboard" &&
      entry.VID === definition.VID &&
      entry.PID === definition.PID &&
      entry.id === definition.id,
  );
  if (
    !canonical ||
    definition.kind !== "keyboard" ||
    canonical.protocolFamily !== definition.protocolFamily ||
    // ARBITER's source filters (Nm) use usagePage 1 / usage 0; every other family FF60/0061.
    definition.usagePage !== (arbiter ? 1 : 0xff60) ||
    definition.usage !== (arbiter ? 0 : 0x61) ||
    definition.reportId !== 0
  )
    return undefined;

  if (definition.protocolFamily === "DUCKBREAD") {
    const endpoint = duckbreadEndpoints.find(
      (entry) =>
        entry.vendorId === Number(definition.VID) &&
        entry.productId === Number(definition.PID),
    );
    if (!endpoint) return undefined;
    // bP reads (CL/IL/RL/qL) size by the source row/col; RS7 1044 reads its 6x16 matrix, writes stay ATK68-only.
    return { ...endpoint, keyMatrixRead: true };
  }

  if (definition.protocolFamily === "BITYUAN") {
    // Source: demoMode.store-CXKd1LXo.js: Tv controller extends vv; yp.get() [2, 150, 0] 32-byte frame.
    // Base reads (version, options, deadZone, light) verified.
    // Key matrix reads (CL/IL/RL/af) only where the source row/col matrix fits a source layout.
    if (Number(definition.VID) !== 0x373b) return undefined;
    const matrix = (keyboardMatrix as Record<string, number[]>)[definition.id ?? ""];
    return {
      vendorId: Number(definition.VID),
      productId: Number(definition.PID),
      rows: matrix?.[0] ?? 5,
      columns: matrix?.[1] ?? 15,
      keySettings: false,
      keyMatrixRead: !!matrix,
      // Opt-in, session-consented single-frame Tv setters (src/protocol/keyboards/bityuanWrites.ts); hardware untested.
      untestedWrites: true,
    };
  }

  if (
    definition.protocolFamily === "HFD" &&
    Number(definition.VID) === 0x373b &&
    hfdProductIds.includes(Number(definition.PID))
  )
    return {
      vendorId: 0x373b,
      productId: Number(definition.PID),
      rows: 8,
      columns: 16,
      keySettings: false,
      // Pm.getCurrentKeyMatrix (vm) and getAllKeysCustomLed (Tm) where the source layout fits 8x16.
      keyMatrixRead: definition.id! in keyboardMatrix,
      // Opt-in untested keymap writes (fm), only where the matrix (and so the readback) is known.
      untestedWrites: definition.id! in keyboardMatrix,
    };

  if (arbiter && Number(definition.VID) === 0x373b && arbiterProductIds.includes(Number(definition.PID)))
    // Firmware, polling and dead zones only; 3-byte keycodes and per-key trigger records stay local.
    return {
      vendorId: 0x373b,
      productId: Number(definition.PID),
      rows: 8,
      columns: 16,
      keySettings: false,
    };

  if (
    definition.protocolFamily === "13" &&
    Number(definition.VID) === 0x373b &&
    bykbProductIds.includes(Number(definition.PID))
  )
    // Firmware, polling, option and keymap reads; opt-in untested SDK-traced writes (src/protocol/keyboards/bykb.ts).
    return {
      vendorId: 0x373b,
      productId: Number(definition.PID),
      rows: 6,
      columns: 16,
      keySettings: false,
      untestedWrites: true,
    };

  return undefined;
}

export function verifiedKeyboardFilters(): HIDDeviceFilter[] {
  return DEVICE_REGISTRY.filter((definition) =>
    verifiedKeyboardProfile(definition),
  ).map((definition) => ({
    vendorId: Number(definition.VID),
    productId: Number(definition.PID),
    usagePage: definition.usagePage,
    usage: definition.usage,
  }));
}
