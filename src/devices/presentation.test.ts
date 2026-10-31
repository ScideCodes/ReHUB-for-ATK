import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEVICE_REGISTRY, findByVidPid } from "./registry";
import { resolveDeviceImage, deviceKey, colorwayFinish } from "./presentation";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DevicePreview } from "../ui/DevicePreview";
import previews from "./layoutPreviews.json";

describe("device artwork and identity", () => {
  it("retains source key counts and generates only exact model layouts", () => {
    const sourceCounts: Record<string, number> = {
      "keymaps/edge63_v2.json": 64,
      "keymaps/rs6_v2.json": 68,
      "keymaps/rs8_turbo.json": 87,
      "keymaps/hex80_v2.json": 88,
      "keymaps/rs6_performance.json": 66,
      "keymaps/velota_desmond.json": 61,
      "keymaps/rs7_revi.json": 80,
      "keymaps/atk_75_gtech.json": 82,
    };
    for (const [identity, preview] of Object.entries(previews)) {
      const device = DEVICE_REGISTRY.find(
        (d) => `${Number(d.VID)}:${Number(d.PID)}` === identity,
      )!;
      expect(device.kind).toBe("keyboard");
      expect(device.name).not.toContain("Cube");
      const svg = readFileSync(
        resolve(process.cwd(), "public", preview.image.slice(1)),
        "utf8",
      );
      expect(preview.keyCount).toBe(sourceCounts[preview.source]);
      expect((svg.match(/<rect /g) ?? []).length - 1).toBe(preview.keyCount);
    }
  });
  it("uses the exact model layout when a product photo is absent", () => {
    const device = DEVICE_REGISTRY.find((d) => d.name === "ATK RS8 Turbo")!;
    const html = renderToStaticMarkup(
      createElement(DevicePreview, { device, color: 0 }),
    );
    expect(html).toContain("/devices/layouts/rs8_turbo.svg");
    expect(html).toContain("Layout preview");
    expect(resolveDeviceImage(device, 0)).toBeNull();
  });
  it("restores manufacturer artwork for each X3 model", () => {
    for (const name of ["VXE X3", "VXE X3 Pro", "VXE X3 Turbo"]) {
      const device = DEVICE_REGISTRY.find((d) => d.name === name)!;
      expect(device.colorways?.length).toBeGreaterThan(0);
      expect(
        device.colorways?.every(
          (_, i) => resolveDeviceImage(device, i) !== null,
        ),
        name,
      ).toBe(true);
    }
  });
  it("resolves every offered photo to a local file", () => {
    for (const device of DEVICE_REGISTRY) {
      for (const [index, color] of (device.colorways ?? []).entries()) {
        const image = resolveDeviceImage(device, index);
        if (color.image) {
          expect(image).toBe(color.image);
          expect(
            existsSync(resolve(process.cwd(), "public", image!.slice(1))),
            `${device.name}: ${color.name}`,
          ).toBe(true);
        } else expect(image).toBeNull();
      }
    }
  });
  it("never substitutes another finish when its image is missing", () => {
    const device = {
      ...DEVICE_REGISTRY[0],
      colorways: [
        { name: "Black", hex: "#000000", image: "/black.webp" },
        { name: "White", hex: "#ffffff" },
      ],
      images: ["/black.webp"],
    };
    expect(resolveDeviceImage(device, 1)).toBeNull();
    expect(resolveDeviceImage(device, 99)).toBeNull();
    expect(deviceKey(device)).toBe(deviceKey({ ...device }));
  });
  it("has distinct source-backed RS6 colorway photos", () => {
    const rs6 = DEVICE_REGISTRY.find((d) => d.name === "ATK RS6")!;
    const images = rs6.colorways!.map((_, i) => resolveDeviceImage(rs6, i));
    expect(images.length).toBeGreaterThan(2);
    expect(new Set(images.filter(Boolean)).size).toBe(images.length);
  });
  it("looks up numeric VID/PID and translates translucent finishes safely", () => {
    expect(findByVidPid(0x373b, 0x1048)?.id).toBe("atk-68-v2-pro");
    expect(colorwayFinish("black-translucent")).toBe("black");
    expect(colorwayFinish("orange-translucent")).toBe("orange");
    expect(colorwayFinish("ice-translucent")).toBe("ice");
  });
});
