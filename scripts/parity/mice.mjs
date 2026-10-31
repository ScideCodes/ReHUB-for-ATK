// Parity fixtures for mice: drives the original Wt controller (filter-B6RHekbD.js) against a recording fake EEPROM
// mouse, one UI action per scenario, and records the EEPROM bytes it changed plus every non-EEPROM command it sent.
// src/devices/parity/mice.parity.test.ts replays the same actions through this app and compares. Needs ../extracted.
// Usage: node scripts/parity/mice.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { staticDir } from "./env.mjs";

const images = JSON.parse(readFileSync("src/devices/parity/mouse-images.json", "utf8"));
const source = JSON.parse(readFileSync("src/devices/sourceMouseProtocols.json", "utf8"));
const mod = await import(staticDir + "filter-B6RHekbD.js");
mod.c();
const Wt = mod.s;

function fakeMouse(model, eeprom) {
  const sent = [];
  const device = {
    vendorId: model.vid, productId: model.pid, opened: true, collections: [], oninputreport: null,
    async open() {}, async close() {},
    async sendReport(reportId, data) {
      const f = [...new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength ?? data.length)];
      sent.push(f);
      const r = f.slice(0, 16);
      r[1] = 0;
      const addr = (f[2] << 8) | f[3], len = f[4];
      if (f[0] === 8) for (let i = 0; i < len; i++) r[5 + i] = eeprom[addr + i];
      if (f[0] === 7) for (let i = 0; i < len; i++) eeprom[addr + i] = f[5 + i];
      if (f[0] === 16) r.splice(5, 2, model.cid, model.mid);
      setTimeout(() => device.oninputreport?.({ reportId, data: new DataView(new Uint8Array(r).buffer) }), 0);
    },
  };
  return { device, sent };
}

// Each scenario changes one thing the way the original UI does: read the config, change a field, call its setter.
const ultimate = (s) => s === "PAW3950Ultra" || s === "PAW3955MASTER";
const scenarios = {
  // UI rate enum (keyboard.assets): Hz125 0, Hz250 1, Hz500 2, Hz1000 3, Hz2000 4, Hz4000 5, Hz8000 6.
  polling2000: (c, cfg) => c.setMouseReportRate({ ...cfg, reportRate: 4 }),
  dpiStage2to1200: (c, cfg) => {
    const dpiList = cfg.dpiList.map((d, i) => (i === 1 ? { ...d, dpi: { xDpi: 1200, yDpi: 1200, usesLogical: true } } : d));
    return c.setMouseDpiValues({ ...cfg, dpiList: dpiList.slice(0, cfg.dpiTotal) });
  },
  debounce4: (c, cfg) => c.setKeyDebounceTime({ ...cfg, keyDebounceTime: 4 }),
  sleep120: (c, cfg) => c.setMouseSleepTime({ ...cfg, sleepTime: 120 }),
  motionSyncOff: (c, cfg) => c.setMouseMoveSync({ ...cfg, moveSync: 0 }),
  lod: (c, cfg, m) => c.setMouseSilentHeight({ ...cfg, silentHeight: ultimate(m.sensor) ? 9 : 2 }),
  dpiButtonOff: (c, cfg) => c.setDpiToggleEnabled({ ...cfg, dpiToggleEnabled: 0 }),
  farDistanceOn: (c, cfg) => c.setMouseFarDistance({ ...cfg, farDistance: 1 }),
  angle10: (c, cfg) => c.setSensorAngle({ ...cfg, sensorAngle: 10, sensorAngleEnable: 1 }),
  // Performance UI sensor mode (sensorModel: Base 0, Athletics 1, AthleticsMax 2) via setMousePerformance.
  sensorCompetitive: (c, cfg) => c.setMousePerformance({ ...cfg, sensorModel: 1 }),
  sensorCompetitiveMax: (c, cfg) => c.setMousePerformance({ ...cfg, sensorModel: 2 }),
};

const out = [];
for (const model of images) {
  const entry = source.find((e) => e.cidMid === `${model.cid},${model.mid}` && !e.receiver);
  for (const [name, run] of Object.entries(scenarios)) {
    const eeprom = Uint8Array.from(model.eeprom.concat(Array(8192 - model.eeprom.length).fill(0)));
    const { device, sent } = fakeMouse(model, eeprom);
    const ctl = new Wt(device);
    await ctl.init({ sensor: model.sensor, mouseCidMid: `${model.cid},${model.mid}`, noDpiRGB: entry?.noDpiRGB, noBottomButton: entry?.noBottomButton });
    const cfg = (await ctl.getMouseFunction()).data;
    const before = Uint8Array.from(eeprom);
    sent.length = 0;
    await run(ctl, cfg, model);
    const changes = [];
    for (let a = 0; a < 8192; a++) if (eeprom[a] !== before[a]) changes.push([a, eeprom[a]]);
    out.push({
      model: model.name,
      sensor: model.sensor,
      scenario: name,
      changes,
      commands: sent.filter((f) => ![7, 8, 16].includes(f[0])).map((f) => f.slice(0, 15)),
    });
  }
}
writeFileSync("src/devices/parity/mice.json", JSON.stringify(out, null, 0) + "\n");
console.log(`${out.length} mouse parity fixtures`);
process.exit(0);
