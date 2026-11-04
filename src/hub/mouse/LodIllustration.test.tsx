// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LodIllustration } from "./LodIllustration";

function geometry(lod: number) {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<LodIllustration lod={lod} />));
  const mouse = host.querySelector<HTMLElement>(".mouse")!.style.bottom;
  const ruler = host.querySelector<HTMLElement>(".ruler")!.style.height;
  act(() => root.unmount());
  return { mouse, ruler };
}

it("raises the mouse 15 px per mm above the desk line, like the original", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  expect(geometry(1)).toEqual({ mouse: "35px", ruler: "13px" });
  expect(geometry(2).ruler).toBe("28px");
  expect(geometry(0.7).ruler).toBe("8.5px");
  expect(geometry(0).ruler).toBe("0px");
  vi.unstubAllGlobals();
});
