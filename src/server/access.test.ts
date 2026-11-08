import { afterEach, describe, expect, it, vi } from "vitest";
import { canSignUp, isAdmin } from "./access";

afterEach(() => vi.unstubAllEnvs());

describe("canSignUp", () => {
  it("lets anyone sign up unless sign-ups are invite-only", () => {
    vi.stubEnv("SIGNUPS", "");
    expect(canSignUp("stranger@example.test")).toBe(true);
  });

  it("only lets invited readers and admins sign up when invite-only", () => {
    vi.stubEnv("SIGNUPS", "invite");
    vi.stubEnv("INVITED_EMAILS", " friend@example.test, Other@Example.test ");
    vi.stubEnv("ADMIN_EMAILS", "me@example.test");
    expect(canSignUp("friend@example.test")).toBe(true);
    expect(canSignUp("other@example.test")).toBe(true);
    expect(canSignUp("ME@example.test")).toBe(true);
    expect(canSignUp("stranger@example.test")).toBe(false);
  });

  it("lets nobody new in when invite-only with no invites", () => {
    vi.stubEnv("SIGNUPS", "invite");
    vi.stubEnv("INVITED_EMAILS", "");
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(canSignUp("")).toBe(false);
    expect(canSignUp("stranger@example.test")).toBe(false);
  });
});

it("isAdmin ignores case and blank entries", () => {
  vi.stubEnv("ADMIN_EMAILS", "Me@Example.test,,");
  expect(isAdmin("me@example.test")).toBe(true);
  expect(isAdmin("")).toBe(false);
});
