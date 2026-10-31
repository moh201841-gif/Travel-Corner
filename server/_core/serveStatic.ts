/**
 * Static file serving for production.
 *
 * Moved out of ./vite.ts so the production entry point never reaches that module. ./vite.ts imports
 * `vite` and vite.config.ts (and through it the dev-only plugins), and those are static ESM imports,
 * so merely importing it made the built server require five devDependencies at startup. Keeping
 * serveStatic here — on nothing but express, fs and path — lets the production server run from a
 * production-only dependency install. The development path imports ./vite dynamically instead.
 */
import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
