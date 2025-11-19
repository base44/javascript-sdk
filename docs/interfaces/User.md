[**@base44/sdk**](../README.md)

***

# Interface: User

An authenticated user.

## Indexable

\[`key`: `string`\]: `any`

Additional custom fields defined in your user schema. Any custom properties you've added to your user schema in your Base44 application will be available here with their configured types and values.

## Properties

### id

> **id**: `string`

Unique user identifier.

***

### email

> **email**: `string`

User's email address.

***

### name?

> `optional` **name**: `string`

User's full name.

***

### first\_name?

> `optional` **first\_name**: `string`

User's first name.

***

### last\_name?

> `optional` **last\_name**: `string`

User's last name.

***

### avatar\_url?

> `optional` **avatar\_url**: `string`

URL to user's profile picture.

***

### role?

> `optional` **role**: `string`

User's role in the application. Roles are configured in your Base44 application settings and determine the user's permissions and access levels.

***

### created\_at?

> `optional` **created\_at**: `string`

Timestamp when the user was created.

***

### updated\_at?

> `optional` **updated\_at**: `string`

Timestamp when the user was last updated.
