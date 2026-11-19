/** The app's built files, when the server serves them itself (STATIC_DIR). */

import type { Hono } from "hono";
import { serveStatic } from "hono/bun";

/** Registered last: every path no route took belongs to the app's router. */
export const mountStatic = (app: Hono, root: string) => {
  // `precompressed`: the .br or .gz made at build time (dev/precompress.ts), as the browser
  // accepts; Caddy passes an encoded answer on as it is.
  app.use(
    "/assets/*",
    serveStatic({
      root,
      precompressed: true,
      onFound: (_path, c) => c.header("cache-control", "public, max-age=31536000, immutable"),
    }),
  );
  // The service worker, the page and the manifest are asked for again every time: a new
  // version must never hang in a cache (the worker itself then caches by content hash).
  const fresh = (path: string) => /(\/service-worker\.js|\.html|\.webmanifest)$/.test(path);
  app.use(
    "*",
    serveStatic({
      root,
      precompressed: true,
      onFound: (path, c) => {
        if (fresh(path)) c.header("cache-control", "no-cache");
      },
    }),
  );
  // Every other path belongs to the app's router.
  app.get(
    "*",
    serveStatic({
      root,
      path: "index.html",
      precompressed: true,
      onFound: (_path, c) => c.header("cache-control", "no-cache"),
    }),
  );
};
