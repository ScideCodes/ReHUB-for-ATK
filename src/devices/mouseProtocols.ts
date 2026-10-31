import { MOUSE_DEVICES as mice } from "./registry";
import source from "./sourceMouseProtocols.json";

// filter-B6RHekbD.js: Wt controller + ue sensor codec; see audit/phase5/source-evidence.json.
const compatible = source.filter(
  (entry) =>
    entry.sensor === "PAW3950Ultra" && entry.noDpiRGB && entry.noBottomButton,
);
// Read tier: every PAW3950Ultra / PAW3955MASTER profile uses the same Wt controller and EEPROM map; DPI LED colours
// (dpi1Color..dpi7Color) and the bottom button (key5) are extra fields of that map. Writes stay on `compatible`.
// PAW3955MASTER: same controller, DPI stages in their own 6-byte records (isPaw3955Master branch).
// PAW3395 / PAW3395SE / PAW3395Ultra: same controller; DPI bytes decoded per sensor (source `ue`).
// Every Wt/compx sensor in the source now has a source-backed DPI decoder (`ue`), so all of them read.
const READ_SENSORS = new Set([
  "PAW3950Ultra", "PAW3955MASTER", "PAW3395", "PAW3395SE", "PAW3395Ultra",
  "PAW3950", "PAW3950DM", "PAW3311", "PAW3315", "CORE26K",
]);
const readable = source.filter((entry) => READ_SENSORS.has(entry.sensor ?? ""));
export function mouseEndpoint(vendorId: number, productId: number) {
  return source.find(
    (entry) => entry.vendorId === vendorId && entry.productId === productId,
  );
}
export function mouseEndpointSupportsReal(vendorId: number, productId: number) {
  const endpoint = mouseEndpoint(vendorId, productId);
  return !!endpoint && (endpoint.receiver || readable.includes(endpoint));
}
// Source: filter-B6RHekbD.js: ra = sa.reduce((e,t)=>(e[t.custom.mouseCidMid]=t,e),{}); demoMode.store-CXKd1LXo.js: tK
export function findPairedMouseModel(cid: number, mid: number) {
  if (!cid && !mid) return undefined;
  return source.find(
    (entry) => !entry.receiver && entry.cidMid === `${cid},${mid}`,
  );
}
export function verifiedMouseIdentity(
  vendorId: number,
  productId: number,
  cid: number,
  mid: number,
) {
  const endpoint = mouseEndpoint(vendorId, productId);
  // Source identifyByCidMid endpoints share one VID/PID across models: match the entry with this exact identity.
  return (
    !!endpoint &&
    compatible.some(
      (model) =>
        model.cidMid === `${cid},${mid}` &&
        (endpoint.receiver || (model.vendorId === vendorId && model.productId === productId)),
    )
  );
}
export function readableMouseIdentity(
  vendorId: number,
  productId: number,
  cid: number,
  mid: number,
) {
  const endpoint = mouseEndpoint(vendorId, productId);
  // Source identifyByCidMid endpoints share one VID/PID across models: match the entry with this exact identity.
  return (
    !!endpoint &&
    readable.some(
      (model) =>
        model.cidMid === `${cid},${mid}` &&
        (endpoint.receiver || (model.vendorId === vendorId && model.productId === productId)),
    )
  );
}
// Opt-in write tier: every readable Wt model that is not a verified writer. They share the EEPROM map; DPI uses the
// source codec per sensor (`de`, or Qe 6-byte records for PAW3955MASTER) and limits come from source rules at runtime.
export function untestedMouseIdentity(vendorId: number, productId: number, cid: number, mid: number) {
  return readableMouseIdentity(vendorId, productId, cid, mid) && !verifiedMouseIdentity(vendorId, productId, cid, mid);
}
// Session-only consent for one connected identity; never persisted, cleared on every disconnect.
let untestedConsent: string | null = null;
const identityKey = (...identity: number[]) => identity.join(":");
export function allowUntestedMouseWrites(vendorId: number, productId: number, cid: number, mid: number) {
  if (!untestedMouseIdentity(vendorId, productId, cid, mid)) throw new Error("This mouse has no untested write tier.");
  untestedConsent = identityKey(vendorId, productId, cid, mid);
}
export function clearUntestedMouseWrites() {
  untestedConsent = null;
}
/** Verified writers, plus untested-tier mice the user opted into for this connection. */
export function writableMouseIdentity(vendorId: number, productId: number, cid: number, mid: number) {
  return (
    verifiedMouseIdentity(vendorId, productId, cid, mid) ||
    (untestedConsent === identityKey(vendorId, productId, cid, mid) &&
      untestedMouseIdentity(vendorId, productId, cid, mid))
  );
}
/** Source feature flags of the model behind a CID/MID (receivers resolve to their paired model). */
export function mouseModelFeatures(cid: number, mid: number) {
  const model = findPairedMouseModel(cid, mid);
  return {
    dpiRgb: !!model && !model.noDpiRGB,
    bottomButton: !!model && !model.noBottomButton,
    paw3955: model?.sensor === "PAW3955MASTER",
    sensor: model?.sensor ?? null,
    // Source: custom.sensorCenterPointV2 || isPaw3955Master()
    centerPoint: !!model && (!!model.sensorCenterPointV2 || model.sensor === "PAW3955MASTER"),
    farDistance: !!model && !model.noFarDistance,
    zeroDebounce: !!model && !model.noZeroKeyDebounce,
    dongleRgb: !!model && !model.noDongleRGB,
    fastTrigger: !!model && model.supportFastTrigger,
  };
}
export function mouseFilters(): HIDDeviceFilter[] {
  return mice
    .filter((mouse) => mouse.usagePage !== 0xff02)
    .map((mouse) => ({
      vendorId: Number(mouse.VID),
      productId: Number(mouse.PID),
      usagePage: mouse.usagePage,
      usage: mouse.usage,
    }));
}
export function mouseHidLabel(device: {
  vendorId: number;
  productId: number;
  productName?: string;
}) {
  const hex = (value: number) =>
    value.toString(16).toUpperCase().padStart(4, "0");
  return `${hex(device.vendorId)}:${hex(device.productId)} ${device.productName || "Unnamed HID device"}`;
}
