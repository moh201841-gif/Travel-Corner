import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerAdminAuthRoutes } from "./adminAuth";
import { parsePort, shouldScanForPort } from "./port";
import { assertDatabaseTlsConfiguration } from "../databaseSsl";
import { serveStatic } from "./serveStatic";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Independent single-administrator login. Registered next to the OAuth routes so both identity
  // paths share the same session cookie and the same adminProcedure authorization gate.
  registerAdminAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files.
  // ./vite is imported dynamically so the production bundle never loads `vite` or the dev-only
  // plugins, and can therefore run from a production-only dependency install.
  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parsePort(process.env.PORT);
  const port = shouldScanForPort(process.env.NODE_ENV)
    ? await findAvailablePort(preferredPort)
    : preferredPort;

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

// Fail the deploy, not individual requests: the database pool is built lazily and the health check
// path is static, so a bad CA — or an SSL parameter the driver would ignore and downgrade to
// plaintext — must stop the process here. Deliberately outside startServer(), because the catch
// below reports an error and still exits 0, which would look like a clean start to the host.
assertDatabaseTlsConfiguration();

startServer().catch(console.error);
