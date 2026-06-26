import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import nock from 'nock';
import { createClient } from '../../src/index.ts';

const SESSION_HEADER = 'x-base44-app-session';
const TURNSTILE_HEADER = 'cf-turnstile-response';

// Control the Turnstile util so these tests don't need a real browser/DOM.
const getTurnstileToken = vi.fn();
vi.mock('../../src/utils/turnstile.ts', () => ({
  getTurnstileToken: (...args: unknown[]) => getTurnstileToken(...args),
}));

describe('BUG-438 app-session token on Core integration calls', () => {
  let base44: ReturnType<typeof createClient>;
  let scope: nock.Scope;
  const appId = 'test-app-id';
  const serverUrl = 'https://base44.app';
  const sessionPath = `/api/apps/${appId}/integration-session`;

  beforeEach(() => {
    base44 = createClient({ serverUrl, appId });
    scope = nock(serverUrl);
    getTurnstileToken.mockReset();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('mints without a challenge and attaches the session header', async () => {
    scope.get(sessionPath).reply(200, { turnstile_required: false, turnstile_site_key: null });
    let sentSession: string | undefined;
    scope.post(sessionPath).reply(function () {
      sentSession = this.req.headers[SESSION_HEADER] as unknown as string;
      return [200, { session_token: 'tok-123', expires_in: 1800 }];
    });
    scope.post(`/api/apps/${appId}/integration-endpoints/Core/InvokeLLM`).reply(function () {
      return [200, this.req.headers[SESSION_HEADER] === 'tok-123' ? 'ok' : 'no-header'];
    });

    const result = await base44.integrations.Core.InvokeLLM({ prompt: 'hi' });
    expect(result).toBe('ok');
    expect(sentSession).toBeUndefined(); // not sent to the mint endpoint itself
    expect(getTurnstileToken).not.toHaveBeenCalled();
    expect(scope.isDone()).toBe(true);
  });

  test('solves the Turnstile challenge and forwards the response token to mint', async () => {
    getTurnstileToken.mockResolvedValue('turnstile-tok');
    scope.get(sessionPath).reply(200, { turnstile_required: true, turnstile_site_key: '0xSITE' });
    let sentTurnstile: string | undefined;
    scope.post(sessionPath).reply(function () {
      sentTurnstile = this.req.headers[TURNSTILE_HEADER] as unknown as string;
      return [200, { session_token: 'tok-abc', expires_in: 1800 }];
    });
    scope.post(`/api/apps/${appId}/integration-endpoints/Core/InvokeLLM`).reply(function () {
      return [200, this.req.headers[SESSION_HEADER] === 'tok-abc' ? 'ok' : 'no-header'];
    });

    const result = await base44.integrations.Core.InvokeLLM({ prompt: 'hi' });
    expect(result).toBe('ok');
    expect(getTurnstileToken).toHaveBeenCalledWith('0xSITE');
    expect(sentTurnstile).toBe('turnstile-tok');
    expect(scope.isDone()).toBe(true);
  });

  test('mints once and reuses the token across calls', async () => {
    scope.get(sessionPath).once().reply(200, { turnstile_required: false });
    scope.post(sessionPath).once().reply(200, { session_token: 'tok-abc', expires_in: 1800 });
    const seen: (string | undefined)[] = [];
    scope.post(`/api/apps/${appId}/integration-endpoints/Core/InvokeLLM`).twice().reply(function () {
      seen.push(this.req.headers[SESSION_HEADER] as unknown as string);
      return [200, 'ok'];
    });

    await base44.integrations.Core.InvokeLLM({ prompt: 'one' });
    await base44.integrations.Core.InvokeLLM({ prompt: 'two' });
    expect(seen).toEqual(['tok-abc', 'tok-abc']);
    expect(scope.isDone()).toBe(true);
  });

  test('proceeds without the header when minting fails (best-effort)', async () => {
    scope.get(sessionPath).reply(500, { message: 'boom' });
    let sentHeader: string | undefined = 'unset';
    scope.post(`/api/apps/${appId}/integration-endpoints/Core/InvokeLLM`).reply(function () {
      sentHeader = this.req.headers[SESSION_HEADER] as unknown as string;
      return [200, 'ok'];
    });

    const result = await base44.integrations.Core.InvokeLLM({ prompt: 'hi' });
    expect(result).toBe('ok');
    expect(sentHeader).toBeUndefined();
    expect(scope.isDone()).toBe(true);
  });
});
