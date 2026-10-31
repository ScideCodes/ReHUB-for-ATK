// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createKeyboardSettings } from "../../devices/keyboardSettings";
import { KeyAssignmentPicker } from "./KeyAssignmentPicker";

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
  MotionGlobalConfig.skipAnimations = false;
  vi.unstubAllGlobals();
});
async function open(code = [0, 41]) {
  const change = vi.fn();
  await act(async () =>
    root.render(
      <KeyAssignmentPicker
        code={code}
        macros={createKeyboardSettings().macros}
        onChange={change}
      />,
    ),
  );
  const trigger = host.querySelector<HTMLButtonElement>("button")!;
  trigger.focus();
  await act(async () => trigger.click());
  return {
    change,
    trigger,
    search: document.querySelector<HTMLInputElement>(
      '[aria-label="Search assignments"]',
    )!,
  };
}
async function search(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("filters assignments and shows a designed empty result", async () => {
  const picker = await open();
  await search(picker.search, "Backspace");
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[role="option"]')!.click(),
  );
  expect(picker.change).toHaveBeenCalledWith(42);
  await act(async () => picker.trigger.click());
  const input = document.querySelector<HTMLInputElement>(
    '[aria-label="Search assignments"]',
  )!;
  await search(input, "does-not-exist");
  expect(document.querySelector('[role="status"]')?.textContent).toBe(
    "No matching assignments.",
  );
});
it("supports arrow navigation without changing the assignment before selection", async () => {
  const picker = await open();
  await act(async () =>
    picker.search.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.activeElement?.getAttribute("role")).toBe("option");
  expect(picker.change).not.toHaveBeenCalled();
  await act(async () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "End",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.activeElement?.textContent).toContain("255");
});
it("offers only existing macro slots for macro assignments", async () => {
  await open([119, 2]);
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(16);
  expect(
    document.querySelector('[aria-selected="true"]')?.textContent,
  ).toContain("M3");
});
