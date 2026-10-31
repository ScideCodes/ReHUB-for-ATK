// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MotionGlobalConfig } from "framer-motion";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  createKeyboardSettings,
  KeyboardSettingsSchema,
  type KeyboardSettings,
} from "../../devices/keyboardSettings";
import { MacroControls } from "./MacroControls";

let host: HTMLDivElement,
  root: ReturnType<typeof createRoot>,
  settings: KeyboardSettings;
const edit = vi.fn((update: (draft: KeyboardSettings) => void) => {
  const draft = structuredClone(settings);
  update(draft);
  settings = KeyboardSettingsSchema.parse(draft);
  render();
});
function render(key = "first") {
  root.render(<MacroControls key={key} settings={settings} edit={edit} />);
}
function button(name: string) {
  return [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === name,
  )!;
}
function key(code: string, type = "keydown", repeat = false) {
  host.querySelector(".keyboard-recording")!.dispatchEvent(
    new KeyboardEvent(type, {
      code,
      repeat,
      bubbles: true,
      cancelable: true,
    }),
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  MotionGlobalConfig.skipAnimations = true;
  settings = createKeyboardSettings();
  edit.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  MotionGlobalConfig.skipAnimations = false;
});

it("gives empty slots a clear action and disables unavailable transport", async () => {
  await act(async () => render());
  expect(host.textContent).toContain("No events in this slot.");
  expect(button("Preview").disabled).toBe(true);
  expect(button("Clear sequence").disabled).toBe(true);
  expect(button("Record").disabled).toBe(false);
});
it("records once, ignores repeats and closes held keys on explicit stop", async () => {
  await act(async () => render());
  await act(async () => button("Record").click());
  expect(document.activeElement).toBe(
    host.querySelector(".keyboard-recording"),
  );
  await act(async () => {
    key("KeyA");
    key("KeyA", "keydown", true);
    key("KeyB");
    key("KeyA", "keyup");
  });
  await act(async () => button("Stop recording").click());
  expect(settings.macros[0].actions.map((a) => [a.code, a.down])).toEqual([
    ["KeyA", true],
    ["KeyB", true],
    ["KeyA", false],
    ["KeyB", false],
  ]);
  expect(edit).toHaveBeenCalledTimes(1);
  expect(button("Record")).toBeTruthy();
});
it("stops on Escape or focus loss without erasing a sequence when nothing was recorded", async () => {
  settings.macros[0].actions = [
    { code: "KeyQ", down: true, delay: 12 },
    { code: "KeyQ", down: false, delay: 30 },
  ];
  await act(async () => render());
  await act(async () => button("Record").click());
  await act(async () => key("Escape"));
  expect(edit).not.toHaveBeenCalled();
  expect(settings.macros[0].actions).toHaveLength(2);
  await act(async () => button("Record").click());
  await act(async () => {
    key("KeyW");
    window.dispatchEvent(new Event("blur"));
  });
  expect(settings.macros[0].actions.map((a) => a.down)).toEqual([true, false]);
});
it("reserves releases at the capture limit and remains schema-valid", async () => {
  await act(async () => render());
  await act(async () => button("Record").click());
  await act(async () => {
    for (let n = 0; n < 495; n++) {
      key("KeyA");
      key("KeyA", "keyup");
    }
  });
  expect(button("Record")).toBeTruthy();
  expect(settings.macros[0].actions.length).toBeLessThanOrEqual(1000);
  expect(settings.macros[0].actions.at(-1)?.down).toBe(false);
  expect(KeyboardSettingsSchema.safeParse(settings).success).toBe(true);
});
it("previews delays locally, supports stop and cleans timers on unmount", async () => {
  vi.useFakeTimers();
  settings.macros[0].actions = [
    { code: "KeyA", down: true, delay: 20 },
    { code: "KeyA", down: false, delay: 50 },
  ];
  await act(async () => render());
  await act(async () => button("Preview").click());
  expect(button("Record").disabled).toBe(true);
  await act(async () => vi.advanceTimersByTime(20));
  expect(
    host.querySelector('[data-event-index="0"]')?.getAttribute("aria-current"),
  ).toBe("step");
  await act(async () => button("Stop preview").click());
  expect(host.querySelector('[aria-current="step"]')).toBeNull();
  await act(async () => button("Preview").click());
  await act(async () => vi.advanceTimersByTime(250));
  expect(button("Preview")).toBeTruthy();
  expect(edit).not.toHaveBeenCalled();
  await act(async () => button("Preview").click());
  await act(async () => render("another-map"));
  await act(async () => vi.runOnlyPendingTimers());
  expect(button("Preview")).toBeTruthy();
});
it("edits delay chips, clears sequences, and discards recording on map remount", async () => {
  settings.macros[0].actions = [
    { code: "KeyA", down: true, delay: 20 },
    { code: "KeyA", down: false, delay: 50 },
  ];
  await act(async () => render());
  const input = host.querySelector<HTMLInputElement>(
    '[aria-label="Event 1 delay"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "123");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(settings.macros[0].actions[0].delay).toBe(123);
  await act(async () => button("Clear sequence").click());
  expect(settings.macros[0].actions).toHaveLength(0);
  await act(async () => button("Record").click());
  await act(async () => key("KeyB"));
  edit.mockClear();
  await act(async () => render("another-map"));
  await act(async () => window.dispatchEvent(new Event("blur")));
  expect(edit).not.toHaveBeenCalled();
  expect(host.textContent).toContain("No events in this slot.");
});

it("renders sequence rows in the visual pane when a target is supplied", async () => {
  settings.macros[0].actions = [{ code: "KeyA", down: true, delay: 20 }];
  const target = document.createElement("div");
  document.body.append(target);
  try {
    await act(async () =>
      root.render(
        <MacroControls
          settings={settings}
          edit={edit}
          sequenceTarget={target}
        />,
      ),
    );
    expect(target.querySelectorAll(".keyboard-events li")).toHaveLength(1);
    expect(host.querySelector(".keyboard-events")).toBeNull();
    expect(target.textContent).toContain("20 ms");
  } finally {
    await act(async () => root.unmount());
    root = createRoot(host);
    target.remove();
  }
});
