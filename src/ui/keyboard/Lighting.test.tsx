// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createKeyboardSettings,
  LIGHT_MODES,
} from "../../devices/keyboardSettings";
import { KeyMatrix } from "./KeyMatrix";
import { lightingPreview, previewKeyColor } from "./lightingPreview";

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  MotionGlobalConfig.skipAnimations = false;
});

it("previews every source effect without changing settings", () => {
  const settings = createKeyboardSettings();
  for (const [mode] of LIGHT_MODES) {
    settings.light.mode = mode;
    const before = JSON.stringify(settings);
    const result = lightingPreview(settings);
    expect(["still", "wave", "breathe", "reactive"]).toContain(result.family);
    expect(result.brightness).toBeGreaterThanOrEqual(0);
    expect(result.brightness).toBeLessThanOrEqual(1);
    expect(previewKeyColor(settings, 0)).toBeTruthy();
    expect(JSON.stringify(settings)).toBe(before);
  }
  settings.light.mode = 0;
  expect(lightingPreview(settings).brightness).toBe(0);
  settings.light.mode = 1;
  settings.keys[0].color = "#ff6a1a";
  expect(previewKeyColor(settings, 0)).toBe("#ff6a1a");
  settings.light.mode = 2;
  settings.light.color = "#abcdef";
  expect(previewKeyColor(settings, 0)).toBe("#abcdef");
});

it("commits a whole pointer stroke once, with immediate keycap preview", async () => {
  const settings = createKeyboardSettings();
  settings.light.mode = 1;
  const onPaint = vi.fn();
  await act(async () =>
    root.render(
      <KeyMatrix
        settings={settings}
        selected={0}
        layer={0}
        onSelect={() => {}}
        lighting
        paintColor="#ff6a1a"
        onPaint={onPaint}
      />,
    ),
  );
  const keys = host.querySelectorAll<HTMLButtonElement>(
    "button[data-key-index]",
  );
  vi.spyOn(document, "elementFromPoint").mockReturnValue(keys[1]);
  await act(async () =>
    keys[0].dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 7,
        button: 0,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await act(async () =>
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 7,
        clientX: 10,
        clientY: 10,
      }),
    ),
  );
  expect(onPaint).not.toHaveBeenCalled();
  expect(keys[1].style.getPropertyValue("--key-led")).toBe("#ff6a1a");
  await act(async () =>
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7 })),
  );
  expect(onPaint).toHaveBeenCalledOnce();
  expect(onPaint).toHaveBeenCalledWith([0, 1]);
  expect(settings.keys[0].color).toBe("#ffffff");
});

it("cancels without saving when pointer input is interrupted or maps change", async () => {
  const settings = createKeyboardSettings();
  settings.light.mode = 1;
  const onPaint = vi.fn();
  const render = (value: typeof settings) =>
    root.render(
      <KeyMatrix
        settings={value}
        selected={0}
        layer={0}
        onSelect={() => {}}
        lighting
        paintColor="#ff6a1a"
        onPaint={onPaint}
      />,
    );
  await act(async () => render(settings));
  const key = host.querySelector<HTMLButtonElement>("button[data-key-index]")!;
  await act(async () =>
    key.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        button: 0,
        bubbles: true,
      }),
    ),
  );
  await act(async () =>
    window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 })),
  );
  expect(key.style.getPropertyValue("--key-led")).toBe("#ffffff");
  expect(onPaint).not.toHaveBeenCalled();
  await act(async () =>
    key.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 2,
        button: 0,
        bubbles: true,
      }),
    ),
  );
  const other = structuredClone(settings);
  other.keys[0].color = "#000000";
  await act(async () => render(other));
  await act(async () =>
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2 })),
  );
  expect(onPaint).not.toHaveBeenCalled();
  expect(key.style.getPropertyValue("--key-led")).toBe("#000000");
});

it("keeps static effects read-only in the matrix and permits keyboard painting in Custom", async () => {
  const settings = createKeyboardSettings(),
    onPaint = vi.fn();
  const render = () =>
    root.render(
      <KeyMatrix
        settings={settings}
        selected={0}
        layer={0}
        onSelect={() => {}}
        lighting
        paintColor="#ff6a1a"
        onPaint={onPaint}
        animatePreview={false}
      />,
    );
  await act(async () => render());
  const key = host.querySelector<HTMLButtonElement>("button[data-key-index]")!;
  await act(async () => key.click());
  expect(onPaint).not.toHaveBeenCalled();
  settings.light.mode = 1;
  await act(async () => render());
  await act(async () => key.click());
  expect(onPaint).toHaveBeenCalledWith([0]);
  expect(
    host.querySelector("figure")?.getAttribute("data-preview-motion"),
  ).toBe("false");
});

it("updates the preview when reduced motion changes during a session", async () => {
  const media = new EventTarget() as MediaQueryList;
  Object.defineProperty(media, "matches", { value: false, writable: true });
  vi.spyOn(window, "matchMedia").mockReturnValue(media);
  const settings = createKeyboardSettings();
  settings.light.mode = 6;
  await act(async () =>
    root.render(
      <KeyMatrix
        settings={settings}
        selected={0}
        layer={0}
        onSelect={() => {}}
        lighting
      />,
    ),
  );
  expect(
    host.querySelector("figure")?.getAttribute("data-preview-motion"),
  ).toBe("true");
  await act(async () => {
    Object.defineProperty(media, "matches", { value: true });
    media.dispatchEvent(new Event("change"));
  });
  expect(
    host.querySelector("figure")?.getAttribute("data-preview-motion"),
  ).toBe("false");
});
