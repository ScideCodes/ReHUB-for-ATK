export type KeyboardBulkKind = "travel" | "rt" | "keys";
// demoMode.store-CXKd1LXo.js: IL.get (12*2 bytes), RL.get/rtV2 (4*5), CL.get (28).
export function keyboardBulkRead(kind: KeyboardBulkKind, offset: number) {
  const frame = new Uint8Array(32),
    view = new DataView(frame.buffer);
  if (kind === "keys") {
    frame[0] = 18;
    view.setUint16(1, offset);
    frame[3] = 28;
  } else {
    frame.set([2, 150, kind === "travel" ? 13 : 14]);
    view.setUint16(5, offset);
    frame[7] = kind === "travel" ? 12 : 4;
  }
  return frame;
}
export function validKeyboardBulkRead(frame: Uint8Array, rows = 5, cols = 15) {
  if (frame.length !== 32) return false;
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  if (frame[0] === 18) {
    const offset = view.getUint16(1);
    return (
      offset % 28 === 0 &&
      offset < 4 * rows * cols * 2 &&
      frame[3] === 28 &&
      frame.slice(4).every((b) => b === 0)
    );
  }
  if (frame[0] !== 2 || frame[1] !== 150 || ![13, 14].includes(frame[2]))
    return false;
  const count = frame[2] === 13 ? 12 : 4,
    offset = view.getUint16(5);
  return (
    frame[3] === 0 &&
    frame[4] === 0 &&
    offset % count === 0 &&
    offset < rows * cols &&
    frame[7] === count &&
    frame.slice(8).every((b) => b === 0)
  );
}
