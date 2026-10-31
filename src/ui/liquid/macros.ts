import { z } from "zod";
const EventSchema = z.object({
  type: z.enum(["down", "up"]),
  key: z.string().min(1).max(64),
  code: z.string().max(64),
  delay: z.number().int().min(0).max(600000),
});
const RecordingSchema = z.object({
  kind: z.literal("atk-key-sequence"),
  version: z.literal(1),
  events: z.array(EventSchema).max(256),
});
export type RecordedKey = z.infer<typeof EventSchema>;
export function readRecording(value?: string): RecordedKey[] | null {
  if (!value) return [];
  try {
    const result = RecordingSchema.safeParse(JSON.parse(value));
    return result.success ? result.data.events : null;
  } catch {
    return null;
  }
}
export function serializeRecording(events: RecordedKey[]) {
  return JSON.stringify(
    RecordingSchema.parse({ kind: "atk-key-sequence", version: 1, events }),
  );
}
export function closeHeldKeys(
  events: RecordedKey[],
  held: Map<string, string>,
): RecordedKey[] {
  return [
    ...events,
    ...[...held].map(([code, key]) => ({
      code,
      key,
      type: "up" as const,
      delay: 0,
    })),
  ].slice(0, 256);
}
