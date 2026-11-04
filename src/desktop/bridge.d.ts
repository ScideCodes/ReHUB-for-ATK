export type DesktopDevice = {
  deviceId: string;
  name: string;
  vendorId: number;
  productId: number;
};
export type DesktopUpdate = { version: string; url: string; canInstall: boolean };
export type DesktopPreferences = {
  closeToTray: boolean;
  launchAtLogin: boolean;
  autoUpdate: boolean;
  version: string;
  canLaunchAtLogin: boolean;
};
declare global {
  interface Window {
    rehubDesktop?: {
      getPreferences(): Promise<DesktopPreferences>;
      setPreferences(
        value: Pick<DesktopPreferences, "closeToTray" | "launchAtLogin" | "autoUpdate">,
      ): Promise<DesktopPreferences>;
      getChooser(): Promise<DesktopDevice[] | null>;
      chooseDevice(id: string): Promise<boolean>;
      onChooser(
        listener: (devices: DesktopDevice[] | null) => void,
      ): () => void;
      checkUpdates(): Promise<{ message: string; url?: string }>;
      getUpdate(): Promise<DesktopUpdate | null>;
      installUpdate(): Promise<void>;
      onUpdate(listener: (update: DesktopUpdate) => void): () => void;
      disconnect(): Promise<void>;
      saveReport(text: string): Promise<boolean>;
    };
  }
}
