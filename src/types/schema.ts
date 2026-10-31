import { z } from "zod";

export const PollingRateSchema = z.union([
  z.literal(125),
  z.literal(250),
  z.literal(500),
  z.literal(1000),
  z.literal(2000),
  z.literal(4000),
  z.literal(8000),
]);
export type PollingRate = z.infer<typeof PollingRateSchema>;

export const LodSchema = z.number().min(0.7).max(2.0);
export type Lod = z.infer<typeof LodSchema>;

export const DpiStageSchema = z.object({
  stage: z.number().int().min(0).max(7),
  xDpi: z.number().int().min(50).max(36000),
  yDpi: z.number().int().min(50).max(36000),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  enabled: z.boolean(),
});
export type DpiStage = z.infer<typeof DpiStageSchema>;

export const ButtonActionSchema = z.object({
  id: z.enum(["left", "right", "middle", "side1", "side2", "bottom"]),
  label: z.string(),
  keyClass: z.number().int().min(0).max(11), // 0: Close, 1: Mouse, 2: Dpi, 3: Roll, 4: Firepower, 5: Shortcut, 6: Macro, etc.
  keyValue1: z.number().int().min(0).max(255),
  keyValue2: z.number().int().min(0).max(255),
  description: z.string().optional(),
});
export type ButtonAction = z.infer<typeof ButtonActionSchema>;

export const DeviceSettingsSchema = z.object({
  // Versioning
  schemaVersion: z.literal(1).default(1),

  // Performance & Sensor
  pollingRate: PollingRateSchema.default(1000),
  lod: LodSchema.default(1.0),
  motionSync: z.boolean().default(true),
  angleSnapping: z.boolean().default(false),
  rippleControl: z.boolean().default(false),
  sensorAngleEnabled: z.boolean().default(false),
  sensorAngle: z.number().int().min(-30).max(30).default(0),
  sensorCenterPoint: z
    .object({
      enable: z.boolean().default(false),
      x: z.number().int().min(-100).max(100).default(0),
      y: z.number().int().min(-100).max(100).default(0),
    })
    .default(() => ({ enable: false, x: 0, y: 0 })),
  // Source sensorModel (st block byte 4): Base 0 = "LP", Athletics 1 = "HP", AthleticsMax 2 = "MAX".
  sensorPowerMode: z.enum(["HP", "LP", "MAX"]).default("HP"),
  longDistanceMode: z.boolean().default(false),

  // Debounce & Fast Trigger
  keyDebounce: z.number().int().min(0).max(20).default(1),
  fastTrigger: z
    .object({
      leftEnabled: z.boolean().default(false),
      leftDelay: z.number().int().min(0).max(20).default(1),
      rightEnabled: z.boolean().default(false),
      rightDelay: z.number().int().min(0).max(20).default(1),
    })
    .default(() => ({
      leftEnabled: false,
      leftDelay: 1,
      rightEnabled: false,
      rightDelay: 1,
    })),
  rollingDelay: z.number().int().min(0).max(50).default(10),

  // Power & Sleep
  sleepTime: z.number().int().min(10).max(900).default(60), // seconds
  sensorSleepEnabled: z.boolean().default(true),
  sensorSleepTime: z.number().int().min(10).max(300).default(60),

  // DPI
  activeDpiStage: z.number().int().min(0).max(7).default(1),
  dpiButtonEnabled: z.boolean().default(true),
  // Factory defaults: zod 4 only shallow-copies a default value, so nested objects would be shared between parses.
  dpiStages: z.array(DpiStageSchema).default(() => [
    { stage: 0, xDpi: 400, yDpi: 400, color: "#ef4444", enabled: true },
    { stage: 1, xDpi: 800, yDpi: 800, color: "#FF6A1A", enabled: true },
    { stage: 2, xDpi: 1600, yDpi: 1600, color: "#10b981", enabled: true },
    { stage: 3, xDpi: 3200, yDpi: 3200, color: "#FF9A4D", enabled: true },
  ]),

  // Dongle / RGB Lighting
  dongleRgbMode: z.number().int().min(0).max(3).default(1), // 0: Off, 1: Polling, 2: Battery, 3: Low Battery

  // Buttons
  buttons: z.array(ButtonActionSchema).default((): z.infer<typeof ButtonActionSchema>[] => [
    {
      id: "left",
      label: "Left Click",
      keyClass: 1,
      keyValue1: 1,
      keyValue2: 0,
    },
    {
      id: "right",
      label: "Right Click",
      keyClass: 1,
      keyValue1: 2,
      keyValue2: 0,
    },
    {
      id: "middle",
      label: "Middle Click",
      keyClass: 1,
      keyValue1: 4,
      keyValue2: 0,
    },
    {
      id: "side1",
      label: "Back (Side 1)",
      keyClass: 1,
      keyValue1: 8,
      keyValue2: 0,
    },
    {
      id: "side2",
      label: "Forward (Side 2)",
      keyClass: 1,
      keyValue1: 16,
      keyValue2: 0,
    },
    {
      id: "bottom",
      label: "DPI Cycle",
      keyClass: 2,
      keyValue1: 1,
      keyValue2: 0,
    },
  ]),
});
export type DeviceSettings = z.infer<typeof DeviceSettingsSchema>;

export const SettingsMapSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  icon: z.string(),
  note: z.string().default(""),
  createdAt: z.number(),
  updatedAt: z.number(),
  settings: DeviceSettingsSchema,
});
export type SettingsMap = z.infer<typeof SettingsMapSchema>;

export interface DeviceInfo {
  connected: boolean;
  isMock: boolean;
  name: string;
  vendorId: number;
  productId: number;
  connectionMode: "wired" | "wireless_dongle" | "disconnected";
  serial: string;
  cid: number;
  mid: number;
  firmwareMouse: string;
  firmwareDongle: string;
  batteryLevel: number;
  isCharging: boolean;
  voltageMv: number;
  rfOnline: boolean;
  onboardSlot: number;
  /** Source connect type from the Wt.getMouseInfo query (see createMouseInfoQuery); undefined when unread. */
  connectType?: number;
}

export const ColorwaySchema = z.object({
  name: z.string(),
  hex: z.string(),
  id: z.string().optional(),
  image: z.string().optional(),
});
export type Colorway = z.infer<typeof ColorwaySchema>;

export const DeviceDefinitionSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["mouse", "keyboard"]).optional(),
  cid: z.number().int().nonnegative().optional(),
  mid: z.number().int().nonnegative().optional(),
  protocolFamily: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  hardwareAccess: z.enum(["verified", "read-only"]).optional(),
  name: z.string().min(1),
  VID: z.string().regex(/^0x[0-9A-Fa-f]+$/),
  PID: z.string().regex(/^0x[0-9A-Fa-f]+$/),
  usagePage: z.number().int().optional(),
  usage: z.number().int().optional(),
  reportId: z.number().int().optional(),
  features: z.array(z.string()).optional(),
  colorways: z.array(ColorwaySchema).optional(),
  images: z.array(z.string()).optional(),
});
export type DeviceDefinition = z.infer<typeof DeviceDefinitionSchema>;

