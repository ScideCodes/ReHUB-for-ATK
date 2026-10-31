import { useEffect, useId, useRef } from "react";

interface ModalLayer {
  id: string;
  element: HTMLElement;
  close: () => void;
}
const layers: ModalLayer[] = [];
const savedInert = new Map<HTMLElement, boolean>();
let savedOverflow = "";
let observer: MutationObserver | null = null;
const focusSelector =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

function focusable(element: HTMLElement) {
  return Array.from(
    element.querySelectorAll<HTMLElement>(focusSelector),
  ).filter(
    (node) =>
      node.getClientRects().length > 0 &&
      !node.closest("[inert]") &&
      node.getAttribute("aria-hidden") !== "true",
  );
}

function isolateBackground() {
  const top = layers[layers.length - 1];
  if (!top) return;
  layers.forEach((layer, index) => {
    layer.element
      .closest<HTMLElement>("[data-hub-modal-root]")
      ?.style.setProperty("--modal-depth", String(index));
  });
  Array.from(document.body.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    if (!savedInert.has(child)) savedInert.set(child, child.inert);
    child.inert = child.contains(top.element) ? savedInert.get(child)! : true;
  });
}

export function useDialog(open: boolean, onClose: () => void) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const element = dialogRef.current;
    if (!open || !element) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (layers.length === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      observer = new MutationObserver(isolateBackground);
      observer.observe(document.body, { childList: true });
    }
    const layer: ModalLayer = { id, element, close: () => closeRef.current() };
    layers.push(layer);
    isolateBackground();
    const focusFirst = () => {
      const preferred = element.querySelector<HTMLElement>(
        "[data-autofocus]:not([disabled])",
      );
      (preferred ?? focusable(element)[0] ?? element).focus({
        preventScroll: true,
      });
    };
    const frame = window.requestAnimationFrame(focusFirst);
    const onKeyDown = (event: KeyboardEvent) => {
      if (layers[layers.length - 1] !== layer || event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        layer.close();
      } else if (event.key === "Tab") {
        const targets = focusable(element);
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (!first) {
          event.preventDefault();
          element.focus();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !element.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !element.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (
        layers[layers.length - 1] === layer &&
        event.target instanceof Node &&
        !element.contains(event.target)
      )
        focusFirst();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocus);
      const wasTop = layers[layers.length - 1] === layer;
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      if (layers.length === 0) {
        observer?.disconnect();
        observer = null;
        savedInert.forEach((inert, node) => {
          node.inert = inert;
        });
        savedInert.clear();
        document.body.style.overflow = savedOverflow;
      } else isolateBackground();
      if (wasTop) {
        if (previousFocus?.isConnected && !previousFocus.closest("[inert]"))
          previousFocus.focus({ preventScroll: true });
        else layers[layers.length - 1]?.element.focus({ preventScroll: true });
      }
    };
  }, [open, id]);

  return {
    dialogRef,
    titleId: `${id}-title`,
    descriptionId: `${id}-description`,
  };
}
