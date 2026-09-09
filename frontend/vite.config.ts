import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // loadEnv (not import.meta.env) -- this file runs in Node, before the client
  // bundle exists. "" as the third arg would load *every* var; the VITE_ prefix
  // keeps config reading the same allowlist the client does.
  const envVars = loadEnv(mode, import.meta.dirname, "VITE_");

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    server: {
      proxy: {
        // Local FastAPI backend (`uvicorn app:app --reload`, default port) by
        // default; set VITE_DEV_API_PROXY to develop the UI against the
        // deployed Render backend without running Python locally. Dev-server
        // only -- a production build has no proxy, it uses vercel.json's
        // rewrite (or VITE_API_BASE_URL). See src/lib/apiBase.ts.
        "/api": {
          target: envVars.VITE_DEV_API_PROXY || "http://127.0.0.1:8000",
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
