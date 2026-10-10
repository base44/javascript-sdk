# Tiny Sunny's chat on `@base44/platform/react`, option A

The headless chat from [Tiny Sunny](https://github.com/base44/base44-platform-starter/tree/amitb/tiny-sunny-lean/examples/white-label-minimal/lean),
rebuilt on the hook alone. It is type-checked with the package's tests,
not run. Read the files in this order:

1. [`Chat.tsx`](Chat.tsx): the chat itself. It calls `useBase44Chat`, draws every item, and picks the part for each question kind.
2. [`chatParts.tsx`](chatParts.tsx): Tiny's look. Each part takes the props it is called with. Tiny's shadcn
   `Button` and lucide icons are replaced by a small local button and text glyphs, so the example has
   no UI dependency.
3. [`server.ts`](server.ts): the four calls the partner's backend provides, as Next.js server
   functions. Each wraps one Base44 REST call with the partner's credentials.

No Base44 detail appears in `Chat.tsx` or `chatParts.tsx`: no socket, no message ordering, no tool
call ids, no answer formats. That all stays in the package.
