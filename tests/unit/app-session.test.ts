import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createClient } from '../../src/index.ts';

const SESSION_HEADER = 'x-base44-app-session';

describe('BUG-438 app-session token on Core integration calls', () => {
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;
  const appId = 'test-app-id';
  const serverUrl = 'https://base44.app';

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId });
    scope = nock(serverUrl);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('attaches the session header when a token is minted', async () => {
    let sentHeader: string | undefined;
    scope
      .get(`/api/apps/${appId}/integration-session`)
      .reply(200, { session_token: 'tok-123', expires_in: 1800 });
    scope
      .post(`/api/apps/${appId}/integration-endpoints/Core/InvokeLLM`)
      .reply(function () {
        sentHeader = this.req.headers[SESSION_HEADER] as unknown as string;
        return [200, 'ok'];
      });

    const result = await base44.integrations.Core.InvokeLLM({ prompt: 'hi' });
    expect(result).toBe('ok');
    expect(sentHeader).toBe('tok-123');
    expect(scope.isDone()).toBe(true);
  });

  test('mints the token once and reuses it across calls', async () => {
    scope
      .get(`/api/apps/${appId}/integration-session`)
      .once() // a second mint would leave this unsatisfied → isDone() stays true only if reused
      .reply(200, { session_token: 'tok-abc', expires_in: 1800 });
    const seen: (string | undefined)[] = [];
    scope
      .post(`/api/apps/${appId}/integration-endpoints/Core/InvokeLLM`)
      .twice()
      .reply(function () {
        seen.push(this.req.headers[SESSION_HEADER] as unknown as string);
        return [200, 'ok'];
      });

    await base44.integrations.Core.InvokeLLM({ prompt: 'one' });
    await base44.integrations.Core.InvokeLLM({ prompt: 'two' });
    expect(seen).toEqual(['tok-abc', 'tok-abc']);
    expect(scope.isDone()).toBe(true);
  });

  test('proceeds without the header when minting fails (best-effort)', async () => {
    let sentHeader: string | undefined = 'unset';
    scope
      .get(`/api/apps/${appId}/integration-session`)
      .reply(500, { message: 'boom' });
    scope
      .post(`/api/apps/${appId}/integration-endpoints/Core/InvokeLLM`)
      .reply(function () {
        sentHeader = this.req.headers[SESSION_HEADER] as unknown as string;
        return [200, 'ok'];
      });

    const result = await base44.integrations.Core.InvokeLLM({ prompt: 'hi' });
    expect(result).toBe('ok');
    expect(sentHeader).toBeUndefined();
    expect(scope.isDone()).toBe(true);
  });
});
