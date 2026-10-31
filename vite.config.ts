import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/src/devices/") && id.endsWith(".json")) {
            if (id.endsWith("mice.json")) return "device-mice";
            if (id.endsWith("devices.json")) return "device-keyboards";
            if (id.endsWith("registry.generated.json"))
              return "device-registry";
            if (id.endsWith("sourceArtwork.json")) return "device-artwork";
            if (
              /Layout\.json$/.test(id) ||
              id.endsWith("sourceProtocol.json") ||
              id.endsWith("sourceCatalog.json")
            )
              return "keyboard-catalog";
            return "device-metadata";
          }
          if (id.includes("/node_modules/")) {
            if (/\/(react|react-dom|scheduler)\//.test(id))
              return "react-vendor";
            if (/\/(framer-motion|motion-dom|motion-utils)\//.test(id))
              return "motion";
            if (/\/(gsap|@gsap)\//.test(id)) return "gsap";
            if (id.includes("lucide-react")) return "icons";
            if (/\/(zod|zustand)\//.test(id)) return "core";
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
