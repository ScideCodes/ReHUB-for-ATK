import type { KeyboardSettings } from "../../devices/keyboardSettings";
// Independent fake encoding follows IL/RL/CL offsets in the extracted DUCKBREAD source.
export function fillKeyboardBulkReply(
  request: Uint8Array,
  reply: Uint8Array,
  settings: KeyboardSettings,
) {
  if (request[0] === 8 && request[1] === 69)
    for (let i = 0; i < request[4]; i++) {
      const color =
        settings.keys.find(
          (key) => key.row === request[2] && key.col === request[3] + i,
        )?.color ?? "#000000";
      reply.set(
        color
          .slice(1)
          .match(/../g)!
          .map((value) => parseInt(value, 16)),
        5 + i * 3,
      );
    }
  const view = new DataView(reply.buffer, reply.byteOffset, reply.byteLength);
  if (request[0] === 2 && [13, 14].includes(request[2])) {
    const offset = new DataView(
      request.buffer,
      request.byteOffset,
      request.byteLength,
    ).getUint16(5);
    for (let i = 0; i < request[7]; i++) {
      const index = offset + i,
        key = settings.keys.find((k) => k.row * 15 + k.col === index);
      if (request[2] === 13)
        view.setUint16(8 + i * 2, Math.round((key?.actuation ?? 1.5) * 100));
      else {
        reply[8 + i * 5] = Number(key?.rt.on ?? false);
        view.setUint16(9 + i * 5, Math.round((key?.rt.release ?? 0.1) * 100));
        view.setUint16(11 + i * 5, Math.round((key?.rt.press ?? 0.1) * 100));
      }
    }
  }
  if (request[0] === 18) {
    const offset = new DataView(
      request.buffer,
      request.byteOffset,
      request.byteLength,
    ).getUint16(1);
    for (let i = 0; i < 14; i++) {
      const index = offset / 2 + i,
        layer = Math.floor(index / 75),
        cell = index % 75;
      const key = settings.keys.find((k) => k.row * 15 + k.col === cell);
      reply.set(key?.layers[layer] ?? [0, 0], 4 + i * 2);
    }
  }
}
