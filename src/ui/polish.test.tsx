// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Select } from "./Select";
import { ToastProvider, useToast } from "./Toast";
import { MapDiff } from "../features/maps/MapDiff";
import { Toggle } from "./Toggle";

let host: HTMLDivElement;
let root: Root;
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  MotionGlobalConfig.skipAnimations = false;
});

it("gives labeled icon buttons a tooltip while preserving explicit help", async () => {
  await act(async () =>
    root.render(
      <>
        <Button size="icon" aria-label="Close dialog" />
        <Button aria-label="Undo" title="Undo · Ctrl+Z" />
      </>,
    ),
  );
  expect(host.querySelector("button")?.title).toBe("Close dialog");
  expect(host.querySelectorAll("button")[1].title).toBe("Undo · Ctrl+Z");
});

it("exposes the full selected label and the reason a select is disabled", async () => {
  const props = {
    label: "Assignment",
    value: "a",
    options: [{ value: "a", label: "A long assignment name" }],
    onValueChange: vi.fn(),
  };
  await act(async () => root.render(<Select {...props} />));
  expect(host.querySelector("button")?.title).toBe("A long assignment name");
  await act(async () =>
    root.render(
      <Select {...props} disabled disabledReason="Connect a device first" />,
    ),
  );
  expect(host.querySelector("button")?.title).toBe("Connect a device first");
});

it("keeps hidden switch labels and disabled reasons available as tooltips", async () => {
  await act(async () =>
    root.render(
      <Toggle label="Safe mode" hideLabel checked onCheckedChange={vi.fn()} />,
    ),
  );
  expect(host.querySelector("button")?.title).toBe("Safe mode");
  await act(async () =>
    root.render(
      <Toggle
        label="Safe mode"
        hideLabel
        checked
        disabled
        disabledReason="Device busy"
        onCheckedChange={vi.fn()}
      />,
    ),
  );
  expect(host.querySelector("button")?.title).toBe("Device busy");
});

it("pauses toast expiry while its dismiss control has keyboard focus", async () => {
  vi.useFakeTimers();
  function Example() {
    const { toast } = useToast();
    return (
      <button onClick={() => toast({ title: "Map saved", duration: 1000 })}>
        Notify
      </button>
    );
  }
  await act(async () =>
    root.render(
      <ToastProvider>
        <Example />
      </ToastProvider>,
    ),
  );
  await act(async () => host.querySelector("button")!.click());
  await act(async () => vi.advanceTimersByTime(400));
  const dismiss = document.querySelector<HTMLButtonElement>(
    '[aria-label="Dismiss Map saved"]',
  )!;
  expect(dismiss.title).toBe("Dismiss Map saved");
  await act(async () => dismiss.focus());
  await act(async () => vi.advanceTimersByTime(2000));
  expect(document.querySelector(".hub-toast")).not.toBeNull();
  await act(async () => host.querySelector("button")!.focus());
  await act(async () => vi.advanceTimersByTime(601));
  expect(document.querySelector(".hub-toast")).toBeNull();
});

it("pauses click-through toast copy under the pointer without intercepting clicks", async () => {
  vi.useFakeTimers();
  function Example() {
    const { toast } = useToast();
    return (
      <button onClick={() => toast({ title: "Saved", duration: 1000 })}>
        Notify
      </button>
    );
  }
  await act(async () =>
    root.render(
      <ToastProvider>
        <Example />
      </ToastProvider>,
    ),
  );
  await act(async () => host.querySelector("button")!.click());
  const toast = document.querySelector<HTMLElement>(".hub-toast")!;
  vi.spyOn(toast, "getBoundingClientRect").mockReturnValue({
    left: 10,
    right: 110,
    top: 10,
    bottom: 60,
    width: 100,
    height: 50,
    x: 10,
    y: 10,
    toJSON() {
      return {};
    },
  });
  await act(async () =>
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 30, clientY: 30 }),
    ),
  );
  await act(async () => vi.advanceTimersByTime(2000));
  expect(document.querySelector(".hub-toast")).not.toBeNull();
  await act(async () =>
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 200, clientY: 200 }),
    ),
  );
  await act(async () => vi.advanceTimersByTime(1001));
  expect(document.querySelector(".hub-toast")).toBeNull();
});

it("keeps interactive diffs out of definition lists and preserves navigation", async () => {
  const onSelectPath = vi.fn();
  const differences = [
    {
      path: "pollingRate",
      label: "Polling rate",
      before: "1000 Hz",
      after: "8000 Hz",
    },
  ];
  await act(async () =>
    root.render(
      <MapDiff differences={differences} onSelectPath={onSelectPath} />,
    ),
  );
  expect(host.querySelector("dl,dt,dd")).toBeNull();
  await act(async () => host.querySelector("button")!.click());
  expect(onSelectPath).toHaveBeenCalledWith("pollingRate");
  await act(async () => root.render(<MapDiff differences={differences} />));
  expect(host.querySelector("dl > div > dt")?.textContent).toBe("Polling rate");
  expect(host.querySelector("dd")?.textContent).toContain("8000 Hz");
});
