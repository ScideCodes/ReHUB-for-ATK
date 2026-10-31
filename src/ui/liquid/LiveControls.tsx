import { useEffect } from "react";
import { ArrowLeftRight, Check, Info } from "lucide-react";
import { useHub } from "../../app/HubProvider";
import { useConfigStore } from "../../store/configStore";
import {
  applySettingsToDevice,
  isKnownDevice,
  isMouseSessionVerified,
  useDeviceSession,
} from "../../features/device/deviceSession";
import {
  clone,
  editSetting,
  getEditorMap,
} from "../../features/maps/mapSession";
import { Button, useToast } from "../index";
import { getDeviceErrorDetails } from "../errorMessage";
import { dismissApplyBanner, startLiveApply, useLiveApply } from "./liveApply";
import { settingsDiff } from "../../features/maps/MapDiff";

export function LiveApplyBridge() {
  const { toast } = useToast();
  useEffect(() => startLiveApply(), []);
  const status = useLiveApply((state) => state.status);
  const reason = useLiveApply((state) => state.reason);
  useEffect(() => {
    if (status === "error") {
      const details = getDeviceErrorDetails(reason);
      toast({
        title: "Not saved",
        message: details ? details.code : reason,
        explanation: details ? details.explanation : undefined,
        tone: "error",
        duration: 0,
      });
    }
  }, [status, reason, toast]);
  return null;
}

export function SaveStatus() {
  const info = useConfigStore((state) => state.deviceInfo);
  const applying = useConfigStore((state) => state.isApplying);
  const busy = useDeviceSession((state) => state.busy);
  const error = useDeviceSession((state) => state.applyError);
  const appliedAt = useDeviceSession((state) => state.appliedAt);
  const state = useLiveApply();
  useEffect(() => {
    if (!appliedAt) return;
    if (useLiveApply.getState().status !== "error")
      useLiveApply.setState({ status: "saved" });
    const timer = setTimeout(() => {
      if (useLiveApply.getState().status === "saved")
        useLiveApply.setState({ status: "live" });
    }, 2000);
    return () => clearTimeout(timer);
  }, [appliedAt]);
  const label = !info.connected
    ? "Not connected"
    : !isKnownDevice() || !isMouseSessionVerified()
      ? "Read-only"
      : applying || state.status === "saving"
        ? "Saving…"
        : state.status === "error" || error
          ? "Not saved"
          : state.status === "saved"
            ? "Saved to mouse"
            : "Live";
  const rawReason = !info.connected
    ? "Not connected: saved to this map only"
    : state.reason || error;

  const errorDetails = getDeviceErrorDetails(rawReason);
  const displayReason = errorDetails ? errorDetails.code : rawReason;

  return (
    <div className="lg-save-status" role="status" data-state={label}>
      <div className="lg-save-main-row">
        <span
          aria-hidden="true"
          className="lg-status-dot"
          data-connected={label === "Live" || label === "Saved to mouse"}
        />
        <span>{label}</span>
        {label === "Not saved" && state.retry && (
          <Button size="small" disabled={busy} onClick={() => state.retry?.()}>
            Retry
          </Button>
        )}
      </div>
      {displayReason && (
        <span className="lg-save-reason">
          <span>{displayReason}</span>
          {errorDetails && (
            <span
              className="lg-error-info-trigger"
              role="img"
              tabIndex={0}
              aria-label={errorDetails.explanation}
            >
              <Info size={13} className="lg-info-icon" />
              <span className="lg-info-tooltip" role="tooltip">
                {errorDetails.explanation}
              </span>
            </span>
          )}
        </span>
      )}
    </div>
  );
}

export function ApplyMapBanner({ onDiff }: { onDiff: () => void }) {
  const hub = useHub();
  const visible = useLiveApply((state) => state.reconnect);
  const busy = useDeviceSession((state) => state.busy);
  const connected = useConfigStore((state) => state.deviceInfo.connected);
  const active = useConfigStore((state) => state.activeSettings);
  const differs = settingsDiff(active, hub.settings).length > 0;
  if (!visible || !connected || !hub.map || hub.generic || !differs || busy)
    return null;
  return (
    <div className="lg-map-apply-banner glass-clear glass-inset">
      <span>Apply {hub.map.name} to mouse?</span>
      <Button
        onClick={() =>
          void hub.apply().then(() => {
            if (!useDeviceSession.getState().applyError) dismissApplyBanner();
          })
        }
      >
        Apply
      </Button>
      <Button onClick={onDiff}>Compare</Button>
      <Button onClick={() => dismissApplyBanner()}>Dismiss</Button>
    </div>
  );
}

export function MapComparison({ onDiff }: { onDiff: () => void }) {
  const hub = useHub();
  const connected = useConfigStore((state) => state.deviceInfo.connected);
  const active = useConfigStore((state) => state.activeSettings);
  const issues = useDeviceSession((state) => state.readIssues);
  if (!connected || !hub.map || hub.generic) return null;
  const count = settingsDiff(
    active,
    hub.settings,
    issues.map((issue) => issue.key),
  ).length;
  const label = count
    ? `${count} unapplied ${count === 1 ? "change" : "changes"}`
    : issues.length
      ? "Comparison incomplete"
      : "In sync";
  return (
    <Button
      className="lg-map-comparison"
      size="small"
      variant="ghost"
      icon={
        count || issues.length ? (
          <ArrowLeftRight size={14} />
        ) : (
          <Check size={14} />
        )
      }
      aria-label={`View diff: ${label}`}
      title="Compare this map with the last device read"
      onClick={onDiff}
    >
      {label}
    </Button>
  );
}

export function ButtonSave({ onDiff }: { onDiff?: () => void }) {
  const hub = useHub();
  const active = useConfigStore((state) => state.activeSettings);
  const connected = useConfigStore((state) => state.deviceInfo.connected);
  const busy = useDeviceSession((state) => state.busy);
  const progress = useDeviceSession((state) => state.progress);
  const changed = settingsDiff(active, hub.settings).some((diff) =>
    diff.path.startsWith("buttons"),
  );
  if (!changed) return null;
  return (
    <div className="lg-button-save-row">
      <span className="lg-button-pending-note">Unsaved button changes</span>
      {onDiff && (
        <Button size="small" onClick={onDiff}>
          Compare
        </Button>
      )}
      <Button
        size="small"
        onClick={() => editSetting("buttons", clone(active.buttons))}
      >
        Discard
      </Button>
      <Button
        variant="primary"
        disabled={!changed || !connected || hub.generic || busy}
        progress={busy ? progress : undefined}
        onClick={() =>
          void hub.run(async () => {
            const map = getEditorMap();
            if (!map) return;
            const skipped = await applySettingsToDevice({
              ...clone(useConfigStore.getState().activeSettings),
              buttons: clone(map.settings.buttons),
            });
            if (skipped.length) throw new Error(skipped.join(" · "));
          }, "Button assignments saved to mouse")
        }
      >
        Save to device
      </Button>
    </div>
  );
}
