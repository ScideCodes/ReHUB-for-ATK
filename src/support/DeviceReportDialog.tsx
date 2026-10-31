import { useState } from "react";
import { Bug } from "lucide-react";
import { Dialog } from "../ui/Dialog";
import {
  createReport,
  downloadReport,
  inspectDevices,
  issueLink,
  type DeviceMetadata,
  type ReportDetails,
} from "./deviceReport";
import "./support.css";

export function DeviceReportButton({
  diagnostics,
  compact = false,
}: {
  diagnostics?: () => string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<string>();
  return (
    <>
      <button
        type="button"
        className={compact ? "hub-icon-btn" : "h-btn"}
        aria-label="Help support my device"
        title="Help support my device"
        onClick={() => {
          setSnapshot(diagnostics?.());
          setOpen(true);
        }}
      >
        <Bug size={compact ? 20 : 16} />
        {!compact && "Help support my device"}
      </button>
      {open && (
        <DeviceReportDialog
          diagnostics={snapshot}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
function DeviceReportDialog({
  diagnostics,
  onClose,
}: {
  diagnostics?: string;
  onClose: () => void;
}) {
  const [device, setDevice] = useState<DeviceMetadata[] | null>(null);
  const [details, setDetails] = useState<ReportDetails>({
    model: "",
    connection: "unknown",
    firmware: "",
    os: "",
    outcome: "not-detected",
    notes: "",
  });
  const [preview, setPreview] = useState("");
  const [consent, setConsent] = useState(false);
  const [exported, setExported] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [status, setStatus] = useState("");
  async function select() {
    if (!navigator.hid) {
      setStatus(
        "Device selection requires the desktop app or Chrome/Edge. You can still describe your device below.",
      );
      return;
    }
    setSelecting(true);
    setStatus("");
    try {
      const options = {
        filters: [],
        exclusionFilters: [{ usagePage: 0xff02 }],
      };
      const devices = await navigator.hid.requestDevice(options);
      if (devices.length) {
        setDevice(inspectDevices(devices));
        setStatus("Device metadata collected. No device commands were sent.");
      } else
        setStatus(
          "No device selected. You can try again or submit a description.",
        );
    } catch (error) {
      setStatus(
        error instanceof Error && /bootloader/i.test(error.message)
          ? error.message
          : "Device selection was cancelled or unavailable. You can still submit a description.",
      );
    } finally {
      setSelecting(false);
    }
  }
  const field = (key: keyof ReportDetails, value: string) =>
    setDetails((d) => ({ ...d, [key]: value }));
  const link = issueLink(details.model, preview);
  async function save() {
    try {
      if (await downloadReport(preview)) {
        setExported(true);
        setStatus("Report saved. You can attach it to a GitHub issue.");
      } else setStatus("Save cancelled. Your report is still available here.");
    } catch {
      setStatus(
        "Could not save the report. Choose a writable folder and a .txt filename, then try again.",
      );
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={preview ? "Review your device report" : "Help support your device"}
      className="device-report-dialog"
      description="Reports help improve ReHUB. Nothing is uploaded automatically."
      footer={
        preview ? (
          <>
            <button
              className="h-btn"
              onClick={() => {
                setPreview("");
                setConsent(false);
                setExported(false);
                setStatus("");
              }}
            >
              Back
            </button>
            <button className="h-btn" onClick={() => void save()}>
              Download report
            </button>
            {consent && (!link.attachmentRequired || exported) ? (
              <a
                className="h-btn primary"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open GitHub issue
              </a>
            ) : (
              <button className="h-btn primary" disabled>
                Open GitHub issue
              </button>
            )}
          </>
        ) : (
          <>
            <button className="h-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="h-btn primary"
              disabled={!details.model.trim() || selecting}
              onClick={() => {
                setPreview(
                  JSON.stringify(
                    createReport(details, device, diagnostics),
                    null,
                    2,
                  ),
                );
                setStatus("");
              }}
            >
              Review report
            </button>
          </>
        )
      }
    >
      <div className="device-report-form" translate="no">
        {preview ? (
          <>
            <p>
              GitHub issues are public and require a GitHub account. Review the
              report and remove personal information from your notes before
              continuing. You will submit the issue yourself on GitHub.
            </p>
            <pre tabIndex={0} aria-label="Report preview">
              {preview}
            </pre>
            {link.attachmentRequired && (
              <p>
                This report is too large to prefill. Download it first, then
                attach the file to the GitHub issue. The complete report is kept
                in the file.
              </p>
            )}
            <label className="report-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I reviewed this report and understand it will be public when I
              submit it on GitHub.
            </label>
          </>
        ) : (
          <>
            <p>
              Select your device to collect its identifiers and report layout.
              This does not open the device or change its settings. If it is
              missing from the list, fill in the model and describe the problem.
            </p>
            <button
              type="button"
              className="h-btn"
              disabled={selecting}
              onClick={() => void select()}
            >
              {selecting
                ? "Waiting for device selection…"
                : device
                  ? "Select a different device"
                  : "Select device (optional)"}
            </button>
            {device?.map((item, index) => (
              <p key={index} className="report-identity">
                Interface {index + 1}: VID {item.vendorId} / PID{" "}
                {item.productId} · {item.collections.length} collections
              </p>
            ))}
            <label>
              Model name (required)
              <input
                value={details.model}
                maxLength={120}
                placeholder="For example: ATK 68 V2 Pro"
                onChange={(e) => field("model", e.target.value)}
              />
            </label>
            <div className="report-columns">
              <label>
                Connection
                <select
                  value={details.connection}
                  onChange={(e) => field("connection", e.target.value)}
                >
                  <option value="unknown">Not sure</option>
                  <option value="wired">USB cable</option>
                  <option value="receiver">2.4 GHz receiver</option>
                  <option value="bluetooth">Bluetooth</option>
                </select>
              </label>
              <label>
                What happened?
                <select
                  value={details.outcome}
                  onChange={(e) => field("outcome", e.target.value)}
                >
                  <option value="not-detected">Device not detected</option>
                  <option value="read-failed">Cannot read settings</option>
                  <option value="save-failed">Settings do not save</option>
                  <option value="partial">Some features work</option>
                  <option value="works">What I tested works</option>
                  <option value="other">Something else</option>
                </select>
              </label>
              <label>
                Firmware (optional)
                <input
                  value={details.firmware}
                  maxLength={80}
                  onChange={(e) => field("firmware", e.target.value)}
                />
              </label>
              <label>
                Operating system (optional)
                <input
                  value={details.os}
                  placeholder="For example: Windows 11"
                  maxLength={80}
                  onChange={(e) => field("os", e.target.value)}
                />
              </label>
            </div>
            <label>
              What did you try? (optional)
              <textarea
                rows={3}
                value={details.notes}
                maxLength={2000}
                placeholder="Describe the feature, expected result and actual result. Do not include serial numbers or personal information."
                onChange={(e) => field("notes", e.target.value)}
              />
            </label>
            <p>
              No serial numbers, packet bytes, saved settings, macros or
              keystrokes are included. Model and firmware details above are
              provided by you.
            </p>
          </>
        )}
        {status && <p role="status">{status}</p>}
      </div>
    </Dialog>
  );
}
