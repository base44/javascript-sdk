[**@base44/sdk**](../README.md)

***

# Type Alias: AgentMessageToolCall

> **AgentMessageToolCall** = `object`

A tool call made by the agent.

Represents a function or tool that the agent invoked during message generation.

## Properties

### id

> **id**: `string`

Tool call ID.

***

### name

> **name**: `string`

Name of the tool called.

***

### arguments\_string

> **arguments\_string**: `string`

Arguments passed to the tool as JSON string.

***

### status

> **status**: `"running"` \| `"success"` \| `"error"` \| `"stopped"`

Status of the tool call.

***

### results?

> `optional` **results**: `string` \| `null`

Results from the tool call.
