import { useRef, useState } from "react";
import { Check, ChevronLeft, ImagePlus, Moon, Palette, Sun, Type, Wallpaper as WallpaperIcon } from "lucide-react";
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

export const Wallpaper = AppearanceLayer;

function PageFrame({ onBack, nav, active, onNav, children }: {
  onBack: () => void;
  nav: string[];
  active: string;
  onNav: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="hub-body">
      <main className="hub-main hp-page">
        <aside className="hp-nav">
          <button type="button" className="hp-back" onClick={onBack}>
            <ChevronLeft size={18} /> Back
          </button>
          <div>
            {nav.map((item) => (
              <button key={item} type="button" className="hp-nav-item" aria-current={item === active ? "page" : undefined} onClick={() => onNav(item)}>
                {item}
              </button>
            ))}
          </div>
        </aside>
        <div className="hp-content">{children}</div>
      </main>
    </div>
  );
}

const SETTINGS_NAV = ["Interface Settings", "Firmware Tools", "Help", "About ATK HUB"];
const FIRMWARE_TOOLS = [
  "Mouse Firmware Tool", "Firmware Tools for 54 Series Mice", "Mouse Pairing",
  "Firmware Tool for Magnetic Keyboard of Strong Wind Series", "ATK68 V2 / ATK68 V2 S",
  "A87 Pro/ A98 Pro", "ATK RS7", "ATK68 V2 PRO", "YOGO 75", "ATK Horizon",
];

export function SettingsPage({ onBack }: { onBack: () => void }) {
  const theme = useHubTheme();
  const [section, setSection] = useState(SETTINGS_NAV[0]);
  const jump = (id: string) => {
    setSection(id);
    document.getElementById(`hp-${id.replace(/\s/g, "-")}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <PageFrame onBack={onBack} nav={SETTINGS_NAV} active={section} onNav={jump}>
      <section className="hp-card" id="hp-Interface-Settings">
        <h2>Interface Settings</h2>
        <div className="hp-two">
          <div>
            Language
            <Dropdown label="Language" value="en" options={[{ value: "en", label: "English" }]} onChange={() => {}} />
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
      <section className="hp-card" id="hp-Firmware-Tools">
        <h2>Firmware Tools</h2>
        <p className="h-desc">Firmware update and DFU tools stay blocked: this build never sends the bootloader command (0x0D).</p>
        <div className="hp-tools">
          {FIRMWARE_TOOLS.map((tool) => (
            <button key={tool} type="button" className="h-btn lg" disabled title="Blocked by Safe Mode">
              {tool}
            </button>
          ))}
        </div>
      </section>
      <section className="hp-card" id="hp-Help">
        <h2>Help</h2>
        <p className="h-desc">
          Use a 2.4G receiver or a cable connection; Bluetooth is not recognized. Open Chrome, Edge, Brave or Opera for WebHID.
        </p>
        <a className="h-btn" href="https://www.yuque.com/yunyanyingraorenjian/atk" target="_blank" rel="noopener noreferrer">
          ATK help center
        </a>
      </section>
      <section className="hp-card" id="hp-About-ATK-HUB">
        <h2>About ATK HUB</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="hub-logo" style={{ pointerEvents: "none" }}>
            <AtkLogo />
          </span>
          <span className="h-desc">Local WebHID configurator · layout of ATK HUB 3.2.29 · no telemetry</span>
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
    <PageFrame onBack={onBack} nav={["HUB Theme Personalization"]} active="HUB Theme Personalization" onNav={() => {}}>
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
                <Slider label="Background Blur" value={appearance.blur} min={0} max={20} step={0.5} onCommit={(blur) => setAppearance({ blur })} />
              </div>
              <div className="hp-effect">
                <span>Background Brightness <b>{appearance.brightness}%</b></span>
                <Slider label="Background Brightness" value={appearance.brightness} min={10} max={150} step={5} onCommit={(brightness) => setAppearance({ brightness })} />
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
