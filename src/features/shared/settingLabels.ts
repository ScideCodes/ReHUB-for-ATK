const labels: Record<string, string> = {
  dpiStages: "DPI stages",
  buttons: "Button assignments",
  fastTrigger: "Fast trigger",
  sensorCenterPoint: "Sensor center point",
  pollingRate: "Polling rate",
  lod: "Lift-off distance",
  motionSync: "Motion sync",
  angleSnapping: "Angle snapping",
  rippleControl: "Ripple control",
  sensorAngle: "Sensor rotation",
  sensorAngleEnabled: "Rotation enabled",
  sensorPowerMode: "Sensor power",
  longDistanceMode: "RF boost",
  keyDebounce: "Global debounce",
  rollingDelay: "Wheel debounce",
  sleepTime: "Deep sleep",
  sensorSleepEnabled: "Sensor standby",
  sensorSleepTime: "Standby timer",
  activeDpiStage: "Active DPI stage",
  dpiButtonEnabled: "DPI button",
  dongleRgbMode: "Dongle LED mode",
  "fastTrigger.leftEnabled": "Left fast trigger",
  "fastTrigger.rightEnabled": "Right fast trigger",
  "fastTrigger.leftDelay": "Left click delay",
  "fastTrigger.rightDelay": "Right click delay",
  "sensorCenterPoint.enable": "Center-point enabled",
  "sensorCenterPoint.x": "Center-point X",
  "sensorCenterPoint.y": "Center-point Y",
  "dpiStages.length": "DPI stage count",
};
const buttonNames = ["Left", "Right", "Middle", "Backward", "Forward"];

export function settingLabel(path: string) {
  const dpi = /^dpiStages\.(\d+)\.(xDpi|yDpi)$/.exec(path);
  if (dpi)
    return `Stage ${Number(dpi[1]) + 1} ${dpi[2] === "xDpi" ? "X" : "Y"} DPI`;
  const button = /^buttons\.(\d+)\.(.+)$/.exec(path);
  if (button)
    return `${buttonNames[Number(button[1])]} ${({ keyClass: "action", keyValue1: "value 1", keyValue2: "value 2", description: "sequence" } as Record<string, string>)[button[2]] ?? button[2]}`;
  return labels[path] ?? (path || "Settings");
}
