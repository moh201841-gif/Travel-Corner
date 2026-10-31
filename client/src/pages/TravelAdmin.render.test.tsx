/**
 * Travel Corner — the composed /admin page (Phase 3a regression test).
 *
 * The Phase 1 password login was unreachable in production even though its route, its session and
 * the AdminLogin component were each tested: DashboardLayout calls useAuth itself and, with no user,
 * returned its own Manus OAuth sign-in screen without rendering children. Nothing rendered the real
 * page tree, so the gate above AdminLogin was never exercised.
 *
 * This renders TravelAdminPage exactly as the router mounts it — layout, gate and all — with
 * react-dom/server, which needs no DOM library. Only the auth state is mocked; both TravelAdminPage
 * and DashboardLayout read the same mocked hook, so the composition under test is the real one.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { renderToStaticMarkup } from "react-dom/server";
import superjson from "superjson";
import { trpc } from "@/lib/trpc";
import type { User } from "../../../drizzle/schema";

const startLogin = vi.fn();
vi.mock("@/const", () => ({
  startLogin: () => startLogin(),
  COOKIE_NAME: "app_session_id",
  ONE_YEAR_MS: 365 * 24 * 60 * 60 * 1000,
}));

type AuthState = { user: User | null; loading: boolean };
let authState: AuthState = { user: null, loading: false };
const logout = vi.fn();
const refresh = vi.fn();

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: authState.user,
    loading: authState.loading,
    error: null,
    isAuthenticated: Boolean(authState.user),
    logout,
    refresh,
  }),
}));

import { TravelAdminPage } from "./TravelAdmin";

const ADMIN: User = {
  id: 1,
  openId: "owner-open-id",
  name: "Travel Corner administrator",
  email: null,
  loginMethod: "password",
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const NON_ADMIN: User = { ...ADMIN, id: 2, openId: "regular-user", role: "user" };

/** The browser globals the real component tree touches during render. */
function stubBrowserGlobals() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
  // wouter reads location.pathname while rendering the signed-in layout chrome.
  vi.stubGlobal("location", {
    pathname: "/admin",
    search: "",
    hash: "",
    origin: "http://localhost",
    href: "http://localhost/admin",
  });
  vi.stubGlobal("addEventListener", () => {});
  vi.stubGlobal("removeEventListener", () => {});
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }));
}

/**
 * The real providers, so the dashboard body's tRPC hooks resolve. No request is made: a server
 * render never fetches, so each query stays in its loading state and the components render the real
 * loading UI around the chrome under test.
 */
function render(state: AuthState): string {
  authState = state;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const trpcClient = trpc.createClient({
    links: [httpBatchLink({ url: "http://localhost/api/trpc", transformer: superjson })],
  });

  return renderToStaticMarkup(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <TravelAdminPage />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

beforeAll(stubBrowserGlobals);
afterAll(() => vi.unstubAllGlobals());

afterEach(() => {
  startLogin.mockClear();
  logout.mockClear();
  refresh.mockClear();
});

describe("/admin while signed out", () => {
  it("shows the independent password form", () => {
    const html = render({ user: null, loading: false });

    expect(html).toContain("Administrator sign-in");
    expect(html).toContain('type="password"');
    expect(html).toContain("Sign in");
  });

  it("does not show the Manus OAuth sign-in screen", () => {
    const html = render({ user: null, loading: false });

    // The exact copy DashboardLayout renders when it short-circuits on a missing user.
    expect(html).not.toContain("Sign in to continue");
    expect(html).not.toContain("Continue to launch the login flow");
  });

  it("triggers no OAuth redirect while rendering", () => {
    render({ user: null, loading: false });

    expect(startLogin).not.toHaveBeenCalled();
  });

  it("renders no sidebar chrome, since the layout is bypassed until sign-in", () => {
    const html = render({ user: null, loading: false });

    expect(html).not.toContain("Page 1");
    expect(html).not.toContain("Page 2");
  });
});

describe("/admin once signed in", () => {
  it("shows the administrator dashboard for an admin", () => {
    const html = render({ user: ADMIN, loading: false });

    expect(html).toContain("Content &amp; offer management");
    expect(html).toContain("Travel Corner control room");
    // The password form is gone, and so is any OAuth prompt.
    expect(html).not.toContain("Administrator sign-in");
    expect(html).not.toContain("Sign in to continue");
    expect(startLogin).not.toHaveBeenCalled();
  });

  it("keeps denying a signed-in non-admin", () => {
    const html = render({ user: NON_ADMIN, loading: false });

    expect(html).toContain("Administrator access is required.");
    expect(html).toContain("cannot manage Travel Corner packages");
    // Neither the dashboard nor a login form is offered to them.
    expect(html).not.toContain("Content &amp; offer management");
    expect(html).not.toContain("Administrator sign-in");
  });

  it("keeps the layout chrome that carries logout", () => {
    const html = render({ user: ADMIN, loading: false });

    // Logout sits inside the account dropdown, whose content Radix only mounts once opened, so a
    // static render can see the trigger but not the item. The trigger is the guarantee that matters:
    // the signed-in path still goes through the layout, so logout is reachable as before.
    expect(html).toContain('data-slot="dropdown-menu-trigger"');
    expect(html).toContain("Travel Corner administrator");
    expect(html).toContain('data-slot="sidebar-footer"');
  });
});

describe("/admin while the session is still loading", () => {
  it("shows neither the password form nor an OAuth prompt", () => {
    const html = render({ user: null, loading: true });

    expect(html).not.toContain("Administrator sign-in");
    expect(html).not.toContain("Sign in to continue");
    expect(startLogin).not.toHaveBeenCalled();
  });
});
