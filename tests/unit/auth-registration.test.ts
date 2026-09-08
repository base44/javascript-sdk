import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createClient } from "../../src/index";
import { mockHttp } from "../mocks/http";

describe("Auth registration and password recovery HTTP contracts", () => {
  const serverUrl = "https://api.base44.com";
  const appId = "registration-test";
  let client: ReturnType<typeof createClient>;
  beforeEach(() => {
    client = createClient({ serverUrl, appId });
  });
  afterEach(() => client.cleanup());
  test("register sends supplied fields without renaming or dropping challenge/referral data", async () => {
    const payload = {
      email: "new@example.test",
      password: "test-only-password",
      turnstile_token: "challenge",
      referral_code: "referral",
    };
    mockHttp({
      method: "post",
      url: `${serverUrl}/api/apps/${appId}/auth/register`,
      body: payload,
      response: { message: "Verification required" },
    });
    expect(await client.auth.register(payload)).toEqual({
      message: "Verification required",
    });
  });
  test("registration rejection preserves the platform error response", async () => {
    const payload = {
      email: "existing@example.test",
      password: "test-only-password",
    };
    mockHttp({
      method: "post",
      url: `${serverUrl}/api/apps/${appId}/auth/register`,
      body: payload,
      status: 400,
      response: { detail: "Registration rejected" },
    });
    await expect(client.auth.register(payload)).rejects.toMatchObject({
      status: 400,
      message: "Registration rejected",
    });
  });
  test("password reset request sends only the email", async () => {
    mockHttp({
      method: "post",
      url: `${serverUrl}/api/apps/${appId}/auth/reset-password-request`,
      body: { email: "reset@example.test" },
      response: { message: "Request accepted" },
    });
    expect(
      await client.auth.resetPasswordRequest("reset@example.test"),
    ).toEqual({ message: "Request accepted" });
  });
  test("password reset maps SDK camelCase to wire snake_case", async () => {
    mockHttp({
      method: "post",
      url: `${serverUrl}/api/apps/${appId}/auth/reset-password`,
      body: {
        reset_token: "test-reset-token",
        new_password: "test-new-password",
      },
      response: { message: "Password reset" },
    });
    expect(
      await client.auth.resetPassword({
        resetToken: "test-reset-token",
        newPassword: "test-new-password",
      }),
    ).toEqual({ message: "Password reset" });
  });
  test("invalid reset token retains the error status and message", async () => {
    mockHttp({
      method: "post",
      url: `${serverUrl}/api/apps/${appId}/auth/reset-password`,
      body: { reset_token: "expired", new_password: "test-new-password" },
      status: 400,
      response: { detail: "Reset token expired" },
    });
    await expect(
      client.auth.resetPassword({
        resetToken: "expired",
        newPassword: "test-new-password",
      }),
    ).rejects.toMatchObject({ status: 400, message: "Reset token expired" });
  });
});
