import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createClient } from '../../src/index.ts';

describe('Integrations Module', () => {
  let base44;
  const appId = 'test-app-id';
  const serverUrl = 'https://base44.app';
  const intBase = `${serverUrl}/api/apps/${appId}/integration-endpoints`;

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId });
  });

  afterEach(() => {
    base44.cleanup();
  });

  test('Core integration should send requests to the correct endpoint', async () => {
    server.use(
      http.post(`${intBase}/Core/SendEmail`, () =>
        HttpResponse.json({ success: true, messageId: '123456' })
      )
    );

    const result = await base44.integrations.Core.SendEmail({
      to: 'test@example.com',
      subject: 'Test Email',
      body: 'This is a test email'
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('123456');
  });

  test('Custom package integration should send requests to the correct endpoint', async () => {
    server.use(
      http.post(`${intBase}/installable/CustomPackage/integration-endpoints/CustomEndpoint`, () =>
        HttpResponse.json({ success: true, result: 'custom result' })
      )
    );

    const result = await base44.integrations.CustomPackage.CustomEndpoint({
      param1: 'value1',
      param2: 'value2'
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe('custom result');
  });

  test('Integration should handle file uploads correctly', async () => {
    server.use(
      http.post(`${intBase}/Core/UploadFile`, () =>
        HttpResponse.json({ success: true, fileId: 'file123' })
      )
    );

    const mockFile = new Blob(['file content'], { type: 'text/plain' });
    mockFile.name = 'test.txt';

    const result = await base44.integrations.Core.UploadFile({
      file: mockFile,
      metadata: { type: 'document' }
    });

    expect(result.success).toBe(true);
    expect(result.fileId).toBe('file123');
  });

  test('Integration should throw error with string parameters', async () => {
    await expect(async () => {
      await base44.integrations.Core.SendEmail('invalid string parameter');
    }).rejects.toThrow('Integration SendEmail must receive an object with named parameters');
  });

  test('Integration should handle API errors correctly', async () => {
    server.use(
      http.post(`${intBase}/Core/SendEmail`, () =>
        HttpResponse.json({ detail: 'Invalid parameters', code: 'INVALID_PARAMS' }, { status: 400 })
      )
    );

    await expect(base44.integrations.Core.SendEmail({ invalid: 'params' }))
      .rejects.toMatchObject({
        status: 400,
        name: 'Base44Error',
        message: 'Invalid parameters',
        code: 'INVALID_PARAMS'
      });
  });
});
