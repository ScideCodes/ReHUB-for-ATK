import { useEffect } from "react";
import type { SettingsMap } from "../types/schema";
import { travelHistory } from "../features/maps/mapSession";

export function useHubShortcuts(
  maps: SettingsMap[],
  activeMapId: string | null,
  selectMap: (id: string) => Promise<void>,
  disabled: boolean,
) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        disabled ||
        document.querySelector('[role="dialog"][aria-modal="true"]')
      )
        return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const textEditing =
        target?.isContentEditable ||
        target?.closest(
          'textarea,input:not([type="range"]):not([type="checkbox"]):not([type="radio"])',
        );
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        !textEditing
      ) {
        event.preventDefault();
        travelHistory(event.shiftKey ? "redo" : "undo");
        return;
      }
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat ||
        textEditing ||
        target?.closest(
          'input,select,[role="slider"],[role="radiogroup"],[role="combobox"],[role="option"],[data-center-pad]',
        )
      )
        return;
      if (/^[1-9]$/.test(event.key)) {
        const map = maps[Number(event.key) - 1];
        if (map) {
          event.preventDefault();
          void selectMap(map.id);
        }
      } else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
          event.key,
        ) &&
        maps.length
      ) {
        event.preventDefault();
        const index = Math.max(
          0,
          maps.findIndex((map) => map.id === activeMapId),
        );
        const direction =
          event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        void selectMap(
          maps[(index + direction + maps.length) % maps.length].id,
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [maps, activeMapId, selectMap, disabled]);
}
