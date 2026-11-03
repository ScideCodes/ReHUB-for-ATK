// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { DEVICE_REGISTRY } from "../devices/registry";
import { selectedColorIndex, useDeviceColorway } from "./deviceColorway";

afterEach(() => {
  useDeviceColorway.setState({ colors: {} });
  localStorage.clear();
});

it("restores independent keyboard and mouse colours after storage rehydration", async () => {
  const keyboard = DEVICE_REGISTRY.find((d) => d.name === "ATK RS6")!;
  const mouse = DEVICE_REGISTRY.find((d) => d.name === "ATK Frost Zero Extreme")!;
  useDeviceColorway.getState().select(keyboard, 1);
  useDeviceColorway.getState().select(mouse, 2);
  const saved = localStorage.getItem("atk-hub-mouse-colorways")!;
  useDeviceColorway.setState({ colors: {} });
  localStorage.setItem("atk-hub-mouse-colorways", saved);
  await useDeviceColorway.persist.rehydrate();
  const { colors } = useDeviceColorway.getState();
  expect(selectedColorIndex(keyboard, colors, 0)).toBe(1);
  expect(selectedColorIndex(mouse, colors, 0)).toBe(2);
});

it("keeps legacy card colours when no preference exists and clamps invalid indices", () => {
  const mouse = DEVICE_REGISTRY.find((d) => d.name === "ATK Frost Zero Extreme")!;
  expect(selectedColorIndex(mouse, {}, 2)).toBe(2);
  expect(selectedColorIndex(mouse, {}, 100)).toBe(mouse.colorways!.length - 1);
  expect(selectedColorIndex(mouse, {}, -1)).toBe(0);
  useDeviceColorway.getState().select(mouse, 0);
  expect(selectedColorIndex(mouse, useDeviceColorway.getState().colors, 2)).toBe(0);
});
