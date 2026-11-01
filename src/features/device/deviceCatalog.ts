import models from "../../devices/mouseModels.generated.json";
export interface AtkDeviceSpec {
  cid: number;
  mid: number;
  name: string;
  sensor: string;
  family:
    | "zero"
    | "f1"
    | "x1"
    | "z1"
    | "madr"
    | "fiercex"
    | "a9"
    | "u2"
    | "r1"
    | "generic";
  maxDpi: number;
  minDpi: number;
  maxPollingRate: number;
  hasSensorAngle: boolean;
  hasLongDistance: boolean;
  noDongleRGB?: boolean;
  noDpiRGB?: boolean;
}

export const ATK_DEVICE_CATALOG = models as readonly AtkDeviceSpec[];

export function findDeviceSpec(
  cid: number,
  mid: number,
): AtkDeviceSpec | undefined {
  return ATK_DEVICE_CATALOG.find((d) => d.cid === cid && d.mid === mid);
}

export function resolveDeviceName(
  cid: number,
  mid: number,
  isMock: boolean = false,
): string {
  if (cid === 1 && mid === 4) return "ATK Frost Zero Extreme";
  const found = findDeviceSpec(cid, mid);
  if (found) return found.name;
  if (isMock) return "ATK Frost Zero Extreme (Mock Device)";
  if (cid > 0 || mid > 0) return `ATK Mouse (${cid}.${mid})`;
  return "ATK Universal Wireless Mouse";
}

export interface ShowcaseDevice {
  id: string;
  name: string;
  family: AtkDeviceSpec["family"];
  sensor: string;
  cid: number;
  mid: number;
  images: Record<string, string>;
  colors: string[];
}

export const SHOWCASE_DEVICES: readonly ShowcaseDevice[] = [
  {
    id: "zero-ex",
    name: "ATK Frost Zero Extreme",
    family: "zero",
    sensor: "PAW3950 Ultra",
    cid: 1,
    mid: 4,
    images: {
      black: "/mouse/black.png",
      ice: "/mouse/ice.png",
      orange: "/mouse/orange.png",
    },
    colors: ["black", "ice", "orange"],
  },
  {
    id: "f1-ultimate",
    name: "ATK Dragonfly F1 Ultimate",
    family: "f1",
    sensor: "PAW3950 Ultra",
    cid: 2,
    mid: 42,
    images: {
      black: "/mouse/f1-ultimate-black.webp",
      white: "/mouse/f1-ultimate-white.webp",
    },
    colors: ["black", "white"],
  },
  {
    id: "f1-pro-max",
    name: "ATK Dragonfly F1 Pro Max",
    family: "f1",
    sensor: "PAW3395",
    cid: 2,
    mid: 105,
    images: {
      black: "/mouse/f1-black.webp",
      white: "/mouse/f1-white.webp",
    },
    colors: ["black", "white"],
  },
  {
    id: "x1-ultra",
    name: "ATK Blazing Sky X1 Ultra",
    family: "x1",
    sensor: "PAW3950 Ultra",
    cid: 2,
    mid: 43,
    images: {
      black: "/mouse/x1-black.webp",
      white: "/mouse/x1-white.webp",
    },
    colors: ["black", "white"],
  },
  {
    id: "z1-pro-max",
    name: "ATK Z1 Pro Max",
    family: "z1",
    sensor: "PAW3395",
    cid: 2,
    mid: 41,
    images: {
      black: "/mouse/z1-black.webp",
      white: "/mouse/z1-white.webp",
      orange: "/mouse/z1-orange.webp",
    },
    colors: ["black", "white", "orange"],
  },
  {
    id: "madr-major",
    name: "MAD R Major",
    family: "madr",
    sensor: "PAW3950",
    cid: 2,
    mid: 47,
    images: {
      black: "/mouse/madr-major-black.webp",
      white: "/mouse/madr-major-white.webp",
    },
    colors: ["black", "white"],
  },
  {
    id: "fiercex",
    name: "ATK Fierce X",
    family: "fiercex",
    sensor: "PAW3950",
    cid: 2,
    mid: 44,
    images: {
      black: "/mouse/fiercex-black.webp",
      white: "/mouse/fiercex-white.webp",
      gray: "/mouse/fiercex-gray.webp",
    },
    colors: ["black", "white", "gray"],
  },
  {
    id: "a9-x",
    name: "ATK A9 X",
    family: "a9",
    sensor: "PAW3395",
    cid: 2,
    mid: 107,
    images: {
      black: "/mouse/a9-black.webp",
      white: "/mouse/a9-white.webp",
    },
    colors: ["black", "white"],
  },
  {
    id: "r1-pro",
    name: "VXE R1 Pro",
    family: "r1",
    sensor: "PAW3395",
    cid: 2,
    mid: 7,
    images: {
      black: "/mouse/r1-black.webp",
      white: "/mouse/r1-white.webp",
      purple: "/mouse/r1-purple.webp",
    },
    colors: ["black", "white", "purple"],
  },
];

export function resolveMouseImage(
  cid?: number,
  mid?: number,
  skin?: string,
): string {
  const spec = cid && mid ? findDeviceSpec(cid, mid) : undefined;
  const family = spec?.family ?? "zero";

  switch (family) {
    case "f1":
      if (skin === "black") {
        return mid === 42
          ? "/mouse/f1-ultimate-black.webp"
          : "/mouse/f1-black.webp";
      }
      if (skin === "lev") return "/mouse/f1-lev.webp";
      return mid === 42
        ? "/mouse/f1-ultimate-white.webp"
        : "/mouse/f1-white.webp";
    case "x1":
      if (skin === "white") return "/mouse/x1-white.webp";
      return "/mouse/x1-black.webp";
    case "z1":
      if (skin === "white") return "/mouse/z1-white.webp";
      if (skin === "orange") return "/mouse/z1-orange.webp";
      return "/mouse/z1-black.webp";
    case "madr":
      if (skin === "white") return "/mouse/madr-major-white.webp";
      return "/mouse/madr-major-black.webp";
    case "fiercex":
      if (skin === "white") return "/mouse/fiercex-white.webp";
      if (skin === "gray") return "/mouse/fiercex-gray.webp";
      return "/mouse/fiercex-black.webp";
    case "a9":
      if (skin === "white") return "/mouse/a9-white.webp";
      return "/mouse/a9-black.webp";
    case "r1":
      if (skin === "white") return "/mouse/r1-white.webp";
      if (skin === "purple") return "/mouse/r1-purple.webp";
      return "/mouse/r1-black.webp";
    case "zero":
    default:
      if (skin === "black") return "/mouse/black.png";
      if (skin === "orange") return "/mouse/orange.png";
      return "/mouse/ice.png";
  }
}
