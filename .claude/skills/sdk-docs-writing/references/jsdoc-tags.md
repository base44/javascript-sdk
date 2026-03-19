# JSDoc Tag Reference

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
