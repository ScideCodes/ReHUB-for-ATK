import { useSyncExternalStore } from "react";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "atk-hub-theme";
const subscribers = new Set<() => void>();
let preference: ThemePreference = "light"; // Original driver default (theme store state.theme).
let initialized = false;
let media: MediaQueryList | null = null;

function isPreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

function initialize() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  media = window.matchMedia("(prefers-color-scheme: dark)");
  const initial = document.documentElement.dataset.themePreference;
  if (isPreference(initial)) preference = initial;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isPreference(saved)) preference = saved;
  } catch {
    /* Keep the preference in memory when storage is unavailable. */
  }
}

function resolveTheme(): ResolvedTheme {
  return preference === "system"
    ? media?.matches
      ? "dark"
      : "light"
    : preference;
}

function applyTheme() {
  const resolved = resolveTheme();
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "dark" ? "#101014" : "#F2F2F7");
}

function publish() {
  applyTheme();
  subscribers.forEach((subscriber) => subscriber());
}

function onSystemChange() {
  if (preference === "system") publish();
}

function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  preference = isPreference(event.newValue) ? event.newValue : "dark";
  publish();
}

function subscribe(listener: () => void) {
  initialize();
  if (subscribers.size === 0) {
    media?.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    applyTheme();
  }
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) {
      media?.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    }
  };
}

function snapshot() {
  initialize();
  return `${preference}:${resolveTheme()}`;
}

export function setTheme(theme: ThemePreference) {
  initialize();
  if (!isPreference(theme)) return;
  preference = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* Use session memory. */
  }
  publish();
}

export function useTheme() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "dark:dark");
  const [theme, resolvedTheme] = value.split(":") as [
    ThemePreference,
    ResolvedTheme,
  ];
  return { theme, resolvedTheme, setTheme };
}
