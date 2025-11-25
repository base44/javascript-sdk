[**@base44/sdk**](../README.md)

***

# Interface: AgentsModule

Agents module for managing AI agent conversations.

This module provides methods to create and manage conversations with AI agents,
send messages, and subscribe to real-time updates. Conversations can be used
for chat interfaces, support systems, or any interactive AI app.

The agents module enables you to:

- **Create conversations** with agents defined in the app.
- **Send messages** from users to agents and receive AI-generated responses.
- **Retrieve conversations** individually or as filtered lists with sorting and pagination.
- **Subscribe to real-time updates** using WebSocket connections to receive instant notifications when new messages arrive.
- **Attach metadata** to conversations for tracking context, categories, priorities, or linking to external systems.
- **Generate WhatsApp connection URLs** for users to interact with agents through WhatsApp.

The agents module operates with a two-level hierarchy:

1. **Conversations** ([AgentConversation](AgentConversation.md)): Top-level containers that represent a dialogue with a specific agent. Each conversation has a unique ID, is associated with an agent by name, and belongs to the user who created it. Conversations can include optional metadata for tracking app-specific context like ticket IDs, categories, or custom fields.

2. **Messages** ([AgentMessage](AgentMessage.md)): Individual exchanges within a conversation. Each message has a role, content, and optional metadata like token usage, tool calls, file attachments, and reasoning information. Messages are stored as an array within their parent conversation.

This module is available to use with a client in both user and service role authentication modes:

- **User authentication** (`base44.agents`): Access only conversations created by the authenticated user.
- **Service role authentication** (`client.asServiceRole.agents`): Access all conversations across all users.

## Examples

```typescript
// Create a new conversation
const conversation = await base44.agents.createConversation({
  agent_name: 'support-agent',
  metadata: {
    ticket_id: 'SUPP-1234',
    category: 'billing',
    priority: 'high'
  }
});
```

```typescript
// Send a message
await base44.agents.addMessage(conversation, {
  role: 'user',
  content: 'Hello, I need help!'
});
```

```typescript
// Subscribe to real-time updates
const unsubscribe = base44.agents.subscribeToConversation(
  conversation.id,
  (updatedConversation) => {
    console.log('New messages:', updatedConversation.messages);
  }
);

// Clean up subscription later
unsubscribe();
```

## Methods

### getConversations()

> **getConversations**(): `Promise`\<[`AgentConversation`](AgentConversation.md)[]\>

Gets all conversations.

Retrieves all conversations. Use [`listConversations()`](#listconversations) to filter which conversations are returned, apply sorting, or paginate results. Use [`getConversation()`](#getconversation) to retrieve a specific conversation by ID.

#### Returns

`Promise`\<[`AgentConversation`](AgentConversation.md)[]\>

Promise resolving to an array of conversations.

#### Example

```typescript
const conversations = await base44.agents.getConversations();
console.log(`Total conversations: ${conversations.length}`);
```

#### See

 - [`listConversations()`](#listconversations) for filtering, sorting, and pagination
 - [`getConversation()`](#getconversation) for retrieving a specific conversation by ID

***

### getConversation()

> **getConversation**(`conversationId`): `Promise`\<[`AgentConversation`](AgentConversation.md) \| `undefined`\>

Gets a specific conversation by ID.

Retrieves a single conversation using its unique identifier. To retrieve
all conversations, use [`getConversations()`](#getconversations) To filter, sort, or paginate conversations, use [`listConversations()`](#listconversations).

#### Parameters

##### conversationId

`string`

The unique identifier of the conversation.

#### Returns

`Promise`\<[`AgentConversation`](AgentConversation.md) \| `undefined`\>

Promise resolving to the conversation, or undefined if not found.

#### Example

```typescript
const conversation = await base44.agents.getConversation('conv-123');
if (conversation) {
  console.log(`Conversation has ${conversation.messages.length} messages`);
}
```

#### See

 - [`getConversations()`](#getconversations) for retrieving all conversations
 - [`listConversations()`](#listconversations) for filtering and sorting conversations

***

### listConversations()

> **listConversations**(`filterParams`): `Promise`\<[`AgentConversation`](AgentConversation.md)[]\>

Lists conversations with filtering, sorting, and pagination.

Provides querying capabilities including filtering by fields, sorting, pagination, and field selection. For cases where you need all conversations without filtering, use [`getConversations()`](#getconversations). To retrieve a specific conversation by ID, use [`getConversation()`](#getconversation).

#### Parameters

##### filterParams

[`ModelFilterParams`](ModelFilterParams.md)

Filter parameters for querying conversations.

#### Returns

`Promise`\<[`AgentConversation`](AgentConversation.md)[]\>

Promise resolving to an array of filtered conversations.

#### Examples

```typescript
const recentConversations = await base44.agents.listConversations({
  limit: 10,
  sort: '-created_date'
});
```

```typescript
// Filter by agent and metadata
const supportConversations = await base44.agents.listConversations({
  q: {
    agent_name: 'support-agent',
    'metadata.priority': 'high'
  },
  sort: '-created_date',
  limit: 20
});
```

#### See

 - [`getConversations()`](#getconversations) for retrieving all conversations without filtering
 - [`getConversation()`](#getconversation) for retrieving a specific conversation by ID

***

### createConversation()

> **createConversation**(`conversation`): `Promise`\<[`AgentConversation`](AgentConversation.md)\>

Creates a new conversation with an agent.

#### Parameters

##### conversation

Conversation details including agent name and optional metadata.

###### agent_name

`string`

###### metadata?

`Record`\<..., ...\>

#### Returns

`Promise`\<[`AgentConversation`](AgentConversation.md)\>

Promise resolving to the created conversation.

#### Example

```typescript
const conversation = await base44.agents.createConversation({
  agent_name: 'support-agent',
  metadata: {
    order_id: 'ORD-789',
    product_id: 'PROD-456',
    category: 'technical-support'
  }
});
console.log(`Created conversation: ${conversation.id}`);
```

***

### addMessage()

> **addMessage**(`conversation`, `message`): `Promise`\<[`AgentMessage`](AgentMessage.md)\>

Adds a message to a conversation.

Sends a message to the agent and updates the conversation. This method
also updates the real-time socket to notify any subscribers.

#### Parameters

##### conversation

[`AgentConversation`](AgentConversation.md)

The conversation to add the message to.

##### message

`Partial`\<[`AgentMessage`](AgentMessage.md)\>

The message to add.

#### Returns

`Promise`\<[`AgentMessage`](AgentMessage.md)\>

Promise resolving to the created message.

#### Example

```typescript
// Send a message to the agent
const message = await base44.agents.addMessage(conversation, {
  role: 'user',
  content: 'Hello, I need help with my order #12345'
});
console.log(`Message sent with ID: ${message.id}`);
```

***

### subscribeToConversation()

> **subscribeToConversation**(`conversationId`, `onUpdate?`): () => `void`

Subscribes to real-time updates for a conversation.

Establishes a WebSocket connection to receive instant updates when new
messages are added to the conversation. Returns an unsubscribe function
to clean up the connection.

#### Parameters

##### conversationId

`string`

The conversation ID to subscribe to.

##### onUpdate?

(`conversation`) => `void`

Callback function called when the conversation is updated.

#### Returns

Unsubscribe function to stop receiving updates.

> (): `void`

##### Returns

`void`

#### Example

```typescript
// Subscribe to real-time updates
const unsubscribe = base44.agents.subscribeToConversation(
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

Gets WhatsApp connection URL for an agent.

Generates a URL that users can use to connect with the agent through WhatsApp.
The URL includes authentication if a token is available.

#### Parameters

##### agentName

`string`

The name of the agent.

#### Returns

`string`

WhatsApp connection URL.

#### Example

```typescript
const whatsappUrl = base44.agents.getWhatsAppConnectURL('support-agent');
console.log(`Connect through WhatsApp: ${whatsappUrl}`);
// User can open this URL to start a WhatsApp conversation
```
