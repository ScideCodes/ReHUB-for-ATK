import { version } from "../../package.json";

export const REPOSITORY = "https://github.com/ScideCodes/ReHUB-for-ATK";
const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(4, "0")}`;
type ReportLayout = { id: number; bytes: number };
type Collection = {
  usagePage?: number;
  usage?: number;
  input: ReportLayout[];
  output: ReportLayout[];
  feature: ReportLayout[];
  children: Collection[];
};
export type DeviceMetadata = {
  vendorId: string;
  productId: string;
  collections: Collection[];
};
export type ReportDetails = {
  model: string;
  connection: string;
  firmware: string;
  os: string;
  outcome: string;
  notes: string;
};
function mapReports(reports: readonly HIDReportInfo[] = []): ReportLayout[] {
  return reports.map((r) => ({
    id: r.reportId ?? 0,
    bytes: Math.ceil(
      (r.items ?? []).reduce(
        (sum, item) => sum + (item.reportSize ?? 0) * (item.reportCount ?? 0),
        0,
      ) / 8,
    ),
  }));
}
function mapCollections(
  items: readonly HIDCollectionInfo[] = [],
): Collection[] {
  return items.map((c) => {
    if (c.usagePage === 0xff02)
      throw new Error(
        "Bootloader interfaces cannot be selected. Choose the normal device interface.",
      );
    return {
      usagePage: c.usagePage,
      usage: c.usage,
      input: mapReports(c.inputReports),
      output: mapReports(c.outputReports),
      feature: mapReports(c.featureReports),
      children: mapCollections(c.children),
    };
  });
}
/** Descriptor inspection only: never call open(), receiveFeatureReport() or send*. */
export function inspectDevice(
  device: Pick<HIDDevice, "vendorId" | "productId" | "collections">,
): DeviceMetadata {
  const collections = mapCollections(device.collections);
  return {
    vendorId: hex(device.vendorId),
    productId: hex(device.productId),
    collections,
  };
}
const errorCodes = new Set([
  "readback-mismatch",
  "disconnected",
  "timeout",
  "permission-denied",
  "command-blocked",
  "transfer-failed",
]);
function diagnosticsSummary(raw?: string) {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    const number = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0
        ? value
        : undefined;
    return {
      mode: ["hardware", "mock", "disconnected"].includes(d.mode)
        ? d.mode
        : "unknown",
      connected: d.connected === true,
      identity: {
        vendorId: number(d.identity?.vendorId),
        productId: number(d.identity?.productId),
        usagePage: number(d.identity?.usagePage),
        usage: number(d.identity?.usage),
        reportId: number(d.identity?.reportId),
      },
      timing: {
        exchanges: number(d.timing?.exchanges),
        failed: number(d.timing?.failed),
        averageMs: number(d.timing?.averageMs),
        maxMs: number(d.timing?.maxMs),
      },
      errors: Array.isArray(d.errors)
        ? d.errors
            .slice(-20)
            .flatMap((e: { code?: unknown }) =>
              typeof e?.code === "string" && errorCodes.has(e.code)
                ? [e.code]
                : [],
            )
        : [],
    };
  } catch {
    return null;
  }
}
export function inspectDevices(
  devices: readonly Pick<HIDDevice, "vendorId" | "productId" | "collections">[],
): DeviceMetadata[] {
  return devices.map(inspectDevice);
}
export function createReport(
  details: ReportDetails,
  devices: DeviceMetadata[] | null,
  diagnostics?: string,
) {
  return {
    schemaVersion: 1,
    appVersion: version,
    source:
      "User-reviewed community report; not proof of full hardware support.",
    userProvided: {
      model: details.model.trim().slice(0, 120),
      connection: details.connection.slice(0, 40),
      firmware: details.firmware.trim().slice(0, 80),
      os: details.os.trim().slice(0, 80),
      outcome: details.outcome.slice(0, 60),
      notes: details.notes.trim().slice(0, 2000),
    },
    interfaces: devices ?? [],
    diagnostics: diagnosticsSummary(diagnostics),
    privacy:
      "No serials, device names, packet bytes, settings, macros or keystrokes are collected. Review your own text for personal information.",
  };
}
export function issueLink(model: string, report: string) {
  const url = new URL(`${REPOSITORY}/issues/new`);
  url.searchParams.set(
    "title",
    `[Device report] ${model.trim().slice(0, 100) || "Unknown model"}`,
  );
  url.searchParams.set("template", "device-report.md");
  url.searchParams.set(
    "body",
    `## Device report\n\n${report}\n\nShared after reviewing the report. This is a community observation, not certification of device support.`,
  );
  const attachmentRequired = url.href.length > 7000;
  if (attachmentRequired)
    url.searchParams.set(
      "body",
      "## Device report\n\nAttach the downloaded rehub-device-report.txt file here before submitting. GitHub supports dragging the file into this text box.\n\nDescribe what you tried and what happened.",
    );
  return { url: url.href, attachmentRequired };
}
export async function downloadReport(text: string): Promise<boolean> {
  if (window.rehubDesktop) return window.rehubDesktop.saveReport(text);
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "rehub-device-report.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
