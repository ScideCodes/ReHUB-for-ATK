import { useSyncExternalStore } from "react";

/** The original driver's language list, in its order. */
export const LANGUAGES = [
  { code: "zh-CN", name: "简体中文" },
  { code: "en", name: "English" },
  { code: "ko", name: "한국어" },
  { code: "ru", name: "Русский" },
  { code: "ja", name: "日本語" },
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "zh-TW", name: "繁體中文" },
  { code: "tr", name: "Türkçe" },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const KEY = "atk-hub-language";
const listeners = new Set<() => void>();
const isCode = (value: unknown): value is LanguageCode => LANGUAGES.some((l) => l.code === value);

function read(): LanguageCode {
  try {
    const stored = localStorage.getItem(KEY);
    if (isCode(stored)) return stored;
  } catch {
    /* storage blocked: fall back to English */
  }
  return "en";
}
let current: LanguageCode = typeof window === "undefined" ? "en" : read();
if (typeof document !== "undefined") document.documentElement.lang = current;

export function getLanguage() {
  return current;
}

export function setLanguage(code: LanguageCode) {
  if (!isCode(code) || code === current) return;
  current = code;
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* keep working for this session */
  }
  document.documentElement.lang = code;
  listeners.forEach((listener) => listener());
}

export function onLanguageChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLanguage() {
  return useSyncExternalStore(onLanguageChange, getLanguage, () => "en" as LanguageCode);
}
