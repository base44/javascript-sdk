# Base44 JavaScript SDKs

| Package | Directory | What it's for |
| :- | :- | :- |
| [`@base44/sdk`](https://www.npmjs.com/package/@base44/sdk) | [`packages/sdk`](packages/sdk) | Apps built on Base44: entities, functions, auth and integrations |
| [`@base44/platform`](https://www.npmjs.com/package/@base44/platform) | [`packages/platform`](packages/platform) | White-label platforms: watch the builder of your apps from your own frontend |

Each package is versioned and released on its own (tags `v…` for the SDK, `platform-v…` for the Platform SDK) through the **Manual Package Publish** workflow.

## Development

```bash
npm ci
npm run build
npm run lint
npm test
```

Run a script in one package with `-w`, e.g. `npm run test:unit -w @base44/sdk`.
