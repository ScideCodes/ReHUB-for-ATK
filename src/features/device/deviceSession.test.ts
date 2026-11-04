import { hidClient } from "../../hid/hidClient";
import { useConfigStore } from "../../store/configStore";
import { MockHidDevice } from "../../mock/mockDevice";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DeviceSettingsSchema } from "../../types/schema";
import { buildPacket, calcChecksum, REPORT_ID } from "../../protocol/codec";
import {
  buildApplyPlan,
  createPacketQueue,
  parseHexFrame,
  refreshDevice,
  useDeviceSession,
  validateOutgoing,
} from "./deviceSession";

const response = (packet: Uint8Array) =>
  new DataView(new Uint8Array(packet).buffer);
const immediate = async (_milliseconds: number) => {
  void _milliseconds;
};

describe("HID console safety", () => {
  it("blocks firmware, pairing, and device event opcodes even with safe mode off", () => {
    for (const opcode of [5, 10, 13, 19, 90, 91])
      expect(() => validateOutgoing(buildPacket(opcode), false, true)).toThrow(
        /blocked/,
      );
    expect(() => validateOutgoing(buildPacket(127), true, true)).toThrow(
      /Safe mode/,
    );
    expect(() => validateOutgoing(buildPacket(127), false, true)).not.toThrow();
  });
  it("requires reset confirmation and rejects unverified hardware writes", () => {
    expect(() => validateOutgoing(buildPacket(9), true, true)).toThrow(
      /confirmation/,
    );
    expect(() =>
      validateOutgoing(buildPacket(9), true, true, { factoryConfirmed: true }),
    ).not.toThrow();
    // EEPROM 185 (sensorModel) follows source st.create; macro/profile storage stays blocked.
    expect(() => validateOutgoing(buildPacket(7, 181, 6, [1, 84, 6, 79, 2, 83]), false, true)).not.toThrow();
    for (const address of [256, 768, 6528])
      expect(() =>
        validateOutgoing(buildPacket(7, address, 1, [1]), false, true),
      ).toThrow(/verification/);
    expect(() =>
      validateOutgoing(buildPacket(7, 189, 4, [0, 85, 0, 85]), false, true),
    ).not.toThrow();
    expect(() =>
      validateOutgoing(buildPacket(7, 181, 4, [1, 84, 6, 79]), true, true),
    ).not.toThrow();
    expect(() => validateOutgoing(buildPacket(1), false, true)).toThrow(
      /verification/,
    );
  });
  it("validates raw frame length, byte syntax, and outgoing checksums", () => {
    expect(
      parseHexFrame("04 00 00 00 00 00 00 00 00 00 00 00 00 00 00 49"),
    ).toEqual(buildPacket(4));
    expect(() => parseHexFrame("04 49")).toThrow(/16/);
    expect(() => parseHexFrame("GG ".repeat(16))).toThrow(/16/);
    const corrupt = buildPacket(4);
    corrupt[15] ^= 1;
    expect(() => validateOutgoing(corrupt, true, true)).toThrow(/checksum/);
  });
});

describe("serialized HID queue", () => {
  it("rejects a queued packet when the device changes before its turn", async () => {
    let connection = "mouse-a";
    let finish!: (value: DataView) => void;
    const send = vi.fn(() => new Promise<DataView>((resolve) => { finish = resolve; }));
    const queue = createPacketQueue(send, {
      safe: () => true,
      hardware: () => false,
      connectionKey: () => connection,
      wait: immediate,
    });
    const first = queue(buildPacket(4));
    const queued = queue(buildPacket(7, 0, 1, [1]));
    const rejected = expect(queued).rejects.toThrow(/connection changed/);
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    connection = "mouse-b";
    finish(response(buildPacket(4)));
    await first;
    await rejected;
    expect(send).toHaveBeenCalledOnce();
  });
  it("allows only one command in flight and paces consecutive writes", async () => {
    let active = 0;
    let maximum = 0;
    const order: number[] = [];
    const send = vi.fn(async (packet: Uint8Array) => {
      active += 1;
      maximum = Math.max(maximum, active);
      order.push(packet[0]);
      await Promise.resolve();
      active -= 1;
      return response(packet);
    });
    const pace = vi.fn(immediate);
    const queue = createPacketQueue(send, {
      safe: () => true,
      hardware: () => false,
      wait: pace,
    });
    await Promise.all([
      queue(buildPacket(4)),
      queue(buildPacket(16)),
      queue(buildPacket(14)),
    ]);
    expect(maximum).toBe(1);
    expect(order).toEqual([4, 16, 14]);
    expect(
      pace.mock.calls
        .slice(1)
        .every(([milliseconds]) => milliseconds > 0 && milliseconds <= 20),
    ).toBe(true);
  });
  it("retries timeouts three times and recovers for the next command", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockImplementation((packet: Uint8Array) =>
        Promise.resolve(response(packet)),
      );
    const queue = createPacketQueue(send, {
      safe: () => true,
      hardware: () => false,
      wait: immediate,
    });
    await expect(queue(buildPacket(4))).rejects.toThrow("Timeout");
    await expect(queue(buildPacket(16))).resolves.toBeInstanceOf(DataView);
    expect(send).toHaveBeenCalledTimes(5);
  });
  it("accepts incoming checksum mismatches as warnings", async () => {
    const packet = buildPacket(4);
    packet[15] ^= 1;
    const log = vi.fn();
    const queue = createPacketQueue(async () => response(packet), {
      safe: () => true,
      hardware: () => false,
      wait: immediate,
      log,
    });
    await expect(queue(buildPacket(4))).resolves.toBeInstanceOf(DataView);
    expect(
      log.mock.calls.some(
        ([direction, , message]) =>
          direction === "warning" && /accepted/.test(message),
      ),
    ).toBe(true);
  });
  it("rejects device error status without retrying it", async () => {
    const packet = buildPacket(4);
    packet[1] = 2;
    packet[15] = calcChecksum(REPORT_ID, packet.subarray(0, 15));
    const send = vi.fn(async () => response(packet));
    const queue = createPacketQueue(send, {
      safe: () => true,
      hardware: () => false,
      wait: immediate,
    });
    await expect(queue(buildPacket(4))).rejects.toThrow("status 2");
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("map apply planning", () => {
  it("keeps long deep-sleep timers from generating invalid standby settings", () => {
    const previous = DeviceSettingsSchema.parse({});
    const target = { ...previous, sleepTime: 900 };
    const plan = buildApplyPlan(target, previous, false);
    expect(DeviceSettingsSchema.safeParse(plan.effectiveSettings).success).toBe(true);
    expect(plan.effectiveSettings.sensorSleepTime).toBe(previous.sensorSleepTime);
    expect(plan.packets.map((packet) => (packet[2] << 8) | packet[3])).toEqual([169]);
    expect(plan.skipped.join(" ")).toMatch(/standby/);
  });
  it("rejects timers the ten-second hardware units cannot represent exactly", () => {
    const settings = DeviceSettingsSchema.parse({});
    for (const key of ["sleepTime", "sensorSleepTime"] as const)
      expect(() => buildApplyPlan({ ...settings, [key]: 61 }, settings, false)).toThrow();
  });
  it("sends no packets for identical settings", () => {
    const settings = DeviceSettingsSchema.parse({});
    expect(buildApplyPlan(settings, settings, false).packets).toEqual([]);
  });
  it("writes changed DPI stage data before selecting the active stage", () => {
    const previous = DeviceSettingsSchema.parse({});
    const target = structuredClone(previous);
    target.dpiStages[2].xDpi = 2400;
    target.dpiStages[2].yDpi = 2400;
    target.activeDpiStage = 2;
    const plan = buildApplyPlan(target, previous, false);
    expect(plan.packets.map((packet) => (packet[2] << 8) | packet[3])).toEqual([
      20, 0,
    ]);
    plan.packets.forEach((packet) =>
      expect(() => validateOutgoing(packet, true, true)).not.toThrow(),
    );
  });
  it("writes sensor mode and rotation while preserving unverified button sequences, and mock snapshots", () => {
    const previous = DeviceSettingsSchema.parse({});
    const target = structuredClone(previous);
    target.sensorPowerMode = "LP";
    target.sensorAngleEnabled = true;
    target.sensorAngle = -15;
    target.buttons[0] = {
      ...target.buttons[0],
      keyClass: 5,
      keyValue1: 0,
      description: "Ctrl+Shift+S",
    };
    const physical = buildApplyPlan(target, previous, false);
    expect(physical.effectiveSettings.sensorPowerMode).toBe("LP");
    expect(physical.effectiveSettings.sensorAngleEnabled).toBe(true);
    expect(physical.effectiveSettings.sensorAngle).toBe(-15);
    expect(physical.effectiveSettings.buttons[0]).toEqual(previous.buttons[0]);
    expect(physical.packets).toHaveLength(2);
    const address = (packet: Uint8Array) => (packet[2] << 8) | packet[3];
    const angle = physical.packets.find((packet) => address(packet) === 189)!;
    expect(angle[4]).toBe(4);
    expect(angle[5]).toBe(241); // -15 in two's complement uint8
    expect(angle[6]).toBe((0x55 - 241) & 0xff); // CRC
    expect(angle[7]).toBe(1); // enabled
    expect(angle[8]).toBe((0x55 - 1) & 0xff); // CRC
    // Source st.create: sleep enabled, sleep time / 10, sensorModel Base (0) with crc.
    const sensor = physical.packets.find((packet) => address(packet) === 181)!;
    expect([sensor[4], sensor[9], sensor[10]]).toEqual([6, 0, 0x55]);
    for (const packet of physical.packets) expect(() => validateOutgoing(packet, true, true)).not.toThrow();
    const mock = buildApplyPlan(target, previous, true);
    expect(mock.effectiveSettings.sensorAngle).toBe(-15);
    expect(mock.effectiveSettings.buttons[0].description).toBe("Ctrl+Shift+S");
  });
  it("changes standby by rewriting the whole st block with the current sensor mode", () => {
    const previous = DeviceSettingsSchema.parse({});
    const target = { ...previous, sensorSleepTime: 120 };
    const plan = buildApplyPlan(target, previous, false);
    expect(plan.packets).toHaveLength(1);
    expect((plan.packets[0][2] << 8) | plan.packets[0][3]).toBe(181);
    expect(plan.packets[0][4]).toBe(6);
    expect(plan.packets[0][9]).toBe(1); // HP = Athletics (1), rewritten as it was
  });
});

describe("unreadable settings protection", () => {
  it("skips packets sharing invalid device fields and still applies independent settings", () => {
    const previous = DeviceSettingsSchema.parse({});
    const target = {
      ...previous,
      pollingRate: 8000 as const,
      sensorSleepEnabled: false,
      sensorSleepTime: 120,
    };
    const plan = buildApplyPlan(target, previous, false, ["sensorSleepTime"]);
    expect(plan.packets.map((packet) => (packet[2] << 8) | packet[3])).toEqual([
      0,
    ]);
    expect(plan.effectiveSettings.sensorSleepEnabled).toBe(
      previous.sensorSleepEnabled,
    );
    expect(plan.effectiveSettings.sensorSleepTime).toBe(
      previous.sensorSleepTime,
    );
    expect(plan.skipped.join(" ")).toMatch(/Standby timer/i);
  });
  it("rejects a reply from another command instead of interpreting its payload", async () => {
    const queue = createPacketQueue(async () => response(buildPacket(16)), {
      safe: () => true,
      hardware: () => false,
      wait: immediate,
    });
    await expect(queue(buildPacket(4))).rejects.toThrow(/command/i);
  });
  it("rejects truncated EEPROM payloads", async () => {
    const queue = createPacketQueue(
      async () => response(buildPacket(8, 181, 1, [1])),
      { safe: () => true, hardware: () => false, wait: immediate },
    );
    await expect(queue(buildPacket(8, 181, 4))).rejects.toThrow(/incomplete/i);
  });
});

describe("physical device snapshots", () => {
  const initialStore = useConfigStore.getState();
  const initialSession = useDeviceSession.getState();
  const deviceInfo = {
    ...initialStore.deviceInfo,
    connected: true,
    isMock: false,
    cid: 1,
    mid: 4,
    vendorId: 0x373b,
    productId: 0x11d8,
    connectionMode: "wireless_dongle" as const,
  };
  let memory: Uint8Array;
  beforeAll(() => {
    vi.spyOn(hidClient, "identifyDevice").mockResolvedValue(deviceInfo);
    vi.spyOn(hidClient, "transfer").mockImplementation(async (request) => {
      const reply = new Uint8Array(request);
      if (request[0] === 8) {
        const address = (request[2] << 8) | request[3];
        reply.set(memory.slice(address, address + request[4]), 5);
      } else if (request[0] === 21) reply[5] = 1;
      reply[15] = calcChecksum(REPORT_ID, reply.subarray(0, 15));
      return response(reply);
    });
  });
  beforeEach(() => {
    memory = new MockHidDevice().eeprom;
    memory[0] = 32;
    memory[181] = 1;
    memory[183] = 6;
    memory[227] = 10;
    const defaults = DeviceSettingsSchema.parse({});
    defaults.buttons
      .slice(0, 5)
      .forEach((button, index) =>
        memory.set(
          [button.keyClass, button.keyValue1, button.keyValue2],
          96 + index * 4,
        ),
      );
    useConfigStore.setState({
      deviceInfo,
      activeSettings: { ...defaults, sensorSleepTime: 120 },
    });
    useDeviceSession.setState({ ...initialSession });
  });
  afterAll(() => {
    vi.restoreAllMocks();
    useConfigStore.setState(initialStore);
    useDeviceSession.setState(initialSession);
  });

  it("keeps valid reads when the standby timer exceeds the editor range", async () => {
    memory[183] = 61;
    await expect(refreshDevice()).resolves.toBeUndefined();
    expect(useConfigStore.getState().activeSettings.pollingRate).toBe(4000);
    expect(useConfigStore.getState().activeSettings.sensorSleepTime).toBe(120);
    expect(useDeviceSession.getState().readIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "sensorSleepTime", received: 610 }),
      ]),
    );
  });

  it("isolates every malformed numeric field instead of losing the whole snapshot", async () => {
    memory[169] = 255;
    memory[173] = 255;
    memory[183] = 0;
    memory[227] = 255;
    memory[6988] = 255;
    memory[6994] = 127;
    memory[96] = 255;
    await expect(refreshDevice()).resolves.toBeUndefined();
    const settings = useConfigStore.getState().activeSettings;
    expect(settings.pollingRate).toBe(4000);
    expect(DeviceSettingsSchema.safeParse(settings).success).toBe(true);
    expect(
      useDeviceSession.getState().readIssues.map((issue) => issue.key),
    ).toEqual(
      expect.arrayContaining([
        "keyDebounce",
        "sleepTime",
        "sensorSleepTime",
        "rollingDelay",
        "fastTrigger",
        "sensorCenterPoint",
        "buttons",
      ]),
    );
  });

  it("does not silently reinterpret invalid polling, LOD, booleans, or stage counts", async () => {
    memory[0] = 255;
    memory[2] = 255;
    memory[10] = 255;
    memory[171] = 255;
    await expect(refreshDevice()).resolves.toBeUndefined();
    const settings = useConfigStore.getState().activeSettings;
    expect(settings.pollingRate).toBe(1000);
    expect(settings.lod).toBe(1);
    expect(settings.motionSync).toBe(true);
    expect(settings.dpiStages).toHaveLength(4);
    expect(
      useDeviceSession.getState().readIssues.map((issue) => issue.key),
    ).toEqual(
      expect.arrayContaining(["pollingRate", "dpiStages", "lod", "motionSync"]),
    );
  });

  it("rejects invalid DPI values and active stages without discarding other settings", async () => {
    memory.set([255, 255, 255], 12);
    memory[4] = 7;
    await expect(refreshDevice()).resolves.toBeUndefined();
    const settings = useConfigStore.getState().activeSettings;
    expect(settings.pollingRate).toBe(4000);
    expect(settings.dpiStages[0].xDpi).toBe(400);
    expect(settings.activeDpiStage).toBe(1);
    expect(
      useDeviceSession.getState().readIssues.map((issue) => issue.key),
    ).toEqual(expect.arrayContaining(["dpiStages", "activeDpiStage"]));
  });

  it("keeps map validation strict instead of widening limits to fit unsupported hardware values", () => {
    expect(
      DeviceSettingsSchema.safeParse({ sensorSleepTime: 610 }).success,
    ).toBe(false);
    expect(DeviceSettingsSchema.safeParse({ keyDebounce: 255 }).success).toBe(
      false,
    );
  });

  it("retains warnings across unrelated push reads and clears them after valid readback", async () => {
    memory[183] = 255;
    await refreshDevice();
    await refreshDevice(2);
    expect(
      useDeviceSession
        .getState()
        .readIssues.some((issue) => issue.key === "sensorSleepTime"),
    ).toBe(true);
    memory[183] = 6;
    await refreshDevice();
    expect(useDeviceSession.getState().readIssues).toEqual([]);
    expect(useConfigStore.getState().activeSettings.sensorSleepTime).toBe(60);
  });
});

describe("device push reports", () => {
  it("defers the push-triggered refresh until the current operation ends", async () => {
    const { connectDevice, installDeviceBridge } = await import("./deviceSession");
    await connectDevice(true, 1, 4);
    installDeviceBridge();
    const identify = vi.spyOn(hidClient, "identifyDevice");
    vi.useFakeTimers();
    try {
      useDeviceSession.setState({ busy: true });
      const push = new Uint8Array(16);
      push[0] = 0x0a;
      push[5] = 4; // identity changed
      push[15] = calcChecksum(REPORT_ID, push.subarray(0, 15));
      hidClient.onPushReport?.(0x0a, push);
      await vi.advanceTimersByTimeAsync(1000);
      expect(identify).not.toHaveBeenCalled();
      useDeviceSession.setState({ busy: false });
      await vi.advanceTimersByTimeAsync(300);
      expect(identify).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      identify.mockRestore();
    }
  });
});
