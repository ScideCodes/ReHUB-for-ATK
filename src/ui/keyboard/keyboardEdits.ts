import type { KeyboardSettings } from "../../devices/keyboardSettings";
export type KeyboardEdit = {
  field: keyof KeyboardSettings;
  value: unknown;
  writable: boolean;
  apply: (settings: KeyboardSettings) => void;
};
export function keyboardFields(settings: KeyboardSettings) {
  const fields = new Map<string, KeyboardEdit>();
  function add<T>(
    field: keyof KeyboardSettings,
    path: string,
    value: T,
    writable: boolean,
    write: (s: KeyboardSettings, v: T) => void,
  ) {
    const copy = structuredClone(value);
    fields.set(path, {
      field,
      value: copy,
      writable,
      apply: (s) => write(s, structuredClone(copy)),
    });
  }
  add("pollingRate", "pollingRate", settings.pollingRate, true, (s, v) => {
    s.pollingRate = v;
  });
  for (const key of Object.keys(
    settings.options,
  ) as (keyof KeyboardSettings["options"])[])
    add(
      "options",
      `options.${key}`,
      settings.options[key],
      key !== "rgbArea",
      (s, v) => {
        Object.assign(s.options, { [key]: v });
      },
    );
  for (const key of ["top", "bottom"] as const)
    add("deadZone", `deadZone.${key}`, settings.deadZone[key], true, (s, v) => {
      s.deadZone[key] = v;
    });
  for (const key of ["mode", "speed", "brightness", "color"] as const)
    add("light", `light.${key}`, settings.light[key], true, (s, v) => {
      Object.assign(s.light, { [key]: v });
    });
  settings.keys.forEach((key, index) => {
    add("keys", `key.${index}.actuation`, key.actuation, true, (s, v) => {
      s.keys[index].actuation = v;
    });
    add("keys", `key.${index}.color`, key.color, true, (s, v) => {
      s.keys[index].color = v;
    });
    for (const part of ["on", "release", "press"] as const)
      add("keys", `key.${index}.rt.${part}`, key.rt[part], true, (s, v) => {
        Object.assign(s.keys[index].rt, { [part]: v });
      });
    key.layers.forEach((code, layer) =>
      add(
        "keys",
        `key.${index}.layer.${layer}`,
        code,
        code[0] === 0,
        (s, v) => {
          s.keys[index].layers[layer] = v;
        },
      ),
    );
  });
  settings.macros.forEach((macro, index) =>
    add("macros", `macros.${index}`, macro, false, (s, v) => {
      s.macros[index] = v;
    }),
  );
  add("advanced", "advanced", settings.advanced, false, (s, v) => {
    s.advanced = v;
  });
  return fields;
}
export function keyboardEdits(
  before: KeyboardSettings,
  after: KeyboardSettings,
) {
  const previous = keyboardFields(before);
  return new Map(
    [...keyboardFields(after)].filter(
      ([path, change]) =>
        JSON.stringify(change.value) !==
        JSON.stringify(previous.get(path)?.value),
    ),
  );
}
