import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../../src/index.ts";
import { platform } from "../mocks/platform/index.ts";

describe("Integrations Module", () => {
  let base44;
  const appId = "test-app-id";
  const serverUrl = "https://base44.app";

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId });
  });
  afterEach(() => base44.cleanup());

  test("Core integration sends named parameters to the endpoint", async () => {
    platform.given.integrations.emailDelivered("123456");
    const email = { to: "test@example.com", subject: "Test Email", body: "This is a test email" };
    const result = await base44.integrations.Core.SendEmail(email);
    expect(result).toEqual({ success: true, messageId: "123456" });
    expect(platform.requests.last("integrations.invoke")).toMatchObject({
      method: "POST", body: email,
      url: `${serverUrl}/api/apps/${appId}/integration-endpoints/Core/SendEmail`,
    });
  });

  test("Legacy custom package integration sends requests to its installable endpoint", async () => {
    // Kept for the SDK's backwards-compatible dynamic package API. Current Apper
    // no longer exposes installable-package integrations.
    platform.given.integrations.packageSucceeds("CustomPackage", "CustomEndpoint", { result: "custom result" });
    const params = { param1: "value1", param2: "value2" };
    const result = await base44.integrations.CustomPackage.CustomEndpoint(params);
    expect(result).toEqual({ success: true, result: "custom result" });
    expect(platform.requests.last("integrations.invoke")).toMatchObject({
      method: "POST", body: params,
      url: `${serverUrl}/api/apps/${appId}/integration-endpoints/installable/CustomPackage/integration-endpoints/CustomEndpoint`,
    });
  });

  test("Integration serializes file uploads as multipart data", async () => {
    platform.given.integrations.fileUploaded("file123");
    const file = new File(["file content"], "test.txt", { type: "text/plain" });
    const result = await base44.integrations.Core.UploadFile({ file, metadata: { type: "document" } });
    expect(result).toEqual({ success: true, fileId: "file123" });
    expect(platform.requests.last("integrations.invoke")).toMatchObject({
      method: "POST",
      body: {
        type: "multipart",
        entries: expect.arrayContaining([
          { name: "file", file: { name: "test.txt", type: "text/plain", size: 12, bytes: [...new TextEncoder().encode("file content")] } },
          { name: "metadata", value: '{"type":"document"}' },
        ]),
      },
    });
  });

  test("Integration rejects string parameters before making a request", async () => {
    await expect(base44.integrations.Core.SendEmail("invalid string parameter")).rejects.toThrow(
      "Integration SendEmail must receive an object with named parameters",
    );
    expect(platform.requests.count("integrations.invoke")).toBe(0);
  });

  test("Integration maps a named invalid-parameters platform fault", async () => {
    platform.given.integrations.emailDelivered("after-retry");
    platform.given.faults.integrations.invalidParameters("Core", "SendEmail");
    await expect(base44.integrations.Core.SendEmail({ invalid: "params" })).rejects.toMatchObject({
      status: 400, name: "Base44Error", message: "Invalid parameters", code: "INVALID_PARAMS",
    });
    await expect(base44.integrations.Core.SendEmail({ to: "valid@example.com" })).resolves.toEqual({
      success: true,
      messageId: "after-retry",
    });
  });
});
