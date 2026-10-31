import {
  keyboardBulkRead,
  type KeyboardBulkKind,
} from "../protocol/keyboardBulk";
import { keyboardRead, keyboardKeyRead } from "../protocol/keyboard";
import type { KeyboardReadScope } from "./keyboardClient";

export async function fetchKeyboardKeyBlocks(
  scope: KeyboardReadScope,
  layer: number,
  fetch: (frame: Uint8Array, required: boolean) => Promise<Uint8Array>,
  put: (frame: Uint8Array, response: Uint8Array) => void,
  rows = 5,
  cols = 15,
  /** HFD Pm has no IL/RL travel or rapid-trigger buffers. */
  trigger = true,
) {
  const cells = rows * cols;
  async function blocks(
    kind: KeyboardBulkKind,
    start: number,
    end: number,
    count: number,
  ) {
    for (let offset = start; offset < end; offset += count) {
      const data = await fetch(keyboardBulkRead(kind, offset), true);
      for (let i = 0; i < (kind === "keys" ? 14 : count); i++) {
        if (kind === "keys") {
          const index = offset / 2 + i,
            cell = index % cells,
            layer = Math.floor(index / cells);
          if (layer >= 4) continue;
          const frame = keyboardKeyRead(
              layer,
              Math.floor(cell / cols),
              cell % cols,
            ),
            reply = frame.slice();
          reply.set(data.slice(4 + i * 2, 6 + i * 2), 4);
          put(frame, reply);
        } else {
          const cell = offset + i;
          if (cell >= cells) continue;
          const frame = keyboardRead(
              kind === "travel" ? "actuation" : "rt",
              Math.floor(cell / cols),
              cell % cols,
            ),
            reply = frame.slice();
          const size = kind === "travel" ? 2 : 5;
          reply.set(data.slice(8 + i * size, 8 + (i + 1) * size), 5);
          put(frame, reply);
        }
      }
    }
  }
  // Source IL/RL blocks stay serialized with one correlated request in flight.
  if (trigger && (scope === "all" || scope === "trigger")) {
    await blocks("travel", 0, cells, 12);
    await blocks("rt", 0, cells, 4);
  }
  if (scope === "all" || scope === "keys") {
    const start = scope === "all" ? 0 : Math.floor((layer * cells * 2) / 28) * 28;
    const end = scope === "all" ? 4 * cells * 2 : (layer + 1) * cells * 2;
    await blocks("keys", start, end, 28);
  }
}
