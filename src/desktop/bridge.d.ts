export type DesktopDevice = {
  deviceId: string;
  name: string;
  vendorId: number;
  productId: number;
};
export type DesktopPreferences = {
  closeToTray: boolean;
  launchAtLogin: boolean;
  version: string;
  canLaunchAtLogin: boolean;
};
declare global {
  interface Window {
    rehubDesktop?: {
      getPreferences(): Promise<DesktopPreferences>;
      setPreferences(
        value: Pick<DesktopPreferences, "closeToTray" | "launchAtLogin">,
      ): Promise<DesktopPreferences>;
      getChooser(): Promise<DesktopDevice[] | null>;
      chooseDevice(id: string): Promise<boolean>;
      onChooser(
        listener: (devices: DesktopDevice[] | null) => void,
      ): () => void;
      checkUpdates(): Promise<{ message: string; url?: string }>;
      disconnect(): Promise<void>;
      saveReport(text: string): Promise<boolean>;
    };
  }
}
