import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ATK68 } from "../../devices/registry";
import { createKeyboardSettings } from "../../devices/keyboardSettings";
import {
  KeysControls,
  SettingsControls,
  LightingControls,
  TriggerControls,
} from "./BasicControls";
import { AdvancedControls } from "./AdvancedControls";
import { KeyMatrix } from "./KeyMatrix";

describe("capability-driven keyboard UI", () => {
  const props = {
    device: ATK68,
    settings: createKeyboardSettings(),
    edit: () => {},
    selected: 0,
    layer: 0,
    setLayer: () => {},
    scope: "key" as const,
    onScopeChange: () => {},
    onSelectKey: () => {},
    paintColor: "#ffffff",
    onPaintColorChange: () => {},
    animatePreview: true,
    onAnimatePreviewChange: () => {},
  };
  it("renders the real matrix and selected key", () => {
    const html = renderToStaticMarkup(
      <KeyMatrix {...props} onSelect={() => {}} />,
    );
    expect((html.match(/aria-pressed=/g) ?? []).length).toBe(
      props.settings.keys.length,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Backspace");
    expect(html).toContain("--key-w:2.2");
    expect(html).toContain("--key-w:6.7");
    expect(html).toContain("--key-mr:1.1");
    expect(html).toContain('aria-label="Scrollable keyboard layout"');
    expect(html).toContain("Selected key");
  });
  it("renders layers and assignment controls in one toolbar", () => {
    const html = renderToStaticMarkup(<KeysControls {...props} />);
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('role="radiogroup"');
    expect((html.match(/type="radio"/g) ?? []).length).toBe(4);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("Action class");
  });
  it("offers only listed advanced families and no actions without capabilities", () => {
    const html = renderToStaticMarkup(
      <AdvancedControls
        {...props}
        device={{ ...ATK68, capabilities: ["socd"] }}
      />,
    );
    expect(html).toContain("SOCD");
    expect(html).not.toContain("Mod tap");
    expect(html).not.toContain('role="radiogroup"');
    const empty = renderToStaticMarkup(
      <AdvancedControls {...props} device={{ ...ATK68, capabilities: [] }} />,
    );
    expect(empty).toContain("does not list advanced actions");
    expect(empty).not.toContain("Add to selected key");
  });
  it("exposes advanced layers and a useful empty state", () => {
    const html = renderToStaticMarkup(<AdvancedControls {...props} />);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain("No mod tap action on this key");
    expect(html).toContain("0 of 20 actions used");
    expect(html).toContain("Local only - not sent to device");
    expect(html).toContain("Shared-slot ownership");
  });
  it("marks assigned keys without altering their selection", () => {
    const html = renderToStaticMarkup(
      <KeyMatrix {...props} onSelect={() => {}} assignments={[1, 2]} />,
    );
    expect((html.match(/data-assigned="true"/g) ?? []).length).toBe(2);
    expect(
      (html.match(/aria-description="Advanced action assigned"/g) ?? []).length,
    ).toBe(2);
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
  });
  it("shows source-backed options and hides unsupported settings families", () => {
    const html = renderToStaticMarkup(<SettingsControls {...props} />);
    expect(html).toContain("Windows key lock");
    expect(html).toContain("6-key rollover");
    expect(html).toContain("RGB area byte");
    expect(html).not.toContain("Sleep");
    expect(html).not.toContain("Debounce");
    const pollingOnly = renderToStaticMarkup(
      <SettingsControls
        {...props}
        device={{ ...ATK68, capabilities: ["pollingRate"] }}
      />,
    );
    expect(pollingOnly).toContain("Report rate");
    expect(pollingOnly).not.toContain("Windows key lock");
    const optionsOnly = renderToStaticMarkup(
      <SettingsControls
        {...props}
        device={{ ...ATK68, capabilities: ["keyboardOptions"] }}
      />,
    );
    expect(optionsOnly).not.toContain("Report rate");
    expect(optionsOnly).toContain("Windows key lock");
  });
  it("hides absent controls instead of showing unusable features", () => {
    const device = { ...ATK68, capabilities: [] };
    expect(
      renderToStaticMarkup(<SettingsControls {...props} device={device} />),
    ).not.toContain("Polling rate");
    expect(
      renderToStaticMarkup(<TriggerControls {...props} device={device} />),
    ).not.toContain("Rapid trigger");
    expect(
      renderToStaticMarkup(<LightingControls {...props} device={device} />),
    ).not.toContain("Paint color");
  });
});
