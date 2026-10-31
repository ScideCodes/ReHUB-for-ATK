import { z } from "zod";
import { KeyboardSettingsSchema } from "../devices/keyboardSettings";
import type { KeyboardSnapshot } from "./keyboardClient";

const MAX_BYTES = 256 * 1024,
  MAX_ENTRIES = 16;
const entrySchema = z.object({
  version: z.literal(1),
  identity: z.string().max(512),
  savedAt: z.number().finite().nonnegative(),
  snapshot: z.object({
    settings: KeyboardSettingsSchema,
    firmware: z.string().max(64),
    unreadFields: z
      .array(
        z.enum([
          "pollingRate",
          "options",
          "deadZone",
          "light",
          "keys",
          "macros",
          "advanced",
        ]),
      )
      .max(7),
    warnings: z.array(z.string().max(512)).max(20),
  }),
});
export function keyboardCacheIdentity(
  device: Pick<HIDDevice, "vendorId" | "productId" | "productName">,
  usagePage: number,
  usage: number,
) {
  return JSON.stringify([
    device.vendorId,
    device.productId,
    usagePage,
    usage,
    device.productName ?? "",
  ]);
}
export function parseKeyboardCacheEntry(value: unknown, identity: string) {
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_BYTES)
      return null;
    const result = entrySchema.safeParse(value);
    return result.success && result.data.identity === identity
      ? result.data
      : null;
  } catch {
    return null;
  }
}

async function database<T>(
  use: (store: IDBObjectStore, done: (value: T) => void) => void,
  mode: IDBTransactionMode,
): Promise<T | null> {
  let storage: IDBFactory;
  try {
    if (typeof indexedDB === "undefined") return null;
    storage = indexedDB;
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    let db: IDBDatabase | undefined,
      transaction: IDBTransaction | undefined,
      result: T | null = null,
      settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      db?.close();
      resolve(result);
    };
    // Optional local cache must never delay hardware access on blocked/unavailable storage.
    const timer = setTimeout(() => {
      transaction?.abort();
      finish();
    }, 150);
    try {
      const request = storage.open("atk-hub-keyboard-snapshots", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("snapshots", { keyPath: "identity" });
      };
      request.onerror = () => finish();
      request.onblocked = () => finish();
      request.onsuccess = () => {
        db = request.result;
        if (settled) {
          db.close();
          return;
        }
        db.onversionchange = () => db?.close();
        try {
          transaction = db.transaction("snapshots", mode);
          transaction.oncomplete = () => finish();
          transaction.onerror = () => finish();
          transaction.onabort = () => finish();
          use(transaction.objectStore("snapshots"), (value) => {
            result = value;
          });
        } catch {
          finish();
        }
      };
    } catch {
      finish();
    }
  });
}
export async function loadKeyboardSnapshot(
  identity: string,
): Promise<KeyboardSnapshot | null> {
  return database<KeyboardSnapshot>((store, done) => {
    const request = store.get(identity);
    request.onsuccess = () => {
      const entry = parseKeyboardCacheEntry(request.result, identity);
      if (entry) done(entry.snapshot);
    };
  }, "readonly");
}
export async function saveKeyboardSnapshot(
  identity: string,
  snapshot: KeyboardSnapshot,
) {
  const entry = parseKeyboardCacheEntry(
    { version: 1, identity, savedAt: Date.now(), snapshot },
    identity,
  );
  if (!entry || snapshot.warnings.length) return;
  await database<boolean>((store, done) => {
    store.put(entry);
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = request.result as { identity: string; savedAt: number }[];
      entries.sort((a, b) => b.savedAt - a.savedAt);
      for (const old of entries.slice(MAX_ENTRIES)) store.delete(old.identity);
      done(true);
    };
  }, "readwrite");
}
