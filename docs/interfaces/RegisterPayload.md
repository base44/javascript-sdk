[**@base44/sdk**](../README)

***

# Interface: RegisterPayload

Payload for user registration.

## Properties

### email

> **email**: `string`

User's email address.

***

### password

> **password**: `string`

User's password.

***

### turnstile\_token?

> `optional` **turnstile\_token**: `string` \| `null`

Optional [Cloudflare Turnstile CAPTCHA token](https://developers.cloudflare.com/turnstile/) for bot protection.

***

### referral\_code?

> `optional` **referral\_code**: `string` \| `null`

Optional [referral code](https://docs.base44.com/Getting-Started/Referral-program) from an existing user.
