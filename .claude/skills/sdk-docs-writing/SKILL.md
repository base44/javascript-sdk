---
name: sdk-docs-writing
description: Write JSDoc comments in the Base44 JavaScript SDK that produce good Mintlify reference docs. Use when adding or editing JSDoc on public types, interfaces, or methods in the SDK source, or when working on the doc generation pipeline.
---

# Base44 SDK documentation guidelines

Docs in this repo are **auto-generated** from JSDoc comments in TypeScript source files. The pipeline is:

```
.types.ts JSDoc → TypeDoc → custom Mintlify plugin → post-processing → Mintlify MDX
```

You write JSDoc. The tooling produces the final pages. This skill covers how to write JSDoc that generates clear, useful reference docs.

## Where docs come from

| File pattern | Role |
|---|---|
| `src/modules/*.types.ts` | **Public API surface** — JSDoc here becomes the published docs |
| `src/modules/*.ts` | Implementation — mark with `@internal` to hide from docs |
| `src/client.types.ts` | Client factory types |
| `src/types.ts` | Shared types |

Only types and functions **not** marked `@internal` appear in the generated docs. Implementation files should mark their exports `@internal`.

## JSDoc structure for interfaces and types

### Module interface (top-level)

Module interfaces like `EntitiesModule`, `AuthModule`, and `IntegrationsModule` are the entry points. Their JSDoc becomes the module's intro page. Write a thorough description:

```typescript
/**
 * Authentication module for managing user authentication and authorization.
 *
 * This module provides comprehensive authentication functionality including:
 * - Email/password login and registration
 * - Token management
 * - User profile access and updates
 *
 * The auth module is only available in user authentication mode (`base44.auth`).
 */
export interface AuthModule {
```

Rules for module descriptions:
- First sentence: one-line summary of what the module does.
- Follow with a list of key capabilities using markdown bullet points.
- State which authentication modes the module supports (anonymous, user, service role).
- Use `{@link ModuleName | display text}` to cross-reference other modules.

### Method documentation

Every public method needs: description, `@param` tags, `@returns`, and at least one `@example`.

```typescript
/**
 * Lists records with optional pagination and sorting.
 *
 * Retrieves all records of this type with support for sorting,
 * pagination, and field selection.
 *
 * **Note:** The maximum limit is 5,000 items per request.
 *
 * @param sort - Sort parameter, such as `'-created_date'` for descending. Defaults to `'-created_date'`.
 * @param limit - Maximum number of results to return. Defaults to `50`.
 * @param skip - Number of results to skip for pagination. Defaults to `0`.
 * @param fields - Array of field names to include in the response. Defaults to all fields.
 * @returns Promise resolving to an array of records with selected fields.
 *
 * @example
 * ```typescript
 * // Get all records
 * const records = await base44.entities.MyEntity.list();
 * ```
 *
 * @example
 * ```typescript
 * // Get first 10 records sorted by date
 * const recentRecords = await base44.entities.MyEntity.list('-created_date', 10);
 * ```
 */
```

### Interface properties

Use inline JSDoc comments. One line per property:

```typescript
export interface DeleteManyResult {
  /** Whether the deletion was successful */
  success: boolean;
  /** Number of entities that were deleted */
  deleted: number;
}
```

For properties with defaults or special behavior, use `@default`:

```typescript
/** If set to `true`, the LLM will use Google Search to gather context.
 * @default false
 */
add_context_from_internet?: boolean;
```

## Tag reference

| Tag | When to use | Notes |
|---|---|---|
| `@param name - Description.` | Every function/method parameter | Include default value in prose: "Defaults to `50`." |
| `@returns` | Every function/method | Start with "Promise resolving to..." for async methods |
| `@example` | Every public method (at least one) | Each `@example` block becomes a tab in `<CodeGroup>` |
| `@typeParam T` | Generic type parameters | Explain what the type represents and its default |
| `@throws {Error}` | Methods that throw on known conditions | Describe the condition |
| `@internal` | Implementation details hidden from docs | Use on factory functions, config interfaces, helpers |
| `@default value` | Properties with default values | The plugin renders this in the output |
| `{@link Type \| display}` | Cross-reference another type or module | Use for "see also" references |
| `{@linkcode method \| display()}` | Link to a method with code formatting | Use when saying "use X() first" |

## Writing examples

Examples are the most impactful part of the docs. The TypeDoc plugin converts each `@example` block into a `<CodeGroup>` tab.

### Format

Always use TypeScript fenced code blocks. The first comment line becomes the tab title:

```typescript
@example
```typescript
// Basic usage
const records = await base44.entities.MyEntity.list();
```
```

### Guidelines

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

## Writing style

- **Developer audience.** These are SDK reference docs for JavaScript/TypeScript developers.
- **Concise descriptions.** First sentence is a verb phrase: "Lists records...", "Creates a new...", "Sends an invitation...".
- **Sentence case** for free-text headings in JSDoc (e.g., `## Built-in User Entity`).
- **Avoid gerunds** in section headings within JSDoc. Prefer imperatives or noun phrases.
- **State environment constraints** when a method is browser-only: "Requires a browser environment and can't be used in the backend."
- **Document side effects** explicitly (e.g., "automatically sets the token for subsequent requests").
- **Link method references.** When mentioning another SDK method or module by name in JSDoc prose, always use `{@link}` or `{@linkcode}` to create a cross-reference. Never leave a method name as plain text when a link target exists.

## Doc generation pipeline

After editing JSDoc, regenerate and review:

```bash
npm run create-docs
cd docs
mint dev
```

### Pipeline configuration files

| File | Purpose |
|---|---|
| `scripts/mintlify-post-processing/category-map.json` | Maps TypeDoc output folders to nav group names |
| `scripts/mintlify-post-processing/types-to-expose.json` | Whitelist of types included in generated docs |
| `scripts/mintlify-post-processing/appended-articles.json` | Stitches helper types into host pages |
| `scripts/mintlify-post-processing/file-processing/docs-json-template.json` | Template for generated `docs.json` |

When adding a new public type, add it to `types-to-expose.json`. When a helper type should live inside another page, add it to `appended-articles.json`.

## Review checklist for multi-page changes

When a docs task touches three or more pages in `mintlify-docs` (including pages regenerated by `create-docs-local`), create a `REVIEW-CHECKLIST.md` file in the mintlify-docs repo root listing every affected page with its URL path and what to verify. Split the list into intentional changes and side-effect changes from regeneration. Add a reminder to delete the file before committing. Tell the user the checklist exists so they can work through it at their own pace.

## Checklist before submitting a PR

1. **JSDoc completeness:** Every public method has description, `@param`, `@returns`, and `@example`.
2. **`@internal` on implementation:** Factory functions, config interfaces, and helpers are marked `@internal`.
3. **Examples work:** Code examples are syntactically valid TypeScript and use the `base44.` call path.
4. **Pipeline config:** New public types are in `types-to-expose.json`. Helper types that belong on another page are in `appended-articles.json`.
5. **Generate and review:** Run `npm run create-docs` and check the output renders correctly.
6. **README:** If adding a new module or major feature, update `README.md`.
