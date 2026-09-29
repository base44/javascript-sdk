import type { AxiosInstance } from 'axios';
import type { LoginResponse } from './auth.types.js';

/** A restricted, short-lived login outcome. It is never an access token. */
export interface MfaChallenge {
  mfa_required: true;
  next_step: 'enroll' | 'verify';
  mfa_methods: ('totp' | 'sms')[];
  mfa_session_token: string;
  expires_in_seconds: number;
  phone_hint?: string;
  access_token?: never;
  user?: never;
}

export type LoginResult = LoginResponse | MfaChallenge;
export interface MfaEnrollmentResult extends LoginResponse { backup_codes?: string[] }
export interface MfaProof { code: string; method: 'totp' | 'sms'; remember_device?: boolean }

/** App-scoped MFA. Pass the challenge credential explicitly; do not set it as the SDK token. */
export interface MfaModule {
  getStatus(): Promise<{ mfa_enabled: boolean; methods: ('totp' | 'sms')[]; backup_codes_remaining: number; policy: 'off' | 'required' }>;
  /** Requires an app admin session; resets a user in this app only. */
  resetForUser(appUserId: string): Promise<{ success: true }>;
  /** Open managed settings with fresh primary authentication and factor verification. */
  openSecurity(returnTo?: string): void;
  setupTotp(challenge: MfaChallenge): Promise<{ secret: string; secret_formatted: string; qr_code: string }>;
  sendSms(challenge: MfaChallenge, phoneNumber: string): Promise<unknown>;
  enrollTotp(challenge: MfaChallenge, code: string, rememberDevice?: boolean): Promise<MfaEnrollmentResult>;
  enrollSms(challenge: MfaChallenge, code: string, rememberDevice?: boolean): Promise<MfaEnrollmentResult>;
  verify(challenge: MfaChallenge, proof: MfaProof): Promise<LoginResponse>;
  verifyRecoveryCode(challenge: MfaChallenge, code: string, rememberDevice?: boolean): Promise<LoginResponse>;
  resendSms(challenge: MfaChallenge): Promise<unknown>;
  /** Open Base44's managed MFA flow on this app's origin. */
  continueLogin(challenge: MfaChallenge, returnTo?: string): Promise<void>;
}

export async function prepareMfaPkce(appId: string): Promise<string> {
  const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem(`app-mfa-pkce:${appId}`, verifier);
  return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

export function createMfaModule(axios: AxiosInstance, appId: string, setToken: (token: string) => void): MfaModule {
  const post = async <T>(challenge: MfaChallenge, path: string, payload = {}): Promise<T> => {
    const response = await axios.post<unknown, T>(`/apps/${appId}/auth/mfa${path}`, payload, {
      headers: { Authorization: `Bearer ${challenge.mfa_session_token}` }, withCredentials: true,
    });
    const token = (response as Partial<LoginResponse>).access_token;
    if (token) setToken(token);
    return response;
  };
  return {
    getStatus: () => axios.get(`/apps/${appId}/auth/mfa/status`),
    resetForUser: appUserId => axios.post(`/apps/${appId}/auth/mfa/reset`, { app_user_id: appUserId }),
    openSecurity(returnTo = '/') {
      const target = new URL(returnTo, window.location.origin);
      if (target.origin !== window.location.origin) throw new Error('MFA must return to this app.');
      window.location.href = `/auth/mfa?${new URLSearchParams({ security: '1', from_url: target.pathname + target.search + target.hash })}`;
    },
    setupTotp: challenge => post(challenge, '/totp/setup'),
    sendSms: (challenge, phoneNumber) => post(challenge, '/sms/send-code', { phone_number: phoneNumber }),
    enrollTotp: (challenge, code, rememberDevice = false) => post(challenge, '/totp/verify', { code, remember_device: rememberDevice }),
    enrollSms: (challenge, code, rememberDevice = false) => post(challenge, '/sms/verify', { code, remember_device: rememberDevice }),
    verify: (challenge, proof) => post(challenge, '/verify', proof),
    verifyRecoveryCode: (challenge, code, rememberDevice = false) => post(challenge, '/verify-backup', { backup_code: code, remember_device: rememberDevice }),
    resendSms: challenge => post(challenge, '/resend'),
    async continueLogin(challenge, returnTo = '/') {
      const target = new URL(returnTo, window.location.origin);
      if (target.origin !== window.location.origin) throw new Error('MFA must return to this app.');
      const codeChallenge = await prepareMfaPkce(appId);
      const handoff = await post<{ code: string }>(challenge, '/handoff', { code_challenge: codeChallenge });
      const query = new URLSearchParams({ app_id: appId, mfa_code: handoff.code, from_url: target.pathname + target.search + target.hash });
      window.location.href = `/auth/mfa?${query}`;
    },
  };
}
