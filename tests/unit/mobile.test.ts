import { describe, test, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { createClient } from "../../src/index.ts";

describe("Mobile module – sendNotification", () => {
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";
  const serviceToken = "service-token-123";
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;

  beforeEach(() => {
    base44 = createClient({
      serverUrl,
      appId,
      serviceToken,
    });
    scope = nock(serverUrl);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test("posts a service-role mobile notification request", async () => {
    const params = {
      userId: "app-user-1",
      title: "Order ready",
      content: "Your pickup is ready.",
      actionLabel: "Open",
      actionUrl: "https://example.com/orders/1",
      metadata: { orderId: "order-1" },
    };

    const apiResponse = {
      successfulChannels: ["mobile_push"],
      failedChannels: {},
    };

    scope
      .post(`/api/apps/${appId}/mobile/notifications`, params)
      .reply(200, apiResponse);

    const result = await base44.asServiceRole.mobile.sendNotification(params);

    expect(result).toEqual(apiResponse);
    expect(scope.isDone()).toBe(true);
  });

  test("is only exposed through asServiceRole", () => {
    expect(base44.asServiceRole.mobile).toBeDefined();
    expect((base44 as any).mobile).toBeUndefined();
  });

  test("validates required fields and length limits", async () => {
    await expect(
      base44.asServiceRole.mobile.sendNotification({
        userId: "",
        title: "Title",
        content: "Content",
      })
    ).rejects.toThrow("userId is required and must be a string");

    await expect(
      base44.asServiceRole.mobile.sendNotification({
        userId: "app-user-1",
        title: "x".repeat(101),
        content: "Content",
      })
    ).rejects.toThrow("title must be at most 100 characters");

    await expect(
      base44.asServiceRole.mobile.sendNotification({
        userId: "app-user-1",
        title: "Title",
        content: "x".repeat(501),
      })
    ).rejects.toThrow("content must be at most 500 characters");

    await expect(
      base44.asServiceRole.mobile.sendNotification({
        userId: "app-user-1",
        title: "Title",
        content: "Content",
        actionLabel: "x".repeat(51),
      })
    ).rejects.toThrow("actionLabel must be at most 50 characters");
  });

  test("validates optional metadata shape", async () => {
    await expect(
      base44.asServiceRole.mobile.sendNotification({
        userId: "app-user-1",
        title: "Title",
        content: "Content",
        metadata: [] as unknown as Record<string, unknown>,
      })
    ).rejects.toThrow("metadata must be an object");
  });
});
