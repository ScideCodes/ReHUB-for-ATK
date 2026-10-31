import { beforeEach, expect, it } from "vitest";
import { useConfigStore } from "../store/configStore";
import { notifyError, useNotifications } from "./notifications";

beforeEach(() => useNotifications.getState().clear());

it("collects errors, folds an immediate repeat into a counter, and clears", () => {
  notifyError("Keyboard read timed out");
  notifyError("Keyboard read timed out");
  notifyError("Write blocked: readback did not match");
  const { items, unseen } = useNotifications.getState();
  expect(items.map((i) => [i.message, i.count])).toEqual([
    ["Keyboard read timed out", 2],
    ["Write blocked: readback did not match", 1],
  ]);
  expect(unseen).toBe(3);

  useNotifications.getState().markSeen();
  expect(useNotifications.getState().unseen).toBe(0);
  expect(useNotifications.getState().items).toHaveLength(2);

  useNotifications.getState().clear();
  expect(useNotifications.getState().items).toEqual([]);
});

it("ignores blank messages and keeps only error toasts from the config store", () => {
  notifyError("   ");
  useConfigStore.getState().setToast({ message: "Map updated", type: "success" });
  useConfigStore.getState().setToast({ message: "Mouse write failed", type: "error" });
  expect(useNotifications.getState().items.map((i) => i.message)).toEqual(["Mouse write failed"]);
});
