// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Select, type SelectOption, type SelectProps } from "./Select";

const options: readonly SelectOption<number>[] = [
  { value: 10, label: "Alpha", description: "Everyday settings" },
  {
    value: 20,
    label: "Beta",
    disabled: true,
    disabledReason: "Connect a dongle first",
  },
  { value: 30, label: "Bravo" },
  { value: 40, label: "Charlie" },
  { value: 50, label: "Delta", disabled: true },
  { value: 60, label: "Bravo plus" },
];

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
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderSelect(props: Partial<SelectProps<number>> = {}) {
  const change = vi.fn();
  function Field() {
    const [value, setValue] = useState(10);
    return (
      <>
        <Select
          label="Polling rate"
          value={value}
          options={options}
          onValueChange={(next) => {
            change(next);
            setValue(next);
          }}
          {...props}
        />
        <button type="button" data-outside>
          Next field
        </button>
      </>
    );
  }
  act(() => root.render(<Field />));
  return {
    button: container.querySelector<HTMLButtonElement>('[role="combobox"]')!,
    change,
  };
}

function key(
  button: HTMLElement,
  value: string,
  extra: KeyboardEventInit = {},
) {
  const event = new KeyboardEvent("keydown", {
    key: value,
    bubbles: true,
    cancelable: true,
    ...extra,
  });
  act(() => {
    button.dispatchEvent(event);
  });
  return event;
}

function click(element: HTMLElement) {
  act(() => element.click());
}
function active(button: HTMLElement) {
  return document.getElementById(
    button.getAttribute("aria-activedescendant") ?? "",
  );
}
function item(label: string) {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[role="option"]'),
  ).find((option) => option.getAttribute("aria-label") === label)!;
}

describe("Select", () => {
  it("opens a labelled portal menu with descriptions and a selected option", () => {
    const { button } = renderSelect({
      description: "Change how often reports are sent.",
    });
    act(() => button.focus());
    click(button);
    const list = document.querySelector('[role="listbox"]')!;
    expect(container.contains(list)).toBe(false);
    expect(button.getAttribute("aria-controls")).toBe(list.id);
    expect(
      document.getElementById(list.getAttribute("aria-labelledby")!)
        ?.textContent,
    ).toBe("Polling rate");
    expect(item("Alpha").getAttribute("aria-selected")).toBe("true");
    expect(item("Alpha").textContent).toContain("Everyday settings");
    expect(button.textContent).not.toContain("Everyday settings");
    expect(
      document.getElementById(button.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toContain("Change how often");
    expect(document.activeElement).toBe(button);
  });

  it("navigates enabled options without changing the value until committed", () => {
    const { button, change } = renderSelect();
    act(() => button.focus());
    key(button, "ArrowDown");
    expect(active(button)?.getAttribute("aria-label")).toBe("Alpha");
    key(button, "ArrowDown");
    expect(active(button)?.getAttribute("aria-label")).toBe("Bravo");
    expect(change).not.toHaveBeenCalled();
    key(button, "Enter");
    expect(change).toHaveBeenCalledWith(30);
    expect(button.textContent).toContain("Bravo");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("supports Home, End, wrapping arrows, and Space selection", () => {
    const { button, change } = renderSelect();
    key(button, "End");
    expect(active(button)?.getAttribute("aria-label")).toBe("Bravo plus");
    key(button, "ArrowDown");
    expect(active(button)?.getAttribute("aria-label")).toBe("Alpha");
    key(button, "ArrowUp");
    expect(active(button)?.getAttribute("aria-label")).toBe("Bravo plus");
    key(button, "Home");
    key(button, "ArrowDown");
    key(button, " ");
    expect(change).toHaveBeenCalledExactlyOnceWith(30);
  });

  it("supports buffered typeahead and repeated-letter cycling while skipping disabled options", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    const { button, change } = renderSelect();
    key(button, "b");
    expect(active(button)?.getAttribute("aria-label")).toBe("Bravo");
    key(button, "r");
    expect(active(button)?.getAttribute("aria-label")).toBe("Bravo");
    clock.mockReturnValue(2000);
    key(button, "b");
    expect(active(button)?.getAttribute("aria-label")).toBe("Bravo plus");
    key(button, "b");
    expect(active(button)?.getAttribute("aria-label")).toBe("Bravo");
    key(button, "Enter");
    expect(change).toHaveBeenCalledExactlyOnceWith(30);
  });

  it("shows disabled reasons and refuses disabled pointer selection", () => {
    const { button, change } = renderSelect();
    act(() => button.focus());
    click(button);
    const unavailable = item("Beta");
    expect(unavailable.getAttribute("aria-disabled")).toBe("true");
    expect(
      document.getElementById(unavailable.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toBe("Connect a dongle first");
    click(unavailable);
    expect(change).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const available = item("Charlie");
    const press = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      available.dispatchEvent(press);
    });
    expect(press.defaultPrevented).toBe(true);
    click(available);
    expect(change).toHaveBeenCalledExactlyOnceWith(40);
    expect(document.activeElement).toBe(button);
  });

  it("dismisses on outside interaction without stealing focus", () => {
    const { button } = renderSelect();
    click(button);
    const outside =
      container.querySelector<HTMLButtonElement>("[data-outside]")!;
    act(() => {
      outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      outside.focus();
    });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(outside);
    act(() => button.focus());
    click(button);
    act(() => outside.focus());
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("consumes Escape before a containing modal can close", () => {
    const parentEscape = vi.fn();
    document.addEventListener("keydown", parentEscape, true);
    try {
      const { button, change } = renderSelect();
      click(button);
      key(button, "ArrowDown");
      const event = key(button, "Escape");
      expect(event.defaultPrevented).toBe(true);
      expect(parentEscape).toHaveBeenCalledTimes(1);
      expect(change).not.toHaveBeenCalled();
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(button);
    } finally {
      document.removeEventListener("keydown", parentEscape, true);
    }
  });

  it("closes on Tab without cancelling normal focus movement", () => {
    const { button, change } = renderSelect();
    click(button);
    key(button, "End");
    const event = key(button, "Tab", { shiftKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(change).not.toHaveBeenCalled();
  });

  it("handles an empty list and disabled controls", () => {
    const { button } = renderSelect({ options: [] });
    click(button);
    key(button, "ArrowDown");
    expect(button.hasAttribute("aria-activedescendant")).toBe(false);
    expect(document.querySelector('[role="listbox"]')?.textContent).toBe(
      "No options available",
    );
    act(() =>
      root.render(
        <Select
          label="Polling rate"
          value={10}
          options={options}
          disabled
          disabledReason="Connect your mouse"
          onValueChange={vi.fn()}
        />,
      ),
    );
    const disabledButton =
      container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    click(disabledButton);
    expect(disabledButton.disabled).toBe(true);
    expect(disabledButton.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(
      document.getElementById(disabledButton.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toBe("Connect your mouse");
  });

  it("flips above a low trigger and keeps the menu inside the viewport", () => {
    const { button } = renderSelect();
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      x: 990,
      y: 700,
      left: 990,
      right: 1230,
      top: 700,
      bottom: 746,
      width: 240,
      height: 46,
      toJSON: () => ({}),
    });
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1024);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(768);
    click(button);
    const menu = document.querySelector<HTMLElement>(".hub-select-popover")!;
    expect(menu.dataset.side).toBe("top");
    expect(
      parseFloat(menu.style.left) + parseFloat(menu.style.width),
    ).toBeLessThanOrEqual(1016);
    expect(parseFloat(menu.style.top)).toBeGreaterThanOrEqual(8);
    expect(parseFloat(menu.style.top)).toBeLessThan(700);
  });

  it("uses the top layer inside a dialog when Popover is supported", () => {
    const show = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "showPopover", {
      configurable: true,
      value: show,
    });
    try {
      act(() =>
        root.render(
          <div data-hub-modal-root>
            <div role="dialog" aria-modal="true">
              <Select
                label="Map"
                value={10}
                options={options}
                onValueChange={vi.fn()}
              />
            </div>
          </div>,
        ),
      );
      const button =
        container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
      click(button);
      const menu = document.querySelector<HTMLElement>(".hub-select-popover")!;
      expect(menu.parentElement?.getAttribute("role")).toBe("dialog");
      expect(menu.getAttribute("popover")).toBe("manual");
      expect(show).toHaveBeenCalled();
      key(button, "Escape");
      expect(document.activeElement).toBe(button);
    } finally {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)
        .showPopover;
    }
  });
});
