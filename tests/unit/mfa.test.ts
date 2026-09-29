import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nock from 'nock';
import { createClient, type MfaChallenge } from '../../src/index.js';

const appId = 'mfa-app';
const origin = 'https://api.example.test';
const challenge: MfaChallenge = {
  mfa_required: true, next_step: 'verify', mfa_methods: ['totp'],
  mfa_session_token: 'restricted-challenge', expires_in_seconds: 300,
};

function client() {
  return createClient({ appId, serverUrl: origin, appBaseUrl: origin });
}

beforeEach(() => { nock.disableNetConnect(); });
afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); vi.unstubAllGlobals(); });

describe('MFA authentication boundary', () => {
  it('returns the restricted outcome without creating a session', async () => {
    const sdk = client();
    nock(origin).post(`/api/apps/${appId}/auth/login`).reply(200, challenge);
    const result = await sdk.auth.loginViaEmailPassword('user@example.test', 'password');
    expect(result).toEqual(challenge);
    expect(sdk.auth.hasToken()).toBe(false);
  });

  it('sends challenge proof explicitly and installs only the completed app session', async () => {
    const sdk = client();
    const proof = nock(origin, { reqheaders: { authorization: 'Bearer restricted-challenge' } })
      .post(`/api/apps/${appId}/auth/mfa/verify`, { code: '123456', method: 'totp' })
      .reply(200, { access_token: 'completed-session', user: { id: 'user' } });
    await sdk.auth.mfa.verify(challenge, { code: '123456', method: 'totp' });
    expect(proof.isDone()).toBe(true);
    const me = nock(origin, { reqheaders: { authorization: 'Bearer completed-session' } })
      .get(`/api/apps/${appId}/entities/User/me`).reply(200, { id: 'user' });
    expect((await sdk.auth.me()).id).toBe('user');
    expect(me.isDone()).toBe(true);
  });

  it('leaves authentication incomplete when factor verification fails', async () => {
    const sdk = client();
    nock(origin).post(`/api/apps/${appId}/auth/mfa/verify`).reply(400, {
      error: { code: 'mfa_invalid_code', message: 'Invalid code', details: {} },
    });
    await expect(sdk.auth.mfa.verify(challenge, { code: '000000', method: 'totp' })).rejects.toThrow();
    expect(sdk.auth.hasToken()).toBe(false);
  });

  it('does not install challenge credentials after email verification', async () => {
    const sdk = client();
    nock(origin).post(`/api/apps/${appId}/auth/verify-otp`).reply(200, { ...challenge, next_step: 'enroll' });
    const result = await sdk.auth.verifyOtp({ email: 'user@example.test', otpCode: '123456' });
    expect(result.mfa_required).toBe(true);
    expect(sdk.auth.hasToken()).toBe(false);
  });

  it('rejects external return URLs before requesting a managed handoff', async () => {
    const sdk = client();
    vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
    await expect(sdk.auth.mfa.continueLogin(challenge, 'https://attacker.test')).rejects.toThrow('this app');
  });
});
