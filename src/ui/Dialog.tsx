import { errorMessage } from "./errorMessage";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "./Button";
import { useDialog } from "./useDialog";
import { transition } from "./motion";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  onConfirm?: () => void | Promise<void>;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  footer?: ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  footer,
  className,
}: DialogProps) {
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const { dialogRef, titleId, descriptionId } = useDialog(open, () => {
    if (!busy) onClose();
  });
  useEffect(() => {
    request.current += 1;
    setBusy(false);
    setError(null);
  }, [open]);

  async function confirm() {
    if (!onConfirm || busy) return;
    const current = ++request.current;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      if (request.current === current) onClose();
    } catch (failure) {
      if (request.current === current)
        setError(errorMessage(failure, "The action failed."));
    } finally {
      if (request.current === current) setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          data-hub-modal-root
          className="hub-modal-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition(reduced)}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && !busy) onClose();
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            aria-busy={busy || undefined}
            tabIndex={-1}
            className={clsx(
              "hub-panel hub-panel--normal hub-dialog",
              className,
            )}
            initial={{
              opacity: 0,
              scale: reduced ? 1 : 0.96,
              y: reduced ? 0 : 16,
            }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduced ? 1 : 0.98, y: reduced ? 0 : 8 }}
            transition={transition(reduced)}
          >
            <div className="hub-dialog-header">
              <h2 id={titleId} className="hub-dialog-title">
                {title}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close dialog"
                disabled={busy}
                onClick={onClose}
              >
                <X size={18} aria-hidden="true" />
              </Button>
            </div>
            {description && (
              <p id={descriptionId} className="hub-dialog-description">
                {description}
              </p>
            )}
            {children && <div className="hub-dialog-body">{children}</div>}
            {error && (
              <p role="alert" className="hub-inline-error">
                {error}
              </p>
            )}
            <div className="hub-dialog-footer">
              {footer ?? (
                <>
                  <Button onClick={onClose} disabled={busy} data-autofocus>
                    {onConfirm ? cancelLabel : "Close"}
                  </Button>
                  {onConfirm && (
                    <Button
                      variant={destructive ? "danger" : "primary"}
                      loading={busy}
                      onClick={() => void confirm()}
                    >
                      {confirmLabel}
                    </Button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
