import { useEffect, useRef, useState } from "react";
import { Palette } from "lucide-react";
import { Button, Dialog, Segmented, Slider, ThemeToggle } from "../index";
import {
  WALLPAPERS,
  APPEARANCE_FILE_EVENT,
  checkUpload,
  readFile,
  checkDecodes,
  saveFile,
  setAppearance,
  useAppearance,
  type FontPreset,
} from "./appearanceStore";

const CUSTOM_FONT = "ATK Hub Custom";

/** Wallpaper behind the console panels plus the chosen UI font. Filter applies to the image layer only. */
export function AppearanceLayer() {
  const appearance = useAppearance();
  const [custom, setCustom] = useState<string | null>(null);
  useEffect(() => {
    if (appearance.wallpaper !== "custom") return setCustom(null);
    let url: string | null = null;
    let generation = 0;
    const load = () => {
      const current = ++generation;
      void readFile("wallpaper").then((blob) => {
        if (current !== generation) return;
        if (url) URL.revokeObjectURL(url);
        url = blob ? URL.createObjectURL(blob) : null;
        setCustom(url);
      }).catch(() => {
        if (current === generation) setCustom(null);
      });
    };
    const saved = (event: Event) => {
      if ((event as CustomEvent).detail === "wallpaper") load();
    };
    load();
    window.addEventListener(APPEARANCE_FILE_EVENT, saved);
    return () => {
      generation++;
      window.removeEventListener(APPEARANCE_FILE_EVENT, saved);
      if (url) URL.revokeObjectURL(url);
    };
  }, [appearance.wallpaper]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.uiFont = appearance.font;
    if (appearance.font !== "custom") return;
    let generation = 0;
    let loaded: FontFace | null = null;
    const load = () => {
      const current = ++generation;
      void readFile("font").then(async (blob) => {
        if (!blob || current !== generation) return;
        const face = await new FontFace(CUSTOM_FONT, await blob.arrayBuffer()).load();
        if (current !== generation) return;
        if (loaded) document.fonts.delete(loaded);
        document.fonts.add(face);
        loaded = face;
      }).catch(() => {});
    };
    const saved = (event: Event) => {
      if ((event as CustomEvent).detail === "font") load();
    };
    load();
    window.addEventListener(APPEARANCE_FILE_EVENT, saved);
    return () => {
      generation++;
      window.removeEventListener(APPEARANCE_FILE_EVENT, saved);
      if (loaded) document.fonts.delete(loaded);
    };
  }, [appearance.font]);
  const preset = WALLPAPERS.find((paper) => paper.id === appearance.wallpaper);
  const src = preset ? `/themes/${preset.file}` : custom;
  if (!src) return null;
  return (
    <div
      className="cx-wallpaper"
      aria-hidden="true"
      style={{
        backgroundImage: `url("${src}")`,
        filter: `blur(${appearance.blur}px) brightness(${appearance.brightness}%)`,
      }}
    />
  );
}

/** Top-bar button + dialog for the original driver's "Theme skin" settings. */
export function AppearanceButton() {
  const appearance = useAppearance();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const image = useRef<HTMLInputElement>(null);
  const font = useRef<HTMLInputElement>(null);
  async function upload(file: File | undefined, kind: "image" | "font") {
    if (!file) return;
    const problem = checkUpload(file, kind) ?? (await checkDecodes(file, kind));
    setError(problem ?? "");
    if (problem) return;
    try {
      await saveFile(kind === "image" ? "wallpaper" : "font", file);
      setAppearance(kind === "image" ? { wallpaper: "custom" } : { font: "custom" });
    } catch {
      setError(kind === "font" ? "Font load failed. Please try another format or file." : "Image could not be saved on this device.");
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Appearance"
        title="Appearance"
        onClick={() => setOpen(true)}
      >
        <Palette size={16} aria-hidden="true" />
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Appearance"
        description="Theme, background and font. Saved on this device only."
        className="cx-appearance"
        footer={
          <>
            <Button
              onClick={() =>
                setAppearance({ wallpaper: "none", blur: 0, brightness: 100, font: "store" })
              }
            >
              Reset to default
            </Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        <div className="cx-appearance-body">
          <section>
            <h3>Theme mode</h3>
            <ThemeToggle />
          </section>
          <section>
            <h3>Background wallpaper</h3>
            <div className="cx-wallpapers" role="radiogroup" aria-label="Background wallpaper">
              {[{ id: "none", name: "None", file: "" }, ...WALLPAPERS].map((paper) => (
                <button
                  key={paper.id}
                  type="button"
                  role="radio"
                  aria-checked={appearance.wallpaper === paper.id}
                  title={paper.name}
                  onClick={() =>
                    setAppearance({
                      wallpaper: paper.id,
                      ...("brightness" in paper ? { brightness: paper.brightness, blur: 0 } : {}),
                    })
                  }
                  style={paper.file ? { backgroundImage: `url("/themes/${paper.file}")` } : undefined}
                >
                  <span>{paper.name}</span>
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={appearance.wallpaper === "custom"}
                onClick={() => image.current?.click()}
              >
                <span>Upload image</span>
              </button>
            </div>
            <input
              ref={image}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(event) => void upload(event.currentTarget.files?.[0], "image")}
            />
          </section>
          <section className="cx-appearance-effects">
            <Slider
              label="Background blur"
              value={appearance.blur}
              min={0}
              max={20}
              step={0.5}
              suffix="px"
              disabled={appearance.wallpaper === "none"}
              onValueChange={(blur) => setAppearance({ blur })}
            />
            <Slider
              label="Background brightness"
              value={appearance.brightness}
              min={10}
              max={150}
              step={5}
              suffix="%"
              disabled={appearance.wallpaper === "none"}
              onValueChange={(brightness) => setAppearance({ brightness })}
            />
          </section>
          <section>
            <h3>Font</h3>
            <Segmented<FontPreset>
              label="Font"
              hideLabel
              value={appearance.font}
              options={[
                { value: "store", label: "Default (Manrope)" },
                { value: "system", label: "System UI" },
                { value: "custom", label: "Custom" },
              ]}
              onValueChange={(value) => (value === "custom" ? font.current?.click() : setAppearance({ font: value }))}
            />
            <p className="cx-appearance-hint">
              Custom fonts: .woff2, .woff, .ttf or .otf, up to 15MB. Please make sure you have the right to use the font.
            </p>
            <input
              ref={font}
              type="file"
              accept=".woff2,.woff,.ttf,.otf"
              hidden
              onChange={(event) => void upload(event.currentTarget.files?.[0], "font")}
            />
          </section>
          {error && (
            <p role="alert" className="cx-appearance-error">
              {error}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
