// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HubProvider } from "./app/HubProvider";
import { Workbench } from "./ui/liquid/Workbench";
import { ToastProvider } from "./ui";
import { useConfigStore } from "./store/configStore";
import { useDeviceSession } from "./features/device/deviceSession";
import { useMapSession } from "./features/maps/mapSession";
import { hidClient } from "./hid/hidClient";

let root: Root;
let host: HTMLDivElement;
const originalStore = useConfigStore.getState();
const originalDevice = useDeviceSession.getState();
const originalMaps = useMapSession.getState();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches:
      query.includes("prefers-reduced-motion") &&
      !query.includes("no-preference"),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal("innerWidth", 1440);
  localStorage.clear();
  document.documentElement.dataset.theme = "dark";
  useConfigStore.setState(originalStore);
  useDeviceSession.setState(originalDevice);
  useMapSession.setState(originalMaps);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
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
    await Promise.resolve();
  });
}
async function click(target: HTMLElement) {
  await act(async () => {
    target.click();
    await Promise.resolve();
  });
}
async function navigate(feature: string) {
  await click(
    host.querySelector<HTMLButtonElement>(`[data-feature="${feature}"]`)!,
  );
  await vi.waitFor(() =>
    expect(host.querySelector("h1")?.textContent).toBeTruthy(),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

describe("simplified configurator workspace", () => {
  it("starts with editable DPI and keeps advanced stage options collapsed", async () => {
    await mount();
    expect(host.querySelector("h1")?.textContent).toBe("DPI Settings");
    expect(
      host.querySelector(
        'input[aria-label="Stage 1 X DPI value"], .dpi-number-input input',
      ),
    ).not.toBeNull();
    const disclosure =
      host.querySelector<HTMLDetailsElement>(".advanced-settings");
    expect(disclosure?.open).toBe(false);
    expect(disclosure?.querySelector("summary")?.textContent).toContain(
      "Stage options",
    );
    expect(host.querySelector(".apply-bar")).not.toBeNull();
    expect(host.querySelector(".desktop-device-panel")).toBeNull();
  });

  it.each(["dark", "light"] as const)(
    "preserves %s appearance with finish controls and without hardware writes",
    async (theme) => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      const transfer = vi.spyOn(hidClient, "transfer");
      await mount();
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(document.documentElement.style.colorScheme).toBe(theme);
      expect(host.querySelector(".finish-picker")).not.toBeNull();
      expect(host.querySelector('[aria-label="Light theme"]')).toBeNull();
      expect(transfer).not.toHaveBeenCalled();
    },
  );

  it("opens the review panel on desktop and closes it when navigating to device details", async () => {
    await mount();
    await act(async () =>
      useConfigStore.setState((state) => ({
        deviceInfo: { ...state.deviceInfo, connected: true, cid: 1, mid: 4 },
      })),
    );
    await click(host.querySelector<HTMLButtonElement>(".review-button")!);
    expect(
      document.querySelector('[role="dialog"][aria-modal="true"]'),
    ).not.toBeNull();
    await click(
      document.querySelector<HTMLButtonElement>(".device-details-link")!,
    );
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).toBeNull(),
    );
    expect(host.querySelector("h1")?.textContent).toBe("Other settings");
    expect(host.inert).toBe(false);
  });

  it("keeps named map buttons and removes the duplicate rail picker", async () => {
    await mount();
    expect(host.querySelector(".navigation-map-picker")).toBeNull();
    const maps = host.querySelectorAll<HTMLButtonElement>(
      ".lg-map-rail .map-select",
    );
    expect(maps.length).toBeGreaterThan(0);
    maps.forEach((map) => {
      expect(map.getAttribute("aria-label")).toBeTruthy();
      expect(map.title).toBeTruthy();
    });
  });

  it("keeps every settings group, map library, and diagnostic tool reachable", async () => {
    await mount();
    for (const feature of [
      "performance",
      "buttons",
      // Power settings live inside Parameter Settings (clicks), as in the original driver.
      "clicks",
      "lighting",
      "maps",
      "device",
      "system",
    ]) {
      await navigate(feature);
      expect(
        host
          .querySelector(`[data-feature="${feature}"]`)
          ?.getAttribute("aria-current"),
      ).toBe("page");
    }
    expect(host.querySelector("h1")?.textContent).toBe("Settings & tools");
    expect(host.textContent).toContain("Safe mode");
    expect(host.textContent).toContain("HID console");
  });
});
