[**@base44/sdk**](../README.md)

***

# Interface: AgentMessage

A message in an agent conversation.

## Properties

### id

> **id**: `string`

Unique identifier for the message.

***

### role

> **role**: `"user"` \| `"assistant"` \| `"system"`

Role of the message sender.

***

### reasoning?

> `optional` **reasoning**: [`AgentMessageReasoning`](AgentMessageReasoning.md)

Optional reasoning information for the message.

***

### content?

> `optional` **content**: `string` \| `Record`\<`string`, `any`\> \| `null`

Message content.

***

### file\_urls?

> `optional` **file\_urls**: `string`[] \| `null`

URLs to files attached to the message.

***

### tool\_calls?

> `optional` **tool\_calls**: [`AgentMessageToolCall`](AgentMessageToolCall.md)[] \| `null`

Tool calls made by the agent.

***

### usage?

> `optional` **usage**: [`AgentMessageUsage`](AgentMessageUsage.md) \| `null`

Token usage statistics.

***

### hidden?

> `optional` **hidden**: `boolean`

Whether the message is hidden from the user.

***

### custom\_context?

> `optional` **custom\_context**: [`AgentMessageCustomContext`](AgentMessageCustomContext.md)[] \| `null`

Custom context provided with the message.

***

### model?

> `optional` **model**: `string` \| `null`

Model used to generate the message.

***

### checkpoint\_id?

> `optional` **checkpoint\_id**: `string` \| `null`

Checkpoint ID for the message.

***

### metadata?

> `optional` **metadata**: [`AgentMessageMetadata`](AgentMessageMetadata.md)

Metadata about when and by whom the message was created.

***

### additional\_message\_params?

> `optional` **additional\_message\_params**: `Record`\<`string`, `any`\>

Additional custom parameters for the message.
