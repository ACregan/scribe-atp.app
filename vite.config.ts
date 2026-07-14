import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv, type ViteDevServer } from "vite";
import path from "path";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

// Exported for unit testing — pure, no I/O.
export function isPathWithinRoot(filePath: string, root: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedFilePath = path.resolve(filePath);
  return (
    resolvedFilePath === resolvedRoot ||
    resolvedFilePath.startsWith(resolvedRoot + path.sep)
  );
}

// Dev only: serves IMAGE_STORAGE_ROOT at /image-storage/* — replaces nginx static serving in production.
// Run `npm run dev:image-service` alongside `npm run dev` and set IMAGE_STORAGE_ROOT in .env.
function imageStorageMiddleware(root: string) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url || "/";
    const filePath = path.join(root, decodeURIComponent(url));
    // Guard against path traversal outside IMAGE_STORAGE_ROOT — a bare
    // string-prefix check is insufficient: a request resolving to
    // "/var/scribe/images-secret/x" would incorrectly pass a check against
    // root="/var/scribe/images", since that's a valid string prefix of a
    // sibling directory's name.
    if (!isPathWithinRoot(filePath, root)) {
      next();
      return;
    }
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        next();
        return;
      }
      res.setHeader("Content-Type", "image/webp");
      fs.createReadStream(filePath).pipe(res);
    });
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      ...(process.env.VITEST ? [] : [reactRouter()]),
      ...(env.IMAGE_STORAGE_ROOT
        ? [
            {
              name: "image-storage-static",
              configureServer(server: ViteDevServer) {
                server.middlewares.use(
                  "/image-storage",
                  imageStorageMiddleware(env.IMAGE_STORAGE_ROOT),
                );
              },
            },
          ]
        : []),
    ],
    resolve: {
      alias: {
        "~": path.resolve(__dirname, "./app"),
      },
    },
    server: {
      allowedHosts: env.DEV_TUNNEL_HOST ? [env.DEV_TUNNEL_HOST] : undefined,
      proxy: {
        "/api/image-service": {
          target: "http://localhost:3009",
          changeOrigin: true,
        },
      },
    },
  };
});
