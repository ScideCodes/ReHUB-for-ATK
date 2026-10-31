import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, LockKeyhole } from "lucide-react";
import { clsx } from "clsx";

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  description?: string;
  swatch?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface SelectProps<T extends string | number> {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onValueChange: (value: T) => void;
  disabled?: boolean;
  disabledReason?: string;
  description?: string;
  hideLabel?: boolean;
  className?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  side: "top" | "bottom";
}

function lastEnabled<T extends string | number>(
  options: readonly SelectOption<T>[],
) {
  for (let index = options.length - 1; index >= 0; index -= 1)
    if (!options[index].disabled) return index;
  return -1;
}

export function Select<T extends string | number>({
  label,
  value,
  options,
  onValueChange,
  disabled = false,
  disabledReason,
  description,
  hideLabel = false,
  className,
}: SelectProps<T>) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];
  const hint = disabled && disabledReason ? disabledReason : description;
  const expanded = open && !disabled;
  const supportsPopover =
    typeof HTMLElement !== "undefined" &&
    typeof HTMLElement.prototype.showPopover === "function";
  const optionId = (index: number) => `${id}-option-${index}`;

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    setPosition(null);
    typeahead.current = { text: "", time: 0 };
    if (restoreFocus) buttonRef.current?.focus({ preventScroll: true });
  }, []);

  function showMenu(preferLast = false) {
    if (disabled) return;
    const fallback = preferLast
      ? lastEnabled(options)
      : options.findIndex((option) => !option.disabled);
    setActiveIndex(
      selectedIndex >= 0 && !selected?.disabled ? selectedIndex : fallback,
    );
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    close(true);
    if (option.value !== value) onValueChange(option.value);
  }

  function move(direction: 1 | -1) {
    for (let offset = 1; offset <= options.length; offset += 1) {
      const index =
        (((activeIndex + direction * offset) % options.length) +
          options.length) %
        options.length;
      if (!options[index].disabled) {
        setActiveIndex(index);
        return;
      }
    }
  }

  function search(character: string) {
    const now = Date.now();
    const previous =
      now - typeahead.current.time < 650 ? typeahead.current.text : "";
    const text = `${previous}${character.toLocaleLowerCase()}`;
    typeahead.current = { text, time: now };
    const repeated = Array.from(text).every((letter) => letter === text[0]);
    const query = repeated ? text[0] : text;
    const current = expanded ? activeIndex : selectedIndex;
    const start = repeated || !previous ? current + 1 : current;
    for (let offset = 0; offset < options.length; offset += 1) {
      const index =
        (((start + offset) % options.length) + options.length) % options.length;
      if (
        !options[index].disabled &&
        options[index].label.toLocaleLowerCase().startsWith(query)
      ) {
        setActiveIndex(index);
        setOpen(true);
        return;
      }
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Tab") {
      close();
      return;
    }
    if (event.key === "Escape") {
      if (expanded) {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      typeahead.current = { text: "", time: 0 };
      if (!expanded) showMenu(event.key === "ArrowUp");
      else move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      typeahead.current = { text: "", time: 0 };
      setActiveIndex(
        event.key === "Home"
          ? options.findIndex((option) => !option.disabled)
          : lastEnabled(options),
      );
      setOpen(true);
    } else if (
      event.key === "Enter" ||
      (event.key === " " &&
        (!expanded ||
          !typeahead.current.text ||
          Date.now() - typeahead.current.time >= 650))
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (expanded) choose(activeIndex);
      else showMenu();
    } else if (event.key.length === 1) {
      event.preventDefault();
      event.stopPropagation();
      search(event.key);
    }
  }

  useLayoutEffect(() => {
    if (!expanded) return;
    if (supportsPopover) menuRef.current?.showPopover();
    function updatePosition() {
      const button = buttonRef.current;
      const menu = menuRef.current;
      const list = listRef.current;
      if (!button || !menu || !list) return;
      const bounds = button.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const edge = 8;
      const gap = 8;
      const availableWidth = Math.max(0, viewportWidth - edge * 2);
      const width = Math.min(Math.max(bounds.width, 260), availableWidth);
      const left = Math.max(
        viewportLeft + edge,
        Math.min(bounds.left, viewportLeft + viewportWidth - width - edge),
      );
      const below = Math.max(
        0,
        viewportTop + viewportHeight - bounds.bottom - gap - edge,
      );
      const above = Math.max(0, bounds.top - viewportTop - gap - edge);
      const contentHeight = Math.max(
        64,
        menu.scrollHeight - list.clientHeight + list.scrollHeight,
      );
      const side =
        below >= Math.min(240, contentHeight) || below >= above
          ? "bottom"
          : "top";
      const maxHeight = Math.min(360, side === "bottom" ? below : above);
      const height = Math.min(contentHeight, maxHeight);
      const preferredTop =
        side === "bottom" ? bounds.bottom + gap : bounds.top - gap - height;
      const top = Math.max(
        viewportTop + edge,
        Math.min(preferredTop, viewportTop + viewportHeight - height - edge),
      );
      const next = { top, left, width, maxHeight, side } satisfies MenuPosition;
      setPosition((previous) =>
        previous &&
        Object.keys(next).every(
          (key) =>
            previous[key as keyof MenuPosition] ===
            next[key as keyof MenuPosition],
        )
          ? previous
          : next,
      );
    }
    updatePosition();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updatePosition)
        : null;
    if (buttonRef.current) observer?.observe(buttonRef.current);
    if (menuRef.current) observer?.observe(menuRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [expanded, options, supportsPopover]);

  useEffect(() => {
    if (!expanded) return;
    const active = options[activeIndex];
    if (!active || active.disabled) {
      setActiveIndex(options.findIndex((option) => !option.disabled));
      return;
    }
    document
      .getElementById(optionId(activeIndex))
      ?.scrollIntoView?.({ block: "nearest" });
  }, [expanded, activeIndex, options]);

  useEffect(() => {
    if (!expanded) return;
    function outside(event: Event) {
      if (!(event.target instanceof Node)) return;
      if (
        !buttonRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      )
        close();
    }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("keydown", escape, true);
    };
  }, [expanded, close]);

  useEffect(() => {
    if (disabled) close();
  }, [disabled, close]);

  const modalRoot = buttonRef.current?.closest("[data-hub-modal-root]");
  const dialogRoot = buttonRef.current?.closest(
    '[role="dialog"], [role="alertdialog"]',
  );
  const portalRoot =
    (supportsPopover ? dialogRoot : modalRoot) ??
    (typeof document === "undefined" ? null : document.body);
  const menuStyle = {
    top: position?.top ?? 0,
    left: position?.left ?? 0,
    width: position?.width ?? 260,
    "--select-max-height": `${position?.maxHeight ?? 360}px`,
    visibility: position ? "visible" : "hidden",
  } as CSSProperties;

  return (
    <div className={clsx("hub-select-field", className)}>
      <label
        id={`${id}-label`}
        htmlFor={id}
        className={clsx("hub-control-label", hideLabel && "hub-sr-only")}
      >
        {label}
      </label>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        className="hub-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? `${id}-list` : undefined}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        title={disabled && disabledReason ? disabledReason : selected?.label}
        aria-activedescendant={
          expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined
        }
        onClick={() => (expanded ? close() : showMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="hub-select-value">
          {selected?.swatch && (
            <span
              className="hub-select-swatch"
              style={{ backgroundColor: selected.swatch }}
              aria-hidden="true"
            />
          )}
          <span>{selected?.label ?? "Choose an option"}</span>
        </span>
        <ChevronDown
          size={16}
          className="hub-select-chevron"
          aria-hidden="true"
        />
      </button>
      {hint && (
        <span id={`${id}-hint`} className="hub-control-hint">
          {hint}
        </span>
      )}
      {expanded &&
        portalRoot &&
        createPortal(
          <div
            ref={menuRef}
            popover={supportsPopover ? "manual" : undefined}
            className="hub-select-popover"
            style={menuStyle}
            data-side={position?.side ?? "bottom"}
            onPointerDown={(event) => event.preventDefault()}
          >
            <div className="hub-select-menu-heading" aria-hidden="true">
              <span>{label}</span>
              <span>Choose one</span>
            </div>
            <ul
              ref={listRef}
              id={`${id}-list`}
              role="listbox"
              aria-labelledby={`${id}-label`}
              className="hub-select-menu"
            >
              {options.map((option, index) => {
                const detail =
                  option.disabled && option.disabledReason
                    ? option.disabledReason
                    : option.description;
                return (
                  <li
                    key={`${typeof option.value}:${option.value}`}
                    id={optionId(index)}
                    role="option"
                    aria-label={option.label}
                    aria-selected={option.value === value}
                    aria-disabled={option.disabled || undefined}
                    aria-describedby={
                      detail ? `${optionId(index)}-detail` : undefined
                    }
                    className="hub-select-option"
                    data-active={index === activeIndex}
                    data-disabled={option.disabled || undefined}
                    onPointerMove={() => {
                      if (!option.disabled && activeIndex !== index)
                        setActiveIndex(index);
                    }}
                    onClick={() => choose(index)}
                  >
                    <span className="hub-select-option-copy">
                      <span className="hub-select-option-label">
                        {option.swatch && (
                          <span
                            className="hub-select-swatch"
                            style={{ backgroundColor: option.swatch }}
                            aria-hidden="true"
                          />
                        )}
                        <span>{option.label}</span>
                      </span>
                      {detail && (
                        <span
                          id={`${optionId(index)}-detail`}
                          className="hub-select-option-description"
                        >
                          {detail}
                        </span>
                      )}
                    </span>
                    <span
                      className="hub-select-option-status"
                      aria-hidden="true"
                    >
                      {option.disabled ? (
                        <LockKeyhole size={13} />
                      ) : option.value === value ? (
                        <Check size={16} />
                      ) : null}
                    </span>
                  </li>
                );
              })}
              {!options.length && (
                <li role="presentation" className="hub-select-empty">
                  No options available
                </li>
              )}
            </ul>
          </div>,
          portalRoot,
        )}
    </div>
  );
}
