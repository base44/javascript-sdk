# Type alias: AgentMessage

Ƭ **AgentMessage**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `id` | `string` |
| `role` | ``"user"`` \| ``"assistant"`` \| ``"system"`` |
| `reasoning?` | \{ `start_date`: `string` ; `end_date?`: `string` ; `content`: `string`  } |
| `reasoning.start_date` | `string` |
| `reasoning.end_date?` | `string` |
| `reasoning.content` | `string` |
| `content?` | `string` \| `Record`\<..., ...\> \| ``null`` |
| `file_urls?` | ...[] \| ``null`` |
| `tool_calls?` | ...[] \| ``null`` |
| `usage?` | \{ `prompt_tokens?`: ... ; `completion_tokens?`: ...  } \| ``null`` |
| `hidden?` | `boolean` |
| `custom_context?` | ...[] \| ``null`` |
| `model?` | `string` \| ``null`` |
| `checkpoint_id?` | `string` \| ``null`` |
| `metadata?` | \{ `created_date`: `string` ; `created_by_email`: `string` ; `created_by_full_name`: ... \| ...  } |
| `metadata.created_date` | `string` |
| `metadata.created_by_email` | `string` |
| `metadata.created_by_full_name` | ... \| ... |
| `additional_message_params?` | `Record`\<`string`, `any`\> |

#### Defined in

[modules/agents.types.ts:10](https://github.com/base44-dev/javascript-sdk/blob/main/src/modules/agents.types.ts#L10)
