// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColorPicker } from "./ColorPicker";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderPicker(initial = "#BDC9E2") {
  const change = vi.fn();
  function Field() {
    const [value, setValue] = useState(initial);
    return (
      <ColorPicker
        label="Map color"
        value={value}
        onValueChange={(next) => {
          change(next);
          setValue(next);
        }}
      />
    );
  }
  act(() => root.render(<Field />));
  return {
    input: container.querySelector<HTMLInputElement>('input[type="text"]')!,
    change,
  };
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function key(input: HTMLInputElement, value: string) {
  const event = new KeyboardEvent("keydown", {
    key: value,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    input.dispatchEvent(event);
  });
  return event;
}

function blur(input: HTMLInputElement) {
  act(() => {
    input.focus();
    input.blur();
  });
}

describe("ColorPicker", () => {
  it("buffers arbitrary hex input and commits a normalized custom value on Enter", () => {
    const { input, change } = renderPicker();
    type(input, "#12abcd");
    expect(input.value).toBe("#12abcd");
    expect(change).not.toHaveBeenCalled();
    expect(key(input, "Enter").defaultPrevented).toBe(true);
    expect(change).toHaveBeenCalledExactlyOnceWith("#12ABCD");
    expect(input.value).toBe("#12ABCD");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Custom, #12ABCD"]',
      )?.checked,
    ).toBe(true);
    blur(input);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("commits a valid color on blur while preserving arbitrary RGB values", () => {
    const { input, change } = renderPicker();
    type(input, "#0a39f1");
    blur(input);
    expect(change).toHaveBeenCalledExactlyOnceWith("#0A39F1");
    expect(input.getAttribute("aria-invalid")).toBe("false");
  });

  it("never commits invalid input and exposes a readable inline error", () => {
    const { input, change } = renderPicker();
    for (const invalid of [
      "#GG0022",
      "#FFF",
      "orange",
      "123456",
      "#1234567",
      "",
    ]) {
      type(input, invalid);
      blur(input);
      key(input, "Enter");
      expect(change).not.toHaveBeenCalled();
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(
        document.getElementById(input.getAttribute("aria-describedby")!)
          ?.textContent,
      ).toContain("six");
      expect(
        container.querySelector<HTMLInputElement>(
          'input[aria-label="Ice, #BDC9E2"]',
        )?.checked,
      ).toBe(true);
    }
  });

  it("reverts draft text and validation errors on Escape", () => {
    const { input, change } = renderPicker("#55CCAA");
    type(input, "#wrong");
    key(input, "Enter");
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(key(input, "Escape").defaultPrevented).toBe(true);
    expect(input.value).toBe("#55CCAA");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(change).not.toHaveBeenCalled();
  });

  it("offers labelled preset radios and replaces a custom value when selected", () => {
    const { input, change } = renderPicker("#112233");
    const group = container.querySelector('[role="radiogroup"]')!;
    expect(
      document.getElementById(group.getAttribute("aria-labelledby")!)
        ?.textContent,
    ).toBe("Map color");
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(4);
    const orange = container.querySelector<HTMLInputElement>(
      'input[aria-label="Orange, #F68641"]',
    )!;
    act(() => orange.click());
    expect(change).toHaveBeenCalledExactlyOnceWith("#F68641");
    expect(orange.checked).toBe(true);
    expect(input.value).toBe("#F68641");
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(3);
  });

  it("resets a stale draft and error when the controlled value changes externally", () => {
    const change = vi.fn();
    act(() =>
      root.render(
        <ColorPicker
          label="Map color"
          value="#BDC9E2"
          onValueChange={change}
          hideLabel
        />,
      ),
    );
    const input =
      container.querySelector<HTMLInputElement>('input[type="text"]')!;
    type(input, "#bad");
    key(input, "Enter");
    act(() =>
      root.render(
        <ColorPicker
          label="Map color"
          value="#abcdef"
          onValueChange={change}
          hideLabel
        />,
      ),
    );
    expect(input.value).toBe("#ABCDEF");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Custom, #ABCDEF"]',
      )?.checked,
    ).toBe(true);
    expect(change).not.toHaveBeenCalled();
  });
});
