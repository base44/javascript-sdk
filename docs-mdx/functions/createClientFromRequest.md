---
title: "Function: createClientFromRequest"
description: "Documentation for Function: createClientFromRequest"
---

[@base44/sdk](../README.md) / createClientFromRequest

# Function: createClientFromRequest

▸ **createClientFromRequest**(`request`): `Object`

#### Parameters

| Name | Type |
| :------ | :------ |
| `request` | `Request` |

#### Returns

`Object`

| Name | Type |
| :------ | :------ |
| `entities` | {} |
| `integrations` | {} |
| `auth` | [`AuthMethods`](../interfaces/AuthMethods.md) |
| `functions` | \{ `invoke`: (`functionName`: `string`, `data`: `Record`\<..., ...\>) => `Promise`\<...\>  } |
| `functions.invoke` | [object Object] |
| `agents` | \{ `getConversations`: () => ... ; `getConversation`: (`conversationId`: ...) => ... ; `listConversations`: (`filterParams`: ...) => ... ; `createConversation`: (`conversation`: ...) => ... ; `addMessage`: (`conversation`: ..., `message`: ...) => ... ; `subscribeToConversation`: (`conversationId`: ..., `onUpdate?`: ...) => ... ; `getWhatsAppConnectURL`: (`agentName`: ...) => ...  } |
| `agents.getConversations` | () => ... |
| `agents.getConversation` | (`conversationId`: ...) => ... |
| `agents.listConversations` | (`filterParams`: ...) => ... |
| `agents.createConversation` | (`conversation`: ...) => ... |
| `agents.addMessage` | (`conversation`: ..., `message`: ...) => ... |
| `agents.subscribeToConversation` | (`conversationId`: ..., `onUpdate?`: ...) => ... |
| `agents.getWhatsAppConnectURL` | (`agentName`: ...) => ... |
| `appLogs` | \{ `logUserInApp`: (`pageName`: `string`) => `Promise`\<...\> ; `fetchLogs`: (`params`: `Record`\<..., ...\>) => `Promise`\<...\> ; `getStats`: (`params`: `Record`\<..., ...\>) => `Promise`\<...\>  } |
| `appLogs.logUserInApp` | [object Object] |
| `appLogs.fetchLogs` | [object Object] |
| `appLogs.getStats` | [object Object] |
| `cleanup` | () => `void` |
| `setToken` | (`newToken`: `string`) => `void` |
| `getConfig` | () => \{ `serverUrl`: `string` ; `appId`: `string` ; `requiresAuth`: `boolean`  } |
| `asServiceRole` | \{ `entities`: {} ; `integrations`: {} ; `sso`: \{ `getAccessToken`: (`userid`: ...) => ...  } ; `connectors`: \{ `getAccessToken`: (`integrationType`: ...) => ...  } ; `functions`: \{ `invoke`: (`functionName`: ..., `data`: ...) => ...  } ; `agents`: \{ `getConversations`: ... ; `getConversation`: ... ; `listConversations`: ... ; `createConversation`: ... ; `addMessage`: ... ; `subscribeToConversation`: ... ; `getWhatsAppConnectURL`: ...  } ; `appLogs`: \{ `logUserInApp`: (`pageName`: ...) => ... ; `fetchLogs`: (`params`: ...) => ... ; `getStats`: (`params`: ...) => ...  } ; `cleanup`: () => ...  } |
| `asServiceRole.entities` | {} |
| `asServiceRole.integrations` | {} |
| `asServiceRole.sso` | \{ `getAccessToken`: (`userid`: ...) => ...  } |
| `asServiceRole.sso.getAccessToken` | [object Object] |
| `asServiceRole.connectors` | \{ `getAccessToken`: (`integrationType`: ...) => ...  } |
| `asServiceRole.connectors.getAccessToken` | [object Object] |
| `asServiceRole.functions` | \{ `invoke`: (`functionName`: ..., `data`: ...) => ...  } |
| `asServiceRole.functions.invoke` | [object Object] |
| `asServiceRole.agents` | \{ `getConversations`: ... ; `getConversation`: ... ; `listConversations`: ... ; `createConversation`: ... ; `addMessage`: ... ; `subscribeToConversation`: ... ; `getWhatsAppConnectURL`: ...  } |
| `asServiceRole.agents.getConversations` | ... |
| `asServiceRole.agents.getConversation` | ... |
| `asServiceRole.agents.listConversations` | ... |
| `asServiceRole.agents.createConversation` | ... |
| `asServiceRole.agents.addMessage` | ... |
| `asServiceRole.agents.subscribeToConversation` | ... |
| `asServiceRole.agents.getWhatsAppConnectURL` | ... |
| `asServiceRole.appLogs` | \{ `logUserInApp`: (`pageName`: ...) => ... ; `fetchLogs`: (`params`: ...) => ... ; `getStats`: (`params`: ...) => ...  } |
| `asServiceRole.appLogs.logUserInApp` | [object Object] |
| `asServiceRole.appLogs.fetchLogs` | [object Object] |
| `asServiceRole.appLogs.getStats` | [object Object] |
| `asServiceRole.cleanup` | () => ... |

#### Defined in

[client.ts:215](https://github.com/base44-dev/javascript-sdk/blob/main/src/client.ts#L215)
