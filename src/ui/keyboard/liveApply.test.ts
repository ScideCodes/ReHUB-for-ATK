import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createKeyboardSettings } from "../../devices/keyboardSettings";
import type {
  KeyboardClient,
  KeyboardSnapshot,
} from "../../hid/keyboardClient";
import { createKeyboardLiveApply } from "./liveApply";

const initial = () =>
  ({
    settings: createKeyboardSettings(),
    firmware: "1",
    unreadFields: [],
    warnings: [],
  }) as KeyboardSnapshot;
let client: KeyboardClient,
  context: {
    client: KeyboardClient | null;
    mapId: string;
    enabled: boolean;
    busy: boolean;
    dragging: boolean;
  };
let live: ReturnType<typeof createKeyboardLiveApply>;
const state = vi.fn(),
  applied: ReturnType<typeof createKeyboardSettings>[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  applied.length = 0;
  state.mockClear();
  const snapshot = initial();
  client = {
    connected: true,
    lastSnapshot: snapshot,
    snapshot: vi.fn(async () => snapshot),
    apply: vi.fn(async (settings) => {
      applied.push(structuredClone(settings));
      snapshot.settings = structuredClone(settings);
      return { packets: [{}], skipped: [] };
    }),
  } as unknown as KeyboardClient;
  context = {
    client,
    mapId: "one",
    enabled: true,
    busy: false,
    dragging: false,
  };
  live = createKeyboardLiveApply({
    context: () => context,
    state,
    snapshot: vi.fn(),
    running: vi.fn(),
  });
});
afterEach(() => {
  live.stop();
  vi.useRealTimers();
});
it("coalesces edits without applying unrelated offline map differences", async () => {
  const before = createKeyboardSettings();
  before.options.winLock = true;
  const a = structuredClone(before);
  a.pollingRate = 2000;
  live.enqueue(before, a);
  await vi.advanceTimersByTimeAsync(200);
  const b = structuredClone(a);
  b.pollingRate = 4000;
  live.enqueue(a, b);
  await vi.advanceTimersByTimeAsync(300);
  expect(applied).toHaveLength(1);
  expect(applied[0].pollingRate).toBe(4000);
  expect(applied[0].options.winLock).toBe(false);
});
it("waits for slider release and keeps only the latest value", async () => {
  context.dragging = true;
  const before = createKeyboardSettings(),
    after = structuredClone(before);
  after.keys[0].actuation = 0.5;
  live.enqueue(before, after);
  await vi.advanceTimersByTimeAsync(1000);
  expect(applied).toHaveLength(0);
  context.dragging = false;
  await vi.advanceTimersByTimeAsync(300);
  expect(applied[0].keys[0].actuation).toBe(0.5);
});
it("does not replay offline edits on reconnect or apply a switched map", async () => {
  const before = createKeyboardSettings(),
    after = structuredClone(before);
  after.pollingRate = 4000;
  context.enabled = false;
  live.enqueue(before, after);
  context.enabled = true;
  await vi.advanceTimersByTimeAsync(500);
  expect(applied).toHaveLength(0);
  live.enqueue(before, after);
  context.mapId = "two";
  await vi.advanceTimersByTimeAsync(500);
  expect(applied).toHaveLength(0);
});
it("keeps unverified fields local", async () => {
  const before = createKeyboardSettings(),
    after = structuredClone(before);
  after.macros[0].actions = [{ code: "KeyA", down: true, delay: 100 }];
  after.keys[0].layers[0] = [119, 1];
  live.enqueue(before, after);
  await vi.advanceTimersByTimeAsync(500);
  expect(applied).toHaveLength(0);
  expect(state).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: "local" }),
  );
});
it("reads unknown fields before applying and never retries failures by itself", async () => {
  client.lastSnapshot!.unreadFields = ["keys"];
  vi.mocked(client.snapshot).mockResolvedValue(initial());
  vi.mocked(client.apply).mockRejectedValueOnce(new Error("readback mismatch"));
  const before = createKeyboardSettings(),
    after = structuredClone(before);
  after.keys[0].actuation = 0.5;
  live.enqueue(before, after);
  await vi.advanceTimersByTimeAsync(300);
  expect(client.snapshot).toHaveBeenCalledWith(expect.any(Function), {
    scope: "all",
    fresh: false,
  });
  expect(state).toHaveBeenLastCalledWith({
    status: "error",
    message: "readback mismatch",
  });
  await vi.advanceTimersByTimeAsync(2000);
  expect(client.apply).toHaveBeenCalledTimes(1);
  live.retry();
  await vi.advanceTimersByTimeAsync(300);
  expect(client.apply).toHaveBeenCalledTimes(2);
});
it("does not write after unmount", async () => {
  const before = createKeyboardSettings(),
    after = structuredClone(before);
  after.pollingRate = 4000;
  live.enqueue(before, after);
  live.stop();
  await vi.advanceTimersByTimeAsync(500);
  expect(applied).toHaveLength(0);
});
it("serializes a newer edit and reports saving until both batches finish", async () => {
  let finish!: (value: Awaited<ReturnType<KeyboardClient["apply"]>>) => void;
  vi.mocked(client.apply).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const before = createKeyboardSettings(),
    first = structuredClone(before),
    second = structuredClone(before);
  first.pollingRate = 2000;
  second.pollingRate = 4000;
  live.enqueue(before, first);
  await vi.advanceTimersByTimeAsync(300);
  context.busy = true;
  live.enqueue(first, second);
  await vi.advanceTimersByTimeAsync(900);
  expect(client.apply).toHaveBeenCalledTimes(1);
  finish({ packets: [], skipped: [] });
  await vi.advanceTimersByTimeAsync(0);
  expect(state).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: "saving" }),
  );
  context.busy = false;
  await vi.advanceTimersByTimeAsync(300);
  expect(client.apply).toHaveBeenCalledTimes(2);
  expect(vi.mocked(client.apply).mock.calls[1][0].pollingRate).toBe(4000);
});
it("cancels before writing if the map changes during the baseline read", async () => {
  let finish!: (value: KeyboardSnapshot) => void;
  client.lastSnapshot = null;
  vi.mocked(client.snapshot).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const before = createKeyboardSettings(),
    after = structuredClone(before);
  after.pollingRate = 4000;
  live.enqueue(before, after);
  await vi.advanceTimersByTimeAsync(300);
  context.mapId = "other";
  live.cancel();
  finish(initial());
  await vi.advanceTimersByTimeAsync(500);
  expect(client.apply).not.toHaveBeenCalled();
});

it("retains an edit while background device reads are busy, then saves it once", async () => {
  const before = createKeyboardSettings(),
    after = structuredClone(before);
  after.pollingRate = 4000;
  context.busy = true;
  live.enqueue(before, after);
  await vi.advanceTimersByTimeAsync(900);
  expect(applied).toHaveLength(0);
  context.busy = false;
  await vi.advanceTimersByTimeAsync(300);
  expect(applied).toHaveLength(1);
  expect(applied[0].pollingRate).toBe(4000);
});

it("does not issue a write when the first-write dialog is cancelled", async () => {
  live.stop();
  const receipts = vi.fn();
  live = createKeyboardLiveApply({
    context: () => context,
    state,
    snapshot: vi.fn(),
    running: vi.fn(),
    receipts,
    authorize: async () => false,
  });
  const before = createKeyboardSettings(),
    after = structuredClone(before);
  after.pollingRate = 4000;
  live.enqueue(before, after);
  await vi.advanceTimersByTimeAsync(500);
  expect(client.apply).not.toHaveBeenCalled();
  expect(receipts).toHaveBeenLastCalledWith({
    pollingRate: { status: "local", value: 4000 },
  });
});
it("reports a failed receipt until explicit Retry completes readback, keeping local macro edits separate", async () => {
  live.stop();
  const receipts = vi.fn();
  live = createKeyboardLiveApply({
    context: () => context,
    state,
    snapshot: vi.fn(),
    running: vi.fn(),
    receipts,
    authorize: async () => true,
  });
  vi.mocked(client.apply).mockRejectedValueOnce(new Error("readback mismatch"));
  const before = createKeyboardSettings(),
    after = structuredClone(before);
  after.pollingRate = 4000;
  after.macros[0].name = "Local name";
  live.enqueue(before, after);
  await vi.advanceTimersByTimeAsync(500);
  expect(receipts).toHaveBeenCalledWith({
    "macros.0": { status: "local", value: after.macros[0] },
  });
  expect(receipts).toHaveBeenLastCalledWith({
    pollingRate: { status: "error", value: 4000 },
  });
  expect(client.apply).toHaveBeenCalledTimes(1);
  live.retry();
  await vi.advanceTimersByTimeAsync(500);
  expect(client.apply).toHaveBeenCalledTimes(2);
  expect(receipts).toHaveBeenLastCalledWith({
    pollingRate: { status: "saved", value: 4000 },
  });
  expect(applied[0].macros[0].name).toBe("M1");
});

it("keeps a successful field saved when another unread field is skipped", async () => {
  live.stop();
  const receipts = vi.fn(),
    snapshot = initial();
  snapshot.unreadFields = ["keys"];
  client.lastSnapshot = snapshot;
  vi.mocked(client.snapshot).mockResolvedValue(snapshot);
  vi.mocked(client.apply).mockResolvedValue({
    packets: [{}],
    skipped: ["Key 0:0 actuation: device value unread"],
  } as Awaited<ReturnType<KeyboardClient["apply"]>>);
  live = createKeyboardLiveApply({
    context: () => context,
    state,
    snapshot: vi.fn(),
    running: vi.fn(),
    receipts,
  });
  const before = createKeyboardSettings(),
    after = structuredClone(before);
  after.pollingRate = 4000;
  after.keys[0].actuation = 0.5;
  live.enqueue(before, after);
  await vi.advanceTimersByTimeAsync(500);
  expect(receipts).toHaveBeenCalledWith({
    pollingRate: { status: "saved", value: 4000 },
  });
  expect(receipts).toHaveBeenCalledWith({
    "key.0.actuation": { status: "local", value: 0.5 },
  });
});
it("marks an unsent cancelled debounce edit local instead of leaving Saving forever", async () => {
  live.stop();
  const receipts = vi.fn();
  live = createKeyboardLiveApply({
    context: () => context,
    state,
    snapshot: vi.fn(),
    running: vi.fn(),
    receipts,
  });
  const before = createKeyboardSettings(),
    after = structuredClone(before);
  after.pollingRate = 4000;
  live.enqueue(before, after);
  live.cancel();
  await vi.advanceTimersByTimeAsync(500);
  expect(client.apply).not.toHaveBeenCalled();
  expect(receipts).toHaveBeenLastCalledWith({
    pollingRate: { status: "local", value: 4000 },
  });
});
