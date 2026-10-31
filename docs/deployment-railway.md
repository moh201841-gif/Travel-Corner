# Deploying Travel Corner on Railway

Everything here is configuration the owner applies once. **No infrastructure is created by this
repository**, and nothing in it has ever contacted Railway, MySQL or Cloudflare.

Media storage has its own page: [media-storage.md](./media-storage.md).

## Service settings

| Setting | Value |
| --- | --- |
| Root directory | repository root |
| Install | `pnpm install --frozen-lockfile` (see **Install modes** below) |
| Build command | `pnpm build` |
| Start command | `pnpm start` |
| Healthcheck path | `/` |
| `PORT` | injected by Railway — **do not set it** |
| Public networking | enable, which gives the temporary `*.up.railway.app` URL |

The Node version is pinned by both `engines.node` (`22.x`) in `package.json` and `.nvmrc` (`22`).
Do not run on Node 18: `import.meta.dirname` is undefined there and the server would resolve the
wrong static directory and 404 every asset.

`pnpm start` is `NODE_ENV=production node dist/index.js`. In production the server binds exactly the
injected `PORT` and fails loudly rather than scanning for a free one, so Railway's healthcheck always
reaches it. `GET /` is served from the built static files and touches no database, which makes it a
safe healthcheck even before MySQL is attached.

## Install modes

The production server runs from a **production-only** dependency install: `dist/index.js` no longer
imports `vite` or the dev-only plugins at startup (the Vite dev middleware is a separate chunk, loaded
only when `NODE_ENV=development`). A `pnpm install --prod` tree boots and serves correctly.

**But `drizzle-kit` is a devDependency**, so a production-only tree cannot run migrations. Pick one:

- **Simplest — a full install (the Railway default).** `pnpm install --frozen-lockfile` keeps
  devDependencies even with `NODE_ENV=production`, so both the build and `pnpm db:migrate` work in
  the same image. This is the recommended setup.
- **A production-only runtime.** Run migrations from elsewhere (see below) and accept that
  `pnpm db:migrate` is unavailable inside the deployed container.

## Database

Provision Railway's **MySQL 8** service and reference its connection string rather than copying it.
Set `TZ=UTC` on the web service, and make sure the database uses `utf8mb4`, or the Arabic content and
the `TIMESTAMP` validity windows will not round-trip.

```bash
pnpm db:migrate        # drizzle-kit migrate — applies the two committed migrations
```

Run it as a Railway **Pre-Deploy Command**, or once from a workstation with
`railway run pnpm db:migrate`. Either way devDependencies must be present.

**Never run `pnpm db:push`.** It is `drizzle-kit generate && drizzle-kit migrate`, so it would author
new migration files instead of applying the committed ones.

The committed migrations build the whole schema — all 8 tables and every modelled column, with no
drift. `server/databaseInit.test.ts` enforces that, so a fresh database comes up complete.

**TLS:** mysql2 runs `JSON.parse` on every query parameter in the connection string, so a bare
`?ssl=true` is rejected with *"SSL profile must be an object"*. If TLS is required, append a JSON
object, URL-encoded: `?ssl={"minVersion":"TLSv1.2","rejectUnauthorized":true}`. Railway's private
network (`*.railway.internal`) normally needs no TLS parameter at all.

## Environment variables

Railway exposes service variables to both the build and the runtime, which matters for the `VITE_*`
ones: they are baked into the client bundle at build time.

### Required

| Variable | Needed at | Notes |
| --- | --- | --- |
| `DATABASE_URL` | runtime, migrations | Railway MySQL reference variable |
| `JWT_SECRET` | runtime | Generate fresh; do not reuse the Manus value |
| `OWNER_OPEN_ID` | runtime | **Maximum 64 characters** — `users.openId` is `varchar(64)`, and a longer value fails the first login's insert |
| `ADMIN_PASSWORD_HASH` | runtime | scrypt digest from `pnpm admin:hash`; never the password |
| `VITE_APP_ID` | **build and runtime** | Baked into the client bundle *and* checked when the session cookie is verified. An empty value makes every session invalid. Public, not a secret; changing it signs the administrator out |
| `NODE_ENV=production` | both | Selects static serving over the Vite dev server |
| `TZ=UTC` | runtime | Timestamp correctness |

### Optional

| Variable | Purpose |
| --- | --- |
| `TRUSTED_PROXY_HOPS` | Set to `1` once Railway's hop count is confirmed, so login rate limiting is per client. See the note below |
| `SESSION_COOKIE_SAMESITE` | Defaults to `lax`, which is correct here |
| `R2_*` | Cloudflare R2 media storage — see [media-storage.md](./media-storage.md) |
| `VITE_ANALYTICS_ENDPOINT`, `VITE_ANALYTICS_WEBSITE_ID` | Umami. Both are build-time. Leave unset and the analytics tag is removed from the built HTML; set both and it ships |
| `BUILT_IN_FORGE_API_*` | Manus Forge. Still used by AI image generation, and as the media fallback until R2 is configured |

### Do not set

`PORT` (injected), `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`.

## Administrator initialization

No seed script is needed, and the procedure is safe against a fresh database.

1. Locally: `pnpm admin:hash`. It reads the password from stdin — never from a command argument — and
   prints only the digest.
2. Set `ADMIN_PASSWORD_HASH`, `OWNER_OPEN_ID`, `JWT_SECRET` and `VITE_APP_ID`.
3. Apply the migrations. The `users` table is empty at this point.
4. Visit `/admin` and sign in. The first successful login writes the administrator row
   (`role: "admin"`, keyed by `OWNER_OPEN_ID`), reads it back, and only then issues the session. If
   the row cannot be persisted it returns 503 rather than handing out a cookie that cannot
   authenticate.

The administrator identity always comes from `OWNER_OPEN_ID`; nothing in a request can nominate an
account.

## Reverse proxy, HTTPS and cookies

Railway terminates TLS, so no application-level redirect is needed. The session cookie is
`HttpOnly`, `Path=/`, `SameSite=Lax`, and `Secure` whenever `X-Forwarded-Proto` says `https` — read
from the header directly, so Express `trust proxy` is deliberately **not** configured.

**`TRUSTED_PROXY_HOPS` deserves a decision.** It decides how the login rate limiter identifies a
client, and it defaults to `0`, which ignores `X-Forwarded-For` entirely and keys on the socket
address. That cannot be forged, so the five-failure lockout cannot be bypassed — but behind a proxy
every client shares one bucket, so five wrong passwords from anyone lock the administrator out for 15
minutes. That is an availability limit only; it never grants access.

To restore per-client limiting, confirm the real hop count first — log `X-Forwarded-For` on a request
to the deployed URL and count the entries the platform appended — then set `TRUSTED_PROXY_HOPS` to
that number. Setting it **higher** than the real count makes the entry that is read caller-supplied
again, which reopens the bypass.

The limiter is in-process: it resets on restart and is per-replica.

## Validating the temporary URL

1. `GET /` → 200, the page renders. Images will be missing; see the limitation below.
2. `/en/packages`, `/ar/packages`, `/en/umrah` → 200, with RTL correct on the Arabic routes.
3. `GET /api/trpc/travel.offers` → `{"result":{"data":{"json":[]}}}` — the database path is alive and
   the fresh database is empty.
4. `GET /admin` → the independent password form, **not** a Manus OAuth prompt.
5. Sign in, then add one offer and confirm it appears on the public routes.
6. Check the deploy log shows `Server running on port <PORT>` matching the injected port.

## Known limitations

- **Nine static brand and editorial images are not in this repository** and are not in R2. The site
  deploys and runs but renders without photography, logo or favicon until they are recovered from
  Manus storage and uploaded. [media-storage.md](./media-storage.md) lists them individually.
- **The R2 round trip has never been exercised against a real bucket.** All media tests mock the AWS
  SDK.
- `server/storage.ts` and `server/_core/imageGeneration.ts` still use Manus Forge for AI image
  generation, an unrelated feature left untouched.
- CI does not run automatically on the feature branch; its `push` trigger lists only `main` and an
  older branch, so runs there need a manual dispatch.
