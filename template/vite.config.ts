import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Packages are shared from Mohit's folder two levels up.
  // Scan every source file at startup so dependencies are bundled before the first page load.
  server: { fs: { allow: ["../.."] }, warmup: { clientFiles: ["./src/**/*.tsx"] } },
  optimizeDeps: { entries: ["src/**/*.tsx"] },
});
