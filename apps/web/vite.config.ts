import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";
export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "@crm/contracts": path.resolve(import.meta.dirname, "../../packages/contracts/src/index.ts") } },
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
    proxy: { "/api": { target: process.env.API_PROXY_TARGET || "http://127.0.0.1:3100" } },
  },
});
