import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: process.env.VITEST ? [] : [reactRouter()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "~": path.resolve(__dirname, "./app"),
    },
  },
  server: {
    // without https: or trailing slash
    allowedHosts: ["successful-wendy-bibliographic-colour.trycloudflare.com"],
  },
});
