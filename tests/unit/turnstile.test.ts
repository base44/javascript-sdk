import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTurnstileToken } from '../../src/utils/turnstile.ts';

// The SDK test env is `node` (no DOM). Stub the minimal browser surface the
// helper touches so we can exercise the render/callback flow.
function installFakeDom(turnstile: any) {
  const container: any = { style: {}, remove: vi.fn() };
  const doc: any = {
    createElement: vi.fn(() => container),
    head: { appendChild: vi.fn() },
    body: { appendChild: vi.fn() },
  };
  (globalThis as any).window = {};
  (globalThis as any).document = doc;
  (globalThis as any).turnstile = turnstile;
  return { container };
}

describe('getTurnstileToken', () => {
  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).turnstile;
    vi.restoreAllMocks();
  });

  test('returns null outside a browser', async () => {
    expect((globalThis as any).window).toBeUndefined();
    await expect(getTurnstileToken('0xSITE')).resolves.toBeNull();
  });

  test('resolves with the token from the widget callback', async () => {
    const turnstile = {
      render: vi.fn((_el: unknown, opts: any) => {
        // Simulate Cloudflare invoking the success callback.
        opts.callback('the-token');
        return 'widget-1';
      }),
      remove: vi.fn(),
    };
    installFakeDom(turnstile);

    const token = await getTurnstileToken('0xSITE');
    expect(token).toBe('the-token');
    expect(turnstile.render).toHaveBeenCalledTimes(1);
    expect(turnstile.render.mock.calls[0][1].sitekey).toBe('0xSITE');
    expect(turnstile.remove).toHaveBeenCalledWith('widget-1');
  });

  test('resolves null when the widget reports an error', async () => {
    const turnstile = {
      render: vi.fn((_el: unknown, opts: any) => {
        opts['error-callback']();
        return 'widget-2';
      }),
      remove: vi.fn(),
    };
    installFakeDom(turnstile);

    await expect(getTurnstileToken('0xSITE')).resolves.toBeNull();
  });
});
