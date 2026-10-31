// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useConfigStore } from "../store/configStore";
import { useDeviceSession } from "../features/device/deviceSession";
import { DEVICE_REGISTRY } from "../devices/registry";
import { resolveDeviceImage } from "../devices/presentation";
import { FinishPicker } from "./FinishPicker";
import { MouseIllustration } from "../features/device/MouseIllustration";
import { useMouseColorway } from "./mouseColorway";

const original = useConfigStore.getState(),
  session = useDeviceSession.getState();
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  useMouseColorway.setState({ colors: {} });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useConfigStore.setState(original);
  useDeviceSession.setState(session);
  useMouseColorway.setState({ colors: {} });
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("changes the photo for every ZERO EX finish without sending hardware commands", async () => {
  const device = DEVICE_REGISTRY.find((d) => d.name === "ATK ZERO EX")!;
  useConfigStore.setState({
    selectedDevice: device,
    deviceInfo: { ...original.deviceInfo, isMock: true, cid: 1, mid: 4 },
  });
  await act(async () =>
    root.render(
      <>
        <FinishPicker />
        <MouseIllustration />
      </>,
    ),
  );
  for (let index = 0; index < device.colorways!.length; index++) {
    await act(async () => useMouseColorway.getState().select(device, index));
    expect(document.documentElement.dataset.colorwayHex).toBe(
      device.colorways![index].hex.toUpperCase(),
    );
    expect(host.querySelector("image")?.getAttribute("href")).toBe(
      resolveDeviceImage(device, index),
    );
    expect(host.querySelector(".hub-select-trigger")?.textContent).toContain(
      device.colorways![index].name,
    );
  }
});

it("uses the selected model's real one-color palette instead of ZERO EX colors", async () => {
  const device = DEVICE_REGISTRY.find((d) => d.name === "ATK A9 SE NK")!;
  expect(device.colorways).toHaveLength(1);
  useConfigStore.setState({
    selectedDevice: device,
    deviceInfo: { ...original.deviceInfo, isMock: true, cid: 1, mid: 4 },
  });
  await act(async () => {
    useMouseColorway.getState().select(device, 0);
    root.render(
      <>
        <FinishPicker />
        <MouseIllustration />
      </>,
    );
  });
  expect(host.querySelector(".hub-select-trigger")?.textContent).toContain(
    "White",
  );
  expect(host.querySelector("image")?.getAttribute("href")).toBe(
    resolveDeviceImage(device, 0),
  );
  expect(useDeviceSession.getState().skin).toBe("white");
});
