import fs from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "acorn";
const file = "../extracted/asar_unpacked/static/filter-B6RHekbD.js";
const text = fs.readFileSync(file, "utf8");
const ast = parse(text, { ecmaVersion: "latest", sourceType: "module" });
const entries = [],
  evidence = [];
const props = (n) =>
  Object.fromEntries(
    n.properties.filter((p) => p.key).map((p) => [p.key.name, p.value]),
  );
const flag = node => node?.type === "UnaryExpression" && node.operator === "!" && node.argument.type === "Literal" ? !node.argument.value : node?.type === "Literal" && node.value === true;
function walk(node) {
  if (!node?.type) return;
  if (node.type === "ObjectExpression") {
    const p = props(node);
    if (p.controller?.name === "Wt" && p.filters?.elements)
      for (const item of p.filters.elements) {
        const v = props(item);
        if (v.usagePage?.value !== 0xff04 || v.usage?.value !== 2) continue;
        const c = v.custom ? props(v.custom) : {};
        entries.push({
          vendorId: v.vendorId.value,
          productId: v.productId.value,
          receiver: flag(v.receiver),
          name: c.name?.value ?? "",
          sensor: c.sensor?.property?.name ?? null,
          cidMid: c.mouseCidMid?.value ?? null,
          noDpiRGB: flag(c.noDpiRGB),
          noBottomButton: flag(c.noBottomButton),
          sensorCenterPointV2: flag(c.sensorCenterPointV2),
          noFarDistance: flag(c.noFarDistance),
          noZeroKeyDebounce: flag(c.noZeroKeyDebounce),
          noDongleRGB: flag(c.noDongleRGB),
          supportFastTrigger: flag(c.supportFastTrigger),
          offset: item.start,
        });
      }
  }
  if (node.type === "AssignmentExpression" && node.left.name === "Wt")
    for (const method of node.right.body.body)
      if (
        [
          "getMouseCidMid",
          "getMouseFunction",
          "setMouseDpiValues",
          "setSensorCenterPoint",
        ].includes(method.key.name)
      )
        evidence.push({
          symbol: "Wt." + method.key.name,
          offset: method.start,
          source: text.slice(method.start, method.end),
        });
  for (const value of Object.values(node))
    if (Array.isArray(value)) value.forEach(walk);
    else if (value?.type) walk(value);
}
walk(ast);
fs.writeFileSync(
  "src/devices/sourceMouseProtocols.json",
  JSON.stringify(entries, null, 2) + "\n",
);
fs.writeFileSync(
  "audit/phase5/source-evidence.json",
  JSON.stringify(
    {
      file,
      sha256: createHash("sha256").update(text).digest("hex"),
      evidence,
      dpiCodec: {
        offset: text.indexOf("function ue("),
        source: text.slice(
          text.indexOf("function ue("),
          text.indexOf("function ue(") + 2300,
        ),
      },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  entries.length,
  "source FF04 endpoints;",
  entries
    .filter(
      (e) => e.sensor === "PAW3950Ultra" && e.noDpiRGB && e.noBottomButton,
    )
    .map((e) => [e.name, e.cidMid, e.sensorCenterPointV2]),
);
