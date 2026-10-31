import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  SHOWCASE_DEVICES,
  findDeviceSpec,
  resolveMouseImage,
} from "./deviceCatalog";
import { MOUSE_DEVICES } from "../../devices/registry";
import { getDeviceFinishes } from "../../ui/finishTheme";

describe("deviceCatalog and mouse skins", () => {
  it("every showcase device has valid colors and existing public images", () => {
    const publicMouseDir = path.resolve(__dirname, "../../../public");

    for (const dev of SHOWCASE_DEVICES) {
      expect(dev.colors.length).toBeGreaterThan(0);

      for (const color of dev.colors) {
        // Image path must resolve to a distinct valid file
        const resolvedPath = resolveMouseImage(dev.cid, dev.mid, color);
        expect(resolvedPath).toMatch(/^\/mouse\/[a-zA-Z0-9_\-.]+\.(webp|png)$/);

        const diskPath = path.join(publicMouseDir, resolvedPath);
        expect(
          fs.existsSync(diskPath),
          `File ${resolvedPath} for device ${dev.name} (${color}) must exist on disk`,
        ).toBe(true);
      }
    }
  });

  it("offers registry colorways instead of legacy family guesses", () => {
    for (const model of MOUSE_DEVICES.filter(
      (d) => d.cid !== undefined && d.mid !== undefined,
    )) {
      const source = MOUSE_DEVICES.find(
        (d) => d.cid === model.cid && d.mid === model.mid,
      )!;
      for (const finish of getDeviceFinishes(model.cid, model.mid)) {
        expect(
          source.colorways?.some(
            (c) => c.name === finish.name && c.hex === finish.swatch,
          ),
        ).toBe(true);
      }
    }
    expect(getDeviceFinishes().map((f) => f.swatch)).toContain("#BDC9E2");
  });

  it("updates mouse image on each finish selection for X1, Z1, A9, and R1", () => {
    // X1 Ultra
    const x1Spec = findDeviceSpec(2, 43)!;
    const x1Black = resolveMouseImage(x1Spec.cid, x1Spec.mid, "black");
    const x1White = resolveMouseImage(x1Spec.cid, x1Spec.mid, "white");
    expect(x1Black).not.toBe(x1White);
    expect(x1Black).toContain("black");
    expect(x1White).toContain("white");

    // Z1 Pro Max
    const z1Spec = findDeviceSpec(2, 41)!;
    const z1Black = resolveMouseImage(z1Spec.cid, z1Spec.mid, "black");
    const z1White = resolveMouseImage(z1Spec.cid, z1Spec.mid, "white");
    const z1Orange = resolveMouseImage(z1Spec.cid, z1Spec.mid, "orange");
    expect(z1Black).not.toBe(z1White);
    expect(z1White).not.toBe(z1Orange);
    expect(z1Black).toContain("black");
    expect(z1White).toContain("white");
    expect(z1Orange).toContain("orange");

    // A9 X
    const a9Spec = findDeviceSpec(2, 107)!;
    const a9Black = resolveMouseImage(a9Spec.cid, a9Spec.mid, "black");
    const a9White = resolveMouseImage(a9Spec.cid, a9Spec.mid, "white");
    expect(a9Black).not.toBe(a9White);
    expect(a9Black).toContain("black");
    expect(a9White).toContain("white");

    // R1 Pro
    const r1Spec = findDeviceSpec(2, 7)!;
    const r1Black = resolveMouseImage(r1Spec.cid, r1Spec.mid, "black");
    const r1White = resolveMouseImage(r1Spec.cid, r1Spec.mid, "white");
    const r1Purple = resolveMouseImage(r1Spec.cid, r1Spec.mid, "purple");
    expect(r1Black).not.toBe(r1White);
    expect(r1White).not.toBe(r1Purple);
    expect(r1Black).toContain("black");
    expect(r1White).toContain("white");
    expect(r1Purple).toContain("purple");
  });
});
