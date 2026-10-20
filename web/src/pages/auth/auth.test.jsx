import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { admin, citizen, contractor, json, mockApi, renderApp } from "../../test/utils.jsx";

const loggedOut = () => json(401, { error: { code: "NOT_AUTHENTICATED", message: "Please log in" } });
const TOKEN = "a".repeat(43);

afterEach(() => vi.unstubAllGlobals());

async function login(email = "x@example.com", password = "secret-pass") {
  await userEvent.type(await screen.findByLabelText(/Email address/), email);
  await userEvent.type(screen.getByLabelText(/^Password/), password);
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
}

describe("login and role redirect", () => {
  it.each([
    [citizen, "/citizen"],
    [admin, "/admin"],
    [contractor, "/contractor"],
  ])("$role goes to their home", async (user, path) => {
    mockApi({ "GET /api/auth/me": loggedOut, "POST /api/auth/login": () => json(200, { user, expiresInSeconds: 3600 }) });
    const { router } = renderApp("/login");
    await login();
    await waitFor(() => expect(router.state.location.pathname).toBe(path));
    expect(await screen.findByText(`Welcome, ${user.name}`)).toBeInTheDocument();
  });

  it("forces an admin with an initial password to change it first", async () => {
    mockApi({
      "GET /api/auth/me": loggedOut,
      "POST /api/auth/login": () => json(200, { user: { ...admin, mustChangePassword: true } }),
    });
    const { router } = renderApp("/login?next=%2Fadmin");
    await login();
    await waitFor(() => expect(router.state.location.pathname).toBe("/change-password"));
    expect(await screen.findByRole("heading", { name: "Change your password" })).toBeInTheDocument();
  });

  it("shows one generic error for wrong credentials", async () => {
    mockApi({ "GET /api/auth/me": loggedOut, "POST /api/auth/login": () => json(401, { error: { code: "INVALID_CREDENTIALS" } }) });
    const { router } = renderApp("/login");
    await login();
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password");
    expect(router.state.location.pathname).toBe("/login");
  });

  it("shows the lockout screen with the minutes from the server", async () => {
    mockApi({
      "GET /api/auth/me": loggedOut,
      "POST /api/auth/login": () => json(423, { error: { code: "ACCOUNT_LOCKED", details: { retryAfterMinutes: 12 } } }),
    });
    const { router } = renderApp("/login");
    await login();
    await waitFor(() => expect(router.state.location.pathname).toBe("/account-blocked"));
    expect(router.state.location.search).toBe("?reason=locked&minutes=12");
    expect(await screen.findByText("12:00 remaining")).toBeInTheDocument();
  });

  it("shows the deactivated screen", async () => {
    mockApi({ "GET /api/auth/me": loggedOut, "POST /api/auth/login": () => json(403, { error: { code: "ACCOUNT_DEACTIVATED" } }) });
    renderApp("/login");
    await login();
    expect(await screen.findByRole("heading", { name: "Your account has been deactivated" })).toBeInTheDocument();
  });
});

describe("guards (UX only)", () => {
  it("sends a logged-out visitor to login with ?next", async () => {
    mockApi({ "GET /api/auth/me": loggedOut });
    const { router } = renderApp("/admin/issues");
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toBe("?next=%2Fadmin%2Fissues");
  });

  it("sends a citizen who opens an admin URL to the citizen home", async () => {
    mockApi({ "GET /api/auth/me": () => json(200, { user: citizen }) });
    const { router } = renderApp("/admin");
    await waitFor(() => expect(router.state.location.pathname).toBe("/citizen"));
  });

  it("sends a signed-in user away from the login page", async () => {
    mockApi({ "GET /api/auth/me": () => json(200, { user: contractor }) });
    const { router } = renderApp("/login");
    await waitFor(() => expect(router.state.location.pathname).toBe("/contractor"));
  });

  it("an API 401 later in the session goes back to login", async () => {
    mockApi({ "GET /api/auth/me": () => json(200, { user: citizen }), "POST /api/auth/logout": () => new Response(null, { status: 204 }) });
    const { router } = renderApp("/citizen");
    await screen.findByText(`Welcome, ${citizen.name}`);
    const { api } = await import("../../api/client.js");
    mockApi({ "GET /api/issues/mine": () => json(401, { error: { code: "SESSION_EXPIRED" } }), "GET /api/auth/me": loggedOut });
    await api("/issues/mine").catch(() => {});
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toContain("expired=1");
  });
});

describe("signup and email OTP", () => {
  it("signs up, logs in with the same details and verifies the code", async () => {
    let verified = false;
    const fetch = mockApi({
      "GET /api/auth/me": () => (verified ? json(200, { user: citizen }) : loggedOut()),
      "POST /api/auth/signup": () => json(201, { user: { ...citizen, emailVerified: false }, otpSent: true }),
      "POST /api/auth/login": () => json(200, { user: { ...citizen, emailVerified: false } }),
      "POST /api/auth/verify-email": (body) => {
        if (body.code !== "123456") return json(400, { error: { code: "OTP_INVALID", details: { attemptsLeft: 4 } } });
        verified = true;
        return json(200, { verified: true, alreadyVerified: false });
      },
    });
    const { router } = renderApp("/signup");
    await userEvent.type(await screen.findByLabelText(/Full name/), "Asha Patil");
    await userEvent.type(screen.getByLabelText(/Email address/), "asha@example.com");
    await userEvent.type(screen.getByLabelText(/Create password/), "long-enough");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/verify-email"));
    const signupBody = JSON.parse(fetch.mock.calls.find(([u]) => u === "/api/auth/signup")[1].body);
    expect(signupBody).toEqual({ name: "Asha Patil", email: "asha@example.com", password: "long-enough" });
    expect(await screen.findByText("asha@example.com")).toBeInTheDocument();
    expect(screen.getByText(/You can ask for a new code in/)).toBeInTheDocument();

    screen.getByLabelText("Digit 1 of 6").focus();
    await userEvent.keyboard("111111");
    expect(await screen.findByText("Wrong code. Attempts left: 4.")).toBeInTheDocument();

    screen.getByLabelText("Digit 1 of 6").focus();
    await userEvent.keyboard("123456");
    await waitFor(() => expect(router.state.location.pathname).toBe("/citizen"));
  });

  it("shows EMAIL_TAKEN on the email field", async () => {
    mockApi({ "GET /api/auth/me": loggedOut, "POST /api/auth/signup": () => json(409, { error: { code: "EMAIL_TAKEN" } }) });
    renderApp("/signup");
    await userEvent.type(await screen.findByLabelText(/Full name/), "Asha");
    await userEvent.type(screen.getByLabelText(/Email address/), "asha@example.com");
    await userEvent.type(screen.getByLabelText(/Create password/), "long-enough");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
  });

  it("checks the password length before calling the server", async () => {
    const fetch = mockApi({ "GET /api/auth/me": loggedOut });
    renderApp("/signup");
    await userEvent.type(await screen.findByLabelText(/Full name/), "Asha");
    await userEvent.type(screen.getByLabelText(/Email address/), "asha@example.com");
    await userEvent.type(screen.getByLabelText(/Create password/), "short");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(fetch.mock.calls.some(([u]) => u === "/api/auth/signup")).toBe(false);
  });
});

describe("forgot and reset password", () => {
  it("always shows the same 'check your email' answer", async () => {
    mockApi({ "GET /api/auth/me": loggedOut, "POST /api/auth/forgot-password": () => json(202, { message: "x" }) });
    renderApp("/forgot-password");
    await userEvent.type(await screen.findByLabelText(/Email address/), "who@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
  });

  it("resets with the token from the link and returns to login", async () => {
    const fetch = mockApi({ "GET /api/auth/me": loggedOut, "POST /api/auth/reset-password": () => json(200, { reset: true }) });
    const { router } = renderApp(`/reset-password?token=${TOKEN}`);
    await userEvent.type(await screen.findByLabelText(/^New password/), "brand-new-pass");
    await userEvent.type(screen.getByLabelText(/Confirm password/), "brand-new-pass");
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    const body = JSON.parse(fetch.mock.calls.find(([u]) => u === "/api/auth/reset-password")[1].body);
    expect(body).toEqual({ token: TOKEN, newPassword: "brand-new-pass" });
    expect(await screen.findByText(/Your password has been changed/)).toBeInTheDocument();
  });

  it("shows a broken-link screen for a malformed token", async () => {
    mockApi({ "GET /api/auth/me": loggedOut });
    renderApp("/reset-password?token=nope");
    expect(await screen.findByRole("heading", { name: "Link not valid" })).toBeInTheDocument();
  });
});

describe("forced change password", () => {
  it("changes the password and continues to the role home", async () => {
    let changed = false;
    mockApi({
      "GET /api/auth/me": () => json(200, { user: { ...admin, mustChangePassword: !changed } }),
      "POST /api/auth/change-password": (body) => {
        if (body.currentPassword !== "initial-pass") return json(400, { error: { code: "WRONG_CURRENT_PASSWORD" } });
        changed = true;
        return json(200, { user: admin });
      },
    });
    const { router } = renderApp("/admin");
    await waitFor(() => expect(router.state.location.pathname).toBe("/change-password"));
    await userEvent.type(await screen.findByLabelText(/Initial password/), "wrong-pass");
    await userEvent.type(screen.getByLabelText(/^New password/), "new-admin-pass");
    await userEvent.type(screen.getByLabelText(/Confirm password/), "new-admin-pass");
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("The current password is wrong.")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/Initial password/));
    await userEvent.type(screen.getByLabelText(/Initial password/), "initial-pass");
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin"));
  });
});

describe("contractor invite", () => {
  it("shows the invited name and activates the account", async () => {
    mockApi({
      "GET /api/auth/me": loggedOut,
      [`GET /api/invites/${TOKEN}`]: () => json(200, { invite: { name: "Kulkarni Infra", email: "k@example.com", expiresAt: "2026-10-23T10:00:00Z" } }),
      [`POST /api/invites/${TOKEN}/accept`]: () => json(200, { user: contractor }),
    });
    const { router } = renderApp(`/invite/${TOKEN}`);
    expect(await screen.findByText("Kulkarni Infra")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Create password/), "contractor-pass");
    await userEvent.type(screen.getByLabelText(/Confirm password/), "contractor-pass");
    await userEvent.click(screen.getByRole("button", { name: "Activate account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/contractor"));
  });

  it("explains a used link", async () => {
    mockApi({ "GET /api/auth/me": loggedOut, [`GET /api/invites/${TOKEN}`]: () => json(410, { error: { code: "INVITE_USED" } }) });
    renderApp(`/invite/${TOKEN}`);
    expect(await screen.findByText("This invite link has already been used.")).toBeInTheDocument();
  });
});
