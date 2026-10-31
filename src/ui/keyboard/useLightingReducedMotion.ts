import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
function subscribe(notify: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
function snapshot() {
  return typeof window !== "undefined" && !!window.matchMedia?.(query).matches;
}
export function useLightingReducedMotion() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
