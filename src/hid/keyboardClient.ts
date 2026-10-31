import { DeviceDiagnostics } from "./diagnostics";
import {
  keyboardCacheIdentity,
  loadKeyboardSnapshot,
  saveKeyboardSnapshot,
} from "./keyboardSnapshotCache";
import { fetchKeyboardKeyBlocks } from "./keyboardBulkSnapshot";
import {
  verifiedKeyboardFilters,
  verifiedKeyboardProfile,
} from "../devices/keyboardProtocols";
import { keyboardAdapter } from "../protocol/keyboardAdapters";
import {
  keyboardWritePlan,
  validateKeyboardWrite,
  untestedTier,
  keyboardPlanContext,
  bykbKeyIdMap,
} from "../protocol/keyboardWrites";
import { bityuanWritePlan } from "../protocol/keyboards/bityuanWrites";
import type { TriggerRaw } from "../protocol/keyboards/triggerBuffers";
import type { DeviceDefinition } from "../types/schema";
import {
  keyboardLightRead,
  keyboardKeyRead,
  keyboardRead,
} from "../protocol/keyboard";
import { layoutFor } from "../devices/keyboardLayouts";
import { BYKB_OPTIONS, BYKB_POLLING, bykbFirmware, bykbKeymapEntries, bykbKeymapFrames, bykbOptionFrame, bykbWritePlan } from "../protocol/keyboards/bykb";
import {
  arbiterBlockFrames,
  arbiterDeadZone,
  arbiterFirmware,
  arbiterPolling,
  arbiterTrigger,
} from "../protocol/keyboards/arbiter";
import {
  createKeyboardSettings,
  KeyboardSettingsSchema,
  type KeyboardSettings,
} from "../devices/keyboardSettings";

export type KeyboardReadScope =
  "all" | "base" | "keys" | "trigger" | "lighting";
export type KeyboardSnapshot = {
  settings: KeyboardSettings;
  firmware: string;
  unreadFields: (keyof KeyboardSettings)[];
  warnings: string[];
  unreadKeyColors?: boolean;
  /** Raw RGB of each 8-key colour block read ("row:col"), incl. matrix positions without a key (BITYUAN/DUCKBREAD). */
  colorBlocks?: Record<string, number[]>;
  /** Raw mp.colorful byte read with the lighting (BITYUAN). */
  lightColorful?: number;
  /** Raw travel/RT bytes of every matrix cell, for whole-buffer writes (DUCKBREAD/BITYUAN). */
  triggerRaw?: TriggerRaw;
  /** HFD wm feature payload (bytes 3..11) as read: rgbArea, wasd, mac, winLock, 6-key, report, sleep u16, lowLatency. */
  hfdFeature?: number[];
  /** Source row/col matrix the key reads used. */
  matrix?: { rows: number; columns: number };
  /** Finer than unreadFields "keys" (which needs both): what may be copied into a map. */
  unreadKeyLayers?: boolean;
  unreadKeyTrigger?: boolean;
};
export type KeyboardFrameTiming = {
  command: number;
  subcommand: number;
  queuedMs: number;
  waitMs: number;
  roundTripMs: number;
  status: "ok" | "error";
};

class NotLoaded extends Error {}
class ReadTimeout extends Error {}

export class KeyboardClient {
  readonly diagnostics = new DeviceDiagnostics("keyboard");
  private readonly definition: DeviceDefinition;
  constructor(definition: DeviceDefinition) {
    this.definition = structuredClone(definition);
  }
  private get adapter() {
    const adapter = keyboardAdapter(this.definition);
    if (!adapter)
      throw new Error(
        `Protocol not verified for ${this.definition.name}; demo only`,
      );
    return adapter;
  }
  private writeConsent = false;
  get writesConfirmed() {
    return this.writeConsent && this.connected;
  }
  confirmWrites() {
    if (!this.connected) throw new Error("Keyboard disconnected");
    this.writeConsent = true;
  }
  lastSnapshot: KeyboardSnapshot | null = null;
  lastReadProfile = {
    scope: "all" as KeyboardReadScope,
    elapsedMs: 0,
    cacheHits: 0,
    frames: [] as KeyboardFrameTiming[],
  };
  private readCache = new Map<string, Uint8Array>();
  private generation = 0;
  private displaySnapshot: KeyboardSnapshot | null = null;
  private cacheIdentity = "";
  get cachedSnapshot() {
    return this.displaySnapshot ? structuredClone(this.displaySnapshot) : null;
  }

  get connected() {
    return !!this.device?.opened && !this.closed;
  }
  private device: HIDDevice | null = null;
  /** Fixed per family, or (BYKB) the opened collection's own non-zero output report ID. */
  private reportId = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private cancel: (() => void) | undefined;
  private closed = false;
  onDisconnect?: () => void;
  private disconnected = (event: HIDConnectionEvent) => {
    if (event.device === this.device) {
      void this.close();
      this.onDisconnect?.();
    }
  };
  async connect(authorizedOnly = false) {
    try {
      this.adapter.validateRead(
        this.adapter.readFrame("version"),
        this.definition,
      );
      if (!navigator.hid) throw new Error("WebHID requires a Chromium browser");
      if (this.connected) return;
      this.closed = false;
      const fixedId = this.adapter.reportId;
      const collection = (d: HIDDevice) =>
        d.collections.find(
          (c) =>
            c.usagePage === this.definition.usagePage &&
            c.usage === this.definition.usage &&
            c.outputReports?.some((r) =>
              fixedId === undefined ? r.reportId !== 0 : r.reportId === fixedId,
            ),
        );
      const matches = (d: HIDDevice) =>
        d.vendorId === Number(this.definition.VID) &&
        d.productId === Number(this.definition.PID) &&
        !!collection(d);
      let devices = await navigator.hid.getDevices();
      if (!devices.some(matches) && !authorizedOnly)
        devices = await navigator.hid.requestDevice({
          filters: verifiedKeyboardFilters(),
        });
      const device = devices.find(matches);
      if (!device)
        throw new Error(
          `No matching ${this.definition.name} collection selected`,
        );
      if (this.closed) return;
      if (!device.opened) await device.open();
      if (this.closed) {
        await device.close();
        return;
      }
      this.device = device;
      // BYKB SDK E(): first output report ID of the device's collection; 0 is rejected.
      this.reportId = fixedId ?? collection(device)!.outputReports![0].reportId!;
      this.diagnostics.attach(device, "hardware");
      this.readCache.clear();
      this.lastSnapshot = null;
      const generation = ++this.generation;
      navigator.hid.addEventListener("disconnect", this.disconnected);
      const identity = keyboardCacheIdentity(
        device,
        this.definition.usagePage!,
        this.definition.usage!,
      );
      if (identity !== this.cacheIdentity) this.displaySnapshot = null;
      this.cacheIdentity = identity;
      const previous = await loadKeyboardSnapshot(identity);
      if (generation === this.generation && previous)
        this.displaySnapshot = previous;
    } catch (error) {
      this.diagnostics.error(error);
      throw error;
    }
  }

  async close() {
    this.closed = true;
    this.diagnostics.disconnect();
    this.writeConsent = false;
    this.generation++;
    this.readCache.clear();
    this.cancel?.();
    navigator.hid?.removeEventListener("disconnect", this.disconnected);
    const device = this.device;
    this.device = null;
    this.lastSnapshot = null;
    if (device?.opened) await device.close();
  }
  read(frame: Uint8Array): Promise<Uint8Array> {
    this.adapter.validateRead(frame, this.definition);
    return this.exchange(frame);
  }
  private exchange(frame: Uint8Array, write = false): Promise<Uint8Array> {
    const request = frame.slice();
    if (write) validateKeyboardWrite(request, this.definition);
    else this.adapter.validateRead(request, this.definition);
    const queuedAt = performance.now(),
      generation = this.generation;
    const task = this.tail.then(async () => {
      const dequeuedAt = performance.now();
      const device = this.device;
      if (!device?.opened || this.closed || generation !== this.generation)
        throw new Error("Keyboard disconnected");
      if (write) await new Promise((resolve) => setTimeout(resolve, 20));
      if (
        this.closed ||
        this.device !== device ||
        !device.opened ||
        generation !== this.generation
      )
        throw new Error("Keyboard disconnected");
      const transfer = () => {
        const sentAt = performance.now();
        return new Promise<Uint8Array>((resolve, reject) => {
          let settled = false;
          const finish = (error?: Error, response?: Uint8Array) => {
            if (settled) return;
            settled = true;
            this.diagnostics.finish(performance.now() - sentAt, error);
            clearTimeout(timer);
            device.removeEventListener("inputreport", receive);
            this.cancel = undefined;
            if (!write)
              this.lastReadProfile.frames.push({
                command: request[0],
                subcommand: request[2],
                queuedMs: dequeuedAt - queuedAt,
                waitMs: sentAt - dequeuedAt,
                roundTripMs: performance.now() - sentAt,
                status: error ? "error" : "ok",
              });
            if (error) reject(error);
            else resolve(response!);
          };
          const receive = (event: HIDInputReportEvent) => {
            if (
              event.reportId !== this.reportId ||
              event.data.byteLength !== this.adapter.frameLength
            )
              return;
            const response = new Uint8Array(
              event.data.buffer,
              event.data.byteOffset,
              this.adapter.frameLength,
            ).slice();
            if (!this.adapter.matchesReply(request, response)) return;
            this.diagnostics.frame("in", event.reportId, response);
            finish(undefined, response);
          };
          const timer = setTimeout(
            () => finish(new ReadTimeout("Keyboard read timed out")),
            write ? 1000 : 3000,
          );
          this.cancel = () => finish(new Error("Keyboard disconnected"));
          device.addEventListener("inputreport", receive);
          const adapter = this.adapter;
          const out =
            "seal" in adapter ? adapter.seal(request.slice(), this.reportId) : request;
          this.diagnostics.frame("out", this.reportId, out);
          device
            .sendReport(this.reportId, out)
            .catch((error) =>
              finish(error instanceof Error ? error : new Error(String(error))),
            );
        });
      };
      try {
        return await transfer();
      } catch (error) {
        if (
          write ||
          !(error instanceof ReadTimeout) ||
          this.closed ||
          generation !== this.generation ||
          this.device !== device
        )
          throw error;
        return transfer();
      }
    });
    this.tail = task.catch(() => undefined);
    return task;
  }
  async apply(draft: KeyboardSettings, progress: (value: number) => void) {
    const profile = verifiedKeyboardProfile(this.definition);
    const untested = !!profile && "untestedWrites" in profile && profile.untestedWrites;
    if (!profile?.keySettings && !untested)
      throw new Error("Keyboard writes are not verified for this model");
    const snapshot = this.lastSnapshot;
    if (!this.connected || !snapshot)
      throw new Error("Read the keyboard before applying settings");
    const tier = untestedTier(this.definition);
    const plan = untested && tier.family === "13"
      ? bykbWritePlan(
          snapshot.settings,
          draft,
          { fields: snapshot.unreadFields, keyLayers: snapshot.unreadKeyLayers !== false },
          bykbKeyIdMap(this.definition),
        )
      : untested && tier.family !== "DUCKBREAD"
      ? bityuanWritePlan(
          snapshot.settings,
          draft,
          snapshot.unreadFields,
          snapshot.unreadKeyColors === false ? snapshot.colorBlocks : undefined,
          profile.keyMatrixRead ? profile : undefined,
          tier,
          { firmware: snapshot.firmware, colorful: snapshot.lightColorful, triggerRaw: snapshot.triggerRaw, hfdFeature: snapshot.hfdFeature },
        )
      : keyboardWritePlan(snapshot.settings, draft, snapshot.unreadFields, keyboardPlanContext(snapshot));
    // Validate the entire plan before the first write; never partially accept unsafe packets.
    plan.packets.forEach((p) => {
      validateKeyboardWrite(p.frame, this.definition);
      if (p.commit) validateKeyboardWrite(p.commit, this.definition);
    });
    if (plan.packets.length && !this.writesConfirmed)
      throw new Error("Confirm keyboard writes for this connection first");
    const applyGeneration = this.generation,
      applyDevice = this.device;
    const ensureSession = () => {
      if (
        this.generation !== applyGeneration ||
        this.device !== applyDevice ||
        !this.writesConfirmed
      )
        throw new Error("Keyboard disconnected during apply");
    };
    try {
      for (const [i, packet] of plan.packets.entries()) {
        ensureSession();
        await this.exchange(packet.frame, true);
        if (packet.commit) {
          // Source bP.setAllKeysCustomLed waits 100ms before qL.save; verify again after commit.
          await new Promise((resolve) => setTimeout(resolve, 100));
          ensureSession();
          await this.exchange(packet.commit, true);
        }
        if (packet.pauseAfter) await new Promise((resolve) => setTimeout(resolve, packet.pauseAfter));
        ensureSession();
        const mismatch = () => {
          this.lastSnapshot = null;
          this.diagnostics.error(new Error("readback mismatch"));
          return new Error(`${packet.label}: readback mismatch; read device again`);
        };
        if (packet.read) {
          const readback = await this.read(packet.read),
            at = packet.readAt ?? packet.start;
          if (
            readback
              .slice(at, at + packet.end - packet.start)
              .some((b, n) => b !== packet.frame[packet.start + n])
          )
            throw mismatch();
        }
        // Flash buffers are verified once, after their last (write) chunk, across the whole matrix.
        for (const check of packet.deferredReads ?? []) {
          ensureSession();
          const readback = await this.read(check.read);
          if (check.expected.some((b, n) => readback[check.at + n] !== b)) throw mismatch();
        }
        progress(Math.round(((i + 1) / plan.packets.length) * 100));
      }
    } finally {
      // A fresh read is required after success or a partial/failed apply.
      if (
        plan.packets.length &&
        this.generation === applyGeneration &&
        this.device === applyDevice
      ) {
        this.lastSnapshot = null;
        this.readCache.clear();
        this.generation++;
      }
    }
    return plan;
  }
  async snapshot(
    progress: (value: number) => void,
    options: {
      scope?: KeyboardReadScope;
      layer?: number;
      fresh?: boolean;
    } = {},
  ): Promise<KeyboardSnapshot> {
    if (this.closed) throw new Error("Keyboard disconnected");
    const scope = options.scope ?? "all",
      layer = options.layer ?? 0;
    if (!Number.isInteger(layer) || layer < 0 || layer > 3)
      throw new Error("Invalid keyboard layer");
    if (options.fresh !== false) {
      this.readCache.clear();
      this.lastSnapshot = null;
    }
    const generation = this.generation,
      startedAt = performance.now();
    const profile = (this.lastReadProfile = {
      scope,
      elapsedMs: 0,
      cacheHits: 0,
      frames: [] as KeyboardFrameTiming[],
    });
    const verified = verifiedKeyboardProfile(this.definition),
      matrixRead =
        !!verified?.keySettings ||
        (!!verified && "keyMatrixRead" in verified && verified.keyMatrixRead),
      bityuan = this.definition.protocolFamily === "BITYUAN",
      hfd = this.definition.protocolFamily === "HFD",
      arbiter = this.definition.protocolFamily === "ARBITER",
      bykb = this.definition.protocolFamily === "13",
      // Tv.accuracy 0.001mm; DUCKBREAD IL/RL use 0.01mm.
      unit = bityuan ? 1000 : 100;
    // Read-only matrix reads land on the device's own source layout; the ATK68 writer keeps KEY_LAYOUT order.
    const settings = createKeyboardSettings(
        (matrixRead && !verified?.keySettings) || arbiter || bykb ? layoutFor(this.definition).rows : undefined,
      ),
      unread = new Set<keyof KeyboardSettings>([
        "options",
        "pollingRate",
        "deadZone",
        "light",
        "keys",
      ]),
      warnings: string[] = [];
    const shape = KeyboardSettingsSchema.shape;
    const fetch = async (frame: Uint8Array, required: boolean) => {
      const key = [...frame].join(","),
        cached = this.readCache.get(key);
      if (cached) {
        profile.cacheHits++;
        return cached.slice();
      }
      if (!required) throw new NotLoaded();
      const reply = await this.read(frame);
      if (generation !== this.generation)
        throw new Error("Keyboard read cancelled");
      this.readCache.set(key, reply.slice());
      return reply;
    };
    const base = scope === "all" || scope === "base",
      lighting = scope === "all" || scope === "lighting";
    async function field<K extends keyof KeyboardSettings>(
      key: K,
      read: () => Promise<unknown>,
    ) {
      try {
        const parsed = shape[key].safeParse(await read());
        if (!parsed.success)
          throw new Error("Device returned an unverified value");
        (settings as Record<string, unknown>)[key] = parsed.data;
        unread.delete(key);
      } catch (error) {
        if (!(error instanceof NotLoaded))
          warnings.push(
            `${key}: ${error instanceof Error ? error.message : String(error)}`,
          );
      }
    }
    const flag = (value: number) => {
      if (value !== 0 && value !== 1)
        throw new Error(`Unknown boolean value ${value}`);
      return value === 1;
    };
    let firmware = "";
    /** Lighting byte 9 (mp.colorful), rewritten as read like the source config. */
    let lightColorful: number | undefined;
    /** HFD wm payload bytes 3..11 as read. */
    let hfdFeature: number[] | undefined;
    try {
      const version = await fetch(this.adapter.readFrame("version"), base);
      firmware =
        this.definition.protocolFamily === "13"
          ? bykbFirmware(version)
          : this.definition.protocolFamily === "ARBITER"
            ? arbiterFirmware(version)
            : `${version[5].toString(16)}.${version[6].toString(16).padStart(2, "0")}`;
    } catch (error) {
      if (!(error instanceof NotLoaded))
        warnings.push("Firmware could not be read");
    }
    await field("options", async () => {
      if (hfd) {
        // Pm wm.get [2, 150, 17]: rgbArea 3, wasd 4, mac 5, winLock 6, 6-key 7 (0 = on), report 8, sleep u16 9-10,
        // lowLatency 11. The raw payload is kept so writes rewrite sleep time and low latency as read.
        const data = await fetch(this.adapter.readFrame("polling"), base);
        hfdFeature = [...data.slice(3, 12)];
        return {
          ...settings.options,
          rgbArea: data[3],
          exchangeWasd: flag(data[4]),
          macSwitch: flag(data[5]),
          winLock: flag(data[6]),
          sixKeyNoPunch: data[7] === 0,
        };
      }
      if (this.definition.protocolFamily === "13") {
        // SDK getWinKeyLock / getWasdArrowKeysSwapped / getOsMode: value at payload byte 6; other options do not exist.
        const value = async (feature: number) => {
          const reply = await fetch(bykbOptionFrame(feature), base);
          if (reply[5] < 1) throw new Error("BYKB option reply has no payload");
          return flag(reply[6]);
        };
        return {
          ...settings.options,
          winLock: await value(BYKB_OPTIONS.winLock),
          exchangeWasd: await value(BYKB_OPTIONS.exchangeWasd),
          macSwitch: await value(BYKB_OPTIONS.macSwitch),
        };
      }
      const data = await fetch(this.adapter.readFrame("options"), base);
      return {
        rgbArea: data[3],
        exchangeWasd: flag(data[4]),
        macSwitch: flag(data[5]),
        winLock: flag(data[6]),
        // Tv.getKeyboardFunction: direct from firmware 2, inverted before (as DUCKBREAD).
        sixKeyNoPunch:
          this.definition.protocolFamily === "BITYUAN" && Number(firmware) >= 2
            ? flag(data[7])
            : !flag(data[7]),
        bottomTrigger: flag(
          (await fetch(this.adapter.readFrame("bottom"), base))[3],
        ),
        performanceMode: flag(
          (await fetch(this.adapter.readFrame("performance"), base))[3],
        ),
      };
    });
    await field("pollingRate", async () => {
      if (hfd) {
        // Pm wm.get: report rate code at byte 8 (wm.reportRateMap 8=125, 4=250, 2=500, 1=1000).
        const code = (await fetch(this.adapter.readFrame("polling"), base))[8];
        const rate = ({ 8: 125, 4: 250, 2: 500, 1: 1000 } as Record<number, number>)[code];
        if (!rate) throw new Error(`Unknown polling code ${code}; rate not read`);
        return rate;
      }
      if (this.definition.protocolFamily === "ARBITER") {
        const rate = arbiterPolling(await fetch(this.adapter.readFrame("polling"), base));
        if (!rate) throw new Error("Unknown polling code; rate not read");
        return rate;
      }
      if (this.definition.protocolFamily === "13") {
        const reply = await fetch(this.adapter.readFrame("polling"), base);
        const rate = reply[5] >= 1 ? BYKB_POLLING[reply[6]] : undefined;
        if (!rate) throw new Error(`Unknown polling code ${reply[6]}; rate not read`);
        return rate;
      }
      const code = (await fetch(this.adapter.readFrame("polling"), base))[3];
      // Source Lp (37870): BITYUAN 3/2/1/0; NL (748835): DUCKBREAD 1/2/4/8.
      const rates: Record<number, number> =
        this.definition.protocolFamily === "BITYUAN"
          ? { 0: 8000, 1: 4000, 2: 2000, 3: 1000 }
          : { 1: 1000, 2: 2000, 4: 4000, 8: 8000 };
      if (!(code in rates))
        throw new Error(`Unknown polling code ${code}; rate not read`);
      return rates[code];
    });
    await field("deadZone", async () => {
      const dead = await fetch(this.adapter.readFrame("deadZone"), base);
      if (this.definition.protocolFamily === "ARBITER") return arbiterDeadZone(dead);
      // Source gp (25711) uses 0.001mm; DUCKBREAD EL (742549) uses 0.01mm.
      const scale = this.definition.protocolFamily === "BITYUAN" ? 1000 : 100;
      return {
        top: (dead[3] * 256 + dead[4]) / scale,
        bottom: (dead[5] * 256 + dead[6]) / scale,
      };
    });
    await field("light", async () => {
      const light = await fetch(keyboardLightRead(), lighting);
      lightColorful = light[9];
      return {
        mode: light[2],
        speed: light[4],
        color: `#${[...light.slice(5, 8)].map((n) => n.toString(16).padStart(2, "0")).join("")}`,
        brightness: light[8],
      };
    });
    // Layers and trigger complete independently; HFD has no trigger hardware, ARBITER keycodes are not decoded.
    let layersRead = matrixRead && !arbiter,
      triggerRead = matrixRead && !hfd;
    await field("keys", async () => {
      if (bykb) {
        // Keymaps by source layout key ID (collectLayoutKeyIds); travel, RT and colours are not integrated.
        const ids = new Map(
          layoutFor(this.definition)
            .rows.flat()
            .filter((k) => k.keyId)
            .map((k) => [`${k.index[0]}:${k.index[1]}`, k.keyId!]),
        );
        const keys = structuredClone(settings.keys);
        try {
          for (let n = 0; n < 4; n++) {
            const codes = new Map<number, number>();
            for (const frame of bykbKeymapFrames(n, [...new Set(ids.values())].sort((a, b) => a - b)))
              for (const entry of bykbKeymapEntries(await fetch(frame, scope === "all" || scope === "keys")))
                codes.set(entry.id, entry.keycode);
            for (const key of keys) {
              const code = codes.get(ids.get(`${key.row}:${key.col}`)!);
              if (code === undefined) throw new Error(`No keycode for key ${key.row}:${key.col}`);
              key.layers[n] = [0, code];
            }
          }
          layersRead = ids.size > 0;
        } catch (error) {
          if (!(error instanceof NotLoaded)) throw error;
        }
        return keys;
      }
      if (arbiter) {
        const keys = structuredClone(settings.keys);
        try {
          const records: number[] = [];
          for (const frame of arbiterBlockFrames("trigger")) {
            const reply = await fetch(frame, scope === "all" || scope === "trigger");
            records.push(...reply.slice(8, 8 + frame[4]));
          }
          for (const key of keys) {
            const k = key.row * 16 + key.col;
            Object.assign(key, arbiterTrigger(Uint8Array.from(records.slice(8 * k, 8 * k + 8))));
          }
          triggerRead = true;
        } catch (error) {
          if (!(error instanceof NotLoaded)) throw error;
        }
        try {
          for (let n = 0; n < 4; n++) {
            const codes: number[] = [];
            for (const frame of arbiterBlockFrames("keymap", n)) {
              const reply = await fetch(frame, scope === "all" || scope === "keys");
              codes.push(...reply.slice(8, 8 + frame[4]));
            }
            for (const key of keys) {
              const k = 3 * (key.row * 16 + key.col);
              key.layers[n] = [codes[k], codes[k + 1], codes[k + 2]];
            }
          }
          layersRead = true;
        } catch (error) {
          if (!(error instanceof NotLoaded)) throw error;
        }
        return keys;
      }
      if (!matrixRead || !verified) throw new NotLoaded();
      await fetchKeyboardKeyBlocks(
        scope,
        layer,
        fetch,
        (frame, response) => {
          this.readCache.set([...frame].join(","), response);
        },
        verified.rows,
        verified.columns,
        !hfd,
      );
      const keys = structuredClone(settings.keys);
      for (const [i, key] of keys.entries()) {
        // HFD (Pm) keyboards have no travel/RT: those key fields keep editor defaults and are not shown.
        if (!hfd) try {
          const ap = await fetch(
            keyboardRead("actuation", key.row, key.col),
            false,
          );
          key.actuation = (ap[5] * 256 + ap[6]) / unit;
        } catch (error) {
          if (!(error instanceof NotLoaded)) throw error;
          triggerRead = false;
        }
        if (!hfd) try {
          const rt = await fetch(
            keyboardRead("rt", key.row, key.col),
            false,
          );
          key.rt = {
            on: flag(rt[5]),
            release: (rt[6] * 256 + rt[7]) / unit,
            press: (rt[8] * 256 + rt[9]) / unit,
          };
        } catch (error) {
          if (!(error instanceof NotLoaded)) throw error;
          triggerRead = false;
        }
        for (let n = 0; n < 4; n++) {
          try {
            const data = await fetch(
              keyboardKeyRead(n, key.row, key.col),
              false,
            );
            key.layers[n] = [data[4], data[5]];
          } catch (error) {
            if (!(error instanceof NotLoaded)) throw error;
            layersRead = false;
          }
        }
        progress(Math.round(((i + 1) / keys.length) * 100));
      }
      return keys;
    });
    // A failed or skipped keys field leaves both parts unread.
    if (unread.has("keys")) layersRead = triggerRead = false;
    // Raw travel/RT of every matrix cell (incl. positions without a key) for whole-buffer writes.
    let triggerRaw: TriggerRaw | undefined;
    if (triggerRead && !hfd && matrixRead && verified && !arbiter && !bykb)
      try {
        const cells = verified.rows * verified.columns;
        triggerRaw = { travel: [], rt: [] };
        for (let cell = 0; cell < cells; cell++) {
          const [row, col] = [Math.floor(cell / verified.columns), cell % verified.columns];
          const ap = await fetch(keyboardRead("actuation", row, col), false);
          const rt = await fetch(keyboardRead("rt", row, col), false);
          triggerRaw.travel.push(ap[5] * 256 + ap[6]);
          triggerRaw.rt.push([...rt.slice(5, 10)]);
        }
      } catch (error) {
        if (!(error instanceof NotLoaded)) throw error;
        triggerRaw = undefined;
      }
    if (!layersRead || !(triggerRead || hfd)) unread.add("keys");
    if (generation !== this.generation)
      throw new Error("Keyboard read cancelled");
    let unreadKeyColors = true;
    const colorBlocks: Record<string, number[]> = {};
    // Tv uses the v2 packed custom-LED read from firmware 2.1; only the v1 af blocks are verified here.
    if (arbiter) {
      try {
        const rgb: number[] = [];
        for (const frame of arbiterBlockFrames("colors")) {
          const reply = await fetch(frame, lighting);
          rgb.push(...reply.slice(8, 8 + frame[4]));
        }
        for (const key of settings.keys) {
          const k = 3 * (key.row * 16 + key.col);
          key.color = "#" + rgb.slice(k, k + 3).map((v) => v.toString(16).padStart(2, "0")).join("");
        }
        unreadKeyColors = false;
      } catch (error) {
        if (!(error instanceof NotLoaded)) warnings.push("Per-key colors could not be read");
      }
    } else if (matrixRead && verified && !(bityuan && Number(firmware) >= 2.1)) {
      try {
        if (hfd)
          for (let row = 0; row < verified.rows; row++)
            for (let col = 0; col < verified.columns; col += 6) {
              // Pm.getAllKeysCustomLed: Tm.get(row, col, 6) with key-index slots; replies are [index, r, g, b].
              const frame = new Uint8Array(32);
              frame.set([8, 69, row, col, 6]);
              for (let i = 0; i < 6; i++) frame[5 + 4 * i] = row * verified.columns + col + i;
              const reply = await fetch(frame, lighting);
              colorBlocks[`${row}:${col}`] = [...reply.slice(5, 29)]; // six [index, r, g, b] slots
              for (const key of settings.keys.filter(
                (key) => key.row === row && key.col >= col && key.col < col + 6,
              )) {
                const start = 6 + (key.col - col) * 4;
                key.color =
                  "#" +
                  [...reply.slice(start, start + 3)]
                    .map((v) => v.toString(16).padStart(2, "0"))
                    .join("");
              }
            }
        else for (let row = 0; row < verified.rows; row++)
          for (let col = 0; col < verified.columns; col += 8) {
            const frame = new Uint8Array(32);
            frame.set([8, 69, row, col, 8]);
            const reply = await fetch(frame, lighting);
            colorBlocks[`${row}:${col}`] = [...reply.slice(5, 5 + 3 * Math.min(8, verified.columns - col))];
            for (const key of settings.keys.filter(
              (key) => key.row === row && key.col >= col && key.col < col + 8,
            )) {
              const start = 5 + (key.col - col) * 3;
              key.color =
                "#" +
                [...reply.slice(start, start + 3)]
                  .map((v) => v.toString(16).padStart(2, "0"))
                  .join("");
            }
          }
        unreadKeyColors = false;
      } catch (error) {
        if (!(error instanceof NotLoaded))
          warnings.push("Per-key colors could not be read");
      }
    }
    const snapshot: KeyboardSnapshot = {
      settings: KeyboardSettingsSchema.parse(settings),
      firmware,
      unreadFields: [...unread],
      warnings,
      unreadKeyColors,
      colorBlocks,
      lightColorful,
      triggerRaw,
      hfdFeature,
      matrix: matrixRead && verified ? { rows: verified.rows, columns: verified.columns } : undefined,
      unreadKeyLayers: !layersRead,
      unreadKeyTrigger: !triggerRead,
    };
    this.lastSnapshot = snapshot;
    if (this.device && !warnings.length) {
      this.displaySnapshot = structuredClone(snapshot);
      void saveKeyboardSnapshot(this.cacheIdentity, snapshot);
    }
    profile.elapsedMs = performance.now() - startedAt;
    if (import.meta.env.DEV && typeof localStorage !== "undefined") {
      try {
        if (localStorage.getItem("atk-hub-hid-timing") === "1") {
          console.debug("Keyboard read", {
            scope,
            elapsedMs: profile.elapsedMs,
            frames: profile.frames.length,
            cacheHits: profile.cacheHits,
          });
          console.table(profile.frames);
        }
      } catch {
        /* Profiling must not depend on storage access. */
      }
    }
    return snapshot;
  }
}

const sessions = new Map<string, KeyboardClient>();
export function keyboardSession(definition: DeviceDefinition) {
  const key =
    definition.id ??
    `${definition.VID}:${definition.PID}:${definition.usagePage}:${definition.usage}`;
  let client = sessions.get(key);
  if (!client) {
    client = new KeyboardClient(definition);
    sessions.set(key, client);
  }
  return client;
}
