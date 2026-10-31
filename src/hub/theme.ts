import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark" | "system";
const KEY = "atk-hub-original-theme";
const listeners = new Set<() => void>();
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function read(): ThemeMode {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    /* storage blocked: fall back to light like the original */
  }
  return "light";
}
let mode = read();

function apply() {
  const dark = mode === "dark" || (mode === "system" && media().matches);
  document.documentElement.classList.toggle("dark", dark);
  // Older components key off data-theme; keep them in step.
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function setTheme(next: ThemeMode) {
  mode = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* keep working without persistence */
  }
  apply();
  listeners.forEach((listener) => listener());
}

export function initTheme() {
  apply();
  media().addEventListener("change", () => {
    if (mode === "system") {
      apply();
      listeners.forEach((listener) => listener());
    }
  });
}

function snapshot() {
  return `${mode}:${document.documentElement.classList.contains("dark")}`;
}

export function useHubTheme() {
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    () => "light:false",
  );
  const [current, dark] = value.split(":");
  return { mode: current as ThemeMode, dark: dark === "true" };
}
