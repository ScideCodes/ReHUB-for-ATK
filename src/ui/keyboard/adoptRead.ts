import type { KeyboardSettings } from "../../devices/keyboardSettings";
import type { KeyboardSnapshot } from "../../hid/keyboardClient";

/** Copies only the verified parts of a hardware read into map settings, matching keys by matrix position. */
export function adoptRead(settings: KeyboardSettings, snapshot: KeyboardSnapshot) {
  const { settings: read, unreadFields: unread } = snapshot;
  const s = structuredClone(settings);
  if (!unread.includes("pollingRate")) s.pollingRate = read.pollingRate;
  if (!unread.includes("options")) s.options = structuredClone(read.options);
  if (!unread.includes("light")) s.light = structuredClone(read.light);
  if (!unread.includes("deadZone")) s.deadZone = structuredClone(read.deadZone);
  const byPosition = new Map(read.keys.map((key) => [`${key.row}:${key.col}`, key]));
  for (const key of s.keys) {
    const observed = byPosition.get(`${key.row}:${key.col}`);
    if (!observed) continue;
    if (snapshot.unreadKeyColors === false) key.color = observed.color;
    if (snapshot.unreadKeyLayers === false) key.layers = structuredClone(observed.layers);
    if (snapshot.unreadKeyTrigger === false) {
      key.actuation = observed.actuation;
      key.rt = { ...observed.rt };
    }
  }
  return s;
}
