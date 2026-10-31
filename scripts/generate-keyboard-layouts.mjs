// Maps each registry keyboard to the original app's key layout and copies the layouts it uses.
// Source rule (keyboard-info.util rl.getKeyboardMatrix): keymaps/<Gn.DEVICE_PATHS[vid][pid]>.json, with po()
// forcing "a87" for 373B:1152 named A87. (firmwareMark only names the file for BYKB, which is not mapped here.)
// Only [row, col] matrix layouts are taken; linear (type 0) generic layouts are skipped.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const keymaps = resolve(root, "../extracted/asar_unpacked/keymaps");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));

// Gn.DEVICE_PATHS object literal from the extracted (local, trusted) source bundle.
const util = readFileSync(resolve(root, "../extracted/asar_unpacked/static/keyboard-info.util-BQDDA2LZ.js"), "utf8");
const start = util.indexOf('i(Gn,"DEVICE_PATHS",') + 'i(Gn,"DEVICE_PATHS",'.length;
let end = start;
for (let depth = 0; end < util.length; end++) {
  if (util[end] === "{") depth++;
  else if (util[end] === "}" && --depth === 0) break;
}
const devicePaths = new Function(`return ${util.slice(start, end + 1)}`)();

const isMatrix = (name) =>
  read(resolve(keymaps, `${name}.json`)).layouts.keymap.flat().every((k) => Array.isArray(k.index) && k.index.length === 2);
const catalog = Object.values(read(resolve(root, "src/devices/sourceCatalog.json"))).flat();

// The legacy catalog lacks 37 normal Tv filters; read their custom.row/col/layer straight from the source filter,
// following `...spread` objects in order (later entries win, as in the object literal).
const store = readFileSync(resolve(root, "../extracted/asar_unpacked/static/demoMode.store-CXKd1LXo.js"), "utf8");
const balanced = (text, open) => {
  let depth = 0, i = open;
  for (; i < text.length; i++) if (text[i] === "{") depth++; else if (text[i] === "}" && --depth === 0) break;
  return text.slice(open, i + 1);
};
function topLevelEntries(body) {
  const out = [];
  let depth = 0, from = 1;
  for (let i = 1; i < body.length - 1; i++) {
    if ("{[(".includes(body[i])) depth++;
    else if ("}])".includes(body[i])) depth--;
    else if (body[i] === "," && depth === 0) {
      out.push(body.slice(from, i));
      from = i + 1;
    }
  }
  out.push(body.slice(from, body.length - 1));
  return out;
}
// Minified names repeat across scopes: take the definition nearest before the use, else the first one after it.
function definitionOf(name, at) {
  const pattern = new RegExp(`[,;\\s{(]${name.replace(/\$/g, "\\$")}=\\{`, "g");
  let before, after;
  for (const m of store.matchAll(pattern)) {
    if (m.index < at) before = m;
    else if (!after) after = m;
  }
  const hit = before ?? after;
  return hit && balanced(store, hit.index + hit[0].length - 1);
}
function resolveCustom(body, at, seen = new Set()) {
  const custom = {};
  for (const entry of topLevelEntries(body)) {
    const spread = /^\.\.\.([A-Za-z_$][\w$]*)$/.exec(entry);
    if (spread && !seen.has(spread[1])) {
      const def = definitionOf(spread[1], at);
      if (def) Object.assign(custom, resolveCustom(def, at, new Set([...seen, spread[1]])));
      continue;
    }
    const kv = /^(row|col|layer):(\d+)$/.exec(entry) ?? /^(name):"([^"]*)"$/.exec(entry);
    if (kv) custom[kv[1]] = kv[1] === "name" ? kv[2] : Number(kv[2]);
  }
  return custom;
}
function sourceCustom(vid, pid) {
  const at = store.indexOf(`vendorId:${vid},productId:${pid},usagePage:65376,usage:97,custom:{`);
  if (at < 0) return undefined;
  return resolveCustom(balanced(store, store.indexOf("custom:{", at) + "custom:".length), at);
}
const registry = read(resolve(root, "src/devices/registry.generated.json")).filter((d) => d.kind === "keyboard");

const map = {};
// Source custom.row/col (Tv.init) per keyboard, kept only where every layout key falls inside that matrix.
const matrices = {};
for (const device of registry) {
  // The ATK68 V2 Pro writer is verified against its built-in layout (atk68Layout.json == atk68_v2_pro.json).
  if (device.id === "atk-68-v2-pro") continue;
  const vid = Number(device.VID), pid = Number(device.PID);
  const source = catalog.find((e) => e.vendorId === vid && e.productId === pid);
  const path = devicePaths[`0x${vid.toString(16)}`]?.[`0x${pid.toString(16)}`];
  const name = vid === 0x373b && pid === 0x1152 && /a87/i.test(device.name) ? "a87" : path;
  if (typeof name !== "string" || !isMatrix(name)) continue;
  const file = `${name}.json`;
  map[device.id] = name;
  const { row, col, layer } = source?.custom ?? (device.protocolFamily === "BITYUAN" ? sourceCustom(vid, pid) : undefined) ?? {};
  const fits = read(resolve(keymaps, file)).layouts.keymap.flat().every((k) => k.index[0] < row && k.index[1] < col);
  if (row && col && layer === 4 && fits) matrices[device.id] = [row, col];
}
const used = [...new Set(Object.values(map))];
const out = resolve(root, "src/devices/layouts");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const name of used) copyFileSync(resolve(keymaps, `${name}.json`), resolve(out, `${name}.json`));
writeFileSync(resolve(root, "src/devices/keyboardLayoutMap.json"), JSON.stringify(map, null, 2) + "\n");
writeFileSync(resolve(root, "src/devices/keyboardMatrix.json"), JSON.stringify(matrices, null, 2) + "\n");
console.log(`Keyboard layouts: ${Object.keys(map).length}/${registry.length} keyboards, ${used.length} layout files.`);
