// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LodIllustration } from "./LodIllustration";

function baseFor(lod: number, min = 0.7, max = 1.7) {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<LodIllustration lod={lod} min={min} max={max} />));
  const y = Number(/translateY\(([\d.]+)px\)/.exec(host.querySelector<SVGGElement>(".lift")!.style.transform)![1]);
  const label = host.querySelector("text")!.textContent;
  act(() => root.unmount());
  return { y, label };
}

it("lifts the mouse higher for a larger LOD and clamps to the range", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const low = baseFor(0.7), mid = baseFor(1.2), high = baseFor(1.7);
  expect(low.y).toBeGreaterThan(mid.y);
  expect(mid.y).toBeGreaterThan(high.y);
  expect(baseFor(5).y).toBe(high.y);
  expect(baseFor(0).y).toBe(low.y);
  expect(high.label).toBe("1.7 mm");
  // A single fixed height (min === max) still draws a visible gap.
  expect(baseFor(1, 1, 1).y).toBeLessThan(62);
  vi.unstubAllGlobals();
});
