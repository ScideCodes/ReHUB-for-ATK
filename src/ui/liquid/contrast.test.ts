import { paletteFromHex } from "../colorPalette";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(
  new URL("../../styles/glass.css", import.meta.url),
  "utf8",
);

type Color = [number, number, number, number];
function color(value: string): Color {
  if (value.startsWith("#")) {
    return [
      parseInt(value.slice(1, 3), 16),
      parseInt(value.slice(3, 5), 16),
      parseInt(value.slice(5, 7), 16),
      1,
    ];
  }
  const parts = value.match(/[\d.]+/g)!.map(Number);
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}
function over(front: Color, back: Color): Color {
  return [0, 1, 2]
    .map((index) => front[index] * front[3] + back[index] * (1 - front[3]))
    .concat(1) as Color;
}
function luminance(value: Color) {
  const linear = value
    .slice(0, 3)
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(first: Color, second: Color) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function tokens(block: string) {
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*(#[\da-f]+|rgba?\([^;]+\))/gi)].map(
      (match) => [match[1], color(match[2])],
    ),
  );
}

describe("Liquid Glass contrast tokens", () => {
  const theme = tokens(css.split(".hub-button")[0]);
  // Bound the actual radial fields, allowing each light its entire drift range.
  // Rims are masked out of the content region; screenshot inspection remains required.
  const backdrops: Color[] = [];
  for (const [width, height] of [
    [1440, 900],
    [1000, 700],
  ]) {
    const vmax = Math.max(width, height);
    const radius = 0.3 * vmax * Math.SQRT2 * 0.7;
    const lights = [
      [0.15, 0.2],
      [0.85, 0.3],
      [0.6, 0.95],
      [0.1, 0.9],
      [0.52, 0.48],
    ];
    for (let y = 0; y <= height; y += 20) {
      for (let x = 0; x <= width; x += 20) {
        let result = theme["--hub-bg"];
        lights.forEach(([cx, cy], index) => {
          const dx = Math.max(0, Math.abs(x - cx * width) - 0.03 * vmax);
          const dy = Math.max(0, Math.abs(y - cy * height) - 0.02 * vmax);
          const strength = Math.max(0, 1 - Math.hypot(dx, dy) / radius);
          const light = [
            ...theme[
              [
                "--lg-ambient-one",
                "--lg-ambient-two",
                "--lg-ambient-three",
                "--lg-ambient-four",
                "--lg-ambient-five",
              ][index]
            ],
          ] as Color;
          light[3] *= strength;
          result = over(light, result);
        });
        backdrops.push(result);
      }
    }
  }
  const backdrop = backdrops.reduce((a, b) =>
    luminance(a) > luminance(b) ? a : b,
  );
  it("keeps text readable across the specified light fields and drift range", () => {
    for (const fill of ["--glass-sheet", "--glass-panel-top", "--control-bg"]) {
      const panel = over(theme[fill], backdrop);
      for (const token of [
        "--hub-text",
        "--hub-text-muted",
        "--hub-text-faint",
        "--hub-accent-ink",
      ])
        expect(
          contrast(theme[token], panel),
          `${token} over ${fill}`,
        ).toBeGreaterThanOrEqual(
          fill === "--glass-sheet" ||
            token === "--hub-text" ||
            token === "--hub-accent-ink"
            ? 4.5
            : 2.5,
        );
    }
  });
  it("keeps Apply text and slider track distinguishable", () => {
    expect(
      contrast(theme["--hub-on-accent"], theme["--hub-accent"]),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(theme["--range-track"], over(theme["--glass-sheet"], backdrop)),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("Orange finish glass", () => {
  const theme = tokens(
    Object.entries(paletteFromHex("#F68641", "dark"))
      .map(([key, value]) => `${key}: ${value};`)
      .join("\n"),
  );
  it("keeps body and muted text at AA over the brightest combined lights", () => {
    let backdrop = theme["--hub-bg"];
    for (const light of [
      "--lg-ambient-one",
      "--lg-ambient-two",
      "--lg-ambient-three",
    ])
      backdrop = over(theme[light], backdrop);
    const glass = over(
      theme["--glass-bg"],
      over(theme["--glass-contrast-scrim"], backdrop),
    );
    for (const surface of [glass, over(theme["--control-bg"], glass)]) {
      for (const token of ["--hub-text", "--hub-text-muted"])
        expect(contrast(theme[token], surface), token).toBeGreaterThanOrEqual(
          4.5,
        );
    }
    expect(
      contrast(theme["--hub-on-accent"], theme["--hub-accent"]),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe("workspace color policy", () => {
  it("keeps literal colors in the palette instead of workspace styles", () => {
    for (const path of [
      "../keyboard/keyboard.css",
      "./layout.css",
      "./tabs.css",
    ]) {
      const styles = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(styles, path).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });
});
