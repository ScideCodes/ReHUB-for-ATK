/**
 * Global motion layer. Imported once (from Slider.tsx) so it needs no mounting.
 * - publishes the pointer position as --fx-x / --fx-y on .lg-backdrop and .lg-device-portrait (avoids <html> style recalc cascade)
 * - batches spotlight --mx / --my writes and caches surface rects inside a single requestAnimationFrame
 * - pauses animations and pointer tracking when the tab is hidden or prefers-reduced-motion is active
 * - adds a press ripple to buttons and DPI stage cards
 */
const SPOTLIGHT =
  ".lg-map-rail, .lg-device-panel, .lg-tabs, .glass-inset, .lg-stage-strip > *";
const RIPPLE = ".hub-button, .lg-stage-strip > *";

let started = false;

function startLiquidFx() {
  if (
    started ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  )
    return;
  started = true;

  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  let frame = 0;
  let clientX = window.innerWidth * 0.5;
  let clientY = window.innerHeight * 0.5;
  let winW = window.innerWidth || 1;
  let winH = window.innerHeight || 1;

  let activeSurface: HTMLElement | null = null;
  let activeBox: DOMRect | null = null;
  let rawTarget: EventTarget | null = null;

  let backdropEl: HTMLElement | null = null;
  let portraitEl: HTMLElement | null = null;

  const syncVisibility = () => {
    if (document.hidden) {
      root.classList.add("fx-paused");
    } else {
      root.classList.remove("fx-paused");
    }
    const paused = document.hidden || reduce.matches;
    root.dataset.fxPaused = paused ? "true" : "false";
    if (paused && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
  syncVisibility();
  document.addEventListener("visibilitychange", syncVisibility);
  reduce.addEventListener?.("change", syncVisibility);

  window.addEventListener(
    "resize",
    () => {
      winW = window.innerWidth || 1;
      winH = window.innerHeight || 1;
      activeBox = null;
    },
    { passive: true },
  );

  window.addEventListener(
    "scroll",
    () => {
      activeBox = null;
    },
    { passive: true, capture: true },
  );

  const flush = () => {
    frame = 0;
    const fxX = (clientX / winW).toFixed(3);
    const fxY = (clientY / winH).toFixed(3);

    const targetEl = rawTarget instanceof Element ? rawTarget : null;
    const surface = targetEl?.closest<HTMLElement>(SPOTLIGHT) ?? null;

    if (surface !== activeSurface) {
      activeSurface = surface;
      activeBox = activeSurface ? activeSurface.getBoundingClientRect() : null;
    } else if (activeSurface && !activeBox) {
      activeBox = activeSurface.getBoundingClientRect();
    }

    if (!backdropEl || !backdropEl.isConnected) {
      backdropEl = document.querySelector<HTMLElement>(".lg-backdrop");
    }
    if (!portraitEl || !portraitEl.isConnected) {
      portraitEl = document.querySelector<HTMLElement>(".lg-device-portrait");
    }

    if (backdropEl) {
      backdropEl.style.setProperty("--fx-x", fxX);
      backdropEl.style.setProperty("--fx-y", fxY);
    }
    if (portraitEl) {
      portraitEl.style.setProperty("--fx-x", fxX);
      portraitEl.style.setProperty("--fx-y", fxY);
    }

    if (activeSurface && activeBox) {
      activeSurface.style.setProperty(
        "--mx",
        `${Math.round(clientX - activeBox.left)}px`,
      );
      activeSurface.style.setProperty(
        "--my",
        `${Math.round(clientY - activeBox.top)}px`,
      );
    }
  };

  window.addEventListener(
    "pointermove",
    (event) => {
      if (reduce.matches || document.hidden || event.pointerType === "touch")
        return;
      clientX = event.clientX;
      clientY = event.clientY;
      rawTarget = event.target;
      if (!frame) frame = requestAnimationFrame(flush);
    },
    { passive: true },
  );

  window.addEventListener(
    "pointerdown",
    (event) => {
      if (reduce.matches || document.hidden) return;
      const target = event.target as Element | null;
      const host = target?.closest?.(RIPPLE);
      if (!(host instanceof HTMLElement) || host.matches(":disabled")) return;
      const box = host.getBoundingClientRect();
      const size = Math.max(box.width, box.height) * 2;
      const ripple = document.createElement("span");
      ripple.className = "fx-ripple";
      ripple.setAttribute("aria-hidden", "true");
      ripple.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - box.left - size / 2}px;top:${event.clientY - box.top - size / 2}px`;
      host.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), {
        once: true,
      });
    },
    { passive: true },
  );
}

startLiquidFx();
