# Writing JSDoc Examples

Examples are the most impactful part of the docs. The TypeDoc plugin converts each `@example` block into a `<CodeGroup>` tab.

## Format

Always use TypeScript fenced code blocks. The first comment line becomes the tab title:

```typescript
@example
```typescript
// Basic usage
const records = await base44.entities.MyEntity.list();
```
```

## Guidelines

- **Start simple.** First example should be the most basic call with minimal parameters.
- **Show real patterns.** Use realistic entity names (`Task`, `User`), not abstract ones.
- **Build complexity.** Progress from basic → with options → with error handling.
- **Use `base44.` prefix.** All examples should show the call path from the SDK client: `base44.entities.X`, `base44.auth.X`, `base44.integrations.Core.X`.
- **Include error handling** for methods that can fail (auth, network calls):
  ```typescript
  @example
  ```typescript
  // With error handling
  try {
    const result = await base44.auth.loginViaEmailPassword(email, password);
  } catch (error) {
    console.error('Login failed:', error);
  }
  ```
  ```
- **Show cleanup** for subscriptions and resources:
  ```typescript
  @example
  ```typescript
  // Subscribe and clean up
  const unsubscribe = base44.entities.Task.subscribe((event) => {
    console.log(event);
  });
  // Later:
  unsubscribe();
  ```
  ```
