import { expect, it } from "vitest";
import { createKeyboardSettings } from "../devices/keyboardSettings";
import {
  keyboardCacheIdentity,
  parseKeyboardCacheEntry,
  loadKeyboardSnapshot,
} from "./keyboardSnapshotCache";
it("validates version, identity, settings and size before displaying a persistent snapshot", () => {
  const identity = keyboardCacheIdentity(
    { vendorId: 0x373b, productId: 0x1048, productName: "ATK68" },
    0xff60,
    0x61,
  );
  const snapshot = {
    settings: createKeyboardSettings(),
    firmware: "1.0",
    unreadFields: [],
    warnings: [],
  };
  const entry = { version: 1, identity, savedAt: 1, snapshot };
  expect(
    parseKeyboardCacheEntry(entry, identity)?.snapshot.settings.pollingRate,
  ).toBe(1000);
  expect(
    parseKeyboardCacheEntry({ ...entry, version: 2 }, identity),
  ).toBeNull();
  expect(parseKeyboardCacheEntry(entry, identity + "other")).toBeNull();
  expect(
    parseKeyboardCacheEntry(
      {
        ...entry,
        snapshot: {
          ...snapshot,
          settings: { ...snapshot.settings, pollingRate: 0 },
        },
      },
      identity,
    ),
  ).toBeNull();
  expect(
    parseKeyboardCacheEntry(
      { ...entry, padding: "x".repeat(256 * 1024) },
      identity,
    ),
  ).toBeNull();
  expect(
    keyboardCacheIdentity(
      { vendorId: 0x373b, productId: 0x1048, productName: "other" },
      0xff60,
      0x61,
    ),
  ).not.toBe(identity);
  expect(
    keyboardCacheIdentity(
      { vendorId: 0x373b, productId: 0x1048, productName: "ATK68" },
      0xff02,
      0x61,
    ),
  ).not.toBe(identity);
});

it("ignores a denied IndexedDB getter so storage cannot block hardware reads", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    get: () => {
      throw new Error("Storage denied");
    },
  });
  try {
    await expect(loadKeyboardSnapshot("device")).resolves.toBeNull();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "indexedDB", descriptor);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  }
});
