# Render + Aiven MySQL

How to run Travel Corner on Render with an Aiven MySQL database, with the server verifying Aiven's
certificate. **No infrastructure is created by this repository.** The steps below are what the owner
does once.

Media storage: [media-storage.md](./media-storage.md). The Railway notes in
[deployment-railway.md](./deployment-railway.md) still describe the build, start command and
environment variables, which are the same on any host.

## Why TLS needs a file, not a URL parameter

Aiven presents a certificate signed by its own project CA, so the client must be given that CA. None
of the URL-only approaches work, and each fails quietly:

| What you might try | What actually happens |
| --- | --- |
| `?ssl-mode=REQUIRED` (Aiven's own copy-paste URI) | mysql2 does not recognise it: logs `Ignoring invalid configuration option: ssl-mode` and leaves TLS **off**. Credentials go out in **plaintext** |
| `?ssl=true` | Throws `SSL profile must be an object` |
| `?ssl=REQUIRED` | Throws `Unknown SSL profile 'REQUIRED'` |
| `?ssl={"ca":"/etc/secrets/aiven-ca.pem"}` | The **path** is used as if it were the certificate. Node accepts it silently, loads nothing, and — because `ca` replaces the default root store — the handshake fails with an opaque verification error |
| `?ssl={"rejectUnauthorized":false}` | Encrypted but unverified, so open to interception |

So the certificate is read from disk and passed as PEM content. `DATABASE_CA_PATH` names the file;
`server/databaseSsl.ts` reads and validates it.

**Everything fails closed.** With `DATABASE_CA_PATH` set, a certificate that is missing, unreadable,
empty or unparseable raises an error instead of connecting unverified, and any of the unsupported SSL
query parameters above raises an error instead of downgrading to plaintext. The check runs before the
server listens, so a misconfiguration fails the deploy rather than letting the static health check
pass while every database request errors. Leave `DATABASE_CA_PATH` unset and the connection is
plaintext, which is what local development uses.

### Hostname verification

`rejectUnauthorized: true` alone only proves the certificate was signed by the CA — **not** that it
was issued for the host you dialled, so any server holding a certificate from the same CA would be
accepted. mysql2 gates that second check behind `ssl.verifyIdentity`, which its own typings describe
as *"You should enable this but it is disabled by default right now for backwards compatibility."*
It is enabled here, for both the server and migrations. The name verified is the hostname from
`DATABASE_URL`.

One consequence: mysql2 skips the identity check when the host is an **IP literal**, which would make
the setting silently inert. So a CA together with an IP address in `DATABASE_URL` is refused outright
— use the hostname the provider gives you.

## Setup

### 1. Aiven

1. Create a **MySQL** service. Note the host, port, user, password and database name from the service
   overview.
2. Download the service's **CA certificate** (`ca.pem`) from the same page.
3. Build `DATABASE_URL` by hand rather than copying Aiven's URI, so no `ssl-mode` parameter comes
   with it:

   ```
   mysql://<user>:<password>@<host>:<port>/<database>
   ```

   Percent-encode any `@ : / ?` in the password.

### 2. Render

1. Create a **Web Service** from the GitHub repo and set the branch to deploy.
2. Build command `pnpm install --frozen-lockfile && pnpm build`, start command `pnpm start`.
3. Add the CA as a **Secret File**: Settings → Secret Files → name it `aiven-ca.pem` and paste the
   certificate. Render mounts Secret Files at `/etc/secrets/<name>`, so it appears at
   `/etc/secrets/aiven-ca.pem`.
4. Set the environment variables (full table in
   [deployment-railway.md](./deployment-railway.md#environment-variables)); the ones specific to this
   setup are:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | the URL built above, **without** any `ssl*` parameter, addressing the server by **hostname** (not IP) |
   | `DATABASE_CA_PATH` | `/etc/secrets/aiven-ca.pem` |
   | `TZ` | `UTC` |

   Also required: `JWT_SECRET`, `OWNER_OPEN_ID` (≤ 64 characters), `ADMIN_PASSWORD_HASH`,
   `VITE_APP_ID`, `NODE_ENV=production`. Do **not** set `PORT` — Render injects it.
5. Health check path: `/`.

### 3. Migrations

```bash
pnpm db:migrate
```

Secret Files are available to the service at runtime, so run this as a Render **Pre-Deploy Command**,
where `/etc/secrets/aiven-ca.pem` is mounted and `DATABASE_CA_PATH` is set. Migrations use the same
helper and the same fail-closed validation as the server.

Two constraints:

- **`drizzle-kit` is a devDependency**, so the image must be built with devDependencies present.
  `pnpm install --frozen-lockfile` keeps them even under `NODE_ENV=production`. Do not switch to a
  production-only install for the build.
- **Never run `pnpm db:push`** — it is `drizzle-kit generate && drizzle-kit migrate` and would author
  new migration files instead of applying the committed ones.

If you prefer to migrate from a workstation, download the CA locally and point `DATABASE_CA_PATH` at
wherever you saved it; the path is not special.

## Verifying

1. Deploy log shows `Server running on port <PORT>` and **no** `Ignoring invalid configuration
   option` line. That second part is the proof TLS is actually on.
2. `GET /` → 200.
3. `GET /api/trpc/travel.offers` → `{"result":{"data":{"json":[]}}}` with no database error in the
   log — the fresh database is reachable and empty.
4. `GET /admin` → the password form.
5. Sign in. A 200 with a `Set-Cookie` is the end-to-end proof: the password verified, the
   administrator row was written to Aiven over a verified TLS connection, read back as
   `role: "admin"`, and a session was issued.
6. In the control room, open **Edit & images** on a package and save it. A success toast is the
   proof the migrations are applied: the offer write touches `validUntil` and
   `lastPriceUpdatedAt`, both added by migration `0001`, so a database carrying only `0000`
   answers "The database schema is out of date".

### Reading a sign-in failure

| What you see | What it means |
| --- | --- |
| 503 "Administrator login is not configured" | A required variable is missing, **or** `ADMIN_PASSWORD_HASH` cannot be parsed. The log line names which — `ADMIN_PASSWORD_HASH is malformed: …` — and never prints the value |
| 401 "Incorrect password" | The password does not match the configured digest. Each password belongs to one hash: if `pnpm admin:hash` was run more than once, the password and the deployed hash must come from the same run |
| 429 "Too many attempts" | Five failures from this client. It clears after 15 minutes, or on a restart (the limiter is in-process) |

Surrounding whitespace and one matching pair of quotes are stripped from `ADMIN_PASSWORD_HASH`,
`OWNER_OPEN_ID` and `VITE_APP_ID`, because a paste into a dashboard field picks those up easily and
every one of them used to produce a silent 401. `JWT_SECRET` is left exactly as configured.

### Reading a save failure in the control room

The dashboard shows the server's own message when there is one to show, so these are distinguishable
without log access: a slug already in use, an out-of-date schema (apply the migrations), an
unreachable database, unconfigured image storage, or a named form field with what is wrong with it.
Anything else falls back to a generic sentence, with the full driver error in the service log —
database text is never sent to the browser.

To confirm the fail-closed path without touching the database, temporarily point `DATABASE_CA_PATH`
at a file that does not exist: the service must exit non-zero rather than start, and the error names
the path.

## Rotating the CA

Aiven's project CA has an expiry. When it is rotated, replace the Secret File contents and redeploy.
Nothing in the repository changes. A stale CA shows up as a certificate verification failure on every
query, not as a silent fallback.
