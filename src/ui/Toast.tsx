import { errorMessage, getDeviceErrorDetails } from "./errorMessage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "./Button";
import { transition } from "./motion";

export interface ToastMessage {
  id?: string;
  title: string;
  message?: string;
  explanation?: string;
  tone?: "success" | "error" | "info" | "warning";
  duration?: number;
  action?: { label: string; onClick: () => void | Promise<void> };
}

export interface ToastProps extends ToastMessage {
  onDismiss: () => void;
}
interface ToastApi {
  toast: (message: ToastMessage) => string;
  dismiss: (id: string) => void;
}
const ToastContext = createContext<ToastApi | null>(null);
let nextId = 0;

export function Toast({
  id,
  title,
  message,
  explanation: initialExplanation,
  tone = "info",
  duration = 5000,
  action,
  onDismiss,
}: ToastProps) {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const remaining = useRef(duration);
  const running = useRef(false);
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trackPointer = (event: PointerEvent) => {
      const bounds = element.current?.getBoundingClientRect();
      setHovered(
        !!bounds &&
          event.clientX >= bounds.left &&
          event.clientX <= bounds.right &&
          event.clientY >= bounds.top &&
          event.clientY <= bounds.bottom,
      );
    };
    const leave = () => setHovered(false);
    window.addEventListener("pointermove", trackPointer, { passive: true });
    window.addEventListener("blur", leave);
    document.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", trackPointer);
      window.removeEventListener("blur", leave);
      document.removeEventListener("pointerleave", leave);
    };
  }, []);

  const details = getDeviceErrorDetails(message);
  const displayMessage = details ? details.code : message;
  const explanation = initialExplanation ?? details?.explanation;
  useEffect(() => {
    remaining.current = duration;
  }, [duration, id]);
  useEffect(() => {
    const onVisibilityChange = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);
  useEffect(() => {
    if (
      duration <= 0 ||
      hovered ||
      focused ||
      hidden ||
      busy ||
      actionError
    )
      return;
    const started = performance.now();
    const timer = window.setTimeout(onDismiss, Math.max(0, remaining.current));
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (performance.now() - started),
      );
    };
  }, [
    tone,
    duration,
    id,
    hovered,
    focused,
    hidden,
    busy,
    actionError,
    onDismiss,
  ]);

  async function runAction() {
    if (!action || running.current) return;
    running.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await action.onClick();
      onDismiss();
    } catch (failure) {
      setActionError(errorMessage(failure, "The action failed."));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "error" || tone === "warning"
        ? CircleAlert
        : Info;
  return (
    <motion.div
      ref={element}
      layout="position"
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      aria-atomic="true"
      className={clsx(
        "hub-panel hub-panel--compact hub-toast",
        `hub-toast--${tone}`,
      )}
      initial={{ opacity: 0, y: reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : 8 }}
      transition={transition(reduced)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
    >
      <Icon size={18} className="hub-toast-icon" aria-hidden="true" />
      <div className="hub-toast-copy">
        <p className="hub-toast-title">{title}</p>
        {displayMessage && (
          <p className="hub-control-hint hub-toast-message-row">
            <span>{displayMessage}</span>
            {explanation && (
              <span
                className="hub-toast-info-trigger"
                tabIndex={0}
                aria-label={explanation}
              >
                <Info size={13} className="hub-toast-info-icon" />
                <span className="hub-toast-tooltip" role="tooltip">
                  {explanation}
                </span>
              </span>
            )}
          </p>
        )}
        {actionError && (
          <p role="alert" className="hub-inline-error">
            {actionError}
          </p>
        )}
        {action && (
          <Button
            size="small"
            variant="ghost"
            loading={busy}
            onClick={() => void runAction()}
          >
            {action.label}
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Dismiss ${title}`}
        disabled={busy}
        onClick={onDismiss}
      >
        <X size={16} aria-hidden="true" />
      </Button>
    </motion.div>
  );
}

export function ToastProvider({
  children,
  onError,
}: {
  children: ReactNode;
  /** Receives the title of every error toast (the hub's message center keeps them). */
  onError?: (title: string) => void;
}) {
  const [messages, setMessages] = useState<(ToastMessage & { id: string })[]>(
    [],
  );
  const dismiss = useCallback(
    (id: string) =>
      setMessages((items) => items.filter((item) => item.id !== id)),
    [],
  );
  const toast = useCallback((message: ToastMessage) => {
    if (message.tone === "error") onError?.(message.title);
    const id =
      message.id ??
      (message.tone === "error"
        ? `error-${message.title}`
        : `hub-toast-${++nextId}`);
    setMessages((items) =>
      [...items.filter((item) => item.id !== id), { ...message, id }].slice(-4),
    );
    return id;
  }, [onError]);
  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            className="hub-toast-viewport"
            role="region"
            aria-label="Notifications"
          >
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <Toast
                  key={message.id}
                  {...message}
                  onDismiss={() => dismiss(message.id)}
                />
              ))}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider.");
  return context;
}
