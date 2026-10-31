import { DesktopSettings } from '../desktop/DesktopControls';
import { DeviceReportButton } from '../support/DeviceReportDialog';
import { useRef, useState } from "react";
import { Check, ChevronLeft, ExternalLink, ImagePlus, Moon, Palette, Sun, Type, Wallpaper as WallpaperIcon } from "lucide-react";
import { AppearanceLayer } from "../ui/console/Appearance";
import {
  WALLPAPERS,
  checkUpload,
  saveFile,
  setAppearance,
  useAppearance,
} from "../ui/console/appearanceStore";
import { AtkLogo } from "./Header";
import { Dropdown, Seg, Slider } from "./controls";
import { setTheme, useHubTheme } from "./theme";
import { LANGUAGES, setLanguage, useLanguage, type LanguageCode } from "../i18n/language";

export const Wallpaper = AppearanceLayer;

function PageFrame({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="hub-body">
      <main className="hub-main hp-page">
        <div className="hp-top">
          <button type="button" className="hp-back" onClick={onBack}>
            <ChevronLeft size={18} /> Back
          </button>
        </div>
        <div className="hp-content">{children}</div>
      </main>
    </div>
  );
}

// The official driver can flash firmware; Re-HUB never sends bootloader commands.
const OFFICIAL_DRIVER = "https://hub.atk.pro/";

export function SettingsPage({ onBack }: { onBack: () => void }) {
  const theme = useHubTheme();
  const language = useLanguage();
  return (
    <PageFrame onBack={onBack}>
      <section className="hp-card">
        <h2>Interface Settings</h2>
        <div className="hp-two">
          <div>
            Language
            <Dropdown
              label="Language"
              value={language}
              options={LANGUAGES.map(({ code, name }) => ({ value: code, label: name }))}
              onChange={(code) => setLanguage(code as LanguageCode)}
            />
          </div>
          <div>
            Theme
            <Seg
              label="Theme"
              value={theme.mode}
              onChange={setTheme}
              options={[
                { value: "light", label: <><Sun size={14} /> Light</> },
                { value: "dark", label: <><Moon size={14} /> Dark</> },
                { value: "system", label: "Follow system" },
              ]}
            />
          </div>
        </div>
      </section>
      <DesktopSettings />
      <section className="hp-card">
        <h2>Community device support</h2>
        <p className="h-desc">Device missing or partly supported? Review and share a device report on GitHub. No data is uploaded automatically.</p>
        <DeviceReportButton />
      </section>
      <section className="hp-card">
        <h2>Firmware Tools</h2>
        <p className="h-desc">Firmware updates are not available in Re-HUB.</p>
        <p className="h-desc">
          Updating firmware puts the device into bootloader (DFU) mode, and a failed or interrupted write there can leave it unusable.
          Re-HUB permanently blocks those commands until they have been tested on real hardware.
        </p>
        <p className="h-desc">To update firmware, use the official ATK web driver, then come back here for your settings.</p>
        <a className="h-btn primary hp-link" href={OFFICIAL_DRIVER} target="_blank" rel="noopener noreferrer">
          Open the official ATK web driver <ExternalLink size={14} />
        </a>
      </section>
      <section className="hp-card">
        <h2>Help</h2>
        <p className="h-desc">
          Use a 2.4G receiver or a cable connection; Bluetooth is not recognized. The desktop app includes WebHID. For the web version, use Chrome, Edge, Brave or Opera.
        </p>
        <a className="h-btn" href="https://www.yuque.com/yunyanyingraorenjian/atk" target="_blank" rel="noopener noreferrer">
          ATK help center
        </a>
      </section>
      <section className="hp-card">
        <h2>About Re-HUB</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="hub-logo" style={{ pointerEvents: "none" }}>
            <AtkLogo />
          </span>
          <span className="h-desc">Re-HUB for ATK · unofficial open-source WebHID configurator · no telemetry</span>
        </div>
      </section>
    </PageFrame>
  );
}

export function WallpaperPage({ onBack }: { onBack: () => void }) {
  const appearance = useAppearance();
  const theme = useHubTheme();
  const upload = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const papers = [{ id: "none", name: "Default", file: "" }, ...WALLPAPERS];
  return (
    <PageFrame onBack={onBack}>
      <div className="hp-wall">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="hp-card">
            <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span><Palette size={16} /> Theme Color</span>
              <button type="button" className="h-btn" onClick={() => (setTheme("light"), setAppearance({ wallpaper: "none", blur: 0, brightness: 100, font: "store" }))}>
                Reset
              </button>
            </h2>
            <button type="button" className="hp-mode" onClick={() => setTheme(theme.dark ? "light" : "dark")}>
              <small>Theme Mode</small> {theme.dark ? "Dark" : "Light"}
              <span style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: 3, background: theme.dark ? "#fff" : "#000" }} />
            </button>
          </section>
          <section className="hp-card">
            <h2><Type size={16} /> Font settings</h2>
            <Seg
              label="Font"
              value={appearance.font === "custom" ? "store" : appearance.font}
              onChange={(font) => setAppearance({ font })}
              options={[{ value: "store", label: "Default" }, { value: "system", label: "System" }]}
            />
            <div className="hp-font-sample">
              <strong>ALL FOR GAMING</strong>
              <span>Born for Gaming</span>
            </div>
            <p className="h-desc" style={{ textAlign: "center" }}>Default (OPPO Sans + HarmonyOS)</p>
          </section>
        </div>
        <div>
          <section className="hp-card">
            <h2><ImagePlus size={16} /> Custom Background Effects</h2>
            <div className="hp-two">
              <div className="hp-effect">
                <span>Background Blur <b>{appearance.blur}%</b></span>
                <Slider
                  label="Background Blur"
                  value={appearance.blur}
                  min={0}
                  max={20}
                  step={0.5}
                  onChange={(blur) => setAppearance({ blur }, { persist: false })}
                  onCommit={(blur) => setAppearance({ blur })}
                />
              </div>
              <div className="hp-effect">
                <span>Background Brightness <b>{appearance.brightness}%</b></span>
                <Slider
                  label="Background Brightness"
                  value={appearance.brightness}
                  min={10}
                  max={150}
                  step={5}
                  onChange={(brightness) => setAppearance({ brightness }, { persist: false })}
                  onCommit={(brightness) => setAppearance({ brightness })}
                />
              </div>
            </div>
          </section>
          <h2 className="h-title" style={{ margin: "24px 0 16px" }}>
            <WallpaperIcon size={16} /> Background Wallpaper
          </h2>
          <div className="hp-papers">
            {papers.map((paper) => (
              <button key={paper.id} type="button" aria-pressed={appearance.wallpaper === paper.id} onClick={() => setAppearance({ wallpaper: paper.id, ...("brightness" in paper && { brightness: paper.brightness }) })}>
                <span className="img" style={paper.file ? { backgroundImage: `url("/themes/${paper.file}")` } : undefined}>
                  {!paper.file && <AtkLogo />}
                  {appearance.wallpaper === paper.id && <Check size={14} className="tick" />}
                </span>
                {paper.name}
              </button>
            ))}
            <button type="button" aria-pressed={appearance.wallpaper === "custom"} onClick={() => upload.current?.click()}>
              <span className="img"><ImagePlus size={28} /></span>
              Custom
            </button>
          </div>
          {error && <p role="alert" style={{ color: "var(--color-error)" }}>{error}</p>}
          <input
            ref={upload}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              const problem = checkUpload(file, "image");
              if (problem) return setError(problem);
              setError("");
              await saveFile("wallpaper", file);
              setAppearance({ wallpaper: "custom" });
            }}
          />
        </div>
      </div>
    </PageFrame>
  );
}
