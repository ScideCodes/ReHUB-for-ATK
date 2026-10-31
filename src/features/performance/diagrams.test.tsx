// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LodDiagram } from "./LodDiagram";
import { SensorRotationDiagram } from "./SensorRotationDiagram";

describe("Performance Diagrams", () => {
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
  });

  describe("LodDiagram", () => {
    it("renders lift-off distance with correct telemetry and accessible label", async () => {
      await act(async () => {
        root.render(<LodDiagram height={0.7} />);
      });

      const visualizer = container.querySelector(".lg-lod-visualizer");
      expect(visualizer).not.toBeNull();
      expect(visualizer?.getAttribute("aria-label")).toContain("0.7 mm");
      expect(container.textContent).toContain("0.7 mm");

      await act(async () => {
        root.render(<LodDiagram height={2.0} />);
      });
      expect(visualizer?.getAttribute("aria-label")).toContain("2.0 mm");
      expect(container.textContent).toContain("2.0 mm");

      // Verify mouse is not clipped or off-screen
      const mouseGroup = container.querySelector(
        ".lg-lod-mouse-group",
      ) as SVGGraphicsElement;
      expect(mouseGroup).not.toBeNull();
      // Mouse translation should be positive (inside 96px frame, not negative)
      expect(mouseGroup.getAttribute("style")).toMatch(
        /translateY\([1-9]\d*px\)/,
      );
    });
  });

  describe("SensorRotationDiagram", () => {
    it("renders sensor rotation dial with angle readout and accessible label", async () => {
      await act(async () => {
        root.render(<SensorRotationDiagram angle={15} enabled={true} />);
      });

      const visualizer = container.querySelector(".lg-rotation-visualizer");
      expect(visualizer).not.toBeNull();
      expect(visualizer?.getAttribute("aria-label")).toContain("+15°");
      expect(container.textContent).toContain("+15°");

      await act(async () => {
        root.render(<SensorRotationDiagram angle={-10} enabled={true} />);
      });
      expect(visualizer?.getAttribute("aria-label")).toContain("-10°");
      expect(container.textContent).toContain("-10°");

      await act(async () => {
        root.render(<SensorRotationDiagram angle={0} enabled={true} />);
      });
      expect(container.textContent).toContain("0°");
    });

    it("clamps angle beyond range -30° to +30°", async () => {
      await act(async () => {
        root.render(<SensorRotationDiagram angle={45} enabled={true} />);
      });
      expect(container.textContent).toContain("+30°");
    });

    it("moves thumb to right for positive angles and left for negative angles", async () => {
      await act(async () => {
        root.render(<SensorRotationDiagram angle={20} enabled={true} />);
      });
      const posThumb = container.querySelector(
        ".atk-rot-thumb-group circle:first-child",
      );
      const posCx = Number(posThumb?.getAttribute("cx"));
      expect(posCx).toBeGreaterThan(137.5); // Right of center

      await act(async () => {
        root.render(<SensorRotationDiagram angle={-20} enabled={true} />);
      });
      const negThumb = container.querySelector(
        ".atk-rot-thumb-group circle:first-child",
      );
      const negCx = Number(negThumb?.getAttribute("cx"));
      expect(negCx).toBeLessThan(137.5); // Left of center
    });
  });
});
