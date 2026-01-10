import { describe, test, expect, beforeEach, vi } from "vitest";
import { createMobileModule } from "../../src/modules/mobile";
import { MobileModule, NotificationResult } from "../../src/modules/mobile.types";
import { AxiosInstance } from "axios";

describe("Mobile Module", () => {
  let mobileModule: MobileModule;
  let mockAxios: AxiosInstance;
  const appId = "test-app-id";

  beforeEach(() => {
    // Create mock axios instance
    mockAxios = {
      post: vi.fn().mockResolvedValue({
        data: {
          success: true,
          notificationId: "notif_123",
          channels: {
            mobile_push: { success: true },
            in_app: { success: true },
          },
        },
      }),
    } as unknown as AxiosInstance;

    mobileModule = createMobileModule(mockAxios, appId);
  });

  describe("sendNotification", () => {
    test("should send notification with required params", async () => {
      const result = await mobileModule.sendNotification({
        userId: "user_123",
        title: "Test Notification",
        content: "This is a test message",
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        `/api/apps/${appId}/mobile/notifications`,
        {
          userId: "user_123",
          title: "Test Notification",
          content: "This is a test message",
        }
      );
      expect(result.success).toBe(true);
      expect(result.notificationId).toBe("notif_123");
    });

    test("should send notification with all optional params", async () => {
      const result = await mobileModule.sendNotification({
        userId: "user_123",
        title: "Test Notification",
        content: "This is a test message",
        actionLabel: "View",
        actionUrl: "/messages/456",
        channels: ["mobile_push"],
        metadata: { orderId: "order_789" },
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        `/api/apps/${appId}/mobile/notifications`,
        {
          userId: "user_123",
          title: "Test Notification",
          content: "This is a test message",
          actionLabel: "View",
          actionUrl: "/messages/456",
          channels: ["mobile_push"],
          metadata: { orderId: "order_789" },
        }
      );
      expect(result.success).toBe(true);
    });

    test("should handle specific channel selection", async () => {
      await mobileModule.sendNotification({
        userId: "user_123",
        title: "Test",
        content: "Content",
        channels: ["in_app"],
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        `/api/apps/${appId}/mobile/notifications`,
        expect.objectContaining({
          channels: ["in_app"],
        })
      );
    });

    test("should throw error when title exceeds 100 characters", async () => {
      const longTitle = "a".repeat(101);

      await expect(
        mobileModule.sendNotification({
          userId: "user_123",
          title: longTitle,
          content: "Content",
        })
      ).rejects.toThrow("Title must be 100 characters or less");
    });

    test("should allow title with exactly 100 characters", async () => {
      const maxTitle = "a".repeat(100);

      await mobileModule.sendNotification({
        userId: "user_123",
        title: maxTitle,
        content: "Content",
      });

      expect(mockAxios.post).toHaveBeenCalled();
    });

    test("should throw error when content exceeds 500 characters", async () => {
      const longContent = "a".repeat(501);

      await expect(
        mobileModule.sendNotification({
          userId: "user_123",
          title: "Title",
          content: longContent,
        })
      ).rejects.toThrow("Content must be 500 characters or less");
    });

    test("should allow content with exactly 500 characters", async () => {
      const maxContent = "a".repeat(500);

      await mobileModule.sendNotification({
        userId: "user_123",
        title: "Title",
        content: maxContent,
      });

      expect(mockAxios.post).toHaveBeenCalled();
    });

    test("should throw error when actionLabel exceeds 50 characters", async () => {
      const longActionLabel = "a".repeat(51);

      await expect(
        mobileModule.sendNotification({
          userId: "user_123",
          title: "Title",
          content: "Content",
          actionLabel: longActionLabel,
        })
      ).rejects.toThrow("Action label must be 50 characters or less");
    });

    test("should allow actionLabel with exactly 50 characters", async () => {
      const maxActionLabel = "a".repeat(50);

      await mobileModule.sendNotification({
        userId: "user_123",
        title: "Title",
        content: "Content",
        actionLabel: maxActionLabel,
      });

      expect(mockAxios.post).toHaveBeenCalled();
    });

    test("should handle API error responses", async () => {
      mockAxios.post = vi.fn().mockRejectedValue(new Error("API Error"));

      await expect(
        mobileModule.sendNotification({
          userId: "user_123",
          title: "Title",
          content: "Content",
        })
      ).rejects.toThrow("API Error");
    });

    test("should handle 404 user not found", async () => {
      mockAxios.post = vi.fn().mockRejectedValue({
        response: { status: 404 },
        message: "User not found",
      });

      await expect(
        mobileModule.sendNotification({
          userId: "nonexistent_user",
          title: "Title",
          content: "Content",
        })
      ).rejects.toMatchObject({
        response: { status: 404 },
      });
    });

    test("should handle partial channel failures", async () => {
      mockAxios.post = vi.fn().mockResolvedValue({
        data: {
          success: true,
          channels: {
            mobile_push: { success: false, error: "Push token not found" },
            in_app: { success: true },
          },
        },
      });

      const result = await mobileModule.sendNotification({
        userId: "user_123",
        title: "Title",
        content: "Content",
      });

      expect(result.success).toBe(true);
      expect(result.channels.mobile_push?.success).toBe(false);
      expect(result.channels.in_app?.success).toBe(true);
    });

    test("should pass metadata correctly", async () => {
      const metadata = {
        orderId: "order_123",
        priority: "high",
        customField: 42,
      };

      await mobileModule.sendNotification({
        userId: "user_123",
        title: "Order Update",
        content: "Your order has shipped",
        metadata,
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        `/api/apps/${appId}/mobile/notifications`,
        expect.objectContaining({
          metadata,
        })
      );
    });

    test("should handle HTML content", async () => {
      const htmlContent = "<strong>Bold</strong> and <em>italic</em> text";

      await mobileModule.sendNotification({
        userId: "user_123",
        title: "Formatted Message",
        content: htmlContent,
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        `/api/apps/${appId}/mobile/notifications`,
        expect.objectContaining({
          content: htmlContent,
        })
      );
    });

    test("should validate before making API call", async () => {
      const longTitle = "a".repeat(101);

      await expect(
        mobileModule.sendNotification({
          userId: "user_123",
          title: longTitle,
          content: "Content",
        })
      ).rejects.toThrow();

      // API should not be called if validation fails
      expect(mockAxios.post).not.toHaveBeenCalled();
    });
  });
});
