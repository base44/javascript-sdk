# App-user MFA (experimental)

These methods target the existing unversioned app-auth API (`/api/apps/{app_id}/auth/mfa`, implicit v1) for the gated pilot. Backend deployment and API publication review must precede a public SDK release. No minimum released version is implied by this source change.

```ts
const result = await base44.auth.loginViaEmailPassword(email, password);
if (result.mfa_required) {
  await base44.auth.mfa.continueLogin(result, '/dashboard');
} else {
  window.location.href = '/dashboard';
}
```

Handle `mfa_required` after `verifyOtp()` too. Email verification alone does not finish an MFA-protected login. A challenge contains `next_step` (`enroll` or `verify`), available methods, expiry, and an opaque `mfa_session_token`; it contains no access token. Keep it in memory and never pass it to `auth.setToken()`.

`continueLogin()` opens Base44's managed `/auth/mfa` page through a one-time PKCE-bound handoff. Return URLs must remain on the app origin. Existing custom login pages must handle this outcome before navigating. Social `loginWithProvider()` returns a promise; await it to handle PKCE setup failures. Iframe login opens its popup synchronously to preserve browser user activation.

Custom factor UI can use `setupTotp`, `sendSms`, `enrollTotp`, `enrollSms`, `verify`, `verifyRecoveryCode`, and `resendSms`. Each takes the challenge explicitly and sends its credential only in that request's Authorization header. Successful enrollment/verification installs the completed app session. Display/save first-enrollment recovery codes before navigating.

```ts
await base44.auth.mfa.verify(challenge, { method: 'totp', code, remember_device: true });
base44.auth.mfa.openSecurity('/profile'); // Fresh primary authentication + factor proof
const status = await base44.auth.mfa.getStatus();
await base44.auth.mfa.resetForUser(appUserId); // Same-app admin only
```

Remembered devices last 30 days and are app-scoped. Required MFA applies at new non-SSO logins; configured enterprise SSO delegates MFA to the IdP. Existing sessions keep their normal lifecycle. SMS uses the owning workspace's integration/unified credits.

Do not automatically retry mutation POSTs: a lost success response may have consumed a challenge or recovery code. Restart primary authentication; enrollment remains. Honor `Retry-After` on throttling. An admin reset revokes sessions, clears factors and remembered devices, and requires enrollment at the next non-SSO login if policy is required.

Upgrade and test custom login clients and installed native bundles before activation. Web deployment does not upgrade installed native code.
