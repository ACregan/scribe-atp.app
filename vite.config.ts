import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: process.env.VITEST ? [] : [reactRouter()],
    resolve: {
      alias: {
        "~": path.resolve(__dirname, "./app"),
      },
    },
    server: {
      allowedHosts: env.DEV_TUNNEL_HOST ? [env.DEV_TUNNEL_HOST] : undefined,
    },
  };
});
