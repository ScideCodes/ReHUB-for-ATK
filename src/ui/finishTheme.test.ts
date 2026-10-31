// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyColorwayHex, paletteFromHex } from "./colorPalette";
import { DEVICE_REGISTRY } from "../devices/registry";
import { hidClient } from "../hid/hidClient";
import { useDeviceSession } from "../features/device/deviceSession";
import {
  FINISH_PALETTES,
  FINISH_STORAGE_KEY,
  MOUSE_FINISHES,
  isMouseFinish,
  readStoredFinish,
  setMouseFinish,
  useFinishTheme,
} from "./finishTheme";

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("finish accents", () => {
  for (const finish of MOUSE_FINISHES) {
    for (const theme of ["dark", "light"] as const) {
      it(`${finish.label} in ${theme} mode meets text and control contrast`, () => {
        const palette = FINISH_PALETTES[finish.value][theme];
        expect(
          contrast(palette.onAccent, palette.accent),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(palette.onAccent, palette.ember),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(finish.swatchInk, finish.swatch),
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("applies complete runtime palettes for every registry colorway", () => {
    const required = [
      "--hub-accent",
      "--hub-ember",
      "--hub-burnt",
      "--hub-accent-ink",
      "--hub-on-accent",
      "--hub-focus",
      "--accent-soft",
      "--selection-bg",
      "--ambient-light",
      "--apply-btn-start",
      "--apply-btn-end",
      "--apply-btn-hover-start",
      "--apply-btn-hover-end",
      "--apply-btn-ink",
      "--apply-btn-glow",
      "--apply-btn-glow-hover",
      "--apply-btn-disabled",
      "--lg-ambient-one",
      "--lg-ambient-two",
      "--lg-ambient-three",
      "--lg-ambient-four",
      "--lg-ambient-five",
      "--glass-bg",
      "--glass-sheet",
      "--glass-panel",
      "--glass-fallback",
      "--glass-border",
      "--glass-border-top",
      "--glass-border-bottom",
      "--glass-highlight",
      "--glass-tab-bg",
      "--shadow-color",
      "--mask-opaque",
      "--lg-success",
      "--lg-warning",
      "--lg-error",
    ];
    for (const hex of new Set(
      DEVICE_REGISTRY.flatMap((d) => d.colorways?.map((c) => c.hex) ?? []),
    )) {
      for (const theme of ["light", "dark"] as const) {
        const palette = paletteFromHex(hex, theme);
        required.forEach((token) =>
          expect(palette[token], `${hex} ${theme} ${token}`).toBeTruthy(),
        );
        expect(
          contrast(palette["--hub-accent"], palette["--hub-on-accent"]),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(
            palette["--apply-btn-hover-start"],
            palette["--apply-btn-ink"],
          ),
        ).toBeGreaterThanOrEqual(4.5);
        for (const token of ["--lg-success", "--lg-warning", "--lg-error"]) {
          for (const background of [
            "--hub-bg",
            "--hub-elevated",
            "--hub-surface",
          ]) {
            expect(
              contrast(palette[token], palette[background]),
              `${hex} ${theme} ${token}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
        document.documentElement.dataset.theme = theme;
        applyColorwayHex(hex);
        required.forEach((token) =>
          expect(document.documentElement.style.getPropertyValue(token)).toBe(
            palette[token],
          ),
        );
      }
    }
    expect(() => paletteFromHex("red", "dark")).toThrow();
    expect(MOUSE_FINISHES[0].swatch).toBe("#BDC9E2");
  });
});

describe("finish preference", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.localStorage.clear();
    delete document.documentElement.dataset.finish;
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = undefined;
    host = undefined;
    useDeviceSession.setState({ skin: "ice" });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mountTheme() {
    function Probe() {
      const { finish } = useFinishTheme();
      return createElement("span", { "data-finish-value": finish }, finish);
    }
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(createElement(Probe)));
  }

  it("restores only the three supported finishes and safely handles unavailable storage", () => {
    for (const finish of MOUSE_FINISHES) {
      const getItem = vi.fn(() => finish.value);
      expect(readStoredFinish({ getItem })).toBe(finish.value);
      expect(getItem).toHaveBeenCalledWith(FINISH_STORAGE_KEY);
    }
    for (const value of [null, "", "blue", '"orange"', '{"skin":"black"}'])
      expect(readStoredFinish({ getItem: () => value })).toBe("ice");
    expect(readStoredFinish(undefined)).toBe("ice");
    expect(
      readStoredFinish({
        getItem: () => {
          throw new Error("Storage disabled");
        },
      }),
    ).toBe("ice");
    expect(isMouseFinish({ skin: "ice" })).toBe(false);
  });

  it("changes the illustration finish without sending HID packets or touching settings", () => {
    const transfer = vi.spyOn(hidClient, "transfer");
    const before = useDeviceSession.getState();
    for (const finish of MOUSE_FINISHES) {
      setMouseFinish(finish.value);
      expect(useDeviceSession.getState().skin).toBe(finish.value);
      expect(useDeviceSession.getState().safeMode).toBe(before.safeMode);
      expect(useDeviceSession.getState().busy).toBe(before.busy);
    }
    expect(transfer).not.toHaveBeenCalled();
  });

  it("restores a saved finish and follows finish changes from existing device controls", () => {
    window.localStorage.setItem(FINISH_STORAGE_KEY, "black");
    mountTheme();
    expect(useDeviceSession.getState().skin).toBe("black");
    expect(document.documentElement.dataset.finish).toBe("black");
    expect(host?.textContent).toBe("black");

    act(() => useDeviceSession.setState({ skin: "orange" }));
    expect(document.documentElement.dataset.finish).toBe("orange");
    expect(window.localStorage.getItem(FINISH_STORAGE_KEY)).toBe("orange");
    expect(host?.textContent).toBe("orange");
  });

  it("synchronizes other tabs, ignores unrelated keys, and resets a removed preference", () => {
    mountTheme();
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: FINISH_STORAGE_KEY,
          newValue: "orange",
          storageArea: window.localStorage,
        }),
      ),
    );
    expect(document.documentElement.dataset.finish).toBe("orange");
    expect(host?.textContent).toBe("orange");

    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "unrelated-setting",
          newValue: "black",
          storageArea: window.localStorage,
        }),
      ),
    );
    expect(useDeviceSession.getState().skin).toBe("orange");

    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: FINISH_STORAGE_KEY,
          newValue: null,
          storageArea: window.localStorage,
        }),
      ),
    );
    expect(useDeviceSession.getState().skin).toBe("ice");
    expect(document.documentElement.dataset.finish).toBe("ice");
  });

  it("keeps finish selection working when storage is disabled", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    expect(mountTheme).not.toThrow();
    expect(() => act(() => setMouseFinish("black"))).not.toThrow();
    expect(document.documentElement.dataset.finish).toBe("black");
    expect(host?.textContent).toBe("black");
  });
});
