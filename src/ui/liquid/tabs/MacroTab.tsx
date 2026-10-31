import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ButtonSave } from "../LiveControls";
import { Circle, Save, Square, Trash2 } from "lucide-react";
import { useHub } from "../../../app/HubProvider";
import { editSetting } from "../../../features/maps/mapSession";
import { Button, Select, useToast } from "../../index";
import { NumericField, Row } from "../controls";
import {
  closeHeldKeys,
  readRecording,
  serializeRecording,
  type RecordedKey,
} from "../macros";

export function MacroTab({
  active = true,
  onDraftChange,
  onDiff,
}: {
  active?: boolean;
  onDiff?: () => void;
  onDraftChange?: (dirty: boolean) => void;
}) {
  const { map, settings } = useHub();
  const { toast } = useToast();
  const available = settings.buttons.filter((button) => button.id !== "bottom");
  const [selected, setSelected] = useState(
    available.find((button) => button.keyClass === 6)?.id ?? "left",
  );
  const action = available.find((button) => button.id === selected);
  const [events, setEvents] = useState<RecordedKey[]>(
    () => readRecording(action?.description) ?? [],
  );
  const [recording, setRecording] = useState(false);
  const [slot, setSlot] = useState(
    action?.keyClass === 6 ? action.keyValue1 : 0,
  );
  const [loops, setLoops] = useState(
    action?.keyClass === 6 ? action.keyValue2 : 1,
  );
  const [limit, setLimit] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const held = useRef(new Map<string, string>());
  const time = useRef(0);
  const eventCount = useRef(0);
  const source = useRef({
    map: map?.id,
    button: selected,
    description: action?.description,
    slot: action?.keyValue1,
    loops: action?.keyValue2,
  });
  useEffect(() => {
    const previous = source.current;
    source.current = {
      map: map?.id,
      button: selected,
      description: action?.description,
      slot: action?.keyValue1,
      loops: action?.keyValue2,
    };
    if (
      previous.map !== map?.id ||
      (previous.button === selected &&
        (previous.description !== action?.description ||
          previous.slot !== action?.keyValue1 ||
          previous.loops !== action?.keyValue2))
    ) {
      setEvents(readRecording(action?.description) ?? []);
      setRecording(false);
      held.current.clear();
      setSlot(action?.keyClass === 6 ? action.keyValue1 : 0);
      setLoops(action?.keyClass === 6 ? action.keyValue2 : 1);
      setLimit(false);
    }
  }, [
    map?.id,
    selected,
    action?.description,
    action?.keyValue1,
    action?.keyValue2,
    action?.keyClass,
  ]);
  useEffect(() => {
    if (recording) area.current?.focus();
  }, [recording]);
  function stop() {
    const released = new Map(held.current);
    held.current.clear();
    setRecording(false);
    setEvents((current) => closeHeldKeys(current, released));
  }
  useEffect(() => {
    if (!active) stop();
  }, [active]);
  function record(event: KeyboardEvent<HTMLDivElement>, type: "down" | "up") {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      stop();
      return;
    }
    if (type === "down" && event.repeat) return;
    const code = event.code || event.key;
    if (type === "down" && held.current.has(code)) return;
    if (type === "up" && !held.current.has(code)) return;
    const nextHeldCount = held.current.size + (type === "down" ? 1 : -1);
    if (eventCount.current + 1 + nextHeldCount > 256) {
      setLimit(true);
      stop();
      return;
    }
    if (type === "down") held.current.set(code, event.key);
    else held.current.delete(code);
    const now = performance.now();
    const delay = time.current
      ? Math.min(600000, Math.round(now - time.current))
      : 0;
    time.current = now;
    eventCount.current++;
    setEvents((current) => [...current, { type, key: event.key, code, delay }]);
  }
  const saved =
    action?.keyClass === 6 &&
    action.description === serializeRecording(events) &&
    action.keyValue1 === slot &&
    action.keyValue2 === loops;
  const dirty = events.length > 0 && !saved;
  useEffect(() => {
    onDraftChange?.(dirty);
  }, [dirty, onDraftChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (
    <div className="lg-macro">
      <div
        className="lg-recorder glass-clear glass-inset"
        data-recording={recording}
        tabIndex={0}
        ref={area}
        role="group"
        aria-label="Macro recording area"
        aria-describedby="macro-record-help"
        onKeyDown={(event) => record(event, "down")}
        onKeyUp={(event) => record(event, "up")}
        onBlur={(event) => {
          if (recording && !event.currentTarget.contains(event.relatedTarget))
            stop();
        }}
      >
        <div className="lg-record-status">
          <span />
          {recording ? "Recording" : "Keyboard sequence"}
        </div>
        <h2>
          {recording
            ? "Press keys to record"
            : events.length
              ? `${events.length} recorded events`
              : "Record a sequence"}
        </h2>
        <p id="macro-record-help">
          {recording
            ? "Press Escape or Stop to finish. Only keys in this area are captured."
            : "Records key presses, releases, and the delay between them."}
        </p>
        <Button
          variant={recording ? "danger" : "secondary"}
          icon={recording ? <Square size={14} /> : <Circle size={14} />}
          onClick={() => {
            if (recording) stop();
            else {
              held.current.clear();
              setEvents([]);
              eventCount.current = 0;
              time.current = 0;
              setLimit(false);
              setRecording(true);
            }
          }}
        >
          {recording
            ? "Stop recording"
            : events.length
              ? "Record again"
              : "Start recording"}
        </Button>
      </div>
      {limit && (
        <p className="lg-inline-notice">
          Recording stopped at the editor limit. Release events were added for
          held keys.
        </p>
      )}
      {readRecording(action?.description) === null && (
        <p className="lg-inline-notice">
          This button has an existing text sequence. It stays unchanged until
          you save a new recording.
        </p>
      )}
      {events.length > 0 && (
        <details className="lg-sequence-details">
          <summary>Recorded events ({events.length})</summary>
          <ol className="lg-macro-events" aria-label="Recorded sequence">
            {events.map((event, index) => (
              <li key={index}>
                <span className="lg-event-index">{index + 1}</span>
                <kbd>{event.key === " " ? "Space" : event.key}</kbd>
                <span>{event.type === "down" ? "Press" : "Release"}</span>
                <NumericField
                  label={`Delay before event ${index + 1}, milliseconds`}
                  value={event.delay}
                  min={0}
                  max={600000}
                  onCommit={(delay) =>
                    setEvents((current) =>
                      current.map((item, i) =>
                        i === index ? { ...item, delay } : item,
                      ),
                    )
                  }
                />
                <span className="lg-event-unit">ms</span>
              </li>
            ))}
          </ol>
        </details>
      )}
      <section className="lg-macro-assignment" aria-label="Assign to button">
        <Row
          label="Assign to button"
          help="Saving replaces this button's current map assignment."
        >
          <Select
            label="Macro button"
            hideLabel
            disabled={recording}
            value={selected}
            options={available.map((button) => ({
              value: button.id,
              label: button.label,
            }))}
            onValueChange={(value) => {
              const next = available.find((button) => button.id === value);
              if (
                !events.length ||
                action?.description === serializeRecording(events)
              )
                setEvents(readRecording(next?.description) ?? []);
              setSelected(value);
              setSlot(next?.keyClass === 6 ? next.keyValue1 : 0);
              setLoops(next?.keyClass === 6 ? next.keyValue2 : 1);
            }}
          />
        </Row>
        <div className="lg-macro-options">
          <div className="lg-form-field">
            <span>Macro index</span>
            <NumericField
              label="Macro index"
              value={slot}
              min={0}
              max={255}
              onCommit={setSlot}
            />
          </div>
          <Select
            label="Playback"
            value={loops >= 253 ? String(loops) : "loops"}
            options={[
              { value: "loops", label: "Loop count" },
              { value: "254", label: "Stop now" },
              { value: "253", label: "Until next key" },
              { value: "255", label: "Until any key" },
            ]}
            onValueChange={(value) =>
              setLoops(value === "loops" ? 1 : Number(value))
            }
          />
          {loops < 253 && (
            <div className="lg-form-field">
              <span>Loops</span>
              <NumericField
                label="Loop count"
                value={loops}
                min={1}
                max={252}
                onCommit={setLoops}
              />
            </div>
          )}
        </div>
        <div className="lg-toolbar">
          <Button
            variant="primary"
            disabled={recording || !events.length || !action || saved}
            icon={<Save size={15} />}
            onClick={() => {
              if (!action) return;
              editSetting(
                "buttons",
                settings.buttons.map((button) =>
                  button.id === selected
                    ? {
                        ...button,
                        keyClass: 6,
                        keyValue1: slot,
                        keyValue2: loops,
                        description: serializeRecording(events),
                      }
                    : button,
                ),
              );
              toast({ title: "Sequence saved to map", tone: "success" });
            }}
          >
            {saved ? "Saved to map" : "Save sequence"}
          </Button>
          <Button
            variant="ghost"
            disabled={recording || !events.length}
            icon={<Trash2 size={15} />}
            onClick={() => setEvents([])}
          >
            Clear recording
          </Button>
        </div>
        <ButtonSave onDiff={onDiff} />
      </section>
      <p className="lg-inline-notice">
        Hardware sequences need packet verification. Available in Mock Device.
      </p>
    </div>
  );
}
