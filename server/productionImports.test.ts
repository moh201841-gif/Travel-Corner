/**
 * Travel Corner — the production entry point must not need devDependencies (Phase 3b).
 *
 * `server/_core/index.ts` used to import `./vite`, which statically imports `vite` and
 * vite.config.ts, and through that the dev-only plugins. Static ESM imports are evaluated eagerly,
 * so the built server required five devDependencies merely to start — meaning any deployment that
 * installed production dependencies only would crash on boot. The Vite dev middleware is now loaded
 * with a dynamic import inside the development branch instead.
 *
 * This walks the *static* import graph from the production entry point and fails if it ever reaches
 * one of those packages again. It reads source rather than the build output, so it needs no build
 * step and it catches the mistake wherever in the graph someone reintroduces it.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ENTRY = path.join(REPO_ROOT, "server", "_core", "index.ts");

/** Packages that exist only in devDependencies and must never be reachable eagerly. */
const DEV_ONLY_PACKAGES = [
  "vite",
  "vite-plugin-manus-runtime",
  "@vitejs/plugin-react",
  "@tailwindcss/vite",
  "@builder.io/vite-plugin-jsx-loc",
  "drizzle-kit",
  "vitest",
  "tsx",
] as const;

/** Strip comments so a specifier mentioned in prose is not mistaken for an import. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Static import and re-export specifiers. A dynamic `import("…")` is deliberately not matched:
 * `import` must be followed by whitespace, and the call form never starts a line here.
 */
function staticSpecifiers(source: string): string[] {
  const code = withoutComments(source);
  const found: string[] = [];
  for (const match of code.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g)) {
    found.push(match[1]!);
  }
  for (const match of code.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) {
    found.push(match[1]!);
  }
  return found;
}

function resolveRelative(fromFile: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(fromFile), specifier.replace(/\.js$/, ""));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), base]) {
    if (existsSync(candidate) && !candidate.endsWith(path.sep)) return candidate;
  }
  return null;
}

/** Walk the static graph from `entry`, returning the files visited and the bare packages reached. */
function staticImportGraph(entry: string): { files: string[]; packages: Set<string> } {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    for (const specifier of staticSpecifiers(readFileSync(file, "utf8"))) {
      if (specifier.startsWith(".")) {
        const resolved = resolveRelative(file, specifier);
        if (resolved) queue.push(resolved);
        continue;
      }
      if (specifier.startsWith("@shared/")) {
        const resolved = resolveRelative(path.join(REPO_ROOT, "shared", "x"), `./${specifier.slice("@shared/".length)}`);
        if (resolved) queue.push(resolved);
        continue;
      }
      if (specifier.startsWith("server/")) {
        const resolved = resolveRelative(REPO_ROOT, `./${specifier}`);
        if (resolved) queue.push(resolved);
        continue;
      }
      if (specifier.startsWith("node:")) continue;
      // A bare specifier: record the package name, scope included.
      const parts = specifier.split("/");
      packages.add(specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!);
    }
  }

  return { files: [...seen], packages };
}

describe("production entry point import graph", () => {
  it("walks a non-trivial graph, so the assertions below cannot pass vacuously", () => {
    const { files, packages } = staticImportGraph(ENTRY);

    expect(files.length).toBeGreaterThan(8);
    // Sanity: the things the server genuinely does need at runtime are present.
    expect(packages).toContain("express");
    expect(packages).toContain("drizzle-orm");
  });

  it("never reaches a devDependency", () => {
    const { packages } = staticImportGraph(ENTRY);

    const reached = DEV_ONLY_PACKAGES.filter((name) => packages.has(name));
    expect(
      reached,
      `server/_core/index.ts statically imports ${reached.join(", ")}, so the production server ` +
        `would need devDependencies to start. Load it with a dynamic import inside the development branch.`
    ).toEqual([]);
  });

  it("loads the Vite dev middleware dynamically, and still loads it", () => {
    const entry = readFileSync(ENTRY, "utf8");

    // The dev path must survive: this is what keeps `pnpm dev` working.
    expect(entry).toMatch(/await import\(\s*["']\.\/vite["']\s*\)/);
    expect(entry).toContain('process.env.NODE_ENV === "development"');
    // And production static serving must come from the vite-free module.
    expect(entry).toMatch(/from\s*["']\.\/serveStatic["']/);
  });

  it("keeps every runtime package it does reach in dependencies, not devDependencies", () => {
    const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const { packages } = staticImportGraph(ENTRY);

    const builtins = new Set(["fs", "path", "http", "net", "crypto", "url", "os", "stream"]);
    for (const name of packages) {
      if (builtins.has(name)) continue;
      expect(
        manifest.dependencies[name],
        `${name} is reached at startup but is not in dependencies`
      ).toBeDefined();
      expect(manifest.devDependencies[name], `${name} is reached at startup but sits in devDependencies`).toBeUndefined();
    }
  });
});
