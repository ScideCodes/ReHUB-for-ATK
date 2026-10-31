import { keyboardEdits, type KeyboardEdit } from "./keyboardEdits";
import type { KeyboardSettings } from "../../devices/keyboardSettings";
import type {
  KeyboardClient,
  KeyboardSnapshot,
} from "../../hid/keyboardClient";
import { keyboardPlanContext, keyboardWritePlan } from "../../protocol/keyboardWrites";

export type KeyboardReceipt = {
  status: "saving" | "saved" | "error" | "local";
  value: unknown;
};
type Context = {
  client: KeyboardClient | null;
  mapId: string;
  enabled: boolean;
  busy: boolean;
  dragging: boolean;
};
export type KeyboardLiveState = {
  status: "ready" | "saving" | "saved" | "local" | "error";
  message: string;
};

export function createKeyboardLiveApply(options: {
  context: () => Context;
  state: (state: KeyboardLiveState) => void;
  snapshot: (snapshot: KeyboardSnapshot) => void;
  running: (running: boolean) => void;
  authorize?: () => Promise<boolean>;
  receipts?: (updates: Record<string, KeyboardReceipt>) => void;
}) {
  let pending = new Map<string, KeyboardEdit>(),
    failed = new Map<string, KeyboardEdit>();
  const receipt = (
    values: Map<string, KeyboardEdit>,
    status: KeyboardReceipt["status"],
    protectPending = false,
  ) => {
    const updates = Object.fromEntries(
      [...values]
        .filter(([key]) => !protectPending || !pending.has(key))
        .map(([key, change]) => [key, { status, value: change.value }]),
    );
    if (Object.keys(updates).length) options.receipts?.(updates);
  };
  let owner: Context | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  let running = false,
    stopped = false,
    revision = 0;
  const current = (batch: Context, version: number) => {
    const now = options.context();
    return (
      !stopped &&
      revision === version &&
      now.enabled &&
      now.client === batch.client &&
      now.mapId === batch.mapId &&
      !!now.client?.connected
    );
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), 300);
  };
  async function flush() {
    if (running || !owner || !pending.size || stopped) return;
    const batch = owner,
      version = revision,
      now = options.context();
    if (!current(batch, version)) {
      pending.clear();
      return;
    }
    if (now.dragging) {
      schedule();
      return;
    }
    if (now.busy) {
      schedule();
      return;
    }
    const values = pending;
    pending = new Map();
    running = true;
    options.running(true);
    try {
      const client = batch.client!;
      let snapshot = client.lastSnapshot;
      if (!snapshot)
        snapshot = await client.snapshot(() => {}, {
          scope: "base",
          fresh: false,
        });
      const fields = new Set(
        [...values.values()].map((change) => change.field),
      );
      if (snapshot.unreadFields.some((field) => fields.has(field))) {
        snapshot = await client.snapshot(() => {}, {
          scope: fields.has("keys")
            ? "all"
            : fields.has("light")
              ? "lighting"
              : "base",
          fresh: false,
        });
      }
      if (!current(batch, version)) return;
      const target = structuredClone(snapshot.settings);
      values.forEach((change) => change.apply(target));
      const preview = keyboardWritePlan(snapshot.settings, target, snapshot.unreadFields, keyboardPlanContext(snapshot));
      if (
        preview.packets.length &&
        options.authorize &&
        !(await options.authorize())
      ) {
        if (current(batch, version)) {
          receipt(values, "local");
          options.state({
            status: "local",
            message: "Write confirmation cancelled; draft kept",
          });
        }
        return;
      }
      if (!current(batch, version)) return;
      const plan = await client.apply(target, () => {});
      if (!current(batch, version)) return;
      const readable = (path: string, change: KeyboardEdit) =>
        !snapshot.unreadFields.includes(change.field) &&
        !(
          change.field === "keys" &&
          path.endsWith(".color") &&
          snapshot.unreadKeyColors !== false
        );
      receipt(
        new Map([...values].filter(([path, change]) => readable(path, change))),
        "saved",
        true,
      );
      receipt(
        new Map(
          [...values].filter(([path, change]) => !readable(path, change)),
        ),
        "local",
        true,
      );
      const refreshed = await client.snapshot(() => {}, {
        scope: "base",
        fresh: false,
      });
      if (!current(batch, version)) return;
      options.snapshot(refreshed);
      values.forEach((_, key) => failed.delete(key));
      options.state({
        status: pending.size
          ? "saving"
          : plan.skipped.length
            ? "local"
            : "saved",
        message: pending.size
          ? "Saving remaining changes…"
          : plan.skipped.join(" · ") || "Changes verified on keyboard",
      });
    } catch (error) {
      if (current(batch, version)) {
        failed = new Map([...values, ...pending]);
        pending.clear();
        receipt(failed, "error");
        options.state({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not verify keyboard changes",
        });
      }
    } finally {
      running = false;
      if (!stopped) options.running(false);
      if (pending.size && !stopped) schedule();
    }
  }
  return {
    enqueue(before: KeyboardSettings, after: KeyboardSettings) {
      const context = options.context();
      const allEdits = keyboardEdits(before, after);
      if (!context.enabled || !context.client?.connected) {
        receipt(allEdits, "local");
        options.state({ status: "local", message: "Changes saved locally" });
        return;
      }
      if (
        owner &&
        (owner.mapId !== context.mapId || owner.client !== context.client)
      ) {
        pending.clear();
        failed.clear();
        revision++;
      }
      owner = { ...context };
      allEdits.forEach((_, key) => failed.delete(key));
      const edited = new Map(
        [...allEdits].filter(([, change]) => change.writable),
      );
      const local = new Map(
        [...allEdits].filter(([, change]) => !change.writable),
      );
      receipt(local, "local");
      if (!edited.size) {
        if (keyboardWritePlan(before, after).skipped.length)
          options.state({
            status: "local",
            message: "Needs packet verification; saved locally",
          });
        return;
      }
      receipt(edited, "saving");
      edited.forEach((change, key) => pending.set(key, change));
      options.state({ status: "saving", message: "Saving changes…" });
      schedule();
    },
    retry() {
      if (!failed.size || !owner || !current(owner, revision)) return;
      receipt(failed, "saving");
      pending = new Map(failed);
      options.state({ status: "saving", message: "Retrying changes…" });
      schedule();
    },
    cancel() {
      revision++;
      receipt(pending, "local");
      pending.clear();
      const now = options.context();
      if (
        !owner ||
        owner.mapId !== now.mapId ||
        owner.client !== now.client ||
        !now.enabled
      )
        failed.clear();
      clearTimeout(timer);
      options.state({
        status: failed.size ? "error" : "ready",
        message: failed.size
          ? "Some changes remain unverified; Retry to check again"
          : "New edits apply automatically",
      });
    },
    stop() {
      stopped = true;
      revision++;
      pending.clear();
      failed.clear();
      clearTimeout(timer);
    },
  };
}
