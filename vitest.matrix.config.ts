import { defineConfig } from "vitest/config";

// Every-device mock matrix (slow): npm run test:devices
export default defineConfig({
  test: {
    include: ["src/**/*.matrix.ts"],
    testTimeout: 20000,
  },
});
