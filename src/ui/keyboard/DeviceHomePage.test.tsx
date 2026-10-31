// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DeviceHomePage,
  getRememberedDevices,
  saveRememberedDevices,
} from "./DeviceSelector";
import { DEVICE_REGISTRY } from "../../devices/registry";
import { resolveDeviceImage } from "../../devices/presentation";
import { hidClient } from "../../hid/hidClient";
import { useConfigStore } from "../../store/configStore";
import { MotionGlobalConfig } from "framer-motion";

let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  MotionGlobalConfig.skipAnimations = false;
});

describe("saved device cards", () => {
  it("rejects malformed remembered lists", () => {
    localStorage.setItem(
      "atk-hub-remembered-devices-list",
      JSON.stringify({ deviceId: "broken" }),
    );
    expect(getRememberedDevices()).toEqual([]);
    localStorage.setItem(
      "atk-hub-remembered-devices-list",
      JSON.stringify([{ deviceId: "test", color: -1 }]),
    );
    expect(getRememberedDevices()).toEqual([]);
  });
  it("changes a saved keyboard's photo and reopens its mock without hardware", async () => {
    const device = DEVICE_REGISTRY.find((d) => d.id === "atk-68-v2-pro")!,
      onSelect = vi.fn().mockResolvedValue(undefined);
    saveRememberedDevices([{ deviceId: device.id!, color: 0, mock: true }]);
    await act(async () => {
      root.render(<DeviceHomePage onSelect={onSelect} />);
    });
    const card = host.querySelector<HTMLElement>('[data-kind="keyboard"]')!;
    expect(card).not.toBeNull();
    const image = () => card.querySelector("img")?.getAttribute("src");
    expect(image()).toBe(resolveDeviceImage(device, 0));
    const color = card.querySelectorAll<HTMLButtonElement>(
      ".keyboard-finishes button",
    )[1];
    await act(async () => color.click());
    expect(image()).toBe(resolveDeviceImage(device, 1));
    expect(getRememberedDevices()[0].color).toBe(1);
    expect(onSelect).not.toHaveBeenCalled();
    const open = card.querySelector<HTMLButtonElement>(".device-card-open")!;
    await act(async () => open.click());
    expect(onSelect).toHaveBeenCalledWith(device, 1, true);
  });
  it("paginates identical models without replacing or forgetting another saved instance", async () => {
    const device = DEVICE_REGISTRY.find((d) => d.id === "atk-68-v2-pro")!;
    saveRememberedDevices(
      Array.from({ length: 5 }, (_, i) => ({
        deviceId: device.id!,
        color: i % 3,
        mock: true,
        instanceId: `instance-${i}`,
      })),
    );
    await act(async () => root.render(<DeviceHomePage onSelect={vi.fn()} />));
    expect(host.querySelectorAll(".device-home-connected")).toHaveLength(3);
    expect(getRememberedDevices()).toHaveLength(5);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!
        .click(),
    );
    await vi.waitFor(() =>
      expect(host.querySelectorAll(".device-home-connected")).toHaveLength(2),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label^="Forget"]')!
        .click(),
    );
    expect(getRememberedDevices()).toHaveLength(5);
    await act(async () =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[role="dialog"] button',
        ),
      ]
        .find((button) => button.textContent === "Forget device")!
        .click(),
    );
    expect(getRememberedDevices().map((item) => item.instanceId)).toEqual([
      "instance-0",
      "instance-1",
      "instance-2",
      "instance-4",
    ]);
    expect(getRememberedDevices()).toHaveLength(4);
  });
  it("adds a fourth copy without replacing any of the three saved devices", async () => {
    const device = DEVICE_REGISTRY.find((d) => d.id === "atk-68-v2-pro")!;
    saveRememberedDevices(
      Array.from({ length: 3 }, (_, i) => ({
        deviceId: device.id!,
        color: 0,
        mock: true,
        instanceId: `saved-${i}`,
      })),
    );
    await act(async () =>
      root.render(
        <DeviceHomePage onSelect={vi.fn().mockResolvedValue(undefined)} />,
      ),
    );
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Mock device")!
        .click(),
    );
    await act(async () => { await vi.dynamicImportSettled(); });
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    await act(async () =>
      [...dialog.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Mock device")!
        .click(),
    );
    const saved = getRememberedDevices();
    expect(saved).toHaveLength(4);
    expect(saved.slice(1).map((row) => row.instanceId)).toEqual([
      "saved-0",
      "saved-1",
      "saved-2",
    ]);
    expect(host.querySelectorAll(".device-home-connected")).toHaveLength(3);
    expect(host.querySelector('button[aria-label="Next page"]')).not.toBeNull();
  });
  it("shows the identified mouse model rather than its receiver's HID name", async () => {
    const endpoint = DEVICE_REGISTRY.find((d) => Number(d.PID) === 0x11d8)!;
    const hid = {
      vendorId: 0x373b,
      productId: 0x11d8,
      collections: [{ usagePage: 0xff04, usage: 2 }],
    };
    vi.stubGlobal("navigator", {
      hid: {
        requestDevice: vi.fn().mockResolvedValue([hid]),
        getDevices: vi.fn().mockResolvedValue([]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    const original = useConfigStore.getState().deviceInfo;
    vi.spyOn(hidClient, "connectHardware").mockResolvedValue({
      ...original,
      connected: true,
      isMock: false,
      vendorId: 0x373b,
      productId: 0x11d8,
      cid: 1,
      mid: 4,
      name: "ATK ZERO EX",
    });
    await act(async () => root.render(<DeviceHomePage onSelect={vi.fn()} />));
    const connect = [...host.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Connect device",
    )!;
    await act(async () => connect.click());
    expect(hidClient.connectHardware).toHaveBeenCalledWith(hid);
    const card = host.querySelector(".device-home-connected")!;
    expect(card.querySelector("strong")?.textContent).toBe("ATK ZERO EX");
    expect(card.querySelector("img")).not.toBeNull();
    expect(getRememberedDevices()[0].deviceId).toBe(endpoint.id);
    expect(getRememberedDevices()[0].displayName).toBe("ATK ZERO EX");
    useConfigStore.setState({ deviceInfo: original });
  });
  it("clamps stale color indexes and forgets a saved card", async () => {
    const device = DEVICE_REGISTRY.find((d) => d.id === "atk-68-v2-pro")!;
    saveRememberedDevices([{ deviceId: device.id!, color: 10000 }]);
    await act(async () => {
      root.render(<DeviceHomePage onSelect={vi.fn()} />);
    });
    expect(
      host.querySelector('.keyboard-finishes [aria-pressed="true"]'),
    ).not.toBeNull();
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label^="Forget"]')!
        .click(),
    );
    expect(getRememberedDevices()).toHaveLength(1);
    await act(async () =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[role="dialog"] button',
        ),
      ]
        .find((button) => button.textContent === "Cancel")!
        .click(),
    );
    expect(getRememberedDevices()).toHaveLength(1);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label^="Forget"]')!
        .click(),
    );
    await act(async () =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[role="dialog"] button',
        ),
      ]
        .find((button) => button.textContent === "Forget device")!
        .click(),
    );
    expect(getRememberedDevices()).toEqual([]);
    expect(host.querySelector(".device-home-connected")).toBeNull();
  });
});
