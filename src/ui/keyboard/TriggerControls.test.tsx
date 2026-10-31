// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createKeyboardSettings } from "../../devices/keyboardSettings";
import { ATK68 } from "../../devices/registry";
import { TriggerControls } from "./BasicControls";
import { TravelGraph } from "./TravelGraph";

let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  MotionGlobalConfig.skipAnimations = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  MotionGlobalConfig.skipAnimations = false;
});
it.each(["key", "all"] as const)(
  "edits rapid trigger only in the %s scope and preserves unrelated fields",
  async (scope) => {
    const settings = createKeyboardSettings(),
      before = structuredClone(settings);
    await act(async () =>
      root.render(
        <TriggerControls
          device={ATK68}
          settings={settings}
          edit={(change) => change(settings)}
          selected={1}
          layer={0}
          setLayer={() => {}}
          scope={scope}
          onSelectKey={() => {}}
        />,
      ),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="switch"]')!.click(),
    );
    settings.keys.forEach((key, index) => {
      expect(key.rt.on).toBe(scope === "all" || index === 1);
      expect({ ...key, rt: before.keys[index].rt }).toEqual(before.keys[index]);
      expect(key.rt.press).toBe(before.keys[index].rt.press);
      expect(key.rt.release).toBe(before.keys[index].rt.release);
    });
    expect(settings.deadZone).toEqual(before.deadZone);
  },
);
it("labels mixed actuation values without editing a map", async () => {
  const settings = createKeyboardSettings();
  settings.keys[1].actuation = 2;
  const edit = vi.fn(),
    onSelectKey = vi.fn();
  await act(async () =>
    root.render(
      <TriggerControls
        device={ATK68}
        settings={settings}
        edit={edit}
        selected={0}
        layer={0}
        setLayer={() => {}}
        scope="all"
        onSelectKey={onSelectKey}
      />,
    ),
  );
  expect(host.textContent).toContain("Mixed across keys");
  expect(edit).not.toHaveBeenCalled();
});
it("shows relative RT distances only when enabled and identifies the graph as illustrative", () => {
  const key = createKeyboardSettings().keys[0];
  const off = renderToStaticMarkup(<TravelGraph value={key} />);
  expect(off).not.toContain("Lift to reset");
  expect(off).toContain("Rapid trigger off");
  expect(off).toContain("First press");
  expect(off).toContain("Key up");
  expect(off).toContain("Fully down");
  expect(off).toContain("At the point: press registers");
  key.rt = { on: true, release: 0.25, press: 0.15 };
  const on = renderToStaticMarkup(
    <TravelGraph value={key} label="Esc" scope="all" />,
  );
  expect(on).toContain("0.25 mm");
  expect(on).toContain("0.15 mm");
  expect(on).toContain("All keys · preview Esc");
  expect(on).toContain("not a live sensor reading");
  expect(on).toContain("Lift to reset");
  expect(on).toContain("Press again");
});

it.each([{ selectedKeys: [1, 3, 5] }, { selectedKeys: [] }])(
  "edits only an explicit selection ($selectedKeys)",
  async ({ selectedKeys }) => {
    const settings = createKeyboardSettings(),
      before = structuredClone(settings);
    const edit = vi.fn((change: (draft: typeof settings) => void) =>
      change(settings),
    );
    await act(async () =>
      root.render(
        <TriggerControls
          device={ATK68}
          settings={settings}
          edit={edit}
          selected={1}
          selectedKeys={selectedKeys}
          layer={0}
          setLayer={() => {}}
          scope="key"
          onSelectKey={() => {}}
        />,
      ),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="switch"]')!.click(),
    );
    settings.keys.forEach((key, index) => {
      expect(key.rt.on).toBe(selectedKeys.includes(index));
      expect({ ...key, rt: before.keys[index].rt }).toEqual(before.keys[index]);
    });
    if (!selectedKeys.length) {
      expect(host.textContent).toContain("Select keys on the keyboard");
      expect(host.querySelector("fieldset")!.disabled).toBe(true);
      expect(edit).not.toHaveBeenCalled();
    }
  },
);
