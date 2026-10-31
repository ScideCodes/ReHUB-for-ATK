import { useEffect, useRef, useState } from "react";
import { Eraser, Send } from "lucide-react";
import { buildPacket } from "../../protocol/codec";
import { useConfigStore } from "../../store/configStore";
import { useHub } from "../../app/HubProvider";
import { Button, Dialog } from "../../ui";
import {
  hex,
  parseHexFrame,
  readEepromRange,
  refreshDevice,
  sendPacket,
  useDeviceSession,
} from "../device/deviceSession";

export function HidConsole() {
  const hub = useHub();
  const { logs, busy } = useDeviceSession();
  const connected = useConfigStore((state) => state.deviceInfo.connected);
  const [frame, setFrame] = useState(() => hex(buildPacket(4)));
  const [address, setAddress] = useState("0");
  const [length, setLength] = useState("10");
  const [dump, setDump] = useState("");
  const [resetFrame, setResetFrame] = useState<Uint8Array | null>(null);
  const [reading, setReading] = useState(false);
  const cancelRead = useRef(false);
  useEffect(
    () => () => {
      cancelRead.current = true;
    },
    [],
  );

  async function transmit(packet: Uint8Array, factoryConfirmed = false) {
    if (useDeviceSession.getState().busy)
      throw new Error("Wait for the current device operation.");
    useDeviceSession.setState({ busy: true });
    try {
      await sendPacket(packet, { factoryConfirmed });
      if ([7, 9, 15, 20, 22].includes(packet[0])) await refreshDevice();
    } finally {
      useDeviceSession.setState({ busy: false });
    }
  }
  function send() {
    void hub.run(async () => {
      const packet = parseHexFrame(frame);
      if (packet[0] === 9) setResetFrame(packet);
      else await transmit(packet);
    });
  }
  async function readRange() {
    const start = Number(address);
    const count = Number(length);
    if (
      !address.trim() ||
      !length.trim() ||
      !Number.isInteger(start) ||
      !Number.isInteger(count) ||
      start < 0 ||
      count < 1 ||
      start + count > 65536
    )
      throw new Error("Enter a valid 16-bit EEPROM address and range.");
    useDeviceSession.setState({ busy: true });
    setReading(true);
    setDump("");
    cancelRead.current = false;
    const lines: string[] = [];
    try {
      for (
        let offset = 0;
        offset < count && !cancelRead.current;
        offset += 10
      ) {
        const bytes = await readEepromRange(
          start + offset,
          Math.min(10, count - offset),
        );
        lines.push(
          `${(start + offset).toString(16).padStart(4, "0").toUpperCase()}  ${hex(bytes)}`,
        );
        setDump(lines.join("\n"));
      }
    } finally {
      setReading(false);
      useDeviceSession.setState({ busy: false });
    }
  }

  return (
    <div className="hid-console">
      <div className="console-heading">
        <div>
          <h3>Raw HID console</h3>
          <p className="hub-control-hint">
            Report ID 08 · 16-byte frames · incoming CRC errors are warnings.
          </p>
        </div>
        <Button
          size="small"
          variant="ghost"
          icon={<Eraser size={14} />}
          onClick={() => useDeviceSession.setState({ logs: [] })}
        >
          Clear log
        </Button>
      </div>
      <div
        className="hid-log"
        role="log"
        aria-live="off"
        aria-label="HID input and output"
      >
        {logs.length ? (
          logs.map((entry) => (
            <div
              key={entry.id}
              className="hid-log-entry"
              data-direction={entry.direction}
            >
              <time>{new Date(entry.time).toLocaleTimeString("en-GB")}</time>
              <strong>{entry.direction.toUpperCase()}</strong>
              <span>
                {entry.hex && <code>{entry.hex}</code>}
                <span>{entry.message}</span>
              </span>
            </div>
          ))
        ) : (
          <p className="hub-control-hint">
            Connect a device to record HID traffic.
          </p>
        )}
      </div>
      <label className="hub-field">
        <span className="hub-control-label">Custom frame · hexadecimal</span>
        <textarea
          className="hid-frame-input"
          rows={2}
          value={frame}
          spellCheck={false}
          onChange={(event) => setFrame(event.currentTarget.value)}
          aria-describedby="hid-frame-help"
        />
        <span id="hid-frame-help" className="hub-control-hint">
          Include all 16 frame bytes and the checksum. Exclude report ID 08.
        </span>
      </label>
      <Button
        icon={<Send size={14} />}
        disabled={!connected || busy}
        onClick={send}
      >
        Send frame
      </Button>
      <div className="eeprom-controls">
        <label className="hub-field">
          <span className="hub-control-label">Address</span>
          <input
            inputMode="numeric"
            type="number"
            min={0}
            max={65535}
            value={address}
            onChange={(event) => setAddress(event.currentTarget.value)}
          />
        </label>
        <label className="hub-field">
          <span className="hub-control-label">Length</span>
          <input
            inputMode="numeric"
            type="number"
            min={1}
            max={65536}
            value={length}
            onChange={(event) => setLength(event.currentTarget.value)}
          />
        </label>
        <Button
          disabled={!connected || busy}
          onClick={() => void hub.run(readRange)}
        >
          Read EEPROM
        </Button>
        {reading && (
          <Button
            onClick={() => {
              cancelRead.current = true;
            }}
          >
            Stop read
          </Button>
        )}
      </div>
      {dump && (
        <pre className="eeprom-dump" aria-label="EEPROM range data">
          {dump}
        </pre>
      )}
      <Dialog
        open={resetFrame !== null}
        onClose={() => setResetFrame(null)}
        title="Send factory reset?"
        description="This frame resets settings on the connected device."
        destructive
        confirmLabel="Send reset"
        onConfirm={async () => {
          if (resetFrame) await transmit(resetFrame, true);
          setResetFrame(null);
        }}
      />
    </div>
  );
}
