import { useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import {
  KEY_OPTIONS,
  keyLabel,
  type KeyboardSettings,
} from "../../devices/keyboardSettings";
import { Button, Dialog } from "../index";

export function KeyAssignmentPicker({
  code,
  macros,
  onChange,
}: {
  code: number[];
  macros: KeyboardSettings["macros"];
  onChange: (value: number) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const options =
    code[0] === 0
      ? KEY_OPTIONS
      : code[0] === 119
        ? macros.map((macro, value) => ({ value, label: macro.name }))
        : Array.from({ length: 256 }, (_, value) => ({
            value,
            label: `ID ${value}`,
          }));
  const search = query.trim().toLowerCase();
  const matches = options
    .filter((option) =>
      `${option.label} ${option.value}`.toLowerCase().includes(search),
    )
    .sort(
      (a, b) =>
        Number(b.label.toLowerCase() === search) -
        Number(a.label.toLowerCase() === search),
    );
  function navigate(event: KeyboardEvent<HTMLElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const input = event.target instanceof HTMLInputElement;
    if (input && ["Home", "End"].includes(event.key)) return;
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="option"]',
      ),
    ];
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : index === -1
            ? event.key === "ArrowUp"
              ? buttons.length - 1
              : 0
            : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length;
    buttons[next].focus();
  }
  return (
    <div className="keyboard-assignment-field">
      <span className="hub-control-label">Assignment</span>
      <Button
        className="keyboard-assignment-trigger"
        aria-label={`Assignment ${keyLabel(code)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
      >
        <span>{keyLabel(code)}</span>
        <Search size={16} aria-hidden="true" />
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Choose assignment"
        description="Applies to the selected key and layer in this map."
        className="keyboard-black keyboard-assignment-picker"
      >
        <div className="keyboard-assignment-content" onKeyDown={navigate}>
          <label className="keyboard-assignment-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search assignments"
              placeholder="Search by name or ID"
              value={query}
              data-autofocus
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div
            className="keyboard-assignment-results"
            role="listbox"
            aria-label="Assignments"
          >
            {matches.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="option"
                tabIndex={index === 0 ? 0 : -1}
                aria-selected={option.value === code[1]}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                <span className="keyboard-assignment-id">{option.value}</span>
              </button>
            ))}
          </div>
          {!matches.length && (
            <p className="keyboard-note" role="status">
              No matching assignments.
            </p>
          )}
        </div>
      </Dialog>
    </div>
  );
}
