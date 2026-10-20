import { render } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import App, { makeQueryClient } from "../App.jsx";
import { routes } from "../router.jsx";
import { ToastProvider } from "../components/Toast.jsx";

/** JSON Response helper for mocked fetch. */
export const json = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Mock fetch with a table of handlers: { "POST /api/auth/login": (body) => json(200, …) }.
 * A key may include the query string; otherwise the path alone matches. Multipart bodies are passed
 * as the FormData itself. Unlisted requests answer 404. Returns the mock so tests can inspect calls.
 */
export function mockApi(table) {
  const fn = vi.fn(async (url, init = {}) => {
    const method = init.method ?? "GET";
    const handler = table[`${method} ${url}`] ?? table[`${method} ${String(url).split("?")[0]}`];
    if (!handler) return json(404, { error: { code: "NOT_FOUND", message: "Not found" } });
    const body = init.body instanceof FormData ? init.body : init.body ? JSON.parse(init.body) : undefined;
    return handler(body, url);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Renders the whole app (real routes, guards, auth events) at `path`. */
export function renderApp(path = "/") {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(<App router={router} />);
  return { router, ...utils };
}

/** Renders a component with Query + Toast providers. */
export function renderWithProviders(ui) {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

export const citizen = { id: "c1", name: "Asha Patil", email: "asha@example.com", role: "CITIZEN", departmentId: null, emailVerified: true, mustChangePassword: false };
export const admin = { id: "a1", name: "Roads Admin", email: "admin.construction@nagarsetu.local", role: "ADMIN", departmentId: "d1", emailVerified: true, mustChangePassword: false };
export const contractor = { id: "k1", name: "Kulkarni Infra", email: "k@example.com", role: "CONTRACTOR", departmentId: null, emailVerified: true, mustChangePassword: false };
