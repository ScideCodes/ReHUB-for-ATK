import { expect, it } from "vitest";
import { checkUpload, normalizeAppearance } from "./appearanceStore";

it("clamps appearance to the original driver's ranges and rejects unknown values", () => {
  expect(normalizeAppearance({ blur: 33, brightness: 3, wallpaper: "nope", font: "comic" as never })).toEqual({
    wallpaper: "none",
    blur: 20,
    brightness: 10,
    font: "store",
  });
  expect(normalizeAppearance({ blur: 2.3, brightness: 77, wallpaper: "moon" })).toMatchObject({
    blur: 2.5,
    brightness: 75,
    wallpaper: "moon",
  });
});

it("accepts only small fonts and images of supported types", () => {
  expect(checkUpload({ name: "a.woff2", size: 1000, type: "" }, "font")).toBeNull();
  expect(checkUpload({ name: "a.exe", size: 1000, type: "" }, "font")).toMatch(/Unsupported/);
  expect(checkUpload({ name: "a.png", size: 16 * 1024 * 1024, type: "image/png" }, "image")).toMatch(/too large/);
  expect(checkUpload({ name: "a.svg", size: 10, type: "image/svg+xml" }, "image")).toMatch(/Unsupported/);
});
