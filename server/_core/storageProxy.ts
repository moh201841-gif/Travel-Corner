/**
 * Media routes.
 *
 * Two paths are served by one handler:
 *
 *   /media/*          — objects uploaded to Cloudflare R2 by the admin dashboard.
 *   /manus-storage/*  — the route Manus Forge used. Existing database rows and the static site
 *                       assets hold URLs under it, so it stays mounted for compatibility.
 *
 * When R2 is configured, both resolve from R2 and nothing on this path contacts Manus Forge. The
 * Forge branch is kept only as the fallback for a deployment that has not been given R2 settings
 * yet, so configuring R2 is what removes the Forge dependency.
 *
 * Objects that only ever existed in Forge storage (the static brand and editorial images) are not
 * in R2 and will answer 404 once R2 is configured. Recovering them is deliberately a separate task;
 * docs/media-storage.md lists exactly which ones.
 */
import type { Express, Request, Response } from "express";
import { ENV } from "./env";
import {
  LEGACY_MEDIA_ROUTE_PREFIX,
  MEDIA_ROUTE_PREFIX,
  isR2Configured,
  isValidStorageKey,
  mediaObjectUrl,
} from "./mediaStorage";

/** Redirect to R2, either the public bucket URL or a short-lived signed GET. */
async function serveFromR2(key: string, res: Response) {
  try {
    const url = await mediaObjectUrl(key);
    // Signed URLs expire, and a public object may be replaced, so this redirect is not cacheable.
    res.set("Cache-Control", "no-store");
    res.redirect(307, url);
  } catch (error) {
    console.error("[Media] failed to resolve an object from R2:", error);
    res.status(502).send("Media backend error");
  }
}

/**
 * The previous behaviour: ask Manus Forge to presign a GET and redirect to it. Reached only when R2
 * is not configured.
 */
async function serveFromForge(key: string, res: Response) {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    console.error("[Media] no media backend configured: set the R2 variables (see .env.example)");
    res.status(503).send("Media storage is not configured");
    return;
  }

  try {
    const forgeUrl = new URL("v1/storage/presign/get", ENV.forgeApiUrl.replace(/\/+$/, "") + "/");
    forgeUrl.searchParams.set("path", key);

    const forgeResp = await fetch(forgeUrl, {
      headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
    });

    if (!forgeResp.ok) {
      const body = await forgeResp.text().catch(() => "");
      console.error(`[Media] forge error: ${forgeResp.status} ${body}`);
      res.status(502).send("Media backend error");
      return;
    }

    const { url } = (await forgeResp.json()) as { url: string };
    if (!url) {
      res.status(502).send("Empty signed URL from backend");
      return;
    }

    res.set("Cache-Control", "no-store");
    res.redirect(307, url);
  } catch (err) {
    console.error("[Media] forge request failed:", err);
    res.status(502).send("Media proxy error");
  }
}

function mediaHandler() {
  return async (req: Request, res: Response) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing media key");
      return;
    }
    // The key reaches a bucket, so it is validated before either backend sees it.
    if (!isValidStorageKey(key)) {
      res.status(400).send("Invalid media key");
      return;
    }

    if (isR2Configured()) {
      await serveFromR2(key, res);
      return;
    }
    await serveFromForge(key, res);
  };
}

export function registerStorageProxy(app: Express) {
  const handler = mediaHandler();
  app.get(`${MEDIA_ROUTE_PREFIX}*`, handler);
  app.get(`${LEGACY_MEDIA_ROUTE_PREFIX}*`, handler);
}
