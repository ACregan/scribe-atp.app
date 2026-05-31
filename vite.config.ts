import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    // without https: or trailing slash
    allowedHosts: ["member-simpson-looksmart-class.trycloudflare.com"],
  },
});
