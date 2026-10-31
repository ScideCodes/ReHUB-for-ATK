import { SaveStatus } from "./SaveStatus";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Circle, Play, Square, Trash2 } from "lucide-react";
import type { KeyboardSettings } from "../../devices/keyboardSettings";
import { Button, Select } from "../index";

type Actions = KeyboardSettings["macros"][number]["actions"];
export function MacroControls({
  settings,
  edit,
  sequenceTarget,
}: {
  settings: KeyboardSettings;
  sequenceTarget?: HTMLDivElement | null;
  edit: (update: (draft: KeyboardSettings) => void) => void;
}) {
  const [slot, setSlot] = useState(0);
  const [recording, setRecording] = useState(false);
  const [captured, setCaptured] = useState<Actions>([]);
  const [playing, setPlaying] = useState(false);
  const [activeEvent, setActiveEvent] = useState(-1);
  const capture = useRef<HTMLDivElement>(null);
  const finishRecording = useRef<() => void>(() => {});
  const latestEdit = useRef(edit);
  latestEdit.current = edit;
  const macro = settings.macros[slot];
  const actions = recording ? captured : macro.actions;

  useEffect(() => {
    if (!recording) return;
    const events: Actions = [];
    const held = new Set<string>();
    let last = performance.now(),
      finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      for (const code of held) events.push({ code, down: false, delay: 0 });
      held.clear();
      if (events.length)
        latestEdit.current((s) => {
          s.macros[slot].actions = events;
        });
      setRecording(false);
    };
    finishRecording.current = finish;
    const listener = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        if (e.type === "keydown") finish();
        return;
      }
      if (finished || e.repeat || !e.code || e.code.length > 40) return;
      const down = e.type === "keydown";
      if (down) {
        if (held.has(e.code)) return;
        held.add(e.code);
      } else if (!held.delete(e.code)) return;
      const now = performance.now();
      events.push({
        code: e.code,
        down,
        delay: Math.min(65535, Math.round(now - last)),
      });
      last = now;
      setCaptured([...events]);
      // Reserve room for releases before reaching the schema's 1,000-event limit.
      if (events.length + held.size >= 990) finish();
    };
    const area = capture.current!;
    area.focus();
    area.addEventListener("keydown", listener);
    area.addEventListener("keyup", listener);
    area.addEventListener("blur", finish);
    window.addEventListener("blur", finish);
    return () => {
      finished = true;
      finishRecording.current = () => {};
      area.removeEventListener("keydown", listener);
      area.removeEventListener("keyup", listener);
      area.removeEventListener("blur", finish);
      window.removeEventListener("blur", finish);
    };
  }, [recording, slot]);

  useEffect(() => {
    if (!playing) return;
    let index = 0,
      timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (index >= macro.actions.length) {
        timer = setTimeout(() => {
          setPlaying(false);
          setActiveEvent(-1);
        }, 160);
        return;
      }
      timer = setTimeout(() => {
        setActiveEvent(index++);
        next();
      }, macro.actions[index].delay);
    };
    next();
    return () => clearTimeout(timer);
  }, [playing, macro.actions]);
  useEffect(() => {
    if (playing)
      (sequenceTarget ?? capture.current?.parentElement)
        ?.querySelector(`[data-event-index="${activeEvent}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [activeEvent, playing, sequenceTarget]);

  const sequence = (
    <>
      <div className="keyboard-macro-summary">
        <h2>Sequence</h2>
        <span>
          {actions
            .reduce((sum, action) => sum + action.delay, 0)
            .toLocaleString()}{" "}
          ms
        </span>
      </div>
      {actions.length ? (
        <ol className="keyboard-events" aria-label="Macro events">
          {actions.map((action, i) => (
            <li
              key={i}
              data-event-index={i}
              data-active={playing && activeEvent === i}
              aria-current={playing && activeEvent === i ? "step" : undefined}
            >
              <span className="keyboard-event-index" aria-hidden="true">
                {i + 1}
              </span>
              <span className="keyboard-event-key" title={action.code}>
                {action.code}
                <small>{action.down ? "Press" : "Release"}</small>
              </span>
              <label className="keyboard-delay-chip">
                <input
                  aria-label={`Event ${i + 1} delay`}
                  type="number"
                  min={0}
                  max={65535}
                  step={1}
                  value={action.delay}
                  disabled={recording || playing}
                  onChange={(e) => {
                    if (e.currentTarget.validity.valid && e.target.value !== "")
                      edit((s) => {
                        s.macros[slot].actions[i].delay = +e.target.value;
                      });
                  }}
                />
                <span>ms</span>
              </label>
            </li>
          ))}
        </ol>
      ) : (
        <div className="keyboard-macro-empty">
          <p>
            {recording
              ? "Waiting for the first key…"
              : "No events in this slot."}
          </p>
          <span>
            {recording
              ? "Key repeats are ignored."
              : "Choose Record, type your sequence, then stop."}
          </span>
        </div>
      )}
      <Button
        icon={<Trash2 size={14} />}
        disabled={recording || playing || !macro.actions.length}
        onClick={() =>
          edit((s) => {
            s.macros[slot].actions = [];
          })
        }
      >
        Clear sequence
      </Button>
    </>
  );
  return (
    <div className="keyboard-controls keyboard-macros">
      <SaveStatus fields={[`macros.${slot}`]} />
      <Select
        label="Macro slot"
        disabled={recording || playing}
        value={slot}
        options={settings.macros.map((m, value) => ({ value, label: m.name }))}
        onValueChange={setSlot}
      />
      <label className="keyboard-field">
        Name
        <input
          value={macro.name}
          maxLength={60}
          disabled={recording || playing}
          onChange={(e) => {
            if (e.target.value.trim())
              edit((s) => {
                s.macros[slot].name = e.target.value;
              });
          }}
        />
      </label>
      <div
        className="keyboard-macro-transport"
        role="group"
        aria-label="Macro transport"
      >
        <Button
          icon={recording ? <Square size={14} /> : <Circle size={14} />}
          disabled={playing}
          aria-pressed={recording}
          onPointerDown={(event) => {
            if (recording) event.preventDefault();
          }}
          onClick={() => {
            if (recording) finishRecording.current();
            else {
              setCaptured([]);
              setRecording(true);
            }
          }}
        >
          {recording ? "Stop recording" : "Record"}
        </Button>
        <Button
          icon={playing ? <Square size={14} /> : <Play size={14} />}
          disabled={recording || !macro.actions.length}
          aria-pressed={playing}
          onClick={() => {
            setActiveEvent(-1);
            setPlaying(!playing);
          }}
        >
          {playing ? "Stop preview" : "Preview"}
        </Button>
      </div>
      <div
        ref={capture}
        className="keyboard-recording"
        data-recording={recording}
        tabIndex={0}
        aria-label="Macro recording area"
        aria-describedby="keyboard-macro-help"
      >
        <strong role="status">
          {recording
            ? "Recording…"
            : playing
              ? "Previewing sequence"
              : `${macro.actions.length} events saved`}
        </strong>
        <span>
          {recording
            ? "Press keys here. Escape or move focus to stop."
            : playing
              ? "Visual preview only. No keys are sent."
              : "Record key presses and releases with their timing."}
        </span>
      </div>
      <p className="keyboard-note" id="keyboard-macro-help">
        Recording replaces this sequence when stopped. Hardware macro writes
        remain blocked.
      </p>
      {sequenceTarget ? createPortal(sequence, sequenceTarget) : sequence}
    </div>
  );
}
