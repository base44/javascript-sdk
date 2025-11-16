[**@base44/sdk**](../README.md)

***

# Interface: AgentsModule

Agents module for managing AI agent conversations.

This module provides methods to create and manage conversations with AI agents,
send messages, and subscribe to real-time updates. Conversations can be used
for chat interfaces, support systems, or any interactive AI application.

**Real-time Updates:**
The agents module supports real-time updates through WebSocket subscriptions,
allowing you to receive instant notifications when new messages arrive.

**Available with both auth modes:**
- User auth: `client.agents.method(...)`
- Service role: `client.asServiceRole.agents.method(...)`

## Example

```typescript
// Create a new conversation
const conversation = await client.agents.createConversation({
  agent_name: 'support-agent',
  metadata: { user_id: 'user-123' }
});

// Subscribe to real-time updates
const unsubscribe = client.agents.subscribeToConversation(
  conversation.id,
  (updatedConversation) => {
    console.log('New messages:', updatedConversation.messages);
  }
);

// Send a message
await client.agents.addMessage(conversation, {
  role: 'user',
  content: 'Hello, I need help!'
});

// Clean up subscription
unsubscribe();
```

## Methods

### getConversations()

> **getConversations**(): `Promise`\<[`AgentConversation`](../type-aliases/AgentConversation.md)[]\>

Get all conversations for the current user.

Retrieves all agent conversations without filtering.

#### Returns

`Promise`\<[`AgentConversation`](../type-aliases/AgentConversation.md)[]\>

Promise resolving to an array of conversations

#### Example

```typescript
const conversations = await client.agents.getConversations();
console.log(`Total conversations: ${conversations.length}`);
```

***

### getConversation()

> **getConversation**(`conversationId`): `Promise`\<[`AgentConversation`](../type-aliases/AgentConversation.md) \| `undefined`\>

Get a specific conversation by ID.

#### Parameters

##### conversationId

`string`

The unique identifier of the conversation

#### Returns

`Promise`\<[`AgentConversation`](../type-aliases/AgentConversation.md) \| `undefined`\>

Promise resolving to the conversation, or undefined if not found

#### Example

```typescript
const conversation = await client.agents.getConversation('conv-123');
if (conversation) {
  console.log(`Conversation has ${conversation.messages.length} messages`);
}
```

***

### listConversations()

> **listConversations**(`filterParams`): `Promise`\<[`AgentConversation`](../type-aliases/AgentConversation.md)[]\>

List conversations with filtering and pagination.

#### Parameters

##### filterParams

[`ModelFilterParams`](../type-aliases/ModelFilterParams.md)

Filter parameters for querying conversations

#### Returns

`Promise`\<[`AgentConversation`](../type-aliases/AgentConversation.md)[]\>

Promise resolving to an array of filtered conversations

#### Example

```typescript
const recentConversations = await client.agents.listConversations({
  limit: 10,
  sort: '-created_date'
});
```

***

### createConversation()

> **createConversation**(`conversation`): `Promise`\<[`AgentConversation`](../type-aliases/AgentConversation.md)\>

Create a new conversation with an agent.

#### Parameters

##### conversation

Conversation details including agent name and optional metadata

###### agent_name

`string`

###### metadata?

`Record`\<..., ...\>

#### Returns

`Promise`\<[`AgentConversation`](../type-aliases/AgentConversation.md)\>

Promise resolving to the created conversation

#### Example

```typescript
const conversation = await client.agents.createConversation({
  agent_name: 'support-agent',
  metadata: {
    user_id: 'user-123',
    category: 'technical-support'
  }
});
console.log(`Created conversation: ${conversation.id}`);
```

***

### addMessage()

> **addMessage**(`conversation`, `message`): `Promise`\<[`AgentMessage`](../type-aliases/AgentMessage.md)\>

Add a message to a conversation.

Sends a message to the agent and updates the conversation. This method
also updates the real-time socket to notify any subscribers.

#### Parameters

##### conversation

[`AgentConversation`](../type-aliases/AgentConversation.md)

The conversation to add the message to

##### message

`Partial`\<[`AgentMessage`](../type-aliases/AgentMessage.md)\>

The message to add

#### Returns

`Promise`\<[`AgentMessage`](../type-aliases/AgentMessage.md)\>

Promise resolving to the created message

#### Example

```typescript
const message = await client.agents.addMessage(conversation, {
  role: 'user',
  content: 'Hello, I need help with my order #12345'
});
console.log(`Message sent with ID: ${message.id}`);
```

***

### subscribeToConversation()

> **subscribeToConversation**(`conversationId`, `onUpdate?`): () => `void`

Subscribe to real-time updates for a conversation.

Establishes a WebSocket connection to receive instant updates when new
messages are added to the conversation. Returns an unsubscribe function
to clean up the connection.

#### Parameters

##### conversationId

`string`

The conversation ID to subscribe to

##### onUpdate?

(`conversation`) => `void`

Callback function called when the conversation is updated

#### Returns

Unsubscribe function to stop receiving updates

> (): `void`

##### Returns

`void`

#### Example

```typescript
const unsubscribe = client.agents.subscribeToConversation(
  'conv-123',
  (updatedConversation) => {
    const latestMessage = updatedConversation.messages[updatedConversation.messages.length - 1];
    console.log('New message:', latestMessage.content);
  }
);

// Later, clean up the subscription
unsubscribe();
```

***

### getWhatsAppConnectURL()

> **getWhatsAppConnectURL**(`agentName`): `string`

Get WhatsApp connection URL for an agent.

Generates a URL that users can use to connect with the agent through WhatsApp.
The URL includes authentication if a token is available.

#### Parameters

##### agentName

`string`

The name of the agent

#### Returns

`string`

WhatsApp connection URL

#### Example

```typescript
const whatsappUrl = client.agents.getWhatsAppConnectURL('support-agent');
console.log(`Connect through WhatsApp: ${whatsappUrl}`);
// User can open this URL to start a WhatsApp conversation
```
