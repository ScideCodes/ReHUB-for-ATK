import { version } from "../../package.json";

export type DiagnosticIdentity = {
  vendorId: number;
  productId: number;
  usagePage?: number;
  usage?: number;
  reportId?: number;
};
type Collection = {
  usagePage?: number;
  usage?: number;
  input: number[];
  output: number[];
  feature: number[];
  children: Collection[];
};
type Frame = {
  id: number;
  direction: "in" | "out";
  reportId: number;
  ms: number;
  hex: string;
};
type Fault = { ms: number; code: string };
const rounded = (value: number) => Math.round(Math.max(0, value) * 10) / 10;
const errorCode = (error: unknown) => {
  const text = error instanceof Error ? error.message : String(error);
  if (/readback|mismatch/i.test(text)) return "readback-mismatch";
  if (/disconnect|not connected/i.test(text)) return "disconnected";
  if (/timeout|timed out/i.test(text)) return "timeout";
  if (/permission|denied|not\s*allowed/i.test(text)) return "permission-denied";
  if (/blocked|unverified|not verified|safe mode/i.test(text))
    return "command-blocked";
  return "transfer-failed";
};
function collections(items: readonly HIDCollectionInfo[]): Collection[] {
  return items.map((item) => ({
    usagePage: item.usagePage,
    usage: item.usage,
    input: (item.inputReports ?? [])
      .map((report) => report.reportId)
      .filter((id): id is number => id !== undefined),
    output: (item.outputReports ?? [])
      .map((report) => report.reportId)
      .filter((id): id is number => id !== undefined),
    feature: (item.featureReports ?? [])
      .map((report) => report.reportId)
      .filter((id): id is number => id !== undefined),
    children: collections(item.children ?? []),
  }));
}
export class DeviceDiagnostics {
  private startedAt = performance.now();
  private sequence = 0;
  private listeners = new Set<() => void>();
  private state = {
    connected: false,
    mode: "disconnected" as "hardware" | "mock" | "disconnected",
    identity: null as DiagnosticIdentity | null,
    collections: [] as Collection[],
    frames: [] as Frame[],
    errors: [] as Fault[],
    timing: { exchanges: 0, failed: 0, totalMs: 0, maxMs: 0 },
  };
  constructor(readonly kind: "mouse" | "keyboard") {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private update(patch: Partial<typeof this.state>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  attach(
    device: {
      vendorId: number;
      productId: number;
      collections: readonly HIDCollectionInfo[];
    },
    mode: "hardware" | "mock",
  ) {
    this.startedAt = performance.now();
    this.sequence = 0;
    this.update({
      connected: true,
      mode,
      identity: { vendorId: device.vendorId, productId: device.productId },
      collections: collections(device.collections),
      frames: [],
      errors: [],
      timing: { exchanges: 0, failed: 0, totalMs: 0, maxMs: 0 },
    });
  }
  disconnect() {
    this.update({ connected: false });
  }
  frame(direction: Frame["direction"], reportId: number, bytes: Uint8Array) {
    const hex = Array.from(bytes.subarray(0, 64), (byte) =>
      byte.toString(16).padStart(2, "0").toUpperCase(),
    ).join(" ");
    this.update({
      frames: [
        ...this.state.frames,
        {
          id: ++this.sequence,
          direction,
          reportId,
          ms: rounded(performance.now() - this.startedAt),
          hex,
        },
      ].slice(-50),
    });
  }
  error(error: unknown) {
    this.update({
      errors: [
        ...this.state.errors,
        {
          ms: rounded(performance.now() - this.startedAt),
          code: errorCode(error),
        },
      ].slice(-20),
    });
  }
  finish(roundTripMs: number, error?: unknown) {
    const previous = this.state.timing;
    this.update({
      timing: {
        exchanges: previous.exchanges + 1,
        failed: previous.failed + Number(error !== undefined),
        totalMs: previous.totalMs + Math.max(0, roundTripMs),
        maxMs: Math.max(previous.maxMs, roundTripMs),
      },
    });
    if (error !== undefined) this.error(error);
  }
  report(
    fallback: DiagnosticIdentity,
    mode: "hardware" | "mock" | "disconnected",
  ) {
    const state = this.state;
    return JSON.stringify(
      {
        appVersion: version,
        kind: this.kind,
        connected: state.connected,
        mode: state.identity ? state.mode : mode,
        identity: {
          vendorId: state.identity?.vendorId ?? fallback.vendorId,
          productId: state.identity?.productId ?? fallback.productId,
          usagePage: fallback.usagePage,
          usage: fallback.usage,
          reportId: fallback.reportId,
        },
        collections: state.collections,
        timing: {
          exchanges: state.timing.exchanges,
          failed: state.timing.failed,
          averageMs: rounded(
            state.timing.totalMs / (state.timing.exchanges || 1),
          ),
          maxMs: rounded(state.timing.maxMs),
        },
        errors: state.errors,
        payloads:
          "Redacted; report excludes serials, device names, settings, key sequences and user text.",
        frames: state.frames.map((frame) => ({
          ...frame,
          hex: frame.hex
            .split(" ")
            .map((byte, index) =>
              index < (this.kind === "mouse" ? 5 : 3) ? byte : "**",
            )
            .join(" "),
        })),
      },
      null,
      2,
    );
  }
}
