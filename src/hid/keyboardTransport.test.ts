import { afterEach, expect, it, vi } from "vitest";
import { ATK68 } from "../devices/registry";
import { KeyboardClient } from "./keyboardClient";
import { keyboardRead } from "../protocol/keyboard";
import { createKeyboardSettings } from "../devices/keyboardSettings";

function transport() {
  const listeners = new Set<(event: unknown) => void>();
  const device = {
    vendorId: 0x373b,
    productId: 0x1048,
    opened: false,
    collections: [
      { usagePage: 0xff60, usage: 0x61, outputReports: [{ reportId: 0 }] },
    ],
    open: async () => {
      device.opened = true;
    },
    close: async () => {
      device.opened = false;
    },
    addEventListener: (_: string, listener: (event: unknown) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: unknown) => void) =>
      listeners.delete(listener),
    sendReport: vi
      .fn<(reportId: number, frame: Uint8Array) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
  vi.stubGlobal("navigator", {
    hid: {
      getDevices: async () => [device],
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
  function reply(frame: Uint8Array, reportId = 0) {
    for (const listener of [...listeners])
      listener({
        reportId,
        data: new DataView(frame.buffer, frame.byteOffset, frame.byteLength),
      });
  }
  return { device, reply, listeners };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("waits 3000ms, retries a timed-out read once, and resolves immediately on its reply", async () => {
  vi.useFakeTimers();
  const fake = transport(),
    client = new KeyboardClient(ATK68);
  await client.connect();
    client.confirmWrites();
  const promise = client.read(keyboardRead("polling"));
  await vi.advanceTimersByTimeAsync(2999);
  expect(fake.device.sendReport).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fake.device.sendReport).toHaveBeenCalledTimes(2);
  const response = keyboardRead("polling");
  response[3] = 4;
  fake.reply(response);
  expect((await promise)[3]).toBe(4);
  expect(fake.listeners.size).toBe(0);
  await client.close();
});
it("ignores wrong report ids, selectors, row/column and unsolicited input", async () => {
  vi.useFakeTimers();
  const fake = transport(),
    client = new KeyboardClient(ATK68);
  await client.connect();
    client.confirmWrites();
  const frame = keyboardRead("actuation", 2, 3),
    promise = client.read(frame);
  let complete = false;
  void promise.then(() => {
    complete = true;
  });
  await vi.advanceTimersByTimeAsync(0);
  const wrong = frame.slice();
  wrong[4]++;
  fake.reply(wrong);
  fake.reply(frame, 1);
  fake.reply(new Uint8Array(32));
  await Promise.resolve();
  expect(complete).toBe(false);
  fake.reply(frame);
  await promise;
  await client.close();
});
it("retries only once, never retries a write, and drops queued work after reconnect", async () => {
  vi.useFakeTimers();
  const fake = transport(),
    client = new KeyboardClient(ATK68);
  await client.connect();
    client.confirmWrites();
  const read = client.read(keyboardRead("version"));
  const rejected = expect(read).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(6000);
  await rejected;
  expect(fake.device.sendReport).toHaveBeenCalledTimes(2);
  const settings = createKeyboardSettings();
  client.lastSnapshot = {
    settings,
    firmware: "1",
    unreadFields: [],
    warnings: [],
  };
  const draft = structuredClone(settings);
  draft.pollingRate = 4000;
  const write = client.apply(draft, () => {}),
    failed = expect(write).rejects.toThrow("timed out");
  await vi.runAllTimersAsync();
  await failed;
  expect(
    fake.device.sendReport.mock.calls.filter(([, f]) => f[0] === 3),
  ).toHaveLength(1);
  const old = client.read(keyboardRead("version")),
    queued = client.read(keyboardRead("polling"));
  const stopped = Promise.all([
    expect(old).rejects.toThrow(),
    expect(queued).rejects.toThrow(),
  ]);
  await Promise.resolve();
  await client.close();
  await client.connect();
    client.confirmWrites();
  await vi.runAllTimersAsync();
  await stopped;
  expect(
    fake.device.sendReport.mock.calls.filter(
      ([, f]) => f[2] === 34 && f[0] === 2,
    ),
  ).toHaveLength(0);
  await client.close();
});
