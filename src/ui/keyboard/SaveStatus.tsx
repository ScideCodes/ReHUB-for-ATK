import {
  createContext,
  useContext,
  type ReactNode,
  type ComponentProps,
} from "react";
import { Slider, Toggle, Select, ColorPicker } from "../index";
import type { KeyboardSettings } from "../../devices/keyboardSettings";
import type { KeyboardReceipt } from "./liveApply";
export const KeyboardSaveContext = createContext<{
  receipts: Record<string, KeyboardReceipt>;
  settings: KeyboardSettings;
  hardware: boolean;
  mock: boolean;
  retry: () => void;
} | null>(null);
export function receiptValue(
  settings: KeyboardSettings,
  path: string,
): unknown {
  const parts = path
    .split(".")
    .map((part) =>
      part === "key" ? "keys" : part === "layer" ? "layers" : part,
    );
  let value: unknown = settings;
  for (const part of parts)
    value = (value as Record<string, unknown> | undefined)?.[part];
  return value;
}
export function currentReceiptStatus(
  settings: KeyboardSettings,
  path: string,
  receipt: KeyboardReceipt | undefined,
  hardware: boolean,
) {
  return hardware &&
    receipt &&
    JSON.stringify(receipt.value) ===
      JSON.stringify(receiptValue(settings, path))
    ? receipt.status
    : "local";
}
export function SaveStatus({ fields }: { fields: string[] }) {
  const context = useContext(KeyboardSaveContext);
  if (!context) return null;
  if (!fields.length)
    return (
      <span className="keyboard-save-chip" data-state="local">
        Preview only
      </span>
    );
  const statuses = fields.map((path) =>
    currentReceiptStatus(
      context.settings,
      path,
      context.receipts[path],
      context.hardware,
    ),
  );
  const status =
    (["error", "saving", "local", "saved"] as const).find((value) =>
      statuses.includes(value),
    ) ?? "local";
  const text = context.mock
    ? "Applied to mock · not sent to device"
    : status === "saved"
      ? "Saved to keyboard"
      : status === "saving"
        ? "Saving"
        : status === "error"
          ? "Failed - Retry"
          : "Local only - not sent to device";
  return (
    // Mock: the editor header already says "Mock · live changes", so the per-control copy stays for screen readers only.
    <span
      className={`keyboard-save-chip${context.mock ? " hub-sr-only" : ""}`}
      data-state={status}
      role="status"
    >
      {status === "error" ? (
        <button type="button" onClick={context.retry}>
          {text}
        </button>
      ) : (
        text
      )}
    </span>
  );
}
function Field({
  fields,
  children,
}: {
  fields: string[];
  children: ReactNode;
}) {
  return (
    <div className="keyboard-saved-control">
      {children}
      <SaveStatus fields={fields} />
    </div>
  );
}
export function SaveSlider({
  saveFields = [],
  ...props
}: ComponentProps<typeof Slider> & { saveFields?: string[] }) {
  return (
    <Field fields={saveFields}>
      <Slider {...props} />
    </Field>
  );
}
export function SaveToggle({
  saveFields = [],
  ...props
}: ComponentProps<typeof Toggle> & { saveFields?: string[] }) {
  return (
    <Field fields={saveFields}>
      <Toggle {...props} />
    </Field>
  );
}
export function SaveSelect<T extends string | number>({
  saveFields = [],
  ...props
}: ComponentProps<typeof Select<T>> & { saveFields?: string[] }) {
  return (
    <Field fields={saveFields}>
      <Select {...props} />
    </Field>
  );
}
export function SaveColorPicker({
  saveFields = [],
  ...props
}: ComponentProps<typeof ColorPicker> & { saveFields?: string[] }) {
  return (
    <Field fields={saveFields}>
      <ColorPicker {...props} />
    </Field>
  );
}
