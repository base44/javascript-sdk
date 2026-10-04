# Base44 JavaScript SDKs

| Package | Directory | What it's for |
| :- | :- | :- |
| [`@base44/sdk`](https://www.npmjs.com/package/@base44/sdk) | [`packages/sdk`](packages/sdk) | Apps built on Base44: entities, functions, auth and integrations |

Each package is versioned and released on its own through the **Manual Package Publish** workflow.

## Development

```bash
npm ci
npm run build
npm run lint
npm test
```

Run a script in one package with `-w`, e.g. `npm run test:unit -w @base44/sdk`.
