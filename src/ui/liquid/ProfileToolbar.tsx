import { useState, type ReactNode } from "react";
import {
  FolderArchive,
  Layers3,
  NotebookPen,
  Plus,
  Settings2,
} from "lucide-react";
import { useHub } from "../../app/HubProvider";
import { MapList } from "../../features/maps/MapList";
import { Button, Dialog } from "../index";
import { MapQuickTools } from "./MapQuickTools";

export function ProfileToolbar({
  onBackup,
  onUtility,
  nav,
}: {
  onBackup: () => void;
  onUtility: (feature: "maps" | "device" | "system") => void;
  /** Original driver's "Mouse Configuration" section list, shown under the config files. */
  nav?: ReactNode;
}) {
  const hub = useHub();
  const [toolsOpen, setToolsOpen] = useState(false);
  return (
    <aside className="lg-map-rail glass-panel" aria-label="Saved maps">
      <div className="lg-rail-heading">
        <h2>Maps</h2>
        <Button
          size="icon"
          variant="ghost"
          aria-label="New map"
          onClick={() => hub.setNewMapOpen(true)}
        >
          <Plus size={18} />
        </Button>
      </div>
      <div
        className="lg-map-list"
        tabIndex={0}
        aria-label="Maps and local tools"
      >
        <MapList />
      </div>
      {nav}
      <div className="lg-rail-footer">
        <span className="lg-rail-note">Saved on this computer</span>
        <div className="lg-rail-utilities">
          <Button
            className="lg-compact-map-tools"
            aria-label="Selected map notes and actions"
            title="Selected map notes and actions"
            icon={<NotebookPen size={17} />}
            disabled={!hub.map}
            onClick={() => setToolsOpen(true)}
          />
          <Button
            aria-label="Manage maps"
            title="Manage maps"
            data-feature="maps"
            aria-current={hub.feature === "maps" ? "page" : undefined}
            icon={<Layers3 size={17} />}
            onClick={() => onUtility("maps")}
          ></Button>
          <Button
            aria-label="Import & export"
            title="Import & export"
            icon={<FolderArchive size={17} />}
            onClick={onBackup}
          ></Button>
          <Button
            aria-label="Settings & tools"
            title="Settings & tools"
            data-feature="system"
            aria-current={hub.feature === "system" ? "page" : undefined}
            icon={<Settings2 size={17} />}
            onClick={() => onUtility("system")}
          ></Button>
        </div>
      </div>
      <Dialog
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        title="Selected map"
        description="Notes, settings, and local map actions."
        className="lg-map-tools-dialog"
      >
        <MapQuickTools />
      </Dialog>
    </aside>
  );
}
