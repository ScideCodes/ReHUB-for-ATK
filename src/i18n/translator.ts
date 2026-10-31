import { getLanguage, onLanguageChange, type LanguageCode } from "./language";
import { DICTIONARY, LANGUAGE_ORDER } from "./dictionary";

// Interface strings are authored in English. Rather than threading a t() call through every component, the page's
// text nodes and labels are swapped in place for exact dictionary matches; React's own updates are re-translated by
// the observer. Unknown strings (device names, numbers, user data) stay as they are.
const ATTRIBUTES = ["aria-label", "title", "placeholder", "data-tip", "alt"] as const;
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);

// English source plus the value we last wrote. A DOM value that differs from what we wrote came from React.
type Slot = { source: string; written: string };
const textSlots = new WeakMap<Text, Slot>();
const attrSlots = new WeakMap<Element, Map<string, Slot>>();
const tables = new Map<LanguageCode, Map<string, string> | null>();
let observer: MutationObserver | null = null;

function tableFor(code: LanguageCode) {
  if (tables.has(code)) return tables.get(code)!;
  const column = LANGUAGE_ORDER.indexOf(code as (typeof LANGUAGE_ORDER)[number]);
  if (column < 0) {
    tables.set(code, null);
    return null;
  }
  const map = new Map<string, string>();
  for (const [english, translations] of Object.entries(DICTIONARY)) {
    const value = translations[column];
    if (value) map.set(english, value);
  }
  tables.set(code, map);
  return map;
}

/** Translation for one English string, keeping surrounding whitespace; undefined when there is none. */
export function translate(english: string, code: LanguageCode = getLanguage()) {
  const map = tableFor(code);
  const key = english.trim();
  // JSX text that spans lines keeps its newlines and indentation; match on single spaces.
  const value = key && map?.get(key.replace(/\s+/g, " "));
  return value ? english.replace(key, value) : undefined;
}

function skipped(node: Node) {
  for (let el = node instanceof Element ? node : node.parentElement; el; el = el.parentElement) {
    if (SKIP.has(el.tagName) || el.getAttribute("translate") === "no") return true;
  }
  return false;
}

function settle(slot: Slot | undefined, current: string): Slot {
  const source = slot && current === slot.written ? slot.source : current;
  return { source, written: translate(source) ?? source };
}

function translateText(node: Text) {
  if (skipped(node)) return;
  const current = node.nodeValue ?? "";
  const slot = settle(textSlots.get(node), current);
  textSlots.set(node, slot);
  if (slot.written !== current) node.nodeValue = slot.written;
}

function translateAttributes(el: Element) {
  if (skipped(el)) return;
  for (const name of ATTRIBUTES) {
    const current = el.getAttribute(name);
    if (current === null) continue;
    let slots = attrSlots.get(el);
    if (!slots) attrSlots.set(el, (slots = new Map()));
    const slot = settle(slots.get(name), current);
    slots.set(name, slot);
    if (slot.written !== current) el.setAttribute(name, slot.written);
  }
}

function walk(root: Node) {
  if (root instanceof Text) return translateText(root);
  if (!(root instanceof Element)) return;
  translateAttributes(root);
  const tree = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = tree.nextNode(); node; node = tree.nextNode()) {
    if (node instanceof Text) translateText(node);
    else translateAttributes(node as Element);
  }
}

function apply() {
  observer?.disconnect();
  walk(document.body);
  observer?.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRIBUTES] });
}

/** Starts translating the page and keeps it in step with the selected language. Call once at startup. */
export function startTranslator() {
  if (typeof document === "undefined" || observer) return;
  observer = new MutationObserver((records) => {
    observer!.disconnect();
    for (const record of records) {
      if (record.type === "childList") record.addedNodes.forEach(walk);
      else if (record.type === "characterData") translateText(record.target as Text);
      else translateAttributes(record.target as Element);
    }
    observer!.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRIBUTES] });
  });
  apply();
  onLanguageChange(apply);
}
