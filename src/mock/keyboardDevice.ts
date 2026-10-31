import type { DeviceDefinition } from "../types/schema";
import {
  createKeyboardSettings,
  KeyboardSettingsSchema,
} from "../devices/keyboardSettings";
import { layoutFor } from "../devices/keyboardLayouts";

export class KeyboardMock {
  private settings;
  calibration: "idle" | "running" | "complete" = "idle";
  constructor(readonly definition: DeviceDefinition) {
    if (definition.kind !== "keyboard")
      throw new Error("Unsupported keyboard mock");
    // The mock holds this model's own key layout, like the map editing it.
    this.settings = createKeyboardSettings(layoutFor(definition).rows);
  }
  read() {
    return structuredClone(this.settings);
  }
  apply(value: unknown, { supportedOnly = false } = {}) {
    const next = KeyboardSettingsSchema.parse(value);
    if (supportedOnly) {
      const has = (capability: string) =>
        this.definition.capabilities?.includes(capability);
      if (!has("pollingRate")) next.pollingRate = this.settings.pollingRate;
      if (!has("keyboardOptions"))
        next.options = structuredClone(this.settings.options);
      if (!has("deadZones")) next.deadZone = { ...this.settings.deadZone };
      if (!has("rgb")) next.light = { ...this.settings.light };
      if (!has("macros")) next.macros = structuredClone(this.settings.macros);
      next.keys.forEach((key, index) => {
        const old = this.settings.keys[index];
        if (!has("keyRemap")) key.layers = structuredClone(old.layers);
        if (!has("actuation")) key.actuation = old.actuation;
        if (!has("rapidTrigger")) key.rt = { ...old.rt };
        if (!has("perKeyRgb")) key.color = old.color;
      });
      next.advanced = next.advanced.filter((action) => has(action.kind));
    }
    const needs: [string, unknown, unknown][] = [
      ["pollingRate", next.pollingRate, this.settings.pollingRate],
      ["keyboardOptions", next.options, this.settings.options],
      ["deadZones", next.deadZone, this.settings.deadZone],
      ["rgb", next.light, this.settings.light],
      ["macros", next.macros, this.settings.macros],
    ];
    next.keys.forEach((key, i) => {
      const old = this.settings.keys[i];
      needs.push(
        ["keyRemap", key.layers, old.layers],
        ["actuation", key.actuation, old.actuation],
        ["rapidTrigger", key.rt, old.rt],
        ["perKeyRgb", key.color, old.color],
      );
    });
    for (const kind of ["mt", "tgl", "dks", "rs", "socd", "oks"])
      needs.push([
        kind,
        next.advanced.filter((a) => a.kind === kind),
        this.settings.advanced.filter((a) => a.kind === kind),
      ]);
    for (const [capability, after, before] of needs)
      if (
        JSON.stringify(after) !== JSON.stringify(before) &&
        !this.definition.capabilities?.includes(capability)
      )
        throw new Error(`Missing capability: ${capability}`);
    this.settings = next;
    return this.read();
  }
  startCalibration() {
    if (!this.definition.capabilities?.includes("calibration"))
      throw new Error("Missing calibration capability");
    this.calibration = "running";
  }
  finishCalibration() {
    if (this.calibration !== "running")
      throw new Error("Start calibration first");
    this.calibration = "complete";
  }
}
