[**@base44/sdk**](../README.md)

***

# Type Alias: AgentConversation

> **AgentConversation** = `object`

An agent conversation containing messages exchanged with an AI agent.

## Properties

### id

> **id**: `string`

Unique identifier for the conversation.

***

### app\_id

> **app\_id**: `string`

Application ID.

***

### agent\_name

> **agent\_name**: `string`

Name of the agent in this conversation.

***

### created\_by\_id

> **created\_by\_id**: `string`

ID of the user who created the conversation.

***

### messages

> **messages**: [`AgentMessage`](AgentMessage.md)[]

Array of messages in the conversation.

***

### metadata?

> `optional` **metadata**: `Record`\<`string`, `any`\>

Optional metadata associated with the conversation.
