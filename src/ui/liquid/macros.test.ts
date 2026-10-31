import { describe, expect, it } from "vitest";
import { ButtonActionSchema } from "../../types/schema";
import {
  closeHeldKeys,
  readRecording,
  serializeRecording,
  type RecordedKey,
} from "./macros";

describe("map macro metadata", () => {
  it("round-trips a recorded chord through the existing button schema", () => {
    const events: RecordedKey[] = [
      { type: "down", key: "Control", code: "ControlLeft", delay: 0 },
      { type: "down", key: "c", code: "KeyC", delay: 24 },
      { type: "up", key: "c", code: "KeyC", delay: 31 },
      { type: "up", key: "Control", code: "ControlLeft", delay: 12 },
    ];
    const button = ButtonActionSchema.parse({
      id: "side1",
      label: "Back",
      keyClass: 6,
      keyValue1: 0,
      keyValue2: 1,
      description: serializeRecording(events),
    });
    expect(
      readRecording(JSON.parse(JSON.stringify(button)).description),
    ).toEqual(events);
  });

  it("distinguishes an empty recording from legacy or corrupt metadata", () => {
    expect(readRecording()).toEqual([]);
    expect(readRecording("Ctrl+C")).toBeNull();
    expect(
      readRecording('{"kind":"atk-key-sequence","version":2,"events":[]}'),
    ).toBeNull();
    expect(
      readRecording(
        '{"kind":"atk-key-sequence","version":1,"events":[{"type":"down","key":"a","code":"KeyA","delay":-1}]}',
      ),
    ).toBeNull();
  });

  it("adds releases for held keys without mutating recorded input", () => {
    const events: RecordedKey[] = [
      { type: "down", key: "a", code: "KeyA", delay: 0 },
    ];
    expect(closeHeldKeys(events, new Map([["KeyA", "a"]]))).toEqual([
      ...events,
      { type: "up", key: "a", code: "KeyA", delay: 0 },
    ]);
    expect(events).toHaveLength(1);
  });
});
