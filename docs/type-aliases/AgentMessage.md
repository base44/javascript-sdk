[**@base44/sdk**](../README.md)

***

# Type Alias: AgentMessage

> **AgentMessage** = `object`

A message in an agent conversation.

## Properties

### id

> **id**: `string`

Unique identifier for the message

***

### role

> **role**: `"user"` \| `"assistant"` \| `"system"`

Role of the message sender

***

### reasoning?

> `optional` **reasoning**: `object`

Optional reasoning information for the message

#### start\_date

> **start\_date**: `string`

When reasoning started

#### end\_date?

> `optional` **end\_date**: `string`

When reasoning ended

#### content

> **content**: `string`

Reasoning content

***

### content?

> `optional` **content**: `string` \| `Record`\<..., ...\> \| `null`

Message content (can be text or structured data)

***

### file\_urls?

> `optional` **file\_urls**: ...[] \| `null`

URLs to files attached to the message

***

### tool\_calls?

> `optional` **tool\_calls**: ...[] \| `null`

Tool calls made by the agent

***

### usage?

> `optional` **usage**: \{ `prompt_tokens?`: ...; `completion_tokens?`: ...; \} \| `null`

Token usage statistics

***

### hidden?

> `optional` **hidden**: `boolean`

Whether the message is hidden from the user

***

### custom\_context?

> `optional` **custom\_context**: ...[] \| `null`

Custom context provided with the message

***

### model?

> `optional` **model**: `string` \| `null`

Model used to generate the message

***

### checkpoint\_id?

> `optional` **checkpoint\_id**: `string` \| `null`

Checkpoint ID for the message

***

### metadata?

> `optional` **metadata**: `object`

Metadata about when and by whom the message was created

#### created\_date

> **created\_date**: `string`

#### created\_by\_email

> **created\_by\_email**: `string`

#### created\_by\_full\_name

> **created\_by\_full\_name**: ... \| ...

***

### additional\_message\_params?

> `optional` **additional\_message\_params**: `Record`\<`string`, `any`\>

Additional custom parameters for the message
