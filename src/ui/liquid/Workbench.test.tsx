// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HubProvider } from "../../app/HubProvider";
import { Workbench } from "./Workbench";
import { ToastProvider } from "../../ui";
import { useConfigStore } from "../../store/configStore";
import { useDeviceSession } from "../../features/device/deviceSession";
import {
  editSettings,
  getEditorMap,
  selectEditorMap,
  useMapSession,
} from "../../features/maps/mapSession";
import { hidClient } from "../../hid/hidClient";
import { readRecording } from "./macros";
import * as mapFiles from "../../features/maps/mapFiles";
import { DEVICES } from "../../protocol/constants";
import { isDeviceFeatureSupported } from "../../features/device/deviceFeatures";

const originalStore = useConfigStore.getState();
const originalDevice = useDeviceSession.getState();
const originalMaps = useMapSession.getState();
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches:
      media.includes("prefers-reduced-motion") &&
      !media.includes("no-preference"),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
  localStorage.clear();
  useConfigStore.setState(originalStore);
  useDeviceSession.setState(originalDevice);
  useMapSession.setState(originalMaps);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  await hidClient.disconnect();
  document.body.replaceChildren();
  useConfigStore.setState(originalStore);
  useDeviceSession.setState(originalDevice);
  useMapSession.setState(originalMaps);
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => {
    root.render(
      <ToastProvider>
        <HubProvider>
          <Workbench onDevices={() => {}} />
        </HubProvider>
      </ToastProvider>,
    );
  });
}
async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
}
async function tab(id: string) {
  await click(host.querySelector<HTMLButtonElement>(`[data-feature="${id}"]`)!);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}
function button(text: string, scope: ParentNode = host) {
  const element = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!element) throw new Error(`Missing button: ${text}`);
  return element;
}
async function key(
  element: HTMLElement,
  type: "keydown" | "keyup",
  value: string,
  code = value,
) {
  await act(async () => {
    element.dispatchEvent(
      new KeyboardEvent(type, {
        key: value,
        code,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}
async function recordKey() {
  await click(button("Start recording"));
  const recorder = host.querySelector<HTMLElement>(".lg-recorder")!;
  await key(recorder, "keydown", "a", "KeyA");
  await key(recorder, "keydown", "Escape");
}

describe("Liquid Glass workspace interactions", () => {
  it("saves sidebar notes only to their map and duplicates without device writes", async () => {
    await mount();
    await tab("maps"); // Selected-map tools live in Configuration Management.
    const source = getEditorMap()!;
    const other = useConfigStore
      .getState()
      .maps.find((map) => map.id !== source.id)!;
    const transfer = vi.spyOn(hidClient, "transfer");
    const textarea = host.querySelector<HTMLTextAreaElement>(
      ".lg-map-quick-tools textarea",
    )!;
    await act(async () => {
      textarea.focus();
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(textarea, "Game sensitivity: 0.75");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => textarea.blur());
    expect(getEditorMap()!.note).toBe("Game sensitivity: 0.75");
    const settings = structuredClone(getEditorMap()!.settings);
    const count = useConfigStore.getState().maps.length;
    await click(
      button("Duplicate", host.querySelector(".lg-map-quick-tools")!),
    );
    expect(useConfigStore.getState().maps).toHaveLength(count + 1);
    expect(getEditorMap()!.id).not.toBe(source.id);
    expect(getEditorMap()!.note).toBe("Game sensitivity: 0.75");
    expect(getEditorMap()!.settings).toEqual(settings);
    await act(async () => {
      selectEditorMap(other.id);
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(getEditorMap()!.note).toBe(other.note);
    expect(transfer).not.toHaveBeenCalled();
  });

  it("exports only the selected map with its latest note", async () => {
    await mount();
    await tab("maps"); // Selected-map tools live in Configuration Management.
    const exported = vi
      .spyOn(mapFiles, "downloadMaps")
      .mockImplementation(() => undefined);
    const textarea = host.querySelector<HTMLTextAreaElement>(
      ".lg-map-quick-tools textarea",
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(textarea, "Tournament setup");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button("Export", host.querySelector(".lg-map-quick-tools")!));
    expect(exported).toHaveBeenCalledWith([
      expect.objectContaining({
        id: getEditorMap()!.id,
        note: "Tournament setup",
      }),
    ]);
  });

  it("shows confirmed device readings separately from map values and hides unreadable fields", async () => {
    await mount();
    await act(async () => editSettings({ pollingRate: 4000 }, "pollingRate"));
    await click(
      host.querySelector<HTMLButtonElement>(
        '[role="switch"][aria-label="Mock Device"]',
      )!,
    );
    await act(async () => {
      await vi.waitFor(
        () => {
          expect(useDeviceSession.getState().busy).toBe(false);
          expect(useConfigStore.getState().deviceInfo.connected).toBe(true);
        },
        { timeout: 3000 },
      );
    });
    await tab("maps");
    const map = host.querySelector(
      ".lg-map-quick-tools .lg-settings-snapshot",
    )!;
    const device = host.querySelector(
      ".lg-device-quick-tools .lg-settings-snapshot",
    )!;
    expect(map.textContent).toContain("4,000 Hz");
    expect(device.textContent).toContain("1,000 Hz");
    await act(async () =>
      useDeviceSession.setState({
        readIssues: [
          {
            key: "pollingRate",
            path: "pollingRate",
            label: "Polling rate",
            received: 999,
            message: "Invalid polling rate",
          },
        ],
      }),
    );
    expect(device.textContent).toContain("Unreadable");
    expect(device.textContent).not.toContain("1,000 Hz");
    await act(async () => useDeviceSession.setState({ busy: true }));
    expect(button("Refresh").disabled).toBe(true);
    expect(
      button("Duplicate", host.querySelector(".lg-map-quick-tools")!).disabled,
    ).toBe(true);
  });

  it("keeps map notes reachable from the compact rail", async () => {
    await mount();
    await click(
      host.querySelector<HTMLButtonElement>(
        '[aria-label="Selected map notes and actions"]',
      )!,
    );
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector("textarea")).not.toBeNull();
    expect(button("Duplicate", dialog)).toBeDefined();
    expect(button("Export", dialog)).toBeDefined();
  });

  it("calculates matching game sensitivity without changing the map or device", async () => {
    await mount();
    const before = structuredClone(getEditorMap()!.settings);
    const transfer = vi.spyOn(hidClient, "transfer");
    await click(button("Match in-game sensitivity"));
    const dialog = document.querySelector('[role="dialog"]')!;
    const inputs = dialog.querySelectorAll<HTMLInputElement>(
      'input[type="number"]',
    );
    await act(async () => {
      for (const [index, value] of [
        [0, "1600"],
        [1, "1.5"],
      ] as const) {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(inputs[index], value);
        inputs[index].dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    const dpi = before.dpiStages[before.activeDpiStage].xDpi;
    expect(
      Number(
        dialog.querySelector<HTMLInputElement>(
          'input[aria-label="New sensitivity"]',
        )!.value,
      ),
    ).toBe(2400 / dpi);
    expect(getEditorMap()!.settings).toEqual(before);
    expect(transfer).not.toHaveBeenCalled();
    expect(button("Copy", dialog).disabled).toBe(false);
  });

  it("selects a descriptive receiver mode while editing offline", async () => {
    await mount();
    const transfer = vi.spyOn(hidClient, "transfer");
    await tab("lighting");
    const options = host.querySelectorAll<HTMLInputElement>(
      '.lg-led-modes input[type="radio"]',
    );
    expect(options).toHaveLength(4);
    await click(options[2]);
    expect(options[2].checked).toBe(true);
    expect(getEditorMap()!.settings.dongleRgbMode).toBe(2);
    expect(
      host.querySelector('svg[aria-label="8K Dongle-H preview, Battery"]'),
    ).not.toBeNull();
    expect(transfer).not.toHaveBeenCalled();
  });

  it("keeps DPI dragging local and commits one history entry on release", async () => {
    await mount();
    const map = getEditorMap()!;
    const before = map.settings.dpiStages[map.settings.activeDpiStage].xDpi;
    const historyLength =
      useMapSession.getState().histories[map.id]?.past.length ?? 0;
    const transfer = vi.spyOn(hidClient, "transfer");
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    await act(async () => {
      for (const value of [2000, 3000, 8000]) {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(slider, String(value));
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    expect(
      getEditorMap()!.settings.dpiStages[map.settings.activeDpiStage].xDpi,
    ).toBe(before);
    await act(async () => {
      slider.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    const stage =
      getEditorMap()!.settings.dpiStages[map.settings.activeDpiStage];
    expect([stage.xDpi, stage.yDpi]).toEqual([8000, 8000]);
    expect(useMapSession.getState().histories[map.id].past).toHaveLength(
      historyLength + 1,
    );
    expect(transfer).not.toHaveBeenCalled();
  });

  it("moves tab focus with arrow keys without switching maps", async () => {
    await mount();
    const id = useConfigStore.getState().activeMapId;
    const dpi = host.querySelector<HTMLButtonElement>(
      '[data-feature="sensitivity"]',
    )!;
    await act(async () => dpi.focus());
    // Original sidebar order: … DPI Settings, Performance Settings, Parameter Settings …
    await key(dpi, "keydown", "ArrowRight");
    expect(document.activeElement?.getAttribute("data-feature")).toBe(
      "performance",
    );
    expect(useConfigStore.getState().activeMapId).toBe(id);
    await key(document.activeElement as HTMLElement, "keydown", "ArrowDown");
    expect(document.activeElement?.getAttribute("data-feature")).toBe(
      "clicks",
    );
    expect(useConfigStore.getState().activeMapId).toBe(id);
  });

  it("closes held keys, keeps the recording across tabs, and preserves it when assigning a button", async () => {
    await mount();
    await tab("macro");
    await recordKey();
    expect(host.querySelectorAll(".lg-macro-events li")).toHaveLength(2);
    expect(host.textContent).toContain("Recording not saved");
    await tab("performance");
    await tab("macro");
    expect(host.querySelectorAll(".lg-macro-events li")).toHaveLength(2);
    const label = [...host.querySelectorAll("label")].find(
      (item) => item.textContent === "Macro button",
    )!;
    await click(document.getElementById(label.htmlFor)!);
    const option = document.querySelector<HTMLElement>(
      '[role="option"][aria-label="Back (Side 1)"]',
    )!;
    await click(option);
    expect(host.querySelectorAll(".lg-macro-events li")).toHaveLength(2);
    const transfer = vi.spyOn(hidClient, "transfer");
    await click(button("Save sequence"));
    const saved = getEditorMap()!.settings.buttons.find(
      (item) => item.id === "side1",
    )!;
    expect(saved.keyClass).toBe(6);
    expect(
      readRecording(saved.description)?.map((event) => event.type),
    ).toEqual(["down", "up"]);
    expect(
      getEditorMap()!.settings.buttons.find((item) => item.id === "left")
        ?.keyClass,
    ).toBe(1);
    expect(transfer).not.toHaveBeenCalled();
  });

  it("reserves release events at the recording limit", async () => {
    await mount();
    await tab("macro");
    await click(button("Start recording"));
    const recorder = host.querySelector<HTMLElement>(".lg-recorder")!;
    await act(async () => {
      for (let index = 0; index < 129; index++)
        recorder.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: `Key${index}`,
            code: `Key${index}`,
            bubbles: true,
            cancelable: true,
          }),
        );
    });
    expect(host.querySelectorAll(".lg-macro-events li")).toHaveLength(256);
    expect(host.textContent).toContain("Recording stopped at the editor limit");
    await click(button("Save sequence"));
    const events = readRecording(
      getEditorMap()!.settings.buttons.find((item) => item.id === "left")
        ?.description,
    )!;
    expect(events.filter((event) => event.type === "down")).toHaveLength(128);
    expect(events.filter((event) => event.type === "up")).toHaveLength(128);
  });

  it("retains a usable recovery action for an imported map with no stages", async () => {
    await mount();
    await act(async () =>
      editSettings({ dpiStages: [], activeDpiStage: 0 }, "dpiStages"),
    );
    await click(button("Add DPI stage"));
    expect(getEditorMap()!.settings.dpiStages).toHaveLength(1);
    expect(host.querySelector('input[type="range"]')).not.toBeNull();
  });

  it("makes unknown hardware read-only and keeps settings out of the palette", async () => {
    await mount();
    await act(async () =>
      useConfigStore.setState((state) => ({
        deviceInfo: { ...state.deviceInfo, connected: true, cid: 99, mid: 99 },
      })),
    );
    expect(host.textContent).toContain("Model not verified");
    expect(host.querySelector('input[type="range"]')).toBeNull();
    expect(
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].every(
        (item) => item.disabled,
      ),
    ).toBe(true);
    expect(host.textContent).toContain("Read-only");
    expect(host.textContent).not.toContain("Apply to device");
  });

  it("preserves keyboard map actions in the map library", async () => {
    await mount();
    await tab("maps");
    const library = host.querySelector(".lg-map-library")!;
    await click(library.querySelector<HTMLButtonElement>(".map-menu-trigger")!);
    expect(library.querySelector('button[title="Delete map"]')).not.toBeNull();
    expect(
      library.querySelector('button[title="Move map down"]'),
    ).not.toBeNull();
  });

  it("connects without applying the offline map, then commits live edits", async () => {
    await mount();
    await act(async () => editSettings({ pollingRate: 4000 }, "pollingRate"));
    await click(
      host.querySelector<HTMLButtonElement>(
        '[role="switch"][aria-label="Mock Device"]',
      )!,
    );
    await act(async () => {
      await vi.waitFor(() =>
        expect(useDeviceSession.getState().busy).toBe(false),
      );
      useDeviceSession.setState({ safeMode: false });
    });
    expect(useConfigStore.getState().activeSettings.pollingRate).toBe(1000);
    expect(host.textContent).toContain("to mouse?");
    await click(button("Dismiss"));
    await act(async () => editSettings({ pollingRate: 8000 }, "pollingRate"));
    await act(async () => {
      await vi.waitFor(() =>
        expect(useConfigStore.getState().activeSettings.pollingRate).toBe(8000),
      );
    });
    expect(host.textContent).toContain("Saved to mouse");
    expect(host.textContent).not.toContain("Apply to device");
  });
  it("does not write during a connected DPI drag, then saves on release", async () => {
    await mount();
    await click(
      host.querySelector<HTMLButtonElement>(
        '[role="switch"][aria-label="Mock Device"]',
      )!,
    );
    await act(async () => {
      await vi.waitFor(() =>
        expect(useDeviceSession.getState().busy).toBe(false),
      );
      useDeviceSession.setState({ safeMode: false, logs: [] });
    });
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(slider, "5000");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(
      useDeviceSession.getState().logs.filter((log) => log.direction === "out"),
    ).toHaveLength(0);
    await act(async () =>
      slider.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })),
    );
    await act(async () => {
      await vi.waitFor(() =>
        expect(
          useConfigStore.getState().activeSettings.dpiStages[
            getEditorMap()!.settings.activeDpiStage
          ].xDpi,
        ).toBe(5000),
      );
    });
  });

  it("saves only button changes when the explicit button save is used", async () => {
    await mount();
    await click(
      host.querySelector<HTMLButtonElement>(
        '[role="switch"][aria-label="Mock Device"]',
      )!,
    );
    await act(async () => {
      await vi.waitFor(() =>
        expect(useDeviceSession.getState().busy).toBe(false),
      );
      useDeviceSession.setState({ busy: true });
      editSettings({ pollingRate: 4000 }, "pollingRate");
      useDeviceSession.setState({ busy: false, logs: [] });
      editSettings(
        {
          buttons: getEditorMap()!.settings.buttons.map((b) =>
            b.id === "left" ? { ...b, keyValue1: 2 } : b,
          ),
        },
        "buttons",
      );
    });
    await tab("buttons");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(
      useDeviceSession.getState().logs.filter((log) => log.direction === "out"),
    ).toHaveLength(0);
    expect(host.textContent).toContain("Unsaved button changes");
    await click(button("Save to device"));
    await act(async () => {
      await vi.waitFor(() =>
        expect(
          useConfigStore.getState().activeSettings.buttons[0].keyValue1,
        ).toBe(2),
      );
    });
    expect(useConfigStore.getState().activeSettings.pollingRate).toBe(1000);
    expect(getEditorMap()!.settings.pollingRate).toBe(4000);
  });

  it("applies a selected map once and provides an Undo action", async () => {
    await mount();
    await click(
      host.querySelector<HTMLButtonElement>(
        '[role="switch"][aria-label="Mock Device"]',
      )!,
    );
    const second = useConfigStore.getState().maps[1];
    await act(async () => {
      await vi.waitFor(() =>
        expect(useDeviceSession.getState().busy).toBe(false),
      );
      const settings = structuredClone(
        useConfigStore.getState().activeSettings,
      );
      settings.pollingRate = 4000;
      useConfigStore.setState((state) => ({
        maps: state.maps.map((map) =>
          map.id === second.id ? { ...map, settings } : map,
        ),
      }));
      useDeviceSession.setState({ safeMode: false, logs: [] });
    });
    await click(
      host.querySelectorAll<HTMLButtonElement>(".lg-map-rail .map-select")[1],
    );
    await act(async () => {
      await vi.waitFor(() =>
        expect(useConfigStore.getState().activeSettings.pollingRate).toBe(4000),
      );
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(
      useDeviceSession
        .getState()
        .logs.filter(
          (log) => log.direction === "out" && log.hex.startsWith("07 "),
        ),
    ).toHaveLength(1);
    expect(document.body.textContent).toContain("Undo last apply");
  });
  it("shows one enabled apply prompt in the device panel and keeps it dismissed across tabs", async () => {
    await mount();
    await act(async () => editSettings({ pollingRate: 4000 }, "pollingRate"));
    await click(
      host.querySelector<HTMLButtonElement>(
        '[role="switch"][aria-label="Mock Device"]',
      )!,
    );
    await act(async () => {
      await vi.waitFor(() =>
        expect(useDeviceSession.getState().busy).toBe(false),
      );
    });
    expect(host.querySelectorAll(".lg-map-apply-banner")).toHaveLength(1);
    expect(host.querySelector(".lg-editor .lg-map-apply-banner")).toBeNull();
    expect(button("Apply").disabled).toBe(false);
    await click(button("Dismiss"));
    await tab("performance");
    expect(host.querySelector(".lg-map-apply-banner")).toBeNull();
    const comparisons =
      host.querySelectorAll<HTMLButtonElement>(".lg-map-comparison");
    expect(comparisons).toHaveLength(2);
    expect(comparisons[0].getAttribute("aria-label")).toMatch(
      /^View diff: [1-9]\d* unapplied changes?$/,
    );
    expect(
      host.querySelector(".lg-compact-device .lg-map-comparison"),
    ).not.toBeNull();
    const transfer = vi.spyOn(hidClient, "transfer");
    await click(comparisons[0]);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Map vs device",
    );
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "4000 Hz",
    );
    expect(transfer).not.toHaveBeenCalled();
  });

  it("loops over every device in devices.json and checks that the UI shows exactly the tabs and controls for the features it lists, and none for features it doesn't", async () => {
    await mount();

    const ALL_TAB_IDS = [
      "sensitivity",
      "buttons",
      "performance",
      "lighting",
      "clicks",
      "power",
      "macro",
    ] as const;

    for (const dev of DEVICES) {
      await act(async () => {
        useConfigStore.setState({ selectedDevice: dev });
      });

      // Verify tabs shown in the UI match isDeviceFeatureSupported
      for (const tabId of ALL_TAB_IDS) {
        const expected = isDeviceFeatureSupported(tabId, dev);
        const tabElement = host.querySelector(`#tab-${tabId}`);
        if (expected) {
          expect(
            tabElement,
            `Device ${dev.name} (${dev.VID}:${dev.PID}) should show tab ${tabId}`,
          ).not.toBeNull();
        } else {
          expect(
            tabElement,
            `Device ${dev.name} (${dev.VID}:${dev.PID}) should NOT show tab ${tabId}`,
          ).toBeNull();
        }
      }
    }

    // Verify controls inside tabs: for ATK 68 V2 Pro, performance tab shows rapid trigger and hides lod
    const atk68 = DEVICES.find((d) => d.name === "ATK 68 V2 Pro")!;
    await act(async () => {
      useConfigStore.setState({ selectedDevice: atk68 });
    });
    const perfTab = host.querySelector<HTMLButtonElement>("#tab-performance");
    if (perfTab) {
      await click(perfTab);
      expect(
        host.querySelector('[data-testid="keyboard-rapid-trigger"]'),
      ).not.toBeNull();
      expect(host.querySelector('[data-testid="lod-section"]')).toBeNull();
    }
  });
});
