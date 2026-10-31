import { useState, useSyncExternalStore } from "react";
import { Activity, Copy } from "lucide-react";
import { version } from "../../package.json";
import { DeviceDiagnostics, type DiagnosticIdentity } from "../hid/diagnostics";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import "./diagnostics.css";
const hex = (value: number | undefined, digits = 4) =>
  value === undefined
    ? "—"
    : `0x${value.toString(16).toUpperCase().padStart(digits, "0")}`;
const ms = (value: number) => `${value.toFixed(1)} ms`;

type Props = {
  source: DeviceDiagnostics;
  identity: DiagnosticIdentity;
  mode?: "hardware" | "mock" | "disconnected";
};
function DiagnosticsContent({
  source,
  identity,
  mode = "disconnected",
}: Props) {
  const state = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const [copy, setCopy] = useState<"idle" | "copied" | "error">("idle");
  const ids = { ...identity, ...state.identity };
  const timing = state.timing;
  async function copyReport() {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(source.report(identity, mode));
      setCopy("copied");
    } catch {
      setCopy("error");
    }
  }
  function collectionRows(
    items: typeof state.collections,
    depth = 0,
  ): React.ReactNode {
    return items.map((item, index) => (
      <li key={`${depth}-${index}`}>
        <span>
          Page {hex(item.usagePage)} / Usage {hex(item.usage)}
        </span>
        <span>
          Input {item.input.map((id) => hex(id, 2)).join(", ") || "—"} · Output{" "}
          {item.output.map((id) => hex(id, 2)).join(", ") || "—"} · Feature{" "}
          {item.feature.map((id) => hex(id, 2)).join(", ") || "—"}
        </span>
        {item.children.length > 0 && (
          <ul>{collectionRows(item.children, depth + 1)}</ul>
        )}
      </li>
    ));
  }
  return (
    <div className="diagnostics-content">
      <div className="diagnostics-summary">
        <div>
          <strong>
            {state.connected
              ? state.mode === "mock"
                ? "Mock device"
                : "Hardware connected"
              : mode === "mock"
                ? "Mock · no hardware connection"
                : "Disconnected"}
          </strong>
          <span>
            App {version} · {source.kind}
          </span>
        </div>
        <Button
          size="small"
          icon={<Copy size={14} />}
          onClick={() => void copyReport()}
        >
          Copy report
        </Button>
      </div>
      <p role="status" className="diagnostics-copy-state">
        {copy === "copied"
          ? "Report copied. Payloads and personal data excluded."
          : copy === "error"
            ? "Could not copy. Allow clipboard access and try again."
            : "Copy report keeps protocol headers; payloads and device names are removed."}
      </p>
      <dl className="diagnostics-identity" aria-label="HID identity">
        <div>
          <dt>VID / PID</dt>
          <dd>
            {hex(ids.vendorId)} / {hex(ids.productId)}
          </dd>
        </div>
        <div>
          <dt>Usage page / usage</dt>
          <dd>
            {hex(ids.usagePage)} / {hex(ids.usage)}
          </dd>
        </div>
        <div>
          <dt>Expected report ID</dt>
          <dd>{hex(ids.reportId, 2)}</dd>
        </div>
      </dl>
      <details className="diagnostics-collections">
        <summary>
          Collections and report IDs ({state.collections.length})
        </summary>
        {state.collections.length ? (
          <ul>{collectionRows(state.collections)}</ul>
        ) : (
          <p>
            No HID collection captured. Connect hardware to inspect its reports.
          </p>
        )}
      </details>
      <dl className="diagnostics-timing" aria-label="Timing summary">
        <div>
          <dt>Exchanges</dt>
          <dd>{timing.exchanges}</dd>
        </div>
        <div>
          <dt>Average round trip</dt>
          <dd>
            {timing.exchanges ? ms(timing.totalMs / timing.exchanges) : "—"}
          </dd>
        </div>
        <div>
          <dt>Slowest</dt>
          <dd>{timing.exchanges ? ms(timing.maxMs) : "—"}</dd>
        </div>
        <div>
          <dt>Failed exchanges</dt>
          <dd>{timing.failed}</dd>
        </div>
      </dl>
      <section aria-label="Diagnostic errors" className="diagnostics-errors">
        <h3>Errors ({state.errors.length})</h3>
        {state.errors.length ? (
          <ul>
            {state.errors.map((error, index) => (
              <li key={index}>
                <time>{ms(error.ms)}</time>
                <span>{error.code}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No errors recorded in this capture.</p>
        )}
      </section>
      <section aria-label="Recent HID frames" className="diagnostics-frames">
        <h3>
          Recent frames <span>{state.frames.length} / 50</span>
        </h3>
        <p>
          Elapsed time since connection. Bytes below are local; copied reports
          redact payloads.
        </p>
        {state.frames.length ? (
          <div
            className="diagnostics-table-scroll"
            role="region"
            tabIndex={0}
            aria-label="Scrollable HID frames"
          >
            <table>
              <caption className="hub-sr-only">
                Last 50 transmitted and received HID frames
              </caption>
              <thead>
                <tr>
                  <th scope="col">Time (ms)</th>
                  <th scope="col">Direction</th>
                  <th scope="col">Report</th>
                  <th scope="col">Hex</th>
                </tr>
              </thead>
              <tbody>
                {state.frames.map((frame) => (
                  <tr key={frame.id}>
                    <td>{frame.ms.toFixed(1)}</td>
                    <td>{frame.direction.toUpperCase()}</td>
                    <td>{hex(frame.reportId, 2)}</td>
                    <td>
                      <code>{frame.hex}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="diagnostics-empty">
            No HID frames yet. Local edits and the keyboard mock do not send
            hardware reports.
          </p>
        )}
      </section>
    </div>
  );
}
export function DiagnosticsButton(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Diagnostics"
        title="Diagnostics"
        onClick={() => setOpen(true)}
      >
        <Activity size={17} aria-hidden="true" />
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Diagnostics"
        description="Local HID capture. Opening this panel sends no commands."
        className="hub-diagnostics"
      >
        {open && <DiagnosticsContent {...props} />}
      </Dialog>
    </>
  );
}
