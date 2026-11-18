import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Packages are shared from Mohit's folder two levels up.
  server: { fs: { allow: ["../.."] } },
});
