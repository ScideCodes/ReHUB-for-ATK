import { fillKeyboardBulkReply } from "./testing/keyboardReply";
import { ATK68 } from "../devices/registry";
import { describe, expect, it, vi } from "vitest";
import { KeyboardClient } from "./keyboardClient";
import {
  createKeyboardSettings,
  KeyboardSettingsSchema,
} from "../devices/keyboardSettings";

function responder(rate: number) {
  const defaults = createKeyboardSettings();
  return async (request: Uint8Array) => {
    const reply = request.slice();
    fillKeyboardBulkReply(request, reply, defaults);
    if (request[0] === 2) {
      if (request[2] === 34) reply[3] = rate;
      if (request[2] === 3) {
        reply[5] = 0;
        reply[6] = 150;
      }
      if (request[2] === 7) {
        reply[5] = 0;
        reply[6] = 0;
        reply[7] = 10;
        reply[8] = 0;
        reply[9] = 10;
      }
    }
    if (request[0] === 8 && request[1] === 65) {
      reply[2] = 2;
      reply[4] = 128;
      reply[8] = 60;
    }
    if (request[0] === 4) {
      const key = defaults.keys.find(
        (k) => k.row === request[2] && k.col === request[3],
      )!;
      reply.set(key.layers[request[1]], 4);
    }
    return reply;
  };
}

describe("keyboard snapshots", () => {
  it("does not reinterpret an unknown option byte as a valid boolean", async () => {
    const client = new KeyboardClient(ATK68),
      respond = responder(4);
    vi.spyOn(client, "read").mockImplementation(async (frame) => {
      const reply = await respond(frame);
      if (frame[0] === 2 && frame[2] === 17) reply[6] = 255;
      return reply;
    });
    const snapshot = await client.snapshot(() => {});
    expect(snapshot.unreadFields).toEqual(["options"]);
    expect(snapshot.settings.pollingRate).toBe(4000);
  });

  it("keeps a usable snapshot when polling is unknown, without accepting zero in the settings schema", async () => {
    const client = new KeyboardClient(ATK68);
    vi.spyOn(client, "read").mockImplementation(responder(0));
    const snapshot = await client.snapshot(() => {});
    expect(snapshot.unreadFields).toEqual(["pollingRate"]);
    expect(snapshot.warnings).toContain(
      "pollingRate: Unknown polling code 0; rate not read",
    );
    expect(snapshot.settings.keys[0].actuation).toBe(1.5);
    expect(
      KeyboardSettingsSchema.safeParse({ ...snapshot.settings, pollingRate: 0 })
        .success,
    ).toBe(false);
  });
  it.each([
    [1, 1000],
    [2, 2000],
    [4, 4000],
    [8, 8000],
  ])("decodes source polling code %i as %i Hz", async (code, expected) => {
    const client = new KeyboardClient(ATK68);
    vi.spyOn(client, "read").mockImplementation(responder(code));
    const snapshot = await client.snapshot(() => {});
    expect(snapshot.settings.pollingRate).toBe(expected);
    expect(snapshot.unreadFields).toEqual([]);
  });
  it("isolates a failed read and an invalid key block while retaining valid polling", async () => {
    const client = new KeyboardClient(ATK68),
      respond = responder(4);
    vi.spyOn(client, "read").mockImplementation(async (frame) => {
      if (frame[0] === 2 && frame[2] === 11)
        throw new Error("Unsupported read");
      const data = await respond(frame);
      if (frame[0] === 2 && frame[2] === 13) data.fill(0, 8);
      return data;
    });
    const snapshot = await client.snapshot(() => {});
    expect(snapshot.settings.pollingRate).toBe(4000);
    expect(snapshot.unreadFields).toEqual(["deadZone", "keys"]);
  });
});

it("decodes nonuniform bulk travel, RT and four layer maps by physical source matrix position", async () => {
  const deviceSettings = createKeyboardSettings();
  deviceSettings.keys.forEach((key, index) => {
    key.actuation = 0.1 + (index % 32) / 10;
    key.rt = {
      on: index % 2 === 0,
      release: 0.02 + (index % 20) / 100,
      press: 0.03 + (index % 15) / 100,
    };
    key.layers = key.layers.map((_, layer) => [0, (index + layer) % 256]);
  });
  const client = new KeyboardClient(ATK68),
    respond = responder(1);
  vi.spyOn(client, "read").mockImplementation(async (frame) => {
    const reply = await respond(frame);
    fillKeyboardBulkReply(frame, reply, deviceSettings);
    return reply;
  });
  const snapshot = await client.snapshot(() => {});
  expect(snapshot.unreadFields).toEqual([]);
  expect(
    snapshot.settings.keys.map((k) => [k.actuation, k.rt, k.layers]),
  ).toEqual(
    deviceSettings.keys.map((k) => [
      Number(k.actuation.toFixed(2)),
      {
        on: k.rt.on,
        release: Number(k.rt.release.toFixed(2)),
        press: Number(k.rt.press.toFixed(2)),
      },
      k.layers,
    ]),
  );
});
