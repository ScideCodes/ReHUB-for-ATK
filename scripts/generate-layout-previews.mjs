import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "../extracted/asar_unpacked/keymaps");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const devices = read(resolve(root, "src/devices/devices.json"));
const identities = read(resolve(root, "src/devices/keyboardIdentities.json"));
const normalize = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^atk(?:xqk)?/, "");
const files = readdirSync(source).filter((file) => file.endsWith(".json"));
const output = resolve(root, "public/devices/layouts");
mkdirSync(output, { recursive: true });
const manifest = {};
const escape = (value) =>
  value.replace(
    /[<>&"']/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[char],
  );
for (const device of devices) {
  if (
    device.colorways?.length &&
    device.colorways.every((color) => color.image)
  )
    continue;
  const id = `${Number(device.VID)}:${Number(device.PID)}`;
  const name = identities[id]?.name ?? device.name;
  const matches = files.filter(
    (file) => normalize(basename(file, ".json")) === normalize(name),
  );
  if (matches.length !== 1) continue;
  const file = matches[0],
    layout = read(resolve(source, file));
  const rows = layout.layouts.keymap;
  let maxWidth = 0;
  const rectangles = [];
  rows.forEach((row, y) => {
    let x = 12;
    row.forEach((key) => {
      x += (key.ml ?? 0) * 32;
      const width = (key.w ?? 1) * 32;
      rectangles.push(
        `<rect x="${x}" y="${12 + y * 36}" width="${width - 4}" height="28" rx="4"/>`,
      );
      x += width + (key.mr ?? 0) * 32;
    });
    maxWidth = Math.max(maxWidth, x + 8);
  });
  const height = rows.length * 36 + 20;
  const image = basename(file, ".json") + ".svg";
  writeFileSync(
    resolve(output, image),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maxWidth} ${height}"><title>${escape(name)} source key layout</title><rect x="1" y="1" width="${maxWidth - 2}" height="${height - 2}" rx="12" fill="#888890" fill-opacity=".08" stroke="#808088"/><g fill="#A8A8AD" stroke="#686870" stroke-width="1">${rectangles.join("")}</g></svg>\n`,
  );
  manifest[id] = {
    image: `/devices/layouts/${image}`,
    source: `keymaps/${file}`,
    name: layout.name,
    keyCount: rectangles.length,
  };
}
writeFileSync(
  resolve(root, "src/devices/layoutPreviews.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Source layout previews: ${Object.keys(manifest).length} keyboard endpoints.`,
);
