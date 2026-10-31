// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Slider } from "./controls";
import { setAppearance, useAppearance } from "../ui/console/appearanceStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Live({ onCommit }: { onCommit: (value: number) => void }) {
  // Mirrors the wallpaper page: onChange previews by moving the value itself.
  const [value, setValue] = useState(10);
  return <Slider label="Blur" value={value} min={0} max={20} onChange={setValue} onCommit={onCommit} />;
}

it("commits the final value even when a live preview already moved it", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onCommit = vi.fn();
  act(() => root.render(<Live onCommit={onCommit} />));
  const input = host.querySelector("input")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    input.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    setter.call(input, "14");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => input.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
  expect(onCommit).toHaveBeenCalledExactlyOnceWith(14);

  // Releasing again without a change does not commit twice.
  act(() => input.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
  expect(onCommit).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});

it("keeps previews out of storage until the value is committed", async () => {
  localStorage.removeItem("atk-hub-appearance");
  setAppearance({ blur: 6 }, { persist: false });
  expect(localStorage.getItem("atk-hub-appearance")).toBeNull();
  setAppearance({ blur: 6 });
  expect(JSON.parse(localStorage.getItem("atk-hub-appearance")!).blur).toBe(6);

  // A preview still reaches subscribers (on the next frame).
  let seen = 0;
  function Probe() {
    seen = useAppearance().blur;
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<Probe />));
  await act(async () => {
    setAppearance({ blur: 9 }, { persist: false });
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
  expect(seen).toBe(9);
  act(() => root.unmount());
});
