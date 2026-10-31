import { useSyncExternalStore } from "react";

// Port of the original driver's theme store (demoMode.store: theme `LK`, theme-set `CK`):
// wallpaper presets, blur 0–20 (step .5), brightness 10–150 (step 5), defaults blur 0 / brightness 100.
export const WALLPAPERS = [
  { id: "duckbill", name: "Duckbill", file: "duckbill.jpg", brightness: 50 },
  { id: "leviathan", name: "Leviathan", file: "leviathan.jpg", brightness: 100 },
  { id: "aspas", name: "Aspas", file: "aspas.webp", brightness: 100 },
  { id: "spring", name: "Spring", file: "spring.webp", brightness: 100 },
  { id: "black-gold", name: "ATK Black Gold", file: "black-gold.jpg", brightness: 50 },
  { id: "metal", name: "ATK Metal", file: "metal.jpg", brightness: 100 },
  { id: "aspas-portrait", name: "Aspas Portrait", file: "aspas-portrait.jpg", brightness: 50 },
  { id: "rainbow", name: "Rainbow", file: "rainbow.jpg", brightness: 40 },
  { id: "silver-wing", name: "Silver Wing", file: "silver-wing.jpg", brightness: 50 },
  { id: "pink-blade-elf", name: "Pink Blade Elf", file: "pink-blade-elf.jpg", brightness: 80 },
  { id: "moon", name: "Moon", file: "moon.webp", brightness: 100 },
] as const;

export type FontPreset = "store" | "system" | "custom";
export type Appearance = {
  wallpaper: string; // "none", a preset id, or "custom"
  blur: number;
  brightness: number;
  font: FontPreset;
};

const DEFAULT_APPEARANCE: Appearance = {
  wallpaper: "none",
  blur: 0,
  brightness: 100,
  font: "store",
};
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const FONT_TYPES = [".woff2", ".woff", ".ttf", ".otf"];
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const STORAGE_KEY = "atk-hub-appearance";
const clamp = (value: unknown, min: number, max: number, step: number, fallback: number) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number / step) * step));
};

/** Normalise stored or edited values to the original ranges. */
export function normalizeAppearance(value: Partial<Appearance> | null | undefined): Appearance {
  const wallpaper =
    value?.wallpaper === "custom" || WALLPAPERS.some((paper) => paper.id === value?.wallpaper)
      ? String(value?.wallpaper)
      : "none";
  return {
    wallpaper,
    blur: clamp(value?.blur, 0, 20, 0.5, DEFAULT_APPEARANCE.blur),
    brightness: clamp(value?.brightness, 10, 150, 5, DEFAULT_APPEARANCE.brightness),
    font: value?.font === "system" || value?.font === "custom" ? value.font : "store",
  };
}

/** Upload guard: returns an error message, or null when the file may be used. */
export function checkUpload(file: { name: string; size: number; type: string }, kind: "image" | "font") {
  if (file.size > MAX_UPLOAD_BYTES) return "File too large. Please select a file under 15MB.";
  if (kind === "image")
    return IMAGE_TYPES.includes(file.type) ? null : "Unsupported image. Use PNG, JPEG, WebP or GIF.";
  return FONT_TYPES.some((ext) => file.name.toLowerCase().endsWith(ext))
    ? null
    : "Unsupported format. Please use woff2, woff, ttf, or otf.";
}

let state: Appearance = DEFAULT_APPEARANCE;
let loaded = false;
const listeners = new Set<() => void>();
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    state = normalizeAppearance(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    /* Keep defaults when storage is unavailable. */
  }
}

export function setAppearance(patch: Partial<Appearance>) {
  load();
  state = normalizeAppearance({ ...state, ...patch });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Settings still apply for this session. */
  }
  listeners.forEach((listener) => listener());
}

export function useAppearance() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => {
      load();
      return state;
    },
    () => DEFAULT_APPEARANCE,
  );
}

// Uploaded wallpaper and font stay on this device (IndexedDB), like the original.
const DB = "atk-hub-appearance";
function store(mode: IDBTransactionMode) {
  return new Promise<IDBObjectStore>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result.transaction("files", mode).objectStore("files"));
  });
}
export async function saveFile(key: "wallpaper" | "font", file: Blob | null) {
  const files = await store("readwrite");
  await new Promise((resolve, reject) => {
    const request = file ? files.put(file, key) : files.delete(key);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}
export async function readFile(key: "wallpaper" | "font") {
  const files = await store("readonly");
  return new Promise<Blob | undefined>((resolve, reject) => {
    const request = files.get(key);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
}
