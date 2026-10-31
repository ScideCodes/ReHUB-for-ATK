import { z } from "zod";
import { SettingsMapSchema, type SettingsMap } from "../../types/schema";

export const MAP_FILE_VERSION = 1;
const FileSchema = z.object({
  schemaVersion: z.literal(MAP_FILE_VERSION),
  maps: z.array(SettingsMapSchema),
});

export function validateMaps(maps: SettingsMap[]) {
  const ids = new Set<string>();
  for (const map of maps) {
    SettingsMapSchema.parse(map);
    if (!map.id.trim() || ids.has(map.id) || map.id in Object.prototype)
      throw new Error(
        "Map IDs must be nonempty and unique, without reserved property names.",
      );
    if (!map.name.trim()) throw new Error("Each map needs a name.");
    if (!/^#[0-9a-f]{6}$/i.test(map.color))
      throw new Error(`Invalid color in “${map.name}”.`);
    const stages = map.settings.dpiStages;
    if (
      stages.length < 1 ||
      stages.length > 8 ||
      map.settings.activeDpiStage >= stages.length
    )
      throw new Error(`Invalid DPI stages in “${map.name}”.`);
    ids.add(map.id);
  }
  return maps;
}

// Same bound as keyboard backups: imported files are untrusted, and parse/validation cost grows with size.
const MAX_MAP_FILE_CHARS = 4_000_000;

export function parseMapFile(text: string): SettingsMap[] {
  if (text.length > MAX_MAP_FILE_CHARS) throw new Error("Map file exceeds 4 MB.");
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  // Existing array exports migrate to the versioned envelope without changing settings.
  const migrated = Array.isArray(input)
    ? { schemaVersion: MAP_FILE_VERSION, maps: input }
    : input;
  const result = FileSchema.safeParse(migrated);
  if (!result.success)
    throw new Error("Unsupported map version or invalid settings.");
  return validateMaps(result.data.maps);
}

export function serializeMaps(maps: SettingsMap[]) {
  return JSON.stringify(
    { schemaVersion: MAP_FILE_VERSION, maps: validateMaps(maps) },
    null,
    2,
  );
}

export function downloadMaps(maps: SettingsMap[]) {
  const blob = new Blob([serializeMaps(maps)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "atk-maps.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
