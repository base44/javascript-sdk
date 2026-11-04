# JSDoc Tag Reference

| Tag | When to use | Notes |
|---|---|---|
| `@param name - Description.` | Every function/method parameter | Include default value in prose: "Defaults to `50`." |
| `@returns` | Every function/method | Start with "Promise resolving to..." for async methods |
| `@example` | Every public method (at least one) | Each `@example` block becomes a tab in `<CodeGroup>` |
| `@typeParam T` | Generic type parameters | Explain what the type represents and its default |
| `@throws` | Methods that throw or reject on known conditions | One tag per error. See [Documenting errors](#documenting-errors) |
| `@internal` | Implementation details hidden from docs | Use on factory functions, config interfaces, helpers |
| `@default value` | Properties with default values | The plugin renders this in the output |
| `{@link Type \| display}` | Cross-reference another type or module | Use for "see also" references |
| `{@linkcode method \| display()}` | Link to a method with code formatting | Use when saying "use X() first" |

## Interface properties

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

## Documenting errors

List the errors a method can throw or reject with in `@throws` tags, not in the method description. The pipeline renders them in a **Throws** section after **Returns**.

How the pipeline renders `@throws`:

- It drops the `{Type}` part, so `{Base44Error}` never reaches the page. Name the error type in prose instead.
- Several tags render as a bullet list. A single tag renders as a plain paragraph.

For a `Base44Error`, write one tag per `code` value in the `label: description` form, and add a sentence to `@returns` that names the error type and links to error handling:

```typescript
/**
 * @returns Promise resolving to the new browser session. Rejects with a [`Base44Error`](/developers/references/sdk/getting-started/work-with-sdk#error-handling) whose `code` is one of the values under [Throws](#throws).
 * @throws `insufficient_credits`: The workspace is out of credits.
 * @throws `rate_limited`: You created more than 100 sessions in the last minute.
 * @throws `browser_capacity_exceeded`: Browser capacity is temporarily unavailable.
 */
```

Link "Throws" to the method's own Throws heading. Mintlify numbers repeated headings by their order on the page, so the first method's section is `#throws`, the second's is `#throws-2`, then `#throws-3`, and so on. Count only methods that have a Throws section. Recheck these anchors whenever you add, remove, or reorder a method's `@throws` tags, because a stale anchor still resolves, just to the wrong method.

The description after the colon is a full sentence that starts with a capital letter. Leave HTTP status codes out, so write `` `rate_limited`: ... `` and not "If the request is rate limited (429)."
