// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppearanceLayer } from "./Appearance";
import { WallpaperPage } from "../../hub/Pages";
import { APPEARANCE_FILE_EVENT, checkDecodes, readFile, saveFile, setAppearance } from "./appearanceStore";

vi.mock("./appearanceStore", async (original) => ({
  ...await original<typeof import("./appearanceStore")>(),
  readFile: vi.fn(), saveFile: vi.fn(), checkDecodes: vi.fn(),
}));
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vi.mocked(checkDecodes).mockResolvedValue(null);
  setAppearance({ wallpaper: "custom", font: "store" });
  vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("refreshes a replacement custom wallpaper and releases each object URL", async () => {
  vi.mocked(readFile).mockResolvedValue(new Blob(["image"]));
  await act(async () => root.render(<AppearanceLayer />));
  expect(host.querySelector<HTMLElement>(".cx-wallpaper")!.style.backgroundImage).toContain("blob:first");
  await act(async () => window.dispatchEvent(new CustomEvent(APPEARANCE_FILE_EVENT, { detail: "wallpaper" })));
  expect(host.querySelector<HTMLElement>(".cx-wallpaper")!.style.backgroundImage).toContain("blob:second");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first");
  await act(async () => root.render(null));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:second");
});
it("does not create an object URL when a pending read finishes after leaving custom wallpaper", async () => {
  let finish!: (blob: Blob) => void;
  vi.mocked(readFile).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => root.render(<AppearanceLayer />));
  await act(async () => setAppearance({ wallpaper: "none" }));
  await act(async () => finish(new Blob(["image"])));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(host.querySelector(".cx-wallpaper")).toBeNull();
});
it("shows a failed wallpaper save without changing the selected wallpaper", async () => {
  setAppearance({ wallpaper: "none" });
  vi.mocked(saveFile).mockRejectedValue(new Error("Quota exceeded"));
  await act(async () => root.render(<WallpaperPage onBack={() => {}} />));
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["image"], "paper.png", { type: "image/png" })] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(host.querySelector('[role="alert"]')!.textContent).toContain("Image could not be saved");
  expect(JSON.parse(localStorage.getItem("atk-hub-appearance")!).wallpaper).toBe("none");
});
it("rejects an image that cannot be decoded without saving it", async () => {
  setAppearance({ wallpaper: "none" });
  vi.mocked(checkDecodes).mockResolvedValue("This image could not be read. Try another file.");
  await act(async () => root.render(<WallpaperPage onBack={() => {}} />));
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["garbage"], "paper.png", { type: "image/png" })] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(host.querySelector('[role="alert"]')!.textContent).toContain("could not be read");
  expect(saveFile).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("atk-hub-appearance")!).wallpaper).toBe("none");
});
it("reloads replacement custom fonts and removes the previous face", async () => {
  const fontSet = { add: vi.fn(), delete: vi.fn() };
  const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
  Object.defineProperty(document, "fonts", { configurable: true, value: fontSet });
  vi.stubGlobal("FontFace", class {
    async load() { return this; }
  });
  vi.mocked(readFile).mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(0) } as Blob);
  setAppearance({ wallpaper: "none", font: "custom" });
  try {
    await act(async () => root.render(<AppearanceLayer />));
    expect(fontSet.add).toHaveBeenCalledTimes(1);
    const first = fontSet.add.mock.calls[0][0];
    await act(async () => window.dispatchEvent(new CustomEvent(APPEARANCE_FILE_EVENT, { detail: "font" })));
    expect(fontSet.add).toHaveBeenCalledTimes(2);
    expect(fontSet.delete).toHaveBeenCalledWith(first);
    const second = fontSet.add.mock.calls[1][0];
    await act(async () => root.render(null));
    expect(fontSet.delete).toHaveBeenCalledWith(second);
  } finally {
    if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
    else Reflect.deleteProperty(document, "fonts");
  }
});
