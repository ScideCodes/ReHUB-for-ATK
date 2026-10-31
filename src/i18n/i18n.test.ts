// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { DICTIONARY, LANGUAGE_ORDER } from "./dictionary";
import { getLanguage, LANGUAGES, setLanguage } from "./language";
import { startTranslator, translate } from "./translator";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("dictionary", () => {
  it("has a non-empty translation for every language on every row", () => {
    expect(LANGUAGE_ORDER).toEqual(LANGUAGES.map((l) => l.code).filter((c) => c !== "en"));
    for (const [english, row] of Object.entries(DICTIONARY)) {
      expect(row, english).toHaveLength(LANGUAGE_ORDER.length);
      for (const value of row) expect(value.trim(), english).not.toBe("");
    }
  });
});

describe("language and translator", () => {
  beforeEach(() => {
    setLanguage("en");
    document.body.innerHTML = "";
  });

  it("remembers the chosen language and sets the document language", () => {
    setLanguage("de");
    expect(getLanguage()).toBe("de");
    expect(localStorage.getItem("atk-hub-language")).toBe("de");
    expect(document.documentElement.lang).toBe("de");
  });

  it("translates exact matches only, ignoring line breaks from JSX", () => {
    setLanguage("fr");
    expect(translate("Settings")).toBe("Paramètres");
    expect(translate("  Settings  ")).toBe("  Paramètres  ");
    expect(translate("Firmware updates are not available\n      in Re-HUB.")).toBe(
      "Les mises à jour du firmware ne sont pas disponibles dans Re-HUB.",
    );
    expect(translate("ATK F1 Ultimate 2.0")).toBeUndefined();
  });

  it("swaps text and labels, switches between languages, and restores English", async () => {
    document.body.innerHTML = '<button aria-label="Settings">Home</button><span translate="no">Home</span>';
    startTranslator();
    const button = document.querySelector("button")!;
    const kept = document.querySelector("span")!;

    setLanguage("de");
    await flush();
    expect(button.textContent).toBe("Start");
    expect(button.getAttribute("aria-label")).toBe("Einstellungen");
    expect(kept.textContent).toBe("Home");

    setLanguage("ja");
    await flush();
    expect(button.textContent).toBe("ホーム");

    // A re-render writes new English text: it is picked up as the new source.
    button.firstChild!.nodeValue = "Help";
    await flush();
    expect(button.textContent).toBe("ヘルプ");

    setLanguage("en");
    await flush();
    expect(button.textContent).toBe("Help");
    expect(button.getAttribute("aria-label")).toBe("Settings");
  });
});
