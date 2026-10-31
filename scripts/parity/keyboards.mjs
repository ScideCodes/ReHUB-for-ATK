// Parity fixtures for keyboards: drives the original controllers on the stateful fake in src/devices/parity/viaFake.ts,
// one UI action per scenario, and records the device state each ends with. keyboards.parity.test.ts replays the same
// actions through this app. BITYUAN Tv is an export of demoMode.store; DUCKBREAD bP (ATK68/RS7) is not, so the bundle
// files are copied to a temp folder and one export line is appended to that copy (the extracted files stay untouched).
// Needs ../extracted and Node with TypeScript type stripping (22.18+/24). Usage: node scripts/parity/keyboards.mjs
import { cpSync, mkdtempSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const extracted = resolve(dirname(fileURLToPath(import.meta.url)), "../../../extracted/asar_unpacked/static");
const copy = mkdtempSync(join(tmpdir(), "atk-parity-"));
for (const file of readdirSync(extracted).filter((f) => f.endsWith(".js"))) cpSync(join(extracted, file), join(copy, file));
appendFileSync(join(copy, "demoMode.store-CXKd1LXo.js"), "\nexport{bP as __parity_bP, Pm as __parity_Pm};\n");
process.env.PARITY_STATIC = copy;
const { staticDir } = await import("./env.mjs");
const { createKeyboardState, keyboardReply } = await import("../../src/devices/parity/viaFake.ts");
const mod = await import(staticDir + "demoMode.store-CXKd1LXo.js");

function fakeDevice(state, productId) {
  const device = {
    vendorId: 0x373b, productId, opened: true, collections: [], oninputreport: null,
    async open() {}, async close() {},
    async sendReport(id, data) {
      const reply = keyboardReply(state, new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength ?? data.length));
      setTimeout(() => device.oninputreport?.({ reportId: id, data: new DataView(new Uint8Array(reply).buffer) }), 0);
    },
  };
  return device;
}

// The original UI reads a config with the getter, changes one field and passes the whole config to the setter.
const fn = (change) => async (kb) => kb.setKeyboardFunction({ keyboardConfig: { ...(await kb.getKeyboardFunction()).data, ...change } });
const common = {
  winLockOn: fn({ winLock: 1 }),
  wasdSwapOn: fn({ exchangeWasd: 1 }),
  macOn: fn({ macSwitch: 1 }),
  sixKeyToggle: async (kb) => {
    const cfg = (await kb.getKeyboardFunction()).data;
    return kb.setKeyboardFunction({ keyboardConfig: { ...cfg, sixKeyNoPunch: !cfg.sixKeyNoPunch } });
  },
  bottomOn: fn({ bottomTrigger: 1 }),
  gameModeOn: fn({ performanceMode: 1 }),
  deadZone: async (kb) => kb.setDeadZone({ top: 0.2, bottom: 0.35 }),
  lightBrightness: async (kb) => kb.setLightConfig({ ...(await kb.getLightConfig()).data, brightness: 25 }),
  lightMode: async (kb) => kb.setLightConfig({ ...(await kb.getLightConfig()).data, mode: 6, color: [0, 128, 255] }),
  keyAssign: async (kb) => kb.setKey({ layer: 1, row: 0, col: 1, changeKey: [0, 20] }),
  keyColor: async (kb, cols) => {
    // getAllKeysCustomLed returns one list per row (8 * ceil(col / 8) colours); the setter takes them flattened.
    const { data } = await kb.getAllKeysCustomLed();
    const rowsList = data.map((row) => row.map((c) => [...c]));
    // HFD entries are [index, r, g, b]; keep the slot index.
    rowsList[1][9] = rowsList[1][9].length === 4 ? [rowsList[1][9][0], 255, 0, 0] : [255, 0, 0];
    return kb.setAllKeysCustomLed({ col: cols, rgbList: rowsList.flat() });
  },
  // getAllKeysTravel / getAllKeysRt return one list per matrix row; the setters take them flattened in matrix order.
  travel: async (kb, cols) => {
    const cells = (await kb.getAllKeysTravel()).data.flat();
    cells[0 * cols + 1] = { ...cells[0 * cols + 1], point: 2 };
    return kb.setAllKeysTravel(cells);
  },
  rapidTrigger: async (kb, cols) => {
    const cells = (await kb.getAllKeysRt()).data.flat();
    cells[2 * cols + 3] = { ...cells[2 * cols + 3], on: 1, releaseRt: 0.4, pressRt: 0.25 };
    return kb.setAllKeysRt(cells);
  },
};

const families = [
  { family: "BITYUAN", Controller: mod.Ai, productId: 0x10b0, unit: 1000, polling: 70, versions: [[1, 0x23], [2, 0x05]],
    extra: { polling2000: async (kb) => kb.setReportRate({ reportRate: 4 }) } }, // UI rate enum: Hz2000 = 4
  { family: "DUCKBREAD", Controller: mod.__parity_bP, productId: 0x1048, unit: 100, polling: 34, versions: [[1, 0x02]],
    extra: { polling2000: async (kb) => kb.setReportRate({ reportRate: 4 }) } }, // UI rate enum: Hz2000 = 4
  // HFD Pm: only key assignments are written by this app; 8x16 matrix, version via selector 38.
  // HFD Pm; its keyboard UI saves function changes with the whole config (setKeyboardFunction), polling included.
  ...[0x111e, 0x1231].map((productId) => ({
    family: "HFD", Controller: mod.__parity_Pm, productId, unit: 1000, polling: 17, versions: [[1, 0x23]], rows: 8, cols: 16,
    only: ["keyAssign", "winLockOn", "wasdSwapOn", "sixKeyToggle", "keyColor", "polling500"],
    extra: { polling500: fn({ reportRate: 2 }) }, // UI rate enum: Hz500 = 2
  })),
];
const out = [];
for (const f of families)
  for (const version of f.versions)
    for (const colorful of f.family === "BITYUAN" ? [0, 1] : [0])
      for (const [name, run] of Object.entries({ ...common, ...(f.extra ?? {}) }).filter(([n]) => !f.only || f.only.includes(n))) {
        const [rows, cols] = [f.rows ?? 5, f.cols ?? 15];
        const state = createKeyboardState(rows, cols, version, colorful, f.unit);
        if (f.family === "HFD") {
          state.registers[38] = [0, 0, ...version]; // bm firmware at bytes 5..6
          // wm: rgbArea, wasd, mac, winLock, 6-key (0 = on), report (1 = 1000Hz), sleep u16, lowLatency.
          state.registers[17] = [0, 0, 0, 0, 1, 1, 0, 30, 1];
        } else state.registers[f.polling] = [1];
        const kb = new f.Controller(fakeDevice(state, f.productId));
        await kb.init({ row: rows, col: cols, layer: 4 });
        await kb.getVersion();
        const start = JSON.parse(JSON.stringify(state));
        await run(kb, cols);
        out.push({ family: f.family, productId: f.productId, firmware: version.map((v) => v.toString(16)).join("."), colorful, scenario: name, start, end: state });
      }
writeFileSync("src/devices/parity/keyboards.json", JSON.stringify(out) + "\n");
console.log(`${out.length} keyboard parity fixtures`);
process.exit(0);
