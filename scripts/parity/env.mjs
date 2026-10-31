// Runs the original driver bundles in Node for parity fixtures (user-approved): minimal browser globals and a stub
// HostServices whose every service is a no-op. Nothing here touches hardware or the network.
import { pathToFileURL } from "node:url";
// The bundles start app-level background work that fails without a real browser; it is unrelated to the controllers.
process.on("unhandledRejection", (reason) => process.env.PARITY_DEBUG && console.error("[background]", reason));
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// PARITY_STATIC: a copy of the bundles (see scripts/parity/keyboards.mjs) instead of the extracted originals.
export const staticDir =
  pathToFileURL(process.env.PARITY_STATIC ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../../extracted/asar_unpacked/static")).href + "/";
globalThis.window ??= globalThis;
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage ??= globalThis.localStorage;
globalThis.dispatchEvent ??= () => true;
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
// Minimal DOM: the keyboard bundle (demoMode.store) registers document listeners and creates elements at import.
const inert = new Proxy(function () { return inert; }, { get: (t, k) => (k === "then" ? undefined : k === Symbol.toPrimitive ? () => 0 : inert), apply: () => inert });
const element = () => Object.assign(new EventTarget(), {
  getContext: () => inert, toDataURL: () => "", width: 0, height: 0,
  style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, dataset: {},
  setAttribute() {}, getAttribute: () => null, removeAttribute() {}, appendChild: (c) => c, removeChild() {}, append() {},
  querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
});
globalThis.document ??= Object.assign(new EventTarget(), {
  createElement: element, createElementNS: element, createTextNode: () => ({}), createComment: () => ({}),
  head: element(), body: element(), documentElement: element(), querySelector: () => null, querySelectorAll: () => [],
  getElementById: () => null, visibilityState: "visible", hidden: false, cookie: "", readyState: "complete",
});
globalThis.navigator ??= { userAgent: "node", language: "en-US", languages: ["en-US"], onLine: false, hid: { addEventListener() {}, removeEventListener() {}, getDevices: async () => [] } };
globalThis.location ??= { href: "http://localhost/", origin: "http://localhost", protocol: "http:", host: "localhost", hostname: "localhost", pathname: "/", search: "", hash: "" };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
for (const name of ["CanvasRenderingContext2D", "HTMLElement", "HTMLCanvasElement", "HTMLImageElement", "Image", "MutationObserver", "ResizeObserver", "IntersectionObserver", "Path2D", "DOMMatrix", "OffscreenCanvas", "Worker", "AudioContext", "FontFace", "Element", "Node", "SVGElement", "HTMLInputElement", "KeyboardEvent", "MouseEvent", "PointerEvent", "WheelEvent", "FocusEvent", "ShadowRoot", "Text", "DragEvent"])
  globalThis[name] ??= class { constructor() {} observe() {} disconnect() {} };
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => "" });
globalThis.CSS ??= { supports: () => false };
globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 0);
globalThis.cancelAnimationFrame ??= clearTimeout;
const noop = new Proxy(function () { return ""; }, { get: (t, k) => (k === "then" ? undefined : noop), apply: () => "" });
const notice = await import(staticDir + "notice--Lh4Twko.js");
notice.s();
notice.l(noop);
