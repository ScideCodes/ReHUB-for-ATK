// Stateful 32-byte VIA-style keyboard (BITYUAN Tv) for parity checks: setters store their payload, getters return it.
// Imported by scripts/parity/keyboards.mjs (Node strips the types) and by keyboards.parity.test.ts. No imports on purpose.
export type KeyboardState = {
  rows: number;
  cols: number;
  version: number[];
  registers: Record<number, number[]>;
  light: number[];
  keymap: number[];
  colors: number[];
  /** Raw travel (u16) and RT ([on, release u16, press u16]) per cell, in the family's unit. */
  travel: number[];
  rt: number[][];
};

export function createKeyboardState(
  rows: number,
  cols: number,
  version: number[],
  colorful: number,
  /** 1000 for BITYUAN (0.001mm), 100 for DUCKBREAD (0.01mm). */
  unit = 1000,
): KeyboardState {
  const mm = (value: number) => Math.round(value * unit);
  return {
    rows,
    cols,
    version,
    // bp options (rgbArea, wasd, mac, win, 6-key, keyMode), kp, Ap, gp dead zones, Lp polling, Rp sleep, Dp, Pp, auto-calibration.
    registers: { 17: [0, 0, 0, 0, 1, 0], 29: [0], 30: [0], 11: [0, 100, 0, 100], 70: [3], 38: [0, 0], 37: [0], 78: [0], 41: [1], 40: [0] },
    light: [2, 0, 128, 255, 255, 255, 60, colorful],
    keymap: Array.from({ length: 4 * rows * cols * 2 }, (_, i) => (i % 2 ? 4 + ((i >> 1) % 26) : 0)),
    colors: Array.from({ length: rows * cols * 3 }, (_, i) => (i * 7) % 256),
    travel: Array.from({ length: rows * cols }, (_, i) => mm(1.5) + (i % 5)),
    rt: Array.from({ length: rows * cols }, (_, i) => [i % 2, ...split(mm(0.3)), ...split(mm(0.15))]),
  };
}

const split = (value: number) => [(value >> 8) & 255, value & 255];

/** Applies one host-to-device frame to `state` and returns the 32-byte reply. */
export function keyboardReply(state: KeyboardState, frame: ArrayLike<number>): number[] {
  const f = Array.from(frame).slice(0, 32);
  const r = f.slice();
  const cells = state.rows * state.cols;
  const cell = (row: number, col: number) => row * state.cols + col;
  if (f[0] === 3 && f[1] === 150 && ![13, 14, 18].includes(f[2])) state.registers[f[2]] = f.slice(3, 3 + (state.registers[f[2]]?.length ?? 4));
  if (f[0] === 2 && f[1] === 150) {
    if (f[2] === 0) r.splice(5, 2, ...state.version);
    else if (state.registers[f[2]]) r.splice(3, state.registers[f[2]].length, ...state.registers[f[2]]);
  }
  // Travel (13) and RT (14) buffers: setters [3, 150, sel, 0, 0, offset, size, op, data], getters [2, 150, sel, 0, 0,
  // offset, size] answer from byte 8. Flash ops are not modelled: the fake stores every chunk as it arrives.
  if ((f[0] === 2 || f[0] === 3) && f[1] === 150 && (f[2] === 13 || f[2] === 14)) {
    const offset = (f[5] << 8) | f[6];
    for (let i = 0; i < f[7] && offset + i < cells; i++) {
      const cellIndex = offset + i;
      if (f[0] === 3 && f[2] === 13) state.travel[cellIndex] = (f[9 + 2 * i] << 8) | f[10 + 2 * i];
      if (f[0] === 3 && f[2] === 14) state.rt[cellIndex] = f.slice(9 + 5 * i, 14 + 5 * i);
      if (f[0] === 2 && f[2] === 13) r.splice(8 + 2 * i, 2, ...split(state.travel[cellIndex]));
      if (f[0] === 2 && f[2] === 14) r.splice(8 + 5 * i, 5, ...state.rt[cellIndex]);
    }
  }
  const key = (layer: number, row: number, col: number) => (layer * cells + cell(row, col)) * 2;
  if (f[0] === 5) state.keymap.splice(key(f[1], f[2], f[3]), 2, f[4], f[5]);
  if (f[0] === 4) r.splice(4, 2, ...state.keymap.slice(key(f[1], f[2], f[3]), key(f[1], f[2], f[3]) + 2));
  if (f[0] === 18) {
    const off = (f[1] << 8) | f[2];
    r.splice(4, f[3], ...state.keymap.slice(off, off + f[3]).concat(Array(f[3]).fill(0)).slice(0, f[3]));
  }
  if (f[0] === 7 && f[1] === 65) state.light = f.slice(2, 10);
  if (f[0] === 8 && f[1] === 65) r.splice(2, 8, ...state.light);
  if (f[0] === 7 && f[1] === 66)
    for (let i = 0; i < f[4]; i++) state.colors.splice((cell(f[2], f[3]) + i) * 3, 3, ...f.slice(5 + 3 * i, 8 + 3 * i));
  // HFD Tm: set [7, 69, row, 6n, 6, six [index, r, g, b]], get [8, 69, row, 6n, 6, indexes] -> [index, r, g, b].
  if (f[0] === 7 && f[1] === 69)
    for (let i = 0; i < 6 && f[3] + i < state.cols; i++) state.colors.splice((cell(f[2], f[3]) + i) * 3, 3, ...f.slice(6 + 4 * i, 9 + 4 * i));
  if (f[0] === 8 && f[1] === 69 && f[4] === 6)
    for (let i = 0; i < 6; i++) {
      const at = (cell(f[2], f[3]) + i) * 3;
      r.splice(5 + 4 * i, 4, f[5 + 4 * i], ...(f[3] + i < state.cols ? state.colors.slice(at, at + 3) : [0, 0, 0]));
    }
  else if (f[0] === 8 && f[1] === 69)
    for (let i = 0; i < f[4] && f[3] + i < state.cols; i++)
      r.splice(5 + 3 * i, 3, ...state.colors.slice((cell(f[2], f[3]) + i) * 3, (cell(f[2], f[3]) + i) * 3 + 3));
  return r.slice(0, 32);
}
