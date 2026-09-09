import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createClient } from "../../src/index";
import { platform } from "../mocks/platform";

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
    platform.given.app(appId).auth.registration(payload.email, {
      id: "new-user-id",
      message: "Verification required",
      otpExpiresInMinutes: 10,
      countryCode: "US",
    });
    expect(await client.auth.register(payload)).toEqual({
      id: "new-user-id",
      message: "Verification required",
      otp_expires_in_minutes: 10,
      country_code: "US",
    });
    expect(platform.requests.last("auth.register").body).toEqual(payload);
  });
  test("registration rejection preserves the platform error response", async () => {
    const payload = {
      email: "existing@example.test",
      password: "test-only-password",
    };
    platform.given.app(appId).faults.auth.registrationRejected(payload.email);
    await expect(client.auth.register(payload)).rejects.toMatchObject({
      status: 400,
      message: "Registration rejected",
    });
    expect(platform.requests.last("auth.register").body).toEqual(payload);
  });
  test("password reset request sends only the email", async () => {
    platform.given.app(appId).auth.passwordResetRequest("reset@example.test");
    expect(
      await client.auth.resetPasswordRequest("reset@example.test"),
    ).toEqual({ message: "Request accepted" });
    expect(platform.requests.last("auth.resetPasswordRequest").body).toEqual({
      email: "reset@example.test",
    });
  });
  test("password reset changes credentials, consumes the token, and supports subsequent SDK login", async () => {
    const account = {
      email: "reset@example.test",
      password: "old-password",
      accessToken: "reset-user-access-token",
      user: {
        id: "reset-user-id",
        app_id: appId,
        email: "reset@example.test",
        name: "Reset User",
      },
    };
    platform.given.app(appId).auth.account(account);
    platform.given
      .app(appId)
      .auth.resetToken("test-reset-token", account.email);
    expect(
      await client.auth.resetPassword({
        resetToken: "test-reset-token",
        newPassword: "test-new-password",
      }),
    ).toEqual({
      id: "reset-user-id",
      app_id: appId,
      email: "reset@example.test",
      name: "Reset User",
    });
    expect(platform.requests.last("auth.resetPassword").body).toEqual({
      reset_token: "test-reset-token",
      new_password: "test-new-password",
    });
    await expect(
      client.auth.loginViaEmailPassword(account.email, "old-password"),
    ).rejects.toMatchObject({ status: 400, message: "Invalid credentials" });
    await expect(
      client.auth.loginViaEmailPassword(account.email, "test-new-password"),
    ).resolves.toMatchObject({
      access_token: account.accessToken,
      user: account.user,
    });
    await expect(client.auth.me()).resolves.toEqual(account.user);
    await expect(
      client.auth.resetPassword({
        resetToken: "test-reset-token",
        newPassword: "another-password",
      }),
    ).rejects.toMatchObject({ status: 400, message: "Reset token invalid" });
  });
  test("invalid reset token retains the error status and message", async () => {
    platform.given.app(appId).faults.auth.resetTokenExpired("expired");
    await expect(
      client.auth.resetPassword({
        resetToken: "expired",
        newPassword: "test-new-password",
      }),
    ).rejects.toMatchObject({ status: 400, message: "Reset token expired" });
    expect(platform.requests.last("auth.resetPassword").body).toEqual({
      reset_token: "expired",
      new_password: "test-new-password",
    });
    await expect(
      client.auth.resetPassword({
        resetToken: "unknown",
        newPassword: "test-new-password",
      }),
    ).rejects.toMatchObject({ status: 400, message: "Reset token invalid" });
  });

  test("does not accept a reset token issued for another app", async () => {
    const otherAppId = "other-reset-app";
    const otherClient = createClient({ serverUrl, appId: otherAppId });
    platform.given.app(appId).auth.account({
      email: "scoped@example.test",
      password: "old-password",
      accessToken: "scoped-access-token",
      user: { id: "scoped-user", app_id: appId, email: "scoped@example.test" },
    });
    platform.given
      .app(appId)
      .auth.resetToken("app-a-reset-token", "scoped@example.test");
    await expect(
      otherClient.auth.resetPassword({
        resetToken: "app-a-reset-token",
        newPassword: "new-password",
      }),
    ).rejects.toMatchObject({ status: 400, message: "Reset token invalid" });
    otherClient.cleanup();
  });
});
