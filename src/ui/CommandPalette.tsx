import { errorMessage } from "./errorMessage";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, CornerDownLeft, Search, X } from "lucide-react";
import { Button } from "./Button";
import { useDialog } from "./useDialog";
import { transition } from "./motion";

export interface PaletteCommand {
  id: string;
  title: string;
  description?: string;
  group?: string;
  keywords?: readonly string[];
  shortcut?: string;
  icon?: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  onSelect: () => void | Promise<void>;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: readonly PaletteCommand[];
  enableShortcut?: boolean;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function fuzzyScore(query: string, text: string): number | null {
  const candidate = normalize(text);
  if (!query) return 0;
  if (candidate === query) return 10000;
  if (candidate.startsWith(query)) return 5000 - candidate.length;
  const direct = candidate.indexOf(query);
  if (direct >= 0) return 2000 - direct - candidate.length * 0.1;
  let cursor = -1;
  let score = 0;
  for (const character of query.replace(/\s/g, "")) {
    const next = candidate.indexOf(character, cursor + 1);
    if (next < 0) return null;
    score += next === cursor + 1 ? 12 : 3;
    if (next === 0 || /[\s\-_/]/.test(candidate[next - 1])) score += 8;
    cursor = next;
  }
  return score - candidate.length * 0.1;
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
  enableShortcut = true,
}: CommandPaletteProps) {
  const reduced = useReducedMotion();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);
  const { dialogRef, titleId } = useDialog(open, () => {
    if (!running.current) onOpenChange(false);
  });
  const listId = `${titleId}-results`;

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setError(null);
    }
  }, [open]);
  useEffect(() => {
    if (!enableShortcut) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        !event.altKey
      ) {
        event.preventDefault();
        if (!running.current) onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enableShortcut, open, onOpenChange]);

  const results = useMemo(() => {
    const search = normalize(query);
    return commands
      .map((command, index) => {
        const titleScore = fuzzyScore(search, command.title);
        const contextScore = fuzzyScore(
          search,
          [
            command.title,
            command.group,
            command.description,
            ...(command.keywords ?? []),
          ]
            .filter(Boolean)
            .join(" "),
        );
        const score =
          titleScore === null
            ? contextScore === null
              ? null
              : contextScore * 0.7
            : Math.max(titleScore, (contextScore ?? 0) * 0.7);
        return { command, score, index };
      })
      .filter(
        (
          entry,
        ): entry is { command: PaletteCommand; score: number; index: number } =>
          entry.score !== null,
      )
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.command);
  }, [commands, query]);
  const available = results.filter((command) => !command.disabled);
  const selectedIndex = Math.min(
    activeIndex,
    Math.max(0, available.length - 1),
  );
  const activeCommand = available[selectedIndex];
  const activeId = activeCommand
    ? `${listId}-${results.indexOf(activeCommand)}`
    : undefined;
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  async function run(command: PaletteCommand) {
    if (running.current || command.disabled) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await command.onSelect();
      onOpenChange(false);
    } catch (failure) {
      setError(errorMessage(failure, "The command failed."));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          data-hub-modal-root
          className="hub-modal-layer hub-palette-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition(reduced)}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && !running.current)
              onOpenChange(false);
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="hub-panel hub-panel--none hub-palette"
            initial={{ opacity: 0, y: reduced ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : 8 }}
            transition={transition(reduced)}
          >
            <h2 id={titleId} className="hub-sr-only">
              Command palette
            </h2>
            <div className="hub-palette-search">
              <Search size={19} aria-hidden="true" />
              <input
                data-autofocus
                role="combobox"
                aria-label="Search commands and maps"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={activeId}
                autoComplete="off"
                spellCheck={false}
                value={query}
                disabled={busy}
                placeholder="Search commands and maps"
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    const direction = event.key === "ArrowDown" ? 1 : -1;
                    setActiveIndex(
                      available.length
                        ? (selectedIndex + direction + available.length) %
                            available.length
                        : 0,
                    );
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    if (activeCommand) void run(activeCommand);
                  }
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close command palette"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                <X size={17} aria-hidden="true" />
              </Button>
            </div>
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label="Commands"
              aria-busy={busy || undefined}
              className="hub-palette-results"
            >
              {results.map((command, index) => (
                <li
                  key={command.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={command === activeCommand}
                  aria-disabled={command.disabled || busy || undefined}
                  data-active={command === activeCommand}
                  data-disabled={command.disabled || busy || undefined}
                  className="hub-palette-option"
                  onPointerMove={() => {
                    const next = available.indexOf(command);
                    if (next >= 0 && !busy) setActiveIndex(next);
                  }}
                  onClick={() => void run(command)}
                >
                  {command.icon && (
                    <span className="hub-palette-icon" aria-hidden="true">
                      {command.icon}
                    </span>
                  )}
                  <span className="hub-palette-copy">
                    <span className="hub-palette-command-title">
                      {command.title}
                    </span>
                    {command.group && (
                      <span className="hub-palette-group">{command.group}</span>
                    )}
                    {(command.disabledReason || command.description) && (
                      <span className="hub-control-hint">
                        {command.disabledReason ?? command.description}
                      </span>
                    )}
                  </span>
                  {command.shortcut && (
                    <kbd className="hub-kbd">{command.shortcut}</kbd>
                  )}
                </li>
              ))}
            </ul>
            {results.length === 0 && (
              <p className="hub-palette-empty" role="status">
                No commands match this search.
              </p>
            )}
            {error && (
              <p className="hub-inline-error hub-palette-error" role="alert">
                {error}
              </p>
            )}
            <div className="hub-palette-footer">
              <span>
                <ArrowUp size={12} aria-hidden="true" />
                <ArrowDown size={12} aria-hidden="true" /> Move
              </span>
              <span>
                <CornerDownLeft size={12} aria-hidden="true" /> Select
              </span>
              <span>
                <kbd className="hub-kbd">Esc</kbd> Close
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
