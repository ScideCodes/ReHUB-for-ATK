import { ZodError } from "zod";
import { settingLabel } from "../features/shared/settingLabels";

export interface DeviceErrorInfo {
  summary: string;
  detail: string;
  code?: number;
}

const STATUS_DETAIL: Record<number, string> = {
  1: "The mouse firmware rejected the write command. This usually means the value is outside what this model accepts, or the mouse was asleep or busy at that moment. Move the mouse to wake it, wait a second, then press Retry. If it keeps happening, use Read from device to re-sync and change one setting at a time.",
};

/** Turns a raw device or transfer message into plain language, or null if unknown. */
export function deviceErrorInfo(message: string): DeviceErrorInfo | null {
  const text = message.trim();
  const status = text.match(/Device returned status (\d+)/i);
  if (status) {
    const code = Number(status[1]);
    return {
      summary: "The mouse refused this change",
      detail:
        STATUS_DETAIL[code] ??
        "The mouse reported an error it did not describe. Reconnect the device, read it again, then retry the change.",
      code,
    };
  }
  if (/timeout|retries exhausted/i.test(text))
    return {
      summary: "The mouse did not answer in time",
      detail:
        "No reply arrived from the mouse. Check the USB cable or 8K receiver, move the mouse to wake it, then try again.",
    };
  if (/not connected/i.test(text))
    return {
      summary: "No device is connected",
      detail: "Connect the mouse by USB or the 8K receiver, then try again.",
    };
  if (/connection changed/i.test(text))
    return {
      summary: "The device connection changed",
      detail:
        "The mouse was unplugged or switched connection while saving. Reconnect it and read the device again.",
    };
  return null;
}

export function getDeviceErrorDetails(
  error: unknown,
): { code: string; explanation: string } | null {
  if (!error) return null;
  const msg =
    typeof error === "string"
      ? error.trim()
      : error instanceof Error
        ? error.message.trim()
        : String(error).trim();

  const match =
    msg.match(/ERR_DEVICE_STATUS_(\d+)/i) ||
    msg.match(/Device returned status (\d+)/i) ||
    msg.match(/status code (\d+)/i) ||
    msg.match(/ERR_STATUS_(\d+)/i);

  if (match) {
    const codeNum = match[1];
    const contextMatch = msg.match(
      /(?:while applying|while saving|for)\s+([^.]+)/i,
    );
    const explanation =
      codeNum === "1"
        ? contextMatch
          ? `Device controller rejected command while applying ${contextMatch[1].trim()}.`
          : "Device controller rejected command or setting payload."
        : contextMatch
          ? `Device hardware rejected request while applying ${contextMatch[1].trim()} (status ${codeNum}).`
          : (STATUS_DETAIL[Number(codeNum)] ??
            `Device hardware rejected request with status code ${codeNum}.`);
    return {
      code: `ERR_DEVICE_STATUS_${codeNum}`,
      explanation,
    };
  }

  const info = deviceErrorInfo(msg);
  if (info) {
    return {
      code: info.code ? `ERR_DEVICE_STATUS_${info.code}` : "ERR_DEVICE",
      explanation: info.detail,
    };
  }

  return null;
}

export function errorMessage(
  error: unknown,
  fallback = "The operation failed.",
) {
  if (error instanceof ZodError) {
    const messages = error.issues.slice(0, 3).map((issue) => {
      const label = settingLabel(issue.path.join("."));
      if (issue.code === "too_big")
        return `${label} cannot exceed ${issue.maximum}.`;
      if (issue.code === "too_small")
        return `${label} must be at least ${issue.minimum}.`;
      return `${label} has an unsupported value.`;
    });
    return [...new Set(messages)].join(" ") || fallback;
  }
  if (error instanceof Error && error.message.trim()) {
    const msg = error.message.trim();
    const details = getDeviceErrorDetails(msg);
    if (details) return details.code;
    const info = deviceErrorInfo(msg);
    if (info) return `${info.summary}. Select the info icon for details.`;
    return msg;
  }
  return fallback;
}
