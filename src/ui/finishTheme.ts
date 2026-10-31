import { useEffect, useLayoutEffect } from "react";
import { useDeviceSession } from "../features/device/deviceSession";
import { findDeviceSpec } from "../features/device/deviceCatalog";
import "../styles/finish.css";
import { paletteFromHex, applyColorwayHex } from "./colorPalette";
import { MOUSE_DEVICES } from "../devices/registry";
import { colorwayFinish } from "../devices/presentation";

export type MouseFinish =
  "ice" | "black" | "orange" | "white" | "gray" | "rose" | "purple" | "yellow";
export type FinishTheme = "dark" | "light";

export const FINISH_STORAGE_KEY = "atk-hub-finish";

export const MOUSE_FINISHES = [
  {
    value: "ice",
    label: "Ice",
    name: "Ice translucent",
    swatch: "#BDC9E2",
    swatchInk: "#082F49",
  },
  {
    value: "black",
    label: "Black",
    name: "Black",
    swatch: "#000000",
    swatchInk: "#FFFFFF",
  },
  {
    value: "orange",
    label: "Orange",
    name: "Orange",
    swatch: "#F68641",
    swatchInk: "#30170A",
  },
  {
    value: "white",
    label: "White",
    name: "Polar White",
    swatch: "#FFFFFF",
    swatchInk: "#000000",
  },
  {
    value: "gray",
    label: "Gray",
    name: "Slate Gray",
    swatch: "#64748B",
    swatchInk: "#FFFFFF",
  },
  {
    value: "rose",
    label: "Rose",
    name: "Rose Red",
    swatch: "#E11D48",
    swatchInk: "#FFFFFF",
  },
  {
    value: "purple",
    label: "Purple",
    name: "Cyber Purple",
    swatch: "#9333EA",
    swatchInk: "#FFFFFF",
  },
  {
    value: "yellow",
    label: "Yellow",
    name: "Solar Yellow",
    swatch: "#EAB308",
    swatchInk: "#000000",
  },
] as const satisfies readonly {
  value: MouseFinish;
  label: string;
  name: string;
  swatch: string;
  swatchInk: string;
}[];

export interface FinishPalette {
  accent: string;
  ember: string;
  burnt: string;
  ink: string;
  onAccent: string;
  focus: string;
}

export const FINISH_PALETTES = Object.fromEntries(
  MOUSE_FINISHES.map((finish) => [
    finish.value,
    Object.fromEntries(
      (["dark", "light"] as const).map((theme) => {
        const p = paletteFromHex(finish.swatch, theme);
        return [
          theme,
          {
            accent: p["--hub-accent"],
            ember: p["--hub-ember"],
            burnt: p["--hub-burnt"],
            ink: p["--hub-accent-ink"],
            onAccent: p["--hub-on-accent"],
            focus: p["--hub-focus"],
          },
        ];
      }),
    ),
  ]),
) as Record<MouseFinish, Record<FinishTheme, FinishPalette>>;

export function isMouseFinish(value: unknown): value is MouseFinish {
  return (
    typeof value === "string" &&
    MOUSE_FINISHES.some((item) => item.value === value)
  );
}

export interface DeviceFinishOption {
  value: MouseFinish;
  label: string;
  name: string;
  swatch: string;
  swatchInk: string;
}

export function getDeviceFinishes(
  cid?: number,
  mid?: number,
): readonly DeviceFinishOption[] {
  const spec =
    cid !== undefined && mid !== undefined
      ? findDeviceSpec(cid, mid)
      : undefined;
  const device =
    (cid !== undefined && mid !== undefined
      ? MOUSE_DEVICES.find((d) => d.cid === cid && d.mid === mid)
      : undefined) ??
    MOUSE_DEVICES.find((d) => d.name === spec?.name) ??
    MOUSE_DEVICES.find((d) => d.name === "ATK ZERO EX");
  const options = new Map<MouseFinish, DeviceFinishOption>();
  for (const color of device?.colorways ?? []) {
    const value = colorwayFinish(color.id ?? color.name),
      p = paletteFromHex(color.hex, "dark");
    if (!options.has(value))
      options.set(value, {
        value,
        label: color.name,
        name: color.name,
        swatch: color.hex,
        swatchInk: p["--hub-on-accent"],
      });
  }
  return [...options.values()];
}

export function readStoredFinish(
  storage: Pick<Storage, "getItem"> | undefined,
): MouseFinish {
  try {
    const value = storage?.getItem(FINISH_STORAGE_KEY);
    return isMouseFinish(value) ? value : "ice";
  } catch {
    return "ice";
  }
}

function applyFinish(finish: MouseFinish, persist: boolean) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.finish = finish;
    applyColorwayHex(MOUSE_FINISHES.find((f) => f.value === finish)!.swatch);
  }
  if (!persist || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FINISH_STORAGE_KEY, finish);
  } catch {
    /* Keep the selection in memory if browser storage is unavailable. */
  }
}

export function setMouseFinish(finish: MouseFinish) {
  if (!isMouseFinish(finish)) return;
  useDeviceSession.setState({ skin: finish });
  applyFinish(finish, true);
}

const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useFinishTheme() {
  const finish = useDeviceSession((state) => state.skin);

  useBrowserLayoutEffect(() => {
    let initial: MouseFinish = useDeviceSession.getState().skin;
    try {
      const saved = window.localStorage.getItem(FINISH_STORAGE_KEY);
      if (isMouseFinish(saved)) initial = saved;
    } catch {
      /* The current finish remains usable without persistent storage. */
    }
    useDeviceSession.setState({ skin: initial });
    applyFinish(initial, false);

    const unsubscribe = useDeviceSession.subscribe((state, previous) => {
      if (state.skin !== previous.skin) applyFinish(state.skin, true);
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key !== FINISH_STORAGE_KEY && event.key !== null) return;
      if (
        event.storageArea !== null &&
        event.storageArea !== window.localStorage
      )
        return;
      const next = isMouseFinish(event.newValue) ? event.newValue : "ice";
      useDeviceSession.setState({ skin: next });
      applyFinish(next, false);
    };
    const themeObserver = new MutationObserver(() =>
      applyColorwayHex(
        document.documentElement.dataset.colorwayHex ?? "#BDC9E2",
      ),
    );
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    window.addEventListener("storage", onStorage);
    return () => {
      unsubscribe();
      themeObserver.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return { finish, setFinish: setMouseFinish };
}
