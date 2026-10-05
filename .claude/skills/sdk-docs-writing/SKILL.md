---
name: sdk-docs-writing
description: Write JSDoc comments in the Base44 JavaScript SDK that produce good Mintlify reference docs. Use when adding or editing JSDoc on public types, interfaces, or methods in the SDK source, or when working on the doc generation pipeline.
---

# Base44 SDK documentation guidelines

Docs in this repo are **auto-generated** from JSDoc comments in TypeScript source files. The pipeline is:

```
.types.ts JSDoc → TypeDoc → custom Mintlify plugin → post-processing → Mintlify MDX
```

You write JSDoc. The tooling produces the final pages.

## Where docs come from

| File pattern | Role |
|---|---|
| `packages/sdk/src/modules/*.types.ts` | **Public API surface** — JSDoc here becomes the published docs |
| `packages/sdk/src/modules/*.ts` | Implementation — mark with `@internal` to hide from docs |
| `packages/sdk/src/client.types.ts` | Client factory types |
| `packages/sdk/src/types.ts` | Shared types |

Only types and functions **not** marked `@internal` appear in the generated docs. Implementation files should mark their exports `@internal`.

## JSDoc structure

### Module interface (top-level)

Module interfaces like `EntitiesModule`, `AuthModule`, and `IntegrationsModule` are the entry points. Their JSDoc becomes the module's intro page:

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
 */
```

## Writing style

- **Developer audience.** These are SDK reference docs for JavaScript/TypeScript developers.
- **Concise descriptions.** First sentence is a verb phrase: "Lists records...", "Creates a new...", "Sends an invitation...".
- **Sentence case** for free-text headings in JSDoc.
- **State environment constraints** when a method is browser-only: "Requires a browser environment and can't be used in the backend."
- **Document side effects** explicitly (e.g., "automatically sets the token for subsequent requests").
- **Link method references.** When mentioning another SDK method or module by name in JSDoc prose, always use `{@link}` or `{@linkcode}` to create a cross-reference.

## Punctuation in prose

JSDoc prose renders straight into the published reference, so it follows the same punctuation rules as the hand-written docs. Prefer periods and commas. A sentence that needs a colon, a semicolon, or a dash to hold it together is two sentences.

- **No em dashes or dashes as sentence breaks.** Use commas or rewrite.
- **No colons in prose.** A colon is allowed only on the line that introduces a bullet list, and in the `label: description` form of a definition bullet. A line that introduces a code block or an `@example` ends with a period.
- **No semicolons.** No exceptions. Split the sentence or use a comma.
- **Parentheses only when there's no better option.** Recast with commas or drop the aside. Call syntax such as `connection()` isn't a prose parenthesis, and a compact qualifier on a definition bullet's label is fine.

| Instead of | Write |
| ---------- | ----- |
| Video generation is asynchronous: the request returns a job. | Video generation is asynchronous. The request returns a job. |
| Pass `evaluationModel("jev")`; the gateway rejects other IDs. | Pass `evaluationModel("jev")`. The gateway rejects other IDs. |
| Pass `automatic` (the default) to let Base44 choose. | Pass `automatic`, the default, to let Base44 choose. |

## Sentence openings

Never open a sentence with a lowercase backticked identifier. It reads as a typo, and it's especially common in JSDoc because the identifier being documented is top of mind. Lead with "The", "Use", "Set", "Pass", or "Returns", or recast so the identifier moves inside the sentence.

| Instead of | Write |
| ---------- | ----- |
| `connection()` hands you a `baseURL` and `token`. | Call `connection()` to get a `baseURL` and `token`. |
| `frame_images` pins the first frame to a still. | The `frame_images` field pins the first frame to a still. |

This applies to prose only. A definition bullet, a `@param` description, or a table cell takes the identifier as its label, so `` - `seconds`: Length of the video. `` is correct.

## References

- For the full JSDoc tag reference table, see [references/jsdoc-tags.md](references/jsdoc-tags.md)
- For detailed example-writing patterns, see [references/example-patterns.md](references/example-patterns.md)
- For pipeline configuration and generation workflow, see [references/pipeline-config.md](references/pipeline-config.md)

## Checklist before submitting a PR

1. **JSDoc completeness:** Every public method has description, `@param`, `@returns`, and `@example`.
2. **`@internal` on implementation:** Factory functions, config interfaces, and helpers are marked `@internal`.
3. **Examples work:** Code examples are syntactically valid TypeScript and use the `base44.` call path.
4. **Pipeline config:** New public types are in `types-to-expose.json`. Helper types that belong on another page are in `appended-articles.json`.
5. **Punctuation:** No em dashes, no semicolons, no colons in prose, and no parentheses that commas could carry.
6. **Sentence openings:** No sentence opens with a lowercase backticked identifier.
7. **Generate and review:** Run `npm run create-docs -w @base44/sdk` and check the output renders correctly.
