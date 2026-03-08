import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createClient } from '../../src/index.ts';

describe('Core Integrations - InvokeLLM', () => {
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;
  const appId = 'test-app-id';
  const serverUrl = 'https://base44.app';

  beforeEach(() => {
    base44 = createClient({
      serverUrl,
      appId,
    });

    scope = nock(serverUrl);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('InvokeLLM should pass model parameter to the API', async () => {
    const params = {
      prompt: 'Explain quantum computing',
      model: 'gpt_5',
    };

    scope
      .post(`/api/apps/${appId}/integration-endpoints/Core/InvokeLLM`, params)
      .reply(200, 'Quantum computing uses qubits...');

    const result = await base44.integrations.Core.InvokeLLM(params);
    expect(result).toBe('Quantum computing uses qubits...');
    expect(scope.isDone()).toBe(true);
  });

  test('InvokeLLM should work without model parameter', async () => {
    const params = {
      prompt: 'Explain quantum computing',
    };

    scope
      .post(`/api/apps/${appId}/integration-endpoints/Core/InvokeLLM`, params)
      .reply(200, 'Quantum computing uses qubits...');

    const result = await base44.integrations.Core.InvokeLLM(params);
    expect(result).toBe('Quantum computing uses qubits...');
    expect(scope.isDone()).toBe(true);
  });

  test('InvokeLLM should pass model alongside other optional parameters', async () => {
    const params = {
      prompt: 'Analyze this text',
      model: 'claude_sonnet_4_6' as const,
      response_json_schema: {
        type: 'object',
        properties: {
          sentiment: { type: 'string' },
        },
      },
    };

    const mockResponse = { sentiment: 'positive' };

    scope
      .post(`/api/apps/${appId}/integration-endpoints/Core/InvokeLLM`, params)
      .reply(200, mockResponse);

    const result = await base44.integrations.Core.InvokeLLM(params);
    expect(result).toEqual(mockResponse);
    expect(scope.isDone()).toBe(true);
  });
});
